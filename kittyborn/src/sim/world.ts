import { BUILD, EDGE, GROVE, HILLS, MEADOW, ROAD_Y, TC, TOWN_R, W, H, WILDS, type BuildingType, type CatRole, type Cost, type EnemyKind, type GatherKind, type ItemId, type Req, type UnitKind } from '../content/data';

export type Inv = Partial<Record<ItemId, number>>;
export interface P { x: number; y: number }

export interface Hero {
  x: number; y: number; vx: number; vy: number; face: number; walkT: number; moving: boolean;
  stack: ItemId[]; hp: number; inv: number; hurtT: number; regenT: number; dead: number;
  swingT: number; swing: number; form: 'axe' | 'saw';
}
export type NodeKind = 'oak' | 'pine' | 'lav' | 'rock' | 'bush';
export interface ResNode {
  id: number; x: number; y: number; kind: NodeKind; zone: 'edge' | 'grove' | 'hills' | 'meadow';
  hp: number; maxHp: number; yield: number; item: ItemId; alive: boolean; regrow: number; grow: number; shake: number; s: number; claimedBy: number; seed: number;
}
export interface Building {
  id: string; type: BuildingType; x: number; y: number; level: number; spec: string | null;
  hp: number; maxHp: number;
  store: Inv; input: Inv; reserved: Inv; incoming: Inv;
  t: number; frac: number; builtAt: number; status: string; fireT: number;
  site: Inv | null;            // materials still missing while under construction
  fuel: number;                // light sources
  gather?: GatherKind;         // gatherer houses
  queue?: UnitKind[]; trainT?: number; // barracks
  want?: Record<UnitKind, number>;      // posts
}
export type TaskKind = 'haul' | 'harvest';
export interface Task { kind: TaskKind; item?: ItemId; from?: string; to?: string; n: number; stage: 'toSource' | 'toTarget' | 'work'; node?: number }
export interface Cat {
  id: number; role: CatRole; home: string; x: number; y: number; face: number; walkT: number; moving: boolean;
  stack: ItemId[]; task: Task | null; idle: string; swingT: number; swing: number; waitT: number;
  stuckT: number; lx: number; ly: number; hidden: boolean;
}
export interface Unit {
  id: number; kind: UnitKind; home: string; post: string | null; x: number; y: number; face: number; walkT: number; moving: boolean;
  hp: number; maxHp: number; woundT: number; swingT: number; swing: number; stuckT: number; lx: number; ly: number;
}
export interface Enemy {
  id: number; kind: EnemyKind; x: number; y: number; z: number; vz: number; hp: number; maxHp: number; r: number;
  atkCd: number; flash: number; kx: number; ky: number; face: number; walkT: number; moving: boolean;
  passive: boolean; aggro: number; wx: number; wy: number; wt: number; lit: boolean;
  boss?: { state: 'drop' | 'walk' | 'tele' | 'jump'; t: number; tx: number; ty: number; sx: number; sy: number; slams: number };
}
export interface Ground { id: number; type: ItemId; x: number; y: number; z: number; vz: number; age: number }
export interface Shot { id: number; x: number; y: number; target: number; dmg: number; kind: 'cone' | 'pebble' }
export type GameEvent =
  | { t: 'fly'; item: ItemId | 'coin'; fx: number; fy: number; fz: number; to: 'hero' | number | P }
  | { t: 'chop' | 'fell' | 'hit' | 'poof' | 'build' | 'hurt' | 'slam' | 'coin' | 'pick' | 'drop' | 'pay' | 'upgrade' | 'shot' | 'wallHit' | 'lightOut' | 'placed' | 'mine'; x: number; y: number; v?: number; kind?: string }
  | { t: 'text'; x: number; y: number; s: string; color?: string; size?: number }
  | { t: 'bubble'; who: 'owl' | number; s: string }
  | { t: 'toast'; title: string; body: string }
  | { t: 'dead' | 'respawn' | 'dusk' | 'nightStart' | 'nightWin' | 'nightLose' | 'bossIn' | 'bossDown' | 'dawn' };

export interface Clock {
  phase: 'day' | 'dusk' | 'night'; t: number; day: number; n: number;
  queue: { at: number; kind: EnemyKind; from: string }[]; reward: number; title: string; dirs: string[]; dark: number; early: boolean;
}
export interface World {
  version: number; time: number; coins: number; nextId: number;
  hero: Hero; nodes: ResNode[]; buildings: Record<string, Building>;
  cats: Cat[]; units: Unit[]; enemies: Enemy[]; ground: Ground[]; shots: Shot[];
  up: { bag: number; axe: number; boots: number; heart: number; mint: number };
  clock: Clock; flags: Record<string, boolean>;
  stats: { earned: number; felled: number; hunted: number; nights: number; bosses: number };
  events: GameEvent[];
}

// ---------------------------------------------------------------- derived stats
export const heroCap = (w: World) => 12 + w.up.bag * 6;
export const heroSpeed = (w: World) => 190 * (1 + w.up.boots * 0.12);
export const heroDmg = (w: World) => 1 + w.up.axe * 0.6;
export const heroSwing = (w: World) => 0.4 * Math.pow(0.92, w.up.axe);
export const heroMaxHp = (w: World) => 5 + w.up.heart;
export const comfort = (w: World) => Object.values(w.buildings).reduce((a, b) => a + (b.site ? 0 : BUILD[b.type].comfort || 0), 0);
export const catBoost = (w: World) => 1 + w.up.mint * 0.12 + Math.min(0.3, comfort(w) * 0.02);
export const catCap = (w: World, c: Cat) => (c.role === 'hauler' ? 8 : 6) + w.up.mint * 2;
export const catSpeed = (w: World) => 125 * catBoost(w);
export const hallLevel = (w: World) => w.buildings.hall?.level || 1;
export const townR = (w: World) => TOWN_R[hallLevel(w) - 1];

export function levelStats(b: Building): Record<string, number> {
  const def = BUILD[b.type];
  const lv = def.levels ? def.levels[Math.min(b.level, def.levels.length) - 1].stats : {};
  const spec = b.spec && def.specs ? def.specs.find(s => s.id === b.spec)?.stats : undefined;
  return { ...lv, ...(spec || {}) };
}
export function procStats(b: Building) {
  const p = BUILD[b.type].proc!; const s = levelStats(b);
  const speed = s.speed || 1, cap = s.cap || 1;
  return { ...p, time: p.time / speed, inCap: Math.round(p.inCap * cap), outCap: Math.round(p.outCap * cap), yield: s.yield || 1 };
}
export function lightRadius(b: Building) { const f = BUILD[b.type].fuel; return f && !b.site && b.fuel > 0 && b.hp > 0 ? f.radius : 0; }

// ---------------------------------------------------------------- inventory helpers
export const invGet = (i: Inv, k: ItemId) => i[k] || 0;
export const invAdd = (i: Inv, k: ItemId, n: number) => { i[k] = Math.max(0, (i[k] || 0) + n); };
export const invTotal = (i: Inv) => Object.values(i).reduce((a, b) => a + (b || 0), 0);
export const available = (b: Building, k: ItemId) => invGet(b.store, k) - invGet(b.reserved, k);
export function storageCap(b: Building) { return levelStats(b).cap || 0; }
export function storageFree(b: Building) { return storageCap(b) - invTotal(b.store) - invTotal(b.incoming); }
export function costItems(c: Cost): [ItemId, number][] { return (Object.keys(c) as (keyof Cost)[]).filter(k => k !== 'coins' && (c[k] || 0) > 0).map(k => [k as ItemId, c[k] as number]); }

// ---------------------------------------------------------------- queries
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const inRect = (x: number, y: number, r: { x: number; y: number; w: number; h: number }) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
export const count = (w: World, t: BuildingType) => Object.values(w.buildings).filter(b => b.type === t).length;
export const has = (w: World, t: BuildingType) => Object.values(w.buildings).some(b => b.type === t && !b.site);
export const firstOf = (w: World, t: BuildingType) => Object.values(w.buildings).find(b => b.type === t && !b.site);
export const allOf = (w: World, t: BuildingType) => Object.values(w.buildings).filter(b => b.type === t && !b.site);
export const nodeOpen = (w: World, n: ResNode) => n.zone !== 'grove' || !!w.flags.hedge;
export function reqMet(w: World, r: Req[]): string | null {
  for (const q of r) {
    if (q.b && !has(w, q.b)) return `Потрібно: ${BUILD[q.b].name}`;
    if (q.hall && hallLevel(w) < q.hall) return `Потрібна Ратуша ${q.hall} рівня`;
    if (q.flag && !w.flags[q.flag]) return 'Ще не відкрито';
  }
  return null;
}

// ---------------------------------------------------------------- creation
function srand(s: number) { return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

export function makeBuilding(w: World, type: BuildingType, x: number, y: number, extra: Partial<Building> = {}): Building {
  const def = BUILD[type];
  const hp = def.levels?.[0].stats.hp ?? def.hp ?? 100;
  const id = extra.id || type + '_' + w.nextId++;
  const b: Building = { id, type, x, y, level: 1, spec: null, hp, maxHp: hp, store: {}, input: {}, reserved: {}, incoming: {}, t: 0, frac: 0, builtAt: w.time, status: '', fireT: 0, site: null, fuel: def.fuel ? def.fuel.cap * 0.6 : 0, ...extra };
  if (def.role === 'gatherer' && !b.gather) b.gather = 'wood';
  if (type === 'barracks') { b.queue = b.queue || []; b.trainT = 0; }
  if (type === 'post') b.want = b.want || { spear: 2, sling: 0 };
  w.buildings[id] = b;
  return b;
}

export function createWorld(): World {
  const w: World = {
    version: 2, time: 0, coins: 10, nextId: 1,
    hero: { x: TC.x, y: TC.y + 160, vx: 0, vy: 0, face: 1, walkT: 0, moving: false, stack: [], hp: 5, inv: 0, hurtT: 0, regenT: 0, dead: 0, swingT: 0, swing: 0, form: 'axe' },
    nodes: [], buildings: {}, cats: [], units: [], enemies: [], ground: [], shots: [],
    up: { bag: 0, axe: 0, boots: 0, heart: 0, mint: 0 },
    clock: { phase: 'day', t: 0, day: 1, n: 0, queue: [], reward: 0, title: '', dirs: [], dark: 0, early: false },
    flags: {}, stats: { earned: 0, felled: 0, hunted: 0, nights: 0, bosses: 0 }, events: [],
  };
  makeBuilding(w, 'hall', TC.x, TC.y - 40, { id: 'hall' });
  makeBuilding(w, 'heart', TC.x, TC.y + 80, { id: 'heart', fuel: 30 });
  makeBuilding(w, 'shop', TC.x - 170, TC.y + 20, { id: 'shop' });
  genNodes(w);
  return w;
}

function genNodes(w: World) {
  const r = srand(777);
  const add = (x: number, y: number, kind: NodeKind, zone: ResNode['zone']) => {
    const d: Record<NodeKind, [number, number, ItemId]> = { oak: [2, 3, 'log'], pine: [2, 3, 'log'], lav: [4, 3, 'lav'], rock: [5, 3, 'stone'], bush: [1, 3, 'berry'] };
    const [hp, y0, item] = d[kind];
    w.nodes.push({ id: w.nextId++, x, y, kind, zone, hp, maxHp: hp, yield: y0 + (kind === 'oak' || kind === 'pine' ? Math.round(r()) : 0), item, alive: true, regrow: 0, grow: 1, shake: 0, s: 0.9 + r() * 0.25, claimedBy: 0, seed: r() * 100 });
  };
  const grid = (R: { x: number; y: number; w: number; h: number }, step: number, f: (x: number, y: number) => void) => {
    for (let gx = R.x + step / 2; gx < R.x + R.w; gx += step) for (let gy = R.y + step / 2; gy < R.y + R.h; gy += step * 0.95) f(gx + (r() - 0.5) * step * 0.45, gy + (r() - 0.5) * step * 0.4);
  };
  grid(EDGE, 76, (x, y) => { if (Math.abs(y - ROAD_Y) > 70) add(x, y, r() < 0.6 ? 'oak' : 'pine', 'edge'); });
  grid(GROVE, 84, (x, y) => { if (!(Math.abs(y - ROAD_Y) < 60 && x > 300)) add(x, y, r() < 0.65 ? 'lav' : 'pine', 'grove'); });
  grid(HILLS, 92, (x, y) => { if (Math.abs(x - TC.x) > 60 && r() < 0.75) add(x, y, 'rock', 'hills'); });
  grid(MEADOW, 88, (x, y) => { if (Math.abs(x - TC.x) > 60 && r() < 0.7) add(x, y, 'bush', 'meadow'); });
}
export { W, H, WILDS };
