<script lang="ts">
  import { onMount } from 'svelte';
  import {
    state as store,
    getLocal,
    saveLocal,
    savePhoto,
    enqueue,
    problem
  } from '#lib/client.ts';
  import { importSchema, type ImportSource } from '#lib/model.ts';
  import Photos from './Photos.svelte';
  const fresh = (): ImportSource => ({
    id: crypto.randomUUID(),
    created: new Date().toISOString(),
    url: '',
    text: '',
    instruction: '',
    photos: []
  });
  let draft = $state(fresh());
  let ready = $state(false);
  let busy = $state(false);
  let saved = $state('');
  const imports = $derived(
    Object.values($store.library.imports).sort((a, b) =>
      b.created.localeCompare(a.created)
    )
  );
  onMount(() => {
    void getLocal<ImportSource>('draft:import')
      .then((value) => {
        if (value) draft = value;
        ready = true;
      })
      .catch(problem);
  });
  async function persist() {
    if (ready) {
      saved = 'Saving draft…';
      try {
        await saveLocal('draft:import', draft);
        saved = 'Source draft saved on this device';
      } catch (error) {
        saved = 'Draft not saved';
        throw error;
      }
    }
  }
  let cameraInput = $state<HTMLInputElement>();
  async function openCamera() {
    try {
      await persist();
      cameraInput?.click();
    } catch (error) {
      problem(error);
    }
  }
  async function photo(e: Event) {
    const files = (e.currentTarget as HTMLInputElement).files;
    if (!files) return;
    busy = true;
    try {
      for (const file of files) {
        if (draft.photos.length >= 20)
          throw new Error('An entry supports up to 20 photos.');
        draft.photos.push(await savePhoto(file));
        await persist();
      }
    } catch (error) {
      problem(error);
    } finally {
      busy = false;
    }
  }
  async function capture() {
    busy = true;
    try {
      if (!draft.url && !draft.text.trim() && !draft.photos.length)
        throw new Error('Add a link, text, or photo first.');
      const source = importSchema.parse(JSON.parse(JSON.stringify(draft)));
      await enqueue(
        { id: `import-${source.id}`, kind: 'import', source },
        { draft: 'draft:import' }
      );
      draft = fresh();
      saved = 'Source saved. Automatic import processing is not available yet.';
    } catch (error) {
      problem(error);
    } finally {
      busy = false;
    }
  }
</script>

<div class="narrow">
  <p class="eyebrow">From somewhere delicious</p>
  <h1>Add to your book.</h1>
  <p class="lede">
    Write a recipe, or keep a link, cookbook page, or piece of text.
  </p>
  <a class="button primary" href="/edit">＋ Write a recipe now</a>
  <div class="notice">
    <strong>Source capture is ready.</strong> Automatic extraction and agent clarification
    are planned for the next increment. Saved sources are kept locally and synchronized
    to your server.
  </div>
  {#if ready}<form
      onsubmit={(e) => {
        e.preventDefault();
        void capture();
      }}
      oninput={() => void persist().catch(problem)}
    >
      <h2>Save a recipe source</h2>
      <label
        >Recipe link<input
          type="url"
          bind:value={draft.url}
          placeholder="https://…"
        /></label
      ><label
        >Recipe text<textarea
          bind:value={draft.text}
          rows="5"
          placeholder="Paste a recipe or jot down what you have…"
        ></textarea></label
      ><label
        >What should we import?<textarea
          bind:value={draft.instruction}
          rows="2"
          placeholder="Only the bread recipe, not the pie underneath it."
        ></textarea></label
      >
      <div class="capture-actions">
        <button type="button" onclick={() => void openCamera()} disabled={busy}
          >Take a cookbook photo</button
        ><input
          bind:this={cameraInput}
          aria-label="Cookbook camera photo"
          class="file"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          onchange={photo}
          disabled={busy}
        /><label class="button"
          >Choose photos<input
            class="file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onchange={photo}
            disabled={busy}
          /></label
        >
      </div>
      <Photos ids={draft.photos} label="Cookbook page" />
      <p class="small muted">
        Photos are kept in selection order. Add more pages to the same source.
      </p>
      <p class="small muted" role="status">{saved}</p>
      <button class="primary" type="submit" disabled={busy}
        >{busy ? 'Saving…' : 'Save source for import'}</button
      >
    </form>{/if}
  <h2>Saved sources</h2>
  {#if !imports.length}<p class="muted">
      Your captured sources will appear here.
    </p>{/if}{#each imports as source}<article class="journal-card">
      <p class="eyebrow">
        Saved · {new Date(source.created).toLocaleDateString()}
      </p>
      {#if source.url}<a href={source.url} target="_blank" rel="noreferrer"
          >{source.url}</a
        >{/if}{#if source.instruction}<p>
          <strong>{source.instruction}</strong>
        </p>{/if}{#if source.text}<details>
          <summary>View captured text</summary>
          <p class="preserve-lines">{source.text}</p>
        </details>{/if}<Photos ids={source.photos} label="Cookbook page" /><span
        class="pill">Waiting for import processing</span
      >
    </article>{/each}
</div>
