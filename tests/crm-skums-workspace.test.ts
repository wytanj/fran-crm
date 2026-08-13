import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

describe('CRM attaches to an existing SKUMS workspace', () => {
  it('setup and create routes require a SKUMS workspace id', () => {
    const create = readFileSync(join(root, 'server/api/crm/workspaces/index.post.ts'), 'utf8')
    const setup = readFileSync(join(root, 'app/pages/setup.vue'), 'utf8')
    expect(create).toContain('assertSkumsWorkspaceMembership')
    expect(create).toContain('syncSkumsCrmLink')
    expect(setup).toContain('/api/crm/skums-workspaces')
    expect(setup).toContain('SKUMS business workspace')
  })
})
