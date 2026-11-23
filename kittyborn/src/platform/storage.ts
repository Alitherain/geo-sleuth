// Save storage: localStorage with a backup slot. Every call is guarded because storage can be blocked.
import { deserialize, serialize, type SaveEnvelope } from '../sim/save';
import type { World } from '../sim/world';

const KEY = 'dark-kittyborn-save', BACKUP = KEY + '-backup', SETTINGS = 'dark-kittyborn-settings';

export function saveWorld(w: World) {
  try {
    const cur = localStorage.getItem(KEY);
    if (cur) localStorage.setItem(BACKUP, cur);
    localStorage.setItem(KEY, JSON.stringify(serialize(w)));
  } catch { /* storage unavailable */ }
}
export function loadWorld(): World | null {
  let old: unknown = null;
  for (const k of [KEY, BACKUP]) {
    try { const raw = localStorage.getItem(k); if (raw) return deserialize(JSON.parse(raw) as SaveEnvelope); } catch (e) { old = old || e; }
  }
  if (old && (old as Error).name === 'Error' && String((old as Error).message).includes('першої версії')) throw old;
  return null;
}
export function clearSave() { try { localStorage.removeItem(KEY); localStorage.removeItem(BACKUP); } catch { /* ignore */ } }
export function loadSettings(): { sound: boolean; music: boolean } {
  try { return { sound: true, music: true, ...JSON.parse(localStorage.getItem(SETTINGS) || '{}') }; } catch { return { sound: true, music: true }; }
}
export function saveSettings(s: { sound: boolean; music: boolean }) { try { localStorage.setItem(SETTINGS, JSON.stringify(s)); } catch { /* ignore */ } }
export function requestPersist() { try { (navigator as any).storage?.persist?.(); } catch { /* ignore */ } }
