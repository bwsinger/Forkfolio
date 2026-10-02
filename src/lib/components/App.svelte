<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import {
    initialize,
    state as store,
    sync,
    stopSync,
    problem
  } from '#lib/client.ts';
  import Library from './Library.svelte';
  import Recipe from './Recipe.svelte';
  import Editor from './Editor.svelte';
  import Journal from './Journal.svelte';
  import History from './History.svelte';
  import Sources from './Sources.svelte';
  import Settings from './Settings.svelte';
  let theme = $state('light');
  const route = $derived(page.url.pathname.split('/').filter(Boolean));
  onMount(() => {
    try {
      theme =
        localStorage.getItem('forkfolio-theme') ??
        (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    } catch {}
    void initialize().catch(problem);
    const reconnect = () => void sync();
    const foreground = () => {
      if (document.visibilityState === 'visible') void sync();
    };
    window.addEventListener('online', reconnect);
    document.addEventListener('visibilitychange', foreground);
    return () => {
      stopSync();
      window.removeEventListener('online', reconnect);
      document.removeEventListener('visibilitychange', foreground);
    };
  });
  $effect(() => {
    document.documentElement.dataset.theme = theme;
  });
  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem('forkfolio-theme', theme);
    } catch {}
  }
</script>

<svelte:head
  ><title>Forkfolio · Your recipe book</title><meta
    name="description"
    content="Your private recipe book, ready for cooking offline."
  /></svelte:head
>
<a class="skip" href="#main">Skip to content</a>
<header class="app-header no-print">
  <a class="brand" href="/"
    ><img src="/icon.svg" alt="" width="34" height="34" /><span>Forkfolio</span
    ></a
  >
  <nav aria-label="Main navigation">
    <a href="/" aria-current={route.length === 0 ? 'page' : undefined}
      >Recipes</a
    ><a
      href="/sources"
      aria-current={route[0] === 'sources' ? 'page' : undefined}>Add recipe</a
    ><a
      href="/settings"
      aria-current={route[0] === 'settings' ? 'page' : undefined}>Settings</a
    >
  </nav>
  <button
    class="theme-button"
    onclick={toggleTheme}
    aria-label={`Use ${theme === 'dark' ? 'light' : 'dark'} theme`}
    >{theme === 'dark' ? '☀' : '☾'}</button
  >
</header>
<div class="connection no-print">
  <span class:warning={$store.pending > 0 || $store.conflicts.length > 0}
    ><span class="status-dot"></span>{$store.status}{#if $store.pending > 0}
      · {$store.pending} waiting{/if}</span
  ><button
    onclick={() => void sync()}
    disabled={!$store.ready || $store.status === 'Syncing…'}>Sync now</button
  >
</div>
{#if $store.error}<div class="alert no-print" role="alert">
    {$store.error}
  </div>{/if}
<main id="main">
  {#if !$store.ready}<div class="empty">
      <h1>Opening your recipe book…</h1>
      <p>Loading recipes saved on this device.</p>
    </div>
  {:else}{#key page.url.pathname}
      {#if !route.length}<Library />
      {:else if route[0] === 'recipe' && route[1]}<Recipe id={route[1]} />
      {:else if route[0] === 'edit'}<Editor id={route[1]} />
      {:else if route[0] === 'journal' && route[1]}<Journal id={route[1]} />
      {:else if route[0] === 'history' && route[1]}<History id={route[1]} />
      {:else if route[0] === 'sources'}<Sources />
      {:else if route[0] === 'settings'}<Settings />
      {:else}<div class="empty">
          <h1>Page not found</h1>
          <a href="/">Return to your recipes</a>
        </div>{/if}
    {/key}{/if}
</main>
<footer class="app-footer no-print">
  <span>Made for your kitchen.</span><span
    >{$store.offlineReady
      ? 'App available offline'
      : 'Open a production build to enable offline launch'}</span
  >
</footer>
