create table public.crm_profile_packs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  label text not null,
  description text,
  vertical text,
  status text not null default 'active' check (status in ('active', 'archived')),
  install_mode text not null default 'manual' check (install_mode in ('manual', 'default', 'system')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, key)
);

alter table public.crm_field_definitions
  add column pack_key text,
  add column description text,
  add column help_text text,
  add column sensitivity_level text not null default 'internal',
  add column pos_visible boolean not null default false,
  add column cashier_editable boolean not null default false,
  add column marketing_usable boolean not null default false,
  add column ui_contexts text[] not null default '{}',
  add column sort_order integer not null default 0,
  add column metadata jsonb not null default '{}'::jsonb;

alter table public.crm_field_definitions
  drop constraint if exists crm_field_definitions_workspace_id_entity_type_key_key;

alter table public.crm_field_definitions
  drop constraint if exists crm_field_definitions_value_type_check;

alter table public.crm_field_definitions
  add constraint crm_field_definitions_value_type_check
  check (value_type in ('text', 'number', 'date', 'boolean', 'email', 'phone', 'json', 'enum', 'single_select', 'multi_select', 'tag_list'));

alter table public.crm_field_definitions
  add constraint crm_field_definitions_pack_key_check
  check (pack_key is null or pack_key ~ '^[a-z][a-z0-9_]*$');

alter table public.crm_field_definitions
  add constraint crm_field_definitions_sensitivity_level_check
  check (sensitivity_level in ('public', 'internal', 'confidential', 'restricted'));

create unique index crm_field_definitions_base_key_idx
  on public.crm_field_definitions(workspace_id, entity_type, key)
  where pack_key is null;

create unique index crm_field_definitions_pack_key_idx
  on public.crm_field_definitions(workspace_id, entity_type, pack_key, key)
  where pack_key is not null;

create index crm_field_definitions_pack_idx
  on public.crm_field_definitions(workspace_id, entity_type, pack_key, sort_order);

create index crm_profile_packs_workspace_idx
  on public.crm_profile_packs(workspace_id, status);

alter table public.crm_profile_packs enable row level security;

create policy "Members can read profile packs" on public.crm_profile_packs
  for select using (public.crm_is_workspace_member(workspace_id));

create policy "Members can manage profile packs" on public.crm_profile_packs
  for all using (public.crm_is_workspace_member(workspace_id))
  with check (public.crm_is_workspace_member(workspace_id));

grant select, insert, update, delete on table
  public.crm_profile_packs
to service_role;
