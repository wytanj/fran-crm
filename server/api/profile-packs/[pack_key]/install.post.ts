import { profilePackInstallPayloadSchema } from '../../../utils/contracts'
import { cloneProfilePack, getRegisteredProfilePack, toDbFieldRow } from '../../../utils/profile-packs'

type InstalledPackRow = {
  key: string
  label: string
  description: string | null
  vertical: string | null
  status: string
  install_mode: string
  metadata: unknown
}

export default defineEventHandler(async (event) => {
  const packKey = getRouterParam(event, 'pack_key')
  const body = profilePackInstallPayloadSchema.parse(await readBody(event))
  const pack = packKey ? getRegisteredProfilePack(packKey) : null
  const supabase = useSupabaseAdmin()
  const sql = useCrmPostgres()

  if (!packKey || !pack) {
    throw createError({ statusCode: 404, statusMessage: 'Unknown profile pack.' })
  }

  if (!supabase && !sql) {
    return {
      mode: 'demo',
      installed: true,
      pack: cloneProfilePack(pack, true)
    }
  }

  const { user } = await requireSupabaseUser(event, supabase || undefined)
  await requireWorkspaceMembership(supabase || useSupabaseAuthClient()!, user, body.workspaceId, ['owner', 'admin'])

  if (sql) {
    await sql.begin(async (tx) => {
      await tx<Array<InstalledPackRow>>`
        insert into public.crm_profile_packs (
          workspace_id,
          key,
          label,
          description,
          vertical,
          status,
          install_mode,
          metadata
        )
        values (
          ${body.workspaceId}::uuid,
          ${pack.key},
          ${pack.label},
          ${pack.description || null},
          ${pack.vertical || null},
          ${pack.status || 'active'},
          ${pack.installMode || 'manual'},
          ${JSON.stringify(pack.metadata || {})}::jsonb
        )
        on conflict (workspace_id, key) do update set
          label = excluded.label,
          description = excluded.description,
          vertical = excluded.vertical,
          status = 'active',
          install_mode = excluded.install_mode,
          metadata = excluded.metadata,
          updated_at = now()
        returning key, label, description, vertical, status, install_mode, metadata
      `

      for (const field of pack.fields) {
        const row = toDbFieldRow(body.workspaceId, field)
        const rowPackKey = row.pack_key || pack.key

        await tx`
          insert into public.crm_field_definitions (
            workspace_id,
            entity_type,
            key,
            label,
            value_type,
            required,
            origin,
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
          )
          values (
            ${row.workspace_id}::uuid,
            ${row.entity_type},
            ${row.key},
            ${row.label},
            ${row.value_type},
            ${row.required},
            ${row.origin},
            ${rowPackKey},
            ${row.description || null},
            ${row.help_text || null},
            ${row.sensitivity_level},
            ${row.pos_visible},
            ${row.cashier_editable},
            ${row.marketing_usable},
            ${row.ui_contexts},
            ${JSON.stringify(row.enum_values)}::jsonb,
            ${row.sort_order},
            ${JSON.stringify(row.metadata)}::jsonb
          )
          on conflict (workspace_id, entity_type, pack_key, key) where pack_key is not null do update set
            label = excluded.label,
            value_type = excluded.value_type,
            required = excluded.required,
            origin = excluded.origin,
            description = excluded.description,
            help_text = excluded.help_text,
            sensitivity_level = excluded.sensitivity_level,
            pos_visible = excluded.pos_visible,
            cashier_editable = excluded.cashier_editable,
            marketing_usable = excluded.marketing_usable,
            ui_contexts = excluded.ui_contexts,
            enum_values = excluded.enum_values,
            sort_order = excluded.sort_order,
            metadata = excluded.metadata
        `
      }

      await tx`
        insert into public.crm_audit_events (workspace_id, actor_id, event_type, subject_type, metadata)
        values (
          ${body.workspaceId}::uuid,
          ${user.id}::uuid,
          'profile_pack.installed',
          'profile_pack',
          ${JSON.stringify({ packKey: pack.key })}::jsonb
        )
      `

    })

    return {
      mode: 'supabase',
      installed: true,
      pack: cloneProfilePack(pack, true)
    }
  }

  if (!supabase) {
    throw createError({ statusCode: 503, statusMessage: 'Supabase service client is not configured.' })
  }

  const { data: existingPack, error: existingPackError } = await supabase
    .from('crm_profile_packs')
    .select('id')
    .eq('workspace_id', body.workspaceId)
    .eq('key', pack.key)
    .maybeSingle()

  if (existingPackError) {
    throw createError({ statusCode: 500, statusMessage: existingPackError.message })
  }

  if (existingPack) {
    const { error: updatePackError } = await supabase
      .from('crm_profile_packs')
      .update({
        label: pack.label,
        description: pack.description,
        vertical: pack.vertical,
        status: 'active',
        install_mode: pack.installMode || 'manual',
        metadata: pack.metadata || {},
        updated_at: new Date().toISOString()
      })
      .eq('id', existingPack.id)

    if (updatePackError) {
      throw createError({ statusCode: 500, statusMessage: updatePackError.message })
    }
  } else {
    const { error: insertPackError } = await supabase
      .from('crm_profile_packs')
      .insert({
        workspace_id: body.workspaceId,
        key: pack.key,
        label: pack.label,
        description: pack.description,
        vertical: pack.vertical,
        status: pack.status || 'active',
        install_mode: pack.installMode || 'manual',
        metadata: pack.metadata || {}
      })

    if (insertPackError) {
      throw createError({ statusCode: 500, statusMessage: insertPackError.message })
    }
  }

  const { data: existingFields, error: existingFieldError } = await supabase
    .from('crm_field_definitions')
    .select('id, key')
    .eq('workspace_id', body.workspaceId)
    .eq('entity_type', 'person')
    .eq('pack_key', pack.key)

  if (existingFieldError) {
    throw createError({ statusCode: 500, statusMessage: existingFieldError.message })
  }

  const existingFieldByKey = new Map((existingFields || []).map((field) => [field.key, field.id]))

  for (const field of pack.fields) {
    const row = toDbFieldRow(body.workspaceId, field)
    const existingId = existingFieldByKey.get(field.key)

    const { error } = existingId
      ? await supabase
        .from('crm_field_definitions')
        .update(row)
        .eq('id', existingId)
      : await supabase
        .from('crm_field_definitions')
        .insert(row)

    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message })
    }
  }

  await supabase
    .from('crm_audit_events')
    .insert({
      workspace_id: body.workspaceId,
      actor_id: user.id,
      event_type: 'profile_pack.installed',
      subject_type: 'profile_pack',
      metadata: { packKey: pack.key }
    })

  return {
    mode: 'supabase',
    installed: true,
    pack: cloneProfilePack(pack, true)
  }
})
