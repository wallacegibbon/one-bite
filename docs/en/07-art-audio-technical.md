# 07 · Art · Audio · Technical Plan

[中文: ../cn/07-美术·音频·技术方案.md](../cn/07-美术·音频·技术方案.md)

## 1. Art direction

**Voxel, but not Minecraft.** References: the block language of *Minecraft* + the saturated palette of *Trove* + Ghibli's "plants have intentions".

Three hard rules:

1. **Every plant has something it "wants to do"**: fruit self-glows (wants to be seen), vines grow down (looking for water), mushrooms ring up (claiming ground).
2. **Buildings are grown, not laid**: Lanternrow's houses are timber frames with mossy-soil infill; Starfall Keep is brick plus lumenstone lamps; the Old Orchard stands because of spider silk.
3. **There are only three light sources**: sun/moon, lumenstone and embers (self-lit blocks), creatures (glowing forms, jellyfish, moths, fruit). **There is no ambient fill light** — at night, without a Glowcap, you genuinely cannot see.

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
| `walk` | legs | `rx = sin(t·gait + phase)·move·0.75` |
| `wag` | tail | `ry = sin(t·1.6)·(move·0.5+0.12)` |
| `bob` | head/body | `dy = sin(t·2.2)·(move·0.12+0.05)` |
| `sway` | fins/feathers | `rz = sin(t·2.4)·0.28` |

15 models: human, owl, bat, moth, otter, fox, deer, jelly, merfolk, unicorn, spider, bear, dragon, veilbeast, phoenix.
9 first-person hands: hand, talon, wing, paw, hoof, fin, claw, tentacle, shadow.

## 2. Audio direction (not implemented, full design)

**No soundtrack, only "ambience + material".**

| Layer | Content |
|---|---|
| Bed | wind (loudest on the Cloudspire), water (Mirrorlake), drips (caves), leaf rustle (the Hoar Grove "rings even without wind") |
| Creatures | bat chorus (a 12-part loop; when the player is a bat it joins as the 13th part), single owl notes, low merrow harmonies (only audible underwater) |
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
| `src/models.js` | 15 creature models + 9 hands + part animation matrices |
| `src/entities.js` | Player (AABB collision/breath/flight), Creature (attitude-driven AI), Particles |
| `src/game.js` | main logic: fruit/backpack/spoilage/storage/quests/save/render loop |
| `src/ui.js` | HUD, rotating minimap, item bar, storage panel, codex, help, death |
| `src/main.js` | input bindings, main loop, boot sequence |
| `data/*.js` | **the source of truth**: fruits / creatures / world / player |

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
- `maxY` heightmap: `Uint8Array(w*d)`, speeding up meshing and creature pathing.
- Save: `localStorage['frutaria.save.v1']`, storing only the **block diff** (`diffs`) + player + backpack + storages + regrow queue (`regrow`) + backpack upgrades + quests + time. Measured 1.7 KB.

### 3.4 Known technical debt

| Item | Note |
|---|---|
| No occlusion culling | blocks outside are still drawn while you are inside a cave |
| No async meshing | chunk meshing is budgeted at 22 ms per frame during boot, but player edits rebuild synchronously |
| Creatures have no pathfinding | only "steer toward target + height correction + random deflection on hitting a wall", so they get stuck on terrain |
| No LOD / no streaming | the 160³ world is fully resident in memory; the full scale needs chunk streaming |
| No NPC dialogue trees | Old Mei / Quill / White Dew only have log text, no branching dialogue |
| Cellar trees are never destroyed | the bear/dragon tree-destruction roll is not wired up (raids and owl post are implemented) |
| No identity service | the `id` is generated locally, not issued by a server; cellar trees already carry an `owner`, but the main cellar is communal and there is no sharing-rights model (see 03 §6) |

## 4. Tests

| Script | Purpose |
|---|---|
| `game/test/all.sh` | runs every non-screenshot test; non-zero exit on any failure |
| `game/test/node-smoke.js` | no browser: data → generation → meshing (fake GL), verifies block distribution |
| `game/test/heightmap.js` | prints an ASCII heightmap of the surface |
| `game/test/probe.js` | finds a safe camera spot for every POI/zone |
| `game/test/shots.js` | 14 screenshots in one launch (zones + transformation + UI), checks console errors |
| `game/test/play.js` | the gameplay loop: harvest → capacity → transform → fly → revert → storage → cellar tree → save → quests → ecology |
| `game/test/input.js` | real key events: walk / jump / fly / time bar / Grey Veil border |
| `game/test/upgrade.js` | backpack upgrades: 24→30→36 slots, Silver Divider −1, q7 trigger, save round-trip |
| `game/test/shot.js` | a single screenshot (with coordinates / yaw / form / time / `cellar=1` to open the storage panel), for eyeballing |
| `game/test/docs-sync.js` | **docs ↔ data consistency**: zones/POIs/isles/rarity/storage/cellar-tree rules/key bindings/id coverage, checked for both the Chinese and the English document sets; exit 1 on drift |
| `game/test/docs-drift.js` | **self-test**: injects 13 known errors into `docs/en/` and `docs/` (numbers / names / keys / a missing file / a stray file / a fixed protagonist name) and confirms docs-sync catches every one, then restores |

headless Chrome needs: `--enable-unsafe-swiftshader --use-gl=angle --use-angle=swiftshader` (WebGL 1.0 verified working).
