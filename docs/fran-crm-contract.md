# Fran CRM Contract

Fran CRM is the member, loyalty, reward, and customer-fact decision layer behind Fran POS. POS must call compact decision routes and should not browse raw CRM graph tables during checkout.

## Ownership Boundary

Fran CRM owns:

- member identity resolution
- customer graph and external links
- Fran profile packs
- POS-safe counter profile projection
- loyalty policy versions
- aggregate loyalty analytics
- reward catalogue, quote, commit, and reversal decisions
- customer facts and provenance
- audit events and execution logs
- agent proposals for sensitive or ambiguous changes

Fran POS owns basket mutation, payment execution, tender movement, receipt rendering, register sessions, and the checkout UI.

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

Planned routes:

- `POST /fran/pos/basket/preview`
- `POST /fran/pos/rewards/quote`
- `POST /fran/pos/rewards/commit`
- `POST /fran/pos/rewards/reverse`

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

## Idempotency Rules

Reward commit must be idempotent by:

```text
workspace_id + source_system + receipt_number + quote_id
```

Reward reverse must be idempotent by:

```text
workspace_id + source_system + receipt_number + original_commit_id + reversal_reason
```

Preview must not mutate points. Quote may reserve only if the published loyalty policy requires reservation.
