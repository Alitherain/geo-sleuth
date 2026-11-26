// Town grid. Cell (i, j) covers x in [TC.x + i*CELL, TC.x + (i+1)*CELL), same for y.
// Rules that keep the town playable however it is built:
//  - two roads (2 cells wide) cross the town and are never built on (palisades excepted: friends walk through them);
//  - the row in front of a building with pads stays free, so pads are always reachable;
//  - a placement is refused if any pad, building or the hero would end up walled in.
import { BUILD, CELL, HEDGE_X, NEAR_CELLS, TC, TOWN_HALF, WALKABLE, W, H, type BuildingType } from '../content/data';
import { hallLevel, type World } from './world';

export const townHalf = (w: World) => TOWN_HALF[hallLevel(w) - 1];
export const areaHalf = (w: World) => townHalf(w) + NEAR_CELLS;
export const fpOf = (t: BuildingType) => BUILD[t].fp || 1;
export const cellOf = (x: number, y: number) => ({ i: Math.floor((x - TC.x) / CELL), j: Math.floor((y - TC.y) / CELL) });
export const cellCenter = (i: number, j: number) => ({ x: TC.x + (i + 0.5) * CELL, y: TC.y + (j + 0.5) * CELL });
export const isRoad = (i: number, j: number) => i === -1 || i === 0 || j === -1 || j === 0;

/** Top-left cell of a building centred at (x, y). */
export function originOf(t: BuildingType, x: number, y: number) { const f = fpOf(t); return { i: Math.round((x - TC.x) / CELL - f / 2), j: Math.round((y - TC.y) / CELL - f / 2) }; }
/** Snap a free point to the nearest grid position for this building. */
export function snap(t: BuildingType, x: number, y: number) { const f = fpOf(t), o = originOf(t, x, y); return { x: TC.x + (o.i + f / 2) * CELL, y: TC.y + (o.j + f / 2) * CELL }; }
export function centerOf(t: BuildingType, i: number, j: number) { const f = fpOf(t); return { x: TC.x + (i + f / 2) * CELL, y: TC.y + (j + f / 2) * CELL }; }

export function footprint(t: BuildingType, x: number, y: number): [number, number][] {
  const f = fpOf(t), o = originOf(t, x, y), out: [number, number][] = [];
  for (let a = 0; a < f; a++) for (let b = 0; b < f; b++) out.push([o.i + a, o.j + b]);
  return out;
}
/** Front row kept free for pads. */
export function padRow(t: BuildingType, x: number, y: number): [number, number][] {
  if (!BUILD[t].slots?.length) return [];
  const f = fpOf(t), o = originOf(t, x, y), out: [number, number][] = [];
  for (let a = 0; a < f; a++) out.push([o.i + a, o.j + f]);
  return out;
}
/** Cells that hold an actual pad (must be reachable). */
export function padCells(t: BuildingType, x: number, y: number): [number, number][] {
  return (BUILD[t].slots || []).map(s => { const c = cellOf(x + s.dx - (fpOf(t) % 2 ? 0 : 1), y + s.dy); return [c.i, c.j] as [number, number]; });
}

export type CellUse = { kind: 'fp' | 'pad'; id: string; walk: boolean };
const key = (i: number, j: number) => i * 4096 + j;
export function occupancy(w: World, ignore?: string): Map<number, CellUse> {
  const m = new Map<number, CellUse>();
  for (const b of Object.values(w.buildings)) {
    if (b.id === ignore) continue;
    const walk = WALKABLE(b.type);
    for (const [i, j] of footprint(b.type, b.x, b.y)) m.set(key(i, j), { kind: 'fp', id: b.id, walk });
    for (const [i, j] of padRow(b.type, b.x, b.y)) if (!m.has(key(i, j))) m.set(key(i, j), { kind: 'pad', id: b.id, walk: true });
  }
  return m;
}

export interface Plan { type: BuildingType; x: number; y: number; id?: string }
/** Every cell reachable on foot from outside the build area, given the occupancy. */
function reach(w: World, occ: Map<number, CellUse>, A: number): Set<number> {
  const seen = new Set<number>(), q: [number, number][] = [];
  const free = (i: number, j: number) => { const u = occ.get(key(i, j)); return !u || u.walk; };
  for (let i = -A - 1; i <= A; i++) for (const j of [-A - 1, A]) { q.push([i, j]); seen.add(key(i, j)); }
  for (let j = -A; j < A; j++) for (const i of [-A - 1, A]) { q.push([i, j]); seen.add(key(i, j)); }
  while (q.length) {
    const [i, j] = q.pop()!;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj; if (a < -A - 1 || a > A || b < -A - 1 || b > A) continue;
      const k = key(a, b); if (seen.has(k) || !free(a, b)) continue;
      seen.add(k); q.push([a, b]);
    }
  }
  return seen;
}
/** Name of the building that would be cut off, or null when everything stays reachable. */
function walledIn(w: World, occ: Map<number, CellUse>, extra: Plan | null): string | null {
  const A = areaHalf(w) + 1, r = reach(w, occ, A);
  const all = Object.values(w.buildings).filter(b => b.id !== extra?.id).map(b => ({ type: b.type, x: b.x, y: b.y, name: BUILD[b.type].name }));
  if (extra) all.push({ type: extra.type, x: extra.x, y: extra.y, name: BUILD[extra.type].name });
  for (const b of all) {
    if (WALKABLE(b.type)) continue;
    const pads = padCells(b.type, b.x, b.y);
    if (pads.length) { if (pads.some(([i, j]) => !r.has(key(i, j)))) return b.name; continue; }
    const fp = footprint(b.type, b.x, b.y), f = fpOf(b.type), [i0, j0] = fp[0];
    let ok = false;
    for (let a = -1; a <= f && !ok; a++) for (let c = -1; c <= f && !ok; c++) { if (a >= 0 && a < f && c >= 0 && c < f) continue; if (a !== -1 && a !== f && c !== -1 && c !== f) continue; if (r.has(key(i0 + a, j0 + c))) ok = true; }
    if (!ok) return b.name;
  }
  const hc = cellOf(w.hero.x, w.hero.y);
  if (Math.abs(hc.i) <= A && Math.abs(hc.j) <= A && !occ.get(key(hc.i, hc.j)) && !r.has(key(hc.i, hc.j))) return 'Ліхтарник';
  return null;
}

/** Why a building can't go here, or null. (x, y) is snapped first. */
export function gridCheck(w: World, type: BuildingType, x0: number, y0: number, ignore?: string, occ0?: Map<number, CellUse>): string | null {
  const def = BUILD[type], { x, y } = snap(type, x0, y0), f = fpOf(type), o = originOf(type, x, y);
  const T = townHalf(w), A = areaHalf(w);
  const lim = def.zone === 'town' ? T : A;
  if (o.i < -lim || o.j < -lim || o.i + f > lim || o.j + f > lim) return def.zone === 'town' ? 'Лише в межах містечка' : 'Задалеко від містечка';
  if (x - f * CELL / 2 < 60 || x + f * CELL / 2 > W - 60 || y - f * CELL / 2 < 120 || y + f * CELL / 2 > H - 60) return 'Край мапи';
  if (!w.flags.hedge && x - f * CELL / 2 < HEDGE_X + 20) return 'За хащами';
  const occ = occ0 ?? occupancy(w, ignore);
  for (const [i, j] of footprint(type, x, y)) {
    const u = occ.get(key(i, j));
    if (u) return u.kind === 'pad' ? `Тут прохід до «${BUILD[w.buildings[u.id]?.type ?? type].name}»` : 'Заважає будівля';
    if (isRoad(i, j) && type !== 'palisade') return 'Дорога: тут не будують';
  }
  // big buildings keep a one-cell lane around them, so the town never turns into a maze
  if (f >= 2 && !WALKABLE(type)) for (let a = -1; a <= f; a++) for (let c = -1; c <= f; c++) {
    if (a >= 0 && a < f && c >= 0 && c < f) continue;
    if ((a < 0 || a >= f) && (c < 0 || c >= f)) continue; // touching only at a corner leaves both lanes open
    const u = occ.get(key(o.i + a, o.j + c));
    if (u && u.kind === 'fp' && !u.walk && (BUILD[w.buildings[u.id]?.type]?.fp || 1) >= 2) return 'Залиш прохід між будівлями';
  }
  for (const [i, j] of padRow(type, x, y)) { const u = occ.get(key(i, j)); if (u && !u.walk) return 'Перед будівлею має бути вільний ряд'; if (u && u.kind === 'pad') return 'Майданчики налазять один на одного'; }
  for (const n of w.nodes) if (n.alive && Math.abs(n.x - x) < f * CELL / 2 + 12 && Math.abs(n.y - y) < f * CELL / 2 + 12) return 'Заважає дерево чи камінь';
  if (!WALKABLE(type)) {
    const trial = new Map(occ);
    for (const [i, j] of footprint(type, x, y)) trial.set(key(i, j), { kind: 'fp', id: '_new', walk: false });
    for (const [i, j] of padRow(type, x, y)) if (!trial.has(key(i, j))) trial.set(key(i, j), { kind: 'pad', id: '_new', walk: true });
    const cut = walledIn(w, trial, { type, x, y, id: ignore });
    if (cut) return cut === 'Ліхтарник' ? 'Замурує героя' : `Перекриє прохід до «${cut}»`;
  }
  return null;
}

/** Valid centres for a building type, for the placement highlight. */
export function validSpots(w: World, type: BuildingType, ignore?: string): { x: number; y: number }[] {
  const A = BUILD[type].zone === 'town' ? townHalf(w) : areaHalf(w), f = fpOf(type), occ = occupancy(w, ignore), out: { x: number; y: number }[] = [];
  for (let i = -A; i + f <= A; i++) for (let j = -A; j + f <= A; j++) { const c = centerOf(type, i, j); if (!gridCheck(w, type, c.x, c.y, ignore, occ)) out.push(c); }
  return out;
}

/** Straight run of palisade cells from a to b (dominant axis). */
export function lineCells(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number }[] {
  const ca = cellOf(a.x, a.y), cb = cellOf(b.x, b.y), out: { x: number; y: number }[] = [];
  const horiz = Math.abs(cb.i - ca.i) >= Math.abs(cb.j - ca.j);
  const n = horiz ? cb.i - ca.i : cb.j - ca.j, s = Math.sign(n) || 1;
  for (let k = 0; k <= Math.abs(n) && k < 60; k++) out.push(cellCenter(horiz ? ca.i + k * s : ca.i, horiz ? ca.j : ca.j + k * s));
  return out;
}
/** Ring of palisade cells just outside the town square. */
export function perimeterCells(w: World): { x: number; y: number }[] {
  const T = townHalf(w), out: { x: number; y: number }[] = [];
  for (let i = -T - 1; i <= T; i++) { out.push(cellCenter(i, -T - 1)); out.push(cellCenter(i, T)); }
  for (let j = -T; j < T; j++) { out.push(cellCenter(-T - 1, j)); out.push(cellCenter(T, j)); }
  return out;
}

// ---------------------------------------------------------------- walking around buildings
let occCache: { t: number; n: number; occ: Map<number, CellUse> } | null = null;
function occNow(w: World) {
  const n = Object.keys(w.buildings).length;
  if (!occCache || occCache.t !== w.time || occCache.n !== n) occCache = { t: w.time, n, occ: occupancy(w) };
  return occCache.occ;
}
/** Cell-centre waypoints from (sx, sy) toward (tx, ty) through the town grid (8-way, no corner cutting).
 * Ends with the exact target. Outside the build area the walk is a straight line. */
export function findPath(w: World, sx: number, sy: number, tx: number, ty: number): { x: number; y: number }[] {
  const A = areaHalf(w) + 2, occ = occNow(w);
  const clampC = (c: { i: number; j: number }) => ({ i: Math.max(-A, Math.min(A - 1, c.i)), j: Math.max(-A, Math.min(A - 1, c.j)) });
  const s = clampC(cellOf(sx, sy)), g = clampC(cellOf(tx, ty));
  const blocked = (i: number, j: number) => { if ((i === s.i && j === s.j) || (i === g.i && j === g.j)) return false; const u = occ.get(key(i, j)); return !!u && !u.walk; };
  const prev = new Map<number, number>(), q: number[] = [key(s.i, s.j)]; prev.set(q[0], -1);
  const gk = key(g.i, g.j); let found = false;
  for (let h = 0; h < q.length; h++) {
    const k = q[h]; if (k === gk) { found = true; break; }
    const i = Math.round(k / 4096), j = k - i * 4096;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const a = i + di, b = j + dj; if (a < -A || a >= A || b < -A || b >= A || blocked(a, b)) continue;
      if (di && dj && (blocked(i + di, j) || blocked(i, j + dj))) continue;
      const nk = key(a, b); if (prev.has(nk)) continue; prev.set(nk, k); q.push(nk);
    }
  }
  if (!found) return [{ x: tx, y: ty }];
  const cells: { x: number; y: number }[] = [];
  for (let k = gk; k !== -1; k = prev.get(k)!) { const i = Math.round(k / 4096), j = k - i * 4096; cells.push(cellCenter(i, j)); }
  cells.reverse(); cells.shift(); if (cells.length) cells.pop();
  // drop waypoints on straight runs
  const out: { x: number; y: number }[] = [];
  for (let n = 0; n < cells.length; n++) { const a = out[out.length - 1] ?? { x: sx, y: sy }, b = cells[n], c = cells[n + 1]; if (c && Math.abs((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)) < 1) continue; out.push(b); }
  out.push({ x: tx, y: ty });
  return out;
}
