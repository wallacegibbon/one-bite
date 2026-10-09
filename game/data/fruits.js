/* ==========================================================================
 *  FRUTARIA
 *  Fruit / plant / rarity data -- the single source of truth shared by the design docs and the game
 *  Mirrors: docs/en/04-fruit-and-transformation.md and docs/en/05-backpack-and-storage.md
 * ========================================================================== */
(function (N) {

  /* ------------------------------------------------------------------
   * Rarity: decides backpack footprint (slots), spoilage and regrowth.
   * slots  = number of slots one unit of this fruit occupies
   * fresh  = seconds before a picked fruit goes dormant; in storage it decays at x0.1
   * regrow = in-game days before the mother tree's roots fruit again (docs/en/04, docs/en/07)
   * ------------------------------------------------------------------ */
  const RARITY = {
    common:    { id: 'common',    cn: '常见', tier: 1, slots: 1,  fresh: 1500, regrow: 1.0, color: [0.60, 0.74, 0.52], ring: '#9ab97e' },
    uncommon:  { id: 'uncommon',  cn: '少见', tier: 2, slots: 2,  fresh: 1200, regrow: 1.5, color: [0.42, 0.70, 0.94], ring: '#6cb4f0' },
    rare:      { id: 'rare',      cn: '稀有', tier: 3, slots: 4,  fresh: 900,  regrow: 2.0, color: [0.74, 0.52, 0.95], ring: '#b987f2' },
    epic:      { id: 'epic',      cn: '极稀', tier: 4, slots: 7,  fresh: 600,  regrow: 2.5, color: [0.98, 0.60, 0.28], ring: '#ff9c4a' },
    legendary: { id: 'legendary', cn: '传说', tier: 5, slots: 12, fresh: 420,  regrow: 3.0, color: [0.99, 0.86, 0.36], ring: '#ffdc5c' }
  };

  /* ------------------------------------------------------------------
   * Form ability fields
   *   size        : collision box [width, height] in metres
   *   speed       : land movement multiplier
   *   jump        : jump force multiplier
   *   swim        : underwater movement multiplier
   *   fly         : flight thrust (0 / undefined = cannot fly)
   *   glide       : unpowered gliding (max fall speed)
   *   breatheAir  : whether air is required (false = can breathe underwater)
   *   airBonus    : extra seconds of held breath
   *   nightVision : 0..1 brightening in the dark
   *   glow        : self-illumination [r,g,b]
   *   stealth     : creature alert-radius multiplier (<1 = harder to spot)
   *   aura        : intimidation radius (>0 scares off lesser creatures / raises alert)
   *   climb       : can climb walls
   *   dig         : can break soft blocks
   *   fire        : can breathe fire / is immune to fire
   *   purify      : can purify poisoned water and heal
   *   talk        : can communicate with certain creatures (codex / quests)
   *   step        : auto step-up height in metres
   *   fov         : field of view
   *   hand        : first-person hand model id
   * ------------------------------------------------------------------ */

  const FRUITS = [
    /* ============ common ============ */
    {
      id: 'owlberry', cn: '猫头鹰果', en: 'Owlberry', rarity: 'common', creature: 'owl',
      habitat: ['whisperwood', 'starfall'], habitatCn: '低语林 · 钟塔树洞',
      duration: 240,
      form: {
        cn: '猫头鹰', size: [0.55, 0.7], speed: 0.9, jump: 0.8, fly: 5.2, glide: 0.35,
        nightVision: 0.75, stealth: 0.45, fov: 88, hand: 'talon', step: 0.3
      },
      side: ['白昼畏光（白天夜视反转为致盲）', '见到小型啮齿类会不受控扑击'],
      lore: '灰紫色的小果，长在老橡树洞里，只在夜里能看见它微微反光。守夜人说：“摘猫头鹰果最好的办法，是先变成猫头鹰。”'
    },
    {
      id: 'batfruit', cn: '蝙蝠果', en: 'Batfruit', rarity: 'common', creature: 'bat',
      habitat: ['batcave', 'whisperwood'], habitatCn: '蝙蝠洞顶 · 枯树缝',
      duration: 210,
      form: {
        cn: '蝙蝠', size: [0.45, 0.5], speed: 0.7, jump: 0.6, fly: 6.4, glide: 0.25,
        nightVision: 0.95, stealth: 0.3, fov: 95, hand: 'wing', step: 0.2
      },
      side: ['白昼视力极差', '变形结束后会短暂口渴（需饮水）'],
      lore: '倒挂在洞顶，像一簇簇干瘪的黑手套。吃下去之后，你会先“听”见整条隧道。'
    },
    {
      id: 'glowmoth', cn: '萤蛾果', en: 'Mothpear', rarity: 'common', creature: 'moth',
      habitat: ['glowglade', 'whisperwood'], habitatCn: '蘑菇圈 · 夜林',
      duration: 180,
      form: {
        cn: '萤蛾', size: [0.35, 0.4], speed: 0.6, jump: 0.5, fly: 4.0, glide: 0.15,
        nightVision: 0.6, glow: [0.7, 1.0, 0.55], stealth: 0.25, fov: 100, hand: 'wing', step: 0.2
      },
      side: ['趋光：无法抗拒强光源（会把你拖向灯火）', '寿命感极短，时间条显示为“烛”'],
      lore: '由发光种子长成的果实。它不给你力量，只给你一小片会飞的灯。'
    },

    /* ============ uncommon ============ */
    {
      id: 'otterkin', cn: '水獭果', en: 'Otterkin', rarity: 'uncommon', creature: 'otter',
      habitat: ['mirrorlake', 'orchard'], habitatCn: '镜湖浅滩 · 瀑布水潭',
      duration: 300,
      form: {
        cn: '水獭', size: [0.6, 0.7], speed: 1.0, jump: 0.9, swim: 2.2,
        airBonus: 25, stealth: 0.7, fov: 82, hand: 'paw', step: 0.5
      },
      side: ['上岸后动作笨拙（速度 −30%）', '无法携带工具（不能开仓库）'],
      lore: '湿漉漉的、带鱼腥味的果。人鱼讨厌它：“那是半吊子的水。”'
    },
    {
      id: 'vulpine', cn: '狐李', en: 'Vulpine Plum', rarity: 'uncommon', creature: 'fox',
      habitat: ['whisperwood', 'lanternrow'], habitatCn: '低语林边缘 · 镇外果园',
      duration: 300,
      form: {
        cn: '狐狸', size: [0.55, 0.6], speed: 1.45, jump: 1.2, stealth: 0.5,
        scent: true, dig: true, fov: 78, hand: 'paw', step: 0.6
      },
      side: ['被犬类与猎人敌视', '忍不住偷取未收纳的果实（含同伴的）'],
      lore: '熟透时会自己从树上掉下来，滚到最近的动物脚边。所以狐狸总是先找到它。'
    },
    {
      id: 'stagcap', cn: '鹿茸菌果', en: 'Stagcap', rarity: 'uncommon', creature: 'deer',
      habitat: ['whisperwood', 'deepgrove'], habitatCn: '低语林 · 鹿径',
      duration: 300,
      form: {
        cn: '雄鹿', size: [0.9, 1.6], speed: 1.7, jump: 1.5, step: 0.9, stealth: 0.8,
        herd: true, fov: 70, hand: 'hoof'
      },
      side: ['角会卡在窄洞与门框（无法进入低矮空间）', '被狼与灰雾兽锁定'],
      lore: '长在倒木上的菌状果，一年只结两次。吃下它你会想奔跑，且只想朝北。'
    },
    {
      id: 'jellybloom', cn: '水母花苞', en: 'Jellybloom', rarity: 'uncommon', creature: 'jelly',
      habitat: ['mirrorlake'], habitatCn: '镜湖中层',
      duration: 300,
      form: {
        cn: '水母', size: [0.7, 0.8], speed: 0.5, swim: 1.6, airBonus: 40,
        glow: [0.55, 0.8, 1.0], poisonImmune: true, fov: 95, hand: 'tentacle', step: 0.2
      },
      side: ['陆地几乎无法移动', '鱼群会避开你（无法与水生生物交流）'],
      lore: '它把毒变成灯。湖底最亮的一圈，就是水母花苞的田。'
    },

    /* ============ rare ============ */
    {
      id: 'merrow', cn: '人鱼梨', en: 'Merrow Pear', rarity: 'rare', creature: 'merfolk',
      habitat: ['mirrorlake'], habitatCn: '镜湖 · 沉塔与人鱼村',
      duration: 600,
      form: {
        cn: '人鱼', size: [0.7, 1.6], speed: 0.7, swim: 2.6, breatheAir: false,
        talk: 'water', deepImmune: true, nightVision: 0.4, fov: 92, hand: 'fin', step: 0.3
      },
      side: ['离水后虚弱（速度 −50%，时间条以 2 倍速流失）', '人鱼村会要求你“归还一件湖中之物”'],
      lore: '只在沉塔的窗台上结果。要摘它，你得先能在水下呼吸——所以人鱼梨是人鱼给的，不是拿的。'
    },
    {
      id: 'unicorncherry', cn: '银角樱', en: 'Unicorn Cherry', rarity: 'rare', creature: 'unicorn',
      habitat: ['deepgrove'], habitatCn: '深林 · 独角兽圣林',
      duration: 420,
      form: {
        cn: '独角兽', size: [1.0, 1.7], speed: 2.1, jump: 1.6, step: 1.0, purify: true,
        glow: [0.9, 0.95, 1.0], talk: 'beast', waterWalk: true, fov: 72, hand: 'hoof'
      },
      side: ['无法说谎（对话会强制真话，可能得罪人）', '极度显眼：猎人、灰雾兽都会标记你'],
      lore: '银色的果实，只有未被污染的水能浇灌它。独角兽不介意被人类看见，只介意被人类欺骗。'
    },
    {
      id: 'silkberry', cn: '丝莓', en: 'Silkberry', rarity: 'rare', creature: 'spider',
      habitat: ['batcave', 'orchard'], habitatCn: '蝙蝠洞深处 · 遗迹梁柱',
      duration: 420,
      form: {
        cn: '巨蛛', size: [1.1, 0.8], speed: 1.2, climb: true,
        web: true, nightVision: 0.7, fov: 110, hand: 'claw', step: 0.4
      },
      side: ['人形生物见到你会恐慌（村民拒绝交易）', '火焰与强光造成额外伤害'],
      lore: '八颗小果围成一圈，像一只睁着的眼睛。吃下它，你会开始理解“门”是个可有可无的东西。'
    },
    {
      id: 'bruinfig', cn: '灰熊无花果', en: 'Bruin Fig', rarity: 'rare', creature: 'bear',
      habitat: ['cloudspire', 'whisperwood'], habitatCn: '北岭岩坡 · 冬眠穴',
      duration: 420,
      form: {
        cn: '灰熊', size: [1.4, 1.5], speed: 1.1, jump: 0.9, strength: true, coldImmune: true,
        aura: 8, step: 1.1, fov: 68, hand: 'claw'
      },
      side: ['无法精细操作（不能采摘小果、不能开仓库）', '冬眠冲动：连续变形 3 次后会强制入睡'],
      lore: '熊会把它埋起来，忘了它，然后在春天被它找到。'
    },

    /* ============ epic ============ */
    {
      id: 'veilberry', cn: '灰雾果', en: 'Veilwalker Ash-berry', rarity: 'epic', creature: 'veilbeast',
      habitat: ['veil'], habitatCn: '灰雾墙之内',
      duration: 480,
      form: {
        cn: '灰雾兽', size: [0.9, 1.6], speed: 1.3, jump: 1.2, phase: true, veilWalk: true,
        stealth: 0.15, nightVision: 0.85, fov: 85, hand: 'shadow', step: 0.8
      },
      side: ['时间条以 1.5 倍速流失', '变形结束后 1 分钟内人形记忆模糊（小地图失效）'],
      lore: '灰雾里唯一会结果的东西。它不是植物，是某种动物的遗愿结成的核。'
    },
    {
      id: 'phoenixpit', cn: '凤凰核', en: 'Phoenix Pit', rarity: 'epic', creature: 'phoenix',
      habitat: ['cloudspire'], habitatCn: '云顶 · 灰烬环峰',
      duration: 240,
      form: {
        cn: '凤凰', size: [0.8, 1.1], speed: 1.0, fly: 7.5, fire: true, glow: [1.0, 0.6, 0.25],
        revive: 1, aura: 5, fov: 85, hand: 'wing', step: 0.4
      },
      side: ['变形结束陷入“灼饿”：3 分钟内只吃蘑菇，否则活力持续下降', '每次变形会烧掉背包里 1 颗常见果实'],
      lore: '它不是长出来的，是烧出来的。凤凰死后原处会有一枚温热的核，七天后发芽。'
    },

    /* ============ legendary ============ */
    {
      id: 'embercore', cn: '焰心果', en: 'Embercore', rarity: 'legendary', creature: 'dragon',
      habitat: ['cloudspire'], habitatCn: '云顶 · 灰烬龙巢',
      duration: 300,
      form: {
        cn: '龙', size: [3.2, 2.4], speed: 1.2, fly: 9.0, fire: true, fireImmune: true,
        strength: true, aura: 18, glow: [1.0, 0.45, 0.15], nightVision: 0.5,
        fov: 78, hand: 'claw', step: 1.6
      },
      side: ['触发“龙巢警戒”：其他龙会攻击你', '灰雾墙排斥龙形（靠近会被弹出并受伤）',
            '变形结束极度饥饿，果实腐坏速度翻倍持续 10 分钟'],
      lore: '龙不吃果实——焰心果是龙呕出的旧核，被火山土养了百年。摘它等于从灰烬嘴里拿东西。'
    },
    {
      id: 'motherbloom', cn: '母树花蕾', en: 'Mother Bloom', rarity: 'legendary', creature: 'treant',
      habitat: ['orchard'], habitatCn: '果园遗迹 · 母树',
      duration: 0,
      form: { cn: '母树化身（未实现）', size: [1.6, 2.6] },
      side: ['不可食用：用于“归还”与“嫁接”（终章关键道具）'],
      lore: '整个谷地的所有果实，都是母树的一次失忆。'
    }
  ];

  /* ------------------------------------------------------------------
   * Wondrous plants (no form change; temporary buffs / tools)
   * ------------------------------------------------------------------ */
  const PLANTS = [
    { id: 'glowcap', cn: '荧光菇', en: 'Glowcap', rarity: 'common', slots: 1, effect: 'light',
      desc: '摘下后 5 分钟自身发光，可放置成路标。蘑菇圈的特产。' },
    { id: 'leaper', cn: '弹弹菇', en: 'Leaper', rarity: 'common', slots: 1, effect: 'jump',
      desc: '跳跃 +80%，持续 90 秒。吃多会手抖（视角抖动）。' },
    { id: 'drifter', cn: '雾隐菇', en: 'Drifter', rarity: 'uncommon', slots: 2, effect: 'stealth',
      desc: '生物警觉半径 −70%，脚步声消失，持续 120 秒。吃后说话别人听不见。' },
    { id: 'thorn', cn: '刺刺菇', en: 'Thorncap', rarity: 'uncommon', slots: 2, effect: 'defense',
      desc: '90 秒内近身伤害反弹，但移动速度 −20%。' },
    { id: 'glowseed', cn: '发光种子', en: 'Glowseed', rarity: 'common', slots: 1, effect: 'plant',
      desc: '可种在任何泥土上：长成永久光点，也可作为“窖树”的锚点标记。' },
    { id: 'cellarseed', cn: '窖树种', en: 'Cellar Stone', rarity: 'rare', slots: 4, effect: 'build',
      desc: '种下后长成“窖树”：一座 24 果格的野外小仓库，腐坏速度 1/3，会被獾与窃果贼光顾。' }
  ];

  /* ------------------------------------------------------------------
   * Spoilage / storage / backpack parameters (mirrors docs/en/05)
   * ------------------------------------------------------------------ */
  const STORAGE = {
    backpack: { slots: 24, decay: 1.0, upgrades: [
      { id: 'pouch1', cn: '副果袋', slots: 6, desc: '灯笼镇老梅的谢礼' },
      { id: 'pouch2', cn: '深果袋', slots: 6, desc: '沉塔里的防水皮囊' },
      { id: 'divider', cn: '银丝隔层（稀有果实占用 −1）', slots: 0, desc: '城堡温室的银丝网' }
    ] },
    cellar:    { slots: 96, decay: 0.1, label: '灯笼镇 · 主果窖' },
    // A cellar tree is alive, so it has a body: it can be robbed, and it must
    // not be planted on top of its sibling's roots. These are the numbers the
    // docs quote (05, "cellar tree" rule table) -- docs-sync.js compares the
    // prose against them, so changing one here forces the docs to change too.
    treestash: { slots: 24, decay: 0.33, max: 3, label: '窖树（野外仓库）',
                 minDist: 20,          // m between two cellar trees
                 raidChance: 0.30,     // one roll per game day
                 raidMin: 1,           // fruits taken when the raid lands
                 raidMax: 3,
                 raidScareRadius: 45 }, // player this close always scares it off
    pitToSeed: true   // a dormant fruit becomes a pit, which can be planted into a fruit tree
  };

  N.RARITY = RARITY;
  N.FRUITS = FRUITS;
  N.FRUIT_BY_ID = FRUITS.reduce((m, f) => (m[f.id] = f, m), {});
  N.PLANTS = PLANTS;
  N.PLANT_BY_ID = PLANTS.reduce((m, f) => (m[f.id] = f, m), {});
  N.STORAGE = STORAGE;

})(window.FRUTARIA = window.FRUTARIA || {});
