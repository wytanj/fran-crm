import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

function read(path: string) {
  return readFileSync(join(root, path), 'utf8')
}

describe('agent documentation coverage', () => {
  it('documents every current server API route for agents', () => {
    const apiDocs = read('docs/agents/API_CONTRACT.md')
    const publicApiDocs = read('content/docs/api.md')
    const routeFiles = readdirSync(join(root, 'server/api'), { recursive: true })
      .filter((file): file is string => typeof file === 'string')
      .filter((file) => /\.(get|post|put|delete|patch)\.ts$/.test(file))

    for (const file of routeFiles) {
      const route = `/api/${file}`
        .replace(/\\/g, '/')
        .replace(/\.(get|post|put|delete|patch)\.ts$/, '')
        .replace(/\/index$/, '')

      expect(apiDocs, `Missing ${route} in API_CONTRACT.md`).toContain(route)
      expect(publicApiDocs, `Missing ${route} in public API docs`).toContain(route)
    }
  })

  it('tells future agents to update docs when contracts change', () => {
    const guide = read('AGENTS.md')
    expect(guide).toContain('update the matching documentation in the same change')
    expect(guide).toContain('docs/agents/API_CONTRACT.md')
    expect(guide).toContain('docs/agents/DATA_MODEL.md')
    expect(guide).toContain('docs/agents/AGENT_PROTOCOL.md')
    expect(guide).toContain('docs/agents/SKILLS.md')
    expect(guide).toContain('content/docs')
  })

  it('links the landing page to API, agent, and skills documentation', () => {
    const landing = read('app/pages/index.vue')

    expect(landing).toContain('to="/docs/api"')
    expect(landing).toContain('to="/docs/agents"')
    expect(landing).toContain('to="/docs/skills"')
  })

  it('keeps internal operator surfaces behind sign-in', () => {
    const landing = read('app/pages/index.vue')
    const sidebar = read('app/components/AppSidebar.vue')
    const protectedPages = [
      ['/analytics', 'app/pages/analytics.vue'],
      ['/api-console', 'app/pages/api-console.vue'],
      ['/graph', 'app/pages/graph.vue'],
      ['/pricing', 'app/pages/pricing.vue'],
      ['/schema', 'app/pages/schema.vue'],
      ['/settings', 'app/pages/settings.vue'],
      ['/setup', 'app/pages/setup.vue']
    ] as const

    for (const [path, page] of protectedPages) {
      expect(read(page)).toContain("middleware: 'authenticated-client'")
      expect(landing, `Landing should not link ${path}`).not.toContain(`to="${path}"`)
    }

    expect(sidebar).toContain('memberGroups')
    expect(sidebar).toContain('publicGroups')
    expect(sidebar).toContain('user.value ? memberGroups : publicGroups')
    expect(sidebar).not.toContain("to: '/agents'")
    expect(sidebar).not.toContain("to: '/fran'")
    expect(sidebar).not.toContain("to: '/integrations'")
    expect(sidebar).not.toContain("to: '/pricing'")
    expect(sidebar).not.toContain('Operations')
    expect(sidebar).toContain("to: '/graph'")
    expect(sidebar).toContain("to: '/schema'")
    expect(sidebar).toContain('Developer')
    expect(sidebar).toContain("to: '/settings'")
  })

  it('keeps every public documentation page backed by markdown', () => {
    const docsPages = ['index', 'api', 'fran-pos', 'agents', 'skills', 'model']

    for (const page of docsPages) {
      const appPath = page === 'index' ? 'app/pages/docs/index.vue' : `app/pages/docs/${page}.vue`
      const contentPath = page === 'index' ? 'content/docs/index.md' : `content/docs/${page}.md`

      expect(read(appPath)).toContain('<DocsReader')
      expect(read(contentPath)).toContain('title:')
    }
  })
})
