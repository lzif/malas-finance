// notify/Notifier.ts — platform-abstracted local notifications (spec §8.3).
// Mirrors db/fsBackup/'s pattern (spec §8.3 note in AGENTS.md): one interface,
// one capacitor.ts (native), one mock.ts (browser/test).

export interface Notifier {
  requestPermission(): Promise<boolean>
  schedule(id: number, at: Date, title: string, body: string): Promise<void>
  cancel(id: number): Promise<void>
  cancelAll(): Promise<void>
}
