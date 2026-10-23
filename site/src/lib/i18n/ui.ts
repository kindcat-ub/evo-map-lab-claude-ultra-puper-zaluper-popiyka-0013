import type { Lang } from '$contracts';

export const LANGS: readonly Lang[] = ['ru', 'en'];

/** Interface chrome only. Content text comes from the source, never from here. */
const UI = {
	projects: ['Проекты', 'Projects'],
	activity: ['Активность', 'Activity'],
	evolution: ['Эволюция', 'Evolution'],
	manga: ['Манга', 'Manga'],
	principles: ['Принципы', 'Principles'],
	about: ['О сайте', 'About'],
	current_focus: ['Сейчас в фокусе', 'Current focus'],
	active_projects: ['Активные проекты', 'Active projects'],
	recent_activity: ['Последние события', 'Recent activity'],
	current_questions: ['Открытые вопросы', 'Current questions'],
	originating_question: ['Исходный вопрос', 'Originating question'],
	current_state: ['Текущее состояние', 'Current state'],
	research: ['Исследования', 'Research'],
	unknowns: ['Неизвестно', 'Unknown'],
	links: ['Связи', 'Links'],
	in_manga: ['В манге', 'In the manga'],
	started: ['Начат', 'Started'],
	page: ['Страница', 'Page'],
	prev: ['Назад', 'Previous'],
	next: ['Дальше', 'Next'],
	not_published: ['Ещё не опубликовано.', 'Not published yet.'],
	release: ['Выпуск', 'Release'],
	'status.active': ['идёт', 'active'],
	'status.paused': ['на паузе', 'paused'],
	'status.done': ['завершён', 'done'],
	'status.dropped': ['брошен', 'dropped'],
	'type.note': ['заметка', 'note'],
	'type.question': ['вопрос', 'question'],
	'type.decision': ['решение', 'decision'],
	'type.discovery': ['открытие', 'discovery'],
	'type.deadend': ['тупик', 'dead end'],
	'type.milestone': ['веха', 'milestone'],
	'type.branch': ['направление', 'direction'],
	'type.problem': ['проблема', 'problem'],
	'type.experiment': ['эксперимент', 'experiment'],
	artifacts: ['Артефакты', 'Artifacts'],
	latest_chapter: ['Свежая глава', 'Latest chapter'],
	more: ['Ещё', 'More'],
	pages: ['стр.', 'pp.'],
	open: ['открыт', 'open'],
	ways: ['Три способа посмотреть', 'Three ways to look'],
	ways_note: ['Одна история, разные грани', 'One story, different sides'],
	'way.manga': ['История в картинках: быт, юмор, провалы и победы.', 'The story in pictures: daily life, humour, failures and wins.'],
	'way.evolution': ['Как система пришла к текущему состоянию: ветки, решения, тупики.', 'How the system got here: branches, decisions, dead ends.'],
	'way.projects': ['Что существует: статусы, вопросы, материалы.', 'What exists: status, questions, materials.'],
	all_activity: ['Вся активность', 'All activity'],
	read: ['Читать', 'Read'],
	open_questions: ['Открытые вопросы', 'Open questions']
} satisfies Record<string, [string, string]>;

export type UiKey = keyof typeof UI;

export function ui(key: UiKey, lang: Lang): string {
	return UI[key][lang === 'ru' ? 0 : 1];
}
