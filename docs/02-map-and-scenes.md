# 02 · Map and Scenes

Source of truth: `game/data/world.js` (zones / POIs), `game/src/worldgen.js` (generation and fruit placement).

World coordinates: `x` east, `z` south, `y` up. **Mirrorlake surface = y14.** The authored map is a square of ground 160×48×160 voxels with an address: it sits inside a larger island, and the same terrain rule answers every address on the plane, so there is no edge to the world (§1.1).

## 1. Overview map (prototype coordinates, one cell ≈ 8 units)

```
        x=0        32        64        96       128      160
   z=0┌────────────────────────────────────────────────────────┐  ← the edge of the authored
   z=0│                                                        │  square: past this line
  16 │                                                        │  nothing was built, and
     │ Echo Hollow ⛰        The Deep Grove (silver)          │  the same ground goes on
  32 │ (28,30)              (104,32) r18     ❄ Ashscale      │
     │  ⌂cavemouth          ✦groveheart      (142,18)        │
  48 │ Glowglade ❍(60,56)                                    │
  64 │ ────────── south edge of the Whisperwood ────────      │
     │ Old Orchard ♠(24,104)      ~Mirrorlake~               │
  80 │  oldtree                 ~~~~~~~~~~~~~~~               │
     │ ⌂orchard            ~~~ Starfall Keep ▦ ~~~            │
  96 │                  ~~~  ▲belltower(78,104)               │
     │                  ~~~  ⌂greenhouse(78,110)              │
 112 │                  ~~~ sunken tower   frogshall ~~~      │
 128 │                  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~      │
     │       SE Whisperwood          town orchard             │
 152 │                                                        │
     │                                                        │
     └────────────────────────────────────────────────────────┘
  ⛰ = a hill hollowed out   ~ = water surface
```

### 1.1 The authored square, and the ground past it

The map above is not the world; it is the ground somebody made. The world is a plane of
metre cells that goes on in every direction, and one square of it — this one — was
built: the town, the keep, the lake, the orchard, the trees and the cellars are all
inside the square. Past the square the same terrain rule answers the same addresses it
answered while they were inside it, so the ground does not change character at the
line: walk west off x=0 along z=64 and the field you were standing in goes on level
for another forty metres, because the same function is being asked the same question.
What stops at the square is what was *built* — the trees stop, the walls stop, the
paths stop. Nothing is planted out there yet: the ground past the square carries no
tree, no fruit and no animal, and that is an honest hole in this map rather than a
finished one.

The island the square sits on runs out to a shore: the land is highest about the
centre (80,80) and sinks towards a coastline that wanders between **121 m and 150 m**
from that centre; past the shore the ground shelves down into the sea and the sea goes
on for as far as the world does. Nothing stops a body at the shore: no wall, no fog
band, no gate. The only edge in this world is the edge of what a body
can reach and get back from (01 §3, 04 §5).

**A shore is a slope, and the slope is stated as one number: how steep.** The complaint
that put this law in was "there's no gentle place on the main island — there's no
getting up onto it", and it was about the ground, not about the body. The rule that was
there capped the ground past the shore at two metres under the surface and then blended
the land towards that cap, which flattened the blend from its first metre: read through
a walk from open water inland, that rule presented a riser taller than a metre on
**120 of 120** bearings, every one of them over four metres, a **median of 11 m** and
**13 m** at the worst — ten to thirteen metres of ground inside three metres of walk —
with the sea floor lying at **y 7-12**. One metre is the whole of the difference, and it
is the body's own number: the world is built of metre cells, so the shortest riser
anywhere is a metre, and a body climbs exactly that with the launch its record states
(03 §3, `jump` 8.3 m/s, 1.43 m over its feet) and stops at anything above it. A shore of
one-metre risers is a beach the legs go up; a riser of thirteen is a cliff.

- `COAST.grade` **0.25** is the steepest slope any shore in this world runs. A
  `smoothstep` over a run of R is steepest at its middle, at 1.5 · drop / R, so
  `shoreRun(h) = max(apron, 1.5 · (h − deep) / grade)` is a run that never exceeds it: a
  high piece of land reaches the sea over a longer walk than a low one, which is what a
  shore is. `COAST.apron` **70 m** is the least such a run may take — a shallow drop
  still gets a shore wide enough to be a shore and not a dip;
- `COAST.smooth` **40 m** is the reach over which the sea works the land's own relief
  away: the fine relief an island carries (`reliefH`, the same arithmetic the land is
  made of) is subtracted out between the shore and the open sea, because a shore that
  keeps it is a cliff standing in the water — measured with it left in, 88 of 120
  bearings presented a two-metre step on the way up out of the sea. The seabed's own
  noise (`COAST.floorRelief`, 3 m) fades in only past the end of the run, so a shore ends
  in ground and not in a step standing in the sea;
- the height of the ground past the shore is no longer capped. Its two ends are the
  island's own ground and that island's sea floor, both stated by rules, and the water
  line falls wherever that slope crosses it: that line is the beach, and it is not
  something a second rule gets to place. Measured, the sea floor lies at **y 4-9** —
  **5 to 10 m** of water over it, never shoal enough to be land and never deep enough to
  stop being ground; the water's edge stands **172-221 m** from the centre, and from that
  water to the island's own ground is **11-19 m** of height.

`game/test/node-smoke.js` walks 120 bearings from open water inland and holds the
tallest step anywhere on a shore to **1 m**, the steepest 20 m window to **0.45 m of
ground per m** (what the rule leaves today is **0.400**: the shore's own 0.25 with the
relief it carries still on it — the bound is that measured figure with room in it, and it
is the one the wall above failed, at 0.65), and the sea floor to the band above.
`game/test/play.js` then asks the complaint as it was made: it takes the hardest shore
the island has — the bearing that makes a body climb furthest from the water to its own
shore line, chosen by the island's rule and not from a remembered coordinate — stands a
body in the deepest water a body walks in (one metre over the ground it stands on; at two
the water carries it, which is 03 §3's question and is asked of elsewhere), and walks it
inland with the push key held the way a player holds it up a bank. It got up: bearing
36°, from ground y13 under a metre of water 201 m out, **47 m of ground and 12.2 m of
height in 729 frames** — 12.2 s, **20 hops**, each one's top **1.30 m** over where it
left the ground against the **1.43 m** the record reaches, its longest run off the ground
**42 frames** against the **44** one such arc lasts, inside a block in **0** frames and
through the ground in **0**.

### 1.2 The sea, and the islands in it

A sea with no land in it is a different world from the one the player was promised, so
the sea is not empty: it holds islands, **more of them the nearer they lie to the
island this square sits on, thinner the further out they go**, and there is no line
where they stop. Only arithmetic can give a
gradient like that and still keep the world fixed for every player and every session,
and the arithmetic is an Archimedean spiral out of (80,80):

- one full turn of the spiral carries **7** islands and gains **60 m** of radius, so
  the turns stand **377 m** apart radially; the first turn is drawn at radii
  **377-754 m** and its seven centres actually stand **389-778 m** out.
  An island's foot is never allowed to come within **24 m** of this island's shore or
  of another island's foot — the water between two grounds is the channel that makes
  them two islands — so the nearest ground ever met is never nearer than that. That
  room is measured to where the sea stands rather than to the shore line, because the
  channel is water and a body crossing it starts in water: over the first 70 ordinals
  the least open water between this island's edge and any of those feet is **169 m**,
  and the closest two feet came within **178.9 m** of each other;
- every island is pulled up to **40 m** along its own radius, under half the gap
  between turns (so two turns cannot trade places): what comes out is a coast of
  islands rather than a wheel of spokes;
- an island's id is its **ordinal along the spiral** — ordinal **0** is the island this
  square sits on — and its place is computed *from* the ordinal, never the other way
  round. The same island is therefore met again from any direction and in any later
  session, and the id this save already carries would pick one of them out as a home
  island from the same arithmetic, with no table kept anywhere. Nothing asks that
  question yet: the id is made by the game when a game starts (`init`, `p-` plus six random
  characters; the save carries it back, and cellar trees are already owned by it — 03 §6), and no rule
  has been written for what such an id should pick, so a home island drawn from it would
  move with every new game. That is a decision about what a home island is for, not an
  oversight. The
  same question is answered from the other end as well: the islands standing at an
  address are found from the address alone, which is all a chunk of ground needs in
  order to be built;
- what kind of island it is is stated in three numbers. Two of them are the shape of
  a shore: how far its foot reaches, and how high its crown stands over the water
  line. The third is what the pile is made of, and it was missing until it was
  measured: with only the height table to go on, **9** of the **15** sandbars in the
  reach wore grass at their crown and all **16** of its reefs wore grass over soil, so
  a rock shelf and a hill of earth were the same ground. The mix of kinds changes with
  the distance — the near turns are sand and reef, the far ones are land.

| kind | foot radius | crown above the water line | the ground it is |
|---|---|---|---|
| sandbar | 22-45 m | 1.2-2.4 m | sand from the floor the sea raised it out of to its crown; bare sand, with a skin of the sea's own sand at the water line |
| reef | 30-70 m | 2.5-4.5 m | rock from that floor to its crown, with the sea's sand at the water line: a shelf, not a hill of earth |
| thicket | 50-95 m | 5-9 m | a piece of land that never went under: grass over soil, as the height table runs it |
| isle | 70-125 m | 8-14 m | a piece of land that never went under: grass over soil, with a hill on it |
| ridge | 100-165 m | 14-24 m | a piece of land that never went under: grass over soil, cut the top of; high enough that the material table puts snow on it by its own height rule (a crown above y34), which is why no snow is written anywhere |

The island itself is one pile of ground raised out of the floor it stands in, shaped
`1 − smoothstep(d ÷ foot)`: flat enough at the crown to be the island's own ground,
running down to nothing at its foot with no step and no wall, so no island can leave a
cliff standing in the sea and no ring of one either. The crown comes out at the height
the kind states, to the metre the ground is built in, and a shoreline appears wherever
the dome crosses the water by
itself — a sandbar shows a few metres of sand and a ridge most of its own footprint,
which is the whole difference between them. What the ground is *made of* is the same
table as everywhere else — sand at and near the water line, rock under three metres,
soil between, water above — with one thing added to it, because the height table cannot
say it: a kind that states a pile lays that pile from the row its floor ends at up to
its crown. A bar is therefore sand through and through and a reef is rock through and
through, while the sea's skin of sand at the water line lies on both of them exactly as
it lies on this island's beaches. A kind that states no pile is a piece of land the sea
never went over, and it takes the height table as it always did.

Measured at the seed the game opens with, over the first 70 islands of the spiral
(which reaches about 4 km out), asked both of the rule and of the built world:

| | |
|---|---|
| islands raised | **70** of 70 ordinals; nobody had to be cut down for want of room, the closest two feet came within **178.9 m** of each other |
| kinds | 15 sandbars, 16 reefs, 23 thickets, 11 isles, 5 ridges |
| islands per km², by band | **3.50** in the 0-1 km band, **2.02** at 1-2 km, **1.21** at 2-3 km, **0.82** at 3-4 km — the gradient the rule exists for, falling as 1/r |
| the nearest of them | centre **389 m** from (80,80); **169 m** of open water between this island's water's edge and its foot |
| how far open sea is from land | sampled on rings out to 1.5 km, the median point of sea is **171 m** from an island's foot and the furthest sampled point is **476 m**: one fruit is **966 m** out and back, so no water in that reach is a crossing a body cannot make |
| what stands on the nearest ground big enough to stand on | **nothing**. The nearest island with a foot of 40 m or more — ordinal 4, a thicket, **603 m** out, foot **70 m** — has had its whole footprint (**15,421** columns) counted cell by cell: **0** cells of tree, **0** of fruit, **0** of plant. What it does hold: **71,920** cells of water, **64,670** of stone, **51,836** of sand, **43,763** of the mountain rock the sea floor is paved with, **7,386** of soil and **2,462** of grass — the dome the rule states, read back out of ground the game built. That is the honest hole (07 §3.6) |

Two numbers bound that reach, and both belong to the player, not to the world:

- **Sight.** The air's haze takes 95% of the contrast off at **231 m** in the clearest
  air this world states (`fogDen = 0.0075` by day, and the shader's `1 − exp(−(fogDen·d)²)`),
  so ground further out than that is not worth holding in memory: the renderer keeps
  chunks out to **15 chunks of 16 m = 240 m** (`World.keep = 15`, `game/src/world.js`),
  just past that radius, builds the nearest ring first, and lets go of the rest.
- **The day.** A fruit's clock is the trip's clock. One frog pear, picked at full
  ripeness, is **420 s** of frog; a common fruit keeps **1,500 s** in a hand at night.
  A frog walks **1.8 m/s** on land and swims **4.6 m/s**: one fruit carried in the
  pocket is therefore **966 m** out and back along a shore, and a batch of three is
  **2,898 m** — which is a little less than twice across the island. Those are the
  units the valley is measured in, and no rule in the world stops the walk.


## 2. Zone Table

| id | English | Chinese | Shape | Location | Danger | In one line |
|---|---|---|---|---|---|---|
| `whisperwood` | Whisperwood | 低语林 | rect | (6,6)–(154,72) | 1 | Meadow and mushroom ring at the rim, ancient trees and deer paths further in |
| `glowglade` | Glowglade | 蘑菇圈 | circle r13 | (60,56) | 1 | A ring of glowcaps that breathes in and out at night |
| `batcave` | Echo Hollow | 回声丘 | circle r13 | (28,30) | 2 | The hill hollowed into three layers of tunnel, and nothing living at the bottom of them |
| `deepgrove` | The Deep Grove | 深鹿林 | circle r18 | (104,32) | 3 | Silver trees; every deer path in the valley folds into this one |
| `mountains` | Ashscale Ridge | 北岭·鹰喙峰 | circle r26 | (142,18) | 3 | The wind blows the snow sideways; the summit is the valley's highest standing ground |
| `mirrorlake` | Mirrorlake | 镜湖 | circle r38 | (78,106) | 3 | A sunken tower and a few sunken huts on the lakebed |
| `starfall` | Starfall Keep | 星坠堡 | circle r12 | (78,106) | 1 | The school on the island: four towers and a bell, a glass case on the deck |
| `lanternrow` | Lanternrow | 灯笼镇 | rect | (116,114)–(154,152) | 0 | Where the main cellar stands |
| `orchard` | The Old Orchard | 果园遗迹 | circle r15 | (24,104) | 2 | The ancestral ground of every fruit tree: broken walls, old burrows, the oldest tree |
Zone ids are historical, and so are the display names: `deepgrove` is still the Deep Grove although the herd that named it is gone, and `batcave` is a hill that somebody hollowed out. The ids stay (saves and code use them).

## 3. Points of Interest (POI)

| id | Name | Coordinates | y | Icon | Zone |
|---|---|---|---|---|---|
| `cellar` | Main Cellar | (136,134) | 20 | chest | Lanternrow |
| `belltower` | Starfall Bell Tower | (78,104) | 36 | tower | Starfall Keep |
| `greenhouse` | Fruit Greenhouse | (78,110) | 21 | door | Starfall Keep |
| `sunktower` | Sunken Tower | (66,118) | 6 | water | Mirrorlake |
| `frogshall` | Frogshall | (92,120) | 7 | water | Mirrorlake |
| `groveheart` | Heart of the Deep Grove | (104,32) | 24 | tree | The Deep Grove |
| `cavemouth` | Echo Hollow Mouth | (28,34) | 27 | cave | Echo Hollow |
| `oldtree` | The Oldest Tree | (24,104) | 20 | tree | The Old Orchard |
| `mushring` | Glowcap Ring | (60,56) | 24 | shroom | Glowglade |

## 4. Vertical layers

The valley is not a floor, it is three:

| Layer | y | What is there | How you get there |
|---|---|---|---|
| **Canopy** | 20–31 over the town, to 47 where the forest stands on the northern slopes | Crowns, the bell tower's roof (42), the top of the Deep Grove (35) | the keep's deck only: there is no climb in the valley and no mushroom lends a jump, so the roof and most crowns stand above reach |
| **Ground** | 20–29 in the town and the orchard (mean 22) | Forest, town, keep, orchard | Walking |
| **Underwater** | 0–14; the water itself is y4..14 | Mirrorlake, sunken tower, sunken huts | Only the frog (skin breathing) |

**These numbers are measured off the generated world, not remembered** (seed 20261008): the topmost solid block per column, plants excluded for the ground rows and leaves counted for the canopy. `node-smoke.js` prints all of it and fails if the chapter's numbers stop matching, and `game/test/docs-sync.js` now asks the chapter's heights itself -- every number in the three paragraphs above, both door markers' rows, the band the greenhouse deed derives from one of them, and the keep's glass case -- against the world the data generates. A census has to ask only columns this world holds: Ashscale's own disc reaches x168 in a valley 160 wide, and if the block getter is allowed to answer the 413 columns that hang over the wall with clamped ground, the same census answers the ridge as y23--47, mean 33.4, over 2,121 columns where the honest one holds 1,708. Those numbers would have been wrong, and nothing would have noticed. The table used to say Canopy 20–28 and Ground 15–24; measured, the town's crowns top out at 31 and the forest's at **47**, because the trees there stand on the northern slopes rather than on the valley floor.

**Mirrorlake depth**: surface y14, and the lakebed is a slope rather than a floor — the water stands anywhere from **1 to 11 blocks** deep (measured over all 2,958 water columns: 27% of them are 4 blocks or less, **53% are 8 or more**, the deepest at (72,83) where the water runs y4..y14; the bed cannot go below y3, so 11 is the deepest column this world can carve). A human holds breath for 18 seconds, exactly enough to reach the tower windows and come back up, not enough to pick a fruit off the sill. That is the whole argument for "become the frog first": in this water exactly one animal breathes for you.

**The ridge is not on that ladder.** Ashscale's own surface is **y23–36** (mean 30, measured over the zone's columns), and its top is the valley's highest standing ground, tied with the slab the bell tower stands on. Nothing grows on the ridge any more and nothing walks it: the fruit that used to hang from its rock faces is cut (04), and the animal that used to walk its ledges is cut (03). What the ridge keeps is the height and the falls.

## 5. Scene detail

### 5.1 Starfall Keep (the castle)

On the island at the lake's centre: four towers and a bell, a fruit greenhouse standing on the keep's own deck. What the school teaches is fruit reading: which fruit, how many slots, how long before dormancy.

- **Bell tower**: the top of the keep is a slab of city brick at **y36** (a body standing on it stands at y37); the eaves and the bell hang above it at y37–y42 as single floating tiles, and no body can land on them. It is the highest standing ground in the valley (the floating tiles excepted) -- tied with the rock top of Ashscale, which also reaches y36; the forest's crowns run higher, to y47.
- **Greenhouse** y21: the row the marker stands on, one cell under the cellar crate (block 78) the generator puts in the marker's own column to mark this door -- the same rule `game.js` reads for the town cellar's store, which asks the world for `poi.y + 1`. The fruit is kept where no hand reaches: a **5×5 glass box, from y22 to y26** standing 6.3 m from that door, 98 glass cells closed on all six faces, its floor the deck the keep stands on. It is not an empty room, and the chapter should not let a reader picture one: of its 27 inner cells, 16 are the keep's own city brick, 6 are ground under grass and 3 are empty. The generator set the case over the corner of its own ringwall, and what it plants inside stands in the hollow that was left -- one **frog pear**, one glowstone lamp. That is the living lesson that a lake fruit is still a fruit away from the lake, and the reason the keep pays no fruit: the picking ray stops at the first solid block it enters, and glass is solid. There are no trees in the keep at all, so the chapter used to describe a glass roof over demonstration trees that were never built. It is called a fruit greenhouse and nothing else, in both languages and in every string the game carries for it: the name the data gives that marker, and the zone's own description. Keeping the word "cellar" would have meant answering a question first, and the world answered it: the keep's **441** columns, from y0 to y21, hold **9,702** cells and **0** of them are air -- the island is solid, there is no room under that door for anything to open onto, and the fruit stands on the deck, inside the case above. The town's Main Cellar keeps its word because the same measure says it earned it: asked from the floor of the world up to its own marker row it answers 0 air as well, but the room it opens onto is there -- 9x9 of dark brick with air at y21, y22 and y23, three rows of it, under the floor the town builds on at y24 -- that is a cellar.
- **The four towers** each display one rarity. The legendary tower is empty and holds one line: "The valley has never grown a fruit this rare."
- The walls carry **glowstone lamps** (block 14, emissive): at night the brightest light in the valley.

### 5.2 Whisperwood (the forest)

A rectangle over the whole northern half. Three bands:

- **Rim** (z 60–72): moonlit meadow, the mushroom-ring entrance, the old mounds.
- **Middle** (z 30–60): old trees and the tracks the deer pressed into the ground. The fallen logs are still there; what grew on them is not.
- **Deep**: the Deep Grove (its own zone, see §5.6).

Tree kinds: oak (leaves 7 / dark leaves 27), pine (needles 8), silver (silver leaves 9, Deep Grove only), willow (willow leaves 28, lakeshore).

### 5.3 Glowglade (the mushroom ring)

A clearing 26 across, ringed by 24 glowcaps (block 76, emissive) that pulse on a 6 second cycle at night. The ring is scenery, not a store: it grows no fruit and no stone, and it gives nothing to carry — the cellar stones stand where the world puts them, and it puts them elsewhere (03 §5). The ground stays damp, so the frogs live here too: frog-pear bushes ring the clearing.

### 5.4 Echo Hollow (the hollowed hill)

Three layers of tunnel, about 120 blocks long. The id is still `batcave`, and the Chinese display name used to say *spider cave*; it does not any more.

- **Upper**: a low black roof with nothing hanging from it.
- **Middle**: the three layers cross, and the hill answers anything you drop.
- **Lower**: an underground stream, wet; frogs come in from the hillside.
- By day it is only dripping. Sound comes back wrong, which is the whole name.

**This place pays nothing, and that is now the design.** It is dark, it is deep, it has no fruit and no door. The hill was built as a spider scene and the spider is gone — and nothing is coming to hand it a purpose, because the quest that would have is deleted (06 §4). A hollow may just be a hollow. The valley is not obliged to pay for every place it built.

### 5.5 Mirrorlake

Radius 38, deepest at the centre at 11 blocks, with **62** stalks of kelp on the shelves of the bed -- every one of them under the water, and lit by the lake it stands in rather than by itself. The sunken tower and the huts are built at absolute heights, so generation fills each footprint up to its floor first — without that the huts hang in the water.

- **Sunken Tower** (66,118): a 7×7 shell from **y6 to y15** with a spire at **y16/y17**, so the top of the ruin stands three blocks **above** the water line — drowned to the shoulders, not under it. Windows on all four faces at **y7/y10/y13**, and the **frog pear** hangs on the sills one block under two of them (**y9/y12**). Picking it requires breathing underwater.
- **Frogshall** (92,120): a ring of sunken huts, the four of them floored at **y7** and roofed at y10, the water inside standing up to y9. The frogs' place; after rain their chorus drowns the bell.

### 5.6 The Deep Grove and the Old Orchard

**The Deep Grove** (104,32, r18): silver-leaf wood (blocks 9/22) where every old track folds into one. Nothing grows on the silver trunks now, and no animal walks them any more: the ridge's animal is cut (03), and the grove is what the valley kept for it — a wood with no door: no fruit, no gate, no reason. That is no longer a hole in the design: the valley keeps its places until each animal arrives with a fruit, a niche and a door only it can open (03 §3), and a wood is allowed to be a wood and nothing else.

**The Old Orchard** (24,104, r15): a ring of broken wall (30 across) plus the oldest tree in the valley (`oldtree`). Every root heap is an old burrow. The beams of the ruins are still standing. They stay up.

## 6. Fruit gating map (what progression actually depends on)

```
  Ground (on foot)
    │
    ├─ the mushroom ring ───────→ no gate (teaching area)
    ├─ mounds / low root holes ─→ no gate, and nothing down there either
    │
    ├─ Mirrorlake ──────────────→ frog (breatheAir:false, skin breathing)
    │      └─ tower sills ──────→ frog pear (lake deed)
    │
    └─ Ashscale Ridge ──────────→ no gate, and nothing up there either
```

**The key design point**: every door needs exactly one body, and that body always appears outside the door first. The Frog Pear on the tower sill hangs two blocks under the surface: the fruit that teaches you the lake is a fruit the lake already gave you. Two places now have a shape and nothing behind it — Echo Hollow and the Deep Grove, both built for animals that were cut — and those are the honest holes in this map, not solved ones.

## 7. Danger

| Zone | Danger | The actual threat |
|---|---|---|
| Lanternrow | 0 | none |
| Starfall Keep | 1 | none (but the greenhouse fruit is unpickable) |
| Whisperwood / Glowglade | 1 | rain choruses that hide footsteps, and old tracks that lead somewhere you did not mean to go |
| Echo Hollow | 2 | darkness (needs night vision / glow), falls |
| Old Orchard | 2 | broken ground and low wall; nothing that hunts you |
| Deep Grove | 3 | nothing that hunts you: dense silver trunks, and nothing behind them |
| Ashscale Ridge | 3 | the height and the falls: the ground rises fast |
| Mirrorlake | 3 | drowning (18 s for a human; only a frog body needs no air underwater), a frog drying out on land |

The sea carries no danger rating, because a danger rating is a thing that can hurt you
and nothing out there does, islands or no islands. What the sea costs is distance and
what you can carry (§1.1, §1.2), and the honest version of that cost is the fruit in
your pocket running out while you are standing on a shore with no reeds on it. The
ground past the authored square has no wall on it, no fog and no drain: it is the same
ground, built by the same rule, holding land in the same way — and nothing living on
any of it yet.

