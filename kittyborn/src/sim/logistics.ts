// Cat AI and the job board.
// Buildings and pads expose needs and sources; an idle cat scores every possible trip and claims the best one.
// Claims reserve the amount at the source and at the target, so two cats never chase the same goods,
// and a cat finishes the trip it started instead of turning around for every new item.
import { BUILDINGS, GAPS, ITEMS, PADS, type CatRole, type GapId, type ItemId } from '../content/data';
import { collide, moveToward, routeVia } from './physics';
import { available, catCap, catSpeed, costItems, dist, invAdd, invGet, invTotal, isDone, levelStats, padVisible, storageFree, treeOpen, type Building, type Cat, type P, type Task, type World } from './world';
import { checkPadDone, sell } from './economy';

// ---------------------------------------------------------------- endpoints
// 'sawmill:in' | 'sawmill:out' | 'storage' | 'shop' | 'pad:<id>'
export function endpointPos(w: World, ep: string): P | null {
  if (ep.startsWith('pad:')) { const p = w.pads[ep.slice(4)]; return p ? { x: p.def.x, y: p.def.y } : null; }
  const [id, part] = ep.split(':'); const b = w.buildings[id]; if (!b) return null;
  const slots = BUILDINGS[b.type].slots || [];
  const s = part === 'in' ? slots.find(x => x.kind === 'sawIn') : part === 'out' ? slots.find(x => x.kind === 'sawOut') : slots[0];
  return s ? { x: b.x + s.dx, y: b.y + s.dy } : { x: b.x, y: b.y + 40 };
}
function reserveSource(w: World, ep: string, k: ItemId, n: number) { const b = w.buildings[ep.split(':')[0]]; if (b) invAdd(b.reserved, k, n); }
function reserveTarget(w: World, ep: string, k: ItemId, n: number) {
  if (ep.startsWith('pad:')) { const p = w.pads[ep.slice(4)]; if (p) invAdd(p.incoming, k, n); return; }
  const b = w.buildings[ep.split(':')[0]]; if (b && ep !== 'shop') invAdd(b.incoming, k, n);
}
function takeFrom(w: World, ep: string, k: ItemId, n: number): number {
  const b = w.buildings[ep.split(':')[0]]; if (!b) return 0;
  invAdd(b.reserved, k, -n);
  const got = Math.min(n, invGet(b.store, k)); invAdd(b.store, k, -got); return got;
}
function giveTo(w: World, ep: string, k: ItemId, n: number, at: P) {
  if (ep === 'shop') { sell(w, k, n, at.x, at.y - 60); return; }
  if (ep.startsWith('pad:')) {
    const p = w.pads[ep.slice(4)];
    if (!p) { const s = w.buildings['storage']; if (s) invAdd(s.store, k, n); else sell(w, k, n, at.x, at.y); return; }
    invAdd(p.incoming, k, -n); invAdd(p.items, k, n); checkPadDone(w, p); return;
  }
  const [id, part] = ep.split(':'); const b = w.buildings[id]; if (!b) return;
  invAdd(b.incoming, k, -n);
  if (part === 'in') invAdd(b.input, k, n); else invAdd(b.store, k, n);
}
export function releaseTask(w: World, c: Cat) {
  const t = c.task; if (!t) return;
  if (t.kind === 'haul' && t.item) {
    if (t.stage === 'toSource' && t.from) reserveSource(w, t.from, t.item, -t.n);
    if (t.to) reserveTarget(w, t.to, t.item, -(t.stage === 'toSource' ? t.n : c.stack.filter(i => i === t.item).length));
  }
  if (t.kind === 'harvest' && t.tree) { const tr = w.trees.find(x => x.id === t.tree); if (tr && tr.claimedBy === c.id) tr.claimedBy = 0; }
  c.task = null;
}

// ---------------------------------------------------------------- needs
const RESERVE: Partial<Record<ItemId, number>> = { plank: 30, lav: 20, log: 15, fluff: 25, meat: 0 };
export interface Trip { from: string; to: string; item: ItemId; n: number; prio: number; why: string }

/** Every trip worth making right now, ignoring who makes it. */
export function listTrips(w: World, cap: number): Trip[] {
  const trips: Trip[] = [];
  const st = w.buildings['storage'], saw = w.buildings['sawmill'];
  const sinkFor = (k: ItemId, n: number): string => (st && storageFree(st) >= n ? 'storage' : 'shop');
  if (saw) {
    const s = levelStats(saw);
    const out = available(saw, 'plank');
    const blocked = invGet(saw.store, 'plank') >= s.outCap * 0.7;
    if (out >= Math.min(cap, 4) || (blocked && out > 0)) trips.push({ from: 'sawmill:out', to: sinkFor('plank', Math.min(cap, out)), item: 'plank', n: Math.min(cap, out), prio: blocked ? 3 : 2, why: 'Забрати дошки з лісопилки' });
    const want = s.inCap - invGet(saw.input, 'log') - invGet(saw.incoming, 'log');
    if (st && want >= Math.min(cap, 4) && available(st, 'log') > 0) trips.push({ from: 'storage', to: 'sawmill:in', item: 'log', n: Math.min(cap, want, available(st, 'log')), prio: invGet(saw.input, 'log') === 0 ? 3 : 2, why: 'Підвезти колоди на лісопилку' });
  }
  if (st) {
    for (const p of Object.values(w.pads)) {
      if (!padVisible(w, p)) continue;
      for (const [k, n] of costItems(p.def.cost)) {
        const miss = n - invGet(p.items, k) - invGet(p.incoming, k);
        const av = available(st, k);
        if (miss > 0 && av > 0) trips.push({ from: 'storage', to: 'pad:' + p.def.id, item: k, n: Math.min(cap, miss, av), prio: 3, why: `Привезти на будову: ${p.def.name}` });
      }
    }
    for (const k of Object.keys(ITEMS) as ItemId[]) {
      const surplus = available(st, k) - (RESERVE[k] || 0);
      if (surplus >= Math.min(cap, 4) || (k === 'meat' && surplus > 0)) trips.push({ from: 'storage', to: 'shop', item: k, n: Math.min(cap, surplus), prio: 1, why: 'Продати надлишок' });
    }
  }
  return trips;
}

function claimTrip(w: World, c: Cat, tr: Trip) {
  reserveSource(w, tr.from, tr.item, tr.n);
  reserveTarget(w, tr.to, tr.item, tr.n);
  c.task = { kind: 'haul', item: tr.item, from: tr.from, to: tr.to, n: tr.n, stage: 'toSource' };
}

/** Where a lumber cat should drop an item it already carries. */
function dropTarget(w: World, k: ItemId, n: number): string {
  const saw = w.buildings['sawmill'], st = w.buildings['storage'];
  if (k === 'log' && saw) { const s = levelStats(saw); if (invGet(saw.input, 'log') + invGet(saw.incoming, 'log') + n <= s.inCap) return 'sawmill:in'; }
  // without a hauler nobody moves goods out of storage, so sell instead of piling up dead stock
  const hauler = w.cats.some(c => c.role === 'hauler');
  if (st && storageFree(st) >= n && (hauler || k !== 'log')) return 'storage';
  return 'shop';
}

// ---------------------------------------------------------------- spawning
export function syncCats(w: World) {
  for (const b of Object.values(w.buildings)) {
    if (b.type !== 'catHouse' || !b.role) continue;
    const want = levelStats(b).cats || 1;
    const have = w.cats.filter(c => c.home === b.id).length;
    for (let i = have; i < want; i++) spawnCat(w, b, b.role);
  }
}
function spawnCat(w: World, home: Building, role: CatRole) {
  w.cats.push({ id: w.nextId++, role, home: home.id, x: home.x, y: home.y + 30, face: 1, walkT: 0, moving: false, stack: [], task: null, idle: '', swingT: 0, swing: 0, waitT: 0, stuckT: 0, lx: home.x, ly: home.y, hidden: false });
  w.events.push({ t: 'bubble', who: w.cats[w.cats.length - 1].id, s: 'Мяу! Я на зміні.' });
}

// ---------------------------------------------------------------- per-cat update
function walk(w: World, c: Cat, tx: number, ty: number, dt: number, spd = catSpeed(w), arrive = 6): boolean {
  const wp = routeVia(w, c.x, c.y, tx, ty);
  const final = wp.x === tx && wp.y === ty;
  const arrived = moveToward(c, wp.x, wp.y, spd, dt, final ? arrive : 8);
  return final && arrived;
}

export function updateCats(w: World, dt: number) {
  for (const c of w.cats) {
    c.swingT -= dt; if (c.swing > 0) c.swing = Math.max(0, c.swing - dt * 4.5);
    // unstick: if trying to move but not moving, jiggle
    c.stuckT += dt;
    if (c.stuckT > 0.9) { if (c.moving && dist(c.x, c.y, c.lx, c.ly) < 6) { c.x += (Math.random() - 0.5) * 30; c.y += (Math.random() - 0.5) * 30; } c.lx = c.x; c.ly = c.y; c.stuckT = 0; }
    const night = w.night.phase === 'night';
    if (night && c.role !== 'guard') { goHome(w, c, dt); continue; }
    if (c.hidden) { c.hidden = false; const h = w.buildings[c.home]; if (h) { c.x = h.x; c.y = h.y + 30; } }
    if (c.role === 'lumber') lumber(w, c, dt);
    else if (c.role === 'hauler') hauler(w, c, dt);
    else guard(w, c, dt, night);
    if (!c.hidden) collide(w, c, 10);
  }
}

function goHome(w: World, c: Cat, dt: number) {
  if (c.task) releaseTask(w, c);
  if (c.hidden) return;
  const h = w.buildings[c.home]; if (!h) return;
  if (walk(w, c, h.x, h.y + 26, dt, catSpeed(w) * 1.3)) c.hidden = true;
  collide(w, c, 10);
}

function lumber(w: World, c: Cat, dt: number) {
  const cap = catCap(w, c);
  if (c.task?.kind === 'haul') return carry(w, c, dt);
  // decide to deliver
  if (c.stack.length >= cap || (c.stack.length > 0 && c.waitT > 4)) {
    releaseTask(w, c); c.waitT = 0;
    const k = c.stack[c.stack.length - 1];
    const n = c.stack.filter(i => i === k).length;
    const to = dropTarget(w, k, n);
    reserveTarget(w, to, k, n);
    c.task = { kind: 'haul', item: k, to, n, stage: 'toTarget' };
    return;
  }
  let t = c.task?.kind === 'harvest' ? w.trees.find(x => x.id === c.task!.tree) : undefined;
  if (!t || !t.alive || !treeOpen(w, t)) {
    if (c.task) releaseTask(w, c);
    const st = w.buildings['storage'];
    const wantLav = isDone(w, 'hedge') && (!st || invGet(st.store, 'lav') < 25);
    let best = undefined as typeof t, bd = 1e9;
    for (const tr of w.trees) {
      if (!tr.alive || !treeOpen(w, tr) || (tr.claimedBy && tr.claimedBy !== c.id)) continue;
      const d = dist(c.x, c.y, tr.x, tr.y) - (wantLav && tr.kind === 'lav' ? 500 : 0);
      if (d < bd) { bd = d; best = tr; }
    }
    t = best;
    if (t) { t.claimedBy = c.id; c.task = { kind: 'harvest', tree: t.id, n: 0, stage: 'work' }; c.idle = ''; }
  }
  if (!t) { c.idle = 'Нема дерев'; c.waitT += dt; c.moving = false; return; }
  c.waitT = 0;
  if (dist(c.x, c.y, t.x, t.y) > 34) walk(w, c, t.x + (c.x < t.x ? -26 : 26), t.y + 4, dt);
  else {
    c.moving = false; c.face = t.x > c.x ? 1 : -1;
    if (c.swingT <= 0) { c.swing = 1; c.swingT = 0.8 / (1 + w.up.mint * 0.12); hitTree(w, t, c); }
  }
}

function hauler(w: World, c: Cat, dt: number) {
  if (c.task) return carry(w, c, dt);
  const cap = catCap(w, c);
  // pick up loose goods (night drops) first if near plaza
  const trips = listTrips(w, cap);
  let best: Trip | null = null, bs = -1e9;
  for (const tr of trips) {
    const a = endpointPos(w, tr.from), b = endpointPos(w, tr.to); if (!a || !b) continue;
    const s = tr.prio * 1000 + tr.n * 20 - dist(c.x, c.y, a.x, a.y) - dist(a.x, a.y, b.x, b.y) * 0.5;
    if (s > bs) { bs = s; best = tr; }
  }
  if (best) { claimTrip(w, c, best); c.idle = ''; return; }
  // collect ground loot
  const g = w.ground.filter(x => x.age > 1 && dist(x.x, x.y, 1200, 850) < 1000).sort((a, b) => dist(c.x, c.y, a.x, a.y) - dist(c.x, c.y, b.x, b.y))[0];
  if (g) {
    if (walk(w, c, g.x, g.y, dt, catSpeed(w), 10)) {
      for (let i = w.ground.length - 1; i >= 0 && c.stack.length < cap; i--) {
        const q = w.ground[i]; if (dist(q.x, q.y, c.x, c.y) < 50) { c.stack.push(q.type); w.ground.splice(i, 1); w.events.push({ t: 'fly', item: q.type, fx: q.x, fy: q.y, fz: 0, to: c.id }); }
      }
      if (c.stack.length && (c.stack.length >= cap || !w.ground.some(q => dist(q.x, q.y, c.x, c.y) < 200))) {
        const k = c.stack[c.stack.length - 1], n = c.stack.filter(i => i === k).length, to = dropTarget(w, k, n);
        reserveTarget(w, to, k, n); c.task = { kind: 'haul', item: k, to, n, stage: 'toTarget' };
      }
    }
    c.idle = ''; return;
  }
  if (c.stack.length) { const k = c.stack[c.stack.length - 1], n = c.stack.filter(i => i === k).length, to = dropTarget(w, k, n); reserveTarget(w, to, k, n); c.task = { kind: 'haul', item: k, to, n, stage: 'toTarget' }; return; }
  const st = w.buildings['storage'];
  c.idle = st && storageFree(st) <= 0 ? 'Склад повний' : 'Нема роботи';
  // idle: rest near home
  const h = w.buildings[c.home]; if (h) walk(w, c, h.x + 30, h.y + 40, dt, catSpeed(w) * 0.5, 12);
}

function carry(w: World, c: Cat, dt: number) {
  const t = c.task!;
  if (t.stage === 'toSource' && t.from) {
    const p = endpointPos(w, t.from);
    if (!p) { releaseTask(w, c); return; }
    if (walk(w, c, p.x, p.y, dt)) {
      const got = takeFrom(w, t.from, t.item!, t.n);
      for (let i = 0; i < got; i++) { c.stack.push(t.item!); w.events.push({ t: 'fly', item: t.item!, fx: p.x, fy: p.y, fz: 10, to: c.id }); }
      if (got < t.n && t.to) reserveTarget(w, t.to, t.item!, got - t.n);
      t.n = got; t.stage = 'toTarget';
      if (got === 0) c.task = null;
    }
    return;
  }
  const p = t.to ? endpointPos(w, t.to) : null;
  if (!p) { // target vanished (e.g. pad completed): re-route what we carry
    const k = t.item!, n = c.stack.filter(i => i === k).length, to = dropTarget(w, k, n);
    reserveTarget(w, to, k, n); t.to = to; return;
  }
  if (walk(w, c, p.x, p.y, dt)) {
    c.moving = false;
    if (c.swingT > 0) return;
    const i = c.stack.lastIndexOf(t.item!);
    if (i < 0) { c.task = null; return; }
    c.stack.splice(i, 1);
    w.events.push({ t: 'fly', item: t.item!, fx: c.x, fy: c.y, fz: 26, to: { x: p.x, y: p.y - 20 } });
    giveTo(w, t.to!, t.item!, 1, p);
    t.n--; c.swingT = 0.1;
    if (!c.stack.includes(t.item!)) { if (t.n > 0) reserveTarget(w, t.to!, t.item!, -t.n); c.task = null; }
  }
}

function guard(w: World, c: Cat, dt: number, night: boolean) {
  if (night) {
    const guards = w.cats.filter(x => x.role === 'guard');
    const gaps = (['E', 'S', 'W'] as GapId[]).filter(g => g !== 'W' || isDone(w, 'hedge'));
    const g = GAPS[gaps[guards.indexOf(c) % gaps.length]];
    let target = null as null | (typeof w.enemies)[number], bd = 1e9;
    for (const e of w.enemies) { if (e.passive) continue; const d = dist(g.x, g.y, e.x, e.y); if (d < 230 && d < bd) { bd = d; target = e; } }
    if (target) {
      const d = dist(c.x, c.y, target.x, target.y);
      if (d > target.r + 22) walk(w, c, target.x, target.y, dt, catSpeed(w) * 1.1, 4);
      else { c.moving = false; c.face = target.x > c.x ? 1 : -1; if (c.swingT <= 0) { c.swing = 1; c.swingT = 0.7; damageEnemy(w, target, 2 + w.up.mint * 0.5, c.x, c.y); } }
    } else walk(w, c, g.inn.x, g.inn.y, dt, catSpeed(w), 10);
    c.idle = '';
    return;
  }
  // day: repair the most damaged structure
  const dmg = Object.values(w.buildings).filter(b => (b.type === 'palisade' || b.type === 'tower' || b.type === 'lantern') && b.hp < b.maxHp).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  if (!dmg) { c.idle = 'Усе ціле'; const h = w.buildings[c.home]; if (h) walk(w, c, h.x - 30, h.y + 40, dt, catSpeed(w) * 0.5, 12); return; }
  c.idle = '';
  if (walk(w, c, dmg.x + (c.x < dmg.x ? -30 : 30), dmg.y + 20, dt, catSpeed(w), 10)) {
    c.moving = false; c.face = dmg.x > c.x ? 1 : -1;
    if (c.swingT <= 0) { c.swing = 1; c.swingT = 0.5; dmg.hp = Math.min(dmg.maxHp, dmg.hp + 6); w.events.push({ t: 'chop', x: dmg.x, y: dmg.y, kind: 'repair' }); }
  }
}

// ---------------------------------------------------------------- shared actions (used by hero too)
export function hitTree(w: World, t: World['trees'][number], by: Cat | 'hero', dmg = 1) {
  t.hp -= dmg; t.shake = 1;
  w.events.push({ t: 'chop', x: t.x, y: t.y, kind: by === 'hero' ? 'hero' : 'cat' });
  if (t.hp > 0) return;
  t.alive = false; t.regrow = t.kind === 'lav' ? 45 : 28; t.claimedBy = 0;
  w.stats.felled++;
  w.events.push({ t: 'fell', x: t.x, y: t.y, kind: t.kind });
  const item: ItemId = t.kind === 'lav' ? 'lav' : 'log';
  const holder = by === 'hero' ? w.hero : by;
  const cap = by === 'hero' ? 10 + w.up.bag * 6 : catCap(w, by);
  for (let i = 0; i < t.logs; i++) {
    if (holder.stack.length < cap) { holder.stack.push(item); w.events.push({ t: 'fly', item, fx: t.x, fy: t.y, fz: 20, to: by === 'hero' ? 'hero' : by.id }); }
    else w.ground.push({ id: w.nextId++, type: item, x: t.x + (Math.random() - 0.5) * 50, y: t.y + (Math.random() - 0.3) * 30, z: 30, vz: 100, age: 0 });
  }
}

export function damageEnemy(w: World, e: World['enemies'][number], dmg: number, fx: number, fy: number) {
  e.hp -= dmg; e.flash = 0.15;
  const d = Math.hypot(e.x - fx, e.y - fy) || 1, kb = e.kind === 'boss' ? 60 : 240;
  e.kx = (e.x - fx) / d * kb; e.ky = (e.y - fy) / d * kb;
  if (e.passive) e.aggro = 6;
  w.events.push({ t: 'hit', x: e.x, y: e.y - e.r, v: dmg });
  if (e.hp > 0) return;
  w.enemies.splice(w.enemies.indexOf(e), 1);
  w.stats.hunted++;
  w.events.push({ t: 'poof', x: e.x, y: e.y - e.r, kind: e.kind });
  if (e.kind === 'boss') {
    const first = !w.flags.boss1;
    w.flags.boss1 = true; w.stats.bosses++;
    const bonus = first ? 500 : 300;
    w.coins += bonus; w.stats.earned += bonus;
    w.events.push({ t: 'bossDown' });
    w.events.push({ t: 'coin', x: e.x, y: e.y - 120, v: bonus });
    w.events.push({ t: 'toast', title: 'ЗДОБИЧ ВПОЛЮВАНО', body: first ? 'Пан Пухнастий заснув. Корона твоя, а в Кузні відкрилась Котяча м\'ятка.' : `Пан Пухнастий знову спить. +${bonus} монет.` });
  }
  const drops = e.passive ? { meat: 2 } : ({ fluff: 1, meat: 1, ...(e.kind === 'horn' ? { fluff: 2, meat: 2 } : {}), ...(e.kind === 'boss' ? { fluff: 12, meat: 6 } : {}) } as Partial<Record<ItemId, number>>);
  for (const [k, n] of Object.entries(drops) as [ItemId, number][]) for (let i = 0; i < n; i++)
    w.ground.push({ id: w.nextId++, type: k, x: e.x + (Math.random() - 0.5) * 40, y: e.y + (Math.random() - 0.5) * 30, z: 25, vz: 120, age: 0 });
}

export { PADS, invTotal };
