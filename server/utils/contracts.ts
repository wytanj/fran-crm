import { z } from 'zod'
import { agentCapabilityProfiles } from './agent-capabilities'

export const crmValueTypes = ['text', 'number', 'date', 'boolean', 'email', 'phone', 'json', 'enum', 'single_select', 'multi_select', 'tag_list'] as const
export const paidPlanKeys = ['hosted_growth', 'hosted_scale'] as const
export const workspaceRoles = ['owner', 'admin', 'member', 'agent'] as const
export const profileSensitivityLevels = ['public', 'internal', 'confidential', 'restricted'] as const
export const agentConnectorProviders = ['claude', 'slack', 'teams', 'custom_mcp'] as const
export const customerPurchaseMetrics = ['purchase_amount', 'purchase_count'] as const
export const returnEligibilityDecisions = [
  'eligible',
  'exchange_only',
  'store_credit_only',
  'manager_review',
  'ineligible',
  'not_found',
  'insufficient_context'
] as const
export const returnEligibilityActions = ['refund', 'exchange', 'store_credit', 'either'] as const
export const franIdentifierTypes = ['phone', 'member_number', 'qr', 'barcode', 'external_ref'] as const
export const franLoyaltyPolicyStatuses = ['draft', 'testing', 'approved', 'active', 'retired'] as const
export const franLoyaltyAssignmentTypes = ['workspace_default', 'store', 'register', 'member', 'cohort', 'experiment'] as const
export const franLoyaltyAssignmentStatuses = ['active', 'paused', 'retired'] as const

const optionalDateHintSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
const optionalDateTimeSchema = z.string().datetime().optional()
const policyKeySchema = z.string().trim().regex(/^[a-z][a-z0-9_]*$/)
const policyVersionKeySchema = z.string().trim().regex(/^[a-z0-9][a-z0-9_.-]*$/)
const policyAssignmentKeySchema = z.string().trim().regex(/^[a-z0-9][a-z0-9_.:-]*$/)

export const schemaFieldPayloadSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  entityType: z.string().min(2),
  key: z.string().min(2).regex(/^[a-z][a-z0-9_]*$/),
  label: z.string().min(2),
  type: z.enum(crmValueTypes),
  required: z.boolean().default(false),
  origin: z.enum(['custom', 'agent']).default('custom'),
  packKey: z.string().regex(/^[a-z][a-z0-9_]*$/).optional(),
  description: z.string().optional(),
  helpText: z.string().optional(),
  sensitivityLevel: z.enum(profileSensitivityLevels).default('internal'),
  posVisible: z.boolean().default(false),
  cashierEditable: z.boolean().default(false),
  marketingUsable: z.boolean().default(false),
  uiContexts: z.array(z.string()).default([]),
  enumValues: z.array(z.string()).default([]),
  sortOrder: z.number().int().default(0),
  metadata: z.record(z.string(), z.unknown()).default({})
})

export const profilePackInstallPayloadSchema = z.object({
  workspaceId: z.string().uuid()
})

export const profileFieldUpdatePayloadSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  packKey: z.string().regex(/^[a-z][a-z0-9_]*$/),
  fields: z.record(z.string().regex(/^[a-z][a-z0-9_]*$/), z.unknown()),
  sourceSystem: z.string().min(2).default('crm_ui')
})

export const checkoutPayloadSchema = z.object({
  email: z.string().email(),
  plan: z.enum(paidPlanKeys)
})

export const graphSearchQuerySchema = z.object({
  q: z.string().trim().optional(),
  workspaceId: z.string().uuid().optional()
})

export const workspaceScopedQuerySchema = z.object({
  workspaceId: z.string().uuid().optional()
})

const optionalAnalyticsDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()

export const franAnalyticsQuerySchema = workspaceScopedQuerySchema.extend({
  from: optionalAnalyticsDateSchema,
  to: optionalAnalyticsDateSchema,
  pointValueMinor: z.coerce.number().int().min(0).max(1000).default(1),
  expiryWindowDays: z.coerce.number().int().min(1).max(365).default(30),
  topLimit: z.coerce.number().int().min(1).max(100).default(10),
  atRiskDays: z.coerce.number().int().min(1).max(365).default(60),
  lapsedFromDays: z.coerce.number().int().min(1).max(730).default(90),
  lapsedToDays: z.coerce.number().int().min(1).max(1095).default(180)
})

export const franTopCustomersToolInputSchema = z.object({
  workspaceId: z.string().uuid(),
  from: optionalAnalyticsDateSchema,
  to: optionalAnalyticsDateSchema,
  limit: z.coerce.number().int().min(1).max(50).default(10),
  metric: z.enum(customerPurchaseMetrics).default('purchase_amount'),
  includeContact: z.coerce.boolean().default(false)
})

export const agentConnectorSetupPayloadSchema = z.object({
  workspaceId: z.string().uuid(),
  provider: z.enum(agentConnectorProviders).default('claude'),
  connectorName: z.string().trim().min(2).max(80).default('Fran CRM'),
  externalAccountId: z.string().trim().min(1).max(160).optional(),
  defaultProfile: z.enum(agentCapabilityProfiles).default('manager'),
  status: z.enum(['draft', 'configured', 'connected', 'disabled', 'revoked']).default('configured'),
  config: z.record(z.string(), z.unknown()).default({})
})

export const workspaceSetupPayloadSchema = z.object({
  companyName: z.string().trim().min(2).max(120),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64).optional().or(z.literal('')),
  plan: z.enum(paidPlanKeys).default('hosted_growth')
})

export const crmEventPayloadSchema = z.object({
  eventId: z.string().min(3),
  eventType: z.string().min(3),
  workspaceId: z.string().uuid().optional(),
  sourceSystem: z.string().min(2),
  occurredAt: z.string().datetime(),
  idempotencyKey: z.string().min(3),
  actor: z.record(z.string(), z.unknown()).default({}),
  subject: z.object({
    customerKey: z.string().optional(),
    externalCustomerRefs: z.array(z.object({
      system: z.string().min(1),
      id: z.string().min(1)
    })).default([])
  }).default({ externalCustomerRefs: [] }),
  context: z.record(z.string(), z.unknown()).default({}),
  payload: z.record(z.string(), z.unknown()).default({}),
  schemaVersion: z.number().int().positive().default(1)
})

export const returnEligibilityPayloadSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  sourceSystem: z.string().trim().min(2).default('pos'),
  store: z.object({
    id: z.string().trim().min(1).optional(),
    registerId: z.string().trim().min(1).optional()
  }).default({}),
  staff: z.object({
    id: z.string().trim().min(1).optional()
  }).default({}),
  customer: z.object({
    email: z.string().trim().email()
  }),
  product: z.object({
    sku: z.string().trim().min(1).optional(),
    barcode: z.string().trim().min(1).optional(),
    productIdentityId: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).optional()
  }).default({}),
  purchaseHint: z.object({
    orderDate: optionalDateHintSchema,
    receiptOrOrderNumber: z.string().trim().min(1).optional()
  }).default({}),
  requested: z.object({
    quantity: z.number().positive().default(1),
    action: z.enum(returnEligibilityActions).default('either')
  }).default({ quantity: 1, action: 'either' })
})

export const franMemberResolvePayloadSchema = z.object({
  workspaceId: z.string().uuid(),
  identifier: z.object({
    type: z.enum(franIdentifierTypes),
    value: z.string().trim().min(1)
  }),
  sourceSystem: z.string().trim().min(2).default('fran-pos')
})

export const franCounterSessionPayloadSchema = z.object({
  workspaceId: z.string().uuid(),
  personId: z.string().trim().min(1).optional(),
  memberRef: z.string().trim().min(1).optional(),
  sourceSystem: z.string().trim().min(2).default('fran-pos'),
  store: z.object({
    id: z.string().trim().min(1).optional(),
    registerId: z.string().trim().min(1).optional()
  }).default({}),
  cashier: z.object({
    id: z.string().trim().min(1).optional()
  }).default({})
})

export const franLoyaltyTierRuleSchema = z.object({
  key: policyKeySchema,
  label: z.string().trim().min(1),
  rank: z.number().int().min(0),
  spendThresholdMinor: z.number().int().min(0).default(0),
  earnMultiplier: z.number().positive().default(1),
  expiryFrozen: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).default({})
})

export const franLoyaltyPolicyRulesSchema = z.object({
  schemaVersion: z.number().int().positive().default(1),
  programKey: policyKeySchema.default('fran_with_benefits'),
  currency: z.string().trim().regex(/^[A-Z]{3}$/).default('SGD'),
  execution: z.object({
    policyOwner: z.literal('fran-crm').default('fran-crm'),
    executor: z.literal('fran-pos').default('fran-pos'),
    pricingAuthority: z.literal('fran-skums').default('fran-skums'),
    inventoryAuthority: z.literal('fran-skums').default('fran-skums')
  }).default({
    policyOwner: 'fran-crm',
    executor: 'fran-pos',
    pricingAuthority: 'fran-skums',
    inventoryAuthority: 'fran-skums'
  }),
  tiers: z.array(franLoyaltyTierRuleSchema).min(1),
  earning: z.record(z.string(), z.unknown()).default({}),
  redemption: z.record(z.string(), z.unknown()).default({}),
  expiry: z.record(z.string(), z.unknown()).default({}),
  bonuses: z.array(z.record(z.string(), z.unknown())).default([]),
  rewards: z.array(z.record(z.string(), z.unknown())).default([]),
  constraints: z.record(z.string(), z.unknown()).default({}),
  metadata: z.record(z.string(), z.unknown()).default({})
})

export const franLoyaltyPolicyVersionQuerySchema = workspaceScopedQuerySchema.extend({
  programKey: policyKeySchema.default('fran_with_benefits'),
  status: z.enum(franLoyaltyPolicyStatuses).optional(),
  includeRetired: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(100).default(20)
})

export const franLoyaltyActivePolicyQuerySchema = workspaceScopedQuerySchema.extend({
  /** Accept fran-pos `fran-v2` alias as well as CRM program key. */
  programKey: z.string().trim().min(1).default('fran_with_benefits'),
  storeId: z.string().trim().min(1).optional(),
  registerId: z.string().trim().min(1).optional(),
  personId: z.string().trim().min(1).optional(),
  cohort: z.string().trim().min(1).optional(),
  at: z.string().datetime().optional(),
  /** `pos` = Fran POS FranLoyaltyPolicyBundle shape (root object). */
  format: z.enum(['crm', 'pos']).default('crm')
})

export const franLoyaltyCommitSalePayloadSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  saleId: z.string().trim().min(1),
  receiptNo: z.string().trim().min(1).optional(),
  idempotencyKey: z.string().trim().min(1),
  memberId: z.string().trim().min(1),
  session: z.record(z.string(), z.unknown()).optional(),
  policyVersionId: z.string().trim().optional().nullable(),
  assignmentId: z.string().trim().optional().nullable(),
  skumsQuoteId: z.string().trim().optional().nullable(),
  skumsReservationId: z.string().trim().optional().nullable(),
  pointsEarned: z.number().optional(),
  pointsRedeemed: z.number().optional().default(0),
  redeemDiscountAmount: z.number().optional(),
  voucherCodes: z.array(z.string()).optional(),
  evaluationTrace: z.record(z.string(), z.unknown()).optional().nullable(),
  netSpend: z.number().min(0),
  currency: z.string().trim().regex(/^[A-Z]{3}$/).default('SGD'),
  occurredAt: z.string().datetime().optional(),
  birthdayActive: z.boolean().optional(),
  categoryActive: z.boolean().optional(),
  tierKey: z.string().trim().optional()
})

export const franLoyaltyPolicyVersionPayloadSchema = z.object({
  workspaceId: z.string().uuid(),
  programKey: policyKeySchema.default('fran_with_benefits'),
  programName: z.string().trim().min(1).default("Fran's With Benefits"),
  programDescription: z.string().trim().optional(),
  defaultCurrency: z.string().trim().regex(/^[A-Z]{3}$/).default('SGD'),
  versionKey: policyVersionKeySchema,
  versionLabel: z.string().trim().min(1),
  status: z.enum(['draft', 'testing', 'approved']).default('draft'),
  effectiveFrom: optionalDateTimeSchema,
  effectiveTo: optionalDateTimeSchema,
  rules: franLoyaltyPolicyRulesSchema,
  sourceDocumentRef: z.string().trim().min(1).optional(),
  sourceHash: z.string().trim().min(1).optional(),
  changeNote: z.string().trim().optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
})

export const franLoyaltyPolicyPublishPayloadSchema = z.object({
  workspaceId: z.string().uuid(),
  effectiveFrom: optionalDateTimeSchema,
  effectiveTo: optionalDateTimeSchema,
  changeNote: z.string().trim().optional(),
  createDefaultAssignment: z.boolean().default(true)
})

export const franLoyaltyPolicyAssignmentPayloadSchema = z.object({
  workspaceId: z.string().uuid(),
  policyVersionId: z.string().uuid(),
  programKey: policyKeySchema.default('fran_with_benefits'),
  assignmentKey: policyAssignmentKeySchema,
  assignmentType: z.enum(franLoyaltyAssignmentTypes),
  targetRef: z.string().trim().min(1).optional(),
  priority: z.number().int().min(0).max(10000).default(100),
  allocationPercent: z.number().min(0).max(100).default(100),
  status: z.enum(franLoyaltyAssignmentStatuses).default('active'),
  startsAt: optionalDateTimeSchema,
  endsAt: optionalDateTimeSchema,
  assignmentRules: z.record(z.string(), z.unknown()).default({}),
  externalIds: z.record(z.string(), z.unknown()).default({})
})

export type SchemaFieldPayload = z.infer<typeof schemaFieldPayloadSchema>
export type CheckoutPayload = z.infer<typeof checkoutPayloadSchema>
export type CrmEventPayload = z.infer<typeof crmEventPayloadSchema>
export type WorkspaceSetupPayload = z.infer<typeof workspaceSetupPayloadSchema>
export type FranAnalyticsQuery = z.infer<typeof franAnalyticsQuerySchema>
export type FranTopCustomersToolInput = z.infer<typeof franTopCustomersToolInputSchema>
export type AgentConnectorSetupPayload = z.infer<typeof agentConnectorSetupPayloadSchema>
export type ProfilePackInstallPayload = z.infer<typeof profilePackInstallPayloadSchema>
export type ProfileFieldUpdatePayload = z.infer<typeof profileFieldUpdatePayloadSchema>
export type ReturnEligibilityPayload = z.infer<typeof returnEligibilityPayloadSchema>
export type ReturnEligibilityDecision = typeof returnEligibilityDecisions[number]
export type ReturnEligibilityAction = typeof returnEligibilityActions[number]
export type FranMemberResolvePayload = z.infer<typeof franMemberResolvePayloadSchema>
export type FranCounterSessionPayload = z.infer<typeof franCounterSessionPayloadSchema>
export type FranLoyaltyPolicyRules = z.infer<typeof franLoyaltyPolicyRulesSchema>
export type FranLoyaltyPolicyVersionPayload = z.infer<typeof franLoyaltyPolicyVersionPayloadSchema>
export type FranLoyaltyPolicyPublishPayload = z.infer<typeof franLoyaltyPolicyPublishPayloadSchema>
export type FranLoyaltyPolicyAssignmentPayload = z.infer<typeof franLoyaltyPolicyAssignmentPayloadSchema>
export type FranLoyaltyCommitSalePayload = z.infer<typeof franLoyaltyCommitSalePayloadSchema>

/** Map POS programKey aliases to CRM program key. */
export function normalizeFranProgramKey(raw: string | undefined | null): string {
  const key = String(raw || 'fran_with_benefits').trim()
  if (!key) return 'fran_with_benefits'
  if (key === 'fran-v2' || key === 'fran_v2' || key === 'fwb') return 'fran_with_benefits'
  return key
}
