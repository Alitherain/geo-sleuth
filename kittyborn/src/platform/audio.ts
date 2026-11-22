// Tiny synthesized sound effects and a music-box loop. No audio files needed.
let AC: AudioContext | null = null, master: GainNode | null = null, musicGain: GainNode | null = null, noiseBuf: AudioBuffer | null = null;
export const audio = { sound: true, music: true };

export function audioInit() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try {
    AC = new (window.AudioContext || (window as any).webkitAudioContext)();
    master = AC.createGain(); master.gain.value = audio.sound ? 0.5 : 0; master.connect(AC.destination);
    musicGain = AC.createGain(); musicGain.gain.value = audio.music ? 0.14 : 0; musicGain.connect(master);
  } catch { AC = null; }
}
export function setSound(on: boolean) { audio.sound = on; if (master) master.gain.value = on ? 0.5 : 0; }
export function setMusic(on: boolean) { audio.music = on; if (musicGain) musicGain.gain.value = on ? 0.14 : 0; }

function tone(f: number, d: number, type: OscillatorType = 'sine', v = 0.3, slide = 0, delay = 0) {
  if (!AC || !master || !audio.sound) return;
  const t = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.008); g.gain.exponentialRampToValueAtTime(0.001, t + d);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + d + 0.02);
}
function noise(d: number, v = 0.3, freq = 1200, delay = 0) {
  if (!AC || !master || !audio.sound) return;
  if (!noiseBuf) { noiseBuf = AC.createBuffer(1, AC.sampleRate * 0.5, AC.sampleRate); const a = noiseBuf.getChannelData(0); for (let i = 0; i < a.length; i++) a[i] = Math.random() * 2 - 1; }
  const t = AC.currentTime + delay, s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + d + 0.02);
}
const last: Record<string, number> = {};
export function sfx(name: string) {
  if (!AC) return;
  const now = AC.currentTime; if (last[name] && now - last[name] < 0.045) return; last[name] = now;
  switch (name) {
    case 'chop': noise(0.09, 0.35, 900); tone(180, 0.1, 'triangle', 0.25, -80); break;
    case 'fall': noise(0.35, 0.3, 300); tone(110, 0.3, 'sine', 0.3, -60); break;
    case 'pick': tone(620 + Math.random() * 120, 0.06, 'triangle', 0.12, 300); break;
    case 'drop': tone(420, 0.05, 'triangle', 0.1, -100); break;
    case 'coin': tone(1320, 0.08, 'square', 0.06); tone(1760, 0.14, 'square', 0.05, 0, 0.05); break;
    case 'pay': tone(900 + Math.random() * 300, 0.05, 'square', 0.04); break;
    case 'build': [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.18, 0, i * 0.08)); break;
    case 'hit': tone(380, 0.12, 'square', 0.1, 260); noise(0.06, 0.2, 2500); break;
    case 'poof': tone(700, 0.25, 'sine', 0.2, -500); noise(0.2, 0.2, 1800); break;
    case 'hurt': tone(160, 0.2, 'sawtooth', 0.18, -90); break;
    case 'slam': noise(0.5, 0.5, 160); tone(70, 0.5, 'sine', 0.5, -30); break;
    case 'upg': [784, 988, 1175].forEach((f, i) => tone(f, 0.18, 'square', 0.07, 0, i * 0.06)); break;
    case 'meow': tone(700, 0.18, 'sine', 0.12, 300); tone(1000, 0.2, 'sine', 0.08, -400, 0.12); break;
    case 'bell': [392, 392 * 1.5, 392 * 2].forEach((f, i) => tone(f, 1.6, 'sine', 0.22 / (i + 1))); break;
    case 'shot': tone(500, 0.06, 'triangle', 0.08, -200); break;
    case 'wall': noise(0.08, 0.2, 600); break;
    case 'win': [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.35, 'triangle', 0.16, 0, i * 0.1)); break;
    case 'lose': [392, 330, 262].forEach((f, i) => tone(f, 0.5, 'sine', 0.2, 0, i * 0.2)); break;
  }
}
const MEL = [69, 72, 76, 74, 72, 71, 72, 69, 64, 68, 71, 74, 72, 71, 69, 0, 65, 69, 72, 71, 69, 67, 65, 64, 62, 65, 69, 68, 69, 71, 69, 0];
const BASS = [45, 45, 52, 52, 40, 40, 44, 44, 41, 41, 48, 48, 38, 38, 45, 45];
let musicT = 0, musicI = 0;
export function musicTick(night: boolean) {
  if (!AC || !musicGain || !audio.music || !audio.sound) return;
  const beat = night ? 0.28 : 0.36;
  while (musicT < AC.currentTime + 0.3) {
    if (musicT < AC.currentTime) musicT = AC.currentTime + 0.05;
    const n = MEL[musicI % MEL.length];
    const mk = (m: number, d: number, v: number, type: OscillatorType) => {
      const o = AC!.createOscillator(), g = AC!.createGain(); o.type = type;
      o.frequency.value = 440 * Math.pow(2, (m - 69) / 12);
      g.gain.setValueAtTime(0, musicT); g.gain.linearRampToValueAtTime(v, musicT + 0.01); g.gain.exponentialRampToValueAtTime(0.001, musicT + d);
      o.connect(g); g.connect(musicGain!); o.start(musicT); o.stop(musicT + d + 0.05);
    };
    if (n) { mk(n + 12 - (night ? 12 : 0), 1.1, 0.35, night ? 'triangle' : 'sine'); mk(n + 24, 0.5, 0.08, 'sine'); }
    if (musicI % 2 === 0) mk(BASS[(musicI / 2) % BASS.length], 1.4, 0.25, 'triangle');
    musicI++; musicT += beat;
  }
}
