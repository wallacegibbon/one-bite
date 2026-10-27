# Open issues

The working queue of unresolved problems, kept in git on purpose: `TODO.md` is
gitignored (local notes between sessions), so this file is the copy that
survives summarization and session boundaries. Measured claims about the game
live in `docs/` (both languages); round-by-round history lives in the commit
log. Update this file the moment a problem is found or closed, and commit it.

State at time of writing: round 26, tree `6494e99` (pushed to both remotes,
round-end gates green twice). Issue 1 (night sky read as black blocks) is
root-caused, fixed and pinned by the `theSkyBelowTheHorizon` law. Issue 3
(POI heights + teleport waypoint) is measured and fixed, data and docs
only. The meshing red of loop 3 run 7 is root-caused to CPU preemption and
the statistic is now the min of the chunk's three passes (2d). Law 2c (the
tower-masonry inside count of the day soak) is root-caused and fixed: a frog
deep in its dive steps flat across the wall face into the tower's frogpear
door (the doors are not rock), and the lift that raises a body onto its
floor asked nothing about the ceiling over its head, so it lifted the frog
into the glass and the solid-exit correction carried it up the masonry to
the roof; the lift now caps at the body's own column ceiling minus its
height while the feet are not already inside a hard block (a buried body
keeps the lift onto its floor — the lakebed law), the inside count is
aligned to the hard world (a leaf at the feet is the bush the body is
hopping through, as every gate already excuses), the soak is instrumented
with a per-frame entry window near the tower column, and a pinned-door
canary asks the fix directly. On that tree the soak loops came back
twenty-four green in a row (loops 4 and 5) -- forty-one consecutive
faithful full green runs altogether -- so the dust half of the flake (2a)
is closed on the resolution it was set to close on (guard provable,
measured airtight, the recorded red line never reproduced), and the
frog-ceiling half (2b) stands watched with the loop: its recorded red line
is a mid-development artifact of a rig the committed code cannot print.

## 1. Night sky read as black blocks when looking up out of the lake

**Reported by the user (screenshot, in conversation, not in the repo).**
Scene: Mirrorlake, night (23:29, day 1), player in frog form (ate a Frog
Pear), at the lake's edge looking up at the sky. What the user sees: a large
dark band with a jagged, 1 m-stepped edge running diagonally across the
frame; on the other side of the edge a smooth dark-blue night sky with a moon
glow. User's verdict: "the sky still has black blocks in it. This is wrong."

**Root cause (measured, reproduced in the user's own pose).** The sky quad
(`FS_SKY` in `game/src/engine.js`) draws a fixed grey below the horizon:
`mix(uGround, uHorizon, smoothstep(...))`, with `uGround =
mix(horizon, [0.25, 0.22, 0.2], 0.5)` built in `updateEnv`. That grey was
tuned while the sun was up: by day it lands at luminance ~132, the same
order as the day's lit terrain, so a daytime silhouette against it is a
silhouette. By night the horizon behind it is 0.10/0.12/0.20 and the same
grey lands at luminance **44** while the whole night world, tuned against the
horizon and zenith bands (17..31), lands at **10..38**. Every surface at the
horizon was darker than the sky it stood against, so the island's west wall
and the far shore's silhouette came back as black blocks cut into a pale
band.

Reproduced with the puppeteer + swiftshader harness at the user's pose
(lens in the water at the lake's edge, the island's west wall across the
frame, yaw 2.0944, pitch 0.35, 23:29, seed 20261008; the frame with the wall
across it and the moon on the other side is the user's frame). Asked of the
frame the way the eye asks it — draw the world, then draw the sky alone at
the same pose, and count the pixels of the first frame that are 15 or more
luminance below the sky that stands behind them — **17.97%** of the frame
was such a pixel for the human and **4.38%** for the frog. The below-horizon
sky band read 44.2; the wall 25..39; the far shore's silhouette 17..27; the
water 26..38.

The two suspects from the code read were ruled out by measurement: (a) the
water-surface pane is not the band — the lens of the frame is in the air
(`inWater = 0`) and the pane mirrors `uHor`/`uZen`, which the fix does not
touch (the `lakeMirrorsTheSky` law's baseline is unchanged); (b) the cloud
blocks are not black blocks — the soft-face cloud table computes to
luminance ~38..70 at night, brighter than the sky, and the band's edge is a
1 m-stepped **terrain** edge, which an in-page raycast attributed to the
island's stone west wall (block 3) 2.6..7.9 m from the lens.

**Fix (landed, `game/src/game.js`, `updateEnv`).** The band below the
horizon is not the sky: it is the far terrain the world is fading into at
the edge of sight, so it has to be the colour the world fades into — the
fog. `ground` is now `mix(groundDay, fogCol, this.night)`, asked of the fog
**after** the lens has had its say (the edge's veil and the water the lens
sits in have already moved it), because that is the fog the world at the
edge of sight is fading into. The gate is `night`, the sky's own darkness:
in the sun it is 0 and the grey is exactly what it always was (a noon frame
measured bit for bit the frame it was — `ground` at `night = 0` is the old
formula — and the only pixel differences between two runs of the same code
at noon are the creature blips the minimap and the world carry, 0.99% of the
frame); from 18:32 to 05:28 the band is the fog, luminance ~25.

**Measured after, same pose, same harness.** The below-horizon band:
44.2 -> **24.7** (the fog's own luminance). The black-cut-out share of the
frame: 17.97% (human) / 4.38% (frog) -> **0.14% / 0.11%** — the same order
as the run-to-run noise floor of the frame itself. Dusk (18:51) carries the
residual warm dusk fog in the band; the world's regions sit at or above the
band (wall 39.0/23.1, shore 27.6/21.6 against a band of 24.7 at night;
40.4/25.2 and 30.7/25.2 against 31.1 at dusk).

**Pinned by a new law** (`game/test/play.js`, step
`theSkyBelowTheHorizon` + two checks): the sky below the horizon at night is
the colour the world fades into (`env.ground` within 3 of `env.fogCol`; the
pre-fix law would have read 19.7), and under 1% of the frame is more than 15
below the sky behind it (pre-fix: 17.97%). The law runs at midnight in the
user's pose with the lens in the air, asks for `air` and `inWater = 0` as
preconditions, and restores the player, clock, mode and view exactly.

Status: fixed and pinned; awaiting the round-end gates.

## 2. The soak flake (round 26; work item T23, bug B34)

The suite's soak laws went red in roughly one run in three to six. Three
laws were in the flake pool; the first two were recorded in round 25 (B34)
and the third went red for the first time in round 26, loop 2, run 6. State
at time of writing: forty-one consecutive faithful full runs on the
current tree have gone green (loops 1-5); 2c is root-caused, fixed and
pinned, 2a is closed on its pre-set honest path, and 2b is watched with the
loop (its recorded red line is a mid-development artifact).

### 2a. Dust law (B34, half one) — `aMoteKeepsToTheAirItWasGiven`

Rig: `game/test/play.js` ~line 5431 (the dust of the highest isle).
Recorded red line (round 25, kept verbatim for the canary):

```
CHECK FAILED: the dust of the highest isle is let go above the beams and not inside the isle that holds them {"born":349,"bornIn":0,"samples":61073,"inSolid":152}
```

State of the art: the guard in `Particles.update` (`game/src/entities.js`
~2446-2463) is provably airtight on a static world (induction argument plus a
node replica, `inSolid = 0` in all 10 seeded runs). The recorded red line
predates, or is inconsistent with, the current code. The rig records a
per-slot 90-frame trail and a `bad` array (first 6 motes caught in a solid,
with a 3x3x3 dump) so a future red is readable.

Closed (round 26): the dust law never went red in the loops. Twenty-nine
consecutive faithful full runs on the current tree (loops 1-4) have gone
green, past the twenty-four the resolution was set at. The guard is
provably airtight on a static world (a mote born in air may only move to an
in-map cell that is not solid; the loop is synchronous inside one
page.evaluate, so nothing else can run inside it), and the node replica
measures it airtight: ten seeded runs, `inSolid = 0` in every one, the same
shape as the page's green runs. The recorded red line has not reproduced on
the current code. The law stays in the suite as a watch, with the trail and
the `bad` dump so a future red is readable.

### 2b. Frog-ceiling law (B34, half two) — `frogDoesNotHopThroughItsOwnCeiling`

Rig: `game/test/play.js` ~line 7654. Recorded red line (round 25, verbatim):

```
CHECK FAILED: a body on foot does not push off into a ceiling it cannot reach through {"spot":{"x":38.5,"z":20.5,"floor":25},"tall":0.43,"room":1,"launches":1,"badLaunch":1,"roomAt":[1.91],"inRock":52,"headThrough":21,"state":"wander","speed":0.76,"wind":1}
CHECK FAILED: and its body never passes through the ceiling of the place it is in
```

Notes: `roomAt: 1.91` with `badLaunch: 1` is arithmetically contradictory in
the committed rig (the threshold is `tall + 0.7 = 1.13`), so the line was
captured by a mid-development version of the rig; the current rig records the
whole 150-frame window (`traj`: x, y, z, vy, state, climbTo, climbRate,
wind, spd, the rig's `roof`/`gate`/`gy`/`room`, `inR`, `head`, the column's
four block ids, and `near` — bodies within 1.5 m) so a red run says in which
frame the body was told there was room and in which the world gave it no
place.

Geometry (seed 20261008, measured): the spot is the 1 m cavity (38,20) under
the beam isle's stone slab — dirt 21-23, grass 24, air 25, mountain rock 26,
stone 28+. Surrounding hollows: floor 24, ceiling 26. Ledges (38,21), (37,21),
(38,22): floor 25, ceiling 27. The only way to clear a ceiling-26 column is to
launch from a floor-25 ledge (room 2, a legal hop) whose arc drifts the apex
(head 26.21) into a ceiling-26 neighbour. Hand-simulation of the span-1 gate
says this is mostly blocked; nine Chrome runs and ~400 headless trials (fresh
spawn, full creature set, yaw sweeps, targeted shove) have all been green.
The unconfirmed suspects, in order: (1) a shove in the same frame after the
gate allowed the hop (the gate runs before the shove; the shove's
`bodyInSolid` checks only the feet cell, and `bodyRoom` never asks about the
ceiling); (2) mid-hop steering bending the arc off the gate's straight span;
(3) a landing in a low-ceiling riser, lifted out at 0.1 m/frame by the
solid-exit correction (`game/src/entities.js` ~2200-2220).

State at time of writing: not reproduced in forty-one consecutive
faithful full runs on the current tree (loops 1-5), and the hop gate it
would need has since been made to ask the ceiling -- material table, the
body's own column and the span the arc crosses -- and is pinned by the
deterministic law `frogDoesNotHopThroughItsOwnCeiling`. The recorded red
line is a mid-development artifact: its `roomAt: 1.91` with `badLaunch: 1`
is arithmetically impossible in the committed rig (the threshold is
`tall + 0.7 = 1.13`), so the line cannot be printed by the code the
twenty-nine green runs ran on. The rig records the whole 150-frame window,
so the next red -- if it comes from the post-suite state the flake needs --
says in which frame the body was told there was room. Watched with the
loop; not closed, because there is no proof of airtight for that
post-suite state.

### 2c. Day-soak law (NEW, loop 2 run 6) — `and none of them spends a frame inside the world`

Rig: `game/test/play.js` ~6617-6705 (the 40 s day soak: the 12 wild frogs and
6 owls are updated in frame order; a frog's feet cell solid = one inside
frame). Red line, run 6 of round 26 loop 2 (today), verbatim core:

```
CHECK FAILED: and none of them spends a frame inside the world {"seconds":40,"frogs":12,"owls":6,"wetFrames":2400,"inside":14,"insideHits":[["frog",21,66,13,115,13.12,"wander"],["frog",21,66,13,115,13.35,"wander"],["frog",21,66,13,115,13.55,"wander"],["frog",21,66,13,115,13.87,"wander"],["frog",12,66,14,115,14.14,"wander"],["frog",12,66,14,115,14.37,"wander"]],...
```

Decoded (hit field order: species, block id, x, y, z, creature y, state): a
wild frog with its feet in the **sunken tower's masonry** at column (66,115)
— block 21 (glass) at y13, then block 12 (dark brick) at y14 — rising
13.12 -> 14.37, about 0.1 m a frame. That rate is the solid-exit correction's
slow lift (`if (out > this.y) this.y = Math.min(out, this.y +
Math.max(0.1, 6 * dt)); this.vy = 0;`), which zeroing `vy` means the frog
cannot fall back through the slab: every frame its feet cell is solid it is
lifted 0.1 m and its downward rate is erased. 14 inside frames total; the
hits record only the first 6.

Tower column (66,115), seed 20261008 (measured): y0-3 sand/dirt, y4 dirt,
y5 sand, y6 dark brick, y7 glass, y8 dark brick, y9 frogpear (41, not
solid), y10 glass, y11 dark brick, y12 frogpear, y13 glass, y14-15 dark
brick, open air from y16. The neighbour columns (65,115) and (67,115) are
masonry y6..y15 with no frogpear holes; the frogpear doors exist only in
(66,115) and (66,121) — the tower's south and north wall. The lake water at
z=114 and the interior pool at z=116 top at cell 14 (film at 15.0).

Root cause (measured and reproduced, round 26): frogs move on foot even
submerged (the `waterColumn`-gated aquatic branch of `Creature.update`
never runs for them), and in the door cell the step and the floor both
answer "nothing over the head": `riser` reads the frogpear as not rock
(its `rockAt` is `solidAt && !TREE_BLOCK`), so `can` is a flat step and a
frog walking deep in its dive steps across the wall face into the door the
way it steps into any doorway — the doors are the tower's designed
entrances, and the hop gate (already landed) blocks the other way in. In
the door `inWater` is false (no water in the column), so the on-foot
altitude branch reads the floor as `standY(66,115) = 14` — the top of the
glass a metre over the door — and the lift raises the feet onto that floor
at `want * min(1, dt*9)` (0.27 m in the first frame), into the glass. The
solid-exit correction then takes over at 0.1 m a frame with `vy` zeroed,
and walks the frog up the masonry to the roof at y16: 13.12, 13.35, 13.55,
13.87, 14.14, 14.37 — the recorded red line, 14 inside frames.

Fix (landed, `game/src/entities.js`, the on-foot altitude branch): the lift
asks the ceiling of the body's own column the way the hop gate already
asks it — `roofY` up the column from one cell over the feet, material
table, leaves excused — and caps the height it raises the feet onto at
that ceiling minus the body's height and the hand's width the bird's
ceiling keeps, but only while the feet are not already inside a hard
block. In the door the cap is the underside of the glass (12.52
m), so a frog that steps in lands under it and walks on into the pool: the
door still opens. A body on the open roof or climbing an open column is
untouched, because there the floor is under the ceiling its head is
already under; a body already under a ceiling by more than a hand is
settled back under it by the fall, not moved by the lift.

The feet check is what the first version of the cap was missing. Capped
unconditionally, the lift of the lakebed law — a frog left 1.5 m inside
the shelf's bank, where the top of the bank is the ceiling over its head —
was capped at 12.52, under the shelf floor at 14 it is owed, and the
settle onto the cap undid the lift out of the rock frame for frame: the
body oscillated between 12.52 and 12.62 and was still inside the solid
after 600 frames, and `aBodyClimbsItsBank` went red on the first pre-commit
run of the day. A body with its feet in the rock is already inside the
world, and there the lift does what it has always done: it carries it onto
the floor at the rate (measured after: out of the bank in ten frames,
worst single-frame move 0.153 m, on the shelf and walking by frame 20).

The count is aligned with the rest of the code (test-only, `play.js`): the
inside predicate is now the hard world (`solidAt && !TREE_BLOCK`), the way
`stand`, `riser`, the solid-exit correction, the shove, the frog-ceiling
law and the owl's own count in the same step already read it. A leaf at
the feet's height is the bush the body is hopping through — the worldgen
puts dark-leaf bushes (block 27) at ground + 1.2 with fruit over them, and
a frog hopping from one bush lands with its feet in a neighbour's leaf at
the arc's apex, which the soak's control runs measured after the fix.
That is intended movement, not an inside frame; the masonry and the glass
— what the red was about — still count.

Measured (headless replica of the canary, `/tmp/m26flake/repro.js`):
before the cap, a frog pinned in the door cell (feet 12.45) rides the lift
out of the wall — 14 frames inside the hard world, first at 13.15 m, the
lift's own drift 13.15, 13.38, 13.57, 13.88, 14.15, 14.38, 14.57, 14.89,
highest 16.73 m; after the cap, 0 frames inside for every pinned door
depth 11.9-12.45 and the feet stop at 12.52 m, the underside of the glass.
Un-pinned control (a frog sent at the door walks into the pool): 0 inside,
reaches the pool in all five trials.

Pinned by a new law (`play.js`, step
`theFrogPinnedInTheTowerDoorStaysOutOfTheWall` + check): a frog of the
flock is pinned in the door cell, feet at the bottom of its dive, for 300
frames; the hard-world inside count must be 0 and the feet must never rise
past the cap (pre-fix: 14 and 16.73).

Status: fixed and pinned; awaiting the round-end gates, then the loop
again until the next red.

### 2d. Meshing-budget law (NEW, loop 3 run 7) — `the whole valley rebuilds inside the budget a frame gives meshing`

Rig: `game/test/play.js` ~line 9860 (three passes over all 400 chunks; the
pass with the lowest total is kept and `worstMs.ms < 12 && perK < 1` is
asked). Red line, run 7 of round 26 loop 3, verbatim:

```
CHECK FAILED: and the whole valley rebuilds inside the budget a frame gives meshing {"chunks":24,"verts":226014,"wet":51814,"bad":0,"badEx":[],"cross":443,"deep":11,"micro":10656,"microWet":5328,"sweepVerts":1105374,"sweepMs":390.1,"meanMs":3.9,"worstMs":{"ms":20.4,"ci":22},"perK":0.353,"mapGets":0,"getsPerK":0}
```

Not a logic bug — CPU contention. The law's own comment states the premise
("other things ran through the whole pass"); the fragile statistic was the
**single-pass worst chunk**: one chunk that gets preempted by the OS while a
headless browser is sweeping the same machine reads 20.4 ms against the
2.8..3.6 ms that chunk reads on the quiet passes around it (fifteen of the
seventeen full runs read 2.8..3.6 ms; the two runs that overlapped the
192-pose screenshot sweep read 9.5 and 20.4). The count half of the law
(`perK 0.353`, `getsPerK 0`) was green — only the time half went red.

Fix (landed, same file): the worst chunk is asked three times and read as the
**minimum of the three** (`perCi`), so a one-off preemption is dropped while
a chunk that costs 15 ms on every pass still answers 15 and goes red the same
way; the raw worst of all three passes is reported as `worstRaw` for the
record and is not asked of; the 12 ms cap and the `perK < 1` half are
unchanged. A frame that gets preempted is preempted as a frame, not as one
chunk.

### 2e. Loop tooling and current tally

Faithful repro = full `node game/test/play.js` under Chrome/puppeteer
(swiftshader), one run ~6-7 minutes. Loop scripts in `/tmp/m26flake/` (not in
the repo): `loop.sh` / `loop2.sh` / `loop3.sh` / `loop4.sh` / `loop5.sh` run
12 sequential full suites into
`/tmp/m26flake/{run,r2-*,r3-*,r4-*,r5-*}.log`, stop at the first red, append
`GREEN/RED on run N` + `CHECKFAILED=<n>` to `status{,2,3,4,5}`.
Parse a red log with `python3 /tmp/m26flake/parse.py <log>` — never `tail`
or `sed` the whole line (one step prints one ~100 KB JSON line). The parser
prints the soak's entry window (per-frame lines near the tower column:
frame, position, vy, yaw, state, the raw and the hard read at the feet,
nearby bodies) and the pinned-door canary.

Tally at time of writing: loop 1 — runs 1-4 green. Loop 2 — runs 1-5 green,
run 6 red (law 2c above). Loop 3 — runs 1-6 green, run 7 red (law 2d above,
the meshing budget, not a soak law). Loop 4 and loop 5 (on the tree with
the 2c fix) — runs 1-12 green each. Across all of it the soak laws have
gone red twice on recorded lines and not since: forty-one consecutive
faithful full runs on the current tree have gone green, the tower-masonry
entry (2c) is root-caused and pinned, and the dust half (2a) is closed on
its pre-set honest path. The next red, whatever it is, gets parsed with
`parse.py` and read before anything is touched; the loop keeps running as
the standing watch.

Instrumentation shipped in this round (test-only, `game/test/play.js`):
the dust rig's trails and `bad` dump (2a), the frog rig's full `traj` (2b),
the soak's per-frame entry window with frame and frog identity and the
column dump near the tower (2c), the soak's inside count aligned to the
hard world (a leaf at the feet is the bush the body is hopping through),
and the pinned-door canary law (2c). The `skim` law's raw-`solidAt` feet
count is the same outlier pattern as 2c pre-fix, but it has never gone red
and the lake holds no trees: it is left as is and watched, not widened.

## 3. POI heights and the teleport waypoint (theme queue item 10)

**Closed (fix uncommitted at time of writing; awaits the round-end gates).**
All ten POI columns and the teleport waypoint were asked of the world the
data generates (seed 20261008; probe `/tmp/m26band/poi2.js`). A POI's y is
the row the place stands at: the cellar's floor row (20) and the greenhouse's
deck row (21) were already right and are pinned by docs-sync §13, and
groveheart 24 was already the ground row in its own column, so it stands.
The other six rows stated heights the world did not have:

- `belltower 34` -> **36**. The keep's top is a 9x9 slab of city brick at
  y36 (77 brick, the four corners roof tile where the eave overwrites), and
  a body standing on it stands at y37. The eaves and the bell hang above it
  at y37..y42 as single floating tiles, reachable only by flight. A
  valley-wide census (isles excepted) answers: highest standable row with
  crowns counted 47 (the forest's crowns), without crowns the slab's own
  y36 -- tied with the ridge's rock top (also y36, 258 columns at that row).
  The docs' "the highest standing point in the valley" claim was rewritten
  to this measured tie, in both languages.
- `sunktower 8` -> **6**. The marker column was the shell's own water
  (interior water y7..y14). The shell's floor row is y6 (the 7x7 shell runs
  y6..y15 on a plinth capped at y5); the docs already state that range, the
  marker row just never said it.
- `frogshall 9` -> **7**. The marker column is the east wall of hut
  (90,120): shell y7..y10, water inside to y9. The huts' floor row is y7.
- `cavemouth 24` -> **27**. y24 was inside the hill's fill (the void under
  it runs y18..y23). The ground row at the marker column is y27; the mouth
  columns themselves slope down from y25 to y16.
- `oldtree 22` -> **20**. y22 was inside the trunk. The ground row at the
  tree's base is y20 (its crown tops out at y35 in its own column).
- `mushring 20` -> **24**. y20 was deep in the stone. The ground row is
  y24; the glowcaps stand at y25.

None of the six is read by code (the minimap takes only x/z; the game reads
only the y of `cellar`, `greenhouse` and `beams`), so the fix is data and
docs only: the `game/data/world.js` rows, both POI tables, the bell-tower
and frogshall detail lines in both languages, and the measured numbers in
the data's own comment. docs-sync §2 pins all ten rows in both languages;
the drift harness's frogshall name injection follows the new row.

Waypoint: verified sound. In the seed world `N.spawn` takes the street-spot
path at (136.5, 22.05, 128.5), yaw -pi/2: cell (136,22,128) is air, ground
below at 21, sky over. The fallback cell (136,21,126) is also air over
ground 20 with sky over. Nothing to change; `door.y + 1.05, door.z - 7.5`
answers against the measured `cellar 20`.

## Standing contract (every session, in order)

Human instructions, verbatim, still in force:

1. "I need the animals' movement to be natural and beautiful. This is very
   important! More important than the gameplay."
2. "Go over the project again, more stable, fewer bugs, more extensible,
   easier to maintain (without overdoing it)… and do the testing properly."
3. "I'm away for a while; keep working, and don't stop until you hit
   something you genuinely cannot solve." (Reaffirmed twice, most recently
   together with the order to keep the open issues in git.)
4. "When a piece of work is done and committed, push it to the remotes."

Per-round gate contract, in this order, never concurrent:

1. `node tools/extract-comments.js` -> stdout `[]`, stderr
   `occurrences: 0, unique: 0`.
2. `git log --format='%s%n%b' -1 | grep -cP '[\x{4e00}-\x{9fff}]'` -> `0`
   (grep exit 1 is green).
3. `node game/test/docs-sync.js` -> ends with the all-consistent line.
4. `node game/test/docs-drift.js` -> `OK every injected drift was detected`
   (tree clean afterwards).
5. `./game/test/all.sh` -> 10/10 PASS, run **twice** on the tree that gets
   committed, each run followed by
   `grep -c "CHECK FAILED" /tmp/frutaria-play.log` -> `0`.

Docs-only commits (a diff limited to `*.md`, checked with
`git diff --name-only` before pushing) run gates 1-4 only and skip gate 5:
the code suites of all.sh cannot see a markdown-only diff, and the code was
already verified on the earlier tree of the round. The full gate 5 still runs
twice on the final tree of the round, at the round's end, whatever the
last commit touched. (Round 26, second commit: the first docs-only commit
to take this path, saved the ~25 min double all.sh.)

After that: `git push origin main && git push gitee main`, confirm both
remotes equal HEAD, and write the final report in Chinese prose (no tables,
no internal checklist ids). Code comments and commit messages are English
only (CJK inside string/regex literals is fine).

## Key facts a new session needs

- Seed `20261008` (the default in `game/src/game.js`). World is generated
  once; tests never reseed mid-suite.
- Block ids: 1 grass, 2 dirt, 3 stone, 4 sand, 5 water, 6 trunk, 7 leaf,
  8 needles, 9 silver leaf, 12 dark brick, 16 cloud (solid false), 21 glass,
  22 bone, 24 mountain rock, 27 dark leaf, 28 willow, 41 (non-solid, in the
  sunken tower). `FOLIAGE = {7,8,9,27,28}`;
  `TREE_BLOCK = {6,7,8,9,22,27,28}`.
- Physics: `GRAVITY 23`, `MAX_FALL 42`. Frogpear: `speed 1.8`,
  `hop {up 6.0, period 0.9}`, `tall 0.43`, `swimSpeed 4.6`, `turn 1.9`.
  Wander speed = `cruise * 0.42` = 0.756 m/s. Hop apex = `up^2/2g` = 0.7826 m
  over the feet; gate threshold = apex + tall = 1.2126.
- Frame order inside `Creature.update` (entities.js): steering + horizontal
  step (~1408-1798) -> altitude (~1830-2170) -> hop gate (~2099-2141) ->
  vertical fall/climb -> solid-exit correction (~2200-2220) -> shove
  (~2221-2345). The gate and the shove run in the same frame, gate first.
- The solid-exit correction lifts a body out of a hard block at
  `Math.max(0.1, 6*dt)` per frame and zeroes `vy` — a body inside a slab with
  air under the slab rides that lift straight up through the masonry.
  That is what law 2c was catching. The lift that raises a body onto its
  floor (the on-foot altitude branch) is capped by the ceiling of the
  body's own column minus its height (`roofY − tall − 0.05`, leaves excused,
  the 2c fix) while the feet are not already inside a hard block: that is
  what keeps the door's frog under the glass; a body buried in the rock
  keeps the uncapped lift onto its floor (`aBodyClimbsItsBank`), because a
  capped lift under the top of its own bank would settle it back under the
  rock the correction is lifting it out of.
- `bodyInSolid` (shove destination test) checks only the feet cell;
  `bodyRoom` never asks about the ceiling. The shove can therefore move a
  body into a low-ceiling column.
- Node probe bootstrap (headless world, no GL):
  `global.window = global;` then require `game/data/{fruits,creatures,world,player,i18n}.js`
  and `game/src/{i18n,engine,world,worldgen,models,entities}.js`; then
  `const N = window.FRUTARIA; const w = new N.World(N.WORLD.w, N.WORLD.h, N.WORLD.d);
  N.generate(w, 20261008);`. `Particles` needs `gl = { createBuffer: () => ({}) }`.
- Height functions (entities.js 857-1040): `groundY` scans down from `from`,
  returns `y+1` of the highest solid (trees included); `terrainY` the same
  but skips `TREE_BLOCK`; `standY(w,x,z,y) = terrainY(w,x,z, floor(y+0.6))`;
  `roofY(w,x,z,from,top,soft)` scans UP from `from`, first solid not in
  `soft || TREE_BLOCK`; `airCell` = not liquid and (not solid or FOLIAGE).
- Chrome harness: `node game/test/play.js` drives `game/index.html` through
  puppeteer-core + `/usr/bin/google-chrome` with
  `--no-sandbox --disable-gpu --enable-unsafe-swiftshader --use-gl=angle
  --use-angle=swiftshader`; `npm ci` was run (node_modules present).
  The `play` step timeout in `all.sh` is 900 s.
- Untracked local files: `TODO.md` (gitignored notes; keep it in sync with
  this file's state), `/tmp/m26flake/*` (loops, logs, parser),
  `/tmp/m26*.js` (headless probes: dust guard replica, cavity map, tower map,
  frog repros, yaw sweep, targeted shove, spawn census).
