import { requireWorkspaceCapability } from '../../utils/agent-capabilities'
import { describeMcpOauthClient, listMcpOauthConnections, mcpResourceUrl } from '../../utils/mcpOauth'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const workspaceId = String(query.workspaceId || '')
  if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) {
    throw createError({ statusCode: 400, statusMessage: 'workspaceId is required.' })
  }

  const { supabase, user } = await requireSupabaseUser(event)
  await requireWorkspaceCapability(supabase, user, workspaceId, 'agent.connector.manage')

  return {
    remoteMcpUrl: mcpResourceUrl(event),
    client: await describeMcpOauthClient(workspaceId),
    connections: await listMcpOauthConnections(workspaceId)
  }
})
