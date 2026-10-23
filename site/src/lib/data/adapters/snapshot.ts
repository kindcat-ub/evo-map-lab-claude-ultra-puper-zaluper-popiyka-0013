import {
	activity, chapter, chapterList, graph, home, project, projectList, publicView, resolve,
	type Id, type Snapshot
} from '$contracts';
import type { SiteApi } from '../api';

/** In-process: the contract projections over a Snapshot, behind the same interface as HTTP. */
export function snapshotApi(source: Snapshot): SiteApi {
	const pub = publicView(source);
	return {
		home: async () => home(pub),
		projects: async () => projectList(pub),
		project: async (key) => project(pub, `project:${key}`),
		activity: async (q) => activity(pub, q),
		chapters: async () => chapterList(pub),
		chapter: async (key) => chapter(pub, `chapter:${key}`),
		resolve: async (id: Id) => resolve(pub, id),
		graph: async (scope) => graph(pub, scope ? `project:${scope}` : undefined)
	};
}
