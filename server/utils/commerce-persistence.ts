import type { SupabaseClient } from '@supabase/supabase-js'
import type { Sql, TransactionSql } from 'postgres'
import type { CrmEventPayload } from './contracts'
import {
  buildCommerceOrderProjection,
  buildCommerceReturnProjection,
  type CommerceOrderLineProjection,
  type CommerceReturnLineProjection,
  type CommerceReturnProjection
} from './commerce-projections'

type SupabaseLike = SupabaseClient
type QuerySql = Sql | TransactionSql

export async function projectCommerceEventWithSql(
  sql: QuerySql,
  rawEventId: string,
  event: CrmEventPayload
) {
  if (!event.workspaceId) {
    return
  }

  const orderProjection = buildCommerceOrderProjection(event)

  if (orderProjection) {
    const [order] = await sql<Array<{ id: string }>>`
      insert into public.crm_commerce_orders (
        workspace_id,
        source_system,
        external_order_ref,
        order_number,
        receipt_number,
        email_at_purchase,
        occurred_at,
        status,
        currency,
        subtotal,
        discount_total,
        tax_total,
        total,
        raw_event_id,
        metadata
      )
      values (
        ${event.workspaceId}::uuid,
        ${orderProjection.sourceSystem},
        ${orderProjection.externalOrderRef},
        ${orderProjection.orderNumber},
        ${orderProjection.receiptNumber},
        ${orderProjection.emailAtPurchase},
        ${orderProjection.occurredAt}::timestamptz,
        ${orderProjection.status},
        ${orderProjection.currency},
        ${orderProjection.subtotal},
        ${orderProjection.discountTotal},
        ${orderProjection.taxTotal},
        ${orderProjection.total},
        ${rawEventId}::uuid,
        ${JSON.stringify(orderProjection.metadata)}::jsonb
      )
      on conflict (workspace_id, source_system, external_order_ref) do update set
        order_number = excluded.order_number,
        receipt_number = excluded.receipt_number,
        email_at_purchase = excluded.email_at_purchase,
        occurred_at = excluded.occurred_at,
        status = excluded.status,
        currency = excluded.currency,
        subtotal = excluded.subtotal,
        discount_total = excluded.discount_total,
        tax_total = excluded.tax_total,
        total = excluded.total,
        raw_event_id = excluded.raw_event_id,
        metadata = excluded.metadata,
        updated_at = now()
      returning id::text as id
    `

    if (order) {
      for (const line of orderProjection.lines) {
        await upsertOrderLineWithSql(sql, event.workspaceId, order.id, line)
      }
    }
  }

  const returnProjection = buildCommerceReturnProjection(event)

  if (returnProjection) {
    await projectCommerceReturnWithSql(sql, event.workspaceId, rawEventId, returnProjection)
  }
}

export async function projectCommerceEventWithSupabase(
  supabase: SupabaseLike,
  rawEventId: string,
  event: CrmEventPayload
) {
  if (!event.workspaceId) {
    return
  }

  const orderProjection = buildCommerceOrderProjection(event)

  if (orderProjection) {
    const { data: order, error } = await supabase
      .from('crm_commerce_orders')
      .upsert({
        workspace_id: event.workspaceId,
        source_system: orderProjection.sourceSystem,
        external_order_ref: orderProjection.externalOrderRef,
        order_number: orderProjection.orderNumber,
        receipt_number: orderProjection.receiptNumber,
        email_at_purchase: orderProjection.emailAtPurchase,
        occurred_at: orderProjection.occurredAt,
        status: orderProjection.status,
        currency: orderProjection.currency,
        subtotal: orderProjection.subtotal,
        discount_total: orderProjection.discountTotal,
        tax_total: orderProjection.taxTotal,
        total: orderProjection.total,
        raw_event_id: rawEventId,
        metadata: orderProjection.metadata
      }, {
        onConflict: 'workspace_id,source_system,external_order_ref'
      })
      .select('id')
      .single()

    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message })
    }

    for (const line of orderProjection.lines) {
      await upsertOrderLineWithSupabase(supabase, event.workspaceId, String(order.id), line)
    }
  }

  const returnProjection = buildCommerceReturnProjection(event)

  if (returnProjection) {
    await projectCommerceReturnWithSupabase(supabase, event.workspaceId, rawEventId, returnProjection)
  }
}

async function upsertOrderLineWithSql(
  sql: QuerySql,
  workspaceId: string,
  orderId: string,
  line: CommerceOrderLineProjection
) {
  await sql`
    insert into public.crm_commerce_order_lines (
      workspace_id,
      order_id,
      external_line_ref,
      product_identity_id,
      product_ref,
      sku,
      product_name,
      quantity_purchased,
      unit_price,
      final_line_total,
      returnable_until,
      policy_snapshot,
      metadata
    )
    values (
      ${workspaceId}::uuid,
      ${orderId}::uuid,
      ${line.externalLineRef},
      ${line.productIdentityId},
      ${JSON.stringify(line.productRef)}::jsonb,
      ${line.sku},
      ${line.productName},
      ${line.quantityPurchased},
      ${line.unitPrice},
      ${line.finalLineTotal},
      ${line.returnableUntil ? `${line.returnableUntil}` : null}::timestamptz,
      ${JSON.stringify(line.policySnapshot)}::jsonb,
      ${JSON.stringify(line.metadata)}::jsonb
    )
    on conflict (workspace_id, order_id, external_line_ref) where external_line_ref is not null do update set
      product_identity_id = excluded.product_identity_id,
      product_ref = excluded.product_ref,
      sku = excluded.sku,
      product_name = excluded.product_name,
      quantity_purchased = excluded.quantity_purchased,
      unit_price = excluded.unit_price,
      final_line_total = excluded.final_line_total,
      returnable_until = excluded.returnable_until,
      policy_snapshot = excluded.policy_snapshot,
      metadata = excluded.metadata,
      updated_at = now()
  `
}

async function upsertOrderLineWithSupabase(
  supabase: SupabaseLike,
  workspaceId: string,
  orderId: string,
  line: CommerceOrderLineProjection
) {
  const { data: existing, error: existingError } = await supabase
    .from('crm_commerce_order_lines')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('order_id', orderId)
    .eq('external_line_ref', line.externalLineRef)
    .maybeSingle()

  if (existingError) {
    throw createError({ statusCode: 500, statusMessage: existingError.message })
  }

  const row = {
    workspace_id: workspaceId,
    order_id: orderId,
    external_line_ref: line.externalLineRef,
    product_identity_id: line.productIdentityId,
    product_ref: line.productRef,
    sku: line.sku,
    product_name: line.productName,
    quantity_purchased: line.quantityPurchased,
    unit_price: line.unitPrice,
    final_line_total: line.finalLineTotal,
    returnable_until: line.returnableUntil,
    policy_snapshot: line.policySnapshot,
    metadata: line.metadata,
    updated_at: new Date().toISOString()
  }

  const result = existing
    ? await supabase.from('crm_commerce_order_lines').update(row).eq('id', existing.id)
    : await supabase.from('crm_commerce_order_lines').insert(row)

  if (result.error) {
    throw createError({ statusCode: 500, statusMessage: result.error.message })
  }
}

async function projectCommerceReturnWithSql(
  sql: QuerySql,
  workspaceId: string,
  rawEventId: string,
  projection: CommerceReturnProjection
) {
  for (const line of projection.lines) {
    const orderLineId = await findReturnOrderLineIdWithSql(sql, workspaceId, projection, line)

    const inserted = await sql<Array<{ id: string }>>`
      insert into public.crm_commerce_return_facts (
        workspace_id,
        source_system,
        external_return_ref,
        external_line_ref,
        order_line_id,
        eligibility_check_id,
        authorization_id,
        returned_qty,
        reason_code,
        disposition,
        occurred_at,
        raw_event_id,
        metadata
      )
      values (
        ${workspaceId}::uuid,
        ${projection.sourceSystem},
        ${projection.externalReturnRef},
        ${line.externalLineRef},
        ${orderLineId}::uuid,
        ${isUuid(projection.eligibilityCheckId) ? projection.eligibilityCheckId : null}::uuid,
        ${isUuid(projection.authorizationId) ? projection.authorizationId : null}::uuid,
        ${line.returnedQty},
        ${line.reasonCode},
        ${line.disposition},
        ${projection.occurredAt}::timestamptz,
        ${rawEventId}::uuid,
        ${JSON.stringify(line.metadata)}::jsonb
      )
      on conflict (workspace_id, source_system, external_return_ref, external_line_ref) do nothing
      returning id::text as id
    `

    if (inserted.length && orderLineId) {
      await sql`
        update public.crm_commerce_order_lines
        set quantity_already_returned = quantity_already_returned + ${line.returnedQty},
            updated_at = now()
        where workspace_id = ${workspaceId}::uuid
          and id = ${orderLineId}::uuid
      `
    }
  }

  if (isUuid(projection.authorizationId)) {
    await sql`
      update public.crm_return_authorizations
      set status = 'consumed',
          consumed_by_source_system = ${projection.sourceSystem},
          consumed_by_return_ref = ${projection.externalReturnRef},
          consumed_at = ${projection.occurredAt}::timestamptz
      where workspace_id = ${workspaceId}::uuid
        and id = ${projection.authorizationId}::uuid
        and status <> 'consumed'
    `
  }
}

async function projectCommerceReturnWithSupabase(
  supabase: SupabaseLike,
  workspaceId: string,
  rawEventId: string,
  projection: CommerceReturnProjection
) {
  for (const line of projection.lines) {
    const orderLineId = await findReturnOrderLineIdWithSupabase(supabase, workspaceId, projection, line)
    const { data: inserted, error } = await supabase
      .from('crm_commerce_return_facts')
      .upsert({
        workspace_id: workspaceId,
        source_system: projection.sourceSystem,
        external_return_ref: projection.externalReturnRef,
        external_line_ref: line.externalLineRef,
        order_line_id: orderLineId,
        eligibility_check_id: isUuid(projection.eligibilityCheckId) ? projection.eligibilityCheckId : null,
        authorization_id: isUuid(projection.authorizationId) ? projection.authorizationId : null,
        returned_qty: line.returnedQty,
        reason_code: line.reasonCode,
        disposition: line.disposition,
        occurred_at: projection.occurredAt,
        raw_event_id: rawEventId,
        metadata: line.metadata
      }, {
        onConflict: 'workspace_id,source_system,external_return_ref,external_line_ref',
        ignoreDuplicates: true
      })
      .select('id')

    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message })
    }

    if (inserted?.length && orderLineId) {
      const { data: current, error: currentError } = await supabase
        .from('crm_commerce_order_lines')
        .select('quantity_already_returned')
        .eq('workspace_id', workspaceId)
        .eq('id', orderLineId)
        .single()

      if (currentError) {
        throw createError({ statusCode: 500, statusMessage: currentError.message })
      }

      const nextReturned = Number(current.quantity_already_returned || 0) + line.returnedQty
      const { error: updateError } = await supabase
        .from('crm_commerce_order_lines')
        .update({
          quantity_already_returned: nextReturned,
          updated_at: new Date().toISOString()
        })
        .eq('workspace_id', workspaceId)
        .eq('id', orderLineId)

      if (updateError) {
        throw createError({ statusCode: 500, statusMessage: updateError.message })
      }
    }
  }

  if (isUuid(projection.authorizationId)) {
    const { error } = await supabase
      .from('crm_return_authorizations')
      .update({
        status: 'consumed',
        consumed_by_source_system: projection.sourceSystem,
        consumed_by_return_ref: projection.externalReturnRef,
        consumed_at: projection.occurredAt
      })
      .eq('workspace_id', workspaceId)
      .eq('id', projection.authorizationId)
      .neq('status', 'consumed')

    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message })
    }
  }
}

async function findReturnOrderLineIdWithSql(
  sql: QuerySql,
  workspaceId: string,
  projection: CommerceReturnProjection,
  line: CommerceReturnLineProjection
) {
  if (isUuid(line.orderLineId)) {
    return line.orderLineId
  }

  const orderRef = line.sourceOrderRef || line.sourceReceiptNumber

  if (!orderRef || !line.originalLineRef) {
    return null
  }

  const rows = await sql<Array<{ id: string }>>`
    select line.id::text as id
    from public.crm_commerce_order_lines line
    join public.crm_commerce_orders orders on orders.id = line.order_id
    where line.workspace_id = ${workspaceId}::uuid
      and orders.workspace_id = ${workspaceId}::uuid
      and orders.source_system = ${projection.sourceSystem}
      and (
        orders.external_order_ref = ${orderRef}
        or orders.order_number = ${orderRef}
        or orders.receipt_number = ${orderRef}
      )
      and line.external_line_ref = ${line.originalLineRef}
    limit 1
  `

  return rows[0]?.id || null
}

async function findReturnOrderLineIdWithSupabase(
  supabase: SupabaseLike,
  workspaceId: string,
  projection: CommerceReturnProjection,
  line: CommerceReturnLineProjection
) {
  if (isUuid(line.orderLineId)) {
    return line.orderLineId
  }

  const orderRef = line.sourceOrderRef || line.sourceReceiptNumber

  if (!orderRef || !line.originalLineRef) {
    return null
  }

  const { data: orders, error: orderError } = await supabase
    .from('crm_commerce_orders')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('source_system', projection.sourceSystem)
    .or(`external_order_ref.eq.${orderRef},order_number.eq.${orderRef},receipt_number.eq.${orderRef}`)
    .limit(5)

  if (orderError) {
    throw createError({ statusCode: 500, statusMessage: orderError.message })
  }

  const orderIds = (orders || []).map((order) => order.id)

  if (!orderIds.length) {
    return null
  }

  const { data: lines, error: lineError } = await supabase
    .from('crm_commerce_order_lines')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('external_line_ref', line.originalLineRef)
    .in('order_id', orderIds)
    .limit(1)

  if (lineError) {
    throw createError({ statusCode: 500, statusMessage: lineError.message })
  }

  return lines?.[0]?.id || null
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
