import { describe, expect, it } from 'vitest'
import { buildAuthRedirectUrl, normalizeAuthNextPath, resolveAuthBaseUrl } from '../app/utils/auth-redirect'

describe('auth redirect helpers', () => {
  it('keeps callback redirects local to the app', () => {
    expect(normalizeAuthNextPath('/setup')).toBe('/setup')
    expect(normalizeAuthNextPath('https://evil.example/setup')).toBe('/setup')
    expect(normalizeAuthNextPath('//evil.example/setup')).toBe('/setup')
    expect(normalizeAuthNextPath(null, '')).toBe('')
  })

  it('uses the active local dev origin when Nuxt is not running on the default port', () => {
    expect(resolveAuthBaseUrl('http://localhost:3000', 'http://localhost:3001')).toBe('http://localhost:3001')
    expect(resolveAuthBaseUrl('http://localhost:3000', 'http://127.0.0.1:3001')).toBe('http://127.0.0.1:3001')
  })

  it('builds the Supabase callback URL with setup as the default next path', () => {
    expect(buildAuthRedirectUrl('https://crm.example.com')).toBe('https://crm.example.com/confirm?next=%2Fsetup')
  })
})
