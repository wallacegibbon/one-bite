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
       sprint     the burst on top of it, as a multiple: 1.45, so 6.8 m/s. It is
                  a separate field and not folded into `speed` because it is
                  bought: it spends breath, and it is off in water. An animal's
                  row carries no such field, and the body worn from that animal
                  has no burst either -- the wild animal has none.
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
    fov: 76
  };

})(window.FRUTARIA = window.FRUTARIA || {});
