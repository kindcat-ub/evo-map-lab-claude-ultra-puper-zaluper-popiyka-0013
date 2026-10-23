import { api } from '$lib/data';
import type { UpdateItem } from '$contracts';

/** The whole feed, page by page via the contract cursor. A static export has only the first page. */
export const load = async ({ fetch }) => {
	const a = api(fetch);
	const items: UpdateItem[] = [];
	let before: string | undefined;
	for (let i = 0; i < 50; i++) {
		const page = await a.activity({ limit: 200, ...(before ? { before } : {}) });
		const fresh = page.items.filter((u) => !items.some((x) => x.id === u.id));
		items.push(...fresh);
		if (!page.next || !fresh.length) break;
		before = page.next;
	}
	return { items };
};
