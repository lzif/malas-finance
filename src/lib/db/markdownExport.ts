// db/markdownExport.ts — human-readable Markdown export of transaction
// history (spec §9.5). This is a READABILITY report, not a backup: unlike
// the JSON backup envelope (which deliberately includes deleted rows, spec
// §9.1 — "a full backup, not a report export"), this export excludes
// soft-deleted transactions entirely.

import type { Transaction, Wallet } from './schema'
import { formatNumber } from '../domain/money'

export interface MarkdownExportInput {
  /** All transactions — this function filters deletedAt itself. */
  transactions: Transaction[]
  wallets: Wallet[]
  /** epoch ms, for the "Diekspor" line. */
  exportedAt: number
}

const INTENT_LABEL: Record<string, string> = {
  planned: 'TERENCANA',
  routine: 'RUTIN',
  impulse: 'IMPULSIF',
  emergency: 'DARURAT'
}

/** Escapes a note for embedding in a Markdown table cell (spec §9.5). */
function escapeCell(note: string | null): string {
  if (!note) return ''
  return note.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|')
}

function walletName(wallets: Wallet[], id: string | null): string {
  if (id === null) return '?'
  return wallets.find((w) => w.id === id)?.name ?? '?'
}

export function toMarkdown(input: MarkdownExportInput): string {
  const active = input.transactions.filter((t) => t.deletedAt === null)

  let totalIn = 0
  let totalOut = 0
  const dayKeys: string[] = []
  for (const t of active) {
    if (t.kind === 'in') totalIn += t.amount
    else if (t.kind === 'out') totalOut += t.amount
    dayKeys.push(t.dayKey)
  }
  dayKeys.sort()
  const range =
    dayKeys.length > 0 ? `${dayKeys[0]} s/d ${dayKeys[dayKeys.length - 1]}` : '-'

  const lines: string[] = [
    '# MalasFinance — Ekspor Riwayat',
    '',
    `Diekspor: ${new Date(input.exportedAt).toLocaleString('id-ID')}`,
    `Rentang: ${range}`,
    `Total transaksi: ${active.length}`,
    `Total masuk: Rp ${formatNumber(totalIn)}`,
    `Total keluar: Rp ${formatNumber(totalOut)}`
  ]

  if (active.length === 0) {
    lines.push('', 'Belum ada transaksi untuk diekspor.')
    return lines.join('\n')
  }

  // Newest day first — matches the app's existing History screen convention
  // (transactionsGroupedByDay in appState.svelte.ts).
  const byDay = new Map<string, Transaction[]>()
  for (const t of active) {
    const group = byDay.get(t.dayKey) ?? []
    group.push(t)
    byDay.set(t.dayKey, group)
  }
  const days = [...byDay.keys()].sort((a, b) => (a < b ? 1 : -1))

  for (const dayKey of days) {
    lines.push('', `## ${dayKey}`)
    lines.push('| Waktu | Jenis | Jumlah | Dompet | Intent | Tag | Catatan |')
    lines.push('|---|---|---|---|---|---|---|')

    for (const t of byDay.get(dayKey)!) {
      const waktu = new Date(t.at).toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit'
      })
      const jenis = t.kind === 'out' ? 'keluar' : t.kind === 'in' ? 'masuk' : 'pindah'
      const sign = t.kind === 'out' ? '-' : t.kind === 'in' ? '+' : ''
      const jumlah = `${sign}${formatNumber(t.amount)}`
      const dompet =
        t.kind === 'move'
          ? `${walletName(input.wallets, t.walletId)} -> ${walletName(input.wallets, t.toWalletId)}`
          : walletName(input.wallets, t.walletId)
      const intent = t.intent ? (INTENT_LABEL[t.intent] ?? '') : ''
      const tag = t.tag ? `#${t.tag}` : ''
      const catatan = escapeCell(t.note)

      lines.push(`| ${waktu} | ${jenis} | ${jumlah} | ${dompet} | ${intent} | ${tag} | ${catatan} |`)
    }
  }

  return lines.join('\n')
}

/** Manual export: hand the user a downloadable .md file (mirrors downloadBackup in autoBackup.ts). */
export async function downloadMarkdownExport(transactions: Transaction[], wallets: Wallet[]): Promise<void> {
  const content = toMarkdown({ transactions, wallets, exportedAt: Date.now() })
  const blob = new Blob([content], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `malasfinance-riwayat-${new Date().toISOString().slice(0, 10)}.md`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
