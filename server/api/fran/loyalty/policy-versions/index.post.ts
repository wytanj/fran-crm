import { franLoyaltyPolicyVersionPayloadSchema, type FranLoyaltyPolicyVersionPayload } from '../../../../utils/contracts'
import {
  buildDemoFranLoyaltyPolicyBundle,
  buildPosContract,
  normalizePolicyVersionRow,
  normalizeProgramRow,
  type FranLoyaltyPolicyVersionRow,
  type FranLoyaltyProgramRow
} from '../../../../fran/loyalty/policy-versions'

export default defineEventHandler(async (event) => {
  const body = franLoyaltyPolicyVersionPayloadSchema.parse(await readBody(event))
  const supabase = useSupabaseAdmin()
  const sql = useCrmPostgres()

  if (!supabase && !sql) {
    const demo = buildDemoFranLoyaltyPolicyBundle(body.workspaceId)

    return {
      mode: 'demo',
      program: demo.program,
      policyVersion: {
        ...demo.policyVersion,
        versionKey: body.versionKey,
        versionLabel: body.versionLabel,
        status: body.status,
        rules: body.rules,
        sourceDocumentRef: body.sourceDocumentRef || null,
        sourceHash: body.sourceHash || null,
        changeNote: body.changeNote || null,
        metadata: body.metadata
      },
      posContract: buildPosContract(demo.policyVersion.id),
      warning: demo.warnings[0]
    }
  }

  const { user } = await requireSupabaseUser(event, supabase || undefined)
  await requireWorkspaceMembership(supabase || useSupabaseAuthClient()!, user, body.workspaceId, ['owner', 'admin'])

  if (sql) {
    const result = await sql.begin(async (tx) => {
      const [program] = await tx<Array<FranLoyaltyProgramRow>>`
        insert into public.fran_loyalty_programs (
          workspace_id,
          key,
          name,
          description,
          default_currency,
          metadata
        )
        values (
          ${body.workspaceId}::uuid,
          ${body.programKey},
          ${body.programName},
          ${body.programDescription || null},
          ${body.defaultCurrency},
          ${JSON.stringify({ createdBy: 'api' })}::jsonb
        )
        on conflict (workspace_id, key) do update set
          name = excluded.name,
          description = excluded.description,
          default_currency = excluded.default_currency,
          updated_at = now()
        returning id::text, workspace_id::text, key, name, description, status, default_currency, metadata, created_at::text, updated_at::text
      `

      if (!program) {
        throw createError({ statusCode: 500, statusMessage: 'Fran loyalty program upsert did not return a row.' })
      }

      const [policyVersion] = await tx<Array<FranLoyaltyPolicyVersionRow>>`
        insert into public.fran_loyalty_policy_versions (
          workspace_id,
          program_id,
          version_key,
          version_label,
          status,
          effective_from,
          effective_to,
          rules,
          source_document_ref,
          source_hash,
          change_note,
          created_by,
          metadata
        )
        values (
          ${body.workspaceId}::uuid,
          ${program.id}::uuid,
          ${body.versionKey},
          ${body.versionLabel},
          ${body.status},
          ${body.effectiveFrom || null}::timestamptz,
          ${body.effectiveTo || null}::timestamptz,
          ${JSON.stringify(body.rules)}::jsonb,
          ${body.sourceDocumentRef || null},
          ${body.sourceHash || null},
          ${body.changeNote || null},
          ${user.id}::uuid,
          ${JSON.stringify(body.metadata)}::jsonb
        )
        returning id::text, workspace_id::text, program_id::text, version_key, version_label, status, effective_from::text, effective_to::text, rules, source_document_ref, source_hash, change_note, created_by::text, published_by::text, published_at::text, retired_at::text, metadata, created_at::text, updated_at::text
      `

      if (!policyVersion) {
        throw createError({ statusCode: 500, statusMessage: 'Fran loyalty policy version insert did not return a row.' })
      }

      await tx`
        insert into public.crm_audit_events (workspace_id, actor_id, event_type, subject_type, subject_id, metadata)
        values (
          ${body.workspaceId}::uuid,
          ${user.id}::uuid,
          'fran.loyalty_policy_version.created',
          'fran_loyalty_policy_version',
          ${policyVersion.id}::uuid,
          ${JSON.stringify({ programKey: body.programKey, versionKey: body.versionKey, status: body.status })}::jsonb
        )
      `

      return { program, policyVersion }
    })

    return buildPolicyVersionResponse(result.program, result.policyVersion)
  }

  if (!supabase) {
    throw createError({ statusCode: 503, statusMessage: 'Supabase service client is not configured.' })
  }

  const result = await createPolicyVersionWithSupabase(supabase, body, user.id)

  return buildPolicyVersionResponse(result.program, result.policyVersion)
})

async function createPolicyVersionWithSupabase(
  supabase: NonNullable<ReturnType<typeof useSupabaseAdmin>>,
  body: FranLoyaltyPolicyVersionPayload,
  userId: string
) {
  const { data: program, error: programError } = await supabase
    .from('fran_loyalty_programs')
    .upsert({
      workspace_id: body.workspaceId,
      key: body.programKey,
      name: body.programName,
      description: body.programDescription || null,
      default_currency: body.defaultCurrency,
      metadata: { createdBy: 'api' }
    }, { onConflict: 'workspace_id,key' })
    .select()
    .single()

  if (programError) {
    throw createError({ statusCode: 500, statusMessage: programError.message })
  }

  const { data: policyVersion, error: policyError } = await supabase
    .from('fran_loyalty_policy_versions')
    .insert({
      workspace_id: body.workspaceId,
      program_id: program.id,
      version_key: body.versionKey,
      version_label: body.versionLabel,
      status: body.status,
      effective_from: body.effectiveFrom || null,
      effective_to: body.effectiveTo || null,
      rules: body.rules,
      source_document_ref: body.sourceDocumentRef || null,
      source_hash: body.sourceHash || null,
      change_note: body.changeNote || null,
      created_by: userId,
      metadata: body.metadata
    })
    .select()
    .single()

  if (policyError) {
    throw createError({ statusCode: 500, statusMessage: policyError.message })
  }

  const { error: auditError } = await supabase
    .from('crm_audit_events')
    .insert({
      workspace_id: body.workspaceId,
      actor_id: userId,
      event_type: 'fran.loyalty_policy_version.created',
      subject_type: 'fran_loyalty_policy_version',
      subject_id: policyVersion.id,
      metadata: { programKey: body.programKey, versionKey: body.versionKey, status: body.status }
    })

  if (auditError) {
    throw createError({ statusCode: 500, statusMessage: auditError.message })
  }

  return {
    program: program as FranLoyaltyProgramRow,
    policyVersion: policyVersion as FranLoyaltyPolicyVersionRow
  }
}

function buildPolicyVersionResponse(program: FranLoyaltyProgramRow, policyVersion: FranLoyaltyPolicyVersionRow) {
  const normalized = normalizePolicyVersionRow(policyVersion)

  return {
    mode: 'supabase',
    program: normalizeProgramRow(program),
    policyVersion: normalized,
    posContract: buildPosContract(normalized.id)
  }
}
