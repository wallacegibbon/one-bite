# 04 · Fruit and Transformation

[中文: ../cn/04-果实与变形系统.md](../cn/04-果实与变形系统.md)

Source of truth: `game/data/fruits.js`. Every number in this document comes straight from that file.

**One fruit per animal.** The valley has four animals you can wear (03), so it has four transformation fruits. There is no "second fox fruit", and no fruit that belongs to no animal.

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

The valley currently grows **three of these five rungs** — common, rare, legendary. The ladder stays: it is a law of storage, not a shopping list.

One important corollary: one Bruin Fig (12 slots) + one Jellybloom (4 slots) + one Frog Pear (4 slots) = 20 of the 24 slots gone, **leaving 4 slots for anything else**. That is the physical price of carrying the valley's heaviest body together with both lake bodies: you reach the Northern Ridge, but you have no room left to pick up a second one.

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

## 3. The full fruit table (4 kinds)

### Common (1 slot)

| id | English | Form | Duration | Habitat | Key abilities | Cost (body only) |
|---|---|---|---|---|---|---|
| `owlberry` | Owlberry | owl | 240 s | Whisperwood · bell-tower hollow | fly 5.2, glide 0.35, night vision 0.75, stealth 0.45, fov 88, size 0.55×0.7 | Photophobic by day (night vision inverts into blinding); talons cannot work latches or fruit bags (**cannot open storage**) |

### Rare (4 slots)

| id | English | Form | Duration | Habitat | Key abilities | Cost (body only) |
|---|---|---|---|---|---|---|
| `jellybloom` | Jellybloom | jellyfish | 360 s | Mirrorlake mid-water | swim 1.6, breath +40 s, self-glow, immune to poison, fov 95 | Almost immobile on land; fish avoid you (no communication with water life) |
| `frogpear` | Frog Pear | frog | 420 s | Mirrorlake reeds · rain pools | **breatheAir:false**, jump 2.4, swim 2.4, night vision 0.3, stealth 0.5, fov 100 | **The skin must stay wet: after 90 s out of water it dries and vitality drains**; too small: cannot reach high fruit, cannot push a door open |

### Legendary (12 slots)

| id | English | Form | Duration | Habitat | Key abilities | Cost (body only) |
|---|---|---|---|---|---|---|
| `bruinfig` | Bruin Fig | bear | 480 s | Northern Ridge rock face · hibernation den | cold immune, aura 8, step 1.1, size 1.4×1.5 | **No fine motor control** (cannot pick small fruit, cannot open storage); **weight**: thin ice breaks, wooden bridges collapse |

**Which of those costs the prototype enforces**: the frog's skin, the owl's daylight and the ridge cold. `dryTimer` drains vitality 90 s after a frog body leaves the water; `nightVision` brightens the dark for the body that has it and washes that same body's daylight out; the Ashscale cold takes vitality above y26 and a bear body never feels it. What is still only written down: talons and claws "cannot open storage" (every body opens it), a frog "cannot reach high fruit" (harvest reach is one fixed distance for every body), thin ice does not break, no bridge collapses. Every ability in the Key abilities column is read by the code — see §4.

**Why there is no fifth**: the fruit table is a mirror of the animal table. Adding a fruit means adding a niche, a row in the attitude matrix and a new set of gates (03 §3). Four is what can be read in ten seconds; the next one has to earn that.

## 4. Form ability fields

The last column is the state of the prototype, not the ambition. `game/test/reach.js`
reads the data and the code and prints this split on every run, so a field cannot
sit here looking implemented while nothing reads it.

| Field | Meaning | What the player feels | Prototype |
|---|---|---|---|
| `size[w,h]` | collision box in metres | how low a hole you can enter; decides whether a 1×1 passage fits | live |
| `speed` | land movement multiplier | bear 1.1 / frog 0.9 / jellyfish 0.5 | live |
| `jump` | jump force multiplier | frog 2.4 / bear 0.9 | live |
| `swim` | underwater movement multiplier | frog 2.4 / jellyfish 1.6 | live |
| `fly` | flight thrust (0 = cannot fly) | only the owl, 5.2 | live |
| `glide` | unpowered gliding: the fall speed cap, as a fraction of normal | owl 0.35 — let go of the key and the owl stops hanging in the air: it comes down at a third of the speed you do, keeping the ground speed it had | live |
| `breatheAir:false` | breathe underwater | only the frog | live |
| `airBonus` | extra seconds of held breath | jellyfish +40 | live |
| `dryTimer` | seconds out of water before the skin starts to dry (amphibian bodies) | only the frog, 90 | live |
| `nightVision` | brightening in the dark, 0–1, and the same eye overwhelmed by daylight | owl 0.75 / frog 0.3 | live |
| `glow[r,g,b]` | self-illumination | jellyfish | live |
| `stealth` | creature alert-radius multiplier | owl 0.45 / frog 0.5 = hard to spot | live |
| `aura` | intimidation radius | bear 8 = small animals scatter as you approach | live |
| `coldImmune` | the altitude cold of the northern ridge does not bite | bear | live |
| `poisonImmune` | the lamp jellyfish sting does not bite | jellyfish | live |
| `step` | auto step-up height in metres | bear 1.1 = walks up any stair | live |
| `fov` | field of view | frog 100 / bear 68 | live |
| `hand` | first-person hand model | hand/talon/web/claw/tentacle | live |

Two of those fields are switches rather than numbers: `coldImmune` and
`poisonImmune` change what can hurt you at all, not how much. They are also the
two the valley advertises hardest — the Ashscale text promises a bear body
shrugs off the cold, and the Mirrorlake text puts a field of stinging jellyfish
on the lakebed exactly where the fruit grows. Both are rules the code runs now.

`tongue` used to sit on this table (frog, 4 m of plucking reach). It is gone: the
frog's niche is swimming and breathing water, and a second way of reaching
things would have made the size gate — a frog fits a 1×1 gap a bear will not —
one door among several instead of the only one.

All twenty fields on the four forms are read by the code. `game/test/reach.js`
re-asks that question on every run and fails if a field is added to the data and
nothing in `game/src/` reads it, so this column cannot quietly rot back into
advertising.

**Note that `size` is a hard gate**: a frog at 0.5×0.5 fits a 1×1 root hole and the gaps between reeds; a bear at 1.4×1.5 does not — that is the physical implementation of "weight collapses the bridge" and "this body will not fit that door", not just flavour text.

## 5. Transformation rules

### 5.0 The inheritance rule: every ability, every fragility

Transformation is not putting on equipment, it is changing bodies. **You inherit everything the animal can do and everything it cannot** — all of its power and all of its fragility.

Costs come from exactly two places:

| Source | Examples | Why |
|---|---|---|
| **this body cannot** | claws and jaws cannot do fine work (no picking small fruit, no opening storage); a 1.4×1.5 body will not fit a low hole; weight breaks thin ice and wooden bridges; the skin dries after 90 s out of water; photophobic by day | you changed body, so you changed the ability table |
| **how the world reacts to this body** | fish avoid you; an owl leaves when you walk up — as a human, and just as fast as a brown bear; the lake's own animals ignore a jellyfish shape and do not ignore yours | they do not recognise *you*, they recognise this body |

**The mind is untouched.** A form never makes you want anything and never stops you wanting anything. Inside a bear's body you are still you: what you think, what you fear, what you decide — exactly as in a human shape.

The one exception is a **body reflex**: this body startles before you have decided to (`fright`). When something charges into you, the flinch burns air and drains the time bar faster. That is physiology, not psychology — you cannot stop the flinch, but you still decide what to do next.

### 5.1 The time bar

- The countdown starts when you eat it; the bottom of the HUD shows the form name and the remaining time.
- Time out → you revert to human shape.
- Revert deliberately: press `R` (ends early, no time refunded).
- **Eat another fruit while you are already in a body and you simply change into that one.** The body you were in ends now, and the fruit you ate does exactly what it says. There is no organ that holds two magics, no counter of how many you have swallowed, and no penalty for the order you eat them in. The cost is the body you ended early and the fruit you spent — which P3 has already priced for you.

**One body at a time is a law of the world, not a difficulty setting.** No talent, plant or tool makes two bodies coexist. The moment one backpack could carry two bodies, every door in the valley stops being a decision about *which body to arrive in* and becomes a shopping list.

## 6. The picking interaction

| Step | Presentation |
|---|---|
| Crosshair on a fruit block | highlight + prompt "E — pick Owlberry (common, 1 slot)" |
| Press E | the fruit block disappears, backpack +1, rarity and slot cost announced |
| Backpack full | "Backpack full (24/24 slots) — go back to the cellar first." The fruit does **not** drop, it stays where it is |
| The fruit block | a faintly self-lit small box (0.44³ body + two small leaves), colour = the rarity ring colour |

Fruit block ids 40–43 (4 kinds), non-solid, non-opaque, `emis:1` — at night you can only see them because they glow themselves. That is the implementation of "at night you can see the Owlberry faintly reflecting light".
