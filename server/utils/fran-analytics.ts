import type { SupabaseClient } from '@supabase/supabase-js'
import type { Sql } from 'postgres'
import type {
  FranAnalyticsDateRange,
  FranAnalyticsResponse,
  FranBirthdayMemberRow,
  FranCampaignPerformanceRow,
  FranCustomerAnalytics,
  FranCustomerLifecycleRow,
  FranCustomerSpendRow,
  FranEvaluationCycleAnalytics,
  FranLoyaltyPointsAnalytics,
  FranLoyaltyPointsTrendPoint,
  FranMemberTier,
  FranSignupBucket,
  FranSignupTrendPoint,
  FranTierTrendPoint
} from '../../app/types/crm'

export const franAnalyticsTiers: FranMemberTier[] = ['Bronze', 'Silver', 'Gold']

export interface FranAnalyticsMemberRow {
  id: string
  name?: string | null
  mobile?: string | null
  birthday?: string | null
  tier: string | null
  memberSince: string | null
  createdAt: string
  pointsBalance?: number | string | null
  pointsExpiringSoon?: number | string | null
  pointsExpiryDate?: string | null
}

interface SnapshotAggregateRow {
  tier: string | null
  count: number | string
}

interface SignupAggregateRow {
  period: string
  count: number | string
}

export interface EvaluationCycleRow {
  id: string
  cycleKey: string
  label: string
  evaluatedAt: string
  memberCount: number | string
  bronzeCount: number | string
  silverCount: number | string
  goldCount: number | string
  upgradedCount: number | string
  downgradedCount: number | string
  retainedCount: number | string
  source: string
}

export interface LoyaltyPointEventRow {
  id: string
  occurredAt: string
  issued: number | string
  redeemed: number | string
}

interface LoyaltyPointAggregateRow {
  period: string
  issued: number | string
  redeemed: number | string
}

interface LoyaltyLiabilityAggregateRow {
  outstandingPoints: number | string
  expiringPoints: number | string
  expiringMemberCount: number | string
  nextExpiryDate: string | null
}

export interface FranAnalyticsOptions {
  from?: string
  to?: string
  pointValueMinor?: number
  expiryWindowDays?: number
  topLimit?: number
  atRiskDays?: number
  lapsedFromDays?: number
  lapsedToDays?: number
}

interface ResolvedFranAnalyticsOptions {
  dateRange: FranAnalyticsDateRange
  pointValueMinor: number
  expiryWindowDays: number
  topLimit: number
  atRiskDays: number
  lapsedFromDays: number
  lapsedToDays: number
}

interface AnalyticsEventRow {
  id: string
  eventType: string
  occurredAt: string
  subject: Record<string, unknown>
  context: Record<string, unknown>
  payload: Record<string, unknown>
}

interface CommerceTransactionEventRow {
  id: string
  personId: string | null
  occurredAt: string
  amountMinor: number | string
  campaignId?: string | null
  campaignName?: string | null
}

interface CampaignEventRow {
  id: string
  campaignId: string | null
  campaignName: string | null
  eventType: string
  occurredAt: string
  personId: string | null
  membersReached: number | string
  transactions: number | string
  pointsAwarded: number | string
  revenueMinor: number | string
  startDate: string | null
  endDate: string | null
}

type AnalyticsAggregateInput = {
  mode: 'demo' | 'supabase'
  generatedAt?: string
  warning?: string
  snapshotRows: SnapshotAggregateRow[]
  signupRows: Record<FranSignupBucket, SignupAggregateRow[]>
  cycleRows: EvaluationCycleRow[]
  loyaltyPointRows: LoyaltyPointAggregateRow[]
  liabilityRow: LoyaltyLiabilityAggregateRow
  members: FranAnalyticsMemberRow[]
  transactionRows: CommerceTransactionEventRow[]
  campaignRows: CampaignEventRow[]
  analyticsOptions?: FranAnalyticsOptions
}

export function normalizeFranTier(value: unknown): FranMemberTier | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim().toLowerCase()

  if (normalized === 'bronze') {
    return 'Bronze'
  }

  if (normalized === 'silver') {
    return 'Silver'
  }

  if (normalized === 'gold') {
    return 'Gold'
  }

  return null
}

export function buildFranAnalyticsFromMembers(
  members: FranAnalyticsMemberRow[],
  cycleRows: EvaluationCycleRow[] = [],
  mode: 'demo' | 'supabase' = 'supabase',
  generatedAt = new Date().toISOString(),
  warning?: string,
  analyticsOptions?: FranAnalyticsOptions,
  pointEvents: LoyaltyPointEventRow[] = [],
  transactionRows: CommerceTransactionEventRow[] = [],
  campaignRows: CampaignEventRow[] = []
): FranAnalyticsResponse {
  const resolvedOptions = resolveAnalyticsOptions(analyticsOptions, generatedAt)
  const snapshotMap = new Map<string | null, number>()
  const signupMap: Record<FranSignupBucket, Map<string, number>> = {
    day: new Map(),
    week: new Map(),
    month: new Map()
  }

  for (const member of members) {
    const tier = normalizeFranTier(member.tier)
    snapshotMap.set(tier, (snapshotMap.get(tier) || 0) + 1)

    const signupDate = parseMemberDate(member.memberSince, member.createdAt)

    if (!signupDate) {
      continue
    }

    for (const bucket of Object.keys(signupMap) as FranSignupBucket[]) {
      const key = periodKey(signupDate, bucket)
      signupMap[bucket].set(key, (signupMap[bucket].get(key) || 0) + 1)
    }
  }

  return composeFranAnalytics({
    mode,
    generatedAt,
    warning,
    snapshotRows: Array.from(snapshotMap.entries()).map(([tier, count]) => ({ tier, count })),
    signupRows: {
      day: mapToSignupRows(signupMap.day),
      week: mapToSignupRows(signupMap.week),
      month: mapToSignupRows(signupMap.month)
    },
    cycleRows,
    loyaltyPointRows: aggregatePointEvents(pointEvents, resolvedOptions.dateRange),
    liabilityRow: buildLiabilityFromMembers(members, resolvedOptions),
    members,
    transactionRows,
    campaignRows,
    analyticsOptions: {
      from: resolvedOptions.dateRange.from,
      to: resolvedOptions.dateRange.to,
      pointValueMinor: resolvedOptions.pointValueMinor,
      expiryWindowDays: resolvedOptions.expiryWindowDays,
      topLimit: resolvedOptions.topLimit,
      atRiskDays: resolvedOptions.atRiskDays,
      lapsedFromDays: resolvedOptions.lapsedFromDays,
      lapsedToDays: resolvedOptions.lapsedToDays
    }
  })
}

function composeFranAnalytics(input: AnalyticsAggregateInput): FranAnalyticsResponse {
  const generatedAt = input.generatedAt || new Date().toISOString()
  const analyticsOptions = resolveAnalyticsOptions(input.analyticsOptions, generatedAt)
  const snapshotCounts = {
    Bronze: 0,
    Silver: 0,
    Gold: 0
  } satisfies Record<FranMemberTier, number>
  let unassignedCount = 0

  for (const row of input.snapshotRows) {
    const count = toInteger(row.count)
    const tier = normalizeFranTier(row.tier)

    if (tier) {
      snapshotCounts[tier] += count
    } else {
      unassignedCount += count
    }
  }

  const totalMembers = franAnalyticsTiers.reduce((sum, tier) => sum + snapshotCounts[tier], unassignedCount)
  const tierCounts = franAnalyticsTiers.map((tier) => ({
    tier,
    count: snapshotCounts[tier],
    share: totalMembers > 0 ? snapshotCounts[tier] / totalMembers : 0
  }))

  const evaluationCycles = normalizeCycleRows(input.cycleRows)
  const currentTrendPoint = buildCurrentTrendPoint(generatedAt, snapshotCounts, totalMembers, input.mode)
  const cycleTrend = evaluationCycles.map(cycleToTrendPoint)
  const tierTrend = appendCurrentSnapshotTrend(cycleTrend, currentTrendPoint)
  const loyaltyPoints = buildLoyaltyPointsAnalytics(input.loyaltyPointRows, input.liabilityRow, analyticsOptions)
  const customerAnalytics = buildCustomerAnalytics(
    input.members,
    input.transactionRows,
    input.campaignRows,
    analyticsOptions,
    generatedAt
  )

  return {
    mode: input.mode,
    warning: input.warning,
    generatedAt,
    snapshot: {
      asOf: generatedAt,
      totalMembers,
      unassignedCount,
      tierCounts
    },
    tierTrend,
    signupTrends: {
      day: buildSignupTrend(input.signupRows.day, 'day'),
      week: buildSignupTrend(input.signupRows.week, 'week'),
      month: buildSignupTrend(input.signupRows.month, 'month')
    },
    evaluationCycles,
    loyaltyPoints,
    customerAnalytics
  }
}

export async function loadFranAnalyticsWithSql(
  sql: Sql,
  workspaceId: string,
  analyticsOptions?: FranAnalyticsOptions
): Promise<FranAnalyticsResponse> {
  const generatedAt = new Date().toISOString()
  const resolvedOptions = resolveAnalyticsOptions(analyticsOptions, generatedAt)
  const [members, snapshotRows, dayRows, weekRows, monthRows, cycleResult, loyaltyPointRows, liabilityRow, activityRows] = await Promise.all([
    loadMemberRowsWithSql(sql, workspaceId),
    loadSnapshotRowsWithSql(sql, workspaceId),
    loadSignupRowsWithSql(sql, workspaceId, 'day'),
    loadSignupRowsWithSql(sql, workspaceId, 'week'),
    loadSignupRowsWithSql(sql, workspaceId, 'month'),
    loadEvaluationCyclesWithSql(sql, workspaceId),
    loadLoyaltyPointRowsWithSql(sql, workspaceId, resolvedOptions),
    loadLoyaltyLiabilityWithSql(sql, workspaceId, resolvedOptions),
    loadAnalyticsEventRowsWithSql(sql, workspaceId)
  ])
  const activity = buildActivityRows(activityRows)

  return composeFranAnalytics({
    mode: 'supabase',
    generatedAt,
    warning: cycleResult.warning,
    snapshotRows,
    signupRows: {
      day: dayRows,
      week: weekRows,
      month: monthRows
    },
    cycleRows: cycleResult.rows,
    loyaltyPointRows,
    liabilityRow,
    members,
    transactionRows: activity.transactionRows,
    campaignRows: activity.campaignRows,
    analyticsOptions: {
      from: resolvedOptions.dateRange.from,
      to: resolvedOptions.dateRange.to,
      pointValueMinor: resolvedOptions.pointValueMinor,
      expiryWindowDays: resolvedOptions.expiryWindowDays,
      topLimit: resolvedOptions.topLimit,
      atRiskDays: resolvedOptions.atRiskDays,
      lapsedFromDays: resolvedOptions.lapsedFromDays,
      lapsedToDays: resolvedOptions.lapsedToDays
    }
  })
}

export async function loadFranAnalyticsWithSupabase(
  supabase: SupabaseClient,
  workspaceId: string,
  analyticsOptions?: FranAnalyticsOptions
): Promise<FranAnalyticsResponse> {
  const generatedAt = new Date().toISOString()
  const resolvedOptions = resolveAnalyticsOptions(analyticsOptions, generatedAt)
  const [members, cycleResult, pointEvents, activityRows] = await Promise.all([
    fetchMemberRowsWithSupabase(supabase, workspaceId),
    fetchEvaluationCyclesWithSupabase(supabase, workspaceId),
    fetchLoyaltyPointEventsWithSupabase(supabase, workspaceId, resolvedOptions),
    fetchAnalyticsEventRowsWithSupabase(supabase, workspaceId)
  ])
  const activity = buildActivityRows(activityRows)

  return buildFranAnalyticsFromMembers(
    members,
    cycleResult.rows,
    'supabase',
    generatedAt,
    cycleResult.warning,
    {
      from: resolvedOptions.dateRange.from,
      to: resolvedOptions.dateRange.to,
      pointValueMinor: resolvedOptions.pointValueMinor,
      expiryWindowDays: resolvedOptions.expiryWindowDays,
      topLimit: resolvedOptions.topLimit,
      atRiskDays: resolvedOptions.atRiskDays,
      lapsedFromDays: resolvedOptions.lapsedFromDays,
      lapsedToDays: resolvedOptions.lapsedToDays
    },
    pointEvents,
    activity.transactionRows,
    activity.campaignRows
  )
}

export function demoFranAnalytics(
  generatedAt = new Date().toISOString(),
  analyticsOptions?: FranAnalyticsOptions
): FranAnalyticsResponse {
  return buildFranAnalyticsFromMembers([
    { id: 'person_001', name: 'Ava Tan', mobile: '+65 8123 4470', birthday: '1992-07-12', tier: 'Gold', memberSince: '2026-01-04', createdAt: '2026-01-04T03:20:00.000Z', pointsBalance: 18420, pointsExpiringSoon: 1200, pointsExpiryDate: '2026-08-31' },
    { id: 'person_002', name: 'Maya Lim', mobile: '+65 8222 1140', birthday: '1988-01-30', tier: 'Gold', memberSince: '2026-01-12', createdAt: '2026-01-12T04:10:00.000Z', pointsBalance: 12600, pointsExpiringSoon: 0, pointsExpiryDate: null },
    { id: 'person_003', name: 'Chloe Wong', mobile: '+65 8333 2188', birthday: '1995-07-02', tier: 'Silver', memberSince: '2026-02-02', createdAt: '2026-02-02T05:00:00.000Z', pointsBalance: 7350, pointsExpiringSoon: 600, pointsExpiryDate: '2026-07-28' },
    { id: 'person_004', name: 'Nur Aisyah', mobile: '+65 8444 9182', birthday: '1990-03-15', tier: 'Bronze', memberSince: '2026-02-14', createdAt: '2026-02-14T05:00:00.000Z', pointsBalance: 2450, pointsExpiringSoon: 300, pointsExpiryDate: '2026-07-18' },
    { id: 'person_005', name: 'Grace Lee', mobile: '+65 8555 4419', birthday: '1985-11-20', tier: 'Silver', memberSince: '2026-03-03', createdAt: '2026-03-03T06:15:00.000Z', pointsBalance: 6800, pointsExpiringSoon: 0, pointsExpiryDate: null },
    { id: 'person_006', name: 'Siti Rahman', mobile: '+65 8666 9120', birthday: '1997-04-06', tier: 'Bronze', memberSince: '2026-03-16', createdAt: '2026-03-16T06:15:00.000Z', pointsBalance: 1900, pointsExpiringSoon: 200, pointsExpiryDate: '2026-07-24' },
    { id: 'person_007', name: 'Olivia Chua', mobile: '+65 8777 3044', birthday: '1989-12-08', tier: 'Gold', memberSince: '2026-04-08', createdAt: '2026-04-08T07:30:00.000Z', pointsBalance: 15300, pointsExpiringSoon: 0, pointsExpiryDate: null },
    { id: 'person_008', name: 'Hui Min', mobile: '+65 8888 7620', birthday: '1993-07-25', tier: 'Silver', memberSince: '2026-04-18', createdAt: '2026-04-18T07:30:00.000Z', pointsBalance: 5400, pointsExpiringSoon: 400, pointsExpiryDate: '2026-08-02' },
    { id: 'person_009', name: 'Priya Nair', mobile: '+65 8999 1818', birthday: '1994-02-11', tier: 'Bronze', memberSince: '2026-05-04', createdAt: '2026-05-04T08:45:00.000Z', pointsBalance: 1600, pointsExpiringSoon: 0, pointsExpiryDate: null },
    { id: 'person_010', name: 'Rachel Goh', mobile: '+65 8111 4477', birthday: '1991-08-14', tier: 'Silver', memberSince: '2026-05-17', createdAt: '2026-05-17T08:45:00.000Z', pointsBalance: 4900, pointsExpiringSoon: 0, pointsExpiryDate: null },
    { id: 'person_011', name: 'Mei Chen', mobile: '+65 8122 0091', birthday: '1987-07-31', tier: 'Gold', memberSince: '2026-06-02', createdAt: '2026-06-02T09:10:00.000Z', pointsBalance: 9900, pointsExpiringSoon: 500, pointsExpiryDate: '2026-07-21' },
    { id: 'person_012', name: 'Jade Koh', mobile: '+65 8133 5018', birthday: '1996-10-03', tier: 'Gold', memberSince: '2026-06-19', createdAt: '2026-06-19T09:10:00.000Z', pointsBalance: 8200, pointsExpiringSoon: 0, pointsExpiryDate: null }
  ], [
    {
      id: 'cycle_demo_2026_03',
      cycleKey: '2026-03',
      label: 'March 2026',
      evaluatedAt: '2026-03-31T23:59:00.000Z',
      memberCount: 6,
      bronzeCount: 2,
      silverCount: 2,
      goldCount: 2,
      upgradedCount: 2,
      downgradedCount: 0,
      retainedCount: 4,
      source: 'demo_loyalty_evaluator'
    },
    {
      id: 'cycle_demo_2026_04',
      cycleKey: '2026-04',
      label: 'April 2026',
      evaluatedAt: '2026-04-30T23:59:00.000Z',
      memberCount: 8,
      bronzeCount: 2,
      silverCount: 3,
      goldCount: 3,
      upgradedCount: 3,
      downgradedCount: 1,
      retainedCount: 4,
      source: 'demo_loyalty_evaluator'
    },
    {
      id: 'cycle_demo_2026_05',
      cycleKey: '2026-05',
      label: 'May 2026',
      evaluatedAt: '2026-05-31T23:59:00.000Z',
      memberCount: 10,
      bronzeCount: 3,
      silverCount: 4,
      goldCount: 3,
      upgradedCount: 2,
      downgradedCount: 1,
      retainedCount: 7,
      source: 'demo_loyalty_evaluator'
    }
  ], 'demo', generatedAt, undefined, analyticsOptions, [
    { id: 'points_demo_001', occurredAt: '2026-06-02T04:00:00.000Z', issued: 2200, redeemed: 0 },
    { id: 'points_demo_002', occurredAt: '2026-06-06T05:30:00.000Z', issued: 1800, redeemed: 450 },
    { id: 'points_demo_003', occurredAt: '2026-06-13T07:10:00.000Z', issued: 2600, redeemed: 0 },
    { id: 'points_demo_004', occurredAt: '2026-06-18T09:40:00.000Z', issued: 1200, redeemed: 900 },
    { id: 'points_demo_005', occurredAt: '2026-06-24T10:15:00.000Z', issued: 3100, redeemed: 500 },
    { id: 'points_demo_006', occurredAt: '2026-06-29T11:25:00.000Z', issued: 1500, redeemed: 300 }
  ], [
    { id: 'txn_demo_001', personId: 'person_001', occurredAt: '2026-06-28T10:18:00.000Z', amountMinor: 42800, campaignId: 'campaign_glow_june', campaignName: 'June Glow Edit' },
    { id: 'txn_demo_002', personId: 'person_001', occurredAt: '2026-05-18T10:18:00.000Z', amountMinor: 21600 },
    { id: 'txn_demo_003', personId: 'person_002', occurredAt: '2026-04-18T10:18:00.000Z', amountMinor: 35200 },
    { id: 'txn_demo_004', personId: 'person_002', occurredAt: '2025-11-18T10:18:00.000Z', amountMinor: 48900 },
    { id: 'txn_demo_005', personId: 'person_003', occurredAt: '2026-05-03T10:18:00.000Z', amountMinor: 18800, campaignId: 'campaign_skin_reset', campaignName: 'Skin Reset Week' },
    { id: 'txn_demo_006', personId: 'person_004', occurredAt: '2026-04-01T10:18:00.000Z', amountMinor: 9200 },
    { id: 'txn_demo_007', personId: 'person_005', occurredAt: '2026-03-12T10:18:00.000Z', amountMinor: 24100 },
    { id: 'txn_demo_008', personId: 'person_006', occurredAt: '2026-01-21T10:18:00.000Z', amountMinor: 7800 },
    { id: 'txn_demo_009', personId: 'person_007', occurredAt: '2026-06-16T10:18:00.000Z', amountMinor: 52000, campaignId: 'campaign_glow_june', campaignName: 'June Glow Edit' },
    { id: 'txn_demo_010', personId: 'person_008', occurredAt: '2026-06-03T10:18:00.000Z', amountMinor: 16600 },
    { id: 'txn_demo_011', personId: 'person_009', occurredAt: '2026-04-20T10:18:00.000Z', amountMinor: 6400 },
    { id: 'txn_demo_012', personId: 'person_010', occurredAt: '2025-12-10T10:18:00.000Z', amountMinor: 14500 },
    { id: 'txn_demo_013', personId: 'person_011', occurredAt: '2026-06-24T10:18:00.000Z', amountMinor: 37500, campaignId: 'campaign_glow_june', campaignName: 'June Glow Edit' },
    { id: 'txn_demo_014', personId: 'person_012', occurredAt: '2026-06-26T10:18:00.000Z', amountMinor: 29800 }
  ], [
    { id: 'campaign_demo_001', campaignId: 'campaign_glow_june', campaignName: 'June Glow Edit', eventType: 'campaign.member_reached', occurredAt: '2026-06-01T00:00:00.000Z', personId: null, membersReached: 540, transactions: 0, pointsAwarded: 0, revenueMinor: 0, startDate: '2026-06-01', endDate: '2026-06-30' },
    { id: 'campaign_demo_002', campaignId: 'campaign_glow_june', campaignName: 'June Glow Edit', eventType: 'campaign.points_awarded', occurredAt: '2026-06-20T00:00:00.000Z', personId: null, membersReached: 0, transactions: 0, pointsAwarded: 4200, revenueMinor: 0, startDate: '2026-06-01', endDate: '2026-06-30' },
    { id: 'campaign_demo_003', campaignId: 'campaign_glow_june', campaignName: 'June Glow Edit', eventType: 'commerce.transaction.completed', occurredAt: '2026-06-28T10:18:00.000Z', personId: 'person_001', membersReached: 0, transactions: 1, pointsAwarded: 0, revenueMinor: 42800, startDate: '2026-06-01', endDate: '2026-06-30' },
    { id: 'campaign_demo_004', campaignId: 'campaign_skin_reset', campaignName: 'Skin Reset Week', eventType: 'campaign.member_reached', occurredAt: '2026-05-01T00:00:00.000Z', personId: null, membersReached: 320, transactions: 0, pointsAwarded: 0, revenueMinor: 0, startDate: '2026-05-01', endDate: '2026-05-07' },
    { id: 'campaign_demo_005', campaignId: 'campaign_skin_reset', campaignName: 'Skin Reset Week', eventType: 'commerce.transaction.completed', occurredAt: '2026-05-03T10:18:00.000Z', personId: 'person_003', membersReached: 0, transactions: 1, pointsAwarded: 0, revenueMinor: 18800, startDate: '2026-05-01', endDate: '2026-05-07' }
  ])
}

function resolveAnalyticsOptions(
  input: FranAnalyticsOptions | undefined,
  generatedAt = new Date().toISOString()
): ResolvedFranAnalyticsOptions {
  const generatedDate = formatDate(parseDate(generatedAt) || new Date())
  const to = input?.to && isIsoDate(input.to) ? input.to : generatedDate
  const defaultFrom = formatDate(addDays(parseIsoDate(to) || new Date(), -30))
  const requestedFrom = input?.from && isIsoDate(input.from) ? input.from : defaultFrom
  const from = requestedFrom > to ? to : requestedFrom

  return {
    dateRange: { from, to },
    pointValueMinor: toInteger(input?.pointValueMinor ?? 1),
    expiryWindowDays: clampInteger(input?.expiryWindowDays ?? 30, 1, 365),
    topLimit: clampInteger(input?.topLimit ?? 10, 1, 100),
    atRiskDays: clampInteger(input?.atRiskDays ?? 60, 1, 365),
    lapsedFromDays: clampInteger(input?.lapsedFromDays ?? 90, 1, 730),
    lapsedToDays: Math.max(
      clampInteger(input?.lapsedToDays ?? 180, 1, 1095),
      clampInteger(input?.lapsedFromDays ?? 90, 1, 730)
    )
  }
}

function buildLoyaltyPointsAnalytics(
  rows: LoyaltyPointAggregateRow[],
  liabilityRow: LoyaltyLiabilityAggregateRow,
  options: ResolvedFranAnalyticsOptions
): FranLoyaltyPointsAnalytics {
  const counts = new Map<string, { issued: number, redeemed: number }>()

  for (const row of rows) {
    if (!isIsoDate(row.period)) {
      continue
    }

    const current = counts.get(row.period) || { issued: 0, redeemed: 0 }
    current.issued += toInteger(row.issued)
    current.redeemed += toInteger(row.redeemed)
    counts.set(row.period, current)
  }

  const trend = buildPointTrend(counts, options.dateRange)
  const totalIssued = trend.reduce((sum, point) => sum + point.issued, 0)
  const totalRedeemed = trend.reduce((sum, point) => sum + point.redeemed, 0)
  const outstandingPoints = toInteger(liabilityRow.outstandingPoints)

  return {
    dateRange: options.dateRange,
    pointValueMinor: options.pointValueMinor,
    totalIssued,
    totalRedeemed,
    redemptionRate: totalIssued > 0 ? totalRedeemed / totalIssued : 0,
    outstandingPoints,
    liabilityMinor: outstandingPoints * options.pointValueMinor,
    expiryWindowDays: options.expiryWindowDays,
    expiringPoints: toInteger(liabilityRow.expiringPoints),
    expiringMemberCount: toInteger(liabilityRow.expiringMemberCount),
    nextExpiryDate: liabilityRow.nextExpiryDate && isIsoDate(liabilityRow.nextExpiryDate)
      ? liabilityRow.nextExpiryDate
      : null,
    trend
  }
}

function buildPointTrend(
  counts: Map<string, { issued: number, redeemed: number }>,
  dateRange: FranAnalyticsDateRange
): FranLoyaltyPointsTrendPoint[] {
  const from = parseIsoDate(dateRange.from)
  const to = parseIsoDate(dateRange.to)

  if (!from || !to) {
    return mapPointRows(counts)
  }

  const dayCount = Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1

  if (dayCount < 1 || dayCount > 370) {
    return mapPointRows(counts)
  }

  const trend: FranLoyaltyPointsTrendPoint[] = []
  let cursor = new Date(from)

  while (cursor.getTime() <= to.getTime()) {
    const period = formatDate(cursor)
    const current = counts.get(period) || { issued: 0, redeemed: 0 }
    trend.push({ period, issued: current.issued, redeemed: current.redeemed })
    cursor = addDays(cursor, 1)
  }

  return trend
}

function mapPointRows(counts: Map<string, { issued: number, redeemed: number }>): FranLoyaltyPointsTrendPoint[] {
  return Array.from(counts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([period, value]) => ({ period, issued: value.issued, redeemed: value.redeemed }))
}

function aggregatePointEvents(
  pointEvents: LoyaltyPointEventRow[],
  dateRange: FranAnalyticsDateRange
): LoyaltyPointAggregateRow[] {
  const counts = new Map<string, { issued: number, redeemed: number }>()

  for (const event of pointEvents) {
    const occurredAt = parseDate(event.occurredAt)

    if (!occurredAt) {
      continue
    }

    const period = formatDate(occurredAt)

    if (period < dateRange.from || period > dateRange.to) {
      continue
    }

    const current = counts.get(period) || { issued: 0, redeemed: 0 }
    current.issued += toInteger(event.issued)
    current.redeemed += toInteger(event.redeemed)
    counts.set(period, current)
  }

  return mapPointRows(counts)
}

function buildLiabilityFromMembers(
  members: FranAnalyticsMemberRow[],
  options: ResolvedFranAnalyticsOptions
): LoyaltyLiabilityAggregateRow {
  const expiryThreshold = addDays(parseIsoDate(options.dateRange.to) || new Date(), options.expiryWindowDays)
  let outstandingPoints = 0
  let expiringPoints = 0
  let expiringMemberCount = 0
  let nextExpiryDate: string | null = null

  for (const member of members) {
    outstandingPoints += toInteger(member.pointsBalance)
    const expiring = toInteger(member.pointsExpiringSoon)

    if (expiring <= 0) {
      continue
    }

    const expiryDate = member.pointsExpiryDate && isIsoDate(member.pointsExpiryDate)
      ? member.pointsExpiryDate
      : null
    const parsedExpiry = expiryDate ? parseIsoDate(expiryDate) : null
    const shouldNotify = !parsedExpiry || parsedExpiry.getTime() <= expiryThreshold.getTime()

    if (!shouldNotify) {
      continue
    }

    expiringPoints += expiring
    expiringMemberCount += 1

    if (expiryDate && (!nextExpiryDate || expiryDate < nextExpiryDate)) {
      nextExpiryDate = expiryDate
    }
  }

  return {
    outstandingPoints,
    expiringPoints,
    expiringMemberCount,
    nextExpiryDate
  }
}

function extractLoyaltyPointEvent(row: Record<string, unknown>): LoyaltyPointEventRow | null {
  const payload = toRecord(row.payload)
  const eventType = String(row.event_type || row.eventType || '')
  const issued = extractIssuedPointsFromEvent(eventType, payload)
  const redeemed = extractRedeemedPointsFromEvent(eventType, payload)

  if (issued <= 0 && redeemed <= 0) {
    return null
  }

  return {
    id: String(row.id || ''),
    occurredAt: String(row.occurred_at || row.occurredAt || new Date().toISOString()),
    issued,
    redeemed
  }
}

function buildActivityRows(rows: AnalyticsEventRow[]) {
  const transactionRows: CommerceTransactionEventRow[] = []
  const campaignRows: CampaignEventRow[] = []

  for (const row of rows) {
    const transaction = extractCommerceTransactionEvent(row)

    if (transaction) {
      transactionRows.push(transaction)
    }

    const campaign = extractCampaignEvent(row, transaction)

    if (campaign) {
      campaignRows.push(campaign)
    }
  }

  return { transactionRows, campaignRows }
}

function extractCommerceTransactionEvent(row: AnalyticsEventRow): CommerceTransactionEventRow | null {
  if (!isTransactionEventType(row.eventType) && amountMinorFromPayload(row.payload) <= 0) {
    return null
  }

  const amountMinor = amountMinorFromPayload(row.payload)

  if (amountMinor <= 0) {
    return null
  }

  return {
    id: row.id,
    personId: extractPersonId(row),
    occurredAt: row.occurredAt,
    amountMinor,
    campaignId: extractCampaignId(row),
    campaignName: extractCampaignName(row)
  }
}

function extractCampaignEvent(
  row: AnalyticsEventRow,
  transaction: CommerceTransactionEventRow | null
): CampaignEventRow | null {
  const campaignId = extractCampaignId(row)
  const campaignName = extractCampaignName(row)
  const hasCampaignContext = Boolean(campaignId || campaignName || row.eventType.startsWith('campaign.') || row.eventType.startsWith('marketing.'))

  if (!hasCampaignContext) {
    return null
  }

  const pointIssued = extractIssuedPointsFromEvent(row.eventType, row.payload)
  const membersReached = extractMembersReached(row)
  const transactionCount = transaction ? 1 : payloadInteger(row.payload, ['transactions', 'transactionCount', 'transaction_count'])
  const revenueMinor = transaction?.amountMinor || amountMinorFromPayload(row.payload, ['revenueMinor', 'revenue_minor', 'salesMinor', 'sales_minor'])

  return {
    id: row.id,
    campaignId,
    campaignName,
    eventType: row.eventType,
    occurredAt: row.occurredAt,
    personId: extractPersonId(row),
    membersReached,
    transactions: transactionCount,
    pointsAwarded: payloadInteger(row.payload, ['pointsAwarded', 'points_awarded']) || pointIssued,
    revenueMinor,
    startDate: firstIsoDate(row.payload, row.context, ['startDate', 'start_date', 'campaignStart', 'campaign_start']),
    endDate: firstIsoDate(row.payload, row.context, ['endDate', 'end_date', 'campaignEnd', 'campaign_end'])
  }
}

function extractMembersReached(row: AnalyticsEventRow) {
  const aggregate = payloadInteger(row.payload, ['membersReached', 'members_reached', 'recipients', 'recipientCount', 'recipient_count'])

  if (aggregate > 0) {
    return aggregate
  }

  return ['campaign.member_reached', 'campaign.message.sent', 'marketing.campaign.reached', 'marketing.message.sent'].includes(row.eventType)
    ? 1
    : 0
}

function extractIssuedPointsFromEvent(eventType: string, payload: Record<string, unknown>) {
  if (['loyalty.points.issued', 'loyalty.points.earned', 'pos.loyalty.points_earned'].includes(eventType)) {
    return payloadInteger(payload, ['points', 'pointsEarned', 'points_earned', 'issued', 'pointsIssued', 'points_issued'])
  }

  return payloadInteger(payload, ['pointsIssued', 'points_issued', 'pointsEarned', 'points_earned', 'issued'])
}

function extractRedeemedPointsFromEvent(eventType: string, payload: Record<string, unknown>) {
  if (['loyalty.points.redeemed', 'pos.loyalty.points_redeemed', 'pos.discount.points_redeemed'].includes(eventType)) {
    return payloadInteger(payload, ['points', 'pointsRedeemed', 'points_redeemed', 'redeemed'])
  }

  return payloadInteger(payload, ['pointsRedeemed', 'points_redeemed', 'redeemed'])
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

function amountMinorFromPayload(payload: Record<string, unknown>, preferredKeys: string[] = []) {
  const minor = payloadInteger(payload, [
    ...preferredKeys,
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

function payloadNumber(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const numeric = Number(payload[key])

    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric
    }
  }

  return 0
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

function extractPersonId(row: AnalyticsEventRow) {
  return firstString(row.subject, row.context, row.payload, ['personId', 'person_id', 'crmPersonId', 'crm_person_id'])
    || normalizeCustomerKey(firstString(row.subject, row.context, row.payload, ['customerKey', 'customer_key']))
}

function extractCampaignId(row: AnalyticsEventRow) {
  return firstString(row.context, row.payload, row.subject, ['campaignId', 'campaign_id', 'campaignKey', 'campaign_key'])
}

function extractCampaignName(row: AnalyticsEventRow) {
  return firstString(row.context, row.payload, row.subject, ['campaignName', 'campaign_name', 'campaignLabel', 'campaign_label'])
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

function firstIsoDate(
  first: Record<string, unknown>,
  second: Record<string, unknown>,
  keys: string[]
) {
  for (const source of [first, second]) {
    for (const key of keys) {
      const value = source[key]

      if (isIsoDate(value)) {
        return value
      }
    }
  }

  return null
}

function normalizeCustomerKey(value: string | null) {
  if (!value) {
    return null
  }

  return value.replace(/^crm:/, '')
}

function emptyLiabilityRow(): LoyaltyLiabilityAggregateRow {
  return {
    outstandingPoints: 0,
    expiringPoints: 0,
    expiringMemberCount: 0,
    nextExpiryDate: null
  }
}

function buildCustomerAnalytics(
  members: FranAnalyticsMemberRow[],
  transactionRows: CommerceTransactionEventRow[],
  campaignRows: CampaignEventRow[],
  options: ResolvedFranAnalyticsOptions,
  generatedAt: string
): FranCustomerAnalytics {
  const generatedDate = parseDate(generatedAt) || new Date()
  const trailingStart = addDays(generatedDate, -365)
  const spendByMember = new Map<string, {
    lifetimeSpendMinor: number
    trailing12MonthSpendMinor: number
    lastTransactionAt: string | null
  }>()

  for (const row of transactionRows) {
    if (!row.personId) {
      continue
    }

    const occurredAt = parseDate(row.occurredAt)

    if (!occurredAt || occurredAt.getTime() > generatedDate.getTime()) {
      continue
    }

    const current = spendByMember.get(row.personId) || {
      lifetimeSpendMinor: 0,
      trailing12MonthSpendMinor: 0,
      lastTransactionAt: null
    }
    const amountMinor = toInteger(row.amountMinor)
    current.lifetimeSpendMinor += amountMinor

    if (occurredAt.getTime() >= trailingStart.getTime()) {
      current.trailing12MonthSpendMinor += amountMinor
    }

    if (!current.lastTransactionAt || row.occurredAt > current.lastTransactionAt) {
      current.lastTransactionAt = row.occurredAt
    }

    spendByMember.set(row.personId, current)
  }

  const spendRows = members.map((member) => {
    const spend = spendByMember.get(member.id) || {
      lifetimeSpendMinor: 0,
      trailing12MonthSpendMinor: 0,
      lastTransactionAt: null
    }

    return buildCustomerSpendRow(member, spend)
  })

  const topLifetime = [...spendRows]
    .sort((left, right) => right.lifetimeSpendMinor - left.lifetimeSpendMinor || left.name.localeCompare(right.name))
    .slice(0, options.topLimit)
  const topTrailing = [...spendRows]
    .sort((left, right) => right.trailing12MonthSpendMinor - left.trailing12MonthSpendMinor || left.name.localeCompare(right.name))
    .slice(0, options.topLimit)
  const lifecycleRows = spendRows
    .map((row) => ({ ...row, daysSinceLastTransaction: daysSince(row.lastTransactionAt, generatedDate) }))
    .filter((row) => row.daysSinceLastTransaction !== null) as FranCustomerLifecycleRow[]

  return {
    topLimit: options.topLimit,
    atRiskDays: options.atRiskDays,
    lapsedFromDays: options.lapsedFromDays,
    lapsedToDays: options.lapsedToDays,
    topSpenders: {
      lifetime: topLifetime,
      trailing12Month: topTrailing
    },
    atRiskCustomers: lifecycleRows
      .filter((row) => row.daysSinceLastTransaction !== null
        && row.daysSinceLastTransaction >= options.atRiskDays
        && row.daysSinceLastTransaction < options.lapsedFromDays)
      .sort((left, right) => (right.daysSinceLastTransaction || 0) - (left.daysSinceLastTransaction || 0)),
    lapsedCustomers: lifecycleRows
      .filter((row) => row.daysSinceLastTransaction !== null
        && row.daysSinceLastTransaction >= options.lapsedFromDays
        && row.daysSinceLastTransaction <= options.lapsedToDays)
      .sort((left, right) => (right.daysSinceLastTransaction || 0) - (left.daysSinceLastTransaction || 0)),
    birthdayMembers: buildBirthdayMembers(members, generatedDate),
    campaignPerformance: buildCampaignPerformance(campaignRows)
  }
}

function buildCustomerSpendRow(
  member: FranAnalyticsMemberRow,
  spend: { lifetimeSpendMinor: number, trailing12MonthSpendMinor: number, lastTransactionAt: string | null }
): FranCustomerSpendRow {
  return {
    id: member.id,
    name: member.name || member.id,
    mobile: member.mobile || null,
    tier: normalizeFranTier(member.tier),
    pointsBalance: toInteger(member.pointsBalance),
    lifetimeSpendMinor: spend.lifetimeSpendMinor,
    trailing12MonthSpendMinor: spend.trailing12MonthSpendMinor,
    lastTransactionAt: spend.lastTransactionAt
  }
}

function daysSince(value: string | null, generatedDate: Date) {
  if (!value) {
    return null
  }

  const date = parseDate(value)

  if (!date) {
    return null
  }

  return Math.max(0, Math.floor((generatedDate.getTime() - date.getTime()) / 86_400_000))
}

function buildBirthdayMembers(members: FranAnalyticsMemberRow[], generatedDate: Date): FranBirthdayMemberRow[] {
  const month = generatedDate.getUTCMonth()

  return members
    .filter((member) => {
      const birthday = member.birthday ? parseIsoDate(member.birthday) : null
      return Boolean(birthday && birthday.getUTCMonth() === month)
    })
    .map((member) => ({
      id: member.id,
      name: member.name || member.id,
      mobile: member.mobile || null,
      tier: normalizeFranTier(member.tier),
      pointsBalance: toInteger(member.pointsBalance),
      birthday: member.birthday || ''
    }))
    .sort((left, right) => left.birthday.slice(5).localeCompare(right.birthday.slice(5)))
}

function buildCampaignPerformance(rows: CampaignEventRow[]): FranCampaignPerformanceRow[] {
  const campaigns = new Map<string, {
    id: string
    name: string
    membersReached: number
    reachedMemberIds: Set<string>
    transactions: number
    pointsAwarded: number
    revenueMinor: number
    startDate: string | null
    endDate: string | null
  }>()

  for (const row of rows) {
    const campaignId = row.campaignId || row.campaignName

    if (!campaignId) {
      continue
    }

    const current = campaigns.get(campaignId) || {
      id: campaignId,
      name: row.campaignName || campaignId,
      membersReached: 0,
      reachedMemberIds: new Set<string>(),
      transactions: 0,
      pointsAwarded: 0,
      revenueMinor: 0,
      startDate: row.startDate,
      endDate: row.endDate
    }

    if (row.personId && toInteger(row.membersReached) > 0) {
      current.reachedMemberIds.add(row.personId)
    } else {
      current.membersReached += toInteger(row.membersReached)
    }

    current.transactions += toInteger(row.transactions)
    current.pointsAwarded += toInteger(row.pointsAwarded)
    current.revenueMinor += toInteger(row.revenueMinor)
    current.startDate = minIsoDate(current.startDate, row.startDate)
    current.endDate = maxIsoDate(current.endDate, row.endDate)
    campaigns.set(campaignId, current)
  }

  return Array.from(campaigns.values())
    .map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      membersReached: campaign.membersReached + campaign.reachedMemberIds.size,
      transactions: campaign.transactions,
      pointsAwarded: campaign.pointsAwarded,
      revenueMinor: campaign.revenueMinor,
      startDate: campaign.startDate,
      endDate: campaign.endDate
    }))
    .sort((left, right) => right.revenueMinor - left.revenueMinor || left.name.localeCompare(right.name))
}

function minIsoDate(current: string | null, next: string | null) {
  if (!next || !isIsoDate(next)) {
    return current
  }

  if (!current || next < current) {
    return next
  }

  return current
}

function maxIsoDate(current: string | null, next: string | null) {
  if (!next || !isIsoDate(next)) {
    return current
  }

  if (!current || next > current) {
    return next
  }

  return current
}

function normalizeCycleRows(rows: EvaluationCycleRow[]): FranEvaluationCycleAnalytics[] {
  return rows.map((row) => {
    const tierCounts = {
      Bronze: toInteger(row.bronzeCount),
      Silver: toInteger(row.silverCount),
      Gold: toInteger(row.goldCount)
    } satisfies Record<FranMemberTier, number>
    const countedTotal = franAnalyticsTiers.reduce((sum, tier) => sum + tierCounts[tier], 0)
    const memberCount = toInteger(row.memberCount) || countedTotal

    return {
      id: row.id,
      cycleKey: row.cycleKey,
      label: row.label,
      evaluatedAt: row.evaluatedAt,
      memberCount,
      tierCounts,
      upgradedCount: toInteger(row.upgradedCount),
      downgradedCount: toInteger(row.downgradedCount),
      retainedCount: toInteger(row.retainedCount),
      source: row.source
    }
  })
}

function cycleToTrendPoint(cycle: FranEvaluationCycleAnalytics): FranTierTrendPoint {
  return {
    period: formatDate(parseDate(cycle.evaluatedAt) || new Date()),
    evaluatedAt: cycle.evaluatedAt,
    bronze: cycle.tierCounts.Bronze,
    silver: cycle.tierCounts.Silver,
    gold: cycle.tierCounts.Gold,
    total: cycle.memberCount,
    source: 'evaluation_cycle'
  }
}

function buildCurrentTrendPoint(
  generatedAt: string,
  snapshotCounts: Record<FranMemberTier, number>,
  totalMembers: number,
  mode: 'demo' | 'supabase'
): FranTierTrendPoint {
  return {
    period: formatDate(parseDate(generatedAt) || new Date()),
    evaluatedAt: generatedAt,
    bronze: snapshotCounts.Bronze,
    silver: snapshotCounts.Silver,
    gold: snapshotCounts.Gold,
    total: totalMembers,
    source: mode === 'demo' ? 'demo' : 'current_snapshot'
  }
}

function appendCurrentSnapshotTrend(cycleTrend: FranTierTrendPoint[], currentPoint: FranTierTrendPoint): FranTierTrendPoint[] {
  const last = cycleTrend[cycleTrend.length - 1]

  if (!last) {
    return [currentPoint]
  }

  const hasSamePeriod = last.period === currentPoint.period
  const hasSameCounts = last.bronze === currentPoint.bronze
    && last.silver === currentPoint.silver
    && last.gold === currentPoint.gold
    && last.total === currentPoint.total

  return hasSamePeriod && hasSameCounts ? cycleTrend : [...cycleTrend, currentPoint]
}

function buildSignupTrend(rows: SignupAggregateRow[], bucket: FranSignupBucket): FranSignupTrendPoint[] {
  if (!rows.length) {
    return []
  }

  const counts = new Map<string, number>()

  for (const row of rows) {
    counts.set(row.period, (counts.get(row.period) || 0) + toInteger(row.count))
  }

  const starts = Array.from(counts.keys())
    .map((period) => periodStart(period, bucket))
    .filter((date): date is Date => Boolean(date))
    .sort((left, right) => left.getTime() - right.getTime())

  const first = starts[0]
  const last = starts[starts.length - 1]

  if (!first || !last) {
    return []
  }

  const trend: FranSignupTrendPoint[] = []
  let cursor = new Date(first)
  let cumulative = 0

  while (cursor.getTime() <= last.getTime()) {
    const period = periodKey(cursor, bucket)
    const count = counts.get(period) || 0
    cumulative += count
    trend.push({ period, count, cumulative })
    cursor = addPeriod(cursor, bucket)
  }

  return trend
}

async function loadMemberRowsWithSql(sql: Sql, workspaceId: string): Promise<FranAnalyticsMemberRow[]> {
  return await sql<FranAnalyticsMemberRow[]>`
    select
      id::text as id,
      label as name,
      nullif(attributes #>> '{profile_packs,fran_member,mobile}', '') as mobile,
      nullif(attributes #>> '{profile_packs,fran_member,birthday}', '') as birthday,
      nullif(attributes #>> '{profile_packs,fran_loyalty,tier}', '') as tier,
      nullif(attributes #>> '{profile_packs,fran_member,member_since}', '') as "memberSince",
      created_at::text as "createdAt",
      nullif(attributes #>> '{profile_packs,fran_loyalty,points_balance}', '') as "pointsBalance",
      nullif(attributes #>> '{profile_packs,fran_loyalty,points_expiring_soon}', '') as "pointsExpiringSoon",
      nullif(attributes #>> '{profile_packs,fran_loyalty,points_expiry_date}', '') as "pointsExpiryDate"
    from public.crm_entities
    where workspace_id = ${workspaceId}::uuid
      and type = 'person'
      and (
        external_ids ? 'fran_member'
        or attributes #> '{profile_packs,fran_member}' is not null
        or attributes #>> '{profile_packs,fran_loyalty,tier}' is not null
      )
  `
}

async function loadSnapshotRowsWithSql(sql: Sql, workspaceId: string): Promise<SnapshotAggregateRow[]> {
  return await sql<SnapshotAggregateRow[]>`
    with members as (
      select
        case lower(nullif(attributes #>> '{profile_packs,fran_loyalty,tier}', ''))
          when 'bronze' then 'Bronze'
          when 'silver' then 'Silver'
          when 'gold' then 'Gold'
          else null
        end as tier
      from public.crm_entities
      where workspace_id = ${workspaceId}::uuid
        and type = 'person'
        and (
          external_ids ? 'fran_member'
          or attributes #> '{profile_packs,fran_member}' is not null
          or attributes #>> '{profile_packs,fran_loyalty,tier}' is not null
        )
    )
    select tier, count(*)::int as count
    from members
    group by tier
  `
}

async function loadSignupRowsWithSql(sql: Sql, workspaceId: string, bucket: FranSignupBucket): Promise<SignupAggregateRow[]> {
  const trunc = bucket === 'day' ? 'day' : bucket === 'week' ? 'week' : 'month'
  const format = bucket === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD'

  return await sql<SignupAggregateRow[]>`
    with members as (
      select
        case
          when coalesce(attributes #>> '{profile_packs,fran_member,member_since}', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
            then (attributes #>> '{profile_packs,fran_member,member_since}')::date
          else created_at::date
        end as signup_date
      from public.crm_entities
      where workspace_id = ${workspaceId}::uuid
        and type = 'person'
        and (
          external_ids ? 'fran_member'
          or attributes #> '{profile_packs,fran_member}' is not null
          or attributes #>> '{profile_packs,fran_loyalty,tier}' is not null
        )
    )
    select to_char(date_trunc(${trunc}, signup_date)::date, ${format}) as period, count(*)::int as count
    from members
    group by 1
    order by 1 asc
  `
}

async function loadAnalyticsEventRowsWithSql(sql: Sql, workspaceId: string): Promise<AnalyticsEventRow[]> {
  const rows = await sql<Array<{
    id: string
    event_type: string
    occurred_at: string
    subject: unknown
    context: unknown
    payload: unknown
  }>>`
    select
      id::text,
      event_type,
      occurred_at::text,
      subject,
      context,
      payload
    from public.crm_events
    where workspace_id = ${workspaceId}::uuid
      and (
        event_type in (
          'commerce.transaction.completed',
          'commerce.order.paid',
          'order.completed',
          'order.paid',
          'pos.sale.completed',
          'pos.transaction.completed',
          'shopify.order.paid',
          'loyalty.points.issued',
          'loyalty.points.earned',
          'pos.loyalty.points_earned'
        )
        or event_type like 'campaign.%'
        or event_type like 'marketing.%'
        or context ? 'campaignId'
        or context ? 'campaign_id'
        or payload ? 'campaignId'
        or payload ? 'campaign_id'
        or payload ? 'totalMinor'
        or payload ? 'total_minor'
        or payload ? 'amountMinor'
        or payload ? 'amount_minor'
      )
    order by occurred_at asc
  `

  return rows.map((row) => ({
    id: String(row.id || ''),
    eventType: String(row.event_type || ''),
    occurredAt: String(row.occurred_at || new Date().toISOString()),
    subject: toRecord(row.subject),
    context: toRecord(row.context),
    payload: toRecord(row.payload)
  }))
}

async function loadEvaluationCyclesWithSql(sql: Sql, workspaceId: string): Promise<{ rows: EvaluationCycleRow[], warning?: string }> {
  try {
    const rows = await sql<Array<{
      id: string
      cycle_key: string
      label: string
      evaluated_at: string
      member_count: number | string
      bronze_count: number | string
      silver_count: number | string
      gold_count: number | string
      upgraded_count: number | string
      downgraded_count: number | string
      retained_count: number | string
      source: string
    }>>`
      select
        id::text,
        cycle_key,
        label,
        evaluated_at::text,
        member_count,
        bronze_count,
        silver_count,
        gold_count,
        upgraded_count,
        downgraded_count,
        retained_count,
        source
      from public.fran_loyalty_tier_evaluation_cycles
      where workspace_id = ${workspaceId}::uuid
      order by evaluated_at asc
      limit 36
    `

    return {
      rows: rows.map(mapDbCycleRow)
    }
  } catch (error) {
    return {
      rows: [],
      warning: missingAnalyticsTableMessage(error)
    }
  }
}

async function loadLoyaltyPointRowsWithSql(
  sql: Sql,
  workspaceId: string,
  options: ResolvedFranAnalyticsOptions
): Promise<LoyaltyPointAggregateRow[]> {
  const fromIso = `${options.dateRange.from}T00:00:00.000Z`
  const toExclusiveIso = `${formatDate(addDays(parseIsoDate(options.dateRange.to) || new Date(), 1))}T00:00:00.000Z`

  return await sql<LoyaltyPointAggregateRow[]>`
    with events as (
      select occurred_at::date as event_date, event_type, payload
      from public.crm_events
      where workspace_id = ${workspaceId}::uuid
        and occurred_at >= ${fromIso}::timestamptz
        and occurred_at < ${toExclusiveIso}::timestamptz
    ),
    normalized as (
      select
        event_date,
        case
          when event_type in ('loyalty.points.issued', 'loyalty.points.earned', 'pos.loyalty.points_earned')
            and coalesce(payload->>'points', payload->>'pointsEarned', payload->>'points_earned', payload->>'issued', payload->>'pointsIssued', payload->>'points_issued') ~ '^-?[0-9]+(\\.[0-9]+)?$'
            then coalesce(payload->>'points', payload->>'pointsEarned', payload->>'points_earned', payload->>'issued', payload->>'pointsIssued', payload->>'points_issued')::numeric
          when coalesce(payload->>'pointsIssued', payload->>'points_issued', payload->>'pointsEarned', payload->>'points_earned') ~ '^-?[0-9]+(\\.[0-9]+)?$'
            then coalesce(payload->>'pointsIssued', payload->>'points_issued', payload->>'pointsEarned', payload->>'points_earned')::numeric
          else 0
        end as issued,
        case
          when event_type in ('loyalty.points.redeemed', 'pos.loyalty.points_redeemed', 'pos.discount.points_redeemed')
            and coalesce(payload->>'points', payload->>'pointsRedeemed', payload->>'points_redeemed', payload->>'redeemed') ~ '^-?[0-9]+(\\.[0-9]+)?$'
            then coalesce(payload->>'points', payload->>'pointsRedeemed', payload->>'points_redeemed', payload->>'redeemed')::numeric
          when coalesce(payload->>'pointsRedeemed', payload->>'points_redeemed', payload->>'redeemed') ~ '^-?[0-9]+(\\.[0-9]+)?$'
            then coalesce(payload->>'pointsRedeemed', payload->>'points_redeemed', payload->>'redeemed')::numeric
          else 0
        end as redeemed
      from events
    )
    select
      to_char(event_date, 'YYYY-MM-DD') as period,
      coalesce(sum(greatest(issued, 0)), 0)::bigint as issued,
      coalesce(sum(greatest(redeemed, 0)), 0)::bigint as redeemed
    from normalized
    where issued > 0 or redeemed > 0
    group by 1
    order by 1 asc
  `
}

async function loadLoyaltyLiabilityWithSql(
  sql: Sql,
  workspaceId: string,
  options: ResolvedFranAnalyticsOptions
): Promise<LoyaltyLiabilityAggregateRow> {
  const expiryThreshold = formatDate(addDays(parseIsoDate(options.dateRange.to) || new Date(), options.expiryWindowDays))
  const rows = await sql<LoyaltyLiabilityAggregateRow[]>`
    with members as (
      select
        case
          when coalesce(attributes #>> '{profile_packs,fran_loyalty,points_balance}', '') ~ '^-?[0-9]+(\\.[0-9]+)?$'
            then (attributes #>> '{profile_packs,fran_loyalty,points_balance}')::numeric
          else 0
        end as points_balance,
        case
          when coalesce(attributes #>> '{profile_packs,fran_loyalty,points_expiring_soon}', '') ~ '^-?[0-9]+(\\.[0-9]+)?$'
            then (attributes #>> '{profile_packs,fran_loyalty,points_expiring_soon}')::numeric
          else 0
        end as points_expiring_soon,
        case
          when coalesce(attributes #>> '{profile_packs,fran_loyalty,points_expiry_date}', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
            then (attributes #>> '{profile_packs,fran_loyalty,points_expiry_date}')::date
          else null
        end as points_expiry_date
      from public.crm_entities
      where workspace_id = ${workspaceId}::uuid
        and type = 'person'
        and (
          external_ids ? 'fran_member'
          or attributes #> '{profile_packs,fran_member}' is not null
          or attributes #>> '{profile_packs,fran_loyalty,tier}' is not null
        )
    ),
    expiring_members as (
      select points_expiring_soon, points_expiry_date
      from members
      where points_expiring_soon > 0
        and (points_expiry_date is null or points_expiry_date <= ${expiryThreshold}::date)
    )
    select
      coalesce((select sum(points_balance) from members), 0)::bigint as "outstandingPoints",
      coalesce((select sum(points_expiring_soon) from expiring_members), 0)::bigint as "expiringPoints",
      coalesce((select count(*) from expiring_members), 0)::int as "expiringMemberCount",
      (select min(points_expiry_date)::text from expiring_members) as "nextExpiryDate"
  `

  return rows[0] || emptyLiabilityRow()
}

async function fetchMemberRowsWithSupabase(supabase: SupabaseClient, workspaceId: string): Promise<FranAnalyticsMemberRow[]> {
  const rows: FranAnalyticsMemberRow[] = []
  const pageSize = 1000
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('crm_entities')
      .select('id, label, external_ids, attributes, created_at')
      .eq('workspace_id', workspaceId)
      .eq('type', 'person')
      .range(from, from + pageSize - 1)

    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message })
    }

    const pageRows = (data || [])
      .map((row) => extractMemberRow(row as Record<string, unknown>))
      .filter((row): row is FranAnalyticsMemberRow => Boolean(row))
    rows.push(...pageRows)

    if (!data || data.length < pageSize) {
      break
    }

    from += pageSize
  }

  return rows
}

async function fetchEvaluationCyclesWithSupabase(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<{ rows: EvaluationCycleRow[], warning?: string }> {
  const { data, error } = await supabase
    .from('fran_loyalty_tier_evaluation_cycles')
    .select('id, cycle_key, label, evaluated_at, member_count, bronze_count, silver_count, gold_count, upgraded_count, downgraded_count, retained_count, source')
    .eq('workspace_id', workspaceId)
    .order('evaluated_at', { ascending: true })
    .limit(36)

  if (error) {
    return {
      rows: [],
      warning: missingAnalyticsTableMessage(error.message)
    }
  }

  return {
    rows: (data || []).map((row) => mapDbCycleRow(row as Record<string, unknown>))
  }
}

async function fetchLoyaltyPointEventsWithSupabase(
  supabase: SupabaseClient,
  workspaceId: string,
  options: ResolvedFranAnalyticsOptions
): Promise<LoyaltyPointEventRow[]> {
  const rows: LoyaltyPointEventRow[] = []
  const pageSize = 1000
  const fromIso = `${options.dateRange.from}T00:00:00.000Z`
  const toExclusiveIso = `${formatDate(addDays(parseIsoDate(options.dateRange.to) || new Date(), 1))}T00:00:00.000Z`
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('crm_events')
      .select('id, event_type, occurred_at, payload')
      .eq('workspace_id', workspaceId)
      .gte('occurred_at', fromIso)
      .lt('occurred_at', toExclusiveIso)
      .order('occurred_at', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message })
    }

    for (const row of data || []) {
      const pointEvent = extractLoyaltyPointEvent(row as Record<string, unknown>)

      if (pointEvent) {
        rows.push(pointEvent)
      }
    }

    if (!data || data.length < pageSize) {
      break
    }

    from += pageSize
  }

  return rows
}

async function fetchAnalyticsEventRowsWithSupabase(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<AnalyticsEventRow[]> {
  const rows: AnalyticsEventRow[] = []
  const pageSize = 1000
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('crm_events')
      .select('id, event_type, occurred_at, subject, context, payload')
      .eq('workspace_id', workspaceId)
      .order('occurred_at', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message })
    }

    for (const row of data || []) {
      const eventRow = mapAnalyticsEventRow(row as Record<string, unknown>)

      if (isAnalyticsActivityEvent(eventRow)) {
        rows.push(eventRow)
      }
    }

    if (!data || data.length < pageSize) {
      break
    }

    from += pageSize
  }

  return rows
}

function extractMemberRow(row: Record<string, unknown>): FranAnalyticsMemberRow | null {
  const attributes = toRecord(row.attributes)
  const externalIds = toRecord(row.external_ids)
  const profilePacks = toRecord(attributes.profile_packs)
  const memberPack = toRecord(profilePacks.fran_member)
  const loyaltyPack = toRecord(profilePacks.fran_loyalty)
  const hasMemberIdentity = Boolean(
    Object.keys(memberPack).length
    || externalIds.fran_member
    || loyaltyPack.tier
  )

  if (!hasMemberIdentity) {
    return null
  }

  return {
    id: String(row.id || ''),
    name: typeof row.label === 'string' ? row.label : String(row.id || ''),
    mobile: typeof memberPack.mobile === 'string' ? memberPack.mobile : typeof attributes.phone === 'string' ? attributes.phone : null,
    birthday: typeof memberPack.birthday === 'string' ? memberPack.birthday : null,
    tier: typeof loyaltyPack.tier === 'string' ? loyaltyPack.tier : null,
    memberSince: typeof memberPack.member_since === 'string' ? memberPack.member_since : null,
    createdAt: String(row.created_at || new Date().toISOString()),
    pointsBalance: numberLikeOrNull(loyaltyPack.points_balance),
    pointsExpiringSoon: numberLikeOrNull(loyaltyPack.points_expiring_soon),
    pointsExpiryDate: typeof loyaltyPack.points_expiry_date === 'string' ? loyaltyPack.points_expiry_date : null
  }
}

function mapAnalyticsEventRow(row: Record<string, unknown>): AnalyticsEventRow {
  return {
    id: String(row.id || ''),
    eventType: String(row.event_type || row.eventType || ''),
    occurredAt: String(row.occurred_at || row.occurredAt || new Date().toISOString()),
    subject: toRecord(row.subject),
    context: toRecord(row.context),
    payload: toRecord(row.payload)
  }
}

function isAnalyticsActivityEvent(row: AnalyticsEventRow) {
  return isTransactionEventType(row.eventType)
    || row.eventType.startsWith('campaign.')
    || row.eventType.startsWith('marketing.')
    || Boolean(extractCampaignId(row))
    || amountMinorFromPayload(row.payload) > 0
    || extractIssuedPointsFromEvent(row.eventType, row.payload) > 0
}

function mapDbCycleRow(row: Record<string, unknown>): EvaluationCycleRow {
  return {
    id: String(row.id || ''),
    cycleKey: String(row.cycle_key || row.cycleKey || ''),
    label: String(row.label || row.cycle_key || row.cycleKey || ''),
    evaluatedAt: String(row.evaluated_at || row.evaluatedAt || new Date().toISOString()),
    memberCount: toInteger(row.member_count ?? row.memberCount),
    bronzeCount: toInteger(row.bronze_count ?? row.bronzeCount),
    silverCount: toInteger(row.silver_count ?? row.silverCount),
    goldCount: toInteger(row.gold_count ?? row.goldCount),
    upgradedCount: toInteger(row.upgraded_count ?? row.upgradedCount),
    downgradedCount: toInteger(row.downgraded_count ?? row.downgradedCount),
    retainedCount: toInteger(row.retained_count ?? row.retainedCount),
    source: String(row.source || 'loyalty_evaluator')
  }
}

function mapToSignupRows(rows: Map<string, number>): SignupAggregateRow[] {
  return Array.from(rows.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([period, count]) => ({ period, count }))
}

function parseMemberDate(memberSince: string | null, createdAt: string) {
  if (memberSince && /^\d{4}-\d{2}-\d{2}$/.test(memberSince)) {
    return parseDate(`${memberSince}T00:00:00.000Z`)
  }

  return parseDate(createdAt)
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

function periodKey(date: Date, bucket: FranSignupBucket) {
  if (bucket === 'month') {
    return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`
  }

  if (bucket === 'week') {
    return formatDate(startOfWeek(date))
  }

  return formatDate(date)
}

function periodStart(period: string, bucket: FranSignupBucket) {
  if (bucket === 'month') {
    return parseDate(`${period}-01T00:00:00.000Z`)
  }

  return parseDate(`${period}T00:00:00.000Z`)
}

function addPeriod(date: Date, bucket: FranSignupBucket) {
  const next = new Date(date)

  if (bucket === 'month') {
    next.setUTCMonth(next.getUTCMonth() + 1)
  } else if (bucket === 'week') {
    next.setUTCDate(next.getUTCDate() + 7)
  } else {
    next.setUTCDate(next.getUTCDate() + 1)
  }

  return next
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function startOfWeek(date: Date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = start.getUTCDay() || 7
  start.setUTCDate(start.getUTCDate() - day + 1)
  return start
}

function formatDate(date: Date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`
}

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

function toInteger(value: unknown) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : 0
}

function clampInteger(value: unknown, min: number, max: number) {
  const numeric = Number(value)

  if (!Number.isFinite(numeric)) {
    return min
  }

  return Math.min(max, Math.max(min, Math.trunc(numeric)))
}

function numberLikeOrNull(value: unknown) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : null
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function missingAnalyticsTableMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '')

  if (/fran_loyalty_tier_evaluation_cycles|schema cache|does not exist|Could not find/i.test(message)) {
    return 'Apply supabase/migrations/0006_fran_loyalty_analytics.sql to enable historical tier evaluation cycles.'
  }

  return message || 'Unable to load Fran loyalty evaluation cycles.'
}
