<script lang="ts">
  // Riwayat — minimal (spec §7.3 scoped down): daftar flat dikelompokkan per
  // hari, soft-delete saja. Tanpa filter, tanpa UI pulihkan dari trash.

  import { appState } from '../stores/appState.svelte'
  import { formatRupiah } from '../domain/money'
  import { formatTanggalPendek } from './formatTanggal'
  import type { Transaction } from '../db/schema'

  let snackbar = $state<string | null>(null)
  let snackbarTimeout: ReturnType<typeof setTimeout> | null = null

  async function hapus(tx: Transaction) {
    await appState.hapusTransaksi(tx.id)
    if (snackbarTimeout) clearTimeout(snackbarTimeout)
    snackbar = `Dihapus: ${formatRupiah(tx.amount)}`
    snackbarTimeout = setTimeout(() => {
      snackbar = null
    }, 3000)
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
        <h3>{formatTanggalPendek(group.dayKey)} · {formatRupiah(subtotal(group.items))}</h3>
        {#each group.items as tx (tx.id)}
          <button class="recent-item" onclick={() => hapus(tx)}>
            <span>
              <span class="amount {tx.kind}">{tx.kind === 'out' ? '-' : '+'}{formatRupiah(tx.amount)}</span>
              {#if tx.tag}<span class="meta"> #{tx.tag}</span>{/if}
              {#if tx.intent}<span class="meta"> · {tx.intent}</span>{/if}
            </span>
            <span class="meta">hapus</span>
          </button>
        {/each}
      </div>
    {/each}
  {/if}
</div>

{#if snackbar}
  <div class="snackbar">
    <span>{snackbar}</span>
  </div>
{/if}
