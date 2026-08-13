import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { buildAuthRedirectUrl, resolveAuthBaseUrl } from '~/utils/auth-redirect'

let browserSupabaseClient: SupabaseClient | null = null
let authListenerStarted = false
let sessionInFlight: Promise<Session | null> | null = null

export function useCrmAuth() {
  const runtime = useRuntimeConfig()
  const session = useState<Session | null>('crm-auth-session', () => null)
  const loading = useState('crm-auth-loading', () => false)
  const authReady = useState('crm-auth-ready', () => false)
  const error = useState('crm-auth-error', () => '')

  const isConfigured = computed(() => Boolean(runtime.public.supabaseUrl && runtime.public.supabaseKey))
  const user = computed(() => session.value?.user || null)

  function getClient() {
    if (import.meta.server || !isConfigured.value) {
      return null
    }

    if (!browserSupabaseClient) {
      browserSupabaseClient = createClient(
        String(runtime.public.supabaseUrl),
        String(runtime.public.supabaseKey),
        {
          auth: {
            autoRefreshToken: true,
            detectSessionInUrl: false,
            flowType: 'pkce',
            persistSession: true
          }
        }
      )
    }

    return browserSupabaseClient
  }

  /** Shared browser Supabase client (user JWT session). */
  function getSupabase() {
    return getClient()
  }

  function startAuthListener() {
    const client = getClient()

    if (!client || authListenerStarted) {
      return
    }

    authListenerStarted = true
    client.auth.onAuthStateChange((_event, nextSession) => {
      session.value = nextSession
    })
  }

  async function refreshSession() {
    const client = getClient()

    if (!client) {
      session.value = null
      authReady.value = true
      return null
    }

    loading.value = true
    error.value = ''

    try {
      const { data, error: sessionError } = await client.auth.getSession()

      if (sessionError) {
        throw sessionError
      }

      session.value = data.session
      return data.session
    } catch (sessionFailure) {
      error.value = sessionFailure instanceof Error ? sessionFailure.message : 'Unable to load session.'
      session.value = null
      return null
    } finally {
      loading.value = false
      authReady.value = true
    }
  }

  async function ensureSession() {
    startAuthListener()

    if (authReady.value) {
      return session.value
    }

    if (sessionInFlight) {
      return sessionInFlight
    }

    sessionInFlight = refreshSession().finally(() => {
      sessionInFlight = null
    })

    return sessionInFlight
  }

  function getRedirectUrl(nextPath = '/setup') {
    const currentOrigin = import.meta.client ? window.location.origin : undefined
    const baseUrl = resolveAuthBaseUrl(String(runtime.public.siteUrl || ''), currentOrigin)

    return buildAuthRedirectUrl(baseUrl, nextPath)
  }

  async function signInWithGoogle(nextPath = '/setup') {
    const client = getClient()

    if (!client) {
      return
    }

    loading.value = true
    error.value = ''

    try {
      const { error: signInError } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getRedirectUrl(nextPath)
        }
      })

      if (signInError) {
        throw signInError
      }
    } catch (signInFailure) {
      error.value = signInFailure instanceof Error ? signInFailure.message : 'Unable to start Google sign-in.'
      throw signInFailure
    } finally {
      loading.value = false
    }
  }

  async function signInWithOtp(email: string, nextPath = '/setup') {
    const client = getClient()

    if (!client) {
      return
    }

    const { error: signInError } = await client.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: getRedirectUrl(nextPath)
      }
    })

    if (signInError) {
      throw signInError
    }
  }

  async function signOut() {
    const client = getClient()

    if (client) {
      await client.auth.signOut()
    }

    session.value = null
    authReady.value = true
    useState('crm-workspace-access').value = null
    useState('crm-workspaces-ready').value = true
  }

  return {
    authReady,
    error,
    ensureSession,
    getClient,
    isConfigured,
    loading,
    refreshSession,
    session,
    signInWithGoogle,
    signInWithOtp,
    signOut,
    startAuthListener,
    user
  }
}
