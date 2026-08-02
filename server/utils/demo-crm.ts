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
      tags: ['F3', 'repeat buyer', 'counter profile'],
      attributes: {
        email: 'ava@example.com',
        phone: '+65 8123 4470',
        accepts_marketing: true,
        total_spent: 2840,
        currency: 'SGD',
        orders_count: 18,
        lifecycle_stage: 'loyal',
        last_visit_at: '2026-05-28T10:18:00.000Z',
        preferred_store: 'Bugis+',
        profile_packs: {
          fran_member: {
            member_number: 'FRAN-0001',
            mobile: '+65 8123 4470',
            member_since: '2024-03-18',
            birthday: '1992-09-12',
            preferred_store: 'Bugis+',
            consent_status: 'granted'
          },
          fran_loyalty: {
            // FWB tiers F1/F2/F3 (legacy Gold maps to F3 in POS bridge)
            tier: 'F3',
            tier_key: 'F3',
            points_balance: 18420,
            points_expiring_soon: 1200,
            points_expiry_date: '2026-08-31',
            ytd_spend: 2840,
            calendar_ytd_spend: 2840,
            next_tier: null,
            spend_to_next_tier: 0
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
      id: 'person_002',
      type: 'person',
      label: 'Mei Ling Chong',
      externalIds: { fran_member: 'FRAN-0142', pos: 'cust_2201' },
      tags: ['F2', 'sunscreen'],
      attributes: {
        email: 'mei.ling@example.com',
        phone: '+65 9012 3344',
        accepts_marketing: true,
        total_spent: 960,
        currency: 'SGD',
        orders_count: 7,
        lifecycle_stage: 'active',
        last_visit_at: '2026-05-20T14:02:00.000Z',
        preferred_store: 'Bugis+',
        profile_packs: {
          fran_member: {
            member_number: 'FRAN-0142',
            mobile: '+65 9012 3344',
            member_since: '2025-01-09',
            birthday: '1998-04-02',
            preferred_store: 'Bugis+',
            consent_status: 'granted'
          },
          fran_loyalty: {
            tier: 'F2',
            tier_key: 'F2',
            points_balance: 4200,
            points_expiring_soon: 0,
            ytd_spend: 960,
            next_tier: 'F3',
            spend_to_next_tier: 540
          }
        }
      },
      createdAt: '2025-01-09T08:00:00.000Z',
      updatedAt: '2026-05-20T14:05:00.000Z'
    },
    {
      id: 'person_003',
      type: 'person',
      label: 'Jordan Lee',
      externalIds: { fran_member: 'FRAN-0088', pos: 'cust_1880' },
      tags: ['F1', 'new member'],
      attributes: {
        email: 'jordan.lee@example.com',
        phone: '+65 8233 1100',
        accepts_marketing: false,
        total_spent: 128,
        currency: 'SGD',
        orders_count: 2,
        lifecycle_stage: 'new',
        last_visit_at: '2026-05-12T11:40:00.000Z',
        preferred_store: 'Bugis+',
        profile_packs: {
          fran_member: {
            member_number: 'FRAN-0088',
            mobile: '+65 8233 1100',
            member_since: '2026-04-01',
            birthday: '2001-11-20',
            preferred_store: 'Bugis+',
            consent_status: 'limited'
          },
          fran_loyalty: {
            tier: 'F1',
            tier_key: 'F1',
            points_balance: 640,
            points_expiring_soon: 0,
            ytd_spend: 128,
            next_tier: 'F2',
            spend_to_next_tier: 372
          }
        }
      },
      createdAt: '2026-04-01T10:00:00.000Z',
      updatedAt: '2026-05-12T11:45:00.000Z'
    },
    {
      id: 'person_004',
      type: 'person',
      label: 'Priya Nair',
      externalIds: { fran_member: 'FRAN-0033', pos: 'cust_1502' },
      tags: ['F3', 'at risk'],
      attributes: {
        email: 'priya.nair@example.com',
        phone: '+65 9876 2211',
        accepts_marketing: true,
        total_spent: 4100,
        currency: 'SGD',
        orders_count: 22,
        lifecycle_stage: 'at_risk',
        last_visit_at: '2026-02-14T16:20:00.000Z',
        preferred_store: 'Bugis+',
        profile_packs: {
          fran_member: {
            member_number: 'FRAN-0033',
            mobile: '+65 9876 2211',
            member_since: '2023-08-02',
            birthday: '1989-06-30',
            preferred_store: 'Bugis+',
            consent_status: 'granted'
          },
          fran_loyalty: {
            tier: 'F3',
            tier_key: 'F3',
            points_balance: 9200,
            points_expiring_soon: 2800,
            points_expiry_date: '2026-07-31',
            ytd_spend: 210,
            next_tier: null,
            spend_to_next_tier: 0
          }
        }
      },
      createdAt: '2023-08-02T09:00:00.000Z',
      updatedAt: '2026-02-14T16:25:00.000Z'
    },
    {
      id: 'person_005',
      type: 'person',
      label: 'Daniel Wong',
      externalIds: { fran_member: 'FRAN-0210', pos: 'cust_2408' },
      tags: ['F2', 'gift buyer'],
      attributes: {
        email: 'daniel.wong@example.com',
        phone: '+65 9123 7788',
        accepts_marketing: true,
        total_spent: 540,
        currency: 'SGD',
        orders_count: 4,
        lifecycle_stage: 'active',
        last_visit_at: '2026-05-26T13:10:00.000Z',
        preferred_store: 'Bugis+',
        profile_packs: {
          fran_member: {
            member_number: 'FRAN-0210',
            mobile: '+65 9123 7788',
            member_since: '2025-11-11',
            birthday: '1995-12-01',
            preferred_store: 'Bugis+',
            consent_status: 'granted'
          },
          fran_loyalty: {
            tier: 'F2',
            tier_key: 'F2',
            points_balance: 2100,
            points_expiring_soon: 100,
            ytd_spend: 540,
            next_tier: 'F3',
            spend_to_next_tier: 960
          }
        }
      },
      createdAt: '2025-11-11T07:30:00.000Z',
      updatedAt: '2026-05-26T13:12:00.000Z'
    },
    {
      id: 'person_006',
      type: 'person',
      label: 'Siti Rahman',
      externalIds: { fran_member: 'FRAN-0055', pos: 'cust_1300' },
      tags: ['F1', 'skincare'],
      attributes: {
        email: 'siti.rahman@example.com',
        phone: '+65 8765 4422',
        accepts_marketing: true,
        total_spent: 310,
        currency: 'SGD',
        orders_count: 5,
        lifecycle_stage: 'active',
        last_visit_at: '2026-05-18T09:55:00.000Z',
        preferred_store: 'Bugis+',
        profile_packs: {
          fran_member: {
            member_number: 'FRAN-0055',
            mobile: '+65 8765 4422',
            member_since: '2025-06-20',
            birthday: '1996-02-14',
            preferred_store: 'Bugis+',
            consent_status: 'granted'
          },
          fran_loyalty: {
            tier: 'F1',
            tier_key: 'F1',
            points_balance: 1550,
            points_expiring_soon: 0,
            ytd_spend: 310,
            next_tier: 'F2',
            spend_to_next_tier: 190
          },
          fran_beauty_profile: {
            skin_type: 'Dry',
            skin_concerns: ['Barrier', 'Redness'],
            preferred_routine: 'Gentle hydration'
          }
        }
      },
      createdAt: '2025-06-20T11:00:00.000Z',
      updatedAt: '2026-05-18T10:00:00.000Z'
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
