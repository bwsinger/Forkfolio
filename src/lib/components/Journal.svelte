<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import {
    state as store,
    getLocal,
    saveLocal,
    savePhoto,
    enqueue,
    problem
  } from '#lib/client.ts';
  import type { Attempt } from '#lib/model.ts';
  import Photos from './Photos.svelte';
  let { id }: { id: string } = $props();
  const active = untrack(() => $store.progress[id]);
  const versionId = untrack(
    () => active?.versionId ?? $store.library.recipes[id]?.current
  );
  const key = untrack(() => `draft:notes:${id}`);
  let draft = $state<Attempt>({
    id: crypto.randomUUID(),
    recipeId: untrack(() => id),
    versionId,
    created: active?.started ?? new Date().toISOString(),
    multiplier: active?.multiplier ?? 1,
    notes: '',
    worked: '',
    improve: '',
    changes: '',
    photos: []
  });
  const version = $derived($store.library.versions[draft.versionId]);
  let busy = $state(false);
  let ready = $state(false);
  let saved = $state('');
  onMount(() => {
    void getLocal<Attempt>(key)
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
        await saveLocal(key, draft);
        saved = 'Notes draft saved on this device';
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
  async function finish() {
    busy = true;
    try {
      await enqueue(
        {
          id: `attempt-${draft.id}`,
          kind: 'attempt',
          attempt: JSON.parse(JSON.stringify(draft))
        },
        { draft: key, progress: id }
      );
      await goto(`/history/${id}`);
    } catch (error) {
      problem(error);
    } finally {
      busy = false;
    }
  }
</script>

<div class="narrow">
  <div class="breadcrumbs">
    <a href={`/recipe/${id}`}>← Back to recipe</a><span
      class="small muted"
      role="status">{saved}</span
    >
  </div>
  <p class="eyebrow">The kitchen journal</p>
  <h1>How did it go?</h1>
  <p class="lede">
    {version?.content.title ?? 'Recipe'} · {draft.multiplier}× batch
  </p>
  <p class="small muted">
    These notes stay attached to the version you cooked.
  </p>
  {#if ready}<form
      onsubmit={(e) => {
        e.preventDefault();
        void finish();
      }}
      oninput={() => void persist().catch(problem)}
    >
      <label
        >Your cooking notes<textarea
          bind:value={draft.notes}
          rows="5"
          placeholder="The story of this batch…"></textarea></label
      ><label
        >What went well?<textarea
          bind:value={draft.worked}
          rows="3"
          placeholder="Texture, flavor, timing, a technique worth repeating…"
        ></textarea></label
      ><label
        >What would you change?<textarea
          bind:value={draft.improve}
          rows="3"
          placeholder="What went wrong or what to try next time…"
        ></textarea></label
      ><label
        >Ingredients or techniques changed<textarea
          bind:value={draft.changes}
          rows="3"
          placeholder="What you added, left out, or did differently…"
        ></textarea></label
      >
      <div class="capture-actions">
        <button type="button" onclick={() => void openCamera()} disabled={busy}
          >Take a photo</button
        ><input
          bind:this={cameraInput}
          aria-label="Camera photo"
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
      <Photos ids={draft.photos} label="Cooking attempt photo" />
      <p class="small muted">
        Prompts are optional. Photos and notes save on this device before
        upload.
      </p>
      <button type="submit" class="primary" disabled={busy}
        >{busy ? 'Saving…' : 'Save cooking notes'}</button
      >
    </form>{/if}
</div>
