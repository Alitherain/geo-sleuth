// Generated 3D assets (Higgsfield / Meshy GLB files in src/assets/models). Loaded once at boot; until a model is ready
// (or if it is missing) the view keeps using the procedural models from models.ts.
// File names: <key>.glb for the mesh, <key>@<clip>.glb for extra animation clips on the same skeleton.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

const files = import.meta.glob('../assets/models/*.glb', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
interface Asset { scene: THREE.Group; clips: Map<string, THREE.AnimationClip>; height: number }
const assets = new Map<string, Asset>();
let started = false;

/** Height each kind should have in scene units (1 unit = 1 grid cell). */
export const TARGET_H: Record<string, number> = { hero: 1.5, cat: 1.0, guard: 1.05, owl: 1.0, fluff: 0.8, horn: 1.0, shade: 1.3, boss: 2.6 };
/** Footprint width for buildings, in cells (the model is scaled to fit). */
export const TARGET_W: Record<string, number> = {};

function stripRootMotion(clip: THREE.AnimationClip) {
  // keep the bob, drop the travel: walking is driven by the simulation
  for (const t of clip.tracks) {
    if (!t.name.endsWith('.position')) continue;
    const bone = t.name.split('.')[0].toLowerCase();
    if (!/hip|pelvis|root|armature/.test(bone)) continue;
    const v = t.values; const x0 = v[0], z0 = v[2];
    for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
  }
  return clip;
}
export function loadAssets(onEach?: (key: string) => void) {
  if (started) return; started = true;
  const loader = new GLTFLoader();
  const mains = Object.entries(files).filter(([p]) => !p.includes('@'));
  const extra = Object.entries(files).filter(([p]) => p.includes('@'));
  const keyOf = (p: string) => p.split('/').pop()!.replace('.glb', '');
  for (const [path, url] of mains) {
    const key = keyOf(path);
    loader.load(url, g => {
      const scene = g.scene as THREE.Group;
      scene.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; const mat = m.material as THREE.MeshStandardMaterial; if (mat && 'roughness' in mat) { mat.roughness = Math.max(0.7, mat.roughness ?? 1); mat.metalness = Math.min(0.2, mat.metalness ?? 0); } } });
      const box = new THREE.Box3().setFromObject(scene), h = box.max.y - box.min.y || 1;
      const clips = new Map<string, THREE.AnimationClip>();
      for (const c of g.animations) clips.set(c.name.toLowerCase().includes('walk') ? 'walk' : c.name.toLowerCase(), stripRootMotion(c));
      if (g.animations[0] && !clips.has('walk')) clips.set('walk', g.animations[0]);
      assets.set(key, { scene, clips, height: h });
      for (const [p2, u2] of extra) {
        const [base, clip] = keyOf(p2).split('@'); if (base !== key) continue;
        loader.load(u2, g2 => { const c = g2.animations[0]; if (c) { c.name = clip; assets.get(key)!.clips.set(clip, stripRootMotion(c)); } });
      }
      onEach?.(key);
    }, undefined, () => { /* missing or broken file: keep the procedural model */ });
  }
}
export const hasAsset = (key: string) => assets.has(key);

/** An animated instance: call update(dt) every frame and play('walk' | 'idle' | 'chop' | ...). */
export class Actor {
  root = new THREE.Group(); mixer: THREE.AnimationMixer | null = null; actions = new Map<string, THREE.AnimationAction>(); current = '';
  constructor(public key: string, height: number) {
    const a = assets.get(key)!;
    const inst = SkeletonUtils.clone(a.scene) as THREE.Group;
    const s = height / a.height; inst.scale.setScalar(s);
    const box = new THREE.Box3().setFromObject(inst); inst.position.y -= box.min.y;
    this.root.add(inst);
    if (a.clips.size) { this.mixer = new THREE.AnimationMixer(inst); for (const [n, c] of a.clips) this.actions.set(n, this.mixer.clipAction(c)); }
  }
  has(name: string) { return this.actions.has(name); }
  play(name: string, fade = 0.18, once = false) {
    if (!this.mixer || name === this.current || !this.actions.has(name)) return;
    const next = this.actions.get(name)!, prev = this.actions.get(this.current);
    next.reset(); next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); next.clampWhenFinished = once; next.play();
    if (prev) prev.crossFadeTo(next, fade, false);
    this.current = name;
  }
  speed(k: number) { const a = this.actions.get(this.current); if (a) a.timeScale = k; }
  update(dt: number) { this.mixer?.update(dt); }
}
/** A static instance (buildings, props): shares geometry and materials. */
export function staticModel(key: string, width: number): THREE.Group | null {
  const a = assets.get(key); if (!a) return null;
  const inst = a.scene.clone(true), box = new THREE.Box3().setFromObject(inst), size = box.getSize(new THREE.Vector3());
  const s = width / Math.max(size.x, size.z); inst.scale.setScalar(s);
  const b2 = new THREE.Box3().setFromObject(inst), c = b2.getCenter(new THREE.Vector3());
  inst.position.set(-c.x, -b2.min.y, -c.z);
  const g = new THREE.Group(); g.add(inst); return g;
}
