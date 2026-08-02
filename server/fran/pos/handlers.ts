/**
 * Fran POS ↔ CRM counter handlers.
 * Accepts CRM-contract payloads and POS-native { raw, method } / { mode, memberId } shapes.
 * When x-pos-client: fran-pos, returns POS member / session shapes for live checkout.
 */
import type { CrmEntity } from '../../../app/types/crm'
import {
  franCounterSessionPayloadSchema,
  franMemberResolvePayloadSchema,
  type FranCounterSessionPayload,
  type FranMemberResolvePayload
} from '../../utils/contracts'
import { demoCrmGraph } from '../../utils/demo-crm'
import { createCounterProfile, profilePackDefinitions, readProfileValues } from '../../utils/profile-packs'
import { normalizeFwbTierKey, fwbTierRateFromKey, FWB_TIER_THRESHOLDS_SGD } from '../loyalty/fwb-engine'
import {
  findPersonByIdAuto,
  hasDurableCrmBackend,
  registerPosMemberAuto,
  resolvePosMemberAuto,
  type RegistryPerson
} from './member-registry'

const DEMO_WORKSPACE = '11111111-1111-4111-8111-111111111111'

type FranMemberStatus = 'exact' | 'candidates' | 'none' | 'ambiguous'

type FranMemberCandidate = {
  personId: string
  displayName: string
  memberRef: string | null
  mobile: string | null
}

function wantsPosShape(event: Parameters<typeof readBody>[0]) {
  const headers = getHeaders(event)
  const client = String(headers['x-pos-client'] || headers['X-Pos-Client'] || '').toLowerCase()
  return client === 'fran-pos'
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function posMethodToIdentifierType(method: string): FranMemberResolvePayload['identifier']['type'] {
  const m = String(method || '').toLowerCase()
  if (m === 'mobile' || m === 'phone') return 'phone'
  if (m === 'qr') return 'qr'
  if (m === 'barcode') return 'barcode'
  return 'member_number'
}

function parseMemberResolveBody(raw: unknown): FranMemberResolvePayload {
  const body = asRecord(raw)
  if (typeof body.raw === 'string' && body.raw.trim()) {
    const method = typeof body.method === 'string' ? body.method : 'member_number'
    return franMemberResolvePayloadSchema.parse({
      workspaceId:
        typeof body.workspaceId === 'string' && body.workspaceId.trim()
          ? body.workspaceId
          : DEMO_WORKSPACE,
      identifier: {
        type: posMethodToIdentifierType(method),
        value: String(body.raw).trim()
      },
      sourceSystem: typeof body.sourceSystem === 'string' ? body.sourceSystem : 'fran-pos'
    })
  }
  return franMemberResolvePayloadSchema.parse({
    ...body,
    workspaceId:
      typeof body.workspaceId === 'string' && body.workspaceId.trim()
        ? body.workspaceId
        : DEMO_WORKSPACE
  })
}

function parseCounterSessionBody(raw: unknown): FranCounterSessionPayload & {
  mode?: string
  memberId?: string
  registration?: { fullName: string; phone: string; birthday?: string | null }
} {
  const body = asRecord(raw)
  if (typeof body.mode === 'string') {
    const mode = String(body.mode)
    if (mode === 'non_member' || mode === 'tourist') {
      return {
        workspaceId:
          typeof body.workspaceId === 'string' && body.workspaceId.trim()
            ? String(body.workspaceId)
            : DEMO_WORKSPACE,
        sourceSystem: 'fran-pos',
        store: { id: 'ion-orchard', registerId: 'counter-01' },
        cashier: { id: 'pos-cashier' },
        mode,
        memberId: undefined
      }
    }
    const memberId = typeof body.memberId === 'string' ? body.memberId : undefined
    return {
      workspaceId:
        typeof body.workspaceId === 'string' && body.workspaceId.trim()
          ? String(body.workspaceId)
          : DEMO_WORKSPACE,
      personId: memberId,
      memberRef: memberId,
      sourceSystem: 'fran-pos',
      store: { id: 'ion-orchard', registerId: 'counter-01' },
      cashier: { id: 'pos-cashier' },
      mode: 'member',
      memberId,
      registration: body.registration as
        | { fullName: string; phone: string; birthday?: string | null }
        | undefined
    }
  }
  return franCounterSessionPayloadSchema.parse({
    ...body,
    workspaceId:
      typeof body.workspaceId === 'string' && body.workspaceId.trim()
        ? body.workspaceId
        : DEMO_WORKSPACE
  })
}

export async function handleFranMemberResolve(event: Parameters<typeof readBody>[0]) {
  const body = parseMemberResolveBody(await readBody(event))
  const workspaceId = body.workspaceId

  // Durable resolve when backend available and workspace is a real UUID (not only demo graph)
  if (hasDurableCrmBackend() && isUuid(workspaceId)) {
    try {
      const people = await resolvePosMemberAuto(workspaceId, body.identifier)
      if (people.length === 1) {
        const person = people[0]!
        const resolved = {
          status: 'exact' as const,
          personId: person.id,
          memberRef: person.memberNumber,
          candidates: [] as FranMemberCandidate[],
          warnings: [] as string[]
        }
        if (wantsPosShape(event)) {
          return toPosMemberResolutionFromEntities([person.entity], body, 'supabase')
        }
        return { mode: 'supabase' as const, ...resolved }
      }
      if (people.length > 1) {
        const resolved = {
          status: 'ambiguous' as const,
          personId: null as string | null,
          memberRef: null as string | null,
          candidates: people.map((p) => ({
            personId: p.id,
            displayName: p.label,
            memberRef: p.memberNumber,
            mobile: p.phone
          })),
          warnings: ['Multiple members matched the supplied identifier.']
        }
        if (wantsPosShape(event)) {
          return toPosMemberResolutionFromEntities(
            people.map((p) => p.entity),
            body,
            'supabase'
          )
        }
        return { mode: 'supabase' as const, ...resolved }
      }
      // none in DB — still fall through to demo aliases for FRAN-0001 etc. on demo workspace only
    } catch (e: any) {
      // fall through to demo
      console.warn('[fran-pos] durable member resolve failed', e?.message || e)
    }
  }

  const resolved = resolveFranMember(body)

  if (wantsPosShape(event)) {
    return toPosMemberResolution(resolved, body)
  }

  return {
    mode: 'demo',
    ...resolved
  }
}

export async function handleFranCounterSession(event: Parameters<typeof readBody>[0]) {
  const body = parseCounterSessionBody(await readBody(event))
  const workspaceId = body.workspaceId

  if (body.mode === 'non_member' || body.mode === 'tourist') {
    if (wantsPosShape(event)) {
      return buildPosExceptionSession(body.mode)
    }
    return {
      mode: 'demo',
      status: 'none',
      sessionId: null,
      member: null,
      warnings: [`Exception session: ${body.mode}`]
    }
  }

  // Durable registration → crm_entities in the linked CRM workspace
  if (body.registration && wantsPosShape(event)) {
    if (hasDurableCrmBackend() && isUuid(workspaceId)) {
      try {
        const person = await registerPosMemberAuto(workspaceId, {
          fullName: body.registration.fullName,
          phone: body.registration.phone,
          birthday: body.registration.birthday,
        })
        return buildPosSessionFromRegistryPerson(person, workspaceId, {
          persisted: true,
          created: person.created,
        })
      } catch (e: any) {
        console.warn('[fran-pos] durable registration failed', e?.message || e)
        // Fall back to ephemeral demo session so checkout is not blocked
        const demo = buildPosRegistrationSession(body.registration)
        return {
          ...demo,
          warnings: [
            ...(demo.warnings || []),
            `crm_persist_failed: ${e?.message || 'unknown'}`,
          ],
        }
      }
    }
    return buildPosRegistrationSession(body.registration)
  }

  // Durable session open for existing person id
  if (hasDurableCrmBackend() && isUuid(workspaceId) && (body.personId || body.memberId || body.memberRef)) {
    try {
      let person: RegistryPerson | null = null
      const id = body.personId || body.memberId
      if (id && isUuid(String(id))) {
        person = await findPersonByIdAuto(workspaceId, String(id))
      }
      if (!person && body.memberRef) {
        const matches = await resolvePosMemberAuto(workspaceId, {
          type: 'member_number',
          value: String(body.memberRef),
        })
        person = matches[0] || null
      }
      if (person) {
        if (wantsPosShape(event)) {
          return buildPosSessionFromRegistryPerson(person, workspaceId, {
            persisted: true,
            created: false,
          })
        }
        const crmSession = createFranCounterSessionFromEntity(person.entity, body)
        return { mode: 'supabase' as const, ...crmSession }
      }
    } catch (e: any) {
      console.warn('[fran-pos] durable counter session failed', e?.message || e)
    }
  }

  const crmSession = createFranCounterSession(body)

  if (wantsPosShape(event)) {
    return toPosCounterSession(crmSession, body)
  }

  return {
    mode: 'demo',
    ...crmSession
  }
}

function isUuid(value: unknown) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
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
      status: 'none' as const,
      sessionId: null as string | null,
      member: null as null,
      profileCardFields: {} as Record<string, unknown>,
      tierBadge: null as null,
      points: null as null,
      rewardAvailability: { eligible: [] as any[], blocked: [] as any[] },
      beautyProfileWarnings: [] as any[],
      sourceFreshness: [] as any[],
      warnings: ['No resolved member was available for the counter session.']
    }
  }

  const profileValues = readProfileValues(member.attributes)
  const memberValues = profileValues.fran_member || {}
  const loyaltyValues = profileValues.fran_loyalty || {}
  const counterProfile = createCounterProfile(member, profilePackDefinitions)
  const fwb = fwbFieldsFromLoyalty(loyaltyValues)

  return {
    status: 'created' as const,
    sessionId: buildSessionId(payload.workspaceId, member.id, payload.store?.id),
    member: {
      personId: member.id,
      displayName: member.label,
      memberRef: stringOrNull(memberValues.member_number) || member.externalIds.fran_member || null,
      mobile: stringOrNull(memberValues.mobile),
      preferredStore: stringOrNull(memberValues.preferred_store),
      consentStatus: stringOrNull(memberValues.consent_status),
      tierKey: fwb.tierKey,
      tierLabel: fwb.tierLabel,
      pointsBalance: fwb.pointsBalance,
      calendarYtdSpend: fwb.calendarYtdSpend,
      birthday: stringOrNull(memberValues.birthday),
      memberSince: stringOrNull(memberValues.member_since),
      email: stringOrNull((member.attributes as any).email)
    },
    profileCardFields: counterProfile.packs,
    tierBadge: {
      tier: fwb.tierKey,
      nextTier: fwb.nextTier,
      spendToNextTier: fwb.spendToNextTier
    },
    points: {
      balance: fwb.pointsBalance,
      expiringSoon: numberOrNull(loyaltyValues.points_expiring_soon) || 0,
      expiryDate: stringOrNull(loyaltyValues.points_expiry_date)
    },
    rewardAvailability: {
      eligible: [
        { rewardRef: 'fwb_dens_200', label: 'FWB 200 pts → $6', pointsRequired: 200 },
        { rewardRef: 'fwb_dens_500', label: 'FWB 500 pts → $20', pointsRequired: 500 }
      ],
      blocked: [] as any[]
    },
    beautyProfileWarnings: counterProfile.warnings,
    sourceFreshness: [
      {
        sourceSystem: payload.sourceSystem,
        status: 'demo',
        observedAt: new Date().toISOString()
      }
    ],
    warnings: [
      ...counterProfile.warnings.map((warning) => warning.label),
      `fwb_tier_rate=${fwbTierRateFromKey(fwb.tierKey)}`,
      'mode:demo'
    ]
  }
}

function toPosMemberResolution(
  resolved: ReturnType<typeof resolveFranMember>,
  body: FranMemberResolvePayload
) {
  const input = {
    raw: body.identifier.value,
    method:
      body.identifier.type === 'phone'
        ? ('mobile' as const)
        : body.identifier.type === 'qr'
          ? ('qr' as const)
          : body.identifier.type === 'barcode'
            ? ('barcode' as const)
            : ('member_number' as const)
  }

  const personIds =
    resolved.status === 'exact' && resolved.personId
      ? [resolved.personId]
      : resolved.candidates.map((c) => c.personId)

  const matches = personIds
    .map((id) => demoCrmGraph.entities.find((e) => e.id === id && e.type === 'person'))
    .filter(Boolean)
    .map((entity) => entityToPosMember(entity!))

  return {
    mode: 'demo',
    status: matches.length > 0 ? 'matched' : 'none',
    input,
    matches,
    warnings: resolved.warnings
  }
}

function toPosMemberResolutionFromEntities(
  entities: CrmEntity[],
  body: FranMemberResolvePayload,
  mode: 'demo' | 'supabase'
) {
  const input = {
    raw: body.identifier.value,
    method:
      body.identifier.type === 'phone'
        ? ('mobile' as const)
        : body.identifier.type === 'qr'
          ? ('qr' as const)
          : body.identifier.type === 'barcode'
            ? ('barcode' as const)
            : ('member_number' as const)
  }
  const matches = entities.map((entity) => entityToPosMember(entity))
  return {
    mode,
    status: matches.length > 0 ? 'matched' : 'none',
    input,
    matches,
    warnings: [] as string[]
  }
}

function buildPosSessionFromRegistryPerson(
  person: RegistryPerson,
  workspaceId: string,
  opts: { persisted: boolean; created: boolean }
) {
  const member = entityToPosMember(person.entity)
  const now = new Date()
  return {
    sessionId: buildSessionId(workspaceId, person.id, 'pos'),
    mode: 'member' as const,
    member,
    activePerks: activePerksFor(member),
    pointsExpiryAlert: pointsExpiryFor(member, member.pointsExpireAt),
    startedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 45 * 60 * 1000).toISOString(),
    prompts: [
      opts.created
        ? `New member ${member.memberNo} created in Fran CRM`
        : `${member.name} · ${member.tierLabel || member.tier} · ${member.pointsBalance} pts`,
    ],
    warnings: opts.persisted
      ? opts.created
        ? ['member_persisted', 'mode:supabase']
        : ['member_existing', 'mode:supabase']
      : ['mode:demo'],
    source: opts.persisted ? 'fran-crm' : 'fran-crm-demo',
    crmWorkspaceId: workspaceId,
    personId: person.id,
  }
}

function createFranCounterSessionFromEntity(entity: CrmEntity, body: FranCounterSessionPayload) {
  // Reuse createFranCounterSession shape by temporarily using entity fields
  const payload = { ...body, personId: entity.id, memberRef: entity.externalIds?.fran_member }
  // Inject entity into demo finder via personId match against a synthetic path:
  const profileValues = readProfileValues(entity.attributes)
  const memberValues = profileValues.fran_member || {}
  const loyaltyValues = profileValues.fran_loyalty || {}
  const counterProfile = createCounterProfile(entity, profilePackDefinitions)
  const fwb = fwbFieldsFromLoyalty(loyaltyValues)
  return {
    status: 'created' as const,
    sessionId: buildSessionId(body.workspaceId, entity.id, body.store?.id),
    member: {
      personId: entity.id,
      displayName: entity.label,
      memberRef: stringOrNull(memberValues.member_number) || entity.externalIds.fran_member || entity.id,
      mobile: stringOrNull(memberValues.mobile) || stringOrNull((entity.attributes as any).phone),
      email: stringOrNull((entity.attributes as any).email),
      tierKey: fwb.tierKey,
      tierLabel: fwb.tierLabel,
      pointsBalance: fwb.pointsBalance,
      calendarYtdSpend: fwb.calendarYtdSpend,
      memberSince: stringOrNull(memberValues.member_since),
      birthday: stringOrNull(memberValues.birthday),
    },
    profileCardFields: counterProfile.packs || {},
    tierBadge: {
      tier: fwb.tierKey,
      nextTier: fwb.nextTier,
      spendToNextTier: fwb.spendToNextTier,
    },
    points: {
      balance: fwb.pointsBalance,
      expiringSoon: numberOrNull(loyaltyValues.points_expiring_soon) || 0,
      expiryDate: stringOrNull(loyaltyValues.points_expiry_date),
    },
    rewardAvailability: { eligible: [] as any[], blocked: [] as any[] },
    beautyProfileWarnings: counterProfile.warnings,
    sourceFreshness: [
      {
        sourceSystem: body.sourceSystem || 'fran-pos',
        status: 'live',
        observedAt: new Date().toISOString(),
      },
    ],
    warnings: ['mode:supabase'],
  }
}

function toPosCounterSession(
  crmSession: ReturnType<typeof createFranCounterSession>,
  body: FranCounterSessionPayload
) {
  if (crmSession.status !== 'created' || !crmSession.member) {
    return {
      sessionId: `fran-none-${Date.now()}`,
      mode: 'member' as const,
      member: null,
      activePerks: [],
      pointsExpiryAlert: null,
      startedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
      prompts: ['No CRM member for this lookup.'],
      warnings: crmSession.warnings || ['Member not found in Fran CRM demo graph.'],
      source: 'fran-crm-demo'
    }
  }

  const entity = demoCrmGraph.entities.find((e) => e.id === crmSession.member!.personId)
  const member = entity
    ? entityToPosMember(entity)
    : {
        id: crmSession.member.personId,
        crmCustomerId: crmSession.member.personId,
        memberNo: crmSession.member.memberRef || crmSession.member.personId,
        name: crmSession.member.displayName,
        phone: crmSession.member.mobile || '',
        email: crmSession.member.email || null,
        tier: crmSession.member.tierKey || 'F1',
        tierLabel: crmSession.member.tierLabel || 'Tier 1',
        pointsBalance: crmSession.member.pointsBalance || 0,
        calendarYtdSpend: crmSession.member.calendarYtdSpend || 0,
        trailingTwelveMonthSpend: crmSession.member.calendarYtdSpend || 0,
        memberSince: crmSession.member.memberSince || null,
        birthday: crmSession.member.birthday || null,
        birthdayMonth: null as number | null,
        pointsExpireAt: crmSession.points?.expiryDate || null,
        expiresAt: null as string | null,
        rewardCount: 0,
        tourist: false,
        warnings: [] as string[]
      }

  const now = new Date()
  return {
    sessionId: crmSession.sessionId || `fran-${body.workspaceId}-${member.id}-${now.getTime()}`,
    mode: 'member' as const,
    member,
    activePerks: activePerksFor(member),
    pointsExpiryAlert: pointsExpiryFor(member, crmSession.points?.expiryDate || null),
    startedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 45 * 60 * 1000).toISOString(),
    prompts: [
      `${member.name} · ${member.tierLabel || member.tier} · ${member.pointsBalance} pts`,
      `YTD spend SGD ${Number(member.calendarYtdSpend || 0).toFixed(0)} (FWB calendar year)`
    ],
    warnings: [
      ...(crmSession.warnings || []),
      'CRM demo member (ledger demo until workspace seeded)'
    ],
    source: 'fran-crm-demo'
  }
}

function buildPosExceptionSession(mode: 'non_member' | 'tourist') {
  const now = new Date()
  return {
    sessionId: `fran-${mode}-${now.getTime()}`,
    mode,
    member:
      mode === 'tourist'
        ? {
            id: 'tourist',
            crmCustomerId: 'tourist',
            memberNo: 'TOURIST',
            name: 'Tourist',
            phone: '',
            email: null,
            tier: 'Tourist',
            tierLabel: 'Tourist',
            pointsBalance: 0,
            calendarYtdSpend: 0,
            trailingTwelveMonthSpend: 0,
            memberSince: null,
            birthday: null,
            birthdayMonth: null,
            pointsExpireAt: null,
            expiresAt: null,
            rewardCount: 0,
            tourist: true,
            warnings: ['Tourist — no FWB earn']
          }
        : null,
    activePerks: [],
    pointsExpiryAlert: null,
    startedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 45 * 60 * 1000).toISOString(),
    prompts: [mode === 'tourist' ? 'Tourist checkout — no points' : 'Non-member checkout'],
    warnings: [],
    source: 'fran-crm-demo'
  }
}

function buildPosRegistrationSession(reg: {
  fullName: string
  phone: string
  birthday?: string | null
}) {
  const now = new Date()
  const id = `fran-member-new-${now.getTime()}`
  return {
    sessionId: `fran-reg-${now.getTime()}`,
    mode: 'member' as const,
    member: {
      id,
      crmCustomerId: id,
      memberNo: `FRAN${Math.floor(3000 + Math.random() * 6000)}`,
      name: reg.fullName,
      phone: reg.phone,
      email: null,
      tier: 'F1',
      tierLabel: 'Tier 1',
      pointsBalance: 0,
      calendarYtdSpend: 0,
      trailingTwelveMonthSpend: 0,
      memberSince: now.toISOString().slice(0, 10),
      birthday: reg.birthday ?? null,
      birthdayMonth: reg.birthday ? Number(reg.birthday.slice(5, 7)) : null,
      pointsExpireAt: null,
      expiresAt: null,
      rewardCount: 0,
      tourist: false,
      warnings: ['New member (CRM demo — not persisted)']
    },
    activePerks: [],
    pointsExpiryAlert: null,
    startedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 45 * 60 * 1000).toISOString(),
    prompts: ['New F1 member — earn at 1.0×'],
    warnings: ['mode:demo'],
    source: 'fran-crm-demo'
  }
}

function entityToPosMember(entity: CrmEntity) {
  const profileValues = readProfileValues(entity.attributes)
  const memberValues = profileValues.fran_member || {}
  const loyaltyValues = profileValues.fran_loyalty || {}
  const fwb = fwbFieldsFromLoyalty(loyaltyValues)
  const birthday = stringOrNull(memberValues.birthday)
  return {
    id: entity.id,
    crmCustomerId: entity.externalIds.pos || entity.id,
    memberNo: stringOrNull(memberValues.member_number) || entity.externalIds.fran_member || entity.id,
    name: entity.label,
    phone: stringOrNull(memberValues.mobile) || stringOrNull((entity.attributes as any).phone) || '',
    email: stringOrNull((entity.attributes as any).email),
    tier: fwb.tierKey,
    tierLabel: fwb.tierLabel,
    pointsBalance: fwb.pointsBalance,
    calendarYtdSpend: fwb.calendarYtdSpend,
    trailingTwelveMonthSpend: fwb.calendarYtdSpend,
    memberSince: stringOrNull(memberValues.member_since),
    birthday,
    birthdayMonth: birthday ? Number(birthday.slice(5, 7)) : null,
    pointsExpireAt: stringOrNull(loyaltyValues.points_expiry_date),
    expiresAt: stringOrNull(loyaltyValues.points_expiry_date),
    rewardCount: 1,
    tourist: false,
    warnings: [] as string[]
  }
}

function fwbFieldsFromLoyalty(loyaltyValues: Record<string, unknown>) {
  const rawTier = stringOrNull(loyaltyValues.tier) || stringOrNull(loyaltyValues.tier_key) || 'F1'
  let tierKey = normalizeFwbTierKey(rawTier)
  if (!tierKey || tierKey === 'Tourist') {
    const legacy = String(rawTier).toLowerCase()
    if (legacy.includes('plat') || legacy.includes('gold')) tierKey = 'F3'
    else if (legacy.includes('silver')) tierKey = 'F2'
    else tierKey = 'F1'
  }
  if (tierKey === 'Tourist') tierKey = 'F1'
  const calendarYtdSpend =
    numberOrNull(loyaltyValues.calendar_ytd_spend) ?? numberOrNull(loyaltyValues.ytd_spend) ?? 0
  const pointsBalance = numberOrNull(loyaltyValues.points_balance) || 0
  const thresholds = FWB_TIER_THRESHOLDS_SGD
  const current = thresholds.find((t) => t.key === tierKey) || thresholds[0]!
  const next = thresholds.find((t) => t.annualSpend > current.annualSpend)
  return {
    tierKey,
    tierLabel: current.label,
    pointsBalance,
    calendarYtdSpend,
    nextTier: next?.key || null,
    spendToNextTier: next ? Math.max(0, next.annualSpend - calendarYtdSpend) : 0
  }
}

function activePerksFor(member: ReturnType<typeof entityToPosMember>) {
  return [
    {
      id: `${member.id}:free-sample-threshold`,
      kind: 'free_sample_threshold',
      title: 'Free sample threshold',
      description: 'CRM perk: sample at SGD 75 basket.',
      valueLabel: 'Free sample at SGD 75.00',
      thresholdAmount: 75,
      currency: 'SGD',
      tier: null,
      expiresAt: null
    },
    {
      id: `${member.id}:tier-offer`,
      kind: 'tier_specific_offer',
      title: `${member.tierLabel} earn`,
      description: `FWB tier rate ${fwbTierRateFromKey(member.tier)}× on qualifying spend.`,
      valueLabel: `${fwbTierRateFromKey(member.tier)}× earn`,
      thresholdAmount: null,
      currency: 'SGD',
      tier: member.tier,
      expiresAt: null
    }
  ]
}

function pointsExpiryFor(member: ReturnType<typeof entityToPosMember>, expiryDate: string | null) {
  if (!expiryDate || member.pointsBalance <= 0) return null
  return {
    amountAtRisk: Math.min(200, member.pointsBalance),
    expiresAt: expiryDate,
    lookaheadDays: 30,
    calculatedAt: new Date().toISOString()
  }
}

function findMemberForSession(payload: FranCounterSessionPayload) {
  return demoCrmGraph.entities.find((entity) => {
    if (entity.type !== 'person') return false
    if (payload.personId && normalizeLookup(entity.id) === normalizeLookup(payload.personId)) {
      return true
    }
    if (payload.memberRef) {
      return (
        matchesIdentifier(entity, 'member_number', payload.memberRef) ||
        matchesIdentifier(entity, 'external_ref', payload.memberRef)
      )
    }
    return false
  })
}

function matchesIdentifier(
  entity: CrmEntity,
  type: FranMemberResolvePayload['identifier']['type'],
  value: string
) {
  const profileValues = readProfileValues(entity.attributes)
  const memberValues = profileValues.fran_member || {}

  if (type === 'phone') {
    const lookupPhone = normalizePhone(value)
    const phones = [entity.attributes.phone, memberValues.mobile]
      .map((item) => normalizePhone(String(item || '')))
      .filter(Boolean)
    return phones.some((phone) => phone === lookupPhone || phone.endsWith(lookupPhone))
  }

  const lookup = normalizeLookup(value)
  const identifiers = [
    entity.id,
    `fran:${entity.id}`,
    entity.externalIds.pos,
    entity.externalIds.fran_member,
    memberValues.member_number
  ]
    .map((item) => normalizeLookup(String(item || '')))
    .filter(Boolean)

  // POS mock aliases → CRM demo Ava (person_001 / FRAN-0001)
  if (identifiers.includes('fran0001') || identifiers.includes('person001')) {
    if (
      lookup === 'fran1001' ||
      lookup === 'franmember001' ||
      lookup === 'person001' ||
      lookup === 'fran0001'
    ) {
      return true
    }
  }

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
  return `fran-sess-${workspaceId.slice(0, 8)}-${personId}-${storeId || 'store'}-${Date.now().toString(36)}`
}

function stringOrNull(value: unknown) {
  if (value == null) return null
  const s = String(value).trim()
  return s || null
}

function numberOrNull(value: unknown) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function normalizeLookup(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
}

function normalizePhone(value: string) {
  return String(value || '').replace(/[^\d+]/g, '')
}
