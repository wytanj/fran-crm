import type { SupabaseClient, User } from '@supabase/supabase-js'
import { getWorkspaceMembership, type WorkspaceRole } from './supabase-auth'

export const agentCapabilities = [
  'analytics.aggregate.read',
  'analytics.customer_list.read',
  'customer.purchase.read',
  'customer.contact.read',
  'customer.export.request',
  'schema.propose',
  'schema.manage',
  'identity.merge.propose',
  'approval.request',
  'approval.decide',
  'integration.execute',
  'integration.manage',
  'returns.check',
  'returns.override.request',
  'billing.manage',
  'staff.manage',
  'agent.connector.manage',
  'agent.tool.execute',
  'audit.read'
] as const

export type AgentCapability = typeof agentCapabilities[number]

export const agentCapabilityProfiles = [
  'owner',
  'admin',
  'manager',
  'marketing',
  'analyst',
  'cashier',
  'agent'
] as const

export type AgentCapabilityProfile = typeof agentCapabilityProfiles[number]

type CapabilityGrantRow = {
  principal_type: string
  principal_key: string
  capability: string
  effect: 'allow' | 'deny'
}

const allCapabilities = [...agentCapabilities]

export const profileCapabilityMap: Record<AgentCapabilityProfile, AgentCapability[]> = {
  owner: allCapabilities,
  admin: allCapabilities.filter((capability) => capability !== 'billing.manage'),
  manager: [
    'analytics.aggregate.read',
    'analytics.customer_list.read',
    'customer.purchase.read',
    'approval.request',
    'returns.check',
    'returns.override.request',
    'agent.tool.execute',
    'audit.read'
  ],
  marketing: [
    'analytics.aggregate.read',
    'analytics.customer_list.read',
    'customer.purchase.read',
    'customer.export.request',
    'approval.request',
    'agent.tool.execute'
  ],
  analyst: [
    'analytics.aggregate.read',
    'analytics.customer_list.read',
    'agent.tool.execute'
  ],
  cashier: [
    'returns.check'
  ],
  agent: [
    'schema.propose',
    'identity.merge.propose',
    'approval.request',
    'agent.tool.execute'
  ]
}

const roleDefaultProfile: Record<WorkspaceRole, AgentCapabilityProfile> = {
  owner: 'owner',
  admin: 'admin',
  member: 'manager',
  agent: 'agent'
}

export function isAgentCapability(value: unknown): value is AgentCapability {
  return typeof value === 'string' && (agentCapabilities as readonly string[]).includes(value)
}

export function isAgentCapabilityProfile(value: unknown): value is AgentCapabilityProfile {
  return typeof value === 'string' && (agentCapabilityProfiles as readonly string[]).includes(value)
}

export function capabilitiesForProfile(profile: AgentCapabilityProfile) {
  return [...profileCapabilityMap[profile]]
}

export function defaultCapabilitiesForRole(role: WorkspaceRole) {
  return capabilitiesForProfile(roleDefaultProfile[role])
}

export function applyCapabilityGrants(
  baseCapabilities: Iterable<AgentCapability>,
  grants: CapabilityGrantRow[]
) {
  const resolved = new Set(baseCapabilities)

  for (const grant of grants) {
    if (!isAgentCapability(grant.capability)) {
      continue
    }

    if (grant.effect === 'deny') {
      resolved.delete(grant.capability)
    } else {
      resolved.add(grant.capability)
    }
  }

  return [...resolved].sort()
}

export async function resolveWorkspaceCapabilities(
  supabase: SupabaseClient,
  user: User,
  workspaceId: string
) {
  const membership = await getWorkspaceMembership(supabase, user, workspaceId)

  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'User is not a member of this CRM workspace.' })
  }

  const defaultCapabilities = defaultCapabilitiesForRole(membership.role)
  const grants = await loadCapabilityGrants(supabase, user, workspaceId, membership.role)
  const capabilities = applyCapabilityGrants(defaultCapabilities, grants)

  return {
    membership,
    profile: roleDefaultProfile[membership.role],
    capabilities
  }
}

export async function requireWorkspaceCapability(
  supabase: SupabaseClient,
  user: User,
  workspaceId: string,
  capability: AgentCapability
) {
  const resolved = await resolveWorkspaceCapabilities(supabase, user, workspaceId)

  if (!resolved.capabilities.includes(capability)) {
    throw createError({
      statusCode: 403,
      statusMessage: `User does not have the ${capability} capability in this workspace.`
    })
  }

  return resolved
}

async function loadCapabilityGrants(
  supabase: SupabaseClient,
  user: User,
  workspaceId: string,
  role: WorkspaceRole
): Promise<CapabilityGrantRow[]> {
  const sql = useCrmPostgres()

  if (sql) {
    return await sql<CapabilityGrantRow[]>`
      select principal_type, principal_key, capability, effect
      from public.crm_agent_capability_grants
      where workspace_id = ${workspaceId}::uuid
        and (
          (principal_type = 'role' and principal_key = ${role})
          or (principal_type = 'user' and principal_key = ${user.id})
        )
      order by
        case principal_type when 'role' then 1 when 'user' then 2 else 3 end,
        created_at asc
    `
  }

  const { data, error } = await supabase
    .from('crm_agent_capability_grants')
    .select('principal_type, principal_key, capability, effect')
    .eq('workspace_id', workspaceId)
    .or(`and(principal_type.eq.role,principal_key.eq.${role}),and(principal_type.eq.user,principal_key.eq.${user.id})`)
    .order('created_at', { ascending: true })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return (data || []) as CapabilityGrantRow[]
}
