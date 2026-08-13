import { requireSupabaseUser } from '../../utils/supabase-auth'
import { mintAuthorizationCode, resolveWorkspaceForUser, validateAuthorizeRequest } from '../../utils/mcpOauth'

export default defineEventHandler(async (event) => {
  const body = (await readBody(event).catch(() => ({}))) as Record<string, unknown>
  const request = await validateAuthorizeRequest(event, body)
  const { user } = await requireSupabaseUser(event)
  const workspace = await resolveWorkspaceForUser(user.id)

  if (!workspace.workspaceId) {
    throw createError({
      statusCode: 403,
      statusMessage: 'This account is not a member of any Fran CRM workspace.'
    })
  }

  const code = await mintAuthorizationCode({
    workspaceId: workspace.workspaceId,
    userId: user.id,
    clientId: request.clientId,
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
    resource: request.resource,
    scope: request.scope
  })

  const target = new URL(request.redirectUri)
  target.searchParams.set('code', code)
  if (request.state) target.searchParams.set('state', request.state)

  return { redirect_url: target.toString() }
})
