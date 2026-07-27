<script lang="ts">
  // Onboarding (spec §7.5). MVP: 2 dari 3 jalur siklus — tanggal tetap
  // bulanan, atau "tidak tentu" (rolling). Mode manual dilewati untuk MVP.

  import { appState } from '../stores/appState.svelte'
  import { formatRupiah } from '../domain/money'

  let step = $state(1)
  let saldoAwal = $state('')
  let seedDailySpend = $state('')
  let cyclePath = $state<'monthly' | 'rolling' | null>(null)
  let anchorDay = $state('1')
  let submitting = $state(false)

  const saldoAwalNum = $derived(Math.floor(Number(saldoAwal) || 0))
  const seedNum = $derived(Math.floor(Number(seedDailySpend) || 0))
  const anchorDayNum = $derived(Math.min(31, Math.max(1, Number(anchorDay) || 1)))

  // Onboarding inilah yang membuat angka jangkar dan runway berfungsi sejak hari
  // pertama (spec §7.5). Melewatinya dengan nilai kosong menghasilkan saldo 0 dan
  // seed 0 — aplikasi lalu terkunci permanen di status "minus" dengan runway "—"
  // tanpa pernah menjelaskan kenapa. Nilai negatif lebih buruk lagi: dompet
  // bersaldo minus membuat setiap rumus di §4 melenceng sejak awal.
  const saldoValid = $derived(saldoAwalNum > 0)
  const seedValid = $derived(seedNum > 0)

  function next() {
    step += 1
  }

  function back() {
    step -= 1
  }

  async function selesai() {
    submitting = true
    await appState.selesaikanOnboarding({
      saldoAwal: saldoAwalNum,
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
    <input type="number" inputmode="numeric" min="1" step="1" placeholder="0" bind:value={saldoAwal} />
    {#if saldoAwal !== '' && !saldoValid}
      <p class="hint error">Isi dengan angka lebih dari nol.</p>
    {/if}
    <div class="actions">
      <span></span>
      <button class="btn-primary" disabled={!saldoValid} onclick={next}>Lanjut</button>
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
        disabled={cyclePath === null || submitting || !saldoValid || !seedValid}
        onclick={selesai}
      >
        Mulai
      </button>
    </div>
  {/if}

  <p class="hint">
    Saldo: {formatRupiah(saldoAwalNum)} · Harian: {formatRupiah(seedNum)}
  </p>
</div>
