// db/fsBackup/index.ts — platform switch (spec §8.3 pattern applied to backups).

import { Capacitor } from '@capacitor/core'
import type { BackupFileWriter } from './BackupFileWriter'
import { CapacitorBackupFileWriter } from './capacitor'
import { MockBackupFileWriter } from './mock'

let instance: BackupFileWriter | null = null

export function getBackupFileWriter(): BackupFileWriter {
  if (!instance) {
    instance = Capacitor.isNativePlatform() ? new CapacitorBackupFileWriter() : new MockBackupFileWriter()
  }
  return instance
}
