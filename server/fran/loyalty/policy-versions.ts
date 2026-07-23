import type { FranLoyaltyPolicyRules } from '../../utils/contracts'

export const defaultFranProgramKey = 'fran_with_benefits'
export const defaultFranProgramName = "Fran's With Benefits"

export const franLoyaltyV21Rules: FranLoyaltyPolicyRules = {
  schemaVersion: 1,
  programKey: defaultFranProgramKey,
  currency: 'SGD',
  execution: {
    policyOwner: 'fran-crm',
    executor: 'fran-pos',
    pricingAuthority: 'fran-skums',
    inventoryAuthority: 'fran-skums'
  },
  tiers: [
    {
      key: 'F1',
      label: 'Tier 1',
      rank: 1,
      spendThresholdMinor: 0,
      earnMultiplier: 1,
      expiryFrozen: false,
      metadata: {
        sourceLabel: 'Free member',
        aliases: ['tier_1', 'Base']
      }
    },
    {
      key: 'F2',
      label: 'Tier 2',
      rank: 2,
      spendThresholdMinor: 50000,
      earnMultiplier: 1.25,
      expiryFrozen: true,
      metadata: {
        qualificationWindow: 'calendar_year',
        aliases: ['tier_2', 'Silver']
      }
    },
    {
      key: 'F3',
      label: 'Tier 3',
      rank: 3,
      spendThresholdMinor: 125000,
      earnMultiplier: 1.5,
      expiryFrozen: true,
      metadata: {
        qualificationWindow: 'calendar_year',
        aliases: ['tier_3', 'Gold']
      }
    }
  ],
  earning: {
    base: {
      spendMinorPerPoint: 100,
      rounding: 'floor_each_component'
    },
    tierMultiplierAppliesTo: 'eligible_skus_from_skums_quote'
  },
  redemption: {
    voucherExpiry: {
      duration: 'P1M',
      basis: 'issued_at'
    },
    brackets: [
      { points: 200, rewardMinor: 600 },
      { points: 500, rewardMinor: 2000 },
      { points: 1000, rewardMinor: 5000 },
      { points: 1500, rewardMinor: 9000 },
      { points: 2500, rewardMinor: 17500 }
    ]
  },
  expiry: {
    pointBatchExpiry: {
      basis: 'earn_date_plus_12_months_end_of_next_calendar_quarter',
      frozenForTierKeys: ['tier_2', 'tier_3']
    }
  },
  bonuses: [
    { id: 'signup', points: 50, trigger: 'member_signup' },
    { id: 'profile_completion', points: 70, trigger: 'profile_completed' },
    { id: 'social_follow_instagram', points: 15, trigger: 'instagram_follow_verified' },
    { id: 'social_follow_tiktok', points: 15, trigger: 'tiktok_follow_verified' },
    { id: 'product_review', points: 10, trigger: 'product_review_verified', limit: 'once_per_product' },
    { id: 'birthday_transaction', multiplier: 1, trigger: 'birthday_month_transaction', stacking: 'additive' }
  ],
  rewards: [],
  constraints: {
    posRequiresSkumsQuote: true,
    rewardProductStockRequiresSkumsReservation: true,
    offlineRedemptionRequiresManagerPolicy: true
  },
  metadata: {
    source: 'docs/loyaltys.pdf',
    loadedAsSchema: true,
    fwbStackMode: 'additive'
  }
}

export type FranLoyaltyProgramRow = {
  id: string
  workspace_id: string
  key: string
  name: string
  description: string | null
  status: string
  default_currency: string
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type FranLoyaltyPolicyVersionRow = {
  id: string
  workspace_id: string
  program_id: string
  version_key: string
  version_label: string
  status: string
  effective_from: string | null
  effective_to: string | null
  rules: Record<string, unknown>
  source_document_ref: string | null
  source_hash: string | null
  change_note: string | null
  created_by: string | null
  published_by: string | null
  published_at: string | null
  retired_at: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type FranLoyaltyPolicyAssignmentRow = {
  id: string
  workspace_id: string
  program_id: string
  policy_version_id: string
  assignment_key: string
  assignment_type: string
  target_ref: string | null
  priority: number
  allocation_percent: string | number
  status: string
  starts_at: string | null
  ends_at: string | null
  assignment_rules: Record<string, unknown>
  external_ids: Record<string, unknown>
  created_by: string | null
  created_at: string
  updated_at: string
}

export function buildDemoFranLoyaltyPolicyBundle(workspaceId = 'demo_workspace') {
  const program = normalizeProgramRow({
    id: 'demo_fran_loyalty_program',
    workspace_id: workspaceId,
    key: defaultFranProgramKey,
    name: defaultFranProgramName,
    description: 'Demo Fran loyalty program for local policy-loading flows.',
    status: 'active',
    default_currency: 'SGD',
    metadata: {},
    created_at: '2026-07-08T00:00:00.000Z',
    updated_at: '2026-07-08T00:00:00.000Z'
  })
  const policyVersion = normalizePolicyVersionRow({
    id: 'demo_fran_loyalty_policy_v2_1',
    workspace_id: workspaceId,
    program_id: 'demo_fran_loyalty_program',
    version_key: 'v2.1',
    version_label: 'Fran loyalty v2.1',
    status: 'active',
    effective_from: '2026-07-08T00:00:00.000Z',
    effective_to: null,
    rules: franLoyaltyV21Rules,
    source_document_ref: 'fran loyalty v2.1.docx.pdf',
    source_hash: null,
    change_note: 'Demo active policy bundle.',
    created_by: null,
    published_by: null,
    published_at: '2026-07-08T00:00:00.000Z',
    retired_at: null,
    metadata: {},
    created_at: '2026-07-08T00:00:00.000Z',
    updated_at: '2026-07-08T00:00:00.000Z'
  })
  const assignment = normalizeAssignmentRow({
    id: 'demo_fran_loyalty_assignment_default',
    workspace_id: workspaceId,
    program_id: 'demo_fran_loyalty_program',
    policy_version_id: 'demo_fran_loyalty_policy_v2_1',
    assignment_key: 'default',
    assignment_type: 'workspace_default',
    target_ref: null,
    priority: 100,
    allocation_percent: 100,
    status: 'active',
    starts_at: '2026-07-08T00:00:00.000Z',
    ends_at: null,
    assignment_rules: {},
    external_ids: {},
    created_by: null,
    created_at: '2026-07-08T00:00:00.000Z',
    updated_at: '2026-07-08T00:00:00.000Z'
  })

  return {
    mode: 'demo',
    program,
    policyVersion,
    assignment,
    posContract: buildPosContract(policyVersion.id, assignment.id),
    warnings: ['Demo policy bundle. Supabase persistence is not configured or workspaceId was omitted.']
  }
}

export function normalizeProgramRow(row: FranLoyaltyProgramRow) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    key: row.key,
    name: row.name,
    description: row.description,
    status: row.status,
    defaultCurrency: row.default_currency,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function normalizePolicyVersionRow(row: FranLoyaltyPolicyVersionRow) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    programId: row.program_id,
    versionKey: row.version_key,
    versionLabel: row.version_label,
    status: row.status,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    rules: row.rules || {},
    sourceDocumentRef: row.source_document_ref,
    sourceHash: row.source_hash,
    changeNote: row.change_note,
    createdBy: row.created_by,
    publishedBy: row.published_by,
    publishedAt: row.published_at,
    retiredAt: row.retired_at,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function normalizeAssignmentRow(row: FranLoyaltyPolicyAssignmentRow) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    programId: row.program_id,
    policyVersionId: row.policy_version_id,
    assignmentKey: row.assignment_key,
    assignmentType: row.assignment_type,
    targetRef: row.target_ref,
    priority: row.priority,
    allocationPercent: Number(row.allocation_percent),
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    assignmentRules: row.assignment_rules || {},
    externalIds: row.external_ids || {},
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function buildPosContract(policyVersionId: string, assignmentId?: string | null) {
  return {
    policyVersionId,
    assignmentId: assignmentId || null,
    executor: 'fran-pos',
    pricingAuthority: 'fran-skums',
    inventoryAuthority: 'fran-skums',
    ledgerAuthority: 'fran-crm',
    requiredCheckoutInputs: [
      'crmMemberAccountSnapshot',
      'skumsBasketQuote',
      'skumsProductContext',
      'posCounterSession'
    ],
    requiredCommitOutputs: [
      'policyVersionId',
      'assignmentId',
      'skumsQuoteId',
      'skumsReservationId',
      'posSaleId',
      'evaluationTrace',
      'idempotencyKey'
    ]
  }
}
