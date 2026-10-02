<script lang="ts">
  import { onMount } from 'svelte';
  import { download as downloadFile } from '#lib/export.ts';
  import {
    state as store,
    signIn,
    exportBackup,
    requestPersistence,
    problem
  } from '#lib/client.ts';
  let secret = $state('');
  let busy = $state(false);
  let size = $state('');
  onMount(() => {
    void navigator.storage?.estimate?.().then((e) => {
      size = `${((e.usage ?? 0) / 1024 / 1024).toFixed(1)} MB used of approximately ${((e.quota ?? 0) / 1024 / 1024).toFixed(0)} MB available`;
    });
  });
  async function login() {
    busy = true;
    try {
      await signIn(secret);
      secret = '';
    } catch (e) {
      problem(e);
    } finally {
      busy = false;
    }
  }
  async function download() {
    busy = true;
    try {
      const backup = await exportBackup();
      downloadFile(
        `forkfolio-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify(backup),
        'application/json'
      );
    } catch (e) {
      problem(e);
    } finally {
      busy = false;
    }
  }
</script>

<div class="narrow">
  <p class="eyebrow">A private place for your recipes</p>
  <h1>Your book, your device.</h1>
  <section class="settings-section">
    <h2>Connect to your server</h2>
    <p>
      Sign in once with your server’s owner secret. Recipes stay available if
      the connection or session expires.
    </p>
    <form
      onsubmit={(e) => {
        e.preventDefault();
        void login();
      }}
    >
      <label
        >Owner secret<input
          type="password"
          bind:value={secret}
          autocomplete="current-password"
          required
        /></label
      ><button class="primary" disabled={busy}>Sign in & sync</button>
    </form>
  </section>
  <section class="settings-section">
    <h2>Offline storage</h2>
    <p>
      {$store.offlineReady
        ? 'The app is cached for offline launch.'
        : 'Offline app installation is not ready. Use a production build over HTTPS or localhost, then reload once.'}
    </p>
    <p>
      {$store.pending} operations waiting to synchronize. {$store.conflicts
        .length} conflicts need a decision.
    </p>
    <p class="small muted">{$store.persistence}</p>
    <p class="small muted">{size}</p>
    <button onclick={() => void requestPersistence().catch(problem)}
      >Ask browser to keep storage</button
    >
    <p class="small muted">
      Clearing this site’s storage removes its local recipes and unsynced work.
      Keep an export before doing so.
    </p>
  </section>
  <section class="settings-section">
    <h2>Keep a copy</h2>
    <p>
      Export recipes, every version, cooking notes, source photos, drafts, and
      unsynced operations from this device.
    </p>
    <button class="primary" onclick={() => void download()} disabled={busy}
      >Export all device data</button
    >
    <p class="small muted">
      This export contains your private content. Store it somewhere safe. Backup
      restoration tools are still to come.
    </p>
  </section>
  <section class="settings-section">
    <h2>Install on Android</h2>
    <p>
      In Chrome, open the menu and choose “Add to home screen” or “Install app.”
      Complete one online load, then test reopening in airplane mode.
    </p>
    <p class="small muted">
      The first build has browser-tested offline behavior. Camera permissions,
      app termination, and installation still need a check on your actual phone.
    </p>
  </section>
</div>
