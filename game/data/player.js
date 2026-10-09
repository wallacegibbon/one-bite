/* ==========================================================================
 *  FRUTARIA
 *  Player identity data -- the protagonist has NO fixed name.
 *  Mirrors: docs/en/03-characters-and-creatures.md sections 1 and 6
 *           (the Chinese set under docs/cn/ is the same text, same section numbers)
 *
 *  Why identity is split in three layers:
 *    id      -- stable machine identity, generated once per save/account.
 *               The world stores this (cellar-tree ownership, owl post, the
 *               lake's memory, beast residue). It is the only layer that
 *               survives a move to multiple players.
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

    // the valley renames you as you do things; the LAST completed one wins
    epithets: [
      { quest: 'q1',  cn: '存果人',           en: 'the cellar-keeper' },
      { quest: 'q3',  cn: '夜翼',             en: 'nightwing' },
      { quest: 'q4',  cn: '泅过镜湖的人',      en: 'the one who swam Mirrorlake' },
      { quest: 'q5',  cn: '走进深林的人',      en: 'the one who walked the grove' },
      { quest: 'q6',  cn: '云顶结网的人',      en: 'the cloud-top webster' },
      { quest: 'all', cn: '谷地记得的人',      en: 'the one the valley remembers' }
    ]
    // There is no talent list here on purpose. The protagonist holds no talent
    // that bends the transformation rules: two magics never share one body, for
    // them as much as for anyone (docs/en/04 s5.2).
  };

  N.IDENTITY = IDENTITY;

})(window.FRUTARIA = window.FRUTARIA || {});
