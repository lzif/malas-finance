<script lang="ts">
  import { onMount } from 'svelte'
  import { fly } from 'svelte/transition'
  import { prefersReducedMotion } from 'svelte/motion'
  import { appState } from './lib/stores/appState.svelte'
  import Onboarding from './lib/ui/Onboarding.svelte'
  import Record from './lib/ui/Record.svelte'
  import History from './lib/ui/History.svelte'
  import Commitments from './lib/ui/Commitments.svelte'

  const SCREENS = ['record', 'history', 'commitments'] as const
  type Screen = (typeof SCREENS)[number]

  let screen = $state<Screen>('record')
  // Direction the last screen change moved: +1 forward (right→left slide-in),
  // -1 backward. Read by the {#key screen} transition below.
  let direction = $state(1)

  const swipeThreshold = 60
  const edgeGuard = 24 // px from viewport edge reserved for the OS back-gesture
  let dragStartX = 0
  let dragStartY = 0
  let dragging = false

  function goTo(next: Screen) {
    if (next === screen) return
    direction = SCREENS.indexOf(next) > SCREENS.indexOf(screen) ? 1 : -1
    screen = next
  }

  function onPointerDown(e: PointerEvent) {
    if (e.clientX < edgeGuard || e.clientX > window.innerWidth - edgeGuard) return
    dragStartX = e.clientX
    dragStartY = e.clientY
    dragging = true
  }

  function endDrag(e: PointerEvent) {
    if (!dragging) return
    dragging = false
    const dx = e.clientX - dragStartX
    const dy = e.clientY - dragStartY
    if (Math.abs(dx) <= Math.abs(dy) * 1.5) return
    if (Math.abs(dx) < swipeThreshold) return
    const idx = SCREENS.indexOf(screen)
    if (dx < 0 && idx < SCREENS.length - 1) goTo(SCREENS[idx + 1])
    else if (dx > 0 && idx > 0) goTo(SCREENS[idx - 1])
  }

  onMount(() => {
    appState.load()
  })
</script>

{#if !appState.loaded}
  <div class="screen"><p>Memuat…</p></div>
{:else if !appState.onboarded}
  <Onboarding />
{:else}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- Gesture layer only: the nav buttons below are the accessible/keyboard path
       to every screen, this div purely adds an optional touch shortcut on top. -->
  <div
    class="screen-track"
    onpointerdown={onPointerDown}
    onpointerup={endDrag}
    onpointercancel={endDrag}
  >
    {#key screen}
      <div
        class="screen-slide"
        in:fly={{ x: prefersReducedMotion.current ? 0 : direction > 0 ? 40 : -40, duration: prefersReducedMotion.current ? 0 : 250 }}
        out:fly={{ x: prefersReducedMotion.current ? 0 : direction > 0 ? -40 : 40, duration: prefersReducedMotion.current ? 0 : 250 }}
      >
        {#if screen === 'record'}
          <Record />
        {:else if screen === 'history'}
          <History />
        {:else}
          <Commitments />
        {/if}
      </div>
    {/key}
  </div>
  <nav class="nav">
    <button class:active={screen === 'record'} onclick={() => goTo('record')}>Catat</button>
    <button class:active={screen === 'history'} onclick={() => goTo('history')}>Riwayat</button>
    <button class:active={screen === 'commitments'} onclick={() => goTo('commitments')}>
      Komitmen
    </button>
  </nav>
{/if}
