// db/repo/settings.ts — baris tunggal pengaturan aplikasi.

import { db, DEFAULT_SETTINGS, type Settings } from '../schema'

export async function getSettings(): Promise<Settings> {
  const row = await db.settings.get('settings')
  return row ?? DEFAULT_SETTINGS
}

export async function saveSettings(settings: Settings): Promise<void> {
  await db.settings.put(settings)
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings()
  const next: Settings = { ...current, ...patch, key: 'settings' }
  await db.settings.put(next)
  return next
}
