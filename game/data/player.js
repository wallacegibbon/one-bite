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
      { quest: 'q5',  cn: '假独角兽',          en: 'the false unicorn' },
      { quest: 'q6',  cn: '携焰者',            en: 'the ember-bearer' },
      { quest: 'all', cn: '谷地记得的人',      en: 'the one the valley remembers' }
    ],

    // A trait of a character, not a law of the world. In a single-player game
    // the protagonist has it; in a multiplayer game it must be rare, so the
    // grafting ending can never be assumed for a given player.
    traits: {
      mixStomach: {
        id: 'mixStomach', cn: '混胃', en: 'mixed stomach',
        note: '能在体内同时压住两种魔法而不翻搅——终章"嫁接"路线的前提'
      }
    }
  };

  N.IDENTITY = IDENTITY;

})(window.FRUTARIA = window.FRUTARIA || {});
