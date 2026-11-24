import { BUILD, DAY_LEN, DUSK_LEN, ENEMIES, FIRST_DAY_MAX, SPAWNS, TC, UNITS, waveFor, type EnemyKind, type ItemId } from '../content/data';
import { collide, moveToward, walkTo } from './physics';
import { releaseTask } from './logistics';
import { allOf, clamp, dist, has, inRect, lightRadius, WILDS, type Building, type Enemy, type Unit, type World } from './world';

export const lights = (w: World) => Object.values(w.buildings).filter(b => BUILD[b.type].fuel && !b.site);
export const litLights = (w: World) => lights(w).filter(b => lightRadius(b) > 0);
export function inLight(w: World, x: number, y: number) { for (const b of litLights(w)) if (dist(x, y, b.x, b.y) < lightRadius(b)) return true; return false; }

// ---------------------------------------------------------------- clock
export function nextWave(w: World) { return waveFor(w.clock.n + 1, !!w.flags.hedge); }
export function secondsToDusk(w: World) {
  const c = w.clock; if (c.phase !== 'day') return 0;
  return Math.max(0, (c.day === 1 ? FIRST_DAY_MAX : DAY_LEN) - c.t);
}
export function callNightEarly(w: World): boolean {
  if (w.clock.phase !== 'day' || !has(w, 'bell')) return false;
  w.clock.early = true; beginDusk(w); return true;
}
function beginDusk(w: World) {
  const c = w.clock, wave = nextWave(w);
  c.phase = 'dusk'; c.t = 0; c.dirs = wave.dirs; c.title = wave.title;
  w.events.push({ t: 'dusk' });
  w.events.push({ t: 'toast', title: 'Сутінки', body: `${wave.title} за ${DUSK_LEN} секунд. Звірі прийдуть ${wave.dirs.map(d => SPAWNS[d].name).join(', ')}.` });
}
function beginNight(w: World) {
  const c = w.clock, wave = nextWave(w);
  c.phase = 'night'; c.t = 0; c.queue = wave.entries.slice(); c.reward = Math.round(wave.reward * (c.early ? 1.25 : 1)); c.title = wave.title; c.dirs = wave.dirs;
  for (const e of w.enemies.slice()) if (e.passive) w.enemies.splice(w.enemies.indexOf(e), 1);
  for (const cat of w.cats) if (cat.role === 'gatherer' && cat.task?.kind === 'harvest') releaseTask(w, cat);
  w.events.push({ t: 'nightStart' });
}
function endNight(w: World, win: boolean) {
  const c = w.clock;
  for (const e of w.enemies.slice()) if (!e.passive) w.enemies.splice(w.enemies.indexOf(e), 1);
  w.shots.length = 0;
  if (win) {
    c.n++; w.stats.nights++;
    w.coins += c.reward; w.stats.earned += c.reward;
    w.events.push({ t: 'coin', x: TC.x, y: TC.y - 120, v: c.reward });
    w.events.push({ t: 'nightWin' });
  } else {
    const lost = Math.floor(w.coins * 0.2); w.coins -= lost;
    w.events.push({ t: 'nightLose' });
    w.events.push({ t: 'toast', title: 'Усе світло згасло', body: `Звірі розбіглися на світанку. Сови підняли ціни через паніку: −${lost} монет.` });
  }
  for (const l of lights(w)) { if (l.hp <= 0) l.hp = l.maxHp * 0.4; }
  const heart = w.buildings.heart; if (heart && heart.fuel < 3) heart.fuel = 3; // dawn embers so the game never soft-locks
  c.phase = 'day'; c.t = 0; c.day++; c.early = false;
  w.events.push({ t: 'dawn' });
}
let darkGrace = 0;
export function updateClock(w: World, dt: number) {
  const c = w.clock;
  c.t += dt;
  const target = c.phase === 'night' ? 1 : c.phase === 'dusk' ? Math.min(1, c.t / DUSK_LEN) * 0.75 : 0;
  c.dark += (target - c.dark) * Math.min(1, dt * 0.9);
  if (c.phase === 'day') {
    const ready = has(w, 'bonfire') && Object.values(w.buildings).some(b => b.type === 'palisade' && !b.site);
    if (c.day === 1 ? (c.t > FIRST_DAY_MAX || (ready && c.t > 90)) : c.t > DAY_LEN) beginDusk(w);
    dayCritters(w, dt);
    return;
  }
  if (c.phase === 'dusk') { if (c.t >= DUSK_LEN) beginNight(w); return; }
  while (c.queue.length && c.queue[0].at <= c.t) { const q = c.queue.shift()!; spawn(w, q.kind, q.from); }
  towers(w, dt);
  for (const e of w.enemies.slice()) if (!e.passive) (e.boss ? updateBoss(w, e, dt) : updateEnemy(w, e, dt));
  const hostile = w.enemies.filter(e => !e.passive).length;
  if (!c.queue.length && !hostile) endNight(w, true);
  else if (!litLights(w).length) { darkGrace += dt; if (darkGrace > 3) { darkGrace = 0; endNight(w, false); } }
  else darkGrace = 0;
}

// ---------------------------------------------------------------- enemies
function spawn(w: World, kind: EnemyKind, from: string): Enemy {
  const s = SPAWNS[from], d = ENEMIES[kind];
  const hpMul = 1 + Math.max(0, w.clock.n - 2) * 0.12;
  const e: Enemy = { id: w.nextId++, kind, x: s.x + (Math.random() - 0.5) * 120, y: s.y + (Math.random() - 0.5) * 120, z: 0, vz: 0, hp: d.hp * hpMul, maxHp: d.hp * hpMul, r: d.r,
    atkCd: 0, flash: 0, kx: 0, ky: 0, face: -1, walkT: Math.random() * 5, moving: false, passive: false, aggro: 0, wx: 0, wy: 0, wt: 0, lit: false };
  if (kind === 'boss') { e.boss = { state: 'drop', t: 0, tx: 0, ty: 0, sx: 0, sy: 0, slams: 0 }; e.x = TC.x + 520; e.y = TC.y; e.z = 500; w.events.push({ t: 'bossIn' }); }
  w.enemies.push(e);
  return e;
}
function targetLight(w: World, e: Enemy): Building | undefined {
  let best: Building | undefined, bd = 1e9;
  for (const l of litLights(w)) { const d = dist(e.x, e.y, l.x, l.y); if (d < bd) { bd = d; best = l; } }
  return best;
}
function nearestFoe(w: World, e: Enemy, range: number): { x: number; y: number; hit: (n: number) => void } | null {
  const h = w.hero;
  let best: { x: number; y: number; hit: (n: number) => void } | null = null, bd = range;
  if (!h.dead) { const d = dist(e.x, e.y, h.x, h.y); if (d < bd) { bd = d; best = { x: h.x, y: h.y, hit: n => hurtHero(w, n) }; } }
  for (const u of w.units) { if (u.woundT > 0) continue; const d = dist(e.x, e.y, u.x, u.y); if (d < bd) { bd = d; best = { x: u.x, y: u.y, hit: n => hurtUnit(w, u, n) }; } }
  return best;
}
function lightEffect(w: World, e: Enemy, dt: number) {
  e.lit = inLight(w, e.x, e.y);
  if (e.lit && e.kind !== 'boss') { e.hp -= ENEMIES[e.kind].burn * dt; if (e.hp <= 0) killEnemy(w, e, true); }
}
function updateEnemy(w: World, e: Enemy, dt: number) {
  const def = ENEMIES[e.kind];
  if (e.flash > 0) e.flash -= dt;
  e.atkCd -= dt;
  e.x += e.kx * dt; e.y += e.ky * dt; e.kx *= Math.pow(0.02, dt); e.ky *= Math.pow(0.02, dt);
  lightEffect(w, e, dt); if (!w.enemies.includes(e)) return;
  const spd = def.speed * (e.lit ? 0.55 : 1);
  const foe = e.kind === 'shade' ? null : nearestFoe(w, e, 80);
  if (foe) {
    walkTo(w, e, foe.x, foe.y, spd * 1.3, dt, e.r + 10);
    if (dist(e.x, e.y, foe.x, foe.y) < e.r + 18 && e.atkCd <= 0) { foe.hit(1); e.atkCd = 1.1; }
  } else {
    const l = targetLight(w, e);
    if (l) {
      const reach = e.r + BUILD[l.type].r * 1.25 + 8;
      if (dist(e.x, e.y, l.x, l.y) < reach) {
        e.moving = false;
        if (e.atkCd <= 0) { e.atkCd = 1; l.hp -= def.dmg; w.events.push({ t: 'wallHit', x: l.x, y: l.y - 30 }); if (l.hp <= 0) { l.hp = 0; l.fuel = 0; w.events.push({ t: 'lightOut', x: l.x, y: l.y }); } }
      } else walkTo(w, e, l.x, l.y, spd, dt);
    }
  }
  for (const o of w.enemies) { if (o === e) continue; const d = dist(e.x, e.y, o.x, o.y), m = e.r + o.r; if (d < m && d > 0.1) { e.x += (e.x - o.x) / d * (m - d) * 0.5; e.y += (e.y - o.y) / d * (m - d) * 0.5; } }
  const wall = collide(w, e, e.r * 0.8, { enemy: true, ignoreNodes: e.kind === 'shade' });
  if (wall && e.atkCd <= 0) { const b = w.buildings[wall]; e.atkCd = 1; b.hp = Math.max(0, b.hp - def.dmg * def.wallMul); w.events.push({ t: 'wallHit', x: b.x, y: b.y }); }
}
function updateBoss(w: World, e: Enemy, dt: number) {
  const B = e.boss!, h = w.hero; B.t += dt; if (e.flash > 0) e.flash -= dt; e.atkCd -= dt;
  if (B.state === 'drop') { e.vz -= 1400 * dt; e.z += e.vz * dt; if (e.z <= 0) { e.z = 0; B.state = 'walk'; B.t = 0; w.events.push({ t: 'slam', x: e.x, y: e.y }); } return; }
  e.x += e.kx * dt; e.y += e.ky * dt; e.kx *= Math.pow(0.05, dt); e.ky *= Math.pow(0.05, dt);
  if (B.state === 'walk') {
    const near = !h.dead && dist(e.x, e.y, h.x, h.y) < 320;
    if (near) moveToward(e, h.x, h.y, 60, dt);
    else { const l = targetLight(w, e); if (l) { if (dist(e.x, e.y, l.x, l.y) < e.r + BUILD[l.type].r * 1.25 + 8) { if (e.atkCd <= 0) { e.atkCd = 1.2; l.hp -= 10; if (l.hp <= 0) { l.hp = 0; l.fuel = 0; w.events.push({ t: 'lightOut', x: l.x, y: l.y }); } } } else walkTo(w, e, l.x, l.y, 55, dt); } }
    if (!h.dead && dist(e.x, e.y, h.x, h.y) < e.r + 14 && e.atkCd <= 0) { hurtHero(w, 1); e.atkCd = 1; }
    if (B.t > 2.6 && near) { B.state = 'tele'; B.t = 0; B.tx = h.x; B.ty = h.y; }
  } else if (B.state === 'tele') {
    if (B.t > 0.95) { B.state = 'jump'; B.t = 0; B.sx = e.x; B.sy = e.y; }
  } else if (B.state === 'jump') {
    const k = Math.min(1, B.t / 0.38);
    e.x = B.sx + (B.tx - B.sx) * k; e.y = B.sy + (B.ty - B.sy) * k; e.z = Math.sin(k * Math.PI) * 140;
    if (k >= 1) {
      e.z = 0; B.state = 'walk'; B.t = 0; B.slams++;
      w.events.push({ t: 'slam', x: e.x, y: e.y });
      if (dist(h.x, h.y, e.x, e.y) < 108) hurtHero(w, 2);
      for (const u of w.units) if (dist(u.x, u.y, e.x, e.y) < 108) hurtUnit(w, u, 8);
      for (const b of Object.values(w.buildings)) if ((b.type === 'palisade' || b.type === 'tower') && dist(b.x, b.y, e.x, e.y) < 120) b.hp = Math.max(0, b.hp - 30);
      if (B.slams % 3 === 0) for (let i = 0; i < 2; i++) { const m = spawn(w, 'fluff', 'E'); m.x = e.x + (Math.random() - 0.5) * 120; m.y = e.y + (Math.random() - 0.5) * 80; m.hp = m.maxHp = 4; }
    }
  }
  collide(w, e, 30, { ignoreNodes: true });
}

export function damageEnemy(w: World, e: Enemy, dmg: number, fx: number, fy: number) {
  e.hp -= dmg; e.flash = 0.15;
  const d = Math.hypot(e.x - fx, e.y - fy) || 1, kb = e.kind === 'boss' ? 60 : 240;
  e.kx = (e.x - fx) / d * kb; e.ky = (e.y - fy) / d * kb;
  if (e.passive) e.aggro = 6;
  w.events.push({ t: 'hit', x: e.x, y: e.y - e.r, v: dmg });
  if (e.hp <= 0) killEnemy(w, e, false);
}
function killEnemy(w: World, e: Enemy, byLight: boolean) {
  const i = w.enemies.indexOf(e); if (i < 0) return;
  w.enemies.splice(i, 1);
  w.stats.hunted++;
  w.events.push({ t: 'poof', x: e.x, y: e.y - e.r, kind: byLight ? 'light' : e.kind });
  if (e.kind === 'boss') {
    const first = !w.flags.boss1; w.flags.boss1 = true; w.stats.bosses++;
    const bonus = first ? 500 : 300; w.coins += bonus; w.stats.earned += bonus;
    w.events.push({ t: 'bossDown' }); w.events.push({ t: 'coin', x: e.x, y: e.y - 120, v: bonus });
    w.events.push({ t: 'toast', title: 'ЗДОБИЧ ВПОЛЮВАНО', body: first ? 'Звір Блідого Місяця впав. У Кузні відкрилась Котяча м\'ятка: котики пам\'ятатимуть.' : `Звір знову впав. +${bonus} монет.` });
  }
  const drops: Partial<Record<ItemId, number>> = e.passive ? { meat: 2 } : e.kind === 'shade' ? { fluff: 1 } : e.kind === 'horn' ? { meat: 2, fluff: 2 } : e.kind === 'boss' ? { fluff: 12, meat: 6 } : { meat: 1, fluff: 1 };
  for (const [k, n] of Object.entries(drops) as [ItemId, number][]) for (let j = 0; j < n; j++)
    w.ground.push({ id: w.nextId++, type: k, x: e.x + (Math.random() - 0.5) * 40, y: e.y + (Math.random() - 0.5) * 30, z: 25, vz: 120, age: 0 });
}

function towers(w: World, dt: number) {
  for (const b of allOf(w, 'tower')) {
    if (b.hp <= 0) continue;
    const s = { dmg: 2, rate: 1, range: 190, ...(BUILD.tower.levels![b.level - 1].stats) };
    b.fireT -= dt; if (b.fireT > 0) continue;
    let tgt: Enemy | undefined, bd = s.range;
    for (const e of w.enemies) { if (e.passive || e.z > 20) continue; const d = dist(b.x, b.y - 40, e.x, e.y); if (d < bd) { bd = d; tgt = e; } }
    if (!tgt) continue;
    b.fireT = s.rate;
    w.shots.push({ id: w.nextId++, x: b.x, y: b.y - 60, target: tgt.id, dmg: s.dmg, kind: 'cone' });
    w.events.push({ t: 'shot', x: b.x, y: b.y - 60 });
  }
  for (let i = w.shots.length - 1; i >= 0; i--) {
    const s = w.shots[i], e = w.enemies.find(x => x.id === s.target);
    if (!e) { w.shots.splice(i, 1); continue; }
    const dx = e.x - s.x, dy = e.y - e.r - s.y, d = Math.hypot(dx, dy), step = 460 * dt;
    if (d <= step) { w.shots.splice(i, 1); damageEnemy(w, e, s.dmg, s.x, s.y); }
    else { s.x += dx / d * step; s.y += dy / d * step; }
  }
}

// ---------------------------------------------------------------- units
let assignT = 0;
export function updateUnits(w: World, dt: number) {
  assignT -= dt;
  if (assignT <= 0) { assignT = 1; assignPosts(w); }
  const night = w.clock.phase === 'night';
  for (const u of w.units) {
    const def = UNITS[u.kind];
    u.swingT -= dt; if (u.swing > 0) u.swing = Math.max(0, u.swing - dt * 4.5);
    u.stuckT += dt; if (u.stuckT > 1) { if (u.moving && dist(u.x, u.y, u.lx, u.ly) < 6) { u.x += (Math.random() - 0.5) * 30; u.y += (Math.random() - 0.5) * 30; } u.lx = u.x; u.ly = u.y; u.stuckT = 0; }
    const home = w.buildings[u.home];
    if (u.woundT > 0) {
      u.woundT -= dt;
      if (home && dist(u.x, u.y, home.x, home.y + 50) > 10) walkTo(w, u, home.x, home.y + 50, def.speed * 0.7, dt, 8);
      if (u.woundT <= 0) u.hp = u.maxHp;
      collide(w, u, 10); continue;
    }
    if (!night && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + dt * 2);
    const post = u.post ? w.buildings[u.post] : null;
    const anchor = post ? { x: post.x, y: post.y } : night ? { x: TC.x, y: TC.y + 140 } : home ? { x: home.x, y: home.y + 60 } : { x: TC.x, y: TC.y };
    let tgt: Enemy | undefined, bd = 1e9;
    for (const e of w.enemies) { if (e.passive || e.z > 20) continue; const d = dist(anchor.x, anchor.y, e.x, e.y); if (d < 210 && d < bd) { bd = d; tgt = e; } }
    if (tgt) {
      const d = dist(u.x, u.y, tgt.x, tgt.y);
      if (d > def.range + tgt.r) walkTo(w, u, tgt.x, tgt.y, def.speed, dt, 4);
      else {
        u.moving = false; u.face = tgt.x > u.x ? 1 : -1;
        if (u.swingT <= 0) {
          u.swing = 1; u.swingT = def.rate;
          if (u.kind === 'sling') w.shots.push({ id: w.nextId++, x: u.x, y: u.y - 20, target: tgt.id, dmg: def.dmg, kind: 'pebble' });
          else damageEnemy(w, tgt, def.dmg, u.x, u.y);
        }
      }
    } else {
      const idx = w.units.filter(x => x.post === u.post).indexOf(u), a = idx * 2.1;
      walkTo(w, u, anchor.x + Math.cos(a) * 34, anchor.y + 20 + Math.sin(a) * 18, def.speed * 0.8, dt, 6);
    }
    collide(w, u, 10);
  }
  // sling pebbles reuse the shot list; towers() moves them during the night, so move them here by day too
  if (!night) for (let i = w.shots.length - 1; i >= 0; i--) { const s = w.shots[i], e = w.enemies.find(x => x.id === s.target); if (!e) { w.shots.splice(i, 1); continue; } const dx = e.x - s.x, dy = e.y - e.r - s.y, d = Math.hypot(dx, dy), st = 460 * dt; if (d <= st) { w.shots.splice(i, 1); damageEnemy(w, e, s.dmg, s.x, s.y); } else { s.x += dx / d * st; s.y += dy / d * st; } }
}
function assignPosts(w: World) {
  const posts = allOf(w, 'post');
  for (const u of w.units) if (u.post && !w.buildings[u.post]) u.post = null;
  for (const p of posts) for (const k of ['spear', 'sling'] as const) {
    const want = p.want?.[k] || 0;
    const mine = w.units.filter(u => u.post === p.id && u.kind === k);
    for (let i = want; i < mine.length; i++) mine[i].post = null;
    for (let i = mine.length; i < want; i++) {
      const free = w.units.filter(u => !u.post && u.kind === k).sort((a, b) => dist(a.x, a.y, p.x, p.y) - dist(b.x, b.y, p.x, p.y))[0];
      if (!free) break; free.post = p.id;
    }
  }
}
export function hurtUnit(w: World, u: Unit, n: number) {
  if (u.woundT > 0) return;
  u.hp -= n * 2; w.events.push({ t: 'hurt', x: u.x, y: u.y - 20, kind: 'unit' });
  if (u.hp <= 0) { u.hp = 0; u.woundT = 25; w.events.push({ t: 'bubble', who: u.id, s: 'Поранений. До казарми.' }); }
}
export function hurtHero(w: World, n: number) {
  const h = w.hero;
  if (h.inv > 0 || h.dead > 0) return;
  h.hp -= n; h.inv = 0.9; h.hurtT = 0.3; h.regenT = 4;
  w.events.push({ t: 'hurt', x: h.x, y: h.y - 30 });
  if (h.hp <= 0) {
    h.dead = 3.2;
    for (const it of h.stack) w.ground.push({ id: w.nextId++, type: it, x: h.x + (Math.random() - 0.5) * 60, y: h.y + (Math.random() - 0.5) * 40, z: 20, vz: 100, age: 0 });
    h.stack.length = 0;
    w.events.push({ t: 'dead' });
  }
}

// passive critters in the wilds during the day: meat for the brave
function dayCritters(w: World, dt: number) {
  const passive = w.enemies.filter(e => e.passive);
  if (passive.length < 6 && Math.random() < dt * 0.3) {
    const x = WILDS.x + 80 + Math.random() * (WILDS.w - 140), y = WILDS.y + 60 + Math.random() * (WILDS.h - 120);
    if (dist(x, y, w.hero.x, w.hero.y) > 300)
      w.enemies.push({ id: w.nextId++, kind: 'fluff', x, y, z: 0, vz: 0, hp: 6, maxHp: 6, r: 16, atkCd: 0, flash: 0, kx: 0, ky: 0, face: 1, walkT: 0, moving: false, passive: true, aggro: 0, wx: x, wy: y, wt: 0, lit: false });
  }
  const h = w.hero;
  for (const e of passive) {
    if (e.flash > 0) e.flash -= dt; e.atkCd -= dt;
    e.x += e.kx * dt; e.y += e.ky * dt; e.kx *= Math.pow(0.02, dt); e.ky *= Math.pow(0.02, dt);
    if (e.aggro > 0) { e.aggro -= dt; moveToward(e, h.x, h.y, 70, dt); if (dist(e.x, e.y, h.x, h.y) < e.r + 14 && e.atkCd <= 0) { hurtHero(w, 1); e.atkCd = 1.2; } }
    else {
      e.wt -= dt;
      if (e.wt <= 0) { e.wx = clamp(e.x + (Math.random() - 0.5) * 300, WILDS.x + 40, WILDS.x + WILDS.w - 40); e.wy = clamp(e.y + (Math.random() - 0.5) * 300, WILDS.y + 40, WILDS.y + WILDS.h - 40); e.wt = 2 + Math.random() * 3; }
      if (moveToward(e, e.wx, e.wy, 40, dt)) e.moving = false;
    }
    collide(w, e, e.r * 0.8, { enemy: true });
    if (!inRect(e.x, e.y, { x: WILDS.x - 60, y: 0, w: 9999, h: 9999 })) e.x = WILDS.x - 40;
  }
}
