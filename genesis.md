# Fran CRM Genesis

## Source Fork

Start this repo by copying or forking:

```text
C:\Users\Jeremy Tan\CodeProjects\crm
```

Fran CRM is the opinionated customer, member, and rewards decision layer for Fran. It is based on crmOS, but it is allowed to install Fran defaults, Fran profile packs, Fran reward rules, and Fran counter-session projections by default.

## Product Role

Fran CRM is the customer and loyalty brain behind Fran POS.

It owns:

- member identity resolution
- customer graph and external links
- Fran profile packs
- POS-safe counter profile projection
- loyalty policy versions
- points ledger or loyalty provider projection
- tier status and tier progress
- reward catalogue and eligibility
- reward quote, reservation, commit, and reversal decisions
- customer facts and provenance
- audit events
- agent proposals for sensitive or ambiguous changes

It does not own:

- basket mutation
- payment execution
- tender movement
- discount line rendering
- receipt rendering
- register sessions
- stock movement
- fulfillment or 3PL execution

## Upstream Anchors

Keep and extend these crmOS primitives:

- `crm_entities`
- `crm_external_links`
- `crm_events`
- `crm_customer_facts`
- `crm_customer_profiles`
- `crm_field_definitions`
- `crm_profile_packs`
- `crm_agent_proposals`
- `crm_approvals`
- `crm_execution_logs`
- `crm_audit_events`
- `/api/v1/events`
- `/api/v1/people/[person_id]/counter-profile`
- `/api/v1/people/[person_id]/profile-fields`
- `/api/profile-packs`
- `/api/v1/pos/returns/eligibility`

## Fran-Specific Code Placement

Put Fran-only code in clear surfaces:

```text
server/fran/
server/fran/loyalty/
server/fran/rewards/
server/fran/counter-session/
server/api/fran/pos/
app/pages/fran/
docs/fran-crm-contract.md
docs/fran-loyalty-policy.md
```

Do not bury Fran rules inside generic crmOS helpers unless the helper remains genuinely reusable.

## Default Fran Packs

Fran CRM should install these by default for a Fran workspace:

```text
fran_member
  member_number
  mobile
  member_since
  birthday
  preferred_store
  consent_status

fran_loyalty
  tier
  points_balance
  points_expiring_soon
  points_expiry_date
  ytd_spend
  next_tier
  spend_to_next_tier

fran_beauty_profile
  skin_type
  skin_concerns
  reported_sensitivities
  reported_sensitivity_note
  preferred_routine
  advisor_notes
```

Only fields marked `pos_visible = true` should appear in POS counter responses. Sensitive fields must be filtered by the backend, not merely hidden in UI.

## POS-Facing APIs

Fran POS should not browse the full CRM graph at checkout. It should call compact decision routes.

Initial routes:

```text
POST /fran/pos/member/resolve
POST /fran/pos/counter-session
POST /fran/pos/basket/preview
POST /fran/pos/rewards/quote
POST /fran/pos/rewards/commit
POST /fran/pos/rewards/reverse
POST /api/v1/events
```

### Member Resolve

Input:

```json
{
  "workspaceId": "uuid",
  "identifier": {
    "type": "phone|member_number|qr|barcode|external_ref",
    "value": "string"
  },
  "sourceSystem": "fran-pos"
}
```

Output:

```json
{
  "status": "exact|candidates|none|ambiguous",
  "personId": "uuid or null",
  "memberRef": "string or null",
  "candidates": [],
  "warnings": []
}
```

### Counter Session

The counter session is the main POS projection.

It should return:

- member identity
- profile card fields
- tier badge
- current points balance
- expiry alert
- reward availability summary
- beauty profile warnings safe for counter staff
- source freshness
- session id for quote/commit continuity

### Basket Preview

Input includes basket lines, discounts, store, register, cashier, member, and current session.

Output includes:

- projected points earn
- tier progress
- tier upgrade alert
- eligible reward summaries
- blocked reward reasons
- warnings

Preview must not mutate points.

### Reward Quote

Quote validates a proposed redemption before payment.

Output includes:

- quote id
- points to redeem
- monetary value
- reward lines POS should display
- remaining balance if committed
- expiry time
- warnings

Quote should reserve only if the policy requires reservation. Otherwise it should be a deterministic preview.

### Reward Commit

Commit happens only after POS payment is confirmed.

Commit must be idempotent by:

```text
workspace_id + source_system + receipt_number + quote_id
```

### Reward Reverse

Reverse happens when a completed payment is voided or a committed reward must be undone.

Reverse must be idempotent by:

```text
workspace_id + source_system + receipt_number + original_commit_id + reversal_reason
```

## Data Model Additions

Add Fran-specific tables only when generic crmOS tables are not enough.

Suggested Fran tables:

```text
fran_loyalty_programs
fran_loyalty_policy_versions
fran_loyalty_accounts
fran_loyalty_ledger
fran_reward_catalog
fran_reward_rules
fran_reward_quotes
fran_reward_commits
fran_counter_sessions
```

Keep every table workspace-scoped.

If a table contains reusable crmOS primitives, consider upstreaming later. If it contains Fran policy or Fran naming, keep it in Fran CRM.

## Event Handling

Fran CRM consumes:

```text
pos.customer.attached
pos.sale.completed
pos.return.completed
fran.reward.quoted
fran.reward.committed
fran.reward.reversed
```

Fran CRM produces:

```text
fran.member.resolved
fran.counter_session.created
fran.loyalty.previewed
fran.reward.quote_created
fran.reward.commit_accepted
fran.reward.commit_rejected
fran.reward.reversed
fran.customer_fact.updated
```

Every event must preserve:

- workspace id
- source system
- idempotency key
- actor
- subject
- context
- payload
- schema version

## Agent Rules

Agents may propose:

- duplicate member merge
- suspicious reward abuse review
- profile field cleanup
- sensitivity flag changes
- new segment or campaign suggestion
- reward policy draft

Agents must not directly execute without approval:

- member merge
- reward balance adjustment
- reward policy publish
- customer export
- sensitivity downgrade
- destructive profile cleanup

## Non-Goals

- Do not render POS checkout screens.
- Do not execute payments.
- Do not apply POS discounts directly.
- Do not decide SKUMS fulfillment actions.
- Do not expose full customer graph to POS.
- Do not make every Fran-specific loyalty field part of upstream crmOS core.

## Build Order

1. Copy upstream CRM into this folder and verify `npm test`, `npm run typecheck`, and `npm run build`.
2. Rename product labels to Fran CRM where user-facing.
3. Add `docs/fran-crm-contract.md` and `docs/fran-loyalty-policy.md`.
4. Add default Fran profile packs.
5. Add mocked `POST /fran/pos/member/resolve`.
6. Add mocked `POST /fran/pos/counter-session`.
7. Add loyalty policy version tables and fixtures.
8. Add reward catalogue and eligibility tables.
9. Add basket preview evaluator.
10. Add reward quote, commit, and reverse routes.
11. Wire POS events into loyalty ledger and customer facts.
12. Add admin UI for loyalty policy and reward catalogue.
13. Add agent proposal flow for balance adjustment and policy publish.
14. Add tests for resolve, counter projection, quote, commit idempotency, reversal idempotency, and POS-safe filtering.

## Acceptance Checks

- Fran POS can resolve a member without reading raw CRM tables.
- Counter session returns only POS-safe fields.
- Basket preview does not mutate ledger state.
- Reward commit cannot double-charge points on retry.
- Void/reversal restores points or reward availability idempotently.
- Tier progress is based on published policy version.
- Sensitive beauty profile fields are filtered from POS unless explicitly counter-visible.
- Every mutation has provenance in facts, ledger, audit, or execution logs.
