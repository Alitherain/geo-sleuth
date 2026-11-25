// Three.js view of the simulation. Reads the World every frame and never writes to it.
// World units: 1 grid cell (48 px of simulation space) = 1 scene unit. Sim (x, y) -> scene (x, 0, y); height is +y.
import * as THREE from 'three';
import { BUILD, CELL, EDGE, GROVE, HEDGE_X, HILLS, ITEMS, MEADOW, ROAD_Y, SPAWNS, TC, W, H, WILDS, type BuildingType, type ItemId } from '../content/data';
import { dist, hallLevel, invTotal, lightRadius, type Building, type GameEvent, type World } from '../sim/world';
import { areaHalf, footprint, occupancy, padRow, townHalf } from '../sim/grid';
import { C, ITEM_H, MAT, addGrain, buildingModel, catRig, enemyModel, heroRig, itemModel, nodeModel, padTexture, plotTexture, propGeo, toolModel, type Rig } from './models';
import { offerCost } from '../sim/town';
import { sfx } from '../platform/audio';

const U = 1 / CELL;
const REDUCED = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const angLerp = (a: number, b: number, t: number) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; };

export interface Ghost { type: BuildingType; x: number; y: number; ok: boolean; moving?: string; line?: { x: number; y: number; ok: boolean }[] }
export interface BuildView { active: boolean; ghost: Ghost | null; selected: string | null; why?: string; spots?: { x: number; y: number }[] }

// ---------------------------------------------------------------- particles (three pooled point clouds)
class Particles {
  pts: THREE.Points; n = 0; max: number;
  pos: Float32Array; col: Float32Array; vel: Float32Array; life: Float32Array; maxLife: Float32Array; grav: Float32Array; drag: Uint8Array; base: Float32Array;
  constructor(scene: THREE.Scene, max: number, size: number, additive: boolean, tex: THREE.Texture) {
    this.max = max; this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max); this.grav = new Float32Array(max); this.drag = new Uint8Array(max); this.base = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.pts = new THREE.Points(g, new THREE.PointsMaterial({ size, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true, alphaTest: 0.01 }));
    this.pts.frustumCulled = false; scene.add(this.pts);
  }
  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, color: number, grav: number, drag = false, alpha = 1) {
    if (this.n >= this.max) return;
    const i = this.n++, c = new THREE.Color(color);
    this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3); this.col.set([c.r, c.g, c.b, alpha], i * 4);
    this.life[i] = life; this.maxLife[i] = life; this.grav[i] = grav; this.drag[i] = drag ? 1 : 0; this.base[i] = alpha;
  }
  update(dt: number) {
    for (let i = this.n - 1; i >= 0; i--) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { const j = --this.n; if (i !== j) { this.pos.copyWithin(i * 3, j * 3, j * 3 + 3); this.vel.copyWithin(i * 3, j * 3, j * 3 + 3); this.col.copyWithin(i * 4, j * 4, j * 4 + 4); this.life[i] = this.life[j]; this.maxLife[i] = this.maxLife[j]; this.grav[i] = this.grav[j]; this.drag[i] = this.drag[j]; this.base[i] = this.base[j]; } continue; }
      const p = i * 3;
      this.vel[p + 1] -= this.grav[i] * dt;
      if (this.drag[i]) { this.vel[p] *= 0.97; this.vel[p + 2] *= 0.97; this.vel[p + 1] = Math.max(this.vel[p + 1], -0.8); }
      this.pos[p] += this.vel[p] * dt; this.pos[p + 1] += this.vel[p + 1] * dt; this.pos[p + 2] += this.vel[p + 2] * dt;
      if (this.pos[p + 1] < 0.02 && this.grav[i] > 0) { this.pos[p + 1] = 0.02; this.vel[p + 1] *= -0.3; this.vel[p] *= 0.6; this.vel[p + 2] *= 0.6; }
      this.col[i * 4 + 3] = this.base[i] * Math.min(1, this.life[i] / this.maxLife[i] * 2.2);
    }
    const g = this.pts.geometry; g.setDrawRange(0, this.n); g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
  }
}
function dotTexture(soft: boolean): THREE.Texture {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d')!;
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  if (soft) { g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.5, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); }
  else { g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.55, 'rgba(255,255,255,1)'); g.addColorStop(0.75, 'rgba(255,255,255,0.4)'); g.addColorStop(1, 'rgba(255,255,255,0)'); }
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv); return t;
}

// ---------------------------------------------------------------- DOM overlay for crisp text
class Overlay {
  root: HTMLDivElement; pool: HTMLDivElement[] = [];
  constructor() { this.root = document.createElement('div'); this.root.id = 'labels'; document.body.appendChild(this.root); }
  make(cls: string): HTMLDivElement { const el = this.pool.pop() || document.createElement('div'); el.className = cls; el.style.opacity = ''; el.innerHTML = ''; this.root.appendChild(el); return el; }
  free(el: HTMLDivElement) { el.remove(); this.pool.push(el); }
}

interface CharV { rig: Rig; yaw: number; lx: number; ly: number; tool: string; stackSig: string; bubble?: HTMLDivElement; bubbleText?: string; kind: string }
interface BV { root: THREE.Group; parts: Record<string, THREE.Object3D>; sig: string; pads: THREE.Group; top: number; label?: HTMLDivElement; labelText?: string; bars?: HTMLDivElement; pileIn: THREE.Group; pileOut: THREE.Group; pileSig: string; pop: number; smokeT: number }
interface EV { group: THREE.Group; mats: THREE.MeshLambertMaterial[]; yaw: number; lx: number; ly: number; hp?: HTMLDivElement }
interface Flyer { obj: THREE.Object3D; fx: number; fy: number; fz: number; to: () => { x: number; y: number; z: number }; t: number; dur: number; h: number; owner?: string }

export class View {
  renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); camera: THREE.PerspectiveCamera;
  w: World; target = new THREE.Vector3(); camFollow = true; shake = 0; elapsed = 0;
  hemi: THREE.HemisphereLight; sun: THREE.DirectionalLight; fires: THREE.PointLight[] = []; heroLight: THREE.PointLight;
  groundCv = document.createElement('canvas'); groundTex: THREE.CanvasTexture; groundSig = '';
  hedge!: THREE.InstancedMesh;
  zoom = 1; offers = new Map<number, { root: THREE.Group; fill: THREE.Mesh; label: HTMLDivElement; sig: string }>(); visitors = new Map<number, CharV>(); till = new THREE.Group(); tillN = -1;
  hero: CharV; cats = new Map<number, CharV>(); units = new Map<number, CharV>(); enemies = new Map<number, EV>();
  nodes = new Map<number, { obj: THREE.Group; alive: boolean; kind: string }>();
  buildings = new Map<string, BV>(); ground = new Map<number, THREE.Object3D>(); shots = new Map<number, THREE.Object3D>();
  flyers: Flyer[] = []; falls: { obj: THREE.Object3D; t: number; dir: number }[] = []; pending: Record<string, number> = {};
  spark: Particles; chip: Particles; smoke: Particles;
  ov = new Overlay(); texts: { el: HTMLDivElement; x: number; y: number; z: number; vz: number; life: number }[] = [];
  arrows: THREE.Mesh[] = []; tele: THREE.Mesh; teleIn: THREE.Mesh;
  gridMesh: THREE.InstancedMesh; ghostGroup = new THREE.Group(); ghostSig = ''; ringMesh: THREE.Mesh; selLine: THREE.LineLoop; borderLine: THREE.LineLoop; nearLine: THREE.LineLoop; gridSig = '';
  ghostOk = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.6, emissive: 0x2a4a1a, depthWrite: false });
  ghostBad = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.55, emissive: 0x6a1410, depthWrite: false });

  constructor(private parent: HTMLElement, private getWorld: () => World, private getBuild: () => BuildView) {
    this.w = getWorld();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, innerWidth > 1600 ? 1.25 : 1.5));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    parent.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.5, 120);
    this.scene.background = new THREE.Color(0x1d1e1c); this.scene.fog = new THREE.Fog(0x1d1e1c, 20, 48);

    this.hemi = new THREE.HemisphereLight(0xc8c2b4, 0x2a241e, 1.1); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xe6dccb, 1.6); this.sun.castShadow = true;
    const big = Math.max(screen.width, screen.height) * (devicePixelRatio || 1) > 1800;
    this.sun.shadow.mapSize.set(big ? 2048 : 1024, big ? 2048 : 1024);
    const sc = this.sun.shadow.camera; sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 50;
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    for (let i = 0; i < 8; i++) { const l = new THREE.PointLight(0xff9a4a, 0, 6, 1.4); this.scene.add(l); this.fires.push(l); }
    this.heroLight = new THREE.PointLight(0xffc27a, 0, 6, 1.3); this.scene.add(this.heroLight);

    // ground
    this.groundCv.width = W * 0.8; this.groundCv.height = H * 0.8;
    this.groundTex = new THREE.CanvasTexture(this.groundCv); this.groundTex.colorSpace = THREE.SRGBColorSpace; this.groundTex.anisotropy = 8;
    const gm = new THREE.Mesh(new THREE.PlaneGeometry(W * U, H * U), addGrain(new THREE.MeshLambertMaterial({ map: this.groundTex }), 0.12));
    gm.rotation.x = -Math.PI / 2; gm.position.set(W * U / 2, 0, H * U / 2); gm.receiveShadow = true; this.scene.add(gm);
    const under = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: 0x0e0f0e })); under.rotation.x = -Math.PI / 2; under.position.set(W * U / 2, -0.05, H * U / 2); this.scene.add(under);
    this.drawGround(); this.makeProps();

    this.hero = { rig: heroRig(), yaw: 0, lx: 0, ly: 0, tool: 'axe', stackSig: '', kind: 'hero' };
    this.scene.add(this.hero.rig.root);
    this.scene.add(this.till);
    const soft = dotTexture(true), hard = dotTexture(false);
    this.spark = new Particles(this.scene, 500, 0.16, true, soft); this.chip = new Particles(this.scene, 500, 0.13, false, hard); this.smoke = new Particles(this.scene, 160, 1.1, false, soft);

    // markers
    const arrowShape = new THREE.Shape([new THREE.Vector2(0.9, 0), new THREE.Vector2(-0.3, 0.55), new THREE.Vector2(-0.05, 0), new THREE.Vector2(-0.3, -0.55)]);
    for (let i = 0; i < 4; i++) { const a = new THREE.Mesh(new THREE.ShapeGeometry(arrowShape), new THREE.MeshBasicMaterial({ color: 0xc0432f, transparent: true, opacity: 0.9, depthWrite: false })); a.rotation.x = -Math.PI / 2; a.visible = false; this.scene.add(a); this.arrows.push(a); }
    this.tele = new THREE.Mesh(new THREE.RingGeometry(2.3, 2.6, 40), new THREE.MeshBasicMaterial({ color: 0xc0432f, transparent: true, opacity: 0.8, depthWrite: false })); this.tele.rotation.x = -Math.PI / 2; this.tele.visible = false;
    this.teleIn = new THREE.Mesh(new THREE.CircleGeometry(2.3, 40), new THREE.MeshBasicMaterial({ color: 0x7d2a22, transparent: true, opacity: 0.35, depthWrite: false })); this.teleIn.rotation.x = -Math.PI / 2; this.teleIn.visible = false;
    this.scene.add(this.tele, this.teleIn);
    this.gridMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.38, depthWrite: false }), 3000);
    this.gridMesh.count = 0; this.gridMesh.frustumCulled = false; this.gridMesh.position.y = 0.03; this.scene.add(this.gridMesh);
    this.ringMesh = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffcf6a, transparent: true, opacity: 0.5, depthWrite: false })); this.ringMesh.visible = false; this.ringMesh.position.y = 0.04; this.scene.add(this.ringMesh);
    const sq = () => new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 0, -0.5), new THREE.Vector3(0.5, 0, 0.5), new THREE.Vector3(-0.5, 0, 0.5)]), new THREE.LineBasicMaterial({ color: 0xd9b25a }));
    this.selLine = sq(); this.borderLine = sq(); this.nearLine = sq(); (this.nearLine.material as THREE.LineBasicMaterial).color.set(0x7d2a22);
    for (const l of [this.selLine, this.borderLine, this.nearLine]) { l.visible = false; l.position.y = 0.05; this.scene.add(l); }
    this.scene.add(this.ghostGroup);

    this.target.set(this.w.hero.x * U, 0, this.w.hero.y * U);
    addEventListener('resize', () => this.resize()); this.resize();
  }
  resize() { this.renderer.setSize(innerWidth, innerHeight); this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); }
  setWorld(w: World) {
    this.w = w;
    for (const m of [this.cats, this.units]) { for (const v of m.values()) { this.scene.remove(v.rig.root); if (v.bubble) this.ov.free(v.bubble); } m.clear(); }
    for (const v of this.enemies.values()) { this.scene.remove(v.group); if (v.hp) this.ov.free(v.hp); } this.enemies.clear();
    for (const v of this.nodes.values()) this.scene.remove(v.obj); this.nodes.clear();
    for (const [id] of this.buildings) this.dropB(id);
    for (const v of this.ground.values()) this.scene.remove(v); this.ground.clear();
    for (const v of this.shots.values()) this.scene.remove(v); this.shots.clear();
    this.pending = {}; this.groundSig = ''; this.target.set(w.hero.x * U, 0, w.hero.y * U);
  }

  // ---------------------------------------------------------------- static ground
  drawGround() {
    const w = this.w, sig = hallLevel(w) + '|' + !!w.flags.hedge; if (sig === this.groundSig) return; this.groundSig = sig;
    const c = this.groundCv.getContext('2d')!, S = 0.8;
    let seed = 99; const r = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    c.fillStyle = '#273024'; c.fillRect(0, 0, W * S, H * S);
    for (let i = 0; i < 5200; i++) { const x = r() * W * S, y = r() * H * S, s = 5 + r() * 26; c.fillStyle = `rgba(${r() < 0.5 ? '18,24,16' : '52,62,44'},${0.08 + r() * 0.12})`; c.beginPath(); c.ellipse(x, y, s, s * 0.6, r() * 3, 0, Math.PI * 2); c.fill(); }
    const zone = (R: { x: number; y: number; w: number; h: number }, col: string) => { c.fillStyle = col; c.beginPath(); (c as any).roundRect((R.x - 40) * S, (R.y - 40) * S, (R.w + 80) * S, (R.h + 80) * S, 40); c.fill(); };
    zone(EDGE, 'rgba(16,24,16,0.35)'); zone(GROVE, w.flags.hedge ? 'rgba(52,40,66,0.45)' : 'rgba(20,22,26,0.5)'); zone(HILLS, 'rgba(90,86,76,0.4)'); zone(MEADOW, 'rgba(70,80,52,0.3)');
    c.fillStyle = 'rgba(36,28,40,0.75)'; c.beginPath(); (c as any).roundRect((WILDS.x - 30) * S, 40 * S, (W - WILDS.x + 60) * S, (H - 60) * S, 60); c.fill();
    // dirt roads
    const road = (x: number, y: number, ww: number, hh: number) => { c.fillStyle = '#3a3128'; c.fillRect(x * S, y * S, ww * S, hh * S); c.fillStyle = 'rgba(92,78,60,0.55)'; c.fillRect((x + 6) * S, (y + 6) * S, (ww - 12) * S, (hh - 12) * S); };
    road(HEDGE_X - 30, ROAD_Y - 48, W - HEDGE_X - 60, 96); road(TC.x - 48, HILLS.y + HILLS.h - 60, 96, MEADOW.y - HILLS.y - HILLS.h + 120);
    // town square: cobbles per grid cell, darker roads, stone kerb
    const T = townHalf(w), x0 = TC.x - T * CELL, y0 = TC.y - T * CELL, side = 2 * T * CELL;
    c.fillStyle = '#26221d'; c.fillRect((x0 - 10) * S, (y0 - 10) * S, (side + 20) * S, (side + 20) * S);
    for (let i = -T; i < T; i++) for (let j = -T; j < T; j++) {
      const rd = i === -1 || i === 0 || j === -1 || j === 0, cx = (TC.x + i * CELL) * S, cy = (TC.y + j * CELL) * S, q = CELL * S;
      c.fillStyle = rd ? '#4a4237' : '#3e3a33'; c.fillRect(cx, cy, q, q);
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) { const t = r(); const sx = cx + a * q / 2 + 1.5, sy = cy + b * q / 2 + 1.5, sw = q / 2 - 3; c.fillStyle = rd ? (t < 0.5 ? '#5e5547' : '#554c40') : (t < 0.5 ? '#4e4940' : '#47423b'); c.beginPath(); (c as any).roundRect(sx, sy, sw, sw, 4); c.fill(); c.fillStyle = 'rgba(255,240,210,0.06)'; c.fillRect(sx + 2, sy + 2, sw - 6, 3); c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(sx + 2, sy + sw - 3, sw - 4, 2); }
      c.strokeStyle = 'rgba(20,16,12,0.35)'; c.lineWidth = 1; c.strokeRect(cx + 0.5, cy + 0.5, q - 1, q - 1);
    }
    c.strokeStyle = '#1a1714'; c.lineWidth = 3; c.strokeRect((x0 - 6) * S, (y0 - 6) * S, (side + 12) * S, (side + 12) * S);
    c.strokeStyle = 'rgba(176,138,62,0.35)'; c.lineWidth = 1; c.strokeRect((x0 - 2) * S, (y0 - 2) * S, (side + 4) * S, (side + 4) * S);
    this.groundTex.needsUpdate = true;
    if (this.hedge) this.hedge.visible = !w.flags.hedge;
  }
  makeProps() {
    let seed = 4242; const r = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const inst = (kind: Parameters<typeof propGeo>[0], list: [number, number, number, number][], shadow = false) => {
      const geos = propGeo(kind);
      for (const layer of ['body', 'glow'] as const) {
        const g = geos[layer]; if (!g) continue;
        const m = new THREE.InstancedMesh(g, layer === 'body' ? MAT.body : MAT.glow, list.length); const o = new THREE.Object3D();
        list.forEach(([x, y, s, rot], i) => { o.position.set(x * U, 0, y * U); o.scale.setScalar(s); o.rotation.set(0, rot, 0); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
        m.castShadow = shadow; m.receiveShadow = true; this.scene.add(m);
        if (kind === 'hedge') this.hedge = m;
      }
    };
    const pines: [number, number, number, number][] = [];
    for (let x = -20; x < W + 40; x += 44) { pines.push([x + r() * 20, 60 + r() * 50, 1 + r() * 0.6, r() * 6]); pines.push([x + r() * 20, H - 20 + r() * 30, 1 + r() * 0.6, r() * 6]); }
    for (let y = 80; y < H - 20; y += 44) { pines.push([10 + r() * 40, y, 1 + r() * 0.6, r() * 6]); pines.push([W - 10 - r() * 40, y, 1 + r() * 0.6, r() * 6]); }
    inst('bgpine', pines, true);
    const lists: Record<string, [number, number, number, number][]> = { tuft: [], grave: [], shroom: [], pebble: [], flower: [], deadtree: [] };
    for (let i = 0; i < 1300; i++) {
      const x = 80 + r() * (W - 160), y = 120 + r() * (H - 200);
      if (Math.abs(x - TC.x) < 640 && Math.abs(y - TC.y) < 640) continue;
      if (Math.abs(y - ROAD_Y) < 56 && x > HEDGE_X) continue;
      const wild = x > WILDS.x, k = r();
      let key = 'tuft';
      if (wild) { if (k < 0.07) key = 'grave'; else if (k < 0.1) key = 'deadtree'; else if (k < 0.15) key = 'shroom'; }
      else if (k < 0.08) key = 'flower'; else if (k < 0.12) key = 'shroom'; else if (k < 0.2) key = 'pebble';
      lists[key].push([x, y, 0.8 + r() * 0.6, r() * 6]);
    }
    for (const [k, l] of Object.entries(lists)) inst(k as any, l, k === 'grave' || k === 'deadtree');
    const hedge: [number, number, number, number][] = []; for (let y = 120; y < H - 50; y += 26) hedge.push([HEDGE_X + Math.sin(y * 0.3) * 4, y, 0.85 + r() * 0.4, r() * 6]);
    inst('hedge', hedge, true);
    if (this.hedge) this.hedge.visible = !this.w.flags.hedge;
  }

  // ---------------------------------------------------------------- frame
  frame(dt: number) {
    this.elapsed += dt; this.w = this.getWorld();
    this.drawGround();
    this.syncNodes(); this.syncBuildings(dt); this.syncChars(dt); this.syncEnemies(dt); this.syncMisc(dt); this.syncTown(dt);
    this.updateBuild(); this.updateFx(dt); this.ambient(dt); this.updateLight(); this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
    this.updateLabels(dt);
  }

  // ---------------------------------------------------------------- nature
  syncNodes() {
    const t = this.elapsed;
    for (const n of this.w.nodes) {
      let v = this.nodes.get(n.id);
      if (!v || v.alive !== n.alive) { if (v) this.scene.remove(v.obj); const obj = nodeModel(n.kind, n.alive); obj.rotation.y = n.seed; this.scene.add(obj); v = { obj, alive: n.alive, kind: n.kind }; this.nodes.set(n.id, v); }
      const g = n.alive && n.grow < 1 ? 1 + 2.7 * Math.pow(n.grow - 1, 3) + 1.7 * Math.pow(n.grow - 1, 2) : 1;
      v.obj.position.set(n.x * U, 0, n.y * U); v.obj.scale.setScalar(n.s * Math.max(0.05, g));
      const tree = n.kind === 'oak' || n.kind === 'pine' || n.kind === 'lav';
      v.obj.rotation.z = (tree && n.alive ? Math.sin(t * 1.3 + n.seed) * 0.02 : 0) + Math.sin(t * 45) * n.shake * 0.06;
    }
  }

  // ---------------------------------------------------------------- buildings
  private palMask(b: Building, pal: Set<string>) { return (pal.has((b.x + CELL) + ',' + b.y) ? 1 : 0) | (pal.has(b.x + ',' + (b.y + CELL)) ? 2 : 0); }
  private bSig(b: Building, pal: Set<string>) { return b.site ? 'site' + (BUILD[b.type].fp || 1) : b.type + b.level + (b.type === 'palisade' ? '|' + this.palMask(b, pal) + (b.hp <= 0 ? 'x' : '') : ''); }
  dropB(id: string) { const v = this.buildings.get(id); if (!v) return; this.scene.remove(v.root); if (v.label) this.ov.free(v.label); if (v.bars) this.ov.free(v.bars); this.buildings.delete(id); }
  syncBuildings(dt: number) {
    const w = this.w, t = this.elapsed;
    const pal = new Set<string>(); for (const b of Object.values(w.buildings)) if (b.type === 'palisade' && !b.site) pal.add(b.x + ',' + b.y);
    for (const b of Object.values(w.buildings)) {
      const def = BUILD[b.type], sig = this.bSig(b, pal);
      let v = this.buildings.get(b.id);
      if (!v || v.sig !== sig) {
        const fresh = !v, wasSite = v?.sig.startsWith('site');
        if (v) { this.scene.remove(v.root); }
        const m = b.site ? buildingModel('site', 1, def.fp) : buildingModel(b.type, b.level, def.fp, b.type === 'palisade' ? this.palMask(b, pal) : 0, b.hp <= 0);
        const root = new THREE.Group(); root.add(m.group);
        const pads = new THREE.Group(); root.add(pads);
        for (const s of def.slots || []) {
          const plate = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.05, 0.86), new THREE.MeshLambertMaterial({ color: 0x1e1a17 }));
          const top = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: padTexture(s.kind), transparent: true }));
          plate.position.set(s.dx * U, 0.025, s.dy * U); top.position.set(s.dx * U, 0.055, s.dy * U); plate.receiveShadow = top.receiveShadow = true; pads.add(plate, top);
        }
        const box = new THREE.Box3().setFromObject(m.group);
        const nv: BV = { root, parts: m.parts, sig, pads, top: box.max.y, pileIn: new THREE.Group(), pileOut: new THREE.Group(), pileSig: '', pop: fresh ? (w.time - b.builtAt < 1 ? 0 : 1) : wasSite || v!.sig.replace(/\d+.*/, '') === sig.replace(/\d+.*/, '') ? 0.2 : 1, smokeT: Math.random(), label: v?.label, labelText: v?.labelText, bars: v?.bars };
        root.add(nv.pileIn, nv.pileOut);
        this.scene.add(root); this.buildings.set(b.id, nv); v = nv;
      }
      v.pads.visible = !b.site;
      v.pop = Math.min(1, v.pop + dt * 2.4);
      const e = v.pop >= 1 ? 1 : 1 + 2.2 * Math.pow(v.pop - 1, 3) + 1.2 * Math.pow(v.pop - 1, 2);
      const working = b.status === 'Працює';
      v.root.position.set(b.x * U, 0, b.y * U);
      v.root.children[0].scale.set(e * (1 + (working ? Math.abs(Math.sin(t * 9)) * 0.012 : 0)), e, e);
      // animated parts
      const P = v.parts;
      if (P.blade && working) P.blade.rotation.z -= dt * (b.spec === 'fast' ? 24 : 12);
      if (P.flag) P.flag.rotation.y = Math.sin(t * 3 + b.x) * 0.35;
      if (P.owl) { P.owl.position.y = 0.8 + Math.sin(t * 2) * 0.02; P.owl.rotation.y = Math.sin(t * 0.7) * 0.4; }
      const lit = lightRadius(b) > 0;
      if (P.flames) {
        P.flames.visible = lit; if (P.ash) P.ash.visible = !lit;
        if (lit) { const k = 0.6 + 0.4 * (b.fuel / def.fuel!.cap); P.flames.children.forEach((f, i) => { f.scale.set(k * (0.85 + Math.sin(t * (13 + i * 3) + i) * 0.15), k * (0.8 + Math.abs(Math.sin(t * (9 + i * 2) + i * 2)) * 0.4), k); f.rotation.y = t * 2 + i; });
          if (Math.random() < dt * (b.type === 'heart' ? 12 : 6)) this.spark.spawn(b.x * U + (Math.random() - 0.5) * 0.3, 0.6 + Math.random() * 0.3, b.y * U + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, 1.2 + Math.random(), (Math.random() - 0.5) * 0.3, 1.1, 0xffb050, -0.2, true); }
      }
      if (P.glass) ((P.glass as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(lit ? 0xffc469 : 0x2a2622);
      v.smokeT -= dt;
      if (!b.site && v.smokeT <= 0 && (b.type === 'forge' || b.type === 'candleShop' || b.type === 'houseMaster' || b.type === 'hall' || b.type === 'barracks')) {
        v.smokeT = 0.45 + Math.random() * 0.3; const top = v.top * 0.92;
        this.smoke.spawn(b.x * U + 0.3 + (Math.random() - 0.5) * 0.1, top, b.y * U - 0.3, 0.12 + Math.random() * 0.1, 0.35 + Math.random() * 0.15, 0, 3, 0x8a8478, 0, false, 0.35);
      }
      if (b.type === 'fountain' && Math.random() < dt * 14) this.chip.spawn(b.x * U, 1.35, b.y * U, (Math.random() - 0.5) * 0.8, 1.6, (Math.random() - 0.5) * 0.8, 0.8, 0x8fb8c8, 4);
      if (b.type === 'forge' && Math.random() < dt * 1.5) for (let i = 0; i < 3; i++) this.spark.spawn(b.x * U + 0.45, 0.55, b.y * U + 0.65, (Math.random() - 0.5) * 1.5, 1 + Math.random(), (Math.random() - 0.5) * 1.5, 0.5, 0xffcf4a, 5);
      // input/output piles next to the pads
      if (def.proc) {
        const p = def.proc, nIn = Math.min(12, b.input[p.input] || 0), nOut = Math.min(12, b.store[p.output] || 0), ps = nIn + '|' + nOut;
        if (ps !== v.pileSig) {
          v.pileSig = ps;
          for (const [grp, n, item, side] of [[v.pileIn, nIn, p.input, -1], [v.pileOut, nOut, p.output, 1]] as [THREE.Group, number, ItemId, number][]) {
            grp.clear(); const fp = def.fp || 1;
            for (let i = 0; i < n; i++) { const m = itemModel(item); m.position.set(side * (fp / 2 + 0.3), Math.floor(i / 3) * ITEM_H[item] * 0.9, (i % 3 - 1) * 0.22 + 0.2); m.rotation.y = Math.PI / 2; grp.add(m); }
          }
        }
      }
    }
    for (const id of [...this.buildings.keys()]) if (!w.buildings[id]) this.dropB(id);
  }

  // ---------------------------------------------------------------- characters
  private animRig(v: CharV, e: { x: number; y: number; face: number; moving: boolean; walkT: number; swing: number }, vx: number, vy: number, dt: number, scale = 1) {
    const r = v.rig, t = this.elapsed;
    r.root.position.set(e.x * U, 0, e.y * U);
    const sp = Math.hypot(vx, vy);
    let yaw = v.yaw;
    if (sp > 8) yaw = Math.atan2(vx, vy); else if (e.swing > 0) yaw = e.face > 0 ? Math.PI / 2 : -Math.PI / 2;
    v.yaw = angLerp(v.yaw, yaw, Math.min(1, dt * 12)); r.root.rotation.y = v.yaw;
    const run = e.moving ? Math.sin(e.walkT * 11) : 0;
    r.body.position.y = e.moving ? Math.abs(run) * 0.05 * scale : Math.sin(t * 2 + e.x) * 0.008;
    r.body.rotation.x = e.moving ? 0.08 : 0;
    r.legL.rotation.x = run * 0.7; r.legR.rotation.x = -run * 0.7;
    if (r.armL) r.armL.rotation.x = -run * 0.5;
    r.armR.rotation.x = e.swing > 0 ? lerp(-2.7, 0.7, 1 - e.swing) : run * 0.5 - 0.15;
    if (r.cape) r.cape.rotation.x = 0.12 + Math.min(0.7, sp / 260) + Math.sin(t * 4 + e.walkT * 6) * 0.05;
    if (r.tail) { r.tail.rotation.z = Math.sin(t * 1.8 + e.x) * 0.25; r.tail.rotation.x = e.moving ? 0.35 : 0; }
    if (r.lantern) { r.lantern.rotation.x = Math.sin(t * 3 + e.walkT * 9) * 0.25; }
  }
  private syncStack(v: CharV, stack: ItemId[], owner: string, sway: number) {
    const hidden = this.pending[owner] || 0, n = Math.max(0, stack.length - hidden), shown = stack.slice(0, n), sig = shown.join(',');
    if (sig !== v.stackSig) {
      v.stackSig = sig; const g = v.rig.stack; g.clear();
      let y = 0; for (const it of shown) { const m = itemModel(it); m.position.y = y; g.add(m); y += ITEM_H[it]; }
    }
    v.rig.stack.children.forEach((m, i) => { const k = i / 12; m.position.x = sway * k * k * 0.4; });
  }
  private bubble(v: CharV, text: string | null) {
    if (!text) { if (v.bubble) { this.ov.free(v.bubble); v.bubble = undefined; v.bubbleText = undefined; } return; }
    if (!v.bubble) v.bubble = this.ov.make('bub');
    if (v.bubbleText !== text) { v.bubble.textContent = text; v.bubbleText = text; }
  }
  syncChars(dt: number) {
    const w = this.w, h = w.hero, t = this.elapsed;
    // hero
    const hv = this.hero;
    this.animRig(hv, h, h.vx, h.vy, dt);
    hv.rig.root.visible = !(h.dead > 0 && h.dead < 2.6) && !(h.inv > 0 && Math.floor(t * 20) % 2);
    const tool = h.form === 'saw' ? 'saw' : 'axe';
    if (tool !== hv.tool) { hv.tool = tool; hv.rig.tool.clear(); hv.rig.tool.add(toolModel(tool)); }
    this.syncStack(hv, h.stack, 'hero', -h.vx * 0.004);
    // cats
    const seen = new Set<number>();
    for (const c of w.cats) {
      seen.add(c.id);
      let v = this.cats.get(c.id);
      const home = w.buildings[c.home], kind = home?.type === 'houseQuarry' ? 'miner' : home?.type === 'houseForager' ? 'forager' : c.role;
      if (!v || v.kind !== kind) { if (v) this.scene.remove(v.rig.root); v = { rig: catRig(kind), yaw: 0, lx: c.x, ly: c.y, tool: '', stackSig: '', kind }; this.scene.add(v.rig.root); this.cats.set(c.id, v); }
      const tk = c.role === 'gatherer' ? (home?.gather === 'stone' ? 'pick' : home?.gather === 'berry' ? 'basket' : 'catAxe') : c.role === 'master' ? 'hammer' : '';
      if (tk !== v.tool) { v.tool = tk; v.rig.tool.clear(); if (tk) v.rig.tool.add(toolModel(tk)); }
      const vx = (c.x - v.lx) / Math.max(dt, 1e-3), vy = (c.y - v.ly) / Math.max(dt, 1e-3); v.lx = c.x; v.ly = c.y;
      v.rig.root.visible = !c.hidden;
      this.animRig(v, c, c.moving ? vx : 0, c.moving ? vy : 0, dt, 0.6);
      this.syncStack(v, c.stack, 'c' + c.id, c.moving ? -c.face * 0.15 : 0);
      this.bubble(v, !c.hidden && c.idle && !c.moving ? c.idle : null);
      if (v.bubble) this.place(v.bubble, c.x, c.y, 1.25);
    }
    for (const [id, v] of this.cats) if (!seen.has(id)) { this.scene.remove(v.rig.root); this.bubble(v, null); this.cats.delete(id); }
    // units
    const useen = new Set<number>();
    for (const u of w.units) {
      useen.add(u.id);
      let v = this.units.get(u.id);
      if (!v) { v = { rig: catRig(u.kind), yaw: 0, lx: u.x, ly: u.y, tool: u.kind, stackSig: '', kind: u.kind }; v.rig.tool.add(toolModel(u.kind)); this.scene.add(v.rig.root); this.units.set(u.id, v); }
      const vx = (u.x - v.lx) / Math.max(dt, 1e-3), vy = (u.y - v.ly) / Math.max(dt, 1e-3); v.lx = u.x; v.ly = u.y;
      this.animRig(v, u, u.moving ? vx : 0, u.moving ? vy : 0, dt, 0.6);
      v.rig.root.visible = !(u.woundT > 0 && Math.floor(t * 4) % 2);
      this.bubble(v, u.woundT > 0 ? 'поранений · ' + Math.ceil(u.woundT) : null);
      if (v.bubble) this.place(v.bubble, u.x, u.y, 1.25);
    }
    for (const [id, v] of this.units) if (!useen.has(id)) { this.scene.remove(v.rig.root); this.bubble(v, null); this.units.delete(id); }
  }
  syncEnemies(dt: number) {
    const w = this.w, t = this.elapsed, seen = new Set<number>();
    for (const e of w.enemies) {
      seen.add(e.id);
      let v = this.enemies.get(e.id);
      if (!v) {
        const group = new THREE.Group(), m = enemyModel(e.kind), mats: THREE.MeshLambertMaterial[] = [];
        m.traverse(o => { const mesh = o as THREE.Mesh; if (mesh.isMesh && mesh.name === 'body') { const mt = MAT.body.clone(); if (e.kind === 'shade') { mt.transparent = true; mt.opacity = 0.75; } mesh.material = mt; mats.push(mt); } });
        group.add(m); this.scene.add(group); v = { group, mats, yaw: 0, lx: e.x, ly: e.y }; this.enemies.set(e.id, v);
      }
      const vx = (e.x - v.lx) / Math.max(dt, 1e-3), vy = (e.y - v.ly) / Math.max(dt, 1e-3); v.lx = e.x; v.ly = e.y;
      if (Math.hypot(vx, vy) > 5) v.yaw = angLerp(v.yaw, Math.atan2(vx, vy), Math.min(1, dt * 8));
      const hop = e.moving ? Math.abs(Math.sin(e.walkT * 9)) * 0.12 : Math.sin(t * 3 + e.x) * 0.02, sq = e.moving ? 1 + Math.sin(e.walkT * 18) * 0.06 : 1;
      v.group.position.set(e.x * U, hop + e.z * U, e.y * U); v.group.rotation.y = v.yaw; v.group.scale.set(1 / sq, sq, 1 / sq);
      const fl = e.flash > 0 ? 0.9 : e.kind === 'fluff' && (e.aggro > 0 || !e.passive) ? 0.12 : 0;
      for (const m of v.mats) m.emissive.setRGB(fl, fl * (e.flash > 0 ? 1 : 0.2), fl * (e.flash > 0 ? 1 : 0.1));
      if (e.lit && Math.random() < dt * 6) this.spark.spawn(e.x * U + (Math.random() - 0.5) * 0.4, 0.5 + Math.random() * 0.4, e.y * U, 0, 1, 0, 0.5, 0xffb84a, -0.5, true);
      const showHp = e.hp < e.maxHp && e.kind !== 'boss';
      if (showHp && !v.hp) { v.hp = this.ov.make('ehp'); v.hp.innerHTML = '<i></i>'; }
      if (!showHp && v.hp) { this.ov.free(v.hp); v.hp = undefined; }
      if (v.hp) { (v.hp.firstChild as HTMLElement).style.width = Math.max(0, e.hp / e.maxHp * 100) + '%'; v.hp.classList.toggle('lit', e.lit); this.place(v.hp, e.x, e.y, e.kind === 'horn' ? 1.15 : 1.0); }
      if (e.boss) { const B = e.boss; this.tele.visible = this.teleIn.visible = B.state === 'tele'; this.tele.position.set(B.tx * U, 0.06, B.ty * U); this.teleIn.position.set(B.tx * U, 0.05, B.ty * U); this.teleIn.scale.setScalar(Math.min(1, B.t / 0.95)); }
    }
    if (!w.enemies.some(e => e.boss)) this.tele.visible = this.teleIn.visible = false;
    for (const [id, v] of this.enemies) if (!seen.has(id)) { this.scene.remove(v.group); if (v.hp) this.ov.free(v.hp); this.enemies.delete(id); }
  }
  syncMisc(_dt: number) {
    const w = this.w, t = this.elapsed;
    const gs = new Set<number>();
    for (const g of w.ground) { gs.add(g.id); let v = this.ground.get(g.id); if (!v) { v = itemModel(g.type); v.rotation.y = g.id; this.scene.add(v); this.ground.set(g.id, v); } v.position.set(g.x * U, g.z * U + (g.z === 0 ? Math.abs(Math.sin(t * 3 + g.id)) * 0.03 : 0), g.y * U); }
    for (const [id, v] of this.ground) if (!gs.has(id)) { this.scene.remove(v); this.ground.delete(id); }
    const ss = new Set<number>();
    for (const s of w.shots) { ss.add(s.id); let v = this.shots.get(s.id); if (!v) { v = new THREE.Mesh(s.kind === 'cone' ? new THREE.ConeGeometry(0.08, 0.18, 6) : new THREE.IcosahedronGeometry(0.06), new THREE.MeshLambertMaterial({ color: s.kind === 'cone' ? 0x6a4a2a : 0x8a8478, flatShading: true })); this.scene.add(v); this.shots.set(s.id, v); } v.position.set(s.x * U, 0.9, s.y * U); v.rotation.set(t * 12, t * 9, 0); }
    for (const [id, v] of this.shots) if (!ss.has(id)) { this.scene.remove(v); this.shots.delete(id); }
    // dusk arrows on the town edge, pointing in from each spawn
    const show = w.clock.phase === 'dusk' || (w.clock.phase === 'night' && w.clock.queue.length > 0), R = (townHalf(w) + 2.5) + Math.sin(t * 5) * 0.2;
    this.arrows.forEach((a, i) => {
      const d = show ? w.clock.dirs[i] : undefined; if (!d) { a.visible = false; return; }
      const sp = SPAWNS[d], ang = Math.atan2(TC.y - sp.y, TC.x - sp.x);
      a.visible = true; a.position.set(TC.x * U - Math.cos(ang) * R, 0.06, TC.y * U - Math.sin(ang) * R); a.rotation.z = -ang; a.scale.setScalar(1.2);
    });
  }

  // ---------------------------------------------------------------- price plots, customers, the till
  syncTown(dt: number) {
    const w = this.w, t = this.elapsed, seen = new Set<number>();
    for (const o of w.offers) {
      seen.add(o.id); const fp = BUILD[o.type].fp || 1;
      let v = this.offers.get(o.id);
      if (!v) {
        const root = new THREE.Group();
        const plot = new THREE.Mesh(new THREE.PlaneGeometry(fp, fp).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: plotTexture(), transparent: true, depthWrite: false })); plot.position.y = 0.04;
        const fill = new THREE.Mesh(new THREE.PlaneGeometry(fp * 0.86, fp * 0.86).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xd9b25a, transparent: true, opacity: 0.35, depthWrite: false })); fill.position.y = 0.05;
        const ghost = buildingModel(o.type, 1, fp).group; ghost.traverse(m => { const mesh = m as THREE.Mesh; if (mesh.isMesh) { mesh.material = new THREE.MeshLambertMaterial({ color: 0xe8d8b0, transparent: true, opacity: 0.16, depthWrite: false }); mesh.castShadow = false; } });
        root.add(plot, fill, ghost); this.scene.add(root);
        const label = this.ov.make('plot'); v = { root, fill, label, sig: '' }; this.offers.set(o.id, v);
      }
      v.root.position.set(o.x * U, 0, o.y * U);
      const cost = offerCost(o), k = cost ? o.paid / cost : 1;
      v.fill.scale.set(1, 1, Math.max(0.001, k)); v.fill.position.z = (fp * 0.86) * (k - 1) / 2;
      (v.root.children[2] as THREE.Object3D).position.y = Math.sin(t * 2.5) * 0.04;
      const sig = BUILD[o.type].name + (cost - o.paid);
      if (sig !== v.sig) { v.sig = sig; v.label.innerHTML = `<small>${BUILD[o.type].name}</small><b><span class="coin"></span>${cost - o.paid}</b>`; }
      this.place(v.label, o.x, o.y, 0.35);
    }
    for (const [id, v] of this.offers) if (!seen.has(id)) { this.scene.remove(v.root); this.ov.free(v.label); this.offers.delete(id); }
    // customers
    const vs = new Set<number>();
    for (const c of w.visitors) {
      vs.add(c.id);
      let v = this.visitors.get(c.id);
      if (!v) { v = { rig: catRig('visitor' + c.look), yaw: 0, lx: c.x, ly: c.y, tool: '', stackSig: '', kind: 'visitor' }; this.scene.add(v.rig.root); this.visitors.set(c.id, v); }
      const vx = (c.x - v.lx) / Math.max(dt, 1e-3), vy = (c.y - v.ly) / Math.max(dt, 1e-3); v.lx = c.x; v.ly = c.y;
      this.animRig(v, { ...c, swing: 0 }, c.moving ? vx : 0, c.moving ? vy : 0, dt, 0.6);
      if (!c.moving && c.state === 'wait') v.yaw = angLerp(v.yaw, Math.PI, Math.min(1, dt * 6));
      const want = c.state === 'leave' ? null : `${c.want}|${c.n}|${c.patience < c.maxPatience * 0.3 ? 1 : 0}`;
      if (!want) this.bubble(v, null);
      else if (v.bubbleText !== want) { if (!v.bubble) v.bubble = this.ov.make('bub want'); v.bubbleText = want; v.bubble.innerHTML = `<img src="${this.thumb('i:' + c.want, 22)}" alt="">×${c.n}`; v.bubble.classList.toggle('low', c.patience < c.maxPatience * 0.3); }
      if (v.bubble) this.place(v.bubble, c.x, c.y, 1.3);
    }
    for (const [id, v] of this.visitors) if (!vs.has(id)) { this.scene.remove(v.rig.root); this.bubble(v, null); this.visitors.delete(id); }
    // coins on the counter
    const shop = w.buildings.shop, n = shop ? Math.min(36, Math.ceil(w.till / 3)) : 0;
    if (n !== this.tillN) { this.tillN = n; this.till.clear(); for (let i = 0; i < n; i++) { const m = itemModel('coin'); m.rotation.x = -Math.PI / 2; m.position.set((Math.floor(i / 12) - 1) * 0.24, 0.82 + (i % 12) * 0.035, 0); this.till.add(m); } }
    if (shop) this.till.position.set(shop.x * U + 0.55, 0, shop.y * U + 0.45);
  }

  // ---------------------------------------------------------------- build mode
  updateBuild() {
    const st = this.getBuild(), w = this.w;
    this.gridMesh.visible = this.ringMesh.visible = this.selLine.visible = this.borderLine.visible = this.nearLine.visible = false;
    if (!st.active) { this.ghostGroup.visible = false; return; }
    const T = townHalf(w), A = areaHalf(w);
    this.borderLine.visible = true; this.borderLine.position.set(TC.x * U, 0.05, TC.y * U); this.borderLine.scale.set(T * 2, 1, T * 2);
    this.nearLine.visible = true; this.nearLine.position.set(TC.x * U, 0.05, TC.y * U); this.nearLine.scale.set(A * 2, 1, A * 2);
    if (st.selected && w.buildings[st.selected]) { const b = w.buildings[st.selected], f = BUILD[b.type].fp || 1; this.selLine.visible = true; this.selLine.position.set(b.x * U, 0.07, b.y * U); this.selLine.scale.set(f + 0.15, 1, f + 0.15); }
    const g = st.ghost;
    // cell highlight: red = taken, amber = keep free (pads, roads), green = where the chosen building fits
    const sig = JSON.stringify([g?.type, g?.moving, st.spots?.length, Object.keys(w.buildings).length, T]);
    this.gridMesh.visible = true;
    if (sig !== this.gridSig) {
      this.gridSig = sig;
      const occ = occupancy(w, g?.moving), o = new THREE.Object3D(), col = new THREE.Color(); let n = 0;
      const fits = new Set<string>();
      if (g && st.spots) for (const s of st.spots) for (const [i, j] of footprint(g.type, s.x, s.y)) fits.add(i + ',' + j);
      const lim = g && BUILD[g.type].zone === 'near' ? A : T;
      for (let i = -lim; i < lim; i++) for (let j = -lim; j < lim; j++) {
        const u = occ.get(i * 4096 + j), road = i === -1 || i === 0 || j === -1 || j === 0;
        let c = -1;
        if (u?.kind === 'fp') c = u.walk ? 0x8a6a3a : 0x9a2a22; else if (u?.kind === 'pad') c = 0xd9a03a; else if (fits.has(i + ',' + j)) c = 0x7aa05a; else if (road) c = 0x3a3020;
        if (c < 0) continue;
        o.position.set(TC.x * U + i + 0.5, 0, TC.y * U + j + 0.5); o.updateMatrix(); this.gridMesh.setMatrixAt(n, o.matrix); this.gridMesh.setColorAt(n, col.set(c)); n++;
      }
      this.gridMesh.count = n; this.gridMesh.instanceMatrix.needsUpdate = true; if (this.gridMesh.instanceColor) this.gridMesh.instanceColor.needsUpdate = true;
    }
    if (!g) { this.ghostGroup.visible = false; return; }
    this.ghostGroup.visible = true;
    const pts = g.line && g.line.length ? g.line : [{ x: g.x, y: g.y, ok: g.ok }];
    const gsig = g.type + '|' + (g.moving || '') + '|' + pts.map(p => p.x + ',' + p.y + (p.ok ? 1 : 0)).join(';');
    if (gsig !== this.ghostSig) {
      this.ghostSig = gsig; this.ghostGroup.clear();
      const src = g.moving ? w.buildings[g.moving] : null;
      for (const p of pts) {
        const m = buildingModel(g.type, src?.level || 1, BUILD[g.type].fp, g.type === 'palisade' && pts.length > 1 ? 0 : 0).group;
        m.traverse(o => { const mesh = o as THREE.Mesh; if (mesh.isMesh) { mesh.material = p.ok ? this.ghostOk : this.ghostBad; mesh.castShadow = false; } });
        m.position.set(p.x * U, 0.02, p.y * U); this.ghostGroup.add(m);
        const f = BUILD[g.type].fp || 1;
        const sq = new THREE.Mesh(new THREE.PlaneGeometry(f, f).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: p.ok ? 0x7aa05a : 0xc0432f, transparent: true, opacity: 0.45, depthWrite: false }));
        sq.position.set(p.x * U, 0.06, p.y * U); this.ghostGroup.add(sq);
        for (const [i, j] of padRow(g.type, p.x, p.y)) { const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xd9a03a, transparent: true, opacity: 0.4, depthWrite: false })); pm.position.set(TC.x * U + i + 0.5, 0.06, TC.y * U + j + 0.5); this.ghostGroup.add(pm); }
      }
    }
    this.ghostGroup.children.forEach((c, i) => { if (i % 2 === 0 && c.type === 'Group') c.position.y = 0.02 + Math.sin(this.elapsed * 4) * 0.03; });
    const def = BUILD[g.type], rad = def.fuel ? def.fuel.radius : g.type === 'tower' ? 190 : 0;
    if (rad) { this.ringMesh.visible = true; this.ringMesh.position.set(g.x * U, 0.04, g.y * U); this.ringMesh.scale.setScalar(rad * U); }
  }

  // ---------------------------------------------------------------- events -> effects and sound
  handleEvent(e: GameEvent) {
    const w = this.w, near = (x: number, y: number) => Math.abs(x * U - this.target.x) < 14 && Math.abs(y * U - this.target.z) < 11;
    const burst = (x: number, y: number, z: number, n: number, color: number, spd: number, life: number, grav: number, sys: Particles = this.chip, drag = false) => {
      n = Math.ceil(n * (REDUCED ? 0.3 : 0.7));
      for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = (0.3 + Math.random() * 0.7) * spd; sys.spawn(x * U, z * U + 0.2, y * U, Math.cos(a) * s, 1 + Math.random() * 2.5, Math.sin(a) * s, life * (0.7 + Math.random() * 0.5), color, grav, drag); }
    };
    switch (e.t) {
      case 'fly': {
        const owner = e.item === 'coin' ? undefined : e.to === 'hero' ? 'hero' : typeof e.to === 'number' ? 'c' + e.to : undefined;
        if (owner) this.pending[owner] = (this.pending[owner] || 0) + 1;
        const to = e.to === 'hero' ? (e.item === 'coin' ? () => ({ x: w.hero.x, y: w.hero.y, z: 60 }) : () => this.stackTop('hero')) : typeof e.to === 'number' ? (() => { const id = e.to as number; return () => this.stackTop('c' + id) ?? { x: e.fx, y: e.fy, z: 0 }; })() : (() => { const p = e.to as { x: number; y: number }; return () => ({ x: p.x, y: p.y, z: 10 }); })();
        const obj = itemModel(e.item === 'coin' ? 'coin' : e.item); this.scene.add(obj);
        this.flyers.push({ obj, fx: e.fx, fy: e.fy, fz: e.fz, to: to as () => { x: number; y: number; z: number }, t: 0, dur: 0.3 + Math.random() * 0.06, h: 50, owner });
        break;
      }
      case 'chop': case 'mine':
        if (!near(e.x, e.y)) break;
        if (e.t === 'mine') { burst(e.x, e.y, 20, 6, 0x9a968c, 1.6, 0.6, 9); burst(e.x, e.y, 24, 2, 0xfff0c0, 1.2, 0.3, 2, this.spark); }
        else { burst(e.x, e.y, 14, 5, 0xa8784a, 1.5, 0.5, 9); if (e.kind !== 'repair') burst(e.x, e.y, 60, 3, 0x4a6a3a, 0.8, 1.2, 1.5, this.chip, true); }
        if (e.kind === 'hero') sfx(e.t === 'mine' ? 'hit' : 'chop'); else if (e.kind === 'repair') sfx('drop');
        break;
      case 'fell': {
        if (!near(e.x, e.y)) break;
        if (e.kind === 'oak' || e.kind === 'pine' || e.kind === 'lav') { const obj = nodeModel(e.kind, true); obj.position.set(e.x * U, 0, e.y * U); this.scene.add(obj); this.falls.push({ obj, t: 0, dir: w.hero.x < e.x ? 1 : -1 }); }
        else burst(e.x, e.y, 12, 10, e.kind === 'rock' ? 0x8a867c : 0x4a6a3a, 1.8, 0.7, 6);
        if (dist(w.hero.x, w.hero.y, e.x, e.y) < 120) { sfx('fall'); this.shake = Math.max(this.shake, 0.06); }
        break;
      }
      case 'hit': burst(e.x, e.y, 20, 5, 0x5a5060, 2, 0.5, 4, this.chip, true); this.floatText(e.x, e.y, 30, '-' + Math.round((e.v || 0) * 10) / 10, 'dmg'); sfx('hit'); break;
      case 'poof': burst(e.x, e.y, 10, e.kind === 'boss' ? 50 : 14, e.kind === 'light' ? 0xd0702a : 0x4a4250, e.kind === 'boss' ? 4 : 2.4, 0.9, 1, this.chip, true); burst(e.x, e.y, 10, 6, 0xd9b25a, 2, 0.6, 2, this.spark); sfx('poof'); if (e.kind === 'boss') this.shake = 0.35; break;
      case 'placed': burst(e.x, e.y, 2, 10, 0x9a8a70, 1.5, 0.6, 0.5, this.chip, true); sfx('drop'); break;
      case 'build': case 'upgrade':
        burst(e.x, e.y, 30, e.t === 'build' ? 22 : 12, 0xd9b25a, 2.4, 0.9, 3, this.spark); burst(e.x, e.y, 4, 8, 0x8a8272, 1.4, 0.9, 0.3, this.chip, true);
        sfx(e.t === 'build' ? 'build' : 'upg'); this.shake = Math.max(this.shake, e.t === 'build' ? 0.12 : 0.06); break;
      case 'hurt': burst(e.x, e.y, 30, 8, 0x8a2a22, 2, 0.5, 6); sfx('hurt'); if (e.kind !== 'unit') this.shake = Math.max(this.shake, 0.14); break;
      case 'slam': burst(e.x, e.y, 4, 30, 0x8a80a0, 4, 0.8, 0.2, this.chip, true); sfx('slam'); this.shake = 0.35; break;
      case 'coin': this.floatText(e.x, e.y, 60, '+' + e.v, 'coin'); sfx('coin'); break;
      case 'pick': sfx('pick'); break;
      case 'drop': sfx('drop'); break;
      case 'pay': sfx('pay'); break;
      case 'shot': if (near(e.x, e.y)) sfx('shot'); break;
      case 'wallHit': if (near(e.x, e.y)) { burst(e.x, e.y, 30, 4, 0xa8784a, 1.6, 0.5, 8); sfx('wall'); } break;
      case 'lightOut': for (let i = 0; i < 3; i++) this.smoke.spawn(e.x * U + (Math.random() - 0.5) * 0.3, 0.5, e.y * U, 0.1, 0.4, 0, 2.4, 0x6a6670, 0, false, 0.5); break;
      case 'text': this.floatText(e.x, e.y, 40, e.s, 'plain', e.color); break;
      case 'bubble': {
        const who = e.who, at = who === 'owl' ? (w.buildings.shop ? { x: w.buildings.shop.x, y: w.buildings.shop.y, z: 120 } : null) : (() => { const c = w.cats.find(x => x.id === who) || w.units.find(x => x.id === who) || w.visitors.find(x => x.id === who); return c ? { x: c.x, y: c.y, z: 62 } : null; })();
        if (at) { const el = this.ov.make('bub'); el.textContent = e.s; this.texts.push({ el, x: at.x, y: at.y, z: at.z, vz: 0, life: 2.2 }); }
        if (who !== 'owl') sfx('meow');
        break;
      }
      case 'bossIn': this.shake = 0.25; break;
      case 'made': {
        // sawdust from the blade, the product hops onto the output pile
        const b = Object.values(w.buildings).find(x => x.x === e.x && x.y === e.y); if (!b || !near(e.x, e.y)) break;
        burst(e.x, e.y, 40, 6, b.type === 'sawmill' ? 0xc8a070 : 0xe8d8b0, 1.4, 0.7, 5);
        const fp = BUILD[b.type].fp || 1, obj = itemModel(e.kind as ItemId); this.scene.add(obj);
        this.flyers.push({ obj, fx: e.x + 10, fy: e.y, fz: 40, to: () => ({ x: e.x + (fp / 2 + 0.3) * CELL, y: e.y + 10, z: 10 }), t: 0, dur: 0.45, h: 40 });
        break;
      }
      case 'served': this.floatText(e.x, e.y, 110, '+' + e.v, 'coin'); burst(e.x, e.y, 60, 10, 0xd9b25a, 1.6, 0.8, 3, this.spark); sfx('coin'); break;
      case 'unlock': burst(e.x, e.y, 10, 26, 0xd9b25a, 3, 1, 3, this.spark); this.shake = Math.max(this.shake, 0.12); sfx('build'); break;
    }
  }
  private stackTop(owner: string): { x: number; y: number; z: number } {
    const w = this.w;
    if (owner === 'hero') { let h = 0; for (const it of w.hero.stack) h += ITEM_H[it]; return { x: w.hero.x, y: w.hero.y, z: (0.95 + h) * CELL }; }
    const c = w.cats.find(x => 'c' + x.id === owner); if (!c) return { x: 0, y: 0, z: 0 };
    let h = 0; for (const it of c.stack) h += ITEM_H[it]; return { x: c.x, y: c.y, z: (0.52 + h) * CELL };
  }
  private floatText(x: number, y: number, z: number, s: string, cls: string, color?: string) {
    const el = this.ov.make('ft ' + cls); el.textContent = s; if (color) el.style.color = color;
    this.texts.push({ el, x, y, z, vz: 45, life: 1.1 });
  }
  updateFx(dt: number) {
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i]; f.t += dt / f.dur;
      const to = f.to(), k = Math.min(1, f.t), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const x = f.fx + (to.x - f.fx) * e, y = f.fy + (to.y - f.fy) * e, z = f.fz + (to.z - f.fz) * e + Math.sin(k * Math.PI) * f.h;
      f.obj.position.set(x * U, z * U, y * U); f.obj.rotation.set(k * 6, k * 3, 0);
      if (f.t >= 1) { this.scene.remove(f.obj); if (f.owner) this.pending[f.owner] = Math.max(0, (this.pending[f.owner] || 0) - 1); this.flyers.splice(i, 1); }
    }
    this.spark.update(dt); this.chip.update(dt); this.smoke.update(dt);
    for (let i = this.falls.length - 1; i >= 0; i--) {
      const f = this.falls[i]; f.t += dt; const k = Math.min(1, f.t / 0.6);
      f.obj.rotation.z = -f.dir * k * k * 1.45; f.obj.position.y = -Math.max(0, f.t - 0.6) * 0.8;
      if (f.t > 0.58 && f.t - dt <= 0.58) for (let j = 0; j < 10; j++) this.chip.spawn(f.obj.position.x + f.dir * 1.2, 0.2, f.obj.position.z, (Math.random() - 0.5) * 2, 0.8, (Math.random() - 0.5) * 2, 0.7, 0x8a7a60, 1, true);
      if (f.t > 1.1) { this.scene.remove(f.obj); this.falls.splice(i, 1); }
    }
    for (let i = this.texts.length - 1; i >= 0; i--) { const t = this.texts[i]; t.life -= dt; if (t.life <= 0) { this.ov.free(t.el); this.texts.splice(i, 1); continue; } t.z += t.vz * dt; t.el.style.opacity = String(Math.min(1, t.life * 3)); }
  }
  ambient(dt: number) {
    const w = this.w, dark = w.clock.dark, tx = this.target.x, tz = this.target.z;
    if (dark > 0.25 && Math.random() < dt * 6) this.spark.spawn(tx + (Math.random() - 0.5) * 22, 0.3 + Math.random() * 1.5, tz + (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.3, 3, 0xd9c060, 0, true, 0.8);
    if (dark < 0.4 && Math.random() < dt * 2) this.chip.spawn(tx + (Math.random() - 0.5) * 22, 2.5, tz + (Math.random() - 0.5) * 16, 0.4, -0.3, 0.2, 4, 0x4a5a34, 0.05, true);
    if (Math.random() < dt * 2.5) { const x = tx + (Math.random() - 0.5) * 24; if (x / U > WILDS.x || Math.random() < 0.2) this.smoke.spawn(x, 0.3, tz + (Math.random() - 0.5) * 16, 0.15, 0.05, 0, 4, 0x7a7a80, 0, false, 0.18); }
  }

  // ---------------------------------------------------------------- light and camera
  updateLight() {
    const w = this.w, dark = w.clock.dark, t = this.elapsed;
    const dusk = w.clock.phase === 'dusk' ? Math.sin(Math.min(1, w.clock.t / 25) * Math.PI) : 0;
    this.hemi.intensity = lerp(1.05, 0.55, dark); this.hemi.color.setRGB(lerp(0.78, 0.36, dark) + dusk * 0.12, lerp(0.76, 0.4, dark), lerp(0.7, 0.55, dark));
    this.sun.intensity = lerp(1.7, 0.75, dark);
    this.sun.color.setRGB(lerp(0.9, 0.46, dark) + dusk * 0.35, lerp(0.86, 0.56, dark) - dusk * 0.1, lerp(0.78, 0.86, dark) - dusk * 0.2);
    this.sun.position.set(this.target.x - 8, 13, this.target.z + 11); this.sun.target.position.copy(this.target);
    const bg = new THREE.Color().setRGB(lerp(0.12, 0.05, dark) + dusk * 0.06, lerp(0.12, 0.055, dark), lerp(0.11, 0.08, dark));
    (this.scene.background as THREE.Color).copy(bg); (this.scene.fog as THREE.Fog).color.copy(bg);
    MAT.win.color.setScalar(lerp(0.45, 1.25, Math.min(1, dark * 1.4)));
    this.renderer.toneMappingExposure = lerp(1.15, 1.3, dark);
    // fire lights: the eight lit sources nearest the camera
    const lit = Object.values(w.buildings).filter(b => lightRadius(b) > 0).sort((a, b) => Math.hypot(a.x * U - this.target.x, a.y * U - this.target.z) - Math.hypot(b.x * U - this.target.x, b.y * U - this.target.z));
    this.fires.forEach((l, i) => {
      const b = lit[i]; if (!b) { l.intensity = 0; return; }
      const lan = b.type === 'lantern', r = lightRadius(b) * U;
      l.color.set(lan ? 0xffc27a : 0xff9446); l.distance = r * 1.35; l.position.set(b.x * U + (lan ? 0.4 : 0), lan ? 1.6 : 0.9, b.y * U);
      l.intensity = (0.6 + dark * 6) * (b.type === 'heart' ? 1.4 : 1) * (0.92 + Math.sin(t * 9 + i * 2) * 0.05 + Math.sin(t * 23 + i) * 0.03);
    });
    const h = this.w.hero, lp = this.hero.rig.lantern!; lp.updateWorldMatrix(true, false);
    this.heroLight.position.setFromMatrixPosition(lp.matrixWorld); this.heroLight.position.y += 0.2; this.heroLight.intensity = dark * 3.4 * (h.dead > 0 ? 0 : 1);
  }
  updateCamera(dt: number) {
    const h = this.w.hero, aspect = innerWidth / innerHeight;
    this.shake = REDUCED ? 0 : Math.max(0, Math.min(this.shake, 0.35) - dt * 0.9);
    if (this.camFollow) { const tx = h.x * U + h.vx * U * 0.25, tz = h.y * U + h.vy * U * 0.2; this.target.x += (tx - this.target.x) * Math.min(1, dt * 5); this.target.z += (tz - this.target.z) * Math.min(1, dt * 5); }
    // close like the ads: the hero is about a seventh of the screen; pinch or wheel to zoom out and plan
    const want = aspect < 1 ? 7.5 : 12.5, fovH = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(15)) * aspect);
    const d = Math.max(12, want / 2 / Math.tan(fovH / 2)) * this.zoom * (this.getBuild().active ? 1.5 : 1);
    const dir = new THREE.Vector3(0, 0.62, 0.78).normalize();
    this.camera.position.copy(this.target).addScaledVector(dir, d);
    this.camera.position.x += (Math.random() - 0.5) * this.shake; this.camera.position.y += (Math.random() - 0.5) * this.shake;
    this.camera.lookAt(this.target.x, this.target.y + 0.4, this.target.z);
    const fog = this.scene.fog as THREE.Fog; fog.near = d * 0.95; fog.far = d * 2.3;
  }

  // ---------------------------------------------------------------- DOM labels
  private v3 = new THREE.Vector3();
  place(el: HTMLElement, x: number, y: number, height: number, zpx = 0) {
    this.v3.set(x * U, height + zpx * U, y * U).project(this.camera);
    if (this.v3.z > 1) { el.style.display = 'none'; return; }
    el.style.display = ''; el.style.transform = `translate(${((this.v3.x + 1) / 2 * innerWidth).toFixed(1)}px, ${((1 - this.v3.y) / 2 * innerHeight).toFixed(1)}px) translate(-50%, -100%)`;
  }
  updateLabels(_dt: number) {
    const w = this.w;
    for (const b of Object.values(w.buildings)) {
      const v = this.buildings.get(b.id); if (!v) continue; const def = BUILD[b.type];
      let s = '';
      if (b.site && b.type !== 'palisade') s = 'будова · ' + Object.entries(b.site).map(([k, n]) => `${n} ${ITEMS[k as ItemId].name.toLowerCase()}`).join(', ');
      else if (def.fuel && b.fuel < def.fuel.cap * 0.25) s = b.fuel <= 0 ? 'згасло' : 'мало палива';
      else if (b.type === 'storage') s = `${invTotal(b.store)}/${def.levels![b.level - 1].stats.cap}`;
      else if (def.levels && b.level > 1 && b.type !== 'hall' && b.type !== 'palisade') s = '★'.repeat(b.level);
      if (s && !v.label) v.label = this.ov.make('blbl');
      if (!s && v.label) { this.ov.free(v.label); v.label = undefined; v.labelText = undefined; }
      if (v.label) { if (v.labelText !== s) { v.label.textContent = s; v.labelText = s; v.label.classList.toggle('warn', !!def.fuel && !b.site); } this.place(v.label, b.x, b.y, v.top + 0.25); }
      const bars = !b.site && (b.type === 'palisade' || b.type === 'tower' || !!def.fuel) && (b.hp < b.maxHp || (!!def.fuel && w.clock.phase !== 'day'));
      if (bars && !v.bars) { v.bars = this.ov.make('bbar'); v.bars.innerHTML = '<i class="hp"><b></b></i>' + (def.fuel ? '<i class="fu"><b></b></i>' : ''); }
      if (!bars && v.bars) { this.ov.free(v.bars); v.bars = undefined; }
      if (v.bars) { (v.bars.querySelector('.hp b') as HTMLElement).style.width = Math.max(0, b.hp / b.maxHp * 100) + '%'; const fu = v.bars.querySelector('.fu b') as HTMLElement | null; if (fu) fu.style.width = Math.max(0, b.fuel / def.fuel!.cap * 100) + '%'; this.place(v.bars, b.x, b.y, v.top + (v.label ? 0.75 : 0.25)); }
    }
    for (const t of this.texts) this.place(t.el, t.x, t.y, 0, t.z);
  }

  // ---------------------------------------------------------------- HUD helpers
  screenToWorld(cx: number, cy: number) {
    const ndc = new THREE.Vector2(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1), ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.camera);
    const p = new THREE.Vector3(); ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p);
    return { x: p.x / U, y: p.z / U };
  }
  panBy(dx: number, dy: number) {
    this.camFollow = false;
    const a = this.screenToWorld(innerWidth / 2, innerHeight / 2), b = this.screenToWorld(innerWidth / 2 + dx, innerHeight / 2 + dy);
    this.target.x -= (b.x - a.x) * U; this.target.z -= (b.y - a.y) * U;
    this.target.x = Math.max(4, Math.min(W * U - 4, this.target.x)); this.target.z = Math.max(4, Math.min(H * U - 4, this.target.z));
  }
  focus() { this.camFollow = true; }
  zoomBy(f: number) { this.zoom = Math.max(0.65, Math.min(2.6, this.zoom * f)); }

  // ---------------------------------------------------------------- icons for the HTML UI
  private thumbR: THREE.WebGLRenderer | null = null; private thumbS: THREE.Scene | null = null; private thumbs = new Map<string, string>();
  thumb(key: string, maxH = 64): string {
    const ck = key + '@' + maxH, hit = this.thumbs.get(ck); if (hit !== undefined) return hit;
    let obj: THREE.Object3D | null = null;
    const [kind, id] = key.split(':');
    if (kind === 'b') obj = buildingModel(id as BuildingType, 1, BUILD[id as BuildingType]?.fp || 1, id === 'palisade' ? 1 : 0).group;
    else if (kind === 'i') obj = itemModel(id as ItemId | 'coin');
    else if (kind === 'u') obj = catRig(id).root;
    else if (kind === 'hero') obj = heroRig().root;
    else if (kind === 'w') obj = toolModel(id);
    if (!obj) { this.thumbs.set(ck, ''); return ''; }
    const size = Math.max(32, Math.min(160, maxH * 2));
    if (!this.thumbR) {
      this.thumbR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); this.thumbR.outputColorSpace = THREE.SRGBColorSpace;
      this.thumbR.toneMapping = THREE.ACESFilmicToneMapping; this.thumbR.toneMappingExposure = 1.25;
      this.thumbS = new THREE.Scene(); this.thumbS.add(new THREE.HemisphereLight(0xe8e0d0, 0x3a3028, 1.3)); const d = new THREE.DirectionalLight(0xfff0dc, 1.6); d.position.set(-2, 4, 3); this.thumbS.add(d);
    }
    this.thumbR.setSize(size, size, false);
    const box = new THREE.Box3().setFromObject(obj), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3()), r = Math.max(s.x, s.y, s.z) * 0.62 + 0.01;
    const cam = new THREE.PerspectiveCamera(28, 1, 0.01, 100); const dir = new THREE.Vector3(0.45, 0.55, 1).normalize();
    cam.position.copy(c).addScaledVector(dir, r / Math.sin(THREE.MathUtils.degToRad(14))); cam.lookAt(c);
    this.thumbS!.add(obj); this.thumbR.render(this.thumbS!, cam); this.thumbS!.remove(obj);
    const url = this.thumbR.domElement.toDataURL(); this.thumbs.set(ck, url); return url;
  }
}
export { C };
