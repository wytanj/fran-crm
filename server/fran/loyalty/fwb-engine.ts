/**
 * L-base — Fran's With Benefits engine (loyaltys.pdf).
 * CRM ledger authority: earn formula, fixed dens, theoretical expiry, tier YTD.
 * POS evaluates previews; CRM settles via commit_sale.
 *
 * The pure constitution lives in `shared/fwb/constitution.ts` so the browser
 * simulator runs the same math. This module re-exports it and adds the
 * in-memory demo store used when there is no durable workspace.
 */
import {
  cloneFwbAccount,
  computeFwbEarnPoints,
  normalizeFwbTierKey,
  settleFwbSale,
  type FwbCommitSaleInput,
  type FwbCommitSaleResult,
  type FwbMemberAccountState,
  type FwbTierKey
} from '#shared/fwb/constitution'

export {
  applyJan1ExpiryOnTierDrop,
  bestFwbRedeemDenom,
  cloneFwbAccount,
  computeFwbEarnPoints,
  FWB_REDEEM_DENOMS,
  FWB_TIER_RATES,
  FWB_TIER_THRESHOLDS_SGD,
  fwbRedeemOptions,
  fwbTierRateFromKey,
  isValidFwbRedeemDenom,
  normalizeFwbTierKey,
  redeemDiscountForPoints,
  settleFwbSale,
  theoreticalExpiryFromEarnDate,
  tierFromCalendarYtdSpend
} from '#shared/fwb/constitution'

export type {
  FwbCommitSaleInput,
  FwbCommitSaleResult,
  FwbEarnInput,
  FwbEarnResult,
  FwbMemberAccountState,
  FwbPointBatch,
  FwbRedeemOption,
  FwbSettlement,
  FwbTierKey
} from '#shared/fwb/constitution'

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
 * Demo/in-memory commit_sale (idempotent by key).
 */
export function commitFwbSale(
  input: FwbCommitSaleInput,
  prior?: FwbMemberAccountState
): FwbCommitSaleResult {
  const dup = demoIdempotency.get(input.idempotencyKey)
  if (dup) {
    return { ...dup, status: 'duplicate' }
  }

  const base = prior
    ? cloneFwbAccount(prior)
    : getOrCreateDemoAccount(input.memberId)

  const settlement = settleFwbSale(input, base)
  demoAccounts.set(settlement.account.memberId, settlement.account)
  demoIdempotency.set(input.idempotencyKey, settlement.result)
  return settlement.result
}

// Re-exported for callers that previously imported the earn helper from here.
export const __fwbEarn = computeFwbEarnPoints
