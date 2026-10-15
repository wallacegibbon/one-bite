/* ==========================================================================
 *  game.js -- game state: time/day-night, fruit backpack, storage, transformation, quests, interaction
 * ========================================================================== */
(function (N) {
  const RAR = N.RARITY, FRU = N.FRUIT_BY_ID, PLANT = N.PLANT_BY_ID, STO = N.STORAGE, IDEN = N.IDENTITY;

  const DAY_LEN = 420;          // one in-game day = 7 minutes of real time
  // v3: fruit blocks are numbered by position in data/fruits.js (40 + index), so
  // cutting a fruit renumbers the world. An old save would plant the wrong fruit
  // in someone's orchard, which is a worse surprise than losing the world.
  // v2 was the roster cut to four fruits; v3 is the cut to three (the jellyfish
  // body is gone), which moved frog pear and bruin fig down one block each.
  const SAVE_KEY = 'frutaria.save.v3';

  /* A save is data the browser hands back forever, not data the game is holding
     in memory: it can be the shape some other build wrote, a value a browser put
     down wrong, or something a person typed into the console. Everything in it
     lands in a slot the game indexes into, and none of the ways that goes wrong
     are polite: a position that is a string never lands and the body is nowhere
     at all, a clock that is a string stops the day, a queue holding a null throws
     inside update() every frame and freezes the valley with nothing on screen to
     say so, and a body wearing a fruit the valley no longer has throws on the
     getter every frame reads. So the save is read through four questions -- is it
     an object, is it a number, is it a list, is this a row of four numbers -- and
     what cannot be answered is left at its default instead of being carried in.
     These guard shapes, not values: a number a player typed for themselves is
     their own business, and the game has no reason to police it. */
  const plain = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const num = (v, d) => Number.isFinite(v) ? v : d;
  const list = v => Array.isArray(v) ? v : [];
  const rows = v => list(v).filter(plain);
  const cell = v => Array.isArray(v) && v.length === 4 && v.every(n => Number.isFinite(n));

  /* A fruit / plant / pit has no name of its own in the interface: it is read
     off the record in data/fruits.js, which carries a cn/en pair. */
  function itemName(id) { return N.disp(FRU[id] || PLANT[id] || { cn: id, en: id }); }
  /* A store has no name either -- the interface calls it by kind, so switching
     language cannot freeze a translated string inside a save file. */
  function storeName(s) { return N.t('store.' + (s.kind === 'tree' ? 'tree' : 'cellar')); }
  /* How much of a stroke a body built for water is doing this frame: the speed
     it is actually making through the water over the speed its own record swims
     at, and nothing at all when the water is not holding it up. A stroke is the
     thing that pushes water behind a body, so it is sized by the water the body
     is actually pushing: a body that is going nowhere does not kick at the lake,
     and a body standing on the lakebed has work for its legs that has nothing to
     do with swimming. `held` is what the water is doing to the body -- it is 0
     wherever the body is out of the water or standing on the bottom -- so it is
     the whole of the gate, and for the body you wear it is eased, which is what
     keeps a stroke coming and going over frames rather than in one. Both drawn
     bodies ask the same question; it used to be answered twice and differently,
     with a floor under the creature's answer that kept a hovering frog stroking
     at a lake it was not moving through. */
  function strokeOf(held, spd, swimSpeed) {
    return (held && swimSpeed) ? Math.min(1, spd / swimSpeed) : 0;
  }
  /* The water a drawn body stands in, for the shader. The static world carries
     its depth under the surface in with it -- the mesher measures it once when
     the mesh is built -- but a body's vertices are rebuilt every frame, so the
     draw has to be handed the surface of the column the body is in instead. It
     comes from the body, not from the lens: a frog hovering three metres down
     is three metres down whether or not the one looking at it has its head in
     the water. A body with no water in its column hands over nothing, and the
     shader's answer for "nothing" is the same one air gives. */
  function bodyWater(c, liqK) {
    return c.wSurf >= 0 ? { waterY: c.wSurf, waterK: liqK } : {};
  }

  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.R = new N.Renderer(canvas);
      this.world = new N.World(N.WORLD.w, N.WORLD.h, N.WORLD.d);
      this.player = new N.Player(this.world);
      this.creatures = [];
      this.particles = null;
      this.time = DAY_LEN * (7 / 24);      // start at 07:00
      this.day = 1;
      this.log = [];
      this.inv = [];                       // backpack
      this.stashes = [];                   // storage (the first entry is the main fruit cellar)
      this.growQueue = [];                 // planting growth
      this.regrow = [];                    // fruit regrowth
      this.posts = [];                     // owl post in transit
      this.diffs = [];                     // block edits (for saving)
      this.seen = {};                      // codex
      this.dexFruit = {};
      this.quests = [];
      this.mode = 'play';                  // play | cellar | journal | help | dead
      this.openStash = null;
      this.hover = null;                   // the block the crosshair ray points at
      this.prompt = '';
      this.thirdPerson = false;
      // the shot: the distance and the field of view are state, eased every frame
      this.cam = { d: 0, fov: 76 };      // yaw and pitch are the player's, never a copy
      this.camReady = false;
      this.dt = 0.016;
      this.creatureMeshes = {};
      this.env = null;
      this.night = 0;
      this.playerStealth = 1;
      this.buffs = {};
      this.stats = { harvested: 0, eaten: 0, reverted: 0, deaths: 0 };
      this.progress = 0;
      this.ready = false;
      this.drops = [];
      this.sel = 0; this.invSel = 0; this.stashSel = 0;
      this.upg = { pouch1: false, pouch2: false, divider: false };
      this.input = {};
      this.seed = 20261008;
    }

    /* ------------------------- init ------------------------- */
    init(seed) {
      this.seed = seed || 20261008;
      const t0 = performance.now();
      N.generate(this.world, this.seed);
      this.particles = new N.Particles(this.R.gl, 900);
      // storage. A store has no name of its own: the interface calls it by kind,
      // so switching language mid-save cannot freeze a translated string in it.
      // The town cellar belongs to the valley rather than to the save file, so it
      // is rebuilt from the map data and every lookup that means "the town" uses
      // cellar() instead of an index.
      this.stashes.push(this.makeCellar());
      // spawn
      const sp = N.spawn;
      this.player.x = sp.x; this.player.y = sp.y; this.player.z = sp.z;
      /* Which way the game opens is the world's business, not the camera's: the
         spawn search only accepts a column whose opening frame has sky in it, and
         it records the direction that frame looks. The old code turned the lens to
         +Z whatever was standing there, and in Lanternrow that was the main
         cellar's north wall. */
      this.player.yaw = sp.yaw === undefined ? Math.PI : sp.yaw;
      this.player.pitch = -0.1;
      // creatures
      this.spawnCreatures();
      // identity: the protagonist has no fixed name. id is stable, the epithet is
      // earned by deeds, the name is the player's own (docs/en/03 section 6).
      this.id = IDEN.idPrefix + Math.random().toString(36).slice(2, 2 + IDEN.idBytes);
      this.name = IDEN.nameDefault;
      // quests: a quest is an invitation to use a body (docs/en/06 s3), so its
      // text lives here next to the check that completes it
      this.quests = [
        { id: 'q1', cn: '认识主果窖', en: 'Know the main cellar', done: false,
          hint: { cn: '去灯笼镇的果窖（按 E 打开），把任意果实存进去',
                  en: 'go to the Lanternrow cellar (press E to open) and store any fruit' } },
        { id: 'q2', cn: '三颗猫头鹰果', en: 'Three Owlberries', done: false,
          hint: { cn: '低语林的橡树洞里找 3 颗猫头鹰果',
                  en: 'find 3 Owlberries in the oak hollows of the Whisperwood' } },
        { id: 'q3', cn: '夜之翼', en: 'Wing of Night', done: false,
          hint: { cn: '夜里吃下猫头鹰果，飞到 30 米以上',
                  en: 'at night eat an Owlberry and fly above 30 metres' } },
        { id: 'q4', cn: '镜湖的门票', en: 'The ticket to Mirrorlake', done: false,
          hint: { cn: '变成雨蛙下水，在沉塔的窗台上取一颗蛙果',
                  en: 'become a frog, get in the water, take a Frog Pear from the sill of the sunken tower' } },
        { id: 'q5', cn: '一颗棕熊果', en: 'One Bruin Fig', done: false,
          hint: { cn: '在北岭岩坡上摘一颗棕熊果：它占 12 格，7 分钟就失活——把它带进仓库',
                  en: 'pick a Bruin Fig off the ridge rock: it costs 12 slots and sleeps in 7 minutes — get it into a cellar' } },
        { id: 'q6', cn: '温室的银丝网', en: 'The silver mesh in the greenhouse', done: false,
          hint: { cn: '去星坠堡的果实温室（地窖），找那张银丝隔层',
                  en: "go to Starfall's fruit greenhouse (the cellar) and find the silver divider" } }
      ];
      // which epithet the valley has already been heard using. This is read off
      // the quest list, so it has to be taken after the quests exist.
      this.epithetSeen = this.epithet();
      this.meshTotal = this.world.cx * this.world.cz;
      this.meshDone = 0;
      this.logMsg(N.t('log.welcome'), 'good');
      return this;
    }

    /* progressive meshing (called while loading) */
    buildSomeChunks(budgetMs) {
      const t0 = performance.now();
      while (this.meshDone < this.meshTotal) {
        this.world.buildChunk(this.R.gl, this.meshDone++);
        if (performance.now() - t0 > budgetMs) break;
      }
      this.progress = this.meshDone / this.meshTotal;
      if (this.meshDone >= this.meshTotal) this.ready = true;
      return this.ready;
    }

    spawnCreatures() {
      const counts = { owl: 6, frog: 12, bear: 2, jelly: 10 };
      for (const sp of N.CREATURES) {
        const n = counts[sp.id] || 0;
        /* A species may name a landmark of its habitat zone instead of the
           whole zone. The lamp field is the sunken tower's outline, not
           "somewhere in a lake of radius 34" -- from the surface the field is
           what traces the tower, so the tower is what places the field. */
        const zone = N.ZONE_BY_ID[sp.habitat[0]];
        const at = sp.at && zone ? zone[sp.at] : null;
        for (let i = 0; i < n; i++) {
          /* A body is born where a body of its own kind is not already standing.
             The field of the sunken tower is ten lamps sampled into a disc of
             radius four round the tower, and only 8% of that disc is water: two
             of them were born 9 cm apart, and the pair spent the afternoon
             inside one another, because they started that way and the lake never
             gave them a reason to part. A body is born with the room its own
             trunk takes up. */
          const mw = N.MODEL_W[sp.model] || [0.5, 0.5, 0, 0];
          const room = (Math.max(mw[0], mw[1]) * (sp.scale || 0.2)) * 2 + 0.4;
          let p = null;
          for (let t = 0; t < 10; t++) {
            p = this.samplePos(sp.habitat[0], at, sp.spread || 4, sp.locomotion === 'fly');
            if (!p) break;
            let clash = false;
            for (const q of this.creatures) {
              if (q.sp.id !== sp.id) continue;
              if (Math.hypot(q.x - p.x, q.z - p.z) < room) { clash = true; break; }
            }
            if (!clash) break;
          }
          if (!p) continue;
          const c = new N.Creature(sp, p.x, p.y, p.z);
          /* The height a flying animal means to keep, and it has to be a height
             the world has. An owl sampled on top of a canopy was given five to
             thirteen metres above that: 51.5 in a world 48 tall. It also has to
             be a height that is not inside a tree: the ceiling used to be set
             five to thirteen metres above the ground under the bird, and where a
             spruce stood there that put it in the middle of the crown. The bird
             was then pushed up toward the top of the crown by the rule that keeps
             a flying body out of the ground, held back by the top of the world,
             and shut in on every side by the rule that will not let a flying body
             step into ground it is not above: one owl, five minutes, 18000 frames
             hovering at 46.99 inside the needles, never once moving. So the
             ceiling goes above the tallest thing in the column, and a column with
             no sky left over its crown is not a place to put a bird at all. */
          if (c.isFlyer()) {
            const bx = Math.floor(p.x), bz = Math.floor(p.z);
            /* The highest thing in the column: a crown, a tower, the lake's own
               surface. A flying body has to be **born in the air**. It used to be
               born on the ground of the column it was sampled in, and five of the
               six owls of a valley were born under a crown: the height they were
               asked to keep was inside the crown, the rule that will not put a
               flying body inside anything refused every rise, and the bird lived
               its whole life in the two metres between the leaf litter and the
               needles -- measured, five of six birds spent the whole of a minute
               with a solid block one layer over their heads. So the body starts
               above whatever is in the column, and the ceiling it will not ask to
               be above starts above that. */
            const top = Math.max(N.groundY(this.world, bx, bz, this.world.h - 1),
              this.world.liquidSurfaceAt(bx, bz));
            c.y = Math.min(top + 1.5 + Math.random() * 4, this.world.h - 3);
            c.flyY = Math.min(Math.max(c.y + 5 + Math.random() * 8, top + 2), this.world.h - 3);
          }
          this.creatures.push(c);
        }
      }
    }
    samplePos(zoneId, at, spread, needsSky) {
      const z = N.ZONE_BY_ID[zoneId] || N.ZONE_BY_ID.whisperwood;
      const W = this.world;
      for (let t = 0; t < 300; t++) {
        let x, zz;
        if (at) {
          /* A spread is a radius, not a half-width: every other branch below
             samples a disc, and the creature data, the dex ("the field sits on
             the tower's outline") and the test all read it that way. Sampling a
             square instead let a lamp stand 5.7 m from a 4 m spread, and the
             field's honest bound -- twice the spread -- came out wrong. */
          const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * spread;
          x = at[0] + Math.cos(a) * r; zz = at[1] + Math.sin(a) * r;
        } else if (z.kind === 'circle') {
          const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * z.r;
          x = z.cx + Math.cos(a) * r; zz = z.cz + Math.sin(a) * r;
        } else if (z.kind === 'rect') {
          x = z.x0 + Math.random() * (z.x1 - z.x0); zz = z.z0 + Math.random() * (z.z1 - z.z0);
        } else if (z.kind === 'sky') {
          const isle = N.SKY_ISLES[(Math.random() * N.SKY_ISLES.length) | 0];
          const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * isle.r;
          x = isle.x + Math.cos(a) * r; zz = isle.z + Math.sin(a) * r;
          const y = isle.top + 1;
          return { x, y, z: zz };
        } else { // border
          const side = (Math.random() * 4) | 0;
          if (side === 0) { x = 8 + Math.random() * (W.w - 16); zz = 9; }
          else if (side === 1) { x = 8 + Math.random() * (W.w - 16); zz = W.d - 10; }
          else if (side === 2) { x = 9; zz = 8 + Math.random() * (W.d - 16); }
          else { x = W.w - 10; zz = 8 + Math.random() * (W.d - 16); }
        }
        x = Math.max(8, Math.min(W.w - 8, x)); zz = Math.max(8, Math.min(W.d - 8, zz));
        /* The ground, not the crown above it -- see terrainY. And the ground
           cell itself has to be air: an animal put down inside a trunk is an
           animal standing in a tree. */
        const gy = N.terrainY(W, Math.floor(x), Math.floor(zz), W.h - 1);
        if (W.solidAt(Math.floor(x), gy, Math.floor(zz))) continue;
        /* A body that flies needs sky over its head, not just ground under its
           feet: the tallest spruce in this valley reaches 47 of the world's 48
           rows, and a bird put under a crown like that has nowhere to go. */
        if (needsSky && N.groundY(W, Math.floor(x), Math.floor(zz), W.h - 1) + 3 >= W.h) continue;
        const water = W.liquidAt(Math.floor(x), gy, Math.floor(zz));
        if (z.id === 'mirrorlake') {
          let depth = 0; for (let y = gy; y < W.h && W.liquidAt(Math.floor(x), y, Math.floor(zz)); y++) depth++;
          if (depth >= 2) return { x, y: gy + 1, z: zz };
          continue;
        }
        if (water) continue;
        if (gy < 3) continue;
        return { x, y: gy, z: zz };
      }
      return null;
    }

    /* ------------------------- time / environment ------------------------- */
    get hour() { return (this.time / DAY_LEN * 24) % 24; }
    updateEnv() {
      const h = this.hour;
      const ang = (h / 24) * Math.PI * 2 - Math.PI / 2;
      const el = Math.sin(ang);                       // sun elevation
      const day = Math.max(0, Math.min(1, el * 1.6 + 0.22));
      const dusk = Math.max(0, 1 - Math.abs(el) * 4);
      this.daylight = 0.16 + day * 0.84;
      this.night = 1 - day;
      const sunDir = [Math.cos(ang) * 0.42, el, Math.sin(ang) * 0.35 - 0.3];
      const L = Math.hypot(sunDir[0], sunDir[1], sunDir[2]);
      sunDir[0] /= L; sunDir[1] /= L; sunDir[2] /= L;
      const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      const nightZen = [0.035, 0.05, 0.10], dayZen = [0.30, 0.52, 0.86];
      const nightHor = [0.10, 0.12, 0.20], dayHor = [0.72, 0.82, 0.92];
      const duskHor = [0.95, 0.52, 0.30];
      let zenith = mix(nightZen, dayZen, day);
      let horizon = mix(nightHor, dayHor, day);
      horizon = mix(horizon, duskHor, dusk * 0.75);
      let fogCol = mix(horizon, zenith, 0.35);
      let fogDen = 0.0075 + this.night * 0.006;
      /* The dark of a night is not a grey. The only light a night has is the sky
         itself, so a surface lit by nothing else has to keep the sky's colour and
         stay near the sky's own brightness: multiplied by the night's 16%, a dark
         material -- conifer 0.14/0.30/0.20, dark leaf, roof tile -- lands at
         luminance 7..10 while the night sky behind it is 17..21, and a tree or a
         roof reads as a hole cut in the sky. Measured on four night frames: 4..42%
         of the frame below luminance 12, darkest surface 6.8, against a sky of
         17.3..21.3; the same four frames at 13:00 have 0% below 12.
         The term is **added**, not multiplied, because that is the shape the
         problem has: it lifts a dark surface by most of its own value and a
         bright one by hardly anything. The gate is the one the sky shader already
         uses for the stars -- the sun has to be properly down, not merely low --
         so dusk, which has light of its own, is left alone. */
      const down = Math.max(0, Math.min(1, -el / 0.2));
      const skyLight = mix(zenith, horizon, 0.5);
      const ambK = down * down * (3 - 2 * down) * 0.42;
      // the Grey Veil
      const W = this.world, p = this.player;
      const edge = Math.min(p.x, p.z, W.w - p.x, W.d - p.z);
      if (edge < 22) { fogDen += (22 - edge) * 0.004; fogCol = mix(fogCol, [0.55, 0.57, 0.62], (22 - edge) / 22 * 0.8); }
      /* The water the **lens** is sitting in, not the water the body is standing
         in. In third person the lens trails the body, and it trails it down: a
         body standing in the lake with its head in the air has its lens 0.2 m
         under the surface as soon as the view tilts up, and it is the lens that
         draws the frame. The body keeps breath, wetness and the bubbles -- those
         are not a view. The lens read here is one frame old, because render()
         takes the frame update() handed it; that is the same lag the body's own
         head test had, since the environment is built before the player moves. */
      const lens = this._lens || { x: p.x, y: p.eyePos(), z: p.z };
      const wf = W.liquidFogAt(Math.floor(lens.x), Math.floor(lens.y), Math.floor(lens.z));
      /* What the stuff the lens is sitting in does to **light**, as opposed to
         what it does to the view: the haze above is the view, these two are the
         light, and all of them come off the block row that says what the stuff
         is made of. Air is the default -- 0.75 of a lamp's glow survives the
         haze, daylight stays white, and there is no surface overhead -- so a
         frame drawn in air is bit for bit what it was. */
      let emisKeep = 0.75, waterK = [0, 0, 0], waterY = 0, hazeK = [0, 0, 0], hazeOn = 0, inWater = 0;
      if (wf) {
        if (wf.emis !== undefined) emisKeep = wf.emis;
        /* A liquid that states a per-colour law replaces the air's haze outright
           -- the law, and the colour the haze fades to: the haze over a lake is
           the lake's own colour, the same colour the water puts into the light
           climbing out of it. One colour and one law, and the law it states for
           the lens is the one applied to the light coming back up through the
           surface -- which is the whole of why the lake is the same water seen
           from either side of the skin. A liquid that states only a density
           keeps the air's shape and takes the density instead. */
        if (wf.k) { waterK = wf.k; hazeK = wf.k; hazeOn = 1; fogCol = wf.c; }
        else { fogCol = mix(fogCol, wf.c, wf.t); fogDen = wf.den; }
        inWater = 1;
        waterY = W.liquidTopAt(Math.floor(lens.x), Math.floor(lens.y), Math.floor(lens.z));
      }
      /* Night vision belongs to the eye, not to the sky. `daylight` and `night`
         stay what the sky is -- animals and the HUD read those -- and only the
         rendered brightness changes, so an owl and a frog standing in the same
         dark see two different rooms. The cost the owl's fruit lists is the
         same eye seen from the other side: one built for the dark is
         overwhelmed by daylight, so in the sun the world washes out white. */
      let eyeDay = this.daylight;
      const nv = p.formDef.nightVision || 0;
      if (nv > 0) {
        eyeDay = Math.min(1, eyeDay + this.night * nv * 0.6);
        const glare = day * nv;
        fogDen += glare * 0.010;
        fogCol = mix(fogCol, [0.92, 0.93, 0.96], glare * 0.55);
      }
      this.env = {
        time: this.time, day: eyeDay, night: this.night,
        fogCol, fogDen, zenith, horizon, ground: mix(horizon, [0.25, 0.22, 0.2], 0.5),
        ambient: [skyLight[0] * ambK, skyLight[1] * ambK, skyLight[2] * ambK],
        emisKeep, waterK, waterY, hazeK, hazeOn, inWater,
        /* The one colour a veil of this liquid paints over the view. The haze
           the lens is inside and the surface the lens looks through are the same
           stuff, so they get the same colour out of the same block row. */
        veil: W.liquidVeil(),
        liqK: W.liquidAbsorb(),
        sunDir, sunCol: mix([0.4, 0.5, 0.8], [1.0, 0.95, 0.8], Math.max(0, el * 2)),
        far: 260
      };
    }

    /* ------------------------- log ------------------------- */
    logMsg(text, kind) {
      this.log.push({ text, kind: kind || '', t: 0 });
      if (this.log.length > 40) this.log.shift();
      if (this.ui) this.ui.onLog();
    }

    /* ------------------------- storage ------------------------- */
    /* The town cellar is a place in the valley, not a thing the player owns: it
       is always present, at the cellar door the map names. Field stores (the
       cellar trees) are the player's and come from the save file. */
    makeCellar() {
      const poi = N.POIS.find(p => p.id === 'cellar') || { x: 136, z: 134, y: 20 };
      return { id: 'cellar', kind: 'cellar', slots: STO.cellar.slots, decay: STO.cellar.decay,
               items: [], x: poi.x, y: poi.y + 1, z: poi.z };
    }
    cellar() { return this.stashes.find(s => s.id === 'cellar') || this.stashes[0]; }
    /* Merge a saved store list without ever losing the town cellar: an old or
       partial save may hold only the trees, and then stashes[0] would be a tree
       while every "the town" lookup still expects the cellar. */
    mergeStashes(saved) {
      const kept = rows(saved).filter(s => s.id);
      const cellar = kept.find(s => s.id === 'cellar') || this.makeCellar();
      cellar.kind = 'cellar';
      return [cellar].concat(kept.filter(s => s.id !== 'cellar'));
    }

    /* ------------------------- backpack ------------------------- */
    /* capacity = base 24 + pouches earned; the silver divider makes rare-and-above cost 1 slot less */
    cap() {
      let c = STO.backpack.slots;
      for (const u of STO.backpack.upgrades) if (this.upg[u.id]) c += u.slots;
      return c;
    }
    divider() { return !!this.upg.divider; }
    used(items) {
      let u = 0;
      for (const it of (items || this.inv)) u += this.slotOf(it);
      return u;
    }
    slotOf(it) {
      const d = it.kind === 'fruit' ? FRU[it.id] : it.kind === 'pit' ? FRU[it.id] : PLANT[it.id];
      if (!d) return 1;
      let s = it.kind === 'pit' ? Math.max(1, Math.ceil(RAR[d.rarity].slots / 2)) : RAR[d.rarity].slots;
      if (this.divider() && RAR[d.rarity].tier >= 3) s = Math.max(1, s - 1);
      return s;
    }
    canFit(items, it, extra) {
      return this.used(items) + this.slotOf(it) <= (extra || this.cap());
    }
    addItem(kind, id, fresh) {
      const d = kind === 'fruit' ? FRU[id] : kind === 'pit' ? FRU[id] : PLANT[id];
      if (!d) return false;
      const it = { kind, id, fresh: fresh !== undefined ? fresh : (RAR[d.rarity].fresh || 9999), maxFresh: RAR[d.rarity].fresh || 9999 };
      if (!this.canFit(this.inv, it)) { this.logMsg(N.t('log.packFull', { u: this.used(), c: this.cap() }), 'bad'); return false; }
      this.inv.push(it);
      this.dexFruit[id] = true;
      return true;
    }
    /* One item, one decay step, one rule: pits and plants do not spoil, and a
       fruit that runs out goes dormant instead of going negative (the storage
       panel clamps at zero, which is how this stayed invisible). */
    decayOne(it, dt, rate) {
      if (it.kind === 'pit' || it.kind === 'plant') return false;
      it.fresh -= dt * rate;
      if (it.fresh > 0) return false;
      it.fresh = 0;              // dormant, not "infinitely expired"
      it.kind = 'pit';
      this.logMsg(N.t('log.dormant', { n: itemName(it.id) }), 'warn');
      return true;
    }
    decayItems(dt) {
      for (const it of this.inv) this.decayOne(it, dt, STO.backpack.decay);
      for (const s of this.stashes) for (const it of s.items) this.decayOne(it, dt, s.decay);
    }

    /* ------------------------- interaction ------------------------- */
    /* The crosshair is the lens. In first person the two are the same line, so
       the ray leaves the eye. In third person it has to leave the lens, or the
       highlighted box is not the box E picks: the lens sits several metres behind
       the head and points along the same direction from a different place.
       `reach` still belongs to the body, not to the lens -- the block has to be
       within reach of the body you are wearing, and in front of it. */
    rayTarget() {
      const p = this.player, REACH = 5.5;
      const cp = Math.cos(p.pitch), sp = Math.sin(p.pitch);
      const dx = Math.sin(p.yaw) * cp, dy = sp, dz = -Math.cos(p.yaw) * cp;
      const ey = p.eyePos();
      const c = this.thirdPerson ? this._camFrame : null;
      if (!c) return this.world.raycast(p.x, ey, p.z, dx, dy, dz, REACH);
      const back = Math.hypot(c.x - p.x, c.y - ey, c.z - p.z);
      const t = this.world.raycast(c.x, c.y, c.z, dx, dy, dz, back + REACH);
      if (!t) return null;
      const hx = c.x + dx * t.t, hy = c.y + dy * t.t, hz = c.z + dz * t.t;
      if (Math.hypot(hx - p.x, hy - ey, hz - p.z) > REACH) return null;   // out of the body's reach
      if ((hx - p.x) * dx + (hy - ey) * dy + (hz - p.z) * dz < 0) return null;   // behind the body
      return t;
    }
    nearestCreature(r) {
      let best = null, bd = r;
      const p = this.player;
      for (const c of this.creatures) {
        const d = Math.hypot(c.x - p.x, c.y - p.y, c.z - p.z);
        if (d < bd) { bd = d; best = c; }
      }
      return best;
    }
    interact() {
      const p = this.player;
      // 1. storage
      for (const s of this.stashes) {
        if (Math.hypot(s.x + 0.5 - p.x, s.y + 1 - p.y, s.z + 0.5 - p.z) < 3.2) { this.openStashUI(s); return; }
      }
      // 2. creatures
      const c = this.nearestCreature(4.5);
      if (c) { this.observe(c); return; }
      // 3. blocks
      const t = this.rayTarget();
      if (!t) return;
      const b = this.world.get(t.x, t.y, t.z);
      const bd = N.BLOCKS[b];
      if (!bd) return;
      if (N.FRUIT_BLOCK[b]) { this.harvest(t.x, t.y, t.z, b); return; }
      if (N.PLANT_BLOCK[b]) { this.harvest(t.x, t.y, t.z, b); return; }
      if (bd.store) { this.openStashUI(this.cellar()); return; }
    }
    harvest(x, y, z, b) {
      const fid = N.FRUIT_BLOCK[b], pid = N.PLANT_BLOCK[b];
      let ok;
      if (fid) ok = this.addItem('fruit', fid);
      else if (pid) ok = this.addItem('plant', pid);
      if (!ok) return;
      this.setBlock(x, y, z, 0);
      this.stats.harvested++;
      const d = fid ? FRU[fid] : PLANT[pid];
      this.logMsg(N.t('log.pick', { n: N.disp(d), r: N.disp(RAR[d.rarity]), s: RAR[d.rarity].slots }), 'good');
      if (fid) this.regrow.push({ x, y, z, b, t: RAR[d.rarity].regrow * DAY_LEN * (0.8 + Math.random() * 0.4) });
      if (this.quests) this.checkQuests();
    }
    setBlock(x, y, z, b) {
      this.world.set(x, y, z, b);
      this.diffs.push([x, y, z, b]);
    }

    /* observe a creature -> codex */
    observe(c) {
      const first = !this.seen[c.sp.id];
      this.seen[c.sp.id] = true;
      const att = c.attitudeTo(this.player.form);
      this.logMsg(N.t('log.observe', {
        n: N.disp(c.sp),
        new: first ? N.t('log.observeNew') : '',
        f: this.player.form ? N.disp(FRU[this.player.form].form) : N.t('log.humanShape'),
        a: N.t('att.' + att)
      }), first ? 'good' : '');
      if (first && this.ui) this.ui.onLog();
    }

    /* ------------------------- transformation ------------------------- */
    useSelected() {
      const p = this.player;
      const it = this.inv[this.sel || 0];
      if (!it) { this.logMsg(N.t('log.noSel'), 'warn'); return; }
      if (it.kind === 'fruit') this.eat(it.id, this.sel);
      else if (it.kind === 'plant') this.usePlant(it, this.sel);
      else if (it.kind === 'pit') this.plantPit(it, this.sel);
    }
    eat(fruitId, slotIdx) {
      const f = FRU[fruitId];
      if (!f || !f.duration) { this.logMsg(N.t('log.notEdible'), 'warn'); return; }
      const p = this.player;
      /* The body you are about to wear has to fit where you are standing. docs
         04 s4 makes the collision box a hard gate -- a bear at 1.4x1.5 does not
         fit the 1x1 crevice a frog does -- and a body that cannot fit cannot be
         worn, so the fruit is not spent and the valley says why. A body that
         ends on a timer cannot be refused, so `unstick` is still the net under
         revert, death and load. */
      const was = p.form;
      p.form = fruitId;
      const noRoom = p.hits(p.x, p.y, p.z);
      p.form = was;
      if (noRoom) { this.logMsg(N.t('log.noRoomForm', { f: N.disp(f.form) }), 'warn'); return; }
      // One body at a time: a second fruit simply replaces the body you are
      // wearing. There is no organ that holds two magics, so there is nothing
      // to churn and no counter of how many you have swallowed -- the cost is
      // the body you end early and the fruit you spent (docs/en/00 P3).
      if (p.form) this.logMsg(N.t('log.overwrite', { a: N.disp(FRU[p.form].form), b: N.disp(f.form) }), 'warn');
      p.form = fruitId;
      p.formT = f.duration; p.formMax = f.duration;
      p.unstick();          // the new body may not fit where the old one stood
      this.inv.splice(slotIdx, 1);
      this.stats.eaten++;
      this.dexFruit[fruitId] = true;
      this.logMsg(N.t('log.eat', { n: N.disp(f), f: N.disp(f.form), c: f.cost.length ? N.t('log.eatCost', { c: N.costList(f) }) : '' }), 'good');
      this.particleBurst(p.x, p.y + 1, p.z, N.RARITY[f.rarity].color, 40);
      this.ensureModel(f.creature);
      this.checkQuests();
    }
    revert(why) {
      const p = this.player;
      if (!p.form) return;
      p.form = null; p.formT = 0;
      p.unstick();          // ... and neither may the body you come back to
      this.stats.reverted++;
      this.logMsg(N.t('log.revert', { w: why || N.t('log.revertTime') }), '');
    }
    usePlant(it, slotIdx) {
      const p = this.player, pl = PLANT[it.id];
      if (pl.effect === 'plant') {
        // plant it in the ground
        const t = this.world;
        const bx = Math.floor(p.x), bz = Math.floor(p.z);
        const by = N.groundY(t, bx, bz, Math.floor(p.y + 3));
        if (by < 1) return;
        this.setBlock(bx, by, bz, N.PLANT_BLOCK_REV[it.id]);
        this.inv.splice(slotIdx, 1);
        this.logMsg(N.t('log.plantSeed', { n: N.disp(pl) }), 'good');
        return;
      }
      if (pl.effect === 'build') { this.buildCellarTree(); this.inv.splice(slotIdx, 1); return; }
      const dur = pl.effect === 'light' ? 300 : pl.effect === 'jump' ? 90 : pl.effect === 'stealth' ? 120 : 90;
      this.buffs[pl.effect] = dur;
      this.inv.splice(slotIdx, 1);
      this.logMsg(N.t('log.eatPlant', { n: N.disp(pl), d: N.descOf(pl) }), 'good');
    }
    plantPit(it, slotIdx) {
      const p = this.player;
      const bx = Math.floor(p.x), bz = Math.floor(p.z);
      const by = N.groundY(this.world, bx, bz, Math.floor(p.y + 3));
      if (by < 1) return;
      this.setBlock(bx, by, bz, N.BLOCK_ID.trunk);
      this.growQueue.push({ x: bx, y: by, z: bz, t: 120, fruit: it.id });
      this.inv.splice(slotIdx, 1);
      this.logMsg(N.t('log.plantPit', { n: itemName(it.id) }), 'good');
    }
    buildCellarTree() {
      const p = this.player;
      const trees = this.stashes.filter(s => s.kind === 'tree').length;
      if (trees >= STO.treestash.max) { this.logMsg(N.t('log.treeCap', { n: STO.treestash.max }), 'warn'); return; }
      const bx = Math.floor(p.x), bz = Math.floor(p.z);
      const by = N.groundY(this.world, bx, bz, Math.floor(p.y + 3));
      if (by < 1) return;
      // roots must not overlap: the same rule the docs state as a minimum distance
      for (const s of this.stashes) {
        if (s.kind !== 'tree') continue;
        if (Math.hypot(bx - s.x, bz - s.z) < STO.treestash.minDist) {
          this.logMsg(N.t('log.treeNear', { n: STO.treestash.minDist }), 'warn');
          return;
        }
      }
      for (let y = 1; y <= 4; y++) this.setBlock(bx, by + y, bz, N.BLOCK_ID.cellarTrunk);
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++)
        for (let dy = 4; dy <= 6; dy++)
          if (dx * dx + dz * dz + (dy - 5) * (dy - 5) < 7 && !(dx === 0 && dz === 0 && dy < 4)) this.setBlock(bx + dx, by + dy, bz + dz, N.BLOCK_ID.darkLeaf);
      this.setBlock(bx, by, bz, N.BLOCK_ID.cellarCore);
      const id = 'tree' + (this.stashes.length);
      this.stashes.push({ id, kind: 'tree', slots: STO.treestash.slots, decay: STO.treestash.decay, items: [], x: bx, y: by, z: bz, owner: this.id });
      p.unstick();          // the trunk grows up through the body that planted it
      this.logMsg(N.t('log.treeBuilt', { s: STO.treestash.slots }), 'good');
    }

    /* ------------------------- storage UI ------------------------- */
    openStashUI(s) {
      this.openStash = s; this.mode = 'cellar';
      this.logMsg(N.t('log.openStore', { n: storeName(s), d: s.decay }), 'good');
      if (this.ui) this.ui.showCellar(true);
    }
    // the other half of openStashUI. The panel itself is the UI's business, but
    // the shelf it was showing belongs to the game: closing the panel must not
    // leave a stash open behind it.
    closeStashUI() { this.mode = 'play'; this.openStash = null; }
    moveItem(dir) {
      const s = this.openStash; if (!s) return;
      const from = dir === 'in' ? this.inv : s.items;
      const to = dir === 'in' ? s.items : this.inv;
      const idx = dir === 'in' ? (this.invSel || 0) : (this.stashSel || 0);
      const it = from[idx]; if (!it) return;
      const capTo = dir === 'in' ? s.slots : this.cap();
      if (this.used(to) + this.slotOf(it) > capTo) { this.logMsg(N.t('log.noRoom'), 'bad'); return; }
      from.splice(idx, 1); to.push(it);
      if (this.quests) this.checkQuests();
    }

    /* ------------------------- owl post (docs/en/05 section 5.2) ------------------------- */
    /* cellar tree -> main cellar, one fruit at a time, delivered after 3 in-game days, 10% lost.
       Requires at least one owlberry stored in the main cellar (unlocks "Pendulum"). */
    owlUnlocked() { return this.cellar().items.some(i => i.id === 'owlberry') || this._owlUnlocked; }
    postItem() {
      const s = this.openStash;
      if (!s) return;
      if (s.kind !== 'tree') { this.logMsg(N.t('log.postTreeOnly'), 'warn'); return; }
      if (!this.owlUnlocked()) { this.logMsg(N.t('log.postLocked'), 'warn'); return; }
      if (this.posts.length >= 3) { this.logMsg(N.t('log.postBusy'), 'warn'); return; }
      const it = s.items[this.stashSel || 0];
      if (!it) { this.logMsg(N.t('log.postNone'), 'warn'); return; }
      s.items.splice(this.stashSel || 0, 1);
      this.stashSel = Math.max(0, (this.stashSel || 0) - 1);
      this.posts.push({ it, t: 3 * DAY_LEN, from: s.id });
      this._owlUnlocked = true;
      this.logMsg(N.t('log.postSent', { n: itemName(it.id) }), 'good');
      if (this.ui) this.ui.renderCellar();
    }
    updatePosts(dt) {
      for (let i = this.posts.length - 1; i >= 0; i--) {
        const po = this.posts[i];
        po.t -= dt;
        // in the owl's claws it spoils at the main cellar's rate, and it can go
        // dormant on the way: the same rule as on any shelf, not a second one
        this.decayOne(po.it, dt, STO.cellar.decay);
        if (po.t > 0) continue;
        this.posts.splice(i, 1);
        const name = itemName(po.it.id);
        if (Math.random() < 0.10) {
          this.logMsg(N.t('log.postLost', { n: name }), 'bad');
          this.stats.postLost = (this.stats.postLost || 0) + 1;
        } else if (this.used(this.cellar().items) + this.slotOf(po.it) > this.cellar().slots) {
          this.logMsg(N.t('log.postFull', { n: name }), 'warn');
          const back = this.stashes.find(s => s.id === po.from);
          (back || this.cellar()).items.push(po.it);
        } else {
          this.cellar().items.push(po.it);
          this.logMsg(N.t('log.postArrived', { n: name }), 'good');
          this.stats.postSent = (this.stats.postSent || 0) + 1;
        }
      }
    }

    /* ------------------------- damage / status ------------------------- */
    damage(a, cause) {
      const p = this.player;
      p.vital -= a;
      if (p.vital <= 0) this.die(cause);
    }
    onCreatureTouch(c, dt) {
      const p = this.player;
      p.fright = Math.min(1, p.fright + dt * 0.9);
      this.damage(dt * 0.5, N.disp(c.sp));
      if (Math.random() < dt * 2) this.logMsg(N.t('log.chased', { n: N.disp(c.sp) }), 'bad');
    }
    /* The lamp jellyfish is not chasing anyone -- you are standing inside it.
       The warning is throttled so wading through a field of ten does not fill
       the log, and it says what the answer is, because the answer is a body. */
    onSting(c, dt) {
      this.damage(dt * c.sp.sting, N.t('log.causeSting'));
      if (this._stungAt === undefined || this.time - this._stungAt > 12) {
        this._stungAt = this.time;
        this.logMsg(N.t('log.stung', { n: N.disp(c.sp) }), 'bad');
      }
    }
    onVeil(p) {
      this.veilWarn = (this.veilWarn || 0) + 1;
      if (this.veilWarn % 40 === 1) this.logMsg(N.t('log.veil'), 'warn');
      // no form walks the fog any more: the veil is a border, not a place
      p.vital -= 0.004;
    }
    die(cause) {
      const p = this.player;
      this.stats.deaths++;
      // stop the rest of this tick: whatever is still mid-update is holding a
      // form and a position that just stopped describing this body
      p.dead = true;
      this.logMsg(N.t('log.died', { z: this.zoneName(), c: cause }), 'bad');
      // fruit scatters
      const W = this.world;
      const sx = Math.floor(p.x), sy = Math.floor(p.y), sz = Math.floor(p.z);
      /* The fruit lies on the surface of the place it lands: the ground, or the
         top of the water over it, because fruit that sinks to the floor of a
         lake 18 m down is fruit nobody can dive for on one breath -- and
         "retrievable" is the whole point of scattering it rather than deleting
         it (docs/en/06 s6). A crown is not ground (see terrainY), and a column
         whose surface is not level with the place the body fell is a column the
         fruit cannot be picked back up from, so it lands at the body's feet.
         Before this the fruit simply stayed a metre above the height the body
         died at: measured, from a lake shore all 8 landed under water and one
         of them 29 m down; on a roof all 8 hung in the air, up to 3 m above the
         ground beside it; in a forest 1 of 8 inside a trunk. */
      const restY = (x, z) => {
        const bx = Math.floor(x), bz = Math.floor(z);
        const gy = N.terrainY(W, bx, bz, W.h - 1);
        /* Both answers are heights -- the top face of the ground, the film of the
           water -- so they are compared as what they are. `waterTop` answers the
           index of the topmost water block, which is one block under the film:
           compared against a height it loses a metre to the ground in exactly the
           shallow water where the two are closest. */
        const wSurf = W.liquidSurfaceAt(bx, bz);
        const y = wSurf >= gy ? wSurf : gy;
        return W.solidAt(bx, y, bz) ? null : y;
      };
      const home = restY(p.x, p.z);
      const feet = home === null ? sy : home;
      for (const it of this.inv) {
        const dx = sx + (Math.random() * 3 - 1.5), dz = sz + (Math.random() * 3 - 1.5);
        const y = restY(dx, dz);
        const ok = y !== null && Math.abs(y - feet) <= 2;
        this.drops.push({ x: ok ? dx : p.x, y: ok ? y : feet, z: ok ? dz : p.z, item: it, t: 600 });
      }
      this.inv = [];
      p.vital = 5; p.air = p.maxAir(); p.fright = 0; p.form = null; p.formT = 0;
      const s = this.cellar();
      p.x = s.x + 2; p.y = s.y + 1; p.z = s.z + 2; p.vx = p.vy = p.vz = 0;
      this.mode = 'dead';
      if (this.ui) this.ui.showDead(true);
    }

    /* ------------------------- per-game-day rolls ------------------------- */
    /* docs/en/05: a cellar tree is a living store -- it attracts thieves. The main cellar is guarded by Old Mei and is never robbed. */
    dailyRolls() {
      // the town cellar is deliberately skipped: the docs state theft as a rule of
      // field storage (05, cellar-tree table), not of the town, which has Old Mei.
      for (const s of this.stashes) {
        if (s.kind === 'cellar') continue;
        if (!s.items.length) continue;
        if (Math.random() >= STO.treestash.raidChance) continue;
        const near = Math.hypot(this.player.x - s.x, this.player.z - s.z) < STO.treestash.raidScareRadius;
        const who = N.t(Math.random() < 0.6 ? 'log.raiderBear' : 'log.raiderMan');
        const where = s.kind === 'tree' ? N.t('store.yourTree') : storeName(s);
        if (near) {
          this.logMsg(N.t('log.raidScared', { w: who, p: where }), 'good');
          this.stats.raidsScared = (this.stats.raidsScared || 0) + 1;
        } else {
          const n = Math.min(s.items.length, STO.treestash.raidMin +
            ((Math.random() * (STO.treestash.raidMax - STO.treestash.raidMin + 1)) | 0));
          const taken = [];
          for (let k = 0; k < n; k++) {
            const j = (Math.random() * s.items.length) | 0;
            const it = s.items.splice(j, 1)[0];
            taken.push(it ? itemName(it.id) : '?');
          }
          this.logMsg(N.t('log.raidTaken', { w: who, p: where, n: N.tlist(taken) }), 'bad');
          this.stats.raidsLost = (this.stats.raidsLost || 0) + n;
        }
      }
    }

    /* ------------------------- quests ------------------------- */
    checkQuests() {
      const p = this.player;
      const q = (id) => this.quests.find(x => x.id === id);
      const done = (qq, msg) => { if (qq && !qq.done) { qq.done = true; this.logMsg(N.t('log.questDone', { n: N.disp(qq), m: msg ? N.t('log.questDoneMsg', { m: msg }) : '' }), 'good'); } };
      /* One pass over the backpack and every shelf. This used to filter the
         same arrays eight times over, once per quest, and it ran every frame. */
      const have = {};
      for (const it of this.inv) if (it.kind === 'fruit') have[it.id] = (have[it.id] || 0) + 1;
      for (const s of this.stashes) for (const it of s.items) have[it.id] = (have[it.id] || 0) + 1;
      const n = id => have[id] || 0;
      // backpack upgrades: cap() changes the moment one is granted, and it is announced once
      const grant = (uid) => {
        if (this.upg[uid]) return;
        const u = STO.backpack.upgrades.find(x => x.id === uid);
        if (!u) return;
        this.upg[uid] = true;
        this.logMsg(N.t('log.upgrade', { n: N.disp(u), e: u.slots ? N.t('log.upgSlots', { n: u.slots }) : N.t('log.upgRare'), d: N.descOf(u) }), 'good');
      };
      if (this.cellar().items.length > 0) { done(q('q1')); grant('pouch1'); }
      if (n('owlberry') >= 3) done(q('q2'));
      if (p.form === 'owlberry' && p.y > 30) done(q('q3'), N.t('log.q3msg'));
      if (n('frogpear') >= 1) { done(q('q4')); grant('pouch2'); }
      // q5 asks for the fruit, not the body: a legendary one costs 12 of 24
      // slots and sleeps in 420 s, so the quest is the carry, not the climb
      if (n('bruinfig') >= 1) done(q('q5'));
      // q6: walk to the Starfall fruit greenhouse (cellar door)
      const gh = N.POIS.find(x => x.id === 'greenhouse');
      if (gh && Math.hypot(p.x - gh.x, p.z - gh.z) < 6 && p.y > gh.y - 6 && p.y < gh.y + 10) { done(q('q6'), N.t('log.q6msg')); grant('divider'); }
      this.checkEpithet();
    }
    /* The HUD asks for this every frame. The answer only changes when the player
       crosses into another place, so it is cached on a metre of grid -- and the
       locale is part of the key, because the name itself is translated. */
    zoneName() {
      const p = this.player;
      const k = (p.x | 0) + ',' + (p.y | 0) + ',' + (p.z | 0) + ',' + N.locale();
      if (k === this._zoneKey) return this._zoneName;
      const name = this.zoneNameAt(p);
      this._zoneKey = k; this._zoneName = name;
      return name;
    }
    zoneNameAt(p) {
      let best = null, score = -1e9;
      for (const z of N.ZONES) {
        if (z.kind === 'border') continue;
        if (z.kind === 'sky') { if (p.y > 28) { const d = Math.min(...N.SKY_ISLES.map(i => Math.hypot(i.x - p.x, i.z - p.z))); if (d < 30 && 100 - d > score) { score = 100 - d; best = z; } } continue; }
        if (z.kind === 'circle') {
          const d = Math.hypot(z.cx - p.x, z.cz - p.z);
          if (d < z.r) { const s = (z.r - d) / z.r * 100 + (z.id === 'starfall' ? 40 : 0); if (s > score) { score = s; best = z; } }
        } else if (z.kind === 'rect') {
          if (p.x > z.x0 && p.x < z.x1 && p.z > z.z0 && p.z < z.z1) { const s = 60; if (s > score) { score = s; best = z; } }
        }
      }
      if (p.y > 28 && (!best || best.kind !== 'sky')) {
        const d = Math.min(...N.SKY_ISLES.map(i => Math.hypot(i.x - p.x, i.z - p.z)));
        if (d < 26) return N.disp(N.ZONE_BY_ID.cloudspire);
      }
      return best ? N.disp(best) : N.t('log.wilderness');
    }

    particleBurst(x, y, z, col, n) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.283, s = Math.random() * 3;
        this.particles.spawn(x, y + Math.random(), z, Math.cos(a) * s, Math.random() * 3, Math.sin(a) * s, 1.2 + Math.random(), col, 0.35);
      }
    }

    /* ------------------------- model cache ------------------------- */
    ensureModel(id) {
      if (!this.creatureMeshes[id]) this.creatureMeshes[id] = N.buildModelMeshes(this.R.gl, N.MODELS[id]);
      return this.creatureMeshes[id];
    }
    /* ------------------------- main loop ------------------------- */
    update(dt) {
      if (!this.ready) return;
      this.player.dead = false;      // the stop sign a death raised lasts exactly one tick
      // clamp so a stalled tab cannot teleport the camera or the physics
      this.dt = Math.min(dt, 0.05);
      this.frames = (this.frames || 0) + 1;
      this._fpsT = (this._fpsT || 0) + dt; this._fpsN = (this._fpsN || 0) + 1;
      if (this._fpsT > 1) { this.fps = this._fpsN / this._fpsT; this._fpsT = 0; this._fpsN = 0; }
      this.time += dt;
      if (this.hour < 0.01 && this.lastHour !== undefined && this.lastHour > 20) { this.day++; this.dailyRolls(); }
      this.lastHour = this.hour;
      this.updateEnv();

      const playing = this.mode === 'play';
      if (playing) this.player.update(dt, this.input || {}, this);
      else this.player.moveAmt = 0;

      // form timer
      const p = this.player;
      if (p.form) {
        let rate = 1;
        const f = FRU[p.form].form;
        // A body that breathes water is weakened out of it -- unless it is
        // amphibian, which pays with drying skin instead (docs/en/04 s3).
        if (f.breatheAir === false && !f.dryTimer && !this.player.headWater) rate = 2;
        if (p.fright > 0.3) rate += p.fright;                                 // fright drains the timer
        p.formT -= dt * rate;
        if (p.formT <= 0) this.revert();
      }
      // buff
      for (const k in this.buffs) { this.buffs[k] -= dt; if (this.buffs[k] <= 0) delete this.buffs[k]; }
      this.playerStealth = (this.buffs.stealth ? 0.3 : 1);

      // creatures. The middle of a herd is worked out once a tick for the whole
      // valley, not once per animal per neighbour.
      this.herdCentres = {};
      for (const c of this.creatures) {
        const h = this.herdCentres[c.sp.id] || (this.herdCentres[c.sp.id] = { x: 0, z: 0, n: 0 });
        h.x += c.x; h.z += c.z; h.n++;
      }
      for (const id in this.herdCentres) { const h = this.herdCentres[id]; h.x /= h.n; h.z /= h.n; }
      for (const c of this.creatures) {
        const d = Math.hypot(c.x - p.x, c.z - p.z);
        if (d < 160) c.update(dt, p, this.world, this);
      }
      // particles (fireflies / embers / splashes)
      this.ambient(dt);
      this.particles.update(dt, this.world);

      // fruit regrowth
      for (let i = this.regrow.length - 1; i >= 0; i--) {
        const r = this.regrow[i]; r.t -= dt;
        if (r.t <= 0) { if (!this.world.get(r.x, r.y, r.z)) this.setBlock(r.x, r.y, r.z, r.b); this.regrow.splice(i, 1); }
      }
      // owl post
      if (this.posts.length) this.updatePosts(dt);
      // planting growth
      for (let i = this.growQueue.length - 1; i >= 0; i--) {
        const g = this.growQueue[i]; g.t -= dt;
        if (g.t <= 0) {
          for (let y = 1; y <= 4; y++) this.setBlock(g.x, g.y + y, g.z, N.BLOCK_ID.trunk);
          for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = 4; dy <= 6; dy++)
            if (dx * dx + dz * dz + (dy - 5) * (dy - 5) < 6) this.setBlock(g.x + dx, g.y + dy, g.z + dz, N.BLOCK_ID.leaf);
          const fb = N.FRUIT_BLOCK_REV[g.fruit];
          if (fb) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1]]) if (this.world.get(g.x + dx, g.y + 5, g.z + dz) === N.BLOCK_ID.leaf) this.setBlock(g.x + dx, g.y + 5, g.z + dz, fb);
          this.growQueue.splice(i, 1);
          this.player.unstick();   // ... and a pit that reaches your height grows past you, not through you
          this.logMsg(N.t('log.sapling'), 'good');
        }
      }
      // picking up scattered fruit
      if (this.drops) {
        for (let i = this.drops.length - 1; i >= 0; i--) {
          const d = this.drops[i]; d.t -= dt;
          if (d.t <= 0) { this.drops.splice(i, 1); continue; }
          if (Math.hypot(d.x - p.x, d.y - p.y, d.z - p.z) < 1.6) {
            if (this.addItem(d.item.kind, d.item.id, d.item.fresh)) { this.drops.splice(i, 1); this.logMsg(N.t('log.pickUp', { n: itemName(d.item.id) }), 'good'); }
          }
        }
      }
      this.decayItems(dt);

      // geometry catches up with the world: harvesting, planting, regrowth and
      // cellar trees all edit blocks, and each edit flags its chunk
      if (this.world.anyDirty()) this.world.rebuildDirty(this.R.gl, 6);

      /* The frame's camera is worked out here, before the picking ray, so the
         crosshair, the highlight box and E all agree on one line. render() uses
         this frame instead of computing a second one, which would ease the
         distance and the field of view twice per frame. */
      this._camFrame = this.shootCamera(p);

      // interaction prompt
      this.prompt = '';
      if (playing) {
        for (const s of this.stashes) {
          if (Math.hypot(s.x + 0.5 - p.x, s.y + 1 - p.y, s.z + 0.5 - p.z) < 3.2) this.prompt = N.t('log.promptOpen', { n: storeName(s) });
        }
        if (!this.prompt) {
          const c = this.nearestCreature(4.5);
          if (c) this.prompt = N.t('log.promptObserve', { n: N.disp(c.sp) });
        }
        if (!this.prompt) {
          const t = this.rayTarget();
          if (t) {
            const b = this.world.get(t.x, t.y, t.z);
            const bd = N.BLOCKS[b] || {};
            this.hover = t;
            if (N.FRUIT_BLOCK[b]) this.prompt = N.t('log.promptPickFruit', { n: N.disp(FRU[N.FRUIT_BLOCK[b]]) });
            else if (N.PLANT_BLOCK[b]) this.prompt = N.t('log.promptPickPlant', { n: N.disp(PLANT[N.PLANT_BLOCK[b]]) });
            else if (bd.store) this.prompt = N.t('log.promptCellar');
          } else this.hover = null;
        } else this.hover = null;
      }
      /* Quests are an invitation, not a poll. Everything that can complete one
         (harvest, eat, moving an item into a store) already calls checkQuests()
         the moment it happens; the periodic pass is only there for the two that
         depend on where the player is standing, and four times a second notices
         that as well as every frame does. */
      this._questT = (this._questT || 0) - dt;
      if (this._questT <= 0) { this._questT = 0.25; this.checkQuests(); }
    }

    ambient(dt) {
      const p = this.player, P = this.particles;
      if (!this.ambTimer) this.ambTimer = 0;
      this.ambTimer -= dt;
      if (this.ambTimer > 0) return;
      this.ambTimer = 0.12;
      const n = this.night;
      // fireflies (forest at night). A firefly flies in the air, and the column
      // read answers "the highest solid thing in this column" -- over a lake
      // that is the lakebed, so the old span put **25** of **71** fireflies
      // under the surface of Mirrorlake, and **33%** of the night's motes ended
      // up glowing through as much as **9.4 m** of lake: the same strange bright
      // dot the lakebed used to be. The surface of the water is the floor to
      // lift off from where there is one, and a column with no room above its
      // highest solid -- a cliff that goes on past the search height -- leaves
      // the mote unmade rather than buried (**11** of **71** were buried).
      if (n > 0.4 && Math.random() < 0.7) {
        const a = Math.random() * 6.283, r = 4 + Math.random() * 14;
        const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
        const fx = Math.floor(x), fz = Math.floor(z);
        const gy = Math.max(N.groundY(this.world, fx, fz, Math.floor(p.y + 6)),
                            this.world.liquidSurfaceAt(fx, fz)) + 0.6;
        /* and the column has to be a column of this world. The ring motes are
           scattered over reaches eighteen metres out from the body, and near the
           edge of the map that ring is off the map, where `get` answers "air" to a
           question that was never asked: standing eight blocks in from the edge,
           **85** of **682** fireflies were let go at x = -0.3 and the like, and
           **21,863** of **149,080** mote-samples (**14.7%**) were spent outside the
           valley, glowing at nothing. */
        if (this.world.inside(fx, gy | 0, fz) && !this.world.solidAt(fx, gy | 0, fz))
          P.spawn(x, gy, z, (Math.random() - 0.5) * 0.6, 0.2 + Math.random() * 0.3, (Math.random() - 0.5) * 0.6, 3 + Math.random() * 3, [0.7, 1, 0.45], 0.16, 0);
      }
      // bubbles off a body that is swimming under. They are born under the
      // surface and pop at it, so the span they are scattered over is the water
      // the body stands in, not two metres straight up from its feet: measured
      // over ten seconds of a body on a four metre shelf, **55%** of the bubbles
      // the old span let go were already out in the open air at the moment they
      // were born, and a bubble born in the air is not a bubble at all
      if (p.headWater && Math.random() < 0.6) {
        const a = Math.random() * 6.283, r = 1 + Math.random() * 6;
        const hi = (p.wSurf >= 0 ? p.wSurf - 0.25 : p.y + 2);
        P.spawn(p.x + Math.cos(a) * r, p.y + Math.random() * Math.max(0.4, hi - p.y), p.z + Math.sin(a) * r,
          0, 0.8 + Math.random(), 0, 2.5, [0.5, 0.85, 1], 0.14, -0.5);
      }
      // dust and silk drifting off the old beams on the highest isle. The grain
      // is let go at the first air above the height the beams stand at, which is
      // the same question the firefly above it asks: the span used to be a box
      // centred on the isle, and the isle is standing in it -- **87** of **371**
      // grains were born inside a block, where a mote is not seen through a block
      // but simply is not, and **20,793** of the **65,627** samples the dust did
      // survive (**31.7%**) were spent inside one.
      const beams = N.POIS.find(q => q.id === 'beams');
      if (Math.hypot(beams.x - p.x, beams.z - p.z) < 40 && Math.random() < 0.8) {
        const bx = beams.x + (Math.random() - 0.5) * 10, bz = beams.z + (Math.random() - 0.5) * 10;
        const fx = Math.floor(bx), fz = Math.floor(bz);
        let by = beams.y + 1;
        while (by < beams.y + 8 && this.world.solidAt(fx, by | 0, fz)) by++;
        if (!this.world.solidAt(fx, by | 0, fz))
          P.spawn(bx, by, bz,
            (Math.random() - 0.5) * 0.4, 0.3 + Math.random() * 0.6, (Math.random() - 0.5) * 0.4, 2 + Math.random() * 2, [0.85, 0.85, 0.75], 0.16, 0.05);
      }
    }

    /* ------------------------- camera -------------------------
       You are both the actor and the subject of the shot, so the lens never
       cuts. Pressing V pushes it out instead of switching views, changing
       form widens it gradually, and terrain pulls it in. Every value is eased
       as a rate-per-second (N.ease), so the shot feels identical at 30 or 144 fps.

       The lens points exactly where the mouse points, in both views. What
       trails behind is the body (`faceYaw`), which has mass. A trailing lens
       was the bug: it meant W ran off in a direction the screen was not pointing
       at, and the crosshair sat over a block the picking ray was not pointing at. */
    shootCamera(p) {
      const dt = this.dt || 0.016;
      const cam = this.cam, sz = p.size(), h = sz[1], w = sz[0];
      const dWant = this.thirdPerson ? 1.5 + 2.25 * h : 0;      // the subject holds roughly the same frame share
      const fovWant = p.fov() + (this.thirdPerson ? 8 : 0);
      if (!this.camReady) { cam.d = dWant; cam.fov = fovWant; this.camReady = true; }
      cam.d += (dWant - cam.d) * N.ease(5.5, dt);
      cam.fov += (fovWant - cam.fov) * N.ease(3.5, dt);

      // the direction from the subject to the lens (a unit vector)
      const cp = Math.cos(p.pitch);
      const ox = -Math.sin(p.yaw) * cp, oz = Math.cos(p.yaw) * cp, oy = -Math.sin(p.pitch);
      const eyeY = this.thirdPerson ? p.y + h * 0.68 : p.eyePos();
      let d = cam.d;
      /* Never let terrain stand between the subject and the lens. The lens is
         backed off to the **face** of the block in the way. Sampling points along
         the line and stepping back a fixed 0.35 m from the first sample that
         landed inside a block left the lens buried in a hillside: a sample
         inside a block says nothing about where that block's surface is. */
      if (this.thirdPerson) {
        const hit = this.world.raycast(p.x, eyeY, p.z, ox, oy, oz, cam.d, true);
        if (hit) d = Math.max(0.55, hit.t - 0.2);
      }
      const x = p.x + ox * d, y = eyeY + oy * d, z = p.z + oz * d;
      /* pulled in this far, the lens is inside the body it is filming: the world
         is drawn, the body is not, or you look at the inside of your own skull */
      const inBody = this.thirdPerson &&
        Math.abs(x - p.x) < w * 0.5 + 0.12 && Math.abs(z - p.z) < w * 0.5 + 0.12 &&
        y > p.y - 0.12 && y < p.y + h + 0.12;
      /* the lens this frame drew, for the next frame's environment: what the
         lens is looking through is a property of the lens (see updateEnv) */
      this._lens = { x, y, z };
      return { x, y, z, yaw: p.yaw, pitch: p.pitch, fov: cam.fov, d, inBody };
    }

    /* ------------------------- render ------------------------- */
    render() {
      const R = this.R, p = this.player, env = this.env;
      // the frame update() prepared, or a fresh one when update() did not run
      // (the start screen, ?freeze): the lens must not be a frame behind
      const cam = this._camFrame || this.shootCamera(p);
      this._camFrame = null;
      R.begin(cam, env);

      const IDENT = N.M4.create();
      // world. Glass is collected here and drawn later, after the bodies: the
      // depth they wrote decides whether a body shows through a window
      const W = this.world;
      const glass = [];
      for (let cz = 0; cz < W.cz; cz++) for (let cx = 0; cx < W.cx; cx++) {
        const ci = cz * W.cx + cx;
        const m = W.chunks[ci];
        if (!m) continue;
        // a chunk is a box 16 x 48 x 16, and it is culled as one
        if (!R.visibleBox(cx * W.cs, 0, cz * W.cs, cx * W.cs + W.cs, W.h, cz * W.cs + W.cs)) continue;
        R.drawMesh(m[0], IDENT, {});
        R.drawMesh(m[1], IDENT, { emisBoost: 0.15 });
        R.drawMesh(m[3], IDENT, {});
        R.drawMesh(m[4], IDENT, { emisBoost: 0.2 });
        if (m[5]) glass.push(m[5]);
      }
      /* highlight (wireframe, not a solid cube). The twelve bars are built once,
         around the origin, and the block they are aimed at rides in the model
         matrix -- which is how a dropped fruit is already drawn. They used to be
         rebuilt in world coordinates every frame and thrown away again: 12 box
         calls, 432 vertices and 4,752 array pushes a frame, 0.035 ms of a 0.74 ms
         render pass, and while the crosshair was moving that also meant three GL
         buffers deleted and three made again every frame -- 360 uploads in 360
         frames. Aimed at one block the box is the same twelve bars at the same
         world positions; only the matrix carrying them there is different. */
      if (this.hover && this.mode === 'play') {
        if (!this._hl) {
          const mb = new N.MeshBuilder();
          const e = 0.05, h = e / 2, L = 1 + e, S = 1 - e;
          const c = [1, 0.92, 0.62];
          for (const a of [0, 1]) for (const b of [0, 1]) {
            mb.box(-h, a - h, b - h, L, e, e, c, true, 1);   // along X (includes the corners)
            mb.box(a - h, h, b - h, e, S, e, c, true, 1);    // along Y (inset, so edges never overlap)
            mb.box(a - h, b - h, h, e, e, S, c, true, 1);    // along Z (inset)
          }
          this._hl = mb.upload(R.gl);
        }
        const t = this.hover;
        const m = N.M4.create();
        N.M4.trans(m, t.x, t.y, t.z);
        R.drawMesh(this._hl, m, { noCull: true });
      }
      // scattered fruit (dropped on death, can be recovered)
      if (this.drops.length) {
        if (!this._dropMesh) {
          const mb0 = new N.MeshBuilder();
          mb0.box(-0.25, -0.25, -0.25, 0.5, 0.5, 0.5, [1, 1, 1], false, 1);
          this._dropMesh = mb0.upload(R.gl);
        }
        for (const d of this.drops) {
          const col = N.RARITY[(FRU[d.item.id] || PLANT[d.item.id] || { rarity: 'common' }).rarity].color;
          const m = N.M4.create();
          N.M4.trans(m, d.x, d.y + 0.35 + Math.sin(this.time * 2 + d.x) * 0.08, d.z);
          R.drawMesh(this._dropMesh, m, { tint: col, tintA: 1, emisBoost: 0.5, day: Math.max(0.6, this.daylight),
            waterY: W.liquidSurfaceAt(Math.floor(d.x), Math.floor(d.z)), waterK: this.env.liqK });
        }
      }
      // creatures
      for (const c of this.creatures) {
        const d = Math.hypot(c.x - cam.x, c.y - cam.y, c.z - cam.z);
        if (d > 90) continue;
        if (!R.visible(c.x, c.y + 1, c.z, 4)) continue;
        const parts = this.ensureModel(c.sp.model);
        const sc = c.sp.scale;
        const base = N.M4.create();
        N.M4.trans(base, c.x, c.y, c.z);
        const ry = N.M4.create(); N.M4.faceY(ry, c.yaw);
        N.M4.mul(base, base, ry);
        if (Math.abs(c.bank || 0) > 0.002) {    // the same lean the player's body gets
          const rz = N.M4.create(); N.M4.rotZ(rz, c.bank);
          N.M4.mul(base, base, rz);
        }
        if (Math.abs(c.tilt || 0) > 0.002) {    // and the same nose along the path
          const rx = N.M4.create(); N.M4.rotX(rx, c.tilt);
          N.M4.mul(base, base, rx);
        }
        // a body that just landed is briefly shorter and wider: the cheapest
        // thing in the world that makes a hop look like a hop
        const sq = c.squash || 0;
        const sm = N.M4.create(); N.M4.scale(sm, sc * (1 + sq * 0.5), sc * (1 - sq), sc * (1 + sq * 0.5));
        N.M4.mul(base, base, sm);
        const st = {
          t: this.time + c.phase,
          // the stride this body is in, and how hard it is asking for one: both
          // are measured by the body's own update, off the ground it covered
          gait: c.gait, move: N.walkMove(c.speed, c.sp.speed),
          fly: c.isFlyer() && c.state !== 'roost',
          air: c.airAmt || 0, crouch: c.crouch || 0, phase: c.phase,
          /* how far above the ground it would stand on this body is, in its own
             body heights. A limb the body stands on has to be where its feet
             will land, so its flight pose waits for the ground to get out of
             the way -- see partAngles in models.js, and the `stands` flag. */
          off: Math.max(0, Math.min(1,
            (c.y - N.groundY(W, Math.floor(c.x), Math.floor(c.z), Math.floor(c.y))) / (N.MODEL_H[c.sp.model] * sc))),
          flap: c.flap === undefined ? 1 : c.flap,
          // only a body the data gives a swim speed to: a bear wading still walks
          swim: strokeOf(c.held, c.speed, c.sp.swimSpeed),
          held: c.held || 0,
          // signed rad/s of heading: the outside leg of a turn does the work
          turn: c.bend || 0
        };
        const wopt = bodyWater(c, this.env.liqK);
        for (const e of parts) {
          const m = N.partMatrix(N.M4.create(), base, e, st, parts);
          R.drawMesh(e.mesh, m, wopt);
        }
      }
      /* The body being filmed rides in the same place as every other body: with
         the creatures, before the glass and the water. Drawn after the water it
         sat on top of the lake's own blend, so a body standing in the lake with
         the lens above the surface kept a dry colour from its feet to its head:
         at (51.5,105.5) with the lens 5.6 m out over the water, the 371 pixels
         of the body below the surface line changed by 0 between a frame with the
         water meshes and a frame without them, while the lakebed behind them
         moved by 148 on average. The water writes no depth, so it cannot hide
         the body -- it only tints what is already behind it. */
      if (this.thirdPerson && !cam.inBody) {
        const parts = this.ensureModel(p.modelId);
        const sc = p.bodyScale();
        const base = N.M4.create();
        N.M4.trans(base, p.x, p.y, p.z);
        const ry = N.M4.create(); N.M4.faceY(ry, p.faceYaw);
        N.M4.mul(base, base, ry);
        if (Math.abs(p.bank) > 0.002) {          // lean into the turn, like a filmed one
          const rz = N.M4.create(); N.M4.rotZ(rz, p.bank);
          N.M4.mul(base, base, rz);
        }
        if (Math.abs(p.tilt || 0) > 0.002) {     // and nose along the path it is taking
          const rx = N.M4.create(); N.M4.rotX(rx, p.tilt);
          N.M4.mul(base, base, rx);
        }
        const sq = p.squash || 0;
        // rising fast stretches the body the way landing flattens it
        const stretch = p.grounded ? 0 : Math.min(0.1, Math.abs(p.vy) / 220);
        const sm = N.M4.create();
        N.M4.scale(sm, sc * (1 + sq * 0.5 - stretch * 0.3), sc * (1 - sq + stretch), sc * (1 + sq * 0.5 - stretch * 0.3));
        N.M4.mul(base, base, sm);
        const st = {
          t: this.time,
          gait: p.gait, move: p.walkMove(),
          fly: !!p.formDef.fly && !p.grounded,
          air: p.airAmt || 0, crouch: p.crouch || 0, phase: 0,
          // the same clearance the creatures' bodies get: see above
          off: Math.max(0, Math.min(1,
            (p.y - N.groundY(W, Math.floor(p.x), Math.floor(p.z), Math.floor(p.y))) / (N.MODEL_H[p.modelId] * sc))),
          flap: p.flap === undefined ? 1 : p.flap,
          /* the form decides, not the water: a human in the lake wades, a frog
             kicks. The stroke is sized by the water the body is actually pushing
             -- see `strokeOf` above the draw -- and this is the one body in the
             valley whose hold is eased, so a stroke comes in over a few frames
             and goes out the same way instead of in one. */
          swim: p.formDef.swim ? strokeOf(p.held, Math.hypot(p.vx, p.vz), p.cruise) : 0,
          held: p.held || 0,
          // signed rad/s of heading: the outside leg of a turn does the work
          turn: p.bend || 0
        };
        const wopt = bodyWater(p, this.env.liqK);
        for (const e of parts) R.drawMesh(e.mesh, N.partMatrix(N.M4.create(), base, e, st, parts), wopt);
      }
      // glass, drawn over the world and the bodies it is in front of. It writes
      // no depth (blend does that), so what shows through it is decided by the
      // depth the opaque pass and the bodies already left behind
      for (const gm of glass) R.drawMesh(gm, IDENT, { blend: true });
      // water. The mesh is the surface: one quad per face where water meets
      // air, and the mesher bakes into each one how much water stands under
      // that face. Nothing about the veil is a constant here -- the block row
      // says what the stuff is made of and the shader works out what that does
      // to the light on its way through it.
      /* What the water does to the light of a lakebed is not drawn here at all:
         it is asked of the lakebed, in the vertex shader, and of the water the
         lens is sitting in, in the haze. What this face carries is what only the
         face knows -- how much of the view the surface throws back, and the
         water between the lens and whatever lies behind it, which is the case
         of looking up at the sky out of a lake. It goes on in two passes because
         that survival is per colour and a blend scales the frame by one number:
         the first scales, the second adds. Together they are why a lake is a
         mirror from the bank and a window from a boat. */
      /* The surface is one quad per block face, so seen from underneath it is a
         back face, and the culler threw it away: a lens under the water line
         looked straight through the lake at the sky. Standing in the lake in
         third person with the lens 0.2 m under the surface, every one of 64,000
         sampled rays hit water first and 38,958 of them rendered as open sky.
         A lake is a closed volume and the mesher only ever emits a face where
         water meets air, so no pixel can ever see both sides of one quad --
         un-culling it costs nothing in blending and adds no geometry. */
      for (let cz = 0; cz < W.cz; cz++) for (let cx = 0; cx < W.cx; cx++) {
        const ci = cz * W.cx + cx;
        const m = W.chunks[ci];
        if (!m || !m[2]) continue;
        if (!R.visibleBox(cx * W.cs, 0, cz * W.cs, cx * W.cs + W.cs, W.h, cz * W.cs + W.cs)) continue;
        R.drawMesh(m[2], IDENT, { pane: 1, wave: true, noCull: true });
        R.drawMesh(m[2], IDENT, { pane: 2, wave: true, noCull: true });
      }
      // particles: the world goes along, because what eats a mote's light is
      // the water it sits in, and only the world knows where the water is
      this.particles.draw(R, this.world);
    }

    /* ------------------------- identity (docs/en/03 section 6) ------------------------- */
    // the valley's name for you: the last earned epithet wins.
    // The HUD reads this every frame and the answer only moves when a quest
    // does, so it is cached on the quest flags themselves -- a test that flips
    // a `done` by hand still gets a fresh answer, because the flags changed.
    epithet() {
      const flags = this.quests.map(q => q.done ? 1 : 0).join('');
      if (flags === this._epFlags) return this._ep;
      this._epFlags = flags;
      const met = id => id === 'all' ? this.quests.every(q => q.done)
                                     : !!(this.quests.find(q => q.id === id) || {}).done;
      let cur = IDEN.epithetDefault;
      for (const e of IDEN.epithets) if (met(e.quest)) cur = e;
      this._ep = cur;
      return cur;
    }
    // the player's own name: mutable, not unique, never used by fiction text
    setName(s) {
      const raw = String(s == null ? '' : s).trim();
      this.name = raw.slice(0, IDEN.nameMax);
      if (raw.length > IDEN.nameMax) this.logMsg(N.t('log.nameTooLong', { n: IDEN.nameMax }), 'warn');
      this.logMsg(this.name
        ? N.t('log.named', { n: this.name })
        : N.t('log.unnamed', { e: N.disp(this.epithet()) }), 'good');
      return this.name;
    }
    // announce a change of epithet once, when the valley starts using it.
    // The comparison is on the record itself, not on its text: switching
    // language mid-session must not read as the valley having renamed you.
    checkEpithet() {
      const e = this.epithet();
      if (e !== this.epithetSeen) { this.epithetSeen = e; this.logMsg(N.t('log.epithet', { e: N.disp(e) }), 'good'); }
    }

    /* ------------------------- save ------------------------- */
    hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
    clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* nothing to clear */ } }
    /* What the start screen quotes back, without loading anything. A save that is
       not an object is not offered back at all: the screen would otherwise promise
       "walk back to where you left off" over a valley it cannot give. */
    saveInfo() {
      try {
        const s = JSON.parse(localStorage.getItem(SAVE_KEY));
        if (!plain(s)) return null;
        return {
          day: num(s.day, 1),
          hour: Math.floor((num(s.time, 0) / DAY_LEN * 24) % 24),
          items: list(s.inv).length,
          trees: rows(s.stashes).filter(x => x.kind === 'tree').length
        };
      } catch (e) { return null; }
    }

    /* Everything that would otherwise be lost on a reload is written here: the
       block diff rather than the voxels, the queues (regrowth, planting, owl
       post, fruit scattered on death), the stores, the identity and the clock.
       Nothing translated is stored -- a store is named by its kind, a quest
       keeps its text next to the check that completes it. */
    save() {
      try {
        const p = this.player;
        const s = {
          id: this.id, name: this.name,
          time: this.time, day: this.day, seed: this.seed,
          p: { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, vital: p.vital,
               form: p.form, formT: p.formT, formMax: p.formMax, dry: p.dry },
          inv: this.inv,
          stashes: this.stashes.map(s2 => ({ id: s2.id, slots: s2.slots, decay: s2.decay, items: s2.items, x: s2.x, y: s2.y, z: s2.z, kind: s2.kind, owner: s2.owner })),
          diffs: this.diffs, seen: this.seen, dex: this.dexFruit,
          regrow: this.regrow, growQueue: this.growQueue, posts: this.posts, drops: this.drops,
          buffs: this.buffs,
          owl: this._owlUnlocked || false,
          quests: this.quests.map(q => [q.id, q.done]), stats: this.stats, upg: this.upg
        };
        localStorage.setItem(SAVE_KEY, JSON.stringify(s));
        this.logMsg(N.t('log.saved'), 'good');
      } catch (e) { this.logMsg(N.t('log.saveFail', { m: e.message }), 'bad'); }
    }
    load() {
      let s;
      try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { s = null; }
      if (!plain(s)) return false;
      // identity: keep the saved id (the world's memory is keyed on it), never a name we invented
      this.id = typeof s.id === 'string' ? s.id : this.id;
      this.name = typeof s.name === 'string' ? s.name : '';
      this.time = num(s.time, this.time); this.day = num(s.day, this.day);
      this.inv = rows(s.inv);
      this.stashes = this.mergeStashes(s.stashes);
      this.seen = plain(s.seen) ? s.seen : {};
      this.dexFruit = plain(s.dex) ? s.dex : {};
      this.stats = plain(s.stats) ? s.stats : this.stats;
      /* A diff row is four numbers and a place inside the valley: anything else
         either plants a block at the wrong cell (a null passes a `>= 0` test and
         lands at cell 0) or names a block the block table has no colour for, and
         the mesher then throws over the chunk it was written into. Only the rows
         that were applied are kept, so a save cannot go on writing what the game
         refused. */
      const kept = [];
      for (const d of list(s.diffs)) {
        if (!cell(d) || !this.world.inside(d[0], d[1], d[2]) || !N.BLOCKS[d[3]]) continue;
        const c = [d[0] | 0, d[1] | 0, d[2] | 0, d[3] | 0];
        this.world.set(c[0], c[1], c[2], c[3]);
        kept.push(c);
      }
      this.diffs = kept;
      this.regrow = rows(s.regrow);
      this.growQueue = rows(s.growQueue);      // a planted pit must still be growing after a reload
      this.drops = rows(s.drops);              // fruit scattered on death stays recoverable
      this.buffs = plain(s.buffs) ? s.buffs : {};
      this.posts = rows(s.posts); this._owlUnlocked = !!s.owl;
      const p = this.player, sp = plain(s.p) ? s.p : {};
      Object.assign(p, { x: num(sp.x, p.x), y: num(sp.y, p.y), z: num(sp.z, p.z),
        yaw: num(sp.yaw, p.yaw), pitch: num(sp.pitch, p.pitch),
        vital: num(sp.vital, p.vital),
        // a body wearing a fruit the valley no longer has wakes up as itself: the
        // day, the pack, the cellar and the codex all come back, which is the part
        // a player would actually miss, and the getter every frame reads is safe
        form: FRU[sp.form] ? sp.form : null, formT: num(sp.formT, p.formT),
        formMax: num(sp.formMax, 0) || num(sp.formT, 0) || 1, dry: num(sp.dry, 0) });
      // the block diffs are applied above, so a cellar tree may have grown into
      // the spot the save was written at: the body it restores has to fit again
      p.unstick();
      for (const q of list(s.quests)) {
        if (!Array.isArray(q)) continue;
        const qq = this.quests.find(x => x.id === q[0]); if (qq) qq.done = !!q[1];
      }
      if (plain(s.upg)) Object.assign(this.upg, s.upg);
      // read off the restored quests, so it has to come after them
      this.epithetSeen = this.epithet();
      this.lastHour = this.hour;               // a loaded clock must not read as a new day
      // the diffs above flagged their chunks; the budgeted rebuild in update()
      // re-meshes exactly those, so loading does not stall on a full remesh
      this.meshDone = this.meshTotal; this.ready = true;
      this.logMsg(N.t('log.loaded'), 'good');
      return true;
    }
  }

  N.Game = Game;
  N.DAY_LEN = DAY_LEN;
  N.SAVE_KEY = SAVE_KEY;      // the tests write a save by hand; they must use the same key

})(window.FRUTARIA = window.FRUTARIA || {});
