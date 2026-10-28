/* ==========================================================================
 *  FRUTARIA
 *  Fruit / plant / rarity data -- the single source of truth shared by the design docs and the game
 *  Mirrors: docs/04-fruit-and-transformation.md and docs/05-backpack-and-storage.md
 *  One fruit per species, and one species per niche: three fruits, three bodies.
 *  The rarity ladder still has five rungs; the valley currently only grows
 *  three of them (common / rare / legendary).
 * ========================================================================== */
(function (N) {

  /* ------------------------------------------------------------------
   * Rarity: decides backpack footprint (slots), spoilage and regrowth.
   * slots  = number of slots one unit of this fruit occupies
   * fresh  = seconds before a picked fruit goes dormant; in storage it decays at x0.1
   * regrow = in-game days before that fruiting site bears again (docs/04, docs/07)
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
 *   hop         : { up, kick, period } -- a body that does not walk on land, it
 *                 hops. `up` is the fraction of its own jump the auto-hop uses,
 *                 `kick` the fraction of its land speed the launch throws it at,
 *                 `period` the seconds its feet stay on the ground between hops.
 *                 Only the gait changes: the arc is still gravity's.
   *   swim        : underwater movement multiplier. 1.1 on the frog body puts it
   *                 at 4.65 m/s -- the wild frog's own `swimSpeed` -- because the
   *                 body you wear and the animal you wear are one animal.
   *   fly         : flight thrust (0 / undefined = cannot fly)
   *   flySpeed    : the speed a body with wings holds in level flight, m/s. It
   *                 is not derived from walking speed: an owl that putters along
   *                 at a jog is a body with a speed problem. This is the wild
   *                 owl's own `flySpeed` from data/creatures.js written down a
   *                 second time, and play.js checks the two agree.
   *   turn        : the most radians a second the body can add to its heading at
   *                 its own cruising speed. Air and water hold a body up by
   *                 carrying it forward, so neither can change course on the
   *                 spot -- the course bends (Player.update, Creature.update).
   *                 The same number the species has in data/creatures.js.
   *   glide       : the fraction of the normal fall speed a body accepts when it
   *                 is not flapping -- 0.35 = it comes down at a third of the
   *                 speed you do. Unpowered: it buys distance, never height.
   *   breatheAir  : whether air is required (false = can breathe underwater)
   *   dryTimer    : seconds out of water before the skin starts to dry (amphibian bodies)
   *   nightVision : 0..1 brightening in the dark, and the same eye washed out by daylight
   *   stealth     : creature alert-radius multiplier (<1 = harder to spot)
   *   aura        : intimidation radius (>0 scares off lesser creatures / raises alert)
   *   coldImmune  : the altitude cold of the northern ridge does not bite
   *   poisonImmune: the lamp jellyfish sting does not bite -- the body the lake
   *                 already gave you is the body the lake's lamps are lit for
   *   step        : auto step-up height in metres
   *   fov         : field of view
   * Fields that no body in the valley uses any more (climb, dig, armor, web,
   * herd) were deleted with the animals that had them, and `tongue` went with
   * them: the frog's niche is swimming and breathing water, not reaching things.
   * `airBonus` and `glow` went the same way when the jellyfish body was cut --
   * no body in the valley holds a second of extra breath or carries a light of
   * its own. `hand` went with the first-person hand it named: the lens shows the
   * world, and a hand bolted to the corner of the lens was never part of the
   * body you were wearing. `poisonImmune` came back with the lamps: the animal
   * is back without a body of its own, so the immunity sits on the body that
   * already lives in that water.
   * A field comes back when a fruit asks for it, not before.
   * Nothing here is a mental effect: a form inherits a body and the world's
   * reaction to that body, never a mind (docs/04 s5.0).
   * ------------------------------------------------------------------ */

  const FRUITS = [
    /* ============ common ============ */
    {
      id: 'owlberry', cn: '猫头鹰果', en: 'Owlberry', rarity: 'common', creature: 'owl',
      habitat: ['whisperwood', 'starfall'], habitatCn: '低语林 · 钟塔树洞', habitatEn: 'Whisperwood · bell-tower hollow',
      duration: 240,
      form: {
        cn: '猫头鹰', en: 'owl', size: [0.55, 0.7], speed: 0.9, jump: 0.8, fly: 5.2, flySpeed: 7.0,
        turn: 1.4, glide: 0.35,
        nightVision: 0.75, stealth: 0.45, fov: 88, step: 0.3
      },
      cost: ['白昼畏光：夜视在白天反成致盲', '爪无法操作门闩与果袋（不能开仓库）'],
      costEn: ['photophobic by day: night vision turns blinding in daylight', 'talons cannot work latches or fruit bags (cannot open storage)'],
      lore: '灰紫色的小果，长在老橡树洞里，只在夜里能看见它微微反光。守夜人说：“摘猫头鹰果最好的办法，是先变成猫头鹰。”',
      loreEn: 'A small grey-violet fruit, grown in an old oak hollow, only visible at night as a faint reflection. The night watch says: "The best way to pick an Owlberry is to become an owl first."'
    },

    /* ============ rare ============ */
    {
      id: 'frogpear', cn: '蛙果', en: 'Frog Pear', rarity: 'rare', creature: 'frog',
      habitat: ['mirrorlake', 'glowglade', 'starfall'], habitatCn: '镜湖芦苇 · 雨后水洼', habitatEn: 'Mirrorlake reeds · rain pools',
      duration: 420,
      form: {
        cn: '雨蛙', en: 'frog', size: [0.5, 0.5], speed: 0.9, jump: 1.3, hop: { up: 0.72, kick: 1.25, period: 0.22 },
        swim: 1.1, turn: 1.9, breatheAir: false, poisonImmune: true,
        dryTimer: 90, nightVision: 0.3, stealth: 0.5, fov: 100, step: 0.3
      },
      cost: ['皮肤必须湿润：离水 90 秒后开始脱水，活力持续下降', '太小：够不到高处的果，也推不开门'],
      costEn: ['the skin must stay wet: after 90 s out of water it dries and vitality keeps draining', 'too small: cannot reach high fruit, cannot push a door open'],
      lore: '长在芦苇半腰的绿果，雨后一夜之间全出来。它不喝水——它靠皮肤喝，所以它把这份本事也给了你。',
      loreEn: 'A green fruit halfway up a reed, all of them out overnight after rain. It does not drink water — it drinks through its skin, so it hands you that trick as well.'
    },

    /* ============ legendary ============ */
    {
      id: 'bruinfig', cn: '棕熊果', en: 'Bruin Fig', rarity: 'legendary', creature: 'bear',
      habitat: ['mountains', 'whisperwood'], habitatCn: '北岭岩坡 · 冬眠穴', habitatEn: 'Northern Ridge rock face · hibernation den',
      duration: 480,
      form: {
        cn: '棕熊', en: 'bear', size: [1.4, 1.5], speed: 1.1, jump: 0.9, coldImmune: true,
        turn: 1.6, aura: 8, step: 1.1, fov: 68
      },
      cost: ['无法精细操作（不能采摘小果、不能开仓库）', '体重：薄冰会裂，木桥会塌'],
      costEn: ['no fine motor control (cannot pick small fruit, cannot open storage)', 'weight: thin ice breaks, wooden bridges collapse'],
      lore: '熊会把它埋起来，忘了它，然后在春天被它找到。',
      loreEn: 'A bear buries it, forgets it, and then in spring it is found by it.'
    }
  ];

  /* ------------------------------------------------------------------
   * Wondrous plants (no form change; temporary buffs / tools)
   * A plant takes the slots of its rarity: slotOf() goes through RARITY and
   * nothing else, so there is no per-plant `slots` field here. Six plants used
   * to carry one, each exactly equal to its rarity's cost, which made it look
   * like a knob that was not connected to anything. If a plant is ever meant
   * to be lighter or heavier than its rarity, add the field AND the override
   * in slotOf() in the same change.
   * ------------------------------------------------------------------ */
  const PLANTS = [
    { id: 'glowcap', cn: '荧光菇', en: 'Glowcap', rarity: 'common', effect: 'light',
      desc: '摘下后 5 分钟自身发光，可放置成路标。蘑菇圈的特产。',
      descEn: 'Glows by itself for 5 minutes after picking; can be placed as a waymarker. A specialty of the Glowglade.' },
    { id: 'leaper', cn: '弹弹菇', en: 'Leaper', rarity: 'common', effect: 'jump',
      desc: '跳跃 +80%，持续 90 秒。吃多会手抖（视角抖动）。',
      descEn: 'Jump +80% for 90 seconds. Too many and your hands shake (the camera jitters).' },
    { id: 'drifter', cn: '雾隐菇', en: 'Drifter', rarity: 'uncommon', effect: 'stealth',
      desc: '生物警觉半径 −70%，脚步声消失，持续 120 秒。吃后说话别人听不见。',
      descEn: 'Creature alert radius −70%, footsteps gone, 120 seconds. After eating it, others cannot hear you speak.' },
    { id: 'thorn', cn: '刺刺菇', en: 'Thorncap', rarity: 'uncommon', effect: 'defense',
      desc: '90 秒内近身伤害反弹，但移动速度 −20%。',
      descEn: '90 seconds of melee damage reflection, but movement speed −20%.' },
    { id: 'glowseed', cn: '发光种子', en: 'Glowseed', rarity: 'common', effect: 'plant',
      desc: '可种在任何泥土上：长成永久光点，也可作为“窖树”的锚点标记。',
      descEn: 'Plant it in any soil: it becomes a permanent point of light, and can mark the anchor of a cellar tree.' },
    { id: 'cellarseed', cn: '窖树种', en: 'Cellar Stone', rarity: 'rare', effect: 'build',
      desc: '种下后长成“窖树”：一座 24 果格的野外小仓库，腐坏速度 1/3，会被熊与窃果贼光顾。',
      descEn: 'Planted, it grows into a cellar tree: a 24-slot field store, decay 1/3, visited by bears and fruit thieves.' }
  ];

  /* ------------------------------------------------------------------
   * Spoilage / storage / backpack parameters (mirrors docs/05)
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
