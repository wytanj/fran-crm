import {
  anyMcpOauthClient,
  authorizationServerMetadata,
  protectedResourceMetadata
} from '../utils/mcpOauth'

const PROTECTED_RESOURCE_PATHS = new Set([
  '/.well-known/oauth-protected-resource',
  '/.well-known/oauth-protected-resource/mcp'
])

const AUTH_SERVER_PATHS = new Set([
  '/.well-known/oauth-authorization-server',
  '/.well-known/oauth-authorization-server/mcp'
])

export default defineEventHandler(async (event) => {
  const path = (event.path || '').split('?')[0].replace(/\/+$/, '') || '/'
  if (!path.startsWith('/.well-known/oauth-')) return

  const isProtectedResource = PROTECTED_RESOURCE_PATHS.has(path)
  const isAuthServer = AUTH_SERVER_PATHS.has(path)
  if (!isProtectedResource && !isAuthServer) return

  setHeader(event, 'access-control-allow-origin', '*')
  setHeader(event, 'access-control-allow-methods', 'GET, OPTIONS')
  setHeader(event, 'access-control-allow-headers', 'content-type, mcp-protocol-version')

  if (getMethod(event) === 'OPTIONS') {
    setResponseStatus(event, 204)
    return send(event, '')
  }

  if (!(await anyMcpOauthClient())) {
    setResponseStatus(event, 404)
    setHeader(event, 'content-type', 'application/json')
    return send(event, JSON.stringify({
      error: 'oauth_not_configured',
      message: 'This deployment has no MCP OAuth client. Generate credentials in Settings → Claude connector.'
    }))
  }

  const doc = isProtectedResource
    ? protectedResourceMetadata(event)
    : await authorizationServerMetadata(event)

  setResponseStatus(event, 200)
  setHeader(event, 'content-type', 'application/json')
  setHeader(event, 'cache-control', 'public, max-age=300')
  return send(event, JSON.stringify(doc))
})
