import { BUILD, TC, type ItemId, type SlotKind } from '../content/data';
import { collide } from './physics';
import { harvestNode, updateCats } from './logistics';
import { addFuel, barracksTick, deliverToSite, production, sell } from './economy';
import { damageEnemy, updateClock, updateUnits } from './night';
import { frontVisitor, offerAt, payOffer, serveOne, takeTill, updateOffers, updateVisitors } from './town';
import { available, dist, heroCap, heroDmg, heroMaxHp, heroSpeed, heroSwing, invAdd, invGet, nodeOpen, procStats, storageFree, type Building, type World } from './world';

export interface Input { x: number; y: number }
export type Slot = { slot: SlotKind | 'site'; b: Building } | null;

/** Slot the hero stands on (drives automatic transfers). */
export function heroSlot(w: World): Slot {
  const h = w.hero;
  for (const b of Object.values(w.buildings)) {
    if (b.site) { if (dist(h.x, h.y, b.x, b.y) < BUILD[b.type].r + 34) return { slot: 'site', b }; continue; }
    for (const s of BUILD[b.type].slots || []) if (Math.abs(h.x - (b.x + s.dx)) < 30 && Math.abs(h.y - (b.y + s.dy)) < 26) return { slot: s.kind, b };
  }
  return null;
}
/** Nearest building for the info chip. */
export function nearBuilding(w: World): Building | null {
  const h = w.hero; let best: Building | null = null, bd = 1e9;
  for (const b of Object.values(w.buildings)) { const d = dist(h.x, h.y, b.x, b.y), m = BUILD[b.type].r + 70; if (d < m && d < bd) { bd = d; best = b; } }
  return best;
}

let transferT = 0;
export function step(w: World, input: Input, dt: number) {
  w.time += dt;
  heroUpdate(w, input, dt);
  for (const n of w.nodes) {
    if (n.shake > 0) n.shake = Math.max(0, n.shake - dt * 4);
    if (!n.alive) { n.regrow -= dt; if (n.regrow <= 0) { n.alive = true; n.hp = n.maxHp; n.grow = 0; } }
    else if (n.grow < 1) n.grow = Math.min(1, n.grow + dt * 1.6);
  }
  production(w, dt);
  barracksTick(w, dt);
  updateCats(w, dt);
  updateUnits(w, dt);
  updateClock(w, dt);
  updateOffers(w, dt);
  updateVisitors(w, dt);
  for (const g of w.ground) { g.age += dt; if (g.z > 0 || g.vz > 0) { g.vz -= 500 * dt; g.z += g.vz * dt; if (g.z < 0) { g.z = 0; g.vz = Math.abs(g.vz) > 60 ? -g.vz * 0.35 : 0; } } }
  if (w.ground.length > 160) w.ground.splice(0, w.ground.length - 160);
}

function heroUpdate(w: World, input: Input, dt: number) {
  const h = w.hero;
  if (h.dead > 0) {
    h.dead -= dt;
    if (h.dead <= 0) { const heart = w.buildings.heart; h.x = heart?.x ?? TC.x; h.y = (heart?.y ?? TC.y) + 60; h.hp = heroMaxHp(w); h.inv = 2; w.events.push({ t: 'respawn' }); }
    return;
  }
  let ix = input.x, iy = input.y; const m = Math.hypot(ix, iy); if (m > 1) { ix /= m; iy /= m; }
  const sp = heroSpeed(w), k = Math.min(1, dt * 14);
  h.vx += (ix * sp - h.vx) * k; h.vy += (iy * sp - h.vy) * k;
  h.x += h.vx * dt; h.y += h.vy * dt;
  h.moving = Math.hypot(h.vx, h.vy) > 25;
  if (h.moving) h.walkT += dt * Math.hypot(h.vx, h.vy) / 185;
  if (h.vx > 45) h.face = 1; else if (h.vx < -45) h.face = -1; // hysteresis: no flicker when running up or down
  collide(w, h, 13);
  if (h.inv > 0) h.inv -= dt; if (h.hurtT > 0) h.hurtT -= dt;
  h.regenT -= dt;
  if (h.regenT <= 0 && h.hp < heroMaxHp(w)) { h.hp++; h.regenT = w.clock.phase === 'night' ? 3 : 1; }

  h.swingT -= dt; if (h.swing > 0) h.swing = Math.max(0, h.swing - dt * 4.5);
  if (h.swingT <= 0) {
    let target = null as null | World['enemies'][number], bd = 1e9;
    for (const e of w.enemies) { if (e.z > 20) continue; const d = dist(h.x, h.y, e.x, e.y); if (d < e.r + 42 && d < bd) { bd = d; target = e; } }
    if (target) {
      h.form = 'saw'; h.face = target.x > h.x ? 1 : -1;
      for (const e of w.enemies.slice()) { if (e.z > 20) continue; const dx = e.x - h.x; if (dist(h.x, h.y, e.x, e.y) < e.r + 50 && (dx * h.face > -10 || e === target)) damageEnemy(w, e, heroDmg(w) * 2, h.x, h.y); }
      h.swing = 1; h.swingT = heroSwing(w) * 1.1;
    } else {
      let nd = null as null | World['nodes'][number]; bd = 1e9;
      for (const n of w.nodes) { if (!n.alive || !nodeOpen(w, n)) continue; const d = dist(h.x, h.y, n.x, n.y); if (d < (n.kind === 'rock' ? 50 : 44) && d < bd) { bd = d; nd = n; } }
      if (nd && h.stack.length < heroCap(w)) { h.form = 'axe'; h.face = nd.x > h.x ? 1 : -1; harvestNode(w, nd, 'hero', heroDmg(w) * (nd.kind === 'rock' ? 0.8 : 1)); h.swing = 1; h.swingT = heroSwing(w); }
    }
  }
  const cap = heroCap(w);
  for (let i = w.ground.length - 1; i >= 0; i--) {
    const g = w.ground[i]; if (g.age < 0.4) continue;
    if (dist(h.x, h.y, g.x, g.y) < 80 && h.stack.length < cap) { w.ground.splice(i, 1); h.stack.push(g.type); w.events.push({ t: 'fly', item: g.type, fx: g.x, fy: g.y, fz: g.z, to: 'hero' }); w.events.push({ t: 'pick', x: h.x, y: h.y }); }
  }
  transferT -= dt;
  if (transferT > 0) return;
  const slow = Math.hypot(h.vx, h.vy) <= 70;
  const off = offerAt(w, h.x, h.y);
  if (off) { if (!slow) { h.padT = 0; return; } h.padT = (h.padT || 0) + dt; if (h.padT >= 0.25 && payOffer(w, off)) transferT = 0.05; return; }
  const s = heroSlot(w); if (!s) { h.padT = 0; return; }
  // pads act only once the hero stops on them, so running past the owl never sells the bag by accident
  if (s.slot !== 'site') { if (Math.hypot(h.vx, h.vy) > 70) { h.padT = 0; return; } h.padT = (h.padT || 0) + dt; if (h.padT < 0.25) return; }
  const b = s.b, top = h.stack.length ? h.stack[h.stack.length - 1] : null;
  const toward = (item: ItemId, x: number, y: number) => w.events.push({ t: 'fly', item, fx: h.x, fy: h.y, fz: 40, to: { x, y } });
  const takeOf = (k: ItemId) => { const i = h.stack.lastIndexOf(k); if (i < 0) return false; h.stack.splice(i, 1); return true; };
  switch (s.slot) {
    case 'sell': {
      const v = frontVisitor(w);
      if (v && takeOf(v.want)) { serveOne(w, v); transferT = 0.08; break; }   // customers first
      if (w.till > 0) { takeTill(w); transferT = 0.05; break; }              // then the till on the counter
      const keep = new Set(w.visitors.filter(x => x.state !== 'leave').map(x => x.want));
      const i = h.stack.map((k, j) => [k, j] as const).reverse().find(([k]) => !keep.has(k))?.[1];
      if (i !== undefined) { const k = h.stack.splice(i, 1)[0]; toward(k, b.x, b.y); sell(w, k, 1, b.x + (Math.random() - 0.5) * 50, b.y - 60); transferT = 0.06; }
      break;
    }
    case 'deposit': if (top && storageFree(b) > 0) { h.stack.pop(); toward(top, b.x, b.y); invAdd(b.store, top, 1); w.events.push({ t: 'drop', x: b.x, y: b.y }); transferT = 0.05; } break;
    case 'in': { const p = procStats(b); if (invGet(b.input, p.input) + invGet(b.incoming, p.input) < p.inCap && takeOf(p.input)) { toward(p.input, b.x, b.y); invAdd(b.input, p.input, 1); w.events.push({ t: 'drop', x: b.x, y: b.y }); transferT = 0.06; } break; }
    case 'out': { const p = procStats(b); if (h.stack.length < cap && available(b, p.output) > 0) { invAdd(b.store, p.output, -1); h.stack.push(p.output); w.events.push({ t: 'fly', item: p.output, fx: b.x, fy: b.y, fz: 10, to: 'hero' }); w.events.push({ t: 'pick', x: h.x, y: h.y }); transferT = 0.07; } break; }
    case 'fuel': { const f = BUILD[b.type].fuel!; if (b.fuel <= f.cap - 1 && takeOf(f.item)) { toward(f.item, b.x, b.y - 10); addFuel(w, b, 1); w.events.push({ t: 'drop', x: b.x, y: b.y }); transferT = 0.08; } break; }
    case 'site': { for (const k of Object.keys(b.site || {}) as ItemId[]) if (takeOf(k)) { toward(k, b.x, b.y); invAdd(b.incoming, k, 1); deliverToSite(w, b, k, 1); w.events.push({ t: 'pay', x: b.x, y: b.y }); transferT = 0.06; break; } break; }
  }
}
