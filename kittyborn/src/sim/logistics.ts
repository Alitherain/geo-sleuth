// Cat AI and the job board.
// Buildings expose needs (production input, construction sites, fuel) and sources (production output, storage).
// An idle hauler scores every possible trip and claims the best one. Claims reserve the amount at both ends,
// so two cats never chase the same goods and a cat finishes the trip it started.
import { BUILD, ITEMS, TC, type GatherKind, type ItemId } from '../content/data';
import { collide, walkTo } from './physics';
import { heroCap, allOf, available, catBoost, invTotal, levelStats, catCap, catSpeed, dist, invAdd, invGet, nodeOpen, procStats, storageFree, type Building, type Cat, type P, type ResNode, type World } from './world';
import { addFuel, deliverToSite, sell } from './economy';

// ---------------------------------------------------------------- endpoints: "<buildingId>|<part>"
type Part = 'in' | 'out' | 'store' | 'site' | 'fuel' | 'sell';
const ep = (b: Building, part: Part) => b.id + '|' + part;
const parse = (w: World, s: string): [Building | undefined, Part] => { const [id, part] = s.split('|'); return [w.buildings[id], part as Part]; };
export function endpointPos(w: World, s: string): P | null {
  const [b, part] = parse(w, s); if (!b) return null;
  if (part === 'site') return { x: b.x, y: b.y + BUILD[b.type].r + 10 };
  const want = part === 'store' ? 'deposit' : part;
  const slot = (BUILD[b.type].slots || []).find(x => x.kind === want) || (want === 'deposit' ? (BUILD[b.type].slots || []).find(x => x.kind === 'in') : undefined);
  return slot ? { x: b.x + slot.dx, y: b.y + slot.dy } : { x: b.x, y: b.y + BUILD[b.type].r + 10 };
}
function reserveSource(w: World, s: string, k: ItemId, n: number) { const [b] = parse(w, s); if (b) invAdd(b.reserved, k, n); }
function reserveTarget(w: World, s: string, k: ItemId, n: number) { const [b, part] = parse(w, s); if (b && part !== 'sell') invAdd(b.incoming, k, n); }
function takeFrom(w: World, s: string, k: ItemId, n: number): number {
  const [b] = parse(w, s); if (!b) return 0;
  invAdd(b.reserved, k, -n);
  const got = Math.min(n, invGet(b.store, k)); invAdd(b.store, k, -got); return got;
}
function giveTo(w: World, s: string, k: ItemId, at: P) {
  const [b, part] = parse(w, s);
  if (!b) return;
  if (part === 'sell') { sell(w, k, 1, at.x, at.y - 50); return; }
  if (part === 'site') { deliverToSite(w, b, k, 1); return; }
  invAdd(b.incoming, k, -1);
  if (part === 'fuel') addFuel(w, b, 1);
  else if (part === 'in') invAdd(b.input, k, 1);
  else invAdd(b.store, k, 1);
}
export function releaseTask(w: World, c: Cat) {
  const t = c.task; if (!t) return;
  if (t.kind === 'haul' && t.item) {
    if (t.stage === 'toSource' && t.from) reserveSource(w, t.from, t.item, -t.n);
    if (t.to) reserveTarget(w, t.to, t.item, -(t.stage === 'toSource' ? t.n : c.stack.filter(i => i === t.item).length));
  }
  if (t.kind === 'harvest' && t.node) { const n = w.nodes.find(x => x.id === t.node); if (n && n.claimedBy === c.id) n.claimedBy = 0; }
  c.task = null;
}

// ---------------------------------------------------------------- needs
export const RESERVE: Partial<Record<ItemId, number>> = { plank: 30, lav: 20, log: 20, stone: 25, berry: 15, meat: 10, candle: 12, fluff: 25 };
export interface Trip { from: string; to: string; item: ItemId; n: number; prio: number; why: string }
const shopEp = (w: World) => { const s = w.buildings.shop; return s ? ep(s, 'sell') : ''; };
function bestStorage(w: World, n: number, near: P): Building | undefined {
  return allOf(w, 'storage').filter(s => storageFree(s) >= n).sort((a, b) => dist(a.x, a.y, near.x, near.y) - dist(b.x, b.y, near.x, near.y))[0];
}
function sourceFor(w: World, k: ItemId, near: P): Building | undefined {
  return allOf(w, 'storage').filter(s => available(s, k) > 0).sort((a, b) => dist(a.x, a.y, near.x, near.y) - dist(b.x, b.y, near.x, near.y))[0];
}
export function fuelNeed(b: Building): number {
  const f = BUILD[b.type].fuel; if (!f || b.site) return 0;
  return Math.floor(f.cap - b.fuel - invGet(b.incoming, f.item));
}

export function listTrips(w: World, cap: number): Trip[] {
  const trips: Trip[] = [];
  const night = w.clock.phase !== 'day';
  for (const b of Object.values(w.buildings)) {
    const def = BUILD[b.type];
    if (b.site) {
      for (const [k, n] of Object.entries(b.site) as [ItemId, number][]) {
        const miss = n - invGet(b.incoming, k), src = sourceFor(w, k, b);
        if (miss > 0 && src) trips.push({ from: ep(src, 'store'), to: ep(b, 'site'), item: k, n: Math.min(cap, miss, available(src, k)), prio: 3, why: `Будова: ${def.name}` });
      }
      continue;
    }
    if (def.fuel) {
      const need = fuelNeed(b), src = sourceFor(w, def.fuel.item, b);
      if (src && need >= Math.min(cap, def.fuel.cap * 0.5)) trips.push({ from: ep(src, 'store'), to: ep(b, 'fuel'), item: def.fuel.item, n: Math.min(cap, need, available(src, def.fuel.item)), prio: b.fuel < def.fuel.cap * 0.2 ? 6 : night ? 5 : 3, why: `Паливо: ${def.name}` });
    }
    if (def.proc) {
      const p = procStats(b);
      const out = available(b, p.output), blocked = invGet(b.store, p.output) >= p.outCap * 0.7;
      if (out >= Math.min(cap, 4) || (blocked && out > 0)) {
        const st = bestStorage(w, Math.min(cap, out), b);
        trips.push({ from: ep(b, 'out'), to: st ? ep(st, 'store') : shopEp(w), item: p.output, n: Math.min(cap, out), prio: blocked ? 3 : 2, why: `Забрати: ${ITEMS[p.output].name.toLowerCase()}` });
      }
      const want = p.inCap - invGet(b.input, p.input) - invGet(b.incoming, p.input), src = sourceFor(w, p.input, b);
      if (src && want >= Math.min(cap, 4)) trips.push({ from: ep(src, 'store'), to: ep(b, 'in'), item: p.input, n: Math.min(cap, want, available(src, p.input)), prio: invGet(b.input, p.input) === 0 ? 3 : 2, why: `Підвезти: ${ITEMS[p.input].name.toLowerCase()}` });
    }
  }
  // shop shelves: keep a little of everything, more of what the queue asks for
  for (const sh of allOf(w, 'store')) {
    const scap = levelStats(sh).cap || 40, room = scap - invTotal(sh.store) - invTotal(sh.incoming);
    if (room <= 0) continue;
    for (const k of ['log', 'plank', 'berry', 'stone', 'candle', 'lav'] as ItemId[]) {
      const asked = w.visitors.filter(v => v.state !== 'leave' && v.want === k).reduce((q, v) => q + v.n, 0);
      const need = Math.min(room, Math.max(asked, Math.floor(scap / 5)) - invGet(sh.store, k) - invGet(sh.incoming, k));
      const src = sourceFor(w, k, sh), spare = src ? available(src, k) - Math.floor((RESERVE[k] || 0) / 2) : 0;
      if (src && need >= Math.min(scap / 10, 3) && spare > 0) trips.push({ from: ep(src, 'store'), to: ep(sh, 'store'), item: k, n: Math.min(cap, need, spare), prio: asked ? 3 : 2, why: `На полиці: ${ITEMS[k].name.toLowerCase()}` });
    }
  }
  if (w.buildings.shop) for (const st of allOf(w, 'storage')) for (const k of Object.keys(ITEMS) as ItemId[]) {
    const surplus = available(st, k) - (RESERVE[k] || 0);
    if (surplus >= Math.min(cap, 4)) trips.push({ from: ep(st, 'store'), to: shopEp(w), item: k, n: Math.min(cap, surplus), prio: 1, why: 'Продати надлишок' });
  }
  return trips;
}

/** Where a cat should drop an item it already carries. */
function dropTarget(w: World, k: ItemId, n: number, near: P): string {
  for (const b of Object.values(w.buildings)) { const f = BUILD[b.type].fuel; if (f && f.item === k && !b.site && b.fuel + invGet(b.incoming, k) < f.cap * 0.4) return ep(b, 'fuel'); }
  for (const b of Object.values(w.buildings)) if (b.site && invGet(b.site, k) - invGet(b.incoming, k) >= 1) return ep(b, 'site');
  for (const b of Object.values(w.buildings)) { const p = BUILD[b.type].proc; if (p && p.input === k && !b.site) { const s = procStats(b); if (invGet(b.input, k) + invGet(b.incoming, k) + n <= s.inCap) return ep(b, 'in'); } }
  const hauler = w.cats.some(c => c.role === 'hauler');
  const st = bestStorage(w, n, near);
  if (st && (hauler || k !== 'log')) return ep(st, 'store');
  return shopEp(w);
}

// ---------------------------------------------------------------- spawning
export function syncCats(w: World) {
  for (const b of Object.values(w.buildings)) {
    const role = BUILD[b.type].role; if (!role || b.site) continue;
    const want = BUILD[b.type].levels ? (BUILD[b.type].levels![b.level - 1].stats.cats || 1) : 1;
    const have = w.cats.filter(c => c.home === b.id).length;
    for (let i = have; i < want; i++) {
      w.cats.push({ id: w.nextId++, role, home: b.id, x: b.x, y: b.y + BUILD[b.type].r + 14, face: 1, walkT: 0, moving: false, stack: [], task: null, idle: '', swingT: 0, swing: 0, waitT: 0, stuckT: 0, lx: b.x, ly: b.y, hidden: false });
      if (Math.random() < 0.4) w.events.push({ t: 'bubble', who: w.cats[w.cats.length - 1].id, s: 'На зміні.' });
    }
  }
}

// ---------------------------------------------------------------- per-cat update
export function updateCats(w: World, dt: number) {
  for (const c of w.cats) {
    c.swingT -= dt; if (c.swing > 0) c.swing = Math.max(0, c.swing - dt * 4.5);
    c.stuckT += dt;
    if (c.stuckT > 0.9) { if (c.moving && dist(c.x, c.y, c.lx, c.ly) < 6) { c.x += (Math.random() - 0.5) * 34; c.y += (Math.random() - 0.5) * 34; } c.lx = c.x; c.ly = c.y; c.stuckT = 0; }
    if (w.clock.phase === 'night' && c.role === 'gatherer') { goHome(w, c, dt); continue; }
    if (c.hidden) { c.hidden = false; const h = w.buildings[c.home]; if (h) { c.x = h.x; c.y = h.y + BUILD[h.type].r + 14; } }
    if (c.role === 'gatherer') gatherer(w, c, dt);
    else if (c.role === 'hauler') hauler(w, c, dt);
    else master(w, c, dt);
    if (!c.hidden) collide(w, c, 10);
  }
}
function goHome(w: World, c: Cat, dt: number) {
  if (c.task?.kind === 'harvest') releaseTask(w, c);
  if (c.task?.kind === 'haul') { carry(w, c, dt); return; } // finish the delivery first
  if (c.hidden) return;
  const h = w.buildings[c.home]; if (!h) return;
  if (walkTo(w, c, h.x, h.y + 26, catSpeed(w) * 1.3, dt, 8)) c.hidden = true;
  collide(w, c, 10);
}
const GATHER_NODES: Record<GatherKind, ResNode['kind'][]> = { wood: ['oak', 'pine', 'lav'], stone: ['rock'], berry: ['bush'] };
function gatherer(w: World, c: Cat, dt: number) {
  const cap = catCap(w, c);
  if (c.task?.kind === 'haul') return carry(w, c, dt);
  if (c.stack.length >= cap || (c.stack.length > 0 && c.waitT > 4)) {
    releaseTask(w, c); c.waitT = 0;
    const k = c.stack[c.stack.length - 1], n = c.stack.filter(i => i === k).length, to = dropTarget(w, k, n, c);
    reserveTarget(w, to, k, n); c.task = { kind: 'haul', item: k, to, n, stage: 'toTarget' };
    return;
  }
  const kinds = GATHER_NODES[w.buildings[c.home]?.gather || 'wood'];
  let t = c.task?.kind === 'harvest' ? w.nodes.find(x => x.id === c.task!.node) : undefined;
  if (!t || !t.alive || !nodeOpen(w, t)) {
    if (c.task) releaseTask(w, c);
    const st = allOf(w, 'storage')[0], wantLav = !!w.flags.hedge && (!st || invGet(st.store, 'lav') < 25);
    let best: ResNode | undefined, bd = 1e9;
    for (const n of w.nodes) {
      if (!n.alive || !kinds.includes(n.kind) || !nodeOpen(w, n) || (n.claimedBy && n.claimedBy !== c.id)) continue;
      const d = dist(c.x, c.y, n.x, n.y) - (wantLav && n.kind === 'lav' ? 500 : 0);
      if (d < bd) { bd = d; best = n; }
    }
    t = best;
    if (t) { t.claimedBy = c.id; c.task = { kind: 'harvest', node: t.id, n: 0, stage: 'work' }; c.idle = ''; }
  }
  if (!t) { c.idle = kinds[0] === 'rock' ? 'Нема каменю' : kinds[0] === 'bush' ? 'Ягоди ще не виросли' : 'Нема дерев'; c.waitT += dt; c.moving = false; return; }
  c.waitT = 0;
  if (dist(c.x, c.y, t.x, t.y) > 34) walkTo(w, c, t.x + (c.x < t.x ? -26 : 26), t.y + 4, catSpeed(w), dt, 6);
  else { c.moving = false; c.face = t.x > c.x ? 1 : -1; if (c.swingT <= 0) { c.swing = 1; c.swingT = 0.8 / catBoost(w); harvestNode(w, t, c); } }
}
function hauler(w: World, c: Cat, dt: number) {
  if (c.task) return carry(w, c, dt);
  const cap = catCap(w, c);
  let best: Trip | null = null, bs = -1e9;
  for (const tr of listTrips(w, cap)) {
    const a = endpointPos(w, tr.from), b = endpointPos(w, tr.to); if (!a || !b) continue;
    const s = tr.prio * 1000 + tr.n * 20 - dist(c.x, c.y, a.x, a.y) - dist(a.x, a.y, b.x, b.y) * 0.5;
    if (s > bs) { bs = s; best = tr; }
  }
  if (best) { reserveSource(w, best.from, best.item, best.n); reserveTarget(w, best.to, best.item, best.n); c.task = { kind: 'haul', item: best.item, from: best.from, to: best.to, n: best.n, stage: 'toSource' }; c.idle = ''; return; }
  // pick up loot on the ground near town
  const g = w.ground.filter(x => x.age > 1 && dist(x.x, x.y, TC.x, TC.y) < 900).sort((a, b) => dist(c.x, c.y, a.x, a.y) - dist(c.x, c.y, b.x, b.y))[0];
  if (g) {
    if (walkTo(w, c, g.x, g.y, catSpeed(w), dt, 10)) {
      for (let i = w.ground.length - 1; i >= 0 && c.stack.length < cap; i--) { const q = w.ground[i]; if (dist(q.x, q.y, c.x, c.y) < 50) { c.stack.push(q.type); w.ground.splice(i, 1); w.events.push({ t: 'fly', item: q.type, fx: q.x, fy: q.y, fz: 0, to: c.id }); } }
      if (c.stack.length && (c.stack.length >= cap || !w.ground.some(q => dist(q.x, q.y, c.x, c.y) < 200))) deliverCarried(w, c);
    }
    c.idle = ''; return;
  }
  if (c.stack.length) { deliverCarried(w, c); return; }
  const st = allOf(w, 'storage')[0];
  c.idle = st && storageFree(st) <= 0 ? 'Склад повний' : 'Нема роботи';
  const h = w.buildings[c.home]; if (h) walkTo(w, c, h.x + 30, h.y + 40, catSpeed(w) * 0.5, dt, 12);
}
function deliverCarried(w: World, c: Cat) {
  const k = c.stack[c.stack.length - 1], n = c.stack.filter(i => i === k).length, to = dropTarget(w, k, n, c);
  reserveTarget(w, to, k, n); c.task = { kind: 'haul', item: k, to, n, stage: 'toTarget' };
}
function carry(w: World, c: Cat, dt: number) {
  const t = c.task!;
  if (t.stage === 'toSource' && t.from) {
    const p = endpointPos(w, t.from);
    if (!p) { releaseTask(w, c); return; }
    if (walkTo(w, c, p.x, p.y, catSpeed(w), dt, 6)) {
      const got = takeFrom(w, t.from, t.item!, t.n);
      for (let i = 0; i < got; i++) { c.stack.push(t.item!); w.events.push({ t: 'fly', item: t.item!, fx: p.x, fy: p.y, fz: 10, to: c.id }); }
      if (got < t.n && t.to) reserveTarget(w, t.to, t.item!, got - t.n);
      t.n = got; t.stage = 'toTarget';
      if (got === 0) c.task = null;
    }
    return;
  }
  const p = t.to ? endpointPos(w, t.to) : null;
  const [tb, part] = t.to ? parse(w, t.to) : [undefined, 'store' as Part];
  if (!p || (part === 'site' && tb && !tb.site)) { // target vanished or finished: re-route what we carry
    if (tb && t.to) reserveTarget(w, t.to, t.item!, -c.stack.filter(i => i === t.item).length);
    const k = t.item!, n = c.stack.filter(i => i === k).length; if (!n) { c.task = null; return; }
    const to = dropTarget(w, k, n, c); reserveTarget(w, to, k, n); t.to = to; return;
  }
  if (walkTo(w, c, p.x, p.y, catSpeed(w), dt, 6)) {
    c.moving = false;
    if (c.swingT > 0) return;
    const i = c.stack.lastIndexOf(t.item!);
    if (i < 0) { c.task = null; return; }
    c.stack.splice(i, 1);
    w.events.push({ t: 'fly', item: t.item!, fx: c.x, fy: c.y, fz: 26, to: { x: p.x, y: p.y - 20 } });
    giveTo(w, t.to!, t.item!, p);
    t.n--; c.swingT = 0.1;
    if (!c.stack.includes(t.item!)) { if (t.n > 0) reserveTarget(w, t.to!, t.item!, -t.n); c.task = null; }
  }
}
function master(w: World, c: Cat, dt: number) {
  const dmg = Object.values(w.buildings).filter(b => !b.site && (b.type === 'palisade' || b.type === 'tower' || BUILD[b.type].fuel) && b.hp < b.maxHp)
    .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  if (!dmg) { c.idle = 'Усе ціле'; const h = w.buildings[c.home]; if (h) walkTo(w, c, h.x - 30, h.y + 40, catSpeed(w) * 0.5, dt, 12); return; }
  c.idle = '';
  if (walkTo(w, c, dmg.x + (c.x < dmg.x ? -BUILD[dmg.type].r - 10 : BUILD[dmg.type].r + 10), dmg.y + 14, catSpeed(w), dt, 8)) {
    c.moving = false; c.face = dmg.x > c.x ? 1 : -1;
    if (c.swingT <= 0) { c.swing = 1; c.swingT = 0.5; dmg.hp = Math.min(dmg.maxHp, dmg.hp + 6 * catBoost(w)); w.events.push({ t: 'chop', x: dmg.x, y: dmg.y, kind: 'repair' }); }
  }
}

// ---------------------------------------------------------------- shared actions (hero uses them too)
export function harvestNode(w: World, n: ResNode, by: Cat | 'hero', dmg = 1) {
  n.hp -= dmg; n.shake = 1;
  if (by === 'hero') w.flags['got_' + n.item] = true;
  w.events.push({ t: n.kind === 'rock' ? 'mine' : 'chop', x: n.x, y: n.y, kind: by === 'hero' ? 'hero' : 'cat' });
  if (n.hp > 0) return;
  n.alive = false; n.claimedBy = 0;
  n.regrow = n.kind === 'lav' ? 45 : n.kind === 'rock' ? 70 : n.kind === 'bush' ? 35 : 28;
  w.stats.felled++;
  w.events.push({ t: 'fell', x: n.x, y: n.y, kind: n.kind });
  const holder = by === 'hero' ? w.hero : by, cap = by === 'hero' ? heroCap(w) : catCap(w, by);
  for (let i = 0; i < n.yield; i++) {
    if (holder.stack.length < cap) { holder.stack.push(n.item); w.events.push({ t: 'fly', item: n.item, fx: n.x, fy: n.y, fz: 20, to: by === 'hero' ? 'hero' : by.id }); }
    else w.ground.push({ id: w.nextId++, type: n.item, x: n.x + (Math.random() - 0.5) * 50, y: n.y + (Math.random() - 0.3) * 30, z: 30, vz: 100, age: 0 });
  }
}
