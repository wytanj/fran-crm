import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
function read(path: string) {
  return readFileSync(join(root, path), 'utf8')
}

describe('CRM workspace invites', () => {
  it('migration defines invites table and accept RPC', () => {
    const mig = read('supabase/migrations/0011_crm_workspace_invites.sql')
    expect(mig).toContain('crm_workspace_invites')
    expect(mig).toContain('accept_crm_workspace_invite')
    expect(mig).toContain('get_crm_workspace_invite_preview')
    expect(mig).toContain('list_my_pending_crm_workspace_invites')
    expect(mig).toContain('crm_is_workspace_admin')
    expect(mig).toContain('insert into public.crm_workspace_members')
  })

  it('settings and setup expose team invite UX', () => {
    const settings = read('app/pages/settings.vue')
    const setup = read('app/pages/setup.vue')
    const invite = read('app/pages/invite/[token].vue')
    const composable = read('app/composables/useCrmWorkspaceInvites.ts')

    expect(settings).toContain('Members & invites')
    expect(settings).toContain('Invite + copy link')
    expect(setup).toContain('listMyPending')
    expect(setup).toContain('Join your team')
    expect(setup).toContain('canCreateWorkspace')
    expect(setup).toContain('Ask an owner to invite you')
    expect(invite).toContain('acceptInvite')
    expect(composable).toContain('accept_crm_workspace_invite')
  })
})
