// All game content as data. A new building, wave or upgrade should mostly mean editing this file.

export type ItemId = 'log' | 'lav' | 'plank' | 'stone' | 'berry' | 'meat' | 'candle' | 'fluff';
export const ITEMS: Record<ItemId, { name: string; price: number; h: number; icon: string }> = {
  log: { name: 'Колода', price: 1, h: 9, icon: '🪵' },
  lav: { name: 'Лавандова колода', price: 3, h: 9, icon: '💜' },
  plank: { name: 'Дошка', price: 3, h: 6, icon: '🟫' },
  stone: { name: 'Камінь', price: 2, h: 9, icon: '🪨' },
  berry: { name: 'Ягоди', price: 1, h: 8, icon: '🫐' },
  meat: { name: 'М\'ясо', price: 3, h: 10, icon: '🍖' },
  candle: { name: 'Свічка', price: 6, h: 10, icon: '🕯️' },
  fluff: { name: 'Пух', price: 2, h: 9, icon: '☁️' },
};
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
export type Cost = Partial<Record<ItemId | 'coins', number>>;

// ---------------------------------------------------------------- map
export const W = 3000, H = 2000;
export interface Rect { x: number; y: number; w: number; h: number }
export const TC = { x: 1500, y: 1000 };                       // town centre
export const CELL = 48;                                         // grid cell in world units
export const TOWN_HALF = [8, 10, 12];                            // town square half-size in cells per hall level
export const NEAR_CELLS = 6;                                    // defence ring beyond the town edge, in cells
export const TOWN_R = TOWN_HALF.map(h => h * CELL);
export const EDGE: Rect = { x: 560, y: 160, w: 340, h: 1680 };  // Смарагдовий Узлісок
export const GROVE: Rect = { x: 110, y: 160, w: 360, h: 1680 }; // Лавандовий Гай
export const HILLS: Rect = { x: 1050, y: 110, w: 1000, h: 280 }; // Кам'яні Пагорби
export const MEADOW: Rect = { x: 1100, y: 1610, w: 900, h: 340 }; // Ягідна Галявина
export const WILDS: Rect = { x: 2250, y: 160, w: 690, h: 1680 };  // Пустище
export const HEDGE_X = 500;
export const ROAD_Y = 1000;
export const SPAWNS: Record<string, { x: number; y: number; name: string }> = {
  N: { x: 1500, y: 90, name: 'з півночі' },
  E: { x: 2930, y: 1000, name: 'зі сходу' },
  S: { x: 1500, y: 1940, name: 'з півдня' },
  W: { x: 70, y: 1000, name: 'із заходу' },
};

// ---------------------------------------------------------------- buildings
export type BuildingType =
  | 'hall' | 'shop' | 'heart' | 'bonfire' | 'lantern' | 'ledLamp'
  | 'houseGatherer' | 'houseQuarry' | 'houseForager' | 'houseHauler' | 'houseMaster'
  | 'sawmill' | 'storage' | 'forge' | 'candleShop' | 'bell'
  | 'palisade' | 'tower' | 'barracks' | 'post'
  | 'flowerbed' | 'bench' | 'banner' | 'fountain';
export type CatRole = 'gatherer' | 'hauler' | 'master';
export type GatherKind = 'wood' | 'stone' | 'berry';
export type SlotKind = 'sell' | 'deposit' | 'in' | 'out' | 'forge' | 'bell' | 'fuel';
export type Category = 'eco' | 'light' | 'defense' | 'cats' | 'decor';
export type Req = { b?: BuildingType; hall?: number; flag?: string };

export interface LevelDef { cost: Cost; stats: Record<string, number>; label: string }
export interface BuildDef {
  name: string; icon: string; desc: string; cat: Category; r: number; fp?: number; // fp = footprint in cells (square)
  cost: Cost; req: Req[]; max?: number[]; // max count per hall level
  zone: 'town' | 'near'; // near = up to 260 beyond the town edge (defence)
  hp?: number; levels?: LevelDef[];
  specs?: { id: string; name: string; desc: string; cost: Cost; stats: Record<string, number> }[];
  slots?: { kind: SlotKind; dx: number; dy: number }[];
  role?: CatRole; gather?: GatherKind; comfort?: number;
  fuel?: { item: ItemId; cap: number; burn: number; radius: number }; // burn = seconds per unit (day)
  proc?: { input: ItemId; output: ItemId; time: number; inCap: number; outCap: number };
  noBuild?: boolean; locked?: string; continuous?: boolean;
}

export const BUILD: Record<BuildingType, BuildDef> = {
  hall: { name: 'Ратуша', icon: '🏛️', desc: 'Серце містечка. Рівень Ратуші розширює межі й відкриває нові будівлі.', cat: 'eco', r: 58, cost: {}, req: [], zone: 'town', noBuild: true,
    levels: [
      { cost: {}, stats: { half: 8 }, label: 'Хутір' },
      { cost: { coins: 150, plank: 30, stone: 15 }, stats: { half: 10 }, label: 'Містечко: ширші межі, Казарма, Свічкарня' },
      { cost: { coins: 450, plank: 60, stone: 40, lav: 20, candle: 10 }, stats: { half: 12 }, label: 'Місто: найширші межі, кам\'яні мури' },
    ] },
  shop: { name: 'Лавка Пані Сови', icon: '🦉', desc: 'Купує все. Ху-ху.', cat: 'eco', r: 46, cost: {}, req: [], zone: 'town', noBuild: true, slots: [{ kind: 'sell', dx: 0, dy: 62 }] },
  heart: { name: 'Великий Костер', icon: '🔥', desc: 'Головне світло. Якщо згасне все світло — ніч програна.', cat: 'light', r: 26, cost: {}, req: [], zone: 'town', noBuild: true, hp: 150,
    fuel: { item: 'log', cap: 30, burn: 30, radius: 250 }, slots: [{ kind: 'fuel', dx: 0, dy: 48 }] },
  bonfire: { name: 'Костер', icon: '🔥', desc: 'Світло на дровах. Звірі в світлі слабшають і повільнішають.', cat: 'light', r: 20, cost: { coins: 8, log: 4 }, req: [], max: [3, 6, 10], zone: 'near', hp: 50,
    fuel: { item: 'log', cap: 10, burn: 24, radius: 185 }, slots: [{ kind: 'fuel', dx: 0, dy: 40 }] },
  lantern: { name: 'Ліхтар на свічках', icon: '🏮', desc: 'Світить ширше й довше за костер, але їсть свічки.', cat: 'light', r: 12, cost: { coins: 30, plank: 4, stone: 2 }, req: [{ b: 'candleShop' }], max: [0, 6, 12], zone: 'near', hp: 70,
    fuel: { item: 'candle', cap: 6, burn: 50, radius: 245 }, slots: [{ kind: 'fuel', dx: 0, dy: 36 }] },
  ledLamp: { name: 'LED-ліхтар', icon: '💡', desc: 'Світло без вогню.', cat: 'light', r: 12, cost: {}, req: [{ hall: 3 }], zone: 'near', locked: 'Наступна глава: Електрика' },
  houseGatherer: { name: 'Хатка лісорубів', icon: '🪓', desc: 'Котики-лісоруби рубають дерева: колоди для лісопилки й кострів.', cat: 'cats', r: 24, cost: { coins: 15 }, req: [], max: [2, 4, 6], zone: 'town', role: 'gatherer', gather: 'wood',
    levels: [{ cost: {}, stats: { cats: 1 }, label: '1 котик' }, { cost: { coins: 80, plank: 8 }, stats: { cats: 2 }, label: '2 котики' }, { cost: { coins: 180, plank: 10, stone: 8 }, stats: { cats: 3 }, label: '3 котики' }] },
  houseQuarry: { name: 'Каменярня', icon: '⛏️', desc: 'Котики-каменярі видобувають камінь на пагорбах: для башт, мурів і Ратуші.', cat: 'cats', r: 24, cost: { coins: 25, plank: 4 }, req: [{ b: 'sawmill' }], max: [1, 2, 3], zone: 'town', role: 'gatherer', gather: 'stone',
    levels: [{ cost: {}, stats: { cats: 1 }, label: '1 котик' }, { cost: { coins: 80, plank: 8 }, stats: { cats: 2 }, label: '2 котики' }, { cost: { coins: 180, plank: 10, stone: 8 }, stats: { cats: 3 }, label: '3 котики' }] },
  houseForager: { name: 'Ягідна хатка', icon: '🧺', desc: 'Котики-ягідники збирають ягоди на галявині: їжа для воїнів і квітники.', cat: 'cats', r: 24, cost: { coins: 15 }, req: [], max: [1, 2, 3], zone: 'town', role: 'gatherer', gather: 'berry',
    levels: [{ cost: {}, stats: { cats: 1 }, label: '1 котик' }, { cost: { coins: 80, plank: 8 }, stats: { cats: 2 }, label: '2 котики' }, { cost: { coins: 180, plank: 10, stone: 8 }, stats: { cats: 3 }, label: '3 котики' }] },
  houseHauler: { name: 'Будиночок носіїв', icon: '🐈', desc: 'Носії возять між будівлями, підкидають дрова в костри, продають надлишок.', cat: 'cats', r: 24, cost: { coins: 50 }, req: [{ b: 'storage' }], max: [1, 2, 3], zone: 'town', role: 'hauler',
    levels: [{ cost: {}, stats: { cats: 1 }, label: '1 котик' }, { cost: { coins: 90, plank: 8 }, stats: { cats: 2 }, label: '2 котики' }, { cost: { coins: 200, plank: 10, stone: 8 }, stats: { cats: 3 }, label: '3 котики' }] },
  houseMaster: { name: 'Майстерня майстрів', icon: '🛠️', desc: 'Майстри лагодять частоколи, башти й світло.', cat: 'cats', r: 24, cost: { coins: 70, plank: 8 }, req: [{ b: 'forge' }], max: [1, 2, 2], zone: 'town', role: 'master',
    levels: [{ cost: {}, stats: { cats: 1 }, label: '1 майстер' }, { cost: { coins: 120, plank: 10, stone: 6 }, stats: { cats: 2 }, label: '2 майстри' }] },
  sawmill: { name: 'Лісопилка', icon: '🪚', desc: 'Колоди → дошки.', cat: 'eco', r: 46, cost: { coins: 35 }, req: [{ b: 'houseGatherer' }], max: [1, 2, 3], zone: 'town',
    slots: [{ kind: 'in', dx: -52, dy: 60 }, { kind: 'out', dx: 52, dy: 60 }],
    proc: { input: 'log', output: 'plank', time: 1.2, inCap: 12, outCap: 20 },
    levels: [{ cost: {}, stats: { speed: 1, cap: 1 }, label: 'Звичайна' }, { cost: { coins: 70, plank: 10 }, stats: { speed: 1.35, cap: 1.6 }, label: 'Швидше, більші запаси' }, { cost: { coins: 150, stone: 12, lav: 6 }, stats: { speed: 1.7, cap: 2.2 }, label: 'Ще швидше' }],
    specs: [{ id: 'fast', name: 'Швидкопил', desc: 'Пиляє вдвічі швидше', cost: { coins: 220, lav: 12 }, stats: { speed: 3.4 } }, { id: 'fine', name: 'Ощадна пилка', desc: '2 колоди дають 3 дошки', cost: { coins: 220, lav: 12 }, stats: { yield: 1.5 } }] },
  storage: { name: 'Склад', icon: '📦', desc: 'Котики зносять сюди все. Надлишок носії продають самі.', cat: 'eco', r: 42, cost: { coins: 25, plank: 6 }, req: [{ b: 'sawmill' }], max: [1, 1, 2], zone: 'town',
    slots: [{ kind: 'deposit', dx: 0, dy: 58 }],
    levels: [{ cost: {}, stats: { cap: 100 }, label: 'Місткість 100' }, { cost: { coins: 60, plank: 15 }, stats: { cap: 200 }, label: 'Місткість 200' }, { cost: { coins: 150, stone: 20 }, stats: { cap: 400 }, label: 'Місткість 400' }] },
  forge: { name: 'Кузня Діда Ковадла', icon: '🔨', desc: 'Прокачка героя: рюкзак, сокиропила, чоботи, серце.', cat: 'eco', r: 40, cost: { coins: 35, plank: 6 }, req: [{ b: 'sawmill' }], max: [1, 1, 1], zone: 'town', slots: [{ kind: 'forge', dx: 0, dy: 56 }] },
  candleShop: { name: 'Свічкарня', icon: '🕯️', desc: 'М\'ясо (жир) → свічки для ліхтарів. Свічки ще й дорого продаються.', cat: 'eco', r: 40, cost: { coins: 90, plank: 15, stone: 10 }, req: [{ hall: 2 }], max: [0, 1, 2], zone: 'town',
    slots: [{ kind: 'in', dx: -46, dy: 56 }, { kind: 'out', dx: 46, dy: 56 }], proc: { input: 'meat', output: 'candle', time: 2.5, inCap: 10, outCap: 20 } },
  bell: { name: 'Дзвін Ночі', icon: '🔔', desc: 'Покликати ніч раніше за розкладом: +25% нагороди.', cat: 'defense', r: 22, cost: { coins: 25, plank: 6 }, req: [{ b: 'storage' }], max: [1, 1, 1], zone: 'town', slots: [{ kind: 'bell', dx: 0, dy: 48 }] },
  palisade: { name: 'Частокіл', icon: '🪵', desc: 'Секція огорожі. Тягни лінію або обнеси все містечко одним дотиком. Звірі гризуть її замість світла.', cat: 'defense', r: 20, cost: { plank: 3 }, req: [{ b: 'sawmill' }], max: [80, 100, 130], zone: 'near', hp: 60, continuous: true,
    levels: [{ cost: {}, stats: { hp: 60 }, label: 'Дерев\'яний, міцність 60' }, { cost: { stone: 3 }, stats: { hp: 170 }, label: 'Кам\'яний мур, міцність 170' }] },
  tower: { name: 'Башта-рогатка', icon: '🏹', desc: 'Стріляє шишками по звірах.', cat: 'defense', r: 24, cost: { coins: 45, plank: 10, stone: 5 }, req: [{ b: 'forge' }], max: [2, 5, 9], zone: 'near', hp: 90,
    levels: [{ cost: {}, stats: { dmg: 2, rate: 1.0, range: 190 }, label: 'Шишка раз на секунду' }, { cost: { coins: 80, lav: 8, stone: 6 }, stats: { dmg: 3.5, rate: 0.7, range: 220 }, label: 'Лавандові шишки, частіше' }] },
  barracks: { name: 'Казарма Котячої Варти', icon: '⚔️', desc: 'Навчає котиків-воїнів. Їх розставляєш по постах.', cat: 'defense', r: 46, cost: { coins: 110, plank: 20, stone: 10 }, req: [{ hall: 2 }], max: [0, 1, 2], zone: 'town',
    levels: [{ cost: {}, stats: { units: 4 }, label: 'До 4 воїнів' }, { cost: { coins: 160, plank: 20, stone: 15 }, stats: { units: 8 }, label: 'До 8 воїнів' }, { cost: { coins: 320, stone: 30, lav: 10 }, stats: { units: 12 }, label: 'До 12 воїнів' }] },
  post: { name: 'Пост варти', icon: '🚩', desc: 'Точка оборони. Признач, скільки воїнів тут стоїть.', cat: 'defense', r: 14, cost: { coins: 10, plank: 2 }, req: [{ b: 'barracks' }], max: [0, 4, 8], zone: 'near' },
  flowerbed: { name: 'Квітник', icon: '🌷', desc: 'Затишок +1: котики трохи швидші.', cat: 'decor', r: 18, cost: { coins: 8, berry: 2 }, req: [], max: [4, 8, 14], zone: 'town', comfort: 1 },
  bench: { name: 'Лавочка', icon: '🪑', desc: 'Затишок +1.', cat: 'decor', r: 18, cost: { plank: 5 }, req: [{ b: 'sawmill' }], max: [3, 6, 10], zone: 'town', comfort: 1 },
  banner: { name: 'Прапор Ліхтарників', icon: '🎏', desc: 'Затишок +2.', cat: 'decor', r: 12, cost: { coins: 15, fluff: 3 }, req: [{ hall: 2 }], max: [0, 4, 8], zone: 'town', comfort: 2 },
  fountain: { name: 'Фонтан', icon: '⛲', desc: 'Затишок +4. Котики обожнюють.', cat: 'decor', r: 34, cost: { coins: 80, stone: 20 }, req: [{ hall: 2 }], max: [0, 1, 2], zone: 'town', comfort: 4 },
};
// Grid footprints. Pads sit in the row right in front of a building; that row stays free so nothing gets walled in.
const FP: Record<BuildingType, number> = { hall: 4, shop: 3, heart: 2, bonfire: 1, lantern: 1, ledLamp: 1, houseGatherer: 2, houseQuarry: 2, houseForager: 2, houseHauler: 2, houseMaster: 2,
  sawmill: 3, storage: 3, forge: 2, candleShop: 3, bell: 1, palisade: 1, tower: 2, barracks: 3, post: 1, flowerbed: 1, bench: 1, banner: 1, fountain: 2 };
for (const [t, def] of Object.entries(BUILD) as [BuildingType, BuildDef][]) {
  const fp = FP[t]; def.fp = fp; def.r = fp * CELL / 2;
  for (const sl of def.slots || []) { const col = sl.dx < 0 ? 0 : sl.dx > 0 ? fp - 1 : (fp - 1) / 2; sl.dx = (col - (fp - 1) / 2) * CELL; sl.dy = fp * CELL / 2 + CELL / 2; }
}
/** Buildings the hero and cats can walk over (they still take grid space). */
export const WALKABLE = (t: BuildingType) => t === 'palisade' || t === 'flowerbed' || t === 'bench' || t === 'banner';

export const CATEGORIES: { id: Category; name: string; icon: string }[] = [
  { id: 'eco', name: 'Господарство', icon: '🏠' }, { id: 'cats', name: 'Котики', icon: '🐱' }, { id: 'light', name: 'Світло', icon: '🔥' },
  { id: 'defense', name: 'Оборона', icon: '🛡️' }, { id: 'decor', name: 'Затишок', icon: '🌷' },
];

// special one-off projects, not placed on the map
export const PROJECTS = {
  hedge: { name: 'Розчистити хащі', icon: '🌿', desc: 'Відкриває Лавандовий Гай: лавандова деревина для башт і рівнів.', cost: { coins: 100 } as Cost, req: [{ b: 'forge' }] as Req[] },
};

// ---------------------------------------------------------------- units
export type UnitKind = 'spear' | 'sling';
export const UNITS: Record<UnitKind, { name: string; icon: string; cost: Cost; time: number; hp: number; dmg: number; rate: number; range: number; speed: number }> = {
  spear: { name: 'Котик-списоносець', icon: '🗡️', cost: { coins: 25, berry: 3 }, time: 8, hp: 22, dmg: 3, rate: 0.8, range: 26, speed: 120 },
  sling: { name: 'Котик-рогатник', icon: '🎯', cost: { coins: 35, meat: 2, plank: 2 }, time: 10, hp: 12, dmg: 2, rate: 1.0, range: 170, speed: 115 },
};

// ---------------------------------------------------------------- hero upgrades (forge)
export interface HeroUpg { id: 'bag' | 'axe' | 'boots' | 'heart' | 'mint'; icon: string; name: string; desc: (lv: number) => string; costs: Cost[]; req?: string }
export const HERO_UPG: HeroUpg[] = [
  { id: 'bag', icon: '🎒', name: 'Бездонний рюкзак', desc: lv => `Місткість ${12 + lv * 6} → ${18 + lv * 6}`, costs: [{ coins: 25 }, { coins: 60, plank: 5 }, { coins: 130, plank: 10 }, { coins: 260, stone: 10 }, { coins: 520, lav: 12 }] },
  { id: 'axe', icon: '🪓', name: 'Сокиропила', desc: lv => `Сила ×${(1 + lv * .6).toFixed(1)} → ×${(1 + (lv + 1) * .6).toFixed(1)}`, costs: [{ coins: 35 }, { coins: 80, plank: 5 }, { coins: 160, stone: 8 }, { coins: 320, lav: 8 }, { coins: 640, lav: 15 }] },
  { id: 'boots', icon: '👢', name: 'Чоботи-скороходи', desc: () => 'Швидкість +12%', costs: [{ coins: 30 }, { coins: 70 }, { coins: 150, plank: 8 }, { coins: 300, fluff: 8 }] },
  { id: 'heart', icon: '❤️', name: 'Міцне серденько', desc: lv => `Життя ${5 + lv} → ${6 + lv}`, costs: [{ coins: 50 }, { coins: 130, fluff: 5 }, { coins: 280, fluff: 10 }, { coins: 550, fluff: 20 }] },
  { id: 'mint', icon: '🌿', name: 'Котяча м\'ятка', desc: () => 'Усі котики +12% швидкості й +2 місця', costs: [{ coins: 120, fluff: 10 }, { coins: 260, fluff: 20 }, { coins: 500, fluff: 35 }], req: 'boss1' },
];

// ---------------------------------------------------------------- nights
export const DAY_LEN = 170, DUSK_LEN = 25, FIRST_DAY_MAX = 420;
export type EnemyKind = 'fluff' | 'horn' | 'shade' | 'boss';
export const ENEMIES: Record<EnemyKind, { name: string; hp: number; r: number; speed: number; dmg: number; wallMul: number; burn: number }> = {
  fluff: { name: 'Пухляк', hp: 6, r: 17, speed: 50, dmg: 4, wallMul: 1, burn: 1 },
  horn: { name: 'Рогатик', hp: 16, r: 22, speed: 40, dmg: 8, wallMul: 3, burn: 0.7 },
  shade: { name: 'Тінь', hp: 5, r: 15, speed: 78, dmg: 6, wallMul: 0.5, burn: 4 },
  boss: { name: 'Звір Блідого Місяця', hp: 200, r: 52, speed: 55, dmg: 12, wallMul: 4, burn: 0.3 },
};
export interface WaveEntry { at: number; kind: EnemyKind; from: string }
export function waveFor(night: number, hasGrove: boolean): { entries: WaveEntry[]; reward: number; title: string; dirs: string[] } {
  const all = hasGrove ? ['E', 'N', 'S', 'W'] : ['E', 'N', 'S'];
  const nd = Math.min(all.length, 1 + Math.ceil(night / 1.5));
  const dirs = all.slice(0, nd);
  const e: WaveEntry[] = [];
  const total = 9 + night * 6;
  // three sub-waves so the night has a rhythm
  for (let i = 0; i < total; i++) {
    const sub = Math.floor(i / (total / 3));
    const kind: EnemyKind = night >= 2 && i % 5 === 4 ? 'shade' : night >= 2 && i % 7 === 6 ? 'horn' : 'fluff';
    e.push({ at: 3 + sub * 22 + (i % Math.ceil(total / 3)) * 1.1, kind, from: dirs[i % dirs.length] });
  }
  const boss = night === 4 || (night > 4 && night % 4 === 0);
  if (boss) e.push({ at: 30, kind: 'boss', from: 'E' });
  e.sort((a, b) => a.at - b.at);
  return { entries: e, reward: 40 + night * 30 + (boss ? 300 : 0), title: boss ? 'Ніч Звіра Блідого Місяця' : `Ніч №${night}`, dirs };
}
