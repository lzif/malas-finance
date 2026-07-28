import { describe, expect, it } from 'vitest'
import { checkExactAlarmSetting, openExactAlarmSettings } from './diagnostics'

// vitest runs in a plain node environment (no Capacitor native bridge), so
// Capacitor.isNativePlatform() is always false here — exactly the
// browser/test path these functions are meant to degrade to.

describe('checkExactAlarmSetting off native', () => {
  it('reports unsupported rather than throwing or guessing', async () => {
    expect(await checkExactAlarmSetting()).toBe('unsupported')
  })
})

describe('openExactAlarmSettings off native', () => {
  it('resolves without throwing', async () => {
    await expect(openExactAlarmSettings()).resolves.toBeUndefined()
  })
})
