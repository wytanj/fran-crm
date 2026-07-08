import { agentCapabilityProfiles, profileCapabilityMap, requireWorkspaceCapability } from '../../../../utils/agent-capabilities'
import { agentConnectorSetupPayloadSchema, type AgentConnectorSetupPayload } from '../../../../utils/contracts'

export default defineEventHandler(async (event) => {
  const body = agentConnectorSetupPayloadSchema.parse(await readBody(event))

  if (body.provider !== 'claude') {
    throw createError({ statusCode: 400, statusMessage: 'This setup route only configures the Claude connector.' })
  }

  const supabase = useSupabaseAdmin()
  const sql = useCrmPostgres()
  const remoteMcpUrl = buildRemoteMcpUrl()

  if (!supabase && !sql) {
    return buildClaudeSetupResponse('demo', body.workspaceId, {
      provider: 'claude',
      connector_name: body.connectorName,
      remote_mcp_url: remoteMcpUrl,
      default_profile: body.defaultProfile,
      status: body.status,
      config: body.config
    })
  }

  const { supabase: authClient, user } = await requireSupabaseUser(event, supabase || undefined)
  await requireWorkspaceCapability(authClient, user, body.workspaceId, 'agent.connector.manage')
  const install = await upsertClaudeInstall(body, remoteMcpUrl, user.id, authClient)

  return buildClaudeSetupResponse('supabase', body.workspaceId, install)
})

async function upsertClaudeInstall(
  body: AgentConnectorSetupPayload,
  remoteMcpUrl: string,
  userId: string,
  supabase: NonNullable<ReturnType<typeof useSupabaseAdmin>>
) {
  const sql = useCrmPostgres()
  const config = {
    ...body.config,
    oauth: {
      required: true,
      implementedInRepo: false
    }
  }

  if (sql) {
    const [install] = await sql.begin(async (tx) => {
      const rows = await tx<Array<Record<string, unknown>>>`
        insert into public.crm_agent_connector_installs (
          workspace_id,
          provider,
          connector_name,
          external_account_id,
          remote_mcp_url,
          default_profile,
          status,
          config,
          created_by
        )
        values (
          ${body.workspaceId}::uuid,
          'claude',
          ${body.connectorName},
          ${body.externalAccountId || null},
          ${remoteMcpUrl},
          ${body.defaultProfile},
          ${body.status},
          ${JSON.stringify(config)}::jsonb,
          ${userId}::uuid
        )
        on conflict (workspace_id, provider, connector_name) do update set
          external_account_id = excluded.external_account_id,
          remote_mcp_url = excluded.remote_mcp_url,
          default_profile = excluded.default_profile,
          status = excluded.status,
          config = excluded.config,
          updated_at = now()
        returning id::text, provider, connector_name, external_account_id, remote_mcp_url, default_profile, status, config, created_at::text, updated_at::text
      `

      const installId = typeof rows[0]?.id === 'string' ? rows[0].id : null

      await tx`
        insert into public.crm_audit_events (workspace_id, actor_id, event_type, subject_type, subject_id, metadata)
        values (
          ${body.workspaceId}::uuid,
          ${userId}::uuid,
          'agent.connector.configured',
          'agent_connector',
          ${installId}::uuid,
          ${JSON.stringify({ provider: 'claude', remoteMcpUrl, defaultProfile: body.defaultProfile })}::jsonb
        )
      `

      return rows
    })

    return install
  }

  const { data, error } = await supabase
    .from('crm_agent_connector_installs')
    .upsert({
      workspace_id: body.workspaceId,
      provider: 'claude',
      connector_name: body.connectorName,
      external_account_id: body.externalAccountId || null,
      remote_mcp_url: remoteMcpUrl,
      default_profile: body.defaultProfile,
      status: body.status,
      config,
      created_by: userId
    }, {
      onConflict: 'workspace_id,provider,connector_name'
    })
    .select('id, provider, connector_name, external_account_id, remote_mcp_url, default_profile, status, config, created_at, updated_at')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const { error: auditError } = await supabase
    .from('crm_audit_events')
    .insert({
      workspace_id: body.workspaceId,
      actor_id: userId,
      event_type: 'agent.connector.configured',
      subject_type: 'agent_connector',
      subject_id: data.id,
      metadata: {
        provider: 'claude',
        remoteMcpUrl,
        defaultProfile: body.defaultProfile
      }
    })

  if (auditError) {
    throw createError({ statusCode: 500, statusMessage: auditError.message })
  }

  return data
}

function buildRemoteMcpUrl() {
  const siteUrl = useRuntimeConfig().public.siteUrl || 'http://localhost:3000'
  return `${String(siteUrl).replace(/\/$/, '')}/api/mcp`
}

function buildClaudeSetupResponse(mode: 'demo' | 'supabase', workspaceId: string, install: unknown) {
  const remoteMcpUrl = buildRemoteMcpUrl()

  return {
    mode,
    workspaceId,
    provider: 'claude',
    connectorName: 'Fran CRM',
    remoteMcpUrl,
    install,
    capabilityProfiles: agentCapabilityProfiles.map((profile) => ({
      profile,
      capabilities: profileCapabilityMap[profile]
    })),
    outsideRepoSteps: [
      'Claude Team Owner adds this remote MCP URL in Claude Organization settings > Connectors.',
      'Claude staff connect the Fran CRM connector individually from Customize > Connectors.',
      'OAuth client registration and callback approval must be configured in Claude/Fran deployment settings before production use.'
    ]
  }
}
