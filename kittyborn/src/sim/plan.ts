// Town master plan. Nothing is placed freely any more: every building has a plot, every tower and light a socket
// on the wall, and the plan grows ring by ring with the hall level (16 -> 22 -> 28 cells across).
// Coordinates are grid cells relative to the town centre (see grid.ts); x, y below are the top-left cell.
import { BUILD, CELL, TC, type BuildingType } from '../content/data';
import { hallLevel, type Building, type World } from './world';

export type District = 'plaza' | 'craft' | 'slob' | 'market' | 'guard';
export interface Plot { id: string; x: number; y: number; size: number; district: District; lvl: number }
export interface Socket { id: string; x: number; y: number; kind: 'tower' | 'light' | 'lantern' }

export const DISTRICT_NAME: Record<District, string> = { plaza: 'Площа', craft: 'Ремесла', slob: 'Слобода', market: 'Ринок', guard: 'Варта' };
export const DISTRICT_OF: Partial<Record<BuildingType, District[]>> = {
  sawmill: ['craft'], storage: ['craft'], forge: ['craft'], candleShop: ['craft'],
  houseGatherer: ['slob'], houseQuarry: ['slob'], houseForager: ['slob'], houseHauler: ['slob'], houseMaster: ['slob'],
  store: ['market'], fountain: ['market', 'slob'], flowerbed: ['market', 'guard', 'slob'], bench: ['market', 'guard', 'slob'], banner: ['market', 'guard'],
  barracks: ['guard'], bell: ['guard'],
};
export const SOCKET_OF: Partial<Record<BuildingType, Socket['kind'][]>> = { tower: ['tower'], bonfire: ['light'], lantern: ['light', 'lantern'] };
export const HALVES = [8, 11, 14];

const quarter = (x: number, y: number, s: number): District => { const cx = x + s / 2, cy = y + s / 2; return cx < 0 ? (cy < 0 ? 'craft' : 'market') : (cy < 0 ? 'slob' : 'guard'); };

function buildPlots(): Plot[] {
  const P: Plot[] = [];
  const add = (x: number, y: number, size: number, lvl: number, d?: District) => P.push({ id: `p${lvl}_${x}_${y}`, x, y, size, district: d ?? quarter(x, y, size), lvl });
  // level 1: one quarter of each district around the plaza (hall and Great Fire are fixed)
  add(-8, -8, 3, 1); add(-4, -8, 3, 1); add(-8, -4, 2, 1);               // Ремесла: sawmill, storage, forge
  add(1, -8, 2, 1); add(4, -8, 2, 1); add(1, -5, 2, 1); add(4, -5, 2, 1); // Слобода: four houses
  add(-4, 3, 3, 1);                                                        // Ринок: the shop with its own store (the Owl is fixed)
  add(4, 2, 3, 1); add(1, 4, 1, 1); add(1, 6, 2, 1, 'guard');              // Варта: barracks, bell, a small yard
  // rings, 3 cells deep: 2x2 plots keep their pad row inside the ring; 3x3 plots sit in the northern corners
  add(-11, -11, 3, 2, 'craft'); add(8, -11, 3, 2, 'guard');
  for (const x of [-7, -4, 1, 4]) add(x, -11, 2, 2);
  for (const x of [-11, -8, -5, 1, 4, 7]) add(x, 8, 2, 2);
  for (const y of [-5, 1, 4]) { add(-11, y, 2, 2); add(8, y, 2, 2); }
  add(-14, -14, 3, 3, 'craft'); add(11, -14, 3, 3, 'market');
  for (const x of [-10, -7, -4, 1, 4, 7]) add(x, -14, 2, 3);
  for (const x of [-14, -11, -8, -5, 1, 4, 7, 10]) add(x, 11, 2, 3);
  for (const y of [-8, -5, 1, 4, 7]) { add(-14, y, 2, 3); add(11, y, 2, 3); }
  return P;
}
export const PLOTS = buildPlots();

/** Defence sockets for a town of half-size H: towers just outside the wall, lights one ring further out. */
export function socketsFor(H: number, lvl: number): Socket[] {
  const S: Socket[] = [], T = (id: string, x: number, y: number) => S.push({ id, x, y, kind: 'tower' }), L = (id: string, x: number, y: number, kind: Socket['kind'] = 'light') => S.push({ id, x, y, kind });
  T('tN1', -4, -H - 3); T('tN2', 2, -H - 3); T('tS1', -4, H + 1); T('tS2', 2, H + 1);
  T('tW1', -H - 3, -4); T('tW2', -H - 3, 2); T('tE1', H + 1, -4); T('tE2', H + 1, 2);
  T('tNW', -H - 3, -H - 3); T('tNE', H + 1, -H - 3); T('tSW', -H - 3, H + 1); T('tSE', H + 1, H + 1);
  L('lN1', -5, -H - 4); L('lN2', 4, -H - 4); L('lS1', -5, H + 3); L('lS2', 4, H + 3);
  L('lW1', -H - 4, -4); L('lW2', -H - 4, 2); L('lE1', H + 3, -4); L('lE2', H + 3, 2);
  L('lNW', -H - 4, -H - 4); L('lNE', H + 3, -H - 4); L('lSW', -H - 4, H + 3); L('lSE', H + 3, H + 3);
  if (lvl >= 2) { const m = Math.round(H / 2) + 2; L('mN1', -m, -H - 3, 'lantern'); L('mN2', m - 1, -H - 3, 'lantern'); L('mS1', -m, H + 2, 'lantern'); L('mS2', m - 1, H + 2, 'lantern'); L('mW1', -H - 3, -m, 'lantern'); L('mW2', -H - 3, m - 1, 'lantern'); L('mE1', H + 2, -m, 'lantern'); L('mE2', H + 2, m - 1, 'lantern'); }
  return S;
}
export const sockets = (w: World) => socketsFor(HALVES[hallLevel(w) - 1], hallLevel(w));
export const plotsNow = (w: World) => PLOTS.filter(p => p.lvl <= hallLevel(w));

/** World centre of a building of type t whose top-left cell is (x, y). */
export function centreAt(t: BuildingType, x: number, y: number) { const f = BUILD[t].fp || 1; return { x: TC.x + (x + f / 2) * CELL, y: TC.y + (y + f / 2) * CELL }; }
export function plotCentre(p: Plot) { return { x: TC.x + (p.x + p.size / 2) * CELL, y: TC.y + (p.y + p.size / 2) * CELL }; }
const originOfB = (b: { type: BuildingType; x: number; y: number }) => { const f = BUILD[b.type].fp || 1; return { x: Math.round((b.x - TC.x) / CELL - f / 2), y: Math.round((b.y - TC.y) / CELL - f / 2) }; };

/** Which plot or socket a building sits on. */
export function plotOf(w: World, b: Building): Plot | undefined { const o = originOfB(b); return plotsNow(w).find(p => p.x === o.x && p.y === o.y); }
export function plotTaken(w: World, p: Plot, ignore?: string) { return Object.values(w.buildings).some(b => b.id !== ignore && (() => { const o = originOfB(b); return o.x === p.x && o.y === p.y; })()); }
export function socketTaken(w: World, s: Socket, ignore?: string) { return Object.values(w.buildings).some(b => b.id !== ignore && b.socket === s.id); }
export function fits(t: BuildingType, p: Plot) { return !!DISTRICT_OF[t]?.includes(p.district) && (BUILD[t].fp || 1) <= p.size; }

/** Free places (plot or socket) where this type may go, as building centres. */
export function spotsFor(w: World, t: BuildingType, ignore?: string): { x: number; y: number; plot?: string; socket?: string }[] {
  const out: { x: number; y: number; plot?: string; socket?: string }[] = [];
  const sk = SOCKET_OF[t];
  if (sk) { for (const s of sockets(w)) if (sk.includes(s.kind) && !socketTaken(w, s, ignore)) out.push({ ...centreAt(t, s.x, s.y), socket: s.id }); return out; }
  for (const p of plotsNow(w)) if (fits(t, p) && !plotTaken(w, p, ignore)) out.push({ ...centreAt(t, p.x, p.y), plot: p.id });
  return out;
}
/** Wall cells: one ring just outside the town square. */
export function wallCells(w: World): { x: number; y: number }[] {
  const H = HALVES[hallLevel(w) - 1], out: { x: number; y: number }[] = [];
  const c = (i: number, j: number) => out.push({ x: TC.x + (i + 0.5) * CELL, y: TC.y + (j + 0.5) * CELL });
  for (let i = -H - 1; i <= H; i++) { c(i, -H - 1); c(i, H); }
  for (let j = -H; j < H; j++) { c(-H - 1, j); c(H, j); }
  return out;
}
/** Patrol routes as world waypoints: around the wall and along both roads. */
export function routes(w: World): Record<'ring' | 'ns' | 'ew', { x: number; y: number }[]> {
  const H = HALVES[hallLevel(w) - 1] + 0.5, k = CELL, x0 = TC.x, y0 = TC.y;
  return {
    ring: [[-H, -H], [H, -H], [H, H], [-H, H]].map(([a, b]) => ({ x: x0 + a * k, y: y0 + b * k })),
    ns: [{ x: x0, y: y0 - (H - 0.5) * k }, { x: x0, y: y0 + (H - 0.5) * k }],
    ew: [{ x: x0 - (H - 0.5) * k, y: y0 }, { x: x0 + (H - 0.5) * k, y: y0 }],
  };
}
export const ROUTE_NAME = { ring: 'Обхід муру', ns: 'Північ — південь', ew: 'Захід — схід' } as const;
