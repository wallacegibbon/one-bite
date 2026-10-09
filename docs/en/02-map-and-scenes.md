# 02 · Map and Scenes

[中文: ../cn/02-地图与场景.md](../cn/02-地图与场景.md)

World coordinates: `x` east, `z` south, `y` up. **Mirrorlake surface = y14.** The prototype world is 160×48×160 voxels (the full setting is 1024×128×1024).

## 1. Overview map (prototype coordinates, one cell ≈ 8 units)

```
        x=0        32        64        96       128      160
   z=0  ┌──────────────────────────────────────────────────┐
        │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │  ← Grey Veil (the whole ring)
   16   │ ░ Echo Hollow ⛰        The Hoar Grove ✦unicorn   North Ridge ❄Ashscale ░ │
        │ ░  (28,30)             (104,32) r18              (142,18) r26          ░ │
   32   │ ░   ⌂cavemouth         ✦groveheart              ▲mountains            ░ │
        │ ░      ☁stepping1(66,40)      ☁phoenix(96,12)                          ░ │
   48   │ ░   Glowglade ❍(60,56)        ☁windbell(128,58)                       ░ │
        │ ░      ☁stepping3(20,62)      ☁stepping2(84,56)                       ░ │
   64   │ ░─────────── south edge of the Whisperwood ────────────────────────── ░ │
        │ ░  Old Orchard ♠(24,104)     ~Mirrorlake~      Lanternrow ▣          ░ │
   80   │ ░   mothertree              ~~~~~~~~~~~~~~~~   (116..154,            ░ │
        │ ░  ⌂orchard              ~~~ Starfall Keep ▦(78,106) ~~~ 114..152)     │
   96   │ ░             ~~~  ▲belltower(78,104) ~~~      (136,134)             ░ │
        │ ░             ~~~   ⌂greenhouse(78,110)~~~     ▣cellar               ░ │
  112   │ ░             ~~~ sunken tower(66,118)  merrow village(92,120)~~~   ░ │
        │ ░             ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~    ░ │
  128   │ ░        SE Whisperwood              town orchard                  ░ │
        │ ░                                             ░                    │
  152   │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
  160   └──────────────────────────────────────────────────┘

  ☁ = Cloudspire isle (floating in the air; this is its shadow position)
  ✦ = gated zone   ~ = water surface
```

**How to read the map**: the Cloudspire isles project onto the map **above the forest** (z 12–62), but they sit in empty air at y29–40. From the ground they are only shadows; only a flying form can reach them.

## 2. Zone Table

| id | English | Chinese | Shape | Location | Danger | In one line |
|---|---|---|---|---|---|---|
| `veil` | The Grey Veil | 灰雾墙 | border | the whole ring | 5 | It does not stop you leaving, it only makes you forget why you came back |
| `whisperwood` | Whisperwood | 低语林 | rect | (6,6)–(154,72) | 1 | Meadow and mushroom ring at the rim, ancient trees and deer paths further in |
| `glowglade` | Glowglade | 蘑菇圈 | circle r13 | (60,56) | 1 | A ring of glowcaps that breathes in and out at night |
| `batcave` | Echo Hollow | 蝙蝠洞·回声丘 | circle r13 | (28,30) | 2 | The hill hollowed into three layers of tunnel |
| `deepgrove` | The Hoar Grove | 圣林 | circle r18 | (104,32) | 3 | Silver trees; a human shape gets gored out |
| `mountains` | Ashscale Ridge | 北岭·鹰喙峰 | circle r26 | (142,18) | 3 | The bear's slope, wind blowing snow sideways |
| `mirrorlake` | Mirrorlake | 镜湖 | circle r34 | (78,106) | 3 | A sunken tower and a merrow village on the lakebed |
| `starfall` | Starfall Keep | 星坠堡 | circle r12 | (78,106) | 1 | The school on the island: four towers and a bell, a greenhouse in the cellar |
| `lanternrow` | Lanternrow | 灯笼镇 | rect | (116,114)–(154,152) | 0 | Where the main cellar stands |
| `orchard` | The Old Orchard | 果园遗迹·母树 | circle r15 | (24,104) | 2 | The ancestral ground of every fruit tree: only broken walls and a half-dead Mother Bloom |
| `cloudspire` | Cloudspire | 云顶浮岛 | air | y29–40 | 4 | Without a flying form this is only a shadow in the sky |

## 3. Points of Interest (POI)

| id | Name | Coordinates | y | Icon | Zone |
|---|---|---|---|---|---|
| `cellar` | Main Cellar | (136,134) | 20 | chest | Lanternrow |
| `belltower` | Starfall Bell Tower | (78,104) | 34 | tower | Starfall Keep |
| `greenhouse` | Fruit Greenhouse (cellar) | (78,110) | 18 | door | Starfall Keep |
| `sunktower` | Sunken Tower | (66,118) | 8 | water | Mirrorlake |
| `mermaidvillage` | Merrow Village | (92,120) | 9 | water | Mirrorlake |
| `groveheart` | Heart of the Grove | (104,32) | 24 | tree | The Hoar Grove |
| `cavemouth` | Cave Mouth | (28,34) | 24 | cave | Echo Hollow |
| `nest` | Ash Dragon's Nest | (40,20) | 38 | sky | Cloudspire |
| `mothertree` | Mother Bloom | (24,104) | 22 | tree | The Old Orchard |
| `mushring` | Glowcap Ring | (60,56) | 20 | shroom | Glowglade |

## 4. Vertical layers

The valley is not a plane, it is four layers:

| Layer | y | Contents | How to reach it |
|---|---|---|---|
| **Cloudspire** | 29–40 | 6 isles, the dragon's nest, the phoenix ring peak | Flight (owl/bat/moth/phoenix/dragon) or spider climbing + jumping |
| **Canopy** | 20–28 | Treetops, the bell tower roof, the spider's beams | Jumping + Leaper mushrooms; or spiders climbing trees |
| **Ground** | 15–24 | Forest, town, castle, orchard | Walking |
| **Underwater** | 0–14 | Mirrorlake, the sunken tower, the merrow village, the jellyfish field | Otter (breath holding) → merrow (underwater breathing) |

**Mirrorlake depth**: surface y14 at the centre, lakebed y5. Nine blocks deep — a human holding their breath for 18 seconds can just reach the sunken tower's window and come back up, but not get inside. This is the physical basis of the two-stage gate "Otterkin → Merrow Pear".

## 5. Scene detail

### 5.1 Starfall Keep (the castle)

On the island in the middle of the lake: four towers and a bell, with a fruit greenhouse in the cellar.

- **Bell Tower** y34: the highest standable point in the valley (isles excluded). The verification point of the quest "Wing of Night".
- **Greenhouse (cellar)** y18: glass roof (block 21) with demonstration fruit trees that **cannot be harvested** — they are the codex's living teaching aids, and the only place where you can watch a fruit's complete growth cycle.
- **The four towers** each present one rarity tier. The legendary tower is empty and holds a single line: "An Embercore used to sit here. It ate the other three."
- The castle walls carry **lumenstone lamps** (block 14, self-lit), the brightest light source in the valley at night — a moth form gets dragged toward them (the phototaxis side effect).

### 5.2 Whisperwood (the forest)

A rectangle covering the whole northern half. Three bands:

- **The rim** (z 60–72): moonlit meadow, the Glowglade entrance, fox dens. Common fruit: Owlberry, Mothpear, Vulpine Plum.
- **The middle band** (z 30–60): ancient trees, deer paths, Stagcap on fallen trunks. The herd's range.
- **The deep part**: the Hoar Grove (a separate zone, see below).

Tree species: oak (leaves 7 / dark leaves 27), pine (needles 8), silver (silver leaves 9, Hoar Grove only), willow (willow leaves 28, by the water).

### 5.3 Glowglade

A clearing 26 across ringed by 24 glowcaps (block 76, self-lit). At night the whole ring pulses on a 6-second cycle. The central clearing has the densest **glowing seeds** and is the main source of **cellar stones**.

### 5.4 Echo Hollow (the bat cave)

A hill hollowed into three layers of tunnel, about 120 blocks in total.

- Upper: Batfruit hanging from the ceiling (block 41).
- Middle: beamborn spider nests, Silkberry (block 49).
- Lower: the **root tunnel**, leading to the Mother Bloom's roots in the Old Orchard (used in chapters four and seven).
- Entering at night you hear "the chorus" — a whole cave of bats echolocating in unison. Once you are a bat you join it involuntarily (sound-wave pulses at the edge of the screen).

### 5.5 Mirrorlake

Radius 34, deepest at the centre.

- **Sunken Tower** (66,118): the top is at y12 (2 blocks under the surface), the base at y5. **Merrow Pears** grow on the window sills (block 47). Picking them requires breathing underwater.
- **Merrow Village** (92,120): y9, lit by the jellyfish field. The merrow are hostile to human shapes (attitude.human = hostile).
- **Jellyfish field**: positioned exactly as the outline of the sunken tower — from the surface, the tower is glowing.

### 5.6 The Old Orchard · the Mother Bloom

A ring of broken walls (30 across) plus one half-dead Mother Bloom. The Mother Bloom bears no fruit, but **Mother Bloom buds grow on its roots** (block 54, legendary, inedible).

The ruin's beams are held up by three centuries of spider silk — destroying the Silkberry nests collapses the beams and exposes the Mother Bloom's roots underground.

### 5.7 Cloudspire Isles

| Isle | Position | Radius | Top y | Contents |
|---|---|---|---|---|
| `nestisle` | (40,20) | 11 | 37 | **The ash dragon's nest**: bone heaps, embers, 3 Embercores |
| `phoenix` | (96,12) | 7 | 40 | The ash ring peak, the Phoenix Pit (burned into being, not grown) |
| `windbell` | (128,58) | 8 | 34 | Windbell Isle, no fruit, a viewpoint |
| `stepping1` | (66,40) | 4 | 31 | Stepping isle |
| `stepping2` | (84,56) | 3 | 29 | Stepping isle (the lowest air point in the valley) |
| `stepping3` | (20,62) | 4 | 30 | Stepping isle |

The stepping isles form a route from the forest canopy (y28) up to the Cloudspire — **you can reach the cloud tops without a flying form, but you have to climb + jump + not slip**. This is the hidden route for players who would rather not use the dragon fruit.

## 6. The fruit gating graph (progression dependencies)

```
  Ground (walking)
    │
    ├─ low root hole ──→ fox (dig / small size)
    ├─ Glowglade ──────→ no gate (teaching area)
    │
    ├─ Mirrorlake shallows ──→ otter (swim 2.2 + breath +25s)
    │      └─ inside the sunken tower ──→ merrow (breatheAir:false)
    │             └─ Merrow Pear ──→ unlocks "The Lake's Ledger" chapter
    │
    ├─ Hoar Grove border ──→ unicorn (attitude: human hostile, self calm)
    │      └─ Unicorn Cherry
    │
    ├─ vertical cave wall ──→ spider (climb)
    │
    ├─ canopy / bell tower ──→ owl (fly 5.2)
    │      └─ above 30m ──→ quest "Wing of Night"
    │
    └─ Cloudspire isles ──→ owl/bat/moth (fly) or spider+Leaper (climb+jump)
           ├─ Embercore (dragon's nest, dragons hostile)
           └─ Phoenix Pit (dusk only)
```

**The key design**: the Hoar Grove's key is not "find a Unicorn Cherry" but "become a unicorn". Inside the grove, unicorns' attitude toward `default` (human shape) is `hostile` and toward `self` (unicorn) is `calm`. The player must genuinely walk in as a unicorn — and the Unicorn Cherry trees are themselves inside the grove. The chicken-and-egg is solved like this: Stagcap on the deer path → stag form → unicorns are `curious` about deer (they do not attack, but they do not let you through either) → you have to slip in once with the herd and find the first Unicorn Cherry on a fallen trunk at the grove's edge.

## 7. Danger and the Grey Veil

| Zone | Danger | The actual threat |
|---|---|---|
| Lanternrow | 0 | none |
| Starfall Keep | 1 | none (but the greenhouse has demonstration fruit that cannot be picked) |
| Whisperwood / Glowglade | 1 | foxes stealing fruit, startled deer trampling |
| Echo Hollow | 2 | darkness (needs night vision or glow), falling |
| The Old Orchard | 2 | fruit-thief traps (block 80, need bear or dragon to dismantle) |
| The Hoar Grove | 3 | unicorn charges (goring, 2 damage) |
| Ashscale Ridge | 3 | ash bears (hostile to fox/deer/dragon), cold (needs bear form to resist) |
| Mirrorlake | 3 | drowning, merrow hostility |
| Cloudspire | 4 | falling, dragons (hostile to their own kind / merrow / unicorns) |
| The Grey Veil | 5 | veilbeast slot theft, loss of direction (the minimap fails) |
