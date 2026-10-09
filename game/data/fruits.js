/* ==========================================================================
 *  FRUTARIA
 *  Fruit / plant / rarity data -- the single source of truth shared by the design docs and the game
 *  Mirrors: docs/en/04-fruit-and-transformation.md and docs/en/05-backpack-and-storage.md
 *  One fruit per species, and one species per niche: seven fruits, seven bodies.
 * ========================================================================== */
(function (N) {

  /* ------------------------------------------------------------------
   * Rarity: decides backpack footprint (slots), spoilage and regrowth.
   * slots  = number of slots one unit of this fruit occupies
   * fresh  = seconds before a picked fruit goes dormant; in storage it decays at x0.1
   * regrow = in-game days before that fruiting site bears again (docs/en/04, docs/en/07)
   * ------------------------------------------------------------------ */
  const RARITY = {
    common:    { id: 'common',    cn: '常见', en: 'Common',    tier: 1, slots: 1,  fresh: 1500, regrow: 1.0, color: [0.60, 0.74, 0.52], ring: '#9ab97e' },
    uncommon:  { id: 'uncommon',  cn: '少见', en: 'Uncommon',  tier: 2, slots: 2,  fresh: 1200, regrow: 1.5, color: [0.42, 0.70, 0.94], ring: '#6cb4f0' },
    rare:      { id: 'rare',      cn: '稀有', en: 'Rare',      tier: 3, slots: 4,  fresh: 900,  regrow: 2.0, color: [0.74, 0.52, 0.95], ring: '#b987f2' },
    epic:      { id: 'epic',      cn: '极稀', en: 'Epic',      tier: 4, slots: 7,  fresh: 600,  regrow: 2.5, color: [0.98, 0.60, 0.28], ring: '#ff9c4a' },
    legendary: { id: 'legendary', cn: '传说', en: 'Legendary', tier: 5, slots: 12, fresh: 420,  regrow: 3.0, color: [0.99, 0.86, 0.36], ring: '#ffdc5c' }
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
   *   dryTimer    : seconds out of water before the skin starts to dry (amphibian bodies)
   *   nightVision : 0..1 brightening in the dark
   *   glow        : self-illumination [r,g,b]
   *   stealth     : creature alert-radius multiplier (<1 = harder to spot)
   *   aura        : intimidation radius (>0 scares off lesser creatures / raises alert)
   *   armor       : damage taken multiplier (<1 = the body shrugs bites off)
   *   climb       : can climb walls
   *   dig         : can break soft blocks
   *   tongue      : metres of reach when plucking / grabbing
   *   step        : auto step-up height in metres
   *   fov         : field of view
   *   hand        : first-person hand model id
   * Nothing here is a mental effect: a form inherits a body and the world's
   * reaction to that body, never a mind (docs/en/04 s5.0).
   * ------------------------------------------------------------------ */

  const FRUITS = [
    /* ============ common ============ */
    {
      id: 'owlberry', cn: '猫头鹰果', en: 'Owlberry', rarity: 'common', creature: 'owl',
      habitat: ['whisperwood', 'starfall'], habitatCn: '低语林 · 钟塔树洞', habitatEn: 'Whisperwood · bell-tower hollow',
      duration: 240,
      form: {
        cn: '猫头鹰', en: 'owl', size: [0.55, 0.7], speed: 0.9, jump: 0.8, fly: 5.2, glide: 0.35,
        nightVision: 0.75, stealth: 0.45, fov: 88, hand: 'talon', step: 0.3
      },
      cost: ['白昼畏光：夜视在白天反成致盲', '爪无法操作门闩与果袋（不能开仓库）'],
      costEn: ['photophobic by day: night vision turns blinding in daylight', 'talons cannot work latches or fruit bags (cannot open storage)'],
      lore: '灰紫色的小果，长在老橡树洞里，只在夜里能看见它微微反光。守夜人说：“摘猫头鹰果最好的办法，是先变成猫头鹰。”',
      loreEn: 'A small grey-violet fruit, grown in an old oak hollow, only visible at night as a faint reflection. The night watch says: "The best way to pick an Owlberry is to become an owl first."'
    },

    /* ============ uncommon ============ */
    {
      id: 'scaleberry', cn: '鳞果', en: 'Scaleberry', rarity: 'uncommon', creature: 'pangolin',
      habitat: ['orchard', 'whisperwood', 'mountains'], habitatCn: '果园遗迹土丘 · 北岭坡地', habitatEn: 'Old Orchard mounds · Northern Ridge slopes',
      duration: 300,
      form: {
        cn: '穿山甲', en: 'pangolin', size: [0.7, 0.75], speed: 0.8, jump: 0.6, dig: true, climb: true,
        armor: 0.5, stealth: 0.4, fov: 65, hand: 'claw', step: 0.4
      },
      cost: ['无精细操作：爪只能挖与抓，不能开门闩与果袋', '甲重：入水即沉，不能游泳'],
      costEn: ['no fine motor control: the claws can only dig and grip, not open latches or fruit bags', 'the armour is heavy: you sink the moment you are in water, and cannot swim'],
      lore: '鳞片状的小果，一簇一簇贴在老树根旁的土丘上。摘它得挖——挖到一半你会发现，这个洞原本是别人住的。',
      loreEn: 'Small scale-shaped fruits, in clusters on the mounds beside old roots. Picking one means digging — and halfway through you find out that the burrow used to be somebody\'s home.'
    },
    {
      id: 'stagcap', cn: '鹿茸菌果', en: 'Stagcap', rarity: 'uncommon', creature: 'deer',
      habitat: ['whisperwood', 'deepgrove'], habitatCn: '低语林 · 鹿径', habitatEn: 'Whisperwood · deer paths',
      duration: 300,
      form: {
        cn: '白尾鹿', en: 'deer', size: [0.9, 1.6], speed: 1.7, jump: 1.5, step: 0.9, stealth: 0.8,
        herd: true, fov: 70, hand: 'hoof'
      },
      cost: ['角与肩宽：进不了低矮与狭窄处', '猎物体质：任何猎食者都会先注意到你'],
      costEn: ['antlers and shoulder width: no low or narrow space', 'prey build: every predator notices you first'],
      lore: '长在倒木上的菌状果，一年只结两次。它的腿记得整个谷地。',
      loreEn: 'A mushroom-shaped fruit on fallen trunks, cropping only twice a year. Its legs remember the whole valley.'
    },

    /* ============ rare ============ */
    {
      id: 'jellybloom', cn: '水母花苞', en: 'Jellybloom', rarity: 'rare', creature: 'jelly',
      habitat: ['mirrorlake'], habitatCn: '镜湖中层', habitatEn: 'Mirrorlake mid-water',
      duration: 360,
      form: {
        cn: '水母', en: 'jellyfish', size: [0.7, 0.8], speed: 0.5, swim: 1.6, airBonus: 40,
        glow: [0.55, 0.8, 1.0], poisonImmune: true, fov: 95, hand: 'tentacle', step: 0.2
      },
      cost: ['陆地几乎无法移动', '鱼群会避开你（无法与水生生物交流）'],
      costEn: ['almost immobile on land', 'fish avoid you (no communication with water life)'],
      lore: '它把毒变成灯。湖底最亮的一圈，就是水母花苞的田。',
      loreEn: 'It turns poison into a lamp. The brightest ring on the lakebed is a field of Jellybloom.'
    },
    {
      id: 'frogpear', cn: '蛙果', en: 'Frog Pear', rarity: 'rare', creature: 'frog',
      habitat: ['mirrorlake', 'glowglade', 'starfall'], habitatCn: '镜湖芦苇 · 雨后水洼', habitatEn: 'Mirrorlake reeds · rain pools',
      duration: 420,
      form: {
        cn: '雨蛙', en: 'frog', size: [0.5, 0.5], speed: 0.9, jump: 2.4, swim: 2.4, breatheAir: false,
        dryTimer: 90, tongue: 4, nightVision: 0.3, stealth: 0.5, fov: 100, hand: 'web', step: 0.3
      },
      cost: ['皮肤必须湿润：离水 90 秒后开始脱水，活力持续下降', '太小：够不到高处的果，也推不开门'],
      costEn: ['the skin must stay wet: after 90 s out of water it dries and vitality keeps draining', 'too small: cannot reach high fruit, cannot push a door open'],
      lore: '长在芦苇半腰的绿果，雨后一夜之间全出来。它不喝水——它靠皮肤喝，所以它把这份本事也给了你。',
      loreEn: 'A green fruit halfway up a reed, all of them out overnight after rain. It does not drink water — it drinks through its skin, so it hands you that trick as well.'
    },

    /* ============ epic ============ */
    {
      id: 'silkberry', cn: '丝莓', en: 'Silkberry', rarity: 'epic', creature: 'spider',
      habitat: ['batcave', 'orchard', 'cloudspire'], habitatCn: '回声丘洞顶 · 遗迹梁柱', habitatEn: 'Echo Hollow ceiling · ruin beams',
      duration: 420,
      form: {
        cn: '梁蛛', en: 'spider', size: [1.1, 0.8], speed: 1.2, climb: true,
        web: true, nightVision: 0.7, fov: 110, hand: 'claw', step: 0.4
      },
      cost: ['人形生物见到你会恐慌（村民拒绝交易）', '火焰与强光造成额外伤害'],
      costEn: ['humanoids panic at the sight of you (villagers refuse trade)', 'fire and strong light deal extra damage'],
      lore: '八颗小果围成一圈，像一只睁着的眼睛。吃下它，你会开始理解“门”是个可有可无的东西。',
      loreEn: 'Eight small fruits in a ring, like one open eye. Eat it and you begin to understand that a "door" is optional.'
    },

    /* ============ legendary ============ */
    {
      id: 'bruinfig', cn: '灰熊无花果', en: 'Bruin Fig', rarity: 'legendary', creature: 'bear',
      habitat: ['mountains', 'whisperwood'], habitatCn: '北岭岩坡 · 冬眠穴', habitatEn: 'Northern Ridge rock face · hibernation den',
      duration: 480,
      form: {
        cn: '灰熊', en: 'bear', size: [1.4, 1.5], speed: 1.1, jump: 0.9, strength: true, coldImmune: true,
        aura: 8, step: 1.1, fov: 68, hand: 'claw'
      },
      cost: ['无法精细操作（不能采摘小果、不能开仓库）', '体重：薄冰会裂，木桥会塌'],
      costEn: ['no fine motor control (cannot pick small fruit, cannot open storage)', 'weight: thin ice breaks, wooden bridges collapse'],
      lore: '熊会把它埋起来，忘了它，然后在春天被它找到。',
      loreEn: 'A bear buries it, forgets it, and then in spring it is found by it.'
    }
  ];

  /* ------------------------------------------------------------------
   * Wondrous plants (no form change; temporary buffs / tools)
   * ------------------------------------------------------------------ */
  const PLANTS = [
    { id: 'glowcap', cn: '荧光菇', en: 'Glowcap', rarity: 'common', slots: 1, effect: 'light',
      desc: '摘下后 5 分钟自身发光，可放置成路标。蘑菇圈的特产。',
      descEn: 'Glows by itself for 5 minutes after picking; can be placed as a waymarker. A specialty of the Glowglade.' },
    { id: 'leaper', cn: '弹弹菇', en: 'Leaper', rarity: 'common', slots: 1, effect: 'jump',
      desc: '跳跃 +80%，持续 90 秒。吃多会手抖（视角抖动）。',
      descEn: 'Jump +80% for 90 seconds. Too many and your hands shake (the camera jitters).' },
    { id: 'drifter', cn: '雾隐菇', en: 'Drifter', rarity: 'uncommon', slots: 2, effect: 'stealth',
      desc: '生物警觉半径 −70%，脚步声消失，持续 120 秒。吃后说话别人听不见。',
      descEn: 'Creature alert radius −70%, footsteps gone, 120 seconds. After eating it, others cannot hear you speak.' },
    { id: 'thorn', cn: '刺刺菇', en: 'Thorncap', rarity: 'uncommon', slots: 2, effect: 'defense',
      desc: '90 秒内近身伤害反弹，但移动速度 −20%。',
      descEn: '90 seconds of melee damage reflection, but movement speed −20%.' },
    { id: 'glowseed', cn: '发光种子', en: 'Glowseed', rarity: 'common', slots: 1, effect: 'plant',
      desc: '可种在任何泥土上：长成永久光点，也可作为“窖树”的锚点标记。',
      descEn: 'Plant it in any soil: it becomes a permanent point of light, and can mark the anchor of a cellar tree.' },
    { id: 'cellarseed', cn: '窖树种', en: 'Cellar Stone', rarity: 'rare', slots: 4, effect: 'build',
      desc: '种下后长成“窖树”：一座 24 果格的野外小仓库，腐坏速度 1/3，会被熊与窃果贼光顾。',
      descEn: 'Planted, it grows into a cellar tree: a 24-slot field store, decay 1/3, visited by bears and fruit thieves.' }
  ];

  /* ------------------------------------------------------------------
   * Spoilage / storage / backpack parameters (mirrors docs/en/05)
   * ------------------------------------------------------------------ */
  const STORAGE = {
    backpack: { slots: 24, decay: 1.0, upgrades: [
      { id: 'pouch1', cn: '副果袋', en: 'Pouch', slots: 6, desc: '灯笼镇老梅的谢礼', descEn: 'Old Mei\'s thanks in Lanternrow' },
      { id: 'pouch2', cn: '深果袋', en: 'Deep Pouch', slots: 6, desc: '沉塔里的防水皮囊', descEn: 'the waterproof satchel in the sunken tower' },
      { id: 'divider', cn: '银丝隔层（稀有果实占用 −1）', en: 'Silver Divider (rare fruit costs one slot less)', slots: 0,
        desc: '城堡温室的银丝网', descEn: 'the silver mesh in the keep\'s greenhouse' }
    ] },
    // A store has no name of its own: the interface calls it by kind (i18n
    // store.cellar / store.tree), so a save file can never freeze one language
    // into a warehouse.
    cellar:    { slots: 96, decay: 0.1 },
    // A cellar tree is alive, so it has a body: it can be robbed, and it must
    // not be planted on top of its sibling's roots. These are the numbers the
    // docs quote (05, "cellar tree" rule table) -- docs-sync.js compares the
    // prose against them, so changing one here forces the docs to change too.
    treestash: { slots: 24, decay: 0.33, max: 3,
                 minDist: 20,          // m between two cellar trees
                 raidChance: 0.30,     // one roll per game day
                 raidMin: 1,           // fruits taken when the raid lands
                 raidMax: 3,
                 raidScareRadius: 45 }  // player this close always scares it off
  };

  N.RARITY = RARITY;
  N.FRUITS = FRUITS;
  N.FRUIT_BY_ID = FRUITS.reduce((m, f) => (m[f.id] = f, m), {});
  N.PLANTS = PLANTS;
  N.PLANT_BY_ID = PLANTS.reduce((m, f) => (m[f.id] = f, m), {});
  N.STORAGE = STORAGE;

})(window.FRUTARIA = window.FRUTARIA || {});
