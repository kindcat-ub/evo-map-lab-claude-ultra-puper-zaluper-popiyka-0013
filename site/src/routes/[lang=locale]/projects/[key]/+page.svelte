<script lang="ts">
	import { pick } from '$contracts';
	import { ui } from '$lib/i18n/ui';
	import { href } from '$lib/links';
	import { media } from '$lib/data';
	import T from '$lib/ui/T.svelte';
	import Status from '$lib/ui/Status.svelte';
	import UpdateList from '$lib/ui/UpdateList.svelte';

	let { data } = $props();
	const l = $derived(data.lang);
	const v = $derived(data.view);
	const p = $derived(v.project);
</script>

<svelte:head><title>{pick(p.title, l)?.text} · Last Drop</title></svelte:head>

<main>
	<p class="small muted"><code>{p.id}</code> · <Status status={v.status} lang={l} />{#if p.started} · {ui('started', l)} {p.started}{/if}{#if v.lastActivity} · {v.lastActivity}{/if}</p>
	<h1><T text={p.title} lang={l} /></h1>
	{#if p.summary}<p class="muted"><T text={p.summary} lang={l} /></p>{/if}

	{#if v.question}
		<h2>{ui('originating_question', l)}</h2>
		<p class="question"><T text={v.question.title} lang={l} /></p>
	{/if}

	<h2>{ui('current_state', l)}</h2>
	<UpdateList items={v.current} lang={l} showProject={false} />

	{#if v.openQuestions.length}
		<h2>{ui('open_questions', l)}</h2>
		<ul class="plain">{#each v.openQuestions as q (q.id)}<li><T text={q.title} lang={l} /></li>{/each}</ul>
	{/if}

	{#if v.research.length}
		<h2>{ui('research', l)}</h2>
		{#each v.research as r (r.id)}
			<section id={r.id} class="card">
				<p><b><T text={r.question} lang={l} /></b></p>
				{#if r.hypothesis}<p class="small"><T text={r.hypothesis} lang={l} /></p>{/if}
				{#if r.observations}<p class="small muted"><T text={r.observations} lang={l} /></p>{/if}
				{#if r.unknowns}<p class="small">{ui('unknowns', l)}: <T text={r.unknowns} lang={l} /></p>{/if}
			</section>
		{/each}
	{/if}

	{#if v.artifacts.length}
		<h2>{ui('artifacts', l)}</h2>
		<ul class="plain small">
			{#each v.artifacts as a (a.id)}<li id={a.id}><a href={media(a.ref)}>{#if a.title}<T text={a.title} lang={l} />{:else}{a.ref}{/if}</a></li>{/each}
		</ul>
	{/if}

	{#if v.links.length}
		<h2>{ui('links', l)}</h2>
		<ul class="plain small">
			{#each v.links as x}
				<li>
					<span class="muted">{x.direction === 'out' ? `${x.relation.type} →` : `← ${x.relation.type}`}</span>
					<a href={href(x.other, l)}><T text={x.other.title} lang={l} /></a>
					<code>{x.local}</code>
				</li>
			{/each}
		</ul>
	{/if}

	<h2>{ui('activity', l)}</h2>
	<UpdateList items={v.updates} lang={l} showProject={false} />
</main>

<style>
	.question { font: 1.25rem/1.4 var(--serif); }
	section.card { margin-bottom: 12px; }
	section.card p { margin: 4px 0; }
</style>
