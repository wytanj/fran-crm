import { franAnalyticsQuerySchema } from '../../../utils/contracts'
import {
  demoFranAnalytics,
  loadFranAnalyticsWithSql,
  loadFranAnalyticsWithSupabase
} from '../../../utils/fran-analytics'

export default defineEventHandler(async (event) => {
  const {
    workspaceId,
    from,
    to,
    pointValueMinor,
    expiryWindowDays,
    topLimit,
    atRiskDays,
    lapsedFromDays,
    lapsedToDays
  } = franAnalyticsQuerySchema.parse(getQuery(event))
  const analyticsOptions = {
    from,
    to,
    pointValueMinor,
    expiryWindowDays,
    topLimit,
    atRiskDays,
    lapsedFromDays,
    lapsedToDays
  }
  const supabase = useSupabaseAdmin()
  const sql = useCrmPostgres()

  if ((!supabase && !sql) || !workspaceId) {
    return {
      ...demoFranAnalytics(undefined, analyticsOptions),
      warning: (supabase || sql) ? 'workspaceId is required for Supabase-backed Fran analytics.' : undefined
    }
  }

  const { user } = await requireSupabaseUser(event, supabase || undefined)
  await requireWorkspaceMembership(supabase || useSupabaseAuthClient()!, user, workspaceId)

  if (sql) {
    return await loadFranAnalyticsWithSql(sql, workspaceId, analyticsOptions)
  }

  if (!supabase) {
    throw createError({ statusCode: 503, statusMessage: 'Supabase service client is not configured.' })
  }

  return await loadFranAnalyticsWithSupabase(supabase, workspaceId, analyticsOptions)
})
