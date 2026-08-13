import type { CrmGraphResponse } from '~/types/crm'

export function useCrmBootstrap() {
  return useWorkspaceQuery('crm-bootstrap', async ({ workspaceId, token }) => {
    const headers = workspaceId && token
      ? { Authorization: `Bearer ${token}` }
      : undefined
    const query = workspaceId ? { workspaceId } : undefined

    return await $fetch<{ mode: 'demo' | 'supabase', warning?: string, graph: CrmGraphResponse }>('/api/crm/bootstrap', {
      headers,
      query
    })
  })
}
