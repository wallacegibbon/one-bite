# FRUTARIA · 万灵果园

**English** · [中文: README.zh.md](README.zh.md)

A **voxel** magic exploration game. This world has exactly one magic, and it is a fruit.

Eat it and you become the animal the fruit remembers, reverting after a while. You inherit that animal's body completely — every ability and every fragility. Each animal's fruit only grows on its own ground. Your magic backpack holds **24 fruit slots**, and the rarer the fruit the bigger it is — **you cannot carry all the magic with you**.

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
| `1`–`9` / mouse wheel | Select item |
| `F5` | Save (localStorage) |
| `Esc` | Close panel |
| Storage panel: `E` / `Tab` | Store / retrieve |
| Storage panel: `←` `→` | Select a backpack item; `↑` `↓` select a storage item |
| Storage panel: `P` | Have the owl carry the 1 selected fruit back to the main cellar (cellar trees only) |

## Implemented in the prototype

- 160×48×160 voxel world: Starfall Keep (castle), Whisperwood, Glowglade, Echo Hollow, the Hoar Grove, Ashscale Ridge, Mirrorlake (underwater / sunken tower / merrow village), Lanternrow, the Old Orchard, 6 Cloudspire isles, Grey Veil border
- 15 fruits (5 rarity tiers → 1/2/4/7/12 slots), spoilage → pit → planting
- Transformation: 14 forms, ability switching (size/speed/jump/swim/fly/glide/night vision/climb/glow/intimidate/underwater breathing…) + side effects
- 24-slot backpack + main cellar (96 slots, decay ×0.1) + cellar trees (24 slots, ×0.33, max 3)
- 3 backpack upgrades: Pouch +6 (q1 reward), Deep Pouch +6 (sunken tower), Silver Divider (rare and above occupy −1 slot, greenhouse) → 36 slots at full upgrade
- Fruit blocks regrow by rarity (1 / 1.5 / 2 / 2.5 / 3 game days, ±20%); the regrow queue is saved
- Cellar-tree raids: 30% roll per game day, a badger or a fruit thief steals 1–3 fruits; the player within 45 m always scares them off (the main cellar is guarded by Old Mei and is never raided)
- Owl post: cellar tree → main cellar, 1 fruit / 3 game days / 10% lost, decays at ×0.1 in flight, at most 3 in transit
- 14 creatures, attitude-driven AI (they react to *the shape you are in right now*)
- Identity layer with **no fixed protagonist name**: a stable `id` (stored by the world, cellar trees carry an `owner`), an earned epithet the valley actually uses, and an optional player-chosen name (press `N`) — designed so it survives a move to multiplayer
- Day/night cycle (420 s per day), self-lit fruit and plants, particles, rotating minimap, codex, 7 quests, death drops and retrieval, save game

## Not implemented (but designed in the docs)

Mixed forms, the full magic-stomach rules, beast residue, NPC dialogue trees, veilbeast slot theft, the merrow restitution system, phoenix/mother-tree avatar forms, cellar trees destroyed by bear or dragon, audio.

## Layout

```
docs/cn/         setting documents in Chinese (8 + index)
docs/en/         the same documents in English, same numbering
game/
  index.html     entry point
  css/ui.css     HUD styles
  data/          source of truth: fruits.js / creatures.js / world.js
  src/           engine / world / worldgen / models / entities / game / ui / main
  test/          node-smoke / heightmap / probe / docs-sync / shots / play / input / upgrade
```

## Tests

```bash
./game/test/all.sh             # run every non-screenshot test; non-zero exit on any failure

node game/test/node-smoke.js   # no browser: data → generation → meshing (fake GL)
node game/test/probe.js        # camera spots and water depth for each zone / POI
node game/test/docs-sync.js    # docs ↔ data consistency (exit 1 on drift, both languages)
node game/test/docs-drift.js   # self-test: injects 15 errors into docs/en/ and docs/, confirms docs-sync catches them
node game/test/play.js         # gameplay loop: harvest → respawn → capacity → transform → storage → cellar tree → raid → post → save
node game/test/upgrade.js      # backpack upgrades and slot maths
node game/test/input.js        # real key events: walk / jump / fly / time / Grey Veil border
node game/test/shots.js g      # 16 screenshots → .shots/ (zones, transformation, UI, identity)
node game/test/shot.js out.png "pos=136,26,132 cellar=1"   # single shot, for eyeballing
```

The last five need headless Chrome (`/usr/bin/google-chrome`) and `puppeteer-core`; SwiftShader software rendering is verified to work.
