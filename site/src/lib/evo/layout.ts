// Раскладка Evolution Map: EvolutionView (смысл) → координаты (рендер).
// Геометрия живёт только здесь и только на время показа. В данные она не возвращается.

import type { EvoBranch, EvoEvent, EvolutionView, Id, UpdateType } from '$contracts';

export type Mode = 'spine' | 'metro';
/** 0 Spine, 1 Branches, 2 Events, 3 Detail. */
export type Zoom = 0 | 1 | 2 | 3;
export const ZOOMS: readonly Zoom[] = [0, 1, 2, 3];

export interface PNode {
	id: Id<'update'>;
	x: number;
	y: number;
	type: UpdateType;
	event: EvoEvent;
	/** Веха основной линии. */
	state: boolean;
	/** Ярус подписи вехи: соседние вехи не налезают друг на друга. */
	tier: number;
}

export interface PBranch {
	b: EvoBranch;
	y: number;
	/** Рождение → корень → последнее событие (→ слияние). */
	path: string;
	/** Пунктир «продолжается» у живых направлений живого проекта. */
	tail?: { x1: number; x2: number };
	/** Чем кончается: × у мёртвого, ‖ у паузы, | у закрытого без вехи. */
	end?: { x: number; mark: 'dead' | 'paused' | 'done' };
	birth: { x: number; y: number };
	/** Куда ставить имя направления. */
	label: { x: number; y: number };
	/** Свёрнутый блок для Metro на уровнях 0–1. */
	card?: { x: number; y: number; w: number; h: number };
	/** Где сворачивается на уровне Spine: точка рождения на основной линии. */
	fold: number;
}

export interface Layout {
	width: number;
	height: number;
	/** Смещение по y, чтобы всё было в положительных координатах. */
	spineY: number;
	nodes: PNode[];
	node: Map<string, PNode>;
	branches: PBranch[];
	branch: Map<string, PBranch>;
	/** done — до последнего события основной линии сплошная, дальше пунктир к «сейчас». */
	spine: { x1: number; current: number; done: number; x2: number };
	/** Колонки по времени: для таймлайна и прокрутки к дате. */
	cols: { x: number; date: string }[];
}

const STEP = [30, 42, 60, 120];
const LANE = [40, 56, 72, 92];
const ROW = [34, 36, 52, 70];
const PAD_X = 80;

export function layout(v: EvolutionView, mode: Mode, zoom: Zoom): Layout {
	const step = STEP[zoom];
	const rootDate = new Map(v.branches.map((b) => [b.id as string, b.date]));
	// Событие направления не может оказаться левее его корня, даже с неточной датой.
	type Item = { id: string; date: string; key: string; root: boolean };
	const items: Item[] = [
		...v.branches.map((b) => ({ id: b.id, date: b.date, key: b.date, root: true })),
		...v.events.map((e) => {
			const r = e.branch ? rootDate.get(e.branch) : undefined;
			return { id: e.id, date: e.date, key: r && r > e.date ? r : e.date, root: false };
		})
	].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.root !== b.root ? (a.root ? -1 : 1) : a.id.localeCompare(b.id)));
	const x = new Map<string, number>();
	items.forEach((it, i) => x.set(it.id, PAD_X + i * step));
	const lastX = PAD_X + Math.max(0, items.length - 1) * step;
	const live = v.status === 'active';
	const right = lastX + (live ? Math.max(120, step * 2) : 60);

	// ---------- линии по вертикали ----------
	const lineOf = new Map<string, string | undefined>(v.events.map((e) => [e.id, e.branch]));
	const laneY = new Map<string, number>(); // branch id → y относительно основной линии
	const birthX = (b: EvoBranch) => (b.from ? (x.get(b.from) ?? PAD_X) : PAD_X);
	const endX = (b: EvoBranch) => {
		const last = x.get(b.events.at(-1) ?? b.id)!;
		if (b.status === 'merged' && b.into) return Math.max(x.get(b.into)!, last + 30);
		if (b.status === 'active' && live) return right;
		return last + 30;
	};
	const order = [...v.branches].sort((a, b) => birthX(a) - birthX(b) || x.get(a.id)! - x.get(b.id)!);
	if (mode === 'spine') {
		const taken = new Map<number, [number, number][]>();
		const free = (lane: number, a: number, z: number) => !(taken.get(lane) ?? []).some(([s, e]) => a < e + 24 && z > s - 24);
		for (const b of order) {
			const a = birthX(b), z = endX(b);
			// Вложенное направление растёт в ту же сторону, что и родитель.
			const parent = b.from ? lineOf.get(b.from) : undefined;
			const side = parent ? Math.sign(laneY.get(parent) ?? -1) : 0;
			let lane = 0;
			for (let k = 1; !lane; k++) {
				const tries = side ? [side * k] : [-k, k];
				lane = tries.find((t) => free(t, a, z)) ?? 0;
			}
			taken.set(lane, [...(taken.get(lane) ?? []), [a, z]]);
			laneY.set(b.id, lane * LANE[zoom]);
		}
	} else {
		order.forEach((b, k) => laneY.set(b.id, -(k + 1) * ROW[zoom]));
	}
	const yOf = (line: string | undefined) => (line ? laneY.get(line) ?? 0 : 0);

	// ---------- узлы ----------
	const nodes: PNode[] = v.events.map((e) => ({
		id: e.id,
		x: x.get(e.id)!,
		y: yOf(e.branch),
		type: e.type,
		event: e,
		state: e.type === 'milestone' && !e.branch,
		tier: 0
	}));
	// Подпись вехи ~6.5px на букву; если не влезает рядом с предыдущей, поднимается на ярус выше.
	let prev: { x: number; w: number; tier: number } | undefined;
	for (const n of nodes) {
		if (!n.state) continue;
		const w = Math.min(18, (n.event.title.ru ?? n.event.title.en ?? '').length) * 7.5;
		n.tier = prev && n.x - w / 2 < prev.x + prev.w / 2 + 8 ? (prev.tier + 1) % 3 : 0;
		prev = { x: n.x, w, tier: n.tier };
	}

	// ---------- пути направлений ----------
	const branches: PBranch[] = order.map((b) => {
		const ly = laneY.get(b.id)!;
		const bx = birthX(b);
		const by = b.from ? yOf(lineOf.get(b.from)) : 0;
		const rx = Math.max(x.get(b.id)!, bx + 30);
		const lx = Math.max(x.get(b.events.at(-1) ?? b.id)!, rx);
		let path: string;
		const r = Math.min(14, Math.abs(ly - by) / 2);
		if (mode === 'spine') {
			const mx = (bx + rx) / 2;
			path = `M${bx} ${by} C${mx} ${by} ${mx} ${ly} ${rx} ${ly} L${lx} ${ly}`;
		} else {
			const dir = Math.sign(ly - by) || -1;
			path = `M${bx} ${by} V${ly - dir * r} Q${bx} ${ly} ${bx + r} ${ly} L${lx} ${ly}`;
		}
		const pb: PBranch = { b, y: ly, path, birth: { x: bx, y: by }, label: { x: rx + 6, y: ly - 9 }, fold: foldX(b) };
		if (b.status === 'merged' && b.into) {
			const ix = Math.max(x.get(b.into)!, lx + 30);
			if (mode === 'spine') {
				const mx = (lx + ix) / 2;
				pb.path += ` C${mx} ${ly} ${mx} 0 ${ix} 0`;
			} else {
				const dir = Math.sign(-ly) || 1;
				pb.path += ` L${ix - r} ${ly} Q${ix} ${ly} ${ix} ${ly + dir * r} V0`;
			}
		} else if (b.status === 'active') {
			if (live) pb.tail = { x1: lx, x2: right };
		} else {
			pb.end = { x: lx + 18, mark: b.status === 'dead' ? 'dead' : b.status === 'paused' ? 'paused' : 'done' };
			pb.path += ` L${lx + 18} ${ly}`;
		}
		if (mode === 'metro') pb.card = { x: rx, y: ly - 14, w: Math.max(150, step * 3), h: 28 };
		if (mode === 'metro') pb.label = { x: bx + r + 8, y: ly - 9 };
		return pb;
	});

	function foldX(b: EvoBranch): number {
		// Свернуть к точке на основной линии: у вложенного — к точке рождения предка.
		let cur: EvoBranch | undefined = b;
		const seen = new Set<string>();
		while (cur?.from && lineOf.get(cur.from) && !seen.has(cur.id)) {
			seen.add(cur.id);
			const pid: string = lineOf.get(cur.from)!;
			cur = v.branches.find((z) => z.id === pid);
		}
		return cur ? birthX(cur) : birthX(b);
	}

	// ---------- границы ----------
	const ys = [0, ...laneY.values()];
	const pad = zoom === 3 ? 70 : 50;
	const top = Math.min(...ys) - pad - (mode === 'metro' && zoom <= 1 ? 10 : 0);
	const bottom = Math.max(...ys) + pad + 20;
	const states = nodes.filter((n) => n.state);
	const current = v.current ? x.get(v.current)! : PAD_X;
	return {
		width: right + 40 + (zoom === 3 ? 160 : 60),
		height: bottom - top,
		spineY: -top,
		nodes,
		node: new Map(nodes.map((n) => [n.id, n])),
		branches,
		branch: new Map(branches.map((b) => [b.b.id, b])),
		spine: { x1: Math.min(PAD_X, states[0]?.x ?? PAD_X) - 30, current, done: Math.max(current, ...nodes.filter((n) => !n.event.branch).map((n) => n.x)), x2: right },
		cols: items.map((it) => ({ x: x.get(it.id)!, date: it.date }))
	};
}

/** PartialDate → миллисекунды начала периода. */
export function dateMs(d: string): number {
	const [y, m = '01', day = '01'] = d.slice(0, 10).split('-');
	return Date.UTC(Number(y), Number(m) - 1, Number(day));
}
