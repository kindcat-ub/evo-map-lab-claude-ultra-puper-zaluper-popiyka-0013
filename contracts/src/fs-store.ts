// Источник как папка с файлами. Это же формат обмена: генератор пишет сюда, сайт читает отсюда.
//
// <root>/
//   source.json            { "schema": 1, "revision": N }
//   project/<key>.json     одна запись = один файл, руками редактируется
//   update/<key>.json
//   research/<key>.json
//   artifact/<key>.json
//   chapter/<key>.json
//   relations.json         Relation[]
//   media/…                файлы, на которые ссылаются относительные MediaRef

import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, sep } from 'node:path';
import { type Entity, type Snapshot, KINDS, SCHEMA_VERSION, keyOf, kindOf, relationKey } from './model.ts';
import { type BlobStore, type SourceStore, type WriteOp, ConflictError } from './store.ts';

async function readJson<T>(path: string): Promise<T | undefined> {
  try { return JSON.parse(await readFile(path, 'utf8')) as T; }
  catch (e: any) { if (e.code === 'ENOENT') return undefined; throw new Error(`${path}: ${e.message}`); }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + '\n');
  await rename(tmp, path);
}

export class FsStore implements SourceStore {
  readonly root: string;
  constructor(root: string) { this.root = root; }

  private file(e: Pick<Entity, 'id'>) { return join(this.root, kindOf(e.id), `${keyOf(e.id)}.json`); }

  async load(): Promise<Snapshot> {
    const meta = await readJson<{ schema: number; revision: number }>(join(this.root, 'source.json'));
    const entities: Entity[] = [];
    for (const kind of KINDS) {
      let names: string[] = [];
      try { names = (await readdir(join(this.root, kind))).filter((n) => n.endsWith('.json')).sort(); }
      catch (e: any) { if (e.code !== 'ENOENT') throw e; }
      for (const n of names) {
        const e = await readJson<Entity>(join(this.root, kind, n));
        if (e) entities.push(e);
      }
    }
    const relations = (await readJson<Snapshot['relations']>(join(this.root, 'relations.json'))) ?? [];
    return { schema: (meta?.schema ?? SCHEMA_VERSION) as 1, revision: meta?.revision ?? 0, entities, relations };
  }

  async commit(base: number, ops: WriteOp[], next: Snapshot): Promise<void> {
    const meta = await readJson<{ revision: number }>(join(this.root, 'source.json'));
    const actual = meta?.revision ?? 0;
    if (actual !== base) throw new ConflictError(base, actual);
    for (const o of ops) {
      if (o.op === 'put') await writeJson(this.file(o.entity), o.entity);
      if (o.op === 'delete') await rm(this.file(o), { force: true });
    }
    if (ops.some((o) => o.op === 'link' || o.op === 'unlink')) {
      const sorted = [...next.relations].sort((a, b) => relationKey(a).localeCompare(relationKey(b)));
      await writeJson(join(this.root, 'relations.json'), sorted);
    }
    await writeJson(join(this.root, 'source.json'), { schema: next.schema, revision: next.revision });
  }

  /** Залить целый снапшот с нуля (генератор, импорт). Старые файлы записей стираются. */
  async replace(s: Snapshot): Promise<void> {
    for (const kind of KINDS) await rm(join(this.root, kind), { recursive: true, force: true });
    for (const e of s.entities) await writeJson(this.file(e), e);
    const sorted = [...s.relations].sort((a, b) => relationKey(a).localeCompare(relationKey(b)));
    await writeJson(join(this.root, 'relations.json'), sorted);
    await writeJson(join(this.root, 'source.json'), { schema: s.schema, revision: s.revision });
  }
}

export class FsBlobStore implements BlobStore {
  readonly root: string;
  constructor(root: string) { this.root = root; }

  private path(key: string) {
    const p = normalize(join(this.root, key));
    if (!p.startsWith(normalize(this.root) + sep)) throw new Error(`ключ вне хранилища: ${key}`);
    return p;
  }

  async put(key: string, bytes: Uint8Array): Promise<string> {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, bytes);
    return key;
  }

  async get(key: string) {
    try { return { bytes: new Uint8Array(await readFile(this.path(key))) }; }
    catch (e: any) { if (e.code === 'ENOENT') return undefined; throw e; }
  }
}
