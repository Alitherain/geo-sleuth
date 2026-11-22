import { describe, expect, it } from 'vitest';
import { createWorld, invGet, makeBuilding, type World } from '../src/sim/world';
import { buildFromPad, spend } from '../src/sim/economy';
import { listTrips, syncCats } from '../src/sim/logistics';
import { step } from '../src/sim/sim';
import { startNight } from '../src/sim/night';
import { deserialize, exportCode, importCode, serialize } from '../src/sim/save';

function build(w: World, ...ids: string[]) { for (const id of ids) buildFromPad(w, w.pads[id].def); }
function run(w: World, seconds: number) { for (let i = 0; i < seconds * 30; i++) { step(w, { x: 0, y: 0 }, 1 / 30); w.events.length = 0; } }

describe('economy', () => {
  it('spends coins and storage items together', () => {
    const w = createWorld(); build(w, 'catLumber', 'sawmill', 'storage');
    w.coins = 100; w.buildings.storage.store.plank = 12;
    expect(spend(w, { coins: 60, plank: 10 })).toBe(true);
    expect(w.coins).toBe(40); expect(invGet(w.buildings.storage.store, 'plank')).toBe(2);
    expect(spend(w, { coins: 10, plank: 5 })).toBe(false);
  });
});

describe('logistics', () => {
  it('two haulers never claim the same goods', () => {
    const w = createWorld(); build(w, 'catLumber', 'sawmill', 'storage', 'catHauler');
    makeBuilding(w, 'catHauler2', 'catHouse', 1300, 640, { role: 'hauler' }); syncCats(w);
    w.buildings.sawmill.store.plank = 8; // exactly one hauler load
    run(w, 0.2);
    const haulers = w.cats.filter(c => c.role === 'hauler');
    const onPlanks = haulers.filter(c => c.task?.from === 'sawmill:out');
    expect(onPlanks.length).toBe(1);
    expect(onPlanks[0].task!.n).toBe(8);
  });

  it('does not make tiny trips for single items', () => {
    const w = createWorld(); build(w, 'catLumber', 'sawmill', 'storage');
    w.buildings.sawmill.store.plank = 1;
    expect(listTrips(w, 8).filter(t => t.from === 'sawmill:out')).toHaveLength(0);
    w.buildings.sawmill.store.plank = 5;
    expect(listTrips(w, 8).filter(t => t.from === 'sawmill:out')[0].n).toBe(5);
  });

  it('cats keep the town producing on their own', () => {
    const w = createWorld(); build(w, 'catLumber', 'sawmill', 'storage', 'catHauler');
    run(w, 240);
    expect(w.coins).toBeGreaterThan(20);
    expect(w.stats.felled).toBeGreaterThan(10);
    // no negative or leaked reservations
    for (const b of Object.values(w.buildings)) for (const v of [...Object.values(b.reserved), ...Object.values(b.incoming)]) expect(v).toBeGreaterThanOrEqual(0);
  });

  it('haulers deliver building materials to pads', () => {
    const w = createWorld(); build(w, 'catLumber', 'sawmill', 'storage', 'catHauler');
    w.buildings.storage.store.plank = 20;
    run(w, 40);
    expect(invGet(w.pads.forge.items, 'plank')).toBeGreaterThan(0);
  });
});

describe('night', () => {
  it('a defended night can be won and pays out', () => {
    const w = createWorld(); build(w, 'catLumber', 'sawmill', 'storage', 'bell', 'palE', 'catGuard');
    w.hero.x = 1560; w.hero.y = 830; w.up.axe = 5;
    expect(startNight(w)).toBe(true);
    const coins = w.coins;
    for (let i = 0; i < 30 * 120 && w.night.phase === 'night'; i++) {
      const e = w.enemies.find(x => !x.passive);
      const dx = e ? e.x - w.hero.x : 0, dy = e ? e.y - w.hero.y : 0, d = Math.hypot(dx, dy) || 1;
      step(w, e && d > 30 ? { x: dx / d, y: dy / d } : { x: 0, y: 0 }, 1 / 30); w.events.length = 0;
    }
    expect(w.night.phase).toBe('day');
    expect(w.night.n).toBe(1);
    expect(w.coins).toBeGreaterThan(coins);
  });
});

describe('save', () => {
  it('round-trips through an export code', () => {
    const w = createWorld(); build(w, 'catLumber', 'sawmill');
    w.coins = 123; w.buildings.sawmill.input.log = 4; w.pads.storage.paid = 10;
    run(w, 5);
    const w2 = importCode(exportCode(w));
    expect(w2.coins).toBe(w.coins);
    expect(Object.keys(w2.buildings).sort()).toEqual(Object.keys(w.buildings).sort());
    expect(w2.pads.storage.paid).toBe(10);
    expect(w2.cats.length).toBe(w.cats.length);
  });
  it('rejects foreign data', () => {
    expect(() => deserialize({ hello: 1 } as any)).toThrow();
    expect(() => importCode('nope')).toThrow();
  });
  it('serializes without functions or events', () => {
    const s = JSON.stringify(serialize(createWorld()));
    expect(s).not.toContain('"events"');
  });
});
