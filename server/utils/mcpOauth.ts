/**
 * Request- and DB-bound MCP OAuth for Fran CRM.
 * Protocol rules live in mcpOauthProtocol.ts.
 */
import { randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { franAgentToolDefinitions } from './fran-agent-tools'
import { resolveWorkspaceCapabilities } from './agent-capabilities'
import {
  ACCESS_TTL_MS,
  CLAUDE_REDIRECT_URI,
  CODE_TTL_MS,
  MCP_ACCESS_TOKEN_PREFIX,
  MCP_CODE_PREFIX,
  MCP_OAUTH_SCOPES,
  MCP_REFRESH_TOKEN_PREFIX,
  OauthError,
  REFRESH_TTL_MS,
  type AuthorizeParams,
  authorizationServerMetadataFor,
  checkAuthorizeParams,
  generateClientCredentials,
  grantIncludesOfflineAccess,
  hashMcpToken,
  isMcpOauthAccessToken,
  protectedResourceMetadataFor,
  unauthorizedHeaderFor,
  verifyClientSecretHash,
  verifyPkceS256
} from './mcpOauthProtocol'

export {
  MCP_ACCESS_TOKEN_PREFIX,
  MCP_OAUTH_SCOPES,
  MCP_REFRESH_TOKEN_PREFIX,
  OauthError,
  generateClientCredentials,
  hashMcpToken,
  isMcpOauthAccessToken,
  verifyClientSecretHash,
  verifyPkceS256
}
export type { AuthorizeParams }

export type McpOauthClient = {
  id: string | null
  clientId: string
  clientSecretHash: string | null
  redirectUris: string[]
  source: 'database' | 'env'
}

export type McpOauthTokenGrant = {
  accessToken: string
  refreshToken: string | null
  expiresInSeconds: number
  scope: string
}

export type McpOauthIdentity = {
  tokenId: string
  workspaceId: string
  userId: string
  clientId: string
  scope: string | null
}

function adminClient(): SupabaseClient {
  const supabase = useSupabaseAdmin()
  if (!supabase) {
    throw createError({ statusCode: 503, statusMessage: 'Supabase service role is required for MCP OAuth.' })
  }
  return supabase
}

function registeredRedirectUris(): string[] {
  const extra = String(process.env.MCP_OAUTH_EXTRA_REDIRECT_URIS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  return [CLAUDE_REDIRECT_URI, ...extra]
}

function envMcpOauthClient(): McpOauthClient | null {
  const config = useRuntimeConfig()
  const clientId = String(config.mcpOauthClientId || process.env.MCP_OAUTH_CLIENT_ID || '').trim()
  if (!clientId) return null
  const clientSecret = String(config.mcpOauthClientSecret || process.env.MCP_OAUTH_CLIENT_SECRET || '').trim()
  return {
    id: null,
    clientId,
    clientSecretHash: clientSecret ? hashMcpToken(clientSecret) : null,
    redirectUris: registeredRedirectUris(),
    source: 'env'
  }
}

export async function mcpOauthClientById(clientId: string | null | undefined): Promise<McpOauthClient | null> {
  const id = String(clientId || '').trim()
  if (!id) return null

  try {
    const { data } = await adminClient()
      .from('crm_mcp_oauth_clients')
      .select('id, client_id, client_secret_hash')
      .eq('client_id', id)
      .is('revoked_at', null)
      .maybeSingle()

    if (data) {
      return {
        id: data.id as string,
        clientId: data.client_id as string,
        clientSecretHash: (data.client_secret_hash as string) || null,
        redirectUris: registeredRedirectUris(),
        source: 'database'
      }
    }
  } catch {
    // Table missing or DB down — fall back to env.
  }

  const env = envMcpOauthClient()
  return env && env.clientId === id ? env : null
}

export async function anyMcpOauthClient(): Promise<McpOauthClient | null> {
  try {
    const { data } = await adminClient()
      .from('crm_mcp_oauth_clients')
      .select('id, client_id, client_secret_hash')
      .is('revoked_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (data) {
      return {
        id: data.id as string,
        clientId: data.client_id as string,
        clientSecretHash: (data.client_secret_hash as string) || null,
        redirectUris: registeredRedirectUris(),
        source: 'database'
      }
    }
  } catch {
    // fall through
  }
  return envMcpOauthClient()
}

export function touchMcpOauthClient(client: McpOauthClient): void {
  if (!client.id) return
  adminClient()
    .from('crm_mcp_oauth_clients')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', client.id)
    .then(() => undefined)
    .catch(() => undefined)
}

export async function createOrRotateMcpOauthClient(input: {
  workspaceId: string
  userId: string | null
  label?: string | null
}): Promise<{ clientId: string; clientSecret: string; rotated: boolean }> {
  const db = adminClient()
  const generated = generateClientCredentials()
  const { data: existing } = await db
    .from('crm_mcp_oauth_clients')
    .select('id, client_id')
    .eq('workspace_id', input.workspaceId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(1)

  const current = existing?.[0]
  if (current) {
    const { error } = await db
      .from('crm_mcp_oauth_clients')
      .update({
        client_secret_hash: hashMcpToken(generated.clientSecret),
        secret_prefix: generated.secretPrefix,
        rotated_at: new Date().toISOString(),
        label: input.label ?? undefined
      })
      .eq('id', current.id)
    if (error) throw new Error(`could not rotate client secret: ${error.message}`)
    return { clientId: current.client_id as string, clientSecret: generated.clientSecret, rotated: true }
  }

  const { error } = await db.from('crm_mcp_oauth_clients').insert({
    workspace_id: input.workspaceId,
    client_id: generated.clientId,
    client_secret_hash: hashMcpToken(generated.clientSecret),
    secret_prefix: generated.secretPrefix,
    label: input.label || 'Claude connector',
    created_by: input.userId
  })
  if (error) throw new Error(`could not create client: ${error.message}`)
  return { clientId: generated.clientId, clientSecret: generated.clientSecret, rotated: false }
}

export async function revokeMcpOauthClient(workspaceId: string, reason = 'revoked_by_admin'): Promise<boolean> {
  const { data } = await adminClient()
    .from('crm_mcp_oauth_clients')
    .update({ revoked_at: new Date().toISOString(), revoked_reason: reason })
    .eq('workspace_id', workspaceId)
    .is('revoked_at', null)
    .select('id')
  return Boolean(data?.length)
}

export async function describeMcpOauthClient(workspaceId: string) {
  const { data } = await adminClient()
    .from('crm_mcp_oauth_clients')
    .select('client_id, secret_prefix, client_secret_hash, label, created_at, rotated_at, last_used_at')
    .eq('workspace_id', workspaceId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(1)

  const row = data?.[0]
  if (row) {
    return {
      configured: true,
      source: 'database' as const,
      client_id: row.client_id as string,
      secret_prefix: (row.secret_prefix as string) || null,
      has_secret: Boolean(row.client_secret_hash),
      label: (row.label as string) || null,
      created_at: (row.created_at as string) || null,
      rotated_at: (row.rotated_at as string) || null,
      last_used_at: (row.last_used_at as string) || null
    }
  }

  const env = envMcpOauthClient()
  return {
    configured: Boolean(env),
    source: env ? 'env' as const : null,
    client_id: env?.clientId || null,
    secret_prefix: null,
    has_secret: Boolean(env?.clientSecretHash),
    label: env ? 'Environment variables' : null,
    created_at: null,
    rotated_at: null,
    last_used_at: null
  }
}

export async function listMcpOauthConnections(workspaceId: string) {
  const db = adminClient()
  const { data } = await db
    .from('crm_mcp_oauth_tokens')
    .select('user_id, created_at, last_used_at, expires_at')
    .eq('workspace_id', workspaceId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(200)

  const byUser = new Map<string, typeof data extends (infer Row)[] | null ? NonNullable<Row> : never>()
  for (const row of data || []) {
    if (!byUser.has(row.user_id as string)) byUser.set(row.user_id as string, row)
  }

  const emails = new Map<string, string>()
  try {
    const { data: users } = await db.auth.admin.listUsers({ page: 1, perPage: 200 })
    for (const user of users?.users || []) {
      if (user?.id && user?.email) emails.set(user.id, user.email)
    }
  } catch {
    // labels only
  }

  return [...byUser.values()].map((row) => ({
    user_id: row.user_id as string,
    email: emails.get(row.user_id as string) || null,
    created_at: (row.created_at as string) || null,
    last_used_at: (row.last_used_at as string) || null,
    expires_at: (row.expires_at as string) || null
  }))
}

export async function revokeAllMcpOauthTokens(workspaceId: string, reason = 'revoked_by_admin'): Promise<number> {
  const { data } = await adminClient()
    .from('crm_mcp_oauth_tokens')
    .update({ revoked_at: new Date().toISOString(), revoked_reason: reason })
    .eq('workspace_id', workspaceId)
    .is('revoked_at', null)
    .select('id')
  return data?.length || 0
}

export function mcpOauthIssuer(event: H3Event): string {
  const explicit = String(process.env.MCP_OAUTH_ISSUER || '').trim()
  if (explicit) return explicit.replace(/\/+$/, '')

  const host = getHeader(event, 'x-forwarded-host') || getHeader(event, 'host') || ''
  const proto = String(getHeader(event, 'x-forwarded-proto') || 'https').split(',')[0]
  if (host) return `${proto}://${host}`.replace(/\/+$/, '')

  return String(useRuntimeConfig().public.siteUrl || 'http://localhost:3000').replace(/\/+$/, '')
}

export function mcpResourceUrl(event: H3Event): string {
  return `${mcpOauthIssuer(event)}/mcp`
}

export function protectedResourceMetadata(event: H3Event) {
  return protectedResourceMetadataFor(mcpOauthIssuer(event))
}

export async function authorizationServerMetadata(event: H3Event) {
  const client = await anyMcpOauthClient()
  return authorizationServerMetadataFor(mcpOauthIssuer(event), Boolean(client?.clientSecretHash))
}

export function mcpUnauthorizedHeader(event: H3Event): string {
  return unauthorizedHeaderFor(mcpOauthIssuer(event))
}

export async function validateAuthorizeRequest(
  event: H3Event,
  query: Record<string, unknown>
): Promise<AuthorizeParams> {
  const client = await mcpOauthClientById(String(query.client_id || ''))
  if (!client) {
    const configured = await anyMcpOauthClient()
    throw createError(
      configured
        ? { statusCode: 400, statusMessage: 'Unknown client_id. Check Settings → Claude connector.' }
        : { statusCode: 503, statusMessage: 'MCP OAuth is not configured on this deployment.' }
    )
  }

  const result = checkAuthorizeParams(query, {
    clientId: client.clientId,
    redirectUris: client.redirectUris,
    resource: mcpResourceUrl(event)
  })
  if (!result.ok) {
    throw createError({ statusCode: result.status, statusMessage: result.message })
  }
  return result.params
}

export async function resolveWorkspaceForUser(userId: string): Promise<{
  workspaceId: string | null
  workspaceName: string | null
  skumsWorkspaceId: string | null
  role: string | null
  ambiguous: boolean
}> {
  const sql = useCrmPostgres()
  if (sql) {
    const rows = await sql<Array<{
      id: string
      name: string
      role: string
      skums_workspace_id: string | null
    }>>`
      select workspace.id::text, workspace.name, member.role::text as role, workspace.skums_workspace_id::text
      from public.crm_workspace_members member
      join public.crm_workspaces workspace on workspace.id = member.workspace_id
      where member.user_id = ${userId}::uuid
      order by member.created_at asc
    `
    if (!rows.length) {
      return { workspaceId: null, workspaceName: null, skumsWorkspaceId: null, role: null, ambiguous: false }
    }
    return {
      workspaceId: rows[0]!.id,
      workspaceName: rows[0]!.name,
      skumsWorkspaceId: rows[0]!.skums_workspace_id,
      role: rows[0]!.role,
      ambiguous: rows.length > 1
    }
  }

  const { data: memberships } = await adminClient()
    .from('crm_workspace_members')
    .select('workspace_id, role, created_at, crm_workspaces(name, skums_workspace_id)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (!memberships?.length) {
    return { workspaceId: null, workspaceName: null, skumsWorkspaceId: null, role: null, ambiguous: false }
  }

  const first = memberships[0] as {
    workspace_id: string
    role: string
    crm_workspaces?: { name?: string; skums_workspace_id?: string | null } | null
  }
  return {
    workspaceId: first.workspace_id,
    workspaceName: first.crm_workspaces?.name || null,
    skumsWorkspaceId: first.crm_workspaces?.skums_workspace_id || null,
    role: first.role,
    ambiguous: memberships.length > 1
  }
}

export async function toolsVisibleToUser(user: User, workspaceId: string) {
  try {
    const resolved = await resolveWorkspaceCapabilities(adminClient(), user, workspaceId)
    return franAgentToolDefinitions.filter((tool) =>
      tool.requiredCapabilities.every((capability) => resolved.capabilities.includes(capability))
    )
  } catch {
    return []
  }
}

export async function mintAuthorizationCode(input: {
  workspaceId: string
  userId: string
  clientId: string
  redirectUri: string
  codeChallenge: string
  resource: string | null
  scope: string
}): Promise<string> {
  const raw = `${MCP_CODE_PREFIX}${randomBytes(32).toString('base64url')}`
  const { error } = await adminClient().from('crm_mcp_oauth_codes').insert({
    code_hash: hashMcpToken(raw),
    workspace_id: input.workspaceId,
    user_id: input.userId,
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    code_challenge: input.codeChallenge,
    code_challenge_method: 'S256',
    resource: input.resource,
    scope: input.scope,
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString()
  })
  if (error) throw new OauthError('server_error', `could not persist code: ${error.message}`, 500)
  return raw
}

async function issueTokens(input: {
  workspaceId: string
  userId: string
  clientId: string
  resource: string | null
  scope: string
  withRefresh: boolean
  rotatedFrom?: string | null
}): Promise<McpOauthTokenGrant> {
  const accessToken = `${MCP_ACCESS_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`
  const refreshToken = input.withRefresh
    ? `${MCP_REFRESH_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`
    : null

  const { error } = await adminClient().from('crm_mcp_oauth_tokens').insert({
    access_token_hash: hashMcpToken(accessToken),
    refresh_token_hash: refreshToken ? hashMcpToken(refreshToken) : null,
    workspace_id: input.workspaceId,
    user_id: input.userId,
    client_id: input.clientId,
    resource: input.resource,
    scope: input.scope,
    expires_at: new Date(Date.now() + ACCESS_TTL_MS).toISOString(),
    refresh_expires_at: refreshToken ? new Date(Date.now() + REFRESH_TTL_MS).toISOString() : null,
    rotated_from: input.rotatedFrom || null
  })
  if (error) throw new OauthError('server_error', `could not persist token: ${error.message}`, 500)

  return {
    accessToken,
    refreshToken,
    expiresInSeconds: Math.floor(ACCESS_TTL_MS / 1000),
    scope: input.scope
  }
}

export async function exchangeAuthorizationCode(input: {
  code: string
  clientId: string
  redirectUri: string
  codeVerifier: string
  resource: string | null
}): Promise<McpOauthTokenGrant> {
  const db = adminClient()
  const { data: row } = await db
    .from('crm_mcp_oauth_codes')
    .select('*')
    .eq('code_hash', hashMcpToken(input.code))
    .maybeSingle()

  if (!row) throw new OauthError('invalid_grant', 'authorization code not recognised')

  if (row.consumed_at) {
    await db
      .from('crm_mcp_oauth_tokens')
      .update({ revoked_at: new Date().toISOString(), revoked_reason: 'authorization_code_replayed' })
      .eq('user_id', row.user_id)
      .eq('workspace_id', row.workspace_id)
      .is('revoked_at', null)
    throw new OauthError('invalid_grant', 'authorization code already used')
  }

  if (new Date(row.expires_at as string).getTime() <= Date.now()) {
    throw new OauthError('invalid_grant', 'authorization code expired')
  }
  if (row.client_id !== input.clientId) {
    throw new OauthError('invalid_grant', 'client_id does not match the code')
  }
  if (row.redirect_uri !== input.redirectUri) {
    throw new OauthError('invalid_grant', 'redirect_uri does not match the code')
  }
  if (!verifyPkceS256(input.codeVerifier, row.code_challenge as string)) {
    throw new OauthError('invalid_grant', 'PKCE verification failed')
  }

  await db
    .from('crm_mcp_oauth_codes')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', row.id)

  return issueTokens({
    workspaceId: row.workspace_id as string,
    userId: row.user_id as string,
    clientId: input.clientId,
    resource: input.resource || (row.resource as string | null),
    scope: (row.scope as string) || 'mcp',
    withRefresh: grantIncludesOfflineAccess(row.scope as string)
  })
}

export async function refreshAccessToken(input: {
  refreshToken: string
  clientId: string
  resource: string | null
}): Promise<McpOauthTokenGrant> {
  const db = adminClient()
  const { data: row } = await db
    .from('crm_mcp_oauth_tokens')
    .select('*')
    .eq('refresh_token_hash', hashMcpToken(input.refreshToken))
    .maybeSingle()

  if (!row) throw new OauthError('invalid_grant', 'refresh token not recognised')
  if (row.revoked_at) throw new OauthError('invalid_grant', 'refresh token revoked')
  if (row.client_id !== input.clientId) {
    throw new OauthError('invalid_grant', 'client_id does not match the refresh token')
  }
  if (row.refresh_expires_at && new Date(row.refresh_expires_at as string).getTime() <= Date.now()) {
    throw new OauthError('invalid_grant', 'refresh token expired')
  }

  await db
    .from('crm_mcp_oauth_tokens')
    .update({ revoked_at: new Date().toISOString(), revoked_reason: 'rotated' })
    .eq('id', row.id)

  return issueTokens({
    workspaceId: row.workspace_id as string,
    userId: row.user_id as string,
    clientId: input.clientId,
    resource: input.resource || (row.resource as string | null),
    scope: (row.scope as string) || 'mcp',
    withRefresh: true,
    rotatedFrom: row.id as string
  })
}

export async function lookupMcpAccessToken(raw: string): Promise<McpOauthIdentity | null> {
  if (!isMcpOauthAccessToken(raw)) return null

  const { data: row } = await adminClient()
    .from('crm_mcp_oauth_tokens')
    .select('id, workspace_id, user_id, client_id, scope, expires_at, revoked_at')
    .eq('access_token_hash', hashMcpToken(raw))
    .maybeSingle()

  if (!row || row.revoked_at) return null
  if (new Date(row.expires_at as string).getTime() <= Date.now()) return null

  adminClient()
    .from('crm_mcp_oauth_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', row.id)
    .then(() => undefined)
    .catch(() => undefined)

  return {
    tokenId: row.id as string,
    workspaceId: row.workspace_id as string,
    userId: row.user_id as string,
    clientId: row.client_id as string,
    scope: (row.scope as string) || null
  }
}

export async function loadUserForMcpIdentity(identity: McpOauthIdentity): Promise<User> {
  const { data, error } = await adminClient().auth.admin.getUserById(identity.userId)
  if (error || !data.user) {
    throw createError({ statusCode: 401, statusMessage: 'MCP token user is no longer available.' })
  }
  return data.user
}
