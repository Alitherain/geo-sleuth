import { BUILDINGS, HERO_UPG, ITEMS, type Cost, type ItemId, type PadDef } from '../content/data';
import { available, costItems, invAdd, invGet, levelStats, makeBuilding, type Building, type PadState, type World } from './world';
import { syncCats } from './logistics';

export const storage = (w: World): Building | undefined => w.buildings['storage'];

/** How many of an item the player can spend right now: carried + free in storage. */
export function haveItem(w: World, k: ItemId): number {
  const s = storage(w);
  return w.hero.stack.filter(i => i === k).length + (s ? available(s, k) : 0);
}
export function canAfford(w: World, c: Cost): boolean {
  if ((c.coins || 0) > w.coins) return false;
  return costItems(c).every(([k, n]) => haveItem(w, k) >= n);
}
export function spend(w: World, c: Cost): boolean {
  if (!canAfford(w, c)) return false;
  w.coins -= c.coins || 0;
  const s = storage(w);
  for (const [k, n] of costItems(c)) {
    let left = n;
    if (s) { const take = Math.min(left, available(s, k)); invAdd(s.store, k, -take); left -= take; }
    for (let i = w.hero.stack.length - 1; i >= 0 && left > 0; i--) if (w.hero.stack[i] === k) { w.hero.stack.splice(i, 1); left--; }
  }
  return true;
}

export function sell(w: World, k: ItemId, n: number, x: number, y: number) {
  const v = ITEMS[k].price * n;
  w.coins += v; w.stats.earned += v;
  w.events.push({ t: 'coin', x, y, v });
  if (Math.random() < 0.02) w.events.push({ t: 'bubble', who: 'owl', s: ['Ху-ху! Дякую!', 'Ще, ще!', 'Чудовий товар!', 'Ху-у, багатієш!'][Math.floor(Math.random() * 4)] });
}

// ---------------------------------------------------------------- production
export function production(w: World, dt: number) {
  const b = w.buildings['sawmill'];
  if (!b) return;
  const st = levelStats(b);
  const outN = invGet(b.store, 'plank');
  if (invGet(b.input, 'log') < 1) { b.status = 'Чекаю колоди'; b.t = 0; return; }
  if (outN >= st.outCap) { b.status = 'Вихід повний: заберіть дошки'; b.t = 0; return; }
  b.status = 'Пиляю';
  b.t += dt;
  if (b.t >= st.time) {
    b.t = 0;
    invAdd(b.input, 'log', -1);
    b.fireT += st.yield; // fractional yield accumulates
    const made = Math.floor(b.fireT); b.fireT -= made;
    invAdd(b.store, 'plank', made);
  }
}

// ---------------------------------------------------------------- pads
/** One payment tick while the hero stands on a pad. Returns true if something was paid. */
export function payPad(w: World, p: PadState): boolean {
  const c = p.def.cost, h = w.hero;
  const needCoins = (c.coins || 0) - p.paid;
  if (needCoins > 0 && w.coins > 0) {
    const chunk = Math.min(needCoins, w.coins, Math.max(1, Math.ceil((c.coins || 0) / 25)));
    w.coins -= chunk; p.paid += chunk;
    w.events.push({ t: 'fly', item: 'coin', fx: h.x, fy: h.y, fz: 40, to: { x: p.def.x, y: p.def.y } });
    w.events.push({ t: 'pay', x: p.def.x, y: p.def.y });
    checkPadDone(w, p); return true;
  }
  for (const [k, n] of costItems(c)) {
    if (invGet(p.items, k) + invGet(p.incoming, k) >= n) continue;
    const i = h.stack.lastIndexOf(k);
    if (i >= 0) {
      h.stack.splice(i, 1); invAdd(p.items, k, 1);
      w.events.push({ t: 'fly', item: k, fx: h.x, fy: h.y, fz: 40, to: { x: p.def.x, y: p.def.y } });
      checkPadDone(w, p); return true;
    }
  }
  return false;
}
export function padMissing(p: PadState): { coins: number; items: [ItemId, number][] } {
  const c = p.def.cost;
  return { coins: Math.max(0, (c.coins || 0) - p.paid), items: costItems(c).map(([k, n]) => [k, Math.max(0, n - invGet(p.items, k))] as [ItemId, number]).filter(x => x[1] > 0) };
}
export function checkPadDone(w: World, p: PadState) {
  const m = padMissing(p);
  if (m.coins > 0 || m.items.length) return;
  buildFromPad(w, p.def);
}
export function buildFromPad(w: World, d: PadDef) {
  if (d.type === 'clear') w.flags['cleared_' + d.id] = true;
  else makeBuilding(w, d.id, d.type, d.x, d.y, { role: d.role, gap: d.gap });
  delete w.pads[d.id];
  w.events.push({ t: 'build', x: d.x, y: d.y });
  w.events.push({ t: 'toast', title: d.name + '!', body: d.msg });
  syncCats(w);
}

// ---------------------------------------------------------------- upgrades
export function nextLevel(b: Building) {
  const def = BUILDINGS[b.type];
  if (!def.levels || b.level >= def.levels.length) return null;
  return def.levels[b.level];
}
export function upgradeBuilding(w: World, b: Building): boolean {
  const nl = nextLevel(b);
  if (!nl || !spend(w, nl.cost)) return false;
  b.level++;
  const hp = levelStats(b).hp;
  if (hp) { b.maxHp = hp; b.hp = hp; }
  b.builtAt = w.time;
  w.events.push({ t: 'upgrade', x: b.x, y: b.y });
  syncCats(w);
  return true;
}
export function chooseSpec(w: World, b: Building, id: string): boolean {
  const s = BUILDINGS[b.type].specs?.find(x => x.id === id);
  if (!s || b.spec || !spend(w, s.cost)) return false;
  b.spec = id; b.builtAt = w.time;
  w.events.push({ t: 'upgrade', x: b.x, y: b.y });
  return true;
}
export function heroUpgrade(w: World, id: (typeof HERO_UPG)[number]['id']): boolean {
  const u = HERO_UPG.find(x => x.id === id)!;
  const lv = w.up[id];
  if (lv >= u.costs.length || (u.req && !w.flags[u.req]) || !spend(w, u.costs[lv])) return false;
  w.up[id]++;
  if (id === 'heart') w.hero.hp = 5 + w.up.heart;
  w.events.push({ t: 'upgrade', x: w.hero.x, y: w.hero.y - 30 });
  return true;
}
