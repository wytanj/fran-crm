import { listMcpTools } from '../../utils/fran-agent-tools'
import { requireSupabaseUser } from '../../utils/supabase-auth'
import { resolveWorkspaceForUser, toolsVisibleToUser, validateAuthorizeRequest } from '../../utils/mcpOauth'

export default defineEventHandler(async (event) => {
  const query = getQuery(event) as Record<string, unknown>
  const request = await validateAuthorizeRequest(event, query)

  let user: Awaited<ReturnType<typeof requireSupabaseUser>>['user'] | null = null
  try {
    user = (await requireSupabaseUser(event)).user
  } catch {
    user = null
  }

  if (!user) {
    return {
      signed_in: false,
      scope: request.scope,
      resource: request.resource
    }
  }

  const workspace = await resolveWorkspaceForUser(user.id)
  if (!workspace.workspaceId) {
    const supabase = useSupabaseAdmin()
    const email = String(user.email || '').trim().toLowerCase()
    let invites: Array<{ token: string; role: string; workspace_name: string | null }> = []

    if (email && supabase) {
      const { data } = await supabase
        .from('crm_workspace_invites')
        .select('token, role, expires_at, crm_workspaces(name)')
        .eq('status', 'pending')
        .ilike('email', email)
        .gt('expires_at', new Date().toISOString())

      invites = (data || []).map((row: { token: string; role: string; crm_workspaces?: { name?: string } | { name?: string }[] | null }) => {
        const workspaceRow = Array.isArray(row.crm_workspaces) ? row.crm_workspaces[0] : row.crm_workspaces
        return {
          token: row.token,
          role: row.role || 'member',
          workspace_name: workspaceRow?.name || null
        }
      })
    }

    return {
      signed_in: true,
      email: user.email || null,
      workspace_id: null,
      workspace_name: null,
      role: null,
      tool_count: 0,
      can_authorize: false,
      pending_invites: invites,
      reason: invites.length
        ? 'Accept your CRM invitation below to finish connecting Claude.'
        : 'This account is not a member of any Fran CRM workspace. Ask an owner to invite you, or join the SKUMS workspace first and create CRM on setup.',
      scope: request.scope,
      resource: request.resource
    }
  }

  const tools = await toolsVisibleToUser(user, workspace.workspaceId)

  return {
    signed_in: true,
    email: user.email || null,
    workspace_id: workspace.workspaceId,
    workspace_name: workspace.workspaceName,
    skums_workspace_id: workspace.skumsWorkspaceId,
    workspace_ambiguous: workspace.ambiguous,
    role: workspace.role,
    tool_count: tools.length || listMcpTools().length,
    tool_names: (tools.length ? tools : listMcpTools()).map((tool) => tool.name),
    can_authorize: true,
    reason: null,
    scope: request.scope,
    resource: request.resource
  }
})
