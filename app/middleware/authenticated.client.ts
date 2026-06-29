export default defineNuxtRouteMiddleware(async (to) => {
  const { refreshSession, startAuthListener, user } = useCrmAuth()

  startAuthListener()

  if (!user.value) {
    await refreshSession()
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
