// Источник данных Last Drop: единственная модель, которую читают все проекции.
// Здесь только данные. Никакой геометрии, раскладки, зума и вычисленного «текущего».

/** Виды объектов источника. ID всегда `kind:key`. */
export type Kind = 'project' | 'update' | 'research' | 'artifact' | 'chapter';
export const KINDS: readonly Kind[] = ['project', 'update', 'research', 'artifact', 'chapter'];

/** `kind:key`, key = [a-z0-9][a-z0-9.-]*, языконезависим и не меняется. */
export type Id<K extends Kind = Kind> = `${K}:${string}`;

/** Внешний адрес: https://… или http://… */
export type Url = `http://${string}` | `https://${string}`;

/**
 * Медиа как есть: ключ в файловом хранилище (`media/vasya5123.jpg`) или внешний URL.
 * Формат не перечисляется, проекция смотрит на mime или расширение.
 */
export type MediaRef = string;

export type Lang = 'ru' | 'en';

/** Один текст на двух равноправных языках. Нужен хотя бы один. Markdown допустим. */
export type Text = { ru?: string; en?: string };

/**
 * Дата с честной точностью: `2026`, `2026-09`, `2026-09-07` или полный ISO 8601 с временем.
 * Сравнивается как строка, поэтому `2026-09` идёт раньше `2026-09-07`.
 */
export type PartialDate = string;

/** draft не виден ни одной публичной проекции. Ревью и приватность — вне системы. */
export type Visibility = 'draft' | 'published';

interface Base<K extends Kind> {
  id: Id<K>;
  visibility: Visibility;
}

export interface Project extends Base<'project'> {
  title: Text;
  summary?: Text;
  /** Зачем существует, длинное описание. */
  body?: Text;
  started?: PartialDate;
  /** Исходный вопрос: Update с type = question. */
  question?: Id<'update'>;
  tags?: string[];
  // Статуса и current_state тут нет намеренно: они вычисляются из Update.
}

/**
 * milestone — качественное состояние проекта (веха на позвоночнике карты).
 * branch — открыто направление работы; title = имя направления, точка рождения = связь derived_from.
 * problem — то, что мешает; открыта, пока на неё не ведёт answers.
 */
export type UpdateType =
  | 'note' | 'question' | 'decision' | 'discovery' | 'deadend' | 'milestone'
  | 'branch' | 'problem' | 'experiment';
export const UPDATE_TYPES: readonly UpdateType[] = [
  'note', 'question', 'decision', 'discovery', 'deadend', 'milestone', 'branch', 'problem', 'experiment',
];

export type ProjectStatus = 'active' | 'paused' | 'done' | 'dropped';
export const PROJECT_STATUSES: readonly ProjectStatus[] = ['active', 'paused', 'done', 'dropped'];

/**
 * Любое значимое событие. Без project — событие жизни.
 * Прошлое не переписывается: исправление — новый Update + связь supersedes.
 */
export interface Update extends Base<'update'> {
  date: PartialDate;
  project?: Id<'project'>;
  type: UpdateType;
  /**
   * Направление, в котором случилось событие: id Update с type branch того же проекта.
   * Нет поля — событие на основной линии проекта.
   */
  branch?: Id<'update'>;
  /**
   * Статус после этого события. Последний по дате задаёт текущий.
   * У branch и у событий с полем branch это статус направления, иначе — проекта.
   */
  status?: ProjectStatus;
  title: Text;
  body?: Text;
}

export interface Research extends Base<'research'> {
  project?: Id<'project'>;
  date?: PartialDate;
  question: Text;
  hypothesis?: Text;
  experiment?: Text;
  observations?: Text;
  conclusion?: Text;
  unknowns?: Text;
}

/** Медиа, документ, репозиторий, трек — что угодно с адресом. Типа нет. */
export interface Artifact extends Base<'artifact'> {
  ref: MediaRef;
  title?: Text;
  /** Если известен. Не перечень, а подсказка рендеру. */
  mime?: string;
  project?: Id<'project'>;
  research?: Id<'research'>;
  date?: PartialDate;
}

/** Хотспот: иконка и куда ведёт. Своего типа нет, смысл задаёт цель. */
export interface Hotspot {
  /** Имя иконки из набора интерфейса либо MediaRef картинки. */
  icon: string;
  target: Id | Url;
}

/** Доли страницы 0..1. Это геометрия самого рисунка, а не раскладка проекции. */
export interface Region { x: number; y: number; w: number; h: number }

export interface Panel {
  region?: Region;
  /** Если кадр отдельной картинкой, а не областью страницы. */
  image?: MediaRef;
  /** Анимация кадра по тапу. */
  animation?: MediaRef;
  /** Текст кадра (реплики, подпись) на двух языках, если он не нарисован в картинке. */
  text?: Text;
  hotspots?: Hotspot[];
}

export interface Page {
  image?: MediaRef;
  panels: Panel[];
}

/** Глава манги: страницы и кадры вложены, своих ID у них нет (адрес: chapter + индексы). */
export interface Chapter extends Base<'chapter'> {
  number: number;
  title: Text;
  summary?: Text;
  date?: PartialDate;
  pages: Page[];
}

export type Entity = Project | Update | Research | Artifact | Chapter;

export type EntityOf<K extends Kind> =
  K extends 'project' ? Project :
  K extends 'update' ? Update :
  K extends 'research' ? Research :
  K extends 'artifact' ? Artifact :
  K extends 'chapter' ? Chapter : never;

/**
 * Словарь связей из Engine spec (4.3) без belongs_to (это поле project)
 * плюс answers (закрывает вопрос) и relates_to (просто «связано»).
 */
export type RelationType =
  | 'caused_by' | 'derived_from' | 'depends_on' | 'blocks' | 'supports' | 'contradicts'
  | 'refines' | 'supersedes' | 'unlocks' | 'implements' | 'answers' | 'relates_to';
export const RELATION_TYPES: readonly RelationType[] = [
  'caused_by', 'derived_from', 'depends_on', 'blocks', 'supports', 'contradicts',
  'refines', 'supersedes', 'unlocks', 'implements', 'answers', 'relates_to',
];

/** Связь id → id + тип, в том числе между проектами. Идентичность = (from, type, to). */
export interface Relation {
  from: Id;
  type: RelationType;
  to: Id;
  note?: Text;
}

/** Весь источник целиком на одной ревизии. Личный сайт, объём маленький. */
export interface Snapshot {
  schema: 1;
  revision: number;
  entities: Entity[];
  relations: Relation[];
}

export const SCHEMA_VERSION = 1 as const;

const ID_RE = /^(project|update|research|artifact|chapter):[a-z0-9][a-z0-9.-]*$/;

export function isId(s: unknown): s is Id {
  return typeof s === 'string' && ID_RE.test(s);
}

export function isUrl(s: unknown): s is Url {
  return typeof s === 'string' && /^https?:\/\/[^\s]+$/.test(s);
}

export function kindOf(id: Id): Kind {
  return id.slice(0, id.indexOf(':')) as Kind;
}

export function keyOf(id: Id): string {
  return id.slice(id.indexOf(':') + 1);
}

export function is<K extends Kind>(e: Entity, kind: K): e is EntityOf<K> {
  return kindOf(e.id) === kind;
}

export function relationKey(r: Pick<Relation, 'from' | 'type' | 'to'>): string {
  return `${r.from} ${r.type} ${r.to}`;
}
