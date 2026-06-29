import type { Ref } from 'vue'
import type { CrmGraphResponse } from '~/types/crm'

export function useCrmBootstrap(workspaceId?: Ref<string | undefined>) {
  const { session } = useCrmAuth()

  return useAsyncData('crm-bootstrap', async () => {
    const activeWorkspaceId = workspaceId?.value
    const headers = activeWorkspaceId && session.value?.access_token
      ? { Authorization: `Bearer ${session.value.access_token}` }
      : undefined
    const query = activeWorkspaceId ? { workspaceId: activeWorkspaceId } : undefined
    const response = await $fetch<{ mode: 'demo' | 'supabase', warning?: string, graph: CrmGraphResponse }>('/api/crm/bootstrap', {
      headers,
      query
    })

    return response
  }, {
    watch: workspaceId ? [workspaceId] : []
  })
}
