import { describe, expect, it } from 'vitest';
import { evolution, keyOf, publicView } from '$contracts';
import { generate } from '$sim';
import { layout, ZOOMS } from './layout';

const pub = publicView(generate({ seed: 42 }).snapshot);
const views = pub.entities.filter((e) => e.id.startsWith('project:')).map((p) => evolution(pub, p.id as `project:${string}`)!);

describe('layout is a pure function of the projection', () => {
	it.each(['spine', 'metro'] as const)('%s: every event placed, directions never run left of their birth', (mode) => {
		for (const v of views)
			for (const z of ZOOMS) {
				const L = layout(v, mode, z);
				expect(L.nodes.length, keyOf(v.project.id)).toBe(v.events.length);
				for (const n of L.nodes) expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true);
				for (const b of L.branches) {
					for (const id of b.b.events) expect(L.node.get(id)!.x).toBeGreaterThanOrEqual(b.birth.x);
					expect(b.y).not.toBe(0);
				}
				// Spine mode: two directions on one lane never overlap.
				if (mode === 'spine') {
					const lanes = Map.groupBy(L.branches, (b) => b.y);
					for (const group of lanes.values()) {
						const spans = group.map((b) => [b.birth.x, b.tail?.x2 ?? b.end?.x ?? L.node.get(b.b.events.at(-1) ?? '')?.x ?? b.birth.x]).sort((a, c) => a[0] - c[0]);
						for (let i = 1; i < spans.length; i++) expect(spans[i][0]).toBeGreaterThan(spans[i - 1][1]);
					}
				}
			}
	});

	it('the source carries no geometry: same view, any mode', () => {
		const v = views[0];
		const before = JSON.stringify(v);
		layout(v, 'spine', 3);
		layout(v, 'metro', 0);
		expect(JSON.stringify(v)).toBe(before);
	});
});
