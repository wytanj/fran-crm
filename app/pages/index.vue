<script setup lang="ts">
import { ArrowRight, BadgeCheck, Blocks, BookOpen, FileText, FlaskConical, ShieldCheck, UserRound, Wrench } from '@lucide/vue'
</script>

<template>
  <div class="page-stack">
    <div class="intro-strip">
      <div>
        <p class="eyebrow">Fran CRM</p>
        <h2>A headless customer graph behind Fran POS</h2>
        <p>Member identity, loyalty policy, and reward decisions served through one set of contracts.</p>
      </div>
      <Blocks :size="24" />
    </div>

    <section class="two-column">
      <article class="settings-panel">
        <div class="section-heading compact-heading">
          <div>
            <p class="eyebrow">Get started</p>
            <h2>Sign in</h2>
          </div>
          <UserRound :size="20" />
        </div>
        <NuxtLink class="nav-link" to="/login">
          <BadgeCheck :size="17" />
          <span>Continue with Google</span>
          <ArrowRight :size="15" />
        </NuxtLink>
      </article>

      <article class="settings-panel">
        <div class="section-heading compact-heading">
          <div>
            <p class="eyebrow">No sign-in needed</p>
            <h2>Explore</h2>
          </div>
          <BookOpen :size="20" />
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
    </section>
  </div>
</template>
