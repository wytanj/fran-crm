import { describe, expect, it } from 'vitest'
import { SCENARIOS, scenarioById } from '../shared/fwb/scenarios'
import { runSimulation, isCampaignLive } from '../shared/fwb/simulate'
import { computeFwbEarnPoints, fwbRedeemOptions } from '../shared/fwb/constitution'
import { computeFwbEarnPoints as engineEarn } from '../server/fran/loyalty/fwb-engine'

describe('FWB simulator', () => {
  it('runs the server engine, not a second copy of the math', () => {
    // The server module must re-export the shared constitution, or the simulator
    // and the ledger could drift.
    expect(engineEarn).toBe(computeFwbEarnPoints)
  })

  it('every scenario produces the outcome it advertises', () => {
    for (const scenario of SCENARIOS) {
      const report = runSimulation(scenario.input)
      const where = `${scenario.id}: ${scenario.title}`

      expect(report.earn.points, `${where} — points`).toBe(scenario.expect.points)
      expect(report.earn.totalMultiplier, `${where} — multiplier`).toBe(scenario.expect.multiplier)
      expect(report.settlement.balanceAfter, `${where} — balance`).toBe(scenario.expect.balanceAfter)

      if (scenario.expect.tierAfter != null) {
        expect(report.settlement.tierAfter, `${where} — tier`).toBe(scenario.expect.tierAfter)
      }
      if (scenario.expect.discount != null) {
        expect(report.redeem.discount, `${where} — discount`).toBe(scenario.expect.discount)
      }
      if (scenario.expect.netTender != null) {
        expect(report.tender.net, `${where} — net tender`).toBe(scenario.expect.netTender)
      }
    }
  })

  it('has at least one scenario per group so the tour has no gaps', () => {
    for (const group of ['earn', 'redeem', 'stacking', 'lifecycle', 'session'] as const) {
      expect(SCENARIOS.filter((s) => s.group === group).length, group).toBeGreaterThan(0)
    }
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length)
  })

  it('stacks additively — never multiplicatively', () => {
    const report = runSimulation(scenarioById('additive-not-multiplicative')!.input)
    expect(report.earn.totalMultiplier).toBe(3.25)
    expect(report.earn.points).toBe(325)
    // The multiplicative reading of the same inputs would be 1.25 * 2 * 2 = 5.
    expect(report.earn.points).not.toBe(500)
  })

  it('earn basis changes the answer on the same basket', () => {
    const pre = runSimulation(scenarioById('dens-best-affordable')!.input)
    const post = runSimulation(scenarioById('earn-basis-post-redeem')!.input)

    expect(pre.spend.earnBasisSpend).toBe(80)
    expect(post.spend.earnBasisSpend).toBe(60)
    expect(pre.earn.points).toBe(180)
    expect(post.earn.points).toBe(135)
    // Same tender either way — only the points differ.
    expect(pre.tender.net).toBe(post.tender.net)
  })

  it('drops campaigns outside their window', () => {
    const report = runSimulation(scenarioById('campaign-window-expired')!.input)
    const june = report.campaigns.find((c) => c.code === 'JUNE-BOOST')!
    const always = report.campaigns.find((c) => c.code === 'ALWAYS-ON')!

    expect(june.live).toBe(false)
    expect(always.live).toBe(true)
    expect(report.earn.campaignAdd).toBe(0.25)
    expect(report.warnings.some((w) => w.includes('JUNE-BOOST'))).toBe(true)
  })

  it('honours campaign start and end boundaries', () => {
    const campaign = { code: 'X', label: 'X', add: 1, startsAt: '2026-07-01T00:00:00.000Z', endsAt: '2026-07-31T00:00:00.000Z' }
    expect(isCampaignLive(campaign, '2026-06-30T23:59:59.000Z')).toBe(false)
    expect(isCampaignLive(campaign, '2026-07-15T00:00:00.000Z')).toBe(true)
    expect(isCampaignLive(campaign, '2026-08-01T00:00:00.000Z')).toBe(false)
    expect(isCampaignLive({ code: 'Y', label: 'Y', add: 1 }, '2030-01-01T00:00:00.000Z')).toBe(true)
  })

  it('rejects denominations outside the fixed table instead of converting them', () => {
    const report = runSimulation(scenarioById('invalid-denomination')!.input)
    expect(report.redeem.valid).toBe(false)
    expect(report.redeem.appliedPoints).toBe(0)
    expect(report.redeem.discount).toBe(0)
    expect(report.warnings.some((w) => w.includes('not a fixed denomination'))).toBe(true)
  })

  it('refuses a denomination the balance cannot cover', () => {
    const report = runSimulation(scenarioById('insufficient-points')!.input)
    expect(report.redeem.affordable).toBe(false)
    expect(report.redeem.appliedPoints).toBe(0)
    expect(report.redeem.options.every((o) => !o.affordable)).toBe(true)
  })

  it('blocks earn and redeem for non-member and tourist sessions', () => {
    for (const id of ['non-member', 'tourist-with-balance']) {
      const report = runSimulation(scenarioById(id)!.input)
      expect(report.capability.canEarn, id).toBe(false)
      expect(report.capability.canRedeem, id).toBe(false)
      expect(report.earn.points, id).toBe(0)
      expect(report.redeem.appliedPoints, id).toBe(0)
      // Spend must not advance loyalty YTD for these sessions.
      expect(report.settlement.ytdAfter, id).toBe(report.settlement.ytdBefore)
    }
  })

  it('reports a tier crossing without back-dating the new rate', () => {
    const report = runSimulation(scenarioById('tier-crossing')!.input)
    expect(report.settlement.tierBefore).toBe('F1')
    expect(report.settlement.tierAfter).toBe('F2')
    // Earned at the old rate.
    expect(report.earn.tierRate).toBe(1)
    expect(report.earn.points).toBe(100)
    expect(report.warnings.some((w) => w.includes('Tier 2'))).toBe(true)
  })

  it('freezes batches earned in F2/F3 and leaves F1 batches running', () => {
    expect(runSimulation(scenarioById('expiry-freeze')!.input).settlement.earnBatch?.frozen).toBe(true)
    expect(runSimulation(scenarioById('baseline-f1')!.input).settlement.earnBatch?.frozen).toBe(false)
  })

  it('exposes dens conversion improving with denomination size', () => {
    const options = fwbRedeemOptions(3000)
    const rates = options.map((o) => o.valuePerPoint)
    expect(rates).toEqual([...rates].sort((a, b) => a - b))
    expect(options.every((o) => o.affordable)).toBe(true)
    expect(options.find((o) => o.best)?.points).toBe(2500)
  })

  it('values outstanding points at the best conversion rate', () => {
    const report = runSimulation(scenarioById('baseline-f1')!.input)
    expect(report.liability.valuePerPoint).toBeCloseTo(0.07, 5)
    expect(report.liability.delta).toBeCloseTo(7, 5)
  })

  it('emits ledger subkeys for the entries it wrote', () => {
    const report = runSimulation(scenarioById('dens-best-affordable')!.input)
    expect(report.settlement.ledgerEntryIds).toEqual([
      'idem-dens-best-affordable:earn',
      'idem-dens-best-affordable:redeem'
    ])
  })
})
