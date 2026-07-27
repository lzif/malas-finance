<script lang="ts">
  // Onboarding (spec §7.5). MVP: 2 of 3 cycle paths — fixed monthly date, or
  // "not fixed" (rolling). Manual mode is skipped for the MVP.

  import { appState } from '../stores/appState.svelte'
  import { formatRupiah } from '../domain/money'

  let step = $state(1)
  let initialBalance = $state('')
  let seedDailySpend = $state('')
  let cyclePath = $state<'monthly' | 'rolling' | null>(null)
  let anchorDay = $state('1')
  let submitting = $state(false)

  const initialBalanceNum = $derived(Math.floor(Number(initialBalance) || 0))
  const seedNum = $derived(Math.floor(Number(seedDailySpend) || 0))
  const anchorDayNum = $derived(Math.min(31, Math.max(1, Number(anchorDay) || 1)))

  // Onboarding is what makes the anchor number and runway work from day one
  // (spec §7.5). Skipping through with empty values produces a balance of 0
  // and a seed of 0 — the app then locks permanently into "minus" status
  // with a "—" runway, never explaining why. Negative values are worse
  // still: a wallet with a negative balance skews every formula in §4 from
  // the start.
  const initialBalanceValid = $derived(initialBalanceNum > 0)
  const seedValid = $derived(seedNum > 0)

  function next() {
    step += 1
  }

  function back() {
    step -= 1
  }

  async function complete() {
    submitting = true
    await appState.completeOnboarding({
      initialBalance: initialBalanceNum,
      seedDailySpend: seedNum,
      cycleMode: cyclePath === 'monthly' ? 'monthly-day' : 'rolling',
      cycleAnchorDay: cyclePath === 'monthly' ? anchorDayNum : 1
    })
    submitting = false
  }
</script>

<div class="onboarding">
  {#if step === 1}
    <h1>Uangmu sekarang berapa?</h1>
    <p class="hint">Ini jadi saldo awal dompet CASH kamu.</p>
    <input type="number" inputmode="numeric" min="1" step="1" placeholder="0" bind:value={initialBalance} />
    {#if initialBalance !== '' && !initialBalanceValid}
      <p class="hint error">Isi dengan angka lebih dari nol.</p>
    {/if}
    <div class="actions">
      <span></span>
      <button class="btn-primary" disabled={!initialBalanceValid} onclick={next}>Lanjut</button>
    </div>
  {:else if step === 2}
    <h1>Sehari kira-kira habis berapa?</h1>
    <p class="hint">Perkiraan saja. Ini dipakai untuk menghitung runway sampai data asli terkumpul.</p>
    <input type="number" inputmode="numeric" min="1" step="1" placeholder="0" bind:value={seedDailySpend} />
    {#if seedDailySpend !== '' && !seedValid}
      <p class="hint error">Isi dengan angka lebih dari nol — tanpa ini runway tidak bisa dihitung.</p>
    {/if}
    <div class="actions">
      <button class="btn-text" onclick={back}>Kembali</button>
      <button class="btn-primary" disabled={!seedValid} onclick={next}>Lanjut</button>
    </div>
  {:else if step === 3}
    <h1>Gajian tanggal berapa?</h1>
    <p class="hint">Menentukan kapan jatah harian dihitung ulang dari awal.</p>
    <div class="choice-list">
      <button
        class:selected={cyclePath === 'monthly'}
        onclick={() => (cyclePath = 'monthly')}
      >
        Tanggal tetap tiap bulan
      </button>
      {#if cyclePath === 'monthly'}
        <input
          type="number"
          inputmode="numeric"
          min="1"
          max="31"
          placeholder="Tanggal (1-31)"
          bind:value={anchorDay}
        />
      {/if}
      <button
        class:selected={cyclePath === 'rolling'}
        onclick={() => (cyclePath = 'rolling')}
      >
        Tidak tentu
      </button>
    </div>
    <div class="actions">
      <button class="btn-text" onclick={back}>Kembali</button>
      <button
        class="btn-primary"
        disabled={cyclePath === null || submitting || !initialBalanceValid || !seedValid}
        onclick={complete}
      >
        Mulai
      </button>
    </div>
  {/if}

  <p class="hint">
    Saldo: {formatRupiah(initialBalanceNum)} · Harian: {formatRupiah(seedNum)}
  </p>
</div>
