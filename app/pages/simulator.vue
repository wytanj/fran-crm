<script setup lang="ts">
import { CircleAlert, CircleCheck, CircleDashed, FlaskConical } from '@lucide/vue'
import { FWB_REDEEM_DENOMS, type FwbTierKey } from '#shared/fwb/constitution'
import { SCENARIO_GROUPS, SCENARIOS, scenariosInGroup, type Scenario } from '#shared/fwb/scenarios'
import { runSimulation, type EarnBasis, type SessionMode, type SimInput } from '#shared/fwb/simulate'

// Deliberately public: the simulator reads no workspace data and commits nothing,
// so it stays reachable without signing in.

const selectedId = ref(SCENARIOS[0]!.id)
const selected = computed<Scenario>(() => SCENARIOS.find((s) => s.id === selectedId.value) || SCENARIOS[0]!)

/** Editable copy of the scenario so the tour is a starting point, not a cage. */
const working = ref<SimInput>(structuredClone(toRaw(selected.value.input)))
const dirty = ref(false)

watch(selected, (scenario) => {
  working.value = structuredClone(toRaw(scenario.input))
  dirty.value = false
})

function touch() {
  dirty.value = true
}

function resetScenario() {
  working.value = structuredClone(toRaw(selected.value.input))
  dirty.value = false
}

const report = computed(() => runSimulation(working.value))

const tierOptions: FwbTierKey[] = ['F1', 'F2', 'F3']
const modeOptions: Array<{ value: SessionMode, label: string }> = [
  { value: 'member', label: 'Member' },
  { value: 'non_member', label: 'Non-member' },
  { value: 'tourist', label: 'Tourist' }
]
const basisOptions: Array<{ value: EarnBasis, label: string }> = [
  { value: 'pre_redeem', label: 'Before discount' },
  { value: 'post_redeem', label: 'After discount' }
]

/** `occurredAt` drives campaign windows, so the date control is a real lever. */
const saleDate = computed({
  get: () => working.value.occurredAt.slice(0, 10),
  set: (value: string) => {
    if (!value) return
    working.value.occurredAt = `${value}T10:00:00.000Z`
    touch()
  }
})

const redeemSelection = computed({
  get: () => working.value.redeemPoints ?? 0,
  set: (value: number) => {
    working.value.redeemPoints = Number(value) > 0 ? Number(value) : null
    touch()
  }
})

const matchesExpectation = computed(() =>
  !dirty.value
  && report.value.earn.points === selected.value.expect.points
  && report.value.settlement.balanceAfter === selected.value.expect.balanceAfter
)

function money(value: number) {
  return new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' }).format(value)
}

function num(value: number) {
  return new Intl.NumberFormat('en-US').format(value)
}

function rate(value: number) {
  return value.toFixed(2)
}

/** Width share of one multiplier component, floored so thin slices stay visible. */
function partWidth(value: number) {
  const total = report.value.earn.totalMultiplier
  if (total <= 0) return 0
  return Math.max(6, (value / total) * 100)
}

const findings = [
  {
    title: 'The POS bundle describes additive adds as multipliers',
    impact: 'correctness',
    impactLabel: 'Correctness',
    body: 'The policy bundle sent to registers carries `bonuses.birthdayMultiplier: 2` and `categoryMultipliers[].multiplier: 2`, but the engine adds +1.00 to the rate. A register that reads those fields by their names multiplies instead of adding: a Tier 3 birthday basket of $100 becomes 1.5 × 2 = 300 points rather than the correct 1.5 + 1 = 250, and the Tier 2 birthday-plus-category case in this pack becomes 1.25 × 2 × 2 = 500 rather than 325. Renaming them to `birthdayAdd` / `categoryAdd` with value 1.00 would make the wire format say what the math actually does.',
    where: 'server/fran/loyalty/pos-policy-bundle.ts:203-215'
  },
  {
    title: 'Campaign adds are silently dropped on settlement',
    impact: 'correctness',
    impactLabel: 'Correctness',
    body: '`settleFwbSale` recomputes points when the caller omits `pointsEarned`, but its call to `computeFwbEarnPoints` passes only tier, birthday and category — never `campaignAdds`. Any commit that trusts the engine to recompute loses every live campaign. This simulator sidesteps it by always passing `pointsEarned` explicitly, which is also what POS does, so the gap stays invisible until something else relies on the recompute path.',
    where: 'shared/fwb/constitution.ts — settleFwbSale earn recompute'
  },
  {
    title: 'Over-redemption is clamped instead of rejected',
    impact: 'guardrail',
    impactLabel: 'Guardrail',
    body: 'Asking to redeem more points than the member holds logs a warning and quietly reduces the redemption to the available balance. Because denominations are fixed, a clamp hands over a discount the member did not have the points for — 900 points requested against a 700 balance still books the redeem leg. Rejecting is the safer default; the simulator refuses it at the counter layer before the engine ever sees it.',
    where: 'shared/fwb/constitution.ts — settleFwbSale redeem clamp'
  },
  {
    title: 'Non-denomination redemptions are recorded anyway',
    impact: 'guardrail',
    impactLabel: 'Guardrail',
    body: 'A request for 750 points fails `isValidFwbRedeemDenom`, adds a warning, and then books as an "adjust-style redeem". That is the one thing the brief\'s anti-goals rule out — inventing a conversion outside the fixed table. It should be a hard error at the ledger boundary, not a note attached to a committed entry.',
    where: 'shared/fwb/constitution.ts — settleFwbSale denomination check'
  },
  {
    title: 'Nothing caps how far campaigns can stack',
    impact: 'guardrail',
    impactLabel: 'Guardrail',
    body: 'Campaign adds are summed with no ceiling, and the bundle\'s `maximumPointsPerBasket` is null and unenforced. Three concurrent +1.00 campaigns put a Tier 3 member at 4.50× — the "Three campaigns at once" scenario shows a $100 basket paying 400 points, roughly $28 of liability. Before marketers can self-serve campaigns, the policy needs a maximum total multiplier and a per-basket points cap.',
    where: 'server/fran/loyalty/pos-policy-bundle.ts — redemption.maximumPointsPerBasket'
  },
  {
    title: 'Earn basis is a policy decision with no policy field',
    impact: 'correctness',
    impactLabel: 'Correctness',
    body: 'The bundle hardcodes `earn.basis: "post_discount"`, which describes SKUMS markdowns — it says nothing about whether the points discount itself reduces the earning base. The two answers differ by 45 points on the brief\'s own worked example, and the simulator exposes both. Until one is written into the policy version, POS preview and CRM settlement can disagree without either being wrong.',
    where: 'server/fran/loyalty/pos-policy-bundle.ts:179-185'
  },
  {
    title: 'Calendar YTD never resets at the year boundary',
    impact: 'correctness',
    impactLabel: 'Correctness',
    body: 'Tier is derived from `calendarYtdSpend`, which only ever accumulates — settlement adds to it and nothing subtracts. Tiers are defined on a calendar year, so without a 1 Jan reset every member ratchets permanently upward and the Jan 1 job in the brief has nothing to downgrade. `applyJan1ExpiryOnTierDrop` exists for the expiry half; the spend-window half is missing.',
    where: 'shared/fwb/constitution.ts — settleFwbSale YTD accumulation'
  },
  {
    title: 'Expiry freeze is captured at earn time, not current tier',
    impact: 'clarity',
    impactLabel: 'Clarity',
    body: 'A batch records `frozen` from the tier the member held when the points were earned. The constitution says F2/F3 freeze the clock *while in tier*, which is a property of the member today, not of the batch\'s birthday. A member upgrading F1 → F2 in March leaves January\'s batches unfrozen until the next Jan 1 pass rewrites them.',
    where: 'shared/fwb/constitution.ts — settleFwbSale batch freeze'
  }
]
</script>

<template>
  <div class="page-stack">
    <div class="intro-strip">
      <div>
        <p class="eyebrow">Fran's With Benefits</p>
        <h2>Loyalty policy simulator</h2>
        <p>
          Every rule in the FWB constitution as a counter scenario you can change. It runs the same
          engine the CRM ledger settles with, entirely in the browser — nothing is saved and no sale is committed.
        </p>
      </div>
      <FlaskConical :size="24" />
    </div>

    <section class="sim-layout">
      <aside class="settings-panel scenario-picker" aria-label="Scenarios">
        <div class="section-heading compact-heading">
          <div>
            <p class="eyebrow">Scenarios</p>
            <h2>Guided tour</h2>
          </div>
        </div>

        <div v-for="group in SCENARIO_GROUPS" :key="group.key" class="scenario-group">
          <h3>{{ group.label }}</h3>
          <p>{{ group.blurb }}</p>
          <button
            v-for="scenario in scenariosInGroup(group.key)"
            :key="scenario.id"
            type="button"
            class="scenario-item"
            :class="{ active: scenario.id === selectedId }"
            :aria-current="scenario.id === selectedId ? 'true' : undefined"
            @click="selectedId = scenario.id"
          >
            {{ scenario.title }}
          </button>
        </div>
      </aside>

      <div class="sim-main">
        <div class="teach-panel">
          <h2>{{ selected.title }}</h2>
          <p>{{ selected.teaches }}</p>
          <cite>{{ selected.reference }}</cite>
        </div>

        <!-- Counter inputs ------------------------------------------------ -->
        <section class="settings-panel">
          <div class="section-heading compact-heading">
            <div>
              <p class="eyebrow">Counter inputs</p>
              <h2>Change anything</h2>
            </div>
            <button v-if="dirty" type="button" class="secondary-button" @click="resetScenario">
              Reset scenario
            </button>
          </div>

          <div class="sim-control-grid">
            <label class="sim-field sim-field-wide">
              <span>Session mode</span>
              <div class="segmented-control">
                <button
                  v-for="option in modeOptions"
                  :key="option.value"
                  type="button"
                  :class="{ active: working.mode === option.value }"
                  @click="working.mode = option.value; touch()"
                >
                  {{ option.label }}
                </button>
              </div>
            </label>

            <label class="sim-field">
              <span>Tier</span>
              <div class="segmented-control">
                <button
                  v-for="tier in tierOptions"
                  :key="tier"
                  type="button"
                  :class="{ active: working.member.tierKey === tier }"
                  @click="working.member.tierKey = tier; touch()"
                >
                  {{ tier }}
                </button>
              </div>
            </label>

            <label class="sim-field">
              <span>Basket total (SGD)</span>
              <input v-model.number="working.basket.grossSpend" type="number" min="0" step="0.01" @input="touch">
            </label>

            <label class="sim-field">
              <span>SKUMS markdown</span>
              <input v-model.number="working.basket.lineDiscount" type="number" min="0" step="0.01" @input="touch">
            </label>

            <label class="sim-field">
              <span>Points balance</span>
              <input v-model.number="working.member.pointsBalance" type="number" min="0" step="50" @input="touch">
            </label>

            <label class="sim-field">
              <span>Calendar YTD spend</span>
              <input v-model.number="working.member.calendarYtdSpend" type="number" min="0" step="10" @input="touch">
            </label>

            <label class="sim-field">
              <span>Redeem denomination</span>
              <select v-model.number="redeemSelection">
                <option :value="0">None</option>
                <option v-for="den in FWB_REDEEM_DENOMS" :key="den.points" :value="den.points">
                  {{ num(den.points) }} pts → {{ money(den.discount) }} off
                </option>
              </select>
            </label>

            <label class="sim-field">
              <span>Sale date</span>
              <input v-model="saleDate" type="date">
            </label>

            <label class="sim-field sim-field-wide">
              <span>Earn on spend</span>
              <div class="segmented-control">
                <button
                  v-for="option in basisOptions"
                  :key="option.value"
                  type="button"
                  :class="{ active: working.earnBasis === option.value }"
                  @click="working.earnBasis = option.value; touch()"
                >
                  {{ option.label }}
                </button>
              </div>
            </label>

            <div class="sim-field">
              <span>Vouchers scanned</span>
              <div class="toggle-row">
                <div class="choice-row">
                  <button
                    type="button"
                    :class="{ active: working.birthdayVoucher }"
                    @click="working.birthdayVoucher = !working.birthdayVoucher; touch()"
                  >
                    Birthday
                  </button>
                  <button
                    type="button"
                    :class="{ active: working.categoryVoucher }"
                    @click="working.categoryVoucher = !working.categoryVoucher; touch()"
                  >
                    Category
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Earn ---------------------------------------------------------- -->
        <section class="settings-panel">
          <div class="section-heading compact-heading">
            <div>
              <p class="eyebrow">Earn</p>
              <h2>How the multiplier is built</h2>
            </div>
            <span v-if="matchesExpectation" class="status-pill">Matches expected result</span>
          </div>

          <div class="sim-headline">
            <strong>{{ num(report.earn.points) }} pts</strong>
            <span>at {{ rate(report.earn.totalMultiplier) }}× on {{ money(report.spend.earnBasisSpend) }}</span>
          </div>

          <div v-if="report.multiplierParts.length" class="multiplier-bar" role="img"
               :aria-label="`Multiplier ${rate(report.earn.totalMultiplier)} made of ${report.multiplierParts.map((p) => `${p.label} ${rate(p.value)}`).join(', ')}`">
            <i
              v-for="(part, index) in report.multiplierParts"
              :key="`${part.key}-${index}`"
              :class="`part-${part.key}`"
              :style="{ width: `${partWidth(part.value)}%` }"
            >{{ rate(part.value) }}</i>
          </div>
          <p v-else class="muted-text">No multiplier — this session cannot earn.</p>

          <div v-if="report.multiplierParts.length" class="multiplier-legend">
            <span v-for="(part, index) in report.multiplierParts" :key="`legend-${part.key}-${index}`">
              <i :class="`part-${part.key}`" />
              {{ part.label }} <b>+{{ rate(part.value) }}</b>
            </span>
          </div>

          <div class="sim-formula">
            floor( <b>{{ money(report.spend.earnBasisSpend) }}</b> ×
            ( {{ report.multiplierParts.map((p) => rate(p.value)).join(' + ') || '0.00' }} ) )
            = <b>{{ num(report.earn.points) }}</b> pts
          </div>

          <p class="muted-text">
            Basket {{ money(report.spend.gross) }} − markdown {{ money(report.spend.lineDiscount) }}
            = {{ money(report.spend.eligible) }} eligible.
            <template v-if="working.earnBasis === 'post_redeem' && report.redeem.discount > 0">
              Earning after the {{ money(report.redeem.discount) }} points discount, so
              {{ money(report.spend.earnBasisSpend) }} is multiplied.
            </template>
            <template v-else>
              Earning before any points discount, so the full eligible amount is multiplied.
            </template>
          </p>
        </section>

        <!-- Campaigns ----------------------------------------------------- -->
        <section v-if="report.campaigns.length" class="settings-panel">
          <div class="section-heading compact-heading">
            <div>
              <p class="eyebrow">Campaigns</p>
              <h2>Live at {{ saleDate }}</h2>
            </div>
          </div>
          <div
            v-for="campaign in report.campaigns"
            :key="campaign.code"
            class="campaign-row"
            :class="{ 'is-dropped': !campaign.live }"
          >
            <CircleCheck v-if="campaign.live" :size="18" aria-hidden="true" />
            <CircleDashed v-else :size="18" aria-hidden="true" />
            <div>
              <strong>{{ campaign.label }}</strong>
              <small>{{ campaign.code }} — {{ campaign.reason }}</small>
            </div>
            <em>{{ campaign.live ? `+${rate(campaign.add)}` : 'not applied' }}</em>
          </div>
        </section>

        <!-- Redeem -------------------------------------------------------- -->
        <section class="settings-panel">
          <div class="section-heading compact-heading">
            <div>
              <p class="eyebrow">Redeem</p>
              <h2>Fixed denominations</h2>
            </div>
            <span class="status-pill">{{ num(report.settlement.balanceBefore) }} pts available</span>
          </div>

          <div class="data-table-wrap">
            <table class="dens-table">
              <thead>
                <tr>
                  <th>Points</th>
                  <th>Discount</th>
                  <th>Value per point</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="option in report.redeem.options"
                  :key="option.points"
                  :class="{
                    'is-locked': !option.affordable,
                    'is-selected': option.points === report.redeem.appliedPoints
                  }"
                >
                  <td>{{ num(option.points) }}</td>
                  <td>{{ money(option.discount) }}</td>
                  <td>{{ option.valuePerPoint.toFixed(3) }}</td>
                  <td>
                    <template v-if="option.points === report.redeem.appliedPoints">Applied</template>
                    <template v-else-if="!option.affordable">Not enough points</template>
                    <template v-else-if="option.best">Best affordable</template>
                    <template v-else>Affordable</template>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p class="muted-text">
            Conversion improves as denominations rise: 200 pts returns
            {{ (6 / 200).toFixed(3) }} per point, 2500 pts returns {{ (175 / 2500).toFixed(3) }}.
            Holding points for a larger denomination is always worth more.
          </p>
        </section>

        <!-- Settlement ---------------------------------------------------- -->
        <section class="settings-panel">
          <div class="section-heading compact-heading">
            <div>
              <p class="eyebrow">After payment</p>
              <h2>What the ledger records</h2>
            </div>
          </div>

          <div class="sim-stat-grid">
            <div class="sim-stat">
              <span>Customer pays</span>
              <strong>{{ money(report.tender.net) }}</strong>
              <small v-if="report.redeem.discount > 0">{{ money(report.redeem.discount) }} off</small>
              <small v-else>No points discount</small>
            </div>
            <div class="sim-stat">
              <span>Points earned</span>
              <strong>+{{ num(report.settlement.pointsEarned) }}</strong>
              <small>{{ rate(report.earn.totalMultiplier) }}× multiplier</small>
            </div>
            <div class="sim-stat">
              <span>Points redeemed</span>
              <strong>{{ report.settlement.pointsRedeemed ? `−${num(report.settlement.pointsRedeemed)}` : '0' }}</strong>
              <small>{{ report.redeem.appliedPoints ? 'Fixed denomination' : 'None applied' }}</small>
            </div>
            <div class="sim-stat">
              <span>New balance</span>
              <strong>{{ num(report.settlement.balanceAfter) }}</strong>
              <small>was {{ num(report.settlement.balanceBefore) }}</small>
            </div>
            <div class="sim-stat" :class="{ 'is-changed': report.settlement.tierChanged }">
              <span>Tier</span>
              <strong>{{ report.settlement.tierAfter }}</strong>
              <small v-if="report.settlement.tierChanged">up from {{ report.settlement.tierBefore }}</small>
              <small v-else>unchanged</small>
            </div>
            <div class="sim-stat">
              <span>Calendar YTD</span>
              <strong>{{ money(report.settlement.ytdAfter) }}</strong>
              <small>was {{ money(report.settlement.ytdBefore) }}</small>
            </div>
            <div class="sim-stat">
              <span>Liability</span>
              <strong>{{ money(report.liability.after) }}</strong>
              <small>{{ report.liability.delta >= 0 ? '+' : '' }}{{ money(report.liability.delta) }} this sale</small>
            </div>
            <div class="sim-stat">
              <span>Batch expiry</span>
              <strong>{{ report.settlement.earnBatch?.theoreticalExpiryDate || '—' }}</strong>
              <small v-if="report.settlement.earnBatch">
                {{ report.settlement.earnBatch.frozen ? 'Clock frozen in tier' : 'Clock running' }}
              </small>
              <small v-else>No batch created</small>
            </div>
          </div>

          <div class="sim-formula">
            {{ num(report.settlement.balanceBefore) }}
            − {{ num(report.settlement.pointsRedeemed) }}
            + {{ num(report.settlement.pointsEarned) }}
            = <b>{{ num(report.settlement.balanceAfter) }}</b> pts
          </div>

          <p class="muted-text">
            <template v-if="report.settlement.ledgerEntryIds.length">
              Ledger entries
              <template v-for="(id, index) in report.settlement.ledgerEntryIds" :key="id">
                <code>{{ id }}</code><template v-if="index < report.settlement.ledgerEntryIds.length - 1">, </template>
              </template>.
            </template>
            <template v-else>No ledger entries — this sale records nothing.</template>
            Replaying the same idempotency key returns the first result instead of double-crediting.
          </p>
        </section>

        <!-- Warnings ------------------------------------------------------ -->
        <section v-if="report.warnings.length" class="settings-panel">
          <div class="section-heading compact-heading">
            <div>
              <p class="eyebrow">Counter messages</p>
              <h2>What the cashier is told</h2>
            </div>
          </div>
          <div class="sim-warnings">
            <p v-for="warning in report.warnings" :key="warning" class="sim-warning">
              <CircleAlert :size="16" aria-hidden="true" />
              <span>{{ warning }}</span>
            </p>
          </div>
        </section>
      </div>
    </section>

    <!-- Findings -------------------------------------------------------- -->
    <section class="settings-panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Findings</p>
          <h2>Where the policy could be tightened</h2>
        </div>
      </div>
      <p class="muted-text">
        Gaps found while building these scenarios against the live engine. Nothing here is fixed — each
        one is a decision for whoever owns the constitution.
      </p>

      <div class="finding-list">
        <article v-for="finding in findings" :key="finding.title" class="finding">
          <div class="finding-head">
            <strong>{{ finding.title }}</strong>
            <span class="impact-pill" :class="`impact-${finding.impact}`">{{ finding.impactLabel }}</span>
          </div>
          <p>{{ finding.body }}</p>
          <p><code>{{ finding.where }}</code></p>
        </article>
      </div>
    </section>
  </div>
</template>
