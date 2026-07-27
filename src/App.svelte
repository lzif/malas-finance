<script lang="ts">
  import { onMount } from 'svelte'
  import { appState } from './lib/stores/appState.svelte'
  import Onboarding from './lib/ui/Onboarding.svelte'
  import Record from './lib/ui/Record.svelte'
  import History from './lib/ui/History.svelte'

  let screen = $state<'record' | 'history'>('record')

  onMount(() => {
    appState.load()
  })
</script>

{#if !appState.loaded}
  <div class="screen"><p>Memuat…</p></div>
{:else if !appState.onboarded}
  <Onboarding />
{:else}
  {#if screen === 'record'}
    <Record />
  {:else}
    <History />
  {/if}
  <nav class="nav">
    <button class:active={screen === 'record'} onclick={() => (screen = 'record')}>Catat</button>
    <button class:active={screen === 'history'} onclick={() => (screen = 'history')}>Riwayat</button>
  </nav>
{/if}
