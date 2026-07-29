/**
 * FWB loyalty simulator — pure, offline, no network.
 *
 * Every number here comes from `constitution.ts`, the same module the CRM ledger
 * settles with. The simulator adds the parts the constitution deliberately leaves
 * to the caller: session mode, campaign windows, earn basis, and the counter-side
 * ordering of redeem vs earn.
 */
import {
  computeFwbEarnPoints,
  fwbRedeemOptions,
  fwbTierRateFromKey,
  isValidFwbRedeemDenom,
  redeemDiscountForPoints,
  settleFwbSale,
  tierFromCalendarYtdSpend,
  type FwbEarnResult,
  type FwbMemberAccountState,
  type FwbPointBatch,
  type FwbRedeemOption,
  type FwbTierKey
} from './constitution'

/** Counter identity. Only `member` earns or redeems (brief §2). */
export type SessionMode = 'member' | 'non_member' | 'tourist'

/**
 * Whether earn is computed on spend before or after the points discount.
 * The brief (§11) requires this to be explicit because the two answers differ.
 */
export type EarnBasis = 'pre_redeem' | 'post_redeem'

export interface SimCampaign {
  code: string
  label: string
  /** Additive rate bump, e.g. 0.5 or 1. Never a multiplier. */
  add: number
  /** ISO date. Omit for always-on. */
  startsAt?: string
  endsAt?: string
}

export interface SimMember {
  memberRef: string
  tierKey: FwbTierKey
  pointsBalance: number
  calendarYtdSpend: number
  batches?: FwbPointBatch[]
}

export interface SimInput {
  mode: SessionMode
  member: SimMember
  /** SKUMS prices the basket; the simulator never re-prices it. */
  basket: {
    grossSpend: number
    /** Non-loyalty discount already applied by SKUMS (promo, markdown). */
    lineDiscount: number
  }
  /** Birthday voucher scanned at the counter → +1.00 (brief §4.5). */
  birthdayVoucher: boolean
  /** Category voucher scanned → +1.00. */
  categoryVoucher: boolean
  campaigns: SimCampaign[]
  /** Fixed dens the cashier selected, or null. */
  redeemPoints: number | null
  earnBasis: EarnBasis
  occurredAt: string
  saleId: string
  idempotencyKey: string
}

export interface MultiplierPart {
  key: 'tier' | 'birthday' | 'category' | 'campaign'
  label: string
  value: number
}

export interface SimReport {
  input: SimInput
  /** Whether this session may earn / redeem at all. */
  capability: { canEarn: boolean, canRedeem: boolean, reason: string | null }
  spend: {
    gross: number
    lineDiscount: number
    eligible: number
    /** The figure actually multiplied — differs from `eligible` under post_redeem. */
    earnBasisSpend: number
  }
  campaigns: Array<SimCampaign & { live: boolean, reason: string }>
  earn: FwbEarnResult
  multiplierParts: MultiplierPart[]
  redeem: {
    requestedPoints: number | null
    appliedPoints: number
    discount: number
    valid: boolean
    affordable: boolean
    options: FwbRedeemOption[]
  }
  tender: {
    /** What the customer pays after the points discount. */
    net: number
  }
  settlement: {
    pointsEarned: number
    pointsRedeemed: number
    balanceBefore: number
    balanceAfter: number
    tierBefore: FwbTierKey
    tierAfter: FwbTierKey
    ytdBefore: number
    ytdAfter: number
    tierChanged: boolean
    earnBatch: FwbPointBatch | null
    ledgerEntryIds: string[]
  }
  /** Outstanding points valued at the best conversion rate (worst case for the business). */
  liability: {
    valuePerPoint: number
    before: number
    after: number
    delta: number
  }
  warnings: string[]
}

/** Best conversion in the dens table (2500 → $175). Worst-case liability per point. */
export const FWB_WORST_CASE_VALUE_PER_POINT = 175 / 2500

export function isCampaignLive(campaign: SimCampaign, atIso: string): boolean {
  const at = new Date(atIso).getTime()
  if (Number.isNaN(at)) return false
  if (campaign.startsAt && at < new Date(campaign.startsAt).getTime()) return false
  if (campaign.endsAt && at > new Date(campaign.endsAt).getTime()) return false
  return true
}

function campaignReason(campaign: SimCampaign, atIso: string): string {
  const at = new Date(atIso).getTime()
  if (campaign.startsAt && at < new Date(campaign.startsAt).getTime()) {
    return `Starts ${campaign.startsAt.slice(0, 10)} — not yet live`
  }
  if (campaign.endsAt && at > new Date(campaign.endsAt).getTime()) {
    return `Ended ${campaign.endsAt.slice(0, 10)} — no longer live`
  }
  if (!campaign.startsAt && !campaign.endsAt) return 'Always on'
  return 'Live in window'
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Run one counter scenario end to end: identity → basket → vouchers → campaigns →
 * redeem → earn → commit.
 */
export function runSimulation(input: SimInput): SimReport {
  const warnings: string[] = []

  const canEarn = input.mode === 'member'
  const canRedeem = input.mode === 'member'
  const capabilityReason = canEarn
    ? null
    : input.mode === 'tourist'
      ? 'Tourist sessions never earn or redeem.'
      : 'Non-member sessions never earn or redeem.'
  if (capabilityReason) warnings.push(capabilityReason)

  const gross = Math.max(0, input.basket.grossSpend)
  const lineDiscount = Math.max(0, input.basket.lineDiscount)
  const eligible = round2(Math.max(0, gross - lineDiscount))

  const campaigns = input.campaigns.map((campaign) => ({
    ...campaign,
    live: isCampaignLive(campaign, input.occurredAt),
    reason: campaignReason(campaign, input.occurredAt)
  }))
  const droppedCampaigns = campaigns.filter((c) => !c.live)
  for (const dropped of droppedCampaigns) {
    warnings.push(`Campaign ${dropped.code} excluded: ${dropped.reason.toLowerCase()}.`)
  }

  // --- Redeem ---------------------------------------------------------------
  const options = fwbRedeemOptions(input.member.pointsBalance)
  const requestedPoints = input.redeemPoints
  let appliedPoints = 0
  let valid = true
  let affordable = true

  if (requestedPoints != null && requestedPoints > 0) {
    valid = isValidFwbRedeemDenom(requestedPoints)
    affordable = input.member.pointsBalance >= requestedPoints

    if (!canRedeem) {
      warnings.push(`Redeem of ${requestedPoints} pts ignored — session cannot redeem.`)
    } else if (!valid) {
      warnings.push(
        `${requestedPoints} pts is not a fixed denomination. FWB redeems only 200 / 500 / 1000 / 1500 / 2500.`
      )
    } else if (!affordable) {
      warnings.push(
        `Balance ${input.member.pointsBalance} pts cannot cover the ${requestedPoints} pt denomination.`
      )
    } else {
      appliedPoints = requestedPoints
    }
  }

  const discount = appliedPoints > 0 ? (redeemDiscountForPoints(appliedPoints) ?? 0) : 0

  // --- Earn -----------------------------------------------------------------
  const earnBasisSpend = round2(
    input.earnBasis === 'post_redeem' ? Math.max(0, eligible - discount) : eligible
  )

  const tierRate = fwbTierRateFromKey(input.member.tierKey)
  const liveCampaignAdds = campaigns.filter((c) => c.live).map((c) => c.add)

  const earn = canEarn
    ? computeFwbEarnPoints({
        spend: earnBasisSpend,
        tierRate,
        birthdayActive: input.birthdayVoucher,
        categoryActive: input.categoryVoucher,
        campaignAdds: liveCampaignAdds
      })
    : {
        tierRate: 0,
        birthdayAdd: 0,
        categoryAdd: 0,
        campaignAdd: 0,
        totalMultiplier: 0,
        points: 0
      }

  const multiplierParts: MultiplierPart[] = []
  if (earn.tierRate > 0) {
    multiplierParts.push({ key: 'tier', label: `${input.member.tierKey} tier rate`, value: earn.tierRate })
  }
  if (earn.birthdayAdd > 0) {
    multiplierParts.push({ key: 'birthday', label: 'Birthday voucher', value: earn.birthdayAdd })
  }
  if (earn.categoryAdd > 0) {
    multiplierParts.push({ key: 'category', label: 'Category voucher', value: earn.categoryAdd })
  }
  for (const campaign of campaigns.filter((c) => c.live)) {
    multiplierParts.push({ key: 'campaign', label: campaign.label, value: campaign.add })
  }

  // --- Commit ---------------------------------------------------------------
  const priorAccount: FwbMemberAccountState = {
    memberId: input.member.memberRef,
    pointsBalance: input.member.pointsBalance,
    calendarYtdSpend: input.member.calendarYtdSpend,
    tierKey: input.member.tierKey,
    batches: input.member.batches ? input.member.batches.map((b) => ({ ...b })) : []
  }

  const settlement = settleFwbSale(
    {
      saleId: input.saleId,
      memberId: input.member.memberRef,
      idempotencyKey: input.idempotencyKey,
      // Non-member/tourist spend must not move loyalty YTD.
      netSpend: canEarn ? eligible : 0,
      tierKey: input.member.tierKey,
      // Passed explicitly: settleFwbSale does not accept campaignAdds, so letting
      // it recompute would silently drop live campaigns. See the findings section.
      pointsEarned: earn.points,
      pointsRedeemed: appliedPoints,
      occurredAt: input.occurredAt
    },
    priorAccount
  )
  warnings.push(...settlement.result.warnings)

  const tierBefore = input.member.tierKey
  const tierAfter = canEarn ? settlement.result.tierAfter : tierBefore
  const ytdAfter = canEarn ? settlement.result.calendarYtdSpendAfter : input.member.calendarYtdSpend
  const balanceAfter = canEarn || appliedPoints > 0
    ? settlement.result.pointsBalanceAfter
    : input.member.pointsBalance

  if (canEarn && tierAfter !== tierBefore) {
    const row = tierFromCalendarYtdSpend(ytdAfter)
    warnings.push(
      `Crossed the ${row.label} threshold at $${row.annualSpend} YTD — earn rate is now ${row.earnRate}× on the next sale.`
    )
  }

  const liabilityBefore = round2(input.member.pointsBalance * FWB_WORST_CASE_VALUE_PER_POINT)
  const liabilityAfter = round2(balanceAfter * FWB_WORST_CASE_VALUE_PER_POINT)

  return {
    input,
    capability: { canEarn, canRedeem, reason: capabilityReason },
    spend: { gross, lineDiscount, eligible, earnBasisSpend },
    campaigns,
    earn,
    multiplierParts,
    redeem: {
      requestedPoints,
      appliedPoints,
      discount,
      valid,
      affordable,
      options
    },
    tender: { net: round2(Math.max(0, eligible - discount)) },
    settlement: {
      pointsEarned: earn.points,
      pointsRedeemed: appliedPoints,
      balanceBefore: input.member.pointsBalance,
      balanceAfter,
      tierBefore,
      tierAfter,
      ytdBefore: input.member.calendarYtdSpend,
      ytdAfter,
      tierChanged: tierAfter !== tierBefore,
      earnBatch: settlement.newEarnBatch,
      ledgerEntryIds: settlement.result.ledgerEntryIds
    },
    liability: {
      valuePerPoint: FWB_WORST_CASE_VALUE_PER_POINT,
      before: liabilityBefore,
      after: liabilityAfter,
      delta: round2(liabilityAfter - liabilityBefore)
    },
    warnings
  }
}
