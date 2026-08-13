export default defineNuxtRouteMiddleware(async (to) => {
  const { ensureSession, user } = useCrmAuth()
  const indicator = useLoadingIndicator()

  indicator.start()
  try {
    await ensureSession()
  } finally {
    indicator.finish()
  }

  if (!user.value) {
    return navigateTo({
      path: '/login',
      query: {
        next: to.fullPath
      }
    })
  }
})
