import { describe, expect, it } from 'vitest'
import { demoCrmGraph, shopifyCustomerFields } from '../server/utils/demo-crm'
import { createCounterProfile, profilePackDefinitions } from '../server/utils/profile-packs'

describe('base CRM graph contract', () => {
  it('ships the minimal commerce customer fields agents can depend on', () => {
    const fields = new Map(shopifyCustomerFields.map((field) => [field.key, field]))

    expect(fields.get('email')).toMatchObject({
      type: 'email',
      required: true,
      origin: 'core'
    })

    for (const key of [
      'phone',
      'first_name',
      'last_name',
      'accepts_marketing',
      'tags',
      'note',
      'default_address',
      'orders_count',
      'total_spent',
      'currency',
      'last_order_at',
      'source_channel',
      'company_name',
      'lifecycle_stage'
    ]) {
      expect(fields.has(key)).toBe(true)
    }
  })

  it('does not duplicate base field keys', () => {
    const keys = shopifyCustomerFields.map((field) => field.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('keeps relationships attached to known graph entities', () => {
    const entityIds = new Set(demoCrmGraph.entities.map((entity) => entity.id))

    for (const relationship of demoCrmGraph.relationships) {
      expect(entityIds.has(relationship.fromEntityId)).toBe(true)
      expect(entityIds.has(relationship.toEntityId)).toBe(true)
      expect(relationship.confidence).toBeGreaterThan(0)
      expect(relationship.confidence).toBeLessThanOrEqual(1)
    }
  })

  it('includes agent proposal states for approval-first workflows', () => {
    expect(demoCrmGraph.proposals.map((proposal) => proposal.status)).toEqual(
      expect.arrayContaining(['draft', 'needs_approval', 'approved'])
    )
  })

  it('ships Fran profile packs as installed defaults without making them core schema', () => {
    const ava = demoCrmGraph.entities.find((entity) => entity.id === 'person_001')
    const memberPack = demoCrmGraph.profilePacks.find((pack) => pack.key === 'fran_member')
    const loyaltyPack = demoCrmGraph.profilePacks.find((pack) => pack.key === 'fran_loyalty')
    const beautyPack = demoCrmGraph.profilePacks.find((pack) => pack.key === 'fran_beauty_profile')

    expect(memberPack).toMatchObject({
      installed: true,
      installMode: 'default',
      fields: expect.arrayContaining([
        expect.objectContaining({
          key: 'member_number',
          packKey: 'fran_member',
          posVisible: true
        })
      ])
    })
    expect(loyaltyPack).toMatchObject({
      installed: true,
      fields: expect.arrayContaining([
        expect.objectContaining({
          key: 'points_balance',
          packKey: 'fran_loyalty',
          posVisible: true
        })
      ])
    })
    expect(beautyPack).toMatchObject({
      installed: true,
      fields: expect.arrayContaining([
        expect.objectContaining({
          key: 'reported_sensitivities',
          packKey: 'fran_beauty_profile',
          sensitivityLevel: 'confidential',
          marketingUsable: false
        })
      ])
    })
    expect(ava?.attributes['profile_packs']).toMatchObject({
      fran_member: {
        member_number: 'FRAN-0001'
      },
      fran_loyalty: {
        tier: 'Gold',
        points_balance: 18420
      },
      fran_beauty_profile: {
        skin_type: 'Combination',
        reported_sensitivities: ['retinol', 'fragrance']
      }
    })
  })

  it('keeps Fran defaults in the generic pack registry', () => {
    const packKeys = profilePackDefinitions.map((pack) => pack.key)

    expect(packKeys).toEqual(['fran_member', 'fran_loyalty', 'fran_beauty_profile'])
  })

  it('counter profile only projects POS-visible profile fields and advisory warnings', () => {
    const ava = demoCrmGraph.entities.find((entity) => entity.id === 'person_001')
    expect(ava).toBeTruthy()

    const counterProfile = createCounterProfile(ava!, demoCrmGraph.profilePacks)

    expect(counterProfile.packs.fran_beauty_profile.fields).toMatchObject({
      skin_type: 'Combination',
      reported_sensitivities: ['retinol', 'fragrance']
    })
    expect(counterProfile.packs.fran_beauty_profile.fields).not.toHaveProperty('reported_sensitivity_note')
    expect(counterProfile.packs.fran_beauty_profile.fields).not.toHaveProperty('advisor_notes')
    expect(counterProfile.packs.fran_loyalty.fields).not.toHaveProperty('ytd_spend')
    expect(counterProfile.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'reported_sensitivity', label: 'Retinol' })
      ])
    )
  })
})
