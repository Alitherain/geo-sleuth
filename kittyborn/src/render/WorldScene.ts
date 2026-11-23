import Phaser from 'phaser';
import { BUILD, EDGE, GROVE, HEDGE_X, HILLS, ITEMS, MEADOW, ROAD_Y, SPAWNS, TC, W, H, WILDS, type BuildingType, type ItemId } from '../content/data';
import { step, type Input } from '../sim/sim';
import { fuelNeed } from '../sim/logistics';
import { dist, hallLevel, invTotal, lightRadius, townR, type Building, type GameEvent, type World } from '../sim/world';
import { ART, INK, TEX, buildArt, img, setArt } from './art';
import { sfx } from '../platform/audio';

const TAU = Math.PI * 2;
type Img = Phaser.GameObjects.Image;
type Txt = Phaser.GameObjects.Text;
type Ctn = Phaser.GameObjects.Container;
const FONT = 'Nunito, system-ui, sans-serif';

export interface Ghost { type: BuildingType; x: number; y: number; ok: boolean; moving?: string }
export interface SceneHooks {
  world: () => World; input: Input; running: () => boolean;
  onEvent: (e: GameEvent) => void; onFrame: (dt: number) => void;
  build: () => { active: boolean; ghost: Ghost | null; selected: string | null };
}
interface CharView { root: Ctn; body: Img; legL: Img; legR: Img; tail?: Img; cape?: Img; scarf?: Img; tool?: Img; stack: Ctn; stackImgs: Img[]; key: string; sway: number; swayV: number; bubble?: Txt; toolKey?: string }
interface Particle { img: Img; x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; grav: number; spin: number; drag: boolean; grow: number; alpha: number }
interface Flyer { img: Img; fx: number; fy: number; fz: number; to: () => { x: number; y: number; z: number }; t: number; dur: number; h: number; owner?: string }
interface BView { parts: Phaser.GameObjects.GameObject[]; main: Img; key: string; level: number; x: number; y: number; slots: { objs: Phaser.GameObjects.GameObject[]; dx: number; dy: number }[];
  blade?: Img; flames?: Img[]; flag?: Img; label?: Txt; hp?: Phaser.GameObjects.Graphics; glow?: Img; pileIn: Img[]; pileOut: Img[]; smokeT: number }

export class WorldScene extends Phaser.Scene {
  hooks!: SceneHooks; w!: World;
  acc = 0; shakeAmt = 0; elapsed = 0;
  hero!: CharView;
  cats = new Map<number, CharView>(); units = new Map<number, CharView>();
  nodes = new Map<number, { base: Img; crown?: Img; key: string }>();
  buildings = new Map<string, BView>();
  enemies = new Map<number, { img: Img; shadow: Img; hp: Phaser.GameObjects.Graphics; key: string }>();
  groundItems = new Map<number, Img>(); shots = new Map<number, Img>();
  flyers: Flyer[] = []; parts: Particle[] = []; pool: Img[] = [];
  texts: { t: Txt; vy: number; life: number }[] = [];
  pending: Record<string, number> = {};
  townG!: Phaser.GameObjects.Graphics; hedgeG!: Phaser.GameObjects.Graphics; groveG!: Phaser.GameObjects.Graphics;
  townLevel = 0; hedgeDone = false;
  tele!: Img; teleIn!: Img; dirArrows: Img[] = [];
  ghostImg!: Img; ghostG!: Phaser.GameObjects.Graphics; selG!: Phaser.GameObjects.Graphics;
  light!: Phaser.Textures.CanvasTexture; lightImg!: Img; vignette!: Img; tint!: Phaser.GameObjects.Rectangle;
  glows: Img[] = []; falls: { img: Img; t: number; dir: number }[] = [];
  owl!: Img;
  camFollow = true;

  constructor() { super('world'); }
  init(h: SceneHooks) { this.hooks = h; }

  create() {
    this.w = this.hooks.world();
    buildArt(this);
    this.drawGround();
    this.makeDecor();
    this.hero = this.makeChar('hero', true);
    this.tele = img(this, 'fx_tele').setDepth(3).setVisible(false);
    this.teleIn = img(this, 'fx_tele').setDepth(3).setVisible(false).setAlpha(0.6);
    for (let i = 0; i < 4; i++) this.dirArrows.push(img(this, 'fx_arrow').setDepth(9000).setVisible(false).setTint(0xff5470));
    this.ghostG = this.add.graphics().setDepth(8500);
    this.selG = this.add.graphics().setDepth(8499);
    this.ghostImg = img(this, 'site').setDepth(8501).setVisible(false).setAlpha(0.7);
    this.owl = img(this, 'npc_owl').setDepth(0);
    const cw = Math.max(64, Math.ceil(this.scale.width / 4)), ch = Math.max(64, Math.ceil(this.scale.height / 4));
    this.light = this.textures.createCanvas('light', cw, ch)!;
    this.lightImg = this.add.image(0, 0, 'light').setDepth(7000);
    this.tint = this.add.rectangle(0, 0, 10, 10, 0xff7a3c, 0).setDepth(6990);
    this.vignette = img(this, 'fx_vignette').setDepth(7001);
    const cam = this.cameras.main;
    cam.setBounds(0, 0, W, H); cam.setBackgroundColor('#2f4a4a');
    this.fitCamera(); cam.centerOn(this.w.hero.x, this.w.hero.y);
    this.scale.on('resize', () => this.fitCamera());
  }
  fitCamera() {
    this.cameras.main.setZoom(Math.min(this.scale.height / 660, this.scale.width / 520));
    const cw = Math.max(64, Math.ceil(this.scale.width / 4)), ch = Math.max(64, Math.ceil(this.scale.height / 4));
    if (this.light && (this.light.width !== cw || this.light.height !== ch)) this.light.setSize(cw, ch);
  }
  screenToWorld(x: number, y: number) { const p = this.cameras.main.getWorldPoint(x, y); return { x: p.x, y: p.y }; }
  panBy(dx: number, dy: number) { const cam = this.cameras.main; this.camFollow = false; cam.centerOn(cam.midPoint.x - dx / cam.zoom, cam.midPoint.y - dy / cam.zoom); }
  focus() { this.camFollow = true; }
  setWorld(w: World) {
    this.w = w;
    for (const m of [this.cats, this.units]) { for (const v of m.values()) { v.root.destroy(); v.bubble?.destroy(); } m.clear(); }
    for (const v of this.enemies.values()) { v.img.destroy(); v.shadow.destroy(); v.hp.destroy(); } this.enemies.clear();
    for (const v of this.nodes.values()) { v.base.destroy(); v.crown?.destroy(); } this.nodes.clear();
    for (const v of this.buildings.values()) this.destroyB(v); this.buildings.clear();
    for (const v of this.groundItems.values()) v.destroy(); this.groundItems.clear();
    for (const v of this.shots.values()) v.destroy(); this.shots.clear();
    this.pending = {}; this.townLevel = 0; this.hedgeDone = false; this.hedgeG.setVisible(true).setAlpha(1); this.drawGrove();
    this.cameras.main.centerOn(w.hero.x, w.hero.y);
  }

  // ---------------------------------------------------------------- static world
  drawGround() {
    this.add.tileSprite(0, 0, W, H, 'grass_tile').setOrigin(0).setTileScale(1 / TEX).setDepth(0);
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(0x4f7f56, 0.35).fillRoundedRect(EDGE.x - 40, EDGE.y - 40, EDGE.w + 60, EDGE.h + 70, 70);
    g.fillStyle(0x7a6c9a, 0.85).fillRoundedRect(WILDS.x - 30, 50, W - WILDS.x + 60, H - 70, 90);
    g.fillStyle(0x9a9078, 0.45).fillRoundedRect(HILLS.x - 40, HILLS.y - 60, HILLS.w + 80, HILLS.h + 80, 80);
    g.fillStyle(0xa6cf86, 0.35).fillRoundedRect(MEADOW.x - 30, MEADOW.y - 20, MEADOW.w + 60, MEADOW.h + 40, 80);
    // dirt roads with soft edges
    for (const [col, a, wd] of [[0xc9b48c, 0.6, 92], [0xe1cfa9, 1, 72]] as [number, number, number][]) {
      g.fillStyle(col, a);
      g.fillRoundedRect(HEDGE_X - 30, ROAD_Y - wd / 2, TC.x - HEDGE_X, wd, wd / 2);
      g.fillRoundedRect(TC.x, ROAD_Y - wd / 2, WILDS.x - TC.x + 60, wd, wd / 2);
      g.fillRoundedRect(TC.x - wd / 2, HILLS.y + HILLS.h - 40, wd, TC.y - HILLS.y - HILLS.h + 40, wd / 2);
      g.fillRoundedRect(TC.x - wd / 2, TC.y, wd, MEADOW.y - TC.y + 60, wd / 2);
    }
    this.groveG = this.add.graphics().setDepth(0); this.drawGrove();
    this.townG = this.add.graphics().setDepth(0.5);
    this.hedgeG = this.add.graphics().setDepth(5);
    for (let y = 110; y < H - 40; y += 22) { const k = Math.sin(y * 0.3) * 3; this.hedgeG.fillStyle(y % 44 ? 0x3e6e4e : 0x477a57).fillCircle(HEDGE_X + k, y, 17); this.hedgeG.lineStyle(1.6, 0x24442f).strokeCircle(HEDGE_X + k, y, 17); this.hedgeG.fillStyle(0x6fa06a, 0.6).fillCircle(HEDGE_X + k - 5, y - 6, 5); }
  }
  drawGrove() { this.groveG.clear().fillStyle(this.w.flags.hedge ? 0x8a7ab0 : 0x4f5f6e, 0.35).fillRoundedRect(GROVE.x - 40, GROVE.y - 40, GROVE.w + 60, GROVE.h + 70, 60); }
  drawTown() {
    const R = townR(this.w), lv = hallLevel(this.w), g = this.townG.clear();
    g.fillStyle(0xb9a37f).fillCircle(TC.x, TC.y, R + 8);
    g.fillStyle(lv >= 2 ? 0xd8c9b0 : 0xcdb994).fillCircle(TC.x, TC.y, R);
    // cobble rings
    for (let r = 40; r < R - 10; r += 26) {
      const n = Math.floor(TAU * r / 30);
      for (let i = 0; i < n; i++) { const a = i / n * TAU + (r / 26) * 0.4; g.fillStyle(((i + r) % 3) ? 0xc4ae8a : 0xd2bd98, lv >= 2 ? 0.9 : 0.6).fillRoundedRect(TC.x + Math.cos(a) * r - 11, TC.y + Math.sin(a) * r * 0.92 - 7, 22, 14, 6); }
    }
    if (lv >= 3) { g.lineStyle(6, 0xb0a0d0, 0.5); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; g.lineBetween(TC.x, TC.y, TC.x + Math.cos(a) * R, TC.y + Math.sin(a) * R); } }
    g.lineStyle(3, 0x9a8462, 0.8).strokeCircle(TC.x, TC.y, R + 8);
    for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; g.fillStyle(0x8e8aa6).fillCircle(TC.x + Math.cos(a) * (R + 8), TC.y + Math.sin(a) * (R + 8), 4); }
  }
  makeDecor() {
    let s = 4242; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    for (let i = 0; i < 1100; i++) {
      const x = r() * W, y = 100 + r() * (H - 140);
      if (dist(x, y, TC.x, TC.y) < 600) continue;
      if (Math.abs(y - ROAD_Y) < 46 && x > HEDGE_X) continue;
      const wild = x > WILDS.x, k = r();
      let key = wild ? 'dc_tuft2' : 'dc_tuft';
      if (wild) { if (k < 0.07) key = 'dc_grave'; else if (k < 0.12) key = 'dc_shroom'; }
      else if (k < 0.1) key = 'dc_flower' + Math.floor(r() * 4); else if (k < 0.14) key = 'dc_shroom'; else if (k < 0.2) key = 'dc_pebble'; else if (k < 0.22) key = 'dc_bush';
      img(this, key, x, y).setDepth(key === 'dc_grave' || key === 'dc_bush' ? 10 + y : 1);
    }
    for (let x = -20; x < W + 40; x += 46) { img(this, 'tr_bg', x + r() * 20, 70 + r() * 40).setDepth(10).setScale((1 + r() * 0.5) / TEX); img(this, 'tr_bg', x + r() * 20, H - 10 + r() * 20).setDepth(10 + H).setScale((1 + r() * 0.5) / TEX); }
    for (let y = 100; y < H - 30; y += 46) { img(this, 'tr_bg', 20 + r() * 30, y).setDepth(10 + y).setScale((1 + r() * 0.5) / TEX); img(this, 'tr_bg', W - 20 - r() * 30, y).setDepth(10 + y).setScale((1 + r() * 0.5) / TEX); }
  }

  // ---------------------------------------------------------------- characters
  makeChar(key: string, isHero: boolean): CharView {
    const root = this.add.container(0, 0);
    const shadow = img(this, 'fx_shadow'); if (!isHero) shadow.setScale(0.7 / TEX);
    const legL = img(this, (isHero ? 'hero' : key) + '_leg', -5, 0), legR = img(this, (isHero ? 'hero' : key) + '_leg', 5, 0);
    const stack = this.add.container(0, 0);
    const body = img(this, key);
    const v: CharView = { root, body, legL, legR, stack, stackImgs: [], key, sway: 0, swayV: 0 };
    if (isHero) {
      v.cape = img(this, 'hero_cape', -6, -28); v.scarf = img(this, 'hero_scarf', -4, -28);
      v.tool = img(this, 'w_axe', 11, -18);
      root.add([shadow, v.cape, legL, legR, stack, body, v.scarf, v.tool]);
    } else {
      v.tail = img(this, key + '_tail', -7, -6);
      v.tool = img(this, 'w_catAxe', 8, -12);
      root.add([shadow, v.tail, legL, legR, stack, body, v.tool]);
    }
    return v;
  }
  syncChar(v: CharView, e: { x: number; y: number; face: number; moving: boolean; walkT: number; swing: number; stack: ItemId[] }, owner: string, dt: number, vx = 0) {
    const t = this.elapsed, isHero = owner === 'hero', s = isHero ? 1 : 0.7;
    v.root.setPosition(e.x, e.y).setDepth(10 + e.y);
    v.root.scaleX += (e.face - v.root.scaleX) * Math.min(1, dt * 18); // smooth turn instead of a hard flip
    const run = e.moving ? Math.sin(e.walkT * 11) : 0;
    const bob = e.moving ? Math.abs(run) * 3 * s : Math.sin(t * 2.5 + e.x) * 0.8;
    v.body.y = -bob; v.body.scaleY = (1 + (e.moving ? Math.abs(run) * -0.04 : Math.sin(t * 2.5 + e.x) * 0.02)) / TEX; v.body.scaleX = (1 + (e.moving ? Math.abs(run) * 0.03 : 0)) / TEX;
    v.body.rotation = e.moving ? 0.06 : 0;
    const blink = ((t + e.x * 0.01) % 4.1) < 0.12;
    setArt(v.body, blink ? v.key + '_b' : v.key);
    const lp = e.moving ? run * 4 * s : 0;
    v.legL.y = -Math.max(0, lp); v.legR.y = -Math.max(0, -lp);
    if (v.tail) v.tail.rotation = Math.sin(t * 1.6 + e.x) * 0.12 + (e.moving ? 0.25 : 0);
    if (v.cape) { v.cape.y = -28 - bob; v.cape.rotation = (e.moving ? 0.5 : 0.08) + Math.sin(t * 4 + e.walkT * 6) * 0.08; }
    if (v.scarf) { v.scarf.y = -28 - bob; v.scarf.rotation = (e.moving ? -0.15 : 0.15) + Math.sin(t * 5 + e.walkT * 8) * 0.12; }
    if (v.tool) { v.tool.rotation = e.swing > 0 ? -2.1 + 2.9 * (1 - e.swing) : 0.5 + Math.sin(t * 2) * 0.03; v.tool.y = (isHero ? -18 : -12) - bob; }
    const target = -vx * 0.05 * Math.sign(v.root.scaleX || 1);
    v.swayV += ((target - v.sway) * 60 - v.swayV * 8) * dt; v.sway += v.swayV * dt;
    const hidden = this.pending[owner] || 0, n = Math.max(0, e.stack.length - hidden);
    while (v.stackImgs.length < n) { const i = img(this, 'it_log'); v.stack.add(i); v.stackImgs.push(i); }
    let y = (isHero ? -24 : -16) - bob;
    for (let i = 0; i < v.stackImgs.length; i++) {
      const im = v.stackImgs[i];
      if (i >= n) { im.setVisible(false); continue; }
      const it = e.stack[i], h = ITEMS[it].h, k = i / 12;
      setArt(im, 'it_' + it);
      im.setVisible(true).setPosition((isHero ? -9 : -7) + v.sway * k * k * 10, y - h / 2);
      y -= h;
    }
  }

  // ---------------------------------------------------------------- frame
  update(_t: number, deltaMs: number) {
    const dt = Math.min(0.05, deltaMs / 1000);
    this.elapsed += dt;
    const w = this.w;
    if (this.hooks.running()) {
      this.acc += dt; let n = 0;
      while (this.acc >= 1 / 60 && n < 5) { step(w, this.hooks.input, 1 / 60); this.acc -= 1 / 60; n++; }
      for (const e of w.events) this.handleEvent(e);
      w.events.length = 0;
    }
    this.syncWorld(dt);
    this.updateBuildUi();
    this.updateFx(dt);
    this.ambient(dt);
    this.updateCamera(dt);
    this.updateLight();
    this.hooks.onFrame(dt);
  }

  syncWorld(dt: number) {
    const w = this.w, t = this.elapsed, cam = this.cameras.main;
    if (this.townLevel !== hallLevel(w)) { this.townLevel = hallLevel(w); this.drawTown(); }
    if (!this.hedgeDone && w.flags.hedge) { this.hedgeDone = true; this.drawGrove(); this.tweens.add({ targets: this.hedgeG, alpha: 0, duration: 900, onComplete: () => this.hedgeG.setVisible(false) }); }
    // resource nodes
    for (const n of w.nodes) {
      let v = this.nodes.get(n.id);
      const tree = n.kind === 'oak' || n.kind === 'pine' || n.kind === 'lav';
      const key = tree ? (n.alive ? 'tr_' + n.kind + '_t' : 'tr_stump') : n.kind === 'rock' ? (n.alive ? 'nd_rock' : 'nd_rock_x') : (n.alive ? 'nd_bush' : 'nd_bush_x');
      if (!v) { v = { base: img(this, key, n.x, n.y), key }; if (tree) v.crown = img(this, 'tr_' + n.kind + '_c', n.x, n.y); this.nodes.set(n.id, v); }
      if (v.key !== key) { setArt(v.base, key); v.key = key; }
      const g = n.alive && n.grow < 1 ? Phaser.Math.Easing.Back.Out(n.grow) : 1;
      const sh = Math.sin(t * 45) * n.shake * 3;
      v.base.setScale(n.s * g / TEX).setPosition(n.x + sh * 0.3, n.y).setDepth(10 + n.y);
      v.base.setAlpha(n.zone === 'grove' && !w.flags.hedge ? 0.7 : 1);
      if (v.crown) {
        v.crown.setVisible(n.alive);
        if (n.alive) {
          // wind sway plus a little perspective parallax: crowns lean away from the camera centre
          const px = (n.x - cam.midPoint.x) * 0.035, py = (n.y - cam.midPoint.y) * 0.015;
          const th = n.kind === 'pine' ? 28 : 32;
          v.crown.setPosition(n.x + sh + px, n.y - th * n.s * g + py).setScale(n.s * g / TEX).setDepth(10.5 + n.y)
            .setRotation(Math.sin(t * 1.3 + n.seed) * 0.04 + n.shake * Math.sin(t * 40) * 0.08).setAlpha(v.base.alpha);
        }
      }
    }
    // buildings
    for (const b of Object.values(w.buildings)) this.syncBuilding(b, dt);
    for (const [id, v] of this.buildings) if (!w.buildings[id]) { this.destroyB(v); this.buildings.delete(id); }
    const shop = w.buildings.shop;
    this.owl.setVisible(!!shop);
    if (shop) this.owl.setPosition(shop.x, shop.y - 18 + Math.sin(t * 2) * 1.2).setDepth(10 + shop.y + 0.5).setScale(1 / TEX, (1 + Math.sin(t * 2) * 0.02) / TEX);
    // hero
    const h = w.hero;
    this.syncChar(this.hero, h, 'hero', dt, h.vx);
    this.hero.root.setVisible(!(h.dead > 0 && h.dead < 2.6));
    this.hero.root.setAlpha(h.inv > 0 && Math.floor(t * 20) % 2 ? 0.45 : 1);
    setArt(this.hero.tool!, h.form === 'saw' ? 'w_saw' : 'w_axe');
    // cats
    for (const c of w.cats) {
      let v = this.cats.get(c.id);
      const ht = w.buildings[c.home]?.type;
      if (!v) { v = this.makeChar('cat_' + (ht === 'houseQuarry' ? 'miner' : ht === 'houseForager' ? 'forager' : c.role), false); v.bubble = this.mkText(0, 0, '', 12, INK, 'bubble').setDepth(8000); this.cats.set(c.id, v); }
      v.root.setVisible(!c.hidden);
      const home = w.buildings[c.home];
      const tool = c.role === 'gatherer' ? (home?.gather === 'stone' ? 'w_pick' : home?.gather === 'berry' ? 'w_basket' : 'w_catAxe') : c.role === 'master' ? 'w_hammer' : '';
      if (v.tool) { v.tool.setVisible(!!tool); if (tool) setArt(v.tool, tool); }
      this.syncChar(v, c, 'c' + c.id, dt, c.moving ? c.face * 60 : 0);
      const idle = !c.hidden && c.idle && !c.moving;
      v.bubble!.setVisible(!!idle).setPosition(c.x, c.y - 62);
      if (idle && v.bubble!.text !== '💤 ' + c.idle) v.bubble!.setText('💤 ' + c.idle);
    }
    for (const [id, v] of this.cats) if (!w.cats.find(c => c.id === id)) { v.root.destroy(); v.bubble?.destroy(); this.cats.delete(id); }
    // units
    for (const u of w.units) {
      let v = this.units.get(u.id);
      if (!v) { v = this.makeChar('cat_' + u.kind, false); setArt(v.tool!, u.kind === 'spear' ? 'w_spear' : 'w_sling'); v.bubble = this.mkText(0, 0, '', 12, INK, 'bubble').setDepth(8000); this.units.set(u.id, v); }
      this.syncChar(v, { ...u, stack: [] }, 'u' + u.id, dt, u.moving ? u.face * 60 : 0);
      v.root.setAlpha(u.woundT > 0 ? 0.55 : 1);
      v.bubble!.setVisible(u.woundT > 0).setPosition(u.x, u.y - 62); if (u.woundT > 0) v.bubble!.setText('🩹 ' + Math.ceil(u.woundT));
    }
    for (const [id, v] of this.units) if (!w.units.find(u => u.id === id)) { v.root.destroy(); v.bubble?.destroy(); this.units.delete(id); }
    // enemies
    for (const e of w.enemies) {
      let v = this.enemies.get(e.id);
      const base = 'b_' + e.kind;
      if (!v) { v = { img: img(this, base), shadow: img(this, 'fx_shadow'), hp: this.add.graphics(), key: base }; this.enemies.set(e.id, v); if (e.kind === 'boss') v.shadow.setScale(3 / TEX); else if (e.kind === 'horn') v.shadow.setScale(1.3 / TEX); }
      const key = e.flash > 0 ? base + '_w' : e.kind === 'fluff' && (e.aggro > 0 || !e.passive) ? 'b_fluff_a' : base;
      if (v.key !== key) { setArt(v.img, key); v.key = key; }
      const hop = e.moving ? Math.abs(Math.sin(e.walkT * 9)) * 5 : Math.sin(t * 3 + e.x) * 1.2;
      const sq = e.moving ? 1 + Math.sin(e.walkT * 18) * 0.05 : 1;
      v.img.setPosition(e.x, e.y - hop - e.z).setDepth(10 + e.y).setFlipX(e.face < 0).setScale(1 / TEX / sq, sq / TEX);
      v.img.setAlpha(e.kind === 'shade' ? 0.75 + Math.sin(t * 6 + e.id) * 0.15 : 1);
      v.shadow.setPosition(e.x, e.y).setDepth(9 + e.y).setAlpha(e.z > 0 ? 0.5 : 1);
      v.hp.clear().setDepth(11 + e.y);
      if (e.hp < e.maxHp && e.kind !== 'boss') { v.hp.fillStyle(0x2a1030).fillRoundedRect(e.x - 14, e.y - e.r * 2 - 18, 28, 5, 2); v.hp.fillStyle(e.lit ? 0xffb84a : 0xff6b8a).fillRoundedRect(e.x - 14, e.y - e.r * 2 - 18, 28 * Math.max(0, e.hp / e.maxHp), 5, 2); }
      if (e.lit && Math.random() < dt * 6) this.burst(e.x, e.y - e.r, 1, 0xffb84a, 'fx_dot', 40, 0.5, 0.3, -60);
      if (e.boss) { const B = e.boss; this.tele.setVisible(B.state === 'tele').setPosition(B.tx, B.ty); this.teleIn.setVisible(B.state === 'tele').setPosition(B.tx, B.ty).setScale(Math.min(1, B.t / 0.95) / TEX); }
    }
    if (!w.enemies.some(e => e.boss)) { this.tele.setVisible(false); this.teleIn.setVisible(false); }
    for (const [id, v] of this.enemies) if (!w.enemies.find(e => e.id === id)) { v.img.destroy(); v.shadow.destroy(); v.hp.destroy(); this.enemies.delete(id); }
    for (const g of w.ground) { let v = this.groundItems.get(g.id); if (!v) { v = img(this, 'it_' + g.type).setDepth(2); this.groundItems.set(g.id, v); } v.setPosition(g.x, g.y - 4 - g.z - (g.z === 0 ? Math.abs(Math.sin(t * 3 + g.id)) * 1.5 : 0)).setRotation(Math.sin(g.id) * 0.4); }
    for (const [id, v] of this.groundItems) if (!w.ground.find(g => g.id === id)) { v.destroy(); this.groundItems.delete(id); }
    for (const s of w.shots) { let v = this.shots.get(s.id); if (!v) { v = img(this, s.kind === 'cone' ? 'fx_cone' : 'fx_pebble').setDepth(5000); this.shots.set(s.id, v); } v.setPosition(s.x, s.y).setRotation(t * 12); }
    for (const [id, v] of this.shots) if (!w.shots.find(s => s.id === id)) { v.destroy(); this.shots.delete(id); }
    // dusk: arrows on the town edge toward each spawn
    const show = w.clock.phase === 'dusk' || (w.clock.phase === 'night' && w.clock.queue.length > 0);
    this.dirArrows.forEach((a, i) => {
      const d = show ? w.clock.dirs[i] : undefined; if (!d) { a.setVisible(false); return; }
      const sp = SPAWNS[d], ang = Math.atan2(TC.y - sp.y, TC.x - sp.x), R = townR(w) + 90 + Math.sin(t * 5) * 8;
      a.setVisible(true).setPosition(TC.x - Math.cos(ang) * R, TC.y - Math.sin(ang) * R).setRotation(ang).setScale(1.6 / TEX).setAlpha(0.85);
    });
  }

  destroyB(v: BView) { v.parts.forEach(p => p.destroy()); v.pileIn.forEach(p => p.destroy()); v.pileOut.forEach(p => p.destroy()); v.slots.forEach(s => s.objs.forEach(o => o.destroy())); }
  keyFor(b: Building): string {
    if (b.site) return 'site';
    switch (b.type) {
      case 'hall': return 'bd_hall' + b.level;
      case 'houseGatherer': return 'bd_house_gatherer'; case 'houseQuarry': return 'bd_house_quarry'; case 'houseForager': return 'bd_house_forager'; case 'houseHauler': return 'bd_house_hauler'; case 'houseMaster': return 'bd_house_master';
      case 'lantern': return lightRadius(b) > 0 ? 'bd_lantern' : 'bd_lantern_off';
      case 'bonfire': return lightRadius(b) > 0 ? 'bd_bonfire' : 'bd_ash';
      case 'palisade': return b.hp <= 0 ? 'bd_palx' : b.level > 1 ? 'bd_pal2' : 'bd_pal';
      default: return 'bd_' + b.type;
    }
  }
  syncBuilding(b: Building, dt: number) {
    const w = this.w, t = this.elapsed, def = BUILD[b.type];
    let v = this.buildings.get(b.id);
    const key = this.keyFor(b);
    if (!v) {
      const main = img(this, key, b.x, b.y);
      v = { parts: [main], main, key, level: b.level, x: b.x, y: b.y, slots: [], pileIn: [], pileOut: [], smokeT: Math.random() };
      if (b.type === 'sawmill') { v.blade = img(this, 'bd_blade'); v.parts.push(v.blade); }
      if (def.fuel && b.type !== 'lantern') { v.flames = [0, 1, 2].map(() => img(this, 'fx_flame').setBlendMode(Phaser.BlendModes.ADD)); v.parts.push(...v.flames); }
      if (b.type === 'lantern') { v.flames = [img(this, 'fx_flame').setBlendMode(Phaser.BlendModes.ADD)]; v.parts.push(v.flames[0]); }
      if (b.type === 'post') { v.flag = img(this, 'bd_flag'); v.parts.push(v.flag); }
      if (b.type === 'banner') { v.flag = img(this, 'bd_banner_cloth'); v.parts.push(v.flag); }
      v.label = this.mkText(b.x, b.y, '', 12, '#fff4e0', 'box'); v.parts.push(v.label);
      v.hp = this.add.graphics(); v.parts.push(v.hp);
      for (const s of def.slots || []) v.slots.push({ objs: this.makeSlot(s.kind), dx: s.dx, dy: s.dy });
      this.buildings.set(b.id, v);
      if (w.time - b.builtAt < 1) { main.setScale(0.2 / TEX); this.tweens.add({ targets: main, scale: 1 / TEX, duration: 500, ease: 'Back.Out' }); }
    }
    if (v.key !== key) { const wasSite = v.key === 'site'; setArt(v.main, key); v.key = key; if (wasSite) { v.main.setScale(0.3 / TEX); this.tweens.add({ targets: v.main, scale: 1 / TEX, duration: 550, ease: 'Back.Out' }); } }
    if (v.level !== b.level) { v.level = b.level; this.tweens.add({ targets: v.main, scale: { from: 1.18 / TEX, to: 1 / TEX }, duration: 420, ease: 'Back.Out' }); }
    if (v.x !== b.x || v.y !== b.y) { v.x = b.x; v.y = b.y; }
    const siteScale = b.site ? Math.max(0.45, def.r / 40) : 1;
    if (b.site && !this.tweens.isTweening(v.main)) v.main.setScale(siteScale / TEX);
    const working = b.status === 'Працює';
    const wob = working && !b.site ? Math.sin(t * 18) * 0.01 : 0;
    v.main.setPosition(b.x, b.y).setDepth(10 + b.y).setRotation(wob);
    if (!b.site && !this.tweens.isTweening(v.main)) v.main.setScale((1 + (working ? Math.abs(Math.sin(t * 9)) * 0.015 : 0)) / TEX, 1 / TEX);
    v.slots.forEach(s => s.objs.forEach((o: any, i) => { o.setVisible(!b.site); o.setPosition(b.x + s.dx, b.y + s.dy + (i === 1 ? -6 : i === 2 ? 18 : 0)); }));
    if (v.blade) { v.blade.setVisible(!b.site).setPosition(b.x + 2, b.y - 96).setDepth(11 + b.y); if (working) v.blade.rotation += dt * (b.spec === 'fast' ? 22 : 11); }
    if (v.flames) {
      const lit = lightRadius(b) > 0, f = def.fuel!, k = lit ? 0.55 + 0.45 * (b.fuel / f.cap) : 0;
      v.flames.forEach((fl, i) => {
        if (!lit) { fl.setVisible(false); return; }
        const big = b.type === 'heart' ? 1.15 : b.type === 'lantern' ? 0.32 : 0.8;
        const ox = b.type === 'lantern' ? 0 : (i - 1) * 7 * big, oy = b.type === 'lantern' ? -68 : -8;
        fl.setBlendMode(w.clock.dark > 0.3 ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
        fl.setVisible(true).setPosition(b.x + ox + Math.sin(t * 9 + i) * 1.5, b.y + oy).setDepth(11 + b.y)
          .setScale((0.75 + 0.25 * Math.sin(t * (12 + i * 3) + i)) * big * k / TEX, (0.85 + 0.35 * Math.abs(Math.sin(t * (9 + i * 2) + i * 2))) * big * k / TEX).setAlpha(0.9);
      });
      if (lit && b.type !== 'lantern' && Math.random() < dt * (b.type === 'heart' ? 10 : 5)) this.burst(b.x + (Math.random() - 0.5) * 16, b.y - 14, 1, 0xffc35a, 'fx_dot', 30, 1, 0.25, -90);
    }
    if (v.flag) { v.flag.setPosition(b.x + (b.type === 'post' ? 1 : 1), b.y + (b.type === 'post' ? -78 : -86)).setDepth(10.2 + b.y).setScale((0.85 + Math.sin(t * 5 + b.x) * 0.15) / TEX, 1 / TEX); }
    v.smokeT -= dt;
    if (!b.site && v.smokeT <= 0 && (b.type === 'forge' || b.type === 'candleShop' || b.type === 'houseMaster' || (b.type === 'hall' && b.level === 1))) {
      v.smokeT = 0.35 + Math.random() * 0.3;
      const off: Record<string, [number, number]> = { forge: [12, -90], candleShop: [16, -126], houseMaster: [10, -72], hall: [24, -120] };
      const [ox, oy] = off[b.type]; this.puff(b.x + ox, b.y + oy, 0xe8e2f0);
    }
    if (b.type === 'fountain' && Math.random() < dt * 14) this.burst(b.x, b.y - 42, 1, 0x9fd8f0, 'fx_dot', 50, 0.8, 0.35, 260);
    if (b.type === 'forge' && Math.random() < dt * 1.5) this.burst(b.x + 36, b.y - 30, 3, 0xffcf4a, 'fx_star', 90, 0.4, 0.3, 300);
    if (def.proc) {
      const p = def.proc;
      this.pile(v.pileIn, b.x - 56, b.y + 30, p.input, b.store && b.input ? (b.input[p.input] || 0) : 0, b.y);
      this.pile(v.pileOut, b.x + 56, b.y + 30, p.output, b.store[p.output] || 0, b.y);
    }
    // label: site progress, fuel warnings, stars
    let s = '';
    if (b.site) s = '🔨 ' + Object.entries(b.site).map(([k, n]) => `${n}${ITEMS[k as ItemId].icon}`).join(' ');
    else if (def.fuel && b.fuel < def.fuel.cap * 0.25) s = b.fuel <= 0 ? '⚠️ Згасло' : '⚠️ Мало палива';
    else if (b.type === 'storage') s = `${invTotal(b.store)}/${(def.levels![b.level - 1].stats.cap)}`;
    else if (def.levels && b.level > 1 && b.type !== 'hall') s = '★'.repeat(b.level);
    if (v.label!.text !== s) v.label!.setText(s);
    v.label!.setVisible(s !== '').setPosition(b.x, b.y - (b.site ? 70 * siteScale : (ART[key]?.oy ?? 60) + 6)).setDepth(9000);
    v.hp!.clear().setDepth(9000);
    if (!b.site && (b.type === 'palisade' || b.type === 'tower' || def.fuel) && (b.hp < b.maxHp || (def.fuel && w.clock.phase !== 'day'))) {
      const y = b.y - (ART[key]?.oy ?? 60) - (s ? 22 : 8);
      v.hp!.fillStyle(0x2a1030, 0.9).fillRoundedRect(b.x - 20, y, 40, 6, 3);
      v.hp!.fillStyle(0x8fe3c0).fillRoundedRect(b.x - 20, y, 40 * Math.max(0, b.hp / b.maxHp), 6, 3);
      if (def.fuel) { v.hp!.fillStyle(0x2a1030, 0.9).fillRoundedRect(b.x - 20, y + 8, 40, 5, 2.5); v.hp!.fillStyle(0xffb84a).fillRoundedRect(b.x - 20, y + 8, 40 * Math.max(0, b.fuel / def.fuel.cap), 5, 2.5); }
    }
  }
  pile(arr: Img[], x: number, y: number, type: ItemId, n: number, by: number) {
    const shown = Math.min(n, 24), h = ITEMS[type].h;
    while (arr.length < shown) arr.push(img(this, 'it_' + type));
    arr.forEach((im, i) => { if (i >= shown) { im.setVisible(false); return; } setArt(im, 'it_' + type); const col = i % 4, row = Math.floor(i / 4); im.setVisible(true).setPosition(x + (col - 1.5) * 4 + (row % 2) * 2, y - row * h).setDepth(10 + by + 30); });
  }
  makeSlot(kind: string): Phaser.GameObjects.GameObject[] {
    const cols: Record<string, number> = { sell: 0xffcf4a, deposit: 0xc7b6ff, in: 0xe7b07a, out: 0xf3d7a6, forge: 0x8fe3c0, bell: 0xff8fa3, fuel: 0xffa25a };
    const labels: Record<string, string> = { sell: 'ПРОДАТИ', deposit: 'НА СКЛАД', in: 'ВХІД', out: 'ВИХІД', forge: 'КУЗНЯ', bell: 'НІЧ', fuel: 'ПАЛИВО' };
    const icons: Record<string, string> = { sell: '🪙', deposit: '📦', in: '⬇️', out: '⬆️', forge: '🔨', bell: '🔔', fuel: '🔥' };
    const g = this.add.graphics().setDepth(1);
    g.fillStyle(0x2a2140, 0.25).fillRoundedRect(-27, -24, 54, 54, 13);
    g.fillStyle(cols[kind], 0.9).fillRoundedRect(-27, -27, 54, 54, 13);
    g.lineStyle(2, 0x2a2140, 0.7).strokeRoundedRect(-27, -27, 54, 54, 13);
    const icon = this.add.text(0, 0, icons[kind], { fontSize: '20px' }).setOrigin(0.5).setDepth(1);
    const lbl = this.add.text(0, 0, labels[kind], { fontFamily: FONT, fontSize: '9px', fontStyle: '900', color: INK }).setOrigin(0.5).setDepth(1).setResolution(TEX);
    return [g, icon, lbl];
  }
  mkText(x: number, y: number, s: string, size: number, color: string, style: 'stroke' | 'box' | 'bubble' = 'stroke'): Txt {
    const t = this.add.text(x, y, s, { fontFamily: FONT, fontSize: size + 'px', fontStyle: '800', color, align: 'center', stroke: style === 'stroke' ? INK : undefined, strokeThickness: style === 'stroke' ? 4 : 0 }).setOrigin(0.5);
    if (style === 'box') t.setBackgroundColor('rgba(42,33,64,.82)').setPadding(7, 2, 7, 2);
    if (style === 'bubble') t.setBackgroundColor('#fff8ea').setPadding(6, 3, 6, 3);
    return t.setResolution(TEX);
  }

  // ---------------------------------------------------------------- build mode visuals
  updateBuildUi() {
    const st = this.hooks.build(), w = this.w;
    this.ghostG.clear(); this.selG.clear();
    if (!st.active) { this.ghostImg.setVisible(false); return; }
    const R = townR(w);
    this.ghostG.lineStyle(3, 0xffcf4a, 0.5).strokeCircle(TC.x, TC.y, R);
    this.ghostG.lineStyle(2, 0xff8fa3, 0.3).strokeCircle(TC.x, TC.y, R + 260);
    if (st.selected) { const b = w.buildings[st.selected]; if (b) this.selG.lineStyle(3, 0x8fe3c0, 0.9).strokeEllipse(b.x, b.y, (BUILD[b.type].r + 14) * 2, (BUILD[b.type].r + 14) * 1.1); }
    const g = st.ghost;
    if (!g) { this.ghostImg.setVisible(false); return; }
    const def = BUILD[g.type], r = def.r;
    this.ghostG.fillStyle(g.ok ? 0x8fe3c0 : 0xff5470, 0.28).fillEllipse(g.x, g.y, r * 2.4, r * 1.3);
    this.ghostG.lineStyle(2, g.ok ? 0x8fe3c0 : 0xff5470, 0.9).strokeEllipse(g.x, g.y, r * 2.4, r * 1.3);
    if (def.fuel) this.ghostG.lineStyle(1.5, 0xffcf4a, 0.5).strokeCircle(g.x, g.y, def.fuel.radius);
    if (g.type === 'tower') this.ghostG.lineStyle(1.5, 0xff8fa3, 0.5).strokeCircle(g.x, g.y, 190);
    const key = g.moving ? this.keyFor(w.buildings[g.moving]) : this.keyFor({ type: g.type, level: 1, site: null, fuel: 1, hp: 1 } as any);
    setArt(this.ghostImg, key in ART ? key : 'site');
    this.ghostImg.setVisible(true).setPosition(g.x, g.y).setAlpha(0.65 + Math.sin(this.elapsed * 6) * 0.1).setTint(g.ok ? 0xffffff : 0xff8a8a);
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
        setArt(im, 'it_' + e.item); im.setVisible(true).setDepth(5000).setAlpha(1).setScale(1 / TEX).clearTint().setBlendMode(Phaser.BlendModes.NORMAL);
        this.flyers.push({ img: im, fx: e.fx, fy: e.fy, fz: e.fz, to, t: 0, dur: 0.3 + Math.random() * 0.06, h: 50, owner });
        break;
      }
      case 'chop': case 'mine':
        if (!near(e.x, e.y)) break;
        if (e.t === 'mine') { this.burst(e.x, e.y - 20, 5, 0xc9c5d8, 'fx_chip', 120, 0.5, 0.45, 400); this.burst(e.x, e.y - 24, 2, 0xffffff, 'fx_star', 80, 0.3, 0.3, 200); }
        else { this.burst(e.x, e.y - 12, 4, 0xc98a55, 'fx_chip', 110, 0.5, 0.4, 400); if (e.kind !== 'repair') this.burst(e.x, e.y - 60, 3, 0x6fbf73, 'fx_leaf', 60, 1, 0.5, 80, true); }
        if (e.kind === 'hero') sfx(e.t === 'mine' ? 'hit' : 'chop'); else if (e.kind === 'repair') sfx('drop');
        break;
      case 'fell': {
        if (!near(e.x, e.y)) break;
        if (e.kind === 'oak' || e.kind === 'pine' || e.kind === 'lav') {
          const fi = img(this, 'tr_' + e.kind + '_c', e.x, e.y - 30).setDepth(10 + e.y);
          this.falls.push({ img: fi, t: 0, dir: w.hero.x < e.x ? 1 : -1 });
        } else this.burst(e.x, e.y - 12, 10, e.kind === 'rock' ? 0xb3aec9 : 0x6fbf73, e.kind === 'rock' ? 'fx_chip' : 'fx_leaf', 120, 0.7, 0.6, 300);
        if (dist(w.hero.x, w.hero.y, e.x, e.y) < 120) { sfx('fall'); this.shakeAmt = Math.max(this.shakeAmt, 2); }
        break;
      }
      case 'hit': this.burst(e.x, e.y, 5, 0xc7a6ff, 'fx_dot', 140, 0.5, 0.5, 200, true); this.floatText(e.x, e.y - 18, '-' + Math.round((e.v || 0) * 10) / 10, '#ffd1dc', 14); sfx('hit'); break;
      case 'poof': this.burst(e.x, e.y, e.kind === 'boss' ? 70 : 18, e.kind === 'light' ? 0xffc35a : 0xb9a3e8, 'fx_dot', e.kind === 'boss' ? 320 : 200, 0.9, 0.9, 120, true); this.burst(e.x, e.y, 8, 0xffcf4a, 'fx_star', 160, 0.8, 0.6, 200); sfx('poof'); if (e.kind === 'boss') this.shakeAmt = 12; break;
      case 'placed': this.burst(e.x, e.y, 10, 0xe1cfa9, 'fx_puff', 90, 0.6, 0.6, 0); sfx('drop'); break;
      case 'build': case 'upgrade':
        this.burst(e.x, e.y, e.t === 'build' ? 36 : 20, 0xffcf4a, 'fx_star', 220, 1, 0.7, 300); this.burst(e.x, e.y, 16, 0xe9667a, 'fx_dot', 200, 1, 0.5, 300); this.burst(e.x, e.y, 8, 0xffffff, 'fx_puff', 120, 0.8, 1.2, 0);
        sfx(e.t === 'build' ? 'build' : 'upg'); this.shakeAmt = Math.max(this.shakeAmt, e.t === 'build' ? 4 : 2); break;
      case 'hurt': this.burst(e.x, e.y, 8, 0xff8fa3, 'fx_dot', 150, 0.5, 0.5, 300); sfx('hurt'); if (e.kind !== 'unit') this.shakeAmt = Math.max(this.shakeAmt, 5); break;
      case 'slam': this.burst(e.x, e.y, 30, 0x9d8cc4, 'fx_puff', 280, 0.8, 1, 0); this.ring(e.x, e.y); sfx('slam'); this.shakeAmt = 12; break;
      case 'coin': this.floatText(e.x, e.y, '+' + e.v, '#ffcf4a', 16 + Math.min(16, (e.v || 1))); sfx('coin'); break;
      case 'pick': sfx('pick'); break;
      case 'drop': sfx('drop'); break;
      case 'pay': sfx('pay'); break;
      case 'shot': if (near(e.x, e.y)) sfx('shot'); break;
      case 'wallHit': if (near(e.x, e.y)) { this.burst(e.x, e.y - 20, 4, 0xc98a55, 'fx_chip', 120, 0.5, 0.4, 300); sfx('wall'); } break;
      case 'lightOut': this.puff(e.x, e.y - 20, 0x8a86a0); this.puff(e.x + 6, e.y - 26, 0x8a86a0); break;
      case 'text': this.floatText(e.x, e.y, e.s, e.color || '#fff4e0', e.size || 16); break;
      case 'bubble': {
        const who = e.who;
        const at = who === 'owl' ? (w.buildings.shop ? { x: w.buildings.shop.x, y: w.buildings.shop.y - 130 } : null) : (() => { const c = w.cats.find(x => x.id === who) || w.units.find(x => x.id === who); return c ? { x: c.x, y: c.y - 66 } : null; })();
        if (at) this.texts.push({ t: this.mkText(at.x, at.y, e.s, 13, INK, 'bubble').setDepth(8000), vy: 0, life: 2.2 });
        if (who !== 'owl') sfx('meow');
        break;
      }
      case 'bossIn': this.shakeAmt = 8; break;
    }
    this.hooks.onEvent(e);
  }
  stackTop(e: { x: number; y: number; face: number; stack: ItemId[] }, isHero: boolean) {
    let h = 0; for (const it of e.stack) h += ITEMS[it].h;
    return { x: e.x - e.face * (isHero ? 9 : 7), y: e.y, z: (isHero ? 34 : 24) + h };
  }
  burst(x: number, y: number, n: number, color: number, key: string, spd: number, life: number, size: number, grav: number, drag = false) {
    for (let i = 0; i < n; i++) {
      if (this.parts.length > 450) break;
      const a = Math.random() * TAU, s = (0.3 + Math.random() * 0.7) * spd;
      const im = this.pool.pop() || img(this, key);
      setArt(im, key); im.setVisible(true).setTint(color).setDepth(5001).setAlpha(1).setScale(size * (0.6 + Math.random() * 0.7) / TEX * 2).setBlendMode(Phaser.BlendModes.NORMAL);
      this.parts.push({ img: im, x, y, z: 5 + Math.random() * 20, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, vz: 80 + Math.random() * 140, life, max: life, grav, spin: (Math.random() - 0.5) * 16, drag, grow: 0, alpha: 1 });
    }
  }
  puff(x: number, y: number, color: number) {
    if (this.parts.length > 450) return;
    const im = this.pool.pop() || img(this, 'fx_puff');
    setArt(im, 'fx_puff'); im.setVisible(true).setTint(color).setDepth(5002).setAlpha(0.6).setScale(0.5 / TEX).setBlendMode(Phaser.BlendModes.NORMAL);
    this.parts.push({ img: im, x, y, z: 0, vx: 8 + Math.random() * 10, vy: 0, vz: 22 + Math.random() * 10, life: 2.4, max: 2.4, grav: 0, spin: 0, drag: false, grow: 0.9, alpha: 0.6 });
  }
  ring(x: number, y: number) { const r = img(this, 'fx_ring', x, y).setDepth(3); this.tweens.add({ targets: r, scale: 4 / TEX, alpha: 0, duration: 700, onComplete: () => r.destroy() }); }
  floatText(x: number, y: number, s: string, color: string, size: number) { const t = this.mkText(x, y, s, size, color).setDepth(8000); t.setScale(0.4); this.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.Out' }); this.texts.push({ t, vy: -45, life: 1 }); }

  updateFx(dt: number) {
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i]; f.t += dt / f.dur;
      const to = f.to(), k = Math.min(1, f.t), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const x = f.fx + (to.x - f.fx) * e, y = f.fy + (to.y - f.fy) * e, z = f.fz + (to.z - f.fz) * e + Math.sin(k * Math.PI) * f.h;
      f.img.setPosition(x, y - z).setRotation(k * 6).setScale((1 + Math.sin(k * Math.PI) * 0.25) / TEX);
      if (f.t >= 1) { f.img.setVisible(false); this.pool.push(f.img); if (f.owner) this.pending[f.owner] = Math.max(0, (this.pending[f.owner] || 0) - 1); this.flyers.splice(i, 1); }
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]; p.life -= dt;
      if (p.life <= 0) { p.img.setVisible(false).clearTint(); this.pool.push(p.img); this.parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vz -= p.grav * dt; p.z += p.vz * dt;
      if (p.drag) { p.vx *= 0.98; p.vz = Math.max(p.vz, -40); }
      if (p.z < 0 && p.grav > 0) { p.z = 0; p.vz *= -0.3; p.vx *= 0.6; p.vy *= 0.6; }
      if (p.grow) p.img.setScale(p.img.scaleX + p.grow * dt / TEX);
      p.img.setPosition(p.x, p.y - p.z).setRotation(p.img.rotation + p.spin * dt).setAlpha(Math.min(p.alpha, p.life / p.max * 2 * p.alpha));
    }
    for (let i = this.texts.length - 1; i >= 0; i--) { const t = this.texts[i]; t.life -= dt; if (t.life <= 0) { t.t.destroy(); this.texts.splice(i, 1); continue; } t.t.y += t.vy * dt; t.t.setAlpha(Math.min(1, t.life * 3)); }
    for (let i = this.falls.length - 1; i >= 0; i--) {
      const f = this.falls[i]; f.t += dt; const k = Math.min(1, f.t / 0.55);
      f.img.rotation = f.dir * k * k * 1.5; f.img.y += dt * 60 * k; f.img.setAlpha(1 - Math.max(0, (f.t - 0.5) / 0.4));
      if (f.t > 0.52 && f.t - dt <= 0.52) this.burst(f.img.x + f.dir * 40, f.img.y + 30, 8, 0xe1cfa9, 'fx_puff', 80, 0.6, 0.6, 0);
      if (f.t > 0.9) { f.img.destroy(); this.falls.splice(i, 1); }
    }
  }
  ambient(dt: number) {
    const w = this.w, v = this.cameras.main.worldView, dark = w.clock.dark;
    if (dark > 0.25 && Math.random() < dt * 5) { const x = v.x + Math.random() * v.width, y = v.y + Math.random() * v.height; this.burst(x, y, 1, 0xf7ff9e, 'fx_dot', 12, 3, 0.25, 0, true); }
    if (dark < 0.4 && Math.random() < dt * 2) { const x = v.x + Math.random() * v.width, y = v.y + Math.random() * v.height; if (x < EDGE.x + EDGE.w + 100) this.burst(x, y - 60, 1, 0x7fc47c, 'fx_leaf', 30, 2.5, 0.45, 15, true); }
    if (Math.random() < dt * 3) { const x = v.x + Math.random() * v.width, y = v.y + Math.random() * v.height; if (x > WILDS.x) { this.puff(x, y, 0xffffff); } }
  }
  updateCamera(dt: number) {
    const cam = this.cameras.main, h = this.w.hero;
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 18);
    if (!this.camFollow) { if (this.shakeAmt > 0) cam.centerOn(cam.midPoint.x + (Math.random() - 0.5) * this.shakeAmt, cam.midPoint.y); return; }
    const tx = h.x + h.vx * 0.25, ty = h.y - 20 + h.vy * 0.2;
    const cx = cam.midPoint.x + (tx - cam.midPoint.x) * Math.min(1, dt * 5), cy = cam.midPoint.y + (ty - cam.midPoint.y) * Math.min(1, dt * 5);
    cam.centerOn(cx + (Math.random() - 0.5) * this.shakeAmt, cy + (Math.random() - 0.5) * this.shakeAmt);
  }
  updateLight() {
    const w = this.w, v = this.cameras.main.worldView;
    const dark = w.clock.dark * 0.6;
    this.vignette.setPosition(v.centerX, v.centerY).setDisplaySize(v.width * 1.05, v.height * 1.05).setAlpha(0.55 + dark * 0.6);
    const dusk = w.clock.phase === 'dusk' ? Math.sin(Math.min(1, w.clock.t / 25) * Math.PI) * 0.18 : 0;
    this.tint.setPosition(v.centerX, v.centerY).setSize(v.width, v.height).setOrigin(0.5).setFillStyle(0xff7a3c, dusk);
    const lit = Object.values(w.buildings).filter(b => lightRadius(b) > 0);
    while (this.glows.length < lit.length + 2) this.glows.push(img(this, 'fx_glow').setTint(0xffbe5a).setBlendMode(Phaser.BlendModes.ADD).setDepth(6999));
    this.glows.forEach((g, i) => { const b = lit[i]; if (!b || dark < 0.02) { g.setVisible(false); return; } const big = lightRadius(b) / 60; g.setVisible(true).setPosition(b.x, b.y - (b.type === 'lantern' ? 70 : 12)).setScale(big * (0.95 + Math.sin(this.elapsed * 8 + i) * 0.04) / TEX).setAlpha(dark * 0.75); });
    if (dark < 0.02) { this.lightImg.setVisible(false); return; }
    const c = this.light.getContext(), lw = this.light.width, lh = this.light.height;
    c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, lw, lh);
    c.fillStyle = `rgba(20,12,52,${dark})`; c.fillRect(0, 0, lw, lh);
    c.globalCompositeOperation = 'destination-out';
    const L: [number, number, number][] = lit.map(b => [b.x, b.y - 30, lightRadius(b) + Math.sin(this.elapsed * 7 + b.x) * 4]);
    L.push([w.hero.x, w.hero.y - 20, 110]);
    for (const b of Object.values(w.buildings)) if (!b.site && (b.type === 'forge' || b.type === 'candleShop' || b.type.startsWith('house') || b.type === 'hall' || b.type === 'barracks')) L.push([b.x, b.y - 30, 70]);
    for (const [x, y, r] of L) {
      const sx = (x - v.x) / v.width * lw, sy = (y - v.y) / v.height * lh, sr = r / v.width * lw;
      if (sx < -sr || sy < -sr || sx > lw + sr || sy > lh + sr) continue;
      const g = c.createRadialGradient(sx, sy, sr * 0.2, sx, sy, sr); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
    }
    this.light.refresh();
    this.lightImg.setVisible(true).setPosition(v.centerX, v.centerY).setDisplaySize(v.width, v.height);
  }
}
export { fuelNeed };
