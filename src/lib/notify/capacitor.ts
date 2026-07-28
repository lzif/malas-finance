// notify/capacitor.ts — native implementation (spec §8.3, §8.5).
// `allowWhileIdle: true` is required so scheduled notifications survive
// Android Doze — paired with the SCHEDULE_EXACT_ALARM/USE_EXACT_ALARM
// manifest permissions (spec §8.5).
//
// There is no single "cancel everything pending" call on this plugin —
// cancelAll() reads the pending list first, then cancels it, mirroring the
// empty-array-is-a-no-op convention already used in db/repo/*.

import { LocalNotifications } from '@capacitor/local-notifications'
import type { Notifier } from './Notifier'

export class CapacitorNotifier implements Notifier {
  async requestPermission(): Promise<boolean> {
    const result = await LocalNotifications.requestPermissions()
    return result.display === 'granted'
  }

  async schedule(id: number, at: Date, title: string, body: string): Promise<void> {
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title,
          body,
          schedule: {
            at,
            allowWhileIdle: true
          }
        }
      ]
    })
  }

  async cancel(id: number): Promise<void> {
    await LocalNotifications.cancel({
      notifications: [{ id }]
    })
  }

  async cancelAll(): Promise<void> {
    const pending = await LocalNotifications.getPending()
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel({
        notifications: pending.notifications
      })
    }
  }
}
