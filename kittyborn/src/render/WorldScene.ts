import Phaser from 'phaser';
import { BUILDINGS, EDGE, GAPS, GROVE, HEART, HEDGE_X, ITEMS, PLAZA, ROAD_Y, SPAWNS, W, H, WILDS, type GapId, type ItemId } from '../content/data';
import { WALLS } from '../sim/physics';
import { step, type Input } from '../sim/sim';
import { padMissing } from '../sim/economy';
import { nextNightDirections } from '../sim/night';
import { dist, invGet, invTotal, isDone, levelStats, padVisible, storageCap, type Building, type Cat, type Enemy, type GameEvent, type World } from '../sim/world';
import { ART, INK, TEX, buildArt, img } from './art';
import { sfx } from '../platform/audio';

const TAU = Math.PI * 2;
type Img = Phaser.GameObjects.Image;
type Txt = Phaser.GameObjects.Text;
type Ctn = Phaser.GameObjects.Container;
const FONT = 'Nunito, system-ui, sans-serif';

export interface SceneHooks {
  world: () => World;
  input: Input;
  running: () => boolean;
  onEvent: (e: GameEvent) => void;
  onFrame: (dt: number) => void;
  guide: () => { x: number; y: number } | null;
}

interface CharView { root: Ctn; body: Img; legL: Img; legR: Img; tail: Img; weapon?: Img; stack: Ctn; stackImgs: Img[]; key: string; sway: number; swayV: number; bubble?: Txt }
interface Particle { img: Img; x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; grav: number; spin: number; drag: boolean }
interface Flyer { img: Img; fx: number; fy: number; fz: number; to: () => { x: number; y: number; z: number }; t: number; dur: number; h: number; owner?: string }

export class WorldScene extends Phaser.Scene {
  hooks!: SceneHooks;
  w!: World;
  acc = 0; shakeAmt = 0; elapsed = 0;
  hero!: CharView;
  cats = new Map<number, CharView>();
  trees = new Map<number, { img: Img; key: string }>();
  buildings = new Map<string, { parts: Phaser.GameObjects.GameObject[]; main: Img; blade?: Img; label?: Txt; hp?: Phaser.GameObjects.Graphics; pileIn: Img[]; pileOut: Img[]; key: string; level: number }>();
  pads = new Map<string, { g: Phaser.GameObjects.Graphics; icon: Txt; label: Txt; cost: Txt; sig: string }>();
  enemies = new Map<number, { img: Img; shadow: Img; hp: Phaser.GameObjects.Graphics; key: string }>();
  groundItems = new Map<number, Img>();
  shots = new Map<number, Img>();
  flyers: Flyer[] = [];
  parts: Particle[] = [];
  pool: Img[] = [];
  texts: { t: Txt; vy: number; life: number }[] = [];
  pending: Record<string, number> = {};
  hedgeG!: Phaser.GameObjects.Graphics; groveG!: Phaser.GameObjects.Graphics;
  hedgeDone = false;
  arrow!: Img; marker!: Img; tele!: Img; teleIn!: Img;
  dirArrows: Img[] = [];
  light!: Phaser.Textures.CanvasTexture; lightImg!: Img; glows: Img[] = [];
  falls: { img: Img; t: number; dir: number }[] = [];

  constructor() { super('world'); }
  init(h: SceneHooks) { this.hooks = h; }

  create() {
    this.w = this.hooks.world();
    buildArt(this);
    this.drawGround();
    this.makeDecor();
    this.hero = this.makeChar('hero', true);
    this.arrow = img(this, 'fx_arrow').setDepth(4).setVisible(false);
    this.marker = img(this, 'fx_marker').setDepth(9000).setVisible(false);
    this.tele = img(this, 'fx_tele').setDepth(3).setVisible(false);
    this.teleIn = img(this, 'fx_tele').setDepth(3).setVisible(false).setAlpha(0.6);
    for (let i = 0; i < 3; i++) this.dirArrows.push(img(this, 'fx_arrow').setDepth(4).setVisible(false).setTint(0xff5470));
    const cw = Math.max(64, Math.ceil(this.scale.width / 4)), ch = Math.max(64, Math.ceil(this.scale.height / 4));
    this.light = this.textures.createCanvas('light', cw, ch)!;
    this.lightImg = this.add.image(0, 0, 'light').setDepth(7000).setOrigin(0.5);
    const cam = this.cameras.main;
    cam.setBounds(0, 0, W, H);
    cam.setBackgroundColor('#2f4a4a');
    this.fitCamera();
    cam.centerOn(this.w.hero.x, this.w.hero.y);
    this.scale.on('resize', () => this.fitCamera());
  }

  /** Replace the world (after import or reset) without rebuilding textures. */
  setWorld(w: World) {
    this.w = w;
    for (const v of this.cats.values()) { v.root.destroy(); v.bubble?.destroy(); } this.cats.clear();
    for (const v of this.enemies.values()) { v.img.destroy(); v.shadow.destroy(); v.hp.destroy(); } this.enemies.clear();
    for (const v of this.trees.values()) v.img.destroy(); this.trees.clear();
    for (const v of this.buildings.values()) { v.parts.forEach(p => p.destroy()); v.pileIn.forEach(p => p.destroy()); v.pileOut.forEach(p => p.destroy()); } this.buildings.clear();
    for (const v of this.pads.values()) { v.g.destroy(); v.icon.destroy(); v.label.destroy(); v.cost.destroy(); } this.pads.clear();
    for (const v of this.groundItems.values()) v.destroy(); this.groundItems.clear();
    for (const v of this.shots.values()) v.destroy(); this.shots.clear();
    this.pending = {};
    this.hedgeDone = false; this.hedgeG.setVisible(true).setAlpha(1); this.drawGrove();
    this.cameras.main.centerOn(w.hero.x, w.hero.y);
  }

  fitCamera() {
    const cam = this.cameras.main;
    cam.setZoom(Math.min(this.scale.height / 660, this.scale.width / 520));
    const cw = Math.max(64, Math.ceil(this.scale.width / 4)), ch = Math.max(64, Math.ceil(this.scale.height / 4));
    if (this.light && (this.light.width !== cw || this.light.height !== ch)) this.light.setSize(cw, ch);
  }

  // ---------------------------------------------------------------- static world
  drawGround() {
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(0x7fae74).fillRect(0, 0, W, H);
    g.fillStyle(0x6a9c68).fillRoundedRect(EDGE.x - 30, EDGE.y - 30, EDGE.w + 40, EDGE.h + 60, 60);
    this.groveG = this.add.graphics().setDepth(0);
    this.drawGrove();
    g.fillStyle(0x7a6c9a).fillRoundedRect(WILDS.x - 20, 60, W - WILDS.x + 40, H - 80, 80);
    g.fillStyle(0xe1cfa9);
    g.fillRoundedRect(HEDGE_X - 20, ROAD_Y - 38, PLAZA.x - HEDGE_X + 40, 76, 38);
    g.fillRoundedRect(PLAZA.x + PLAZA.w - 20, ROAD_Y - 38, WILDS.x - PLAZA.x - PLAZA.w + 140, 76, 38);
    g.fillRoundedRect(GAPS.S.x - 38, PLAZA.y + PLAZA.h - 20, 76, H - PLAZA.y - PLAZA.h, 38);
    g.fillStyle(0xd8c6ab).fillRect(PLAZA.x, PLAZA.y, PLAZA.w, PLAZA.h);
    g.fillStyle(0xcdb99c);
    for (let y = PLAZA.y + 4; y < PLAZA.y + PLAZA.h - 20; y += 26) for (let x = PLAZA.x + 4 + ((y / 26) % 2) * 18; x < PLAZA.x + PLAZA.w - 30; x += 36) g.fillRoundedRect(x, y, 31, 21, 7);
    g.fillStyle(0xffdc8c, 0.25).fillCircle(HEART.x, HEART.y, 60);
    // walls
    for (const r of WALLS) { g.fillStyle(0x8e8aa6).fillRect(r.x, r.y - 10, r.w, r.h + 10); g.fillStyle(0xa9a4c2).fillRect(r.x, r.y - 10, r.w, 6); g.lineStyle(2, 0x2a2140).strokeRect(r.x, r.y - 10, r.w, r.h + 10); }
    for (const id of ['W', 'E', 'S'] as GapId[]) {
      const G = GAPS[id];
      for (const s of [-1, 1]) { const x = G.vertical ? G.x : G.x + s * 46, y = G.vertical ? G.y + s * 46 : G.y; g.fillStyle(0x6f6b88).fillCircle(x, y - 6, 10); g.lineStyle(2, 0x2a2140).strokeCircle(x, y - 6, 10); g.fillStyle(0xffcf4a).fillCircle(x, y - 18, 5); }
    }
    this.hedgeG = this.add.graphics().setDepth(5);
    for (let y = 110; y < H - 50; y += 22) { const k = Math.sin(y * 0.3) * 3; this.hedgeG.fillStyle(y % 44 ? 0x3e6e4e : 0x477a57).fillCircle(HEDGE_X + k, y, 17); this.hedgeG.lineStyle(2, 0x2a2140).strokeCircle(HEDGE_X + k, y, 17); }
  }
  drawGrove() {
    const cleared = isDone(this.w, 'hedge');
    this.groveG.clear().fillStyle(cleared ? 0x6c8f72 : 0x557a5e).fillRoundedRect(GROVE.x - 40, GROVE.y - 40, GROVE.w + 60, GROVE.h + 70, 50);
  }
  makeDecor() {
    let s = 4242; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    for (let i = 0; i < 700; i++) {
      const x = r() * W, y = 100 + r() * (H - 140);
      if (x > PLAZA.x - 10 && x < PLAZA.x + PLAZA.w + 10 && y > PLAZA.y - 10 && y < PLAZA.y + PLAZA.h + 10) continue;
      if (Math.abs(y - ROAD_Y) < 40 && x > HEDGE_X && x < WILDS.x + 100) continue;
      const wild = x > WILDS.x, k = r();
      let key = wild ? 'dc_tuft2' : 'dc_tuft';
      if (wild) { if (k < 0.07) key = 'dc_grave'; else if (k < 0.12) key = 'dc_shroom'; }
      else if (k < 0.1) key = 'dc_flower' + Math.floor(r() * 4); else if (k < 0.14) key = 'dc_shroom'; else if (k < 0.17) key = 'dc_rock'; else if (k < 0.19) key = 'dc_bush';
      const d = img(this, key, x, y);
      d.setDepth(key === 'dc_grave' || key === 'dc_bush' ? 10 + y : 1);
    }
    for (let x = -20; x < W + 40; x += 46) { img(this, 'tr_bg', x + r() * 20, 70 + r() * 40).setDepth(10).setScale((1 + r() * 0.5) / TEX); img(this, 'tr_bg', x + r() * 20, H - 20 + r() * 20).setDepth(10 + H).setScale((1 + r() * 0.5) / TEX); }
    for (let y = 100; y < H - 30; y += 46) { img(this, 'tr_bg', 20 + r() * 30, y).setDepth(10 + y).setScale((1 + r() * 0.5) / TEX); img(this, 'tr_bg', W - 20 - r() * 30, y).setDepth(10 + y).setScale((1 + r() * 0.5) / TEX); }
  }

  // ---------------------------------------------------------------- characters
  makeChar(key: string, isHero: boolean): CharView {
    const root = this.add.container(0, 0);
    const shadow = img(this, 'fx_shadow', 0, 0); if (!isHero) shadow.setScale(0.75 / TEX);
    const tail = img(this, key + '_tail', isHero ? -9 : -7, isHero ? -10 : -8);
    const legL = img(this, key + '_leg', -5, 0), legR = img(this, key + '_leg', 5, 0);
    const stack = this.add.container(0, 0);
    const body = img(this, key, 0, 0);
    root.add([shadow, tail, legL, legR, stack, body]);
    let weapon: Img | undefined;
    if (key !== 'cat_hauler') { weapon = img(this, 'w_axe', isHero ? 11 : 8, isHero ? -18 : -13); if (!isHero) weapon.setScale(0.7 / TEX); root.add(weapon); }
    return { root, body, legL, legR, tail, weapon, stack, stackImgs: [], key, sway: 0, swayV: 0 };
  }
  syncChar(v: CharView, e: { x: number; y: number; face: number; moving: boolean; walkT: number; swing: number; stack: ItemId[] }, owner: string, dt: number, vx = 0) {
    const t = this.elapsed, isHero = owner === 'hero', s = isHero ? 1 : 0.75;
    v.root.setPosition(e.x, e.y).setDepth(10 + e.y);
    v.root.scaleX = e.face;
    const bob = e.moving ? Math.abs(Math.sin(e.walkT * 11)) * 3 * s : Math.sin(t * 2.5 + e.x) * 0.8;
    v.body.y = -bob; v.body.scaleY = (1 + (e.moving ? 0 : Math.sin(t * 2.5 + e.x) * 0.015)) / TEX;
    const blink = ((t + e.x * 0.01) % 4.1) < 0.12;
    const key = blink ? v.key + '_b' : v.key;
    if (v.body.texture.key !== key) v.body.setTexture(key);
    const lp = e.moving ? Math.sin(e.walkT * 11) * 4 * s : 0;
    v.legL.y = -Math.max(0, lp); v.legR.y = -Math.max(0, -lp);
    v.tail.rotation = Math.sin(t * 4 + e.x) * 0.25;
    if (v.weapon) {
      v.weapon.rotation = e.swing > 0 ? -2.1 + 2.9 * (1 - e.swing) : 0.55;
      v.weapon.y = (isHero ? -18 : -13) - bob;
    }
    // stack on the back with a lagging spring sway
    const target = -vx * 0.05 * e.face;
    v.swayV += ((target - v.sway) * 60 - v.swayV * 8) * dt; v.sway += v.swayV * dt;
    const hidden = this.pending[owner] || 0, n = Math.max(0, e.stack.length - hidden);
    while (v.stackImgs.length < n) { const i = img(this, 'it_log'); v.stack.add(i); v.stackImgs.push(i); }
    let y = (isHero ? -24 : -17) - bob;
    for (let i = 0; i < v.stackImgs.length; i++) {
      const im = v.stackImgs[i];
      if (i >= n) { im.setVisible(false); continue; }
      const it = e.stack[i], h = ITEMS[it].h, k = i / 12;
      if (im.texture.key !== 'it_' + it) im.setTexture('it_' + it);
      im.setVisible(true).setPosition((isHero ? -9 : -7) + v.sway * k * k * 10, y - h / 2);
      y -= h;
    }
  }

  // ---------------------------------------------------------------- per-frame
  update(_t: number, deltaMs: number) {
    const dt = Math.min(0.05, deltaMs / 1000);
    this.elapsed += dt;
    const w = this.w;
    if (this.hooks.running()) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= 1 / 60 && n < 5) { step(w, this.hooks.input, 1 / 60); this.acc -= 1 / 60; n++; }
      for (const e of w.events) this.handleEvent(e);
      w.events.length = 0;
    }
    this.syncWorld(dt);
    this.updateFx(dt);
    this.updateCamera(dt);
    this.updateLight();
    this.hooks.onFrame(dt);
  }

  syncWorld(dt: number) {
    const w = this.w, t = this.elapsed;
    if (!this.hedgeDone && isDone(w, 'hedge')) { this.hedgeDone = true; this.drawGrove(); this.tweens.add({ targets: this.hedgeG, alpha: 0, duration: 800, onComplete: () => this.hedgeG.setVisible(false) }); }
    // trees
    for (const tr of w.trees) {
      let v = this.trees.get(tr.id);
      const key = tr.alive ? 'tr_' + tr.kind : 'tr_stump';
      if (!v) { v = { img: img(this, key, tr.x, tr.y), key }; this.trees.set(tr.id, v); }
      if (v.key !== key) { v.img.setTexture(key); const m = ART[key]; v.img.setOrigin(m.ox / m.w, m.oy / m.h); v.key = key; }
      const g = tr.alive && tr.grow < 1 ? Phaser.Math.Easing.Back.Out(tr.grow) : 1;
      v.img.setScale(tr.s * g / TEX).setPosition(tr.x + Math.sin(t * 45) * tr.shake * 3, tr.y).setDepth(10 + tr.y);
      v.img.setAlpha(tr.zone === 'grove' && !isDone(w, 'hedge') ? 0.75 : 1);
    }
    // buildings
    for (const b of Object.values(w.buildings)) this.syncBuilding(b);
    for (const [id, v] of this.buildings) if (!w.buildings[id]) { v.parts.forEach(p => p.destroy()); this.buildings.delete(id); }
    // pads
    for (const p of Object.values(w.pads)) {
      const vis = padVisible(w, p);
      let v = this.pads.get(p.def.id);
      if (!vis) { if (v) { v.g.setVisible(false); v.icon.setVisible(false); v.label.setVisible(false); v.cost.setVisible(false); } continue; }
      if (!v) {
        v = { g: this.add.graphics().setDepth(2), icon: this.add.text(p.def.x, p.def.y - 12, p.def.icon, { fontSize: '26px' }).setOrigin(0.5).setDepth(2),
          label: this.mkText(p.def.x, p.def.y - 52, p.def.name, 13, '#fff4e0', true).setDepth(3), cost: this.mkText(p.def.x, p.def.y + 20, '', 14, '#fff4e0').setDepth(3), sig: '' };
        this.pads.set(p.def.id, v);
      }
      [v.g, v.icon, v.label, v.cost].forEach(o => o.setVisible(true));
      const miss = padMissing(p), c = p.def.cost;
      const total = (c.coins || 0) + Object.entries(c).filter(([k]) => k !== 'coins').reduce((a, [, n]) => a + (n || 0), 0);
      const left = miss.coins + miss.items.reduce((a, [, n]) => a + n, 0);
      const k = total ? 1 - left / total : 1, s = 76, pulse = 1 + Math.sin(t * 4) * 0.03;
      v.g.clear().setPosition(p.def.x, p.def.y).setScale(pulse);
      v.g.fillStyle(0xfff8e6, 0.28).fillRoundedRect(-s / 2, -s / 2, s, s, 16);
      if (k > 0) v.g.fillStyle(0xffcf4a, 0.65).fillRoundedRect(-s / 2, s / 2 - s * k, s, s * k, Math.min(16, (s * k) / 2));
      v.g.lineStyle(3, 0xfff8e6, 0.9).strokeRoundedRect(-s / 2, -s / 2, s, s, 16);
      const sig = [miss.coins ? `${miss.coins}🪙` : '', ...miss.items.map(([it, n]) => `${n} ${it === 'plank' ? '🪵' : it === 'lav' ? '💜' : it === 'fluff' ? '☁️' : '📦'}`)].filter(Boolean).join(' ');
      if (sig !== v.sig) { v.sig = sig; v.cost.setText(sig); }
      v.cost.setColor(w.coins >= miss.coins ? '#ffcf4a' : '#fff4e0');
    }
    for (const [id, v] of this.pads) if (!w.pads[id]) { v.g.destroy(); v.icon.destroy(); v.label.destroy(); v.cost.destroy(); this.pads.delete(id); }
    // hero
    const h = w.hero;
    this.syncChar(this.hero, h, 'hero', dt, h.vx);
    this.hero.root.setVisible(!(h.dead > 0 && h.dead < 2.6));
    this.hero.root.setAlpha(h.inv > 0 && Math.floor(t * 20) % 2 ? 0.45 : 1);
    if (this.hero.weapon) { const key = h.form === 'saw' ? 'w_saw' : 'w_axe'; if (this.hero.weapon.texture.key !== key) { this.hero.weapon.setTexture(key); const m = ART[key]; this.hero.weapon.setOrigin(m.ox / m.w, m.oy / m.h); } }
    // cats
    for (const c of w.cats) {
      let v = this.cats.get(c.id);
      if (!v) { v = this.makeChar('cat_' + c.role, false); v.bubble = this.mkText(0, 0, '', 12, '#2a2140').setBackgroundColor('#fff8ea').setPadding(5, 2, 5, 2).setDepth(8000); this.cats.set(c.id, v); }
      v.root.setVisible(!c.hidden);
      this.syncChar(v, c, 'c' + c.id, dt, c.moving ? c.face * 60 : 0);
      const idle = !c.hidden && c.idle && !c.moving;
      v.bubble!.setVisible(!!idle).setPosition(c.x, c.y - 72);
      if (idle && v.bubble!.text !== '💤 ' + c.idle) v.bubble!.setText('💤 ' + c.idle);
    }
    // enemies
    for (const e of w.enemies) {
      let v = this.enemies.get(e.id);
      const base = 'b_' + e.kind;
      if (!v) { v = { img: img(this, base), shadow: img(this, 'fx_shadow'), hp: this.add.graphics(), key: base }; this.enemies.set(e.id, v); if (e.kind === 'boss') v.shadow.setScale(3 / TEX); else if (e.kind === 'horn') v.shadow.setScale(1.3 / TEX); }
      const key = e.flash > 0 ? base + '_w' : e.kind === 'fluff' && (e.aggro > 0 || !e.passive) ? 'b_fluff_a' : base;
      if (v.key !== key) { v.img.setTexture(key); v.key = key; }
      const hop = e.moving ? Math.abs(Math.sin(e.walkT * 9)) * 5 : Math.sin(t * 3 + e.x) * 1.2;
      v.img.setPosition(e.x, e.y - hop - e.z).setDepth(10 + e.y).setFlipX(e.face < 0);
      v.shadow.setPosition(e.x, e.y).setDepth(9 + e.y).setAlpha(e.z > 0 ? 0.5 : 1);
      v.hp.clear().setDepth(11 + e.y);
      if (e.hp < e.maxHp && e.kind !== 'boss') { v.hp.fillStyle(0x2a1030).fillRoundedRect(e.x - 14, e.y - e.r * 2 - 18, 28, 5, 2); v.hp.fillStyle(0xff6b8a).fillRoundedRect(e.x - 14, e.y - e.r * 2 - 18, 28 * Math.max(0, e.hp / e.maxHp), 5, 2); }
      if (e.boss) {
        const B = e.boss;
        this.tele.setVisible(B.state === 'tele').setPosition(B.tx, B.ty);
        this.teleIn.setVisible(B.state === 'tele').setPosition(B.tx, B.ty).setScale(Math.min(1, B.t / 0.95) / TEX);
      }
    }
    if (!w.enemies.some(e => e.boss)) { this.tele.setVisible(false); this.teleIn.setVisible(false); }
    for (const [id, v] of this.enemies) if (!w.enemies.find(e => e.id === id)) { v.img.destroy(); v.shadow.destroy(); v.hp.destroy(); this.enemies.delete(id); }
    // ground items
    for (const g of w.ground) {
      let v = this.groundItems.get(g.id);
      if (!v) { v = img(this, 'it_' + g.type).setDepth(2); this.groundItems.set(g.id, v); }
      v.setPosition(g.x, g.y - 4 - g.z).setRotation(Math.sin(g.id) * 0.4);
    }
    for (const [id, v] of this.groundItems) if (!w.ground.find(g => g.id === id)) { v.destroy(); this.groundItems.delete(id); }
    // tower shots
    for (const s of w.shots) { let v = this.shots.get(s.id); if (!v) { v = img(this, 'fx_cone').setDepth(5000); this.shots.set(s.id, v); } v.setPosition(s.x, s.y).setRotation(t * 12); }
    for (const [id, v] of this.shots) if (!w.shots.find(s => s.id === id)) { v.destroy(); this.shots.delete(id); }
    // guide arrow + next-night arrows
    const gt = this.hooks.guide();
    if (gt && !h.dead && dist(h.x, h.y, gt.x, gt.y) > 70) {
      const a = Math.atan2(gt.y - h.y, gt.x - h.x), o = 40 + Math.sin(t * 6) * 4;
      this.arrow.setVisible(true).setPosition(h.x + Math.cos(a) * o, h.y + 2 + Math.sin(a) * o).setRotation(a);
    } else this.arrow.setVisible(false);
    this.marker.setVisible(!!gt).setPosition(gt?.x ?? 0, (gt?.y ?? 0) - 64 - Math.abs(Math.sin(t * 4)) * 12);
    const dirs = w.night.phase === 'day' && w.buildings['bell'] ? nextNightDirections(w) : [];
    this.dirArrows.forEach((a, i) => {
      const d = dirs[i]; if (!d) { a.setVisible(false); return; }
      const G = GAPS[SPAWNS[d].gap], o = Math.sin(t * 5) * 6;
      const ang = Math.atan2(G.inn.y - G.out.y, G.inn.x - G.out.x);
      a.setVisible(true).setPosition(G.out.x - Math.cos(ang) * (60 - o), G.out.y - Math.sin(ang) * (60 - o)).setRotation(ang).setAlpha(0.8);
    });
  }

  syncBuilding(b: Building) {
    const w = this.w, t = this.elapsed;
    let v = this.buildings.get(b.id);
    const keyFor = () => {
      switch (b.type) {
        case 'shop': return 'bd_shop'; case 'sawmill': return 'bd_sawmill'; case 'storage': return 'bd_storage'; case 'forge': return 'bd_forge'; case 'bell': return 'bd_bell';
        case 'catHouse': return 'bd_house_' + b.role; case 'tower': return 'bd_tower';
        case 'lantern': return b.hp > 0 ? 'bd_lantern' : 'bd_lantern_off';
        case 'palisade': { const vert = GAPS[b.gap as GapId].vertical; return 'bd_pal_' + (vert ? 'v' : 'h') + (b.hp <= 0 ? 'x' : b.level > 1 ? '2' : ''); }
        default: return 'fx_dot';
      }
    };
    const key = keyFor();
    if (!v) {
      const main = img(this, key, b.x, b.y);
      const parts: Phaser.GameObjects.GameObject[] = [main];
      v = { parts, main, pileIn: [], pileOut: [], key, level: b.level };
      if (b.type === 'sawmill') { v.blade = img(this, 'bd_blade', b.x, b.y - 100); parts.push(v.blade); }
      if (b.type === 'storage' || b.type === 'sawmill' || b.type === 'catHouse' || b.type === 'tower' || b.type === 'palisade' || b.type === 'lantern') { v.label = this.mkText(b.x, b.y + 14, '', 12, '#fff4e0', true); parts.push(v.label); }
      if (b.type === 'palisade' || b.type === 'tower' || b.type === 'lantern') { v.hp = this.add.graphics(); parts.push(v.hp); }
      for (const s of BUILDINGS[b.type].slots || []) parts.push(...this.makeSlot(b.x + s.dx, b.y + s.dy, s.kind));
      this.buildings.set(b.id, v);
      if (w.time - b.builtAt < 1) { main.setScale(0.2 / TEX); this.tweens.add({ targets: main, scale: 1 / TEX, duration: 500, ease: 'Back.Out' }); }
    }
    if (v.key !== key) { v.main.setTexture(key); const m = ART[key]; v.main.setOrigin(m.ox / m.w, m.oy / m.h); v.key = key; }
    if (v.level !== b.level) { v.level = b.level; this.tweens.add({ targets: v.main, scale: { from: 1.2 / TEX, to: 1 / TEX }, duration: 400, ease: 'Back.Out' }); }
    const vert = b.type === 'palisade' && GAPS[b.gap as GapId].vertical;
    v.main.setDepth(10 + b.y + (vert ? 40 : 0));
    if (v.blade) { v.blade.setDepth(11 + b.y); if (b.status === 'Пиляю') v.blade.rotation += 0.2 * (b.spec === 'fast' ? 2 : 1); }
    if (b.type === 'sawmill') {
      this.pile(v.pileIn, b.x - 62, b.y + 34, 'log', invGet(b.input, 'log'), b.y);
      this.pile(v.pileOut, b.x + 62, b.y + 34, 'plank', invGet(b.store, 'plank'), b.y);
    }
    if (v.label) {
      let s = '';
      const lv = BUILDINGS[b.type].levels && b.level > 1 ? '★'.repeat(b.level) : '';
      if (b.type === 'storage') s = `${lv}  ${invTotal(b.store)}/${storageCap(b)}`;
      else if (b.type === 'sawmill') s = `${lv}${b.spec ? ' · ' + BUILDINGS.sawmill.specs!.find(x => x.id === b.spec)!.name : ''}${b.status !== 'Пиляю' ? '\n' + b.status : ''}`;
      else s = lv;
      if (v.label.text !== s) v.label.setText(s);
      v.label.setVisible(s !== '');
      v.label.setPosition(b.x, b.type === 'sawmill' ? b.y + 8 : b.type === 'storage' ? b.y - 120 : b.type === 'tower' ? b.y - 132 : b.type === 'lantern' ? b.y - 104 : b.type === 'palisade' ? b.y - 70 : b.y - 76).setDepth(9000);
    }
    if (v.hp) {
      v.hp.clear().setDepth(9000);
      if (b.hp < b.maxHp || (w.night.phase === 'night' && b.type !== 'lantern')) {
        const y = b.type === 'tower' ? b.y - 140 : b.type === 'lantern' ? b.y - 112 : b.y - 80;
        v.hp.fillStyle(0x2a1030, 0.9).fillRoundedRect(b.x - 20, y, 40, 6, 3);
        v.hp.fillStyle(b.type === 'lantern' ? 0xffcf4a : 0x8fe3c0).fillRoundedRect(b.x - 20, y, 40 * Math.max(0, b.hp / b.maxHp), 6, 3);
      }
    }
    if (b.type === 'forge' && Math.random() < 0.04) this.burst(b.x + 36, b.y - 34, 2, 0xffcf4a, 'fx_star', 90, 0.4, 0.3, 300);
  }
  pile(arr: Img[], x: number, y: number, type: ItemId, n: number, by: number) {
    const shown = Math.min(n, 24), h = ITEMS[type].h;
    while (arr.length < shown) { const i = img(this, 'it_' + type); arr.push(i); }
    arr.forEach((im, i) => {
      if (i >= shown) { im.setVisible(false); return; }
      const col = i % 4, row = Math.floor(i / 4);
      im.setVisible(true).setPosition(x + (col - 1.5) * 4 + (row % 2) * 2, y - row * h).setDepth(10 + by + 30);
    });
  }
  makeSlot(x: number, y: number, kind: string): Phaser.GameObjects.GameObject[] {
    const cols: Record<string, number> = { sell: 0xffcf4a, deposit: 0xc7b6ff, sawIn: 0xe7b07a, sawOut: 0xf3d7a6, forge: 0x8fe3c0, bell: 0xff8fa3 };
    const labels: Record<string, string> = { sell: 'ПРОДАТИ', deposit: 'НА СКЛАД', sawIn: 'КОЛОДИ', sawOut: 'ДОШКИ', forge: 'КУЗНЯ', bell: 'НІЧ' };
    const g = this.add.graphics().setDepth(1).setPosition(x, y);
    g.fillStyle(0x2a2140, 0.3).fillRoundedRect(-31, -28, 62, 62, 14);
    g.fillStyle(cols[kind], 0.92).fillRoundedRect(-31, -31, 62, 62, 14);
    g.lineStyle(2.4, 0x2a2140).strokeRoundedRect(-31, -31, 62, 62, 14);
    const icon: Phaser.GameObjects.GameObject = kind === 'sell' ? img(this, 'it_coin', x, y - 6).setScale(1.5 / TEX).setDepth(1)
      : kind === 'deposit' ? img(this, 'it_plank', x, y - 6).setScale(1.4 / TEX).setDepth(1)
      : kind === 'sawIn' ? img(this, 'it_log', x, y - 6).setScale(1.4 / TEX).setDepth(1)
      : kind === 'sawOut' ? img(this, 'it_plank', x, y - 6).setScale(1.4 / TEX).setDepth(1)
      : this.add.text(x, y - 7, kind === 'forge' ? '🔨' : '🔔', { fontSize: '22px' }).setOrigin(0.5).setDepth(1);
    const lbl = this.add.text(x, y + 18, labels[kind], { fontFamily: FONT, fontSize: '10px', fontStyle: '900', color: INK }).setOrigin(0.5).setDepth(1);
    lbl.setResolution(TEX);
    return [g, icon, lbl];
  }

  mkText(x: number, y: number, s: string, size: number, color: string, boxed = false): Txt {
    const t = this.add.text(x, y, s, { fontFamily: FONT, fontSize: size + 'px', fontStyle: '800', color, align: 'center', stroke: boxed ? undefined : INK, strokeThickness: boxed ? 0 : 4 }).setOrigin(0.5);
    if (boxed) t.setBackgroundColor('rgba(42,33,64,.82)').setPadding(7, 2, 7, 2);
    t.setResolution(TEX);
    return t;
  }

  // ---------------------------------------------------------------- events -> fx
  handleEvent(e: GameEvent) {
    const w = this.w;
    const near = (x: number, y: number) => { const v = this.cameras.main.worldView; return x > v.x - 100 && x < v.right + 100 && y > v.y - 100 && y < v.bottom + 100; };
    switch (e.t) {
      case 'fly': {
        const owner = e.to === 'hero' ? 'hero' : typeof e.to === 'number' ? 'c' + e.to : undefined;
        if (owner) this.pending[owner] = (this.pending[owner] || 0) + 1;
        const to = e.to === 'hero' ? () => this.stackTop(w.hero, true)
          : typeof e.to === 'number' ? (() => { const id = e.to as number; return () => { const c = w.cats.find(x => x.id === id); return c ? this.stackTop(c, false) : { x: e.fx, y: e.fy, z: 0 }; }; })()
          : (() => { const p = e.to as { x: number; y: number }; return () => ({ x: p.x, y: p.y, z: 10 }); })();
        const im = this.pool.pop() || img(this, 'it_log');
        im.setTexture('it_' + e.item).setVisible(true).setDepth(5000).setAlpha(1).setScale(1 / TEX).clearTint();
        const m = ART['it_' + e.item]; im.setOrigin(m.ox / m.w, m.oy / m.h);
        this.flyers.push({ img: im, fx: e.fx, fy: e.fy, fz: e.fz, to, t: 0, dur: 0.3 + Math.random() * 0.06, h: 50, owner });
        break;
      }
      case 'chop':
        if (!near(e.x, e.y)) break;
        this.burst(e.x, e.y - 12, 4, 0xc98a55, 'fx_chip', 110, 0.5, 0.4, 400);
        if (e.kind !== 'repair') this.burst(e.x, e.y - 60, 3, 0x6fbf73, 'fx_leaf', 60, 1, 0.5, 80, true);
        if (e.kind === 'hero') sfx('chop'); else if (e.kind === 'repair') sfx('drop');
        break;
      case 'fell': {
        if (!near(e.x, e.y)) break;
        const fi = img(this, 'tr_' + e.kind, e.x, e.y).setDepth(10 + e.y);
        this.falls.push({ img: fi, t: 0, dir: w.hero.x < e.x ? 1 : -1 });
        if (dist(w.hero.x, w.hero.y, e.x, e.y) < 120) { sfx('fall'); this.shakeAmt = Math.max(this.shakeAmt, 2); }
        break;
      }
      case 'hit': this.burst(e.x, e.y, 5, 0xc7a6ff, 'fx_dot', 140, 0.5, 0.5, 200, true); this.floatText(e.x, e.y - 18, '-' + Math.round((e.v || 0) * 10) / 10, '#ffd1dc', 14); sfx('hit'); break;
      case 'poof': this.burst(e.x, e.y, e.kind === 'boss' ? 70 : 20, 0xb9a3e8, 'fx_dot', e.kind === 'boss' ? 320 : 200, 0.9, 0.9, 120, true); this.burst(e.x, e.y, 10, 0xffcf4a, 'fx_star', 160, 0.8, 0.6, 200); sfx('poof'); if (e.kind === 'boss') this.shakeAmt = 12; break;
      case 'build': case 'upgrade':
        this.burst(e.x, e.y, e.t === 'build' ? 40 : 20, 0xffcf4a, 'fx_star', 220, 1, 0.7, 300); this.burst(e.x, e.y, 20, 0xe9667a, 'fx_dot', 200, 1, 0.5, 300);
        sfx(e.t === 'build' ? 'build' : 'upg'); this.shakeAmt = Math.max(this.shakeAmt, e.t === 'build' ? 5 : 2); break;
      case 'hurt': this.burst(e.x, e.y, 8, 0xff8fa3, 'fx_dot', 150, 0.5, 0.5, 300); sfx('hurt'); this.shakeAmt = Math.max(this.shakeAmt, 5); break;
      case 'slam': this.burst(e.x, e.y, 30, 0x9d8cc4, 'fx_dot', 280, 0.8, 1, 200); this.ring(e.x, e.y); sfx('slam'); this.shakeAmt = 12; break;
      case 'coin': this.floatText(e.x, e.y, '+' + e.v, '#ffcf4a', 16 + Math.min(16, (e.v || 1))); sfx('coin'); break;
      case 'pick': sfx('pick'); break;
      case 'drop': sfx('drop'); break;
      case 'pay': sfx('pay'); break;
      case 'shot': if (near(e.x, e.y)) sfx('shot'); break;
      case 'wallHit': if (near(e.x, e.y)) { this.burst(e.x, e.y - 20, 4, 0xc98a55, 'fx_chip', 120, 0.5, 0.4, 300); sfx('wall'); } break;
      case 'lanternOut': this.burst(e.x, e.y - 80, 14, 0xe8e2f0, 'fx_dot', 60, 1.4, 1.2, -20, true); break;
      case 'text': this.floatText(e.x, e.y, e.s, e.color || '#fff4e0', e.size || 16); break;
      case 'bubble': {
        const at = e.who === 'owl' ? { x: 1200, y: 460 } : (() => { const c = w.cats.find(x => x.id === e.who); return c ? { x: c.x, y: c.y - 70 } : null; })();
        if (at) { const tx = this.mkText(at.x, at.y, e.s, 13, INK).setBackgroundColor('#fff8ea').setPadding(8, 4, 8, 4).setDepth(8000); tx.setStroke(INK, 0); this.texts.push({ t: tx, vy: 0, life: 2.2 }); }
        if (e.who !== 'owl') sfx('meow');
        break;
      }
      case 'bossIn': this.shakeAmt = 8; break;
    }
    this.hooks.onEvent(e);
  }
  stackTop(e: { x: number; y: number; face: number; stack: ItemId[] }, isHero: boolean) {
    let h = 0; for (const it of e.stack) h += ITEMS[it].h;
    return { x: e.x - e.face * (isHero ? 9 : 7), y: e.y, z: (isHero ? 34 : 26) + h };
  }

  burst(x: number, y: number, n: number, color: number, key: string, spd: number, life: number, size: number, grav: number, drag = false) {
    for (let i = 0; i < n; i++) {
      if (this.parts.length > 400) break;
      const a = Math.random() * TAU, s = (0.3 + Math.random() * 0.7) * spd;
      const im = this.pool.pop() || img(this, key);
      im.setTexture(key).setVisible(true).setTint(color).setDepth(5001).setAlpha(1).setScale(size * (0.6 + Math.random() * 0.7) / TEX * 2);
      const m = ART[key]; im.setOrigin(m.ox / m.w, m.oy / m.h);
      this.parts.push({ img: im, x, y, z: 5 + Math.random() * 20, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, vz: 80 + Math.random() * 140, life, max: life, grav, spin: (Math.random() - 0.5) * 16, drag });
    }
  }
  ring(x: number, y: number) {
    const r = img(this, 'fx_ring', x, y).setDepth(3);
    this.tweens.add({ targets: r, scale: 4 / TEX, alpha: 0, duration: 700, onComplete: () => r.destroy() });
  }
  floatText(x: number, y: number, s: string, color: string, size: number) {
    const t = this.mkText(x, y, s, size, color).setDepth(8000);
    this.texts.push({ t, vy: -45, life: 1 });
  }

  updateFx(dt: number) {
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i]; f.t += dt / f.dur;
      const to = f.to(), k = Math.min(1, f.t), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const x = f.fx + (to.x - f.fx) * e, y = f.fy + (to.y - f.fy) * e, z = f.fz + (to.z - f.fz) * e + Math.sin(k * Math.PI) * f.h;
      f.img.setPosition(x, y - z).setRotation(k * 6);
      if (f.t >= 1) { f.img.setVisible(false); this.pool.push(f.img); if (f.owner) this.pending[f.owner] = Math.max(0, (this.pending[f.owner] || 0) - 1); this.flyers.splice(i, 1); }
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]; p.life -= dt;
      if (p.life <= 0) { p.img.setVisible(false).clearTint(); this.pool.push(p.img); this.parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vz -= p.grav * dt; p.z += p.vz * dt;
      if (p.drag) { p.vx *= 0.98; p.vz = Math.max(p.vz, -40); }
      if (p.z < 0) { p.z = 0; p.vz *= -0.3; p.vx *= 0.6; p.vy *= 0.6; }
      p.img.setPosition(p.x, p.y - p.z).setRotation(p.img.rotation + p.spin * dt).setAlpha(Math.min(1, p.life / p.max * 2));
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i]; t.life -= dt;
      if (t.life <= 0) { t.t.destroy(); this.texts.splice(i, 1); continue; }
      t.t.y += t.vy * dt; t.t.setAlpha(Math.min(1, t.life * 3));
    }
    for (let i = this.falls.length - 1; i >= 0; i--) {
      const f = this.falls[i]; f.t += dt; const k = Math.min(1, f.t / 0.55);
      f.img.rotation = f.dir * k * k * 1.5; f.img.setAlpha(1 - Math.max(0, (f.t - 0.5) / 0.4));
      if (f.t > 0.9) { f.img.destroy(); this.falls.splice(i, 1); }
    }
  }

  updateCamera(dt: number) {
    const cam = this.cameras.main, h = this.w.hero;
    const tx = h.x + h.vx * 0.25, ty = h.y - 20 + h.vy * 0.2;
    const cx = cam.midPoint.x + (tx - cam.midPoint.x) * Math.min(1, dt * 5), cy = cam.midPoint.y + (ty - cam.midPoint.y) * Math.min(1, dt * 5);
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 18);
    cam.centerOn(cx + (Math.random() - 0.5) * this.shakeAmt, cy + (Math.random() - 0.5) * this.shakeAmt);
  }

  updateLight() {
    const w = this.w, cam = this.cameras.main, v = cam.worldView;
    const dark = w.night.dark * 0.55;
    // warm additive glow around lit lanterns
    const lit = Object.values(w.buildings).filter(b => b.type === 'lantern' && b.hp > 0);
    while (this.glows.length < lit.length) this.glows.push(img(this, 'fx_glow').setTint(0xffbe5a).setBlendMode(Phaser.BlendModes.ADD).setDepth(6999));
    this.glows.forEach((g, i) => { const b = lit[i]; if (!b || dark < 0.02) { g.setVisible(false); return; } g.setVisible(true).setPosition(b.x, b.y - 70).setScale(4 / TEX).setAlpha(dark * 0.9); });
    if (dark < 0.02) { this.lightImg.setVisible(false); return; }
    const c = this.light.getContext(), lw = this.light.width, lh = this.light.height;
    c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, lw, lh);
    c.fillStyle = `rgba(22,14,58,${dark})`; c.fillRect(0, 0, lw, lh);
    c.globalCompositeOperation = 'destination-out';
    const lights: [number, number, number][] = lit.map(b => [b.x, b.y - 50, 190]);
    lights.push([w.hero.x, w.hero.y - 20, 150], [1200, 590, 170]);
    for (const b of Object.values(w.buildings)) if (b.type === 'forge') lights.push([b.x - 20, b.y - 30, 110]);
    for (const [x, y, r] of lights) {
      const sx = (x - v.x) / v.width * lw, sy = (y - v.y) / v.height * lh, sr = r / v.width * lw;
      if (sx < -sr || sy < -sr || sx > lw + sr || sy > lh + sr) continue;
      const g = c.createRadialGradient(sx, sy, 0, sx, sy, sr); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
    }
    this.light.refresh();
    this.lightImg.setVisible(true).setPosition(v.centerX, v.centerY).setDisplaySize(v.width, v.height);
  }
}

export type { Cat, Enemy };
