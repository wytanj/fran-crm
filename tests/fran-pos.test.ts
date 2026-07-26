import { describe, expect, it } from 'vitest'
import { createFranCounterSession, resolveFranMember } from '../server/fran/pos/handlers'

const workspaceId = '11111111-1111-4111-8111-111111111111'

describe('Fran POS mock contracts', () => {
  it('resolves the demo member by member number', () => {
    const response = resolveFranMember({
      workspaceId,
      identifier: {
        type: 'member_number',
        value: 'FRAN-0001'
      },
      sourceSystem: 'fran-pos'
    })

    expect(response).toMatchObject({
      status: 'exact',
      personId: 'person_001',
      memberRef: 'FRAN-0001'
    })
  })

  it('resolves POS mock alias FRAN1001 to Ava', () => {
    const response = resolveFranMember({
      workspaceId,
      identifier: { type: 'member_number', value: 'FRAN1001' },
      sourceSystem: 'fran-pos'
    })
    expect(response.status).toBe('exact')
    expect(response.personId).toBe('person_001')
  })

  it('creates a counter session with FWB tier fields', () => {
    const response = createFranCounterSession({
      workspaceId,
      personId: 'person_001',
      sourceSystem: 'fran-pos',
      store: { id: 'ion-orchard', registerId: 'counter-01' },
      cashier: { id: 'staff-001' }
    })

    expect(response).toMatchObject({
      status: 'created',
      member: {
        personId: 'person_001',
        memberRef: 'FRAN-0001',
        tierKey: 'F3',
        pointsBalance: 18420
      },
      tierBadge: {
        tier: 'F3'
      },
      points: {
        balance: 18420
      }
    })
    expect(response.profileCardFields.fran_beauty_profile.fields).toMatchObject({
      skin_type: 'Combination',
      reported_sensitivities: ['retinol', 'fragrance']
    })
    expect(response.profileCardFields.fran_beauty_profile.fields).not.toHaveProperty('reported_sensitivity_note')
    expect(response.profileCardFields.fran_beauty_profile.fields).not.toHaveProperty('advisor_notes')
  })
})
