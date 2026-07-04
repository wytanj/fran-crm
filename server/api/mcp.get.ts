import { listMcpTools } from '../utils/fran-agent-tools'

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')

  return {
    name: 'Fran CRM MCP',
    transport: 'streamable_http',
    protocolVersion: '2025-03-26',
    tools: listMcpTools().map((tool) => tool.name)
  }
})
