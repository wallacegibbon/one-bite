/* ==========================================================================
 *  Creature data -- mirrors docs/03-characters-and-creatures.md
 *  Four species, one per niche. Three of them bear a fruit and so are a body the
 *  player can wear; the fourth -- the lamps of Mirrorlake -- bears nothing. It
 *  is the exception that shows what the rule costs: a fruitless species still
 *  costs a model, a habitat, a row in the attitude matrix and a place in the
 *  world, but it never changes what a door or a crevice means.
 *  attitude  : reaction to the player's current form; self=same species, default=fallback
 *  locomotion: walk / fly / water / amphibian -- how the body moves. The code
 *              asks this instead of asking "is this the owl?", so a second flying
 *              species would fly without anyone editing the movement code.
 *  turn      : the most radians a second this animal can add to its heading at
 *              its own cruising speed. Nothing with a body turns on the spot --
 *              the course bends, and this is the animal's agility. The form
 *              record of the same species carries the same number, because the
 *              animal and the body worn from it are one body (play.js checks
 *              that the two agree, for this field and for flySpeed).
 *  at/spread : spawn at a named landmark of the habitat zone (not anywhere in
 *              the zone) within `spread` metres -- the lamp field is the sunken
 *              tower's outline, so it is placed by the tower, not by the lake.
 *  sting     : vitality per second spent inside this animal, for touching it.
 *              A sting is not an attack -- no animal in the valley hunts the
 *              player. It is a property of the animal's body, the way the ridge
 *              cold and the water are, and `poisonImmune` on a body shrugs it
 *              off. Contacts stack: stand inside three lamps and you pay for
 *              three, while the middle of the ring -- the tower's own top,
 *              which pokes through the surface -- pays nothing.
 *  active    : active period; day / night / both / dusk
 *  dex/dexEn: the codex entry, always "a verifiable fact + an unverifiable rumour"
 * ========================================================================== */
(function (N) {

  const CREATURES = [
    {
      /* niche: the night sky -- flight */
      id: 'owl', cn: '猫头鹰', en: 'Screech Owl', model: 'owl', scale: 0.15,
      habitat: ['whisperwood', 'starfall', 'glowglade', 'cloudspire'], active: 'night',
      locomotion: 'fly', speed: 3.2, flySpeed: 7.0, turn: 1.4, alert: 12, herd: 1,
      fruit: 'owlberry',
      attitude: { self: 'calm', default: 'flee', frog: 'curious', bear: 'flee' },
      dex: '白天塞在树洞里，像一截会呼吸的木头。夜里它是整片林子的耳朵。谷地里的猫头鹰不抓老鼠——它们抓"失窃的果实"，是灯笼镇义务巡逻队。',
      dexEn: 'By day it is wedged in a tree hollow like a piece of wood that breathes. At night it is the ear of the whole wood. The owls of the valley do not catch mice — they catch "stolen fruit", and they are Lanternrow\'s volunteer patrol.'
    },
    {
      /* niche: the shallows -- jumping, and breathing through the skin */
      id: 'frog', cn: '雨蛙', en: 'Mirrorlake Frog', model: 'frog', scale: 0.13,
      habitat: ['mirrorlake', 'glowglade', 'starfall'], active: 'both',
      locomotion: 'amphibian', speed: 1.8, swimSpeed: 4.6, turn: 1.9, hop: { up: 6.0, period: 0.9 }, alert: 12, herd: 12,
      /* how far under the level the water floats it a resting body of this kind
         hangs: a frog built for the lake does not lie under the surface film. The
         body worn from this animal's fruit is held at the same depth. */
      hover: 1.6,
      fruit: 'frogpear',
      attitude: { self: 'calm', default: 'ignore', owl: 'flee', bear: 'ignore' },
      dex: '雨后整片湖岸一起叫，声音能压过钟塔。它们不喝水——它们靠皮肤喝。',
      dexEn: 'After rain the whole shore calls at once, loud enough to drown out the bell tower. They do not drink — they drink through their skin.'
    },
    {
      /* niche: the ridge -- a big body, and a body that is its own weatherproofing */
      id: 'bear', cn: '棕熊', en: 'Brown Bear', model: 'bear', scale: 0.24,
      habitat: ['mountains', 'whisperwood'], active: 'both',
      locomotion: 'walk', speed: 5.0, turn: 1.6, alert: 22, herd: 1,
      fruit: 'bruinfig',
      attitude: { self: 'calm', default: 'ignore', frog: 'ignore' },
      dex: '北岭的熊会挖"果窖"——它们比人类更早学会把果实埋起来慢慢吃。它们也拆人类的窖树：熊不需要背包。',
      dexEn: 'The bears of the northern ridge dig "fruit cellars" — they learned to bury fruit and eat it slowly long before humans did. They also tear down human cellar trees: a bear needs no backpack.'
    },
    {
      /* niche: open water -- drifting light. The one species in the valley that
         bears no fruit: it is not a body you can wear, it is the lamp the lake
         keeps. It never leaves the water (locomotion 'water'), and nobody can
         wear it, so no other animal has an opinion about it. It stings, which is
         not an attitude: it does not react to you at all, it simply is stinging,
         the way the ridge simply is cold. */
      id: 'jelly', cn: '灯水母', en: 'Lamp Jellyfish', model: 'jelly', scale: 0.16,
      habitat: ['mirrorlake'], at: 'tower', spread: 4, active: 'both',
      locomotion: 'water', speed: 0.8, swimSpeed: 2.2, turn: 0.8, alert: 4, herd: 10,
      sting: 0.25,
      /* how far under the surface film a body of this kind hangs, measured to the
         crown of it: the lamp drifts a metre or two down, and the bob it rides
         belongs to the drift, not to the record. No body is ever worn from this
         animal, so unlike the frog's this depth is the animal's own alone. */
      hover: 1.2,
      attitude: { self: 'calm', default: 'ignore' },
      dex: '镜湖的灯。水母田的位置就是湖底沉塔的轮廓——从水面看下去，塔在发光。它们不追人，也不躲人；你从它们中间游过去，它们只当你是水，而你的身体不是。没人知道它们为什么亮着。',
      dexEn: 'The lamps of Mirrorlake. The jellyfish field sits exactly in the outline of the sunken tower on the lakebed — from the surface, the tower glows. They neither chase you nor run from you; swim through them and they treat you as water, which your body is not. Nobody knows why they are lit.'
    }
  ];

  N.CREATURES = CREATURES;
  N.CREATURE_BY_ID = CREATURES.reduce((m, c) => (m[c.id] = c, m), {});

})(window.FRUTARIA = window.FRUTARIA || {});
