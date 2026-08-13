export function useCrmAppReady() {
  const auth = useCrmAuth()
  const workspaces = useCrmWorkspaceAccess()

  const ready = computed(() => {
    if (!auth.authReady.value) return false
    if (!auth.user.value) return true
    return workspaces.workspacesReady.value
  })

  const pending = computed(() => !ready.value || auth.loading.value || workspaces.pending.value)

  async function ensureReady() {
    await auth.ensureSession()
    if (auth.user.value) {
      await workspaces.ensureWorkspaces()
    } else {
      workspaces.workspacesReady.value = true
    }
  }

  return {
    ...auth,
    ...workspaces,
    ensureReady,
    pending,
    ready
  }
}
