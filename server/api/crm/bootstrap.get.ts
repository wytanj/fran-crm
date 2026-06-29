import { demoCrmGraph } from '../../utils/demo-crm'
import { workspaceScopedQuerySchema } from '../../utils/contracts'
import { composeProfilePacks, mapDbField } from '../../utils/profile-packs'

export default defineEventHandler(async (event) => {
  const { workspaceId } = workspaceScopedQuerySchema.parse(getQuery(event))
  const supabase = useSupabaseAdmin()
  const sql = useCrmPostgres()

  if ((!supabase && !sql) || !workspaceId) {
    return {
      mode: 'demo',
      warning: (supabase || sql) ? 'workspaceId is required for Supabase bootstrap.' : undefined,
      graph: demoCrmGraph
    }
  }

  const { user } = await requireSupabaseUser(event, supabase || undefined)
  const membership = await requireWorkspaceMembership(supabase || useSupabaseAuthClient()!, user, workspaceId)

  if (sql) {
    try {
      const [workspace] = await sql<Array<{
        id: string
        name: string
        slug: string
        plan: string
        hosting_mode: string
        created_at: string
        updated_at: string
      }>>`
        select id::text, name, slug, plan, hosting_mode, created_at, updated_at
        from public.crm_workspaces
        where id = ${workspaceId}::uuid
        limit 1
      `

      const entities = await sql<Array<{
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
        order by updated_at desc
        limit 24
      `

      const relationships = await sql<Array<{
        id: string
        from_entity_id: string
        to_entity_id: string
        type: string
        confidence: string | number
        source: string
      }>>`
        select id::text, from_entity_id::text, to_entity_id::text, type, confidence, source
        from public.crm_relationships
        where workspace_id = ${workspaceId}::uuid
        limit 48
      `

      const fields = await sql<Array<{
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
        enum_values: string[]
        sort_order: number
        metadata: Record<string, unknown>
      }>>`
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
        order by coalesce(pack_key, ''), sort_order asc, created_at asc
      `

      const profilePacks = await sql<Array<Record<string, unknown>>>`
        select key, label, description, vertical, status, install_mode, metadata
        from public.crm_profile_packs
        where workspace_id = ${workspaceId}::uuid
        order by label asc
      `

      const dataSources = await sql<Array<{ label: string, status: string }>>`
        select label, status
        from public.crm_data_sources
        where workspace_id = ${workspaceId}::uuid
        order by label asc
      `

      const proposals = await sql<Array<{
        id: string
        title: string
        rationale: string
        status: 'draft' | 'needs_approval' | 'approved'
      }>>`
        select id::text, title, rationale, status::text as status
        from public.crm_agent_proposals
        where workspace_id = ${workspaceId}::uuid
          and status in ('draft', 'needs_approval', 'approved')
        order by created_at desc
        limit 12
      `

      return {
        mode: 'supabase',
        graph: {
          ...demoCrmGraph,
          workspace: workspace ? {
            id: workspace.id,
            name: workspace.name,
            slug: workspace.slug,
            role: membership.role,
            plan: workspace.plan,
            hostingMode: workspace.hosting_mode,
            createdAt: workspace.created_at,
            updatedAt: workspace.updated_at
          } : undefined,
          metrics: [
            { label: 'Workspace entities', value: String(entities.length), detail: 'Loaded from this workspace boundary' },
            { label: 'Relationships', value: String(relationships.length), detail: 'Typed graph edges in this workspace' },
            { label: 'Field definitions', value: String(fields.length), detail: 'Core, integration, custom, and agent fields' },
            { label: 'Agent proposals', value: String(proposals.length), detail: 'Draft, review, and approved proposals' }
          ],
          entities: entities.map((entity) => ({
            id: entity.id,
            type: entity.type,
            label: entity.label,
            externalIds: entity.external_ids || {},
            attributes: entity.attributes || {},
            tags: entity.tags || [],
            createdAt: entity.created_at,
            updatedAt: entity.updated_at
          })),
          relationships: relationships.map((relationship) => ({
            id: relationship.id,
            fromEntityId: relationship.from_entity_id,
            toEntityId: relationship.to_entity_id,
            type: relationship.type,
            confidence: Number(relationship.confidence),
            source: relationship.source
          })),
          customerFields: fields.length
            ? fields.map((field) => mapDbField(field as Record<string, unknown>))
            : demoCrmGraph.customerFields,
          profilePacks: composeProfilePacks(profilePacks, fields as Array<Record<string, unknown>>),
          integrationBacklog: dataSources.length
            ? dataSources.map((source) => `${source.label}: ${source.status}`)
            : demoCrmGraph.integrationBacklog,
          proposals: proposals.map((proposal) => ({
            id: proposal.id,
            title: proposal.title,
            impact: proposal.rationale,
            status: proposal.status
          }))
        }
      }
    } catch (error) {
      return {
        mode: 'demo',
        warning: error instanceof Error ? error.message : 'Unable to load Supabase workspace data.',
        graph: demoCrmGraph
      }
    }
  }

  if (!supabase) {
    throw createError({ statusCode: 503, statusMessage: 'Supabase service client is not configured.' })
  }

  const { data: entities, error: entityError } = await supabase
    .from('crm_entities')
    .select('id, type, label, external_ids, attributes, tags, created_at, updated_at')
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false })
    .limit(24)

  const { data: relationships, error: relationshipError } = await supabase
    .from('crm_relationships')
    .select('id, from_entity_id, to_entity_id, type, confidence, source')
    .eq('workspace_id', workspaceId)
    .limit(48)

  const { data: workspace, error: workspaceError } = await supabase
    .from('crm_workspaces')
    .select('id, name, slug, plan, hosting_mode, created_at, updated_at')
    .eq('id', workspaceId)
    .single()

  const { data: fields, error: fieldError } = await supabase
    .from('crm_field_definitions')
    .select('id, entity_type, key, label, value_type, required, origin, pack_key, description, help_text, sensitivity_level, pos_visible, cashier_editable, marketing_usable, ui_contexts, enum_values, sort_order, metadata')
    .eq('workspace_id', workspaceId)
    .eq('entity_type', 'person')
    .order('sort_order', { ascending: true })

  const { data: profilePacks, error: profilePackError } = await supabase
    .from('crm_profile_packs')
    .select('key, label, description, vertical, status, install_mode, metadata')
    .eq('workspace_id', workspaceId)
    .order('label', { ascending: true })

  const { data: dataSources, error: dataSourceError } = await supabase
    .from('crm_data_sources')
    .select('key, label, source_type, status')
    .eq('workspace_id', workspaceId)
    .order('label', { ascending: true })

  const { data: proposals, error: proposalError } = await supabase
    .from('crm_agent_proposals')
    .select('id, title, rationale, status')
    .eq('workspace_id', workspaceId)
    .in('status', ['draft', 'needs_approval', 'approved'])
    .order('created_at', { ascending: false })
    .limit(12)

  if (entityError || relationshipError || workspaceError || fieldError || profilePackError || dataSourceError || proposalError) {
    return {
      mode: 'demo',
      warning: entityError?.message || relationshipError?.message || workspaceError?.message || fieldError?.message || profilePackError?.message || dataSourceError?.message || proposalError?.message,
      graph: demoCrmGraph
    }
  }

  return {
    mode: 'supabase',
    graph: {
      ...demoCrmGraph,
      workspace: workspace ? {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        role: membership.role,
        plan: workspace.plan,
        hostingMode: workspace.hosting_mode,
        createdAt: workspace.created_at,
        updatedAt: workspace.updated_at
      } : undefined,
      metrics: [
        {
          label: 'Workspace entities',
          value: String(entities?.length || 0),
          detail: 'Loaded from this workspace boundary'
        },
        {
          label: 'Relationships',
          value: String(relationships?.length || 0),
          detail: 'Typed graph edges in this workspace'
        },
        {
          label: 'Field definitions',
          value: String(fields?.length || 0),
          detail: 'Core, integration, custom, and agent fields'
        },
        {
          label: 'Agent proposals',
          value: String(proposals?.length || 0),
          detail: 'Draft, review, and approved proposals'
        }
      ],
      entities: (entities || []).map((entity) => ({
        id: entity.id,
        type: entity.type,
        label: entity.label,
        externalIds: entity.external_ids || {},
        attributes: entity.attributes || {},
        tags: entity.tags || [],
        createdAt: entity.created_at,
        updatedAt: entity.updated_at
      })),
      relationships: (relationships || []).map((relationship) => ({
        id: relationship.id,
        fromEntityId: relationship.from_entity_id,
        toEntityId: relationship.to_entity_id,
        type: relationship.type,
        confidence: relationship.confidence,
        source: relationship.source
      })),
      customerFields: fields?.length
        ? fields.map((field) => mapDbField(field as Record<string, unknown>))
        : demoCrmGraph.customerFields,
      profilePacks: composeProfilePacks(
        (profilePacks || []) as Array<Record<string, unknown>>,
        (fields || []) as Array<Record<string, unknown>>
      ),
      integrationBacklog: dataSources?.length
        ? dataSources.map((source) => `${source.label}: ${source.status}`)
        : demoCrmGraph.integrationBacklog,
      proposals: (proposals || []).map((proposal) => ({
        id: proposal.id,
        title: proposal.title,
        impact: proposal.rationale,
        status: proposal.status
      }))
    }
  }
})
