import postgres, { type Sql } from 'postgres'

let crmPostgres: Sql | null = null

/**
 * Prefer SUPABASE_DB_URL as-is. If it points at the IPv6-only
 * `db.<ref>.supabase.co` host (often unresolvable from local/dev), rewrite to
 * the Supabase pooler hostname so POS→CRM durable writes still work.
 */
function resolveDatabaseUrl(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return ''

  try {
    const u = new URL(trimmed)
    const m = u.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i)
    if (m) {
      const projectRef = m[1]
      // Transaction pooler (6543) — works with postgres.js prepare:false
      u.hostname = `aws-1-ap-southeast-1.pooler.supabase.com`
      u.port = u.port || '6543'
      u.username = `postgres.${projectRef}`
      return u.toString()
    }
  } catch {
    // keep raw
  }

  return trimmed
}

export function useCrmPostgres() {
  const config = useRuntimeConfig()
  const databaseUrl = resolveDatabaseUrl(config.supabaseDatabaseUrl || process.env.SUPABASE_DB_URL || '')

  if (!databaseUrl) {
    return null
  }

  if (!crmPostgres) {
    crmPostgres = postgres(databaseUrl, {
      connect_timeout: 10,
      idle_timeout: 20,
      max: 5,
      prepare: false,
      ssl: 'require'
    })
  }

  return crmPostgres
}
