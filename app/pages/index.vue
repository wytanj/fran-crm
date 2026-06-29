<script setup lang="ts">
import { ArrowRight, BadgeCheck, Database, FileText, Gift, ShieldCheck } from '@lucide/vue'
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
      <NuxtLink class="doc-card" to="/fran">
        <span>Fran</span>
        <h3>POS Contracts</h3>
        <p>Member resolve, counter session, reward preview, quote, commit, and reversal boundaries.</p>
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
            <p class="eyebrow">Next surfaces</p>
            <h2>Loyalty and rewards</h2>
          </div>
          <ShieldCheck :size="20" />
        </div>
        <NuxtLink class="nav-link" to="/schema">
          <Database :size="18" />
          <span>Review Fran profile fields</span>
          <ArrowRight :size="16" />
        </NuxtLink>
        <NuxtLink class="nav-link" to="/docs/api">
          <FileText :size="18" />
          <span>Read route contracts</span>
          <ArrowRight :size="16" />
        </NuxtLink>
      </article>
    </section>
  </div>
</template>
