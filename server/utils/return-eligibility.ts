import { createHash } from 'node:crypto'
import type {
  ReturnEligibilityAction,
  ReturnEligibilityDecision,
  ReturnEligibilityPayload
} from './contracts'

export type ReturnAction = Exclude<ReturnEligibilityAction, 'either'>

export interface ReturnPolicyInput {
  id?: string | null
  version?: number | null
  label?: string | null
  rules?: Record<string, unknown> | null
}

export interface ReturnPolicyRules {
  returnWindowDays: number
  cacheMinutes: number
  allowedActions: ReturnAction[]
  noMatchedSaleBehavior: ReturnEligibilityDecision
  outsideWindowBehavior: ReturnEligibilityDecision
}

export interface CommerceOrderLineCandidate {
  personId?: string | null
  orderId: string
  orderLineId: string
  sourceSystem: string
  externalOrderRef: string
  orderNumber?: string | null
  receiptNumber?: string | null
  emailAtPurchase?: string | null
  occurredAt: string
  externalLineRef?: string | null
  productIdentityId?: string | null
  productRef?: Record<string, unknown> | null
  sku?: string | null
  productName?: string | null
  quantityPurchased: number
  quantityAlreadyReturned: number
  unitPrice?: number | null
  finalLineTotal?: number | null
  returnableUntil?: string | null
  policySnapshot?: Record<string, unknown> | null
}

export interface MatchedPurchaseSummary {
  sourceSystem: string
  orderRef: string
  orderDate: string
  orderLineRef: string | null
  productName: string | null
  sku: string | null
  quantityPurchased: number
  quantityAlreadyReturned: number
  quantityReturnable: number
  returnableUntil: string | null
}

export interface ReturnEligibilityEvaluation {
  decision: ReturnEligibilityDecision
  allowedActions: ReturnAction[]
  managerRequired: boolean
  expiresAt: string
  reasonCodes: string[]
  message: string
  matchedPurchase: MatchedPurchaseSummary | null
  matchedPersonId: string | null
  matchedOrderId: string | null
  matchedOrderLineId: string | null
  policy: {
    id: string | null
    version: number | null
    label: string
  }
  counterEvidence: Array<{ label: string, value: string }>
  evidence: Record<string, unknown>
  approvedQty: number
}

const fallbackPolicyRules: ReturnPolicyRules = {
  returnWindowDays: 30,
  cacheMinutes: 15,
  allowedActions: ['refund', 'exchange', 'store_credit'],
  noMatchedSaleBehavior: 'manager_review',
  outsideWindowBehavior: 'manager_review'
}

const actionSet = new Set<ReturnAction>(['refund', 'exchange', 'store_credit'])
const decisionSet = new Set<ReturnEligibilityDecision>([
  'eligible',
  'exchange_only',
  'store_credit_only',
  'manager_review',
  'ineligible',
  'not_found',
  'insufficient_context'
])

export function normalizeReturnEmail(email: string) {
  return email.trim().toLowerCase()
}

export function normalizeReturnEligibilityRequest(payload: ReturnEligibilityPayload) {
  return {
    workspaceId: payload.workspaceId || null,
    sourceSystem: payload.sourceSystem.trim().toLowerCase(),
    customerEmail: normalizeReturnEmail(payload.customer.email),
    product: {
      sku: normalizeOptional(payload.product.sku),
      barcode: normalizeOptional(payload.product.barcode),
      productIdentityId: normalizeOptional(payload.product.productIdentityId),
      name: normalizeOptional(payload.product.name)
    },
    purchaseHint: {
      orderDate: payload.purchaseHint.orderDate || null,
      receiptOrOrderNumber: normalizeOptional(payload.purchaseHint.receiptOrOrderNumber)
    },
    requested: {
      quantity: payload.requested.quantity,
      action: payload.requested.action
    }
  }
}

export function createReturnEligibilityRequestHash(payload: ReturnEligibilityPayload) {
  return createHash('sha256')
    .update(JSON.stringify(normalizeReturnEligibilityRequest(payload)))
    .digest('hex')
}

export function normalizePolicyRules(policy?: ReturnPolicyInput | null): ReturnPolicyRules {
  const rules = policy?.rules || {}
  const allowedActions = Array.isArray(rules.allowedActions)
    ? rules.allowedActions.filter((action): action is ReturnAction => typeof action === 'string' && actionSet.has(action as ReturnAction))
    : fallbackPolicyRules.allowedActions
  const noMatchedSaleBehavior = normalizeDecision(rules.noMatchedSaleBehavior, fallbackPolicyRules.noMatchedSaleBehavior)
  const outsideWindowBehavior = normalizeDecision(rules.outsideWindowBehavior, fallbackPolicyRules.outsideWindowBehavior)

  return {
    returnWindowDays: normalizePositiveInteger(rules.returnWindowDays, fallbackPolicyRules.returnWindowDays),
    cacheMinutes: normalizePositiveInteger(rules.cacheMinutes, fallbackPolicyRules.cacheMinutes),
    allowedActions: allowedActions.length ? allowedActions : fallbackPolicyRules.allowedActions,
    noMatchedSaleBehavior,
    outsideWindowBehavior
  }
}

export function evaluateReturnEligibility(
  payload: ReturnEligibilityPayload,
  candidates: CommerceOrderLineCandidate[],
  policy?: ReturnPolicyInput | null,
  now = new Date()
): ReturnEligibilityEvaluation {
  const rules = normalizePolicyRules(policy)
  const expiresAt = new Date(now.getTime() + rules.cacheMinutes * 60_000).toISOString()
  const normalized = normalizeReturnEligibilityRequest(payload)
  const policySummary = {
    id: policy?.id || null,
    version: policy?.version ?? null,
    label: policy?.label || `Standard ${rules.returnWindowDays} day return policy`
  }

  if (!hasProductIdentity(payload)) {
    return buildEvaluation({
      decision: 'insufficient_context',
      allowedActions: [],
      managerRequired: false,
      expiresAt,
      reasonCodes: ['unknown_product'],
      message: 'Need a SKU, barcode, product identity, or product name before checking return eligibility.',
      matchedPurchase: null,
      policy: policySummary,
      approvedQty: payload.requested.quantity,
      evidence: { normalizedRequest: normalized }
    })
  }

  const candidate = pickBestCandidate(payload, candidates)

  if (!candidate) {
    return evaluateNoMatchedSale(payload, rules, policySummary, expiresAt, normalized)
  }

  const quantityPurchased = toNumber(candidate.quantityPurchased)
  const quantityAlreadyReturned = toNumber(candidate.quantityAlreadyReturned)
  const quantityReturnable = Math.max(0, quantityPurchased - quantityAlreadyReturned)
  const returnableUntil = candidate.returnableUntil || addDays(candidate.occurredAt, rules.returnWindowDays)
  const returnableUntilDate = returnableUntil ? new Date(returnableUntil) : null
  const matchedPurchase = toMatchedPurchase(candidate, quantityReturnable, returnableUntil)
  const baseEvidence = {
    normalizedRequest: normalized,
    matchedOrderId: candidate.orderId,
    matchedOrderLineId: candidate.orderLineId
  }

  if (isNonReturnable(candidate)) {
    return buildEvaluation({
      decision: 'ineligible',
      allowedActions: [],
      managerRequired: false,
      expiresAt,
      reasonCodes: ['non_returnable_product', 'final_sale'],
      message: 'This item is marked non-returnable.',
      matchedPurchase,
      policy: policySummary,
      approvedQty: 0,
      evidence: baseEvidence
    }, candidate)
  }

  if (quantityReturnable <= 0 || payload.requested.quantity > quantityReturnable) {
    return buildEvaluation({
      decision: 'ineligible',
      allowedActions: [],
      managerRequired: false,
      expiresAt,
      reasonCodes: ['quantity_already_returned'],
      message: 'No returnable quantity remains for this purchase line.',
      matchedPurchase,
      policy: policySummary,
      approvedQty: Math.max(0, quantityReturnable),
      evidence: baseEvidence
    }, candidate)
  }

  if (returnableUntilDate && returnableUntilDate.getTime() < now.getTime()) {
    const decision = rules.outsideWindowBehavior
    const allowedActions = decisionToAllowedActions(decision, rules.allowedActions)

    return buildEvaluation({
      decision,
      allowedActions,
      managerRequired: decision === 'manager_review',
      expiresAt,
      reasonCodes: decision === 'ineligible' ? ['outside_window'] : ['outside_window', 'manager_override_available'],
      message: messageForDecision(decision),
      matchedPurchase,
      policy: policySummary,
      approvedQty: decisionAllowsAuthorization(decision) ? payload.requested.quantity : 0,
      evidence: baseEvidence
    }, candidate)
  }

  const allowedActions = rules.allowedActions
  const requestedAction = payload.requested.action
  const decision = requestedAction !== 'either' && !allowedActions.includes(requestedAction)
    ? actionMismatchDecision(allowedActions)
    : decisionFromAllowedActions(allowedActions)

  return buildEvaluation({
    decision,
    allowedActions,
    managerRequired: decision === 'manager_review',
    expiresAt,
    reasonCodes: matchReasonCodes(payload),
    message: messageForDecision(decision),
    matchedPurchase,
    policy: policySummary,
    approvedQty: payload.requested.quantity,
    evidence: baseEvidence
  }, candidate)
}

export function formatStoredEligibilityResponse(row: {
  id: string
  authorization_id?: string | null
  decision: ReturnEligibilityDecision
  allowed_actions: unknown
  manager_required: boolean
  expires_at?: string | null
  reason_codes: string[] | null
  evidence: Record<string, unknown> | null
}) {
  const evidence = row.evidence || {}

  return {
    decisionId: row.id,
    authorizationId: row.authorization_id || null,
    decision: row.decision,
    allowedActions: normalizeStoredActions(row.allowed_actions),
    managerRequired: row.manager_required,
    expiresAt: row.expires_at || null,
    reasonCodes: row.reason_codes || [],
    message: typeof evidence.message === 'string' ? evidence.message : messageForDecision(row.decision),
    matchedPurchase: isRecord(evidence.matchedPurchase) ? evidence.matchedPurchase : null,
    policy: isRecord(evidence.policy) ? evidence.policy : null,
    counterEvidence: Array.isArray(evidence.counterEvidence) ? evidence.counterEvidence : []
  }
}

export function buildDemoReturnEligibilityResponse(payload: ReturnEligibilityPayload) {
  const evaluation = evaluateReturnEligibility(payload, [demoCandidate(payload)], {
    version: 1,
    label: 'Demo 30 day return policy',
    rules: {}
  }, new Date('2026-06-24T01:15:00.000Z'))
  const hash = createReturnEligibilityRequestHash(payload)
  const authorizationId = decisionAllowsAuthorization(evaluation.decision) ? `demo_auth_${hash.slice(0, 12)}` : null

  return {
    mode: 'demo',
    decisionId: `demo_${hash.slice(0, 12)}`,
    ...toReturnEligibilityResponse(evaluation, authorizationId)
  }
}

export function toReturnEligibilityResponse(evaluation: ReturnEligibilityEvaluation, authorizationId: string | null) {
  return {
    authorizationId,
    decision: evaluation.decision,
    allowedActions: evaluation.allowedActions,
    managerRequired: evaluation.managerRequired,
    expiresAt: evaluation.expiresAt,
    reasonCodes: evaluation.reasonCodes,
    message: evaluation.message,
    matchedPurchase: evaluation.matchedPurchase,
    policy: evaluation.policy.version === null && !evaluation.policy.id ? null : {
      version: evaluation.policy.version,
      label: evaluation.policy.label
    },
    counterEvidence: evaluation.counterEvidence
  }
}

export function decisionAllowsAuthorization(decision: ReturnEligibilityDecision) {
  return decision === 'eligible' || decision === 'exchange_only' || decision === 'store_credit_only'
}

function evaluateNoMatchedSale(
  payload: ReturnEligibilityPayload,
  rules: ReturnPolicyRules,
  policy: ReturnEligibilityEvaluation['policy'],
  expiresAt: string,
  normalized: ReturnType<typeof normalizeReturnEligibilityRequest>
): ReturnEligibilityEvaluation {
  const decision = rules.noMatchedSaleBehavior
  const allowedActions = decisionToAllowedActions(decision, rules.allowedActions)

  return buildEvaluation({
    decision,
    allowedActions,
    managerRequired: decision === 'manager_review',
    expiresAt,
    reasonCodes: decision === 'not_found' ? ['policy_fallback'] : ['email_product_match_no_order', 'policy_fallback'],
    message: messageForDecision(decision),
    matchedPurchase: null,
    policy,
    approvedQty: decisionAllowsAuthorization(decision) ? payload.requested.quantity : 0,
    evidence: { normalizedRequest: normalized }
  })
}

function buildEvaluation(
  input: Omit<ReturnEligibilityEvaluation, 'matchedPersonId' | 'matchedOrderId' | 'matchedOrderLineId' | 'counterEvidence'>,
  candidate?: CommerceOrderLineCandidate
): ReturnEligibilityEvaluation {
  const counterEvidence = buildCounterEvidence(input.matchedPurchase, input.reasonCodes, input.managerRequired)
  const evidence = {
    ...input.evidence,
    message: input.message,
    matchedPurchase: input.matchedPurchase,
    policy: input.policy,
    counterEvidence
  }

  return {
    ...input,
    allowedActions: input.allowedActions,
    matchedPersonId: candidate?.personId || null,
    matchedOrderId: candidate?.orderId || null,
    matchedOrderLineId: candidate?.orderLineId || null,
    counterEvidence,
    evidence
  }
}

function pickBestCandidate(payload: ReturnEligibilityPayload, candidates: CommerceOrderLineCandidate[]) {
  if (!candidates.length) {
    return null
  }

  return [...candidates].sort((left, right) => scoreCandidate(payload, right) - scoreCandidate(payload, left))[0] || null
}

function scoreCandidate(payload: ReturnEligibilityPayload, candidate: CommerceOrderLineCandidate) {
  let score = 0
  const product = payload.product
  const hint = payload.purchaseHint.receiptOrOrderNumber?.toLowerCase()
  const candidateRefs = [
    candidate.externalOrderRef,
    candidate.orderNumber,
    candidate.receiptNumber
  ].filter(Boolean).map((value) => String(value).toLowerCase())

  if (hint && candidateRefs.includes(hint)) score += 10
  if (product.sku && candidate.sku && product.sku.toLowerCase() === candidate.sku.toLowerCase()) score += 5
  if (product.productIdentityId && product.productIdentityId === candidate.productIdentityId) score += 5
  if (product.barcode && candidate.productRef?.barcode === product.barcode) score += 4
  if (payload.purchaseHint.orderDate && candidate.occurredAt.startsWith(payload.purchaseHint.orderDate)) score += 3

  return score
}

function toMatchedPurchase(candidate: CommerceOrderLineCandidate, quantityReturnable: number, returnableUntil: string | null): MatchedPurchaseSummary {
  return {
    sourceSystem: candidate.sourceSystem,
    orderRef: candidate.orderNumber || candidate.receiptNumber || candidate.externalOrderRef,
    orderDate: candidate.occurredAt,
    orderLineRef: candidate.externalLineRef || null,
    productName: candidate.productName || null,
    sku: candidate.sku || null,
    quantityPurchased: toNumber(candidate.quantityPurchased),
    quantityAlreadyReturned: toNumber(candidate.quantityAlreadyReturned),
    quantityReturnable,
    returnableUntil
  }
}

function buildCounterEvidence(
  matchedPurchase: MatchedPurchaseSummary | null,
  reasonCodes: string[],
  managerRequired: boolean
) {
  const rows: Array<{ label: string, value: string }> = []

  if (matchedPurchase) {
    rows.push({ label: 'Order date', value: matchedPurchase.orderDate.slice(0, 10) })
    rows.push({ label: 'Source', value: matchedPurchase.sourceSystem })
    rows.push({ label: 'Purchased quantity', value: String(matchedPurchase.quantityPurchased) })
    rows.push({ label: 'Already returned', value: String(matchedPurchase.quantityAlreadyReturned) })
    rows.push({ label: 'Returnable quantity', value: String(matchedPurchase.quantityReturnable) })

    if (matchedPurchase.returnableUntil) {
      rows.push({ label: 'Return deadline', value: matchedPurchase.returnableUntil })
    }
  }

  if (reasonCodes.length) {
    rows.push({ label: 'Reason', value: reasonCodes.join(', ') })
  }

  if (managerRequired) {
    rows.push({ label: 'Manager approval', value: 'Required' })
  }

  return rows
}

function hasProductIdentity(payload: ReturnEligibilityPayload) {
  return Boolean(
    payload.product.sku ||
    payload.product.barcode ||
    payload.product.productIdentityId ||
    payload.product.name
  )
}

function isNonReturnable(candidate: CommerceOrderLineCandidate) {
  const policy = candidate.policySnapshot || {}
  const product = candidate.productRef || {}

  return Boolean(
    policy.nonReturnable ||
    policy.non_returnable ||
    policy.finalSale ||
    policy.final_sale ||
    product.nonReturnable ||
    product.non_returnable ||
    product.finalSale ||
    product.final_sale
  )
}

function matchReasonCodes(payload: ReturnEligibilityPayload) {
  const codes = ['within_window', 'quantity_available']

  if (payload.purchaseHint.receiptOrOrderNumber) {
    codes.push('receipt_match')
  } else {
    codes.push('email_order_match')
  }

  return codes
}

function decisionFromAllowedActions(actions: ReturnAction[]): ReturnEligibilityDecision {
  if (actions.includes('refund')) return 'eligible'
  if (actions.includes('exchange')) return 'exchange_only'
  if (actions.includes('store_credit')) return 'store_credit_only'
  return 'manager_review'
}

function actionMismatchDecision(actions: ReturnAction[]): ReturnEligibilityDecision {
  if (actions.includes('exchange')) return 'exchange_only'
  if (actions.includes('store_credit')) return 'store_credit_only'
  return 'manager_review'
}

function decisionToAllowedActions(decision: ReturnEligibilityDecision, policyAllowedActions: ReturnAction[]) {
  if (decision === 'eligible') return policyAllowedActions
  if (decision === 'exchange_only') return ['exchange'] satisfies ReturnAction[]
  if (decision === 'store_credit_only') return ['store_credit'] satisfies ReturnAction[]
  if (decision === 'manager_review') return policyAllowedActions
  return []
}

function messageForDecision(decision: ReturnEligibilityDecision) {
  const messages: Record<ReturnEligibilityDecision, string> = {
    eligible: 'Return is eligible.',
    exchange_only: 'Exchange is allowed, but refund is blocked.',
    store_credit_only: 'Store credit is allowed, but refund is blocked.',
    manager_review: 'Manager review is required before proceeding.',
    ineligible: 'Return is not eligible.',
    not_found: 'No matching purchase was found.',
    insufficient_context: 'More return details are required.'
  }

  return messages[decision]
}

function normalizeDecision(value: unknown, fallback: ReturnEligibilityDecision): ReturnEligibilityDecision {
  return typeof value === 'string' && decisionSet.has(value as ReturnEligibilityDecision)
    ? value as ReturnEligibilityDecision
    : fallback
}

function normalizePositiveInteger(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback
}

function normalizeStoredActions(value: unknown): ReturnAction[] {
  const actions = typeof value === 'string' ? safeJsonParse(value) : value

  return Array.isArray(actions)
    ? actions.filter((action): action is ReturnAction => typeof action === 'string' && actionSet.has(action as ReturnAction))
    : []
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value)
  } catch {
    return []
  }
}

function addDays(value: string, days: number) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString()
}

function normalizeOptional(value?: string) {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function toNumber(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function demoCandidate(payload: ReturnEligibilityPayload): CommerceOrderLineCandidate {
  const sku = payload.product.sku || 'DEMO-SKU'

  return {
    orderId: 'demo_order_001',
    orderLineId: 'demo_line_001',
    sourceSystem: payload.sourceSystem || 'pos',
    externalOrderRef: 'DEMO-000123',
    orderNumber: 'DEMO-000123',
    receiptNumber: payload.purchaseHint.receiptOrOrderNumber || 'DEMO-000123',
    emailAtPurchase: normalizeReturnEmail(payload.customer.email),
    occurredAt: payload.purchaseHint.orderDate ? `${payload.purchaseHint.orderDate}T04:00:00.000Z` : '2026-06-01T04:00:00.000Z',
    externalLineRef: 'line-1',
    productRef: {
      sku,
      barcode: payload.product.barcode || null,
      name: payload.product.name || 'Demo product'
    },
    sku,
    productName: payload.product.name || 'Demo product',
    quantityPurchased: 1,
    quantityAlreadyReturned: 0
  }
}
