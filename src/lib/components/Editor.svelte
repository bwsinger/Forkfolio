<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import {
    state as store,
    getLocal,
    saveLocal,
    enqueue,
    problem
  } from '#lib/client.ts';
  import { contentSchema, type Content } from '#lib/model.ts';
  let { id }: { id?: string } = $props();
  type Draft = {
    versionId: string;
    recipeId: string;
    base: string | null;
    content: Content;
    summary: string;
  };
  const key = untrack(() => `draft:recipe:${id ?? 'new'}`);
  const current = untrack(() =>
    id
      ? $store.library.versions[$store.library.recipes[id]?.current]
      : undefined
  );
  const fresh: Content = {
    title: '',
    description: '',
    tags: [],
    time: '',
    oven: '',
    servings: [1, 1],
    equipment: '',
    source: { label: '', url: '' },
    quantities: { amount: { amount: 1, unit: 'g' } },
    ingredients: [
      {
        id: crypto.randomUUID(),
        group: 'Ingredients',
        name: '',
        quantities: ['amount']
      }
    ],
    steps: [
      { id: crypto.randomUUID(), group: 'Preparation', title: '', text: '' }
    ]
  };
  let draft = $state<Draft>({
    versionId: crypto.randomUUID(),
    recipeId: untrack(() => id) ?? crypto.randomUUID(),
    base: current?.id ?? null,
    content: current ? structuredClone(current.content) : fresh,
    summary: current ? 'Updated recipe' : 'First version'
  });
  let ready = $state(false);
  let busy = $state(false);
  let saved = $state('');
  let error = $state('');
  onMount(() => {
    void getLocal<Draft>(key)
      .then((value) => {
        if (value) draft = value;
        ready = true;
      })
      .catch(problem);
  });
  async function persist() {
    if (!ready) return;
    saved = 'Saving draft…';
    try {
      await saveLocal(key, draft);
      saved = 'Draft saved on this device';
    } catch (e) {
      saved = 'Draft not saved';
      problem(e);
    }
  }
  async function leave(event: MouseEvent) {
    event.preventDefault();
    await persist();
    if (saved !== 'Draft not saved') await goto(id ? `/recipe/${id}` : '/');
  }
  function addIngredient() {
    const q = 'quantity-' + crypto.randomUUID();
    draft.content.quantities[q] = { amount: 1, unit: 'cup' };
    draft.content.ingredients.push({
      id: crypto.randomUUID(),
      group: 'Ingredients',
      name: 'New ingredient',
      quantities: [q]
    });
    void persist();
  }
  function addStep() {
    draft.content.steps.push({
      id: crypto.randomUUID(),
      group: 'Preparation',
      title: 'Next step',
      text: ''
    });
    void persist();
  }
  async function publish() {
    busy = true;
    error = '';
    try {
      const content = contentSchema.parse(
        JSON.parse(JSON.stringify(draft.content))
      );
      const opId = `save-${draft.versionId}`;
      await enqueue(
        {
          id: opId,
          kind: 'publish',
          base: draft.base,
          version: {
            id: draft.versionId,
            recipeId: draft.recipeId,
            parent: draft.base,
            created: new Date().toISOString(),
            summary: draft.summary,
            content
          }
        },
        { draft: key }
      );
      await goto(`/recipe/${draft.recipeId}`);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unable to save recipe';
      problem(e);
    } finally {
      busy = false;
    }
  }
</script>

<div class="narrow">
  <div class="breadcrumbs">
    <a href={id ? `/recipe/${id}` : '/'}>← Back</a><span
      class="small muted"
      role="status">{saved}</span
    >
  </div>
  <p class="eyebrow">Write it down</p>
  <h1>{id ? 'Edit your recipe' : 'A new recipe'}</h1>
  <p class="lede">
    Save a new version when you’re ready. Your previous versions stay in the
    book.
  </p>
  {#if ready}<form
      onsubmit={(e) => {
        e.preventDefault();
        void publish();
      }}
      oninput={() => void persist()}
    >
      <label
        >Recipe name<input
          bind:value={draft.content.title}
          required
          maxlength="200"
        /></label
      ><label
        >Description<textarea bind:value={draft.content.description} rows="2"
        ></textarea></label
      >
      <div class="form-grid">
        <label
          >Time estimate<input
            bind:value={draft.content.time}
            placeholder="45 minutes"
          /></label
        ><label
          >Oven temperature<input
            bind:value={draft.content.oven}
            placeholder="350°F"
          /></label
        ><label
          >Minimum servings<input
            type="number"
            min="0.01"
            step="any"
            bind:value={draft.content.servings[0]}
            required
          /></label
        ><label
          >Maximum servings<input
            type="number"
            min="0.01"
            step="any"
            bind:value={draft.content.servings[1]}
            required
          /></label
        >
      </div>
      <label
        >Tags (comma separated)<input
          value={draft.content.tags.join(', ')}
          onchange={(e) => {
            draft.content.tags = e.currentTarget.value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            void persist();
          }}
        /></label
      ><label
        >Equipment<textarea bind:value={draft.content.equipment} rows="2"
        ></textarea></label
      >
      <h2>Ingredients</h2>
      {#each draft.content.ingredients as ingredient}
        <div class="edit-row">
          <div class="form-grid">
            <label>Group<input bind:value={ingredient.group} /></label><label
              >Ingredient / description<input
                bind:value={ingredient.name}
              /></label
            >
          </div>
          <div class="quantity-fields">
            {#each ingredient.quantities as key}<div class="form-grid">
                <label
                  >Amount<input
                    type="number"
                    min="0"
                    step="any"
                    bind:value={draft.content.quantities[key].amount}
                    required
                  /></label
                ><label
                  >Unit<input
                    bind:value={draft.content.quantities[key].unit}
                  /></label
                >
              </div>
              <p class="small muted">
                Linked quantity: <code>{'{{' + key + '}}'}</code>
              </p>{/each}
          </div>
        </div>{/each}<button type="button" onclick={addIngredient}
        >＋ Add ingredient</button
      >
      <h2>Preparation</h2>
      <p class="small muted">
        Use a linked quantity in double braces to keep amounts in steps
        consistent when scaling. Other numbers, including temperatures and
        times, stay unchanged.
      </p>
      {#each draft.content.steps as step, i}<div class="edit-row">
          <label>Step {i + 1} title<input bind:value={step.title} /></label
          ><label>Section<input bind:value={step.group} /></label><label
            >Instructions<textarea bind:value={step.text} rows="5"
            ></textarea></label
          >
        </div>{/each}<button type="button" onclick={addStep}>＋ Add step</button
      >
      <details class="jump">
        <summary>Source and version notes</summary><label
          >Source name<input bind:value={draft.content.source.label} /></label
        ><label
          >Source URL<input
            type="url"
            bind:value={draft.content.source.url}
          /></label
        ><label
          >What changed?<textarea bind:value={draft.summary} rows="2"
          ></textarea></label
        >
      </details>
      {#if error}<p class="field-error" role="alert">{error}</p>{/if}
      <div class="actions sticky-save">
        <button class="primary" type="submit" disabled={busy}
          >{busy ? 'Saving…' : 'Save recipe version'}</button
        ><a class="button" href={id ? `/recipe/${id}` : '/'} onclick={leave}
          >Keep as draft & leave</a
        >
      </div>
    </form>{/if}
</div>
