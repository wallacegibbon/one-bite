# 05 · Backpack and Storage Mechanism

[中文: ../05-背包与仓库.md](../05-背包与仓库.md)

> **This is the only part the original brief left open**: "the player has a fixed-location warehouse; warehouses can be newly built, but the mechanism is undecided."
> This document gives 3 candidate options, an assessment, and the final recommended design (whose core is implemented in the prototype).

## 1. Problem definition

Known constraints (cannot change):

1. Backpack capacity is limited, and **rarer fruit occupies more space**.
2. The player has a warehouse at a **fixed location**.
3. Warehouses **can be newly built**.

Questions to answer:

- Q1 What is the **cost** of building a new warehouse? (money? materials? fruit? a quest?)
- Q2 **Where** can a new warehouse be placed? (anywhere? specific anchors?)
- Q3 How do you **move goods** between warehouses? (teleport? carry? mail?)
- Q4 Can a warehouse **degrade or be destroyed**?
- Q5 How do you stop the player from "building 20 warehouses and turning the valley into a sea of lockers"?

## 2. The three candidate options

### Option A · Money and property (traditional)

Trade fruit for money, buy land with money, build a standard warehouse on the land.

| Pros | Cons |
|---|---|
| Familiar to players, simple to implement | **Conflicts with P3**: once there is money, the capacity anxiety disappears |
| Can support a property upgrade line | Fruit becomes currency → players hoard it to sell high, contradicting "fruit dies" |
| | A warehouse is "a box", with no mechanical link to the world |
| | Q5 unresolvable: the number of warehouses is limited only by money |

**Verdict: rejected.** It replaces the game's whole scarce currency from "fruit slots" with "money".

### Option B · The backpack *is* the warehouse (no fixed warehouse)

Delete warehouses; upgrade the backpack instead, with fruit automatically "settling" onto the character on death or when returning to town.

| Pros | Cons |
|---|---|
| Minimal, no UI burden | **Directly violates the brief** (the brief explicitly states a fixed-location warehouse) |
| | There is no "back to the cellar" pacing beat, and the game loses its breathing room |
| | Cannot express "fruit dies" — fruit always on you would never spoil |

**Verdict: rejected.**

### Option C · The warehouse is alive (recommended)

**Warehouses are not built, they are grown.**

Fruit dies → a dead fruit becomes a pit → a pit can be planted → a planted pit grows into a **cellar tree**: a hollow, living 24-slot warehouse.

This single idea answers Q1–Q5 at once:

- Q1 cost = one pit (you get those anyway) + time (it has to grow)
- Q2 location = anywhere it can take root (soil, light, not too far from the Mother Bloom's roots)
- Q3 transfer = **owl post** (see §5)
- Q4 degradation = a cellar tree's decay rate is 1/3 (not 0), and **badgers and fruit thieves come stealing**
- Q5 cap = **at most 3 cellar trees**, for a worldview reason rather than a numeric one: "At most 3 cellar trees — the valley cannot remember more places than that."

**Verdict: adopted.**

## 3. Final design: three storage tiers

| Tier | Name | Slots | Decay | Count | Location |
|---|---|---|---|---|---|
| **Carried** | magic backpack | **24** (upgradable to 36) | **×1.0** | 1 | on you |
| **Fixed** | Lanternrow · main cellar | **96** | **×0.1** | 1 (fixed) | (136,134), permanent |
| **Field** | cellar tree | **24** | **×0.33** | **at most 3** | planted by the player |

### 3.1 The magic backpack

- 24 fruit slots. Fruit occupies 1/2/4/7/12 slots by rarity.
- Decay ×1.0 — the backpack is a space **that is counting down**.
- Upgrades (three, each +6 slots or a rule change):
  | Upgrade | Effect | Source |
  |---|---|---|
  | Pouch (副果袋) | +6 slots | Old Mei's thanks in Lanternrow |
  | Deep Pouch (深果袋) | +6 slots | the waterproof satchel in the sunken tower |
  | Silver Divider (银丝隔层) | rare and above occupy **−1** slot | the silver mesh in the castle greenhouse |
- Cap 36 slots = 3 legendary fruits. The Silver Divider makes "rare 4→3, epic 7→6, legendary 12→11", so 36 slots fit 3 legendary fruits plus spare room.

**Why the backpack is never made bigger**: 24 slots = 2 legendary fruits. That number makes "do I bring the dragon fruit" a permanent trade-off.

### 3.2 The main cellar (the fixed warehouse)

- Fixed location: Lanternrow (136,134), y20. It exists from world generation; it cannot be moved or destroyed.
- 96 slots, decay **×0.1** (a 1500 s common fruit lasts 15000 s in the cellar ≈ 4 hours, about 36 in-game days).
- Interaction: walk within 3.2 m and press E → two columns (backpack / cellar), transfer by clicking or arrow keys + E.
- It is the **only long-term preservation** in the game: only here can a rare fruit outlive a single expedition.
- Narrative function: the cellar is the valley's **memory organ**. Old Mei says: "A cellar is not where you put fruit, it is where you put *later*."

### 3.3 The cellar tree (field warehouse) — the mechanism for building a new warehouse

**Build flow**

```
  fruit goes dormant → pit (kind:'pit')      or  obtain a "cellar stone" (cellarseed, rare, 4 slots)
        │                                        │
        └──── hold the pit / cellar stone, press F to use ──┘
                        │
        check: soil / mossy soil / sand underfoot, 2 blocks clear above, ≥ 20 m from any other cellar tree
                        │
              a cellar tree grows (block 79 trunk + 77 core, self-lit)
                        │
              24 fruit slots · decay ×0.33 · counts against the cap of 3
```

**Cellar tree rules**

| Rule | Value | Why |
|---|---|---|
| Cap | 3 trees | "the valley cannot remember more places" |
| Min distance | 20 m | roots must not overlap; also forces the player to spread their points out |
| Decay | ×0.33 | a cellar tree is alive, not a cellar. Fruit inside survives only 1/3 of the backpack's time |
| Theft | one roll per game day, 30% chance a badger or a fruit thief takes 1–3 fruits; **if the player is within 45 m they are always scared off and nothing is lost** | field storage has to be **visited regularly** |
| Destruction | a bear form can tear it down (tearing = everything drops); a dragon's fire = every item goes dormant | gives the strength forms an actual use |
| Not movable | a dead cellar tree is dead, its goods scatter | there is no "pack up the warehouse" |

**Why cellar-tree decay is not 0**: if field storage had zero decay, players would build one per map and the capacity anxiety would vanish. ×0.33 means a cellar tree is a **waystation**, not a **safe**.

## 4. The economics of storage (one table to see the trade-off)

The lifespan of one **Merrow Pear** (rare, 4 slots, 900 s):

| Stored in | Effective lifespan | Equal to, in-game |
|---|---|---|
| backpack | 900 s | 2 days |
| cellar tree | 2700 s | 6.4 days |
| main cellar | 9000 s | 21 days |

A round trip "Mirrorlake → Lanternrow" takes about 3–4 minutes. So:

- A Merrow Pear **cannot** be walked all the way from Mirrorlake to the cellar (900 s is enough on paper, but the route also involves digging, diving and transforming).
- You must plant a cellar tree near Mirrorlake as a waystation → this is the real motive for "building a new warehouse": **not greed, but the journey is longer than the shelf life.**

## 5. Moving goods between warehouses

### 5.1 Carrying it yourself (default)

The backpack is the transport vehicle. Subtract the consumables you need on the road (mushrooms, glowing seeds) from the 24 slots and real carrying capacity is about 18–20 slots.

### 5.2 Owl post (cellar tree ↔ main cellar)

- Precondition: you have stored at least 1 Owlberry in the main cellar (this unlocks "Pendulum").
- Pressing E on a cellar tree offers one extra option: "have Pendulum carry one away".
- One fruit at a time, **delivered 3 game days later** at the main cellar.
- On arrival the fruit **has already decayed for 3 days** (counted at the main cellar's ×0.1), so posting only makes sense for rarity ≥ rare.
- 10% failure rate: "Pendulum did not come back. On the fourth day it flew back by itself, mouth empty."
- Implementation notes: **at most 3 in transit at once** (Pendulum cannot carry more); if the main cellar is full on arrival, Pendulum carries the fruit **back to the source cellar tree** instead of dropping it; both the unlock state (`_owlUnlocked`) and the in-transit queue (`posts`) are saved.

Design intent: posting **does not remove the hauling**, it only ships "the one most precious fruit". It is slower than hauling and costlier than hauling (you have to feed the owl), but it is the only way that does not require you to walk the trip yourself.

### 5.3 Explicitly not doing

- ❌ Teleporting between warehouses (would destroy the meaning of the map)
- ❌ Unlimited capacity (would destroy P3)
- ❌ Upgrading a warehouse to unlimited slots (the main cellar's 96 slots is a hard cap and cannot be upgraded)

## 6. Anti-hoarding: three gates that mesh into each other

| Gate | Mechanism | Effect |
|---|---|---|
| **Dormancy** | fruit always counts down | hoarding = waste |
| **Pitting** | dormancy does not delete, it becomes a pit (half the slots) | waste becomes a **planting opportunity**, negative feeling becomes long-term behaviour |
| **Cellar-tree cap + theft** | field storage is limited and risky | the player must **return periodically**, keeping the world present |

These three turn "the warehouse" from a static UI into **something you manage, something that can betray you, and something that grows trees**.

## 7. Prototype implementation status

| Item | Status |
|---|---|
| Backpack 24 slots + rarity slot cost | ✅ implemented (`Game.cap/used/slotOf/canFit`) |
| dormancy → pit | ✅ implemented (`decayItems`, storage uses the `decay` multiplier) |
| main cellar (96 slots, ×0.1, fixed coordinates) | ✅ implemented (`stashes[0]`, block 78 cellar crate) |
| cellar tree (24 slots, ×0.33, cap 3) | ✅ implemented (`buildCellarTree`, block 79/77) |
| storage UI (two-way transfer) | ✅ implemented (`openStashUI/moveItem`, `ui.renderCellar`) |
| backpack upgrades (Pouch / Deep Pouch / Silver Divider) | ✅ implemented (`Game.upg` + `cap()/slotOf()`; q1→Pouch, q4→Deep Pouch, q7→Silver Divider; saved) |
| fruit block regrowth | ✅ implemented (`Game.regrow[]`, `RARITY.regrow` game days ×±20%, saved) |
| owl post | ✅ implemented (`Game.postItem/updatePosts`, 1 fruit / 3 game days / 10% lost, decays at ×0.1 in flight, in-transit saved) |
| badger / fruit-thief rolls | ✅ implemented (`Game.dailyRolls()`, 30% per game day, player within 45 m always scares them off; trap block 80 not involved) |
| cellar tree destroyed / bear tearing it down | ⬜ not implemented |

## 8. In one sentence

> **A warehouse is not a built structure, it is a planted tree. You plant it not because your backpack is small, but because the valley is bigger than the life of a single fruit.**
