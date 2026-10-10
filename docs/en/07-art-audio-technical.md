# 07 · Art · Audio · Technical Plan

[中文: ../cn/07-美术·音频·技术方案.md](../cn/07-美术·音频·技术方案.md)

## 1. Art direction

**Voxel, but not Minecraft.** References: the block language of *Minecraft* + the saturated palette of *Trove* + Ghibli's "plants have intentions".

Three hard rules:

1. **Every plant has something it "wants to do"**: fruit self-glows (wants to be seen), vines grow down (looking for water), mushrooms ring up (claiming ground).
2. **Buildings are grown, not laid**: Lanternrow's houses are timber frames with mossy-soil infill; Starfall Keep is brick plus lumenstone lamps; the Old Orchard is a ring of broken wall around the oldest tree in the valley.
3. **There are only three light sources**: sun/moon, lumenstone and embers (self-lit blocks), fruit (a fruit block lights itself, and so does one you carry), and one animal (the lamp jellyfish parts are built emissive — but **no body you can wear glows**). **There is no ambient fill light** — at night, without a Glowcap, you genuinely cannot see.

### Palette (the values actually used in the prototype)

| Block | id | RGB |
|---|---|---|
| grass | 1 | side `0.36,0.30,0.22` / top `0.29,0.50,0.24` |
| soil | 2 | `0.40,0.31,0.22` |
| stone | 3 | `0.50,0.50,0.54` |
| water | 5 | `0.13,0.34,0.52` α0.72 |
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

That table is for blocks with hard edges. A block may declare `soft: 1` instead, and then it keeps the same ordering of faces but never drops below **0.74** and takes no AO at all (`SOFT_S = 0.55 + 0.45·s`). Cloud (16) is the one that needed it: cloud is a block, so it went through the face table and the ambient occlusion of the cloud deck around it, and a bottom face in the shade of the block above measured 0.42 × 0.46 = 0.19 of its own colour. Cloud is 94% white, so the result was a dark grey lump floating in a bright sky — a black block in the sky, which is what it looked like. Measured in the frame: a cloud now averages **113** against the sky's 92; with the flag removed it averaged **70**, darker than the sky behind it. The Grey Veil wall is built out of the same block, so the veil reads as pale mist columns rather than as stone.

### Creature models

Assembled from voxel parts: one mesh + one pivot per part. A part may name a `parent`, so a limb has a joint -- shoulder to elbow, hip to knee. Parts are authored in the bind pose, and for the owl the bind pose is the folded wing: a perched owl is the shape you look at most of the day.

**Every model faces +Z**, and a heading of `yaw` in this game means the direction `(sin yaw, -cos yaw)`: yaw 0 is north (-Z) and yaw grows toward +X. The rotation that carries +Z onto a heading is therefore `PI - yaw`, and it exists in exactly one place, `M4.faceY`. Writing `yaw + PI` -- which all three call sites used to -- is exact only when heading due north or due south, and mirrors the body about the Z axis everywhere else: seen from behind, a body walking east showed its face, in first person the hand pointed sideways, and every animal in the valley walked backwards whenever it headed east or west. The `camera` step's angle checks cannot see it, because a mirrored model has the same angles, so `game/test/play.js` reads the frame: it stands the body at each of the four cardinal headings with the lens behind it, projects the head to the screen, and demands the back of the head -- hair, not a face -- at every one of them.

| Animation | Used for | Formula |
|---|---|---|
| `flap` | upper wing | `rz = −sign·beat·(0.22+0.78·air)`, `beat = sin(t·11)`, the downstroke full and the recovery 0.42 of it. A symmetric sine is a windmill; a hard downstroke and a soft recovery is a wing |
| `fold` | forewing, parented to the wing | folds on the upstroke only: `rz = sign·(beat<0 ? −beat·0.5 : 0)·air` |
| `walk` | thigh / upper arm | `rx = sign·sin(t·7+phase)·move·0.75` — one walk rate for every body; the per-species override existed only for the spider and went with it |
| `knee` | shin | a knee bends one way only: `rx = sign·(0.25+0.85·max(0,sin(t·7+phase)))·(0.35+0.65·move)` |
| `elbow` | forearm | a small follow-through on the swing |
| `twist` | torso | `ry = sin(t·7+phase+π)·move·0.16` — the shoulders counter-swing the legs |
| `nod` | head | `rx = sin(t·1.9)·(move·0.06+0.02)` |
| `wag` | tail | `ry = sin(t·1.6)·(move·0.5+0.12)` |
| `bob` | body | in the air it **is** the wing beat: `dy = −max(0,beat)·0.16`, the body drops as the wings push down. Two unrelated sines is what made a flying body look like a body with two loose parts bolted to it. On foot `dy = sin(t·2.2)·(move·0.12+0.05)` |
| `pulse` | the frog's throat, the jellyfish bell | a scale, not a rotation |

A part may also declare `air:[rx,ry,rz]` and `crouch:[rx,ry,rz]`: the pose it takes when the body is off the ground, and when its legs are loaded. The weights come from the physics, not from a guess about which animal is being drawn -- `air` is how far off the ground the body actually is, `crouch` how long its feet have been down since the last launch, and `squash` the speed it arrived at the ground with, applied to the whole body as a scale. A body that does not hop is never animated as if it did.

A model carries **no scale of its own**. One number sizes a body: the collision box in `data/creatures.js` (`size`, in metres). The model is authored in unit boxes, and the creature's `scale` turns them into metres — so the model and the box are the same body twice, and if they disagree the player is clipped by geometry they can see themselves not touching. `game/test/node-smoke.js` measures every model against the box its creature declares and fails the build when it overhangs: the model's horizontal radius may exceed the box's half-width by at most 0.1 m, its top the box's height by at most 0.06 m. A **radius**, not a width, because the box is a square footprint that does not turn with the body — a model that fits face-on still sticks through a wall sideways. Before the gate existed the bear reached 1.26 m from its centre while its box was 0.70 m across: 0.56 m of bear inside the wall it was leaning against, and the frog's snout 0.13 m past its own box.

The lamp jellyfish is the one model with **no box to be measured against**: nothing in the game collides with it (you swim through the lamps), and it bears no fruit, so no player ever wears it. It is checked against the size the codex gives it instead — **0.61 m across, 0.74 m from the top of the dome to the tip of the longest arm**, measured at its `scale` of 0.16.

5 models: human, owl, frog, bear, jelly.
4 first-person hands: hand, talon, web, claw.

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
| `src/models.js` | 4 models + 4 first-person hands + part animation matrices (with a parent chain, so limbs have joints) |
| `src/entities.js` | Player (AABB collision/breath/flight), Creature (attitude-driven AI), Particles |
| `src/game.js` | main logic: fruit/backpack/spoilage/storage/quests/save/render loop |
| `src/ui.js` | HUD, rotating minimap, item bar, storage panel, codex, help, death |
| `src/i18n.js` | locale state and lookup: `t(key)` for interface text, `disp(record)` for setting text |
| `src/main.js` | input bindings, main loop, boot sequence |
| `data/*.js` | **the source of truth**: fruits / creatures / world / player / i18n |

### 3.2 Rendering

- **Chunks**: 16×48×16, 10×10 = 100 chunks. Each chunk has 6 meshes: `[opaque, emissive, water, props, prop-emissive, glass]`.
- **Face culling**: faces adjacent to a solid opaque neighbour are not generated.
- **Frustum culling**: 6 planes extracted from the MVP (row-major rows: `row3 ± row0/1/2`), tested against a sphere per chunk.
- **Emissive layer**: a separate mesh, raised by `emisBoost`, unaffected by day/night lighting.
- **Water**: a separate mesh, blended with the alpha the block table gives it — `BLOCKS[WATER].alpha` is folded into the fourth byte of the vertex colour once, by `def()`, and is no longer written down a second time at the draw call. It says **0.72**: at 0.62 the lakebed kept 38% of its own contrast seen through the surface, and the lake read as a pit in the ground rather than as water. Vertex waves: `sin(t*1.7 + x*0.9 + z*0.7)*0.055 + sin(t*0.6 + z*0.25)*0.03`.
- **Glass**: `BLOCKS[GLASS].alpha` has said 0.34 since the first commit and nothing ever read it. Glass rode in the opaque mesh, so the castle greenhouse, the windows of the sunken tower and every window in Lanternrow were painted blue-grey slabs you could not see through and could not walk into. A block that is neither opaque nor liquid now rides a sixth mesh of its own, drawn after the bodies so the depth they wrote decides whether a body shows through a window, and its alpha arrives as the fourth byte of the vertex colour. Faces between two neighbouring blocks of the same transparent kind are still culled, so a wall of glass is one pane thick rather than one pane per brick.
- **The lake has a colour from the shore**: the water surface used to be the only blended draw in the game, and the world shader divided the alpha byte by 255 *after* the attribute pointer had already normalized it, which left the surface 0.4% opaque. Standing outside Mirrorlake you saw no lake at all, and the only water with a colour was the fog you breathe with your head under. Every other test reads the world; this one has to read the frame: draw, draw again with the water meshes switched off, and the two frames must differ -- and differ towards the water's own blue. The same pair of frames answers a second question, which is how much of the bottom survives the surface: the spread of luminance seen through the water over the spread of the same pixels with the water off has to stay under **0.34** (0.72 measures 0.29, the old 0.62 measured 0.38).
- **Sky**: a full-screen quad, procedural gradient + sun/moon discs + stars. The quad rebuilds a view direction per pixel from the camera basis — `vDir = normalize(uFwd + uRight·aCorner.x·tanX + uUp·aCorner.y·tanY)` — so the basis the renderer hands the shader has to be the same handedness the view matrix was built from. It was not: `begin()` computed `up = fwd × right`, which is `right × fwd` (what `M4.lookYaw` uses) negated. Only the sky reads `up`, so every block, body and particle was where it should be while the sky alone was mirrored about the horizon: the top of the screen sampled *below* the horizon and got the ground colour, and the sun's glow sat under the horizon. At 07:00, lens level, facing the sun's azimuth with the sun 31° up, the brightest pixel in a 300 px frame sat 135 px below the centre. Stars are gated on the sun being **down** (`smoothstep` on `-uSunDir.y`), not on `uNight`: the day/night curve is symmetric about noon, so at 07:00 `uNight` still says 37% night while the sun is 29° up, and 217 star spikes were measured in a daylight sky next to the sun.
- **Fog**: exponential, colour follows day/night; underwater changes colour and density; inside the Grey Veil it becomes dense grey fog.
- **Particles**: a single draw call, capped at 900 (glowing seeds, splashes, transformation smoke).
- **Camera**: the lens points exactly where the mouse points, in both views. What trails behind is the body (`faceYaw`), which has mass. A lens that eased toward the aim was the bug: W ran off in a direction the screen was not pointing at, and the highlight box sat over a block the crosshair was not on. `cam.yaw` / `cam.pitch` are gone — the only camera state left is the distance and the field of view, both eased.
- **Third-person distance**: `1.5 + 2.25 × height`, eased, plus 8° of field of view — the subject keeps roughly the same share of the frame whether it is a frog or a bear.
- **Occlusion**: a DDA from the subject toward the lens, solid blocks only (fruit and reeds must not blind the camera). The lens is backed off to the hit block's **near face** minus 0.2 m, never closer than 0.55 m.
- **Inside your own body**: pulled in that far, the lens is inside the box it is filming, so the body is not drawn — otherwise you are looking at the inside of your own skull.
- **One camera per frame**: `update()` shoots it once (`_camFrame`) and the picking ray, the highlight box, the interaction prompt and `render()` all read that same frame. The ray starts at the lens in third person and at the eye in first, but reach (5.5 m) is always measured from the body, never from the lens.
- **The opening frame belongs to the map**: `generate()` decides where the game opens **and which way the lens is turned**, and hands it over as `N.spawn` with a `yaw` on it; `init()` uses that yaw instead of a constant. The old rule only tested the column the player lands in and the two beside it — it never tested the direction the camera is pointing at open. It accepted a spot half a block from the main cellar's dark brick box, and 91% of the first frame was a wall 0.6 m away at a mean luminance of 57/255 with no sky in it at all. Walking away is what made it look better a few seconds later. The rule now casts a fan of rays (8×10, 76° field, 1.6 aspect) in each of the four cardinal directions from every street column near the cellar door, and takes the nearest column where at least one direction has **≥8% sky and ≤15% of pixels closer than 2 m**; if the village ever gets dense enough that no column passes, it takes the least bad one (≥3% sky, ≤30%) rather than dropping the player through a wall. Lanternrow now opens on the lantern road, 6.0 blocks from the cellar door, looking west along it. One lantern post is skipped along the way: the spacing put a post at x = 136, which is the cellar door's own column, so the door opened onto a lamp. `node-smoke.js` checks the spawn column is not buried and that the sight line is clear for 3 blocks — but that check passed on the old spot too, because its sight line went straight through the open doorway; only the frame check in `play.js` (the **whole** frame, not its upper half) sees a face pressed against a wall.

Measured in the prototype (1280×720, SwiftShader software rendering): all 100 chunks built, about 200–300k triangles, 47–400 draw calls, **54–60 fps**.

### 3.3 Data and saving

- Voxels: `Uint8Array(w*h*d)` = 160×48×160 = 1.23 MB.
- **Heightmap**: planned (`Uint8Array(w*d)`), not in the prototype. Bounding the meshing loop with one measured no faster — rebuilding all 100 chunks costs about 1.0 ms per chunk with it or without it — and it has to be right on every block write or geometry gets quietly clipped. Meshing scans the full chunk height; the time goes into the faces, not into the empty sky.
- Save: `localStorage['frutaria.save.v3']`, storing only the **block diff** (`diffs`) + player (position, vitality, current form and its remaining time) + **identity** (`id` / `name`, see 03 §6) + backpack + storages (every field stash records the `owner` id that planted it) + regrow queue (`regrow`) + planting queue (`growQueue`) + fruit scattered by death (`drops`) + plant buffs + owl post + backpack upgrades + quests + time. Measured 2.3 KB with a cellar tree, a sapling and a post in flight.
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
| The new hazards are invisible | the ridge cold is a rule the code runs, but there is no frost, no breath fog and no HUD cue — the only thing that tells you is a log line, and a player can die of it without ever seeing why; the owl's daylight glare is nothing but one more layer of fog |
| Zone prose is never displayed | every zone in `data/world.js` carries a `desc`, and no interface reads it. The map bible in 02 is the only place that writing reaches a reader, and it is Chinese-only, so it is not covered by the language switch either |

## 4. Tests

| Script | Purpose |
|---|---|
| `game/test/all.sh` | runs every non-screenshot test; non-zero exit on any failure |
| `game/test/node-smoke.js` | no browser: data → generation → meshing (fake GL), verifies block distribution |
| `game/test/heightmap.js` | prints an ASCII heightmap of the surface |
| `game/test/probe.js` | finds a safe camera spot for every POI/zone |
| `game/test/shots.js` | 23 screenshots in one launch (zones + the four bodies seen from behind + UI + identity + one panel in each language), checks console errors; the language of every shot is pinned, so the set is reproducible on any machine |
| `game/test/play.js` | the gameplay loop: harvest → capacity → transform → fly → revert → storage → cellar tree → save → quests → ecology; plus the world reacting to a body (block edits re-mesh, the breath ceiling, intimidation by species, a unique key per block), **one body at a time** (three fruits eaten in a row: each replaces the body, vitality never moves, each fruit is spent exactly once, and no gastric counter exists), what each quest gate actually requires, how each animal moves and when it is awake, and **the three abilities measured against the body that lacks them** (glide caps the fall at the speed the data promises, the same dark is brighter for an owl while the sky itself does not change, the ridge takes vitality from a human and never from a bear), and **the lamps of Mirrorlake** — an animal with no fruit: ten of them, never out of the water, never off the sunken tower, and one answer whatever body you are wearing; the sting, which costs a dive its breath but never a frog body; and **the frame itself** (the lake must change the pixels seen from outside it, and change them towards the colour of water; and from behind, at every cardinal heading, the head must be the back of the head; and a lamp set behind glass must be seen **through** the glass, dimmed by it, and different again from the pane itself; and **the frame the game actually opens on** — whole, not its upper half — must have sky in it and almost nothing within two metres; a cloud must be brighter than the sky behind it; the sky must not be mirrored about the horizon; stars may only appear once the sun is out of the sky, not merely low in it; and the clock's phase word must say dawn in the morning and dusk in the evening) |
| `game/test/save.js` | the save round trip: write a save, reload the page, continue from the start screen — identity, backpack, stores, the planting queue, scattered fruit, buffs and the form bar all come back, and a save that lists no town cellar still gets one |
| `game/test/input.js` | real key events: walk / jump / fly / time bar / Grey Veil border |
| `game/test/lang.js` | language switch: every visible string comes from the table in use, no raw key leaks, and the save file is byte-identical across languages |
| `game/test/upgrade.js` | backpack upgrades: 24→30→36 slots, Silver Divider −1, q6 trigger, save round-trip |
| `game/test/shot.js` | a single screenshot (with coordinates / yaw / form / time / `cellar=1` to open the storage panel), for eyeballing |
| `game/test/docs-sync.js` | **docs ↔ data consistency**: zones/POIs/isles/rarity/storage/cellar-tree rules/scale table/key bindings/id coverage, plus the phrases a cut design must never leave behind and the mental-effect vocabulary the setting forbids; checked for both the Chinese and the English document sets; exit 1 on drift |
| `game/test/reach.js` | **data ↔ code consistency**: every field on a fruit, on a fruit's ability block and on a creature must be read by some file in `game/src/`, or sit in a printed `NOT_YET_IMPLEMENTED` list with its reason. An entry that has quietly gone live fails too, so the list can only shrink by being fixed |
| `game/test/docs-drift.js` | **self-test**: injects 24 known errors into `docs/en/` and `docs/` (numbers / names / keys / warehouse rules / a missing file / a stray file / a fixed protagonist name / each of the eight cut-design phrases, four per language) and confirms docs-sync catches every one, then restores |

headless Chrome needs: `--enable-unsafe-swiftshader --use-gl=angle --use-angle=swiftshader` (WebGL 1.0 verified working).
