<script lang="ts">
  // History — spec §7.3: a flat list grouped by day, soft-delete only from
  // here (no swipe-to-delete), plus a Trash sub-tab with restore and
  // permanent-delete. Deleting MUST be undoable: the 5-second snackbar is the
  // fast path back, the Trash tab is the permanent one (unlimited retention,
  // no automatic cleanup).

  import { fly, fade, slide } from 'svelte/transition'
  import { flip } from 'svelte/animate'
  import { prefersReducedMotion } from 'svelte/motion'
  import { appState } from '../stores/appState.svelte'
  import { formatRupiah } from '../domain/money'
  import { formatDateShort } from './formatDate'
  import type { Transaction } from '../db/schema'

  let tab = $state<'riwayat' | 'sampah'>('riwayat')

  let snackbar = $state<{ text: string; undo: () => Promise<void> } | null>(null)
  let snackbarTimeout: ReturnType<typeof setTimeout> | null = null

  // Which trashed entry currently has its typed-confirmation panel open.
  // 'ALL' is the "empty trash" panel — spec §9.4 requires typed confirmation
  // for it regardless of amount.
  let confirmTarget = $state<string | 'ALL' | null>(null)
  let confirmText = $state('')

  function openTab(next: 'riwayat' | 'sampah') {
    tab = next
    confirmTarget = null
    confirmText = ''
    if (next === 'sampah') appState.loadTrash()
  }

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

  function needsTypedConfirm(tx: Transaction): boolean {
    const threshold = appState.settings?.bigDeleteThreshold ?? Infinity
    return tx.amount >= threshold
  }

  async function restoreFromTrash(tx: Transaction) {
    await appState.restoreTransaction(tx.id)
  }

  async function requestPermanentDelete(tx: Transaction) {
    if (!needsTypedConfirm(tx)) {
      await appState.permanentlyDeleteTransaction(tx.id)
      return
    }
    confirmTarget = tx.id
    confirmText = ''
  }

  function requestEmptyTrash() {
    confirmTarget = 'ALL'
    confirmText = ''
  }

  function cancelConfirm() {
    confirmTarget = null
    confirmText = ''
  }

  async function confirmPermanentDelete() {
    if (confirmText !== 'HAPUS' || confirmTarget === null) return
    if (confirmTarget === 'ALL') {
      await appState.emptyTrash()
    } else {
      await appState.permanentlyDeleteTransaction(confirmTarget)
    }
    confirmTarget = null
    confirmText = ''
  }
</script>

<div class="screen">
  <h2>Riwayat</h2>
  <div class="subtabs">
    <button class:active={tab === 'riwayat'} onclick={() => openTab('riwayat')}>Riwayat</button>
    <button class:active={tab === 'sampah'} onclick={() => openTab('sampah')}>Sampah</button>
  </div>

  {#if tab === 'riwayat'}
    {#if appState.transactions.length === 0}
      <p class="empty-state">Belum ada catatan.</p>
    {:else}
      {#each appState.transactionsGroupedByDay() as group (group.dayKey)}
        <div class="day-group">
          <h3>{formatDateShort(group.dayKey)} · {formatRupiah(subtotal(group.items))}</h3>
          {#each group.items as tx (tx.id)}
            <div class="recent-item" animate:flip={{ duration: prefersReducedMotion.current ? 0 : 200 }}>
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
  {:else}
    {#if appState.trash.length === 0}
      <p class="empty-state">Sampah kosong.</p>
    {:else}
      <button class="row-delete" onclick={requestEmptyTrash}>kosongkan sampah</button>
      {#if confirmTarget === 'ALL'}
        <div class="confirm-panel" transition:slide={{ duration: prefersReducedMotion.current ? 0 : 200 }}>
          <p>Ketik <strong>HAPUS</strong> untuk menghapus permanen seluruh {appState.trash.length} entri di sampah. Tidak bisa dibatalkan.</p>
          <input type="text" bind:value={confirmText} placeholder="HAPUS" />
          <div class="confirm-actions">
            <button onclick={cancelConfirm}>batal</button>
            <button class="danger" disabled={confirmText !== 'HAPUS'} onclick={confirmPermanentDelete}>
              hapus permanen
            </button>
          </div>
        </div>
      {/if}
      {#each appState.trash as tx (tx.id)}
        <div class="recent-item">
          <span>
            <span class="amount {tx.kind}">{tx.kind === 'out' ? '-' : '+'}{formatRupiah(tx.amount)}</span>
            {#if tx.tag}<span class="meta"> #{tx.tag}</span>{/if}
            {#if tx.intent}<span class="meta"> · {tx.intent}</span>{/if}
          </span>
          <span class="trash-actions">
            <button class="row-delete" onclick={() => restoreFromTrash(tx)} aria-label="Pulihkan entri">
              pulihkan
            </button>
            <button class="row-delete" onclick={() => requestPermanentDelete(tx)} aria-label="Hapus permanen">
              hapus permanen
            </button>
          </span>
        </div>
        {#if confirmTarget === tx.id}
          <div class="confirm-panel" transition:slide={{ duration: prefersReducedMotion.current ? 0 : 200 }}>
            <p>
              {formatRupiah(appState.settings?.bigDeleteThreshold ?? 0)} ke atas butuh konfirmasi. Ketik
              <strong>HAPUS</strong> untuk menghapus permanen {formatRupiah(tx.amount)}. Tidak bisa dibatalkan.
            </p>
            <input type="text" bind:value={confirmText} placeholder="HAPUS" />
            <div class="confirm-actions">
              <button onclick={cancelConfirm}>batal</button>
              <button class="danger" disabled={confirmText !== 'HAPUS'} onclick={confirmPermanentDelete}>
                hapus permanen
              </button>
            </div>
          </div>
        {/if}
      {/each}
    {/if}
  {/if}
</div>

{#if snackbar}
  <div class="snackbar" in:fly={{ y: 16, duration: prefersReducedMotion.current ? 0 : 200 }} out:fade={{ duration: prefersReducedMotion.current ? 0 : 150 }}>
    <span>{snackbar.text}</span>
    <button onclick={undoLast}>BATAL</button>
  </div>
{/if}
