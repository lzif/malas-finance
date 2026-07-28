// notify/diagnostics.ts — exact-alarm settings link + diagnostic (spec §8.5).
//
// The plugin exposes no battery-optimization-specific API (no
// ACTION_IGNORE_BATTERY_OPTIMIZATIONS equivalent) — only Android's separate
// "exact alarm" permission screen (Android 12+), which guards the same class
// of problem spec §8.5 worries about (Doze silently dropping scheduled
// alerts). This is the closest available system-settings link; a custom
// native plugin for the literal battery-optimization intent is out of scope
// for this phase — see TODO.md.
//
// Not part of the `Notifier` interface (spec §8.3) — that interface is the
// cross-platform scheduling contract with a browser/test double (mock.ts).
// This is Android-only diagnostics for the Settings screen, so "unsupported"
// off native IS its browser/test behavior, not something to fake.

import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

export type ExactAlarmStatus = 'granted' | 'denied' | 'unsupported'

/** Whether Android's exact-alarm permission is currently granted. */
export async function checkExactAlarmSetting(): Promise<ExactAlarmStatus> {
  if (!Capacitor.isNativePlatform()) return 'unsupported'
  try {
    const result = await LocalNotifications.checkExactNotificationSetting()
    return result.exact_alarm === 'granted' ? 'granted' : 'denied'
  } catch {
    return 'unsupported'
  }
}

/** Opens the system settings screen for the exact-alarm permission. */
export async function openExactAlarmSettings(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await LocalNotifications.changeExactNotificationSetting()
  } catch {
    // Best-effort — some Android versions/OEMs may not surface this screen.
  }
}
