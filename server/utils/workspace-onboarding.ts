export type WorkspaceCreateKind = 'sandbox' | 'production'

const PRODUCTION_DOMAIN = 'heyfran.com'

/** Allowlist entries: an entry with '@' is an exact email; otherwise a domain. */
export function parseCreateAllowlist(raw?: string | null) {
  return String(raw || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
}

export function readCreateAllowlist() {
  try {
    const config = useRuntimeConfig()
    return parseCreateAllowlist(String(config.workspaceCreateAllowlist || process.env.WORKSPACE_CREATE_ALLOWLIST || ''))
  } catch {
    return parseCreateAllowlist(process.env.WORKSPACE_CREATE_ALLOWLIST || '')
  }
}

export function isCreateAllowed(email?: string | null, allowlist: string[] = readCreateAllowlist()) {
  const normalized = String(email || '').toLowerCase().trim()
  if (!normalized || !normalized.includes('@')) {
    return false
  }

  const domain = normalized.split('@')[1] || ''
  return allowlist.some((entry) => (entry.includes('@') ? entry === normalized : entry === domain))
}

/**
 * heyfran.com identities create the real Fran tenant.
 * Any other allowlisted identity (e.g. wytanj@gmail.com) creates an isolated sandbox.
 */
export function resolveWorkspaceCreateKind(email?: string | null): WorkspaceCreateKind {
  const domain = String(email || '').toLowerCase().trim().split('@')[1] || ''
  return domain === PRODUCTION_DOMAIN ? 'production' : 'sandbox'
}

export function workspaceCreateEligibility(email?: string | null, allowlist: string[] = readCreateAllowlist()) {
  const canCreateWorkspace = isCreateAllowed(email, allowlist)
  return {
    canCreateWorkspace,
    createKind: canCreateWorkspace ? resolveWorkspaceCreateKind(email) : null
  }
}

export function suggestedWorkspaceName(kind: WorkspaceCreateKind | null) {
  if (kind === 'sandbox') {
    return 'Fran Sandbox'
  }

  if (kind === 'production') {
    return 'Fran'
  }

  return ''
}

export const WORKSPACE_CREATE_FORBIDDEN =
  'This account is not allowed to create a workspace. Ask an owner to invite you instead.'
