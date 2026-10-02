<script lang="ts">
  import { state as store, enqueue, problem } from '#lib/client.ts';
  import { changes } from '#lib/quantities.ts';
  import Photos from './Photos.svelte';
  let { id }: { id: string } = $props();
  const recipe = $derived($store.library.recipes[id]);
  const current = $derived($store.library.versions[recipe?.current]);
  const versions = $derived(
    Object.values($store.library.versions)
      .filter((v) => v.recipeId === id)
      .sort((a, b) => b.created.localeCompare(a.created))
  );
  const attempts = $derived(
    Object.values($store.library.attempts)
      .filter((a) => a.recipeId === id)
      .sort((a, b) => b.created.localeCompare(a.created))
  );
  let busy = $state(false);
  async function restore(versionId: string) {
    busy = true;
    try {
      const base = recipe.current;
      const old = $store.library.versions[versionId];
      await enqueue({
        id: crypto.randomUUID(),
        kind: 'publish',
        base,
        version: {
          ...old,
          id: crypto.randomUUID(),
          parent: base,
          created: new Date().toISOString(),
          summary: `Restored ${old.summary}`
        }
      });
    } catch (error) {
      problem(error);
    } finally {
      busy = false;
    }
  }
</script>

<div class="narrow">
  <div class="breadcrumbs">
    <a href={`/recipe/${id}`}>← Back to recipe</a><a href={`/journal/${id}`}
      >Add cooking notes</a
    >
  </div>
  <p class="eyebrow">The recipe, over time</p>
  <h1>{current?.content.title ?? 'Recipe history'}</h1>
  <p class="lede">Keep the experiments. Return to what worked.</p>
  <h2>Cooking journal</h2>
  {#if !attempts.length}<div class="empty compact">
      <p>
        No cooking notes yet. Finish a batch and keep your first discoveries.
      </p>
    </div>{/if}
  {#each attempts as attempt}<article class="journal-card">
      <div class="card-meta">
        <strong
          >{new Date(attempt.created).toLocaleDateString(undefined, {
            dateStyle: 'medium'
          })}</strong
        ><span>{attempt.multiplier}× batch</span>
      </div>
      {#if attempt.notes}<p class="preserve-lines">
          {attempt.notes}
        </p>{/if}{#if attempt.worked}<h3>What worked</h3>
        <p class="preserve-lines">
          {attempt.worked}
        </p>{/if}{#if attempt.improve}<h3>Next time</h3>
        <p class="preserve-lines">
          {attempt.improve}
        </p>{/if}{#if attempt.changes}<h3>Changes made</h3>
        <p class="preserve-lines">{attempt.changes}</p>{/if}<Photos
        ids={attempt.photos}
      /><a class="small" href={`/recipe/${id}?version=${attempt.versionId}`}
        >View the exact recipe cooked ↗</a
      >
    </article>{/each}
  <h2>Recipe versions</h2>
  <div class="timeline">
    {#each versions as version}<article class="version">
        <div class="card-meta">
          <strong>{version.summary}</strong
          >{#if recipe.current === version.id}<span class="pill"
              >Current on this device</span
            >{/if}
        </div>
        <p class="small muted">{new Date(version.created).toLocaleString()}</p>
        {#if version.parent && $store.library.versions[version.parent]}<ul
            class="change-list"
          >
            {#each changes($store.library.versions[version.parent].content, version.content) as line}<li
              >
                {line}
              </li>{/each}
          </ul>{/if}
        <div class="actions">
          <a href={`/recipe/${id}?version=${version.id}`}>Read this version ↗</a
          >{#if recipe.current !== version.id}<button
              disabled={busy}
              onclick={() => void restore(version.id)}
              >Restore as new version</button
            >{/if}
        </div>
      </article>{/each}
  </div>
</div>
