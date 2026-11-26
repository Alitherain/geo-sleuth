// Two loops borrowed from idle-tycoon ads:
//  - price pads: the next useful building waits on its plot (or wall socket) as a dashed outline with a price; stand on
//    it and coins flow in from the hero, the site appears when it is paid off (materials still come the usual way);
//  - the shop (Крамниця) has its own shelves: haulers stock it from the town storage, townsfolk cats queue and buy from
//    the shelves at double price, the coins pile up on its counter until the hero scoops them from the till pad.
import { BUILD, CELL, ITEMS, TC, type BuildingType, type ItemId } from '../content/data';
import { buildLock, place, placeCheck } from './economy';
import { townHalf } from './grid';
import { spotsFor } from './plan';
import { walkTo } from './physics';
import { allOf, available, count, dist, firstOf, invAdd, invGet, invTotal, levelStats, type Building, type Offer, type Visitor, type World } from './world';

// what to suggest next, in order; [type, how many the town should have]
const PLAN: [BuildingType, number][] = [
  ['houseGatherer', 1], ['sawmill', 1], ['bonfire', 1], ['storage', 1], ['store', 1], ['bonfire', 2], ['houseHauler', 1], ['forge', 1], ['houseQuarry', 1],
  ['houseForager', 1], ['bell', 1], ['tower', 1], ['houseGatherer', 2], ['bonfire', 4], ['tower', 2], ['houseMaster', 1], ['barracks', 1],
  ['candleShop', 1], ['lantern', 2], ['houseHauler', 2], ['tower', 4], ['fountain', 1], ['lantern', 4],
];
export const offerCost = (o: Offer) => BUILD[o.type].cost.coins || 0;

function nextOffer(w: World): Offer | null {
  for (const [t, n] of PLAN) {
    if (count(w, t) >= n || buildLock(w, t)) continue;
    const spots = spotsFor(w, t).filter(p => !placeCheck(w, t, p.x, p.y)); if (!spots.length) continue;
    // plots: closest to the Great Fire; sockets keep their order (gates first, then corners)
    if (!spots[0].socket) { const a = w.buildings.heart ?? { x: TC.x, y: TC.y }; spots.sort((p, q) => dist(p.x, p.y, a.x, a.y) - dist(q.x, q.y, a.x, a.y)); }
    return { id: w.nextId++, type: t, x: spots[0].x, y: spots[0].y, paid: 0 };
  }
  return null;
}
let offerCheckT = 0;
export function updateOffers(w: World, dt: number) {
  offerCheckT -= dt; if (offerCheckT > 0) return; offerCheckT = 1;
  // drop pads that no longer fit or are no longer wanted, refund what was paid
  for (let i = w.offers.length - 1; i >= 0; i--) {
    const o = w.offers[i];
    if (placeCheck(w, o.type, o.x, o.y) || buildLock(w, o.type)) { w.coins += o.paid; w.offers.splice(i, 1); }
  }
  if (!w.offers.length && w.stats.earned > 0) { const o = nextOffer(w); if (o) w.offers.push(o); }
}
/** Offer under the hero's feet, if any. */
export function offerAt(w: World, x: number, y: number): Offer | undefined {
  return w.offers.find(o => { const h = (BUILD[o.type].fp || 1) * CELL / 2 + 6; return Math.abs(x - o.x) < h && Math.abs(y - o.y) < h; });
}
/** One payment tick while the hero stands on a pad. Returns true when something moved. */
export function payOffer(w: World, o: Offer): boolean {
  const cost = offerCost(o), left = cost - o.paid;
  if (left <= 0 || w.coins <= 0) { if (left <= 0) finishOffer(w, o); return false; }
  const n = Math.min(left, w.coins, Math.max(1, Math.ceil(cost / 24)));
  w.coins -= n; o.paid += n;
  w.events.push({ t: 'fly', item: 'coin', fx: w.hero.x, fy: w.hero.y, fz: 60, to: { x: o.x, y: o.y } });
  if (o.paid >= cost) finishOffer(w, o);
  return true;
}
function finishOffer(w: World, o: Offer) {
  w.offers = w.offers.filter(x => x !== o);
  w.coins += o.paid; // place() charges the coins itself
  const b = place(w, o.type, o.x, o.y);
  if (!b) { w.coins -= 0; return; }
  w.events.push({ t: 'unlock', x: o.x, y: o.y });
  offerCheckT = 0.6;
}

// ---------------------------------------------------------------- the shop and its customers
export const STOCK: ItemId[] = ['log', 'plank', 'berry', 'stone', 'candle', 'lav'];
export const storeOf = (w: World) => firstOf(w, 'store');
export const storeCap = (b: Building) => levelStats(b).cap || 40;
/** How many of k the shelves should hold: more of what customers ask for. */
export function shelfTarget(w: World, b: Building, k: ItemId) {
  const asked = w.visitors.filter(v => v.state !== 'leave' && v.want === k).reduce((a, v) => a + v.n, 0);
  return Math.min(storeCap(b), Math.max(asked, Math.floor(storeCap(b) / 5)));
}
const storeFront = (b: Building) => ({ x: b.x, y: b.y + BUILD.store.r + CELL / 2 });
const queueSpot = (b: Building, i: number) => { const f = storeFront(b); return { x: f.x + (i % 2 ? 22 : -22), y: f.y + 44 + Math.floor(i / 2) * 44 }; };
const spawnAt = (w: World) => ({ x: TC.x + (Math.random() - 0.5) * 60, y: TC.y + (townHalf(w) + 3) * CELL });
function wantFor(w: World, st: Building): [ItemId, number] {
  // what the town actually has: in storage, on the shelves, or produced by a building
  const town = allOf(w, 'storage');
  const have = (k: ItemId) => invGet(st.store, k) + town.reduce((a, s) => a + available(s, k), 0) > 0 || !!w.flags['got_' + k];
  const pool = STOCK.filter(have); if (!pool.length) pool.push('log');
  const k = pool[Math.floor(Math.random() * pool.length)];
  const [a, b] = k === 'candle' ? [1, 3] : k === 'log' ? [3, 6] : [2, 5];
  return [k, a + Math.floor(Math.random() * (b - a + 1))];
}
let sellT = 0;
export function updateVisitors(w: World, dt: number) {
  const day = w.clock.phase === 'day', st = storeOf(w);
  if (day && st) {
    w.visitT -= dt;
    if (w.visitT <= 0 && w.visitors.filter(v => v.state !== 'leave').length < 6) {
      w.visitT = 12 + Math.random() * 10;
      const [want, n] = wantFor(w, st), at = spawnAt(w);
      if (!w.flags.metCustomer) { w.flags.metCustomer = true; w.events.push({ t: 'toast', title: 'Покупці', body: 'Коти купують у Крамниці з полиць самі. Носії підвозять товар зі складу, можна докласти й з рюкзака на «Прийом». Монети забирай на «Каса».' }); }
      w.visitors.push({ id: w.nextId++, x: at.x, y: at.y, face: 1, walkT: 0, moving: false, look: Math.floor(Math.random() * 4), want, n, total: n, state: 'come', patience: 90, maxPatience: 90, got: 0 });
    }
  }
  const line = w.visitors.filter(v => v.state !== 'leave');
  line.forEach((v, i) => {
    if (!day || !st) { v.state = 'leave'; return; }
    const q = queueSpot(st, i);
    if (walkTo(w, v as any, q.x, q.y, 105, dt, 6)) { v.state = 'wait'; v.moving = false; v.face = -1; }
    if (v.state === 'wait') { v.patience -= dt * (i === 0 ? 1 : 0.5); if (v.patience <= 0) { v.state = 'leave'; w.events.push({ t: 'bubble', who: v.id, s: `Не дочекався: ${ITEMS[v.want].name.toLowerCase()}.` }); } }
  });
  // the shelves serve the first waiting customer whose item is in stock
  sellT -= dt;
  if (st && sellT <= 0) {
    const v = line.find(x => x.state === 'wait' && invGet(st.store, x.want) > 0);
    if (v) { sellT = st.level >= 2 ? 0.25 : 0.4; invAdd(st.store, v.want, -1); serveOne(w, v, st); }
  }
  for (let i = w.visitors.length - 1; i >= 0; i--) {
    const v = w.visitors[i]; if (v.state !== 'leave') continue;
    const s = spawnAt(w);
    if (walkTo(w, v as any, s.x, s.y + 40, 120, dt, 10)) w.visitors.splice(i, 1);
  }
}
/** One item leaves the shelf for a customer; a finished order pays double into the till. */
export function serveOne(w: World, v: Visitor, st: Building) {
  v.n--; v.got++;
  w.events.push({ t: 'fly', item: v.want, fx: st.x, fy: st.y, fz: 40, to: { x: v.x, y: v.y } });
  if (v.n > 0) return;
  const pay = ITEMS[v.want].price * v.total * 2 + Math.ceil(v.patience / v.maxPatience * 6);
  st.till = (st.till || 0) + pay; v.state = 'leave';
  w.events.push({ t: 'served', x: st.x, y: st.y, v: pay });
  w.events.push({ t: 'bubble', who: v.id, s: ['Дякую.', 'Саме те.', 'Мур-р. Добре.', 'Прийду ще.'][Math.floor(Math.random() * 4)] });
}
/** Hero on the till pad: scoop a few coins. */
export function takeTill(w: World, st: Building) {
  const t = st.till || 0, n = Math.min(t, Math.max(1, Math.ceil(t / 12)));
  st.till = t - n; w.coins += n; w.stats.earned += n;
  w.events.push({ t: 'fly', item: 'coin', fx: st.x, fy: st.y + 10, fz: 40, to: 'hero' });
  w.events.push({ t: 'pick', x: w.hero.x, y: w.hero.y });
}
/** Hero on the intake pad: put one sellable item from the bag on the shelves. */
export function stockFromBag(w: World, st: Building): boolean {
  if (invTotal(st.store) >= storeCap(st)) return false;
  const h = w.hero, wanted = new Set(w.visitors.filter(v => v.state !== 'leave').map(v => v.want));
  let i = -1; for (let j = h.stack.length - 1; j >= 0; j--) if (STOCK.includes(h.stack[j]) && (i < 0 || wanted.has(h.stack[j]))) { i = j; if (wanted.has(h.stack[j])) break; }
  if (i < 0) return false;
  const k = h.stack.splice(i, 1)[0]; invAdd(st.store, k, 1);
  w.events.push({ t: 'fly', item: k, fx: h.x, fy: h.y, fz: 40, to: { x: st.x, y: st.y } });
  return true;
}
