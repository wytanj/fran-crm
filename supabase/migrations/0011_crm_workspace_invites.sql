-- ============================================================
-- CRM workspace invites — join existing Fran CRM workspace via link
-- ============================================================

create table if not exists public.crm_workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  email text not null,
  role public.crm_member_role not null default 'member'
    check (role in ('admin', 'member', 'agent')),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'expired', 'revoked')),
  token text not null unique default encode(gen_random_bytes(32), 'hex'),
  invited_by uuid references auth.users(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists crm_workspace_invites_workspace_idx
  on public.crm_workspace_invites(workspace_id);
create index if not exists crm_workspace_invites_email_idx
  on public.crm_workspace_invites(lower(email));
create index if not exists crm_workspace_invites_token_idx
  on public.crm_workspace_invites(token);

create unique index if not exists crm_workspace_invites_pending_unique
  on public.crm_workspace_invites (workspace_id, lower(email))
  where status = 'pending';

create or replace function public.crm_is_workspace_admin(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.crm_workspace_members member
    where member.workspace_id = target_workspace_id
      and member.user_id = auth.uid()
      and member.role in ('owner', 'admin')
  );
$$;

alter table public.crm_workspace_invites enable row level security;

drop policy if exists "Admins can view crm invites" on public.crm_workspace_invites;
create policy "Admins can view crm invites"
  on public.crm_workspace_invites for select
  using (public.crm_is_workspace_admin(workspace_id));

drop policy if exists "Admins can create crm invites" on public.crm_workspace_invites;
create policy "Admins can create crm invites"
  on public.crm_workspace_invites for insert
  with check (public.crm_is_workspace_admin(workspace_id));

drop policy if exists "Admins can update crm invites" on public.crm_workspace_invites;
create policy "Admins can update crm invites"
  on public.crm_workspace_invites for update
  using (public.crm_is_workspace_admin(workspace_id));

drop policy if exists "Users can view own crm invites" on public.crm_workspace_invites;
create policy "Users can view own crm invites"
  on public.crm_workspace_invites for select
  using (
    status = 'pending'
    and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

grant select, insert, update on public.crm_workspace_invites to authenticated;
grant execute on function public.crm_is_workspace_admin(uuid) to authenticated;

create or replace function public.accept_crm_workspace_invite(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_invite record;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select email into v_email from auth.users where id = v_uid;
  if v_email is null then
    raise exception 'User email not found';
  end if;

  select * into v_invite
  from public.crm_workspace_invites
  where token = p_token
    and status = 'pending'
    and expires_at > now()
  for update;

  if not found then
    raise exception 'Invite not found, expired, or already used';
  end if;

  if lower(v_invite.email) <> lower(v_email) then
    raise exception 'This invite was sent to a different email address';
  end if;

  if exists (
    select 1 from public.crm_workspace_members
    where workspace_id = v_invite.workspace_id and user_id = v_uid
  ) then
    update public.crm_workspace_invites
    set status = 'accepted', accepted_by = v_uid, accepted_at = now()
    where id = v_invite.id;
    return json_build_object(
      'status', 'already_member',
      'workspace_id', v_invite.workspace_id
    );
  end if;

  insert into public.crm_workspace_members (workspace_id, user_id, role)
  values (v_invite.workspace_id, v_uid, v_invite.role);

  update public.crm_workspace_invites
  set status = 'accepted', accepted_by = v_uid, accepted_at = now()
  where id = v_invite.id;

  return json_build_object(
    'status', 'accepted',
    'workspace_id', v_invite.workspace_id,
    'role', v_invite.role
  );
end;
$$;

revoke all on function public.accept_crm_workspace_invite(text) from public;
grant execute on function public.accept_crm_workspace_invite(text) to authenticated;

create or replace function public.get_crm_workspace_invite_preview(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite record;
begin
  select i.*, w.name as workspace_name
  into v_invite
  from public.crm_workspace_invites i
  join public.crm_workspaces w on w.id = i.workspace_id
  where i.token = p_token;

  if not found then
    return json_build_object('status', 'not_found');
  end if;

  if v_invite.status <> 'pending' then
    return json_build_object('status', v_invite.status, 'workspace_name', v_invite.workspace_name);
  end if;

  if v_invite.expires_at <= now() then
    return json_build_object('status', 'expired', 'workspace_name', v_invite.workspace_name);
  end if;

  return json_build_object(
    'status', 'pending',
    'workspace_id', v_invite.workspace_id,
    'workspace_name', v_invite.workspace_name,
    'role', v_invite.role,
    'email', v_invite.email,
    'expires_at', v_invite.expires_at
  );
end;
$$;

revoke all on function public.get_crm_workspace_invite_preview(text) from public;
grant execute on function public.get_crm_workspace_invite_preview(text) to anon, authenticated;

create or replace function public.list_my_pending_crm_workspace_invites()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_rows json;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select email into v_email from auth.users where id = v_uid;

  select coalesce(json_agg(row_to_json(t) order by t.created_at desc), '[]'::json)
  into v_rows
  from (
    select
      i.id,
      i.token,
      i.role,
      i.email,
      i.expires_at,
      i.created_at,
      i.workspace_id,
      w.name as workspace_name
    from public.crm_workspace_invites i
    join public.crm_workspaces w on w.id = i.workspace_id
    where i.status = 'pending'
      and i.expires_at > now()
      and lower(i.email) = lower(v_email)
  ) t;

  return v_rows;
end;
$$;

revoke all on function public.list_my_pending_crm_workspace_invites() from public;
grant execute on function public.list_my_pending_crm_workspace_invites() to authenticated;

-- Allow owners/admins to insert members via accept path only is covered by RPC;
-- also allow admins to read member list already via crm_is_workspace_member.
