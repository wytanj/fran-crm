/**
 * POS live path: POST /fran/pos/loyalty/commit-sale
 * (also available under /api/fran/pos/loyalty/commit-sale)
 */
import { handleFranLoyaltyCommitSale } from '../../../../fran/loyalty/commit-sale'

export default defineEventHandler(handleFranLoyaltyCommitSale)
