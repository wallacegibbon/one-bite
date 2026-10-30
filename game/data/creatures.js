/* ==========================================================================
 *  Creature data -- mirrors docs/03-characters-and-creatures.md
 *  Two species, one per niche. One of them bears a fruit and so is a body the
 *  player can wear; the other -- the lamps of Mirrorlake -- bears nothing. It
 *  is the exception that shows what the rule costs: a fruitless species still
 *  costs a model, a habitat, a row in the attitude matrix and a place in the
 *  world, but it never changes what a door or a crevice means.
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
 *  at/spread : spawn at a named landmark of the habitat zone (not anywhere in
 *              the zone) within `spread` metres -- the lamp field is the open
 *              water of its lake, so it is placed by the water, and the tower
 *              it stands in is what the lamps steer round now and then.
 *  sting     : vitality per second spent among this animal, for touching it.
 *              A sting is not an attack -- no animal in the valley hunts the
 *              player. It is a property of the animal's body, the way the water
 *              is, and `poisonImmune` on a body shrugs it
 *              off. Contacts stack: stand among three lamps and you pay for
 *              three. Depth buys the dive: the lower sill the frog pear hangs
 *              on sits 4.7 m under the level the lamps hang at (3.9-5.5 m at
 *              any depth their band allows), against a reach of 2.08 m, while
 *              the upper sill is inside that reach for a lamp directly
 *              overhead -- and the body that takes the fruit is the one the
 *              sting does not touch. A body pays nothing for distance from the
 *              school.
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
      /* niche: open water -- drifting light. The one species in the valley that
         bears no fruit: it is not a body you can wear, it is the lamp the lake
         keeps. It never leaves the water (locomotion 'water'), and nobody can
         wear it, so no other animal has an opinion about it. It stings, which is
         not an attitude: it does not react to you at all, it simply is stinging,
         the way the water simply is deep. */
      id: 'lanternfish', cn: '灯鱼', en: 'Lanternfish', model: 'lanternfish', scale: 0.16,
      habitat: ['mirrorlake'], at: 'lake', spread: 38, active: 'both',
      locomotion: 'water', speed: 0.8, swimSpeed: 2.2, turn: 0.8, alert: 4, herd: 10,
      sting: 0.25,
      /* how far under the surface film a body of this kind hangs, measured to the
         crown of it: the lamp drifts a metre or two down, and the bob it rides
         belongs to the drift, not to the record. No body is ever worn from this
         animal, so unlike the frog's this depth is the animal's own alone. */
      hover: 1.2,
      attitude: { self: 'calm', default: 'ignore' },
      dex: '镜湖的水。灯鱼在镜湖的开阔水里游，沉塔只是它们偶尔要绕开的东西——夜里从水面看下去，塔还是发着光的。它们不追人，也不躲人；你从它们中间游过去，它们只当你是水，而你的身体不是。没人知道它们为什么亮着。',
      dexEn: 'The water of Mirrorlake. The lanternfish swim the open water of the lake; the sunken tower is only what they steer round now and then — from the surface at night, the tower still glows. They neither chase you nor run from you; swim through them and they treat you as water, which your body is not. Nobody knows why they are lit.'
    }
  ];

  N.CREATURES = CREATURES;
  N.CREATURE_BY_ID = CREATURES.reduce((m, c) => (m[c.id] = c, m), {});

})(window.FRUTARIA = window.FRUTARIA || {});
