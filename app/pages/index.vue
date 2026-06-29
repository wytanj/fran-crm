<script setup lang="ts">
import { ArrowRight, BadgeCheck, BookOpen, FileText, Gift, ShieldCheck, UserRound } from '@lucide/vue'

const landingRecommendations = [
  'Keep public: what Fran CRM owns in the Fran operating stack.',
  'Keep public: documentation for API contracts, agent rules, skills, and the shared data model.',
  'Keep public: sign-in as the only workspace entry point.',
  'Keep public: stable API and agent docs so POS and future MCP clients can integrate.',
  'Move behind auth: setup, graph, schema, API console, agents, workspace mode, settings, connector state, Fran POS contract console, and live operations.'
]
</script>

<template>
  <div class="page-stack">
    <div class="intro-strip">
      <div>
        <p class="eyebrow">Fran CRM</p>
        <h2>Opinionated crmOS build for Fran member identity, POS-safe counter profiles, loyalty policy, and reward decisions.</h2>
      </div>
      <Gift :size="24" />
    </div>

    <section class="metric-grid">
      <article class="metric-card">
        <span>Member resolve</span>
        <strong>Mocked</strong>
        <p>Phone, member number, QR, barcode, and external references map to the Fran person boundary.</p>
      </article>
      <article class="metric-card">
        <span>Counter session</span>
        <strong>Mocked</strong>
        <p>POS receives compact member, loyalty, rewards, and safe beauty context.</p>
      </article>
      <article class="metric-card">
        <span>Default packs</span>
        <strong>3</strong>
        <p>Fran member, loyalty, and beauty profile packs install by default for new workspaces.</p>
      </article>
      <article class="metric-card">
        <span>Sensitive fields</span>
        <strong>Filtered</strong>
        <p>Restricted notes stay out of counter projections even when present on the CRM profile.</p>
      </article>
    </section>

    <section class="docs-card-grid">
      <NuxtLink class="doc-card" to="/login">
        <span>Access</span>
        <h3>Sign In</h3>
        <p>Google and email-link auth route workspace owners to setup before internal operations.</p>
      </NuxtLink>
      <NuxtLink class="doc-card" to="/docs/api">
        <span>API</span>
        <h3>API Documentation</h3>
        <p>Stable route contracts for Fran POS, crmOS primitives, and agent-facing integrations.</p>
      </NuxtLink>
      <NuxtLink class="doc-card" to="/docs/agents">
        <span>Agents</span>
        <h3>Agent Documentation</h3>
        <p>Approval-first rules for merges, sensitivity changes, balance adjustments, and policy publish.</p>
      </NuxtLink>
      <NuxtLink class="doc-card" to="/docs/skills">
        <span>Skills</span>
        <h3>Agent Skills</h3>
        <p>Graph reads, profile cleanup, proposed changes, and safe execution boundaries.</p>
      </NuxtLink>
    </section>

    <section class="two-column">
      <article class="settings-panel">
        <div class="section-heading compact-heading">
          <div>
            <p class="eyebrow">Buildout status</p>
            <h2>First slice</h2>
          </div>
          <BadgeCheck :size="20" />
        </div>
        <div class="capability-row">Upstream crmOS copied and verified.</div>
        <div class="capability-row">Fran product labels and internal home surface applied.</div>
        <div class="capability-row">Default Fran packs added to demo and workspace setup.</div>
        <div class="capability-row">Member resolve and counter session mocked for POS.</div>
      </article>

      <article class="settings-panel">
        <div class="section-heading compact-heading">
          <div>
            <p class="eyebrow">Landing guidance</p>
            <h2>What stays public</h2>
          </div>
          <ShieldCheck :size="20" />
        </div>
        <div v-for="recommendation in landingRecommendations" :key="recommendation" class="capability-row">
          {{ recommendation }}
        </div>
      </article>
    </section>

    <section class="two-column">
      <article class="settings-panel">
        <div class="section-heading compact-heading">
          <div>
            <p class="eyebrow">Next Step</p>
            <h2>Sign in</h2>
          </div>
          <UserRound :size="20" />
        </div>
        <NuxtLink class="nav-link" to="/login">
          <BadgeCheck :size="18" />
          <span>Sign in with Google</span>
          <ArrowRight :size="16" />
        </NuxtLink>
      </article>

      <article class="settings-panel">
        <div class="section-heading compact-heading">
          <div>
            <p class="eyebrow">Reference</p>
            <h2>Read the contracts</h2>
          </div>
          <BookOpen :size="20" />
        </div>
        <NuxtLink class="nav-link" to="/docs/api">
          <FileText :size="18" />
          <span>Read route contracts</span>
          <ArrowRight :size="16" />
        </NuxtLink>
        <NuxtLink class="nav-link" to="/docs/agents">
          <ShieldCheck :size="18" />
          <span>Review agent boundaries</span>
          <ArrowRight :size="16" />
        </NuxtLink>
      </article>
    </section>
  </div>
</template>
