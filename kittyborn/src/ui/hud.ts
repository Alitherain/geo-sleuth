import { BUILD, CATEGORIES, CELL, HERO_UPG, ITEMS, PROJECTS, SPAWNS, TC, UNITS, type BuildingType, type Category, type Cost, type ItemId } from '../content/data';
import { buildLock, canAfford, chooseSpec, demolish, doProject, heroUpgrade, moveBuilding, nextLevel, place, placeCheck, trainUnit, unitCap, upgradeBuilding } from '../sim/economy';
import { callNightEarly, litLights, nextWave, secondsToDusk } from '../sim/night';
import { nearBuilding, type Input } from '../sim/sim';
import { exportCode, importCode } from '../sim/save';
import { comfort, count, dist, has, hallLevel, heroCap, heroMaxHp, invGet, invTotal, levelStats, procStats, reqMet, storageCap, type Building, type GameEvent, type World } from '../sim/world';
import type { BuildView, View } from '../render3d/View';
import { DISTRICT_NAME, DISTRICT_OF, ROUTE_NAME, SOCKET_OF, centreAt, plotCentre, plotTaken, plotsNow, socketTaken, sockets, fits, spotsFor, type Plot, type Socket } from '../sim/plan';
import { raiseWall } from '../sim/economy';
import { audio, audioInit, setMusic, setSound, sfx } from '../platform/audio';
import { G } from './glyphs';
import { clearSave, saveSettings } from '../platform/storage';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let THUMB: (key: string) => string = () => '';
const pic = (key: string, cls = 'ico') => { const u = THUMB(key); return u ? `<img class="${cls}" src="${u}" alt="">` : ''; };
const ico = (k: string) => pic(k === 'coins' ? 'i:coin' : 'i:' + k);
const costLine = (c: Cost) => (Object.entries(c) as [string, number][]).filter(([, n]) => n).map(([k, n]) => `<span class="cost">${ico(k)}${n}</span>`).join(' ') || 'безкоштовно';
const bIcon = (t: string, cls = 'ico') => pic('b:' + (t === 'ledLamp' ? 'lantern' : t), cls);
const UPG_ICON: Record<string, string> = { bag: G.bag, axe: '', boots: '', heart: G.defense, mint: G.decor };
const TUT: { text: string; done: (w: World) => boolean }[] = [
  { text: 'Підійди до дерева: сокира рубає сама', done: w => w.stats.felled > 0 },
  { text: 'Продай дрова Пані Сові на жовтому майданчику', done: w => w.stats.earned >= 6 },
  { text: 'Стань на пунктирну ділянку з ціною: монети підуть у будову', done: w => has(w, 'houseGatherer') },
  { text: 'Наступна ділянка: Лісопилка. Дошки потрібні для всього', done: w => has(w, 'sawmill') },
  { text: 'Збудуй Крамницю: покупці купуватимуть з її полиць самі', done: w => has(w, 'store') },
  { text: 'Постав Костер: світло обпікає нічних звірів', done: w => has(w, 'bonfire') },
  { text: 'Будівництво → «Звести мур»: мур по краю міста, носії довезуть дошки', done: w => count(w, 'palisade') >= 3 },
];

export class Hud {
  input: Input = { x: 0, y: 0 };
  started = false; paused = false;
  scene: View | null = null;
  build: BuildView & { cat: Category } = { active: false, pick: null, spot: null, moving: null, selected: null, cat: 'eco' };
  private cardFor: string | null = null; private cardSig = ''; private chipFor: string | null = null;
  private toastT = 0; private shown = { coins: -1, bag: '', hp: '', clock: '', tut: '' };
  private joy = { on: false, id: -1, ox: 0, oy: 0, sx: 0, sy: 0, moved: false };
  private keys: Record<string, boolean> = {};
  private armDemolish: string | null = null;

  constructor(private getWorld: () => World, private setWorld: (w: World) => void) {
    this.bindPointer(); this.bindButtons();
    addEventListener('keydown', e => { this.keys[e.key.toLowerCase()] = true; if (e.key === 'Escape') { if (this.build.active) this.exitBuild(); else this.toggleMenu(); } });
    addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = false; });
  }
  get w() { return this.getWorld(); }

  // ---------------------------------------------------------------- pointer: joystick normally, pan + tap in build mode
  private bindPointer() {
    const area = $('game'), base = $('joyBase'), knob = $('joyKnob'), R = 60;
    // two fingers = pinch zoom (cancels the joystick); wheel zooms too
    const pts = new Map<number, { x: number; y: number }>(); let pinch = 0;
    const spread = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    area.addEventListener('wheel', e => { e.preventDefault(); this.scene?.zoomBy(e.deltaY > 0 ? 1.1 : 0.9); }, { passive: false });
    area.addEventListener('pointerdown', e => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { pinch = spread(); this.joy.on = false; this.joy.moved = true; this.input.x = this.input.y = 0; base.hidden = true; } });
    area.addEventListener('pointermove', e => { if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2 && pinch > 0) { const d = spread(); if (d > 10) { this.scene?.zoomBy(pinch / d); pinch = d; } } });
    const lift = (e: PointerEvent) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; };
    area.addEventListener('pointerup', lift); area.addEventListener('pointercancel', lift);
    area.addEventListener('pointerdown', e => {
      audioInit();
      if (this.joy.on || pts.size > 1) return;
      this.joy = { on: true, id: e.pointerId, ox: e.clientX, oy: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
      try { area.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      if (this.build.active) return;
      base.hidden = false; base.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`; knob.style.transform = 'translate(0px,0px)';
    });
    area.addEventListener('pointermove', e => {
      if (!this.joy.on || e.pointerId !== this.joy.id || pinch > 0) return;
      if (this.build.active) {
        const dx = e.clientX - this.joy.ox, dy = e.clientY - this.joy.oy;
        if (Math.hypot(e.clientX - this.joy.sx, e.clientY - this.joy.sy) > 10) this.joy.moved = true;
        if (this.joy.moved) { this.scene?.panBy(dx, dy); this.joy.ox = e.clientX; this.joy.oy = e.clientY; }
        return;
      }
      let dx = e.clientX - this.joy.ox, dy = e.clientY - this.joy.oy; const d = Math.hypot(dx, dy);
      if (d > R) { this.joy.ox += dx / d * (d - R); this.joy.oy += dy / d * (d - R); dx = e.clientX - this.joy.ox; dy = e.clientY - this.joy.oy; base.style.transform = `translate(${this.joy.ox}px, ${this.joy.oy}px)`; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.input.x = dx / R; this.input.y = dy / R;
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.joy.id) return;
      const wasTap = this.build.active && !this.joy.moved;
      this.joy.on = false; this.input.x = this.input.y = 0; base.hidden = true;
      if (wasTap && this.scene) { const p = this.scene.screenToWorld(e.clientX, e.clientY); this.buildTap(p.x, p.y); }
    };
    area.addEventListener('pointerup', end); area.addEventListener('pointercancel', end);
  }
  private readKeys() {
    if (this.joy.on) return;
    let x = 0, y = 0; const k = this.keys;
    if (k.a || k.arrowleft) x--; if (k.d || k.arrowright) x++; if (k.w || k.arrowup) y--; if (k.s || k.arrowdown) y++;
    this.input.x = x; this.input.y = y;
  }

  // ---------------------------------------------------------------- buttons and menu
  private bindButtons() {
    const fs = $('bFull');
    if (!(document.fullscreenEnabled || (document as any).webkitFullscreenEnabled)) fs.hidden = true;
    fs.onclick = () => { try { const d: any = document; if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d); else { const el: any = document.documentElement; (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el)?.catch?.(() => {}); } } catch { /* ignore */ } };
    const snd = $('bSnd'); const sndIcon = () => { snd.innerHTML = audio.sound ? G.sound : G.mute; }; sndIcon();
    $('bBuild').innerHTML = G.build; $('bFull').innerHTML = G.full; $('bMenu').innerHTML = G.menu; $('bCancel').innerHTML = G.close;
    snd.onclick = () => { audioInit(); setSound(!audio.sound); saveSettings(audio); sndIcon(); };
    $('bMenu').onclick = () => this.toggleMenu();
    $('bBuild').onclick = () => (this.build.active ? this.exitBuild() : this.enterBuild());
    $('chip').onclick = () => { if (this.chipFor) this.openCard(this.chipFor); };
    $('bRing').onclick = () => { const n = raiseWall(this.w); this.toast(n ? 'Мур закладено' : 'Мур уже стоїть', n ? `${n} секцій чекають на дошки: носії довезуть.` : 'Усі секції на місці або бракує ліміту Ратуші.'); this.renderDrawer(); };
    $('bCancel').onclick = () => { if (this.build.pick || this.build.spot || this.build.moving) { this.clearPick(); this.renderDrawer(); } else this.exitBuild(); };
    $('mResume').onclick = () => this.toggleMenu(false);
    $('mMusic').onclick = () => { setMusic(!audio.music); saveSettings(audio); this.menuRefresh(); };
    $('mExport').onclick = () => { const code = exportCode(this.w), ta = $<HTMLTextAreaElement>('mCode'); ta.value = code; ta.select(); navigator.clipboard?.writeText(code).then(() => this.status('Код скопійовано. Збережи його в нотатках.'), () => this.status('Код виділено: скопіюй його вручну.')); };
    $('mImport').onclick = () => { try { const w = importCode($<HTMLTextAreaElement>('mCode').value); this.setWorld(w); this.status('Збереження завантажено!'); this.toggleMenu(false); } catch (e) { this.status('Не вдалося: ' + (e as Error).message); } };
    let arm = false;
    $('mReset').onclick = () => { if (!arm) { arm = true; $('mReset').textContent = 'Точно? Натисни ще раз'; $('mReset').classList.add('danger'); return; } clearSave(); location.reload(); };
  }
  private status(s: string) { $('mStatus').textContent = s; }
  toggleMenu(force?: boolean) {
    if (!this.started) return;
    const m = $('menu'), on = force ?? m.hidden;
    m.hidden = !on; this.paused = on;
    if (on) { this.menuRefresh(); this.status(''); }
  }
  private menuRefresh() {
    const w = this.w;
    $('stats').innerHTML = `День ${w.clock.day} · Ночей відбито: <b>${w.clock.n}</b> · Перемог над босом: <b>${w.stats.bosses}</b><br>Зароблено: <b>${w.stats.earned}</b> · Зібрано: <b>${w.stats.felled}</b> · Звірят розпушено: <b>${w.stats.hunted}</b><br>Затишок містечка: <b>${comfort(w)}</b>`;
    $('mMusic').textContent = 'Музика: ' + (audio.music ? 'так' : 'ні');
  }

  // ---------------------------------------------------------------- simulation events
  event(e: GameEvent) {
    switch (e.t) {
      case 'toast': this.toast(e.title, e.body); break;
      case 'dead': this.band('dead', true); setTimeout(() => this.band('dead', false), 3000); break;
      case 'bossIn': $('bossbar').hidden = false; break;
      case 'bossDown': $('bossbar').hidden = true; this.band('win', true); setTimeout(() => this.band('win', false), 4000); break;
      case 'dusk': sfx('bell'); break;
      case 'nightWin': $('bossbar').hidden = true; this.toast('Світанок', 'Ніч відбито. Нагорода вже в кишені.'); break;
      case 'nightLose': $('bossbar').hidden = true; break;
    }
  }
  private band(id: string, on: boolean) { $(id).classList.toggle('on', on); }
  toast(t: string, s: string) { const el = $('toast'); el.querySelector('b')!.textContent = t; el.querySelector('span')!.textContent = s; el.classList.add('on'); this.toastT = 3.8; }

  // ---------------------------------------------------------------- per frame
  frame(dt: number) {
    if (this.scene) { const sc = this.scene; THUMB = k => sc.thumb(k, 30); }
    if (!this.started) return;
    this.readKeys();
    const w = this.w;
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) $('toast').classList.remove('on'); }
    if (this.shown.coins !== w.coins) { this.shown.coins = w.coins; $('coinN').textContent = w.coins.toLocaleString('uk-UA'); const c = $('coins'); c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); }
    const bag = `${w.hero.stack.length}/${heroCap(w)}`; if (bag !== this.shown.bag) { this.shown.bag = bag; $('bagN').textContent = bag; }
    const showHp = w.clock.phase === 'night' || w.hero.hp < heroMaxHp(w);
    const hp = showHp ? Array.from({ length: heroMaxHp(w) }, (_, i) => `<i class="${i < w.hero.hp ? 'on' : ''}"></i>`).join('') : '';
    if (hp !== this.shown.hp) { this.shown.hp = hp; $('hearts').hidden = !hp; $('hearts').innerHTML = hp; }
    const boss = w.enemies.find(e => e.boss); if (boss) $<HTMLDivElement>('bossF').style.width = Math.max(0, boss.hp / boss.maxHp * 100) + '%';
    document.body.classList.toggle('night', w.clock.phase !== 'day');
    // clock pill
    let clock = '';
    if (w.clock.phase === 'day') { const s = Math.ceil(secondsToDusk(w)); clock = `${G.sun}<b>День ${w.clock.day}</b><span>сутінки ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}</span>`; }
    else if (w.clock.phase === 'dusk') clock = `${G.dusk}<b>Сутінки</b><span>${Math.ceil(25 - w.clock.t)} с</span>`;
    else clock = `${G.moon}<b>Ніч ${w.clock.n + 1}</b><span>${G.beast}${w.enemies.filter(e => !e.passive).length + w.clock.queue.length}</span><span>${G.fire}${litLights(w).length}</span>`;
    if (clock !== this.shown.clock) { this.shown.clock = clock; $('clock').innerHTML = clock; }
    // tutorial chip: short-lived and always derived from the current state
    let tut = '';
    if (!w.flags.tutDone) { const i = TUT.findIndex(s => !s.done(w)); if (i < 0) w.flags.tutDone = true; else tut = `${i + 1}/${TUT.length} · ${TUT[i].text}`; }
    if (tut !== this.shown.tut) { this.shown.tut = tut; const el = $('hint'); if (tut) { el.textContent = tut; el.classList.remove('off'); } else el.classList.add('off'); }
    // info chip near a building (cards open only on tap)
    const nb = this.build.active ? null : nearBuilding(w);
    const chipId = nb?.id ?? null;
    if (chipId !== this.chipFor) { this.chipFor = chipId; const el = $('chip'); el.hidden = !nb; if (nb) el.innerHTML = `${bIcon(nb.type, 'ico lg')}<span>${BUILD[nb.type].name}${nb.site ? ' · будова' : ''}</span>`; }
    if (this.cardFor) {
      const b = w.buildings[this.cardFor];
      if (!b || (!this.build.active && dist(w.hero.x, w.hero.y, b.x, b.y) > BUILD[b.type].r + 140)) this.closeCard();
      else this.renderCard(false);
    }
  }

  // ---------------------------------------------------------------- cards
  openCard(id: string) { this.cardFor = id; this.cardSig = ''; this.renderCard(true); $('card').classList.add('on'); sfx('pick'); }
  closeCard() { this.cardFor = null; this.cardSig = ''; $('card').classList.remove('on'); }
  private h(tag: string, cls = '', text = ''): HTMLElement { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }
  private row(a: string, b: string, ok = true) { const r = this.h('div', 'row' + (ok ? ' ok' : '')); const sa = this.h('span'); sa.innerHTML = a; const sb = this.h('b'); sb.innerHTML = b; r.append(sa, sb); return r; }
  private btn(label: string, cost: Cost | null, onClick: () => boolean, disabled = false, cls = 'ubtn') {
    const b = this.h('button', cls) as HTMLButtonElement;
    b.innerHTML = `<span>${label}</span>${cost ? `<small>${costLine(cost)}</small>` : ''}`;
    b.disabled = disabled || (cost ? !canAfford(this.w, cost) : false);
    b.onclick = () => { if (onClick()) { sfx('upg'); this.cardSig = ''; this.renderCard(true); } };
    return b;
  }
  private renderCard(force: boolean) {
    const w = this.w, b = this.cardFor ? w.buildings[this.cardFor] : null; if (!b) return;
    const sig = JSON.stringify([b.level, b.spec, b.status, Math.ceil(b.hp), Math.floor(b.fuel), b.store, b.input, b.site, b.gather, b.queue, b.want, b.routes, b.till, w.coins, w.up, w.units.length, w.cats.map(c => c.idle + (c.task?.to || '')), this.build.active, w.clock.phase]);
    if (!force && sig === this.cardSig) return;
    this.cardSig = sig;
    const el = $('card'); el.innerHTML = '';
    const def = BUILD[b.type];
    const close = this.h('button', 'x'); close.innerHTML = G.close; close.setAttribute('aria-label', 'Закрити'); close.onclick = () => this.closeCard(); el.append(close);
    const stars = def.levels && !b.site ? ' ' + '★'.repeat(b.level) + '☆'.repeat(def.levels.length - b.level) : '';
    const h2 = this.h('h2'); h2.innerHTML = `${bIcon(b.type, 'ico lg')}<span>${def.name}<small>${stars}</small></span>`; el.append(h2);
    if (b.site) {
      el.append(this.h('p', 'sub', 'Будується'));
      const rows = this.h('div', 'rows');
      for (const [k, n] of Object.entries(b.site) as [ItemId, number][]) rows.append(this.row(`${ico(k)} ${ITEMS[k].name}`, `ще ${n}${invGet(b.incoming, k) ? ` (везуть ${invGet(b.incoming, k)})` : ''}`, false));
      const needHouse = ([['stone', 'houseQuarry'], ['berry', 'houseForager'], ['lav', 'houseGatherer']] as const).find(([k, t]) => b.site![k as ItemId] && !has(w, t) && !(k === 'lav' && !w.flags.hedge));
      if (needHouse) el.append(this.h('p', 'tip warn', `Ніхто не збирає ${ITEMS[needHouse[0] as ItemId].name.toLowerCase()}: постав «${BUILD[needHouse[1]].name}» (🔨 → Котики) або збери сам.`));
      if (b.site.lav && !w.flags.hedge) el.append(this.h('p', 'tip warn', 'Лавандова деревина росте за хащами: розчисти їх у картці Ратуші.'));
      el.append(rows, this.h('p', 'tip', has(w, 'houseHauler') ? 'Носії привезуть матеріали зі складу. Або принеси сам і стань поруч.' : 'Принеси матеріали в рюкзаку і стань поруч із будовою.'));
    } else {
      el.append(this.h('p', 'tip', def.desc));
      this.typeSection(el, b);
      const nl = nextLevel(b);
      if (nl) { el.append(this.h('p', 'sub', 'Наступний рівень: ' + nl.label)); el.append(this.btn('Покращити', nl.cost, () => upgradeBuilding(w, b))); }
      else if (def.specs && !b.spec) { el.append(this.h('p', 'sub', 'Обери спеціалізацію (назавжди)')); for (const s of def.specs) el.append(this.btn(`${s.name}: ${s.desc}`, s.cost, () => chooseSpec(w, b, s.id))); }
    }
    if (this.build.active && !def.noBuild) {
      const r = this.h('div', 'mrow');
      if (DISTRICT_OF[b.type] || SOCKET_OF[b.type]) r.append(this.btn(`${G.move} Перенести`, null, () => { this.clearPick(); this.build.moving = b.id; this.closeCard(); this.renderDrawer(); return false; }, false, 'ubtn ghost'));
      const dz = this.btn(`${G.trash} Знести`, null, () => { if (this.armDemolish !== b.id) { this.armDemolish = b.id; dz.querySelector('span')!.innerHTML = `${G.trash} Точно знести? +50% монет`; dz.classList.add('danger'); return false; } demolish(w, b); this.armDemolish = null; this.closeCard(); return false; }, false, 'ubtn ghost');
      r.append(dz);
      el.append(r);
    } else if (!def.noBuild || b.type === 'hall') { if (!this.build.active) el.append(this.h('p', 'tip dim', 'Перемістити чи знести можна в режимі будівництва.')); }
  }
  private typeSection(el: HTMLElement, b: Building) {
    const w = this.w, def = BUILD[b.type], rows = this.h('div', 'rows');
    if (def.proc) {
      const p = procStats(b);
      rows.append(this.row('Стан', b.status || '—', b.status === 'Працює'));
      rows.append(this.row(`${ico(p.input)} Прийом`, `${invGet(b.input, p.input)} / ${p.inCap}`));
      rows.append(this.row(`${ico(p.output)} Видача`, `${invGet(b.store, p.output)} / ${p.outCap}`, invGet(b.store, p.output) < p.outCap));
    }
    if (def.fuel) {
      rows.append(this.row('Паливо', `${ico(def.fuel.item)} ${Math.floor(b.fuel)} / ${def.fuel.cap}`, b.fuel > def.fuel.cap * 0.25));
      rows.append(this.row('Міцність', `${Math.ceil(b.hp)} / ${b.maxHp}`, b.hp >= b.maxHp));
      el.append(rows, this.h('p', 'tip', `Носії самі підкидають ${ITEMS[def.fuel.item].name.toLowerCase()} зі складу. Можна й самому: стань на помаранчевий майданчик.`)); return;
    }
    if (b.type === 'store') {
      rows.append(this.row('На прилавку', `<span class="cost">${ico('coins')}${b.till || 0}</span>`, !(b.till)));
      rows.append(this.row('Полиці', `${invTotal(b.store)} / ${levelStats(b).cap}`));
      for (const k of ['log', 'plank', 'berry', 'stone', 'candle', 'lav'] as ItemId[]) if (invGet(b.store, k) || w.visitors.some(v => v.want === k)) rows.append(this.row(`${ico(k)} ${ITEMS[k].name}`, String(invGet(b.store, k)), invGet(b.store, k) > 0));
      el.append(rows, this.h('p', 'tip', `У черзі ${w.visitors.filter(v => v.state !== 'leave').length}. Стань на «Каса», щоб забрати монети, або на «Прийом», щоб докласти товар з рюкзака.`));
      return;
    }
    if (b.type === 'storage') {
      rows.append(this.row('Заповнено', `${invTotal(b.store)} / ${storageCap(b)}`, invTotal(b.store) < storageCap(b)));
      for (const k of Object.keys(ITEMS) as ItemId[]) if (invGet(b.store, k)) rows.append(this.row(`${ico(k)} ${ITEMS[k].name}`, String(invGet(b.store, k))));
      el.append(rows, this.h('p', 'sub', 'Котики зараз'));
      const list = this.h('div', 'rows');
      for (const c of w.cats) list.append(this.row(c.role === 'gatherer' ? BUILD[w.buildings[c.home]?.type ?? 'houseGatherer'].name : c.role === 'hauler' ? 'Носій' : 'Майстер', this.catDoing(c), !c.idle));
      el.append(list); return;
    }
    if (def.role) {
      for (const c of w.cats.filter(c => c.home === b.id)) rows.append(this.row('Котик', this.catDoing(c), !c.idle));
      el.append(rows);
      return;
    }
    if (b.type === 'hall') {
      rows.append(this.row('Межі містечка', `${levelStats(b).half * 2} × ${levelStats(b).half * 2} клітин`));
      rows.append(this.row('Затишок', `${comfort(w)} (котики +${Math.min(30, comfort(w) * 2)}%)`));
      el.append(rows);
      const pr = PROJECTS.hedge;
      if (!w.flags.hedge) { el.append(this.h('p', 'sub', 'Проєкт: ' + pr.name)); el.append(this.btn(pr.name, pr.cost, () => doProject(w, 'hedge'), !!reqMet(w, pr.req))); if (reqMet(w, pr.req)) el.append(this.h('p', 'tip dim', reqMet(w, pr.req)!)); }
      return;
    }
    if (b.type === 'forge') { this.forgeSection(el); return; }
    if (b.type === 'bell') {
      const wave = nextWave(w);
      rows.append(this.row('Наступна', wave.title)); rows.append(this.row('Звідки', wave.dirs.map(d => SPAWNS[d].name).join(', '))); rows.append(this.row('Звірів', String(wave.entries.length))); rows.append(this.row('Нагорода', `🪙 ${Math.round(wave.reward * 1.25)} (+25% за ранній дзвін)`));
      el.append(rows, this.btn('Подзвонити: ніч зараз', null, () => { const ok = callNightEarly(w); if (ok) this.closeCard(); return ok; }, w.clock.phase !== 'day'));
      return;
    }
    if (b.type === 'barracks') {
      rows.append(this.row('Воїнів', `${w.units.length} / ${unitCap(w)}`)); rows.append(this.row('Стан', b.status || '—'));
      if (b.queue?.length) rows.append(this.row('Черга', b.queue.map(k => pic('u:' + k)).join(' ')));
      el.append(rows);
      for (const [k, u] of Object.entries(UNITS) as [keyof typeof UNITS, (typeof UNITS)[keyof typeof UNITS]][]) el.append(this.btn(`${pic('u:' + k)} Навчити: ${u.name}`, u.cost, () => trainUnit(w, b, k)));
      el.append(this.h('p', 'sub', 'Нічні патрулі'));
      const r = b.routes || (b.routes = { ring: 2, ns: 1, ew: 1 });
      for (const k of ['ring', 'ns', 'ew'] as const) {
        const row = this.h('div', 'urow'); row.append(this.h('div', 'ic'));
        const mid = this.h('div'); mid.append(this.h('div', 'nm', ROUTE_NAME[k]), this.h('div', 'ds', `хочу ${r[k]} · зараз ${w.units.filter(u => u.post === k).length}`)); row.append(mid);
        const pm = this.h('div', 'pm');
        const minus = this.h('button', 'segb', '−') as HTMLButtonElement; minus.onclick = () => { r[k] = Math.max(0, r[k] - 1); this.cardSig = ''; this.renderCard(true); };
        const plus = this.h('button', 'segb', '+') as HTMLButtonElement; plus.onclick = () => { r[k] = Math.min(12, r[k] + 1); this.cardSig = ''; this.renderCard(true); };
        pm.append(minus, plus); row.append(pm); el.append(row);
      }
      el.append(this.h('p', 'tip', 'Уночі воїни з ліхтарями ходять по муру й дорогах і ловлять звірів, що прорвалися. Поранені лікуються тут.'));
      return;
    }
    if (b.type === 'post') {
      const free = (k: string) => w.units.filter(u => u.kind === k).length;
      for (const k of ['spear', 'sling'] as const) {
        const r = this.h('div', 'urow');
        const ic = this.h('div', 'ic'); ic.innerHTML = pic('u:' + k, 'ico lg'); r.append(ic);
        const mid = this.h('div'); mid.append(this.h('div', 'nm', UNITS[k].name), this.h('div', 'ds', `тут ${w.units.filter(u => u.post === b.id && u.kind === k).length} · хочу ${b.want![k]} · усього в загоні ${free(k)}`)); r.append(mid);
        const pm = this.h('div', 'pm');
        const minus = this.h('button', 'segb', '−') as HTMLButtonElement; minus.onclick = () => { b.want![k] = Math.max(0, b.want![k] - 1); this.cardSig = ''; this.renderCard(true); };
        const plus = this.h('button', 'segb', '+') as HTMLButtonElement; plus.onclick = () => { b.want![k] = Math.min(8, b.want![k] + 1); this.cardSig = ''; this.renderCard(true); };
        pm.append(minus, plus); r.append(pm); el.append(r);
      }
      return;
    }
    if (b.type === 'tower') { const s = BUILD.tower.levels![b.level - 1].stats; rows.append(this.row('Шишка', `${s.dmg} шкоди раз на ${s.rate} с`)); }
    if (b.type === 'palisade' || b.type === 'tower') rows.append(this.row('Міцність', `${Math.ceil(b.hp)} / ${b.maxHp}`, b.hp >= b.maxHp));
    if (def.comfort) rows.append(this.row('Затишок', '+' + def.comfort));
    if (rows.childElementCount) el.append(rows);
  }
  private catDoing(c: World['cats'][number]) {
    if (c.hidden) return 'спить удома';
    if (c.idle) return c.idle;
    const t = c.task; if (!t) return 'думає';
    if (t.kind === 'harvest') return 'збирає';
    const to = t.to ? this.w.buildings[t.to.split('|')[0]] : null;
    return `${ico(t.item!)} ${t.n} → ${to ? BUILD[to.type].name : '…'}`;
  }
  private forgeSection(el: HTMLElement) {
    const w = this.w;
    for (const u of HERO_UPG) {
      if (u.req && !w.flags[u.req]) continue;
      const lv = w.up[u.id], max = u.costs.length;
      const row = this.h('div', 'urow');
      const ic = this.h('div', 'ic'); ic.innerHTML = UPG_ICON[u.id] || pic(u.id === 'axe' ? 'w:axe' : 'hero', 'ico lg'); row.append(ic);
      const mid = this.h('div'); mid.append(this.h('div', 'nm', u.name), this.h('div', 'ds', lv >= max ? 'Максимум!' : u.desc(lv)));
      const lvl = this.h('div', 'lv'); for (let i = 0; i < max; i++) lvl.append(this.h('i', i < lv ? 'on' : '')); mid.append(lvl);
      row.append(mid, lv >= max ? this.btn(G.check, null, () => false, true) : this.btn('', u.costs[lv], () => heroUpgrade(w, u.id)));
      el.append(row);
    }
  }

  // ---------------------------------------------------------------- build mode: plots and sockets from the master plan
  enterBuild() { this.build.active = true; this.clearPick(); this.build.selected = null; document.body.classList.add('building'); this.closeCard(); this.renderDrawer(); }
  exitBuild() { this.build.active = false; this.clearPick(); this.build.selected = null; document.body.classList.remove('building'); $('drawer').classList.remove('on'); this.closeCard(); this.scene?.focus(); }
  private clearPick() { this.build.pick = null; this.build.spot = null; this.build.moving = null; }
  private spotLabel(id: string) { const p = plotsNow(this.w).find(x => x.id === id); if (p) return `${DISTRICT_NAME[p.district]}, ділянка ${p.size}×${p.size}`; const s = sockets(this.w).find(x => 'socket:' + x.id === id); return s ? (s.kind === 'tower' ? 'Гніздо башти на мурі' : s.kind === 'lantern' ? 'Гніздо ліхтаря' : 'Гніздо вогню біля брами') : ''; }
  private typesFor(id: string): BuildingType[] {
    const p = plotsNow(this.w).find(x => x.id === id), s = sockets(this.w).find(x => 'socket:' + x.id === id);
    return (Object.keys(BUILD) as BuildingType[]).filter(t => !BUILD[t].noBuild && (p ? fits(t, p) : s ? !!SOCKET_OF[t]?.includes(s.kind) : false));
  }
  private renderDrawer() {
    const w = this.w, d = $('drawer'), st = this.build; d.classList.add('on');
    $('bOk').hidden = true;
    $('bRing').hidden = !!buildLock(w, 'palisade');
    const mv = st.moving ? w.buildings[st.moving] : null;
    $('buildHint').textContent = mv ? `Перенести «${BUILD[mv.type].name}»: торкнись підсвіченої вільної ділянки.`
      : st.spot ? `${this.spotLabel(st.spot)}. Обери, що тут звести.`
      : st.pick ? `«${BUILD[st.pick].name}»: торкнись підсвіченої ділянки на мапі.`
      : 'Торкнись порожньої ділянки чи гнізда на мапі або обери будівлю нижче.';
    const tabs = $('tabs'); tabs.innerHTML = ''; tabs.hidden = !!st.spot;
    for (const c of CATEGORIES) { const b = this.h('button', 'tab' + (st.cat === c.id ? ' on' : '')); b.innerHTML = `${G[c.id as keyof typeof G]}<span>${c.name}</span>`; b.onclick = () => { st.cat = c.id; this.renderDrawer(); }; tabs.append(b); }
    const list = $('blist'); list.innerHTML = '';
    const types = st.spot ? this.typesFor(st.spot) : (Object.keys(BUILD) as BuildingType[]).filter(t => BUILD[t].cat === st.cat && !BUILD[t].noBuild && t !== 'palisade');
    if (st.spot && !types.length) list.append(this.h('p', 'tip dim', 'Тут поки нічого не можна звести.'));
    for (const type of types) {
      const def = BUILD[type], lock = buildLock(w, type), afford = w.coins >= (def.cost.coins || 0), free = spotsFor(w, type).length;
      const where = DISTRICT_OF[type] ? DISTRICT_OF[type]!.map(x => DISTRICT_NAME[x]).join(', ') : SOCKET_OF[type] ? 'гнізда на мурі' : '';
      const card = this.h('button', 'bitem' + (lock ? ' locked' : !afford ? ' poor' : '') + (st.pick === type ? ' on' : '')) as HTMLButtonElement;
      const max = def.max?.[hallLevel(w) - 1];
      card.innerHTML = `<div class="bi">${bIcon(type, 'thumb')}</div><div class="bn">${def.name}</div><div class="bc">${lock ? G.lock + ' ' + lock : !free && !st.spot ? 'немає вільного місця' : costLine(def.cost)}</div>${max !== undefined && !lock ? `<div class="bm">${count(w, type)}/${max}</div>` : ''}${where && !st.spot ? `<div class="bw">${where}</div>` : ''}`;
      card.disabled = !!lock;
      card.title = def.desc;
      card.onclick = () => {
        if (!afford) { this.toast('Бракує монет', `${def.name}: потрібно ${def.cost.coins} монет. Матеріали довезуть потім.`); return; }
        if (st.spot) { this.placeOn(type, st.spot); return; }
        st.pick = st.pick === type ? null : type; this.closeCard(); this.renderDrawer(); sfx('pick');
      };
      list.append(card);
    }
    const gd = st.pick ? BUILD[st.pick] : mv ? BUILD[mv.type] : null;
    $('bdesc').innerHTML = gd ? `<b>${gd.name}.</b> ${gd.desc}` : '';
  }
  private spotCentre(type: BuildingType, id: string) {
    const p = plotsNow(this.w).find(x => x.id === id); if (p) return centreAt(type, p.x, p.y);
    const s = sockets(this.w).find(x => 'socket:' + x.id === id)!; return centreAt(type, s.x, s.y);
  }
  private placeOn(type: BuildingType, id: string) {
    const w = this.w, c = this.spotCentre(type, id), why = placeCheck(w, type, c.x, c.y) || buildLock(w, type);
    if (why) { this.toast('Не стане', why); return; }
    if (place(w, type, c.x, c.y)) { sfx('drop'); this.clearPick(); this.renderDrawer(); }
  }
  /** Free plot or socket under a tap. */
  private spotAt(x: number, y: number): string | null {
    const w = this.w;
    for (const s of sockets(w)) { if (socketTaken(w, s)) continue; const f = s.kind === 'tower' ? 2 : 1, c = { x: TC.x + (s.x + f / 2) * CELL, y: TC.y + (s.y + f / 2) * CELL }; if (Math.abs(x - c.x) < f * CELL / 2 + 6 && Math.abs(y - c.y) < f * CELL / 2 + 6) return 'socket:' + s.id; }
    for (const p of plotsNow(w)) { if (plotTaken(w, p)) continue; const c = plotCentre(p); if (Math.abs(x - c.x) < p.size * CELL / 2 && Math.abs(y - c.y) < p.size * CELL / 2) return p.id; }
    return null;
  }
  private buildTap(x: number, y: number) {
    const w = this.w, st = this.build, spot = this.spotAt(x, y);
    if (st.moving && spot) { const b = w.buildings[st.moving]; if (b) { const c = this.spotCentre(b.type, spot); if (moveBuilding(w, b, c.x, c.y)) { sfx('drop'); this.clearPick(); this.build.selected = b.id; } else this.toast('Не стане', placeCheck(w, b.type, c.x, c.y) || 'Інший розмір чи район'); } this.renderDrawer(); return; }
    if (st.pick && spot) { this.placeOn(st.pick, spot); return; }
    if (spot) { st.spot = spot; st.pick = null; this.closeCard(); this.renderDrawer(); sfx('pick'); return; }
    let best: Building | null = null, bd = 1e9;
    for (const b of Object.values(w.buildings)) { const r = BUILD[b.type].r; if (Math.abs(x - b.x) < r + 8 && Math.abs(y - b.y) < r + 8) { const d = dist(x, y, b.x, b.y); if (d < bd) { bd = d; best = b; } } }
    st.selected = best?.id ?? null; st.spot = null;
    if (best) this.openCard(best.id); else this.closeCard();
    this.renderDrawer();
  }
}
