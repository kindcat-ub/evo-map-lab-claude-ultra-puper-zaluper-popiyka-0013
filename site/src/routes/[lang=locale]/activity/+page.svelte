<script lang="ts">
	import { ui } from '$lib/i18n/ui';
	import UpdateList from '$lib/ui/UpdateList.svelte';

	let { data } = $props();
	const l = $derived(data.lang);
</script>

<svelte:head><title>{ui('activity', l)} · Last Drop</title></svelte:head>

<main>
	<h1>{ui('activity', l)}</h1>
	<UpdateList items={data.items} lang={l} />
</main>
