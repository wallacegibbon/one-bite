/* ==========================================================================
 *  game.js -- game state: time/day-night, fruit backpack, storage, transformation, quests, interaction
 * ========================================================================== */
(function (N) {
  const RAR = N.RARITY, FRU = N.FRUIT_BY_ID, PLANT = N.PLANT_BY_ID, STO = N.STORAGE, IDEN = N.IDENTITY;

  const DAY_LEN = 420;          // one in-game day = 7 minutes of real time
  const SAVE_KEY = 'frutaria.save.v1';

  /* A fruit / plant / pit has no name of its own in the interface: it is read
     off the record in data/fruits.js, which carries a cn/en pair. */
  function itemName(id) { return N.disp(FRU[id] || PLANT[id] || { cn: id, en: id }); }
  /* A store has no name either -- the interface calls it by kind, so switching
     language cannot freeze a translated string inside a save file. */
  function storeName(s) { return N.t('store.' + (s.kind === 'tree' ? 'tree' : 'cellar')); }

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
      this.mode = 'play';                  // play | cellar | journal | dead
      this.openStash = null;
      this.hover = null;                   // the block the crosshair ray points at
      this.msgTimer = 0;
      this.prompt = '';
      this.thirdPerson = false;
      // the shot: distance / yaw / pitch / fov are state, eased every frame
      this.cam = { yaw: 0, pitch: 0, d: 0, fov: 76 };
      this.camReady = false;
      this.dt = 0.016;
      this.handMeshes = {};
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
      this.stashes.push({ id: 'cellar', kind: 'cellar', slots: STO.cellar.slots, decay: STO.cellar.decay, items: [], x: 136, y: 21, z: 134 });
      // spawn
      const sp = N.spawn;
      this.player.x = sp.x; this.player.y = sp.y; this.player.z = sp.z;
      this.player.yaw = Math.PI; this.player.pitch = -0.1;
      // creatures
      this.spawnCreatures();
      // identity: the protagonist has no fixed name. id is stable, the epithet is
      // earned by deeds, the name is the player's own (docs/en/03 section 6).
      this.id = IDEN.idPrefix + Math.random().toString(36).slice(2, 2 + IDEN.idBytes);
      this.name = IDEN.nameDefault;
      this.traits = { mixStomach: true };   // a character trait, not a world law
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
        { id: 'q5', cn: '深鹿林的通行证', en: 'The pass into the Deep Grove', done: false,
          hint: { cn: '变成白尾鹿沿鹿径走进深鹿林，摘一颗鹿茸菌果',
                  en: 'become a deer, follow the deer path into the Deep Grove, pick a Stagcap' } },
        { id: 'q6', cn: '云顶的旧梁', en: 'The old beams of the Cloudspire', done: false,
          hint: { cn: '飞到云顶，在旧梁上摘一颗丝莓（梁蛛不欢迎客人）',
                  en: 'fly to the cloud tops and pick a Silkberry off the old beams (spiders do not welcome guests)' } },
        { id: 'q7', cn: '温室的银丝网', en: 'The silver mesh in the greenhouse', done: false,
          hint: { cn: '去星坠堡的果实温室（地窖），找那张银丝隔层',
                  en: "go to Starfall's fruit greenhouse (the cellar) and find the silver divider" } }
      ];
      // which epithet the valley has already been heard using. This is read off
      // the quest list, so it has to be taken after the quests exist.
      this.epithetSeen = this.epithet();
      this.progressStart = 0;
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
      const counts = { owl: 6, pangolin: 4, deer: 6, jelly: 8, frog: 12, spider: 5, bear: 2 };
      for (const sp of N.CREATURES) {
        const n = counts[sp.id] || 0;
        for (let i = 0; i < n; i++) {
          const p = this.samplePos(sp.habitat[0]);
          if (!p) continue;
          const c = new N.Creature(sp, p.x, p.y, p.z);
          if (c.isFlyer()) c.flyY = p.y + 5 + Math.random() * 8;
          this.creatures.push(c);
        }
      }
    }
    samplePos(zoneId) {
      const z = N.ZONE_BY_ID[zoneId] || N.ZONE_BY_ID.whisperwood;
      const W = this.world;
      for (let t = 0; t < 300; t++) {
        let x, zz;
        if (z.kind === 'circle') {
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
        const gy = N.groundY(W, Math.floor(x), Math.floor(zz), W.h - 1);
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
      // the Grey Veil
      const W = this.world, p = this.player;
      const edge = Math.min(p.x, p.z, W.w - p.x, W.d - p.z);
      if (edge < 22) { fogDen += (22 - edge) * 0.004; fogCol = mix(fogCol, [0.55, 0.57, 0.62], (22 - edge) / 22 * 0.8); }
      if (p.headWater) { fogCol = mix(fogCol, [0.06, 0.24, 0.32], 0.85); fogDen = 0.14; }
      this.env = {
        time: this.time, day: this.daylight, night: this.night,
        fogCol, fogDen, zenith, horizon, ground: mix(horizon, [0.25, 0.22, 0.2], 0.5),
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

    /* ------------------------- backpack / storage ------------------------- */
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
    decayItems(dt) {
      const decay = (items, rate) => {
        for (let i = items.length - 1; i >= 0; i--) {
          const it = items[i];
          if (it.kind === 'pit' || it.kind === 'plant') continue;
          it.fresh -= dt * rate;
          if (it.fresh <= 0) {
            it.kind = 'pit';
            this.logMsg(N.t('log.dormant', { n: itemName(it.id) }), 'warn');
          }
        }
      };
      decay(this.inv, 1);
      for (const s of this.stashes) decay(s.items, s.decay);
    }

    /* ------------------------- interaction ------------------------- */
    rayTarget() {
      const p = this.player;
      const cp = Math.cos(p.pitch), sp = Math.sin(p.pitch);
      const dx = Math.sin(p.yaw) * cp, dy = sp, dz = -Math.cos(p.yaw) * cp;
      return this.world.raycast(p.x, p.eyePos(), p.z, dx, dy, dz, 5.5);
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
      if (b === 78) { this.openStashUI(this.stashes[0]); return; }
      if (b === 80) { this.logMsg(N.t('log.trap'), 'warn'); return; }
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
      // magic stomach: eating several in quick succession causes confusion
      this.gastric = (this.gastric || 0) + 1;
      if (this.gastricTime === undefined || this.time - this.gastricTime > 90) { this.gastric = 1; }
      this.gastricTime = this.time;
      if (this.gastric >= 3) {
        this.gastric = 0;
        this.logMsg(N.t('log.churn'), 'bad');
        this.particleBurst(p.x, p.y + 1, p.z, [0.9, 0.4, 0.9], 26);
        this.damage(0.8, N.t('log.causeOverload'));
        this.inv.splice(slotIdx, 1);
        return;
      }
      if (p.form) this.logMsg(N.t('log.overwrite', { a: N.disp(FRU[p.form].form), b: N.disp(f.form) }), 'warn');
      p.form = fruitId;
      p.formT = f.duration; p.formMax = f.duration;
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
      this.setBlock(bx, by, bz, 6);
      this.growQueue.push({ x: bx, y: by, z: bz, t: 120, fruit: it.id });
      this.inv.splice(slotIdx, 1);
      this.logMsg(N.t('log.plantPit', { n: itemName(it.id) }), 'good');
    }
    buildCellarTree() {
      const p = this.player;
      if (this.stashes.length - 1 >= STO.treestash.max) { this.logMsg(N.t('log.treeCap', { n: STO.treestash.max }), 'warn'); return; }
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
      for (let y = 1; y <= 4; y++) this.setBlock(bx, by + y, bz, 79);
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++)
        for (let dy = 4; dy <= 6; dy++)
          if (dx * dx + dz * dz + (dy - 5) * (dy - 5) < 7 && !(dx === 0 && dz === 0 && dy < 4)) this.setBlock(bx + dx, by + dy, bz + dz, 27);
      this.setBlock(bx, by, bz, 77);
      const id = 'tree' + (this.stashes.length);
      this.stashes.push({ id, kind: 'tree', slots: STO.treestash.slots, decay: STO.treestash.decay, items: [], x: bx, y: by, z: bz, owner: this.id });
      this.logMsg(N.t('log.treeBuilt', { s: STO.treestash.slots }), 'good');
    }

    /* ------------------------- storage UI ------------------------- */
    openStashUI(s) {
      this.openStash = s; this.mode = 'cellar';
      this.logMsg(N.t('log.openStore', { n: storeName(s), d: s.decay }), 'good');
      if (this.ui) this.ui.showCellar(true);
    }
    closeStashUI() { this.mode = 'play'; this.openStash = null; if (this.ui) this.ui.showCellar(false); }
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
    owlUnlocked() { return this.stashes[0].items.some(i => i.id === 'owlberry') || this._owlUnlocked; }
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
        po.it.fresh -= dt * STO.cellar.decay;      // decays in flight at the main cellar's rate
        if (po.t > 0) continue;
        this.posts.splice(i, 1);
        const name = itemName(po.it.id);
        if (Math.random() < 0.10) {
          this.logMsg(N.t('log.postLost', { n: name }), 'bad');
          this.stats.postLost = (this.stats.postLost || 0) + 1;
        } else if (this.used(this.stashes[0].items) + this.slotOf(po.it) > this.stashes[0].slots) {
          this.logMsg(N.t('log.postFull', { n: name }), 'warn');
          const back = this.stashes.find(s => s.id === po.from);
          (back || this.stashes[0]).items.push(po.it);
        } else {
          this.stashes[0].items.push(po.it);
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
    onVeil(p) {
      this.veilWarn = (this.veilWarn || 0) + 1;
      if (this.veilWarn % 40 === 1) this.logMsg(N.t('log.veil'), 'warn');
      // no form walks the fog any more: the veil is a border, not a place
      p.vital -= 0.004;
    }
    die(cause) {
      const p = this.player;
      this.stats.deaths++;
      this.logMsg(N.t('log.died', { z: this.zoneName(), c: cause }), 'bad');
      // fruit scatters
      const sx = Math.floor(p.x), sy = Math.floor(p.y), sz = Math.floor(p.z);
      for (const it of this.inv) this.drops.push({ x: sx + (Math.random() * 3 - 1.5), y: sy + 1, z: sz + (Math.random() * 3 - 1.5), item: it, t: 600 });
      this.inv = [];
      p.vital = 5; p.air = 18; p.fright = 0; p.form = null; p.formT = 0;
      const s = this.stashes[0];
      p.x = s.x + 2; p.y = s.y + 1; p.z = s.z + 2; p.vx = p.vy = p.vz = 0;
      this.mode = 'dead';
      if (this.ui) this.ui.showDead(true);
    }

    /* ------------------------- per-game-day rolls ------------------------- */
    /* docs/en/05: a cellar tree is a living store -- it attracts thieves. The main cellar is guarded by Old Mei and is never robbed. */
    dailyRolls() {
      // stashes[0] is the town cellar and is deliberately skipped: the docs state
      // theft as a rule of field storage (05, cellar-tree table), not of the town.
      for (let i = 1; i < this.stashes.length; i++) {
        const s = this.stashes[i];
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
      const nFruit = id => this.inv.filter(i => i.kind === 'fruit' && i.id === id).length;
      const nStash = id => this.stashes.reduce((a, s) => a + s.items.filter(i => i.id === id).length, 0);
      // backpack upgrades: cap() changes the moment one is granted, and it is announced once
      const grant = (uid) => {
        if (this.upg[uid]) return;
        const u = STO.backpack.upgrades.find(x => x.id === uid);
        if (!u) return;
        this.upg[uid] = true;
        this.logMsg(N.t('log.upgrade', { n: N.disp(u), e: u.slots ? N.t('log.upgSlots', { n: u.slots }) : N.t('log.upgRare'), d: N.descOf(u) }), 'good');
      };
      if (this.stashes[0].items.length > 0) { done(q('q1')); grant('pouch1'); }
      if (nFruit('owlberry') + nStash('owlberry') >= 3) done(q('q2'));
      if (p.form === 'owlberry' && p.y > 30) done(q('q3'), N.t('log.q3msg'));
      if (nFruit('frogpear') + nStash('frogpear') >= 1) { done(q('q4')); grant('pouch2'); }
      if (nFruit('stagcap') + nStash('stagcap') >= 1) done(q('q5'));
      if (nFruit('silkberry') + nStash('silkberry') >= 1) done(q('q6'));
      // q7: walk to the Starfall fruit greenhouse (cellar door)
      const gh = N.POIS.find(x => x.id === 'greenhouse');
      if (gh && Math.hypot(p.x - gh.x, p.z - gh.z) < 6 && p.y > gh.y - 6 && p.y < gh.y + 10) { done(q('q7'), N.t('log.q7msg')); grant('divider'); }
      this.checkEpithet();
    }
    zoneName() {
      const p = this.player;
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
      if (this.player.y > 28 && (!best || best.kind !== 'sky')) {
        const d = Math.min(...N.SKY_ISLES.map(i => Math.hypot(i.x - this.player.x, i.z - this.player.z)));
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
    ensureHand(id) {
      if (!this.handMeshes[id]) this.handMeshes[id] = N.buildHandMesh(this.R.gl, id);
      return this.handMeshes[id];
    }

    /* ------------------------- main loop ------------------------- */
    update(dt) {
      if (!this.ready) return;
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

      // creatures
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
          for (let y = 1; y <= 4; y++) this.setBlock(g.x, g.y + y, g.z, 6);
          for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = 4; dy <= 6; dy++)
            if (dx * dx + dz * dz + (dy - 5) * (dy - 5) < 6) this.setBlock(g.x + dx, g.y + dy, g.z + dz, 7);
          const fb = N.FRUIT_BLOCK_REV[g.fruit];
          if (fb) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1]]) if (this.world.get(g.x + dx, g.y + 5, g.z + dz) === 7) this.setBlock(g.x + dx, g.y + 5, g.z + dz, fb);
          this.growQueue.splice(i, 1);
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
            this.hover = t;
            if (N.FRUIT_BLOCK[b]) this.prompt = N.t('log.promptPickFruit', { n: N.disp(FRU[N.FRUIT_BLOCK[b]]) });
            else if (N.PLANT_BLOCK[b]) this.prompt = N.t('log.promptPickPlant', { n: N.disp(PLANT[N.PLANT_BLOCK[b]]) });
            else if (b === 78) this.prompt = N.t('log.promptCellar');
          } else this.hover = null;
        } else this.hover = null;
      }
      this.checkQuests();
    }

    ambient(dt) {
      const p = this.player, P = this.particles;
      if (!this.ambTimer) this.ambTimer = 0;
      this.ambTimer -= dt;
      if (this.ambTimer > 0) return;
      this.ambTimer = 0.12;
      const n = this.night;
      // fireflies (forest at night)
      if (n > 0.4 && Math.random() < 0.7) {
        const a = Math.random() * 6.283, r = 4 + Math.random() * 14;
        const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
        const y = N.groundY(this.world, Math.floor(x), Math.floor(z), Math.floor(p.y + 6)) + 0.6;
        P.spawn(x, y, z, (Math.random() - 0.5) * 0.6, 0.2 + Math.random() * 0.3, (Math.random() - 0.5) * 0.6, 3 + Math.random() * 3, [0.7, 1, 0.45], 0.16);
      }
      // jellyfish / underwater bubbles
      if (p.headWater && Math.random() < 0.6) {
        const a = Math.random() * 6.283, r = 1 + Math.random() * 6;
        P.spawn(p.x + Math.cos(a) * r, p.y + Math.random() * 2, p.z + Math.sin(a) * r, 0, 0.8 + Math.random(), 0, 2.5, [0.5, 0.85, 1], 0.14);
      }
      // dust and silk drifting off the old beams on the highest isle
      const beams = N.POIS.find(q => q.id === 'beams');
      if (Math.hypot(beams.x - p.x, beams.z - p.z) < 40 && Math.random() < 0.8) {
        P.spawn(beams.x + (Math.random() - 0.5) * 10, beams.y + 1, beams.z + (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 0.4, 0.3 + Math.random() * 0.6, (Math.random() - 0.5) * 0.4, 2 + Math.random() * 2, [0.85, 0.85, 0.75], 0.16);
      }
      // player form glow
      const g = p.formDef.glow;
      if (g && Math.random() < 0.5) P.spawn(p.x + (Math.random() - 0.5), p.y + 0.5 + Math.random(), p.z + (Math.random() - 0.5), 0, 0.4, 0, 1.2, g, 0.18);
    }

    /* ------------------------- camera -------------------------
       You are both the actor and the subject of the shot, so the lens never
       cuts. Pressing V pushes it out instead of switching views, changing
       form widens it gradually, and terrain pulls it in. Every value is eased
       as a rate-per-second (N.ease), so the shot feels identical at 30 or 144 fps. */
    shootCamera(p) {
      const dt = this.dt || 0.016;
      const cam = this.cam, h = p.size()[1];
      const dWant = this.thirdPerson ? 1.5 + 2.25 * h : 0;      // the subject holds roughly the same frame share
      const fovWant = p.fov() + (this.thirdPerson ? 8 : 0);
      if (!this.camReady) {
        cam.yaw = p.yaw; cam.pitch = p.pitch; cam.d = dWant; cam.fov = fovWant;
        this.camReady = true;
      }
      cam.d += (dWant - cam.d) * N.ease(5.5, dt);
      cam.fov += (fovWant - cam.fov) * N.ease(3.5, dt);
      // first person tracks the mouse exactly; the watching camera trails it
      if (this.thirdPerson) {
        cam.yaw += N.angleDelta(cam.yaw, p.yaw) * N.ease(9, dt);
        cam.pitch += (p.pitch - cam.pitch) * N.ease(9, dt);
      } else { cam.yaw = p.yaw; cam.pitch = p.pitch; }

      const eyeY = this.thirdPerson ? p.y + h * 0.68 : p.eyePos();
      const cp = Math.cos(cam.pitch);
      const ox = -Math.sin(cam.yaw) * cp, oz = Math.cos(cam.yaw) * cp, oy = -Math.sin(cam.pitch);
      let d = cam.d;
      // never let terrain stand between the subject and the lens
      for (let s = 0.7; d > 1 && s < d; s += 0.35) {
        if (this.world.solidAt(Math.floor(p.x + ox * s), Math.floor(eyeY + oy * s), Math.floor(p.z + oz * s))) {
          d = Math.max(0.7, s - 0.35); break;
        }
      }
      return { x: p.x + ox * d, y: eyeY + oy * d, z: p.z + oz * d, yaw: cam.yaw, pitch: cam.pitch, fov: cam.fov };
    }

    /* ------------------------- render ------------------------- */
    render() {
      const R = this.R, p = this.player, env = this.env;
      const cam = this.shootCamera(p);
      R.begin(cam, env);

      const IDENT = N.M4.create();
      // world
      const W = this.world;
      for (let cz = 0; cz < W.cz; cz++) for (let cx = 0; cx < W.cx; cx++) {
        const ci = cz * W.cx + cx;
        const m = W.chunks[ci];
        if (!m) continue;
        const mx = cx * W.cs + 8, mz = cz * W.cs + 8;
        if (!R.visible(mx, W.h / 2, mz, 15)) continue;
        R.drawMesh(m[0], IDENT, {});
        R.drawMesh(m[1], IDENT, { emisBoost: 0.15 });
        R.drawMesh(m[3], IDENT, {});
        R.drawMesh(m[4], IDENT, { emisBoost: 0.2 });
      }
      // highlight (wireframe, not a solid cube)
      if (this.hover && this.mode === 'play') {
        const mb = new N.MeshBuilder();
        const t = this.hover, e = 0.05, h = e / 2, L = 1 + e, S = 1 - e;
        const c = [1, 0.92, 0.62];
        for (const a of [0, 1]) for (const b of [0, 1]) {
          mb.box(t.x - h, t.y + a - h, t.z + b - h, L, e, e, c, true, 1);   // along X (includes the corners)
          mb.box(t.x + a - h, t.y + h, t.z + b - h, e, S, e, c, true, 1);   // along Y (inset, so edges never overlap)
          mb.box(t.x + a - h, t.y + b - h, t.z + h, e, e, S, c, true, 1);   // along Z (inset)
        }
        if (!this._hl || this._hlAt !== (t.x * 10000 + t.y * 100 + t.z)) {
          if (this._hl) { R.gl.deleteBuffer(this._hl.pos); R.gl.deleteBuffer(this._hl.col); R.gl.deleteBuffer(this._hl.dat); }
          this._hl = mb.upload(R.gl); this._hlAt = t.x * 10000 + t.y * 100 + t.z;
        }
        R.drawMesh(this._hl, IDENT, { noCull: true });
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
          R.drawMesh(this._dropMesh, m, { tint: col, tintA: 1, emisBoost: 0.5, day: Math.max(0.6, this.daylight) });
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
        const ry = N.M4.create(); N.M4.rotY(ry, c.yaw + Math.PI);
        N.M4.mul(base, base, ry);
        const sm = N.M4.create(); N.M4.scale(sm, sc, sc, sc);
        N.M4.mul(base, base, sm);
        const st = { t: this.time + c.phase, move: Math.min(1, c.speed / (c.sp.speed || 3)) * (c.speed > 0.2 ? 1 : 0), fly: c.isFlyer() && c.state !== 'roost', phase: c.phase, gait: c.sp.id === 'spider' ? 9 : 7 };
        for (const e of parts) {
          const m = N.partMatrix(N.M4.create(), base, e, st);
          R.drawMesh(e.mesh, m, {});
        }
      }
      // water
      for (let cz = 0; cz < W.cz; cz++) for (let cx = 0; cx < W.cx; cx++) {
        const ci = cz * W.cx + cx;
        const m = W.chunks[ci];
        if (!m || !m[2]) continue;
        const mx = cx * W.cs + 8, mz = cz * W.cs + 8;
        if (!R.visible(mx, W.h / 2, mz, 15)) continue;
        R.drawMesh(m[2], IDENT, { blend: true, alpha: 0.62, wave: true });
      }
      // particles
      this.particles.draw(R);
      // first-person hand
      if (!this.thirdPerson && this.mode !== 'dead') {
        const hand = this.ensureHand(p.formDef.hand || 'hand');
        const m = N.M4.create();
        const fwd = [Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch)];
        const right = [Math.cos(p.yaw), 0, Math.sin(p.yaw)];
        const swing = Math.sin(p.bob * 2) * 0.05 * (p.moveAmt > 0.01 ? 1 : 0);
        N.M4.trans(m, cam.x + fwd[0] * 0.58 + right[0] * 0.30, cam.y + fwd[1] * 0.58 + right[1] * 0.30 - 0.36 + swing, cam.z + fwd[2] * 0.58 + right[2] * 0.30 - 0.02);
        const ry = N.M4.create(); N.M4.rotY(ry, p.yaw + Math.PI);
        N.M4.mul(m, m, ry);
        const sc = 0.24;
        const sm = N.M4.create(); N.M4.scale(sm, sc, sc, sc);
        N.M4.mul(m, m, sm);
        R.gl.disable(R.gl.DEPTH_TEST);
        R.drawMesh(hand, m, { day: Math.max(0.55, this.daylight) });
        R.gl.enable(R.gl.DEPTH_TEST);
      }
      // third-person body
      if (this.thirdPerson) {
        const parts = this.ensureModel(p.modelId);
        const md = N.MODELS[p.modelId];
        const sc = md.scale;
        const base = N.M4.create();
        N.M4.trans(base, p.x, p.y, p.z);
        const ry = N.M4.create(); N.M4.rotY(ry, p.faceYaw + Math.PI);
        N.M4.mul(base, base, ry);
        if (Math.abs(p.bank) > 0.002) {          // lean into the turn, like a filmed one
          const rz = N.M4.create(); N.M4.rotZ(rz, p.bank);
          N.M4.mul(base, base, rz);
        }
        const sm = N.M4.create(); N.M4.scale(sm, sc, sc, sc);
        N.M4.mul(base, base, sm);
        const st = { t: this.time, move: Math.min(1, Math.hypot(p.vx, p.vz) / 5), fly: !!p.formDef.fly && !p.grounded, phase: 0, gait: 7 };
        for (const e of parts) R.drawMesh(e.mesh, N.partMatrix(N.M4.create(), base, e, st), {});
      }
    }

    /* ------------------------- identity (docs/en/03 section 6) ------------------------- */
    // the valley's name for you: the last earned epithet wins
    epithet() {
      const met = id => id === 'all' ? this.quests.every(q => q.done)
                                     : !!(this.quests.find(q => q.id === id) || {}).done;
      let cur = IDEN.epithetDefault;
      for (const e of IDEN.epithets) if (met(e.quest)) cur = e;
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
    hasTrait(t) { return !!this.traits[t]; }
    // announce a change of epithet once, when the valley starts using it.
    // The comparison is on the record itself, not on its text: switching
    // language mid-session must not read as the valley having renamed you.
    checkEpithet() {
      const e = this.epithet();
      if (e !== this.epithetSeen) { this.epithetSeen = e; this.logMsg(N.t('log.epithet', { e: N.disp(e) }), 'good'); }
    }

    /* ------------------------- save ------------------------- */
    save() {
      try {
        const s = {
          id: this.id, name: this.name, traits: this.traits,
          time: this.time, day: this.day, seed: this.seed,
          p: { x: this.player.x, y: this.player.y, z: this.player.z, yaw: this.player.yaw, pitch: this.player.pitch, vital: this.player.vital, form: this.player.form, formT: this.player.formT },
          inv: this.inv, stashes: this.stashes.map(s2 => ({ id: s2.id, slots: s2.slots, decay: s2.decay, items: s2.items, x: s2.x, y: s2.y, z: s2.z, kind: s2.kind, owner: s2.owner })),
          diffs: this.diffs, seen: this.seen, dex: this.dexFruit, regrow: this.regrow, posts: this.posts, owl: this._owlUnlocked || false,
          quests: this.quests.map(q => [q.id, q.done]), stats: this.stats, upg: this.upg
        };
        localStorage.setItem(SAVE_KEY, JSON.stringify(s));
        this.logMsg(N.t('log.saved'), 'good');
      } catch (e) { this.logMsg(N.t('log.saveFail', { m: e.message }), 'bad'); }
    }
    load() {
      let s;
      try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { s = null; }
      if (!s) return false;
      // identity: keep the saved id (the world's memory is keyed on it), never a name we invented
      this.id = s.id || this.id; this.name = s.name || '';
      Object.assign(this.traits, s.traits || {});
      this.epithetSeen = this.epithet();
      this.time = s.time; this.day = s.day;
      this.inv = s.inv || []; this.stashes = s.stashes;
      this.seen = s.seen || {}; this.dexFruit = s.dex || {}; this.stats = s.stats || this.stats;
      for (const d of s.diffs) this.world.set(d[0], d[1], d[2], d[3]);
      this.diffs = s.diffs;
      this.regrow = s.regrow || [];
      this.posts = s.posts || []; this._owlUnlocked = !!s.owl;
      Object.assign(this.player, { x: s.p.x, y: s.p.y, z: s.p.z, yaw: s.p.yaw, pitch: s.p.pitch, vital: s.p.vital, form: s.p.form, formT: s.p.formT });
      for (const q of s.quests || []) { const qq = this.quests.find(x => x.id === q[0]); if (qq) qq.done = q[1]; }
      Object.assign(this.upg, s.upg || {});
      for (let i = 0; i < this.world.cx * this.world.cz; i++) this.world.buildChunk(this.R.gl, i);
      this.meshDone = this.meshTotal; this.ready = true;
      this.logMsg(N.t('log.loaded'), 'good');
      return true;
    }
  }

  N.Game = Game;
  N.DAY_LEN = DAY_LEN;

})(window.FRUTARIA = window.FRUTARIA || {});
