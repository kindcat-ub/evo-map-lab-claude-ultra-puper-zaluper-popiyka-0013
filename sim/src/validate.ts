// Scenario coverage on top of the contract's own validator: structure and dangling
// references are checked by contracts/validateSnapshot, this file checks that the
// simulated world actually contains every situation the projections must handle,
// and that time never runs backwards along causal links.
// Works on any Snapshot, simulated or not.

import { type Chapter, type Id, type Relation, type Snapshot, type Update, isUrl, kindOf } from "../../contracts/src/model.ts";
import { validateSnapshot } from "../../contracts/src/validate.ts";
import { publicView } from "../../contracts/src/projections.ts";
import { evolution } from "../../contracts/src/evolution.ts";

export interface Report {
  errors: string[];
  scenarios: Record<string, string[]>; // scenario -> ids that witness it; empty = missing
}

export const SCENARIOS: Record<string, string> = {
  decision: "решение с отложенной альтернативой",
  revision: "пересмотр: решение заменяет прежнее, старое остаётся в истории",
  deadend: "тупик внутри проекта",
  "cross-project-unlock": "тупик в одном проекте решил проблему в другом",
  "open-question": "вопрос без ответа",
  "answered-question": "вопрос, на который позже нашёлся ответ",
  "unknown-cause": "событие с неизвестной причиной: caused_by нет, есть открытый вопрос о нём",
  "pause-resume": "пауза и возвращение",
  "life-pause": "событие жизни поставило проект на паузу",
  "still-paused": "проект стоит на паузе до сих пор",
  dropped: "брошенный проект",
  merge: "проект влился в другой (status done + dst derived_from src)",
  "research-concluded": "исследование с выводом",
  "research-open": "исследование без вывода, с неизвестными",
  "month-date": "дата известна только до месяца",
  "year-date": "известен только год, место задают связи",
  "missing-en": "нет английского текста, проекции откатываются на RU",
  draft: "запись не прошла проверку и не видна публичным проекциям",
  "media-local": "локальный медиафайл",
  "media-url": "внешняя ссылка",
  "hotspot-entity": "хотспот манги ведёт на событие или проект",
  "hotspot-artifact": "хотспот манги ведёт на артефакт",
  "hotspot-url": "хотспот манги ведёт на внешний URL",
  "branch-merged": "направление закрыто и влилось в веху основной линии",
  "branch-dead": "направление умерло на тупике",
  "branch-paused": "направление стоит на паузе",
  "branch-active": "направление живо",
  "branch-nested": "направление родилось из события другого направления",
  "branch-reopened": "узел открыт заново новым направлением после тупика",
  "open-problem": "проблема без решения",
  experiment: "эксперимент как событие",
};

export function validate(s: Snapshot): Report {
  const errors = validateSnapshot(s).map((i) => `${i.at}${i.field ? `.${i.field}` : ""}: ${i.message}`);
  const updates = s.entities.filter((e): e is Update => kindOf(e.id) === "update");
  const byId = new Map(s.entities.map((e) => [e.id as string, e]));
  const upd = (id: string) => (kindOf(id as Id) === "update" ? (byId.get(id) as Update | undefined) : undefined);
  const rels = (type: Relation["type"]) => s.relations.filter((r) => r.type === type);

  // Causality never runs backwards (compared at the coarser of the two precisions).
  const before = (a: string, b: string) => { const n = Math.min(a.length, b.length); return a.slice(0, n) <= b.slice(0, n); };
  for (const r of s.relations) {
    const f = upd(r.from), t = upd(r.to);
    if (!f || !t) continue;
    if (["caused_by", "supersedes", "answers"].includes(r.type) && !before(t.date, f.date)) errors.push(`${r.from} ${r.type} ${r.to}: goes back in time (${f.date} < ${t.date})`);
    if (r.type === "unlocks" && !before(f.date, t.date)) errors.push(`${r.from} unlocks ${r.to}: goes back in time`);
  }
  // Nothing published happens in a project after it is dropped or done.
  const byProject = new Map<string, Update[]>();
  for (const u of updates) if (u.project) byProject.set(u.project, [...(byProject.get(u.project) ?? []), u]);
  for (const [pid, own] of byProject) {
    const pub = own.filter((u) => u.visibility === "published").sort((a, b) => a.date.localeCompare(b.date));
    // Only the project's own line: a direction's status is not the project's.
    const end = pub.findIndex((u) => !u.branch && u.type !== "branch" && (u.status === "dropped" || u.status === "done"));
    if (end >= 0 && end < pub.length - 1) errors.push(`${pid}: updates after status ${pub[end].status}`);
  }

  // ---------- coverage ----------
  const answered = new Set(rels("answers").map((r) => r.to));
  const caused = new Set(rels("caused_by").map((r) => r.from));
  const statusAt = (pid: string) => byProject.get(pid)!.filter((u) => u.status && !u.branch && u.type !== "branch" && u.visibility === "published").sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.status;
  const ofType = (t: Update["type"]) => updates.filter((u) => u.type === t);
  const sc: Record<string, string[]> = {};

  sc.decision = ofType("decision").map((u) => u.id);
  sc.revision = rels("supersedes").filter((r) => upd(r.from)?.type === "decision" && upd(r.to)?.type === "decision").map((r) => r.from);
  sc.deadend = ofType("deadend").map((u) => u.id);
  sc["cross-project-unlock"] = rels("unlocks").filter((r) => upd(r.from)?.type === "deadend" && upd(r.to) && upd(r.from)!.project !== upd(r.to)!.project).map((r) => r.from);
  sc["open-question"] = ofType("question").filter((u) => !answered.has(u.id)).map((u) => u.id);
  sc["answered-question"] = ofType("question").filter((u) => answered.has(u.id)).map((u) => u.id);
  sc["unknown-cause"] = rels("relates_to")
    .filter((r) => upd(r.from)?.type === "question" && !answered.has(r.from) && upd(r.to) && !caused.has(r.to) && upd(r.to)!.type === "problem")
    .map((r) => r.to);
  sc["pause-resume"] = updates.filter((u) => u.status === "active" && rels("caused_by").some((r) => r.from === u.id && upd(r.to)?.status === "paused")).map((u) => u.id);
  sc["life-pause"] = updates.filter((u) => u.status === "paused" && rels("caused_by").some((r) => r.from === u.id && upd(r.to) && !upd(r.to)!.project)).map((u) => u.id);
  sc["still-paused"] = [...byProject.keys()].filter((pid) => statusAt(pid) === "paused");
  sc.dropped = [...byProject.keys()].filter((pid) => statusAt(pid) === "dropped");
  sc.merge = rels("derived_from").filter((r) => kindOf(r.from) === "project" && kindOf(r.to) === "project" && statusAt(r.to) === "done").map((r) => r.to);
  const research = s.entities.filter((e) => kindOf(e.id) === "research") as { id: string; conclusion?: unknown; unknowns?: unknown }[];
  sc["research-concluded"] = research.filter((r) => r.conclusion).map((r) => r.id);
  sc["research-open"] = research.filter((r) => !r.conclusion && r.unknowns).map((r) => r.id);
  sc["month-date"] = updates.filter((u) => u.date.length === 7).map((u) => u.id);
  sc["year-date"] = updates.filter((u) => u.date.length === 4).map((u) => u.id);
  sc["missing-en"] = updates.filter((u) => !u.body?.en || !u.title.en).map((u) => u.id);
  sc.draft = s.entities.filter((e) => e.visibility === "draft").map((e) => e.id);
  const artifacts = s.entities.filter((e) => kindOf(e.id) === "artifact") as { id: string; ref: string }[];
  sc["media-local"] = artifacts.filter((a) => !isUrl(a.ref)).map((a) => a.id);
  sc["media-url"] = artifacts.filter((a) => isUrl(a.ref)).map((a) => a.id);
  const targets = s.entities
    .filter((e): e is Chapter => kindOf(e.id) === "chapter")
    .flatMap((c) => c.pages.flatMap((p) => p.panels.flatMap((pn) => (pn.hotspots ?? []).map((h) => h.target as string))));
  sc["hotspot-entity"] = targets.filter((t) => !isUrl(t) && ["update", "project"].includes(kindOf(t as Id)));
  sc["hotspot-artifact"] = targets.filter((t) => !isUrl(t) && kindOf(t as Id) === "artifact");
  sc["hotspot-url"] = targets.filter((t) => isUrl(t));

  // Directions are read through the contract's own projection, exactly as the map reads them.
  const pub = publicView(s);
  const evo = s.entities.filter((e) => kindOf(e.id) === "project").map((e) => evolution(pub, e.id as Id<"project">)).filter((v) => !!v);
  const branches = evo.flatMap((v) => v!.branches);
  for (const st of ["merged", "dead", "paused", "active"] as const) sc[`branch-${st}`] = branches.filter((b) => b.status === st).map((b) => b.id);
  const lineOf = new Map(evo.flatMap((v) => v!.events.map((e) => [e.id as string, e.branch])));
  sc["branch-nested"] = branches.filter((b) => b.from && lineOf.get(b.from)).map((b) => b.id);
  sc["branch-reopened"] = branches.filter((b) => b.from && upd(b.from)?.type === "deadend").map((b) => b.id);
  sc["open-problem"] = ofType("problem").filter((u) => !answered.has(u.id)).map((u) => u.id);
  sc.experiment = ofType("experiment").map((u) => u.id);

  for (const k of Object.keys(SCENARIOS)) if (!sc[k]?.length) errors.push(`scenario missing: ${k} (${SCENARIOS[k]})`);
  return { errors, scenarios: sc };
}
