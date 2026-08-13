import {
  OauthError,
  exchangeAuthorizationCode,
  mcpOauthClientById,
  refreshAccessToken,
  touchMcpOauthClient,
  verifyClientSecretHash
} from '../../utils/mcpOauth'

type TokenErrorBody = { error: string; error_description?: string }

function fail(event: Parameters<typeof setResponseStatus>[0], status: number, body: TokenErrorBody) {
  setResponseStatus(event, status)
  setHeader(event, 'Content-Type', 'application/json')
  setHeader(event, 'Cache-Control', 'no-store')
  return body
}

function readClientCredentials(event: Parameters<typeof getHeader>[0], body: Record<string, unknown>) {
  const authHeader = String(getHeader(event, 'authorization') || '')
  const basic = authHeader.match(/^Basic\s+(.+)$/i)
  if (basic) {
    try {
      const decoded = Buffer.from(basic[1]!.trim(), 'base64').toString('utf8')
      const sep = decoded.indexOf(':')
      if (sep > -1) {
        return {
          clientId: decodeURIComponent(decoded.slice(0, sep)),
          clientSecret: decodeURIComponent(decoded.slice(sep + 1))
        }
      }
    } catch {
      // fall through
    }
  }
  return {
    clientId: body.client_id ? String(body.client_id) : '',
    clientSecret: body.client_secret ? String(body.client_secret) : ''
  }
}

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')

  let body: Record<string, unknown>
  try {
    const parsed = await readBody(event)
    body = typeof parsed === 'string'
      ? Object.fromEntries(new URLSearchParams(parsed))
      : (parsed || {}) as Record<string, unknown>
  } catch {
    return fail(event, 400, {
      error: 'invalid_request',
      error_description: 'Body must be application/x-www-form-urlencoded.'
    })
  }

  const creds = readClientCredentials(event, body)
  const client = await mcpOauthClientById(creds.clientId)
  if (!client) {
    return fail(event, 401, { error: 'invalid_client', error_description: 'Unknown client_id.' })
  }
  if (!verifyClientSecretHash(creds.clientSecret, client.clientSecretHash)) {
    return fail(event, 401, { error: 'invalid_client', error_description: 'client_secret does not match.' })
  }

  touchMcpOauthClient(client)

  const grantType = String(body.grant_type || '')
  const resource = body.resource ? String(body.resource) : null

  try {
    if (grantType === 'authorization_code') {
      const code = String(body.code || '')
      const redirectUri = String(body.redirect_uri || '')
      const codeVerifier = String(body.code_verifier || '')
      if (!code || !redirectUri || !codeVerifier) {
        return fail(event, 400, {
          error: 'invalid_request',
          error_description: 'code, redirect_uri and code_verifier are required.'
        })
      }

      const grant = await exchangeAuthorizationCode({
        code,
        clientId: creds.clientId,
        redirectUri,
        codeVerifier,
        resource
      })

      setHeader(event, 'Content-Type', 'application/json')
      return {
        access_token: grant.accessToken,
        token_type: 'Bearer',
        expires_in: grant.expiresInSeconds,
        refresh_token: grant.refreshToken || undefined,
        scope: grant.scope
      }
    }

    if (grantType === 'refresh_token') {
      const refreshToken = String(body.refresh_token || '')
      if (!refreshToken) {
        return fail(event, 400, {
          error: 'invalid_request',
          error_description: 'refresh_token is required.'
        })
      }

      const grant = await refreshAccessToken({
        refreshToken,
        clientId: creds.clientId,
        resource
      })

      setHeader(event, 'Content-Type', 'application/json')
      return {
        access_token: grant.accessToken,
        token_type: 'Bearer',
        expires_in: grant.expiresInSeconds,
        refresh_token: grant.refreshToken || undefined,
        scope: grant.scope
      }
    }

    return fail(event, 400, {
      error: 'unsupported_grant_type',
      error_description: 'Supported grants: authorization_code, refresh_token.'
    })
  } catch (error) {
    if (error instanceof OauthError) {
      return fail(event, error.status, { error: error.code, error_description: error.message })
    }
    return fail(event, 500, {
      error: 'server_error',
      error_description: error instanceof Error ? error.message : 'Token exchange failed.'
    })
  }
})
