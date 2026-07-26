/**
 * Persist FWB commit_sale to Supabase:
 * fran_loyalty_accounts + fran_loyalty_ledger + fran_loyalty_point_batches
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FranLoyaltyCommitSalePayload } from '../../utils/contracts'
import { defaultFranProgramKey, defaultFranProgramName } from './policy-versions'
import {
  normalizeFwbTierKey,
  settleFwbSale,
  type FwbCommitSaleResult,
  type FwbMemberAccountState,
  type FwbPointBatch
} from './fwb-engine'

const SOURCE = 'fran-pos'

function isUuid(value: string | null | undefined): boolean {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
      )
  )
}

function yearKey(occurredAt?: string) {
  const d = occurredAt ? new Date(occurredAt) : new Date()
  return String(d.getUTCFullYear())
}

async function ensureProgram(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<{ id: string, key: string }> {
  const { data: existing } = await supabase
    .from('fran_loyalty_programs')
    .select('id, key')
    .eq('workspace_id', workspaceId)
    .eq('key', defaultFranProgramKey)
    .maybeSingle()

  if (existing?.id) return { id: existing.id, key: existing.key }

  const { data, error } = await supabase
    .from('fran_loyalty_programs')
    .upsert(
      {
        workspace_id: workspaceId,
        key: defaultFranProgramKey,
        name: defaultFranProgramName,
        description: "Fran's With Benefits loyalty program",
        status: 'active',
        default_currency: 'SGD',
        metadata: { createdBy: 'commit_sale_persist' }
      },
      { onConflict: 'workspace_id,key' }
    )
    .select('id, key')
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Failed to ensure loyalty program')
  }
  return { id: data.id, key: data.key }
}

type AccountRow = {
  id: string
  points_balance: number | string
  current_tier_key: string | null
  lifetime_points_earned: number | string
  lifetime_points_redeemed: number | string
  spend_qualification: Record<string, unknown> | null
}

async function loadOrCreateAccount(
  supabase: SupabaseClient,
  workspaceId: string,
  programId: string,
  memberId: string,
  seed: {
    tierKey: string
    pointsBalance: number
    calendarYtdSpend: number
    policyVersionId: string | null
    personId: string | null
  }
): Promise<{
  id: string
  state: FwbMemberAccountState
  lifetimeEarned: number
  lifetimeRedeemed: number
}> {
  let account: AccountRow | null = null

  const byRef = await supabase
    .from('fran_loyalty_accounts')
    .select(
      'id, points_balance, current_tier_key, lifetime_points_earned, lifetime_points_redeemed, spend_qualification'
    )
    .eq('workspace_id', workspaceId)
    .eq('program_id', programId)
    .eq('member_ref', memberId)
    .maybeSingle()

  if (byRef.data) account = byRef.data as AccountRow

  if (!account && isUuid(memberId)) {
    const byPerson = await supabase
      .from('fran_loyalty_accounts')
      .select(
        'id, points_balance, current_tier_key, lifetime_points_earned, lifetime_points_redeemed, spend_qualification'
      )
      .eq('workspace_id', workspaceId)
      .eq('program_id', programId)
      .eq('person_entity_id', memberId)
      .maybeSingle()
    if (byPerson.data) account = byPerson.data as AccountRow
  }

  if (!account) {
    const personId = seed.personId && isUuid(seed.personId) ? seed.personId : null
    const { data: created, error } = await supabase
      .from('fran_loyalty_accounts')
      .insert({
        workspace_id: workspaceId,
        program_id: programId,
        person_entity_id: personId,
        member_ref: memberId,
        current_tier_key: normalizeFwbTierKey(seed.tierKey) || 'F1',
        points_balance: Math.max(0, seed.pointsBalance),
        lifetime_points_earned: 0,
        lifetime_points_redeemed: 0,
        spend_qualification: {
          calendar_year: yearKey(),
          ytd_spend: Math.max(0, seed.calendarYtdSpend)
        },
        active_policy_version_id:
          seed.policyVersionId && isUuid(seed.policyVersionId) ? seed.policyVersionId : null,
        source: 'fran_pos_commit_sale',
        external_ids: { pos_member_id: memberId },
        metadata: {}
      })
      .select(
        'id, points_balance, current_tier_key, lifetime_points_earned, lifetime_points_redeemed, spend_qualification'
      )
      .single()

    if (error || !created) {
      if (error?.code === '23505') {
        const retry = await supabase
          .from('fran_loyalty_accounts')
          .select(
            'id, points_balance, current_tier_key, lifetime_points_earned, lifetime_points_redeemed, spend_qualification'
          )
          .eq('workspace_id', workspaceId)
          .eq('program_id', programId)
          .eq('member_ref', memberId)
          .maybeSingle()
        if (retry.data) account = retry.data as AccountRow
      }
      if (!account) {
        throw new Error(error?.message || 'Failed to create loyalty account')
      }
    } else {
      account = created as AccountRow
    }
  }

  const { data: batchRows, error: batchErr } = await supabase
    .from('fran_loyalty_point_batches')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('account_id', account.id)
    .gt('points_remaining', 0)
    .order('theoretical_expiry_date', { ascending: true })

  if (batchErr) throw new Error(batchErr.message)

  const sq =
    account.spend_qualification && typeof account.spend_qualification === 'object'
      ? account.spend_qualification
      : {}
  const ytd = Number((sq as any).ytd_spend ?? 0)

  const batches: FwbPointBatch[] = (batchRows || []).map((b: any) => ({
    batchId: b.id,
    points: Number(b.points),
    pointsRemaining: Number(b.points_remaining),
    earnDate: b.earn_date,
    earnQuarter: b.earn_quarter,
    theoreticalExpiryDate: b.theoretical_expiry_date,
    source: b.source || 'pos_sale',
    frozen: Boolean(b.frozen)
  }))

  const state: FwbMemberAccountState = {
    memberId,
    pointsBalance: Number(account.points_balance) || 0,
    calendarYtdSpend: Number.isFinite(ytd) ? ytd : 0,
    tierKey: (normalizeFwbTierKey(account.current_tier_key) as any) || 'F1',
    batches
  }

  return {
    id: account.id,
    state,
    lifetimeEarned: Number(account.lifetime_points_earned) || 0,
    lifetimeRedeemed: Number(account.lifetime_points_redeemed) || 0
  }
}

async function findDuplicateCommit(
  supabase: SupabaseClient,
  workspaceId: string,
  idempotencyKey: string
): Promise<FwbCommitSaleResult | null> {
  const { data: rows } = await supabase
    .from('fran_loyalty_ledger')
    .select('id, entry_type, points_delta, balance_after, metadata, idempotency_key')
    .eq('workspace_id', workspaceId)
    .eq('source_system', SOURCE)
    .like('idempotency_key', `${idempotencyKey}%`)
    .order('created_at', { ascending: true })

  if (!rows?.length) return null

  const earn = rows.find((r) => r.idempotency_key === `${idempotencyKey}:earn`)
  const redeem = rows.find((r) => r.idempotency_key === `${idempotencyKey}:redeem`)
  const any = earn || redeem || rows[0]
  const meta = (any?.metadata && typeof any.metadata === 'object' ? any.metadata : {}) as Record<
    string,
    unknown
  >

  return {
    commitId: String(meta.commit_id || `fwb_commit_${idempotencyKey.slice(0, 40)}`),
    saleId: String(meta.sale_id || ''),
    status: 'duplicate',
    pointsEarned: earn ? Math.abs(Number(earn.points_delta) || 0) : 0,
    pointsRedeemed: redeem ? Math.abs(Number(redeem.points_delta) || 0) : 0,
    pointsBalanceAfter: Number(any?.balance_after ?? 0),
    tierAfter: (normalizeFwbTierKey(String(meta.tier_after || 'F1')) as any) || 'F1',
    calendarYtdSpendAfter: Number(meta.calendar_ytd_spend_after ?? 0),
    earnBatch: null,
    ledgerEntryIds: rows.map((r) => r.id),
    warnings: ['Idempotent replay — no new ledger rows written']
  }
}

export async function persistCommitSale(
  supabase: SupabaseClient,
  body: FranLoyaltyCommitSalePayload
): Promise<{ mode: 'supabase', ok: true, result: FwbCommitSaleResult }> {
  const workspaceId = body.workspaceId
  if (!workspaceId || !isUuid(workspaceId)) {
    throw new Error('workspaceId (uuid) is required for persisted commit_sale')
  }

  const dup = await findDuplicateCommit(supabase, workspaceId, body.idempotencyKey)
  if (dup) {
    return { mode: 'supabase', ok: true, result: dup }
  }

  const program = await ensureProgram(supabase, workspaceId)
  const session =
    body.session && typeof body.session === 'object' ? (body.session as Record<string, any>) : {}
  const member =
    session.member && typeof session.member === 'object'
      ? (session.member as Record<string, any>)
      : {}
  const tierKey = body.tierKey || String(member.tier || member.tierKey || 'F1')
  const calendarYtd = Number(member.calendarYtdSpend ?? member.trailingTwelveMonthSpend ?? 0)
  const pointsBalance = Number(member.pointsBalance ?? 0)
  const personId =
    (typeof member.crmCustomerId === 'string' && member.crmCustomerId) ||
    (typeof member.personId === 'string' && member.personId) ||
    null
  const policyVersionId =
    body.policyVersionId && isUuid(body.policyVersionId) ? body.policyVersionId : null

  const loaded = await loadOrCreateAccount(supabase, workspaceId, program.id, body.memberId, {
    tierKey,
    pointsBalance: Number.isFinite(pointsBalance) ? pointsBalance : 0,
    calendarYtdSpend: Number.isFinite(calendarYtd) ? calendarYtd : 0,
    policyVersionId,
    personId
  })

  const birthdayActive =
    body.birthdayActive ??
    (Array.isArray(body.voucherCodes) &&
      body.voucherCodes.some((c) => /bday|birthday/i.test(c)))
  const categoryActive =
    body.categoryActive ??
    (Array.isArray(body.voucherCodes) &&
      body.voucherCodes.some((c) => /cat|category/i.test(c)))

  const settlement = settleFwbSale(
    {
      saleId: body.saleId,
      memberId: body.memberId,
      idempotencyKey: body.idempotencyKey,
      netSpend: body.netSpend,
      tierKey,
      pointsEarned: body.pointsEarned,
      pointsRedeemed: body.pointsRedeemed,
      birthdayActive,
      categoryActive,
      occurredAt: body.occurredAt,
      policyVersionId,
      assignmentId: body.assignmentId,
      skumsQuoteId: body.skumsQuoteId,
      evaluationTrace: body.evaluationTrace || null
    },
    loaded.state
  )

  const { result, account, newEarnBatch, updatedBatches } = settlement
  const occurredAt = body.occurredAt || new Date().toISOString()
  const commitMeta = {
    commit_id: result.commitId,
    sale_id: body.saleId,
    receipt_no: body.receiptNo || null,
    assignment_id: body.assignmentId || null,
    skums_quote_id: body.skumsQuoteId || null,
    tier_after: account.tierKey,
    calendar_ytd_spend_after: account.calendarYtdSpend,
    currency: body.currency
  }

  const ledgerIds: string[] = []
  let runningBalance = loaded.state.pointsBalance

  if (result.pointsRedeemed > 0) {
    runningBalance = Math.max(0, runningBalance - result.pointsRedeemed)
    const { data: redeemRow, error: redeemErr } = await supabase
      .from('fran_loyalty_ledger')
      .insert({
        workspace_id: workspaceId,
        program_id: program.id,
        account_id: loaded.id,
        policy_version_id: policyVersionId,
        entry_type: 'redeem',
        points_delta: -result.pointsRedeemed,
        balance_after: runningBalance,
        occurred_at: occurredAt,
        source_system: SOURCE,
        idempotency_key: `${body.idempotencyKey}:redeem`,
        evaluation_trace: body.evaluationTrace || {},
        external_ids: { sale_id: body.saleId },
        metadata: commitMeta
      })
      .select('id')
      .single()

    if (redeemErr) {
      if (redeemErr.code === '23505') {
        const again = await findDuplicateCommit(supabase, workspaceId, body.idempotencyKey)
        if (again) return { mode: 'supabase', ok: true, result: again }
      }
      throw new Error(redeemErr.message)
    }
    if (redeemRow?.id) ledgerIds.push(redeemRow.id)
  }

  let earnLedgerId: string | null = null
  if (result.pointsEarned > 0) {
    runningBalance = runningBalance + result.pointsEarned
    const { data: earnRow, error: earnErr } = await supabase
      .from('fran_loyalty_ledger')
      .insert({
        workspace_id: workspaceId,
        program_id: program.id,
        account_id: loaded.id,
        policy_version_id: policyVersionId,
        entry_type: 'earn',
        points_delta: result.pointsEarned,
        balance_after: runningBalance,
        occurred_at: occurredAt,
        source_system: SOURCE,
        idempotency_key: `${body.idempotencyKey}:earn`,
        evaluation_trace: body.evaluationTrace || {},
        external_ids: { sale_id: body.saleId },
        metadata: commitMeta
      })
      .select('id')
      .single()

    if (earnErr) {
      if (earnErr.code === '23505') {
        const again = await findDuplicateCommit(supabase, workspaceId, body.idempotencyKey)
        if (again) return { mode: 'supabase', ok: true, result: again }
      }
      throw new Error(earnErr.message)
    }
    earnLedgerId = earnRow?.id || null
    if (earnLedgerId) ledgerIds.push(earnLedgerId)
  }

  for (const batch of updatedBatches) {
    if (!isUuid(batch.batchId)) continue
    const { error } = await supabase
      .from('fran_loyalty_point_batches')
      .update({
        points_remaining: batch.pointsRemaining,
        updated_at: new Date().toISOString()
      })
      .eq('id', batch.batchId)
      .eq('workspace_id', workspaceId)
    if (error) throw new Error(error.message)
  }

  if (newEarnBatch && result.pointsEarned > 0) {
    const { data: batchRow, error: batchErr } = await supabase
      .from('fran_loyalty_point_batches')
      .insert({
        workspace_id: workspaceId,
        program_id: program.id,
        account_id: loaded.id,
        ledger_entry_id: earnLedgerId,
        points: newEarnBatch.points,
        points_remaining: newEarnBatch.pointsRemaining,
        earn_date: newEarnBatch.earnDate,
        earn_quarter: newEarnBatch.earnQuarter,
        theoretical_expiry_date: newEarnBatch.theoreticalExpiryDate,
        frozen: newEarnBatch.frozen,
        source: 'pos_sale',
        sale_id: body.saleId,
        policy_version_id: policyVersionId,
        source_system: SOURCE,
        idempotency_key: `${body.idempotencyKey}:batch`,
        metadata: { commit_id: result.commitId }
      })
      .select('id')
      .single()

    if (batchErr && batchErr.code !== '23505') throw new Error(batchErr.message)
    if (batchRow?.id && result.earnBatch) {
      result.earnBatch.batchId = batchRow.id
    }
  }

  const { error: accErr } = await supabase
    .from('fran_loyalty_accounts')
    .update({
      points_balance: account.pointsBalance,
      current_tier_key: account.tierKey,
      lifetime_points_earned: loaded.lifetimeEarned + result.pointsEarned,
      lifetime_points_redeemed: loaded.lifetimeRedeemed + result.pointsRedeemed,
      spend_qualification: {
        calendar_year: yearKey(body.occurredAt),
        ytd_spend: account.calendarYtdSpend
      },
      active_policy_version_id: policyVersionId,
      updated_at: new Date().toISOString()
    })
    .eq('id', loaded.id)
    .eq('workspace_id', workspaceId)

  if (accErr) throw new Error(accErr.message)

  result.ledgerEntryIds = ledgerIds.length ? ledgerIds : result.ledgerEntryIds
  result.warnings = [...result.warnings, 'persisted:account+ledger+batches']

  return {
    mode: 'supabase',
    ok: true,
    result
  }
}
