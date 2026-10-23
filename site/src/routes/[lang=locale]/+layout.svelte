<script lang="ts">
	import { page } from '$app/state';
	import { LANGS, ui, type UiKey } from '$lib/i18n/ui';

	let { data, children } = $props();
	const sections: UiKey[] = ['projects', 'activity', 'evolution', 'manga', 'about'];
	// Same object, other representation: only the language segment changes.
	const swap = (l: string) => page.url.pathname.replace(/^\/[^/]+/, `/${l}`) + page.url.hash;
</script>

<header>
	<a class="brand" href="/{data.lang}/">LAST DROP<span class="dot"></span></a>
	<nav>
		{#each sections as s}
			<a href="/{data.lang}/{s}/" aria-current={page.url.pathname.startsWith(`/${data.lang}/${s}/`) ? 'page' : undefined}>{ui(s, data.lang)}</a>
		{/each}
	</nav>
	<span class="lang">
		{#each LANGS as l}
			{#if l === data.lang}<b>{l}</b>{:else}<a href={swap(l)} hreflang={l}>{l}</a>{/if}
		{/each}
	</span>
</header>

{@render children()}

<style>
	header { display: flex; flex-wrap: wrap; gap: 8px 28px; align-items: baseline; max-width: 1040px; margin: 0 auto; padding: 20px 16px; border-bottom: 1px solid var(--line); }
	.brand { font-weight: 600; letter-spacing: 0.3em; text-decoration: none; }
	.dot { display: inline-block; width: 7px; height: 7px; margin-left: 6px; border-radius: 50%; background: var(--accent); }
	nav { display: flex; flex-wrap: wrap; gap: 4px 18px; flex: 1; }
	nav a { text-decoration: none; color: var(--muted); }
	nav a[aria-current] { color: var(--fg); box-shadow: 0 2px 0 var(--accent); }
	.lang { display: flex; gap: 10px; text-transform: uppercase; font-size: 0.8rem; color: var(--muted); }
	.lang b { color: var(--fg); }
</style>
