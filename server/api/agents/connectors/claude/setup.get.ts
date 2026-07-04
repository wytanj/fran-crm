import { agentCapabilityProfiles, profileCapabilityMap, requireWorkspaceCapability } from '../../../../utils/agent-capabilities'
import { workspaceScopedQuerySchema } from '../../../../utils/contracts'

export default defineEventHandler(async (event) => {
  const { workspaceId } = workspaceScopedQuerySchema.parse(getQuery(event))

  if (!workspaceId) {
    throw createError({ statusCode: 400, statusMessage: 'workspaceId is required for Claude connector setup.' })
  }

  const supabase = useSupabaseAdmin()
  const sql = useCrmPostgres()

  if (!supabase && !sql) {
    return buildClaudeSetupResponse('demo', workspaceId)
  }

  const { supabase: authClient, user } = await requireSupabaseUser(event, supabase || undefined)
  await requireWorkspaceCapability(authClient, user, workspaceId, 'agent.connector.manage')
  const install = await loadClaudeInstall(authClient, workspaceId)

  return buildClaudeSetupResponse('supabase', workspaceId, install)
})

async function loadClaudeInstall(supabase: ReturnType<typeof useSupabaseAdmin>, workspaceId: string) {
  const sql = useCrmPostgres()

  if (sql) {
    const rows = await sql<Array<Record<string, unknown>>>`
      select id::text, provider, connector_name, external_account_id, remote_mcp_url, default_profile, status, config, created_at::text, updated_at::text
      from public.crm_agent_connector_installs
      where workspace_id = ${workspaceId}::uuid
        and provider = 'claude'
      order by updated_at desc
      limit 1
    `

    return rows[0] || null
  }

  if (!supabase) {
    return null
  }

  const { data, error } = await supabase
    .from('crm_agent_connector_installs')
    .select('id, provider, connector_name, external_account_id, remote_mcp_url, default_profile, status, config, created_at, updated_at')
    .eq('workspace_id', workspaceId)
    .eq('provider', 'claude')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return data
}

function buildClaudeSetupResponse(mode: 'demo' | 'supabase', workspaceId: string, install: unknown = null) {
  const siteUrl = useRuntimeConfig().public.siteUrl || 'http://localhost:3000'
  const remoteMcpUrl = `${String(siteUrl).replace(/\/$/, '')}/api/mcp`

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
