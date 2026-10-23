import { env } from '$env/dynamic/public';
import { base } from '$app/paths';
import { mediaUrl, type MediaRef } from '$contracts';
import type { SiteApi } from './api';
import { httpApi } from './adapters/http';
import { snapshotApi } from './adapters/snapshot';
import { generate } from '$sim';

let sim: SiteApi | undefined;
const source = () => (env.PUBLIC_CONTENT_SOURCE || 'sim') as 'sim' | 'http';

/** Picks the adapter from PUBLIC_CONTENT_SOURCE (`sim` by default, or `http`). */
export function api(fetcher: typeof fetch = fetch): SiteApi {
	if (source() === 'http') {
		if (!env.PUBLIC_API_BASE) throw new Error('PUBLIC_API_BASE is required for PUBLIC_CONTENT_SOURCE=http');
		return httpApi(env.PUBLIC_API_BASE, { static: !!env.PUBLIC_API_STATIC, fetch: fetcher });
	}
	// The shared generator in-process; its media files come from `npm run sim` (same seed) under /sim.
	sim ??= snapshotApi(generate({ seed: env.PUBLIC_SIM_SEED || '42' }).snapshot);
	return sim;
}

/** MediaRef → address. Keys resolve against PUBLIC_MEDIA_BASE; URLs (data: included) pass through. */
export function media(ref: MediaRef): string {
	return /^(https?:|data:)/.test(ref) ? ref : mediaUrl(ref, env.PUBLIC_MEDIA_BASE || `${base}${source() === 'sim' ? '/sim' : '/media'}`);
}

export type { SiteApi } from './api';
