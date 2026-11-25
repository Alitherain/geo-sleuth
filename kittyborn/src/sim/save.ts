import { syncCats } from './logistics';
import { createWorld, type World } from './world';

export const SCHEMA = 3;
export interface SaveEnvelope { schemaVersion: number; game: 'dark-kittyborn'; savedAt: number; world: any }

export function serialize(w: World): SaveEnvelope {
  const { events, nodes, visitors, ...rest } = w;
  return {
    schemaVersion: SCHEMA, game: 'dark-kittyborn', savedAt: Date.now(),
    world: {
      ...rest,
      enemies: w.clock.phase === 'night' ? w.enemies.filter(e => !e.passive) : [],
      nodes: nodes.map(n => [n.id, n.alive ? 1 : 0, Math.round(n.hp * 10) / 10, Math.round(n.regrow)]),
      cats: w.cats.map(c => ({ ...c, task: null, stack: [], path: undefined })),
      buildings: Object.fromEntries(Object.entries(w.buildings).map(([id, b]) => [id, { ...b, reserved: {}, incoming: {} }])),
    },
  };
}

export class OldSaveError extends Error {}
const MIGRATIONS: Record<number, (w: any) => any> = {};

export function deserialize(env: SaveEnvelope): World {
  if (!env || env.game !== 'dark-kittyborn' || typeof env.schemaVersion !== 'number' || !env.world) throw new Error('Це не збереження Dark KittyBorn');
  if (env.schemaVersion < 3) throw new OldSaveError('Збереження зі старої версії: містечко тепер на сітці, почнемо заново');
  let data = env.world;
  for (let v = env.schemaVersion; v < SCHEMA; v++) data = MIGRATIONS[v]?.(data) ?? data;
  const w = createWorld();
  for (const k of ['time', 'coins', 'nextId', 'up', 'flags', 'stats', 'ground', 'units', 'offers', 'till'] as const) if (data[k] !== undefined) (w as any)[k] = data[k];
  if (data.hero) Object.assign(w.hero, data.hero, { dead: 0 });
  if (data.clock) Object.assign(w.clock, data.clock);
  if (data.buildings) w.buildings = Object.fromEntries(Object.entries<any>(data.buildings).map(([id, b]) => [id, { ...b, reserved: {}, incoming: {} }]));
  const nmap = new Map<number, any[]>((data.nodes || []).map((n: any[]) => [n[0], n]));
  for (const n of w.nodes) { const s = nmap.get(n.id); if (s) { n.alive = !!s[1]; n.hp = s[2]; n.regrow = s[3]; } }
  w.cats = (data.cats || []).map((c: any) => ({ ...c, task: null }));
  w.enemies = data.enemies || [];
  w.shots = [];
  if (w.clock.phase === 'night' && !w.enemies.length && !w.clock.queue.length) w.clock.phase = 'day';
  syncCats(w);
  return w;
}

export function exportCode(w: World): string {
  const bytes = new TextEncoder().encode(JSON.stringify(serialize(w)));
  let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
  return 'DKB2.' + btoa(bin);
}
export function importCode(code: string): World {
  const s = code.trim();
  const m = /^DKB(\d)\./.exec(s); if (!m) throw new Error('Код має починатися з DKB2.');
  const bin = atob(s.slice(m[0].length));
  return deserialize(JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)))));
}
