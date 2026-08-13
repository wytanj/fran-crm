import type { CrmWorkspaceAccessResponse, WorkspaceSetupPayload } from '~/types/crm'

let workspacesInFlight: Promise<CrmWorkspaceAccessResponse | null> | null = null

export function useCrmWorkspaceAccess() {
  const access = useState<CrmWorkspaceAccessResponse | null>('crm-workspace-access', () => null)
  const pending = useState('crm-workspace-pending', () => false)
  const workspacesReady = useState('crm-workspaces-ready', () => false)
  const error = useState('crm-workspace-error', () => '')
  const { isConfigured, refreshSession, session } = useCrmAuth()

  const primaryWorkspace = computed(() => access.value?.workspaces[0] || null)
  const requiresSetup = computed(() => Boolean(access.value?.requiresSetup))

  async function getAuthHeaders() {
    if (!isConfigured.value) {
      return undefined
    }

    const activeSession = session.value || await refreshSession()

    if (!activeSession?.access_token) {
      throw new Error('Sign in before loading a hosted workspace.')
    }

    return {
      Authorization: `Bearer ${activeSession.access_token}`
    }
  }

  async function loadWorkspaces(force = false) {
    if (!force && workspacesReady.value && access.value) {
      return access.value
    }

    if (!force && workspacesInFlight) {
      return workspacesInFlight
    }

    pending.value = true
    error.value = ''

    const request = (async () => {
      try {
        const headers = await getAuthHeaders()
        access.value = await $fetch<CrmWorkspaceAccessResponse>('/api/crm/workspaces', { headers })
        return access.value
      } catch (loadError) {
        error.value = loadError instanceof Error ? loadError.message : 'Unable to load CRM workspaces.'
        access.value = null
        return null
      } finally {
        pending.value = false
        workspacesReady.value = true
        workspacesInFlight = null
      }
    })()

    workspacesInFlight = request
    return request
  }

  async function ensureWorkspaces() {
    if (!isConfigured.value || !session.value) {
      workspacesReady.value = true
      return access.value
    }

    return loadWorkspaces(false)
  }

  async function createWorkspace(payload: WorkspaceSetupPayload) {
    pending.value = true
    error.value = ''

    try {
      const headers = await getAuthHeaders()
      const response = await $fetch<{ mode: 'demo' | 'supabase', workspace: CrmWorkspaceAccessResponse['workspaces'][number] }>('/api/crm/workspaces', {
        method: 'POST',
        headers,
        body: payload
      })

      access.value = {
        mode: response.mode,
        requiresSetup: false,
        user: access.value?.user || null,
        workspaces: [response.workspace]
      }
      workspacesReady.value = true

      return response.workspace
    } catch (createError) {
      error.value = createError instanceof Error ? createError.message : 'Unable to create workspace.'
      throw createError
    } finally {
      pending.value = false
    }
  }

  return {
    access,
    createWorkspace,
    ensureWorkspaces,
    error,
    loadWorkspaces,
    pending,
    primaryWorkspace,
    requiresSetup,
    workspacesReady
  }
}
