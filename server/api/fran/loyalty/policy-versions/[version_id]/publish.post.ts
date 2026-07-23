import { franLoyaltyPolicyPublishPayloadSchema } from '../../../../../utils/contracts'
import {
  buildPosContract,
  normalizeAssignmentRow,
  normalizePolicyVersionRow,
  normalizeProgramRow,
  type FranLoyaltyPolicyAssignmentRow,
  type FranLoyaltyPolicyVersionRow,
  type FranLoyaltyProgramRow
} from '../../../../../fran/loyalty/policy-versions'

export default defineEventHandler(async (event) => {
  const versionId = getRouterParam(event, 'version_id')
  const body = franLoyaltyPolicyPublishPayloadSchema.parse(await readBody(event))

  if (!versionId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing policy version id.' })
  }

  const supabase = useSupabaseAdmin()
  const sql = useCrmPostgres()

  if (!supabase && !sql) {
    throw createError({ statusCode: 503, statusMessage: 'Supabase persistence is required to publish a policy version.' })
  }

  const { user } = await requireSupabaseUser(event, supabase || undefined)
  await requireWorkspaceMembership(supabase || useSupabaseAuthClient()!, user, body.workspaceId, ['owner', 'admin'])

  if (sql) {
    const result = await sql.begin(async (tx) => {
      const [target] = await tx<Array<FranLoyaltyPolicyVersionRow & { program: FranLoyaltyProgramRow }>>`
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
        where v.id = ${versionId}::uuid
          and v.workspace_id = ${body.workspaceId}::uuid
        limit 1
      `

      if (!target) {
        throw createError({ statusCode: 404, statusMessage: 'Fran loyalty policy version was not found.' })
      }

      await tx`
        update public.fran_loyalty_policy_versions
        set status = 'retired',
            retired_at = now(),
            updated_at = now()
        where workspace_id = ${body.workspaceId}::uuid
          and program_id = ${target.program_id}::uuid
          and status = 'active'
          and id <> ${versionId}::uuid
      `

      const [policyVersion] = await tx<Array<FranLoyaltyPolicyVersionRow>>`
        update public.fran_loyalty_policy_versions
        set status = 'active',
            effective_from = coalesce(${body.effectiveFrom || null}::timestamptz, effective_from, now()),
            effective_to = coalesce(${body.effectiveTo || null}::timestamptz, effective_to),
            change_note = coalesce(${body.changeNote || null}, change_note),
            published_by = ${user.id}::uuid,
            published_at = now(),
            retired_at = null,
            updated_at = now()
        where id = ${versionId}::uuid
          and workspace_id = ${body.workspaceId}::uuid
        returning id::text, workspace_id::text, program_id::text, version_key, version_label, status, effective_from::text, effective_to::text, rules, source_document_ref, source_hash, change_note, created_by::text, published_by::text, published_at::text, retired_at::text, metadata, created_at::text, updated_at::text
      `

      if (!policyVersion) {
        throw createError({ statusCode: 500, statusMessage: 'Fran loyalty policy publish did not return a row.' })
      }

      let assignment: FranLoyaltyPolicyAssignmentRow | null = null

      if (body.createDefaultAssignment) {
        const defaultAssignmentKey = `${target.program.key}:default`
        const rows = await tx<Array<FranLoyaltyPolicyAssignmentRow>>`
          insert into public.fran_loyalty_policy_assignments (
            workspace_id,
            program_id,
            policy_version_id,
            assignment_key,
            assignment_type,
            target_ref,
            priority,
            status,
            starts_at,
            ends_at,
            created_by
          )
          values (
            ${body.workspaceId}::uuid,
            ${target.program_id}::uuid,
            ${versionId}::uuid,
            ${defaultAssignmentKey},
            'workspace_default',
            null,
            100,
            'active',
            coalesce(${body.effectiveFrom || null}::timestamptz, now()),
            ${body.effectiveTo || null}::timestamptz,
            ${user.id}::uuid
          )
          on conflict (workspace_id, assignment_key) do update set
            policy_version_id = excluded.policy_version_id,
            status = 'active',
            starts_at = excluded.starts_at,
            ends_at = excluded.ends_at,
            updated_at = now()
          returning id::text, workspace_id::text, program_id::text, policy_version_id::text, assignment_key, assignment_type, target_ref, priority, allocation_percent, status, starts_at::text, ends_at::text, assignment_rules, external_ids, created_by::text, created_at::text, updated_at::text
        `
        assignment = rows[0] || null
      }

      await tx`
        insert into public.crm_audit_events (workspace_id, actor_id, event_type, subject_type, subject_id, metadata)
        values (
          ${body.workspaceId}::uuid,
          ${user.id}::uuid,
          'fran.loyalty_policy_version.published',
          'fran_loyalty_policy_version',
          ${versionId}::uuid,
          ${JSON.stringify({ previousStatus: target.status, createDefaultAssignment: body.createDefaultAssignment })}::jsonb
        )
      `

      return { program: target.program, policyVersion, assignment }
    })

    return buildPublishResponse(result.program, result.policyVersion, result.assignment)
  }

  if (!supabase) {
    throw createError({ statusCode: 503, statusMessage: 'Supabase service client is not configured.' })
  }

  const result = await publishWithSupabase(supabase, versionId, body, user.id)

  return buildPublishResponse(result.program, result.policyVersion, result.assignment)
})

async function publishWithSupabase(
  supabase: NonNullable<ReturnType<typeof useSupabaseAdmin>>,
  versionId: string,
  body: ReturnType<typeof franLoyaltyPolicyPublishPayloadSchema.parse>,
  userId: string
) {
  const { data: target, error: targetError } = await supabase
    .from('fran_loyalty_policy_versions')
    .select('*, program:fran_loyalty_programs(*)')
    .eq('id', versionId)
    .eq('workspace_id', body.workspaceId)
    .single()

  if (targetError) {
    throw createError({ statusCode: targetError.code === 'PGRST116' ? 404 : 500, statusMessage: targetError.message })
  }

  const { error: retireError } = await supabase
    .from('fran_loyalty_policy_versions')
    .update({ status: 'retired', retired_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('workspace_id', body.workspaceId)
    .eq('program_id', target.program_id)
    .eq('status', 'active')
    .neq('id', versionId)

  if (retireError) {
    throw createError({ statusCode: 500, statusMessage: retireError.message })
  }

  const { data: policyVersion, error: updateError } = await supabase
    .from('fran_loyalty_policy_versions')
    .update({
      status: 'active',
      effective_from: body.effectiveFrom || target.effective_from || new Date().toISOString(),
      effective_to: body.effectiveTo || target.effective_to,
      change_note: body.changeNote || target.change_note,
      published_by: userId,
      published_at: new Date().toISOString(),
      retired_at: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', versionId)
    .eq('workspace_id', body.workspaceId)
    .select()
    .single()

  if (updateError) {
    throw createError({ statusCode: 500, statusMessage: updateError.message })
  }

  let assignment: FranLoyaltyPolicyAssignmentRow | null = null

  if (body.createDefaultAssignment) {
    const defaultAssignmentKey = `${target.program.key}:default`
    const { data, error } = await supabase
      .from('fran_loyalty_policy_assignments')
      .upsert({
        workspace_id: body.workspaceId,
        program_id: target.program_id,
        policy_version_id: versionId,
        assignment_key: defaultAssignmentKey,
        assignment_type: 'workspace_default',
        target_ref: null,
        priority: 100,
        status: 'active',
        starts_at: body.effectiveFrom || new Date().toISOString(),
        ends_at: body.effectiveTo || null,
        created_by: userId
      }, { onConflict: 'workspace_id,assignment_key' })
      .select()
      .single()

    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message })
    }

    assignment = data as FranLoyaltyPolicyAssignmentRow
  }

  const { error: auditError } = await supabase
    .from('crm_audit_events')
    .insert({
      workspace_id: body.workspaceId,
      actor_id: userId,
      event_type: 'fran.loyalty_policy_version.published',
      subject_type: 'fran_loyalty_policy_version',
      subject_id: versionId,
      metadata: { previousStatus: target.status, createDefaultAssignment: body.createDefaultAssignment }
    })

  if (auditError) {
    throw createError({ statusCode: 500, statusMessage: auditError.message })
  }

  return {
    program: target.program as FranLoyaltyProgramRow,
    policyVersion: policyVersion as FranLoyaltyPolicyVersionRow,
    assignment
  }
}

function buildPublishResponse(
  program: FranLoyaltyProgramRow,
  policyVersion: FranLoyaltyPolicyVersionRow,
  assignment: FranLoyaltyPolicyAssignmentRow | null
) {
  const normalized = normalizePolicyVersionRow(policyVersion)
  const normalizedAssignment = assignment ? normalizeAssignmentRow(assignment) : null

  return {
    mode: 'supabase',
    program: normalizeProgramRow(program),
    policyVersion: normalized,
    assignment: normalizedAssignment,
    posContract: buildPosContract(normalized.id, normalizedAssignment?.id)
  }
}
