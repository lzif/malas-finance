<script lang="ts">
  // Onboarding (spec §7.5). All three cycle paths: fixed monthly date,
  // "I know the next payday but it isn't fixed" (manual), or "not fixed" (rolling).

  import { fly } from 'svelte/transition'
  import { prefersReducedMotion } from 'svelte/motion'
  import { appState } from '../stores/appState.svelte'
  import { formatRupiah } from '../domain/money'
  import { checkExactAlarmSetting, openExactAlarmSettings } from '../notify/diagnostics'
  import type { NotifSettings } from '../db/schema'

  let step = $state(1)
  let direction = $state(1)
  let initialBalance = $state('')
  let seedDailySpend = $state('')
  let cyclePath = $state<'monthly' | 'manual' | 'rolling' | null>(null)
  let anchorDay = $state('1')
  let manualEnd = $state('')
  let submitting = $state(false)

  // Fourth screen (spec §7.5): notification permission + battery/exact-alarm
  // link (spec §8.5). `exactAlarmSupported` gates whether the settings-link
  // button is shown at all — off Android (browser dev, iOS) there is nothing
  // for it to open.
  let exactAlarmSupported = $state(false)
  let checkedExactAlarm = false
  $effect(() => {
    if (step === 4 && !checkedExactAlarm) {
      checkedExactAlarm = true
      checkExactAlarmSetting().then((s) => {
        exactAlarmSupported = s !== 'unsupported'
      })
    }
  })

  const initialBalanceNum = $derived(Math.floor(Number(initialBalance) || 0))
  const seedNum = $derived(Math.floor(Number(seedDailySpend) || 0))
  const anchorDayNum = $derived(Math.min(31, Math.max(1, Number(anchorDay) || 1)))
  // appState.today is reactive (ticked by startClock) — a plain `Date.now()`
  // read here would go stale if onboarding is left open across midnight,
  // silently letting a now-past date through as "today or later" (the exact
  // trap AGENTS.md documents for the anchor number).
  const manualEndValid = $derived(manualEnd !== '' && manualEnd >= appState.today)

  // Onboarding is what makes the anchor number and runway work from day one
  // (spec §7.5). Skipping through with empty values produces a balance of 0
  // and a seed of 0 — the app then locks permanently into "minus" status
  // with a "—" runway, never explaining why. Negative values are worse
  // still: a wallet with a negative balance skews every formula in §4 from
  // the start.
  const initialBalanceValid = $derived(initialBalanceNum > 0)
  const seedValid = $derived(seedNum > 0)

  function next() {
    direction = 1
    step += 1
  }

  function back() {
    direction = -1
    step -= 1
  }

  const cycleMode = $derived(
    cyclePath === 'monthly' ? 'monthly-day' : cyclePath === 'manual' ? 'manual' : 'rolling'
  )
  const cycleValid = $derived(cyclePath !== null && (cyclePath !== 'manual' || manualEndValid))

  /** Common finish, shared by both step-4 actions (spec §7.5) — only the notif patch differs. */
  async function complete(notif?: Partial<NotifSettings>) {
    submitting = true
    await appState.completeOnboarding({
      initialBalance: initialBalanceNum,
      seedDailySpend: seedNum,
      cycleMode,
      cycleAnchorDay: cyclePath === 'monthly' ? anchorDayNum : 1,
      cycleManualEnd: cyclePath === 'manual' ? manualEnd : null,
      notif
    })
    submitting = false
  }

  /** "Aktifkan & Mulai" — only turns the four toggles on if permission was actually granted. */
  async function enableNotificationsAndFinish() {
    const granted = await appState.requestNotificationPermission()
    await complete(
      granted
        ? { allowanceExceeded: true, noEntryReminder: true, dailySummary: true, weeklyRecap: true }
        : undefined
    )
  }

  async function openBatterySettings() {
    await openExactAlarmSettings()
  }
</script>

<div class="onboarding">
  {#key step}
    <!-- in: only, deliberately: .onboarding has no position/overflow containment,
         so pairing this with an out: transition would leave the outgoing and
         incoming step both in normal document flow for the transition's
         duration, doubling the visible content height for that stretch. -->
    <div
      in:fly={{ x: prefersReducedMotion.current ? 0 : direction > 0 ? 40 : -40, duration: prefersReducedMotion.current ? 0 : 250 }}
    >
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
            class:selected={cyclePath === 'manual'}
            onclick={() => (cyclePath = 'manual')}
          >
            Aku tahu tanggal masuk berikutnya, tapi tidak tetap
          </button>
          {#if cyclePath === 'manual'}
            <input type="date" min={appState.today} bind:value={manualEnd} />
            {#if manualEnd !== '' && !manualEndValid}
              <p class="hint error">Tanggal tidak boleh sebelum hari ini.</p>
            {/if}
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
            disabled={!cycleValid || !initialBalanceValid || !seedValid}
            onclick={next}
          >
            Lanjut
          </button>
        </div>
      {:else if step === 4}
        <h1>Aktifkan notifikasi?</h1>
        <p class="hint">
          Empat pengingat opsional: jatah harian lewat, belum mencatat, rekap harian, dan rekap
          mingguan. Bisa diubah kapan saja lewat Setelan.
        </p>
        {#if exactAlarmSupported}
          <p class="hint">
            Supaya pengingat tidak dimatikan sistem, buka pengaturan alarm presisi juga.
          </p>
          <button class="btn-text" onclick={openBatterySettings}>Buka pengaturan alarm</button>
        {/if}
        <div class="actions">
          <button class="btn-text" disabled={submitting} onclick={() => complete()}>Lewati</button>
          <button class="btn-primary" disabled={submitting} onclick={enableNotificationsAndFinish}>
            Aktifkan & Mulai
          </button>
        </div>
      {/if}
    </div>
  {/key}

  <p class="hint">
    Saldo: {formatRupiah(initialBalanceNum)} · Harian: {formatRupiah(seedNum)}
  </p>
</div>
