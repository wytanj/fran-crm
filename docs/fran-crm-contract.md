# Fran CRM Contract

Fran CRM is the member, loyalty, reward, and customer-fact decision layer behind Fran POS. POS must call compact decision routes and should not browse raw CRM graph tables during checkout.

## Ownership Boundary

Fran CRM owns:

- member identity resolution
- customer graph and external links
- Fran profile packs
- POS-safe counter profile projection
- loyalty policy versions
- policy-version assignment for default, seasonal, store, register, member, cohort, and experiment rollout
- loyalty account snapshots and ledger settlement
- aggregate loyalty analytics
- reward audit, reversal, and reconciliation
- customer facts and provenance
- audit events and execution logs
- agent proposals for sensitive or ambiguous changes

Fran POS owns basket mutation, payment execution, tender movement, receipt rendering, register sessions, and the checkout UI.

Fran POS executes the assigned loyalty policy during checkout. Fran SKUMS owns canonical product identity, basket pricing, quote revisions, stock availability, and inventory reservations. CRM policy responses must therefore describe what POS should execute, not calculate final basket pricing from POS display state.

## Default Profile Packs

New Fran workspaces install these packs by default:

- `fran_member`: member number, mobile, member since, birthday, preferred store, consent status.
- `fran_loyalty`: tier, points balance, points expiry, YTD spend, next tier, spend to next tier.
- `fran_beauty_profile`: skin type, skin concerns, reported sensitivities, preferred routine, restricted notes.

Only fields with `pos_visible = true` can appear in POS counter responses. Restricted fields such as `reported_sensitivity_note`, `advisor_notes`, `birthday`, and `ytd_spend` stay out of counter-session payloads unless a future policy explicitly changes the projection.

## POS Routes

Implemented mock routes:

- `POST /fran/pos/member/resolve`
- `POST /fran/pos/counter-session`
- `POST /api/fran/pos/member/resolve`
- `POST /api/fran/pos/counter-session`
- `GET /api/fran/analytics`
- `GET /api/fran/loyalty/policy-versions`
- `POST /api/fran/loyalty/policy-versions`
- `GET /api/fran/loyalty/policy-versions/active`
- `POST /api/fran/loyalty/policy-versions/[version_id]/publish`
- `POST /api/fran/loyalty/assignments`

Planned routes:

- CRM ledger commit and reversal routes for settled POS execution events.
- CRM reconciliation routes for queued/offline policy executions.

The older basket preview and reward quote route names may remain as compatibility shims, but they should not become the source of canonical pricing or inventory truth.

## Policy Bundle Loading

Fran POS loads the policy bundle through `GET /api/fran/loyalty/policy-versions/active`.

Query:

- `workspaceId`: required for Supabase-backed reads.
- `programKey`: defaults to `fran_with_benefits`.
- `storeId`, `registerId`, `personId`, and `cohort`: optional rollout targeting inputs.
- `at`: optional ISO datetime for testing effective windows.

The route resolves active assignment rows first. A member/register/store/cohort/experiment assignment can point to an `active`, `testing`, or `approved` policy version. If no assignment matches, the route falls back to the active default policy for the program.

Response includes:

- `program`
- `policyVersion`
- `assignment`
- `posContract`

The `posContract` states that Fran POS is the executor, Fran SKUMS is pricing and inventory authority, and Fran CRM is ledger authority. POS must include the returned policy version and assignment ids in later execution/ledger events.

## Member Resolve

Input:

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

Output:

```json
{
  "mode": "mock",
  "status": "exact",
  "personId": "person_001",
  "memberRef": "FRAN-0001",
  "candidates": [],
  "warnings": []
}
```

Valid statuses are `exact`, `candidates`, `none`, and `ambiguous`.

## Counter Session

Input:

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

Output includes:

- `sessionId`
- member identity
- POS-visible profile card fields
- tier badge and next-tier progress
- points balance and expiry alert
- reward availability summaries
- safe beauty profile warnings
- source freshness

The mock response intentionally excludes restricted notes even when the demo CRM profile contains them.

## Analytics Boundary

`GET /api/fran/analytics` is an operator-facing CRM route, not a checkout route. It returns aggregate current tier counts, sign-up trends, tier trend points, evaluation-cycle upgrade/downgrade counts, date-ranged points flow, redemption rate, outstanding points liability, expiry notification exposure, top-spender lists, inactivity lists, birthday-member lists, and campaign performance for one `crm_workspaces.id` boundary. It does not expose unrelated graph rows or member-level movement details.

Current Bronze, Silver, and Gold counts come from the `fran_loyalty` profile pack. New sign-ups use `fran_member.member_since` with entity creation date as fallback. Historical movement is recorded in `fran_loyalty_tier_evaluation_cycles`. Points issued, redeemed, spend, lifecycle, and campaign metrics come from `crm_events`, while liability, birthdays, and current tier context come from Fran profile packs. Export lists must remain compact and operator-scoped.

Claude/MCP staff questions use the same boundary. `fran.analytics.topCustomers` can answer date-ranged purchase-ranking questions and return chart-ready data, but it still requires customer-level analytics capabilities and redacts contact fields without `customer.contact.read`. MCP `tools/call` requests are logged in `crm_mcp_request_logs` before execution so rejected, failed, and successful staff questions remain auditable.

## Idempotency Rules

Loyalty ledger commit from POS execution must be idempotent by:

```text
workspace_id + source_system + idempotency_key
```

The POS execution payload should include the POS sale id, SKUMS quote id, optional SKUMS reservation id, policy version id, assignment id, points delta, reward refs, and evaluation trace.

Reward or points reversal must be idempotent by:

```text
workspace_id + source_system + original_commit_id + reversal_reason
```

Policy bundle read and POS-side evaluation must not mutate points. CRM ledger writes happen only after POS payment succeeds and SKUMS sale/inventory commit has an idempotent reference.
