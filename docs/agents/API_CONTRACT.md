# API Contract

This file is the agent-facing source of truth for current HTTP API routes. Update it whenever `server/api/**` changes.

## Routes

### `GET /api/agents/connectors/claude/setup`

Returns the Fran-owned setup metadata for the Claude Team custom connector.

Query:

- `workspaceId`: required UUID.

Auth:

- Supabase mode requires `Authorization: Bearer <access_token>`.
- The signed-in user must have `agent.connector.manage` for the workspace.

Response shape:

- `remoteMcpUrl`: the public MCP endpoint Claude should be configured to call.
- `capabilityProfiles`: Fran CRM staff profiles and their default capability grants.
- `install`: current `crm_agent_connector_installs` row when configured.
- `outsideRepoSteps`: setup tasks that must happen in Claude/admin infrastructure.

Rules:

- This route does not configure Claude directly. Claude Team Owners still add the remote MCP URL in Claude organization connector settings.
- The route exposes setup metadata only after Fran CRM workspace permission checks pass.

### `POST /api/agents/connectors/claude/setup`

Creates or updates the Fran CRM install record for the Claude connector.

Payload:

```json
{
  "workspaceId": "workspace uuid",
  "provider": "claude",
  "connectorName": "Fran CRM",
  "externalAccountId": "optional Claude org or team id",
  "defaultProfile": "manager",
  "status": "configured",
  "config": {}
}
```

Auth:

- Supabase mode requires `Authorization: Bearer <access_token>`.
- The signed-in user must have `agent.connector.manage`.

Rules:

- The route upserts `crm_agent_connector_installs` by `(workspace_id, provider, connector_name)`.
- The route writes an `agent.connector.configured` audit event.
- OAuth client registration, Claude Team approval, and production callback approval remain outside this repo.

### `GET /api/mcp`

Returns a lightweight health and discovery response for the remote MCP endpoint.

Response shape:

- `name`: `Fran CRM MCP`.
- `transport`: `streamable_http`.
- `protocolVersion`: currently `2025-03-26`.
- `tools`: available Fran CRM MCP tool names.

### `POST /api/mcp`

Handles JSON-RPC MCP requests for Claude and other MCP clients.

Supported methods:

- `initialize`: returns protocol version, server info, and tool capability support.
- `tools/list`: returns the available typed tools.
- `tools/call`: executes a named tool after Supabase auth and Fran CRM capability checks.

Tool:

- `fran.analytics.topCustomers`: returns date-ranged top customer purchase rows and chart-ready bar data.

Auth:

- `tools/list` and `initialize` are safe discovery methods.
- `tools/call` requires `Authorization: Bearer <access_token>`.
- The authenticated user must belong to the requested workspace and have every capability required by the tool.

Rules:

- MCP tool calls are never arbitrary SQL.
- Every `tools/call` request writes a `crm_mcp_request_logs` row with the requested method, tool name, sanitized arguments, actor when known, workspace when parseable, status, response summary, and sanitized error details. This starts before auth and capability checks so rejected and failed tool calls are represented.
- `fran.analytics.topCustomers` requires `agent.tool.execute`, `analytics.customer_list.read`, and `customer.purchase.read`.
- Contact fields are redacted unless `includeContact` is requested and the caller also has `customer.contact.read`.
- Successful tool calls write `crm_execution_logs` and `crm_audit_events`.

### `POST /api/fran/pos/member/resolve`

Mocked Fran POS member lookup. The root alias `POST /fran/pos/member/resolve` exposes the same contract for POS callers.

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

Rules:

- `workspaceId` is required and must be a UUID.
- `identifier.type` must be `phone`, `member_number`, `qr`, `barcode`, or `external_ref`.
- The mocked fixture resolves Ava Tan as `person_001` and member ref `FRAN-0001`.
- Status may be `exact`, `candidates`, `none`, or `ambiguous`.

### `POST /api/fran/pos/counter-session`

Mocked Fran POS counter-session projection. The root alias `POST /fran/pos/counter-session` exposes the same contract for POS callers.

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

Rules:

- Counter sessions return compact member identity, POS-visible profile fields, tier badge, points balance, reward availability, safe beauty warnings, and source freshness.
- Backend projection logic filters restricted fields such as `birthday`, `ytd_spend`, `reported_sensitivity_note`, and `advisor_notes`.
- Missing member context returns `status: none` and does not expose raw graph data.

### `GET /api/fran/analytics`

Returns Fran loyalty analytics for the requested workspace.

Query:

- `workspaceId`: required for Supabase-backed reads.
- `from`: optional ISO date (`YYYY-MM-DD`) for points-issued and points-redeemed period start. Defaults to 30 days before `to`.
- `to`: optional ISO date (`YYYY-MM-DD`) for points-issued and points-redeemed period end. Defaults to the current date.
- `pointValueMinor`: optional integer minor-currency value per point. Defaults to `1`, equivalent to `$0.01`.
- `expiryWindowDays`: optional integer from `1` to `365`. Defaults to `30`.
- `topLimit`: optional integer from `1` to `100` for top-spender lists. Defaults to `10`.
- `atRiskDays`: optional integer from `1` to `365`. Defaults to `60`.
- `lapsedFromDays`: optional integer from `1` to `730`. Defaults to `90`.
- `lapsedToDays`: optional integer from `1` to `1095`. Defaults to `180`.

Auth:

- Supabase mode requires `Authorization: Bearer <access_token>`.
- The user must be a member of the workspace.
- Server persistence uses `SUPABASE_DB_URL` when present, otherwise `SUPABASE_SERVICE_ROLE_KEY`.

Response shape:

- `mode`: `demo` or `supabase`.
- `snapshot.totalMembers`: current Fran member profile count.
- `snapshot.tierCounts`: current Bronze, Silver, and Gold counts with share.
- `signupTrends.day`, `signupTrends.week`, and `signupTrends.month`: new member sign-up counts by bucket with cumulative totals.
- `tierTrend`: Bronze, Silver, and Gold counts over evaluation cycles, with the current snapshot appended when it differs from the last cycle.
- `evaluationCycles`: cycle-level member count, tier counts, upgraded count, downgraded count, and retained count.
- `loyaltyPoints.dateRange`: points analytics window.
- `loyaltyPoints.totalIssued`: points earned or issued in the requested period.
- `loyaltyPoints.totalRedeemed`: points spent on discounts in the requested period.
- `loyaltyPoints.redemptionRate`: `totalRedeemed / totalIssued`; `0` when no points were issued.
- `loyaltyPoints.outstandingPoints`: total current unredeemed points across members.
- `loyaltyPoints.liabilityMinor`: `outstandingPoints * pointValueMinor`.
- `loyaltyPoints.expiringPoints`, `expiringMemberCount`, and `nextExpiryDate`: points and member count inside the expiry notification window.
- `loyaltyPoints.trend`: daily issued and redeemed point totals for the requested window when the window is 370 days or less; wider windows return sparse event days only.
- `customerAnalytics.topSpenders.lifetime`: top member rows by lifetime spend.
- `customerAnalytics.topSpenders.trailing12Month`: top member rows by trailing 12-month spend.
- `customerAnalytics.atRiskCustomers`: members with a known last transaction older than `atRiskDays` and newer than `lapsedFromDays`.
- `customerAnalytics.lapsedCustomers`: members with a known last transaction between `lapsedFromDays` and `lapsedToDays`.
- `customerAnalytics.birthdayMembers`: members whose `fran_member.birthday` falls in the current calendar month, including name, mobile, tier, and points balance.
- `customerAnalytics.campaignPerformance`: campaign-level members reached, transactions, points awarded, and revenue.

Rules:

- Current snapshot is derived from `crm_entities.attributes.profile_packs.fran_loyalty.tier`.
- Member sign-up date is `fran_member.member_since` when present, falling back to the person entity `created_at`.
- Historical tier movement comes from `fran_loyalty_tier_evaluation_cycles`; if the migration is not applied, the route still returns current snapshot and sign-up trends with a warning.
- Points issued and redeemed are aggregated from `crm_events` using loyalty event types or explicit payload keys such as `pointsIssued`, `pointsEarned`, `pointsRedeemed`, and `points`.
- Outstanding liability and expiry risk are derived from `fran_loyalty.points_balance`, `points_expiring_soon`, and `points_expiry_date`.
- Top-spender, lifecycle, birthday, and campaign exports are compact operator lists. They expose only the fields required by the dashboard and do not expose full graph rows.
- Transaction and campaign calculations use `crm_events` with CRM person references in `subject.customerKey`, `subject.personId`, `context.personId`, or `payload.personId`.

### `POST /api/v1/events`

Accepts source-system facts from POS, loyalty, ecommerce, partner channels, or future integration workers.

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

Rules:

- `eventId`, `sourceSystem`, and `idempotencyKey` are required.
- `occurredAt` must be an ISO datetime.
- Without Supabase server credentials or `workspaceId`, the route returns a demo accepted response.
- With Supabase server credentials, the route upserts into `crm_events` by `(workspace_id, source_system, idempotency_key)`.
- `pos.sale.completed`, `commerce.order.completed`, and `ecommerce.order.completed` events are projected into `crm_commerce_orders` and `crm_commerce_order_lines` when line data is present.
- `pos.return.completed`, `commerce.return.completed`, and `ecommerce.return.completed` events consume referenced return authorizations and update returned-quantity counters through idempotent return facts.

### `POST /api/v1/pos/returns/eligibility`

Checks whether a POS return, exchange, or store-credit request is allowed without exposing the full customer graph.

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

Response:

```json
{
  "mode": "supabase",
  "decisionId": "return check uuid",
  "authorizationId": "return authorization uuid or null",
  "decision": "eligible",
  "allowedActions": ["refund", "exchange", "store_credit"],
  "managerRequired": false,
  "expiresAt": "2026-06-24T09:30:00.000Z",
  "reasonCodes": ["within_window", "quantity_available"],
  "message": "Return is eligible.",
  "matchedPurchase": {
    "sourceSystem": "pos",
    "orderRef": "POS-000123",
    "orderDate": "2026-06-01T04:00:00.000Z",
    "orderLineRef": "line-1",
    "productName": "Product name",
    "sku": "SKU-123",
    "quantityPurchased": 1,
    "quantityAlreadyReturned": 0,
    "quantityReturnable": 1,
    "returnableUntil": "2026-07-01T04:00:00.000Z"
  },
  "policy": {
    "version": 4,
    "label": "Standard 30 day return policy"
  },
  "counterEvidence": [
    { "label": "Order date", "value": "2026-06-01" }
  ]
}
```

Rules:

- Supabase mode requires `Authorization: Bearer <access_token>` and workspace membership.
- Without Supabase server credentials or `workspaceId`, the route returns a demo decision.
- The route is POS-facing and counter-safe; it does not return unrelated purchases, graph relationships, segments, or confidential profile fields.
- Decisions are idempotent by a normalized request hash until `expiresAt`.
- Decisions may be `eligible`, `exchange_only`, `store_credit_only`, `manager_review`, `ineligible`, `not_found`, or `insufficient_context`.
- Eligible, exchange-only, and store-credit-only decisions issue a consumable authorization. Manager-review decisions do not issue an authorization until a future approved override path exists.

### `GET /api/v1/people/[person_id]`

Returns a customer/person read model with identity, attributes, consent summary, and profile context.

Fallback behavior:

- Without Supabase credentials or when `person_id` is not a UUID, the route returns the demo customer profile.

### `GET /api/v1/people/[person_id]/timeline`

Returns a customer timeline from `crm_customer_facts`.

Fallback behavior:

- Without Supabase credentials or when no persisted facts are available, the route returns a demo timeline.

### `GET /api/v1/people/[person_id]/computed-profile`

Returns computed customer profiles from `crm_customer_profiles`, including activity, value, affinity, intent, metric values, provenance, and sensitivity level.

Fallback behavior:

- Without Supabase credentials or when no computed profile exists, the route returns the demo computed profile.

### `GET /api/v1/people/[person_id]/counter-profile`

Returns a POS-safe projection of installed profile-pack fields for one person.

Query:

- `workspaceId`: required for Supabase-backed reads.

Rules:

- Supabase mode requires `Authorization: Bearer <access_token>`.
- The signed-in user must be a member of the workspace.
- The route verifies the person belongs to the supplied workspace.
- Only fields with `pos_visible = true` are returned.
- Reported risk signals may produce advisory `warnings`; the route does not block checkout.
- Without Supabase credentials, `workspaceId`, or a UUID person id, the route returns the demo counter profile.

### `PATCH /api/v1/people/[person_id]/profile-fields`

Updates pack-scoped profile fields for one person and writes provenance facts.

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

Rules:

- Supabase mode requires `Authorization: Bearer <access_token>`.
- The signed-in user must be `owner`, `admin`, or `member`.
- The route verifies the person belongs to the supplied workspace.
- The profile pack must be installed and active in that workspace.
- Field keys and values are validated against `crm_field_definitions`.
- Current state is written to `crm_entities.attributes.profile_packs`.
- Each changed field writes a `crm_customer_facts` row with `fact_type = customer_profile`.

### `GET /api/crm/bootstrap`

Loads the current CRM operating surface.

Query:

- `workspaceId`: optional UUID. Required for Supabase-backed workspace data.

Auth:

- Supabase mode with `workspaceId` requires `Authorization: Bearer <access_token>`.
- The user must be a member of the requested workspace.
- Server persistence uses `SUPABASE_DB_URL` when present, otherwise `SUPABASE_SERVICE_ROLE_KEY`.

Response shape:

- `mode`: `demo` or `supabase`.
- `graph.workspace`: current workspace summary when Supabase data is loaded.
- `graph.metrics`: dashboard metrics.
- `graph.entities`: graph entities.
- `graph.relationships`: typed edges between entities.
- `graph.customerFields`: base and custom field definitions.
- `graph.profilePacks`: installable and installed profile-pack definitions.
- `graph.integrationBacklog`: planned or connected integration surfaces.
- `graph.proposals`: agent proposal summaries.

Fallback behavior:

- If Supabase server credentials are missing, this route returns demo data.
- If Supabase is configured but no `workspaceId` is provided, this route returns demo data with `warning`.
- If Supabase returns a workspace, entity, relationship, field, source, or proposal error, this route returns demo data with `warning`.

### `GET /api/crm/workspaces`

Returns the signed-in user's available CRM workspaces and whether company setup is required.

Auth:

- Supabase mode requires `Authorization: Bearer <access_token>`.
- Server persistence uses `SUPABASE_DB_URL` when present, otherwise `SUPABASE_SERVICE_ROLE_KEY`.

Response shape:

- `mode`: `demo` or `supabase`.
- `requiresSetup`: `true` when the user has no workspace membership.
- `user`: signed-in Supabase user summary.
- `workspaces`: workspace summaries with `id`, `name`, `slug`, `role`, `plan`, and `hostingMode`.

Fallback behavior:

- Without Supabase server credentials, this route returns a demo workspace.

### `POST /api/crm/workspaces`

Creates the master company workspace for a hosted user.

Payload:

```json
{
  "companyName": "Acme Retail",
  "slug": "acme-retail",
  "plan": "hosted_growth"
}
```

Rules:

- Supabase mode requires `Authorization: Bearer <access_token>`.
- The creating user becomes `owner` in `crm_workspace_members`.
- Server persistence uses `SUPABASE_DB_URL` when present, otherwise `SUPABASE_SERVICE_ROLE_KEY`.
- The route seeds core person fields in `crm_field_definitions`.
- The route installs default Fran profile packs: `fran_member`, `fran_loyalty`, and `fran_beauty_profile`.
- The route seeds planned integration/source rows in `crm_data_sources`.
- The route creates trial subscription, billing-customer boundary, and audit-event records.
- Without Supabase server credentials, the route returns a demo workspace response.

### `GET /api/graph/search`

Searches graph entities by label, tags, and normalized attributes.

Query:

- `q`: optional string. Whitespace is trimmed.
- `workspaceId`: optional UUID. Required for Supabase-backed search.

Auth:

- Supabase mode with `workspaceId` requires `Authorization: Bearer <access_token>`.
- The user must be a member of the requested workspace.
- Server persistence uses `SUPABASE_DB_URL` when present, otherwise `SUPABASE_SERVICE_ROLE_KEY`.

Fallback behavior:

- Without Supabase server credentials or without `workspaceId`, search runs against demo graph data.
- Empty `q` returns the first demo entities.

### `GET /api/profile-packs`

Lists registered profile packs, including install state and field definitions for the requested workspace.

Query:

- `workspaceId`: optional in demo mode, required for Supabase-backed install state.

Rules:

- Supabase mode with `workspaceId` requires `Authorization: Bearer <access_token>`.
- The signed-in user must be a workspace member.
- Demo mode returns the built-in Fran registry with `fran_member`, `fran_loyalty`, and `fran_beauty_profile` installed for Ava Tan.

### `GET /api/profile-packs/[pack_key]`

Returns one dynamic profile-pack definition.

Rules:

- `pack_key` is dynamic; route logic must not branch only for one Fran pack.
- Supabase mode with `workspaceId` returns installed workspace field metadata when present.
- Without workspace data, registered packs are returned from the built-in registry.

### `POST /api/profile-packs/[pack_key]/install`

Installs a registered profile pack into a workspace.

Payload:

```json
{
  "workspaceId": "workspace uuid"
}
```

Rules:

- Supabase mode requires `Authorization: Bearer <access_token>`.
- The signed-in user must be `owner` or `admin`.
- The install is idempotent by `(workspace_id, key)` for packs and by packed field scope for field definitions.
- The route writes a `profile_pack.installed` audit event.
- Demo mode returns an accepted installed response without persistence.

### `POST /api/schema/fields`

Creates or stages a field definition for an entity type.

Payload:

```json
{
  "workspaceId": "optional uuid for Supabase writes",
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

Rules:

- `key` must match `^[a-z][a-z0-9_]*$`.
- `type` must be one of `text`, `number`, `date`, `boolean`, `email`, `phone`, `json`, `enum`, `single_select`, `multi_select`, or `tag_list`.
- `origin` defaults to `custom` and may be `agent` when an agent proposes the field.
- `packKey`, visibility, sensitivity, UI contexts, and enum values are optional metadata for profile-pack fields.
- Without Supabase server credentials or `workspaceId`, the route returns a demo field response.
- Supabase mode requires `Authorization: Bearer <access_token>`.
- The signed-in user must be `owner` or `admin` for the target workspace.
- Server persistence uses `SUPABASE_DB_URL` when present, otherwise `SUPABASE_SERVICE_ROLE_KEY`.

### `POST /api/billing/checkout`

Records the inherited internal billing boundary.

Payload:

```json
{
  "email": "founder@example.com",
  "plan": "hosted_growth"
}
```

Rules:

- `plan` must be `hosted_growth` or `hosted_scale`.
- In `demo` billing mode or incomplete Stripe configuration, the route returns a local boundary URL.
- When live billing config exists, the route returns a manual internal integration boundary instead of calling Stripe directly.

## Documentation Rule

Any added, removed, or behavior-changing API route must be reflected here in the same commit.

Public app reference: `/docs/api`.
