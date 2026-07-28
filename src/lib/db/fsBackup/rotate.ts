// db/fsBackup/rotate.ts — keep the newest `keep` dated snapshots, drop the
// rest (spec §9.1 item 3). Sorted ascending dayKeys ("YYYY-MM-DD") sort
// lexicographically same as chronologically, so no date parsing needed.

import type { BackupFileWriter } from './BackupFileWriter'

export async function rotateDaily(writer: BackupFileWriter, keep: number): Promise<void> {
  const keys = await writer.listDailyKeys()
  const toDrop = keys.slice(0, Math.max(0, keys.length - keep))
  for (const key of toDrop) {
    await writer.removeDaily(key)
  }
}
