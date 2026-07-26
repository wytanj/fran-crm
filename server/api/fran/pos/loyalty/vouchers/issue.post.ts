import { franLoyaltyIssueEarnVoucherPayloadSchema } from '../../../../../utils/contracts'
import { issueEarnVoucher } from '../../../../../fran/loyalty/vouchers'

export default defineEventHandler(async (event) => {
  const body = franLoyaltyIssueEarnVoucherPayloadSchema.parse(await readBody(event))
  const voucher = issueEarnVoucher(body)
  return { mode: 'live', ok: true, voucher }
})
