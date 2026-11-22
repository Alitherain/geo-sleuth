import { PADS } from '../content/data';
import { syncCats } from './logistics';
import { createWorld, type World } from './world';

export const SCHEMA = 1;
export interface SaveEnvelope { schemaVersion: number; game: 'dark-kittyborn'; savedAt: number; world: any }

export function serialize(w: World): SaveEnvelope {
  const { events, pads, trees, ...rest } = w;
  return {
    schemaVersion: SCHEMA, game: 'dark-kittyborn', savedAt: Date.now(),
    world: {
      ...rest,
      enemies: w.enemies.filter(e => !e.passive && w.night.phase === 'night'),
      pads: Object.fromEntries(Object.entries(pads).map(([id, p]) => [id, { paid: p.paid, items: p.items }])),
      trees: trees.map(t => [t.id, t.alive ? 1 : 0, Math.round(t.hp * 10) / 10, Math.round(t.regrow)]),
      cats: w.cats.map(c => ({ ...c, task: null })), // trips restart after loading; reservations are rebuilt empty
    },
  };
}

const MIGRATIONS: Record<number, (w: any) => any> = {
  // 1 -> 2 would go here: e.g. (w) => ({ ...w, newField: default })
};

export function deserialize(env: SaveEnvelope): World {
  if (!env || env.game !== 'dark-kittyborn' || typeof env.schemaVersion !== 'number' || !env.world) throw new Error('Це не збереження Dark KittyBorn');
  let data = env.world;
  for (let v = env.schemaVersion; v < SCHEMA; v++) data = MIGRATIONS[v]?.(data) ?? data;
  const w = createWorld();
  const scalar = ['time', 'coins', 'nextId', 'up', 'flags', 'stats', 'ground'] as const;
  for (const k of scalar) if (data[k] !== undefined) (w as any)[k] = data[k];
  if (data.hero) Object.assign(w.hero, data.hero, { dead: 0 });
  if (data.night) Object.assign(w.night, data.night);
  w.buildings = {};
  for (const [id, b] of Object.entries<any>(data.buildings || {})) w.buildings[id] = { ...b, reserved: {}, incoming: {} };
  if (!w.buildings.shop || !w.buildings.heart) { const fresh = createWorld(); w.buildings.shop ??= fresh.buildings.shop; w.buildings.heart ??= fresh.buildings.heart; }
  w.pads = {};
  for (const def of PADS) if (!w.buildings[def.id] && !w.flags['cleared_' + def.id]) {
    const p = data.pads?.[def.id];
    w.pads[def.id] = { def, paid: p?.paid || 0, items: p?.items || {}, incoming: {} };
  }
  const tmap = new Map<number, any[]>((data.trees || []).map((t: any[]) => [t[0], t]));
  for (const t of w.trees) { const s = tmap.get(t.id); if (s) { t.alive = !!s[1]; t.hp = s[2]; t.regrow = s[3]; } }
  w.cats = (data.cats || []).map((c: any) => ({ ...c, task: null }));
  w.enemies = (data.enemies || []);
  if (w.night.phase === 'night' && !w.enemies.length && !w.night.queue.length) w.night.phase = 'day';
  syncCats(w);
  return w;
}

// ---------------------------------------------------------------- export / import codes
export function exportCode(w: World): string {
  const json = JSON.stringify(serialize(w));
  const bytes = new TextEncoder().encode(json);
  let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
  return 'DKB1.' + btoa(bin);
}
export function importCode(code: string): World {
  const s = code.trim();
  if (!s.startsWith('DKB1.')) throw new Error('Код має починатися з DKB1.');
  const bin = atob(s.slice(5));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return deserialize(JSON.parse(new TextDecoder().decode(bytes)));
}
