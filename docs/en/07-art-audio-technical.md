# 07 · Art · Audio · Technical Plan

[中文: ../cn/07-美术·音频·技术方案.md](../cn/07-美术·音频·技术方案.md)

## 1. Art direction

**Voxel, but not Minecraft.** References: the block language of *Minecraft* + the saturated palette of *Trove* + Ghibli's "plants have intentions".

Three hard rules:

1. **Every plant has something it "wants to do"**: fruit self-glows (wants to be seen), vines grow down (looking for water), mushrooms ring up (claiming ground).
2. **Buildings are grown, not laid**: Lanternrow's houses are timber frames with mossy-soil infill; Starfall Keep is brick plus lumenstone lamps; the Old Orchard is a ring of broken wall around the oldest tree in the valley.
3. **There are only three light sources**: sun/moon, lumenstone and embers (self-lit blocks), creatures (glowing forms, jellyfish, fruit). **There is no ambient fill light** — at night, without a Glowcap, you genuinely cannot see.

### Palette (the values actually used in the prototype)

| Block | id | RGB |
|---|---|---|
| grass | 1 | side `0.36,0.30,0.22` / top `0.29,0.50,0.24` |
| soil | 2 | `0.40,0.31,0.22` |
| stone | 3 | `0.50,0.50,0.54` |
| water | 5 | `0.13,0.34,0.52` α0.62 |
| leaves / dark leaves / needles / silver leaves / willow leaves | 7/27/8/9/28 | `0.20,0.40,0.18` / `0.12,0.24,0.13` / `0.14,0.30,0.20` / `0.60,0.71,0.68` / `0.33,0.45,0.23` |
| brick / dark brick | 11/12 | `0.56,0.56,0.61` / `0.36,0.36,0.42` |
| roof tile | 13 | `0.47,0.21,0.19` |
| lumenstone (self-lit) | 14 | `1.00,0.86,0.52` |
| snow / cloud | 15/16 | `0.92,0.94,0.98` / `0.94,0.95,1.00` |
| ember (self-lit) | 18 | `1.00,0.44,0.14` |
| glass | 21 | `0.62,0.80,0.92` α0.34 |
| bone | 22 | `0.88,0.86,0.76` |
| mossy soil / carpet moss | 23/30 | `0.25,0.34,0.20` / `0.20,0.38,0.24` |

Rarity ring colours (UI + fruit blocks): `#9ab97e` `#6cb4f0` `#b987f2` `#ff9c4a` `#ffdc5c`.

### Face lighting (baked, not real-time)

Each face gets a fixed brightness by normal, then vertex AO is multiplied in:

| Face | Brightness |
|---|---|
| +Y (top) | 1.00 |
| +Z | 0.88 |
| +X | 0.78 |
| −X | 0.66 |
| −Z | 0.58 |
| −Y (bottom) | 0.42 |

AO has four steps: `[1.00, 0.78, 0.60, 0.46]`, computed from each vertex's three neighbours (edge, edge, corner).

### Creature models

Assembled from voxel parts: one mesh + one pivot + one animation per part.

| Animation | Used for | Formula |
|---|---|---|
| `flap` | wings | `rz = sin(t·spd)·amp`, amp 0.85 (flying) / 0.12 (walking) |
| `walk` | legs | `rx = sin(t·7 + phase)·move·0.75` — one walk rate for every body; the per-species override existed only for the spider and went with it |
| `wag` | tail | `ry = sin(t·1.6)·(move·0.5+0.12)` |
| `bob` | head/body | `dy = sin(t·2.2)·(move·0.12+0.05)` |
| `sway` | fins/feathers | `rz = sin(t·2.4)·0.28` |

5 models: human, owl, frog, jelly, bear.
5 first-person hands: hand, talon, web, claw, tentacle.

## 2. Audio direction (not implemented, full design)

**No soundtrack, only "ambience + material".**

| Layer | Content |
|---|---|
| Bed | wind (loudest on the Cloudspire), water (Mirrorlake), drips (caves), leaf rustle (the Deep Grove "rings even without wind") |
| Creatures | the chorus after rain (a 12-part frog loop; when the player is a frog it joins as the 13th part), single owl notes, low harmonies under water (only audible when submerged) |
| Interaction | picking = a single "pop"; dormancy = a dry crack; transformation = joints rearranging + one breath in |
| UI | codex page turn = paper; cellar door = wood |
| Danger | inside the Grey Veil every sound is "sucked away" (the low-pass cutoff falls to 400 Hz with depth) |

**The audio rule during transformation**: at the instant of transformation, the call of the creature matching the current form plays centred on the player and continues for the whole form duration (volume varies with movement). This makes the player *hear what they are*.

## 3. Technical plan (prototype)

### 3.1 A dependency-free, hand-written WebGL1 renderer

Why not three.js: the prototype must **run by double-clicking `game/index.html`** (under `file://`, ES modules are blocked by CORS), and the voxel rendering requirement is narrow.

All code is classic `<script src>` global scripts hanging off the `window.FRUTARIA` namespace.

| File | Responsibility |
|---|---|
| `src/engine.js` | mat4, MeshBuilder, shaders, Renderer (frustum culling, sky, particles) |
| `src/world.js` | block table, voxel storage, chunked meshing (with AO), DDA ray picking |
| `src/worldgen.js` | value-noise/fbm terrain + structure generation (castle/town/cave/lake/isles/forest) |
| `src/models.js` | 5 models + 5 first-person hands + part animation matrices |
| `src/entities.js` | Player (AABB collision/breath/flight), Creature (attitude-driven AI), Particles |
| `src/game.js` | main logic: fruit/backpack/spoilage/storage/quests/save/render loop |
| `src/ui.js` | HUD, rotating minimap, item bar, storage panel, codex, help, death |
| `src/i18n.js` | locale state and lookup: `t(key)` for interface text, `disp(record)` for setting text |
| `src/main.js` | input bindings, main loop, boot sequence |
| `data/*.js` | **the source of truth**: fruits / creatures / world / player / i18n |

### 3.2 Rendering

- **Chunks**: 16×48×16, 10×10 = 100 chunks. Each chunk has 5 meshes: `[opaque, emissive, water, props, prop-emissive]`.
- **Face culling**: faces adjacent to a solid opaque neighbour are not generated.
- **Frustum culling**: 6 planes extracted from the MVP (row-major rows: `row3 ± row0/1/2`), tested against a sphere per chunk.
- **Emissive layer**: a separate mesh, raised by `emisBoost`, unaffected by day/night lighting.
- **Water**: a separate mesh, blended + vertex waves (`sin(x*0.6+t)+sin(z*0.45-t*1.3)`).
- **Sky**: a full-screen quad, procedural gradient + sun/moon discs + stars.
- **Fog**: exponential, colour follows day/night; underwater changes colour and density; inside the Grey Veil it becomes dense grey fog.
- **Particles**: a single draw call, capped at 900 (glowing seeds, splashes, transformation smoke).

Measured in the prototype (1280×720, SwiftShader software rendering): all 100 chunks built, about 200–300k triangles, 47–400 draw calls, **54–60 fps**.

### 3.3 Data and saving

- Voxels: `Uint8Array(w*h*d)` = 160×48×160 = 1.23 MB.
- **Heightmap**: planned (`Uint8Array(w*d)`), not in the prototype. Bounding the meshing loop with one measured no faster — rebuilding all 100 chunks costs about 1.0 ms per chunk with it or without it — and it has to be right on every block write or geometry gets quietly clipped. Meshing scans the full chunk height; the time goes into the faces, not into the empty sky.
- Save: `localStorage['frutaria.save.v2']`, storing only the **block diff** (`diffs`) + player (position, vitality, current form and its remaining time) + **identity** (`id` / `name`, see 03 §6) + backpack + storages (every field stash records the `owner` id that planted it) + regrow queue (`regrow`) + planting queue (`growQueue`) + fruit scattered by death (`drops`) + plant buffs + owl post + backpack upgrades + quests + time. Measured 2.3 KB with a cellar tree, a sapling and a post in flight.
- A save is **offered back, never silently loaded**: the start screen quotes it (day, hour, pack, trees) and Continue walks you back to it. The town cellar belongs to the valley rather than to the save, so it is rebuilt from the map data and every store is looked up by `id` — a save that lists only cellar trees still has a town to walk into.

### 3.4 Interface language

The interface is switchable between Chinese and English at run time (`L`, or the button in the HUD); the choice is stored in `localStorage['frutaria.locale.v1']` and, on a first visit, taken from the browser language.

Two kinds of text exist and they are translated differently, on purpose:

| Kind | Where it lives | Looked up with | Examples |
|---|---|---|---|
| **interface text** | `data/i18n.js`, one flat key → string table per language | `N.t('hud.cap', {u, c})` | buttons, panels, prompts, log lines |
| **setting text** | on the record itself, in `data/fruits.js` / `creatures.js` / `world.js` / `player.js`, as a `cn` / `en` pair | `N.disp(record)` | a fruit's name and lore, a creature's dex entry, a zone name, an epithet |

Setting text stays next to the thing it describes because those data files are the source of truth the documents are checked against (`docs-sync.js` §7 compares the prose in `docs/cn/` and `docs/en/` with them). If the translations were moved into the language tables, the documents could drift away from the setting unnoticed.

Two consequences worth knowing:

- **Nothing translated is ever stored.** A store has no name of its own — the interface calls it by kind (`store.cellar` / `store.tree`) — and a quest keeps its text next to the check that completes it. So a save written in Chinese loads unchanged in English, and switching language cannot freeze a string into a warehouse. `game/test/lang.js` asserts the save file is byte-identical across languages.
- **Adding a language is one table.** `data/i18n.js` holds `LANGS` plus one object per language; `node-smoke.js` fails the build if the tables do not cover exactly the same keys.

### 3.5 Known technical debt

| Item | Note |
|---|---|
| No occlusion culling | blocks outside are still drawn while you are inside a cave |
| No async meshing | chunk meshing is budgeted at 22 ms per frame during boot; a player edit flags its chunk and the flagged chunks are re-meshed on a 6 ms per frame budget |
| Creatures have no pathfinding | only "steer toward target + height correction + random deflection on hitting a wall", so they get stuck on terrain |
| No LOD / no streaming | the 160³ world is fully resident in memory; the full scale needs chunk streaming |
| No NPC dialogue trees | Old Mei / One-Eye only have log text, no branching dialogue |
| Cellar trees are never destroyed | the bear tear-down roll is not wired up (raids and owl post are implemented) |
| The frog does not dry out on screen | `dryTimer` is in the data and the check is wired up, but there is no skin-moisture bar in the HUD (04 §3) |
| No identity service | the `id` is generated locally, not issued by a server; cellar trees already carry an `owner`, but the main cellar is communal and there is no sharing-rights model (see 03 §6) |
| Only two languages | a third language means one more flat table in `data/i18n.js` plus a third field on every record that carries setting text (`cn` / `en` pairs in the data files) |
| The new hazards are invisible | the ridge cold and the jellyfish sting are rules the code runs, but there is no frost, no breath fog, no HUD cue and no sting animation — the only thing that tells you is a log line, and a player can die of either without ever seeing why |
| Zone prose is never displayed | every zone in `data/world.js` carries a `desc`, and no interface reads it. The map bible in 02 is the only place that writing reaches a reader, and it is Chinese-only, so it is not covered by the language switch either |

## 4. Tests

| Script | Purpose |
|---|---|
| `game/test/all.sh` | runs every non-screenshot test; non-zero exit on any failure |
| `game/test/node-smoke.js` | no browser: data → generation → meshing (fake GL), verifies block distribution |
| `game/test/heightmap.js` | prints an ASCII heightmap of the surface |
| `game/test/probe.js` | finds a safe camera spot for every POI/zone |
| `game/test/shots.js` | 22 screenshots in one launch (zones + transformation + UI + identity + one panel in each language), checks console errors; the language of every shot is pinned, so the set is reproducible on any machine |
| `game/test/play.js` | the gameplay loop: harvest → capacity → transform → fly → revert → storage → cellar tree → save → quests → ecology; plus the world reacting to a body (block edits re-mesh, the breath ceiling, intimidation by species, a unique key per block), **one body at a time** (four fruits eaten in a row: each replaces the body, vitality never moves, each fruit is spent exactly once, and no gastric counter exists), what each quest gate actually requires, how each animal moves and when it is awake, and **the four abilities measured against the body that lacks them** (glide caps the fall at the speed the data promises, the same dark is brighter for an owl while the sky itself does not change, the ridge takes vitality from a human and never from a bear, standing inside a jellyfish costs vitality and a jellyfish body is untouched) |
| `game/test/save.js` | the save round trip: write a save, reload the page, continue from the start screen — identity, backpack, stores, the planting queue, scattered fruit, buffs and the form bar all come back, and a save that lists no town cellar still gets one |
| `game/test/input.js` | real key events: walk / jump / fly / time bar / Grey Veil border |
| `game/test/lang.js` | language switch: every visible string comes from the table in use, no raw key leaks, and the save file is byte-identical across languages |
| `game/test/upgrade.js` | backpack upgrades: 24→30→36 slots, Silver Divider −1, q7 trigger, save round-trip |
| `game/test/shot.js` | a single screenshot (with coordinates / yaw / form / time / `cellar=1` to open the storage panel), for eyeballing |
| `game/test/docs-sync.js` | **docs ↔ data consistency**: zones/POIs/isles/rarity/storage/cellar-tree rules/scale table/key bindings/id coverage, plus the phrases a cut design must never leave behind and the mental-effect vocabulary the setting forbids; checked for both the Chinese and the English document sets; exit 1 on drift |
| `game/test/reach.js` | **data ↔ code consistency**: every field on a fruit, on a fruit's ability block and on a creature must be read by some file in `game/src/`, or sit in a printed `NOT_YET_IMPLEMENTED` list with its reason. An entry that has quietly gone live fails too, so the list can only shrink by being fixed |
| `game/test/docs-drift.js` | **self-test**: injects 24 known errors into `docs/en/` and `docs/` (numbers / names / keys / warehouse rules / a missing file / a stray file / a fixed protagonist name / each of the eight cut-design phrases, four per language) and confirms docs-sync catches every one, then restores |

headless Chrome needs: `--enable-unsafe-swiftshader --use-gl=angle --use-angle=swiftshader` (WebGL 1.0 verified working).
