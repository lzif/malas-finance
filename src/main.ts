import { mount } from 'svelte'
import App from './App.svelte'
import './app.css'
import { appState } from './lib/stores/appState.svelte'

const target = document.getElementById('app')
if (!target) throw new Error('#app element not found')

// Request persistent storage (spec §9.1). Without this, the browser treats
// IndexedDB as a cache that can be evicted when space runs low — and what
// gets evicted is the entire financial record. Best-effort: the browser may
// refuse, so its failure must not stop the app.
void navigator.storage?.persist?.().catch(() => undefined)

// Reactive clock for day rollover (see AppState.startClock).
appState.startClock()

const app = mount(App, { target })

export default app
