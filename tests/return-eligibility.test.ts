import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { returnEligibilityPayloadSchema } from '../server/utils/contracts'
import { buildCommerceOrderProjection, buildCommerceReturnProjection } from '../server/utils/commerce-projections'
import {
  createReturnEligibilityRequestHash,
  evaluateReturnEligibility,
  type CommerceOrderLineCandidate
} from '../server/utils/return-eligibility'

const migration = readFileSync(join(process.cwd(), 'supabase/migrations/0005_return_eligibility.sql'), 'utf8')

const baseRequest = returnEligibilityPayloadSchema.parse({
  workspaceId: '11111111-1111-4111-8111-111111111111',
  sourceSystem: 'pos',
  customer: { email: 'AVA@EXAMPLE.COM' },
  product: { sku: 'SKU-123', name: 'Everyday Tee' },
  purchaseHint: { receiptOrOrderNumber: 'POS-000123' },
  requested: { quantity: 1, action: 'either' }
})

const baseCandidate: CommerceOrderLineCandidate = {
  personId: '22222222-2222-4222-8222-222222222222',
  orderId: '33333333-3333-4333-8333-333333333333',
  orderLineId: '44444444-4444-4444-8444-444444444444',
  sourceSystem: 'pos',
  externalOrderRef: 'POS-000123',
  receiptNumber: 'POS-000123',
  emailAtPurchase: 'ava@example.com',
  occurredAt: '2026-06-01T04:00:00.000Z',
  externalLineRef: 'line-1',
  productRef: { sku: 'SKU-123' },
  sku: 'SKU-123',
  productName: 'Everyday Tee',
  quantityPurchased: 2,
  quantityAlreadyReturned: 0
}

describe('return eligibility foundation', () => {
  it('adds the commerce and return eligibility tables with workspace RLS', () => {
    for (const table of [
      'crm_commerce_orders',
      'crm_commerce_order_lines',
      'crm_return_policies',
      'crm_return_eligibility_checks',
      'crm_return_authorizations',
      'crm_commerce_return_facts'
    ]) {
      expect(migration).toContain(`public.${table}`)
      expect(migration).toContain(`alter table public.${table} enable row level security`)
    }

    expect(migration).toContain('unique (workspace_id, request_hash)')
    expect(migration).toContain('unique (workspace_id, source_system, external_return_ref, external_line_ref)')
    expect(migration).toContain('crm_commerce_orders_email_idx')
    expect(migration).toContain('crm_commerce_order_lines_sku_idx')
  })

  it('normalizes request hashes for stable idempotency', () => {
    const hash = createReturnEligibilityRequestHash(baseRequest)
    const repeated = createReturnEligibilityRequestHash(returnEligibilityPayloadSchema.parse({
      ...baseRequest,
      customer: { email: ' ava@example.com ' }
    }))

    expect(hash).toBe(repeated)
  })

  it('returns eligible for an exact order-line match with available quantity', () => {
    const result = evaluateReturnEligibility(baseRequest, [baseCandidate], {
      version: 4,
      label: 'Standard 30 day return policy',
      rules: { returnWindowDays: 30, cacheMinutes: 15 }
    }, new Date('2026-06-10T00:00:00.000Z'))

    expect(result).toMatchObject({
      decision: 'eligible',
      allowedActions: ['refund', 'exchange', 'store_credit'],
      managerRequired: false,
      matchedOrderLineId: baseCandidate.orderLineId
    })
    expect(result.reasonCodes).toEqual(expect.arrayContaining(['within_window', 'quantity_available', 'receipt_match']))
    expect(result.matchedPurchase?.quantityReturnable).toBe(2)
  })

  it('blocks already-returned quantities', () => {
    const result = evaluateReturnEligibility(baseRequest, [{
      ...baseCandidate,
      quantityPurchased: 1,
      quantityAlreadyReturned: 1
    }], null, new Date('2026-06-10T00:00:00.000Z'))

    expect(result.decision).toBe('ineligible')
    expect(result.reasonCodes).toContain('quantity_already_returned')
    expect(result.approvedQty).toBe(0)
  })

  it('uses policy fallback for no matched sale instead of inventing POS policy', () => {
    const result = evaluateReturnEligibility(baseRequest, [], {
      rules: { noMatchedSaleBehavior: 'store_credit_only' }
    }, new Date('2026-06-10T00:00:00.000Z'))

    expect(result).toMatchObject({
      decision: 'store_credit_only',
      allowedActions: ['store_credit'],
      matchedPurchase: null
    })
    expect(result.reasonCodes).toEqual(expect.arrayContaining(['policy_fallback']))
  })

  it('projects POS sale and return events into commerce memory shapes', () => {
    const sale = buildCommerceOrderProjection({
      eventId: 'sale_1',
      eventType: 'pos.sale.completed',
      workspaceId: baseRequest.workspaceId,
      sourceSystem: 'pos',
      occurredAt: '2026-06-01T04:00:00.000Z',
      idempotencyKey: 'pos:sale_1',
      actor: {},
      subject: {},
      context: { currency: 'SGD' },
      payload: {
        receipt_number: 'POS-000123',
        customer: { email: 'AVA@EXAMPLE.COM' },
        lines: [
          { line_ref: 'line-1', sku: 'SKU-123', name: 'Everyday Tee', quantity: 2 }
        ]
      },
      schemaVersion: 1
    })

    expect(sale).toMatchObject({
      receiptNumber: 'POS-000123',
      emailAtPurchase: 'ava@example.com',
      lines: [expect.objectContaining({ externalLineRef: 'line-1', quantityPurchased: 2 })]
    })

    const completedReturn = buildCommerceReturnProjection({
      eventId: 'return_1',
      eventType: 'pos.return.completed',
      workspaceId: baseRequest.workspaceId,
      sourceSystem: 'pos',
      occurredAt: '2026-06-08T04:00:00.000Z',
      idempotencyKey: 'pos:return_1',
      actor: {},
      subject: {},
      context: {},
      payload: {
        return_number: 'RET-1',
        crmos: {
          decision_id: '55555555-5555-4555-8555-555555555555',
          authorization_id: '66666666-6666-4666-8666-666666666666'
        },
        lines: [
          {
            sku: 'SKU-123',
            quantity: -1,
            return: {
              original_line_ref: 'line-1',
              source_receipt_number: 'POS-000123',
              reason_code: 'wrong_size',
              disposition: 'resell'
            }
          }
        ]
      },
      schemaVersion: 1
    })

    expect(completedReturn).toMatchObject({
      externalReturnRef: 'RET-1',
      authorizationId: '66666666-6666-4666-8666-666666666666',
      lines: [expect.objectContaining({ externalLineRef: 'line-1', returnedQty: 1 })]
    })
  })
})
