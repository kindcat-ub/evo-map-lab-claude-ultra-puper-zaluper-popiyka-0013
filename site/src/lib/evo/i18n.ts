import type { BranchStatus, Lang, LensKey, LensSection } from '$contracts';
import type { Zoom } from './layout';

/** Интерфейс карты. Тексты событий приходят из источника, не отсюда. */
const T = {
	map: ['Карта эволюции', 'Evolution map'],
	search: ['Где решили? Что отвергли?', 'Where was it decided? What was rejected?'],
	found: ['найдено', 'found'],
	spine: ['Позвоночник', 'Spine'],
	metro: ['Метро', 'Metro'],
	zoom: ['Семантический зум', 'Semantic zoom'],
	events: ['события', 'events'],
	directions: ['направления', 'directions'],
	live: ['живые', 'active'],
	open: ['открыто', 'open'],
	close: ['Закрыть', 'Close'],
	on_project: ['На странице проекта', 'On the project page'],
	born: ['Родилось из', 'Born from'],
	into: ['Влилось в', 'Merged into'],
	causes: ['Почему', 'Why'],
	effects: ['К чему привело', 'What it led to'],
	replaced: ['Заменило', 'Replaced'],
	replaced_by: ['Заменено', 'Replaced by'],
	answers: ['Отвечает на', 'Answers'],
	answered_by: ['Ответ', 'Answered by'],
	unlocks: ['Открыло путь', 'Unlocked'],
	unlocked_by: ['Путь открыло', 'Unlocked by'],
	related: ['Связано', 'Related'],
	evidence: ['Материалы', 'Evidence'],
	outside: ['извне', 'outside'],
	start: ['старт', 'start'],
	empty: ['Пусто.', 'Nothing here.'],
	main_line: ['основная линия', 'main line'],
	n_events: ['соб.', 'ev.'],
	unanswered: ['без ответа', 'unanswered'],
	unsolved: ['не решена', 'unsolved']
} satisfies Record<string, [string, string]>;

export type EvoKey = keyof typeof T;
const i = (l: Lang) => (l === 'ru' ? 0 : 1);
export const t = (k: EvoKey, l: Lang) => T[k][i(l)];

export const LENS: Record<LensKey, { name: [string, string]; title: [string, string]; note: [string, string] }> = {
	journey: {
		name: ['Путь', 'Journey'],
		title: ['Как продукт пришёл сюда?', 'How did the product get here?'],
		note: ['Состояния продукта и поворотные точки, где рождались и менялись направления.', 'Product states and the turning points where directions were born or changed.']
	},
	now: {
		name: ['Сейчас', 'Now'],
		title: ['Где проект сейчас?', 'Where is the project now?'],
		note: ['Достигнутое состояние, живые направления и открытые проблемы.', 'Reached state, active directions and open problems.']
	},
	why: {
		name: ['Почему', 'Why'],
		title: ['Почему продукт устроен так?', 'Why is the product built this way?'],
		note: ['Только решения, открытия, эксперименты и отвергнутые пути. Остальное приглушено.', 'Only decisions, discoveries, experiments and rejected paths. The rest is muted.']
	},
	next: {
		name: ['Дальше', 'Next'],
		title: ['Что осталось выяснить?', 'What is left to find out?'],
		note: ['Граница знания: открытые вопросы, проблемы и незавершённые направления.', 'The edge of knowledge: open questions, problems and unfinished directions.']
	}
};

const SECTION: Record<LensSection, [string, string]> = {
	states: ['Состояния', 'States'],
	turning: ['Поворотные точки', 'Turning points'],
	current: ['Текущее состояние', 'Current state'],
	active: ['Живые направления', 'Active directions'],
	problems: ['Проблемы', 'Problems'],
	decisions: ['Решения', 'Decisions'],
	discoveries: ['Открытия', 'Discoveries'],
	experiments: ['Эксперименты', 'Experiments'],
	rejected: ['Отвергнутые пути', 'Rejected paths'],
	questions: ['Открытые вопросы', 'Open questions'],
	unfinished: ['Незавершённые направления', 'Unfinished directions']
};
export const section = (k: LensSection, l: Lang) => SECTION[k][i(l)];

const STATUS: Record<BranchStatus, [string, string]> = {
	active: ['живо', 'active'],
	paused: ['пауза', 'paused'],
	merged: ['влито', 'merged'],
	done: ['закрыто', 'done'],
	dead: ['мёртво', 'dead']
};
export const status = (s: BranchStatus, l: Lang) => STATUS[s][i(l)];

const ZOOM: Record<Zoom, { name: [string, string]; note: [string, string] }> = {
	0: {
		name: ['Позвоночник', 'Spine'],
		note: ['Только качественные состояния продукта. Направления свёрнуты в точки рождения.', 'Only the qualitative states of the product. Directions fold into their birth points.']
	},
	1: {
		name: ['Направления', 'Branches'],
		note: ['Направления видны целиком: когда родились, чем кончились. Клик открывает.', 'Directions in full: when they were born and how they ended. Click to open.']
	},
	2: {
		name: ['События', 'Events'],
		note: ['Значимые события внутри направлений. Наведение показывает связи, клик открывает панель.', 'Significant events inside directions. Hover shows links, click opens the panel.']
	},
	3: {
		name: ['Детали', 'Detail'],
		note: ['Подписи раскрыты. Связи выбранного события нарисованы прямо на карте.', 'Labels expanded. Links of the selected event are drawn on the map.']
	}
};
export const zoomName = (z: Zoom, l: Lang) => ZOOM[z].name[i(l)];
export const zoomNote = (z: Zoom, l: Lang) => ZOOM[z].note[i(l)];
export const lensText = (k: LensKey, f: 'name' | 'title' | 'note', l: Lang) => LENS[k][f][i(l)];
