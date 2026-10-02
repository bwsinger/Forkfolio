<script lang="ts">
  import { photoURL } from '#lib/client.ts';
  let { ids, label = 'Recipe photo' }: { ids: string[]; label?: string } =
    $props();
  let urls = $state<string[]>([]);
  $effect(() => {
    const requested = [...ids];
    let stopped = false;
    let created: string[] = [];
    void Promise.all(requested.map(photoURL)).then((result) => {
      created = result;
      if (stopped) result.forEach((u) => URL.revokeObjectURL(u));
      else urls = result;
    });
    return () => {
      stopped = true;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
  });
</script>

{#if ids.length}<div class="photos">
    {#each urls as url, i}{#if url}<a
          href={url}
          target="_blank"
          rel="noreferrer"><img src={url} alt={`${label} ${i + 1}`} /></a
        >{/if}{/each}
  </div>{/if}
