import { workspaceScopedQuerySchema } from '../../../utils/contracts'
import { cloneProfilePack, composeProfilePacks, getRegisteredProfilePack } from '../../../utils/profile-packs'

export default defineEventHandler(async (event) => {
  const packKey = getRouterParam(event, 'pack_key')
  const { workspaceId } = workspaceScopedQuerySchema.parse(getQuery(event))
  const registeredPack = packKey ? getRegisteredProfilePack(packKey) : null
  const supabase = useSupabaseAdmin()
  const sql = useCrmPostgres()

  if (!packKey) {
    throw createError({ statusCode: 400, statusMessage: 'pack_key is required.' })
  }

  if ((!supabase && !sql) || !workspaceId) {
    if (!registeredPack) {
      throw createError({ statusCode: 404, statusMessage: 'Unknown profile pack.' })
    }

    return {
      mode: 'demo',
      pack: cloneProfilePack(registeredPack)
    }
  }

  const { user } = await requireSupabaseUser(event, supabase || undefined)
  await requireWorkspaceMembership(supabase || useSupabaseAuthClient()!, user, workspaceId)

  try {
    if (sql) {
      const packs = await sql<Array<Record<string, unknown>>>`
        select key, label, description, vertical, status, install_mode, metadata
        from public.crm_profile_packs
        where workspace_id = ${workspaceId}::uuid
          and key = ${packKey}
        limit 1
      `

      const fields = await sql<Array<Record<string, unknown>>>`
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
          and pack_key = ${packKey}
        order by sort_order asc, created_at asc
      `

      const [pack] = composeProfilePacks(packs, fields).filter((item) => item.key === packKey)

      if (pack) {
        return { mode: 'supabase', pack }
      }
    } else if (supabase) {
      const { data: packs, error: packError } = await supabase
        .from('crm_profile_packs')
        .select('key, label, description, vertical, status, install_mode, metadata')
        .eq('workspace_id', workspaceId)
        .eq('key', packKey)

      if (packError) {
        throw packError
      }

      const { data: fields, error: fieldError } = await supabase
        .from('crm_field_definitions')
        .select('key, label, value_type, required, origin, pack_key, description, help_text, sensitivity_level, pos_visible, cashier_editable, marketing_usable, ui_contexts, enum_values, sort_order, metadata')
        .eq('workspace_id', workspaceId)
        .eq('entity_type', 'person')
        .eq('pack_key', packKey)
        .order('sort_order', { ascending: true })

      if (fieldError) {
        throw fieldError
      }

      const [pack] = composeProfilePacks(
        (packs || []) as Array<Record<string, unknown>>,
        (fields || []) as Array<Record<string, unknown>>
      ).filter((item) => item.key === packKey)

      if (pack) {
        return { mode: 'supabase', pack }
      }
    }

    if (!registeredPack) {
      throw createError({ statusCode: 404, statusMessage: 'Unknown profile pack.' })
    }

    return { mode: 'supabase', pack: cloneProfilePack(registeredPack, false) }
  } catch (error) {
    if (!registeredPack) {
      throw createError({ statusCode: 404, statusMessage: 'Unknown profile pack.' })
    }

    return {
      mode: 'demo',
      warning: error instanceof Error ? error.message : 'Unable to load profile pack.',
      pack: cloneProfilePack(registeredPack)
    }
  }
})
