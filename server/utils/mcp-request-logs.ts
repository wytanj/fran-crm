import type { SupabaseClient } from '@supabase/supabase-js'

export type McpRequestLogStatus = 'received' | 'succeeded' | 'failed' | 'rejected'

type JsonValue = null | string | number | boolean | JsonValue[] | JsonRecord
type JsonRecord = {
  [key: string]: JsonValue | undefined
}

type McpRequestLogStart = {
  method: string
  toolName?: string
  workspaceId?: string
  actorId?: string
  provider?: string
  clientName?: string
  request: JsonRecord
}

type McpRequestLogCompletion = {
  status: Exclude<McpRequestLogStatus, 'received'>
  workspaceId?: string
  actorId?: string
  responseSummary?: JsonRecord
  error?: JsonRecord
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const sensitiveKeyPattern = /^(authorization|password|secret|token|accessToken|refreshToken|apiKey|serviceRoleKey)$/i

export function extractMcpWorkspaceId(value: unknown) {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const workspaceId = (value as { workspaceId?: unknown }).workspaceId
  return typeof workspaceId === 'string' && uuidPattern.test(workspaceId) ? workspaceId : undefined
}

export function buildMcpToolRequestLog(
  id: string | number | null | undefined,
  method: string,
  toolName: string,
  args: unknown
) {
  return {
    jsonrpcId: id ?? null,
    method,
    toolName,
    arguments: sanitizeForMcpLog(args || {})
  }
}

export function summarizeMcpToolResult(toolName: string, result: unknown): JsonRecord {
  if (!result || typeof result !== 'object') {
    return { toolName }
  }

  const record = result as JsonRecord
  const topCustomers = Array.isArray(record.topCustomers) ? record.topCustomers : undefined

  return {
    toolName,
    mode: sanitizeForMcpLog(record.mode),
    dateRange: sanitizeForMcpLog(record.dateRange),
    rowCount: topCustomers?.length,
    keys: Object.keys(record)
  }
}

export function mcpRequestStatusForError(error: unknown): Exclude<McpRequestLogStatus, 'received' | 'succeeded'> {
  const statusCode = getStatusCode(error)
  return statusCode >= 400 && statusCode < 500 ? 'rejected' : 'failed'
}

export function buildMcpErrorSummary(error: unknown): JsonRecord {
  if (error instanceof Error) {
    return {
      message: error.message,
      statusCode: getStatusCode(error)
    }
  }

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>

    return {
      message: typeof record.statusMessage === 'string' ? record.statusMessage : 'MCP tool call failed.',
      statusCode: getStatusCode(error)
    }
  }

  return {
    message: 'MCP tool call failed.',
    statusCode: 500
  }
}

export async function recordMcpRequestLog(supabase: SupabaseClient | null | undefined, start: McpRequestLogStart) {
  const row = {
    workspace_id: start.workspaceId || null,
    actor_id: start.actorId || null,
    provider: start.provider || 'mcp',
    client_name: start.clientName || null,
    method: start.method,
    tool_name: start.toolName || null,
    status: 'received' satisfies McpRequestLogStatus,
    request: start.request,
    response_summary: {},
    error: {}
  }
  const sql = useCrmPostgres()

  if (sql) {
    const rows = await sql<Array<{ id: string }>>`
      insert into public.crm_mcp_request_logs (
        workspace_id,
        actor_id,
        provider,
        client_name,
        method,
        tool_name,
        status,
        request,
        response_summary,
        error
      )
      values (
        ${row.workspace_id}::uuid,
        ${row.actor_id}::uuid,
        ${row.provider},
        ${row.client_name},
        ${row.method},
        ${row.tool_name},
        ${row.status},
        ${sql.json(row.request)},
        '{}'::jsonb,
        '{}'::jsonb
      )
      returning id::text
    `

    return rows[0]?.id || null
  }

  if (!supabase) {
    return null
  }

  const { data, error } = await supabase
    .from('crm_mcp_request_logs')
    .insert(row)
    .select('id')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return String(data.id)
}

export async function completeMcpRequestLog(
  supabase: SupabaseClient | null | undefined,
  id: string | null,
  completion: McpRequestLogCompletion
) {
  if (!id) {
    return
  }

  const row = {
    workspace_id: completion.workspaceId || null,
    actor_id: completion.actorId || null,
    status: completion.status,
    response_summary: completion.responseSummary || {},
    error: completion.error || {}
  }
  const sql = useCrmPostgres()

  if (sql) {
    await sql`
      update public.crm_mcp_request_logs
      set
        workspace_id = coalesce(${row.workspace_id}::uuid, workspace_id),
        actor_id = coalesce(${row.actor_id}::uuid, actor_id),
        status = ${row.status},
        response_summary = ${sql.json(row.response_summary)},
        error = ${sql.json(row.error)},
        completed_at = now()
      where id = ${id}::uuid
    `

    return
  }

  if (!supabase) {
    return
  }

  const { error } = await supabase
    .from('crm_mcp_request_logs')
    .update({
      workspace_id: row.workspace_id,
      actor_id: row.actor_id,
      status: row.status,
      response_summary: row.response_summary,
      error: row.error,
      completed_at: new Date().toISOString()
    })
    .eq('id', id)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }
}

function sanitizeForMcpLog(value: unknown, depth = 0): JsonValue {
  if (depth > 6) {
    return '[depth_limit]'
  }

  if (value === undefined || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    return null
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForMcpLog(item, depth + 1))
  }

  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (typeof value !== 'object') {
    return null
  }

  return Object.entries(value as JsonRecord).reduce<JsonRecord>((acc, [key, item]) => {
    acc[key] = sensitiveKeyPattern.test(key) ? '[redacted]' : sanitizeForMcpLog(item, depth + 1)
    return acc
  }, {})
}

function getStatusCode(error: unknown) {
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const statusCode = Number((error as { statusCode?: unknown }).statusCode)
    return Number.isFinite(statusCode) ? statusCode : 500
  }

  return 500
}
