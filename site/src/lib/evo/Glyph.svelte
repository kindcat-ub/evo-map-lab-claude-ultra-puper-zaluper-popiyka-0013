<script lang="ts">
	import type { UpdateType } from '$contracts';

	// Один знак на вид события. Рисуется вокруг (0,0), позицию задаёт родитель через transform.
	let { type, s = 1, open = false }: { type: UpdateType; s?: number; open?: boolean } = $props();
</script>

<g class="g-{type}" class:open transform="scale({s})">
	{#if type === 'decision'}
		<path d="M0 -5.5 L5.5 0 L0 5.5 L-5.5 0Z" class="fill" />
	{:else if type === 'discovery'}
		<path d="M0 -6 L1.6 -1.6 L6 0 L1.6 1.6 L0 6 L-1.6 1.6 L-6 0 L-1.6 -1.6Z" class="fill" />
	{:else if type === 'question'}
		<circle r="6" class="ring" /><text y="3">?</text>
	{:else if type === 'problem'}
		<circle r="6" class="ring warn" /><text y="3" class="warn">!</text>
	{:else if type === 'deadend'}
		<path d="M-4 -4 L4 4 M4 -4 L-4 4" class="stroke" />
	{:else if type === 'experiment'}
		<path d="M0 -5.5 L5 4 L-5 4Z" class="ring" />
	{:else if type === 'milestone'}
		<circle r="4.5" class="fill" />
	{:else}
		<circle r="2.6" class="dot" />
	{/if}
	<!-- Невидимая площадка, чтобы попадать по мелким знакам пальцем. -->
	<circle r="11" class="hit" />
</g>

<style>
	.fill { fill: var(--evo-fg); }
	.g-decision .fill { fill: var(--evo-accent); }
	.ring { fill: var(--evo-bg); stroke: var(--evo-fg); stroke-width: 1.3; }
	.stroke { stroke: var(--evo-muted); stroke-width: 1.8; stroke-linecap: round; }
	.dot { fill: var(--evo-muted); }
	text { font: 700 8px/1 system-ui, sans-serif; text-anchor: middle; fill: var(--evo-fg); }
	.warn { stroke: var(--evo-warn); fill: var(--evo-warn); }
	circle.warn { fill: var(--evo-bg); }
	.open .ring { stroke-dasharray: none; }
	.g-question:not(.open) .ring, .g-problem:not(.open) .ring { stroke: var(--evo-muted); }
	.g-question:not(.open) text, .g-problem:not(.open) text { fill: var(--evo-muted); stroke: none; }
	.hit { fill: transparent; }
</style>
