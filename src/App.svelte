<script lang="ts">
  import { onMount } from 'svelte'
  import { appState } from './lib/stores/appState.svelte'
  import Onboarding from './lib/ui/Onboarding.svelte'
  import Catat from './lib/ui/Catat.svelte'
  import Riwayat from './lib/ui/Riwayat.svelte'

  let screen = $state<'catat' | 'riwayat'>('catat')

  onMount(() => {
    appState.load()
  })
</script>

{#if !appState.loaded}
  <div class="screen"><p>Memuat…</p></div>
{:else if !appState.onboarded}
  <Onboarding />
{:else}
  {#if screen === 'catat'}
    <Catat />
  {:else}
    <Riwayat />
  {/if}
  <nav class="nav">
    <button class:active={screen === 'catat'} onclick={() => (screen = 'catat')}>Catat</button>
    <button class:active={screen === 'riwayat'} onclick={() => (screen = 'riwayat')}>Riwayat</button>
  </nav>
{/if}
