<script setup lang="ts">
import { ArrowRight, BadgeCheck, BookOpen, FileText, ShieldCheck, UserRound } from '@lucide/vue'
</script>

<template>
  <div class="page-stack">
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
        <NuxtLink class="nav-link" to="/docs/skills">
          <ShieldCheck :size="18" />
          <span>Review agent skills</span>
          <ArrowRight :size="16" />
        </NuxtLink>
      </article>
    </section>
  </div>
</template>
