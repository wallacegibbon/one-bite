# 06 · Quests and Progression

[中文: ../cn/06-任务与进程.md](../cn/06-任务与进程.md)

## 1. Progression philosophy

**There are no levels.** The player's "progress" is only three things:

1. **Terrain you can enter** (decided by your forms)
2. **Fruit you can carry** (decided by backpack and storage)
3. **Fruit you can name** (decided by the codex)

Quests are not a reward pipeline, they are **the manual for the gates**: every quest teaches one "what a new body can do".

## 2. Prototype quests (6, implemented)

| id | Name | Hint | What it teaches | Verification |
|---|---|---|---|---|
| `q1` | Know the main cellar | go to the Lanternrow cellar (press E to open) and store any fruit | the warehouse exists + decay multipliers | `stashes[0].items.length > 0` |
| `q2` | Three Owlberries | find 3 Owlberries in the oak hollows of the Whisperwood | habitat binding + night vision | owlberry ≥ 3 in the backpack |
| `q3` | Wing of Night | at night eat an Owlberry and fly above 30 metres | flight + the time bar | `form==='owlberry' && y > 30` |
| `q4` | The ticket to Mirrorlake | become a frog, get in the water, take a Frog Pear from the sill of the sunken tower | the two-stage water gate (breath → breathing through skin) | obtain frogpear |
| `q5` | One Bruin Fig | pick a Bruin Fig off the ridge rock: it costs 12 slots and sleeps in 7 minutes — get it into a cellar | a legendary fruit is a carry, not a collection | obtain bruinfig |
| `q6` | The silver mesh in the greenhouse | go to Starfall's fruit greenhouse (the cellar) and find the silver divider | backpack upgrade: rare and above −1 slot | stand within 6 m of `greenhouse` (y inside −6…+10) |

Quests appear as a checklist in the codex panel (J); completing one announces "✔ Done: …". **No reward popup, no XP** — the reward is "you can go there now".

Finishing q4 also grants `pouch2` (Deep Pouch, +6 slots): one dive in Mirrorlake brings back Frog Pears at 4 slots each, and a 24-slot backpack cannot carry a useful amount.

q3 is the only quest that verifies a **body** rather than a fruit: a human holding 18 seconds of breath can also swim to the sunken tower and take a Frog Pear, and a human standing on a branch owns Owlberries — but only a body with wings gets above 30 metres, so q3 is not "you own one", it is "you are in the air in a body that flies". q5 is the opposite — it verifies only the fruit, because the hard part of a legendary fruit is not reaching it but carrying it: 12 of your 24 slots, and it goes dormant in 7 minutes.

## 3. The six invitations (quests are not a plot)

There is no main line, no villain and no ending. A quest is an **invitation to use a body**, and it is the only manual the game has: each one teaches one gate — a place you can only reach one way, or a thing you can only carry one way.

| # | Invitation | What it teaches | Body needed |
|---|---|---|---|
| q1 | Know the main cellar | fruit dies; storage exists | none |
| q2 | Three owlberries | picking, slots, dormancy | none |
| q3 | Wing of night | flight, and the time bar in the air | owl |
| q4 | The lake's ticket | breathing, drowning, skin, drying out | frog |
| q5 | One bruin fig | a legendary fruit is a logistics problem: 12 of 24 slots, dormant in 420 s | brown bear (steps over 1.1 m ledges) — or two legs, jumping one at a time |
| q6 | The greenhouse divider | rarity costs one slot less | none |

Nothing in the valley is waiting to be fixed. Do none of these and the valley is unchanged: the fruit still ripens, the bear still comes, the fog still makes you forget.

**End state of all six**: the player can reach every habitat, carry what they need, and read a fruit at a glance. That is the whole of progression.

## 4. No side quests

There is no second tier of content. The six invitations are the whole quest set: nothing waits in a hollow, no named animal asks you to fetch a thing for it, no name carved on a beam is waiting to be read.

This section used to be a 12-row design table. After the roster and the magic were simplified it was the odd thing out: **every row in it was unimplemented**, and together the rows were the reason the map promised more than it paid — the hollow that answers dropped stones, the mounds in the orchard, the beams still standing, the grove with no door. Each of those was a place held open for a quest that was never going to arrive, and two of the rows depended on animals the valley no longer has.

What stands in their place is the sentence the creature chapter already uses: the valley keeps its animals to itself until each one arrives with a fruit, a niche and a door only it can open. Until then a place may simply **be** there — dark, deep, good for nothing. That is not a hole to fill; it is the same kind of absence the fog is made of.

If a place ever earns a quest, that quest has to teach a gate: a place only one body can reach, or a thing only one body can carry. That is the only kind of quest this game has, and there are exactly six of them.

## 5. The codex (J key)

Three tabs:

1. **Fruit codex**: 4 cells, undiscovered ones show as "?". Discovered ones show: name, rarity, slot cost, dormancy time, habitat, form abilities, side effect, lore.
2. **Creature codex**: 3 species, showing the dex text + its current attitude toward you (live, changes with your form).
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

**Drops being retrievable** is deliberate: it turns death into "my things are over there, I have to go back", not "reload". It also meshes death with fruit spoilage — if you get back too late, every dropped fruit has become a pit. And it only works if the fruit lands somewhere a body can walk back to, so a drop comes to rest on the **surface** of the column it lands in — the ground, or the top of the water above it, never the lake floor — and a column whose surface is not level with the place the body fell (a roof, a cliff, the far side of a bank) takes the fruit to the body's own feet instead. `play.js` dies at three kinds of column and asks where each of the eight fruits ended up: none inside solid, none off the surface it should lie on, none under water, none further than 2.5 m from the body. Before this, dying on a lake shore put all eight under water, one of them 29 m down, and dying on a roof left all eight hanging in the air.

## 7. Time

| Item | Prototype | Full design |
|---|---|---|
| one day | 420 s | 1200 s |
| sunrise / dusk / night | 6 / 18 / 21 o'clock | same |
| what night does | nocturnal creatures emerge, fruit self-glow becomes visible, some creatures change attitude | + the frogs after rain, the Glowglade pulsing |

Time is not a pressure source (the player never starves); the pressure comes only from **the shelf life of fruit**.

The HUD's phase word follows **which way the sun is moving**, not only how high it is. `night` is symmetric about noon, so 07:00 and 19:00 carry the same value, and the game opens at 07:00 — which the label used to call *dusk*, in the morning. Before noon the word is dawn, after it dusk, and both are keyed (`hud.dawn` / `hud.dusk`) rather than assembled from parts.
