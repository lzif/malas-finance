import { describe, it, expect } from 'vitest'
import { MockBackupFileWriter } from './mock'
import { rotateDaily } from './rotate'

describe('rotateDaily', () => {
  it('keeps only the newest N dated snapshots', async () => {
    const writer = new MockBackupFileWriter()
    const days = [
      '2026-07-22',
      '2026-07-23',
      '2026-07-24',
      '2026-07-25',
      '2026-07-26',
      '2026-07-27',
      '2026-07-28',
      '2026-07-29'
    ]
    for (const d of days) await writer.writeDaily(d, `{"day":"${d}"}`)

    await rotateDaily(writer, 7)

    expect(await writer.listDailyKeys()).toEqual(days.slice(1))
  })

  it('is a no-op when at or under the keep threshold', async () => {
    const writer = new MockBackupFileWriter()
    await writer.writeDaily('2026-07-28', '{}')

    await rotateDaily(writer, 7)

    expect(await writer.listDailyKeys()).toEqual(['2026-07-28'])
  })
})
