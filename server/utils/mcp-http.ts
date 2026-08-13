import type { H3Event } from 'h3'
import type { User } from '@supabase/supabase-js'
import { callFranAgentTool, listMcpTools } from './fran-agent-tools'
import {
  anyMcpOauthClient,
  isMcpOauthAccessToken,
  loadUserForMcpIdentity,
  lookupMcpAccessToken,
  mcpUnauthorizedHeader
} from './mcpOauth'
import { requireSupabaseUser } from './supabase-auth'
import { getWorkspaceMembership } from './supabase-auth'
import {
  buildMcpErrorSummary,
  buildMcpToolRequestLog,
  completeMcpRequestLog,
  extractMcpWorkspaceId,
  mcpRequestStatusForError,
  recordMcpRequestLog,
  summarizeMcpToolResult
} from './mcp-request-logs'

type JsonRpcRequest = {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: Record<string, unknown>
}

function getBearerToken(event: H3Event) {
  const header = getHeader(event, 'authorization')
  const match = header?.match(/^Bearer\s+(.+)$/i)
  return match?.[1] || null
}

async function requireMcpCaller(event: H3Event) {
  const supabase = useSupabaseAdmin()
  const token = getBearerToken(event)

  if (token && isMcpOauthAccessToken(token)) {
    const identity = await lookupMcpAccessToken(token)
    if (!identity) {
      throw createError({ statusCode: 401, statusMessage: 'Invalid or expired MCP OAuth token.' })
    }

    const user = await loadUserForMcpIdentity(identity)
    const authClient = supabase || useSupabaseAuthClient()
    if (!authClient && !useCrmPostgres()) {
      throw createError({ statusCode: 503, statusMessage: 'Supabase is not configured for MCP tool calls.' })
    }
    const membership = await getWorkspaceMembership(authClient as NonNullable<typeof authClient>, user, identity.workspaceId)
    if (!membership) {
      throw createError({ statusCode: 403, statusMessage: 'This MCP connection no longer has CRM workspace membership.' })
    }

    return {
      supabase: authClient,
      user,
      workspaceId: identity.workspaceId,
      via: 'oauth' as const
    }
  }

  const auth = await requireSupabaseUser(event, supabase || undefined)
  return {
    supabase: auth.supabase,
    user: auth.user,
    workspaceId: null as string | null,
    via: 'supabase' as const
  }
}

export async function handleMcpRequest(event: H3Event) {
  setHeader(event, 'Cache-Control', 'no-store')
  setHeader(event, 'access-control-allow-origin', '*')
  setHeader(event, 'access-control-allow-headers', 'authorization, content-type, mcp-protocol-version')

  if (getMethod(event) === 'OPTIONS') {
    setResponseStatus(event, 204)
    return null
  }

  const oauthReady = Boolean(await anyMcpOauthClient())
  const bearer = getBearerToken(event)

  if (oauthReady && !bearer) {
    setResponseStatus(event, 401)
    setHeader(event, 'www-authenticate', mcpUnauthorizedHeader(event))
    return {
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32001,
        message: 'Sign in with Fran CRM OAuth to use this MCP connector.'
      }
    }
  }

  const body = await readBody<JsonRpcRequest | JsonRpcRequest[]>(event)

  if (Array.isArray(body)) {
    return jsonRpcError(null, -32600, 'Batch MCP requests are not supported by this endpoint.')
  }

  if (!body || body.jsonrpc !== '2.0' || !body.method) {
    return jsonRpcError(body?.id ?? null, -32600, 'Invalid JSON-RPC request.')
  }

  try {
    if (body.method === 'initialize') {
      return jsonRpcResult(body.id ?? null, {
        protocolVersion: '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'fran-crm', version: '0.2.0' }
      })
    }

    if (body.method === 'tools/list') {
      return jsonRpcResult(body.id ?? null, { tools: listMcpTools() })
    }

    if (body.method === 'tools/call') {
      const params = body.params || {}
      const name = typeof params.name === 'string' ? params.name : ''
      const args = { ...((params.arguments || {}) as Record<string, unknown>) }
      const supabaseAdmin = useSupabaseAdmin()
      const parsedWorkspaceId = extractMcpWorkspaceId(args)
      let actorId: string | undefined
      const requestLogId = await recordMcpRequestLog(supabaseAdmin, {
        method: body.method,
        toolName: name || undefined,
        provider: 'mcp',
        clientName: getHeader(event, 'user-agent') || undefined,
        request: buildMcpToolRequestLog(body.id, body.method, name, args)
      })

      try {
        if (!supabaseAdmin && !useCrmPostgres()) {
          throw createError({ statusCode: 503, statusMessage: 'Supabase is not configured for MCP tool calls.' })
        }

        const caller = await requireMcpCaller(event)
        actorId = caller.user.id
        if (!args.workspaceId && caller.workspaceId) {
          args.workspaceId = caller.workspaceId
        }

        if (!caller.supabase) {
          throw createError({ statusCode: 503, statusMessage: 'Supabase is not configured for MCP tool calls.' })
        }

        const result = await callFranAgentTool(caller.supabase, caller.user as User, name, args)
        await tryCompleteMcpRequestLog(supabaseAdmin, requestLogId, {
          status: 'succeeded',
          workspaceId: (typeof args.workspaceId === 'string' ? args.workspaceId : parsedWorkspaceId) || undefined,
          actorId,
          responseSummary: summarizeMcpToolResult(name, result)
        })

        return jsonRpcResult(body.id ?? null, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          structuredContent: result
        })
      } catch (error) {
        await tryCompleteMcpRequestLog(supabaseAdmin, requestLogId, {
          status: mcpRequestStatusForError(error),
          actorId,
          error: buildMcpErrorSummary(error)
        })
        throw error
      }
    }

    if (body.method.startsWith('notifications/')) {
      return null
    }

    return jsonRpcError(body.id ?? null, -32601, `Unsupported MCP method: ${body.method}`)
  } catch (error) {
    const status = typeof error === 'object' && error && 'statusCode' in error
      ? Number((error as { statusCode?: unknown }).statusCode)
      : 500
    if (status === 401 && oauthReady) {
      setResponseStatus(event, 401)
      setHeader(event, 'www-authenticate', mcpUnauthorizedHeader(event))
    }
    return jsonRpcError(body.id ?? null, errorToCode(error), errorToMessage(error))
  }
}

function jsonRpcResult(id: JsonRpcRequest['id'], result: unknown) {
  return { jsonrpc: '2.0', id, result }
}

function jsonRpcError(id: JsonRpcRequest['id'], code: number, message: string) {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

async function tryCompleteMcpRequestLog(...args: Parameters<typeof completeMcpRequestLog>) {
  try {
    await completeMcpRequestLog(...args)
  } catch (error) {
    console.error('[mcp] Failed to complete request log', error)
  }
}

function errorToCode(error: unknown) {
  const statusCode = typeof error === 'object' && error && 'statusCode' in error
    ? Number((error as { statusCode?: unknown }).statusCode)
    : 500
  if (statusCode === 401) return -32001
  if (statusCode === 403) return -32003
  if (statusCode === 404) return -32601
  if (statusCode === 400) return -32602
  return -32000
}

function errorToMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error && 'statusMessage' in error) {
    return String((error as { statusMessage?: unknown }).statusMessage)
  }
  return 'MCP tool call failed.'
}
