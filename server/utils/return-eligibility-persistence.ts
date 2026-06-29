import type { SupabaseClient } from '@supabase/supabase-js'
import type { Sql, TransactionSql } from 'postgres'
import type { ReturnEligibilityPayload } from './contracts'
import {
  createReturnEligibilityRequestHash,
  decisionAllowsAuthorization,
  evaluateReturnEligibility,
  formatStoredEligibilityResponse,
  normalizeReturnEmail,
  toReturnEligibilityResponse,
  type CommerceOrderLineCandidate,
  type ReturnPolicyInput
} from './return-eligibility'

type SupabaseLike = SupabaseClient
type QuerySql = Sql | TransactionSql

interface PolicyRow {
  id: string
  version: number
  label: string | null
  rules: Record<string, unknown>
}

export async function checkReturnEligibilityWithSql(
  sql: Sql,
  workspaceId: string,
  payload: ReturnEligibilityPayload,
  actorId: string | null
) {
  const requestHash = createReturnEligibilityRequestHash(payload)

  return await sql.begin(async (tx) => {
    const cached = await loadCachedCheckWithSql(tx, workspaceId, requestHash)

    if (cached) {
      return {
        mode: 'supabase',
        ...formatStoredEligibilityResponse(cached)
      }
    }

    const policy = await loadPublishedPolicyWithSql(tx, workspaceId)
    const candidates = await loadCandidatesWithSql(tx, workspaceId, payload)
    const evaluation = evaluateReturnEligibility(payload, candidates, policy)
    const [check] = await tx<Array<{ id: string }>>`
      insert into public.crm_return_eligibility_checks (
        workspace_id,
        request_hash,
        email_hint,
        order_date_hint,
        receipt_or_order_hint,
        product_ref,
        sku,
        requested_qty,
        requested_action,
        matched_person_id,
        matched_order_id,
        matched_order_line_id,
        decision,
        allowed_actions,
        reason_codes,
        manager_required,
        policy_version_id,
        evidence,
        expires_at
      )
      values (
        ${workspaceId}::uuid,
        ${requestHash},
        ${payload.customer.email},
        ${payload.purchaseHint.orderDate || null}::date,
        ${payload.purchaseHint.receiptOrOrderNumber || null},
        ${JSON.stringify(payload.product)}::jsonb,
        ${payload.product.sku || null},
        ${payload.requested.quantity},
        ${payload.requested.action},
        ${isUuid(evaluation.matchedPersonId) ? evaluation.matchedPersonId : null}::uuid,
        ${isUuid(evaluation.matchedOrderId) ? evaluation.matchedOrderId : null}::uuid,
        ${isUuid(evaluation.matchedOrderLineId) ? evaluation.matchedOrderLineId : null}::uuid,
        ${evaluation.decision},
        ${JSON.stringify(evaluation.allowedActions)}::jsonb,
        ${evaluation.reasonCodes},
        ${evaluation.managerRequired},
        ${isUuid(policy?.id) ? policy.id : null}::uuid,
        ${JSON.stringify(evaluation.evidence)}::jsonb,
        ${evaluation.expiresAt}::timestamptz
      )
      on conflict (workspace_id, request_hash) do update set
        email_hint = excluded.email_hint,
        order_date_hint = excluded.order_date_hint,
        receipt_or_order_hint = excluded.receipt_or_order_hint,
        product_ref = excluded.product_ref,
        sku = excluded.sku,
        requested_qty = excluded.requested_qty,
        requested_action = excluded.requested_action,
        matched_person_id = excluded.matched_person_id,
        matched_order_id = excluded.matched_order_id,
        matched_order_line_id = excluded.matched_order_line_id,
        decision = excluded.decision,
        allowed_actions = excluded.allowed_actions,
        reason_codes = excluded.reason_codes,
        manager_required = excluded.manager_required,
        policy_version_id = excluded.policy_version_id,
        evidence = excluded.evidence,
        expires_at = excluded.expires_at
      returning id::text as id
    `

    const authorizationId = check?.id
      ? await issueAuthorizationWithSql(tx, workspaceId, check.id, evaluation)
      : null

    await tx`
      insert into public.crm_audit_events (workspace_id, actor_id, event_type, subject_type, subject_id, metadata)
      values (
        ${workspaceId}::uuid,
        ${isUuid(actorId) ? actorId : null}::uuid,
        'return_eligibility.checked',
        'return_eligibility_check',
        ${isUuid(check?.id) ? check?.id : null}::uuid,
        ${JSON.stringify({
          requestHash,
          decision: evaluation.decision,
          sourceSystem: payload.sourceSystem,
          staff: payload.staff,
          store: payload.store
        })}::jsonb
      )
    `

    return {
      mode: 'supabase',
      decisionId: check?.id,
      ...toReturnEligibilityResponse(evaluation, authorizationId)
    }
  })
}

export async function checkReturnEligibilityWithSupabase(
  supabase: SupabaseLike,
  workspaceId: string,
  payload: ReturnEligibilityPayload,
  actorId: string | null
) {
  const requestHash = createReturnEligibilityRequestHash(payload)
  const cached = await loadCachedCheckWithSupabase(supabase, workspaceId, requestHash)

  if (cached) {
    return {
      mode: 'supabase',
      ...formatStoredEligibilityResponse(cached)
    }
  }

  const policy = await loadPublishedPolicyWithSupabase(supabase, workspaceId)
  const candidates = await loadCandidatesWithSupabase(supabase, workspaceId, payload)
  const evaluation = evaluateReturnEligibility(payload, candidates, policy)
  const { data: check, error } = await supabase
    .from('crm_return_eligibility_checks')
    .upsert({
      workspace_id: workspaceId,
      request_hash: requestHash,
      email_hint: payload.customer.email,
      order_date_hint: payload.purchaseHint.orderDate || null,
      receipt_or_order_hint: payload.purchaseHint.receiptOrOrderNumber || null,
      product_ref: payload.product,
      sku: payload.product.sku || null,
      requested_qty: payload.requested.quantity,
      requested_action: payload.requested.action,
      matched_person_id: isUuid(evaluation.matchedPersonId) ? evaluation.matchedPersonId : null,
      matched_order_id: isUuid(evaluation.matchedOrderId) ? evaluation.matchedOrderId : null,
      matched_order_line_id: isUuid(evaluation.matchedOrderLineId) ? evaluation.matchedOrderLineId : null,
      decision: evaluation.decision,
      allowed_actions: evaluation.allowedActions,
      reason_codes: evaluation.reasonCodes,
      manager_required: evaluation.managerRequired,
      policy_version_id: isUuid(policy?.id) ? policy.id : null,
      evidence: evaluation.evidence,
      expires_at: evaluation.expiresAt
    }, {
      onConflict: 'workspace_id,request_hash'
    })
    .select('id')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const authorizationId = check?.id
    ? await issueAuthorizationWithSupabase(supabase, workspaceId, String(check.id), evaluation)
    : null

  await supabase
    .from('crm_audit_events')
    .insert({
      workspace_id: workspaceId,
      actor_id: isUuid(actorId) ? actorId : null,
      event_type: 'return_eligibility.checked',
      subject_type: 'return_eligibility_check',
      subject_id: check?.id || null,
      metadata: {
        requestHash,
        decision: evaluation.decision,
        sourceSystem: payload.sourceSystem,
        staff: payload.staff,
        store: payload.store
      }
    })

  return {
    mode: 'supabase',
    decisionId: check?.id,
    ...toReturnEligibilityResponse(evaluation, authorizationId)
  }
}

async function loadCachedCheckWithSql(sql: QuerySql, workspaceId: string, requestHash: string) {
  const rows = await sql<Array<{
    id: string
    authorization_id: string | null
    decision: any
    allowed_actions: unknown
    manager_required: boolean
    expires_at: string | null
    reason_codes: string[]
    evidence: Record<string, unknown> | null
  }>>`
    select
      checks.id::text as id,
      auth.id::text as authorization_id,
      checks.decision,
      checks.allowed_actions,
      checks.manager_required,
      checks.expires_at,
      checks.reason_codes,
      checks.evidence
    from public.crm_return_eligibility_checks checks
    left join lateral (
      select id
      from public.crm_return_authorizations
      where workspace_id = checks.workspace_id
        and eligibility_check_id = checks.id
        and status = 'issued'
        and valid_until > now()
      order by created_at desc
      limit 1
    ) auth on true
    where checks.workspace_id = ${workspaceId}::uuid
      and checks.request_hash = ${requestHash}
      and (checks.expires_at is null or checks.expires_at > now())
    limit 1
  `

  return rows[0] || null
}

async function loadCachedCheckWithSupabase(supabase: SupabaseLike, workspaceId: string, requestHash: string) {
  const now = new Date().toISOString()
  const { data: check, error } = await supabase
    .from('crm_return_eligibility_checks')
    .select('id, decision, allowed_actions, manager_required, expires_at, reason_codes, evidence')
    .eq('workspace_id', workspaceId)
    .eq('request_hash', requestHash)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .maybeSingle()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  if (!check) {
    return null
  }

  const { data: auth, error: authError } = await supabase
    .from('crm_return_authorizations')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('eligibility_check_id', check.id)
    .eq('status', 'issued')
    .gt('valid_until', now)
    .order('created_at', { ascending: false })
    .limit(1)

  if (authError) {
    throw createError({ statusCode: 500, statusMessage: authError.message })
  }

  return {
    ...check,
    authorization_id: auth?.[0]?.id || null
  }
}

async function loadPublishedPolicyWithSql(sql: QuerySql, workspaceId: string): Promise<ReturnPolicyInput | null> {
  const rows = await sql<Array<PolicyRow>>`
    select id::text, version, label, rules
    from public.crm_return_policies
    where workspace_id = ${workspaceId}::uuid
      and status = 'published'
      and effective_from <= now()
      and (effective_until is null or effective_until > now())
    order by version desc
    limit 1
  `

  return rows[0] || null
}

async function loadPublishedPolicyWithSupabase(supabase: SupabaseLike, workspaceId: string): Promise<ReturnPolicyInput | null> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('crm_return_policies')
    .select('id, version, label, rules')
    .eq('workspace_id', workspaceId)
    .eq('status', 'published')
    .lte('effective_from', now)
    .or(`effective_until.is.null,effective_until.gt.${now}`)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return data as ReturnPolicyInput | null
}

async function loadCandidatesWithSql(sql: QuerySql, workspaceId: string, payload: ReturnEligibilityPayload) {
  if (!hasProductIdentity(payload)) {
    return []
  }

  const email = normalizeReturnEmail(payload.customer.email)
  const receiptOrOrder = payload.purchaseHint.receiptOrOrderNumber || null
  const orderDate = payload.purchaseHint.orderDate || null
  const sku = payload.product.sku || null
  const barcode = payload.product.barcode || null
  const productIdentityId = payload.product.productIdentityId || null
  const productName = payload.product.name || null
  const rows = await sql<Array<{
    person_id: string | null
    order_id: string
    order_line_id: string
    source_system: string
    external_order_ref: string
    order_number: string | null
    receipt_number: string | null
    email_at_purchase: string | null
    occurred_at: string
    external_line_ref: string | null
    product_identity_id: string | null
    product_ref: Record<string, unknown> | null
    sku: string | null
    product_name: string | null
    quantity_purchased: number
    quantity_already_returned: number
    unit_price: number | null
    final_line_total: number | null
    returnable_until: string | null
    policy_snapshot: Record<string, unknown> | null
  }>>`
    select
      orders.person_id::text,
      orders.id::text as order_id,
      line.id::text as order_line_id,
      orders.source_system,
      orders.external_order_ref,
      orders.order_number,
      orders.receipt_number,
      orders.email_at_purchase,
      orders.occurred_at::text,
      line.external_line_ref,
      line.product_identity_id,
      line.product_ref,
      line.sku,
      line.product_name,
      line.quantity_purchased::float8 as quantity_purchased,
      line.quantity_already_returned::float8 as quantity_already_returned,
      line.unit_price::float8 as unit_price,
      line.final_line_total::float8 as final_line_total,
      line.returnable_until::text,
      line.policy_snapshot
    from public.crm_commerce_order_lines line
    join public.crm_commerce_orders orders on orders.id = line.order_id
    where orders.workspace_id = ${workspaceId}::uuid
      and line.workspace_id = ${workspaceId}::uuid
      and lower(orders.email_at_purchase) = ${email}
      and (
        ${receiptOrOrder}::text is null
        or orders.external_order_ref = ${receiptOrOrder}
        or orders.order_number = ${receiptOrOrder}
        or orders.receipt_number = ${receiptOrOrder}
      )
      and (${orderDate}::date is null or orders.occurred_at::date = ${orderDate}::date)
      and (
        (${sku}::text is not null and lower(line.sku) = lower(${sku}::text))
        or (${barcode}::text is not null and line.product_ref->>'barcode' = ${barcode})
        or (${productIdentityId}::text is not null and line.product_identity_id = ${productIdentityId})
        or (${productName}::text is not null and lower(line.product_name) = lower(${productName}::text))
      )
    order by
      case
        when ${receiptOrOrder}::text is not null and (
          orders.external_order_ref = ${receiptOrOrder}
          or orders.order_number = ${receiptOrOrder}
          or orders.receipt_number = ${receiptOrOrder}
        ) then 0
        else 1
      end,
      orders.occurred_at desc
    limit 10
  `

  return rows.map((row) => ({
    personId: row.person_id,
    orderId: row.order_id,
    orderLineId: row.order_line_id,
    sourceSystem: row.source_system,
    externalOrderRef: row.external_order_ref,
    orderNumber: row.order_number,
    receiptNumber: row.receipt_number,
    emailAtPurchase: row.email_at_purchase,
    occurredAt: row.occurred_at,
    externalLineRef: row.external_line_ref,
    productIdentityId: row.product_identity_id,
    productRef: row.product_ref,
    sku: row.sku,
    productName: row.product_name,
    quantityPurchased: row.quantity_purchased,
    quantityAlreadyReturned: row.quantity_already_returned,
    unitPrice: row.unit_price,
    finalLineTotal: row.final_line_total,
    returnableUntil: row.returnable_until,
    policySnapshot: row.policy_snapshot
  })) satisfies CommerceOrderLineCandidate[]
}

async function loadCandidatesWithSupabase(supabase: SupabaseLike, workspaceId: string, payload: ReturnEligibilityPayload) {
  if (!hasProductIdentity(payload)) {
    return []
  }

  const email = normalizeReturnEmail(payload.customer.email)
  const { data: orders, error: orderError } = await supabase
    .from('crm_commerce_orders')
    .select('id, person_id, source_system, external_order_ref, order_number, receipt_number, email_at_purchase, occurred_at')
    .eq('workspace_id', workspaceId)
    .eq('email_at_purchase', email)
    .order('occurred_at', { ascending: false })
    .limit(50)

  if (orderError) {
    throw createError({ statusCode: 500, statusMessage: orderError.message })
  }

  const filteredOrders = (orders || []).filter((order) => matchesOrderHint(order, payload))
  const orderIds = filteredOrders.map((order) => order.id)

  if (!orderIds.length) {
    return []
  }

  const { data: lines, error: lineError } = await supabase
    .from('crm_commerce_order_lines')
    .select('id, order_id, external_line_ref, product_identity_id, product_ref, sku, product_name, quantity_purchased, quantity_already_returned, unit_price, final_line_total, returnable_until, policy_snapshot')
    .eq('workspace_id', workspaceId)
    .in('order_id', orderIds)

  if (lineError) {
    throw createError({ statusCode: 500, statusMessage: lineError.message })
  }

  const ordersById = new Map(filteredOrders.map((order) => [order.id, order]))

  return (lines || [])
    .filter((line) => matchesProduct(line, payload))
    .map((line) => {
      const order = ordersById.get(line.order_id)!

      return {
        personId: order.person_id,
        orderId: order.id,
        orderLineId: line.id,
        sourceSystem: order.source_system,
        externalOrderRef: order.external_order_ref,
        orderNumber: order.order_number,
        receiptNumber: order.receipt_number,
        emailAtPurchase: order.email_at_purchase,
        occurredAt: order.occurred_at,
        externalLineRef: line.external_line_ref,
        productIdentityId: line.product_identity_id,
        productRef: line.product_ref,
        sku: line.sku,
        productName: line.product_name,
        quantityPurchased: Number(line.quantity_purchased),
        quantityAlreadyReturned: Number(line.quantity_already_returned),
        unitPrice: line.unit_price === null ? null : Number(line.unit_price),
        finalLineTotal: line.final_line_total === null ? null : Number(line.final_line_total),
        returnableUntil: line.returnable_until,
        policySnapshot: line.policy_snapshot
      }
    }) satisfies CommerceOrderLineCandidate[]
}

async function issueAuthorizationWithSql(
  sql: QuerySql,
  workspaceId: string,
  checkId: string,
  evaluation: ReturnType<typeof evaluateReturnEligibility>
) {
  if (!decisionAllowsAuthorization(evaluation.decision) || evaluation.approvedQty <= 0) {
    return null
  }

  const [auth] = await sql<Array<{ id: string }>>`
    insert into public.crm_return_authorizations (
      workspace_id,
      eligibility_check_id,
      matched_order_line_id,
      product_ref,
      approved_qty,
      allowed_actions,
      status,
      valid_until,
      metadata
    )
    values (
      ${workspaceId}::uuid,
      ${checkId}::uuid,
      ${isUuid(evaluation.matchedOrderLineId) ? evaluation.matchedOrderLineId : null}::uuid,
      ${JSON.stringify(evaluation.evidence.normalizedRequest && typeof evaluation.evidence.normalizedRequest === 'object'
        ? (evaluation.evidence.normalizedRequest as { product?: unknown }).product || {}
        : {})}::jsonb,
      ${evaluation.approvedQty},
      ${JSON.stringify(evaluation.allowedActions)}::jsonb,
      'issued',
      ${evaluation.expiresAt}::timestamptz,
      ${JSON.stringify({
        decision: evaluation.decision,
        reasonCodes: evaluation.reasonCodes,
        matchedPurchase: evaluation.matchedPurchase
      })}::jsonb
    )
    returning id::text as id
  `

  return auth?.id || null
}

async function issueAuthorizationWithSupabase(
  supabase: SupabaseLike,
  workspaceId: string,
  checkId: string,
  evaluation: ReturnType<typeof evaluateReturnEligibility>
) {
  if (!decisionAllowsAuthorization(evaluation.decision) || evaluation.approvedQty <= 0) {
    return null
  }

  const productRef = evaluation.evidence.normalizedRequest && typeof evaluation.evidence.normalizedRequest === 'object'
    ? (evaluation.evidence.normalizedRequest as { product?: unknown }).product || {}
    : {}

  const { data, error } = await supabase
    .from('crm_return_authorizations')
    .insert({
      workspace_id: workspaceId,
      eligibility_check_id: checkId,
      matched_order_line_id: isUuid(evaluation.matchedOrderLineId) ? evaluation.matchedOrderLineId : null,
      product_ref: productRef,
      approved_qty: evaluation.approvedQty,
      allowed_actions: evaluation.allowedActions,
      status: 'issued',
      valid_until: evaluation.expiresAt,
      metadata: {
        decision: evaluation.decision,
        reasonCodes: evaluation.reasonCodes,
        matchedPurchase: evaluation.matchedPurchase
      }
    })
    .select('id')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return data?.id || null
}

function matchesOrderHint(order: Record<string, any>, payload: ReturnEligibilityPayload) {
  const receiptOrOrder = payload.purchaseHint.receiptOrOrderNumber
  const orderDate = payload.purchaseHint.orderDate

  if (receiptOrOrder) {
    const refs = [order.external_order_ref, order.order_number, order.receipt_number].filter(Boolean).map(String)

    if (!refs.includes(receiptOrOrder)) {
      return false
    }
  }

  if (orderDate && !String(order.occurred_at).startsWith(orderDate)) {
    return false
  }

  return true
}

function matchesProduct(line: Record<string, any>, payload: ReturnEligibilityPayload) {
  const productRef = line.product_ref && typeof line.product_ref === 'object' ? line.product_ref as Record<string, unknown> : {}

  return Boolean(
    payload.product.sku && line.sku && String(line.sku).toLowerCase() === payload.product.sku.toLowerCase() ||
    payload.product.productIdentityId && line.product_identity_id === payload.product.productIdentityId ||
    payload.product.barcode && productRef.barcode === payload.product.barcode ||
    payload.product.name && line.product_name && String(line.product_name).toLowerCase() === payload.product.name.toLowerCase()
  )
}

function hasProductIdentity(payload: ReturnEligibilityPayload) {
  return Boolean(
    payload.product.sku ||
    payload.product.barcode ||
    payload.product.productIdentityId ||
    payload.product.name
  )
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
