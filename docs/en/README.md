# FRUTARIA · 万灵果园

**English** · [中文: ../cn/README.md](../cn/README.md)

> A magic world without wands. The magic is not in your hand, it is in your mouth.

A design-document set plus a playable prototype for an open-exploration game in voxel style.

## In one paragraph

You are **Linnaeus**, sixteen, walking into **Frutaria** for the first time. The witches here do not use wands — they **eat fruit and become the animal the fruit remembers**, reverting some time later. The valley is ringed by the **Grey Veil**; inside it are forest, a lake, mountains and floating isles, home to owls, bats, otters, foxes, deer, jellyfish, merrow, unicorns, beamborn spiders, ash bears, veilbeasts, the ash phoenix and dragons. Every animal fruits on its own ground. Your backpack has only **24 fruit slots**, and the more precious the fruit the bigger it is — **you cannot carry all the magic with you**.

## Core loop

```
        ┌──────────────────────────────────────────────────┐
        │                                                  │
   explore terrain → find fruit → pick it (uses slots, starts spoiling) → transform → enter new terrain with a new body
        │                                                  │
        └──── return to the cellar / plant the pit / unlock further areas ←──────┘
```

Three tensions that mesh into each other:

| Tension | Mechanism |
|---|---|
| **The backpack does not fit it all** | Fruit occupies 1/2/4/7/12 slots by rarity, the backpack has 24 → at most 2 legendary fruits at a time |
| **Fruit goes dormant** | A countdown starts when it is picked (common 25 min → legendary 7 min); when dormant it becomes a pit |
| **The body refuses** | Every form has a side effect (photophobia, attraction to light, stealing urge, inability to lie…), transformation is not a pure buff |

## Document index

| File | Contents |
|---|---|
| [00-overview-and-design-pillars.md](00-overview-and-design-pillars.md) | Design pillars, experience goals, anti-goals, MVP boundary |
| [01-worldview-and-story.md](01-worldview-and-story.md) | Frutaria, the Grey Veil, where shape-eating comes from, the Mother Bloom, the main plot |
| [02-map-and-scenes.md](02-map-and-scenes.md) | Zone table, ASCII map, vertical layers, fruit gating graph, POIs |
| [03-characters-and-creatures.md](03-characters-and-creatures.md) | Protagonist, NPCs, 14 creatures, attitude matrix, named individuals |
| [04-fruit-and-transformation.md](04-fruit-and-transformation.md) | Full table of 15 fruits, form abilities, side effects, mixed forms |
| [05-backpack-and-storage.md](05-backpack-and-storage.md) | **The storage mechanism (the one open question in the original brief)**: 3 options compared + the recommended design |
| [06-quests-and-progression.md](06-quests-and-progression.md) | Seven-chapter main line, side quests, codex, progression gating table |
| [07-art-audio-technical.md](07-art-audio-technical.md) | Voxel art rules, palette, audio, rendering and data structures |

The Chinese originals sit in the sibling folder [`docs/cn/`](../cn/README.md): `docs/cn/` is Chinese, `docs/en/` is English, same numbering, same table column order. `game/test/docs-sync.js` validates both sets against `game/data/`.

## Prototype

`game/index.html` — a dependency-free, hand-written WebGL1 voxel renderer. Double-click it (or run `python3 -m http.server` and visit `/game/`).

Implemented: terrain generation (castle/town/lake/caves/isles), 14 creature AIs (attitude-driven), 15 fruits, transformation and ability switching, the 24-slot backpack with spoilage, main cellar + cellar-tree storage, quests, codex, day/night, the Grey Veil border, death drops and retrieval, localStorage saves.

Not implemented (designed in the docs): mixed forms, the magic stomach, beast residue, NPC dialogue trees, phoenix/mother-tree avatar forms, veilbeast slot theft, the merrow restitution system.

## Data *is* the setting

`game/data/fruits.js`, `game/data/creatures.js` and `game/data/world.js` are the **single source of truth**: every number in these documents (slot counts, dormancy times, attitudes, zone radii) comes from those three files. Change the setting by changing the data; the documents are regenerated to follow. `game/test/docs-sync.js` enforces this for both the Chinese and the English set.
