import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { H3Event } from 'h3'

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'agent'

function getBearerToken(event: H3Event) {
  const header = getHeader(event, 'authorization')

  if (!header) {
    return null
  }

  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1] || null
}

export async function requireSupabaseUser(event: H3Event, supabase = useSupabaseAdmin()) {
  supabase ||= useSupabaseAuthClient()

  if (!supabase) {
    throw createError({ statusCode: 503, statusMessage: 'Supabase is not configured.' })
  }

  const token = getBearerToken(event)

  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Missing Supabase access token.' })
  }

  const { data, error } = await supabase.auth.getUser(token)

  if (error || !data.user) {
    throw createError({ statusCode: 401, statusMessage: error?.message || 'Invalid Supabase session.' })
  }

  return { supabase, user: data.user, token }
}

export async function getWorkspaceMembership(supabase: SupabaseClient, user: User, workspaceId: string) {
  const sql = useCrmPostgres()

  if (sql) {
    const rows = await sql<Array<{ role: WorkspaceRole }>>`
      select role::text as role
      from public.crm_workspace_members
      where workspace_id = ${workspaceId}::uuid
        and user_id = ${user.id}::uuid
      limit 1
    `

    return rows[0] || null
  }

  const { data, error } = await supabase
    .from('crm_workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return data as { role: WorkspaceRole } | null
}

export async function requireWorkspaceMembership(
  supabase: SupabaseClient,
  user: User,
  workspaceId: string,
  allowedRoles: WorkspaceRole[] = ['owner', 'admin', 'member', 'agent']
) {
  const membership = await getWorkspaceMembership(supabase, user, workspaceId)

  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'User is not a member of this CRM workspace.' })
  }

  if (!allowedRoles.includes(membership.role)) {
    throw createError({ statusCode: 403, statusMessage: 'User does not have permission for this workspace action.' })
  }

  return membership
}
