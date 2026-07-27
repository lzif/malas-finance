import { mount } from 'svelte'
import App from './App.svelte'
import './app.css'
import { appState } from './lib/stores/appState.svelte'

const target = document.getElementById('app')
if (!target) throw new Error('#app tidak ditemukan')

// Minta penyimpanan persisten (spec §9.1). Tanpa ini, IndexedDB diperlakukan
// browser sebagai cache yang boleh digusur saat ruang menipis — dan yang
// tergusur adalah seluruh catatan keuangan. Best-effort: browser boleh menolak,
// jadi kegagalannya tidak boleh menghentikan aplikasi.
void navigator.storage?.persist?.().catch(() => undefined)

// Jam reaktif untuk pergantian hari (lihat AppState.startClock).
appState.startClock()

const app = mount(App, { target })

export default app
