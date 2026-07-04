import { describe, expect, it } from 'vitest'
import {
  buildTopCustomerPurchasesFromEvents,
  redactTopCustomerContact,
  resolveTopCustomersOptions
} from '../server/utils/fran-customer-purchase-analytics'

describe('Fran agent analytics tools', () => {
  it('builds date-ranged top customer purchase rows and chart data', () => {
    const options = resolveTopCustomersOptions({
      workspaceId: '11111111-1111-4111-8111-111111111111',
      from: '2026-06-30',
      to: '2026-07-04',
      limit: 2,
      metric: 'purchase_amount',
      includeContact: false
    }, '2026-07-04T08:00:00.000Z')
    const analytics = buildTopCustomerPurchasesFromEvents([
      {
        id: 'txn_001',
        eventType: 'pos.sale.completed',
        occurredAt: '2026-07-01T10:00:00.000Z',
        subject: { customerKey: 'crm:person_001' },
        context: {},
        payload: { totalMinor: 25000 }
      },
      {
        id: 'txn_002',
        eventType: 'pos.sale.completed',
        occurredAt: '2026-07-02T10:00:00.000Z',
        subject: { personId: 'person_002' },
        context: {},
        payload: { total: 180 }
      },
      {
        id: 'txn_003',
        eventType: 'pos.sale.completed',
        occurredAt: '2026-07-03T10:00:00.000Z',
        subject: { customerKey: 'crm:person_001' },
        context: {},
        payload: { totalMinor: 12000 }
      }
    ], [
      { id: 'person_001', name: 'Ava Tan', mobile: '+65 8123 4470', tier: 'Gold' },
      { id: 'person_002', name: 'Maya Lim', mobile: '+65 8222 1140', tier: 'Silver' }
    ], options, 'supabase', '2026-07-04T08:00:00.000Z')

    expect(analytics.topCustomers.map((row) => row.personId)).toEqual(['person_001', 'person_002'])
    expect(analytics.topCustomers[0]).toMatchObject({
      name: 'Ava Tan',
      purchaseCount: 2,
      grossSpendMinor: 37000
    })
    expect(analytics.chart.data).toEqual([
      { personId: 'person_001', label: 'Ava Tan', value: 37000 },
      { personId: 'person_002', label: 'Maya Lim', value: 18000 }
    ])
  })

  it('can redact contact fields for staff without contact-read permission', () => {
    const options = resolveTopCustomersOptions({
      workspaceId: '11111111-1111-4111-8111-111111111111',
      from: '2026-06-30',
      to: '2026-07-04',
      limit: 1,
      metric: 'purchase_count',
      includeContact: true
    })
    const analytics = buildTopCustomerPurchasesFromEvents([
      {
        id: 'txn_001',
        eventType: 'pos.sale.completed',
        occurredAt: '2026-07-01T10:00:00.000Z',
        subject: { personId: 'person_001' },
        context: {},
        payload: { totalMinor: 25000 }
      }
    ], [
      { id: 'person_001', name: 'Ava Tan', mobile: '+65 8123 4470', tier: 'Gold' }
    ], options)

    expect(redactTopCustomerContact(analytics).topCustomers[0].mobile).toBeNull()
  })
})
