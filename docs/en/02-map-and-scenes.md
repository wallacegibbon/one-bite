# 02 · Map and Scenes

[中文: ../cn/02-地图与场景.md](../cn/02-地图与场景.md)

Source of truth: `game/data/world.js` (zones / POIs / isles), `game/src/worldgen.js` (generation and fruit placement).

World coordinates: `x` east, `z` south, `y` up. **Mirrorlake surface = y14.** The prototype world is 160×48×160 voxels (the full setting is 1024×128×1024).

## 1. Overview map (prototype coordinates, one cell ≈ 8 units)

```
        x=0        32        64        96       128      160
   z=0  ┌──────────────────────────────────────────────────┐
        │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │  ← Grey Veil (the whole ring)
   16   │ ░ Echo Hollow ⛰          The Deep Grove (silver)  North Ridge ❄Ashscale ░ │
        │ ░  (28,30)               (104,32) r18             (142,18) r26          ░ │
   32   │ ░   ⌂cavemouth           ✦groveheart             ▲mountains            ░ │
        │ ░      ☁stepping1(66,40)      ☁highroost(96,12)                        ░ │
   48   │ ░   Glowglade ❍(60,56)        ☁windbell(128,58)                       ░ │
        │ ░      ☁stepping3(20,62)      ☁stepping2(84,56)                       ░ │
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

  ☁ = Cloudspire isle (floating in the air; this is its shadow position;
      ☁beamisle sits at (40,20))
  ⛰ = a hill hollowed out   ~ = water surface
```

**How to read the map**: the Cloudspire isles project onto the map **above the forest** (z 12–62), but they sit in empty air at y29–40. From the ground they are only shadows; only a flying form can reach them.

## 2. Zone Table

| id | English | Chinese | Shape | Location | Danger | In one line |
|---|---|---|---|---|---|---|
| `veil` | The Grey Veil | 灰雾墙 | border | the whole ring | 5 | It does not stop you leaving, it only makes you forget why you came back |
| `whisperwood` | Whisperwood | 低语林 | rect | (6,6)–(154,72) | 1 | Meadow and mushroom ring at the rim, ancient trees and deer paths further in |
| `glowglade` | Glowglade | 蘑菇圈 | circle r13 | (60,56) | 1 | A ring of glowcaps that breathes in and out at night |
| `batcave` | Echo Hollow | 回声丘 | circle r13 | (28,30) | 2 | The hill hollowed into three layers of tunnel, and nothing living at the bottom of them |
| `deepgrove` | The Deep Grove | 深鹿林 | circle r18 | (104,32) | 3 | Silver trees; every deer path in the valley folds into this one |
| `mountains` | Ashscale Ridge | 北岭·鹰喙峰 | circle r26 | (142,18) | 3 | The bear's slope, wind blowing snow sideways |
| `mirrorlake` | Mirrorlake | 镜湖 | circle r34 | (78,106) | 3 | A sunken tower and a few sunken huts on the lakebed; the tower is lit from inside by jellyfish |
| `starfall` | Starfall Keep | 星坠堡 | circle r12 | (78,106) | 1 | The school on the island: four towers and a bell, a greenhouse in the cellar |
| `lanternrow` | Lanternrow | 灯笼镇 | rect | (116,114)–(154,152) | 0 | Where the main cellar stands |
| `orchard` | The Old Orchard | 果园遗迹 | circle r15 | (24,104) | 2 | The ancestral ground of every fruit tree: broken walls, old burrows, the oldest tree |
| `cloudspire` | Cloudspire | 云顶浮岛 | air | y29–40 | 4 | Without a flying form this is only a shadow in the sky |

Zone ids are historical, and so are the display names: `deepgrove` is still the Deep Grove although the herd that named it is gone, and `batcave` is a hill that somebody hollowed out. The ids stay (saves and code use them).

## 3. Points of Interest (POI)

| id | Name | Coordinates | y | Icon | Zone |
|---|---|---|---|---|---|
| `cellar` | Main Cellar | (136,134) | 20 | chest | Lanternrow |
| `belltower` | Starfall Bell Tower | (78,104) | 34 | tower | Starfall Keep |
| `greenhouse` | Fruit Greenhouse (cellar) | (78,110) | 18 | door | Starfall Keep |
| `sunktower` | Sunken Tower | (66,118) | 8 | water | Mirrorlake |
| `frogshall` | Frogshall | (92,120) | 9 | water | Mirrorlake |
| `groveheart` | Heart of the Deep Grove | (104,32) | 24 | tree | The Deep Grove |
| `cavemouth` | Echo Mouth | (28,34) | 24 | cave | Echo Hollow |
| `beams` | The Old Beams | (40,20) | 38 | sky | Cloudspire |
| `oldtree` | The Oldest Tree | (24,104) | 22 | tree | The Old Orchard |
| `mushring` | Glowcap Ring | (60,56) | 20 | shroom | Glowglade |

## 4. Vertical layers

The valley is not a floor, it is four:

| Layer | y | What is there | How you get there |
|---|---|---|---|
| **Cloudspire** | isle surfaces 29–40; what stands on them up to 47 | 6 isles, the old beams | Owl (fly 5.2), or the stepping isles + Leaper |
| **Canopy** | 20–31 over the town, to 47 where the forest stands on the northern slopes | Crowns, the bell tower's roof (42), the top of the Deep Grove (35) | Jump + Leaper |
| **Ground** | 20–29 in the town and the orchard (mean 22) | Forest, town, keep, orchard | Walking |
| **Underwater** | 0–14; the water itself is y5..14 | Mirrorlake, sunken tower, sunken huts | Only the frog (skin breathing) |

**These numbers are measured off the generated world, not remembered** (seed 20261008): the topmost solid block per column, plants excluded for the ground rows and leaves counted for the canopy. `node-smoke.js` prints all of it and fails if the chapter's numbers stop matching. The table used to say Canopy 20–28 and Ground 15–24; measured, the town's crowns top out at 31 and the forest's at **47**, because the trees there stand on the northern slopes rather than on the valley floor. And the isles sit **inside** Whisperwood's rectangle — beamisle (40,20), highroost (96,12), stepping3 (20,62) — so a zone query over Whisperwood answers with sky: its leaves run 20..47.

**Mirrorlake depth**: surface y14, and the lakebed is a slope rather than a floor — the water stands anywhere from **1 to 10 blocks** deep (measured over all 1,856 water columns inside the circle: 44% of them are 4 blocks or less, the deepest at (79,92) where the water runs y5..y14). A human holds breath for 18 seconds, exactly enough to reach the tower windows and come back up, not enough to pick a fruit off the sill. That is the whole argument for "become the frog first": in this water exactly one animal breathes for you.

**The ridge is not on that ladder.** Ashscale's own surface is **y23–36** (mean 30, measured over the zone's columns), and its cold starts at y26 — 88% of the ridge's columns are already cold — and reaches its full bite at y36, which is the top of it: 258 columns stand at or above that line, and the 25 bruin figs hang at **y29..37**, one block above the ground they grow on, most of them at 37. A human can cross the ridge and come back with a fig if it hurries; a bear body simply is not cold.

## 5. Scene detail

### 5.1 Starfall Keep (the castle)

On the island at the lake's centre: four towers and a bell, a fruit greenhouse in the cellar. What the school teaches is fruit reading: which fruit, how many slots, how long before dormancy.

- **Bell tower** y34: the highest standing point in the valley (isles excepted). The checkpoint for the quest "Nightwing".
- **Greenhouse (cellar)** y18: glass roof (block 21), unpickable demonstration trees, plus one **frog pear** under a glass bell — the living lesson that a lake fruit is still a fruit away from the lake.
- **The four towers** each display one rarity. The legendary tower is empty and holds one line: "A bruin fig sat here once. It pressed the other three into pulp."
- The walls carry **glowstone lamps** (block 14, emissive): at night the brightest light in the valley.

### 5.2 Whisperwood (the forest)

A rectangle over the whole northern half. Three bands:

- **Rim** (z 60–72): moonlit meadow, the mushroom-ring entrance, the old mounds. Common fruit: owlberry.
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

Radius 34, deepest at the centre.

- **Sunken Tower** (66,118): a 7×7 shell from **y6 to y15** with a spire at **y16/y17**, so the top of the ruin stands three blocks **above** the water line — drowned to the shoulders, not under it. Windows on all four faces at **y7/y10/y13**, and the **frog pear** hangs on the sills one block under two of them (**y9/y12**). Picking it requires breathing underwater.
- **Frogshall** (92,120): y9, a ring of sunken huts. The frogs' place; after rain their chorus drowns the bell.
- **The lamps**: ten jellyfish sit on the outline of the tower (`mirrorlake.tower` in `data/world.js` — the same constant `worldgen.js` uses to build the tower), hovering about a metre under the surface. They are the only self-lit models in the game, so the lake carries a light of its own at night and the tower reads as lit from the shore. They bear no fruit, are not a body you can wear, and do not read bodies at all (03 §3). They sting: 0.25 vitality a second for every lamp you are inside, and the lamps hang a metre or two under the surface — so loitering at the top of the tower costs, while the breath-hold dive to the sills where the **frog pear** hangs stays free. The answer to the lamps is the frog body, and the warning says so.

### 5.6 The Deep Grove and the Old Orchard

**The Deep Grove** (104,32, r18): silver-leaf wood (blocks 9/22) where every old track folds into one. Nothing grows on the silver trunks now. The grove is bear country — the ridge bears come down into it and bury their own fruit here — and it has no door: no fruit, no gate, no reason. That is no longer a hole in the design: the valley keeps its animals until each one arrives with a fruit, a niche and a door only it can open (03 §3), and a wood is allowed to be bear country and nothing else.

**The Old Orchard** (24,104, r15): a ring of broken wall (30 across) plus the oldest tree in the valley (`oldtree`). Every root heap is an old burrow. The beams of the ruins are still standing. They stay up.

### 5.7 Cloudspire Isles

| Isle | Position | Radius | Top y | What is there |
|---|---|---|---|---|
| `beamisle` | (40,20) | 11 | 37 | **The Old Beams**: old timber that is still standing, and the view |
| `highroost` | (96,12) | 7 | 40 | The highest isle, windy, no fruit; the owls moult here |
| `windbell` | (128,58) | 8 | 34 | Windbell isle, no fruit, viewpoint |
| `stepping1` | (66,40) | 4 | 31 | Stepping isle |
| `stepping2` | (84,56) | 3 | 29 | Stepping isle (the lowest air point in the valley) |
| `stepping3` | (20,62) | 4 | 30 | Stepping isle |

The stepping isles form a route from the forest canopy (y28) up to Cloudspire — **you can reach the top without a flying form, but you have to climb + jump + not slip**. That is the hidden route for players who would rather not fly.

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
    ├─ canopy / bell tower ─────→ owl (fly 5.2)
    │      └─ above 30 m ───────→ quest "Nightwing" (q3)
    │
    ├─ Cloudspire isles ────────→ owl (fly) or stepping isles + Leaper (jump)
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
| Cloudspire | 4 | falling |
| The Grey Veil | 5 | vitality drains, no sense of direction (minimap off) |
