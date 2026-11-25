import { describe, expect, it } from 'vitest';
import { TC } from '../src/content/data';
import { allOf, createWorld, firstOf, invGet, makeBuilding, type World } from '../src/sim/world';
import { completeSite, demolish, moveBuilding, place, placeCheck, spend } from '../src/sim/economy';
import { listTrips, syncCats } from '../src/sim/logistics';
import { step } from '../src/sim/sim';
import { callNightEarly } from '../src/sim/night';
import { deserialize, exportCode, importCode, serialize } from '../src/sim/save';
import { centerOf, findPath, gridCheck, lineCells, perimeterCells, validSpots } from '../src/sim/grid';
const at = (t: Parameters<typeof centerOf>[0], i: number, j: number) => centerOf(t, i, j);

function done(w: World, type: Parameters<typeof makeBuilding>[1], i: number, j: number, extra = {}) { const p = at(type, i, j); const b = makeBuilding(w, type, p.x, p.y, extra); completeSite(w, b); return b; }
function run(w: World, seconds: number, input = { x: 0, y: 0 }) { for (let i = 0; i < seconds * 30; i++) { step(w, input, 1 / 30); w.events.length = 0; } }
function town(w: World) {
  done(w, 'houseGatherer', -3, -5);
  done(w, 'sawmill', 2, -5);
  done(w, 'storage', -6, -5);
}

describe('placement', () => {
  it('rejects overlaps and far-away spots, allows free spots', () => {
    const w = createWorld();
    expect(placeCheck(w, 'sawmill', TC.x, TC.y - 40)).toBeTruthy();
    expect(placeCheck(w, 'sawmill', TC.x + 2000, TC.y)).toBeTruthy();
    const p = at('houseGatherer', 3, -4); expect(placeCheck(w, 'houseGatherer', p.x, p.y)).toBeNull();
  });
  it('places a site, takes coins, completes when materials arrive', () => {
    const w = createWorld(); town(w); w.coins = 100;
    const fp = at('forge', 4, 2); const b = place(w, 'forge', fp.x, fp.y)!;
    expect(b.site).toEqual({ plank: 6 });
    expect(w.coins).toBe(65);
    firstOf(w, 'storage')!.store.plank = 10;
    done(w, 'houseHauler', -3, -3); syncCats(w);
    run(w, 40);
    expect(b.site).toBeNull();
  });
  it('moves and demolishes buildings', () => {
    const w = createWorld(); town(w);
    const s = firstOf(w, 'sawmill')!;
    const to = at('sawmill', 3, -5);
    expect(moveBuilding(w, s, to.x + 7, to.y - 5)).toBe(true);
    expect(s.x).toBe(to.x);
    expect(demolish(w, s)).toBe(true);
    expect(firstOf(w, 'sawmill')).toBeUndefined();
  });
});

describe('grid', () => {
  it('keeps roads and pad rows free and never walls a building in', () => {
    const w = createWorld();
    const road = at('houseGatherer', -1, -4); expect(gridCheck(w, 'houseGatherer', road.x, road.y)).toMatch(/Дорога/);
    const padRow = at('bench', -4, 5); expect(gridCheck(w, 'bench', padRow.x, padRow.y)).toMatch(/прохід/); // in front of the owl
    expect(validSpots(w, 'houseGatherer').length).toBeGreaterThan(5);
  });
  it('palisades go on roads, in lines and around the town', () => {
    const w = createWorld();
    const r = at('palisade', 0, 7); expect(gridCheck(w, 'palisade', r.x, r.y)).toBeNull();
    expect(lineCells({ x: r.x, y: r.y }, { x: r.x + 5 * 48, y: r.y + 30 })).toHaveLength(6);
    const ring = perimeterCells(w); expect(ring.length).toBe(4 * 17);
    expect(ring.filter(p => !gridCheck(w, 'palisade', p.x, p.y)).length).toBeGreaterThan(60);
  });
  it('refuses a placement that would wall in a pad', () => {
    const w = createWorld();
    // the fire's pad sits at cells (2,4)-(3,4); close three sides with posts, the fourth must be refused
    done(w, 'post', 1, 4); done(w, 'post', 2, 5); done(w, 'post', 3, 5);
    const last = at('post', 4, 4);
    expect(gridCheck(w, 'post', last.x, last.y)).toMatch(/Перекриє прохід до «Великий Костер»/);
  });
});

describe('ad loops', () => {
  it('a price pad appears, takes coins from the hero and becomes a site', () => {
    const w = createWorld(); w.stats.earned = 10; w.coins = 50;
    run(w, 1.2);
    expect(w.offers).toHaveLength(1);
    const o = w.offers[0]; expect(o.type).toBe('houseGatherer');
    w.hero.x = o.x; w.hero.y = o.y + 10;
    run(w, 3);
    expect(w.offers.find(x => x.id === o.id)).toBeUndefined();
    expect(Object.values(w.buildings).some(b => b.type === 'houseGatherer')).toBe(true);
    expect(w.coins).toBe(50 - 15);
  });
  it('customers queue, get served from the bag and pay double into the till', () => {
    const w = createWorld(); w.stats.earned = 10; w.visitT = 0; w.offers = [];
    run(w, 0.1);
    expect(w.visitors).toHaveLength(1);
    const v = w.visitors[0];
    run(w, 25);
    expect(v.state).toBe('wait');
    const pad = { x: w.buildings.shop.x, y: w.buildings.shop.y + 120 };
    w.hero.stack = Array(v.n + 2).fill(v.want); w.hero.x = pad.x; w.hero.y = pad.y;
    const coins = w.coins;
    for (let i = 0; i < 30 * 6; i++) { step(w, { x: 0, y: 0 }, 1 / 30); w.events.length = 0; }
    expect(v.state).toBe('leave');
    expect(w.till).toBe(0);
    expect(w.coins).toBeGreaterThan(coins + 4);
  });
});

describe('logistics', () => {
  it('two haulers never claim the same goods', () => {
    const w = createWorld(); town(w);
    done(w, 'houseHauler', -3, -3); done(w, 'houseHauler', 4, 2); syncCats(w);
    const saw = firstOf(w, 'sawmill')!; saw.store.plank = 8;
    run(w, 0.2);
    const on = w.cats.filter(c => c.task?.from === saw.id + '|out');
    expect(on.length).toBe(1);
    expect(on[0].task!.n).toBe(8);
  });
  it('no tiny trips for single items', () => {
    const w = createWorld(); town(w);
    const saw = firstOf(w, 'sawmill')!; saw.store.plank = 1;
    expect(listTrips(w, 8).filter(t => t.from.startsWith(saw.id))).toHaveLength(0);
  });
  it('haulers keep fires fuelled from storage', () => {
    const w = createWorld(); town(w);
    done(w, 'houseHauler', -3, -3); syncCats(w);
    w.buildings.heart.fuel = 2; firstOf(w, 'storage')!.store.log = 30;
    run(w, 40);
    expect(w.buildings.heart.fuel).toBeGreaterThan(8);
  });
  it('the town runs on its own and reservations never go negative', () => {
    const w = createWorld(); town(w); done(w, 'houseHauler', -3, -3); syncCats(w);
    run(w, 200);
    expect(w.stats.felled).toBeGreaterThan(10);
    expect(w.coins).toBeGreaterThan(10);
    for (const b of Object.values(w.buildings)) for (const v of [...Object.values(b.reserved), ...Object.values(b.incoming)]) expect(v).toBeGreaterThanOrEqual(0);
  });
  it('gatherers follow the resource set on their house', () => {
    const w = createWorld(); const h = done(w, 'houseQuarry', -3, -5);
    run(w, 60);
    const cat = w.cats.find(c => c.home === h.id)!;
    expect(cat.stack.includes('stone') || w.coins > 10 || Object.values(w.buildings).some(b => invGet(b.store, 'stone') > 0)).toBe(true);
  });
});

describe('night', () => {
  it('a lit, defended town survives the first night', () => {
    const w = createWorld(); town(w);
    done(w, 'bell', 3, -3);
    for (const [i, j] of [[-5, 6], [-3, 7], [2, 7], [4, 6], [6, 2], [-7, 2]] as [number, number][]) done(w, 'bonfire', i, j);
    w.up.axe = 4;
    expect(callNightEarly(w)).toBe(true);
    for (let i = 0; i < 30 * 200 && w.clock.n === 0; i++) {
      const e = w.enemies.find(x => !x.passive);
      const wp = e ? findPath(w, w.hero.x, w.hero.y, e.x, e.y)[0] : null; // steer like a player would, around buildings
      const dx = wp ? wp.x - w.hero.x : 0, dy = wp ? wp.y - w.hero.y : 0, d = Math.hypot(dx, dy) || 1;
      step(w, e && Math.hypot(e.x - w.hero.x, e.y - w.hero.y) > 30 ? { x: dx / d, y: dy / d } : { x: 0, y: 0 }, 1 / 30); w.events.length = 0;
    }
    expect(w.clock.n).toBe(1);
    expect(w.clock.phase).toBe('day');
  });
  it('trained units go to their post', () => {
    const w = createWorld(); w.buildings.hall.level = 2; town(w);
    const bar = done(w, 'barracks', 5, 2);
    const post = done(w, 'post', 9, 1);
    bar.queue = ['spear', 'spear'];
    run(w, 30);
    expect(w.units.length).toBe(2);
    expect(w.units.filter(u => u.post === post.id).length).toBe(2);
  });
});

describe('save', () => {
  it('round-trips through an export code', () => {
    const w = createWorld(); town(w); w.coins = 123; run(w, 5);
    const w2 = importCode(exportCode(w));
    expect(w2.coins).toBe(w.coins);
    expect(Object.keys(w2.buildings).sort()).toEqual(Object.keys(w.buildings).sort());
    expect(w2.cats.length).toBe(w.cats.length);
  });
  it('rejects foreign and old data', () => {
    expect(() => deserialize({ hello: 1 } as any)).toThrow();
    expect(() => deserialize({ game: 'dark-kittyborn', schemaVersion: 1, world: {} } as any)).toThrow();
    expect(JSON.stringify(serialize(createWorld()))).not.toContain('"events"');
  });
});
