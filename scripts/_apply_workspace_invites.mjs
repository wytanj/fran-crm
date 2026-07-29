import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL
const sql = readFileSync(join(__dirname, '../supabase/migrations/0011_crm_workspace_invites.sql'), 'utf8')

if (!dbUrl) {
  console.error('No SUPABASE_DB_URL — run 0011_crm_workspace_invites.sql in Supabase SQL editor')
  process.exit(2)
}

const { default: postgres } = await import('postgres')
const sqlClient = postgres(dbUrl, { ssl: 'require', max: 1 })
try {
  await sqlClient.unsafe(sql)
  console.log('Applied 0011_crm_workspace_invites.sql via DATABASE_URL')
} finally {
  await sqlClient.end({ timeout: 5 })
}
