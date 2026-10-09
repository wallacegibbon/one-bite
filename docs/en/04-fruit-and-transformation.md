# 04 · Fruit and Transformation

[中文: ../cn/04-果实与变形系统.md](../cn/04-果实与变形系统.md)

Source of truth: `game/data/fruits.js`. Every number in this document comes straight from that file.

**One fruit per animal.** The valley has seven animals (03), so it has seven transformation fruits. There is no "second fox fruit", and no fruit that belongs to no animal.

## 1. Rarity: capacity and shelf life

Rarity is not a "value tier", it is **two physical parameters**:

| Rarity | English | Slots | Dormancy | Regrow | Ring |
|---|---|---|---|---|---|
| common | 常见 | **1** | 1500 s (25 min) | 1.0 game days | `#9ab97e` |
| uncommon | 少见 | **2** | 1200 s (20 min) | 1.5 game days | `#6cb4f0` |
| rare | 稀有 | **4** | 900 s (15 min) | 2.0 game days | `#b987f2` |
| epic | 极稀 | **7** | 600 s (10 min) | 2.5 game days | `#ff9c4a` |
| legendary | 传说 | **12** | 420 s (7 min) | 3.0 game days | `#ffdc5c` |

**The backpack is 24 slots** → at most: 24 common / 12 uncommon / 6 rare / 3 epic / **2 legendary**.

One important corollary: one Bruin Fig (12 slots) + one Silkberry (7 slots) = 19 of the 24 slots gone, **leaving 5 slots for anything else**. That is the physical price of carrying the valley's two heaviest bodies: you reach the Northern Ridge, but you have no room left to pick up a second one.

### 1.1 Regrowth

A picked fruit block does not vanish forever — the tree's roots send nutrients back. The time required scales with rarity (table above), with the actual value randomised within ±20% so that a batch never ripens at once. Rules:

- Only **fruit blocks** regrow; mushrooms, glowing seeds and other plants do not (otherwise cellar stones could be farmed infinitely).
- The regrow timer is **saved in the save file** and does not advance while the game is closed — the valley does not wait for you.
- If the original spot has been taken by another block (the player felled the tree, a bear knocked the branch down), that regrowth is **cancelled**; nothing is force-placed.
- Design intent: the valley never gets emptied out, but "that tree from yesterday" is not guaranteed to be there today. The 3-day cycle of a legendary fruit is exactly the round-trip cost of one expedition.

## 2. Dormancy (spoilage)

A fruit starts counting down the moment it is picked.

```
  picked ──fresh countdown──→ fresh ≤ 0 ──→ becomes a "pit" (kind:'pit')
                                          │
                                          ├─ inedible (no transformation effect)
                                          ├─ occupies ceil(slots/2) slots (halved)
                                          └─ plantable → after some days grows into a fruit tree
```

- Decay rate in the backpack ×1.0; in the main cellar ×0.1; in a cellar tree ×0.33 (see 05).
- The game announces dormancy explicitly: "Owlberry went dormant — all that is left is a pit. Plant it and it may still fruit."
- **There are no "preservation" items.** The only way to slow decay is storage.

## 3. The full fruit table (7 kinds)

### Common (1 slot)

| id | English | Form | Duration | Habitat | Key abilities | Cost (body only) |
|---|---|---|---|---|---|---|
| `owlberry` | Owlberry | owl | 240 s | Whisperwood · bell-tower hollow | fly 5.2, glide 0.35, night vision 0.75, stealth 0.45, fov 88, size 0.55×0.7 | Photophobic by day (night vision inverts into blinding); talons cannot work latches or fruit bags (**cannot open storage**) |

### Uncommon (2 slots)

| id | English | Form | Duration | Habitat | Key abilities | Cost (body only) |
|---|---|---|---|---|---|---|
| `scaleberry` | Scaleberry | pangolin | 300 s | Old Orchard mounds · Northern Ridge slopes | **dig**, **climb**, armor 0.5 (halves damage taken), stealth 0.4, fov 65 | No fine motor control: claws can only dig and grip, not work latches or fruit bags; **armour is heavy: you sink, you cannot swim** |
| `stagcap` | Stagcap | deer | 300 s | Whisperwood · deer paths | speed 1.7, jump 1.5, step 0.9, stealth 0.8, herd, fov 70 | **Antlers and shoulder width: no low or narrow space**; prey build: every predator notices you first |

### Rare (4 slots)

| id | English | Form | Duration | Habitat | Key abilities | Cost (body only) |
|---|---|---|---|---|---|---|
| `jellybloom` | Jellybloom | jellyfish | 360 s | Mirrorlake mid-water | swim 1.6, breath +40 s, self-glow, immune to poison, fov 95 | Almost immobile on land; fish avoid you (no communication with water life) |
| `frogpear` | Frog Pear | frog | 420 s | Mirrorlake reeds · rain pools | **breatheAir:false**, jump 2.4, swim 2.4, **tongue 4 m**, night vision 0.3, stealth 0.5, fov 100 | **The skin must stay wet: after 90 s out of water it dries and vitality drains**; too small: cannot reach high fruit, cannot push a door open |

### Epic (7 slots)

| id | English | Form | Duration | Habitat | Key abilities | Cost (body only) |
|---|---|---|---|---|---|---|
| `silkberry` | Silkberry | spider | 420 s | Echo Hollow ceiling · ruin beams | **climb**, web (walks on its own silk), night vision 0.7, fov 110 | Humanoids panic at the sight of you (villagers refuse trade); extra damage from fire and strong light |

### Legendary (12 slots)

| id | English | Form | Duration | Habitat | Key abilities | Cost (body only) |
|---|---|---|---|---|---|---|
| `bruinfig` | Bruin Fig | bear | 480 s | Northern Ridge rock face · hibernation den | strength, cold immune, aura 8, step 1.1, size 1.4×1.5 | **No fine motor control** (cannot pick small fruit, cannot open storage); **weight**: thin ice breaks, wooden bridges collapse |

**Why there is no eighth**: the fruit table is a mirror of the animal table. Adding a fruit means adding a niche, a row in the attitude matrix and a new set of gates (03 §3). Seven is the most that can be read in ten seconds.

## 4. Form ability fields

| Field | Meaning | What the player feels |
|---|---|---|
| `size[w,h]` | collision box in metres | how low a hole you can enter; decides whether a 1×1 passage fits |
| `speed` | land movement multiplier | deer 1.7 / bear 1.1 / jellyfish 0.5 |
| `jump` | jump force multiplier | frog 2.4 / deer 1.5 |
| `swim` | underwater movement multiplier | frog 2.4 / jellyfish 1.6 |
| `fly` | flight thrust (0 = cannot fly) | only the owl, 5.2 |
| `glide` | unpowered gliding (fall speed cap) | owl 0.35 |
| `breatheAir:false` | breathe underwater | only the frog |
| `airBonus` | extra seconds of held breath | jellyfish +40 |
| `dryTimer` | seconds out of water before the skin starts to dry (amphibian bodies) | only the frog, 90 |
| `nightVision` | brightening in the dark, 0–1 | spider 0.7 / owl 0.75 |
| `glow[r,g,b]` | self-illumination | jellyfish |
| `stealth` | creature alert-radius multiplier | pangolin 0.4 = hard to spot |
| `aura` | intimidation radius | bear 8 = small animals scatter as you approach |
| `armor` | damage-taken multiplier (<1 = this body shrugs off bites) | pangolin 0.5 |
| `climb` | wall climbing | pangolin, spider |
| `dig` | break soft blocks | only the pangolin |
| `tongue` | metres of reach when plucking / grabbing | frog 4 |
| `step` | auto step-up height in metres | bear 1.1 = walks up any stair |
| `fov` | field of view | spider 110 / bear 68 |
| `hand` | first-person hand model | hand/talon/web/hoof/claw/tentacle |

There are five further pure boolean switches, which change checks rather than numbers: `web` (can move along silk it spun), `strength` (pushes obstacles, breaks doors), `poisonImmune`, `coldImmune`, `herd` (same-species grouping check).

**Note that `size` is a hard gate**: a frog at 0.5×0.5 fits a 1×1 root hole and the gaps between reeds; a bear at 1.4×1.5 does not — that is the physical implementation of "weight collapses the bridge" and "antlers snag in the doorframe", not just flavour text.

## 5. Transformation rules

### 5.0 The inheritance rule: every ability, every fragility

Transformation is not putting on equipment, it is changing bodies. **You inherit everything the animal can do and everything it cannot** — all of its power and all of its fragility.

Costs come from exactly two places:

| Source | Examples | Why |
|---|---|---|
| **this body cannot** | claws and jaws cannot do fine work (no picking small fruit, no opening storage); antlers and shoulder width will not fit a low hole; weight breaks thin ice and wooden bridges; the skin dries after 90 s out of water; armour makes you sink; photophobic by day | you changed body, so you changed the ability table |
| **how the world reacts to this body** | villagers refuse trade with a spider shape; fish avoid you; every predator spots a deer shape first; a bear is hostile to a pangolin shape and to a deer shape | they do not recognise *you*, they recognise this body |

**The mind is untouched.** A form never makes you want anything and never stops you wanting anything. Inside a bear's body you are still you: what you think, what you fear, what you decide — exactly as in a human shape.

The one exception is a **body reflex**: a prey heart is not under your command. When something lunges at you, this body flinches (`fright`), and flinching burns air and drains the time bar faster. That is physiology, not psychology — you cannot stop the flinch, but you still decide what to do next.

### 5.1 The time bar

- The countdown starts when you eat it; the bottom of the HUD shows the form name and the remaining time.
- Time out → you revert to human shape, and the side effect's "aftertaste" is announced.
- Revert deliberately: press `R` (ends early, no time refunded).

### 5.2 The magic stomach (prototype: overwrite + warning)

- Eating a second fruit while already transformed → the second overwrites the first and deals **1.5 vitality damage** + "Magic-stomach churn — two magics are fighting inside you!"
- Full design (not implemented):
  - The "magic residue" of two forms coexists in the stomach for 90 seconds, during which every action check is −30%.
  - If the two forms differ in body size by ≥ 1.0 m, the churn damage doubles (**human → bear → jellyfish** is the most dangerous combination: 1.5 m against 0.8 m).
- **One body at a time.** Two magics never share a body: the second fruit always overwrites the first, and no talent, plant or tool makes them coexist. This is a law of the world, not a difficulty setting — the moment one backpack could carry two bodies, every door in the valley stops being a decision about *which body to arrive in* and becomes a shopping list.

### 5.3 Beast residue (not implemented, full design)

Repeatedly transforming into the same form leaves traces on the human shape:

| Cumulative transformations | Residue |
|---|---|
| 5 | night vision +0.15 (owl / spider line) |
| 10 | that species' alertness toward you −20% |
| 20 | the codex entry for that species gains a line: "it recognises you" |
| 30 | **irreversible**: human `size` permanently +0.1 m (some caves become harder to enter) |

Design intent: make transformation a costless tool never — it is a kind of **identity drift**.

## 6. Empty fruit

Some fruit trees bear **empty fruit**: identical in appearance, slot cost and dormancy, but eating one does nothing and only announces "This fruit has no taste."

- Empty fruit has no cause. The valley does not explain itself — in some years some trees bear tasteless fruit.
- Empty fruit **can still be planted**, and the tree it grows has a 15% chance of coming back as real fruit — the player's only means of "repair".
- In the codex, empty fruit shows as "?" and does not count toward codex completion.

> Design use: empty fruit lets the player verify with their own hands the motivation "the list has 26 fruits, the valley has 7" — some of them are not gone, they are still there and empty.

## 7. The picking interaction

| Step | Presentation |
|---|---|
| Crosshair on a fruit block | highlight + prompt "E — pick Owlberry (common, 1 slot)" |
| Press E | the fruit block disappears, backpack +1, rarity and slot cost announced |
| Backpack full | "Backpack full (24/24 slots) — go back to the cellar first." The fruit does **not** drop, it stays where it is |
| The fruit block | a faintly self-lit small box (0.44³ body + two small leaves), colour = the rarity ring colour |

Fruit block ids 40–46 (7 kinds), non-solid, non-opaque, `emis:1` — at night you can only see them because they glow themselves. That is the implementation of "at night you can see the Owlberry faintly reflecting light".
