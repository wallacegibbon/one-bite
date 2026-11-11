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
 *    name    -- the player's own, mutable, not unique, and by worldview
 *               design the one thing the Grey Veil cannot carry out.
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
                  1.50 m under this world's gravity (up*up/2g) over a body that
                  stands 1.8 m tall. An animal that hops states the same thing
                  as `hop.up`, and the body worn from it is launched by that.
       turn       the most radians a second this body can add to its heading at
                  its own cruising speed -- the same field the animal rows carry.
       step       how high the feet lift the box without a jump, metres. This one
                  stays on the body record and not on the animal's: it is a
                  property of the collision box the world enforces, which is the
                  form's, and not of the animal's legs. */
  N.HUMAN_FORM = {
    cn: '人形', en: 'human', size: [0.62, 1.8], scale: 0.18,
    speed: 4.7, sprint: 1.45, swimSpeed: 2.9, jump: 8.3, turn: 1.6,
    fov: 76, step: 0.55
  };

})(window.FRUTARIA = window.FRUTARIA || {});
