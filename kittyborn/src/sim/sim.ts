import { BUILDINGS, HEART, ITEMS, type ItemId, type SlotKind } from '../content/data';
import { collide } from './physics';
import { damageEnemy, hitTree, updateCats } from './logistics';
import { payPad, production, sell } from './economy';
import { hurtHero, updateNight } from './night';
import { available, dist, heroCap, heroDmg, heroMaxHp, heroSpeed, heroSwing, invAdd, invGet, levelStats, padVisible, storageFree, treeOpen, type Building, type PadState, type World } from './world';

export interface Input { x: number; y: number }
export type Context =
  | { kind: 'pad'; pad: PadState }
  | { kind: 'slot'; slot: SlotKind; b: Building }
  | { kind: 'building'; b: Building }
  | null;

/** What the hero is standing on: drives automatic transfers and which card the UI shows. */
export function heroContext(w: World): Context {
  const h = w.hero;
  for (const p of Object.values(w.pads)) if (padVisible(w, p) && Math.abs(h.x - p.def.x) < 40 && Math.abs(h.y - p.def.y) < 40) return { kind: 'pad', pad: p };
  for (const b of Object.values(w.buildings)) for (const s of BUILDINGS[b.type].slots || [])
    if (Math.abs(h.x - (b.x + s.dx)) < 34 && Math.abs(h.y - (b.y + s.dy)) < 34) return { kind: 'slot', slot: s.kind, b };
  let best: Building | null = null, bd = 1e9;
  for (const b of Object.values(w.buildings)) {
    if (!BUILDINGS[b.type].levels || b.type === 'storage' || b.type === 'sawmill') continue;
    const d = dist(h.x, h.y, b.x, b.y), m = Math.max(BUILDINGS[b.type].r, 20) + 50;
    if (d < m && d < bd) { bd = d; best = b; }
  }
  return best ? { kind: 'building', b: best } : null;
}

let transferT = 0;
export function step(w: World, input: Input, dt: number) {
  w.time += dt;
  heroUpdate(w, input, dt);
  for (const t of w.trees) {
    if (t.shake > 0) t.shake = Math.max(0, t.shake - dt * 4);
    if (!t.alive) { t.regrow -= dt; if (t.regrow <= 0) { t.alive = true; t.hp = t.maxHp; t.grow = 0; } }
    else if (t.grow < 1) t.grow = Math.min(1, t.grow + dt * 1.6);
  }
  production(w, dt);
  updateCats(w, dt);
  updateNight(w, dt);
  for (const g of w.ground) { g.age += dt; if (g.z > 0 || g.vz > 0) { g.vz -= 500 * dt; g.z += g.vz * dt; if (g.z < 0) { g.z = 0; g.vz = Math.abs(g.vz) > 60 ? -g.vz * 0.35 : 0; } } }
  if (w.ground.length > 150) w.ground.splice(0, w.ground.length - 150);
}

function heroUpdate(w: World, input: Input, dt: number) {
  const h = w.hero;
  if (h.dead > 0) {
    h.dead -= dt;
    if (h.dead <= 0) { h.x = HEART.x; h.y = HEART.y + 60; h.hp = heroMaxHp(w); h.inv = 2; w.events.push({ t: 'respawn' }); }
    return;
  }
  let ix = input.x, iy = input.y; const m = Math.hypot(ix, iy); if (m > 1) { ix /= m; iy /= m; }
  const sp = heroSpeed(w), k = Math.min(1, dt * 14);
  h.vx += (ix * sp - h.vx) * k; h.vy += (iy * sp - h.vy) * k;
  h.x += h.vx * dt; h.y += h.vy * dt;
  h.moving = Math.hypot(h.vx, h.vy) > 25;
  if (h.moving) { h.walkT += dt * Math.hypot(h.vx, h.vy) / 185; if (Math.abs(h.vx) > 15) h.face = h.vx > 0 ? 1 : -1; }
  collide(w, h, 13);
  if (h.inv > 0) h.inv -= dt; if (h.hurtT > 0) h.hurtT -= dt;
  h.regenT -= dt;
  if (h.regenT <= 0 && h.hp < heroMaxHp(w)) { h.hp++; h.regenT = w.night.phase === 'night' ? 3 : 1; }

  // auto attack / chop
  h.swingT -= dt; if (h.swing > 0) h.swing = Math.max(0, h.swing - dt * 4.5);
  if (h.swingT <= 0) {
    let target = null as null | World['enemies'][number], bd = 1e9;
    for (const e of w.enemies) { if (e.z > 20) continue; const d = dist(h.x, h.y, e.x, e.y); if (d < e.r + 42 && d < bd) { bd = d; target = e; } }
    if (target) {
      h.form = 'saw'; h.face = target.x > h.x ? 1 : -1;
      // saw form: wide arc hits everything in front
      for (const e of w.enemies.slice()) { if (e.z > 20) continue; const dx = e.x - h.x; if (dist(h.x, h.y, e.x, e.y) < e.r + 50 && (dx * h.face > -10 || e === target)) damageEnemy(w, e, heroDmg(w) * 2, h.x, h.y); }
      h.swing = 1; h.swingT = heroSwing(w) * 1.1;
    } else {
      let tr = null as null | World['trees'][number]; bd = 1e9;
      for (const t of w.trees) { if (!t.alive || !treeOpen(w, t)) continue; const d = dist(h.x, h.y, t.x, t.y); if (d < 44 && d < bd) { bd = d; tr = t; } }
      if (tr) { h.form = 'axe'; h.face = tr.x > h.x ? 1 : -1; hitTree(w, tr, 'hero', heroDmg(w)); h.swing = 1; h.swingT = heroSwing(w); }
    }
  }
  // magnet pickup
  const cap = heroCap(w);
  for (let i = w.ground.length - 1; i >= 0; i--) {
    const g = w.ground[i]; if (g.age < 0.4) continue;
    if (dist(h.x, h.y, g.x, g.y) < 80 && h.stack.length < cap) { w.ground.splice(i, 1); h.stack.push(g.type); w.events.push({ t: 'fly', item: g.type, fx: g.x, fy: g.y, fz: g.z, to: 'hero' }); w.events.push({ t: 'pick', x: h.x, y: h.y }); }
  }
  // transfers
  transferT -= dt;
  if (transferT > 0) return;
  const ctx = heroContext(w);
  if (!ctx) return;
  if (ctx.kind === 'pad') { if (payPad(w, ctx.pad)) transferT = 0.045; return; }
  if (ctx.kind !== 'slot') return;
  const b = ctx.b, top = h.stack.length ? h.stack[h.stack.length - 1] : null;
  const toward = (item: ItemId | 'coin', x: number, y: number) => w.events.push({ t: 'fly', item, fx: h.x, fy: h.y, fz: 40, to: { x, y } });
  switch (ctx.slot) {
    case 'sell': if (top) { h.stack.pop(); toward(top, b.x, b.y + 20); sell(w, top, 1, b.x + (Math.random() - 0.5) * 50, b.y - 40); transferT = 0.06; } break;
    case 'deposit': if (top && storageFree(b) > 0) { h.stack.pop(); toward(top, b.x, b.y + 20); invAdd(b.store, top, 1); w.events.push({ t: 'drop', x: b.x, y: b.y }); transferT = 0.05; } break;
    case 'sawIn': { const s = levelStats(b); const i = h.stack.lastIndexOf('log'); if (i >= 0 && invGet(b.input, 'log') + invGet(b.incoming, 'log') < s.inCap) { h.stack.splice(i, 1); toward('log', b.x - 58, b.y + 40); invAdd(b.input, 'log', 1); w.events.push({ t: 'drop', x: b.x, y: b.y }); transferT = 0.06; } break; }
    case 'sawOut': if (h.stack.length < cap && available(b, 'plank') > 0) { invAdd(b.store, 'plank', -1); h.stack.push('plank'); w.events.push({ t: 'fly', item: 'plank', fx: b.x + 58, fy: b.y + 40, fz: 10, to: 'hero' }); w.events.push({ t: 'pick', x: h.x, y: h.y }); transferT = 0.07; } break;
  }
}

export { ITEMS, hurtHero };
