import { describe, expect, it } from 'vitest'
import {
  agentConnectorSetupPayloadSchema,
  checkoutPayloadSchema,
  crmEventPayloadSchema,
  franCounterSessionPayloadSchema,
  franLoyaltyPolicyAssignmentPayloadSchema,
  franLoyaltyPolicyVersionPayloadSchema,
  franMemberResolvePayloadSchema,
  franTopCustomersToolInputSchema,
  graphSearchQuerySchema,
  returnEligibilityPayloadSchema,
  schemaFieldPayloadSchema,
  workspaceSetupPayloadSchema
} from '../server/utils/contracts'

describe('agent schema extension contract', () => {
  it('accepts an agent-proposed custom field', () => {
    const payload = schemaFieldPayloadSchema.parse({
      entityType: 'person',
      key: 'preferred_channel',
      label: 'Preferred channel',
      type: 'text',
      required: false,
      origin: 'agent'
    })

    expect(payload).toMatchObject({
      entityType: 'person',
      key: 'preferred_channel',
      origin: 'agent'
    })
  })

  it('accepts pack-scoped profile field metadata', () => {
    const payload = schemaFieldPayloadSchema.parse({
      entityType: 'person',
      key: 'skin_concerns',
      label: 'Skin concerns',
      type: 'multi_select',
      required: false,
      origin: 'custom',
      packKey: 'fran_beauty_profile',
      sensitivityLevel: 'internal',
      posVisible: true,
      cashierEditable: true,
      marketingUsable: false,
      enumValues: ['Acne', 'Pigmentation']
    })

    expect(payload).toMatchObject({
      packKey: 'fran_beauty_profile',
      type: 'multi_select',
      posVisible: true,
      enumValues: ['Acne', 'Pigmentation']
    })
  })

  it('defaults schema field origin to custom for human-created fields', () => {
    const payload = schemaFieldPayloadSchema.parse({
      entityType: 'company',
      key: 'annual_contract_value',
      label: 'Annual contract value',
      type: 'number'
    })

    expect(payload.required).toBe(false)
    expect(payload.origin).toBe('custom')
  })

  it('rejects field keys that would be unsafe as schema handles', () => {
    expect(() => schemaFieldPayloadSchema.parse({
      entityType: 'person',
      key: 'Preferred Channel',
      label: 'Preferred channel',
      type: 'text'
    })).toThrow()
  })

  it('rejects unsafe pack keys', () => {
    expect(() => schemaFieldPayloadSchema.parse({
      entityType: 'person',
      key: 'skin_type',
      label: 'Skin type',
      type: 'single_select',
      packKey: 'Skincare'
    })).toThrow()
  })
})

describe('API payload contracts', () => {
  it('only accepts hosted paid plans for checkout', () => {
    expect(checkoutPayloadSchema.parse({
      email: 'founder@example.com',
      plan: 'hosted_growth'
    }).plan).toBe('hosted_growth')

    expect(() => checkoutPayloadSchema.parse({
      email: 'founder@example.com',
      plan: 'open_source'
    })).toThrow()
  })

  it('normalizes graph search input by trimming whitespace', () => {
    expect(graphSearchQuerySchema.parse({ q: '  ava  ' }).q).toBe('ava')
  })

  it('accepts hosted workspace setup for a master user company', () => {
    const payload = workspaceSetupPayloadSchema.parse({
      companyName: 'Acme Retail',
      slug: 'acme-retail',
      plan: 'hosted_growth'
    })

    expect(payload).toMatchObject({
      companyName: 'Acme Retail',
      slug: 'acme-retail',
      plan: 'hosted_growth'
    })
  })

  it('rejects unsafe workspace setup slugs', () => {
    expect(() => workspaceSetupPayloadSchema.parse({
      companyName: 'Acme Retail',
      slug: 'Acme Retail!',
      plan: 'hosted_growth'
    })).toThrow()
  })

  it('accepts the cross-repo event contract with idempotency', () => {
    const payload = crmEventPayloadSchema.parse({
      eventId: 'pos_sale_123',
      eventType: 'pos.sale.completed',
      sourceSystem: 'pos',
      occurredAt: '2026-06-11T04:00:00.000Z',
      idempotencyKey: 'pos:store_001:txn_123',
      subject: {
        externalCustomerRefs: [
          { system: 'pos', id: 'cust_123' }
        ]
      },
      context: {
        channel: 'pos',
        country: 'SG',
        currency: 'SGD'
      }
    })

    expect(payload.schemaVersion).toBe(1)
    expect(payload.subject.externalCustomerRefs[0]).toMatchObject({ system: 'pos', id: 'cust_123' })
  })

  it('accepts the POS return eligibility request contract', () => {
    const payload = returnEligibilityPayloadSchema.parse({
      workspaceId: '11111111-1111-4111-8111-111111111111',
      sourceSystem: 'pos',
      customer: { email: 'customer@example.com' },
      product: { sku: 'SKU-123' },
      requested: { quantity: 1, action: 'either' }
    })

    expect(payload).toMatchObject({
      sourceSystem: 'pos',
      customer: { email: 'customer@example.com' },
      requested: { action: 'either' }
    })
  })

  it('accepts the Fran member resolve contract', () => {
    const payload = franMemberResolvePayloadSchema.parse({
      workspaceId: '11111111-1111-4111-8111-111111111111',
      identifier: {
        type: 'member_number',
        value: 'FRAN-0001'
      },
      sourceSystem: 'fran-pos'
    })

    expect(payload.identifier).toMatchObject({
      type: 'member_number',
      value: 'FRAN-0001'
    })
  })

  it('accepts the Fran counter session contract', () => {
    const payload = franCounterSessionPayloadSchema.parse({
      workspaceId: '11111111-1111-4111-8111-111111111111',
      personId: 'person_001',
      sourceSystem: 'fran-pos',
      store: { id: 'ion-orchard', registerId: 'counter-01' },
      cashier: { id: 'staff-001' }
    })

    expect(payload).toMatchObject({
      personId: 'person_001',
      store: { id: 'ion-orchard' }
    })
  })

  it('accepts a versioned Fran loyalty policy payload', () => {
    const payload = franLoyaltyPolicyVersionPayloadSchema.parse({
      workspaceId: '11111111-1111-4111-8111-111111111111',
      versionKey: 'v2.1-seasonal-a',
      versionLabel: 'Fran loyalty v2.1 seasonal A',
      rules: {
        schemaVersion: 1,
        tiers: [
          {
            key: 'tier_1',
            label: 'Tier 1',
            rank: 1,
            spendThresholdMinor: 0,
            earnMultiplier: 1
          },
          {
            key: 'tier_2',
            label: 'Tier 2',
            rank: 2,
            spendThresholdMinor: 50000,
            earnMultiplier: 1.25
          }
        ]
      }
    })

    expect(payload.programKey).toBe('fran_with_benefits')
    expect(payload.rules.execution).toMatchObject({
      executor: 'fran-pos',
      pricingAuthority: 'fran-skums',
      inventoryAuthority: 'fran-skums'
    })
    expect(payload.status).toBe('draft')
  })

  it('accepts a Fran loyalty rollout assignment payload', () => {
    const payload = franLoyaltyPolicyAssignmentPayloadSchema.parse({
      workspaceId: '11111111-1111-4111-8111-111111111111',
      policyVersionId: '22222222-2222-4222-8222-222222222222',
      assignmentKey: 'ion-orchard:seasonal-a',
      assignmentType: 'store',
      targetRef: 'ion-orchard'
    })

    expect(payload).toMatchObject({
      programKey: 'fran_with_benefits',
      priority: 100,
      allocationPercent: 100,
      status: 'active'
    })
  })

  it('accepts the Claude connector setup contract', () => {
    const payload = agentConnectorSetupPayloadSchema.parse({
      workspaceId: '11111111-1111-4111-8111-111111111111',
      provider: 'claude',
      connectorName: 'Fran CRM',
      defaultProfile: 'manager'
    })

    expect(payload).toMatchObject({
      provider: 'claude',
      connectorName: 'Fran CRM',
      defaultProfile: 'manager',
      status: 'configured'
    })
  })

  it('accepts the top customer MCP tool input contract', () => {
    const payload = franTopCustomersToolInputSchema.parse({
      workspaceId: '11111111-1111-4111-8111-111111111111',
      from: '2026-06-30',
      to: '2026-07-04',
      limit: 10,
      metric: 'purchase_amount'
    })

    expect(payload).toMatchObject({
      limit: 10,
      metric: 'purchase_amount',
      includeContact: false
    })
  })
})
