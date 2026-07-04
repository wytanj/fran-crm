create or replace function public.crm_has_workspace_role(target_workspace_id uuid, allowed_roles text[])
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
      and member.role::text = any(allowed_roles)
  );
$$;

revoke all on function public.crm_has_workspace_role(uuid, text[]) from public;
grant execute on function public.crm_has_workspace_role(uuid, text[]) to authenticated, service_role;

create table public.crm_agent_connector_installs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  provider text not null check (provider in ('claude', 'slack', 'teams', 'custom_mcp')),
  connector_name text not null,
  external_account_id text,
  remote_mcp_url text,
  default_profile text not null default 'manager' check (default_profile in ('owner', 'admin', 'manager', 'marketing', 'analyst', 'cashier', 'agent')),
  status text not null default 'draft' check (status in ('draft', 'configured', 'connected', 'disabled', 'revoked')),
  config jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider, connector_name)
);

create table public.crm_staff_identity_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  provider text not null check (provider in ('claude', 'slack', 'teams', 'email', 'custom')),
  external_account_id text not null,
  external_user_id text not null,
  email text,
  display_name text,
  status text not null default 'linked' check (status in ('pending', 'linked', 'disabled', 'revoked')),
  metadata jsonb not null default '{}'::jsonb,
  linked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (workspace_id, provider, external_account_id, external_user_id)
);

create table public.crm_agent_capability_grants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  principal_type text not null check (principal_type in ('role', 'profile', 'user', 'connector')),
  principal_key text not null,
  capability text not null check (capability ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  effect text not null default 'allow' check (effect in ('allow', 'deny')),
  source text not null default 'workspace_policy',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (workspace_id, principal_type, principal_key, capability)
);

create index crm_agent_connector_installs_workspace_idx
  on public.crm_agent_connector_installs(workspace_id, provider, status);

create index crm_staff_identity_links_user_idx
  on public.crm_staff_identity_links(workspace_id, user_id, provider);

create index crm_agent_capability_grants_principal_idx
  on public.crm_agent_capability_grants(workspace_id, principal_type, principal_key);

alter table public.crm_agent_connector_installs enable row level security;
alter table public.crm_staff_identity_links enable row level security;
alter table public.crm_agent_capability_grants enable row level security;

create policy "Members can read agent connector installs"
  on public.crm_agent_connector_installs
  for select using (public.crm_is_workspace_member(workspace_id));

create policy "Owners and admins can manage agent connector installs"
  on public.crm_agent_connector_installs
  for all using (public.crm_has_workspace_role(workspace_id, array['owner', 'admin']))
  with check (public.crm_has_workspace_role(workspace_id, array['owner', 'admin']));

create policy "Staff can read their own identity links"
  on public.crm_staff_identity_links
  for select using (
    public.crm_has_workspace_role(workspace_id, array['owner', 'admin'])
    or user_id = auth.uid()
  );

create policy "Owners and admins can manage staff identity links"
  on public.crm_staff_identity_links
  for all using (public.crm_has_workspace_role(workspace_id, array['owner', 'admin']))
  with check (public.crm_has_workspace_role(workspace_id, array['owner', 'admin']));

create policy "Owners and admins can read capability grants"
  on public.crm_agent_capability_grants
  for select using (public.crm_has_workspace_role(workspace_id, array['owner', 'admin']));

create policy "Owners and admins can manage capability grants"
  on public.crm_agent_capability_grants
  for all using (public.crm_has_workspace_role(workspace_id, array['owner', 'admin']))
  with check (public.crm_has_workspace_role(workspace_id, array['owner', 'admin']));

grant select, insert, update, delete on
  public.crm_agent_connector_installs,
  public.crm_staff_identity_links,
  public.crm_agent_capability_grants
to service_role;
