import type { CrmEntity } from '../../../app/types/crm'
import {
  franCounterSessionPayloadSchema,
  franMemberResolvePayloadSchema,
  type FranCounterSessionPayload,
  type FranMemberResolvePayload
} from '../../utils/contracts'
import { demoCrmGraph } from '../../utils/demo-crm'
import { createCounterProfile, profilePackDefinitions, readProfileValues } from '../../utils/profile-packs'

type FranMemberStatus = 'exact' | 'candidates' | 'none' | 'ambiguous'

type FranMemberCandidate = {
  personId: string
  displayName: string
  memberRef: string | null
  mobile: string | null
}

export async function handleFranMemberResolve(event: Parameters<typeof readBody>[0]) {
  const body = franMemberResolvePayloadSchema.parse(await readBody(event))

  return {
    mode: 'mock',
    ...resolveFranMember(body)
  }
}

export async function handleFranCounterSession(event: Parameters<typeof readBody>[0]) {
  const body = franCounterSessionPayloadSchema.parse(await readBody(event))

  return {
    mode: 'mock',
    ...createFranCounterSession(body)
  }
}

export function resolveFranMember(payload: FranMemberResolvePayload): {
  status: FranMemberStatus
  personId: string | null
  memberRef: string | null
  candidates: FranMemberCandidate[]
  warnings: string[]
} {
  const matches = demoCrmGraph.entities
    .filter((entity) => entity.type === 'person')
    .filter((entity) => matchesIdentifier(entity, payload.identifier.type, payload.identifier.value))

  if (matches.length === 1) {
    const match = matches[0]!
    const candidate = toMemberCandidate(match)

    return {
      status: 'exact',
      personId: candidate.personId,
      memberRef: candidate.memberRef,
      candidates: [],
      warnings: []
    }
  }

  if (matches.length > 1) {
    return {
      status: 'ambiguous',
      personId: null,
      memberRef: null,
      candidates: matches.map(toMemberCandidate),
      warnings: ['Multiple members matched the supplied identifier.']
    }
  }

  return {
    status: 'none',
    personId: null,
    memberRef: null,
    candidates: [],
    warnings: ['No Fran member matched the supplied identifier.']
  }
}

export function createFranCounterSession(payload: FranCounterSessionPayload) {
  const member = findMemberForSession(payload)

  if (!member) {
    return {
      status: 'none',
      sessionId: null,
      member: null,
      profileCardFields: {},
      tierBadge: null,
      points: null,
      rewardAvailability: {
        eligible: [],
        blocked: []
      },
      beautyProfileWarnings: [],
      sourceFreshness: [],
      warnings: ['No resolved member was available for the counter session.']
    }
  }

  const profileValues = readProfileValues(member.attributes)
  const memberValues = profileValues.fran_member || {}
  const loyaltyValues = profileValues.fran_loyalty || {}
  const counterProfile = createCounterProfile(member, profilePackDefinitions)

  return {
    status: 'created',
    sessionId: buildSessionId(payload.workspaceId, member.id, payload.store.id),
    member: {
      personId: member.id,
      displayName: member.label,
      memberRef: stringOrNull(memberValues.member_number) || member.externalIds.fran_member || null,
      mobile: stringOrNull(memberValues.mobile),
      preferredStore: stringOrNull(memberValues.preferred_store),
      consentStatus: stringOrNull(memberValues.consent_status)
    },
    profileCardFields: counterProfile.packs,
    tierBadge: {
      tier: stringOrNull(loyaltyValues.tier),
      nextTier: stringOrNull(loyaltyValues.next_tier),
      spendToNextTier: numberOrNull(loyaltyValues.spend_to_next_tier)
    },
    points: {
      balance: numberOrNull(loyaltyValues.points_balance) || 0,
      expiringSoon: numberOrNull(loyaltyValues.points_expiring_soon) || 0,
      expiryDate: stringOrNull(loyaltyValues.points_expiry_date)
    },
    rewardAvailability: {
      eligible: [
        {
          rewardRef: 'fran_reward_5_off',
          label: '$5 reward',
          pointsRequired: 5000
        },
        {
          rewardRef: 'fran_reward_member_gift',
          label: 'Member gift',
          pointsRequired: 0
        }
      ],
      blocked: [
        {
          rewardRef: 'fran_reward_platinum_bonus',
          label: 'Platinum bonus',
          reason: 'Current tier is below Platinum.'
        }
      ]
    },
    beautyProfileWarnings: counterProfile.warnings,
    sourceFreshness: [
      {
        sourceSystem: payload.sourceSystem,
        status: 'mock',
        observedAt: '2026-06-29T00:00:00.000Z'
      }
    ],
    warnings: counterProfile.warnings.map((warning) => warning.label)
  }
}

function findMemberForSession(payload: FranCounterSessionPayload) {
  return demoCrmGraph.entities.find((entity) => {
    if (entity.type !== 'person') {
      return false
    }

    if (payload.personId && normalizeLookup(entity.id) === normalizeLookup(payload.personId)) {
      return true
    }

    if (payload.memberRef) {
      return matchesIdentifier(entity, 'member_number', payload.memberRef)
        || matchesIdentifier(entity, 'external_ref', payload.memberRef)
    }

    return false
  })
}

function matchesIdentifier(entity: CrmEntity, type: FranMemberResolvePayload['identifier']['type'], value: string) {
  const profileValues = readProfileValues(entity.attributes)
  const memberValues = profileValues.fran_member || {}

  if (type === 'phone') {
    const lookupPhone = normalizePhone(value)
    const phones = [
      entity.attributes.phone,
      memberValues.mobile
    ].map((item) => normalizePhone(String(item || ''))).filter(Boolean)

    return phones.some((phone) => phone === lookupPhone || phone.endsWith(lookupPhone))
  }

  const lookup = normalizeLookup(value)
  const identifiers = [
    entity.id,
    `fran:${entity.id}`,
    entity.externalIds.pos,
    entity.externalIds.fran_member,
    memberValues.member_number
  ].map((item) => normalizeLookup(String(item || ''))).filter(Boolean)

  return identifiers.includes(lookup)
}

function toMemberCandidate(entity: CrmEntity): FranMemberCandidate {
  const profileValues = readProfileValues(entity.attributes)
  const memberValues = profileValues.fran_member || {}

  return {
    personId: entity.id,
    displayName: entity.label,
    memberRef: stringOrNull(memberValues.member_number) || entity.externalIds.fran_member || null,
    mobile: stringOrNull(memberValues.mobile)
  }
}

function buildSessionId(workspaceId: string, personId: string, storeId?: string) {
  return `fran_session_${normalizeLookup([workspaceId, personId, storeId || 'counter'].join('_')).slice(0, 36)}`
}

function normalizeLookup(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, '')
}

function stringOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null
}

function numberOrNull(value: unknown) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}
