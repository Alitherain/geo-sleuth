import { BUILD, CELL, HERO_UPG, ITEMS, PROJECTS, TC, UNITS, type BuildingType, type Cost, type ItemId, type UnitKind } from '../content/data';
import { allOf, available, costItems, count, firstOf, hallLevel, invAdd, invGet, levelStats, makeBuilding, procStats, reqMet, type Building, type World } from './world';
import { syncCats } from './logistics';
import { gridCheck, snap, townHalf } from './grid';
import { DISTRICT_NAME, DISTRICT_OF, SOCKET_OF, centreAt, sockets, spotsFor, wallCells } from './plan';

export const storage = (w: World): Building | undefined => firstOf(w, 'storage');

/** Carried + free in all storages. */
export function haveItem(w: World, k: ItemId): number {
  return w.hero.stack.filter(i => i === k).length + allOf(w, 'storage').reduce((a, s) => a + available(s, k), 0);
}
export function canAfford(w: World, c: Cost): boolean {
  if ((c.coins || 0) > w.coins) return false;
  return costItems(c).every(([k, n]) => haveItem(w, k) >= n);
}
export function spend(w: World, c: Cost): boolean {
  if (!canAfford(w, c)) return false;
  w.coins -= c.coins || 0;
  for (const [k, n] of costItems(c)) {
    let left = n;
    for (const s of allOf(w, 'storage')) { const take = Math.min(left, available(s, k)); invAdd(s.store, k, -take); left -= take; }
    for (let i = w.hero.stack.length - 1; i >= 0 && left > 0; i--) if (w.hero.stack[i] === k) { w.hero.stack.splice(i, 1); left--; }
  }
  return true;
}
export function sell(w: World, k: ItemId, n: number, x: number, y: number) {
  const v = ITEMS[k].price * n;
  w.coins += v; w.stats.earned += v;
  w.events.push({ t: 'coin', x, y, v });
  if (Math.random() < 0.02) w.events.push({ t: 'bubble', who: 'owl', s: ['Ху-ху. Прийнято.', 'Ще, ще.', 'Добрий товар.', 'Запишу в книгу.'][Math.floor(Math.random() * 4)] });
}

// ---------------------------------------------------------------- production and fuel
export function production(w: World, dt: number) {
  for (const b of Object.values(w.buildings)) {
    if (b.site) continue;
    const def = BUILD[b.type];
    if (def.proc) {
      const p = procStats(b);
      if (invGet(b.input, p.input) < 1) { b.status = `Чекаю: ${ITEMS[p.input].name.toLowerCase()}`; b.t = 0; continue; }
      if (invGet(b.store, p.output) >= p.outCap) { b.status = 'Вихід повний'; b.t = 0; continue; }
      b.status = 'Працює'; b.t += dt;
      if (b.t >= p.time) { b.t = 0; invAdd(b.input, p.input, -1); b.frac += p.yield; const made = Math.floor(b.frac); b.frac -= made; invAdd(b.store, p.output, made); if (made) w.events.push({ t: 'made', x: b.x, y: b.y, kind: p.output }); }
    }
    if (def.fuel && b.fuel > 0) {
      const night = w.clock.phase === 'night' ? 2 : 1;
      b.fuel = Math.max(0, b.fuel - dt * night / def.fuel.burn);
      b.status = b.fuel <= 0 ? 'Згасло: підкинь палива!' : b.fuel < def.fuel.cap * 0.25 ? 'Мало палива' : 'Горить';
      if (b.fuel <= 0) w.events.push({ t: 'lightOut', x: b.x, y: b.y });
    } else if (def.fuel) b.status = 'Згасло: підкинь палива!';
  }
}
export function addFuel(w: World, b: Building, n: number) {
  const f = BUILD[b.type].fuel!; b.fuel = Math.min(f.cap, b.fuel + n);
  if (b.hp <= 0) b.hp = b.maxHp * 0.3; // relighting also patches it up a bit
}

// ---------------------------------------------------------------- placement
/** Plan rule first (plot, socket or wall cell), then the grid rules (nodes, roads, lanes, reachability). */
export function planCheck(w: World, type: BuildingType, x: number, y: number, ignore?: string): string | null {
  const near = (p: { x: number; y: number }) => Math.abs(p.x - x) < 2 && Math.abs(p.y - y) < 2;
  if (type === 'palisade') return wallCells(w).some(near) ? null : 'Мур стоїть лише по краю плану';
  if (SOCKET_OF[type]) return spotsFor(w, type, ignore).some(near) ? null : 'Лише у вільному гнізді на мурі';
  if (DISTRICT_OF[type]) return spotsFor(w, type, ignore).some(near) ? null : `Лише на вільній ділянці: ${DISTRICT_OF[type]!.map(d => DISTRICT_NAME[d]).join(', ')}`;
  return null;
}
export function placeCheck(w: World, type: BuildingType, x: number, y: number, ignore?: string): string | null {
  return planCheck(w, type, x, y, ignore) || gridCheck(w, type, x, y, ignore);
}
const socketAt = (w: World, type: BuildingType, x: number, y: number, ignore?: string) => spotsFor(w, type, ignore).find(p => Math.abs(p.x - x) < 2 && Math.abs(p.y - y) < 2)?.socket;
export function buildLock(w: World, type: BuildingType): string | null {
  const def = BUILD[type];
  if (def.noBuild) return 'Вже є';
  if (def.locked) return def.locked;
  const r = reqMet(w, def.req); if (r) return r;
  const max = def.max?.[hallLevel(w) - 1];
  if (max !== undefined && count(w, type) >= max) return max === 0 ? 'Потрібна Ратуша вищого рівня' : `Ліміт ${max} на цьому рівні Ратуші`;
  return null;
}
export function place(w: World, type: BuildingType, x: number, y: number): Building | null {
  const def = BUILD[type];
  ({ x, y } = snap(type, x, y));
  if (buildLock(w, type) || placeCheck(w, type, x, y) || w.coins < (def.cost.coins || 0)) return null;
  w.coins -= def.cost.coins || 0;
  const items = Object.fromEntries(costItems(def.cost)) as Partial<Record<ItemId, number>>;
  const b = makeBuilding(w, type, x, y, { site: Object.keys(items).length ? items : null, socket: socketAt(w, type, x, y) });
  w.events.push({ t: 'placed', x, y });
  if (!b.site) completeSite(w, b);
  return b;
}
export function completeSite(w: World, b: Building) {
  b.site = null; b.builtAt = w.time;
  const def = BUILD[b.type];
  if (def.fuel) b.fuel = def.fuel.cap * 0.6;
  w.events.push({ t: 'build', x: b.x, y: b.y });
  if (!w.flags['built_' + b.type]) { w.flags['built_' + b.type] = true; w.events.push({ t: 'toast', title: def.name + '!', body: def.desc }); }
  syncCats(w);
}
/** Hero or a cat drops one item into a construction site. */
export function deliverToSite(w: World, b: Building, k: ItemId, n = 1) {
  if (!b.site) return;
  invAdd(b.incoming, k, -Math.min(n, invGet(b.incoming, k)));
  const left = invGet(b.site, k) - n;
  if (left <= 0) delete b.site[k]; else b.site[k] = left;
  if (!Object.keys(b.site).length) completeSite(w, b);
}
export function moveBuilding(w: World, b: Building, x: number, y: number): boolean {
  ({ x, y } = snap(b.type, x, y));
  if (placeCheck(w, b.type, x, y, b.id)) return false;
  b.socket = socketAt(w, b.type, x, y, b.id);
  b.x = x; b.y = y; w.events.push({ t: 'placed', x, y });
  return true;
}
export function demolish(w: World, b: Building) {
  if (BUILD[b.type].noBuild) return false;
  const refund = Math.floor((BUILD[b.type].cost.coins || 0) * 0.5);
  w.coins += refund;
  for (const inv of [b.store, b.input]) for (const [k, n] of Object.entries(inv) as [ItemId, number][]) for (let i = 0; i < Math.min(n, 40); i++) w.ground.push({ id: w.nextId++, type: k, x: b.x + (Math.random() - 0.5) * 60, y: b.y + (Math.random() - 0.5) * 40, z: 20, vz: 100, age: 0 });
  delete w.buildings[b.id];
  w.cats = w.cats.filter(c => c.home !== b.id);
  for (const u of w.units) { if (u.post === b.id) u.post = null; }
  w.units = w.units.filter(u => u.home !== b.id);
  w.events.push({ t: 'poof', x: b.x, y: b.y, kind: 'build' });
  return true;
}

// ---------------------------------------------------------------- upgrades
export function nextLevel(b: Building) { const def = BUILD[b.type]; return def.levels && b.level < def.levels.length ? def.levels[b.level] : null; }
export function upgradeBuilding(w: World, b: Building): boolean {
  const nl = nextLevel(b);
  if (!nl || b.site || !spend(w, nl.cost)) return false;
  b.level++;
  const hp = levelStats(b).hp; if (hp) { b.maxHp = hp; b.hp = hp; }
  b.builtAt = w.time;
  w.events.push({ t: 'upgrade', x: b.x, y: b.y });
  if (b.type === 'hall') { relayout(w); w.events.push({ t: 'toast', title: `Ратуша: ${nl.label.split(':')[0]}`, body: 'Містечко виросло на кільце ділянок. Мур, башти й вогні переїхали на новий край, старий частокіл повернув половину дощок.' }); }
  syncCats(w);
  return true;
}
/** After the hall grows: clear the forest from the new area, take down the old wall (half the planks back),
 * and move towers and lights to the same sockets on the new edge. */
export function relayout(w: World) {
  const A = (townHalf(w) + 4 + 1) * CELL;
  w.nodes = w.nodes.filter(n => Math.abs(n.x - TC.x) > A || Math.abs(n.y - TC.y) > A);
  let planks = 0;
  for (const b of Object.values(w.buildings)) if (b.type === 'palisade') { planks += Math.floor((b.level > 1 ? 3 : 3) / 2); delete w.buildings[b.id]; }
  const st = allOf(w, 'storage')[0]; if (st && planks) invAdd(st.store, 'plank', planks); else w.coins += planks * ITEMS.plank.price;
  const S = sockets(w);
  for (const b of Object.values(w.buildings)) {
    if (!b.socket) continue;
    const s = S.find(x => x.id === b.socket); if (!s) continue;
    const c = centreAt(b.type, s.x, s.y); b.x = c.x; b.y = c.y;
  }
}
/** Build the whole wall at once on every free wall cell (each segment is a site waiting for planks). */
export function raiseWall(w: World): number {
  let n = 0;
  for (const c of wallCells(w)) { if (buildLock(w, 'palisade')) break; if (!placeCheck(w, 'palisade', c.x, c.y)) { if (place(w, 'palisade', c.x, c.y)) n++; } }
  return n;
}
export function chooseSpec(w: World, b: Building, id: string): boolean {
  const s = BUILD[b.type].specs?.find(x => x.id === id);
  if (!s || b.spec || !spend(w, s.cost)) return false;
  b.spec = id; b.builtAt = w.time; w.events.push({ t: 'upgrade', x: b.x, y: b.y });
  return true;
}
export function heroUpgrade(w: World, id: (typeof HERO_UPG)[number]['id']): boolean {
  const u = HERO_UPG.find(x => x.id === id)!, lv = w.up[id];
  if (lv >= u.costs.length || (u.req && !w.flags[u.req]) || !spend(w, u.costs[lv])) return false;
  w.up[id]++;
  if (id === 'heart') w.hero.hp = 5 + w.up.heart;
  w.events.push({ t: 'upgrade', x: w.hero.x, y: w.hero.y - 30 });
  return true;
}
export function doProject(w: World, id: keyof typeof PROJECTS): boolean {
  const p = PROJECTS[id];
  if (w.flags[id] || reqMet(w, p.req) || !spend(w, p.cost)) return false;
  w.flags[id] = true;
  w.events.push({ t: 'toast', title: p.name, body: p.desc });
  w.events.push({ t: 'build', x: 500, y: TC.y });
  return true;
}

// ---------------------------------------------------------------- barracks
export function unitCap(w: World) { return allOf(w, 'barracks').reduce((a, b) => a + (levelStats(b).units || 0), 0); }
export function trainUnit(w: World, b: Building, k: UnitKind): boolean {
  const queued = allOf(w, 'barracks').reduce((a, x) => a + (x.queue?.length || 0), 0);
  if (w.units.length + queued >= unitCap(w) || !spend(w, UNITS[k].cost)) return false;
  b.queue!.push(k);
  return true;
}
export function barracksTick(w: World, dt: number) {
  for (const b of allOf(w, 'barracks')) {
    if (!b.queue?.length) { b.status = 'Чекаю новобранців'; continue; }
    b.trainT = (b.trainT || 0) + dt; b.status = `Навчання: ${UNITS[b.queue[0]].name}`;
    if (b.trainT >= UNITS[b.queue[0]].time) {
      const k = b.queue.shift()!; b.trainT = 0;
      const u = UNITS[k];
      w.units.push({ id: w.nextId++, kind: k, home: b.id, post: null, x: b.x, y: b.y + 50, face: 1, walkT: 0, moving: false, hp: u.hp, maxHp: u.hp, woundT: 0, swingT: 0, swing: 0, stuckT: 0, lx: b.x, ly: b.y });
      w.events.push({ t: 'bubble', who: w.units[w.units.length - 1].id, s: 'На посту.' });
    }
  }
}
