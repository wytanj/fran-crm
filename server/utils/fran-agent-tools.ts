import type { SupabaseClient, User } from '@supabase/supabase-js'
import { franTopCustomersToolInputSchema } from './contracts'
import {
  requireWorkspaceCapability,
  resolveWorkspaceCapabilities,
  type AgentCapability
} from './agent-capabilities'
import {
  loadTopCustomerPurchasesWithSql,
  loadTopCustomerPurchasesWithSupabase,
  redactTopCustomerContact
} from './fran-customer-purchase-analytics'

export type FranAgentToolName = 'fran.analytics.topCustomers'

export interface FranAgentToolDefinition {
  name: FranAgentToolName
  title: string
  description: string
  requiredCapabilities: AgentCapability[]
  inputSchema: Record<string, unknown>
}

const topCustomersInputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['workspaceId'],
  properties: {
    workspaceId: {
      type: 'string',
      format: 'uuid',
      description: 'CRM workspace id. The server still verifies the caller is allowed in this workspace.'
    },
    from: {
      type: 'string',
      pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      description: 'Inclusive purchase-window start date. Defaults to four days before to.'
    },
    to: {
      type: 'string',
      pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      description: 'Inclusive purchase-window end date. Defaults to the current server date.'
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 50,
      default: 10
    },
    metric: {
      type: 'string',
      enum: ['purchase_amount', 'purchase_count'],
      default: 'purchase_amount'
    },
    includeContact: {
      type: 'boolean',
      default: false,
      description: 'Includes mobile/contact fields only when the caller has customer.contact.read.'
    }
  }
}

export const franAgentToolDefinitions: FranAgentToolDefinition[] = [
  {
    name: 'fran.analytics.topCustomers',
    title: 'Top customer purchase analytics',
    description: 'Returns a workspace-scoped top-customer purchase list plus chart-ready data for a date range.',
    requiredCapabilities: [
      'agent.tool.execute',
      'analytics.customer_list.read',
      'customer.purchase.read'
    ],
    inputSchema: topCustomersInputSchema
  }
]

export function listMcpTools() {
  return franAgentToolDefinitions.map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema
  }))
}

export async function callFranAgentTool(
  supabase: SupabaseClient,
  user: User,
  name: string,
  rawArguments: unknown
) {
  if (name !== 'fran.analytics.topCustomers') {
    throw createError({ statusCode: 404, statusMessage: `Unknown Fran agent tool: ${name}` })
  }

  const args = franTopCustomersToolInputSchema.parse(rawArguments || {})

  await requireWorkspaceCapability(supabase, user, args.workspaceId, 'agent.tool.execute')
  await requireWorkspaceCapability(supabase, user, args.workspaceId, 'analytics.customer_list.read')
  await requireWorkspaceCapability(supabase, user, args.workspaceId, 'customer.purchase.read')

  const canReadContact = await hasCapability(supabase, user, args.workspaceId, 'customer.contact.read')
  const sql = useCrmPostgres()
  const result = sql
    ? await loadTopCustomerPurchasesWithSql(sql, args.workspaceId, args)
    : await loadTopCustomerPurchasesWithSupabase(supabase, args.workspaceId, args)
  const output = args.includeContact && canReadContact
    ? result
    : redactTopCustomerContact(result)

  await recordAgentToolExecution(supabase, user, args.workspaceId, name, args, output)

  return output
}

async function hasCapability(
  supabase: SupabaseClient,
  user: User,
  workspaceId: string,
  capability: AgentCapability
) {
  const resolved = await resolveWorkspaceCapabilities(supabase, user, workspaceId)
  return resolved.capabilities.includes(capability)
}

async function recordAgentToolExecution(
  supabase: SupabaseClient,
  user: User,
  workspaceId: string,
  actionType: string,
  input: Record<string, unknown>,
  output: unknown
) {
  const sql = useCrmPostgres()
  const auditMetadata = {
    input,
    outputSummary: summarizeOutput(output),
    surface: 'mcp'
  }

  if (sql) {
    await sql.begin(async (tx) => {
      await tx`
        insert into public.crm_execution_logs (workspace_id, action_type, status, input, output)
        values (
          ${workspaceId}::uuid,
          ${actionType},
          'succeeded',
          ${JSON.stringify(input)}::jsonb,
          ${JSON.stringify(output)}::jsonb
        )
      `

      await tx`
        insert into public.crm_audit_events (workspace_id, actor_id, event_type, subject_type, metadata)
        values (
          ${workspaceId}::uuid,
          ${user.id}::uuid,
          'agent.tool.called',
          'agent_tool',
          ${JSON.stringify(auditMetadata)}::jsonb
        )
      `
    })

    return
  }

  const { error: executionError } = await supabase
    .from('crm_execution_logs')
    .insert({
      workspace_id: workspaceId,
      action_type: actionType,
      status: 'succeeded',
      input,
      output
    })

  if (executionError) {
    throw createError({ statusCode: 500, statusMessage: executionError.message })
  }

  const { error: auditError } = await supabase
    .from('crm_audit_events')
    .insert({
      workspace_id: workspaceId,
      actor_id: user.id,
      event_type: 'agent.tool.called',
      subject_type: 'agent_tool',
      metadata: auditMetadata
    })

  if (auditError) {
    throw createError({ statusCode: 500, statusMessage: auditError.message })
  }
}

function summarizeOutput(output: unknown) {
  if (!output || typeof output !== 'object') {
    return {}
  }

  const record = output as Record<string, unknown>
  const topCustomers = Array.isArray(record.topCustomers) ? record.topCustomers : []

  return {
    mode: record.mode,
    dateRange: record.dateRange,
    rowCount: topCustomers.length
  }
}
