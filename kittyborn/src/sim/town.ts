// Two loops borrowed from idle-tycoon ads:
//  - price pads: the next useful building waits on the ground as a dashed plot with a price; stand on it and coins
//    flow in from the hero, the site appears when it is paid off (materials still come the usual way);
//  - customers: townsfolk cats queue at the Owl's shop, each wanting a few of one item. Serve them from the bag and
//    they pay double into the till on the counter; stand on the sell pad to scoop the till.
import { BUILD, CELL, ITEMS, TC, type BuildingType, type ItemId } from '../content/data';
import { buildLock, place } from './economy';
import { gridCheck, townHalf, validSpots } from './grid';
import { walkTo } from './physics';
import { count, dist, has, type Offer, type Visitor, type World } from './world';

// what to suggest next, in order; [type, how many the town should have]
const PLAN: [BuildingType, number][] = [
  ['houseGatherer', 1], ['sawmill', 1], ['bonfire', 1], ['storage', 1], ['bonfire', 2], ['houseHauler', 1], ['forge', 1], ['houseQuarry', 1],
  ['houseForager', 1], ['bell', 1], ['tower', 1], ['houseGatherer', 2], ['bonfire', 3], ['tower', 2], ['houseMaster', 1], ['barracks', 1],
  ['candleShop', 1], ['lantern', 2], ['houseHauler', 2], ['tower', 4], ['fountain', 1], ['lantern', 4],
];
export const offerCost = (o: Offer) => BUILD[o.type].cost.coins || 0;

function nextOffer(w: World): Offer | null {
  for (const [t, n] of PLAN) {
    if (count(w, t) >= n || buildLock(w, t)) continue;
    const spots = validSpots(w, t); if (!spots.length) continue;
    const anchor = w.buildings.heart ?? { x: TC.x, y: TC.y };
    if (BUILD[t].fuel || t === 'tower') {
      // lights and towers spread out: far from other lights, still close to the town
      const others = Object.values(w.buildings).filter(b => BUILD[b.type].fuel || b.type === 'tower');
      const score = (p: { x: number; y: number }) => Math.min(400, ...others.map(b => dist(p.x, p.y, b.x, b.y))) - 0.35 * dist(p.x, p.y, TC.x, TC.y);
      spots.sort((a, b) => score(b) - score(a));
    } else spots.sort((a, b) => dist(a.x, a.y, anchor.x, anchor.y) - dist(b.x, b.y, anchor.x, anchor.y));
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
    if (gridCheck(w, o.type, o.x, o.y) || buildLock(w, o.type)) { w.coins += o.paid; w.offers.splice(i, 1); }
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

// ---------------------------------------------------------------- customers
const shopPad = (w: World) => { const s = w.buildings.shop; if (!s) return null; const sl = BUILD.shop.slots![0]; return { x: s.x + sl.dx, y: s.y + sl.dy }; };
const queueSpot = (w: World, i: number) => { const p = shopPad(w)!; return { x: p.x + (i % 2 ? 18 : -14), y: p.y + 44 + i * 50 }; };
const spawnAt = (w: World) => ({ x: TC.x + (Math.random() - 0.5) * 60, y: TC.y + (townHalf(w) + 3) * CELL });
function wantFor(w: World): [ItemId, number] {
  const pool: [ItemId, number, number][] = [['log', 3, 6], ['log', 3, 6]];
  if (w.flags.got_berry || has(w, 'houseForager')) pool.push(['berry', 2, 4]);
  if (w.flags.got_stone || has(w, 'houseQuarry')) pool.push(['stone', 2, 4]);
  if (has(w, 'sawmill')) pool.push(['plank', 2, 5], ['plank', 2, 5]);
  if (has(w, 'candleShop')) pool.push(['candle', 1, 3]);
  if (w.flags.got_lav) pool.push(['lav', 2, 4]);
  const [k, a, b] = pool[Math.floor(Math.random() * pool.length)];
  return [k, a + Math.floor(Math.random() * (b - a + 1))];
}
export function updateVisitors(w: World, dt: number) {
  const day = w.clock.phase === 'day';
  if (day && w.buildings.shop && w.stats.earned >= 6) {
    w.visitT -= dt;
    if (w.visitT <= 0 && w.visitors.filter(v => v.state !== 'leave').length < 4) {
      w.visitT = 16 + Math.random() * 12;
      const [want, n] = wantFor(w), at = spawnAt(w);
      if (!w.flags.metCustomer) { w.flags.metCustomer = true; w.events.push({ t: 'toast', title: 'Покупці', body: 'Над котом видно, що він хоче. Принеси це в рюкзаку і стань на «Продати»: заплатить удвічі, монети ляжуть на прилавок.' }); }
      w.visitors.push({ id: w.nextId++, x: at.x, y: at.y, face: 1, walkT: 0, moving: false, look: Math.floor(Math.random() * 4), want, n, total: n, state: 'come', patience: 80, maxPatience: 80, got: 0 });
    }
  }
  const line = w.visitors.filter(v => v.state !== 'leave');
  line.forEach((v, i) => {
    if (!day || !w.buildings.shop) { v.state = 'leave'; return; }
    const q = queueSpot(w, i);
    if (walkTo(w, v as any, q.x, q.y, 105, dt, 6)) { v.state = 'wait'; v.moving = false; v.face = -1; }
    if (v.state === 'wait') { v.patience -= dt * (i === 0 ? 1 : 0.6); if (v.patience <= 0) { v.state = 'leave'; w.events.push({ t: 'bubble', who: v.id, s: `Не дочекався: ${ITEMS[v.want].name.toLowerCase()}.` }); } }
  });
  for (let i = w.visitors.length - 1; i >= 0; i--) {
    const v = w.visitors[i]; if (v.state !== 'leave') continue;
    const s = spawnAt(w);
    if (walkTo(w, v as any, s.x, s.y + 40, 120, dt, 10)) w.visitors.splice(i, 1);
  }
}
/** A waiting customer the hero can serve right now (front of the line first). */
export function servableVisitor(w: World): Visitor | undefined {
  return w.visitors.find(v => v.state === 'wait' && w.hero.stack.includes(v.want));
}
/** Hand one item to the front customer; when the order is complete they pay into the till. */
export function serveOne(w: World, v: Visitor) {
  v.n--; v.got++;
  w.events.push({ t: 'fly', item: v.want, fx: w.hero.x, fy: w.hero.y, fz: 50, to: { x: v.x, y: v.y } });
  if (v.n > 0) return;
  const pay = ITEMS[v.want].price * v.total * 2 + Math.ceil(v.patience / v.maxPatience * 6);
  w.till += pay; v.state = 'leave';
  const s = w.buildings.shop!;
  w.events.push({ t: 'served', x: s.x, y: s.y, v: pay });
  w.events.push({ t: 'bubble', who: v.id, s: ['Дякую, Ліхтарнику.', 'Саме те.', 'Мур-р. Добре.', 'Прийду ще.'][Math.floor(Math.random() * 4)] });
}
/** Scoop a few coins from the till. */
export function takeTill(w: World) {
  const s = w.buildings.shop!, n = Math.min(w.till, Math.max(1, Math.ceil(w.till / 12)));
  w.till -= n; w.coins += n; w.stats.earned += n;
  w.events.push({ t: 'fly', item: 'coin', fx: s.x, fy: s.y + 10, fz: 40, to: 'hero' });
  w.events.push({ t: 'pick', x: w.hero.x, y: w.hero.y });
}
