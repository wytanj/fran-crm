# Fran CRM

Fran CRM is an opinionated crmOS build for Fran POS. It keeps the upstream workspace, graph, profile-pack, event, approval, and audit primitives, then installs Fran defaults for member identity, loyalty status, beauty profile context, and POS-safe counter projections.

## Role

Fran CRM owns:

- member identity resolution
- Fran profile packs
- POS-safe counter profile projection
- loyalty policy and tier progress
- loyalty analytics for tier mix, sign-ups, evaluation-cycle movement, point flow, liability, expiry risk, top spenders, lifecycle inactivity, birthdays, and campaign performance
- reward quote, commit, and reversal decisions
- customer facts, provenance, audit events, and agent proposals

Fran CRM does not own basket mutation, payment execution, tender movement, receipt rendering, stock movement, fulfillment, or POS checkout UI.

## Current Buildout Slice

- Upstream crmOS source has been copied into this repo and verified.
- Product labels now point to Fran CRM rather than the upstream crmOS demo shell.
- The home surface is an internal operations overview, not a marketing landing page.
- New workspaces install `fran_member`, `fran_loyalty`, and `fran_beauty_profile` packs by default.
- Mocked POS-facing routes exist for member resolve and counter session.
- Analytics reads expose aggregate Bronze, Silver, Gold, sign-up, evaluation-cycle movement, points-issued, points-redeemed, liability, expiry-risk, top-spender, inactivity, birthday, and campaign-performance series and compact export rows.
- Claude/MCP connector groundwork includes workspace-scoped connector install records, staff identity links, capability grants, MCP request logs, an `/api/mcp` JSON-RPC tool endpoint, and the first governed tool: `fran.analytics.topCustomers`.
- Fran contract docs live in `docs/fran-crm-contract.md` and `docs/fran-loyalty-policy.md`.

## Routes

Initial Fran POS routes:

- `POST /fran/pos/member/resolve`
- `POST /fran/pos/counter-session`
- `POST /api/fran/pos/member/resolve`
- `POST /api/fran/pos/counter-session`
- `GET /api/fran/analytics`
- `GET /api/agents/connectors/claude/setup`
- `POST /api/agents/connectors/claude/setup`
- `GET /api/mcp`
- `POST /api/mcp`
- `POST /api/v1/events`

The root `/fran/pos/*` routes match the Fran POS contract. The `/api/fran/pos/*` aliases are kept for Nuxt API route conventions and documentation coverage.

## Quick Start

```bash
npm install
npm run dev
```

Apply SQL files in `supabase/migrations` to the target Supabase project, then set local environment values in `.env`:

```bash
NUXT_PUBLIC_SITE_URL=http://localhost:3000
NUXT_PUBLIC_SUPABASE_URL=...
NUXT_PUBLIC_SUPABASE_KEY=...
SUPABASE_DB_URL=...
# Optional server-side Data API fallback.
SUPABASE_SERVICE_ROLE_KEY=...
```

Use the Supabase pooler form for `SUPABASE_DB_URL` in hosted environments that do not have IPv6 access to the direct database host:

```bash
SUPABASE_DB_URL=postgresql://postgres.<project-ref>:<password>@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require
```

The browser-facing Supabase key is for Auth. CRM reads and writes should flow through workspace-aware Nuxt API routes backed by `SUPABASE_DB_URL` or a server-only Supabase key.

For Google sign-up, enable the Google provider in Supabase Auth and allow each app callback URL that staff use, for example `http://localhost:3000/confirm`, `http://127.0.0.1:3000/confirm`, and the production `${NUXT_PUBLIC_SITE_URL}/confirm`. PKCE sign-in stores a verifier in the browser origin that starts the flow, so the app redirects back to the active browser origin before `/confirm?next=/setup` creates the master company workspace through `POST /api/crm/workspaces`.

## Verification

```bash
npm test
npm run typecheck
npm run build
```

Agent-facing contracts live in `AGENTS.md` and `docs/agents/`. When API routes, database schema, or agent workflows change, update those docs in the same change.
