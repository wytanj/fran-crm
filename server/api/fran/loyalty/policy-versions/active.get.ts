import {
  franLoyaltyActivePolicyQuerySchema,
  normalizeFranProgramKey
} from '../../../../utils/contracts'
import {
  buildDemoFranLoyaltyPolicyBundle,
  buildPosContract,
  normalizeAssignmentRow,
  normalizePolicyVersionRow,
  normalizeProgramRow,
  type FranLoyaltyPolicyAssignmentRow,
  type FranLoyaltyPolicyVersionRow,
  type FranLoyaltyProgramRow
} from '../../../../fran/loyalty/policy-versions'
import {
  buildDemoPosPolicyBundle,
  posBundleFromPolicyVersionRow
} from '../../../../fran/loyalty/pos-policy-bundle'

type ActivePolicyRow = FranLoyaltyPolicyVersionRow & {
  program: FranLoyaltyProgramRow
}

export default defineEventHandler(async (event) => {
  const rawQuery = getQuery(event)
  const query = franLoyaltyActivePolicyQuerySchema.parse({
    ...rawQuery,
    programKey: normalizeFranProgramKey(
      typeof rawQuery.programKey === 'string' ? rawQuery.programKey : undefined
    )
  })
  const supabase = useSupabaseAdmin()
  const sql = useCrmPostgres()
  const format = query.format

  if ((!supabase && !sql) || !query.workspaceId) {
    const demo = buildDemoFranLoyaltyPolicyBundle(query.workspaceId || 'demo_workspace')
    const posPolicyBundle = buildDemoPosPolicyBundle(
      query.workspaceId || 'demo',
      query.programKey
    )
    if (format === 'pos') {
      return posPolicyBundle
    }
    return {
      ...demo,
      posPolicyBundle,
      warning: query.workspaceId ? demo.warnings[0] : 'workspaceId is required for Supabase-backed active policy bundles.'
    }
  }

  const { user } = await requireSupabaseUser(event, supabase || undefined)
  await requireWorkspaceMembership(supabase || useSupabaseAuthClient()!, user, query.workspaceId)

  if (sql) {
    const at = query.at || new Date().toISOString()
    const assignedBundle = await loadAssignedPolicyWithSql(sql, query.workspaceId, query.programKey, {
      storeId: query.storeId,
      registerId: query.registerId,
      personId: query.personId,
      cohort: query.cohort,
      at
    })

    if (assignedBundle) {
      const policyVersion = normalizePolicyVersionRow(assignedBundle.policyVersion)
      const assignment = normalizeAssignmentRow(assignedBundle.assignment)
      const posPolicyBundle = posBundleFromPolicyVersionRow(
        query.workspaceId,
        query.programKey,
        policyVersion,
        assignment.id
      )
      if (format === 'pos') return posPolicyBundle
      return {
        mode: 'supabase',
        program: normalizeProgramRow(assignedBundle.program),
        policyVersion,
        assignment,
        posContract: buildPosContract(policyVersion.id, assignment.id),
        posPolicyBundle
      }
    }

    const [policyRow] = await sql<Array<ActivePolicyRow>>`
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
        and v.status = 'active'
        and (v.effective_from is null or v.effective_from <= ${at}::timestamptz)
        and (v.effective_to is null or v.effective_to > ${at}::timestamptz)
      order by v.published_at desc nulls last, v.created_at desc
      limit 1
    `

    if (!policyRow) {
      throw createError({ statusCode: 404, statusMessage: 'No active Fran loyalty policy version matched this workspace and program.' })
    }

    const policyVersion = normalizePolicyVersionRow(policyRow)
    const posPolicyBundle = posBundleFromPolicyVersionRow(
      query.workspaceId,
      query.programKey,
      policyVersion,
      null
    )
    if (format === 'pos') return posPolicyBundle

    return {
      mode: 'supabase',
      program: normalizeProgramRow(policyRow.program),
      policyVersion,
      assignment: null,
      posContract: buildPosContract(policyVersion.id),
      posPolicyBundle
    }
  }

  if (!supabase) {
    throw createError({ statusCode: 503, statusMessage: 'Supabase service client is not configured.' })
  }

  const bundle = await loadActivePolicyWithSupabase(supabase, query)
  const normalizedPolicy = normalizePolicyVersionRow(bundle.policyVersion)
  const normalizedAssignment = bundle.assignment ? normalizeAssignmentRow(bundle.assignment) : null
  const posPolicyBundle = posBundleFromPolicyVersionRow(
    query.workspaceId,
    query.programKey,
    normalizedPolicy,
    normalizedAssignment?.id
  )
  if (format === 'pos') return posPolicyBundle

  return {
    mode: 'supabase',
    program: normalizeProgramRow(bundle.program),
    policyVersion: normalizedPolicy,
    assignment: normalizedAssignment,
    posContract: buildPosContract(normalizedPolicy.id, normalizedAssignment?.id),
    posPolicyBundle
  }
})

async function loadAssignedPolicyWithSql(
  sql: ReturnType<typeof useCrmPostgres>,
  workspaceId: string,
  programKey: string,
  context: { storeId?: string, registerId?: string, personId?: string, cohort?: string, at: string }
) {
  if (!sql) return null

  const rows = await sql<Array<FranLoyaltyPolicyAssignmentRow & {
    program: FranLoyaltyProgramRow
    policy_version: FranLoyaltyPolicyVersionRow
  }>>`
    select
      a.id::text,
      a.workspace_id::text,
      a.program_id::text,
      a.policy_version_id::text,
      a.assignment_key,
      a.assignment_type,
      a.target_ref,
      a.priority,
      a.allocation_percent,
      a.status,
      a.starts_at::text,
      a.ends_at::text,
      a.assignment_rules,
      a.external_ids,
      a.created_by::text,
      a.created_at::text,
      a.updated_at::text,
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
      ) as program,
      jsonb_build_object(
        'id', v.id::text,
        'workspace_id', v.workspace_id::text,
        'program_id', v.program_id::text,
        'version_key', v.version_key,
        'version_label', v.version_label,
        'status', v.status,
        'effective_from', v.effective_from::text,
        'effective_to', v.effective_to::text,
        'rules', v.rules,
        'source_document_ref', v.source_document_ref,
        'source_hash', v.source_hash,
        'change_note', v.change_note,
        'created_by', v.created_by::text,
        'published_by', v.published_by::text,
        'published_at', v.published_at::text,
        'retired_at', v.retired_at::text,
        'metadata', v.metadata,
        'created_at', v.created_at::text,
        'updated_at', v.updated_at::text
      ) as policy_version
    from public.fran_loyalty_policy_assignments a
    join public.fran_loyalty_programs p on p.id = a.program_id
    join public.fran_loyalty_policy_versions v on v.id = a.policy_version_id
    where a.workspace_id = ${workspaceId}::uuid
      and p.key = ${programKey}
      and a.status = 'active'
      and v.status in ('active', 'testing', 'approved')
      and (a.starts_at is null or a.starts_at <= ${context.at}::timestamptz)
      and (a.ends_at is null or a.ends_at > ${context.at}::timestamptz)
      and (v.effective_from is null or v.effective_from <= ${context.at}::timestamptz)
      and (v.effective_to is null or v.effective_to > ${context.at}::timestamptz)
    order by a.priority asc, a.created_at desc
  `

  const assignment = rows.find((row) => matchesAssignmentTarget(row, context))

  if (!assignment) return null

  return {
    program: assignment.program,
    policyVersion: assignment.policy_version,
    assignment
  }
}

async function loadActivePolicyWithSupabase(
  supabase: NonNullable<ReturnType<typeof useSupabaseAdmin>>,
  query: ReturnType<typeof franLoyaltyActivePolicyQuerySchema.parse>
) {
  const at = query.at || new Date().toISOString()
  const { data: program, error: programError } = await supabase
    .from('fran_loyalty_programs')
    .select('*')
    .eq('workspace_id', query.workspaceId)
    .eq('key', query.programKey)
    .single()

  if (programError) {
    throw createError({ statusCode: 500, statusMessage: programError.message })
  }

  const { data: assignmentRows, error: assignmentError } = await supabase
    .from('fran_loyalty_policy_assignments')
    .select('*')
    .eq('workspace_id', query.workspaceId)
    .eq('program_id', program.id)
    .eq('status', 'active')
    .or(`starts_at.is.null,starts_at.lte.${at}`)
    .or(`ends_at.is.null,ends_at.gt.${at}`)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: false })

  if (assignmentError) {
    throw createError({ statusCode: 500, statusMessage: assignmentError.message })
  }

  const assignment = (assignmentRows || []).find((row) => matchesAssignmentTarget(row, query)) || null

  if (assignment) {
    const { data: assignedVersion, error: assignedPolicyError } = await supabase
      .from('fran_loyalty_policy_versions')
      .select('*')
      .eq('workspace_id', query.workspaceId)
      .eq('program_id', program.id)
      .eq('id', assignment.policy_version_id)
      .in('status', ['active', 'testing', 'approved'])
      .or(`effective_from.is.null,effective_from.lte.${at}`)
      .or(`effective_to.is.null,effective_to.gt.${at}`)
      .single()

    if (assignedPolicyError) {
      throw createError({ statusCode: assignedPolicyError.code === 'PGRST116' ? 404 : 500, statusMessage: assignedPolicyError.message })
    }

    return {
      program: program as FranLoyaltyProgramRow,
      policyVersion: assignedVersion as FranLoyaltyPolicyVersionRow,
      assignment: assignment as FranLoyaltyPolicyAssignmentRow
    }
  }

  const { data: policyVersion, error: policyError } = await supabase
    .from('fran_loyalty_policy_versions')
    .select('*')
    .eq('workspace_id', query.workspaceId)
    .eq('program_id', program.id)
    .eq('status', 'active')
    .or(`effective_from.is.null,effective_from.lte.${at}`)
    .or(`effective_to.is.null,effective_to.gt.${at}`)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (policyError) {
    throw createError({ statusCode: policyError.code === 'PGRST116' ? 404 : 500, statusMessage: policyError.message })
  }

  return {
    program: program as FranLoyaltyProgramRow,
    policyVersion: policyVersion as FranLoyaltyPolicyVersionRow,
    assignment: null
  }
}

function matchesAssignmentTarget(row: { assignment_type: string, target_ref: string | null }, context: {
  storeId?: string
  registerId?: string
  personId?: string
  cohort?: string
}) {
  if (row.assignment_type === 'member') return Boolean(context.personId && row.target_ref === context.personId)
  if (row.assignment_type === 'register') return Boolean(context.registerId && row.target_ref === context.registerId)
  if (row.assignment_type === 'store') return Boolean(context.storeId && row.target_ref === context.storeId)
  if (row.assignment_type === 'cohort') return Boolean(context.cohort && row.target_ref === context.cohort)
  return row.assignment_type === 'workspace_default'
}
