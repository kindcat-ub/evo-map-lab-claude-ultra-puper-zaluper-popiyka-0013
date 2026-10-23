// HTTP-контракт бэк ↔ фронт. Один и тот же набор путей работает двумя способами:
//   live:   GET /api/v1/home                    → сервер считает проекцию на лету
//   static: GET /api/v1/home.json               → тот же JSON, заранее выгруженный exportStatic
// Фронт знает только эти пути и типы ответов, хранилище за ними не видно.

import type { Card, ActivityView, ChapterCard, ChapterView, GraphView, HomeView, ProjectCard, ProjectView } from './projections.ts';
import type { Entity, Id, Snapshot } from './model.ts';
import type { Issue } from './validate.ts';
import type { WriteRequest, WriteResult } from './store.ts';

export const API_PREFIX = '/api/v1';

/**
 * Чтение (публичное, только published).
 * `:key` — часть id после двоеточия. Двоеточий в путях нет, чтобы статика жила на любом хостинге.
 */
export interface ReadRoutes {
  'GET /home': HomeView;
  'GET /projects': ProjectCard[];
  'GET /projects/:key': ProjectView;
  /** ?project=project:x&type=question&before=<cursor>&limit=30. В static есть только первая страница без фильтров. */
  'GET /activity': ActivityView;
  'GET /manga': ChapterCard[];
  'GET /manga/:key': ChapterView;
  /** Карточка любого объекта, для превью хотспота и ссылок. id = kind:key → /resolve/kind/key. */
  'GET /resolve/:kind/:key': Card;
  /** Вход для Evolution Map: весь граф. */
  'GET /graph': GraphView;
  /** Граф одного проекта и его связей наружу (один шаг). */
  'GET /graph/:key': GraphView;
}

/**
 * Запись и режим автора. Authorization: Bearer <токен из окружения сервера>.
 * Посетитель сюда не ходит, публичной записи в MVP нет.
 */
export interface WriteRoutes {
  /** Весь источник, включая draft. */
  'GET /source': Snapshot;
  'GET /source/:id': Entity;
  /** Атомарная пачка операций от ревизии base. 409 при устаревшей base, 422 с issues при невалидном результате. */
  'POST /source': WriteResult;
  /** Загрузить файл медиа: тело = байты, ?key=media/vasya5123.jpg. Ответ: { ref }. */
  'PUT /media': { ref: string };
}

export type WriteBody = WriteRequest;

export interface ApiError {
  error: 'not_found' | 'bad_request' | 'unauthorized' | 'conflict' | 'invalid';
  message: string;
  issues?: Issue[];
  /** Для conflict: текущая ревизия. */
  revision?: number;
}

/** Статические файлы, которые exportStatic кладёт рядом с сайтом. */
export function staticPaths(s: Snapshot): string[] {
  const keys = (k: string) => s.entities.filter((e) => e.id.startsWith(k + ':')).map((e) => e.id.slice(k.length + 1));
  return [
    '/home.json', '/projects.json', '/activity.json', '/manga.json', '/graph.json',
    ...keys('project').map((k) => `/projects/${k}.json`),
    ...keys('project').map((k) => `/graph/${k}.json`),
    ...keys('chapter').map((k) => `/manga/${k}.json`),
    ...s.entities.map((e) => `/resolve/${(e.id as Id).replace(':', '/')}.json`),
  ];
}
