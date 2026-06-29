export default defineEventHandler(async (event) => {
  const supabase = useSupabaseAdmin()
  const sql = useCrmPostgres()

  if (!supabase && !sql) {
    return {
      mode: 'demo',
      requiresSetup: false,
      user: null,
      workspaces: [
        {
          id: 'demo_workspace',
          name: 'Demo Company',
          slug: 'demo-company',
          role: 'owner',
          plan: 'hosted_growth',
          hostingMode: 'demo'
        }
      ]
    }
  }

  const { user } = await requireSupabaseUser(event, supabase || undefined)

  if (sql) {
    const workspaces = await sql<Array<{
      id: string
      name: string
      slug: string
      role: string
      plan: string
      hosting_mode: string
      created_at: string
      updated_at: string
    }>>`
      select
        workspace.id::text,
        workspace.name,
        workspace.slug,
        member.role::text as role,
        workspace.plan,
        workspace.hosting_mode,
        workspace.created_at,
        workspace.updated_at
      from public.crm_workspace_members member
      join public.crm_workspaces workspace on workspace.id = member.workspace_id
      where member.user_id = ${user.id}::uuid
      order by member.created_at asc
    `

    return {
      mode: 'supabase',
      requiresSetup: workspaces.length === 0,
      user: {
        id: user.id,
        email: user.email || ''
      },
      workspaces: workspaces.map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        role: workspace.role,
        plan: workspace.plan,
        hostingMode: workspace.hosting_mode,
        createdAt: workspace.created_at,
        updatedAt: workspace.updated_at
      }))
    }
  }

  if (!supabase) {
    throw createError({ statusCode: 503, statusMessage: 'Supabase service client is not configured.' })
  }

  const { data: memberships, error: membershipError } = await supabase
    .from('crm_workspace_members')
    .select('workspace_id, role, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (membershipError) {
    throw createError({ statusCode: 500, statusMessage: membershipError.message })
  }

  const workspaceIds = (memberships || []).map((membership) => membership.workspace_id)

  if (workspaceIds.length === 0) {
    return {
      mode: 'supabase',
      requiresSetup: true,
      user: {
        id: user.id,
        email: user.email || ''
      },
      workspaces: []
    }
  }

  const { data: workspaces, error: workspaceError } = await supabase
    .from('crm_workspaces')
    .select('id, name, slug, plan, hosting_mode, created_at, updated_at')
    .in('id', workspaceIds)
    .order('created_at', { ascending: true })

  if (workspaceError) {
    throw createError({ statusCode: 500, statusMessage: workspaceError.message })
  }

  const roleByWorkspaceId = new Map((memberships || []).map((membership) => [membership.workspace_id, membership.role]))

  return {
    mode: 'supabase',
    requiresSetup: false,
    user: {
      id: user.id,
      email: user.email || ''
    },
    workspaces: (workspaces || []).map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      role: roleByWorkspaceId.get(workspace.id) || 'member',
      plan: workspace.plan,
      hostingMode: workspace.hosting_mode,
      createdAt: workspace.created_at,
      updatedAt: workspace.updated_at
    }))
  }
})
