import { describe, it, expect } from 'vitest'
import { MockBackupFileWriter } from './mock'

describe('MockBackupFileWriter', () => {
  it('records daily writes and lists their keys', async () => {
    const writer = new MockBackupFileWriter()
    await writer.writeDaily('2026-07-28', '{"a":1}')
    await writer.writeDaily('2026-07-27', '{"a":2}')
    expect(await writer.listDailyKeys()).toEqual(['2026-07-27', '2026-07-28'])
  })

  it('removeDaily deletes only the named key', async () => {
    const writer = new MockBackupFileWriter()
    await writer.writeDaily('2026-07-28', '{}')
    await writer.writeDaily('2026-07-27', '{}')
    await writer.removeDaily('2026-07-27')
    expect(await writer.listDailyKeys()).toEqual(['2026-07-28'])
  })

  it('writeLatest and writeWeeklyCopy do not throw and are inspectable', async () => {
    const writer = new MockBackupFileWriter()
    await writer.writeLatest('{"a":1}')
    await writer.writeWeeklyCopy('{"a":1}')
    expect(writer.latest).toBe('{"a":1}')
    expect(writer.weeklyCopies).toEqual(['{"a":1}'])
  })
})
