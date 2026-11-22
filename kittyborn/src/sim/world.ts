import { BUILDINGS, PADS, HEART, EDGE, GROVE, WILDS, ROAD_Y, type BuildingType, type CatRole, type Cost, type EnemyKind, type ItemId, type PadDef } from '../content/data';

export type Inv = Partial<Record<ItemId, number>>;
export interface P { x: number; y: number }

export interface Hero {
  x: number; y: number; vx: number; vy: number; face: number; walkT: number; moving: boolean;
  stack: ItemId[]; hp: number; inv: number; hurtT: number; regenT: number; dead: number;
  swingT: number; swing: number; form: 'axe' | 'saw';
}
export interface Tree {
  id: number; x: number; y: number; kind: 'oak' | 'pine' | 'lav'; zone: 'edge' | 'grove';
  hp: number; maxHp: number; logs: number; alive: boolean; regrow: number; grow: number; shake: number; s: number; claimedBy: number;
}
export interface Building {
  id: string; type: BuildingType; x: number; y: number; level: number; spec: string | null;
  hp: number; maxHp: number;
  store: Inv;      // storage contents / production output
  input: Inv;      // production input buffer
  reserved: Inv;   // amounts promised to carriers taking from here
  incoming: Inv;   // amounts promised by carriers bringing here
  t: number; builtAt: number; role?: CatRole; gap?: string; status: string; fireT: number;
}
export interface PadState { def: PadDef; paid: number; items: Inv; incoming: Inv }
export type TaskKind = 'haul' | 'harvest' | 'repair' | 'post' | 'home' | 'hunt';
export interface Task {
  kind: TaskKind; item?: ItemId; from?: string; to?: string; n: number; stage: 'toSource' | 'toTarget' | 'work';
  tree?: number; target?: number; x?: number; y?: number;
}
export interface Cat {
  id: number; role: CatRole; home: string; x: number; y: number; face: number; walkT: number; moving: boolean;
  stack: ItemId[]; task: Task | null; idle: string; swingT: number; swing: number; waitT: number;
  stuckT: number; lx: number; ly: number; hidden: boolean;
}
export interface Enemy {
  id: number; kind: EnemyKind; x: number; y: number; z: number; vz: number; hp: number; maxHp: number; r: number;
  wp: P[]; wpI: number; atkCd: number; flash: number; kx: number; ky: number; face: number; walkT: number; moving: boolean;
  passive: boolean; aggro: number; wx: number; wy: number; wt: number;
  boss?: { state: 'drop' | 'walk' | 'tele' | 'jump'; t: number; tx: number; ty: number; sx: number; sy: number; slams: number };
}
export interface Ground { id: number; type: ItemId; x: number; y: number; z: number; vz: number; age: number }
export interface Shot { id: number; x: number; y: number; target: number; dmg: number; from: string }
export type GameEvent =
  | { t: 'fly'; item: ItemId | 'coin'; fx: number; fy: number; fz: number; to: 'hero' | number | P; tz?: number }
  | { t: 'chop' | 'fell' | 'hit' | 'poof' | 'build' | 'hurt' | 'slam' | 'coin' | 'pick' | 'drop' | 'pay' | 'upgrade' | 'shot' | 'wallHit' | 'lanternOut'; x: number; y: number; v?: number; kind?: string }
  | { t: 'text'; x: number; y: number; s: string; color?: string; size?: number }
  | { t: 'bubble'; who: 'owl' | number; s: string }
  | { t: 'toast'; title: string; body: string }
  | { t: 'dead' | 'respawn' | 'nightStart' | 'nightWin' | 'nightLose' | 'bossIn' | 'bossDown' };

export interface World {
  version: number;
  time: number; coins: number; nextId: number;
  hero: Hero; trees: Tree[]; buildings: Record<string, Building>; pads: Record<string, PadState>;
  cats: Cat[]; enemies: Enemy[]; ground: Ground[]; shots: Shot[];
  up: { bag: number; axe: number; boots: number; heart: number; mint: number };
  night: { phase: 'day' | 'night'; n: number; t: number; queue: { at: number; kind: EnemyKind; from: string }[]; reward: number; title: string; dark: number };
  flags: Record<string, boolean>;
  stats: { earned: number; felled: number; hunted: number; nights: number; bosses: number };
  events: GameEvent[];
}

// ---------------------------------------------------------------- derived stats
export const heroCap = (w: World) => 10 + w.up.bag * 6;
export const heroSpeed = (w: World) => 185 * (1 + w.up.boots * 0.12);
export const heroDmg = (w: World) => 1 + w.up.axe * 0.6;
export const heroSwing = (w: World) => 0.42 * Math.pow(0.92, w.up.axe);
export const heroMaxHp = (w: World) => 5 + w.up.heart;
export const catCap = (w: World, c: Cat) => (c.role === 'hauler' ? 8 : 6) + w.up.mint * 2;
export const catSpeed = (w: World) => 125 * (1 + w.up.mint * 0.12);

export function levelStats(b: Building): Record<string, number> {
  const def = BUILDINGS[b.type];
  const lv = def.levels ? def.levels[Math.min(b.level, def.levels.length) - 1].stats : {};
  const spec = b.spec && def.specs ? def.specs.find(s => s.id === b.spec)?.stats : undefined;
  return { ...lv, ...(spec || {}) };
}

// ---------------------------------------------------------------- inventory helpers
export const invGet = (i: Inv, k: ItemId) => i[k] || 0;
export const invAdd = (i: Inv, k: ItemId, n: number) => { i[k] = Math.max(0, (i[k] || 0) + n); };
export const invTotal = (i: Inv) => Object.values(i).reduce((a, b) => a + (b || 0), 0);
export const available = (b: Building, k: ItemId) => invGet(b.store, k) - invGet(b.reserved, k);

export function storageCap(b: Building) { return levelStats(b).cap || 0; }
export function storageFree(b: Building) { return storageCap(b) - invTotal(b.store) - invTotal(b.incoming); }

export function costItems(c: Cost): [ItemId, number][] {
  return (Object.keys(c) as (keyof Cost)[]).filter(k => k !== 'coins' && (c[k] || 0) > 0).map(k => [k as ItemId, c[k] as number]);
}

// ---------------------------------------------------------------- creation
function srand(s: number) { return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

export function makeBuilding(w: World, id: string, type: BuildingType, x: number, y: number, extra: Partial<Building> = {}): Building {
  const def = BUILDINGS[type];
  const hp = def.levels?.[0].stats.hp ?? def.hp ?? 100;
  const b: Building = { id, type, x, y, level: 1, spec: null, hp, maxHp: hp, store: {}, input: {}, reserved: {}, incoming: {}, t: 0, builtAt: w.time, status: '', fireT: 0, ...extra };
  w.buildings[id] = b;
  return b;
}

export function createWorld(): World {
  const w: World = {
    version: 1, time: 0, coins: 0, nextId: 1,
    hero: { x: HEART.x, y: HEART.y + 70, vx: 0, vy: 0, face: 1, walkT: 0, moving: false, stack: [], hp: 5, inv: 0, hurtT: 0, regenT: 0, dead: 0, swingT: 0, swing: 0, form: 'axe' },
    trees: [], buildings: {}, pads: {}, cats: [], enemies: [], ground: [], shots: [],
    up: { bag: 0, axe: 0, boots: 0, heart: 0, mint: 0 },
    night: { phase: 'day', n: 0, t: 0, queue: [], reward: 0, title: '', dark: 0 },
    flags: {}, stats: { earned: 0, felled: 0, hunted: 0, nights: 0, bosses: 0 }, events: [],
  };
  makeBuilding(w, 'shop', 'shop', 1200, 645);
  makeBuilding(w, 'heart', 'lantern', HEART.x, HEART.y, { hp: 120, maxHp: 120 });
  for (const def of PADS) w.pads[def.id] = { def, paid: 0, items: {}, incoming: {} };
  genTrees(w);
  return w;
}

function genTrees(w: World) {
  const r = srand(777);
  const add = (x: number, y: number, kind: Tree['kind'], zone: Tree['zone']) => {
    const lav = kind === 'lav';
    w.trees.push({ id: w.nextId++, x, y, kind, zone, hp: lav ? 5 : 3, maxHp: lav ? 5 : 3, logs: lav ? 3 : 2 + Math.round(r()), alive: true, regrow: 0, grow: 1, shake: 0, s: 0.9 + r() * 0.25, claimedBy: 0 });
  };
  for (let gx = EDGE.x + 30; gx < EDGE.x + EDGE.w - 10; gx += 74)
    for (let gy = EDGE.y + 40; gy < EDGE.y + EDGE.h - 10; gy += 72) {
      const x = gx + (r() - 0.5) * 34, y = gy + (r() - 0.5) * 30;
      if (Math.abs(y - ROAD_Y) < 72) continue;
      add(x, y, r() < 0.6 ? 'oak' : 'pine', 'edge');
    }
  for (let gx = GROVE.x + 40; gx < GROVE.x + GROVE.w - 10; gx += 84)
    for (let gy = GROVE.y + 40; gy < GROVE.y + GROVE.h - 10; gy += 80) {
      const x = gx + (r() - 0.5) * 36, y = gy + (r() - 0.5) * 34;
      if (Math.abs(y - ROAD_Y) < 60 && x > 300) continue;
      add(x, y, r() < 0.65 ? 'lav' : 'pine', 'grove');
    }
}

export const built = (w: World, id: string) => !!w.buildings[id];
export const padVisible = (w: World, p: PadState) => !built(w, p.def.id) && !w.flags['cleared_' + p.def.id] && p.def.req.every(r => built(w, r) || w.flags['cleared_' + r]);
export const isDone = (w: World, id: string) => built(w, id) || !!w.flags['cleared_' + id];
export const treeOpen = (w: World, t: Tree) => t.zone === 'edge' || isDone(w, 'hedge');
export const inRect = (x: number, y: number, r: { x: number; y: number; w: number; h: number }) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export { WILDS };
