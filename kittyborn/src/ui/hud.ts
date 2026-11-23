import { BUILD, CATEGORIES, HERO_UPG, ITEMS, PROJECTS, SPAWNS, UNITS, type BuildingType, type Category, type Cost, type ItemId } from '../content/data';
import { buildLock, canAfford, chooseSpec, demolish, doProject, heroUpgrade, moveBuilding, nextLevel, place, placeCheck, trainUnit, unitCap, upgradeBuilding } from '../sim/economy';
import { callNightEarly, litLights, nextWave, secondsToDusk } from '../sim/night';
import { nearBuilding, type Input } from '../sim/sim';
import { exportCode, importCode } from '../sim/save';
import { comfort, count, dist, has, hallLevel, heroCap, heroMaxHp, invGet, invTotal, levelStats, procStats, reqMet, storageCap, type Building, type GameEvent, type World } from '../sim/world';
import type { Ghost, WorldScene } from '../render/WorldScene';
import { audio, audioInit, setMusic, setSound, sfx } from '../platform/audio';
import { clearSave, saveSettings } from '../platform/storage';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const ico = (k: string) => k === 'coins' ? '🪙' : ITEMS[k as ItemId]?.icon ?? '';
const costLine = (c: Cost) => (Object.entries(c) as [string, number][]).filter(([, n]) => n).map(([k, n]) => `${ico(k)}${n}`).join(' ') || 'безкоштовно';
const TUT: { text: string; done: (w: World) => boolean }[] = [
  { text: 'Підійди до дерева: сокира рубає сама', done: w => w.stats.felled > 0 },
  { text: 'Продай дрова Пані Сові на жовтому майданчику', done: w => w.stats.earned >= 6 },
  { text: 'Натисни 🔨 → Котики і постав Хатку лісорубів', done: w => has(w, 'houseGatherer') },
  { text: 'Постав Лісопилку: дошки потрібні для всього', done: w => has(w, 'sawmill') },
  { text: 'Постав Костер: світло обпікає нічних звірів', done: w => has(w, 'bonfire') },
  { text: 'Огороди містечко частоколом перед першою ніччю', done: w => count(w, 'palisade') >= 3 },
];

export class Hud {
  input: Input = { x: 0, y: 0 };
  started = false; paused = false;
  scene: WorldScene | null = null;
  build = { active: false, ghost: null as Ghost | null, selected: null as string | null, cat: 'eco' as Category };
  private cardFor: string | null = null; private cardSig = ''; private chipFor: string | null = null;
  private toastT = 0; private shown = { coins: -1, bag: '', hp: '', clock: '', tut: '' };
  private joy = { on: false, id: -1, ox: 0, oy: 0, sx: 0, sy: 0, moved: false };
  private keys: Record<string, boolean> = {};

  constructor(private getWorld: () => World, private setWorld: (w: World) => void) {
    this.bindPointer(); this.bindButtons();
    addEventListener('keydown', e => { this.keys[e.key.toLowerCase()] = true; if (e.key === 'Escape') { if (this.build.active) this.exitBuild(); else this.toggleMenu(); } });
    addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = false; });
  }
  get w() { return this.getWorld(); }

  // ---------------------------------------------------------------- pointer: joystick normally, pan + tap in build mode
  private bindPointer() {
    const area = $('game'), base = $('joyBase'), knob = $('joyKnob'), R = 60;
    area.addEventListener('pointerdown', e => {
      audioInit();
      if (this.joy.on) return;
      this.joy = { on: true, id: e.pointerId, ox: e.clientX, oy: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
      try { area.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      if (this.build.active) return;
      base.hidden = false; base.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`; knob.style.transform = 'translate(0px,0px)';
    });
    area.addEventListener('pointermove', e => {
      if (!this.joy.on || e.pointerId !== this.joy.id) return;
      if (this.build.active) {
        const dx = e.clientX - this.joy.ox, dy = e.clientY - this.joy.oy;
        if (Math.hypot(e.clientX - this.joy.sx, e.clientY - this.joy.sy) > 10) this.joy.moved = true;
        if (this.joy.moved) { const dpr = Math.min(2, devicePixelRatio || 1); this.scene?.panBy(dx * dpr, dy * dpr); this.joy.ox = e.clientX; this.joy.oy = e.clientY; }
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
      if (wasTap && this.scene) { const dpr = Math.min(2, devicePixelRatio || 1); const p = this.scene.screenToWorld(e.clientX * dpr, e.clientY * dpr); this.buildTap(p.x, p.y); }
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
    const snd = $('bSnd'); const sndIcon = () => { snd.textContent = audio.sound ? '🔊' : '🔇'; }; sndIcon();
    snd.onclick = () => { audioInit(); setSound(!audio.sound); saveSettings(audio); sndIcon(); };
    $('bMenu').onclick = () => this.toggleMenu();
    $('bBuild').onclick = () => (this.build.active ? this.exitBuild() : this.enterBuild());
    $('chip').onclick = () => { if (this.chipFor) this.openCard(this.chipFor); };
    $('bOk').onclick = () => this.confirmGhost();
    $('bCancel').onclick = () => { if (this.build.ghost) { this.build.ghost = null; this.renderDrawer(); } else this.exitBuild(); };
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
    if (!this.started) return;
    this.readKeys();
    const w = this.w;
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) $('toast').classList.remove('on'); }
    if (this.shown.coins !== w.coins) { this.shown.coins = w.coins; $('coinN').textContent = w.coins.toLocaleString('uk-UA'); const c = $('coins'); c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); }
    const bag = `${w.hero.stack.length}/${heroCap(w)}`; if (bag !== this.shown.bag) { this.shown.bag = bag; $('bagN').textContent = bag; }
    const hp = w.clock.phase === 'night' || w.hero.hp < heroMaxHp(w) ? '❤️'.repeat(Math.max(0, w.hero.hp)) + '🤍'.repeat(Math.max(0, heroMaxHp(w) - Math.max(0, w.hero.hp))) : '';
    if (hp !== this.shown.hp) { this.shown.hp = hp; $('hearts').hidden = !hp; $('hearts').textContent = hp; }
    const boss = w.enemies.find(e => e.boss); if (boss) $<HTMLDivElement>('bossF').style.width = Math.max(0, boss.hp / boss.maxHp * 100) + '%';
    document.body.classList.toggle('night', w.clock.phase !== 'day');
    // clock pill
    let clock = '';
    if (w.clock.phase === 'day') { const s = Math.ceil(secondsToDusk(w)); clock = `☀️ День ${w.clock.day} · сутінки за ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
    else if (w.clock.phase === 'dusk') clock = `🌆 Сутінки · ${Math.ceil(25 - w.clock.t)} с`;
    else clock = `🌙 ${w.clock.title} · звірів ${w.enemies.filter(e => !e.passive).length + w.clock.queue.length} · світла ${litLights(w).length}`;
    if (clock !== this.shown.clock) { this.shown.clock = clock; $('clock').textContent = clock; }
    // tutorial chip: short-lived and always derived from the current state
    let tut = '';
    if (!w.flags.tutDone) { const i = TUT.findIndex(s => !s.done(w)); if (i < 0) w.flags.tutDone = true; else tut = `${i + 1}/${TUT.length} · ${TUT[i].text}`; }
    if (tut !== this.shown.tut) { this.shown.tut = tut; const el = $('hint'); if (tut) { el.textContent = tut; el.classList.remove('off'); } else el.classList.add('off'); }
    // info chip near a building (cards open only on tap)
    const nb = this.build.active ? null : nearBuilding(w);
    const chipId = nb?.id ?? null;
    if (chipId !== this.chipFor) { this.chipFor = chipId; const el = $('chip'); el.hidden = !nb; if (nb) el.innerHTML = `<span>${BUILD[nb.type].icon}</span> ${BUILD[nb.type].name}${nb.site ? ' (будова)' : ''}`; }
    if (this.cardFor) {
      const b = w.buildings[this.cardFor];
      if (!b || (!this.build.active && dist(w.hero.x, w.hero.y, b.x, b.y) > BUILD[b.type].r + 140)) this.closeCard();
      else this.renderCard(false);
    }
    if (this.build.active) this.updateGhost();
  }

  // ---------------------------------------------------------------- cards
  openCard(id: string) { this.cardFor = id; this.cardSig = ''; this.renderCard(true); $('card').classList.add('on'); sfx('pick'); }
  closeCard() { this.cardFor = null; this.cardSig = ''; $('card').classList.remove('on'); }
  private h(tag: string, cls = '', text = ''): HTMLElement { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }
  private row(a: string, b: string, ok = true) { const r = this.h('div', 'row' + (ok ? ' ok' : '')); r.append(this.h('span', '', a), this.h('b', '', b)); return r; }
  private btn(label: string, cost: Cost | null, onClick: () => boolean, disabled = false, cls = 'ubtn') {
    const b = this.h('button', cls) as HTMLButtonElement;
    b.innerHTML = `<span>${label}</span>${cost ? `<small>${costLine(cost)}</small>` : ''}`;
    b.disabled = disabled || (cost ? !canAfford(this.w, cost) : false);
    b.onclick = () => { if (onClick()) { sfx('upg'); this.cardSig = ''; this.renderCard(true); } };
    return b;
  }
  private renderCard(force: boolean) {
    const w = this.w, b = this.cardFor ? w.buildings[this.cardFor] : null; if (!b) return;
    const sig = JSON.stringify([b.level, b.spec, b.status, Math.ceil(b.hp), Math.floor(b.fuel), b.store, b.input, b.site, b.gather, b.queue, b.want, w.coins, w.up, w.units.length, w.cats.map(c => c.idle + (c.task?.to || '')), this.build.active, w.clock.phase]);
    if (!force && sig === this.cardSig) return;
    this.cardSig = sig;
    const el = $('card'); el.innerHTML = '';
    const def = BUILD[b.type];
    const close = this.h('button', 'x', '✕'); close.onclick = () => this.closeCard(); el.append(close);
    const stars = def.levels && !b.site ? ' ' + '★'.repeat(b.level) + '☆'.repeat(def.levels.length - b.level) : '';
    el.append(this.h('h2', '', `${def.icon} ${def.name}${stars}`));
    if (b.site) {
      el.append(this.h('p', 'sub', 'Будується'));
      const rows = this.h('div', 'rows');
      for (const [k, n] of Object.entries(b.site) as [ItemId, number][]) rows.append(this.row(`${ITEMS[k].icon} ${ITEMS[k].name}`, `ще ${n}${invGet(b.incoming, k) ? ` (везуть ${invGet(b.incoming, k)})` : ''}`, false));
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
      r.append(this.btn('↔️ Перемістити', null, () => { this.build.ghost = { type: b.type, x: b.x, y: b.y, ok: true, moving: b.id }; this.closeCard(); this.renderDrawer(); return false; }, false, 'ubtn ghost'));
      r.append(this.btn('🗑️ Знести (+50% монет)', null, () => { demolish(w, b); this.closeCard(); return false; }, false, 'ubtn ghost'));
      el.append(r);
    } else if (!def.noBuild || b.type === 'hall') { if (!this.build.active) el.append(this.h('p', 'tip dim', 'Перемістити чи знести можна в режимі 🔨.')); }
  }
  private typeSection(el: HTMLElement, b: Building) {
    const w = this.w, def = BUILD[b.type], rows = this.h('div', 'rows');
    if (def.proc) {
      const p = procStats(b);
      rows.append(this.row('Стан', b.status || '—', b.status === 'Працює'));
      rows.append(this.row(`${ITEMS[p.input].icon} Вхід`, `${invGet(b.input, p.input)} / ${p.inCap}`));
      rows.append(this.row(`${ITEMS[p.output].icon} Вихід`, `${invGet(b.store, p.output)} / ${p.outCap}`, invGet(b.store, p.output) < p.outCap));
    }
    if (def.fuel) {
      rows.append(this.row('Паливо', `${ITEMS[def.fuel.item].icon} ${Math.floor(b.fuel)} / ${def.fuel.cap}`, b.fuel > def.fuel.cap * 0.25));
      rows.append(this.row('Міцність', `${Math.ceil(b.hp)} / ${b.maxHp}`, b.hp >= b.maxHp));
      el.append(rows, this.h('p', 'tip', `Носії самі підкидають ${ITEMS[def.fuel.item].name.toLowerCase()} зі складу. Можна й самому: стань на помаранчевий майданчик.`)); return;
    }
    if (b.type === 'storage') {
      rows.append(this.row('Заповнено', `${invTotal(b.store)} / ${storageCap(b)}`, invTotal(b.store) < storageCap(b)));
      for (const k of Object.keys(ITEMS) as ItemId[]) if (invGet(b.store, k)) rows.append(this.row(`${ITEMS[k].icon} ${ITEMS[k].name}`, String(invGet(b.store, k))));
      el.append(rows, this.h('p', 'sub', 'Котики зараз'));
      const list = this.h('div', 'rows');
      for (const c of w.cats) list.append(this.row(c.role === 'gatherer' ? BUILD[w.buildings[c.home]?.type ?? 'houseGatherer'].icon + ' Збирач' : c.role === 'hauler' ? '🐈 Носій' : '🛠️ Майстер', this.catDoing(c), !c.idle));
      el.append(list); return;
    }
    if (def.role) {
      for (const c of w.cats.filter(c => c.home === b.id)) rows.append(this.row('Котик', this.catDoing(c), !c.idle));
      el.append(rows);
      return;
    }
    if (b.type === 'hall') {
      rows.append(this.row('Межі містечка', `${levelStats(b).radius} кроків`));
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
      if (b.queue?.length) rows.append(this.row('Черга', b.queue.map(k => UNITS[k].icon).join(' ')));
      el.append(rows);
      for (const [k, u] of Object.entries(UNITS) as [keyof typeof UNITS, (typeof UNITS)[keyof typeof UNITS]][]) el.append(this.btn(`${u.icon} Навчити: ${u.name}`, u.cost, () => trainUnit(w, b, k)));
      el.append(this.h('p', 'tip', 'Постав 🚩 Пости варти і признач на кожен потрібну кількість воїнів. Поранені лікуються тут.'));
      return;
    }
    if (b.type === 'post') {
      const free = (k: string) => w.units.filter(u => u.kind === k).length;
      for (const k of ['spear', 'sling'] as const) {
        const r = this.h('div', 'urow');
        r.append(this.h('div', 'ic', UNITS[k].icon));
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
      row.append(this.h('div', 'ic', u.icon));
      const mid = this.h('div'); mid.append(this.h('div', 'nm', u.name), this.h('div', 'ds', lv >= max ? 'Максимум!' : u.desc(lv)));
      const lvl = this.h('div', 'lv'); for (let i = 0; i < max; i++) lvl.append(this.h('i', i < lv ? 'on' : '')); mid.append(lvl);
      row.append(mid, lv >= max ? this.btn('✓', null, () => false, true) : this.btn('', u.costs[lv], () => heroUpgrade(w, u.id)));
      el.append(row);
    }
  }

  // ---------------------------------------------------------------- build mode
  enterBuild() { this.build.active = true; this.build.ghost = null; this.build.selected = null; document.body.classList.add('building'); this.closeCard(); this.renderDrawer(); }
  exitBuild() { this.build.active = false; this.build.ghost = null; this.build.selected = null; document.body.classList.remove('building'); $('drawer').classList.remove('on'); this.closeCard(); this.scene?.focus(); }
  private renderDrawer() {
    const w = this.w, d = $('drawer'); d.classList.add('on');
    $('bOk').hidden = !this.build.ghost;
    $('buildHint').textContent = this.build.ghost
      ? (this.build.ghost.moving ? 'Торкнись нового місця і натисни ✓' : 'Торкнись мапи, щоб поставити. Тягни пальцем, щоб рухати камеру.')
      : 'Обери будівлю. Або торкнись будівлі на мапі, щоб перемістити чи знести.';
    const tabs = $('tabs'); tabs.innerHTML = '';
    for (const c of CATEGORIES) { const b = this.h('button', 'tab' + (this.build.cat === c.id ? ' on' : ''), `${c.icon} ${c.name}`); b.onclick = () => { this.build.cat = c.id; this.renderDrawer(); }; tabs.append(b); }
    const list = $('blist'); list.innerHTML = '';
    for (const [type, def] of Object.entries(BUILD) as [BuildingType, (typeof BUILD)[BuildingType]][]) {
      if (def.cat !== this.build.cat || def.noBuild) continue;
      const lock = buildLock(w, type), afford = w.coins >= (def.cost.coins || 0);
      const card = this.h('button', 'bitem' + (lock ? ' locked' : '') + (this.build.ghost?.type === type && !this.build.ghost.moving ? ' on' : '')) as HTMLButtonElement;
      const max = def.max?.[hallLevel(w) - 1];
      card.innerHTML = `<div class="bi">${def.icon}</div><div class="bn">${def.name}</div><div class="bc">${lock ? '🔒 ' + lock : costLine(def.cost)}</div>${max !== undefined && !lock ? `<div class="bm">${count(w, type)}/${max}</div>` : ''}`;
      card.disabled = !!lock;
      card.title = def.desc;
      card.onclick = () => {
        if (!afford) { this.toast('Бракує монет', `${def.name}: потрібно ${def.cost.coins} 🪙. Матеріали можна довезти потім.`); return; }
        const h = w.hero; this.build.ghost = { type, x: h.x, y: h.y - 90, ok: false }; this.build.selected = null; this.closeCard(); this.renderDrawer(); sfx('pick');
      };
      list.append(card);
    }
  }
  private buildTap(x: number, y: number) {
    const w = this.w;
    if (this.build.ghost) { this.build.ghost.x = Math.round(x); this.build.ghost.y = Math.round(y); this.updateGhost(); sfx('drop'); return; }
    let best: Building | null = null, bd = 1e9;
    for (const b of Object.values(w.buildings)) { const d = dist(x, y, b.x, b.y - 20); if (d < BUILD[b.type].r + 26 && d < bd) { bd = d; best = b; } }
    this.build.selected = best?.id ?? null;
    if (best) this.openCard(best.id); else this.closeCard();
  }
  private updateGhost() {
    const g = this.build.ghost; if (!g) return;
    g.ok = !(g.moving ? placeCheck(this.w, g.type, g.x, g.y, g.moving) : placeCheck(this.w, g.type, g.x, g.y) || buildLock(this.w, g.type));
    const btn = $<HTMLButtonElement>('bOk'); btn.disabled = !g.ok;
    const why = g.moving ? placeCheck(this.w, g.type, g.x, g.y, g.moving) : placeCheck(this.w, g.type, g.x, g.y) || buildLock(this.w, g.type);
    $('ghostWhy').textContent = why || '';
  }
  private confirmGhost() {
    const g = this.build.ghost, w = this.w; if (!g || !g.ok) return;
    if (g.moving) { const b = w.buildings[g.moving]; if (b && moveBuilding(w, b, g.x, g.y)) { this.build.ghost = null; this.build.selected = b.id; } }
    else {
      const b = place(w, g.type, g.x, g.y);
      if (b) { const def = BUILD[g.type]; if (def.continuous && !buildLock(w, g.type) && w.coins >= (def.cost.coins || 0)) { g.x += def.r * 2 - 4; this.updateGhost(); } else this.build.ghost = null; }
    }
    this.renderDrawer();
  }
}
