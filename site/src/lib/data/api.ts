import type {
	ActivityQuery, ActivityView, Card, ChapterCard, ChapterView, EvolutionView, GraphView, HomeView, Id, ProjectCard, ProjectView
} from '$contracts';

/**
 * The site's only door to data: the read side of the contract API (ReadRoutes).
 * Keys are the part of an id after the colon. Nothing here knows about storage;
 * nothing here writes.
 */
export interface SiteApi {
	home(): Promise<HomeView>;
	projects(): Promise<ProjectCard[]>;
	project(key: string): Promise<ProjectView | undefined>;
	activity(q?: ActivityQuery): Promise<ActivityView>;
	chapters(): Promise<ChapterCard[]>;
	chapter(key: string): Promise<ChapterView | undefined>;
	resolve(id: Id): Promise<Card | undefined>;
	graph(scope?: string): Promise<GraphView>;
	evolution(key: string): Promise<EvolutionView | undefined>;
}
