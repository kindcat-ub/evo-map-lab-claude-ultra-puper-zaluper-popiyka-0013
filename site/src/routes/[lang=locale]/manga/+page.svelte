<script lang="ts">
	import { ui } from '$lib/i18n/ui';
	import { href } from '$lib/links';
	import { media } from '$lib/data';
	import T from '$lib/ui/T.svelte';

	let { data } = $props();
	const l = $derived(data.lang);
</script>

<svelte:head><title>{ui('manga', l)} · Last Drop</title></svelte:head>

<main>
	<h1>{ui('manga', l)}</h1>
	<ul class="chapters">
		{#each data.chapters as c (c.id)}
			<li>
				<a href={href(c.id, l)}>
					{#if c.cover}<img src={media(c.cover)} alt="" loading="lazy" />{/if}
					<span>{c.number}. <T text={c.title} lang={l} /></span>
					<span class="small muted">{c.pages} {ui('pages', l)}{#if c.date} · {c.date}{/if}</span>
				</a>
			</li>
		{/each}
	</ul>
</main>

<style>
	.chapters { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 20px; }
	.chapters a { display: grid; gap: 6px; text-decoration: none; }
	img { width: 100%; aspect-ratio: 2 / 3; object-fit: cover; border: 1px solid var(--line); }
	a:hover img { border-color: var(--accent); }
</style>
