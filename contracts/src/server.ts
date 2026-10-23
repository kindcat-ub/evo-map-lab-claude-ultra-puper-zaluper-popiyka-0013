// Эталонный адаптер HTTP поверх порта хранилища. node:http, без фреймворков.
// Один роутер чтения обслуживает и live-сервер, и статическую выгрузку.

import { createServer, type IncomingMessage, type Server } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { type Id, type Snapshot, type UpdateType, isId } from './model.ts';
import { activity, chapter, chapterList, graph, home, project, projectList, publicView, resolve } from './projections.ts';
import { type BlobStore, type SourceStore, type WriteRequest, ConflictError, write } from './store.ts';
import { ValidationError } from './validate.ts';
import { evolution } from './evolution.ts';
import { API_PREFIX, type ApiError, staticPaths } from './api.ts';

export interface Reply { status: number; body: unknown }

const notFound = (message: string): Reply => ({ status: 404, body: { error: 'not_found', message } satisfies ApiError });

/** Чтение по публичному срезу. path без префикса, без .json. */
export function readRoute(pub: Snapshot, path: string, query: URLSearchParams = new URLSearchParams()): Reply {
  const seg = path.split('/').filter(Boolean).map(decodeURIComponent);
  const ok = (body: unknown): Reply => (body === undefined ? notFound(path) : { status: 200, body });
  switch (seg[0]) {
    case 'home': return seg.length === 1 ? ok(home(pub)) : notFound(path);
    case 'projects':
      if (seg.length === 1) return ok(projectList(pub));
      return seg.length === 2 ? ok(project(pub, `project:${seg[1]}`)) : notFound(path);
    case 'activity': {
      const p = query.get('project'), t = query.get('type'), b = query.get('before'), l = query.get('limit');
      return ok(activity(pub, {
        ...(p && isId(p) ? { project: p as Id<'project'> } : {}),
        ...(t ? { type: t as UpdateType } : {}),
        ...(b ? { before: b } : {}),
        ...(l ? { limit: Number(l) } : {}),
      }));
    }
    case 'manga':
      if (seg.length === 1) return ok(chapterList(pub));
      return seg.length === 2 ? ok(chapter(pub, `chapter:${seg[1]}`)) : notFound(path);
    case 'resolve': {
      const id = `${seg[1]}:${seg[2]}`;
      return seg.length === 3 && isId(id) ? ok(resolve(pub, id)) : notFound(path);
    }
    case 'evolution':
      return seg.length === 2 ? ok(evolution(pub, `project:${seg[1]}`)) : notFound(path);
    case 'graph': {
      if (seg.length === 1) return ok(graph(pub));
      const id = `project:${seg[1]}`;
      return seg.length === 2 && isId(id) && pub.entities.some((e) => e.id === id) ? ok(graph(pub, id as Id<'project'>)) : notFound(path);
    }
  }
  return notFound(path);
}

/** Выгрузить все GET-ответы файлами, чтобы сайт жил на статическом хостинге. */
export async function exportStatic(s: Snapshot, outDir: string): Promise<string[]> {
  const pub = publicView(s);
  const written: string[] = [];
  for (const p of staticPaths(pub)) {
    const r = readRoute(pub, p.replace(/\.json$/, ''));
    if (r.status !== 200) continue;
    const file = join(outDir, p);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(r.body));
    written.push(p);
  }
  return written;
}

async function body(req: IncomingMessage, max = 50 * 1024 * 1024): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) { size += c.length; if (size > max) throw new Error('тело слишком большое'); chunks.push(c); }
  return Buffer.concat(chunks);
}

export interface ServerOptions {
  store: SourceStore;
  blobs?: BlobStore;
  /** Без токена запись выключена. */
  token?: string | undefined;
}

export function createApiServer({ store, blobs, token }: ServerOptions): Server {
  let cache: { revision: number; pub: Snapshot } | undefined;
  const pub = async () => {
    const s = await store.load();
    if (!cache || cache.revision !== s.revision) cache = { revision: s.revision, pub: publicView(s) };
    return cache.pub;
  };

  return createServer(async (req, res) => {
    const send = (r: Reply, headers: Record<string, string> = {}) => {
      res.writeHead(r.status, { 'content-type': 'application/json; charset=utf-8', ...headers });
      res.end(JSON.stringify(r.body));
    };
    try {
      const url = new URL(req.url ?? '/', 'http://local');
      if (!url.pathname.startsWith(API_PREFIX + '/')) return send(notFound(url.pathname));
      const path = url.pathname.slice(API_PREFIX.length).replace(/\.json$/, '');
      const authed = !!token && req.headers.authorization === `Bearer ${token}`;

      if (path === '/source' || path.startsWith('/source/') || path === '/media') {
        if (!authed) return send({ status: 401, body: { error: 'unauthorized', message: 'нужен Bearer токен' } satisfies ApiError });
        if (req.method === 'GET' && path === '/source') return send({ status: 200, body: await store.load() });
        if (req.method === 'GET' && path.startsWith('/source/')) {
          const id = decodeURIComponent(path.slice('/source/'.length));
          const e = (await store.load()).entities.find((x) => x.id === id);
          return send(e ? { status: 200, body: e } : notFound(id));
        }
        if (req.method === 'POST' && path === '/source') {
          let w: WriteRequest;
          try { w = JSON.parse((await body(req)).toString('utf8')); }
          catch { return send({ status: 400, body: { error: 'bad_request', message: 'тело не JSON' } satisfies ApiError }); }
          if (!Number.isInteger(w?.base) || !Array.isArray(w?.ops)) {
            return send({ status: 400, body: { error: 'bad_request', message: '{ base: number, ops: WriteOp[] }' } satisfies ApiError });
          }
          try { return send({ status: 200, body: await write(store, w) }); }
          catch (e) {
            if (e instanceof ConflictError) return send({ status: 409, body: { error: 'conflict', message: e.message, revision: e.actual } satisfies ApiError });
            if (e instanceof ValidationError) return send({ status: 422, body: { error: 'invalid', message: 'результат невалиден', issues: e.issues } satisfies ApiError });
            return send({ status: 400, body: { error: 'bad_request', message: (e as Error).message } satisfies ApiError });
          }
        }
        if (req.method === 'PUT' && path === '/media' && blobs) {
          const key = url.searchParams.get('key');
          if (!key || /^https?:/.test(key)) return send({ status: 400, body: { error: 'bad_request', message: '?key=media/…' } satisfies ApiError });
          const ref = await blobs.put(key, await body(req), req.headers['content-type']);
          return send({ status: 200, body: { ref } });
        }
        return send(notFound(path));
      }

      if (req.method !== 'GET') return send(notFound(path));
      const p = await pub();
      const etag = `"r${p.revision}"`;
      if (req.headers['if-none-match'] === etag) { res.writeHead(304, { etag }); return res.end(); }
      send(readRoute(p, path, url.searchParams), { etag });
    } catch (e) {
      send({ status: 500, body: { error: 'bad_request', message: (e as Error).message } });
    }
  });
}
