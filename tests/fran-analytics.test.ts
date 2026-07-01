import { describe, expect, it } from 'vitest'
import { buildFranAnalyticsFromMembers, normalizeFranTier } from '../server/utils/fran-analytics'

describe('Fran loyalty analytics', () => {
  it('normalizes tracked member tiers', () => {
    expect(normalizeFranTier('bronze')).toBe('Bronze')
    expect(normalizeFranTier('Silver')).toBe('Silver')
    expect(normalizeFranTier(' GOLD ')).toBe('Gold')
    expect(normalizeFranTier('Platinum')).toBeNull()
  })

  it('builds snapshot, signup, and cycle aggregates', () => {
    const analytics = buildFranAnalyticsFromMembers([
      { id: 'person_001', name: 'Bronze One', mobile: '+65 8000 0001', birthday: '1992-07-11', tier: 'Bronze', memberSince: '2026-06-01', createdAt: '2026-06-01T00:00:00.000Z', pointsBalance: 1000, pointsExpiringSoon: 200, pointsExpiryDate: '2026-07-15' },
      { id: 'person_002', name: 'Silver Two', mobile: '+65 8000 0002', birthday: '1990-01-11', tier: 'Silver', memberSince: '2026-06-01', createdAt: '2026-06-01T00:00:00.000Z', pointsBalance: 2000, pointsExpiringSoon: 0, pointsExpiryDate: null },
      { id: 'person_003', name: 'Gold Three', mobile: '+65 8000 0003', birthday: '1995-07-22', tier: 'Gold', memberSince: '2026-06-08', createdAt: '2026-06-08T00:00:00.000Z', pointsBalance: 3000, pointsExpiringSoon: 600, pointsExpiryDate: '2026-08-20' },
      { id: 'person_004', name: 'Gold Four', mobile: '+65 8000 0004', birthday: '1988-04-04', tier: 'Gold', memberSince: null, createdAt: '2026-06-15T00:00:00.000Z', pointsBalance: 4000, pointsExpiringSoon: 100, pointsExpiryDate: null },
      { id: 'person_005', name: 'Unassigned Five', mobile: '+65 8000 0005', birthday: '1987-12-05', tier: null, memberSince: '2026-06-15', createdAt: '2026-06-15T00:00:00.000Z', pointsBalance: 0, pointsExpiringSoon: 0, pointsExpiryDate: null }
    ], [
      {
        id: 'cycle_001',
        cycleKey: '2026-06',
        label: 'June 2026',
        evaluatedAt: '2026-06-30T23:59:00.000Z',
        memberCount: 5,
        bronzeCount: 1,
        silverCount: 1,
        goldCount: 3,
        upgradedCount: 2,
        downgradedCount: 1,
        retainedCount: 2,
        source: 'test'
      }
    ], 'supabase', '2026-07-01T00:00:00.000Z', undefined, {
      from: '2026-06-01',
      to: '2026-06-30',
      pointValueMinor: 1,
      expiryWindowDays: 45,
      topLimit: 2,
      atRiskDays: 60,
      lapsedFromDays: 90,
      lapsedToDays: 180
    }, [
      { id: 'event_001', occurredAt: '2026-06-01T12:00:00.000Z', issued: 1000, redeemed: 0 },
      { id: 'event_002', occurredAt: '2026-06-15T12:00:00.000Z', issued: 500, redeemed: 250 },
      { id: 'event_003', occurredAt: '2026-07-01T12:00:00.000Z', issued: 900, redeemed: 0 }
    ], [
      { id: 'txn_001', personId: 'person_001', occurredAt: '2026-06-20T12:00:00.000Z', amountMinor: 10000 },
      { id: 'txn_002', personId: 'person_002', occurredAt: '2026-04-20T12:00:00.000Z', amountMinor: 25000 },
      { id: 'txn_003', personId: 'person_003', occurredAt: '2026-02-01T12:00:00.000Z', amountMinor: 50000, campaignId: 'campaign_001', campaignName: 'Hydration Week' },
      { id: 'txn_004', personId: 'person_004', occurredAt: '2026-03-20T12:00:00.000Z', amountMinor: 45000 },
      { id: 'txn_005', personId: 'person_003', occurredAt: '2025-06-20T12:00:00.000Z', amountMinor: 30000 }
    ], [
      { id: 'campaign_001_reach', campaignId: 'campaign_001', campaignName: 'Hydration Week', eventType: 'campaign.member_reached', occurredAt: '2026-02-01T00:00:00.000Z', personId: null, membersReached: 120, transactions: 0, pointsAwarded: 0, revenueMinor: 0, startDate: '2026-02-01', endDate: '2026-02-07' },
      { id: 'campaign_001_txn', campaignId: 'campaign_001', campaignName: 'Hydration Week', eventType: 'commerce.transaction.completed', occurredAt: '2026-02-01T12:00:00.000Z', personId: 'person_003', membersReached: 0, transactions: 1, pointsAwarded: 0, revenueMinor: 50000, startDate: '2026-02-01', endDate: '2026-02-07' },
      { id: 'campaign_001_points', campaignId: 'campaign_001', campaignName: 'Hydration Week', eventType: 'loyalty.points.issued', occurredAt: '2026-02-01T12:00:00.000Z', personId: 'person_003', membersReached: 0, transactions: 0, pointsAwarded: 500, revenueMinor: 0, startDate: '2026-02-01', endDate: '2026-02-07' }
    ])

    expect(analytics.snapshot.totalMembers).toBe(5)
    expect(analytics.snapshot.unassignedCount).toBe(1)
    expect(analytics.snapshot.tierCounts).toEqual([
      { tier: 'Bronze', count: 1, share: 0.2 },
      { tier: 'Silver', count: 1, share: 0.2 },
      { tier: 'Gold', count: 2, share: 0.4 }
    ])
    expect(analytics.signupTrends.day.find((point) => point.period === '2026-06-01')?.count).toBe(2)
    expect(analytics.signupTrends.week.map((point) => point.count)).toEqual([2, 1, 2])
    expect(analytics.signupTrends.month).toEqual([{ period: '2026-06', count: 5, cumulative: 5 }])
    expect(analytics.evaluationCycles[0].upgradedCount).toBe(2)
    expect(analytics.evaluationCycles[0].downgradedCount).toBe(1)
    expect(analytics.loyaltyPoints.dateRange).toEqual({ from: '2026-06-01', to: '2026-06-30' })
    expect(analytics.loyaltyPoints.totalIssued).toBe(1500)
    expect(analytics.loyaltyPoints.totalRedeemed).toBe(250)
    expect(analytics.loyaltyPoints.redemptionRate).toBeCloseTo(1 / 6)
    expect(analytics.loyaltyPoints.outstandingPoints).toBe(10000)
    expect(analytics.loyaltyPoints.liabilityMinor).toBe(10000)
    expect(analytics.loyaltyPoints.expiringPoints).toBe(300)
    expect(analytics.loyaltyPoints.expiringMemberCount).toBe(2)
    expect(analytics.loyaltyPoints.nextExpiryDate).toBe('2026-07-15')
    expect(analytics.loyaltyPoints.trend).toHaveLength(30)
    expect(analytics.customerAnalytics.topSpenders.lifetime.map((row) => row.id)).toEqual(['person_003', 'person_004'])
    expect(analytics.customerAnalytics.topSpenders.trailing12Month.map((row) => row.id)).toEqual(['person_003', 'person_004'])
    expect(analytics.customerAnalytics.atRiskCustomers.map((row) => row.id)).toEqual(['person_002'])
    expect(analytics.customerAnalytics.lapsedCustomers.map((row) => row.id)).toEqual(['person_003', 'person_004'])
    expect(analytics.customerAnalytics.birthdayMembers.map((row) => row.id)).toEqual(['person_001', 'person_003'])
    expect(analytics.customerAnalytics.campaignPerformance).toEqual([{
      id: 'campaign_001',
      name: 'Hydration Week',
      membersReached: 120,
      transactions: 1,
      pointsAwarded: 500,
      revenueMinor: 50000,
      startDate: '2026-02-01',
      endDate: '2026-02-07'
    }])
  })
})
