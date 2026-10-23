<script lang="ts">
	import { ui } from '$lib/i18n/ui';
	import { href } from '$lib/links';
	import T from '$lib/ui/T.svelte';

	let { data } = $props();
	const l = $derived(data.lang);
	const g = $derived(data.graph);
	const node = $derived(new Map(g.nodes.map((n) => [n.id, n])));
</script>

<svelte:head><title>{ui('evolution', l)} · Last Drop</title></svelte:head>

<main>
	<h1>{ui('evolution', l)}</h1>
	<p class="muted">{ui('evolution_status', l)}</p>
	<p class="small">{g.nodes.length} {ui('nodes', l)} · {g.edges.length} {ui('edges', l)}</p>
	<ul class="plain small">
		{#each g.edges as e}
			{@const from = node.get(e.from)}
			{@const to = node.get(e.to)}
			<li>
				{#if from}<a href={href(from, l)}><T text={from.title} lang={l} /></a>{/if}
				<span class="muted">— {e.type} →</span>
				{#if to}<a href={href(to, l)}><T text={to.title} lang={l} /></a>{/if}
			</li>
		{/each}
	</ul>
</main>
