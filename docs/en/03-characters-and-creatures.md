# 03 · Characters and Creatures

[中文: ../cn/03-角色与生物.md](../cn/03-角色与生物.md)

Source of truth: `game/data/creatures.js` (14 species + the attitude matrix + codex text).

## 1. Characters

### Linnaeus (林奈, 16)

A forager's apprentice from outside Lanternrow. Her name means "the one who names all things", but the townsfolk just call her "that girl who counts fruit".

- **Motivation**: when she first entered the valley she carried a hand-drawn fruit list left by her grandmother. The list has 41 fruits on it; only 15 can still be found in the valley. She wants to know whether the other 26 are gone, or whether her grandmother misremembered.
- **Ability**: no talent. What is special about her is that **she can hold the taste of two fruits at the same time** — an ordinary person eating two fruits dies of a magic-stomach churn; she only feels ill. This is the exception to the magic-stomach rule, and the precondition for the grafting route in the finale.
- **What she does not say**: her grandmother was driven out of the valley by the Greyglove Trading Company.

### Old Mei (老梅, ~70)

The keeper of the main cellar. She is the one who set the shape of Lanternrow's cellar: 96 slots, underground, constant temperature, spoilage rate ×0.1.

- She **never eats fruit**. She never transforms once in the whole game. Ask her and she says: "I smelled one Embercore. That was enough."
- Function: teaching, the backpack upgrade (Pouch, +6 slots), the only source of cellar stones.
- Secret: she can smell a fruit's remaining freshness — to the minute. That is why the cellar never fills up with dormant fruit.

### Toban Quill (托班·奎尔)

The valley agent of the Greyglove Trading Company. In his thirties; his gloves are grey because "you cannot have fruit stains on your hands".

- He is not evil. His position is that the valley's fruit cures diseases outside, and the valley is only nine kilometres wide.
- He does three things: buys fruit (paying money, which is useless in the valley), sets fruit traps in the Old Orchard (block 80), and tries to carry one Embercore through the Grey Veil.
- The correct way to use him: **he does not know which fruits go dormant**. The rare fruit you trade him for often has only half its time left.

### White Dew / Pendulum / Coral Tongue / Ashfall (named creatures)

| Name | Species | Location | Role |
|---|---|---|---|
| **White Dew** | Hoar Unicorn | Heart of the Grove | The only unicorn that knew Linnaeus's grandmother. It gored Quill twice |
| **Pendulum** | Screech Owl | Starfall Bell Tower | Head of the volunteer patrol. Will carry fruit you dropped far away back to the nearest store (once every 3 days) |
| **Coral Tongue** | Mirrorlake Merrow | Merrow Village | The negotiator for "restitution". Wants a brass bell back from the sunken tower |
| **Ashfall** | Ashscale Dragon | The Cloudspire nest | The only dragon in the valley willing to land — because it is dying. All three finale routes need it |

## 2. The creature attitude system

Attitude is not a numeric friendship score, it is the result of looking up **"what shape are you in right now"**.

| Attitude | Behaviour |
|---|---|
| `calm` | Ignores you, stays in your group |
| `ignore` | Does not react on its own, flees only when approached |
| `curious` | Comes closer to look (may lead you somewhere) |
| `flee` | Runs inside the `alert` radius |
| `hostile` | Charges / attacks inside the `alert` radius |

Lookup order: `attitude[creature id of the player's current form]` → `attitude.human` (when in human shape) → `attitude.default`.

### The full attitude matrix

Rows = creatures, columns = player forms. `·` = falls through to `default`.

| | human | owl | bat | moth | otter | fox | deer | jelly | merrow | unicorn | spider | bear | veilbeast | phoenix | dragon |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Screech Owl | flee | calm | curious | · | · | · | · | · | · | curious | · | · | · | · | flee |
| Grey Bat | ignore | curious | calm | · | · | · | · | · | · | · | · | · | · | · | flee |
| Lantern Moth | ignore | · | · | calm | · | · | · | · | · | · | · | · | · | · | flee |
| Lake Otter | curious | · | · | · | calm | flee | · | ignore | ignore | · | · | · | · | · | flee |
| Ember Fox | curious | · | · | · | · | calm | · | · | · | hostile | · | flee | · | · | flee |
| Fallow Deer | flee | · | · | · | · | flee | calm | · | · | curious | · | flee | · | · | flee |
| Lamp Jellyfish | ignore | · | · | · | · | · | · | calm | ignore | · | · | · | · | · | flee |
| Mirrorlake Merrow | hostile | · | · | · | ignore | · | · | ignore | calm | · | · | · | · | · | hostile |
| Hoar Unicorn | hostile | · | · | · | · | hostile | curious | · | · | calm | · | hostile | · | · | hostile |
| Beamborn Spider | ignore | · | · | · | · | · | · | · | · | · | calm | flee | · | · | flee |
| Ash Bear | ignore | · | · | · | · | hostile | hostile | · | · | hostile | · | calm | · | · | hostile |
| Ashscale Dragon | ignore | · | · | · | · | · | · | · | hostile | hostile | · | · | · | hostile | hostile |
| Veilbeast | hostile | · | · | · | · | · | · | · | · | · | · | · | calm | · | hostile |
| Ash Phoenix | ignore | · | · | · | · | · | · | · | · | · | · | · | hostile | calm | hostile |

**Three design intentions you can read off the matrix**:

1. **The diagonal is all `calm`** — becoming that species is the pass. The Hoar Grove, the dragon's nest and the merrow village all run on this.
2. **The unicorn row is almost all `hostile`** — unicorns are not peaceful creatures, they are *forgery detectors*. Any non-unicorn shape entering the Hoar Grove gets gored.
3. **The dragon row is `hostile` toward dragons** — on the Embercore route, eating the Embercore and becoming a dragon is not safe: other dragons attack you. This is the proof that a legendary fruit must carry a side effect.

## 3. Creature table

| id | English | Model | scale | Habitat | Activity | Speed | Alert | Pack | Fruit |
|---|---|---|---|---|---|---|---|---|---|
| `owl` | Screech Owl | owl | 0.16 | Whisperwood / Starfall Keep / Glowglade | night | 3.2 (fly 7.0) | 12 | 1 | Owlberry |
| `bat` | Grey Bat | bat | 0.13 | Echo Hollow / Whisperwood | night | 2.4 (fly 8.5) | 10 | 8 | Batfruit |
| `moth` | Lantern Moth | moth | 0.10 | Glowglade / Whisperwood / Mirrorlake | night | 1.6 (fly 4.5) | 6 | 12 | Mothpear |
| `otter` | Lake Otter | otter | 0.15 | Mirrorlake / Old Orchard | both | 2.6 (swim 5.5) | 14 | 4 | Otterkin |
| `fox` | Ember Fox | fox | 0.15 | Whisperwood / Lanternrow / Old Orchard | both | 4.6 | 16 | 2 | Vulpine Plum |
| `deer` | Fallow Deer | deer | 0.19 | Whisperwood / Hoar Grove / Glowglade | both | 5.4 | 20 | 6 | Stagcap |
| `jelly` | Lamp Jellyfish | jelly | 0.16 | Mirrorlake | both | 0.8 (swim 2.2) | 4 | 10 | Jellybloom |
| `merfolk` | Mirrorlake Merrow | merfolk | 0.20 | Mirrorlake | both | 1.2 (swim 5.0) | 18 | 5 | Merrow Pear |
| `unicorn` | Hoar Unicorn | unicorn | 0.22 | The Hoar Grove | both | 7.2 | 26 | 4 | Unicorn Cherry |
| `spider` | Beamborn Spider | spider | 0.18 | Echo Hollow / Old Orchard / Starfall Keep | both | 3.0 | 10 | 1 | Silkberry |
| `bear` | Ash Bear | bear | 0.24 | Cloudspire / Whisperwood | both | 5.0 | 22 | 1 | Bruin Fig |
| `dragon` | Ashscale Dragon | dragon | 0.34 | Cloudspire | both | 4.0 (fly 12.0) | 40 | 2 | Embercore |
| `veilbeast` | Veilbeast | veilbeast | 0.21 | The Grey Veil | both | 4.2 | 30 | 3 | Veilwalker Ash-berry |
| `phoenix` | Ash Phoenix | phoenix | 0.20 | Cloudspire | dusk | 3.0 (fly 11.0) | 25 | 1 | Phoenix Pit |

Distribution of the 69 individuals in the prototype: owl 6, bat 8, moth 10, otter 5, fox 4, deer 6, jelly 8, merfolk 5, unicorn 4, spider 4, bear 2, dragon 2, veilbeast 4, phoenix 1.

## 4. Codex text (implemented in game)

One entry per species, always written as "verifiable fact + unverifiable rumour":

- **Screech Owl**: by day it is wedged in a tree hollow like a piece of wood that breathes. At night it is the ear of the whole wood. The owls of the valley do not catch mice — they catch "stolen fruit", and form Lanternrow's volunteer patrol.
- **Grey Bat**: they locate by chorus: a whole cave of bats vocalises at once, drawing the tunnels as a map of sound. Once you are a bat you join the chorus involuntarily.
- **Lantern Moth**: moths hatched from glowing seeds. They line up in a row pointing at the nearest water — old fruit-hunters call this "the moth road", the most reliable compass when you are lost.
- **Lake Otter**: keeps a stone under its arm while sleeping. It steals shells from the merrow village and the merrow pretend not to notice — because otters carry things up out of the sunken boats for them.
- **Ember Fox**: the chicken coops of Lanternrow are never locked, because foxes only steal "what is already on the ground". The town therefore ruled the fox honest — that law has not been overturned in three hundred years.
- **Fallow Deer**: a deer path is not a road, it is a "decision" pressed into the ground by the same herd over centuries. Follow a deer path and you will certainly find water, and you will certainly find wolves.
- **Lamp Jellyfish**: the lamps of Mirrorlake. The jellyfish field sits exactly in the outline of the sunken tower on the lakebed — from the surface, the tower glows.
- **Mirrorlake Merrow**: merrow do not count heads, they count "returns". Every lake thing you give back, they give you one thing. Every thing you take, the lake remembers you once.
- **Hoar Unicorn**: what they attack is not people but "shapes that lie" — any human pretending to be a unicorn gets gored. So the only pass into the Hoar Grove is genuinely becoming a unicorn.
- **Beamborn Spider**: lives in the beams, weaves no webs for insects, weaves webs to *repair buildings*. The Old Orchard has not collapsed because of the beams they have been spinning for three hundred years.
- **Ash Bear**: the bears of the northern ridge dig "fruit cellars" — they learned to bury fruit and eat it slowly long before humans did. The shape of Lanternrow's cellar is said to be copied from bears.
- **Ashscale Dragon**: only three adult ash-scale dragons have ever been registered in the valley. They never land, they only circle the cloud tops — a dragon that lands is a dragon that is finished.
- **Veilbeast**: they do not bite, they only "take". A backpack slot touched by a veilbeast goes empty, and you cannot recall what was in it.
- **Ash Phoenix**: only ever seen at dusk. Every time it lands it burns off a small patch of cloud, which is why the Cloudspire always has fresh ash.

## 5. Magic plants (not creatures, but spread by creatures)

| id | English | Rarity | Effect |
|---|---|---|---|
| `glowcap` | Glowcap | common | Glows by itself for 5 minutes after picking; can be placed as a waymarker |
| `leaper` | Leaper | common | Jump +80% for 90 seconds; too many and your hands shake (camera jitter) |
| `drifter` | Drifter | uncommon | Creature alert radius −70%, footsteps gone, 120 seconds; after eating it others cannot hear you speak |
| `thorn` | Thorncap | uncommon | 90 seconds of melee damage reflection, movement −20% |
| `glowseed` | Glowseed | common | Plant in any soil: a permanent point of light, usable as a cellar-tree anchor marker |
| `cellarseed` | Cellar Stone | rare | Grows into a **cellar tree**: a 24-slot field warehouse, decay 1/3, visited by badgers and fruit thieves |

Plants do not change your form, they give temporary buffs or tools. They occupy 1–4 fruit slots and compete with fruit for the same capacity — **"carry a light or carry fruit" is a decision every trip makes**.
