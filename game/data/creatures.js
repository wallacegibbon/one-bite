/* ==========================================================================
 *  Creature data -- mirrors docs/en/03-characters-and-creatures.md
 *  Four species, one per niche, and every one of them has a fruit: each is a
 *  body the player can wear. An animal without a fruit is allowed later (the
 *  valley is full of places named after animals that are no longer here), but
 *  it would be scenery, not a transformation.
 *  attitude  : reaction to the player's current form; self=same species, default=fallback
 *  locomotion: walk / fly / water / amphibian -- how the body moves. The code
 *              asks this instead of asking "is this the owl?", so a second flying
 *              species would fly without anyone editing the movement code.
 *  active    : active period; day / night / both / dusk
 *  dex/dexEn: the codex entry, always "a verifiable fact + an unverifiable rumour"
 * ========================================================================== */
(function (N) {

  const CREATURES = [
    {
      /* niche: the night sky -- flight */
      id: 'owl', cn: '猫头鹰', en: 'Screech Owl', model: 'owl', scale: 0.16,
      habitat: ['whisperwood', 'starfall', 'glowglade', 'cloudspire'], active: 'night',
      locomotion: 'fly', speed: 3.2, flySpeed: 7.0, alert: 12, herd: 1,
      fruit: 'owlberry',
      attitude: { self: 'calm', default: 'flee', frog: 'curious', bear: 'flee' },
      dex: '白天塞在树洞里，像一截会呼吸的木头。夜里它是整片林子的耳朵。谷地里的猫头鹰不抓老鼠——它们抓"失窃的果实"，是灯笼镇义务巡逻队。',
      dexEn: 'By day it is wedged in a tree hollow like a piece of wood that breathes. At night it is the ear of the whole wood. The owls of the valley do not catch mice — they catch "stolen fruit", and they are Lanternrow\'s volunteer patrol.'
    },
    {
      /* niche: open water -- drifting light */
      id: 'jelly', cn: '灯水母', en: 'Lamp Jellyfish', model: 'jelly', scale: 0.16,
      habitat: ['mirrorlake'], active: 'both',
      locomotion: 'water', speed: 0.8, swimSpeed: 2.2, alert: 4, herd: 10,
      fruit: 'jellybloom',
      attitude: { self: 'calm', default: 'ignore', frog: 'ignore' },
      dex: '镜湖的灯。水母田的位置就是湖底沉塔的轮廓——从水面看下去，塔在发光。',
      dexEn: 'The lamps of Mirrorlake. The jellyfish field sits exactly in the outline of the sunken tower on the lakebed — from the surface, the tower glows.'
    },
    {
      /* niche: the shallows -- jumping, and breathing through the skin */
      id: 'frog', cn: '雨蛙', en: 'Mirrorlake Frog', model: 'frog', scale: 0.13,
      habitat: ['mirrorlake', 'glowglade', 'starfall'], active: 'both',
      locomotion: 'amphibian', speed: 1.8, swimSpeed: 4.6, alert: 12, herd: 12,
      fruit: 'frogpear',
      attitude: { self: 'calm', default: 'ignore', owl: 'flee', bear: 'ignore' },
      dex: '雨后整片湖岸一起叫，声音能压过钟塔。它们不喝水——它们靠皮肤喝。',
      dexEn: 'After rain the whole shore calls at once, loud enough to drown out the bell tower. They do not drink — they drink through their skin.'
    },
    {
      /* niche: the ridge -- strength, and a body that is its own weatherproofing */
      id: 'bear', cn: '棕熊', en: 'Brown Bear', model: 'bear', scale: 0.24,
      habitat: ['mountains', 'whisperwood'], active: 'both',
      locomotion: 'walk', speed: 5.0, alert: 22, herd: 1,
      fruit: 'bruinfig',
      attitude: { self: 'calm', default: 'ignore', frog: 'ignore', jelly: 'ignore' },
      dex: '北岭的熊会挖"果窖"——它们比人类更早学会把果实埋起来慢慢吃。它们也拆人类的窖树：熊不需要背包。',
      dexEn: 'The bears of the northern ridge dig "fruit cellars" — they learned to bury fruit and eat it slowly long before humans did. They also tear down human cellar trees: a bear needs no backpack.'
    }
  ];

  N.CREATURES = CREATURES;
  N.CREATURE_BY_ID = CREATURES.reduce((m, c) => (m[c.id] = c, m), {});

})(window.FRUTARIA = window.FRUTARIA || {});
