import { requireWorkspaceCapability } from '../../utils/agent-capabilities'
import { revokeAllMcpOauthTokens, revokeMcpOauthClient } from '../../utils/mcpOauth'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const workspaceId = String(query.workspaceId || '')
  if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) {
    throw createError({ statusCode: 400, statusMessage: 'workspaceId is required.' })
  }

  const { supabase, user } = await requireSupabaseUser(event)
  await requireWorkspaceCapability(supabase, user, workspaceId, 'agent.connector.manage')

  const revokedClient = await revokeMcpOauthClient(workspaceId)
  const revokedTokens = await revokeAllMcpOauthTokens(workspaceId, 'client_disabled')

  return { revokedClient, revokedTokens }
})
