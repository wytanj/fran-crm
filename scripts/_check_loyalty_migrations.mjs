/**
 * Check whether L-base loyalty tables exist (0009 + 0010).
 * Usage: node scripts/_check_loyalty_migrations.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnv() {
  const env = { ...process.env }
  for (const name of ['.env', '.env.local', '.env.vercel.production']) {
    if (!existsSync(name)) continue
    const text = readFileSync(name, 'utf8')
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.startsWith('#') || !line.includes('=')) continue
      const i = line.indexOf('=')
      const k = line.slice(0, i).trim()
      let v = line.slice(i + 1).trim()
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1)
      }
      if (!env[k]) env[k] = v
    }
  }
  return env
}

const env = loadEnv()
const url = env.SUPABASE_URL || env.NUXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY
if (!url || !key) {
  console.log(
    JSON.stringify(
      {
        ok: false,
        reason: 'No SUPABASE_URL + SERVICE_ROLE_KEY in env',
        action:
          'Apply migrations via Supabase SQL editor or CLI when credentials available',
        files: [
          'supabase/migrations/0009_fran_loyalty_policy_versions.sql',
          'supabase/migrations/0010_fran_loyalty_point_batches.sql',
        ],
      },
      null,
      2,
    ),
  )
  process.exit(0)
}

const db = createClient(url, key, { auth: { persistSession: false } })
const tables = [
  ['0009', 'fran_loyalty_programs'],
  ['0009', 'fran_loyalty_policy_versions'],
  ['0009', 'fran_loyalty_policy_assignments'],
  ['0009', 'fran_loyalty_accounts'],
  ['0009', 'fran_loyalty_ledger'],
  ['0010', 'fran_loyalty_point_batches'],
]

const out = { ok: true, missing: [], present: [] }
for (const [mig, table] of tables) {
  const { error, count } = await db.from(table).select('*', { count: 'exact', head: true })
  if (error) {
    out.ok = false
    out.missing.push({
      migration: mig,
      table,
      error: error.message.slice(0, 140),
    })
  } else {
    out.present.push({ migration: mig, table, count })
  }
}

if (!out.ok) {
  out.action =
    'Run missing SQL files against the Fran CRM Supabase project (SQL editor or supabase db push). Demo commit_sale works in-memory without 0010; durable batches need 0010.'
} else {
  out.action = 'All L-base loyalty tables present. No migration needed.'
}

console.log(JSON.stringify(out, null, 2))
process.exit(out.ok ? 0 : 1)
