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

const optionalDateHintSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()

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
