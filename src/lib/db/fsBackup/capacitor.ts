// db/fsBackup/capacitor.ts — native implementation (spec §9.1 items 2-4).
// Directory.Data is app-private (survives across app runs, gone on
// uninstall). Directory.Documents/MalasFinance is best-effort and subject to
// Android scoped storage — a write failure there must not surface as a
// backup failure, since Directory.Data already has the durable copy.

import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import type { BackupFileWriter } from './BackupFileWriter'

const BACKUP_DIR = 'backups'
const DOCS_DIR = 'MalasFinance'

async function ensureDir(directory: Directory, path: string): Promise<void> {
  try {
    await Filesystem.mkdir({ path, directory, recursive: true })
  } catch {
    // Already exists — mkdir on an existing directory rejects, which is not
    // an error condition here.
  }
}

export class CapacitorBackupFileWriter implements BackupFileWriter {
  async writeDaily(dayKey: string, json: string): Promise<void> {
    await ensureDir(Directory.Data, BACKUP_DIR)
    await Filesystem.writeFile({
      path: `${BACKUP_DIR}/day-${dayKey}.json`,
      directory: Directory.Data,
      data: json,
      encoding: Encoding.UTF8
    })
  }

  async writeLatest(json: string): Promise<void> {
    await ensureDir(Directory.Data, BACKUP_DIR)
    await Filesystem.writeFile({
      path: `${BACKUP_DIR}/latest.json`,
      directory: Directory.Data,
      data: json,
      encoding: Encoding.UTF8
    })
  }

  async listDailyKeys(): Promise<string[]> {
    await ensureDir(Directory.Data, BACKUP_DIR)
    const { files } = await Filesystem.readdir({ path: BACKUP_DIR, directory: Directory.Data })
    return files
      .map((f) => f.name)
      .filter((name) => name.startsWith('day-') && name.endsWith('.json'))
      .map((name) => name.slice('day-'.length, -'.json'.length))
      .sort()
  }

  async removeDaily(dayKey: string): Promise<void> {
    await Filesystem.deleteFile({ path: `${BACKUP_DIR}/day-${dayKey}.json`, directory: Directory.Data })
  }

  async writeWeeklyCopy(json: string): Promise<void> {
    try {
      await ensureDir(Directory.Documents, DOCS_DIR)
      await Filesystem.writeFile({
        path: `${DOCS_DIR}/malasfinance-backup-weekly.json`,
        directory: Directory.Documents,
        data: json,
        encoding: Encoding.UTF8
      })
    } catch {
      // Best-effort per spec §9.1 item 4 — scoped storage can refuse this on
      // some Android versions/OEMs. Directory.Data already has the durable copy.
    }
  }
}
