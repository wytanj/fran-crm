import { profileFieldUpdatePayloadSchema } from '../../../../../utils/contracts'
import { demoCrmGraph } from '../../../../../utils/demo-crm'
import { composeProfilePacks, mergeProfileValues, validateProfileFieldValues } from '../../../../../utils/profile-packs'

type EntityRow = {
  id: string
  label: string
  attributes: unknown
}

type ProfilePackRow = {
  key: string
  label: string
  description: string | null
  vertical: string | null
  status: string
  install_mode: string
  metadata: unknown
}

type ProfileFieldRow = {
  key: string
  label: string
  value_type: string
  required: boolean
  origin: string
  pack_key: string | null
  description: string | null
  help_text: string | null
  sensitivity_level: string
  pos_visible: boolean
  cashier_editable: boolean
  marketing_usable: boolean
  ui_contexts: string[]
  enum_values: unknown
  sort_order: number
  metadata: unknown
}

export default defineEventHandler(async (event) => {
  const personId = getRouterParam(event, 'person_id')
  const body = profileFieldUpdatePayloadSchema.parse(await readBody(event))
  const supabase = useSupabaseAdmin()
  const sql = useCrmPostgres()

  if ((!supabase && !sql) || !body.workspaceId || !personId || !/^[0-9a-f-]{36}$/i.test(personId)) {
    const demoPerson = demoCrmGraph.entities.find((entity) => entity.id === 'person_001')

    return {
      mode: 'demo',
      updated: true,
      personId: personId || demoPerson?.id || 'person_001',
      packKey: body.packKey,
      fields: body.fields
    }
  }

  const workspaceId = body.workspaceId
  const safePersonId = personId
  const { user } = await requireSupabaseUser(event, supabase || undefined)
  await requireWorkspaceMembership(supabase || useSupabaseAuthClient()!, user, workspaceId, ['owner', 'admin', 'member'])

  if (sql) {
    const result = await sql.begin(async (tx) => {
      const entityRows = await tx<Array<EntityRow>>`
        select id::text, label, attributes
        from public.crm_entities
        where workspace_id = ${workspaceId}::uuid
          and id = ${safePersonId}::uuid
          and type = 'person'
        limit 1
      `
      const entity = entityRows[0]

      if (!entity) {
        throw createError({ statusCode: 404, statusMessage: 'Person not found in this workspace.' })
      }

      const packRows = await tx<Array<ProfilePackRow>>`
        select key, label, description, vertical, status, install_mode, metadata
        from public.crm_profile_packs
        where workspace_id = ${workspaceId}::uuid
          and key = ${body.packKey}
          and status = 'active'
      `

      if (packRows.length === 0) {
        throw createError({ statusCode: 400, statusMessage: 'Profile pack is not installed in this workspace.' })
      }

      const fieldRows = await tx<Array<ProfileFieldRow>>`
        select
          key,
          label,
          value_type,
          required,
          origin::text as origin,
          pack_key,
          description,
          help_text,
          sensitivity_level,
          pos_visible,
          cashier_editable,
          marketing_usable,
          ui_contexts,
          enum_values,
          sort_order,
          metadata
        from public.crm_field_definitions
        where workspace_id = ${workspaceId}::uuid
          and entity_type = 'person'
          and pack_key = ${body.packKey}
        order by sort_order asc
      `

      const [pack] = composeProfilePacks(
        packRows as Array<Record<string, unknown>>,
        fieldRows as Array<Record<string, unknown>>
      ).filter((item) => item.key === body.packKey)
      const normalized = validateProfileFieldValues(body.fields, pack?.fields || [])
      const entityAttributes = entity.attributes && typeof entity.attributes === 'object' && !Array.isArray(entity.attributes)
        ? entity.attributes as Record<string, unknown>
        : {}
      const nextAttributes = mergeProfileValues(entityAttributes, body.packKey, normalized)
      const occurredAt = new Date().toISOString()

      await tx`
        update public.crm_entities
        set attributes = ${JSON.stringify(nextAttributes)}::jsonb,
            updated_at = now()
        where workspace_id = ${workspaceId}::uuid
          and id = ${safePersonId}::uuid
      `

      for (const [fieldKey, value] of Object.entries(normalized)) {
        const definition = pack?.fields.find((field) => field.key === fieldKey)

        await tx`
          insert into public.crm_customer_facts (
            workspace_id,
            person_entity_id,
            fact_type,
            fact_key,
            value,
            source_system,
            occurred_at,
            sensitivity_level
          )
          values (
            ${workspaceId}::uuid,
            ${safePersonId}::uuid,
            'customer_profile',
            ${`${body.packKey}.${fieldKey}`},
            ${JSON.stringify(value)}::jsonb,
            ${body.sourceSystem},
            ${occurredAt}::timestamptz,
            ${definition?.sensitivityLevel || 'internal'}
          )
        `
      }

      await tx`
        insert into public.crm_audit_events (workspace_id, actor_id, event_type, subject_type, subject_id, metadata)
        values (
          ${workspaceId}::uuid,
          ${user.id}::uuid,
          'person.profile_fields.updated',
          'person',
          ${safePersonId}::uuid,
          ${JSON.stringify({ packKey: body.packKey, fieldKeys: Object.keys(normalized), sourceSystem: body.sourceSystem })}::jsonb
        )
      `

      return { normalized, nextAttributes }
    })

    return {
      mode: 'supabase',
      updated: true,
      personId: safePersonId,
      packKey: body.packKey,
      fields: result.normalized,
      attributes: result.nextAttributes
    }
  }

  if (!supabase) {
    throw createError({ statusCode: 503, statusMessage: 'Supabase service client is not configured.' })
  }

  const { data: entity, error: entityError } = await supabase
    .from('crm_entities')
    .select('id, label, attributes')
    .eq('workspace_id', workspaceId)
    .eq('id', safePersonId)
    .eq('type', 'person')
    .single()

  if (entityError) {
    throw createError({ statusCode: 404, statusMessage: entityError.message })
  }

  const { data: packRows, error: packError } = await supabase
    .from('crm_profile_packs')
    .select('key, label, description, vertical, status, install_mode, metadata')
    .eq('workspace_id', workspaceId)
    .eq('key', body.packKey)
    .eq('status', 'active')

  if (packError) {
    throw createError({ statusCode: 500, statusMessage: packError.message })
  }

  if (!packRows?.length) {
    throw createError({ statusCode: 400, statusMessage: 'Profile pack is not installed in this workspace.' })
  }

  const { data: fieldRows, error: fieldError } = await supabase
    .from('crm_field_definitions')
    .select('key, label, value_type, required, origin, pack_key, description, help_text, sensitivity_level, pos_visible, cashier_editable, marketing_usable, ui_contexts, enum_values, sort_order, metadata')
    .eq('workspace_id', workspaceId)
    .eq('entity_type', 'person')
    .eq('pack_key', body.packKey)
    .order('sort_order', { ascending: true })

  if (fieldError) {
    throw createError({ statusCode: 500, statusMessage: fieldError.message })
  }

  const [pack] = composeProfilePacks(
    packRows as Array<Record<string, unknown>>,
    (fieldRows || []) as Array<Record<string, unknown>>
  ).filter((item) => item.key === body.packKey)
  const normalized = validateProfileFieldValues(body.fields, pack?.fields || [])
  const nextAttributes = mergeProfileValues((entity.attributes || {}) as Record<string, unknown>, body.packKey, normalized)
  const occurredAt = new Date().toISOString()

  const { error: updateError } = await supabase
    .from('crm_entities')
    .update({
      attributes: nextAttributes,
      updated_at: occurredAt
    })
    .eq('workspace_id', workspaceId)
    .eq('id', safePersonId)

  if (updateError) {
    throw createError({ statusCode: 500, statusMessage: updateError.message })
  }

  const facts = Object.entries(normalized).map(([fieldKey, value]) => {
    const definition = pack?.fields.find((field) => field.key === fieldKey)

    return {
      workspace_id: workspaceId,
      person_entity_id: safePersonId,
      fact_type: 'customer_profile',
      fact_key: `${body.packKey}.${fieldKey}`,
      value,
      source_system: body.sourceSystem,
      occurred_at: occurredAt,
      sensitivity_level: definition?.sensitivityLevel || 'internal'
    }
  })

  if (facts.length) {
    const { error: factError } = await supabase
      .from('crm_customer_facts')
      .insert(facts)

    if (factError) {
      throw createError({ statusCode: 500, statusMessage: factError.message })
    }
  }

  await supabase
    .from('crm_audit_events')
    .insert({
      workspace_id: workspaceId,
      actor_id: user.id,
      event_type: 'person.profile_fields.updated',
      subject_type: 'person',
      subject_id: safePersonId,
      metadata: {
        packKey: body.packKey,
        fieldKeys: Object.keys(normalized),
        sourceSystem: body.sourceSystem
      }
    })

  return {
    mode: 'supabase',
    updated: true,
    personId: safePersonId,
    packKey: body.packKey,
    fields: normalized,
    attributes: nextAttributes
  }
})
