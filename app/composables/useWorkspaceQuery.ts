import type { WatchSource } from 'vue'

type WorkspaceQueryContext = {
  workspaceId?: string
  token?: string
}

export function useWorkspaceQuery<T>(
  key: string,
  handler: (context: WorkspaceQueryContext) => Promise<T>,
  extraWatch: WatchSource[] = []
) {
  const { ready, ensureReady, session, primaryWorkspace, isConfigured, requiresSetup } = useCrmAppReady()
  const indicator = useLoadingIndicator()

  const query = useAsyncData(key, async () => {
    return handler({
      workspaceId: primaryWorkspace.value?.id,
      token: session.value?.access_token
    })
  }, {
    server: false,
    immediate: false
  })

  async function run() {
    await ensureReady()
    if (isConfigured.value && !primaryWorkspace.value?.id && requiresSetup.value) {
      return
    }

    indicator.start()
    try {
      await query.execute()
    } finally {
      indicator.finish()
    }
  }

  watch(
    [ready, () => primaryWorkspace.value?.id, ...extraWatch],
    () => {
      if (ready.value) {
        void run()
      }
    },
    { immediate: true }
  )

  const pending = computed(() => {
    if (!ready.value) return true
    if (isConfigured.value && requiresSetup.value && !primaryWorkspace.value?.id) return false
    return query.status.value === 'idle' || query.pending.value
  })

  return {
    data: query.data,
    error: query.error,
    execute: run,
    pending,
    refresh: run,
    status: query.status
  }
}
