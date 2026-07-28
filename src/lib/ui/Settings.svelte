<script lang="ts">
  // Settings (spec §7.4) — THIS PHASE ONLY covers the notification section:
  // four toggles + diagnostics (spec §8.5). Cycle, wallets, commitments, and
  // backup settings are unbuilt here on purpose — see TODO.md.

  import { onMount } from 'svelte'
  import { appState } from '../stores/appState.svelte'
  import { checkExactAlarmSetting, openExactAlarmSettings, type ExactAlarmStatus } from '../notify/diagnostics'
  import type { NotifSettings } from '../db/schema'

  type NotifKey = 'allowanceExceeded' | 'noEntryReminder' | 'dailySummary' | 'weeklyRecap'

  let exactAlarm = $state<ExactAlarmStatus>('unsupported')
  let busy = $state<NotifKey | null>(null)

  onMount(async () => {
    exactAlarm = await checkExactAlarmSetting()
  })

  const notif = $derived(appState.notifSettings)
  const diagnostics = $derived(appState.notifyDiagnostics)

  async function toggle(key: NotifKey) {
    busy = key
    await appState.updateNotifSetting({ [key]: !notif[key] } as Partial<NotifSettings>)
    busy = null
  }

  async function openAlarmSettings() {
    await openExactAlarmSettings()
    exactAlarm = await checkExactAlarmSetting()
  }

  function formatLastScheduled(ms: number | null): string {
    if (ms === null) return 'Belum pernah'
    return new Date(ms).toLocaleString('id-ID')
  }

  const exactAlarmLabel = $derived(
    exactAlarm === 'granted' ? 'Aktif' : exactAlarm === 'denied' ? 'Nonaktif' : 'Tidak bisa dicek'
  )
</script>

<div class="screen">
  <h2>Setelan</h2>

  <h3>Notifikasi</h3>
  <div class="settings-row">
    <div>
      <div class="label">Jatah harian lewat</div>
      <div class="desc">Langsung saat jatah hari ini terlampaui.</div>
    </div>
    <button
      class="switch"
      class:on={notif.allowanceExceeded}
      role="switch"
      aria-checked={notif.allowanceExceeded}
      aria-label="Notifikasi jatah harian lewat"
      disabled={busy === 'allowanceExceeded'}
      onclick={() => toggle('allowanceExceeded')}
    ></button>
  </div>
  <div class="settings-row">
    <div>
      <div class="label">Pengingat belum mencatat</div>
      <div class="desc">Jam {notif.noEntryReminderHour}:00 kalau hari ini belum ada catatan.</div>
    </div>
    <button
      class="switch"
      class:on={notif.noEntryReminder}
      role="switch"
      aria-checked={notif.noEntryReminder}
      aria-label="Notifikasi pengingat belum mencatat"
      disabled={busy === 'noEntryReminder'}
      onclick={() => toggle('noEntryReminder')}
    ></button>
  </div>
  <div class="settings-row">
    <div>
      <div class="label">Rekap harian</div>
      <div class="desc">Jam {notif.dailySummaryHour}:00, total belanja hari ini.</div>
    </div>
    <button
      class="switch"
      class:on={notif.dailySummary}
      role="switch"
      aria-checked={notif.dailySummary}
      aria-label="Notifikasi rekap harian"
      disabled={busy === 'dailySummary'}
      onclick={() => toggle('dailySummary')}
    ></button>
  </div>
  <div class="settings-row">
    <div>
      <div class="label">Rekap mingguan</div>
      <div class="desc">Akhir pekan jam {notif.weeklyRecapHour}:00, perbandingan minggu ini.</div>
    </div>
    <button
      class="switch"
      class:on={notif.weeklyRecap}
      role="switch"
      aria-checked={notif.weeklyRecap}
      aria-label="Notifikasi rekap mingguan"
      disabled={busy === 'weeklyRecap'}
      onclick={() => toggle('weeklyRecap')}
    ></button>
  </div>

  <h3>Diagnostik</h3>
  <p class="hint">Terakhir dijadwalkan: {formatLastScheduled(diagnostics.lastScheduledAt)}</p>
  <p class="hint">Alarm presisi: {exactAlarmLabel}</p>
  {#if exactAlarm !== 'unsupported'}
    <button class="btn-text" onclick={openAlarmSettings}>Buka pengaturan alarm</button>
  {:else}
    <p class="hint">
      Alarm presisi hanya bisa dicek di aplikasi Android — tidak tersedia di browser.
    </p>
  {/if}

  <p class="hint">
    Pengaturan siklus, dompet, komitmen, dan backup belum tersedia di layar ini.
  </p>
</div>
