# 06 · Quests and Progression

[中文: ../cn/06-任务与进程.md](../cn/06-任务与进程.md)

## 1. Progression philosophy

**There are no levels.** The player's "progress" is only three things:

1. **Terrain you can enter** (decided by your forms)
2. **Fruit you can carry** (decided by backpack and storage)
3. **Fruit you can name** (decided by the codex)

Quests are not a reward pipeline, they are **the manual for the gates**: every quest teaches one "what a new body can do".

## 2. Prototype quests (7, implemented)

| id | Name | Hint | What it teaches | Verification |
|---|---|---|---|---|
| `q1` | Know the main cellar | go to the Lanternrow cellar (press E to open) and store any fruit | the warehouse exists + decay multipliers | `stashes[0].items.length > 0` |
| `q2` | Three Owlberries | find 3 Owlberries in the oak hollows of the Whisperwood | habitat binding + night vision | owlberry ≥ 3 in the backpack |
| `q3` | Wing of Night | at night eat an Owlberry and fly above 30 metres | flight + the time bar | `form==='owlberry' && y > 30` |
| `q4` | The ticket to Mirrorlake | find an Otterkin → get in the water → take a Merrow Pear from the sunken tower | the two-stage water gate (breath → breathing) | obtain merrow |
| `q5` | The pass into the Grove | become a unicorn, walk into the Hoar Grove, pick a Unicorn Cherry | the attitude matrix *is* the pass | obtain unicorncherry |
| `q6` | The Embercore of the Cloudspire | fly to the dragon's nest and take an Embercore (mind the dragons) | legendary: 12 slots + dragons hostile | obtain embercore |
| `q7` | The silver mesh in the greenhouse | go to Starfall's fruit greenhouse (the cellar) and find the silver divider | backpack upgrade: rare and above −1 slot | stand within 6 m of `greenhouse` (y inside −6…+10) |

Quests appear as a checklist in the codex panel (J); completing one announces "✔ Done: …". **No reward popup, no XP** — the reward is "you can go there now".

## 3. The full seven-chapter main line

### Chapter 1 · Empty Fruit (teaching)

| Quest | Content |
|---|---|
| 1-1 Know the main cellar | same as q1 |
| 1-2 Three Owlberries | same as q2 |
| 1-3 The one with no taste | pick an **empty fruit** and eat it → introduces the Mother Bloom's amnesia |
| 1-4 Wing of Night | same as q3 |

**End state**: the player knows three things — fruit dies, where the warehouse is, and that some fruit is empty.

### Chapter 2 · Identification (Starfall Keep)

- 2-1 The four towers of the greenhouse (one rarity tier each, teaching "read the ring colour to know the slot cost")
- 2-2 The legendary tower is empty: "An Embercore used to sit here. It ate the other three."
- 2-3 Find the **Silver Divider** in the greenhouse (backpack upgrade: rare −1 slot)
- 2-4 The bell in the tower: it rings at midnight, and the bats leave the cave afterwards (teaching "activity windows")

**End state**: the player understands rarity = capacity + shelf life, and gets the first backpack upgrade.

### Chapter 3 · The Lake's Ledger (Mirrorlake)

- 3-1 The ticket to Mirrorlake (q4)
- 3-2 The jellyfish field *is* the tower's outline (locate the sunken tower by looking at the surface)
- 3-3 Coral Tongue's demand: return a brass bell (at the base of the sunken tower)
- 3-4 **Return vs take**: returning → the merrow give a Merrow Pear and open the village; taking → the lake remembers you (merrow permanently hostile, but the pear is yours immediately)

**End state**: the player first faces the price of "the valley does not cooperate with you".

### Chapter 4 · The Shape of the Grove

- 4-1 The grove border: a human shape gets gored (a forced failure, teaching the attitude matrix)
- 4-2 Slip in once along the deer path (deer form, unicorns are `curious`)
- 4-3 The first Unicorn Cherry on a fallen trunk at the grove's edge (q5)
- 4-4 White Dew remembers your grandmother — hands over the surviving page of the grandmother's fruit list (a clue to the 26 missing fruits)

**End state**: the player understands "transformation = swapping your social identity".

### Chapter 5 · Greyglove

- 5-1 The fruit traps in the Old Orchard (block 80): a human shape cannot dismantle them, you need an ash bear or a dragon
- 5-2 Toban Quill's offer: he pays for 12 slots of Embercore in exchange for being carried up to the Cloudspire
- 5-3 A cellar tree gets robbed (first encounter with the fruit thieves) → teaching "field storage betrays you"
- 5-4 Dismantle all 6 traps / or work for him (two branches, affecting chapter seven)

**End state**: the player realises the fruit drain is a matter outside the Grey Veil, and the cause of the Mother Bloom's amnesia.

### Chapter 6 · Cloudspire

- 6-1 The stepping-isle route (no flight: spider climbing + Leaper jumps)
- 6-2 The Embercore (q6): dragons are hostile, so you need a dragon form to sneak in → but dragons are hostile to each other (a paradox lesson)
- 6-3 The Phoenix Pit at dusk (time-limited)
- 6-4 Ashfall lands: the only dragon in the valley willing to land, because it is dying

**End state**: the player holds one of the finale's two items (Embercore / Mother Bloom bud).

### Chapter 7 · The Mother Bloom (three endings)

| Ending | Requires | Price |
|---|---|---|
| **Restitution** | Mother Bloom bud (12 slots) + 20 empty fruits | every fruit permanently −50% potency; you can never become a dragon |
| **Grafting** | Mother Bloom bud + Embercore (**24 slots = backpack completely full**) + Linnaeus's magic-stomach talent | the Mother Bloom dies; every rare fruit moves to the Cloudspire and must be harvested by flight |
| **Non-intervention** | nothing | the share of empty fruit in the codex grows +2% per week; the ending shot is an ordinary hillside |

The **physical difficulty of the grafting route** is deliberate: 12 + 12 = 24 = the backpack cap, meaning the player must walk the whole Old Orchard → Cloudspire → Mother Bloom route **carrying no supplies at all**. This is the game's final test of P3.

## 4. Side quests (12, full design)

| Side quest | Trigger | Content |
|---|---|---|
| The moth road | follow a moth swarm at night | it leads to the nearest water, unlocking 3 hidden cellar-tree anchors |
| The bear's cellar | find a bear-dug hole on Ashscale Ridge | inside are pits that went dormant 300 years ago — planting one revives 1 missing fruit species |
| The law unoverturned for 300 years | the Lanternrow chicken coop | as a fox, stealing "what is on the ground" is legal; stealing what is on the table is not |
| The spider's ledger | the Old Orchard | destroy the Silkberry nests → the beams collapse → the Mother Bloom's roots are exposed (a shortcut) |
| Pendulum's three | store an Owlberry in the main cellar | unlocks owl post |
| The bell in the sunken tower | chapter 3 | trade with Coral Tongue |
| The empty slot in the fog | after a veilbeast touched you | the fruit you lost shows up on a different tree |
| Why Old Mei does not eat | store 50 fruit in total | the Embercore-scent event |
| The Mother Bloom's rings | the Old Orchard | count the rings → the year the Grey Veil appeared |
| Greyglove's ledger | Quill's camp | shows which fruits were shipped out (codex-completion clues) |
| Empty seedlings | plant 20 empty pits | a 15% revival rate, the player's own "restoration garden" |
| The dragon that landed | after chapter 6 | accompany Ashfall on its last flight |

## 5. The codex (J key)

Three tabs:

1. **Fruit codex**: 15 cells (40 in the full design), undiscovered ones show as "?". Discovered ones show: name, rarity, slot cost, dormancy time, habitat, form abilities, side effect, lore.
2. **Creature codex**: 14 species, showing the dex text + its current attitude toward you (live, changes with your form).
3. **Quest list**: the current quest's hint, with no reward shown.

Codex completion is the **only growth metric that is recorded**, and it grants no numeric reward.

## 6. Death and failure

| Situation | Handling |
|---|---|
| vitality reaches zero | revive at the main cellar; **every backpack fruit drops at the death spot** (a drop block is spawned, retrievable) |
| drowning | same as above |
| falling (y < −2) | teleported back to y30 + 1.2 damage (prototype); the full design is "you land in the nearest treetop" |
| the Grey Veil | no death, only an announcement + the minimap fails; the full design is "leaving costs 1 fruit permanently at random" |
| time bar runs out | no penalty, you simply revert |

**Drops being retrievable** is deliberate: it turns death into "my things are over there, I have to go back", not "reload". It also meshes death with fruit spoilage — if you get back too late, every dropped fruit has become a pit.

## 7. Time

| Item | Prototype | Full design |
|---|---|---|
| one day | 420 s | 1200 s |
| sunrise / dusk / night | 6 / 18 / 21 o'clock | same |
| what night does | nocturnal creatures emerge, fruit self-glow becomes visible, some creatures change attitude | + phoenix (dusk only), the Glowglade pulsing |

Time is not a pressure source (the player never starves); the pressure comes only from **the shelf life of fruit**.
