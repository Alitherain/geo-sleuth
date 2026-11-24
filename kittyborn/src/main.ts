import './assets/fonts.css';
import './style.css';
import { View } from './render3d/View';
import { Hud } from './ui/hud';
import { createWorld, type World } from './sim/world';
import { step } from './sim/sim';
import { loadSettings, loadWorld, requestPersist, saveWorld } from './platform/storage';
import { OldSaveError } from './sim/save';
import { audio, audioInit, musicTick, setMusic, setSound, sfx } from './platform/audio';

let oldSave = false;
let world: World = (() => { try { return loadWorld() ?? createWorld(); } catch (e) { oldSave = e instanceof OldSaveError; return createWorld(); } })();
const settings = loadSettings(); setSound(settings.sound); setMusic(settings.music);

let view: View | null = null;
const hud = new Hud(() => world, w => { world = w; view?.setWorld(w); saveWorld(w); });

function boot() {
  view = new View(document.getElementById('game')!, () => world, () => hud.build);
  hud.scene = view;
  let last = performance.now(), acc = 0;
  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (hud.started && !hud.paused) {
      acc += dt; let n = 0;
      while (acc >= 1 / 60 && n < 5) { step(world, hud.input, 1 / 60); acc -= 1 / 60; n++; }
      if (n === 5) acc = 0;
      for (const e of world.events) {
        view!.handleEvent(e); hud.event(e);
        if (e.t === 'nightWin') { sfx('win'); saveWorld(world); }
        if (e.t === 'nightLose') sfx('lose');
        if (e.t === 'build') saveWorld(world);
      }
      world.events.length = 0;
    }
    view!.frame(dt);
    hud.frame(dt); musicTick(world.clock.phase !== 'day');
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
try { boot(); } catch (e) { document.getElementById('title')!.insertAdjacentHTML('beforeend', `<p style="position:fixed;bottom:12px;left:0;right:0;text-align:center;color:#c07a5a">Не вдалося запустити 3D: ${(e as Error).message}</p>`); }

if (world.time > 1) (document.getElementById('bStart') as HTMLButtonElement).textContent = 'Продовжити полювання';
document.getElementById('bStart')!.onclick = () => {
  audioInit();
  document.getElementById('title')!.hidden = true;
  hud.started = true;
  if (oldSave) hud.toast('Новий світ', 'Містечко тепер на сітці з дорогами: нічого не замурується, а частокіл тягнеться лінією.');
  requestPersist();
  try { const el = document.documentElement; if (el.requestFullscreen && matchMedia('(pointer:coarse)').matches) el.requestFullscreen().catch(() => {}); } catch { /* ignore */ }
  try { (navigator as any).wakeLock?.request('screen').catch(() => {}); } catch { /* ignore */ }
};
setInterval(() => { if (hud.started) saveWorld(world); }, 5000);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveWorld(world); });
addEventListener('pagehide', () => saveWorld(world));
(window as any).__kb = { get world() { return world; }, hud, audio, get view() { return view; } };
(window as any).__kb.step = (seconds: number, input?: { x: number; y: number }) => { for (let i = 0; i < seconds * 60; i++) { step(world, input || hud.input, 1 / 60); for (const e of world.events) hud.event(e); world.events.length = 0; } };
import * as economy from './sim/economy';
(window as any).__kb.api = economy;
