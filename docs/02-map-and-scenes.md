# 02 · Map and Scenes

Source of truth: `game/data/world.js` (zones / POIs), `game/src/worldgen.js` (generation and fruit placement).

World coordinates: `x` east, `z` south, `y` up. **Mirrorlake surface = y14.** The prototype world is 160×48×160 voxels (the full setting is 1024×128×1024).

## 1. Overview map (prototype coordinates, one cell ≈ 8 units)

```
        x=0        32        64        96       128      160
   z=0  ┌──────────────────────────────────────────────────┐
        │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │  ← Grey Veil (the whole ring)
   16   │ ░ Echo Hollow ⛰          The Deep Grove (silver)  North Ridge ❄Ashscale ░ │
        │ ░  (28,30)               (104,32) r18             (142,18) r26          ░ │
   32   │ ░   ⌂cavemouth           ✦groveheart             ▲mountains            ░ │
   48   │ ░   Glowglade ❍(60,56)                                                 ░ │
   64   │ ░─────────── south edge of the Whisperwood ────────────────────────── ░ │
        │ ░  Old Orchard ♠(24,104)     ~Mirrorlake~      Lanternrow ▣          ░ │
   80   │ ░   oldtree                  ~~~~~~~~~~~~~~~~  (116..154,            ░ │
        │ ░  ⌂orchard              ~~~ Starfall Keep ▦(78,106) ~~~ 114..152)     │
   96   │ ░             ~~~  ▲belltower(78,104) ~~~      (136,134)             ░ │
        │ ░             ~~~   ⌂greenhouse(78,110)~~~     ▣cellar               ░ │
  112   │ ░             ~~~ sunken tower(66,118)  frogshall(92,120)~~~        ░ │
        │ ░             ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~    ░ │
  128   │ ░        SE Whisperwood              town orchard                  ░ │
        │ ░                                             ░                    │
  152   │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
  160   └──────────────────────────────────────────────────┘

  ⛰ = a hill hollowed out   ~ = water surface
```

## 2. Zone Table

| id | English | Chinese | Shape | Location | Danger | In one line |
|---|---|---|---|---|---|---|
| `veil` | The Grey Veil | 灰雾墙 | border | the whole ring | 5 | It does not stop you leaving, it only makes you forget why you came back |
| `whisperwood` | Whisperwood | 低语林 | rect | (6,6)–(154,72) | 1 | Meadow and mushroom ring at the rim, ancient trees and deer paths further in |
| `glowglade` | Glowglade | 蘑菇圈 | circle r13 | (60,56) | 1 | A ring of glowcaps that breathes in and out at night |
| `batcave` | Echo Hollow | 回声丘 | circle r13 | (28,30) | 2 | The hill hollowed into three layers of tunnel, and nothing living at the bottom of them |
| `deepgrove` | The Deep Grove | 深鹿林 | circle r18 | (104,32) | 3 | Silver trees; every deer path in the valley folds into this one |
| `mountains` | Ashscale Ridge | 北岭·鹰喙峰 | circle r26 | (142,18) | 3 | The bear's slope, wind blowing snow sideways |
| `mirrorlake` | Mirrorlake | 镜湖 | circle r38 | (78,106) | 3 | A sunken tower and a few sunken huts on the lakebed; the tower is lit from inside by jellyfish |
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
| **Canopy** | 20–31 over the town, to 47 where the forest stands on the northern slopes | Crowns, the bell tower's roof (42), the top of the Deep Grove (35) | Jump + Leaper |
| **Ground** | 20–29 in the town and the orchard (mean 22) | Forest, town, keep, orchard | Walking |
| **Underwater** | 0–14; the water itself is y4..14 | Mirrorlake, sunken tower, sunken huts | Only the frog (skin breathing) |

**These numbers are measured off the generated world, not remembered** (seed 20261008): the topmost solid block per column, plants excluded for the ground rows and leaves counted for the canopy. `node-smoke.js` prints all of it and fails if the chapter's numbers stop matching, and `game/test/docs-sync.js` now asks the chapter's heights itself -- every number in the three paragraphs above, both door markers' rows, the band quest 6 derives from one of them, and the keep's glass case -- against the world the data generates. A census has to ask only columns this world holds: Ashscale's own disc reaches x168 in a valley 160 wide, and if the block getter is allowed to answer the 413 columns that hang over the wall with clamped ground, the same census reports the ridge as y23--47, mean 33, 90% cold, 671 columns at the full-bite line. Those four numbers would have been wrong, and nothing would have noticed. The table used to say Canopy 20–28 and Ground 15–24; measured, the town's crowns top out at 31 and the forest's at **47**, because the trees there stand on the northern slopes rather than on the valley floor.

**Mirrorlake depth**: surface y14, and the lakebed is a slope rather than a floor — the water stands anywhere from **1 to 11 blocks** deep (measured over all 2,970 water columns: 27% of them are 4 blocks or less, **53% are 8 or more**, the deepest at (72,83) where the water runs y4..y14; the bed cannot go below y3, so 11 is the deepest column this world can carve). A human holds breath for 18 seconds, exactly enough to reach the tower windows and come back up, not enough to pick a fruit off the sill. That is the whole argument for "become the frog first": in this water exactly one animal breathes for you.

**The ridge is not on that ladder.** Ashscale's own surface is **y23–36** (mean 30, measured over the zone's columns), and its cold starts at y26 — 87% of the ridge's columns are already cold — and reaches its full bite at y36, which is the top of it: 258 columns stand at or above that line, and the 24 bruin figs hang at **y23..37**, one block above the ground they grow on, most of them at 37 — twenty-three of them on the ridge, the last in the glass case on the keep's deck. A human can cross the ridge and come back with a fig if it hurries; a bear body simply is not cold.

## 5. Scene detail

### 5.1 Starfall Keep (the castle)

On the island at the lake's centre: four towers and a bell, a fruit greenhouse standing on the keep's own deck. What the school teaches is fruit reading: which fruit, how many slots, how long before dormancy.

- **Bell tower**: the top of the keep is a slab of city brick at **y36** (a body standing on it stands at y37); the eaves and the bell hang above it at y37–y42 as single floating tiles, and no body can land on them. It is the highest standing ground in the valley (the floating tiles excepted) -- tied with the rock top of Ashscale, which also reaches y36 (258 columns at that row); the forest's crowns run higher, to y47.
- **Greenhouse** y21: the row the marker stands on, one cell under the cellar crate (block 78) the generator puts in the marker's own column to mark this door -- the same rule `game.js` reads for the town cellar's store, which asks the world for `poi.y + 1`. The fruit is kept where no hand reaches: a **5×5 glass box, from y22 to y26** standing 6.3 m from that door, 98 glass cells closed on all six faces, its floor the deck the keep stands on. It is not an empty room, and the chapter should not let a reader picture one: of its 27 inner cells, 16 are the keep's own city brick, 5 are ground under grass and 3 are empty. The generator set the case over the corner of its own ringwall, and what it plants inside stands in the hollow that was left -- one **bruin fig**, one **frog pear**, one glowstone lamp. That is the living lesson that a lake fruit is still a fruit away from the lake, and the reason the keep pays no fruit: the picking ray stops at the first solid block it enters, and glass is solid. There are no trees in the keep at all, so the chapter used to describe a glass roof over demonstration trees that were never built. It is called a fruit greenhouse and nothing else, in both languages and in every string the game carries for it: the name the data gives that marker, the zone's own description, the line quest 6 prints in the codex. Keeping the word "cellar" would have meant answering a question first, and the world answered it: the keep's **441** columns, from y0 to y21, hold **9,702** cells and **0** of them are air -- the island is solid, there is no room under that door for anything to open onto, and the fruit stands on the deck, inside the case above. The town's Main Cellar keeps its word because the same measure says it earned it: asked from the floor of the world up to its own marker row it answers 0 air as well, but the room it opens onto is there -- 9x9 of dark brick with air at y21, y22 and y23, three rows of it, under the floor the town builds on at y24 -- that is a cellar.
- **The four towers** each display one rarity. The legendary tower is empty and holds one line: "A bruin fig sat here once. It pressed the other three into pulp."
- The walls carry **glowstone lamps** (block 14, emissive): at night the brightest light in the valley.

### 5.2 Whisperwood (the forest)

A rectangle over the whole northern half. Three bands:

- **Rim** (z 60–72): moonlit meadow, the mushroom-ring entrance, the old mounds.
- **Middle** (z 30–60): old trees and the tracks the deer pressed into the ground. The fallen logs are still there; what grew on them is not.
- **Deep**: the Deep Grove (its own zone, see §5.6).

Tree kinds: oak (leaves 7 / dark leaves 27), pine (needles 8), silver (silver leaves 9, Deep Grove only), willow (willow leaves 28, lakeshore).

### 5.3 Glowglade (the mushroom ring)

A clearing 26 across, ringed by 24 glowcaps (block 76, emissive) that pulse on a 6 second cycle at night. The middle holds the densest **glowseeds** and is the main source of **cellar stones**. The ground stays damp, so the frogs live here too: frog-pear bushes ring the clearing.

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
- **The lamps**: ten jellyfish sit on the outline of the tower (`mirrorlake.tower` in `data/world.js` — the same constant `worldgen.js` uses to build the tower), hovering about a metre under the surface, at the depth its own row states (`hover: 1.2`, measured to the crown of the body). They are the only self-lit models in the game, so the lake carries a light of its own at night and the tower reads as lit from the shore. They bear no fruit, are not a body you can wear, and do not read bodies at all (03 §3). They sting: 0.25 vitality a second for every lamp you are inside, and the lamps hang a metre or two under the surface — so wading into the ring costs, while the exact middle of it costs nothing (the tower's top pokes up through the surface, and the lamps stand 3–5 m out from it), and the dive down to the sills where the **frog pear** hangs stays free. The answer to the lamps is the frog body, and the warning says so.

### 5.6 The Deep Grove and the Old Orchard

**The Deep Grove** (104,32, r18): silver-leaf wood (blocks 9/22) where every old track folds into one. Nothing grows on the silver trunks now. The grove is bear country — the ridge bears come down into it and bury their own fruit here — and it has no door: no fruit, no gate, no reason. That is no longer a hole in the design: the valley keeps its animals until each one arrives with a fruit, a niche and a door only it can open (03 §3), and a wood is allowed to be bear country and nothing else.

**The Old Orchard** (24,104, r15): a ring of broken wall (30 across) plus the oldest tree in the valley (`oldtree`). Every root heap is an old burrow. The beams of the ruins are still standing. They stay up.

## 6. Fruit gating map (what progression actually depends on)

```
  Ground (on foot)
    │
    ├─ the mushroom ring ───────→ no gate (teaching area)
    ├─ mounds / low root holes ─→ no gate, and nothing down there either
    │
    ├─ Mirrorlake ──────────────→ frog (breatheAir:false, skin breathing)
    │      └─ tower sills ──────→ frog pear (q4)
    │
    └─ Ashscale Ridge ledges ───→ bear (step 1.1 m: it walks up what you must jump, and the cold never touches it)
           └─ rock face, y>20 ──→ bruin fig (q5)
```

**The key design point**: every door needs exactly one body, and that body always appears outside the door first. The Frog Pear on the tower sill hangs two blocks under the surface: the fruit that teaches you the lake is a fruit the lake already gave you. Two places now have a shape and nothing behind it — Echo Hollow and the Deep Grove, both built for animals that were cut — and those are the honest holes in this map, not solved ones.

## 7. Danger and the Grey Veil

| Zone | Danger | The actual threat |
|---|---|---|
| Lanternrow | 0 | none |
| Starfall Keep | 1 | none (but the greenhouse fruit is unpickable) |
| Whisperwood / Glowglade | 1 | rain choruses that hide footsteps, and old tracks that lead somewhere you did not mean to go |
| Echo Hollow | 2 | darkness (needs night vision / glow), falls |
| Old Orchard | 2 | broken ground and low wall; nothing that hunts you |
| Deep Grove | 3 | nothing that hunts you: dense silver trunks, and a bear standing in the path you came in by |
| Ashscale Ridge | 3 | the height, the cold (it starts above y26 and reaches its full bite at y36; a bear body never feels it), a brown bear that ignores you and will not step aside |
| Mirrorlake | 3 | drowning (18 s for a human; only a frog body needs no air underwater), a frog drying out on land |
| The Grey Veil | 5 | it is the edge of the world, and it drains your vitality while you press against it |
