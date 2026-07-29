/**
 * Scenario pack — one counter situation per aspect of the FWB constitution.
 *
 * Each scenario states what it teaches and what it should produce, so the pack
 * doubles as the simulator's guided tour and as golden test cases.
 */
import type { SimInput } from './simulate'

export type ScenarioGroup = 'earn' | 'redeem' | 'stacking' | 'lifecycle' | 'session'

export interface Scenario {
  id: string
  title: string
  group: ScenarioGroup
  /** The single rule this case exists to demonstrate. */
  teaches: string
  /** Section of the simulator brief this comes from. */
  reference: string
  input: SimInput
  /** Asserted in tests so the pack cannot drift from the engine. */
  expect: {
    points: number
    multiplier: number
    balanceAfter: number
    tierAfter?: string
    discount?: number
    netTender?: number
  }
}

export const SCENARIO_GROUPS: Array<{ key: ScenarioGroup, label: string, blurb: string }> = [
  { key: 'earn', label: 'Earning', blurb: 'How points are calculated from spend' },
  { key: 'redeem', label: 'Redeeming', blurb: 'Fixed denominations and what they are worth' },
  { key: 'stacking', label: 'Stacking', blurb: 'Vouchers and timed campaigns combined' },
  { key: 'lifecycle', label: 'Lifecycle', blurb: 'Tiers, expiry, and the year boundary' },
  { key: 'session', label: 'Session modes', blurb: 'Who is allowed to earn at all' }
]

const AT = '2026-07-29T10:00:00.000Z'

function member(over: Partial<SimInput['member']> = {}): SimInput['member'] {
  return {
    memberRef: 'FRAN-0001',
    tierKey: 'F1',
    pointsBalance: 0,
    calendarYtdSpend: 0,
    ...over
  }
}

function input(id: string, over: Partial<SimInput>): SimInput {
  return {
    mode: 'member',
    member: member(),
    basket: { grossSpend: 100, lineDiscount: 0 },
    birthdayVoucher: false,
    categoryVoucher: false,
    campaigns: [],
    redeemPoints: null,
    earnBasis: 'pre_redeem',
    occurredAt: AT,
    saleId: `sale-${id}`,
    idempotencyKey: `idem-${id}`,
    ...over
  }
}

export const SCENARIOS: Scenario[] = [
  // ---------------------------------------------------------------- earning
  {
    id: 'baseline-f1',
    title: 'Base member, $100 basket',
    group: 'earn',
    teaches: 'Tier 1 earns 1.00 point per eligible dollar. This is the floor every other case builds on.',
    reference: '§4.1 Tiers',
    input: input('baseline-f1', {}),
    expect: { points: 100, multiplier: 1, balanceAfter: 100, tierAfter: 'F1' }
  },
  {
    id: 'tier-ladder-f3',
    title: 'Same basket at Tier 3',
    group: 'earn',
    teaches: 'Only the tier rate changed (1.00 → 1.50), so the same $100 basket earns 150 instead of 100.',
    reference: '§4.1 Tiers',
    input: input('tier-ladder-f3', {
      member: member({ tierKey: 'F3', pointsBalance: 4000, calendarYtdSpend: 1400 })
    }),
    expect: { points: 150, multiplier: 1.5, balanceAfter: 4150, tierAfter: 'F3' }
  },
  {
    id: 'floor-rounding',
    title: 'Rounding on $99.99',
    group: 'earn',
    teaches: 'Points are floored after multiplying, never rounded up. $99.99 at 1.00 earns 99, not 100.',
    reference: '§4.2 Earn formula',
    input: input('floor-rounding', { basket: { grossSpend: 99.99, lineDiscount: 0 } }),
    expect: { points: 99, multiplier: 1, balanceAfter: 99 }
  },
  {
    id: 'line-discount',
    title: 'SKUMS markdown before loyalty',
    group: 'earn',
    teaches:
      'A $30 SKUMS markdown lands before loyalty sees the basket. Eligible spend is $70, so earn follows the discounted price — loyalty never re-prices the basket.',
    reference: '§10.5 Anti-goals',
    input: input('line-discount', {
      member: member({ tierKey: 'F2', calendarYtdSpend: 600 }),
      basket: { grossSpend: 100, lineDiscount: 30 }
    }),
    expect: { points: 87, multiplier: 1.25, balanceAfter: 87, tierAfter: 'F2' }
  },

  // --------------------------------------------------------------- stacking
  {
    id: 'birthday-voucher',
    title: 'Birthday voucher scanned',
    group: 'stacking',
    teaches: 'The birthday voucher adds +1.00 to the rate. Tier 1 becomes 2.00×, doubling the basket.',
    reference: '§4.5 Vouchers',
    input: input('birthday-voucher', { birthdayVoucher: true }),
    expect: { points: 200, multiplier: 2, balanceAfter: 200 }
  },
  {
    id: 'additive-not-multiplicative',
    title: 'Birthday + category on Tier 2',
    group: 'stacking',
    teaches:
      'The critical rule: adds are summed onto the rate, not multiplied. 1.25 + 1 + 1 = 3.25 gives 325 points. Multiplying (1.25 × 2 × 2 = 5.00) would wrongly pay 500.',
    reference: '§4.2 — "birthday and category are additive on the rate"',
    input: input('additive-not-multiplicative', {
      member: member({ tierKey: 'F2', pointsBalance: 300, calendarYtdSpend: 700 }),
      birthdayVoucher: true,
      categoryVoucher: true
    }),
    expect: { points: 325, multiplier: 3.25, balanceAfter: 625, tierAfter: 'F2' }
  },
  {
    id: 'voucher-plus-timed-campaign',
    title: 'Voucher stacked with a live campaign',
    group: 'stacking',
    teaches:
      'A live campaign adds on top of tier and voucher the same additive way: 1.50 + 1.00 category + 0.50 campaign = 3.00×.',
    reference: '§7 Campaigns',
    input: input('voucher-plus-timed-campaign', {
      member: member({ tierKey: 'F3', pointsBalance: 2000, calendarYtdSpend: 1800 }),
      categoryVoucher: true,
      campaigns: [
        {
          code: 'JULY-GLOW',
          label: 'July Glow Edit (+0.50)',
          add: 0.5,
          startsAt: '2026-07-01T00:00:00.000Z',
          endsAt: '2026-07-31T23:59:59.000Z'
        }
      ]
    }),
    expect: { points: 300, multiplier: 3, balanceAfter: 2300, tierAfter: 'F3' }
  },
  {
    id: 'campaign-window-expired',
    title: 'Expired campaign is ignored',
    group: 'stacking',
    teaches:
      'Campaigns are time-boxed. The June campaign ended before this sale, so only the live August one applies — the expired add is dropped, not silently counted.',
    reference: '§7 Campaign airlock',
    input: input('campaign-window-expired', {
      member: member({ tierKey: 'F2', calendarYtdSpend: 900 }),
      campaigns: [
        {
          code: 'JUNE-BOOST',
          label: 'June Boost (+1.00)',
          add: 1,
          startsAt: '2026-06-01T00:00:00.000Z',
          endsAt: '2026-06-30T23:59:59.000Z'
        },
        {
          code: 'ALWAYS-ON',
          label: 'Member week (+0.25)',
          add: 0.25
        }
      ]
    }),
    expect: { points: 150, multiplier: 1.5, balanceAfter: 150, tierAfter: 'F2' }
  },
  {
    id: 'campaign-stack-unbounded',
    title: 'Three campaigns at once',
    group: 'stacking',
    teaches:
      'Nothing in the constitution caps how many campaigns stack. Three live adds on Tier 3 reach 4.00×, paying 400 points on a $100 basket — worth a ceiling before marketers can self-serve.',
    reference: '§7 — campaign adds are additive with no stated limit',
    input: input('campaign-stack-unbounded', {
      member: member({ tierKey: 'F3', pointsBalance: 500, calendarYtdSpend: 2000 }),
      campaigns: [
        { code: 'C1', label: 'Weekend double (+1.00)', add: 1 },
        { code: 'C2', label: 'New launch (+1.00)', add: 1 },
        { code: 'C3', label: 'App exclusive (+0.50)', add: 0.5 }
      ]
    }),
    expect: { points: 400, multiplier: 4, balanceAfter: 900, tierAfter: 'F3' }
  },

  // -------------------------------------------------------------- redeeming
  {
    id: 'dens-best-affordable',
    title: 'Redeeming 500 points',
    group: 'redeem',
    teaches:
      '800 points can afford the 500 pt denomination for $20 off. The 1000 pt tier is out of reach, so $20 is the best available discount.',
    reference: '§4.3 Redeem denominations',
    input: input('dens-best-affordable', {
      member: member({ tierKey: 'F2', pointsBalance: 800, calendarYtdSpend: 600 }),
      basket: { grossSpend: 80, lineDiscount: 0 },
      birthdayVoucher: true,
      redeemPoints: 500
    }),
    expect: { points: 180, multiplier: 2.25, balanceAfter: 480, discount: 20, netTender: 60 }
  },
  {
    id: 'earn-basis-post-redeem',
    title: 'Same sale, earning after the discount',
    group: 'redeem',
    teaches:
      'The only change from the previous scenario is earn basis. Earning on the post-discount $60 pays 135 instead of 180 — a 45 point swing that POS and CRM must agree on.',
    reference: '§11 Worked example',
    input: input('earn-basis-post-redeem', {
      member: member({ tierKey: 'F2', pointsBalance: 800, calendarYtdSpend: 600 }),
      basket: { grossSpend: 80, lineDiscount: 0 },
      birthdayVoucher: true,
      redeemPoints: 500,
      earnBasis: 'post_redeem'
    }),
    expect: { points: 135, multiplier: 2.25, balanceAfter: 435, discount: 20, netTender: 60 }
  },
  {
    id: 'insufficient-points',
    title: 'Balance below the lowest denomination',
    group: 'redeem',
    teaches:
      '150 points cannot reach the 200 pt entry denomination, so no discount is possible. The sale still earns normally.',
    reference: '§4.3 — pick dens where balance ≥ dens.points',
    input: input('insufficient-points', {
      member: member({ pointsBalance: 150 }),
      redeemPoints: 200
    }),
    expect: { points: 100, multiplier: 1, balanceAfter: 250, discount: 0 }
  },
  {
    id: 'invalid-denomination',
    title: 'Cashier asks for 750 points',
    group: 'redeem',
    teaches:
      '750 is not in the table. FWB has no partial conversion — the request is rejected rather than converted at some invented rate.',
    reference: '§10.5 — do not invent redeem rates outside the dens table',
    input: input('invalid-denomination', {
      member: member({ tierKey: 'F2', pointsBalance: 900, calendarYtdSpend: 700 }),
      redeemPoints: 750
    }),
    expect: { points: 125, multiplier: 1.25, balanceAfter: 1025, discount: 0 }
  },

  // -------------------------------------------------------------- lifecycle
  {
    id: 'tier-crossing',
    title: 'Crossing into Tier 2 mid-sale',
    group: 'lifecycle',
    teaches:
      'This sale takes calendar YTD from $420 to $520, crossing the $500 threshold. It earns at the old 1.00 rate; the 1.25 rate applies from the next sale.',
    reference: '§4.1 — calendar year measurement',
    input: input('tier-crossing', {
      member: member({ tierKey: 'F1', pointsBalance: 400, calendarYtdSpend: 420 }),
      basket: { grossSpend: 100, lineDiscount: 0 }
    }),
    expect: { points: 100, multiplier: 1, balanceAfter: 500, tierAfter: 'F2' }
  },
  {
    id: 'expiry-freeze',
    title: 'Tier 2 freezes the expiry clock',
    group: 'lifecycle',
    teaches:
      'Points earned while F2 or F3 are stored frozen, so the 12-month expiry clock does not run while the member holds the tier.',
    reference: '§4.4 Points expiry',
    input: input('expiry-freeze', {
      member: member({ tierKey: 'F3', pointsBalance: 6000, calendarYtdSpend: 3000 }),
      basket: { grossSpend: 200, lineDiscount: 0 }
    }),
    expect: { points: 300, multiplier: 1.5, balanceAfter: 6300, tierAfter: 'F3' }
  },

  // ---------------------------------------------------------------- session
  {
    id: 'non-member',
    title: 'Non-member checkout',
    group: 'session',
    teaches:
      'An untagged shopper earns nothing and redeems nothing. The sale still completes; loyalty simply does not participate.',
    reference: '§2 Session modes',
    input: input('non-member', { mode: 'non_member', basket: { grossSpend: 250, lineDiscount: 0 } }),
    expect: { points: 0, multiplier: 0, balanceAfter: 0, tierAfter: 'F1' }
  },
  {
    id: 'tourist-with-balance',
    title: 'Tourist session on a member with points',
    group: 'session',
    teaches:
      'Tagging the session tourist suppresses earn and redeem even when the member has a large balance. Identity mode wins over account state.',
    reference: '§2 Session modes',
    input: input('tourist-with-balance', {
      mode: 'tourist',
      member: member({ tierKey: 'F3', pointsBalance: 18420, calendarYtdSpend: 2400 }),
      basket: { grossSpend: 300, lineDiscount: 0 },
      redeemPoints: 2500
    }),
    expect: { points: 0, multiplier: 0, balanceAfter: 18420, tierAfter: 'F3', discount: 0 }
  }
]

export function scenarioById(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id)
}

export function scenariosInGroup(group: ScenarioGroup): Scenario[] {
  return SCENARIOS.filter((s) => s.group === group)
}
