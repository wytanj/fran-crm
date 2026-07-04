import { describe, expect, it } from 'vitest'
import {
  applyCapabilityGrants,
  capabilitiesForProfile,
  defaultCapabilitiesForRole
} from '../server/utils/agent-capabilities'

describe('agent capability profiles', () => {
  it('allows managers to ask customer purchase analytics questions', () => {
    const capabilities = capabilitiesForProfile('manager')

    expect(capabilities).toContain('agent.tool.execute')
    expect(capabilities).toContain('analytics.customer_list.read')
    expect(capabilities).toContain('customer.purchase.read')
    expect(capabilities).not.toContain('schema.manage')
  })

  it('keeps cashier capabilities counter-safe', () => {
    const capabilities = capabilitiesForProfile('cashier')

    expect(capabilities).toEqual(['returns.check'])
    expect(capabilities).not.toContain('analytics.customer_list.read')
    expect(capabilities).not.toContain('customer.purchase.read')
  })

  it('maps existing workspace roles onto capability profiles', () => {
    expect(defaultCapabilitiesForRole('owner')).toContain('agent.connector.manage')
    expect(defaultCapabilitiesForRole('admin')).toContain('integration.manage')
    expect(defaultCapabilitiesForRole('member')).toContain('returns.override.request')
    expect(defaultCapabilitiesForRole('agent')).toContain('schema.propose')
  })

  it('applies workspace grant overrides after defaults', () => {
    const capabilities = applyCapabilityGrants(capabilitiesForProfile('analyst'), [
      {
        principal_type: 'user',
        principal_key: 'user_123',
        capability: 'customer.purchase.read',
        effect: 'allow'
      },
      {
        principal_type: 'user',
        principal_key: 'user_123',
        capability: 'analytics.customer_list.read',
        effect: 'deny'
      }
    ])

    expect(capabilities).toContain('customer.purchase.read')
    expect(capabilities).not.toContain('analytics.customer_list.read')
  })
})
