<script lang="ts">
	import type { Lang, ProjectStatus } from '$contracts';
	import { ui } from '$lib/i18n/ui';

	let { status, lang }: { status: ProjectStatus; lang: Lang } = $props();
</script>

<span class="status {status}">{ui(`status.${status}`, lang)}</span>

<style>
	.status { font-size: 0.75rem; padding: 1px 6px; border: 1px solid var(--line); border-radius: 3px; color: var(--muted); white-space: nowrap; }
	.active { color: var(--accent); border-color: var(--accent); }
</style>
