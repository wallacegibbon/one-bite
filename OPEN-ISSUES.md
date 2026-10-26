# Open issues

The working queue of unresolved problems, kept in git on purpose: `TODO.md` is
gitignored (local notes between sessions), so this file is the copy that
survives summarization and session boundaries. Measured claims about the game
live in `docs/` (both languages); round-by-round history lives in the commit
log. Update this file the moment a problem is found or closed, and commit it.

State at time of writing: round 26, tree `a539291` plus the uncommitted (and
now committed) test instrumentation in `game/test/play.js`.

## 1. Night sky read as black blocks when looking up out of the lake

**Reported by the user (screenshot, in conversation, not in the repo).**
Scene: Mirrorlake, night (23:29, day 1), player in frog form (ate a Frog
Pear), at the lakebed looking up at the sky. What the user sees: a large dark
band with a jagged, 1 m-stepped edge running diagonally across the frame; on
the other side of the edge a smooth dark-blue night sky with a moon glow.
User's verdict: "the sky still has black blocks in it. This is wrong."

Suspects (code read only, nothing verified yet):

- (a) The water-surface pane pass, `FS_WORLD` `uPane` branch in
  `game/src/engine.js` (~line 380). Looking up from under the surface: pass 1
  scales whatever is behind (the sky) by `surv * (1.0 - F)` where
  `surv = exp(-uLiqK * vPan.z)` — Beer-Lambert through the whole water column.
  At night the sky itself is dim (the file's own comment measures the night
  sky at luminance 17..21), so 4-8 m of lake takes it to near black; pass 2
  then adds `(1.0 - F) * uVeil * (1.0 - surv) + F * mir`, and from under the
  surface `mir` is forced to `uVeil` (`vPan.y = 1`). If `uVeil` is dark at
  night, the surface face reads as a black slab and its boundary is the
  shoreline — a stepped diagonal exactly like the screenshot. May be close to
  physical, but it reads as a blocky artifact; the user says it is wrong.
- (b) Cloud blocks (id 16, `solid: false`) drawn as a dark slab at night. A
  stepped cloud mass would also show as black blocks in the sky. The cloud
  block row and its draw path have not been read yet.

To do, in order:

1. Reproduce with the existing puppeteer + `google-chrome` swiftshader harness
   (the one `game/test/play.js` runs on): load `game/index.html`, wait for
   boot, set the clock to night (~23:29), put the lens at the lakebed
   ((66.5, ~5, 115.5) or the frog's own bed) with the camera pitched up, take
   a screenshot. Compare the dark region's edge against the lake shoreline
   and against the cloud layer height; sample pixel rows to find where the
   black band is.
2. Attribute the black pixels to one draw: read `uVeil`/`uZen`/`uHor` at
   night, or toggle the pane pass and the cloud draw in a scratch copy (do
   not ship the toggles), and screenshot each.
3. Decide the intended look (night sky through water: at least the moon and
   some stars should survive in Snell's window; no black blocky slab), fix
   the law in the shader (English comments, measured), and prove it with
   before/after screenshots plus pixel statistics, at night AND at day, from
   the lakebed AND from the bank.
4. If the fix touches the world fragment shader, re-measure the existing
   water laws in `test/play.js` (the suite has pixel-statistics checks for
   the lake seen from several lens positions).

## 2. The soak flake (round 26; work item T23, bug B34)

The suite's soak laws go red in roughly one run in three to six. Three laws
are in the flake pool; the first two were recorded in round 25 (B34) and the
third went red for the first time in round 26, loop 2, run 6 (today).

### 2a. Dust law (B34, half one) — `aMoteKeepsToTheAirItWasGiven`

Rig: `game/test/play.js` ~line 5431 (the dust of the highest isle).
Recorded red line (round 25, kept verbatim for the canary):

```
CHECK FAILED: the dust of the highest isle is let go above the beams and not inside the isle that holds them {"born":349,"bornIn":0,"samples":61073,"inSolid":152}
```

State of the art: the guard in `Particles.update` (`game/src/entities.js`
~2446-2463) is provably airtight on a static world (induction argument plus a
node replica, `inSolid = 0` in all 10 seeded runs). The recorded red line
predates, or is inconsistent with, the current code. If the dust law never
goes red in the loops, the honest resolution is: guard provable + measured
airtight — say so with the measurement, and close the half. The rig now
records a per-slot 90-frame trail and a `bad` array (first 6 motes caught in
a solid, with a 3x3x3 dump) so a future red is readable.

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

Tower column (66,115), seed 20261008 (measured): masonry from y4 to y15
(dark brick / glass / block 41 alternating; 41 is not solid), open air from
y16. `standY(66,115) = 16`: the tower's top is a floor at 16.0. The lake
water around it tops at cell 14 (film at 15.0). The hop gate blocks a hop
inside the hollow (room 1 < 1.2126), and a hop from the 16.0 roof only goes
up, so the entry mechanism is not yet identified. Candidates: a shove into a
non-solid 41 cell and a climb; a hop from a shelf at roof height drifting
back into the tower column and being pinned mid-arc; a swim path the water
law lets through.

To do: instrument the soak (for each frame, record x, y, z, vy, yaw, state,
and the column's blocks of every frog whose column is within one of
(66,115) — the entry window is what is missing; the rig already records the
first 6 inside frames), relaunch the loop until the next red, read the
pre-entry trajectory, decide law vs rig, fix minimally, measure before/after
(soak `inside = 0` over N loop runs, all the other soak numbers unchanged),
and add the canary: break the fix, expect exactly the recorded red line.

### 2d. Loop tooling and current tally

Faithful repro = full `node game/test/play.js` under Chrome/puppeteer
(swiftshader), one run ~6-7 minutes. Loop scripts in `/tmp/m26flake/` (not in
the repo): `loop.sh` / `loop2.sh` run 12 sequential full suites into
`/tmp/m26flake/r2-N.log`, stop at the first red, append
`GREEN/RED on run N` + `CHECKFAILED=<n>` to `/tmp/m26flake/status2`.
Parse a red log with `python3 /tmp/m26flake/parse.py <log>` — never `tail`
or `sed` the whole line (one step prints one ~100 KB JSON line).

Tally at time of writing: loop 1 — runs 1-4 green. Loop 2 — runs 1-5 green,
run 6 red (law 2c above). Across those nine runs the two B34 laws (2a, 2b)
stayed green: the recorded red lines have not reproduced on the current
tree, and the flake pool is wider than B34 (2c is new evidence). If the next
loop finishes 12/12 green, launch loop 3 (prefix `r3-`, status `status3`);
if ~24 runs stay green, report the dust half honestly (guard provable,
measured airtight) and keep hunting the frog halves.

Instrumentation shipped with this commit (test-only, `game/test/play.js`):
the dust rig's trails and `bad` dump (2a), the frog rig's full `traj` (2b).
The soak itself is not instrumented yet — that is the next step (2c).

## 3. POI heights and the teleport waypoint (theme queue item 10)

After the flake work is closed: ask the generated world (seed 20261008) for
the five unmeasured POI columns plus the teleport waypoint cell at
`door.y + 1.05, door.z - 7.5`. The POI rows state heights the world may not
have: `belltower 34, groveheart 24, sunktower 8, frogshall 9, cellar 20`.
Measure each before touching anything — the sunken tower's masonry tops at
16 in the seed world (see 2c), so at least the `sunktower 8` row needs a
re-read of what the number means. Fix the rows or the world, whichever the
measurement says is wrong, in both languages of `docs/`, with the measured
numbers.

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
  That is what law 2c is catching.
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
