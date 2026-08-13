import { requireWorkspaceCapability } from '../../utils/agent-capabilities'
import { createOrRotateMcpOauthClient, mcpResourceUrl } from '../../utils/mcpOauth'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ workspaceId?: string; label?: string }>(event)
  const workspaceId = String(body?.workspaceId || '')
  if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) {
    throw createError({ statusCode: 400, statusMessage: 'workspaceId is required.' })
  }

  const { supabase, user } = await requireSupabaseUser(event)
  await requireWorkspaceCapability(supabase, user, workspaceId, 'agent.connector.manage')

  const created = await createOrRotateMcpOauthClient({
    workspaceId,
    userId: user.id,
    label: body?.label || 'Claude connector'
  })

  return {
    remoteMcpUrl: mcpResourceUrl(event),
    clientId: created.clientId,
    clientSecret: created.clientSecret,
    rotated: created.rotated
  }
})
