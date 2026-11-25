# Open issues

The working queue of unresolved problems, kept in git on purpose: `TODO.md` is
gitignored (local notes between sessions), so this file is the copy that
survives summarization and session boundaries. Measured claims about the game
live in `docs/` (the single English set, with the bilingual index beside it);
round-by-round history lives in the commit log. Update this file the moment a
problem is found or closed, and commit it.

State at time of writing: this round is two numbers that meant something other than what they were quoted for.

- **The one-block shore was quoted fifteen times and counted by nothing; it is counted now, and it is 138.** `183` stood in seven comments of `src/entities.js`, five of the movement rigs and three sentences of 03 and 07 as the number of Mirrorlake's columns with exactly one cell of water over ground -- the depth `waterHoldsUp` is written at, and the premise of the step gate, the float law and the launch branch. `test/docs-sync.js`'s lake census answers **138**, and the same walk over every one of the authored 160x160 columns answers 2,958 water columns for the whole map, all of them that one lake's, so the scope of the figure is pinned beside it. 183 is not that count on this map or on the map of the commit where those sentences were written (there the census says **187**, the zone having grown from r34 to r38 and the lake from 2,029 columns to 2,958 since); no variant of the definition gives it on either -- the zone's square for its disc, the whole map for the lake, a bed that lets the water-line block count as ground, or the ground read as `surface()`. The fifteen quotations now carry 138 and each is searched for by phrase and compared with the census, in the chapters and in the code alike, with one drift injection mutating a `.js` file so that guard is known to have teeth. The chapter's claim that one cell is "the depth of every shore this valley has" is gone: the shelf is graded -- 138 columns at one cell, 178 at two, 982 at eleven -- and one cell is what a shore *is* where depth is counted in whole cells, the next cell up being already the line where the water holds a body off its bottom. Item 19 carries the rest.
- **A frame-rate floor in the suite was measuring this machine, and it has been replaced with a clock.** `test/save.js` held that each of the eight saves the game never wrote leaves a world still drawing at least 5 frames a second. Of the eight rounds of suite runs recorded since that floor was written it was red in seven, and its eight numbers repeated to 0.2 fps run after run -- which is not how a machine under a shared load behaves. The control those numbers point at has now been read, and the answer is neither the payload nor the load average. The eight payloads all put the body at the same address, so the only thing that changes across the step is how long that page has been standing there; a page that is never offered a save at all falls the same way (at the desk, over eight seconds of its own clock: 13.6, 12.9, 11.9, 10.1, 9.1, 8.5, 7.9, 7.4 fps, then flat), and so does one payload loaded eight times over (28.2 down to 5.1). What falls with the frame rate is the ground the world is holding: at a standing address the world streams the disc of chunk addresses its own haze reaches (`World.keep`), a millisecond budget's worth of geometry per frame, and the frame rate stops falling the moment that fill stops. The step now records both counts beside its frame rate, so the relation is in the log and not in this file: a run of it gives 131 chunk meshes at 25.6 fps and 609 at 5.0. What `Game.update` takes per frame does not move across that fill -- about 8 ms, its own draw call 1 to 2 of them -- so the growth is in what the page spends outside the game's code, a software rasteriser over more geometry, and it belongs to where a lens is standing, not to what it was asked to load. The check asks the world's own clock now: the update loop must have been handed a full second after every one of the loads, which is what "still running" was trying to say. `test/simwait.js` gained `trySim()` so those readings stay in one record and the verdict stays in the check that reads them. The other frame ratio the bullet below named -- the frogs keeping the water nine frames of every ten -- is a claim about a body staying under a surface and not about a machine, and is untouched.
- **On top of the commit above, item 31 was measured and closed.** The question underneath
  the hole -- whether a played frame ever answers a submerged lens's above-eye-line
  directions with nothing but the background -- has a census (`test/play.js`,
  `aSubmergedLensIsShownNothingAtAnAddressItHasNotReached`): set a body down at an address
  the run has never been at, **540** m from the map's centre, and all **156** of those
  directions meet the sea's skin at an address holding no mesh (nearest **5** m, farthest
  **52**, with **2,310** chunks of the outside held elsewhere and none of them here); one
  frame of the loop later **35**, by the twentieth -- a third of a second -- **0**, and
  **0** in every answer asked across the **480** frames the body is held there. A person
  asked to swim is carried **2.2** m in twelve seconds and crosses no chunk address; wearing
  a body built for the water the same body is carried **108.5** m across **8** chunk
  addresses, and neither finds a direction unanswered, the farthest surface any of them
  meets at **76** m. And the frame inside that window is drawn and read
  (`aFrameDrawnBeforeTheRingArrivesIsTheLiquidAndNotASky`): a cold lens 4 m under open sea
  is shown **81,926** pixels of sky where the sea should be, none brighter than **86**, with
  **0.8** of the 255 as the sharpest side-by-side difference in the whole frame and **0**
  pairs over 2 -- no edge, nothing of a surface -- and a surface returns on the machine's
  clock, its first frame at **0.02 s** on a quiet machine and **0.08 s** on a loaded one. The
  arc therefore has nowhere left to come from. Both sets of numbers are in 07 §3.2.
 「现在的水
太浑浊了，我希望它透明度变高一点……现实世界中湖是比海清澈还是浑浊?我们也遵循现实」
and 「那个圆环很奇怪呀, 而且真的在海底就看不见天空或者别的东西吗？」 -- the water is too
muddy, make it clearer, and let the world say which of its waters is the clear one;
and about the ring a lens under the water is shown: is there nothing past it?

- **Two liquids where there was one.** The valley had a single water record, so the
  sentence "the sea is clearer than the lake" could not be written, let alone tested.
  A sheet of open sea is the clearest water on this coast and a shallow rain-fed lake
  with kelp and frogs in it is markedly murkier: the sea row absorbs at green **0.085**
  a metre -- an absorption length of **11.76 m** -- and the island lake at **0.30**,
  **3.33 m**, the red term the same **1.40** in both because that is water's own
  chemistry and not a paint choice. The row is chosen by the column the lens or the
  ray stands in, read off the map's own records (`liquidRowAt`/`liquidColumnAt`), and
  the mesher hands every chunk of a face the row of the water its own columns stand
  under, counting the columns of that face that belong to a different one -- a count
  the two-liquid step now reads, and finds **0**: no chunk of a face the game holds
  stands in two waters at once. Of **100** sampled rings
  around the valley, **0** hold columns of both waters, and the nearest lake column to
  a sea column stands **127 m** away -- so this is not a difference anyone can step
  across; it is what the same lens reads at the end of a long road over one water or
  the other. The kelp in the lake is asked the same question and now reads against the
  lake's own **3.33 m** reach instead of the sea's.
- **What a mirror under water is a picture of.** The ring was right and is unchanged:
  both waters carry index **1.333**, so the window closes at the same **41.4 deg** above
  the eye line of a submerged lens in either. What was missing was the fill outside it,
  which was a colour. Every chunk of a face now carries one more number -- the metres
  between the film over its water and the ground under it -- and the pane lengthens the
  doubled road by that depth before it asks the water what sits at the end of it. On an
  open sea **8 m** deep, a lens **4 m** down and **131 m** from land, the frame's
  brightness over the pixels the mirror owns agrees with what the straight path says of
  that same floor to **1.4** worst and **0.59** mean over **37,282** rays; the same
  measurement with the depth asked away is a flat **29.3** across all of them. Where the
  floor is graded -- the lens standing **7 m** down in that sea, where the water's own
  bed walks -- the mirror runs **29.8 / 32.9 / 36.0** across three bands of it in the
  order the road says, and its brightest pixel, **37.8**, stands where the row of that
  sea at **250 m** says the brightest can be, **37.9**. In that same frame the sun's
  image is **0** pixels and the brightest thing anywhere in it is **38**: a lens on the
  floor of a clear sea is shown its floor, and the sky stays inside the window.
- **What it does not pretend.** The surface's wave is still withheld from a lens under
  the water, and that is measured rather than asserted: at the lens on the sea floor,
  asking the wave back puts **832** pixels over the water's own colour, **27** of them at
  the brightest -- the multiple-crossing artefact, not a glitter. The lake's own bed is
  asked twice where the two pictures cannot be told apart: straight down at an ungraded
  floor, and over the water at the same distance. And the room the mirror reaches is the
  room the straight path reaches -- a body standing out there is not in it, and the floor
  it shows is not charged for the sunlight that came down through the water onto it.
- **The lake was made clearer, and the chapter's numbers moved with it.** The row the
  lake absorbs at is **1.875** times what it was, so the figures for how much of a bed
  survives the surface were re-pinned from the same run: a bed **6 m** down keeps
  **0.14** of the spread it has dry and comes to within **0.5** of luminance of the
  colour the water scatters back; a bed **4 m** down keeps **0.297**. Four controls this
  file has been quoting -- "with the water's faces asked dry", "with the water asked for
  air" -- only ever touched the valley's own chunks, so a lens standing over open water
  held an island in its far ring and every "nothing of it drawn" figure it quoted was a
  control with no teeth. Both now cover the far chunks as well.
- **Two things the run said before it was believed.** The wave's effect at the sea floor
  was first read as a loss of **230** pixels and the mirror's agreement as a failure of
  **30**; both were the measurement, not the frame -- a mean is not a difference and
  comparing the frame against itself is not comparing it against the law. And the first
  run of the two-liquid step called the valley's lakes and seas one water at **100** of
  **100** rings: the census was sampling the island's own square, where one column can
  hold both. The probes that found both are in the step, not in this file.
- **What is next.** Item **31** is closed (above), so the head of the queue is item **28**'s
  remaining item -- caustics, the one light effect that item shipped without -- and its
  remainders; then **29**, **24**, **25**, the panic multiple's value, and whether
  `fogEmis` is really the same **0.15** under both waters -- a number the game states and no
  measurement here has yet defended.
- **Two of the suite's checks were frame-rate counters, and this machine decided one of them.** That one is closed above; what is kept here is the sequence that made it visible, because a flake that repeats is the evidence. `test/save.js` held that every junk save leaves a world that still runs ("frames > 5" for each of eight), and the rounds of suite runs since that floor was written give, in order: 9/10 with only `save` red, 9/10 with only `save` red, 8/10 with `save` and the frog-lane check red, 9/10 and 9/10 with only `save` red, and then 9/10, 10/10 and 9/10 -- `play` green with no failed check in any of them. The step's eight loads in one page decayed monotonically every time, and the last of them landed on either side of the floor by a hair: 24, 10, 12.3, 9.5, 7.7, 6.3, 5.6, 5.2 measured at the commit an earlier round started from, then 22.1-4.7 and 24.1-4.8, then 23.4-4.7, 23.2-4.8, 24-4.8, 26.4-5.1 and 26.1-5.0, and 25.6-5.0 on the tree this round closed it on. Those sequences agree with one another to 0.2 fps: a load-driven flake wanders, this one repeated, and the load average through a suite run (9.6-17, with the desktop's own indexer at a third of a core) was only why the margin was thin, not why the curve was there -- which is what the bullet above went and measured. The other check that bullet named, the frogs keeping the water in nine frames of every ten, is a claim about a body staying under a surface: it has been red exactly once in that whole sequence and green in every run since, and it stands as it is.
- **A debt this round found and did not pay.** Every figure in the two water bullets
  above was taken from a green run of this tree and re-checked against that run's log.
  A scan of 07 §3.2 against the same logs shows about fifteen figures elsewhere in that
  section -- the streamer's counts, the mesher's sweep figures from a round or two ago,
  the cull hole's pixel counts -- that no current run prints: some of them are stated as
  history and are honest, some are simply stale. `test/docs-drift.js` guards the data
  against the prose; it does not read prose against a frame buffer. Re-pinning that
  section is a round of its own, and the scan that produced this count is a grep of the
  chapter's bold figures against `/tmp/frutaria-*.log` -- a proxy, not a tool yet.
## 2. What the soak hunt left standing: the life a body has, the rate a breath burns, and whether water is a cause of either (2l, 2m, 2n)

The soak flake itself is closed -- the three laws that went red are root-caused,
fixed and pinned, and the record of that hunt is in the commit log rather than
here. What is kept are the three questions that hunt uncovered underneath it,
because the code still points at them: `game/src/entities.js` and
`game/src/game.js` ask a figure or a bound "at OPEN-ISSUES 2l" / "2m" rather than
inventing a number nobody has measured.

### 2l. The life a body has was written in three places and on no record, and the pair of clocks is what this valley's deepest floor is measured against (this round's commit; the first half of what 29 left standing under the water law)

**What was asked.** A body under water is held by two figures. One is how long it can hold its breath,
and the last two rounds put that on the record of every body that has a record and closed its two ends at
one rate. The other is how much of the body the water can take once the breath is gone, and nothing was
asked about it at all: the figure was written in `game/src/entities.js` (the state every body is first
in), in `game/src/game.js` (the state it is set back to when it dies) and in `game/src/ui.js` (the
number of marks the gauge draws), and on no record. The second and third of those are not the same kind
of fact -- one is a body's own capacity, one is what a page draws -- which is the shape this file has
been catching for several rounds, and the tell was the same: no run could say what would happen if one of
the three moved. The reason to ask it now rather than to tidy it was the pair. `breath` on the row and
the water's price against the life are one quantity -- seconds a body can spend under the surface -- and
this valley has a floor those seconds are either enough for or not: 02 s3 counts the water column by
column and names the deepest of them, and `docs-sync.js` reads that census out of the world the data
builds. The floor is **11** blocks of water at (72,83), film at y15, bed at y4, and it has been
documented for a long time. Nothing anywhere had put it in one sentence with the body that falls into it.

**What the measurement says.** All of it is in `game/test/play.js`
(`theDeepestWaterIsMeasuredAgainstTheBodyThatFallsIntoIt`), asked of the world the game itself builds,
with the body the run starts in and nothing but its own record under it.

- **The reach is the two figures and one price.** Stood on that bed and asked nothing, the body's store is
  empty at the **18 s** its row states and it is dead at **27.08 s**, having been charged nothing but the
  water, and charged the whole of its **5** by it: **0.55** of the life to the second, measured at
  **0.5507** once the frame's quantization is in it. The same body given **10** instead of **5** is empty
  at the same **18 s** and dead at **36.17 s** -- exactly twice the drowning, at a price that moved by
  **0.0003**. So the figure on the row is the whole of the arithmetic, and the check says so rather than
  reading the literal out of the source.
- **The deepest floor is climbable, at a price, with a margin.** Kept on the climb key, the body's head
  reaches the film **21.35 s** after it was put on the bed -- **3.35 s** past the end of its own breath --
  alive, having paid **1.842** of its **5** for the wait, with **5.73 s** of the reach left over. The
  water charges the wait against the life and not against the breath, and the paid figure and the seconds
  of waiting agree at the measured price to within **0.06**.
- **The panic figure decides that floor.** With the frightened state held open the way a chase holds it,
  the store is empty at **11.25 s** instead of **18**, the head never once reaches the film, and the body
  is dead at **20.33 s** -- **1.02 s** before a calm body reaches the surface. No claim is made about what
  the figure should be; what is recorded is that it is load-bearing at the deepest point of this world.
- **The valley asks, and the answer is a count.** **2,958** columns of standing water in the authored
  valley; **2,820** of them (**95.3%**) deeper than the body is tall; the **138** that are not are one
  block deep. At the film of that water, going forward at the **2.9 m/s** its own row states, the head is
  out in **6.3%** of the frames and the body drowns at **28.9 s** -- it is not the deep that asks the
  question, it is any of it.
- **The gauge and the record are one reading now.** The page's marks are counted against the record's
  figure, and the number of lit ones against what the body holds (the step ran behind another step's rig,
  which had left the body holding **10** of a life the record states as **5**: nothing in the game can do
  that, and the check does not claim it can).

**What is left open under it.**

- **The panic figure, and with it the burst price.** Unchanged as a question, and now with a measured
  stake: it is what separates a climbable deepest floor from a fatal one. The figure both of them need is
  how far a body's breathing rises above what it burns, and no row of this valley states one.
  **(closed by 2m:** the figure is on the row with the state that switches it, the burst turns out to be
  unchargeable rather than unpriced, and the reason the value cannot be settled by any measurement of a
  day is in that entry**.)**
- **Whether a person's body ought to float.** Half of this is answered: the valley asks the question, and
  the cost of not modelling it is measured above. The other half is not: what a real body's small positive
  buoyancy would be is a figure no row states, and the law that decides what the water holds up -- a body
  whose *animal* is built for that water -- is the user's own sentence for how this valley works. The deep
  water stays survivable at a price, so nothing is broken in the meantime, and a `hover` on the human row
  would be a second person rather than a law.
- **Whether a body should be told what the floor costs before it is on it.** The gauge shows the life and
  the air bar shows the store, and nothing shows the reach. Recorded as a question about the interface,
  not as a design.


### 2m. The state that decides how fast a body's breath burns was written in three places and on no record -- and once it is on the record it says why its own figure cannot be priced (closes what 2l left standing under the water law; its own cause question closed at 2n)

**What was asked.** The last two rounds put a body's breath on the record and closed that clock at one
rate at both ends; the round before that put the life on the record and measured the pair against the
world's floor. What was left on the same clock was its *branch*: a body whose fright is past a level runs
the store at a multiple of the stated rate. Four figures sat on that side of the branch and none of them
was a record -- the fill rate in `game/src/game.js` (the one place the valley puts fright into a body),
the drain rate in `game/src/entities.js`, and the level plus the multiple in another
`game/src/entities.js` line, the multiple sitting in the same expression as the question it answers. The
last of those had been called "the last unowned number on this clock" in the round that closed the two
ends, and every round since then had said the figure needs a stake. It had one: the deepest floor of this
valley is climbable on a calm breath and fatal on a frightened one. But the stake never touched the value,
and the reason turned out to be worth more than the number.

**What the measurement says.** All of it is in `game/test/play.js`
(`theFrightABodyCarriesIsOnItsRecordAndPricesNoPartOfADay`), asked of the body the run starts in, in the
same deepest column the round before it measured (11 blocks, film at y15, bed at y4, (72,83)), with a
straight run of dry ground next to it for the air end of the rigs.

- **The row is what the code runs.** Put **0.45** on the row as the fill and the state climbs at **0.33** a
  second instead of **0.79** and the panic level is not reached until **1.20 s** instead of **0.50 s**; put
  **0.4** on it as the drain and a body is back under the level **1.50 s** later instead of **4.98 s**.
  Nothing in the source has a figure of its own to fall back to.
- **A startle is a fifth of a second; the calm is five.** With an animal in contact -- asked through
  `Game.onCreatureTouch`, the one call that fills the state -- the body gains it at **0.79** a second: the
  row's **0.9** against the **0.12** the body is shedding in every frame, which is the two ends of the
  state seen at once. Past the level at **0.50 s**, at the ceiling of the state at **1.27 s**. Left alone:
  under the level again at **4.98 s**, rid of it at **8.32 s**. The fill is **7.5** times the drain, and
  that asymmetry is the whole of what a chase costs a body's breath -- the multiplied clock stays open for
  five seconds after the animal has gone.
- **The level is a switch, not a slope.** Held a hundredth below it the body spends its store at **1.000**
  units a second; a hundredth above, at **1.600**. The other reader of the same state -- the timer on a
  worn shape, drained by a fraction of the state past its own gate -- is a different question with a
  different shape, and this entry does not claim the two gates are one figure.
- **A multiple of a one-rate clock cancels, so it cannot be a price.** Held at one level for the whole of a
  stretch, **8.5 s** under that water spend **13.6** of **18** units at **1.600** a second and **8.5 s**
  with the head out hand **13.6** back at **1.600**: the store is exactly where it began, and the seconds
  of breathing the dive costs are the length of the dive -- **8.5 s** -- which is also what the calm cycle
  (**8.5** units at **1.000**) costs. The figure moves no part of a day's price. What it moves is where in
  a day the store runs out, and it only bites where a body cannot surface: on that bed, empty at **11.25 s**
  rather than **18.00 s**, dead at **20.33 s** where a calm body is still alive at **22 s** having paid
  **2.209** of its **5**.
- **And the valley never fills the state.** The call above is made by `Creature.update` only for an animal
  in the chase state, and an animal is put into the chase state only toward a form its own row says it is
  hostile to. Asked with the game's own `attitudeTo` over every animal row the data carries and every form
  its fruits can put a body in: **2** rows, **3** forms, **6** pairs, **0** hostile -- both animals ignore
  the person and are calm toward their own kind. Every frightened-body figure in this entry is a rig's; the
  deepest floor being fatal "at the panic figure" is a conditional this valley never opens.

**What is left open under it.**

- **What the multiple should be.** Still open, and now with the reason stated rather than assumed: no
  measurement of a day can reach it, because it cancels over any day a body can surface in. Anything that
  settles it is a claim about a body's margin inside one dive. The only dive in this valley with no surface
  in it is the deepest floor, and there the figure is worth **6.75 s** of empty-store time (**18.00 s** to
  **11.25 s**).
- **Whether the state should have any cause in this valley.**
  **(closed by 2n:** the water was asked as that cause and measured as one, and it is refused: the breath
  clock is already the water's price for a second, so a state the medium caused prices that second twice,
  empties the store at **11.45 s** where the row states **18.00 s**, and turns a multiple that provably
  prices nothing into a debt of **1.82 s** on an **8.5 s** dive. No figure for how fast water frightens a
  body is wanted after all. The fauna's own attitude is the question that survives, and it is a content
  question, not a figure**.)**
- **The burst price.** Closed as a question about this build, which is what 2l asked: the burst is refused
  in water and in air this clock only runs up, so the same **6 s** on dry ground give **+6.0** units at
  **1.000** a second with the burst and with it not (**6.815 m/s** against **4.70**, and **2.90** at the
  film where the burst is refused). The record's claim that the burst "is bought with breath" was a claim
  the build cannot make; the sentence in `game/data/player.js` and in 03 s3 now says that instead. Making
  it chargeable needs an intake figure, and rows state stores.
### 2n. The water is not a cause of the state that quickens a body's breath -- the clock is the water's price already, and a cause the body walks out of turns a nothing into a debt (this round's commit; closes the cause question 2m left standing)

**The question had the wrong shape.** 2m ended with the state on the body's record and with this valley
never filling it: **0** of the **6** (animal, form) pairs answers hostile, so every frightened-body figure
in that entry is a rig's. The sentence left standing was that filling the state on a near-drowning -- the
thing that actually threatens a body in this valley -- "needs a figure for how fast water frightens a body,
and no row states one". Asked again, that asks for a new figure in a place where the valley already has one.
The breath clock *is* the water's charge for a second: a body with its head under a water it cannot breathe
spends a unit of its store to the second because the medium is there. A state the medium itself caused
would multiply a clock the medium is already running, and that one second would be priced twice -- once as
the figure on the row and once as a multiple of it. Whether that is a real objection is not a matter of
taste: it has consequences, and they can be measured. So the counterfactual was built and measured rather
than refused in prose.

**The rig writes nothing new.** While the head is under a water this body cannot breathe, the medium puts
the state in at `fright.fill` -- the figure already on this body's record for putting the state in -- and the
ask is the same ask the breathing block asks of the head. The place is the bed of the world's deepest column
(11 blocks of water, film at y15, bed at y4, (73,83)), the column 2l measured the pair of clocks against, on
the body the run starts in. Two bodies, one column, the only difference between them the one line of the
rig. Measured in `test/play.js` (`theWaterThatTakesASecondOfABodysBreathDoesNotAlsoFrightenTheBodyThatPaysIt`:
`out.shipped`, `out.waterCaused`, `out.cycleShipped`, `out.cycleWaterCaused`).

**What making the water a cause costs.**

- **The figure on the record stops being the seconds the body gets.** As the game ships, on that bed the
  state never rises at all and the store runs the **18.00 s** the row states. Asked with the medium as a
  cause, the state is past the panic level **0.52 s** into the dive, **0.52 s** of the whole hold runs at
  the figure the row states, the store is empty at **11.45 s**, and the body lies dead at **20.53 s** where
  the body this game ships stands alive at **22 s** having paid **2.209** of its **5**. A row that states
  eighteen and is never allowed to run eighteen is a record written for show.
- **A multiple that prices nothing becomes a debt.** The round before this one proved that a multiple of a
  clock that runs at one rate at both of its ends cancels over any stretch a body can surface in -- the
  **8.5 s** dive that spends **13.6** units is paid back by **8.5 s** of breathing at the same multiplied
  rate, and the calm cycle's **8.5** units cost the same **8.5 s**. That cancellation holds for a cause the
  body carries with it. Cause the state with the medium and the same **8.5 s** dive spends **8.5** units
  with no cause and is handed them back by **8.50 s** of standing in air (ratio **1.000**, debt **0.00**),
  while with the water as its cause it spends **13.29** and owes **10.32 s** of breathing for them (ratio
  **1.214**) -- **1.82 s** more than the dive took. The test asserts what that debt is: the multiple short
  of the part of the stretch the state spent below the level at both of its ends. A day spent in the water
  would then cost more breathing than it lasts.
- **And the figure that sets that price is a figure about animals.** The multiplied end of the clock does not
  stop at the surface: the state is still above the level **4.98 s** after the head is out of the water,
  which is `(1 - panic) / drain` -- how fast a body calms down from an animal standing next to it. So "how
  fast water frightens a body" would not be priced by a figure about water at all.

**The answer: the medium is not asked as a cause.** The water's price stays the figure on the row -- a unit
of the store to the second with the head under, at both ends of the clock, which is what makes a second of
breathing buy a second of diving -- and the state keeps the one cause it has: an animal of this valley in the
chase state, which is a body next to a body. 03 s3 states the refusal with both sets of numbers, and
`game/data/player.js` and `game/src/entities.js` say it where the figures are kept.

**What is left open under it.**

- **Whether the fauna answers a body at all.** With the medium refused, the only thing that can fill the
  state is an animal's attitude, and the census says **0** of the **6** pairs is hostile and both rows say
  `default: 'ignore'`. A frog and a sea turtle are not predators of a person, so `hostile` is not the word
  that is missing; whether those animals *flee* a body that is not their kind -- which is what would put the
  animals' own `alarm` state to use and make this one live -- is a claim about what lives in this valley,
  not a figure the ground states. Not decided here, and it is now the front of the queue.
- **The multiple's value.** Unchanged, and further from reach: with the medium refused as a cause the branch
  is opened nowhere in the shipped valley, so the deepest floor stays survivable at the figure on the row
  (empty at **18.00 s**, and the water taking the life at its own price, 2l's **27.08 s**). Nothing that
  measures a day reaches the figure, and this round is what says the valley will not manufacture a
  measurement for it.
## 13. A second of stroking moves the body 4.6 m and not at all up (found by the gait strip)

**Open. The film shows it; nothing has been decided about it.**

`strip stroke` puts the worn body in a lane of Mirrorlake four blocks deep, holds
`fwd` for a second and measures **4.6 m/s** along with **0.02 m** from the bottom
of the stroke to its top. The legs fold and run out and the body's attitude does
change (`.shots/strip-stroke-side-00.png` onwards), so nothing here says the
animation is missing: it says a body travelling through water at the speed its own
data matches to the animal's never once changes the depth it swims at, for a whole
second, while the same body on land rises 0.73 m. It reads as a body on a rail.

Not compared against the animal, and that gap is stated rather than papered over:
every strip that films one of the valley's own is on land, so there is no
measured number for what the animal's own stroke does to its depth. The first
thing to add is a wild strip in the same lane -- `placeFor` already finds deep
water -- and then the two can be argued about.

Left alone because the answer is a design question (how much a stroke should carry
a body up through the surface) and because the water steps in play.js pin depth
behaviour that a rise would change. What is not left implicit is the measure: the
same one the hop uses -- the distance from the floor of the gait to the top of it,
here the depth the body holds against the highest it rises.

## 14. The frame check reports the world behind the body and bounds nothing about it (found by the camera work)

**Open. Content and palette, not a broken mechanism.**

The frame step `69bac02` added reports, beside the pixels it bounds, two numbers
it does not bound: `readsPct`, the share of the body's own pixels whose luminance
differs from what was behind them by twelve or more (bounded at 60, and the
clearing answers 72.3 for a person and 78.0 for the animal), and `contrast`, the
signed mean of that same difference -- **−13.6** and **−7.2** at that spot: the
body is darker than its surroundings by less than eight levels of two hundred and
fifty-five. Both pass every check. The second number is the one a player meets: a
body the right size, holding its joints, inside a frame whose every pixel is the
same colour family as the body.

The same flatness is not only grass. At the default hour the first metres of
Mirrorlake are a single blue gradient with no bed, no plants and no light in the
frame -- what the lake's surface answers with is settled elsewhere, in 07 §3.2,
and this is what lies under it.

Left open on purpose. The bounds that exist are on the body -- its pixels, its
share of the frame, the edges inside it, the share of it that reads against the
world -- and those are the bounds this round was asked for; the separation from
the world is a claim about the valley's content, and a bound on it would be an
art direction nobody has chosen yet. What would belong here next is not a repaint
but the same rig naming a ground the gait films are worth reading against, and
putting that ground where the strips film.

## 15. A body worn from a frog hops through a roof the frog itself walks under (found while closing 12)

**Closed. The sky over an arc is read once, and the rig that asks the question
runs the worn body at the same roof.**

The prediction made here was right and the measurement made it sharper. The same
rig (`frogDoesNotHopThroughItsOwnCeiling`) now has a second window with the
player in the frog's form at the cavity the search finds -- one block of ceiling
over the floor, the body standing 0.5 m in it, so it fits where the animal fits:
the animal launches **0** times under that roof and the worn body gave **8**
launches into it out of **8**, with its head going through a ceiling the animal
standing in the same hole would not load its legs under.

`arcRoofClear` states the reading once: the column the body stands in, the
columns the arc will have crossed by the time it reaches its top, and the cells
the body's own box reaches at push-off, with leaves excused by the material table
and a trunk not. What the two bodies still bring separately is the one thing they
cannot share -- an animal stands in a rectangle turned by its own heading, and the
body you wear stands in the axis-aligned box its record gives it -- so each hands
that list over and the rest is one law. The player's wind-up is held to the same
answer as the launch, so a body under a roof it cannot clear does not sit coiled:
it goes on its feet, which is what the animal's own gate has always done (the body
is driven toward its cruise every frame whatever the legs decide).

Measured on the final tree: **0** launches under that roof, **0** frames with the
legs loaded under it, **0** frames with the head through it, and walked, **4.25 m**
to the open. The same reading at a face: at the bank two metres tall the worn body
used to give **3** arcs and stand in **60%** of the frames -- the numbers it has in
the open, so it was throwing itself at the wall -- and now gives **1** arc and
stands in **83%**, which is the animal's own answer at that face (**3** arcs there
against the **8** of open ground). The bank rig's guard that required more than one
arc of either body at the wall was written for a worn body that did not consult the
roof at all; it now requires several on open ground and asks at the wall what the
law claims.

The two bodies read one record for how they move -- the motion fields live on the
animal's row and on nothing else, and a form carrying any of them fails the suite
-- and one line of that mechanism is still in two places. A wild body asks the
roof before its legs
load -- `play.js` step `frogDoesNotHopThroughItsOwnCeiling`: under a
trunk whose beam is one cell over the floor it stands on it launches **0** arcs
and walks instead, and its legs do not load for an arc that would not fit. The
body the player wears asks nothing: `Player.update` counts `hop.period` down and
pushes off whenever it is standing, under anything.

Both bodies are now thrown at the row's 6.0 m/s and both reach 0.73 m, so the arc
that used to bite -- 1.31 m, through a metre of the sunken tower's glass -- is
gone; what is left is that a worn frog hops into wood a wild frog would not
attempt, and spends frames with its head inside it.

Not measured, and that is stated rather than hidden: no rig runs a worn body under
a beam. What would close it is the 2b rig a second time with the player in the
frog form instead of one of the valley's -- the same built block at the same two
heights, the same counting of airborne frames inside the column -- and then the
same answer in the player's branch: no arc loaded under a roof it would not clear,
which is what a frog under a low roof does.

Left open because the arc coming down to 0.73 m makes the case rare now, and
because the honest thing to do with an unmeasured asymmetry is to write it down
rather than fix it on the way past.

## 18. The herd on the record and the population of the valley are two facts, and only one of them is read (found auditing the data)

**Closed by decision: two facts, two numbers, and the sentence about them is where
each number lives.**

The unifying was tried in both directions and neither is true. `herd` on a species
row is about the animal: how gregarious it is, how many of its own it keeps
together, which is what makes a stray walk back towards the middle of its kind
instead of standing alone by the water. The map in `spawnCreatures` is about this
place: how many of them the valley at your feet holds. A valley of five frogs holds
five whether its animals' herds run at eight or at three; a species record carrying
the valley's population would be saying something about maps inside a file that
knows nothing about maps, and a species record read as the population would make the
valley's size a property of the animal, which is how the two came to be printed in
one column in the first place.

So the number stays where the decision is made, and the comment beside it now says
what the other number means -- which is the only part that was missing. The chapters
print the row's herd under a column named for the field and say in prose what the
valley's five is; `docs-sync` section 3 compares that row against the record and
`docs-drift` plants three wrong cells in it to prove the comparison works. What is
left for a future round is not a merge but a second animal, which would make the
population map say something other than one number, and make the question of what a
valley can hold a real one.

`game/data/creatures.js` states `herd: 8` for the frog; `spawnCreatures` in
`src/game.js` holds `counts = { frog: 5 }`; and the chapters printed 5 under a
column headed `Pack`, which is how one came to be read as the other. The chapter
now prints the record's 8 under a column named for the field, says in prose what
each of the two is, and `docs-sync` section 3 compares that row against the
record -- so the confusion cannot come back unnoticed.

What is left is the shape of it. `sp.herd` is read at exactly one place, as a
flag: `(sp.herd || 1) > 1`, whether a stray walks back towards the middle of its
own kind, which `game.js` works out once a tick for the whole flock. The number
after the flag is inert. So either the record's herd becomes the population --
`spawnCreatures` reading `sp.herd` instead of a private map of its own, one
number in the repository for one fact -- or the field is named for what it is, a
switch, and the valley's counts stay where the game decides them. The first is
tidier and couples two ideas that are not one idea: how gregarious an animal is,
and how many of them a particular valley holds. The second is honest and leaves a
data field carrying a number nothing reads, which is the kind of thing `reach.js`
was written to notice.

## 19. The one-block shore is quoted by three laws and counted by nothing that runs (found measuring the shore; closed -- the count is 138, and the number that stood there was never this count)

**It was a test gap, and the gap had a wrong number in it.** `183` -- the columns of Mirrorlake whose water is
exactly one block over ground -- was the premise of three things: the bound `waterHoldsUp` puts at two cells
rather than one, the float law's "a body standing in a two-block pool has no floating level at all", and the
shore shelf the chapters and the entity code describe. Nothing computed it.

**The census computes it now, and the answer is 138.** `test/docs-sync.js`'s lake walk -- the same walk that
answers the map chapter's 2,958 water columns, its depth range and its shares -- counts the columns of the
lake's own disc whose water stands one cell over ground: **138**. The same walk over every one of the authored
160x160 columns returns **2,958** water columns for the whole map, all of them that one lake's, **138** of them
one cell deep: the scope of the figure is no longer something a sentence can be vague about.

**183 is not that number on either map this repository has.** Run against the tree at the commit where those
sentences were written (b5e569b), the census answers **187** there and 138 here -- the zone has grown from r34
to r38 and the lake from 2,029 columns to 2,958 in between. No variant of the definition reproduces 183 on
either tree: the zone's square rather than its disc, the whole authored map rather than the lake, a bed that
lets the water-line block count as ground, or the ground taken as `surface()` (the highest solid block a body
would stand on). So it is not a stale reading of this quantity; it is a different quantity, or an untraceable
one, and it has been removed rather than corrected in place.

**What was changed.** The places that quote the count -- seven comments in `src/entities.js` (the step gate,
the buoyancy answer, the launch branch, the standing test, the gait figure, the dive floor), five in the
movement rigs built on that shelf, and three sentences in 03 and 07 -- now carry 138, and every one of them is
found by phrase and compared with the census, in the chapters and in the code alike; the check names how many
places quote it, so a quiet deletion is visible. The chapter sentence that states it was rewritten to say what
the number is: one cell of water over ground is not "the depth of every shore this valley has" -- the shelf is
graded, 138 columns at one cell, 178 at two, down to 982 at eleven -- it is what a shore *is* in a world that
counts depth in whole cells, because the next cell up is already the line where the water holds a body off the
bottom of it. Three drift injections keep the guard honest: a chapter's census figure, a chapter's quotation,
and -- the only mutation of a `.js` file anywhere in the suite -- one number changed in `entities.js`.

**What is left standing.** The count belongs to the map, so a map change turns this red on purpose, and 03 and
07 follow the census rather than lead it. What the census does not answer is the shelf outside the authored
square: the sea's beaches round the island are ground the same column rule builds, and a census of them would
walk streamed chunks, so the valley-wide half of the old sentence -- "every shore this valley has" -- was
dropped rather than measured.
## 20. An animal at a wall with no way round gives the errand up (found with a desk probe; the wall rig does not ask it)

**Open, and the only part of the old complaint that is still unmeasured.** The
other half of that complaint -- a body drawn through the wall that was stopping it
-- is closed: the rectangle a body is drawn with is now the rectangle its movement
asks. This is the half no rig asks, read at the built two-metre
bank with a hand-written probe rather than by the suite: an animal walked at a wall
neither its legs nor a lift can take walks about **1.5 m** along the face and then
gives the errand up, because the contour finds no step and the law falls through to
`this.tx = this.x; this.tz = this.z; this.pause = 0.5` -- a fresh errand half a
second later, in a body that is standing three metres from the thing it was walking
to.

The rig that closed the first half (`anAnimalWalkedAtAWallStandsOutsideItAndGoesRound`) asks the
same body at walls of three, five and nine cells with the errand held past the far
end, and every one of those walls has an end and a way round: the animal went round
all three, on the old tree and the new, in a time that follows the length of the
wall. So the complaint is *not* reproduced there, and it is not answered either.
What it would take to measure it is the same rig with the errand held on the far
side of the wall instead of past its end -- a target the wall is between the body
and, with no gap at either end of it within the window -- and the two questions
"how far along the face does it get, and does it try again at all". A dog does not
give up at a fence; whether *this* animal should keep looking is a decision about
what an animal is, and it should be made against a measurement of what it costs now,
which is what is missing. The one comfort in the old observation stands: the worn
body and the animal fail a wide wall the same way, because both are answered by the
same contour.

## 21. An animal looks three centimetres to one side when it decides which way round (found while measuring the way round)

**Open, and it is a question about how far an animal sees, not about what its body
is.** The contour that picks a way round probes four directions at
**`spd*dt`** to one side -- at a frog's cruise that is **3 cm**, one frame's walk.
It works: the animal walks along a face until the face ends and then turns, at every
length of wall tested, and the cost of the detour is the same **half a second** at
walls of three, five and nine cells (the numbers that rig measures), which is what walking to
the end of a wall costs. What has not been measured is what the width of those
probes costs: an animal that sees only one frame sideways cannot begin to turn
before the wall ends, and the walk it makes is the one a body with no view makes.
The walls of that rig were built long -- nine cells, twenty-two body-lengths -- so
that the length, not the turning, was what was being timed, and they showed nothing
about this.

A rig for it would hold the same errand and ask where along the face the body turns,
not whether it gets round: the distance from the end of the wall to the point where
its path starts to leave the face, measured now against measured with probes sized
in body-lengths rather than in frames. Before that is done nothing should be
changed here: the numbers for a wider look are exactly as unknown as the numbers for
the present one, and the animal in the valley reaches every errand it is given a way
round.

## 23. The hand is 5.5 m long whatever body is wearing it (found while closing 22)

`rayTarget()` bounds its answer with one constant: `REACH = 5.5`, measured from the
body, in every direction, for every body -- and in third person the ray itself starts
at the lens, `d 1.192` behind a frog's head and 5.55 m behind a person's. Both of
those were deliberate and both are measured: the reach belongs to the body rather than
to the lens, or picking a fruit would depend on how far the camera happens to stand
(docs/07, "One camera per frame"), and one number for every body is the same
simplification `docs/04` §6 already names as an open question.

It stayed invisible for as long as it did because the thing that showed it -- the
marker -- was drawn on whatever the ray stopped at, so it was always somewhere. Now
that the marker only appears where the key can act, what it *does not* mark is on
screen too: a body pressed against a face cannot pick the fruit a metre past it, and a
frog's arm is not 5.5 m. Nothing was changed this round: a reach belongs on a body
record (`game/data/creatures.js`, `game/data/player.js`) and that is a decision about
every body in the valley, not a side-effect of a marker. What is worth measuring first
is what a reach of a body's own size costs -- how much of the valley's fruit a frog
can pick at all, standing where it can stand -- which no rig reads today.

Status: open. Found while closing 22; deliberately not acted on this round.

## 24. An animal may be born in water shallower than the dive its own record states (found by a suite flake; closed -- the depth is the shallower of the ask and the room the column gives, and the lake is counted at that law)

Open. Two full runs of `all.sh` in this round came back 9/10 with
`theFrogsSwimTheRingOfTheKeep` red: one of five bodies covering **4.7 m** and,
the second time, **18 m** in thirty seconds, while the other four swam the ring at
1.7-2.3 m/s. Nothing in the payload could say what that body was doing, so the
rig was given the eyes to say it: per-body wet/dry frame counts, where each body
was placed and where it ended, its own `speed` field, and every fifth frame a
solid test one metre ahead of its nose at the height it floats at.

The second occurrence then read itself, and it was not what it first looked like.
The body had been **placed in water 2 m deep** -- the rig's own minimum, which is
also the game's line for "the water holds this body up rather than being a bottom
it stands on" (`waterHoldsUp`) -- **599** of its 600 frames wet, **1** of its 120
samples with anything in front of it, and its own speed field reading **2.17 m/s**
while it made **0.6 m/s** of ground. That is the case the water file already
names: *"a dive that runs into the bottom is not a failure: it becomes a body
sliding along the mud with still legs"* -- and a frog is born with a dive of
**1.5-4.0 m** (`diveTo`). Every frame of it was held up at the surface while its
legs worked against the bed. The rig, not the game, was asking the wrong question
of the lane.

The first answer to that was itself wrong, and it is on record because the way it
was wrong is the point. It asked a lane for the body's height, its dive and half a
metre -- `tall + diveTo + 0.5`, **4.93 m** for the worst dive a frog draws -- and left
out the depth that animal's own row settles it at, which is what the dive starts under:
**1.6 m** for a frog, so the room is **6.75 m**, not 4.93. A run with that fix in
placed a body in a **5 m** lane and went red for the same reason, and the count
below, which was first read out of that same wrong arithmetic, was understated:
it printed **6.3%** and **22.9%** of the lake's accepted water columns where the
game's own predicate gives **22.9%** and **37%**.

Fixed in the rig, and the fix is reported rather than hidden. A lane is now
searched as the whole band it is (three metres either way along the radius, a
tenth of a radian either way along the angle) rather than outward only, and the
question asked of each place is the game's own rather than a restatement of it:
the level `floatLevel` says a body of that kind hangs at, that body's own
`diveTo` under it, and the gap `bedFloor` keeps off the bottom. A body that
cannot be placed is named (`unplaced`) instead of measured, and a dive that has
to be pinned to what the water allows is named too (`divePinned`) -- pinned to
`reach`, the longest dive that column still allows, which is the same number the
search tests, so the fallback and the test cannot disagree. In the green runs of
this rig: all five lanes found in **5-9 m** of water, `unplaced` and
`divePinned` both **empty**, every body wet in **600 of 600** frames (the count
of frames a body spends out of the film, and the longest such run, are reported
per body and stood at **0**; the check allows a body to break the surface on the
top of a dive and holds it to four frames of it), and the five bodies of each
run covering ground, by their own paces and the lanes they were born holding, at
**1.70-2.32 m/s** for paces of 0.90-1.20 -- every one of them its own pace times
one cruise rate, **1.93 m/s** per unit of pace in one run and **1.92** in the
others (that one brought all five bodies back at the same 1.93, a spread of
**0.001**), no body
off the mean of its own run by more than **2.2%**. What is *not* the same from run to
run is the angle each one closes (**1.75-2.97 rad**) and the radius of the lane
it was born holding: those are drawn at birth, and they are reported, not
bounded. (Runs whose lanes were taken at the game's two-block line reported
spreads of **0.017-0.021** with two bodies at 1.88-1.91 rather than the run's
own 1.93, and two of them went red outright.) The solid probe stays as a
diagnostic and reports that a body touches a solid in **0-13 of its 120** samples
and passes on: it is the lakebed's own stone, an outcrop in the south-east arm of
the band at 24-26 m whose top stands 4 m under the film (36 of the band's 1,890
columns; the other 1,852 are sand, and 69 of those beds carry kelp, which is not
solid and is swum through), and it stands across no part of the ring.

And the guess written down mid-round -- that a body swimming into a solid has no
way round it -- is **retracted**. What the probe counts in green runs is **0-13**
contacts in 120 samples, and the thing contacted is the lakebed's own stone
outcrop, not a wall of the frog's place; the bodies carry on at full speed
through it, and the red body's difficulty is fully accounted for by where it was
placed. Whether a swimming body steers round an obstacle at the height it floats
at is a question nobody has asked yet, and it should be asked with a rig of its
own (a hut wall with an errand on the far side of it, the way the bank and wall
steps do it on foot) before it is answered with a new movement law.

What is genuinely open is in the game, not the rig: the water file's rules are
stated for any animal -- the dive floor is the animal's own `diveTo`, a dive that
runs into the bottom slides along it, a body cannot breathe below half its height
-- but the one test that decides where a swimming body may be put, where it may
be sent, which way it may swim and the height it hangs at (`waterColumn`) asks
the ground only: two blocks of water, so there is somewhere to hover. It never
asks the animal. The room a dive actually needs is not two blocks: it is the depth
that animal's own row settles it at (`hover`, **1.6 m** for a frog, measured to its
crown), the body's own height twice over -- once at the level it hangs at, once
at the gap it keeps off the bottom (`bedFloor`) -- and the dive under all of it.
For the 0.43 m body a frog pear wears that is **4.3 m** of water for the shortest
dive its kind draws and **6.8 m** for the longest. The count, before any rule
(`tools/shallowprobe.js`, untracked; Mirrorlake's own habitat window, the columns
`samplePos` will accept, read with the same water functions the animal uses, and
with the room a dive needs found by bisection on the game's own predicate rather
than by arithmetic written next to it -- the first version of this probe wrote
`tall + diveTo + 0.5`, which is short by the hang depth, and rebuilt the body's
height out of the model table instead of asking a body for it, getting **0.2 m**
for an animal that stands **0.43 m**; that is how a "fix" for this flake let a
second run go red): of **4,513** columns in the habitat,
**2,820** are water the game accepts; their depths run **2 m** at the least to
**8 m** at the median and **11 m** at the deepest. **22.9%** of those places hold
too little water even for the smallest dive the kind draws, **29.9%** too little
for a dive in the middle of its band, **37%** too little for the 4 m dive at the
top of it. Pairing the 200 bodies the constructor makes with the places the
sampler offers, **30.1%** of those pairings seat a body in water shallower than
its own dive, and the five frogs this valley seats at a game start give an
**83%** chance that at least one of them is. The animals are not broken by it --
they hover, they swim, they eat -- but nearly a third of the places the game
offers a frog is a place where its own dive cycle spends its time with its legs
against the bed.

The band the rig measures has the same shape: the water 25-30 m out round the keep
is **3 m** deep at its shallowest, **7 m** at the median and **10 m** at the
deepest, and **54.4%** of it is deep enough for a dive at the top of the band.
The rig's own search, walked for 200 bodies drawn as the game draws them, found a
lane the dive clears every time -- **0** would have needed the dive pinned, **0**
would have gone unplaced -- so `divePinned` is a fallback and not a path; it is
now derived from the same predicate that chose the lane (`reach`, the longest dive
the column still allows, asked of the game's own `floatLevel` and `bedFloor`)
instead of from a second arithmetic written beside it, because two restatements
of one law drift, and one of them was already wrong by the hang depth.

Status: closed. The rig was closed last round; the birth is closed by the law.

**Closed by the law, not by the rig.** The ask stays the animal's and the water
bounds it: in the dive branch of `Creature.update` the depth reached is
`fl - Math.min(this.diveTo, room) * pow(cyc, 0.4)`, with `room = max(0, fl - bed)`
and both ends the same `floatLevel` / `bedFloor` that branch already asks. A body
in water shallower than its dive works the room there is; a body in water deeper
than its dive is untouched, term for term, because `min` returns the ask.
`waterColumn` still asks only the ground, and that is deliberate: the shallows are
this kind's niche, and a frog standing in a two-metre shelf is not out of its
habitat. What asks the animal is the dive, which is where the animal's own number
is; a habitat gate would have turned a wading frog into an animal outside its own
lake.

Measured by `theDiveAsksTheAnimalAndTheWater` in `game/test/play.js` -- one body
of the valley's own (0.43 m tall, `hover` 1.6), its cycle set to 0.1 rad/s,
inside the 0.05-0.15 the constructor draws, one cycle to settle and two measured,
the body held in one column so that the window is about that column -- four
columns of Mirrorlake answer in one run: a **3 m** column, room **0.757 m**, where
a **1.5 m** ask and a **4.0 m** ask both reach **0.756**; a **5 m** column, room
**2.757 m**, where the **1.5 m** ask keeps its own **1.500** and is at the floor
in **0** frames of **2,514** while the **4.0 m** ask is answered by the floor at
**2.756**; an **11 m** column, room **8.756 m**, where both asks come out their
own, **1.500** and **3.999**; and a **2 m** pool, room nil, where the body is held
up in **0** frames and sits at **13.05** -- the ground and the 5 cm its own feet
ask -- for the whole window. Under the floor: **0** frames in every case. Over the
ceiling: **0**. Frames with the hold on, the stroke running and the height not
changing: **1**, in a run of **1**, which is the cycle turning at the bottom of a
dive. `diveTo` left exactly as drawn in every case: the water bounds the dive and
never rewrites the animal.

That last sentence is what a rig of one's own is for. The first version of this
window went red on itself, in the shallow column only, and only sometimes: an
animal at the foot of a bank sets `climbTo` for the step it is asking for, the
dive floor is asked of that ground when there is one (the same `gyH` the standing
branch uses, so a body climbing out of the lake does not dive through the bank it
has its front feet on), and a body the rig pins in place never finishes the step --
so that bank stood there for the rest of the window as the floor of every dive,
two metres up. Three runs after the rig was made to hold the ground it was
climbing onto as well as the body: bit for bit identical.

The symptom before the change was read with `/tmp/diveprobe.js` (untracked, the
same body and the same columns with the old line in place): in a **3 m** column a
**4 m** ask left the body at the floor in **1356** of **1600** frames and held up
and not moving at all in **1131** of them; the 5 m column **1130** and **905**; the
6 m column **371** and **139**; the 7 m column and deeper **0** and **0**. That is
the shape of the defect, and those zeros at the deep end are the no-harm half of
it -- the same band bottoms, before and after, in every column whose room is at
least the ask.

The census now comes from the committed window rather than from a probe, and it
supersedes the one this item carried: **2,795** of the lake's disc are columns
`waterColumn` accepts, their depths run **2 m** to **11 m** with a median of **8**;
**13.3%** give less room than the least dive the kind is born with and **37.3%**
less than the deepest; in **178** of them -- the two-block ones -- the animal's own
level stands under the floor, so it stands. The 07 §3.6 row that printed **22.9%**
and **37%** and "4.3 m of water for the shortest dive" is gone with the item: the
terms that row itself states (`1.5 x 0.43 m` of body, the **1.6 m** hang, the ask)
give **3.75 m**, not **4.3**, and the threshold the game answers at is depth 3.
The pairing figures (**30.1%** of pairings, an **83%** chance across five frogs)
measured a cost the bounded ask removes, and they go with it.

The rig is shorter now. `theFrogsSwimTheRingOfTheKeep` no longer asks a lane for
the dive and no longer pins `diveTo`: a lane asks one thing, that this body's own
level stands above the floor its water holds it at, and the dive the body drew at
birth is left alone -- a window that edits the record it is measuring reports its
own arithmetic. What it reports with that gone is the same verdict as with the
pin, in water the old rig refused: the lanes are taken at 4-8 m of this lake
depending on the run, `unplaced` empty, every body wet in 600 of its 600 frames,
and the five bodies of a run within 2% of the one cruise rate that run prints
(1.92 m/s per unit of pace in both of them). A body the old rig would have called
too shallow to dive in swims the ring at its own pace now, and that is the fix
showing up in the game rather than in a rig.

## 32. A body that swims is never asked what it is swimming round (left standing by 24)

Open, and not yet asked. An animal steers toward its errand at its own turn rate
and takes the way round that closes on the errand when the *step in front* of it
is solid; that is the walk, and it is on the record (07 §3.6, "Creatures have no
pathfinding"). Whether a body hanging under the surface of a lake, metres above the
bed, reads a solid the same way has never been asked of it. The only probe of it
is the solid test the ring window runs every fifth frame one metre ahead of each
body's nose, and what that probe reports across green runs is **0-13** contacts in
**120** samples, the thing contacted always the lakebed's own stone outcrop in the
south-east arm of the band, and the bodies carrying on at full speed through it.
There is no defect on the record -- there is a question nobody has put, and the
guess that there was a defect was retracted in 24.

Asking it needs a rig of its own: a wall with an errand on the far side of it,
placed at the height a body floats at rather than on ground, which is what the
bank and wall steps do for a body on foot. Until it is asked, nothing here should
be written as though it were known.

## 25. The sea has ground, and nothing on it (partly shipped)

**Half shipped.** The rule is in shipped code and the ground it states is
built, meshed, stood on and asked for again: the sea holds islands, denser near the
island this square sits on and thinner out, with no line where they stop (02 §1.2).
What the decision asked for -- 越靠近中心岛越密集, 越远的地方岛越稀疏 -- is arithmetic
now, not intent: an Archimedean spiral out of (80,80), **7** islands a turn gaining
**60 m** of radius (**377 m** between turns), a **40 m** pull along each radius (under
half the turn gap, so two turns cannot trade places), a **24 m** channel kept between
every foot and this island's shore, five kinds stated only as a foot radius and a
crown height, and an id that *is* the ordinal along the spiral with the place computed
from it -- and the inverse question answered too, since `islesNear(x, z)` names the
islands standing at an address from the address alone. Each island is one pile of
ground raised out of the floor it stands in, `1 - smoothstep(d / foot)`, so it has no
cliff, no wall and no ring, and its shoreline appears where the dome crosses the water.

Measured at the seed the game opens with, over the first **70** ordinals -- as far out
as the game streams ground on its own, and no further (`game/test/node-smoke.js` asks
all of it as arithmetic, `game/test/play.js` asks the same ground as a world a body is
put on, and `game/test/docs-sync.js` measures the chapter's numbers itself):

| | |
|---|---|
| raised as ground | **70** of 70 ordinals; none cut down for want of room; closest two feet **178.9 m** apart |
| kinds | **15** sandbars, **16** reefs, **23** thickets, **11** isles, **5** ridges |
| per km², by km band | **3.50 / 2.02 / 1.21 / 0.82** -- the gradient the rule exists for |
| the nearest of them | centre **389 m** from (80,80), **169 m** of open water past this island's water's edge (the measure, and this number, moved with the shore rule: it is taken to where the sea stands now, not to the shore line -- see the body of commit fe8ee39) |
| how far open sea is from land | **5,088** points sampled on rings to 1.5 km: median **171 m** from a foot, furthest **476 m** -- against the **966 m** one fruit buys out and back |
| what stands on it | **0** cells of tree, fruit or plant over the **15,421** columns of the nearest footprint big enough to stand on; its materials are the material table's own (grass over soil over sand over the mountain rock the sea floor is paved with) |
| what a body does there | stands on it with its feet down in **100%** of 120 frames, walks **13 m** of it outside the authored array with **0** frames falling, and the ground comes back cell for cell the same after **813** chunks were let go |
| what it costs | **0.7-1.0 µs** a column in open water, **1.2-1.6 µs** where an island stands under it (**0.2-0.4 ms** per 256-column chunk; in-game, over an island's own chunks, **1.17-1.56**); it was **2.7-4.1 µs** before the positions and records were cached, before each island's floor was asked once rather than per column, and before the neighbour window was cut from eight turns of the spiral to the three that can reach a point |

Three findings that belong to the codebase rather than to the map, recorded because
each one would otherwise be rediscovered:

- `generate()` twice into one `World` does **not** reproduce a valley: planting asks the
  cell it chose and moves on when something already stands there, so the second pass
  draws a different set of numbers (seed 20261008 hashes **1271637568** built once and
  **3338319353** built twice into the same array). Every "the same world again" claim is
  therefore asked in a fresh array, and the authored square's hash pin -- the number read
  out of that seed before any island rule existed -- still holds in a first build.
- `stream()` walked its rings from `r = 1`, so the lens' own chunk was never meshed. A
  body that *walks* into a place has its own chunk in the previous ring and never saw
  the bug; a body that is *put* there -- a save restored, a lens started out at sea --
  stood on ground that was filled but never meshed. The island rig came back with one
  hole, in the middle, and that is what fixed it.
- The generator has no path that plants outside the authored square: `tree()` and
  `bush()` are called only from inside `generate()`. That is the mechanical reason the
  census above reads zeros, and the reason filling an island's footprint with life is a
  design job and not a bug to patch.

**What is still open, and what deciding it needs.**

- Nothing lives on any of it. There is one fruit in the tables (`frogpear`) and one
  plant (`cellarseed`), so "different islands grow different things" is a rule with one
  thing available to fill it; and no animal's placement rule can be asked outside the
  valley's zones (issue 24 is the same wall). What each kind should carry, and whether a
  body would ever cross an arm of the sea for it, is the design question -- the ground
  and the ids are ready for the answer.
- A home island for a player's own id is derivable and is **not** built. An id does
  exist -- `game.js` makes it in `init()` (`p-` + `IDEN.idBytes` random base-36
  characters), the save stores it and `load()` restores it, and `stashes[].owner` already
  keys cellar-tree ownership on it -- but it is the game's own, made afresh for each new game
  and not issued by anything, so a "home" island derived from it would move with every
  new game; there is no second player either (07 §3.6, "No identity service"; 03 §6
  documents the three identity layers). The open half is therefore a design question --
  what is a home island *for*, and should it survive a new game -- not a missing field.
- **The minimap painted the authored square and nothing else.** Closed by this round. With
  real ground out there, blank paper was a map lying rather than a map being modest: the
  old `mmBase` in `game/src/ui.js` read columns x/z 0..160 and was painted once at boot.
  The map is a window of ground round the body now, bounded in size, cost and holding, and
  the question it answers -- what does the ground around me look like from above, and has
  it been changed since I painted it -- is answered by `mmSample`, `mmWindow` and
  `World.edits`, with the rig described at the top of this file asking it at a place
  **387** cells out.
**The queue the user gave, in their order (this round, recorded so it is not lost).**

1. **Done three rounds ago (fe8ee39).** The main island was owed a gentle shore. In their words:
   主岛是不是得有一个平缓的地方，不然都没法上岛 -- "isn't the main island owed a gentle
   place, otherwise there is no getting up onto the island". It was a slope question in
   `worldgen.js`, exactly as this item guessed, and it is now a rule: the shore's grade,
   the run a drop needs from it, the reach over which the sea grades the land's relief
   away, and the water line falling where that slope crosses it. The rule and every
   measured figure -- the wall it replaced, what a shore is now, and a body walked up the
   hardest one it has -- are in the body of that commit. The worldgen anchors in
   `docs-sync.js` moved as expected, and one of them moved because the measure was wrong
   rather than because the world did: the open water between this island and the nearest
   is now taken to where the sea stands (**210.0 m -> 169.0 m**), while the rest held
   (**70** of **70** ordinals raised, **178.9 m** closest feet, **389.0 m** to the nearest
   centre, the **15/23/16/11/5** kind census) because no island moved.
2. **Done four rounds ago (29cd91e).** The minimap stops lying about the world outside the
   authored square: it went black past the main island because it painted one **160x160**
   base image and nothing else. It paints a window of ground round the body now -- the
   record is in the entry for 29cd91e below.
3. **Done this round.** The sea turtle, and the sea peopled. In their words: 前肢像翅膀一样
   上下划 (it rows with its front flippers the way a bird's wings move), a `swimSpeed`
   above the frog's **4.6**, no skin-drying clock on land, a land speed under **1.8**, the
   island nearest this one to be a sand isle carrying the turtle's fruit grown in sand,
   the main island keeping only the frog's, and 现在海里面啥动物都没有，太冷清了 -- right
   now there is no animal in the sea at all, it is too empty. Every one of those is now a
   measured fact rather than a wish; the record of what was measured is in the state block
   at the top of this file and in the body of this round's commit, and the two rules it
   needed -- a fruit planted only on a kind of ground, and an animal given its lift only
   on a kind of ground -- are 02 §3 and 03 §3.
   What is *not* done, and was never in the item: the sea has no other animal in it.
   One row, three bodies, in one lane off one island's shore. The empty sea the item
   complained about is less empty; it is not peopled.
   One thing had to be true before any of it could be looked at from a boat or from
   inside: the sea being legible to a lens standing in it. That was taken up two rounds ago
   (6bd3b3f -- a lens standing in the sea is inside the sea: the sky, the water's mirror and
   the water's distance paid one colour per eye) and finished last round (a0408d0 -- the walk
   asked at the edge of the ground the frame is certain of, the wave asked only of lenses
   outside the liquid). The surface's own law seen from under it, which that round left as
   **27**, is closed by this one: a level lens under a lake is met by its own water, and the
   sky comes only through the fan the index leaves it. What still stands between that frame
   and a sea a body can swim in is **28** -- the crossing is unbent: no refraction, no
   Snell's window, no tilt on the surface, no caustics, and a mirror under the water that is
   a colour instead of the lakebed.

- **The block table has a hole at id 16.** Unchanged from last round: the cloud block
  was deleted with the wall, `N.BLOCKS[16]` is `undefined`, and two helpers index the
  table unguarded. Latent, not live; it should still not be left to luck.

## 26. The practice of not using names has no cause now (a decision, kept visible)

Open question, deliberately unanswered. The in-world cause of forgetting -- the
Grey Veil taking names -- is gone with the boundary (01 §3), and this round
removed the sentence from the help text that stated it, in both languages and in
the inline fallback in `index.html` that `lang.js` keeps honest. The *practice*
stands unchanged, because it never needed the fog to be a rule: a player has an
`id`, which is what the records are keyed by, and the fiction quotes an epithet
earned by deeds ("the fruit counter" and what follows it). Docs/03 now says in
terms that the practice stands and the cause does not, and refuses to invent a new
mechanism to fill the hole -- an invented mechanism is exactly the over-design the
standing contract rules out. If a cause is ever wanted, it has to come out of
something the game already has; nothing in it does yet.

## 28. The crossing itself is not bent: no window, no tilt, no bed in the mirror (found while closing 27; three of its four shipped)

**What is missing, stated as four things the frame does not do.** They belong together
because they are all consequences of one absence -- the surface is a place where light
changes direction, and this renderer has no place where it does.

- ~~**No refraction, so no Snell's window.**~~ **Shipped this round.** What was said there
  was true and is now replaced: the pane knew *which* directions got through (**41.4 deg**
  above the eye line of a lens under the water) and nothing about *which way they bend*. It
  asks the vector form of the law of the face's own normal now, and the frame answers with the
  window: a sun standing **29.55 deg** up is seen at **40.73 deg** off the vertical where the
  law puts it at **40.74**, its image is nowhere in the frame when the bending is asked away,
  and the window's rim is its brightest ring (**75.7** at the middle, **99.5** at the rim, and
  nothing above **54** -- the water the lens stands in -- from **51 deg** out). The figures,
  the rig, and
  what it costs are in the state block above and in 07 §3.2; the step is
  `theSurfaceUnderWaterBendsTheWorldIntoItsWindow`.
- ~~**The surface's tilt is asked nowhere.**~~ **Shipped this round.** `cn` was the cosine to
  the face's own *plane* while the vertex wave displaced the geometry; the vertex being
  displaced now writes the normal its own two sines give it and the pane asks that face for
  the cosine, the critical-angle test and the mirrored direction. A lens over the water is
  therefore shown the lake's own cells instead of one flat gradient -- measured in
  `theWaterFaceAnswersWithItsOwnTilt`, and the figures are in the state block above and in
  07 §3.2. What it deliberately does **not** reach is a lens *inside* the liquid: the wave is
  withheld from a lens under the water (the multiple-crossing artefact it caused is the reason
  the surface is shown flat there, and it is also item 1's obstacle), so under water the
  mirror is still flat, the window still has no glitter, and nothing yet moves on the bed.
  Getting the tilt under the skin means solving that compositing first, which is the same
  obstacle as item 1.
- **No caustics.** The bed's `aUnder` term asks how much daylight got *down* through a
  column of water; nothing asks what the moving surface did to where that light lands.
- ~~**The mirror under water is a colour, not a picture.**~~ **Shipped this round.** Over the
  closed fan the pane returned `uVeil` -- the water's own colour, named as such in the shader
  and in 07 §3.2 -- because the mirrored ray's answer would have been paid for along the
  straight line. The question was answered at the mesh instead: every chunk of a face now
  carries its own depth, the metres between the film over the water and the ground under it,
  and the pane lengthens the mirrored road by that depth before it asks the water what sits
  at the end of it. A lens 4 m under the open sea looking up at 1.2 rad is shown, beyond the
  window's rim, the bed of the sea it stands in: the frame's brightness over those pixels
  agrees with what the straight path says of that same floor to **1.4** worst and **0.59**
  mean over **37,282** rays, and where the floor is graded the mirror walks with it -- a
  lens **7 m** down in that sea sees its bed in three bands of **29.8, 32.9, 36.0**, in the
  order the road says, its brightest pixel **37.8** standing where the row of that sea at
  **250 m** says the brightest can be, **37.9**; the same measurement with the depth asked
  away is a flat **29.3** across every one of those rays, and in that frame the sun's image
  is **0** pixels and the brightest thing anywhere in it is **38**.
  `theSeaKeepsItsOwnColourToItsOwnHorizon` measures it, and the figures are in the state
  block above and in 07 §3.2. What remains of the bullet is written under "what the one
  that remains costs".

**Why the rest of it is worth keeping in the queue rather than in a comment.** The frame the
user was standing in is the one this round fixed: a lens under the water is inside a window
with the whole sky of it, sun included. What is still missing from that frame is what the
window should hold -- the lake's own shore, a body, a gull, a cloud -- and what the mirror
past its rim should show, which is the bottom of the same lake. And the body the user asked
for next is a turtle's (**29**): it will be worn, and it will be looked at from inside the
water it swims in.

**What the one that remains costs.** Caustics want the surface's normal, which has existed
since last round, and an answer to where the light lands, which does not: the bed's `aUnder`
is baked into the vertices when the mesh is built, so a pattern that moves with the surface
wants either a term computed at the draw or a re-bake of the column. The bed in the mirror
turned out to cost neither: the depth the mirrored road needs is a number the mesh already
knows, and asking it at the draw is one more multiply.

Status: three of its four are shipped and measured -- item 1 (the bending), item 2 (the face's
own tilt) and item 4 (the bed in the mirror). Item 3 stands, and the shipped ones left
remainders that belong here rather than with themselves:

- **The window holds the analytic sky and nothing else.** A turned ray asks `skyAt()`, so a
  thing standing out there is not in the window: a block of stone laid **3 m** out along the
  sun's azimuth and **3 m** above the lake -- **3.2 m** out and **3.8 m** above a lens **30 cm**
  under the water, so **39.8 deg** off the vertical -- inside it, beside where the sun's image
  stands -- is in **0** pixels of the frame the bend draws and **19,457** of the frame the
  straight path draws. So there is no shore in the window, no body, no gull, no cloud. That
  is not a matter of taste -- a lake's own shore is the brightest thing most of its windows
  would hold. ~~No stars either, and that one is simply unwritten now.~~ **Written the next
  round:** the field lives in `skyAt()` itself, so the sky the window lays down is the sky the
  frame is backed with, cell for cell and clock for clock; the night figures are in the state
  block above and in 07 §3.2, and the range objection this clause recited is closed with it.
  What that bullet recites is now only the ground.
- **Item 4, the bed in the mirror, is now reachable in one expression and still costs the
  same second query.** The reflected direction is computable -- it is written down and used
  for the sky above the water; under the water it is deliberately not used at all, because
  the interface there is shown flat.
- **Item 3, caustics, has its normal at last.** Nothing yet asks what the surface does to
  where light lands; the bed's `aUnder` still asks only how much came down a column.
- **Only a top face is a way out of the liquid.** The vertical faces a shoreline puts in the
  water are bent nowhere, and a lens inside the liquid is still shown a flat interface, so the
  window has no glitter under it. Both of those are the compositing question, not the law's.

## 29. A body the water was built for keeps the depth it is at, breathes on its own row's clock, and rows with its flippers under the shell (asked for by the user; all three closed -- what stands under them is a person's buoyancy)

**Closed, and the picture of it changed twice after it was first closed.** The
water was asked whether it holds up a body whose *animal* is built for that water,
which is what the user's third sentence asked for and what `breatheAir` had been
answering wrong: the worn turtle body and the worn frog body are held up by one
rule, in one column, off one pair of records. What that first fix *then* held them
at was a level written on the row -- the film of the column less the body's height
less the depth the animal's kind hangs at -- and that answer took the depth away:
a body swum down a few metres climbed back up them the moment the key came off.
The sentence stands as it was asked now: a swimming body keeps the depth it was
moved to and goes on forward at it, and what the water keeps is the two ends of the
hold, the film a body cannot climb through (`surfCeiling`) and the ground it cannot
press through (`bedFloor`). Its
breath is a figure on that animal's row (**240 s**) and not the person's **18**, and the body
worn from the fruit is clamped to its own record. The front wings are plates and the body
stands **0.450 m** off the ground it drags on, the model's own height and the form's box being one figure.
The figures that round measured those plates with -- a chord of 0.300 m, a reach of 0.362 m -- are
superseded by the re-cut of the animal, because the animal they were measured on was the wrong shape; the current ones are
at **30** and in 03 s3 and 07.

**What is left open under it, in the order I would take it.**

- **A person's body has no buoyancy at all.** It is the one body in this valley that no animal's
  record describes, so its row states no `locomotion`, no depth to lie at, nothing the water could
  be asked about, and the water leaves it to gravity: let go of in a lake it goes to the bottom and
  stands there, and it has to kick to get out. That a person floats a little in real water is
  true. It is not modelled, and it is recorded here as an open question rather than closed with a
  bare number nobody has measured -- a `hover` for the human row would be a second person, and the
  thing worth knowing first is whether the valley ever asks.
  **The asking half is answered now, and it is a count: of the valley's 2,958 water columns 2,820
  (95.3%) are deeper than that body is tall, and the deepest floor of them is climbable on the two
  clocks the body carries -- 21.35 s of climb, 3.35 s past the end of its own breath, 1.842 of its 5
  life paid, 5.73 s of its reach left over -- while a body that only asks to go forward at the speed
  its own row states keeps its head out in 6.3% of its frames and drowns. All of that is at 2l, and
  the figure itself stays unmodelled for the reason stated above it.**
- **The rig that measures the depth is not the habitat.** The valley's turtles live in the lane
  their row states (`orbit: {at: 'coast'}`, so many metres off this island's shore at every
  bearing); the step that asks what depth a body worn from their fruit keeps puts a wild one in a
  freshwater column of Mirrorlake and pins its herd there, because that is the column every other
  number in that step is measured in. That is a rig, not a claim about where the animal lives --
  and whether the valley should be putting one there at all belongs to the population question
  (**25**), not to the water.

## 30. The box a sea turtle is kept in is the span of its flippers, not the body inside them (found carving the animal to the user's photograph)

A body worn from the turtle's fruit is a **1.5 m** square footprint **0.45 m** tall (`game/data/fruits.js`,
the form's `size`), and `game/test/node-smoke.js` holds the model to that square's inscribed circle plus
**0.1 m** of limb. Measuring the animal for the first time properly showed what those two numbers actually
describe, and neither of them is the animal:

- the shell is **0.850 m** across and **0.963 m** long. Its half-width is **0.425 m**: the animal's body
  stops at half the line the physics body is drawn to.
- what reaches the line is the limbs. The widest corner of the authored model stands **0.834 m** from its
  own middle, **0.016 m** inside the **0.85 m** the gate permits, and the reach is **0.813 m** along the
  axis: **8.4 cm** of the **10 cm** a limb is allowed is spent on flippers.

So `size` states a span, with a body a little over half it inside. That is not wrong and nothing was
retuned this round -- the box is what the water's hold, the collision and the camera's framing all read, and
one number sizing a body is the standing rule (07 s1). It is a claim nobody had looked at, and it has
consequences the valley has not asked about: a worn turtle cannot pass between two rocks that are 1.2 m
apart, though its shell could; the box does not turn with the body, so the footprint against a wall is the
square's worst case rather than the animal's; and a body that is 1.5 m wide to the physics and 0.85 m wide
to the eye will be told about spaces it can see itself not fitting into. Three ways out, none taken:

- **leave it**: the box is the whole animal with its limbs out, which is what a body that rows with them
  sweeps, and it is the safe direction to be wrong in;
- **shrink the box to the body and give the limbs to the draw alone**: the collision would then agree with
  the eye, at the price of letting a turtle's head pass through rock its flippers are in, and of re-reading
  every law that uses `size` -- the water's hold (`floatLevel`), the shore's one-block shelf, the camera's
  framing;
- **let the box turn with the body**: the gate is a radius precisely because the box does not turn, so this
  is the same question as 20's rectangle-vs-body line of work and is not a small change.

What would settle it is a count, not an argument: how many of the gaps a turtle body is asked to pass in
this valley's sea are between 0.85 m and 1.5 m wide. Nothing runs that count today. The related fact -- that
the *drawn* body is outside its own box at the top of a stroke, 0.813 m as carved, 0.833 m held up by the
water, 0.876 m at the top of a stroke, against a half-width of 0.75 m -- is already recorded in 07 s1; what
is new here is that the box is nearer the animal's own size than the animal's own limbs.

## 31. A lens standing in a liquid has nothing to stand on until the ring round it is meshed (found reading the arc out of the user's screenshot; closed -- the census runs, and the one frame inside the window is drawn and read)

The law is closed -- a frame's background is asked about the liquid the lens stands
in, along the ray, and the arc the user sent cannot come back while that is true
(07, the sky bullet; `theSeaKeepsItsOwnColourToItsOwnHorizon` draws the hole and its
opposite, and the numbers are in the state block above). The question underneath it,
which the user's own words pointed at -- why was that frame showing the sea's own
surface nowhere near the lens at all? -- is answered too: the state is real, it is
measured, and it is one frame wide.

- **What the suite holds.** A hole held open by hand: the meshes taken out of the
  **49** chunks round a lens standing 4 m under the open sea. That is the state a body
  *put* at an address is in while the ring is streamed, and it is what a hole in a
  ring is, but it is a hole made to be read, not one the game was seen to make.
- **The census runs now** (`test/play.js`, `aSubmergedLensIsShownNothingAtAnAddressItHas-
  NotReached`): the game's own loop is stepped with no frame asked for -- the ring comes in
  inside `update()` -- and every twentieth frame asks the frame's own 156 directions above the
  eye line where they meet the skin of the water, and whether the game holds a mesh at the
  address they meet it. The desk probe's numbers, which were read out of a rig that holds its
  own chunks and points its own lens, are replaced by the suite's: a body set down at an
  address the run has never been at, 540 m from the map's centre, is in the state the item
  described -- 156 of 156 directions meet the sea's surface at an address with nothing meshed
  there, the nearest 5 m from the lens and the farthest 52, with 2,310 chunks of the outside
  held elsewhere and none of them here. One frame of the loop later it is 35; by the
  twentieth -- a third of a second -- it is 0, and it stays 0 in every one of the 25 answers
  asked across the 480 frames the body is held there. A person asked to swim is carried
  2.2 m in twelve seconds and crosses no chunk address, and none of the 37 answers asked
  across those 720 frames finds a direction unanswered. Wearing a body built for the water
  the same body is carried 108.5 m in twenty-four seconds across 8 chunk addresses, and the
  73 answers asked across its 1,440 frames find none either, the farthest surface any
  direction meets at 76 m while the ring runs ahead of it; 1,056 chunks are held at the end
  of it. The numbers are in 07 §3.2; the step holds the ordering -- cold frame total, one
  frame later partial, twentieth frame none, none ever after -- rather than the counts.
- **What the drawn cold frame is.** `aFrameDrawnBeforeTheRingArrivesIsTheLiquidAndNotASky`
  does what the census deliberately does not: it asks for a frame. A lens level and 4 m under
  open sea, at an address with nothing meshed within 140 m, is shown **81,926** pixels of sky
  out of the **252,000** above its eye line -- which is the honest thing for 4 m of this
  water to pass, and none of them brighter than **86** -- and the sharpest side-by-side
  difference anywhere in that frame is **0.8** of the 255: **0** pairs over 25, **0** over 2.
  No edge, and nothing of a surface, because no surface is drawn. The surface returns on the
  machine's clock -- the streamer spends milliseconds a frame, so the first frame at which a
  surface was shown was the first frame asked (**0.02 s**) on a quiet machine and the fifth
  (**0.08 s**) on two loaded runs; the step records that frame and the check holds only the
  ordering: nothing of a surface at the cold frame, a surface there and that sky gone within
  two seconds of the loop. The arc therefore has nowhere left to come from: a frame with no
  edge anywhere is not where a cut of **176.3** at **291** places comes from.
- **What remains, and why nothing was built for it.** Placing a body at an address nothing is
  meshed at still shows one frame of water's colour and the sky through it instead of a sea.
  Closing that would mean refusing to draw a frame until the ring round a body exists -- a
  gate the game has no other use for, on a frame that holds no edge and so no arc. It is
  left, and it is measured: this is the whole of it.
- **Why this is not fixed by the answer that is nearest to hand.** The frame could be
  told where the liquid ends sideways and pay nothing past that edge. That needs a
  geometry the renderer does not have: the sea has no boundary, and the only edge the
  frame holds is the edge of the meshes, which is the thing that was missing. The
  retired `uEdge`/`env.groundEdge` pair was an attempt at exactly this and it was
  removed rather than repaired: asked along the ray, the choice of where to stop is
  unobservable, and a number nothing reads is a number that drifts.

Human instructions, verbatim, still in force:

1. "I need the animals' movement to be natural and beautiful. This is very
   important! More important than the gameplay."
2. "Go over the project again, more stable, fewer bugs, more extensible,
   easier to maintain (without overdoing it)… and do the testing properly."
3. "I'm away for a while; keep working, and don't stop until you hit
   something you genuinely cannot solve." (Reaffirmed twice, most recently
   together with the order to keep the open issues in git.)
4. "When a piece of work is done and committed, push it to the remotes."
5. "变成了一个动物，各方面都要像那个动物。…你变成了青蛙，还以人的速度移动。
   变成了青蛙，不就应该以青蛙的速度移动吗？" -- wearing an animal means being
   like that animal in every way, its speed included. It is
   the rule any new animal or form arrives under.
6. "水里上下运动目前绑定到了Space和Ctrl，这个非常不要，尤其是Ctrl和w会关掉页
   面！换成j表示下，k表示上。Codex和Help之类的让用户鼠标点！不要浪费我快捷键"
   -- the water's down and up are J and K, the panels are opened by clicking,
   and a hotkey is not to be spent on a thing the mouse already reaches. This is
   a standing rule about the key map, not one request: new keys are earned by a
   body's held asks, and by nothing else (docs/07 §3.4).
7. "我把更多的决定权交到你手上，你来决定怎么设计、怎么实现。核心要点是，这是一个
   长远的项目，必须保持正确、简洁、robust，尽可能地符合物理世界的规律。比如说，青蛙
   不管在陆地还是水中，它都是以跳跃的方式行进的，就是两条后腿是同时运动的，不会有爬
   行，诸如此类。" -- the design decisions are the assistant's to make, and the test
   of one is whether it is still right in five years: correct, simple, robust, and
   as close to the physical world as the game's own laws allow. An animal has one
   way of moving, in every medium and in the body worn from it -- a frog travels by
   hopping, both hind legs together, on land and in water; it does not crawl, and it
   is not carried. That is the rule the *laws* arrive under, and it is why "weird
   but it works" is not an answer.

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
  22 bone, 24 mountain rock, 27 dark leaf, 28 willow; and the fruit blocks,
  numbered `40 + i` over the order `data/fruits.js` lists them, so **40** is
  the frog's and **41** is the sea turtle's -- both non-solid micro boxes that
  stand on the kind of ground their own record names (41 only on the crown of a
  sand bar; 0 of either anywhere else). `FOLIAGE = {7,8,9,27,28}`;
  `TREE_BLOCK = {6,7,8,9,22,27,28}`.
- Physics: `GRAVITY 23`, `MAX_FALL 42`. A body's motion lives in **one record
  per body**, and the two kinds of record have the same field names so one code
  path reads them (`Player.moveDef` in entities.js picks the row, and a second
  copy of any of these numbers in the code that moves a body is a defect: a form
  record carrying a motion field fails the suite):
  - the animal (`game/data/creatures.js`, `frog`, `scale 0.13`): `speed 1.8`,
    `swimSpeed 4.6`, `turn 0.9`, `hop { up: 6.0, max: 7.4, period: 0.9 }`,
    `alert 12`, `herd 8`; `tall = MODEL_H * 0.13 = 0.43`. This row also moves the body the
    player wears when a fruit names that animal -- launch, arc, cadence, cruise
    and turn all come from here, and nothing else. The hop gate asks
    `up^2/2g + tall` of room over the body (0.78 + 0.43 = 1.21 m) before the
    legs load; the arc a body actually reaches is `up^2/2g - up*dt/2` = **0.73 m**
    for that launch, because the frame that pushes off spends the first sliver of
    the fall (`pushOff` in Player.update; the creature step integrates the same
    way). **A step is the other half of the pair of numbers**: `up` is spent
    unasked, `max` only when the ground ahead of the feet is above them, and then
    sized to that step (`hopLaunchNow` -> `launchForArc(rise + 0.10)`, 6.73 for a
    1 m riser); `hopReach` = `arcOf(max) - 0.10` = **1.09 m** is the line between
    a step and a wall, `leapTravel` bounds how far off a face the sizing is asked
    at, and a body whose row states a hop takes every step with those legs, in
    water and out of it: `climbTo`/`climbRate` -- the lift that raises a body onto
    the ground in front of it -- is never set for such a body. Issue 17 removed the
    player's copy of that lift, so nothing in the valley carries one: the lift is
    the law by which a body that *walks* climbs a riser, and while the valley holds
    one hopper nothing exercises it (the valley's content is the reason it stays). The other
    half of the same sentence is `waterHoldsUp`: at a one-block shore the water is
    over a frog's back and its feet are on the bottom, and that bank is answered
    with legs. Wander speed = `cruise * 0.42`, flee/chase `cruise * 1.7`, and the
    body a player drives goes at the cruise because they are holding the key.
  - the body you start in (`game/data/player.js`, `HUMAN_FORM`): `size
    [0.62,1.8]`, `scale 0.18`, `speed 4.7`, `sprint 1.45`, `swimSpeed 2.9`,
    `jump 8.3` (a launch in m/s, not a multiplier; `up^2/2g` = **1.50 m** over its
    own feet), `turn 1.6`, `fov 76`. No `step`: no body record carries a lift (see
    the animal bullet above). Measured against its own row: 4.70 m/s
    over three seconds, thrown at 7.917 off the ground, apex 1.43 m.
  - the form (`game/data/fruits.js`, `frogpear.form`): `size [0.5,0.5]`,
    `breatheAir false`, `dryTimer 90`, `nightVision 0.3`, `stealth 0.5`,
    `fov 100` and the two display names. **No motion at all, and no lift** -- no
    `speed`, `jump`, `swim`, `hop`, `turn`, `step`; a form record carrying any of
    the five motion fields fails `play.js`, and the motion a worn body has is the
    animal row's (`Player.moveDef`), including the launch that climbs a step.
  - measured pair, same actions (`play.js` step `gait`, and `shots.js` strips
    `hop` / `animal`): worn body and wild animal both leave the ground at
    **5.617 m/s** and both reach **0.73 m**; the airborne share is not one of the
    matching numbers (32% of a crossing's frames for the body, 36% for the animal,
    36.4% and 44.7% for the two films -- the share counts the arcs a window
    happens to catch). The worn body crosses ground at **1.80 m/s** and water at
    **4.58**, the wild animal swims at **4.6**.
- Frame order inside `Creature.update` (entities.js, the class begins at 1395; the
  water reads and the `waterHolds` helper at 1678-1694): steering + the horizontal
  step and its gate (its `stand` gate at 1941, its `legs` test at 2068, the
  riser it sizes a climb from at 2078, `stepAhead` at 2124; the body's own
  rectangle is one helper, `bodyCells` at 1327, used by that gate and by the hop
  gate) -> altitude (2305, its own ground read there, the water hold at
  2371) -> the hop gate (2362-2487: the countdown at 2433,
  `bodyCells` and `arcRoofClear` asked at 2477-2480) -> the feet/water branch,
  standing, the step at a
  rate and the fall (2487-2537) -> the solid-exit correction (2539, its lift at
  2566) -> the keep-apart shove (2608). The gate and the shove run in the same
  frame, gate first. `Player.update` keeps the same order for the body you wear:
  the legs (`legsFor`, and the sky over the arc is `skyFor`) -> the water hold ->
  the displacement, which is three axis moves and nothing else (no lift).
- The solid-exit correction lifts a body out of a hard block at
  `Math.max(0.1, 6*dt)` per frame and zeroes `vy` — a body inside a slab with
  air under the slab rides that lift straight up through the masonry.
  That is what law 2c was catching. The lift that raises a body onto its
  floor (the on-foot altitude branch) is capped by the ceiling of the
  body's own column minus its height (`roofY − tall − 0.05`, all wood
  excused — the step gate's table, not the hop gate's: the hop gate counts
  a trunk as the roof over the arc, but the step gate's law is rock over
  the step top, and a cap that counted the log the meadow's dip leaves
  floating read it as the roof and held a frog at four-fifths of its step,
  2c correction) while the feet are not already inside a hard block: that
  is what keeps the door's frog under the glass. A body buried in the rock keeps
  the uncapped lift onto its floor, because a capped lift under the top of its own
  bank would settle it back under the rock the correction is lifting it out of --
  but the example this bullet used to name no longer holds: `aBodyClimbsItsBank`
  puts a *frog* inside a bank under water, and a body whose row states a hop takes
  no lift at all, so that case is carried end to end by the solid-exit correction
  now (the rig's worst height figure moved from 0.153 to **0.325** against its
  **0.4** bound, and the companion swim figure from 0.153 to **0.077**). The cap
  and the uncapped case both want a *walking* body to exercise them, which is one
  more thing waiting on the valley holding one.
- `bodyInSolid` (shove destination test) checks only the feet cell;
  `bodyRoom` never asks about the ceiling. The shove can therefore move a
  body into a low-ceiling column.
- Node probe bootstrap (headless world, no GL):
  `global.window = global;` then require `game/data/{fruits,creatures,world,player,i18n}.js`
  and `game/src/{i18n,engine,world,worldgen,models,entities}.js`; then
  `const N = window.FRUTARIA; const w = new N.World(N.WORLD.w, N.WORLD.h, N.WORLD.d);
  N.generate(w, 20261008);`. `Particles` needs `gl = { createBuffer: () => ({}) }`.
- Height functions (entities.js: the water and arc laws at the top of the file,
  53-263, and the column reads at 1050-1400): `rockAt(w,x,y,z)` is the one
  statement of which cells are ground to a body -- solid and not in `TREE_BLOCK`
  -- and `terrainY`, `bodyInSolid`, the animal's step gate and the solid-exit
  correction all ask it; the other table, `FOLIAGE` (a trunk is a wall, a crown
  is not), is asked only by the span a walker is refused and the roof a hop is
  refused. `groundY` scans down from `from`, returns `y+1` of the highest solid
  (trees included); `terrainY` the same but skipping trees;
  `standY(w,x,z,y) = terrainY(w,x,z, floor(y+STAND_SCAN))` with `STAND_SCAN`
  0.6, and `LIFT_REACH` = 1.6 is the single name for how far a body may be
  raised onto the ground in front of it -- six gates ask it, and it is why
  `STAND_SCAN` is what it is; `roofY(w,x,z,from,top,soft)` scans UP from `from`,
  first solid not in `soft || TREE_BLOCK`; `airCell` = not liquid and (not solid
  or FOLIAGE). The water says three things, one number each: `waterColumn` whether
  a column holds water an animal may live in, `waterHoldsUp(surface, bedTop)` =
  `surface - bedTop >= 2` whether the water or the feet are carrying a body (four
  readers, and the step gate is one of them -- the round record's first bullet, and
  issue 19 for the count that bound rests on), `floatLevel(surface, tall, hover)`
  where an animal of that kind lies -- its own `hover`, what a wild animal's drive
  seeks, and not a level a body the water is carrying is pulled back to -- and
  `surfCeiling(surface, tall)` / `bedFloor(bedTop, tall)`, the two ends of that
  hold: a hold only where the ceiling stands above the floor, which is the same
  inequality as the water standing deeper over the ground than the body is tall, and a body the water carries keeps whatever depth it is at between them. `arcRoofClear(w,x,y,z,tall,fx,fz,spd,
  up,cols)` is the sky over an arc, asked by both bodies, and `cols` is the one
  thing they cannot share -- the cells each of them stands across.
- Chrome harness: `node game/test/play.js` drives `game/index.html` through
  puppeteer-core + `/usr/bin/google-chrome` with
  `--no-sandbox --disable-gpu --enable-unsafe-swiftshader --use-gl=angle
  --use-angle=swiftshader`; `npm ci` was run (node_modules present).
  The `play` step timeout in `all.sh` is 900 s.
- The third-person lens is one rule: `N.CAM` in `game/src/game.js`
  (`share = 0.2192`, `fovBump = 8`, `shotFor(height, fov) -> {fov, d}`). The
  field of view is vertical (`M4.persp(fovy, aspect)`), and the frame's field is
  the worn body's own eye plus `fovBump`: a person 84 degrees -> 5.56 m, the
  frog pear's 0.5 m body 108 -> 1.19 m. Nothing may restate `d = f(height)`:
  eight copies of it drifted, one of them into NaN (`69bac02`).
- The crosshair, the highlight box and the key are **one answer**: `aimed()` in
  `game/src/game.js`, placed before `nearestCreature`, returns the store, the animal
  or the block the hand can do something to, or nothing, in the order the key has
  always had (a store within 3.2 m, an animal within 4.5 m, then `rayTarget()`).
  `update()` sets `this.aim`, `this.hover` and the prompt from it and `interact()`
  delegates to it, so no box is drawn where the key does nothing (issue 22).
  `rayTarget()` still answers where the line stops -- `10k. the lens is the hand`
  checks that against a ray it recomputes itself -- and one `REACH = 5.5` for every
  body is issue 23.
- Counting a body's pixels out of a drawn frame (the frame check in play.js, and
  `tools/cam-frame-probe.js`): the suite's render wrapper draws every frame from
  a cull point far outside the world unless a `gl.readPixels` forces the real
  one, so a `R.drawMesh` patch has to stay installed **across the read**, not
  only across `g.render()`, and the counters are zeroed immediately before each
  read. A rig that patches the draws and then reads gets a frame of nothing and
  reports 0 pixels without saying so.
- The gait films: `node game/test/shots.js strip [hop|stroke|turn|wild|animal|climb|climbwild]`
  -- the page's clock stopped, the world stepped by hand at 1/60 with the same
  keys held, two lenses per action (the one a player owns, and a tripod stood at the
  middle of the path that pans but does not move), and every frame reporting
  where the body landed in the frame and whether it is in it. Not in all.sh, and
  the PNGs are in the .gitignore'd `.shots/`. The standing set of stills is
  `node game/test/shots.js [tag]`. `animal` is the one to reach for when a claim
  is about an animal's gait rather than a worn body's: it stands one of the
  valley's own frogs in the same cleared corridor the `hop` strip stands the worn
  body in, at the same window length (12 frames x 11/60 s = 2.2 s), which is what
  closed the "no measured arc for a wild frog" gap a second record used to leave. A strip's `=`
  line reports `travelled / arc / push / airPct / per / offFrame`; `push` is the
  rate the body left the ground with, and `push: 0` is the tell that the animal
  spent the window walking and the film proves nothing about its arc. `subject` on
  a strip config says whose body the lens and the stepping follow -- never infer
  it from `where`, because an animal stood in the same corridor as the body you
  wear is still an animal. `climb` and `climbwild` stand either body of the frog at
  a bank one block tall built across that same corridor -- the only place rig that
  edits the world, and every other place rig puts those cells back first
  (`window.__built`), so a film of the valley stays a film of the ground the game
  made. A body stood at the foot of a step is given a starting `hopT` too: left in
  whatever the walk that brought it there left behind, the first launch of the
  window is the ordinary one and the climb falls outside the frame.
- The stride law is calibrated at the body's own record: `walkMove(spd, row.speed)`
  -- `move` is the share of the speed the record names, so 1 is a person at their
  4.7 m/s and a frog at its 1.8 m/s, and a `sprint` above that cruise buys step
  *rate* only (3.45 steps a second of the same 1.97 m stride at 6.8 m/s). At the
  person's cruise the model's legs are worth **1.97 m** at **2.38** a second, the
  heave on the hips is **0.072 m** across a stride at a stance of 0.30; a walk at
  1 m/s is 0.43 m at 2.3, the heave 0.015 m at a stance of 0.55. A frog's legs
  take no part of a stride (`gaitStride('frog', ...) = 0`) -- it hops, and its
  pose comes from `air`/`crouch`/`squash`. The old constant `WALK_TOP = 5` is
  gone; anything that quotes a `move` ratio is quoting a share of a record.
- `all.sh` writes one log per suite to `/tmp/frutaria-<name>.log`; the play
  suite's is `/tmp/frutaria-play.log`, and `grep -c "CHECK FAILED"` there
  printing `0` (grep exits 1) is the green the contract asks for. `play.js`
  prints its whole log only when the run ends, so reading that log mid-run shows
  nothing at all. One step prints a whole JSON record on one line: read that log
  with `grep` and a `cut`, never by dumping lines of it.
- Untracked local files: `TODO.md` (gitignored notes; keep it in sync with
  this file's state), `tools/*probe*.js` (desk instruments for one question --
  kept out of the tree on purpose, `.gitignore` names the two patterns; what a
  probe measured goes into docs/ as a number and into game/test/ as a check,
  which is what `06c299f` did for the twenty-four that had piled up),
  `/tmp/m26flake/*` (loops, logs, parser),
  `/tmp/m26*.js` (headless probes: dust guard replica, cavity map, tower map,
  frog repros, yaw sweep, targeted shove, spawn census).
