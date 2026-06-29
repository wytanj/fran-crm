import { demoCrmGraph } from '../../utils/demo-crm'
import { graphSearchQuerySchema } from '../../utils/contracts'

export default defineEventHandler(async (event) => {
  const { q, workspaceId } = graphSearchQuerySchema.parse(getQuery(event))
  const supabase = useSupabaseAdmin()
  const sql = useCrmPostgres()

  if (!q && !workspaceId) {
    return { results: demoCrmGraph.entities.slice(0, 6) }
  }

  if ((!supabase && !sql) || !workspaceId) {
    const lower = (q || '').toLowerCase()

    if (!lower) {
      return { results: demoCrmGraph.entities.slice(0, 6) }
    }

    return {
      results: demoCrmGraph.entities.filter((entity) => {
        return entity.label.toLowerCase().includes(lower)
          || entity.tags.some((tag) => tag.toLowerCase().includes(lower))
          || JSON.stringify(entity.attributes).toLowerCase().includes(lower)
      })
    }
  }

  const { user } = await requireSupabaseUser(event, supabase || undefined)
  await requireWorkspaceMembership(supabase || useSupabaseAuthClient()!, user, workspaceId)

  if (sql) {
    const searchPattern = `%${q || ''}%`
    const rows = q
      ? await sql<Array<{
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
          and (label ilike ${searchPattern} or search_text ilike ${searchPattern})
        limit 20
      `
      : await sql<Array<{
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
        limit 20
      `

    return {
      results: rows.map((entity) => ({
        id: entity.id,
        type: entity.type,
        label: entity.label,
        externalIds: entity.external_ids || {},
        attributes: entity.attributes || {},
        tags: entity.tags || [],
        createdAt: entity.created_at,
        updatedAt: entity.updated_at
      }))
    }
  }

  if (!supabase) {
    throw createError({ statusCode: 503, statusMessage: 'Supabase service client is not configured.' })
  }

  let query = supabase
    .from('crm_entities')
    .select('id, type, label, external_ids, attributes, tags, created_at, updated_at')
    .eq('workspace_id', workspaceId)
    .limit(20)

  if (q) {
    query = query.or(`label.ilike.%${q}%,search_text.ilike.%${q}%`)
  }

  const { data, error } = await query

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return {
    results: (data || []).map((entity) => ({
      id: entity.id,
      type: entity.type,
      label: entity.label,
      externalIds: entity.external_ids || {},
      attributes: entity.attributes || {},
      tags: entity.tags || [],
      createdAt: entity.created_at,
      updatedAt: entity.updated_at
    }))
  }
})
