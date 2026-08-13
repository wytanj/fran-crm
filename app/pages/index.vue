<script setup lang="ts">
import { ArrowRight, FileText, FlaskConical, ShieldCheck, Wrench } from '@lucide/vue'

definePageMeta({
  layout: false
})

const { ready, user, ensureReady } = useCrmAppReady()

onMounted(() => {
  void ensureReady()
})

const features = [
  { title: 'Customer graph', body: 'One identity spine for members, visits, and beauty profiles behind Fran POS.' },
  { title: 'Loyalty policy', body: 'Tiers, points, and vouchers with a simulator that shows the cashier path.' },
  { title: 'Fran POS contracts', body: 'Counter session, member resolve, and commit-sale over one set of routes.' },
  { title: 'Agent protocol', body: 'Workspace-scoped proposals, approvals, and an MCP surface for Claude.' },
  { title: 'Schema packs', body: 'Profile fields and packs without leaking Fran rules into generic crmOS helpers.' },
  { title: 'Analytics', body: 'Tier mix, point economics, and at-risk members on the same workspace.' }
]
</script>

<template>
  <div v-if="!ready" class="landing">
    <div class="auth-layout">
      <LoadingPanel title="Checking session" detail="Loading your Fran workspace." />
    </div>
  </div>

  <div v-else-if="!user" class="landing">
    <nav class="landing-nav">
      <div class="landing-nav-inner">
        <div class="landing-brand">
          <span class="brand-mark">FR</span>
          <strong>Fran CRM</strong>
        </div>
        <div class="landing-nav-actions">
          <NuxtLink to="/docs" class="user-button press">Docs</NuxtLink>
          <NuxtLink to="/login" class="primary-button press">Get started</NuxtLink>
        </div>
      </div>
    </nav>

    <section class="landing-hero">
      <div class="landing-hero-glow" />
      <div class="landing-hero-inner">
        <p class="eyebrow">Members · loyalty · POS · agents</p>
        <h1>The customer graph behind Fran POS</h1>
        <p>
          Member identity, loyalty policy, and reward decisions served through
          one set of contracts — for the counter, the desk, and agents.
        </p>
        <div class="landing-hero-actions">
          <NuxtLink to="/login" class="primary-button press">Start for free</NuxtLink>
          <NuxtLink to="/simulator" class="secondary-button press">Loyalty simulator</NuxtLink>
        </div>
      </div>
    </section>

    <section class="landing-strip">
      <span>Workspace-scoped data</span>
      <span>Fran POS loyalty path</span>
      <span>REST + MCP</span>
      <span>Policy simulator</span>
      <span>Agent proposals</span>
    </section>

    <section class="landing-section">
      <div class="landing-section-inner">
        <div class="landing-section-head">
          <h2>Built for the counter and the agent</h2>
          <p>Same cream desk as Fran HRM and SKUMS. Heavy lifting stays on the API.</p>
        </div>
        <div class="landing-feature-grid">
          <article v-for="feature in features" :key="feature.title" class="landing-feature settings-panel">
            <h3>{{ feature.title }}</h3>
            <p>{{ feature.body }}</p>
          </article>
        </div>
      </div>
    </section>

    <section class="landing-section" style="padding-top: 0">
      <div class="landing-section-inner two-column">
        <article class="settings-panel">
          <div class="section-heading compact-heading">
            <div>
              <p class="eyebrow">No sign-in needed</p>
              <h2>Explore</h2>
            </div>
          </div>
          <NuxtLink class="nav-link" to="/simulator">
            <FlaskConical :size="17" />
            <span>Loyalty simulator</span>
            <ArrowRight :size="15" />
          </NuxtLink>
          <NuxtLink class="nav-link" to="/docs/api">
            <FileText :size="17" />
            <span>Route contracts</span>
            <ArrowRight :size="15" />
          </NuxtLink>
          <NuxtLink class="nav-link" to="/docs/agents">
            <ShieldCheck :size="17" />
            <span>Agent boundaries</span>
            <ArrowRight :size="15" />
          </NuxtLink>
          <NuxtLink class="nav-link" to="/docs/skills">
            <Wrench :size="17" />
            <span>Agent skills</span>
            <ArrowRight :size="15" />
          </NuxtLink>
        </article>
        <article class="settings-panel">
          <div class="section-heading compact-heading">
            <div>
              <p class="eyebrow">Get started</p>
              <h2>Sign in</h2>
            </div>
          </div>
          <p class="muted-text">Workspace data, analytics, and the customer graph stay behind sign-in.</p>
          <NuxtLink class="primary-button" to="/login">Continue with Google</NuxtLink>
        </article>
      </div>
    </section>

    <footer class="landing-footer">
      <strong>Fran CRM</strong>
      <NuxtLink to="/login">Sign in</NuxtLink>
    </footer>
  </div>

  <NuxtLayout v-else name="default">
    <div class="page-stack">
      <div class="page-header">
        <div>
          <p class="eyebrow">Overview</p>
          <h1>Dashboard</h1>
          <p class="page-header-sub">Member graph, loyalty reporting, and the POS contracts for this workspace.</p>
        </div>
        <NuxtLink to="/simulator" class="primary-button press">Loyalty simulator</NuxtLink>
      </div>

      <section class="two-column">
        <article class="settings-panel">
          <div class="section-heading compact-heading">
            <div>
              <p class="eyebrow">Explore</p>
              <h2>Policy and docs</h2>
            </div>
          </div>
          <NuxtLink class="nav-link" to="/simulator">
            <FlaskConical :size="17" />
            <span>Loyalty simulator</span>
            <ArrowRight :size="15" />
          </NuxtLink>
          <NuxtLink class="nav-link" to="/docs/api">
            <FileText :size="17" />
            <span>Route contracts</span>
            <ArrowRight :size="15" />
          </NuxtLink>
          <NuxtLink class="nav-link" to="/docs/agents">
            <ShieldCheck :size="17" />
            <span>Agent boundaries</span>
            <ArrowRight :size="15" />
          </NuxtLink>
          <NuxtLink class="nav-link" to="/docs/skills">
            <Wrench :size="17" />
            <span>Agent skills</span>
            <ArrowRight :size="15" />
          </NuxtLink>
        </article>
        <article class="settings-panel">
          <div class="section-heading compact-heading">
            <div>
              <p class="eyebrow">Workspace</p>
              <h2>Use the sidebar</h2>
            </div>
          </div>
          <p class="muted-text">Analytics, the customer graph, schema, and API stay in the signed-in nav.</p>
        </article>
      </section>
    </div>
  </NuxtLayout>
</template>
