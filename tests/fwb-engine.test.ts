import { describe, expect, it, beforeEach } from 'vitest'
import {
  applyJan1ExpiryOnTierDrop,
  bestFwbRedeemDenom,
  commitFwbSale,
  computeFwbEarnPoints,
  FWB_REDEEM_DENOMS,
  FWB_TIER_RATES,
  getOrCreateDemoAccount,
  resetDemoLoyaltyState,
  theoreticalExpiryFromEarnDate,
  tierFromCalendarYtdSpend
} from '../server/fran/loyalty/fwb-engine'
import { buildDemoPosPolicyBundle } from '../server/fran/loyalty/pos-policy-bundle'
import { franLoyaltyV21Rules } from '../server/fran/loyalty/policy-versions'
import { commitSaleFromPayload } from '../server/fran/loyalty/commit-sale'

describe('FWB L-base engine', () => {
  beforeEach(() => {
    resetDemoLoyaltyState()
  })

  it('matches PDF §5 golden earn scenarios (additive stack)', () => {
    const cases = [
      { spend: 100, tier: 1.0, b: false, c: false, pts: 100 },
      { spend: 100, tier: 1.0, b: false, c: true, pts: 200 },
      { spend: 100, tier: 1.0, b: true, c: false, pts: 200 },
      { spend: 100, tier: 1.0, b: true, c: true, pts: 300 },
      { spend: 100, tier: 1.25, b: false, c: false, pts: 125 },
      { spend: 100, tier: 1.25, b: false, c: true, pts: 225 },
      { spend: 100, tier: 1.25, b: true, c: false, pts: 225 },
      { spend: 100, tier: 1.25, b: true, c: true, pts: 325 },
      { spend: 100, tier: 1.5, b: false, c: false, pts: 150 },
      { spend: 100, tier: 1.5, b: false, c: true, pts: 250 },
      { spend: 100, tier: 1.5, b: true, c: false, pts: 250 },
      { spend: 100, tier: 1.5, b: true, c: true, pts: 350 },
      { spend: 250, tier: 1.0, b: false, c: false, pts: 250 },
      { spend: 250, tier: 1.25, b: false, c: false, pts: 312 },
      { spend: 250, tier: 1.5, b: true, c: true, pts: 875 }
    ]
    for (const row of cases) {
      const r = computeFwbEarnPoints({
        spend: row.spend,
        tierRate: row.tier,
        birthdayActive: row.b,
        categoryActive: row.c
      })
      expect(r.points, JSON.stringify(row)).toBe(row.pts)
    }
  })

  it('uses fixed redeem dens from PDF §3', () => {
    expect(FWB_REDEEM_DENOMS.map((d) => [d.points, d.discount])).toEqual([
      [200, 6],
      [500, 20],
      [1000, 50],
      [1500, 90],
      [2500, 175]
    ])
    expect(bestFwbRedeemDenom(199)).toBeNull()
    expect(bestFwbRedeemDenom(500)?.discount).toBe(20)
    expect(FWB_TIER_RATES.F2).toBe(1.25)
  })

  it('stores theoretical expiry at end of anniversary quarter (PDF §2)', () => {
    // earn 2025-11-01 → anniversary 2026-11-01 → Q4 2026 → 2026-12-31
    const meta = theoreticalExpiryFromEarnDate('2025-11-01T00:00:00.000Z')
    expect(meta.theoreticalExpiryDate).toBe('2026-12-31')
    expect(meta.earnQuarter).toBe('Q4')
  })

  it('maps calendar YTD spend to F1/F2/F3 thresholds', () => {
    expect(tierFromCalendarYtdSpend(0).key).toBe('F1')
    expect(tierFromCalendarYtdSpend(499).key).toBe('F1')
    expect(tierFromCalendarYtdSpend(500).key).toBe('F2')
    expect(tierFromCalendarYtdSpend(1249).key).toBe('F2')
    expect(tierFromCalendarYtdSpend(1250).key).toBe('F3')
  })

  it('commit_sale is idempotent and credits batches', () => {
    getOrCreateDemoAccount('m1', {
      memberId: 'm1',
      pointsBalance: 1000,
      calendarYtdSpend: 100,
      tierKey: 'F1'
    })
    const a = commitFwbSale({
      saleId: 'sale-1',
      memberId: 'm1',
      idempotencyKey: 'idem-1',
      netSpend: 100,
      tierKey: 'F1',
      pointsEarned: 100
    })
    expect(a.status).toBe('committed')
    expect(a.pointsEarned).toBe(100)
    expect(a.pointsBalanceAfter).toBe(1100)
    expect(a.calendarYtdSpendAfter).toBe(200)
    expect(a.tierAfter).toBe('F1')
    expect(a.earnBatch?.theoreticalExpiryDate).toBeTruthy()

    const b = commitFwbSale({
      saleId: 'sale-1',
      memberId: 'm1',
      idempotencyKey: 'idem-1',
      netSpend: 100,
      tierKey: 'F1',
      pointsEarned: 100
    })
    expect(b.status).toBe('duplicate')
    expect(b.pointsBalanceAfter).toBe(1100)

    // Cross F2 with more spend (200 YTD + 400 → 600)
    const c = commitFwbSale({
      saleId: 'sale-2',
      memberId: 'm1',
      idempotencyKey: 'idem-2',
      netSpend: 400,
      tierKey: 'F1',
      pointsEarned: 400
    })
    expect(c.calendarYtdSpendAfter).toBe(600)
    expect(c.tierAfter).toBe('F2')
  })

  it('Jan 1 F1 drop expires past theoretical batches only', () => {
    const account = getOrCreateDemoAccount('drop1', {
      memberId: 'drop1',
      pointsBalance: 300,
      calendarYtdSpend: 100,
      tierKey: 'F1',
      batches: [
        {
          batchId: 'old',
          points: 100,
          pointsRemaining: 100,
          earnDate: '2026-01-01',
          earnQuarter: 'Q1',
          theoreticalExpiryDate: '2027-12-31',
          source: 'test',
          frozen: false
        },
        {
          batchId: 'expired',
          points: 200,
          pointsRemaining: 200,
          earnDate: '2025-01-01',
          earnQuarter: 'Q1',
          theoreticalExpiryDate: '2026-03-31',
          source: 'test',
          frozen: true
        }
      ]
    })
    const res = applyJan1ExpiryOnTierDrop(account, 'F1', new Date(Date.UTC(2028, 0, 1)))
    expect(res.expiredPoints).toBe(300)
  })

  it('policy rules and POS bundle use F1/F2/F3 keys', () => {
    expect(franLoyaltyV21Rules.tiers.map((t) => t.key)).toEqual(['F1', 'F2', 'F3'])
    const bundle = buildDemoPosPolicyBundle('ws1', 'fran-v2')
    expect(bundle.tiers.map((t) => t.key)).toEqual(['F1', 'F2', 'F3'])
    expect(bundle.redemption.fixedDenominations?.[0]).toMatchObject({ points: 200, discount: 6 })
    expect(bundle.earn.rounding).toBe('floor')
  })

  it('commit-sale handler payload works for POS shape', () => {
    const res = commitSaleFromPayload({
      saleId: 'pos-sale-9',
      idempotencyKey: 'pos-idem-9',
      memberId: 'fran-member-001',
      netSpend: 100,
      currency: 'SGD',
      pointsEarned: 125,
      pointsRedeemed: 0,
      session: {
        member: {
          tier: 'F2',
          pointsBalance: 2480,
          calendarYtdSpend: 620
        }
      }
    })
    expect(res.ok).toBe(true)
    expect(res.result.pointsEarned).toBe(125)
    expect(res.result.pointsBalanceAfter).toBe(2605)
  })
})
