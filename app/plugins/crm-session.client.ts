export default defineNuxtPlugin(() => {
  const { ensureReady } = useCrmAppReady()
  const indicator = useLoadingIndicator()

  indicator.start()
  void ensureReady().finally(() => {
    indicator.finish()
  })
})
