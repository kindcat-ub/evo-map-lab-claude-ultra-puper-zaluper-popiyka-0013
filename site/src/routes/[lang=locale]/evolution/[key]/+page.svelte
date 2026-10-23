<script lang="ts">
	import { keyOf } from '$contracts';
	import { ui } from '$lib/i18n/ui';
	import EvolutionMap from '$lib/evo/EvolutionMap.svelte';

	let { data } = $props();
	const chips = $derived(data.projects.map((p) => ({ key: keyOf(p.id), title: p.title, current: keyOf(p.id) === data.key })));
</script>

<svelte:head><title>{ui('evolution', data.lang)} · Last Drop</title></svelte:head>

{#key data.key}
	<EvolutionMap view={data.view} lang={data.lang} projects={chips} />
{/key}
