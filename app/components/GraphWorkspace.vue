<script setup lang="ts">
import { ArrowRight, Building2, Mail, PackageCheck, ShoppingBag, Ticket, UserRound } from '@lucide/vue'
import type { CrmEntity, CrmProfilePackDefinition, CrmRelationship } from '~/types/crm'

const props = defineProps<{
  entities: CrmEntity[]
  relationships: CrmRelationship[]
  profilePacks: CrmProfilePackDefinition[]
  workspaceId?: string
}>()

const selectedId = ref(props.entities[0]?.id)

const selected = computed(() => props.entities.find((entity) => entity.id === selectedId.value) || props.entities[0])

const visibleAttributes = computed(() => {
  const attributes = selected.value?.attributes || {}

  return Object.fromEntries(Object.entries(attributes).filter(([key]) => key !== 'profile_packs'))
})

const iconMap = {
  person: UserRound,
  company: Building2,
  order: ShoppingBag,
  ticket: Ticket,
  product: PackageCheck,
  message: Mail,
  household: UserRound,
  campaign: Mail,
  custom: PackageCheck
}

function relationshipLabel(relationship: CrmRelationship) {
  const from = props.entities.find((entity) => entity.id === relationship.fromEntityId)?.label || relationship.fromEntityId
  const to = props.entities.find((entity) => entity.id === relationship.toEntityId)?.label || relationship.toEntityId
  return `${from} ${relationship.type.replaceAll('_', ' ')} ${to}`
}
</script>

<template>
  <section class="workspace-grid">
    <div class="graph-board">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Identity spine</p>
          <h2>Graph of customers, accounts, orders, and interactions</h2>
        </div>
        <span class="status-pill">API first</span>
      </div>

      <div class="node-cloud">
        <button
          v-for="entity in entities"
          :key="entity.id"
          class="graph-node"
          :class="{ active: entity.id === selected?.id }"
          type="button"
          @click="selectedId = entity.id"
        >
          <component :is="iconMap[entity.type]" :size="20" />
          <span>{{ entity.label }}</span>
          <small>{{ entity.type }}</small>
        </button>
      </div>

      <div class="relationship-list">
        <div v-for="relationship in relationships" :key="relationship.id" class="relationship-row">
          <span>{{ relationship.source }}</span>
          <ArrowRight :size="16" />
          <strong>{{ relationshipLabel(relationship) }}</strong>
          <em>{{ Math.round(relationship.confidence * 100) }}%</em>
        </div>
      </div>
    </div>

    <aside v-if="selected" class="detail-panel">
      <p class="eyebrow">Selected entity</p>
      <h2>{{ selected.label }}</h2>
      <div class="tag-row">
        <span v-for="tag in selected.tags" :key="tag">{{ tag }}</span>
      </div>
      <dl class="attribute-list">
        <template v-for="(value, key) in visibleAttributes" :key="key">
          <dt>{{ key.toString().replaceAll('_', ' ') }}</dt>
          <dd>{{ value }}</dd>
        </template>
      </dl>
      <ProfilePackPanel
        v-if="selected.type === 'person'"
        :entity="selected"
        :packs="profilePacks"
        :workspace-id="workspaceId"
      />
      <div class="code-panel">
        <pre>{{ JSON.stringify({ id: selected.id, type: selected.type, externalIds: selected.externalIds }, null, 2) }}</pre>
      </div>
    </aside>
  </section>
</template>
