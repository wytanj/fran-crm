/**
 * L-base commit_sale — settle earn/redeem after POS payment.
 * Uses Supabase when workspaceId + service role available; else in-memory demo.
 */
import {
  franLoyaltyCommitSalePayloadSchema,
  type FranLoyaltyCommitSalePayload
} from '../../utils/contracts'
import { persistCommitSale } from './commit-sale-persist'
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

export async function commitSaleFromPayload(body: FranLoyaltyCommitSalePayload): Promise<{
  mode: 'demo' | 'supabase'
  ok: true
  result: FwbCommitSaleResult
}> {
  const supabase = typeof useSupabaseAdmin === 'function' ? useSupabaseAdmin() : null

  if (supabase && body.workspaceId) {
    try {
      return await persistCommitSale(supabase, body)
    } catch (e: any) {
      // Fall back to demo if persistence fails without a real workspace DB
      const msg = e?.message || String(e)
      if (/workspaceId|uuid|Failed to ensure loyalty program/i.test(msg) && !body.workspaceId) {
        // continue to demo
      } else if (body.workspaceId) {
        // Surface persistence errors when caller asked for a real workspace
        throw createError({
          statusCode: 500,
          statusMessage: msg,
          message: msg
        })
      }
    }
  }

  return commitSaleDemo(body)
}

function commitSaleDemo(body: FranLoyaltyCommitSalePayload): {
  mode: 'demo'
  ok: true
  result: FwbCommitSaleResult
} {
  const session =
    body.session && typeof body.session === 'object' ? (body.session as Record<string, any>) : {}
  const member =
    session.member && typeof session.member === 'object'
      ? (session.member as Record<string, any>)
      : {}
  const tierKey = body.tierKey || String(member.tier || member.tierKey || 'F1')
  const calendarYtd = Number(member.calendarYtdSpend ?? member.trailingTwelveMonthSpend ?? 0)
  const pointsBalance = Number(member.pointsBalance ?? 0)

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
      warnings: [...result.warnings, `tier_rate=${fwbTierRateFromKey(tierKey)}`, 'mode:demo']
    }
  }
}
