/* ==========================================================================
 *  FRUTARIA
 *  Player identity data -- the protagonist has NO fixed name.
 *  Mirrors: docs/03-characters-and-creatures.md sections 1 and 6
 *
 *  Why identity is split in three layers:
 *    id      -- stable machine identity, generated once per save/account.
 *               The world stores this (cellar-tree ownership, the lake's
 *               memory). It is the only layer that survives a move to
 *               multiple players.
 *    epithet -- what the valley calls you. World-given, changes with deeds,
 *               never chosen by the player. All fiction text quotes this.
 *    name    -- the player's own, mutable, not unique, and never written into
 *               the world: the save carries the id, the fiction quotes the
 *               epithet. Why a name does not travel out of the valley is an
 *               open question in docs/03 s1, not an answer stored here.
 *
 *  Writing rule that follows from this: no line of fiction may interpolate
 *  the player's name. Use the epithet, or second person. game/test/docs-sync.js
 *  fails the build if a fixed protagonist name reappears in docs/.
 * ========================================================================== */
(function (N) {

  const IDENTITY = {
    idPrefix: 'p-',
    idBytes: 6,             // id looks like "p-k3f9a2"
    nameDefault: '',        // empty until the player chooses one
    nameMax: 16,            // characters; the valley is a plain place
    nameKey: 'n',           // key that opens the rename prompt

    // what the valley calls you before you have done anything
    epithetDefault: { cn: '数果子的', en: 'the fruit counter' },

    // the valley renames you as you do things; the LAST sealed deed wins.
    // A deed is a flag, not a sentence (docs/06 s2): it carries no text the
    // player reads, so nothing of it is ever stored or translated.
    epithets: [
      { deed: 'cellar',     cn: '存果人',           en: 'the cellar-keeper' },
      { deed: 'lake',       cn: '泅过镜湖的人',      en: 'the one who swam Mirrorlake' },
      { deed: 'all',        cn: '谷地记得的人',      en: 'the one the valley remembers' }
    ]
    // There is no talent list here on purpose. The protagonist holds no talent
    // that bends the transformation rules: two magics never share one body, for
    // them as much as for anyone (docs/04 s5.2).
  };

  N.IDENTITY = IDENTITY;

  /* The body you start in. It lives here rather than in src/entities.js for the
     same reason the animals live in data/creatures.js: it is a body record, and
     `size` on it is a rule, not a rendering detail -- docs/04 s4 makes the
     collision box a hard gate. `size` is in metres (a square footprint: the box
     does not turn with the body, so a model has to fit it at any facing, which
     node-smoke.js measures). `scale` converts the model's authored units to
     metres. A model never carries its own scale: the record that asks for a body
     says how big that body is, so an animal is declared once whether it is
     walking around or being worn as a form.

     The motion fields are stated the same way an animal's row states them -- in
     metres and seconds, never as a share of somebody else's body -- because they
     are read that way now. `Player.moveDef` asks for the motion of the body a
     player is wearing, and every answer to that question is the record of the
     animal that body is: the frog's own row in data/creatures.js while a frog
     pear has been eaten, and this row otherwise. A fruit record therefore
     carries no speed, no jump, no turn: it says which animal you wear, and the
     animal says how it moves. Wearing a frog moves you at the frog's speed.
     That is also what the stride law needs: a gait is a share of the fastest
     this body travels on foot, and a body has to own that number for its legs
     to be sized by it (models.js `walkMove`, and the walk clock in entities.js).

     What each of them is, for the one body in the valley that has no animal:

       speed      the fastest this body travels on foot when it is asked to, m/s.
                  A person covers ground at 4.7 -- a run, which is what the
                  controls ask for when the forward key is held -- and it is the
                  speed the walk cycle is calibrated at, so at that speed the
                  legs are at the fullest stride the model reaches.
       sprint     the burst on top of it, as a multiple: 1.45, which is the
                  **6.815 m/s** this body covers ground at when the key is held,
                  against the **4.70** the same row gives without it. It is a
                  separate field and not folded into `speed` because it is meant to
                  be bought -- and what the build charges for it is nothing, and
                  cannot charge it anything. In air this body's breath clock only
                  ever runs up: the same **6 s** on dry ground hands the store back
                  **+6.0** units at **1.000** a second with the burst held and
                  **+6.0** with it not, while the burst does run at the multiple
                  above; and in the one place a body pays breath the burst is
                  refused outright (**2.90 m/s** at the film of the deepest column,
                  the row's own swim). A price for it would need a figure for how
                  far a body takes in above what it burns, and no row of this valley
                  states one -- so the claim that the burst spends breath is
                  measured here as a claim the build does not make, at
                  `test/play.js` (`theFrightABodyCarriesIsOnItsRecordAndPricesNoPartOfADay`,
                  `out.burstHeld`, `out.burstNone`, `out.burstInWater`), and the
                  question is kept at OPEN-ISSUES 2m rather than answered with a
                  number nobody has measured. An animal's row carries no such field,
                  and the body worn from that animal has no burst either -- the wild
                  animal has none.
       swim       the fastest this body travels through water, m/s. 2.9 is what
                  0.62 of its land speed used to come to: a body not built for
                  the lake moves through it slowly, and states that as its own
                  number now that nothing multiplies it. The animals' rows call
                  the same field `swimSpeed`, and it is called that here too:
                  one record shape, read by one code path.
       jump       the launch the push key gives the feet, m/s. 8.3 reaches
                  1.43 m over its feet -- `arcApex` in src/entities.js, the top
                  the flight of this world's frames actually draws; the
                  parabola's 1.50 m is what the same launch would reach as the
                  frame goes to nothing, and it is not the number any step or
                  roof is asked with. An animal that hops states the same thing
                  as `hop.up`, and the body worn from it is launched by that.
       turn       the most radians a second this body can add to its heading at
                  its own cruising speed -- the same field the animal rows carry.
       There is no `step` here and there was one: the height the feet lift the
       box without a jump. The ground of this valley is whole blocks, so the
       shortest riser anywhere is a metre, and 0.55 m of lift cannot reach it --
       the code that asked for it never once carried a body up a step (0.124 m
       gained in three seconds at a bank of one), and every part of a lift it did
       buy was thrown back down again. A body of this shape climbs a metre by
       jumping, which is `jump`, or it stops at the face. */
  N.HUMAN_FORM = {
    cn: '人形', en: 'human', size: [0.62, 1.8], scale: 0.18,
    speed: 4.7, sprint: 1.45, swimSpeed: 2.9, jump: 8.3, turn: 1.6,
    /* Held breath, seconds, with the head under water and the body not
       frightened. This is the number the game has always carried for a person
       under water -- a body with no animal's record under it is asked no other
       -- and it is kept here rather than in the rules so that there is one
       record per body, this one being the body the run starts in. An animal's
       row may state its own (`breath`, data/creatures.js); a body worn from an
       animal whose row states none holds its breath for this long, because a
       body that breathes air and has no animal to answer for it is a person's
       body. It is a small number next to the sea turtle's, and that is the
       point: in the open water this is the body that has to come up.
       It is a number of seconds at both ends of the clock, which is what makes
       it the whole of the arithmetic there: one second of it goes to the second
       with the head under a water this body cannot breathe, and one second comes
       back to the second of breathing with the head in air. Both ends measured
       in `test/play.js` (`theSeaTurtleBodyDragsOnSandAndSwimsThroughWater`):
       the **18** gone in **18.0 s** with the head under at **1.000** unit to the
       open second, the same **18** back in **18.0 s** of standing in air at the
       same **1.000** -- so a body that wants to go down again pays for that dive
       with the seconds it spent breathing, and five seconds there buy five
       seconds down and nothing more.
       The figure is a ceiling asked of every frame and not a target, and the
       store does not travel across a change of body: a body that stops wearing
       an animal stops wearing its lungs. Measured in that same water
       (`out.breathCross` in `test/play.js`'s
       `theSeaTurtleBodyDragsOnSandAndSwimsThroughWater`): the body worn from
       the sea turtle,
       emptied to **238** of its **240**, hands this body **238**, and one frame
       later this body holds **17.98** -- one frame's burn short of its own
       **18** -- and is empty **17.98 s** later at **1.000** a second; put this
       body's empty (**0**) on the animal and it stays **0** of its own **240**
       and pays that debt back a second to the second. */
    breath: 18,
    /* The state that decides whether that clock runs at the figure above or at a
       multiple of it: the fright this body carries. It is on this row for the same
       reason `breath` and `life` are. It was written in three places and in none of
       them it was a record: the rate it fills at (`src/game.js`, the one place the
       valley puts fright into a body), the rate it drains at (`src/entities.js`),
       and the level at which it is taken for panic together with the multiple the
       breath clock is then raised to (`src/entities.js`, in the same line as the
       question that line answers). An animal has its own startle -- `alarm`,
       `src/entities.js` -- which is a different state with a different shape and is
       never asked of the body this game wears, so this is the only record that is
       asked for it, and no animal row carries one.
       `fill` and `drain` are units of this state to the second, `panic` is the level
       of the state at which this body is taken to be panicking, and `breathRate` is
       what the clock above is multiplied by while it is. Measured end to end in
       `test/play.js` (`theFrightABodyCarriesIsOnItsRecordAndPricesNoPartOfADay`,
       every figure below is that step's `out`): a body an animal is in contact with
       gains the state at **0.79** a second -- `fill` against the `drain` the body is
       shedding in every frame -- is at the panic level **0.50 s** into that and at
       the full of the state at **1.27 s**; left alone it is back under the level
       **4.98 s** later and rid of it at **8.32 s**, because `fill` is **7.5** times
       `drain`. The branch itself is a switch at that level and not a slope: a body
       held a hundredth below it runs the clock at **1.000** units of store a second,
       a hundredth above at **1.600**.
       `breathRate` prices nothing, and this is the reason its value has never been
       arguable. The clock runs at one rate at both of its ends (`breath` above), so
       a multiple of it cancels over any stretch a body spends half under water and
       half breathing: with the state pinned at one level throughout, **8.5 s** under
       a surface spends **13.6** of this body's **18** at **1.600** a second and
       **8.5 s** with the head out hands **13.6** back at **1.600**, the store back
       where it began -- and the same at **1.000** with the state not pinned. What a
       dive costs at the surface is the length of the dive, either way. What the
       figure moves is where in a day the store runs out: on the bed of this valley's
       deepest column, where there is no surface to reach, **11.25 s** instead of
       **18.00 s** (the same bed, and the same readings, as
       `theDeepestWaterIsMeasuredAgainstTheBodyThatFallsIntoIt` below). What it
       should be is still open, and it is open for a reason now rather than for
       nobody having tried: nothing that measures a day can decide it.
       And this valley never fills the state at all. The one call that fills it is
       made by an animal in the chase state, and an animal is put there only toward a
       form its row says it is hostile to: of the **2** animal rows this build carries
       against the **3** forms its fruits can put a body in, **0** of the **6** pairs
       answers hostile. The state is filled by rigs. So the sentence below about this
       row's deepest floor being fatal "at the panic figure" is a conditional the
       valley itself never opens.
       And the water is not the cause that should open it. It already charges the
       second this clock runs on, so a state the medium itself caused would charge the
       same second twice -- once through the figure above and once through a multiple
       of it. Asked as a measurement, both ways, in `test/play.js`
       (`theWaterThatTakesASecondOfABodysBreathDoesNotAlsoFrightenTheBodyThatPaysIt`:
       `out.shipped`, `out.waterCaused`, `out.cycleShipped`, `out.cycleWaterCaused`) --
       the rig fills the state at `fill`, this row's own figure, no number written
       newly anywhere, and asks the head the same question the clock asks --: on the bed
       of this valley's deepest column the shipped rules leave the state at **0** and
       the store runs the **18.00 s** this row states, while the same body with the
       water as its cause is past the level at **0.52 s**, runs at this row's figure
       for **0.52 s** of it, is empty at **11.45 s** and lies dead at **20.53 s** where
       the body the game ships is alive at **22 s**. And the nothing proved above stops
       being nothing the moment the cause is something the body leaves behind: a
       **8.5 s** dive with no cause spends **8.5** units and is handed back by **8.50 s**
       of standing in air, while the same dive caused by the water spends **13.29** and
       owes **10.32 s** of breathing for them, **1.82 s** more than the dive took --
       which is this row's multiple short of the part of that stretch the state spent
       below the level at both of its ends (the test asserts the two agree to within a
       tenth of a second). What would set a body's price for its own drowning is
       therefore `(1 - panic) / drain`: the multiplied end of the clock stays open
       **4.98 s** after the body is out of the water, and that is a figure about how
       fast a body calms down from an animal standing next to it. No figure for how
       fast water frightens a body is wanted after all: the water is not to be asked as
       a cause at all. */
    fright: { fill: 0.9, drain: 0.12, panic: 0.4, breathRate: 1.6 },
    /* How much of this body the valley's prices are taken out of. The field the
       body carries it in is `vital`; the page draws one mark for each unit of it
       (`vitals` in src/ui.js, and `test/play.js`
       (`theDeepestWaterIsMeasuredAgainstTheBodyThatFallsIntoIt`) counts the marks
       against this figure, because a record and a gauge that disagree about it
       would be one fact written twice). It is stated here and nowhere else: the
       same figure was written in three places -- this body's first state, the
       state it is put back into when it dies, and the number of marks the gauge
       draws -- and none of the three was the record.
       No animal row states it. Nothing in this build ever takes vitality out of a
       wild body: the prices the valley charges a body -- drowning, drying skin,
       an animal's teeth -- are all charged to this one, so this is the only
       record that is asked for it.
       With `breath` it is the whole of what a body can do under water, and the
       pair is what the deepest water in this valley is measured against. The
       water takes this at a price the water states, not on this row: **0.55** of
       it to the second with the head under and the store already empty -- read
       back out of the water itself as **0.5507**, which is that figure with the
       frame's own quantization in it. Measured,
       in the deepest column this world carves -- **11** blocks of water, film at
       y15, bed at y4, the column docs/02 s3 counts -- with the body standing on
       that bed and nothing asked of it, it is dead at **27.08 s**: the **18** its
       own row states, then **9.08 s** of the water taking **5** at that price.
       Given twice this figure the same body lies under the same water for twice
       the drowning (**36.17 s**) at a price that moved by **0.0003**, which is
       what says the figure on the row is the whole of the arithmetic.
       Asked with the climb key held it reaches the film **21.35 s** after it was
       put there, its head out **3.35 s** past the end of its own breath, alive,
       having paid **1.842** of the **5** for the climb: the deepest floor of this
       valley is survivable by the body the run starts in, with **5.73 s** to
       spare. Held at the panic figure the same floor
       is not: the store is empty at **11.25 s** and the body is dead at
       **20.33 s** with its head never once out -- which is what the state above
       (`fright.breathRate`) is worth here. It is a conditional this valley never
       opens, for the reason stated there: nothing in the build ever frightens a
       body, and the water above it is not to be asked to, which that same
       `test/play.js` step measures in both directions. The figure's value stays an open question at OPEN-ISSUES 2m, and this
       row does not settle it. Every figure in this comment is a
       rig of `test/play.js`
       (`theDeepestWaterIsMeasuredAgainstTheBodyThatFallsIntoIt`: `out.reach`,
       `out.reachTwice`, `out.climb`, `out.panicked`, `out.swim`). */
    life: 5,
    fov: 76
  };

})(window.FRUTARIA = window.FRUTARIA || {});
