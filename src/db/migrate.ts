// db/migrate.ts — apply schema.sql then seed.sql to the database in DATABASE_URL.
//
// Both files are idempotent (CREATE TABLE IF NOT EXISTS; seed rows guarded by
// ON CONFLICT / WHERE NOT EXISTS), so this is safe to run repeatedly.
//
//   deno task db:migrate
//
// The Neon HTTP driver executes one statement per round trip, so we split each
// file on statement boundaries. The SQL here uses no dollar-quoted bodies or
// embedded semicolons, which keeps the split trivial and correct.

import { neon } from '@neondatabase/serverless'
import { splitStatements } from './sql.ts'

export { splitStatements }

async function run(): Promise<void> {
  const url = Deno.env.get('DATABASE_URL')
  if (!url) throw new Error('DATABASE_URL is not set')
  const sql = neon(url)

  const here = new URL('.', import.meta.url)
  for (const file of ['schema.sql', 'seed.sql']) {
    const script = await Deno.readTextFile(new URL(file, here))
    const statements = splitStatements(script)
    console.log(`Applying ${file} (${statements.length} statements)...`)
    for (const stmt of statements) {
      await sql.query(stmt)
    }
  }
  console.log('Migration complete.')
}

if (import.meta.main) {
  await run()
}
