import { describe, expect, it } from 'vitest'
import { entityFromRow } from '../server/fran/pos/member-registry'

describe('member-registry helpers', () => {
  it('maps entity rows to CrmEntity shape for POS sessions', () => {
    const entity = entityFromRow({
      id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      workspace_id: 'e4324d8c-b88e-4535-a19f-2debef9feac9',
      type: 'person',
      label: 'Test Member',
      external_ids: { fran_member: 'FRAN-4242' },
      attributes: {
        phone: '+6591111111',
        profile_packs: {
          fran_member: { member_number: 'FRAN-4242', mobile: '+6591111111' },
          fran_loyalty: { tier: 'F1', tier_key: 'F1', points_balance: 0 },
        },
      },
      tags: ['F1', 'pos-registered'],
      created_at: '2026-08-02T00:00:00.000Z',
      updated_at: '2026-08-02T00:00:00.000Z',
    })

    expect(entity).toMatchObject({
      id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      type: 'person',
      label: 'Test Member',
      externalIds: { fran_member: 'FRAN-4242' },
    })
    expect(entity.attributes.phone).toBe('+6591111111')
  })
})
