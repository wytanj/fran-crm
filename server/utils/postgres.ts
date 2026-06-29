import postgres, { type Sql } from 'postgres'

let crmPostgres: Sql | null = null

export function useCrmPostgres() {
  const config = useRuntimeConfig()
  const databaseUrl = config.supabaseDatabaseUrl

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
