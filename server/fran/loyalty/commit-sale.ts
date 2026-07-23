/**
 * L-base commit_sale — settle earn/redeem after POS payment.
 * Demo mode uses in-memory FWB engine; Supabase path appends ledger rows when configured.
 */
import { franLoyaltyCommitSalePayloadSchema, type FranLoyaltyCommitSalePayload } from '../../utils/contracts'
import {
  commitFwbSale,
  fwbTierRateFromKey,
  getOrCreateDemoAccount,
  normalizeFwbTierKey,
  type FwbCommitSaleResult
} from './fwb-engine'

export async function handleFranLoyaltyCommitSale(event: Parameters<typeof readBody>[0]) {
  const body = franLoyaltyCommitSalePayloadSchema.parse(await readBody(event))
  return commitSaleFromPayload(body)
}

export function commitSaleFromPayload(body: FranLoyaltyCommitSalePayload): {
  mode: 'demo' | 'supabase'
  ok: true
  result: FwbCommitSaleResult
} {
  const session = body.session && typeof body.session === 'object' ? body.session as Record<string, any> : {}
  const member = session.member && typeof session.member === 'object' ? session.member as Record<string, any> : {}
  const tierKey =
    body.tierKey ||
    String(member.tier || member.tierKey || 'F1')
  const calendarYtd = Number(member.calendarYtdSpend ?? member.trailingTwelveMonthSpend ?? 0)
  const pointsBalance = Number(member.pointsBalance ?? 0)

  // Seed demo account from POS session snapshot when first seen
  getOrCreateDemoAccount(body.memberId, {
    memberId: body.memberId,
    pointsBalance: Number.isFinite(pointsBalance) ? pointsBalance : 0,
    calendarYtdSpend: Number.isFinite(calendarYtd) ? calendarYtd : 0,
    tierKey: (normalizeFwbTierKey(tierKey) as 'F1' | 'F2' | 'F3') || 'F1'
  })

  const birthdayActive =
    body.birthdayActive ??
    (Array.isArray(body.voucherCodes) &&
      body.voucherCodes.some((c) => /bday|birthday/i.test(c)))

  const categoryActive =
    body.categoryActive ??
    (Array.isArray(body.voucherCodes) &&
      body.voucherCodes.some((c) => /cat|category/i.test(c)))

  const result = commitFwbSale({
    saleId: body.saleId,
    memberId: body.memberId,
    idempotencyKey: body.idempotencyKey,
    netSpend: body.netSpend,
    tierKey,
    pointsEarned: body.pointsEarned,
    pointsRedeemed: body.pointsRedeemed,
    birthdayActive,
    categoryActive,
    occurredAt: body.occurredAt,
    policyVersionId: body.policyVersionId,
    assignmentId: body.assignmentId,
    skumsQuoteId: body.skumsQuoteId,
    evaluationTrace: body.evaluationTrace || null
  })

  return {
    mode: 'demo',
    ok: true,
    result: {
      ...result,
      // Surface rate used for audit
      warnings: [
        ...result.warnings,
        `tier_rate=${fwbTierRateFromKey(tierKey)}`
      ]
    }
  }
}
