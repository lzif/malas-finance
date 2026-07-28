// notify/index.ts — platform switch (spec §8.3 pattern applied to notifications).

import { Capacitor } from '@capacitor/core'
import type { Notifier } from './Notifier'
import { CapacitorNotifier } from './capacitor'
import { MockNotifier } from './mock'

let instance: Notifier | null = null

export function getNotifier(): Notifier {
  if (!instance) {
    instance = Capacitor.isNativePlatform() ? new CapacitorNotifier() : new MockNotifier()
  }
  return instance
}
