<script lang="ts">
	import { goto } from '$app/navigation';
	import { pick } from '$contracts';
	import { media } from '$lib/data';
	import { ui } from '$lib/i18n/ui';
	import { hotspotHref, href, icon } from '$lib/links';
	import T from '$lib/ui/T.svelte';

	let { data } = $props();
	const l = $derived(data.lang);
	const v = $derived(data.view);
	const c = $derived(v.chapter);
	const pg = $derived(c.pages[data.page - 1]);
	const base = $derived(href(c.id, l));

	// Reading position lives in the URL: direct links and Back return to the same page.
	const prev = $derived(data.page > 1 ? `${base}${data.page - 1}/` : v.prev ? href(v.prev, l) : undefined);
	const next = $derived(data.page < c.pages.length ? `${base}${data.page + 1}/` : v.next ? href(v.next, l) : undefined);

	// Tapping a panel plays its animation (or a pulse); navigation lives only on hotspot icons.
	let playing = $state<number | undefined>();
	$effect(() => {
		data.page;
		playing = undefined;
	});

	function key(e: KeyboardEvent) {
		if (e.key === 'ArrowRight' && next) goto(next);
		if (e.key === 'ArrowLeft' && prev) goto(prev);
	}
	const isVideo = (ref: string) => /\.(mp4|webm)$/i.test(ref);
</script>

<svelte:window onkeydown={key} />
<svelte:head><title>{pick(c.title, l)?.text} · {data.page} · Last Drop</title></svelte:head>

<main class="reader">
	<p class="small muted">
		<a href="/{l}/manga/">{ui('manga', l)}</a> · <T text={c.title} lang={l} /> · {ui('page', l)} {data.page}/{c.pages.length}
	</p>
	{#if data.page === 1 && c.summary}<p class="small muted"><T text={c.summary} lang={l} /></p>{/if}

	<div class="page">
		{#if pg.image}<img class="art" src={media(pg.image)} alt="" />{/if}
		{#each pg.panels as p, i (`${data.page}-${i}`)}
			{@const r = p.region ?? { x: 0, y: 0, w: 1, h: 1 }}
			<div class="panel" style:left="{r.x * 100}%" style:top="{r.y * 100}%" style:width="{r.w * 100}%" style:height="{r.h * 100}%">
				{#if p.image}<img class="art" src={media(p.image)} alt="" />{/if}
				<button class="frame" class:playing={playing === i} aria-label="{ui('page', l)} {data.page}, {i + 1}" onclick={() => (playing = playing === i ? undefined : i)}>
					{#if playing === i && p.animation}
						{#if isVideo(p.animation)}<video src={media(p.animation)} autoplay muted playsinline></video>{:else}<img src={media(p.animation)} alt="" />{/if}
					{/if}
				</button>
				{#if p.hotspots.length}
					<!-- Hotspots carry no position: they sit as a strip on the panel. -->
					<div class="strip">
						{#each p.hotspots as h}
							{@const to = hotspotHref(h, l)}
							{@const ic = icon(h.icon)}
							{#if to}
								<a class="hotspot" href={to.href} title={h.card ? pick(h.card.title, l)?.text : h.target} target={to.external ? '_blank' : undefined} rel={to.external ? 'noopener' : undefined}>
									{#if 'src' in ic}<img src={ic.src} alt="" />{:else}{ic.glyph}{/if}
								</a>
							{/if}
						{/each}
					</div>
				{/if}
			</div>
		{/each}
	</div>

	<!-- Text layer: the panels' lines in the chosen language, readable without the art. -->
	{#if pg.panels.some((p) => p.text)}
		<ol class="text small">
			{#each pg.panels as p}{#if p.text}<li><T text={p.text} lang={l} /></li>{/if}{/each}
		</ol>
	{/if}

	<nav class="pager">
		{#if prev}<a href={prev} rel="prev">← {ui('prev', l)}</a>{:else}<span></span>{/if}
		{#if next}<a href={next} rel="next">{ui('next', l)} →</a>{/if}
	</nav>
</main>

<style>
	.reader { max-width: 680px; }
	.page { position: relative; aspect-ratio: 2 / 3; background: #f3ede1; }
	.art { position: absolute; inset: 0; width: 100%; height: 100%; display: block; object-fit: cover; }
	.panel { position: absolute; }
	.frame { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; padding: 0; background: transparent; cursor: pointer; overflow: hidden; }
	.frame :is(img, video) { width: 100%; height: 100%; object-fit: cover; }
	.frame:focus-visible { outline: 3px solid var(--accent); }
	.frame.playing { animation: pulse 700ms ease-out; box-shadow: inset 0 0 0 3px var(--accent); }
	@keyframes pulse { 30% { transform: scale(1.03); } }
	@media (prefers-reduced-motion: reduce) { .frame.playing { animation: none; } }
	.strip { position: absolute; right: 6px; bottom: 6px; display: flex; gap: 6px; z-index: 1; }
	.hotspot {
		display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%;
		background: #121110; color: #f3ede1; border: 1px solid var(--accent);
		text-decoration: none; font-size: 0.95rem; box-shadow: 0 1px 4px rgb(0 0 0 / 0.4);
	}
	.hotspot img { width: 20px; height: 20px; object-fit: contain; }
	.text { padding-left: 20px; color: var(--muted); }
	.pager { display: flex; justify-content: space-between; padding-top: 16px; }
</style>
