<script lang="ts">
  // Catat (beranda) — spec §7.1. Angka jangkar di atas form, niat wajib lewat
  // grid 2×2 yang MERANGKAP tombol simpan, dan dua mekanisme anti-pembiasaan
  // wajib: (1) warna/bobot mengikuti persentase jatah terpakai, (2) baris
  // peringatan sebelum simpan bila nominal akan melewati sisa jatah.

  import { appState } from '../stores/appState.svelte'
  import { formatRupiah, formatAngka } from '../domain/money'
  import { bandJatah, perkiraanLewatJatah } from '../domain/allowance'
  import { formatTanggalPendek } from './formatTanggal'
  import type { Intent, Transaction } from '../db/schema'
  import type { NewTransactionInput } from '../db/repo/transactions'

  type Mode = 'out' | 'in'

  const INTENTS: { value: Intent; label: string }[] = [
    { value: 'planned', label: 'TERENCANA' },
    { value: 'routine', label: 'RUTIN' },
    { value: 'impulse', label: 'IMPULSIF' },
    { value: 'emergency', label: 'DARURAT' }
  ]

  let mode = $state<Mode>('out')
  let nominalDigits = $state('0')
  let selectedTag = $state<string | null>(null)
  let showTagInput = $state(false)
  let customTag = $state('')
  let tagOptions = $state<string[]>([])
  let saving = $state(false)

  let snackbar = $state<{ text: string; undo: () => Promise<void> } | null>(null)
  let snackbarTimeout: ReturnType<typeof setTimeout> | null = null

  const nominal = $derived(Number(nominalDigits))
  const walletId = $derived(appState.wallets[0]?.id ?? '')
  const jatah = $derived(appState.jatah)
  const cycle = $derived(appState.cycle)
  const band = $derived(bandJatah(jatah?.persenTerpakai ?? null))
  const runwayText = $derived(
    appState.runway
      ? `${appState.runway.hari} hari${appState.runway.perkiraan ? ' (perkiraan)' : ''}`
      : '—'
  )
  const lewatJatah = $derived(
    mode === 'out' && jatah && nominal > 0 ? perkiraanLewatJatah(nominal, jatah.sisaJatah) : 0
  )

  $effect(() => {
    const m = mode
    appState.topTags(m).then((tags) => {
      tagOptions = tags
    })
  })

  function appendDigit(d: string) {
    if (nominalDigits.length >= 12) return
    if (d === '000') {
      if (nominalDigits === '0') return
      nominalDigits = (nominalDigits + '000').slice(0, 12)
      return
    }
    nominalDigits = nominalDigits === '0' ? d : nominalDigits + d
  }

  function backspace() {
    nominalDigits = nominalDigits.length <= 1 ? '0' : nominalDigits.slice(0, -1)
  }

  function toggleTag(tag: string) {
    selectedTag = selectedTag === tag ? null : tag
  }

  function confirmCustomTag() {
    const v = customTag.trim()
    if (v) selectedTag = selectedTag === v ? null : v
    customTag = ''
    showTagInput = false
  }

  function resetForm() {
    nominalDigits = '0'
    selectedTag = null
  }

  function fireSnackbar(text: string, undo: () => Promise<void>) {
    if (snackbarTimeout) clearTimeout(snackbarTimeout)
    snackbar = { text, undo }
    snackbarTimeout = setTimeout(() => {
      snackbar = null
    }, 5000)
  }

  async function batalkan() {
    if (!snackbar) return
    const undo = snackbar.undo
    snackbar = null
    if (snackbarTimeout) clearTimeout(snackbarTimeout)
    await undo()
  }

  async function simpanKeluar(intent: Intent) {
    if (nominal <= 0 || !walletId || saving) return
    saving = true
    const input: NewTransactionInput = {
      kind: 'out',
      amount: nominal,
      intent,
      tag: selectedTag,
      note: null,
      walletId,
      toWalletId: null,
      commitmentId: null
    }
    const tx = await appState.simpanTransaksi(input)
    saving = false
    resetForm()
    fireSnackbar(
      `Keluar ${formatRupiah(tx.amount)}${tx.tag ? ' #' + tx.tag : ''}`,
      () => appState.hapusTransaksi(tx.id)
    )
  }

  async function simpanMasuk() {
    if (nominal <= 0 || !walletId || saving) return
    saving = true
    const input: NewTransactionInput = {
      kind: 'in',
      amount: nominal,
      intent: null,
      tag: selectedTag,
      note: null,
      walletId,
      toWalletId: null,
      commitmentId: null
    }
    const tx = await appState.simpanTransaksi(input)
    saving = false
    resetForm()
    fireSnackbar(`Masuk ${formatRupiah(tx.amount)}`, () => appState.hapusTransaksi(tx.id))
  }

  async function hapusEntri(tx: Transaction) {
    await appState.hapusTransaksi(tx.id)
    fireSnackbar(
      `Dihapus: ${formatRupiah(tx.amount)}${tx.tag ? ' #' + tx.tag : ''}`,
      () => appState.pulihkanTransaksi(tx.id)
    )
  }
</script>

<div class="screen">
  <div class="anchor band-{band}">
    {#if jatah && cycle}
      {#if jatah.status === 'minus'}
        <div class="anchor-value">Rp 0</div>
        <div class="anchor-sub danger">
          Kamu minus {formatRupiah(-jatah.danaTersedia)} sampai {formatTanggalPendek(cycle.end)}
        </div>
      {:else if jatah.status === 'lewat'}
        <div class="anchor-value">Rp 0</div>
        <div class="anchor-sub danger">Lewat {formatRupiah(-jatah.sisaJatah)} hari ini</div>
      {:else}
        <div class="anchor-value">{formatRupiah(jatah.sisaJatah)}</div>
        <div class="anchor-sub">
          dari {formatRupiah(jatah.jatahHariIni)} · runway {runwayText}
        </div>
      {/if}
    {:else}
      <div class="anchor-value">—</div>
    {/if}
  </div>

  <div class="mode-row">
    <button class="mode-btn" class:active={mode === 'out'} onclick={() => (mode = 'out')}>
      KELUAR
    </button>
    <button class="mode-btn" class:active={mode === 'in'} onclick={() => (mode = 'in')}>
      masuk
    </button>
  </div>

  <div>
    <div class="keypad-display">{formatAngka(nominal)}</div>
    <div class="keypad-grid">
      <button onclick={() => appendDigit('7')}>7</button>
      <button onclick={() => appendDigit('8')}>8</button>
      <button onclick={() => appendDigit('9')}>9</button>
      <button onclick={() => appendDigit('4')}>4</button>
      <button onclick={() => appendDigit('5')}>5</button>
      <button onclick={() => appendDigit('6')}>6</button>
      <button class="backspace" onclick={backspace}>⌫</button>
      <button onclick={() => appendDigit('1')}>1</button>
      <button onclick={() => appendDigit('2')}>2</button>
      <button onclick={() => appendDigit('3')}>3</button>
      <button onclick={() => appendDigit('0')}>0</button>
      <button onclick={() => appendDigit('000')}>000</button>
    </div>
  </div>

  <div class="tag-row">
    {#each tagOptions as tag (tag)}
      <button class="chip" class:selected={selectedTag === tag} onclick={() => toggleTag(tag)}>
        #{tag}
      </button>
    {/each}
    {#if showTagInput}
      <input
        class="chip-input"
        type="text"
        placeholder="tag baru"
        bind:value={customTag}
        onkeydown={(e) => e.key === 'Enter' && confirmCustomTag()}
        onblur={confirmCustomTag}
      />
    {:else}
      <button class="chip" onclick={() => (showTagInput = true)}>+ tag</button>
    {/if}
    {#if selectedTag && !tagOptions.includes(selectedTag)}
      <button class="chip selected" onclick={() => toggleTag(selectedTag!)}>#{selectedTag}</button>
    {/if}
  </div>

  <div class="wallet-label">{appState.wallets[0]?.name ?? 'CASH'} ▾</div>

  {#if mode === 'out'}
    <div class="warning-line">
      {#if lewatJatah > 0}
        Ini akan melewati jatah {formatRupiah(lewatJatah)}.
      {/if}
    </div>
    <div class="intent-grid">
      {#each INTENTS as intent (intent.value)}
        <button disabled={nominal <= 0 || saving} onclick={() => simpanKeluar(intent.value)}>
          {intent.label}
        </button>
      {/each}
    </div>
  {:else}
    <button class="wide-save" disabled={nominal <= 0 || saving} onclick={simpanMasuk}>
      SIMPAN PEMASUKAN
    </button>
  {/if}

  <div class="recent-list">
    {#each appState.recentTransactions as tx (tx.id)}
      <button class="recent-item" onclick={() => hapusEntri(tx)}>
        <span>
          <span class="amount {tx.kind}">{tx.kind === 'out' ? '-' : '+'}{formatRupiah(tx.amount)}</span>
          {#if tx.tag}<span class="meta"> #{tx.tag}</span>{/if}
          {#if tx.intent}<span class="meta"> · {tx.intent}</span>{/if}
        </span>
        <span class="meta">hapus</span>
      </button>
    {/each}
  </div>
</div>

{#if snackbar}
  <div class="snackbar">
    <span>{snackbar.text}</span>
    <button onclick={batalkan}>BATAL</button>
  </div>
{/if}
