import { api } from '$lib/data';

export const load = async ({ fetch }) => {
	const a = api(fetch);
	const view = await a.home();
	// "Next step" of a focused project = its latest open question (computed by the contract projection).
	const focus = await Promise.all(
		view.focus.map(async (p) => {
			const pv = await a.project(p.id.slice('project:'.length));
			return { card: p, next: pv?.openQuestions[0], current: pv?.current[0] };
		})
	);
	return { view, focus };
};
