import type { PlanKey } from '~/types/crm'

export function useBillingCheckout() {
  const loading = ref(false)
  const error = ref('')

  async function startCheckout(email: string, plan: Exclude<PlanKey, 'open_source'>) {
    loading.value = true
    error.value = ''

    try {
      const response = await $fetch<{ checkoutUrl: string }>('/api/billing/checkout', {
        method: 'POST',
        body: { email, plan }
      })

      await navigateTo(response.checkoutUrl, { external: response.checkoutUrl.startsWith('http') || response.checkoutUrl.startsWith('mailto:') })
    } catch (checkoutError) {
      error.value = checkoutError instanceof Error ? checkoutError.message : 'Unable to start checkout.'
    } finally {
      loading.value = false
    }
  }

  return { loading, error, startCheckout }
}
