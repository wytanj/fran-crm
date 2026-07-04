# Fran Loyalty Policy

Fran loyalty rules must be versioned before they drive POS-visible decisions. Draft policies can be proposed by humans or agents, but publish requires approval.

## Policy Responsibilities

A published policy version should define:

- tier names and qualification windows
- earn rate by eligible spend
- points expiry rules
- next-tier progress calculation
- reward catalogue eligibility
- quote reservation behavior
- commit and reverse idempotency windows
- manager-review triggers

## Initial Defaults

The current buildout ships mocked values only:

- `Gold` member tier
- `18,420` points balance
- `1,200` points expiring soon on `2026-08-31`
- next tier `Platinum`
- `660` spend to next tier
- `$5 reward` as an eligible mock reward
- `Platinum bonus` as a blocked mock reward

These values are fixtures for counter-session contract development. They are not yet backed by loyalty ledger tables.

## Analytics

Fran loyalty analytics are aggregate reads over the member and tier spine:

- current Bronze, Silver, and Gold counts come from `crm_entities.attributes.profile_packs.fran_loyalty.tier`
- new sign-ups use `crm_entities.attributes.profile_packs.fran_member.member_since`, falling back to `crm_entities.created_at`
- evaluation-cycle trend and movement counts are recorded in `fran_loyalty_tier_evaluation_cycles`
- points issued and redeemed are aggregated from `crm_events` for the requested period
- redemption rate is `points redeemed / points issued`, returning `0` when no points were issued
- outstanding liability is current unredeemed points multiplied by the configured minor-currency value per point
- expiry risk uses `points_expiring_soon` and `points_expiry_date` inside the notification window
- top spenders and lifecycle inactivity lists are derived from transaction events with CRM person references
- birthday member lists use the Fran member and loyalty profile packs
- campaign performance aggregates campaign reach, transaction, points-awarded, and revenue events

Claude/MCP analytics tools use the same source data and authorization boundary. `fran.analytics.topCustomers` ranks customers inside a requested purchase window, returns chart-ready data, records execution and audit rows, and redacts contact fields unless the caller has `customer.contact.read`.

The cycle table stores aggregate totals only: member count, tier counts, upgraded count, downgraded count, retained count, optional policy reference, and provenance metadata. Member-level tier movement should remain in source events, facts, execution logs, or a future detailed cycle-result table when the loyalty evaluator needs drilldown. Exportable operator lists must stay compact and workspace-scoped. A future loyalty ledger can replace event-derived point-flow aggregates without changing the operator dashboard contract.

## Mutation Rules

Agents may propose:

- suspicious reward abuse review
- duplicate member merge
- loyalty policy draft
- reward catalogue update
- balance adjustment

Agents must not directly execute:

- balance adjustment
- reward policy publish
- member merge
- sensitivity downgrade
- destructive profile cleanup

## Planned Tables

Fran-specific tables should be added only when crmOS primitives are not enough:

- `fran_loyalty_programs`
- `fran_loyalty_policy_versions`
- `fran_loyalty_accounts`
- `fran_loyalty_ledger`
- `fran_reward_catalog`
- `fran_reward_rules`
- `fran_reward_quotes`
- `fran_reward_commits`
- `fran_counter_sessions`

Every table must be workspace-scoped and should preserve source system, idempotency key, actor, subject, context, payload, and schema version where applicable.
