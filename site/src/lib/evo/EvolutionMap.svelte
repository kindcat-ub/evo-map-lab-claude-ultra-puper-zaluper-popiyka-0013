<script lang="ts">
	import { tick } from 'svelte';
	import { base } from '$app/paths';
	import {
		LENS_KEYS, pick, type Card, type EvoBranch, type EvoEvent, type EvolutionView, type Id, type Lang, type LensKey, type Relation
	} from '$contracts';
	import { href } from '$lib/links';
	import { ui } from '$lib/i18n/ui';
	import T from '$lib/ui/T.svelte';
	import Glyph from './Glyph.svelte';
	import { dateMs, layout, ZOOMS, type Mode, type Zoom } from './layout';
	import { lensText, section, status, t, zoomName, zoomNote } from './i18n';

	let { view, lang, projects }: { view: EvolutionView; lang: Lang; projects: { key: string; title: Card['title']; current: boolean }[] } = $props();

	let mode = $state<Mode>('spine');
	let zoom = $state<Zoom>(2);
	let lens = $state<LensKey>('now');
	let selected = $state<string | undefined>();
	let hovered = $state<string | undefined>();
	let query = $state('');
	let scroller = $state<HTMLDivElement>();
	let scrollX = $state(0);
	let viewW = $state(1000);

	const L = $derived(layout(view, mode, zoom));
	const ev = $derived(new Map(view.events.map((e) => [e.id as string, e])));
	const br = $derived(new Map(view.branches.map((b) => [b.id as string, b])));
	const out = $derived(new Map(view.outside.map((c) => [c.id as string, c])));

	const str = (x: { ru?: string; en?: string } | undefined) => pick(x, lang)?.text ?? '';
	const matches = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (q.length < 2) return undefined;
		const hit = (x: { ru?: string; en?: string } | undefined) => !!x && [x.ru, x.en].some((s) => s?.toLowerCase().includes(q));
		return new Set<string>([
			...view.events.filter((e) => hit(e.title) || hit(e.body)).map((e) => e.id),
			...view.branches.filter((b) => hit(b.title)).map((b) => b.id)
		]);
	});
	/** Что подсвечено: поиск сильнее линзы. */
	const focus = $derived(matches ?? new Set<string>(view.lenses[lens].focus));
	const lit = (id: string) => focus.has(id);
	const branchLit = (b: EvoBranch) => focus.has(b.id) || b.events.some((e) => focus.has(e));

	// Связи активного события, только те, что видны на карте.
	const active = $derived(selected ?? hovered);
	const activeLinks = $derived(
		active && ev.has(active) ? view.links.filter((r) => (r.from === active || r.to === active) && L.node.has(r.from) && L.node.has(r.to)) : []
	);
	const near = $derived(new Set(activeLinks.flatMap((r) => [r.from, r.to])));

	function select(id: string | undefined) {
		selected = id;
		if (!id) return;
		const n = L.node.get(id) ?? (L.branch.get(id) ? { x: L.branch.get(id)!.label.x } : undefined);
		if (n && scroller && (n.x < scrollX + 40 || n.x > scrollX + viewW - 40)) scroller.scrollTo({ left: n.x - viewW / 2, behavior: 'smooth' });
	}

	// Зум не теряет место: что было в центре, остаётся в центре.
	async function setZoom(z: Zoom) {
		if (z === zoom) return;
		const center = scrollX + viewW / 2;
		const near = L.cols.reduce((a, c, i) => (Math.abs(c.x - center) < Math.abs(L.cols[a].x - center) ? i : a), 0);
		zoom = z;
		await tick();
		scroller?.scrollTo({ left: (L.cols[near]?.x ?? 0) - viewW / 2 });
	}

	// Старт: в кадре текущее состояние.
	let started = false;
	$effect(() => {
		if (started || !scroller) return;
		started = true;
		scroller.scrollLeft = Math.max(0, L.spine.current - viewW * 0.6);
	});

	function wheel(e: WheelEvent) {
		if (!e.ctrlKey && !e.metaKey) return;
		e.preventDefault();
		const z = Math.max(0, Math.min(3, zoom + (e.deltaY < 0 ? 1 : -1))) as Zoom;
		setZoom(z);
	}

	// ---------- таймлайн: настоящее время, а не порядок ----------
	const span = $derived.by(() => {
		const ds = view.events.map((e) => dateMs(e.date));
		const a = Math.min(...ds), b = Math.max(...ds);
		return { a, b: b > a ? b : a + 1 };
	});
	const tx = (d: string) => ((dateMs(d) - span.a) / (span.b - span.a)) * 1000;
	const win = $derived.by(() => {
		const inView = L.cols.filter((c) => c.x >= scrollX && c.x <= scrollX + viewW);
		if (!inView.length) return { a: 0, b: 0 };
		return { a: tx(inView[0].date), b: tx(inView.at(-1)!.date) };
	});
	function seek(e: MouseEvent) {
		const r = (e.currentTarget as SVGElement).getBoundingClientRect();
		const ms = span.a + ((e.clientX - r.left) / r.width) * (span.b - span.a);
		const c = L.cols.reduce((a, c) => (Math.abs(dateMs(c.date) - ms) < Math.abs(dateMs(a.date) - ms) ? c : a), L.cols[0]);
		scroller?.scrollTo({ left: c.x - viewW / 2, behavior: 'smooth' });
	}

	// ---------- подписи ----------
	function wrap(s: string, n = 22): string[] {
		const words = s.split(/\s+/);
		const lines: string[] = [''];
		for (const w of words) {
			if ((lines.at(-1)! + ' ' + w).trim().length > n) {
				if (lines.length === 2) { lines[1] = lines[1].replace(/\s*\S*$/, '') + '…'; return lines; }
				lines.push(w);
			} else lines[lines.length - 1] = (lines.at(-1)! + ' ' + w).trim();
		}
		return lines;
	}
	const short = (s: string) => { const w = wrap(s, 18); return w[0] + (w.length > 1 && !w[0].endsWith('…') ? '…' : ''); };
	const counts = (b: EvoBranch) =>
		Object.entries(b.counts).map(([k, n]) => `${n} ${ui(`type.${k}` as never, lang)}`).join(' · ') || '—';
	const evCard = (e: EvoEvent): Card => ({ id: e.id, kind: 'update', title: e.title, project: view.project.id as Id<'project'> });

	const REL: Partial<Record<Relation['type'], [string, string]>> = {
		caused_by: ['causes', 'effects'], derived_from: ['causes', 'effects'], supersedes: ['replaced', 'replaced_by'],
		answers: ['answers', 'answered_by'], unlocks: ['unlocks', 'unlocked_by']
	};
	function groups(id: string) {
		const g = new Map<string, string[]>();
		for (const r of view.links) {
			if (r.from !== id && r.to !== id) continue;
			const outward = r.from === id;
			const pair = REL[r.type] ?? ['related', 'related'];
			const k = outward ? pair[0] : pair[1];
			const other = outward ? r.to : r.from;
			if (!ev.has(other) && !out.has(other) && !br.has(other)) continue;
			g.set(k, [...(g.get(k) ?? []), other]);
		}
		return [...g.entries()];
	}

	const openCount = $derived(view.events.filter((e) => e.open).length);
	const selEvent = $derived(selected ? ev.get(selected) : undefined);
	const selBranch = $derived(selected ? br.get(selected) : undefined);
	const lineName = (id: string | undefined) => (id ? str(br.get(id)?.title) : t('main_line', lang));
</script>

<div class="evo" style:--evo-h="calc(100dvh - 66px)">
	<div class="top">
		<span class="kicker">{t('map', lang)}</span>
		<nav class="chips" aria-label="projects">
			{#each projects as p}
				<a href="{base}/{lang}/evolution/{p.key}/" aria-current={p.current ? 'page' : undefined}><T text={p.title} {lang} /></a>
			{/each}
		</nav>
		<div class="seg" role="tablist" aria-label="lens">
			{#each LENS_KEYS as k}
				<button role="tab" aria-selected={lens === k && !matches} onclick={() => { lens = k; query = ''; selected = undefined; }}>{lensText(k, 'name', lang)}</button>
			{/each}
		</div>
		<span class="grow"></span>
		<label class="search">
			<input type="search" bind:value={query} placeholder={t('search', lang)} />
			{#if matches}<small>{matches.size} {t('found', lang)}</small>{/if}
		</label>
		<div class="seg">
			<button aria-pressed={mode === 'spine'} onclick={() => (mode = 'spine')}>{t('spine', lang)}</button>
			<button aria-pressed={mode === 'metro'} onclick={() => (mode = 'metro')}>{t('metro', lang)}</button>
		</div>
	</div>

	<div class="body">
		<div class="stage">
		<div class="corner">
			<small>{lensText(lens, 'name', lang)}</small>
			<span>{lensText(lens, 'title', lang)}</span>
		</div>
		<p class="level"><small>{zoom} — {zoomName(zoom, lang)}</small>{zoomNote(zoom, lang)}</p>
		<div class="canvas" bind:this={scroller} bind:clientWidth={viewW} onscroll={() => (scrollX = scroller!.scrollLeft)} onwheel={wheel}>
			<svg width={L.width} height={Math.max(L.height, 240)} role="img" aria-label={str(view.project.title)}>
				<g transform="translate(0 {Math.max(L.spineY, (240 - L.height) / 2 + L.spineY)})">
					<!-- основная линия: пройденное сплошным, будущее пунктиром -->
					<line x1={L.spine.x1} x2={L.spine.done} y1="0" y2="0" class="spine" />
					{#if view.status === 'active'}<line x1={L.spine.done} x2={L.spine.x2} y1="0" y2="0" class="spine future" />{/if}

					{#if zoom === 0}
						{#each L.branches as b}
							<circle cx={b.fold} cy="0" r="3" class="fold" class:dim={!branchLit(b.b)} />
						{/each}
					{:else}
						{#each L.branches as b (b.b.id)}
							{@const on = branchLit(b.b)}
							<g class="branch s-{b.b.status}" class:dim={!on} class:sel={selected === b.b.id}>
								<path d={b.path} class="bpath" />
								{#if b.tail}<line x1={b.tail.x1} x2={b.tail.x2} y1={b.y} y2={b.y} class="tail" />{/if}
								{#if b.end?.mark === 'dead'}<path d="M{b.end.x - 4} {b.y - 4} l8 8 m0 -8 l-8 8" class="endmark" />{/if}
								{#if b.end?.mark === 'paused'}<path d="M{b.end.x - 2} {b.y - 5} v10 m4 -10 v10" class="endmark" />{/if}
								{#if b.end?.mark === 'done'}<path d="M{b.end.x} {b.y - 5} v10" class="endmark" />{/if}
								<circle cx={b.birth.x} cy={b.birth.y} r="2.5" class="birth" />
								{#if mode === 'metro' && zoom === 1 && b.card}
									<g role="button" tabindex="0" class="card" onclick={() => select(b.b.id)} onkeydown={(e) => e.key === 'Enter' && select(b.b.id)}>
										<rect x={b.card.x} y={b.card.y} width={b.card.w} height={b.card.h} rx="3" />
										<text x={b.card.x + 8} y={b.card.y + 12} class="bname">{str(b.b.title)}</text>
										<text x={b.card.x + 8} y={b.card.y + 23} class="bcount">{counts(b.b)}</text>
									</g>
								{:else}
									<g role="button" tabindex="0" class="blabel" onclick={() => select(b.b.id)} onkeydown={(e) => e.key === 'Enter' && select(b.b.id)}>
										<text x={b.label.x} y={b.label.y - 9} class="bname">{str(b.b.title)}</text>
										<text x={b.label.x} y={b.label.y} class="bstatus">{status(b.b.status, lang)}</text>
									</g>
								{/if}
							</g>
						{/each}
					{/if}

					<!-- связи выбранного / наведённого события -->
					{#each activeLinks as r}
						{@const a = L.node.get(r.from)!}
						{@const z = L.node.get(r.to)!}
						{@const mx = (a.x + z.x) / 2}
						<path d="M{a.x} {a.y} C{mx} {a.y} {mx} {z.y} {z.x} {z.y}" class="link" />
						{#if zoom >= 2}<text x={mx} y={(a.y + z.y) / 2 - 4} class="ltype">{r.type}</text>{/if}
					{/each}

					{#each L.nodes as n (n.id)}
						{@const show = n.state || (zoom >= 2) || (zoom === 1 && !n.event.branch)}
						{#if show}
							{@const on = lit(n.id) || near.has(n.id) || selected === n.id}
							{@const cur = n.id === view.current}
							<g
								class="node"
								class:dim={!on && !(n.state && !matches)}
								class:sel={selected === n.id}
								transform="translate({n.x} {n.y})"
								role="button"
								tabindex="0"
								aria-label={str(n.event.title)}
								onclick={() => select(n.id)}
								onkeydown={(e) => e.key === 'Enter' && select(n.id)}
								onpointerenter={() => (hovered = n.id)}
								onpointerleave={() => (hovered = undefined)}
							>
								{#if n.state}
									<circle r={cur ? 9 : 7} class="state" class:cur />
									{#if cur}<circle r="14" class="halo" />{/if}
									{#if n.tier}<line y1="-12" y2={-12 - n.tier * 14} class="tier" />{/if}
									<text y={-18 - n.tier * 14} class="sname">{short(str(n.event.title)).toUpperCase()}</text>
									<text y={24 + n.tier * 11} class="sdate" class:cur>{n.event.date}</text>
								{:else if zoom >= 2 || !n.event.branch}
									<Glyph type={n.type} open={!!n.event.open} s={zoom >= 2 ? 1 : 0.7} />
								{/if}
								{#if !n.state && (zoom === 3 || (zoom === 2 && (hovered === n.id || selected === n.id)))}
									{@const lines = wrap(str(n.event.title))}
									<text x="10" y={-6 - (lines.length - 1) * 11} class="elabel">
										{#each lines as line, i}<tspan x="10" dy={i ? 11 : 0}>{line}</tspan>{/each}
									</text>
									<text x="10" y="11" class="edate">{n.event.date}</text>
								{/if}
							</g>
						{/if}
					{/each}
				</g>
			</svg>
		</div>
		</div>

		<aside class="panel">
			{#if selEvent}
				<button class="x" onclick={() => (selected = undefined)} aria-label={t('close', lang)}>×</button>
				<p class="kicker"><span class="kind"><svg width="14" height="14" viewBox="-7 -7 14 14"><Glyph type={selEvent.type} open={!!selEvent.open} s={0.9} /></svg> {ui(`type.${selEvent.type}`, lang)}</span> · {selEvent.date}</p>
				<h2><T text={selEvent.title} {lang} /></h2>
				<p class="muted small">{lineName(selEvent.branch)}{#if selEvent.open} · <b class="warn">{selEvent.type === 'problem' ? t('unsolved', lang) : t('unanswered', lang)}</b>{/if}</p>
				{#if selEvent.body}<p class="bodytext"><T text={selEvent.body} {lang} /></p>{/if}
				{#each groups(selEvent.id) as [k, ids]}
					<h3>{t(k as never, lang)}</h3>
					<ul>
						{#each ids as id}
							{@const e = ev.get(id)}
							{@const c = out.get(id)}
							{@const b = br.get(id)}
							<li>
								{#if e}<button class="item" onclick={() => select(id)}><span class="gl"><svg width="12" height="12" viewBox="-7 -7 14 14"><Glyph type={e.type} open={!!e.open} s={0.85} /></svg></span><T text={e.title} {lang} /></button>
								{:else if b}<button class="item" onclick={() => select(id)}><span class="gl">⟋</span><T text={b.title} {lang} /></button>
								{:else if c}<a class="item" href={href(c, lang)}><span class="gl">↗</span><T text={c.title} {lang} /> <small class="muted">{t('outside', lang)}</small></a>{/if}
							</li>
						{/each}
					</ul>
				{/each}
				{#if selEvent.evidence.length}
					<h3>{t('evidence', lang)}</h3>
					<ul>{#each selEvent.evidence as c}<li><a class="item" href={href(c, lang)}><span class="gl">{c.kind === 'research' ? '⚗' : '▣'}</span><T text={c.title} {lang} /></a></li>{/each}</ul>
				{/if}
				<p><a class="small" href={href(evCard(selEvent), lang)}>{t('on_project', lang)} →</a></p>
			{:else if selBranch}
				<button class="x" onclick={() => (selected = undefined)} aria-label={t('close', lang)}>×</button>
				<p class="kicker">{ui('type.branch', lang)} · {selBranch.date} · <span class="st s-{selBranch.status}">{status(selBranch.status, lang)}</span></p>
				<h2><T text={selBranch.title} {lang} /></h2>
				{#if selBranch.body}<p class="bodytext"><T text={selBranch.body} {lang} /></p>{/if}
				<p class="muted small">{counts(selBranch)}</p>
				<h3>{t('born', lang)}</h3>
				{#if selBranch.from && ev.get(selBranch.from)}
					{@const f = ev.get(selBranch.from)!}
					<button class="item" onclick={() => select(f.id)}><T text={f.title} {lang} /> <small class="muted">{lineName(f.branch)}</small></button>
				{:else}<p class="muted small">{t('start', lang)}</p>{/if}
				{#if selBranch.into && ev.get(selBranch.into)}
					<h3>{t('into', lang)}</h3>
					<button class="item" onclick={() => select(selBranch.into)}><T text={ev.get(selBranch.into)!.title} {lang} /></button>
				{/if}
				<h3>{t('events', lang)}</h3>
				<ul>
					{#each selBranch.events as id}
						{@const e = ev.get(id)!}
						<li><button class="item" onclick={() => select(id)}><span class="gl"><svg width="12" height="12" viewBox="-7 -7 14 14"><Glyph type={e.type} open={!!e.open} s={0.85} /></svg></span><T text={e.title} {lang} /> <small class="muted">{e.date}</small></button></li>
					{/each}
				</ul>
			{:else}
				<p class="kicker">overview</p>
				<h2>{lensText(lens, 'title', lang)}</h2>
				<p class="muted small">{lensText(lens, 'note', lang)}</p>
				{#each view.lenses[lens].sections as s}
					<h3>{section(s.key, lang)}</h3>
					{#if !s.items.length}<p class="muted small">{t('empty', lang)}</p>{/if}
					<ul>
						{#each s.items as id}
							{@const e = ev.get(id)}
							{@const b = br.get(id)}
							<li>
								{#if e}
									<button class="item" onclick={() => select(id)} onpointerenter={() => (hovered = id)} onpointerleave={() => (hovered = undefined)}>
										<span class="gl"><svg width="12" height="12" viewBox="-7 -7 14 14"><Glyph type={e.type} open={!!e.open} s={0.85} /></svg></span>
										<span class="t"><T text={e.title} {lang} /></span>
										<small class="muted">{s.key === 'current' || s.key === 'states' ? e.date : e.branch ? lineName(e.branch) : ''}</small>
									</button>
								{:else if b}
									<button class="item" onclick={() => select(id)}>
										<span class="gl">›</span><span class="t"><T text={b.title} {lang} /></span>
										<small class="muted">{s.key === 'unfinished' || s.key === 'rejected' ? status(b.status, lang) : `${b.events.length} ${t('n_events', lang)}`}</small>
									</button>
								{/if}
							</li>
						{/each}
					</ul>
				{/each}
			{/if}
		</aside>
	</div>

	<div class="bottom">
		<div class="zoom">
			<small>{t('zoom', lang)}</small>
			<div class="seg">
				{#each ZOOMS as z}<button aria-pressed={zoom === z} onclick={() => setZoom(z)}>{zoomName(z, lang)}</button>{/each}
			</div>
		</div>
		<svg class="timeline" viewBox="-10 0 1020 28" preserveAspectRatio="none" onclick={seek} role="presentation">
			<rect x={win.a - 6} width={Math.max(12, win.b - win.a + 12)} y="2" height="24" class="win" />
			{#each view.events as e}
				{#if e.type === 'milestone' && !e.branch}
					<ellipse cx={tx(e.date)} cy="14" rx="6" ry="3" class="tm" class:cur={e.id === view.current} />
				{:else}
					<line x1={tx(e.date)} x2={tx(e.date)} y1={e.type === 'note' ? 11 : 7} y2={e.type === 'note' ? 17 : 21} class="tk t-{e.type}" class:dim={!lit(e.id)} />
				{/if}
			{/each}
		</svg>
		<dl class="stats">
			<div><dt>{t('events', lang)}</dt><dd>{view.events.length}</dd></div>
			<div><dt>{t('directions', lang)}</dt><dd>{view.branches.length}</dd></div>
			<div><dt>{t('live', lang)}</dt><dd>{view.branches.filter((b) => b.status === 'active').length}</dd></div>
			<div><dt>{t('open', lang)}</dt><dd>{openCount}</dd></div>
		</dl>
	</div>
</div>

<style>
	/* Визуальный язык прототипа: ночной холст, один лавандовый акцент. Токены в одном месте. */
	.evo {
		--evo-bg: #13141f;
		--evo-panel: #171827;
		--evo-line: #2a2c42;
		--evo-fg: #e4e4ef;
		--evo-muted: #7f8199;
		--evo-dim: #4a4c63;
		--evo-accent: #9d94ff;
		--evo-warn: #f0a37e;
		display: grid;
		grid-template-rows: auto 1fr auto;
		height: var(--evo-h);
		min-height: 560px;
		background: var(--evo-bg);
		color: var(--evo-fg);
		font: 13px/1.45 system-ui, sans-serif;
	}
	button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; padding: 0; }
	.kicker { font-size: 0.68rem; letter-spacing: 0.16em; text-transform: uppercase; color: var(--evo-muted); margin: 0; }
	.muted { color: var(--evo-muted); }
	.small { font-size: 0.85em; }
	.warn { color: var(--evo-warn); }

	.top { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; padding: 10px 16px; border-bottom: 1px solid var(--evo-line); }
	.chips { display: flex; flex-wrap: wrap; gap: 4px; }
	.chips a { padding: 3px 9px; border: 1px solid var(--evo-line); border-radius: 3px; text-decoration: none; font-size: 0.8rem; color: var(--evo-muted); }
	.chips a[aria-current] { color: var(--evo-accent); border-color: var(--evo-accent); }
	.seg { display: inline-flex; border: 1px solid var(--evo-line); border-radius: 3px; }
	.seg button { padding: 4px 10px; font-size: 0.72rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--evo-muted); }
	.seg button + button { border-left: 1px solid var(--evo-line); }
	.seg button[aria-selected='true'], .seg button[aria-pressed='true'] { color: var(--evo-fg); box-shadow: inset 0 0 0 1px var(--evo-accent); }
	.grow { flex: 1; }
	.search { display: flex; align-items: center; gap: 8px; }
	.search input { width: min(320px, 60vw); background: var(--evo-panel); color: var(--evo-fg); border: 1px solid var(--evo-line); border-radius: 3px; padding: 5px 10px; font: inherit; }
	.search small { color: var(--evo-accent); white-space: nowrap; }

	.body { display: grid; grid-template-columns: 1fr 340px; min-height: 0; }
	.stage { position: relative; min-height: 0; display: grid; }
	.canvas { overflow: auto; min-height: 0; display: flex; align-items: safe center; }
	.canvas svg { display: block; flex: none; }
	.corner, .level { position: absolute; z-index: 1; pointer-events: none; margin: 0; color: var(--evo-muted); }
	.corner { right: 16px; top: 10px; text-align: right; }
	.corner small, .level small { display: block; font-size: 0.62rem; letter-spacing: 0.16em; text-transform: uppercase; }
	.corner span { font-size: 0.75rem; }
	.level { left: 16px; bottom: 12px; max-width: 340px; font-size: 0.75rem; }

	.spine { stroke: var(--evo-fg); stroke-width: 1.6; }
	.spine.future { stroke: var(--evo-dim); stroke-dasharray: 4 5; }
	.fold { fill: var(--evo-bg); stroke: var(--evo-accent); stroke-width: 1.2; }
	.bpath { fill: none; stroke: var(--evo-muted); stroke-width: 1.3; }
	.branch.s-active .bpath { stroke: #a9abc4; }
	.branch.s-dead .bpath { stroke-dasharray: 3 4; stroke: var(--evo-dim); }
	.branch.s-paused .bpath { stroke: var(--evo-dim); }
	.branch.sel .bpath { stroke: var(--evo-accent); stroke-width: 2; }
	.tail { stroke: var(--evo-dim); stroke-dasharray: 3 5; stroke-width: 1.3; }
	.endmark { stroke: var(--evo-muted); stroke-width: 1.6; fill: none; }
	.birth { fill: var(--evo-bg); stroke: var(--evo-accent); stroke-width: 1.2; }
	.bname { font-size: 11px; fill: var(--evo-fg); }
	.branch.s-dead .bname { text-decoration: line-through; fill: var(--evo-muted); }
	.bstatus { font-size: 8.5px; letter-spacing: 0.14em; text-transform: uppercase; fill: var(--evo-muted); }
	.bcount { font-size: 9px; fill: var(--evo-muted); }
	.card rect { fill: var(--evo-panel); stroke: var(--evo-line); }
	.card:hover rect, .branch.sel .card rect { stroke: var(--evo-accent); }
	.blabel, .card { cursor: pointer; }
	.dim { opacity: 0.28; }
	.link { fill: none; stroke: var(--evo-accent); stroke-width: 1.1; stroke-dasharray: 4 3; }
	.ltype { font-size: 8.5px; fill: var(--evo-accent); text-anchor: middle; }

	.node { cursor: pointer; outline: none; }
	.state { fill: var(--evo-fg); }
	.state.cur { fill: var(--evo-accent); }
	.halo { fill: none; stroke: var(--evo-accent); stroke-opacity: 0.35; stroke-width: 6; }
	.tier { stroke: var(--evo-dim); stroke-width: 1; }
	.sname { font-size: 10px; letter-spacing: 0.14em; text-anchor: middle; fill: var(--evo-fg); }
	.sdate { font-size: 9px; text-anchor: middle; fill: var(--evo-muted); }
	.sdate.cur { fill: var(--evo-accent); }
	.elabel { font-size: 10.5px; fill: var(--evo-fg); paint-order: stroke; stroke: var(--evo-bg); stroke-width: 3px; }
	.edate { font-size: 8.5px; fill: var(--evo-muted); }
	.node.sel :global(.hit), .node:focus-visible :global(.hit) { stroke: var(--evo-accent); stroke-width: 1.2; }

	.panel { position: relative; border-left: 1px solid var(--evo-line); background: var(--evo-panel); padding: 14px 18px 24px; overflow: auto; min-height: 0; }
	.panel h2 { font: 500 1.15rem/1.3 system-ui, sans-serif; margin: 6px 0 4px; letter-spacing: 0; text-transform: none; color: var(--evo-fg); }
	.panel h3 { font-size: 0.64rem; font-weight: 500; letter-spacing: 0.16em; text-transform: uppercase; color: var(--evo-muted); margin: 18px 0 6px; }
	.panel ul { list-style: none; margin: 0; padding: 0; }
	.panel li { margin: 0; }
	.item { display: flex; gap: 8px; align-items: baseline; width: 100%; text-align: left; padding: 4px 0; text-decoration: none; }
	.item:hover .t, .item:hover { color: var(--evo-accent); }
	.item .t { flex: 1; }
	.item small { flex: none; max-width: 40%; text-align: right; font-size: 0.72rem; }
	.gl { flex: none; width: 12px; color: var(--evo-muted); }
	.kind { display: inline-flex; align-items: center; gap: 4px; }
	.bodytext { color: #c9c9d8; }
	.x { position: absolute; right: 12px; top: 8px; font-size: 1.3rem; color: var(--evo-muted); }
	.st.s-active { color: var(--evo-accent); }

	.bottom { display: grid; grid-template-columns: auto 1fr auto; gap: 14px; align-items: center; padding: 8px 16px; border-top: 1px solid var(--evo-line); }
	.zoom small { display: block; font-size: 0.6rem; letter-spacing: 0.16em; text-transform: uppercase; color: var(--evo-muted); margin-bottom: 3px; }
	.timeline { width: 100%; height: 28px; cursor: pointer; }
	.win { fill: rgba(157, 148, 255, 0.08); stroke: var(--evo-accent); stroke-width: 1; vector-effect: non-scaling-stroke; }
	.tk { stroke: var(--evo-fg); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
	.tk.t-note { stroke: var(--evo-muted); }
	.tk.t-decision { stroke: var(--evo-accent); }
	.tk.t-problem { stroke: var(--evo-warn); }
	.tk.dim { opacity: 0.3; }
	.tm { fill: var(--evo-fg); }
	.tm.cur { fill: var(--evo-accent); }
	.stats { display: flex; gap: 14px; margin: 0; }
	.stats div { text-align: center; }
	.stats dd { margin: 0; font-size: 1rem; }
	.stats dt { font-size: 0.56rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--evo-muted); order: 2; }
	.stats div { display: flex; flex-direction: column-reverse; }

	@media (max-width: 900px) {
		.evo { height: auto; grid-template-rows: auto auto auto; }
		.body { grid-template-columns: 1fr; }
		.canvas { height: 62vh; }
		.panel { border-left: 0; border-top: 1px solid var(--evo-line); }
		.bottom { grid-template-columns: 1fr; }
		.stats { justify-content: space-between; }
		.corner { display: none; }
	}
</style>
