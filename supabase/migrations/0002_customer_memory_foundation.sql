create table public.crm_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  event_id text not null,
  event_type text not null,
  source_system text not null,
  occurred_at timestamptz not null,
  idempotency_key text not null,
  actor jsonb not null default '{}'::jsonb,
  subject jsonb not null default '{}'::jsonb,
  context jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  schema_version integer not null default 1,
  created_at timestamptz not null default now(),
  unique (workspace_id, source_system, event_id),
  unique (workspace_id, source_system, idempotency_key)
);

create index crm_events_workspace_type_idx on public.crm_events(workspace_id, event_type, occurred_at desc);
create index crm_events_subject_idx on public.crm_events using gin(subject);
create index crm_events_context_idx on public.crm_events using gin(context);

create table public.crm_external_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  entity_id uuid not null references public.crm_entities(id) on delete cascade,
  system text not null,
  external_id text not null,
  external_ref jsonb not null default '{}'::jsonb,
  linked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (workspace_id, system, external_id)
);

create index crm_external_links_entity_idx on public.crm_external_links(workspace_id, entity_id);

create table public.crm_customer_facts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  person_entity_id uuid not null references public.crm_entities(id) on delete cascade,
  event_id uuid references public.crm_events(id) on delete set null,
  fact_type text not null,
  fact_key text not null,
  value jsonb not null default '{}'::jsonb,
  source_system text not null,
  occurred_at timestamptz not null,
  sensitivity_level text not null default 'internal' check (sensitivity_level in ('public', 'internal', 'confidential', 'restricted')),
  created_at timestamptz not null default now()
);

create index crm_customer_facts_person_idx on public.crm_customer_facts(workspace_id, person_entity_id, occurred_at desc);
create index crm_customer_facts_key_idx on public.crm_customer_facts(workspace_id, fact_type, fact_key);

create table public.crm_consent_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  person_entity_id uuid not null references public.crm_entities(id) on delete cascade,
  channel text not null,
  consent_type text not null,
  status text not null check (status in ('granted', 'revoked', 'pending', 'unknown')),
  source_system text not null,
  occurred_at timestamptz not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index crm_consent_records_person_idx on public.crm_consent_records(workspace_id, person_entity_id, occurred_at desc);

create table public.crm_customer_profiles (
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  person_entity_id uuid not null references public.crm_entities(id) on delete cascade,
  display_name text,
  email text,
  phone text,
  consent_summary jsonb not null default '{}'::jsonb,
  activity_profile jsonb not null default '{}'::jsonb,
  value_profile jsonb not null default '{}'::jsonb,
  affinity_profile jsonb not null default '{}'::jsonb,
  intent_profile jsonb not null default '{}'::jsonb,
  metric_values jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  input_watermark timestamptz,
  provenance jsonb not null default '{}'::jsonb,
  sensitivity_level text not null default 'internal' check (sensitivity_level in ('public', 'internal', 'confidential', 'restricted')),
  primary key (workspace_id, person_entity_id)
);

create table public.crm_segment_memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  segment_key text not null,
  person_entity_id uuid not null references public.crm_entities(id) on delete cascade,
  score numeric(5,4),
  reason jsonb not null default '{}'::jsonb,
  source text not null default 'system',
  computed_at timestamptz not null default now(),
  unique (workspace_id, segment_key, person_entity_id)
);

create index crm_segment_memberships_segment_idx on public.crm_segment_memberships(workspace_id, segment_key);

create table public.crm_metric_definitions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  display_name text not null,
  entity_type text not null default 'customer',
  value_type text not null check (value_type in ('number', 'integer', 'money_minor', 'date', 'text', 'boolean', 'json', 'score')),
  source_dependencies text[] not null default '{}',
  calculation_kind text not null check (calculation_kind in ('source', 'rollup', 'derived', 'model', 'manual')),
  calculation_config jsonb not null default '{}'::jsonb,
  freshness_sla interval,
  sensitivity_level text not null default 'internal' check (sensitivity_level in ('public', 'internal', 'confidential', 'restricted')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, key)
);

alter table public.crm_events enable row level security;
alter table public.crm_external_links enable row level security;
alter table public.crm_customer_facts enable row level security;
alter table public.crm_consent_records enable row level security;
alter table public.crm_customer_profiles enable row level security;
alter table public.crm_segment_memberships enable row level security;
alter table public.crm_metric_definitions enable row level security;

create policy "Members can manage events" on public.crm_events
  for all using (public.crm_is_workspace_member(workspace_id))
  with check (public.crm_is_workspace_member(workspace_id));

create policy "Members can manage external links" on public.crm_external_links
  for all using (public.crm_is_workspace_member(workspace_id))
  with check (public.crm_is_workspace_member(workspace_id));

create policy "Members can manage customer facts" on public.crm_customer_facts
  for all using (public.crm_is_workspace_member(workspace_id))
  with check (public.crm_is_workspace_member(workspace_id));

create policy "Members can manage consent records" on public.crm_consent_records
  for all using (public.crm_is_workspace_member(workspace_id))
  with check (public.crm_is_workspace_member(workspace_id));

create policy "Members can manage customer profiles" on public.crm_customer_profiles
  for all using (public.crm_is_workspace_member(workspace_id))
  with check (public.crm_is_workspace_member(workspace_id));

create policy "Members can manage segment memberships" on public.crm_segment_memberships
  for all using (public.crm_is_workspace_member(workspace_id))
  with check (public.crm_is_workspace_member(workspace_id));

create policy "Members can manage metric definitions" on public.crm_metric_definitions
  for all using (public.crm_is_workspace_member(workspace_id))
  with check (public.crm_is_workspace_member(workspace_id));
