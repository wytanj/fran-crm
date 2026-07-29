import type { CrmWorkspaceRole } from '~/types/crm'

export type CrmInviteRole = Extract<CrmWorkspaceRole, 'admin' | 'member' | 'agent'>

export interface CrmWorkspaceInvite {
  id: string
  workspace_id: string
  email: string
  role: CrmInviteRole
  status: string
  token: string
  expires_at: string
  created_at: string
}

export interface CrmInvitePreview {
  status: string
  workspace_id?: string
  workspace_name?: string
  role?: string
  email?: string
  expires_at?: string
}

export interface PendingCrmInvite {
  id: string
  token: string
  role: string
  email: string
  expires_at: string
  created_at: string
  workspace_id: string
  workspace_name: string
}

export function useCrmWorkspaceInvites() {
  const { getClient, refreshSession, session, user } = useCrmAuth()
  const { primaryWorkspace } = useCrmWorkspaceAccess()

  async function ensureSession() {
    if (!session.value) await refreshSession()
    if (!session.value?.access_token) throw new Error('Sign in required')
  }

  function db() {
    const client = getClient()
    if (!client) throw new Error('Supabase not configured')
    return client
  }

  async function listInvites(): Promise<CrmWorkspaceInvite[]> {
    await ensureSession()
    const ws = primaryWorkspace.value
    if (!ws?.id) return []
    const { data, error } = await db()
      .from('crm_workspace_invites')
      .select('id, workspace_id, email, role, status, token, expires_at, created_at')
      .eq('workspace_id', ws.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data || []) as CrmWorkspaceInvite[]
  }

  async function listMembers(): Promise<Array<{ user_id: string; role: string; created_at: string }>> {
    await ensureSession()
    const ws = primaryWorkspace.value
    if (!ws?.id) return []
    const { data, error } = await db()
      .from('crm_workspace_members')
      .select('user_id, role, created_at')
      .eq('workspace_id', ws.id)
      .order('created_at')
    if (error) throw error
    return data || []
  }

  async function createInvite(email: string, role: CrmInviteRole): Promise<CrmWorkspaceInvite> {
    await ensureSession()
    const ws = primaryWorkspace.value
    if (!ws?.id) throw new Error('No workspace')
    const { data, error } = await db()
      .from('crm_workspace_invites')
      .insert({
        workspace_id: ws.id,
        email: email.trim().toLowerCase(),
        role,
        invited_by: user.value?.id || null,
      })
      .select('id, workspace_id, email, role, status, token, expires_at, created_at')
      .single()
    if (error) {
      if (error.code === '23505') throw new Error('A pending invite already exists for this email')
      throw error
    }
    return data as CrmWorkspaceInvite
  }

  async function revokeInvite(id: string) {
    await ensureSession()
    const { error } = await db().from('crm_workspace_invites').update({ status: 'revoked' }).eq('id', id)
    if (error) throw error
  }

  async function previewInvite(token: string): Promise<CrmInvitePreview> {
    const client = getClient()
    if (!client) throw new Error('Supabase not configured')
    const { data, error } = await client.rpc('get_crm_workspace_invite_preview', { p_token: token })
    if (error) throw error
    return (data || { status: 'not_found' }) as CrmInvitePreview
  }

  async function acceptInvite(token: string): Promise<{ status: string; workspace_id: string }> {
    await ensureSession()
    const { data, error } = await db().rpc('accept_crm_workspace_invite', { p_token: token })
    if (error) throw error
    return data as { status: string; workspace_id: string }
  }

  async function listMyPending(): Promise<PendingCrmInvite[]> {
    await ensureSession()
    const { data, error } = await db().rpc('list_my_pending_crm_workspace_invites')
    if (error) throw error
    return (Array.isArray(data) ? data : []) as PendingCrmInvite[]
  }

  function inviteUrl(token: string) {
    if (import.meta.client) return `${window.location.origin}/invite/${token}`
    return `/invite/${token}`
  }

  return {
    listInvites,
    listMembers,
    createInvite,
    revokeInvite,
    previewInvite,
    acceptInvite,
    listMyPending,
    inviteUrl,
  }
}
