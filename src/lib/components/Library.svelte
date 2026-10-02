<script lang="ts">
  import { state as store } from '#lib/client.ts';
  let search = $state('');
  const recipes = $derived(
    Object.values($store.library.recipes)
      .map((r) => ({ recipe: r, version: $store.library.versions[r.current] }))
      .filter(
        (r) =>
          r.version &&
          (r.version.content.title + ' ' + r.version.content.tags.join(' '))
            .toLowerCase()
            .includes(search.toLowerCase())
      )
  );
  const attempts = $derived(Object.values($store.library.attempts).length);
</script>

<div class="page-heading">
  <div>
    <p class="eyebrow">Your kitchen, collected</p>
    <h1>A little book of<br />good things.</h1>
    <p class="lede">Recipes to return to. Notes to make them yours.</p>
  </div>
  <a class="button primary" href="/edit">＋ Write a recipe</a>
</div>
<div class="library-tools">
  <label class="search"
    ><span class="sr-only">Search recipes</span><input
      type="search"
      bind:value={search}
      placeholder="Find a recipe or tag…"
    /></label
  ><span class="muted"
    >{recipes.length}
    {recipes.length === 1 ? 'recipe' : 'recipes'} · {attempts} cooking {attempts ===
    1
      ? 'note'
      : 'notes'}</span
  >
</div>
<div class="recipe-grid">
  {#each recipes as { recipe, version }}
    <a class="recipe-card" href={`/recipe/${recipe.id}`}>
      <div class="card-art">
        <span class="illustration" aria-hidden="true"
          >{recipe.id === 'cinnamon' ? '◎' : '✳'}</span
        ><span class="card-tag"
          >{version.content.tags[0] ?? 'From your kitchen'}</span
        >
      </div>
      <div class="card-content">
        <p class="eyebrow">
          {version.content.tags.slice(1).join(' · ') || 'Saved in your book'}
        </p>
        <h2>{version.content.title}</h2>
        <p>{version.content.description}</p>
        <div class="card-meta">
          <span>{version.content.time || 'Take your time'}</span><span
            >Open recipe ↗</span
          >
        </div>
        {#if $store.progress[recipe.id]}<span class="pill"
            >Cooking in progress</span
          >{/if}
      </div>
    </a>
  {/each}
</div>
{#if !recipes.length}<div class="empty">
    <h2>{search ? 'No recipes found' : 'Your book starts here'}</h2>
    <p>
      {search
        ? 'Try another name or tag.'
        : 'Write a recipe or save a source to import.'}
    </p>
  </div>{/if}
<div class="kitchen-note">
  <span aria-hidden="true">✎</span>
  <p>
    <strong>Keep the small discoveries.</strong> A little less sugar, a longer rise,
    the pan that worked. Add a note after cooking and keep it with the exact recipe
    you used.
  </p>
</div>
