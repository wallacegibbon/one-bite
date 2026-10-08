/* ==========================================================================
 *  Creature data -- mirrors docs/03 (characters & creatures)
 *  attitude: reaction to the player's current form; self=same species, default=fallback
 *  active  : active period; day / night / both / dusk
 * ========================================================================== */
(function (N) {

  const CREATURES = [
    {
      id: 'owl', cn: '猫头鹰', en: 'Screech Owl', model: 'owl', scale: 0.16,
      habitat: ['whisperwood', 'starfall', 'glowglade'], active: 'night',
      speed: 3.2, flySpeed: 7.0, alert: 12, flee: 8, herd: 1,
      fruit: 'owlberry',
      attitude: { self: 'calm', default: 'flee', unicorn: 'curious', dragon: 'flee' },
      dex: '白天塞在树洞里，像一截会呼吸的木头。夜里它是整片林子的耳朵。谷地里的猫头鹰不抓老鼠——它们抓“失窃的果实”，是灯笼镇义务巡逻队。'
    },
    {
      id: 'bat', cn: '蝙蝠', en: 'Grey Bat', model: 'bat', scale: 0.13,
      habitat: ['batcave', 'whisperwood'], active: 'night',
      speed: 2.4, flySpeed: 8.5, alert: 10, flee: 6, herd: 8,
      fruit: 'batfruit',
      attitude: { self: 'calm', default: 'ignore', owl: 'curious', dragon: 'flee' },
      dex: '它们用“合唱”定位：一整洞蝙蝠同时发声，把隧道画成一张声音的地图。变成蝙蝠后你会不由自主地加入合唱。'
    },
    {
      id: 'moth', cn: '萤蛾', en: 'Lantern Moth', model: 'moth', scale: 0.10,
      habitat: ['glowglade', 'whisperwood', 'mirrorlake'], active: 'night',
      speed: 1.6, flySpeed: 4.5, alert: 6, flee: 4, herd: 12,
      fruit: 'glowmoth',
      attitude: { self: 'calm', default: 'ignore', dragon: 'flee' },
      dex: '发光种子开出的蛾。它们会排成一条线，指向最近的水源——老采果人管这叫“蛾路”，是迷路时最可靠的指南针。'
    },
    {
      id: 'otter', cn: '水獭', en: 'Lake Otter', model: 'otter', scale: 0.15,
      habitat: ['mirrorlake', 'orchard'], active: 'both',
      speed: 2.6, swimSpeed: 5.5, alert: 14, flee: 9, herd: 4,
      fruit: 'otterkin',
      attitude: { self: 'calm', default: 'curious', merfolk: 'ignore', fox: 'flee', dragon: 'flee' },
      dex: '会把石头藏在腋下睡觉。它们偷人鱼村的贝壳，人鱼睁一只眼闭一只眼——因为水獭会替人鱼把沉船里的东西搬上来。'
    },
    {
      id: 'fox', cn: '赤狐', en: 'Ember Fox', model: 'fox', scale: 0.15,
      habitat: ['whisperwood', 'lanternrow', 'orchard'], active: 'both',
      speed: 4.6, alert: 16, flee: 11, herd: 2,
      fruit: 'vulpine',
      attitude: { self: 'calm', default: 'flee', bear: 'flee', dragon: 'flee', human: 'curious' },
      dex: '灯笼镇的鸡舍从来不上锁，因为狐狸只偷“掉在地上的”。镇民因此认定狐狸是诚实的——这条法律已经三百年没被推翻。'
    },
    {
      id: 'deer', cn: '白尾鹿', en: 'Fallow Deer', model: 'deer', scale: 0.19,
      habitat: ['whisperwood', 'deepgrove', 'glowglade'], active: 'both',
      speed: 5.4, alert: 20, flee: 14, herd: 6,
      fruit: 'stagcap',
      attitude: { self: 'calm', default: 'flee', unicorn: 'curious', fox: 'flee', bear: 'flee', dragon: 'flee' },
      dex: '鹿径不是路，是几百年里被同一群鹿踩出来的“决定”。跟着鹿径走一定能找到水，也一定能找到狼。'
    },
    {
      id: 'jelly', cn: '灯水母', en: 'Lamp Jellyfish', model: 'jelly', scale: 0.16,
      habitat: ['mirrorlake'], active: 'both',
      speed: 0.8, swimSpeed: 2.2, alert: 4, flee: 0, herd: 10,
      fruit: 'jellybloom',
      attitude: { self: 'calm', default: 'ignore', merfolk: 'ignore', dragon: 'flee' },
      dex: '镜湖的灯。水母田的位置就是湖底沉塔的轮廓——从水面看下去，塔在发光。'
    },
    {
      id: 'merfolk', cn: '人鱼', en: 'Mirrorlake Merrow', model: 'merfolk', scale: 0.20,
      habitat: ['mirrorlake'], active: 'both',
      speed: 1.2, swimSpeed: 5.0, alert: 18, flee: 10, herd: 5,
      fruit: 'merrow',
      attitude: { self: 'calm', default: 'flee', otter: 'ignore', jelly: 'ignore', dragon: 'hostile', human: 'hostile' },
      dex: '人鱼不数人头，数“归还”。你每还一样湖中之物，它们就给你一件。你每拿走一样，湖就记住你一次。'
    },
    {
      id: 'unicorn', cn: '独角兽', en: 'Hoar Unicorn', model: 'unicorn', scale: 0.22,
      habitat: ['deepgrove'], active: 'both',
      speed: 7.2, alert: 26, flee: 18, herd: 4,
      fruit: 'unicorncherry',
      attitude: { self: 'calm', default: 'hostile', deer: 'curious', fox: 'hostile', dragon: 'hostile', bear: 'hostile' },
      dex: '它们攻击的不是人，是“说谎的形状”——任何伪装成独角兽的人形都会被顶穿。所以圣林唯一的通行证，是真的变成独角兽。'
    },
    {
      id: 'spider', cn: '梁蛛', en: 'Beamborn Spider', model: 'spider', scale: 0.18,
      habitat: ['batcave', 'orchard', 'starfall'], active: 'both',
      speed: 3.0, alert: 10, flee: 6, herd: 1,
      fruit: 'silkberry',
      attitude: { self: 'calm', default: 'ignore', bear: 'flee', dragon: 'flee' },
      dex: '住在梁上，不结网捕虫，结网“补房子”。果园遗迹至今没塌，靠的是它们三百年织的梁。'
    },
    {
      id: 'bear', cn: '灰熊', en: 'Ash Bear', model: 'bear', scale: 0.24,
      habitat: ['cloudspire', 'whisperwood'], active: 'both',
      speed: 5.0, alert: 22, flee: 0, herd: 1,
      fruit: 'bruinfig',
      attitude: { self: 'calm', default: 'ignore', fox: 'hostile', deer: 'hostile', dragon: 'hostile' },
      dex: '北岭的熊会挖“果窖”——它们比人类更早学会把果实埋起来慢慢吃。灯笼镇的果窖形制，据说是抄熊的。'
    },
    {
      id: 'dragon', cn: '灰鳞龙', en: 'Ashscale Dragon', model: 'dragon', scale: 0.34,
      habitat: ['cloudspire'], active: 'both',
      speed: 4.0, flySpeed: 12.0, alert: 40, flee: 0, herd: 2,
      fruit: 'embercore',
      attitude: { self: 'calm', default: 'ignore', dragon: 'hostile', merfolk: 'hostile', unicorn: 'hostile' },
      dex: '谷地里只登记过三只成年灰鳞龙。它们不落地，只在云顶绕圈——落地的龙，说明它已经不行了。'
    },
    {
      id: 'veilbeast', cn: '灰雾兽', en: 'Veilbeast', model: 'veilbeast', scale: 0.21,
      habitat: ['veil'], active: 'both',
      speed: 4.2, alert: 30, flee: 0, herd: 3,
      fruit: 'veilberry',
      attitude: { self: 'calm', default: 'hostile', dragon: 'hostile' },
      dex: '它们不咬人，只“拿走”。被灰雾兽碰过的背包格会空一颗，而且你想不起来那颗是什么。'
    },
    {
      id: 'phoenix', cn: '灰烬凤凰', en: 'Ash Phoenix', model: 'phoenix', scale: 0.20,
      habitat: ['cloudspire'], active: 'dusk',
      speed: 3.0, flySpeed: 11.0, alert: 25, flee: 12, herd: 1,
      fruit: 'phoenixpit',
      attitude: { self: 'calm', default: 'ignore', dragon: 'hostile', veilbeast: 'hostile' },
      dex: '黄昏时才会被看见。它每次落地都会烧掉一小片云，所以云顶永远有新鲜的灰。'
    }
  ];

  N.CREATURES = CREATURES;
  N.CREATURE_BY_ID = CREATURES.reduce((m, c) => (m[c.id] = c, m), {});

})(window.FRUTARIA = window.FRUTARIA || {});
