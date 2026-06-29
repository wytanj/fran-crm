import type { CheckoutPayload } from './contracts'

interface BillingRuntimeConfig {
  billingMode?: unknown
  stripeSecretKey?: unknown
  paidPlanPriceId?: unknown
}

export function createCheckoutResponse(body: CheckoutPayload, config: BillingRuntimeConfig) {
  if (config.billingMode === 'demo' || !config.stripeSecretKey || !config.paidPlanPriceId) {
    return {
      mode: 'demo' as const,
      checkoutUrl: `/pricing?checkout=demo&plan=${body.plan}&email=${encodeURIComponent(body.email)}`,
      message: 'Demo billing boundary recorded. Add Stripe keys only when internal workspace billing needs live execution.'
    }
  }

  return {
    mode: 'manual' as const,
    checkoutUrl: `/pricing?billing=manual&plan=${body.plan}&email=${encodeURIComponent(body.email)}`,
    message: 'Stripe keys are present, but the production Stripe call remains an explicit internal integration boundary.'
  }
}
