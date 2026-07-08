import { callFranAgentTool, listMcpTools } from '../utils/fran-agent-tools'
import {
  buildMcpErrorSummary,
  buildMcpToolRequestLog,
  completeMcpRequestLog,
  extractMcpWorkspaceId,
  mcpRequestStatusForError,
  recordMcpRequestLog,
  summarizeMcpToolResult
} from '../utils/mcp-request-logs'

type JsonRpcRequest = {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: Record<string, unknown>
}

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')

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
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: 'fran-crm',
          version: '0.1.0'
        }
      })
    }

    if (body.method === 'tools/list') {
      return jsonRpcResult(body.id ?? null, {
        tools: listMcpTools()
      })
    }

    if (body.method === 'tools/call') {
      const params = body.params || {}
      const name = typeof params.name === 'string' ? params.name : ''
      const args = params.arguments || {}
      const supabase = useSupabaseAdmin()
      const parsedWorkspaceId = extractMcpWorkspaceId(args)
      let actorId: string | undefined
      const requestLogId = await recordMcpRequestLog(supabase, {
        method: body.method,
        toolName: name || undefined,
        workspaceId: parsedWorkspaceId,
        provider: 'mcp',
        clientName: getHeader(event, 'user-agent') || undefined,
        request: buildMcpToolRequestLog(body.id, body.method, name, args)
      })

      try {
        if (!supabase && !useCrmPostgres()) {
          throw createError({ statusCode: 503, statusMessage: 'Supabase is not configured for MCP tool calls.' })
        }

        const { supabase: authClient, user } = await requireSupabaseUser(event, supabase || undefined)
        actorId = user.id
        const result = await callFranAgentTool(authClient, user, name, args)
        await tryCompleteMcpRequestLog(supabase, requestLogId, {
          status: 'succeeded',
          workspaceId: parsedWorkspaceId,
          actorId,
          responseSummary: summarizeMcpToolResult(name, result)
        })

        return jsonRpcResult(body.id ?? null, {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ],
          structuredContent: result
        })
      } catch (error) {
        await tryCompleteMcpRequestLog(supabase, requestLogId, {
          status: mcpRequestStatusForError(error),
          workspaceId: parsedWorkspaceId,
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
    return jsonRpcError(body.id ?? null, errorToCode(error), errorToMessage(error))
  }
})

function jsonRpcResult(id: JsonRpcRequest['id'], result: unknown) {
  return {
    jsonrpc: '2.0',
    id,
    result
  }
}

function jsonRpcError(id: JsonRpcRequest['id'], code: number, message: string) {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message
    }
  }
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
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'object' && error && 'statusMessage' in error) {
    return String((error as { statusMessage?: unknown }).statusMessage)
  }

  return 'MCP tool call failed.'
}
