import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import {
  backfillAmount,
  enforceHardRules,
  offlineParse,
  type ParsedInput,
  parseMessage,
} from './parser.ts'

function expense(over: Partial<ParsedInput> = {}): ParsedInput {
  return {
    kind: 'expense',
    amount: 27_500,
    item: 'Rokok Surya',
    intent: 'planned',
    category: 'Rokok & Sejenisnya',
    subcategory: 'Rokok',
    wallet: null,
    dueDay: null,
    notes: null,
    question: null,
    ...over,
  }
}

describe('enforceHardRules — spec §7.2 "Always IMPULSIF"', () => {
  it('forces rokok to impulse even if the model said planned', () => {
    expect(enforceHardRules(expense({ intent: 'planned' })).intent).toBe('impulse')
  })
  it('forces vape/liquid/alcohol to impulse', () => {
    expect(enforceHardRules(expense({ item: 'Vape juice', intent: 'routine' })).intent).toBe(
      'impulse',
    )
    expect(enforceHardRules(expense({ item: 'Bir Bintang', intent: 'routine' })).intent).toBe(
      'impulse',
    )
  })
  it('matches the hard rule against notes too', () => {
    expect(
      enforceHardRules(expense({ item: 'Titip', notes: 'beliin rokok', intent: 'routine' })).intent,
    ).toBe('impulse')
  })
  it('leaves a non-addictive item untouched', () => {
    expect(enforceHardRules(expense({ item: 'Makan siang', intent: 'routine' })).intent).toBe(
      'routine',
    )
  })
  it('never rewrites a non-expense', () => {
    const income = expense({ kind: 'income', item: 'rokok refund', intent: null })
    expect(enforceHardRules(income).intent).toBeNull()
  })
})

describe('backfillAmount — recover a missed amount deterministically', () => {
  it('fills a null amount from the raw text (spec §6.2)', () => {
    const p = backfillAmount(expense({ amount: null }), 'rokok surya 27.5k')
    expect(p.amount).toBe(27_500)
  })
  it('does not touch an amount the model already returned', () => {
    expect(backfillAmount(expense({ amount: 27_500 }), 'rokok 99k').amount).toBe(27_500)
  })
  it('leaves clarify alone (no amount expected)', () => {
    const c = backfillAmount(expense({ kind: 'clarify', amount: null }), 'apaan sih')
    expect(c.amount).toBeNull()
  })
})

// Live integration test — only runs when GOOGLE_AI_API_KEY is set and network
// is allowed (deno test --allow-net --allow-env). Skips cleanly in CI, which
// has no key. This is what actually proves the pivot's premise: that a free
// Gemini key extracts intent + category from Indonesian shorthand.
// Read the key defensively: under a permissionless `deno test` (how CI runs
// the unit suite) Deno.env.get throws NotCapable, and that must not fail the
// file — it just means the live tests below stay skipped.
function envKey(): string | undefined {
  try {
    return Deno.env.get('GOOGLE_AI_API_KEY')
  } catch {
    return undefined
  }
}
const KEY = envKey()
const ctx = {
  categories: ['Rokok & Sejenisnya', 'Makanan & Minuman', 'Transportasi'],
  wallets: [
    'CASH',
  ],
}

describe('offlineParse — the quota-wall safety net (spec §15 #8)', () => {
  it('salvages an expense when no model is available', () => {
    const p = offlineParse('kopi 18k')!
    expect(p).not.toBeNull()
    expect(p.kind).toBe('expense')
    expect(p.amount).toBe(18_000)
    expect(p.item).toBe('kopi')
  })

  it('labels salvaged spending impulse, not routine', () => {
    // It cannot know the "why", and quietly filing unexamined spending as
    // routine is the exact self-reporting bias the pivot exists to remove.
    expect(offlineParse('makan siang 25rb')!.intent).toBe('impulse')
  })

  it('still enforces the §7.2 hard rules', () => {
    expect(offlineParse('rokok surya 27.5k')!.intent).toBe('impulse')
  })

  it('recognises income from a leading + and from keywords', () => {
    const plus = offlineParse('+300k')!
    expect(plus.kind).toBe('income')
    expect(plus.amount).toBe(300_000)
    // Income has no intent — the repo layer rejects a non-null one.
    expect(plus.intent).toBeNull()

    expect(offlineParse('gajian 700k')!.kind).toBe('income')
  })

  it('falls back to a generic label when only an amount is present', () => {
    expect(offlineParse('25rb')!.item).toBe('Pengeluaran')
    expect(offlineParse('+700k')!.item).toBe('Pemasukan')
  })

  it('returns null when there is no amount to salvage', () => {
    // Nothing to record — the caller should ask rather than invent a number.
    expect(offlineParse('helm')).toBeNull()
    expect(offlineParse('halo bot')).toBeNull()
  })

  it('handles the dotted-grouping form', () => {
    expect(offlineParse('bensin 50.000')!.amount).toBe(50_000)
  })
})

describe('parseMessage (live Gemini)', () => {
  it({
    name: 'rokok surya 27.5k → expense, impulse, right amount',
    ignore: !KEY,
    fn: async () => {
      const p = await parseMessage('rokok surya 27.5k', ctx, KEY!)
      expect(p.kind).toBe('expense')
      expect(p.amount).toBe(27_500)
      expect(p.intent).toBe('impulse')
    },
  })

  it({
    name: 'makan siang 25k → expense, routine',
    ignore: !KEY,
    fn: async () => {
      const p = await parseMessage('makan siang 25k', ctx, KEY!)
      expect(p.kind).toBe('expense')
      expect(p.amount).toBe(25_000)
      expect(p.intent).toBe('routine')
    },
  })

  it({
    name: '+gajian 2.4jt → income',
    ignore: !KEY,
    fn: async () => {
      const p = await parseMessage('+gajian 2.4jt', ctx, KEY!)
      expect(p.kind).toBe('income')
      expect(p.amount).toBe(2_400_000)
    },
  })
})
