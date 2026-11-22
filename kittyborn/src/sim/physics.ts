import { BUILDINGS, GAPS, GAP_HALF, HEDGE_X, PLAZA, W, H, type GapId, type Rect } from '../content/data';
import { isDone, type World } from './world';

const T = 14; // wall thickness
export const WALLS: Rect[] = (() => {
  const { x, y, w, h } = PLAZA, r: Rect[] = [];
  r.push({ x: x - T / 2, y: y - T / 2, w: w + T, h: T }); // top
  r.push({ x: x - T / 2, y: y + h - T / 2, w: GAPS.S.x - GAP_HALF - x + T / 2, h: T });
  r.push({ x: GAPS.S.x + GAP_HALF, y: y + h - T / 2, w: x + w - GAPS.S.x - GAP_HALF + T / 2, h: T });
  r.push({ x: x - T / 2, y: y, w: T, h: GAPS.W.y - GAP_HALF - y });
  r.push({ x: x - T / 2, y: GAPS.W.y + GAP_HALF, w: T, h: y + h - GAPS.W.y - GAP_HALF });
  r.push({ x: x + w - T / 2, y: y, w: T, h: GAPS.E.y - GAP_HALF - y });
  r.push({ x: x + w - T / 2, y: GAPS.E.y + GAP_HALF, w: T, h: y + h - GAPS.E.y - GAP_HALF });
  return r;
})();
export function gapRect(g: GapId): Rect {
  const G = GAPS[g];
  return G.vertical ? { x: G.x - 10, y: G.y - GAP_HALF, w: 20, h: GAP_HALF * 2 } : { x: G.x - GAP_HALF, y: G.y - 10, w: GAP_HALF * 2, h: 20 };
}
export const HEDGE: Rect = { x: HEDGE_X - 10, y: 0, w: 20, h: H };

export interface Body { x: number; y: number }
function pushOutRect(e: Body, rad: number, r: Rect) {
  const cx = Math.max(r.x, Math.min(e.x, r.x + r.w)), cy = Math.max(r.y, Math.min(e.y, r.y + r.h));
  let dx = e.x - cx, dy = e.y - cy; const d = Math.hypot(dx, dy);
  if (d >= rad) return false;
  if (d < 0.01) { // centre inside: push along the shortest axis
    const l = e.x - r.x, rr = r.x + r.w - e.x, t = e.y - r.y, b = r.y + r.h - e.y, m = Math.min(l, rr, t, b);
    if (m === l) e.x = r.x - rad; else if (m === rr) e.x = r.x + r.w + rad; else if (m === t) e.y = r.y - rad; else e.y = r.y + r.h + rad;
    return true;
  }
  e.x = cx + dx / d * rad; e.y = cy + dy / d * rad;
  return true;
}

/** Returns the id of a palisade the body bumped into (enemies only), or null. */
export function collide(w: World, e: Body, rad: number, opts: { enemy?: boolean; ignoreTrees?: boolean } = {}): string | null {
  let hitWall: string | null = null;
  for (const b of Object.values(w.buildings)) {
    const r = BUILDINGS[b.type].r; if (!r) continue;
    const dx = e.x - b.x, dy = e.y - (b.y - 8), d = Math.hypot(dx, dy), m = r + rad;
    if (d < m && d > 0.01) { e.x += dx / d * (m - d); e.y += dy / d * (m - d); }
  }
  if (!opts.ignoreTrees) for (const t of w.trees) {
    if (!t.alive) continue;
    const dx = e.x - t.x, dy = e.y - t.y; if (dx > 40 || dx < -40 || dy > 40 || dy < -40) continue;
    const d = Math.hypot(dx, dy), m = 12 + rad;
    if (d < m && d > 0.01) { e.x += dx / d * (m - d); e.y += dy / d * (m - d); }
  }
  for (const r of WALLS) pushOutRect(e, rad, r);
  if (!isDone(w, 'hedge')) pushOutRect(e, rad, HEDGE);
  if (opts.enemy) for (const b of Object.values(w.buildings)) {
    if (b.type !== 'palisade' || b.hp <= 0 || !b.gap) continue;
    if (pushOutRect(e, rad, gapRect(b.gap as GapId))) hitWall = b.id;
  }
  e.x = Math.max(60, Math.min(W - 60, e.x)); e.y = Math.max(120, Math.min(H - 60, e.y));
  return hitWall;
}

export interface Mover { x: number; y: number; face: number; walkT: number; moving: boolean }
/** Steps toward a point. Returns true when arrived. */
export function moveToward(e: Mover, tx: number, ty: number, spd: number, dt: number, arrive = 4): boolean {
  const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
  if (d < arrive) { e.moving = false; return true; }
  const s = Math.min(spd * dt, d);
  e.x += dx / d * s; e.y += dy / d * s; e.moving = true; e.walkT += dt;
  if (Math.abs(dx) > 2) e.face = dx > 0 ? 1 : -1;
  return false;
}

/** Waypoints so friendly walkers go through plaza gaps instead of pressing into walls. */
export function routeVia(w: World, fx: number, fy: number, tx: number, ty: number): { x: number; y: number } {
  const inside = (x: number, y: number) => x > PLAZA.x && x < PLAZA.x + PLAZA.w && y > PLAZA.y && y < PLAZA.y + PLAZA.h;
  const a = inside(fx, fy), b = inside(tx, ty);
  if (a === b) return { x: tx, y: ty };
  // choose the gap minimising total distance
  let best: GapId = 'W', bd = 1e9;
  for (const g of ['W', 'E', 'S'] as GapId[]) {
    const G = GAPS[g];
    if (g === 'W' && !isDone(w, 'hedge') && (fx < HEDGE_X || tx < HEDGE_X)) continue;
    const d = Math.hypot(G.x - fx, G.y - fy) + Math.hypot(G.x - tx, G.y - ty);
    if (d < bd) { bd = d; best = g; }
  }
  const G = GAPS[best], near = a ? G.inn : G.out, far = a ? G.out : G.inn;
  const dNear = Math.hypot(near.x - fx, near.y - fy);
  // once lined up with the gap, walk through it
  const lined = G.vertical ? Math.abs(fy - G.y) < GAP_HALF - 12 && Math.abs(fx - G.x) < 75 : Math.abs(fx - G.x) < GAP_HALF - 12 && Math.abs(fy - G.y) < 75;
  if (lined || dNear < 10) return far;
  return near;
}
