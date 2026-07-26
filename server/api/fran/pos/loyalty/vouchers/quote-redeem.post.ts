import { franLoyaltyQuoteRedeemDensPayloadSchema } from '../../../../../utils/contracts'
import { quoteRedeemDens } from '../../../../../fran/loyalty/vouchers'

export default defineEventHandler(async (event) => {
  const body = franLoyaltyQuoteRedeemDensPayloadSchema.parse(await readBody(event))
  try {
    const result = quoteRedeemDens(body)
    return { mode: 'live', ...result }
  } catch (e: any) {
    throw createError({
      statusCode: e?.statusCode || 400,
      statusMessage: e?.message || 'quote-redeem failed',
      message: e?.message || 'quote-redeem failed'
    })
  }
})
