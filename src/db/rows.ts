// db/rows.ts — helpers for reading raw driver rows into domain shapes.
//
// The one place database drivers disagree on a plain value is timestamps:
// postgres.js hands back a `timestamptz` column as a JS Date, the Neon HTTP
// driver handed back a Postgres-format string, and neither is canonical ISO
// 8601. `String(row.at)` therefore produced driver-dependent text — inert in
// Phase 1 (nothing reads these fields) but a trap for Phase 3 edit/history.
// These helpers pin every timestamp read to canonical ISO 8601 regardless of
// the driver, so the field's contract no longer depends on which client is
// wired up. Pure — unit-tested without a database.

/** A timestamp column (Date from postgres.js, or a string) → ISO 8601. */
export function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  // Normalize a string through Date so the output is canonical, but fall back
  // to the raw text if it does not parse rather than throwing on a read.
  const d = new Date(value as string)
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString()
}

/** As toIso, but a nullable column (e.g. deleted_at) stays null. */
export function toIsoOrNull(value: unknown): string | null {
  return value == null ? null : toIso(value)
}
