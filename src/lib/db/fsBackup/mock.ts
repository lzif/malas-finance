// db/fsBackup/mock.ts — browser/test implementation (spec §8.3 pattern).
// Filesystem does not exist in a browser tab, so this keeps rotation logic
// and call sites exercisable under vitest without a device.

import type { BackupFileWriter } from './BackupFileWriter'

export class MockBackupFileWriter implements BackupFileWriter {
  private daily = new Map<string, string>()
  latest: string | null = null
  weeklyCopies: string[] = []

  async writeDaily(dayKey: string, json: string): Promise<void> {
    this.daily.set(dayKey, json)
  }

  async writeLatest(json: string): Promise<void> {
    this.latest = json
  }

  async listDailyKeys(): Promise<string[]> {
    return [...this.daily.keys()].sort()
  }

  async removeDaily(dayKey: string): Promise<void> {
    this.daily.delete(dayKey)
  }

  async writeWeeklyCopy(json: string): Promise<void> {
    this.weeklyCopies.push(json)
  }
}
