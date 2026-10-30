/* ==========================================================================
 *  FRUTARIA
 *  Fruit / plant / rarity data -- the single source of truth shared by the design docs and the game
 *  Mirrors: docs/04-fruit-and-transformation.md and docs/05-backpack-and-storage.md
 *  One fruit per species, and one species per niche: one fruit, one body.
 *  The rarity ladder still has five rungs; the valley currently only grows
 *  one of them (common).
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
   *   turn        : the most radians a second the body can add to its heading at
   *                 its own cruising speed. Water holds a body up by carrying
   *                 it forward, so it cannot change course on the spot -- the
   *                 course bends (Player.update, Creature.update).
   *                 The same number the species has in data/creatures.js.
   *   breatheAir  : whether air is required (false = can breathe underwater)
   *   dryTimer    : seconds out of water before the skin starts to dry (amphibian bodies)
   *   nightVision : 0..1 brightening in the dark, and the same eye washed out by daylight
   *   stealth     : creature alert-radius multiplier (<1 = harder to spot)
   *   step        : auto step-up height in metres
   *   fov         : field of view
   * Fields that no body in the valley uses any more (climb, dig, armor, web,
   * herd) were deleted with the animals that had them, and `tongue` went with
   * them: the frog's niche is swimming and breathing water, not reaching things.
   * `airBonus` and `glow` went the same way when the jellyfish body was cut --
   * no body in the valley holds a second of extra breath or carries a light of
   * its own. `hand` went with the first-person hand it named: the lens shows the
   * world, and a hand bolted to the corner of the lens was never part of the
   * body you were wearing. `poisonImmune` went with the lamps it shielded:
   * the sting it answered is gone with the animal that cast it. `aura` and `coldImmune` went with the bear:
   * nothing in the valley carries a radius the smaller bodies scatter from,
   * and the ridge's altitude cold went with the one body that was exempt from
   * it.
   * A field comes back when a fruit asks for it, not before.
   * Nothing here is a mental effect: a form inherits a body and the world's
   * reaction to that body, never a mind (docs/04 s5.0).
   * ------------------------------------------------------------------ */

  const FRUITS = [
    /* ============ common ============ */
    {
      id: 'frogpear', cn: '蛙果', en: 'Frog Pear', rarity: 'common', creature: 'frog',
      habitat: ['mirrorlake', 'glowglade', 'starfall'], habitatCn: '镜湖芦苇 · 雨后水洼', habitatEn: 'Mirrorlake reeds · rain pools',
      duration: 420,
      form: {
        cn: '雨蛙', en: 'frog', size: [0.5, 0.5], speed: 0.9, jump: 1.3, hop: { up: 0.72, kick: 1.25, period: 0.22 },
        swim: 1.1, turn: 0.9, breatheAir: false,
        dryTimer: 90, nightVision: 0.3, stealth: 0.5, fov: 100, step: 0.3
      },
      cost: ['皮肤必须湿润：离水 90 秒后开始脱水，活力持续下降', '太小：够不到高处的果，也推不开门'],
      costEn: ['the skin must stay wet: after 90 s out of water it dries and vitality keeps draining', 'too small: cannot reach high fruit, cannot push a door open'],
      lore: '长在芦苇半腰的绿果，雨后一夜之间全出来。它不喝水——它靠皮肤喝，所以它把这份本事也给了你。',
      loreEn: 'A green fruit halfway up a reed, all of them out overnight after rain. It does not drink water — it drinks through its skin, so it hands you that trick as well.'
    }
  ];

  /* ------------------------------------------------------------------
   * Wondrous plants (no form change; tools, not powers)
   * A plant takes the slots of its rarity: slotOf() goes through RARITY and
   * nothing else, so there is no per-plant `slots` field here. If a plant is
   * ever meant to be lighter or heavier than its rarity, add the field AND the
   * override in slotOf() in the same change.
   * The valley used to carry six of these, five of them powers you ate -- a
   * light, a jump, a silence, a guard, a fixed point of light -- and they are
   * cut: a power you eat is not a law the valley runs on. What is left is the
   * one thing a plant may honestly do: grow.
   * ------------------------------------------------------------------ */
  const PLANTS = [
    { id: 'cellarseed', cn: '窖树种', en: 'Cellar Stone', rarity: 'rare', effect: 'build',
      desc: '种下后长成“窖树”：一座 24 果格的野外小仓库，腐坏速度 1/3。',
      descEn: 'Planted, it grows into a cellar tree: a 24-slot field store, decay 1/3.' }
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
    // A cellar tree is alive, so it must not be planted on top of its
    // sibling's roots. These are the numbers the docs quote (05, "cellar tree"
    // rule table) -- docs-sync.js compares the prose against them, so changing
    // one here forces the docs to change too.
    treestash: { slots: 24, decay: 0.33, max: 3,
                 minDist: 20 }         // m between two cellar trees
  };

  N.RARITY = RARITY;
  N.FRUITS = FRUITS;
  N.FRUIT_BY_ID = FRUITS.reduce((m, f) => (m[f.id] = f, m), {});
  N.PLANTS = PLANTS;
  N.PLANT_BY_ID = PLANTS.reduce((m, f) => (m[f.id] = f, m), {});
  N.STORAGE = STORAGE;

})(window.FRUTARIA = window.FRUTARIA || {});
