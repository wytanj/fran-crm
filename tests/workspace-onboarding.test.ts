import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  isCreateAllowed,
  parseCreateAllowlist,
  resolveWorkspaceCreateKind,
  suggestedWorkspaceName,
  workspaceCreateEligibility
} from '../server/utils/workspace-onboarding'

const root = process.cwd()

describe('workspace create allowlist', () => {
  const allowlist = parseCreateAllowlist('jeremy@heyfran.com,wytanj@gmail.com')

  it('parses emails and domains from a comma-separated env value', () => {
    expect(parseCreateAllowlist(' heyfran.com, wytanj@gmail.com ')).toEqual([
      'heyfran.com',
      'wytanj@gmail.com'
    ])
    expect(parseCreateAllowlist('')).toEqual([])
  })

  it('lets the exact allowlisted emails create, and nobody else', () => {
    expect(isCreateAllowed('jeremy@heyfran.com', allowlist)).toBe(true)
    expect(isCreateAllowed('wytanj@gmail.com', allowlist)).toBe(true)
    expect(isCreateAllowed('JEREMY@heyfran.com', allowlist)).toBe(true)
    expect(isCreateAllowed('ops@heyfran.com', allowlist)).toBe(false)
    expect(isCreateAllowed('other@gmail.com', allowlist)).toBe(false)
    expect(isCreateAllowed('', allowlist)).toBe(false)
  })

  it('treats domain entries as any address on that domain', () => {
    const domainList = parseCreateAllowlist('heyfran.com,wytanj@gmail.com')
    expect(isCreateAllowed('ops@heyfran.com', domainList)).toBe(true)
    expect(isCreateAllowed('wytanj@gmail.com', domainList)).toBe(true)
    expect(isCreateAllowed('someone@gmail.com', domainList)).toBe(false)
  })

  it('classifies heyfran.com as the real tenant and gmail as sandbox', () => {
    expect(resolveWorkspaceCreateKind('jeremy@heyfran.com')).toBe('production')
    expect(resolveWorkspaceCreateKind('wytanj@gmail.com')).toBe('sandbox')
    expect(workspaceCreateEligibility('jeremy@heyfran.com', allowlist)).toEqual({
      canCreateWorkspace: true,
      createKind: 'production'
    })
    expect(workspaceCreateEligibility('wytanj@gmail.com', allowlist)).toEqual({
      canCreateWorkspace: true,
      createKind: 'sandbox'
    })
    expect(workspaceCreateEligibility('stranger@example.com', allowlist)).toEqual({
      canCreateWorkspace: false,
      createKind: null
    })
    expect(suggestedWorkspaceName('sandbox')).toBe('Fran Sandbox')
    expect(suggestedWorkspaceName('production')).toBe('Fran')
  })

  it('gates hosted create and hides the form for everyone else', () => {
    const create = readFileSync(join(root, 'server/api/crm/workspaces/index.post.ts'), 'utf8')
    const list = readFileSync(join(root, 'server/api/crm/workspaces/index.get.ts'), 'utf8')
    const setup = readFileSync(join(root, 'app/pages/setup.vue'), 'utf8')
    const config = readFileSync(join(root, 'nuxt.config.ts'), 'utf8')

    expect(config).toContain('workspaceCreateAllowlist')
    expect(config).toContain('WORKSPACE_CREATE_ALLOWLIST')
    expect(create).toContain('isCreateAllowed')
    expect(create).toContain('WORKSPACE_CREATE_FORBIDDEN')
    expect(create).toContain('createKind')
    expect(list).toContain('workspaceCreateEligibility')
    expect(list).toContain('canCreateWorkspace')
    expect(setup).toContain('canCreateWorkspace')
    expect(setup).toContain('Ask an owner to invite you')
    expect(setup).toContain('sandbox CRM')
  })
})
