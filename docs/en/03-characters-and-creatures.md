# 03 · Characters and Creatures

[中文: ../cn/03-角色与生物.md](../cn/03-角色与生物.md)

Source of truth: `game/data/creatures.js` (7 species + the attitude matrix + codex text) and `game/data/player.js` (the identity layer: id / epithet / name).

**One species per ecological niche.** The valley has exactly seven openings: the night sky, digging in the ground, running in the forest, open water, shallows and shore, caves and beams, the ridge. Each animal takes one opening. There is no "second fox", and no in-between species that is "half otter, half merrow".

## 1. Characters

### The forager (16) — the name is the player's

A forager's apprentice from outside Lanternrow. **This character has no fixed name**: the valley does not address people by name, it addresses them by *what they have done* (see §6). Wherever these documents refer to the character they say "the forager" or use the second person.

- **Motivation**: they came into the valley carrying a hand-drawn fruit list. The list has 26 fruits on it; only 7 can still be found in the valley. They want to know whether the other 19 are gone, or whether the list is wrong.
- **Trait `mixed stomach`**: they can hold two magics down at once. An ordinary person eating two fruits dies of a magic-stomach churn; they only feel ill. This is the exception to the magic-stomach rule, and the precondition for mixed forms. **Note that it is a property of the character, not a law of the world** — in a multiplayer game it is rare, and you may never assume a given player has it (see §6).
- **Backstory slot**: who left that list belongs to the character, not to the world. In single player it is "the grandmother"; in multiplayer each character can have a different origin (a fellow apprentice, a creditor, a former Greyglove employee) — or the list can simply be held by Old Mei and the character merely recognises it.
- **What they do not say**: the list's original owner was driven out of the valley by the Greyglove Trading Company.

### Old Mei (老梅, ~70)

The keeper of the main cellar. She is the one who set the shape of Lanternrow's cellar: 96 slots, underground, constant temperature, spoilage rate ×0.1.

- She **never eats fruit**. She never transforms once in the whole game. Ask her and she says: "I smelled one Bruin Fig. That was enough."
- Function: teaching, the backpack upgrade (Pouch, +6 slots), the only source of cellar stones.
- Secret: she can smell a fruit's remaining freshness — to the minute. That is why the cellar never fills up with dormant fruit.

### Toban Quill (托班·奎尔)

The valley agent of the Greyglove Trading Company. In his thirties; his gloves are grey because "you cannot have fruit stains on your hands".

- He is not evil. His position is that the valley's fruit cures diseases outside, and the valley is only nine kilometres wide.
- He does three things: buys fruit (paying money, which is useless in the valley), sets fruit traps in the Old Orchard (block 80), and tries to carry one Silkberry through the Grey Veil.
- The correct way to use him: **he does not know which fruits go dormant**. The rare fruit you trade him for often has only half its time left.

### White Dew / Pendulum / Old Drum / One-Eye (named creatures)

| Name | Species | Location | Role |
|---|---|---|---|
| **White Dew** | Fallow Deer | Heart of the Deep Grove | The only deer that recognises the hand-drawn fruit list. It gored Quill twice |
| **Pendulum** | Screech Owl | Starfall Bell Tower | Head of the volunteer patrol. Will carry fruit you dropped far away back to the nearest store (once every 3 days) |
| **Old Drum** | Mirrorlake Frog | the Frogshall | The first frog to start calling after rain — the Frogshall is named after it. Wants a brass bell back from the sunken tower |
| **One-Eye** | Ash Bear | the Northern Ridge | The bear that has torn down three cellar trees. The town treats it as a colleague, not a disaster |

## 2. The creature attitude system

Attitude is not a numeric friendship score, it is the result of looking up **what shape you are in right now**.

| Attitude | Behaviour |
|---|---|
| `calm` | Ignores you, stays in your group |
| `ignore` | Does not react on its own, flees only when approached |
| `curious` | Comes closer to look (may lead you somewhere) |
| `flee` | Runs inside the `alert` radius |
| `hostile` | Charges / attacks inside the `alert` radius |

Lookup order: `attitude[species of the player's current form]` → `attitude.human` (when in human shape) → `attitude.default`. A creature meeting the same species as itself uses `self`.

### The full attitude matrix

Rows = creatures, columns = player forms. `·` = falls through to `default`.

| | human | owl | pangolin | deer | jelly | frog | spider | bear |
|---|---|---|---|---|---|---|---|---|
| Screech Owl | flee | calm | · | · | · | curious | · | flee |
| Burrow Pangolin | curious | · | calm | · | · | · | · | flee |
| Fallow Deer | flee | · | · | calm | · | ignore | · | flee |
| Lamp Jellyfish | · | · | · | · | calm | ignore | · | · |
| Mirrorlake Frog | · | flee | · | ignore | · | calm | · | ignore |
| Beamborn Spider | · | · | · | · | · | · | calm | ignore |
| Ash Bear | · | · | hostile | hostile | · | ignore | · | calm |

**Three design intentions you can read off the matrix:**

1. **The diagonal is all `calm`** — becoming that species is the pass. The Deep Grove runs on this, and so do the beams.
2. **Only the bear row contains `hostile`** — there are no monsters in the valley. Exactly one animal attacks the player on its own initiative, and what it attacks is **two other animals**, not "human shape". Danger comes from the food chain, not from malice.
3. **Frogs fear owls, owls are curious about frogs** — a complete predator chain you can read straight out of the table: whatever you become, you receive both that species' pass and that species' predator.

## 3. Creature table

| id | 中文 | English | Model | scale | Habitat | Activity | Speed | Alert | Pack | Fruit |
|---|---|---|---|---|---|---|---|---|---|---|
| `owl` | 猫头鹰 | Screech Owl | owl | 0.16 | Whisperwood / Starfall Keep / Glowglade / Cloudspire | night | 3.2 (fly 7.0) | 12 | 1 | Owlberry |
| `pangolin` | 穿山甲 | Burrow Pangolin | pangolin | 0.16 | Old Orchard / Whisperwood / Northern Ridge | dusk | 2.2 | 10 | 1 | Scaleberry |
| `deer` | 白尾鹿 | Fallow Deer | deer | 0.19 | Whisperwood / Deep Grove / Glowglade | both | 5.4 | 20 | 6 | Stagcap |
| `jelly` | 灯水母 | Lamp Jellyfish | jelly | 0.16 | Mirrorlake | both | 0.8 (swim 2.2) | 4 | 10 | Jellybloom |
| `frog` | 雨蛙 | Mirrorlake Frog | frog | 0.13 | Mirrorlake / Glowglade / Starfall Keep | both | 1.8 (swim 4.6) | 12 | 12 | Frog Pear |
| `spider` | 梁蛛 | Beamborn Spider | spider | 0.18 | Echo Hollow / Old Orchard / Cloudspire / Starfall Keep | both | 3.0 | 10 | 1 | Silkberry |
| `bear` | 灰熊 | Ash Bear | bear | 0.24 | Northern Ridge / Whisperwood | both | 5.0 | 22 | 1 | Bruin Fig |

Distribution of the 43 individuals in the prototype: owl 6, pangolin 4, deer 6, jelly 8, frog 12, spider 5, bear 2.

**Why only 7 species**: every species you add costs a fruit, a habitat, a row in the attitude matrix, and a whole set of "where can this body go" gates. A 7 × 8 matrix can be read in ten seconds; a 14 × 15 matrix has to be memorised. Once the setting was simplified, **the readability of the gates became content in its own right**.

## 4. Codex text (implemented in game)

One entry per species, always written as "verifiable fact + unverifiable rumour":

- **Screech Owl**: by day it is wedged in a tree hollow like a piece of wood that breathes. At night it is the ear of the whole wood. The owls of the valley do not catch mice — they catch "stolen fruit", and form Lanternrow's volunteer patrol.
- **Burrow Pangolin**: the tunnels it digs are far older than Lanternrow's cellar — the shape of the town's cellar is said to be copied from bears, and bears copied it from pangolins. Frightened, it rolls itself into a ball of scales that no tooth can get a hold of.
- **Fallow Deer**: a deer path is not a road, it is a "decision" pressed into the ground by the same herd over centuries. Follow a deer path and you will certainly find water, and you will certainly find a bear.
- **Lamp Jellyfish**: the lamps of Mirrorlake. The jellyfish field sits exactly in the outline of the sunken tower on the lakebed — from the surface, the tower glows.
- **Mirrorlake Frog**: after rain the whole shore calls at once, loud enough to drown out the bell tower. They do not drink — they drink through their skin.
- **Beamborn Spider**: lives in the beams, weaves no webs for insects, weaves webs to *repair buildings*. The beams of the Old Orchard and of the Cloudspire isles have not collapsed, and that is thanks to three hundred years of web they spun.
- **Ash Bear**: the bears of the northern ridge dig "fruit cellars" — they learned to bury fruit and eat it slowly long before humans did. They also tear down human cellar trees: a bear needs no backpack.

## 5. Magic plants (not creatures, but spread by creatures)

| id | 中文 | English | Rarity | Effect |
|---|---|---|---|---|
| `glowcap` | 荧光菇 | Glowcap | common | Glows by itself for 5 minutes after picking; can be placed as a waymarker |
| `leaper` | 弹弹菇 | Leaper | common | Jump +80% for 90 seconds; too many and your hands shake (camera jitter) |
| `drifter` | 雾隐菇 | Drifter | uncommon | Creature alert radius −70%, footsteps gone, 120 seconds; after eating it others cannot hear you speak |
| `thorn` | 刺刺菇 | Thorncap | uncommon | 90 seconds of melee damage reflection, movement −20% |
| `glowseed` | 发光种子 | Glowseed | common | Plant in any soil: a permanent point of light, usable as a cellar-tree anchor marker |
| `cellarseed` | 窖树种 | Cellar Stone | rare | Grows into a **cellar tree**: a 24-slot field warehouse, decay 1/3, visited by bears and fruit thieves |

Plants do not change your form, they give temporary buffs or tools. They occupy 1–4 fruit slots and compete with fruit for the same capacity — **"carry a light or carry fruit" is a decision every trip makes**.

## 6. Identity and naming (multiplayer readiness)

**The protagonist's name is not part of the setting.** The source of truth is `IDENTITY` in `game/data/player.js`.

Identity is split into three layers, and only the first survives a move to multiple players:

| Layer | Field | Decided by | Mutable | Unique | Notes |
|---|---|---|---|---|---|
| id | `id` | the system | no | yes | prefix `p-`, random idBytes 6 characters. This is all the world stores: cellar-tree ownership, owl post, the lake's ledger, beast residue |
| epithet | `epithet` | the world (by your deeds) | it changes | not guaranteed | all fiction text uses only this. Default "the fruit counter", upgraded as you do things |
| name | `name` | the player (press N) | yes | no | max nameMax 16 characters. Leaving it empty is perfectly fine |

### Why the worldview demands this anyway

The Grey Veil takes names first — it makes you forget *why you meant to come back*, and a name is the anchor of coming back. So every institution in the valley runs without names: the cellar keeps its books by shape and deed, the volunteer patrol recognises people by epithet, a frog recognises a shape and nothing else. **"Not using names" is a corollary of the worldview, not a concession to multiplayer.**

### The epithet table (`IDENTITY.epithets`)

| Trigger | Epithet | 中文 |
|---|---|---|
| default | the fruit counter | 数果子的 |
| q1 | the cellar-keeper | 存果人 |
| q3 | nightwing | 夜翼 |
| q4 | the one who swam Mirrorlake | 泅过镜湖的人 |
| q5 | the one who walked the grove | 走进深林的人 |
| q6 | the cloud-top webster | 云顶结网的人 |
| all quests | the one the valley remembers | 谷地记得的人 |

A later one overrides an earlier one; when it changes the game announces it once ("the valley has started calling you …").

### Writing rules (enforced by a test)

1. **No line of fiction may interpolate the player's name.** Use the epithet, or the second person. `docs-sync.js` fails when a fixed protagonist name appears in the documents.
2. The name appears only in UI (top-left HUD, the codex "you" block) — never in NPC lines, codex entries or quest text.
3. An epithet is **the world's verdict**, so it may be plain or even slighting (the default "the fruit counter" is) — renaming yourself does not change what the valley thinks of you.

### Multiplayer: already in place / still missing

**In place**: `id` is saved, cellar trees carry an `owner`, epithets are event-driven, name and identity are decoupled, and `mixed stomach` is a character trait rather than a law of the world.

**Still missing**: an identity service (the `id` issued by a server), storage ownership and sharing rights (the main cellar is currently communal), the Frogshall's ledger keyed by id, beast residue accumulated per character, NPCs remembering dialogue per id, and the resolution of attitude-matrix conflicts such as "two players walk into the Deep Grove as deer at the same time".
