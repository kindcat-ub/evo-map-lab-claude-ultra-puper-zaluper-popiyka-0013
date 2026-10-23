<script lang="ts">
	import type { Lang, ProjectCard } from '$contracts';
	import { href } from '$lib/links';
	import Status from './Status.svelte';
	import T from './T.svelte';

	let { p, lang }: { p: ProjectCard; lang: Lang } = $props();
</script>

<a href={href(p.id, lang)}><T text={p.title} {lang} /></a> <Status status={p.status} {lang} />
<span class="small muted">{p.lastActivity ?? ''}{#if p.openQuestions} · ? {p.openQuestions}{/if}</span>
{#if p.summary}<div class="small muted"><T text={p.summary} {lang} /></div>{/if}
