import { franLoyaltyAuthorizeVoucherPayloadSchema } from '../../../../../utils/contracts'
import { authorizeVoucher } from '../../../../../fran/loyalty/vouchers'

export default defineEventHandler(async (event) => {
  const body = franLoyaltyAuthorizeVoucherPayloadSchema.parse(await readBody(event))
  const result = authorizeVoucher(body)
  if (!result.valid) {
    throw createError({
      statusCode: 400,
      statusMessage: result.reason || 'Voucher not valid',
      message: result.reason || 'Voucher not valid',
      data: result
    })
  }
  return { mode: 'live', ...result }
})
