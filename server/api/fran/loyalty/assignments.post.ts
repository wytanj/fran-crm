import { franLoyaltyPolicyAssignmentPayloadSchema, type FranLoyaltyPolicyAssignmentPayload } from '../../../utils/contracts'
import {
  normalizeAssignmentRow,
  type FranLoyaltyPolicyAssignmentRow,
  type FranLoyaltyPolicyVersionRow,
  type FranLoyaltyProgramRow
} from '../../../fran/loyalty/policy-versions'

export default defineEventHandler(async (event) => {
  const body = franLoyaltyPolicyAssignmentPayloadSchema.parse(await readBody(event))
  const supabase = useSupabaseAdmin()
  const sql = useCrmPostgres()

  if (!supabase && !sql) {
    return {
      mode: 'demo',
      assignment: {
        id: `demo_${body.assignmentKey}`,
        workspaceId: body.workspaceId,
        policyVersionId: body.policyVersionId,
        assignmentKey: body.assignmentKey,
        assignmentType: body.assignmentType,
        targetRef: body.targetRef || null,
        status: body.status,
        priority: body.priority,
        allocationPercent: body.allocationPercent,
        startsAt: body.startsAt || null,
        endsAt: body.endsAt || null,
        assignmentRules: body.assignmentRules,
        externalIds: body.externalIds
      },
      warning: 'Demo assignment only. Supabase persistence is not configured.'
    }
  }

  const { user } = await requireSupabaseUser(event, supabase || undefined)
  await requireWorkspaceMembership(supabase || useSupabaseAuthClient()!, user, body.workspaceId, ['owner', 'admin'])

  if (sql) {
    const [assignment] = await sql.begin(async (tx) => {
      const [program] = await tx<Array<FranLoyaltyProgramRow>>`
        select id::text, workspace_id::text, key, name, description, status, default_currency, metadata, created_at::text, updated_at::text
        from public.fran_loyalty_programs
        where workspace_id = ${body.workspaceId}::uuid
          and key = ${body.programKey}
        limit 1
      `

      if (!program) {
        throw createError({ statusCode: 404, statusMessage: 'Fran loyalty program was not found.' })
      }

      const [policyVersion] = await tx<Array<FranLoyaltyPolicyVersionRow>>`
        select id::text, workspace_id::text, program_id::text, version_key, version_label, status, effective_from::text, effective_to::text, rules, source_document_ref, source_hash, change_note, created_by::text, published_by::text, published_at::text, retired_at::text, metadata, created_at::text, updated_at::text
        from public.fran_loyalty_policy_versions
        where workspace_id = ${body.workspaceId}::uuid
          and program_id = ${program.id}::uuid
          and id = ${body.policyVersionId}::uuid
        limit 1
      `

      if (!policyVersion) {
        throw createError({ statusCode: 404, statusMessage: 'Fran loyalty policy version was not found for this program.' })
      }

      const rows = await tx<Array<FranLoyaltyPolicyAssignmentRow>>`
        insert into public.fran_loyalty_policy_assignments (
          workspace_id,
          program_id,
          policy_version_id,
          assignment_key,
          assignment_type,
          target_ref,
          priority,
          allocation_percent,
          status,
          starts_at,
          ends_at,
          assignment_rules,
          external_ids,
          created_by
        )
        values (
          ${body.workspaceId}::uuid,
          ${program.id}::uuid,
          ${body.policyVersionId}::uuid,
          ${body.assignmentKey},
          ${body.assignmentType},
          ${body.targetRef || null},
          ${body.priority},
          ${body.allocationPercent},
          ${body.status},
          ${body.startsAt || null}::timestamptz,
          ${body.endsAt || null}::timestamptz,
          ${JSON.stringify(body.assignmentRules)}::jsonb,
          ${JSON.stringify(body.externalIds)}::jsonb,
          ${user.id}::uuid
        )
        on conflict (workspace_id, assignment_key) do update set
          policy_version_id = excluded.policy_version_id,
          assignment_type = excluded.assignment_type,
          target_ref = excluded.target_ref,
          priority = excluded.priority,
          allocation_percent = excluded.allocation_percent,
          status = excluded.status,
          starts_at = excluded.starts_at,
          ends_at = excluded.ends_at,
          assignment_rules = excluded.assignment_rules,
          external_ids = excluded.external_ids,
          updated_at = now()
        returning id::text, workspace_id::text, program_id::text, policy_version_id::text, assignment_key, assignment_type, target_ref, priority, allocation_percent, status, starts_at::text, ends_at::text, assignment_rules, external_ids, created_by::text, created_at::text, updated_at::text
      `

      const assignment = rows[0]

      if (!assignment) {
        throw createError({ statusCode: 500, statusMessage: 'Fran loyalty policy assignment upsert did not return a row.' })
      }

      await tx`
        insert into public.crm_audit_events (workspace_id, actor_id, event_type, subject_type, subject_id, metadata)
        values (
          ${body.workspaceId}::uuid,
          ${user.id}::uuid,
          'fran.loyalty_policy_assignment.upserted',
          'fran_loyalty_policy_assignment',
          ${assignment.id}::uuid,
          ${JSON.stringify({ assignmentKey: body.assignmentKey, assignmentType: body.assignmentType, targetRef: body.targetRef || null })}::jsonb
        )
      `

      return [assignment]
    })

    return { mode: 'supabase', assignment: normalizeAssignmentRow(assignment) }
  }

  if (!supabase) {
    throw createError({ statusCode: 503, statusMessage: 'Supabase service client is not configured.' })
  }

  const assignment = await upsertAssignmentWithSupabase(supabase, body, user.id)

  return { mode: 'supabase', assignment: normalizeAssignmentRow(assignment) }
})

async function upsertAssignmentWithSupabase(
  supabase: NonNullable<ReturnType<typeof useSupabaseAdmin>>,
  body: FranLoyaltyPolicyAssignmentPayload,
  userId: string
) {
  const { data: program, error: programError } = await supabase
    .from('fran_loyalty_programs')
    .select('*')
    .eq('workspace_id', body.workspaceId)
    .eq('key', body.programKey)
    .single()

  if (programError) {
    throw createError({ statusCode: programError.code === 'PGRST116' ? 404 : 500, statusMessage: programError.message })
  }

  const { data: policyVersion, error: policyError } = await supabase
    .from('fran_loyalty_policy_versions')
    .select('id')
    .eq('workspace_id', body.workspaceId)
    .eq('program_id', program.id)
    .eq('id', body.policyVersionId)
    .single()

  if (policyError || !policyVersion) {
    throw createError({ statusCode: policyError?.code === 'PGRST116' ? 404 : 500, statusMessage: policyError?.message || 'Fran loyalty policy version was not found for this program.' })
  }

  const { data, error } = await supabase
    .from('fran_loyalty_policy_assignments')
    .upsert({
      workspace_id: body.workspaceId,
      program_id: program.id,
      policy_version_id: body.policyVersionId,
      assignment_key: body.assignmentKey,
      assignment_type: body.assignmentType,
      target_ref: body.targetRef || null,
      priority: body.priority,
      allocation_percent: body.allocationPercent,
      status: body.status,
      starts_at: body.startsAt || null,
      ends_at: body.endsAt || null,
      assignment_rules: body.assignmentRules,
      external_ids: body.externalIds,
      created_by: userId
    }, { onConflict: 'workspace_id,assignment_key' })
    .select()
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const { error: auditError } = await supabase
    .from('crm_audit_events')
    .insert({
      workspace_id: body.workspaceId,
      actor_id: userId,
      event_type: 'fran.loyalty_policy_assignment.upserted',
      subject_type: 'fran_loyalty_policy_assignment',
      subject_id: data.id,
      metadata: {
        assignmentKey: body.assignmentKey,
        assignmentType: body.assignmentType,
        targetRef: body.targetRef || null
      }
    })

  if (auditError) {
    throw createError({ statusCode: 500, statusMessage: auditError.message })
  }

  return data as FranLoyaltyPolicyAssignmentRow
}
