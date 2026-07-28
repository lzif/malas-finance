// db/fsBackup/writeToAllTargets.ts — fan out one already-serialized snapshot
// to every filesystem destination (spec §9.1 items 2-4). Takes `json` as a
// plain string precisely so it needs no database access and stays testable
// against MockBackupFileWriter without fake-indexeddb.

import type { BackupFileWriter } from './BackupFileWriter'
import { rotateDaily } from './rotate'

export interface WriteOptions {
  keep: number
  writeWeekly: boolean
}

export async function writeToAllTargets(
  writer: BackupFileWriter,
  dayKey: string,
  json: string,
  options: WriteOptions
): Promise<void> {
  await writer.writeDaily(dayKey, json)
  await writer.writeLatest(json)
  await rotateDaily(writer, options.keep)
  if (options.writeWeekly) {
    await writer.writeWeeklyCopy(json)
  }
}
