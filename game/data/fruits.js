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
   *   A form record carries the body's SHAPE and the body's SENSES. It carries
   *   no motion at all: no speed, no jump, no launch, no turn. Those belong to
   *   the animal the fruit names in `creature`, and they are written once, in
   *   its row in data/creatures.js. `Player.moveDef` in src/entities.js asks
   *   that row -- and the body you start in is a record of the same shape, in
   *   data/player.js -- so the body you wear and the animal you wear are moved
   *   by one record, and wearing a frog is moving like a frog: at 1.8 m/s on
   *   land, at 4.6 through water, and 0.73 m off the
   * ground when it is asked for height with nothing in front of it (`arcApex`: the
   * flight these frames perform, not the parabola's 0.78 m; an arc driven along the
   * ground is sized to the ground its ask wants and tops far less, 03 §3). The old row carried
   *   `speed 0.9 / jump 1.3 / swim 1.1 / hop { up: 0.72, kick: 1.25 }` as
   *   multipliers on the human body's numbers, which made a worn frog cross
   *   ground at 4.23 m/s and throw itself 1.31 m: a 0.5 m animal at a person's
   *   speed, in the shape of a frog. Nothing was wrong with either record; the
   *   pair of them was the mistake. play.js measures a worn body and a wild
   *   animal of the same kind doing the same action and fails when the arcs
   *   differ, so the pair cannot come back.
   *   size        : collision box [width, height] in metres
   *   breatheAir  : whether air is required (false = can breathe underwater)
   *   dryTimer    : seconds out of water before the skin starts to dry (amphibian bodies)
   *   nightVision : 0..1 brightening in the dark, and the same eye washed out by daylight
   *   stealth     : creature alert-radius multiplier (<1 = harder to spot)
   *   step        : auto step-up height in metres. This one is the form's and
   *                 not the animal's on purpose: it is how far the collision box
   *                 above is lifted without a jump, and the box is the form's
   *                 (the animal's own model is a smaller body than the box the
   *                 world enforces around it).
   *   fov         : field of view
   * There is no `step` on a form any more, and both forms carried one: the
   * height the collision box is lifted without a jump. The ground of this valley
   * is whole blocks, so the shortest riser anywhere is a metre and no form's
   * lift could reach it -- the code that asked for it gained 0.124 m in three
   * seconds at a bank of one, and every lift it did buy was thrown back down.
   * A body climbs a metre with the launch its record states, or it stops at the
   * face: that is one law for every body in the valley, and the animals' rows
   * already obeyed it.
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
        cn: '雨蛙', en: 'frog', size: [0.5, 0.5],
        breatheAir: false, dryTimer: 90, nightVision: 0.3, stealth: 0.5, fov: 100
      },
      cost: ['皮肤必须湿润：离水 90 秒后开始脱水，活力持续下降', '陆地上很慢：只有雨蛙自己的每秒 1.8 米，这具身体也没有冲刺', '太小：够不到高处的果，也推不开门'],
      costEn: ['the skin must stay wet: after 90 s out of water it dries and vitality keeps draining', 'slow on land: 1.8 m/s, the frog\'s own pace, and this body has no sprint at all', 'too small: cannot reach high fruit, cannot push a door open'],
      lore: '长在芦苇半腰的绿果，雨后一夜之间全出来。它不喝水——它靠皮肤喝，所以它把这份本事也给了你。',
      loreEn: 'A green fruit halfway up a reed, all of them out overnight after rain. It does not drink water — it drinks through its skin, so it hands you that trick as well.'
    },
    /* ============ uncommon ============ */
    {
      /* The ground this fruit grows in is named by the world's own word for it,
         the same words the animal's row uses: `sandbar` and `cay` are keys of
         ISLE_TYPES in src/worldgen.js, not zones. A zone is a place on the
         island and these are kinds of ground anywhere the sea made one, and the
         one claim this record exists to make -- the animal's ground and its
         fruit's ground are one ground -- cannot be written twice from two
         different vocabularies. `columnInto` reads it: it already asks which
         island's dome stands under the column it is filling, and a fruit whose
         habitat names that kind is set on the dry top of it. Nothing is planted
         here by hand, because nothing runs out there but that one rule.
         `bear` is the chance one metre of that dry sand carries a fruit. It is
         per column and hashed on the column's own address, so the same bar
         bears the same fruit in every world of this seed and in every fill of
         its chunks; a random draw at fill time would make the island a
         different island each time you sailed near it, which is the one thing
         the island round settled. What it comes to in the world is not stated
         here: node-smoke counts the cells over the 70 ordinals the reach holds
         and prints the total. */
      id: 'turtlemelon', cn: '龟果', en: 'Turtle Melon', rarity: 'uncommon', creature: 'turtle',
      habitat: ['sandbar', 'cay'], habitatCn: '沙洲顶上、沙岛沙滩上的干沙', habitatEn: 'the dry sand of a sand bar or of a sand cay',
      bear: 0.06,
      duration: 420,
      form: {
        /* No `dryTimer`: this skin does not dry. A turtle comes out of the water
           and stays out, and the body you wear with it has no clock running
           against it on the sand.
           `breatheAir` is this skin's, and it is the ordinary kind: the sea is
           not a place this body breathes, and it must come up. What it is not is
           the test for whether the sea carries the body -- that belongs to the
           animal's `locomotion` and to the level its `hover` states (see
           src/entities.js), and asking the breath instead is what used to leave
           this body standing on the seabed in the middle of an ocean. The breath
           decides how long a head may stay under, and the animal's row states
           that number: `breath` in data/creatures.js, not a shared one.
           The box is the animal's own shape: 1.5 m across the wings, and 0.45 m
           from the sand to the top of its head -- the height the model is carved
           to. That one is not a preference. The water's hold is asked of this
           number for the body worn from the fruit and of the model's own height
           for the animal that walks the sea, and a creature that hung one number
           in the water while standing another on the sand would be two animals
           with one name. `test/node-smoke.js` keeps the drawn body inside this
           box from below and from above. */
        cn: '海龟', en: 'sea turtle', size: [1.5, 0.45], breatheAir: true,
        stealth: 0.7, fov: 95
      },
      cost: ['它不呼吸水：海对这具身体不是能呼吸的地方。它躺在水面上，潜下去要自己按着，底下那口气是有数的', '陆地上很慢：每秒 1.45 米，比雨蛙还慢，这具身体也不会跳', '太大：1.5 米宽的身子进不了门，也挤不进林子'],
      costEn: ['it does not breathe water: the sea is not a place this body can breathe. it lies at the top of the water, going down is a thing it has to ask for, and the breath down there is counted', 'slow on land: 1.45 m/s, slower than the frog, and this body cannot jump at all', 'too big: a 1.5 m body does not fit through a door or between the trees'],
      lore: '沙洲顶上只有沙，瓜就躺在沙上。它不爬藤到别处去——它只要那片沙被日头晒干过。',
      loreEn: 'There is only sand on the crown of a bar, and the melon lies on it. It does not run its vines anywhere else — it only asks that the sand have been dry in the sun.'
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
