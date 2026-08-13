import type { User } from '@supabase/supabase-js'

export type SkumsWorkspaceOption = {
  id: string
  name: string
  role: string
  alreadyLinked: boolean
  linkedCrmWorkspaceId: string | null
}

function isMissingRelation(error: { message?: string; code?: string } | null | undefined) {
  const message = String(error?.message || '').toLowerCase()
  return error?.code === '42P01' || message.includes('does not exist') || message.includes('relation')
}

export async function listSkumsWorkspacesForUser(user: User): Promise<{
  available: boolean
  reason: string | null
  workspaces: SkumsWorkspaceOption[]
}> {
  const supabase = useSupabaseAdmin()
  const sql = useCrmPostgres()

  let memberships: Array<{ id: string; name: string; role: string }> = []

  if (sql) {
    try {
      memberships = await sql<Array<{ id: string; name: string; role: string }>>`
        select workspace.id::text, workspace.name, member.role::text as role
        from public.workspace_members member
        join public.workspaces workspace on workspace.id = member.workspace_id
        where member.user_id = ${user.id}::uuid
        order by member.created_at asc
      `
    } catch (error) {
      if (!isMissingRelation(error as { message?: string })) {
        throw error
      }
    }
  } else if (supabase) {
    const { data, error } = await supabase
      .from('workspace_members')
      .select('role, workspaces(id, name)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })

    if (error && !isMissingRelation(error)) {
      throw createError({ statusCode: 500, statusMessage: error.message })
    }

    memberships = (data || []).flatMap((row: { role?: string; workspaces?: { id?: string; name?: string } | { id?: string; name?: string }[] | null }) => {
      const workspace = Array.isArray(row.workspaces) ? row.workspaces[0] : row.workspaces
      if (!workspace?.id) return []
      return [{ id: workspace.id, name: workspace.name || 'Workspace', role: row.role || 'member' }]
    })
  }

  if (!memberships.length && !sql && !supabase) {
    return {
      available: false,
      reason: 'Cannot read SKUMS workspaces in demo mode.',
      workspaces: []
    }
  }

  if (!memberships.length) {
    return {
      available: true,
      reason: 'This Google account is not a member of any Fran SKUMS workspace. Ask an owner to invite you there first.',
      workspaces: []
    }
  }

  const links = new Map<string, string>()
  if (sql) {
    const rows = await sql<Array<{ skums_workspace_id: string; id: string }>>`
      select skums_workspace_id::text, id::text
      from public.crm_workspaces
      where skums_workspace_id is not null
    `
    for (const row of rows) links.set(row.skums_workspace_id, row.id)
  } else if (supabase) {
    const { data } = await supabase
      .from('crm_workspaces')
      .select('id, skums_workspace_id')
      .not('skums_workspace_id', 'is', null)
    for (const row of data || []) {
      if (row.skums_workspace_id) links.set(row.skums_workspace_id as string, row.id as string)
    }
  }

  return {
    available: true,
    reason: null,
    workspaces: memberships.map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      role: workspace.role,
      alreadyLinked: links.has(workspace.id),
      linkedCrmWorkspaceId: links.get(workspace.id) || null
    }))
  }
}

export async function assertSkumsWorkspaceMembership(user: User, skumsWorkspaceId: string) {
  const listed = await listSkumsWorkspacesForUser(user)
  const match = listed.workspaces.find((workspace) => workspace.id === skumsWorkspaceId)
  if (!match) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Sign in with a SKUMS workspace member account, or accept a SKUMS invite first.'
    })
  }
  if (match.alreadyLinked) {
    throw createError({
      statusCode: 409,
      statusMessage: 'That SKUMS workspace already has a Fran CRM tenant. Join the existing CRM workspace instead of creating another.'
    })
  }
  return match
}

export async function syncSkumsCrmLink(input: {
  skumsWorkspaceId: string
  crmWorkspaceId: string
  crmBaseUrl: string
  userId: string
}) {
  const supabase = useSupabaseAdmin()
  const sql = useCrmPostgres()
  const baseUrl = input.crmBaseUrl.replace(/\/+$/, '')

  if (sql) {
    try {
      await sql`
        insert into public.workspace_crm_links (
          workspace_id, crm_base_url, crm_workspace_id, status, auth_mode, created_by
        )
        values (
          ${input.skumsWorkspaceId}::uuid,
          ${baseUrl},
          ${input.crmWorkspaceId}::uuid,
          'active',
          'none',
          ${input.userId}::uuid
        )
        on conflict (workspace_id) do update set
          crm_base_url = excluded.crm_base_url,
          crm_workspace_id = excluded.crm_workspace_id,
          status = 'active',
          updated_at = now()
      `
    } catch (error) {
      if (!isMissingRelation(error as { message?: string })) {
        console.error('[crm] failed to upsert workspace_crm_links', error)
      }
    }
    return
  }

  if (!supabase) return

  const { error } = await supabase
    .from('workspace_crm_links')
    .upsert({
      workspace_id: input.skumsWorkspaceId,
      crm_base_url: baseUrl,
      crm_workspace_id: input.crmWorkspaceId,
      status: 'active',
      auth_mode: 'none',
      created_by: input.userId
    }, { onConflict: 'workspace_id' })

  if (error && !isMissingRelation(error)) {
    console.error('[crm] failed to upsert workspace_crm_links', error.message)
  }
}
