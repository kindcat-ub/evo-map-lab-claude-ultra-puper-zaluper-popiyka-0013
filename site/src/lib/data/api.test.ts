import { describe, expect, it } from 'vitest';
import { keyOf, type Id } from '$contracts';
import { readRoute } from '../../../../contracts/src/server.ts';
import { publicView } from '$contracts';
import { generate } from '$sim';
import { snapshotApi } from './adapters/snapshot';
import { httpApi } from './adapters/http';
import type { SiteApi } from './api';

const snapshot = generate({ seed: 42 }).snapshot;

/** HTTP adapter against the contract's own router, no network: same paths the server and the static export serve. */
function viaHttp(staticMode: boolean): SiteApi {
	const pub = publicView(snapshot);
	const fakeFetch = (async (input: string) => {
		const url = new URL(input);
		const path = url.pathname.replace(/^\/api\/v1/, '').replace(/\.json$/, '');
		const r = readRoute(pub, path, url.searchParams);
		return new Response(JSON.stringify(r.body), { status: r.status });
	}) as typeof fetch;
	return httpApi('https://content.invalid/api/v1', { static: staticMode, fetch: fakeFetch });
}

describe('one source, every projection', () => {
	const api = snapshotApi(snapshot);

	it('home, project, activity, manga and graph agree about the same objects', async () => {
		const home = await api.home();
		const all = await api.activity({ limit: 200 });
		const graph = await api.graph();
		const ids = new Set(graph.nodes.map((n) => n.id));

		for (const u of home.recent) expect(all.items.map((x) => x.id)).toContain(u.id);
		for (const p of home.focus) {
			const view = await api.project(keyOf(p.id));
			expect(view?.status).toBe(p.status);
			expect(view?.lastActivity).toBe(p.lastActivity);
		}
		// Every hotspot on an object resolves to a node that the map also sees.
		for (const c of await api.chapters()) {
			const view = (await api.chapter(keyOf(c.id)))!;
			for (const h of view.chapter.pages.flatMap((p) => p.panels.flatMap((x) => x.hotspots)))
				if (h.card) expect(ids.has(h.card.id), h.card.id).toBe(true);
				else expect(h.target).toMatch(/^https?:\/\//);
		}
	});

	it('drafts never reach a projection', async () => {
		const drafts = snapshot.entities.filter((e) => e.visibility === 'draft').map((e) => e.id);
		expect(drafts.length).toBeGreaterThan(0);
		const nodes = new Set((await api.graph()).nodes.map((n) => n.id));
		for (const d of drafts) expect(nodes.has(d as Id)).toBe(false);
	});
});

describe('storage is swappable', () => {
	const local = snapshotApi(snapshot);
	it.each([false, true])('http (static=%s) yields the same views as in-process', async (staticMode) => {
		const remote = viaHttp(staticMode);
		expect(await remote.home()).toEqual(await local.home());
		expect(await remote.projects()).toEqual(await local.projects());
		const key = keyOf((await local.projects())[0].id);
		expect(await remote.project(key)).toEqual(await local.project(key));
		const ch = keyOf((await local.chapters())[0].id);
		expect(await remote.chapter(ch)).toEqual(await local.chapter(ch));
		expect(await remote.project('no-such-project')).toBeUndefined();
	});
});
