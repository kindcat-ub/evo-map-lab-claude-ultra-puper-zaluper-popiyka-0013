<script lang="ts">
	import type { Lang, ProjectCard } from '$contracts';
	import { media } from '$lib/data';
	import { href } from '$lib/links';
	import Status from './Status.svelte';
	import T from './T.svelte';

	let { p, lang }: { p: ProjectCard; lang: Lang } = $props();
</script>

<div class="row">
	{#if p.cover}<img src={media(p.cover)} alt="" loading="lazy" />{:else}<span class="ph"></span>{/if}
	<div>
		<a href={href(p.id, lang)}><T text={p.title} {lang} /></a> <Status status={p.status} {lang} />
		<span class="small muted">{p.lastActivity ?? ''}{#if p.openQuestions} · ? {p.openQuestions}{/if}</span>
		{#if p.summary}<div class="small muted"><T text={p.summary} {lang} /></div>{/if}
	</div>
</div>

<style>
	.row { display: grid; grid-template-columns: 72px 1fr; gap: 14px; align-items: start; }
	img, .ph { width: 72px; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 3px; background: var(--panel); border: 1px solid var(--line); }
</style>
