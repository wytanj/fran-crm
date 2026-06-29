create extension if not exists "pgcrypto";

create type public.crm_member_role as enum ('owner', 'admin', 'member', 'agent');
create type public.crm_subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'open_source');
create type public.crm_entity_type as enum ('person', 'company', 'household', 'order', 'product', 'ticket', 'message', 'campaign', 'custom');
create type public.crm_field_origin as enum ('core', 'integration', 'custom', 'agent');
create type public.crm_proposal_status as enum ('draft', 'needs_approval', 'approved', 'rejected', 'executed');

create table public.crm_workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  plan text not null default 'open_source',
  hosting_mode text not null default 'self_hosted',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.crm_workspace_members (
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.crm_member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.crm_billing_customers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  email text not null,
  provider text not null default 'stripe',
  provider_customer_id text,
  created_at timestamptz not null default now(),
  unique (provider, provider_customer_id)
);

create table public.crm_subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  provider text not null default 'stripe',
  provider_subscription_id text,
  status public.crm_subscription_status not null default 'open_source',
  plan_key text not null default 'open_source',
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.crm_entity_types (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  key text not null,
  label text not null,
  base_type public.crm_entity_type not null default 'custom',
  description text,
  created_at timestamptz not null default now(),
  unique (workspace_id, key)
);

create table public.crm_field_definitions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  entity_type text not null,
  key text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  label text not null,
  value_type text not null check (value_type in ('text', 'number', 'date', 'boolean', 'email', 'phone', 'json', 'enum')),
  required boolean not null default false,
  origin public.crm_field_origin not null default 'custom',
  enum_values jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (workspace_id, entity_type, key)
);

create table public.crm_entities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  type public.crm_entity_type not null,
  custom_type text,
  label text not null,
  external_ids jsonb not null default '{}'::jsonb,
  attributes jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}',
  source text not null default 'manual',
  search_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.crm_refresh_entity_search_text()
returns trigger
language plpgsql
as $$
begin
  new.search_text := lower(
    coalesce(new.label, '') || ' ' ||
    coalesce(new.attributes::text, '') || ' ' ||
    coalesce(array_to_string(new.tags, ' '), '')
  );

  return new;
end;
$$;

revoke all on function public.crm_refresh_entity_search_text() from public;

create trigger crm_entities_refresh_search_text
  before insert or update of label, attributes, tags
  on public.crm_entities
  for each row
  execute function public.crm_refresh_entity_search_text();

create index crm_entities_workspace_type_idx on public.crm_entities(workspace_id, type);
create index crm_entities_external_ids_idx on public.crm_entities using gin(external_ids);
create index crm_entities_attributes_idx on public.crm_entities using gin(attributes);
create index crm_entities_tags_idx on public.crm_entities using gin(tags);
create index crm_entities_search_idx on public.crm_entities using gin(to_tsvector('simple', search_text));

create table public.crm_relationships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  from_entity_id uuid not null references public.crm_entities(id) on delete cascade,
  to_entity_id uuid not null references public.crm_entities(id) on delete cascade,
  type text not null,
  attributes jsonb not null default '{}'::jsonb,
  confidence numeric(4,3) not null default 1.0,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  unique (workspace_id, from_entity_id, to_entity_id, type)
);

create index crm_relationships_from_idx on public.crm_relationships(workspace_id, from_entity_id);
create index crm_relationships_to_idx on public.crm_relationships(workspace_id, to_entity_id);

create table public.crm_data_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  key text not null,
  label text not null,
  source_type text not null,
  status text not null default 'planned',
  created_at timestamptz not null default now(),
  unique (workspace_id, key)
);

create table public.crm_integration_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  data_source_id uuid references public.crm_data_sources(id) on delete set null,
  provider text not null,
  external_account_id text,
  status text not null default 'not_connected',
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.crm_import_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  data_source_id uuid references public.crm_data_sources(id) on delete set null,
  status text not null default 'staged',
  row_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.crm_agent_proposals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  title text not null,
  rationale text not null,
  proposed_action jsonb not null,
  status public.crm_proposal_status not null default 'draft',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.crm_approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  proposal_id uuid not null references public.crm_agent_proposals(id) on delete cascade,
  approved_by uuid references auth.users(id),
  decision text not null check (decision in ('approved', 'rejected')),
  note text,
  created_at timestamptz not null default now()
);

create table public.crm_execution_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  proposal_id uuid references public.crm_agent_proposals(id) on delete set null,
  action_type text not null,
  status text not null,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.crm_audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  actor_id uuid references auth.users(id),
  event_type text not null,
  subject_type text not null,
  subject_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.crm_is_workspace_member(target_workspace_id uuid)
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
  );
$$;

alter table public.crm_workspaces enable row level security;
alter table public.crm_workspace_members enable row level security;
alter table public.crm_billing_customers enable row level security;
alter table public.crm_subscriptions enable row level security;
alter table public.crm_entity_types enable row level security;
alter table public.crm_field_definitions enable row level security;
alter table public.crm_entities enable row level security;
alter table public.crm_relationships enable row level security;
alter table public.crm_data_sources enable row level security;
alter table public.crm_integration_accounts enable row level security;
alter table public.crm_import_batches enable row level security;
alter table public.crm_agent_proposals enable row level security;
alter table public.crm_approvals enable row level security;
alter table public.crm_execution_logs enable row level security;
alter table public.crm_audit_events enable row level security;

create policy "Members can read workspaces" on public.crm_workspaces
  for select using (public.crm_is_workspace_member(id));

create policy "Members can read workspace rows" on public.crm_workspace_members
  for select using (public.crm_is_workspace_member(workspace_id));

create policy "Members can read billing customers" on public.crm_billing_customers
  for select using (public.crm_is_workspace_member(workspace_id));

create policy "Members can read subscriptions" on public.crm_subscriptions
  for select using (public.crm_is_workspace_member(workspace_id));

create policy "Members can manage entity types" on public.crm_entity_types
  for all using (public.crm_is_workspace_member(workspace_id))
  with check (public.crm_is_workspace_member(workspace_id));

create policy "Members can manage field definitions" on public.crm_field_definitions
  for all using (public.crm_is_workspace_member(workspace_id))
  with check (public.crm_is_workspace_member(workspace_id));

create policy "Members can manage entities" on public.crm_entities
  for all using (public.crm_is_workspace_member(workspace_id))
  with check (public.crm_is_workspace_member(workspace_id));

create policy "Members can manage relationships" on public.crm_relationships
  for all using (public.crm_is_workspace_member(workspace_id))
  with check (public.crm_is_workspace_member(workspace_id));

create policy "Members can manage data sources" on public.crm_data_sources
  for all using (public.crm_is_workspace_member(workspace_id))
  with check (public.crm_is_workspace_member(workspace_id));

create policy "Members can manage integrations" on public.crm_integration_accounts
  for all using (public.crm_is_workspace_member(workspace_id))
  with check (public.crm_is_workspace_member(workspace_id));

create policy "Members can manage imports" on public.crm_import_batches
  for all using (public.crm_is_workspace_member(workspace_id))
  with check (public.crm_is_workspace_member(workspace_id));

create policy "Members can manage proposals" on public.crm_agent_proposals
  for all using (public.crm_is_workspace_member(workspace_id))
  with check (public.crm_is_workspace_member(workspace_id));

create policy "Members can manage approvals" on public.crm_approvals
  for all using (public.crm_is_workspace_member(workspace_id))
  with check (public.crm_is_workspace_member(workspace_id));

create policy "Members can read execution logs" on public.crm_execution_logs
  for select using (public.crm_is_workspace_member(workspace_id));

create policy "Members can read audit events" on public.crm_audit_events
  for select using (public.crm_is_workspace_member(workspace_id));
