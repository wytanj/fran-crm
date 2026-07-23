/**
 * L-base — Fran’s With Benefits pure engine (loyaltys.pdf).
 * CRM ledger authority: earn formula, fixed dens, theoretical expiry, tier YTD.
 * POS evaluates previews; CRM settles via commit_sale.
 */

export const FWB_TIER_RATES = { F1: 1.0, F2: 1.25, F3: 1.5 } as const

export type FwbTierKey = keyof typeof FWB_TIER_RATES

export const FWB_REDEEM_DENOMS = [
  { points: 200, discountMinor: 600, discount: 6 },
  { points: 500, discountMinor: 2000, discount: 20 },
  { points: 1000, discountMinor: 5000, discount: 50 },
  { points: 1500, discountMinor: 9000, discount: 90 },
  { points: 2500, discountMinor: 17500, discount: 175 }
] as const

/** Calendar-year thresholds in SGD major units (PDF §1). */
export const FWB_TIER_THRESHOLDS_SGD = [
  { key: 'F1' as const, label: 'Tier 1', annualSpend: 0, earnRate: FWB_TIER_RATES.F1, sortOrder: 0 },
  { key: 'F2' as const, label: 'Tier 2', annualSpend: 500, earnRate: FWB_TIER_RATES.F2, sortOrder: 1 },
  { key: 'F3' as const, label: 'Tier 3', annualSpend: 1250, earnRate: FWB_TIER_RATES.F3, sortOrder: 2 }
]

export interface FwbEarnInput {
  spend: number
  tierRate: number
  birthdayActive?: boolean
  categoryActive?: boolean
  campaignAdds?: number[]
}

export interface FwbEarnResult {
  tierRate: number
  birthdayAdd: number
  categoryAdd: number
  campaignAdd: number
  totalMultiplier: number
  points: number
}

/** PDF §5: floor(spend × (tier + bday + cat)). */
export function computeFwbEarnPoints(input: FwbEarnInput): FwbEarnResult {
  const spend = Math.max(0, Number(input.spend) || 0)
  const tierRate = Math.max(0, Number(input.tierRate) || 0)
  const birthdayAdd = input.birthdayActive ? 1 : 0
  const categoryAdd = input.categoryActive ? 1 : 0
  const campaignAdd = (input.campaignAdds || []).reduce((s, n) => s + Math.max(0, Number(n) || 0), 0)
  const totalMultiplier = tierRate + birthdayAdd + categoryAdd + campaignAdd
  return {
    tierRate,
    birthdayAdd,
    categoryAdd,
    campaignAdd,
    totalMultiplier,
    points: Math.floor(spend * totalMultiplier)
  }
}

export function normalizeFwbTierKey(raw: string | null | undefined): FwbTierKey | 'Tourist' | null {
  const key = String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '')
  if (!key) return null
  if (key === 'TOURIST') return 'Tourist'
  if (key === 'F1' || key === 'TIER1' || key === 'TIER_1' || key === 'BASE' || key === 'BRONZE') return 'F1'
  if (key === 'F2' || key === 'TIER2' || key === 'TIER_2' || key === 'SILVER') return 'F2'
  if (key === 'F3' || key === 'TIER3' || key === 'TIER_3' || key === 'GOLD') return 'F3'
  return null
}

export function fwbTierRateFromKey(raw: string | null | undefined): number {
  const n = normalizeFwbTierKey(raw)
  if (n === 'F3') return FWB_TIER_RATES.F3
  if (n === 'F2') return FWB_TIER_RATES.F2
  if (n === 'F1') return FWB_TIER_RATES.F1
  return FWB_TIER_RATES.F1
}

/** Highest tier whose threshold ≤ calendar YTD spend (SGD). */
export function tierFromCalendarYtdSpend(ytdSgd: number): (typeof FWB_TIER_THRESHOLDS_SGD)[number] {
  const spend = Math.max(0, Number(ytdSgd) || 0)
  let current = FWB_TIER_THRESHOLDS_SGD[0]!
  for (const row of FWB_TIER_THRESHOLDS_SGD) {
    if (spend >= row.annualSpend) current = row
  }
  return current
}

export function bestFwbRedeemDenom(availablePoints: number) {
  const pts = Math.max(0, Math.floor(availablePoints))
  let best: (typeof FWB_REDEEM_DENOMS)[number] | null = null
  for (const row of FWB_REDEEM_DENOMS) {
    if (pts >= row.points) best = row
  }
  return best
}

export function isValidFwbRedeemDenom(points: number): boolean {
  return FWB_REDEEM_DENOMS.some((d) => d.points === points)
}

export function redeemDiscountForPoints(points: number): number | null {
  const row = FWB_REDEEM_DENOMS.find((d) => d.points === points)
  return row ? row.discount : null
}

/**
 * Theoretical expiry: end of calendar quarter containing earn_date + 12 months.
 * PDF §2 — stored once at earn time; never recalculated on tier change.
 */
export function theoreticalExpiryFromEarnDate(earnDate: Date | string): {
  earnDate: string
  earnQuarter: 'Q1' | 'Q2' | 'Q3' | 'Q4'
  theoreticalExpiryDate: string
} {
  const earn = typeof earnDate === 'string' ? new Date(earnDate) : earnDate
  if (Number.isNaN(earn.getTime())) {
    throw new Error('invalid earnDate')
  }
  const anniversary = new Date(Date.UTC(earn.getUTCFullYear() + 1, earn.getUTCMonth(), earn.getUTCDate()))
  const y = anniversary.getUTCFullYear()
  const m = anniversary.getUTCMonth() // 0-11
  let qEndMonth: number
  let earnQuarter: 'Q1' | 'Q2' | 'Q3' | 'Q4'
  if (m <= 2) {
    qEndMonth = 2
    earnQuarter = 'Q1'
  } else if (m <= 5) {
    qEndMonth = 5
    earnQuarter = 'Q2'
  } else if (m <= 8) {
    qEndMonth = 8
    earnQuarter = 'Q3'
  } else {
    qEndMonth = 11
    earnQuarter = 'Q4'
  }
  // Quarter of the anniversary date (not earn date) per PDF worked example
  const annM = anniversary.getUTCMonth()
  if (annM <= 2) {
    qEndMonth = 2
    earnQuarter = 'Q1'
  } else if (annM <= 5) {
    qEndMonth = 5
    earnQuarter = 'Q2'
  } else if (annM <= 8) {
    qEndMonth = 8
    earnQuarter = 'Q3'
  } else {
    qEndMonth = 11
    earnQuarter = 'Q4'
  }
  const lastDay = new Date(Date.UTC(y, qEndMonth + 1, 0))
  // Also tag earn quarter from earn date for batch metadata
  const earnM = earn.getUTCMonth()
  let batchQuarter: 'Q1' | 'Q2' | 'Q3' | 'Q4'
  if (earnM <= 2) batchQuarter = 'Q1'
  else if (earnM <= 5) batchQuarter = 'Q2'
  else if (earnM <= 8) batchQuarter = 'Q3'
  else batchQuarter = 'Q4'

  return {
    earnDate: earn.toISOString().slice(0, 10),
    earnQuarter: batchQuarter,
    theoreticalExpiryDate: lastDay.toISOString().slice(0, 10)
  }
}

export interface FwbPointBatch {
  batchId: string
  points: number
  pointsRemaining: number
  earnDate: string
  earnQuarter: string
  theoreticalExpiryDate: string
  source: string
  frozen: boolean
}

export interface FwbCommitSaleInput {
  saleId: string
  memberId: string
  idempotencyKey: string
  /** Net eligible spend (SGD major). */
  netSpend: number
  tierKey: string
  pointsEarned?: number
  /** If omitted, compute from spend + flags. */
  birthdayActive?: boolean
  categoryActive?: boolean
  pointsRedeemed?: number
  occurredAt?: string
  policyVersionId?: string | null
  assignmentId?: string | null
  skumsQuoteId?: string | null
  evaluationTrace?: Record<string, unknown> | null
}

export interface FwbCommitSaleResult {
  commitId: string
  saleId: string
  status: 'committed' | 'duplicate'
  pointsEarned: number
  pointsRedeemed: number
  pointsBalanceAfter: number
  tierAfter: FwbTierKey
  calendarYtdSpendAfter: number
  earnBatch: FwbPointBatch | null
  ledgerEntryIds: string[]
  warnings: string[]
}

export interface FwbMemberAccountState {
  memberId: string
  pointsBalance: number
  calendarYtdSpend: number
  tierKey: FwbTierKey
  batches: FwbPointBatch[]
}

/** In-memory demo store for commit_sale without DB. */
const demoAccounts = new Map<string, FwbMemberAccountState>()
const demoIdempotency = new Map<string, FwbCommitSaleResult>()

export function getOrCreateDemoAccount(
  memberId: string,
  seed?: Partial<FwbMemberAccountState>
): FwbMemberAccountState {
  const existing = demoAccounts.get(memberId)
  if (existing) return existing
  const tier = (normalizeFwbTierKey(seed?.tierKey) as FwbTierKey) || 'F1'
  const account: FwbMemberAccountState = {
    memberId,
    pointsBalance: seed?.pointsBalance ?? 0,
    calendarYtdSpend: seed?.calendarYtdSpend ?? 0,
    tierKey: tier,
    batches: seed?.batches ? [...seed.batches] : []
  }
  demoAccounts.set(memberId, account)
  return account
}

export function resetDemoLoyaltyState() {
  demoAccounts.clear()
  demoIdempotency.clear()
}

/**
 * Settle earn + redeem for one POS sale (idempotent by key).
 * Pure ledger math — persistence is caller's job when using Supabase.
 */
export function commitFwbSale(
  input: FwbCommitSaleInput,
  prior?: FwbMemberAccountState
): FwbCommitSaleResult {
  const dup = demoIdempotency.get(input.idempotencyKey)
  if (dup) {
    return { ...dup, status: 'duplicate' }
  }

  const account = prior
    ? { ...prior, batches: [...prior.batches] }
    : getOrCreateDemoAccount(input.memberId)

  const warnings: string[] = []
  const tierRate = fwbTierRateFromKey(input.tierKey || account.tierKey)
  let pointsEarned = input.pointsEarned
  if (pointsEarned == null) {
    pointsEarned = computeFwbEarnPoints({
      spend: input.netSpend,
      tierRate,
      birthdayActive: input.birthdayActive,
      categoryActive: input.categoryActive
    }).points
  }
  pointsEarned = Math.max(0, Math.floor(pointsEarned))

  let pointsRedeemed = Math.max(0, Math.floor(input.pointsRedeemed || 0))
  if (pointsRedeemed > 0 && !isValidFwbRedeemDenom(pointsRedeemed)) {
    warnings.push(`pointsRedeemed ${pointsRedeemed} is not a fixed FWB denom; still recording as adjust-style redeem`)
  }
  if (pointsRedeemed > account.pointsBalance) {
    warnings.push('Redeem exceeds balance; clamping to available points')
    pointsRedeemed = account.pointsBalance
  }

  const occurredAt = input.occurredAt || new Date().toISOString()
  const earnMeta = theoreticalExpiryFromEarnDate(occurredAt)
  const tierKey = normalizeFwbTierKey(account.tierKey) || 'F1'
  const frozen = tierKey === 'F2' || tierKey === 'F3'

  let earnBatch: FwbPointBatch | null = null
  if (pointsEarned > 0) {
    earnBatch = {
      batchId: `batch_${input.idempotencyKey.slice(0, 24)}_${Date.now().toString(36)}`,
      points: pointsEarned,
      pointsRemaining: pointsEarned,
      earnDate: earnMeta.earnDate,
      earnQuarter: earnMeta.earnQuarter,
      theoreticalExpiryDate: earnMeta.theoreticalExpiryDate,
      source: 'pos_sale',
      frozen
    }
    account.batches.push(earnBatch)
  }

  // FIFO redeem against soonest theoretical expiry
  let toRedeem = pointsRedeemed
  const sorted = [...account.batches].sort((a, b) =>
    a.theoreticalExpiryDate.localeCompare(b.theoreticalExpiryDate)
  )
  for (const batch of sorted) {
    if (toRedeem <= 0) break
    const take = Math.min(batch.pointsRemaining, toRedeem)
    batch.pointsRemaining -= take
    toRedeem -= take
  }

  account.pointsBalance = Math.max(0, account.pointsBalance - pointsRedeemed + pointsEarned)
  account.calendarYtdSpend = Math.max(0, account.calendarYtdSpend + Math.max(0, input.netSpend))
  const tierAfterRow = tierFromCalendarYtdSpend(account.calendarYtdSpend)
  account.tierKey = tierAfterRow.key
  demoAccounts.set(account.memberId, account)

  const ledgerEntryIds: string[] = []
  if (pointsEarned > 0) ledgerEntryIds.push(`led_earn_${input.idempotencyKey}`)
  if (pointsRedeemed > 0) ledgerEntryIds.push(`led_redeem_${input.idempotencyKey}`)

  const result: FwbCommitSaleResult = {
    commitId: `fwb_commit_${input.idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48)}`,
    saleId: input.saleId,
    status: 'committed',
    pointsEarned,
    pointsRedeemed,
    pointsBalanceAfter: account.pointsBalance,
    tierAfter: account.tierKey,
    calendarYtdSpendAfter: account.calendarYtdSpend,
    earnBatch,
    ledgerEntryIds,
    warnings
  }
  demoIdempotency.set(input.idempotencyKey, result)
  return result
}

/**
 * Jan 1 tier drop: if new tier is F1, expire batches whose theoretical expiry already passed.
 * PDF §2.4 — clock resumes only on F1.
 */
export function applyJan1ExpiryOnTierDrop(
  account: FwbMemberAccountState,
  newTier: FwbTierKey,
  asOf: Date = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1))
): { expiredPoints: number, survivingBatches: FwbPointBatch[] } {
  if (newTier !== 'F1') {
    return { expiredPoints: 0, survivingBatches: account.batches.map((b) => ({ ...b, frozen: true })) }
  }
  const asOfStr = asOf.toISOString().slice(0, 10)
  let expiredPoints = 0
  const surviving: FwbPointBatch[] = []
  for (const batch of account.batches) {
    if (batch.pointsRemaining <= 0) continue
    if (batch.theoreticalExpiryDate < asOfStr) {
      expiredPoints += batch.pointsRemaining
    } else {
      surviving.push({ ...batch, frozen: false })
    }
  }
  return { expiredPoints, survivingBatches: surviving }
}
