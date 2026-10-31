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
 *              the course bends, and this is the animal's agility. The form
 *              record of the same species carries the same number, because the
 *              animal and the body worn from it are one body (play.js checks
 *              that the two agree).
 *  active    : active period; day / night / both / dusk
 *  dex/dexEn: the codex entry, always "a verifiable fact + an unverifiable rumour"
 * ========================================================================== */
(function (N) {

  const CREATURES = [
    {
      /* niche: the shallows -- jumping, and breathing through the skin */
      id: 'frog', cn: '雨蛙', en: 'Mirrorlake Frog', model: 'frog', scale: 0.13,
      habitat: ['mirrorlake', 'glowglade', 'starfall'], active: 'both',
      locomotion: 'amphibian', speed: 1.8, swimSpeed: 4.6, turn: 0.9, hop: { up: 6.0, period: 0.9 }, alert: 12, herd: 8,
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
    }
  ];

  N.CREATURES = CREATURES;
  N.CREATURE_BY_ID = CREATURES.reduce((m, c) => (m[c.id] = c, m), {});

})(window.FRUTARIA = window.FRUTARIA || {});
