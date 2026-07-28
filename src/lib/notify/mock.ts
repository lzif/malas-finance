// notify/mock.ts — browser/test implementation (spec §8.3). Local
// notifications do not exist in a browser tab, so this keeps scheduling
// logic and call sites exercisable under vitest without a device.

import type { Notifier } from './Notifier'

export class MockNotifier implements Notifier {
  requestPermissionCalls = 0
  scheduled = new Map<number, { at: Date; title: string; body: string }>()

  async requestPermission(): Promise<boolean> {
    this.requestPermissionCalls++
    console.log('[MockNotifier] requestPermission')
    return true
  }

  async schedule(id: number, at: Date, title: string, body: string): Promise<void> {
    console.log('[MockNotifier] schedule', { id, at, title, body })
    this.scheduled.set(id, { at, title, body })
  }

  async cancel(id: number): Promise<void> {
    console.log('[MockNotifier] cancel', id)
    this.scheduled.delete(id)
  }

  async cancelAll(): Promise<void> {
    console.log('[MockNotifier] cancelAll')
    this.scheduled.clear()
  }
}
