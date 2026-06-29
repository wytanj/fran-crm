import type { CrmEventPayload } from './contracts'
import { normalizeReturnEmail } from './return-eligibility'

export interface CommerceOrderProjection {
  sourceSystem: string
  externalOrderRef: string
  orderNumber: string | null
  receiptNumber: string | null
  emailAtPurchase: string | null
  occurredAt: string
  status: string
  currency: string
  subtotal: number | null
  discountTotal: number | null
  taxTotal: number | null
  total: number | null
  metadata: Record<string, unknown>
  lines: CommerceOrderLineProjection[]
}

export interface CommerceOrderLineProjection {
  externalLineRef: string
  productIdentityId: string | null
  productRef: Record<string, unknown>
  sku: string | null
  productName: string | null
  quantityPurchased: number
  unitPrice: number | null
  finalLineTotal: number | null
  returnableUntil: string | null
  policySnapshot: Record<string, unknown>
  metadata: Record<string, unknown>
}

export interface CommerceReturnProjection {
  sourceSystem: string
  externalReturnRef: string
  occurredAt: string
  authorizationId: string | null
  eligibilityCheckId: string | null
  decision: string | null
  lines: CommerceReturnLineProjection[]
}

export interface CommerceReturnLineProjection {
  externalLineRef: string
  orderLineId: string | null
  sourceOrderRef: string | null
  sourceReceiptNumber: string | null
  originalLineRef: string | null
  sku: string | null
  returnedQty: number
  reasonCode: string | null
  disposition: string | null
  metadata: Record<string, unknown>
}

export function buildCommerceOrderProjection(event: CrmEventPayload): CommerceOrderProjection | null {
  if (!isSaleEvent(event.eventType)) {
    return null
  }

  const payload = event.payload
  const lines = getArray(payload.lines) || getArray(payload.items) || getArray(payload.cart_lines) || []
  const orderNumber = stringValue(payload.orderNumber) || stringValue(payload.order_number)
  const receiptNumber = stringValue(payload.receiptNumber) || stringValue(payload.receipt_number)
  const externalOrderRef = stringValue(payload.orderRef) ||
    stringValue(payload.order_ref) ||
    orderNumber ||
    receiptNumber ||
    event.eventId
  const customer = recordValue(payload.customer)
  const emailAtPurchase = stringValue(customer?.email) ||
    stringValue(payload.customerEmail) ||
    stringValue(payload.customer_email) ||
    stringValue(event.subject.customerKey)
  const projectedLines = lines
    .map((line, index) => projectOrderLine(line, index))
    .filter((line): line is CommerceOrderLineProjection => Boolean(line))

  if (!projectedLines.length) {
    return null
  }

  return {
    sourceSystem: event.sourceSystem,
    externalOrderRef,
    orderNumber,
    receiptNumber,
    emailAtPurchase: emailAtPurchase && emailAtPurchase.includes('@') ? normalizeReturnEmail(emailAtPurchase) : emailAtPurchase,
    occurredAt: event.occurredAt,
    status: stringValue(payload.status) || 'completed',
    currency: stringValue(payload.currency) || stringValue(event.context.currency) || 'USD',
    subtotal: numericValue(payload.subtotal),
    discountTotal: numericValue(payload.discountTotal) ?? numericValue(payload.discount_total),
    taxTotal: numericValue(payload.taxTotal) ?? numericValue(payload.tax_total),
    total: numericValue(payload.total) ?? numericValue(payload.total_amount) ?? numericValue(payload.grand_total),
    metadata: {
      context: event.context,
      subject: event.subject,
      sourcePayloadKeys: Object.keys(payload)
    },
    lines: projectedLines
  }
}

export function buildCommerceReturnProjection(event: CrmEventPayload): CommerceReturnProjection | null {
  if (!isReturnEvent(event.eventType)) {
    return null
  }

  const payload = event.payload
  const lines = getArray(payload.lines) || getArray(payload.items) || []
  const crmos = recordValue(payload.crmos)
  const externalReturnRef = stringValue(payload.returnNumber) ||
    stringValue(payload.return_number) ||
    stringValue(payload.refundNumber) ||
    stringValue(payload.refund_number) ||
    event.eventId
  const projectedLines = lines
    .map((line, index) => projectReturnLine(line, index))
    .filter((line): line is CommerceReturnLineProjection => Boolean(line))

  if (!projectedLines.length && !stringValue(crmos?.authorization_id) && !stringValue(crmos?.authorizationId)) {
    return null
  }

  return {
    sourceSystem: event.sourceSystem,
    externalReturnRef,
    occurredAt: event.occurredAt,
    authorizationId: stringValue(crmos?.authorization_id) || stringValue(crmos?.authorizationId),
    eligibilityCheckId: stringValue(crmos?.decision_id) || stringValue(crmos?.decisionId),
    decision: stringValue(crmos?.decision),
    lines: projectedLines
  }
}

function projectOrderLine(rawLine: unknown, index: number): CommerceOrderLineProjection | null {
  const line = recordValue(rawLine)

  if (!line) {
    return null
  }

  const lineType = stringValue(line.line_type) || stringValue(line.lineType)

  if (lineType === 'return') {
    return null
  }

  const quantity = Math.abs(numericValue(line.quantity) ?? numericValue(line.qty) ?? 0)

  if (!quantity) {
    return null
  }

  const product = recordValue(line.product) || recordValue(line.product_ref) || {}
  const sku = stringValue(line.sku) || stringValue(product.sku)
  const productName = stringValue(line.productName) || stringValue(line.product_name) || stringValue(line.name) || stringValue(product.name)
  const productIdentityId = stringValue(line.productIdentityId) ||
    stringValue(line.product_identity_id) ||
    stringValue(line.skums_product_id) ||
    stringValue(product.productIdentityId) ||
    stringValue(product.product_identity_id)
  const externalLineRef = stringValue(line.lineRef) ||
    stringValue(line.line_ref) ||
    stringValue(line.id) ||
    stringValue(line.skums_line_id) ||
    `${sku || productIdentityId || 'line'}:${index + 1}`

  return {
    externalLineRef,
    productIdentityId,
    productRef: {
      ...product,
      sku,
      name: productName,
      barcode: stringValue(line.barcode) || stringValue(product.barcode)
    },
    sku,
    productName,
    quantityPurchased: quantity,
    unitPrice: numericValue(line.unitPrice) ?? numericValue(line.unit_price),
    finalLineTotal: numericValue(line.finalLineTotal) ?? numericValue(line.final_line_total) ?? numericValue(line.total),
    returnableUntil: stringValue(line.returnableUntil) || stringValue(line.returnable_until),
    policySnapshot: recordValue(line.policySnapshot) || recordValue(line.policy_snapshot) || {},
    metadata: {
      sourceLine: line
    }
  }
}

function projectReturnLine(rawLine: unknown, index: number): CommerceReturnLineProjection | null {
  const line = recordValue(rawLine)

  if (!line) {
    return null
  }

  const returnPayload = recordValue(line.return) || line
  const quantity = Math.abs(numericValue(returnPayload.quantity) ?? numericValue(line.quantity) ?? numericValue(line.qty) ?? 1)
  const sku = stringValue(line.sku) || stringValue(returnPayload.sku)
  const originalLineRef = stringValue(returnPayload.original_line_ref) ||
    stringValue(returnPayload.originalLineRef) ||
    stringValue(line.original_line_ref) ||
    stringValue(line.originalLineRef)
  const externalLineRef = originalLineRef ||
    stringValue(line.id) ||
    stringValue(line.line_ref) ||
    `${sku || 'return-line'}:${index + 1}`

  return {
    externalLineRef,
    orderLineId: stringValue(returnPayload.crmos_order_line_id) ||
      stringValue(returnPayload.crmosOrderLineId) ||
      stringValue(line.crmos_order_line_id) ||
      stringValue(line.crmosOrderLineId),
    sourceOrderRef: stringValue(returnPayload.source_order_ref) || stringValue(returnPayload.sourceOrderRef),
    sourceReceiptNumber: stringValue(returnPayload.source_receipt_number) || stringValue(returnPayload.sourceReceiptNumber),
    originalLineRef,
    sku,
    returnedQty: quantity,
    reasonCode: stringValue(returnPayload.reason_code) || stringValue(returnPayload.reasonCode),
    disposition: stringValue(returnPayload.disposition),
    metadata: {
      sourceLine: line
    }
  }
}

function isSaleEvent(eventType: string) {
  return eventType === 'pos.sale.completed' ||
    eventType === 'commerce.order.completed' ||
    eventType === 'ecommerce.order.completed'
}

function isReturnEvent(eventType: string) {
  return eventType === 'pos.return.completed' ||
    eventType === 'commerce.return.completed' ||
    eventType === 'ecommerce.return.completed'
}

function getArray(value: unknown) {
  return Array.isArray(value) ? value : null
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function numericValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}
