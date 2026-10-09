# FRUTARIA · 果灵谷

**English** · [中文: README.zh.md](README.zh.md)

A **voxel** magic exploration game. This world has exactly one magic, and it is a fruit.

Eat it and you become the animal the fruit remembers, reverting after a while. You inherit that animal's body completely — every ability and every fragility. Each animal's fruit only grows on its own ground. Your magic backpack holds **24 fruit slots**, and the rarer the fruit the bigger it is — **you cannot carry all the magic with you**.

What you actually do: find fruit, avoid what can hurt you, and walk somewhere you could not reach until you had the right body. There is nothing behind that waiting to be uncovered.

- Full setting documents: [`docs/en/`](docs/en/README.md) (English) · [`docs/cn/`](docs/cn/README.md) (中文)
- Playable prototype: [`game/index.html`](game/index.html)

## Running the prototype

Zero dependencies — double-click `game/index.html`, or:

```bash
cd game && python3 -m http.server 8000   # then open http://localhost:8000/
```

Requires a browser with WebGL 1.0. On first load, 100 chunks are generated across frames (about 1–3 s).

## Controls

| Key | Action |
|---|---|
| `WASD` | Move |
| `Space` | Jump / fly (ascend) / swim (surface) |
| `Shift` | Sprint |
| `Ctrl` / `C` | Sneak / descend |
| `E` | Interact (harvest / open storage / observe a creature) |
| `F` | Use selected item (eat fruit / plant a pit / use a plant) |
| `R` | End the transformation early |
| `V` | First / third person |
| `J` | Codex (fruits / creatures / quests) |
| `H` | Help |
| `N` | Give yourself a name (the valley addresses you by your epithet, not your name) |
| `L` | Switch the interface language (中文 / English) |
| `1`–`9` / mouse wheel | Select item |
| `F5` | Save (localStorage) |
| `Esc` | Close panel |
| Storage panel: `E` / `Tab` | Store / retrieve |
| Storage panel: `←` `→` | Select a backpack item; `↑` `↓` select a storage item |
| Storage panel: `P` | Have the owl carry the 1 selected fruit back to the main cellar (cellar trees only) |

## What the prototype is

- **160×48×160 voxel world, 11 zones**: Starfall Keep (castle on an island), Whisperwood, Glowglade, Echo Hollow, the Deep Grove, Ashscale Ridge, Mirrorlake (underwater, sunken tower, the Frogshall), Lanternrow, the Old Orchard, the Cloudspire isles (6), and the Grey Veil as the border.
- **3 fruits, 3 bodies, one animal per niche**: owl, frog, bear. The rarity ladder has five rungs and the valley currently grows three of them (common / rare / legendary); one fruit occupies 1, 4 or 12 of your 24 slots.
- **Transformation**: one body at a time. Eating a second fruit replaces the body you are wearing; the cost is the body you ended early and the fruit you spent.
- **Body abilities the code actually runs**: collision size, walk / swim / fly speed, jump force, auto step-up, gliding (an owl that stops flapping comes down at a third of your speed), held breath, breathing water, skin that dries out of it, night vision — and the same eye washed out by daylight —, stealth, intimidation radius, immunity to the ridge cold, field of view, first-person hand.
- **3 species, 20 animals**, attitude-driven AI: they react to the shape you are wearing right now, and no animal hunts you on its own initiative. Danger is the water, the height, the cold, the fog, and what your current body cannot do.
- **Storage**: 24-slot backpack, the main cellar (96 slots, decay ×0.1), and up to 3 cellar trees in the field (24 slots, ×0.33, at least 20 m apart).
- **3 backpack upgrades**: Pouch +6 (first quest), Deep Pouch +6 (sunken tower), Silver Divider (rare fruit costs one slot less, greenhouse) → 36 slots at full upgrade.
- **Spoilage and regrowth**: a picked fruit goes dormant (rarer fruit faster) and can be planted from its pit; fruiting sites bear again after 1 / 1.5 / 2 / 2.5 / 3 game days (±20%), and the regrow queue is saved.
- **Cellar-tree raids**: one roll per game day, 30%, a bear or a fruit thief takes 1–3 fruits; you within 45 m always scare it off. The main cellar is guarded by Old Mei and is never robbed.
- **Owl post**: cellar tree → main cellar, 1 fruit per 3 game days, 10% lost, at most 3 in transit.
- **6 quests**, a codex, a 420-second day/night cycle, self-lit fruit and plants, particles, a rotating minimap, death drops and retrieval, localStorage saves.
- **Identity layer with no fixed protagonist name**: a stable `id` (the world only remembers that), an earned epithet the valley actually uses, and an optional player-chosen name (`N`).
- **Switchable interface language** (中文 / English, `L` or the HUD button): interface text lives in one flat table per language, setting text stays as a `cn`/`en` pair on the record itself, and nothing translated is ever written to the save file (07 §3.4).

## Designed, not built yet

NPC dialogue trees; a cellar tree being torn down by a bear; the HUD bar for the frog body's drying skin (the drying itself runs); procedural audio. The docs also list body costs that no code charges you for yet — claws that cannot open storage, weight that breaks thin ice, being too small to reach high fruit. `game/test/reach.js` prints every field that is declared in the data and not read by the code, so this list can only shrink by something actually being built.

## Cut from the design — not on the roadmap

Mixed forms, the magic stomach, beast residue, the twelve side quests, the trading company and its agent, the protagonist's fruit list and its hidden reveal, Empty fruit, the fruit-thief traps, the `strength` and `tongue` abilities, and the pangolin, deer, spider and lamp jellyfish animals. These are decisions, not unfinished work; `game/test/docs-sync.js` fails the build if the first four reappear in either language.

## Layout

```
docs/cn/         setting documents in Chinese (8 + index)
docs/en/         the same documents in English, same numbering
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
node game/test/docs-sync.js    # docs ↔ data consistency, both languages (exit 1 on drift)
node game/test/docs-drift.js   # self-test: injects 24 errors into the docs, confirms docs-sync catches each one
node game/test/play.js         # gameplay loop: harvest → regrow → capacity → transform → storage → cellar tree → raid → post → save
node game/test/save.js         # save round trip: write a save, reload, continue from the start screen
node game/test/upgrade.js      # backpack upgrades and slot maths
node game/test/input.js        # real key events: walk / jump / fly / time / Grey Veil border / camera comfort
node game/test/lang.js         # language switch: no raw key on screen, save file identical across languages

node game/test/shots.js g      # 20 screenshots → .shots/ (zones, transformation, UI, identity, one panel per language)
node game/test/shot.js out.png "pos=136,26,132 cellar=1"   # single shot, for eyeballing
node game/test/heightmap.js    # ASCII dump of the terrain heightmap, for eyeballing
node game/test/meshbench.js    # what a chunk costs to build; a measurement, not a test
```

The ones that need a browser use headless Chrome (`/usr/bin/google-chrome`) and `puppeteer-core`; SwiftShader software rendering is verified to work.
