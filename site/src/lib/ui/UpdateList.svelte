<script lang="ts">
	import type { Lang, UpdateItem } from '$contracts';
	import { ui } from '$lib/i18n/ui';
	import { href } from '$lib/links';
	import T from './T.svelte';

	let { items, lang, showProject = true }: { items: UpdateItem[]; lang: Lang; showProject?: boolean } = $props();
</script>

<ul class="plain">
	{#each items as u (u.id)}
		<li id={u.id}>
			<div class="small muted">
				<time datetime={u.date}>{u.date}</time> · {ui(`type.${u.type}`, lang)}{#if u.open} · <b>{ui('open', lang)}</b>{/if}
				{#if showProject && u.project}· <a href={href(u.project, lang)}><T text={u.projectTitle} {lang} /></a>{/if}
			</div>
			<div><T text={u.title} {lang} /></div>
			{#if u.body}<div class="small muted"><T text={u.body} {lang} /></div>{/if}
		</li>
	{/each}
</ul>
