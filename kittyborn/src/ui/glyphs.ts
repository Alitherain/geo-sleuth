// Monochrome line glyphs (old gold via currentColor) used instead of emoji across the HTML UI.
const S = (d: string, vb = 24) => `<svg class="gl" viewBox="0 0 ${vb} ${vb}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const G = {
  build: S('<path d="M4 20l9-9"/><path d="M12 4l6 6-3 3-6-6z"/><path d="M14 6l3-3 4 4-3 3"/>'),
  full: S('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  sound: S('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11"/>'),
  mute: S('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/>'),
  menu: S('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  close: S('<path d="M6 6l12 12M18 6L6 18"/>'),
  check: S('<path d="M5 12l5 5 9-10"/>'),
  move: S('<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>'),
  trash: S('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  bag: S('<path d="M6 8h12l1 12H5z"/><path d="M9 8V6a3 3 0 016 0v2"/>'),
  sun: S('<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>'),
  dusk: S('<path d="M3 17h18M6 17a6 6 0 0112 0"/><path d="M12 5v3M5 9l2 2M19 9l-2 2"/>'),
  moon: S('<path d="M15 3a8 8 0 100 18 7 7 0 010-18z"/>'),
  fire: S('<path d="M12 3c4 4 6 7 5 11a5 5 0 01-10 0c-1-3 1-5 3-7 0 2 1 3 2 3 1-2 0-5 0-7z"/>'),
  beast: S('<path d="M5 14c0-5 3-8 7-8s7 3 7 8-3 6-7 6-7-1-7-6z"/><path d="M8 7L6 3M16 7l2-4"/><path d="M9 13h1M14 13h1"/>'),
  eco: S('<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-5h4v5"/>'),
  cats: S('<path d="M5 20V9l3-5 2 4h4l2-4 3 5v11z"/><path d="M9 13h1M14 13h1"/>'),
  light: S('<path d="M12 3c4 4 6 7 5 11a5 5 0 01-10 0c-1-3 1-5 3-7 0 2 1 3 2 3 1-2 0-5 0-7z"/>'),
  defense: S('<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/>'),
  decor: S('<path d="M12 21v-8"/><circle cx="12" cy="8" r="3"/><path d="M12 5V3M15 8h2M7 8h2M12 13c-3 0-5 2-5 4M12 13c3 0 5 2 5 4"/>'),
  lock: S('<rect x="5" y="11" width="14" height="9" rx="1"/><path d="M8 11V8a4 4 0 018 0v3"/>'),
};
export type GlyphKey = keyof typeof G;
