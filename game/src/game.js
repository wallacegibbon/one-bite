/* ==========================================================================
 *  game.js —— 游戏状态：时间/昼夜、果实背包、仓库、变形、任务、交互
 * ========================================================================== */
(function (N) {
  const RAR = N.RARITY, FRU = N.FRUIT_BY_ID, PLANT = N.PLANT_BY_ID, STO = N.STORAGE;

  const DAY_LEN = 420;          // 一个游戏日 = 7 分钟真实时间
  const SAVE_KEY = 'frutaria.save.v1';

  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.R = new N.Renderer(canvas);
      this.world = new N.World(N.WORLD.w, N.WORLD.h, N.WORLD.d);
      this.player = new N.Player(this.world);
      this.creatures = [];
      this.particles = null;
      this.time = DAY_LEN * (7 / 24);      // 从早上 7 点开始
      this.day = 1;
      this.log = [];
      this.inv = [];                       // 背包
      this.stashes = [];                   // 仓库（第一个是主果窖）
      this.growQueue = [];                 // 种植生长
      this.regrow = [];                    // 果实重生
      this.posts = [];                     // 猫头鹰邮递在途
      this.diffs = [];                     // 方块改动（存档用）
      this.seen = {};                      // 图鉴
      this.dexFruit = {};
      this.quests = [];
      this.mode = 'play';                  // play | cellar | journal | dead
      this.openStash = null;
      this.hover = null;                   // 射线指向的方块
      this.msgTimer = 0;
      this.prompt = '';
      this.thirdPerson = false;
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

    /* ------------------------- 初始化 ------------------------- */
    init(seed) {
      this.seed = seed || 20261008;
      const t0 = performance.now();
      N.generate(this.world, this.seed);
      this.particles = new N.Particles(this.R.gl, 900);
      // 仓库
      this.stashes.push({ id: 'cellar', cn: STO.cellar.label, slots: STO.cellar.slots, decay: STO.cellar.decay, items: [], x: 136, y: 21, z: 134, kind: 'cellar' });
      // 出生
      const sp = N.spawn;
      this.player.x = sp.x; this.player.y = sp.y; this.player.z = sp.z;
      this.player.yaw = Math.PI; this.player.pitch = -0.1;
      // 生物
      this.spawnCreatures();
      // 任务
      this.quests = [
        { id: 'q1', cn: '认识主果窖', hint: '去灯笼镇的果窖（按 E 打开），把任意果实存进去', done: false },
        { id: 'q2', cn: '三颗猫头鹰果', hint: '低语林的橡树洞里找 3 颗猫头鹰果', done: false },
        { id: 'q3', cn: '夜之翼', hint: '夜里吃下猫头鹰果，飞到 30 米以上', done: false },
        { id: 'q4', cn: '镜湖的门票', hint: '找水獭果 → 下水 → 在沉塔取人鱼梨', done: false },
        { id: 'q5', cn: '圣林的通行证', hint: '变成独角兽走进圣林，摘一颗银角樱', done: false },
        { id: 'q6', cn: '云顶的焰心', hint: '飞到云顶龙巢，取一颗焰心果（小心龙）', done: false },
        { id: 'q7', cn: '温室的银丝网', hint: '去星坠堡的果实温室（地窖），找那张银丝隔层', done: false }
      ];
      this.progressStart = 0;
      this.meshTotal = this.world.cx * this.world.cz;
      this.meshDone = 0;
      this.logMsg('欢迎来到果灵谷。按 H 看操作，按 J 看图鉴。', 'good');
      return this;
    }

    /* 渐进网格化（加载时调用） */
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
      const counts = { owl: 6, bat: 8, moth: 10, otter: 5, fox: 4, deer: 6, jelly: 8, merfolk: 5, unicorn: 4, spider: 4, bear: 2, dragon: 2, phoenix: 1, veilbeast: 4 };
      for (const sp of N.CREATURES) {
        const n = counts[sp.id] || 0;
        for (let i = 0; i < n; i++) {
          const p = this.samplePos(sp.habitat[0]);
          if (!p) continue;
          const c = new N.Creature(sp, p.x, p.y, p.z);
          if (c.isFlyer()) c.flyY = p.y + (sp.id === 'dragon' || sp.id === 'phoenix' ? 0 : 5 + Math.random() * 8);
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

    /* ------------------------- 时间 / 环境 ------------------------- */
    get hour() { return (this.time / DAY_LEN * 24) % 24; }
    updateEnv() {
      const h = this.hour;
      const ang = (h / 24) * Math.PI * 2 - Math.PI / 2;
      const el = Math.sin(ang);                       // 太阳高度
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
      // 灰雾墙
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

    /* ------------------------- 日志 ------------------------- */
    logMsg(text, kind) {
      this.log.push({ text, kind: kind || '', t: 0 });
      if (this.log.length > 40) this.log.shift();
      if (this.ui) this.ui.onLog();
    }

    /* ------------------------- 背包 / 仓库 ------------------------- */
    /* 背包容量 = 基础 24 + 已获得的果袋；银丝隔层让稀有及以上果实占用 −1 */
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
      if (!this.canFit(this.inv, it)) { this.logMsg('背包满了（' + this.used() + '/' + this.cap() + ' 果格）——先回果窖。', 'bad'); return false; }
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
            this.logMsg(d2cn(it.id) + ' 失活了，只剩一颗果核——种下去也许还能结果。', 'warn');
          }
        }
      };
      decay(this.inv, 1);
      for (const s of this.stashes) decay(s.items, s.decay);
      function d2cn(id) { return (FRU[id] || PLANT[id] || { cn: id }).cn; }
    }

    /* ------------------------- 交互 ------------------------- */
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
      // 1. 仓库
      for (const s of this.stashes) {
        if (Math.hypot(s.x + 0.5 - p.x, s.y + 1 - p.y, s.z + 0.5 - p.z) < 3.2) { this.openStashUI(s); return; }
      }
      // 2. 生物
      const c = this.nearestCreature(4.5);
      if (c) { this.observe(c); return; }
      // 3. 方块
      const t = this.rayTarget();
      if (!t) return;
      const b = this.world.get(t.x, t.y, t.z);
      const bd = N.BLOCKS[b];
      if (!bd) return;
      if (N.FRUIT_BLOCK[b]) { this.harvest(t.x, t.y, t.z, b); return; }
      if (N.PLANT_BLOCK[b]) { this.harvest(t.x, t.y, t.z, b); return; }
      if (b === 78) { this.openStashUI(this.stashes[0]); return; }
      if (b === 80) { this.logMsg('那是灰手套的捕果夹。拆掉它需要熊或龙。', 'warn'); return; }
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
      this.logMsg('采下 ' + d.cn + '（' + RAR[d.rarity].cn + '，占 ' + RAR[d.rarity].slots + ' 果格）', 'good');
      if (fid) this.regrow.push({ x, y, z, b, t: RAR[d.rarity].regrow * DAY_LEN * (0.8 + Math.random() * 0.4) });
      if (this.quests) this.checkQuests();
    }
    setBlock(x, y, z, b) {
      this.world.set(x, y, z, b);
      this.diffs.push([x, y, z, b]);
    }

    /* 观察生物 → 图鉴 */
    observe(c) {
      const first = !this.seen[c.sp.id];
      this.seen[c.sp.id] = true;
      const att = c.attitudeTo(this.player.form);
      this.logMsg('观察：' + c.sp.cn + (first ? '（新）' : '') + ' — 它对你（' + (this.player.form ? FRU[this.player.form].form.cn : '人形') + '）的态度：' +
        ({ flee: '警惕逃开', hostile: '敌对', curious: '好奇', calm: '平静', ignore: '无视' }[att]), first ? 'good' : '');
      if (first && this.ui) this.ui.onLog();
    }

    /* ------------------------- 变形 ------------------------- */
    useSelected() {
      const p = this.player;
      const it = this.inv[this.sel || 0];
      if (!it) { this.logMsg('没有选中东西。滚轮/数字键选择，F 使用。', 'warn'); return; }
      if (it.kind === 'fruit') this.eat(it.id, this.sel);
      else if (it.kind === 'plant') this.usePlant(it, this.sel);
      else if (it.kind === 'pit') this.plantPit(it, this.sel);
    }
    eat(fruitId, slotIdx) {
      const f = FRU[fruitId];
      if (!f || !f.duration) { this.logMsg('这个不能吃。', 'warn'); return; }
      const p = this.player;
      // 魔力胃：短时间连吃 → 混乱
      this.gastric = (this.gastric || 0) + 1;
      if (this.gastricTime === undefined || this.time - this.gastricTime > 90) { this.gastric = 1; }
      this.gastricTime = this.time;
      if (this.gastric >= 3) {
        this.gastric = 0;
        this.logMsg('魔力胃翻搅——两种魔法在体内打架！', 'bad');
        this.particleBurst(p.x, p.y + 1, p.z, [0.9, 0.4, 0.9], 26);
        this.damage(0.8, '魔法过载');
        this.inv.splice(slotIdx, 1);
        return;
      }
      if (p.form) this.logMsg('（' + FRU[p.form].form.cn + ' 的形态被 ' + f.form.cn + ' 覆盖）', 'warn');
      p.form = fruitId;
      p.formT = f.duration; p.formMax = f.duration;
      this.inv.splice(slotIdx, 1);
      this.stats.eaten++;
      this.dexFruit[fruitId] = true;
      this.logMsg('吃下 ' + f.cn + '：变成 ' + f.form.cn + '。' + (f.side[0] ? '副作用：' + f.side[0] + '。' : ''), 'good');
      this.particleBurst(p.x, p.y + 1, p.z, N.RARITY[f.rarity].color, 40);
      this.ensureModel(f.creature);
      this.checkQuests();
    }
    revert(why) {
      const p = this.player;
      if (!p.form) return;
      const f = FRU[p.form];
      p.form = null; p.formT = 0;
      this.stats.reverted++;
      this.logMsg('复原为人形（' + (why || '时间到') + '）。' + (f.side[1] ? '余韵：' + f.side[1] + '。' : ''), '');
    }
    usePlant(it, slotIdx) {
      const p = this.player, pl = PLANT[it.id];
      if (pl.effect === 'plant') {
        // 种在地面
        const t = this.world;
        const bx = Math.floor(p.x), bz = Math.floor(p.z);
        const by = N.groundY(t, bx, bz, Math.floor(p.y + 3));
        if (by < 1) return;
        this.setBlock(bx, by, bz, N.PLANT_BLOCK_REV[it.id]);
        this.inv.splice(slotIdx, 1);
        this.logMsg('种下 ' + pl.cn + '：它会一直亮着，当作路标。', 'good');
        return;
      }
      if (pl.effect === 'build') { this.buildCellarTree(); this.inv.splice(slotIdx, 1); return; }
      const dur = pl.effect === 'light' ? 300 : pl.effect === 'jump' ? 90 : pl.effect === 'stealth' ? 120 : 90;
      this.buffs[pl.effect] = dur;
      this.inv.splice(slotIdx, 1);
      this.logMsg('吃下 ' + pl.cn + '：' + pl.desc, 'good');
    }
    plantPit(it, slotIdx) {
      const p = this.player;
      const bx = Math.floor(p.x), bz = Math.floor(p.z);
      const by = N.groundY(this.world, bx, bz, Math.floor(p.y + 3));
      if (by < 1) return;
      this.setBlock(bx, by, bz, 6);
      this.growQueue.push({ x: bx, y: by, z: bz, t: 120, fruit: it.id });
      this.inv.splice(slotIdx, 1);
      this.logMsg('种下果核。也许一百多年后，这里会有一棵结 ' + (FRU[it.id] || {}).cn + ' 的树。', 'good');
    }
    buildCellarTree() {
      const p = this.player;
      if (this.stashes.length - 1 >= STO.treestash.max) { this.logMsg('窖树最多 ' + STO.treestash.max + ' 棵——谷地记不住更多地方。', 'warn'); return; }
      const bx = Math.floor(p.x), bz = Math.floor(p.z);
      const by = N.groundY(this.world, bx, bz, Math.floor(p.y + 3));
      if (by < 1) return;
      for (let y = 1; y <= 4; y++) this.setBlock(bx, by + y, bz, 79);
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++)
        for (let dy = 4; dy <= 6; dy++)
          if (dx * dx + dz * dz + (dy - 5) * (dy - 5) < 7 && !(dx === 0 && dz === 0 && dy < 4)) this.setBlock(bx + dx, by + dy, bz + dz, 27);
      this.setBlock(bx, by, bz, 77);
      const id = 'tree' + (this.stashes.length);
      this.stashes.push({ id, cn: STO.treestash.label, slots: STO.treestash.slots, decay: STO.treestash.decay, items: [], x: bx, y: by, z: bz, kind: 'tree' });
      this.logMsg('窖树长成了：' + STO.treestash.slots + ' 果格，腐坏速度 1/3。獾会来偷，记得常回来看。', 'good');
    }

    /* ------------------------- 仓库 UI ------------------------- */
    openStashUI(s) {
      this.openStash = s; this.mode = 'cellar';
      this.logMsg('打开 ' + s.cn + '（存进去的果实腐坏速度 ×' + s.decay + '）', 'good');
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
      if (this.used(to) + this.slotOf(it) > capTo) { this.logMsg('那边放不下了。', 'bad'); return; }
      from.splice(idx, 1); to.push(it);
      if (this.quests) this.checkQuests();
    }

    /* ------------------------- 猫头鹰邮递（docs/05 §5.2） ------------------------- */
    /* 窖树 → 主果窖，一次 1 颗，3 游戏日送达，10% 丢失。
       前提：主果窖里存过至少 1 颗猫头鹰果（解锁"钟摆"）。 */
    owlUnlocked() { return this.stashes[0].items.some(i => i.id === 'owlberry') || this._owlUnlocked; }
    postItem() {
      const s = this.openStash;
      if (!s) return;
      if (s.kind !== 'tree') { this.logMsg('钟摆只肯从窖树叼东西——果窖里有老梅。', 'warn'); return; }
      if (!this.owlUnlocked()) { this.logMsg('主果窖里还没有猫头鹰果。先存一颗，钟摆才会来。', 'warn'); return; }
      if (this.posts.length >= 3) { this.logMsg('钟摆一次只能叼 3 颗。', 'warn'); return; }
      const it = s.items[this.stashSel || 0];
      if (!it) { this.logMsg('先选中一颗果实。', 'warn'); return; }
      s.items.splice(this.stashSel || 0, 1);
      this.stashSel = Math.max(0, (this.stashSel || 0) - 1);
      this.posts.push({ it, t: 3 * DAY_LEN, from: s.cn });
      this._owlUnlocked = true;
      this.logMsg('钟摆叼着 ' + (FRU[it.id] ? FRU[it.id].cn : it.id) + ' 飞走了。三天后到。', 'good');
      if (this.ui) this.ui.renderCellar();
    }
    updatePosts(dt) {
      for (let i = this.posts.length - 1; i >= 0; i--) {
        const po = this.posts[i];
        po.t -= dt;
        po.it.fresh -= dt * STO.cellar.decay;      // 路上按主果窖的腐坏率走
        if (po.t > 0) continue;
        this.posts.splice(i, 1);
        const name = FRU[po.it.id] ? FRU[po.it.id].cn : po.it.id;
        if (Math.random() < 0.10) {
          this.logMsg('钟摆没有回来。第四天它自己飞回来了，嘴里是空的——丢了 ' + name + '。', 'bad');
          this.stats.postLost = (this.stats.postLost || 0) + 1;
        } else if (this.used(this.stashes[0].items) + this.slotOf(po.it) > this.stashes[0].slots) {
          this.logMsg('钟摆来了，但主果窖放不下 ' + name + '，它给叼回去了。', 'warn');
          this.stashes.find(s => s.cn === po.from) ? this.stashes.find(s => s.cn === po.from).items.push(po.it) : this.stashes[0].items.push(po.it);
        } else {
          this.stashes[0].items.push(po.it);
          this.logMsg('钟摆把 ' + name + ' 送到了主果窖。', 'good');
          this.stats.postSent = (this.stats.postSent || 0) + 1;
        }
      }
    }

    /* ------------------------- 伤害 / 状态 ------------------------- */
    damage(a, cause) {
      const p = this.player;
      if (p.formDef.fireImmune && cause === '火焰') return;
      p.vital -= a;
      if (p.vital <= 0) this.die(cause);
    }
    onCreatureTouch(c, dt) {
      const p = this.player;
      p.fright = Math.min(1, p.fright + dt * 0.9);
      if (c.sp.id === 'dragon' || c.sp.id === 'phoenix') { if (!p.formDef.fireImmune) this.damage(dt * 1.1, '火焰'); }
      else this.damage(dt * 0.5, c.sp.cn);
      if (Math.random() < dt * 2) this.logMsg(c.sp.cn + ' 在追你！', 'bad');
    }
    onVeil(p) {
      this.veilWarn = (this.veilWarn || 0) + 1;
      if (this.veilWarn % 40 === 1) this.logMsg('灰雾墙。它不阻止你离开，它只是让你忘记为什么要回来。', 'warn');
      if (!p.formDef.veilWalk) p.vital -= 0.004;
    }
    die(cause) {
      const p = this.player;
      this.stats.deaths++;
      this.logMsg('你在' + this.zoneName() + '倒下（' + cause + '）。果实散落在原地。', 'bad');
      // 果实散落
      const sx = Math.floor(p.x), sy = Math.floor(p.y), sz = Math.floor(p.z);
      for (const it of this.inv) this.drops.push({ x: sx + (Math.random() * 3 - 1.5), y: sy + 1, z: sz + (Math.random() * 3 - 1.5), item: it, t: 600 });
      this.inv = [];
      p.vital = 5; p.air = 18; p.fright = 0; p.form = null; p.formT = 0;
      const s = this.stashes[0];
      p.x = s.x + 2; p.y = s.y + 1; p.z = s.z + 2; p.vx = p.vy = p.vz = 0;
      this.mode = 'dead';
      if (this.ui) this.ui.showDead(true);
    }

    /* ------------------------- 每游戏日判定 ------------------------- */
    /* docs/05：窖树是活的仓库——它会招贼。主果窖有老梅守着，不被抢。 */
    dailyRolls() {
      for (let i = 1; i < this.stashes.length; i++) {
        const s = this.stashes[i];
        if (!s.items.length) continue;
        if (Math.random() >= 0.30) continue;
        const near = Math.hypot(this.player.x - s.x, this.player.z - s.z) < 45;
        const who = Math.random() < 0.6 ? '獾' : '灰手套的人';
        const where = s.kind === 'tree' ? '你的窖树' : s.cn;
        if (near) {
          this.logMsg('夜里' + who + '摸到' + where + '，你把它赶走了。', 'good');
          this.stats.raidsScared = (this.stats.raidsScared || 0) + 1;
        } else {
          const n = Math.min(s.items.length, 1 + ((Math.random() * 3) | 0));
          const taken = [];
          for (let k = 0; k < n; k++) {
            const j = (Math.random() * s.items.length) | 0;
            const it = s.items.splice(j, 1)[0];
            taken.push(it ? (FRU[it.id] ? FRU[it.id].cn : it.id) : '?');
          }
          this.logMsg(who + '偷走了' + where + '里的 ' + taken.join('、') + '——下次回来也许就没了。', 'bad');
          this.stats.raidsLost = (this.stats.raidsLost || 0) + n;
        }
      }
    }

    /* ------------------------- 任务 ------------------------- */
    checkQuests() {
      const p = this.player;
      const q = (id) => this.quests.find(x => x.id === id);
      const done = (qq, msg) => { if (qq && !qq.done) { qq.done = true; this.logMsg('✔ 完成：' + qq.cn + (msg ? ' — ' + msg : ''), 'good'); } };
      const nFruit = id => this.inv.filter(i => i.kind === 'fruit' && i.id === id).length;
      const nStash = id => this.stashes.reduce((a, s) => a + s.items.filter(i => i.id === id).length, 0);
      // 背包扩容道具：获得后 cap() 立刻变化，并提示一次
      const grant = (uid) => {
        if (this.upg[uid]) return;
        const u = STO.backpack.upgrades.find(x => x.id === uid);
        if (!u) return;
        this.upg[uid] = true;
        this.logMsg('✚ 背包升级：' + u.cn + '（' + (u.slots ? '+' + u.slots + ' 果格' : '稀有果实占用 −1') + '）— ' + u.desc, 'good');
      };
      if (this.stashes[0].items.length > 0) { done(q('q1')); grant('pouch1'); }
      if (nFruit('owlberry') + nStash('owlberry') >= 3) done(q('q2'));
      if (p.form === 'owlberry' && p.y > 30) done(q('q3'), '夜风从翅膀下面穿过。');
      if (nFruit('merrow') + nStash('merrow') >= 1) { done(q('q4')); grant('pouch2'); }
      if (nFruit('unicorncherry') + nStash('unicorncherry') >= 1) done(q('q5'));
      if (nFruit('embercore') + nStash('embercore') >= 1) done(q('q6'));
      // q7：走到星坠堡果实温室（地窖门口）
      const gh = N.POIS.find(x => x.id === 'greenhouse');
      if (gh && Math.hypot(p.x - gh.x, p.z - gh.z) < 6 && p.y > gh.y - 6 && p.y < gh.y + 10) { done(q('q7'), '银丝网叠在果筐上，正好能隔开稀有果实。'); grant('divider'); }
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
        if (d < 26) return N.ZONE_BY_ID.cloudspire.cn;
      }
      return best ? best.cn : '荒野';
    }

    particleBurst(x, y, z, col, n) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.283, s = Math.random() * 3;
        this.particles.spawn(x, y + Math.random(), z, Math.cos(a) * s, Math.random() * 3, Math.sin(a) * s, 1.2 + Math.random(), col, 0.35);
      }
    }

    /* ------------------------- 模型缓存 ------------------------- */
    ensureModel(id) {
      if (!this.creatureMeshes[id]) this.creatureMeshes[id] = N.buildModelMeshes(this.R.gl, N.MODELS[id]);
      return this.creatureMeshes[id];
    }
    ensureHand(id) {
      if (!this.handMeshes[id]) this.handMeshes[id] = N.buildHandMesh(this.R.gl, id);
      return this.handMeshes[id];
    }

    /* ------------------------- 主循环 ------------------------- */
    update(dt) {
      if (!this.ready) return;
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

      // 形态计时
      const p = this.player;
      if (p.form) {
        let rate = 1;
        const f = FRU[p.form].form;
        if (f.breatheAir === false && !this.player.headWater) rate = 2;      // 离水虚弱
        if (p.fright > 0.3) rate += p.fright;                                 // 受惊掉时
        p.formT -= dt * rate;
        if (p.formT <= 0) this.revert();
      }
      // buff
      for (const k in this.buffs) { this.buffs[k] -= dt; if (this.buffs[k] <= 0) delete this.buffs[k]; }
      this.playerStealth = (this.buffs.stealth ? 0.3 : 1);

      // 生物
      for (const c of this.creatures) {
        const d = Math.hypot(c.x - p.x, c.z - p.z);
        if (d < 160) c.update(dt, p, this.world, this);
      }
      // 粒子（萤火虫 / 余烬 / 水花）
      this.ambient(dt);
      this.particles.update(dt, this.world);

      // 果实重生
      for (let i = this.regrow.length - 1; i >= 0; i--) {
        const r = this.regrow[i]; r.t -= dt;
        if (r.t <= 0) { if (!this.world.get(r.x, r.y, r.z)) this.setBlock(r.x, r.y, r.z, r.b); this.regrow.splice(i, 1); }
      }
      // 猫头鹰邮递
      if (this.posts.length) this.updatePosts(dt);
      // 种植生长
      for (let i = this.growQueue.length - 1; i >= 0; i--) {
        const g = this.growQueue[i]; g.t -= dt;
        if (g.t <= 0) {
          for (let y = 1; y <= 4; y++) this.setBlock(g.x, g.y + y, g.z, 6);
          for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = 4; dy <= 6; dy++)
            if (dx * dx + dz * dz + (dy - 5) * (dy - 5) < 6) this.setBlock(g.x + dx, g.y + dy, g.z + dz, 7);
          const fb = N.FRUIT_BLOCK_REV[g.fruit];
          if (fb) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1]]) if (this.world.get(g.x + dx, g.y + 5, g.z + dz) === 7) this.setBlock(g.x + dx, g.y + 5, g.z + dz, fb);
          this.growQueue.splice(i, 1);
          this.logMsg('你种下的果核长成了一棵小树。', 'good');
        }
      }
      // 散落果实拾取
      if (this.drops) {
        for (let i = this.drops.length - 1; i >= 0; i--) {
          const d = this.drops[i]; d.t -= dt;
          if (d.t <= 0) { this.drops.splice(i, 1); continue; }
          if (Math.hypot(d.x - p.x, d.y - p.y, d.z - p.z) < 1.6) {
            if (this.addItem(d.item.kind, d.item.id, d.item.fresh)) { this.drops.splice(i, 1); this.logMsg('捡回 ' + (FRU[d.item.id] || PLANT[d.item.id] || { cn: d.item.id }).cn, 'good'); }
          }
        }
      }
      this.decayItems(dt);

      // 交互提示
      this.prompt = '';
      if (playing) {
        for (const s of this.stashes) {
          if (Math.hypot(s.x + 0.5 - p.x, s.y + 1 - p.y, s.z + 0.5 - p.z) < 3.2) this.prompt = 'E — 打开 ' + s.cn;
        }
        if (!this.prompt) {
          const c = this.nearestCreature(4.5);
          if (c) this.prompt = 'E — 观察 ' + c.sp.cn;
        }
        if (!this.prompt) {
          const t = this.rayTarget();
          if (t) {
            const b = this.world.get(t.x, t.y, t.z);
            this.hover = t;
            if (N.FRUIT_BLOCK[b]) this.prompt = 'E — 采摘 ' + FRU[N.FRUIT_BLOCK[b]].cn;
            else if (N.PLANT_BLOCK[b]) this.prompt = 'E — 采集 ' + PLANT[N.PLANT_BLOCK[b]].cn;
            else if (b === 78) this.prompt = 'E — 主果窖';
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
      // 萤火虫（夜里森林）
      if (n > 0.4 && Math.random() < 0.7) {
        const a = Math.random() * 6.283, r = 4 + Math.random() * 14;
        const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
        const y = N.groundY(this.world, Math.floor(x), Math.floor(z), Math.floor(p.y + 6)) + 0.6;
        P.spawn(x, y, z, (Math.random() - 0.5) * 0.6, 0.2 + Math.random() * 0.3, (Math.random() - 0.5) * 0.6, 3 + Math.random() * 3, [0.7, 1, 0.45], 0.16);
      }
      // 水母/水下气泡
      if (p.headWater && Math.random() < 0.6) {
        const a = Math.random() * 6.283, r = 1 + Math.random() * 6;
        P.spawn(p.x + Math.cos(a) * r, p.y + Math.random() * 2, p.z + Math.sin(a) * r, 0, 0.8 + Math.random(), 0, 2.5, [0.5, 0.85, 1], 0.14);
      }
      // 龙巢余烬
      const nest = N.POIS.find(q => q.id === 'nest');
      if (Math.hypot(nest.x - p.x, nest.z - p.z) < 40 && Math.random() < 0.8) {
        P.spawn(nest.x + (Math.random() - 0.5) * 10, nest.y + 1, nest.z + (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 0.4, 0.8 + Math.random() * 1.2, (Math.random() - 0.5) * 0.4, 2 + Math.random() * 2, [1, 0.5, 0.15], 0.2);
      }
      // 玩家形态发光
      const g = p.formDef.glow;
      if (g && Math.random() < 0.5) P.spawn(p.x + (Math.random() - 0.5), p.y + 0.5 + Math.random(), p.z + (Math.random() - 0.5), 0, 0.4, 0, 1.2, g, 0.18);
    }

    /* ------------------------- 渲染 ------------------------- */
    render() {
      const R = this.R, p = this.player, env = this.env;
      const cam = {
        x: p.x, y: p.eyePos(), z: p.z,
        yaw: p.yaw, pitch: p.pitch, fov: p.fov()
      };
      if (this.thirdPerson) {
        const d = 4.2;
        cam.x = p.x - Math.sin(p.yaw) * Math.cos(p.pitch) * d;
        cam.y = p.y + p.size()[1] * 0.7 - Math.sin(p.pitch) * d;
        cam.z = p.z + Math.cos(p.yaw) * Math.cos(p.pitch) * d;
        cam.fov = p.fov() + 6;
      }
      R.begin(cam, env);

      const IDENT = N.M4.create();
      // 世界
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
      // 高亮（线框，不是实心块）
      if (this.hover && this.mode === 'play') {
        const mb = new N.MeshBuilder();
        const t = this.hover, e = 0.05, h = e / 2, L = 1 + e, S = 1 - e;
        const c = [1, 0.92, 0.62];
        for (const a of [0, 1]) for (const b of [0, 1]) {
          mb.box(t.x - h, t.y + a - h, t.z + b - h, L, e, e, c, true, 1);   // 沿 X（含角）
          mb.box(t.x + a - h, t.y + h, t.z + b - h, e, S, e, c, true, 1);   // 沿 Y（缩进，不重叠）
          mb.box(t.x + a - h, t.y + b - h, t.z + h, e, e, S, c, true, 1);   // 沿 Z（缩进）
        }
        if (!this._hl || this._hlAt !== (t.x * 10000 + t.y * 100 + t.z)) {
          if (this._hl) { R.gl.deleteBuffer(this._hl.pos); R.gl.deleteBuffer(this._hl.col); R.gl.deleteBuffer(this._hl.dat); }
          this._hl = mb.upload(R.gl); this._hlAt = t.x * 10000 + t.y * 100 + t.z;
        }
        R.drawMesh(this._hl, IDENT, { noCull: true });
      }
      // 散落果实（死亡掉落，可捡回）
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
      // 生物
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
      // 水
      for (let cz = 0; cz < W.cz; cz++) for (let cx = 0; cx < W.cx; cx++) {
        const ci = cz * W.cx + cx;
        const m = W.chunks[ci];
        if (!m || !m[2]) continue;
        const mx = cx * W.cs + 8, mz = cz * W.cs + 8;
        if (!R.visible(mx, W.h / 2, mz, 15)) continue;
        R.drawMesh(m[2], IDENT, { blend: true, alpha: 0.62, wave: true });
      }
      // 粒子
      this.particles.draw(R);
      // 第一人称手
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
      // 第三人称身体
      if (this.thirdPerson) {
        const parts = this.ensureModel(p.modelId);
        const md = N.MODELS[p.modelId];
        const sc = md.scale;
        const base = N.M4.create();
        N.M4.trans(base, p.x, p.y, p.z);
        const ry = N.M4.create(); N.M4.rotY(ry, p.yaw + Math.PI);
        N.M4.mul(base, base, ry);
        const sm = N.M4.create(); N.M4.scale(sm, sc, sc, sc);
        N.M4.mul(base, base, sm);
        const st = { t: this.time, move: Math.min(1, Math.hypot(p.vx, p.vz) / 5), fly: !!p.formDef.fly && !p.grounded, phase: 0, gait: 7 };
        for (const e of parts) R.drawMesh(e.mesh, N.partMatrix(N.M4.create(), base, e, st), {});
      }
    }

    /* ------------------------- 存档 ------------------------- */
    save() {
      try {
        const s = {
          time: this.time, day: this.day, seed: this.seed,
          p: { x: this.player.x, y: this.player.y, z: this.player.z, yaw: this.player.yaw, pitch: this.player.pitch, vital: this.player.vital, form: this.player.form, formT: this.player.formT },
          inv: this.inv, stashes: this.stashes.map(s2 => ({ id: s2.id, cn: s2.cn, slots: s2.slots, decay: s2.decay, items: s2.items, x: s2.x, y: s2.y, z: s2.z, kind: s2.kind })),
          diffs: this.diffs, seen: this.seen, dex: this.dexFruit, regrow: this.regrow, posts: this.posts, owl: this._owlUnlocked || false,
          quests: this.quests.map(q => [q.id, q.done]), stats: this.stats, upg: this.upg
        };
        localStorage.setItem(SAVE_KEY, JSON.stringify(s));
        this.logMsg('已保存。', 'good');
      } catch (e) { this.logMsg('保存失败：' + e.message, 'bad'); }
    }
    load() {
      let s;
      try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { s = null; }
      if (!s) return false;
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
      this.logMsg('读档完成。', 'good');
      return true;
    }
  }

  N.Game = Game;
  N.DAY_LEN = DAY_LEN;

})(window.FRUTARIA = window.FRUTARIA || {});
