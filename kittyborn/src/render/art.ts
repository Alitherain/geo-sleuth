// Procedural art drawn once into textures. Light comes from the top-left; outlines are a darker shade of each fill.
import Phaser from 'phaser';
import type { ItemId } from '../content/data';

export const TEX = 3;
export const INK = '#2a2140';
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

// ---------------------------------------------------------------- colour + primitives
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (amt < 0) { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; } else { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  return '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}
function paint(c: C, fill: string, stroke = true) { c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = shade(fill, -0.55); c.stroke(); } }
function circ(c: C, x: number, y: number, r: number, fill: string, stroke = true) { c.beginPath(); c.arc(x, y, r, 0, TAU); paint(c, fill, stroke); }
function ell(c: C, x: number, y: number, rx: number, ry: number, fill: string, stroke = true, rot = 0) { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, TAU); paint(c, fill, stroke); }
function poly(c: C, pts: number[], fill: string, stroke = true) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); paint(c, fill, stroke); }
function rr(c: C, x: number, y: number, w: number, h: number, r: number | number[], fill: string, stroke = true) { c.beginPath(); c.roundRect(x, y, w, h, r); paint(c, fill, stroke); }
function shadow(c: C, x: number, y: number, rx: number, ry: number, a = 0.25) { c.beginPath(); c.ellipse(x + rx * 0.12, y + ry * 0.2, rx, ry, 0, 0, TAU); c.fillStyle = `rgba(28,16,52,${a})`; c.fill(); }
function gloss(c: C, x: number, y: number, rx: number, ry: number, a = 0.22) { c.beginPath(); c.ellipse(x, y, rx, ry, -0.5, 0, TAU); c.fillStyle = `rgba(255,255,255,${a})`; c.fill(); }
function line(c: C, pts: number[], col: string, wdt = 1.4) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.strokeStyle = col; c.lineWidth = wdt; c.stroke(); c.lineWidth = 1.7; }
function window_(c: C, x: number, y: number, w: number, h: number) {
  rr(c, x - w / 2, y - h, w, h, [w / 2, w / 2, 1, 1], '#3a2c4a');
  rr(c, x - w / 2 + 1.5, y - h + 1.5, w - 3, h - 3, [w / 2, w / 2, 1, 1], '#ffd77a', false);
  line(c, [x, y - h + 1, x, y - 1], '#8a5a3a', 1.2); line(c, [x - w / 2 + 1, y - h * 0.45, x + w / 2 - 1, y - h * 0.45], '#8a5a3a', 1.2);
}

/** A 3/4-view house volume: front wall, darker side wall, gabled roof. */
function house(c: C, o: { w: number; h: number; d: number; roofH: number; wall: string; roof: string; planks?: boolean; stone?: boolean; door?: boolean; windows?: number; chimney?: boolean }) {
  const { w, h, d, roofH } = o, hw = w / 2, dx = d, dy = -d * 0.5;
  // side wall
  poly(c, [hw, 0, hw + dx, dy, hw + dx, dy - h, hw, -h], shade(o.wall, -0.25));
  // front wall
  rr(c, -hw, -h, w, h, 1, o.wall);
  if (o.planks) for (let y = -h + 8; y < -2; y += 8) line(c, [-hw + 2, y, hw - 2, y], shade(o.wall, -0.18), 1);
  if (o.stone) for (let y = -h + 7, row = 0; y < -2; y += 7, row++) for (let x = -hw + (row % 2) * 6; x < hw - 3; x += 12) { c.beginPath(); c.roundRect(x + 1, y - 6, 10, 5.5, 2); c.strokeStyle = shade(o.wall, -0.2); c.lineWidth = 1; c.stroke(); }
  c.lineWidth = 1.7;
  // roof: side plane then front gable
  poly(c, [0, -h - roofH, dx, dy - h - roofH, hw + 5 + dx, dy - h + 2, hw + 5, -h + 2], shade(o.roof, -0.2));
  poly(c, [-hw - 5, -h + 2, 0, -h - roofH, hw + 5, -h + 2], o.roof);
  for (let i = 1; i < 4; i++) { const t = i / 4; line(c, [-hw - 5 + (hw + 5) * t, -h + 2 - roofH * t, hw + 5 - (hw + 5) * t, -h + 2 - roofH * t], shade(o.roof, -0.15), 1); }
  gloss(c, -hw * 0.35, -h - roofH * 0.45, hw * 0.35, roofH * 0.12, 0.15);
  if (o.chimney) { rr(c, hw * 0.25 + dx * 0.5, -h - roofH * 0.9 + dy * 0.5, 9, roofH * 0.55, 1, '#7a7692'); rr(c, hw * 0.25 + dx * 0.5 - 1, -h - roofH * 0.95 + dy * 0.5, 11, 3, 1, '#5f5b78'); }
  if (o.door) { rr(c, -7, -18, 14, 18, [7, 7, 0, 0], '#5a3a2a'); circ(c, 4, -9, 1, '#ffcf4a', false); }
  const nw = o.windows || 0;
  for (let i = 0; i < nw; i++) { const x = nw === 1 ? (o.door ? hw * 0.55 : 0) : -hw * 0.55 + (hw * 1.1) * (i / (nw - 1)); if (o.door && Math.abs(x) < 12) continue; window_(c, x, -h * 0.42, 9, 12); }
}

// ---------------------------------------------------------------- items
export function drawItem(c: C, type: ItemId | 'coin', s = 1) {
  c.save(); c.scale(s, s); c.lineWidth = 1.4;
  switch (type) {
    case 'log': case 'lav': rr(c, -12, -5, 22, 10, 4, type === 'lav' ? '#8a6cc2' : '#9a5a33'); ell(c, 10, 0, 4, 5, type === 'lav' ? '#e2d4ff' : '#e8c08a'); ell(c, 10, 0, 1.6, 2.2, type === 'lav' ? '#b79ae8' : '#c48f55', false); break;
    case 'plank': rr(c, -13, -3.5, 26, 7, 1.5, '#efc98e'); line(c, [-9, 0, 9, 0], '#c99a5c', 1); break;
    case 'stone': poly(c, [-9, 3, -7, -4, 0, -6, 8, -3, 9, 3, 2, 6], '#a9a4bc'); poly(c, [-7, -4, 0, -6, 2, -1, -4, 0], '#c9c5d8', false); break;
    case 'berry': for (const [x, y] of [[-4, 1], [3, 1], [0, -4], [-1, 4], [5, -3]]) circ(c, x, y, 3.4, '#5b6ee0'); circ(c, -1, -4, 1.1, '#fff', false); line(c, [0, -7, 3, -10], '#3f7d63', 1.6); break;
    case 'meat': line(c, [2, 0, 12, -3], '#2a2140', 1.6); circ(c, 13, -4.5, 2.4, '#fff8ec'); circ(c, 14, -1.8, 2.4, '#fff8ec'); ell(c, -3, 0, 9, 7, '#d9615e'); ell(c, -5, -2, 4, 2.5, '#ef8f87', false); break;
    case 'candle': rr(c, -3.5, -7, 7, 14, 2, '#fff1d6'); ell(c, 0, -10, 2.2, 3.2, '#ffb84a', false); ell(c, 0, -9.5, 1, 1.6, '#fff4c0', false); break;
    case 'fluff': for (const [x, y, r] of [[-5, 1, 6], [4, 1, 6], [0, -3, 6.5]]) circ(c, x, y, r, '#cbb8f0'); circ(c, -1, -4, 2, '#fff', false); break;
    case 'coin': circ(c, 0, 0, 6, '#ffcf4a'); circ(c, 0, 0, 3.2, '#ffe596', false); break;
  }
  c.restore();
}

// ---------------------------------------------------------------- hero (the original hunter)
function heroBody(c: C, blink: boolean) {
  // coat
  c.beginPath(); c.moveTo(-11, -8); c.quadraticCurveTo(-12, -26, 0, -28); c.quadraticCurveTo(12, -26, 11, -8); c.closePath(); paint(c, '#4a3a6a');
  c.fillStyle = '#ffcf4a'; for (const y of [-17, -12]) { c.beginPath(); c.arc(3, y, 1.6, 0, TAU); c.fill(); }
  circ(c, -9, -10, 3, '#ffe08a');
  const hy = -40;
  circ(c, 0, hy, 15, '#ffe4d0'); gloss(c, -5, hy - 6, 5, 3, 0.25);
  c.beginPath(); c.arc(0, hy - 3, 15, Math.PI * 1.05, Math.PI * 1.95); c.quadraticCurveTo(10, hy - 6, 6, hy - 2); c.quadraticCurveTo(0, hy - 8, -12, hy - 1); c.closePath(); c.fillStyle = '#3b2b4a'; c.fill();
  for (const ex of [-2.5, 8.5]) {
    if (blink) { line(c, [ex - 3, hy + 1, ex + 3, hy + 1], '#2a2140', 1.6); continue; }
    ell(c, ex, hy + 1, 3.2, 4.4, '#2a2140', false); ell(c, ex, hy + 2.5, 2.2, 2, '#8f6bd6', false);
    circ(c, ex - 1, hy - 0.8, 1.4, '#fff', false); circ(c, ex + 1.2, hy + 2.6, 0.7, '#fff', false);
  }
  ell(c, -7, hy + 6, 2.6, 1.5, '#ff9fb0', false); ell(c, 11, hy + 6, 2.6, 1.5, '#ff9fb0', false);
  ell(c, 0, hy + 11, 12.5, 5, '#c7465a');
  ell(c, 0, hy - 11, 23, 6.5, '#33264a');
  c.beginPath(); c.moveTo(-11, hy - 12); c.quadraticCurveTo(-12, hy - 28, 0, hy - 29); c.quadraticCurveTo(12, hy - 28, 11, hy - 12); c.closePath(); paint(c, '#33264a');
  c.fillStyle = '#c7465a'; c.fillRect(-11, hy - 17, 22, 4);
  c.beginPath(); c.moveTo(-8, hy - 16); c.quadraticCurveTo(-18, hy - 32, -12, hy - 38); c.quadraticCurveTo(-10, hy - 26, -5, hy - 17); paint(c, '#f2b8d0');
}
function heroCape(c: C) { c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-9, 12, -6, 22); c.lineTo(9, 20); c.closePath(); paint(c, '#5b2f4f'); }
function heroScarf(c: C) { c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-10, 2, -15, -3); c.lineTo(-13, 5); c.quadraticCurveTo(-7, 6, 2, 3); c.closePath(); paint(c, '#c7465a'); }
function leg(c: C, col: string, s = 1) { c.save(); c.scale(s, s); rr(c, -3.5, -9, 7, 10, 3.5, col); c.restore(); }
function weaponAxe(c: C) {
  line(c, [0, 4, 0, -22], '#6b3f22', 3.4);
  c.beginPath(); c.moveTo(0, -24); c.quadraticCurveTo(14, -26, 13, -12); c.quadraticCurveTo(6, -15, 0, -14); c.closePath(); paint(c, '#dfe4ef');
  c.fillStyle = '#aab3c7'; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-1, -22 + i * 3); c.lineTo(-4, -21 + i * 3); c.lineTo(-1, -20 + i * 3); c.fill(); }
}
function weaponSaw(c: C) {
  line(c, [0, 4, 0, -8], '#6b3f22', 3.4);
  rr(c, -3, -32, 10, 26, 3, '#dfe4ef');
  for (let i = 0; i < 6; i++) poly(c, [7, -30 + i * 4, 10, -28 + i * 4, 7, -26 + i * 4], '#9aa3b8', false);
}

// ---------------------------------------------------------------- hooded cats
interface Hood { cloak: string; eye: string; trim: string }
function hoodedCat(c: C, h: Hood, blink: boolean, extra?: (c: C) => void) {
  // cloak body (bell shape)
  c.beginPath(); c.moveTo(-10, -2); c.quadraticCurveTo(-11, -18, -6, -22); c.lineTo(6, -22); c.quadraticCurveTo(11, -18, 10, -2); c.quadraticCurveTo(0, 1, -10, -2); paint(c, h.cloak);
  line(c, [0, -20, 0, -3], shade(h.cloak, -0.25), 1.2);
  ell(c, 0, -6, 9, 2, h.trim, false);
  extra?.(c);
  // hood with ears
  const hy = -30;
  poly(c, [-11, hy - 2, -10, hy - 17, -3, hy - 10], h.cloak); poly(c, [11, hy - 2, 10, hy - 17, 3, hy - 10], h.cloak);
  poly(c, [-9.5, hy - 5, -9, hy - 13, -5, hy - 9], '#ff9fb0', false); poly(c, [9.5, hy - 5, 9, hy - 13, 5, hy - 9], '#ff9fb0', false);
  ell(c, 0, hy, 13, 12, h.cloak);
  gloss(c, -5, hy - 6, 4, 2.5, 0.2);
  // shadowed face opening
  ell(c, 1, hy + 2, 8.5, 7.5, '#1d1628', false);
  for (const ex of [-2.4, 4.4]) {
    if (blink) { line(c, [ex - 2, hy + 2, ex + 2, hy + 2], h.eye, 1.4); continue; }
    ell(c, ex, hy + 2, 2.3, 3, h.eye, false); circ(c, ex - 0.7, hy + 0.8, 0.8, '#fff', false);
  }
  poly(c, [0.5, hy + 5.5, 2.5, hy + 5.5, 1.5, hy + 6.8], '#ff8fa3', false);
}
function catTail(c: C, col: string) { c.lineWidth = 4.5; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-7, -2, -6, -11); c.strokeStyle = shade(col, -0.5); c.stroke(); c.lineWidth = 2.6; c.strokeStyle = col; c.stroke(); c.lineWidth = 1.7; }

// ---------------------------------------------------------------- beasts
function beast(c: C, r: number, base: string, belly: string, eye: string, horn: boolean, boss: boolean, white = false, shadeK = false) {
  if (white) base = belly = '#ffffff';
  ell(c, -r * 0.45, -2, r * 0.28, r * 0.18, white ? '#fff' : '#2f2840'); ell(c, r * 0.45, -2, r * 0.28, r * 0.18, white ? '#fff' : '#2f2840');
  const cy = -r;
  if (horn || boss) for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * r * 0.35, cy - r * 0.7); c.quadraticCurveTo(s * r * 0.9, cy - r * 1.3, s * r * 0.55, cy - r * 1.55); c.quadraticCurveTo(s * r * 0.55, cy - r * 1.05, s * r * 0.1, cy - r * 0.8); c.closePath(); paint(c, white ? '#fff' : '#efe2c4'); }
  else for (const s of [-1, 1]) poly(c, [s * r * 0.3, cy - r * 0.75, s * r * 0.5, cy - r * 1.18, s * r * 0.65, cy - r * 0.62], base);
  c.save(); c.translate(0, cy);
  const n = boss ? 22 : 13;
  c.beginPath();
  for (let i = 0; i <= n * 2; i++) { const a = i / (n * 2) * TAU, r2 = i % 2 ? r * 0.86 : r * (shadeK ? 1 + Math.sin(i * 1.7) * 0.08 : 1); const x = Math.cos(a) * r2, y = Math.sin(a) * r2 * 0.92; i ? c.lineTo(x, y) : c.moveTo(x, y); }
  c.closePath(); paint(c, base);
  if (!white) { ell(c, r * 0.1, r * 0.3, r * 0.55, r * 0.45, belly, false); gloss(c, -r * 0.35, -r * 0.4, r * 0.35, r * 0.2, 0.18); }
  if (!white) for (const s of [-1, 1]) {
    const ex = s * r * 0.32 + r * 0.12, ey = -r * 0.12;
    c.beginPath(); c.arc(ex, ey, r * 0.28, 0, TAU); c.fillStyle = 'rgba(255,240,180,.22)'; c.fill();
    ell(c, ex, ey, r * 0.16, r * 0.2, eye, false); circ(c, ex - r * 0.05, ey - r * 0.07, r * 0.06, '#fff', false);
    if (eye !== '#ffe066') line(c, [ex - s * r * 0.22, ey - r * 0.32, ex + s * r * 0.14, ey - r * 0.2], '#1a1428', 1.6);
  }
  if (!white && !shadeK) {
    c.beginPath(); c.moveTo(r * 0.12 - r * 0.14, r * 0.2); c.quadraticCurveTo(r * 0.12, r * 0.3, r * 0.12 + r * 0.14, r * 0.2); c.strokeStyle = '#1a1428'; c.stroke();
    poly(c, [r * 0.02, r * 0.22, r * 0.06, r * 0.32, r * 0.1, r * 0.24], '#fff', false);
    if (boss) { c.beginPath(); c.arc(0, -r * 0.58, r * 0.13, 0.6, TAU - 0.6); c.fillStyle = '#ffe9a8'; c.fill(); }
  }
  c.restore();
}

// ---------------------------------------------------------------- trees and nodes (trunk and crown apart so crowns can sway)
function crownOak(c: C) {
  const base = '#4f9160';
  for (const [x, y, r] of [[-15, -6, 18], [15, -6, 18], [0, -24, 22], [-8, -12, 16], [9, -14, 16]]) circ(c, x, y, r, base);
  for (const [x, y, r] of [[-10, -26, 10], [4, -32, 9], [-18, -12, 7]]) circ(c, x, y, r, '#6fb375', false);
  for (const [x, y, r] of [[12, -2, 9], [0, 2, 8]]) circ(c, x, y, r, '#3f7a52', false);
  circ(c, 10, -16, 2.6, '#e9667a', false); circ(c, -12, -8, 2.6, '#e9667a', false); circ(c, 2, -28, 2.2, '#ffd1e3', false);
}
function crownPine(c: C) {
  const cols = ['#3f7d63', '#4a8d6c', '#5aa077'];
  for (let i = 0; i < 3; i++) { const yy = 4 - i * 19, w = 30 - i * 7; c.beginPath(); c.moveTo(-w, yy); c.quadraticCurveTo(0, yy - 34 + i * 4, w, yy); c.quadraticCurveTo(0, yy + 7, -w, yy); c.closePath(); paint(c, cols[i]); line(c, [-w * 0.5, yy - 4, -w * 0.1, yy - 14], shade(cols[i], 0.25), 2); }
}
function crownLav(c: C) {
  for (const [x, y, r] of [[-16, -4, 19], [16, -4, 19], [0, -26, 24], [-6, -14, 16]]) circ(c, x, y, r, '#8a6cc2');
  for (const [x, y, r] of [[-10, -28, 10], [6, -34, 8]]) circ(c, x, y, r, '#b49ae6', false);
  for (let i = 0; i < 7; i++) { const a = i * 1.7; circ(c, Math.cos(a) * 15, -16 + Math.sin(a) * 13, 1.9, '#fff4c0', false); }
}
function trunk(c: C, col: string, h: number) { shadow(c, 0, 2, 26, 8); rr(c, -6, -h, 12, h, 4, col); line(c, [-2, -h + 6, -2, -4], shade(col, 0.2), 1.6); }

export function buildArt(scene: Phaser.Scene) {
  for (const k of ['log', 'lav', 'plank', 'stone', 'berry', 'meat', 'candle', 'fluff', 'coin'] as const) make(scene, 'it_' + k, 34, 26, 16, 13, c => drawItem(c, k));

  // hero
  make(scene, 'hero', 60, 104, 30, 96, c => heroBody(c, false));
  make(scene, 'hero_b', 60, 104, 30, 96, c => heroBody(c, true));
  make(scene, 'hero_cape', 30, 30, 12, 4, heroCape);
  make(scene, 'hero_scarf', 26, 16, 20, 6, heroScarf);
  make(scene, 'hero_leg', 12, 14, 6, 12, c => leg(c, '#2f2545'));
  make(scene, 'w_axe', 30, 38, 6, 32, weaponAxe);
  make(scene, 'w_saw', 24, 42, 8, 36, weaponSaw);

  // hooded cats
  const hoods: Record<string, Hood> = {
    gatherer: { cloak: '#5f8f5a', eye: '#ffd36a', trim: '#e8c08a' },
    miner: { cloak: '#7a7692', eye: '#ffb84a', trim: '#c9c5d8' },
    forager: { cloak: '#b0506a', eye: '#c6f56b', trim: '#ffd1e3' },
    hauler: { cloak: '#5b7aa8', eye: '#9ff0d2', trim: '#d6c39a' },
    master: { cloak: '#8a5f42', eye: '#ffcf4a', trim: '#c7465a' },
    spear: { cloak: '#9c3f4f', eye: '#ff8a8a', trim: '#ffcf4a' },
    sling: { cloak: '#5e4a86', eye: '#c6f56b', trim: '#ffcf4a' },
  };
  const extras: Record<string, (c: C) => void> = {
    hauler: c => { rr(c, -14, -20, 7, 12, 2, '#a8693f'); },
    spear: c => { ell(c, 8, -12, 5, 6, '#c9c5d8'); circ(c, 8, -12, 1.5, '#ffcf4a', false); },
  };
  for (const [k, h] of Object.entries(hoods)) {
    make(scene, 'cat_' + k, 40, 56, 20, 50, c => hoodedCat(c, h, false, extras[k]));
    make(scene, 'cat_' + k + '_b', 40, 56, 20, 50, c => hoodedCat(c, h, true, extras[k]));
    make(scene, 'cat_' + k + '_tail', 16, 16, 12, 13, c => catTail(c, '#3a3346'));
    make(scene, 'cat_' + k + '_leg', 10, 10, 5, 8, c => leg(c, '#3a3346', 0.7));
  }
  make(scene, 'w_catAxe', 20, 26, 4, 22, c => { line(c, [0, 2, 0, -15], '#6b3f22', 2.6); c.beginPath(); c.moveTo(0, -16); c.quadraticCurveTo(9, -17, 8, -9); c.lineTo(0, -10); c.closePath(); paint(c, '#dfe4ef'); });
  make(scene, 'w_pick', 22, 26, 6, 22, c => { line(c, [0, 2, 0, -15], '#6b3f22', 2.6); c.beginPath(); c.moveTo(-6, -13); c.quadraticCurveTo(0, -19, 9, -14); c.lineTo(8, -12); c.quadraticCurveTo(0, -16, -6, -11); c.closePath(); paint(c, '#c9c5d8'); });
  make(scene, 'w_basket', 20, 18, 10, 12, c => { rr(c, -7, -8, 14, 9, 3, '#c99a5c'); line(c, [-6, -8, 0, -14, 6, -8], '#8a5a3a', 1.4); circ(c, -3, -8, 2.2, '#5b6ee0', false); circ(c, 2, -9, 2.2, '#e9667a', false); });
  make(scene, 'w_hammer', 20, 26, 4, 22, c => { line(c, [0, 2, 0, -14], '#6b3f22', 2.6); rr(c, -5, -19, 12, 6, 1.5, '#8e8aa6'); });
  make(scene, 'w_spear', 14, 46, 4, 40, c => { line(c, [0, 4, 0, -30], '#6b3f22', 2.4); poly(c, [-3, -30, 0, -40, 3, -30], '#dfe4ef'); });
  make(scene, 'w_sling', 18, 24, 5, 20, c => { line(c, [0, 2, 0, -8], '#6b3f22', 2.4); line(c, [0, -8, -4, -16], '#6b3f22', 2.2); line(c, [0, -8, 5, -16], '#6b3f22', 2.2); line(c, [-4, -16, 5, -16], '#c7465a', 1); });

  // owl shopkeeper
  make(scene, 'npc_owl', 56, 64, 28, 58, c => {
    c.beginPath(); c.moveTo(-20, 0); c.quadraticCurveTo(-24, -26, -12, -34); c.lineTo(12, -34); c.quadraticCurveTo(24, -26, 20, 0); c.closePath(); paint(c, '#3b2b5c'); // cape
    ell(c, 0, -26, 17, 19, '#9c6b48'); ell(c, 0, -20, 10, 11, '#e9cfa6', false); gloss(c, -6, -36, 5, 3, 0.2);
    for (const s of [-1, 1]) { circ(c, s * 7, -31, 7, '#fff6e2'); circ(c, s * 7, -30, 3.8, '#2a2140', false); circ(c, s * 7 - 1.2, -32, 1.3, '#fff', false); }
    c.beginPath(); c.arc(7, -31, 8, 0, TAU); c.strokeStyle = '#ffcf4a'; c.lineWidth = 1.4; c.stroke(); line(c, [14, -28, 16, -16], '#ffcf4a', 1);
    poly(c, [-2.5, -25, 2.5, -25, 0, -20], '#ffb84a');
    ell(c, 0, -43, 15, 3.6, '#22183a'); rr(c, -9, -60, 18, 17, 2, '#22183a'); c.fillStyle = '#c7465a'; c.fillRect(-9, -48, 18, 3);
    poly(c, [-12, -12, -4, -14, -2, -6, -11, -5], '#efe3c8'); // ledger
  });

  // beasts
  make(scene, 'b_fluff', 50, 56, 25, 50, c => beast(c, 17, '#4a4068', '#8b80b3', '#ffe066', false, false));
  make(scene, 'b_fluff_a', 50, 56, 25, 50, c => beast(c, 17, '#4a4068', '#8b80b3', '#ff5470', false, false));
  make(scene, 'b_fluff_w', 50, 56, 25, 50, c => beast(c, 17, '', '', '', false, false, true));
  make(scene, 'b_horn', 64, 84, 32, 76, c => beast(c, 22, '#5a3a4a', '#9a6f80', '#ff5470', true, false));
  make(scene, 'b_horn_w', 64, 84, 32, 76, c => beast(c, 22, '', '', '', true, false, true));
  make(scene, 'b_shade', 46, 52, 23, 46, c => { c.globalAlpha = 0.85; beast(c, 15, '#1d1830', '#2e2645', '#9ff0ff', false, false, false, true); });
  make(scene, 'b_shade_w', 46, 52, 23, 46, c => beast(c, 15, '', '', '', false, false, true, true));
  make(scene, 'b_boss', 140, 196, 70, 186, c => { c.lineWidth = 2.6; beast(c, 52, '#4b3a66', '#8a76b0', '#ff5470', true, true); });
  make(scene, 'b_boss_w', 140, 196, 70, 186, c => { c.lineWidth = 2.6; beast(c, 52, '', '', '', true, true, true); });

  // trees and nodes
  make(scene, 'tr_oak_t', 64, 40, 32, 36, c => trunk(c, '#8a5530', 32));
  make(scene, 'tr_pine_t', 60, 36, 30, 32, c => trunk(c, '#7a4a2c', 28));
  make(scene, 'tr_lav_t', 66, 40, 33, 36, c => trunk(c, '#7a5a8a', 32));
  make(scene, 'tr_oak_c', 84, 78, 42, 56, crownOak);
  make(scene, 'tr_pine_c', 70, 82, 35, 66, crownPine);
  make(scene, 'tr_lav_c', 92, 80, 46, 60, crownLav);
  make(scene, 'tr_stump', 30, 20, 15, 12, c => { shadow(c, 0, 2, 12, 5); ell(c, 0, -3, 11, 6, '#9a5a33'); ell(c, 0, -5, 9, 4.5, '#e8c08a'); ell(c, 0, -5, 4, 2, '#c48f55', false); });
  make(scene, 'nd_rock', 64, 56, 32, 46, c => {
    shadow(c, 0, 2, 28, 9);
    poly(c, [-26, 0, -24, -18, -12, -32, 6, -36, 22, -24, 27, -6, 20, 2], '#8e8aa6');
    poly(c, [-12, -32, 6, -36, 22, -24, 4, -18, -14, -20], '#b3aec9', false);
    poly(c, [22, -24, 27, -6, 20, 2, 8, -6, 4, -18], '#706b8a', false);
    line(c, [-6, -14, 0, -6, -4, 2], '#5f5b78', 1.2);
    ell(c, -16, -6, 6, 3, '#6fa06a', false);
    circ(c, 10, -26, 1.6, '#e8f4ff', false);
  });
  make(scene, 'nd_rock_x', 40, 20, 20, 14, c => { for (const [x, y, s] of [[-8, -2, 5], [4, -3, 4], [10, 1, 3]]) poly(c, [x - s, y + 2, x - s * 0.6, y - s, x + s * 0.7, y - s * 0.8, x + s, y + 2], '#8e8aa6'); });
  make(scene, 'nd_bush', 50, 40, 25, 34, c => { shadow(c, 0, 0, 20, 6); for (const [x, y, r] of [[-10, -10, 12], [10, -10, 12], [0, -18, 13]]) circ(c, x, y, r, '#4f8a55'); for (const [x, y] of [[-10, -14], [6, -20], [12, -9], [-3, -8], [-14, -6], [3, -15]]) circ(c, x, y, 2.6, '#5b6ee0', false); gloss(c, -6, -24, 6, 3, 0.18); });
  make(scene, 'nd_bush_x', 50, 40, 25, 34, c => { shadow(c, 0, 0, 20, 6); for (const [x, y, r] of [[-10, -10, 12], [10, -10, 12], [0, -18, 13]]) circ(c, x, y, r, '#5f7f58'); });
  make(scene, 'tr_bg', 60, 120, 30, 112, c => {
    c.beginPath(); c.moveTo(-26, 0); c.quadraticCurveTo(0, -110, 26, 0); c.closePath(); paint(c, '#2f4a4a');
    c.beginPath(); c.moveTo(-18, -30); c.quadraticCurveTo(0, -120, 18, -30); c.closePath(); paint(c, '#365656');
  });

  // buildings
  make(scene, 'bd_hall1', 150, 150, 70, 136, c => { shadow(c, 8, 4, 70, 16); house(c, { w: 110, h: 58, d: 22, roofH: 40, wall: '#c9a27a', roof: '#7a3f55', planks: true, door: true, windows: 3, chimney: true }); });
  make(scene, 'bd_hall2', 170, 190, 80, 176, c => { shadow(c, 8, 4, 78, 18); house(c, { w: 124, h: 66, d: 24, roofH: 42, wall: '#b8b0c8', roof: '#5a3f7a', stone: true, door: true, windows: 3 }); rr(c, -14, -150, 28, 46, 2, '#b8b0c8'); poly(c, [-18, -150, 0, -174, 18, -150], '#5a3f7a'); circ(c, 0, -134, 8, '#fff4e0'); line(c, [0, -134, 0, -139], '#2a2140', 1.4); line(c, [0, -134, 4, -134], '#2a2140', 1.4); });
  make(scene, 'bd_hall3', 200, 230, 96, 214, c => { shadow(c, 10, 4, 92, 20); house(c, { w: 150, h: 78, d: 28, roofH: 48, wall: '#d8d0e6', roof: '#3f2f66', stone: true, door: true, windows: 5 }); rr(c, -18, -186, 36, 62, 2, '#d8d0e6'); poly(c, [-24, -186, 0, -214, 24, -186], '#3f2f66'); circ(c, 0, -166, 10, '#fff4e0'); c.fillStyle = '#ffcf4a'; c.fillRect(-1, -214, 2, -10); for (const s of [-1, 1]) { rr(c, s * 62 - 8, -112, 16, 34, 2, '#c7465a'); } });
  make(scene, 'bd_shop', 130, 130, 62, 116, c => {
    shadow(c, 6, 4, 60, 14);
    rr(c, -52, -66, 104, 66, 4, '#6c4f8f'); poly(c, [52, 0, 66, -7, 66, -73, 52, -66], '#54397a');
    c.fillStyle = '#8c6aae'; c.fillRect(-46, -48, 92, 3);
    (['log', 'plank', 'stone', 'candle', 'berry'] as const).forEach((k, i) => { c.save(); c.translate(-38 + i * 19, -54); drawItem(c, k, 0.65); c.restore(); });
    rr(c, -58, -22, 116, 22, 4, '#a8693f'); line(c, [-54, -12, 54, -12], '#8a5530', 1);
    rr(c, -60, -110, 7, 110, 2, '#7a4a2c'); rr(c, 53, -110, 7, 110, 2, '#7a4a2c');
    const n = 7, wd = 132 / n;
    for (let i = 0; i < n; i++) { const x0 = -66 + i * wd; c.beginPath(); c.moveTo(x0, -110); c.lineTo(x0 + wd, -110); c.lineTo(x0 + wd, -88); c.quadraticCurveTo(x0 + wd / 2, -80, x0, -88); c.closePath(); paint(c, i % 2 ? '#fff0d6' : '#8a4fae'); }
  });
  make(scene, 'bd_house_gatherer', 80, 90, 36, 82, c => { shadow(c, 4, 2, 34, 9); house(c, { w: 48, h: 30, d: 12, roofH: 26, wall: '#e8c49a', roof: '#5f8f5a', planks: true, door: true }); poly(c, [-20, -50, -16, -66, -9, -54], '#5f8f5a'); poly(c, [16, -54, 22, -68, 26, -54], '#4f7f4a'); });
  make(scene, 'bd_house_quarry', 80, 90, 36, 82, c => { shadow(c, 4, 2, 34, 9); house(c, { w: 50, h: 30, d: 12, roofH: 24, wall: '#a9a4bc', roof: '#6f6b88', stone: true, door: true }); poly(c, [-20, -48, -16, -64, -9, -52], '#6f6b88'); poly(c, [16, -52, 22, -66, 26, -52], '#5f5b78'); for (const [x, y, r] of [[30, -4, 6], [36, 0, 4]]) poly(c, [x - r, y + 2, x - r * 0.6, y - r, x + r * 0.7, y - r * 0.8, x + r, y + 2], '#8e8aa6'); });
  make(scene, 'bd_house_forager', 80, 90, 36, 82, c => { shadow(c, 4, 2, 34, 9); house(c, { w: 48, h: 30, d: 12, roofH: 26, wall: '#f2dcc0', roof: '#b0506a', planks: true, door: true }); poly(c, [-20, -50, -16, -66, -9, -54], '#b0506a'); poly(c, [16, -54, 22, -68, 26, -54], '#a0405a'); rr(c, 24, -12, 14, 10, 3, '#c99a5c'); for (const [x, y] of [[28, -13], [33, -14], [30, -16]]) circ(c, x, y, 2.2, '#5b6ee0', false); });
  make(scene, 'bd_house_hauler', 80, 90, 36, 82, c => { shadow(c, 4, 2, 34, 9); house(c, { w: 48, h: 30, d: 12, roofH: 26, wall: '#d6d2e6', roof: '#5b7aa8', planks: true, door: true }); poly(c, [-20, -50, -16, -66, -9, -54], '#5b7aa8'); poly(c, [16, -54, 22, -68, 26, -54], '#4b6a98'); });
  make(scene, 'bd_house_master', 80, 90, 36, 82, c => { shadow(c, 4, 2, 34, 9); house(c, { w: 50, h: 32, d: 12, roofH: 26, wall: '#c9a27a', roof: '#8a5f42', stone: true, door: true, chimney: true }); });
  make(scene, 'bd_sawmill', 150, 140, 70, 124, c => {
    shadow(c, 8, 4, 70, 15); house(c, { w: 104, h: 54, d: 22, roofH: 34, wall: '#b07a4f', roof: '#9c3f4f', planks: true, windows: 2 });
    rr(c, -16, -40, 32, 40, 2, '#5a3a2a'); line(c, [-16, -20, 16, -20], '#3a2a1a', 1);
  });
  make(scene, 'bd_blade', 44, 44, 22, 22, c => { c.beginPath(); for (let i = 0; i < 24; i++) { const a = i / 24 * TAU, r2 = i % 2 ? 15 : 19; c.lineTo(Math.cos(a) * r2, Math.sin(a) * r2); } c.closePath(); paint(c, '#e3e8f2'); circ(c, 0, 0, 4, '#9c3f4f'); });
  make(scene, 'bd_storage', 130, 120, 60, 108, c => {
    shadow(c, 6, 4, 60, 14); house(c, { w: 96, h: 50, d: 20, roofH: 36, wall: '#a07ab8', roof: '#4a3a6a', planks: true });
    rr(c, -20, -42, 40, 42, [18, 18, 1, 1], '#5a3a2a'); line(c, [-20, -20, 20, -20], '#3a2a1a', 1.2); line(c, [0, -42, 0, 0], '#3a2a1a', 1.2); line(c, [-20, -42, 20, 0], '#3a2a1a', 1); line(c, [20, -42, -20, 0], '#3a2a1a', 1);
    c.save(); c.translate(-36, -6); drawItem(c, 'plank', 0.7); c.restore(); c.save(); c.translate(36, -6); drawItem(c, 'stone', 0.7); c.restore();
  });
  make(scene, 'bd_forge', 130, 130, 58, 116, c => {
    shadow(c, 6, 4, 58, 13); house(c, { w: 70, h: 46, d: 18, roofH: 26, wall: '#8e8aa6', roof: '#4a4560', stone: true, chimney: true });
    rr(c, -24, -34, 30, 22, 9, '#ff9a3c'); rr(c, -21, -31, 24, 16, 7, '#ffd36a', false);
    c.beginPath(); c.moveTo(22, -26); c.lineTo(50, -26); c.quadraticCurveTo(56, -26, 58, -21); c.lineTo(46, -19); c.lineTo(42, -9); c.lineTo(48, 0); c.lineTo(26, 0); c.lineTo(30, -9); c.lineTo(27, -19); c.closePath(); paint(c, '#4a4560');
  });
  make(scene, 'bd_candleShop', 110, 140, 50, 126, c => {
    shadow(c, 6, 4, 50, 12); house(c, { w: 70, h: 70, d: 16, roofH: 40, wall: '#e8d6c0', roof: '#7a3f55', planks: true, door: true, windows: 2, chimney: true });
    for (let i = 0; i < 4; i++) { rr(c, -30 + i * 7, -82, 4, 10, 1, '#fff1d6'); ell(c, -28 + i * 7, -85, 1.5, 2.4, '#ffb84a', false); }
  });
  make(scene, 'bd_bell', 70, 120, 32, 112, c => {
    shadow(c, 4, 2, 26, 7);
    rr(c, -26, -96, 7, 96, 2, '#5a3a2a'); rr(c, 19, -96, 7, 96, 2, '#5a3a2a');
    poly(c, [-32, -96, 0, -116, 32, -96], '#7a3f55');
    c.beginPath(); c.moveTo(-14, -56); c.quadraticCurveTo(-14, -90, 0, -90); c.quadraticCurveTo(14, -90, 14, -56); c.lineTo(18, -50); c.lineTo(-18, -50); c.closePath(); paint(c, '#ffcf4a'); gloss(c, -6, -78, 3, 8, 0.3);
    circ(c, 0, -48, 4, '#c7465a');
  });
  make(scene, 'bd_tower', 80, 140, 36, 130, c => {
    shadow(c, 4, 3, 30, 8);
    for (const x of [-20, 13]) rr(c, x, -86, 7, 86, 2, '#8a5530');
    line(c, [-18, -10, 19, -60], '#6b3f22', 3); line(c, [19, -10, -18, -60], '#6b3f22', 3);
    rr(c, -28, -100, 56, 16, 3, '#b07a4f'); poly(c, [28, -84, 36, -88, 36, -104, 28, -100], '#8e5c38');
    poly(c, [-32, -100, 0, -128, 32, -100], '#9c3f4f'); poly(c, [0, -128, 8, -132, 40, -104, 32, -100], '#7c2f3f');
  });
  make(scene, 'bd_barracks', 160, 130, 74, 116, c => {
    shadow(c, 8, 4, 74, 15); house(c, { w: 120, h: 48, d: 22, roofH: 30, wall: '#9a7a5a', roof: '#9c3f4f', planks: true, door: true, windows: 2 });
    for (const s of [-1, 1]) { line(c, [s * 50, -48, s * 50, -100], '#5a3a2a', 2); poly(c, [s * 50, -100, s * 50 + 18 * s, -94, s * 50, -86], '#c7465a'); }
  });
  make(scene, 'bd_post', 40, 90, 12, 84, c => { shadow(c, 0, 0, 12, 4); line(c, [0, 0, 0, -78], '#5a3a2a', 3); circ(c, 0, -80, 3, '#ffcf4a'); ell(c, 0, -2, 9, 3, '#7a7692'); });
  make(scene, 'bd_flag', 30, 22, 0, 4, c => { c.beginPath(); c.moveTo(0, 0); c.lineTo(24, 4); c.lineTo(18, 9); c.lineTo(24, 14); c.lineTo(0, 16); c.closePath(); paint(c, '#c7465a'); circ(c, 9, 8, 3, '#ffcf4a', false); });
  make(scene, 'bd_heart', 80, 50, 40, 32, c => { shadow(c, 0, 4, 34, 10); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; circ(c, Math.cos(a) * 26, Math.sin(a) * 11 - 4, 6, i % 2 ? '#8e8aa6' : '#a9a4c2'); } line(c, [-14, -4, 14, -12], '#7a4a2c', 5); line(c, [-14, -12, 14, -4], '#9a5a33', 5); });
  make(scene, 'bd_bonfire', 60, 40, 30, 26, c => { shadow(c, 0, 3, 24, 7); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; circ(c, Math.cos(a) * 18, Math.sin(a) * 7 - 3, 4.5, i % 2 ? '#8e8aa6' : '#a9a4c2'); } line(c, [-10, -3, 10, -8], '#7a4a2c', 4); line(c, [-10, -8, 10, -3], '#9a5a33', 4); });
  make(scene, 'bd_ash', 60, 40, 30, 26, c => { shadow(c, 0, 3, 24, 7); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; circ(c, Math.cos(a) * 18, Math.sin(a) * 7 - 3, 4.5, '#77738c'); } ell(c, 0, -4, 10, 4, '#3a3346', false); });
  make(scene, 'bd_lantern', 30, 100, 15, 94, c => { shadow(c, 0, 2, 10, 4); rr(c, -3, -62, 6, 62, 2, '#2f2545'); poly(c, [-9, -62, 9, -62, 7, -82, -7, -82], '#3a3346'); rr(c, -6, -79, 12, 15, 2, '#ffe8a8', false); poly(c, [-11, -82, 0, -94, 11, -82], '#2f2545'); });
  make(scene, 'bd_lantern_off', 30, 100, 15, 94, c => { shadow(c, 0, 2, 10, 4); rr(c, -3, -62, 6, 62, 2, '#2f2545'); poly(c, [-9, -62, 9, -62, 7, -82, -7, -82], '#3a3346'); rr(c, -6, -79, 12, 15, 2, '#5d566b', false); poly(c, [-11, -82, 0, -94, 11, -82], '#2f2545'); });
  make(scene, 'bd_pal', 54, 70, 27, 60, c => {
    shadow(c, 0, 2, 22, 6);
    const stakes = [[-15, 3, 40], [-5, -1, 46], [6, 0, 43], [16, 3, 38]];
    for (const [x, y, h] of stakes) { rr(c, x - 5, y - h, 10, h, 2, '#a8693f'); poly(c, [x - 5, y - h, x, y - h - 8, x + 5, y - h], '#c98a55'); line(c, [x - 2, y - h + 4, x - 2, y - 4], '#c98a55', 1.2); }
    line(c, [-20, -22, 21, -20], '#e8d6a8', 2);
  });
  make(scene, 'bd_pal2', 56, 60, 28, 50, c => {
    shadow(c, 0, 2, 24, 6);
    for (let row = 0; row < 4; row++) for (let i = 0; i < 3; i++) rr(c, -22 + i * 15 + (row % 2) * 5, -10 - row * 9, 14, 9, 3, row % 2 ? '#a9a4c2' : '#8e8aa6');
    ell(c, -10, -40, 8, 3, '#6fa06a', false);
  });
  make(scene, 'bd_palx', 54, 30, 27, 20, c => { for (const [x, y] of [[-12, 0], [0, 2], [12, -1]]) { line(c, [x - 6, y, x + 6, y - 4], '#a8693f', 5); } });
  make(scene, 'bd_flowerbed', 50, 34, 25, 24, c => { rr(c, -20, -12, 40, 14, 6, '#7a4a2c'); rr(c, -17, -13, 34, 9, 5, '#5a3a2a', false); ['#ff9fb0', '#fff1a8', '#c7b6ff', '#ff8fa3', '#ffffff'].forEach((col, i) => { line(c, [-13 + i * 6.5, -10, -13 + i * 6.5, -18], '#3f7d63', 1.4); circ(c, -13 + i * 6.5, -19, 3, col); }); });
  make(scene, 'bd_bench', 50, 34, 25, 24, c => { shadow(c, 0, 0, 20, 5); rr(c, -20, -16, 40, 5, 2, '#b07a4f'); rr(c, -20, -9, 40, 5, 2, '#c98a55'); line(c, [-16, -4, -16, 2], '#5a3a2a', 3); line(c, [16, -4, 16, 2], '#5a3a2a', 3); });
  make(scene, 'bd_banner', 30, 100, 8, 94, c => { shadow(c, 0, 0, 8, 3); line(c, [0, 0, 0, -88], '#5a3a2a', 2.5); circ(c, 0, -90, 3, '#ffcf4a'); });
  make(scene, 'bd_banner_cloth', 26, 42, 0, 2, c => { c.beginPath(); c.moveTo(0, 0); c.lineTo(20, 0); c.lineTo(20, 36); c.lineTo(10, 30); c.lineTo(0, 36); c.closePath(); paint(c, '#5e4a86'); circ(c, 10, 14, 5, '#ffcf4a', false); c.fillStyle = '#5e4a86'; c.beginPath(); c.arc(12, 13, 4, 0, TAU); c.fill(); });
  make(scene, 'bd_fountain', 100, 80, 50, 56, c => { shadow(c, 0, 4, 44, 14); ell(c, 0, -6, 42, 16, '#a9a4c2'); ell(c, 0, -8, 34, 12, '#6fb9d6', false); rr(c, -6, -40, 12, 32, 3, '#a9a4c2'); ell(c, 0, -40, 14, 5, '#b8b0c8'); gloss(c, -14, -12, 10, 3, 0.35); });
  make(scene, 'site', 100, 90, 50, 80, c => {
    shadow(c, 0, 2, 40, 10);
    rr(c, -36, -6, 72, 8, 2, '#c99a5c');
    for (const x of [-30, 30]) line(c, [x, 0, x, -56], '#8a5530', 3);
    line(c, [-30, -56, 30, -56], '#8a5530', 3); line(c, [-30, -30, 30, -30], '#a8693f', 2.5); line(c, [-30, 0, 30, -56], '#a8693f', 2);
    rr(c, -10, -20, 20, 14, 2, '#efc98e');
  });

  // decor
  make(scene, 'dc_tuft', 16, 12, 8, 10, c => { line(c, [-4, 0, -6, -7], '#5f9160', 2); line(c, [0, 0, 0, -9], '#6ea86c', 2); line(c, [4, 0, 6, -7], '#5f9160', 2); });
  make(scene, 'dc_tuft2', 16, 12, 8, 10, c => { line(c, [-4, 0, -6, -7], '#635583', 2); line(c, [0, 0, 0, -9], '#73659a', 2); line(c, [4, 0, 6, -7], '#635583', 2); });
  ['#ffd1e3', '#fff1a8', '#c7b6ff', '#ffffff'].forEach((col, j) => make(scene, 'dc_flower' + j, 14, 14, 7, 7, c => { for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; c.fillStyle = col; c.beginPath(); c.arc(Math.cos(a) * 3, Math.sin(a) * 3, 2.4, 0, TAU); c.fill(); } c.fillStyle = '#ffb84a'; c.beginPath(); c.arc(0, 0, 1.8, 0, TAU); c.fill(); }));
  make(scene, 'dc_shroom', 14, 14, 7, 12, c => { rr(c, -1.5, -6, 3, 6, 1, '#fff4e0'); c.beginPath(); c.arc(0, -6, 5, Math.PI, 0); c.closePath(); paint(c, '#e9667a'); circ(c, -2, -8, 0.9, '#fff', false); });
  make(scene, 'dc_pebble', 20, 14, 10, 8, c => { ell(c, 0, 0, 7, 4.5, '#a9a4bc'); gloss(c, -2, -2, 3, 1.5, 0.3); });
  make(scene, 'dc_grave', 28, 36, 14, 32, c => { shadow(c, 0, 2, 14, 4); rr(c, -11, -28, 22, 28, [11, 11, 2, 2], '#9c97b5'); c.fillStyle = '#6d6888'; c.font = 'bold 7px Nunito, sans-serif'; c.textAlign = 'center'; c.fillText('ПУХ', 0, -14); });
  make(scene, 'dc_bush', 50, 40, 25, 34, c => { circ(c, -10, -12, 12, '#3e6e4e'); circ(c, 10, -12, 12, '#3e6e4e'); circ(c, 0, -20, 13, '#477a57'); gloss(c, -5, -26, 6, 3, 0.15); });
  make(scene, 'dc_cobble', 30, 22, 15, 11, c => { rr(c, -13, -9, 26, 18, 6, '#cdb99c', false); rr(c, -12, -9, 24, 6, 4, '#dccab0', false); });
  make(scene, 'grass_tile', 128, 128, 0, 0, c => {
    c.fillStyle = '#7fae74'; c.fillRect(0, 0, 128, 128);
    let s = 9; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    for (let i = 0; i < 26; i++) { const x = r() * 128, y = r() * 128, rad = 10 + r() * 22; c.fillStyle = r() < 0.5 ? 'rgba(98,150,92,.35)' : 'rgba(150,196,128,.28)'; for (const [ox, oy] of [[0, 0], [128, 0], [-128, 0], [0, 128], [0, -128]]) { c.beginPath(); c.ellipse(x + ox, y + oy, rad, rad * 0.7, 0, 0, TAU); c.fill(); } }
    for (let i = 0; i < 40; i++) { const x = r() * 124 + 2, y = r() * 124 + 2; c.strokeStyle = r() < 0.5 ? '#6a9c62' : '#8cbf7c'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 1.5, y - 4); c.moveTo(x + 2, y); c.lineTo(x + 3, y - 3.5); c.stroke(); }
  });

  // fx
  make(scene, 'fx_dot', 12, 12, 6, 6, c => circ(c, 0, 0, 5, '#ffffff', false));
  make(scene, 'fx_star', 16, 16, 8, 8, c => { c.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 3 : 7; c.lineTo(Math.cos(i / 10 * TAU) * r, Math.sin(i / 10 * TAU) * r); } c.closePath(); c.fillStyle = '#ffffff'; c.fill(); });
  make(scene, 'fx_leaf', 12, 8, 6, 4, c => ell(c, 0, 0, 5, 2.6, '#ffffff', false));
  make(scene, 'fx_chip', 8, 6, 4, 3, c => { c.fillStyle = '#ffffff'; c.fillRect(-3, -1.5, 6, 3); });
  make(scene, 'fx_puff', 32, 32, 16, 16, c => { const g = c.createRadialGradient(0, 0, 0, 0, 0, 15); g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(-16, -16, 32, 32); });
  make(scene, 'fx_cone', 14, 14, 7, 7, c => ell(c, 0, 0, 4, 6, '#8a5530'));
  make(scene, 'fx_pebble', 10, 10, 5, 5, c => circ(c, 0, 0, 3, '#a9a4bc'));
  make(scene, 'fx_glow', 64, 64, 32, 32, c => { const g = c.createRadialGradient(0, 0, 0, 0, 0, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(-32, -32, 64, 64); });
  make(scene, 'fx_flame', 24, 34, 12, 30, c => { c.beginPath(); c.moveTo(0, -30); c.quadraticCurveTo(12, -12, 8, -2); c.quadraticCurveTo(0, 4, -8, -2); c.quadraticCurveTo(-12, -12, 0, -30); c.fillStyle = '#ff8a2a'; c.fill(); c.beginPath(); c.moveTo(0, -20); c.quadraticCurveTo(6, -8, 4, -2); c.quadraticCurveTo(0, 1, -4, -2); c.quadraticCurveTo(-6, -8, 0, -20); c.fillStyle = '#ffe08a'; c.fill(); });
  make(scene, 'fx_ring', 100, 100, 50, 50, c => { c.lineWidth = 4; c.strokeStyle = '#ffffff'; c.beginPath(); c.ellipse(0, 0, 46, 23, 0, 0, TAU); c.stroke(); });
  make(scene, 'fx_tele', 220, 112, 110, 56, c => { c.beginPath(); c.ellipse(0, 0, 108, 54, 0, 0, TAU); c.fillStyle = 'rgba(255,70,100,.28)'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#ff4664'; c.stroke(); });
  make(scene, 'fx_shadow', 40, 16, 20, 8, c => shadow(c, 0, 0, 18, 6, 0.28));
  make(scene, 'fx_arrow', 30, 24, 4, 12, c => poly(c, [22, 0, 4, -10, 9, 0, 4, 10], '#ffcf4a'));
  make(scene, 'fx_marker', 24, 20, 12, 18, c => poly(c, [-10, -14, 10, -14, 0, 2], '#ffcf4a'));
  make(scene, 'fx_vignette', 128, 128, 64, 64, c => { const g = c.createRadialGradient(0, 0, 30, 0, 0, 92); g.addColorStop(0, 'rgba(20,10,40,0)'); g.addColorStop(1, 'rgba(20,10,40,.55)'); c.fillStyle = g; c.fillRect(-64, -64, 128, 128); });
  packAtlases(scene);
}
