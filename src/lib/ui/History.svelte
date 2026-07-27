<script lang="ts">
  // History — minimal (spec §7.3 scoped down): a flat list grouped by day,
  // soft-delete only. No filters, no trash-restore UI.
  //
  // Deleting MUST be undoable. Trash restore is out of MVP scope, so the
  // undo snackbar here is the only way back — without it, one wrong tap
  // permanently deletes a financial record.

  import { appState } from '../stores/appState.svelte'
  import { formatRupiah } from '../domain/money'
  import { formatDateShort } from './formatDate'
  import type { Transaction } from '../db/schema'

  let snackbar = $state<{ text: string; undo: () => Promise<void> } | null>(null)
  let snackbarTimeout: ReturnType<typeof setTimeout> | null = null

  async function deleteEntry(tx: Transaction) {
    await appState.deleteTransaction(tx.id)
    if (snackbarTimeout) clearTimeout(snackbarTimeout)
    snackbar = {
      text: `Dihapus: ${formatRupiah(tx.amount)}`,
      undo: () => appState.restoreTransaction(tx.id)
    }
    snackbarTimeout = setTimeout(() => {
      snackbar = null
    }, 5000)
  }

  async function undoLast() {
    if (!snackbar) return
    const undo = snackbar.undo
    snackbar = null
    if (snackbarTimeout) clearTimeout(snackbarTimeout)
    await undo()
  }

  function subtotal(items: Transaction[]): number {
    return items.reduce((sum, t) => sum + (t.kind === 'out' ? -t.amount : t.amount), 0)
  }
</script>

<div class="screen">
  <h2>Riwayat</h2>
  {#if appState.transactions.length === 0}
    <p class="empty-state">Belum ada catatan.</p>
  {:else}
    {#each appState.transactionsGroupedByDay() as group (group.dayKey)}
      <div class="day-group">
        <h3>{formatDateShort(group.dayKey)} · {formatRupiah(subtotal(group.items))}</h3>
        {#each group.items as tx (tx.id)}
          <div class="recent-item">
            <span>
              <span class="amount {tx.kind}">{tx.kind === 'out' ? '-' : '+'}{formatRupiah(tx.amount)}</span>
              {#if tx.tag}<span class="meta"> #{tx.tag}</span>{/if}
              {#if tx.intent}<span class="meta"> · {tx.intent}</span>{/if}
            </span>
            <button class="row-delete" onclick={() => deleteEntry(tx)} aria-label="Hapus entri">hapus</button>
          </div>
        {/each}
      </div>
    {/each}
  {/if}
</div>

{#if snackbar}
  <div class="snackbar">
    <span>{snackbar.text}</span>
    <button onclick={undoLast}>BATAL</button>
  </div>
{/if}
