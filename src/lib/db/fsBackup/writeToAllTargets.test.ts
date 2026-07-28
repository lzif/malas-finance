import { describe, it, expect } from 'vitest'
import { MockBackupFileWriter } from './mock'
import { writeToAllTargets } from './writeToAllTargets'

describe('writeToAllTargets', () => {
  it('writes the dated snapshot and latest.json, and rotates old ones', async () => {
    const writer = new MockBackupFileWriter()
    for (let i = 1; i <= 8; i++) {
      await writer.writeDaily(`2026-07-${String(i).padStart(2, '0')}`, '{"old":true}')
    }

    await writeToAllTargets(writer, '2026-07-09', '{"new":true}', { keep: 7, writeWeekly: false })

    expect(await writer.listDailyKeys()).toHaveLength(7)
    expect(await writer.listDailyKeys()).toContain('2026-07-09')
    expect(await writer.listDailyKeys()).not.toContain('2026-07-01')
    expect(writer.latest).toBe('{"new":true}')
  })

  it('writes a weekly copy only when told to', async () => {
    const writer = new MockBackupFileWriter()

    await writeToAllTargets(writer, '2026-07-09', '{"new":true}', { keep: 7, writeWeekly: true })

    expect(writer.weeklyCopies).toEqual(['{"new":true}'])
  })

  it('skips the weekly copy when told not to', async () => {
    const writer = new MockBackupFileWriter()

    await writeToAllTargets(writer, '2026-07-09', '{"new":true}', { keep: 7, writeWeekly: false })

    expect(writer.weeklyCopies).toEqual([])
  })
})
