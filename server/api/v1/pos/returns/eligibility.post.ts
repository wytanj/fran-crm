import { returnEligibilityPayloadSchema } from '../../../../utils/contracts'
import { buildDemoReturnEligibilityResponse } from '../../../../utils/return-eligibility'
import {
  checkReturnEligibilityWithSql,
  checkReturnEligibilityWithSupabase
} from '../../../../utils/return-eligibility-persistence'

export default defineEventHandler(async (event) => {
  const body = returnEligibilityPayloadSchema.parse(await readBody(event))
  const supabase = useSupabaseAdmin()
  const sql = useCrmPostgres()

  if ((!supabase && !sql) || !body.workspaceId) {
    return buildDemoReturnEligibilityResponse(body)
  }

  const { user } = await requireSupabaseUser(event, supabase || undefined)
  await requireWorkspaceMembership(supabase || useSupabaseAuthClient()!, user, body.workspaceId)

  if (sql) {
    return checkReturnEligibilityWithSql(sql, body.workspaceId, body, user.id)
  }

  if (!supabase) {
    throw createError({ statusCode: 503, statusMessage: 'Supabase service client is not configured.' })
  }

  return checkReturnEligibilityWithSupabase(supabase, body.workspaceId, body, user.id)
})
