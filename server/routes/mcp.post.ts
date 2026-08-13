import { handleMcpRequest } from '../utils/mcp-http'

export default defineEventHandler((event) => handleMcpRequest(event))
