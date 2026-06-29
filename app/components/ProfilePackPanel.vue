<script setup lang="ts">
import { Save, ShieldAlert } from '@lucide/vue'
import type { CrmEntity, CrmProfilePackDefinition, CrmSchemaField } from '~/types/crm'

const props = defineProps<{
  entity: CrmEntity
  packs: CrmProfilePackDefinition[]
  workspaceId?: string
}>()

const { session } = useCrmAuth()
const savingPackKey = ref('')
const saveMessage = ref('')
const localValues = ref<Record<string, Record<string, unknown>>>({})

const installedPacks = computed(() => props.packs.filter((pack) => pack.installed && pack.fields.length > 0))

watch(
  () => [props.entity.id, props.entity.attributes, props.packs],
  () => {
    localValues.value = cloneProfileValues(props.entity.attributes)
  },
  { immediate: true, deep: true }
)

function cloneProfileValues(attributes: Record<string, unknown>) {
  const profilePacks = attributes.profile_packs

  if (!profilePacks || typeof profilePacks !== 'object' || Array.isArray(profilePacks)) {
    return {}
  }

  return JSON.parse(JSON.stringify(profilePacks)) as Record<string, Record<string, unknown>>
}

function getPackValues(packKey: string) {
  if (!localValues.value[packKey]) {
    localValues.value[packKey] = {}
  }

  return localValues.value[packKey]
}

function getValue(packKey: string, field: CrmSchemaField) {
  return getPackValues(packKey)[field.key]
}

function setValue(packKey: string, field: CrmSchemaField, value: unknown) {
  getPackValues(packKey)[field.key] = value
}

function getStringValue(packKey: string, field: CrmSchemaField) {
  const value = getValue(packKey, field)
  return value === undefined || value === null ? '' : String(value)
}

function getArrayValue(packKey: string, field: CrmSchemaField) {
  const value = getValue(packKey, field)
  return Array.isArray(value) ? value.map(String) : []
}

function toggleArrayValue(packKey: string, field: CrmSchemaField, option: string) {
  const current = new Set(getArrayValue(packKey, field))

  if (current.has(option)) {
    current.delete(option)
  } else {
    current.add(option)
  }

  setValue(packKey, field, Array.from(current))
}

function setListFromText(packKey: string, field: CrmSchemaField, value: string) {
  setValue(packKey, field, value.split(',').map((item) => item.trim()).filter(Boolean))
}

function eventValue(event: Event) {
  const target = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null
  return target?.value || ''
}

function setJsonFromText(packKey: string, field: CrmSchemaField, value: string) {
  try {
    setValue(packKey, field, JSON.parse(value || '{}'))
  } catch {
    setValue(packKey, field, {})
  }
}

function isSelected(packKey: string, field: CrmSchemaField, option: string) {
  return getArrayValue(packKey, field).includes(option)
}

async function savePack(pack: CrmProfilePackDefinition) {
  saveMessage.value = ''
  savingPackKey.value = pack.key

  try {
    const fields = getPackValues(pack.key)

    if (props.workspaceId && session.value?.access_token && /^[0-9a-f-]{36}$/i.test(props.entity.id)) {
      await $fetch(`/api/v1/people/${props.entity.id}/profile-fields`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${session.value.access_token}`
        },
        body: {
          workspaceId: props.workspaceId,
          packKey: pack.key,
          fields,
          sourceSystem: 'crm_ui'
        }
      })
    }

    saveMessage.value = `${pack.label} saved`
  } finally {
    savingPackKey.value = ''
  }
}
</script>

<template>
  <section v-if="installedPacks.length" class="profile-pack-panel">
    <div class="section-heading compact-heading">
      <div>
        <p class="eyebrow">Profile packs</p>
        <h2>Context-specific customer fields</h2>
      </div>
    </div>

    <article v-for="pack in installedPacks" :key="pack.key" class="profile-pack-card">
      <div class="pack-card-heading">
        <div>
          <strong>{{ pack.label }}</strong>
          <span>{{ pack.key }}</span>
        </div>
        <button class="secondary-button" type="button" :disabled="savingPackKey === pack.key" @click="savePack(pack)">
          <Save :size="16" />
          <span>{{ savingPackKey === pack.key ? 'Saving' : 'Save' }}</span>
        </button>
      </div>

      <div class="profile-field-list">
        <label v-for="field in pack.fields" :key="field.key" class="profile-field">
          <span>
            {{ field.label }}
            <small v-if="field.sensitivityLevel === 'confidential' || field.sensitivityLevel === 'restricted'">
              <ShieldAlert :size="13" />
              {{ field.sensitivityLevel }}
            </small>
          </span>

          <select
            v-if="field.type === 'single_select' || field.type === 'enum'"
            :value="getStringValue(pack.key, field)"
            @change="setValue(pack.key, field, eventValue($event))"
          >
            <option value="" :selected="!getStringValue(pack.key, field)">Select</option>
            <option
              v-for="option in field.enumValues"
              :key="option"
              :value="option"
              :selected="getStringValue(pack.key, field) === option"
            >
              {{ option }}
            </option>
          </select>

          <div v-else-if="field.type === 'multi_select'" class="choice-row">
            <button
              v-for="option in field.enumValues"
              :key="option"
              type="button"
              :class="{ active: isSelected(pack.key, field, option) }"
              @click="toggleArrayValue(pack.key, field, option)"
            >
              {{ option }}
            </button>
          </div>

          <div v-else-if="field.type === 'tag_list'" class="tag-editor">
            <div class="choice-row">
              <button
                v-for="option in field.enumValues"
                :key="option"
                type="button"
                :class="{ active: isSelected(pack.key, field, option) }"
                @click="toggleArrayValue(pack.key, field, option)"
              >
                {{ option }}
              </button>
            </div>
            <input
              :value="getArrayValue(pack.key, field).join(', ')"
              type="text"
              @input="setListFromText(pack.key, field, eventValue($event))"
            />
          </div>

          <textarea
            v-else-if="field.type === 'json'"
            :value="JSON.stringify(getValue(pack.key, field) || {}, null, 2)"
            rows="4"
            @change="setJsonFromText(pack.key, field, eventValue($event))"
          />

          <input
            v-else
            :value="getStringValue(pack.key, field)"
            :type="field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'"
            @input="setValue(pack.key, field, eventValue($event))"
          />
        </label>
      </div>
    </article>

    <p v-if="saveMessage" class="notice-text">{{ saveMessage }}</p>
  </section>
</template>
