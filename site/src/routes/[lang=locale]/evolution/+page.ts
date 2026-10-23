import { error } from '@sveltejs/kit';
import { api } from '$lib/data';

// Без ключа карта открывается на самом свежем живом проекте.
export const load = async ({ fetch }) => {
	const a = api(fetch);
	const projects = await a.projects();
	const first = projects.find((p) => p.status === 'active') ?? projects[0];
	if (!first) error(404);
	const key = first.id.slice('project:'.length);
	const view = await a.evolution(key);
	if (!view) error(404);
	return { view, key, projects };
};
