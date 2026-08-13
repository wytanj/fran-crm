import { listSkumsWorkspacesForUser } from '../../utils/skums-workspaces'

export default defineEventHandler(async (event) => {
  const supabase = useSupabaseAdmin()
  const sql = useCrmPostgres()

  if (!supabase && !sql) {
    return {
      mode: 'demo',
      available: false,
      reason: 'Demo mode has no SKUMS workspace list.',
      workspaces: []
    }
  }

  const { user } = await requireSupabaseUser(event, supabase || undefined)
  const listed = await listSkumsWorkspacesForUser(user)

  return {
    mode: 'supabase',
    ...listed
  }
})
