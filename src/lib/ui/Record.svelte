<script lang="ts">
  // Record (home screen) — spec §7.1. The anchor number sits above the form,
  // intent is required via a 2×2 grid that DOUBLES as the save button, and
  // two mandatory anti-habituation mechanisms: (1) color/weight follow the
  // percentage of the allowance used, (2) a warning line appears before
  // saving if the amount would exceed the remaining allowance.

  import { appState } from '../stores/appState.svelte'
  import { formatRupiah, formatNumber } from '../domain/money'
  import { allowanceBand, projectedOverspend } from '../domain/allowance'
  import { formatDateShort } from './formatDate'
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
  let amountDigits = $state('0')
  let selectedTag = $state<string | null>(null)
  let showTagInput = $state(false)
  let customTag = $state('')
  let tagOptions = $state<string[]>([])
  let saving = $state(false)

  let snackbar = $state<{ text: string; undo: () => Promise<void> } | null>(null)
  let snackbarTimeout: ReturnType<typeof setTimeout> | null = null

  const amount = $derived(Number(amountDigits))
  const walletId = $derived(appState.wallets[0]?.id ?? '')
  const allowance = $derived(appState.allowance)
  const cycle = $derived(appState.cycle)
  const band = $derived(allowanceBand(allowance?.percentUsed ?? null))
  const runwayText = $derived(
    appState.runway
      ? `${appState.runway.days} hari${appState.runway.estimated ? ' (perkiraan)' : ''}`
      : '—'
  )
  const overspend = $derived(
    mode === 'out' && allowance && amount > 0
      ? projectedOverspend(amount, allowance.remainingAllowance)
      : 0
  )

  $effect(() => {
    const m = mode
    appState.topTags(m).then((tags) => {
      tagOptions = tags
    })
  })

  function appendDigit(d: string) {
    if (amountDigits.length >= 12) return
    if (d === '000') {
      if (amountDigits === '0') return
      amountDigits = (amountDigits + '000').slice(0, 12)
      return
    }
    amountDigits = amountDigits === '0' ? d : amountDigits + d
  }

  function backspace() {
    amountDigits = amountDigits.length <= 1 ? '0' : amountDigits.slice(0, -1)
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
    amountDigits = '0'
    selectedTag = null
  }

  function fireSnackbar(text: string, undo: () => Promise<void>) {
    if (snackbarTimeout) clearTimeout(snackbarTimeout)
    snackbar = { text, undo }
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

  async function saveExpense(intent: Intent) {
    if (amount <= 0 || !walletId || saving) return
    saving = true
    const input: NewTransactionInput = {
      kind: 'out',
      amount,
      intent,
      tag: selectedTag,
      note: null,
      walletId,
      toWalletId: null,
      commitmentId: null
    }
    const tx = await appState.saveTransaction(input)
    saving = false
    resetForm()
    fireSnackbar(
      `Keluar ${formatRupiah(tx.amount)}${tx.tag ? ' #' + tx.tag : ''}`,
      () => appState.deleteTransaction(tx.id)
    )
  }

  async function saveIncome() {
    if (amount <= 0 || !walletId || saving) return
    saving = true
    const input: NewTransactionInput = {
      kind: 'in',
      amount,
      intent: null,
      tag: selectedTag,
      note: null,
      walletId,
      toWalletId: null,
      commitmentId: null
    }
    const tx = await appState.saveTransaction(input)
    saving = false
    resetForm()
    fireSnackbar(`Masuk ${formatRupiah(tx.amount)}`, () => appState.deleteTransaction(tx.id))
  }

  async function deleteEntry(tx: Transaction) {
    await appState.deleteTransaction(tx.id)
    fireSnackbar(
      `Dihapus: ${formatRupiah(tx.amount)}${tx.tag ? ' #' + tx.tag : ''}`,
      () => appState.restoreTransaction(tx.id)
    )
  }
</script>

<div class="screen">
  <div class="anchor band-{band}">
    {#if allowance && cycle}
      {#if allowance.status === 'minus'}
        <div class="anchor-value">Rp 0</div>
        <div class="anchor-sub danger">
          Kamu minus {formatRupiah(-allowance.availableFunds)} sampai {formatDateShort(cycle.end)}
        </div>
      {:else if allowance.status === 'lewat'}
        <div class="anchor-value">Rp 0</div>
        <div class="anchor-sub danger">Lewat {formatRupiah(-allowance.remainingAllowance)} hari ini</div>
      {:else}
        <div class="anchor-value">{formatRupiah(allowance.remainingAllowance)}</div>
        <div class="anchor-sub">
          dari {formatRupiah(allowance.allowanceToday)} · runway {runwayText}
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
    <div class="keypad-display">{formatNumber(amount)}</div>
    <div class="keypad-grid">
      <button onclick={() => appendDigit('7')}>7</button>
      <button onclick={() => appendDigit('8')}>8</button>
      <button onclick={() => appendDigit('9')}>9</button>
      <button onclick={() => appendDigit('4')}>4</button>
      <button onclick={() => appendDigit('5')}>5</button>
      <button onclick={() => appendDigit('6')}>6</button>
      <button onclick={() => appendDigit('1')}>1</button>
      <button onclick={() => appendDigit('2')}>2</button>
      <button onclick={() => appendDigit('3')}>3</button>
      <button onclick={() => appendDigit('0')}>0</button>
      <button onclick={() => appendDigit('000')}>000</button>
      <button class="backspace" onclick={backspace} aria-label="Hapus satu digit">⌫</button>
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
      {#if overspend > 0}
        Ini akan melewati jatah {formatRupiah(overspend)}.
      {/if}
    </div>
    <div class="intent-grid">
      {#each INTENTS as intent (intent.value)}
        <button disabled={amount <= 0 || saving} onclick={() => saveExpense(intent.value)}>
          {intent.label}
        </button>
      {/each}
    </div>
  {:else}
    <button class="wide-save" disabled={amount <= 0 || saving} onclick={saveIncome}>
      SIMPAN PEMASUKAN
    </button>
  {/if}

  <div class="recent-list">
    {#each appState.recentTransactions as tx (tx.id)}
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
</div>

{#if snackbar}
  <div class="snackbar">
    <span>{snackbar.text}</span>
    <button onclick={undoLast}>BATAL</button>
  </div>
{/if}
