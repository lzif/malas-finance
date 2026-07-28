<script lang="ts">
  // Commitments (spec §4.3). Two kinds: `bill` is paid with an `out`, `saving`
  // moves money to a reserve wallet. Paid status is derived from transactions,
  // never stored, so removing a payment automatically makes it unpaid again.
  //
  // Also hosts the wallet balance-adjustment panel (spec §7.4) and the backup
  // panel (spec §9.1) — the status line is the only place the user can see
  // whether their data is actually protected.

  import { fade, slide } from 'svelte/transition'
  import { flip } from 'svelte/animate'
  import { prefersReducedMotion } from 'svelte/motion'
  import { appState } from '../stores/appState.svelte'
  import { formatRupiah } from '../domain/money'
  import { dueOccurrence, isPaid } from '../domain/commitment'
  import { formatDateShort } from './formatDate'
  import type { Commitment, Wallet } from '../db/schema'

  let showForm = $state(false)
  let name = $state('')
  let amountText = $state('')
  let dueDayText = $state('1')
  let kind = $state<Commitment['kind']>('bill')
  let busy = $state(false)
  let message = $state<string | null>(null)

  const amount = $derived(Math.floor(Number(amountText) || 0))
  const dueDay = $derived(Math.min(31, Math.max(1, Number(dueDayText) || 1)))
  const valid = $derived(name.trim() !== '' && amount > 0)

  const status = $derived(appState.backupStatus)

  // sesuaikan saldo (spec §7.4): correction is a visible transaction, never a
  // silent overwrite, so the form only ever previews the difference — it
  // never lets the user set a balance directly.
  let adjustTarget = $state<string | null>(null)
  let adjustText = $state('')
  let adjustBusy = $state(false)

  const adjustWallet = $derived(appState.wallets.find((w) => w.id === adjustTarget) ?? null)
  const adjustCurrent = $derived(adjustWallet ? appState.walletBalance(adjustWallet) : 0)
  const adjustActual = $derived(Math.floor(Number(adjustText) || 0))
  const adjustDiff = $derived(adjustActual - adjustCurrent)
  const adjustValid = $derived(adjustText !== '' && Number.isFinite(adjustActual) && adjustActual >= 0)

  function openAdjust(w: Wallet) {
    adjustTarget = w.id
    adjustText = String(appState.walletBalance(w))
  }

  function cancelAdjust() {
    adjustTarget = null
    adjustText = ''
  }

  async function confirmAdjust() {
    if (!adjustTarget || !adjustValid || adjustDiff === 0 || adjustBusy) return
    adjustBusy = true
    await appState.adjustWalletBalance(adjustTarget, adjustActual)
    adjustBusy = false
    adjustTarget = null
    adjustText = ''
  }

  function paid(c: Commitment): boolean {
    return isPaid(c, appState.transactions, appState.today)
  }

  async function add() {
    if (!valid || busy) return
    busy = true
    await appState.createCommitment({ name, amount, kind, dueDay })
    busy = false
    name = ''
    amountText = ''
    dueDayText = '1'
    showForm = false
  }

  async function pay(c: Commitment) {
    if (busy) return
    busy = true
    await appState.payCommitment(c)
    busy = false
  }

  async function backup() {
    busy = true
    const ok = await appState.backupNow()
    busy = false
    message = ok ? 'Cadangan tersimpan.' : 'Cadangan gagal — penyimpanan penuh?'
    setTimeout(() => (message = null), 4000)
  }
</script>

<div class="screen">
  <h2>Komitmen</h2>

  {#if appState.unpaidCommitments > 0}
    <p class="hint">
      Belum dibayar siklus ini: <strong>{formatRupiah(appState.unpaidCommitments)}</strong>. Jumlah
      ini sudah dipotong dari jatah harianmu.
    </p>
  {:else}
    <p class="hint">Tidak ada tagihan tertunggak di siklus ini.</p>
  {/if}

  {#if appState.commitments.filter((c) => c.active).length === 0}
    <p class="empty-state">Belum ada komitmen.</p>
  {:else}
    {#each appState.commitments.filter((c) => c.active) as c (c.id)}
      <div class="recent-item" animate:flip={{ duration: prefersReducedMotion.current ? 0 : 200 }}>
        <span>
          <span class="amount out">{formatRupiah(c.amount)}</span>
          <span class="meta"> {c.name} · tgl {c.dueDay}</span>
          {#if c.kind === 'saving'}<span class="meta"> · tabungan</span>{/if}
          <span class="meta">
            · jatuh tempo {formatDateShort(dueOccurrence(c, appState.today.slice(0, 7)))}
          </span>
        </span>
        {#if paid(c)}
          <span class="meta">lunas</span>
        {:else}
          <button class="row-delete" disabled={busy} onclick={() => pay(c)}>bayar</button>
        {/if}
      </div>
    {/each}
  {/if}

  {#if showForm}
    <div class="form-block" transition:slide={{ duration: prefersReducedMotion.current ? 0 : 200 }}>
      <input type="text" placeholder="Nama (mis. Listrik)" bind:value={name} />
      <input type="number" inputmode="numeric" min="1" step="1" placeholder="Jumlah" bind:value={amountText} />
      <input type="number" inputmode="numeric" min="1" max="31" placeholder="Tanggal jatuh tempo" bind:value={dueDayText} />
      <div class="mode-row">
        <button class="mode-btn" class:active={kind === 'bill'} onclick={() => (kind = 'bill')}>
          TAGIHAN
        </button>
        <button class="mode-btn" class:active={kind === 'saving'} onclick={() => (kind = 'saving')}>
          TABUNGAN
        </button>
      </div>
      <div class="mode-row">
        <button class="mode-btn" onclick={() => (showForm = false)}>Batal</button>
        <button class="mode-btn active" disabled={!valid || busy} onclick={add}>Simpan</button>
      </div>
    </div>
  {:else}
    <button class="wide-save" onclick={() => (showForm = true)}>+ KOMITMEN</button>
  {/if}

  <h2>Dompet</h2>
  {#each appState.wallets as w (w.id)}
    <div class="recent-item">
      <span>
        <span class="amount in">{formatRupiah(appState.walletBalance(w))}</span>
        <span class="meta"> {w.name}{#if w.kind === 'reserve'} · cadangan{/if}</span>
      </span>
      <button class="row-delete" onclick={() => openAdjust(w)}>sesuaikan saldo</button>
    </div>
    {#if adjustTarget === w.id}
      <div class="form-block" transition:slide={{ duration: prefersReducedMotion.current ? 0 : 200 }}>
        <p class="hint">Saldo {w.name} sekarang: {formatRupiah(adjustCurrent)}</p>
        <input
          type="number"
          inputmode="numeric"
          min="0"
          step="1"
          placeholder="Saldo sebenarnya"
          bind:value={adjustText}
        />
        {#if adjustValid && adjustDiff !== 0}
          <p class="hint">
            Selisih {formatRupiah(Math.abs(adjustDiff))} akan dicatat sebagai transaksi
            {adjustDiff > 0 ? 'masuk' : 'keluar'} #koreksi.
          </p>
        {/if}
        <div class="mode-row">
          <button class="mode-btn" onclick={cancelAdjust}>Batal</button>
          <button
            class="mode-btn active"
            disabled={!adjustValid || adjustDiff === 0 || adjustBusy}
            onclick={confirmAdjust}
          >
            Simpan
          </button>
        </div>
      </div>
    {/if}
  {/each}

  <h2>Cadangan</h2>
  <p class="hint" class:error={status.stale}>
    {#if status.lastBackupAt}
      Terakhir: {new Date(status.lastBackupAt).toLocaleString('id-ID')} · {status.dailyCount} snapshot
      harian
      {#if status.stale}<br />Sudah lebih dari 3 hari — cadangkan sekarang.{/if}
      {#if status.lastError}<br />Gagal terakhir: {status.lastError}{/if}
    {:else}
      Belum pernah dicadangkan.
    {/if}
  </p>
  <div class="mode-row">
    <button class="mode-btn" disabled={busy} onclick={backup}>Cadangkan sekarang</button>
    <button class="mode-btn" disabled={busy} onclick={() => appState.exportBackup()}>
      Unduh berkas
    </button>
  </div>
  {#if message}<p class="hint" transition:fade={{ duration: prefersReducedMotion.current ? 0 : 200 }}>{message}</p>{/if}
</div>
