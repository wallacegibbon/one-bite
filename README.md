# ONE BITE · 一口

**English** · [中文: README.zh.md](README.zh.md)

A **voxel** magic exploration game. This world has exactly one magic, and it is a fruit.

Eat it and you become the animal the fruit remembers, reverting after a while. You inherit that animal's body completely — every ability and every fragility. Each animal's fruit only grows on its own ground. Your magic backpack holds **24 fruit slots**, and the rarer the fruit the bigger it is — **you cannot carry all the magic with you**.

What you actually do: find fruit, avoid what can hurt you, and walk somewhere you could not reach until you had the right body. There is nothing behind that waiting to be uncovered.

- Full setting documents: the eight chapters in [`docs/`](docs/), English (the index is below)
- Playable prototype: [`game/index.html`](game/index.html)

## The setting documents

Eight chapters, one language, in `docs/` — the root READMEs (this file and
`README.zh.md`) carry the index in both languages:

| Chapter | Contents |
|---|---|
| [00 — overview and design pillars](docs/00-overview-and-design-pillars.md) | Design pillars, experience goals, anti-goals, MVP boundary |
| [01 — worldview and story](docs/01-worldview-and-story.md) | The valley (it has no name), the Grey Veil, the one magic, its three institutions |
| [02 — map and scenes](docs/02-map-and-scenes.md) | Zone table, ASCII map, vertical layers, fruit gating graph, POIs |
| [03 — characters and creatures](docs/03-characters-and-creatures.md) | Protagonist, NPCs, creatures, attitude matrix, named individuals |
| [04 — fruit and transformation](docs/04-fruit-and-transformation.md) | Full table of the fruits, form abilities, side effects |
| [05 — backpack and storage](docs/05-backpack-and-storage.md) | The storage mechanism (the one open question in the original brief): 3 options compared + the recommended design |
| [06 — life and progression](docs/06-quests-and-progression.md) | the three deeds and what the valley hands over, why there is no main line, the codex, death and time |
| [07 — art, audio, technical](docs/07-art-audio-technical.md) | Voxel art rules, palette, audio, rendering and data structures |

`game/test/docs-sync.js` validates the set against `game/data/`: every number in the chapters is a number in the data, and a drift fails the build.

## Running the prototype

Zero dependencies — double-click `game/index.html`, or:

```bash
cd game && python3 -m http.server 8000   # then open http://localhost:8000/
```

Requires a browser with WebGL 1.0. On first load, 100 chunks are generated across frames (about 1–3 s).

The scripts are read **once**, when the page loads. After changing or pulling the code, **hard-reload** (Ctrl+Shift+R) or close the tab and reopen it: a tab left open keeps running whatever code it was opened with, and the browser may also hand back a cached `game.js`.

## Controls

| Key | Action |
|---|---|
| `WASD` | Move |
| `Space` | Jump / swim (surface) |
| `Shift` | Sprint |
| `Ctrl` / `C` | Sneak / descend |
| `E` | Interact (harvest / open storage / observe a creature) |
| `F` | Use selected item (eat fruit / plant a pit / use a plant) |
| `R` | End the transformation early |
| `V` | First / third person |
| `J` | Codex (fruits / creatures) |
| `H` | Help |
| `N` | Give yourself a name (the valley addresses you by your epithet, not your name) |
| `L` | Switch the interface language (中文 / English) |
| `1`–`9` / mouse wheel | Select item |
| `Ctrl+S` | Save (localStorage; the page also saves itself as it closes or hides) |
| `Esc` | Close panel |
| Storage panel: `E` / `Tab` | Store / retrieve |
| Storage panel: `←` `→` | Select a backpack item; `↑` `↓` select a storage item |

## What the prototype is

- **160×48×160 voxel world, 10 zones**: Starfall Keep (castle on an island), Whisperwood, Glowglade, Echo Hollow, the Deep Grove, Ashscale Ridge, Mirrorlake (underwater, sunken tower, the Frogshall), Lanternrow, the Old Orchard, and the Grey Veil as the border.
- **1 fruit, 1 body, one animal per niche**: the frog owns the shallows and the shore, the lanternfish the open water, and only the frog's is a body you can wear. The rarity ladder has five rungs and the valley currently grows one of them (rare); one fruit occupies 4 of your 24 slots.
- **Transformation**: one body at a time. Eating a second fruit replaces the body you are wearing; the cost is the body you ended early and the fruit you spent.
- **Body abilities the code actually runs**: collision size, walk / swim speed, a turn that is an arc rather than a pivot (every body carries the rate its own record allows, and the animal and the body worn from it carry the same one), jump force, auto step-up, held breath, breathing water, skin that dries out of it, night vision — and the same eye washed out by daylight —, stealth, field of view.
- **2 species, 18 animals**, attitude-driven AI: one of them is a body you can wear, it reacts to the shape you are wearing right now, and no animal hunts you on its own initiative. Danger is the water, the height, the fog, the lamps of Mirrorlake, and what your current body cannot do.
- **Storage**: 24-slot backpack, the main cellar (96 slots, decay ×0.1), and up to 3 cellar trees in the field (24 slots, ×0.33, at least 20 m apart).
- **3 backpack upgrades**: Pouch +6 (storing fruit), Deep Pouch +6 (swimming the lake), Silver Divider (rare fruit costs one slot less, greenhouse) → 36 slots at full upgrade.
- **Spoilage and regrowth**: a picked fruit goes dormant (rarer fruit faster) and can be planted from its pit; fruiting sites bear again after 1 / 1.5 / 2 / 2.5 / 3 game days (±20%), and the regrow queue is saved.
- **No quest list: three deeds the valley notices** (storing fruit / swimming the lake / reaching the greenhouse), each handing over one of the upgrades; a codex, a 420-second day/night cycle, self-lit fruit and the glowcap ring, particles, a rotating minimap, death drops and retrieval, localStorage saves.
- **Identity layer with no fixed protagonist name**: a stable `id` (the world only remembers that), an earned epithet the valley actually uses, and an optional player-chosen name (`N`).
- **Switchable interface language** (中文 / English, `L` or the HUD button): interface text lives in one flat table per language, setting text stays as a `cn`/`en` pair on the record itself, and nothing translated is ever written to the save file (07 §3.4).

## Designed, not built yet

NPC dialogue trees; the HUD bar for the frog body's drying skin (the drying itself runs); procedural audio. The docs also list body costs that no code charges you for yet — claws that cannot open storage, weight that breaks thin ice, being too small to reach high fruit. `game/test/reach.js` prints every field that is declared in the data and not read by the code, so this list can only shrink by something actually being built.

## Cut from the design — not on the roadmap

Mixed forms, the mixed stomach, the magic stomach, beast residue, the twelve side quests, the trading company and its agent, the protagonist's fruit list and its hidden reveal, Empty fruit, the fruit-thief traps, the `strength` and `tongue` abilities, and the pangolin, deer and spider animals. These are decisions, not unfinished work; `game/test/docs-sync.js` fails the build if the first four reappear in the docs.

## Layout

```
docs/            the setting documents (English, 00-07)
game/
  index.html     entry point
  css/ui.css     HUD styles
  data/          source of truth: fruits.js / creatures.js / world.js / player.js / i18n.js
  src/           i18n / engine / world / worldgen / models / entities / game / ui / main
  test/          see below
```

## Tests

```bash
./game/test/all.sh             # the ten checks that must pass; non-zero exit on any failure

node game/test/node-smoke.js   # no browser: data → generation → meshing (fake GL)
node game/test/probe.js        # camera spots and water depth for each zone / POI
node game/test/reach.js        # every declared data field is either read by the code or listed as not built
node game/test/docs-sync.js    # docs ↔ data consistency (exit 1 on drift)
node game/test/docs-drift.js   # self-test: injects 29 errors into the docs, confirms docs-sync catches each one
node game/test/play.js         # gameplay loop: harvest → regrow → capacity → transform → storage → cellar tree → save
node game/test/save.js         # save round trip: write a save, reload, continue from the start screen
node game/test/upgrade.js      # backpack upgrades and slot maths
node game/test/input.js        # real key events: walk / jump / time / Grey Veil border / camera comfort
node game/test/lang.js         # language switch: no raw key on screen, save file identical across languages

node game/test/shots.js g      # 21 screenshots → .shots/ (zones, transformation, UI, identity, one panel per language, dusk)
node game/test/shot.js out.png "pos=136,26,132 cellar=1"   # single shot, for eyeballing
node game/test/heightmap.js    # ASCII dump of the terrain heightmap, for eyeballing
node game/test/meshbench.js    # what a chunk costs to build; a measurement, not a test
```

The ones that need a browser use headless Chrome (`/usr/bin/google-chrome`) and `puppeteer-core`; SwiftShader software rendering is verified to work.
