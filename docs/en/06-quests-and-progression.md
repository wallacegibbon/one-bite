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

## 3. The seven invitations (quests are not a plot)

There is no main line, no villain and no ending. A quest is an **invitation to use a body**, and it is the only manual the game has: each one teaches one gate -- a place you can only reach one way, or a thing you can only carry one way.

| # | Invitation | What it teaches | Body needed |
|---|---|---|---|
| q1 | Know the main cellar | fruit dies; storage exists | none |
| q2 | Three owlberries | picking, slots, dormancy | none |
| q3 | Wing of night | flight, and the time bar in the air | owl |
| q4 | The lake's ticket | breathing, drowning, the deep | merrow |
| q5 | The grove's pass | a shape is not a disguise: the grove reads the body | unicorn |
| q6 | The ember at cloud top | altitude, and what a legendary fruit costs | flying apex *(pending the roster decision)* |
| q7 | The greenhouse divider | rarity costs one slot less | none |

Nothing in the valley is waiting to be fixed. Do none of these and the valley is unchanged: the fruit still ripens, the badgers still come, the fog still forgets.

**End state of all seven**: the player can reach every habitat, carry what they need, and read a fruit at a glance. That is the whole of progression.

> Removed with the simplification of the setting (01): the Mother Bloom's amnesia, the smuggling company, the three endings. Fruit that existed only for them is marked pending in 04.

## 4. Side quests (12, full design)

| Side quest | Trigger | Content |
|---|---|---|
| The moth road | follow a moth swarm at night | it leads to the nearest water, unlocking 3 hidden cellar-tree anchors |
| The bear's cellar | find a bear-dug hole on Ashscale Ridge | inside are pits that went dormant 300 years ago — planting one revives 1 missing fruit species |
| The law unoverturned for 300 years | the Lanternrow chicken coop | as a fox, stealing "what is on the ground" is legal; stealing what is on the table is not |
| The spider's ledger | the Old Orchard | destroy the Silkberry nests → the beams collapse → a new way down to the cave floor (a shortcut) |
| Pendulum's three | store an Owlberry in the main cellar | unlocks owl post |
| The bell in the sunken tower | after the lake's ticket (q4) | trade with Coral Tongue |
| The empty slot in the fog | after a veilbeast touched you | the fruit you lost shows up on a different tree |
| Why Old Mei does not eat | store 50 fruit in total | the Embercore-scent event |
| The oldest tree | the Old Orchard | count the rings of the thickest tree in the valley |
| Greyglove's ledger | Quill's camp | shows which fruits were shipped out (codex-completion clues) |
| Empty seedlings | plant 20 empty pits | a 15% revival rate, the player's own "restoration garden" |
| Something large in the fog | after reaching the isles | a shape that is not yours *(pending the roster decision)* |

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
