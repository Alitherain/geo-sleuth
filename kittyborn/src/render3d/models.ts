// Low-poly models built from primitives in code, flat-shaded with vertex colours.
// Each model is merged into at most three meshes (lit body, always-glowing bits, windows) plus a few
// separately animated parts. Geometry is cached per model key and shared between instances.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BuildingType, ItemId } from '../content/data';

// ---------------------------------------------------------------- palette (dark gothic, slightly lifted for 3D light)
export const C = {
  coal: 0x1a1714, ink: 0x120f0d, stone: 0x6e695f, stone2: 0x585349, darkStone: 0x3d3b37, timber: 0x2b221b, plaster: 0x8e8573, plaster2: 0x7a705f,
  slate: 0x5f5a62, slate2: 0x4e4a52, roofRed: 0x5e2620, thatch: 0x7e6a44, wood: 0x5c4532, wood2: 0x46352a, plank: 0x8a6c4a, gold: 0xb08a3e, cin: 0x7d2a22,
  cin2: 0xa8432f, parch: 0xc9bfa8, leaf: 0x2c3b29, leaf2: 0x37472f, leaf3: 0x24301f, pine: 0x1f2c25, pine2: 0x283829, lav: 0x5b4870, lav2: 0x6d5a85,
  bark: 0x3b2c22, fur: 0x2a2624, fur2: 0x3a3430, fire: 0xffa040, fire2: 0xffd27a, win: 0xffc469, iron: 0x2e2a27, bronze: 0x6e5530, water: 0x3a5a66,
};

export const MAT = {
  body: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
  win: new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x8a7a60 }),
  flame: new THREE.MeshBasicMaterial({ color: 0xe0601c, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }),
  flame2: new THREE.MeshBasicMaterial({ color: 0xffa83a, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }),
  cloth: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
};

type Layer = 'body' | 'glow' | 'win';
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3();

/** Collects coloured primitives and merges them. */
export class Kit {
  parts: Record<Layer, THREE.BufferGeometry[]> = { body: [], glow: [], win: [] };
  add(geo: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, layer: Layer = 'body') {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    tmpM.compose(tmpV.set(x, y, z), tmpQ.setFromEuler(tmpE.set(rx, ry, rz)), tmpS.set(sx, sy, sz));
    g.applyMatrix4(tmpM);
    const col = new THREE.Color(color), n = g.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.parts[layer].push(g);
    return this;
  }
  box(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, layer: Layer = 'body') { return this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z, rx, ry, rz, 1, 1, 1, layer); }
  cyl(rt: number, rb: number, h: number, seg: number, color: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, layer: Layer = 'body') { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, x, y, z, rx, ry, rz, 1, 1, 1, layer); }
  cone(r: number, h: number, seg: number, color: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, layer: Layer = 'body') { return this.add(new THREE.ConeGeometry(r, h, seg), color, x, y, z, rx, ry, rz, 1, 1, 1, layer); }
  ball(r: number, color: number, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, detail = 0, layer: Layer = 'body') { return this.add(new THREE.IcosahedronGeometry(r, detail), color, x, y, z, 0, 0, 0, sx, sy, sz, layer); }
  rock(r: number, color: number, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, ry = 0) { return this.add(new THREE.DodecahedronGeometry(r, 0), color, x, y, z, 0.3, ry, 0.2, sx, sy, sz); }
  merged(): Record<Layer, THREE.BufferGeometry | null> {
    const out = { body: null, glow: null, win: null } as Record<Layer, THREE.BufferGeometry | null>;
    for (const k of ['body', 'glow', 'win'] as Layer[]) if (this.parts[k].length) { out[k] = mergeGeometries(this.parts[k], false); out[k]!.computeBoundingSphere(); }
    return out;
  }
}
export function meshesFrom(geos: Record<Layer, THREE.BufferGeometry | null>, shadow = true): THREE.Group {
  const g = new THREE.Group();
  if (geos.body) { const m = new THREE.Mesh(geos.body, MAT.body); m.castShadow = shadow; m.receiveShadow = true; m.name = 'body'; g.add(m); }
  if (geos.glow) { const m = new THREE.Mesh(geos.glow, MAT.glow); m.name = 'glow'; g.add(m); }
  if (geos.win) { const m = new THREE.Mesh(geos.win, MAT.win); m.name = 'win'; g.add(m); }
  return g;
}

// ---------------------------------------------------------------- shape helpers
/** Gable house: walls, two roof slabs with overhang, timber frame, door, windows. Front faces +z. */
function house(k: Kit, w: number, d: number, wallH: number, roofH: number, o: { wall?: number; roof?: number; timber?: boolean; base?: number; door?: number; win?: number; chimney?: number; x?: number; z?: number } = {}) {
  const x0 = o.x || 0, z0 = o.z || 0, wall = o.wall ?? C.plaster, roof = o.roof ?? C.slate;
  if (o.base) { k.box(w + 0.06, 0.35, d + 0.06, o.base, x0, 0.175, z0); }
  k.box(w, wallH, d, wall, x0, wallH / 2, z0);
  // gable ends
  const gable = new THREE.BufferGeometry();
  const hw = d / 2, v = [-hw, 0, 0, hw, 0, 0, 0, roofH, 0];
  gable.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); gable.computeVertexNormals();
  k.add(gable, wall, x0 + w / 2, wallH, z0, 0, Math.PI / 2, 0);
  k.add(gable, wall, x0 - w / 2, wallH, z0, 0, -Math.PI / 2, 0);
  const slant = Math.hypot(hw + 0.12, roofH + 0.06), ang = Math.atan2(roofH, hw);
  for (const s of [1, -1]) k.box(w + 0.28, 0.09, slant, roof, x0, wallH + roofH / 2 - 0.02, z0 + s * (hw / 2 + 0.03), s * ang, 0, 0);
  k.box(w + 0.32, 0.08, 0.1, C.timber, x0, wallH + roofH + 0.02, z0); // ridge
  // shingle rows: darker strips along each slope
  const shade = new THREE.Color(roof).multiplyScalar(0.72).getHex();
  for (const s of [1, -1]) for (let i = 1; i <= 4; i++) {
    const t = i / 5, y = wallH + roofH * (1 - t) + Math.cos(ang) * 0.055, z = z0 + s * (hw + 0.12) * t + s * Math.sin(ang) * 0.055;
    k.box(w + 0.26, 0.025, 0.07, shade, x0, y, z, s * ang, 0, 0);
  }
  if (o.timber) {
    const t = C.timber, e = 0.05;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.08, wallH, 0.08, t, x0 + sx * (w / 2 - 0.02), wallH / 2, z0 + sz * (d / 2 - 0.02));
    k.box(w + 0.02, 0.07, 0.04, t, x0, wallH * 0.55, z0 + d / 2 + e / 2); k.box(w + 0.02, 0.08, 0.04, t, x0, wallH - 0.04, z0 + d / 2 + e / 2);
    k.box(0.06, wallH * 0.62, 0.04, t, x0 - w * 0.25, wallH * 0.3, z0 + d / 2 + e / 2, 0, 0, 0.5);
    k.box(0.06, wallH * 0.62, 0.04, t, x0 + w * 0.25, wallH * 0.3, z0 + d / 2 + e / 2, 0, 0, -0.5);
    k.box(0.04, 0.07, d, t, x0 + w / 2 + e / 2, wallH * 0.55, z0); k.box(0.04, 0.07, d, t, x0 - w / 2 - e / 2, wallH * 0.55, z0);
  }
  if (o.door !== 0) { const dw = Math.min(0.42, w * 0.28); k.box(dw, wallH * 0.62, 0.06, o.door ?? C.timber, x0, wallH * 0.31, z0 + d / 2 + 0.02); k.box(dw + 0.08, 0.06, 0.08, C.timber, x0, wallH * 0.64, z0 + d / 2 + 0.03); }
  const nw = o.win ?? 2;
  for (let i = 0; i < nw; i++) { const wx = x0 + (i - (nw - 1) / 2) * (w * 0.56) + (nw === 1 ? w * 0.28 : 0); k.box(0.2, 0.26, 0.04, C.win, wx, wallH * 0.62, z0 + d / 2 + 0.03, 0, 0, 0, 'win'); k.box(0.26, 0.04, 0.06, C.timber, wx, wallH * 0.62 - 0.15, z0 + d / 2 + 0.04); }
  k.box(0.04, 0.24, 0.2, C.win, x0 + w / 2 + 0.02, wallH * 0.6, z0, 0, 0, 0, 'win');
  if (o.chimney) k.box(0.22, roofH + 0.5, 0.22, o.chimney, x0 + w * 0.28, wallH + roofH * 0.5 + 0.1, z0 - d * 0.18);
}
function logPile(k: Kit, x: number, z: number, n = 3, col = C.bark) {
  let i = 0;
  for (let row = 0; row < n; row++) for (let c = 0; c < n - row; c++, i++) { k.cyl(0.08, 0.08, 0.5, 6, col, x + (c - (n - row - 1) / 2) * 0.17, 0.09 + row * 0.15, z, 0, 0, Math.PI / 2); k.cyl(0.06, 0.06, 0.02, 6, C.plank, x + (c - (n - row - 1) / 2) * 0.17 + 0.25, 0.09 + row * 0.15, z, 0, 0, Math.PI / 2); }
}
function stoneRing(k: Kit, r: number, n: number, s: number) { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; k.rock(s, i % 2 ? C.stone2 : C.darkStone, Math.cos(a) * r, s * 0.6, Math.sin(a) * r, 1, 0.75, 1, a); } }
function fence(k: Kit, x: number, z: number, len: number, rot: number) { for (let i = 0; i <= len * 3; i++) k.cyl(0.03, 0.03, 0.4, 5, C.wood2, x + Math.cos(rot) * i / 3, 0.2, z + Math.sin(rot) * i / 3); k.box(len, 0.04, 0.04, C.wood2, x + Math.cos(rot) * len / 2, 0.3, z + Math.sin(rot) * len / 2, 0, -rot, 0); }

// ---------------------------------------------------------------- buildings
export interface Model { group: THREE.Group; parts: Record<string, THREE.Object3D> }
const geoCache = new Map<string, Record<Layer, THREE.BufferGeometry | null>>();
function cached(key: string, f: (k: Kit) => void) { let g = geoCache.get(key); if (!g) { const k = new Kit(); f(k); g = k.merged(); geoCache.set(key, g); } return meshesFrom(g); }

function flames(n: number, big: number): THREE.Group {
  const g = new THREE.Group(); g.name = 'flames';
  for (let i = 0; i < n; i++) {
    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.12 * big, 0.5 * big, 6), MAT.flame);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.06 * big, 0.3 * big, 6), MAT.flame2);
    outer.position.set((i - (n - 1) / 2) * 0.14 * big, 0.3 * big, (i % 2) * 0.06); inner.position.copy(outer.position); inner.position.y -= 0.08 * big;
    g.add(outer, inner);
  }
  return g;
}

export function buildingModel(type: BuildingType | 'site', level = 1, fp = 1, mask = 0, broken = false): Model {
  const parts: Record<string, THREE.Object3D> = {};
  let group: THREE.Group;
  switch (type) {
    case 'site': {
      if (fp === 1) { group = cached('site1', k => { for (let i = 0; i < 3; i++) k.cyl(0.05, 0.05, 0.7, 5, C.wood, (i - 1) * 0.12, 0.06, 0, 0, 0.3, Math.PI / 2); k.cyl(0.04, 0.04, 0.5, 5, C.wood2, 0, 0.25, -0.2); }); break; }
      group = cached('site' + fp, k => {
        const s = fp * 0.42;
        for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.cyl(0.035, 0.035, 1.1 + fp * 0.25, 5, C.wood, x * s, (1.1 + fp * 0.25) / 2, z * s);
        k.box(s * 2 + 0.1, 0.05, 0.12, C.plank, 0, 0.7, s); k.box(s * 2 + 0.1, 0.05, 0.12, C.plank, 0, 0.7, -s);
        k.box(0.05, s * 2.6, 0.04, C.wood2, 0, 0.6, s + 0.02, 0, 0, 0.7);
        k.box(s * 1.6, 0.18, s * 1.2, C.darkStone, 0, 0.09, 0);
        for (let i = 0; i < 4; i++) k.box(0.5, 0.05, 0.12, C.plank, -s * 0.4, 0.22 + i * 0.06, s * 0.5, 0, i * 0.3, 0);
        k.box(0.3, 0.3, 0.3, C.wood2, s * 0.5, 0.15, -s * 0.3);
      });
      break;
    }
    case 'hall': {
      group = cached('hall' + level, k => {
        house(k, 3.0, 2.1, 1.25 + level * 0.15, 1.5, { wall: level > 1 ? C.stone : C.plaster, roof: C.slate, timber: level === 1, base: C.darkStone, win: 3, chimney: C.darkStone });
        // porch and steps
        k.box(1.0, 0.12, 0.5, C.stone2, 0, 0.06, 1.3); k.box(0.12, 1.1, 0.12, C.timber, -0.42, 0.6, 1.45); k.box(0.12, 1.1, 0.12, C.timber, 0.42, 0.6, 1.45);
        k.box(1.1, 0.08, 0.7, C.roofRed, 0, 1.2, 1.35, 0.25, 0, 0);
        if (level >= 2) { k.box(0.9, 3.2, 0.9, C.stone2, -1.05, 1.6, -0.25); k.cone(0.78, 1.5, 4, C.slate2, -1.05, 3.95, -0.25, 0, Math.PI / 4, 0); k.box(0.24, 0.4, 0.05, C.win, -1.05, 2.6, 0.22, 0, 0, 0, 'win'); k.cone(0.03, 0.5, 4, C.gold, -1.05, 4.9, -0.25); }
        if (level >= 3) { k.box(0.8, 2.8, 0.8, C.stone2, 1.1, 1.4, -0.3); k.cone(0.7, 1.3, 4, C.slate2, 1.1, 3.45, -0.3, 0, Math.PI / 4, 0); k.box(3.6, 0.5, 0.18, C.darkStone, 0, 0.25, 1.75); for (let i = -4; i <= 4; i++) k.box(0.2, 0.22, 0.2, C.darkStone, i * 0.42, 0.6, 1.75); }
        k.box(0.5, 0.08, 0.04, C.gold, 0, 1.05 + level * 0.15, 1.08);
      });
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.32), new THREE.MeshLambertMaterial({ color: C.cin, side: THREE.DoubleSide }));
      flag.position.set(level >= 2 ? -0.8 : 1.2, level >= 2 ? 4.4 : 3.1, -0.25); flag.geometry.translate(0.25, 0, 0); group.add(flag); parts.flag = flag;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9), MAT.body); pole.position.set(flag.position.x, flag.position.y - 0.3, flag.position.z); group.add(pole);
      break;
    }
    case 'shop': {
      group = cached('shop', k => {
        k.box(2.4, 1.5, 0.12, C.wood2, 0, 0.75, -0.75); k.box(0.12, 1.5, 1.5, C.wood2, -1.2, 0.75, 0); k.box(0.12, 1.5, 1.5, C.wood2, 1.2, 0.75, 0);
        for (const x of [-1.15, 1.15]) k.box(0.12, 1.9, 0.12, C.timber, x, 0.95, 0.72);
        k.box(2.4, 0.75, 0.5, C.wood, 0, 0.375, 0.45); k.box(2.5, 0.08, 0.6, C.plank, 0, 0.78, 0.45);
        for (let i = 0; i < 8; i++) k.box(0.31, 0.06, 1.0, i % 2 ? C.parch : C.cin, -1.08 + i * 0.31, 1.95, 0.25, 0.35, 0, 0);
        for (let i = 0; i < 8; i++) k.cone(0.15, 0.22, 3, i % 2 ? C.parch : C.cin, -1.08 + i * 0.31, 1.72, 0.76, Math.PI, 0, 0);
        k.box(2.4, 0.08, 1.5, C.slate2, 0, 1.55, 0); k.box(0.9, 0.3, 0.05, C.timber, 0, 2.3, 0.4); k.box(0.7, 0.18, 0.06, C.gold, 0, 2.3, 0.43);
        for (let i = 0; i < 4; i++) k.cyl(0.08, 0.08, 0.3, 6, i % 2 ? C.bark : C.lav, -0.8 + i * 0.22, 0.95, 0.45, 0, 0, Math.PI / 2);
        k.cyl(0.04, 0.04, 0.2, 6, C.parch, 0.7, 0.92, 0.4); k.ball(0.05, C.fire2, 0.7, 1.06, 0.4, 1, 1.4, 1, 0, 'glow');
        k.box(0.32, 0.32, 0.32, C.wood2, 0.95, 0.16, 1.05); k.box(0.26, 0.26, 0.26, C.wood, 0.95, 0.45, 1.05, 0, 0.4, 0);
      });
      const owl = owlModel(); owl.position.set(0, 0.8, -0.1); group.add(owl); parts.owl = owl;
      break;
    }
    case 'heart': case 'bonfire': {
      const big = type === 'heart';
      group = cached(type, k => {
        stoneRing(k, big ? 0.62 : 0.36, big ? 10 : 7, big ? 0.17 : 0.11);
        const L = big ? 0.9 : 0.55; for (let i = 0; i < (big ? 5 : 3); i++) { const a = i / (big ? 5 : 3) * Math.PI * 2; k.cyl(0.05, 0.07, L, 6, C.bark, Math.cos(a) * 0.12, L * 0.32, Math.sin(a) * 0.12, Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); }
        k.cyl(big ? 0.45 : 0.25, big ? 0.45 : 0.25, 0.04, 8, 0x5a1a10, 0, 0.03, 0, 0, 0, 0, 'glow');
        if (big) { k.box(0.5, 0.06, 0.18, C.darkStone, 0, 0.03, 0.95); }
      });
      const f = flames(big ? 3 : 2, big ? 1.4 : 1); f.position.y = big ? 0.15 : 0.08; group.add(f); parts.flames = f;
      const ash = cached('ash' + (big ? 1 : 0), k => { k.cyl(big ? 0.4 : 0.22, big ? 0.45 : 0.25, 0.08, 8, 0x2a2624, 0, 0.06, 0); }); ash.visible = false; group.add(ash); parts.ash = ash;
      break;
    }
    case 'lantern': case 'ledLamp': {
      group = cached('lantern', k => {
        k.cyl(0.18, 0.22, 0.2, 6, C.darkStone, 0, 0.1, 0); k.cyl(0.05, 0.06, 2.1, 6, C.iron, 0, 1.15, 0);
        k.box(0.5, 0.05, 0.05, C.iron, 0.2, 2.1, 0); k.box(0.04, 0.2, 0.04, C.iron, 0.4, 1.98, 0);
        k.cone(0.2, 0.2, 4, C.iron, 0.4, 1.85, 0, 0, Math.PI / 4, 0); k.box(0.22, 0.04, 0.22, C.iron, 0.4, 1.46, 0);
        for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(0.025, 0.32, 0.025, C.iron, 0.4 + x * 0.1, 1.62, z * 0.1);
      });
      const glass = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.28, 0.18), new THREE.MeshBasicMaterial({ color: C.win })); glass.position.set(0.4, 1.62, 0); group.add(glass); parts.glass = glass;
      break;
    }
    case 'houseGatherer': case 'houseQuarry': case 'houseForager': case 'houseHauler': case 'houseMaster': {
      group = cached(type, k => {
        const st = type === 'houseQuarry' || type === 'houseMaster';
        house(k, 1.5, 1.2, 1.0, 1.05, { wall: st ? C.stone : C.plaster2, roof: type === 'houseGatherer' ? C.thatch : type === 'houseForager' ? C.roofRed : type === 'houseMaster' ? C.cin : C.slate, timber: !st, base: C.darkStone, win: 1, chimney: type === 'houseMaster' ? C.darkStone : 0, z: -0.15 });
        if (type === 'houseGatherer') { logPile(k, 0.55, 0.65, 3); k.cyl(0.16, 0.18, 0.25, 7, C.bark, -0.55, 0.12, 0.65); k.box(0.04, 0.4, 0.04, C.wood, -0.55, 0.4, 0.65, 0, 0, 0.4); k.box(0.16, 0.1, 0.03, C.stone, -0.48, 0.55, 0.65, 0, 0, 0.4); }
        if (type === 'houseQuarry') { k.rock(0.22, C.stone2, 0.55, 0.14, 0.62, 1, 0.8, 1); k.rock(0.15, C.stone, 0.3, 0.1, 0.7, 1, 0.8, 1, 1); k.rock(0.12, C.darkStone, 0.62, 0.32, 0.6); k.box(0.04, 0.5, 0.04, C.wood, -0.5, 0.25, 0.65, 0, 0, 0.3); k.box(0.3, 0.05, 0.05, C.iron, -0.44, 0.48, 0.65, 0, 0, 0.3); }
        if (type === 'houseForager') { for (const x of [0.35, 0.62]) { k.cyl(0.14, 0.11, 0.18, 8, C.plank, x, 0.09, 0.65); for (let i = 0; i < 4; i++) k.ball(0.05, 0x4a2a52, x + (i % 2 - 0.5) * 0.08, 0.2, 0.65 + (i > 1 ? 0.05 : -0.05)); } fence(k, -0.75, 0.6, 0.5, 0); }
        if (type === 'houseHauler') { k.box(0.6, 0.22, 0.4, C.wood, 0.45, 0.32, 0.65); for (const z of [0.43, 0.87]) k.cyl(0.14, 0.14, 0.05, 8, C.wood2, 0.45, 0.16, z, Math.PI / 2, 0, 0); k.box(0.04, 0.04, 0.5, C.wood2, 0.1, 0.32, 0.65, 0, 0.4, 0); k.box(0.22, 0.22, 0.22, C.wood2, 0.45, 0.54, 0.65); }
        if (type === 'houseMaster') { k.box(0.3, 0.18, 0.14, C.iron, 0.5, 0.42, 0.65); k.box(0.16, 0.32, 0.1, C.iron, 0.5, 0.2, 0.65); k.cyl(0.13, 0.13, 0.3, 8, C.wood2, -0.5, 0.15, 0.65); k.add(new THREE.TorusGeometry(0.16, 0.04, 4, 8), C.gold, 0, 1.35, 0.47); }
      });
      break;
    }
    case 'sawmill': {
      group = cached('sawmill', k => {
        k.box(2.5, 0.14, 1.9, C.wood2, 0, 0.07, -0.1);
        for (const [x, z] of [[-1.15, -0.95], [1.15, -0.95], [-1.15, 0.75], [1.15, 0.75]]) k.box(0.13, 1.7, 0.13, C.timber, x, 0.85, z);
        k.box(2.7, 0.1, 2.2, C.thatch, 0, 1.85, -0.1, 0.22, 0, 0);
        k.box(2.5, 0.9, 0.1, C.wood, 0, 0.6, -1.0);
        k.box(1.6, 0.5, 0.5, C.wood, 0, 0.4, 0.05); k.cyl(0.14, 0.14, 1.3, 7, C.bark, -0.25, 0.8, 0.05, 0, 0, Math.PI / 2);
        logPile(k, -0.75, -0.6, 3);
        for (let i = 0; i < 5; i++) k.box(0.7, 0.05, 0.18, C.plank, 0.75, 0.17 + i * 0.06, -0.6, 0, (i % 2) * 0.1, 0);
      });
      const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.03, 12), new THREE.MeshLambertMaterial({ color: 0x9a9a9e, flatShading: true }));
      blade.rotation.x = Math.PI / 2; const bp = new THREE.Group(); bp.position.set(0.45, 0.85, 0.05); bp.add(blade); group.add(bp); parts.blade = bp;
      break;
    }
    case 'storage': {
      group = cached('storage', k => {
        house(k, 2.4, 1.8, 1.25, 1.45, { wall: C.wood, roof: C.slate, timber: true, base: C.darkStone, win: 0, door: 0, z: -0.15 });
        k.box(0.9, 1.0, 0.07, C.wood2, 0, 0.5, 0.78); k.box(0.06, 1.0, 0.09, C.timber, 0, 0.5, 0.8); k.box(0.92, 0.06, 0.09, C.timber, 0, 0.5, 0.8, 0, 0, 0.83);
        for (const [x, z, s] of [[-0.95, 0.85, 0.36], [-0.6, 0.95, 0.3], [-0.95, 0.85, 0.28]] as [number, number, number][]) k.box(s, s, s, C.wood, x, s / 2 + (s === 0.28 ? 0.36 : 0), z, 0, x * 0.3, 0);
        k.cyl(0.17, 0.17, 0.42, 8, C.wood2, 0.85, 0.21, 0.85); k.cyl(0.18, 0.18, 0.04, 8, C.iron, 0.85, 0.32, 0.85); k.cyl(0.17, 0.17, 0.42, 8, C.wood2, 1.05, 0.21, 0.6);
      });
      break;
    }
    case 'forge': {
      group = cached('forge', k => {
        house(k, 1.5, 1.2, 1.0, 0.9, { wall: C.stone, roof: C.slate2, base: C.darkStone, win: 0, door: 0, z: -0.2 });
        k.box(1.0, 1.9, 0.5, C.darkStone, -0.3, 0.95, -0.6); k.box(0.36, 0.7, 0.36, C.darkStone, -0.3, 2.2, -0.6);
        k.box(0.6, 0.5, 0.06, 0xff7a2a, -0.25, 0.4, 0.42, 0, 0, 0, 'glow'); k.box(0.8, 0.1, 0.1, C.timber, -0.25, 0.7, 0.44);
        k.box(0.36, 0.14, 0.18, C.iron, 0.45, 0.42, 0.65); k.box(0.16, 0.3, 0.12, C.iron, 0.45, 0.17, 0.65); k.cone(0.07, 0.16, 4, C.iron, 0.68, 0.45, 0.65, 0, 0, -Math.PI / 2);
        k.cyl(0.16, 0.16, 0.36, 8, C.wood2, -0.65, 0.18, 0.62); k.cyl(0.14, 0.14, 0.02, 8, C.water, -0.65, 0.37, 0.62);
      });
      break;
    }
    case 'candleShop': {
      group = cached('candleShop', k => {
        house(k, 1.7, 1.5, 2.0, 1.4, { wall: C.plaster, roof: C.roofRed, timber: true, base: C.darkStone, win: 2, chimney: C.darkStone, z: -0.2 });
        for (let i = 0; i < 2; i++) k.box(0.2, 0.26, 0.04, C.win, -0.4 + i * 0.8, 1.55, 0.57, 0, 0, 0, 'win');
        k.box(0.04, 0.5, 0.04, C.iron, 0.95, 1.4, 0.55); k.box(0.3, 0.04, 0.04, C.iron, 0.85, 1.65, 0.55);
        for (let i = 0; i < 3; i++) { k.cyl(0.03, 0.03, 0.18, 6, C.parch, 0.75 + i * 0.07, 1.48, 0.55); k.ball(0.025, C.fire2, 0.75 + i * 0.07, 1.6, 0.55, 1, 1.5, 1, 0, 'glow'); }
        k.cyl(0.18, 0.15, 0.3, 8, C.wood2, -0.85, 0.15, 0.75);
      });
      break;
    }
    case 'bell': {
      group = cached('bell', k => {
        k.box(0.1, 1.5, 0.1, C.timber, -0.33, 0.75, 0); k.box(0.1, 1.5, 0.1, C.timber, 0.33, 0.75, 0); k.box(0.8, 0.1, 0.12, C.timber, 0, 1.45, 0);
        k.box(0.9, 0.06, 0.5, C.slate, 0, 1.62, 0.1, 0.25, 0, 0); k.box(0.9, 0.06, 0.5, C.slate, 0, 1.62, -0.1, -0.25, 0, 0);
        k.cyl(0.08, 0.22, 0.32, 8, C.bronze, 0, 1.2, 0); k.ball(0.04, C.iron, 0, 1.02, 0);
      });
      break;
    }
    case 'palisade': {
      group = cached('pal' + level + mask + (broken ? 'x' : ''), k => {
        const stone = level > 1 && !broken, H = broken ? 0.45 : 1.05;
        if (stone) { k.box(0.4, 1.25, 0.4, C.stone2, 0, 0.62, 0); k.box(0.46, 0.12, 0.46, C.darkStone, 0, 1.3, 0); }
        else { k.cyl(0.08, 0.09, H, 6, C.wood, 0, H / 2, 0); if (!broken) k.cone(0.09, 0.2, 6, C.wood2, 0, H + 0.1, 0); }
        for (const [bit, dx, dz] of [[1, 1, 0], [2, 0, 1]] as [number, number, number][]) {
          if (!(mask & bit)) continue;
          if (stone) { k.box(dx ? 1 : 0.3, 1.0, dz ? 1 : 0.3, C.stone, dx * 0.5, 0.5, dz * 0.5); for (let i = 1; i <= 2; i++) k.box(0.22, 0.18, 0.22, C.stone2, dx * i * 0.33, 1.08, dz * i * 0.33); }
          else { for (let i = 1; i <= 3; i++) { const h = H * (0.86 + (i % 2) * 0.12); k.cyl(0.075, 0.085, h, 6, i % 2 ? C.wood2 : C.wood, dx * i * 0.25, h / 2, dz * i * 0.25); if (!broken) k.cone(0.08, 0.18, 6, C.wood2, dx * i * 0.25, h + 0.09, dz * i * 0.25); } k.box(dx ? 1 : 0.05, 0.06, dz ? 1 : 0.05, C.timber, dx * 0.5, H * 0.65, dz * 0.5); k.box(dx ? 1 : 0.05, 0.06, dz ? 1 : 0.05, C.timber, dx * 0.5, H * 0.3, dz * 0.5); }
        }
      });
      break;
    }
    case 'tower': {
      group = cached('tower' + level, k => {
        k.cyl(0.6, 0.72, 1.9, 8, C.stone, 0, 0.95, 0); k.cyl(0.74, 0.74, 0.2, 8, C.darkStone, 0, 0.1, 0);
        k.box(0.14, 0.3, 0.06, C.win, 0, 1.2, 0.62, 0, 0, 0, 'win');
        k.cyl(0.85, 0.85, 0.12, 8, C.wood2, 0, 1.96, 0);
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; k.box(0.08, 0.7, 0.08, C.timber, Math.cos(a) * 0.72, 2.35, Math.sin(a) * 0.72); }
        k.cone(1.0, 0.8, 8, level > 1 ? C.lav : C.roofRed, 0, 3.05, 0);
        k.box(0.06, 0.5, 0.06, C.wood, 0, 2.25, 0.3); k.box(0.3, 0.05, 0.05, C.wood, 0, 2.5, 0.3);
      });
      break;
    }
    case 'barracks': {
      group = cached('barracks', k => {
        house(k, 2.5, 1.6, 1.15, 1.2, { wall: C.stone, roof: C.cin, base: C.darkStone, win: 2, chimney: C.darkStone, z: -0.25 });
        for (const x of [-0.75, 0.75]) { k.box(0.04, 0.9, 0.04, C.wood2, x, 1.2, 0.58); k.add(new THREE.PlaneGeometry(0.3, 0.55), C.cin, x, 1.15, 0.6, 0, 0, 0, 1, 1, 1); }
        k.box(0.7, 0.06, 0.06, C.wood2, 0, 0.6, 0.85); for (let i = 0; i < 4; i++) { k.cyl(0.015, 0.015, 1.0, 4, C.wood, -0.25 + i * 0.17, 0.55, 0.88, 0.1); k.cone(0.03, 0.1, 4, 0x9a9a9e, -0.25 + i * 0.17, 1.08, 0.93); }
        k.box(0.36, 0.36, 0.36, C.wood, 1.0, 0.18, 0.85); k.box(0.36, 0.36, 0.36, C.wood, -1.0, 0.18, 0.85, 0, 0.3, 0);
      });
      break;
    }
    case 'post': {
      group = cached('post', k => { k.cyl(0.18, 0.22, 0.16, 6, C.darkStone, 0, 0.08, 0); k.cyl(0.03, 0.03, 1.8, 5, C.wood2, 0, 0.9, 0); k.cyl(0.18, 0.18, 0.04, 8, C.cin, 0.12, 0.6, 0.06, Math.PI / 2, 0, 0); k.ball(0.04, C.gold, 0, 1.82, 0); });
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.3), new THREE.MeshLambertMaterial({ color: C.cin, side: THREE.DoubleSide })); flag.geometry.translate(0.225, 0, 0); flag.position.set(0, 1.6, 0); group.add(flag); parts.flag = flag;
      break;
    }
    case 'flowerbed': {
      group = cached('flowerbed', k => { k.box(0.8, 0.14, 0.8, C.wood2, 0, 0.07, 0); k.box(0.7, 0.04, 0.7, 0x2a2018, 0, 0.15, 0); const cols = [0x8a4a5a, C.parch, 0x5b4870, C.gold, 0x8a4a5a, 0x6a3a4a]; for (let i = 0; i < 9; i++) { const x = (i % 3 - 1) * 0.22, z = (Math.floor(i / 3) - 1) * 0.22; k.cyl(0.01, 0.01, 0.2, 3, C.leaf2, x, 0.26, z); k.ball(0.06, cols[i % 6], x, 0.38, z); } });
      break;
    }
    case 'bench': {
      group = cached('bench', k => { k.box(0.85, 0.06, 0.3, C.plank, 0, 0.34, 0); k.box(0.85, 0.3, 0.05, C.plank, 0, 0.55, -0.14, -0.15, 0, 0); for (const x of [-0.35, 0.35]) for (const z of [-0.1, 0.1]) k.box(0.05, 0.34, 0.05, C.iron, x, 0.17, z); });
      break;
    }
    case 'banner': {
      group = cached('banner', k => { k.cyl(0.14, 0.18, 0.14, 6, C.darkStone, 0, 0.07, 0); k.cyl(0.025, 0.025, 2.0, 5, C.iron, 0, 1.0, 0); k.box(0.5, 0.03, 0.03, C.iron, 0.2, 1.9, 0); k.cone(0.05, 0.14, 4, C.gold, 0, 2.06, 0); });
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.8), new THREE.MeshLambertMaterial({ color: C.cin, side: THREE.DoubleSide })); cloth.geometry.translate(0, -0.4, 0); cloth.position.set(0.22, 1.88, 0); group.add(cloth); parts.flag = cloth;
      break;
    }
    case 'fountain': {
      group = cached('fountain', k => {
        k.cyl(0.85, 0.9, 0.36, 10, C.stone, 0, 0.18, 0); k.cyl(0.74, 0.74, 0.04, 10, C.water, 0, 0.33, 0);
        k.cyl(0.12, 0.16, 0.9, 6, C.stone2, 0, 0.75, 0); k.cyl(0.36, 0.14, 0.16, 8, C.stone, 0, 1.2, 0); k.cyl(0.3, 0.3, 0.03, 8, C.water, 0, 1.27, 0);
        k.ball(0.09, C.stone2, 0, 1.4, 0);
      });
      break;
    }
    default: group = cached('site1', () => {});
  }
  return { group, parts };
}

// ---------------------------------------------------------------- nature
export function nodeModel(kind: string, alive: boolean): THREE.Group {
  return cached('node_' + kind + (alive ? '' : '_x'), k => {
    if (kind === 'oak' || kind === 'pine' || kind === 'lav') {
      if (!alive) { k.cyl(0.13, 0.16, 0.22, 7, C.bark, 0, 0.11, 0); k.cyl(0.12, 0.12, 0.02, 7, C.plank, 0, 0.23, 0); return; }
      k.cyl(0.08, 0.13, kind === 'pine' ? 0.6 : 0.85, 6, C.bark, 0, kind === 'pine' ? 0.3 : 0.42, 0);
      if (kind === 'pine') { k.cone(0.62, 0.8, 7, C.pine, 0, 0.85, 0); k.cone(0.5, 0.7, 7, C.pine2, 0, 1.3, 0); k.cone(0.34, 0.6, 7, C.pine, 0, 1.7, 0); }
      else { const a = kind === 'lav' ? C.lav : C.leaf, b = kind === 'lav' ? C.lav2 : C.leaf2, c = kind === 'lav' ? 0x4a3a5e : C.leaf3; k.ball(0.55, a, 0, 1.25, 0, 1, 0.85, 1); k.ball(0.42, b, 0.32, 1.05, 0.15, 1, 0.85, 1); k.ball(0.4, c, -0.3, 1.0, -0.1, 1, 0.9, 1); k.ball(0.32, b, -0.05, 1.6, 0.05); }
    } else if (kind === 'rock') {
      if (!alive) { k.rock(0.12, C.stone2, 0.1, 0.06, 0, 1, 0.6, 1); k.rock(0.09, C.darkStone, -0.12, 0.05, 0.08, 1, 0.6, 1); return; }
      k.rock(0.42, C.stone2, 0, 0.3, 0, 1.1, 0.85, 1); k.rock(0.26, C.stone, 0.36, 0.2, 0.2, 1, 0.9, 1, 1); k.rock(0.18, C.darkStone, -0.34, 0.14, 0.18);
    } else {
      k.ball(0.3, C.leaf, 0, 0.26, 0, 1, 0.8, 1); k.ball(0.22, C.leaf2, 0.25, 0.2, 0.08, 1, 0.8, 1); k.ball(0.2, C.leaf3, -0.24, 0.18, 0.05, 1, 0.8, 1);
      if (alive) for (let i = 0; i < 7; i++) { const a = i * 2.4; k.ball(0.05, 0x5a2a62, Math.cos(a) * 0.26, 0.3 + (i % 3) * 0.06, Math.sin(a) * 0.2 + 0.08); }
    }
  });
}
/** Background props, merged per kind for instancing. */
export function propGeo(kind: 'bgpine' | 'tuft' | 'grave' | 'shroom' | 'pebble' | 'flower' | 'hedge' | 'deadtree'): Record<Layer, THREE.BufferGeometry | null> {
  const key = 'prop_' + kind; let g = geoCache.get(key); if (g) return g;
  const k = new Kit();
  switch (kind) {
    case 'bgpine': k.cyl(0.1, 0.14, 0.6, 5, C.bark, 0, 0.3, 0); k.cone(0.8, 1.2, 6, C.pine, 0, 1.0, 0); k.cone(0.62, 1.0, 6, C.pine2, 0, 1.6, 0); k.cone(0.42, 0.8, 6, C.pine, 0, 2.15, 0); break;
    case 'tuft': for (let i = 0; i < 4; i++) k.cone(0.04, 0.22, 3, i % 2 ? C.leaf2 : C.leaf3, (i - 1.5) * 0.05, 0.1, (i % 2) * 0.04, 0, 0, (i - 1.5) * 0.25); break;
    case 'grave': k.box(0.3, 0.42, 0.08, C.stone2, 0, 0.2, 0, -0.1, 0, 0.06); k.box(0.08, 0.3, 0.06, C.darkStone, 0, 0.55, 0, 0, 0, 0); break;
    case 'shroom': k.cyl(0.03, 0.04, 0.12, 5, C.parch, 0, 0.06, 0); k.cone(0.09, 0.08, 6, 0x6a3a3a, 0, 0.15, 0); break;
    case 'pebble': k.rock(0.07, C.stone2, 0, 0.03, 0, 1, 0.6, 1); break;
    case 'flower': k.cyl(0.01, 0.01, 0.16, 3, C.leaf2, 0, 0.08, 0); k.ball(0.04, 0x7a4a5a, 0, 0.17, 0); break;
    case 'hedge': k.ball(0.42, C.leaf3, 0, 0.42, 0, 1, 1, 1); k.ball(0.3, C.leaf, 0.12, 0.62, 0.15); break;
    case 'deadtree': k.cyl(0.06, 0.12, 1.4, 5, 0x2a2420, 0, 0.7, 0); k.cyl(0.03, 0.05, 0.6, 4, 0x2a2420, 0.2, 1.1, 0, 0, 0, -0.8); k.cyl(0.03, 0.04, 0.5, 4, 0x2a2420, -0.15, 1.25, 0, 0, 0, 0.9); break;
  }
  g = k.merged(); geoCache.set(key, g); return g;
}

// ---------------------------------------------------------------- characters
/** A walker: shared rig for the hero, cats and units. Faces +z. */
export interface Rig { root: THREE.Group; body: THREE.Group; legL: THREE.Object3D; legR: THREE.Object3D; armR: THREE.Group; armL?: THREE.Object3D; tool: THREE.Group; tail?: THREE.Object3D; cape?: THREE.Object3D; lantern?: THREE.Object3D; stack: THREE.Group; height: number }

function limb(w: number, h: number, color: number, x: number, y: number, z = 0): THREE.Group {
  const g = new THREE.Group(); g.position.set(x, y, z);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), new THREE.MeshLambertMaterial({ color, flatShading: true })); m.position.y = -h / 2; m.castShadow = true; g.add(m); return g;
}
export function toolModel(kind: string): THREE.Group {
  return cached('tool_' + kind, k => {
    if (kind === 'axe') { k.cyl(0.025, 0.03, 0.75, 5, C.wood, 0, 0.3, 0); k.box(0.05, 0.2, 0.22, 0x8a8a90, 0, 0.6, 0.1); k.box(0.06, 0.06, 0.06, C.iron, 0, 0.6, -0.04); }
    else if (kind === 'saw') { k.cyl(0.025, 0.03, 0.4, 5, C.wood, 0, 0.15, 0); k.box(0.03, 0.55, 0.16, 0x9a9aa0, 0, 0.6, 0.04); for (let i = 0; i < 5; i++) k.cone(0.03, 0.05, 3, 0x9a9aa0, 0, 0.38 + i * 0.1, 0.13, Math.PI / 2, 0, 0); }
    else if (kind === 'pick') { k.cyl(0.02, 0.025, 0.5, 5, C.wood, 0, 0.2, 0); k.box(0.04, 0.05, 0.4, 0x7a7a80, 0, 0.45, 0, 0.2, 0, 0); }
    else if (kind === 'basket') { k.cyl(0.11, 0.08, 0.14, 8, C.plank, 0, 0, 0.05); k.ball(0.04, 0x5a2a62, 0, 0.08, 0.05); }
    else if (kind === 'hammer') { k.cyl(0.02, 0.025, 0.4, 5, C.wood, 0, 0.15, 0); k.box(0.1, 0.1, 0.2, C.iron, 0, 0.36, 0); }
    else if (kind === 'spear') { k.cyl(0.018, 0.018, 1.0, 4, C.wood, 0, 0.3, 0); k.cone(0.04, 0.16, 4, 0x9a9aa0, 0, 0.88, 0); }
    else if (kind === 'sling') { k.cyl(0.02, 0.02, 0.3, 4, C.wood, 0, 0.1, 0); k.cyl(0.015, 0.015, 0.14, 4, C.wood, 0.05, 0.3, 0, 0, 0, -0.5); k.cyl(0.015, 0.015, 0.14, 4, C.wood, -0.05, 0.3, 0, 0, 0, 0.5); }
    else if (kind === 'catAxe') { k.cyl(0.02, 0.025, 0.45, 5, C.wood, 0, 0.18, 0); k.box(0.04, 0.12, 0.14, 0x8a8a90, 0, 0.36, 0.06); }
  });
}
export function heroRig(): Rig {
  const root = new THREE.Group(), body = cached('hero', k => {
    k.add(new THREE.ConeGeometry(0.44, 1.2, 9, 1, true), 0x231f1c, 0, 0.66, -0.02);          // long cloak to the ground
    k.cyl(0.2, 0.25, 0.6, 8, 0x2f2a26, 0, 1.02, 0.02);                                      // coat
    for (let i = 0; i < 3; i++) k.ball(0.022, C.gold, 0, 0.86 + i * 0.12, 0.25);
    k.add(new THREE.TorusGeometry(0.17, 0.06, 5, 9), C.cin, 0, 1.3, 0, Math.PI / 2, 0, 0);  // scarf
    k.box(0.1, 0.32, 0.04, C.cin, 0.1, 1.12, 0.2, 0.1, 0, -0.15);
    k.ball(0.16, 0x16120f, 0, 1.47, 0, 1, 1.08, 1, 1);                                        // face in shadow
    k.ball(0.022, 0xffcf6a, -0.055, 1.47, 0.14, 1, 0.7, 1, 0, 'glow'); k.ball(0.022, 0xffcf6a, 0.055, 1.47, 0.14, 1, 0.7, 1, 0, 'glow');
    k.add(new THREE.CylinderGeometry(0.4, 0.42, 0.06, 3), 0x1d1a17, 0, 1.6, 0, 0, Math.PI, 0); // tricorne brim
    k.cyl(0.17, 0.2, 0.2, 7, 0x1d1a17, 0, 1.72, 0); k.cyl(0.205, 0.205, 0.04, 7, C.gold, 0, 1.64, 0);
    k.box(0.06, 0.22, 0.04, C.gold, 0.06, 1.75, 0.18, 0, 0, 0.4);
  });
  root.add(body);
  const cape = new THREE.Group(); cape.position.set(0, 1.28, -0.12);
  const capeM = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 1.1, 1, 3), MAT.cloth.clone()); (capeM.material as THREE.MeshLambertMaterial).vertexColors = false; (capeM.material as THREE.MeshLambertMaterial).color.set(0x1b1815);
  capeM.position.y = -0.55; capeM.castShadow = true; cape.add(capeM); root.add(cape);
  const legL = limb(0.11, 0.42, 0x1a1714, -0.1, 0.42), legR = limb(0.11, 0.42, 0x1a1714, 0.1, 0.42);
  const armR = limb(0.1, 0.5, 0x2f2a26, 0.27, 1.22), armL = limb(0.1, 0.48, 0x2f2a26, -0.27, 1.22);
  const tool = new THREE.Group(); tool.position.set(0, -0.48, 0.06); tool.rotation.x = Math.PI / 2; armR.add(tool); tool.add(toolModel('axe'));
  const lantern = cached('heroLantern', k => { k.box(0.12, 0.16, 0.12, C.iron, 0, 0, 0); k.box(0.09, 0.11, 0.09, C.win, 0, 0, 0.02, 0, 0, 0, 'glow'); k.cone(0.08, 0.06, 4, C.iron, 0, 0.11, 0, 0, Math.PI / 4, 0); });
  lantern.position.set(-0.3, 0.72, 0.1); root.add(lantern);
  const stack = new THREE.Group(); stack.position.set(0, 0.95, -0.34); root.add(stack);
  root.add(legL, legR, armR, armL);
  return { root, body, legL, legR, armR, armL, tool, cape, lantern, stack, height: 1.85 };
}
const ROBES: Record<string, number> = { gatherer: 0x4a4030, miner: 0x4b4a4e, forager: 0x4e3446, hauler: 0x5c4a2a, master: 0x5a2a22, spear: 0x5a2020, sling: 0x2e3a2a };
export function catRig(kind: string): Rig {
  const robe = ROBES[kind] ?? 0x3a3430, fur = kind === 'master' || kind === 'spear' ? C.fur2 : C.fur;
  const root = new THREE.Group(), body = cached('cat_' + kind, k => {
    k.add(new THREE.ConeGeometry(0.24, 0.55, 8, 1, true), robe, 0, 0.32, 0);                 // work robe
    k.cyl(0.11, 0.15, 0.3, 7, robe, 0, 0.58, 0); k.box(0.22, 0.04, 0.2, 0x2a211a, 0, 0.5, 0.02); // belt
    k.ball(0.15, fur, 0, 0.84, 0.01, 1, 0.95, 1, 1);                                          // head
    k.cone(0.055, 0.14, 4, fur, -0.085, 0.99, 0, 0, 0, 0.25); k.cone(0.055, 0.14, 4, fur, 0.085, 0.99, 0, 0, 0, -0.25);
    k.ball(0.028, 0xd8e070, -0.055, 0.85, 0.125, 1, 0.75, 1, 0, 'glow'); k.ball(0.028, 0xd8e070, 0.055, 0.85, 0.125, 1, 0.75, 1, 0, 'glow');
    if (kind === 'forager' || kind === 'sling') k.add(new THREE.ConeGeometry(0.17, 0.2, 7, 1, true), robe, 0, 0.94, -0.03); // hood
    if (kind === 'miner') { k.cyl(0.13, 0.15, 0.06, 7, 0x6a5a3a, 0, 0.98, 0); k.ball(0.03, C.fire2, 0, 1.0, 0.13, 1, 1, 1, 0, 'glow'); }
    if (kind === 'spear') k.cyl(0.13, 0.16, 0.1, 7, 0x6a6a6e, 0, 0.98, 0);
    if (kind === 'master') k.box(0.18, 0.22, 0.03, 0x3a2a1e, 0, 0.42, 0.2);
  });
  root.add(body);
  const tail = new THREE.Group(); tail.position.set(0, 0.32, -0.16);
  const tm = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.12, -0.18), new THREE.Vector3(0, 0.36, -0.22), new THREE.Vector3(0, 0.48, -0.12)]), 8, 0.03, 5), new THREE.MeshLambertMaterial({ color: fur, flatShading: true }));
  tail.add(tm); root.add(tail);
  const legL = limb(0.07, 0.2, fur, -0.07, 0.2), legR = limb(0.07, 0.2, fur, 0.07, 0.2);
  const armR = limb(0.06, 0.24, robe, 0.16, 0.66), armL = limb(0.06, 0.24, robe, -0.16, 0.66);
  const tool = new THREE.Group(); tool.position.set(0, -0.22, 0.04); tool.rotation.x = Math.PI / 2; armR.add(tool);
  const stack = new THREE.Group(); stack.position.set(0, 0.52, -0.24); root.add(stack);
  root.add(legL, legR, armR, armL);
  return { root, body, legL, legR, armR, armL, tool, tail, stack, height: 1.05 };
}
export function owlModel(): THREE.Group {
  return cached('owl', k => {
    k.ball(0.3, 0x4a3e34, 0, 0.32, 0, 1, 1.2, 0.9, 1); k.ball(0.2, 0x8a7a60, 0, 0.28, 0.16, 1, 1.2, 0.5, 1);
    k.ball(0.22, 0x5a4c40, 0, 0.66, 0.02, 1.1, 0.95, 1, 1);
    for (const s of [-1, 1]) { k.ball(0.09, 0x2a2420, s * 0.09, 0.68, 0.18, 1, 1, 0.5); k.ball(0.055, 0xffb030, s * 0.09, 0.68, 0.21, 1, 1, 0.6, 0, 'glow'); k.cone(0.05, 0.16, 4, 0x4a3e34, s * 0.13, 0.86, 0, 0, 0, -s * 0.4); }
    k.cone(0.03, 0.08, 4, C.gold, 0, 0.6, 0.22, Math.PI / 2 + 0.4, 0, 0);
    k.add(new THREE.TorusGeometry(0.075, 0.012, 4, 10), C.gold, 0.09, 0.68, 0.23);
    k.cyl(0.13, 0.13, 0.22, 8, 0x16120f, 0, 0.97, 0); k.cyl(0.2, 0.2, 0.025, 8, 0x16120f, 0, 0.86, 0); k.cyl(0.135, 0.135, 0.04, 8, C.cin, 0, 0.9, 0);
  });
}

// ---------------------------------------------------------------- enemies
export function enemyModel(kind: string): THREE.Group {
  return cached('enemy_' + kind, k => {
    if (kind === 'fluff') {
      k.ball(0.36, 0x8a8296, 0, 0.38, 0, 1, 0.9, 1, 1);
      for (let i = 0; i < 10; i++) { const a = i * 2.4, b = (i % 3) * 0.5 + 0.3; k.cone(0.07, 0.22, 4, 0x77708a, Math.cos(a) * 0.3 * Math.cos(b), 0.38 + Math.sin(b) * 0.3, Math.sin(a) * 0.3 * Math.cos(b), Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2); }
      k.ball(0.06, 0xff3a2a, -0.12, 0.45, 0.3, 1, 0.7, 0.5, 0, 'glow'); k.ball(0.06, 0xff3a2a, 0.12, 0.45, 0.3, 1, 0.7, 0.5, 0, 'glow');
    } else if (kind === 'horn') {
      k.rock(0.42, 0x3e3028, 0, 0.45, 0, 1.2, 0.9, 1.1); k.ball(0.22, 0x4a3a30, 0, 0.55, 0.36, 1, 0.9, 1);
      k.cone(0.07, 0.4, 5, 0xc9bfa8, -0.18, 0.85, 0.36, -0.4, 0, 0.5); k.cone(0.07, 0.4, 5, 0xc9bfa8, 0.18, 0.85, 0.36, -0.4, 0, -0.5);
      k.ball(0.05, 0xff3a2a, -0.09, 0.6, 0.54, 1, 0.7, 0.5, 0, 'glow'); k.ball(0.05, 0xff3a2a, 0.09, 0.6, 0.54, 1, 0.7, 0.5, 0, 'glow');
      for (const [x, z] of [[-0.25, -0.2], [0.25, -0.2], [-0.25, 0.25], [0.25, 0.25]]) k.cyl(0.07, 0.06, 0.22, 5, 0x2e241e, x, 0.11, z);
    } else if (kind === 'shade') {
      k.cone(0.3, 0.9, 7, 0x15121a, 0, 0.55, 0, Math.PI, 0, 0); k.ball(0.22, 0x15121a, 0, 0.95, 0);
      k.ball(0.05, 0xb070ff, -0.08, 0.98, 0.19, 1, 0.6, 0.5, 0, 'glow'); k.ball(0.05, 0xb070ff, 0.08, 0.98, 0.19, 1, 0.6, 0.5, 0, 'glow');
    } else {
      k.ball(1.25, 0xb4ab9e, 0, 1.25, 0, 1, 0.9, 1, 1);
      for (let i = 0; i < 18; i++) { const a = i * 2.4, b = (i % 4) * 0.35 + 0.2; k.cone(0.18, 0.7, 4, 0x9e9486, Math.cos(a) * 1.1 * Math.cos(b), 1.25 + Math.sin(b) * 1.0, Math.sin(a) * 1.1 * Math.cos(b), Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2); }
      k.cone(0.22, 1.1, 5, 0xe0d6c4, -0.6, 2.4, 0.5, -0.5, 0, 0.6); k.cone(0.22, 1.1, 5, 0xe0d6c4, 0.6, 2.4, 0.5, -0.5, 0, -0.6);
      k.ball(0.18, 0xff2a1a, -0.4, 1.5, 1.08, 1, 0.6, 0.4, 0, 'glow'); k.ball(0.18, 0xff2a1a, 0.4, 1.5, 1.08, 1, 0.6, 0.4, 0, 'glow');
      k.box(0.9, 0.12, 0.1, 0x2a1010, 0, 0.9, 1.15);
    }
  });
}

// ---------------------------------------------------------------- items
export const ITEM_H: Record<ItemId, number> = { log: 0.17, lav: 0.17, plank: 0.1, stone: 0.18, berry: 0.15, meat: 0.18, candle: 0.2, fluff: 0.18 };
export function itemModel(k0: ItemId | 'coin'): THREE.Group {
  return cached('item_' + k0, k => {
    switch (k0) {
      case 'log': case 'lav': k.cyl(0.08, 0.08, 0.44, 7, k0 === 'lav' ? C.lav : C.bark, 0, 0.08, 0, 0, 0, Math.PI / 2); k.cyl(0.065, 0.065, 0.45, 7, C.plank, 0, 0.08, 0, 0, 0, Math.PI / 2); break;
      case 'plank': k.box(0.46, 0.07, 0.16, C.plank, 0, 0.04, 0); break;
      case 'stone': k.rock(0.11, C.stone, 0, 0.09, 0, 1.2, 0.8, 1); break;
      case 'berry': for (let i = 0; i < 5; i++) k.ball(0.055, 0x5a2a62, Math.cos(i * 1.3) * 0.06, 0.05 + (i > 3 ? 0.07 : 0), Math.sin(i * 1.3) * 0.06); break;
      case 'meat': k.ball(0.1, 0x7a3028, 0, 0.09, 0, 1.3, 0.9, 1); k.cyl(0.025, 0.025, 0.2, 4, C.parch, 0.15, 0.09, 0, 0, 0, Math.PI / 2); break;
      case 'candle': k.cyl(0.045, 0.05, 0.18, 7, C.parch, 0, 0.09, 0); k.ball(0.03, C.fire2, 0, 0.21, 0, 1, 1.6, 1, 0, 'glow'); break;
      case 'fluff': k.ball(0.1, 0x9a92a6, 0, 0.1, 0, 1.2, 0.9, 1, 1); break;
      case 'coin': k.cyl(0.1, 0.1, 0.03, 10, C.gold, 0, 0.1, 0, Math.PI / 2, 0, 0); k.cyl(0.06, 0.06, 0.032, 6, 0x8a6a2e, 0, 0.1, 0.002, Math.PI / 2, 0, 0); break;
    }
  });
}

// ---------------------------------------------------------------- pads
const padTex = new Map<string, THREE.CanvasTexture>();
export function padTexture(kind: string): THREE.CanvasTexture {
  let t = padTex.get(kind); if (t) return t;
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d')!;
  c.fillStyle = '#211d1a'; c.fillRect(0, 0, 128, 128);
  c.strokeStyle = '#b08a3e'; c.lineWidth = 4; c.strokeRect(6, 6, 116, 116); c.lineWidth = 1.5; c.strokeRect(13, 13, 102, 102);
  c.strokeStyle = '#d9b25a'; c.fillStyle = '#d9b25a'; c.lineWidth = 6; c.lineCap = 'round'; c.lineJoin = 'round';
  const cx = 64, cy = 52;
  c.beginPath();
  switch (kind) {
    case 'sell': c.arc(cx, cy, 20, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.moveTo(cx, cy - 11); c.lineTo(cx, cy + 11); c.moveTo(cx - 8, cy - 4); c.lineTo(cx + 8, cy - 4); break;
    case 'deposit': c.rect(cx - 20, cy - 14, 40, 30); c.moveTo(cx - 20, cy - 4); c.lineTo(cx + 20, cy - 4); break;
    case 'in': c.moveTo(cx, cy - 20); c.lineTo(cx, cy + 16); c.moveTo(cx - 13, cy + 3); c.lineTo(cx, cy + 16); c.lineTo(cx + 13, cy + 3); break;
    case 'out': c.moveTo(cx, cy + 18); c.lineTo(cx, cy - 18); c.moveTo(cx - 13, cy - 5); c.lineTo(cx, cy - 18); c.lineTo(cx + 13, cy - 5); break;
    case 'forge': c.moveTo(cx - 16, cy + 18); c.lineTo(cx + 6, cy - 4); c.moveTo(cx - 4, cy - 18); c.lineTo(cx + 18, cy + 4); break;
    case 'bell': c.moveTo(cx - 16, cy + 12); c.quadraticCurveTo(cx - 14, cy - 20, cx, cy - 20); c.quadraticCurveTo(cx + 14, cy - 20, cx + 16, cy + 12); c.closePath(); c.moveTo(cx - 4, cy + 18); c.lineTo(cx + 4, cy + 18); break;
    case 'fuel': c.moveTo(cx, cy - 22); c.quadraticCurveTo(cx + 20, cy, cx + 12, cy + 14); c.quadraticCurveTo(cx, cy + 22, cx - 12, cy + 14); c.quadraticCurveTo(cx - 20, cy, cx, cy - 22); break;
  }
  c.stroke();
  const label: Record<string, string> = { sell: 'ПРОДАТИ', deposit: 'НА СКЛАД', in: 'ПРИЙОМ', out: 'ВИДАЧА', forge: 'КУЗНЯ', bell: 'ДЗВІН', fuel: 'ПАЛИВО' };
  c.font = '700 17px "PT Serif", Georgia, serif'; c.textAlign = 'center'; c.fillStyle = '#c9bfa8'; c.fillText(label[kind] || '', 64, 108);
  t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; padTex.set(kind, t); return t;
}
