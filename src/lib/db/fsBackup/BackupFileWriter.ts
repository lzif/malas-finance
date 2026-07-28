// db/fsBackup/BackupFileWriter.ts — platform-abstracted backup file writes
// (spec §9.1 items 2-4). Mirrors the Notifier pattern (spec §8.3): one
// interface, one capacitor.ts implementation, one mock.ts for browser/test.

export interface BackupFileWriter {
  /** Write one dated daily snapshot (Directory.Data/backups/day-<dayKey>.json). */
  writeDaily(dayKey: string, json: string): Promise<void>
  /** Overwrite Directory.Data/backups/latest.json. */
  writeLatest(json: string): Promise<void>
  /** dayKeys of existing daily snapshots, for rotation. */
  listDailyKeys(): Promise<string[]>
  /** Delete one daily snapshot by dayKey. */
  removeDaily(dayKey: string): Promise<void>
  /** Best-effort copy to Directory.Documents/MalasFinance/ (spec §9.1 item 4). */
  writeWeeklyCopy(json: string): Promise<void>
}
