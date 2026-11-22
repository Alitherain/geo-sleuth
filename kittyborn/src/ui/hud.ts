import { BUILDINGS, HERO_UPG, ITEMS, SPAWNS, waveFor, type Cost, type ItemId } from '../content/data';
import { canAfford, chooseSpec, haveItem, heroUpgrade, nextLevel, padMissing, upgradeBuilding } from '../sim/economy';
import { canStartNight, litLanterns, nextNightDirections, startNight } from '../sim/night';
import { heroContext, type Context, type Input } from '../sim/sim';
import { exportCode, importCode } from '../sim/save';
import { built, dist, heroCap, heroMaxHp, invGet, invTotal, isDone, levelStats, padVisible, storageCap, type Building, type GameEvent, type World } from '../sim/world';
import { BUILDINGS as B } from '../content/data';
import { audio, audioInit, setMusic, setSound } from '../platform/audio';
import { clearSave, saveSettings } from '../platform/storage';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const ICON: Record<ItemId | 'coins', string> = { coins: '🪙', log: '🪵', lav: '💜', plank: '🟫', meat: '🍖', fluff: '☁️' };
const DIR_NAME: Record<string, string> = { E: 'зі сходу', S: 'з півдня', W: 'із заходу' };

export class Hud {
  input: Input = { x: 0, y: 0 };
  started = false; paused = false;
  private cardSig = ''; private hintTxt = ''; private toastT = 0; private shown = { coins: -1, bag: '', hp: '', night: '' };
  private joy = { on: false, id: -1, ox: 0, oy: 0 };
  private keys: Record<string, boolean> = {};
  guideTarget: { x: number; y: number } | null = null;

  constructor(private getWorld: () => World, private setWorld: (w: World) => void) {
    this.bindJoystick();
    this.bindButtons();
    addEventListener('keydown', e => { this.keys[e.key.toLowerCase()] = true; if (e.key === 'Escape') this.toggleMenu(); });
    addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = false; });
  }
  get w() { return this.getWorld(); }

  // ---------------------------------------------------------------- input
  private bindJoystick() {
    const area = $('game'), base = $('joyBase'), knob = $('joyKnob'), R = 60;
    area.addEventListener('pointerdown', e => {
      audioInit();
      if (this.joy.on) return;
      this.joy = { on: true, id: e.pointerId, ox: e.clientX, oy: e.clientY };
      base.hidden = false; base.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`; knob.style.transform = 'translate(0px,0px)';
      try { area.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    });
    area.addEventListener('pointermove', e => {
      if (!this.joy.on || e.pointerId !== this.joy.id) return;
      let dx = e.clientX - this.joy.ox, dy = e.clientY - this.joy.oy; const d = Math.hypot(dx, dy);
      if (d > R) { this.joy.ox += dx / d * (d - R); this.joy.oy += dy / d * (d - R); dx = e.clientX - this.joy.ox; dy = e.clientY - this.joy.oy; base.style.transform = `translate(${this.joy.ox}px, ${this.joy.oy}px)`; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.input.x = dx / R; this.input.y = dy / R;
    });
    const end = (e: PointerEvent) => { if (e.pointerId !== this.joy.id) return; this.joy.on = false; this.input.x = this.input.y = 0; base.hidden = true; };
    area.addEventListener('pointerup', end); area.addEventListener('pointercancel', end);
  }
  private readKeys() {
    if (this.joy.on) return;
    let x = 0, y = 0; const k = this.keys;
    if (k.a || k.arrowleft) x--; if (k.d || k.arrowright) x++; if (k.w || k.arrowup) y--; if (k.s || k.arrowdown) y++;
    this.input.x = x; this.input.y = y;
  }

  private bindButtons() {
    const fs = $('bFull');
    if (!(document.fullscreenEnabled || (document as any).webkitFullscreenEnabled)) fs.hidden = true;
    fs.onclick = () => { try { const d: any = document; if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d); else { const el: any = document.documentElement; (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el)?.catch?.(() => {}); } } catch { /* ignore */ } };
    const snd = $('bSnd'); const sndIcon = () => { snd.textContent = audio.sound ? '🔊' : '🔇'; }; sndIcon();
    snd.onclick = () => { audioInit(); setSound(!audio.sound); saveSettings(audio); sndIcon(); };
    $('bMenu').onclick = () => this.toggleMenu();
    $('mResume').onclick = () => this.toggleMenu(false);
    $('mMusic').onclick = () => { setMusic(!audio.music); saveSettings(audio); this.menuRefresh(); };
    $('mExport').onclick = () => {
      const code = exportCode(this.w), ta = $<HTMLTextAreaElement>('mCode');
      ta.value = code; ta.select();
      navigator.clipboard?.writeText(code).then(() => this.status('Код скопійовано. Збережи його в нотатках.'), () => this.status('Код виділено: скопіюй його вручну.'));
    };
    $('mImport').onclick = () => {
      try { const w = importCode($<HTMLTextAreaElement>('mCode').value); this.setWorld(w); this.status('Збереження завантажено!'); this.toggleMenu(false); }
      catch (e) { this.status('Не вдалося: ' + (e as Error).message); }
    };
    let arm = false;
    $('mReset').onclick = () => {
      if (!arm) { arm = true; $('mReset').textContent = 'Точно? Натисни ще раз'; $('mReset').classList.add('danger'); return; }
      clearSave(); location.reload();
    };
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
    $('stats').innerHTML = `Зароблено: <b>${w.stats.earned}</b> · Дерев: <b>${w.stats.felled}</b> · Звірят розпушено: <b>${w.stats.hunted}</b><br>Пухнастих Ночей виграно: <b>${w.night.n}</b> · Перемог над босом: <b>${w.stats.bosses}</b>`;
    $('mMusic').textContent = 'Музика: ' + (audio.music ? 'так' : 'ні');
  }

  // ---------------------------------------------------------------- events from the simulation
  event(e: GameEvent) {
    switch (e.t) {
      case 'toast': this.toast(e.title, e.body); break;
      case 'dead': this.band('dead', true); setTimeout(() => this.band('dead', false), 3000); break;
      case 'bossIn': $('bossbar').hidden = false; break;
      case 'bossDown': $('bossbar').hidden = true; this.band('win', true); setTimeout(() => this.band('win', false), 4000); break;
      case 'nightWin': $('bossbar').hidden = true; this.toast('Світанок!', `Ніч відбито. Нагорода вже в кишені. Котики виходять на роботу.`); break;
      case 'nightLose': $('bossbar').hidden = true; break;
    }
  }
  private band(id: string, on: boolean) { $(id).classList.toggle('on', on); }
  toast(t: string, s: string) {
    const el = $('toast'); el.querySelector('b')!.textContent = t; el.querySelector('span')!.textContent = s;
    el.classList.add('on'); this.toastT = 3.6;
  }

  // ---------------------------------------------------------------- per frame
  frame(dt: number) {
    if (!this.started) return;
    this.readKeys();
    const w = this.w;
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) $('toast').classList.remove('on'); }
    // top HUD
    if (this.shown.coins !== w.coins) { this.shown.coins = w.coins; $('coinN').textContent = w.coins.toLocaleString('uk-UA'); const c = $('coins'); c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); }
    const bag = `${w.hero.stack.length}/${heroCap(w)}`; if (bag !== this.shown.bag) { this.shown.bag = bag; $('bagN').textContent = bag; }
    const hp = w.night.phase === 'night' || w.hero.hp < heroMaxHp(w) ? '❤️'.repeat(Math.max(0, w.hero.hp)) + '🤍'.repeat(Math.max(0, heroMaxHp(w) - Math.max(0, w.hero.hp))) : '';
    if (hp !== this.shown.hp) { this.shown.hp = hp; $('hearts').hidden = !hp; $('hearts').textContent = hp; }
    const boss = w.enemies.find(e => e.boss); if (boss) $<HTMLDivElement>('bossF').style.width = Math.max(0, boss.hp / boss.maxHp * 100) + '%';
    document.body.classList.toggle('night', w.night.phase === 'night');
    // guide + hint
    const g = this.guide(); this.guideTarget = g.t;
    if (g.h !== this.hintTxt) { this.hintTxt = g.h; const el = $('hint'); if (g.h) { el.textContent = g.h; el.classList.remove('off'); } else el.classList.add('off'); }
    // card
    this.card(heroContext(w));
  }

  // ---------------------------------------------------------------- guide
  private guide(): { t: { x: number; y: number } | null; h: string } {
    const w = this.w, h = w.hero;
    if (h.dead > 0) return { t: null, h: '' };
    if (w.night.phase === 'night') {
      const left = w.enemies.filter(e => !e.passive).length + w.night.queue.length;
      return { t: null, h: `🌙 ${w.night.title}: лишилось звірів ${left}. Ліхтарів горить ${litLanterns(w).length}.` };
    }
    const nBuilt = Object.keys(w.buildings).length - 2;
    const pads = Object.values(w.pads).filter(p => padVisible(w, p));
    const ready = pads.filter(p => { const m = padMissing(p); return w.coins >= m.coins && m.items.every(([k, n]) => haveItem(w, k) >= n); })
      .sort((a, b) => dist(h.x, h.y, a.def.x, a.def.y) - dist(h.x, h.y, b.def.x, b.def.y));
    if (ready.length) return { t: { x: ready[0].def.x, y: ready[0].def.y }, h: nBuilt < 6 ? `Будуй «${ready[0].def.name}»: стань на майданчик` : '' };
    const shop = w.buildings.shop, sellPos = { x: shop.x, y: shop.y + 82 };
    if (h.stack.length >= heroCap(w)) return { t: sellPos, h: nBuilt < 5 ? 'Рюкзак повний! Неси в Лавку Пані Сови' : '' };
    const saw = w.buildings.sawmill;
    const needsPlanks = pads.some(p => padMissing(p).items.some(([k]) => k === 'plank'));
    if (saw && needsPlanks && !h.stack.includes('plank') && invGet(saw.store, 'plank') >= 4 && !built(w, 'catHauler'))
      return { t: { x: saw.x + 58, y: saw.y + 68 }, h: 'Забери дошки з лісопилки: вони потрібні для будівництва' };
    if (saw && h.stack.filter(i => i === 'log').length >= 5 && invGet(saw.input, 'log') < 4 && !built(w, 'catHauler'))
      return { t: { x: saw.x - 58, y: saw.y + 68 }, h: 'Кинь колоди в лісопилку' };
    if (nBuilt === 0) {
      if (h.stack.length < 6) { let best = null as null | { x: number; y: number }, bd = 1e9; for (const t of w.trees) if (t.alive && t.zone === 'edge') { const d = dist(h.x, h.y, t.x, t.y); if (d < bd) { bd = d; best = t; } } return { t: best, h: 'Підійди до дерева. Кошеня рубає саме.' }; }
      return { t: sellPos, h: 'Неси дрова в Лавку. Ху-ху!' };
    }
    if (w.buildings.bell && w.night.n === 0 && built(w, 'palE')) return { t: { x: w.buildings.bell.x, y: w.buildings.bell.y + 56 }, h: 'Готовий? Подзвони у Дзвін Ночі' };
    return { t: null, h: '' };
  }

  // ---------------------------------------------------------------- cards
  private card(ctx: Context) {
    const w = this.w, el = $('card');
    let b: Building | null = null, kind = '';
    if (ctx?.kind === 'pad') kind = 'pad';
    else if (ctx?.kind === 'slot') { if (ctx.slot === 'forge') kind = 'forge'; else if (ctx.slot === 'bell') kind = 'bell'; else if (ctx.slot !== 'sell') { kind = 'building'; b = ctx.b; } }
    else if (ctx?.kind === 'building' && !w.hero.moving) { kind = 'building'; b = ctx.b; }
    if (!kind) { if (this.cardSig) { this.cardSig = ''; el.classList.remove('on'); } return; }
    const sig = kind + '|' + (ctx?.kind === 'pad' ? ctx.pad.def.id + JSON.stringify(padMissing(ctx.pad)) : b ? b.id + b.level + b.spec + b.status + b.hp + JSON.stringify(b.store) + JSON.stringify(b.input) : '') + '|' + w.coins + '|' + JSON.stringify(w.up) + w.night.phase + w.hero.stack.length + this.catSig(b);
    if (sig === this.cardSig) return;
    this.cardSig = sig;
    el.classList.add('on');
    el.innerHTML = '';
    if (kind === 'pad' && ctx?.kind === 'pad') this.padCard(el, ctx.pad);
    else if (kind === 'forge') this.forgeCard(el);
    else if (kind === 'bell') this.bellCard(el);
    else if (b) this.buildingCard(el, b);
  }
  private catSig(b: Building | null) {
    if (!b) return '';
    if (b.type === 'storage' || b.type === 'catHouse') return this.w.cats.map(c => c.idle + (c.task?.to || '')).join(',');
    return '';
  }
  private h(tag: string, cls = '', text = ''): HTMLElement { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }
  private costLine(c: Cost) { return (Object.entries(c) as [keyof Cost, number][]).filter(([, n]) => n).map(([k, n]) => `${ICON[k as ItemId | 'coins']} ${n}`).join('  '); }
  private btn(label: string, cost: Cost | null, onClick: () => boolean, disabled = false) {
    const b = this.h('button', 'ubtn') as HTMLButtonElement;
    b.innerHTML = `<span>${label}</span>${cost ? `<small>${this.costLine(cost)}</small>` : ''}`;
    b.disabled = disabled || (cost ? !canAfford(this.w, cost) : false);
    b.onclick = () => { if (onClick()) { this.cardSig = ''; } };
    return b;
  }
  private padCard(el: HTMLElement, p: World['pads'][string]) {
    const w = this.w, m = padMissing(p);
    el.append(this.h('h2', '', `${p.def.icon} ${p.def.name}`), this.h('p', 'sub', 'Будівництво'));
    const rows = this.h('div', 'rows');
    if (p.def.cost.coins) rows.append(this.row(ICON.coins + ' Монети', `${(p.def.cost.coins) - m.coins} / ${p.def.cost.coins}`, m.coins === 0));
    for (const [k, n] of Object.entries(p.def.cost).filter(([k]) => k !== 'coins') as [ItemId, number][]) {
      const have = invGet(p.items, k), inc = invGet(p.incoming, k);
      rows.append(this.row(`${ICON[k]} ${ITEMS[k].name}`, `${have} / ${n}${inc ? ` (+${inc} везуть)` : ''}`, have >= n));
    }
    el.append(rows);
    const tip = Object.keys(p.def.cost).some(k => k !== 'coins')
      ? (built(w, 'catHauler') ? 'Матеріали привезе котик-носій зі складу. Монети підуть самі, поки стоїш тут.' : 'Принеси матеріали в рюкзаку і стань сюди. Монети підуть самі.')
      : 'Стій тут: монети підуть самі.';
    el.append(this.h('p', 'tip', tip));
  }
  private row(a: string, b: string, ok: boolean) { const r = this.h('div', 'row' + (ok ? ' ok' : '')); r.append(this.h('span', '', a), this.h('b', '', b)); return r; }
  private buildingCard(el: HTMLElement, b: Building) {
    const w = this.w, def = BUILDINGS[b.type], st = levelStats(b);
    const stars = def.levels ? ' ' + '★'.repeat(b.level) + '☆'.repeat(def.levels.length - b.level) : '';
    el.append(this.h('h2', '', def.name + stars));
    const rows = this.h('div', 'rows');
    if (b.type === 'sawmill') {
      rows.append(this.row('Стан', b.status || '—', b.status === 'Пиляю'));
      rows.append(this.row('🪵 Вхід', `${invGet(b.input, 'log')} / ${st.inCap}`, true));
      rows.append(this.row('🟫 Вихід', `${invGet(b.store, 'plank')} / ${st.outCap}`, invGet(b.store, 'plank') < st.outCap));
      rows.append(this.row('Швидкість', `${(1 / st.time * st.yield).toFixed(1)} дошки/с`, true));
    } else if (b.type === 'storage') {
      rows.append(this.row('Заповнено', `${invTotal(b.store)} / ${storageCap(b)}`, invTotal(b.store) < storageCap(b)));
      for (const k of Object.keys(ITEMS) as ItemId[]) if (invGet(b.store, k)) rows.append(this.row(`${ICON[k]} ${ITEMS[k].name}`, String(invGet(b.store, k)), true));
      el.append(rows);
      el.append(this.h('p', 'sub', 'Котики зараз'));
      const list = this.h('div', 'rows');
      for (const c of w.cats) list.append(this.row(c.role === 'lumber' ? '🐱 Лісоруб' : c.role === 'hauler' ? '🐈 Носій' : '🐈‍⬛ Сторож', this.catDoing(c), !c.idle));
      el.append(list);
      el.append(this.h('p', 'tip', 'Надлишок понад запас (30 дощок, 20 лаванди) котики самі продають у Лавку.'));
    } else if (b.type === 'catHouse') {
      rows.append(this.row('Котиків', String(st.cats || 1), true));
      for (const c of w.cats.filter(c => c.home === b.id)) rows.append(this.row('Зараз', this.catDoing(c), !c.idle));
    } else if (b.type === 'tower') { rows.append(this.row('Шишка', `${st.dmg} шкоди раз на ${st.rate} с`, true)); rows.append(this.row('Міцність', `${Math.ceil(b.hp)} / ${b.maxHp}`, b.hp >= b.maxHp)); }
    else { rows.append(this.row('Міцність', `${Math.ceil(b.hp)} / ${b.maxHp}`, b.hp >= b.maxHp)); }
    if (b.type !== 'storage') el.append(rows);
    const nl = nextLevel(b);
    if (nl) { el.append(this.h('p', 'sub', 'Наступний рівень: ' + nl.label)); el.append(this.btn('Покращити', nl.cost, () => upgradeBuilding(w, b))); }
    else if (def.specs && !b.spec) {
      el.append(this.h('p', 'sub', 'Обери спеціалізацію (назавжди)'));
      for (const s of def.specs) el.append(this.btn(`${s.name}: ${s.desc}`, s.cost, () => chooseSpec(w, b, s.id)));
    } else if (def.levels) el.append(this.h('p', 'tip', 'Максимальний рівень.'));
  }
  private catDoing(c: World['cats'][number]) {
    if (c.hidden) return 'спить удома';
    if (c.idle) return c.idle;
    const t = c.task; if (!t) return 'думає';
    if (t.kind === 'harvest') return 'рубає дерево';
    if (t.kind === 'haul') return `${ICON[t.item!]} ${t.n} → ${t.to === 'shop' ? 'Лавка' : t.to === 'storage' ? 'Склад' : t.to?.startsWith('pad:') ? 'будова' : 'лісопилка'}`;
    return '…';
  }
  private forgeCard(el: HTMLElement) {
    const w = this.w;
    el.append(this.h('h2', '', '🔨 Кузня Діда Ковадла'), this.h('p', 'sub', 'Дзень — так. Дзень-дзень — ні.'));
    for (const u of HERO_UPG) {
      if (u.req && !w.flags[u.req]) continue;
      const lv = w.up[u.id], max = u.costs.length;
      const row = this.h('div', 'urow');
      row.append(this.h('div', 'ic', u.icon));
      const mid = this.h('div'); mid.append(this.h('div', 'nm', u.name), this.h('div', 'ds', lv >= max ? 'Максимум!' : u.desc(lv)));
      const lvl = this.h('div', 'lv'); for (let i = 0; i < max; i++) lvl.append(this.h('i', i < lv ? 'on' : '')); mid.append(lvl);
      row.append(mid);
      row.append(lv >= max ? this.btn('✓', null, () => false, true) : this.btn('', u.costs[lv], () => heroUpgrade(w, u.id)));
      el.append(row);
    }
  }
  private bellCard(el: HTMLElement) {
    const w = this.w;
    el.append(this.h('h2', '', '🔔 Дзвін Ночі'));
    if (w.night.phase === 'night') { el.append(this.h('p', 'tip', 'Ніч уже йде. Захищай ліхтарі!')); return; }
    const wave = waveFor(w.night.n + 1, isDone(w, 'hedge'));
    const rows = this.h('div', 'rows');
    rows.append(this.row('Наступна', wave.title, true));
    rows.append(this.row('Звідки', nextNightDirections(w).map(d => DIR_NAME[d]).join(', '), true));
    rows.append(this.row('Звірів', String(wave.entries.length), true));
    rows.append(this.row('Нагорода', `🪙 ${wave.reward} + пух і м'ясо`, true));
    el.append(rows);
    const pals = Object.values(w.buildings).filter(b => b.type === 'palisade' && b.hp > 0).length;
    el.append(this.h('p', 'tip', pals ? 'Червоні стрілки на мапі показують, звідки підуть звірі. Котики сховаються, сторожі стануть на ворота.' : 'Порада: спершу постав частокіл на воротах, звідки підуть звірі.'));
    el.append(this.btn('Подзвонити: почати ніч', null, () => { const ok = startNight(w); if (ok) $('card').classList.remove('on'); return ok; }, !canStartNight(w)));
  }
}
export { SPAWNS, B, dist };
