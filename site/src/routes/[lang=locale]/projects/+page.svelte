<script lang="ts">
	import { ui } from '$lib/i18n/ui';
	import ProjectRow from '$lib/ui/ProjectRow.svelte';

	let { data } = $props();
	const l = $derived(data.lang);
</script>

<svelte:head><title>{ui('projects', l)} · Last Drop</title></svelte:head>

<main>
	<h1>{ui('projects', l)}</h1>
	<ul class="plain">
		{#each data.projects as p (p.id)}<li><ProjectRow {p} lang={l} /></li>{/each}
	</ul>
</main>
