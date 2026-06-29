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
