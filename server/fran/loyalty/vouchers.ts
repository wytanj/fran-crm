/**
 * FWB vouchers — dens quote (in-app redeem → QR) + POS authorize (scan).
 * Demo store is in-memory; codes are also pattern-parseable for offline POS.
 */
import {
  FWB_REDEEM_DENOMS,
  isValidFwbRedeemDenom,
  redeemDiscountForPoints
} from './fwb-engine'

export type FwbVoucherKind = 'points_redeem' | 'birthday' | 'category_bonus'

export interface FwbIssuedVoucher {
  code: string
  kind: FwbVoucherKind
  memberId: string
  pointsCost: number
  discount: number
  currency: string
  issuedAt: string
  expiresAt: string
  status: 'issued' | 'authorized' | 'consumed' | 'expired'
  authorizedAt?: string
  saleId?: string
  label: string
}

export interface QuoteRedeemDensInput {
  memberId: string
  points: number
  availablePoints: number
  currency?: string
  workspaceId?: string
}

export interface QuoteRedeemDensResult {
  ok: true
  voucher: FwbIssuedVoucher
  dens: { points: number, discount: number }
  confirmationText: string
}

export interface AuthorizeVoucherInput {
  code: string
  memberId?: string | null
  saleId?: string | null
  workspaceId?: string
}

export interface AuthorizeVoucherResult {
  ok: boolean
  valid: boolean
  code: string
  kind: FwbVoucherKind | null
  memberId: string | null
  pointsCost: number
  discount: number
  currency: string
  birthdayActive: boolean
  categoryActive: boolean
  label: string | null
  expiresAt: string | null
  reason: string | null
  voucher?: FwbIssuedVoucher
}

const issued = new Map<string, FwbIssuedVoucher>()

function addMonthsIso(months: number, from = Date.now()) {
  const d = new Date(from)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString()
}

function token() {
  return Math.random().toString(36).slice(2, 10).toUpperCase()
}

function normalizeCode(raw: string) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
}

/** Fixed dens list for POS UI. */
export function listRedeemDens() {
  return FWB_REDEEM_DENOMS.map((d) => ({
    points: d.points,
    discount: d.discount,
    conversionPerPoint: d.discount / d.points
  }))
}

/**
 * Quote a fixed-denom points redemption (PDF: in-app redeem → QR, 1 month validity).
 */
export function quoteRedeemDens(input: QuoteRedeemDensInput): QuoteRedeemDensResult {
  const points = Math.floor(Number(input.points) || 0)
  const available = Math.max(0, Math.floor(Number(input.availablePoints) || 0))
  if (!isValidFwbRedeemDenom(points)) {
    throw Object.assign(
      new Error(
        `Points must be a fixed FWB dens: ${FWB_REDEEM_DENOMS.map((d) => d.points).join(', ')}`
      ),
      { statusCode: 400 }
    )
  }
  if (available < points) {
    throw Object.assign(
      new Error(`Member has ${available} pts; need ${points} for this dens`),
      { statusCode: 400 }
    )
  }
  const discount = redeemDiscountForPoints(points)!
  const currency = (input.currency || 'SGD').toUpperCase()
  const code = `FWB-RDM-${points}-${token()}`
  const voucher: FwbIssuedVoucher = {
    code,
    kind: 'points_redeem',
    memberId: input.memberId,
    pointsCost: points,
    discount,
    currency,
    issuedAt: new Date().toISOString(),
    expiresAt: addMonthsIso(1),
    status: 'issued',
    label: `Redeem ${points} pts → ${currency} ${discount.toFixed(2)} off`
  }
  issued.set(code, voucher)
  return {
    ok: true,
    voucher,
    dens: { points, discount },
    confirmationText: `Show this code at checkout: ${code}. Valid 1 month. No min spend.`
  }
}

/** Issue demo birthday / category vouchers (app or counter). */
export function issueEarnVoucher(input: {
  memberId: string
  kind: 'birthday' | 'category_bonus'
  currency?: string
}): FwbIssuedVoucher {
  const prefix = input.kind === 'birthday' ? 'FWB-BDAY' : 'FWB-CAT'
  const code = `${prefix}-${token()}`
  const voucher: FwbIssuedVoucher = {
    code,
    kind: input.kind,
    memberId: input.memberId,
    pointsCost: 0,
    discount: 0,
    currency: (input.currency || 'SGD').toUpperCase(),
    issuedAt: new Date().toISOString(),
    expiresAt: addMonthsIso(1),
    status: 'issued',
    label:
      input.kind === 'birthday'
        ? 'Birthday month bonus (+1.00 earn rate) — scan at POS'
        : 'Category bonus (+1.00 earn rate) — scan at POS'
  }
  issued.set(code, voucher)
  return voucher
}

/**
 * Authorize a scanned voucher at POS.
 * Accepts issued tokens and well-known demo patterns.
 */
export function authorizeVoucher(input: AuthorizeVoucherInput): AuthorizeVoucherResult {
  const code = normalizeCode(input.code)
  if (!code) {
    return invalid(code, 'Empty voucher code')
  }

  let voucher = issued.get(code) || null

  // Pattern parse for demo / offline QR payloads
  if (!voucher) {
    voucher = parsePatternVoucher(code, input.memberId || null)
    if (voucher) issued.set(code, voucher)
  }

  if (!voucher) {
    return invalid(code, 'Unknown or expired voucher code')
  }

  if (voucher.status === 'consumed') {
    return invalid(code, 'Voucher already used')
  }
  if (new Date(voucher.expiresAt).getTime() < Date.now()) {
    voucher.status = 'expired'
    return invalid(code, 'Voucher expired')
  }
  if (input.memberId && voucher.memberId && input.memberId !== voucher.memberId) {
    // Allow if voucher was generic demo without lock
    if (!voucher.memberId.startsWith('ANY')) {
      return invalid(code, 'Voucher belongs to a different member')
    }
  }

  voucher.status = 'authorized'
  voucher.authorizedAt = new Date().toISOString()
  if (input.saleId) voucher.saleId = input.saleId
  issued.set(code, voucher)

  return {
    ok: true,
    valid: true,
    code: voucher.code,
    kind: voucher.kind,
    memberId: voucher.memberId,
    pointsCost: voucher.pointsCost,
    discount: voucher.discount,
    currency: voucher.currency,
    birthdayActive: voucher.kind === 'birthday',
    categoryActive: voucher.kind === 'category_bonus',
    label: voucher.label,
    expiresAt: voucher.expiresAt,
    reason: null,
    voucher
  }
}

function parsePatternVoucher(
  code: string,
  memberId: string | null
): FwbIssuedVoucher | null {
  // FWB-RDM-500-ABC123
  const rdm = code.match(/^FWB-RDM-(\d+)-([A-Z0-9]+)$/)
  if (rdm) {
    const points = Number(rdm[1])
    if (!isValidFwbRedeemDenom(points)) return null
    const discount = redeemDiscountForPoints(points)!
    return {
      code,
      kind: 'points_redeem',
      memberId: memberId || 'ANY',
      pointsCost: points,
      discount,
      currency: 'SGD',
      issuedAt: new Date().toISOString(),
      expiresAt: addMonthsIso(1),
      status: 'issued',
      label: `Redeem ${points} pts → SGD ${discount.toFixed(2)} off`
    }
  }
  if (/^FWB-BDAY(-|$)/.test(code) || code === 'BDAY' || code === 'BIRTHDAY') {
    return {
      code,
      kind: 'birthday',
      memberId: memberId || 'ANY',
      pointsCost: 0,
      discount: 0,
      currency: 'SGD',
      issuedAt: new Date().toISOString(),
      expiresAt: addMonthsIso(1),
      status: 'issued',
      label: 'Birthday month bonus (+1.00 earn)'
    }
  }
  if (/^FWB-CAT(-|$)/.test(code) || code === 'CAT' || code === 'CATEGORY') {
    return {
      code,
      kind: 'category_bonus',
      memberId: memberId || 'ANY',
      pointsCost: 0,
      discount: 0,
      currency: 'SGD',
      issuedAt: new Date().toISOString(),
      expiresAt: addMonthsIso(1),
      status: 'issued',
      label: 'Category bonus (+1.00 earn)'
    }
  }
  return null
}

function invalid(code: string, reason: string): AuthorizeVoucherResult {
  return {
    ok: false,
    valid: false,
    code,
    kind: null,
    memberId: null,
    pointsCost: 0,
    discount: 0,
    currency: 'SGD',
    birthdayActive: false,
    categoryActive: false,
    label: null,
    expiresAt: null,
    reason
  }
}

export function resetVoucherStore() {
  issued.clear()
}

export function getIssuedVoucher(code: string) {
  return issued.get(normalizeCode(code)) || null
}
