<script setup lang="ts">
import { CheckCircle2, PackagePlus, Plus, Save } from '@lucide/vue'
import type { CrmProfilePackDefinition, CrmSchemaField } from '~/types/crm'

const props = defineProps<{
  fields: CrmSchemaField[]
  profilePacks: CrmProfilePackDefinition[]
  workspaceId?: string
}>()

const emit = defineEmits<{
  'pack-installed': [packKey: string]
}>()

const { session } = useCrmAuth()
const localFields = ref<CrmSchemaField[]>([...props.fields])
const localPacks = ref<CrmProfilePackDefinition[]>([...props.profilePacks])
const draft = reactive({
  key: '',
  label: '',
  type: 'text' as CrmSchemaField['type'],
  required: false
})

const fieldTypes: CrmSchemaField['type'][] = ['text', 'number', 'date', 'boolean', 'email', 'phone', 'json', 'enum', 'single_select', 'multi_select', 'tag_list']
const saving = ref(false)
const installingPackKey = ref('')

watch(() => props.fields, (nextFields) => {
  localFields.value = [...nextFields]
})

watch(() => props.profilePacks, (nextPacks) => {
  localPacks.value = [...nextPacks]
})

const sortedFields = computed(() => {
  return [...localFields.value].sort((left, right) => {
    return String(left.packKey || '').localeCompare(String(right.packKey || ''))
      || (left.sortOrder || 0) - (right.sortOrder || 0)
      || left.label.localeCompare(right.label)
  })
})

function isPackInstalled(pack: CrmProfilePackDefinition) {
  return Boolean(pack.installed || localFields.value.some((field) => field.packKey === pack.key))
}

async function installPack(pack: CrmProfilePackDefinition) {
  if (isPackInstalled(pack)) {
    return
  }

  installingPackKey.value = pack.key

  try {
    const accessToken = session.value?.access_token
    const shouldPersist = Boolean(props.workspaceId && accessToken)

    if (shouldPersist) {
      await $fetch(`/api/profile-packs/${pack.key}/install`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        body: {
          workspaceId: props.workspaceId
        }
      })
    }

    localPacks.value = localPacks.value.map((item) => item.key === pack.key ? { ...item, installed: true } : item)
    localFields.value = [
      ...localFields.value,
      ...pack.fields.filter((field) => !localFields.value.some((existing) => existing.packKey === pack.key && existing.key === field.key))
    ]
    if (shouldPersist) {
      emit('pack-installed', pack.key)
    }
  } finally {
    installingPackKey.value = ''
  }
}

async function addField() {
  if (!draft.key || !draft.label) {
    return
  }

  saving.value = true
  const field = {
    key: draft.key,
    label: draft.label,
    type: draft.type,
    required: draft.required,
    origin: 'custom' as const
  }

  await $fetch('/api/schema/fields', {
    method: 'POST',
    body: {
      workspaceId: props.workspaceId,
      entityType: 'person',
      ...field
    }
  })

  localFields.value.unshift(field)
  draft.key = ''
  draft.label = ''
  draft.type = 'text'
  draft.required = false
  saving.value = false
}
</script>

<template>
  <section class="schema-layout">
    <div class="schema-table">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Profile packs</p>
          <h2>Install vertical fields without changing the customer spine</h2>
        </div>
      </div>

      <div class="pack-list">
        <article v-for="pack in localPacks" :key="pack.key" class="pack-row">
          <div>
            <strong>{{ pack.label }}</strong>
            <span>{{ pack.description }}</span>
            <small>{{ pack.key }} - {{ pack.fields.length }} fields</small>
          </div>
          <button
            class="secondary-button"
            type="button"
            :disabled="isPackInstalled(pack) || installingPackKey === pack.key"
            @click="installPack(pack)"
          >
            <CheckCircle2 v-if="isPackInstalled(pack)" :size="17" />
            <PackagePlus v-else :size="17" />
            <span>{{ isPackInstalled(pack) ? 'Installed' : installingPackKey === pack.key ? 'Installing' : 'Install' }}</span>
          </button>
        </article>
      </div>

      <div class="field-list">
        <div v-for="field in sortedFields" :key="`${field.packKey || 'base'}:${field.key}`" class="field-row">
          <div>
            <strong>{{ field.label }}</strong>
            <span>{{ field.key }}</span>
          </div>
          <span>{{ field.packKey || 'base' }}</span>
          <span>{{ field.type }}</span>
          <em>{{ field.origin }}</em>
          <b>{{ field.posVisible ? 'POS' : field.marketingUsable ? 'Segments' : field.required ? 'Required' : 'Optional' }}</b>
          <small>{{ field.sensitivityLevel || 'internal' }}</small>
        </div>
      </div>
    </div>

    <form class="schema-form" @submit.prevent="addField">
      <p class="eyebrow">Custom schema</p>
      <h2>Add an agent-ready field</h2>
      <label>
        <span>Field key</span>
        <input v-model="draft.key" type="text" placeholder="preferred_channel" pattern="[a-z][a-z0-9_]*" />
      </label>
      <label>
        <span>Label</span>
        <input v-model="draft.label" type="text" placeholder="Preferred channel" />
      </label>
      <label>
        <span>Type</span>
        <select v-model="draft.type">
          <option v-for="type in fieldTypes" :key="type" :value="type">{{ type }}</option>
        </select>
      </label>
      <label class="check-row">
        <input v-model="draft.required" type="checkbox" />
        <span>Required for new person records</span>
      </label>
      <button class="primary-button" type="submit" :disabled="saving">
        <Save v-if="saving" :size="17" />
        <Plus v-else :size="17" />
        <span>{{ saving ? 'Saving' : 'Add field' }}</span>
      </button>
    </form>
  </section>
</template>
