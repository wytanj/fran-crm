/**
 * Map CRM policy rules → Fran POS policy bundle shape
 * (dashboard/src/pos/fran/types.ts FranLoyaltyPolicyBundle).
 */
import {
  FWB_REDEEM_DENOMS,
  FWB_TIER_THRESHOLDS_SGD,
  fwbTierRateFromKey,
  normalizeFwbTierKey
} from './fwb-engine'
import { franLoyaltyV21Rules, type FranLoyaltyPolicyVersionRow } from './policy-versions'

export type PosPolicyCacheStatus = 'fresh' | 'stale' | 'offline_fallback'

export interface PosLoyaltyPolicyBundle {
  workspaceId: string
  programKey: string
  policyVersionId: string
  assignmentId: string
  label: string
  currency: string
  activeFrom: string
  publishedAt: string
  allowedTtlSeconds: number
  cache: {
    status: PosPolicyCacheStatus
    cacheKey: string
    cachedAt: string
    staleAt: string
  }
  earn: {
    basis: 'pre_discount' | 'post_discount'
    pointsPerCurrencyUnit: number
    rounding: 'floor' | 'round' | 'ceil'
    minimumEligibleAmount: number
    excludedRestrictedFlags: string[]
  }
  tiers: Array<{
    key: string
    label: string
    annualSpendThreshold: number
    earnMultiplier: number
    sortOrder: number
  }>
  redemption: {
    minimumPoints: number
    maximumPointsPerBasket: number | null
    pointsToCurrencyRate: number
    requiresLiveQuote: boolean
    fixedDenominations: Array<{ points: number, discount: number }>
  }
  bonuses: {
    birthdayMultiplier: number
    checkInPoints: number
    birthdayRequiresVoucher: boolean
    categoryRequiresVoucher: boolean
    categoryMultipliers: Array<{
      ruleId: string
      category: string
      label: string
      multiplier: number
      minimumSpend: number
    }>
    campaignMultipliers: Array<{
      ruleId: string
      code: string
      label: string
      multiplier: number
      minimumSpend: number
      skuPrefixes: string[]
    }>
  }
  expiry: {
    lookaheadDays: number
    defaultMonths: number
  }
  rewards: Array<Record<string, unknown>>
  warnings: string[]
}

function rulesTiers(rules: Record<string, unknown>) {
  const tiers = Array.isArray(rules.tiers) ? rules.tiers : franLoyaltyV21Rules.tiers
  return tiers.map((raw: any, index: number) => {
    const keyRaw = String(raw.key || raw.tier || `tier_${index + 1}`)
    const normalized = normalizeFwbTierKey(keyRaw)
    const fallback = FWB_TIER_THRESHOLDS_SGD[index] || FWB_TIER_THRESHOLDS_SGD[0]!
    const key = normalized && normalized !== 'Tourist' ? normalized : fallback.key
    const thresholdMinor = Number(raw.spendThresholdMinor)
    const annualSpendThreshold = Number.isFinite(thresholdMinor)
      ? thresholdMinor / 100
      : Number(raw.annualSpendThreshold ?? fallback.annualSpend)
    return {
      key,
      label: String(raw.label || fallback.label),
      annualSpendThreshold,
      earnMultiplier: Number(raw.earnMultiplier ?? fwbTierRateFromKey(key)),
      sortOrder: Number(raw.rank ?? raw.sortOrder ?? index)
    }
  })
}

/**
 * Build POS-loadable policy bundle from CRM active policy version.
 */
export function buildPosLoyaltyPolicyBundle(opts: {
  workspaceId: string
  programKey: string
  policyVersion: {
    id: string
    versionLabel?: string
    version_label?: string
    rules?: Record<string, unknown>
    publishedAt?: string | null
    published_at?: string | null
    effectiveFrom?: string | null
    effective_from?: string | null
  }
  assignmentId?: string | null
  allowedTtlSeconds?: number
}): PosLoyaltyPolicyBundle {
  const rules = (opts.policyVersion.rules || franLoyaltyV21Rules) as Record<string, unknown>
  const currency = String((rules as any).currency || 'SGD')
  const now = new Date()
  const cachedAt = now.toISOString()
  const ttl = opts.allowedTtlSeconds ?? 24 * 60 * 60
  const policyVersionId = opts.policyVersion.id
  const assignmentId = opts.assignmentId || `default:${policyVersionId}`
  const label =
    opts.policyVersion.versionLabel ||
    opts.policyVersion.version_label ||
    "Fran's With Benefits"
  const publishedAt =
    opts.policyVersion.publishedAt ||
    opts.policyVersion.published_at ||
    cachedAt
  const activeFrom =
    opts.policyVersion.effectiveFrom ||
    opts.policyVersion.effective_from ||
    publishedAt

  const densFromRules = (rules as any).redemption?.brackets
  let fixedDenominations = FWB_REDEEM_DENOMS.map((d) => ({ points: d.points, discount: d.discount }))
  if (Array.isArray(densFromRules) && densFromRules.length) {
    const mapped = densFromRules.map((b: any) => {
      const points = Number(b.points)
      const major = Number(b.discount)
      const minor = Number(b.discountMinor ?? b.discount_minor ?? b.rewardMinor ?? b.reward_minor)
      let discount = 0
      if (Number.isFinite(major) && major > 0) discount = major
      else if (Number.isFinite(minor) && minor > 0) discount = minor / 100
      return { points, discount }
    })
    if (mapped.every((d: { points: number, discount: number }) => d.points > 0 && d.discount > 0)) {
      fixedDenominations = mapped
    }
  }

  const minPoints = fixedDenominations.reduce(
    (m: number, d: { points: number }) => Math.min(m, d.points),
    fixedDenominations[0]?.points ?? 200
  )

  return {
    workspaceId: opts.workspaceId,
    programKey: opts.programKey,
    policyVersionId,
    assignmentId,
    label,
    currency,
    activeFrom,
    publishedAt,
    allowedTtlSeconds: ttl,
    cache: {
      status: 'fresh',
      cacheKey: `${opts.workspaceId}:${opts.programKey}:${policyVersionId}:${assignmentId}`,
      cachedAt,
      staleAt: new Date(now.getTime() + ttl * 1000).toISOString()
    },
    earn: {
      basis: 'post_discount',
      pointsPerCurrencyUnit: 1,
      rounding: 'floor',
      minimumEligibleAmount: 0,
      excludedRestrictedFlags: ['no_loyalty_earn']
    },
    tiers: rulesTiers(rules).length ? rulesTiers(rules) : FWB_TIER_THRESHOLDS_SGD.map((t) => ({
      key: t.key,
      label: t.label,
      annualSpendThreshold: t.annualSpend,
      earnMultiplier: t.earnRate,
      sortOrder: t.sortOrder
    })),
    redemption: {
      minimumPoints: minPoints,
      maximumPointsPerBasket: null,
      pointsToCurrencyRate: fixedDenominations[0]
        ? fixedDenominations[0].discount / fixedDenominations[0].points
        : 0.03,
      requiresLiveQuote: true,
      fixedDenominations
    },
    bonuses: {
      birthdayMultiplier: 2,
      checkInPoints: 0,
      birthdayRequiresVoucher: true,
      categoryRequiresVoucher: true,
      categoryMultipliers: [
        {
          ruleId: 'category-bonus-default',
          category: 'Skincare',
          label: 'Category bonus (+1.00)',
          multiplier: 2,
          minimumSpend: 0
        }
      ],
      campaignMultipliers: []
    },
    expiry: {
      lookaheadDays: 30,
      defaultMonths: 12
    },
    rewards: Array.isArray((rules as any).rewards) ? (rules as any).rewards : [],
    warnings: []
  }
}

export function buildDemoPosPolicyBundle(workspaceId = 'demo', programKey = 'fran_with_benefits') {
  return buildPosLoyaltyPolicyBundle({
    workspaceId,
    programKey,
    policyVersion: {
      id: 'demo_fran_loyalty_policy_v2_1',
      versionLabel: "Fran's With Benefits v2.1",
      rules: franLoyaltyV21Rules as unknown as Record<string, unknown>,
      publishedAt: '2026-07-08T00:00:00.000Z',
      effectiveFrom: '2026-07-08T00:00:00.000Z'
    },
    assignmentId: 'demo_fran_loyalty_assignment_default'
  })
}

export function posBundleFromPolicyVersionRow(
  workspaceId: string,
  programKey: string,
  row: FranLoyaltyPolicyVersionRow | ReturnType<typeof import('./policy-versions').normalizePolicyVersionRow>,
  assignmentId?: string | null
) {
  const isSnake = 'version_key' in (row as any)
  return buildPosLoyaltyPolicyBundle({
    workspaceId,
    programKey,
    policyVersion: isSnake
      ? {
          id: (row as FranLoyaltyPolicyVersionRow).id,
          version_label: (row as FranLoyaltyPolicyVersionRow).version_label,
          rules: (row as FranLoyaltyPolicyVersionRow).rules,
          published_at: (row as FranLoyaltyPolicyVersionRow).published_at,
          effective_from: (row as FranLoyaltyPolicyVersionRow).effective_from
        }
      : {
          id: (row as any).id,
          versionLabel: (row as any).versionLabel,
          rules: (row as any).rules,
          publishedAt: (row as any).publishedAt,
          effectiveFrom: (row as any).effectiveFrom
        },
    assignmentId
  })
}
