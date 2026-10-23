import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateSnapshot, validateEntity } from '../src/validate.ts';
import { activity, chapter, graph, home, mediaUrl, pick, project, publicView, resolve } from '../src/projections.ts';
import { ConflictError, MemoryStore, write } from '../src/store.ts';
import { ValidationError } from '../src/validate.ts';
import { FsStore } from '../src/fs-store.ts';
import { exportStatic, readRoute } from '../src/server.ts';
import { fixture } from './fixture.ts';

const h0 = (s: Parameters<typeof home>[0]) => home(s);

test('фикстура валидна', () => {
  assert.deepEqual(validateSnapshot(fixture()), []);
});

test('валидатор ловит кривые записи и висячие ссылки', () => {
  const s = fixture();
  s.entities.push({ id: 'update:bad', visibility: 'published', date: '2025-13-01', type: 'rumor', title: {} } as any);
  s.entities.push({ id: 'Project:Caps', visibility: 'published', title: { ru: 'x' } } as any);
  s.relations.push({ from: 'update:2025-06-moved', type: 'answers', to: 'project:sill-greenhouse' });
  s.relations.push({ from: 'update:2025-06-moved', type: 'supports', to: 'project:nope' });
  const codes = validateSnapshot(s).map((i) => `${i.at}|${i.field ?? ''}|${i.code}`);
  for (const c of ['update:bad|date|shape', 'update:bad|type|shape', 'update:bad|title|shape', 'Project:Caps|id|id',
    'update:2025-06-moved answers project:sill-greenhouse|to|rule', 'update:2025-06-moved supports project:nope|to|dangling']) {
    assert.ok(codes.includes(c), `нет ${c}: ${codes.join(', ')}`);
  }
});

test('хотспот = { icon, target } и ничего больше', () => {
  const ch = { id: 'chapter:x', visibility: 'draft', number: 3, title: { en: 'x' }, pages: [{ panels: [{ image: 'a.webp', hotspots: [{ icon: 'm', target: 'ftp://x', kind: 'music' }] }] }] };
  const fields = validateEntity(ch).map((i) => i.field);
  assert.ok(fields.includes('pages[0].panels[0].hotspots[0].target'));
  assert.ok(fields.includes('pages[0].panels[0].hotspots[0]'));
});

test('publicView прячет draft, его детей, связи и хотспоты на него', () => {
  const pub = publicView(fixture());
  const ids = pub.entities.map((e) => e.id);
  assert.ok(!ids.includes('project:secret-draft'));
  assert.ok(!ids.includes('update:2025-04-draft-thing'));
  assert.ok(!pub.relations.some((r) => r.to === 'project:secret-draft'));
  const v = chapter(pub, 'chapter:one')!;
  assert.deepEqual(v.chapter.pages[0].panels[0].hotspots.map((h) => h.icon), ['leaf', 'music']);
  assert.equal(v.chapter.pages[0].panels[0].hotspots[1].card?.ref, 'https://example.org/tracks/rain-loop');
  assert.equal(v.chapter.pages[0].panels[1].hotspots[0].card, undefined);
  assert.equal(v.next, 'chapter:two');
  assert.deepEqual(validateSnapshot(pub), []);
});

test('текущее вычисляется: статус из последнего Update со status, открытые вопросы без answers', () => {
  const pub = publicView(fixture());
  const p = project(pub, 'project:sill-greenhouse')!;
  assert.equal(p.status, 'paused');
  assert.equal(p.lastActivity, '2025-07-01');
  assert.equal(p.question?.open, false);
  assert.deepEqual(p.current.map((u) => u.id)[0], 'update:2025-07-01-pause');
  assert.deepEqual(p.manga.map((m) => `${m.chapter} ${m.page}/${m.panel} ${m.target}`), ['chapter:one 0/0 project:sill-greenhouse']);
  assert.equal(h0(pub).projects.find((x) => x.id === 'project:sill-greenhouse')?.cover, 'media/probe-after-14-days.jpg');
  assert.deepEqual(p.links.map((l) => `${l.direction} ${l.relation.type} ${l.other.id}`).sort(), ['in derived_from project:rooftop-weather']);
  const h = home(pub);
  assert.deepEqual(h.focus.map((x) => x.id), ['project:rooftop-weather']);
  assert.deepEqual(h.questions.map((q) => q.id), ['update:2025-07-14-how-cheap']);
  assert.equal(h.recent[0].id, 'update:2025-07-14-how-cheap');
  assert.equal(h.latestChapter?.id, 'chapter:two');
});

test('activity листается курсором без дублей и потерь', () => {
  const pub = publicView(fixture());
  const all = activity(pub, { limit: 200 }).items.map((u) => u.id);
  const seen: string[] = [];
  let cur: string | undefined;
  do {
    const page = activity(pub, { limit: 2, ...(cur ? { before: cur } : {}) });
    seen.push(...page.items.map((u) => u.id));
    cur = page.next;
  } while (cur);
  assert.deepEqual(seen, all);
  assert.ok(all.includes('update:2025-06-moved'), 'событие жизни без проекта в ленте');
});

test('graph проекта: свои объекты + один шаг наружу, без геометрии', () => {
  const g = graph(publicView(fixture()), 'project:rooftop-weather');
  const ids = g.nodes.map((n) => n.id).sort();
  assert.ok(ids.includes('project:sill-greenhouse') && ids.includes('update:2025-06-moved'));
  assert.ok(g.nodes.every((n) => !('x' in n)));
});

test('запись: атомарно, с проверкой ревизии и целостности', async () => {
  const store = new MemoryStore(fixture());
  await assert.rejects(write(store, { base: 0, ops: [] }), ConflictError);
  await assert.rejects(write(store, { base: 3, ops: [{ op: 'delete', id: 'project:rooftop-weather' }] }), ValidationError, 'висячие ссылки после удаления');
  const r = await write(store, { base: 3, ops: [
    { op: 'put', entity: { id: 'update:2025-08-02-bmp280', visibility: 'published', date: '2025-08-02', project: 'project:rooftop-weather', type: 'discovery', title: { en: 'BMP280 drifts 1 hPa per 10 °C' } } },
    { op: 'link', relation: { from: 'update:2025-08-02-bmp280', type: 'answers', to: 'update:2025-07-14-how-cheap' } },
  ] });
  assert.equal(r.revision, 4);
  assert.deepEqual(home(publicView(await store.load())).questions, []);
});

test('FsStore: папка-источник туда и обратно, запись точечная', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lastdrop-'));
  const fs = new FsStore(dir);
  await fs.replace(fixture());
  const back = await fs.load();
  assert.equal(back.revision, 3);
  assert.equal(back.entities.length, fixture().entities.length);
  assert.deepEqual(validateSnapshot(back), []);
  await write(fs, { base: 3, ops: [{ op: 'unlink', from: 'project:sill-greenhouse', type: 'relates_to', to: 'project:secret-draft' }] });
  const rel = JSON.parse(await readFile(join(dir, 'relations.json'), 'utf8'));
  assert.equal(rel.length, 4);
  assert.equal((await fs.load()).revision, 4);
});

test('HTTP-роутер и статика отдают одно и то же', async () => {
  const s = fixture();
  const pub = publicView(s);
  assert.equal(readRoute(pub, '/projects/sill-greenhouse').status, 200);
  assert.equal(readRoute(pub, '/projects/secret-draft').status, 404);
  assert.equal(readRoute(pub, '/resolve/artifact/rain-loop').status, 200);
  assert.equal(readRoute(pub, '/graph/rooftop-weather').status, 200);
  const out = await mkdtemp(join(tmpdir(), 'lastdrop-static-'));
  const files = await exportStatic(s, out);
  assert.ok(files.includes('/manga/one.json') && files.includes('/resolve/chapter/two.json'));
  assert.ok(!files.some((f) => f.includes('secret-draft')));
  const fromFile = JSON.parse(await readFile(join(out, 'home.json'), 'utf8'));
  assert.deepEqual(fromFile, JSON.parse(JSON.stringify(readRoute(pub, '/home').body)));
  assert.equal(resolve(pub, 'project:secret-draft'), undefined);
});

test('pick и mediaUrl', () => {
  assert.deepEqual(pick({ en: 'x' }, 'ru'), { text: 'x', lang: 'en' });
  assert.equal(mediaUrl('media/a.jpg', 'https://cdn.example/'), 'https://cdn.example/media/a.jpg');
  assert.equal(mediaUrl('https://x.org/a', 'https://cdn.example'), 'https://x.org/a');
});
