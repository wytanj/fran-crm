import { franLoyaltyPolicyVersionQuerySchema } from '../../../../utils/contracts'
import {
  buildDemoFranLoyaltyPolicyBundle,
  normalizePolicyVersionRow,
  normalizeProgramRow,
  type FranLoyaltyPolicyVersionRow,
  type FranLoyaltyProgramRow
} from '../../../../fran/loyalty/policy-versions'

type PolicyListRow = FranLoyaltyPolicyVersionRow & {
  program: FranLoyaltyProgramRow
}

export default defineEventHandler(async (event) => {
  const query = franLoyaltyPolicyVersionQuerySchema.parse(getQuery(event))
  const supabase = useSupabaseAdmin()
  const sql = useCrmPostgres()

  if ((!supabase && !sql) || !query.workspaceId) {
    const demo = buildDemoFranLoyaltyPolicyBundle(query.workspaceId)

    return {
      mode: 'demo',
      program: demo.program,
      policyVersions: [demo.policyVersion],
      warning: query.workspaceId ? demo.warnings[0] : 'workspaceId is required for Supabase-backed policy versions.'
    }
  }

  const { user } = await requireSupabaseUser(event, supabase || undefined)
  await requireWorkspaceMembership(supabase || useSupabaseAuthClient()!, user, query.workspaceId)

  if (sql) {
    const statusFilter = query.status ? sql`and v.status = ${query.status}` : sql``
    const retiredFilter = query.includeRetired ? sql`` : sql`and v.status <> 'retired'`
    const rows = await sql<Array<PolicyListRow>>`
      select
        v.id::text,
        v.workspace_id::text,
        v.program_id::text,
        v.version_key,
        v.version_label,
        v.status,
        v.effective_from::text,
        v.effective_to::text,
        v.rules,
        v.source_document_ref,
        v.source_hash,
        v.change_note,
        v.created_by::text,
        v.published_by::text,
        v.published_at::text,
        v.retired_at::text,
        v.metadata,
        v.created_at::text,
        v.updated_at::text,
        jsonb_build_object(
          'id', p.id::text,
          'workspace_id', p.workspace_id::text,
          'key', p.key,
          'name', p.name,
          'description', p.description,
          'status', p.status,
          'default_currency', p.default_currency,
          'metadata', p.metadata,
          'created_at', p.created_at::text,
          'updated_at', p.updated_at::text
        ) as program
      from public.fran_loyalty_policy_versions v
      join public.fran_loyalty_programs p on p.id = v.program_id
      where v.workspace_id = ${query.workspaceId}::uuid
        and p.key = ${query.programKey}
        ${statusFilter}
        ${retiredFilter}
      order by v.created_at desc
      limit ${query.limit}
    `

    return {
      mode: 'supabase',
      program: rows[0]?.program ? normalizeProgramRow(rows[0].program) : null,
      policyVersions: rows.map(normalizePolicyVersionRow)
    }
  }

  if (!supabase) {
    throw createError({ statusCode: 503, statusMessage: 'Supabase service client is not configured.' })
  }

  const { data: program, error: programError } = await supabase
    .from('fran_loyalty_programs')
    .select('*')
    .eq('workspace_id', query.workspaceId)
    .eq('key', query.programKey)
    .maybeSingle()

  if (programError) {
    throw createError({ statusCode: 500, statusMessage: programError.message })
  }

  if (!program) {
    return { mode: 'supabase', program: null, policyVersions: [] }
  }

  let request = supabase
    .from('fran_loyalty_policy_versions')
    .select('*')
    .eq('workspace_id', query.workspaceId)
    .eq('program_id', program.id)
    .order('created_at', { ascending: false })
    .limit(query.limit)

  if (query.status) request = request.eq('status', query.status)
  if (!query.includeRetired) request = request.neq('status', 'retired')

  const { data, error } = await request

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return {
    mode: 'supabase',
    program: normalizeProgramRow(program as FranLoyaltyProgramRow),
    policyVersions: (data || []).map((row) => normalizePolicyVersionRow(row as FranLoyaltyPolicyVersionRow))
  }
})
