/**
 * Durable POS → CRM member create / resolve.
 * Writes crm_entities + crm_customer_profiles for workspace-scoped people.
 * Used when Supabase admin or CRM Postgres is configured; else handlers fall back to demo.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Sql } from 'postgres'
import type { CrmEntity } from '../../../app/types/crm'

export type PosRegistration = {
  fullName: string
  phone: string
  birthday?: string | null
  email?: string | null
  preferredStore?: string | null
}

export type RegistryPerson = {
  id: string
  workspaceId: string
  label: string
  memberNumber: string
  phone: string | null
  email: string | null
  entity: CrmEntity
  created: boolean
}

type EntityRow = {
  id: string
  workspace_id: string
  type: string
  label: string
  external_ids: Record<string, string>
  attributes: Record<string, unknown>
  tags: string[]
  source?: string
  created_at: string
  updated_at: string
}

function normalizePhone(value: string) {
  return String(value || '').replace(/[^\d+]/g, '')
}

function digitsOnly(value: string) {
  return String(value || '').replace(/\D/g, '')
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function buildAttributes(input: {
  fullName: string
  phone: string
  birthday?: string | null
  email?: string | null
  memberNumber: string
  preferredStore?: string | null
  pointsBalance?: number
  tier?: string
  ytdSpend?: number
}) {
  const phone = input.phone.trim()
  const email = input.email?.trim() || null
  return {
    email,
    phone,
    accepts_marketing: true,
    total_spent: input.ytdSpend ?? 0,
    currency: 'SGD',
    orders_count: 0,
    lifecycle_stage: 'new',
    last_visit_at: new Date().toISOString(),
    preferred_store: input.preferredStore || null,
    profile_packs: {
      fran_member: {
        member_number: input.memberNumber,
        mobile: phone,
        member_since: todayIsoDate(),
        birthday: input.birthday || null,
        preferred_store: input.preferredStore || null,
        consent_status: 'granted',
      },
      fran_loyalty: {
        tier: input.tier || 'F1',
        tier_key: input.tier || 'F1',
        points_balance: input.pointsBalance ?? 0,
        points_expiring_soon: 0,
        ytd_spend: input.ytdSpend ?? 0,
        calendar_ytd_spend: input.ytdSpend ?? 0,
        next_tier: 'F2',
        spend_to_next_tier: 500,
      },
    },
  }
}

export function entityFromRow(row: EntityRow): CrmEntity {
  return {
    id: row.id,
    type: 'person',
    label: row.label,
    externalIds: row.external_ids || {},
    attributes: row.attributes || {},
    tags: row.tags || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function registryPersonFromRow(row: EntityRow, created: boolean): RegistryPerson {
  const attrs = (row.attributes || {}) as Record<string, any>
  const packs = (attrs.profile_packs || {}) as Record<string, any>
  const member = packs.fran_member || {}
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    label: row.label,
    memberNumber:
      String(member.member_number || row.external_ids?.fran_member || row.id),
    phone: (attrs.phone as string) || (member.mobile as string) || null,
    email: (attrs.email as string) || null,
    entity: entityFromRow(row),
    created,
  }
}

async function generateMemberNumber(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const n = 1000 + Math.floor(Math.random() * 9000)
    const candidate = `FRAN-${n}`
    const { data } = await supabase
      .from('crm_entities')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('type', 'person')
      .contains('external_ids', { fran_member: candidate })
      .maybeSingle()
    if (!data) return candidate
  }
  return `FRAN-${Date.now().toString().slice(-6)}`
}

/** Ensure workspace row exists (POS/SKUMS may link an id before HQ creates UI workspace). */
export async function ensureCrmWorkspace(
  supabase: SupabaseClient,
  workspaceId: string,
  opts: { name?: string; slug?: string } = {},
) {
  const { data: existing } = await supabase
    .from('crm_workspaces')
    .select('id, name, slug')
    .eq('id', workspaceId)
    .maybeSingle()
  if (existing) return existing

  const slug =
    opts.slug
    || `ws-${workspaceId.replace(/-/g, '').slice(0, 10)}`
  const { data, error } = await supabase
    .from('crm_workspaces')
    .insert({
      id: workspaceId,
      name: opts.name || 'Fran CRM workspace',
      slug,
      plan: 'hosted_growth',
      hosting_mode: 'hosted',
    })
    .select('id, name, slug')
    .single()

  if (error) {
    // Race: another request created it
    const { data: again } = await supabase
      .from('crm_workspaces')
      .select('id, name, slug')
      .eq('id', workspaceId)
      .maybeSingle()
    if (again) return again
    throw new Error(`Failed to ensure CRM workspace: ${error.message}`)
  }
  return data
}

export async function findPersonByPhone(
  supabase: SupabaseClient,
  workspaceId: string,
  phone: string,
): Promise<RegistryPerson | null> {
  const digits = digitsOnly(phone)
  if (digits.length < 6) return null

  const { data, error } = await supabase
    .from('crm_entities')
    .select('id, workspace_id, type, label, external_ids, attributes, tags, created_at, updated_at')
    .eq('workspace_id', workspaceId)
    .eq('type', 'person')
    .or(
      `attributes->>phone.ilike.%${digits.slice(-8)}%,search_text.ilike.%${digits.slice(-8)}%`,
    )
    .limit(20)

  if (error) throw new Error(error.message)
  const rows = (data || []) as EntityRow[]
  const match = rows.find((row) => {
    const attrs = row.attributes || {}
    const packs = (attrs.profile_packs || {}) as Record<string, any>
    const candidates = [attrs.phone, packs.fran_member?.mobile]
      .map((p) => digitsOnly(String(p || '')))
      .filter((p) => p.length >= 6)
    return candidates.some(
      (p) => p === digits || p.endsWith(digits) || digits.endsWith(p),
    )
  })
  return match ? registryPersonFromRow(match, false) : null
}

export async function findPersonByMemberNumber(
  supabase: SupabaseClient,
  workspaceId: string,
  memberNumber: string,
): Promise<RegistryPerson | null> {
  const raw = String(memberNumber || '').trim()
  if (!raw) return null
  const compact = raw.replace(/[\s_-]+/g, '').toUpperCase()

  const { data, error } = await supabase
    .from('crm_entities')
    .select('id, workspace_id, type, label, external_ids, attributes, tags, created_at, updated_at')
    .eq('workspace_id', workspaceId)
    .eq('type', 'person')
    .or(
      `external_ids->>fran_member.ilike.%${raw}%,search_text.ilike.%${raw}%,label.ilike.%${raw}%`,
    )
    .limit(20)

  if (error) throw new Error(error.message)
  const rows = (data || []) as EntityRow[]
  const match = rows.find((row) => {
    const attrs = row.attributes || {}
    const packs = (attrs.profile_packs || {}) as Record<string, any>
    const ids = [
      row.external_ids?.fran_member,
      packs.fran_member?.member_number,
      row.id,
    ]
      .map((v) => String(v || '').replace(/[\s_-]+/g, '').toUpperCase())
      .filter(Boolean)
    return ids.includes(compact)
  })
  return match ? registryPersonFromRow(match, false) : null
}

export async function findPersonById(
  supabase: SupabaseClient,
  workspaceId: string,
  personId: string,
): Promise<RegistryPerson | null> {
  if (!/^[0-9a-f-]{36}$/i.test(personId)) return null
  const { data, error } = await supabase
    .from('crm_entities')
    .select('id, workspace_id, type, label, external_ids, attributes, tags, created_at, updated_at')
    .eq('workspace_id', workspaceId)
    .eq('type', 'person')
    .eq('id', personId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return registryPersonFromRow(data as EntityRow, false)
}

/**
 * Register a new member, or return existing match by phone (idempotent).
 */
export async function registerPosMember(
  supabase: SupabaseClient,
  workspaceId: string,
  registration: PosRegistration,
): Promise<RegistryPerson> {
  const fullName = registration.fullName.trim()
  const phone = registration.phone.trim()
  if (!fullName) throw new Error('fullName is required')
  if (!phone || digitsOnly(phone).length < 6) throw new Error('phone is required')

  await ensureCrmWorkspace(supabase, workspaceId, {
    name: 'Fran Demo CRM',
    slug: 'fran-demo-crm',
  })

  const existing = await findPersonByPhone(supabase, workspaceId, phone)
  if (existing) {
    // Optionally refresh name if blank-ish
    return { ...existing, created: false }
  }

  const memberNumber = await generateMemberNumber(supabase, workspaceId)
  const attributes = buildAttributes({
    fullName,
    phone,
    birthday: registration.birthday,
    email: registration.email,
    memberNumber,
    preferredStore: registration.preferredStore || 'Bugis+',
  })

  const { data: entity, error } = await supabase
    .from('crm_entities')
    .insert({
      workspace_id: workspaceId,
      type: 'person',
      label: fullName,
      external_ids: {
        fran_member: memberNumber,
        pos: `pos-${digitsOnly(phone).slice(-8)}`,
      },
      attributes,
      tags: ['F1', 'pos-registered'],
      source: 'fran-pos',
    })
    .select('id, workspace_id, type, label, external_ids, attributes, tags, created_at, updated_at')
    .single()

  if (error) throw new Error(`Failed to create CRM person: ${error.message}`)

  // Best-effort profile projection + external link
  await supabase.from('crm_customer_profiles').upsert(
    {
      workspace_id: workspaceId,
      person_entity_id: entity.id,
      display_name: fullName,
      email: registration.email || null,
      phone,
      consent_summary: { email: 'granted', sms: 'granted', sourceSystem: 'fran-pos' },
      activity_profile: {
        lastTransactionAt: null,
        transactionCountLifetime: 0,
      },
      value_profile: { lifetimeValueMinor: 0, currency: 'SGD' },
      provenance: { sourceSystems: ['fran-pos'], registeredAt: new Date().toISOString() },
      computed_at: new Date().toISOString(),
      sensitivity_level: 'internal',
    },
    { onConflict: 'workspace_id,person_entity_id' },
  )

  await supabase.from('crm_external_links').upsert(
    {
      workspace_id: workspaceId,
      entity_id: entity.id,
      system: 'fran-pos',
      external_id: memberNumber,
      external_ref: { phone, registered_via: 'counter_session' },
    },
    { onConflict: 'workspace_id,system,external_id' },
  ).then(() => {}, () => {})

  await supabase.from('crm_customer_facts').insert({
    workspace_id: workspaceId,
    person_entity_id: entity.id,
    fact_type: 'identity',
    fact_key: 'member.registered',
    value: { member_number: memberNumber, source: 'fran-pos' },
    source_system: 'fran-pos',
    occurred_at: new Date().toISOString(),
    sensitivity_level: 'internal',
  }).then(() => {}, () => {})

  return registryPersonFromRow(entity as EntityRow, true)
}

/**
 * Resolve identifier against durable CRM people for a workspace.
 */
export async function resolvePosMemberFromDb(
  supabase: SupabaseClient,
  workspaceId: string,
  identifier: { type: string; value: string },
): Promise<RegistryPerson[]> {
  const type = String(identifier.type || 'member_number')
  const value = String(identifier.value || '').trim()
  if (!value) return []

  if (type === 'phone' || type === 'mobile') {
    const one = await findPersonByPhone(supabase, workspaceId, value)
    return one ? [one] : []
  }

  if (type === 'member_number' || type === 'qr' || type === 'barcode' || type === 'external_ref') {
    const byMember = await findPersonByMemberNumber(supabase, workspaceId, value)
    if (byMember) return [byMember]
    // phone-shaped member numbers
    if (digitsOnly(value).length >= 8) {
      const byPhone = await findPersonByPhone(supabase, workspaceId, value)
      if (byPhone) return [byPhone]
    }
  }

  // Fallback: free-text search
  const { data, error } = await supabase
    .from('crm_entities')
    .select('id, workspace_id, type, label, external_ids, attributes, tags, created_at, updated_at')
    .eq('workspace_id', workspaceId)
    .eq('type', 'person')
    .or(`label.ilike.%${value}%,search_text.ilike.%${value}%`)
    .limit(10)

  if (error) throw new Error(error.message)
  return ((data || []) as EntityRow[]).map((row) => registryPersonFromRow(row, false))
}

/** True when service role and/or CRM Postgres is configured. */
export function hasDurableCrmBackend() {
  try {
    const admin = typeof useSupabaseAdmin === 'function' ? useSupabaseAdmin() : null
    const sql = typeof useCrmPostgres === 'function' ? useCrmPostgres() : null
    return Boolean(admin || sql)
  } catch {
    return false
  }
}

// ── Postgres path (when service_role key missing but SUPABASE_DB_URL works) ──

export async function ensureCrmWorkspaceSql(
  sql: Sql,
  workspaceId: string,
  opts: { name?: string; slug?: string } = {},
) {
  const rows = await sql<Array<{ id: string; name: string; slug: string }>>`
    insert into public.crm_workspaces (id, name, slug, plan, hosting_mode)
    values (
      ${workspaceId}::uuid,
      ${opts.name || 'Fran CRM workspace'},
      ${opts.slug || `ws-${workspaceId.replace(/-/g, '').slice(0, 10)}`},
      'hosted_growth',
      'hosted'
    )
    on conflict (id) do update set updated_at = now()
    returning id::text, name, slug
  `
  return rows[0]
}

async function generateMemberNumberSql(sql: Sql, workspaceId: string) {
  for (let i = 0; i < 12; i++) {
    const candidate = `FRAN-${1000 + Math.floor(Math.random() * 9000)}`
    const found = await sql`
      select id from public.crm_entities
      where workspace_id = ${workspaceId}::uuid
        and type = 'person'
        and external_ids->>'fran_member' = ${candidate}
      limit 1
    `
    if (!found.length) return candidate
  }
  return `FRAN-${Date.now().toString().slice(-6)}`
}

function rowFromSql(r: any): EntityRow {
  return {
    id: String(r.id),
    workspace_id: String(r.workspace_id),
    type: String(r.type),
    label: String(r.label),
    external_ids: r.external_ids || {},
    attributes: r.attributes || {},
    tags: r.tags || [],
    created_at: r.created_at,
    updated_at: r.updated_at,
  }
}

export async function findPersonByPhoneSql(
  sql: Sql,
  workspaceId: string,
  phone: string,
): Promise<RegistryPerson | null> {
  const digits = digitsOnly(phone)
  if (digits.length < 6) return null
  const tail = digits.slice(-8)
  const rows = await sql`
    select id::text, workspace_id::text, type::text, label, external_ids, attributes, tags, created_at, updated_at
    from public.crm_entities
    where workspace_id = ${workspaceId}::uuid
      and type = 'person'
      and (
        coalesce(attributes->>'phone', '') ilike ${'%' + tail + '%'}
        or search_text ilike ${'%' + tail + '%'}
      )
    limit 20
  `
  for (const r of rows) {
    const row = rowFromSql(r)
    const attrs = row.attributes || {}
    const packs = (attrs.profile_packs || {}) as Record<string, any>
    const candidates = [attrs.phone, packs.fran_member?.mobile]
      .map((p) => digitsOnly(String(p || '')))
      .filter((p) => p.length >= 6)
    if (candidates.some((p) => p === digits || p.endsWith(digits) || digits.endsWith(p))) {
      return registryPersonFromRow(row, false)
    }
  }
  return null
}

export async function findPersonByMemberNumberSql(
  sql: Sql,
  workspaceId: string,
  memberNumber: string,
): Promise<RegistryPerson | null> {
  const raw = String(memberNumber || '').trim()
  if (!raw) return null
  const compact = raw.replace(/[\s_-]+/g, '').toUpperCase()
  const rows = await sql`
    select id::text, workspace_id::text, type::text, label, external_ids, attributes, tags, created_at, updated_at
    from public.crm_entities
    where workspace_id = ${workspaceId}::uuid
      and type = 'person'
      and (
        external_ids->>'fran_member' ilike ${'%' + raw + '%'}
        or search_text ilike ${'%' + raw + '%'}
      )
    limit 20
  `
  for (const r of rows) {
    const row = rowFromSql(r)
    const attrs = row.attributes || {}
    const packs = (attrs.profile_packs || {}) as Record<string, any>
    const ids = [row.external_ids?.fran_member, packs.fran_member?.member_number, row.id]
      .map((v) => String(v || '').replace(/[\s_-]+/g, '').toUpperCase())
      .filter(Boolean)
    if (ids.includes(compact)) return registryPersonFromRow(row, false)
  }
  return null
}

export async function findPersonByIdSql(
  sql: Sql,
  workspaceId: string,
  personId: string,
): Promise<RegistryPerson | null> {
  if (!/^[0-9a-f-]{36}$/i.test(personId)) return null
  const rows = await sql`
    select id::text, workspace_id::text, type::text, label, external_ids, attributes, tags, created_at, updated_at
    from public.crm_entities
    where workspace_id = ${workspaceId}::uuid and type = 'person' and id = ${personId}::uuid
    limit 1
  `
  if (!rows.length) return null
  return registryPersonFromRow(rowFromSql(rows[0]), false)
}

export async function registerPosMemberSql(
  sql: Sql,
  workspaceId: string,
  registration: PosRegistration,
): Promise<RegistryPerson> {
  const fullName = registration.fullName.trim()
  const phone = registration.phone.trim()
  if (!fullName) throw new Error('fullName is required')
  if (!phone || digitsOnly(phone).length < 6) throw new Error('phone is required')

  await ensureCrmWorkspaceSql(sql, workspaceId, {
    name: 'Fran Demo CRM',
    slug: 'fran-demo-crm',
  })

  const existing = await findPersonByPhoneSql(sql, workspaceId, phone)
  if (existing) return { ...existing, created: false }

  const memberNumber = await generateMemberNumberSql(sql, workspaceId)
  const attributes = buildAttributes({
    fullName,
    phone,
    birthday: registration.birthday,
    email: registration.email,
    memberNumber,
    preferredStore: registration.preferredStore || 'Bugis+',
  })
  const externalIds = {
    fran_member: memberNumber,
    pos: `pos-${digitsOnly(phone).slice(-8)}`,
  }

  const tags = ['F1', 'pos-registered']
  const inserted = await sql`
    insert into public.crm_entities (
      workspace_id, type, label, external_ids, attributes, tags, source
    ) values (
      ${workspaceId}::uuid,
      'person',
      ${fullName},
      ${sql.json(externalIds)},
      ${sql.json(attributes)},
      ${tags}::text[],
      'fran-pos'
    )
    returning id::text, workspace_id::text, type::text, label, external_ids, attributes, tags, created_at, updated_at
  `

  const entity = rowFromSql(inserted[0])

  await sql`
    insert into public.crm_customer_profiles (
      workspace_id, person_entity_id, display_name, email, phone,
      consent_summary, activity_profile, value_profile, provenance, computed_at, sensitivity_level
    ) values (
      ${workspaceId}::uuid,
      ${entity.id}::uuid,
      ${fullName},
      ${registration.email || null},
      ${phone},
      ${sql.json({ email: 'granted', sms: 'granted', sourceSystem: 'fran-pos' })},
      ${sql.json({ lastTransactionAt: null, transactionCountLifetime: 0 })},
      ${sql.json({ lifetimeValueMinor: 0, currency: 'SGD' })},
      ${sql.json({ sourceSystems: ['fran-pos'], registeredAt: new Date().toISOString() })},
      now(),
      'internal'
    )
    on conflict (workspace_id, person_entity_id) do update set
      display_name = excluded.display_name,
      phone = excluded.phone,
      computed_at = now()
  `.catch(() => null)

  await sql`
    insert into public.crm_external_links (workspace_id, entity_id, system, external_id, external_ref)
    values (
      ${workspaceId}::uuid,
      ${entity.id}::uuid,
      'fran-pos',
      ${memberNumber},
      ${sql.json({ phone, registered_via: 'counter_session' })}
    )
    on conflict (workspace_id, system, external_id) do nothing
  `.catch(() => null)

  await sql`
    insert into public.crm_customer_facts (
      workspace_id, person_entity_id, fact_type, fact_key, value, source_system, occurred_at, sensitivity_level
    ) values (
      ${workspaceId}::uuid,
      ${entity.id}::uuid,
      'identity',
      'member.registered',
      ${sql.json({ member_number: memberNumber, source: 'fran-pos' })},
      'fran-pos',
      now(),
      'internal'
    )
  `.catch(() => null)

  return registryPersonFromRow(entity, true)
}

export async function resolvePosMemberFromDbSql(
  sql: Sql,
  workspaceId: string,
  identifier: { type: string; value: string },
): Promise<RegistryPerson[]> {
  const type = String(identifier.type || 'member_number')
  const value = String(identifier.value || '').trim()
  if (!value) return []

  if (type === 'phone' || type === 'mobile') {
    const one = await findPersonByPhoneSql(sql, workspaceId, value)
    return one ? [one] : []
  }

  if (type === 'member_number' || type === 'qr' || type === 'barcode' || type === 'external_ref') {
    const byMember = await findPersonByMemberNumberSql(sql, workspaceId, value)
    if (byMember) return [byMember]
    if (digitsOnly(value).length >= 8) {
      const byPhone = await findPersonByPhoneSql(sql, workspaceId, value)
      if (byPhone) return [byPhone]
    }
  }

  const rows = await sql`
    select id::text, workspace_id::text, type::text, label, external_ids, attributes, tags, created_at, updated_at
    from public.crm_entities
    where workspace_id = ${workspaceId}::uuid
      and type = 'person'
      and (label ilike ${'%' + value + '%'} or search_text ilike ${'%' + value + '%'})
    limit 10
  `
  return rows.map((r) => registryPersonFromRow(rowFromSql(r), false))
}

/**
 * Unified entry: prefer Supabase service role, else Postgres URL.
 */
export async function registerPosMemberAuto(
  workspaceId: string,
  registration: PosRegistration,
): Promise<RegistryPerson> {
  const admin = typeof useSupabaseAdmin === 'function' ? useSupabaseAdmin() : null
  if (admin) return registerPosMember(admin, workspaceId, registration)
  const sql = typeof useCrmPostgres === 'function' ? useCrmPostgres() : null
  if (sql) return registerPosMemberSql(sql, workspaceId, registration)
  throw new Error('No durable CRM backend (set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_DB_URL)')
}

export async function resolvePosMemberAuto(
  workspaceId: string,
  identifier: { type: string; value: string },
): Promise<RegistryPerson[]> {
  const admin = typeof useSupabaseAdmin === 'function' ? useSupabaseAdmin() : null
  if (admin) return resolvePosMemberFromDb(admin, workspaceId, identifier)
  const sql = typeof useCrmPostgres === 'function' ? useCrmPostgres() : null
  if (sql) return resolvePosMemberFromDbSql(sql, workspaceId, identifier)
  return []
}

export async function findPersonByIdAuto(
  workspaceId: string,
  personId: string,
): Promise<RegistryPerson | null> {
  const admin = typeof useSupabaseAdmin === 'function' ? useSupabaseAdmin() : null
  if (admin) return findPersonById(admin, workspaceId, personId)
  const sql = typeof useCrmPostgres === 'function' ? useCrmPostgres() : null
  if (sql) return findPersonByIdSql(sql, workspaceId, personId)
  return null
}
