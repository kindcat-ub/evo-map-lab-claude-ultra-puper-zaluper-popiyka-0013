// Проверка источника целиком: структура каждой записи и целостность ссылок.
// Без зависимостей, чтобы генератор, бэк и фронт гоняли одно и то же.

import {
  type Entity, type Id, type Kind, type Relation, type Snapshot, type Text,
  PROJECT_STATUSES, RELATION_TYPES, SCHEMA_VERSION, UPDATE_TYPES,
  isId, isUrl, kindOf, relationKey,
} from './model.ts';

export interface Issue {
  /** id записи, relationKey связи или `snapshot`. */
  at: string;
  field?: string;
  code: 'shape' | 'id' | 'duplicate' | 'dangling' | 'kind' | 'rule';
  message: string;
}

const DATE_RE = /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01])(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?)?)?$/;

export function isPartialDate(s: unknown): s is string {
  return typeof s === 'string' && DATE_RE.test(s);
}

export function isText(t: unknown): t is Text {
  if (!t || typeof t !== 'object' || Array.isArray(t)) return false;
  const o = t as Record<string, unknown>;
  for (const k of Object.keys(o)) if (k !== 'ru' && k !== 'en') return false;
  const ok = (v: unknown) => v === undefined || typeof v === 'string';
  return ok(o.ru) && ok(o.en) && (!!o.ru?.toString().trim() || !!o.en?.toString().trim());
}

type Check = (cond: boolean, field: string, message: string, code?: Issue['code']) => void;

const FIELDS: Record<Kind, readonly string[]> = {
  project: ['id', 'visibility', 'title', 'summary', 'body', 'started', 'question', 'tags'],
  update: ['id', 'visibility', 'date', 'project', 'type', 'status', 'title', 'body'],
  research: ['id', 'visibility', 'project', 'date', 'question', 'hypothesis', 'experiment', 'observations', 'conclusion', 'unknowns'],
  artifact: ['id', 'visibility', 'ref', 'title', 'mime', 'project', 'research', 'date'],
  chapter: ['id', 'visibility', 'number', 'title', 'summary', 'date', 'pages'],
};

/** Структура одной записи, без ссылок на другие. */
export function validateEntity(e: unknown): Issue[] {
  const issues: Issue[] = [];
  if (!e || typeof e !== 'object') return [{ at: '?', code: 'shape', message: 'запись не объект' }];
  const o = e as Record<string, any>;
  const at = typeof o.id === 'string' ? o.id : '?';
  const check: Check = (cond, field, message, code = 'shape') => { if (!cond) issues.push({ at, field, code, message }); };

  if (!isId(o.id)) return [{ at, field: 'id', code: 'id', message: 'id должен быть kind:key, key = [a-z0-9][a-z0-9.-]*' }];
  const kind = kindOf(o.id);
  for (const k of Object.keys(o)) check(FIELDS[kind].includes(k), k, `лишнее поле для ${kind}`);
  check(o.visibility === 'draft' || o.visibility === 'published', 'visibility', 'draft | published');

  const text = (f: string, required = false) => {
    if (o[f] === undefined) check(!required, f, 'обязательное поле');
    else check(isText(o[f]), f, 'Text: { ru?, en? }, хотя бы один непустой');
  };
  const date = (f: string, required = false) => {
    if (o[f] === undefined) check(!required, f, 'обязательное поле');
    else check(isPartialDate(o[f]), f, 'дата: YYYY | YYYY-MM | YYYY-MM-DD | ISO datetime');
  };
  const ref = (f: string, k: Kind) => {
    if (o[f] !== undefined) check(isId(o[f]) && kindOf(o[f]) === k, f, `ожидается ${k}:key`, 'kind');
  };
  const media = (v: unknown, f: string) => check(typeof v === 'string' && v.trim() !== '' && !/\s/.test(v), f, 'MediaRef: ключ файла или URL без пробелов');

  switch (kind) {
    case 'project':
      text('title', true); text('summary'); text('body'); date('started'); ref('question', 'update');
      if (o.tags !== undefined) check(Array.isArray(o.tags) && o.tags.every((t: unknown) => typeof t === 'string' && t.trim() !== ''), 'tags', 'массив непустых строк');
      break;
    case 'update':
      date('date', true); ref('project', 'project'); text('title', true); text('body');
      check(UPDATE_TYPES.includes(o.type), 'type', UPDATE_TYPES.join(' | '));
      if (o.status !== undefined) check(PROJECT_STATUSES.includes(o.status), 'status', PROJECT_STATUSES.join(' | '));
      if (o.status !== undefined) check(o.project !== undefined, 'status', 'status без project не к чему применить', 'rule');
      break;
    case 'research':
      ref('project', 'project'); date('date'); text('question', true);
      for (const f of ['hypothesis', 'experiment', 'observations', 'conclusion', 'unknowns']) text(f);
      break;
    case 'artifact':
      media(o.ref, 'ref'); text('title'); ref('project', 'project'); ref('research', 'research'); date('date');
      if (o.mime !== undefined) check(typeof o.mime === 'string' && /^[\w.+-]+\/[\w.+-]+$/.test(o.mime), 'mime', 'type/subtype');
      break;
    case 'chapter': {
      check(Number.isInteger(o.number) && o.number >= 0, 'number', 'целое ≥ 0');
      text('title', true); text('summary'); date('date');
      if (!Array.isArray(o.pages)) { check(false, 'pages', 'массив страниц'); break; }
      o.pages.forEach((p: any, i: number) => {
        const pf = `pages[${i}]`;
        if (!p || typeof p !== 'object') return check(false, pf, 'страница не объект');
        for (const k of Object.keys(p)) check(k === 'image' || k === 'panels', `${pf}.${k}`, 'лишнее поле');
        if (p.image !== undefined) media(p.image, `${pf}.image`);
        if (!Array.isArray(p.panels)) return check(false, `${pf}.panels`, 'массив кадров');
        p.panels.forEach((c: any, j: number) => {
          const cf = `${pf}.panels[${j}]`;
          if (!c || typeof c !== 'object') return check(false, cf, 'кадр не объект');
          for (const k of Object.keys(c)) check(['region', 'image', 'animation', 'text', 'hotspots'].includes(k), `${cf}.${k}`, 'лишнее поле');
          if (c.image !== undefined) media(c.image, `${cf}.image`);
          if (c.animation !== undefined) media(c.animation, `${cf}.animation`);
          if (c.text !== undefined) check(isText(c.text), `${cf}.text`, 'Text: { ru?, en? }');
          check(c.image !== undefined || c.region !== undefined, cf, 'кадр — это region на странице или своя image', 'rule');
          check(c.region === undefined || p.image !== undefined, `${cf}.region`, 'region без image страницы ни к чему не привязан', 'rule');
          if (c.region !== undefined) {
            const r = c.region;
            const n = (v: unknown) => typeof v === 'number' && v >= 0 && v <= 1;
            check(r && n(r.x) && n(r.y) && n(r.w) && n(r.h) && r.w > 0 && r.h > 0 && r.x + r.w <= 1.0001 && r.y + r.h <= 1.0001
              && Object.keys(r).every((k) => 'xywh'.includes(k)), `${cf}.region`, '{x,y,w,h} в долях страницы 0..1');
          }
          if (c.hotspots !== undefined) {
            if (!Array.isArray(c.hotspots)) return check(false, `${cf}.hotspots`, 'массив');
            c.hotspots.forEach((h: any, k: number) => {
              const hf = `${cf}.hotspots[${k}]`;
              check(h && typeof h.icon === 'string' && h.icon.trim() !== '', `${hf}.icon`, 'непустая строка');
              check(h && (isId(h.target) || isUrl(h.target)), `${hf}.target`, 'id объекта или http(s) URL');
              check(h && Object.keys(h).every((x) => x === 'icon' || x === 'target'), hf, 'хотспот = { icon, target }, больше ничего');
            });
          }
        });
      });
      break;
    }
  }
  return issues;
}

export function validateRelation(r: unknown): Issue[] {
  if (!r || typeof r !== 'object') return [{ at: '?', code: 'shape', message: 'связь не объект' }];
  const o = r as Record<string, any>;
  const at = relationKey(o as Relation);
  const issues: Issue[] = [];
  const check: Check = (cond, field, message, code = 'shape') => { if (!cond) issues.push({ at, field, code, message }); };
  check(isId(o.from), 'from', 'id', 'id');
  check(isId(o.to), 'to', 'id', 'id');
  check(RELATION_TYPES.includes(o.type), 'type', RELATION_TYPES.join(' | '));
  check(o.from !== o.to, 'to', 'связь сама на себя', 'rule');
  if (o.note !== undefined) check(isText(o.note), 'note', 'Text');
  for (const k of Object.keys(o)) check(['from', 'type', 'to', 'note'].includes(k), k, 'лишнее поле');
  return issues;
}

/** Полная проверка: структура, дубли, висячие ссылки, правила связей. */
export function validateSnapshot(s: Snapshot): Issue[] {
  const issues: Issue[] = [];
  if (s?.schema !== SCHEMA_VERSION) issues.push({ at: 'snapshot', field: 'schema', code: 'shape', message: `schema должна быть ${SCHEMA_VERSION}` });
  if (!Number.isInteger(s?.revision) || s.revision < 0) issues.push({ at: 'snapshot', field: 'revision', code: 'shape', message: 'целое ≥ 0' });
  if (!Array.isArray(s?.entities) || !Array.isArray(s?.relations)) {
    issues.push({ at: 'snapshot', code: 'shape', message: 'entities и relations должны быть массивами' });
    return issues;
  }

  const byId = new Map<string, Entity>();
  for (const e of s.entities) {
    const own = validateEntity(e);
    issues.push(...own);
    if (own.some((i) => i.code === 'id')) continue;
    if (byId.has(e.id)) issues.push({ at: e.id, code: 'duplicate', message: 'id встречается дважды' });
    byId.set(e.id, e);
  }

  const exists = (at: string, field: string, id: unknown) => {
    if (isId(id) && !byId.has(id)) issues.push({ at, field, code: 'dangling', message: `${id} не существует` });
  };
  for (const e of byId.values()) {
    const o = e as Record<string, any>;
    for (const f of ['project', 'question', 'research']) exists(e.id, f, o[f]);
    if (kindOf(e.id) === 'project' && o.question) {
      const q = byId.get(o.question) as Record<string, any> | undefined;
      if (q && q.type !== 'question') issues.push({ at: e.id, field: 'question', code: 'rule', message: 'исходный вопрос должен быть Update с type question' });
      if (q && q.project !== undefined && q.project !== e.id) issues.push({ at: e.id, field: 'question', code: 'rule', message: 'исходный вопрос принадлежит другому проекту' });
    }
    if (kindOf(e.id) === 'chapter') {
      (o.pages ?? []).forEach((p: any, i: number) => (p?.panels ?? []).forEach((c: any, j: number) => (c?.hotspots ?? []).forEach((h: any, k: number) =>
        exists(e.id, `pages[${i}].panels[${j}].hotspots[${k}].target`, h?.target))));
    }
  }

  const seen = new Set<string>();
  for (const r of s.relations) {
    issues.push(...validateRelation(r));
    const key = relationKey(r);
    if (seen.has(key)) issues.push({ at: key, code: 'duplicate', message: 'связь встречается дважды' });
    seen.add(key);
    exists(key, 'from', r.from);
    exists(key, 'to', r.to);
    const from = byId.get(r.from) as Record<string, any> | undefined;
    const to = byId.get(r.to) as Record<string, any> | undefined;
    if (r.type === 'answers' && to && to.type !== 'question') {
      issues.push({ at: key, field: 'to', code: 'rule', message: 'answers ведёт только в Update с type question' });
    }
    if (r.type === 'supersedes' && from && to && kindOf(r.from) !== kindOf(r.to)) {
      issues.push({ at: key, field: 'to', code: 'rule', message: 'supersedes заменяет объект того же вида' });
    }
  }
  return issues;
}

export function assertValid(s: Snapshot): void {
  const issues = validateSnapshot(s);
  if (issues.length) throw new ValidationError(issues);
}

export class ValidationError extends Error {
  readonly issues: Issue[];
  constructor(issues: Issue[]) {
    super(`источник невалиден: ${issues.length} проблем(ы)\n` + issues.slice(0, 20).map(formatIssue).join('\n'));
    this.issues = issues;
  }
}

export function formatIssue(i: Issue): string {
  return `${i.at}${i.field ? ` .${i.field}` : ''} [${i.code}] ${i.message}`;
}

export type { Id };
