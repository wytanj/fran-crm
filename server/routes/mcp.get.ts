import { listMcpTools } from '../utils/fran-agent-tools'
import { anyMcpOauthClient, mcpUnauthorizedHeader } from '../utils/mcpOauth'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')

  if ((await anyMcpOauthClient()) && !getHeader(event, 'authorization')) {
    setResponseStatus(event, 401)
    setHeader(event, 'www-authenticate', mcpUnauthorizedHeader(event))
    return { error: 'unauthorized', message: 'Sign in with Fran CRM OAuth to use this MCP connector.' }
  }

  return {
    name: 'Fran CRM MCP',
    transport: 'streamable_http',
    protocolVersion: '2025-03-26',
    tools: listMcpTools().map((tool) => tool.name)
  }
})
