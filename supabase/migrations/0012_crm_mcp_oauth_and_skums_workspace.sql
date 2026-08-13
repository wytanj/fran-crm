-- CRM workspace binds to an existing SKUMS business workspace.
-- MCP OAuth mints per-user tokens after the same Google / invite path as CRM web.

alter table public.crm_workspaces
  add column if not exists skums_workspace_id uuid;

create unique index if not exists crm_workspaces_skums_workspace_uidx
  on public.crm_workspaces (skums_workspace_id)
  where skums_workspace_id is not null;

comment on column public.crm_workspaces.skums_workspace_id is
  'Existing Fran SKUMS workspaces.id. One CRM tenant per SKUMS business workspace.';

-- ---------------------------------------------------------------------------
-- Authorization codes (single-use, ~60s)
-- ---------------------------------------------------------------------------
create table if not exists public.crm_mcp_oauth_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  redirect_uri text not null,
  code_challenge text not null,
  code_challenge_method text not null default 'S256',
  resource text,
  scope text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists crm_mcp_oauth_codes_expires_idx
  on public.crm_mcp_oauth_codes (expires_at);

-- ---------------------------------------------------------------------------
-- Access + refresh tokens
-- ---------------------------------------------------------------------------
create table if not exists public.crm_mcp_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  access_token_hash text not null unique,
  refresh_token_hash text unique,
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  resource text,
  scope text,
  expires_at timestamptz not null,
  refresh_expires_at timestamptz,
  rotated_from uuid references public.crm_mcp_oauth_tokens(id) on delete set null,
  revoked_at timestamptz,
  revoked_reason text,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists crm_mcp_oauth_tokens_user_idx
  on public.crm_mcp_oauth_tokens (workspace_id, user_id)
  where revoked_at is null;

create index if not exists crm_mcp_oauth_tokens_expires_idx
  on public.crm_mcp_oauth_tokens (expires_at)
  where revoked_at is null;

-- ---------------------------------------------------------------------------
-- Client registry (Claude-as-an-application)
-- ---------------------------------------------------------------------------
create table if not exists public.crm_mcp_oauth_clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  client_id text not null unique,
  client_secret_hash text,
  secret_prefix text,
  label text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text
);

create index if not exists crm_mcp_oauth_clients_live_idx
  on public.crm_mcp_oauth_clients (client_id)
  where revoked_at is null;

create index if not exists crm_mcp_oauth_clients_workspace_idx
  on public.crm_mcp_oauth_clients (workspace_id)
  where revoked_at is null;

alter table public.crm_mcp_oauth_codes enable row level security;
alter table public.crm_mcp_oauth_tokens enable row level security;
alter table public.crm_mcp_oauth_clients enable row level security;

grant select, insert, update, delete on public.crm_mcp_oauth_codes to service_role;
grant select, insert, update, delete on public.crm_mcp_oauth_tokens to service_role;
grant select, insert, update, delete on public.crm_mcp_oauth_clients to service_role;

comment on table public.crm_mcp_oauth_codes is
  'Single-use OAuth authorization codes for the Fran CRM MCP connector. Service role only.';
comment on table public.crm_mcp_oauth_tokens is
  'Per-user MCP access/refresh tokens. Scopes re-derived from crm_workspace_members on every request.';
comment on table public.crm_mcp_oauth_clients is
  'Claude-as-an-application client id + hashed secret. Per-user identity lives on crm_mcp_oauth_tokens.';
