---
title: API Documentation
description: Stable HTTP routes for the web app, integrations, and future MCP-facing tools.
kicker: API
---

## Response Modes

The API can run in two modes:

- `demo`: returned when Supabase server credentials are missing or demo fallback data is used.
- `supabase`: returned when `SUPABASE_DB_URL` or server-only Supabase credentials are configured and database reads succeed.

Agents and integrations should always check `mode` before assuming writes persisted to a real workspace.

## GET /api/agents/connectors/claude/setup

Returns the setup metadata Fran CRM owns for a Claude Team custom connector. Supabase-backed calls require `workspaceId`, a bearer token, and `agent.connector.manage`.

The response includes the remote MCP URL, capability profiles, current install record when present, and the setup steps that must happen outside Fran CRM.

## POST /api/agents/connectors/claude/setup

Creates or updates the Claude connector install record for one workspace.

Payload:

```json
{
  "workspaceId": "workspace uuid",
  "provider": "claude",
  "connectorName": "Fran CRM",
  "defaultProfile": "manager",
  "status": "configured"
}
```

The route writes `crm_agent_connector_installs` and an `agent.connector.configured` audit event. Claude Team owner approval, OAuth client registration, and production callback approval remain outside this repo.

## GET /api/mcp

Returns a lightweight discovery response for Fran CRM's remote MCP endpoint, including protocol version and tool names.

## POST /api/mcp

Handles JSON-RPC MCP requests. Supported methods are `initialize`, `tools/list`, and `tools/call`.

The first implemented tool is `fran.analytics.topCustomers`, which answers date-ranged customer purchase ranking questions and returns compact rows plus chart-ready bar data. Tool calls require Supabase bearer auth, workspace membership, and every required capability. Contact fields are redacted unless the caller has `customer.contact.read`.

Every `tools/call` request writes `crm_mcp_request_logs` before auth and capability checks, then updates that row with final status, compact response summary, or sanitized error details. Successful tool executions also write `crm_execution_logs` and `crm_audit_events`.

## POST /api/fran/pos/member/resolve

Mocked Fran POS member lookup. The root alias `POST /fran/pos/member/resolve` exposes the same contract.

Payload:

```json
{
  "workspaceId": "11111111-1111-4111-8111-111111111111",
  "identifier": {
    "type": "phone",
    "value": "+65 8123 4470"
  },
  "sourceSystem": "fran-pos"
}
```

Identifier types are `phone`, `member_number`, `qr`, `barcode`, and `external_ref`.

Response status values are `exact`, `candidates`, `none`, and `ambiguous`.

## POST /api/fran/pos/counter-session

Mocked Fran POS counter projection. The root alias `POST /fran/pos/counter-session` exposes the same contract.

Payload:

```json
{
  "workspaceId": "11111111-1111-4111-8111-111111111111",
  "personId": "person_001",
  "sourceSystem": "fran-pos",
  "store": {
    "id": "ion-orchard",
    "registerId": "counter-01"
  },
  "cashier": {
    "id": "staff-001"
  }
}
```

The response includes member identity, POS-visible profile fields, tier badge, points balance, reward availability, safe beauty warnings, and source freshness. Restricted notes are filtered by backend projection logic.

## GET /api/fran/analytics

Returns workspace-scoped Fran loyalty analytics. Supabase-backed calls require `workspaceId`, a bearer access token, and workspace membership.

Query parameters:

- `workspaceId`: required for Supabase-backed reads.
- `from` and `to`: optional ISO dates for the points analytics period.
- `pointValueMinor`: minor-currency value per point, defaulting to `1`.
- `expiryWindowDays`: notification window for expiring points, defaulting to `30`.
- `topLimit`: number of top spenders to return, defaulting to `10`.
- `atRiskDays`, `lapsedFromDays`, and `lapsedToDays`: lifecycle thresholds, defaulting to `60`, `90`, and `180`.

Response fields:

- `snapshot`: current member count plus Bronze, Silver, and Gold counts.
- `signupTrends`: new member sign-ups grouped by day, week, and month.
- `tierTrend`: Bronze, Silver, and Gold counts over evaluation cycles plus the latest current snapshot when it differs.
- `evaluationCycles`: per-cycle member count, tier counts, upgraded count, downgraded count, and retained count.
- `loyaltyPoints`: period points issued, points redeemed, redemption rate, outstanding points liability, expiry risk, and issued-vs-redeemed trend.
- `customerAnalytics`: top spenders, at-risk members, lapsed members, birthday members for the current calendar month, and campaign performance.

Current snapshot is read from `crm_entities.attributes.profile_packs`. Sign-up date uses `fran_member.member_since` with entity creation date as fallback. Historical movement uses `fran_loyalty_tier_evaluation_cycles` after the analytics migration is applied. Points, spend, lifecycle, and campaign metrics are derived from `crm_events`, while current liability, birthdays, and tier fields come from Fran profile packs.

## POST /api/v1/events

Accepts idempotent source-system facts from POS, loyalty, ecommerce, partner channels, or future integration workers.

Payload:

```json
{
  "eventId": "pos_sale_123",
  "eventType": "pos.sale.completed",
  "workspaceId": "optional uuid for Supabase writes",
  "sourceSystem": "pos",
  "occurredAt": "2026-06-11T04:00:00.000Z",
  "idempotencyKey": "pos:store_001:txn_123",
  "actor": { "type": "system", "id": "pos" },
  "subject": {
    "customerKey": "crm:person_123",
    "externalCustomerRefs": [
      { "system": "pos", "id": "cust_123" }
    ]
  },
  "context": {
    "channel": "pos",
    "country": "SG",
    "currency": "SGD"
  },
  "payload": {},
  "schemaVersion": 1
}
```

When Supabase is configured, the route upserts into `crm_events` by workspace, source system, and idempotency key. Sale/order events with line data also project into commerce order memory. Return events with crmOS references consume return authorizations and update returned-quantity counters through idempotent return facts.

## POST /api/v1/pos/returns/eligibility

Checks whether POS may proceed with a refund, exchange, or store-credit flow. The response is intentionally counter-safe: it can include matched order facts and allowed actions, but it does not expose unrelated customer graph data, marketing segments, or confidential profile fields.

Payload:

```json
{
  "workspaceId": "workspace uuid",
  "sourceSystem": "pos",
  "store": {
    "id": "store_001",
    "registerId": "register_001"
  },
  "staff": {
    "id": "staff_123"
  },
  "customer": {
    "email": "customer@example.com"
  },
  "product": {
    "sku": "SKU-123",
    "barcode": "8888888888888",
    "productIdentityId": "optional product identity id",
    "name": "Product name"
  },
  "purchaseHint": {
    "orderDate": "2026-06-01",
    "receiptOrOrderNumber": "POS-000123"
  },
  "requested": {
    "quantity": 1,
    "action": "either"
  }
}
```

Response decisions:

| Decision | Meaning |
| --- | --- |
| `eligible` | Refund and exchange may proceed according to `allowedActions`. |
| `exchange_only` | Refund is blocked, but exchange is allowed. |
| `store_credit_only` | Store credit is allowed, but original tender refund is blocked. |
| `manager_review` | POS may proceed only after manager approval. |
| `ineligible` | Policy blocks the return or exchange. |
| `not_found` | No matching sale or policy fallback was available. |
| `insufficient_context` | More product, receipt, or order context is required. |

Supabase-backed calls require a bearer access token and workspace membership. Demo mode returns a deterministic sample decision when credentials or `workspaceId` are missing.

## GET /api/v1/people/[person_id]

Returns the customer/person read model for identity, external references, attributes, consent, and current profile context.

## GET /api/v1/people/[person_id]/timeline

Returns customer facts as a timeline. The persisted source is `crm_customer_facts`, with demo fallback data available for local use.

## GET /api/v1/people/[person_id]/computed-profile

Returns the computed customer profile, including activity, value, affinity, intent, metric values, provenance, and sensitivity level.

## GET /api/v1/people/[person_id]/counter-profile

Returns the POS-safe profile projection for one person. Supabase-backed reads require `workspaceId`, a bearer access token, and workspace membership. Only fields marked `pos_visible` are returned. Advisory warnings are informational and should not block checkout by default.

## PATCH /api/v1/people/[person_id]/profile-fields

Updates installed pack fields for one person.

Payload:

```json
{
  "workspaceId": "workspace uuid",
  "packKey": "fran_beauty_profile",
  "fields": {
    "skin_type": "Combination",
    "skin_concerns": ["Acne", "Pigmentation"],
    "reported_sensitivities": ["retinol", "fragrance"]
  },
  "sourceSystem": "crm_ui"
}
```

The route validates fields against the installed pack, updates `crm_entities.attributes.profile_packs`, and writes `crm_customer_facts` rows for provenance.

## GET /api/crm/bootstrap

Loads the CRM operating surface for the current workspace.

Supabase-backed calls pass `workspaceId` and `Authorization: Bearer <access_token>`. The user must be a member of that workspace. Without a workspace ID, the route stays in demo mode. Server persistence uses `SUPABASE_DB_URL` when present, otherwise `SUPABASE_SERVICE_ROLE_KEY`.

Returns:

- workspace summary
- metrics
- entity records
- relationship records
- entity type and field definitions
- profile pack definitions
- integration backlog
- pending agent proposals

Use this route to hydrate dashboards, agent context windows, and setup screens.

## GET /api/crm/workspaces

Returns the signed-in user's CRM workspaces and whether setup is required.

Response fields:

- `mode`
- `requiresSetup`
- `user`
- `workspaces`

In Supabase mode this route requires a bearer access token. In demo mode it returns a demo workspace. Server persistence uses `SUPABASE_DB_URL` when present, otherwise `SUPABASE_SERVICE_ROLE_KEY`.

## POST /api/crm/workspaces

Creates the hosted user's master company workspace.

Payload:

```json
{
  "companyName": "Acme Retail",
  "slug": "acme-retail",
  "plan": "hosted_growth"
}
```

The route creates the workspace, owner membership, initial field definitions, planned data sources, trial subscription boundary, billing-customer boundary, and audit event. It is the first step after hosted sign-in.

Fran CRM also installs the default `fran_member`, `fran_loyalty`, and `fran_beauty_profile` packs during workspace setup.

## GET /api/graph/search

Searches graph entities by label, tags, normalized attributes, and type context.

Query parameters:

| Parameter | Type | Notes |
| --- | --- | --- |
| `q` | string | Optional search text. Whitespace is trimmed before execution. |
| `workspaceId` | uuid | Required for Supabase-backed workspace search. |

Typical use:

```http
GET /api/graph/search?q=shopify
```

## GET /api/profile-packs

Lists registered profile packs with workspace install state. Demo mode returns the built-in registry.

## GET /api/profile-packs/[pack_key]

Returns one dynamic pack definition. Fran defaults are `fran_member`, `fran_loyalty`, and `fran_beauty_profile`; route logic remains pack-key driven.

## POST /api/profile-packs/[pack_key]/install

Installs a registered pack into a workspace. Supabase-backed installs require a bearer token and `owner` or `admin` role. The operation is idempotent and writes an audit event.

## POST /api/schema/fields

Creates or stages field definitions for entity types. Agent-origin schema changes should be treated as proposals unless the agent has explicit grants.

Payload:

```json
{
  "workspaceId": "workspace uuid",
  "entityType": "person",
  "key": "preferred_channel",
  "label": "Preferred channel",
  "type": "text",
  "required": false,
  "origin": "agent",
  "packKey": "optional_pack_key",
  "sensitivityLevel": "internal",
  "posVisible": false,
  "cashierEditable": false,
  "marketingUsable": false,
  "enumValues": []
}
```

Allowed field types:

- `text`
- `number`
- `boolean`
- `email`
- `phone`
- `date`
- `json`
- `enum`
- `single_select`
- `multi_select`
- `tag_list`

Supabase-backed writes require a bearer access token and an `owner` or `admin` workspace role. Server persistence uses `SUPABASE_DB_URL` when present, otherwise `SUPABASE_SERVICE_ROLE_KEY`.

## POST /api/billing/checkout

Records the inherited internal billing boundary. Billing remains explicit and is not a user-acquisition flow.

Payload:

```json
{
  "plan": "hosted_growth",
  "email": "operator@example.com"
}
```

Accepted plans:

- `hosted_growth`
- `hosted_scale`

Demo mode returns a local boundary URL so the UI can acknowledge billing state without live Stripe credentials.
