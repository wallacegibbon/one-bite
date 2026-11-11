# 04 · Fruit and Transformation

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

The valley currently grows **one of these five rungs** — common. The ladder stays: it is a law of storage, not a shopping list.

One important corollary: the Frog Pear costs 1 slot, so the backpack's 24 slots hold twenty-four of them — the constraint is no longer space but time, since each one decays after 1500 s (25 min).

### 1.1 Regrowth

A picked fruit block does not vanish forever — the tree's roots send nutrients back. The time required scales with rarity (table above), with the actual value randomised within ±20% so that a batch never ripens at once. Rules:

- Only **fruit blocks** regrow; plants do not (otherwise cellar stones could be farmed infinitely).
- The regrow timer is **saved in the save file** and does not advance while the game is closed — the valley does not wait for you.
- If the original spot has been taken by another block (the player felled the tree, or the spot was otherwise filled), that regrowth is **cancelled**; nothing is force-placed.
- Design intent: the valley never gets emptied out, but "that tree from yesterday" is not guaranteed to be there today. The longest cycle of the ladder is exactly the round-trip cost of an expedition.

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
- The game announces dormancy explicitly: "Frog Pear went dormant — all that is left is a pit. Plant it and it may still fruit."
- **There are no "preservation" items.** The only way to slow decay is storage.

## 3. The full fruit table (1 kind)

### Common (1 slot)

| id | English | Form | Duration | Habitat | Key abilities | Cost (body only) |
|---|---|---|---|---|---|---|
| `frogpear` | Frog Pear | frog | 420 s | Mirrorlake reeds · rain pools | **breatheAir:false**, and the animal's own motion — **1.8 m/s** on land, a **0.73 m** hop about every **0.9 s**, **4.6 m/s** through water — every one of those read from the frog's own row, not from this record (§4), night vision 0.3, stealth 0.5, fov 100 | **The skin must stay wet: after 90 s out of water it dries and vitality drains**; **slow where the animal is slow: 1.8 m/s on land, and this body has no sprint at all** — the lake is where it is quick; too small: cannot reach high fruit, cannot push a door open |

**Which of those costs the prototype enforces**: the frog's skin and the dark. `dryTimer` drains vitality 90 s after a frog body leaves the water; `nightVision` brightens the dark for the body that has it and washes that same body's daylight out. What is still only written down: a frog "cannot reach high fruit" (harvest reach is one fixed distance for every body). Every ability in the Key abilities column is read by the code — see §4.

**Why there is no second**: the fruit table is a mirror of the animal table. Adding a fruit means adding a niche, a row in the attitude matrix and a new set of gates (03 §3). One is what the valley currently grows; the next one has to earn its ten seconds.

## 4. Form ability fields

The last column is the state of the prototype, not the ambition. `game/test/reach.js`
reads the data and the code and prints this split on every run, so a field cannot
sit here looking implemented while nothing reads it.

| Field | Meaning | What the player feels | Prototype |
|---|---|---|---|
| `size[w,h]` | collision box in metres | how low a hole you can enter; decides whether a 1×1 passage fits | live |
| `breatheAir:false` | breathe underwater | only the frog | live |
| `dryTimer` | seconds out of water before the skin starts to dry (amphibian bodies) | only the frog, 90 | live |
| `nightVision` | brightening in the dark, 0–1, and the same eye overwhelmed by daylight | frog 0.3 | live |
| `stealth` | creature alert-radius multiplier | frog 0.5 = hard to spot | live |
| `step` | auto step-up height in metres | human 0.55 / frog 0.3 — the height a body steps up without jumping | live |
| `fov` | field of view | human 76 / frog 100 | live |

`tongue` used to sit on this table (frog, 4 m of plucking reach). It is gone: the
frog's niche is swimming and breathing water, and a second way of reaching
things would have made the size gate — the gap only the frog's 0.5×0.5 box fits through —
one door among several instead of the only one.

**A form carries no motion, and used to.** `speed`, `jump`, `hop`, `swim` and
`turn` sat on the table above as multipliers on the body you start in: the frog
read `speed 0.9 / jump 1.3 / swim 1.1 / hop {up: 0.72, kick: 1.25}`, which made a
worn frog cross ground at **4.23 m/s** and throw itself **1.31 m** — a half-metre
animal at a person's speed, in the shape of a frog. Every one of them is gone.
How a body moves is written once, in the animal's own row in
`game/data/creatures.js` (03 §3), and `Player.moveDef` in `src/entities.js` reads
that row for the animal the fruit names. So what the frog's row says is what the
body you wear does: **1.8 m/s** on land, a launch of **6.0 m/s** that reaches
**0.73 m** over the feet about every **0.9 s**, **4.6 m/s** through water, a turn
of **0.9** rad/s. Measured, not asserted: `test/play.js` puts the body worn from a
frog and one of the valley's own frogs through the same actions and reads both
against the row — the rate they leave the ground with **5.617 m/s** for both (the
row's 6.0 less the one frame that spends gravity), the apex **0.73 m** for both,
**36%** of the frames of a straight crossing spent off the ground for both, and
**1.80 m/s** and **4.58 m/s** across ground and through water against the row's 1.8
and 4.6. The body you start in is a record of the same shape —
`game/data/player.js`, 4.7 m/s, a launch of 8.3 m/s, a turn of 1.6 — and it is
measured against its own numbers the same way, so making the animal honest moved
nobody: a person still crosses at 4.7 m/s. `game/test/shots.js` films the same
claim: the `hop` strip and the `animal` strip run one window of 2.2 s over the same
corridor, one through a body worn from a frog and one through the animal itself,
and both films come back with an arc of 0.73 m and a launch of 5.617 m/s.

All seven fields on the frog form are read by the code. `game/test/reach.js`
re-asks that question on every run -- nine keys on the form record in all, the
seven plus the form's own display name in each language -- and fails if a
field is added to the data and nothing in `game/src/` reads it, so this column
cannot quietly rot back into advertising. It also prints the two records of the
body you can be in -- the form record and the human one -- and the motion fields
are read from `data/creatures.js`, not from here, which is why this table has no
speed on it at all.

**Note that `size` is a hard gate**: a frog at 0.5×0.5 fits a 1×1 root hole and the gaps between reeds; a human at 1.8 m tall does not fit the hole — that is the physical implementation of "this body will not fit that door", not just flavour text.

The same box is what the **drawn body** has to fit. `game/test/node-smoke.js` measures every model against the box its creature declares and fails when the model overhangs it (07 §1 explains why the measurement is a radius and not a width): a body that is wider than its box gets clipped by geometry it can see itself not touching.

## 5. Transformation rules

### 5.0 The inheritance rule: every ability, every fragility

Transformation is not putting on equipment, it is changing bodies. **You inherit everything the animal can do and everything it cannot** — all of its power and all of its fragility.

Costs come from exactly two places:

| Source | Examples | Why |
|---|---|---|
| **this body cannot** | a 0.5×0.5 body will not reach high fruit or push a door open; the skin dries after 90 s out of water | you changed body, so you changed the ability table |
| **how the world reacts to this body** | the frogs on the shore ignore a human body, and settle — calm, staying in your group — only when you are wearing one of their own | they do not recognise *you*, they recognise this body |

**The mind is untouched.** A form never makes you want anything and never stops you wanting anything. Inside a frog's body you are still you: what you think, what you fear, what you decide — exactly as in a human shape.

The one exception is a **body reflex**: this body startles before you have decided to (`fright`). When something charges into you, the flinch burns air and drains the time bar faster. That is physiology, not psychology — you cannot stop the flinch, but you still decide what to do next.

### 5.1 The time bar

- The countdown starts when you eat it; the bottom of the HUD shows the form name and the remaining time.
- Time out → you revert to human shape.
- Revert deliberately: press `R` (ends early, no time refunded).
- **Eat another fruit while you are already in a body and you simply change into that one.** The body you were in ends now, and the fruit you ate does exactly what it says. There is no organ that holds two magics, no counter of how many you have swallowed, and no penalty for the order you eat them in. The cost is the body you ended early and the fruit you spent — which P3 has already priced for you.
- **The body you are about to wear has to fit where you are standing.** §4 makes the collision box a hard gate: a person at 0.62×1.8 does not fit the low crevice a 0.5×0.5 frog fits. Eating it there is refused — the fruit stays in the backpack, nothing is spent, and the valley says why. A body that ends on a timer cannot be refused, so the body is moved out of the geometry instead: sideways when there is room beside it, otherwise up onto the block that was in the way.

**One body at a time is a law of the world, not a difficulty setting.** No talent, plant or tool makes two bodies coexist. The moment one backpack could carry two bodies, every door in the valley stops being a decision about *which body to arrive in* and becomes a shopping list.

## 6. The picking interaction

| Step | Presentation |
|---|---|
| Crosshair on a fruit block | highlight + prompt "E — pick Frog Pear" |
| Press E | the fruit block disappears, backpack +1, rarity and slot cost announced |
| Backpack full | "Backpack full (24/24 slots) — go back to the cellar first." The fruit does **not** drop, it stays where it is |
| The fruit block | a faintly self-lit small box (0.44³ body + two small leaves), colour = the rarity ring colour |

Fruit block id 40 (1 kind), non-solid, non-opaque, `emis:1` — at night you can only see it because it glows itself.
