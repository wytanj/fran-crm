---
title: Data Model
description: Base properties, Fran profile packs, graph relationships, POS-safe projections, and how agents extend the schema.
kicker: Model
---

## Base Entity Types

Fran CRM starts from crmOS workspace-scoped graph primitives, then installs Fran defaults for member identity, loyalty status, beauty profile context, and POS-safe counter projection.

Users set up a company workspace first. The company maps to `crm_workspaces`, and the creating user becomes the initial `owner` in `crm_workspace_members`; later humans, agents, and integrations are permissioned inside that workspace.

| Entity type | Purpose |
| --- | --- |
| `person` | Individual customer, contact, lead, buyer, or support requester. |
| `company` | Account, employer, merchant, vendor, or organization. |
| `order` | Purchase, subscription order, invoice, or commercial transaction. |
| `product` | Purchased SKU, subscribed product, service, or catalog item. |
| `message` | Email, chat, ticket reply, note, SMS, or conversation event. |
| `ticket` | Support issue, complaint, request, or case. |
| `campaign` | Segment, communication, or outbound initiative. |

## Minimal Customer Properties

A typical Shopify-style customer gives the CRM enough information to start with:

| Property | Applies to | Notes |
| --- | --- | --- |
| `email` | person | Primary customer identity handle. |
| `phone` | person | Optional identity and communication handle. |
| `first_name` | person | Customer profile field. |
| `last_name` | person | Customer profile field. |
| `address` | person | Shipping, billing, or default location data. |
| `marketing_consent` | person | Consent and preference context. |
| `external_customer_id` | person | Source-specific ID from Shopify or another channel. |
| `order_number` | order | Source order identifier. |
| `total_price` | order | Transaction amount. |
| `currency` | order | ISO currency code. |
| `fulfillment_status` | order | Fulfillment lifecycle. |
| `financial_status` | order | Payment lifecycle. |
| `sku` | product | Purchased SKU or variant key. |
| `quantity` | order | Quantity purchased by line item. |

## Graph Relationships

Relationships connect customer context without forcing every source into one table.

Examples:

- person `placed` order
- order `contains` product
- person `works_at` company
- person `opened` ticket
- ticket `has_message` message
- campaign `touched` person

Each relationship can carry confidence, source, and metadata.

## Extending The Schema

Agents extend the schema by proposing field definitions rather than directly altering the database.

The proposal should include:

- entity type
- field key
- field label
- field type
- whether the field is required
- origin: human, agent, integration, or system
- reason and source evidence

After approval, the field definition becomes part of the workspace model and future imports can map into it.

## Profile Packs

Profile packs are workspace-scoped bundles of customer fields. Fran CRM installs member, loyalty, and beauty packs by default without changing the core customer table.

The current foundation uses:

| Surface | Purpose |
| --- | --- |
| `crm_profile_packs` | Installed pack registry for a workspace. |
| `crm_field_definitions.pack_key` | Pack-scoped field definitions and validation metadata. |
| `crm_entities.attributes.profile_packs` | Current editable values for a person. |
| `crm_customer_facts` | Provenance timeline for profile-field updates. |

Pack fields can declare whether they are POS-visible, cashier-editable, segment-usable, and which sensitivity level applies. POS, support, exports, and agents should consume context-specific projections rather than raw values when a narrower surface is available.

Fran default packs are:

| Pack | Purpose |
| --- | --- |
| `fran_member` | Member number, mobile, member since, birthday, preferred store, and consent status. |
| `fran_loyalty` | Tier, points, expiry, YTD spend, next tier, and spend to next tier. |
| `fran_beauty_profile` | Skin type, concerns, reported sensitivities, preferred routine, and restricted advisor notes. |

Only `pos_visible` fields are allowed in counter-session responses. Restricted fields such as `reported_sensitivity_note`, `advisor_notes`, `birthday`, and `ytd_spend` stay filtered by the backend.

## Fran Loyalty Analytics

Fran CRM keeps current member tier state in the `fran_loyalty` profile pack and records aggregate tier-evaluation history in `fran_loyalty_tier_evaluation_cycles`.

| Field group | Purpose |
| --- | --- |
| `cycle_key`, `label`, `evaluated_at` | Identify a loyalty evaluation cycle. |
| `member_count`, `bronze_count`, `silver_count`, `gold_count` | Store the cycle tier snapshot. |
| `upgraded_count`, `downgraded_count`, `retained_count` | Store movement counts for that cycle. |
| `policy_ref`, `source`, `external_ids`, `metadata` | Preserve evaluator and policy provenance. |

The analytics API derives current Bronze, Silver, and Gold counts from `crm_entities.attributes.profile_packs.fran_loyalty.tier`. Sign-up trends use `fran_member.member_since` when present and fall back to the person creation date.

Points analytics are aggregate reads over the same spine. Issued and redeemed points come from `crm_events` in the requested date range. Outstanding liability comes from `fran_loyalty.points_balance` multiplied by the configured minor-currency value per point. Expiry risk uses `fran_loyalty.points_expiring_soon` and `fran_loyalty.points_expiry_date`.

Customer report lists use compact workspace-scoped projections. Top spenders, at-risk customers, lapsed customers, and campaign performance are derived from transaction, loyalty, and campaign events in `crm_events`. Birthday member lists read `fran_member.birthday`, `mobile`, current tier, and points balance from profile packs.

## Customer Memory Tables

The CRM acts as the customer graph, consent, memory, segments, and semantic-query foundation. It should not own POS execution, product taxonomy, or loyalty economics.

| Table | Purpose |
| --- | --- |
| `crm_events` | Idempotent facts from POS, loyalty, ecommerce, and partner systems. |
| `crm_external_links` | Links between CRM entities and source-system customer references. |
| `crm_customer_facts` | Normalized event-derived facts for timelines and projections. |
| `crm_consent_records` | Consent and contactability history. |
| `crm_customer_profiles` | Computed activity, value, affinity, intent, and metric read model. |
| `crm_segment_memberships` | Segment membership projections with score and reason. |
| `crm_metric_definitions` | Workspace-owned generic metric registry. |

The Nuxt UI uses API routes for CRM reads and writes instead of direct browser table access. Server persistence can use the Supabase pooler connection string or a server-only Supabase key; row and action permissions stay workspace-scoped.

## Event Contract

Every source write should carry:

| Field | Notes |
| --- | --- |
| `event_id` | Stable source event identifier. |
| `event_type` | Business-neutral event type, such as `pos.sale.completed`. |
| `workspace_id` | Organization boundary. |
| `source_system` | Origin system such as POS, Shopify, loyalty, or partner. |
| `occurred_at` | When the fact happened. |
| `idempotency_key` | Stable replay key that prevents duplicate effects. |
| `actor` | Human, system, agent, or integration actor context. |
| `subject` | Customer or account reference context. |
| `context` | Channel, country, currency, location, register, listing, or related context. |
| `payload` | Source-specific event payload. |
| `schema_version` | Contract version for event readers. |

## Commerce Return Eligibility

crmOS keeps a commerce memory layer so POS can ask a narrow question at the counter: given this customer email, product, optional order hint, and requested action, is the return allowed?

The boundary is deliberate:

- POS owns refund execution, exchange execution, tender movement, receipts, inventory disposition, register audit, and outbox delivery.
- crmOS owns identity resolution, cross-channel purchase memory, return policy evaluation, matched-order evidence, and authorization references.

| Table | Purpose |
| --- | --- |
| `crm_commerce_orders` | Orders projected from POS, ecommerce, and future commerce sources. |
| `crm_commerce_order_lines` | Purchased items with product identity, purchased quantity, returned quantity, return deadline, and policy snapshot. |
| `crm_commerce_return_facts` | Idempotent completed-return facts used to update returned quantity once. |
| `crm_return_policies` | Versioned workspace return-policy rules. |
| `crm_return_eligibility_checks` | Normalized POS check request plus decision, reason codes, evidence, and cache expiry. |
| `crm_return_authorizations` | Consumable permission for POS to complete an allowed return or exchange. |

Eligibility decisions are `eligible`, `exchange_only`, `store_credit_only`, `manager_review`, `ineligible`, `not_found`, and `insufficient_context`. The route returns only counter-safe purchase evidence, never the full customer graph.
