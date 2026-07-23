# Data Model

Fran CRM models member, customer, loyalty, reward, and counter-session operations as a workspace-scoped graph.

## Workspace

Every organization maps to `crm_workspaces`. All operational records carry `workspace_id`; agents must not cross workspace boundaries.

Related tables:

- `crm_workspace_members`: workspace user and agent membership.
- `crm_billing_customers`: inherited internal billing boundary records.
- `crm_subscriptions`: workspace subscription or operating mode state.

Workspace setup creates `crm_workspaces` first, then inserts the creator as `owner` in `crm_workspace_members`. Later CRM users, agents, and integration actors should be added under this workspace boundary rather than as global tenants.

The browser should not rely on direct table access for CRM data yet. Current UI reads and writes through Nuxt API routes using `SUPABASE_DB_URL` or a server-only Supabase key; `0003_data_api_service_role_grants.sql` explicitly grants the service role Data API access for the CRM tables created in earlier migrations.

## Staff Identity, Capabilities, And Agent Connectors

Fran CRM now separates chat/agent connector access from CRM data permission. A Claude Team, Slack workspace, or Teams tenant can install a connector, but every tool call still resolves to one workspace, one human CRM user, and one capability set before it can read customer data.

Tables:

- `crm_agent_connector_installs`: workspace-scoped connector install records for `claude`, `slack`, `teams`, or `custom_mcp`. Stores connector name, remote MCP URL, external account reference, default staff profile, status, and non-secret config metadata.
- `crm_staff_identity_links`: maps external staff identities, such as Claude, Slack, Teams, or email identities, to Fran CRM users inside a workspace.
- `crm_agent_capability_grants`: grants or denies capabilities to roles, profiles, users, or connector principals.
- `crm_mcp_request_logs`: records each MCP `tools/call` request before execution, including method, tool, sanitized arguments, actor when known, relational workspace when safely attachable, status, response summary, and sanitized error details.

Default staff profiles:

- `owner`: all capabilities.
- `admin`: broad workspace administration without owner-only billing by default.
- `manager`: customer-level purchase analytics, return checks, manager-review requests, and audited agent tool execution.
- `marketing`: campaign/customer analytics and export requests, with exports still governed.
- `analyst`: aggregate analytics and masked customer lists.
- `cashier`: counter-safe return checks only.
- `agent`: proposal and approved-tool execution surface, but no independent customer data access.

Current capability keys include:

- `analytics.aggregate.read`
- `analytics.customer_list.read`
- `customer.purchase.read`
- `customer.contact.read`
- `customer.export.request`
- `schema.propose`
- `schema.manage`
- `identity.merge.propose`
- `approval.request`
- `approval.decide`
- `integration.execute`
- `integration.manage`
- `returns.check`
- `returns.override.request`
- `billing.manage`
- `staff.manage`
- `agent.connector.manage`
- `agent.tool.execute`
- `audit.read`

The first Claude/MCP-facing tool uses this model: `fran.analytics.topCustomers` requires `agent.tool.execute`, `analytics.customer_list.read`, and `customer.purchase.read`. It only includes contact fields when the caller also has `customer.contact.read`.

`crm_mcp_request_logs` is the request ledger for future staff questions. Successful tools still write `crm_execution_logs` and `crm_audit_events`, but the request log also captures rejected or failed requests that never reach execution.

## Entity Spine

`crm_entities` stores the nodes of the graph:

- `person`
- `company`
- `household`
- `order`
- `product`
- `ticket`
- `message`
- `campaign`
- `custom`

Core properties:

- `label`: human-readable display name.
- `external_ids`: channel IDs, such as Shopify, POS, support, accounting, or imported IDs.
- `attributes`: flexible JSON for field values.
- `tags`: searchable tags and segmentation handles.
- `source`: origin of the entity or latest write.

## Relationship Graph

`crm_relationships` stores typed edges between entities.

Examples:

- `placed_order`
- `opened_ticket`
- `works_at`
- `belongs_to_household`
- `belongs_to_segment`

Relationship records include confidence and source so agents can distinguish imported facts from inferred links.

## Base Customer Fields

The current minimal commerce customer profile includes:

- `email`
- `phone`
- `first_name`
- `last_name`
- `accepts_marketing`
- `tags`
- `note`
- `default_address`
- `orders_count`
- `total_spent`
- `currency`
- `last_order_at`
- `source_channel`
- `company_name`
- `lifecycle_stage`

These are represented in the app contract as `customerFields` and in persistent workspaces through `crm_field_definitions`.

## Schema Extensions

Agents may propose new fields or custom entity types, but should not silently mutate schema-sensitive records.

Schema field properties:

- `entity_type`
- `key`
- `label`
- `value_type`
- `required`
- `origin`
- `enum_values`
- `pack_key`
- `description`
- `help_text`
- `sensitivity_level`
- `pos_visible`
- `cashier_editable`
- `marketing_usable`
- `ui_contexts`
- `sort_order`
- `metadata`

Allowed `origin` values are `core`, `integration`, `custom`, and `agent`.

Use `crm_agent_proposals` for schema suggestions that require review before execution.

## Profile Packs

Profile packs let a workspace install domain-specific customer fields without changing the CRM core tables or forking the UI.

The pack layer remains workspace-scoped even though Fran installs opinionated defaults:

- A pack is not owned by POS, Shopify, loyalty, beauty, or any other source system.
- Each pack is workspace-scoped through `crm_profile_packs`.
- Each packed field is represented through `crm_field_definitions.pack_key`.
- Current editable values live in `crm_entities.attributes.profile_packs`.
- Provenance and timeline records live in `crm_customer_facts`.

`crm_profile_packs` stores:

- `workspace_id`
- `key`
- `label`
- `description`
- `vertical`
- `status`
- `install_mode`
- `metadata`

Packed field uniqueness is scoped by `(workspace_id, entity_type, pack_key, key)`. Base fields without a `pack_key` keep their own uniqueness boundary. This allows different packs to reuse ordinary field keys like `notes`, `goals`, or `preferences` without colliding.

Fran default packs:

- `fran_member`: member number, mobile, member since, birthday, preferred store, and consent status.
- `fran_loyalty`: tier, points balance, points expiring soon, expiry date, YTD spend, next tier, and spend to next tier.
- `fran_beauty_profile`: skin type, skin concerns, reported sensitivities, restricted sensitivity note, preferred routine, and restricted advisor notes.

Sensitivity and projection flags are part of the data contract, not only UI labels:

- `pos_visible`: safe for counter-profile projections.
- `cashier_editable`: editable from operational counter workflows.
- `marketing_usable`: retained upstream field name for segment or campaign eligibility.
- `sensitivity_level`: `public`, `internal`, `confidential`, or `restricted`.

POS and other clients should consume context-specific projections such as `/api/v1/people/[person_id]/counter-profile` instead of reading raw field definitions directly.

## Fran Loyalty Analytics

`fran_loyalty_tier_evaluation_cycles` stores workspace-scoped aggregate history for tier evaluation runs.

Core properties:

- `cycle_key`: stable workspace-local cycle identifier, such as `2026-06`.
- `label`: human-readable cycle label.
- `evaluated_at`: when the cycle was completed or recorded.
- `member_count`: total members evaluated.
- `bronze_count`, `silver_count`, `gold_count`: tier counts at the cycle boundary.
- `upgraded_count`, `downgraded_count`, `retained_count`: movement totals for the cycle.
- `policy_ref`: optional loyalty policy or version reference.
- `source`, `external_ids`, and `metadata`: provenance handles for the evaluator or imported aggregate.

Current tier snapshot remains in `crm_entities.attributes.profile_packs.fran_loyalty`. Current member sign-up dates come from `crm_entities.attributes.profile_packs.fran_member.member_since` with `crm_entities.created_at` as the fallback.

Points analytics use existing spine data:

- Points issued and redeemed are aggregated from `crm_events` for the requested date range.
- Current outstanding liability is derived from `crm_entities.attributes.profile_packs.fran_loyalty.points_balance`.
- Expiry risk is derived from `points_expiring_soon` and `points_expiry_date` inside the requested notification window.
- Top spender and lifecycle lists are derived from transaction events in `crm_events`, joined to Fran member profile rows by CRM person id.
- Birthday-member lists use `crm_entities.attributes.profile_packs.fran_member.birthday`, `mobile`, and current `fran_loyalty` tier and points fields.
- Campaign performance uses campaign identifiers in event `context` or `payload`, plus reach, transaction, points, and revenue payload fields.

The analytics API returns aggregate series plus compact operator export rows. It should not expose unrelated graph rows. Member-level tier changes should still be preserved through source events, facts, execution logs, or future detailed cycle rows when needed. A future `fran_loyalty_ledger` can replace event-derived points flow without changing the dashboard response shape.

## Fran Loyalty Policy Versions

Fran CRM now stores the policy/version spine that Fran POS loads before checkout execution.

Tables:

- `fran_loyalty_programs`: workspace-scoped loyalty containers with a stable key, label, status, default currency, and metadata.
- `fran_loyalty_policy_versions`: immutable policy snapshots with `version_key`, status, effective window, `rules jsonb`, source document reference, source hash, publish metadata, and audit provenance.
- `fran_loyalty_policy_assignments`: rollout rows that map a workspace default, store, register, member, cohort, or experiment to a policy version.
- `fran_loyalty_accounts`: current account snapshots for member refs, tier key, points balance, lifetime earned/redeemed totals, spend qualification, active policy reference, and external ids.
- `fran_loyalty_ledger`: idempotent economic entries for earn, redeem, expire, adjust, reverse, and tier-adjust outcomes. Each row can keep the POS `evaluation_trace` used to settle the ledger.

Policy version status values are `draft`, `testing`, `approved`, `active`, and `retired`. Draft/testing/approved versions can be assigned for controlled tests; a single active default policy remains the workspace fallback for a program.

Fran POS is the runtime executor for the loaded policy bundle. Fran SKUMS owns canonical basket pricing, product context, availability, and inventory reservations. CRM ledger rows must preserve the POS policy version id, assignment id, source system, idempotency key, and evaluation trace so seasonal and experiment behavior remains auditable.

## Customer Memory Foundation

The CRM now has Phase 1 customer-memory tables for cross-repo facts:

- `crm_events`: idempotent source events from POS, loyalty, ecommerce, partner channels, or future integration workers.
- `crm_external_links`: durable links between CRM entities and external customer references.
- `crm_customer_facts`: normalized customer facts derived from events.
- `crm_consent_records`: consent and contactability history.
- `crm_customer_profiles`: computed customer read model with activity, value, affinity, intent, provenance, and sensitivity level.
- `crm_segment_memberships`: segment membership projections.
- `crm_metric_definitions`: workspace-owned generic metric registry.

Every source write should carry:

- `event_id`
- `event_type`
- `workspace_id`
- `source_system`
- `occurred_at`
- `idempotency_key`
- `actor`
- `subject`
- `context`
- `payload`
- `schema_version`

Fran CRM should keep customer graph, consent, customer memory, member identity, loyalty decisions, reward decisions, segments, and semantic query foundations. POS and SKUMS remain the source of truth for checkout execution and product taxonomy.

## Commerce Return Eligibility

crmOS now keeps a commerce memory layer for counter-safe return checks. POS remains the system of record for return execution, tender movement, receipt truth, inventory disposition, register audit, and POS outbox events. crmOS owns identity resolution, purchase memory, return policy evaluation, matched-order evidence, and consumable authorization references.

Commerce read-model tables:

- `crm_commerce_orders`: workspace-scoped orders projected from POS, ecommerce, and future commerce events.
- `crm_commerce_order_lines`: purchased line items with SKU/product identity, purchased quantity, returned quantity, return deadline, and policy snapshot.
- `crm_commerce_return_facts`: idempotent return-line facts from completed return events. These prevent replayed outbox events from incrementing returned quantity twice.

Policy and decision tables:

- `crm_return_policies`: versioned workspace return-policy rules. A published policy may define return window, allowed actions, no-matched-sale behavior, outside-window behavior, and decision cache duration.
- `crm_return_eligibility_checks`: one normalized POS return-check request and the resulting decision. Uniqueness is `(workspace_id, request_hash)`.
- `crm_return_authorizations`: consumable authorization issued for `eligible`, `exchange_only`, or `store_credit_only` decisions. A completed POS return consumes the authorization.

Stable decisions are:

- `eligible`
- `exchange_only`
- `store_credit_only`
- `manager_review`
- `ineligible`
- `not_found`
- `insufficient_context`

The POS-facing eligibility response must stay narrow. It may include matched order date, source, purchased quantity, already returned quantity, returnable quantity, deadline, allowed actions, reason codes, and manager requirement. It must not expose unrelated purchases, full customer graph relationships, segments, or confidential profile fields.

No matched sale is a policy decision, not a POS guess. A published policy can route those requests to manager review, store credit, exchange-only, ineligible, or not-found outcomes without changing POS code.
