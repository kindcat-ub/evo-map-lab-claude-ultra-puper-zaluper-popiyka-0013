import { error } from '@sveltejs/kit';
import { api } from '$lib/data';

export const load = async ({ params, fetch }) => {
	const view = await api(fetch).project(params.key);
	if (!view) error(404);
	return { view };
};
