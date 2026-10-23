// node sim/src/cli.ts [--seed 42] [--out sim/out] [--projects 7] [--chapters 3] [--until 2026-10-01] [--years 3]
// Generates a world, checks it, writes it as a contracts source folder with rendered media.

import { rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { FsBlobStore, FsStore } from "../../contracts/src/fs-store.ts";
import { generate, GENERATOR_VERSION } from "./generate.ts";
import { renderMedia } from "./media.ts";
import { validate } from "./validate.ts";

const { values: a } = parseArgs({
  options: {
    seed: { type: "string", default: "42" },
    out: { type: "string", default: "sim/out" },
    projects: { type: "string" },
    chapters: { type: "string" },
    until: { type: "string" },
    years: { type: "string" },
  },
});

const num = (v?: string) => (v === undefined ? undefined : Number(v));
const opts = { seed: a.seed!, projects: num(a.projects), chapters: num(a.chapters), until: a.until, years: num(a.years) };
const { snapshot, media, author } = generate(opts);
const report = validate(snapshot);
if (report.errors.length) {
  console.error(report.errors.join("\n"));
  process.exit(1);
}

const out = resolve(a.out!);
await rm(join(out, "media"), { recursive: true, force: true });
await new FsStore(out).replace(snapshot);
const blobs = new FsBlobStore(out);
for (const m of media) await blobs.put(m.path, renderMedia(m));
// Not part of the source: how this folder was made and what it is guaranteed to contain.
await writeFile(join(out, "sim.json"), JSON.stringify({
  generator: GENERATOR_VERSION,
  options: Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined)),
  author,
  scenarios: report.scenarios,
}, null, 2) + "\n");

const count = (k: string) => snapshot.entities.filter((e) => e.id.startsWith(`${k}:`)).length;
console.log(`seed ${opts.seed} -> ${out}`);
console.log(`projects ${count("project")}, updates ${count("update")}, research ${count("research")}, artifacts ${count("artifact")}, chapters ${count("chapter")}, relations ${snapshot.relations.length}, media files ${media.length}`);
console.log(`scenarios: ${Object.keys(report.scenarios).length} covered`);
