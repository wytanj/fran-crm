import type { CrmEntity, CrmProfilePackDefinition, CrmSchemaField } from '../../app/types/crm'

type ProfileValues = Record<string, Record<string, unknown>>

export const franMemberProfileFields: CrmSchemaField[] = [
  {
    key: 'member_number',
    label: 'Member number',
    type: 'text',
    required: true,
    origin: 'custom',
    packKey: 'fran_member',
    sensitivityLevel: 'public',
    posVisible: true,
    cashierEditable: false,
    marketingUsable: false,
    uiContexts: ['profile', 'pos'],
    sortOrder: 10
  },
  {
    key: 'mobile',
    label: 'Mobile',
    type: 'phone',
    required: false,
    origin: 'custom',
    packKey: 'fran_member',
    sensitivityLevel: 'internal',
    posVisible: true,
    cashierEditable: true,
    marketingUsable: false,
    uiContexts: ['profile', 'pos'],
    sortOrder: 20
  },
  {
    key: 'member_since',
    label: 'Member since',
    type: 'date',
    required: false,
    origin: 'custom',
    packKey: 'fran_member',
    sensitivityLevel: 'internal',
    posVisible: true,
    cashierEditable: false,
    marketingUsable: false,
    uiContexts: ['profile', 'pos'],
    sortOrder: 30
  },
  {
    key: 'birthday',
    label: 'Birthday',
    type: 'date',
    required: false,
    origin: 'custom',
    packKey: 'fran_member',
    sensitivityLevel: 'confidential',
    posVisible: false,
    cashierEditable: true,
    marketingUsable: false,
    uiContexts: ['profile'],
    sortOrder: 40
  },
  {
    key: 'preferred_store',
    label: 'Preferred store',
    type: 'text',
    required: false,
    origin: 'custom',
    packKey: 'fran_member',
    sensitivityLevel: 'internal',
    posVisible: true,
    cashierEditable: true,
    marketingUsable: false,
    uiContexts: ['profile', 'pos'],
    sortOrder: 50
  },
  {
    key: 'consent_status',
    label: 'Consent status',
    type: 'single_select',
    required: false,
    origin: 'custom',
    packKey: 'fran_member',
    enumValues: ['granted', 'denied', 'unknown'],
    sensitivityLevel: 'internal',
    posVisible: true,
    cashierEditable: true,
    marketingUsable: false,
    uiContexts: ['profile', 'pos'],
    sortOrder: 60
  }
]

export const franLoyaltyProfileFields: CrmSchemaField[] = [
  {
    key: 'tier',
    label: 'Tier',
    type: 'single_select',
    required: false,
    origin: 'custom',
    packKey: 'fran_loyalty',
    enumValues: ['Bronze', 'Silver', 'Gold', 'Platinum'],
    sensitivityLevel: 'public',
    posVisible: true,
    cashierEditable: false,
    marketingUsable: false,
    uiContexts: ['profile', 'pos'],
    sortOrder: 10
  },
  {
    key: 'points_balance',
    label: 'Points balance',
    type: 'number',
    required: false,
    origin: 'custom',
    packKey: 'fran_loyalty',
    sensitivityLevel: 'internal',
    posVisible: true,
    cashierEditable: false,
    marketingUsable: false,
    uiContexts: ['profile', 'pos'],
    sortOrder: 20
  },
  {
    key: 'points_expiring_soon',
    label: 'Points expiring soon',
    type: 'number',
    required: false,
    origin: 'custom',
    packKey: 'fran_loyalty',
    sensitivityLevel: 'internal',
    posVisible: true,
    cashierEditable: false,
    marketingUsable: false,
    uiContexts: ['profile', 'pos'],
    sortOrder: 30
  },
  {
    key: 'points_expiry_date',
    label: 'Points expiry date',
    type: 'date',
    required: false,
    origin: 'custom',
    packKey: 'fran_loyalty',
    sensitivityLevel: 'internal',
    posVisible: true,
    cashierEditable: false,
    marketingUsable: false,
    uiContexts: ['profile', 'pos'],
    sortOrder: 40
  },
  {
    key: 'ytd_spend',
    label: 'YTD spend',
    type: 'number',
    required: false,
    origin: 'custom',
    packKey: 'fran_loyalty',
    sensitivityLevel: 'confidential',
    posVisible: false,
    cashierEditable: false,
    marketingUsable: false,
    uiContexts: ['profile'],
    sortOrder: 50
  },
  {
    key: 'next_tier',
    label: 'Next tier',
    type: 'single_select',
    required: false,
    origin: 'custom',
    packKey: 'fran_loyalty',
    enumValues: ['Silver', 'Gold', 'Platinum'],
    sensitivityLevel: 'internal',
    posVisible: true,
    cashierEditable: false,
    marketingUsable: false,
    uiContexts: ['profile', 'pos'],
    sortOrder: 60
  },
  {
    key: 'spend_to_next_tier',
    label: 'Spend to next tier',
    type: 'number',
    required: false,
    origin: 'custom',
    packKey: 'fran_loyalty',
    sensitivityLevel: 'internal',
    posVisible: true,
    cashierEditable: false,
    marketingUsable: false,
    uiContexts: ['profile', 'pos'],
    sortOrder: 70
  }
]

export const franBeautyProfileFields: CrmSchemaField[] = [
  {
    key: 'skin_type',
    label: 'Skin type',
    type: 'single_select',
    required: false,
    origin: 'custom',
    packKey: 'fran_beauty_profile',
    enumValues: ['Oily', 'Dry', 'Combination', 'Sensitive', 'Normal'],
    sensitivityLevel: 'internal',
    posVisible: true,
    cashierEditable: true,
    marketingUsable: false,
    uiContexts: ['profile', 'pos'],
    sortOrder: 10
  },
  {
    key: 'skin_concerns',
    label: 'Skin concerns',
    type: 'multi_select',
    required: false,
    origin: 'custom',
    packKey: 'fran_beauty_profile',
    enumValues: ['Acne', 'Pigmentation', 'Ageing', 'Redness', 'Dehydration', 'Uneven texture'],
    sensitivityLevel: 'internal',
    posVisible: true,
    cashierEditable: true,
    marketingUsable: false,
    uiContexts: ['profile', 'pos'],
    sortOrder: 20
  },
  {
    key: 'reported_sensitivities',
    label: 'Reported sensitivities',
    type: 'tag_list',
    required: false,
    origin: 'custom',
    packKey: 'fran_beauty_profile',
    enumValues: ['fragrance', 'retinol', 'AHA', 'BHA', 'parabens', 'essential oils', 'benzoyl peroxide'],
    sensitivityLevel: 'confidential',
    posVisible: true,
    cashierEditable: true,
    marketingUsable: false,
    uiContexts: ['profile', 'pos'],
    sortOrder: 30,
    metadata: {
      warningType: 'reported_sensitivity',
      warningSeverity: 'review'
    }
  },
  {
    key: 'reported_sensitivity_note',
    label: 'Sensitivity note',
    type: 'text',
    required: false,
    origin: 'custom',
    packKey: 'fran_beauty_profile',
    sensitivityLevel: 'restricted',
    posVisible: false,
    cashierEditable: true,
    marketingUsable: false,
    uiContexts: ['profile'],
    sortOrder: 40
  },
  {
    key: 'preferred_routine',
    label: 'Preferred routine',
    type: 'single_select',
    required: false,
    origin: 'custom',
    packKey: 'fran_beauty_profile',
    enumValues: ['Minimal', 'Treatment-led', 'Makeup-first', 'Fragrance-free', 'Advisor-led'],
    sensitivityLevel: 'internal',
    posVisible: true,
    cashierEditable: true,
    marketingUsable: false,
    uiContexts: ['profile', 'pos'],
    sortOrder: 50
  },
  {
    key: 'advisor_notes',
    label: 'Advisor notes',
    type: 'text',
    required: false,
    origin: 'custom',
    packKey: 'fran_beauty_profile',
    sensitivityLevel: 'restricted',
    posVisible: false,
    cashierEditable: true,
    marketingUsable: false,
    uiContexts: ['profile'],
    sortOrder: 60
  }
]

export const profilePackDefinitions: CrmProfilePackDefinition[] = [
  {
    key: 'fran_member',
    label: 'Fran member',
    description: 'Default Fran member identity fields used by POS-safe member resolution and counter sessions.',
    vertical: 'fran',
    status: 'active',
    installMode: 'default',
    installed: true,
    metadata: {
      defaultFor: 'fran',
      projection: 'member_identity'
    },
    fields: franMemberProfileFields
  },
  {
    key: 'fran_loyalty',
    label: 'Fran loyalty',
    description: 'Default Fran loyalty fields for tier, points, expiry, and next-tier progress.',
    vertical: 'fran',
    status: 'active',
    installMode: 'default',
    installed: true,
    metadata: {
      defaultFor: 'fran',
      projection: 'loyalty_status'
    },
    fields: franLoyaltyProfileFields
  },
  {
    key: 'fran_beauty_profile',
    label: 'Fran beauty profile',
    description: 'POS-safe beauty advice fields plus restricted notes filtered by backend projection rules.',
    vertical: 'beauty',
    status: 'active',
    installMode: 'default',
    installed: true,
    metadata: {
      defaultFor: 'fran',
      projection: 'counter_advice'
    },
    fields: franBeautyProfileFields
  }
]

export function getRegisteredProfilePack(packKey: string) {
  return profilePackDefinitions.find((pack) => pack.key === packKey) || null
}

export function getDefaultProfilePacks() {
  return profilePackDefinitions.filter((pack) => pack.installMode === 'default' || pack.installMode === 'system')
}

export function cloneProfilePack(pack: CrmProfilePackDefinition, installed = pack.installed ?? false): CrmProfilePackDefinition {
  return {
    ...pack,
    installed,
    fields: pack.fields.map((field) => ({ ...field }))
  }
}

export function readProfileValues(attributes: Record<string, unknown> | null | undefined): ProfileValues {
  const profilePacks = attributes?.profile_packs

  if (!profilePacks || typeof profilePacks !== 'object' || Array.isArray(profilePacks)) {
    return {}
  }

  return profilePacks as ProfileValues
}

export function mergeProfileValues(
  attributes: Record<string, unknown> | null | undefined,
  packKey: string,
  values: Record<string, unknown>
) {
  const nextAttributes = { ...(attributes || {}) }
  const profilePacks = readProfileValues(nextAttributes)

  nextAttributes.profile_packs = {
    ...profilePacks,
    [packKey]: {
      ...(profilePacks[packKey] || {}),
      ...values
    }
  }

  return nextAttributes
}

export function createCounterProfile(entity: CrmEntity, packs: CrmProfilePackDefinition[]) {
  const profileValues = readProfileValues(entity.attributes)
  const responsePacks: Record<string, { label: string, fields: Record<string, unknown> }> = {}
  const warnings: Array<{ type: string, label: string, severity: string }> = []

  for (const pack of packs) {
    const values = profileValues[pack.key] || {}
    const visibleFields: Record<string, unknown> = {}

    for (const field of pack.fields) {
      if (!field.posVisible || !(field.key in values)) {
        continue
      }

      visibleFields[field.key] = values[field.key]

      const warningType = field.metadata?.warningType
      const warningSeverity = String(field.metadata?.warningSeverity || 'review')

      if (typeof warningType === 'string') {
        const rawWarningValue = values[field.key]
        const warningValues: unknown[] = Array.isArray(rawWarningValue) ? rawWarningValue : [rawWarningValue]

        for (const warningValue of warningValues) {
          if (typeof warningValue === 'string' && warningValue.trim()) {
            warnings.push({
              type: warningType,
              label: toTitleCase(warningValue),
              severity: warningSeverity
            })
          }
        }
      }
    }

    if (Object.keys(visibleFields).length > 0) {
      responsePacks[pack.key] = {
        label: pack.label,
        fields: visibleFields
      }
    }
  }

  return {
    personId: entity.id,
    displayName: entity.label,
    source: 'crm',
    packs: responsePacks,
    warnings
  }
}

export function validateProfileFieldValues(
  fields: Record<string, unknown>,
  definitions: CrmSchemaField[]
) {
  const definitionByKey = new Map(definitions.map((definition) => [definition.key, definition]))
  const normalized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(fields)) {
    const definition = definitionByKey.get(key)

    if (!definition) {
      throw createError({ statusCode: 400, statusMessage: `Unknown profile field: ${key}` })
    }

    normalized[key] = normalizeFieldValue(definition, value)
  }

  return normalized
}

export function toDbProfilePackRow(workspaceId: string, pack: CrmProfilePackDefinition) {
  return {
    workspace_id: workspaceId,
    key: pack.key,
    label: pack.label,
    description: pack.description || null,
    vertical: pack.vertical || null,
    status: pack.status || 'active',
    install_mode: pack.installMode || 'manual',
    metadata: pack.metadata || {}
  }
}

export function toDbFieldRow(workspaceId: string, field: CrmSchemaField) {
  return {
    workspace_id: workspaceId,
    entity_type: 'person',
    key: field.key,
    label: field.label,
    value_type: field.type,
    required: field.required,
    origin: field.origin,
    pack_key: field.packKey,
    description: field.description,
    help_text: field.helpText,
    sensitivity_level: field.sensitivityLevel || 'internal',
    pos_visible: field.posVisible || false,
    cashier_editable: field.cashierEditable || false,
    marketing_usable: field.marketingUsable || false,
    ui_contexts: field.uiContexts || [],
    enum_values: field.enumValues || [],
    sort_order: field.sortOrder || 0,
    metadata: field.metadata || {}
  }
}

export function mapDbField(row: Record<string, unknown>): CrmSchemaField {
  return {
    key: String(row.key),
    label: String(row.label),
    type: String(row.value_type) as CrmSchemaField['type'],
    required: Boolean(row.required),
    origin: String(row.origin) as CrmSchemaField['origin'],
    packKey: row.pack_key ? String(row.pack_key) : null,
    description: row.description ? String(row.description) : null,
    helpText: row.help_text ? String(row.help_text) : null,
    sensitivityLevel: String(row.sensitivity_level || 'internal') as CrmSchemaField['sensitivityLevel'],
    posVisible: Boolean(row.pos_visible),
    cashierEditable: Boolean(row.cashier_editable),
    marketingUsable: Boolean(row.marketing_usable),
    uiContexts: Array.isArray(row.ui_contexts) ? row.ui_contexts.map(String) : [],
    enumValues: Array.isArray(row.enum_values) ? row.enum_values.map(String) : [],
    sortOrder: Number(row.sort_order || 0),
    metadata: isRecord(row.metadata) ? row.metadata : {}
  }
}

export function composeProfilePacks(
  packRows: Array<Record<string, unknown>>,
  fieldRows: Array<Record<string, unknown>>
): CrmProfilePackDefinition[] {
  const fields = fieldRows.map(mapDbField).filter((field) => field.packKey)
  const fieldsByPack = new Map<string, CrmSchemaField[]>()

  for (const field of fields) {
    const packKey = String(field.packKey)
    fieldsByPack.set(packKey, [...(fieldsByPack.get(packKey) || []), field])
  }

  const rowByKey = new Map(packRows.map((row) => [String(row.key), row]))
  const installedKeys = new Set(rowByKey.keys())
  const registryPacks = profilePackDefinitions.map((pack) => {
    const row = rowByKey.get(pack.key)

    if (!row) {
      return cloneProfilePack(pack, false)
    }

    return {
      key: String(row.key),
      label: String(row.label),
      description: row.description ? String(row.description) : pack.description,
      vertical: row.vertical ? String(row.vertical) : pack.vertical,
      status: String(row.status || 'active') as CrmProfilePackDefinition['status'],
      installMode: String(row.install_mode || 'manual') as CrmProfilePackDefinition['installMode'],
      installed: true,
      metadata: isRecord(row.metadata) ? row.metadata : pack.metadata,
      fields: (fieldsByPack.get(pack.key) || pack.fields).sort((left, right) => (left.sortOrder || 0) - (right.sortOrder || 0))
    }
  })

  for (const row of packRows) {
    const key = String(row.key)

    if (profilePackDefinitions.some((pack) => pack.key === key)) {
      continue
    }

    registryPacks.push({
      key,
      label: String(row.label),
      description: row.description ? String(row.description) : undefined,
      vertical: row.vertical ? String(row.vertical) : undefined,
      status: String(row.status || 'active') as CrmProfilePackDefinition['status'],
      installMode: String(row.install_mode || 'manual') as CrmProfilePackDefinition['installMode'],
      installed: installedKeys.has(key),
      metadata: isRecord(row.metadata) ? row.metadata : {},
      fields: (fieldsByPack.get(key) || []).sort((left, right) => (left.sortOrder || 0) - (right.sortOrder || 0))
    })
  }

  return registryPacks
}

function normalizeFieldValue(definition: CrmSchemaField, value: unknown) {
  switch (definition.type) {
    case 'single_select':
    case 'enum': {
      if (typeof value !== 'string') {
        throw createError({ statusCode: 400, statusMessage: `${definition.key} must be a string.` })
      }

      if (definition.enumValues?.length && !definition.enumValues.includes(value)) {
        throw createError({ statusCode: 400, statusMessage: `${definition.key} must match an allowed option.` })
      }

      return value
    }
    case 'multi_select': {
      if (!Array.isArray(value)) {
        throw createError({ statusCode: 400, statusMessage: `${definition.key} must be an array.` })
      }

      const normalized = value.map((item) => String(item))
      const invalid = normalized.find((item) => definition.enumValues?.length && !definition.enumValues.includes(item))

      if (invalid) {
        throw createError({ statusCode: 400, statusMessage: `${definition.key} contains an invalid option.` })
      }

      return normalized
    }
    case 'tag_list': {
      if (!Array.isArray(value)) {
        throw createError({ statusCode: 400, statusMessage: `${definition.key} must be an array.` })
      }

      return value.map((item) => String(item).trim()).filter(Boolean)
    }
    case 'number': {
      const numericValue = Number(value)

      if (!Number.isFinite(numericValue)) {
        throw createError({ statusCode: 400, statusMessage: `${definition.key} must be numeric.` })
      }

      return numericValue
    }
    case 'boolean':
      return Boolean(value)
    case 'json':
      return value
    default:
      return value === null || value === undefined ? '' : String(value)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function toTitleCase(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}
