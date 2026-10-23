// Порт хранилища и запись. Хранилище тупое: хранит и отдаёт.
// Смысловые правила живут в applyOps + validateSnapshot, а не в адаптерах,
// поэтому SQL, файлы или что-то ещё меняются без изменения контракта.

import { type Entity, type Id, type Relation, type RelationType, type Snapshot, SCHEMA_VERSION, relationKey } from './model.ts';
import { assertValid } from './validate.ts';

/** Одна операция записи. Пачка операций применяется атомарно. */
export type WriteOp =
  | { op: 'put'; entity: Entity }
  | { op: 'delete'; id: Id }
  | { op: 'link'; relation: Relation }
  | { op: 'unlink'; from: Id; type: RelationType; to: Id };

export interface WriteRequest {
  /** Ревизия, от которой автор считал изменения. Не совпала — конфликт, ничего не записано. */
  base: number;
  ops: WriteOp[];
}

export interface WriteResult {
  revision: number;
}

export class ConflictError extends Error {
  readonly expected: number;
  readonly actual: number;
  constructor(expected: number, actual: number) {
    super(`ревизия ${expected} устарела, текущая ${actual}`);
    this.expected = expected;
    this.actual = actual;
  }
}

/** Порт источника. Реализации: MemoryStore, FsStore; SQL — тот же интерфейс. */
export interface SourceStore {
  load(): Promise<Snapshot>;
  /**
   * Записать уже проверенный next. ops — то же изменение в виде дельты,
   * чтобы адаптер мог писать точечно, а не перезаливать всё.
   * Обязан бросить ConflictError, если текущая ревизия ≠ base.
   */
  commit(base: number, ops: WriteOp[], next: Snapshot): Promise<void>;
}

/** Файлы медиа. Ключ — относительный путь вроде `media/vasya5123.jpg`. */
export interface BlobStore {
  put(key: string, bytes: Uint8Array, mime?: string): Promise<string>;
  get(key: string): Promise<{ bytes: Uint8Array; mime?: string } | undefined>;
}

export function emptySnapshot(): Snapshot {
  return { schema: SCHEMA_VERSION, revision: 0, entities: [], relations: [] };
}

/** Чистая функция: применить операции, получить следующую ревизию. Не валидирует. */
export function applyOps(s: Snapshot, ops: WriteOp[]): Snapshot {
  const entities = new Map(s.entities.map((e) => [e.id, e] as const));
  const relations = new Map(s.relations.map((r) => [relationKey(r), r] as const));
  for (const o of ops) {
    switch (o.op) {
      case 'put': entities.set(o.entity.id, o.entity); break;
      case 'delete':
        if (!entities.delete(o.id)) throw new Error(`delete: ${o.id} не существует`);
        break;
      case 'link': relations.set(relationKey(o.relation), o.relation); break;
      case 'unlink':
        if (!relations.delete(relationKey(o))) throw new Error(`unlink: ${relationKey(o)} не существует`);
        break;
    }
  }
  return { schema: s.schema, revision: s.revision + 1, entities: [...entities.values()], relations: [...relations.values()] };
}

/**
 * Единственный путь записи в источник. Валидирует результат целиком:
 * висячая ссылка, удаление объекта, на который кто-то ссылается, кривая запись — отказ.
 */
export async function write(store: SourceStore, req: WriteRequest): Promise<WriteResult> {
  const current = await store.load();
  if (current.revision !== req.base) throw new ConflictError(req.base, current.revision);
  const next = applyOps(current, req.ops);
  assertValid(next);
  await store.commit(req.base, req.ops, next);
  return { revision: next.revision };
}

export class MemoryStore implements SourceStore {
  private s: Snapshot;
  constructor(initial: Snapshot = emptySnapshot()) { this.s = structuredClone(initial); }
  async load(): Promise<Snapshot> { return structuredClone(this.s); }
  async commit(base: number, _ops: WriteOp[], next: Snapshot): Promise<void> {
    if (this.s.revision !== base) throw new ConflictError(base, this.s.revision);
    this.s = structuredClone(next);
  }
}
