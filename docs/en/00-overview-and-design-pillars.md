# 00 · Overview and Design Pillars

[中文: ../cn/00-总览与设计支柱.md](../cn/00-总览与设计支柱.md)

## 1. The original brief (given by the user, with the revisions from this pass)

1. A magic exploration game, **voxel style**: the map skeleton of castle / forest / lake / sky.
2. Scenes: **castle, forest, lake, sky**, freely explorable.
3. The forest holds **unicorns, owls** and similar animals, plus magic plants such as **mushrooms and glowing seeds**; the lake holds **merrow**; the sky holds isles you can reach by flight. Species are pruned by ecological niche — **one species per niche** (list in 03).
4. There is exactly one kind of magic: **magic fruit**. Eat it and you become the animal the fruit corresponds to, reverting after a while. Each animal's fruit only appears in its own habitat.
5. The player has a **magic backpack with limited capacity**; **the rarer the fruit, the more space it occupies**, so you cannot carry many at once.
6. The player has a **fixed-location warehouse**; warehouses **can be newly built**, but **the exact mechanism was left open** — this is the design this project had to complete.

## 2. Design Pillars

### P1 · Magic is eaten

No spells, no gestures, no foci. Every supernatural ability comes from "swallowing a piece of someone else's life into your own body".
This pillar decides directly: the casting animation = a bite; the material component = fruit; the price = the fragility of that body + the time bar.

### P2 · The body is the key

Terrain is not opened by blowing it up, it is opened by *becoming the right shape*.
A low root-hole only a frog can enter; the underwater window sills of the sunken tower only a frog can reach; the cloud tops only an owl can reach; the ridge ledges only a bear can stand on.
**Progression = find the fruit + fit the fruit + survive long enough to get there.**
Transformation is **inheritance**: you get everything that animal can do and everything it cannot. The mind is untouched — you still decide what to do (see 04 §5.0).

### P3 · Capacity is the only scarce currency

No gold, no stamina bar, no energy. Every trade the player makes happens in one place: how the 24 fruit slots are arranged.
Rare fruit occupies more slots → to carry a legendary fruit you must give up two common fruits → and common fruit is the consumable you spend on exploring.

### P4 · Fruit is alive, and it dies

From the moment it is picked, a fruit starts counting down. When it goes dormant it becomes a **pit**: inedible, but plantable.
This turns hoarding into loss, turns the warehouse into a place that must be continuously tended, and turns waste into planting.

### P5 · The valley does not cooperate with you

Every animal has its own opinion about *the shape you are in right now*. Walk up to an owl as a human and it leaves; walk up as a brown bear and it leaves faster. Become a frog and the frogs on the shore ignore you completely.
Transformation is not a pure buff, it is **swapping your social identity**.

## 3. Anti-goals (explicitly not doing)

| Not doing | Why |
|---|---|
| Combat builds / skill trees | All ability comes from fruit; growth shows up as "where can I go, what can I carry" |
| Levels and XP | Conflicts with P3: levels would make capacity irrelevant |
| Spells, gestures, foci | Pillar P1: magic is eaten. There is no second way to cast |
| Building houses / free construction | The storage mechanism (see 05) replaces "build" with "grow", keeping the world organic |
| Numeric death penalties | Death only drops your fruit where you fell, encouraging "go back and get it" instead of "reload" |
| Time pressure / survival hunger | Only fruit has a shelf life; the player themselves does not |

## 4. Experience goals (sentences the player should say out loud)

- "My backpack is full, but the hibernation den on the Northern Ridge is right ahead — which fruit do I drop?"
- "So the lake only let me down to the tower as a frog."
- "I stored it in the cellar, forgot about it for three weeks, and it all turned into pits."
- "The pit I planted grew into a tree; that is going to be my own orchard one day."
- "The frogs are not running — because I really am one of them."

## 5. The player fantasy

Not "a powerful wizard" but **"a forager who can become anything"**.
A person with a basket on their back, a fruit in their mouth, finding ways through the valley. The school (Starfall Keep) exists, but it does not teach you spells — it teaches you **to identify fruit**.

## 6. Pacing of a single session (a 15-minute slice)

| Minute | Event |
|---|---|
| 0–2 | Leave from the nearest store, check spare slots and remaining fruit time |
| 2–6 | Travel toward the target, casually picking 1–2 common fruit on the way (they cost slots but are cheap: consumables) |
| 6–9 | Hit gated terrain → eat the matching fruit → pass through with the new body |
| 9–12 | On the far side of the gate, obtain a rare fruit (4–12 slots; the backpack becomes tight instantly) |
| 12–15 | Decide: walk back to a store / plant the pit here / risk a detour. The time bar and the spoilage bar close in at the same time |

## 7. MVP boundary (prototype scope)

**Inside the MVP**: terrain generation, free walking/swimming/flying, fruit picking and spoilage, backpack capacity, transformation and ability switching, creature attitudes, fixed store + field stores, day/night, quests, codex, saving, the identity layer (id / epithet / name, see 03 §6).

**Explicitly outside the MVP**: NPC dialogue trees, multiplayer, vehicles, weather, building, UI animation beyond the minimap, procedural audio.

## 8. Scale

| Item | Prototype | Full target |
|---|---|---|
| World | 160×48×160 voxels | 1024×128×1024 |
| Zones | 11 | 20–24 |
| Fruits | 3 | 12–16 |
| Creatures | 4 species (3 with a fruit) | 12–16 species + named individuals |
| Main line | 6 quests | 7 chapters × 4–6 quests |
| One day | 420 seconds | 1200 seconds |
