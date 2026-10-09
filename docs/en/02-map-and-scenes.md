# 02 · Map and Scenes

[中文: ../cn/02-地图与场景.md](../cn/02-地图与场景.md)

Source of truth: `game/data/world.js` (zones / POIs / isles), `game/src/worldgen.js` (generation and fruit placement).

World coordinates: `x` east, `z` south, `y` up. **Mirrorlake surface = y14.** The prototype world is 160×48×160 voxels (the full setting is 1024×128×1024).

## 1. Overview map (prototype coordinates, one cell ≈ 8 units)

```
        x=0        32        64        96       128      160
   z=0  ┌──────────────────────────────────────────────────┐
        │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │  ← Grey Veil (the whole ring)
   16   │ ░ Echo Hollow ⛰          The Deep Grove ✦deer    North Ridge ❄Ashscale ░ │
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
  ✦ = a zone that needs the right shape   ~ = water surface
```

**How to read the map**: the Cloudspire isles project onto the map **above the forest** (z 12–62), but they sit in empty air at y29–40. From the ground they are only shadows; only a flying form can reach them.

## 2. Zone Table

| id | English | Chinese | Shape | Location | Danger | In one line |
|---|---|---|---|---|---|---|
| `veil` | The Grey Veil | 灰雾墙 | border | the whole ring | 5 | It does not stop you leaving, it only makes you forget why you came back |
| `whisperwood` | Whisperwood | 低语林 | rect | (6,6)–(154,72) | 1 | Meadow and mushroom ring at the rim, ancient trees and deer paths further in |
| `glowglade` | Glowglade | 蘑菇圈 | circle r13 | (60,56) | 1 | A ring of glowcaps that breathes in and out at night |
| `batcave` | Echo Hollow | 回声丘·蛛洞 | circle r13 | (28,30) | 2 | The hill hollowed into three layers of tunnel; at night the floor moves first |
| `deepgrove` | The Deep Grove | 深鹿林 | circle r18 | (104,32) | 3 | Silver trees; every deer path in the valley folds into this one |
| `mountains` | Ashscale Ridge | 北岭·鹰喙峰 | circle r26 | (142,18) | 3 | The bear's slope, wind blowing snow sideways |
| `mirrorlake` | Mirrorlake | 镜湖 | circle r34 | (78,106) | 3 | A sunken tower and a few sunken huts on the lakebed |
| `starfall` | Starfall Keep | 星坠堡 | circle r12 | (78,106) | 1 | The school on the island: four towers and a bell, a greenhouse in the cellar |
| `lanternrow` | Lanternrow | 灯笼镇 | rect | (116,114)–(154,152) | 0 | Where the main cellar stands |
| `orchard` | The Old Orchard | 果园遗迹 | circle r15 | (24,104) | 2 | The ancestral ground of every fruit tree: broken walls, old burrows, the oldest tree |
| `cloudspire` | Cloudspire | 云顶浮岛 | air | y29–40 | 4 | Without a flying form this is only a shadow in the sky |

Zone ids are historical: `batcave` is spiders now, `deepgrove` is deer now. The ids stay (saves and code use them), the display names change.

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
| **Cloudspire** | 29–40 | 6 isles, the old beams | Owl (fly 5.2), or spider climbing + Leaper |
| **Canopy** | 20–28 | Crowns, bell-tower roof, the spider beams | Jump + Leaper; or spider climbing |
| **Ground** | 15–24 | Forest, town, keep, orchard | Walking |
| **Underwater** | 0–14 | Mirrorlake, sunken tower, sunken huts, jelly fields | Frog (skin breathing); jellyfish (water only) |

**Mirrorlake depth**: surface y14, bottom y5 — nine blocks down. A human holds breath for 18 seconds, exactly enough to reach the tower windows and come back up, not enough to pick a fruit off the sill. That is the whole argument for "become the frog first": in this water exactly one animal breathes for you.

## 5. Scene detail

### 5.1 Starfall Keep (the castle)

On the island at the lake's centre: four towers and a bell, a fruit greenhouse in the cellar. What the school teaches is fruit reading: which fruit, how many slots, how long before dormancy.

- **Bell tower** y34: the highest standing point in the valley (isles excepted). The checkpoint for the quest "Nightwing".
- **Greenhouse (cellar)** y18: glass roof (block 21), unpickable demonstration trees, plus one **frog pear** under a glass bell — the living lesson that a lake fruit is still a fruit away from the lake.
- **The four towers** each display one rarity. The legendary tower is empty and holds one line: "A bruin fig sat here once. It pressed the other three into pulp."
- The walls carry **glowstone lamps** (block 14, emissive): at night the brightest light in the valley.

### 5.2 Whisperwood (the forest)

A rectangle over the whole northern half. Three bands:

- **Rim** (z 60–72): moonlit meadow, the mushroom-ring entrance, pangolin mounds. Common fruit: owlberry.
- **Middle** (z 30–60): old trees, deer paths, stagcap on fallen logs. Deer country.
- **Deep**: the Deep Grove (its own zone, see §5.6).

Tree kinds: oak (leaves 7 / dark leaves 27), pine (needles 8), silver (silver leaves 9, Deep Grove only), willow (willow leaves 28, lakeshore).

### 5.3 Glowglade (the mushroom ring)

A clearing 26 across, ringed by 24 glowcaps (block 76, emissive) that pulse on a 6 second cycle at night. The middle holds the densest **glowseeds** and is the main source of **cellar stones**. The ground stays damp, so the frogs live here too: frog-pear bushes ring the clearing.

### 5.4 Echo Hollow (the spider hill)

Three layers of tunnel, about 120 blocks long. The id is still `batcave`.

- Upper: **silkberry** (block 45) on the roof, exactly where the beams used to be.
- Middle: beamborn spider nests. They do not spin to catch insects; they spin to **repair buildings**.
- Lower: an underground stream, wet, frogs too.
- By day it is only dripping. By night the floor moves before you step on it.

### 5.5 Mirrorlake

Radius 34, deepest at the centre.

- **Sunken Tower** (66,118): top at y12 (two blocks under the surface), base at y5. The window sills carry **frog pear**. Picking it requires breathing underwater.
- **Frogshall** (92,120): y9, a ring of sunken huts (the valley had people in it before the fog). Now the frogs' place; after rain their chorus drowns the bell.
- **Jelly fields**: their outline is exactly the sunken tower's — from the surface, the tower is what glows.

### 5.6 The Deep Grove and the Old Orchard

**The Deep Grove** (104,32, r18): silver-leaf wood (blocks 9/22) where every deer path folds into one. Stagcap grows on silver trunks. The gate here is shape: deer are `calm` to deer and `hostile` to everything else — to walk in, become a deer.

**The Old Orchard** (24,104, r15): a ring of broken wall (30 across) plus the oldest tree in the valley (`oldtree`). Every root heap is an old pangolin burrow — the town cellar's shape is said to be copied from bears, and the bears copied it from pangolins. The ruins' beams are held up by three centuries of spider silk: take the silkberries and the beams fall, opening a new way down to the cave floor.

### 5.7 Cloudspire Isles

| Isle | Position | Radius | Top y | What is there |
|---|---|---|---|---|
| `beamisle` | (40,20) | 11 | 37 | **The Old Beams**: three-century-old timber, 3 silkberries, the view |
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
    ├─ mounds / low root holes ──→ pangolin (dig + size 0.7×0.75)
    ├─ the mushroom ring ───────→ no gate (teaching area)
    │
    ├─ Mirrorlake ──────────────→ frog (breatheAir:false, skin breathing)
    │      └─ tower sills ──────→ frog pear (q4)
    │
    ├─ the Deep Grove ──────────→ deer (deer are calm to deer, hostile to the rest)
    │      └─ silver trunks ────→ stagcap (q5)
    │
    ├─ vertical walls / beams ──→ spider (climb)
    │      └─ cave roof / cloud beams ──→ silkberry (q6)
    │
    ├─ canopy / bell tower ─────→ owl (fly 5.2)
    │      └─ above 30 m ───────→ quest "Nightwing" (q3)
    │
    └─ Cloudspire isles ────────→ owl (fly) or spider + Leaper (climb + jump)
```

**The key design point**: the Deep Grove's key is not "find a stagcap", it is "become a deer". The first stagcap sits on a fallen log on the deer path **outside** the grove — follow the path, pick it, then walk in as a deer. Every door needs exactly one body, and that body always appears outside the door first.

## 7. Danger and the Grey Veil

| Zone | Danger | The actual threat |
|---|---|---|
| Lanternrow | 0 | none |
| Starfall Keep | 1 | none (but the greenhouse fruit is unpickable) |
| Whisperwood / Glowglade | 1 | a startled herd, rain choruses that hide footsteps |
| Echo Hollow | 2 | darkness (needs night vision / glow), falls |
| Old Orchard | 2 | thief traps (block 80, needs a bear to break), collapsing beams |
| Deep Grove | 3 | deer charges (gore, 2 damage), a bear waiting at the path mouth |
| Ashscale Ridge | 3 | ash bear (hostile to deer and pangolin), cold (needs bear form) |
| Mirrorlake | 3 | drowning (18 s for a human), a frog drying out on land |
| Cloudspire | 4 | falling, beamborn spiders |
| The Grey Veil | 5 | vitality drains, no sense of direction (minimap off) |
