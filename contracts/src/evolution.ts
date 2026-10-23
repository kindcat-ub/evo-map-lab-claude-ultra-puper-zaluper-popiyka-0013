// Evolution Map: причинная проекция одного проекта. Смысл без геометрии.
// Позвоночник, направления, их статусы и линзы вычисляются здесь из Update и связей.
// Координат, раскладки и «текущего по оси» в ответе нет: это дело рендера.

import {
  type Id, type PartialDate, type ProjectStatus, type Relation, type Snapshot, type Text, type Update, type UpdateType,
  is, kindOf,
} from './model.ts';
import { type Card, resolve, project as projectView } from './projections.ts';

/** merged — закрыто и влилось в веху основной линии, done — закрыто без вехи, dead — брошено. */
export type BranchStatus = 'active' | 'paused' | 'merged' | 'done' | 'dead';

export interface EvoEvent {
  id: Id<'update'>;
  date: PartialDate;
  type: UpdateType;
  title: Text;
  body?: Text;
  /** Направление; нет — основная линия. */
  branch?: Id<'update'>;
  /** Только у question и problem. */
  open?: boolean;
  /** Связанные artifact и research: чем событие подкреплено. */
  evidence: Card[];
}

export interface EvoBranch {
  /** id корневого Update с type branch. */
  id: Id<'update'>;
  title: Text;
  body?: Text;
  date: PartialDate;
  status: BranchStatus;
  /** Точка рождения: событие основной линии или другого направления. Нет — от старта проекта. */
  from?: Id<'update'>;
  /** Веха основной линии, в которую влилось. Только у merged. */
  into?: Id<'update'>;
  /** События направления в хронологии, без корня. */
  events: Id<'update'>[];
  last: PartialDate;
  counts: Partial<Record<UpdateType, number>>;
}

export type LensKey = 'journey' | 'now' | 'why' | 'next';
export const LENS_KEYS: readonly LensKey[] = ['journey', 'now', 'why', 'next'];

export type LensSection =
  | 'states' | 'turning' | 'current' | 'active' | 'problems'
  | 'decisions' | 'discoveries' | 'experiments' | 'rejected' | 'questions' | 'unfinished';

export interface Lens {
  /** Секции правой панели: id событий или направлений. */
  sections: { key: LensSection; items: Id<'update'>[] }[];
  /** Что линза подсвечивает на карте, остальное приглушается. */
  focus: Id<'update'>[];
}

export interface EvolutionView {
  revision: number;
  project: Card;
  status: ProjectStatus;
  /** Вехи основной линии (type milestone без branch) по порядку: качественные состояния продукта. */
  states: Id<'update'>[];
  /** Последняя достигнутая веха. */
  current?: Id<'update'>;
  /** Все события проекта по дате, кроме корней направлений. */
  events: EvoEvent[];
  branches: EvoBranch[];
  /** Связи, у которых хотя бы один конец — событие проекта. */
  links: Relation[];
  /** Объекты вне проекта, на которые ведут links: события жизни, другие проекты. */
  outside: Card[];
  lenses: Record<LensKey, Lens>;
}

const chrono = (a: { date: string; id: string }, b: { date: string; id: string }) =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : a.id.localeCompare(b.id);

/** Принимает публичный срез (или полный — для режима автора). */
export function evolution(s: Snapshot, id: Id<'project'>): EvolutionView | undefined {
  const pv = projectView(s, id);
  if (!pv) return undefined;
  const card = resolve(s, id)!;
  const own = (s.entities.filter((e) => is(e, 'update') && e.project === id) as Update[]).sort(chrono);
  const byId = new Map(own.map((u) => [u.id as string, u]));
  const answered = new Set(s.relations.filter((r) => r.type === 'answers').map((r) => r.to));
  const links = s.relations.filter((r) => byId.has(r.from) || byId.has(r.to));
  const roots = own.filter((u) => u.type === 'branch');
  const events = own.filter((u) => u.type !== 'branch');
  const lineOf = (u: Update) => u.branch;

  // Чем подкреплено событие: artifact / research по связи в любую сторону.
  const evidence = new Map<string, Card[]>();
  for (const r of links) {
    const [ev, other] = byId.has(r.from) ? [r.from, r.to] : [r.to, r.from];
    const k = kindOf(other as Id);
    if (k !== 'artifact' && k !== 'research') continue;
    const c = resolve(s, other);
    if (c) evidence.set(ev, [...(evidence.get(ev) ?? []), c]);
  }

  const evs: EvoEvent[] = events.map((u) => {
    const e: EvoEvent = { id: u.id, date: u.date, type: u.type, title: u.title, evidence: evidence.get(u.id) ?? [] };
    if (u.body) e.body = u.body;
    if (u.branch) e.branch = u.branch;
    if (u.type === 'question' || u.type === 'problem') e.open = !answered.has(u.id);
    return e;
  });

  const states = events.filter((u) => u.type === 'milestone' && !u.branch);
  const touching = (a: string, b: string) => links.some((r) => (r.from === a && r.to === b) || (r.from === b && r.to === a));

  const branches: EvoBranch[] = roots.map((root) => {
    const mine = events.filter((u) => lineOf(u) === root.id);
    const all = [root, ...mine];
    const last = mine.at(-1)?.date ?? root.date;
    const explicit = all.filter((u) => u.status).at(-1)?.status;
    const counts: Partial<Record<UpdateType, number>> = {};
    for (const u of mine) counts[u.type] = (counts[u.type] ?? 0) + 1;
    let status: BranchStatus =
      explicit === 'dropped' ? 'dead'
      : explicit === 'paused' ? 'paused'
      : explicit === 'done' ? 'done'
      : mine.at(-1)?.type === 'deadend' ? 'dead' : 'active';
    const b: EvoBranch = { id: root.id, title: root.title, date: root.date, status, events: mine.map((u) => u.id), last, counts };
    if (root.body) b.body = root.body;
    const from = links.find((r) => r.from === root.id && r.type === 'derived_from' && byId.has(r.to) && r.to !== root.id)?.to;
    if (from) b.from = from as Id<'update'>;
    if (status === 'done') {
      const into = states.find((m) => m.date >= last && all.some((u) => touching(m.id, u.id)));
      if (into) { b.status = 'merged'; b.into = into.id; }
    }
    return b;
  });

  const outsideIds = new Set<string>();
  for (const r of links) for (const x of [r.from, r.to]) if (!byId.has(x) && kindOf(x as Id) !== 'artifact' && kindOf(x as Id) !== 'research') outsideIds.add(x);
  outsideIds.delete(id);
  const outside = [...outsideIds].map((x) => resolve(s, x as Id)).filter((c): c is Card => !!c);

  // ---------- линзы ----------
  const ids = (us: { id: Id<'update'> }[]) => us.map((u) => u.id);
  const ofType = (t: UpdateType) => evs.filter((e) => e.type === t);
  const current = states.at(-1)?.id;
  const openProblems = ofType('problem').filter((e) => e.open);
  const openQuestions = ofType('question').filter((e) => e.open);
  const active = branches.filter((b) => b.status === 'active');
  const unfinished = branches.filter((b) => b.status === 'active' || b.status === 'paused');
  const dead = branches.filter((b) => b.status === 'dead');
  const supersedes = new Set(links.filter((r) => r.type === 'supersedes').map((r) => r.from));
  const unlocks = new Set(links.filter((r) => r.type === 'unlocks').flatMap((r) => [r.from, r.to]));
  const births = new Set(branches.map((b) => b.from).filter(Boolean) as string[]);
  const turning = evs.filter((e) => e.type !== 'milestone' && (births.has(e.id) || supersedes.has(e.id) || unlocks.has(e.id)));
  const rejected = [...ofType('deadend').map((e) => e.id), ...dead.map((b) => b.id)];
  const withBranch = (bs: EvoBranch[]) => bs.flatMap((b) => [b.id, ...b.events]);
  const uniq = (xs: Id<'update'>[]) => [...new Set(xs)];

  const lenses: Record<LensKey, Lens> = {
    journey: {
      sections: [{ key: 'states', items: ids(states) }, { key: 'turning', items: ids(turning) }],
      focus: uniq([...ids(states), ...ids(turning)]),
    },
    now: {
      sections: [
        { key: 'current', items: current ? [current] : [] },
        { key: 'active', items: ids(active) },
        { key: 'problems', items: ids(openProblems) },
      ],
      focus: uniq([...(current ? [current] : []), ...withBranch(active), ...ids(openProblems)]),
    },
    why: {
      sections: [
        { key: 'decisions', items: ids(ofType('decision')) },
        { key: 'discoveries', items: ids(ofType('discovery')) },
        { key: 'experiments', items: ids(ofType('experiment')) },
        { key: 'rejected', items: rejected },
      ],
      focus: uniq([...ids(ofType('decision')), ...ids(ofType('discovery')), ...ids(ofType('experiment')), ...rejected]),
    },
    next: {
      sections: [
        { key: 'questions', items: ids(openQuestions) },
        { key: 'problems', items: ids(openProblems) },
        { key: 'unfinished', items: ids(unfinished) },
      ],
      focus: uniq([...ids(openQuestions), ...ids(openProblems), ...unfinished.map((b) => b.id), ...unfinished.map((b) => b.events.at(-1) ?? b.id)]),
    },
  };

  const view: EvolutionView = {
    revision: s.revision, project: card, status: pv.status,
    states: ids(states), events: evs, branches, links, outside, lenses,
  };
  if (current) view.current = current;
  return view;
}
