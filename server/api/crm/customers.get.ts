import { z } from 'zod'
import { demoCrmGraph } from '../../utils/demo-crm'

const querySchema = z.object({
  workspaceId: z.string().uuid().optional(),
  q: z.string().optional().default(''),
  tier: z.string().optional().default(''),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0)
})

type PersonRow = {
  id: string
  label: string
  email: string | null
  phone: string | null
  memberNumber: string | null
  tier: string | null
  pointsBalance: number | null
  totalSpent: number | null
  currency: string
  ordersCount: number | null
  lifecycleStage: string | null
  preferredStore: string | null
  lastVisitAt: string | null
  tags: string[]
  externalIds: Record<string, string>
  attributes: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

function packOf(attributes: Record<string, unknown>, pack: string) {
  const packs = attributes.profile_packs as Record<string, Record<string, unknown>> | undefined
  return packs?.[pack] || {}
}

function mapEntityToPerson(entity: {
  id: string
  label: string
  externalIds?: Record<string, string>
  external_ids?: Record<string, string>
  attributes?: Record<string, unknown>
  tags?: string[]
  createdAt?: string
  created_at?: string
  updatedAt?: string
  updated_at?: string
}): PersonRow {
  const attributes = (entity.attributes || {}) as Record<string, unknown>
  const member = packOf(attributes, 'fran_member')
  const loyalty = packOf(attributes, 'fran_loyalty')
  const externalIds = entity.externalIds || entity.external_ids || {}

  return {
    id: entity.id,
    label: entity.label,
    email: (attributes.email as string) || (member.email as string) || null,
    phone: (attributes.phone as string) || (member.mobile as string) || null,
    memberNumber:
      (member.member_number as string)
      || externalIds.fran_member
      || null,
    tier: (loyalty.tier as string) || (loyalty.tier_key as string) || null,
    pointsBalance: typeof loyalty.points_balance === 'number' ? loyalty.points_balance : null,
    totalSpent: typeof attributes.total_spent === 'number' ? attributes.total_spent : null,
    currency: (attributes.currency as string) || 'SGD',
    ordersCount: typeof attributes.orders_count === 'number' ? attributes.orders_count : null,
    lifecycleStage: (attributes.lifecycle_stage as string) || null,
    preferredStore:
      (attributes.preferred_store as string)
      || (member.preferred_store as string)
      || null,
    lastVisitAt: (attributes.last_visit_at as string) || null,
    tags: entity.tags || [],
    externalIds,
    attributes,
    createdAt: entity.createdAt || entity.created_at || new Date().toISOString(),
    updatedAt: entity.updatedAt || entity.updated_at || new Date().toISOString()
  }
}

function filterPeople(people: PersonRow[], q: string, tier: string) {
  const lower = q.trim().toLowerCase()
  const tierFilter = tier.trim().toUpperCase()

  return people.filter((person) => {
    if (tierFilter && (person.tier || '').toUpperCase() !== tierFilter) return false
    if (!lower) return true
    const hay = [
      person.label,
      person.email,
      person.phone,
      person.memberNumber,
      person.tier,
      person.lifecycleStage,
      person.preferredStore,
      ...person.tags
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return hay.includes(lower)
  })
}

export default defineEventHandler(async (event) => {
  const { workspaceId, q, tier, limit, offset } = querySchema.parse(getQuery(event))
  const supabase = useSupabaseAdmin()
  const sql = useCrmPostgres()

  const empty = {
    mode: 'demo' as const,
    total: 0,
    limit,
    offset,
    customers: [] as PersonRow[]
  }

  // Demo / no workspace: return demo people only
  if ((!supabase && !sql) || !workspaceId) {
    const people = demoCrmGraph.entities
      .filter((entity) => entity.type === 'person')
      .map((entity) => mapEntityToPerson(entity))
    const filtered = filterPeople(people, q, tier)
    return {
      mode: 'demo' as const,
      warning: (supabase || sql) ? 'workspaceId is required for hosted customers.' : undefined,
      total: filtered.length,
      limit,
      offset,
      customers: filtered.slice(offset, offset + limit)
    }
  }

  const { user } = await requireSupabaseUser(event, supabase || undefined)
  await requireWorkspaceMembership(supabase || useSupabaseAuthClient()!, user, workspaceId)

  if (sql) {
    try {
      const hasQuery = Boolean(q && q.trim())
      const searchPattern = `%${(q || '').trim()}%`
      const rows = hasQuery
        ? await sql<Array<{
          id: string
          label: string
          external_ids: Record<string, string>
          attributes: Record<string, unknown>
          tags: string[]
          created_at: string
          updated_at: string
        }>>`
          select id::text, label, external_ids, attributes, tags, created_at, updated_at
          from public.crm_entities
          where workspace_id = ${workspaceId}::uuid
            and type = 'person'
            and (
              label ilike ${searchPattern}
              or search_text ilike ${searchPattern}
              or coalesce(attributes->>'email', '') ilike ${searchPattern}
              or coalesce(attributes->>'phone', '') ilike ${searchPattern}
            )
          order by updated_at desc
          limit ${limit + offset + 50}
        `
        : await sql<Array<{
          id: string
          label: string
          external_ids: Record<string, string>
          attributes: Record<string, unknown>
          tags: string[]
          created_at: string
          updated_at: string
        }>>`
          select id::text, label, external_ids, attributes, tags, created_at, updated_at
          from public.crm_entities
          where workspace_id = ${workspaceId}::uuid
            and type = 'person'
          order by updated_at desc
          limit ${limit + offset + 50}
        `

      const people = rows.map((row) => mapEntityToPerson(row))
      const filtered = filterPeople(people, '', tier) // q already applied in SQL
      return {
        mode: 'supabase' as const,
        total: filtered.length,
        limit,
        offset,
        customers: filtered.slice(offset, offset + limit)
      }
    } catch (error) {
      const people = demoCrmGraph.entities
        .filter((entity) => entity.type === 'person')
        .map((entity) => mapEntityToPerson(entity))
      const filtered = filterPeople(people, q, tier)
      return {
        mode: 'demo' as const,
        warning: error instanceof Error ? error.message : 'Falling back to demo customers.',
        total: filtered.length,
        limit,
        offset,
        customers: filtered.slice(offset, offset + limit)
      }
    }
  }

  if (!supabase) return empty

  let query = supabase
    .from('crm_entities')
    .select('id, label, external_ids, attributes, tags, created_at, updated_at', { count: 'exact' })
    .eq('workspace_id', workspaceId)
    .eq('type', 'person')
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (q) {
    query = query.or(`label.ilike.%${q}%,search_text.ilike.%${q}%`)
  }

  const { data, error, count } = await query

  if (error) {
    const people = demoCrmGraph.entities
      .filter((entity) => entity.type === 'person')
      .map((entity) => mapEntityToPerson(entity))
    const filtered = filterPeople(people, q, tier)
    return {
      mode: 'demo' as const,
      warning: error.message,
      total: filtered.length,
      limit,
      offset,
      customers: filtered.slice(offset, offset + limit)
    }
  }

  const people = (data || []).map((row) => mapEntityToPerson(row))
  const filtered = filterPeople(people, '', tier)

  return {
    mode: 'supabase' as const,
    total: tier ? filtered.length : (count ?? filtered.length),
    limit,
    offset,
    customers: filtered
  }
})
