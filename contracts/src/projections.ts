// Проекции: чистые функции Snapshot → то, что нужно конкретному экрану.
// Только чтение. «Текущее» (статус, открытые вопросы, последняя активность) вычисляется здесь
// и никуда не записывается.

import {
  type Artifact, type Chapter, type Entity, type Hotspot, type Id, type Kind, type Lang, type MediaRef,
  type PartialDate, type Project, type ProjectStatus, type Relation, type Research, type Snapshot,
  type Text, type Update, type UpdateType, type Url, is, isId, kindOf,
} from './model.ts';

// ---------- Выходные формы ----------

/** Короткая карточка любого объекта: превью цели хотспота, узел графа, ссылка. */
export interface Card {
  id: Id;
  kind: Kind;
  title: Text;
  summary?: Text;
  date?: PartialDate;
  /** Только для update. */
  type?: UpdateType;
  /** Для project — вычисленный статус. */
  status?: ProjectStatus;
  project?: Id<'project'>;
  /** Для artifact — адрес медиа. */
  ref?: MediaRef;
  mime?: string;
}

export interface UpdateItem extends Update {
  projectTitle?: Text;
  /** Только у question: нет ни одного answers. */
  open?: boolean;
}

export interface ProjectCard {
  id: Id<'project'>;
  title: Text;
  summary?: Text;
  tags?: string[];
  started?: PartialDate;
  status: ProjectStatus;
  lastActivity?: PartialDate;
  openQuestions: number;
  /** Самое свежее изображение среди artifact проекта (mime image/*). Вычисляется. */
  cover?: MediaRef;
}

export interface ChapterCard {
  id: Id<'chapter'>;
  number: number;
  title: Text;
  summary?: Text;
  date?: PartialDate;
  pages: number;
  cover?: MediaRef;
}

export interface HomeView {
  revision: number;
  /** Активные проекты с самой свежей активностью. */
  focus: ProjectCard[];
  projects: ProjectCard[];
  recent: UpdateItem[];
  questions: UpdateItem[];
  latestChapter?: ChapterCard;
}

export interface LinkItem {
  relation: Relation;
  direction: 'out' | 'in';
  /** Объект проекта, к которому привязана связь (сам проект или его update/research/artifact). */
  local: Id;
  other: Card;
}

export interface ProjectView {
  revision: number;
  project: Project;
  status: ProjectStatus;
  lastActivity?: PartialDate;
  question?: UpdateItem;
  /** Последние события: это и есть current state. */
  current: UpdateItem[];
  openQuestions: UpdateItem[];
  updates: UpdateItem[];
  research: Research[];
  artifacts: Artifact[];
  /** Связи наружу: другие проекты, события жизни. */
  links: LinkItem[];
  /** Где проект или его объекты появляются в манге: хотспоты, которые на них указывают. */
  manga: MangaMention[];
}

export interface MangaMention {
  chapter: Id<'chapter'>;
  number: number;
  title: Text;
  /** Индексы с нуля. */
  page: number;
  panel: number;
  /** На что указывает хотспот: сам проект или его update/research/artifact. */
  target: Id;
  icon: string;
}

export interface ActivityQuery {
  project?: Id<'project'>;
  type?: UpdateType;
  /** Курсор из next предыдущей страницы. */
  before?: string;
  limit?: number;
}

export interface ActivityView {
  revision: number;
  items: UpdateItem[];
  next?: string;
}

export interface ResolvedHotspot extends Hotspot {
  /** Есть, если target — видимый объект источника. Для URL отсутствует. */
  card?: Card;
}

export interface ChapterView {
  revision: number;
  chapter: Omit<Chapter, 'pages'> & {
    pages: { image?: MediaRef; panels: (Omit<Chapter['pages'][number]['panels'][number], 'hotspots'> & { hotspots: ResolvedHotspot[] })[] }[];
  };
  prev?: Id<'chapter'>;
  next?: Id<'chapter'>;
}

/** Вход для Evolution Map: смысл без геометрии. Раскладка — дело карты. */
export interface GraphView {
  revision: number;
  scope?: Id<'project'>;
  nodes: Card[];
  edges: Relation[];
}

// ---------- Публичный срез ----------

/**
 * Оставить только то, что видно посетителю: published и владелец тоже виден.
 * Связи и хотспоты на скрытое выбрасываются. Все проекции строятся поверх этого.
 */
export function publicView(s: Snapshot): Snapshot {
  const all = new Map<string, Entity>(s.entities.map((e) => [e.id, e] as const));
  const memo = new Map<string, boolean>();
  const visible = (id: string): boolean => {
    if (memo.has(id)) return memo.get(id)!;
    memo.set(id, false);
    const e = all.get(id) as Record<string, any> | undefined;
    const ok = !!e && e.visibility === 'published'
      && (e.project === undefined || visible(e.project))
      && (e.research === undefined || visible(e.research));
    memo.set(id, ok);
    return ok;
  };
  const entities: Entity[] = [];
  for (const e of s.entities) {
    if (!visible(e.id)) continue;
    if (is(e, 'project') && e.question && !visible(e.question)) {
      const { question: _, ...rest } = e;
      entities.push(rest as Project);
    } else if (is(e, 'chapter')) {
      entities.push({
        ...e,
        pages: e.pages.map((p) => ({
          ...p,
          panels: p.panels.map((c) => c.hotspots ? { ...c, hotspots: c.hotspots.filter((h) => !isId(h.target) || visible(h.target)) } : c),
        })),
      });
    } else entities.push(e);
  }
  const relations = s.relations.filter((r) => visible(r.from) && visible(r.to));
  return { schema: s.schema, revision: s.revision, entities, relations };
}

// ---------- Вспомогательное ----------

class Index {
  readonly byId: Map<string, Entity>;
  readonly projects: Project[];
  readonly updates: Update[];
  readonly research: Research[];
  readonly artifacts: Artifact[];
  readonly chapters: Chapter[];
  readonly answered: Set<string>;
  readonly s: Snapshot;
  constructor(s: Snapshot) {
    this.s = s;
    this.byId = new Map(s.entities.map((e) => [e.id, e] as const));
    const of = <K extends Kind>(k: K) => s.entities.filter((e) => kindOf(e.id) === k) as any[];
    this.projects = of('project');
    this.updates = (of('update') as Update[]).sort(newestFirst);
    this.research = of('research');
    this.artifacts = of('artifact');
    this.chapters = (of('chapter') as Chapter[]).sort((a, b) => a.number - b.number || a.id.localeCompare(b.id));
    this.answered = new Set(s.relations.filter((r) => r.type === 'answers').map((r) => r.to));
  }
  item(u: Update): UpdateItem {
    const p = u.project ? this.byId.get(u.project) as Project | undefined : undefined;
    const it: UpdateItem = { ...u };
    if (p) it.projectTitle = p.title;
    if (u.type === 'question') it.open = !this.answered.has(u.id);
    return it;
  }
  status(p: Id<'project'>): ProjectStatus {
    return this.updates.find((u) => u.project === p && u.status)?.status ?? 'active';
  }
  lastActivity(p: Id<'project'>): PartialDate | undefined {
    return this.updates.find((u) => u.project === p)?.date;
  }
  openQuestions(p?: Id<'project'>): UpdateItem[] {
    return this.updates.filter((u) => u.type === 'question' && !this.answered.has(u.id) && (p === undefined || u.project === p)).map((u) => this.item(u));
  }
  projectCard(p: Project): ProjectCard {
    const c: ProjectCard = { id: p.id, title: p.title, status: this.status(p.id), openQuestions: this.openQuestions(p.id).length };
    if (p.summary) c.summary = p.summary;
    if (p.tags) c.tags = p.tags;
    if (p.started) c.started = p.started;
    const last = this.lastActivity(p.id);
    if (last) c.lastActivity = last;
    const cover = this.artifacts.filter((a) => a.project === p.id && a.mime?.startsWith('image/')).sort(newestFirst)[0];
    if (cover) c.cover = cover.ref;
    return c;
  }
  card(e: Entity): Card {
    const c: Card = { id: e.id, kind: kindOf(e.id), title: titleOf(e) };
    const o = e as Record<string, any>;
    if (o.summary) c.summary = o.summary;
    if (o.date) c.date = o.date;
    else if (o.started) c.date = o.started;
    if (o.project) c.project = o.project;
    if (is(e, 'update')) c.type = e.type;
    if (is(e, 'project')) c.status = this.status(e.id);
    if (is(e, 'artifact')) { c.ref = e.ref; if (e.mime) c.mime = e.mime; }
    return c;
  }
}

function titleOf(e: Entity): Text {
  if (is(e, 'research')) return e.question;
  if (is(e, 'artifact')) return e.title ?? { en: e.ref.split('/').pop() || e.ref };
  return (e as Project).title;
}

function newestFirst(a: { date?: string; id: string }, b: { date?: string; id: string }): number {
  const ad = a.date ?? '', bd = b.date ?? '';
  return ad < bd ? 1 : ad > bd ? -1 : b.id.localeCompare(a.id);
}

function byActivity(a: ProjectCard, b: ProjectCard): number {
  const ad = a.lastActivity ?? a.started ?? '', bd = b.lastActivity ?? b.started ?? '';
  return ad < bd ? 1 : ad > bd ? -1 : a.id.localeCompare(b.id);
}

function chapterCard(c: Chapter): ChapterCard {
  const card: ChapterCard = { id: c.id, number: c.number, title: c.title, pages: c.pages.length };
  if (c.date) card.date = c.date;
  if (c.summary) card.summary = c.summary;
  const cover = c.pages[0]?.image ?? c.pages[0]?.panels[0]?.image;
  if (cover) card.cover = cover;
  return card;
}

// ---------- Проекции ----------
// Все принимают уже публичный срез (publicView) или полный — для режима автора.

export function home(s: Snapshot, opts: { focus?: number; recent?: number } = {}): HomeView {
  const ix = new Index(s);
  const projects = ix.projects.map((p) => ix.projectCard(p)).filter((p) => p.status === 'active' || p.status === 'paused').sort(byActivity);
  const view: HomeView = {
    revision: s.revision,
    focus: projects.filter((p) => p.status === 'active').slice(0, opts.focus ?? 3),
    projects,
    recent: ix.updates.slice(0, opts.recent ?? 10).map((u) => ix.item(u)),
    questions: ix.openQuestions(),
  };
  const last = ix.chapters.at(-1);
  if (last) view.latestChapter = chapterCard(last);
  return view;
}

export function projectList(s: Snapshot): ProjectCard[] {
  const ix = new Index(s);
  return ix.projects.map((p) => ix.projectCard(p)).sort(byActivity);
}

export function project(s: Snapshot, id: Id<'project'>, opts: { current?: number } = {}): ProjectView | undefined {
  const ix = new Index(s);
  const p = ix.byId.get(id);
  if (!p || !is(p, 'project')) return undefined;
  const own = (e: Entity) => (e as Record<string, any>).project === id;
  const updates = ix.updates.filter(own).map((u) => ix.item(u));
  const local = new Set<string>([id, ...s.entities.filter(own).map((e) => e.id)]);
  const links: LinkItem[] = [];
  for (const r of s.relations) {
    const outLocal = local.has(r.from), inLocal = local.has(r.to);
    if (outLocal === inLocal) continue;
    const other = ix.byId.get(outLocal ? r.to : r.from);
    if (!other) continue;
    links.push({ relation: r, direction: outLocal ? 'out' : 'in', local: outLocal ? r.from : r.to, other: ix.card(other) });
  }
  const view: ProjectView = {
    revision: s.revision,
    project: p,
    status: ix.status(id),
    current: updates.slice(0, opts.current ?? 5),
    openQuestions: ix.openQuestions(id),
    updates,
    research: ix.research.filter(own).sort(newestFirst),
    artifacts: ix.artifacts.filter(own).sort(newestFirst),
    links,
    manga: [],
  };
  for (const c of ix.chapters) c.pages.forEach((pg, pi) => pg.panels.forEach((x, xi) => (x.hotspots ?? []).forEach((h) => {
    if (isId(h.target) && local.has(h.target)) {
      view.manga.push({ chapter: c.id, number: c.number, title: c.title, page: pi, panel: xi, target: h.target, icon: h.icon });
    }
  })));
  const last = ix.lastActivity(id);
  if (last) view.lastActivity = last;
  const q = p.question ? ix.byId.get(p.question) : undefined;
  if (q && is(q, 'update')) view.question = ix.item(q);
  return view;
}

export function activity(s: Snapshot, q: ActivityQuery = {}): ActivityView {
  const ix = new Index(s);
  const limit = Math.max(1, Math.min(q.limit ?? 30, 200));
  let list = ix.updates.filter((u) => (!q.project || u.project === q.project) && (!q.type || u.type === q.type));
  if (q.before) {
    const [date, id] = splitCursor(q.before);
    list = list.filter((u) => newestFirst({ date, id }, u) < 0);
  }
  const page = list.slice(0, limit);
  const view: ActivityView = { revision: s.revision, items: page.map((u) => ix.item(u)) };
  if (list.length > limit) { const l = page.at(-1)!; view.next = `${l.date}|${l.id}`; }
  return view;
}

function splitCursor(c: string): [string, string] {
  const i = c.indexOf('|');
  return i < 0 ? [c, ''] : [c.slice(0, i), c.slice(i + 1)];
}

export function chapterList(s: Snapshot): ChapterCard[] {
  return new Index(s).chapters.map(chapterCard);
}

export function chapter(s: Snapshot, id: Id<'chapter'>): ChapterView | undefined {
  const ix = new Index(s);
  const i = ix.chapters.findIndex((c) => c.id === id);
  if (i < 0) return undefined;
  const c = ix.chapters[i];
  const resolve = (h: Hotspot): ResolvedHotspot => {
    const e = isId(h.target) ? ix.byId.get(h.target) : undefined;
    return e ? { ...h, card: ix.card(e) } : { ...h };
  };
  const view: ChapterView = {
    revision: s.revision,
    chapter: { ...c, pages: c.pages.map((p) => ({ ...p, panels: p.panels.map((x) => ({ ...x, hotspots: (x.hotspots ?? []).map(resolve) })) })) },
  };
  if (i > 0) view.prev = ix.chapters[i - 1].id;
  if (i < ix.chapters.length - 1) view.next = ix.chapters[i + 1].id;
  return view;
}

export function resolve(s: Snapshot, id: Id): Card | undefined {
  const ix = new Index(s);
  const e = ix.byId.get(id);
  return e ? ix.card(e) : undefined;
}

export function graph(s: Snapshot, scope?: Id<'project'>): GraphView {
  const ix = new Index(s);
  let ids: Set<string>;
  if (scope) {
    ids = new Set([scope, ...s.entities.filter((e) => (e as Record<string, any>).project === scope).map((e) => e.id)]);
    for (const r of s.relations) {
      if (ids.has(r.from)) ids.add(r.to);
      else if (ids.has(r.to)) ids.add(r.from);
    }
  } else ids = new Set(ix.byId.keys());
  const view: GraphView = {
    revision: s.revision,
    nodes: s.entities.filter((e) => ids.has(e.id)).map((e) => ix.card(e)),
    edges: s.relations.filter((r) => ids.has(r.from) && ids.has(r.to)),
  };
  if (scope) view.scope = scope;
  return view;
}

// ---------- Для фронта ----------

/** Текст на нужном языке; если его нет — на другом, с честной пометкой. */
export function pick(t: Text | undefined, lang: Lang): { text: string; lang: Lang } | undefined {
  if (!t) return undefined;
  const other: Lang = lang === 'ru' ? 'en' : 'ru';
  if (t[lang]?.trim()) return { text: t[lang]!, lang };
  if (t[other]?.trim()) return { text: t[other]!, lang: other };
  return undefined;
}

/** Относительный ключ → URL по базе медиа. Внешний URL отдаётся как есть. */
export function mediaUrl(ref: MediaRef, base: string): string | Url {
  if (/^https?:\/\//.test(ref)) return ref;
  return base.replace(/\/+$/, '') + '/' + ref.replace(/^\/+/, '');
}
