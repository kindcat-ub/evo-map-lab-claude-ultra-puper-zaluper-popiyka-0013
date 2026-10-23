// Браузерно-безопасная часть контракта: типы, валидатор, проекции, пути API.
// Адаптеры на node:fs и node:http — отдельно: ./fs-store.ts, ./server.ts.
export * from './model.ts';
export * from './validate.ts';
export * from './store.ts';
export * from './projections.ts';
export * from './api.ts';
