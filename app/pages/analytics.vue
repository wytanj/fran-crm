<script setup lang="ts">
import { Activity, ArrowDownRight, ArrowUpRight, BarChart3, CalendarDays, Download, Gift, Megaphone, TrendingUp, Users } from '@lucide/vue'
import type {
  CrmMetric,
  FranAnalyticsResponse,
  FranSignupBucket
} from '~/types/crm'

definePageMeta({
  middleware: 'authenticated-client'
})

const { refreshSession, session, startAuthListener, user } = useCrmAuth()
const { loadWorkspaces, primaryWorkspace, requiresSetup } = useCrmWorkspaceAccess()
const workspaceId = computed(() => primaryWorkspace.value?.id)
const signupBucket = ref<FranSignupBucket>('day')
const selectedRange = ref<'7d' | '30d' | '90d' | 'ytd'>('30d')
const topLimit = ref(10)
const atRiskDays = ref(60)
const lapsedFromDays = ref(90)
const lapsedToDays = ref(180)
const bucketOptions: Array<{ label: string, value: FranSignupBucket }> = [
  { label: 'Day', value: 'day' },
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' }
]
const rangeOptions: Array<{ label: string, value: '7d' | '30d' | '90d' | 'ytd' }> = [
  { label: '7D', value: '7d' },
  { label: '30D', value: '30d' },
  { label: '90D', value: '90d' },
  { label: 'YTD', value: 'ytd' }
]

const selectedDateRange = computed(() => {
  const to = utcToday()
  const from = new Date(to)

  if (selectedRange.value === 'ytd') {
    from.setUTCMonth(0, 1)
  } else {
    const days = selectedRange.value === '7d' ? 7 : selectedRange.value === '90d' ? 90 : 30
    from.setUTCDate(from.getUTCDate() - days + 1)
  }

  return {
    from: formatIsoDate(from),
    to: formatIsoDate(to)
  }
})

const { data: analytics, pending, refresh } = await useAsyncData('fran-analytics', async () => {
  const activeWorkspaceId = workspaceId.value
  const headers = activeWorkspaceId && session.value?.access_token
    ? { Authorization: `Bearer ${session.value.access_token}` }
    : undefined
  const query = {
    ...selectedDateRange.value,
    pointValueMinor: 1,
    expiryWindowDays: 30,
    topLimit: topLimit.value,
    atRiskDays: atRiskDays.value,
    lapsedFromDays: lapsedFromDays.value,
    lapsedToDays: lapsedToDays.value,
    ...(activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {})
  }

  return await $fetch<FranAnalyticsResponse>('/api/fran/analytics', {
    headers,
    query
  })
}, {
  watch: [workspaceId, selectedRange, topLimit, atRiskDays, lapsedFromDays, lapsedToDays]
})

const latestCycle = computed(() => {
  const cycles = analytics.value?.evaluationCycles || []
  return cycles[cycles.length - 1] || null
})

const metrics = computed<CrmMetric[]>(() => {
  const current = analytics.value
  const cycle = latestCycle.value

  return [
    {
      label: 'Members',
      value: formatNumber(current?.snapshot.totalMembers || 0),
      detail: 'Fran member profiles'
    },
    {
      label: 'Points issued',
      value: formatNumber(current?.loyaltyPoints.totalIssued || 0),
      detail: `${selectedDateRange.value.from} to ${selectedDateRange.value.to}`
    },
    {
      label: 'Points redeemed',
      value: formatNumber(current?.loyaltyPoints.totalRedeemed || 0),
      detail: current ? `${formatPercent(current.loyaltyPoints.redemptionRate)} redemption rate` : 'Date range total'
    },
    {
      label: 'Liability',
      value: formatMoneyMinor(current?.loyaltyPoints.liabilityMinor || 0),
      detail: cycle ? `${formatNumber(cycle.upgradedCount)} upgrades last cycle` : 'Outstanding points value'
    }
  ]
})

const signupChartPoints = computed(() => (analytics.value?.signupTrends[signupBucket.value] || []).map((point) => ({
  label: point.period,
  value: point.count
})))

const selectedSignupTotal = computed(() => signupChartPoints.value.reduce((sum, point) => sum + point.value, 0))
const customerAnalytics = computed(() => analytics.value?.customerAnalytics)
const pointsSeries = computed(() => {
  const trend = analytics.value?.loyaltyPoints.trend || []

  return [
    {
      label: 'Issued',
      color: '#0f766e',
      points: trend.map((point) => ({ label: point.period, value: point.issued }))
    },
    {
      label: 'Redeemed',
      color: '#c4563f',
      points: trend.map((point) => ({ label: point.period, value: point.redeemed }))
    }
  ]
})

const pointsCards = computed(() => {
  const points = analytics.value?.loyaltyPoints

  return [
    {
      label: 'Redemption rate',
      value: formatPercent(points?.redemptionRate || 0),
      detail: `${formatNumber(points?.totalRedeemed || 0)} / ${formatNumber(points?.totalIssued || 0)} pts`
    },
    {
      label: 'Outstanding points',
      value: formatNumber(points?.outstandingPoints || 0),
      detail: `${formatMoneyMinor(points?.pointValueMinor || 0)} per point`
    },
    {
      label: 'At-risk points',
      value: formatNumber(points?.expiringPoints || 0),
      detail: points?.nextExpiryDate ? `Next expiry ${points.nextExpiryDate}` : 'No expiry date in range'
    },
    {
      label: 'Members to notify',
      value: formatNumber(points?.expiringMemberCount || 0),
      detail: `${formatNumber(points?.expiryWindowDays || 30)} day window`
    }
  ]
})

const customerCards = computed(() => {
  const customer = customerAnalytics.value

  return [
    {
      label: 'Top list size',
      value: formatNumber(customer?.topLimit || topLimit.value),
      detail: 'Customers per export'
    },
    {
      label: 'At-risk customers',
      value: formatNumber(customer?.atRiskCustomers.length || 0),
      detail: `${formatNumber(customer?.atRiskDays || atRiskDays.value)} day threshold`
    },
    {
      label: 'Lapsed customers',
      value: formatNumber(customer?.lapsedCustomers.length || 0),
      detail: `${formatNumber(customer?.lapsedFromDays || lapsedFromDays.value)}-${formatNumber(customer?.lapsedToDays || lapsedToDays.value)} days`
    },
    {
      label: 'Birthday members',
      value: formatNumber(customer?.birthdayMembers.length || 0),
      detail: 'Current calendar month'
    }
  ]
})

onMounted(async () => {
  startAuthListener()
  await refreshSession()

  if (user.value) {
    await loadWorkspaces()
    await refresh()
  }
})

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value)
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

function formatMoneyMinor(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(value / 100)
}

function formatNullableDate(value: string | null) {
  return value ? value.slice(0, 10) : ''
}

function formatTier(value: string | null) {
  return value || ''
}

function exportTopSpenders(kind: 'lifetime' | 'trailing12Month') {
  const rows = kind === 'lifetime'
    ? customerAnalytics.value?.topSpenders.lifetime || []
    : customerAnalytics.value?.topSpenders.trailing12Month || []
  downloadCsv(`fran-${kind}-top-spenders.csv`, rows, [
    ['Name', (row) => row.name],
    ['Mobile', (row) => row.mobile || ''],
    ['Tier', (row) => row.tier || ''],
    ['Points balance', (row) => row.pointsBalance],
    ['Lifetime spend', (row) => formatMoneyMinor(row.lifetimeSpendMinor)],
    ['Trailing 12 month spend', (row) => formatMoneyMinor(row.trailing12MonthSpendMinor)],
    ['Last transaction', (row) => formatNullableDate(row.lastTransactionAt)]
  ])
}

function exportLifecycle(kind: 'at-risk' | 'lapsed') {
  const rows = kind === 'at-risk'
    ? customerAnalytics.value?.atRiskCustomers || []
    : customerAnalytics.value?.lapsedCustomers || []
  downloadCsv(`fran-${kind}-customers.csv`, rows, [
    ['Name', (row) => row.name],
    ['Mobile', (row) => row.mobile || ''],
    ['Tier', (row) => row.tier || ''],
    ['Points balance', (row) => row.pointsBalance],
    ['Days since last transaction', (row) => row.daysSinceLastTransaction ?? ''],
    ['Last transaction', (row) => formatNullableDate(row.lastTransactionAt)],
    ['Lifetime spend', (row) => formatMoneyMinor(row.lifetimeSpendMinor)]
  ])
}

function exportBirthdays() {
  downloadCsv('fran-birthday-members.csv', customerAnalytics.value?.birthdayMembers || [], [
    ['Name', (row) => row.name],
    ['Mobile', (row) => row.mobile || ''],
    ['Tier', (row) => row.tier || ''],
    ['Points balance', (row) => row.pointsBalance],
    ['Birthday', (row) => row.birthday]
  ])
}

function exportCampaigns() {
  downloadCsv('fran-campaign-performance.csv', customerAnalytics.value?.campaignPerformance || [], [
    ['Campaign', (row) => row.name],
    ['Members reached', (row) => row.membersReached],
    ['Transactions', (row) => row.transactions],
    ['Points awarded', (row) => row.pointsAwarded],
    ['Revenue', (row) => formatMoneyMinor(row.revenueMinor)],
    ['Start date', (row) => row.startDate || ''],
    ['End date', (row) => row.endDate || '']
  ])
}

function downloadCsv<T>(
  filename: string,
  rows: T[],
  columns: Array<[string, (row: T) => string | number | null]>
) {
  const csvRows = [
    columns.map(([header]) => escapeCsv(header)).join(','),
    ...rows.map((row) => columns.map(([, value]) => escapeCsv(value(row))).join(','))
  ]
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function escapeCsv(value: string | number | null) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function utcToday() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

function formatIsoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}
</script>

<template>
  <div class="page-stack analytics-page">
    <div class="intro-strip">
      <div>
        <p class="eyebrow">Fran loyalty analytics</p>
        <h2>Member tiers, points economics, customer value, lifecycle risk, and campaign performance.</h2>
      </div>
      <Activity :size="24" />
    </div>

    <div v-if="pending" class="loading-panel">Loading analytics...</div>

    <template v-else-if="analytics">
      <div v-if="requiresSetup" class="notice-bar">
        Create your company workspace before loading hosted analytics.
        <NuxtLink to="/setup">Set up company</NuxtLink>
      </div>
      <div v-else-if="analytics.mode === 'demo' || analytics.warning" class="notice-bar">
        {{ analytics.warning || 'Running with demo analytics data.' }}
      </div>

      <MetricStrip :metrics="metrics" />

      <section class="analytics-panel analytics-overview-panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Customer reports</p>
            <h2>{{ formatNumber(customerAnalytics?.topLimit || topLimit) }} row export lists</h2>
          </div>
          <div class="analytics-controls">
            <label class="compact-field">
              <span>Top</span>
              <input v-model.number="topLimit" type="number" min="1" max="100">
            </label>
            <label class="compact-field">
              <span>At-risk</span>
              <input v-model.number="atRiskDays" type="number" min="1" max="365">
            </label>
            <label class="compact-field">
              <span>Lapsed from</span>
              <input v-model.number="lapsedFromDays" type="number" min="1" max="730">
            </label>
            <label class="compact-field">
              <span>Lapsed to</span>
              <input v-model.number="lapsedToDays" type="number" min="1" max="1095">
            </label>
          </div>
        </div>

        <div class="points-economics-grid">
          <div v-for="card in customerCards" :key="card.label" class="mini-metric-card">
            <span>{{ card.label }}</span>
            <strong>{{ card.value }}</strong>
            <p>{{ card.detail }}</p>
          </div>
        </div>
      </section>

      <section class="analytics-panel analytics-overview-panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Points economics</p>
            <h2>{{ formatNumber(analytics.loyaltyPoints.totalIssued) }} issued points</h2>
          </div>
          <div class="range-control">
            <CalendarDays :size="18" />
            <div class="segmented-control" aria-label="Analytics date range">
              <button
                v-for="range in rangeOptions"
                :key="range.value"
                type="button"
                :class="{ active: selectedRange === range.value }"
                @click="selectedRange = range.value"
              >
                {{ range.label }}
              </button>
            </div>
          </div>
        </div>

        <div class="points-economics-grid">
          <div v-for="card in pointsCards" :key="card.label" class="mini-metric-card">
            <span>{{ card.label }}</span>
            <strong>{{ card.value }}</strong>
            <p>{{ card.detail }}</p>
          </div>
        </div>

        <NativeComparisonChart :series="pointsSeries" aria-label="Issued and redeemed points trend" />
      </section>

      <section class="analytics-panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Top spenders</p>
            <h2>Lifetime and trailing 12-month value</h2>
          </div>
          <Users :size="20" />
        </div>

        <div class="report-grid">
          <div class="report-block">
            <div class="table-title-row">
              <strong>Lifetime spend</strong>
              <button type="button" class="secondary-button" @click="exportTopSpenders('lifetime')">
                <Download :size="16" />
                Export CSV
              </button>
            </div>
            <div class="data-table-wrap">
              <table class="analytics-data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Mobile</th>
                    <th>Tier</th>
                    <th>Lifetime</th>
                    <th>12 mo.</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in customerAnalytics?.topSpenders.lifetime || []" :key="`lifetime-${row.id}`">
                    <td>{{ row.name }}</td>
                    <td>{{ row.mobile || '' }}</td>
                    <td>{{ formatTier(row.tier) }}</td>
                    <td>{{ formatMoneyMinor(row.lifetimeSpendMinor) }}</td>
                    <td>{{ formatMoneyMinor(row.trailing12MonthSpendMinor) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="report-block">
            <div class="table-title-row">
              <strong>Trailing 12 months</strong>
              <button type="button" class="secondary-button" @click="exportTopSpenders('trailing12Month')">
                <Download :size="16" />
                Export CSV
              </button>
            </div>
            <div class="data-table-wrap">
              <table class="analytics-data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Mobile</th>
                    <th>Tier</th>
                    <th>12 mo.</th>
                    <th>Last txn</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in customerAnalytics?.topSpenders.trailing12Month || []" :key="`trailing-${row.id}`">
                    <td>{{ row.name }}</td>
                    <td>{{ row.mobile || '' }}</td>
                    <td>{{ formatTier(row.tier) }}</td>
                    <td>{{ formatMoneyMinor(row.trailing12MonthSpendMinor) }}</td>
                    <td>{{ formatNullableDate(row.lastTransactionAt) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section class="analytics-panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Lifecycle risk</p>
            <h2>At-risk and lapsed members</h2>
          </div>
          <div class="movement-summary">
            <span><ArrowDownRight :size="16" />{{ formatNumber(customerAnalytics?.atRiskCustomers.length || 0) }}</span>
            <span><ArrowDownRight :size="16" />{{ formatNumber(customerAnalytics?.lapsedCustomers.length || 0) }}</span>
          </div>
        </div>

        <div class="report-grid">
          <div class="report-block">
            <div class="table-title-row">
              <strong>At-risk</strong>
              <button type="button" class="secondary-button" @click="exportLifecycle('at-risk')">
                <Download :size="16" />
                Export CSV
              </button>
            </div>
            <div class="data-table-wrap">
              <table class="analytics-data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Mobile</th>
                    <th>Tier</th>
                    <th>Days</th>
                    <th>Last txn</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in customerAnalytics?.atRiskCustomers || []" :key="`risk-${row.id}`">
                    <td>{{ row.name }}</td>
                    <td>{{ row.mobile || '' }}</td>
                    <td>{{ formatTier(row.tier) }}</td>
                    <td>{{ row.daysSinceLastTransaction }}</td>
                    <td>{{ formatNullableDate(row.lastTransactionAt) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="report-block">
            <div class="table-title-row">
              <strong>Lapsed</strong>
              <button type="button" class="secondary-button" @click="exportLifecycle('lapsed')">
                <Download :size="16" />
                Export CSV
              </button>
            </div>
            <div class="data-table-wrap">
              <table class="analytics-data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Mobile</th>
                    <th>Tier</th>
                    <th>Days</th>
                    <th>Last txn</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in customerAnalytics?.lapsedCustomers || []" :key="`lapsed-${row.id}`">
                    <td>{{ row.name }}</td>
                    <td>{{ row.mobile || '' }}</td>
                    <td>{{ formatTier(row.tier) }}</td>
                    <td>{{ row.daysSinceLastTransaction }}</td>
                    <td>{{ formatNullableDate(row.lastTransactionAt) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section class="analytics-grid">
        <article class="analytics-panel">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Birthdays</p>
              <h2>This month</h2>
            </div>
            <button type="button" class="secondary-button" @click="exportBirthdays">
              <Gift :size="16" />
              Export CSV
            </button>
          </div>
          <div class="data-table-wrap">
            <table class="analytics-data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Mobile</th>
                  <th>Tier</th>
                  <th>Points</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in customerAnalytics?.birthdayMembers || []" :key="`birthday-${row.id}`">
                  <td>{{ row.name }}</td>
                  <td>{{ row.mobile || '' }}</td>
                  <td>{{ formatTier(row.tier) }}</td>
                  <td>{{ formatNumber(row.pointsBalance) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>

        <article class="analytics-panel">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Campaigns</p>
              <h2>Performance</h2>
            </div>
            <button type="button" class="secondary-button" @click="exportCampaigns">
              <Megaphone :size="16" />
              Export CSV
            </button>
          </div>
          <div class="data-table-wrap">
            <table class="analytics-data-table">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Reached</th>
                  <th>Txn</th>
                  <th>Points</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in customerAnalytics?.campaignPerformance || []" :key="`campaign-${row.id}`">
                  <td>{{ row.name }}</td>
                  <td>{{ formatNumber(row.membersReached) }}</td>
                  <td>{{ formatNumber(row.transactions) }}</td>
                  <td>{{ formatNumber(row.pointsAwarded) }}</td>
                  <td>{{ formatMoneyMinor(row.revenueMinor) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section class="analytics-grid">
        <article class="analytics-panel">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Snapshot</p>
              <h2>Tier mix</h2>
            </div>
            <BarChart3 :size="20" />
          </div>

          <div class="tier-snapshot-list">
            <div v-for="tier in analytics.snapshot.tierCounts" :key="tier.tier" class="tier-bar-row">
              <span>{{ tier.tier }}</span>
              <strong>{{ formatNumber(tier.count) }}</strong>
              <i>
                <b :style="{ width: formatPercent(tier.share) }" />
              </i>
              <em>{{ formatPercent(tier.share) }}</em>
            </div>
          </div>
        </article>

        <article class="analytics-panel">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Sign-ups</p>
              <h2>{{ formatNumber(selectedSignupTotal) }} in range</h2>
            </div>
            <div class="segmented-control" aria-label="Signup grouping">
              <button
                v-for="bucket in bucketOptions"
                :key="bucket.value"
                type="button"
                :class="{ active: signupBucket === bucket.value }"
                @click="signupBucket = bucket.value"
              >
                {{ bucket.label }}
              </button>
            </div>
          </div>
          <NativeLineChart :points="signupChartPoints" />
        </article>
      </section>

      <section class="analytics-panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Tier trend</p>
            <h2>Bronze, Silver, Gold over time</h2>
          </div>
          <TrendingUp :size="20" />
        </div>
        <TierTrendChart :points="analytics.tierTrend" />
      </section>

      <section class="analytics-panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Evaluation cycles</p>
            <h2>Upgrade and downgrade counts</h2>
          </div>
          <div v-if="latestCycle" class="movement-summary">
            <span><ArrowUpRight :size="16" />{{ formatNumber(latestCycle.upgradedCount) }}</span>
            <span><ArrowDownRight :size="16" />{{ formatNumber(latestCycle.downgradedCount) }}</span>
          </div>
        </div>

        <div class="cycle-table">
          <div class="cycle-row cycle-header">
            <span>Cycle</span>
            <span>Members</span>
            <span>Bronze</span>
            <span>Silver</span>
            <span>Gold</span>
            <span>Upgraded</span>
            <span>Downgraded</span>
          </div>
          <div v-for="cycle in analytics.evaluationCycles" :key="cycle.id" class="cycle-row">
            <strong>{{ cycle.label }}</strong>
            <span>{{ formatNumber(cycle.memberCount) }}</span>
            <span>{{ formatNumber(cycle.tierCounts.Bronze) }}</span>
            <span>{{ formatNumber(cycle.tierCounts.Silver) }}</span>
            <span>{{ formatNumber(cycle.tierCounts.Gold) }}</span>
            <span>{{ formatNumber(cycle.upgradedCount) }}</span>
            <span>{{ formatNumber(cycle.downgradedCount) }}</span>
          </div>
          <div v-if="!analytics.evaluationCycles.length" class="empty-row">
            No evaluation cycles recorded yet.
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
