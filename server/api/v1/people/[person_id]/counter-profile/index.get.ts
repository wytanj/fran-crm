import { workspaceScopedQuerySchema } from '../../../../../utils/contracts'
import { demoCrmGraph } from '../../../../../utils/demo-crm'
import { composeProfilePacks, createCounterProfile } from '../../../../../utils/profile-packs'
import type { CrmEntity } from '../../../../../../app/types/crm'

export default defineEventHandler(async (event) => {
  const personId = getRouterParam(event, 'person_id')
  const { workspaceId } = workspaceScopedQuerySchema.parse(getQuery(event))
  const supabase = useSupabaseAdmin()
  const sql = useCrmPostgres()

  if ((!supabase && !sql) || !workspaceId || !personId || !/^[0-9a-f-]{36}$/i.test(personId)) {
    const demoPerson = demoCrmGraph.entities.find((entity) => entity.id === 'person_001') || demoCrmGraph.entities[0]!

    return {
      mode: 'demo',
      counterProfile: createCounterProfile(demoPerson, demoCrmGraph.profilePacks),
      provenance: {
        sourceSystems: ['crm_ui', 'pos'],
        updatedAt: '2026-06-24T00:00:00.000Z'
      }
    }
  }

  const { user } = await requireSupabaseUser(event, supabase || undefined)
  await requireWorkspaceMembership(supabase || useSupabaseAuthClient()!, user, workspaceId)

  try {
    if (sql) {
      const [entity] = await sql<Array<{
        id: string
        type: string
        label: string
        external_ids: Record<string, string>
        attributes: Record<string, unknown>
        tags: string[]
        created_at: string
        updated_at: string
      }>>`
        select id::text, type::text, label, external_ids, attributes, tags, created_at, updated_at
        from public.crm_entities
        where workspace_id = ${workspaceId}::uuid
          and id = ${personId}::uuid
          and type = 'person'
        limit 1
      `

      if (!entity) {
        throw createError({ statusCode: 404, statusMessage: 'Person not found in this workspace.' })
      }

      const packs = await sql<Array<Record<string, unknown>>>`
        select key, label, description, vertical, status, install_mode, metadata
        from public.crm_profile_packs
        where workspace_id = ${workspaceId}::uuid
          and status = 'active'
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
          and pos_visible = true
        order by pack_key asc, sort_order asc
      `

      const facts = await sql<Array<{ source_system: string, occurred_at: string }>>`
        select distinct on (source_system) source_system, occurred_at
        from public.crm_customer_facts
        where workspace_id = ${workspaceId}::uuid
          and person_entity_id = ${personId}::uuid
          and fact_type = 'customer_profile'
        order by source_system, occurred_at desc
      `

      return {
        mode: 'supabase',
        counterProfile: createCounterProfile(toCrmEntity(entity), composeProfilePacks(packs, fields).filter((pack) => pack.installed)),
        provenance: {
          sourceSystems: facts.map((fact) => fact.source_system),
          updatedAt: facts.map((fact) => fact.occurred_at).sort().at(-1) || entity.updated_at
        }
      }
    }

    if (!supabase) {
      throw createError({ statusCode: 503, statusMessage: 'Supabase service client is not configured.' })
    }

    const { data: entity, error: entityError } = await supabase
      .from('crm_entities')
      .select('id, type, label, external_ids, attributes, tags, created_at, updated_at')
      .eq('workspace_id', workspaceId)
      .eq('id', personId)
      .eq('type', 'person')
      .single()

    if (entityError) {
      throw createError({ statusCode: 404, statusMessage: entityError.message })
    }

    const { data: packs, error: packError } = await supabase
      .from('crm_profile_packs')
      .select('key, label, description, vertical, status, install_mode, metadata')
      .eq('workspace_id', workspaceId)
      .eq('status', 'active')
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
      .eq('pos_visible', true)
      .order('sort_order', { ascending: true })

    if (fieldError) {
      throw fieldError
    }

    const { data: facts } = await supabase
      .from('crm_customer_facts')
      .select('source_system, occurred_at')
      .eq('workspace_id', workspaceId)
      .eq('person_entity_id', personId)
      .eq('fact_type', 'customer_profile')
      .order('occurred_at', { ascending: false })
      .limit(20)

    return {
      mode: 'supabase',
      counterProfile: createCounterProfile(
        toCrmEntity(entity as Record<string, unknown>),
        composeProfilePacks(
          (packs || []) as Array<Record<string, unknown>>,
          (fields || []) as Array<Record<string, unknown>>
        ).filter((pack) => pack.installed)
      ),
      provenance: {
        sourceSystems: Array.from(new Set((facts || []).map((fact) => fact.source_system))),
        updatedAt: facts?.[0]?.occurred_at || entity.updated_at
      }
    }
  } catch (error) {
    const demoPerson = demoCrmGraph.entities.find((entity) => entity.id === 'person_001') || demoCrmGraph.entities[0]!

    return {
      mode: 'demo',
      warning: error instanceof Error ? error.message : 'Unable to load counter profile.',
      counterProfile: createCounterProfile(demoPerson, demoCrmGraph.profilePacks),
      provenance: {
        sourceSystems: ['crm_ui', 'pos'],
        updatedAt: '2026-06-24T00:00:00.000Z'
      }
    }
  }
})

function toCrmEntity(entity: Record<string, unknown>): CrmEntity {
  return {
    id: String(entity.id),
    type: 'person',
    label: String(entity.label),
    externalIds: (entity.external_ids || {}) as Record<string, string>,
    attributes: (entity.attributes || {}) as Record<string, unknown>,
    tags: Array.isArray(entity.tags) ? entity.tags.map(String) : [],
    createdAt: String(entity.created_at),
    updatedAt: String(entity.updated_at)
  }
}
