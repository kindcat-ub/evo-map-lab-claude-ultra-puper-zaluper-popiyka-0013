import { isUrl, keyOf, kindOf, type Card, type Id, type Lang } from '$contracts';
import { media } from '$lib/data';

/** The one place that maps ids to routes. Pages never build object URLs themselves. */
export function href(target: Card | Id, lang: Lang): string {
	const id = typeof target === 'string' ? target : target.id;
	const card = typeof target === 'string' ? undefined : target;
	const key = keyOf(id);
	switch (kindOf(id)) {
		case 'project':
			return `/${lang}/projects/${key}/`;
		case 'chapter':
			return `/${lang}/manga/${key}/`;
		case 'update':
		case 'research':
			// Lives on its project's page; a life event (no project) lives in the activity feed.
			return card?.project ? `/${lang}/projects/${keyOf(card.project)}/#${id}` : `/${lang}/activity/#${id}`;
		case 'artifact':
			return card?.ref ? media(card.ref) : `/${lang}/activity/`;
	}
}

/** Hotspot target: a resolved card, or an external URL. */
export function hotspotHref(h: { target: string; card?: Card }, lang: Lang): { href: string; external: boolean } | undefined {
	if (h.card) {
		const to = href(h.card, lang);
		return { href: to, external: isUrl(to) };
	}
	return isUrl(h.target) ? { href: h.target, external: true } : undefined;
}

/** Icon names the generator uses. The contract does not fix the set, so unknown names get a fallback. */
const ICONS: Record<string, string> = {
	question: '?',
	decision: '◆',
	deadend: '⊘',
	project: '◎',
	music: '♪',
	link: '↗',
	doc: '≡',
	image: '▣'
};

export function icon(name: string): { glyph: string } | { src: string } {
	if (ICONS[name]) return { glyph: ICONS[name] };
	if (/[./]/.test(name)) return { src: media(name) };
	return { glyph: '•' };
}
