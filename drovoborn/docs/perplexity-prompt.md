# Промпт для Perplexity

Нижче два промпти. Їх краще запускати окремо (у режимі Research / Deep Research), бо це дві різні теми і кожна дасть більше джерел. Промпти англійською, бо так Perplexity знаходить більше джерел. Відповідь просимо українською.

---

## Промпт 1. Механіки

```
I'm designing a mobile game (Android tablet first, also iPhone via browser) and need a deep, sourced research report. Answer in Ukrainian, keep game titles and technical terms in English.

THE GAME: "Drovoborn" — a cute cozy-gothic parody, top-down 2D, one-thumb controls (floating joystick, all actions automatic when you stand near things). Core loop like the "hybrid-casual" ads that rarely match real gameplay: chop trees -> logs stack on your back -> sell -> buy build pads -> hire helper units (cats) who automate the work -> process resources (sawmill, smokehouse) -> unlock a hunting zone with beasts -> boss. Planned additions: tower defense "horde nights", upgradable buildings, multiple weapons, many unit types, logistics automation, story chapters, 10-20 hours of play.

RESEARCH, with concrete examples from real games and links:

1. The best games that actually deliver this loop (not just in ads). For each: what keeps players for 10+ hours, how progression is paced, what monetization-free design choices matter. Include at least: Idle/arcade "carry stack" games (e.g. Lumber Inc, My Little Universe, Whiteout Survival, Survivor.io), Kingdom Two Crowns, Dome Keeper, Cult of the Lamb, Stardew Valley, Forager, Factorio/Shapez (for logistics), Rimworld/Oxygen Not Included (for worker AI), Vampire Survivors / Brotato (for build variety), Bloodborne (for tone and trick weapons only).

2. Specific mechanic patterns, each with: how it works, which game does it best, pitfalls, how to adapt to one-thumb mobile play:
   a. Resource regrowth and pacing that makes players move to new areas (soil depletion, rarer resources deeper, seasonal yields).
   b. Building upgrade trees (levels, visual changes, branching specializations).
   c. Worker/helper AI and logistics automation that does NOT look stupid: job boards, task claiming, batching trips, priorities, storage hubs, conveyors/carts, player-set rules. How Factorio, Rimworld, Oxygen Not Included, Settlers, Kingdom Two Crowns, Townscaper-likes and idle games solve "units run back and forth for one item".
   d. Horde / tower-defense nights in a base-builder (Kingdom Two Crowns, They Are Billions, Dome Keeper, Thronefall, Bad North): wave pacing, soft failure, towers vs walls vs traps, what the player does during the night.
   e. Weapon variety and upgrades for auto-attack combat: transformable weapons, modifier slots ("stickers"/runes), synergies, active dodge/skill on one button.
   f. Boss design with readable telegraphs for touch screens; unique non-repeating rewards; rematch modifiers.
   g. Long-term progression: chapters/biomes, prestige/New Game+, collections, offline earnings, daily variety without FOMO.
   h. Narrative delivery in casual games: quests, NPC barks, collectible lore notes, light humor/parody.

3. A prioritized list: the 15 mechanics with the best fun-per-development-effort ratio for a solo developer, and 5 traps to avoid.

Format: sections with headings, bullet points, a comparison table where it helps, and sources after each section.
```

---

## Промпт 2. Технології і бібліотеки

```
I'm building a 2D top-down mobile game as a web app (HTML5 canvas, JavaScript) that must run: offline from a single HTML file in a mobile browser, as an Android APK (currently a WebView wrapper), and on iPhone via Safari "Add to Home Screen". Target device: Samsung Galaxy Tab S10+ (2960x1848), also phones. Current version is ~1600 lines of vanilla JS with procedural canvas drawing (no sprites). I want to scale it 10x in content. Answer in Ukrainian, keep library names in English. Give current versions, licenses, bundle sizes and links.

Research and compare:

1. 2D game engines/frameworks for this case: Phaser 3/4, PixiJS (+ @pixi/react?), Kaboom/KAPLAY, Excalibur.js, LittleJS, Godot 4 web export, Defold, Cocos Creator. For each: performance on mid/high Android tablets, touch input, scene/entity structure, tilemaps, cameras, particles, lighting, audio, bundle size, whether it works from a single offline HTML file, ease of APK packaging, iOS Safari quirks, community health in 2025-2026.

2. Packaging to native: Capacitor vs Cordova vs Tauri Mobile vs Trusted Web Activity (Bubblewrap) vs plain WebView. Which gives the least friction for a solo dev, offline support, save data persistence, and later Google Play publishing. Is any route possible to iOS without a Mac?

3. Useful libraries:
   - pathfinding / steering for many units (navmesh, flow fields, A*): e.g. pathfinding.js, easystarjs, navmesh, yuka;
   - ECS libraries (bitecs, miniplex, ecsy) — are they worth it at this scale;
   - tweening/juice (GSAP, tween.js), particles, screen shake;
   - procedural audio / music (Tone.js, ZzFX, jsfxr) and small music-box style generative music;
   - save systems (localStorage vs IndexedDB, idb-keyval, Capacitor Preferences), save export/import;
   - tilemap editors (Tiled, LDtk) and their JS loaders;
   - UI in-game (HTML overlay vs engine UI vs Preact);
   - localization (Ukrainian + English).

4. Art pipeline for a solo developer who wants a consistent cute-gothic chibi look: procedural vector drawing vs SVG sprites vs spritesheets (Aseprite, TexturePacker), skeletal animation (Spine, DragonBones, Rive, Lottie) — cost, runtime size, fit with each engine. Which AI-assisted or free asset sources have licenses safe for a published game.

5. Final recommendation: one concrete stack (engine + packaging + 5-8 libraries) for this project, and a migration plan from vanilla canvas.

Format: comparison tables, short verdicts, sources after each section.
```
