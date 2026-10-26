import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Entity, Relation, Snapshot } from '../src/model.ts';
import { validateSnapshot } from '../src/validate.ts';
import { project, publicView } from '../src/projections.ts';
import { evolution } from '../src/evolution.ts';
import { readRoute } from '../src/server.ts';
import { fixture } from './fixture.ts';

// Проект-игрушка: две вехи на основной линии и четыре направления на все статусы.
function world(): Snapshot {
  const s = fixture();
  const P = 'project:kite';
  const u = (key: string, date: string, type: string, extra: Record<string, unknown> = {}) =>
    ({ id: `update:${key}`, visibility: 'published', date, project: P, type, title: { ru: key }, ...extra }) as Entity;
  const r = (from: string, type: string, to: string) => ({ from: `update:${from}`, type, to: `update:${to}` }) as Relation;
  s.entities.push(
    { id: P, visibility: 'published', title: { ru: 'Воздушный змей' } },
    u('m1', '2025-01-01', 'milestone'),
    u('frame', '2025-01-05', 'branch'),
    u('frame-d', '2025-01-10', 'decision', { branch: 'update:frame' }),
    u('frame-ok', '2025-02-01', 'note', { branch: 'update:frame', status: 'done' }),
    u('m2', '2025-02-10', 'milestone'),
    u('tail', '2025-01-20', 'branch'),
    u('tail-x', '2025-02-05', 'deadend', { branch: 'update:tail', status: 'dropped' }),
    u('line', '2025-02-15', 'branch'),
    u('line-p', '2025-02-20', 'problem', { branch: 'update:line' }),
    u('line-q', '2025-02-21', 'question', { branch: 'update:line' }),
    u('paint', '2025-02-16', 'branch', { status: 'paused' }),
    u('hidden', '2025-02-17', 'branch', { visibility: 'draft' }),
    u('hidden-e', '2025-02-18', 'note', { branch: 'update:hidden' }),
    u('pause', '2025-03-01', 'note', { status: 'paused' }),
  );
  s.relations.push(
    r('frame', 'derived_from', 'm1'), r('m2', 'caused_by', 'frame-ok'),
    r('tail', 'derived_from', 'frame-d'), r('line', 'derived_from', 'm2'),
  );
  return s;
}

test('направления валидны, а кривые ловятся', () => {
  assert.deepEqual(validateSnapshot(world()), []);
  const s = world();
  s.entities.push({ id: 'update:bad', visibility: 'published', date: '2025-03-02', project: 'project:kite', type: 'note', branch: 'update:m1', title: { ru: 'x' } } as Entity);
  s.entities.push({ id: 'update:nested', visibility: 'published', date: '2025-03-02', project: 'project:kite', type: 'branch', branch: 'update:frame', title: { ru: 'x' } } as Entity);
  const codes = validateSnapshot(s).map((i) => `${i.at}|${i.field}|${i.code}`);
  assert.ok(codes.includes('update:bad|branch|rule'));
  assert.ok(codes.includes('update:nested|branch|rule'));
});

test('evolution: вехи, статусы направлений, рождение и слияние вычисляются', () => {
  const v = evolution(publicView(world()), 'project:kite')!;
  assert.deepEqual(v.states, ['update:m1', 'update:m2']);
  assert.equal(v.current, 'update:m2');
  const st = Object.fromEntries(v.branches.map((b) => [b.id, b.status]));
  assert.deepEqual(st, { 'update:frame': 'merged', 'update:tail': 'dead', 'update:line': 'active', 'update:paint': 'paused' });
  const frame = v.branches.find((b) => b.id === 'update:frame')!;
  assert.equal(frame.from, 'update:m1');
  assert.equal(frame.into, 'update:m2');
  assert.equal(v.branches.find((b) => b.id === 'update:tail')!.from, 'update:frame-d');
  // Корни направлений не события; скрытое направление не протекает, его событие падает на основную линию.
  assert.ok(!v.events.some((e) => e.type === 'branch'));
  assert.equal(v.events.find((e) => e.id === 'update:hidden-e')!.branch, undefined);
  // Статус направления не трогает статус проекта.
  assert.equal(v.status, 'paused');
  assert.equal(project(publicView(world()), 'project:kite')!.status, 'paused');
});

test('статус скрытого направления не становится статусом проекта', () => {
  const s = world();
  s.entities.push({ id: 'update:hidden-x', visibility: 'published', date: '2025-03-05', project: 'project:kite', type: 'deadend', branch: 'update:hidden', status: 'dropped', title: { ru: 'x' } } as Entity);
  assert.deepEqual(validateSnapshot(s), []);
  const pub = publicView(s);
  const x = pub.entities.find((e) => e.id === 'update:hidden-x') as unknown as Record<string, unknown>;
  assert.equal(x.branch, undefined);
  assert.equal(x.status, undefined);
  assert.equal(project(pub, 'project:kite')!.status, 'paused');
  assert.equal(evolution(pub, 'project:kite')!.status, 'paused');
});

test('линзы — проекция, а не хранимые данные', () => {
  const v = evolution(publicView(world()), 'project:kite')!;
  const sec = (l: keyof typeof v.lenses, k: string) => v.lenses[l].sections.find((x) => x.key === k)!.items;
  assert.deepEqual(sec('now', 'current'), ['update:m2']);
  assert.deepEqual(sec('now', 'active'), ['update:line']);
  assert.deepEqual(sec('now', 'problems'), ['update:line-p']);
  assert.deepEqual(sec('next', 'questions'), ['update:line-q']);
  assert.deepEqual(sec('next', 'unfinished').sort(), ['update:line', 'update:paint']);
  assert.deepEqual(sec('why', 'rejected').sort(), ['update:tail', 'update:tail-x']);
  assert.ok(sec('journey', 'turning').includes('update:frame-d'));
  // В ответе нет ни одной координаты.
  assert.doesNotMatch(JSON.stringify(v), /"(x|y|side|slot|lane|p0|p1|p)":/);
});

test('GET /evolution/:key отдаёт ту же проекцию', () => {
  const pub = publicView(world());
  const r = readRoute(pub, '/evolution/kite');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, evolution(pub, 'project:kite'));
  assert.equal(readRoute(pub, '/evolution/nope').status, 404);
});
