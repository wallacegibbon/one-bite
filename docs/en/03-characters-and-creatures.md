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

**A body keeps the space it is in.** `flyY` is the height a flying animal will not ask to be above, not the height it flies at, and it has to be a height the world has: an owl put down on a canopy had been given a flight height of 51.5 in a world 48 tall, so every one of its samples was outside the map. What a bird holds is a few metres above whatever is under it — over the lake, over the crowns, over the ridge — changing that height slowly, low over open water, up where the ground goes up; held to one absolute height it crossed the valley with the ground 25 m under it and the whole flight was one straight line. The floor is read from the body's own cell and down, never from a cell over its head: read from over the head, `groundY` answers "the highest solid in this column", the rule that exists to keep a bird out of a tree lifts it straight up through the crown it was flying under, and the rise is then refused by the ceiling, leaving the bird pinned a metre under the needles — two of six birds did exactly that for three minutes. The same question is asked seven metres ahead, which is the reach of the body's own climb: a body that only asks where it is now begins climbing a second after it arrives and spends that second inside the hill.

**A body is not a point, the ceiling answers last, and leaves are not a ceiling.** An owl stands 0.7 m from feet to head, and a gate that asks only about the cell under its feet lets it into a room it does not fit in, to stand there with its head in the beam: 9-17% of the frames of one of six birds over forty seconds of a night. So the step a flying body takes asks whether the place it is about to put itself in is empty from its feet to its head, and the height it wants is capped by the lowest thing over its own head — the underside of a roof, the beam of a room — less the body's own height. The top of the map is such a thing: the sky's own roof sits one block under the top of the grid, so no body stands with its head through the ceiling of the valley. And a crown is not one of those things: leaves are neither a wall nor a roof to a body in the air, any more than they are to a bear that walks through a bush with its shoulders in it. Read as both at once a crown is a room with no door — the body is refused sideways into the leaves and refused up through them — and what it is left holding is the height the underside of the crown hands out: one of six owls flew 114 m at a height that moved 0.55 m in forty seconds, the flock had a block over its head in 6-30% of its frames, and a body stood inside a crown, a hillside or the shaft of the lake tower in 11132 of 216000 frames. Asked the other way: a bird is over everything in its own column for 89-99% of its frames, and no frame of a day of the valley puts a body inside the world.

**Falling asleep is not a pass through the roof, and a hop is an arc with a top.** A bird at rest settles onto the floor under it — the same floor an awake body reads — and the ceiling of the room it is in answers for it as it answers for any other body. The exemption that held a sleeping bird to no ceiling at all was written to keep an owl off the top of its own tree, while the height it was settling onto was read from six metres over the bird's own head, which is the one reading that finds the top of the tree: over the 93 columns of this valley whose crowns reach 47, an owl put in the middle of the tallest of them was eased to y=48 in 18 frames and stood on the top of the world, wings folded, for 882 of the 900 frames of a morning. A hop is the same question asked one frame before the legs push off: the arc the data asks for reaches 0.78 m over the feet and a frogpear stands 0.43 m tall, so the twelve frogs of Mirrorlake — who walk in and out of the hollow shaft of the sunken tower, where the brick floor is at 11 and the tower's glass is a metre over it — do not push off in there. One of them did, and was lifted out of the wall at 0.1 m a frame for 28 frames, which is what a day of the valley was catching one run in six. A frog under a low roof walks, and its legs do not load for a jump it is not going to make.

**A bird that has left its branch lies down, and a bird on a branch does not.** The owl is carved standing because standing wedged in a hollow is what it does by day; the posture of its flight is a second thing, and the model says it (07 §1). What it did before was stand in the air: the body worn from that animal, crossing the valley at 7 m/s, held its spine **72.6°** up from the horizontal climbing, **72.8°** gliding and **76.7°** diving, its head **87°** above its own body, its feet **0.24 m** under its centre and its tail up over its back like a flag. The pose is asked for by the air under the body and carried by the same eased number that opens the wings and tucks the legs, so a bird coming off its branch lies down over a few frames instead of snapping flat in one — measured, the frame the flag used to flip in moved the whole posture **1.0** of the way and moves it **0.183** now — and the same bird stands **90.0°** again the moment its feet are on something, which is the pose it was carved in.

**A body keeps its own trunk's footprint from its own kind as well.** Every gate so far asks one body about the world, and nothing ever asked one body about another body: two frogs walked through one another, and one lamp was drawn on top of another lamp. The ground a body claims is not a radius -- it is the rectangle its own trunk is carved from (`N.MODEL_W` in `src/models.js`: the union of the boxes of `parts[0]`, in the model's own units) turned by its heading, and it counts only where the two bodies also stand at one height, because two lamps a metre apart down the water are not in one place, and a lamp riding on another's bell is on top of it, not inside it. A bear's trunk is 1.10 m long and 0.77 m across, a frog's 0.41 by 0.34, and a circle wide enough to keep two bears apart end on would keep a bear and a frog three metres apart. A neighbour is then an obstacle of the kind the contour already takes a body round: the step gate refuses the places that lie deeper in a neighbour than the place the body stands in now, so a body already against one may slide along it and a body not yet in its way may touch it, 2 cm of it; the errand is picked from the roomiest of the places offered, and room is measured against where each neighbour stands *and* where it is going, because a place another body is swimming to is claimed whether that body is in it yet or not; and whatever overlap a frame still ends with is undone along the shortest way out that the world allows, the world keeping the last word -- a lamp pushed out of a neighbour and into a bank stays on the bank's side of the bank. Measured over the morning the game opens on, in a valley born the way the game bears it: the ten lamps stood in one another's way in 17197 pair-frames of a window of 9000, 12995 of them more than 12 cm deep, the worst pair 0.54 m in -- one bell drawn almost exactly on top of another -- and the twelve frogs spent 46% of the morning with another frog inside them, 0.43 m at the worst. Now the worst pair is 0.23 m, the frames more than 12 cm deep are a fifth of what they were, and a pair that touches is 0.084 m inside itself instead of 0.242 m; the frogs are in one another's way in more frames than before, 6496 against 4099, because they go round one another now instead of through one another. A body is born with the same room: the lamp field is ten lamps sampled into a disc of radius four round the tower, only 8% of that disc is water, and two of them used to be born 9 cm apart.

**An animal is put down on the ground, not on the tree that grows out of it.** A crown and the trunk that holds it up are solid — the player climbs them and a body can stand on them — but they are not the surface of the valley. The spawn code scans a column from the top of the world, and it used to answer "the top of a spruce" in 509 of 600 tries: two bears standing on crowns at y=45, and a flyer whose flight height was then measured from the top of that tree. `terrainY` reads the column for the ground, and `N.TREE_BLOCK` (`src/world.js` — the list `worldgen` has always used to plant a tree) says which blocks a tree is made of, so the generator and the animals read one list. Two cases are counted rather than failed, and both are honest: a bear's shoulders sit inside a bush as it walks through one, and where a crown grows to the top of the world there is no air left above it for a body to keep.

**A body on foot stands on the ground, and falls when the ground is gone.** `standY` is the third question asked of a column, after "the highest solid thing in it" and "the ground under the crown": *what surface are these feet standing on*. The two older readings disagree by metres and the animals were living in the gap — the altitude looked up 4 m above the feet while the step test looked up 3, so a needles block five blocks over a bear's head answered to the altitude and lifted it there; and foliage level with the feet read as a step, so the bear took it, found the next block of the same crown at its new feet, took that one too, and climbed its own tree. Measured over a day, 22061 of one bear's 25200 frames were spent standing on leaves 12 m above the valley floor, going up 105 m and back down 114 m, riding the crowns along the ridge. The step test now asks the same question the altitude does — the surface it would stand on, and the cell just above it: a metre is a step, a surface with rock over it is a wall, and foliage over the head is neither. And nothing but the ground holds a body up: the height used to be lerped onto whatever the column said, which is an elevator that runs fastest at the moment it starts. Walked off a cliff where the ground falls 17 m within one metre, a bear came down 6.8 m in the first 0.1 s (81 m/s), eased the rest of the way to a stop, and finished standing on a tree 5 m above the floor, where it stopped moving. A body on foot now obeys the rule the player's own body and a hopping frog already obeyed — the same gravity, the same terminal speed, the same squash on arrival: the same cliff took 1.17 s, the speed rising from nothing to 26.8 m/s, and the bear walked on.
**A body in water swims to its depth, and a body climbing a step climbs at a rate.** A frog and a bear are now told apart by whether the data gives them a `hop`, not by whether they obey gravity: one routine in `src/entities.js` answers feet, water and the ground for every body that is not held up by air. It had to be one routine, because the frog's copy had no bound on what it would do to a height. A frog in water used to be pulled toward just under the surface by a fraction of the distance left each frame, which is the same elevator: dropped on the lakebed 4.7 m down, it came up 0.47 m in its very first frame -- 28 m/s, faster than a falling bear. It now closes that depth at the speed its own record swims at (`swimSpeed`: 4.6 m/s for a frog), which is the speed its legs are already moving at, and 9 m of lake takes 2.7 s. The same gap on land: the step test lets a body into a column whose surface is above its feet -- a frog standing on the floor of a lake two blocks deeper than the shelf next door has its feet 1.6 m under that shelf -- and the frog's copy answered by snapping it onto the surface, 1.5 m in one frame (90 m/s). A step is now the step the bear takes. Over a day of the valley, the worst height change any one frame carried by any body went from 1.6 m to 0.28 m.
**A lift is worth keeping only when the body ends up somewhere its own feet could not reach.** A body on foot walked into a riser is lifted by as much as its own `step` allows and the move is tried again from there. The lift used to be tested at the place the body already stands -- where of course there is room -- and the move was then retried with the speed the collision had already zeroed along the axis it had to stop, so the body never moved and the lift was kept anyway: walked at a bank two metres tall on one flat shelf, a human stood on the ground in **34%** of the frames and its height swung **0.124 m** within a second, a bear in **31%**, and even with nothing built in front of them they were on the ground in only 89% and 78% with the same swing -- that is the wobble at the water's edge. And the same broken retry meant the lift had never once carried a body up a step it could reach: a bear whose own record says its legs reach 1.1 m, walked at a step of one metre, gained 0.124 m in three seconds. Now the retry is handed the move the body asked for, and a lift that ends where the body already was is thrown away: the body goes back down to its feet and stands there. After, both stand on the ground in every frame with a swing of **0**, the bear climbs the step it can reach and ends standing on top of it **1.02 m** up, and the human gains **0** against that same step. A step is not a wall and a wall is not a step; the bound is the body's own `step`, and which of the two it was is answered by where the body ends up, not by the lift.

**A body at rest is at rest, and so is the frame it is in.** The surface a body stops on is the face its feet crossed, and the answer used to be "the higher of that face and where the feet already were" -- which for anything standing is the feet themselves. So a body on flat ground was put back half a millimetre above where it had been at the start of the frame: gravity pulled it down 6.4 mm, the snap lifted it back, and that is a 6 mm sawtooth about five times a second that never stops. The lens sits on the feet, so the whole picture rides it, and it rides it hardest close to the lens -- the blocks near you shake and the ones past 15 m do not. Measured at a wall 2.5 m off with nobody holding a key: **0.74%** of the pixels within 2 m of the lens changed from one frame to the next (mean change 106 of 765), **0.52%** at 5-15 m, **nothing** past 15 m, and the body's own height swung **6.4 mm** and reversed direction **53 times** in five seconds. After: the body does not move at all, it rests 0.5 mm off the face it stands on, and **no pixel** of the frame changes between two frames. A fall is untouched -- for a falling body the face was always below the feet -- and it still arrives at 11.5 m/s and stops *on* the surface rather than 3 cm above it. The cells above the feet are a ceiling and are no longer folded into the same maximum: that maximum could lift a body a whole body-height when its head was in a wall.

**The water holds up a body that breathes water.** A body in the lake used to carry the same fixed downward pull whatever it was made of, so a frog let go of in mid-water sank at a terminal 0.89 m/s, landed on the lakebed 3 m below, was reported standing on the bottom, and stopped there: a water animal that stopped moving sank. The valley's own frogs have always done the opposite -- the creature step holds them just under the surface and never through the bottom -- so the body the player wears was the only water-breathing body in the valley that went down. One rule and one number now: the water holds such a body **at the depth its own record says a body of that kind hangs at, measured to the crown of it** -- the top face of its topmost water block, which is `waterTop + 1`, not the index of that block, and the level is that surface less the height of the body itself less that depth, which is `hover` on the creature row and **0.3 m** for anything that does not state one. The frog's row states **1.6 m**, and that is a decision about the lake rather than about the frog: a body that floats with its back at the surface and its eyes above it is an animal standing in a puddle, not one swimming in a lake, and from the bank it is a cork with four legs under it -- clamped by the bottom, and the water holds it there whether or not its feet happen to be on something, which is what brings a frog that has dived to the lakebed back up the moment the dive key comes off. The level used to be taken off the index, and that put every body the water holds a full block under the surface: a frog half a metre tall floated with its head under the water, and the wild frogs of Mirrorlake hung 1.3 m down where they hang 0.8 m down. The **reference point** is the whole of the matter. That 0.3 m used to be measured to the feet, and a body half a metre tall therefore hung with its head 20 cm out of the water: seen from the bank it was a cork with four legs under it, and the eyes of the body you wear -- 0.42 m up from its own feet -- sat 12 cm *above* the surface, so the animal built for the lake looked at the shore and never once into it. Measured to the crown, the number a row states is what its own sentence always said it was -- how far a floating back sits under the surface -- and the whole body hangs in: at the depth the frog's row states, feet **2.1 m** down, back **1.6 m** down, eyes **1.68 m** down, looking into the lake rather than at the shore. The level is the body's own height plus the depth its row states, so a bigger water animal hangs deeper by exactly its own size, and the only number a species carries is the one sitting on its own row. The dive itself is untouched -- a body that asks to go down swims down, and the lakebed is still reachable: 4 s of dive key still arrives at 8.001 against a bed of 8. Measured in a column of Mirrorlake 7 blocks deep -- surface at 15, bed at 8: let go of at 11 it comes up to **12.9** and stops, its height swinging **0.0006** over the last second with **0** changes of direction and its head under the water; let go of at the surface it settles to the same level instead of sinking through the whole lake to **8.08**; put on the bottom and left alone, it gets off it. And the level is the wild frog's level, which is the claim worth testing, and it is one reading rather than two: the body you wear takes its depth off the creature record its fruit points at, and a wild frog takes it off its own, so the herd and the body you wear cannot drift apart -- same column, two minutes of the dip cycle a wild frog actually runs on, player **12.9**, wild frog **12.914** at the shallow end of the band it works through -- **8.127** at the deep end of that band. Over forty seconds of the twelve the valley drives they sit **2.4-5.6 m** down, and **0%** of the samples come within a metre of the surface film, where they were **46%**. Whether water can hold a body up at all is read off the place, not off the body's distance to the surface -- the surface has to be above the level the body would stand on -- because a rule that switches as the body crosses its own equilibrium alternates the force law and builds a sawtooth, which is the bug of the paragraph above. That is what keeps 183 columns of one-block shore shelf a bottom to stand on and push off from: both bodies there are grounded on **100%** of frames at **14.001** with **0** swing. A body that breathes air is still not held up: a human let go of in the same column comes to rest on the bottom at **8.001**, and that is what it costs to wear a body that was not built for the lake. The climb key still brings a water-breathing head out, and the water's hold ends half a body under the film: held for 4 s the body rises to **14.75** against a surface of 15 -- feet **25 cm** in, **half** of a 50 cm body over the water, eyes **17 cm** over the film, and the surface itself crossed **0** times in 300 frames -- and it cannot stand on the middle of a lake, which is what the old ceiling, the surface less a hair, let it do at **14.98**: **96%** of that body over the water. That ceiling is asked of where the frame is about to put the body, not of where the body stands: the velocity decided for a frame is spent later, over the substeps of the move, and asked of where the body stands the surface of (64.5,92.5) was crossed **twice** in 240 frames with the key held, the body leaving the water branch and coming back on both sides of every crossing -- where the same key used to carry it to **14.896**, clean above the surface, with the flag that says whether this body is in water changing its mind **16** times in those 4 s. That flag is read off the place now -- is there a surface above the level this body would stand on -- and not off the cells its own feet and middle happen to fall in: the flag decides the draw, the stroke of the legs and the cruising speed, and a body bobbing across its own surface answered it a different way every few frames, which snapped its legs **0.19 m** out and back again. A body sitting at the surface flips it **0** times in 10 s. The draw reads this reading rather than guessing which body is in the water: the `held` signal of 07 (Creature models) is 1 exactly where the water holds the body up and 0 where the body has feet to stand on, and it is what puts a swimming body's feet behind it instead of under its chest, with its legs rolled **out at its own sides** rather than crossed under itself, and what holds those legs still the moment the body is going nowhere.
The lamps are the one species placed by a **landmark** instead of a zone: `at: 'tower'`, `spread: 4` in the record, resolved against the habitat zone (`mirrorlake.tower`, which is also where `worldgen` builds the tower). The field is the tower's outline, so the tower is what places the field — "anywhere in a lake of radius 34" would put the lamps anywhere except over the tower. A `spread` is a **radius**, not a half-width: the landmark branch samples a disc, like every other branch of `samplePos`, and the wander roll picks its errand from that same disc round the landmark -- not from a disc of the same size round wherever the animal happens to be standing. A lamp therefore never gets further than `spread` plus a step from the tower, and that is the bound the test checks (worst over five minutes of the field: 4.3-5.6 m). Errands picked from `home` looked as tidy for one errand and were not: the tower stands in the middle of the field, so the way round it is longer than the way that was asked for, a lamp keeps the ground it gained sideways, and the errand after that starts further out and reaches further out again -- measured, the ten lamps stood up to 9.2 m from the tower and 5.6 m from the home they were born on, a field twice the spread it was meant to be.

**Why only 3 wearable species**: every species you can wear costs a fruit, a habitat, a row in the attitude matrix, and a whole set of "where can this body go" gates. A 3 × 4 matrix can be read at a glance; a 14 × 15 matrix has to be memorised. Once the setting was simplified, **the readability of the gates became content in its own right**. The lamps are the deliberate exception that prices the rule: a fruitless species still costs a model, a habitat, a row in the matrix and a place in the world, but it buys **no gate at all** — it is the cheapest animal to add and the least interesting one. It is in the valley to be light in the water, not to be a door.

It has one effect on the player, and the effect is not a body: **it stings** —
`sting: 0.25` on the animal record, vitality per second for every lamp you are
standing inside. Contacts stack, because a field is a field: stand where the
lamps overlap and you pay for each of them. But the field is a **ring**, not a
disc — the tower it is drawn around pokes up through the surface — so the exact
middle of it is dry ground and costs nothing. The immunity sits on the **frog**
body — the body this lake already gave you is the body its lamps are lit for —
and the log line that reports a sting names the answer out loud. The lamps hang
a metre or two under the surface — **0.5–2.3 m** to the crown over five minutes
of the field — so the dive to the tower sills stays out of reach of them.

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
