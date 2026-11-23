import { BUILD, HEDGE_X, W, H } from '../content/data';
import type { World } from './world';

export interface Body { x: number; y: number }

/** Pushes a body out of obstacles. Palisades only stop enemies (friends walk through like a gate).
 * Returns the id of a palisade an enemy bumped into, or null. */
export function collide(w: World, e: Body, rad: number, opts: { enemy?: boolean; ignoreNodes?: boolean } = {}): string | null {
  let hitWall: string | null = null;
  for (const b of Object.values(w.buildings)) {
    const def = BUILD[b.type]; let r = def.r;
    if (b.type === 'palisade') { if (!opts.enemy || b.hp <= 0 || b.site) continue; }
    else if (def.comfort && b.type !== 'fountain') continue; // small decor is walkable
    const dx = e.x - b.x, dy = e.y - (b.y - 6), d = Math.hypot(dx, dy), m = r + rad;
    if (d < m && d > 0.01) { e.x += dx / d * (m - d); e.y += dy / d * (m - d); if (b.type === 'palisade') hitWall = b.id; }
  }
  if (!opts.ignoreNodes) for (const n of w.nodes) {
    if (!n.alive || n.kind === 'bush') continue;
    const dx = e.x - n.x, dy = e.y - n.y; if (dx > 44 || dx < -44 || dy > 44 || dy < -44) continue;
    const d = Math.hypot(dx, dy), m = (n.kind === 'rock' ? 18 : 12) + rad;
    if (d < m && d > 0.01) { e.x += dx / d * (m - d); e.y += dy / d * (m - d); }
  }
  if (!w.flags.hedge && Math.abs(e.x - HEDGE_X) < 14 + rad) e.x = e.x < HEDGE_X ? HEDGE_X - 14 - rad : HEDGE_X + 14 + rad;
  e.x = Math.max(60, Math.min(W - 60, e.x)); e.y = Math.max(110, Math.min(H - 50, e.y));
  return hitWall;
}

export interface Mover { x: number; y: number; face: number; walkT: number; moving: boolean }
/** Steps toward a point. Returns true when arrived. Facing changes only on clear sideways motion. */
export function moveToward(e: Mover, tx: number, ty: number, spd: number, dt: number, arrive = 4): boolean {
  const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
  if (d < arrive) { e.moving = false; return true; }
  const s = Math.min(spd * dt, d);
  e.x += dx / d * s; e.y += dy / d * s; e.moving = true; e.walkT += dt;
  if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 0.35) e.face = dx > 0 ? 1 : -1;
  return false;
}
