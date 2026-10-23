import { error } from '@sveltejs/kit';
import { api } from '$lib/data';

export const load = async ({ params, fetch }) => {
	const a = api(fetch);
	const [view, projects] = await Promise.all([a.evolution(params.key), a.projects()]);
	if (!view) error(404);
	return { view, key: params.key, projects };
};
