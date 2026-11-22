import './assets/fonts.css';
import './style.css';
import Phaser from 'phaser';
import { WorldScene } from './render/WorldScene';
import { Hud } from './ui/hud';
import { createWorld, type World } from './sim/world';
import { loadSettings, loadWorld, requestPersist, saveWorld } from './platform/storage';
import { audio, audioInit, musicTick, setMusic, setSound, sfx } from './platform/audio';

let world: World = loadWorld() ?? createWorld();
const settings = loadSettings(); setSound(settings.sound); setMusic(settings.music);

let scene: WorldScene | null = null;
const hud = new Hud(() => world, w => { world = w; scene?.setWorld(w); saveWorld(w); });

const DPR = Math.min(2, window.devicePixelRatio || 1);
const size = () => ({ w: Math.floor(innerWidth * DPR), h: Math.floor(innerHeight * DPR) });

async function boot() {
  try { await Promise.race([document.fonts.load('800 16px Nunito'), new Promise(r => setTimeout(r, 1500))]); } catch { /* fallback fonts */ }
  const s = size();
  const game = new Phaser.Game({
    type: Phaser.AUTO, parent: 'game', backgroundColor: '#1d1640',
    scale: { mode: Phaser.Scale.NONE, width: s.w, height: s.h, zoom: 1 / DPR },
    render: { antialias: true, roundPixels: false },
    banner: false,
  });
  game.scene.add('world', WorldScene, true, {
    world: () => world,
    input: hud.input,
    running: () => hud.started && !hud.paused,
    onEvent: (e: any) => {
      hud.event(e);
      if (e.t === 'nightStart') sfx('bell');
      if (e.t === 'nightWin') { sfx('win'); saveWorld(world); }
      if (e.t === 'nightLose') sfx('lose');
      if (e.t === 'build') saveWorld(world);
    },
    onFrame: (dt: number) => { hud.frame(dt); musicTick(world.night.phase === 'night'); },
    guide: () => hud.guideTarget,
  });
  game.events.once('ready', () => { scene = game.scene.getScene('world') as WorldScene; });
  setTimeout(() => { scene = game.scene.getScene('world') as WorldScene; }, 500);
  addEventListener('resize', () => { const n = size(); game.scale.resize(n.w, n.h); game.scale.setZoom(1 / DPR); });
}
boot();

if (world.time > 1) (document.getElementById('bStart') as HTMLButtonElement).textContent = 'Продовжити полювання';
document.getElementById('bStart')!.onclick = () => {
  audioInit();
  document.getElementById('title')!.hidden = true;
  hud.started = true;
  requestPersist();
  try { const el = document.documentElement; if (el.requestFullscreen && matchMedia('(pointer:coarse)').matches) el.requestFullscreen().catch(() => {}); } catch { /* ignore */ }
  try { (navigator as any).wakeLock?.request('screen').catch(() => {}); } catch { /* ignore */ }
};
setInterval(() => { if (hud.started) saveWorld(world); }, 5000);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveWorld(world); });
addEventListener('pagehide', () => saveWorld(world));
(window as any).__kb = { get world() { return world; }, hud, audio };
import { step } from './sim/sim';
(window as any).__kb.step = (seconds: number, input?: { x: number; y: number }) => { for (let i = 0; i < seconds * 60; i++) { step(world, input || hud.input, 1 / 60); for (const e of world.events) hud.event(e); world.events.length = 0; } };
