# Fran loyalty, rewards, POS intent & FWB policy — simulator brief

**Audience:** Agents building a **loyalty / rewards simulator** (not production checkout).  
**As of:** 2026-07-29  
**Program:** Fran’s With Benefits (**FWB**), key `fran_with_benefits` (aliases: `fran-v2`, `fwb`)  
**Sources of truth:**

| Doc / code | Role |
|------------|------|
| `docs/loyaltys.pdf` | Business rules (tiers, dens, earn formula) |
| `docs/LOYALTY_FWB_ARCHITECTURE.md` | Ownership + campaign airlock |
| `docs/POS_CRM_SKUMS_CONNECTION_ARCHITECTURE.md` | POS → SKUMS → CRM path |
| `fran-crm/docs/fran-loyalty-policy.md` | Policy spine + routes |
| `fran-crm/docs/fran-crm-contract.md` | CRM / POS / SKUMS contracts |
| `fran-pos/docs/fran-pos-crm-skums-contract.md` | POS client methods + counter UX |
| `fran-pos/.../fwb-earn.ts` | Pure earn/redeem helpers (golden tests) |
| `fran-crm/.../fwb-engine.ts` | CRM ledger math (same formula) |

This brief is **self-contained enough to implement a simulator**. Prefer pure functions over live network calls unless you are integration-testing the real APIs.

---

## 1. One-sentence model

**CRM owns loyalty truth (members, tiers, points ledger, policy, vouchers). POS owns checkout UX and local payment. SKUMS owns product price, stock, and sale facts.** Loyalty at the register is **previewed and executed** using an assigned policy bundle; **final earn/redeem settlement** is idempotent on CRM after payment succeeds.

---

## 2. System ownership (do not blur)

| System | Owns | Does **not** own |
|--------|------|------------------|
| **Fran CRM** | Member resolve, counter-safe profile, policy versions & assignments, points ledger / batches, tier, YTD, vouchers/QR, reward quote/commit/reverse (ledger side), analytics | Basket lines, tender, catalog master, inventory ATS |
| **Fran POS** | Scan/search, basket, cashier flows, payment, receipt, PIN roles, **local evaluation** of earn/redeem from policy bundle, outbox | Points SoR, policy authoring, product master |
| **Fran SKUMS** | POS catalog, unit price, quote, reservation, sale/return ingest, inventory, **CRM app link** (server-side), loyalty **facade** routes | Points balance, tier jobs, campaign authoring |

### Connection topology (production intent)

```text
POS register
  --(one SKUMS API key: pos:read + pos:write)-->  SKUMS workspace
       ├── commerce: catalog / quote / reserve / sale
       └── loyalty facade: /fran/pos/loyalty/*  --server-->  Fran CRM
```

- POS must **not** hold CRM service secrets for live loyalty.  
- SKUMS HQ links CRM once per workspace (`workspace_crm_links` / Integrations).  
- Dev may still use dual-URL CRM for debugging; that is **not** the target architecture.

### Session modes on the counter

| Mode | Earn? | Redeem / member rewards? |
|------|-------|---------------------------|
| **member** | Yes (if loyalty healthy) | Yes |
| **non_member** | No | No |
| **tourist** | No | No |

Cashier must tag identity before payment (member lookup **or** explicit non-member/tourist).

---

## 3. What POS intends to do (runtime story)

POS is the **executor**, not the loyalty brain.

### 3.1 Boot / readiness

1. Connect SKUMS (URL + workspace key).  
2. `GET /fran/pos/capabilities` → `skums.ok`, `loyalty.ok`, `ready_for_member_loyalty`.  
3. Member path requires loyalty linked; non-member/tourist may still sell if SKUMS ok.  
4. Load active policy: `GET …/loyalty/policy/active` (via SKUMS facade or CRM) → **cache** by workspace/program/version/assignment.

### 3.2 Open sale

1. Start with **unresolved** basket.  
2. Cashier tags:
   - **Member:** resolve phone / member number / QR → counter session  
   - **Non-member / tourist:** explicit exception  
3. Show counter-safe card: name, tier, points, earn preview, expiry alerts, active perks (from CRM — POS does not invent birthday eligibility).

### 3.3 Basket

1. Lines priced by **SKUMS quote** (not CRM).  
2. Eligible spend for earn = **net eligible spend** (post-discount portion that earns — follow policy `earnBasis` / POS evaluator).  
3. Local FWB earn preview using policy rates + birthday/category flags + campaign adds.  
4. Optional: redeem dens quote / voucher scan / reward quote.

### 3.4 Pay

1. Capture tender locally.  
2. **Do not hard-block pay solely on CRM** if sale already paid — loyalty may queue.  
3. Emit:
   - Commerce: SKUMS sale (same `sale_id` / idempotency)  
   - Loyalty: `commit_sale` with same ids, policy version, assignment, member_ref, earn/redeem deltas  

### 3.5 Failures

| Failure | Intent |
|---------|--------|
| SKUMS down | No live catalog/quote; offline policy only |
| CRM / loyalty missing | Block **member** path; allow tourist/non-member if policy allows |
| commit_sale fails after pay | Sale already local + SKUMS outbox; loyalty **queued** with same sale_id |
| Void / payment fail after redeem commit | `reverseRewardRedemption` / reverse path |

---

## 4. Fran’s With Benefits (FWB) policy — constitution

**Base FWB** is the rare-change constitution. Campaigns are time-boxed overlays (see §7).

### 4.1 Tiers (calendar year)

Measurement window: **calendar year** (1 Jan–31 Dec, not rolling 12 months).

| Tier key | Label | Annual spend threshold (SGD) | Earn rate (pts per $1 eligible) |
|----------|--------|------------------------------|----------------------------------|
| **F1** | Tier 1 | 0 | **1.00** |
| **F2** | Tier 2 | **500** | **1.25** |
| **F3** | Tier 3 | **1250** | **1.50** |

Aliases sometimes seen in code/UI: TIER1/BASE→F1, TIER2/SILVER→F2, TIER3/GOLD→F3 (prefer **F1/F2/F3** in new work).

**Jan 1 renewal (planned job):** tier recompute; F1 drop can expire past batches (see expiry).

### 4.2 Earn formula (canonical)

```text
Total Multiplier = TierRate + BirthdayAdd + CategoryAdd + sum(CampaignAdds)
Total Points     = floor(EligibleSpend × Total Multiplier)
```

| Component | When | Value |
|-----------|------|--------|
| TierRate | Always for member | 1.00 / 1.25 / 1.50 |
| BirthdayAdd | Birthday voucher / birthday month active | **+1.00** (additive, not multiply) |
| CategoryAdd | Category bonus voucher / promo active | **+1.00** |
| CampaignAdds | Each live campaign add | each **+N** on the rate (additive) |

**Critical:** birthday and category are **additive on the rate**, **not** `tier × bday × cat`.

**Examples (simulator golden):**

| Spend | Tier | Bday | Cat | Multiplier | Points |
|------:|------|:----:|:---:|----------:|-------:|
| 100 | F1 (1.0) | no | no | 1.0 | 100 |
| 100 | F3 (1.5) | no | no | 1.5 | 150 |
| 100 | F1 | yes | no | 2.0 | 200 |
| 100 | F2 (1.25) | yes | yes | 3.25 | 325 |
| 99.99 | F1 | no | no | 1.0 | 99 (`floor`) |

Eligible spend must be **≥ 0**; floor after multiply.

### 4.3 Redeem denominations (fixed only)

Members redeem **only** fixed dens (no arbitrary partial dens outside this table unless a future policy version changes it):

| Points | Basket discount ($) |
|-------:|--------------------:|
| 200 | 6 |
| 500 | 20 |
| 1000 | 50 |
| 1500 | 90 |
| 2500 | 175 |

- Pick dens where `availablePoints >= dens.points`.  
- “Best” dens = highest dens the balance can afford.  
- Conversion improves at higher dens (simulator may show `$/pt`).

### 4.4 Points expiry (constitution intent)

- At earn, batches get a **theoretical_expiry_date** (set once).  
- **F2/F3 freeze** the expiry clock while in tier (per PDF / engine).  
- **Jan 1 F1 drop** can expire past batches.  
- Counter may show **points expiry alert** (default ~30-day lookahead from CRM session).

### 4.5 Vouchers / rewards (POS-facing)

| Kind | Intent | Demo codes (CRM) |
|------|--------|------------------|
| **Birthday** | Activates +1.00 birthday add (and/or basket perk) | scan `BDAY` |
| **Category** | Activates +1.00 category add for scoped category/collection | scan `CAT` |
| **Dens redeem** | Locks a fixed dens → QR (~1 month) | e.g. `FWB-RDM-500-TEST01` |

Routes (CRM / via SKUMS facade):

- `POST …/vouchers/quote-redeem` — dens → QR  
- `POST …/vouchers/authorize` — POS scan authorize  
- `POST …/vouchers/issue` — issue bday/category (app/demo)  

**Planned / partial product surface:** reward catalogue, free sample thresholds, tier-specific offers as `activePerks` on counter session (CRM-owned eligibility; POS only displays).

### 4.6 Policy versioning (CRM spine)

| Object | Meaning |
|--------|---------|
| `fran_loyalty_programs` | e.g. `fran_with_benefits` |
| `fran_loyalty_policy_versions` | Immutable JSON rules snapshots |
| `fran_loyalty_policy_assignments` | workspace default / store / register / member / cohort / experiment |
| `fran_loyalty_accounts` | balance, tier, YTD, refs |
| `fran_loyalty_ledger` | idempotent earn/redeem entries |
| `fran_loyalty_point_batches` | FIFO-ish batches + theoretical expiry |

**Publish** retires previous active default. Assignments can still pin testing/approved versions for experiments without changing POS code.

Active load for POS:

```http
GET /api/fran/loyalty/policy-versions/active?format=pos&workspaceId=…&programKey=fran_with_benefits
```

Optional: `storeId`, `registerId`, `personId`, `cohort`, `at` (ISO for time travel in sim).

Response carries `program`, `policyVersion`, `assignment`, `posContract` (executor=POS, pricing/inventory=SKUMS, ledger=CRM).

---

## 5. Rewards lifecycle (for simulator state machine)

```text
[idle] → resolve member → counter session
      → load policy (cache)
      → basket change → recompute earn preview
      → optional: quote redeem dens / scan voucher / quote reward
      → payment success
      → commit_sale (earn + redeem)  [idempotent]
      → optional: reverse on void / payment fail after commit
```

### 5.1 Idempotency

CRM commit must be safe to retry:

```text
workspace_id + source_system + idempotency_key
```

Ledger subkeys often: `{idempotencyKey}:earn` / `:redeem` / `:batch`.

POS must pass stable **sale_id** / idempotency key shared with SKUMS sale.

### 5.2 Commit payload (conceptual)

Include at least:

- `workspaceId` (CRM workspace when durable)  
- `memberId` / `member_ref`  
- `saleId`, `idempotencyKey`  
- `policyVersionId`, `assignmentId`  
- eligible spend, points earned, points redeemed, dens used  
- optional SKUMS quote/reservation ids  
- voucher / reward refs  

### 5.3 Reversal

- Payment failed after reward commit → reverse with reason `payment_failed`  
- Transaction void → reverse with reason `transaction_void`  
- Points restored only via reverse path after commit  

---

## 6. Demo members (live wire smoke)

| Lookup | Expectation (demo graph) |
|--------|---------------------------|
| Member **FRAN-0001** / **FRAN1001** | Ava Tan |
| Phone **81234470** | same |
| Tier | **F3**, high points (~18420 in demos) |

Unauthenticated POS `format=pos` may return **demo FWB bundle** so the wire works without JWT. Durable ledger needs CRM Supabase + workspaceId + service path.

---

## 7. Campaigns vs base policy (simulator extension)

| Layer | Change rate | Who | Simulator default |
|-------|-------------|-----|-------------------|
| **L-base FWB** | Rare | Eng + ops | Always on |
| **Campaigns** | Frequent | Marketer + LLM | Optional overlays |

**Airlock (production intent):** draft → **simulate implications** → propose → human/admin publish → runtime loads only live, in-window, non-killed, sim≠red rules.

Closed campaign kinds and full implication simulator (**L-kinds / L-sim**) are **not fully built** — a new simulator agent can own this surface first.

Campaign adds feed `campaignAdds[]` in the earn formula (additive).

---

## 8. API map (integration tests)

### Via SKUMS (POS key)

| Purpose | Path |
|---------|------|
| Readiness | `GET /fran/pos/capabilities` |
| Policy | `GET /fran/pos/loyalty/policy/active` |
| Member | `POST /fran/pos/loyalty/member/resolve` |
| Session | `POST /fran/pos/loyalty/counter-session` |
| Commit | `POST /fran/pos/loyalty/commit-sale` |
| Vouchers | `POST /fran/pos/loyalty/vouchers/*` |
| Commerce | `/fran/pos/basket/quote`, reservations, sales |

### CRM direct (dev / facade target)

| Purpose | Path |
|---------|------|
| Active policy | `GET /api/fran/loyalty/policy-versions/active` |
| Commit | `POST /fran/pos/loyalty/commit-sale` |
| Member / session | `POST /fran/pos/member/resolve`, `…/counter-session` |

POS production should prefer **SKUMS facade**, not browser CRM URL.

---

## 9. Pure functions to re-use or re-implement in a simulator

Prefer copying golden behavior from:

| Function | Location | Behavior |
|----------|----------|----------|
| `computeFwbEarnPoints` | `fran-pos/.../fwb-earn.ts` | floor(spend × sum rates) |
| `fwbTierRateFromKey` | same | F1/F2/F3 mapping |
| `bestFwbRedeemDenom` / `fwbRedeemOptions` | same | fixed dens table |
| `fwbCalendarYearWindow` | same | YTD window |
| CRM `fwb-engine.ts` | fran-crm | ledger settle + batches + expiry |

**Simulator must pass the same golden cases as**  
`fran-pos/tests/fwb-loyalty-evaluator.test.mjs` and CRM FWB engine tests.

---

## 10. Suggested simulator design (for the other agent)

### 10.1 Goals

1. **Offline-first:** pure FWB constitution without network.  
2. **Scenario packs:** member tier × bday × cat × campaign × dens.  
3. **Optional live mode:** hit CRM or SKUMS facade with demo member.  
4. **Implication mode (stretch):** propose a campaign add → recompute liability / stack vs base.  

### 10.2 Core state

```text
Member {
  memberRef, tierKey, pointsBalance,
  calendarYtdSpend, birthdayMonth?, openBatches[]
}
Basket {
  lines[{ sku, qty, unitPrice, categoryKey? }],
  discounts[], eligibleSpend
}
Policy {
  programKey, versionId, tiers, redeemDens,
  earnFormula: 'additive_fwb_v2'
}
Session {
  mode: member|non_member|tourist,
  birthdayActive, categoryActive, campaignAdds[],
  selectedRedeemDens?
}
```

### 10.3 Steps API (logical)

1. `setMember(fixture | liveResolve)`  
2. `setBasket(lines)` → `eligibleSpend`  
3. `toggleBirthday / toggleCategory / setCampaignAdds`  
4. `previewEarn()` → points + breakdown  
5. `listRedeemOptions()` / `selectDens(points)`  
6. `simulatePay()` → net tender, points after earn-redeem  
7. `commit(idempotencyKey)` → ledger events (sim or live)  
8. `reverse(commitId)`  

### 10.4 Output report (for agents)

- Earn breakdown (tier/bday/cat/campaign/floor)  
- Redeem dens chosen and residual points  
- New balance, theoretical YTD after sale  
- Warnings (insufficient points, loyalty optional, non-member)  
- If campaign proposed: delta liability = extra points × value_per_point  

### 10.5 Anti-goals

- Do **not** recompute retail price from loyalty (SKUMS prices).  
- Do **not** invent arbitrary redeem rates outside dens table.  
- Do **not** use multiplicative “triple stack” of rates.  
- Do **not** require CRM to price the basket.  

---

## 11. Worked end-to-end example

**Member:** F2 (1.25), 800 pts, birthday active, no category.  
**Basket eligible spend:** $80.  
**Redeem:** 500 pts → $20 off (apply per product rules; earn usually on post-discount eligible spend — keep sim parameterizable).

Assume earn on $80 (no change from redeem for simplicity):

```text
multiplier = 1.25 + 1.00 = 2.25
earn = floor(80 × 2.25) = 180
redeem = 500
balance_after = 800 - 500 + 180 = 480
```

If earn is post-redeem on net $60:

```text
earn = floor(60 × 2.25) = 135
balance_after = 800 - 500 + 135 = 435
```

**Simulator should expose `earnBasis: pre_redeem | post_redeem`** and document which matches live POS evaluator for the scenario pack.

---

## 12. Implementation status snapshot (honest)

| Area | Status |
|------|--------|
| FWB earn/redeem pure math | **Shipped** (POS + CRM golden tests) |
| Policy versions + active format=pos | **Shipped** |
| POS SKUMS-first loyalty facade | **Shipped** (M1–M4) |
| commit_sale durable ledger | **Shipped** when workspaceId + service role |
| Demo member graph | **Shipped** (FRAN-0001); real people resolve incomplete |
| Voucher dens QR + scan | **Partial** (demo codes work) |
| Campaign kinds + implication simulator | **Not started** (good simulator agent target) |
| Jan 1 tier job | **Not started** |
| MCP campaign airlock | **Not started** |

---

## 13. Quick reference constants (copy into sim)

```js
const FWB_TIER_RATES = { F1: 1.0, F2: 1.25, F3: 1.5 }
const FWB_TIER_THRESHOLDS = [
  { key: 'F1', annualSpendThreshold: 0 },
  { key: 'F2', annualSpendThreshold: 500 },
  { key: 'F3', annualSpendThreshold: 1250 },
]
const FWB_REDEEM_DENOMS = [
  { points: 200, discount: 6 },
  { points: 500, discount: 20 },
  { points: 1000, discount: 50 },
  { points: 1500, discount: 90 },
  { points: 2500, discount: 175 },
]
// earn: floor(spend * (tierRate + (bday?1:0) + (cat?1:0) + sum(campaignAdds)))
```

---

## 14. Related deep links

- Architecture: `docs/LOYALTY_FWB_ARCHITECTURE.md`  
- Connection: `docs/POS_CRM_SKUMS_CONNECTION_ARCHITECTURE.md`  
- Setup help (ops): Help slug `crm-pos-skums-setup`  
- CRM policy: `fran-crm/docs/fran-loyalty-policy.md`  
- POS contract: `fran-pos/docs/fran-pos-crm-skums-contract.md`  
- Live test: `fran-pos/docs/CRM_POS_LIVE_TEST.md`  

---

*End of brief. Simulators should treat §4 (constitution) as immutable defaults and §7 (campaigns) as the extension surface.*
