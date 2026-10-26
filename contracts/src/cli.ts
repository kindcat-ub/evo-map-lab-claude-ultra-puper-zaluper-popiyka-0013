// node contracts/src/cli.ts validate <dir>         проверить источник-папку
// node contracts/src/cli.ts export <dir> <out>     выгрузить публичный API статикой
// node contracts/src/cli.ts serve <dir> [port]     поднять API (запись при LASTDROP_TOKEN)
import { FsBlobStore, FsStore } from './fs-store.ts';
import { createApiServer, exportStatic } from './server.ts';
import { formatIssue, validateSnapshot } from './validate.ts';

const [cmd, dir, arg] = process.argv.slice(2);
if (!cmd || !dir) {
  console.error('usage: cli.ts validate|export|serve <dir> [out|port]');
  process.exit(2);
}
const store = new FsStore(dir);
const s = await store.load();
const issues = validateSnapshot(s);
if (cmd === 'validate') {
  for (const i of issues) console.log(formatIssue(i));
  console.log(`${s.entities.length} записей, ${s.relations.length} связей, ревизия ${s.revision}: ${issues.length ? issues.length + ' проблем' : 'ok'}`);
  process.exit(issues.length ? 1 : 0);
}
if (issues.length) {
  for (const i of issues.slice(0, 50)) console.error(formatIssue(i));
  console.error(`источник невалиден (${issues.length}), отказ`);
  process.exit(1);
}
if (cmd === 'export') {
  if (!arg) { console.error('нужна папка out'); process.exit(2); }
  const files = await exportStatic(s, arg);
  console.log(`выгружено ${files.length} файлов в ${arg}`);
} else if (cmd === 'serve') {
  const port = Number(arg ?? 8787);
  createApiServer({ store, blobs: new FsBlobStore(dir), token: process.env.LASTDROP_TOKEN, cors: process.env.LASTDROP_CORS_ORIGIN }).listen(port, () =>
    console.log(`http://localhost:${port}/api/v1/home  (запись ${process.env.LASTDROP_TOKEN ? 'включена' : 'выключена'})`));
} else {
  console.error(`неизвестная команда ${cmd}`);
  process.exit(2);
}
