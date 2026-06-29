const DEFAULT_AUTH_NEXT_PATH = '/setup'
const LOCALHOST_DEFAULT_SITE_URL = 'http://localhost:3000'

function isLocalDevOrigin(value: string) {
  return value.startsWith('http://localhost') || value.startsWith('http://127.0.0.1')
}

export function normalizeAuthNextPath(value?: string | null, fallback = DEFAULT_AUTH_NEXT_PATH) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return fallback
  }

  return value
}

export function resolveAuthBaseUrl(configuredSiteUrl?: string | null, currentOrigin?: string | null) {
  const configured = configuredSiteUrl?.trim().replace(/\/+$/, '')
  const origin = currentOrigin?.trim().replace(/\/+$/, '')

  if (origin && isLocalDevOrigin(origin) && (!configured || configured === LOCALHOST_DEFAULT_SITE_URL)) {
    return origin
  }

  return configured || origin || LOCALHOST_DEFAULT_SITE_URL
}

export function buildAuthRedirectUrl(baseUrl: string, nextPath = DEFAULT_AUTH_NEXT_PATH) {
  const url = new URL('/confirm', `${baseUrl.replace(/\/+$/, '')}/`)
  url.searchParams.set('next', normalizeAuthNextPath(nextPath))

  return url.toString()
}
