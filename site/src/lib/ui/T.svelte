<script lang="ts">
	import { pick, type Lang, type Text } from '$contracts';

	let { text, lang }: { text: Text | undefined; lang: Lang } = $props();
	const r = $derived(pick(text, lang));
</script>

<!-- A missing translation shows the other language, marked, never invented. -->
{#if r && r.lang !== lang}<span lang={r.lang} class="fallback" title={r.lang}>{r.text}</span>{:else if r}{r.text}{/if}

<style>
	.fallback { font-style: italic; }
</style>
