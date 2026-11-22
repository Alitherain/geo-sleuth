// All game content as data. Adding a building, wave or upgrade should mostly mean editing this file.

export type ItemId = 'log' | 'lav' | 'plank' | 'meat' | 'fluff';
export const ITEMS: Record<ItemId, { name: string; price: number; h: number }> = {
  log: { name: 'Колода', price: 1, h: 9 },
  lav: { name: 'Лавандова колода', price: 3, h: 9 },
  plank: { name: 'Дошка', price: 3, h: 6 },
  meat: { name: 'М\'ясо', price: 4, h: 10 },
  fluff: { name: 'Пух', price: 2, h: 9 },
};
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

// ---------------------------------------------------------------- map
export const W = 2400, H = 1600;
export interface Rect { x: number; y: number; w: number; h: number }
export const PLAZA: Rect = { x: 900, y: 560, w: 600, h: 580 };
export const ROAD_Y = 850;
export const EDGE: Rect = { x: 520, y: 140, w: 330, h: 1340 };   // Смарагдовий Узлісок
export const GROVE: Rect = { x: 100, y: 140, w: 370, h: 1340 };  // Лавандовий Гай
export const WILDS: Rect = { x: 1600, y: 140, w: 740, h: 1340 }; // Пустище
export const HEDGE_X = 488;
export const GAP_HALF = 46;
export type GapId = 'W' | 'E' | 'S';
export const GAPS: Record<GapId, { x: number; y: number; vertical: boolean; out: { x: number; y: number }; inn: { x: number; y: number } }> = {
  W: { x: PLAZA.x, y: ROAD_Y, vertical: true, out: { x: PLAZA.x - 70, y: ROAD_Y }, inn: { x: PLAZA.x + 60, y: ROAD_Y } },
  E: { x: PLAZA.x + PLAZA.w, y: ROAD_Y, vertical: true, out: { x: PLAZA.x + PLAZA.w + 70, y: ROAD_Y }, inn: { x: PLAZA.x + PLAZA.w - 60, y: ROAD_Y } },
  S: { x: 1150, y: PLAZA.y + PLAZA.h, vertical: false, out: { x: 1150, y: PLAZA.y + PLAZA.h + 70 }, inn: { x: 1150, y: PLAZA.y + PLAZA.h - 60 } },
};
export const SPAWNS: Record<string, { x: number; y: number; gap: GapId }> = {
  E: { x: 2330, y: ROAD_Y, gap: 'E' },
  S: { x: 1150, y: 1560, gap: 'S' },
  W: { x: 90, y: ROAD_Y, gap: 'W' },
};
export const HEART = { x: 1200, y: 890 };

// ---------------------------------------------------------------- buildings
export type BuildingType = 'shop' | 'storage' | 'sawmill' | 'forge' | 'bell' | 'catHouse' | 'palisade' | 'tower' | 'lantern' | 'clear';
export type CatRole = 'lumber' | 'hauler' | 'guard';
export type SlotKind = 'sell' | 'deposit' | 'sawIn' | 'sawOut' | 'forge' | 'bell';

export interface LevelDef { cost: Cost; stats: Record<string, number>; label: string }
export interface Cost { coins?: number; plank?: number; lav?: number; log?: number; fluff?: number }
export interface BuildingDef {
  name: string; r: number; hp?: number;
  slots?: { kind: SlotKind; dx: number; dy: number }[];
  levels?: LevelDef[];
  specs?: { id: string; name: string; desc: string; cost: Cost; stats: Record<string, number> }[];
}

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  shop: { name: 'Лавка Пані Сови', r: 62, slots: [{ kind: 'sell', dx: 0, dy: 82 }] },
  storage: {
    name: 'Склад', r: 46, slots: [{ kind: 'deposit', dx: 0, dy: 70 }],
    levels: [
      { cost: {}, stats: { cap: 80 }, label: 'Місткість 80' },
      { cost: { coins: 60, plank: 15 }, stats: { cap: 160 }, label: 'Місткість 160' },
      { cost: { coins: 150, lav: 10 }, stats: { cap: 320 }, label: 'Місткість 320' },
    ],
  },
  sawmill: {
    name: 'Лісопилка', r: 52, slots: [{ kind: 'sawIn', dx: -58, dy: 68 }, { kind: 'sawOut', dx: 58, dy: 68 }],
    levels: [
      { cost: {}, stats: { time: 1.2, inCap: 12, outCap: 20, yield: 1 }, label: '1 колода за 1.2 с' },
      { cost: { coins: 80, plank: 10 }, stats: { time: 0.9, inCap: 20, outCap: 30, yield: 1 }, label: 'Швидше, більші запаси' },
      { cost: { coins: 160, lav: 10 }, stats: { time: 0.7, inCap: 30, outCap: 40, yield: 1 }, label: 'Ще швидше' },
    ],
    specs: [
      { id: 'fast', name: 'Швидкопил', desc: 'Пиляє вдвічі швидше', cost: { coins: 250, lav: 15 }, stats: { time: 0.35 } },
      { id: 'fine', name: 'Ощадна пилка', desc: '2 колоди дають 3 дошки', cost: { coins: 250, lav: 15 }, stats: { yield: 1.5 } },
    ],
  },
  forge: { name: 'Кузня Діда Ковадла', r: 44, slots: [{ kind: 'forge', dx: 0, dy: 66 }] },
  bell: { name: 'Дзвін Ночі', r: 26, slots: [{ kind: 'bell', dx: 0, dy: 56 }] },
  catHouse: {
    name: 'Котячий будиночок', r: 24,
    levels: [
      { cost: {}, stats: { cats: 1 }, label: '1 котик' },
      { cost: { coins: 100, plank: 10 }, stats: { cats: 2 }, label: '2 котики' },
      { cost: { coins: 220, lav: 10 }, stats: { cats: 3 }, label: '3 котики' },
    ],
  },
  palisade: {
    name: 'Частокіл', r: 0, hp: 60,
    levels: [
      { cost: {}, stats: { hp: 60 }, label: 'Міцність 60' },
      { cost: { lav: 10 }, stats: { hp: 150 }, label: 'Лавандовий частокіл, міцність 150' },
    ],
  },
  tower: {
    name: 'Башта-рогатка', r: 22, hp: 80,
    levels: [
      { cost: {}, stats: { dmg: 2, rate: 1.0, range: 180 }, label: 'Шишка раз на секунду' },
      { cost: { coins: 90, lav: 10 }, stats: { dmg: 3.5, rate: 0.7, range: 210 }, label: 'Важчі шишки, частіше' },
    ],
  },
  lantern: {
    name: 'Ліхтар', r: 10, hp: 40,
    levels: [
      { cost: {}, stats: { hp: 40 }, label: 'Міцність 40' },
      { cost: { coins: 60, lav: 5 }, stats: { hp: 90 }, label: 'Міцність 90' },
    ],
  },
  clear: { name: 'Просіка', r: 0 },
};

// ---------------------------------------------------------------- build pads (the progression)
export interface PadDef {
  id: string; type: BuildingType; name: string; icon: string; x: number; y: number;
  cost: Cost; req: string[]; role?: CatRole; gap?: GapId; msg: string;
}
export const PADS: PadDef[] = [
  { id: 'catLumber', type: 'catHouse', role: 'lumber', name: 'Котик-лісоруб', icon: '🐱', x: 990, y: 640, cost: { coins: 20 }, req: [], msg: 'Профспілка Котів на зв\'язку. Платня: рибка і повага.' },
  { id: 'sawmill', type: 'sawmill', name: 'Лісопилка', icon: '🪚', x: 1030, y: 1030, cost: { coins: 60 }, req: ['catLumber'], msg: 'Колоди → дошки. Дошки потрібні для будівництва.' },
  { id: 'storage', type: 'storage', name: 'Склад', icon: '📦', x: 1320, y: 1030, cost: { coins: 40, plank: 8 }, req: ['sawmill'], msg: 'Сюди котики зноситимуть усе. Надлишок продається сам.' },
  { id: 'catHauler', type: 'catHouse', role: 'hauler', name: 'Котик-носій', icon: '🐈', x: 1410, y: 640, cost: { coins: 80 }, req: ['storage'], msg: 'Носить між будівлями. Повними рейсами, обіцяє.' },
  { id: 'forge', type: 'forge', name: 'Кузня', icon: '🔨', x: 1005, y: 790, cost: { coins: 60, plank: 10 }, req: ['sawmill'], msg: 'Дід Ковадло прокинувся. Дзень — це «так».' },
  { id: 'bell', type: 'bell', name: 'Дзвін Ночі', icon: '🔔', x: 1400, y: 790, cost: { coins: 50, plank: 12 }, req: ['storage'], msg: 'Коли будеш готовий — подзвони, і прийде Пухнаста Ніч.' },
  { id: 'palE', type: 'palisade', gap: 'E', name: 'Частокіл', icon: '🪵', x: GAPS.E.x, y: GAPS.E.y, cost: { plank: 15 }, req: ['bell'], msg: 'Звірі гризтимуть його замість ліхтарів.' },
  { id: 'palS', type: 'palisade', gap: 'S', name: 'Частокіл', icon: '🪵', x: GAPS.S.x, y: GAPS.S.y, cost: { plank: 15 }, req: ['bell'], msg: 'Південні ворота під захистом.' },
  { id: 'palW', type: 'palisade', gap: 'W', name: 'Частокіл', icon: '🪵', x: GAPS.W.x, y: GAPS.W.y, cost: { plank: 15 }, req: ['hedge'], msg: 'Тепер і з лісу не пролізуть.' },
  { id: 'hedge', type: 'clear', name: 'Розчистити хащі', icon: '🌿', x: 545, y: ROAD_Y, cost: { coins: 120 }, req: ['forge'], msg: 'Лавандовий Гай! Лавандова деревина потрібна для башт.' },
  { id: 'catGuard', type: 'catHouse', role: 'guard', name: 'Котик-сторож', icon: '🐈‍⬛', x: 1450, y: 975, cost: { coins: 150, plank: 15 }, req: ['bell'], msg: 'Вдень лагодить, уночі стоїть на воротах.' },
  { id: 'towerE', type: 'tower', name: 'Башта-рогатка', icon: '🏹', x: 1565, y: 740, cost: { coins: 60, lav: 10 }, req: ['bell', 'hedge'], msg: 'Стріляє шишками. Влучно. Іноді.' },
  { id: 'towerS', type: 'tower', name: 'Башта-рогатка', icon: '🏹', x: 1265, y: 1205, cost: { coins: 60, lav: 10 }, req: ['towerE'], msg: 'Південь прикрито.' },
  { id: 'towerW', type: 'tower', name: 'Башта-рогатка', icon: '🏹', x: 835, y: 740, cost: { coins: 60, lav: 10 }, req: ['towerE', 'palW'], msg: 'Захід прикрито.' },
  { id: 'lanW', type: 'lantern', name: 'Ліхтар', icon: '🏮', x: 1090, y: 935, cost: { coins: 40, lav: 5 }, req: ['hedge'], msg: 'Більше світла — менше Пухняви.' },
  { id: 'lanE', type: 'lantern', name: 'Ліхтар', icon: '🏮', x: 1310, y: 935, cost: { coins: 40, lav: 5 }, req: ['lanW'], msg: 'Площа сяє.' },
];

// ---------------------------------------------------------------- hero upgrades (forge)
export interface HeroUpg { id: 'bag' | 'axe' | 'boots' | 'heart' | 'mint'; icon: string; name: string; desc: (lv: number) => string; costs: Cost[]; req?: string }
export const HERO_UPG: HeroUpg[] = [
  { id: 'bag', icon: '🎒', name: 'Бездонний рюкзак', desc: lv => `Місткість ${10 + lv * 6} → ${16 + lv * 6}`, costs: [{ coins: 30 }, { coins: 70, plank: 5 }, { coins: 150, plank: 10 }, { coins: 300, lav: 8 }, { coins: 600, lav: 15 }] },
  { id: 'axe', icon: '🪓', name: 'Сокиропила', desc: lv => `Сила ×${(1 + lv * .6).toFixed(1)} → ×${(1 + (lv + 1) * .6).toFixed(1)}`, costs: [{ coins: 40 }, { coins: 90, plank: 5 }, { coins: 180, plank: 10 }, { coins: 350, lav: 8 }, { coins: 700, lav: 15 }] },
  { id: 'boots', icon: '👢', name: 'Чоботи-скороходи', desc: () => 'Швидкість +12%', costs: [{ coins: 35 }, { coins: 80 }, { coins: 170, plank: 8 }, { coins: 340, lav: 6 }] },
  { id: 'heart', icon: '❤️', name: 'Міцне серденько', desc: lv => `Життя ${5 + lv} → ${6 + lv}`, costs: [{ coins: 60 }, { coins: 150, fluff: 5 }, { coins: 320, fluff: 10 }, { coins: 600, fluff: 20 }] },
  { id: 'mint', icon: '🌿', name: 'Котяча м\'ятка', desc: () => 'Усі котики +12% швидкості й +2 місця', costs: [{ coins: 120, fluff: 10 }, { coins: 260, fluff: 20 }, { coins: 500, fluff: 35 }], req: 'boss1' },
];

// ---------------------------------------------------------------- nights
export type EnemyKind = 'fluff' | 'horn' | 'boss';
export const ENEMIES: Record<EnemyKind, { hp: number; r: number; speed: number; dmg: number; wallMul: number; drops: Partial<Record<ItemId, number>> }> = {
  fluff: { hp: 6, r: 17, speed: 48, dmg: 4, wallMul: 1, drops: { meat: 1, fluff: 1 } },
  horn: { hp: 16, r: 22, speed: 38, dmg: 8, wallMul: 3, drops: { meat: 2, fluff: 2 } },
  boss: { hp: 180, r: 52, speed: 55, dmg: 15, wallMul: 4, drops: { fluff: 12, meat: 6 } },
};
export interface WaveEntry { at: number; kind: EnemyKind; from: string }
export function waveFor(night: number, hasGrove: boolean): { entries: WaveEntry[]; reward: number; title: string } {
  const e: WaveEntry[] = [];
  const add = (n: number, kind: EnemyKind, from: string, start: number, gap: number) => { for (let i = 0; i < n; i++) e.push({ at: start + i * gap, kind, from }); };
  if (night === 1) { add(6, 'fluff', 'E', 2, 2.2); return { entries: e, reward: 60, title: 'Перша Пухнаста Ніч' }; }
  if (night === 2) { add(7, 'fluff', 'E', 2, 1.8); add(5, 'fluff', 'S', 8, 2); add(2, 'horn', 'E', 14, 4); return { entries: e, reward: 110, title: 'Друга Пухнаста Ніч' }; }
  if (night === 3) { add(6, 'fluff', 'S', 2, 1.6); add(1, 'boss', 'E', 6, 1); add(6, 'fluff', 'E', 12, 2.5); return { entries: e, reward: 500, title: 'Ніч Пана Пухнастого' }; }
  const k = night - 3, froms = hasGrove ? ['E', 'S', 'W'] : ['E', 'S'];
  froms.forEach((f, i) => { add(5 + k * 2, 'fluff', f, 2 + i * 3, 1.6); add(1 + Math.floor(k / 2), 'horn', f, 10 + i * 3, 4); });
  if (k % 3 === 0) add(1, 'boss', 'E', 15, 1);
  return { entries: e, reward: 120 + k * 60, title: `Пухнаста Ніч №${night}` };
}
