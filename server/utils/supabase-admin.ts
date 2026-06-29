import { createClient } from '@supabase/supabase-js'

export function useSupabaseAdmin() {
  const config = useRuntimeConfig()
  const url = config.public.supabaseUrl
  const serviceRoleKey = config.supabaseServiceRoleKey

  if (!url || !serviceRoleKey) {
    return null
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

export function useSupabaseAuthClient() {
  const config = useRuntimeConfig()
  const url = config.public.supabaseUrl
  const key = config.public.supabaseKey

  if (!url || !key) {
    return null
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}
