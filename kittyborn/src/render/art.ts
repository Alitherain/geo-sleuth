// Procedural art: every sprite is drawn once with Canvas 2D into a texture, then moved around as an Image.
import Phaser from 'phaser';
import type { ItemId } from '../content/data';

export const TEX = 3; // texture pixels per world unit, keeps sprites crisp at tablet zoom
export const INK = '#2a2140';
const TAU = Math.PI * 2;
export interface ArtMeta { w: number; h: number; ox: number; oy: number }
export const ART: Record<string, ArtMeta> = {};

type C = CanvasRenderingContext2D;
function make(scene: Phaser.Scene, key: string, w: number, h: number, ox: number, oy: number, draw: (c: C) => void) {
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w * TEX); cv.height = Math.ceil(h * TEX);
  const c = cv.getContext('2d')!;
  c.scale(TEX, TEX); c.translate(ox, oy);
  c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = INK; c.lineWidth = 2.2;
  draw(c);
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, cv);
  ART[key] = { w, h, ox, oy };
}
/** Image with origin and scale set so (x, y) is the art's anchor point in world units. */
export function img(scene: Phaser.Scene, key: string, x = 0, y = 0): Phaser.GameObjects.Image {
  const m = ART[key];
  const i = scene.add.image(x, y, key);
  i.setOrigin(m.ox / m.w, m.oy / m.h).setScale(1 / TEX);
  return i;
}

// ---------------------------------------------------------------- primitives
function circ(c: C, x: number, y: number, r: number, fill: string, stroke = true) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = fill; c.fill(); if (stroke) c.stroke(); }
function ell(c: C, x: number, y: number, rx: number, ry: number, fill: string, stroke = true) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fillStyle = fill; c.fill(); if (stroke) c.stroke(); }
function rr(c: C, x: number, y: number, w: number, h: number, r: number | number[]) { c.beginPath(); c.roundRect(x, y, w, h, r); }
function shadow(c: C, x: number, y: number, rx: number, ry: number, a = 0.22) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fillStyle = `rgba(30,18,60,${a})`; c.fill(); }
function tri(c: C, pts: number[], fill: string, stroke = true) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); c.fillStyle = fill; c.fill(); if (stroke) c.stroke(); }

export function drawItem(c: C, type: ItemId | 'coin', s = 1) {
  c.save(); c.scale(s, s); c.lineWidth = 1.6; c.strokeStyle = INK;
  if (type === 'log' || type === 'lav') {
    rr(c, -12, -5, 22, 10, 4); c.fillStyle = type === 'lav' ? '#8a6cc2' : '#9a5a33'; c.fill(); c.stroke();
    ell(c, 10, 0, 4, 5, type === 'lav' ? '#e2d4ff' : '#e8c08a'); ell(c, 10, 0, 1.6, 2.2, type === 'lav' ? '#b79ae8' : '#c48f55', false);
  } else if (type === 'plank') {
    rr(c, -13, -3.5, 26, 7, 1.5); c.fillStyle = '#efc98e'; c.fill(); c.stroke();
    c.strokeStyle = '#c99a5c'; c.beginPath(); c.moveTo(-9, 0); c.lineTo(9, 0); c.stroke();
  } else if (type === 'meat') {
    c.beginPath(); c.moveTo(2, 0); c.lineTo(12, -3); c.stroke();
    circ(c, 13, -4.5, 2.4, '#fff8ec'); circ(c, 14, -1.8, 2.4, '#fff8ec');
    ell(c, -3, 0, 9, 7, '#d9615e'); ell(c, -5, -2, 4, 2.5, '#ef8f87', false);
  } else if (type === 'fluff') {
    for (const [x, y, r] of [[-5, 1, 6], [4, 1, 6], [0, -3, 6.5]]) circ(c, x, y, r, '#cbb8f0');
    circ(c, -1, -4, 2, '#fff', false);
  } else if (type === 'coin') {
    circ(c, 0, 0, 6, '#ffcf4a'); circ(c, 0, 0, 3.2, '#ffe596', false);
  }
  c.restore();
}

// ---------------------------------------------------------------- characters
function kittenBody(c: C, opt: { fur: string; muzzle: string; eye: string; blink: boolean; hat: 'hunter' | 'hard' | 'cap' | 'mini'; scarf: string; coat: string; size: number }) {
  const S = opt.size;
  c.save(); c.scale(S, S);
  // body / coat
  c.beginPath(); c.moveTo(-11, -6); c.quadraticCurveTo(-12, -24, 0, -26); c.quadraticCurveTo(12, -24, 11, -6); c.closePath();
  c.fillStyle = opt.coat; c.fill(); c.stroke();
  c.fillStyle = '#ffcf4a'; c.beginPath(); c.arc(3, -16, 1.5, 0, TAU); c.fill(); c.beginPath(); c.arc(3, -11, 1.5, 0, TAU); c.fill();
  // head
  const hy = -38;
  tri(c, [-14, hy - 4, -12, hy - 21, -3, hy - 13], opt.fur); tri(c, [14, hy - 4, 12, hy - 21, 3, hy - 13], opt.fur);
  tri(c, [-12, hy - 7, -11, hy - 17, -6, hy - 12], '#ff9fb0', false); tri(c, [12, hy - 7, 11, hy - 17, 6, hy - 12], '#ff9fb0', false);
  ell(c, 0, hy, 16, 14, opt.fur);
  ell(c, 2, hy + 6, 8, 5.5, opt.muzzle, false);
  // eyes
  for (const ex of [-5.5, 6.5]) {
    if (opt.blink) { c.beginPath(); c.moveTo(ex - 3.5, hy); c.quadraticCurveTo(ex, hy + 2, ex + 3.5, hy); c.stroke(); continue; }
    ell(c, ex, hy, 4, 5, opt.eye, false); ell(c, ex + 0.5, hy + 0.5, 1.6, 3.6, '#1a1428', false);
    circ(c, ex - 1.4, hy - 2, 1.4, '#fff', false); circ(c, ex + 1.5, hy + 2.2, 0.7, '#fff', false);
  }
  // nose, mouth, whiskers, blush
  tri(c, [0.5, hy + 4, 3.5, hy + 4, 2, hy + 6], '#ff8fa3', false);
  c.lineWidth = 1.2; c.beginPath(); c.moveTo(2, hy + 6); c.quadraticCurveTo(0, hy + 8.5, -1.5, hy + 7); c.moveTo(2, hy + 6); c.quadraticCurveTo(4, hy + 8.5, 5.5, hy + 7); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.65)'; c.beginPath(); c.moveTo(9, hy + 5); c.lineTo(18, hy + 3); c.moveTo(9, hy + 7); c.lineTo(18, hy + 8); c.moveTo(-6, hy + 5); c.lineTo(-15, hy + 3); c.stroke();
  c.strokeStyle = INK; c.lineWidth = 2.2;
  ell(c, -9, hy + 5, 2.6, 1.5, 'rgba(255,140,170,.55)', false); ell(c, 11, hy + 5, 2.6, 1.5, 'rgba(255,140,170,.55)', false);
  // scarf
  if (opt.scarf) {
    rr(c, -11, hy + 11, 22, 6, 3); c.fillStyle = opt.scarf; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(-8, hy + 15); c.quadraticCurveTo(-16, hy + 18, -19, hy + 14); c.lineTo(-17, hy + 21); c.quadraticCurveTo(-11, hy + 21, -5, hy + 17); c.closePath(); c.fill(); c.stroke();
  }
  // hats
  if (opt.hat === 'hunter') {
    ell(c, 0, hy - 12, 24, 6.5, '#33264a');
    c.beginPath(); c.moveTo(-11, hy - 13); c.quadraticCurveTo(-12, hy - 30, 0, hy - 31); c.quadraticCurveTo(12, hy - 30, 11, hy - 13); c.closePath(); c.fillStyle = '#33264a'; c.fill(); c.stroke();
    c.fillStyle = '#c7465a'; c.fillRect(-11, hy - 18, 22, 4);
    c.beginPath(); c.moveTo(-8, hy - 17); c.quadraticCurveTo(-19, hy - 33, -13, hy - 40); c.quadraticCurveTo(-11, hy - 27, -5, hy - 18); c.fillStyle = '#f2b8d0'; c.fill(); c.stroke();
  } else if (opt.hat === 'hard') {
    c.beginPath(); c.ellipse(0, hy - 9, 12, 8, 0, Math.PI, 0); c.closePath(); c.fillStyle = '#ffcf4a'; c.fill(); c.stroke();
    rr(c, -15, hy - 10, 30, 4, 2); c.fill(); c.stroke();
  } else if (opt.hat === 'cap') {
    c.beginPath(); c.ellipse(0, hy - 9, 11, 7, 0, Math.PI, 0); c.closePath(); c.fillStyle = '#5a8fd6'; c.fill(); c.stroke();
    ell(c, 10, hy - 9, 7, 2.4, '#5a8fd6');
  } else {
    ell(c, 0, hy - 11, 17, 4, '#2a2140');
    c.beginPath(); c.moveTo(-8, hy - 12); c.quadraticCurveTo(-8, hy - 24, 0, hy - 24); c.quadraticCurveTo(8, hy - 24, 8, hy - 12); c.fillStyle = '#2a2140'; c.fill(); c.stroke();
    c.fillStyle = '#c7465a'; c.fillRect(-8, hy - 16, 16, 3);
  }
  c.restore();
}
function tail(c: C, fur: string, s: number) {
  c.save(); c.scale(s, s);
  c.lineWidth = 6.5; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-10, -4, -8, -18); c.strokeStyle = INK; c.stroke();
  c.lineWidth = 3.8; c.strokeStyle = fur; c.stroke();
  c.restore();
}
function leg(c: C, col: string, s: number) { c.save(); c.scale(s, s); rr(c, -3.5, -9, 7, 10, 3.5); c.fillStyle = col; c.fill(); c.stroke(); c.restore(); }
function weaponAxe(c: C) {
  c.lineWidth = 3.4; c.strokeStyle = '#6b3f22'; c.beginPath(); c.moveTo(0, 4); c.lineTo(0, -22); c.stroke();
  c.lineWidth = 2; c.strokeStyle = INK;
  c.beginPath(); c.moveTo(0, -24); c.quadraticCurveTo(14, -26, 13, -12); c.quadraticCurveTo(6, -15, 0, -14); c.closePath(); c.fillStyle = '#dfe4ef'; c.fill(); c.stroke();
}
function weaponSaw(c: C) {
  c.lineWidth = 3.4; c.strokeStyle = '#6b3f22'; c.beginPath(); c.moveTo(0, 4); c.lineTo(0, -8); c.stroke();
  c.lineWidth = 2; c.strokeStyle = INK;
  rr(c, -3, -30, 9, 24, 3); c.fillStyle = '#dfe4ef'; c.fill(); c.stroke();
  c.fillStyle = '#9aa3b8'; for (let i = 0; i < 6; i++) tri(c, [6, -28 + i * 4, 9, -26 + i * 4, 6, -24 + i * 4], '#9aa3b8', false);
}

// ---------------------------------------------------------------- beasts
function beast(c: C, r: number, base: string, belly: string, eye: string, horn: boolean, boss: boolean, white = false) {
  if (white) { base = belly = '#ffffff'; }
  ell(c, -r * 0.45, -2, r * 0.28, r * 0.18, white ? '#fff' : '#2f2840'); ell(c, r * 0.45, -2, r * 0.28, r * 0.18, white ? '#fff' : '#2f2840');
  const cy = -r;
  if (horn || boss) for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * r * 0.35, cy - r * 0.7); c.quadraticCurveTo(s * r * 0.9, cy - r * 1.3, s * r * 0.55, cy - r * 1.55); c.quadraticCurveTo(s * r * 0.55, cy - r * 1.05, s * r * 0.1, cy - r * 0.8); c.closePath(); c.fillStyle = white ? '#fff' : '#efe2c4'; c.fill(); c.stroke(); }
  else for (const s of [-1, 1]) tri(c, [s * r * 0.3, cy - r * 0.75, s * r * 0.5, cy - r * 1.18, s * r * 0.65, cy - r * 0.62], base);
  c.save(); c.translate(0, cy);
  const n = boss ? 22 : 13;
  c.beginPath();
  for (let i = 0; i <= n * 2; i++) { const a = i / (n * 2) * TAU, rr2 = i % 2 ? r * 0.88 : r; const x = Math.cos(a) * rr2, y = Math.sin(a) * rr2 * 0.92; i ? c.lineTo(x, y) : c.moveTo(x, y); }
  c.closePath(); c.fillStyle = base; c.fill(); c.stroke();
  ell(c, r * 0.1, r * 0.3, r * 0.55, r * 0.45, belly, false);
  if (!white) for (const s of [-1, 1]) {
    const ex = s * r * 0.32 + r * 0.12, ey = -r * 0.12;
    c.beginPath(); c.arc(ex, ey, r * 0.26, 0, TAU); c.fillStyle = 'rgba(255,240,180,.25)'; c.fill();
    ell(c, ex, ey, r * 0.16, r * 0.2, eye, false); circ(c, ex - r * 0.05, ey - r * 0.07, r * 0.06, '#fff', false);
    if (eye !== '#ffe066') { c.beginPath(); c.moveTo(ex - s * r * 0.22, ey - r * 0.32); c.lineTo(ex + s * r * 0.14, ey - r * 0.2); c.stroke(); }
  }
  if (!white) {
    c.beginPath(); c.moveTo(r * 0.12 - r * 0.14, r * 0.2); c.quadraticCurveTo(r * 0.12, r * 0.3, r * 0.12 + r * 0.14, r * 0.2); c.stroke();
    tri(c, [r * 0.02, r * 0.22, r * 0.06, r * 0.32, r * 0.1, r * 0.24], '#fff', false);
    if (boss) { c.beginPath(); c.arc(0, -r * 0.58, r * 0.13, 0.6, TAU - 0.6); c.fillStyle = '#ffe9a8'; c.fill(); }
  }
  c.restore();
}

// ---------------------------------------------------------------- build all textures
export function buildArt(scene: Phaser.Scene) {
  for (const k of ['log', 'lav', 'plank', 'meat', 'fluff', 'coin'] as const) make(scene, 'it_' + k, 34, 20, 16, 10, c => drawItem(c, k));

  // hero kitten
  const hero = { fur: '#2f2840', muzzle: '#4a4060', eye: '#c6f56b', hat: 'hunter' as const, scarf: '#c7465a', coat: '#4a3a6a', size: 1 };
  make(scene, 'hero', 60, 104, 30, 96, c => kittenBody(c, { ...hero, blink: false }));
  make(scene, 'hero_b', 60, 104, 30, 96, c => kittenBody(c, { ...hero, blink: true }));
  make(scene, 'hero_tail', 30, 30, 22, 24, c => tail(c, '#2f2840', 1));
  make(scene, 'hero_leg', 12, 14, 6, 12, c => leg(c, '#2f2840', 1));
  make(scene, 'w_axe', 30, 38, 6, 32, weaponAxe);
  make(scene, 'w_saw', 24, 40, 8, 34, weaponSaw);
  // helper cats
  const roles = { lumber: { fur: '#f2a65a', muzzle: '#ffd9a8', eye: '#2a2140', hat: 'hard' as const, scarf: '', coat: '#c97a3a' },
    hauler: { fur: '#a9a6b8', muzzle: '#e2e0ea', eye: '#2a2140', hat: 'cap' as const, scarf: '#5a8fd6', coat: '#7f7a96' },
    guard: { fur: '#3a3346', muzzle: '#5d566b', eye: '#ffd84a', hat: 'mini' as const, scarf: '#c7465a', coat: '#2f2a3c' } };
  for (const [k, r] of Object.entries(roles)) {
    make(scene, 'cat_' + k, 46, 80, 23, 74, c => kittenBody(c, { ...r, blink: false, size: 0.72 }));
    make(scene, 'cat_' + k + '_b', 46, 80, 23, 74, c => kittenBody(c, { ...r, blink: true, size: 0.72 }));
    make(scene, 'cat_' + k + '_tail', 24, 24, 18, 19, c => tail(c, r.fur, 0.75));
    make(scene, 'cat_' + k + '_leg', 10, 12, 5, 10, c => leg(c, r.fur, 0.75));
  }

  // beasts
  make(scene, 'b_fluff', 50, 56, 25, 50, c => beast(c, 17, '#4a4068', '#8b80b3', '#ffe066', false, false));
  make(scene, 'b_fluff_a', 50, 56, 25, 50, c => beast(c, 17, '#4a4068', '#8b80b3', '#ff5470', false, false));
  make(scene, 'b_fluff_w', 50, 56, 25, 50, c => beast(c, 17, '', '', '', false, false, true));
  make(scene, 'b_horn', 64, 84, 32, 76, c => beast(c, 22, '#5a3a4a', '#9a6f80', '#ff5470', true, false));
  make(scene, 'b_horn_w', 64, 84, 32, 76, c => beast(c, 22, '', '', '', true, false, true));
  make(scene, 'b_boss', 140, 196, 70, 186, c => { c.lineWidth = 3; beast(c, 52, '#4b3a66', '#8a76b0', '#ff5470', true, true); });
  make(scene, 'b_boss_w', 140, 196, 70, 186, c => { c.lineWidth = 3; beast(c, 52, '', '', '', true, true, true); });

  // trees
  make(scene, 'tr_oak', 84, 112, 42, 104, c => {
    shadow(c, 0, 2, 30, 9); rr(c, -6, -34, 12, 34, 4); c.fillStyle = '#8a5530'; c.fill(); c.stroke();
    circ(c, -14, -48, 18, '#4c8b5b'); circ(c, 14, -48, 18, '#4c8b5b'); circ(c, 0, -66, 22, '#5fa267');
    c.beginPath(); c.arc(-6, -72, 9, Math.PI * 1.1, Math.PI * 1.8); c.strokeStyle = '#86c47c'; c.lineWidth = 3; c.stroke(); c.strokeStyle = INK; c.lineWidth = 2.2;
    circ(c, 10, -58, 2.6, '#e9667a'); circ(c, -12, -52, 2.6, '#e9667a');
  });
  make(scene, 'tr_pine', 72, 112, 36, 104, c => {
    shadow(c, 0, 2, 26, 8); rr(c, -6, -30, 12, 30, 4); c.fillStyle = '#8a5530'; c.fill(); c.stroke();
    const cols = ['#3f7d63', '#4a8d6c', '#5aa077'];
    for (let i = 0; i < 3; i++) { const yy = -26 - i * 20, w = 30 - i * 7; c.beginPath(); c.moveTo(-w, yy); c.quadraticCurveTo(0, yy - 34 + i * 4, w, yy); c.quadraticCurveTo(0, yy + 6, -w, yy); c.closePath(); c.fillStyle = cols[i]; c.fill(); c.stroke(); }
  });
  make(scene, 'tr_lav', 90, 118, 45, 110, c => {
    shadow(c, 0, 2, 32, 9); rr(c, -6, -34, 12, 34, 4); c.fillStyle = '#7a5a8a'; c.fill(); c.stroke();
    circ(c, -16, -46, 19, '#8a6cc2'); circ(c, 16, -46, 19, '#8a6cc2'); circ(c, 0, -68, 24, '#a88ad8');
    for (let i = 0; i < 5; i++) { const a = i * 1.7; circ(c, Math.cos(a) * 14, -58 + Math.sin(a) * 12, 1.9, '#fff4c0', false); }
  });
  make(scene, 'tr_stump', 30, 20, 15, 12, c => { shadow(c, 0, 2, 12, 5); ell(c, 0, -3, 11, 6, '#9a5a33'); ell(c, 0, -5, 9, 4.5, '#e8c08a'); ell(c, 0, -5, 4, 2, '#c48f55', false); });
  make(scene, 'tr_bg', 60, 120, 30, 112, c => {
    c.beginPath(); c.moveTo(-26, 0); c.quadraticCurveTo(0, -110, 26, 0); c.closePath(); c.fillStyle = '#2f4a4a'; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(-18, -30); c.quadraticCurveTo(0, -120, 18, -30); c.closePath(); c.fillStyle = '#365656'; c.fill(); c.stroke();
  });

  // buildings
  make(scene, 'bd_shop', 190, 200, 95, 190, c => {
    shadow(c, 0, 8, 85, 18);
    rr(c, -70, -95, 140, 95, 6); c.fillStyle = '#6c4f8f'; c.fill(); c.stroke();
    c.fillStyle = '#8c6aae'; c.fillRect(-62, -70, 124, 4);
    (['log', 'plank', 'meat', 'fluff', 'lav'] as const).forEach((k, i) => { c.save(); c.translate(-48 + i * 24, -76); drawItem(c, k, 0.8); c.restore(); });
    // owl
    c.save(); c.translate(0, -44);
    ell(c, 0, 0, 20, 22, '#9c6b48'); ell(c, 0, 6, 12, 13, '#e9cfa6', false);
    tri(c, [-15, -15, -18, -27, -7, -19], '#9c6b48'); tri(c, [15, -15, 18, -27, 7, -19], '#9c6b48');
    for (const s of [-1, 1]) { circ(c, s * 8, -6, 8, '#fff6e2'); circ(c, s * 8, -5, 4.5, '#2a2140', false); circ(c, s * 8 - 1.5, -7, 1.5, '#fff', false); }
    tri(c, [-3, 1, 3, 1, 0, 6], '#ffb84a');
    c.beginPath(); c.arc(8, -6, 9, 0, TAU); c.strokeStyle = '#ffcf4a'; c.stroke(); c.strokeStyle = INK;
    c.restore();
    rr(c, -78, -28, 156, 30, 6); c.fillStyle = '#a8693f'; c.fill(); c.stroke();
    c.fillStyle = '#7a4a2c'; rr(c, -80, -150, 9, 150, 3); c.fill(); c.stroke(); rr(c, 71, -150, 9, 150, 3); c.fill(); c.stroke();
    const n = 7, w = 180 / n;
    for (let i = 0; i < n; i++) { const x0 = -90 + i * w; c.beginPath(); c.moveTo(x0, -150); c.lineTo(x0 + w, -150); c.lineTo(x0 + w, -122); c.quadraticCurveTo(x0 + w / 2, -110, x0, -122); c.closePath(); c.fillStyle = i % 2 ? '#fff0d6' : '#8a4fae'; c.fill(); c.stroke(); }
    rr(c, -46, -182, 92, 28, 8); c.fillStyle = '#2f2350'; c.fill(); c.stroke();
    c.fillStyle = '#ffcf4a'; c.font = 'bold 15px Nunito, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('ЛАВКА', 0, -167);
  });
  make(scene, 'bd_sawmill', 160, 150, 80, 140, c => {
    shadow(c, 0, 6, 80, 16);
    rr(c, -60, -80, 120, 80, 6); c.fillStyle = '#b07a4f'; c.fill(); c.stroke();
    c.strokeStyle = '#8e5c38'; for (let i = 1; i < 6; i++) { c.beginPath(); c.moveTo(-60, -80 + i * 13); c.lineTo(60, -80 + i * 13); c.stroke(); } c.strokeStyle = INK;
    tri(c, [-72, -78, 0, -128, 72, -78], '#9c3f4f');
    rr(c, -14, -46, 28, 46, 4); c.fillStyle = '#5a3a2a'; c.fill(); c.stroke();
  });
  make(scene, 'bd_blade', 44, 44, 22, 22, c => {
    c.beginPath(); for (let i = 0; i < 24; i++) { const a = i / 24 * TAU, r2 = i % 2 ? 15 : 19; c.lineTo(Math.cos(a) * r2, Math.sin(a) * r2); } c.closePath(); c.fillStyle = '#e3e8f2'; c.fill(); c.stroke();
    circ(c, 0, 0, 4, '#9c3f4f');
  });
  make(scene, 'bd_storage', 130, 120, 65, 110, c => {
    shadow(c, 0, 6, 62, 14);
    rr(c, -52, -66, 104, 66, 6); c.fillStyle = '#9a7ab8'; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(-60, -62); c.quadraticCurveTo(0, -104, 60, -62); c.closePath(); c.fillStyle = '#4a3a6a'; c.fill(); c.stroke();
    rr(c, -22, -44, 44, 44, [20, 20, 2, 2]); c.fillStyle = '#5a3a2a'; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(-22, -22); c.lineTo(22, -22); c.moveTo(0, -44); c.lineTo(0, 0); c.stroke();
    c.save(); c.translate(-38, -12); drawItem(c, 'plank', 0.7); c.restore(); c.save(); c.translate(38, -12); drawItem(c, 'log', 0.7); c.restore();
  });
  make(scene, 'bd_forge', 130, 120, 60, 110, c => {
    shadow(c, 0, 6, 60, 13);
    rr(c, -48, -62, 60, 62, 12); c.fillStyle = '#8e8aa6'; c.fill(); c.stroke();
    rr(c, -38, -40, 40, 26, 10); c.fillStyle = '#ff9a3c'; c.fill(); c.stroke();
    rr(c, -30, -92, 20, 32, 3); c.fillStyle = '#6f6b88'; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(14, -30); c.lineTo(50, -30); c.quadraticCurveTo(58, -30, 60, -24); c.lineTo(44, -22); c.lineTo(40, -10); c.lineTo(46, 0); c.lineTo(18, 0); c.lineTo(24, -10); c.lineTo(20, -22); c.closePath(); c.fillStyle = '#4a4560'; c.fill(); c.stroke();
  });
  make(scene, 'bd_bell', 70, 120, 35, 112, c => {
    shadow(c, 0, 2, 26, 7);
    c.fillStyle = '#5a3a2a'; rr(c, -26, -100, 7, 100, 2); c.fill(); c.stroke(); rr(c, 19, -100, 7, 100, 2); c.fill(); c.stroke();
    rr(c, -30, -106, 60, 10, 3); c.fillStyle = '#7a4a2c'; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(-14, -60); c.quadraticCurveTo(-14, -94, 0, -94); c.quadraticCurveTo(14, -94, 14, -60); c.lineTo(18, -54); c.lineTo(-18, -54); c.closePath(); c.fillStyle = '#ffcf4a'; c.fill(); c.stroke();
    circ(c, 0, -52, 4, '#c7465a');
  });
  const houseCols: Record<string, string> = { lumber: '#f6c38d', hauler: '#c9c6d8', guard: '#5d566b' };
  for (const [k, col] of Object.entries(houseCols)) make(scene, 'bd_house_' + k, 64, 70, 32, 62, c => {
    shadow(c, 0, 4, 30, 8);
    rr(c, -22, -34, 44, 34, 6); c.fillStyle = col; c.fill(); c.stroke();
    tri(c, [-28, -30, -24, -58, -10, -44, 10, -44, 24, -58, 28, -30], '#c7465a');
    c.beginPath(); c.arc(0, 0, 11, Math.PI, 0); c.closePath(); c.fillStyle = '#2a2140'; c.fill();
  });
  make(scene, 'bd_tower', 70, 130, 35, 122, c => {
    shadow(c, 0, 3, 28, 8);
    c.fillStyle = '#8a5530'; for (const x of [-18, 12]) { rr(c, x, -80, 7, 80, 2); c.fill(); c.stroke(); }
    c.beginPath(); c.moveTo(-18, -10); c.lineTo(19, -60); c.moveTo(19, -10); c.lineTo(-18, -60); c.strokeStyle = '#6b3f22'; c.lineWidth = 3; c.stroke(); c.strokeStyle = INK; c.lineWidth = 2.2;
    rr(c, -26, -96, 52, 18, 4); c.fillStyle = '#b07a4f'; c.fill(); c.stroke();
    tri(c, [-30, -96, 0, -120, 30, -96], '#9c3f4f');
  });
  make(scene, 'bd_lantern', 30, 100, 15, 94, c => {
    shadow(c, 0, 2, 10, 4);
    c.fillStyle = '#2f2545'; rr(c, -3, -62, 6, 62, 2); c.fill(); c.stroke();
    tri(c, [-9, -62, 9, -62, 6, -80, -6, -80], '#ffd77a');
    tri(c, [-10, -80, 0, -92, 10, -80], '#2f2545');
  });
  make(scene, 'bd_lantern_off', 30, 100, 15, 94, c => {
    shadow(c, 0, 2, 10, 4);
    c.fillStyle = '#2f2545'; rr(c, -3, -62, 6, 62, 2); c.fill(); c.stroke();
    tri(c, [-9, -62, 9, -62, 6, -80, -6, -80], '#5d566b');
    tri(c, [-10, -80, 0, -92, 10, -80], '#2f2545');
  });
  const palisade = (vertical: boolean, broken: boolean, lav: boolean) => (c: C) => {
    const n = 5;
    for (let i = 0; i < n; i++) {
      const o = (i - (n - 1) / 2) * 18, hgt = broken ? (i % 2 ? 14 : 22) : 46;
      const x = vertical ? 0 : o, y = vertical ? o + 8 : 0;
      c.fillStyle = lav ? '#8a6cc2' : '#a8693f';
      rr(c, x - 6, y - hgt, 12, hgt, 2); c.fill(); c.stroke();
      if (!broken) tri(c, [x - 6, y - hgt, x, y - hgt - 9, x + 6, y - hgt], lav ? '#8a6cc2' : '#a8693f');
    }
  };
  make(scene, 'bd_pal_v', 30, 150, 15, 62, palisade(true, false, false));
  make(scene, 'bd_pal_h', 110, 70, 55, 62, palisade(false, false, false));
  make(scene, 'bd_pal_v2', 30, 150, 15, 62, palisade(true, false, true));
  make(scene, 'bd_pal_h2', 110, 70, 55, 62, palisade(false, false, true));
  make(scene, 'bd_pal_vx', 30, 150, 15, 62, palisade(true, true, false));
  make(scene, 'bd_pal_hx', 110, 70, 55, 62, palisade(false, true, false));

  // decor
  make(scene, 'dc_tuft', 16, 12, 8, 10, c => { c.strokeStyle = '#5f9160'; c.lineWidth = 2; c.beginPath(); c.moveTo(-4, 0); c.lineTo(-6, -7); c.moveTo(0, 0); c.lineTo(0, -9); c.moveTo(4, 0); c.lineTo(6, -7); c.stroke(); });
  make(scene, 'dc_tuft2', 16, 12, 8, 10, c => { c.strokeStyle = '#635583'; c.lineWidth = 2; c.beginPath(); c.moveTo(-4, 0); c.lineTo(-6, -7); c.moveTo(0, 0); c.lineTo(0, -9); c.moveTo(4, 0); c.lineTo(6, -7); c.stroke(); });
  ['#ffd1e3', '#fff1a8', '#c7b6ff', '#ffffff'].forEach((col, j) => make(scene, 'dc_flower' + j, 14, 14, 7, 7, c => { for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; c.fillStyle = col; c.beginPath(); c.arc(Math.cos(a) * 3, Math.sin(a) * 3, 2.4, 0, TAU); c.fill(); } c.fillStyle = '#ffb84a'; c.beginPath(); c.arc(0, 0, 1.8, 0, TAU); c.fill(); }));
  make(scene, 'dc_shroom', 14, 14, 7, 12, c => { c.lineWidth = 1.5; rr(c, -1.5, -6, 3, 6, 1); c.fillStyle = '#fff4e0'; c.fill(); c.beginPath(); c.arc(0, -6, 5, Math.PI, 0); c.closePath(); c.fillStyle = '#e9667a'; c.fill(); c.stroke(); });
  make(scene, 'dc_rock', 20, 14, 10, 8, c => { c.lineWidth = 1.6; ell(c, 0, 0, 8, 5, '#a9a4bc'); });
  make(scene, 'dc_grave', 28, 36, 14, 32, c => { shadow(c, 0, 2, 14, 4); rr(c, -11, -28, 22, 28, [11, 11, 2, 2]); c.fillStyle = '#9c97b5'; c.fill(); c.stroke(); c.fillStyle = '#6d6888'; c.font = 'bold 7px Nunito, sans-serif'; c.textAlign = 'center'; c.fillText('ПУХ', 0, -14); });
  make(scene, 'dc_bush', 50, 40, 25, 34, c => { c.lineWidth = 2; circ(c, -10, -12, 12, '#3e6e4e'); circ(c, 10, -12, 12, '#3e6e4e'); circ(c, 0, -20, 13, '#477a57'); });

  // fx
  make(scene, 'fx_dot', 12, 12, 6, 6, c => circ(c, 0, 0, 5, '#ffffff', false));
  make(scene, 'fx_star', 16, 16, 8, 8, c => { c.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 3 : 7; c.lineTo(Math.cos(i / 10 * TAU) * r, Math.sin(i / 10 * TAU) * r); } c.closePath(); c.fillStyle = '#ffffff'; c.fill(); });
  make(scene, 'fx_leaf', 12, 8, 6, 4, c => ell(c, 0, 0, 5, 2.6, '#ffffff', false));
  make(scene, 'fx_chip', 8, 6, 4, 3, c => { c.fillStyle = '#ffffff'; c.fillRect(-3, -1.5, 6, 3); });
  make(scene, 'fx_cone', 14, 14, 7, 7, c => { ell(c, 0, 0, 4, 6, '#8a5530'); });
  make(scene, 'fx_glow', 64, 64, 32, 32, c => { const g = c.createRadialGradient(0, 0, 0, 0, 0, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(-32, -32, 64, 64); });
  make(scene, 'fx_ring', 100, 100, 50, 50, c => { c.lineWidth = 4; c.strokeStyle = '#ffffff'; c.beginPath(); c.ellipse(0, 0, 46, 23, 0, 0, TAU); c.stroke(); });
  make(scene, 'fx_tele', 220, 112, 110, 56, c => { c.beginPath(); c.ellipse(0, 0, 108, 54, 0, 0, TAU); c.fillStyle = 'rgba(255,70,100,.28)'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#ff4664'; c.stroke(); });
  make(scene, 'fx_shadow', 40, 16, 20, 8, c => shadow(c, 0, 0, 18, 6, 0.25));
  make(scene, 'fx_arrow', 30, 24, 4, 12, c => tri(c, [22, 0, 4, -10, 9, 0, 4, 10], '#ffcf4a'));
  make(scene, 'fx_marker', 24, 20, 12, 18, c => tri(c, [-10, -14, 10, -14, 0, 2], '#ffcf4a'));
}
