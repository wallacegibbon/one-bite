/* ==========================================================================
 *  Creature data -- mirrors docs/en/03-characters-and-creatures.md
 *  One species per ecological niche. Seven niches, seven species.
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
      /* niche: the ground -- digging, and a body that is its own armour */
      id: 'pangolin', cn: '穿山甲', en: 'Burrow Pangolin', model: 'pangolin', scale: 0.16,
      habitat: ['orchard', 'whisperwood', 'mountains'], active: 'dusk',
      locomotion: 'walk', speed: 2.2, alert: 10, herd: 1,
      fruit: 'scaleberry',
      attitude: { self: 'calm', default: 'ignore', bear: 'flee', human: 'curious' },
      dex: '它挖的洞比灯笼镇的果窖老得多——镇上的果窖形制，据说是抄熊的，而熊是抄穿山甲的。受惊时它把自己卷成一枚鳞片球，任何牙齿都无从下口。',
      dexEn: 'The tunnels it digs are far older than Lanternrow\'s cellar — the shape of the town\'s cellar is said to be copied from bears, and bears copied it from pangolins. Frightened, it rolls itself into a ball of scales that no tooth can get a hold of.'
    },
    {
      /* niche: the forest -- speed and leaping, and being prey */
      id: 'deer', cn: '白尾鹿', en: 'Fallow Deer', model: 'deer', scale: 0.19,
      habitat: ['whisperwood', 'deepgrove', 'glowglade'], active: 'both',
      locomotion: 'walk', speed: 5.4, alert: 20, herd: 6,
      fruit: 'stagcap',
      attitude: { self: 'calm', default: 'flee', bear: 'flee', frog: 'ignore', human: 'flee' },
      dex: '鹿径不是路，是几百年里被同一群鹿踩出来的"决定"。跟着鹿径走一定能找到水，也一定能找到熊。',
      dexEn: 'A deer path is not a road, it is a "decision" pressed into the ground by the same herd over centuries. Follow a deer path and you will certainly find water, and you will certainly find a bear.'
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
      attitude: { self: 'calm', default: 'ignore', owl: 'flee', bear: 'ignore', deer: 'ignore' },
      dex: '雨后整片湖岸一起叫，声音能压过钟塔。它们不喝水——它们靠皮肤喝。',
      dexEn: 'After rain the whole shore calls at once, loud enough to drown out the bell tower. They do not drink — they drink through their skin.'
    },
    {
      /* niche: caves and old beams -- climbing */
      id: 'spider', cn: '梁蛛', en: 'Beamborn Spider', model: 'spider', scale: 0.18,
      habitat: ['batcave', 'orchard', 'cloudspire', 'starfall'], active: 'both',
      locomotion: 'walk', speed: 3.0, alert: 10, herd: 1,
      fruit: 'silkberry',
      attitude: { self: 'calm', default: 'ignore', bear: 'ignore' },
      dex: '住在梁上，不结网捕虫，结网"补房子"。果园遗迹和云顶浮岛的旧梁至今没塌，靠的是它们三百年织的梁。',
      dexEn: 'Lives in the beams, spins no webs for insects, spins webs to repair buildings. The old beams of the Old Orchard and of the Cloudspire isles have not collapsed, and that is thanks to three hundred years of web.'
    },
    {
      /* niche: the ridge -- strength */
      id: 'bear', cn: '灰熊', en: 'Ash Bear', model: 'bear', scale: 0.24,
      habitat: ['mountains', 'whisperwood'], active: 'both',
      locomotion: 'walk', speed: 5.0, alert: 22, herd: 1,
      fruit: 'bruinfig',
      attitude: { self: 'calm', default: 'ignore', deer: 'hostile', pangolin: 'hostile', frog: 'ignore' },
      dex: '北岭的熊会挖"果窖"——它们比人类更早学会把果实埋起来慢慢吃。它们也拆人类的窖树：熊不需要背包。',
      dexEn: 'The bears of the northern ridge dig "fruit cellars" — they learned to bury fruit and eat it slowly long before humans did. They also tear down human cellar trees: a bear needs no backpack.'
    }
  ];

  N.CREATURES = CREATURES;
  N.CREATURE_BY_ID = CREATURES.reduce((m, c) => (m[c.id] = c, m), {});

})(window.FRUTARIA = window.FRUTARIA || {});
