import { describe, expect, it } from 'vitest'
import {
  allowanceExceededMessage,
  dailySummaryMessage,
  noRecordsMessage,
  weeklyMessage,
  todayBannerMessage
} from './messages'

describe('allowanceExceededMessage', () => {
  it('matches the exact spec §8.1 example sentence', () => {
    const msg = allowanceExceededMessage(12_500, 33_100)
    expect(msg.body).toBe('Jatah hari ini lewat Rp 12.500. Jatah besok turun jadi Rp 33.100.')
  })

  it('omits the second sentence when there is no tomorrow to project', () => {
    const msg = allowanceExceededMessage(12_500, null)
    expect(msg.body).toBe('Jatah hari ini lewat Rp 12.500.')
  })
})

describe('noRecordsMessage', () => {
  it('matches the exact spec §8.1 example sentence', () => {
    expect(noRecordsMessage().body).toBe('Belum ada catatan hari ini.')
  })
})

describe('dailySummaryMessage', () => {
  it('matches the exact spec §8.1 example sentence', () => {
    const msg = dailySummaryMessage(87_000, 120_000)
    expect(msg.body).toBe('Hari ini habis Rp 87.000. Jatah besok Rp 120.000.')
  })

  it('omits the second sentence when there is no tomorrow to project', () => {
    const msg = dailySummaryMessage(87_000, null)
    expect(msg.body).toBe('Hari ini habis Rp 87.000.')
  })
})

describe('weeklyMessage', () => {
  it('matches the exact spec §8.1 example sentence', () => {
    const msg = weeklyMessage(0.23, 210_000, 4)
    expect(msg.body).toBe('Minggu ini 23% lebih boros. Impuls Rp 210.000 = 4 hari runway.')
  })

  it('a negative percentChange reads "lebih hemat", not a negative number', () => {
    const msg = weeklyMessage(-0.1, 50_000, 2)
    expect(msg.body).toBe('Minggu ini 10% lebih hemat. Impuls Rp 50.000 = 2 hari runway.')
  })

  it('impulseDays null (no daily cost) states the rupiah amount alone', () => {
    const msg = weeklyMessage(0.23, 210_000, null)
    expect(msg.body).toBe('Minggu ini 23% lebih boros. Impuls Rp 210.000.')
  })
})

describe('todayBannerMessage', () => {
  it('exceeded state produces the identical sentence to the notification builder', () => {
    const viaBanner = todayBannerMessage({ kind: 'exceeded', overspend: 12_500, tomorrowAllowance: 33_100 })
    const viaNotification = allowanceExceededMessage(12_500, 33_100)
    expect(viaBanner).toEqual(viaNotification)
  })

  it('noRecords state produces the identical sentence to the notification builder', () => {
    expect(todayBannerMessage({ kind: 'noRecords' })).toEqual(noRecordsMessage())
  })

  it('summary state produces the identical sentence to the notification builder', () => {
    const viaBanner = todayBannerMessage({ kind: 'summary', spentToday: 87_000, tomorrowAllowance: 120_000 })
    const viaNotification = dailySummaryMessage(87_000, 120_000)
    expect(viaBanner).toEqual(viaNotification)
  })
})
