import { workspaceScopedQuerySchema } from '../../utils/contracts'
import { cloneProfilePack, composeProfilePacks, profilePackDefinitions } from '../../utils/profile-packs'

export default defineEventHandler(async (event) => {
  const { workspaceId } = workspaceScopedQuerySchema.parse(getQuery(event))
  const supabase = useSupabaseAdmin()
  const sql = useCrmPostgres()

  if ((!supabase && !sql) || !workspaceId) {
    return {
      mode: 'demo',
      packs: profilePackDefinitions.map((pack) => cloneProfilePack(pack))
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
        order by label asc
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
          and pack_key is not null
        order by pack_key asc, sort_order asc, created_at asc
      `

      return { mode: 'supabase', packs: composeProfilePacks(packs, fields) }
    }

    if (!supabase) {
      throw createError({ statusCode: 503, statusMessage: 'Supabase service client is not configured.' })
    }

    const { data: packs, error: packError } = await supabase
      .from('crm_profile_packs')
      .select('key, label, description, vertical, status, install_mode, metadata')
      .eq('workspace_id', workspaceId)
      .order('label', { ascending: true })

    if (packError) {
      throw packError
    }

    const { data: fields, error: fieldError } = await supabase
      .from('crm_field_definitions')
      .select('key, label, value_type, required, origin, pack_key, description, help_text, sensitivity_level, pos_visible, cashier_editable, marketing_usable, ui_contexts, enum_values, sort_order, metadata')
      .eq('workspace_id', workspaceId)
      .eq('entity_type', 'person')
      .not('pack_key', 'is', null)
      .order('sort_order', { ascending: true })

    if (fieldError) {
      throw fieldError
    }

    return {
      mode: 'supabase',
      packs: composeProfilePacks(
        (packs || []) as Array<Record<string, unknown>>,
        (fields || []) as Array<Record<string, unknown>>
      )
    }
  } catch (error) {
    return {
      mode: 'demo',
      warning: error instanceof Error ? error.message : 'Unable to load profile packs.',
      packs: profilePackDefinitions.map((pack) => cloneProfilePack(pack))
    }
  }
})
