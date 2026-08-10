// db/migrate.ts — apply schema.sql then seed.sql to the database in DATABASE_URL.
//
// Both files are idempotent (CREATE TABLE IF NOT EXISTS; seed rows guarded by
// ON CONFLICT / WHERE NOT EXISTS), so this is safe to run repeatedly.
//
//   deno task db:migrate
//
// We split each file on statement boundaries and run one statement per call.
// The SQL here uses no dollar-quoted bodies or embedded semicolons, which keeps
// the split trivial and correct — and running statements individually keeps the
// per-file progress log honest. `sql.unsafe` runs a raw statement string (the
// scripts are trusted, checked-in DDL, not user input).

import { closeSql, getSql } from './connection.ts'
import { splitStatements } from './sql.ts'

export { splitStatements }

async function run(): Promise<void> {
  const sql = getSql()

  const here = new URL('.', import.meta.url)
  for (const file of ['schema.sql', 'seed.sql']) {
    const script = await Deno.readTextFile(new URL(file, here))
    const statements = splitStatements(script)
    console.log(`Applying ${file} (${statements.length} statements)...`)
    for (const stmt of statements) {
      await sql.unsafe(stmt)
    }
  }
  console.log('Migration complete.')
}

if (import.meta.main) {
  try {
    await run()
  } finally {
    // One-shot process: close the pool so it exits instead of hanging on the
    // open TCP connection.
    await closeSql()
  }
}
