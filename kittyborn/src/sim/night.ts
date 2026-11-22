import { ENEMIES, GAPS, HEART, SPAWNS, waveFor, type EnemyKind, type GapId } from '../content/data';
import { collide, moveToward } from './physics';
import { damageEnemy, releaseTask } from './logistics';
import { clamp, dist, heroMaxHp, inRect, isDone, levelStats, WILDS, type Building, type Enemy, type World } from './world';

export const lanterns = (w: World) => Object.values(w.buildings).filter(b => b.type === 'lantern');
export const litLanterns = (w: World) => lanterns(w).filter(b => b.hp > 0);

export function canStartNight(w: World) { return w.night.phase === 'day' && !!w.buildings['bell']; }

export function startNight(w: World): boolean {
  if (!canStartNight(w)) return false;
  const n = w.night.n + 1;
  const wave = waveFor(n, isDone(w, 'hedge'));
  w.night.phase = 'night'; w.night.t = 0; w.night.queue = wave.entries.slice(); w.night.reward = wave.reward; w.night.title = wave.title;
  for (const e of w.enemies.slice()) if (e.passive) w.enemies.splice(w.enemies.indexOf(e), 1);
  for (const c of w.cats) if (c.role !== 'guard') releaseTask(w, c);
  w.events.push({ t: 'nightStart' });
  w.events.push({ t: 'toast', title: wave.title, body: 'Звірі йдуть на ліхтарі. Захищай площу!' });
  return true;
}

/** Spawn directions for the next night, so the map can show arrows before the bell is rung. */
export function nextNightDirections(w: World): string[] {
  const wave = waveFor(w.night.n + 1, isDone(w, 'hedge'));
  return [...new Set(wave.entries.map(e => e.from))];
}

function spawn(w: World, kind: EnemyKind, from: string): Enemy {
  const s = SPAWNS[from], d = ENEMIES[kind];
  const e: Enemy = { id: w.nextId++, kind, x: s.x + (Math.random() - 0.5) * 60, y: s.y + (Math.random() - 0.5) * 60, z: kind === 'boss' ? 500 : 0, vz: 0, hp: d.hp * (1 + Math.max(0, w.night.n - 3) * 0.15), maxHp: 0, r: d.r,
    wp: [GAPS[s.gap].out, GAPS[s.gap].inn], wpI: 0, atkCd: 0, flash: 0, kx: 0, ky: 0, face: -1, walkT: 0, moving: false, passive: false, aggro: 0, wx: 0, wy: 0, wt: 0 };
  e.maxHp = e.hp;
  if (kind === 'boss') { e.boss = { state: 'drop', t: 0, tx: 0, ty: 0, sx: 0, sy: 0, slams: 0 }; e.x = GAPS[s.gap].out.x + 140; e.y = GAPS[s.gap].out.y; w.events.push({ t: 'bossIn' }); }
  w.enemies.push(e);
  return e;
}

export function updateNight(w: World, dt: number) {
  const N = w.night;
  N.dark += ((N.phase === 'night' ? 1 : 0) - N.dark) * Math.min(1, dt * 0.8);
  if (N.phase === 'day') { dayCritters(w, dt); return; }
  N.t += dt;
  while (N.queue.length && N.queue[0].at <= N.t) { const q = N.queue.shift()!; spawn(w, q.kind, q.from); }
  towers(w, dt);
  for (const e of w.enemies.slice()) if (!e.passive) (e.boss ? updateBoss(w, e, dt) : updateEnemy(w, e, dt));
  // end conditions
  const hostile = w.enemies.filter(e => !e.passive);
  if (!N.queue.length && !hostile.length) endNight(w, true);
  else if (!litLanterns(w).length) endNight(w, false);
}

function endNight(w: World, win: boolean) {
  const N = w.night;
  N.phase = 'day';
  for (const e of w.enemies.slice()) if (!e.passive) w.enemies.splice(w.enemies.indexOf(e), 1);
  w.shots.length = 0;
  for (const l of lanterns(w)) l.hp = l.maxHp; // dawn relights every lantern
  if (win) {
    N.n++; w.stats.nights++;
    w.coins += N.reward; w.stats.earned += N.reward;
    w.events.push({ t: 'coin', x: HEART.x, y: HEART.y - 80, v: N.reward });
    if (N.n === 3 || N.title.includes('Пухнаст')) { /* toast below */ }
    w.events.push({ t: 'nightWin' });
  } else {
    const lost = Math.floor(w.coins * 0.2);
    w.coins -= lost;
    w.events.push({ t: 'nightLose' });
    w.events.push({ t: 'toast', title: 'Ліхтарі згасли', body: `Звірі розбіглися на світанку. Сови підняли ціни через паніку: −${lost} монет.` });
  }
}

function targetLantern(w: World, e: Enemy): Building | undefined {
  let best: Building | undefined, bd = 1e9;
  for (const l of litLanterns(w)) { const d = dist(e.x, e.y, l.x, l.y); if (d < bd) { bd = d; best = l; } }
  return best;
}

function updateEnemy(w: World, e: Enemy, dt: number) {
  const def = ENEMIES[e.kind], h = w.hero;
  if (e.flash > 0) e.flash -= dt;
  e.atkCd -= dt;
  e.x += e.kx * dt; e.y += e.ky * dt; e.kx *= Math.pow(0.02, dt); e.ky *= Math.pow(0.02, dt);
  const dH = dist(e.x, e.y, h.x, h.y);
  if (!h.dead && dH < 90) e.aggro = 2.5;
  if (e.aggro > 0) e.aggro -= dt;
  let tx: number, ty: number;
  if (e.aggro > 0 && !h.dead) { tx = h.x; ty = h.y; }
  else if (e.wpI < e.wp.length) { tx = e.wp[e.wpI].x; ty = e.wp[e.wpI].y; if (dist(e.x, e.y, tx, ty) < 22) e.wpI++; }
  else { const l = targetLantern(w, e); if (!l) return; tx = l.x; ty = l.y;
    if (dist(e.x, e.y, l.x, l.y) < e.r + 16) { e.moving = false; if (e.atkCd <= 0) { e.atkCd = 1; l.hp -= def.dmg; w.events.push({ t: 'wallHit', x: l.x, y: l.y - 40 }); if (l.hp <= 0) { l.hp = 0; w.events.push({ t: 'lanternOut', x: l.x, y: l.y }); } } return; } }
  moveToward(e, tx, ty, def.speed * (e.aggro > 0 ? 1.4 : 1), dt);
  if (e.aggro > 0 && dH < e.r + 14 && e.atkCd <= 0) { hurtHero(w, 1); e.atkCd = 1.1; }
  // allies in melee
  for (const o of w.enemies) { if (o === e) continue; const d = dist(e.x, e.y, o.x, o.y), m = e.r + o.r; if (d < m && d > 0.1) { e.x += (e.x - o.x) / d * (m - d) * 0.5; e.y += (e.y - o.y) / d * (m - d) * 0.5; } }
  const wall = collide(w, e, e.r * 0.8, { enemy: true, ignoreTrees: true });
  if (wall && e.atkCd <= 0) {
    const b = w.buildings[wall]; e.atkCd = 1;
    b.hp -= def.dmg * def.wallMul; w.events.push({ t: 'wallHit', x: b.x, y: b.y });
    if (b.hp <= 0) b.hp = 0;
  }
}

function updateBoss(w: World, e: Enemy, dt: number) {
  const B = e.boss!, h = w.hero; B.t += dt; if (e.flash > 0) e.flash -= dt; e.atkCd -= dt;
  if (B.state === 'drop') { e.vz -= 1400 * dt; e.z += e.vz * dt; if (e.z <= 0) { e.z = 0; B.state = 'walk'; B.t = 0; w.events.push({ t: 'slam', x: e.x, y: e.y }); } return; }
  e.x += e.kx * dt; e.y += e.ky * dt; e.kx *= Math.pow(0.05, dt); e.ky *= Math.pow(0.05, dt);
  if (B.state === 'walk') {
    const near = !h.dead && dist(e.x, e.y, h.x, h.y) < 320;
    if (near) moveToward(e, h.x, h.y, 60, dt);
    else if (e.wpI < e.wp.length) { const p = e.wp[e.wpI]; if (moveToward(e, p.x, p.y, 55, dt, 24)) e.wpI++; }
    else { const l = targetLantern(w, e); if (l) { if (dist(e.x, e.y, l.x, l.y) < e.r + 20) { if (e.atkCd <= 0) { e.atkCd = 1.2; l.hp -= 10; if (l.hp <= 0) { l.hp = 0; w.events.push({ t: 'lanternOut', x: l.x, y: l.y }); } } } else moveToward(e, l.x, l.y, 55, dt); } }
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
      for (const b of Object.values(w.buildings)) if ((b.type === 'palisade' || b.type === 'tower') && dist(b.x, b.y, e.x, e.y) < 120) b.hp = Math.max(0, b.hp - 30);
      if (B.slams % 3 === 0) for (let i = 0; i < 2; i++) { const m = spawn(w, 'fluff', 'E'); m.x = e.x + (Math.random() - 0.5) * 120; m.y = e.y + (Math.random() - 0.5) * 80; m.wpI = 2; m.hp = m.maxHp = 4; }
    }
  }
  collide(w, e, 30, { ignoreTrees: true });
}

function towers(w: World, dt: number) {
  for (const b of Object.values(w.buildings)) {
    if (b.type !== 'tower' || b.hp <= 0) continue;
    const s = levelStats(b);
    b.fireT -= dt; if (b.fireT > 0) continue;
    let tgt: Enemy | undefined, bd = s.range;
    for (const e of w.enemies) { if (e.passive || e.z > 20) continue; const d = dist(b.x, b.y - 40, e.x, e.y); if (d < bd) { bd = d; tgt = e; } }
    if (!tgt) continue;
    b.fireT = s.rate;
    w.shots.push({ id: w.nextId++, x: b.x, y: b.y - 50, target: tgt.id, dmg: s.dmg, from: b.id });
    w.events.push({ t: 'shot', x: b.x, y: b.y - 50 });
  }
  for (let i = w.shots.length - 1; i >= 0; i--) {
    const s = w.shots[i], e = w.enemies.find(x => x.id === s.target);
    if (!e) { w.shots.splice(i, 1); continue; }
    const dx = e.x - s.x, dy = e.y - e.r - s.y, d = Math.hypot(dx, dy), step = 460 * dt;
    if (d <= step) { w.shots.splice(i, 1); damageEnemy(w, e, s.dmg, s.x, s.y); }
    else { s.x += dx / d * step; s.y += dy / d * step; }
  }
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
  if (passive.length < 5 && Math.random() < dt * 0.3) {
    const x = WILDS.x + 80 + Math.random() * (WILDS.w - 140), y = WILDS.y + 60 + Math.random() * (WILDS.h - 120);
    if (dist(x, y, w.hero.x, w.hero.y) > 300)
      w.enemies.push({ id: w.nextId++, kind: 'fluff', x, y, z: 0, vz: 0, hp: 6, maxHp: 6, r: 16, wp: [], wpI: 0, atkCd: 0, flash: 0, kx: 0, ky: 0, face: 1, walkT: 0, moving: false, passive: true, aggro: 0, wx: x, wy: y, wt: 0 });
  }
  const h = w.hero;
  for (const e of passive) {
    if (e.flash > 0) e.flash -= dt; e.atkCd -= dt;
    e.x += e.kx * dt; e.y += e.ky * dt; e.kx *= Math.pow(0.02, dt); e.ky *= Math.pow(0.02, dt);
    if (e.aggro > 0) {
      e.aggro -= dt;
      moveToward(e, h.x, h.y, 70, dt);
      if (dist(e.x, e.y, h.x, h.y) < e.r + 14 && e.atkCd <= 0) { hurtHero(w, 1); e.atkCd = 1.2; }
    } else {
      e.wt -= dt;
      if (e.wt <= 0) { e.wx = clamp(e.x + (Math.random() - 0.5) * 300, WILDS.x + 40, WILDS.x + WILDS.w - 40); e.wy = clamp(e.y + (Math.random() - 0.5) * 300, WILDS.y + 40, WILDS.y + WILDS.h - 40); e.wt = 2 + Math.random() * 3; }
      if (moveToward(e, e.wx, e.wy, 40, dt)) e.moving = false;
    }
    collide(w, e, e.r * 0.8, { enemy: true });
    if (!inRect(e.x, e.y, { x: WILDS.x - 40, y: 0, w: 9999, h: 9999 })) e.x = WILDS.x;
  }
}

export { heroMaxHp };
