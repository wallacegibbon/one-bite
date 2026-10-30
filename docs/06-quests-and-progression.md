# 06 · Life and Progression

## 1. Progression philosophy

**There are no levels, and there is no quest list.** The player's "progress" is only three things:

1. **Terrain you can enter** (decided by your forms)
2. **Fruit you can carry** (decided by backpack and storage)
3. **Fruit you can name** (decided by the codex)

The valley hands over storage the way a life answers a life: fruit put into the main cellar is answered with a larger pouch, a fruit brought back from the lake with a deeper one, a body standing at the greenhouse door with a finer mesh. Each handover is announced once, in the valley's own voice — the upgrade's own words, a thank-you or a finding — and never as a completion: there is no checklist, no hint, no "done" line in the log, and no reward popup. The reward is "you can carry more now", and you notice it the next time the pack is full.

## 2. The three deeds (implemented)

A **deed** is a fact the valley has seen you do, and only three of them matter. A deed carries no text the player reads — no title, no hint, no verification shown anywhere — so the table below is the whole of what this chapter knows about them, and the names and the handovers are copied out of `game/src/game.js` and `game/data/fruits.js` (the checker in `game/test/docs-sync.js` keeps it that way):

| id | Deed | What it hands over | Where the valley sees it |
|---|---|---|---|
| `cellar` | Storing fruit | Pouch | fruit in the main cellar |
| `lake` | Swimming Mirrorlake | Deep Pouch | a Frog Pear in the pack or a store |
| `greenhouse` | Reaching the greenhouse | Silver Divider (rare fruit costs one slot less) | standing within 6 m of the greenhouse door (y inside −6…+10) |

Sealing a deed is silent. The only line the valley says is the handover itself: Old Mei's thanks in Lanternrow, the waterproof satchel in the sunken tower, the silver mesh in the keep's greenhouse.

`lake` is the only deed that verifies a **body** rather than a fruit: the Frog Pear on the sill of the sunken tower stands under the water of the lake, and a human body does not breathe in it — so the deed is not "you own one", it is "you are in the water in a body that breathes through its skin".

## 3. No main line

There is no main line, no villain and no ending. A deed is not a quest, an invitation or a lesson — it is the valley noticing a life being lived, and the notice is the storage. Do none of the three and the valley is unchanged: the fruit still ripens, the fog still makes you forget, and no place holds its breath.

**End state of all three**: the player can reach every habitat, carry what they need, and read a fruit at a glance. That is the whole of progression.

## 4. No side content

There is no second tier of content. The three deeds are the whole of what the valley notices: nothing waits in a hollow, no named animal asks you to fetch a thing for it, no name carved on a beam is waiting to be read.

This section used to be a 12-row design table. After the roster and the magic were simplified it was the odd thing out: **every row in it was unimplemented**, and together the rows were the reason the map promised more than it paid — the hollow that answers dropped stones, the mounds in the orchard, the beams still standing, the grove with no door. Each of those was a place held open for a quest that was never going to arrive, and two of the rows depended on animals the valley no longer has.

What stands in their place is the sentence the creature chapter already uses: the valley keeps its animals to itself until each one arrives with a fruit, a niche and a door only it can open. Until then a place may simply **be** there — dark, deep, good for nothing. That is not a hole to fill; it is the same kind of absence the fog is made of.

If a place ever earns a fourth notice, it has to be noticed the way the three are: by a fact the valley can see from where the player stands, answered with storage, never with text. That is the only kind of notice this game has, and there are exactly three of them.

## 5. The codex (J key)

One scrolling panel, three sections:

1. **You**: the epithet the valley uses for you, the name you set if any, and the id the world stores (03 §6).
2. **Fruit codex**: 1 cell, showing "???" until the fruit is discovered. Discovered, it shows: name, rarity, slot cost, dormancy time, lore, side effect, habitat.
3. **Creature codex**: 2 species, showing the dex text, or "not yet observed" for one you have not met.

The deeds are not in the codex. There is no section that lists them, marks them done, or quotes a hint: a deed is a fact, and a fact does not need a panel. What the valley keeps instead is the name it starts to use for you (s6).

Codex completion is the **only growth metric that is recorded**, and it grants no numeric reward.

## 6. The epithet (the only place a deed is spoken)

The valley does not keep a record of what you have done; it changes the word it uses for you. The epithet is read off the deed list (the table and the writing rules live in 03 §6): fruit in the cellar and "the fruit counter" becomes "the cellar-keeper", a Frog Pear out of the lake and it becomes "the one who swam Mirrorlake", and when all three are done the valley says "the one the valley remembers". A later one overrides an earlier one, and when it changes the game announces it once in the log — the only line in the game where a deed is spoken at all, and even that line names you, not the deed.

## 7. Death and failure

| Situation | Handling |
|---|---|
| vitality reaches zero | revive at the main cellar; **every backpack fruit drops at the death spot** (a drop block is spawned, retrievable) |
| drowning | same as above |
| drying out (frog form, 90 s out of water) | same as above — an amphibian body drowns on the shore, not in the water |
| falling (y < −2) | teleported back to y30 + 1.2 damage (prototype); the full design is "you land in the nearest treetop" |
| the Grey Veil | it is the edge of the world: you cannot walk through it, and it drains your vitality while you press against it, until you can die of it; the full design is "leaving costs 1 fruit permanently at random" |
| time bar runs out | no penalty, you simply revert |

**Drops being retrievable** is deliberate: it turns death into "my things are over there, I have to go back", not "reload". It also meshes death with fruit spoilage — if you get back too late, every dropped fruit has become a pit. And it only works if the fruit lands somewhere a body can walk back to, so a drop comes to rest on the **surface** of the column it lands in — the ground, or the top of the water above it, never the lake floor — and a column whose surface is not level with the place the body fell (a roof, a cliff, the far side of a bank) takes the fruit to the body's own feet instead. `play.js` dies at three kinds of column and asks where each of the eight fruits ended up: none inside solid, none off the surface it should lie on, none under water, none further than 2.5 m from the body. Before this, dying on a lake shore put all eight under water, one of them 29 m down, and dying on a roof left all eight hanging in the air.

## 8. Time

| Item | Prototype | Full design |
|---|---|---|
| one day | 420 s | 1200 s |
| sunrise / dusk / night | 6 / 18 / 21 o'clock | same |
| what night does | nocturnal creatures emerge, fruit self-glow becomes visible, some creatures change attitude | + the frogs after rain, the Glowglade pulsing |

Time is not a pressure source (the player never starves); the pressure comes only from **the shelf life of fruit**.

The HUD's phase word follows **which way the sun is moving**, not only how high it is. `night` is symmetric about noon, so 07:00 and 19:00 carry the same value, and the game opens at 07:00 — which the label used to call *dusk*, in the morning. Before noon the word is dawn, after it dusk, and both are keyed (`hud.dawn` / `hud.dusk`) rather than assembled from parts.
