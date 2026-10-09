# ONE BITE · 一口

**English** · [中文: ../cn/README.md](../cn/README.md)

> A world with exactly one magic, and that magic is fruit. It is not in your hand, it is in your mouth.

A design-document set plus a playable prototype for an open-exploration game in voxel style.

## In one paragraph

You are **a sixteen-year-old forager** (the name is yours to choose — the valley does not address people by name), walking into **the valley** for the first time. There is exactly one magic here: you **eat fruit and become the animal the fruit remembers**, reverting some time later, and you inherit that body completely — every ability, every fragility, while your mind stays your own. The valley is ringed by **grey fog**; inside it are forest, a lake, mountains and floating isles, and every animal lives on its own ground (the roster is in 03). Every animal fruits on its own ground. Your backpack has only **24 fruit slots**, and the more precious the fruit the bigger it is — **you cannot carry all the magic with you**.

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
| **You inherit all of it** | Transformation is inheritance: you get everything that animal can do and everything it cannot (claws cannot open storage, antlers will not fit a low hole, skin cracks out of water…). The mind is untouched — you still decide what to do |

## Document index

| File | Contents |
|---|---|
| [00-overview-and-design-pillars.md](00-overview-and-design-pillars.md) | Design pillars, experience goals, anti-goals, MVP boundary |
| [01-worldview-and-story.md](01-worldview-and-story.md) | The valley (it has no name), the Grey Veil, the one magic, its three institutions |
| [02-map-and-scenes.md](02-map-and-scenes.md) | Zone table, ASCII map, vertical layers, fruit gating graph, POIs |
| [03-characters-and-creatures.md](03-characters-and-creatures.md) | Protagonist, NPCs, 3 creatures, attitude matrix, named individuals |
| [04-fruit-and-transformation.md](04-fruit-and-transformation.md) | Full table of 3 fruits, form abilities, side effects |
| [05-backpack-and-storage.md](05-backpack-and-storage.md) | **The storage mechanism (the one open question in the original brief)**: 3 options compared + the recommended design |
| [06-quests-and-progression.md](06-quests-and-progression.md) | The six invitations, why there are no side quests, the codex, death and time |
| [07-art-audio-technical.md](07-art-audio-technical.md) | Voxel art rules, palette, audio, rendering and data structures |

The Chinese originals sit in the sibling folder [`docs/cn/`](../cn/README.md): `docs/cn/` is Chinese, `docs/en/` is English, same numbering, same table column order. `game/test/docs-sync.js` validates both sets against `game/data/`.

## Prototype

`game/index.html` — a dependency-free, hand-written WebGL1 voxel renderer. Double-click it (or run `python3 -m http.server` and visit `/game/`).

Implemented: terrain generation (castle/town/lake/caves/isles), 3 creature AIs (attitude-driven), 3 fruits, transformation and ability switching, the 24-slot backpack with spoilage, main cellar + cellar-tree storage, quests, codex, day/night, the Grey Veil border, death drops and retrieval, the identity layer (id / epithet / name — the protagonist has no fixed name), a switchable interface language (中文 / English, 07 §3.4), localStorage saves.
Not implemented (designed in the docs): NPC dialogue trees, cellar trees being torn down by bears, the skin-moisture bar for the frog form, procedural audio.

## Data *is* the setting

`game/data/fruits.js`, `game/data/creatures.js`, `game/data/world.js` and `game/data/player.js` are the **single source of truth**: every number in these documents (slot counts, dormancy times, attitudes, zone radii, the epithet table) comes from those four files. Change the setting by changing the data; the documents are regenerated to follow. `game/test/docs-sync.js` enforces this for both the Chinese and the English set.
