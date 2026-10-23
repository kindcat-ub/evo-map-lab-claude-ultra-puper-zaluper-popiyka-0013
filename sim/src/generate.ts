// Deterministic world simulator. Pure: no node imports, runs in the browser too.
// generate({ seed }) -> { snapshot, media }: a contracts Snapshot plus the list of
// media files the CLI renders. Same seed and options give byte-identical output.

import { createRng, type Rng } from "./rng.ts";
import { ARCHETYPES, AUTHORS, CODENAMES, LIFE_EVENTS, LITERARY, type Archetype, type Pair, type Part } from "./lexicon.ts";
import type {
  Artifact, Chapter, Entity, Id, Page, ProjectStatus, Relation, RelationType, Research, Snapshot, Text, Update, UpdateType,
} from "../../contracts/src/model.ts";

export const GENERATOR_VERSION = "sim/0.1.0";

export interface GenerateOptions {
  seed: string | number;
  until?: string | undefined; // last day of the simulated history, YYYY-MM-DD
  years?: number | undefined;
  projects?: number | undefined; // >= 5, the mandatory scenarios need that many
  chapters?: number | undefined;
}

// Instructions for the CLI to render a local media file. Not part of the source.
export type MediaSpec =
  | { kind: "photo"; path: string; seed: string }
  | { kind: "diagram"; path: string; seed: string; labels: string[] }
  | { kind: "audio"; path: string; seed: string }
  | { kind: "doc"; path: string; text: string }
  | { kind: "page"; path: string; seed: string; boxes: Box[] };

export interface GenerateResult {
  snapshot: Snapshot;
  media: MediaSpec[];
  author: Text; // the invented persona; the contract has no person entity
}

type Box = [x: number, y: number, w: number, h: number];

// What happened, in the simulation's own words. Mapped to the contract's
// UpdateType + status only at the very end.
type Beat =
  | "start" | "progress" | "milestone" | "decision" | "discovery" | "question" | "experiment"
  | "deadend" | "breakage" | "pause" | "resume" | "release" | "merge" | "abandon" | "life";

const BEAT_TO_UPDATE: Record<Beat, { type: UpdateType; status?: ProjectStatus }> = {
  start: { type: "note", status: "active" },
  progress: { type: "note" },
  milestone: { type: "milestone" },
  decision: { type: "decision" },
  discovery: { type: "discovery" },
  question: { type: "question" },
  experiment: { type: "note" },
  deadend: { type: "deadend" },
  breakage: { type: "note" },
  pause: { type: "note", status: "paused" },
  resume: { type: "note", status: "active" },
  release: { type: "milestone" },
  merge: { type: "note", status: "done" },
  abandon: { type: "note", status: "dropped" },
  life: { type: "note" },
};

// ---------- drafts: objects before ids exist ----------

interface ProjectDraft {
  idx: number;
  arch: Archetype;
  name: Pair;
  slug: string;
  start: number; // day offset
  end: number;
  question?: UpdateDraft;
  resumed?: number;
  tags: string[];
}

interface UpdateDraft {
  project: ProjectDraft | null;
  type: Beat;
  day: number;
  precision: "day" | "month" | "year";
  draft?: boolean;
  title: Text;
  summary: Text;
  part?: string | undefined; // RU part name, used by the arc logic only
  option?: Pair | undefined;
  id?: Id;
}

interface ResearchData {
  question: Text;
  hypothesis: Text;
  experiment?: Text;
  observations: Text[];
  conclusion?: Text | undefined;
  unknowns: Text[];
}
interface ResearchDraft { project: ProjectDraft; day: number; data: ResearchData; id?: Id }
interface ArtifactDraft {
  project: ProjectDraft | null;
  research?: ResearchDraft | undefined;
  title: Text;
  src: string;
  spec?: MediaSpec;
  draft?: boolean;
  id?: Id;
}
interface ChapterDraft { id: Id }

type Ref = UpdateDraft | ProjectDraft | ResearchDraft | ArtifactDraft | ChapterDraft;
interface RelDraft { from: Ref; to: Ref; type: RelationType }

const l = (p: Pair): Text => ({ ru: p[0], en: p[1] });
const q = (s: string) => `«${s}»`;

export function generate(opts: GenerateOptions): GenerateResult {
  const seed = String(opts.seed);
  const until = opts.until ?? "2026-10-01";
  const years = opts.years ?? 3;
  const nProjects = Math.max(5, Math.min(opts.projects ?? 7, CODENAMES.length));
  const span = Math.round(years * 365);

  const rWorld = createRng(seed).fork("world");
  const rText = createRng(seed).fork("text");
  const rMedia = createRng(seed).fork("media");

  const updates: UpdateDraft[] = [];
  const rels: RelDraft[] = [];
  const research: ResearchDraft[] = [];
  const artifacts: ArtifactDraft[] = [];
  const media: MediaSpec[] = [];
  const rel = (from: Ref, to: Ref, type: RelationType) => rels.push({ from, to, type });

  const addArtifact = (a: ArtifactDraft, about?: Ref) => {
    artifacts.push(a);
    if (about) rel(a, about, "relates_to");
    return a;
  };
  const mediaPath = (ext: string) => `media/${rMedia.hex(8)}.${ext}`;
  const localArtifact = (
    kind: "photo" | "diagram" | "audio" | "doc",
    project: ProjectDraft | null,
    title: Text,
    extra: { labels?: string[]; text?: string; research?: ResearchDraft } = {},
  ): ArtifactDraft => {
    const ext = { photo: "png", diagram: "png", audio: "wav", doc: "md" }[kind];
    const path = mediaPath(ext);
    const mseed = rMedia.hex(8);
    const spec: MediaSpec =
      kind === "diagram" ? { kind, path, seed: mseed, labels: extra.labels ?? [] }
      : kind === "doc" ? { kind, path, text: extra.text ?? title.ru! }
      : { kind, path, seed: mseed };
    return { project, research: extra.research, title, src: path, spec };
  };

  // ---------- author ----------
  const authorName = rWorld.pick(AUTHORS);

  // ---------- projects and roles ----------
  const archs = rWorld.shuffle(ARCHETYPES);
  const names = rWorld.shuffle(CODENAMES);
  const projects: ProjectDraft[] = [];
  for (let i = 0; i < nProjects; i++) {
    const arch = archs[i % archs.length];
    const name = names[i];
    projects.push({
      idx: i, arch, name,
      slug: name[1].toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      start: rWorld.int(0, Math.round(span * 0.55)),
      end: span - rWorld.int(0, 20),
      tags: arch.tags.slice(),
    });
  }
  // Roles: every mandatory cross-project scenario gets an owner.
  const order = rWorld.shuffle(projects);
  const donor = order[0]; // dead end here...
  const recipient = order[1]; // ...unlocks something here; also paused by a life event
  const abandoned = order[2];
  const mergeSrc = order[3];
  const mergeDst = order[4];
  const stillPaused = donor; // donor ends paused, no resume

  // Make the role timelines physically possible.
  donor.start = Math.min(donor.start, Math.round(span * 0.25));
  recipient.start = Math.min(recipient.start, Math.round(span * 0.3));
  mergeDst.start = Math.min(mergeDst.start, Math.round(span * 0.35));
  mergeSrc.start = Math.min(mergeSrc.start, Math.round(span * 0.3));
  mergeSrc.end = Math.round(span * 0.72);
  abandoned.end = Math.max(abandoned.start + 200, Math.round(span * rWorld.int(55, 85) / 100));
  donor.end = Math.round(span * 0.8);

  // ---------- life events ----------
  const lifePicks = rWorld.shuffle(LIFE_EVENTS).slice(0, 3);
  const pauseDay = recipient.start + Math.round((recipient.end - recipient.start) * 0.45);
  const lifeDrafts: UpdateDraft[] = lifePicks.map((p, i) => ({
    project: null, type: "life", precision: "day", draft: i === 2,
    day: i === 0 ? pauseDay - rWorld.int(3, 12) : rWorld.int(30, span - 30),
    title: l(p),
    summary: i === 0
      ? { ru: `${p[0]}. На проекты почти не остаётся времени.`, en: `${p[1]}. Almost no time left for projects.` }
      : { ru: `${p[0]}.`, en: `${p[1]}.` },
  }));
  updates.push(...lifeDrafts);


  // Steps each role must contain somewhere in its arc; the rest is random.
  type Flag = "revise" | "known-cause" | "unknown-cause" | "concluded" | "open" | "answer";
  interface Step { type: Beat; flag?: Flag }
  const mustSteps = new Map<ProjectDraft, Step[]>([
    [donor, [{ type: "decision" }, { type: "deadend" }]],
    [recipient, [{ type: "decision" }, { type: "decision", flag: "revise" }]],
    [abandoned, [{ type: "experiment", flag: "open" }, { type: "breakage", flag: "unknown-cause" }]],
    [mergeDst, [{ type: "question" }, { type: "experiment", flag: "concluded" }, { type: "discovery", flag: "answer" }]],
    [mergeSrc, [{ type: "decision" }, { type: "breakage", flag: "known-cause" }]],
  ]);

  function genArc(p: ProjectDraft) {
    const r = rWorld.fork(`arc/${p.slug}`);
    const t = rText.fork(`arc/${p.slug}`);
    const a = p.arch;
    const own: UpdateDraft[] = [];
    const push = (u: Omit<UpdateDraft, "project" | "precision"> & Partial<UpdateDraft>) => {
      const d: UpdateDraft = { project: p, precision: "day", ...u };
      own.push(d);
      updates.push(d);
      return d;
    };
    const decisions = new Map<Part, UpdateDraft>(); // latest decision per part
    const allDecisions: UpdateDraft[] = [];
    const deadDecisions = new Set<UpdateDraft>();
    const openQs: UpdateDraft[] = [];
    let lastAnchor: UpdateDraft;

    const oq = r.pick(a.questions);
    p.question = push({ type: "question", day: p.start, title: l(oq), summary: { ru: `Вопрос, с которого всё началось: ${oq[0]}`, en: `The question it all started with: ${oq[1]}` } });
    openQs.push(p.question);
    lastAnchor = push({
      type: "start", day: p.start,
      title: { ru: `Старт: ${p.name[0]}`, en: `Start: ${p.name[1]}` },
      summary: { ru: `${cap(a.noun[0])} под кодовым именем ${q(p.name[0])}.`, en: `A ${a.noun[1]} code-named ${p.name[1]}.` },
    });
    rel(lastAnchor, p.question, "caused_by");
    addArtifact({ project: p, title: { ru: `Репозиторий ${p.name[0]}`, en: `${p.name[1]} repository` }, src: `https://git.example.com/${p.slug}` }, lastAnchor);

    // Music projects always ship something, so the bundle always has audio to play.
    const must = [...(mustSteps.get(p) ?? []), ...(a.release === "audio" ? [{ type: "release" as Beat }] : [])];
    const budget = Math.max(r.int(9, 16), must.length * 3 + 2);
    const forcedAt = new Map(must.map((s, k) => [Math.floor(((k + 1) * budget) / (must.length + 1)), s]));
    let day = p.start;
    let paused = false;
    const avgGap = Math.max(6, (p.end - p.start) / (budget + 1));

    for (let i = 0; i < budget; i++) {
      const forced = forcedAt.get(i);
      // Forced steps squeeze the remaining time instead of falling off the end.
      const room = Math.max(4, Math.floor((p.end - day) / Math.max(1, budget - i)));
      const gap = r.int(Math.round(avgGap * 0.4), Math.round(avgGap * 1.6));
      day += forced ? Math.min(gap, room) : gap;
      if (day >= p.end && !forced) continue;

      if (p === recipient && !paused && day >= pauseDay) {
        paused = true;
        const pause = push({ type: "pause", day: pauseDay, title: { ru: "Пауза", en: "Paused" }, summary: { ru: "Проект отложен: жизнь победила.", en: "Project shelved: life won." } });
        rel(pause, lifeDrafts[0], "caused_by");
        day = pauseDay + r.int(90, 170);
        p.resumed = day;
        lastAnchor = push({ type: "resume", day, title: { ru: "Возвращение", en: "Back to it" }, summary: { ru: "Работа продолжается с того же места, с которого остановилась.", en: "Work picks up exactly where it stopped." } });
        rel(lastAnchor, pause, "caused_by");
        if (!forced) continue;
        day += r.int(3, 10);
      }

      const step: Step = forced ?? { type: r.weighted({ progress: 26, decision: 16, discovery: 10, question: 10, experiment: 9, deadend: 7, breakage: 9, release: 4 } as Record<Beat, number>) };
      let type = step.type;
      const failable = allDecisions.filter((d) => !deadDecisions.has(d) && decisions.get(a.parts.find((x) => x.name[0] === d.part)!) === d);
      if (type === "deadend" && !failable.length) type = "decision"; // nothing to fail yet
      let part = r.pick(a.parts);

      switch (type) {
        case "progress": {
          const ms = r.chance(0.35) ? r.pick(a.milestones) : null;
          const pn = part.name;
          const u = push({
            type: ms ? "milestone" : "progress", day,
            title: ms ? l(ms) : { ru: `Работа над узлом ${q(pn[0])}`, en: `Working on the ${pn[1]}` },
            summary: ms
              ? { ru: `Веха: ${ms[0]}.`, en: `Milestone: ${ms[1]}.` }
              : t.pick([
                  { ru: `Узел ${q(pn[0])} сдвинулся с места, без сюрпризов.`, en: `The ${pn[1]} moved forward, no surprises.` },
                  { ru: `Мелкие правки в узле ${q(pn[0])}; скучно, но нужно.`, en: `Small fixes to the ${pn[1]}; dull but necessary.` },
                  { ru: `Узел ${q(pn[0])} пересобран по итогам последних решений.`, en: `Rebuilt the ${pn[1]} after recent decisions.` },
                ]),
          });
          rel(u, decisions.get(part) ?? lastAnchor, "caused_by");
          if (r.chance(0.3)) {
            addArtifact(localArtifact("photo", p, { ru: `${p.name[0]}: ${pn[0]}`, en: `${p.name[1]}: ${pn[1]}` }), u);
          } else if (r.chance(0.2)) {
            addArtifact({ project: p, title: { ru: `Коммит: ${pn[0]}`, en: `Commit: ${pn[1]}` }, src: `https://git.example.com/${p.slug}/commit/${r.hex(10)}` }, u);
          }
          break;
        }
        case "decision": {
          if (step.flag === "revise") part = [...decisions.keys()].at(-1) ?? part;
          else {
            const undecided = a.parts.filter((x) => !decisions.has(x));
            if (undecided.length && r.chance(0.6)) part = r.pick(undecided);
          }
          // Deciding an already decided part is always a revision of the previous decision.
          const prev = decisions.get(part);
          const revise = !!prev;
          const opts = r.shuffle(part.options);
          const chosen = revise ? opts.find((o) => o !== prev!.option)! : opts[0];
          const rejected = revise ? prev!.option! : opts[1];
          const pn = part.name;
          const trigger = own.filter((u) => u.type === "breakage" && u.part === pn[0]).at(-1);
          const u = push({
            type, day, part: pn[0], option: chosen,
            title: { ru: `Решение: ${q(chosen[0])} вместо ${q(rejected[0])}`, en: `Decision: ${chosen[1]} over ${rejected[1]}` },
            summary: revise
              ? { ru: `Пересмотр прежнего решения по узлу ${q(pn[0])}. ${trigger ? "Старый вариант не пережил поломку." : "Новые данные перевесили."}`, en: `Revisiting the earlier ${pn[1]} decision. ${trigger ? "The old choice did not survive the breakage." : "New evidence tipped it."}` }
              : { ru: `Для узла ${q(pn[0])} выбрано ${q(chosen[0])}. Альтернатива ${q(rejected[0])} отложена, не выброшена.`, en: `${cap(chosen[1])} chosen for the ${pn[1]}. ${cap(rejected[1])} is parked, not discarded.` },
          });
          if (revise) rel(u, prev!, "supersedes");
          rel(u, trigger ?? lastAnchor, "caused_by");
          decisions.set(part, u);
          allDecisions.push(u);
          lastAnchor = u;
          if (r.chance(0.3)) addArtifact(localArtifact("diagram", p, { ru: `Схема: ${pn[0]}`, en: `Diagram: ${pn[1]}` }, { labels: [chosen[1], rejected[1], pn[1]] }), u);
          break;
        }
        case "discovery": {
          // The founding question is only answered by a release.
          const answerable = openQs.filter((x) => x !== p.question);
          const real = answerable.length && (step.flag === "answer" || r.chance(0.6)) ? r.pick(answerable) : null;
          if (real) {
            openQs.splice(openQs.indexOf(real), 1);
            part = a.parts.find((x) => x.name[0] === real.part) ?? part;
          }
          const pn = part.name;
          const u = push({
            type, day, part: pn[0],
            title: real ? { ru: `Ответ найден: ${pn[0]}`, en: `Answer found: ${pn[1]}` } : { ru: `Открытие в узле ${q(pn[0])}`, en: `Discovery in the ${pn[1]}` },
            summary: real
              ? { ru: `Ответ на ${q(real.title.ru ?? "")} нашёлся в узле ${q(pn[0])}, не там, где искали.`, en: `The answer to "${real.title.en ?? real.title.ru ?? ""}" was in the ${pn[1]}, not where anyone looked.` }
              : t.pick([
                  { ru: `Узел ${q(pn[0])} ведёт себя иначе, чем предполагалось.`, en: `The ${pn[1]} behaves differently than assumed.` },
                  { ru: `Побочный эффект в узле ${q(pn[0])} оказался полезным.`, en: `A side effect in the ${pn[1]} turned out useful.` },
                ]),
          });
          if (real) rel(u, real, "answers");
          rel(u, lastAnchor, "caused_by");
          break;
        }
        case "question": {
          const pr = r.pick(part.problems);
          const pn = part.name;
          const u = push({
            type, day, part: pn[0],
            title: { ru: `Вопрос: откуда ${q(pr[0])}?`, en: `Question: where does the ${pr[1]} come from?` },
            summary: { ru: `Пока непонятно, связано ли ${q(pr[0])} с узлом ${q(pn[0])}.`, en: `Unclear whether the ${pr[1]} is tied to the ${pn[1]}.` },
          });
          rel(u, lastAnchor, "caused_by");
          openQs.push(u);
          break;
        }
        case "experiment": {
          const [o1, o2] = r.shuffle(part.options);
          const pr = r.pick(part.problems);
          const pn = part.name;
          const concluded = step.flag === "concluded" || (step.flag !== "open" && r.chance(0.6));
          const held = r.chance(0.6);
          const rd: ResearchDraft = {
            project: p, day,
            data: {
              question: { ru: `Что сильнее влияет на ${q(pr[0])}: ${q(o1[0])} или ${q(o2[0])}?`, en: `What affects the ${pr[1]} more: ${o1[1]} or ${o2[1]}?` },
              hypothesis: { ru: `${cap(o1[0])} уменьшит ${q(pr[0])}.`, en: `${cap(o1[1])} will reduce the ${pr[1]}.` },
              experiment: { ru: `Два прогона на узле ${q(pn[0])}: ${q(o1[0])} и ${q(o2[0])}, остальное без изменений.`, en: `Two runs on the ${pn[1]}: ${o1[1]} vs ${o2[1]}, everything else fixed.` },
              observations: [
                t.pick([
                  { ru: `С вариантом ${q(o1[0])} эффект заметен.`, en: `With ${o1[1]} the effect is visible.` },
                  { ru: `С вариантом ${q(o1[0])} эффект слабый.`, en: `With ${o1[1]} the effect is weak.` },
                  { ru: `С вариантом ${q(o1[0])} эффект то есть, то нет.`, en: `With ${o1[1]} the effect comes and goes.` },
                ]),
                { ru: `С вариантом ${q(o2[0])} без изменений.`, en: `With ${o2[1]} nothing changes.` },
              ],
              conclusion: !concluded ? undefined : held
                ? { ru: "Гипотеза подтвердилась.", en: "The hypothesis held." }
                : { ru: "Гипотеза не подтвердилась.", en: "The hypothesis did not hold." },
              unknowns: concluded && r.chance(0.5) ? [] : [{ ru: `Не ясно, повторится ли эффект в другой сборке узла ${q(pn[0])}.`, en: `Unclear whether it repeats in another build of the ${pn[1]}.` }],
            },
          };
          research.push(rd);
          const u = push({
            type, day, part: pn[0],
            title: { ru: `Эксперимент: ${q(o1[0])} против ${q(o2[0])}`, en: `Experiment: ${o1[1]} vs ${o2[1]}` },
            summary: { ru: concluded ? "Эксперимент закончен, вывод записан." : "Эксперимент идёт, выводов нет.", en: concluded ? "Experiment done, conclusion recorded." : "Experiment running, no conclusion yet." },
          });
          rel(u, rd, "relates_to");
          const relatedQ = openQs.find((x) => x !== p.question && x.part === pn[0]);
          if (relatedQ) rel(rd, relatedQ, "relates_to");
          rel(u, lastAnchor, "caused_by");
          addArtifact(localArtifact("doc", p, { ru: `Журнал эксперимента: ${o1[0]} / ${o2[0]}`, en: `Experiment log: ${o1[1]} / ${o2[1]}` }, {
            research: rd,
            text: researchDoc(rd.data),
          }), u);
          break;
        }
        case "deadend": {
          const target = failable.at(-1)!;
          deadDecisions.add(target);
          part = a.parts.find((x) => x.name[0] === target.part)!;
          const opt = target.option!;
          const pr = r.pick(part.problems);
          const u = push({
            type, day, part: target.part, option: opt,
            title: { ru: `Тупик: ${q(opt[0])}`, en: `Dead end: ${opt[1]}` },
            summary: { ru: `${cap(opt[0])} упёрлось в ${q(pr[0])}. Этот путь закрыт, но понятно почему.`, en: `${cap(opt[1])} ran into the ${pr[1]}. This path is closed, but we know why.` },
          });
          rel(u, target, "caused_by");
          break;
        }
        case "breakage": {
          if (step.flag === "known-cause") part = [...decisions.keys()].at(-1) ?? part;
          const pr = r.pick(part.problems);
          const pn = part.name;
          const u = push({
            type, day, part: pn[0],
            title: { ru: `Сломалось: ${pr[0]}`, en: `Broke: ${pr[1]}` },
            summary: { ru: `В узле ${q(pn[0])} проявилось ${q(pr[0])}.`, en: `The ${pn[1]} shows the ${pr[1]}.` },
          });
          const cause = decisions.get(part);
          if (cause && step.flag !== "unknown-cause" && (step.flag === "known-cause" || r.chance(0.5))) {
            rel(u, cause, "caused_by");
          } else {
            // Unknown cause: no caused_by is invented, an open question records the gap.
            const why = push({
              type: "question", day: day + r.int(0, 3), part: pn[0],
              title: { ru: `Почему ${q(pr[0])}?`, en: `Why the ${pr[1]}?` },
              summary: { ru: "Причина не найдена. Не гадаем.", en: "Cause not found. Not guessing." },
            });
            rel(why, u, "relates_to");
            openQs.push(why);
          }
          break;
        }
        case "release": {
          const ms = r.pick(a.milestones);
          const ver = `${r.int(0, 1)}.${r.int(1, 9)}`;
          const u = push({
            type, day,
            title: { ru: `Выпуск: ${p.name[0]} ${ver}`, en: `Release: ${p.name[1]} ${ver}` },
            summary: { ru: `Выпущено: ${ms[0]}.`, en: `Shipped: ${ms[1]}.` },
          });
          rel(u, lastAnchor, "caused_by");
          addArtifact(localArtifact(a.release, p, { ru: `${p.name[0]}: выпуск ${ver}`, en: `${p.name[1]}: release ${ver}` }, { labels: [p.name[1], ver], text: `# ${p.name[0]} ${ver}\n\n${ms[0]}.\n` }), u);
          if (r.chance(0.5)) addArtifact({ project: p, title: { ru: `Видео: ${p.name[0]} ${ver}`, en: `Video: ${p.name[1]} ${ver}` }, src: `https://video.example.com/watch/${r.hex(11)}` }, u);
          if (openQs.includes(p.question!) && r.chance(0.5)) {
            rel(u, p.question!, "answers");
            openQs.splice(openQs.indexOf(p.question!), 1);
          }
          lastAnchor = u;
          break;
        }
      }
    }

    const lastDay = Math.max(...own.map((u) => u.day));
    if (p === abandoned) {
      const last = own.filter((u) => u.type === "deadend" || u.type === "breakage").at(-1) ?? lastAnchor;
      const u = push({ type: "abandon", day: lastDay + r.int(20, 60), title: { ru: "Проект закрыт", en: "Project abandoned" }, summary: { ru: "Дальше не идёт. Всё, что узнали, остаётся в истории.", en: "It goes no further. Everything learned stays in the history." } });
      rel(u, last, "caused_by");
    } else if (p === stillPaused) {
      push({ type: "pause", day: lastDay + r.int(15, 40), title: { ru: "Пауза", en: "Paused" }, summary: { ru: "Отложено. Причина не записана.", en: "Shelved. No reason recorded." } });
    }
  }

  for (const p of projects) genArc(p);

  // ---------- cross-project scenarios ----------
  // Dead end in donor unlocks a move in recipient.
  const dead = updates.filter((u) => u.project === donor && u.type === "deadend").at(-1)!;
  {
    let day = Math.max(dead.day + rWorld.int(20, 60), recipient.start + 10);
    if (day >= pauseDay && day <= (recipient.resumed ?? pauseDay)) day = (recipient.resumed ?? pauseDay) + rWorld.int(3, 15);
    const part = rWorld.pick(recipient.arch.parts).name;
    const u: UpdateDraft = {
      project: recipient, type: "discovery", day, precision: "day", part: part[0],
      title: { ru: `Чужой тупик пригодился: ${part[0]}`, en: `Someone else's dead end helped: ${part[1]}` },
      summary: { ru: `То, что не сработало в ${q(donor.name[0])}, решило проблему узла ${q(part[0])} здесь.`, en: `What failed in ${donor.name[1]} solved the ${part[1]} problem here.` },
    };
    updates.push(u);
    rel(dead, u, "unlocks");
  }
  // Merge.
  {
    const srcLast = Math.max(...updates.filter((u) => u.project === mergeSrc).map((u) => u.day));
    const day = srcLast + rWorld.int(10, 30);
    const m: UpdateDraft = {
      project: mergeSrc, type: "merge", day, precision: "day",
      title: { ru: `Слияние с ${mergeDst.name[0]}`, en: `Merged into ${mergeDst.name[1]}` },
      summary: { ru: `Отдельно жить незачем: всё полезное переезжает в ${q(mergeDst.name[0])}.`, en: `No reason to live apart: everything useful moves into ${mergeDst.name[1]}.` },
    };
    const d: UpdateDraft = {
      project: mergeDst, type: "progress", day: day + rWorld.int(1, 7), precision: "day",
      title: { ru: `Принято наследство ${mergeSrc.name[0]}`, en: `Took in ${mergeSrc.name[1]}` },
      summary: { ru: `Наработки ${q(mergeSrc.name[0])} теперь живут здесь.`, en: `${mergeSrc.name[1]}'s work now lives here.` },
    };
    updates.push(m, d);
    rel(d, m, "caused_by");
    rel(mergeDst, mergeSrc, "derived_from"); // contract rule: merge = status done + dst derived_from src
  }

  // ---------- ordering, fuzzy dates, ids ----------
  const seq = new Map(updates.map((u, i) => [u, i]));
  updates.sort((x, y) => x.day - y.day || seq.get(x)! - seq.get(y)!);

  // Month-only and year-only dates, only on updates that relations can still place.
  const anchored = new Set<Ref>();
  for (const r of rels) { anchored.add(r.from); anchored.add(r.to); }
  const fz = rWorld.shuffle(updates.filter((u) => u.project && (u.type === "progress" || u.type === "discovery") && anchored.has(u)));
  fz.slice(0, 1).forEach((u) => (u.precision = "year"));
  fz.slice(1, 1 + Math.max(2, Math.round(fz.length * 0.08))).forEach((u) => (u.precision = "month"));

  // Missing EN is a real state: drop some EN summaries.
  const rGap = rWorld.fork("en-gaps");
  for (const u of updates) if (u.type !== "start" && rGap.chance(0.07)) delete u.summary.en;

  // A note that never passed review: exists in the source, invisible to public projections.
  {
    const p = rWorld.pick(projects);
    const last = updates.filter((u) => u.project === p).at(-1)!;
    const d: UpdateDraft = {
      project: p, type: "progress", day: last.day, precision: "day", draft: true,
      title: { ru: "Черновик: мысли вслух", en: "Draft: thinking out loud" },
      summary: { ru: "Сырые заметки, не прошли проверку.", en: "Raw notes, not reviewed." },
    };
    updates.splice(updates.indexOf(last), 0, d); // before the last one, so drafts never set status
  }

  const counters = new Map<string, number>();
  for (const u of updates) {
    const key = u.project?.slug ?? "life";
    const n = (counters.get(key) ?? 0) + 1;
    counters.set(key, n);
    u.id = `update:${key}-${String(n).padStart(3, "0")}`;
  }
  research.forEach((rd, i) => (rd.id = `research:${rd.project.slug}-${String(i + 1).padStart(2, "0")}`));

  const dateOf = (day: number, precision: UpdateDraft["precision"] = "day"): string => {
    const iso = addDays(until, day - span);
    return precision === "year" ? iso.slice(0, 4) : precision === "month" ? iso.slice(0, 7) : iso;
  };
  const projectId = (p: ProjectDraft): Id<"project"> => `project:${p.slug}`;

  // ---------- manga ----------
  const chapters = genManga();

  function genManga(): Chapter[] {
    const r = rWorld.fork("manga");
    const out: Chapter[] = [];
    const nCh = Math.max(1, opts.chapters ?? 3);
    // Recipient first: it carries the life event, the pause and the borrowed dead end.
    const picks = [recipient, ...r.shuffle(projects.filter((p) => p !== recipient))].slice(0, nCh);
    const urlTargets = artifacts.filter((a) => a.src.startsWith("https://"));
    let needUrl = true, needArtifact = true;
    const attachedTo = (u: UpdateDraft) => artifacts.find((a) => rels.some((x) => x.from === a && x.to === u));

    picks.forEach((p, ci) => {
      const ch: ChapterDraft = { id: `chapter:${String(ci + 1).padStart(2, "0")}` };
      const keyBeats: Beat[] = ["start", "decision", "deadend", "breakage", "discovery", "pause", "resume", "release", "milestone", "abandon", "merge"];
      const beats = updates.filter((u) => !u.draft && ((u.project === p && keyBeats.includes(u.type)) || (p === recipient && u === lifeDrafts[0]))).slice(0, 12);
      beats.forEach((b) => rel(ch, b, "derived_from"));

      const pages: Page[] = [];
      const perPage = 3;
      for (let pi = 0; pi * perPage < beats.length && pi < 6; pi++) {
        const pageBeats = beats.slice(pi * perPage, pi * perPage + perPage);
        const boxes = layoutPage(r, pageBeats.length + (r.chance(0.5) ? 1 : 0));
        const path = mediaPath("png");
        media.push({ kind: "page", path, seed: r.hex(8), boxes });
        const page: Page = { image: path, panels: [] };
        boxes.forEach(([x, y, w, h], k) => {
          const beat = pageBeats[k];
          const panel: Page["panels"][number] = { region: { x, y, w, h }, text: beat ? literary(r, beat) : l(r.pick(LITERARY)) };
          const hs: { icon: string; target: string }[] = [];
          if (beat) {
            if (k === 0 || r.chance(0.55)) hs.push({ icon: iconFor(beat.type), target: `@u:${updates.indexOf(beat)}` });
            if (k === 0 && pi === 0) hs.push({ icon: "project", target: projectId(p) });
            const att = attachedTo(beat);
            if (att && (needArtifact || r.chance(0.5))) {
              hs.push({ icon: iconForSrc(att.src), target: `@a:${artifacts.indexOf(att)}` });
              needArtifact = false;
            }
          }
          if (hs.length) panel.hotspots = hs as never;
          page.panels.push(panel);
        });
        pages.push(page);
      }
      const first = pages[0]?.panels[0];
      if (needArtifact && first) {
        const att = artifacts.find((a) => a.project === p && !a.draft);
        if (att) {
          (first.hotspots ??= []).push({ icon: iconForSrc(att.src), target: `@a:${artifacts.indexOf(att)}` as never });
          needArtifact = false;
        }
      }
      const lastPanel = pages.at(-1)?.panels.at(-1);
      if (needUrl && urlTargets.length && lastPanel) {
        (lastPanel.hotspots ??= []).push({ icon: "link", target: urlTargets[0].src as never });
        needUrl = false;
      }
      out.push({
        id: ch.id as Id<"chapter">, visibility: "published", number: ci + 1,
        title: { ru: `Глава ${ci + 1}. ${p.name[0]}`, en: `Chapter ${ci + 1}. ${p.name[1]}` },
        summary: { ru: `Вольный пересказ истории ${q(p.name[0])}. Это интерпретация, а не хроника.`, en: `A free retelling of ${p.name[1]}. An interpretation, not a chronicle.` },
        date: dateOf(Math.min(span, (beats.at(-1)?.day ?? p.start) + 14)),
        pages,
      });
    });
    return out;
  }

  // A draft artifact: a photo that did not pass review.
  {
    const p = rWorld.pick(projects);
    const a = localArtifact("photo", p, { ru: "Снимок на проверке", en: "Photo under review" });
    a.draft = true;
    artifacts.push(a);
  }

  // ---------- resolve ids and assemble the snapshot ----------
  artifacts.forEach((a, i) => (a.id = `artifact:${a.project?.slug ?? "misc"}-${String(i + 1).padStart(3, "0")}`));
  for (const a of artifacts) if (a.spec) media.push(a.spec);
  const idOf = (ref: Ref): Id => ("idx" in ref ? projectId(ref) : ref.id!);
  for (const ch of chapters) for (const pg of ch.pages) for (const pn of pg.panels) for (const h of pn.hotspots ?? []) {
    const t = h.target as string;
    if (t.startsWith("@u:")) h.target = updates[Number(t.slice(3))].id!;
    if (t.startsWith("@a:")) h.target = artifacts[Number(t.slice(3))].id!;
  }
  const dayOfArtifact = (a: ArtifactDraft) => {
    const about = rels.find((x) => x.from === a && "day" in x.to);
    return about ? (about.to as UpdateDraft).day : undefined;
  };
  const joinList = (items: Text[]): Text | undefined => {
    if (!items.length) return undefined;
    const t: Text = { ru: items.map((i) => `- ${i.ru}`).join("\n") };
    if (items.every((i) => i.en)) t.en = items.map((i) => `- ${i.en}`).join("\n");
    return t;
  };

  const entities: Entity[] = [
    ...projects.map((p) => ({
      id: projectId(p), visibility: "published" as const,
      title: l(p.name),
      summary: { ru: `${cap(p.arch.noun[0])}.`, en: `${cap(p.arch.noun[1])}.` },
      started: dateOf(p.start),
      question: p.question!.id as Id<"update">,
      tags: p.tags,
    })),
    ...updates.map((u): Update => {
      const m = BEAT_TO_UPDATE[u.type];
      return {
        id: u.id as Id<"update">, visibility: u.draft ? "draft" : "published",
        date: dateOf(u.day, u.precision),
        ...(u.project ? { project: projectId(u.project) as Id<"project"> } : {}),
        type: m.type,
        ...(m.status ? { status: m.status } : {}),
        title: u.title, body: u.summary,
      };
    }),
    ...research.map((rd): Research => {
      const obs = joinList(rd.data.observations), unk = joinList(rd.data.unknowns);
      return {
        id: rd.id as Id<"research">, visibility: "published",
        project: projectId(rd.project),
        date: dateOf(rd.day),
        question: rd.data.question, hypothesis: rd.data.hypothesis,
        ...(rd.data.experiment ? { experiment: rd.data.experiment } : {}),
        ...(obs ? { observations: obs } : {}),
        ...(rd.data.conclusion ? { conclusion: rd.data.conclusion } : {}),
        ...(unk ? { unknowns: unk } : {}),
      };
    }),
    ...artifacts.map((a): Artifact => {
      const day = dayOfArtifact(a);
      const mime = mimeOf(a.src);
      return {
        id: a.id as Id<"artifact">, visibility: a.draft ? "draft" : "published",
        ref: a.src, title: a.title,
        ...(mime ? { mime } : {}),
        ...(a.project ? { project: projectId(a.project) as Id<"project"> } : {}),
        ...(a.research ? { research: a.research.id as Id<"research"> } : {}),
        ...(day !== undefined ? { date: dateOf(day) } : {}),
      };
    }),
    ...chapters,
  ];
  const relations: Relation[] = rels.map((r) => ({ from: idOf(r.from), type: r.type, to: idOf(r.to) }));
  // Drop undefined keys so JSON output is stable and minimal.
  const snapshot = JSON.parse(JSON.stringify({ schema: 1, revision: 1, entities, relations })) as Snapshot;
  return { snapshot, media, author: l(authorName) };
}

// ---------- helpers ----------

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function mimeOf(src: string): string | undefined {
  if (/^https?:/.test(src)) return undefined; // unknown, and not invented
  return ({ png: "image/png", wav: "audio/wav", md: "text/markdown" } as Record<string, string>)[src.split(".").pop()!];
}

function researchDoc(d: ResearchData): string {
  const lines = [`# ${d.question.ru}`, "", `Гипотеза: ${d.hypothesis.ru}`, ""];
  if (d.experiment) lines.push(`Эксперимент: ${d.experiment.ru}`, "");
  lines.push("Наблюдения:", ...d.observations.map((o) => `- ${o.ru}`), "");
  lines.push(d.conclusion ? `Вывод: ${d.conclusion.ru}` : "Вывода нет.", "");
  if (d.unknowns.length) lines.push("Неизвестно:", ...d.unknowns.map((u) => `- ${u.ru}`), "");
  return lines.join("\n");
}

// Icon names are the frontend's vocabulary; an unknown one falls back to a default.
function iconFor(t: Beat): string {
  return ({ question: "question", decision: "decision", deadend: "deadend" } as Partial<Record<Beat, string>>)[t] ?? "doc";
}

function iconForSrc(src: string): string {
  if (/^https?:/.test(src)) return "link";
  if (src.endsWith(".wav")) return "music";
  if (src.endsWith(".png")) return "image";
  return "doc";
}

function literary(r: Rng, u: UpdateDraft): Text {
  const lines: Partial<Record<Beat, Pair[]>> = {
    start: [["Всё начинается с вопроса, на который нет ответа.", "It all starts with a question that has no answer."]],
    decision: [["Выбор сделан. Второй вариант остаётся лежать на столе.", "The choice is made. The other option stays on the table."]],
    deadend: [["Это не сработает. И это тоже ответ.", "This won't work. That is an answer too."]],
    breakage: [["Что-то щёлкнуло — и стало тихо.", "Something clicked, and then silence."]],
    discovery: [["Ответ был не там, где его искали.", "The answer was not where anyone looked."]],
    pause: [["Мастерская закрыта. Пыль ложится ровно.", "The workshop is closed. Dust settles evenly."]],
    resume: [["Свет снова горит, инструменты на тех же местах.", "The light is back on, the tools where they were left."]],
    life: [["Жизнь заходит без стука.", "Life walks in without knocking."]],
    release: [["Готово. Страшно отпускать.", "Done. Scary to let go."]],
    milestone: [["Маленькая победа. Никто не видел, но она была.", "A small win. Nobody saw it, but it happened."]],
    abandon: [["Дверь закрывается тихо.", "The door closes quietly."]],
    merge: [["Две дороги становятся одной.", "Two roads become one."]],
  };
  return l(r.pick(lines[u.type] ?? LITERARY));
}

function layoutPage(r: Rng, n: number): Box[] {
  const m = 0.04, g = 0.02;
  const count = Math.max(2, Math.min(5, n));
  const rows = count <= 3 ? count : count - 2; // 4 -> 2 rows, 5 -> 3 rows
  const out: Box[] = [];
  const h = (1 - 2 * m - (rows - 1) * g) / rows;
  let left = count;
  for (let row = 0; row < rows; row++) {
    const cols = left > rows - row ? 2 : 1;
    left -= cols;
    const y = m + row * (h + g);
    if (cols === 1) out.push([m, y, 1 - 2 * m, h]);
    else {
      const split = 0.35 + r.next() * 0.3;
      const w = 1 - 2 * m - g;
      out.push([m, y, w * split, h], [m + w * split + g, y, w * (1 - split), h]);
    }
  }
  return out.map((b) => b.map((v) => Math.round(v * 1000) / 1000) as Box);
}
