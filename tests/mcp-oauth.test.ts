import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  checkAuthorizeParams,
  generateClientCredentials,
  hashMcpToken,
  isMcpOauthAccessToken,
  negotiateScopes,
  resourceMatches,
  verifyPkceS256
} from '../server/utils/mcpOauthProtocol'

describe('CRM MCP OAuth protocol', () => {
  it('recognises minted access tokens and hashes secrets', () => {
    expect(isMcpOauthAccessToken('mcp_at_abc')).toBe(true)
    expect(isMcpOauthAccessToken('sb-access-token')).toBe(false)
    expect(hashMcpToken('secret')).toHaveLength(64)
    const pair = generateClientCredentials()
    expect(pair.clientId.startsWith('fran-crm-mcp-')).toBe(true)
    expect(pair.clientSecret.length).toBeGreaterThan(20)
  })

  it('verifies S256 PKCE and negotiates mcp scope', () => {
    const { createHash } = require('node:crypto') as typeof import('node:crypto')
    const verifier = 'a'.repeat(43)
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    expect(verifyPkceS256(verifier, challenge)).toBe(true)
    expect(negotiateScopes('')).toBe('mcp')
    expect(negotiateScopes('offline_access')).toBe('mcp offline_access')
  })

  it('treats /mcp and /api/mcp as the same resource', () => {
    expect(resourceMatches('https://crm.example/api/mcp', 'https://crm.example/mcp')).toBe(true)
    expect(resourceMatches('https://other.example/mcp', 'https://crm.example/mcp')).toBe(false)
  })

  it('rejects unknown redirect URIs', () => {
    const result = checkAuthorizeParams(
      {
        client_id: 'fran-crm-mcp-test',
        redirect_uri: 'https://evil.example/callback',
        response_type: 'code',
        code_challenge_method: 'S256',
        code_challenge: 'abc'
      },
      {
        clientId: 'fran-crm-mcp-test',
        redirectUris: ['https://claude.ai/api/mcp/auth_callback'],
        resource: 'https://crm.example/mcp'
      }
    )
    expect(result.ok).toBe(false)
  })
})

describe('CRM MCP OAuth wiring', () => {
  const root = process.cwd()

  it('adds oauth tables and SKUMS workspace binding', () => {
    const migration = readFileSync(join(root, 'supabase/migrations/0012_crm_mcp_oauth_and_skums_workspace.sql'), 'utf8')
    expect(migration).toContain('skums_workspace_id')
    expect(migration).toContain('crm_mcp_oauth_codes')
    expect(migration).toContain('crm_mcp_oauth_tokens')
    expect(migration).toContain('crm_mcp_oauth_clients')
  })

  it('exposes consent, token, and invite-on-connect surfaces', () => {
    const authorize = readFileSync(join(root, 'app/pages/oauth/authorize.vue'), 'utf8')
    const setup = readFileSync(join(root, 'app/pages/setup.vue'), 'utf8')
    const settings = readFileSync(join(root, 'app/pages/settings.vue'), 'utf8')
    expect(authorize).toContain('acceptInvite')
    expect(authorize).toContain('Authorize Claude')
    expect(setup).toContain('skumsWorkspaceId')
    expect(settings).toContain('/api/mcp-oauth/client')
  })
})
