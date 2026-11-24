// Procedural art drawn once into textures: dark gothic palette, ink outlines and engraving-style hatching.
import Phaser from 'phaser';
import type { ItemId } from '../content/data';

export const TEX = 3;
export const INK = '#120f0d';
const TAU = Math.PI * 2;
export interface ArtMeta { w: number; h: number; ox: number; oy: number; atlas: string }
export const ART: Record<string, ArtMeta> = {};
type C = CanvasRenderingContext2D;

// Every texture is drawn to its own canvas, then all of them are packed into shared atlases.
// One texture for nearly every sprite keeps WebGL batches big and avoids texture-unit mix-ups.
const pending: { key: string; cv: HTMLCanvasElement; meta: Omit<ArtMeta, 'atlas'> }[] = [];
function make(_scene: Phaser.Scene, key: string, w: number, h: number, ox: number, oy: number, draw: (c: C) => void) {
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w * TEX); cv.height = Math.ceil(h * TEX);
  const c = cv.getContext('2d')!;
  c.scale(TEX, TEX); c.translate(ox, oy);
  c.lineJoin = 'round'; c.lineCap = 'round'; c.lineWidth = 1.7;
  draw(c);
  if (key === 'grass_tile') { if (_scene.textures.exists(key)) _scene.textures.remove(key); _scene.textures.addCanvas(key, cv); return; } // tiles need their own texture to wrap
  pending.push({ key, cv, meta: { w, h, ox, oy } });
}
function packAtlases(scene: Phaser.Scene) {
  const SIZE = 2048, PAD = 2;
  pending.sort((a, b) => b.cv.height - a.cv.height);
  let n = 0, atlas: HTMLCanvasElement | null = null, ctx: CanvasRenderingContext2D | null = null, x = 0, y = 0, rowH = 0;
  const placed: { key: string; atlas: string; x: number; y: number; w: number; h: number }[] = [];
  const open = () => { atlas = document.createElement('canvas'); atlas.width = SIZE; atlas.height = SIZE; ctx = atlas.getContext('2d')!; x = 0; y = 0; rowH = 0; };
  const close = () => { if (!atlas) return; const k = 'atlas' + n++; if (scene.textures.exists(k)) scene.textures.remove(k); scene.textures.addCanvas(k, atlas); return k; };
  const batches: { atlasKey: string; items: typeof placed }[] = [];
  let cur: typeof placed = [];
  open();
  for (const p of pending) {
    const w = p.cv.width, h = p.cv.height;
    if (x + w > SIZE) { x = 0; y += rowH + PAD; rowH = 0; }
    if (y + h > SIZE) { batches.push({ atlasKey: close()!, items: cur }); cur = []; open(); }
    ctx!.drawImage(p.cv, x, y);
    cur.push({ key: p.key, atlas: '', x, y, w, h });
    ART[p.key] = { ...p.meta, atlas: '' };
    x += w + PAD; rowH = Math.max(rowH, h);
  }
  batches.push({ atlasKey: close()!, items: cur });
  for (const bt of batches) {
    const tex = scene.textures.get(bt.atlasKey);
    for (const it of bt.items) { tex.add(it.key, 0, it.x, it.y, it.w, it.h); ART[it.key].atlas = bt.atlasKey; }
  }
  pending.length = 0;
}
export function img(scene: Phaser.Scene, key: string, x = 0, y = 0): Phaser.GameObjects.Image {
  const m = ART[key];
  const i = scene.add.image(x, y, m.atlas, key);
  i.setOrigin(m.ox / m.w, m.oy / m.h).setScale(1 / TEX);
  return i;
}
export function setArt(i: Phaser.GameObjects.Image, key: string) {
  if (i.frame.name === key) return;
  const m = ART[key]; i.setTexture(m.atlas, key); i.setOrigin(m.ox / m.w, m.oy / m.h);
}

// ---------------------------------------------------------------- palette (dark gothic)
// charcoal #1a1714 · stone #3b3a36 · cinnabar #7d2a22 · old gold #b08a3e · parchment #c9bfa8
export const PAL = { coal: '#1a1714', stone: '#3b3a36', cin: '#7d2a22', gold: '#b08a3e', parch: '#c9bfa8', ember: '#e0913a', moss: '#3d4a36' };

// ---------------------------------------------------------------- colour + primitives
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (amt < 0) { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; } else { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  return '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}
const INKC = '#120f0d';
function paint(c: C, fill: string, stroke = true) { c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = INKC; c.stroke(); } }
function circ(c: C, x: number, y: number, r: number, fill: string, stroke = true) { c.beginPath(); c.arc(x, y, r, 0, TAU); paint(c, fill, stroke); }
function ell(c: C, x: number, y: number, rx: number, ry: number, fill: string, stroke = true, rot = 0) { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, TAU); paint(c, fill, stroke); }
function poly(c: C, pts: number[], fill: string, stroke = true) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); paint(c, fill, stroke); }
function rr(c: C, x: number, y: number, w: number, h: number, r: number | number[], fill: string, stroke = true) { c.beginPath(); c.roundRect(x, y, w, h, r); paint(c, fill, stroke); }
function shadow(c: C, x: number, y: number, rx: number, ry: number, a = 0.4) { c.beginPath(); c.ellipse(x + rx * 0.15, y + ry * 0.2, rx, ry, 0, 0, TAU); c.fillStyle = `rgba(8,6,5,${a})`; c.fill(); }
function rim(c: C, x: number, y: number, rx: number, ry: number, a = 0.1) { c.beginPath(); c.ellipse(x, y, rx, ry, -0.5, 0, TAU); c.fillStyle = `rgba(230,210,170,${a})`; c.fill(); }
function line(c: C, pts: number[], col: string, wdt = 1.4) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.strokeStyle = col; c.lineWidth = wdt; c.stroke(); c.lineWidth = 1.8; }
/** Engraving-style diagonal hatching inside the current path's bounding box. */
function hatch(c: C, x: number, y: number, w: number, h: number, col = 'rgba(10,8,6,.35)', step = 3.2) {
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.strokeStyle = col; c.lineWidth = 0.8;
  for (let i = -h; i < w; i += step) { c.beginPath(); c.moveTo(x + i, y + h); c.lineTo(x + i + h, y); c.stroke(); }
  c.restore(); c.lineWidth = 1.8;
}
function hatchPoly(c: C, pts: number[], col = 'rgba(10,8,6,.35)', step = 3.2) {
  c.save(); c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); c.clip();
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (let i = 0; i < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]); }
  c.strokeStyle = col; c.lineWidth = 0.8; const h = y1 - y0;
  for (let i = -h; i < x1 - x0; i += step) { c.beginPath(); c.moveTo(x0 + i, y1); c.lineTo(x0 + i + h, y0); c.stroke(); }
  c.restore(); c.lineWidth = 1.8;
}
function lancet(c: C, x: number, y: number, w: number, h: number, lit = true) {
  const p = () => { c.beginPath(); c.moveTo(x - w / 2, y); c.lineTo(x - w / 2, y - h * 0.6); c.quadraticCurveTo(x - w / 2, y - h * 0.92, x, y - h); c.quadraticCurveTo(x + w / 2, y - h * 0.92, x + w / 2, y - h * 0.6); c.lineTo(x + w / 2, y); c.closePath(); };
  p(); paint(c, '#1e1915');
  c.save(); c.translate(x, y - h * 0.5); c.scale(0.72, 0.8); c.translate(-x, -(y - h * 0.5)); p(); c.fillStyle = lit ? '#d9963c' : '#2a2420'; c.fill(); c.restore();
  line(c, [x, y - 1, x, y - h * 0.88], '#1e1915', 1.1);
}

/** A 3/4-view gothic house: front wall, darker hatched side wall, steep roof. */
function house(c: C, o: { w: number; h: number; d: number; roofH: number; wall: string; roof: string; timber?: boolean; stone?: boolean; door?: boolean; windows?: number; chimney?: boolean }) {
  const { w, h, d } = o, roofH = o.roofH * 1.35, hw = w / 2, dx = d, dy = -d * 0.5;
  const side = [hw, 0, hw + dx, dy, hw + dx, dy - h, hw, -h];
  poly(c, side, shade(o.wall, -0.35)); hatchPoly(c, side);
  rr(c, -hw, -h, w, h, 0.5, o.wall);
  if (o.stone) for (let y = -h + 7, row = 0; y < -2; y += 7, row++) for (let x = -hw + (row % 2) * 6; x < hw - 3; x += 12) { c.beginPath(); c.rect(x + 1, y - 6, 10, 5.5); c.strokeStyle = shade(o.wall, -0.3); c.lineWidth = 0.8; c.stroke(); }
  if (o.timber) { const tc = '#231b15'; line(c, [-hw + 1, -h + 3, hw - 1, -h + 3], tc, 2.4); line(c, [-hw + 1, -h * 0.5, hw - 1, -h * 0.5], tc, 2); for (const x of [-hw + 2, -hw * 0.33, hw * 0.33, hw - 2]) line(c, [x, -h + 2, x, -1], tc, 2.2); line(c, [-hw + 2, -h * 0.5, -hw * 0.33, -h + 3], tc, 1.6); line(c, [hw - 2, -h * 0.5, hw * 0.33, -h + 3], tc, 1.6); }
  c.lineWidth = 1.8;
  const roofSide = [0, -h - roofH, dx, dy - h - roofH, hw + 4 + dx, dy - h + 2, hw + 4, -h + 2];
  poly(c, roofSide, shade(o.roof, -0.3)); hatchPoly(c, roofSide, 'rgba(10,8,6,.4)', 2.6);
  poly(c, [-hw - 4, -h + 2, 0, -h - roofH, hw + 4, -h + 2], o.roof);
  for (let i = 1; i < 6; i++) { const t = i / 6; line(c, [-hw - 4 + (hw + 4) * t, -h + 2 - roofH * t, hw + 4 - (hw + 4) * t, -h + 2 - roofH * t], shade(o.roof, -0.25), 0.9); }
  rim(c, -hw * 0.4, -h - roofH * 0.4, hw * 0.25, roofH * 0.1, 0.07);
  if (o.chimney) { rr(c, hw * 0.25 + dx * 0.5, -h - roofH * 0.85 + dy * 0.5, 8, roofH * 0.5, 0.5, '#3b3a36'); rr(c, hw * 0.25 + dx * 0.5 - 1, -h - roofH * 0.9 + dy * 0.5, 10, 3, 0.5, '#2b2a27'); }
  if (o.door) { c.beginPath(); c.moveTo(-7, 0); c.lineTo(-7, -13); c.quadraticCurveTo(-7, -20, 0, -21); c.quadraticCurveTo(7, -20, 7, -13); c.lineTo(7, 0); c.closePath(); paint(c, '#2a1d15'); line(c, [-4, -2, -4, -15], '#16100c', 1); line(c, [3, -2, 3, -15], '#16100c', 1); circ(c, 4.5, -9, 0.9, PAL.gold, false); }
  const nw = o.windows || 0;
  for (let i = 0; i < nw; i++) { const x = nw === 1 ? (o.door ? hw * 0.6 : 0) : -hw * 0.6 + (hw * 1.2) * (i / (nw - 1)); if (o.door && Math.abs(x) < 12) continue; lancet(c, x, -h * 0.3, 7, 15); }
}

// ---------------------------------------------------------------- items (muted)
export function drawItem(c: C, type: ItemId | 'coin', s = 1) {
  c.save(); c.scale(s, s); c.lineWidth = 1.3;
  switch (type) {
    case 'log': case 'lav': rr(c, -12, -5, 22, 10, 4, type === 'lav' ? '#5c4a72' : '#5e3e28'); ell(c, 10, 0, 4, 5, type === 'lav' ? '#a796bf' : '#b99a72'); ell(c, 10, 0, 1.6, 2.2, type === 'lav' ? '#7c6a96' : '#8a6a48', false); break;
    case 'plank': rr(c, -13, -3.5, 26, 7, 1, '#a88a62'); line(c, [-9, 0, 9, 0], '#7d6444', 0.9); break;
    case 'stone': poly(c, [-9, 3, -7, -4, 0, -6, 8, -3, 9, 3, 2, 6], '#6e6a64'); poly(c, [-7, -4, 0, -6, 2, -1, -4, 0], '#8a857c', false); break;
    case 'berry': for (const [x, y] of [[-4, 1], [3, 1], [0, -4], [-1, 4], [5, -3]]) circ(c, x, y, 3.3, '#3b2f5a'); circ(c, -1, -4, 0.9, '#a49ac0', false); line(c, [0, -7, 3, -10], '#3d4a36', 1.6); break;
    case 'meat': line(c, [2, 0, 12, -3], INKC, 1.6); circ(c, 13, -4.5, 2.4, '#d8ccb4'); circ(c, 14, -1.8, 2.4, '#d8ccb4'); ell(c, -3, 0, 9, 7, '#8a3a2e'); ell(c, -5, -2, 4, 2.5, '#a8584a', false); break;
    case 'candle': rr(c, -3.5, -7, 7, 14, 1, '#d6c9a8'); ell(c, 0, -10, 2.2, 3.2, PAL.ember, false); ell(c, 0, -9.5, 1, 1.6, '#f2d48a', false); break;
    case 'fluff': for (const [x, y, r] of [[-5, 1, 6], [4, 1, 6], [0, -3, 6.5]]) circ(c, x, y, r, '#6f6680'); circ(c, -1, -4, 1.6, '#9a91a8', false); break;
    case 'coin': circ(c, 0, 0, 6, PAL.gold); circ(c, 0, 0, 3.6, '#8a6a2a', false); line(c, [-1.5, -2, 1.5, -2], '#d8b86a', 1); break;
  }
  c.restore();
}

// ---------------------------------------------------------------- hero: tall hunter, tricorne, long cloak, face in shadow
function heroBody(c: C, blink: boolean) {
  // long cloak, flared to the ankles
  c.beginPath(); c.moveTo(-9, -54); c.quadraticCurveTo(-17, -30, -16, -6); c.lineTo(-6, -3); c.lineTo(0, -6); c.lineTo(6, -3); c.lineTo(16, -6); c.quadraticCurveTo(17, -30, 9, -54); c.closePath(); paint(c, '#2a2522');
  hatchPoly(c, [4, -54, 9, -54, 17, -30, 16, -6, 6, -3, 4, -20], 'rgba(5,4,3,.45)', 2.6);
  // coat front with buttons and belt
  c.beginPath(); c.moveTo(-6, -54); c.lineTo(-7, -10); c.lineTo(7, -10); c.lineTo(6, -54); c.closePath(); paint(c, '#3b3430');
  c.fillStyle = PAL.gold; for (const y of [-46, -40, -34]) { c.beginPath(); c.arc(2, y, 1.1, 0, TAU); c.fill(); }
  rr(c, -7.5, -28, 15, 3, 0.5, '#1e1a17'); rr(c, -1.5, -28.5, 3, 4, 0.5, PAL.gold, false);
  circ(c, -10, -24, 2.6, '#c9883a'); circ(c, -10, -24, 1.2, '#f0c070', false); // belt lantern
  // collar and mask
  poly(c, [-9, -54, 0, -50, 9, -54, 7, -60, -7, -60], '#2a2522');
  const hy = -64;
  ell(c, 0, hy, 8.5, 9, '#c8b8a2');
  ell(c, 0, hy + 1, 8.6, 9.2, 'rgba(14,11,9,.82)', false); // face in shadow
  rr(c, -7, hy + 2, 14, 7, [1, 1, 4, 4], '#6b2a22'); line(c, [-6, hy + 5, 6, hy + 5], '#4e1e18', 0.8); // mask
  if (!blink) for (const ex of [-3, 3.5]) { ell(c, ex, hy - 1, 1.5, 0.8, '#d9b25a', false); }
  // tricorne
  c.beginPath(); c.moveTo(-17, hy - 6); c.quadraticCurveTo(-9, hy - 3, 0, hy - 7); c.quadraticCurveTo(9, hy - 3, 17, hy - 6); c.lineTo(11, hy - 10); c.quadraticCurveTo(0, hy - 8, -11, hy - 10); c.closePath(); paint(c, '#1e1a18');
  c.beginPath(); c.moveTo(-9, hy - 9); c.quadraticCurveTo(-9, hy - 20, 0, hy - 21); c.quadraticCurveTo(9, hy - 20, 9, hy - 9); c.closePath(); paint(c, '#1e1a18');
  line(c, [-9, hy - 11, 9, hy - 11], PAL.cin, 1.8);
  line(c, [-15, hy - 6.5, -11, hy - 9.5], PAL.gold, 0.9); line(c, [15, hy - 6.5, 11, hy - 9.5], PAL.gold, 0.9);
}
function heroCape(c: C) { c.beginPath(); c.moveTo(-2, 0); c.quadraticCurveTo(-12, 20, -10, 48); c.lineTo(4, 46); c.quadraticCurveTo(2, 20, 6, 0); c.closePath(); paint(c, '#221e1b'); hatchPoly(c, [-2, 0, -12, 24, -10, 48, -2, 46], 'rgba(5,4,3,.4)', 2.6); }
function heroScarf(c: C) { c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-8, 3, -14, 1); c.lineTo(-13, 6); c.quadraticCurveTo(-6, 7, 2, 4); c.closePath(); paint(c, '#6b2a22'); }
function leg(c: C, col: string, s = 1) { c.save(); c.scale(s, s); rr(c, -3.5, -7, 7, 8, [1, 1, 2, 2], col); c.restore(); }
function weaponAxe(c: C) {
  line(c, [0, 6, 0, -28], '#3a2618', 3);
  c.beginPath(); c.moveTo(0, -30); c.quadraticCurveTo(14, -32, 14, -16); c.quadraticCurveTo(6, -19, 0, -18); c.closePath(); paint(c, '#8f9399');
  line(c, [2, -28, 12, -18], '#c9ccd0', 0.8);
  c.fillStyle = '#5f6368'; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-1, -28 + i * 3); c.lineTo(-4, -27 + i * 3); c.lineTo(-1, -26 + i * 3); c.fill(); }
}
function weaponSaw(c: C) {
  line(c, [0, 6, 0, -10], '#3a2618', 3);
  rr(c, -3, -40, 10, 32, 1, '#8f9399'); line(c, [-1, -38, -1, -10], '#c9ccd0', 0.8);
  for (let i = 0; i < 8; i++) poly(c, [7, -38 + i * 4, 10, -36 + i * 4, 7, -34 + i * 4], '#5f6368', false);
}

// ---------------------------------------------------------------- lean hooded cats: only the eyes glow
interface Hood { cloak: string; eye: string; trim: string }
function hoodedCat(c: C, h: Hood, blink: boolean, extra?: (c: C) => void) {
  c.beginPath(); c.moveTo(-6, -24); c.quadraticCurveTo(-9, -12, -9, -1); c.lineTo(9, -1); c.quadraticCurveTo(9, -12, 6, -24); c.closePath(); paint(c, h.cloak);
  hatchPoly(c, [2, -24, 6, -24, 9, -12, 9, -1, 3, -1], 'rgba(5,4,3,.4)', 2.4);
  line(c, [0, -22, 0, -2], shade(h.cloak, -0.35), 0.9);
  line(c, [-8, -6, 8, -6], h.trim, 1.2);
  extra?.(c);
  const hy = -32;
  // pointed hood with ears showing through the cloth
  c.beginPath(); c.moveTo(-9, hy + 7); c.quadraticCurveTo(-11, hy - 4, -8, hy - 14); c.lineTo(-4, hy - 7); c.lineTo(4, hy - 7); c.lineTo(8, hy - 14); c.quadraticCurveTo(11, hy - 4, 9, hy + 7); c.closePath(); paint(c, h.cloak);
  ell(c, 0.5, hy + 2, 6.5, 6, '#0d0b09', false);
  for (const ex of [-2.2, 3.4]) {
    if (blink) { line(c, [ex - 1.6, hy + 2, ex + 1.6, hy + 2], h.eye, 1.1); continue; }
    c.beginPath(); c.ellipse(ex, hy + 2, 3.4, 2.6, 0, 0, TAU); c.fillStyle = h.eye.replace(')', ',.18)').replace('rgb', 'rgba'); c.fillStyle = 'rgba(255,190,90,.12)'; c.fill();
    ell(c, ex, hy + 2, 1.7, 1.1, h.eye, false);
  }
}
function catTail(c: C, col: string) { c.lineWidth = 3; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-8, -1, -8, -10); c.quadraticCurveTo(-8, -15, -4, -16); c.strokeStyle = INKC; c.stroke(); c.lineWidth = 1.6; c.strokeStyle = col; c.stroke(); c.lineWidth = 1.8; }

// ---------------------------------------------------------------- beasts: shaggy, ember eyes, no gloss
function beast(c: C, r: number, base: string, belly: string, eye: string, horn: boolean, boss: boolean, white = false, shadeK = false) {
  if (white) base = belly = '#e8e0d0';
  ell(c, -r * 0.45, -2, r * 0.28, r * 0.16, white ? base : '#141110'); ell(c, r * 0.45, -2, r * 0.28, r * 0.16, white ? base : '#141110');
  const cy = -r;
  if (horn || boss) for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * r * 0.35, cy - r * 0.7); c.quadraticCurveTo(s * r * 0.95, cy - r * 1.25, s * r * 0.6, cy - r * 1.6); c.quadraticCurveTo(s * r * 0.55, cy - r * 1.05, s * r * 0.1, cy - r * 0.8); c.closePath(); paint(c, white ? base : '#9a8c74'); }
  else for (const s of [-1, 1]) poly(c, [s * r * 0.3, cy - r * 0.75, s * r * 0.55, cy - r * 1.25, s * r * 0.68, cy - r * 0.62], base);
  c.save(); c.translate(0, cy);
  const n = boss ? 26 : 16;
  c.beginPath();
  for (let i = 0; i <= n * 2; i++) { const a = i / (n * 2) * TAU, r2 = i % 2 ? r * 0.8 : r * (1 + Math.sin(i * 2.3) * 0.07); const x = Math.cos(a) * r2, y = Math.sin(a) * r2 * 0.92; i ? c.lineTo(x, y) : c.moveTo(x, y); }
  c.closePath(); paint(c, base);
  if (!white) { hatch(c, 0, -r, r, r * 1.9, 'rgba(5,4,3,.3)', 2.6); ell(c, r * 0.1, r * 0.35, r * 0.5, r * 0.38, belly, false); }
  if (!white) for (const s of [-1, 1]) {
    const ex = s * r * 0.3 + r * 0.12, ey = -r * 0.15;
    c.beginPath(); c.arc(ex, ey, r * 0.3, 0, TAU); c.fillStyle = 'rgba(224,120,50,.18)'; c.fill();
    c.beginPath(); c.moveTo(ex - r * 0.18, ey); c.quadraticCurveTo(ex, ey - r * 0.16, ex + r * 0.18, ey); c.quadraticCurveTo(ex, ey + r * 0.08, ex - r * 0.18, ey); c.fillStyle = eye; c.fill();
    line(c, [ex - s * r * 0.24, ey - r * 0.3, ex + s * r * 0.16, ey - r * 0.16], '#0d0b09', 1.6);
  }
  if (!white && !shadeK) { c.beginPath(); c.moveTo(r * 0.12 - r * 0.2, r * 0.22); c.lineTo(r * 0.12 + r * 0.2, r * 0.22); c.strokeStyle = '#0d0b09'; c.lineWidth = 1.4; c.stroke(); if (boss) { c.beginPath(); c.arc(0, -r * 0.58, r * 0.12, 0.6, TAU - 0.6); c.fillStyle = '#c9bfa8'; c.fill(); } }
  c.restore();
}

// ---------------------------------------------------------------- trees and nodes
function crownOak(c: C) {
  const base = '#2f4231';
  for (const [x, y, r] of [[-15, -6, 18], [15, -6, 18], [0, -24, 22], [-8, -12, 16], [9, -14, 16]]) circ(c, x, y, r, base);
  for (const [x, y, r] of [[-10, -28, 9], [4, -33, 8], [-18, -13, 6]]) circ(c, x, y, r, '#435a42', false);
  hatch(c, 2, -20, 34, 34, 'rgba(5,6,4,.35)', 2.8);
}
function crownPine(c: C) {
  const cols = ['#1f3029', '#253830', '#2c4036'];
  for (let i = 0; i < 3; i++) { const yy = 4 - i * 19, w = 30 - i * 7; const pts = [-w, yy, 0, yy - 30 + i * 4, w, yy]; c.beginPath(); c.moveTo(-w, yy); c.lineTo(-w * 0.3, yy - 14); c.lineTo(0, yy - 30 + i * 4); c.lineTo(w * 0.3, yy - 14); c.lineTo(w, yy); c.quadraticCurveTo(0, yy + 6, -w, yy); c.closePath(); paint(c, cols[i]); hatchPoly(c, [0, pts[3], w, yy, 0, yy + 4], 'rgba(4,5,4,.4)', 2.6); }
}
function crownLav(c: C) {
  for (const [x, y, r] of [[-16, -4, 19], [16, -4, 19], [0, -26, 24], [-6, -14, 16]]) circ(c, x, y, r, '#3e3550');
  for (const [x, y, r] of [[-10, -29, 9], [6, -35, 7]]) circ(c, x, y, r, '#56496c', false);
  hatch(c, 4, -24, 34, 38, 'rgba(5,4,8,.35)', 2.8);
  for (let i = 0; i < 6; i++) { const a = i * 1.7; circ(c, Math.cos(a) * 15, -16 + Math.sin(a) * 13, 1.3, '#c9b8e0', false); }
}
function trunk(c: C, col: string, h: number) { shadow(c, 0, 2, 26, 8); c.beginPath(); c.moveTo(-6, 0); c.lineTo(-4, -h); c.lineTo(4, -h); c.lineTo(6, 0); c.closePath(); paint(c, col); hatch(c, 0, -h, 6, h, 'rgba(5,4,3,.4)', 2.4); line(c, [-6, -2, -10, 2], col, 2); line(c, [6, -2, 10, 3], col, 2); }

// ---------------------------------------------------------------- glyphs (old gold on iron) for pads and HUD
function glyph(c: C, k: string) {
  c.strokeStyle = PAL.gold; c.fillStyle = PAL.gold; c.lineWidth = 2; c.lineCap = 'round'; c.lineJoin = 'round';
  const L = (pts: number[]) => { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.stroke(); };
  switch (k) {
    case 'sell': c.beginPath(); c.arc(0, 0, 8, 0, TAU); c.stroke(); L([-3, -3, 3, -3]); L([0, -5, 0, 5]); L([-3, 3, 3, 3]); break;
    case 'deposit': c.strokeRect(-8, -6, 16, 13); L([-8, -1, 8, -1]); L([-3, -6, -3, 7]); L([3, -6, 3, 7]); break;
    case 'in': L([0, -9, 0, 7]); L([-6, 1, 0, 7, 6, 1]); L([-8, 10, 8, 10]); break;
    case 'out': L([0, 9, 0, -7]); L([-6, -1, 0, -7, 6, -1]); L([-8, -10, 8, -10]); break;
    case 'forge': L([-7, 8, 5, -4]); c.beginPath(); c.roundRect(1, -10, 10, 5, 1); c.fill(); break;
    case 'bell': c.beginPath(); c.moveTo(-7, 5); c.quadraticCurveTo(-7, -9, 0, -9); c.quadraticCurveTo(7, -9, 7, 5); c.lineTo(9, 7); c.lineTo(-9, 7); c.closePath(); c.stroke(); c.beginPath(); c.arc(0, 9, 1.8, 0, TAU); c.fill(); break;
    case 'fuel': c.beginPath(); c.moveTo(0, -10); c.quadraticCurveTo(8, -2, 6, 5); c.quadraticCurveTo(3, 9, 0, 9); c.quadraticCurveTo(-3, 9, -6, 5); c.quadraticCurveTo(-8, -2, 0, -10); c.stroke(); c.beginPath(); c.moveTo(0, -2); c.quadraticCurveTo(3, 2, 2, 5); c.quadraticCurveTo(0, 7, -2, 5); c.quadraticCurveTo(-3, 2, 0, -2); c.fill(); break;
  }
  c.lineWidth = 1.8;
}
function plate(c: C) {
  c.beginPath(); c.moveTo(-24, -20); c.lineTo(24, -20); c.lineTo(28, -16); c.lineTo(28, 16); c.lineTo(24, 20); c.lineTo(-24, 20); c.lineTo(-28, 16); c.lineTo(-28, -16); c.closePath();
  c.fillStyle = 'rgba(26,23,20,.88)'; c.fill(); c.strokeStyle = '#5a4a32'; c.lineWidth = 1.6; c.stroke();
  c.strokeStyle = 'rgba(176,138,62,.35)'; c.lineWidth = 0.8; c.strokeRect(-23, -15, 46, 30);
  c.fillStyle = '#5a4a32'; for (const [x, y] of [[-24, -16], [24, -16], [-24, 16], [24, 16]]) { c.beginPath(); c.arc(x, y, 1.6, 0, TAU); c.fill(); }
  c.lineWidth = 1.8;
}

export function buildArt(scene: Phaser.Scene) {
  for (const k of ['log', 'lav', 'plank', 'stone', 'berry', 'meat', 'candle', 'fluff', 'coin'] as const) make(scene, 'it_' + k, 34, 26, 16, 13, c => drawItem(c, k));
  for (const k of ['sell', 'deposit', 'in', 'out', 'forge', 'bell', 'fuel']) make(scene, 'g_' + k, 26, 26, 13, 13, c => glyph(c, k));
  make(scene, 'pad_plate', 60, 44, 30, 22, plate);

  // hero
  make(scene, 'hero', 64, 100, 32, 92, c => heroBody(c, false));
  make(scene, 'hero_b', 64, 100, 32, 92, c => heroBody(c, true));
  make(scene, 'hero_cape', 30, 56, 14, 4, heroCape);
  make(scene, 'hero_scarf', 26, 16, 20, 6, heroScarf);
  make(scene, 'hero_leg', 12, 12, 6, 10, c => leg(c, '#1a1614'));
  make(scene, 'w_axe', 30, 44, 6, 38, weaponAxe);
  make(scene, 'w_saw', 24, 52, 8, 46, weaponSaw);

  // hooded cats
  const hoods: Record<string, Hood> = {
    gatherer: { cloak: '#3d4a36', eye: '#e0a24a', trim: '#6b5a3a' },
    miner: { cloak: '#45433f', eye: '#e0913a', trim: '#6e6a64' },
    forager: { cloak: '#4a2e32', eye: '#c9d96a', trim: '#6b4a3a' },
    hauler: { cloak: '#353c47', eye: '#9fd8c0', trim: '#6b5a3a' },
    master: { cloak: '#4a3626', eye: '#e8c060', trim: '#7d2a22' },
    spear: { cloak: '#5a221c', eye: '#f08a5a', trim: '#b08a3e' },
    sling: { cloak: '#33293f', eye: '#c9e07a', trim: '#b08a3e' },
  };
  const extras: Record<string, (c: C) => void> = {
    hauler: c => { rr(c, -12, -20, 6, 12, 1, '#5e3e28'); },
    spear: c => { ell(c, 7, -13, 4.5, 6, '#4a4844'); circ(c, 7, -13, 1.2, PAL.gold, false); },
  };
  for (const [k, h] of Object.entries(hoods)) {
    make(scene, 'cat_' + k, 40, 58, 20, 52, c => hoodedCat(c, h, false, extras[k]));
    make(scene, 'cat_' + k + '_b', 40, 58, 20, 52, c => hoodedCat(c, h, true, extras[k]));
    make(scene, 'cat_' + k + '_tail', 16, 22, 12, 19, c => catTail(c, '#2a2522'));
    make(scene, 'cat_' + k + '_leg', 10, 10, 5, 8, c => leg(c, '#1a1614', 0.7));
  }
  make(scene, 'w_catAxe', 20, 26, 4, 22, c => { line(c, [0, 2, 0, -15], '#3a2618', 2.4); c.beginPath(); c.moveTo(0, -16); c.quadraticCurveTo(9, -17, 8, -9); c.lineTo(0, -10); c.closePath(); paint(c, '#8f9399'); });
  make(scene, 'w_pick', 22, 26, 6, 22, c => { line(c, [0, 2, 0, -15], '#3a2618', 2.4); c.beginPath(); c.moveTo(-6, -13); c.quadraticCurveTo(0, -19, 9, -14); c.lineTo(8, -12); c.quadraticCurveTo(0, -16, -6, -11); c.closePath(); paint(c, '#7a7d82'); });
  make(scene, 'w_basket', 20, 18, 10, 12, c => { rr(c, -7, -8, 14, 9, 2, '#6b5236'); line(c, [-6, -8, 0, -14, 6, -8], '#4a3626', 1.4); circ(c, -3, -8, 2, '#3b2f5a', false); circ(c, 2, -9, 2, '#5a2a30', false); });
  make(scene, 'w_hammer', 20, 26, 4, 22, c => { line(c, [0, 2, 0, -14], '#3a2618', 2.4); rr(c, -5, -19, 12, 6, 1, '#55524f'); });
  make(scene, 'w_spear', 14, 50, 4, 44, c => { line(c, [0, 4, 0, -32], '#3a2618', 2.2); poly(c, [-3, -32, 0, -44, 3, -32], '#8f9399'); line(c, [-2, -30, 2, -30], PAL.cin, 2); });
  make(scene, 'w_sling', 18, 24, 5, 20, c => { line(c, [0, 2, 0, -8], '#3a2618', 2.2); line(c, [0, -8, -4, -16], '#3a2618', 2); line(c, [0, -8, 5, -16], '#3a2618', 2); line(c, [-4, -16, 5, -16], '#6b2a22', 1); });

  // owl, a gaunt moneylender
  make(scene, 'npc_owl', 56, 70, 28, 62, c => {
    c.beginPath(); c.moveTo(-18, 0); c.quadraticCurveTo(-22, -26, -11, -36); c.lineTo(11, -36); c.quadraticCurveTo(22, -26, 18, 0); c.closePath(); paint(c, '#1e1a18');
    hatchPoly(c, [4, -36, 11, -36, 22, -26, 18, 0, 6, 0], 'rgba(0,0,0,.4)', 2.6);
    ell(c, 0, -30, 14, 16, '#4e4237'); ell(c, 0, -24, 8, 9, '#6e6152', false);
    for (const s of [-1, 1]) { circ(c, s * 6, -34, 5.5, '#2a241f'); ell(c, s * 6, -34, 3.2, 2.4, '#d9a441', false); circ(c, s * 6, -34, 1.2, '#120f0d', false); line(c, [s * 1.5, -40, s * 10, -38], '#120f0d', 1.4); }
    c.beginPath(); c.arc(6, -34, 7, 0, TAU); c.strokeStyle = PAL.gold; c.lineWidth = 1.1; c.stroke(); line(c, [12, -31, 14, -18], PAL.gold, 0.8);
    poly(c, [-2, -29, 2, -29, 0, -23], '#8a6a2a');
    ell(c, 0, -45, 14, 3.4, '#141110'); rr(c, -8, -64, 16, 19, 1, '#141110'); line(c, [-8, -50, 8, -50], PAL.cin, 2);
    poly(c, [-12, -12, -4, -14, -2, -6, -11, -5], '#b8ab90');
  });

  // beasts
  make(scene, 'b_fluff', 50, 58, 25, 52, c => beast(c, 17, '#2e2a2c', '#3e3836', '#e0913a', false, false));
  make(scene, 'b_fluff_a', 50, 58, 25, 52, c => beast(c, 17, '#2e2a2c', '#3e3836', '#f05a3a', false, false));
  make(scene, 'b_fluff_w', 50, 58, 25, 52, c => beast(c, 17, '', '', '', false, false, true));
  make(scene, 'b_horn', 64, 86, 32, 78, c => beast(c, 22, '#3a2622', '#4a3430', '#f05a3a', true, false));
  make(scene, 'b_horn_w', 64, 86, 32, 78, c => beast(c, 22, '', '', '', true, false, true));
  make(scene, 'b_shade', 46, 54, 23, 48, c => { c.globalAlpha = 0.85; beast(c, 15, '#0f0d10', '#1a1620', '#9ad8e0', false, false, false, true); });
  make(scene, 'b_shade_w', 46, 54, 23, 48, c => beast(c, 15, '', '', '', false, false, true, true));
  make(scene, 'b_boss', 140, 200, 70, 190, c => { c.lineWidth = 2.4; beast(c, 52, '#2a2226', '#3a3034', '#f05a3a', true, true); });
  make(scene, 'b_boss_w', 140, 200, 70, 190, c => { c.lineWidth = 2.4; beast(c, 52, '', '', '', true, true, true); });

  // trees and nodes
  make(scene, 'tr_oak_t', 64, 40, 32, 36, c => trunk(c, '#3b2a20', 32));
  make(scene, 'tr_pine_t', 60, 36, 30, 32, c => trunk(c, '#33241b', 28));
  make(scene, 'tr_lav_t', 66, 40, 33, 36, c => trunk(c, '#3a2e3a', 32));
  make(scene, 'tr_oak_c', 84, 78, 42, 56, crownOak);
  make(scene, 'tr_pine_c', 70, 82, 35, 66, crownPine);
  make(scene, 'tr_lav_c', 92, 80, 46, 60, crownLav);
  make(scene, 'tr_stump', 30, 20, 15, 12, c => { shadow(c, 0, 2, 12, 5); ell(c, 0, -3, 11, 6, '#3b2a20'); ell(c, 0, -5, 9, 4.5, '#8a7356'); ell(c, 0, -5, 4, 2, '#5e4a36', false); });
  make(scene, 'nd_rock', 64, 56, 32, 46, c => {
    shadow(c, 0, 2, 28, 9);
    const R = [-26, 0, -24, -18, -12, -32, 6, -36, 22, -24, 27, -6, 20, 2];
    poly(c, R, '#4e4c48');
    poly(c, [-12, -32, 6, -36, 22, -24, 4, -18, -14, -20], '#64615b', false);
    hatchPoly(c, [22, -24, 27, -6, 20, 2, 8, -6, 4, -18], 'rgba(5,4,3,.45)', 2.4);
    line(c, [-6, -14, 0, -6, -4, 2], '#2b2a27', 1.1);
    ell(c, -16, -6, 6, 3, '#3d4a36', false);
  });
  make(scene, 'nd_rock_x', 40, 20, 20, 14, c => { for (const [x, y, s] of [[-8, -2, 5], [4, -3, 4], [10, 1, 3]]) poly(c, [x - s, y + 2, x - s * 0.6, y - s, x + s * 0.7, y - s * 0.8, x + s, y + 2], '#4e4c48'); });
  make(scene, 'nd_bush', 50, 40, 25, 34, c => { shadow(c, 0, 0, 20, 6); for (const [x, y, r] of [[-10, -10, 12], [10, -10, 12], [0, -18, 13]]) circ(c, x, y, r, '#2f4231'); hatch(c, 0, -30, 22, 30, 'rgba(5,6,4,.35)', 2.6); for (const [x, y] of [[-10, -14], [6, -20], [12, -9], [-3, -8], [-14, -6], [3, -15]]) circ(c, x, y, 2.2, '#3b2f5a', false); });
  make(scene, 'nd_bush_x', 50, 40, 25, 34, c => { shadow(c, 0, 0, 20, 6); for (const [x, y, r] of [[-10, -10, 12], [10, -10, 12], [0, -18, 13]]) circ(c, x, y, r, '#353f2f'); });
  make(scene, 'tr_bg', 60, 120, 30, 112, c => {
    c.beginPath(); c.moveTo(-26, 0); c.lineTo(-8, -60); c.lineTo(0, -112); c.lineTo(8, -60); c.lineTo(26, 0); c.closePath(); paint(c, '#161c1a');
    c.beginPath(); c.moveTo(-16, -40); c.lineTo(0, -100); c.lineTo(16, -40); c.closePath(); paint(c, '#1c2421');
  });

  // buildings
  make(scene, 'bd_hall1', 160, 170, 72, 156, c => { shadow(c, 8, 4, 72, 16); house(c, { w: 110, h: 58, d: 22, roofH: 40, wall: '#6b5d4f', roof: '#2e2a30', timber: true, door: true, windows: 3, chimney: true }); });
  make(scene, 'bd_hall2', 180, 220, 82, 206, c => { shadow(c, 8, 4, 80, 18); house(c, { w: 124, h: 66, d: 24, roofH: 42, wall: '#5e5a55', roof: '#24252e', stone: true, door: true, windows: 3 }); rr(c, -14, -176, 28, 54, 0.5, '#5e5a55'); hatch(c, 4, -176, 10, 54); poly(c, [-18, -176, 0, -206, 18, -176], '#24252e'); circ(c, 0, -156, 7, '#c9bfa8'); line(c, [0, -156, 0, -161], '#1a1714', 1.2); line(c, [0, -156, 4, -156], '#1a1714', 1.2); });
  make(scene, 'bd_hall3', 210, 260, 98, 244, c => { shadow(c, 10, 4, 92, 20); house(c, { w: 150, h: 78, d: 28, roofH: 48, wall: '#6e6a64', roof: '#1f2029', stone: true, door: true, windows: 5 }); rr(c, -18, -214, 36, 70, 0.5, '#6e6a64'); hatch(c, 6, -214, 12, 70); poly(c, [-24, -214, 0, -250, 24, -214], '#1f2029'); circ(c, 0, -192, 9, '#c9bfa8'); line(c, [0, -250, 0, -258], PAL.gold, 1.6); for (const s of [-1, 1]) { rr(c, s * 62 - 7, -128, 14, 36, 0.5, PAL.cin); line(c, [s * 62, -124, s * 62, -96], PAL.gold, 0.8); } });
  make(scene, 'bd_shop', 130, 140, 62, 126, c => {
    shadow(c, 6, 4, 60, 14);
    rr(c, -52, -66, 104, 66, 0.5, '#2e2524'); poly(c, [52, 0, 66, -7, 66, -73, 52, -66], '#211b1a'); hatchPoly(c, [52, 0, 66, -7, 66, -73, 52, -66]);
    c.fillStyle = '#3e3230'; c.fillRect(-46, -48, 92, 2.5);
    (['log', 'plank', 'stone', 'candle', 'berry'] as const).forEach((k, i) => { c.save(); c.translate(-38 + i * 19, -54); drawItem(c, k, 0.65); c.restore(); });
    rr(c, -58, -22, 116, 22, 0.5, '#4a3626'); line(c, [-54, -12, 54, -12], '#2e2018', 0.9);
    rr(c, -60, -116, 6, 116, 0.5, '#2a1d15'); rr(c, 54, -116, 6, 116, 0.5, '#2a1d15');
    const n = 7, wd = 132 / n;
    for (let i = 0; i < n; i++) { const x0 = -66 + i * wd; c.beginPath(); c.moveTo(x0, -116); c.lineTo(x0 + wd, -116); c.lineTo(x0 + wd, -94); c.lineTo(x0 + wd / 2, -86); c.lineTo(x0, -94); c.closePath(); paint(c, i % 2 ? '#8a7f6a' : '#5a1f1a'); }
    rr(c, -24, -132, 48, 14, 0.5, '#1a1714'); c.fillStyle = PAL.gold; c.font = '600 10px "Cormorant Garamond", Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('ЛАВКА', 0, -125);
  });
  const cottage = (wall: string, roof: string, extra?: (c: C) => void, stone = false) => (c: C) => { shadow(c, 4, 2, 34, 9); house(c, { w: 46, h: 30, d: 12, roofH: 24, wall, roof, timber: !stone, stone, door: true }); extra?.(c); };
  make(scene, 'bd_house_gatherer', 80, 100, 36, 92, cottage('#6b5a45', '#2f3a2f', c => { line(c, [26, 0, 30, -12], '#3a2618', 2); poly(c, [28, -14, 34, -16, 33, -10], '#8f9399'); }));
  make(scene, 'bd_house_quarry', 80, 100, 36, 92, cottage('#5e5a55', '#2e3138', c => { for (const [x, y, r] of [[30, -4, 6], [36, 0, 4]]) poly(c, [x - r, y + 2, x - r * 0.6, y - r, x + r * 0.7, y - r * 0.8, x + r, y + 2], '#4e4c48'); }, true));
  make(scene, 'bd_house_forager', 80, 100, 36, 92, cottage('#6e5a4c', '#3a2226', c => { rr(c, 24, -12, 14, 10, 2, '#6b5236'); for (const [x, y] of [[28, -13], [33, -14], [30, -16]]) circ(c, x, y, 2, '#3b2f5a', false); }));
  make(scene, 'bd_house_hauler', 80, 100, 36, 92, cottage('#5f5850', '#262b35', c => { rr(c, 24, -10, 14, 10, 1, '#5e3e28'); line(c, [24, -5, 38, -5], '#3a2618', 1); }));
  make(scene, 'bd_house_master', 80, 100, 36, 92, c => { shadow(c, 4, 2, 34, 9); house(c, { w: 50, h: 32, d: 12, roofH: 24, wall: '#5a4f45', roof: '#3a2620', stone: true, door: true, chimney: true }); });
  make(scene, 'bd_sawmill', 150, 160, 70, 144, c => { shadow(c, 8, 4, 70, 15); house(c, { w: 104, h: 54, d: 22, roofH: 34, wall: '#5c4632', roof: '#38221e', timber: true, windows: 2 }); rr(c, -16, -40, 32, 40, 0.5, '#211710'); line(c, [-16, -20, 16, -20], '#120c08', 1); });
  make(scene, 'bd_blade', 44, 44, 22, 22, c => { c.beginPath(); for (let i = 0; i < 24; i++) { const a = i / 24 * TAU, r2 = i % 2 ? 15 : 19; c.lineTo(Math.cos(a) * r2, Math.sin(a) * r2); } c.closePath(); paint(c, '#7a7d82'); circ(c, 0, 0, 4, PAL.cin); });
  make(scene, 'bd_storage', 130, 140, 60, 126, c => {
    shadow(c, 6, 4, 60, 14); house(c, { w: 96, h: 50, d: 20, roofH: 36, wall: '#4f4440', roof: '#26222a', timber: true });
    c.beginPath(); c.moveTo(-20, 0); c.lineTo(-20, -28); c.quadraticCurveTo(-20, -42, 0, -44); c.quadraticCurveTo(20, -42, 20, -28); c.lineTo(20, 0); c.closePath(); paint(c, '#241a13');
    line(c, [0, -44, 0, 0], '#120c08', 1.1); line(c, [-20, -22, 20, -22], '#120c08', 1.1);
    c.save(); c.translate(-36, -6); drawItem(c, 'plank', 0.7); c.restore(); c.save(); c.translate(36, -6); drawItem(c, 'stone', 0.7); c.restore();
  });
  make(scene, 'bd_forge', 130, 140, 58, 126, c => {
    shadow(c, 6, 4, 58, 13); house(c, { w: 70, h: 46, d: 18, roofH: 26, wall: '#55524f', roof: '#2b2a2d', stone: true, chimney: true });
    rr(c, -24, -34, 30, 22, 2, '#7a3a1e'); rr(c, -21, -31, 24, 16, 1.5, '#e0913a', false);
    c.beginPath(); c.moveTo(22, -26); c.lineTo(50, -26); c.quadraticCurveTo(56, -26, 58, -21); c.lineTo(46, -19); c.lineTo(42, -9); c.lineTo(48, 0); c.lineTo(26, 0); c.lineTo(30, -9); c.lineTo(27, -19); c.closePath(); paint(c, '#2b2a2d');
  });
  make(scene, 'bd_candleShop', 110, 160, 50, 146, c => { shadow(c, 6, 4, 50, 12); house(c, { w: 70, h: 70, d: 16, roofH: 40, wall: '#6a5c4c', roof: '#331e22', timber: true, door: true, windows: 2, chimney: true }); for (let i = 0; i < 4; i++) { rr(c, -30 + i * 7, -82, 4, 10, 0.5, '#d6c9a8'); ell(c, -28 + i * 7, -85, 1.4, 2.2, PAL.ember, false); } });
  make(scene, 'bd_bell', 70, 130, 32, 122, c => {
    shadow(c, 4, 2, 26, 7);
    rr(c, -26, -96, 6, 96, 0.5, '#2a1d15'); rr(c, 20, -96, 6, 96, 0.5, '#2a1d15');
    poly(c, [-32, -96, 0, -124, 32, -96], '#2e2a30'); hatchPoly(c, [0, -124, 32, -96, 0, -96]);
    c.beginPath(); c.moveTo(-14, -56); c.quadraticCurveTo(-14, -90, 0, -90); c.quadraticCurveTo(14, -90, 14, -56); c.lineTo(18, -50); c.lineTo(-18, -50); c.closePath(); paint(c, '#7a5c26'); hatch(c, 2, -90, 16, 40, 'rgba(10,6,2,.35)');
    circ(c, 0, -48, 3.5, '#2a1d15');
  });
  make(scene, 'bd_tower', 80, 150, 36, 140, c => {
    shadow(c, 4, 3, 30, 8);
    for (const x of [-20, 13]) rr(c, x, -86, 7, 86, 0.5, '#3b2a20');
    line(c, [-18, -10, 19, -60], '#2a1d15', 3); line(c, [19, -10, -18, -60], '#2a1d15', 3);
    rr(c, -28, -100, 56, 16, 0.5, '#4a3626'); poly(c, [28, -84, 36, -88, 36, -104, 28, -100], '#2e2018');
    poly(c, [-32, -100, 0, -136, 32, -100], '#38221e'); poly(c, [0, -136, 8, -140, 40, -104, 32, -100], '#24150f'); hatchPoly(c, [0, -136, 8, -140, 40, -104, 32, -100]);
  });
  make(scene, 'bd_barracks', 170, 150, 78, 136, c => {
    shadow(c, 8, 4, 74, 15); house(c, { w: 120, h: 48, d: 22, roofH: 30, wall: '#5a4a3c', roof: '#3a1a16', stone: true, door: true, windows: 2 });
    for (const s of [-1, 1]) { line(c, [s * 50, -48, s * 50, -110], '#1a1714', 2); poly(c, [s * 50, -110, s * 50 + 18 * s, -104, s * 50 + 12 * s, -100, s * 50 + 18 * s, -96, s * 50, -94], PAL.cin); }
  });
  make(scene, 'bd_post', 40, 90, 12, 84, c => { shadow(c, 0, 0, 12, 4); line(c, [0, 0, 0, -78], '#2a1d15', 3); poly(c, [0, -84, -3, -78, 3, -78], PAL.gold); ell(c, 0, -2, 9, 3, '#3b3a36'); });
  make(scene, 'bd_flag', 30, 22, 0, 4, c => { c.beginPath(); c.moveTo(0, 0); c.lineTo(24, 2); c.lineTo(18, 8); c.lineTo(24, 14); c.lineTo(0, 16); c.closePath(); paint(c, PAL.cin); line(c, [4, 8, 14, 8], PAL.gold, 1); });
  const ring = (rx: number, ry: number, n: number) => (c: C) => { for (let i = 0; i < n; i++) { const a = i / n * TAU; poly(c, [Math.cos(a) * rx - 5, Math.sin(a) * ry - 1, Math.cos(a) * rx - 3, Math.sin(a) * ry - 7, Math.cos(a) * rx + 4, Math.sin(a) * ry - 6, Math.cos(a) * rx + 5, Math.sin(a) * ry], i % 2 ? '#3b3a36' : '#4e4c48'); } };
  make(scene, 'bd_heart', 80, 50, 40, 32, c => { shadow(c, 0, 4, 34, 10); ring(26, 11, 10)(c); line(c, [-14, -4, 14, -12], '#2a1d15', 5); line(c, [-14, -12, 14, -4], '#3b2a20', 5); });
  make(scene, 'bd_bonfire', 60, 40, 30, 26, c => { shadow(c, 0, 3, 24, 7); ring(18, 7, 8)(c); line(c, [-10, -3, 10, -8], '#2a1d15', 4); line(c, [-10, -8, 10, -3], '#3b2a20', 4); });
  make(scene, 'bd_ash', 60, 40, 30, 26, c => { shadow(c, 0, 3, 24, 7); ring(18, 7, 8)(c); ell(c, 0, -4, 10, 4, '#1a1714', false); });
  const lamp = (lit: boolean) => (c: C) => { shadow(c, 0, 2, 10, 4); rr(c, -2.5, -64, 5, 64, 0.5, '#1a1714'); poly(c, [-9, -64, 9, -64, 7, -84, -7, -84], '#2b2a27'); rr(c, -5.5, -81, 11, 15, 0.5, lit ? '#d9963c' : '#3b3a36', false); line(c, [0, -81, 0, -66], '#1a1714', 1); poly(c, [-11, -84, 0, -98, 11, -84], '#1a1714'); circ(c, 0, -100, 1.6, PAL.gold, false); };
  make(scene, 'bd_lantern', 30, 104, 15, 98, lamp(true));
  make(scene, 'bd_lantern_off', 30, 104, 15, 98, lamp(false));
  make(scene, 'bd_pal', 54, 70, 27, 60, c => {
    shadow(c, 0, 2, 22, 6);
    for (const [x, y, h] of [[-15, 3, 40], [-5, -1, 46], [6, 0, 43], [16, 3, 38]]) { rr(c, x - 4.5, y - h, 9, h, 0.5, '#3b2a20'); poly(c, [x - 4.5, y - h, x, y - h - 9, x + 4.5, y - h], '#4e3a2a'); hatch(c, x, y - h, 4.5, h, 'rgba(5,4,3,.4)', 2.4); }
    line(c, [-20, -22, 21, -20], '#2a1d15', 2.4); line(c, [-20, -10, 21, -8], '#2a1d15', 2.4);
  });
  make(scene, 'bd_pal2', 56, 64, 28, 54, c => {
    shadow(c, 0, 2, 24, 6);
    for (let row = 0; row < 4; row++) for (let i = 0; i < 3; i++) rr(c, -22 + i * 15 + (row % 2) * 5, -10 - row * 9, 14, 9, 0.5, row % 2 ? '#4e4c48' : '#3b3a36');
    for (const x of [-20, -6, 8]) poly(c, [x, -46, x + 6, -52, x + 12, -46], '#3b3a36');
    ell(c, -10, -44, 7, 2.5, '#3d4a36', false);
  });
  make(scene, 'bd_palx', 54, 30, 27, 20, c => { for (const [x, y] of [[-12, 0], [0, 2], [12, -1]]) line(c, [x - 6, y, x + 6, y - 4], '#3b2a20', 5); });
  make(scene, 'bd_flowerbed', 50, 34, 25, 24, c => { rr(c, -20, -12, 40, 14, 1, '#3b3a36'); rr(c, -17, -13, 34, 9, 1, '#241a13', false); ['#a8a0b8', '#c9bfa8', '#6b2a22', '#8a7fa0', '#c9bfa8'].forEach((col, i) => { line(c, [-13 + i * 6.5, -10, -13 + i * 6.5, -18], '#2f4231', 1.2); circ(c, -13 + i * 6.5, -19, 2.4, col); }); });
  make(scene, 'bd_bench', 50, 34, 25, 24, c => { shadow(c, 0, 0, 20, 5); rr(c, -20, -16, 40, 4, 0.5, '#4a3626'); rr(c, -20, -9, 40, 4, 0.5, '#5e4632'); for (const x of [-16, 16]) line(c, [x, -4, x, 2], '#1a1714', 2.6); });
  make(scene, 'bd_banner', 30, 104, 8, 98, c => { shadow(c, 0, 0, 8, 3); line(c, [0, 0, 0, -92], '#1a1714', 2.4); poly(c, [0, -98, -3, -92, 3, -92], PAL.gold); });
  make(scene, 'bd_banner_cloth', 26, 44, 0, 2, c => { c.beginPath(); c.moveTo(0, 0); c.lineTo(20, 0); c.lineTo(20, 38); c.lineTo(10, 31); c.lineTo(0, 38); c.closePath(); paint(c, '#33293f'); c.beginPath(); c.arc(10, 14, 5, 0.5, TAU - 0.5); c.strokeStyle = PAL.gold; c.lineWidth = 1.4; c.stroke(); });
  make(scene, 'bd_fountain', 100, 84, 50, 60, c => { shadow(c, 0, 4, 44, 14); ell(c, 0, -6, 42, 16, '#4e4c48'); ell(c, 0, -8, 34, 12, '#2a3a40', false); rr(c, -5, -42, 10, 34, 0.5, '#4e4c48'); hatch(c, 0, -42, 5, 34); ell(c, 0, -42, 13, 4.5, '#5e5a55'); rim(c, -14, -12, 10, 3, 0.15); });
  make(scene, 'site', 100, 90, 50, 80, c => {
    shadow(c, 0, 2, 40, 10);
    rr(c, -36, -6, 72, 8, 0.5, '#5e4632');
    for (const x of [-30, 30]) line(c, [x, 0, x, -56], '#2a1d15', 3);
    line(c, [-30, -56, 30, -56], '#2a1d15', 3); line(c, [-30, -30, 30, -30], '#3b2a20', 2.4); line(c, [-30, 0, 30, -56], '#3b2a20', 2);
    rr(c, -10, -20, 20, 14, 0.5, '#8a7356');
  });

  // decor
  make(scene, 'dc_tuft', 16, 12, 8, 10, c => { line(c, [-4, 0, -6, -7], '#3d4a36', 1.6); line(c, [0, 0, 0, -9], '#4a5a40', 1.6); line(c, [4, 0, 6, -7], '#3d4a36', 1.6); });
  make(scene, 'dc_tuft2', 16, 12, 8, 10, c => { line(c, [-4, 0, -6, -7], '#3a3242', 1.6); line(c, [0, 0, 0, -9], '#463c50', 1.6); line(c, [4, 0, 6, -7], '#3a3242', 1.6); });
  ['#9a92a8', '#b8ae98', '#6b2a22', '#c9bfa8'].forEach((col, j) => make(scene, 'dc_flower' + j, 14, 14, 7, 7, c => { for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; c.fillStyle = col; c.beginPath(); c.arc(Math.cos(a) * 2.6, Math.sin(a) * 2.6, 1.8, 0, TAU); c.fill(); } c.fillStyle = '#3d4a36'; c.beginPath(); c.arc(0, 0, 1.2, 0, TAU); c.fill(); }));
  make(scene, 'dc_shroom', 14, 14, 7, 12, c => { rr(c, -1.5, -6, 3, 6, 0.5, '#b8ab90'); c.beginPath(); c.arc(0, -6, 5, Math.PI, 0); c.closePath(); paint(c, '#5a221c'); });
  make(scene, 'dc_pebble', 20, 14, 10, 8, c => { ell(c, 0, 0, 7, 4.5, '#4e4c48'); });
  make(scene, 'dc_grave', 28, 38, 14, 34, c => { shadow(c, 0, 2, 14, 4); c.beginPath(); c.moveTo(-10, 0); c.lineTo(-10, -18); c.lineTo(0, -30); c.lineTo(10, -18); c.lineTo(10, 0); c.closePath(); paint(c, '#4e4c48'); hatch(c, 2, -30, 8, 30); line(c, [0, -24, 0, -10], '#2b2a27', 1.4); line(c, [-4, -19, 4, -19], '#2b2a27', 1.4); });
  make(scene, 'dc_bush', 50, 40, 25, 34, c => { circ(c, -10, -12, 12, '#26352a'); circ(c, 10, -12, 12, '#26352a'); circ(c, 0, -20, 13, '#2c3d30'); hatch(c, 0, -32, 22, 32, 'rgba(5,6,4,.3)', 2.6); });
  make(scene, 'dc_cobble', 30, 22, 15, 11, c => { rr(c, -13, -9, 26, 18, 2, '#5e574c', false); });
  make(scene, 'grass_tile', 128, 128, 0, 0, c => {
    c.fillStyle = '#3e4a36'; c.fillRect(0, 0, 128, 128);
    let s = 9; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    for (let i = 0; i < 26; i++) { const x = r() * 128, y = r() * 128, rad = 10 + r() * 22; c.fillStyle = r() < 0.5 ? 'rgba(30,38,26,.35)' : 'rgba(84,96,70,.22)'; for (const [ox, oy] of [[0, 0], [128, 0], [-128, 0], [0, 128], [0, -128]]) { c.beginPath(); c.ellipse(x + ox, y + oy, rad, rad * 0.7, 0, 0, TAU); c.fill(); } }
    for (let i = 0; i < 46; i++) { const x = r() * 124 + 2, y = r() * 124 + 2; c.strokeStyle = r() < 0.5 ? '#33402e' : '#55634a'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 1.5, y - 4); c.moveTo(x + 2, y); c.lineTo(x + 3, y - 3.5); c.stroke(); }
  });

  // fx
  make(scene, 'fx_dot', 12, 12, 6, 6, c => circ(c, 0, 0, 5, '#ffffff', false));
  make(scene, 'fx_star', 16, 16, 8, 8, c => { c.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? 1.6 : 7; c.lineTo(Math.cos(i / 8 * TAU) * r, Math.sin(i / 8 * TAU) * r); } c.closePath(); c.fillStyle = '#ffffff'; c.fill(); });
  make(scene, 'fx_leaf', 12, 8, 6, 4, c => ell(c, 0, 0, 5, 2.4, '#ffffff', false));
  make(scene, 'fx_chip', 8, 6, 4, 3, c => { c.fillStyle = '#ffffff'; c.fillRect(-3, -1.5, 6, 3); });
  make(scene, 'fx_puff', 32, 32, 16, 16, c => { const g = c.createRadialGradient(0, 0, 0, 0, 0, 15); g.addColorStop(0, 'rgba(255,255,255,.8)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(-16, -16, 32, 32); });
  make(scene, 'fx_cone', 14, 14, 7, 7, c => ell(c, 0, 0, 4, 6, '#3b2a20'));
  make(scene, 'fx_pebble', 10, 10, 5, 5, c => circ(c, 0, 0, 3, '#6e6a64'));
  make(scene, 'fx_glow', 64, 64, 32, 32, c => { const g = c.createRadialGradient(0, 0, 0, 0, 0, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(-32, -32, 64, 64); });
  make(scene, 'fx_flame', 24, 34, 12, 30, c => { c.beginPath(); c.moveTo(0, -30); c.quadraticCurveTo(12, -12, 8, -2); c.quadraticCurveTo(0, 4, -8, -2); c.quadraticCurveTo(-12, -12, 0, -30); c.fillStyle = '#d0702a'; c.fill(); c.beginPath(); c.moveTo(0, -20); c.quadraticCurveTo(6, -8, 4, -2); c.quadraticCurveTo(0, 1, -4, -2); c.quadraticCurveTo(-6, -8, 0, -20); c.fillStyle = '#f0c070'; c.fill(); });
  make(scene, 'fx_ring', 100, 100, 50, 50, c => { c.lineWidth = 3; c.strokeStyle = '#ffffff'; c.beginPath(); c.ellipse(0, 0, 46, 23, 0, 0, TAU); c.stroke(); });
  make(scene, 'fx_tele', 220, 112, 110, 56, c => { c.beginPath(); c.ellipse(0, 0, 108, 54, 0, 0, TAU); c.fillStyle = 'rgba(125,42,34,.3)'; c.fill(); c.lineWidth = 3; c.setLineDash([10, 6]); c.strokeStyle = '#c0432f'; c.stroke(); });
  make(scene, 'fx_shadow', 40, 16, 20, 8, c => shadow(c, 0, 0, 18, 6, 0.45));
  make(scene, 'fx_arrow', 34, 24, 4, 12, c => { poly(c, [26, 0, 4, -10, 10, 0, 4, 10], '#7d2a22'); line(c, [8, 0, 22, 0], '#c9bfa8', 0.8); });
  make(scene, 'fx_marker', 24, 20, 12, 18, c => poly(c, [-9, -14, 9, -14, 0, 2], PAL.gold));
  make(scene, 'fx_vignette', 128, 128, 64, 64, c => { const g = c.createRadialGradient(0, 0, 26, 0, 0, 92); g.addColorStop(0, 'rgba(10,8,6,0)'); g.addColorStop(1, 'rgba(10,8,6,.75)'); c.fillStyle = g; c.fillRect(-64, -64, 128, 128); });
  packAtlases(scene);
}
