// db/sql.ts — pure SQL text helpers. No imports, no I/O, no driver — so this
// stays unit-testable under a permissionless `deno test` (the DB driver reads
// the environment at import time, which would otherwise pull the whole test
// file into needing --allow-env).

/**
 * Split a SQL script into individual statements.
 *
 * Comments are stripped FIRST, then the script is split on `;`. Order matters:
 * a `--` line comment may itself contain a semicolon (e.g. "version-agnostic;
 * no NULLS ..."), and splitting first would break that comment across two
 * bogus statements. We strip from `--` to end-of-line, which is safe for the
 * migration files here because none of their string literals contain `--`.
 */
export function splitStatements(script: string): string[] {
  const withoutComments = script
    .split('\n')
    .map((line) => {
      const commentAt = line.indexOf('--')
      return commentAt >= 0 ? line.slice(0, commentAt) : line
    })
    .join('\n')

  return withoutComments
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}
