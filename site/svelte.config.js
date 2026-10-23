import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({ fallback: '404.html' }),
		prerender: { handleHttpError: 'fail' },
		// Contracts are consumed as source: types, projections, API paths. No build step, no copy.
		alias: { $contracts: '../contracts/src/index.ts', $sim: '../sim/src/generate.ts' }
	}
};
