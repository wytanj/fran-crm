import type { SupabaseClient } from '@supabase/supabase-js'
import type { Sql } from 'postgres'
import type { FranTopCustomersToolInput } from './contracts'

export interface FranTopCustomerPurchaseRow {
  personId: string
  name: string
  mobile: string | null
  tier: string | null
  purchaseCount: number
  grossSpendMinor: number
  lastPurchaseAt: string | null
}

export interface FranPurchaseEventInput {
  id: string
  eventType: string
  occurredAt: string
  subject: Record<string, unknown>
  context: Record<string, unknown>
  payload: Record<string, unknown>
}

export interface FranPurchaseMemberInput {
  id: string
  name: string
  mobile?: string | null
  tier?: string | null
}

export interface FranTopCustomerPurchasesResponse {
  mode: 'demo' | 'supabase'
  generatedAt: string
  dateRange: {
    from: string
    to: string
  }
  metric: FranTopCustomersToolInput['metric']
  limit: number
  topCustomers: FranTopCustomerPurchaseRow[]
  chart: {
    type: 'bar'
    unit: 'minor_currency'
    data: Array<{
      personId: string
      label: string
      value: number
    }>
  }
}

export type ResolvedTopCustomersOptions = {
  from: string
  to: string
  limit: number
  metric: FranTopCustomersToolInput['metric']
}

export function resolveTopCustomersOptions(input: FranTopCustomersToolInput, generatedAt = new Date().toISOString()): ResolvedTopCustomersOptions {
  const generatedDate = formatDate(parseDate(generatedAt) || new Date())
  const to = input.to && isIsoDate(input.to) ? input.to : generatedDate
  const defaultFrom = formatDate(addDays(parseIsoDate(to) || new Date(), -4))
  const requestedFrom = input.from && isIsoDate(input.from) ? input.from : defaultFrom
  const from = requestedFrom > to ? to : requestedFrom

  return {
    from,
    to,
    limit: clampInteger(input.limit, 1, 50),
    metric: input.metric
  }
}

export async function loadTopCustomerPurchasesWithSql(
  sql: Sql,
  workspaceId: string,
  input: FranTopCustomersToolInput
): Promise<FranTopCustomerPurchasesResponse> {
  const generatedAt = new Date().toISOString()
  const options = resolveTopCustomersOptions(input, generatedAt)
  const fromIso = `${options.from}T00:00:00.000Z`
  const toExclusiveIso = `${formatDate(addDays(parseIsoDate(options.to) || new Date(), 1))}T00:00:00.000Z`
  const rows = options.metric === 'purchase_count'
    ? await loadRowsWithSql(sql, workspaceId, fromIso, toExclusiveIso, options.limit, 'purchase_count')
    : await loadRowsWithSql(sql, workspaceId, fromIso, toExclusiveIso, options.limit, 'gross_spend')

  return composeTopCustomerPurchases('supabase', generatedAt, options, rows)
}

export async function loadTopCustomerPurchasesWithSupabase(
  supabase: SupabaseClient,
  workspaceId: string,
  input: FranTopCustomersToolInput
): Promise<FranTopCustomerPurchasesResponse> {
  const generatedAt = new Date().toISOString()
  const options = resolveTopCustomersOptions(input, generatedAt)
  const fromIso = `${options.from}T00:00:00.000Z`
  const toExclusiveIso = `${formatDate(addDays(parseIsoDate(options.to) || new Date(), 1))}T00:00:00.000Z`
  const events = await fetchPurchaseEventsWithSupabase(supabase, workspaceId, fromIso, toExclusiveIso)
  const personIds = [...new Set(events.map(extractPersonId).filter((id): id is string => Boolean(id)))]
  const members = await fetchMembersWithSupabase(supabase, workspaceId, personIds)

  return buildTopCustomerPurchasesFromEvents(events, members, options, 'supabase', generatedAt)
}

export function buildTopCustomerPurchasesFromEvents(
  events: FranPurchaseEventInput[],
  members: FranPurchaseMemberInput[],
  options: ResolvedTopCustomersOptions,
  mode: 'demo' | 'supabase' = 'supabase',
  generatedAt = new Date().toISOString()
): FranTopCustomerPurchasesResponse {
  const memberMap = new Map(members.map((member) => [member.id, member]))
  const aggregates = new Map<string, {
    purchaseCount: number
    grossSpendMinor: number
    lastPurchaseAt: string | null
  }>()

  for (const event of events) {
    if (!isTransactionEventType(event.eventType)) {
      continue
    }

    const personId = extractPersonId(event)
    const amountMinor = amountMinorFromPayload(event.payload)

    if (!personId || amountMinor <= 0) {
      continue
    }

    const current = aggregates.get(personId) || {
      purchaseCount: 0,
      grossSpendMinor: 0,
      lastPurchaseAt: null
    }
    current.purchaseCount += 1
    current.grossSpendMinor += amountMinor

    if (!current.lastPurchaseAt || event.occurredAt > current.lastPurchaseAt) {
      current.lastPurchaseAt = event.occurredAt
    }

    aggregates.set(personId, current)
  }

  const rows = Array.from(aggregates.entries()).map(([personId, aggregate]) => {
    const member = memberMap.get(personId)

    return {
      personId,
      name: member?.name || personId,
      mobile: member?.mobile || null,
      tier: member?.tier || null,
      purchaseCount: aggregate.purchaseCount,
      grossSpendMinor: aggregate.grossSpendMinor,
      lastPurchaseAt: aggregate.lastPurchaseAt
    }
  })

  rows.sort((left, right) => {
    if (options.metric === 'purchase_count') {
      return right.purchaseCount - left.purchaseCount
        || right.grossSpendMinor - left.grossSpendMinor
        || left.name.localeCompare(right.name)
    }

    return right.grossSpendMinor - left.grossSpendMinor
      || right.purchaseCount - left.purchaseCount
      || left.name.localeCompare(right.name)
  })

  return composeTopCustomerPurchases(mode, generatedAt, options, rows.slice(0, options.limit))
}

export function redactTopCustomerContact(response: FranTopCustomerPurchasesResponse): FranTopCustomerPurchasesResponse {
  return {
    ...response,
    topCustomers: response.topCustomers.map((row) => ({
      ...row,
      mobile: null
    }))
  }
}

async function loadRowsWithSql(
  sql: Sql,
  workspaceId: string,
  fromIso: string,
  toExclusiveIso: string,
  limit: number,
  orderBy: 'gross_spend' | 'purchase_count'
) {
  const orderSql = orderBy === 'purchase_count'
    ? sql`purchase_count desc, gross_spend_minor desc, name asc`
    : sql`gross_spend_minor desc, purchase_count desc, name asc`

  return await sql<FranTopCustomerPurchaseRow[]>`
    with normalized as (
      select
        nullif(
          regexp_replace(
            coalesce(
              nullif(subject->>'personId', ''),
              nullif(subject->>'person_id', ''),
              nullif(subject->>'crmPersonId', ''),
              nullif(subject->>'crm_person_id', ''),
              nullif(context->>'personId', ''),
              nullif(context->>'person_id', ''),
              nullif(context->>'crmPersonId', ''),
              nullif(context->>'crm_person_id', ''),
              nullif(payload->>'personId', ''),
              nullif(payload->>'person_id', ''),
              nullif(payload->>'crmPersonId', ''),
              nullif(payload->>'crm_person_id', ''),
              nullif(subject->>'customerKey', ''),
              nullif(subject->>'customer_key', ''),
              nullif(context->>'customerKey', ''),
              nullif(context->>'customer_key', ''),
              nullif(payload->>'customerKey', ''),
              nullif(payload->>'customer_key', '')
            ),
            '^crm:',
            ''
          ),
          ''
        ) as person_id,
        occurred_at,
        case
          when coalesce(payload->>'amountMinor', payload->>'amount_minor', payload->>'totalMinor', payload->>'total_minor', payload->>'totalPriceMinor', payload->>'total_price_minor', payload->>'revenueMinor', payload->>'revenue_minor') ~ '^-?[0-9]+(\.[0-9]+)?$'
            then coalesce(payload->>'amountMinor', payload->>'amount_minor', payload->>'totalMinor', payload->>'total_minor', payload->>'totalPriceMinor', payload->>'total_price_minor', payload->>'revenueMinor', payload->>'revenue_minor')::numeric
          when coalesce(payload->>'amount', payload->>'total', payload->>'totalPrice', payload->>'total_price', payload->>'revenue') ~ '^-?[0-9]+(\.[0-9]+)?$'
            then round(coalesce(payload->>'amount', payload->>'total', payload->>'totalPrice', payload->>'total_price', payload->>'revenue')::numeric * 100)
          else 0
        end as amount_minor
      from public.crm_events
      where workspace_id = ${workspaceId}::uuid
        and occurred_at >= ${fromIso}::timestamptz
        and occurred_at < ${toExclusiveIso}::timestamptz
        and event_type in (
          'commerce.transaction.completed',
          'commerce.order.paid',
          'order.completed',
          'order.paid',
          'pos.sale.completed',
          'pos.transaction.completed',
          'shopify.order.paid'
        )
    ),
    spend as (
      select
        person_id,
        count(*)::int as purchase_count,
        coalesce(sum(greatest(amount_minor, 0)), 0)::bigint as gross_spend_minor,
        max(occurred_at)::text as last_purchase_at
      from normalized
      where person_id is not null
        and amount_minor > 0
      group by person_id
    )
    select
      spend.person_id as "personId",
      coalesce(entities.label, spend.person_id) as name,
      nullif(entities.attributes #>> '{profile_packs,fran_member,mobile}', '') as mobile,
      nullif(entities.attributes #>> '{profile_packs,fran_loyalty,tier}', '') as tier,
      spend.purchase_count as "purchaseCount",
      spend.gross_spend_minor as "grossSpendMinor",
      spend.last_purchase_at as "lastPurchaseAt"
    from spend
    left join public.crm_entities entities
      on entities.workspace_id = ${workspaceId}::uuid
      and entities.type = 'person'
      and entities.id::text = spend.person_id
    order by ${orderSql}
    limit ${limit}
  `
}

async function fetchPurchaseEventsWithSupabase(
  supabase: SupabaseClient,
  workspaceId: string,
  fromIso: string,
  toExclusiveIso: string
): Promise<FranPurchaseEventInput[]> {
  const rows: FranPurchaseEventInput[] = []
  const pageSize = 1000
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('crm_events')
      .select('id, event_type, occurred_at, subject, context, payload')
      .eq('workspace_id', workspaceId)
      .gte('occurred_at', fromIso)
      .lt('occurred_at', toExclusiveIso)
      .order('occurred_at', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message })
    }

    rows.push(...(data || []).map((row) => ({
      id: String(row.id || ''),
      eventType: String(row.event_type || ''),
      occurredAt: String(row.occurred_at || new Date().toISOString()),
      subject: toRecord(row.subject),
      context: toRecord(row.context),
      payload: toRecord(row.payload)
    })))

    if (!data || data.length < pageSize) {
      break
    }

    from += pageSize
  }

  return rows
}

async function fetchMembersWithSupabase(
  supabase: SupabaseClient,
  workspaceId: string,
  personIds: string[]
): Promise<FranPurchaseMemberInput[]> {
  const uuidIds = personIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id))

  if (!uuidIds.length) {
    return []
  }

  const { data, error } = await supabase
    .from('crm_entities')
    .select('id, label, attributes')
    .eq('workspace_id', workspaceId)
    .eq('type', 'person')
    .in('id', uuidIds)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return (data || []).map((row) => {
    const attributes = toRecord(row.attributes)
    const profilePacks = toRecord(attributes.profile_packs)
    const memberPack = toRecord(profilePacks.fran_member)
    const loyaltyPack = toRecord(profilePacks.fran_loyalty)

    return {
      id: String(row.id || ''),
      name: typeof row.label === 'string' ? row.label : String(row.id || ''),
      mobile: typeof memberPack.mobile === 'string' ? memberPack.mobile : null,
      tier: typeof loyaltyPack.tier === 'string' ? loyaltyPack.tier : null
    }
  })
}

function composeTopCustomerPurchases(
  mode: 'demo' | 'supabase',
  generatedAt: string,
  options: ResolvedTopCustomersOptions,
  rows: FranTopCustomerPurchaseRow[]
): FranTopCustomerPurchasesResponse {
  return {
    mode,
    generatedAt,
    dateRange: {
      from: options.from,
      to: options.to
    },
    metric: options.metric,
    limit: options.limit,
    topCustomers: rows.map((row) => ({
      ...row,
      purchaseCount: toInteger(row.purchaseCount),
      grossSpendMinor: toInteger(row.grossSpendMinor)
    })),
    chart: {
      type: 'bar',
      unit: 'minor_currency',
      data: rows.map((row) => ({
        personId: row.personId,
        label: row.name,
        value: options.metric === 'purchase_count'
          ? toInteger(row.purchaseCount)
          : toInteger(row.grossSpendMinor)
      }))
    }
  }
}

function isTransactionEventType(eventType: string) {
  return [
    'commerce.transaction.completed',
    'commerce.order.paid',
    'order.completed',
    'order.paid',
    'pos.sale.completed',
    'pos.transaction.completed',
    'shopify.order.paid'
  ].includes(eventType)
}

function extractPersonId(row: FranPurchaseEventInput) {
  return firstString(row.subject, row.context, row.payload, ['personId', 'person_id', 'crmPersonId', 'crm_person_id'])
    || normalizeCustomerKey(firstString(row.subject, row.context, row.payload, ['customerKey', 'customer_key']))
}

function normalizeCustomerKey(value: string | null) {
  return value ? value.replace(/^crm:/, '') : null
}

function firstString(
  first: Record<string, unknown>,
  second: Record<string, unknown>,
  third: Record<string, unknown>,
  keys: string[]
) {
  for (const source of [first, second, third]) {
    for (const key of keys) {
      const value = source[key]

      if (typeof value === 'string' && value.trim()) {
        return value.trim()
      }
    }
  }

  return null
}

function amountMinorFromPayload(payload: Record<string, unknown>) {
  const minor = payloadInteger(payload, [
    'amountMinor',
    'amount_minor',
    'totalMinor',
    'total_minor',
    'totalPriceMinor',
    'total_price_minor',
    'revenueMinor',
    'revenue_minor'
  ])

  if (minor > 0) {
    return minor
  }

  const major = payloadNumber(payload, ['amount', 'total', 'totalPrice', 'total_price', 'revenue'])
  return major > 0 ? Math.round(major * 100) : 0
}

function payloadInteger(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = toInteger(payload[key])

    if (value > 0) {
      return value
    }
  }

  return 0
}

function payloadNumber(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const numeric = Number(payload[key])

    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric
    }
  }

  return 0
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function toInteger(value: unknown) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.round(numeric) : 0
}

function clampInteger(value: unknown, min: number, max: number) {
  return Math.min(max, Math.max(min, toInteger(value)))
}

function parseDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function parseIsoDate(value: string) {
  if (!isIsoDate(value)) {
    return null
  }

  return parseDate(`${value}T00:00:00.000Z`)
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10)
}
