<script lang="ts">
	import { ui } from '$lib/i18n/ui';

	let { data } = $props();
	const l = $derived(data.lang);
</script>

<svelte:head><title>{ui('about', l)} · Last Drop</title></svelte:head>

<main>
	<h1>{ui('about', l)}</h1>
	<p class="muted">{ui('not_published', l)}</p>
</main>
