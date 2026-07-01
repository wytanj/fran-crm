export type PlanKey = 'open_source' | 'hosted_growth' | 'hosted_scale'
export type CrmWorkspaceRole = 'owner' | 'admin' | 'member' | 'agent'

export interface CrmWorkspaceSummary {
  id: string
  name: string
  slug: string
  role: CrmWorkspaceRole
  plan: PlanKey | string
  hostingMode: string
  createdAt?: string
  updatedAt?: string
}

export interface CrmWorkspaceAccessResponse {
  mode: 'demo' | 'supabase'
  requiresSetup: boolean
  user: {
    id: string
    email: string
  } | null
  workspaces: CrmWorkspaceSummary[]
}

export interface WorkspaceSetupPayload {
  companyName: string
  slug?: string
  plan: Exclude<PlanKey, 'open_source'>
}

export type CrmEntityKind =
  | 'person'
  | 'company'
  | 'household'
  | 'order'
  | 'product'
  | 'ticket'
  | 'message'
  | 'campaign'
  | 'custom'

export type CrmFieldValueType =
  | 'text'
  | 'number'
  | 'date'
  | 'boolean'
  | 'email'
  | 'phone'
  | 'json'
  | 'enum'
  | 'single_select'
  | 'multi_select'
  | 'tag_list'

export type CrmSensitivityLevel = 'public' | 'internal' | 'confidential' | 'restricted'

export interface CrmEntity {
  id: string
  type: CrmEntityKind
  label: string
  externalIds: Record<string, string>
  attributes: Record<string, unknown>
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface CrmRelationship {
  id: string
  fromEntityId: string
  toEntityId: string
  type: string
  confidence: number
  source: string
}

export interface CrmMetric {
  label: string
  value: string
  detail: string
}

export interface CrmSchemaField {
  key: string
  label: string
  type: CrmFieldValueType
  required: boolean
  origin: 'core' | 'integration' | 'custom' | 'agent'
  packKey?: string | null
  description?: string | null
  helpText?: string | null
  sensitivityLevel?: CrmSensitivityLevel
  posVisible?: boolean
  cashierEditable?: boolean
  marketingUsable?: boolean
  uiContexts?: string[]
  enumValues?: string[]
  sortOrder?: number
  metadata?: Record<string, unknown>
}

export interface CrmProfilePackDefinition {
  key: string
  label: string
  description?: string
  vertical?: string
  status?: 'active' | 'archived'
  installMode?: 'manual' | 'default' | 'system'
  installed?: boolean
  metadata?: Record<string, unknown>
  fields: CrmSchemaField[]
}

export interface CrmGraphResponse {
  workspace?: CrmWorkspaceSummary
  metrics: CrmMetric[]
  entities: CrmEntity[]
  relationships: CrmRelationship[]
  customerFields: CrmSchemaField[]
  profilePacks: CrmProfilePackDefinition[]
  integrationBacklog: string[]
  proposals: Array<{
    id: string
    title: string
    impact: string
    status: 'draft' | 'needs_approval' | 'approved'
  }>
}

export type FranMemberTier = 'Bronze' | 'Silver' | 'Gold'
export type FranSignupBucket = 'day' | 'week' | 'month'

export interface FranTierCount {
  tier: FranMemberTier
  count: number
  share: number
}

export interface FranTierTrendPoint {
  period: string
  evaluatedAt: string
  bronze: number
  silver: number
  gold: number
  total: number
  source: 'evaluation_cycle' | 'current_snapshot' | 'demo'
}

export interface FranSignupTrendPoint {
  period: string
  count: number
  cumulative: number
}

export interface FranEvaluationCycleAnalytics {
  id: string
  cycleKey: string
  label: string
  evaluatedAt: string
  memberCount: number
  tierCounts: Record<FranMemberTier, number>
  upgradedCount: number
  downgradedCount: number
  retainedCount: number
  source: string
}

export interface FranAnalyticsDateRange {
  from: string
  to: string
}

export interface FranLoyaltyPointsTrendPoint {
  period: string
  issued: number
  redeemed: number
}

export interface FranLoyaltyPointsAnalytics {
  dateRange: FranAnalyticsDateRange
  pointValueMinor: number
  totalIssued: number
  totalRedeemed: number
  redemptionRate: number
  outstandingPoints: number
  liabilityMinor: number
  expiryWindowDays: number
  expiringPoints: number
  expiringMemberCount: number
  nextExpiryDate: string | null
  trend: FranLoyaltyPointsTrendPoint[]
}

export interface FranCustomerSpendRow {
  id: string
  name: string
  mobile: string | null
  tier: FranMemberTier | null
  pointsBalance: number
  lifetimeSpendMinor: number
  trailing12MonthSpendMinor: number
  lastTransactionAt: string | null
}

export interface FranCustomerLifecycleRow extends FranCustomerSpendRow {
  daysSinceLastTransaction: number | null
}

export interface FranBirthdayMemberRow {
  id: string
  name: string
  mobile: string | null
  tier: FranMemberTier | null
  pointsBalance: number
  birthday: string
}

export interface FranCampaignPerformanceRow {
  id: string
  name: string
  membersReached: number
  transactions: number
  pointsAwarded: number
  revenueMinor: number
  startDate: string | null
  endDate: string | null
}

export interface FranCustomerAnalytics {
  topLimit: number
  atRiskDays: number
  lapsedFromDays: number
  lapsedToDays: number
  topSpenders: {
    lifetime: FranCustomerSpendRow[]
    trailing12Month: FranCustomerSpendRow[]
  }
  atRiskCustomers: FranCustomerLifecycleRow[]
  lapsedCustomers: FranCustomerLifecycleRow[]
  birthdayMembers: FranBirthdayMemberRow[]
  campaignPerformance: FranCampaignPerformanceRow[]
}

export interface FranAnalyticsResponse {
  mode: 'demo' | 'supabase'
  warning?: string
  generatedAt: string
  snapshot: {
    asOf: string
    totalMembers: number
    unassignedCount: number
    tierCounts: FranTierCount[]
  }
  tierTrend: FranTierTrendPoint[]
  signupTrends: Record<FranSignupBucket, FranSignupTrendPoint[]>
  evaluationCycles: FranEvaluationCycleAnalytics[]
  loyaltyPoints: FranLoyaltyPointsAnalytics
  customerAnalytics: FranCustomerAnalytics
}
