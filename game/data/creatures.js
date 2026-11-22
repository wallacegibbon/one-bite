/* ==========================================================================
 *  Creature data -- mirrors docs/03-characters-and-creatures.md
 *  The valley holds one animal now, and it bears a fruit, so it is a body the
 *  player can wear. The open water it used to share with the lamps is open:
 *  the lamps are cut, and the water machinery they ran (locomotion 'water',
 *  hoverLevel, the water-column placement) stays measured and tested for the
 *  next animal the valley puts in that water.
 *  attitude  : reaction to the player's current form; self=same species, default=fallback
 *  locomotion: water / amphibian -- how the body moves. The code asks
 *              this instead of asking about a species, so the movement code stays
 *              the same when a species joins.
 *  turn      : the most radians a second this animal can add to its heading at
 *              its own cruising speed. Nothing with a body turns on the spot --
 *              the course bends, and this is the animal's agility.
 *  speed / swimSpeed / hop / turn: this row is the animal's way of moving, and
 *              it is the ONLY place any of them is written. The body the player
 *              wears from this animal's fruit reads this row for them
 *              (`Player.moveDef` in src/entities.js); the fruit's form record
 *              carries the shape and the senses and never a speed. A fruit names
 *              which animal you wear; the animal says how it moves. That is what
 *              makes wearing a frog moving like a frog, and it is why the valley
 *              needs no second set of numbers for the same creature -- play.js
 *              measures the body and the animal doing the same action and fails
 *              when the arcs differ.
 *  active    : active period; day / night / both / dusk
 *  dex/dexEn: the codex entry, always "a verifiable fact + an unverifiable rumour"
 * ========================================================================== */
(function (N) {

  const CREATURES = [
    {
      /* niche: the shallows -- jumping, and breathing through the skin */
      id: 'frog', cn: '雨蛙', en: 'Mirrorlake Frog', model: 'frog', scale: 0.13,
      habitat: ['mirrorlake', 'glowglade', 'starfall'], active: 'both',
      /* `hop` is two launches of one pair of legs, and the second is only ever
         asked for when the ground in front is higher than the ground under the
         feet. `up` 6.0 is the launch the legs give with nothing in front of them
         and no ground asked for: 0.73 m over its feet as either body of the
         animal (`arcApex` in src/entities.js -- the flight this body's frames
         perform, not the parabola's). `max` 7.4 is the same legs fully extended:
         1.13 m over its feet, and that is the whole of what these legs reach. It
         is stated above the valley's one-metre terraces and one-block shores on
         purpose: what a step costs these legs is the top of the face plus the
         10 cm of standing room above it (`STEP_CLEAR` in src/entities.js), so a
         one-metre block is a step the animal climbs and a bank of 1.2 m is a
         wall it goes round. The arc that climbs a step is the same flat arc and
         no steeper: a body standing at the foot of a face it could land on top of
         is stopped by it, not defeated by it, because the face takes back the
         ground the arc was going to cover and not the push that owed it -- the
         brace above `hopLaunchNow`, spent through `arcLeft` in both bodies.
         Neither number is a second kind
         of jump: the arc is gravity's either way (`hopLaunchNow`), the launch an
         animal takes with ground to cover is sized from its own ask and not from
         these, and the body worn from this animal's fruit is thrown by these two
         numbers and no others. test/play.js measures the arc of each body at each
         ask, and the step at a bank built one and two blocks high. */
      locomotion: 'amphibian', speed: 1.8, swimSpeed: 4.6, turn: 0.9, hop: { up: 6.0, max: 7.4, period: 0.9 }, alert: 12, herd: 8,
      /* the ring the water keeps a frog of this species in: while the body is in
         the water its errands run round the landmark its habitat's zone names
         (`at`), at a lane of its own between `r0` and `r1` metres out, each
         errand the next arc of the ring the body has not yet covered, all the
         way round the same way. On the bank a frog wanders round its home as
         before. The pace each body spends the ring at is its own (see `pace` in
         the Creature constructor): the species sets the speed, the body sets
         the tempo. */
      orbit: { at: 'lake', r0: 25, r1: 30 },
      /* how far under the level the water floats it a resting body of this kind
         hangs: a frog built for the lake does not lie under the surface film. The
         body worn from this animal's fruit is held at the same depth. */
      hover: 1.6,
      fruit: 'frogpear',
      attitude: { self: 'calm', default: 'ignore' },
      dex: '雨后整片湖岸一起叫，声音能压过钟塔。它们不喝水——它们靠皮肤喝。',
      dexEn: 'After rain the whole shore calls at once, loud enough to drown out the bell tower. They do not drink — they drink through their skin.'
    },
    {
      /* niche: the open water off the island's shore, and the sand it comes out
         onto. The valley's second animal, and the first one the sea holds.
         `habitat` names a kind of ground and not a place: `sandbar` is a key of
         ISLE_TYPES in src/worldgen.js. It is the same word the fruit's record
         uses, and that is the point of writing it here -- the ground this
         animal climbs onto and the ground its fruit grows in are one ground, and
         a test can ask the world whether that is still true. What it swims is
         said by `orbit` below, because a lane of water is a place and a kind of
         ground is not. */
      id: 'turtle', cn: '海龟', en: 'Sea Turtle', model: 'turtle', scale: 0.25,
      habitat: ['sandbar'], active: 'both',
      /* No `hop`, and what that leaves the body with is different for the two
         bodies this record makes. A form with no `hop` has no launch, so its
         `hopReach` in src/entities.js answers 0 and its body has no way up a
         riser at all: worn as this animal's fruit, driven at a two-metre bank,
         it stops with its nose on the face and is never once lifted in front of
         it, and it never gets up the bar out in the sea either -- what a body is
         made of decides that. An animal of this record has no legs to launch with
         either, but a legless animal's way up a step is the lift, and the lift
         is asked which ground it is being asked on (`dryGroundNamed`, same file):
         ground this record's `habitat` names is answered, ground it does not name
         is not. Measured: sent at a bank built inland it never leaves the ground
         and never rises in front of the face (0 m risen, 0 frames of climb, no
         arc); sent at the eight bearings of this island's own shore it never once
         comes ashore; sent from open water at the bar its own fruit grows on it
         walks up 2.5 m onto the crown over 473 frames of lift, with a block of
         the world under its feet for 1,033 of them and never an arc. That is the
         animal: it goes along, and the only ground it gets up onto is sand.
         Its land speed is under the frog's on purpose -- flippers over sand are
         dragging, not running -- and its speed through water is over the frog's,
         because the wings are built for it and the frog's legs are not.
         `turn` is the widest rate of heading this body can add: at its own
         cruising rate through water that is an arc of ~10 m across, seven body
         lengths, and it is the animal: a turtle turns the way a barn door
         swings. It is asked at the rate the body is actually going, so at a
         crawl the same 0.6 rad/s is a much tighter circle. */
      locomotion: 'amphibian', speed: 1.45, swimSpeed: 6.4, turn: 0.6, alert: 16, herd: 3,
      /* How long a body of this animal holds its breath, in seconds, head under
         water and not frightened. It is the animal's own, like its speed and like
         the depth it hangs at, because a body worn from this fruit is the same
         animal: it is asked of the record `src/entities.js` already takes the
         cruise and the hover from, and there is no second copy of it anywhere.
         A sea turtle is a lung that went back to the sea: it comes up for one
         breath and then feeds under the surface for minutes at a time, and the
         resting holds recorded for the large ones run to tens of minutes, which
         is a thing nothing in this valley asks of it. What it does every day,
         swimming and feeding, is minutes -- so this is minutes, and it is the
         animal and not a licence: put the body this fruit gives and a person's
         body in the same open water, hold the dive key, and the person's air is
         gone at **18.9 s** -- the **18 s** on that body's own record, plus the
         moment it takes a body the water is not holding up to get its head under
         -- while this body is still under that same surface, its own air gone at
         **240 s** (`test/play.js`,
         `theSeaTurtleBodyDragsOnSandAndSwimsThroughWater`).
         A row that states no `breath` is a body that holds its breath as long as
         a person's body does -- that is the number `data/player.js` carries, and
         the only other body in the valley that needs a number at all, the frog's,
         breathes the water and has no reserve to hold.
         The figure is the arithmetic at both ends of the clock, and that is the
         reason it is stated as a number of seconds and not as a bar of some size:
         one second of it goes to the second with the head under a water this body
         cannot breathe, and one second of it comes back to the second of breathing
         with the head in air. Measured end to end in the same water (`test/play.js`,
         `theSeaTurtleBodyDragsOnSandAndSwimsThroughWater`): this body empties its
         **240** in **240 s** of held dive key -- **1.000** unit to the open second
         -- is then let go of with nothing else touched, comes up on its own, gets
         its head out **5.28 s** later, and its store reads full **245.27 s** after
         the window began: the figure on this row, plus the time it takes a body to
         rise from the bottom of that sea to the film it lies at. What that costs a
         day is the reason the two ends being equal is not a detail: five seconds at
         the surface buy five seconds down, and no more. */
      breath: 240,
      /* The lane it swims: so many metres off the island's own shore, all the
         way round it, at every bearing. `at: 'coast'` is resolved by
         src/worldgen.js's `shoreWater(bearing)` -- the same rule the map's
         `coastShape` is drawn from -- so the lane follows the coast where it
         actually runs instead of standing where a circle would put it. On the
         bearings where the shore is 126 m out the lane begins 12 m past it; on
         the ones where it runs to 175 m it begins past that. It is water the
         whole way, and its depth is whatever the shore's own slope has at that
         distance, which the sea floor rule bounds at ~6 m: the animal spends
         some of its ring deep enough that the water holds it up and some of it
         walking the bottom, and no second rule gets a say in where that line
         falls. */
      orbit: { at: 'coast', r0: 12, r1: 40 },
      /* How far under the level the water floats a body this animal lies, asked
         of the crown of it. The number is negative, and the sign is the whole
         of the sentence: a sea turtle does not hang under the surface film the
         way a frog does, it rides it. The crown of its shell breaks the water
         and its head stands out over the film, because it is a lung and has to
         come up -- and it does not go looking for the bottom, which is the other
         half of why this row, and not the water, decides where the animal lies.
         The frog's row states 1.6 m down because it breathes the water and has
         no reason to see the sky; this one states the top of the water because
         it has nothing else to breathe. It is the same number the body worn from
         its fruit floats at, and it is the reason that body can stop moving in
         the open sea and still be breathing: a body of this animal that stops
         moving comes to rest with its crown **0.20 m above the film** and its
         eyes **0.12 m** above it, out of the water and breathing, its belly a
         hand's width under. It cannot be *any* negative number, though: the
         level a body stops at has to stay below the highest point the water's own
         hold lets a body that keeps asking climb (`surfCeiling`, the surface less
         half the body), or the two ends of one law would be the other way round
         -- for this body that bound is -0.225 m, and this is -0.2.
         `test/play.js` asks both rows whether they lie inside it. */
      hover: -0.2,
      fruit: 'turtlemelon',
      attitude: { self: 'calm', default: 'ignore' },
      dex: '它一年会上岸一次，回到它出生的那片沙上去。它在水里从不落在沙上——它落在沙上是在找那个地方。',
      dexEn: 'It comes ashore once a year, onto the sand it was hatched on. It never settles on sand in the water — when it does, it is looking for that place.'
    }
  ];

  N.CREATURES = CREATURES;
  N.CREATURE_BY_ID = CREATURES.reduce((m, c) => (m[c.id] = c, m), {});

})(window.FRUTARIA = window.FRUTARIA || {});
