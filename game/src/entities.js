/* ==========================================================================
 *  entities.js -- player (voxel AABB physics + transformed forms) / creature AI / particles
 * ========================================================================== */
(function (N) {
  const M4 = N.M4;

  /* The body you start in is a data record (data/player.js), not a constant
     here: `size` on it is a rule the world enforces, and reach.js guards the
     fields of every body record. The alias keeps the code below readable. */
  const HUMAN = N.HUMAN_FORM;

  /* The speed a body that does nothing about it falls at. */
  const MAX_FALL = 42;
  const GRAVITY = 23;
  /* The pull a body works against when it leans into a turn. The game's own
     gravity is 23 m/s^2 because an arcade fall has to feel like one; the tilt a
     body shows is not about whether it holds the arc (the code holds the arc),
     it is about how much of the turn the body shows, and at these speeds a real
     body shows atan(sideways / 9.8). */
  const LEAN_G = 9.8;
  /* A heading read twice a frame off a body crawling through water and bumping
     its banks jitters by a degree or two, and a lean built on that jitter would
     have the body weaving its shoulders while it swam dead straight. Below this
     many rad/s of heading there is no turn at all. */
  const BEND_DEAD = 0.12;   // rad/s

  /* How far under the surface a body that cannot trim itself lies, measured to
     the **crown** of that body and not to its feet: the waterline of a cork. It
     is the default an animal's own record falls back on (`hoverOf` below) when
     the row states no depth of its kind, and it is what the wild animals of the
     valley are held at when they have no number to ask with.
     The reference point is the whole of the matter. This used to be measured to
     the feet, and a body half a metre tall therefore hung with its head 20 cm out
     of the water: seen from the bank it was a cork with four legs under it, and
     the eyes of the body you wear -- 0.42 m up from its own feet -- sat 12 cm
     *above* the surface, so the animal built for the lake looked at the shore and
     never once into it. Measured to the crown, the same 30 cm is what the comment
     always said it was -- how far a floating back sits under the surface -- and
     the body hangs the way a body that breathes water hangs: all of it in, eyes
     38 cm down, back 30 cm down, feet 80 cm down. The depth is the body's own
     height plus that 30 cm, so a bigger water animal hangs deeper by exactly its
     own size and nobody has to remember a new number. */
  const FLOAT_UNDER = 0.3;
  /* The level at which the surface of a column would float a body: the surface of
     the column, less the height of that body, less the 30 cm its crown hangs
     under the surface. A height, not a cell -- see `liquidSurfaceAt` in world.js.
     This is what the water does for a body that cannot trim itself: it holds such
     a body up at one level and no other, which is the whole of how a cork behaves
     and none of how a fish does. An animal built for water trims its own gas to
     the depth it has taken, so the depth it lies at is its own; `hover` on the
     animal's record is that choice, and this function turns the choice into a
     height in the column the animal is standing in. That is all it answers now.
     The body you wear is not pulled back to this level: a body the water is
     holding up keeps the depth it was moved to, and that is the sentence the
     water branch of `Player.update` states. What is left here is the animal's own
     level -- the level a wild frog hangs at, the top of the band its dive cycle
     runs between, and the shallow end of what the herd shows of itself.
     The depth term is allowed to be negative, and a row that makes it negative is
     an animal that does not hang under the film but rides it: the sea turtle's row
     does, because it is a lung and lies at the top of the water with its head
     out. The one bound on the number is `surfCeiling` a few lines below -- the
     level an animal lies at has to stay under the highest point a body the water
     is holding can climb, or the two ends of this law change places and the animal
     is asked to sit above the reach of its own stroke. Both animal rows are asked
     whether they keep that bound in test/play.js. */
  function floatLevel(wSurf, tall, hover) { return wSurf - tall - (hover === undefined ? FLOAT_UNDER : hover); }
  /* The depth an animal's own row states, or the 30 cm a body hangs under the
     surface when its row states none. Asked as a function because a row that
     forgets the number must not hand a NaN to a body's height: the height goes
     straight into the model, and a NaN angle is not an error message, it is a
     leg that quietly stops being drawn. */
  function hoverOf(sp) { return sp.hover === undefined ? FLOAT_UNDER : sp.hover; }
  /* The top a body the water is holding up can climb to: the surface of its own
     column, less half the height of that body. The water holds a body up from
     under it, and a body that has worked its way up until only half of it is in
     the water is not being held up by water any more -- it is standing on the
     lake, on a surface that is not there. Measured off the body worn from the
     frog, with the up key held for 5 s over a column 7 m deep, the old
     ceiling -- the surface less a hair -- let the feet come to **14.98** against
     a surface of **15**, which for a body **0.5 m** tall is **96%** of it over
     the water: a frog standing on the middle of a lake. Against this ceiling the
     same body stops with its feet **25 cm** in, half of it over the film and its
     eyes **17 cm** over it, which is still the head out of the water the animal
     needs, and it stays there when the key comes off. Half the body is the
     collision box's half, asked in the same units as `bedFloor` below, so the two
     ends of the water's hold are one pair and a bigger water animal is carried up
     just as far over the film as it is kept off the floor under it.
     Whether a body is in the water at all is decided by its feet being under the
     surface (`inWater`, far above), and this leaves them half a body under it, so
     that answer cannot change its mind on the frame the body stops climbing. */
  function surfCeiling(wSurf, tall) { return wSurf - tall * 0.5; }
  /* The bottom a body the water is holding up dives to: the top of the ground
     under it, plus half the height of that body. The water holds a body up from
     under it, the ground holds one up from under that, and a body against the
     ground has feet -- the collision reports them, the draw reads them, and the
     stroke stops with them -- so a dive that runs into the bottom stops being a
     dive and becomes a body sliding along the mud with still legs. Half the body,
     asked in just the units `surfCeiling` is asked in, so the two ends of the
     water's hold are one pair: a bigger water animal is kept as far off the floor
     as it is carried over the film. And the hold is a hold only where those two
     ends are in the right order -- the ceiling above the floor -- which is the
     same thing as the water standing deeper over that ground than the body is
     tall. A pool shallower than the body has no hold to keep: there the ground is
     a ground to stand on, feet and all. The body you wear is asked that question
     of its own two ends; the herd's bodies ask the older form of it, their own
     level against the ground, because an animal does have a level of its own
     (`hover`, and the water branch of `Creature.update`). Both ask it of the same
     ground, so neither is held up in water the other stands in. */
  function bedFloor(bedTop, tall) { return bedTop + tall * 0.5; }
  /* Whether the water of a column is holding a body up, rather than being a
     bottom it stands on: the film of it has to stand at least **two whole
     blocks** over the surface that body's feet would find there. One block is a
     shore shelf -- 138 columns of Mirrorlake are that shelf -- and a body
     standing in one has feet: it wades, it walks, it pushes off with its legs.
     Two is water a body can hang in: deeper than a body has to be to be wholly
     inside it and clear of the bottom. The count is asked of the place and never
     of where the body happens to sit in it, because a rule that turns on the
     body's own depth switches the force law back and forth as the body crosses
     its own equilibrium and builds a sawtooth out of nothing -- that was the
     bug the water branch of this file was last fixing.
     Four readers ask it and they are one law: whether a water animal may be
     born and live in a column (`waterColumn`), whether the body you wear is
     held up or stands (`heldUp` in `Player.update`), whether the animal's own
     body is (`held`, and the water branch of its altitude), and whether a body
     is on its feet when it meets a bank (`legs` in the step gate). The last of
     those is what says an animal climbs out of the lake the way it moves
     everywhere else: a body whose row states a hop is never lifted up a bank on
     straight legs, in water or out of it. Both heights are heights and not cell
     indices -- see `liquidSurfaceAt` and `groundY` in world.js, and the cell
     convention restated where each reader stands. */
  function waterHoldsUp(surface, bedTop) { return surface - bedTop >= 2; }

  /* How hard this body pushes off the ground with its feet, in m/s of launch.
     A body that jumps states that as `jump`; a body that hops states it as
     `hop.up`, because for it the two are the same event -- the animal pushing
     off with the same legs, whether it was asked to or decided to. There is no
     third case: a body with neither has no legs that push (a lamp), and the
     caller does not ask it. */
  function launchOf(L) { return L.jump !== undefined ? L.jump : (L.hop ? L.hop.up : 0); }

  /* The top a launch reaches, in metres over the feet, and the same law read
     backwards. This is the height the frame-stepped flight of the body actually
     reaches -- the same integration the bodies below run, gravity taken off in
     the frame before the one the height is written in, so the top is `up x dt/2`
     under what the parabola states (6 cm at this animal's fullest launch). Every
     ask that is asked of a height is asked of THIS number, the same as every ask
     that is asked of ground is asked of `arcGround` below: a step sized from the
     parabola is a step the body is a hand's width too low to get onto, and a
     roof sized from the parabola is a roof it does not need to duck. */
  function arcApex(up, dt) {
    const k = Math.max(0, Math.floor(up / (GRAVITY * dt)));   // frames of rising
    return k * up * dt - GRAVITY * dt * dt * k * (k + 1) / 2;
  }
  function launchForApex(apex, dt) {
    if (!(apex > 0)) return 0;
    let lo = Math.sqrt(2 * GRAVITY * apex) * 0.5, hi = Math.sqrt(2 * GRAVITY * apex) * 3;
    for (let i = 0; i < 24 && hi - lo > 1e-4; i++) {
      const m = (lo + hi) / 2;
      if (arcApex(m, dt) < apex) lo = m; else hi = m;
    }
    return Math.abs(arcApex(lo, dt) - apex) <= Math.abs(arcApex(hi, dt) - apex) ? lo : hi;
  }

  /* A step is climbed with the legs a body has, and a body that hops has one
     kind of leg: it either leaves the ground or it does not. For a body that
     walks there is a middle answer -- the feet lift the body onto a low surface
     without a jump, and that is what the animal's step gate does for a body
     whose row states no arc. A hopper has no such thing, so the step in front
     of it is a question about its launch instead: how hard do the legs push to
     land on that surface?
     `hop.up` is the everyday launch, the one an animal gives a hop it has no
     reason to size; `hop.max`, where a row states one, is the fullest extension
     of the same legs, asked only when the ground the body wants to stand on is
     above the ground it is standing on. Neither number is a second kind of jump:
     the arc is the same arc, and the row of one animal says both, because the
     body worn from that animal's fruit climbs with the same legs.
     STEP_CLEAR is the room a body needs above a step top to be STANDING on it
     rather than arriving exactly level with its face, and it is asked of the
     height the flight delivers (`arcApex`), not of the parabola's. A riser above
     the fullest extension less that is not a step at all: it is a wall, and both
     bodies of an animal that hops are stopped by it in the same way. */
  const STEP_CLEAR = 0.10;
  function hopReach(hop, dt) { return hop && hop.max ? arcApex(hop.max, dt) - STEP_CLEAR : 0; }
  /* 0 for "the everyday launch, or no launch at all -- this is not a step the
     legs can take": the caller already has `hop.up` and asks for the difference. */
  function hopLaunch(hop, rise, dt) {
    if (!hop) return 0;
    if (rise <= arcApex(hop.up, dt) - STEP_CLEAR) return hop.up;
    return rise <= hopReach(hop, dt) ? launchForApex(rise + STEP_CLEAR, dt) : 0;
  }
  /* Whether a rise above the water line is ground this body's record will stand
     on. A `habitat` that names kinds of the sea's ground -- keys of ISLE_TYPES in
     src/worldgen.js, the same words the fruit records of that animal use -- says
     two things at once: the ground this animal climbs up on, and, because it
     names it, the ground it does not. The sea such an animal swims is not a place
     it may leave onto anything: ground above the water line belongs to it only
     where the pile the world raised there is of a kind the record names, and
     anywhere else the beach is a wall and the contour below takes the body round
     it the way it takes any other wall round. Descent and level walking are not
     asked, so nothing this law stops is ever trapped by it: it stops going up.
     A record that names no kind of sea ground -- every animal of the valley's
     land, whose `habitat` names places -- is not asked at all, and walks the
     valley exactly as it always did. */
  function dryGroundNamed(sp, x, z) {
    const kinds = [];
    for (const h of sp.habitat || []) if (N.ISLE_TYPES[h]) kinds.push(h);
    if (!kinds.length) return true;
    const pile = N.islandUnder(x, z);
    return !!pile && kinds.indexOf(pile.isle.type) >= 0;
  }
  /* ---------------- the arc: one reading, both bodies ----------------
     A body whose record says its legs are an arc covers ground in arcs and
     nowhere else. There are three ways a body of that shape moves, a frame is
     in exactly one of them, and which one it is is a fact about the frame and
     not a blend of two:
       - Its feet are on the ground and its legs are not extended: it stands,
         and it covers nothing. This is the half that was missing, and it is the
         half the game shows a player: a body whose position is advanced by
         something other than its own legs while those legs are folded is a body
         sliding along on frozen legs. `models.js` gives this animal's parts no
         stride at all (`anim:'walk', stride:0`), because there is no walk cycle
         for it to have -- the legs it has are the arc -- so the only honest way
         for it to cover ground is the one that costs those legs a movement.
       - The legs have thrown it. In the air there is nothing to push against,
         so the rate it left the ground with is the rate it keeps until it
         arrives, in both directions. The row states the launch as the rate
         *up* -- that is the number every height here is asked with (`arcOf`,
         `hopReach`, the roof below) -- and a body that is going somewhere
         leaves the ground at that same rate along the ground: 45 degrees, the
         flattest take-off that still reaches the height the row states. So the
         ground the arc reaches is `arcGround` -- the legs' own, and nothing to
         do with how fast the body was already going -- measured in the frames
         this body has, which is what the launch is sized with: see the flight
         below. The answer used to be `speed x air time`, which made the arc
         the air's and not the legs': a body standing still could not reach the
         step in front of it at all, and a body already moving could not stop.
       - The water is holding it up. The water carries the body at the rate its
         row swims at and no leg is involved. Which frames those are is asked of
         the column and not of the body's height -- `waterHoldsUp`, read as
         `carried` by both bodies below -- and the same answer that excuses the
         legs from the step gate excuses them from the ground: a body the water
         is not holding up is a body standing on its feet, at the shore or at
         the bottom of a one-block shelf, and it goes the way its feet go.
     What the legs are asked FOR is what the body is asking for. `period` is a
     cadence: the seconds from one push-off to the next, the air inside it,
     because up there is nothing to push against. An animal crossing ground at
     `want` metres a second and pushing off every `period` wants `want x period`
     metres from the arc, and `launchForGround` is the launch whose flight covers
     exactly that: small hops when it is pottering, big ones when it is running,
     and over a whole number of cycles it covers the rate its row states -- which
     is what lets a `speed` in a creature row be a promise the animal keeps
     rather than a rate its body is slid along at while its legs are folded.
     Between two arcs the feet are down for the rest of the cycle and nothing
     else: no part of it is subtracted twice, and no part of it is added.
     `hop.up` caps it -- the fullest launch the legs give with nothing in front
     of them. A step in front asks the launch for a height instead (`hopLaunch`,
     `hop.max`) and a roof overhead asks it for less (`roofLaunch`). A body with
     nothing it is asking for has no arc, and a body the legs cannot throw
     anywhere stands up out of the way instead of shivering along. */
  const MIN_HOP_GROUND = 0.12;   // metres: below this the legs are only holding the body up
  const ARC_PROBE = 0.15;        // metres: how the ground in front is walked back
  /* The flight a body of these legs performs. The parabola the launch states is
     `2 up / g` of air and `2 up^2 / g` of ground; a body whose height is stepped
     at `dt`, and which is taken back by the ground the frame the parabola would
     touch it, spends two of those frames on the ground instead -- the frame it
     pushes off on, where the legs give the height and the ground rate is not
     taken up until the movement at the top of the next frame, and the frame it
     lands on. So its flight is `ceil(2 up / g dt) - 2` frames and not the
     parabola's `2 up / g dt`: two to three frames of the arc's own rate, which
     at 60 frames a second is 0.13 m off the 3.13 m the everyday launch of these
     legs would have covered and 0.20 m off the 4.76 m the fullest extension
     would have. The share is the same at either end, so nothing about the animal
     changes with the frame rate; what changes is whether the row's rate is the
     one the body keeps. `flightFrames` counts that flight in the frames this
     body has and `arcGround` is the ground it covers; the launch is SIZED with
     these numbers and the ground is SPENT with these numbers, which is what makes
     the ground a body covers over a cycle of its own cadence the rate its row
     states at any frame rate rather than the rate the parabola would have given
     it at some other one. The parabola is their limit as the frame goes to
     nothing. */
  function flightFrames(up, dt) { return Math.max(0, Math.ceil(2 * up / (GRAVITY * dt)) - 2); }
  function arcGround(up, dt) { return flightFrames(up, dt) * up * dt; }
  /* The rate the legs throw a body along the ground with: their own rate when
     the body is going somewhere, and nothing when it is not. A push key with no
     direction in it is a body asking for height, and it gets the arc straight
     up. */
  function arcCarry(up, want) { return want > 0 ? up : 0; }
  /* The ground an arc covers at the rate its legs threw it along the ground with,
     over the flight that launch performs. This is the ground the push-off OWES,
     and it is paid only by ground the body actually covered: see `arcLeft` in
     both bodies below, and the brace paragraph above `hopLaunchNow`. */
  function arcSpan(up, carry, dt) { return carry * flightFrames(up, dt) * dt; }
  /* The launch whose arc covers a given stretch of ground: the inverse of
     `arcGround`. Below `MIN_HOP_GROUND` of ground the legs are only holding the
     body up, and there is no arc to count.
     The frame count is a step, so there is no closed form; `arcGround` is
     monotone in `up` all the same, so the launch is bisected for it. A jump of
     one frame at either side of the step is the closest any launch gets, and
     either side is asked for the same ground, so the answer is whichever side of
     the jump lands nearer the ground that was asked for. */
  function launchForGround(ground, dt) {
    if (!(ground >= MIN_HOP_GROUND)) return 0;
    /* at most a frame's flight of extra frames, and at least the parabola's own
       answer, are what a launch covering `ground` can be */
    let lo = Math.sqrt(GRAVITY * ground / 2) * 0.5, hi = Math.sqrt(GRAVITY * ground / 2) * 3;
    for (let i = 0; i < 24 && hi - lo > 1e-4; i++) {
      const m = (lo + hi) / 2;
      if (arcGround(m, dt) < ground) lo = m; else hi = m;
    }
    return Math.abs(arcGround(lo, dt) - ground) <= Math.abs(arcGround(hi, dt) - ground) ? lo : hi;
  }
  /* The launch the legs give for the body's own ask: `want` metres a second over
     the seconds between push-offs is the ground an arc has to cover for the
     animal's rate to be the rate its row states, and `launchForGround` is the
     launch that covers it. `hop.up` caps it -- the fullest the legs give with
     nothing in front of them -- and `cap`, when the caller has one, caps it
     further: the ground that is actually there to land on. */
  function cruiseLaunch(hop, want, period, dt, cap) {
    if (!hop || !(want > 0) || !(period > 0)) return 0;
    return launchForGround(Math.min(want * period, cap === undefined ? Infinity : cap,
      arcGround(hop.up, dt)), dt);
  }
  /* The launch that fits under a roof: the highest arc whose top stays clear of
     the lowest underside over the columns the arc is spent over. A frog in a low
     passage does not stop and does not fold itself into the beam: it takes a
     low hop. Below `MIN_HOP_GROUND` of ground there is no hop that fits and the
     body stands up out of the way until the roof goes. */
  function roofLaunch(hop, roomUp, dt) {
    if (!hop || !(roomUp > 0)) return 0;
    const up = launchForApex(Math.max(0, roomUp - 0.05), dt);
    return arcGround(up, dt) < MIN_HOP_GROUND ? 0 : up;
  }
  /* The step in front of a body: the first face of ground above its own feet
     along the way it is heading, and how far off that face is. Read from the
     feet it has, so a body in the middle of an arc reads the same ground as the
     one it pushed off. The crown of a column is `terrainY`'s question -- rock,
     wood and leaves excused -- read from the highest row the body's own legs
     could land on: a column whose rock runs above that is a wall, and the
     answer it gives is above the feet either way, which the filter below reads
     as a riser too tall for the legs and the caller answers as a wall. */
  function riseAhead(w, x, z, y, ux, uz, reach, up) {
    for (let d = 0.1; d <= reach + 1e-6; d += 0.1) {
      const t = terrainY(w, Math.floor(x + ux * d), Math.floor(z + uz * d),
        Math.floor(y + up));
      if (t > y + 0.05) return { rise: t - y, d: d };
    }
    return null;
  }
  /* The launch the legs give right now, and the ground rate they throw it along
     with -- `{up, carry}`, or null when there is no ground for an arc to land on
     (a wall, and the caller's law for a wall).
     With open ground it is the launch the body's own ask wants by its next
     push-off (`cruiseLaunch`): a pottering animal hops short and a running one
     hops long, and neither is thrown the escape leap for no reason, and the
     ground rate is the legs' own (`arcCarry`).
     With a step in front of them that they can land on it is the launch that
     reaches that height (`hopLaunch`) and the same rate along the ground the legs
     give it (`arcCarry`): one push, one arc, at the angle one push gives,
     whatever the arc is for.
     A body standing against a face it could land on top of is stopped by it, not
     defeated by it, and the difference is between the ground an arc was OWED and
     the ground it has PAID. The face takes back the ground: the resolver of the
     body you wear stops the move at the first cell that would put the box inside,
     and the ground gate of the animal refuses the place with no ground to land
     on. Neither takes back the push. While the legs are still extending against
     the ground under the body, the rate they gave is there the frame the body is
     above the top of the face, and the body crosses the edge then -- so the
     ground an arc was launched with (`arcSpan`) is spent only by ground the body
     actually covered, frame by frame, in both bodies: see `arcLeft` here and in
     `Creature.update`. Measured before that rule, at a bank of one metre with a
     body worn from a frog standing against it: the same launch given three times
     in three seconds, the face taking the rate back at 0.28 m of height each
     time, and the body coming down at the foot of its own bank three times --
     three arcs that each paid the face for ground the face never let them have.
     `cap`, when the caller has one, is the ground that is actually there to land
     on: the animal's own step gate asked that question of the body's rectangle a
     few hundred lines earlier in this same frame (see `arcFit` in
     Creature.update), and the body worn from that animal asks it of the columns
     its own heading passes over (see `arcFit` in Player.update). An arc cannot
     land on ground that is not there. A body
     with a wall along its side is heading a few degrees into it, and the ground
     it was asked for ends with its own shoulders inside the wall; asked at the
     wanted arc alone it takes no arc at all and stands pressed against the face
     for the rest of the afternoon, and asked with the cap it hedges the arc the
     way it hedges the step when it is walking, and goes along the wall. The wall
     rig of test/play.js is what keeps that honest.
     The look-ahead that finds a face is asked over the ground THIS launch covers,
     `arcGround(plain, dt)`, and not over the ground the fullest extension could
     cover: a face that far off is ground the body is standing its way to, not
     ground it is about to land on. A wall at the end of the next arc is met by
     that arc's landing and the frame after it, when the face IS inside the next
     arc's ground and the wall law answers. Nothing is lost by this: a body never
     begins an arc that collides, because the arc it begins is the one the
     look-ahead was asked over. */
  function hopLaunchNow(hop, w, x, z, y, ux, uz, want, period, dt, cap, roomUp, front) {
    if (!hop) return null;
    /* Two different asks, and one of them is not about ground at all. A body
       going somewhere asks the legs for the ground its ask wants by the next
       push-off (`cruiseLaunch`), capped by the ground there actually is to land
       on (`cap`). A body asking only for height -- the push key held with
       nowhere to go -- asks the legs for all of the extension they give with
       nothing in front of them, and gets the arc straight up. A body that was
       asked neither is not pushing off at all. */
    const asked = want > 0 ? cruiseLaunch(hop, want, period, dt, cap) : hop.up;
    /* The room over the body's own head is asked here, next to the ground, and
       not put as a lid on an arc that has already been chosen. The order is the
       law: a roof that takes height out of an arc takes the ground that arc
       covers with it, and an arc lowered onto the face of the step it was sized
     for is an arc that ends inside the rock. Measured on a frog in a passage
     with a ceiling one cell over its floor and a step closing the end -- the
     ceiling leaves 0.57 m of headroom, the step asks 1.0 m of rise -- the arc
     the lid allowed (0.52 m of rise) put the body on top of the step anyway:
     the ground under a body mid-arc that turns out to be above its feet is the
     ground it lands on, and the arc never needed to reach it. Ask the room with
     the ground and the launch the room leaves is the cap the legs work under,
     and a step that asks more than that is not a step this body can take. */
    const roofCap = roomUp === undefined ? Infinity : roofLaunch(hop, roomUp, dt);
    const plain = Math.min(asked, roofCap);
    if (!(plain > 0)) return null;
    const face = riseAhead(w, x, z, y, ux, uz, arcGround(plain, dt),
      Math.max(hop.up, hop.max || hop.up));
    if (!face) return { up: plain, carry: arcCarry(plain, want) };
    /* The height the step asks of the legs, and the rate they give with it: the
       rate is their own whatever the arc is for, and the launch never asks more
       than the fullest extension the row states. A riser beyond that extension
       is not a step: for a body on an errand it is a wall, and the caller's law
       for a wall answers it; for a body only asking for height it is nothing,
       because a body told to jump jumps. */
    const up = hopLaunch(hop, face.rise, dt);
    /* A riser beyond the fullest extension of these legs is not a step: for a
       body on an errand it is a wall. It is answered with the arc the body's own
       ask wants, which the cap above has already shortened to the ground there
       actually is -- so the body comes up to a face it cannot climb instead of
       stopping a whole arc short of it and standing there. For a body only
       asking for height the face is nothing: a body told to jump jumps. */
    if (!up) return { up: plain, carry: arcCarry(plain, want) };
    if (!(want > 0)) return { up: Math.min(up, roofCap), carry: 0 };
    // height asked for, and no ground with it
    /* The room takes the step: the arc the step asks does not fit under it, and
       the body takes the arc its ask wants, which the ground above already
       settled has a landing for. It comes up to the face and stands there --
       the same answer a wall the legs cannot size gets. */
    if (up > roofCap) {
      /* The room takes the step. The arc the ask wants has its landing on the far
         side of this face -- the ground above settled that -- but the arc the room
         leaves cannot reach that far up, and a body set down on ground above the
         top of its own arc has been lifted, not landed. So the arc is asked for
         the ground that stops short of the face instead: the same hedge the walk
         gate makes at a wall, made here with the face in hand. Short of the face
         means short of the face of the body's own box, which is what `front`
         carries: an arc that leaves the point the feet stand on a hand's width
         shy of the face while the shoulders are through it is the same body
         inside the rock, and it was found a cell higher in one frame -- the
         shape the `pops` guard of test/play.js exists for. */
      const short = launchForGround(Math.max(MIN_HOP_GROUND,
        face.d - (front || 0) - ARC_PROBE), dt);
      const upShort = Math.min(plain, short);
      return { up: upShort, carry: arcCarry(upShort, want) };
    }
    return { up, carry: arcCarry(up, want) };
  }
  /* How much sky the arc a body is about to push off into has over its head, in
     metres above the highest point of that body. Negative says the roof is
     already inside it.
     The roof is not the cell over the body's head: an arc goes forward as far
     as it goes up -- the legs' own rate carries it `up*up/g` metres of ground
     before its top -- so a launch read only over the column a body stands in
     lets it hop out of open sky into a column whose beam is over its head while
     it stands and through its body at the top of the arc. Measured on one frog
     walked at a trunk block two cells over a shelf at 24: 14 of its 480 frames
     with its head 0.16 m inside that block and its nearest wood at 0.31 m,
     having launched in the open column next door -- 26 airborne frames spent
     inside the column that block stands over, and not one push-off from it. That is
     the reading from before this law; the same rig answers 0 frames with any part of
     the body inside wood at the height of its own body -- 61 frames in the column
     the block stands over, 17 of them airborne, one push-off in it, 6.9 m of ground
     covered -- and a block that far over the head of a body whose errand arcs top
     0.161 m is a roof to neither material, of trunk or of crown. What asks this law
     today is the passage rig of `test/play.js`, a low ceiling over three cells with
     a step closing the end; docs/03 s3 has the readings both ways. So
     the roof is the lowest underside over the columns the arc is spent over: one
     column ahead for each metre the arc will have travelled by its top, and the
     cells the body's own box reaches into at push-off, because the centre can
     stand a hand's width past the edge of a low ceiling with half the body
     still under it.
     Leaves are excused by the material table and a trunk is not: a body under a
     crown hops, and a body under a beam does not (see `N.FOLIAGE` in world.js).
     The one thing the two bodies in this file cannot share is the list of cells
     a body stands across -- an animal stands in a rectangle turned by its own
     heading, and the body you wear stands in the axis-aligned box its record
     gives it -- so each of them hands that list over and the rest of the law is
     one reading. What the answer is used for is one thing too: the launch is
     lowered to the highest arc the room has (`roofLaunch`), and where the room
     has no arc worth taking the legs are not loaded for one at all -- the
     wind-up is held to the same answer, and the body stands up out of the way
     until the roof goes. */
  function arcRoofRoom(w, x, y, z, tall, fx, fz, carry, up, cols) {
    const cx = Math.floor(x), cz = Math.floor(z), over = Math.floor(y) + 1;
    const span = Math.max(0, Math.ceil((carry || 0) * up / GRAVITY));
    let roof = roofY(w, cx, cz, over, w.h, N.FOLIAGE);
    for (let k = 1; k <= span; k++)
      roof = Math.min(roof, roofY(w, cx + Math.round(fx * k), cz + Math.round(fz * k),
        over, w.h, N.FOLIAGE));
    for (const c of cols) roof = Math.min(roof, roofY(w, c[0], c[1], over, w.h, N.FOLIAGE));
    return roof - y - tall;
  }

  /* ============================ player ============================ */
  /* The walk clock. A body's gait is where it is in its own stride, and it is
     advanced by the ground the body covered and not by the clock: one cycle of
     the legs carries the body exactly as far as its own feet reach, which is what
     lets a foot that has reached the ground stay there instead of being dragged
     along it under the body. Where that reach comes from is argued, and measured
     off the model, in the stride block of models.js.
     The distance is the body's own displacement and not its velocity times the
     frame: a body pushing on a wall covers no ground, and its legs have to stop
     with its body instead of running on the spot against it. And the ground a
     body covers while the water is holding it up does not count either -- a
     frog swimming across the lake is not walking across it.
     A body with no leg that walks reaches nowhere: a frog hops, and its gait
     is left unset, which is how the draw knows there is
     no stride for that body to ride. */
  function walkGait(body, modelId, sc, move, dx, dz, spd, dt) {
    const len = N.gaitStride(modelId, sc, move);
    if (len <= 0) return;
    /* The ground the body covered, and never more of it than the body's own
       speed says it could cover in this frame. A body that has come up against
       a wall creeps the last couple of millimetres of it with its speed already
       come to nothing, and the stride a body takes at no speed is nothing
       either: the quotient of those two is a stride count of 1e13, and the legs
       of a person standing against a wall go through ten trillion steps. */
    const walked = Math.min(Math.hypot(dx, dz), spd * dt) * (1 - (body.airAmt || 0));
    if (walked <= 0) return;
    body.gait = (body.gait || 0) + walked / len;
  }

  class Player {
    constructor(world) {
      this.world = world;
      this.x = 0; this.y = 40; this.z = 0;
      this.vx = 0; this.vy = 0; this.vz = 0;
      this.yaw = 0; this.pitch = 0;
      // what the body actually looks like: facing and bank are eased, never snapped
      this.faceYaw = 0; this.bank = 0;
      // and the signed rate that lean comes from, in rad/s of heading: a
      // swimming body kicks its outside leg with it (see `turn` in partAngles)
      this.bend = 0;
      /* and the third angle: how much the body is pointing up or down along the
         path it is taking. Nose down positive, because that is the angle rotX
         takes. Only a body the air or the water is holding up has one -- feet
         keep a body level. */
      this.tilt = 0;
      this.grounded = false;
      this.form = null;            // fruitId
      this.formT = 0;              // time remaining
      this.formMax = 1;
      /* Held breath. A body starts the run with the reserve of the body the run
         starts in; the reserve itself belongs to the record of whichever body is
         being worn (`maxAir`, and `breath` on data/player.js and on the animal
         rows in data/creatures.js). */
      this.air = HUMAN.breath;
      /* Vitality the same way. It is a figure about this body and not about the
         water or the animal, and until now it was written in three places -- this
         body's first state, the state it is set back to when it dies, and the
         number of marks the gauge draws -- and in none of them. `life` on
         data/player.js is the one place it is stated; the water's price against
         it is the water's own, and the pair is what the deepest water in this
         valley is measured against in `test/play.js`. No animal row carries it:
         nothing in this build takes vitality out of a wild body. */
      this.vital = HUMAN.life;
      this.fright = 0;             // fright 0..1
      this.inWater = false; this.headWater = false;
      this.dry = 0;                // seconds this amphibian body has been out of water
      this.moveAmt = 0;            // horizontal movement this frame (drives animation)
      /* where the body is in its own stride, in whole cycles, and how hard it is
         asking for one. The stride is kept by the body and not by the clock --
         see walkGait above -- and a body with no leg that walks has none. */
      this.gait = null;
      // the speed the body is trying to travel at this frame, m/s (the draw
      // sizes a swim stroke against it)
      this.cruise = 0;
      /* what the body's own motion tells the animation, in 0..1: how far off the
         ground it is, how loaded its legs are before a hop, and how much it
         flattened on the landing. Nothing here is a mood -- all three are read
         off the physics, so a body that does not hop never animates as if it did. */
      this.airAmt = 0; this.crouch = 0; this.squash = 0;
      this.hopT = 0; this.wind = 0;
      /* The ground an arc was launched with, and how much of it is still owed: a
         push-off owes `arcSpan` metres of ground, and only ground the body
         actually covered pays for it. The same two numbers the animal's own body
         carries (`arcV`/`arcLeft` in `Creature.update`) and the same rule -- see
         the brace above `hopLaunchNow`. */
      this.arcX = 0; this.arcZ = 0; this.arcV = 0; this.arcLeft = 0;
      /* how far the water is holding this body up, eased 0..1. The vertical
         branch decides it every frame; the draw is the only thing that reads it
         back, and it is what tells a body built for water whether its legs are
         trailing behind it or standing under it. */
      this.held = 0;
      /* Whether this body has water to push at all: in it, and off its bottom.
         The two are the same answer for a body the water holds up, and they are
         not the same question -- see `strokeOf` in game.js. The draw reads this
         and nothing else does. */
      this.stroking = 0;
      /* Set by Game.die() and cleared at the top of the next frame. It is not a
         "is the player alive" flag -- dying always revives them at the town
         cellar -- it is a stop sign for the rest of the tick that killed them. */
      this.dead = false;
    }
    get formDef() { return this.form ? N.FRUIT_BY_ID[this.form].form : HUMAN; }
    /* How this body moves -- and it is one record, not two. The fruit's row says
       which animal a body is worn from; that animal's row in data/creatures.js
       is where the motion is written, for the animal walking the shore and for
       the body worn from it alike. So the body you wear has the animal's cruise,
       the animal's launch, the animal's turn rate, and it is measured against
       those same numbers by the gait law: wearing a frog is moving like a frog.
       A body worn from no fruit is the body the data says you start in, which is
       a record of the same shape and states its own motion in the same absolute
       units -- 4.7 m/s on foot, 2.9 through water, 8.3 m/s of launch.
       `formDef` stays the shape and the senses: the box, the skin, the eye. The
       split is exactly the one the design already made -- a fruit hands you a
       body and the world's reaction to it, never a mind -- drawn where the code
       has to draw it, because "what is the fastest this body goes" has one
       answer and a record that has to invent a second one is the bug this is. */
    get moveDef() {
      return this.form ? N.CREATURE_BY_ID[N.FRUIT_BY_ID[this.form].creature] : HUMAN;
    }
    get modelId() { return this.form ? N.FRUIT_BY_ID[this.form].creature : 'human'; }
    size() { return this.formDef.size || HUMAN.size; }
    /* model units -> metres. The animal's own record carries the number (an
       animal is declared once, whether it is walking around or worn as a body);
       the human body takes it from the form def above. */
    bodyScale() {
      return this.form ? N.CREATURE_BY_ID[N.FRUIT_BY_ID[this.form].creature].scale : HUMAN.scale;
    }
    /* How hard this body is asking for a stride, 0..1. The draw sizes the swing
       by this and `walkGait` sizes the stride by it, and they have to be the same
       number or the foot slips all the same -- so it is said once, here.
       It is asked of the body's own record, which is the only way the question
       makes sense: a gait is a share of the fastest this body travels on foot,
       and a body that does not own that number has no gait to be sized by. This
       is the same call a wild body makes (`N.walkMove(c.speed, c.sp.speed)` in
       `Creature.update` and in the draw), and there used to be two of them: the
       player's body was measured against a constant, `WALK_TOP = 5`, whose only
       claim was that it sat a little above the human body's cruising 4.7, which
       is a number a person needs and a frog wearing a person's speed does not.
       It is gone, and with it the second record of the same animal: a worn body
       is at 1.0 of its own law at the speed its own animal's row gives it, which
       for the person is where the model's fullest stride is, and for a frog there
       is no stride to size at all -- its model gives its legs no share of one,
       because a frog does not walk on land, it hops. */
    walkMove() { return N.walkMove(Math.hypot(this.vx, this.vz), this.moveDef.speed); }
    /* How long this body holds its breath, in seconds. It is the animal's own
       number, off the same record the cruise and the hover are taken from: the
       body worn from a sea turtle holds a sea turtle's breath, and a person's
       body holds a person's, which sits on data/player.js with the rest of that
       record. A row that states no `breath` is a body with no animal to answer
       for it, and there is no other number for such a body. A body that
       breathes water is never asked this at all: the caller holds its ceiling
       off `breatheAir`. */
    maxAir() {
      const own = this.moveDef.breath;
      return own === undefined ? HUMAN.breath : own;
    }
    eyePos() {
      const m = N.MODELS[this.modelId];
      const h = (m && m.eye ? m.eye : 1.6);
      return this.y + Math.min(h, this.size()[1] - 0.08);
    }
    fov() {
      let f = this.formDef.fov || 76;
      if (this.headWater && !(this.formDef.breatheAir === false)) f -= 12;
      return f;
    }

    hits(x, y, z) {
      const s = this.size(), hw = s[0] / 2;
      const x0 = Math.floor(x - hw), x1 = Math.floor(x + hw);
      const y0 = Math.floor(y + 0.001), y1 = Math.floor(y + s[1] - 0.001);
      const z0 = Math.floor(z - hw), z1 = Math.floor(z + hw);
      for (let yy = y0; yy <= y1; yy++)
        for (let zz = z0; zz <= z1; zz++)
          for (let xx = x0; xx <= x1; xx++)
            if (this.stopsAt(xx, yy, zz)) return true;
      return false;
    }
    stopsAt(x, y, z) { return this.world.solidAt(x, y, z); }
    /* move along one axis; returns whether it hit a wall */
    axis(a, amt) {
      if (!amt) return false;
      const nx = a === 'x' ? this.x + amt : this.x;
      const ny = a === 'y' ? this.y + amt : this.y;
      const nz = a === 'z' ? this.z + amt : this.z;
      if (!this.hits(nx, ny, nz)) { this.x = nx; this.y = ny; this.z = nz; return false; }
      const s = this.size(), hw = s[0] / 2;
      // snap to face: find the contact plane along the movement direction
      if (a === 'y') {
        if (amt < 0) {
          /* The floor is the top of the highest solid layer the feet came into
             this frame -- and only layers the feet came into. The scan used to
             start from `this.y`, so the answer was never below where the feet
             already were, and a body resting on a surface was parked half a
             millimetre above where it had been at the start of the frame
             instead of on the surface: gravity pulled it down 6.4 mm, the snap
             put it back up 0.5 mm, and that is a 6 mm sawtooth about five times
             a second that never stops. The lens sits on the feet, so the whole
             frame rides that sawtooth -- and it rides it hardest close to the
             lens, which is why it reads as the nearby blocks shaking and not as
             the world sinking. Layers above the feet are a ceiling, not a floor:
             they used to be folded into the same maximum, which could lift a
             body a body-height when its head was in a wall. */
          const y0 = Math.floor(ny + 0.001), feet = Math.floor(this.y + 0.001);
          const y1 = Math.min(Math.floor(ny + s[1] - 0.001), feet);
          let best = null;
          for (let yy = y0; yy <= y1; yy++) {
            if (this.colAt(this.x, yy, this.z)) best = yy + 1;
          }
          if (best !== null) { this.y = best + 0.0005; this.vy = 0; this.grounded = true; }
          else this.vy = 0;      // blocked above the feet: stop the fall, do not climb
        } else {
          const yy = Math.floor(ny + s[1] - 0.001);
          this.y = yy - s[1] - 0.0005; this.vy = 0;
        }
      } else if (a === 'x') {
        const xx = amt > 0 ? Math.floor(nx + hw) : Math.floor(nx - hw);
        this.x = amt > 0 ? xx - hw - 0.0008 : xx + 1 + hw + 0.0008;
        this.vx = 0;
      } else {
        const zz = amt > 0 ? Math.floor(nz + hw) : Math.floor(nz - hw);
        this.z = amt > 0 ? zz - hw - 0.0008 : zz + 1 + hw + 0.0008;
        this.vz = 0;
      }
      return true;
    }
    colAt(x, y, z) {
      const s = this.size(), hw = s[0] / 2;
      const x0 = Math.floor(x - hw), x1 = Math.floor(x + hw);
      const z0 = Math.floor(z - hw), z1 = Math.floor(z + hw);
      for (let zz = z0; zz <= z1; zz++) for (let xx = x0; xx <= x1; xx++) if (this.stopsAt(xx, y, zz)) return true;
      return false;
    }
    /* A body change, or a tree growing where you were standing, can leave you
       inside the world. `axis` stops a body entering a solid; it has no opinion
       about one that already is, and a body that overlaps a solid cannot move
       normally -- every direction it tries hits and snaps to a block face. So
       after any change of size, and after any tree built at your feet, get the
       body out. Sideways first: a body inside a column belongs beside it, which
       is what planting a tree on your own head should leave you doing (standing
       next to it), and lifting would put you on top of a four-metre trunk. Then
       up, because a body under a roof belongs above it. Past both the column is
       solid all the way and the honest answer is the top of it. */
    unstick() {
      if (!this.hits(this.x, this.y, this.z)) return false;
      const x0 = this.x, z0 = this.z;
      const off = [];
      for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++)
        if (dx || dz) off.push([dx * 0.5, dz * 0.5, dx * dx + dz * dz]);
      off.sort((a, b) => a[2] - b[2]);
      for (const [dx, dz] of off) {
        this.x = x0 + dx; this.z = z0 + dz;
        if (!this.hits(this.x, this.y, this.z)) { this.vx = 0; this.vz = 0; return true; }
      }
      this.x = x0; this.z = z0;
      for (let i = 0; i < 40; i++) {
        this.y += 0.05;
        if (!this.hits(this.x, this.y, this.z)) { this.vy = 0; this.grounded = false; return true; }
      }
      this.y = groundY(this.world, Math.floor(this.x), Math.floor(this.z), Math.floor(this.y) + 6) + 0.0005;
      this.vy = 0; this.grounded = false;
      return true;
    }

    update(dt, inp, game) {
      const f = this.formDef;
      const W = this.world;
      const gx = this.x, gz = this.z;      // where the stride starts from
      const cx = Math.floor(this.x), cz = Math.floor(this.z);
      const cyHead = Math.floor(this.y + this.size()[1] - 0.12);
      this.headWater = W.liquidAt(cx, cyHead, cz);
      /* Whether this body is in the water at all: the surface of the column it
         is in is above its feet. The question used to be put to the cells -- is
         the cell at the body's feet, or the one at its middle, liquid -- and
         that flips for a body straddling the surface. Measured at (56.5,14.9,
         94.5) with a frog pushed up to the surface by its own up key: the cell
         under its feet is water while its origin is under 14.903 and air above
         it, the body bobs across that line, and `inWater` went on and off 42
         times in 240 frames -- and with it the whole water branch of its
         movement: the water's hold and gravity in alternation, one cruising
         speed and then another, and the stroke of its legs, which snapped 0.19 m
         out and back again every few frames. The surface of the column is a
         property of the place rather than of where the body happens to sit
         inside it, which is the same reason `heldUp` a few lines below reads the
         column and not the body, and the reason that one stopped chattering. */
      const wSurf = W.liquidSurfaceAt(cx, cz);
      this.inWater = wSurf >= 0 && this.y < wSurf;
      /* The surface this body stands in, handed to the draw. How far under
         water a body's skin is -- and therefore how much of its colour the
         water above it has eaten -- is a fact about the water the body is in,
         not about the lens looking at it, so the draw takes it from the body
         rather than from the view. See uWaterY in engine.js. */
      this.wSurf = wSurf;
      const canBreathe = f.breatheAir === false;
      /* The ground this body's own box would stand on, and whether the water
         there is what is carrying it. The ground is asked of the box and not of
         the column under the body's middle, because that is how the world
         supports this body anywhere else it is asked (`colAt`, the vertical part
         of `axis`): a 1.5 m body over a trough with a lip inside its footprint
         stands on the lip, and a hold computed from the middle of the trough
         would tell it to stop a metre above the ground it is standing on. The
         depth question itself is asked of the ground and not of the body's height
         or of its breath: the depth at which water has
         enough of a body in it to hold one up is a fact about the water
         (`waterHoldsUp`, the same two-block line the animals' step gate, the dive
         floor and the 138 one-block columns of Mirrorlake's shore are all read
         with), and the three things it decides here are one question -- what the
         body's speed is, whether the body steers by bending a course through the
         fluid or by pushing on the ground with its feet, and whether a leg that
         is not extended means the body stands. A body standing on a bottom the
         water is only a metre deep over is on its feet; a body at the surface of
         a deep column is not.
         The buoyancy below is a narrower question -- whether the water holds the
         body up on its own when the body stops moving. The gas is not the test.
         The body is: a body is held up when it is a body whose animal is built to
         lie in that water, and that is the record's own word for it --
         `locomotion`, the same word the animal's own body asks with
         (`isAmphibian`/`isAquatic`, read in `Creature.move` below), so the animal
         walking its ring and the body worn from its fruit answer once. What used
         to be asked here was `breatheAir`, and the two are not the same animal:
         the sea turtle's row says it lies at the top of the sea (`hover`), says
         it swims faster through water than any other body in the valley, and
         says it comes ashore onto sand -- and the field made its body, worn as a
         form, sink to the bottom of that sea and stand there, because it happens
         to breathe air. What the breath decides is written one block below, where
         a body whose head is under the surface spends the reserve its own record
         states; it is a clock, not a force. */
      const bedTop = this.inWater ? groundUnder(W, this.x, this.z, this.size()[0] / 2, this.y) : -1;
      const carried = this.inWater && waterHoldsUp(wSurf, bedTop);
      const M = this.moveDef;
      const builtForWater = M.locomotion === 'amphibian' || M.locomotion === 'water';
      const heldUp = carried && builtForWater;

      // ---- breathing ----
      /* Held breath is a property of the body, and how long a body of this
         animal holds it is on that animal's row: `breath` there, and the
         person's number on data/player.js. The reserve is spent only while the
         head is under the surface of a water this body cannot breathe.
         And the same clock runs the other way at the same rate, because that is
         the only thing the records support. The unit of `air` is not free: the
         figure on the row is a number of *seconds of this animal's own quiet
         holding*, so one unit of it is one second of what this body burns, and
         the drain under a surface is that burn with nothing coming in at all. In
         air the intake is on, and what pays the store back is the surplus over
         the burn -- so the one figure that could set the two ends apart is how
         far that surplus is allowed to rise, and no row in this valley states an
         intake. Rows state stores. So the rate below states the one thing that
         needs no new number: a body pays a second of breath with a second of
         breathing at the surface, and the second dive it can then make is bought
         with the seconds it stood there, which is how a breath-holding animal
         actually spends its day. What stood here was a figure shared by every
         body that breathes air, six times the burn, and it is a claim about how
         far a body's wind rises that no animal in this valley makes; at the
         water's edge it came to a body emptied at the end of its own record's
         seconds being full again **a sixth** of that time later -- **3.0 s** for
         a person's **18**, **40 s** for the animal's **240** -- and with the
         whole reserve back before it had finished catching its breath
         (`test/play.js`, `theSeaTurtleBodyDragsOnSandAndSwimsThroughWater`,
         `out.breathClock`, which measures both ends of this and the day between
         them).
         The panic multiplier is a state of this body and not a second clock, so it
         is asked at both ends: one figure is what keeps it from being two. It is on
         this body's record now -- `fright` on data/player.js, which is where the two
         rates that fill and drain that state, the level at which this branch opens,
         and the multiple it opens at are all stated -- and what is known about the
         figure is what it can and cannot do. Because the clock runs at one rate at
         both of its ends, a multiple of it cancels over any stretch a body spends
         half under water and half breathing: with the state pinned at one level for
         the whole of such a stretch, **8.5 s** under that water spends **13.6** of a
         person's **18** units at **1.600** a second and **8.5 s** with the head out
         hands **13.6** back at **1.600** -- and the same at **1.000** with the state
         unpinned. The price of a dive, in seconds of breathing, does not contain
         this figure at all. What it moves is where in a day the store runs out: on
         the bed of this valley's deepest column, **11.25 s** rather than **18.00 s**.
         And this valley never opens the branch: the one call that fills the state
         needs an animal in the chase state, and of the animal rows this build carries
         against the forms its fruits can put a body in, none answers hostile (**0** of
         **6** pairs). What the figure should be is still open, and the reason it is
         open is now measured rather than assumed -- nothing that measures a day can
         reach it (`test/play.js`,
         `theFrightABodyCarriesIsOnItsRecordAndPricesNoPartOfADay`: `out.cycleQuiet`,
         `out.cyclePanicked`, `out.floorQuiet`, `out.floorPanicked`, `out.census`).
         Nor is the water the cause that should open it, and that is not a matter of
         taste. This clock is the price the water already takes for a second; a state
         the water caused would price that one second twice, once through the figure on
         the row and once through a multiple of it, and the figure would stop being the
         seconds the body gets. Both ways measured on the bed of this valley's deepest
         column (`test/play.js`,
         `theWaterThatTakesASecondOfABodysBreathDoesNotAlsoFrightenTheBodyThatPaysIt`:
         `out.shipped`, `out.waterCaused`, `out.cycleShipped`, `out.cycleWaterCaused`),
         the rig filling the state at the record's own fill and asking the head the same
         ask this block asks: as the game ships, the state never rises there and the
         store runs **18.00 s**; asked with the water as a cause, the level is reached
         **0.52 s** into the dive, **0.52 s** of the whole hold run at the figure this
         row states, the store is empty at **11.45 s** instead, and the body is dead at
         **20.53 s** where the body this game ships stands alive at **22 s**. And the
         cancellation two paragraphs above belongs to a cause a body carries with it, not
         to one it walks out of: the same **8.5 s** dive that spends **8.5** units and is
         handed **8.50 s** of breathing back by them with no cause spends **13.29** with
         the water as its cause and owes **10.32 s** of breathing for them -- **1.82 s**
         more than the dive took, which is the multiple short of the part of that
         stretch the state spent below the level at both of its ends -- because the state
         is still above the level for **4.98 s** after the head is out of that water. So
         what would price a body's own drowning is how fast a body calms down from an
         animal standing next to it. That price is not taken.
         A body that breathes the water has no store to run out and is not asked
         at either end: it is held at a sentinel instead of a ceiling, and the
         only question ever asked of that sentinel is whether it is empty. */
      const rate = this.fright > HUMAN.fright.panic ? HUMAN.fright.breathRate : 1;
      /* The ceiling is a bound and not a target, and a bound is asked in every
         frame. The reason it has to be asked here, where the clock is kept, and
         not at the places that change the body -- `Game.wear`, `Game.revert`,
         `Game.load` -- is that those places are not the only ones and cannot be
         kept a list of: a fruit's clock reaching nought in the middle of a lake
         is a frame like any other, and a save written by one version of this
         game arrives in a body it was never written for. The reserve belongs to
         the body being worn, so the only general ask is the one made here. What
         it costs, measured in the same open water the paragraph above was
         measured in: a body worn from the frog pear -- kept at the sentinel of
         999 rather than at a ceiling, because it breathes this water -- held
         under until its own clock ran out there handed the person's body that
         **999**, and the sea turtle's body emptied to **238** of its **240**
         handed the same person's body **238**; at one unit to the second those
         are the seconds each body would then hold its head under, for a body
         whose own record states **18**. With the ask here, one frame later that
         body holds **17.98** -- one frame's burn short of its own **18** -- and
         runs out **17.98 s** later at **1.000** a second whichever body it came
         from. A body that stops wearing an animal stops wearing its lungs, and
         nothing in the build converts one animal's seconds of holding into
         another's -- the unit is the animal's own -- so what is left is the
         bound and not a conversion. The other direction is the same law with the
         sign changed and is left alone on purpose: putting a bigger body on does
         not fill it. A person's body run out under that water hands the animal's
         body **0** of its **240**, and that body pays the debt back the way it
         pays any other, at a second to the second of breathing -- measured
         (`test/play.js`, `theSeaTurtleBodyDragsOnSandAndSwimsThroughWater`,
         `out.breathCross`; the same law across a save is at `test/save.js` and
         docs/07 s3.3). */
      const ceiling = canBreathe ? 999 : this.maxAir();
      if (this.air > ceiling) this.air = ceiling;
      if (this.headWater && !canBreathe) {
        this.air -= dt * rate;
        if (this.air <= 0) { this.air = 0; game.damage(0.55 * dt, N.t('log.causeDrown')); }
      } else {
        this.air = Math.min(ceiling, this.air + dt * (canBreathe ? 999 : rate));
      }
      // drowning can end the run here; die() has already moved this body to the
      // town cellar, and the form captured above no longer describes it
      if (this.dead) return;

      // ---- skin must stay wet (amphibian bodies: docs/04 s3) ----
      // The frog breathes in water and on land, but its skin has to stay wet.
      // This is the cost of the water niche on land -- it drowns on the shore.
      if (f.dryTimer) {
        if (this.inWater) { if (this.dry > f.dryTimer) game.logMsg(N.t('log.dryIn'), 'good'); this.dry = 0; }
        else this.dry += dt;
        if (this.dry > f.dryTimer) {
          if (this.dry - dt <= f.dryTimer) game.logMsg(N.t('log.dryOut'), 'warn');
          game.damage(dt * 0.03, N.t('log.causeDry'));
          if (this.dead) return;
        }
      } else this.dry = 0;

      // ---- intended velocity ----
      /* What the body is trying to travel at: the animal's own cruise, from the
         record its motion comes from. On foot that is `speed`; in water the
         body's own `swimSpeed` takes over outright rather than a share of the
         land figure, because the two are different achievements and not one
         number seen through a medium: the person is slow in a lake at 2.9, the
         frog is quick in it at 4.6 and slow on the bank at 1.8, and each of
         those is written once, in the row of the body that does it.
         A body worn from an animal has no burst of its own unless that animal's
         row says it does -- and no animal in the valley has one, because no wild
         animal in the valley sprints. The person's `sprint` is a field of its
         record and is meant to be bought with breath. It is not, and while this
         clock is built the way it is it cannot be: the burst is refused in water,
         and out of water the clock only ever runs up. The same **6 s** on dry
         ground hand the store back **+6.0** units at **1.000** a second with the
         burst held and **+6.0** with it not -- while the burst does run, at
         **6.815 m/s** against the **4.70** the row gives without it -- and at the
         film of a lake the burst is refused and the body moves at the row's own
         **2.90**. A body with its head in air has no store to spend: that is what
         the two ends of this clock being one rate means. To charge the burst at
         all would need a figure for how far a body takes in above what it burns,
         and no row in this valley states one -- the rows state stores. The gate
         below is not a price either: it refuses the burst while the store reads
         empty, which out of water it never does for more than a frame. Measured in
         `test/play.js` (`theFrightABodyCarriesIsOnItsRecordAndPricesNoPartOfADay`,
         `out.burstHeld`, `out.burstNone`, `out.burstInWater`); kept open at
         OPEN-ISSUES 2m rather than filled in with a number nobody has measured. */
      const L = this.moveDef;
      const sprint = inp.sprint && L.sprint && this.air > 0 && !this.inWater;
      /* Whether the feet were on the ground when the frame started. Two things
         make this harder than reading `grounded`.
         The vertical branch below decides "is this body in the air or in the
         water" for the whole frame, so anything that wants to know whether the
         body is standing has to ask before that branch runs, not after.
         And the flag is the answer of the frame that is over: `grounded` is
         reset only by the displacement below, so a body that has just stepped
         off a ledge is still reported standing on it while its fall begins.
         Put the question to the ground instead: how far above the level its own
         box would be standing at is this body -- the same ground the hold above
         was computed from, and the same one the collision would put it on. The
         2 cm of slack is the same one the step-up and the water's hold use. */
      const onFoot = this.grounded || this.y - groundUnder(W, this.x, this.z, this.size()[0] / 2, this.y) < 0.02;
      let speed = L.speed * (sprint ? L.sprint : 1);
      if (carried) speed = L.swimSpeed;
      // a body that hops is thrown forward by the hop; it does not bleed speed
      // in the air the way a body that merely fell off a ledge does
      if (!this.grounded && !this.inWater) speed *= (L.hop ? 1 : 0.92);
      let dx = 0, dz = 0;
      const fx = Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const rx = Math.cos(this.yaw), rz = Math.sin(this.yaw);
      if (inp.fwd) { dx += fx; dz += fz; }
      if (inp.back) { dx -= fx; dz -= fz; }
      if (inp.right) { dx += rx; dz += rz; }
      if (inp.left) { dx -= rx; dz -= rz; }
      const len = Math.hypot(dx, dz);
      if (len > 0) { dx /= len; dz /= len; }
      // what the body is trying to travel at this frame. The draw reads it: a
      // stroke is sized against the speed it is swimming at, not against a
      // guess about which animal the body is.
      this.cruise = speed;

      /* ---- a body the water is holding up goes where it is going ----
         A body in water has nothing to push against but the water, and it
         cannot change course on the spot: the course bends. `turn` is how fast
         the body can bend it -- the most
         radians a second it adds to its heading at its own cruising speed --
         and above that speed the arc it holds gets wider, not the turn faster,
         because the same sideways push has more body to swing about.
         What this replaces: the velocity was eased straight toward wherever the
         mouse pointed, with 12 units of push in water. Measured,
         a swimming body peaked at a course change of 94 rad/s, came about 45
         degrees in 0.17 s and 90 degrees in 1.9 s, and its path was a polyline
         whose corners the easing had merely softened.
         A body on foot is deliberately not in this branch: feet grip the
         ground, and the player's turning on foot is the game's answer to the
         mouse, not an animal's answer to momentum.
         The gate is `carried` and not `inWater`, which is the same correction
         the animals' step gate made at the shore of Mirrorlake: the water's way
         of moving a body belongs to a body the water is holding up, and a body
         standing on a bottom the water is a metre deep over has feet, and goes
         the way its feet go. */
      const arc = L.turn || 0;
      const hd0 = Math.hypot(this.vx, this.vz) > 0.05 ? Math.atan2(this.vx, -this.vz) : this.faceYaw;
      if (arc > 0 && carried) {
        let spd = Math.hypot(this.vx, this.vz);
        // at rest there is no course to bend: a body that starts from nothing
        // starts in the direction it is pushing, the way an animal pushes off
        const have = spd > 0.05 ? Math.atan2(this.vx, -this.vz) : (len > 0 ? Math.atan2(dx, -dz) : hd0);
        const want = len > 0 ? Math.atan2(dx, -dz) : have;
        const d = N.angleDelta(have, want);
        /* The body does not push at full sideways effort over a few degrees of
           error: the correction it aims for is proportional to how far off
           course it is, and only a wide correction is a full-effort one.
           Without that, a mouse jitter of a few degrees at 3 Hz had the body
           carving at its limit on every frame and rolling with it. */
        const rate = Math.min(arc * Math.min(1, speed / Math.max(spd, 0.01)), 2.2 * Math.abs(d));
        const bend = Math.min(Math.abs(d), rate * dt);
        const hd = have + (d < 0 ? -bend : bend);
        // and the fluid takes the speed back when the body stops pushing: it
        // coasts out over a second or two instead of stopping dead, because a
        // body with no brakes does that
        spd += ((len > 0 ? speed : 0) - spd) * N.ease(len > 0 ? 2.4 : 1.2, dt);
        this.vx = Math.sin(hd) * spd;
        this.vz = -Math.cos(hd) * spd;
      } else if (L.hop) {
        /* A body whose record says its legs are an arc has one way of covering
           ground, and nothing that is not those legs may change the rate it is
           doing it at.
           With its feet on the ground the legs are folded and the body stands:
           the ground it covers comes from arcs, so driving it along at its cruise
           with its legs idle is the shape this animal was reported for -- a body
           sliding forward on legs that never moved. `models.js` gives this body
           no stride (`anim:'walk', stride:0`) because there is no walk for it to
           have; the walk clock above leaves it unset for the same reason. The
           ask is not lost: it is what the push-off below is sized with, and the
           body leaves the ground at that rate, so the ground a whole number of
           arcs covers is the rate the row states.
           In an arc nothing can push -- there is no ground under the body and,
           for a body built this way, no water either -- so the rate it left the
           ground with is the rate it keeps until it lands, and the push-off is
           the only thing here that sets it. A body that walked off a ledge keeps
           the rate it had for the same reason. */
        if (this.grounded) { this.vx = 0; this.vz = 0; }
      } else {
        const accel = this.grounded ? 34 : 12;
        this.vx += (dx * speed - this.vx) * Math.min(1, accel * dt / Math.max(speed, 1));
        this.vz += (dz * speed - this.vz) * Math.min(1, accel * dt / Math.max(speed, 1));
      }

      // ---- the body turns with mass ----
      // facing never snaps to the mouse: an animal pivots, and the bigger it is
      // the slower it pivots. That is what makes third person watchable instead
      // of twitchy (docs/07, "camera and comfort").
      const h = this.size()[1];
      const spd = Math.hypot(this.vx, this.vz);
      if (spd > 0.4) {
        const want = Math.atan2(this.vx, -this.vz);
        this.faceYaw += N.angleDelta(this.faceYaw, want) * N.ease(11 - 3.4 * Math.min(2, h), dt);
      } else {
        this.faceYaw += N.angleDelta(this.faceYaw, this.yaw) * N.ease(3.2, dt);   // settle back to the aim
      }
      /* ---- the lean is what the arc costs ----
         A body carried along bends its path by pushing sideways against the
         fluid, and the tilt is that push: sideways acceleration over the pull
         of the earth. So the lean is no longer a constant times how fast the
         facing happens to be swinging -- it is read off the arc the body is
         actually holding, which means a body that is only correcting a few
         degrees leans a few degrees, and a body at the tightest arc its data
         allows leans the full 0.45. */
      const hd1 = spd > 0.05 ? Math.atan2(this.vx, -this.vz) : hd0;
      /* The turn rate is signed, and it has to be: the lean is the sideways push
         the arc needs, and a body turning left pushes the other way. Reading it
         with `Math.abs` banked every body the same way whichever way it turned —
         a body leaning out of its own turn for half of them. `bend` is that
         signed rate, in rad/s of heading, and it is also what a swimming body
         kicks with: see `turn` in `partAngles`. */
      const bend = spd > 0.3 ? N.angleDelta(hd0, hd1) / Math.max(dt, 0.001) : 0;
      this.bend = Math.abs(bend) < BEND_DEAD ? 0 : bend;
      const lean = carried
        ? Math.max(-0.45, Math.min(0.45, Math.atan(bend * spd / LEAN_G)))
        : 0;
      this.bank += (lean - this.bank) * N.ease(4.5, dt);

      /* ---- is the water deep enough to hold this body up at all? ----
         `waterHoldsUp`, `carried` and `bedTop` were answered once, up where the
         cruising speed is decided -- the film of the column standing over the
         surface this body's feet would stand on, asked of the place rather than
         of the distance from the body to its own surface. A lake is a body of
         water the animal floats in; a one-block shore shelf is a bottom it
         stands on and pushes off from, and 138 columns of Mirrorlake are that
         shelf. A body must not be told it is swimming by one rule and handed
         the ground under its feet by another; `bedTop` is kept from there
         because the floor of a dive is asked of it below, and the cell
         convention needs no restating here: the law takes two heights. */

      // ---- vertical ----
      if (this.inWater && (heldUp || !this.grounded)) {
        /* Up and down in water is the same push that drives a body forward,
           aimed differently, so how much authority a body has over its own
           depth is a fraction of how fast it moves through the water: a frog
           that swims at 4.7 m/s comes up at about a metre a second, and a human
           who swims at 2.9 does not surface much faster than it sinks. The
           water takes it back at the rate it takes the forward speed back.
           The two asks are keys of their own -- J down, K up, held rather than
           clicked -- and that is not a convenience: this branch used to read the
           forward-push key and a Ctrl for them, so a body swimming down was
           pushing off the ground, and holding Ctrl to get to the bottom with the
           other hand on WASD is a chord the browser answers to (Ctrl+W closes
           the tab, and W is forward). A body that is *pushing off a bottom it is
           standing on* still uses the push key, and that is the branch below.
           What was missing is the water's own answer. Every body in this branch
           carried the same fixed downward pull whatever it was made of, so a
           frog let go of in mid-water sank at a terminal 0.89 m/s, landed on the
           lakebed 3 m below, was reported standing on the bottom, and stopped
           there -- a water animal that stops moving sank. A body built for water
           is a body the water holds up: the wild frogs of the valley hang at a
           depth of their own and never touch the bottom of the deep part, and the
           body you wear was the only water-breathing body in the valley that
           went down. The answer put in beside it was a spring back to the level
           the water would float that body at, and it was half right: it stopped
           the sinking, and it took the depth away. Every body in the water was
           pulled back to one written level, so a body that swam down a few
           metres came back up them the moment the key came off, and no depth a
           body reached was its own to keep. A spring to a surface level is the
           answer for a body that cannot trim itself -- a cork -- and an animal
           built for water is not one. The water's hold is therefore neither a
           pull down nor a pull up: it is the absence of a vertical force, and
           what is left is the drag that takes a stroke's speed back and the two
           ends of the hold below. A body that is *asking* to go down is a body
           swimming down: it keeps the dive it always had, the lakebed stays in
           reach -- up to a small gap above it, where the stroke can keep running
           -- and it stays where it stopped when the key comes off, including at
           the bottom, which is why the branch is picked by `heldUp` and not by
           `!grounded`. What decides `heldUp` is the body's record and not its
           breath, so the other body built for this water -- the sea turtle's,
           worn as a form, breathing air -- is held up as well, and going down is
           a thing it has to be *asked* to do; what brings it back is its own
           stroke, and the price of staying down is the breath its row states. A
           person's body is the one that states nothing about the water anywhere,
           and so it is the one left to gravity here: it has to kick to stay off
           the bottom, and that is what it costs to wear a body that was not
           built for the lake. That a person's body floats a little in real water
           is true and is not modelled here, and the sentence is left standing as
           an open question rather than settled by a bare number (OPEN-ISSUES 29). */
        const push = speed * 1.5;
        /* The water holds a body it is holding up at whatever depth that body is
           at. It does not hold it *up*, as a cork is held up: an animal built
           for water trims its own gas to the depth it has taken -- that is how a
           frog and a fish sit still in the middle of a lake without a stroke --
           and a body whose mean density has been made the water's is in
           equilibrium at every depth in the water, so there is no vertical force
           left for the water to offer it. The depth a swimming body stops at is
           therefore the depth it stopped at: the stroke ends, the drag below
           takes the speed back, and the body hangs there until it is asked for
           another stroke. This is the whole of what was asked for: a body moved
           down a few metres keeps those few metres, and swims on forward at the
           depth it was moved to.
           A spring back to one written level is the answer for a body that
           cannot trim itself -- a cork, a log, a body that has stopped living --
           and that is what this line was: every body in the water was pulled
           back to `floatLevel`, the level its row would float at, so the depth a
           body had swum to was never its own to keep. For a body the water is
           not holding up at all there is no trim either, and it keeps the pull
           it has always had: a person's body has to kick to stay off the bottom,
           and that is what it costs to wear a body that was not built for the
           lake. */
        if (!heldUp) this.vy -= 5.2 * dt * 0.55;
        if (inp.up) this.vy += push * dt;
        if (inp.down) this.vy -= push * 0.6 * dt;
        this.vy -= this.vy * Math.min(0.9, 3.2 * dt);
        this.vy = Math.max(-4.5, Math.min(4.6, this.vy));
        /* The surface is the ceiling of the water's hold: a body the water is
           holding up cannot kick itself out of the water. It leaves the way a body
           leaves water -- into the shallows where the bottom is, and up off its
           own feet from there -- which is the route the branch below already
           documents, and which is why the ceiling belongs to `heldUp` and not to
           the water: a body standing on a bottom it can reach keeps the push-off
           it has always had. Without it a body pushed at the surface by its own
           up key crosses the surface, loses the water, falls back and crosses
           it again: at (56.5,14.9,94.5) a frog with the key held went over that
           line 45 times in 240 frames, and every crossing took the stroke off
           its legs and put it back on again.
           The ceiling is not the surface itself but `surfCeiling` -- the surface
           less half the body -- and that is what the player asked for. The two
           were one number only because the water's hold used to be told by a
           level measured to the body's feet, which happened to land just under
           the surface; a body's own height is what the hold is asked of now, and
           a ceiling taken a whole body under the film would mean a frog holding
           the up key could never bring its head to the top of the water at all.
           So the ceiling is how high a body that keeps asking can get, and the
           floor below is how low a body the water is holding can be pressed;
           between the two a body holds whatever depth it has taken. A frog that
           stops in the middle of a column stays in the middle of it. The key
           held for 5 s over a column 7 m deep stops it with its feet 25 cm under
           the film -- half of its 50 cm body over the water, eyes 17 cm over it,
           and the surface itself never crossed once in 300 frames -- and when the
           key comes off it stays there.
           The ceiling is asked of where the frame is about to put the body, not of
           where the body happens to be: the velocity decided here is spent later,
           over the substeps of the move, and a body at 14.93 with 4.6 m/s of climb
           in its legs is 0.077 m from the surface and over it before the frame
           ends. Asked of the body's own height instead, the surface of (64.5,92.5)
           was crossed twice in 240 frames with the key held, and every crossing
           took the body out of the water branch and put it back in. */
        if (heldUp && this.vy > 0 && this.y + this.vy * dt >= surfCeiling(wSurf, this.size()[1])) this.vy = 0;
        /* The lakebed is the floor of the same hold, and the floor belongs to
           `heldUp` for the same reason the ceiling does: both are limits of what
           the water's answer allows, not facts about which way the body happens
           to be moving. Without it a dive runs a body into the bottom, and for
           as long as the key is held the body slides along the mud with a dry
           pose and still legs -- what `bedFloor` above argues. The floor is
           asked of where the frame is about to put the body, over the substeps,
           exactly as the ceiling is, and only where the hold has any room in it
           at all: the two ends of the hold are asked of the body's own height,
           so they are in the right order exactly when the water stands deeper
           over that ground than the body is tall. A pool shallower than the body
           has no hold to keep -- its ground stays a ground to stand on, feet and
           dry pose and all -- which is the answer the herd's bodies take in that
           same water, and the two bodies are the same animal.
           The floor is a floor, not only a brake on going down. Cancelling the
           descent answers a body that travels towards the floor; it says nothing
           about a floor that travels towards the body, and the floor does move:
           the surface of one water is level, so the ceiling of the hold cannot
           come down on a body, while the ground the floor is measured from is
           not level at all and steps up under a body that swims inshore. Asked
           as a brake only, a body that swims onto ground higher than the depth it
           is holding is left *under* its own floor: the leg at (54.5,95.2)
           crosses from a column whose ground is 7 to one whose ground is 8 while
           sinking at 2.07 m/s, and the frame leaves it at 8.07 -- feet 0.07 above
           the ground, 0.18 under the floor that ground states, not standing
           because no frame ever met the ground and not carried because the floor
           the water's hold states is above it. Where the brake is the whole of
           the law, that is where the body stays for the rest of the leg. The
           water's hold is a support, and a support holds on both sides: the body
           goes up to the floor it is held at, by the world's own y move, which
           is also what stops it where a roof is in the way. The step is bounded:
           the scan of the ground below begins at the feet, so in any state the
           collision admits the ground a body is told about is a surface its own
           feet are on or above, and `bedFloor` is half a body above that.
           The herd's bodies have always had this half: their water branch moves
           the body *to* the bed level it states, in both directions, and the
           body you wear and the animal are the same animal in the same water. */
        const holdFloor = bedFloor(bedTop, this.size()[1]);
        const holdRoom = surfCeiling(wSurf, this.size()[1]) > holdFloor;
        if (heldUp && holdRoom && this.vy < 0 && this.y + this.vy * dt <= holdFloor) this.vy = 0;
        if (heldUp && holdRoom && this.y < holdFloor) this.axis('y', holdFloor - this.y);
      } else {
        /* Feet that are on the bottom are feet that can push off it, water
           around them or not. That is the whole of getting out of a lake: the
           shore of Mirrorlake is one block of water deep for 138 such columns, so
           the way out is to swim into the shallows, stand up, and go. The
           branch used to be picked by `inWater` alone, which left a body
           standing on the lakebed with the water at its chest no ground under
           it and no way to launch: in a one-block shore shelf, holding the jump
           key from the bottom gave a highest point of 14.93 m against a shore
           whose top face is at 15.0, and the body bobbed there for as long as
           the key was held. */
        this.vy -= GRAVITY * dt;
        this.vy = Math.max(-MAX_FALL, this.vy);
        const hop = L.hop;
        /* A push-off spends one frame of the fall at the moment of the push.
           That is how the animal's own step does it -- `Creature.update` launches
           and then integrates, in that order -- and the order is not a detail:
           the half-frame a launch is left free of gravity is `v*dt/2` of extra
           arc, 10 cm at the frog's 6 m/s launch and 7 cm at a person's 8.3.
           Measured before this was closed: the body worn from a frog came
           0.83 m off the ground and the frog it was worn from 0.73 --
           one animal, two heights, because the two bodies integrate their
           launches in different orders. The arc the ceiling gate asks
           (`hop.up*hop.up/2g`) is the analytic one, which sits between the two
           and is 5 cm over the arc either body actually reaches: a roof that
           passes the gate is a roof the arc clears, never one it hits. */
        const pushOff = (v) => { this.vy = v - GRAVITY * dt; this.grounded = false; };
        /* One push, one arc: the legs give their extension up and their own rate
           along the ground, and they now OWED the ground that arc covers --
           `arcSpan`, the same number the animal's own body carries in `arcLeft`.
           It is paid for only by ground the body actually covered: the
           displacement below re-asserts the rate on every frame of the flight and
           takes off only what the body moved, so a face that stops the body takes
           back the ground and not the push, and the frames it spends spend none of
           the debt. A body pressed against a bank it could land on top of rises
           along the face and crosses the edge the frame it is above the top,
           instead of coming down at the foot of it over and over. */
        const pushArc = (arc) => {
          this.arcX = aimX(); this.arcZ = aimZ();
          this.arcV = arc.carry;
          this.arcLeft = arcSpan(arc.up, arc.carry, dt);
          this.vx = this.arcX * this.arcV; this.vz = this.arcZ * this.arcV;
        };
        /* The launch the legs give this frame, which for a body that hops is
           not one number and is never a rate the body was already going at.
           With a step in front that they can land on they give the extension the
           row states, sized to land on that step and no more (`hop.max`); with
           open ground they give the one the body's own ask wants by its next
           push-off, which is what makes a body walking gently hop gently and a
           body running hop long, and what makes the ground it covers over a
           whole number of arcs the rate its row states. Both are asked of the
           same law the animal's own body asks a few hundred lines below, from
           the same row, so the frog you wear climbs a bank the way the frog on
           the bank does and hops the way that frog hops. A riser above the
           fullest extension is not sized at all: it is a wall, and the body
           stops at it, which is what it has always done.
           Nothing here is asked of a body that is off the ground, or of one the
           water is holding up: a step is taken with feet, and a body the water
           carries has none under it. A body standing in shallow water is a body
           with feet -- the same animal, the same bank, one metre from the place
           where it jumps -- and it sizes the step in front of it there too, which
           is what the animal's own body does at the lake's shore. And the roof
           over the arc is asked, in metres of sky, and the launch is lowered to
           the highest arc the room has: see `roomFor` below. */
        const aimX = () => (len > 0 ? dx : Math.sin(this.faceYaw));
        const aimZ = () => (len > 0 ? dz : -Math.cos(this.faceYaw));
        /* What the body is asking to travel at, and 0 when it is not asking to
           travel at all: the ask is what an arc is sized with, and a body that
           is being held still or carried by the water is not asking the ground
           for a hop. */
        const ask = len > 0 ? speed : 0;
        /* How far this body's box reaches ahead of the point it is moved about,
           along the way it is facing. This box is square along the ground
           (`size()`), so the answer is its half-width whichever way it faces;
           the animal's own body answers the same question with `hl + oz`, its
           rectangle being turned by its heading. Either way the reason is the
           same: an arc is asked for ground the FEET can stand on, and feet a
           hand's width short of a face while the shoulders are through it is the
           same body inside the rock a cell higher. */
        const frontOf = () => this.size()[0] / 2;
        /* The ground the next arc can land on, walked back from the ground the
           ask wanted -- the same hedge the animal's own step gate makes a few
           hundred lines below (`arcFit` in Creature.update), and the same
           answer: an arc cannot land on ground that is not there, so the body
           takes the largest arc that has a landing. This body asks it of the
           ground law its own step gate uses (`rockAt`/`standY`, the reach of
           its own legs), not of its collision box: the box is asked of the
           whole way by the resolver below, which stops a move at the first cell
           it would put it inside, and the two questions are different ones. Without
           this a body whose legs are its only way along the ground freezes an
           arc short of a face it cannot climb -- the launch the ask wanted has
           no landing, so no launch is given at all, and the body stands where
           the last arc left it: measured, 0.46 m off a wall the hand was
           reaching for. With it the arcs get shorter as the face comes nearer
           and the body comes up against it. */
        const arcFit = (hop, span) => {
          if (!(span > 0)) return 0;
          const ux = aimX(), uz = aimZ(), cell = Math.floor(this.y + 0.05);
          const hw = this.size()[0] / 2;
          const wallAt = (bx, bz) => {
            if (!rockAt(W, bx, cell, bz)) return false;      // no riser: level ground, or ground below
            return standY(W, bx, bz, this.y) - this.y > hopReach(hop, dt);
          };
          const landable = (x, z) => {
            /* every column the body's own box covers -- the same rectangle the
               resolver stops the body with below, and the same one the animal's
               step gate asks (`stand` in Creature.update). Asked of the centre
               column alone, a body is allowed to stand with its shoulders inside
               a wall, flush against the face: and a body with its face against a
               face has nowhere left to put the forward half of the arc that
               climbs it. */
            for (let bx = Math.floor(x - hw); bx <= Math.floor(x + hw); bx++)
              for (let bz = Math.floor(z - hw); bz <= Math.floor(z + hw); bz++)
                if (wallAt(bx, bz)) return false;
            return true;
          };
          for (let s = span; s >= MIN_HOP_GROUND; s -= ARC_PROBE)
            if (landable(this.x + ux * s, this.z + uz * s)) {
              /* The probe's step is how the search is made, not what the ground
                 is: refined between the landing that answered and the one a step
                 further that refused, it is the ground that is actually there.
                 Left coarse, the body stopped a probe's width short of the face
                 it was walking to -- 0.46 m off a wall its own box stands 0.25 m
                 from -- and the last part of the way was missing for no reason
                 the world gives. */
              let lo = s, hi = s + ARC_PROBE;
              for (let k = 0; k < 6 && hi - lo > 0.01; k++) {
                const m = (lo + hi) / 2;
                if (landable(this.x + ux * m, this.z + uz * m)) lo = m; else hi = m;
              }
              return lo;
            }
          return 0;
        };
        const capFor = (hop) => {
          if (!hop || !(ask > 0)) return undefined;
          const span = arcGround(cruiseLaunch(hop, ask, hop.period, dt), dt);
          const fit = arcFit(hop, span);
          return fit < span ? fit : undefined;
        };
        const keyFor = (hop) => {
          if (!hop || !this.grounded || heldUp)
            return { up: launchOf(L), carry: arcCarry(launchOf(L), ask) };
          return hopLaunchNow(hop, W, this.x, this.z, this.y, aimX(), aimZ(),
            ask, hop.period, dt, capFor(hop), undefined, frontOf()) || { up: 0, carry: 0 };
        };
        const legsFor = (hop) => {
          if (!hop || !this.grounded || heldUp) return null;
          return hopLaunchNow(hop, W, this.x, this.z, this.y, aimX(), aimZ(),
            ask, hop.period, dt, capFor(hop), undefined, frontOf());
        };
        /* How much sky the arc those legs would give has over the body's head --
           the same ask, over the same material table and the same reach of arc,
           that the animal's own body makes a few hundred lines below
           (`arcRoofRoom`). It is asked only of a body whose record states a
           `hop`, because that is the body the animal's answer belongs to: the
           animal takes a lower arc when the room has one and stands up out of
           the way when it does not, and the body worn from that animal is the
           same animal. A person's `jump` is not asked: a body that was never an
           animal keeps the answer its own record gives it. The cells a body
           stands across are the one part the two cannot share: this box is
           square along the ground, and the animal's is a rectangle turned by its
           own heading. */
        const roomFor = (hop, arc) => {
          if (!hop || !arc || !(arc.up > 0)) return arc;
          const half = frontOf();
          const cols = [];
          for (let bx = Math.floor(this.x - half); bx <= Math.floor(this.x + half); bx++)
            for (let bz = Math.floor(this.z - half); bz <= Math.floor(this.z + half); bz++)
              cols.push([bx, bz]);
          const room = arcRoofRoom(W, this.x, this.y, this.z, this.size()[1],
            aimX(), aimZ(), arc.carry, arc.up, cols);
          /* The room is asked before the arc is chosen, not as a lid on an arc
             already chosen. A roof that takes height out of an arc takes the
             ground that arc covers with it, and the step that arc was sized for
             stops being a step the body can take: an arc lowered onto a face
             lands on it, because the ground under a body mid-arc that turns out
             to be above its feet is the ground it lands on (see `hopLaunchNow`).
             So the arc is asked again with the room in it, and the second answer
             is the one the legs get. Where the room takes nothing -- the usual
             case, and the whole reason this is a second ask and not always a
             second ask -- the arc stands as it was. */
          if (room >= arcApex(arc.up, dt)) return arc;
          if (!this.grounded || heldUp) return arc;
          return hopLaunchNow(hop, W, this.x, this.z, this.y, aimX(), aimZ(),
            ask, hop.period, dt, capFor(hop), room, frontOf()) || { up: 0, carry: 0 };
        };
        if (inp.jump && this.grounded) {
          /* The push key asks for this body's own launch -- 8.3 m/s for the body
             you start in, and for a body whose record says `hop` the launch of
             the animal it is worn from: `launchOf`, because a hopper states its
             launch once, as the hop, the push key and the hop being the same
             legs. What the legs are asked to *reach* is the same question in both
             cases: the key at the foot of a step is the step the animal would
             take, so both go through `keyFor`, and both are asked the same
             question about the roof over them and take the highest arc the room
             has -- a frog under a low ceiling does not spring into it, pushed
             there by a key or not.
             And a body whose legs are an arc leaves the ground at the rate it
             left it *up* along the ground as well, in the direction it is going:
             one push, one arc, and no horizontal rate that the legs did not give
             (`arcCarry`). A key with no direction in it is a body asking for
             height, and it gets the arc straight up. A body that was never an
             animal keeps its own record's answer to both: its `jump` is not
             sized to a step, not lowered to a roof, and not thrown forward. */
          const arc = roomFor(L.hop, keyFor(L.hop));
          if (arc && arc.up > 0) {
            if (hop) pushArc(arc);
            pushOff(arc.up);
            /* One cycle to the next push-off, counted from this one. The air is
               inside it, not deducted from it: the arc's flight is already part
               of the ground this launch was sized to cover, and the rest of the
               cycle is the feet on the ground. Deducting the air here as well
               counted the same seconds twice and took the cycle below what the
               row states.
               The animal's own draw on the cycle -- the `jitter` a wild body
               asks its cadence with -- is not here: this body is being steered,
               and a cadence the person holding the keys cannot feel coming is a
               body that cannot be aimed at a gap. */
            if (hop) this.hopT = hop.period;
          }
        } else if (hop) {
          /* A body whose data says `hop` does not walk on land: it hops. The
             launch is an impulse and the arc is gravity's, so the animation and
             the displacement are the same event instead of two separate stories.
             Both of the numbers the animal owns come from the animal's row: the
             legs and what they are asked to reach, and `period` -- which for the
             frog is 0.9, the cadence the valley's own frogs are timed at, where
             the worn body used to have 0.22 and hopped four times as often as the
             animal it was wearing. A cadence is counted push-off to push-off, and
             the air is inside it: nothing can be pushed against up there. So the
             countdown the next push-off waits for is the whole of it, and the
             ground that whole cycle covers is the ground the launch was sized to
             cover -- which is what makes the ground a whole number of arcs covers
             the rate the row states.
             So the countdown runs through the flight and is not paused by it.
             Gated on the feet instead, it counted the same seconds twice -- once
             as the flight the launch was sized for and once as time the body was
             not standing -- and the body worn from a frog stood for 1.28 s
             between push-offs while its row states 0.9, covering its ground at
             1.27 m/s against the 1.8 its row states. Only the push-off needs
             feet: `legsFor` answers 0 for a body that has none under it, and the
             legs do not load for an arc it cannot make.
             What the body travels at is not a separate number either: it is what
             an arc of that launch and that cadence covers, which is why the
             launch is sized from the ask and not given outright (see
             `cruiseLaunch`). */
          if (heldUp) { this.hopT = 0; this.wind = 0; this.arcV = 0; this.arcLeft = 0; }
          else if (!(ask > 0.2)) {
            /* Nothing asked, nothing pushed off. An arc is the ground an ask
               wants by the next push-off; with no keys there is no ground wanted,
               and a body left standing on a one-block shore shelf hopped on the
               spot -- its feet on the ground in 42% of those frames, its height
               swinging 0.47 m -- which is a body nobody can stand still. The
               animal's own body answers the same ask the same way
               (`if (hop && ask > 0.2)` in `Creature.update`): a body with no
               errand stands. What this does not touch is a body ASKED for height
               and not for ground: the push key with nowhere to go still gets the
               whole extension of the legs, straight up (see `keyFor`). */
            this.hopT = 0; this.wind = 0;
          }
          else {
            /* The launch the ask wants on level ground, the fuller one for the
               step in front -- `legsFor` is the same ask the animal's own body
               makes of its row -- and the same answer about the roof over it: the
               wind is held to it, so the legs do not load for an arc the room
               would take out of them, and a body under a roof it cannot hop
               under stands at it instead of coiled ready for a jump it will not
               make. */
            const arc = roomFor(hop, legsFor(hop));
            this.hopT -= dt;
            this.wind = arc && arc.up > 0 ? Math.min(1, this.wind + dt / 0.16) : 0;
            if (this.hopT <= 0 && arc && arc.up > 0) {
              pushArc(arc);
              pushOff(arc.up);
              /* the whole cycle to the next push-off, air included -- see the
                 push-off above, and the cadence paragraph above that */
              this.hopT = hop.period;
              this.wind = 0;
            }
          }
        }
        // the wind-up: the legs load while the feet are on the ground
        this.crouch = hop ? this.wind : 0;
      }

      /* ---- the body points along the path it is taking ----
         A body on foot stays level whatever it does, because its feet hold it
         level. A body the water is holding up climbs nose-up and dives
         nose-down, and the angle is simply the one its own path makes. Nothing
         did this before: a frog crossing to the bottom swam along horizontally
         like a periscope -- the path curved and the body did not know it.
         `tilt` is nose-down positive, because that is the angle rotX takes, and
         it is eased like every other angle. */
      const hs = Math.hypot(this.vx, this.vz);
      /* `!onFoot` is the whole of the rule above, and it was missing: a body
         standing still read the one frame of falling the ground then undoes as
         a descent, and holds nose-down for as long as it stands there. What
         "on foot" means, and why it is not the flag the collision leaves
         behind, is argued where it is measured -- in the intended velocity
         block above. */
      const tiltWant = !onFoot && this.inWater && (hs > 0.3 || Math.abs(this.vy) > 0.3)
        ? Math.max(-0.6, Math.min(0.6, Math.atan2(-this.vy, Math.max(hs, 0.5))))
        : 0;
      this.tilt += (tiltWant - this.tilt) * N.ease(4.5, dt);

      // ---- displacement (sub-stepped) ----
      const wasGrounded = this.grounded;
      const vyBefore = this.vy;                 // the speed it arrives at the ground with
      this.grounded = false;
      let moved = 0;
      /* The frame a face stops spends none of the ground an arc owes (see
         `pushArc` above and the brace above `hopLaunchNow`): the rate the legs
         gave is put back every frame of the flight -- the resolver below takes it
         back for the frames the body cannot use it -- and the debt is reduced by
         the ground the body actually covered, not by the ground it was going to.
         Nothing else may set a body that is in the air along the ground either:
         the branch above excuses a body whose legs are an arc from the walk, so
         this is the only rate an arc has. */
      if (this.arcLeft > 0) { this.vx = this.arcX * this.arcV; this.vz = this.arcZ * this.arcV; }
      const arcFromX = this.x, arcFromZ = this.z;   // ground covered pays the arc's debt
      const steps = Math.max(1, Math.ceil((Math.hypot(this.vx, this.vz) * dt) / 0.25));
      /* There is no lift here, and there used to be one: when the move was
         blocked the box was raised by up to `step` -- 0.55 m for the body a
         person wears, 0.3 for the frog's -- and the move tried again from there.
         It could never reach anything. The ground of this valley is whole
         blocks, so the shortest riser anywhere is a metre, and a body standing
         on a surface is stopped by a block whose top is a metre over that
         surface until it is a whole metre up: less than that and the box is
         still inside the block. Measured, the lift gained 0.124 m in three
         seconds at a bank of one metre; and what it did buy was often nothing,
         because the retry from the lifted height was handed the speed the
         collision had already zeroed along the axis it had to stop, so the body
         never moved and the lift was kept anyway -- a human pressed against a
         wall stood on the ground in 34% of the frames and its height swung
         0.124 m within a second, and even with nothing built in front of it it
         was on the ground in only 89% with the same swing. That was the wobble
         at the water's edge. It was fixed twice over: first by re-handing the
         move and throwing a lift that bought nothing, and then by deleting it.
         A body of any shape in this valley climbs a metre with the launch its
         record states -- `jump` for a person, `hop` for the animal -- and stops
         at a face it cannot launch over. That is one law for every body, which
         is what the animal's own rows have always said. */
      for (let i = 0; i < steps; i++) {
        const sdt = dt / steps;
        this.axis('x', this.vx * sdt);
        this.axis('z', this.vz * sdt);
        this.axis('y', this.vy * sdt);
        moved += (Math.abs(this.vx) + Math.abs(this.vz)) * sdt;
      }
      this.moveAmt = moved;
      /* What the arc still owes is paid down by ground, not by frames. */
      if (this.arcLeft > 0)
        this.arcLeft = Math.max(0, this.arcLeft - Math.hypot(this.x - arcFromX, this.z - arcFromZ));
      /* Feet that are on a surface are standing on it.
         `axis` reports contact only for a move it had to stop, and a body is
         parked 0.0005 m off the face it last hit, and the cell below is only
         sampled once the feet are 0.001 inside it -- so a frame has to sink
         0.0015 m before the surface is seen again. Gravity covers that on land
         (0.006 m in a frame), so a body standing on the ground is reported
         standing on every frame of it. In water it cannot: buoyancy cancels most
         of the weight and the drag leaves a terminal speed of about
         0.05 m/s, 0.0008 m a frame, so the cell below is sampled once every
         three frames. A body wading where the lake is one block deep -- and the
         shore of Mirrorlake is 138 such columns -- is then reported airborne the
         whole time it stands on the bottom: air pose, and a third of the push it
         should have (accel 12 against 34). So after the displacement, feet
         within 2 cm of a solid and the body not rising means it is standing.
         2 cm is a hand's width off the surface -- far more than the 0.0015 m of
         parking and sampling the collision leaves, and
         far less than the fall a body accumulates once it has actually left a
         surface -- 0.006 m in the first frame of a drop, 0.10 m by the fifth --
         so a body that walked off
         a step is airborne again within a frame or two. */
      if (!this.grounded && this.vy <= 0 && this.colAt(this.x, Math.floor(this.y - 0.02), this.z)) this.grounded = true;
      /* The ground takes the rate back: the legs that gave the arc are what stop
         it, and with the arrival the pushing ends, so whatever ground the arc
         still owed is owed no longer. The animal's own body ends its `arcLeft` at
         the same moment, for the same reason. */
      if (this.grounded) { this.arcV = 0; this.arcLeft = 0; }
      // what the animation is allowed to know
      // eased, not snapped: a body resting on the ground flickers out of
      // `grounded` for a frame at a time, and a pose that hiccups with it looks
      // like a seizure rather than a breath
      const airWant = (this.grounded || this.inWater) ? 0 : 1;
      this.airAmt += (airWant - this.airAmt) * Math.min(1, dt * (airWant ? 7 : 11));
      /* and the water's answer, kept for the draw. Eased for the same reason: a
         body crosses the water's hold at the surface and at the lakebed, and a
         pose that snaps there shows the seam. `heldUp` is a property of the
         column, so it cannot chatter; `grounded` is the part that can, which is
         why the pose ramps instead of switching. */
      const heldWant = (this.inWater && heldUp && !this.grounded) ? 1 : 0;
      this.held += (heldWant - this.held) * Math.min(1, dt * 6);
      /* and the stroke's own gate, asked of the same two facts without the hold:
         a body in the water and not standing on its bottom has water in front of
         it. Eased for the same reason the hold is: the `grounded` flag flickers
         for a frame at a time where a body is wading, and wings that stop and
         start again on the frame is a body having a seizure. */
      const strokeWant = (this.inWater && !this.grounded) ? 1 : 0;
      this.stroking += (strokeWant - this.stroking) * Math.min(1, dt * 6);
      if (!this.grounded) this.crouch = 0;
      /* The landing's squash is spent, not stored: the frame the feet arrive is
         the frame the body is at its flattest, and the frames after it are the
         legs standing back up. Letting the decay run first, as it does here,
         leaves the arriving frame carrying the whole figure and every later frame
         a little less of it; running it after took a quarter of the figure off
         the one frame it belongs to -- measured, a body worn from a frog
         arriving at 4.02 m/s drew 0.020 instead of the 0.073 its own arrival
         rate states. */
      this.squash = Math.max(0, this.squash - dt * 3.2);
      if (this.grounded && !wasGrounded) {
        this.squash = Math.min(0.3, Math.max(0, -vyBefore) / 55);
        /* and the ground arrests the body's turn the way it arrests its fall.
           The pitch is the angle of the path the body was taking through the air
           or the water, and that path ends at the moment the feet arrive: a
           body that came down off a 1 m drop at 0.43 rad carried its nose for a
           quarter of a second afterwards with its feet flat on the floor, and
           the nose carried its toes 5 cm under it. */
        this.tilt = 0;
      }

      /* There is no boundary to be pushed back from. The world is an island in
         water that goes on, and what stops a body going further is the body: its
         breath, its skin, the fruit it is wearing and how long that fruit will
         stay worth eating. A wall at the edge of an array was never one of those. */
      if (this.y < -2) {
        game.damage(1.2, N.t('log.causeFall'));
        // if that was fatal, die() has already put this body back at the town
        // cellar; overwriting y with 30 would drop them onto the roof of it
        if (this.dead) return;
        this.y = 30; this.vy = 0;
      }

      /* ---- fright draining ---- The calm end of the state `Game.onCreatureTouch`
         fills. Both ends are figures of this body and are stated once, on
         `fright` in data/player.js; this branch only asks them. */
      this.fright = Math.max(0, this.fright - dt * HUMAN.fright.drain);

      walkGait(this, this.modelId, this.bodyScale(), this.walkMove(),
        this.x - gx, this.z - gz, Math.hypot(this.vx, this.vz), dt);
    }
  }

  /* ============================ creatures ============================ */
  function groundY(w, x, z, from) {
    for (let y = from; y > 0; y--) if (w.solidAt(x, y, z)) return y + 1;
    return 1;
  }
  /* The one statement of which cells are ground to a body: solid, and not part
     of a tree. Every rule that asks "is this a bank" rather than "is this a
     wall the body's shoulders go through" asks it here -- the crown of a column
     below, the riser in front of the feet, the roof over a step top, the cell a
     body is standing inside, the cell a body is asked to leave. Wood and leaves
     are excused because a body on foot walks through a bush with its shoulders
     in it and walks under a crown (docs/03 s5), and neither is ground to be
     pushed off. The other table, `FOLIAGE`, excuses only the leaf and is used
     where a trunk is a wall: the span a walker is refused, and the roof a hop is
     refused. Which of the two a rule uses is a decision about the rule, and each
     of them says so where it stands. */
  function rockAt(w, x, y, z) {
    return w.solidAt(x, y, z) && !N.TREE_BLOCK[w.get(x, y, z)];
  }
  /* The same column read again, but this time for the ground rather than for
     the highest thing in the way. A crown and the trunk that holds it up are
     solid -- a body can climb a tree and stand on it, and the player does --
     but they are not the surface of the valley, and an animal put down on one
     is an animal in a tree. The spawn code scans from the top of the world, and
     without this it found a canopy instead of the ground in 509 of 600 tries:
     bodies standing on spruce crowns at y=45 and frogs in the leaves. */
  function terrainY(w, x, z, from) {
    const bx = x | 0, bz = z | 0;
    for (let y = from; y > 0; y--) {
      if (rockAt(w, bx, y, bz)) return y + 1;
    }
    return 1;
  }
  /* The surface a body on foot actually stands on. Two things the plain column
     read gets wrong, and a body walking the ridge met both. `groundY` answers
     "the highest solid thing in this column", and a crown is solid, so foliage
     at feet level reads as a step: the body took the step, found the next block
     of the same crown at its new feet, took that step too, and climbed the tree
     -- measured over a day, one walker spent 22061 of 25200 frames standing on
     leaves 12 m above the ground, and went up 105 m and back down 114 m riding
     the crowns along the ridge. And the altitude used to look up 4 m while the
     step test looked up 3, so a needles block five blocks over its head answered
     to the altitude and not to the step, and lifted it there.
     So: the ground, with the crown over it ignored, read at the height of the
     feet rather than from the top of the column. A body stands on the top of
     the highest block level with its feet or a step above them, and walks
     through the bush with its shoulders in it. The bound is exact: a surface at
     most `LIFT_REACH` above the feet is the top of a block at most
     `floor(y + STAND_SCAN)`, which is what the step test implies -- when that
     test lets a step through, the two answers are the same block. */
  /* How far above its own feet a body may be raised onto the ground it is
     standing in front of. Six places ask it, and they are one law and not six
     numbers: the gate that decides a column is walkable, the gate that decides a
     riser is a step and not a wall, the read of the step in front of the feet,
     the test that a climb already begun is still worth finishing, the test that
     the body is standing on its own ground rather than floating over it, and the
     place that asks whether another body could be put down here at all. It is
     not the reach of a hop -- `hopReach` is that, and it is asked of the legs a
     row states instead -- and it is what bounds the column read above, which is
     written as its own literal because `LIFT_REACH - 1` is not `0.6` in binary
     floating point and that row is the difference between reading a block and
     not reading it. */
  const LIFT_REACH = 1.6;
  const STAND_SCAN = 0.6;
  /* How fast, as opposed as to how far. A body the world is holding inside itself
     is raised out of it at a rate, and there is one such rate for a frame and not
     one per rule that notices. Two gates find that body: the ground read, which
     sees ground above a body's feet, and the correction further down the same step,
     which sees rock at the body's own height. They agree about what the world is
     (`rockAt` in both, with crowns and trunks out of both) and about the surface to
     reach -- the ground read answers the top of the very cell the correction lifts
     to, or a higher one -- so they are one act asked at two addresses, and a frame
     that let both have their way would raise the body at twice the rate either
     states. It is not the animal's walking rate: a body inside a bank has no ground
     to walk on. Where the walk gate has asked for the step in front of it there is
     already a rate, and a body whose legs are an arc never has such an ask -- the
     gate clears it for every hopper, because a hopper takes a step with an arc and
     not by rising in place -- so those bodies fell through to a lift that closed a
     fraction of what was left, and a hopper standing in the sand of Mirrorlake was
     raised 0.325 m in its first frame, 19.5 m/s, before this was written. */
  const UNSETTLE_RATE = 6;
  function standY(w, x, z, y) {
    return terrainY(w, x, z, Math.floor(y + STAND_SCAN));
  }
  /* What ground a body's own box would be standing on: the highest ground of all
     the columns the box reaches. A body does not rest on the ground under its
     middle -- a wide body straddling a trough rests on the lip, and the world's
     own collision says so: the vertical part of `axis` takes the top of the
     highest solid layer its `colAt` footprint came into, over the same rectangle
     of columns this walks. So this is that reading, one law asked by the water
     too: the depth a column has to hold to carry a body (`waterHoldsUp`) and the
     floor a dive stops above (`bedFloor`) are both about the ground this body
     would stand on, and a body whose collision reads one ground and whose buoyancy
     reads another is one body with two floors -- which is what a 1.5 m body at a
     column of Mirrorlake had: the centre column answered a bed at 6.00 and the
     box answered a lip at 7.00, and the body was told to stop a quarter of a
     metre above a floor it was already standing a metre above.
     A body whose collision is this box is the only body with this box to ask.
     The herd's bodies stand in a rectangle turned by their own heading, and they
     ask the ground cell by cell at the places their own asks are about -- the
     step gate over every column that turned rectangle covers, the water and the
     altitude at the cell the body is standing in (03 s3) -- so they are asked
     where they are asked, and not through this function. What is one between the
     two bodies is the law, not the footprint: the floor of a dive is the ground
     *that* body's own feet would stand on, and a 1.5 m body and a 0.5 m body at
     one column have different feet. */
  function groundUnder(w, x, z, half, y) {
    const x0 = Math.floor(x - half), x1 = Math.floor(x + half);
    const z0 = Math.floor(z - half), z1 = Math.floor(z + half);
    /* The scan starts at the cell the feet are in, which is where the floor read
       of `axis` starts it and for the reason it gives there: "layers above the
       feet are a ceiling, not a floor". `standY` is the step's read and starts
       `STAND_SCAN` above the feet because a body is told about ground it is
       about to be lifted onto; asked of the ground a body is standing over, that
       slack reads the block over its head as its floor. It is not a corner case
       the water never reaches: a frogpear body stood at 6.50 over a bed whose
       face is at 6, with one block of stone let down so its face is at the
       body's crown, is told by that scan that its ground is 8.00 and its floor
       8.25 -- 1.75 m above where it stands, and above the top of the block: the
       lift below takes a body to the floor it is told about, so that is where it
       would put it, through the stone. Asked from the feet the same body reads
       the bed at 6, stops at 6.25 under the block, and never enters it. */
    const top = Math.floor(y + 0.001);
    let best = -1;
    for (let zz = z0; zz <= z1; zz++) for (let xx = x0; xx <= x1; xx++) {
      const g = terrainY(w, xx, zz, top);
      if (g > best) best = g;
    }
    return best;
  }
  /* Whether a water animal may be in this column at all -- the same test the
     spawn code makes, and the same `waterHoldsUp` every other reader asks: the
     column has to hold at least two blocks of water, so there is somewhere to
     hover. Testing one cell at the animal's feet instead
     rejects an animal that bobs, and testing only "is there water anywhere"
     lets it climb a one-block shelf, stand above the surface, and walk out of
     the lake on its own feet. Returns the water top, or -1 for "not water".
     The bottom of the water is searched from the water, not from over the film.
     It used to be searched from two cells over the film, which is the same
     answer wherever nothing stands in the column and a different answer
     wherever something does: the brick of the sunken tower pokes up through the
     film of the lake it stands in, the scan hits brick, and the column answers
     that there is no water in it at all. Twenty-five columns inside the disc
     the lamps belong to read that way -- film at 15, lakebed at 7, **8 metres**
     of water each -- and the field the lamps made sat exactly in the outline
     of that tower. One answer decides four things here: where a swimming body may
     be put, where it may be sent, which way it may swim, and the height it
     hangs at. So a bell that gets into one of those columns -- a shove from its
     own kind asks only about solid and stone -- is pinned on the lakebed under
     the tower for as long as it stands there, its crown **6.27 m** under the
     film over ten seconds and **7.11 m** at the deepest, for a body whose row
     says **1.2**; and of 90,000 lamp-frames in a five minute watch not one
     stood in such a column, because the picker and the step gate below kept
     the field out of columns they believed were dry. The field was therefore
     not in the outline the dex gives it, and any body the crowd put there was
     lost in it. Asking for the bed from the topmost water cell, rather than
     from two cells over the film, asks what a column of water actually
     answers, which is how deep the water is: **8 m**, and a bell hangs in it
     **1.2 m** under the film, under the brick and off the bed. */
  function waterColumn(w, x, z) {
    const wt = waterTop(w, Math.floor(x), Math.floor(z), w.h - 1);
    if (wt < 0) return -1;
    const gy = groundY(w, Math.floor(x), Math.floor(z), wt);
    return waterHoldsUp(wt + 1, gy) ? wt : -1;
  }
  /* How far a body's nose reaches from its own centre, in metres: the forward
     extent of the model at the scale the species draws at. Every model faces
     +z (see M4.faceY), so the farthest box the model carries along its own
     fore-and-aft axis is the nose. The step gate below asks it of the ground
     the nose is about to enter, because the centre column can stay wet while
     the nose is already in the brick: the snout of the lanternfish, when the
     valley still kept one, stood 1.6
     of its own units ahead of the centre (the tip of the snout box), 0.256 m
     at its 0.16 scale, and a column is a metre wide -- the centre stood in
     the wet column next door while the snout was drawn inside the brick of
     the sunken tower. Read off the model rather than kept as a constant here,
     because the claim is about the nose the model draws -- and off the species's
     own line, not off the body: the model a body carries is the one it is worn
     as, and a wild body is worn as nothing, so the step above read the nose of
     every wild body as 0 and asked the brick the snout stood in -- 0.31 m ahead
     of the frog's centre at the scale the frog draws at -- nothing at all. */
  const _nose = {};
  function noseReach(sp) {
    const r = _nose[sp.model];
    if (r !== undefined) return r * (sp.scale || 0.2);
    let reach = 0;
    const m = N.MODELS[sp.model];
    if (m) for (const p of m.parts) for (const b of (p.boxes || []))
      reach = Math.max(reach, b[2] + b[5]);
    _nose[sp.model] = reach;
    return reach * (sp.scale || 0.2);
  }
  /* The height a body of this kind hangs at in the column it stands in, in one
     place: the surface of that column less the body's own height less the depth
     its row states (plus any drift it rides on), and never through the bottom.
     The animal's own branch asks this every frame; the spawn code asks it once,
     because a body that swims has to be **born in the water**. It was not: the
     ten lamps of Mirrorlake were born standing on the lakebed under their own
     water, and their
     first frames were spent being pulled up to it -- the crown read **8.73 m**
     under the film at the animal's very first update, the height closed at
     **0.72 m a frame**, which is 14.4 m/s against the 2.2 m/s their own row
     swims at. A lamp born on the bottom and shot to the surface is not what a
     lamp does, and it made the depth a lamp hangs at depend on how long the page
     had been alive: read a few seconds after the world was made, the field's
     crown sat 3.4 m under the film (226 of 60000 lamp-frames over the 2.0 m the
     row and its bob allow), and read minutes later, 1.89 m and no frames over. */
  function hoverLevel(sp, w, x, z, tall, fromY, extra) {
    const wt = waterColumn(w, x, z);
    const gy = groundY(w, Math.floor(x), Math.floor(z),
      fromY === undefined ? w.h - 1 : Math.floor(fromY));
    return Math.max(gy + 0.35, floatLevel(wt + 1, tall, hoverOf(sp) + (extra || 0)));
  }
  /* The lowest thing a body could put its head through in the column it stands
     in: the underside of a roof, the beam of a room, the glass of a tower. The
     search starts over the body's own cell and answers `top` when it finds
     nothing, which is what the sky's own roof is: for a body in the open that is
     the top of the world, one block under the top of the grid, so a body is not
     allowed to stand with its head through the ceiling of the valley. Foliage is
     not in it -- a body on foot walks through a bush with its shoulders in it
     and through a crown (docs/03 s5).
     Which blocks a body is allowed through is a second question, and the two
     gates that ask this one answer it differently. `soft` is what the caller
     says this body may put its head through: the lift above asks out of the
     whole of `TREE_BLOCK`, because a body lifted over its own floor is a body
     on foot, and a crown is what a body on foot walks under; the hop gate asks
     out of `N.FOLIAGE`, because a frog hopping under a trunk is not hopping
     into the trunk -- which is what stops a hopper at the underside of a trunk
     rather than here.
     Left at one table for both, the ceiling over a body's own floor was asked out
     of `TREE_BLOCK` and read as open sky: a 0.43 m frog standing under a trunk
     block set two cells over that floor found room for an arc there, hopped, and
     put its head 0.16 m into that block in 14 of 480 frames, its nearest wood at
     0.11 m. The walk gate beside it does not answer this -- 14 frames before that
     gate was fixed and 14 with only that gate fixed, 0 once this one was asked.
     The arc that does not fit is not launched at all now, which is what the law
     beside it already said a frog under a low roof does: it walks. And it is the
     material that decides it, not the height, which is only visible where the
     block stands -- and only where the height is what decides. Counted in the
     column the block stands over, with nothing in front of the body's feet, that
     control now reads the same for both materials, because the launch has begun to
     be sized by what is in front of the legs: such a block leaves
     0.57 m of headroom over this 0.43 m body and an arc of these legs never gets
     that body more than 0.161 m off its floor on an errand of its own, so a ceiling
     an arc passes half a metre under is a roof to nothing -- crown and trunk, one
     body, one draw, one geometry, agreeing in every figure the rig takes (11 frames
     in that column, 10 arcs, 110 airborne frames, 6.18 m of ground). What does
     separate them is a passage: three cells with that ceiling over them, rock walls
     either side, and a step of a metre closing the end, so the only way out is an
     arc and the only thing that decides whether these legs can give it is the room
     over the body's own head. Under the crown that body takes the launch the step
     asks -- 6.924 m/s, the 7.307 of `launchForApex(1.10, dt)` less the frame that
     spends gravity -- stands on the step, and is gone (81 frames up there, 418 of
     the window spent more than a metre from where it started, 7.36 m of ground
     covered). Under the same geometry of trunk it never gets a foot on that step,
     spends every one of the window's 480 frames in the column the block stands
     over, and covers 0.43 m: the room leaves 5.088 m/s (4.705 recorded) and the step
     asks 7.307 (6.924 recorded), so that step is not a step these legs may take
     there, and the body is thrown its face-hedge instead -- an arc sized on the
     ground short of the face, of which there is none, so the ask falls to its floor
     of 0.12 m and the shortest arc these legs give, 0.958 m/s, is nine of the ten
     launches that window records. The headroom and the riser are identical both
     times; only the material decides whether the room counts. */
  function roofY(w, x, z, from, top, soft) {
    const allow = soft || N.TREE_BLOCK;
    for (let y = from; y < w.h; y++)
      if (w.solidAt(x, y, z) && !allow[w.get(x, y, z)]) return y;
    return top;
  }
  /* The cell convention: which cell holds the top of the water, or -1 where the
     column holds none. Most of this file wants the cell -- how deep the column
     is, whether the bottom is within reach, whether the body can stand on it --
     but the surface itself is a *height*, the top face of that cell, and the two
     conventions are one apart: the world answers that one (`liquidSurfaceAt` in
     world.js), and both say -1 for no water. The float level used to be taken
     off the cell index, which set every body the water holds a full block under
     the surface: the wild frogs of Mirrorlake hang just under the surface and
     down into deeper water (see the dive cycle below) and at (56.5,94.5) they
     were 1.3 m down and 4 m down, and the body you wear with them. Three reads
     have now been pulled off this index and onto the film: the level a body of
     that shape would float at, and the level a wild aquatic animal hovers at -- each of
     which subtracts or compares a number of metres, and each of which was
     therefore a block wrong while it was reading a cell. Anything that counts
     blocks or asks about a cell keeps using this one. */
  function waterTop(w, x, z, from) {
    for (let y = from; y >= 0; y--) if (w.liquidAt(x, y, z)) return y;
    return -1;
  }
  /* The part of the day a species is out (docs/03 s3: day / night / both /
     dusk). `night` is the curve the sky already runs on: 1 at midnight, 0 at
     noon. A dusk animal is out at both ends of the day and asleep at noon and
     at midnight -- no species in the valley uses 'dusk' right now, but the word
     is part of the setting, so the branch stays for the next animal. */
  function outAt(sp, night) {
    switch (sp.active) {
      case 'night': return night >= 0.35;
      case 'day':   return night < 0.65;
      case 'dusk':  return night > 0.3 && night < 0.85;
      default:      return true;                 // 'both', and anything unknown
    }
  }
  /* Two bodies in the same place. Each one's footprint is the rectangle its own
     trunk is carved from (MODEL_W), turned by its heading: the pair is in one
     place when no direction separates the two rectangles, and the direction they
     overlap least along is the way out -- the shortest way, and the one that
     fights the way either of them is going least. A body is not a circle: a
     person is 0.41 m side by side and 0.29 m nose to nose, and a frog 0.34 and
     0.41, so the distance that keeps two of them apart depends on the way they
     stand to one another.
     TOUCH is how far into a neighbour a body may get at all: two lamps drifting
     against one another touched, and a body that has been pushed into one is let
     back out the way it came rather than refused every place it could go. */
  const TOUCH = 0.02;
  function bodyClash(a, ax, az, b) {
    /* Two bodies share a space only where they also stand at one height. The
       height they have in common has to be more than a graze before it counts:
       a lamp riding on the crown of another's bell was on top of it, not inside
       it, and pushing the pair apart sideways for a 5 mm graze moves a body half
       a metre for nothing. Measured against the shorter of the two bodies, so
       the rule is the same for a frog and for a person. */
    const vOver = Math.min(a.y + a.tall, b.y + b.tall) - Math.max(a.y, b.y);
    if (vOver <= 0.15 * Math.min(a.tall, b.tall)) return null;
    const s = Math.sin(a.yaw), k = -Math.cos(a.yaw);       // a's forward; its right is (-k, s)
    const s2 = Math.sin(b.yaw), k2 = -Math.cos(b.yaw);
    const axc = ax + s * a.oz - k * a.ox, azc = az + k * a.oz + s * a.ox;
    const bxc = b.x + s2 * b.oz - k2 * b.ox, bzc = b.z + k2 * b.oz + s2 * b.ox;
    const dx = axc - bxc, dz = azc - bzc;
    let pen = 1e9, ux = 0, uz = 0;
    for (const c of [[s, k], [-k, s], [s2, k2], [-k2, s2]]) {
      const ra = a.hw * Math.abs(-k * c[0] + s * c[1]) + a.hl * Math.abs(s * c[0] + k * c[1]);
      const rb = b.hw * Math.abs(-k2 * c[0] + s2 * c[1]) + b.hl * Math.abs(s2 * c[0] + k2 * c[1]);
      const d = dx * c[0] + dz * c[1];
      const p = ra + rb - Math.abs(d);
      if (p <= 0) return null;                    // a direction separates them
      if (p < pen) { pen = p; ux = c[0]; uz = c[1]; }
    }
    if (Math.abs(dx) < 1e-4 && Math.abs(dz) < 1e-4) {
      /* Dead on top of one another: every way out is the same distance, and two
         bodies that both pick the same one never part. Each picks its own. */
      const t = ux; ux = -uz; uz = t;
    } else if (dx * ux + dz * uz < 0) { ux = -ux; uz = -uz; }
    return { pen, ux, uz };
  }
  /* The columns a body's own rectangle stands across. A body is not a point and
     this file has never treated it as one: `N.MODEL_W` gives every model the
     rectangle its trunk is drawn from, the constructor keeps it on the body as
     `hl`/`hw` with the model's own centre offset as `ox`/`oz`, the keep-apart law
     above moves bodies apart by exactly that pair, and `arcRoofClear` is handed it
     when a launch is asked what is over it. What was missing is the ground. The
     step gate asked the single column under the body's centre, and an animal was
     drawn through every wall it was stopped by: at a bank two metres tall the
     rectangle the model draws was inside the bank in **220** frames of a 420-frame
     window, the deepest corner **0.208 m** through the face, which is half a frog;
     at the same bank with a shore of water in front of it, **308** frames and
     **0.226 m**; at walls three, five and nine cells long, walked at with an
     errand held past the far end of them, **74** and **158** frames of 2400 in the
     face at the two longer ones -- the three-cell wall was added to the rig to ask
     whether the length of the wall changed the answer, and it never stood inside one
     either way -- **69** and **156** of those a centimetre or more through the face,
     the deepest **0.232** and **0.228 m** -- while the column its feet stood in was
     inside the rock in **0** frames of every one of those runs, which is the whole
     of why the gate never saw it. Asking the ground of the rectangle instead takes
     every one of those counts to **0**, and leaves the road the body takes where it
     was: the same way round every wall, half a second later at each length, because
     the body now stands off the face instead of in it. Both measurements are in
     test/play.js -- the bank rig and the wall rig -- and the count of the first
     version of that measure, which read **222** frames before and after the change
     because it asked a rectangle 3.6 cm ahead of the one the model draws, is told
     there too.
     The centre of that rectangle is not the position, either -- `ox`/`oz` are where
     the model's boxes sit about the position -- and the half-spans are taken along
     and across the heading and turned back into the axes, which is the same pair
     of lines the roof ask carries and the keep-apart law carries as `ra`/`rb`. */
  function bodyCells(c, x, z) {
    const fx = Math.sin(c.yaw), fz = -Math.cos(c.yaw);
    const cx = x + fx * c.oz - fz * c.ox;
    const cz = z + fz * c.oz + fx * c.ox;
    const hx = c.hl * Math.abs(fx) + c.hw * Math.abs(fz);
    const hz = c.hl * Math.abs(fz) + c.hw * Math.abs(fx);
    const cells = [];
    for (let bx = Math.floor(cx - hx); bx <= Math.floor(cx + hx); bx++)
      for (let bz = Math.floor(cz - hz); bz <= Math.floor(cz + hz); bz++) cells.push([bx, bz]);
    return cells;
  }
  /* Can this body be put at (x, z) at the height it is at? The same question the
     body's own movement asks of a step, asked of a place it has already been
     pushed into by another body: a body that cannot leave the water needs a
     column with somewhere to hover; a body on foot needs a surface under its
     feet that is not a wall it cannot climb. The world keeps the last word: a
     body is never shoved into a bank or out of the lake it cannot leave,
     because another body was standing where it wanted to be. */
  function bodyRoom(w, c, x, z) {
    const bx = Math.floor(x), bz = Math.floor(z);
    if (bx < 7 || bz < 7 || bx > w.w - 7 || bz > w.d - 7) return false;
    /* A body that cannot leave the water is asked the water's own question --
       the same one its movement asks, and the same one its spawn makes: is this
       a column with somewhere to hover. Asking it instead about the single cell
       at the body's feet refuses a body that bobs at the surface, which is every
       one of them: the shove out of a neighbour was refused in every direction
       for a lamp riding high in its column, and it stayed 0.49 m inside the
       other lamp for as long as they both rode there. And the cell the body
       would occupy must not be stone: the shove is the one movement that never
       asks where the body is going to stand, and a column can answer wet with
       the body's cell solid -- a pocket under the stone rim of the island, the
       same pocket the step gate's cell ask refuses; see there. */
    if (c.isAquatic()) return waterColumn(w, x, z) >= 0 && !bodyInSolid(w, c, x, z);
    /* A body on foot is asked the same question its own movement asks of a step:
       the surface it would stand on may not be a wall it cannot climb. The drop
       is not part of the question -- a body walks off a ledge the same way it is
       pushed off one, and the ground takes the answer from there. Bounding the
       drop as well (the first version did) refused every shove for a frog
       floating a metre and a half over the bed of the lake, which is where every
       frog in Mirrorlake spends the afternoon.
       The seam, stated rather than hidden: this ask is still the body's point, and
       the step gate above it is now its rectangle. A shove is not a step -- it is
       the undoing of an overlap that already exists, into whichever of the places
       about it the world will have -- and no rig on this tree measures what a box
       would cost here, which is the honest reason it was left: the failure the
       paragraph above is written around is an ask that refused more places than it
       should have. What every other ask of the world now shares is the
       rectangle: `bodyClash` asks one body's box of another's, `arcRoofClear` is
       handed the cells an arc is spent over, the step gate asks the ground of the
       body's own rectangle, and only this destination is still asked of a point. */
    const gy = standY(w, bx, bz, c.y);
    return gy - c.y < LIFT_REACH && !w.solidAt(bx, Math.floor(gy + 0.2), bz);
  }
  /* The cell a body would be standing in at a place, asked of the body's own
     height rather than of the ground under it. `bodyRoom` above answers the
     question of a body on its feet -- may it stand here, is the surface within a
     step and clear above it -- and that answer is the wrong one for a body that
     is not standing, or for a column whose bank runs up past its head: a frog
     floating 1.2 m off a lakebed next to a shore of stone gets "yes, that ground
     is one step up and nothing over it" while the cell it is put in is the stone.
     Foliage is not in this, for the same reason it is not in the law that keeps a
     body out of the world: a body on foot walks through a bush with its shoulders
     in it, and a crown is not a wall. */
  function bodyInSolid(w, c, x, z) {
    const bx = Math.floor(x), by = Math.floor(c.y), bz = Math.floor(z);
    return rockAt(w, bx, by, bz);
  }

  class Creature {
    constructor(spec, x, y, z) {
      this.sp = spec;
      this.x = x; this.y = y; this.z = z;
      /* How tall this body stands in the world: the model's own height at the
         scale the data gives it. A body is not a point, and a rule that only
         asks about the cell a body's feet are in lets a body walk into a room
         with a low roof and stand there with its head in the beam. */
      this.tall = (N.MODEL_H[spec.model] || 4) * (spec.scale || 0.2);
      /* And how wide the same body is: the rectangle its own trunk takes up, at
         the scale the data gives it, with the offset that rectangle sits at from
         the origin the body is drawn about. A body is not only tall, and a rule
         that only asks about the cell its feet are in lets two of them stand in
         one place -- which is what "one walked through the other" is. */
      const mw = N.MODEL_W[spec.model] || [0.5, 0.5, 0, 0];
      this.hw = mw[0] * (spec.scale || 0.2);        // across it
      this.hl = mw[1] * (spec.scale || 0.2);        // along it
      this.ox = mw[2] * (spec.scale || 0.2);
      this.oz = mw[3] * (spec.scale || 0.2);
      this.yaw = Math.random() * 6.28;
      this.t = Math.random() * 10;
      this.phase = Math.random() * 6.28;
      this.state = 'wander';
      /* where the body is in its own stride: kept by the ground it covers, not by
         the clock (see walkGait above) */
      this.gait = null;
      this.tx = x; this.tz = z;
      this.pause = Math.random() * 3;
      this.speed = 0;
      this.alarm = 0;
      this.homeX = x; this.homeZ = z;
      /* What a body likes, per body, so that a flock is not a formation. A
         frog holds a depth of its own in the water, and comes back up to
         breathe on a cycle of its own. Without these two numbers every frog in
         the valley swims in one line 30 cm under the surface, which is what
         the report "it can only swim in a fixed layer" is: measured over ten
         minutes of the world running, all twelve frogs of that crowd -- the
         valley drives five now -- sat at a mean depth of 0.30 m, every one
         of them. */
      this.diveTo = 1.5 + Math.random() * 2.5;     // how deep this frog hangs, m under the surface
      this.diveRate = 0.05 + Math.random() * 0.10; // and how fast that cycle runs, rad/s
      /* The pace this body spends its errands at: the speed a body moves at is
         the cruise its own record gives times this, so a flock moves at
         several speeds at once and never in step. 0.85-1.25: enough of a
         spread that two neighbours part and re-join over an afternoon, not so
         much that one species reads as two kinds. */
      this.pace = 0.85 + Math.random() * 0.4;
      /* The ring the water keeps a body of a species that names one: the
         landmark its habitat's zone names (`orbit.at`), a lane of its own
         between `orbit.r0` and `orbit.r1` metres out, and the arc of the ring
         the body has covered so far, so every errand in the water is the next
         arc the body has not yet run. The angle runs one way for every body,
         which is what "the frogs swim round the isle" is; the lane is the
         body's own, which is what keeps them out of one another's way. */
      this.orbit = null;
      if (spec.orbit) {
        /* The lane this body keeps for itself, and the two ways a row can say
           where a lane is. `at` naming a landmark of the habitat's zone is the
           one the lake uses: a circle of radius r0..r1 round that point. `at:
           'coast'` is the one the open sea needs: there is no landmark out
           there, and a circle of fixed radius round the island's centre is not a
           lane the animal could keep, because the island's shore is not a circle
           -- it runs from 126 m to 175 m out, and a ring at 140 m would put a
           body inland on half of it and 50 m out to sea on the other. So this
           lane is an **offset from the shore**, resolved at the bearing the next
           arc lies on by the same rule the map's own coast polygon is drawn
           from. */
        const lane = spec.orbit.r0 + Math.random() * (spec.orbit.r1 - spec.orbit.r0);
        if (spec.orbit.at === 'coast') {
          const c = N.COAST;
          this.orbit = { cx: c.cx, cz: c.cz, lane, coast: true,
            a: Math.atan2(z - c.cz, x - c.cx),
            errand: false };
        } else {
          const zone = N.ZONE_BY_ID[spec.habitat[0]] || {};
          const at = zone[spec.orbit.at];
          if (at) this.orbit = { cx: at[0], cz: at[1], r: lane,
            a: Math.atan2(z - at[1], x - at[0]),
            errand: false };      // the errand the body holds at birth is its birthplace, not an arc of the ring
        }
      }
      // the vertical velocity, and the same three signals the player carries, for
      // the same reason. It has to be a number: a body that is born on land and
      // hops integrates a fall out of this field on its very first frame.
      this.vy = 0;
      this.airAmt = 0; this.crouch = 0; this.squash = 0; this.hopT = Math.random() * 1.2; this.wind = 0;
      /* and the horizontal half of an arc: the rate the legs threw this body
         along the ground with at their last push-off, the heading they threw it
         along, and the ground of that arc still left to fly. They are kept on the
         body because they are the body's own momentum, and nothing but the
         ground, a face, or the water can change them. Born at rest: a body that
         has not pushed off has never had one. */
      this.arcV = 0; this.arcYaw = 0; this.arcLeft = 0;
      // and the fourth: the draw needs to know whether this body is moving
      // through water, because a body built for water kicks instead of walking
      this.inWater = false;
      // and the fifth: a body in the air or in the water turns by tilting
      this.bank = 0;
      // and the signed rate that tilt comes from, which is also what a swimming
      // body kicks its outside leg with (see `turn` in partAngles)
      this.bend = 0;
      // and the sixth: the water is holding this body up, not the ground under it
      this.held = 0;
      // and the sixth's question apart from it: does this body have water to push
      this.stroking = 0;
      // and the seventh: the same body points along the path it is taking
      this.tilt = 0;
      /* and the eighth: the surface of the step this body is in the middle of
         climbing, or null. It is not a per-frame decision: a body that has begun
         to raise itself onto a step has to be allowed to finish, or it takes the
         step at the height it had got to and ends up inside the ground. */
      this.climbTo = null; this.climbRate = 0;
      /* The ninth: which side of a face this body has begun to go round it with,
         as the direction of the step it chose doing so. Also not a per-frame
         decision, for the reason the contour that sets it states: an errand dead
         ahead of a face scores the two ways along that face equal and opposite, so
         re-choosing between them each frame cancels itself. Spent the frame this
         body takes its own step instead. */
      this.roundSide = null;
      /* The backstop a body that cannot get to where it is going is read
         against: where the body stood 120 of its own frames ago. Kept in the
         body's own frames so the read does not depend on the rate the loop
         drives it. See the read at the end of the update. */
      this.watchX = null; this.watchZ = null; this.watchF = 0;
    }
    attitudeTo(formId) {
      const a = this.sp.attitude || {};
      // the player's form is a fruit id; attitudes are keyed by species id
      const species = this.speciesOf(formId);
      const key = formId !== null && formId !== undefined ? species || formId : 'human';
      if (a[key]) return a[key];
      if (species && a.self && species === this.sp.id) return a.self;
      return a.default || 'ignore';
    }
    /* which species the player is wearing right now (null in a human shape) */
    speciesOf(formId) { return formId && N.FRUIT_BY_ID[formId] ? N.FRUIT_BY_ID[formId].creature : null; }
    isAquatic() { return this.sp.locomotion === 'water'; }        // never leaves the water
    isAmphibian() { return this.sp.locomotion === 'amphibian'; }  // bank and water both

    update(dt, pl, world, game) {
      const sp = this.sp;
      this.t += dt;
      const gx = this.x, gz = this.z;      // where the stride starts from
      const dxp = pl.x - this.x, dzp = pl.z - this.z, dyp = pl.y - this.y;
      const dp = Math.sqrt(dxp * dxp + dzp * dzp + dyp * dyp);

      // time of day
      const sleeping = !outAt(sp, game.night);

      const att = this.attitudeTo(pl.form);
      const alert = (sp.alert || 12) * (pl.formDef.stealth || 1);

      let want = 0, tgtX = this.tx, tgtZ = this.tz;
      if (sleeping) { this.state = 'sleep'; }
      else if (att === 'flee' && dp < alert) {
        this.state = 'flee';
        tgtX = this.x - dxp * 4; tgtZ = this.z - dzp * 4;
        this.alarm = 1;
      } else if (att === 'hostile' && dp < alert * 1.4 && dp > 1.2) {
        this.state = 'chase';
        tgtX = pl.x; tgtZ = pl.z;
        this.alarm = 1;
      } else if (att === 'curious' && dp < alert && dp > 3) {
        this.state = 'approach'; tgtX = pl.x; tgtZ = pl.z;
      } else if (this.state !== 'wander') { this.state = 'wander'; }

      if (this.state === 'wander') {
        const patrol = this.orbit && this.inWater;
        if (patrol) {
          /* In the water the errands of a body that names a ring run the ring:
             the body is sent to the next arc of it, and to the arc after that
             when it reaches the one it is on. That is the whole of the patrol:
             the arc is short (20-45 degrees), the errand is retired the moment
             it is reached, and the body runs the ring at the pace it spends it
             at, without waiting at one spot on it. A re-pick on the clock does
             not run the ring -- measured with the re-pick on a 0.4-1.6 s
             pause, the errand ran the ring at 0.575 rad a second, nineteen
             times the turn a frog makes of it at its own speed, and the body
             chased the arc the way a swimmer chases a point that keeps moving:
             it spent the hour inside the ring, lapping the middle of the water
             the ring is round, and the ring was only ever the errand's. */
          const ex = this.x - this.tx, ez = this.z - this.tz;
          const reached = this.orbit.errand && ex * ex + ez * ez <= 1;
          if (!this.orbit.errand || reached) {
            /* The ring the water keeps this body in: the landmark its own
               record names, at the lane the body was born with, plus a swing of
               the lane's own width, and the arc of the ring the body has
               covered so far, so the errand is the next arc the body has not
               yet run. The angle advances, never retreats, and every body of
               the species advances it the same way -- that is what "they swim
               round the isle" is. The arc is spent only if the water answers
               it: a column that answers dry, or a body of the world in it,
               keeps the errand the body is on rather than taking it to dry
               ground, and the angle the body has covered so far is not spent
               on an errand it will not take. */
            const a2 = this.orbit.a + 0.35 + Math.random() * 0.45;
            const jitter = (Math.random() * 2 - 1) * 0.05;
            const rr = this.orbit.coast
              ? N.shoreWater(a2) + this.orbit.lane * (1 + jitter)
              : this.orbit.r * (1 + jitter);
            const wx = this.orbit.cx + Math.cos(a2) * rr;
            const wz = this.orbit.cz + Math.sin(a2) * rr;
            if (waterColumn(world, wx, wz) >= 0 && !bodyInSolid(world, this, wx, wz)) {
              this.orbit.a = a2;
              this.tx = wx; this.tz = wz;
              this.orbit.errand = true;
            }
          }
        } else {
          if (this.orbit) this.orbit.errand = false;   // a pick on the ground is not a pick of the ring
          this.pause -= dt;
          if (this.pause <= 0) {
            this.pause = 2 + Math.random() * 6;
            /* Where an errand is picked from: a disc round the home the body was
               born on. A body in the water of a species that names a ring does
               not get here: its errands run the ring, in the branch above, off
               the landmark its own record names. */
            const r = this.isAquatic() ? (sp.spread || 6) : 14;
            const ox = this.homeX, oz = this.homeZ;
            /* How far off its own heading an errand may fall. A body that swims
               swims forward: the default errand is the course it is already
               holding, a place a little further along that way. The pick is
               asked for a bearing, and the bearing is a turn, of which a body
               makes three kinds. Most keep the course -- the errand falls inside
               a narrow cone round the heading the body is travelling, and the
               body goes on the way it was going; a smaller share may bend it, a
               visible turn; and only one in ten lets the errand fall
               anywhere, which is the only kind a wide turn comes from. What this
               replaces was a place picked uniformly in the disc whatever way the
               body faced: every new pick faced the body a few degrees to a full
               about-face, and a body that re-picks every two to eight seconds
               spent its afternoon in short dashes and hard turns. The rate the
               bend is held to stays the species' own -- the complaint was the
               pattern of the errands, not the arc. */
            const u = Math.random();
            const cone = this.isAquatic() ? 0 : (u < 0.65 ? 0.35 : (u < 0.9 ? 1.0 : 0));
            /* A creature that cannot leave the water should not be sent to a
               place where it would have to. Pick again until the ground is wet;
               after a few tries take it anyway, so a lake that has somehow
               drained does not leave a water animal standing still. */
            let tx = this.homeX, tz = this.homeZ, bestRoom = -1, lastX = tx, lastZ = tz;
            for (let tries = 0; tries < 8; tries++) {
              // a spread is a radius, not a half-width: the same shape the spawn sampled
              const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * r;
              const ux = ox + Math.cos(a) * rr, uz = oz + Math.sin(a) * rr;
              lastX = ux; lastZ = uz;    // the in-disc sample: what a pick that finds no ground in front takes
              let cx, cz;
              if (cone > 0) {
                /* The ground in front of the body: the bearing its heading plus a
                   turn no wider than this kind of errand allows, at a distance
                   the disc allows. The disc itself keeps the answer in the
                   region the species belongs to -- a body at the edge of its
                   ground, facing out of it, finds no ground in front, takes the
                   uniform sample, and gets the wide turn the edge owes it. */
                let inFront = false;
                for (let s = 0; s < 4 && !inFront; s++) {
                  const b = this.yaw + (Math.random() * 2 - 1) * cone;
                  const d = Math.sqrt(Math.random()) * r;
                  cx = this.x + Math.sin(b) * d; cz = this.z - Math.cos(b) * d;
                  inFront = Math.hypot(cx - ox, cz - oz) <= r;
                }
                if (!inFront) continue;
              } else { cx = ux; cz = uz; }
              /* and the body's own cell at the body's own height: an errand into
                 a column that answers wet with the body's cell stone is an
                 errand to stand in the stone, and the correction's way out of
                 the stone is sixteen metres up the pillar (see the step
                 gate's cell ask). */
              if (this.isAquatic() && (waterColumn(world, cx, cz) < 0 ||
                  bodyInSolid(world, this, cx, cz))) continue;
              /* And of the places it might go, the one with most room in it. An
                 errand into the middle of a clump of its own kind is an errand to
                 stand inside a neighbour: the ten lamps picked from a disc round the
                 tower the size of two of them, so an errand picked at random was an
                 errand into a neighbour, and the pair that met there stayed there
                 -- they were measured 0.54 m inside one another, one bell drawn on
                 top of another. */
              let room = 9;
              if (game && game.creatures) {
                for (const q of game.creatures) {
                  if (q === this || q.sp.id !== sp.id) continue;
                  /* where it stands, and where it is going: a place another body
                     is swimming to is claimed, whether that body is in it yet or
                     not. Two lamps whose errands were picked 4 m apart walked into
                     one another because each was measured against where the other
                     stood at the moment the pick was made. */
                  const d = Math.min(Math.hypot(q.x - cx, q.z - cz),
                                     Math.hypot(q.tx - cx, q.tz - cz));
                  if (d < room) room = d;
                }
              }
              if (room > bestRoom) { bestRoom = room; tx = cx; tz = cz; }
              if (bestRoom >= r * 0.4) break;      // roomy enough: stop looking
            }
            if (bestRoom < 0) { tx = lastX; tz = lastZ; }
            this.tx = tx; this.tz = tz;
          }
        }
        tgtX = this.tx; tgtZ = this.tz;
      }
      /* Herd: the herd is how prey survives. One that has wandered more than
         about a throw of it walks back towards the middle of its own kind --
         a middle the game works out once a tick, not once per animal. The
         middle of the kind is a law of the ground: a body that swims the ring
         the water keeps it in is not pulled to a middle that sits in the
         middle of the water it does not swim. */
      if ((sp.herd || 1) > 1 && this.state === 'wander' && !this.inWater) {
        const h = game.herdCentres && game.herdCentres[sp.id];
        if (h && h.n > 1 && Math.hypot(h.x - this.x, h.z - this.z) > 12) { tgtX = h.x; tgtZ = h.z; }
      }
      this.alarm = Math.max(0, this.alarm - dt * 0.3);

      // movement
      /* Whether the water has this body in it: the surface of the column it
         stands in is above its feet. The cell test this used to be asks which
         cell the body's own height happens to land in, and a body floating at
         the surface bobs across that boundary; the surface of the column is a
         property of the place. It is the same question the body you wear asks,
         in Player#update. */
      const wSurf = world.liquidSurfaceAt(Math.floor(this.x), Math.floor(this.z));
      const inWater = wSurf >= 0 && this.y < wSurf;
      this.inWater = inWater;      // the draw reads it: a body built for water kicks, it does not run
      // and the draw reads the surface itself: see Player#update, and uWaterY in engine.js
      this.wSurf = wSurf;
      // cleared for the frame, and set by the branch that is actually in the water's hold
      this.held = 0;
      /* What is holding this body up: the water of the column it stands in, or
         its own feet. One law (`waterHoldsUp`), asked twice a frame -- by the
         step gate below and by the altitude below that -- and each of them asks
         it of the ground at the position it is itself deciding about, because a
         body may cross the edge of a column between the two. Asking the same
         question twice is the point: a body must not be told it is swimming by
         one rule and lifted up a bank like a crate by the other. Whether the
         species belongs to the water at all belongs to the body, not to the
         column: a body that was not built for the lake stands in it whatever the
         depth of it, and nothing holds it up. The body worn from this animal asks
         that same word of this same record (`builtForWater`, in `Player#update`),
         which is the reason the animal and the body worn from it cannot answer it
         in two different ways -- the breath is not in it anywhere, because the
         breath decides how long a head may stay under, not whether the water
         carries the body. */
      const waterHolds = (bed) => this.isAmphibian() && inWater && waterHoldsUp(wSurf, bed);
      /* Which of the three ways a body of this shape moves this frame, answered
         once, before anything that depends on the answer. There is the water of
         the column, when that water is deep enough to hold a body of this kind
         up; an arc the body's own legs gave; and its own feet. The first is a
         fact about the column and about the species, and it decides the cruising
         speed, the step gate and the stroke alike. The second is kept on the
         body as `arcV`, the horizontal rate the legs threw it with at the last
         push-off: in the air there is nothing to push against, so that rate is
         the body's until the ground takes it back or the water does -- it is
         momentum, not a wish, and it came from the row. The third is what is
         left, and for a body whose record says its legs are an arc it means
         standing still: such a body has no walk (see the arc law at the top of
         this file, and `anim:'walk', stride:0` in models.js), and sliding it
         along at its cruise with those legs folded is the shape the game was
         reported for. */
      const bedHere = standY(world, Math.floor(this.x), Math.floor(this.z), this.y);
      const carried = this.isAquatic() || waterHolds(bedHere);
      const hop = sp.hop || null;
      const inArc = this.arcV > 0;
      /* What the ground in front of this body's NEXT arc answers, in metres of
         ground: null until it has been asked, then the largest span at or below
         the arc the body was asking for whose landing this body's own rectangle
         can stand on -- 0 when no landing fits at all. The step gate below is
         the only thing that can answer it, because the step gate is where this
         body's ground law lives (`can`, `stand`, the rectangle from
         `bodyCells`); the hop gate a few hundred lines later is where the arc
         gets its launch. They are one question -- where can this body's next arc
         land -- so it is asked once a frame and carried between the two. */
      let arcFit = null;
      const yaw0 = this.yaw;       // before steering, so the turn rate is measurable
      /* Which other bodies this one is already inside, and how deep. A step into
         a place another body's trunk holds is refused the way a wall is refused,
         and the same contour that takes a body round a cliff takes it round its
         own kind. A body already standing inside another is not refused every
         place it could go -- that is a body frozen inside another one -- but it
         is refused every place that is deeper than the one it is standing in
         now. The old version let it go as deep as it liked, a centimetre at a
         time: two lamps drifting together at 4 mm a frame were never refused
         once, and ended up half a metre inside one another -- a body drawn
         almost exactly on top of another body.
         It is read after the body has turned and not before it: a body that
         turns swings its own trunk into whatever stands beside it, and a gate
         measured on the heading it had before the turn never sees the overlap
         the turn itself made. Two walkers one above the other on the northern
         slope came about into one another that way, 0.4 m of one inside the
         other, and neither of them had stepped anywhere. */
      const deep = new Map();
      const readDeep = () => {
        deep.clear();
        if (!game || !game.creatures) return;
        for (const o of game.creatures) {
          if (o === this) continue;
          if (this.y >= o.y + o.tall || o.y >= this.y + this.tall) continue;
          const c = bodyClash(this, this.x, this.z, o);
          if (c) deep.set(o, c.pen);
        }
      };
      const crowded = (x, z) => {
        if (!game || !game.creatures) return false;
        const tooDeep = (px, pz) => {
          for (const o of game.creatures) {
            if (o === this) continue;
            if (this.y >= o.y + o.tall || o.y >= this.y + this.tall) continue;
            const c = bodyClash(this, px, pz, o);
            if (!c) continue;
            // a body that is not in the neighbour's way yet may touch it, no more
            const was = deep.get(o);
            if (c.pen > (was === undefined ? TOUCH : was) + 1e-3) return true;
          }
          return false;
        };
        if (tooDeep(x, z)) return true;
        /* A body that covers ground in one frame must not go through a
           neighbour on the way: the place it lands in can be clear while the
           place it went through was not, and the gate would never see the
           crossing. A step shorter than half a trunk cannot skip a body, and is
           not tested twice. */
        return Math.hypot(x - this.x, z - this.z) > 0.12 &&
               tooDeep((x + this.x) / 2, (z + this.z) / 2);
      };
      const dx = tgtX - this.x, dz = tgtZ - this.z;
      const d = Math.hypot(dx, dz);
      /* `ask` is the rate the animal wants to travel at; `spd` is the rate it is
         covering ground at, which is what the body is drawn at, what the lean is
         read from, and what a body standing on its feet has no other way of
         having. For a body whose legs are an arc the two differ on purpose: the
         arcs carry the ground and the standing between them is the rest of the
         cycle, and `cruiseLaunch` sizes the arc so that the two agree over a
         whole number of cycles. */
      let ask = 0, spd = 0;
      if (this.vy < -0.5) { this.climbTo = null; this.climbRate = 0; }   // off the ledge: the fall decides
      if (d > 0.8 || inArc) {
        /* The table gives a speed on foot and, for the bodies that have one, a
           speed in the water (docs/03 s3), and which of them a frame is asked
           with is what `carried` answers: the water's figure for a body the water
           is holding up, the figure on foot for a body standing on the bottom of
           a one-block shore shelf -- 138 columns of Mirrorlake where the animal
           was swimming along at a speed its body was not using and its legs were
           not either. */
        const cruise = carried ? (sp.swimSpeed || sp.speed || 3) : (sp.speed || 3);
        const base = this.state === 'flee' || this.state === 'chase' ? cruise * 1.7 : cruise * 0.42;
        /* times the pace the body spends it at (see `pace` in the constructor):
           the species sets the speed, the body sets the tempo */
        ask = sleeping ? 0 : base * this.pace;
        /* The animal goes where it is going, and the course bends. `turn` is
           the most radians a second the species adds to its heading at its own
           cruising speed, and above that speed the arc it holds gets wider
           rather than the turn getting faster -- the same push has more body to
           swing about. This is the rule the player's own body obeys
           (Player.update); a frog crossing the lake is the same kind of body. What it replaces was an ease toward
           the target bearing at 4 a second, measured: a frog in the water came
           about 90 degrees in 0.57 s.
           A body in the middle of an arc is not in this at all: turning needs
           something to push sideways against, and a body in the air has neither
           feet nor water under it. It holds the heading it left the ground with
           and arrives where that heading was pointing, which is what an arc is;
           the errand is steered to again the frame its feet are back down. */
        const arc = sp.turn || 0;
        const tgtYaw = Math.atan2(dx, -dz);
        const dy = N.angleDelta(this.yaw, tgtYaw);
        if (inArc) {
          this.yaw = this.arcYaw;
        } else {
          // the same two limits as the player's body: the species' own rate, and
          // a correction proportional to how far off course the animal is
          const rate = arc > 0 ? Math.min(arc * Math.min(1, cruise / Math.max(ask, 0.01)), 2.2 * Math.abs(dy)) : Math.abs(dy);
          const bend = Math.min(Math.abs(dy), rate * dt);
          this.yaw += dy > 0 ? bend : -bend;
        }
        /* An animal that is close to where it is going, and off course, cannot
           get there at the speed it is travelling. The arc of a turn is the
           speed over the rate: at 0.92 m/s a body that can bend its
           course 0.8 rad/s holds an arc of 1.15 m, so a target nearer
           than that, or off to one side, is a place it circles for the rest of
           the afternoon and never arrives at (measured: 292 frames in 60
           seconds where the distance to its own wander target grew). Slowing is
           what an animal does about that, and the speed to slow to comes out of
           the geometry: the circle an animal describes that passes through the
           place has the way to it as a chord, and a chord that meets the heading
           at the course error belongs to a circle of radius half the distance
           over the sine of that error. The naive bound -- the distance over the
           sine, without the half -- is exactly the speed at which the animal
           circles the place for ever at its own arc width, which is the failure
           the slowing exists to end (measured: a body sent to a place 1.8 m to
           one side walked 41 m around it in 25 seconds and never came inside
           0.87 m). It costs nothing out in the open, where the target is far and
           the sine is small; near the place it reads as an animal easing as it
           comes about, which is what it is.

           And when the place is behind the body
           the chord tells it nothing: what it has to make is a U-turn, and the
           diameter of that turn is twice its own speed over its own rate, so the
           same bound with the sine at one is the speed at which the turn it is
           about to make still fits inside the way to the place. Without that half
           the animal charges off an errand at full speed, turns 2.3 m down the
           lake, and keeps the ground it gained: the ten lamps of the sunken tower
           were measured 7.9 m from the home they were born on, chasing errands
           4 m from that home, which is how a field that is supposed to be the
           tower's outline becomes a survey of the lake. */
        const err = Math.abs(dy);
        const reach = Math.max(err < 1.5708 ? Math.sin(err) : 1, 0.05);
        if (arc > 0) ask = Math.min(ask, arc * d / (2 * reach));
        /* And what the body is covering ground at this frame, which is the only
           figure the rest of this block, the draw and the lean may use: the rate
           its legs gave it if it is in an arc; the rate it is asking for if the
           water is carrying it or its own legs are a walk; and nothing at all if
           its feet are on the ground and its legs are an arc it is not spending
           this frame. `ask` is not thrown away -- the arc the body pushes off
           into is sized from it, and the ground those arcs cover over a cycle is
           the rate the animal's row states. */
        spd = inArc ? this.arcV : ((carried || !hop) ? ask : 0);
        /* The address a body asks about is the address it asked for. This used
           to fold the edge of the authored square into every step -- `Math.max(7,
           Math.min(hi - 7, v))`, and the same pair again over the body at the end
           of the branch -- which was harmless while every animal the valley held
           was born inside that square, and is not a law about ground. The world
           answers any address (`World.get` builds the chunk it needs), and the
           square's rim is inland ground, not a wall: on most bearings the shore is
           126-175 m out, well beyond it. Measured on the first animal that lives
           out there: a body swimming a lane 184-261 m off the shore was snapped
           back to the rim every frame it was past it -- 116 m in one frame, the
           worst single-frame speed the 150-second census of every body in the
           valley reports. What a body IS bounded by is the ground its errands
           name: the home disc picked above, or the lane of the ring it runs. That
           is stated where the errands are picked, and nothing here gets a second
           say in it. */
        readDeep();                 // the heading is settled; now what is in the way
        const nx = this.x + Math.sin(this.yaw) * spd * dt;
        const nz = this.z - Math.cos(this.yaw) * spd * dt;
        const mx = nx, mz = nz;
        if (this.isAquatic()) {
          /* An animal that cannot leave the water is moved by the water column,
             not by the single cell at its feet: it bobs a metre up and down
             while it hovers, and a one-cell test rejects most of its steps --
             and then rejects the way home as well, which is how one of them
             ended up parked against the sunken tower for the rest of the day. */
          const wet = (x, z) => waterColumn(world, x, z) >= 0;
          const free = (x, z) => wet(x, z) && !crowded(x, z);
          /* The nose. The centre column is the only ground the step above asks,
             and a column is a metre wide: the centre can stand in the wet
             column next door while the nose is already in the brick. So the
             ground the nose is about to enter is asked the same question the
             centre is asked -- wet, along the bearing the step runs. In open
             water the question costs nothing: the nose is wet wherever the
             centre is. The crowd is not asked of the nose: a nose inside a
             neighbour is the snout touching a trunk, and the keep-apart law
             above answers for the body; what the nose is refused is the ground
             the body is not allowed into. */
          const nose = noseReach(sp);
          const fx = Math.sin(this.yaw) * nose, fz = -Math.cos(this.yaw) * nose;
          /* And the cell the body would occupy at the step. `wet` answers
             "does this column hold water somewhere", and a column can answer
             yes with the body's own cell solid: the rim of the island at
             Starfall Keep did exactly that. Twelve columns at d = 13 from
             the lake centre carried a pocket of the lake's water (topmost
             water y5) under sixteen metres of stone (y6..21) the world's own
             island base had laid over them, and every ask above read the
             pocket as open water while the body's cell at its hover height
             (y13) was the stone. So the step is asked the body's own
             question, at the body's own height, of the ground it is about to
             stand in -- and of the ground the nose is about to stand in: the
             nose stands 0.256 m ahead of the body, and a body whose centre is
             in the wet column next to the stone pillar has its snout in the
             stone. Unasked, the correction at the end of the frame is the
             only thing between the body and the pillar, and it carries the
             body out of the stone at 0.1 m a frame: up sixteen metres, onto
             the rim, where the pocket still answers wet and the column's own
             altitude law holds the body at the rim's ground plus 0.35 for
             the rest of the day. The worldgen raises the rim so the pocket
             does not form; this is the law that keeps answering the question
             a pocket asks, so a world the player digs cannot park a body on
             the roof either. */
          if (free(mx, mz) && wet(mx + fx, mz + fz) &&
              !bodyInSolid(world, this, mx, mz) &&
              !bodyInSolid(world, this, mx + fx, mz + fz)) { this.x = mx; this.z = mz; }
          else if (inWater) {
            /* The step is refused -- a neighbour's trunk in the water, or the dry
               brick of the sunken tower -- and the body is still in the water.
               The way round either is the same way round the other, the same way
               a walker goes round a cliff: of the eight steps that are wet and
               clear, the one that closes on the errand most, and the heading
               follows the step that was actually taken, so the next frame tries
               the obstacle again from further along it and the nose is on the way
               the body is going and not on the brick.
               The step the body takes is the only step it is allowed, wet or
               clear, and that test is the whole of the safety here. The way home
               used to get its own branch, and unchecked the homeward step dragged
               a lanternfish through the tower wall -- the altitude code then finds
               no water in that column and leaves the animal standing on the tower's
               roof, out of the lake for good. The branch that tested the way home
               has its own shape kept beside that test: the minus sign it used to
               carry walked a lamp pressed against the shore away from the home it
               was being sent to, and one of them sat at 66.0, 107.0 for five
               minutes, 11 m from the tower its field is supposed to be, heading
               north into a wall of dirt. And with the way home tested like every
               other step, the slide kept the body in the water and it still had
               the shape this branch exists to fix: the heading was never told to
               follow it, so a body
               whose errand lay behind the wall kept its nose on the brick, and
               when the wall gave it no way it set its errand to its own feet and
               waited -- 322 to 422 times over a five-minute watch. The contour
               toward the errand ends where the wall ends, because the errand is
               picked wet, in the disc; what this branch refuses is not the goal,
               it is the ground.
               Eight ways, not four. The four that follow the grid are enough
               round a wall, because a wall is made of the same grid; a body is
               turned any way at all, and the shortest way out of one is very
               often a corner of the grid that leads straight back in. */
            const ex = this.tx - this.x, ez = this.tz - this.z, el = Math.hypot(ex, ez) || 1;
            let bx = null, bz = null, best = -2;
            for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1],
                                    [0.7071, 0.7071], [0.7071, -0.7071],
                                    [-0.7071, 0.7071], [-0.7071, -0.7071]]) {
              const px = this.x + ox * spd * dt, pz = this.z + oz * spd * dt;
              /* the body's own cell, at the body's own height, of the step and
                 of the nose: the wet ask alone reads a pocket under a stone
                 rim as open water, and this contour is the only step a body
                 whose way is blocked is allowed -- see the step above. */
              if (!free(px, pz) || !wet(px + ox * nose, pz + oz * nose) ||
                  bodyInSolid(world, this, px, pz) ||
                  bodyInSolid(world, this, px + ox * nose, pz + oz * nose)) continue;
              const dot = (ox * ex + oz * ez) / el;
              if (dot > best + 1e-6) { best = dot; bx = px; bz = pz; }
            }
            if (bx === null) { this.tx = this.x; this.tz = this.z; this.pause = 0.5; }
            else {
              const sx = bx - this.x, sz = bz - this.z;
              this.x = bx; this.z = bz;
              /* The heading follows the step, at the rate the animal is allowed
                 to turn anywhere else; the turn budget that lands after both the
                 steering and this have had their say keeps the sum to one turn a
                 frame. */
              const e = N.angleDelta(this.yaw, Math.atan2(sx, -sz));
              const back = Math.min(Math.abs(e), (sp.turn || 2) * dt);
              this.yaw += e > 0 ? back : -back;
            }
          } else {
            // already out of the water, which should not happen: take the
            // shortest way back that is not through rock, and let the altitude
            // sit on whatever it is standing on until the lake takes it back
            const ax = this.homeX - this.x, az = this.homeZ - this.z, al = Math.hypot(ax, az) || 1;
            const hx = this.x + ax / al * spd * dt, hz = this.z + az / al * spd * dt;
            if (!world.solidAt(Math.floor(hx), Math.floor(this.y), Math.floor(hz))) { this.x = hx; this.z = hz; }
          }
        } else {
          /* Can this body put its feet down in that column? The surface it would
             stand on, and the room over it: a step of a metre is a step, a
             surface with rock over it is a wall, and foliage over its head is
             neither -- a body walks through a bush with its shoulders in it. The
             test used to ask for the highest solid thing in the column up to 3 m
             above the feet, which made every bush a cliff and every crown a
             staircase: the walker of the northern ridge walked the crowns along the
             ridge instead of the ground under them, and went up 105 m and back
             down 114 m in a day doing it. */
          const stand = (x, z) => {
            /* And the ask is of every column the body's rectangle stands across,
               not of the column under its centre. That is the whole of the
               difference between a body stopped by a wall and a body drawn
               through it: the centre of a 0.41 m frog can stand a hand's width in
               front of a bank while the trunk is inside it, and the count of that
               is in the record above `bodyCells`. A body's feet are on every part
               of the ground it stands on, so every one of those columns has to
               answer the same question -- surface, feet cell, room over it -- and
               one refusal is a refusal. The wood rig below feels it, and feels it
               the right way: the frog driven at the one trunk this valley sets at
               the height a frog's own body occupies used to come to 0.52 m centre
               to centre of the nearest wood cell, which is its nose 0.19 m inside a
               trunk it had been refused -- the gate had already refused that column,
               and it stands in it 0 frames either way -- and now comes to **0.742 m**,
               which is that body standing at the face of the block with its own
               half-length out, and it goes round either way: 3.86 m of ground
               covered, 280 of its 480 frames more than a metre away from that
               column. What it costs is the deciding, and that figure is reported and
               not asked: 396 of the frames move it less than two millimetres, which
               for a hopper is the ground between its arcs rather than a body frozen
               at a wall. What is asked is that it keeps travelling -- more than 3 m
               in every rig on open ground -- and that nothing is thrown across the
               shelf: 0 frames in any rig move a body more than 0.9 m in one. */
            for (const [bx, bz] of bodyCells(this, x, z)) {
              const gy = standY(world, bx, bz, this.y);
              if (gy - this.y >= LIFT_REACH) return false;
              /* One cell over the surface is the whole of the difference between a
                wall and air for a walker, which is why this gate looked innocent:
                of the 2,684 wood cells of this valley 1,830 sit on wood and 843
                stand on the ground, so the cell over the surface a body stands on is
                wood in every one of them and they were all refused. The other 11 are
                wood with open air straight under them, over the surface a walker
                stands on: there the feet cell is air, the gate opens, and the body
                walks in with its shoulders through the block. Measured with one trunk
                block at the height a walker's own body occupies, two cells over
                the shelf it stands on, it came up against wood at 0.17 m and walked
                through it: 30 of its 480 frames with part of itself inside, up to
                0.54 m of it through the block, its feet on the ground every one of
                them, 30 frames standing in that column. It stopped at the face of
                it in that build -- 0 frames in that column -- and went on walking
                its 16.5 m. That rig has been rebuilt since, around the one hopper
                the species table leaves rather than around a walker, and the numbers
                the suite prints today are in the paragraph above. The flock
                itself never walks into that shape: the 30
                animals of a fresh valley, 18,000 frames each, were inside wood in 0
                frames before this and 0 after, with their paths, their standing
                frames and their frames pressed against wood the same to the
                centimetre; so the rig found it and the valley did not.
                So the span above that surface is asked too, feet cell up to head
                cell, exactly what the gate for a body in the air asks, and it is
                asked of this body's own height, which is what keeps the answer about
                the body rather than about the block: the same block one cell higher,
                over the walker's head, is walked under (61 of the rig's 480 frames in
                that column, 0 of them inside, of trunk or of crown alike), and the
                block one cell higher -- open air to the body either way -- is walked
                through (85 frames in that column). Asking the same span from the
                height the body happens to be at, rather than from the surface of the
                column it is asked about, was measured too: it keeps these bodies out
                of the wood and takes the walk with it, the walker standing still 180 of
                its 480 frames under a block one cell over its head and travelling
                10.4 m instead of 16.5 m. A body on foot is on the floor it walks on,
                and the body that is not --
                a frog in the middle of an arc -- is answered by the roof instead (see
                `roofY`, and the span and roof rig in test/play.js: with this half
                missing alone the walker stands 30 frames inside the block and no other
                rig moves, while with the roof asked out of the wrong table that frog
                is inside the wood over its head -- 14 frames starting under the block,
                28 walked at it -- and with the roof read over the body's own cell
                only it is inside 14 frames walked at the same block and clean
                starting under it).
                Leaves are excused by the material table and not by a second list: a
                body on foot walks through a crown with its shoulders in it, as it
                always did. A trunk (6) and bone (22) are not in that table, so wood
                is wood to a walker and to the body worn from the same animal at
                last. */
              const feet = Math.floor(gy + 0.2);
              if (world.solidAt(bx, feet, bz)) return false;
              const top = Math.floor(gy + this.tall);
              for (let k = feet + 1; k <= top; k++)
                if (world.solidAt(bx, k, bz) && !N.FOLIAGE[world.get(bx, k, bz)]) return false;
            }
            return true;
          };
          /* A step is climbed before it is walked on. `stand` answers what the
             feet would stand on and whether there is room over that surface; it
             never asks what is at the height the body itself is at, so a body
             that takes a step of a metre first puts its feet inside the riser of
             the step and then eases up through the ground behind it: measured on
             the walkers of the northern ridge, 3120 of 21600 frames had the
             origin of the body inside the hillside. The step is therefore taken
             the way the player's own body takes it: the feet are raised onto the
             surface first, in the column the body is standing in, and the edge is
             crossed once the body is high enough to be over it.
             Three things are not steps. Foliage is not a riser and is not a
             ceiling: a body on foot walks through a bush with its shoulders in it
             (docs/03 s5). A body in the air -- a hop, or a fall off a ledge --
             is not climbing: where it lands is decided by the rule at the end of
             the update, and refusing a step mid-air would stop a hop dead. And a
             body already in the middle of a climb keeps climbing: it is above its
             own ground by then, which is what the second test would otherwise
             mistake for being in the air. */
          /* A body whose only way up is a jump has no lift, and the lift is what
             the rest of this gate does: it raises the feet onto a surface at a
             rate while the body stands in front of it, which is a body sliding up
             a bank on straight legs. A hopper climbs with its legs, which means
             an arc the row sizes, so for one of these bodies a riser is asked a
             different question -- not "how high can I be lifted" but "how far can
             I land on it" -- and the answer is the reach of its own fullest
             extension (`hopReach`). Inside that the step is taken by the hop
             below, which is what the launch is sized for; outside it the riser is
             a wall, and the body goes round a wall the way it goes round any
             other.
             Which body that is is asked of the row and not of the species: the
             record is what says a body's legs are an arc. And the water half of
             it is the answer `carried` gave at the top of this block, asked once
             there so that nothing here can be told it is swimming by one rule and
             lifted up a bank like a crate by another: a frog wading the one-block
             shelf of Mirrorlake (138 columns of it) is in the water and is not
             held up by it, its feet are on the bottom, and an animal with feet at
             the foot of a bank takes that bank the way it takes every other bank,
             which for this one is a hop. Being lifted up it on straight legs was
             the same animal crawling, one metre from the place where it jumps. */
          const legs = hop && !carried;

          /* A body is on its feet unless something is carrying it down. Reading
             it off the height instead -- "the body is above the surface of its own
             column, so it is in the air" -- is wrong twice over: a body that has
             begun to climb a step is above its own ground by the middle of the
             climb, and a body that gave up on one and walked off sideways has no
             rate of falling and is still on its feet. */
          const onFoot = inWater || this.vy > -1;
          const riser = (x, z) => {
            /* The riser is asked of the column the body's feet stand in, and not
               of the rectangle. This is the one ask the rectangle does not belong
               to: a climb is begun from where the body is, not from wherever its
               nose happens to be pointing, and the read that decides a step is
               already made further along the heading than any box could reach --
               `stepAhead` here and `riseAhead` in the hop gate both read the
               ground ahead of the feet and size the climb or the arc from it. Ask
               the riser of the rectangle and a body begins its climb half a body
               length from the face; measured at a bank of one metre, the frog that
               was thrown one sized arc at the edge now needed two, because the
               time its own arc spends above the edge is what carries its body over
               it, and half a body further back does not fit inside it. */
            const bx = Math.floor(x), bz = Math.floor(z), cell = Math.floor(this.y + 0.05);
            if (!rockAt(world, bx, cell, bz)) return 0;
            return standY(world, bx, bz, this.y);
          };
          /* The ground part of the question, without the neighbour part: 0 for
             "walk there", a height for "raise the feet onto that surface first,
             where it stands", null for "that is a wall". A body cannot raise
             itself through a ceiling, so a step with rock over it is a wall and
             not a step. */
          const ground = (x, z) => {
            if (!stand(x, z)) return null;
            const r = riser(x, z);
            if (!r) return 0;
            /* A body that is being carried down does not climb the step it drifts
               into: it falls past the face of it. Measured, a body that stepped off
               a ledge and fell alongside the next one was lifted 0.83 m back up it
               in a single frame, because the step read as ground and the body was
               eased onto it. */
            if (!onFoot || r - this.y > LIFT_REACH) return null;
            /* LIFT_REACH is how far a body that can lift itself onto a step
               reaches. For a body whose legs are the only way up, the question is
               asked of its own legs instead -- see `legs` above -- so a step of
               1.3 m, which a lifted body climbs, is a wall to a frog and the
               contour below takes it round. */
            if (legs && r - this.y > hopReach(hop, dt)) return null;
            /* And a rise above the water line is only a step where the record
               names the ground: a body the sea drives is carried up a beach it
               does not live on by the same lift that carries it onto the sand it
               does, and once ashore the ring it was sent to is not asked of a
               body that is no longer in the water -- so it wandered inland and
               spent a third of the day on ground 105 m inside the valley, a
               distance the shore it belongs to has no bearing on at all. */
            if (r > N.WORLD.sea && r > this.y + 0.05 && !dryGroundNamed(this.sp, Math.floor(x), Math.floor(z))) return null;
            /* A body in the middle of an arc may only be put where THAT arc
               reaches. `hopReach` is the fullest extension these legs are
               capable of: it is the right question for legs deciding what to
               push off into, and the wrong one for a body already in the air,
               whose arc was sized on the frame it pushed off and nothing in the
               air re-sizes it. Measured in the passage the span rig builds -- a
               ceiling one cell over the floor, a step of a metre closing the end,
               and a room that leaves 5.088 m/s against the 7.307 that step asks, so
               the legs are left with the 0.958 m/s of an arc sized on the 0.12 m
               floor of the ground ask -- the frame the body's centre crossed the
               face moved it 0.022 m along the ground and 0.971 m up in the same
               frame: that lift is the `pops` guard's own reading, and it now reports
               0 such frames in all seven rigs of that test. Before the branch below
               the ground under a body mid-arc that turned out to be above its feet
               was taken as ground it lands on, and the arc never needed to reach it.
               Asked of the arc -- the top this body can still come to from where
               it is, its own height plus the height the rate it still has can
               carry it, and after the top there is no rate left to carry it --
               the face takes the ground back and the body stays at the foot of
               it, which is the one thing the branch below already says a body
               that arrives at a face it cannot land on does. */
            if (inArc && r > this.y + (this.vy > 0 ? this.vy * this.vy / (2 * GRAVITY) : 0)) return null;
            if (rockAt(world, Math.floor(this.x), Math.floor(r + 0.05), Math.floor(this.z))) return null;
            return r;
          };
          /* Where this body may be put: the ground answer and the neighbour
             answer together. A neighbour's own trunk is as much an obstacle as a
             bank is, and the contour below takes the body round it the same way. */
          const can = (x, z) => {
            const g = ground(x, z);
            if (g === null) return null;
            if (crowded(x, z)) return null;
            return g;
          };
          /* And the whole of the way to a place, not only its end. A body's box is
             carried along the path, so a face in the middle of it is a face: asked
             only at the end -- which is the ground an arc wants to land on, and the
             right thing to ask there -- a frog at the corner of a wall three cells
             long took forty-four arcs of no ground at all, because every one of
             them ended clear of the wall's end while its own shoulder was through
             the wall a metre before that. The path is walked in the same steps the
             arc is walked back in (`ARC_PROBE`), the neighbours are asked only at
             the end -- the places along the way are asked many times a frame and
             other bodies are moving through them -- and a way with a face in the
             middle of it is the same refusal a face at the end is, which is what
             sends the animal round instead of into it. */
          const along = (x, z) => {
            const vx = x - this.x, vz = z - this.z;
            const len = Math.hypot(vx, vz);
            /* Two parts of the way are not this question. A body standing inside
               rock for some other reason -- another body shoving it, a tree grown
               down on it, the edge of the valley folding it -- is not refused
               every place it could go: the first step of the way is excused and it
               walks out. The same shape as the `deep` answer above for a body
               inside another body. And the near `half` of the way -- the depth of
               the body along the heading -- is inside the place the body ends up,
               which `can` is asked of the end point below: refusing it stops a
               body a whole body-depth short of a face it is allowed to stand
               against, and a person walked at a tree trunk was held 0.15 m off it
               by nothing but the size of the step this loop samples at. */
            const sunk = ground(this.x, this.z) === null;
            const half = this.hl;
            for (let s = ARC_PROBE; s < len - 1e-6; s += ARC_PROBE) {
              if (s <= half + 1e-6 || (s <= ARC_PROBE + 1e-6 && sunk)) continue;
              if (ground(this.x + vx * (s / len),
                         this.z + vz * (s / len)) === null) return null;
            }
            return can(x, z);
          };
          /* Where this body's own body reaches, so which ground has to answer for
             it. A body that walks reaches `spd * dt` this frame and the branch
             below puts it there. A body whose legs are an arc has no step to
             take: the only ground it can have is the ground its next arc covers
             -- `ask x period`, the metreage `cruiseLaunch` sizes the launch to,
             less whatever of that arc it has already flown -- and its legs, not
             this branch, put it there. Asking the question at `spd * dt` asks it
             at the body's own feet, which are always somewhere it can stand:
             measured on a wild frog set down at the foot of a 3.2 m face, `go`
             answered "walk" in all 1800 frames of a watch and the animal never
             learned the wall was there. The span is the arc's, so the answer is
             about the ground the animal can have. */
          const arcUp = legs ? cruiseLaunch(hop, ask, hop.period, dt) : 0;
          const span = inArc ? this.arcLeft : (legs ? arcGround(arcUp, dt) : spd * dt);
          const px = this.x + Math.sin(this.yaw) * span;
          const pz = this.z - Math.cos(this.yaw) * span;
          /* The ground the body was asking to reach, asked of the whole way to it:
             a body may not be put inside rock anywhere along the path, and a face
             part of the way along it is as much a wall as a face at the end. This
             is the one question -- the same one the body you wear gets from its
             collision resolver, which stops a move at the first cell it would put
             the box inside. */
          const go = along(px, pz);
          /* The ground the next arc can actually land on. When the ground at the
             end of the arc the body was asked for is refused, the animal does not
             stand still and does not refuse to move: it takes the largest arc
             that fits, the same way it takes the largest step that fits when it
             is walking. Walking the span back asks the same question of the same
             ground law, a little closer each time, and stops at the first landing
             the whole way to which answers. At a wall along its side -- heading a
             few degrees into it, as an animal on an errand across a wall always
             is -- this is the difference between crawling along the face and
             standing at it, and the wall rig of test/play.js is what keeps that
             honest. Nothing fits only when the ground the legs could reach at all
             is refused: that is a wall, and the branch below answers it.
             A body already in an arc has no next arc to size -- the arc it is in
             was launched at the ground that was there, and nothing in the air can
             change it -- so it asks nothing. */
          if (legs && !inArc) {
            const fitsAt = (s) => along(this.x + Math.sin(this.yaw) * s,
              this.z - Math.cos(this.yaw) * s) !== null;
            arcFit = go === null ? 0 : span;
            for (let s = span - ARC_PROBE; arcFit === 0 && s >= MIN_HOP_GROUND; s -= ARC_PROBE) {
              if (fitsAt(s)) {
                /* The probe's step is how the search is made, not what the ground
                   is: refined between the landing that answered and the one a step
                   further that refused, the answer is the ground that is actually
                   there -- the same refinement the body worn from this animal
                   makes of its own hedge (`arcFit` in Player.update). */
                let lo = s, hi = s + ARC_PROBE;
                for (let k = 0; k < 6 && hi - lo > 0.01; k++) {
                  const m = (lo + hi) / 2;
                  if (fitsAt(m)) lo = m; else hi = m;
                }
                arcFit = lo; break;
              }
            }
          }
          /* The step the body is walking towards, and how far off it is: the
             first column along the heading whose surface is above its feet. */
          const stepAhead = () => {
            const ux = Math.sin(this.yaw), uz = -Math.cos(this.yaw);
            for (let d = 0.35; d <= 1.4; d += 0.35) {
              const cx = Math.floor(this.x + ux * d), cz = Math.floor(this.z + uz * d);
              const s = standY(world, cx, cz, this.y);
              if (s - this.y > 0.05) {
                /* The look-ahead reads a step the body has not reached yet, so it
                   is asked the same question the step itself is asked below: a
                   rise above the water line on ground this record does not name is
                   not a step, and a body that begins climbing it anyway rises in
                   place against the face and falls back down it. Measured before
                   that was the answer here: an animal stopped at a built bank on
                   ground inland was lifted 0.94 m up the face of it over 138
                   frames and dropped back to the level it started on. */
                if (s > N.WORLD.sea && !dryGroundNamed(this.sp, cx, cz)) return null;
                return s - this.y <= LIFT_REACH ? { d: d, s: s } : null;
              }
            }
            return null;
          };
          /* A climb already begun is finished: dropping it in the middle would let
             the ground under the body's feet reappear and the body fall back down
             the step it was on its way up. */
          const worth = (r) => r && r > this.y + 0.02 && r - this.y <= LIFT_REACH &&
            !rockAt(world, Math.floor(this.x), Math.floor(r + 0.05), Math.floor(this.z));
          /* A body in the middle of an arc is on its way to the ground its
             push-off was sized for, and a step inside that ground IS the ground
             it is landing on. The arc's own rate carries it over the edge -- that
             is what the launch was sized to reach -- so the frame advances the
             body at the arc's rate and spends that much of the ground the
             push-off owed. Nothing else here may move a body that is in the air:
             the ground it was asking for is asked of the whole way to it, and a
             body in an arc whose look-ahead saw the step stopped dead a body-span
             short of the edge it was about to land on, rising in place and
             landing back where it pushed off.
             The ground owed is spent only by ground covered. A frame that a face
             stops spends none of it, and the landing ends the debt -- the same
             rule the body you wear runs through its own resolver (see the brace
             above `hopLaunchNow`, and `arcLeft` in `Player.update`). */
          if (inArc && go !== null) {
            this.x = mx; this.z = mz;
            this.arcLeft = Math.max(0, this.arcLeft - spd * dt);
            this.climbTo = null; this.climbRate = 0;
          }
          else if (go === 0) {
            /* The way ahead was open and this body took its own step along it, so
               the side it was going round a face with is spent: a memory of one
               wall must not steer the next one. */
            this.roundSide = null;
            this.x = mx; this.z = mz;
            /* A step is begun before the face of it. A body that only learns about
               a step when its nose is against the riser has to stop walking to
               climb it: measured, a walker of the northern ridge stood still for 19
               frames at the foot of a step of a metre, rising the whole time, and
               did that at every step of the ridge it walks. The step is therefore
               read up to a metre and a half along the heading, and the climb is
               closed at the rate the body covers the ground -- a step of a metre a
               metre ahead is climbed at walking pace, so the body rises along the
               slope of the riser and crosses the edge without stopping. Gaining the
               top of the step before getting there is just as wrong: the body is
               then in the air over its own ground, the ground under its feet comes
               back, and it falls back down the step and climbs it again, once a
               second, all afternoon.
               And the look-ahead is only for a body standing on the ground under
               it. A body floating eight metres above the bed of a lake is not at
               the foot of the shore: reading a step a metre away as a step in front
               of it is how a frogpear climbed out of Mirrorlake into the air, three
               metres over the surface of the water it was swimming in, and fell
               back into it. */
            const sa = onFoot && this.y - standY(world, Math.floor(this.x), Math.floor(this.z), this.y) <= LIFT_REACH
              ? stepAhead() : null;
            if (sa && worth(sa.s) && !legs) {
              this.climbTo = sa.s;
              this.climbRate = Math.max(0.4, Math.min(3, (sa.s - this.y) / sa.d * spd));
            } else if (!worth(this.climbTo)) { this.climbTo = null; this.climbRate = 0; }
          }
          else if (go !== null) {
            /* The obstacle is not in front of the body any more, so the side it
               was going round it with is spent with this step: a body on an
               errand keeps its own heading, not a debt to the last wall it
               passed. */
            this.roundSide = null;
            /* The step is in front of the body and inside what its body can
               reach. A body that lifts its feet onto a step does that here, at a
               rate, standing in front of it. A body that hops does not: it takes
               the step with an arc the row sizes, which the hop gate below
               launches, and until that arc has carried it over the edge the body
               stands at the face with its feet under it and its heading held --
               not going round, not being raised. What it looks like from outside
               is a frog coiled at the foot of a bank, and then on top of it. */
            if (legs) { this.climbTo = null; this.climbRate = 0; }
            else { this.climbTo = go; this.climbRate = 3; }
          }
          else if (inArc) {
            /* A body in the middle of an arc has arrived at a face it cannot land
               on, and it does nothing here -- that is the whole of the law. There
               is no way round for it to take: turning needs something to push
               sideways against, and a body in the air has neither feet nor water
               under it, which is the same reason its heading is held two paragraphs
               above. The face takes back the ground the arc was going to cover and
               not the push that owed it: the rate the legs gave is still there the
               frame the body is above the top of the face, and the frames the face
               spends spend none of the ground owed. So the body drops down the
               face, the landing ends the debt, and the frame after it the contour
               below is asked again and the animal goes round on its feet. */
          }
          else {
            /* The way is a wall. An animal does not sit down in front of one and
               wait to be somewhere else: it goes round. Of the steps it can take,
               the one that stands and points most the way it wants to go is the
               one it takes -- the contour of the obstacle rather than a fresh
               errand -- and the heading follows the step, so the next frame tries
               the wall again from further along it and walks off when the wall
               ends. Giving up was the whole of the old behaviour, and it is the
               last resort here: measured on the walkers of the northern ridge,
               the step in front of them was rejected 2024 times in 2400 frames
               and they spent 81% of the afternoon standing still.
               What "the steps it can take" means belongs to the body, and it is
               the same question as the one above: a body that walks is asked
               about the ground `spd * dt` covers, and a body whose legs are an
               arc is asked about the ground an arc covers, because that is the
               only ground it can have. A body of the second kind takes no step
               here -- its ground comes from its legs at the next push-off -- so
               of the eight ways about it takes the one whose ground its arc lands
               on and spends this frame turning to face it, at the rate its row
               allows it to turn anywhere else. That is what the arc then follows:
               the launch below reads the ground along the heading, so the wall is
               gone round a hop at a time. Asked at the body's own feet instead --
               which is what `spd * dt` of zero does -- every way about reads as
               its own standing place, the heading aims at nothing, and the animal
               stands at the face for the rest of the afternoon: measured, a wild
               frog set down at the foot of a 3.2 m face covered 0 m in 30 s.
               Eight ways for that body and four for a walker, for the reason the
               swimming contour two branches above gives: four that follow the grid
               are enough round a wall, because a wall is made of the grid, but a
               body is turned any way at all, and the shortest way out of one is
               very often a corner of the grid that leads straight back in. */
            const bx = tgtX - this.x, bz = tgtZ - this.z;
            const bl = Math.hypot(bx, bz) || 1;
            const reach = legs ? span : spd * dt;
            const ways = legs ? [[1, 0], [-1, 0], [0, 1], [0, -1],
                                 [0.7071, 0.7071], [0.7071, -0.7071],
                                 [-0.7071, 0.7071], [-0.7071, -0.7071]]
                              : [[1, 0], [-1, 0], [0, 1], [0, -1]];
            const open = [];
            for (const [ox, oz] of ways) {
              const nx = this.x + ox * reach;
              const nz = this.z + oz * reach;
              const c = along(nx, nz);
              /* A wall is not a way round, and for a body that climbs with a hop
                 a step is neither: the way round a bank is the flat ground beside
                 it, and the step it wants is the one it is already facing. */
              if (c === null || (legs && c)) continue;
              open.push([nx, nz, c, ox, oz]);
            }
            /* The side it has begun round is kept. An errand that lies dead ahead
               of a face scores the two ways along that face equal and opposite, so
               a body that re-decides between them every frame from that answer
               cancels itself: measured at a wall one cell thick and seven cells
               long stood in the middle of Mirrorlake, this contour asked for one
               way along the face in 587 frames and the other way in 586, the body
               stayed inside 0.27 m of the middle of the wall, and its travel along
               the face reversed on itself 1155 times in 1200 frames -- 2.3 m of
               ground gained toward an errand 8.5 m away over two minutes. A body
               that has begun round one side of an obstacle goes round that side:
               the ways that take it back along its own travel are refused, and the
               refusal is lifted when nothing else is open. */
            let cands = open;
            if (this.roundSide) {
              const keep = open.filter(w => w[3] * this.roundSide[0] + w[4] * this.roundSide[1] >= 0);
              if (keep.length) cands = keep;
            }
            let best = null, bestDot = -2;
            for (const w of cands) {
              /* going round a step costs less than climbing it, so a step is
                 climbed only when nothing walkable points the way at all */
              const dot = (w[3] * bx + w[4] * bz) / bl - (w[2] ? 0.35 : 0);
              if (dot > bestDot + 1e-6) { bestDot = dot; best = w; }
            }
            if (best && bestDot > -0.7) {
              this.roundSide = [best[3], best[4]];
              if (legs) {
                /* No ground is taken here; only the heading. The legs give the
                   ground at the next push-off, along this heading.
                   The turn is taken from the heading the body had when the frame
                   began (`yaw0`), not from the heading this frame's steering left
                   it with. A body has one heading, not two, and the direction the
                   errand was steering at is the direction with no ground in it --
                   that is what brought this branch about -- so that steering is
                   not a second turn to be added on top of this one. Measured at a
                   wall nine cells long with the two added: the errand's bearing
                   lay 0.74 rad into the face and the contour asked for the way
                   along it, each at the row's own turn rate, and they cancelled --
                   the heading sat at 0.08 rad through 60 frames, no arc had any
                   ground, and the animal stood at the face. From `yaw0` the turn
                   belongs to the ground that is there. */
                const e = N.angleDelta(yaw0, Math.atan2(best[3], -best[4]));
                const back = Math.min(Math.abs(e), (sp.turn || 2) * dt);
                this.yaw = yaw0 + (e > 0 ? back : -back);
              } else {
                const sx = best[0] - this.x, sz = best[1] - this.z;
                if (best[2]) { this.climbTo = best[2]; this.climbRate = 3; }
                else { this.x = best[0]; this.z = best[1]; this.climbTo = null; this.climbRate = 0; }
                /* The heading follows the step, at the same rate the animal is
                   allowed to turn anywhere else: it is going round the obstacle,
                   not sliding sideways along it with its nose still at the errand. */
                const e = N.angleDelta(this.yaw, Math.atan2(sx, -sz));
                const back = Math.min(Math.abs(e), (sp.turn || 2) * dt);
                this.yaw += e > 0 ? back : -back;
              }
            } else { this.tx = this.x; this.tz = this.z; this.pause = 0.5; }
          }
          /* and no clamp holding the body inside the authored square: the same
             wall the asks above used to carry, and the same answer -- the ground
             goes on past it, and the errand is the bound. */
        }
        /* One turn budget a frame, whoever spent it. Going round an obstacle
           bends the heading as well as steering at the errand does, and the two
           added: a body pressed against a cliff came about at twice the rate
           its row allows (measured 3.2 rad/s against a row of 1.6). A body in an
           arc is not in this: its heading was not spent this frame, it was given
           back to it at push-off, and the budget would take the arc's own
           straight line away from it. */
        if (arc > 0 && !inArc) {
          const budget = arc * dt;
          const off = N.angleDelta(yaw0, this.yaw);
          if (Math.abs(off) > budget) this.yaw = yaw0 + (off > 0 ? budget : -budget);
        }
      }
      this.speed = spd;
      this.squash = Math.max(0, this.squash - dt * 3.2);

      /* A body the water is holding up turns by tilting; a body on foot does
         not, because nothing at these speeds leans into a turn. Same rule and
         same numbers as the player's own lean (Player.update): the tilt is the
         sideways push the arc needs over the pull of the earth, so an animal
         that is only correcting a few degrees leans a few degrees and one at
         the tightest arc its data allows leans the full 0.45. A frog crossing
         the lake with its heading swinging through ninety degrees and the body
         dead level was the tell, and it is the one body the player spends the
         most time watching. */
      const bend = spd > 0.3 ? N.angleDelta(yaw0, this.yaw) / Math.max(dt, 0.001) : 0;
      this.bend = Math.abs(bend) < BEND_DEAD ? 0 : bend;   // signed: see Player.update
      const lean = carried
        ? Math.max(-0.45, Math.min(0.45, Math.atan(bend * spd / LEAN_G)))
        : 0;
      this.bank += (lean - this.bank) * N.ease(4.5, dt);

      /* This frame's whole allowance for raising a body out of the world it is
         inside (see `UNSETTLE_RATE`): spent by whichever of the two gates below
         finds the body, and by the first of them to run, so the second may lift it
         no further this frame. It is `dt`-scaled like every other rate here, not a
         flat amount per frame: at a 120 Hz screen a per-frame allowance is a rate
         twice the one this number states. The arc, the stroke and the fall each
         carry their own rate and spend nothing of it. */
      let liftLeft = UNSETTLE_RATE * dt;

      // altitude
      const y0 = this.y;      // before the altitude is set, so the rate is measurable
      if (this.isAquatic()) {
        /* The level is asked of the column, in one place, with the same law the
           water's hold is told by everywhere else in this file: the depth an
           animal of this kind hangs at is on its own row, it is measured to the
           crown of the body, and the level is the surface of the column less the
           body's own height less that depth.
           It used to be `wt - depth`, and `wt` is the index of the topmost water
           cell while `depth` is metres: the two are only the same thing because a
           block is a metre tall, and the film is one block above that index, so
           the animal sat a whole block deeper than the sentence said -- measured
           over 12000 samples of the ten lamps, **1.52-3.12 m** under the film
           (mean 2.22) for a body **0.54 m** tall, where the row says a metre plus
           or minus the bob. Off the film itself the crown hangs **0.4-2.0 m**
           under it, which is what "a metre or two under the surface" means, and
           the top of the bob no longer puts the crown through the surface.
           Never through the bottom either: the lake is only two blocks deep at
           its edges, and a fixed depth below the film puts an animal inside the
           lakebed there, which is a water animal standing in the mud. The ground
           that bounds it is searched down from the animal's own feet, not from
           above its head: a tree standing in shallow water is solid all the way
           up, and a search that starts over the body lets the animal latch onto
           the trunk and climb it out of the lake, block by block, into the sky. */
        const bob = Math.sin(this.t + this.phase) * 0.8;
        const target = hoverLevel(this.sp, world, this.x, this.z, this.tall, this.y, bob);
        /* An ease closes a distance at a rate proportional to the distance
           left, so when
           the level the water states for this column is far from the height the
           body is at -- a bell dropped off a bank into deep water, a bell held down
           and let go, a column whose level the world has only just started
           answering for -- the height the body wants is metres away and the answer
           is a lift. Measured on a bell put down on the lakebed at the bottom of
           the deepest column in the lamps' disc -- **11 m** of water there, film
           at 15, bed at 4 -- and left to the ease before the cap: it climbs the
           whole **9.31 m** to the level its own row states (**8.91 m** of it
           when the disc was the ring the field used to be and the lamp was its
           first, larger model), and the height closes **0.248 m** in a single
           frame, **14.9 m/s**, against the **2.2 m/s** its own row swims, with
           **64** of its 600 frames faster than that. A
           body in water pays for height out of the speed it has: it rises or
           sinks no faster than it swims, and it arrives -- capped, the same bell
           covers the same **9.31 m** inside the same ten seconds at **0.0367 m**
           a frame, and the check that pins this also insists it arrives,
           because a law satisfied by never moving the body at all would pass
           the rate and fail that. */
        const swim = sp.swimSpeed || sp.speed || 3;
        const rise = (target - this.y) * Math.min(1, dt * 1.6);
        const reach = swim * dt;
        this.y += Math.abs(rise) > reach ? (rise > 0 ? reach : -reach) : rise;
        if (Math.abs(target - this.y) < 0.01) this.y = target;
      } else {
        /* Feet, water and the ground -- one routine for every body that is not
           being held up by air. The body that hops and the body that walks are
           told apart by whether the data gives them a `hop`, not by whether they
           obey gravity: the two branches used to be separate code, and the
           hopper's had no bound on what it would do to a body's height. */
        const gy = standY(world, Math.floor(this.x), Math.floor(this.z), this.y);
        /* The height the feet are being raised onto: the column the body stands
           in answers for the ground under it, and the step in front of it answers
           for the ground it is about to stand on. The body climbs that in place,
           and the gate above lets it over the edge the frame it is level with it.
           The water's depth is still measured off the ground under the body, so a
           frog climbing out of the lake does not lose the water's hold halfway up
           the bank. */
        const gyH0 = this.climbTo !== null && this.climbTo > gy ? this.climbTo : gy;
        /* The lift below raises the feet onto `gyH` at a rate, and it used to
           ask nothing about what stands over the body's head while it does.
           Asked, that is how a frog in the door of the sunken tower -- the
           frogpear cell in the wall, the way its kind walks in and out of the
           hollow shaft -- got lifted to the roof of its own cell, through the
           glass that tops the door, and carried up the masonry at 0.1 m a frame
           by the correction: the day soak of the valley caught one of the twelve
           in it. The ceiling is asked the way the step gate asks it -- the
           material table, all wood excused, over the body's own column, which is
           the whole of the lift's arc, for the lift is vertical and in place --
           and the feet are kept under it by the body's own height plus the same
           hand's width the ceiling over the body's head keeps, so it is the
           head that meets the block the feet do not. The table excuses the trunk and
           the bone, not only the leaf, because the gate that set this lift is
           the step gate, and its law is rock over the step top: a trunk over
           the top is the tree the walker goes under, not a wall. Asked the hop
           gate's way -- leaves excused, the trunk counted -- the cap held one
           frog of the valley at four-fifths of its step for the whole watch
           under a row of trunks the carved hollow had severed one cell above
           the grass: 584 of its 600 frames at 0.48 m under the step top it was
           owed, 0.6 m of path in them. Asked the step gate's way the frog climbs
           the step the way it has always climbed it, its feet through the
           severed cell for the one frame the crossing takes, which the
           correction at the end of the frame leaves alone as all wood. The
           door's glass is rock, which is why the cap still holds the body in
           the doorway. The cap only ever lowers the
           height the feet are raised onto: a body standing on its own floor
           stands below the ceiling its head is under, so its floor is not what
           is lowered, and a body already under the ceiling by more than a hand
           is settled back under it by the fall, not moved by the lift.
           Only while the feet are not already inside a hard block. A body left
           in the bank of a lake shore -- the step law's frog 1.5 m inside the
           shelf -- has the top of that bank for its ceiling, and the cap would
           put it under the floor it is owed: the settle onto the cap undoes the
           lift out of the rock frame for frame, and the body is found still in
           the solid after six hundred of them. A body with its feet in the rock
           is already inside the world, and the lift does there what it has
           always done: carries it onto the floor at the rate. */
        const feetHard = bodyInSolid(world, this, this.x, this.z);
        let gyH = gyH0;
        if (!feetHard) {
          const roofOwn = roofY(world, Math.floor(this.x), Math.floor(this.z),
            Math.floor(this.y) + 1, world.h, N.TREE_BLOCK);
          gyH = Math.min(gyH0, roofOwn - this.tall - 0.05);
        }
        // which bodies have an arc is what the row says, and `hop` is the same
        // reading the step gate asked with `legs` above; the water read below is
        // the same `carried`/`waterHolds` answer, asked here of the ground the
        // body's own feet would find in the column it is in
        /* the cell convention, one below the surface: this asks how many blocks
           of water stand over the surface this body's feet would find (see
           `liquidSurfaceAt` in world.js), and the answer is the same two-block
           line every other reader of that law asks */
        const holds = waterHolds(gy);
        // and it holds this body up only while the body is off the bottom: a
        // frog sitting on the lakebed has feet under it, and a body with feet
        // does not kick at nothing
        this.held = (holds && this.y > gy + 0.2) ? 1 : 0;
        /* The stroke's gate, without the species test and without the depth
           test: an animal in water and off its bottom has water in front of it,
           and whether the column is holding it up is a separate fact. For a frog
           the two answers are the same; for an animal that breathes air they are
           not, and the wings have to follow the water, not the hold. */
        this.stroking = (this.inWater && this.y > gy + 0.2) ? 1 : 0;
        if (holds) {
          /* A frog does not swim in one layer. It holds a depth of its own,
             sinks now and then and comes back up to breathe, on a cycle of its
             own -- which is what the frogs of one lake look like when they
             are alive: a spread of depths that changes, not a line. The cycle
             runs to the power 0.4 rather than squared, because squared is this
             animal turned upside down: a frog hangs at a depth and comes up for
             air now and then, it does not lie under the surface film and dive
             occasionally. Squared, the twelve frogs of Mirrorlake -- the
             crowd then; the valley drives five now -- spent 46% of a ten
             minute watch within a metre of the surface film at a mean of
             1.47 m down, which is the report that the frogs sit too near the
             top of the water. The surface is the ceiling and the bottom is
             the floor, so in a column too shallow to swim in the frog simply
             stands, and in the deep part one frog can be hanging just under the
             surface while another is deep down and coming up. The depth is closed
             at the speed
             the animal's own record swims at, not at a fraction of the distance
             left: the lerp was an elevator that ran fastest the instant it
             started, and a frog put down on the lakebed 4.7 m under the surface
             came up 0.47 m in its very first frame -- 28 m/s -- every frame after
             it slower than the one before. */
          const cyc = 0.5 + 0.5 * Math.sin(this.t * this.diveRate + this.phase);
          /* the shallowest a frog goes is the level its own row states a body of
             its kind lies at -- its own height down, plus the depth its own
             record says -- and it is measured off the surface, not off the top
             block of the water (the film of a column and the top of its water
             are one height). The depth is the animal's, not the water's: the
             water holds a body it is carrying at whatever depth that body is at
             (see the water branch of `Player.update`), and this is the depth an
             animal of this kind has settled on for itself. */
          const fl = floatLevel(wSurf, this.tall, hoverOf(this.sp));
          /* The floor of a dive is a gap above the ground wherever the animal's
             own level is above that ground. `held` just above says a
             body above `gy + 0.2` is a body with no feet under it, and a dive
             floor at the ground turns that body back into a standing one: the
             hold goes off, the stroke stops, and a frog working its dive cycle
             along the deep edge of the shallows stood up and swam again once a
             cycle. So the floor is `bedFloor` above, asked of this body's own
             height -- the same floor the body you wear is held at, because the
             herd and the body you wear are the same animal in the same water.
             Where the animal's own level is not above the ground -- the one-block
             shelf it stands and wades in, a pool no deeper than the depth its row
             states -- the ground is a bottom to
             stand on, and the gap there is only the 5 cm its own feet ask for. */
          const bed = fl > gy ? bedFloor(gyH, this.tall) : gyH + 0.05;
          /* The depth a dive reaches is asked of two things and the shallower of
             them wins: the depth this body drew at birth (`diveTo`, the animal's
             own), and the room the column gives -- the distance between the level
             this animal hangs at and the floor that water holds a body of its
             shape at, both asked above, of this body and of this column.
             A dive is a distance an animal covers. Where the column is shallower
             than the dive its record states, the line below kept asking for metres
             that are not there, and the body hung at the floor for the rest of
             every cycle with its legs working against the bed: a body the water
             is holding up, treading, going nowhere, for most of the time it was
             diving. The animal's ask and the water's room are two different facts
             and this is the one place they are read together, which is what the
             rest of this branch already does about the two ends of the hold.
             Nothing else changes: where the room is at least the dive asked for
             this is term for term what it was, and where the animal's own level
             stands no higher than the ground the room is nil, the ask is worth
             nothing, and the body stands -- the one-block shelf it wades in, a
             pool no deeper than the depth its row states. */
          const room = Math.max(0, fl - bed);
          const target = Math.max(bed, fl - Math.min(this.diveTo, room) * Math.pow(cyc, 0.4));
          const rate = sp.swimSpeed || sp.speed || 1.5;
          const want = target - this.y;
          const step = Math.max(-rate, Math.min(rate, want * 2.5)) * dt;
          this.y += Math.abs(step) >= Math.abs(want) ? want : step;
          this.vy = 0; this.airAmt = 0; this.crouch = 0;
          /* The water has this body now. An arc it was in the middle of is over:
             the water takes the rate the legs gave the same way it takes every
             other rate, and the stroke below is what carries the body from here.
             A body that comes out of the water onto a shelf does the opposite --
             it stands up, and the next arc is sized from what it is asking for on
             its feet. */
          this.arcV = this.arcLeft = 0;
        } else {
          /* On land a frog does not slide: it hops. Before this the height of an
             amphibian was lerped onto the ground every frame, which meant the
             twelve frogs in the valley then never once left it -- the legs
             animated a
             walk no body was doing. The launch is an impulse, the arc is
             gravity's, and the landing is where the squash comes from. The
             countdown only runs with feet on the ground, so a frog that lands
             stands, loads and pushes off again. */
          if (hop && ask > 0.2) {
            this.hopT -= dt;
            /* An arc has a top, and the top is the height THIS frame rate
               delivers (`arcApex` above), not the parabola's: 0.73 m over the feet
               for the launch one pair of legs gives with nothing in front of them,
               1.13 m at the fullest extension those same legs state, over a body
               that stands 0.43 m tall. Two things are asked about it.
               A ROOF. The five frogs of Mirrorlake walk in and out of the hollow
               shaft of the sunken tower, where the floor of the cavity they stand
               in is brick at 11 and the tower's glass is at 13: a metre of room.
               Measured, one of them pushed off there and rose 0.27 m in a single
               frame into the glass, and was then lifted out of the wall at 0.1 m
               a frame for 28 frames -- which is what the day soak of the valley
               caught one run in six. A frog under a low roof does not stop and is
               not folded into the beam: it takes the highest arc the room has,
               which is what a frog under a low roof does. And where the room has
               no arc worth taking, its legs do not load for one: a frog coiled
               under a ceiling for a minute is a frog that looks ready to spring
               and never springs. What the roof is -- the cells the arc is spent
               over, the material table's excuse for leaves, the cells the body's
               own box stands across -- is one law for both bodies of this file and
               it stands at `arcRoofRoom`; the ask below is its only caller besides
               the body worn from this animal.
               The GROUND IN FRONT. On open ground the launch is the one the
               animal's own ask wants by its next push-off -- which is what makes a
               pottering frog hop small and a fleeing one hop big, and what makes
               the ground they cover over a cycle of their own cadence the rate
               their row states. In front of a bank it is the fuller extension the
               row states, sized so the arc lands on the far side of the face. The
               body the player wears from this animal's fruit asks the same helpers
               from the same row a few hundred lines above, which is what "one
               animal, one record" means for a step as much as for a speed -- and
               it asks the same question about the roof, so neither body loads its
               legs for an arc the other would not make. */
            const fx = Math.sin(this.yaw), fz = -Math.cos(this.yaw);
            /* How far the body's own box reaches ahead of the point it is drawn
               about, along the way it is facing: the box is `hl` long and sits
               `oz` forward of that point (`bodyCells`). An arc is asked for
               ground the FEET can stand on, and feet a hand's width short of a
               face while the shoulders are through it is the same body inside the
               rock a cell higher -- found there in one frame, which is what the
               `pops` guard of test/play.js is for. */
            const front = this.hl + this.oz;
            let arc = hopLaunchNow(hop, world, this.x, this.z, this.y, fx, fz,
              ask, hop.period, dt, arcFit, undefined, front);
            /* The cells the body's box reaches into at push-off, not only the
               column its centre stands in: the centre can be a hand's width over
               the edge of a low ceiling with the column it stands in reading open
               while half the back is still under the roof. Measured at the pocket
               of the ledge at (119, 10) -- floor 26, ceiling 27, a trunk standing
               in the column across the mouth at (118, 9) -- a frog pushed off with
               its centre 5 mm over the mouth, with both of the cells the gate
               asked open, bent back across the edge over the top of the arc while
               it steered at the herd, and carried the top of its head 0.16 m into
               the ceiling for a frame; the standing watch caught it once in eight
               runs. */
            const cols = bodyCells(this, this.x, this.z);
            const room = arc ? arcRoofRoom(world, this.x, this.y, this.z, this.tall, fx, fz,
              arc.carry, arc.up, cols) : 0;
            /* The room over the head is asked before the arc is chosen, and the
               arc is then asked again with the room in it -- not lowered onto an
               arc already chosen, which takes the ground out of it and leaves it
               ending inside the face it was sized for. See `hopLaunchNow`. Where
               the room takes nothing, which is the ordinary case, the arc stands
               as it was and nothing is asked twice. */
            if (arc && room < arcApex(arc.up, dt))
              arc = hopLaunchNow(hop, world, this.x, this.z, this.y, fx, fz,
                ask, hop.period, dt, arcFit, room, front);
            const fits = arc ? arc.up : 0;
            const carry = arc ? arc.carry : 0;
            this.wind = fits > 0 ? Math.min(1, this.wind + dt / 0.18) : 0;
            if (this.hopT <= 0 && fits > 0 && Math.abs(this.y - gyH) <= 0.02) {
              /* One push, one arc: the legs give `fits` up and `carry` along the
                 ground, along the heading the body is holding, and that heading is
                 held to the landing because nothing in the air can push it
                 sideways. `arcLeft` is the ground that arc covers: `carry` over
                 the flight `fits` performs at this frame rate -- the same two
                 numbers the launch and the aim were sized from above, so the
                 ground spent and the ground asked for are one number.
                 The gate is the ground the feet are ON, both ways. `this.y <=
                 gyH + 0.02` alone lets a body standing *inside* the ground walk
                 through it: a frog 0.9 m under the top of the bank has its feet
                 under its own ground, and the inequality reads "feet down" while
                 the body is nowhere near down. The arc is then priced, the legs
                 are wound -- `wind` rises, the body looks ready to spring -- and
                 the correction below takes the rate straight back in the same
                 frame because the body is inside rock: measured before this line
                 asked both ways, at the shelf of
                 Mirrorlake, the launch asked at feet 13.1 against a ground of 14.0
                 left the body with a vertical rate of nothing at the end of that
                 frame. A body under its ground loads and does not spring -- the
                 same answer a low roof gets -- and comes out at the allowance.
                 `hopT` is the whole of the cycle to the next push-off: the arc's
                 flight is inside that countdown, not deducted from it, and the
                 feet are down for the rest of it and nothing else. Those two
                 numbers are the whole of what makes the animal's rate the rate its
                 row states: `launchForGround` sizes the launch so that the ground
                 of one arc is the ask times `period`, and the animal's own draw on
                 the cadence multiplies the cycle and the arc of the same cycle
                 together, so the draw cannot change the rate the row states. */
              this.vy = fits;
              this.arcV = carry;
              this.arcYaw = this.yaw;
              this.arcLeft = arcSpan(fits, carry, dt);
              this.hopT = hop.period * (0.75 + Math.random() * 0.55);
              this.wind = 0;
            }
          } else if (hop) { this.hopT = 0; this.wind = 0; }
          /* A body on foot is held up by the ground under it, and when the
             ground is a long way below its feet the ground has gone: the body
             falls, under the same gravity, the same terminal speed and the same
             landing squash the player's own body uses. What this replaces is a
             lerp onto the ground every frame, which is an elevator that runs
             fastest at the moment it starts: walked a body off a cliff where the
             ground falls 17 m within one metre, it came down 6.8 m in the first
             0.1 s -- 81 m/s -- eased the rest of the way to a stop, and finished
             the drop standing on a tree 5 m above the valley floor, where it
             stopped moving for the rest of the run. The same cliff now: 16 m in
             1.17 s, the speed rising from nothing to 26.8 m/s, arriving with a
             squash of 0.3 and walking on. A body steps off a ridge; it does not
             fall faster than a thrown stone.
             Down a slope is not a fall: the surface is a hand's width under the
             feet, the feet follow it, nothing is integrated. Going up is a step,
             not a lift: a body climbing onto higher ground raises its feet onto
             it at a rate, which is what the frog's branch used to do with a
             snap -- a frog that swam into the lake's bank was put 1.5 m up in a
             single frame (90 m/s) because the surface there was above its feet
             and the code moved it there in one step. */
          if (gyH > this.y + 0.02 && !inArc) {
            /* Onto a step at a rate, not as a fraction of what is left: the
               fraction is an elevator that starts fast and spends the last few
               centimetres creeping (0.15 m in the first frame, 0.008 m in the
               twentieth), and a body that is climbing a step is putting one foot
               up and pulling itself after it, which is a steady speed. Where the
               walk gate asked for this step the rate is the one that gate read from
               the ground and the body's own speed; where nothing asked -- the body
               is standing *inside* the ground -- the rate is the world's allowance
               for being raised out of it, the same allowance the correction further
               down this step spends from the same frame.
               A body in the middle of an arc is not climbing a step: the ground
               under it became the top of the bank while its feet were still below
               it, and easing it up from there is the lift on straight legs that
               the row it hops with forbids. Its own rate is integrated and the
               landing is the arc arriving at that ground. For the same reason a
               body that has just pushed off is not climbing either, in an arc or
               out of one: the legs gave a rate in that frame and this rule took it
               back -- measured, before the gate above was asked both ways, a frog
               standing in the sand of Mirrorlake had its countdown expire, the
               launch priced, and the vertical rate set to nothing, all in one
               frame, so it never once rose out of a bank on its own legs. */
            const want = gyH - this.y;
            const step = this.climbTo !== null ? Math.min(want, (this.climbRate || 3) * dt)
                                              : Math.min(want, liftLeft);
            this.y += step;
            if (this.climbTo === null) liftLeft = Math.max(0, liftLeft - step);
            this.vy = 0;
          } else if (this.vy !== 0 || this.y - gyH > 0.35) {
            /* Not standing: either the body has a vertical rate of its own --
               including the one a hop launch just gave it, which is why this
               asks for any rate rather than only a falling one -- or the ground
               has stepped out from under it. */
            this.vy = Math.max(-MAX_FALL, this.vy - GRAVITY * dt);
            this.y += this.vy * dt;
            if (this.y <= gyH) {
              if (this.vy < -1) this.squash = Math.min(0.3, -this.vy / 60);
              this.y = gyH; this.vy = 0;
            }
          } else {
            this.y = gyH; this.vy = 0;
          }
          if (hop) {
            const airWant = this.y > gyH + 0.02 ? 1 : 0;
            this.airAmt += (airWant - this.airAmt) * Math.min(1, dt * (airWant ? 7 : 11));
            this.crouch = this.y <= gyH + 0.02 ? this.wind : 0;
            /* The ground takes the rate back. A body that has arrived and has no
               vertical rate of its own has landed, and the legs that gave the
               arc are what stop it: the horizontal rate goes to 0 with the
               vertical one, and the body stands. (This asks the vertical rate as
               well as the height because the smallest arc these legs take rises
               less than the 2 cm in the line above over its first frame, and a
               law that ended that arc in its first frame would be a law against
               small frogs.) */
            if (this.vy <= 0 && this.y <= gyH + 0.02) this.arcV = this.arcLeft = 0;
          }
        }
      }
      /* A body the world is not holding up never ends the frame inside the
         world. The step gate above asks what a body would stand on and whether
         there is room over it, but never what is at the height the body happens
         to be at, and every way of moving here closes a height difference at a
         rate: a frog that hops into a one-metre step has already left the ground
         when it picks the column, and a frog that swims from a lakebed at 10 m
         into one at 11 m is asked to be at 11.05 and swims there at its own
         swimming speed. Either way the body spends the frames in between inside
         the bank -- measured, 26 of the 129600 frames of three minutes for one
         frog of Mirrorlake, every one of them a body inside the sand under the
         lake. The rules above already move it out; this does it in the frame the
         body arrives, which is also what it looks like from outside: a hop onto a
         step lands on the step.
         Wood and leaves are not in this. A body on foot walks through a bush with
         its shoulders in it and a crown is not ground to be pushed off
         (docs/03 s5); pushing bodies out of the crowns they walk through
         measured 171 one-metre pops in three minutes.
         A trunk is no longer in this list for a different reason than a leaf is:
         the gate that lets a walker into a column refuses wood on the body's own
         span now, so this rule is not what keeps a body out of a trunk -- it is
         only what keeps it out of rock -- and the crowns it does have to leave
         alone it still leaves alone: in the window the walk gate was measured
         over, no body of this valley was thrown anywhere by this correction, 0
         frames of a body moving more than 0.9 m in one frame, before and after. */
      {
        const gx = Math.floor(this.x), gy2 = Math.floor(this.y), gz = Math.floor(this.z);
        if (rockAt(world, gx, gy2, gz)) {
          /* Out, and at a rate. The distance is closed at `UNSETTLE_RATE` metres a
             second -- 0.1 m at the frame rate these windows run at:
             in the running valley every one of these corrections is a body a few
             centimetres under the surface it stands on (measured: 85 of them in
             three minutes, the largest 0.042 m), and that clears
             that in the frame it happens. What the bound is for is a body that is
             *inside* something by a metre -- put down there, or pushed there by a
             rule that has not been thought of -- which is lifted out over a
             quarter of a second instead of being thrown through the bank in one
             frame. That allowance is the frame's, not this gate's: the ground rule
             above the arc finds the same kind of body, by the same `rockAt`, and
             asks it to the same surface or a higher one, so whichever of the two
             runs first spends the frame's allowance and this one lifts the body no
             further in that frame.
             The surface it is asked to reach is the top of the cell it is inside:
             the guard above only opens on a rock cell at the body's own height,
             so the column cannot hold anything higher that this body belongs
             above. Reading the column instead -- which this used to do, with
             `groundY` -- can only answer the same number, and asks it as though
             a crown lower down in the column could be the floor of a body the
             guard has just found inside rock. */
          const out = gy2 + 1;
          if (out > this.y) this.y = Math.min(out, this.y + liftLeft);
          this.vy = 0;
        }
      }
      /* And a body never ends the frame inside another body. The step gate
         refuses a place a neighbour's trunk holds, but it reads the other bodies
         where they stood when the frame began, and two bodies walking at one
         another both see an empty place to walk into: measured over the morning
         the game opens on, in a valley born the way the game bears it, that is
         how the twelve frogs of Mirrorlake then -- the valley drives five
         now -- spent 46% of it with another frog
         inside them, the worst pair 0.43 m deep -- one body drawn exactly on top
         of another -- and the ten lamps of the tower field then, 1.9
         overlapping pairs at any one moment, 0.54 m deep. The overlap is undone
         along the shortest way out, half to each body, at the rate the world's
         own corrections work at; where the shortest way is a bank, the body
         slides along it instead. A body that cannot be put anywhere the world
         allows stays, and the other one takes the whole way round on its turn.
         And the way out of one body is not a way into another: the ten lamps of
         the tower field used to stand in a disc the size of two of them, so the
         shortest way out of one lamp was very often the middle of the next, and a
         body
         shoved into that one takes the whole field with it. Of the ways the world
         allows, the one taken is the one that leaves the body least deep in
         anybody else. */
      if (game && game.creatures) {
        /* How far the neighbours may move this body in the whole frame. The bound
           below it is per pair -- half the way out of that one overlap, at the rate
           the world's own corrections work at -- and a pair is the whole of it when
           a body is in one body. It is not the whole of it when a body is in five:
           the pairs are taken one after another and each takes its turn at the same
           body, so the frame can move it several times over, and the field of the
           sunken tower is where that showed. Ten lamps were once sampled into a disc
           of radius four round the tower whose wet part was 29 cells of 49, and the
           room a birth asked its own kind for was 0.83 m, so even with the birth
           taking the roomiest of the places it would accept, eight of the ten were
           put down inside a neighbour every time the valley was made; the field then
           spent the watch
           undoing what it was born with, and measured over 150-second watches of a
           page the way a player meets it, before this bound, the worst single frame
           moved a lamp 0.156 m at a sixtieth of a second -- 9.4 m/s, against the
           2.2 m/s its row says it swims at and the 0.92 m/s it wanders at. A bell
           thrown across its own field at four times its top speed is not a lamp
           drifting. So the frame has a budget, and the budget is the body's own
           speed: the crowd may move a body, but never faster than the body can
           move itself, and a deep overlap then takes a few more frames to undo
           along the same way out rather than being paid for in one fling. */
        const topSpeed = (inWater && sp.swimSpeed) ? sp.swimSpeed : (sp.speed || 3);
        let shoveLeft = Math.max(0.02, topSpeed * dt);
        // how deep this body is in anybody at all, before anything is shoved
        let nowIn = 0;
        for (const q of game.creatures) {
          if (q === this) continue;
          const k = bodyClash(this, this.x, this.z, q);
          if (k && k.pen > nowIn) nowIn = k.pen;
        }
        for (const o of game.creatures) {
          if (shoveLeft <= 1e-9) break;            // this body has been moved enough
          if (o === this) continue;
          if (this.y >= o.y + o.tall || o.y >= this.y + o.tall) continue;
          const c = bodyClash(this, this.x, this.z, o);
          if (!c) continue;
          const push = Math.min(c.pen * 0.5 + 0.004,
                                Math.max(0.02, 6 * dt), shoveLeft);
          let best = null, bestKey = 1e9;
          for (const [vx, vz] of [[c.ux, c.uz], [-c.uz, c.ux], [c.uz, -c.ux]]) {
            const nx = this.x + vx * push, nz = this.z + vz * push;
            if (!bodyRoom(world, this, nx, nz)) continue;
            /* And the place it is put in has to be a place the body is not inside.
               `bodyRoom` asks about the ground the body would stand on; the law
               further up that keeps a body out of the world asks about the body's
               own cell, and the two are not the same question. A file of four frogs
               packed closer than their own trunks, the front one 0.15 m off a shore
               of stone that runs up through the height they float at, was shoved
               into that stone: 8 frames of a body inside the bank, the front one
               inside block 4 at 47.96, and the law further up then lifting it out
               of the stone at 0.13 m a frame and on to the crown of the bank at
               13.0, where it stayed -- a body the lake is holding up, stood on the
               bank's stone by its own neighbours -- which is the handful of frames
               the flock step of the suite
               counts when it says a frog spent a frame inside the world (1 to 5 of
               the 2400 wet frames of its window, on some pages and not on others).
               The way out of a neighbour is not a way into the world: when the
               shortest way is the bank, this body takes the way round or stays where
               it is and lets the other one go round on its own turn. */
            if (bodyInSolid(world, this, nx, nz)) continue;
            let inMost = 0, pair = 0;
            for (const q of game.creatures) {
              if (q === this) continue;
              if (Math.abs(q.x - nx) > 2 || Math.abs(q.z - nz) > 2) continue;
              const k = bodyClash(this, nx, nz, q);
              if (!k) continue;
              if (k.pen > inMost) inMost = k.pen;
              if (q === o) pair = k.pen;
            }
            /* A shove that leaves the body deeper in somebody than it is now is
               not a way out, it is the same crowd through another door. */
            const key = inMost <= nowIn + 1e-3 ? pair : 1e3 + inMost;
            if (key < bestKey - 1e-6) { bestKey = key; best = [nx, nz]; }
          }
          if (best) { this.x = best[0]; this.z = best[1]; shoveLeft -= push; }
        }
      }

      /* The same attitude rule the player's own body has: a body the water is
         holding up points along the path it is actually taking, and a body on
         foot stays level. The vertical rate here is the height the body just
         gained or lost, because for the water animal the altitude is set
         rather than integrated -- a frog settling onto its level is settling,
         whatever its velocity says. */
      const vRate = (this.y - y0) / Math.max(dt, 0.001);
      /* Every body the water carries has a nose to point now. The valley once
         exempted one: a bell that pulses has no nose to point, and tilting one
         is a lampshade tipping over. The exemption went with the bell.
         `carried` is the answer this file's one water question gave at the top of
         this step -- the water of the column, deep enough to hold a body of this
         kind up -- and not `inWater`: a frog wading a one-block shore shelf is on
         its feet and a body on its feet stays level, which is the same sentence
         the player's own tilt reads. */
      const tiltWant = carried && this.speed > 0.3
        ? Math.max(-0.6, Math.min(0.6, Math.atan2(-vRate, Math.max(this.speed, 0.5))))
        : 0;
      this.tilt += (tiltWant - this.tilt) * N.ease(4.5, dt);
      // contact effects: no animal in the valley touches a player, except the
      // one that chases
      if (dp < (this.sp.scale || 0.2) * 8 + 0.8 && this.state === 'chase') game.onCreatureTouch(this, dt);
      walkGait(this, sp.model, sp.scale, N.walkMove(this.speed, sp.speed),
        this.x - gx, this.z - gz, this.speed, dt);
      /* The backstop for a body that cannot get to where it is going. Every
         120 of the body's own frames it is read against where it stood then:
         a body that has covered less than half a metre in them while its
         target is still farther off than the distance it calls arrived is
         walking at the target, not to it, and the target is retired the way
         the contour retires it when every step of it is a wall -- a fresh
         errand, and for a body that names a ring the fresh errand is the next
         arc of the ring, so the one that goes round the other side of the
         wall. Measured on a frog pinned at the corner of the sunken tower,
         between the water of its moat and the stone of its face: a
         centimetre at a time for the whole 2400 frames of the step that
         watches the door -- its errand thirty-five metres out, and no law in
         the frame finding it had stopped, because it had not -- and no pick
         running either, because the pick runs on arrival and the arrival was
         still thirty-five metres out. */
      this.watchF++;
      if (this.watchF % 120 === 1) {
        const sx = this.watchX, sz = this.watchZ;
        this.watchX = this.x; this.watchZ = this.z;
        if (sx !== null && this.state === 'wander' &&
            Math.hypot(this.x - sx, this.z - sz) < 0.5 &&
            Math.hypot(this.tx - this.x, this.tz - this.z) > 0.8) {
          this.tx = this.x; this.tz = this.z; this.pause = 0.5;
        }
      }
    }
  }

  /* ============================ particles ============================ */
  /* How far under the surface of its own water a mote sits, in metres: 0 when
     the cell it is inside is not liquid. The renderer cannot answer this -- it
     does not know where the water is -- and the shader cannot ask the world, so
     the depth arrives as an attribute the way the static world's does. It is
     measured at the moment of drawing rather than at spawn because a bubble
     rises: the lake it has climbed out of is gone by the time the frame is
     drawn, and a mote that has reached the air is seen through no water at all. */
  function waterAbove(W, x, y, z) {
    const xi = x | 0, yi = y | 0, zi = z | 0;
    if (!W.liquidAt(xi, yi, zi)) return 0;
    return Math.max(0, W.liquidTopAt(xi, yi, zi) - y);
  }

  class Particles {
    constructor(gl, max) {
      this.gl = gl; this.max = max || 900; this.n = 0;
      this.px = new Float32Array(this.max); this.py = new Float32Array(this.max); this.pz = new Float32Array(this.max);
      this.vx = new Float32Array(this.max); this.vy = new Float32Array(this.max); this.vz = new Float32Array(this.max);
      this.life = new Float32Array(this.max); this.max_life = new Float32Array(this.max);
      this.col = new Uint8Array(this.max * 4); this.size = new Float32Array(this.max);
      /* Downward acceleration per particle, in m/s^2. One gravity for all of
         them was wrong: bubbles fell out of the lake and fireflies sank into
         the ground inside their own lifetime. Negative is buoyant, 0 hovers
         (motes, dust, fireflies), the default is the old 1.2 for embers. */
      this.grav = new Float32Array(this.max);
      this.bPos = gl.createBuffer(); this.bCol = gl.createBuffer(); this.bSize = gl.createBuffer();
      this.bUnder = gl.createBuffer();
      this.fBuf = new Float32Array(this.max * 3);
      this.sBuf = new Float32Array(this.max);
      this.cBuf = new Uint8Array(this.max * 4);
      this.uBuf = new Float32Array(this.max);
    }
    spawn(x, y, z, vx, vy, vz, life, col, size, grav) {
      if (this.n >= this.max) return;
      const i = this.n++;
      this.px[i] = x; this.py[i] = y; this.pz[i] = z;
      this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
      this.life[i] = life; this.max_life[i] = life;
      this.grav[i] = grav === undefined ? 1.2 : grav;
      this.col[i * 4] = col[0] * 255; this.col[i * 4 + 1] = col[1] * 255; this.col[i * 4 + 2] = col[2] * 255; this.col[i * 4 + 3] = 255;
      this.size[i] = size;
    }
    update(dt, world) {
      for (let i = 0; i < this.n; i++) {
        this.life[i] -= dt;
        /* A mote is drawn, not walked. It has no size and no mass, and the frame
           it is added into has already been depth-tested, so a mote inside a block
           is not seen *through* the block -- it is simply not there, for as long as
           it is in there, holding a slot off the 900 and fading where nobody can
           see it. The valley was spending a great deal of its light that way, and
           `play.js` measures it at four spots, following every mote it is given for
           the whole of a life. Standing on a lake shore at night: **703** of
           **12,917** mote-samples inside a block. A spark burst thrown at the
           ground it stands on: **286** of **4,109**
           samples under that ground; thrown up under a crown: **426** of **4,080**
           inside the needles over its own head. And the ring the night's motes
           are scattered over reaches eighteen metres out from the body, which
           near the edge of the valley's square lies past the square -- and past
           the square is ground, the same island the square sits on, asked for by
           address: standing eight blocks in from that edge, **80-106** of the
           **586-590** fireflies that spawner lets go are out past the square and
           **23,112-27,124** of the **82,369-87,584** samples are spent there,
           over ground with ground under them (the ring is an unseeded draw, so
           those two counts are a range over two runs; the zeros are not). What that
           question used to be asked of was the map, and `get` answered "air" for
           a place nobody had asked for: the same spot then let go **85** of
           **682** fireflies off the map and spent **21,863** of **149,080**
           samples (**14.7%**) glowing at nothing.
           So the world is a wall to a mote the same way it is a wall to a body: the
           move into a solid is refused and the mote spends itself against the face
           it reached -- one read, the same one the bubble rule below already pays.
           A mote that is *already* inside one keeps its move, so it can still
           work its way out (**19** frames out of a needle). */
        const nx = this.px[i] + this.vx[i] * dt;
        const ny = this.py[i] + this.vy[i] * dt;
        const nz = this.pz[i] + this.vz[i] * dt;
        /* The step is computed in double, but the position arrays are float32,
           and that is the whole of the wall question: a destination a hair
           below a cell boundary in double stores as the boundary itself, so a
           mote asked of the double sees the near face and is left standing on
           the far side of the wall it was let through. The canopy of a crown is
           that wall one run in a while: a mote born in the air below it, rising
           at 0.5 m/s, crossed the face of a leaf cell whose double destination
           was still the air cell under it, the stored position was the leaf, and
           the rule below then kept its move (a mote the world has closed around
           keeps its move) so it walked through the canopy it was let into and
           spent the rest of its life inside it. The wall is therefore asked of the cell the
           mote is *stored* in: the move is made first (the store is the
           rounding), and a mote that was not already inside a block is put
           back where it stood and spends its speed where the stored cell is
           solid or is not a place at all -- the height the world has, and a
           finite place on the ground. It used to ask "is this cell in the
           valley's array", which was the same question only while the array was
           the world: a mote drifting past the edge of the array was treated as
           having left the world, and **21,863** of **149,080** mote-samples
           (**14.7%**) were spent off the map at a body standing eight blocks in
           from the edge, before the spawner was kept on the map at all. */
        if (world) {
          const curSolid = world.solidAt(this.px[i] | 0, this.py[i] | 0, this.pz[i] | 0);
          const ox = this.px[i], oy = this.py[i], oz = this.pz[i];
          this.px[i] = nx; this.py[i] = ny; this.pz[i] = nz;
          if (!curSolid &&
              (!world.place(this.px[i] | 0, this.py[i] | 0, this.pz[i] | 0) ||
               world.solidAt(this.px[i] | 0, this.py[i] | 0, this.pz[i] | 0))) {
            this.px[i] = ox; this.py[i] = oy; this.pz[i] = oz;
            this.vx[i] = this.vy[i] = this.vz[i] = 0;
          }
        } else {
          this.px[i] = nx; this.py[i] = ny; this.pz[i] = nz;
        }
        this.vy[i] -= this.grav[i] * dt;
        this.vx[i] *= 1 - 0.6 * dt; this.vz[i] *= 1 - 0.6 * dt;
        /* A bubble is a bubble only inside water. It is the one buoyant thing
           the valley spawns (grav < 0 -- motes and dust hover at 0, embers fall
           at 1.2), and it used to rise straight out of the lake and go on
           floating through the open air for the rest of its life: a body
           standing on a four metre shelf let go **1,455** of **3,261**
           particle-samples above the surface it was born under, the highest of
           them **3.68** m over the water. A bubble pops where it reaches the
           surface, and the cell test is the whole rule -- one read, and it pops
           a bubble that was let go in the air as well, which the spawner does:
           it spawns at the body's feet plus a random two metres, and those two
           metres reach over the surface more often than not. */
        if (this.life[i] > 0 && this.grav[i] < 0 && world &&
            !world.liquidAt(this.px[i] | 0, this.py[i] | 0, this.pz[i] | 0)) this.life[i] = 0;
        if (this.life[i] <= 0) {
          const j = --this.n;
          if (j !== i) {
            this.px[i] = this.px[j]; this.py[i] = this.py[j]; this.pz[i] = this.pz[j];
            this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j]; this.vz[i] = this.vz[j];
            this.life[i] = this.life[j]; this.max_life[i] = this.max_life[j];
            this.size[i] = this.size[j]; this.grav[i] = this.grav[j];
            this.col[i * 4] = this.col[j * 4]; this.col[i * 4 + 1] = this.col[j * 4 + 1];
            this.col[i * 4 + 2] = this.col[j * 4 + 2]; this.col[i * 4 + 3] = this.col[j * 4 + 3];
          }
          i--; continue;
        }
      }
    }
    draw(R, world) {
      if (!this.n) return;
      const gl = this.gl;
      const f = this.fBuf, s = this.sBuf, c = this.cBuf, und = this.uBuf;
      for (let i = 0; i < this.n; i++) {
        const a = Math.max(0, Math.min(1, this.life[i] / this.max_life[i]));
        f[i * 3] = this.px[i]; f[i * 3 + 1] = this.py[i]; f[i * 3 + 2] = this.pz[i];
        s[i] = this.size[i] * (0.5 + a * 0.5);
        c[i * 4] = this.col[i * 4]; c[i * 4 + 1] = this.col[i * 4 + 1];
        c[i * 4 + 2] = this.col[i * 4 + 2]; c[i * 4 + 3] = (a * 255) | 0;
        und[i] = world ? waterAbove(world, this.px[i], this.py[i], this.pz[i]) : 0;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bPos); gl.bufferData(gl.ARRAY_BUFFER, f.subarray(0, this.n * 3), gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bCol); gl.bufferData(gl.ARRAY_BUFFER, c.subarray(0, this.n * 4), gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bSize); gl.bufferData(gl.ARRAY_BUFFER, s.subarray(0, this.n), gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bUnder); gl.bufferData(gl.ARRAY_BUFFER, und.subarray(0, this.n), gl.DYNAMIC_DRAW);
      R.drawParticles({ pos: this.bPos, col: this.bCol, size: this.bSize, under: this.bUnder }, this.n);
    }
  }

  N.Player = Player;
  N.Creature = Creature;
  N.Particles = Particles;
  N.groundY = groundY;
  N.terrainY = terrainY;
  N.standY = standY;
  /* and the same read asked of a body rather than of a column: the ground its own
     box would stand on. Exported because the water's floor and the world's
     collision are one law, and a rig that wants to know which ground a body is
     being told about has to ask the body, not a column. */
  N.groundUnder = groundUnder;
  /* and the rate that ground is raised out of, because the bound a rig asks of a
     body's frame is this number times the frame plus the animal's own stroke, and
     a rig that guessed it would be checking its own guess. */
  N.unsettleRate = UNSETTLE_RATE;
  N.waterTop = waterTop;
  N.hoverLevel = hoverLevel;
  /* The two ends of the water's hold, as numbers rather than as a private
     matter of this file. They are exported because they are one pair: the level
     a body of a given height and a given `hover` hangs at, and the gap that same
     body keeps off the bottom when it asks to go down (`bedFloor`). Anything
     that asks whether a column of water can hold a diving animal -- a test rig
     laying out a lane, a place deciding where an animal may be born -- has to ask
     *this* inequality, because it is the inequality the step answers with. A
     reader who restates it from the words in the chapter gets it wrong by the
     `hover` term, and "wrong by the hang depth" is a body swimming with its legs
     against the bed. */
  N.floatLevel = floatLevel;
  N.hoverOf = hoverOf;
  N.bedFloor = bedFloor;
  /* and the top of the same hold, for the same reason: the two ends of it are
     one pair, and anything that asks whether an animal's row describes a body
     that can lie in this water has to ask whether the level it lies at is under
     the height its own stroke can carry it to. A row that puts them the other
     way round describes an animal that rests above its own reach. */
  N.surfCeiling = surfCeiling;
  /* and the one test that decides whether a column of water may hold a swimming
     body at all -- where an animal is born, where it may be sent, which way it
     may swim and the height it hangs at. Asked for from outside because the count
     of how much of a lake is like that has to be a count of what this game
     accepts, and a census that restates the two-block line from the words in a
     chapter is a second reading of one law: it is how a probe came to report a
     shore shelf as water and a body standing in it as a body swimming. */
  N.waterColumn = waterColumn;

})(window.FRUTARIA = window.FRUTARIA || {});
