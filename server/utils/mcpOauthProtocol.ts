/**
 * Pure OAuth 2.1 protocol for the Fran CRM remote MCP connector.
 * No Nitro / Supabase deps — unit-testable on its own.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export const MCP_ACCESS_TOKEN_PREFIX = 'mcp_at_'
export const MCP_REFRESH_TOKEN_PREFIX = 'mcp_rt_'
export const MCP_CODE_PREFIX = 'mcp_code_'

export const CODE_TTL_MS = 60_000
export const ACCESS_TTL_MS = 60 * 60 * 1000
export const REFRESH_TTL_MS = 60 * 24 * 60 * 60 * 1000

export const MCP_OAUTH_SCOPES = ['mcp', 'offline_access']
export const CLAUDE_REDIRECT_URI = 'https://claude.ai/api/mcp/auth_callback'
export const MCP_CLIENT_ID_PREFIX = 'fran-crm-mcp-'

export class OauthError extends Error {
  code: string
  status: number
  constructor(code: string, message: string, status = 400) {
    super(message)
    this.name = 'OauthError'
    this.code = code
    this.status = status
  }
}

export function hashMcpToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

export function isMcpOauthAccessToken(raw: string | null | undefined): boolean {
  return typeof raw === 'string' && raw.startsWith(MCP_ACCESS_TOKEN_PREFIX)
}

function constantTimeEquals(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

export function verifyPkceS256(verifier: string, challenge: string): boolean {
  if (!verifier || !challenge) return false
  if (verifier.length < 43 || verifier.length > 128) return false
  const computed = createHash('sha256').update(verifier).digest('base64url')
  return constantTimeEquals(computed, challenge)
}

export function generateClientCredentials(): {
  clientId: string
  clientSecret: string
  secretPrefix: string
} {
  const clientId = `${MCP_CLIENT_ID_PREFIX}${randomBytes(6).toString('hex')}`
  const clientSecret = randomBytes(32).toString('base64url')
  return { clientId, clientSecret, secretPrefix: clientSecret.slice(0, 6) }
}

export function verifyClientSecretHash(
  provided: string | null | undefined,
  storedHash: string | null | undefined
): boolean {
  if (!storedHash) return true
  if (!provided) return false
  return constantTimeEquals(hashMcpToken(provided), storedHash)
}

export function normaliseResource(value: string): string {
  return value.trim().replace(/\/+$/, '').toLowerCase()
}

export function resourceMatches(
  candidate: string | null | undefined,
  expected: string
): boolean {
  if (!candidate) return true
  const got = normaliseResource(candidate)
  const want = normaliseResource(expected)
  if (got === want) return true
  // Accept /api/mcp and /mcp as the same resource.
  const strip = (value: string) => value.replace(/\/api\/mcp$/, '/mcp')
  return strip(got) === strip(want)
}

export function negotiateScopes(requestedScope: string | null | undefined): string {
  const requested = String(requestedScope || '').split(/\s+/).filter(Boolean)
  const granted = MCP_OAUTH_SCOPES.filter((scope) => requested.includes(scope))
  if (!granted.includes('mcp')) granted.unshift('mcp')
  return granted.join(' ')
}

export function grantIncludesOfflineAccess(scope: string | null | undefined): boolean {
  return String(scope || '').split(/\s+/).includes('offline_access')
}

export type AuthorizeParams = {
  clientId: string
  redirectUri: string
  state: string | null
  codeChallenge: string
  scope: string
  resource: string
}

export type AuthorizeCheck =
  | { ok: true; params: AuthorizeParams }
  | { ok: false; status: number; message: string }

export function checkAuthorizeParams(
  query: Record<string, unknown>,
  expected: { clientId: string; redirectUris: string[]; resource: string }
): AuthorizeCheck {
  const clientId = String(query.client_id ?? '').trim()
  if (!clientId || clientId !== expected.clientId) {
    return {
      ok: false,
      status: 400,
      message: 'Unknown client_id. Check the OAuth Client ID in Settings → Claude connector.'
    }
  }

  const redirectUri = String(query.redirect_uri ?? '').trim()
  if (!redirectUri || !expected.redirectUris.includes(redirectUri)) {
    return {
      ok: false,
      status: 400,
      message: `redirect_uri is not registered: ${redirectUri || '(missing)'}`
    }
  }

  const responseType = String(query.response_type ?? 'code').trim()
  if (responseType !== 'code') {
    return { ok: false, status: 400, message: 'Only response_type=code is supported.' }
  }

  if (String(query.code_challenge_method ?? '').trim() !== 'S256') {
    return { ok: false, status: 400, message: 'code_challenge_method must be S256.' }
  }

  const codeChallenge = String(query.code_challenge ?? '').trim()
  if (!codeChallenge) {
    return { ok: false, status: 400, message: 'code_challenge is required (PKCE).' }
  }

  const resource = query.resource ? String(query.resource).trim() : null
  if (!resourceMatches(resource, expected.resource)) {
    return {
      ok: false,
      status: 400,
      message: `resource must be ${expected.resource} (got ${resource}).`
    }
  }

  return {
    ok: true,
    params: {
      clientId,
      redirectUri,
      state: query.state ? String(query.state) : null,
      codeChallenge,
      scope: negotiateScopes(query.scope as string | undefined),
      resource: resource || expected.resource
    }
  }
}

export function protectedResourceMetadataFor(issuer: string) {
  return {
    resource: `${issuer}/mcp`,
    authorization_servers: [issuer],
    scopes_supported: MCP_OAUTH_SCOPES,
    bearer_methods_supported: ['header'],
    resource_documentation: `${issuer}/docs/agents`
  }
}

export function authorizationServerMetadataFor(issuer: string, hasClientSecret: boolean) {
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: hasClientSecret
      ? ['client_secret_post', 'client_secret_basic']
      : ['none'],
    scopes_supported: MCP_OAUTH_SCOPES,
    service_documentation: `${issuer}/docs/agents`
  }
}

export function unauthorizedHeaderFor(issuer: string): string {
  const params = [
    `resource_metadata="${issuer}/.well-known/oauth-protected-resource/mcp"`,
    `scope="${MCP_OAUTH_SCOPES.join(' ')}"`
  ]
  return `Bearer ${params.join(', ')}`
}
