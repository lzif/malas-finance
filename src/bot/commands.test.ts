import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import { matchCommand } from './commands.ts'

describe('matchCommand — slash commands', () => {
  it('recognises /start and /help', () => {
    expect(matchCommand('/start')).toEqual({ kind: 'start' })
    expect(matchCommand('/help')).toEqual({ kind: 'help' })
    expect(matchCommand('/bantuan')).toEqual({ kind: 'help' })
  })

  it('recognises the allowance shortcuts', () => {
    expect(matchCommand('/jatah')).toEqual({ kind: 'allowance' })
    expect(matchCommand('/sisa')).toEqual({ kind: 'allowance' })
  })

  it('tolerates the @botname suffix Telegram adds in groups', () => {
    expect(matchCommand('/start@financy_bot')).toEqual({ kind: 'start' })
  })

  it('ignores unknown slash commands so they fall through', () => {
    expect(matchCommand('/wibble')).toBeNull()
  })
})

describe('matchCommand — pay schedule', () => {
  it('sets a weekly cycle from "gajian tiap sabtu"', () => {
    expect(matchCommand('gajian tiap sabtu')).toEqual({ kind: 'set-weekly', weekday: 6 })
    expect(matchCommand('gajian setiap hari sabtu')).toEqual({ kind: 'set-weekly', weekday: 6 })
    expect(matchCommand('Bayaran tiap Sabtu')).toEqual({ kind: 'set-weekly', weekday: 6 })
  })

  it('handles other weekdays', () => {
    expect(matchCommand('gajian tiap jumat')).toEqual({ kind: 'set-weekly', weekday: 5 })
    expect(matchCommand('upah tiap senin')).toEqual({ kind: 'set-weekly', weekday: 1 })
  })

  it('sets a monthly cycle from "gajian tanggal 25"', () => {
    expect(matchCommand('gajian tanggal 25')).toEqual({ kind: 'set-monthly', day: 25 })
    expect(matchCommand('gaji tiap tanggal 1')).toEqual({ kind: 'set-monthly', day: 1 })
  })

  it('asks when "tiap minggu" could mean weekly or Sunday', () => {
    // Ambiguous in Indonesian: "minggu" is both "week" and "Sunday".
    expect(matchCommand('gajian tiap minggu')).toEqual({ kind: 'payday-unclear' })
    // ...but "hari minggu" is unambiguous.
    expect(matchCommand('gajian tiap hari minggu')).toEqual({ kind: 'set-weekly', weekday: 0 })
  })

  it('rejects an out-of-range date', () => {
    expect(matchCommand('gajian tanggal 45')).toEqual({ kind: 'payday-unclear' })
  })
})

describe('matchCommand — must not swallow transactions', () => {
  it('leaves ordinary expenses alone', () => {
    // The critical property: a mis-match here would silently eat a real
    // expense instead of logging it.
    expect(matchCommand('rokok surya 27.5k')).toBeNull()
    expect(matchCommand('makan siang 25rb')).toBeNull()
    expect(matchCommand('+gajian 700k')).toBeNull()
    expect(matchCommand('kopi 18k')).toBeNull()
  })

  it('leaves a weekday-mentioning expense alone', () => {
    // "sabtu" appears, but this is plainly a purchase, not configuration.
    expect(matchCommand('sabtu beli kopi 20k')).toBeNull()
    expect(matchCommand('nonton sabtu 50k')).toBeNull()
  })

  it('leaves a bare pay word alone (income, not configuration)', () => {
    expect(matchCommand('gajian 700k')).toBeNull()
  })

  it('returns null for empty input', () => {
    expect(matchCommand('')).toBeNull()
    expect(matchCommand('   ')).toBeNull()
  })
})
