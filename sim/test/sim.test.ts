import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { FsStore } from "../../contracts/src/fs-store.ts";
import { relationKey } from "../../contracts/src/model.ts";
import { generate } from "../src/generate.ts";
import { renderMedia } from "../src/media.ts";
import { SCENARIOS, validate } from "../src/validate.ts";

test("same seed gives byte-identical source and media", () => {
  const a = generate({ seed: "same" }), b = generate({ seed: "same" });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  for (const m of a.media.slice(0, 8)) assert.deepEqual(renderMedia(m), renderMedia(m));
});

test("different seeds give different worlds", () => {
  assert.notEqual(JSON.stringify(generate({ seed: 1 }).snapshot), JSON.stringify(generate({ seed: 2 }).snapshot));
});

test("every seed passes the contract and covers every scenario", () => {
  for (let s = 0; s < 60; s++) {
    const { snapshot } = generate({ seed: s, projects: 5 + (s % 8), chapters: 1 + (s % 4) });
    const r = validate(snapshot);
    assert.deepEqual(r.errors, [], `seed ${s}`);
    for (const k of Object.keys(SCENARIOS)) assert.ok(r.scenarios[k].length > 0, `seed ${s}: ${k}`);
  }
});

test("the checker notices a missing scenario and backwards time", () => {
  const { snapshot } = generate({ seed: 7 });
  const noUnlock = { ...snapshot, relations: snapshot.relations.filter((r) => r.type !== "unlocks") };
  assert.ok(validate(noUnlock).errors.some((e) => e.includes("cross-project-unlock")));

  const cause = snapshot.relations.find((r) => r.type === "caused_by" && r.from.startsWith("update:") && r.to.startsWith("update:"))!;
  const broken = structuredClone(snapshot);
  const effect = broken.entities.find((e) => e.id === cause.from) as { date: string };
  effect.date = "2000-01-01";
  assert.ok(validate(broken).errors.some((e) => e.includes("goes back in time")));
});

test("CLI writes a folder that loads back into the same snapshot", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sim-"));
  try {
    execFileSync(process.execPath, [join(import.meta.dirname, "../src/cli.ts"), "--seed", "roundtrip", "--out", dir]);
    const loaded = await new FsStore(dir).load();
    const { snapshot } = generate({ seed: "roundtrip" });
    const sortE = (xs: { id: string }[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));
    const sortR = (xs: typeof snapshot.relations) => [...xs].sort((a, b) => relationKey(a).localeCompare(relationKey(b)));
    assert.deepEqual(sortE(loaded.entities), sortE(snapshot.entities));
    assert.deepEqual(sortR(loaded.relations), sortR(snapshot.relations));
    execFileSync(process.execPath, [join(import.meta.dirname, "../../contracts/src/cli.ts"), "validate", dir]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
