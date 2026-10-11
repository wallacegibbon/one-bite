# 03 · Characters and Creatures

[中文: ../cn/03-角色与生物.md](../cn/03-角色与生物.md)

Source of truth: `game/data/creatures.js` (4 species + the attitude matrix + codex text) and `game/data/player.js` (the identity layer: id / epithet / name, and `HUMAN_FORM` — the body you start in, which is a body record like the animals' and not a rendering detail).

**One species per ecological niche.** The valley has three openings you can wear: the night sky, the shallows and the shore, the ridge. Each animal takes one opening. There is no "second fox", and no in-between species that is "half otter, half merrow". A fourth niche — open water — is filled by an animal **you cannot wear**: the lamps of Mirrorlake bear no fruit, so they change nothing about what a door or a crevice means.

## 1. Characters

### The forager (16) — the name is the player's

A forager's apprentice from outside Lanternrow. **This character has no fixed name**: the valley does not address people by name, it addresses them by *what they have done* (see §6). Wherever these documents refer to the character they say "the forager" or use the second person.

- **No talent and no past**: an ordinary forager, subject to every law of the valley. Eating a second fruit while already transformed simply changes them into that body, like anyone else — one body at a time, for them too (04 §5.1).
- **No backstory**: this character did not come into the valley for a reason the game is going to explain. They are here, they need to eat, and the valley is full of things they cannot reach yet. That is the whole premise and there is nothing waiting behind it.

### Old Mei (老梅, ~70)

The keeper of the main cellar. She is the one who set the shape of Lanternrow's cellar: 96 slots, underground, constant temperature, spoilage rate ×0.1.

- Function: teaching, the backpack upgrade (Pouch, +6 slots), the only source of cellar stones.
- She is the only person in the valley who never transforms. The game never asks her why, and she never brings it up.

### Pendulum / Old Drum / One-Eye (named creatures)

| Name | Species | Location | Role |
|---|---|---|---|
| **Pendulum** | Screech Owl | Starfall Bell Tower | Head of the volunteer patrol. Will carry fruit you dropped far away back to the nearest store (once every 3 days) |
| **Old Drum** | Mirrorlake Frog | the Frogshall | The first frog to start calling after rain — the Frogshall is named after it |
| **One-Eye** | Brown Bear | the Northern Ridge | The bear that has torn down three cellar trees. The town treats it as a colleague, not a disaster |

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

| | human | owl | frog | bear |
|---|---|---|---|---|
| Screech Owl | flee | calm | curious | flee |
| Mirrorlake Frog | · | flee | calm | ignore |
| Brown Bear | · | · | ignore | calm |
| Lamp Jellyfish | · | · | · | · |

**There is no `jelly` column.** A column is a body the player is wearing, and the lamps bear no fruit, so nobody can arrive in one. The row exists because the animal exists; every cell falls through to `default`, which is `ignore`.

**Three design intentions you can read off the matrix:**

1. **The diagonal is all `calm`** — becoming that species is the pass. It is not a disguise: the grove, the lake and the ridge read the body.
2. **No row contains `hostile`** — there are no monsters in the valley. Nothing here attacks the player on its own initiative any more: the two animals the bear used to hunt are gone, and what is left of danger is the weather, the water, the height, the cold on the ridge, and what your own body cannot do. All of it comes from the ground and from the body — none of it comes from what an animal intends. The lamps of Mirrorlake sting, and that is the same kind of danger rather than an exception to it: the animal does not react to you at all, it simply is stinging, the way the ridge simply is cold — and the answer is a body, not a weapon.
3. **Frogs fear owls, owls are curious about frogs** — a complete predator chain you can read straight out of the table: whatever you become, you receive both that species' pass and that species' predator. And an owl leaves the moment a bear walks in.

## 3. Creature table

| id | 中文 | English | Model | scale | Habitat | Activity | Speed | turn | Alert | Pack | Fruit |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `owl` | 猫头鹰 | Screech Owl | owl | 0.15 | Whisperwood / Starfall Keep / Glowglade / Cloudspire | night | 3.2 (fly 7.0) | 1.4 | 12 | 1 | Owlberry |
| `frog` | 雨蛙 | Mirrorlake Frog | frog | 0.13 | Mirrorlake / Glowglade / Starfall Keep | both | 1.8 (swim 4.6, hop) | 1.9 | 12 | 12 | Frog Pear |
| `bear` | 棕熊 | Brown Bear | bear | 0.24 | Northern Ridge / Whisperwood | both | 5.0 | 1.6 | 22 | 1 | Bruin Fig |
| `jelly` | 灯水母 | Lamp Jellyfish | jelly | 0.16 | Mirrorlake, on the outline of the sunken tower | both | 0.8 (swim 2.2) | 0.8 | 4 | 10 | **none** |

Distribution of the 30 individuals in the valley: owl 6, frog 12, bear 2, jelly 10.

**`turn` is agility, and it is a rate, not a stat**: the most radians a second this body may add to its heading **at its own cruising speed** — going half as fast it bends its course half as fast, because a turn is an arc and the speed sets how wide that arc can be. Nothing in the valley turns on the spot: the course bends, the body keeps going forward, and it gets where it was sent by carving rather than by being pointed. The form record of the same species carries the same number, because the animal and the body worn from it are one body.

Three things follow from that one field, and `play.js` measures each of them:

- **A turn costs speed, and the price is geometry.** To reach a place that lies close across, the animal has to slow until its own arc is tight enough to land there: the way to the target is a *chord* of the circle the body can hold, so the speed is `turn × d / (2 sin θ)`. Without that rule an animal sent to a place too close for its arc orbits it for the rest of the afternoon — measured: an owl sent to a point 1.8 m away flew 73 m around it and never came nearer than 1.8 m; with the rule the same 1.8 m takes 1.9 m of path.
- **One turn budget a frame, whoever spent it.** A body pressed against a cliff was being turned twice in the same frame — once by the steering, once by the slide along the wall — and came about at 3.2 rad/s on a record that says 1.6. The budget lands last, after everything else has had its say.
- **A walker goes round a wall, not into one.** When the next step is solid, the animal takes the passable side that points furthest back along the way it came and follows the contour; only when none of them does does it give up the target and rest. A bear used to spend 80% of an afternoon standing against a cliff and now walks 94% of it. Bodies that live in water already slid along walls inside their own mode — this is the walking mode catching up.

**A body keeps the space it is in.** `flyY` is the height a flying animal *likes*, not where it has to be: over a ridge, or over a crown that grows above the height it likes, it climbs over it, and the ceiling is the top of the world with room for the body left in it. The ground is read a few metres ahead as well as under the body, because a body that only asks where it is now begins climbing a second after it arrives, and at seven metres a second an owl spends that second inside the hill. Before this an owl held its spawn height through everything: over two hours of night 87 of 720 samples were inside solid ground, and an owl put down on a crown at y=44 had been given a flight height of 51.5 in a world 48 tall, so every one of its samples was outside the map.

**An animal is put down on the ground, not on the tree that grows out of it.** A crown and the trunk that holds it up are solid — the player climbs them and a body can stand on them — but they are not the surface of the valley. The spawn code scans a column from the top of the world, and it used to answer "the top of a spruce" in 509 of 600 tries: two bears standing on crowns at y=45, and a flyer whose flight height was then measured from the top of that tree. `terrainY` reads the column for the ground, and `N.TREE_BLOCK` (`src/world.js` — the list `worldgen` has always used to plant a tree) says which blocks a tree is made of, so the generator and the animals read one list. Two cases are counted rather than failed, and both are honest: a bear's shoulders sit inside a bush as it walks through one, and where a crown grows to the top of the world there is no air left above it for a body to keep.

The lamps are the one species placed by a **landmark** instead of a zone: `at: 'tower'`, `spread: 4` in the record, resolved against the habitat zone (`mirrorlake.tower`, which is also where `worldgen` builds the tower). The field is the tower's outline, so the tower is what places the field — "anywhere in a lake of radius 34" would put the lamps anywhere except over the tower. A `spread` is a **radius**, not a half-width: the landmark branch samples a disc, like every other branch of `samplePos`, and so does the wander roll that picks a target around `home`. A lamp therefore stands at most 4 m from the tower's centre and wanders at most 4 m past that, which is what makes "twice the spread" the honest bound the test checks.

**Why only 3 wearable species**: every species you can wear costs a fruit, a habitat, a row in the attitude matrix, and a whole set of "where can this body go" gates. A 3 × 4 matrix can be read at a glance; a 14 × 15 matrix has to be memorised. Once the setting was simplified, **the readability of the gates became content in its own right**. The lamps are the deliberate exception that prices the rule: a fruitless species still costs a model, a habitat, a row in the matrix and a place in the world, but it buys **no gate at all** — it is the cheapest animal to add and the least interesting one. It is in the valley to be light in the water, not to be a door.

It has one effect on the player, and the effect is not a body: **it stings** —
`sting: 0.25` on the animal record, vitality per second for every lamp you are
standing inside. Contacts stack, because a field is a field: stand where the
lamps overlap and you pay for each of them. But the field is a **ring**, not a
disc — the tower it is drawn around pokes up through the surface — so the exact
middle of it is dry ground and costs nothing. The immunity sits on the **frog**
body — the body this lake already gave you is the body its lamps are lit for —
and the log line that reports a sting names the answer out loud. The lamps hang
a metre or two under the surface, so the dive to the tower sills stays out of
reach of them.

They are also the first animal to actually use `locomotion: 'water'`, and that
mode had to be made honest: an animal that cannot leave the water is placed and
moved by the **water column** — a column has to hold at least two blocks of
water for the animal to be in it, the same test the spawn code makes — and it
hovers a metre or two under the surface without ever latching onto whatever is
above it. The sunken tower stands inside the lamp field, so the mode also had to
learn to swim **round** a wall rather than through one.

**The valley still holds animals it will not give you.** The places kept their names — the Deep Grove, the deer paths, Echo Hollow, the mounds in the Old Orchard — and the animals that made those names are not coming back until each one arrives with a fruit, a niche and a door only it can open. Until then they are absence, which is what the valley is made of.

## 4. Codex text (implemented in game)

One entry per species, always written as "verifiable fact + unverifiable rumour":

- **Screech Owl**: by day it is wedged in a tree hollow like a piece of wood that breathes. At night it is the ear of the whole wood. The owls of the valley do not catch mice — they catch "stolen fruit", and form Lanternrow's volunteer patrol.
- **Mirrorlake Frog**: after rain the whole shore calls at once, loud enough to drown out the bell tower. They do not drink — they drink through their skin.
- **Brown Bear**: the bears of the northern ridge dig "fruit cellars" — they learned to bury fruit and eat it slowly long before humans did. They also tear down human cellar trees: a bear needs no backpack.
- **Lamp Jellyfish**: the lamps of Mirrorlake. The jellyfish field sits exactly in the outline of the sunken tower on the lakebed — from the surface, the tower glows. They neither chase you nor run from you; swim through them and they treat you as water, which your body is not. Nobody knows why they are lit.

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
| id | `id` | the system | no | yes | prefix `p-`, random idBytes 6 characters. This is all the world stores: cellar-tree ownership, owl post, the lake's ledger |
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
| q5 | the one who carried the ridge home | 背下北岭的人 |
| all quests | the one the valley remembers | 谷地记得的人 |

A later one overrides an earlier one; when it changes the game announces it once ("the valley has started calling you …").

### Writing rules (enforced by a test)

1. **No line of fiction may interpolate the player's name.** Use the epithet, or the second person. `docs-sync.js` fails when a fixed protagonist name appears in the documents.
2. The name appears only in UI (top-left HUD, the codex "you" block) — never in NPC lines, codex entries or quest text.
3. An epithet is **the world's verdict**, so it may be plain or even slighting (the default "the fruit counter" is) — renaming yourself does not change what the valley thinks of you.

### Multiplayer: already in place / still missing

**In place**: `id` is saved, cellar trees carry an `owner`, epithets are event-driven, and name and identity are decoupled.

**Still missing**: an identity service (the `id` issued by a server), storage ownership and sharing rights (the main cellar is currently communal), NPCs remembering dialogue per id, and the resolution of attitude-matrix conflicts such as "two players walk into Mirrorlake as frogs at the same time".
