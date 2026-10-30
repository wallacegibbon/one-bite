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
     walking around or being worn as a form. */
  N.HUMAN_FORM = { cn: '人形', en: 'human', size: [0.62, 1.8], scale: 0.18, speed: 1, jump: 1, fov: 76, step: 0.55, turn: 1.6 };

})(window.FRUTARIA = window.FRUTARIA || {});
