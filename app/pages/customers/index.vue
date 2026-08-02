<script setup lang="ts">
import {
  Mail,
  MapPin,
  Phone,
  Search,
  Sparkles,
  UserRound,
  Users
} from '@lucide/vue'

definePageMeta({
  middleware: 'authenticated-client'
})

type CustomerRow = {
  id: string
  label: string
  email: string | null
  phone: string | null
  memberNumber: string | null
  tier: string | null
  pointsBalance: number | null
  totalSpent: number | null
  currency: string
  ordersCount: number | null
  lifecycleStage: string | null
  preferredStore: string | null
  lastVisitAt: string | null
  tags: string[]
  externalIds: Record<string, string>
  attributes: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

const route = useRoute()
const router = useRouter()
const { refreshSession, session, startAuthListener, user } = useCrmAuth()
const { loadWorkspaces, primaryWorkspace, requiresSetup } = useCrmWorkspaceAccess()
const workspaceId = computed(() => primaryWorkspace.value?.id)

const search = ref(String(route.query.q || ''))
const tierFilter = ref(String(route.query.tier || ''))
const selectedId = ref<string | null>(typeof route.query.id === 'string' ? route.query.id : null)

const debouncedSearch = ref(search.value)
let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(search, (value) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    debouncedSearch.value = value
  }, 200)
})

const { data, pending, refresh } = await useAsyncData('crm-customers', async () => {
  const activeWorkspaceId = workspaceId.value
  const headers = activeWorkspaceId && session.value?.access_token
    ? { Authorization: `Bearer ${session.value.access_token}` }
    : undefined

  return await $fetch<{
    mode: 'demo' | 'supabase'
    warning?: string
    total: number
    customers: CustomerRow[]
  }>('/api/crm/customers', {
    headers,
    query: {
      q: debouncedSearch.value || undefined,
      tier: tierFilter.value || undefined,
      limit: 100,
      ...(activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {})
    }
  })
}, {
  watch: [workspaceId, debouncedSearch, tierFilter]
})

const customers = computed(() => data.value?.customers || [])
const selected = computed(() => {
  if (!customers.value.length) return null
  return customers.value.find((c) => c.id === selectedId.value) || customers.value[0]
})

watch(selected, (value) => {
  if (!value) return
  selectedId.value = value.id
  router.replace({
    query: {
      ...route.query,
      id: value.id,
      ...(debouncedSearch.value ? { q: debouncedSearch.value } : {}),
      ...(tierFilter.value ? { tier: tierFilter.value } : {})
    }
  })
}, { immediate: true })

const tierOptions = computed(() => {
  const set = new Set<string>()
  for (const c of customers.value) {
    if (c.tier) set.add(c.tier)
  }
  return ['', ...Array.from(set).sort()]
})

const metrics = computed(() => {
  const list = customers.value
  const withPoints = list.filter((c) => (c.pointsBalance || 0) > 0).length
  const f3 = list.filter((c) => (c.tier || '').toUpperCase() === 'F3').length
  return [
    { label: 'In list', value: String(data.value?.total ?? list.length), detail: 'Matching current filters' },
    { label: 'With points', value: String(withPoints), detail: 'Non-zero balances' },
    { label: 'F3 tier', value: String(f3), detail: 'Top tier in this list' },
    { label: 'Mode', value: data.value?.mode === 'supabase' ? 'Hosted' : 'Demo', detail: data.value?.mode || 'demo' }
  ]
})

const beautyPack = computed(() => {
  const packs = selected.value?.attributes?.profile_packs as Record<string, Record<string, unknown>> | undefined
  return packs?.fran_beauty_profile || null
})

const loyaltyPack = computed(() => {
  const packs = selected.value?.attributes?.profile_packs as Record<string, Record<string, unknown>> | undefined
  return packs?.fran_loyalty || null
})

const memberPack = computed(() => {
  const packs = selected.value?.attributes?.profile_packs as Record<string, Record<string, unknown>> | undefined
  return packs?.fran_member || null
})

function formatMoney(amount: number | null | undefined, currency = 'SGD') {
  if (amount == null) return '—'
  try {
    return new Intl.NumberFormat('en-SG', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
  } catch {
    return `${currency} ${amount}`
  }
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })
}

function lifecycleLabel(stage: string | null | undefined) {
  if (!stage) return '—'
  return stage.replaceAll('_', ' ')
}

function selectCustomer(id: string) {
  selectedId.value = id
}

onMounted(async () => {
  startAuthListener()
  await refreshSession()
  if (user.value) {
    await loadWorkspaces()
    await refresh()
  }
})
</script>

<template>
  <div class="page-stack customers-page">
    <div class="intro-strip">
      <div>
        <p class="eyebrow">Members</p>
        <h2>Customers</h2>
        <p>
          Search and open member profiles — contact, tier, points, and store preference.
          This is the day-to-day view; Graph is for identity links and agent proposals.
        </p>
      </div>
      <Users :size="24" />
    </div>

    <LoadingPanel v-if="pending && !data" title="Loading customers" />

    <template v-else>
      <div v-if="requiresSetup" class="notice-bar">
        Create your company workspace to load hosted members.
        <NuxtLink to="/setup">Set up company</NuxtLink>
      </div>
      <div v-else-if="data?.mode === 'demo' || data?.warning" class="notice-bar">
        {{ data?.warning || 'Showing demo customers. Connect a workspace for live member data.' }}
      </div>

      <section class="customers-metrics">
        <div v-for="card in metrics" :key="card.label" class="mini-metric-card">
          <span>{{ card.label }}</span>
          <strong>{{ card.value }}</strong>
          <p>{{ card.detail }}</p>
        </div>
      </section>

      <section class="customers-workspace">
        <div class="customers-list-panel">
          <div class="customers-toolbar">
            <label class="search-box customers-search">
              <Search :size="17" />
              <input
                v-model="search"
                type="search"
                placeholder="Search name, email, phone, member #"
                aria-label="Search customers"
              >
            </label>
            <label class="compact-field">
              <span>Tier</span>
              <select v-model="tierFilter" aria-label="Filter by tier">
                <option value="">All</option>
                <option v-for="tier in tierOptions.filter(Boolean)" :key="tier" :value="tier">
                  {{ tier }}
                </option>
              </select>
            </label>
          </div>

          <div v-if="!customers.length" class="customers-empty">
            <UserRound :size="28" />
            <h3>No customers match</h3>
            <p>Try clearing the search or tier filter. In demo mode, six sample members are available.</p>
          </div>

          <ul v-else class="customers-list" role="listbox" aria-label="Customers">
            <li
              v-for="customer in customers"
              :key="customer.id"
              role="option"
              :aria-selected="customer.id === selected?.id"
            >
              <button
                type="button"
                class="customer-row"
                :class="{ active: customer.id === selected?.id }"
                @click="selectCustomer(customer.id)"
              >
                <span class="customer-avatar" aria-hidden="true">
                  {{ customer.label.slice(0, 1) }}
                </span>
                <span class="customer-row-main">
                  <strong>{{ customer.label }}</strong>
                  <small>
                    {{ customer.memberNumber || 'No member #' }}
                    <template v-if="customer.email"> · {{ customer.email }}</template>
                  </small>
                </span>
                <span class="customer-row-meta">
                  <span v-if="customer.tier" class="status-pill tier-pill">{{ customer.tier }}</span>
                  <small v-if="customer.pointsBalance != null">{{ customer.pointsBalance.toLocaleString() }} pts</small>
                </span>
              </button>
            </li>
          </ul>
        </div>

        <aside v-if="selected" class="customers-detail-panel">
          <div class="customers-detail-header">
            <div>
              <p class="eyebrow">Customer</p>
              <h2>{{ selected.label }}</h2>
              <div class="tag-row">
                <span v-if="selected.tier" class="status-pill">{{ selected.tier }}</span>
                <span v-if="selected.lifecycleStage">{{ lifecycleLabel(selected.lifecycleStage) }}</span>
                <span v-for="tag in selected.tags" :key="tag">{{ tag }}</span>
              </div>
            </div>
            <UserRound :size="28" class="detail-icon" />
          </div>

          <dl class="customers-fact-grid">
            <div>
              <dt><Mail :size="14" /> Email</dt>
              <dd>{{ selected.email || '—' }}</dd>
            </div>
            <div>
              <dt><Phone :size="14" /> Phone</dt>
              <dd>{{ selected.phone || '—' }}</dd>
            </div>
            <div>
              <dt>Member #</dt>
              <dd>{{ selected.memberNumber || '—' }}</dd>
            </div>
            <div>
              <dt>Points</dt>
              <dd>{{ selected.pointsBalance != null ? selected.pointsBalance.toLocaleString() : '—' }}</dd>
            </div>
            <div>
              <dt>Lifetime spend</dt>
              <dd>{{ formatMoney(selected.totalSpent, selected.currency) }}</dd>
            </div>
            <div>
              <dt>Orders</dt>
              <dd>{{ selected.ordersCount ?? '—' }}</dd>
            </div>
            <div>
              <dt><MapPin :size="14" /> Preferred store</dt>
              <dd>{{ selected.preferredStore || '—' }}</dd>
            </div>
            <div>
              <dt>Last visit</dt>
              <dd>{{ formatDate(selected.lastVisitAt) }}</dd>
            </div>
          </dl>

          <section v-if="loyaltyPack" class="customers-section">
            <div class="section-heading compact-heading">
              <div>
                <p class="eyebrow">Loyalty</p>
                <h3>Tier and progress</h3>
              </div>
              <Sparkles :size="18" />
            </div>
            <dl class="attribute-list">
              <dt>Tier</dt>
              <dd>{{ loyaltyPack.tier || loyaltyPack.tier_key || '—' }}</dd>
              <dt>Points balance</dt>
              <dd>{{ loyaltyPack.points_balance ?? '—' }}</dd>
              <dt>Expiring soon</dt>
              <dd>{{ loyaltyPack.points_expiring_soon ?? 0 }}</dd>
              <dt>YTD spend</dt>
              <dd>{{ loyaltyPack.ytd_spend ?? loyaltyPack.calendar_ytd_spend ?? '—' }}</dd>
              <dt>Next tier</dt>
              <dd>
                <template v-if="loyaltyPack.next_tier">
                  {{ loyaltyPack.next_tier }}
                  <template v-if="loyaltyPack.spend_to_next_tier != null">
                    · {{ formatMoney(Number(loyaltyPack.spend_to_next_tier), selected.currency) }} to go
                  </template>
                </template>
                <template v-else>Top tier</template>
              </dd>
            </dl>
          </section>

          <section v-if="memberPack" class="customers-section">
            <div class="section-heading compact-heading">
              <div>
                <p class="eyebrow">Membership</p>
                <h3>Fran member record</h3>
              </div>
            </div>
            <dl class="attribute-list">
              <dt>Member since</dt>
              <dd>{{ formatDate(String(memberPack.member_since || '')) }}</dd>
              <dt>Birthday</dt>
              <dd>{{ formatDate(String(memberPack.birthday || '')) }}</dd>
              <dt>Consent</dt>
              <dd>{{ memberPack.consent_status || '—' }}</dd>
            </dl>
          </section>

          <section v-if="beautyPack" class="customers-section">
            <div class="section-heading compact-heading">
              <div>
                <p class="eyebrow">Beauty profile</p>
                <h3>Counter-safe notes</h3>
              </div>
            </div>
            <dl class="attribute-list">
              <dt>Skin type</dt>
              <dd>{{ beautyPack.skin_type || '—' }}</dd>
              <dt>Concerns</dt>
              <dd>
                {{
                  Array.isArray(beautyPack.skin_concerns)
                    ? beautyPack.skin_concerns.join(', ')
                    : (beautyPack.skin_concerns || '—')
                }}
              </dd>
              <dt>Sensitivities</dt>
              <dd>
                {{
                  Array.isArray(beautyPack.reported_sensitivities)
                    ? beautyPack.reported_sensitivities.join(', ')
                    : (beautyPack.reported_sensitivities || '—')
                }}
              </dd>
              <dt>Advisor notes</dt>
              <dd>{{ beautyPack.advisor_notes || beautyPack.reported_sensitivity_note || '—' }}</dd>
            </dl>
          </section>

          <section class="customers-section">
            <div class="section-heading compact-heading">
              <div>
                <p class="eyebrow">Identity</p>
                <h3>External ids</h3>
              </div>
            </div>
            <div class="code-panel">
              <pre>{{ JSON.stringify(selected.externalIds, null, 2) }}</pre>
            </div>
            <p class="customers-footnote">
              Need relationships and agent proposals?
              <NuxtLink :to="`/graph`">Open the graph</NuxtLink>
              ·
              <NuxtLink to="/analytics">Analytics</NuxtLink>
            </p>
          </section>
        </aside>
      </section>
    </template>
  </div>
</template>
