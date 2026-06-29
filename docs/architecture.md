# Architecture Notes

Fran CRM treats customer, member, loyalty, reward, and counter-session data as an operational graph rather than a page-bound sales tool.

## Core Graph

- `crm_entities`: people, companies, households, orders, products, tickets, messages, campaigns, and custom records.
- `crm_relationships`: typed edges such as `placed_order`, `works_at`, `opened_ticket`, `belongs_to_household`, or custom agent-created edges.
- `crm_field_definitions`: schema designed by teams, integrations, or agents without hardcoding every vertical into the core.
- `crm_agent_proposals`, `crm_approvals`, `crm_execution_logs`: the approval loop agents need before touching operational data.

## Customer Memory Layer

Fran CRM owns customer graph, member identity, consent, customer memory, loyalty policy, reward decisions, segments, and the semantic-query foundation. It does not own POS execution, tender movement, receipt rendering, register sessions, or SKUMS product taxonomy.

The event and projection foundation is:

- `crm_events`: idempotent source-system facts.
- `crm_external_links`: external identity links.
- `crm_customer_facts`: normalized customer timeline facts.
- `crm_consent_records`: consent and contactability history.
- `crm_customer_profiles`: computed profile read model.
- `crm_segment_memberships`: segment projections.
- `crm_metric_definitions`: generic metric registry.

Every source event should carry `event_id`, `event_type`, `workspace_id`, `source_system`, `occurred_at`, `idempotency_key`, `actor`, `subject`, `context`, `payload`, and `schema_version`.

## Minimal Customer Fields And Fran Packs

The upstream customer contract still covers common commerce customer data:

- Identity: email, phone, first name, last name, tags, note.
- Consent: contactability and preference context.
- Commerce state: orders count, total spent, currency, last order date.
- Address: default address as structured JSON.
- Source: source channel and external IDs.
- B2B extension: company name and lifecycle stage.

Fran adds default profile packs:

- `fran_member`
- `fran_loyalty`
- `fran_beauty_profile`

These packs stay in profile-pack and field-definition tables instead of becoming hardcoded generic crmOS columns.

## MCP Direction

Future MCP servers should expose workspace-scoped tools around:

- Search graph entities.
- Read neighborhood around an entity.
- Propose a schema field.
- Stage a merge.
- Request approval.
- Execute an approved action.

The MCP layer should use the same audit and execution tables as the web app.

## Agent Documentation Maintenance

Agent-facing implementation details live in `docs/agents/`.

- API routes: `docs/agents/API_CONTRACT.md`
- Data model: `docs/agents/DATA_MODEL.md`
- Agent workflow and approvals: `docs/agents/AGENT_PROTOCOL.md`

Any code change that updates routes, schema, proposal behavior, or execution behavior should update the matching agent document in the same change.
