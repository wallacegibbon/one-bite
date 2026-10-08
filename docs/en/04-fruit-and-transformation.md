# 04 · Fruit and Transformation

[中文: ../04-果实与变形系统.md](../04-果实与变形系统.md)

Source of truth: `game/data/fruits.js`. Every number in this document comes straight from that file.

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

One important corollary: one Embercore (12 slots) + one Mother Bloom bud (12 slots) = backpack completely full, **with no room for any supplies**. That is the physical difficulty of the "grafting" route in the finale.

### 1.1 Regrowth

A picked fruit block does not vanish forever — the Mother Bloom's roots send nutrients back. The time required scales with rarity (table above), with the actual value randomised within ±20% so that a batch never ripens at once. Rules:

- Only **fruit blocks** regrow; mushrooms, glowing seeds and other plants do not (otherwise cellar stones could be farmed infinitely).
- The regrow timer is **saved in the save file** and does not advance while the game is closed — the valley does not wait for you.
- If the original spot has been taken by another block (the player felled the tree, a bear knocked the branch down), that regrowth is **cancelled**; nothing is force-placed.
- Design intent: the valley never gets emptied out, but "that tree from yesterday" is not guaranteed to be there today. The 3-day cycle of a rare fruit is exactly the round-trip cost of one expedition.

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

## 3. The full fruit table (15 kinds)

### Common (1 slot)

| id | English | Form | Duration | Habitat | Key abilities | Side effect |
|---|---|---|---|---|---|---|
| `owlberry` | Owlberry | owl | 240 s | Whisperwood · bell-tower hollow | fly 5.2, glide, night vision 0.75, stealth 0.45, fov 88 | Photophobic by day; lunges uncontrollably at small rodents |
| `batfruit` | Batfruit | bat | 210 s | Echo Hollow ceiling · dead-tree cracks | fly 6.4, glide 0.25, night vision 0.95, stealth 0.3, fov 95 | Nearly blind by day; brief thirst after transforming |
| `glowmoth` | Mothpear | moth | 180 s | Glowglade · night wood | fly 4.0, self-glow, stealth 0.25, fov 100 | **Phototactic: cannot resist strong light sources**; the time bar is drawn as a candle |

### Uncommon (2 slots)

| id | English | Form | Duration | Habitat | Key abilities | Side effect |
|---|---|---|---|---|---|---|
| `otterkin` | Otterkin | otter | 300 s | Mirrorlake shallows · waterfall pools | swim 2.2, breath +25 s, step 0.5 | −30% speed on land; **cannot open storage** |
| `vulpine` | Vulpine Plum | fox | 300 s | Whisperwood edge · town orchard | speed 1.45, jump 1.2, dig, smell | Hated by dogs and hunters; **cannot resist stealing unstored fruit** |
| `stagcap` | Stagcap | stag | 300 s | Whisperwood · deer paths | speed 1.7, jump 1.5, step 0.9, herd | **Antlers snag in narrow holes and doorframes**; locked onto by wolves and veilbeasts |
| `jellybloom` | Jellybloom | jellyfish | 300 s | Mirrorlake mid-water | swim 1.6, breath +40 s, glow, immune to poison | Almost immobile on land; fish avoid you |

### Rare (4 slots)

| id | English | Form | Duration | Habitat | Key abilities | Side effect |
|---|---|---|---|---|---|---|
| `merrow` | Merrow Pear | merrow | 600 s | Mirrorlake · sunken tower and merrow village | **breatheAir:false**, swim 2.6, talk:water, pressure resistant | Weak out of water (−50% speed, time bar runs 2×); the merrow village demands one lake thing back |
| `unicorncherry` | Unicorn Cherry | unicorn | 420 s | Deep forest · the Hoar Grove | speed 2.1, jump 1.6, step 1.0, purify, talk:beast, walks on water | **Cannot lie**; extremely conspicuous (hunters and veilbeasts mark you) |
| `silkberry` | Silkberry | giant spider | 420 s | Deep Echo Hollow · ruin beams | **climb**, web, night vision 0.7, fov 110 | Humanoids panic at the sight of you (villagers refuse trade); extra damage from fire/strong light |
| `bruinfig` | Bruin Fig | ash bear | 420 s | Ashscale Ridge rock face · hibernation den | strength, cold resistant, aura 8, step 1.1 | **No fine motor control** (cannot pick small fruit, cannot open storage); forced sleep after 3 transformations in a row |

### Epic (7 slots)

| id | English | Form | Duration | Habitat | Key abilities | Side effect |
|---|---|---|---|---|---|---|
| `veilberry` | Veilwalker Ash-berry | veilbeast | 480 s | Inside the Grey Veil | **phase** (through walls), veilWalk, stealth 0.15, night vision 0.85 | Time bar runs 1.5×; the minimap fails for 1 minute after transforming |
| `phoenixpit` | Phoenix Pit | phoenix | 240 s | Cloudspire · the ash ring peak | fly 7.5, **fire**, glow, **revive:1** (one resurrection) | "Burn-hunger" for 3 minutes after transforming, eating only mushrooms; **each transformation burns 1 common fruit in your backpack** |

### Legendary (12 slots)

| id | English | Form | Duration | Habitat | Key abilities | Side effect |
|---|---|---|---|---|---|---|
| `embercore` | Embercore | dragon | 300 s | Cloudspire · the ash dragon's nest | fly 9.0, fire, fire immune, strength, aura 18, size 3.2×2.4 | **Other dragons attack you**; the Grey Veil rejects a dragon shape (you are pushed out and hurt when near it); ravenous after transforming, fruit spoils at double rate for 10 minutes |
| `motherbloom` | Mother Bloom | mother-tree avatar | **0 (inedible)** | The Old Orchard · the Mother Bloom | — | Used for "restitution" and "grafting" (the key item of the finale) |

## 4. Form ability fields

| Field | Meaning | What the player feels |
|---|---|---|
| `size[w,h]` | collision box in metres | how low a hole you can enter; decides whether a 1×1 passage fits |
| `speed` | land movement multiplier | fox 1.45 / unicorn 2.1 / jellyfish 0.5 |
| `jump` | jump force multiplier | deer 1.5 / unicorn 1.6 |
| `swim` | underwater movement multiplier | merrow 2.6 / otter 2.2 |
| `fly` | flight thrust (0 = cannot fly) | owl 5.2 / dragon 9.0 |
| `glide` | unpowered gliding (fall speed cap) | bat 0.25 = barely falls |
| `breatheAir:false` | breathe underwater | only the merrow |
| `airBonus` | extra seconds of held breath | otter +25 / jellyfish +40 |
| `nightVision` | brightening in the dark, 0–1 | bat 0.95 |
| `glow[r,g,b]` | self-illumination | moth, jellyfish, unicorn, phoenix, dragon |
| `stealth` | creature alert-radius multiplier | veilbeast 0.15 = almost never spotted |
| `aura` | intimidation radius | dragon 18 = everything flees where you go |
| `climb` | wall climbing | only the giant spider |
| `dig` | break soft blocks | only the fox |
| `fire` | breathe fire / immune to fire | phoenix, dragon |
| `purify` | purify poisoned water | unicorn |
| `talk` | communicate with a class of creature | merrow `water`, unicorn `beast` |
| `step` | auto step-up height in metres | dragon 1.6 = walks up any stair |
| `fov` | field of view | spider 110 / deer 70 |
| `hand` | first-person hand model | talon/wing/paw/hoof/fin/claw/tentacle/shadow |

**Note that `size` is a hard gate**: a fox at 0.55×0.6 fits a 1×1 root hole; a stag at 0.9×1.6 does not — that is the physical implementation of the "antlers snag in doorframes" side effect, not just flavour text.

## 5. Transformation rules

### 5.1 The time bar

- The countdown starts when you eat it; the bottom of the HUD shows the form name and the remaining time.
- Time out → you revert to human shape, and the side effect's "aftertaste" is announced.
- Revert deliberately: press `R` (ends early, no time refunded).

### 5.2 The magic stomach (prototype: overwrite + warning)

- Eating a second fruit while already transformed → the second overwrites the first and deals **1.5 vitality damage** + "Magic-stomach churn — two magics are fighting inside you!"
- Full design (not implemented):
  - The "magic residue" of two forms coexists in the stomach for 90 seconds, during which every action check is −30%.
  - If the two forms differ in body size by ≥ 1.0 m, the churn damage doubles (human → dragon → jellyfish is the most dangerous combination).
  - **Linnaeus's exception**: she can deliberately "mix stomachs", see 5.3.

### 5.3 Mixed forms (not implemented, full design)

Eating two fruits at once **without churning** (needs the magic-stomach talent or a neutralising plant) gives a half-length mixed form:

| Combination | Mixed form | Duration | Traits |
|---|---|---|---|
| owl + bat | Nightwing | 150 s | night vision 1.0, fly 5.8, but completely blind by day |
| otter + merrow | Half-tide | 400 s | at home in water and land, but the time bar runs 1.5× out of water |
| fox + spider | Nestwalker | 300 s | climb + dig, villagers refuse trade permanently |
| unicorn + dragon | **Horn and Ash** | 180 s | every ability, but the Grey Veil marks you permanently (entering the fog hurts you) |

A mixed form's fruit cost = the sum of both (12+4 = 16 slots); that is the price of "if you want to mix, clear the backpack".

### 5.4 Beast residue (not implemented, full design)

Repeatedly transforming into the same form leaves traces on the human shape:

| Cumulative transformations | Residue |
|---|---|
| 5 | night vision +0.15 (owl/bat line) |
| 10 | that species' alertness toward you −20% |
| 20 | the codex entry for that species gains a line: "it recognises you" |
| 30 | **irreversible**: human `size` permanently +0.1 m (some caves become harder to enter) |

Design intent: make transformation a costless tool never — it is a kind of **identity drift**.

## 6. Empty fruit (a main-line mechanic)

Some fruit trees bear **empty fruit**: identical in appearance, slot cost and dormancy, but eating one does nothing and only announces "This fruit has no taste."

- Empty fruit is the symptom of the Mother Bloom's amnesia and increases as the main line advances.
- Empty fruit **can still be planted**, and the tree it grows has a 15% chance of coming back as real fruit — the player's only means of resisting the world's decline.
- In the codex, empty fruit shows as "?" and does not count toward codex completion.

## 7. The picking interaction

| Step | Presentation |
|---|---|
| Crosshair on a fruit block | highlight + prompt "E — pick Owlberry (common, 1 slot)" |
| Press E | the fruit block disappears, backpack +1, rarity and slot cost announced |
| Backpack full | "Backpack full (24/24 slots) — go back to the cellar first." The fruit does **not** drop, it stays where it is |
| The fruit block | a faintly self-lit small box (0.44³ body + two small leaves), colour = the rarity ring colour |

Fruit block ids 40–54 (15 kinds), non-solid, non-opaque, `emis:1` — at night you can only see them because they glow themselves. That is the implementation of "at night you can see the Owlberry faintly reflecting light".
