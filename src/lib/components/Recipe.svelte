<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { page } from '$app/state';
  import {
    state as store,
    saveProgress,
    problem,
    enqueue,
    resolveConflict
  } from '#lib/client.ts';
  import {
    parseRatio,
    numberText,
    quantity,
    renderText,
    shaping
  } from '#lib/quantities.ts';
  import { htmlSnapshot, download } from '#lib/export.ts';
  import type { Progress } from '#lib/model.ts';
  let { id }: { id: string } = $props();
  const recipe = $derived($store.library.recipes[id]);
  const active = $derived($store.progress[id]);
  const selected = $derived(
    page.url.searchParams.get('version') ?? active?.versionId ?? recipe?.current
  );
  const version = $derived($store.library.versions[selected]);
  const c = $derived(version?.content);
  const conflict = $derived($store.conflicts.find((x) => x.recipeId === id));
  let ratioInput = $state(String(untrack(() => active?.multiplier ?? 1)));
  let multiplier = $state(untrack(() => active?.multiplier ?? 1));
  const invalid = $derived(parseRatio(ratioInput) === null);
  const shape = $derived(c ? shaping(c, multiplier) : null);
  let recipePosition = $state<number | null>(null);
  let awake = $state(false);
  let wakeLock: WakeLockSentinel | undefined;
  function progress(): Progress {
    return active
      ? {
          ...active,
          checked: [...active.checked],
          stepChecks: [...active.stepChecks]
        }
      : {
          versionId: version.id,
          multiplier,
          checked: [],
          stepChecks: [],
          started: new Date().toISOString(),
          position: window.scrollY
        };
  }
  async function start() {
    await saveProgress(id, progress());
  }
  async function changeRatio(input: string) {
    ratioInput = input;
    const value = parseRatio(input);
    if (value !== null) {
      multiplier = value;
      if (active) {
        const p = progress();
        p.multiplier = value;
        await saveProgress(id, p);
      }
    }
  }
  async function check(key: string, step = false) {
    const p = progress();
    const list = step ? p.stepChecks : p.checked;
    const index = list.indexOf(key);
    if (index < 0) list.push(key);
    else list.splice(index, 1);
    p.multiplier = multiplier;
    await saveProgress(id, p);
  }
  function toggleIngredients() {
    if (recipePosition === null) {
      recipePosition = window.scrollY;
      document.getElementById('ingredients')?.scrollIntoView();
    } else {
      window.scrollTo(0, recipePosition);
      recipePosition = null;
    }
  }
  async function stayAwake() {
    if (awake) {
      awake = false;
      await wakeLock?.release();
    } else {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
        awake = true;
      } catch {
        problem(new Error('Screen-awake mode is unavailable in this browser.'));
      }
    }
  }
  async function keepLocal() {
    const base = $store.server.recipes[id]?.current ?? null;
    await enqueue(
      {
        id: crypto.randomUUID(),
        kind: 'publish',
        base,
        version: {
          ...version,
          id: crypto.randomUUID(),
          parent: base,
          created: new Date().toISOString(),
          summary: 'Kept this device’s recipe after a sync conflict'
        }
      },
      { conflict: id }
    );
  }
  onMount(() => {
    if (active?.position) window.scrollTo(0, active.position);
    let timer: ReturnType<typeof setTimeout>;
    const remember = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (active) {
          const p = progress();
          p.position = window.scrollY;
          void saveProgress(id, p).catch(problem);
        }
      }, 300);
    };
    const visibility = async () => {
      if (document.visibilityState === 'visible' && awake)
        try {
          wakeLock = await navigator.wakeLock.request('screen');
        } catch {
          awake = false;
        }
    };
    window.addEventListener('scroll', remember);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', remember);
      document.removeEventListener('visibilitychange', visibility);
      void wakeLock?.release();
    };
  });
</script>

<svelte:head><title>{c?.title ?? 'Recipe'} · Forkfolio</title></svelte:head>
{#if !c}<div class="empty">
    <h1>Recipe not on this device</h1>
    <a href="/">Back to your book</a>
  </div>{:else}
  <div class="breadcrumbs no-print">
    <a href="/">← Your recipes</a>
    <div>
      <a href={`/history/${id}`}>History & notes</a><a href={`/edit/${id}`}
        >Edit recipe</a
      >
    </div>
  </div>
  {#if conflict}<div class="conflict no-print" role="status">
      <strong>Two versions were saved.</strong>
      <p>
        You’re viewing this device’s version. The server version is also in
        history.
      </p>
      <div class="actions">
        <button onclick={() => void keepLocal().catch(problem)}
          >Use this version</button
        ><button onclick={() => void resolveConflict(id).catch(problem)}
          >Use server version</button
        ><a href={`/history/${id}`}>Compare in history</a>
      </div>
    </div>{/if}
  {#if selected !== recipe.current}<p class="notice">
      Viewing a saved version: {version.summary}.
      <a href={`/recipe/${id}`}>Current recipe</a>
    </p>{/if}
  {#if active && active.versionId !== recipe.current}<p class="notice">
      Your cooking session stays on the version you started.
    </p>{/if}
  <article class="cooking-page">
    <p class="eyebrow">{c.source.label || 'From your kitchen'}</p>
    <h1>{c.title}</h1>
    <p class="lede">{c.description}</p>
    <div class="tags">
      {#each c.tags as tag}<span class="pill">{tag}</span>{/each}
    </div>
    <dl class="facts">
      <div>
        <dt>Time · original batch</dt>
        <dd>{c.time || '—'}</dd>
      </div>
      <div>
        <dt>Servings</dt>
        <dd>
          {numberText(c.servings[0] * multiplier)}–{numberText(
            c.servings[1] * multiplier
          )}
        </dd>
      </div>
      {#if shape}<div>
          <dt>Makes</dt>
          <dd>About {shape.rolls} rolls</dd>
        </div>{/if}
      <div>
        <dt>Oven</dt>
        <dd>{c.oven || '—'}</dd>
      </div>
    </dl>
    <div class="cooking-actions no-print">
      <button
        class="primary"
        onclick={() => void start().catch(problem)}
        disabled={!!active}
        >{active ? 'Cooking session saved' : 'Start cooking'}</button
      ><a class="button" href={`/journal/${id}`}>Finish & add notes</a
      >{#if typeof navigator !== 'undefined' && 'wakeLock' in navigator}<button
          onclick={() => void stayAwake()}
          aria-pressed={awake}
          >{awake ? 'Screen stays awake' : 'Keep screen awake'}</button
        >{/if}<button onclick={() => window.print()}>Print / save PDF</button
      ><button
        onclick={() =>
          download(
            c.title.replace(/[^a-z0-9]+/gi, '-') + '.html',
            htmlSnapshot(version, multiplier),
            'text/html'
          )}>Export HTML snapshot</button
      >
    </div>
    <section class="scaler" aria-labelledby="scale-heading">
      <div>
        <h2 id="scale-heading">Make it your size</h2>
        <p>Ingredient amounts and shaping guidance scale together.</p>
      </div>
      <div class="scale-controls no-print">
        <label
          >Recipe ratio<input
            aria-invalid={invalid}
            aria-describedby="ratio-error"
            value={ratioInput}
            oninput={(e) =>
              void changeRatio(e.currentTarget.value).catch(problem)}
            inputmode="decimal"
          /></label
        >
        <div class="actions">
          <button
            onclick={() => void changeRatio('0.5').catch(problem)}
            aria-pressed={multiplier === 0.5}>½ Half</button
          ><button onclick={() => void changeRatio('1').catch(problem)}
            >Reset</button
          ><button
            onclick={() => void changeRatio('2').catch(problem)}
            aria-pressed={multiplier === 2}>2× Double</button
          >
        </div>
      </div>
      <p class="scale-status" role="status">
        Showing {numberText(multiplier)}× recipe{#if shape}
          · {shape.rolls} rolls · {shape.pans}
          {shape.pans === 1 ? 'pan' : 'pans'}{/if}
      </p>
      <p id="ratio-error" class="field-error" role="alert" hidden={!invalid}>
        Enter 0.01–100, a fraction like 3/4, or a ratio like 2:1. Last valid
        amounts remain shown.
      </p>
      <p class="small muted">
        Timing and oven temperature stay the same. Extra oven loads take longer.
        Eggs use the original whole-egg rounding rule; ≈ marks rounded amounts.
      </p>
    </section>
    <details class="jump no-print">
      <summary>Jump to a section</summary>
      <nav aria-label="Recipe sections">
        <a href="#ingredients">Ingredients</a
        >{#each [...new Set(c.steps.map((s) => s.group))] as group}<a
            href={`#group-${c.steps.find((s) => s.group === group)?.id}`}
            >{group}</a
          >{/each}
      </nav>
    </details>
    <section id="ingredients">
      <p class="eyebrow">Gather & measure</p>
      <h2>Ingredients</h2>
      <p class="small muted">
        Tap to check off. Small cup amounts use spoons; use the provided weights
        for precision.
      </p>
      {#each c.ingredients as ingredient, i}{#if i === 0 || c.ingredients[i - 1].group !== ingredient.group}<h3
          >
            {ingredient.group}
          </h3>{/if}<label
          class="ingredient"
          class:checked={active?.checked.includes(ingredient.id)}
          ><input
            type="checkbox"
            checked={active?.checked.includes(ingredient.id) ?? false}
            onchange={() => void check(ingredient.id).catch(problem)}
          /><span
            ><strong
              >{ingredient.quantities
                .map((q) => quantity(c, q, multiplier))
                .join(' · ')}</strong
            >{' '}{ingredient.name}</span
          ></label
        >{/each}
    </section>
    <section class="preparation">
      <p class="eyebrow">One step at a time</p>
      <h2>Preparation</h2>
      <p class="equipment">
        <strong>Have ready:</strong>
        {renderText(c, c.equipment, multiplier)}
      </p>
      {#each c.steps as step, i}{#if i === 0 || c.steps[i - 1].group !== step.group}<h3
            class="step-group"
            id={`group-${step.id}`}
          >
            {step.group}
          </h3>{/if}
        <section
          class="step"
          class:step-done={active?.stepChecks.includes(step.id)}
        >
          <div class="step-title">
            <span class="step-number">{String(i + 1).padStart(2, '0')}</span>
            <h3>{step.title}</h3>
            <label class="no-print"
              ><span class="sr-only">Mark step {i + 1} complete</span><input
                type="checkbox"
                checked={active?.stepChecks.includes(step.id) ?? false}
                onchange={() => void check(step.id, true).catch(problem)}
              /></label
            >
          </div>
          {#each renderText(c, step.text, multiplier).split('\n\n') as paragraph}<p
            >
              {paragraph}
            </p>{/each}
        </section>{/each}
    </section>
    {#if c.source.url}<a
        class="source"
        href={c.source.url}
        target="_blank"
        rel="noreferrer">Original recipe · {c.source.label} ↗</a
      >{/if}
    <div class="debrief no-print">
      <h2>How did it go?</h2>
      <p>Keep the discoveries, substitutions, and things to try next time.</p>
      <a class="button primary" href={`/journal/${id}`}>Add cooking notes</a>
    </div>
  </article>
  <button
    class="ingredients-float no-print"
    onclick={toggleIngredients}
    aria-label={recipePosition === null
      ? 'Jump to ingredients'
      : 'Return to recipe'}>{recipePosition === null ? '☷' : '↩'}</button
  >{/if}
