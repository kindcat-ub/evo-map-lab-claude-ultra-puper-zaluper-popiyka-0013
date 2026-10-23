import type { ActivityQuery, ApiError } from '$contracts';
import type { SiteApi } from '../api';

export class ApiFailure extends Error {
	constructor(
		readonly status: number,
		readonly body?: ApiError
	) {
		super(body?.message ?? `api ${status}`);
	}
}

/**
 * The contract HTTP API. `static: true` reads the exported files (`/home.json`, …),
 * where activity has only its first unfiltered page.
 */
export function httpApi(base: string, opts: { static?: boolean; fetch?: typeof fetch } = {}): SiteApi {
	const f = opts.fetch ?? fetch;
	const root = base.replace(/\/+$/, '');

	async function get<T>(path: string, query?: URLSearchParams): Promise<T | undefined> {
		const url = root + path + (opts.static ? '.json' : '') + (query?.size ? `?${query}` : '');
		const res = await f(url);
		if (res.status === 404) return undefined;
		if (!res.ok) throw new ApiFailure(res.status, await res.json().catch(() => undefined));
		return res.json() as Promise<T>;
	}
	async function must<T>(path: string, query?: URLSearchParams): Promise<T> {
		const v = await get<T>(path, query);
		if (v === undefined) throw new ApiFailure(404);
		return v;
	}
	const enc = encodeURIComponent;

	return {
		home: () => must('/home'),
		projects: () => must('/projects'),
		project: (key) => get(`/projects/${enc(key)}`),
		activity: (q: ActivityQuery = {}) => {
			if (opts.static) return must('/activity');
			const params = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
			return must('/activity', params);
		},
		chapters: () => must('/manga'),
		chapter: (key) => get(`/manga/${enc(key)}`),
		resolve: (id) => get(`/resolve/${id.split(':').map(enc).join('/')}`),
		graph: (scope) => must(scope ? `/graph/${enc(scope)}` : '/graph')
	};
}
