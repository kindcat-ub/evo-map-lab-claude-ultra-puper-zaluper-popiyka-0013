<script lang="ts">
	import { ui, type UiKey } from '$lib/i18n/ui';
	import { href } from '$lib/links';
	import { media } from '$lib/data';
	import T from '$lib/ui/T.svelte';
	import Status from '$lib/ui/Status.svelte';
	import UpdateList from '$lib/ui/UpdateList.svelte';
	import ProjectRow from '$lib/ui/ProjectRow.svelte';

	let { data } = $props();
	const l = $derived(data.lang);
	const v = $derived(data.view);
	const ways: { key: UiKey; path: string }[] = [
		{ key: 'manga', path: 'manga' },
		{ key: 'evolution', path: 'evolution' },
		{ key: 'projects', path: 'projects' }
	];
</script>

<svelte:head><title>Last Drop</title></svelte:head>

<main>
	<h2>{ui('current_focus', l)}</h2>
	<div class="grid">
		{#each data.focus as f (f.card.id)}
			<a class="card focus" href={href(f.card.id, l)}>
				{#if f.card.cover}<img class="cover" src={media(f.card.cover)} alt="" loading="lazy" />{/if}
				<div class="row"><span class="title"><T text={f.card.title} lang={l} /></span> <Status status={f.card.status} lang={l} /></div>
				{#if f.card.summary}<p class="small muted"><T text={f.card.summary} lang={l} /></p>{/if}
				{#if f.current}<p class="small"><span class="muted">{f.current.date}</span> <T text={f.current.title} lang={l} /></p>{/if}
				{#if f.next}<p class="small next">→ <T text={f.next.title} lang={l} /></p>{/if}
			</a>
		{:else}
			<p class="muted">—</p>
		{/each}
	</div>

	<div class="row between"><h2>{ui('ways', l)}</h2><span class="small muted caps">{ui('ways_note', l)}</span></div>
	<div class="grid">
		{#each ways as w}
			<a class="card way" href="/{l}/{w.path}/">
				<span class="title">{ui(w.key, l)}</span>
				<span class="small muted">{ui(`way.${w.key}` as UiKey, l)}</span>
				{#if w.key === 'manga' && v.latestChapter}<span class="small"><T text={v.latestChapter.title} lang={l} /> →</span>{/if}
			</a>
		{/each}
	</div>

	<div class="grid two">
		<section>
			<div class="row between"><h2>{ui('recent_activity', l)}</h2><a class="small muted" href="/{l}/activity/">{ui('all_activity', l)} →</a></div>
			<UpdateList items={v.recent} lang={l} />
		</section>
		<section>
			<h2>{ui('open_questions', l)}</h2>
			<ul class="plain">
				{#each v.questions as q (q.id)}
					<li><a href={href(q.project ?? q.id, l)}><span class="accent">?</span> <T text={q.title} lang={l} /></a></li>
				{/each}
			</ul>
		</section>
	</div>

	<h2>{ui('active_projects', l)}</h2>
	<ul class="plain">
		{#each v.projects as p (p.id)}<li><ProjectRow {p} lang={l} /></li>{/each}
	</ul>
</main>

<style>
	.row { display: flex; gap: 10px; align-items: baseline; }
	.between { justify-content: space-between; flex-wrap: wrap; }
	.caps { text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.7rem; }
	.card { text-decoration: none; display: grid; gap: 6px; align-content: start; }
	.card:hover { border-color: var(--accent); }
	.title { font: 1.3rem/1.2 var(--serif); }
	.focus p { margin: 0; }
	.cover { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 4px; margin-bottom: 4px; }
	.next { color: var(--accent); }
	.way { min-height: 140px; }
	.two { margin-top: 8px; }
	.accent { color: var(--accent); }
</style>
