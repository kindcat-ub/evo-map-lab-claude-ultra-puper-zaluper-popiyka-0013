import { error } from '@sveltejs/kit';
import { api } from '$lib/data';

export const load = async ({ params, fetch }) => {
	const view = await api(fetch).chapter(params.chapter);
	const page = Number(params.page ?? 1);
	if (!view || page > view.chapter.pages.length) error(404);
	return { view, page };
};
