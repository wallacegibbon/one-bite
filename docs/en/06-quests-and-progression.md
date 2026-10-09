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
| `q4` | The ticket to Mirrorlake | become a frog, get in the water, take a Frog Pear from the sill of the sunken tower | the two-stage water gate (breath → breathing through skin) | obtain frogpear |
| `q5` | The pass into the Deep Grove | become a deer, follow the deer path into the Deep Grove, pick a Stagcap | the attitude matrix *is* the pass | obtain stagcap |
| `q6` | The old beams of the Cloudspire | fly to the cloud tops and pick a Silkberry off the old beams (spiders do not welcome guests) | altitude + a body that spins silk | obtain silkberry |
| `q7` | The silver mesh in the greenhouse | go to Starfall's fruit greenhouse (the cellar) and find the silver divider | backpack upgrade: rare and above −1 slot | stand within 6 m of `greenhouse` (y inside −6…+10) |

Quests appear as a checklist in the codex panel (J); completing one announces "✔ Done: …". **No reward popup, no XP** — the reward is "you can go there now".

Finishing q4 also grants `pouch2` (Deep Pouch, +6 slots): one dive in Mirrorlake brings back Frog Pears at 4 slots each, and a 24-slot backpack cannot carry a useful amount.

## 3. The seven invitations (quests are not a plot)

There is no main line, no villain and no ending. A quest is an **invitation to use a body**, and it is the only manual the game has: each one teaches one gate — a place you can only reach one way, or a thing you can only carry one way.

| # | Invitation | What it teaches | Body needed |
|---|---|---|---|
| q1 | Know the main cellar | fruit dies; storage exists | none |
| q2 | Three owlberries | picking, slots, dormancy | none |
| q3 | Wing of night | flight, and the time bar in the air | owl |
| q4 | The lake's ticket | breathing, drowning, skin, drying out | frog |
| q5 | The grove's pass | a shape is not a disguise: the grove reads the body | deer |
| q6 | The beams at cloud top | altitude, and a body that climbs and spins silk | owl (fly) or pangolin (climb) + Leaper |
| q7 | The greenhouse divider | rarity costs one slot less | none |

Nothing in the valley is waiting to be fixed. Do none of these and the valley is unchanged: the fruit still ripens, the bear still comes, the fog still makes you forget.

**End state of all seven**: the player can reach every habitat, carry what they need, and read a fruit at a glance. That is the whole of progression.

> Removed with the simplification of the setting (01): the mother tree's amnesia, the three endings, and the fruit and creatures that existed only for them. The Greyglove Trading Company stayed — it is not a villain, it is an institution that ships fruit out, and the valley's border (01 §3) is its opponent.

## 4. Side quests (12, full design)

| Side quest | Trigger | Content |
|---|---|---|
| The chorus after rain | listen to the shore of Mirrorlake after rain | follow the first frog that starts calling (Old Drum) and it takes you to the only tower entrance the reeds have not blocked |
| A deer path is not a road | follow a herd of deer | a deer path always leads to water; along it you unlock 3 hidden cellar-tree anchors |
| The brass bell in the sunken tower | after the lake's ticket (q4) | carry the bell off the tower sill back to the Frogshall — Old Drum recognises it |
| The bear's cellar | find a bear-dug hole on the Northern Ridge | inside are pits that went dormant 300 years ago — planting one revives 1 missing fruit species |
| The empty burrow | the mounds of the Old Orchard | dig out a burrow that is already empty: at the bottom is a whole store of pits that someone carried off, and nobody knows who |
| The spider's ledger | the Old Orchard | destroy the Silkberry nests → the beams collapse → a new way down to the cave floor (a shortcut) |
| Pendulum's three | store an Owlberry in the main cellar | unlocks owl post (once every 3 days, fruit you dropped far away is carried to the nearest store) |
| The empty slot in the fog | after losing a fruit at the fog's edge | that fruit turns up on a different tree — not the same tree, not even the same kind |
| Why Old Mei does not eat | store 50 fruit in total | the Bruin Fig scent event: she only says "I smelled one. That was enough." |
| Greyglove's ledger | Quill's camp | shows which fruits were shipped out (codex-completion clues) |
| Empty seedlings | plant 20 empty pits | a 15% revival rate, the player's own "restoration garden" |
| The name on the old beam | after reaching the old beams of the Cloudspire | a name carved into the beam three hundred years ago, which is not yours and not anyone's |

## 5. The codex (J key)

Three tabs:

1. **Fruit codex**: 7 cells (40 in the full design), undiscovered ones show as "?". Discovered ones show: name, rarity, slot cost, dormancy time, habitat, form abilities, side effect, lore.
2. **Creature codex**: 7 species, showing the dex text + its current attitude toward you (live, changes with your form).
3. **Quest list**: the current quest's hint, with no reward shown.

Codex completion is the **only growth metric that is recorded**, and it grants no numeric reward.

## 6. Death and failure

| Situation | Handling |
|---|---|
| vitality reaches zero | revive at the main cellar; **every backpack fruit drops at the death spot** (a drop block is spawned, retrievable) |
| drowning | same as above |
| drying out (frog form, 90 s out of water) | same as above — an amphibian body drowns on the shore, not in the water |
| falling (y < −2) | teleported back to y30 + 1.2 damage (prototype); the full design is "you land in the nearest treetop" |
| the Grey Veil | no death, only an announcement + the minimap fails; the full design is "leaving costs 1 fruit permanently at random" |
| time bar runs out | no penalty, you simply revert |

**Drops being retrievable** is deliberate: it turns death into "my things are over there, I have to go back", not "reload". It also meshes death with fruit spoilage — if you get back too late, every dropped fruit has become a pit.

## 7. Time

| Item | Prototype | Full design |
|---|---|---|
| one day | 420 s | 1200 s |
| sunrise / dusk / night | 6 / 18 / 21 o'clock | same |
| what night does | nocturnal creatures emerge, fruit self-glow becomes visible, some creatures change attitude | + the frogs after rain, the Glowglade pulsing |

Time is not a pressure source (the player never starves); the pressure comes only from **the shelf life of fruit**.
