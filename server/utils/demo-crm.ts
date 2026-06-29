import type { CrmGraphResponse } from '../../app/types/crm'
import { cloneProfilePack, profilePackDefinitions } from './profile-packs'

export const shopifyCustomerFields = [
  { key: 'email', label: 'Email', type: 'email', required: true, origin: 'core' },
  { key: 'phone', label: 'Phone', type: 'phone', required: false, origin: 'core' },
  { key: 'first_name', label: 'First name', type: 'text', required: false, origin: 'core' },
  { key: 'last_name', label: 'Last name', type: 'text', required: false, origin: 'core' },
  { key: 'accepts_marketing', label: 'Accepts marketing', type: 'boolean', required: false, origin: 'core' },
  { key: 'tags', label: 'Tags', type: 'json', required: false, origin: 'core' },
  { key: 'note', label: 'Internal note', type: 'text', required: false, origin: 'core' },
  { key: 'default_address', label: 'Default address', type: 'json', required: false, origin: 'core' },
  { key: 'orders_count', label: 'Orders count', type: 'number', required: false, origin: 'integration' },
  { key: 'total_spent', label: 'Total spent', type: 'number', required: false, origin: 'integration' },
  { key: 'currency', label: 'Currency', type: 'text', required: false, origin: 'integration' },
  { key: 'last_order_at', label: 'Last order date', type: 'date', required: false, origin: 'integration' },
  { key: 'source_channel', label: 'Source channel', type: 'text', required: false, origin: 'integration' },
  { key: 'company_name', label: 'Company name', type: 'text', required: false, origin: 'custom' },
  { key: 'lifecycle_stage', label: 'Lifecycle stage', type: 'enum', required: false, origin: 'custom' }
] as const

export const demoCrmGraph: CrmGraphResponse = {
  metrics: [
    { label: 'Members resolved', value: '12,842', detail: 'Fran member identities linked to POS-safe profiles' },
    { label: 'Reward decisions', value: '3,912', detail: 'Quotes, commits, and reversals tracked this month' },
    { label: 'Agent proposals', value: '31', detail: 'Sensitive updates waiting on approval or review' },
    { label: 'Connected sources', value: '5', detail: 'Fran POS, ecommerce, support, loyalty, and CSV imports' }
  ],
  entities: [
    {
      id: 'person_001',
      type: 'person',
      label: 'Ava Tan',
      externalIds: { fran_member: 'FRAN-0001', pos: 'cust_1194' },
      tags: ['gold tier', 'repeat buyer', 'counter profile'],
      attributes: {
        email: 'ava@example.com',
        phone: '+65 8123 4470',
        accepts_marketing: true,
        total_spent: 2840,
        currency: 'SGD',
        orders_count: 18,
        lifecycle_stage: 'loyal',
        profile_packs: {
          fran_member: {
            member_number: 'FRAN-0001',
            mobile: '+65 8123 4470',
            member_since: '2024-03-18',
            birthday: '1992-09-12',
            preferred_store: 'ION Orchard',
            consent_status: 'granted'
          },
          fran_loyalty: {
            tier: 'Gold',
            points_balance: 18420,
            points_expiring_soon: 1200,
            points_expiry_date: '2026-08-31',
            ytd_spend: 2840,
            next_tier: 'Platinum',
            spend_to_next_tier: 660
          },
          fran_beauty_profile: {
            skin_type: 'Combination',
            skin_concerns: ['Acne', 'Pigmentation'],
            reported_sensitivities: ['retinol', 'fragrance'],
            reported_sensitivity_note: 'Customer reports irritation with strong actives.',
            preferred_routine: 'Treatment-led',
            advisor_notes: 'Patch test before recommending high-strength actives.'
          }
        }
      },
      createdAt: '2026-04-04T09:20:00.000Z',
      updatedAt: '2026-05-28T11:10:00.000Z'
    },
    {
      id: 'company_001',
      type: 'company',
      label: 'North Bridge Studio',
      externalIds: { hubspot: 'company_982', xero: 'contact_882' },
      tags: ['b2b', 'retail partner'],
      attributes: {
        domain: 'northbridge.example',
        country: 'SG',
        lifecycle_stage: 'active account',
        annual_value: 46000
      },
      createdAt: '2026-03-12T06:45:00.000Z',
      updatedAt: '2026-05-30T08:15:00.000Z'
    },
    {
      id: 'order_001',
      type: 'order',
      label: '#SG-10492',
      externalIds: { shopify: 'gid://shopify/Order/10492' },
      tags: ['online', 'fulfilled'],
      attributes: {
        total_price: 428,
        currency: 'SGD',
        channel: 'Shopify',
        financial_status: 'paid'
      },
      createdAt: '2026-05-28T10:18:00.000Z',
      updatedAt: '2026-05-28T10:26:00.000Z'
    },
    {
      id: 'ticket_001',
      type: 'ticket',
      label: 'Return size exchange',
      externalIds: { zendesk: 'ticket_55091' },
      tags: ['service', 'exchange'],
      attributes: {
        sentiment: 'neutral',
        priority: 'normal',
        status: 'open'
      },
      createdAt: '2026-05-29T03:08:00.000Z',
      updatedAt: '2026-05-29T04:15:00.000Z'
    }
  ],
  relationships: [
    {
      id: 'rel_001',
      fromEntityId: 'person_001',
      toEntityId: 'order_001',
      type: 'placed_order',
      confidence: 1,
      source: 'shopify'
    },
    {
      id: 'rel_002',
      fromEntityId: 'person_001',
      toEntityId: 'ticket_001',
      type: 'opened_ticket',
      confidence: 0.96,
      source: 'support_email'
    },
    {
      id: 'rel_003',
      fromEntityId: 'person_001',
      toEntityId: 'company_001',
      type: 'works_at',
      confidence: 0.72,
      source: 'agent_resolution'
    }
  ],
  customerFields: [
    ...shopifyCustomerFields.map((field) => ({ ...field })),
    ...profilePackDefinitions.flatMap((pack) => pack.installed ? pack.fields.map((field) => ({ ...field })) : [])
  ],
  profilePacks: profilePackDefinitions.map((pack) => cloneProfilePack(pack)),
  integrationBacklog: [
    'Fran POS member resolve and counter session sync',
    'POS sale, return, quote, commit, and reversal events',
    'Reward catalogue and eligibility fixtures',
    'Support tickets and message threads',
    'CSV staging for member and loyalty imports'
  ],
  proposals: [
    {
      id: 'proposal_001',
      title: 'Merge Ava Tan across duplicate member signals',
      impact: 'Unifies POS and ecommerce history before loyalty decisions use the profile.',
      status: 'needs_approval'
    },
    {
      id: 'proposal_002',
      title: 'Review reported sensitivity note visibility',
      impact: 'Keeps counter staff warnings concise while restricted notes stay off POS projections.',
      status: 'draft'
    },
    {
      id: 'proposal_003',
      title: 'Draft next-tier reward policy',
      impact: 'Stages a loyalty rule change that still needs approval before publish.',
      status: 'approved'
    }
  ]
}

export const demoCustomerProfile = {
  id: 'person_001',
  displayName: 'Ava Tan',
  email: 'ava@example.com',
  phone: '+65 8123 4470',
  consent: {
    email: 'granted',
    sms: 'granted',
    sourceSystem: 'shopify',
    updatedAt: '2026-05-28T11:10:00.000Z'
  },
  activityProfile: {
    lastTransactionAt: '2026-05-28T10:18:00.000Z',
    daysSinceLastTransaction: 4,
    transactionCount30d: 3,
    transactionCount90d: 8,
    transactionCountLifetime: 18
  },
  valueProfile: {
    averageTransactionValueMinor: 15778,
    lifetimeValueMinor: 284000,
    currency: 'SGD',
    returnRate: 0.06
  },
  affinities: [
    { kind: 'offering', refId: 'sku_kit_001', label: 'Starter bundle', score: 0.82, evidenceCount: 5 },
    { kind: 'channel', refId: 'shopify', label: 'Online store', score: 0.74, evidenceCount: 18 }
  ],
  segments: [
    { key: 'high_value_repeat_customer', score: 0.91, source: 'system' },
    { key: 'fran_gold_member', score: 0.94, source: 'system' }
  ],
  provenance: {
    sourceSystems: ['shopify', 'pos', 'support'],
    inputWatermark: '2026-05-30T00:00:00.000Z'
  },
  sensitivityLevel: 'internal',
  computedAt: '2026-05-30T01:15:00.000Z'
}

export const demoCustomerTimeline = [
  {
    id: 'event_demo_001',
    eventId: 'shopify_order_10492',
    eventType: 'commerce.transaction.completed',
    sourceSystem: 'shopify',
    occurredAt: '2026-05-28T10:18:00.000Z',
    context: { channel: 'web', country: 'SG', currency: 'SGD' },
    payload: { orderNumber: '#SG-10492', totalMinor: 42800 }
  },
  {
    id: 'event_demo_002',
    eventId: 'support_ticket_55091',
    eventType: 'support.ticket.opened',
    sourceSystem: 'zendesk',
    occurredAt: '2026-05-29T03:08:00.000Z',
    context: { channel: 'support' },
    payload: { topic: 'Return size exchange' }
  }
]
