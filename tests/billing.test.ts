import { describe, expect, it } from 'vitest'
import { createCheckoutResponse } from '../server/utils/billing'

describe('internal billing boundary behavior', () => {
  const payload = {
    email: 'founder@example.com',
    plan: 'hosted_growth' as const
  }

  it('uses demo checkout when billing is explicitly in demo mode', () => {
    const response = createCheckoutResponse(payload, {
      billingMode: 'demo',
      stripeSecretKey: 'sk_test_present',
      paidPlanPriceId: 'price_present'
    })

    expect(response.mode).toBe('demo')
    expect(response.checkoutUrl).toContain('/pricing?checkout=demo')
    expect(response.checkoutUrl).toContain('email=founder%40example.com')
  })

  it('uses demo checkout when Stripe configuration is incomplete', () => {
    const response = createCheckoutResponse(payload, {
      billingMode: 'live',
      stripeSecretKey: '',
      paidPlanPriceId: 'price_present'
    })

    expect(response.mode).toBe('demo')
  })

  it('keeps live billing behind an explicit integration boundary', () => {
    const response = createCheckoutResponse(payload, {
      billingMode: 'live',
      stripeSecretKey: 'sk_live_present',
      paidPlanPriceId: 'price_present'
    })

    expect(response.mode).toBe('manual')
    expect(response.checkoutUrl).toContain('/pricing?billing=manual')
    expect(response.message).toContain('internal integration boundary')
  })
})
