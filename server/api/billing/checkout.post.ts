import { createCheckoutResponse } from '../../utils/billing'
import { checkoutPayloadSchema } from '../../utils/contracts'

export default defineEventHandler(async (event) => {
  const body = checkoutPayloadSchema.parse(await readBody(event))
  const config = useRuntimeConfig()

  return createCheckoutResponse(body, {
    billingMode: config.public.billingMode,
    stripeSecretKey: config.stripeSecretKey,
    paidPlanPriceId: config.public.paidPlanPriceId
  })
})
