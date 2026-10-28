/* gameplay loop: harvest -> capacity -> eat & transform -> revert -> cellar in/out -> cellar tree -> save -> quests */
const puppeteer = require('puppeteer-core');
const path = require('path');
const { sim } = require('./simwait');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome', headless: 'new',
    /* the steps that walk a whole day of the valley run for minutes of page time
       on a loaded machine, and the default 3 minutes is not minutes enough: a
       step that overruns it takes the whole run, and every number the run had
       collected with it. */
    protocolTimeout: 600000,
    args: ['--no-sandbox', '--disable-gpu', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 560 });
  const errs = []; const seen = new Set();
  page.on('pageerror', e => { const k = e.message; if (!seen.has(k)) { seen.add(k); errs.push('PAGEERROR: ' + k + '\n' + (e.stack || '').split('\n').slice(0, 3).join('\n')); } });
  page.on('console', m => { if (m.type() === 'error') { const t = m.text(); if (!seen.has(t)) { seen.add(t); errs.push('CONSOLE: ' + t); } } });
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await page.waitForFunction('window.game && window.game.ready', { timeout: 120000 });
  await page.evaluate(() => window.startGame());
  // half a second of the game's own clock, not of the wall's (see simwait.js)
  await sim(page, 0.5);

  const log = [];
  /* `args` are handed to the step the way page.evaluate hands them on: a step
     that needs to know what an earlier step measured takes it as a plain value
     instead of going out and measuring the world all over again. */
  const step = async (name, fn, ...args) => {
    const r = await page.evaluate(fn, ...args);
    log.push(name + ': ' + JSON.stringify(r));
    return r;
  };
  // value assertions (the file used to fail only on console/page errors)
  const check = (name, cond, detail) => { if (!cond) errs.push('CHECK FAILED: ' + name + ' ' + JSON.stringify(detail)); };

  // 1. harvest: teleport next to an owlberry and call harvest directly
  await step('harvest', () => {
    const g = window.game, W = g.world;
    let found = null;
    for (let y = 0; y < W.h && !found; y++) for (let z = 0; z < W.d && !found; z++) for (let x = 0; x < W.w && !found; x++)
      if (W.get(x, y, z) === 40) found = { x, y, z };   // 40 = owlberry
    if (!found) return 'no owlberry block';
    g.player.x = found.x + 0.5; g.player.y = found.y - 1; g.player.z = found.z + 0.5;
    const ci = ((found.z >> 4) * g.world.cx) + (found.x >> 4);
    window.__ci = ci; window.__meshBefore = g.world.chunks[ci];
    window.__picked = 40;
    g.harvest(found.x, found.y, found.z, 40);
    window.__flagged = g.world.dirty[ci];
    return { at: found, inv: g.inv.map(i => i.id), used: g.used(), cap: g.cap() };
  });

  /* 1b. regrow: a picked fruiting site queues a regrowth that carries the block
     it just lost and the delay the fruit's own rarity states -- times the 0.8..1.2
     sowing jitter the queue adds -- and when that delay runs out the block is back
     in the same cell and the queue entry is spent. Nothing used to ask any of it:
     these two steps printed `restored: true` and a delay measured off a timer that
     had already been forced to 0.05, and no check looked at either. */
  const rg = await step('regrowQueued', () => {
    const g = window.game, N = window.FRUTARIA;
    const r = g.regrow[g.regrow.length - 1];
    if (!r) return 'no regrow entry';
    const fid = N.FRUIT_BLOCK[r.b], fruit = N.FRUIT_BY_ID[fid], rar = N.RARITY[fruit.rarity];
    window.__rg = [r.x, r.y, r.z, r.b];
    const out = { at: [r.x, r.y, r.z], block: r.b, picked: window.__picked, cellNow: g.world.get(r.x, r.y, r.z),
      queueLen: g.regrow.length, fruit: fid, rarity: fruit.rarity,
      wantDays: rar.regrow, queuedDays: +(r.t / N.DAY_LEN).toFixed(3) };
    r.t = 0.05;
    return out;
  });
  check('a pick queues one regrowth, carrying the block the cell lost',
    rg.queueLen === 1 && rg.block === rg.picked && rg.cellNow === 0, rg);
  check('and it carries the delay that fruit rarity states, within the sowing jitter',
    rg.queuedDays >= rg.wantDays * 0.8 && rg.queuedDays <= rg.wantDays * 1.2, rg);
  await sim(page, 0.3);
  // 1a. a block edit must reach the rendered geometry, not only the voxel array
  const mesh = await step('meshFollowsEdits', () => {
    const W = window.game.world, ci = window.__ci;
    return { flaggedOnEdit: window.__flagged, remeshed: W.chunks[ci] !== window.__meshBefore, anyDirtyLeft: W.anyDirty() };
  });
  check('the edit flagged its chunk', mesh.flaggedOnEdit === 1, mesh);
  check('the flagged chunk is re-meshed within a few frames', mesh.remeshed, mesh);
  check('no chunk is left flagged', mesh.anyDirtyLeft === false, mesh);

  const rgd = await step('regrown', () => {
    const g = window.game, [x, y, z, b] = window.__rg || [0, 0, 0, 0];
    return { blockAfter: g.world.get(x, y, z), expect: b, restored: g.world.get(x, y, z) === b, queueLen: g.regrow.length };
  });
  check('when the delay runs out the block is back in the cell it was picked from',
    rgd.restored && rgd.blockAfter === rgd.expect, rgd);
  check('and the queue entry is spent rather than left to fire again', rgd.queueLen === 0, rgd);

  // 2. capacity: fill the backpack and verify rarity slot costs
  await step('capacity', () => {
    const g = window.game;
    g.inv.length = 0;
    const before = g.inv.length;
    const added = [];
    for (const id of ['owlberry', 'owlberry', 'frogpear', 'frogpear', 'bruinfig'])
      added.push(id + '=' + (g.addItem('fruit', id) ? 'ok' : 'FULL'));
    return { added, used: g.used(), cap: g.cap(), slots: g.inv.map(i => i.id + ':' + g.slotOf(i)) };
  });

  // 3. eat a fruit and transform
  await step('eat', () => {
    const g = window.game;
    g.inv.length = 0;
    g.addItem('fruit', 'owlberry');
    g.sel = 0; g.useSelected();
    const p = g.player;
    return { form: p.form, model: p.modelId, formT: +p.formT.toFixed(1), fly: !!p.formDef.fly, size: p.size(), fov: p.fov() };
  });

  // 3b. held breath belongs to the body: a body that needs air is clamped to
  //     eighteen seconds, and a body that breathes water is not clamped at all.
  //     (No body carries a bonus any more -- `airBonus` went with the jellyfish.)
  const air = await step('airCeiling', () => {
    const g = window.game, p = g.player, N = window.FRUTARIA;
    const was = { form: p.form, x: p.x, y: p.y, z: p.z, air: p.air, vital: p.vital, vx: p.vx, vy: p.vy, vz: p.vz };
    p.x = 136.5; p.y = 22; p.z = 130.5; p.vx = p.vy = p.vz = 0; p.vital = 5;
    p.form = null; p.air = 100; p.update(0.1, {}, g);      // over-full air is clamped to the body ceiling
    const human = p.air;
    p.form = 'frogpear'; p.air = 100; p.update(0.1, {}, g);
    const frog = p.air;
    p.form = 'owlberry'; p.air = 100; p.update(0.1, {}, g);
    const owl = p.air;
    Object.assign(p, was);
    return { human, frog, owl, ceiling: N.FRUIT_BY_ID.owlberry.form.airBonus };
  });
  check('a body that needs air is clamped to eighteen seconds', air.human === 18, air);
  check('a body that breathes water is not clamped down to eighteen seconds', air.frog > 100, air);
  check('no body carries an extra breath bonus', air.owl === 18 && air.ceiling === undefined, air);

  /* 4. flight after transforming: hold the climb key for 1.5 s of the game's own
     loop. Writing `game.input.jump` here does not survive one frame: the loop
     re-reads the key state at the top of every frame while the game is in play
     mode (main.js `setKeys()`), which is how this stage came to report
     `y0 23 / y1 23, grounded true` for the whole life of the suite -- the key was
     never held, and the stage the loop chain names "fly" never left the ground. */
  const flyY = await step('fly', () => {
    const g = window.game, p = g.player, W = g.world, N = window.FRUTARIA;
    /* the climb has to be measured in the open: the body is standing in the
       crown of the tree the picked owlberry grew on, and a worn body is refused
       by leaves -- it rose 1.3 m and stopped, its speed zeroed by the needles one
       metre over its feet, while the same crown is no wall at all to the owl
       animal it was carved from (TODO 2, the crown question). */
    const top = (x, z) => { for (let y = W.h - 1; y >= 0; y--) if (W.solidAt(x, y, z) && !N.TREE_BLOCK[W.get(x, y, z)]) return y; return -1; };
    let spot = null;
    for (let r = 0; r < 60 && !spot; r++)
      for (let dx = -r; dx <= r && !spot; dx++)
        for (let dz = -r; dz <= r && !spot; dz++) {
          const cx = Math.floor(p.x) + dx, cz = Math.floor(p.z) + dz, y = top(cx, cz);
          if (y < 1) continue;
          let open = true;
          for (let h = 1; h <= 12; h++) if (W.solidAt(cx, y + h, cz)) { open = false; break; }
          if (open) spot = { x: cx + 0.5, y: y + 1.0005, z: cz + 0.5 };
        }
    if (!spot) return { error: 'no column with 12 m of air above it near the player' };
    p.x = spot.x; p.y = spot.y; p.z = spot.z; p.vx = p.vy = p.vz = 0;
    return { y0: +p.y.toFixed(2), form: p.form, fly: !!p.formDef.fly, grounded: p.grounded,
      spot, airRate: p.formDef.fly };
  });
  await page.keyboard.down(' ');
  await sim(page, 0.5);
  await step('flyHalf', () => ({ y: +window.game.player.y.toFixed(2), vy: +window.game.player.vy.toFixed(2) }));
  await sim(page, 1.0);
  const flyAfter = await step('flyAfter', () => {
    const p = window.game.player;
    return { y1: +p.y.toFixed(2), grounded: p.grounded, vy: +p.vy.toFixed(2) };
  });
  await page.keyboard.up(' ');
  check('the body worn after eating the owlberry is a body built for the air',
    flyY.fly === true && flyY.grounded === true, flyY);
  check('holding the climb key through the loop the game runs lifts it off the ground',
    flyAfter.y1 > flyY.y0 + 2 && flyAfter.grounded === false, flyAfter);
  check('and it is still climbing, at a rate its own body allows and no faster',
    flyAfter.vy > 1 && flyAfter.vy <= flyY.airRate * 0.75 + 0.01, flyAfter);

  // 5. revert
  await step('revert', () => {
    const g = window.game;
    g.player.formT = 0.05;
    return { form: g.player.form };
  });
  await sim(page, 0.3);
  await step('afterRevert', () => {
    const p = window.game.player;
    return { form: p.form, model: p.modelId, size: p.size() };
  });

  // 5b. one body at a time. A second fruit replaces the body you are wearing;
  //     it does not punish you. The magic stomach used to make the third fruit
  //     eaten inside 90 seconds destroy itself, deal 0.8 damage and refuse the
  //     transformation -- that concept is deleted (docs/en/04 s5.1), and this
  //     step is what keeps it deleted.
  const swap = await step('oneBodyAtATime', () => {
    const g = window.game, N = window.FRUTARIA, p = g.player;
    const ids = ['owlberry', 'frogpear', 'bruinfig'];
    /* The bear body is 1.4 x 1.5 -- the widest body in the valley -- and eat()
       refuses a body that does not fit where you stand, so the swap has to
       happen in the open. Find a column with room for it rather than testing
       the rule by standing in a crevice. */
    const home = { x: p.x, y: p.y, z: p.z };
    const gy = (x, z) => { for (let y = g.world.h - 1; y >= 0; y--) if (g.world.solidAt(x, y, z)) return y; return -1; };
    let spot = null;
    for (let r = 0; r < 60 && !spot; r++)
      for (let dx = -r; dx <= r && !spot; dx++)
        for (let dz = -r; dz <= r && !spot; dz++) {
          const cx = Math.floor(home.x) + dx, cz = Math.floor(home.z) + dz, y = gy(cx, cz);
          if (y < 1) continue;
          let open = true;
          for (let h = 1; h <= 3; h++) if (g.world.solidAt(cx, y + h, cz)) { open = false; break; }
          if (!open) continue;
          p.x = cx + 0.5; p.z = cz + 0.5; p.y = y + 1.0005;
          const was = p.form; p.form = 'bruinfig';
          const fits = !p.hits(p.x, p.y, p.z);
          p.form = was;
          if (fits) spot = { x: +p.x.toFixed(1), y: +p.y.toFixed(1), z: +p.z.toFixed(1) };
        }
    if (!spot) { p.x = home.x; p.y = home.y; p.z = home.z; return { error: 'no bear-sized spot near the player' }; }
    g.inv.length = 0;
    for (const id of ids) g.addItem('fruit', id);
    const before = { vital: p.vital, inv: g.inv.length };
    const forms = [];
    for (const id of ids) { g.eat(id, 0); forms.push(p.form); }
    const after = { vital: p.vital, inv: g.inv.length };
    const lines = g.log.slice(-10).map(l => l.text);
    const out = {
      before, after, forms, spot,
      gastric: g.gastric, gastricTime: g.gastricTime,
      overwrite: N.t('log.overwrite', {
        a: N.disp(N.FRUIT_BY_ID.owlberry.form), b: N.disp(N.FRUIT_BY_ID.frogpear.form)
      }),
      sawOverwrite: lines.some(l => l === N.t('log.overwrite', {
        a: N.disp(N.FRUIT_BY_ID.owlberry.form), b: N.disp(N.FRUIT_BY_ID.frogpear.form)
      })),
      churnKeys: Object.keys(N.T).filter(loc =>
        N.T[loc]['log.churn'] !== undefined || N.T[loc]['log.causeOverload'] !== undefined)
    };
    p.form = null; p.formT = 0; g.inv.length = 0;
    p.x = home.x; p.y = home.y; p.z = home.z;
    return out;
  });
  check('each fruit replaces the body in order', JSON.stringify(swap.forms) === JSON.stringify(['owlberry', 'frogpear', 'bruinfig']), swap.forms);
  check('swapping bodies costs no vitality', swap.after.vital === swap.before.vital, swap);
  check('each fruit is spent exactly once, none destroyed by a penalty', swap.after.inv === swap.before.inv - 3, swap);
  check('the gastric counter no longer exists on the game', swap.gastric === undefined && swap.gastricTime === undefined, swap);
  check('the replacement is announced', swap.sawOverwrite, swap.overwrite);
  check('the churn keys stay out of both language tables', swap.churnKeys.length === 0, swap.churnKeys);

  // 6. cellar in / out
  await step('cellar', () => {
    const g = window.game;
    g.inv.length = 0;
    g.addItem('fruit', 'owlberry'); g.addItem('fruit', 'frogpear');
    g.openStashUI(g.stashes[0]);
    g.invSel = 0; g.moveItem('in');
    g.stashSel = 0; g.moveItem('out');
    g.mode = 'play'; window.ui.showCellar(false);
    return { inv: g.inv.map(i => i.id), cellar: g.stashes[0].items.map(i => i.id) };
  });

  // 7. pit -> plant a cellar tree
  const ct = await step('cellartree', () => {
    const g = window.game;
    g.inv.length = 0;
    g.addItem('fruit', 'owlberry');
    g.inv[0].fresh = 0.001;
    g.decayItems(1);
    const pits = g.inv.filter(i => i.kind === 'pit');
    const before = g.stashes.length;
    g.buildCellarTree();
    const tree = g.stashes[g.stashes.length - 1];
    // the same spot again must be refused: roots need STO.treestash.minDist of room
    const nBefore = g.stashes.length;
    g.buildCellarTree();
    const refused = g.stashes.length === nBefore;
    return { pitCount: pits.length, added: g.stashes.length - before, ownerIsPlayer: tree.owner === g.id,
             tooCloseRefused: refused, minDist: window.FRUTARIA.STORAGE.treestash.minDist,
             stashes: g.stashes.map(s => s.id + '@' + [s.x, s.y, s.z].join(',')) };
  });
  check('cellar tree is owned by the player id', ct.ownerIsPlayer === true, ct);
  check('a second cellar tree too close is refused', ct.tooCloseRefused === true, ct);

  // 8. save / load
  // cellar raids: far away always loses, nearby always defends, the main cellar is never robbed
  const rf = await step('raidFar', () => {
    const g = window.game;
    const tree = g.stashes.find(s => s.kind === 'tree');
    if (!tree) return 'no cellar tree';
    const cellar = g.stashes[0];
    for (let i = 0; i < 6; i++) tree.items.push({ kind: 'fruit', id: 'owlberry', fresh: 900, maxFresh: 900 });
    for (let i = 0; i < 4; i++) cellar.items.push({ kind: 'fruit', id: 'owlberry', fresh: 900, maxFresh: 900 });
    const cellarBefore = cellar.items.length;
    g.player.x = tree.x + 400; g.player.z = tree.z + 400;   // far away
    let guard = 0, prev = tree.items.length;
    const taken = [];
    while (tree.items.length > 0 && guard++ < 60) {
      g.dailyRolls();
      if (tree.items.length < prev) taken.push(prev - tree.items.length);
      prev = tree.items.length;
    }
    const T = window.FRUTARIA.STORAGE.treestash;
    return { treeLeft: tree.items.length, cellarLeft: cellar.items.length, cellarBefore, rolls: guard, lost: g.stats.raidsLost,
             takeMin: Math.min(...taken), takeMax: Math.max(...taken), ruleMin: T.raidMin, ruleMax: T.raidMax };
  });
  check('raid take stays inside the data bounds', rf.takeMin >= rf.ruleMin && rf.takeMax <= rf.ruleMax, rf);
  check('the town cellar is never robbed', rf.cellarLeft === rf.cellarBefore, rf);
  const rn = await step('raidNear', () => {
    const g = window.game;
    const tree = g.stashes.find(s => s.kind === 'tree');
    for (let i = 0; i < 6; i++) tree.items.push({ kind: 'fruit', id: 'owlberry', fresh: 900, maxFresh: 900 });
    const R = window.FRUTARIA.STORAGE.treestash.raidScareRadius;
    g.player.x = tree.x + R - 1; g.player.z = tree.z;      // just inside the scare radius
    const before = tree.items.length, scared0 = g.stats.raidsScared || 0;
    for (let i = 0; i < 40; i++) g.dailyRolls();
    return { before, after: tree.items.length, scared: (g.stats.raidsScared || 0) - scared0, radius: R };
  });
  check('standing inside the scare radius loses nothing', rn.after === rn.before && rn.scared > 0, rn);
  // owl post
  await step('postLocked', () => {
    const g = window.game;
    const tree = g.stashes.find(s => s.kind === 'tree');
    g._owlUnlocked = false; g.stashes[0].items.length = 0;
    g.openStashUI(tree); g.stashSel = 0;
    for (let i = 0; i < 3; i++) tree.items.push({ kind: 'fruit', id: 'frogpear', fresh: 900, maxFresh: 900 });
    const before = tree.items.length;
    g.postItem();
    return { unlocked: g.owlUnlocked(), refused: tree.items.length === before, posts: g.posts.length };
  });
  await step('postUnlockAndSend', () => {
    const g = window.game;
    const tree = g.stashes.find(s => s.kind === 'tree'), cellar = g.stashes[0];
    cellar.items.push({ kind: 'fruit', id: 'owlberry', fresh: 1500, maxFresh: 1500 });   // unlock Pendulum
    g.openStashUI(tree); g.stashSel = 0;
    const before = tree.items.length;
    g.postItem();
    return { unlocked: g.owlUnlocked(), treeBefore: before, treeAfter: tree.items.length, posts: g.posts.length, eta: +(g.posts[0].t / 420).toFixed(2) + '天' };
  });
  await step('postFromCellarRefused', () => {
    const g = window.game;
    g.openStashUI(g.stashes[0]); g.stashSel = 0;
    const n = g.stashes[0].items.length;
    g.postItem();
    return { refused: g.stashes[0].items.length === n };
  });
  await step('postArrive', () => {
    const g = window.game;
    for (const p of g.posts) p.t = 0.05;
    return { inTransit: g.posts.length };
  });
  await sim(page, 0.3);
  await step('postDone', () => {
    const g = window.game;
    return { inTransit: g.posts.length, cellar: g.stashes[0].items.map(i => i.id), sent: g.stats.postSent || 0, lost: g.stats.postLost || 0 };
  });
  await step('postDecayInTransit', () => {
    const g = window.game;
    const tree = g.stashes.find(s => s.kind === 'tree');
    g.openStashUI(tree); g.stashSel = 0;
    tree.items.push({ kind: 'fruit', id: 'frogpear', fresh: 600, maxFresh: 900 });
    g.stashSel = tree.items.length - 1;
    g.postItem();
    const p = g.posts[g.posts.length - 1];
    const f0 = p.it.fresh;
    p.t = 0.05;
    return { freshStart: f0, note: '送达时按 ×0.1 衰减 3 游戏日 = −126' };
  });
  await sim(page, 0.3);
  await step('postArrivedFresh', () => {
    const g = window.game;
    // the posted fruit is appended when it arrives, so the last one is it
    const e = g.stashes[0].items.filter(i => i.id === 'frogpear').pop();
    return { arrived: !!e, fresh: e ? +e.fresh.toFixed(1) : null, lost: g.stats.postLost || 0 };
  });
  // a fruit that runs out in the owl's claws goes dormant: same rule as on a shelf
  const dorm = await step('dormantInTransit', () => {
    const g = window.game;
    const it = { kind: 'fruit', id: 'frogpear', fresh: 0.5, maxFresh: 900 };
    const before = g.posts.length;
    g.posts.push({ it, t: 999, from: 'cellar' });
    g.updatePosts(30);
    const mid = { kind: it.kind, fresh: it.fresh };
    g.updatePosts(60);                       // a second round must not dig further
    const after = { kind: it.kind, fresh: it.fresh };
    g.posts.length = before;                 // take the test post back out
    return { mid, after };
  });
  check('a fruit that runs out in flight goes dormant', dorm.mid.kind === 'pit', dorm);
  check('dormant stops the decay instead of running into the negatives', dorm.mid.fresh === 0 && dorm.after.fresh === 0, dorm);

  const idBefore = await step('idBefore', () => window.game.id);
  await step('save', () => { window.game.save(); const s = localStorage.getItem(window.FRUTARIA.SAVE_KEY); return s ? 'saved ' + s.length + 'B' : 'NO SAVE'; });
  const ld = await step('load', () => { const ok = window.game.load(); return { ok, id: window.game.id, inv: window.game.inv.map(i => i.id), stashes: window.game.stashes.length }; });
  check('id survives save/load', ld.id === idBefore, { before: idBefore, after: ld.id });

  // 8b. identity: no fixed protagonist name -- id stable, epithet earned, name is the player's and clamped
  const ident = await step('identity', () => {
    const g = window.game, ID = window.FRUTARIA.IDENTITY;
    const was = g.quests.map(q => q.done);
    g.quests.forEach(q => q.done = false);
    const epDefault = g.epithet().cn;
    g.quests.find(q => q.id === 'q1').done = true;
    const epQ1 = g.epithet().cn;
    g.quests.forEach(q => q.done = true);
    const epAll = g.epithet().cn;
    g.quests.forEach((q, i) => q.done = was[i]);           // leave quest state untouched
    const nm = g.setName('abcdefghijklmnopqrstuvwx');      // 24 chars, must clamp
    return { id: g.id, epDefault, epQ1, epAll, epDefaultExpected: ID.epithetDefault.cn, nameLen: nm.length, nameMax: ID.nameMax };
  });
  check('id looks like p-xxxxxx', /^p-[a-z0-9]{6}$/.test(ident.id), ident.id);
  check('default epithet comes from data', ident.epDefault === ident.epDefaultExpected, ident);
  check('epithet changes after q1', ident.epQ1 !== ident.epDefault, { a: ident.epDefault, b: ident.epQ1 });
  check('epithet changes when all quests are done', ident.epAll !== ident.epQ1, { a: ident.epQ1, b: ident.epAll });
  check('player name is clamped to nameMax', ident.nameLen === ident.nameMax, ident);

  // 9. quests
  await step('quests', () => {
    const g = window.game;
    return { quests: g.quests.map(q => q.id + (q.done ? '✔' : '·')), log: g.log.slice(-5).map(l => l.text) };
  });

  /* 9b. the two gates that are not "count what is in the pack": q5 wants the fig
     carried (a legendary one is 12 of 24 slots and sleeps in 420 s, so the quest
     is the walk home), and q6 wants you standing at the greenhouse door -- no
     amount of fruit does anything there. */
  const gates = await step('quest gates', () => {
    const g = window.game, p = g.player, N = window.FRUTARIA;
    const was = { form: p.form, formT: p.formT, x: p.x, y: p.y, z: p.z,
                  inv: g.inv.slice(), upg: Object.assign({}, g.upg) };
    const q = id => g.quests.find(x => x.id === id);
    const put = (arr, keep) => { arr.length = 0; for (const it of keep) arr.push(it); };
    put(g.inv, []);
    q('q5').done = false; q('q6').done = false;
    const gh = N.POIS.find(x => x.id === 'greenhouse');
    p.x = gh.x + 40; p.y = gh.y + 1; p.z = gh.z + 40;      // nowhere near the door
    g.checkQuests();
    const farFromDoor = q('q6').done;
    g.addItem('fruit', 'bruinfig');                        // 12 of 24 slots
    g.checkQuests();
    const carried = q('q5').done;
    p.x = gh.x + 1; p.y = gh.y + 1; p.z = gh.z + 1;        // at the door
    g.checkQuests();
    const atDoor = q('q6').done;
    Object.assign(p, { form: was.form, formT: was.formT, x: was.x, y: was.y, z: was.z });
    put(g.inv, was.inv);
    for (const k in g.upg) if (!(k in was.upg)) delete g.upg[k];
    q('q5').done = false; q('q6').done = false;
    return { farFromDoor, carried, atDoor };
  });
  check('q5 is a bruin fig carried home', gates.carried === true, gates);
  check('q6 is a place, not a fruit', gates.farFromDoor === false && gates.atDoor === true, gates);

  /* 9c. a place's name is a claim about the world, asked of that world. The keep's
     fruit store used to carry the word for a cellar -- in the name the data gives
     the marker, in the zone's own description, and in the hint the codex prints
     under quest 6 -- and the room it promised is not there: the generator fills
     the island, and every one of the 9,702 cells from the floor of the world up to
     the row the keep's own door marker is printed at holds a block. The town's
     Main Cellar keeps the word, and keeps it honestly: over its floor the world
     leaves three rows of air inside a 9x9 box of dark brick, and a floor of solid
     over that. The suite runs the page, so these are the live objects the codex
     and the HUD read, not the source text a second checker parses. Two halves,
     each with its own canary: put the word back into the zone's description and
     the keep half goes red; take the store's room out of the generator and the
     town half goes red. */
  const named = await step('place names', () => {
    const g = window.game, W = g.world, N = window.FRUTARIA;
    const gh = N.POIS.find(p => p.id === 'greenhouse');
    const keep = N.ZONE_BY_ID.starfall;
    const cell = N.POIS.find(p => p.id === 'cellar');
    const town = N.ZONE_BY_ID.lanternrow;
    const q6 = g.quests.find(q => q.id === 'q6');
    let cols = 0, cells = 0, air = 0;
    for (let z = keep.cz - keep.r; z <= keep.cz + keep.r; z++)
      for (let x = keep.cx - keep.r; x <= keep.cx + keep.r; x++) {
        if (Math.hypot(x - keep.cx, z - keep.cz) > keep.r) continue;
        cols++;
        for (let y = 0; y <= gh.y; y++) { cells++; if (!W.get(x, y, z)) air++; }
      }
    const lo = [1e9, 1e9], hi = [-1e9, -1e9];
    let box = 0;
    for (let z = town.z0; z <= town.z1; z++) for (let x = town.x0; x <= town.x1; x++) {
      let has = false;
      for (let y = 0; y < W.h; y++) if (W.get(x, y, z) === 12) { has = true; break; }
      if (!has) continue;
      box++;
      if (x < lo[0]) lo[0] = x; if (x > hi[0]) hi[0] = x;
      if (z < lo[1]) lo[1] = z; if (z > hi[1]) hi[1] = z;
    }
    const roomRows = [];
    for (let y = cell.y + 1; y <= cell.y + 8; y++) {
      let a = 0;
      for (let z = lo[1]; z <= hi[1]; z++) for (let x = lo[0]; x <= hi[0]; x++) if (!W.get(x, y, z)) a++;
      if (!a) break;
      roomRows.push(y);
    }
    const says = [gh.cn, gh.en, keep.desc, q6.hint.cn, q6.hint.en];
    const word = /地窖|cellar/i;
    const hud = g.zoneNameAt({ x: gh.x + 0.5, y: gh.y + 1, z: gh.z + 0.5 });
    return { cols, cells, air, box, plan: [hi[0] - lo[0] + 1, hi[1] - lo[1] + 1], roomRows,
      says, carrying: says.filter(s => word.test(String(s))),
      codex: N.disp(q6) + ' / ' + N.disp(q6.hint), hud,
      townNames: [cell.cn, cell.en] };
  });
  check('the island under the keep door holds no room, so the name may not promise one',
    named.cols === 441 && named.cells === 9702 && named.air === 0, named);
  check('and none of the five strings the game carries for that place carries the word',
    named.says.length === 5 && named.carrying.length === 0, named);
  check('the quest 6 the codex prints says where the greenhouse stands, not what is under it',
    /greenhouse|温室/.test(named.codex) && !/cellar|地窖/i.test(named.codex), named.codex);
  check('the town store names a room, and the world gives it three rows of one',
    /cellar|果窖/.test(named.townNames.join(' ')) && named.roomRows.length === 3 &&
    named.plan[0] === 9 && named.plan[1] === 9 && named.box > 0, named);
  check('the name the HUD gives a body standing at that door is the keep, not a room',
    !/cellar|地窖/i.test(named.hud), named.hud);

  // 10. ecology: population / species mix
  await step('ecology', () => {
    const g = window.game;
    const by = {};
    for (const c of g.creatures) by[c.sp.id] = (by[c.sp.id] || 0) + 1;
    return by;
  });

  // 10b. the lamps of Mirrorlake: an animal with no fruit and no body to wear, a
  //      field that sits on one landmark instead of being scattered over the
  //      lake, and -- the interesting part -- the only species whose locomotion
  //      is 'water', so the only one that must never end up on dry land.
  const lamps = await step('lamps', () => {
    const g = window.game, p = g.player, N = window.FRUTARIA;
    const sp = N.CREATURE_BY_ID.jelly, tower = N.ZONE_BY_ID.mirrorlake.tower;
    const herd = () => g.creatures.filter(c => c.sp.id === 'jelly');
    const wet = () => herd().filter(c =>
      g.world.liquidAt(Math.floor(c.x), Math.floor(c.y + 0.2), Math.floor(c.z))).length;
    /* Where a lamp is allowed to stand. The errands it swims are picked from a
       disc of `spread` round the landmark, and that disc is the promise the dex
       makes ("the field sits exactly in the outline of the sunken tower") -- it
       is also the thing the old bug broke, when errands were picked from a disc
       of the same size round wherever the lamp happened to be standing: the
       field came out twice the size it was meant to be, and one lamp sat 11 m
       from the tower for five minutes. The body swimming an errand is not the
       errand, though. It can only bend the course it is already on, at `turn`
       radians a second, so at the speed its wandering cruises at (0.42 of the
       speed its row swims at: 0.92 m/s for this one) the tightest arc its own
       table allows is 1.16 m -- and a lamp that reaches the place it was sent to
       still carrying a course it cannot shed swings past it and back. The
       field's outer edge is the disc plus that swing, not the disc.
       The bound also has to be paid frame by frame rather than at two instants.
       Read at the start and the end of this step only, the field peaked between
       5.7 and 7.4 m from the tower over ten watches of ten minutes each, and a
       check written against the disc plus a bare 2 m went red on roughly one run
       in three with nothing in the game changed. Paid frame by frame instead: the
       field peaks at 5.7 to 6.5 m within a watch, and of the 60000 lamp-frames a
       five-minute watch runs, 0 to 31 stand outside the disc plus one swing.
       The errands themselves never leave the disc: 764 to 795 of them a watch,
       the furthest 3.999 m from the tower. What does stand further out is the
       pick a lamp makes when the tower's brick leaves it nowhere to go -- it sets
       its errand to its own feet and waits, 322 to 422 times a watch -- and those
       are counted apart, because a lamp standing where it already is has not been
       sent anywhere. So the field is asked three ways: every errand inside the
       disc, under one lamp-frame in a hundred outside the disc plus a swing, and
       no lamp ever beyond the 8 m that was the far tail of those ten watches. */
    const cruise = (sp.swimSpeed || sp.speed || 3) * 0.42;   // entities.js: wander cruises at 0.42
    const arc = cruise / (sp.turn || 1);                     // the tightest arc the row allows
    const edge = sp.spread + 2 * arc;                        // the disc, plus one swing past it
    let maxFar = 0, maxErrand = 0, errands = 0, boxedIn = 0, outFrames = 0, lampFrames = 0;
    // standing in the field is not free (see the sting step), and this step
    // parks the player in it for 90 seconds, so the body is put back after
    const was = { form: p.form, x: p.x, y: p.y, z: p.z, vital: p.vital };
    const one = herd()[0];
    const atts = [null, 'owlberry', 'frogpear', 'bruinfig'].map((f) => {
      p.form = f; p.x = one.x + 1.5; p.y = one.y; p.z = one.z;
      return one.attitudeTo(f);
    });
    const before = { n: herd().length, wet: wet() };
    /* Five minutes of game time, animals only: enough for several hundred wander
       targets, and every one of those targets has to be water. Long, because the
       way an aquatic animal used to escape the lake was a slow one -- it took the
       field a while to walk one of its own into the tower wall. And the field is
       counted as it swims, metre by metre, rather than by how far it got from
       where it started: a field that is kept to its landmark does not get far
       from where it started, and that is the whole point of the landmark. */
    const field = herd();
    const prev = field.map(c => [c.x, c.z]);
    const lastErrand = field.map(c => c.tx + ',' + c.tz);
    const swam = new Float64Array(field.length);
    /* Where the water holds a lamp. The depth a body of this kind hangs at is on
       the animal's own row and is measured to the crown of the body, so the crown
       has to hang that far under the film -- not a block deeper, which is what
       happens when metres are subtracted from the index of a cell: the film sits
       one block above that index. */
    let crownMin = 9, crownMax = -9, crownSum = 0, through = 0, bedded = 0, seen = 0;
    for (let i = 0; i < 6000; i++) for (let k = 0; k < field.length; k++) {
      const c = field[k];
      /* Where the lamp stood when the frame opened. A lamp that is boxed in
         against the tower's brick sets its errand to that place and cannot move;
         the keep-apart pass at the end of an update then shoves it, so the errand
         is at the feet it stood on when it was set, not at the feet it stands on
         now -- which is why it is asked that way and not as an equality. */
      const bx0 = prev[k][0], bz0 = prev[k][1];
      c.update(0.05, p, g.world, g);
      swam[k] += Math.hypot(c.x - bx0, c.z - bz0);
      prev[k][0] = c.x; prev[k][1] = c.z;
      // the field's own extent, over every frame of the watch and not at two instants
      const dfar = Math.hypot(c.x - tower[0], c.z - tower[1]);
      lampFrames++;
      if (dfar > maxFar) maxFar = dfar;
      if (dfar > edge) outFrames++;
      const err = c.tx + ',' + c.tz;
      if (err !== lastErrand[k]) {
        lastErrand[k] = err;
        /* A lamp with nowhere it can get to sets its errand to the place it is
           standing and waits; that is not a place this field was sent to, so it
           is counted apart from the errands rather than loosening the bound on
           them. It is also worth reporting: it says how often the tower's brick
           leaves a lamp with nowhere to go. */
        if (Math.hypot(c.tx - bx0, c.tz - bz0) < 1e-9) boxedIn++;
        else {
          errands++;
          const de = Math.hypot(c.tx - tower[0], c.tz - tower[1]);
          if (de > maxErrand) maxErrand = de;
        }
      }
      if (i % 20 === 19) {
        const s = g.world.liquidSurfaceAt(Math.floor(c.x), Math.floor(c.z));
        if (s < 0) continue;
        seen++;
        const under = s - (c.y + c.tall);
        crownSum += under;
        if (under < crownMin) crownMin = under;
        if (under > crownMax) crownMax = under;
        if (under < 0) through++;
        if (c.y < N.groundY(g.world, Math.floor(c.x), Math.floor(c.z), Math.floor(c.y)) + 0.02) bedded++;
      }
    }
    /* The exact way an aquatic animal used to walk out of the lake: home on the
       far side of the sunken tower, the tower in between. The homeward step is
       tested like every other step now; unchecked, it dragged the animal through
       the brick, and the altitude code -- finding no water in that column --
       left it standing on the tower's roof for good. */
    const stuck = herd()[0];
    const keep = { x: stuck.x, y: stuck.y, z: stuck.z, homeX: stuck.homeX, homeZ: stuck.homeZ };
    stuck.x = 63.2; stuck.y = 13; stuck.z = 114.6;         // wet, just off the tower wall
    stuck.homeX = 69.5; stuck.homeZ = 121.5;               // wet, on the far side
    stuck.tx = stuck.homeX; stuck.tz = stuck.homeZ;        // head home the whole way:
    stuck.pause = 1e9;                                     // the wander roll is not the thing under test
    const startD = Math.hypot(stuck.x - stuck.homeX, stuck.z - stuck.homeZ);
    let dryFrames = 0, solidFrames = 0, swum = 0, px = stuck.x, pz = stuck.z;
    for (let i = 0; i < 1800; i++) {      // 90 s: a jellyfish crosses 0.34 m of
      stuck.update(0.05, p, g.world, g);  // water per second, so give it a minute
      if (!g.world.liquidAt(Math.floor(stuck.x), Math.floor(stuck.y + 0.2), Math.floor(stuck.z))) dryFrames++;
      if (g.world.solidAt(Math.floor(stuck.x), Math.floor(stuck.y), Math.floor(stuck.z))) solidFrames++;
      swum += Math.hypot(stuck.x - px, stuck.z - pz); px = stuck.x; pz = stuck.z;
    }
    /* Not "it arrives": the lake's water is one basin, but the sunken tower and
       the island rock leave a dead-end pocket on its north side, and nothing in
       this game path-finds. What has to be true is that the animal keeps
       swimming, stays in the water and never ends up inside rock. */
    const swumM = +swum.toFixed(1);
    void startD;
    Object.assign(stuck, keep);
    const after = { wet: wet() };
    // an animal that cannot leave the water can also be frozen by it: every
    // step it tries runs into the tower, so "still wet" alone is not alive. What
    // is counted here is the water an animal moves through, not the ground it
    // covers: five minutes of a lamp that never got further than a few metres
    // from where it began is still five minutes of swimming.
    const drift = Array.from(swam).sort((a, b) => a - b);
    Object.assign(p, was);
    return {
      n: before.n, wet: before.wet, after, atts,
      spread: sp.spread, cruise: +cruise.toFixed(2), arc: +arc.toFixed(2), edge: +edge.toFixed(2),
      errands, boxedIn, maxErrand: +maxErrand.toFixed(4),
      drift: +drift[Math.floor(drift.length / 2)].toFixed(1),
      dryFrames, solidFrames, swumM, maxFar: +maxFar.toFixed(1),
      outFrames, lampFrames,
      hover: { want: sp.hover, min: +crownMin.toFixed(2), max: +crownMax.toFixed(2),
        mean: +(crownSum / Math.max(1, seen)).toFixed(2), through, bedded, seen },
      bears: !!sp.fruit, worn: N.FRUITS.some(f => f.creature === 'jelly'),
      name: N.disp(sp), lore: N.dexOf(sp)
    };
  });
  check('the lamps are an animal and bear no fruit',
    lamps.n === 10 && lamps.bears === false && lamps.worn === false, lamps);
  check('the lamps never leave the water',
    lamps.wet === lamps.n && lamps.after.wet === lamps.n, lamps);
  /* The errand is the promise the dex makes, and this is the tight question:
     every place a lamp is sent to has to lie inside the tower's disc. It is
     exact by construction -- a radius, sampled as a radius -- so it is asked
     without slack, and it is what a field that had drifted off its landmark
     would trip, which is exactly the bug this step was written for. */
  check('a lamp is sent to the tower, not to wherever it happens to be standing',
    lamps.errands > 500 && lamps.maxErrand <= lamps.spread + 0.001, lamps);
  /* The body that swims an errand, on the other hand, is a body: it carries the
     course it was travelling on past the place it was sent to, and comes back
     round. That is the swing its own turn rate buys it, and the field is held to
     the disc plus a swing on the frames it stands outside them, with a ceiling
     at the far tail of what those watches ever reached. */
  check('the lamp field is the sunken tower, not the whole lake',
    lamps.maxFar <= 8 && lamps.outFrames * 100 <= lamps.lampFrames, lamps);
  check('the lamps do not read bodies', lamps.atts.every(a => a === 'ignore'), lamps);
  check('the lamps have a dex entry', lamps.name.length > 0 && lamps.lore.length > 20, lamps);
  check('the lamps still get around the tower', lamps.drift > 20, lamps);
  check('a lamp is never dragged through the tower out of the water',
    lamps.dryFrames === 0 && lamps.solidFrames === 0, lamps);
  check('a lamp against the tower is still swimming', lamps.swumM > 3, lamps);
  /* The depth a lamp hangs at is a height, and it is on the animal's own row. The
     branch used to take metres off the index of the topmost water cell, and the
     film sits one block above that index, so the whole field hung a block deeper
     than the sentence said: over 12000 samples of the ten lamps, the crown
     **1.52-3.12 m** under the film (mean 2.22) for a body **0.54 m** tall, where
     the row states 1.2 m plus or minus the 0.8 m of bob it drifts on. The band
     accepted here is that depth, the bob, and the 0.4 m the 1.6/s ease lags a
     sine that keeps turning round -- the mean, which the ease cannot bias, is
     pinned to the row itself. And the body has to be **born** at that depth: the
     sample puts a creature's feet on the ground of its column, and the ten lamps
     were born standing on the lakebed under eight metres of their own lake. At
     the animal's very first update its crown read **8.73 m** under the film, and
     the height closed at **0.72 m a frame** -- 14.4 m/s, against the 2.2 m/s a
     lamp swims. The band then read differently depending on how long the page had
     been alive: 3.4 m and 226 of 60000 lamp-frames outside it seconds after the
     world was made, 1.89 m and no frames outside minutes later. Born where its own
     row says it hangs, every page reads 0.51 to 1.89 m. */
  check('a lamp hangs at the depth its own row states, measured to its crown under the film, ' +
        'and never through the film or through the lakebed',
    lamps.hover.seen > 100 && lamps.hover.min > 0.2 &&
    lamps.hover.max < lamps.hover.want + 0.8 + 0.4 &&
    Math.abs(lamps.hover.mean - lamps.hover.want) < 0.35 &&
    lamps.hover.through === 0 && lamps.hover.bedded === 0, lamps);

  // 10c. the lamps sting. This is measured rather than asserted loosely, because
  //      the number is the design: the field has to cost something to loiter in
  //      and must not kill the 18-second dive to the tower sills, which is the
  //      one fruit the lake gives you before it asks anything (docs/en/02 s4).
  const sting = await step('sting', () => {
    const g = window.game, p = g.player, N = window.FRUTARIA;
    const herd = g.creatures.filter(c => c.sp.id === 'jelly');
    const mid = (k) => herd.reduce((a, c) => a + c[k], 0) / herd.length;
    const was = { form: p.form, x: p.x, y: p.y, z: p.z, vital: p.vital, vx: p.vx, vy: p.vy, vz: p.vz };
    const run = (form, y, secs, among) => {
      p.form = form; p.vital = 10; p.x = mid('x'); p.y = y; p.z = mid('z');
      g.log.length = 0;
      g._stungAt = undefined;                       // the throttle is per wade, not per run
      let frames = 0, contacts = 0, worstNear = 0, spread = 0;
      for (let i = 0; i < secs / 0.05 && p.vital > 0; i++) {
        for (const c of herd) c.update(0.05, p, g.world, g);
        /* Stay where the lamps are. They wander -- a spread is a radius and
           they pick a new point inside it every few seconds -- so a body left
           where it was dropped can find the field has walked off without it,
           and then this measures luck rather than the cost of standing in the
           field. And the field is a ring: the lamps sit on the outline of the
           sunken tower, so the middle of the ten of them is the tower, and no
           lamp is within reach of that middle (measured: the nearest lamp to
           it sits 1.7-2.3 m off, and the reach is 2.08 m). The claim being
           tested is "you are standing among the lamps", so the body stands at
           the lamp nearest the middle of the field -- the point of the field
           closest to its own middle. The dive to the sills is the exception:
           down there, out of reach of every lamp, is the thing that run is
           checking. */
        let bx = mid('x'), bz = mid('z'), by = y;
        if (among) {
          const cy = mid('y');
          let best = null, bd = 1e9;
          for (const c of herd) {
            const d = Math.hypot(c.x - bx, c.y - cy, c.z - bz);
            if (d < bd) { bd = d; best = c; }
          }
          bx = best.x; by = best.y; bz = best.z;
        }
        p.x = bx; p.y = by; p.z = bz;
        let n = 0, near = 1e9;
        for (const c of herd) {
          const d = Math.hypot(c.x - p.x, c.y - p.y, c.z - p.z);
          if (d < (c.sp.scale || 0.2) * 8 + 0.8) n++;
          if (d < near) near = d;
          spread = Math.max(spread, d);
        }
        contacts += n; if (near > worstNear) worstNear = near;
        frames++;
      }
      const warn = N.t('log.stung', { n: N.disp(N.CREATURE_BY_ID.jelly) });
      // the death line is 'bad' too, so the warning is matched by text
      return {
        lost: +(10 - p.vital).toFixed(2), secs: +(frames * 0.05).toFixed(1),
        // how much field the body was standing in, and how far the field's own
        // middle was from its nearest lamp: the number below means nothing
        // without these
        lamps: +(contacts / frames).toFixed(2), near: +worstNear.toFixed(2),
        spread: +spread.toFixed(2),
        warns: g.log.filter(l => l.text === warn).length,
        line: (g.log.filter(l => l.text === warn)[0] || {}).text || ''
      };
    };
    const surface = mid('y');
    const human = run(null, surface, 18, true);
    const frog = run('frogpear', surface, 18, true);
    const sill = run(null, 9, 18, false);    // the tower sills the frog pear hangs on
    Object.assign(p, was);
    return {
      rate: N.CREATURE_BY_ID.jelly.sting, human, frog, sill, surface: +surface.toFixed(1),
      immune: N.FRUITS.filter(f => f.form.poisonImmune).map(f => f.id),
      cause: N.t('log.causeSting'),
      warnText: N.t('log.stung', { n: N.disp(N.CREATURE_BY_ID.jelly) })
    };
  });
  /* Measured with the body held among the lamps, at the lamp nearest the middle
     of the field: about two lamps are inside it at any moment, so at 0.25 a
     second each it loses all 10 vitality in about 10 seconds. The bound is the
     loose half on purpose -- what it must never do is come back near zero,
     which is what a body the field has walked away from reports. */
  check('the lamps sting a body that is not immune', sting.human.lost > 2, sting);
  check('the lamps do not sting the body the lake already gave you', sting.frog.lost === 0, sting);
  check('the dive to the tower sills stays out of reach of the lamps', sting.sill.lost === 0, sting);
  check('the sting warning names the body that answers it', /雨蛙|frog/.test(sting.warnText), sting);
  check('the sting warns once, not every frame', sting.human.warns >= 1 && sting.human.warns <= 2, sting);
  check('exactly one body shrugs the sting off', sting.immune.length === 1 && sting.immune[0] === 'frogpear', sting);

  // 10b. intimidation belongs to the body, and one's own species is exempt
  const intimidate = await step('intimidation', () => {
    const g = window.game, p = g.player, N = window.FRUTARIA;
    const was = { form: p.form, x: p.x, y: p.y, z: p.z, vital: p.vital, vx: p.vx, vy: p.vy, vz: p.vz };
    const bear = g.creatures.find(c => c.sp.id === 'bear');
    const frog = g.creatures.find(c => c.sp.id === 'frog');
    p.form = 'bruinfig'; p.vital = 5;
    const standNextTo = (c) => { p.x = c.x + 3; p.y = c.y; p.z = c.z; c.state = 'wander'; c.alarm = 0; };
    standNextTo(bear); bear.update(0.05, p, g.world, g);
    const bearAtt = bear.attitudeTo('bruinfig'), bearState = bear.state;
    standNextTo(frog); frog.update(0.05, p, g.world, g);
    const frogAtt = frog.attitudeTo('bruinfig'), frogState = frog.state;
    Object.assign(p, was);
    bear.state = 'wander'; frog.state = 'wander'; bear.alarm = 0; frog.alarm = 0;
    return { aura: N.FRUIT_BY_ID.bruinfig.form.aura, bearAtt, bearState, frogAtt, frogState };
  });
  check('a bear is not intimidated by a bear', intimidate.bearState !== 'flee', intimidate);
  check('the bear aura still scares another species', intimidate.frogState === 'flee', intimidate);

  // 10c. one integer still names exactly one block (the highlight box used to
  // be cached by one; it is aimed by a model matrix now, and the name is left
  // in place for anything that needs it)
  const hl = await step('blockKeyIsUnique', () => {
    const W = window.game.world, k = (x, y, z) => W.key(x, y, z);
    const pair = [k(10, 1, 100), k(10, 2, 0)];      // the old decimal packing gave both 100200
    const seen = new Set(); let dup = null, n = 0;
    for (let x = 0; x < W.w && !dup; x++) for (let z = 0; z < W.d && !dup; z++) for (let y = 0; y < W.h && !dup; y++) {
      const v = k(x, y, z); n++;
      if (seen.has(v)) dup = { x, y, z }; else seen.add(v);
    }
    return { pair, distinct: pair[0] !== pair[1], blocks: n, duplicates: dup, unique: seen.size };
  });
  check('the block key is unique across the whole world', hl.duplicates === null && hl.unique === hl.blocks, hl);

  // 10d. particles carry their own gravity: bubbles rise, motes hover, embers fall
  const part = await step('particleGravity', () => {
    const g = window.game, W = g.world, P = g.particles;
    const n0 = P.n;
    /* The pool swap-removes dead particles, so a leftover particle dying during
       the two seconds below would drag the test particles into other slots and
       the indices would lie. Start from an empty pool: three of these live 5 s,
       so nothing dies and index === identity for the whole step -- and the one
       that is meant to die, the bubble that reaches the surface, is spawned
       last, where the slot it leaves is the one the pool shrinks away from. */
    let deep = null;
    for (let z = 40; z < W.d - 8 && !deep; z++) for (let x = 40; x < W.w - 8 && !deep; x++) {
      const s = W.liquidSurfaceAt(x, z);
      if (s < 0) continue;
      let bed = -1;
      for (let y = s - 1; y >= 0; y--) if (W.solidAt(x, y, z)) { bed = y; break; }
      if (bed >= 0 && s - bed >= 5) deep = { x: x + 0.5, z: z + 0.5, surf: s, bed };
    }
    if (!deep) { P.n = n0; return { error: 'no lake at least 5 m deep' }; }
    P.n = 0;
    // a bubble only lives inside water, so the buoyant ones start in a lake
    P.spawn(deep.x, deep.surf - 4, deep.z, 0, 0.8, 0, 5, [1, 1, 1], 0.2, -0.5);   // bubble: buoyant, 4 m down
    P.spawn(0, 40, 0, 0, 0.3, 0, 5, [1, 1, 1], 0.2, 0);      // mote / firefly: weightless
    P.spawn(0, 40, 0, 0, 0, 0, 5, [1, 1, 1], 0.2);           // ember: the default gravity
    P.spawn(deep.x, deep.surf - 1, deep.z, 0, 0.8, 0, 5, [1, 1, 1], 0.2, -0.5);   // bubble: 1 m under the skin
    for (let i = 0; i < 20; i++) P.update(0.1, g.world);     // two seconds
    const out = {
      live: P.n, lake: deep,
      vy: [+P.vy[0].toFixed(2), +P.vy[1].toFixed(2), +P.vy[2].toFixed(2)],
      dy: [+(P.py[0] - (deep.surf - 4)).toFixed(2), +(P.py[1] - 40).toFixed(2), +(P.py[2] - 40).toFixed(2)],
      under: +(deep.surf - P.py[0]).toFixed(2)
    };
    P.n = n0;                                               // leave the pool as we found it
    return out;
  });
  check('the deep bubble, the mote and the ember are what is left after two seconds', part.live === 3, part);
  check('a bubble rises instead of sinking', part.vy[0] > 0.8 && part.dy[0] > 1, part);
  check('a mote hovers instead of sinking into the ground', Math.abs(part.vy[1]) < 0.31, part);
  check('an ember still falls', part.vy[2] < -2, part);
  check('a bubble pops at the surface of the lake it was born in, instead of floating away through the open air',
    part.live === 3 && part.under > 0.5, part);

  // 10e. dying ends the tick: the fall must not overwrite the respawn point
  const death = await step('deathEndsTheTick', () => {
    const g = window.game, p = g.player;
    const was = { x: p.x, y: p.y, z: p.z, form: p.form, formT: p.formT, formMax: p.formMax, vital: p.vital };
    window.ui.showCellar(false);          // an earlier step left a panel open
    g.mode = 'play';                      // the player only moves in play mode
    g.inv.length = 0;
    p.form = 'owlberry'; p.formT = 999; p.formMax = 999; p.vital = 1;
    p.x = 8; p.y = -3; p.z = 8; p.vx = 0; p.vy = -20; p.vz = 0;   // under the world
    g.update(0.05);
    const s = g.cellar();
    const out = {
      mode: g.mode, form: p.form, vital: +p.vital.toFixed(2), deaths: g.stats.deaths,
      at: [Math.round(p.x), Math.round(p.y), Math.round(p.z)],
      want: [s.x + 2, s.y + 1, s.z + 2],
      airborne: p.y > 25, vy: +p.vy.toFixed(2)
    };
    window.ui.showDead(false);
    Object.assign(p, { x: was.x, y: was.y, z: was.z, form: was.form, formT: was.formT, formMax: was.formMax, vital: was.vital, vx: 0, vy: 0, vz: 0 });
    g.mode = 'play'; g.player.dead = false;
    return out;
  });
  check('death clears the form and revives at full vitality', death.form === null && death.vital === 5, death);
  check('the body is back at the town cellar', death.at.join(',') === death.want.join(','), death);
  check('the fall did not leave them at y=30 above the roof', death.airborne === false, death);

  // 10f. an open storage panel is built when it changes, not on every frame
  const still = await step('cellarPanelStaysStill', () => {
    const g = window.game;
    window.ui.showCellar(false); g.mode = 'play';
    g.inv.length = 0;
    g.addItem('fruit', 'owlberry', 100);
    g.openStashUI(g.stashes[0]);
    const node = document.getElementById('packItems');
    let mutations = 0;
    const obs = new MutationObserver(() => mutations++);
    obs.observe(node, { childList: true, subtree: true, characterData: true });
    return new Promise(res => {
      let n = 0;
      const tick = () => {
        if (++n < 40) return requestAnimationFrame(tick);
        obs.disconnect();
        const quiet = mutations;
        g.addItem('fruit', 'frogpear', 100);                    // now change one thing
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const shelf = node.children.length;
          window.ui.showCellar(false); g.mode = 'play';
          res({ frames: n, mutations: quiet, packNow: shelf });
        }));
      };
      requestAnimationFrame(tick);
    });
  });
  check('an open storage panel is not rebuilt while nothing changes', still.mutations === 0, still);
  check('it is rebuilt as soon as the backpack changes', still.packNow === 2, still);

  // 10g. the main verb of the game: look at a thing, use it. The cellar crate is
  // the one block the game asks about by what it is for ("can I store things in
  // this?") rather than by its number, so this is what proves that wiring works.
  const crate = await step('lookAndUseCrate', () => {
    const g = window.game, W = g.world, N = window.FRUTARIA, ID = N.BLOCK_ID;
    const p = g.player;
    const was = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch };
    const crowd = g.creatures;
    window.ui.showCellar(false); g.mode = 'play'; g.openStash = null; g.player.dead = false;
    g.creatures = [];                                   // nothing to observe instead
    const crates = [];
    for (let y = 1; y < W.h; y++) for (let z = 0; z < W.d; z++) for (let x = 0; x < W.w; x++)
      if (W.get(x, y, z) === ID.cellarCrate) crates.push({ x, y, z });
    let seen = null;
    for (const c of crates) {
      for (const [dx, dz] of [[2,0],[-2,0],[0,2],[0,-2],[2,2],[-2,2],[2,-2],[-2,-2],
                              [3,3],[-3,3],[3,-3],[-3,-3],[4,0],[0,4],[4,4],[-4,-4]]) {
        const px = c.x + 0.5 + dx, pz = c.z + 0.5 + dz, py = c.y;
        if (W.solidAt(px, py, pz) || W.solidAt(px, py + 1, pz) || !W.solidAt(px, py - 1, pz)) continue;
        // stand far enough back that the store itself is out of arm's reach:
        // only the block under the crosshair can answer now
        if (g.stashes.some(s => Math.hypot(s.x + 0.5 - px, s.y + 1 - py, s.z + 0.5 - pz) < 3.4)) continue;
        p.x = px; p.y = py; p.z = pz;
        const ey = p.eyePos();
        const ex = c.x + 0.5 - px, ez = c.z + 0.5 - pz, eyy = c.y + 0.5 - ey;
        p.yaw = Math.atan2(ex, -ez);
        p.pitch = Math.atan2(eyy, Math.hypot(ex, ez));
        const t = g.rayTarget();
        if (t && t.x === c.x && t.y === c.y && t.z === c.z) { seen = { crate: c, from: [px, py, pz] }; break; }
      }
      if (seen) break;
    }
    if (!seen) { g.creatures = crowd; Object.assign(p, was); return { crates: crates.length, error: 'no crate in range' }; }
    g.update(0.016);
    const prompt = g.prompt;
    g.interact();
    const out = {
      crates: crates.length, at: seen.crate, from: seen.from,
      promptIsCellar: prompt === N.t('log.promptCellar'), prompt: prompt,
      mode: g.mode, open: g.openStash && g.openStash.id
    };
    window.ui.showCellar(false); g.mode = 'play'; g.openStash = null;
    g.creatures = crowd; Object.assign(p, was);
    return out;
  });
  check('a cellar crate was found to look at', crate.at !== undefined, crate);
  check('looking at a cellar crate asks you to open it', crate.promptIsCellar === true, crate);
  check('using it opens the store behind that crate', crate.mode === 'cellar' && crate.open === 'cellar', crate);

  // 10h. how a body moves is data: the owl crosses the valley at its flying
  // speed, a dusk animal keeps the dusk even when no animal in the valley does,
  // and a frog that wanders off hops back to its own kind
  const beasts = await step('creatureBehaviour', () => {
    const g = window.game, N = window.FRUTARIA, p = g.player;
    const was = { x: p.x, y: p.y, z: p.z, night: g.night };
    p.x = -999; p.y = 40; p.z = -999;                 // nobody within alert range
    /* A measured distance is only about the body if the body is the only thing
       that varies. So: the yaw is pre-aligned with the target (an animal turns
       at 4 rad/s, so a random starting heading spends most of a one-second run
       curving), and every run is over open water or through open air, where
       nothing can be in the way. */
    const run = (c, night) => {
      g.night = night;
      const dir = (c.x + 20 < g.world.w - 8) ? 20 : -20;
      c.tx = c.x + dir; c.tz = c.z; c.pause = 99; c.state = 'wander'; c.alarm = 0;
      c.yaw = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      const x0 = c.x, z0 = c.z;
      for (let i = 0; i < 60; i++) c.update(1 / 60, p, g.world, g);
      return +Math.hypot(c.x - x0, c.z - z0).toFixed(2);
    };
    /* Over the middle of the lake, where the air is open for 40 metres in every
       direction from 15 m up to 30 m: a flyer is not stopped by terrain. The spot
       used to be 78,22,106, which is the shaft of the tower that stands in the
       lake -- solid stone from 3 m to 22 m, with two more terraces at 29 and 36 --
       so the bird was measured flying through a wall, and the only reason it got
       through was that nothing about a flying body asked whether the place it was
       going was empty. */
    const owl = g.creatures.find(c => c.sp.id === 'owl');
    /* A body's own kind is an obstacle it goes round now, so how the valley
       happens to be crowded at this moment is part of how far a body gets in a
       second. These runs measure a body and the numbers its species names, and
       the step says they are over open water and through open air: so the
       valley's inhabitants are set aside for the length of them and put back
       after, or the crowd decides the measurement. */
    const crowd = g.creatures;
    g.creatures = [];
    const wasOwl = { x: owl.x, y: owl.y, z: owl.z, flyY: owl.flyY };
    owl.x = 62; owl.y = 20; owl.z = 88; owl.flyY = 22;
    const out = { owlNight: run(owl, 1), owlNoon: run(owl, 0) };
    // 'dusk' is still part of the setting, so the branch stays covered even
    // though no animal in the valley uses it right now
    const dusk = new N.Creature(Object.assign({}, N.CREATURE_BY_ID.owl, { active: 'dusk' }), 62, 20, 88);
    dusk.flyY = 22;
    out.duskNoon = run(dusk, 0); out.duskDusk = run(dusk, 0.6);
    Object.assign(owl, wasOwl);
    // the herd: a synthetic one over open water, so the only thing that moves is
    // the straggler going back to the middle of its own kind
    const h = { x: 78, z: 106, n: 3 };
    g.herdCentres.frog = h;
    const straggler = new N.Creature(N.CREATURE_BY_ID.frog, 98, 10, 106);
    straggler.state = 'wander'; straggler.pause = 99; straggler.tx = 98; straggler.tz = 106;
    straggler.yaw = -Math.PI / 2;                     // pointing at the middle
    g.night = 0.5;
    const before = +Math.hypot(straggler.x - h.x, straggler.z - h.z).toFixed(1);
    // three seconds: a frog swims at 4.6 m/s and only 42% of that while strolling
    for (let i = 0; i < 180; i++) straggler.update(1 / 60, p, g.world, g);
    out.herd = { before, after: +Math.hypot(straggler.x - h.x, straggler.z - h.z).toFixed(1) };
    // and the proof that none of this is keyed to a species name
    const ghost = new N.Creature(Object.assign({}, N.CREATURE_BY_ID.owl, { locomotion: 'walk' }), 80, 30, 80);
    const wings = new N.Creature(Object.assign({}, N.CREATURE_BY_ID.frog, { locomotion: 'fly' }), 80, 30, 80);
    g.creatures = crowd;
    out.flyFromData = wings.isFlyer() === true && ghost.isFlyer() === false;
    g.night = was.night; Object.assign(p, was);
    return out;
  });
  check('an owl crosses the valley at its flying speed, not its walking speed', beasts.owlNight > 2.6 && beasts.owlNight < 3.2, beasts);
  check('an owl sleeps through the day', beasts.owlNoon === 0, beasts);
  check('a dusk animal is asleep at noon and abroad at dusk', beasts.duskNoon === 0 && beasts.duskDusk > 2.6, beasts);
  check('a frog that wanders off hops back to the herd', beasts.herd.after < beasts.herd.before - 3, beasts.herd);
  check('flying comes from the body, not from the species name', beasts.flyFromData === true, beasts);

  /* 10i. the three abilities that used to be declared and inert: glide, night
     vision and the ridge cold. Each is measured against the body that does not
     have it, so what is being tested is the number in
     data/fruits.js and not a coincidence about one particular animal. */
  const glide = await step('glide', () => {
    const g = window.game, N = window.FRUTARIA, p = g.player;
    const was = { form: p.form, x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, vital: p.vital, grounded: p.grounded, air: p.air };
    // open air over Mirrorlake: nothing to fall onto inside the measurement
    const drop = (form) => {
      p.form = form; p.x = 66; p.y = 46; p.z = 118; p.vx = p.vy = p.vz = 0;
      p.grounded = false; p.vital = 5; p.air = p.maxAir(); p.dry = 0; p.wasCold = false;
      for (let i = 0; i < 72; i++) p.update(1 / 60, {}, g);      // 1.2 s
      return { vy: +p.vy.toFixed(2), fell: +(46 - p.y).toFixed(1) };
    };
    const owl = drop('owlberry');
    const human = drop(null);
    Object.assign(p, was);
    return { owl, human, cap: -42 * N.FRUIT_BY_ID.owlberry.form.glide };
  });
  check('an owl that stops flapping comes down instead of hanging in the air', glide.owl.fell > 5, glide.owl);
  check('glide caps the fall at the speed the data promises', Math.abs(glide.owl.vy - glide.cap) < 0.5, glide);
  check('a human keeps accelerating past that speed', glide.human.vy < -25, glide.human);
  check('glide covers less ground per second of height', glide.owl.fell < glide.human.fell - 3, glide);

  const eyes = await step('nightVision', () => {
    const g = window.game, N = window.FRUTARIA, p = g.player;
    const was = { form: p.form, time: g.time, lastHour: g.lastHour };
    const at = (form, hour) => {
      g.time = hour / 24 * N.DAY_LEN;
      p.form = form;
      g.updateEnv();
      return { eye: +g.env.day.toFixed(3), sky: +g.daylight.toFixed(3), fogDen: +g.env.fogDen.toFixed(5) };
    };
    const out = {
      midnightHuman: at(null, 0), midnightOwl: at('owlberry', 0), midnightFrog: at('frogpear', 0),
      noonHuman: at(null, 12), noonOwl: at('owlberry', 12)
    };
    p.form = was.form; g.time = was.time; g.lastHour = was.lastHour; g.updateEnv();
    return out;
  });
  check('the same dark is much brighter for an owl', eyes.midnightOwl.eye > eyes.midnightHuman.eye + 0.2, eyes);
  check('a frog sees a little better in the dark, and less than an owl',
    eyes.midnightFrog.eye > eyes.midnightHuman.eye + 0.05 && eyes.midnightFrog.eye < eyes.midnightOwl.eye, eyes);
  check('the sky does not change because of the eye', eyes.midnightOwl.sky === eyes.midnightHuman.sky, eyes);
  check('daylight washes out an eye built for the dark', eyes.noonOwl.fogDen > eyes.noonHuman.fogDen, eyes);

  const cold = await step('ridgeCold', () => {
    const g = window.game, N = window.FRUTARIA, p = g.player;
    const was = { form: p.form, x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, vital: p.vital, wasCold: p.wasCold, air: p.air };
    const zc = N.ZONE_BY_ID.mountains;
    const gy = (x, zz) => { for (let y = g.world.h - 1; y >= 0; y--) if (g.world.solidAt(x, y, zz)) return y; return 1; };
    const stand = (form, x, zz) => {
      p.form = form; p.x = x + 0.5; p.z = zz + 0.5; p.y = gy(x, zz) + 1;
      p.vx = p.vy = p.vz = 0; p.vital = 5; p.wasCold = false; p.air = p.maxAir(); p.dry = 0;
      g.log.length = 0;                                            // the feed is capped at 40, so index math would drift
      for (let i = 0; i < 300; i++) p.update(1 / 60, {}, g);      // 5 s standing still
      return { y: +p.y.toFixed(1), vital: +p.vital.toFixed(2), announced: g.log.filter(l => l.text === N.t('log.coldIn')).length };
    };
    const on = [zc.cx + 7, zc.cz + 19];                            // a ridge column, well above the line
    const human = stand(null, on[0], on[1]);
    const bear = stand('bruinfig', on[0], on[1]);
    const off = stand(null, zc.cx, zc.cz + zc.r + 3);              // downhill, outside the ridge
    Object.assign(p, was);
    return { human, bear, off, cold: zc.cold, r: zc.r };
  });
  check('the test column really is above the cold line', cold.human.y > cold.cold.above, cold.human);
  check('the ridge takes vitality from a human', cold.human.vital < 5 - 0.1, cold.human);
  check('the cold announces itself once, not every frame', cold.human.announced === 1, cold.human);
  check('a bear body never feels it', cold.bear.vital === 5 && cold.bear.announced === 0, cold);
  check('outside the ridge, altitude alone does not bite', cold.off.vital === 5, cold.off);

  /* 10j. a hop is one event, not two stories. The body leaves the ground
     because the physics says so, and the animation reads the same numbers off
     it (airAmt / crouch / squash). The hopping body is measured against the
     body that does not hop, so what is being tested is the `hop` block in
     data/fruits.js and the one in data/creatures.js, not a coincidence about
     frogs. A gait is only measurable on ground that cannot interrupt it: a
     surface the same height all the way around (or the clearing found is a
     town roof and the body spends the run falling off it) with twenty metres
     of open corridor ahead and nothing solid for three blocks up -- longer than
     the three seconds of walking below can ever cover, or the body walks out of
     the clearing mid-run and what is measured is the terrain. */
  const gait = await step('gait', () => {
    const g = window.game, N = window.FRUTARIA, p = g.player;
    const was = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, vx: p.vx, vy: p.vy, vz: p.vz, form: p.form,
      vital: p.vital, fright: p.fright, air: p.air, dry: p.dry, grounded: p.grounded,
      airAmt: p.airAmt, squash: p.squash, crouch: p.crouch, hopT: p.hopT, wind: p.wind, night: g.night };
    p.vital = 10; p.fright = 0; p.dry = 0; g.night = 0;
    const TREE = { 6: 1, 7: 1, 8: 1, 9: 1, 22: 1, 27: 1, 28: 1 };
    const top = (x, z) => { for (let y = 46; y > 0; y--) if (g.world.solidAt(x, y, z)) return y; return -1; };
    const ground = (x, z) => {
      for (let y = 46; y > 0; y--) {
        const b = g.world.get(x, y, z);
        if (b && b < 40 && !TREE[b] && g.world.solidAt(x, y, z)) return y;
      }
      return -1;
    };
    let spot = null;
    /* The clearing has to be dry. `ground()` asks for a solid block and the floor
       of a lake is solid, so once the lake was widened and deepened the search
       found what it had always been asked for -- a sandy shelf flat for 20 columns
       -- 11 m under water, and the gait it then measured was a frog hopping on the
       bed of Mirrorlake. The first dry answer is (123,22,99). */
    for (let x = 24; x < 150 && !spot; x += 3) for (let z = 24; z < 150 && !spot; z += 3) {
      const gy = ground(x, z);
      if (gy < 0 || top(x, z) !== gy) continue;                       // nothing standing on it
      if (g.world.liquidSurfaceAt(x, z) >= 0) continue;               // the floor of a lake is not a clearing
      if (ground(x + 1, z) !== gy || ground(x - 1, z) !== gy ||
          ground(x, z + 1) !== gy || ground(x, z - 1) !== gy) continue;   // not the edge of a roof
      let open = true;
      for (let k = 1; k <= 20 && open; k++) {
        if (top(x, z - k) !== gy) { open = false; break; }
        if (g.world.liquidSurfaceAt(x, z - k) >= 0) { open = false; break; }
        for (let h = 1; h <= 3; h++) if (g.world.solidAt(x, gy + h, z - k)) { open = false; break; }
      }
      if (open) spot = { x: x + 0.5, y: gy + 1, z: z + 0.5 };
    }
    if (!spot) { Object.assign(p, was); return { error: 'no flat open clearing' }; }
    const walk = (form, secs) => {
      p.form = form; p.formT = 9999; p.formMax = 9999;
      p.x = spot.x; p.y = spot.y; p.z = spot.z; p.yaw = 0;
      p.vx = p.vy = p.vz = 0; p.grounded = false; p.air = p.maxAir();
      p.airAmt = 0; p.squash = 0; p.crouch = 0; p.hopT = 0; p.wind = 0;
      const inp = { fwd: true };
      for (let i = 0; i < 40; i++) p.update(1 / 60, inp, g);          // settle onto the surface
      const y0 = p.y, x0 = p.x, z0 = p.z;
      let apex = 0, arcs = 0, air = 0, up = false, crouch = 0, squash = 0;
      const n = Math.round(secs * 60);
      for (let i = 0; i < n; i++) {
        p.update(1 / 60, inp, g);
        apex = Math.max(apex, p.y - y0);
        crouch = Math.max(crouch, p.crouch); squash = Math.max(squash, p.squash);
        /* the grounded flag flickers for a frame at a time even on flat ground
           (gravity moves the body 0.006 m and nothing is collided with that
           frame), so "off the ground" here means actually above the surface */
        if (p.y > y0 + 0.06) { if (!up) { arcs++; up = true; } air++; } else up = false;
      }
      return { apex: +apex.toFixed(2), dist: +Math.hypot(p.x - x0, p.z - z0).toFixed(2),
        arcs, airPct: +(air / n * 100).toFixed(0), crouch: +crouch.toFixed(2), squash: +squash.toFixed(2) };
    };
    // one press of the jump key, from stillness: the arc the key is worth
    const jump = (form) => {
      p.form = form; p.formT = 9999; p.formMax = 9999;
      p.x = spot.x; p.y = spot.y; p.z = spot.z; p.yaw = 0;
      p.vx = p.vy = p.vz = 0; p.grounded = false; p.air = p.maxAir(); p.airAmt = 0; p.squash = 0;
      for (let i = 0; i < 40; i++) p.update(1 / 60, {}, g);
      const y0 = p.y;
      let apex = 0, hang = 0, off = false;
      for (let i = 0; i < 200; i++) {
        p.update(1 / 60, { jump: i === 0 }, g);
        if (p.y > y0 + 0.06) { off = true; hang += 1 / 60; }
        apex = Math.max(apex, p.y - y0);
        if (off && p.y <= y0 + 0.02) break;
      }
      return { apex: +apex.toFixed(2), hang: +hang.toFixed(2) };
    };
    const human = walk(null, 3), frog = walk('frogpear', 3);
    const jumpHuman = jump(null), jumpFrog = jump('frogpear');
    /* and the same for an animal: an amphibian used to have its height lerped
       onto the ground every frame, which pinned it there however it moved */
    const npc = g.creatures.find(c => c.sp.id === 'frog');
    const wasN = { x: npc.x, y: npc.y, z: npc.z, vy: npc.vy, state: npc.state, pause: npc.pause,
      tx: npc.tx, tz: npc.tz, yaw: npc.yaw, alarm: npc.alarm, airAmt: npc.airAmt, squash: npc.squash };
    const gy = ground(Math.floor(spot.x), Math.floor(spot.z));
    npc.x = spot.x; npc.z = spot.z; npc.y = gy + 1; npc.vy = 0;
    npc.state = 'wander'; npc.pause = 99; npc.tx = spot.x; npc.tz = spot.z - 12; npc.yaw = 0; npc.alarm = 0;
    const away = { x: -999, y: 0, z: -999, form: null, formDef: {} };
    let rise = 0, hops = 0, airF = 0, up = false, sq = 0;
    for (let i = 0; i < 240; i++) {
      npc.update(1 / 60, away, g.world, g);
      rise = Math.max(rise, npc.y - (gy + 1)); sq = Math.max(sq, npc.squash);
      if (npc.y > gy + 1.05) { if (!up) { hops++; up = true; } airF++; } else up = false;
    }
    const npcFrog = { rise: +rise.toFixed(2), hops, airPct: +(airF / 240 * 100).toFixed(0), squash: +sq.toFixed(2) };
    Object.assign(npc, wasN);
    // a bird on a branch is not in flight: the wings fold because it is standing
    const bird = g.creatures.find(c => c.sp.id === 'owl');
    const wasB = { x: bird.x, y: bird.y, z: bird.z, flyY: bird.flyY, state: bird.state, airAmt: bird.airAmt };
    g.night = 0;
    for (let i = 0; i < 60; i++) bird.update(1 / 60, away, g.world, g);
    /* The pose is eased, so the reading is a limit and not a switch: a bird that
       has been on its branch for a second holds its wings within a hundredth of
       folded, and a bird that has been in the air for a second and a half holds
       them within a hundredth of open. Asking for the exact 0 and 1 the flag used
       to answer with asks whether the easing exists, which is not the question. */
    const roost = bird.airAmt;
    /* One frame of night is not enough to judge the wings. The owl wakes, stands
       on the branch and only then decides to leave it, and how many frames that
       takes depends on where it happened to land and on the dice the wander roll
       throws: measured, the single frame left the bird still on the branch in 1
       run of 3, which is a test asking whether the owl had made up its mind yet
       rather than whether a bird in the air holds its wings open. */
    g.night = 1;
    let abroad = 0, airJump = 0, airWas = bird.airAmt;
    for (let i = 0; i < 180; i++) {
      bird.update(1 / 60, away, g.world, g);
      abroad = Math.max(abroad, bird.airAmt);
      // the biggest single frame's change in how much the air holds this body
      airJump = Math.max(airJump, Math.abs(bird.airAmt - airWas));
      airWas = bird.airAmt;
    }
    const npcOwl = { roost: +roost.toFixed(4), abroad: +abroad.toFixed(4),
      airJump: +airJump.toFixed(3), state: bird.state };
    Object.assign(bird, wasB);
    Object.assign(p, was);
    return { spot, human, frog, jumpHuman, jumpFrog, npcFrog, npcOwl, hop: N.FRUIT_BY_ID.frogpear.form.hop };
  });
  check('a flat open clearing was found to measure on', gait.spot !== undefined, gait);
  check('a frog crosses the ground in arcs, not in a slide', gait.frog.arcs >= 2 && gait.frog.apex > 0.8 && gait.frog.apex < 3, gait);
  check('the legs load before a hop and take the landing after it', gait.frog.crouch > 0.5 && gait.frog.squash > 0.02, gait.frog);
  check('a hop is not a discount on walking: it covers the same ground',
    Math.abs(gait.frog.dist - gait.human.dist) < 3, { frog: gait.frog.dist, human: gait.human.dist });
  check('a human does not hop', gait.human.arcs === 0 && gait.human.apex < 0.2, gait.human);
  check('the jump key is a hop and not a balloon',
    gait.jumpFrog.apex > gait.jumpHuman.apex && gait.jumpFrog.apex < 4 && gait.jumpHuman.apex < 2.5, gait);
  check('a frog in the valley leaves the ground', gait.npcFrog.rise > 0.3 && gait.npcFrog.hops >= 2, gait.npcFrog);
  check('an owl folds its wings on the branch and opens them in the air',
    gait.npcOwl.roost < 0.01 && gait.npcOwl.abroad > 0.99, gait.npcOwl);
  /* The bird does not change its whole posture in the frame it leaves the
     branch: the wings, the tucked legs and the length of the body all ride the
     same number, and a frame's worth of that number is what decides whether the
     animal takes off or teleports into its flight pose. Measured, the frame that
     the flag flipped in moved it the whole way -- 1.0 -- and the eased one moves
     it 0.117. */
  check('a bird coming off its branch takes its poses with it over the frames it is leaving',
    gait.npcOwl.airJump < 0.5, gait.npcOwl);

  /* 10k. the lens is the hand. The watching camera used to trail the aim, so
     while you were turning the mouse the body ran off in a direction the screen
     was not pointing at; and it was pulled in by sampling points along the line
     and stepping back a fixed 0.35 m from the first sample inside a block, which
     left it buried in a hillside. What must survive is the body's mass: the
     animal turns behind the lens, the lens does not turn behind the mouse. */
  const lens = await step('camera', () => {
    const g = window.game, N = window.FRUTARIA, p = g.player;
    const was = { tp: g.thirdPerson, input: g.input, frame: g._camFrame, camReady: g.camReady,
      x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, faceYaw: p.faceYaw,
      vx: p.vx, vy: p.vy, vz: p.vz, form: p.form, grounded: p.grounded };
    /* main.js captures game.input once and writes the keys into that object
       every frame, so handing the game a private input object here is what
       keeps the real main loop from overwriting the test's. */
    g.thirdPerson = true; p.form = null; p.vital = 10; p.fright = 0; p.air = p.maxAir();
    const crowd = g.creatures; g.creatures = [];   // an animal nearby would own the prompt and blank the box
    /* a wall to walk into, with a 12 m corridor in front of it: air at head
       height the whole way and solid floor the whole way. The floor matters --
       without it the body falls out of the test halfway through a run of
       updates and every number after that means nothing. */
    let wall = null;
    for (let x = 24; x < 150 && !wall; x++) for (let z = 24; z < 150 && !wall; z++)
      for (let y = 20; y < 34 && !wall; y++) {
        if (!g.world.solidAt(x, y, z) || !g.world.solidAt(x, y + 1, z)) continue;
        let clear = true;
        for (let k = 1; k <= 12 && clear; k++)
          if (!g.world.solidAt(x - k, y - 1, z) || g.world.solidAt(x - k, y, z) ||
              g.world.solidAt(x - k, y + 1, z) || g.world.liquidAt(x - k, y, z)) clear = false;
        if (clear) wall = { x, y, z };
      }
    if (!wall) { Object.assign(p, was); g.thirdPerson = was.tp; g.input = was.input; g.creatures = crowd; return { error: 'no wall found' }; }
    const stand = (yaw, pitch, x, z, y) => {
      p.x = x; p.y = y; p.z = z; p.yaw = yaw; p.pitch = pitch; p.faceYaw = yaw;
      p.vx = p.vy = p.vz = 0; p.grounded = false; g.camReady = false;
    };
    const out = { wall };
    // a continuous mouse turn: the lens stays exactly on the aim, the body does not
    g.input = { fwd: true };
    stand(Math.PI / 2, -0.1, wall.x - 6, wall.z + 0.5, wall.y);
    for (let i = 0; i < 40; i++) g.update(1 / 60);
    let lensLag = 0, bodyLag = 0;
    for (let i = 0; i < 40; i++) {
      p.yaw += 0.05;                                   // 3 rad/s of mouse
      g.update(1 / 60);
      lensLag = Math.max(lensLag, Math.abs(N.angleDelta(p.yaw, g._camFrame.yaw)));
      bodyLag = Math.max(bodyLag, Math.abs(N.angleDelta(p.yaw, p.faceYaw)));
    }
    out.turn = { lensLag: +lensLag.toFixed(4), bodyLag: +bodyLag.toFixed(3) };
    g.input = {};                       // from here on the body stands still
    /* Pressed against a wall and looking away from it: the lens belongs on the
       far side of the stone, so every pitch has to pull it in, and it must never
       end up inside a block. Facing the wall instead leaves 12 m of corridor
       behind the body -- that is the shot that must stay its full length. */
    out.pressed = [];
    for (const pitch of [-1.2, -0.4, 0, 0.6, 1.2]) {
      stand(-Math.PI / 2, pitch, wall.x - 0.6, wall.z + 0.5, wall.y);
      for (let i = 0; i < 40; i++) g.update(1 / 60);
      const c = g._camFrame;
      out.pressed.push({ pitch, d: +c.d.toFixed(2), inSolid: g.world.solidAt(Math.floor(c.x), Math.floor(c.y), Math.floor(c.z)) });
    }
    stand(Math.PI / 2, 0, wall.x - 6, wall.z + 0.5, wall.y);
    for (let i = 0; i < 40; i++) g.update(1 / 60);
    out.free = +g._camFrame.d.toFixed(2);
    // the picking ray is the lens ray: recompute it here and compare with the box
    g.input = {};
    stand(Math.PI / 2, 0, wall.x - 4, wall.z + 0.5, wall.y);
    for (let i = 0; i < 40; i++) g.update(1 / 60);
    const c = g._camFrame, cp = Math.cos(p.pitch), sp = Math.sin(p.pitch);
    const dx = Math.sin(p.yaw) * cp, dy = sp, dz = -Math.cos(p.yaw) * cp;
    const back = Math.hypot(c.x - p.x, c.y - p.eyePos(), c.z - p.z);
    const want = g.world.raycast(c.x, c.y, c.z, dx, dy, dz, back + 5.5);
    out.ray = { want: want && [want.x, want.y, want.z], hover: g.hover && [g.hover.x, g.hover.y, g.hover.z] };
    g.thirdPerson = false; g.input = {};
    stand(Math.PI / 2, 0, wall.x - 4, wall.z + 0.5, wall.y);
    for (let i = 0; i < 40; i++) g.update(1 / 60);
    const c1 = g._camFrame;
    const want1 = g.world.raycast(p.x, p.eyePos(), p.z, dx, dy, dz, 5.5);
    out.rayFirst = { want: want1 && [want1.x, want1.y, want1.z], hover: g.hover && [g.hover.x, g.hover.y, g.hover.z],
      d: +c1.d.toFixed(2) };
    Object.assign(p, was); g.thirdPerson = was.tp; g.input = was.input; g._camFrame = was.frame; g.camReady = was.camReady; g.creatures = crowd;
    return out;
  });
  check('the lens never trails the mouse', lens.turn && lens.turn.lensLag === 0, lens.turn);
  check('the body still turns behind the lens, with mass', lens.turn && lens.turn.bodyLag > 0.3, lens.turn);
  check('a lens pressed against a wall is pulled in, not buried',
    lens.pressed && lens.pressed.every(c => !c.inSolid) && lens.pressed.every(c => c.d < 2), lens.pressed);
  check('clear air behind the body keeps the shot its full length', lens.free > 5, lens.free);
  check('the highlight box is the block under the crosshair',
    lens.ray && lens.ray.want && JSON.stringify(lens.ray.want) === JSON.stringify(lens.ray.hover), lens.ray);
  check('in first person the crosshair is the eye',
    lens.rayFirst && lens.rayFirst.want && JSON.stringify(lens.rayFirst.want) === JSON.stringify(lens.rayFirst.hover), lens.rayFirst);
  check('first person has no lens behind the head to pull in', lens.rayFirst && lens.rayFirst.d === 0, lens.rayFirst);

  /* 10l. a body change cannot leave you inside the world. `axis` stops a body
     entering a solid; it has no opinion about one that already is, and a body
     that overlaps a solid cannot move at all -- every direction it tries still
     hits, so the run is over. Two ways in: eating a body too big for the room
     you are standing in, and coming back to a human body in a gap only a frog
     fits. The first can be refused before the fruit is spent; the second cannot
     (the timer does not ask), so the body is lifted out instead. */
  const fit = await step('bodyFits', () => {
    const g = window.game, N = window.FRUTARIA, p = g.player, W = g.world;
    const home = { x: p.x, y: p.y, z: p.z, inv: g.inv.slice() };
    // a column with four blocks of clear air over the ground: somewhere to build
    let cx = 0, cz = 0, gy = 0, found = false;
    for (let r = 0; r < 70 && !found; r++)
      for (let dx = -r; dx <= r && !found; dx++)
        for (let dz = -r; dz <= r && !found; dz++) {
          const x = Math.floor(home.x) + dx, z = Math.floor(home.z) + dz;
          let y = -1;
          for (let yy = W.h - 1; yy >= 0; yy--) if (W.solidAt(x, yy, z)) { y = yy; break; }
          if (y < 1 || y > W.h - 6) continue;
          let open = true;
          for (let h = 1; h <= 4; h++) if (W.get(x, y + h, z) !== 0) { open = false; break; }
          // far enough from every existing tree that (c) can build here
          for (const s of g.stashes) if (s.kind === 'tree' && Math.hypot(x - s.x, z - s.z) < 21) { open = false; break; }
          if (!open) continue;
          cx = x; cz = z; gy = y; found = true;
        }
    if (!found) return { error: 'no open column to build in' };
    const roofWas = W.get(cx, gy + 2, cz);
    W.set(cx, gy + 2, cz, 3);                       // stone roof: a one-metre gap
    p.form = null; p.formT = 0; p.vx = p.vy = p.vz = 0;
    p.x = cx + 0.5; p.z = cz + 0.5; p.y = gy + 1.0005;
    const out = { at: [cx, gy, cz] };

    // (a) the body that does not fit is refused, and the fruit is not spent
    g.inv.length = 0; g.addItem('fruit', 'bruinfig');
    g.eat('bruinfig', 0);
    const wornAfterEat = p.form;
    p.form = 'bruinfig';
    const bearFits = !p.hits(p.x, p.y, p.z);
    p.form = null;
    out.refused = {
      form: wornAfterEat, inv: g.inv.length, bearFits,
      line: g.log.slice(-4).map(l => l.text)
        .includes(N.t('log.noRoomForm', { f: N.disp(N.FRUIT_BY_ID.bruinfig.form) }))
    };

    // (b) the body that ends inside the gap is not left buried
    g.inv.length = 0; g.addItem('fruit', 'frogpear');
    g.eat('frogpear', 0);
    out.frogIn = { form: p.form, y: +p.y.toFixed(2), fits: !p.hits(p.x, p.y, p.z) };
    const was = { x: p.x, y: p.y, z: p.z };
    g.revert('test');
    out.outOfGap = {
      y: +p.y.toFixed(2), rose: +(p.y - was.y).toFixed(2),
      slid: +Math.hypot(p.x - was.x, p.z - was.z).toFixed(2),
      fits: !p.hits(p.x, p.y, p.z)
    };
    const here = { x: p.x, z: p.z };
    let free = 0;
    for (const d of [[0.2, 0], [-0.2, 0], [0, 0.2], [0, -0.2]]) {
      if (!p.axis('x', d[0]) && !p.axis('z', d[1])) free++;
      p.x = here.x; p.z = here.z;
    }
    out.canMove = free;

    // (c) a tree planted at your own feet is planted beside you, not inside you
    W.set(cx, gy + 2, cz, roofWas);
    p.x = cx + 0.5; p.z = cz + 0.5; p.y = gy + 1.0005;
    const treesBefore = g.stashes.filter(s => s.kind === 'tree').length;
    const at = { x: p.x, z: p.z };
    g.buildCellarTree();
    out.treeAtYourFeet = {
      grew: g.stashes.filter(s => s.kind === 'tree').length === treesBefore + 1,
      fits: !p.hits(p.x, p.y, p.z),
      slid: +Math.hypot(p.x - at.x, p.z - at.z).toFixed(2)
    };

    p.form = null; p.formT = 0;
    p.x = home.x; p.y = home.y; p.z = home.z;
    g.inv.length = 0; for (const it of home.inv) g.inv.push(it);
    return out;
  });
  check('a body too big for the room is refused', fit.refused && fit.refused.form === null && fit.refused.inv === 1, fit.refused);
  check('the refusal is about the box, not about the fruit', fit.refused && fit.refused.bearFits === false, fit.refused);
  check('the valley says why', fit.refused && fit.refused.line, fit.refused);
  check('a body that does fit is still eaten', fit.frogIn && fit.frogIn.form === 'frogpear' && fit.frogIn.fits, fit.frogIn);
  check('a body that ends inside the world gets out of it',
    fit.outOfGap && fit.outOfGap.fits && (fit.outOfGap.slid > 0 || fit.outOfGap.rose > 0), fit.outOfGap);
  check('and it can move again', fit.canMove >= 3, fit);
  check('a cellar tree planted at your feet is planted beside you',
    fit.treeAtYourFeet && fit.treeAtYourFeet.grew && fit.treeAtYourFeet.fits && fit.treeAtYourFeet.slid > 0, fit.treeAtYourFeet);

  /* 10m. the lake has a colour from the shore. The lake is not a sheet of
     coloured glass laid over the frame: it is a law the light obeys on its way
     through it, and what the frame shows is the lakebed seen through that law.
     Nothing else in the build can see it either -- every other test reads the
     world, and this one has to read the frame -- so the control is the same lens
     with nothing the water does left anywhere in the frame: the absorption, the
     haze, the colour the water scatters back into the ray and the surface
     itself, all taken away, which is the lakebed as dry sand. The two frames
     must differ, over a tenth of the picture, and differ in the direction of the
     water's own blue: some 49,500 pixels of the frame, 47,200 of them bluer than
     red with the water and not without it. */
  const frame = await step('lakeHasColour', () => {
    const g = window.game, W = g.world, R = g.R, p = g.player, gl = R.gl;
    const was = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, vy: p.vy, form: p.form,
      time: g.time, mode: g.mode, frame: g._camFrame };
    // high above the south rim, looking down at the water: the lens is outside
    // the lake, which is the whole point of the shot
    p.form = null; p.x = 66.5; p.y = 40; p.z = 95.5; p.vy = 0; p.yaw = Math.PI; p.pitch = -0.7;
    g.mode = 'play'; g.time = 210; g.updateEnv();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const grab = () => { const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
    g._camFrame = null; g.render();
    const wet = grab();
    const off = [];
    for (let ci = 0; ci < W.chunks.length; ci++) { const m = W.chunks[ci]; if (m && m[2]) { off.push([ci, m[2].count]); m[2].count = 0; } }
    const envWas = { liqK: g.env.liqK, hazeK: g.env.hazeK, hazeOn: g.env.hazeOn,
      inWater: g.env.inWater, veil: g.env.veil };
    // the bed as dry sand: the law, the haze, the veil and the surface all gone
    g.env.liqK = [0, 0, 0]; g.env.hazeK = [0, 0, 0]; g.env.hazeOn = 0;
    g.env.inWater = 0; g.env.veil = [0, 0, 0];
    g._camFrame = null; g.render();
    const dry = grab();
    Object.assign(g.env, envWas);
    for (const [ci, c] of off) W.chunks[ci][2].count = c;
    let changed = 0, bluer = 0;
    const over = [];
    for (let i = 0; i < wet.length; i += 4) {
      const d = Math.abs(wet[i] - dry[i]) + Math.abs(wet[i + 1] - dry[i + 1]) + Math.abs(wet[i + 2] - dry[i + 2]);
      if (d <= 6) continue;
      changed++;
      over.push(i);
      if (wet[i + 2] - wet[i] > 20 && dry[i + 2] - dry[i] <= 20) bluer++;
    }
    /* What the water leaves of the bed's own colour. The bed is sand, and a
       sand's identity is in its red; the lake's law eats red nine times faster
       than it eats blue. Over the pixels the water covers, the mean of each
       channel in the wet frame against the same channel in the dry one: at this
       lens the red falls to 0.17 of what it is dry, the green to 0.45 and the
       blue keeps 0.711. A tint painted over the frame would take the same
       fraction off every
       channel, and the lake does not -- that is the difference between water and
       shade. The old test asked the other question, how much of the bed's own
       spread survives the surface, and it meant nothing at the time: the lake
       was an aquarium, the surface put as much variation into the picture -- its
       own reflection, its own in-scattering -- as the water took out, and at a
       lens 5 m over a 3 m shelf the wet frame was 2.7 times as varied as the dry
       bed under it. Ask the same question with the row eating at the rate it
       eats now and it is the question that decides whether a lake hides its
       floor: that is `aLakeHidesItsBedFromItsBank`, and it is measured against
       the same bed with nothing the water does left in the frame. */
    let rW = 0, rD = 0, bW = 0, bD = 0;
    for (const i of over) { rW += wet[i]; rD += dry[i]; bW += wet[i + 2]; bD += dry[i + 2]; }
    const redRatio = +(rW / rD).toFixed(3), blueRatio = +(bW / bD).toFixed(3);
    // the water pass is still one blended draw per chunk, not one per block
    const waterTris = W.chunks.reduce((a, m) => a + (m && m[2] ? m[2].count / 3 : 0), 0);
    g._camFrame = null; g.render();
    p.x = was.x; p.y = was.y; p.z = was.z; p.yaw = was.yaw; p.pitch = was.pitch; p.vy = was.vy;
    p.form = was.form; g.time = was.time; g.mode = was.mode; g._camFrame = was.frame;
    return { px: w * h, changed, bluer, share: +(changed / (w * h)).toFixed(3), waterTris,
      redRatio, blueRatio,
      red: { wet: +(rW / over.length).toFixed(1), dry: +(rD / over.length).toFixed(1) },
      blue: { wet: +(bW / over.length).toFixed(1), dry: +(bD / over.length).toFixed(1) } };
  });
  check('the lake is drawn at all', frame.waterTris > 1000, frame);
  check('the water changes the frame from outside the lake', frame.changed > 5000, frame);
  check('and it changes it towards the colour of water', frame.bluer > 5000, frame);
  check('the water eats the bed\'s red and lets its blue through: the lake is not a shade laid over the ground',
    frame.redRatio < 0.45 && frame.blueRatio > 0.6, frame);

  /* 10m2. a lake is a mirror from the bank and a window from a boat. One column
     of lake with open water ahead of it, three metres of sand under the lens,
     and two lenses 30 cm above its surface: one looking almost along the water,
     one straight down on it. Fresnel says the grazing lens has most of its view
     thrown back -- and at noon the brightest thing in the valley is the sky --
     while the steep one lets nearly all of it through to the bed, which is the
     darkest thing there. Measured over the pixels the water covers: 101.2
     against 77.7, and the grazing frame is the bluer of the two, 125.3 against
     93. The dry bed under the same two lenses hardly cares which way the lens
     points -- 169.7 against 166.9, blue 126.2 against 121.2 -- which is what a
     floor does and a surface does not. */
  const mirror = await step('lakeMirrorsTheSky', () => {
    const g = window.game, N = window.FRUTARIA, W = g.world, gl = g.R.gl, p = g.player;
    const was = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, vx: p.vx, vy: p.vy, vz: p.vz,
      form: p.form, tp: g.thirdPerson, time: g.time, mode: g.mode, frame: g._camFrame,
      herd: g.creatures, drops: g.drops, lens: g._lens };
    /* the shelf has to have open water ahead of it: the grazing lens looks along
       the lake, and a lens looking into the far shore measures the shore.
       And the film has to be the lake's own surface. The keep's island is a slab
       that starts at y6, so under its rim the water is a 2 m pocket with the wall
       standing on top of it, and a lens 30 cm above that pocket is inside the
       wall: the search used to land on (78,93) and both frames came back from
       inside stone. With the surface asked for at y14 the shelf is (46,113). */
    let col = null;
    for (let z = 74; z < 140 && !col; z++) for (let x = 46; x < 112; x++) {
      let top = -1;
      for (let y = W.h - 1; y >= 0; y--) if (W.liquidAt(x, y, z)) { top = y; break; }
      if (top < 0 || top !== N.WORLD.sea) continue;
      let bed = -1;
      for (let y = top; y >= 0; y--) if (W.solidAt(x, y, z)) { bed = y; break; }
      if (bed >= 0 && top + 1 - bed === 3 && W.liquidSurfaceAt(x, z - 15) >= 0) {
        col = { x: x + 0.5, z: z + 0.5, surf: top + 1, bed }; break;
      }
    }
    if (!col) {
      Object.assign(p, { x: was.x, y: was.y, z: was.z, yaw: was.yaw, pitch: was.pitch, form: was.form });
      g.creatures = was.herd; g.drops = was.drops;
      return { error: 'no three-metre shelf with open water ahead of it in the lake' };
    }
    p.form = null; g.mode = 'play'; g.thirdPerson = false;
    g.time = N.DAY_LEN * (13 / 24);
    g.creatures = []; g.drops = [];
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const grab = () => { const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
    const wet = (pitch) => {
      const eyeOff = p.eyePos() - p.y;
      p.x = col.x; p.y = col.surf + 0.3 - eyeOff; p.z = col.z; p.vx = p.vy = p.vz = 0;
      p.yaw = 0; p.pitch = pitch;
      g.updateEnv(); g._camFrame = null; g.render();
      return grab();
    };
    // the same lens with nothing the water does left anywhere: the bed with no
    // lake standing on it, which is what the surface is compared against
    const dry = () => {
      const off = [];
      for (let ci = 0; ci < W.chunks.length; ci++) {
        const m = W.chunks[ci];
        if (m && m[2]) { off.push([ci, m[2].count]); m[2].count = 0; }
      }
      const envWas = { liqK: g.env.liqK, hazeK: g.env.hazeK, hazeOn: g.env.hazeOn,
        inWater: g.env.inWater, veil: g.env.veil };
      g.env.liqK = [0, 0, 0]; g.env.hazeK = [0, 0, 0]; g.env.hazeOn = 0;
      g.env.inWater = 0; g.env.veil = [0, 0, 0];
      g._camFrame = null; g.render();
      const px = grab();
      Object.assign(g.env, envWas);
      for (const [ci, c] of off) W.chunks[ci][2].count = c;
      return px;
    };
    const pair = (pitch) => {
      /* the lens put where this pair is taken, then the same lens with the water
         taken out of the frame, then the water back: the dry frame is the one
         that has to be taken apart and put back, so the measured frame is drawn
         after it, not before */
      wet(pitch);
      const b = dry();
      const a = wet(pitch);
      const over = [];
      for (let i = 0; i < a.length; i += 4) {
        const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
        if (d > 6) over.push(i);
      }
      const mean = (px, ch) => { let s = 0; for (const i of over) s += px[i + ch]; return +(s / over.length).toFixed(1); };
      const lum = (px) => { let s = 0; for (const i of over) s += px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11; return +(s / over.length).toFixed(1); };
      return { n: over.length, lum: lum(a), dryLum: lum(b), red: mean(a, 0), dryRed: mean(b, 0),
        blue: mean(a, 2), dryBlue: mean(b, 2) };
    };
    const graze = pair(-0.02), steep = pair(-1.2);
    g._camFrame = null; g.render();
    Object.assign(p, { x: was.x, y: was.y, z: was.z, yaw: was.yaw, pitch: was.pitch,
      vx: was.vx, vy: was.vy, vz: was.vz, form: was.form });
    g.thirdPerson = was.tp; g.time = was.time; g.mode = was.mode; g._camFrame = was.frame;
    g.creatures = was.herd; g.drops = was.drops; g._lens = was.lens;
    return { col, graze, steep };
  });
  check('the same water, seen along its surface, is brighter than seen straight down on it: the face throws the sky back',
    !mirror.error && mirror.graze.lum > mirror.steep.lum + 10, mirror);
  check('and the grazing frame is the bluer of the two, which is the sky coming back and not the bed showing through',
    mirror.graze && mirror.steep && mirror.graze.blue > mirror.steep.blue + 10 &&
    mirror.graze.blue > mirror.graze.dryBlue - 8 &&
    mirror.graze.red < mirror.graze.dryRed * 0.5, mirror);

  /* 10n. the body faces the way it walks. Models are authored facing +Z (the
     human's eyes and nose sit at +Z, its hair at -Z) while a heading of `yaw`
     means the direction (sin yaw, -cos yaw), so the rotation that carries +Z
     onto a heading is PI - yaw. Every call site used `yaw + PI` instead, which
     is exact only when heading due north or due south and mirrors the body
     about the Z axis everywhere else: seen from behind, a body walking east
     showed its face. Nothing else in the build can see this -- the `camera`
     step's angle checks compare numbers, and a mirrored model has the same
     numbers. So this reads the frame: stand the body at each of the four
     cardinal headings with the lens behind it, project the head to the screen,
     and the patch of pixels there has to be hair, not a face. */
  const facing = await step('bodyFacesItsWalk', () => {
    const g = window.game, N = window.FRUTARIA, p = g.player, R = g.R, gl = R.gl;
    const was = { tp: g.thirdPerson, x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, faceYaw: p.faceYaw,
      form: p.form, time: g.time, mode: g.mode, hover: g.hover, creatures: g.creatures, frame: g._camFrame,
      camD: g.cam.d, camFov: g.cam.fov, camReady: g.camReady };
    // (a) the rotation itself: the image of local +Z must be the heading
    const unit = [];
    for (const y of [0, 0.7, Math.PI / 2, Math.PI, -2.2]) {
      const m = N.M4.create(); N.M4.faceY(m, y);
      unit.push({ y: +y.toFixed(2), dx: +(m[8] - Math.sin(y)).toFixed(4), dz: +(m[10] + Math.cos(y)).toFixed(4) });
    }
    // (b) a clearing with clear air in all four directions: the lens must not be
    // pulled in by a wall, or what is measured is the wall
    g.thirdPerson = true; p.form = null; p.vital = 10; p.fright = 0;
    g.mode = 'play'; g.time = 210; g.hover = null; g.creatures = [];
    const TREE = { 6: 1, 7: 1, 8: 1, 9: 1, 22: 1, 27: 1, 28: 1 };
    const floorAt = (x, z) => { for (let y = 46; y > 0; y--) { const b = g.world.get(x, y, z); if (b && b < 40 && !TREE[b] && g.world.solidAt(x, y, z)) return y; } return -1; };
    let spot = null;
    for (let x = 26; x < 148 && !spot; x += 2) for (let z = 26; z < 148 && !spot; z += 2) {
      const gy = floorAt(x, z);
      if (gy < 2) continue;
      let open = true;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        for (let k = 1; k <= 5 && open; k++) {
          const xx = x + dx * k, zz = z + dz * k;
          // floor at the same height, then two blocks of air: gy is the ground
          // block itself, the body stands on top of it at gy + 1
          if (!g.world.solidAt(xx, gy, zz) || g.world.solidAt(xx, gy + 1, zz) ||
              g.world.solidAt(xx, gy + 2, zz) || g.world.liquidAt(xx, gy + 1, zz)) open = false;
        }
      }
      if (open) spot = { x: x + 0.5, y: gy + 1, z: z + 0.5 };
    }
    if (!spot) { Object.assign(g, { creatures: was.creatures }); return { unit, error: 'no clearing clear on all four sides' }; }
    p.x = spot.x; p.y = spot.y; p.z = spot.z;
    p.vx = p.vy = p.vz = 0; p.pitch = 0; p.bank = 0; p.squash = 0; p.crouch = 0; p.airAmt = 0; p.moveAmt = 0;
    g.camReady = true; g.cam.d = 4; g.cam.fov = 68;
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const sc = p.bodyScale();
    const proj = (x, y, z) => {
      const v = R.view, q = R.proj;
      const vx = v[0] * x + v[4] * y + v[8] * z + v[12];
      const vy = v[1] * x + v[5] * y + v[9] * z + v[13];
      const vz = v[2] * x + v[6] * y + v[10] * z + v[14];
      const cx = q[0] * vx + q[4] * vy + q[8] * vz + q[12];
      const cy = q[1] * vx + q[5] * vy + q[9] * vz + q[13];
      const cw = q[3] * vx + q[7] * vy + q[11] * vz + q[15];
      return [(cx / cw * 0.5 + 0.5) * W, (1 - (cy / cw * 0.5 + 0.5)) * H];
    };
    const px = new Uint8Array(W * H * 4);
    // the skull is 2.6 model units wide, so a 20 px box around its centre is
    // head at any heading: the face is skin (#d8a884), the back of the head is hair (#33241d)
    const head = () => {
      const c = proj(p.x, p.y + 8.5 * sc, p.z);
      const x0 = Math.round(c[0]) - 10, y0 = Math.round(c[1]) - 10;
      let sum = 0, n = 0;
      for (let dy = 0; dy < 20; dy++) for (let dx = 0; dx < 20; dx++) {
        const X = x0 + dx, Y = y0 + dy;
        if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const i = (((H - 1 - Y) * W) + X) * 4;
        sum += px[i] + px[i + 1] + px[i + 2]; n++;
      }
      return { at: [Math.round(c[0]), Math.round(c[1])], lum: Math.round(sum / (3 * n)) };
    };
    const shoot = (yaw, faceYaw) => {
      p.yaw = yaw; p.faceYaw = faceYaw;
      g.updateEnv(); g._camFrame = g.shootCamera(p); g.render();
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return head();
    };
    const away = [], toward = [];
    for (const y of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      away.push(shoot(y, y));            // the lens is behind the body: it sees the back of the head
      toward.push(shoot(y, y + Math.PI)); // the body turns round: it sees a face
    }
    g.creatures = was.creatures; g.thirdPerson = was.tp; g.hover = was.hover; g.time = was.time; g.mode = was.mode;
    g._camFrame = was.frame; g.cam.d = was.camD; g.cam.fov = was.camFov; g.camReady = was.camReady;
    p.x = was.x; p.y = was.y; p.z = was.z; p.yaw = was.yaw; p.pitch = was.pitch; p.faceYaw = was.faceYaw; p.form = was.form;
    return { unit, spot, sc: +sc.toFixed(3), away, toward };
  });
  check('the model rotation carries +Z onto the heading',
    facing.unit && facing.unit.every(u => Math.abs(u.dx) < 1e-3 && Math.abs(u.dz) < 1e-3), facing.unit);
  check('the clearing is clear on all four sides', facing.spot !== undefined, facing);
  check('from behind, every heading shows the back of the head', facing.away && facing.away.every(v => v.lum < 45), facing);
  // A joint is lit as well as drawn (see docs 07), and a face is a stack of thin
  // plates hugging a skull, so a face now measures darker than it used to: hair
  // reads 30 and skin 61-66 (before the crease: hair 34, skin 69-78). The bounds
  // are cut off those numbers, not off each other - hair sits 15 below the line
  // at 45, skin sits at least 16 above it, and the front/back gap is 31 against
  // a bound of 20: what must not survive a change is the difference between the
  // two sides of the same head, which is the whole of what this step measures.
  check('turned round, every heading shows a face', facing.toward && facing.toward.every(v => v.lum > 45), facing);
  check('the two are the same body seen from two sides, not an empty frame',
    facing.away && facing.away.every((v, i) => facing.toward[i].lum - v.lum > 20), facing);

  /* 10o. glass is glass. The block table has always said glass is 34% opaque
     and the mesher put every glass face in the opaque mesh, so nothing ever
     read the number: the keep's greenhouse was a solid box with two fruit
     hanging inside it out of sight, and every window in Lanternrow was a wall.
     The rig is a 2x2 glass pane with a glowstone a metre behind it. A pane you
     can see through shows the lamp; a pane you cannot shows only itself. The
     third reading sets BLOCKS[21].opaque back to true and re-meshes, which is
     exactly how glass used to be built -- so the comparison is with the old
     render, not with an invented one. */
  const glass = await step('glassIsGlass', () => {
    const g = window.game, N = window.FRUTARIA, W = g.world, gl = g.R.gl;
    const p = g.player;
    const was = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, vy: p.vy, form: p.form,
      hover: g.hover, mode: g.mode, frame: g._camFrame, tp: g.thirdPerson,
      time: g.time, night: g.night };
    let spot = null;
    /* A clearing is ground, not foliage. The search asked for the topmost solid
       block and a crown is solid, so when the tree line moved it landed on the
       top of a tree at (20,34,39): the lamp behind the pane was lit from in front
       by the crown it was standing in, and the frame through the glass was 37
       brighter than the frame without it, not 40. */
    for (let x = 20; x < W.w - 12 && !spot; x++) for (let z = 20; z < W.d - 12 && !spot; z++) {
      let gy = -1;
      for (let y = W.h - 1; y >= 1; y--) if (W.solidAt(x, y, z)) { gy = y; break; }
      if (gy < 1 || N.TREE_BLOCK[W.get(x, gy, z)]) continue;
      let open = true;
      for (let dx = -3; dx <= 3 && open; dx++) for (let dz = -3; dz <= 3 && open; dz++)
        for (let h = 1; h <= 4; h++) if (W.solidAt(x + dx, gy + h, z + dz)) { open = false; break; }
      if (open) spot = { x, y: gy, z };
    }
    if (!spot) return {};
    const X = spot.x, Y = spot.y, Z = spot.z;
    /* The lens sits at Z-1.5 and yaw PI looks down +Z, so the pane has to be the
       nearer of the two: a lamp at Z+1 would sit between the lens and the glass
       and the frame would prove nothing about transparency. */
    const pane = [], lamp = [];
    for (const dy of [1, 2]) for (const dx of [0, 1]) {
      pane.push([X + dx, Y + dy, Z + 1]);
      lamp.push([X + dx, Y + dy, Z + 2]);
    }
    const undo = [];
    const put = (x, y, z, b) => { undo.push([x, y, z, W.get(x, y, z)]); W.set(x, y, z, b); };
    for (const [x, y, z] of pane) put(x, y, z, 21);   // 21 = glass
    for (const [x, y, z] of lamp) put(x, y, z, 14);   // 14 = glowstone
    const restore = () => { for (const [x, y, z, b] of undo) W.set(x, y, z, b); };
    const remesh = () => { for (let c = 0; c < W.cx * W.cz; c++) W.dirty[c] = 1; W.rebuildDirty(gl, 1e9); };
    const sample = () => {
      p.x = X + 0.5; p.y = Y + 1.0005; p.z = Z - 1.5; p.vx = p.vy = p.vz = 0;
      p.yaw = Math.PI; p.pitch = 0;                   // yaw PI faces +Z, straight at the pane
      g.hover = null; g.thirdPerson = false;
      g._camFrame = g.shootCamera(p); g.render();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let r = 0, gg = 0, b = 0, n = 0;
      for (let dy = -12; dy <= 12; dy++) for (let dx = -12; dx <= 12; dx++) {
        const PX = Math.floor(w / 2) + dx, PY = Math.floor(h / 2) + dy;
        const i = ((h - 1 - PY) * w + PX) * 4;
        r += px[i]; gg += px[i + 1]; b += px[i + 2]; n++;
      }
      return { r: +(r / n).toFixed(1), g: +(gg / n).toFixed(1), b: +(b / n).toFixed(1),
        lum: +((r / n) * 0.3 + (gg / n) * 0.59 + (b / n) * 0.11).toFixed(1) };
    };
    /* The hour is set rather than inherited. A glowstone has to be the brightest
       thing in the frame for the frame to say anything about the pane in front of
       it, and in daylight the valley is: the first clearing the search finds now
       that the tree line has moved is (20,24,121), open ground on the west side,
       and there, at whatever hour the suite happened to leave the valley in, the
       lamp through the glass read 157.5 against 126.2 for the same pane with
       nothing behind it -- 31 of a difference where this asks for 40, because the
       sun on the far bank was doing most of the lighting. At
       22:00 the lamp is the only thing carrying light through the pane. */
    g.time = N.DAY_LEN * (22 / 24); g.updateEnv();
    remesh();
    const through = sample();                         // the lamp, seen through the pane
    for (const [x, y, z] of lamp) W.set(x, y, z, 0);
    remesh();
    const empty = sample();                           // the same pane with nothing behind it
    restore();
    N.BLOCKS[21].opaque = true; remesh();             // how glass used to be built
    const solid = sample();
    N.BLOCKS[21].opaque = false;
    restore(); remesh();
    p.x = was.x; p.y = was.y; p.z = was.z; p.yaw = was.yaw; p.pitch = was.pitch; p.vy = was.vy;
    p.form = was.form; g.hover = was.hover; g.mode = was.mode; g.thirdPerson = was.tp; g._camFrame = was.frame;
    g.time = was.time; g.night = was.night;
    return { spot, through, empty, solid,
      showsThrough: +(through.lum - empty.lum).toFixed(1),
      differsFromSolid: +Math.abs(through.lum - solid.lum).toFixed(1),
      warm: +(through.r - through.b).toFixed(1), cold: +(empty.r - empty.b).toFixed(1) };
  });
  check('the clearing is clear on every side', glass.spot !== undefined, glass);
  check('a lamp behind glass is seen through it', glass.showsThrough > 40, glass);
  check('glass is not drawn as a solid block of itself', glass.differsFromSolid > 40, glass);
  check('what comes through the pane is the lamp, not the pane',
    glass.warm > 20 && glass.cold < 10, glass);

  /* 10p. the game opens on somewhere you can see. The spawn search used to ask
     only whether the column under the player and its two side columns were clear
     -- it never looked in the direction the camera is turned when the game opens,
     and init() turned the lens to +Z whatever was standing there. It accepted a
     spot half a block in front of the main cellar's north wall, so the first
     frame of the game was a wall: 91% of the pixels hit a block 0.6 m away at a
     mean brightness of 57/255, and the sky only came back once you had walked
     away from the building. The reading is the opening frame itself, and the
     bounds are the ones src/worldgen.js uses to choose the spot: at least 8% of
     the frame reaches sky, no more than 15% of it is a block within two metres. */
  const opening = await step('openingView', () => {
    const g = window.game, N = window.FRUTARIA, gl = g.R.gl, R = g.R, p = g.player;
    const was = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, vy: p.vy, form: p.form,
      time: g.time, mode: g.mode, frame: g._camFrame };
    const sp = N.spawn;
    p.form = null; p.x = sp.x; p.y = sp.y; p.z = sp.z; p.vx = p.vy = p.vz = 0;
    p.yaw = sp.yaw === undefined ? Math.PI : sp.yaw; p.pitch = -0.1;   // the pose init() gives the player
    g.mode = 'play'; g.time = N.DAY_LEN * (7 / 24);   // the clock the game opens on
    g.updateEnv();
    const cf = g._camFrame = g.shootCamera(p);
    g.render();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const tanY = Math.tan(cf.fov * Math.PI / 360), tanX = tanY * R.aspect;
    let near = 0, open = 0, n = 0, sum = 0, lum = 0;
    for (let Y = 0; Y < h; Y += 2) {
      const gy = h - 1 - Y, ndcY = 1 - (Y + 0.5) / h * 2;
      for (let X = 0; X < w; X += 2) {
        const ndcX = (X + 0.5) / w * 2 - 1;
        let dx = R.fwd[0] + R.right[0] * ndcX * tanX + R.up[0] * ndcY * tanY;
        let dy = R.fwd[1] + R.right[1] * ndcX * tanX + R.up[1] * ndcY * tanY;
        let dz = R.fwd[2] + R.right[2] * ndcX * tanX + R.up[2] * ndcY * tanY;
        const L = Math.hypot(dx, dy, dz); dx /= L; dy /= L; dz /= L;
        const hit = g.world.raycast(R.cam.x, R.cam.y, R.cam.z, dx, dy, dz, 300, false);
        n++;
        if (!hit) open++;
        else { if (hit.t < 2) near++; sum += Math.min(hit.t, 60); }
        const i = (gy * w + X) * 4;
        lum += px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11;
      }
    }
    g._camFrame = null; g.render();
    p.x = was.x; p.y = was.y; p.z = was.z; p.yaw = was.yaw; p.pitch = was.pitch; p.vy = was.vy;
    p.form = was.form; g.time = was.time; g.mode = was.mode; g._camFrame = was.frame;
    return { spawn: [+sp.x.toFixed(1), +sp.y.toFixed(1), +sp.z.toFixed(1)],
      yawDeg: Math.round((sp.yaw || 0) * 180 / Math.PI),
      nearShare: +(near / n).toFixed(3), skyShare: +(open / n).toFixed(3),
      meanDist: +(sum / Math.max(1, n - open)).toFixed(2), meanLum: +(lum / n).toFixed(0) };
  });
  check('the opening frame is not a wall pressed against the lens', opening.nearShare <= 0.15, opening);
  check('and the opening frame has sky in it', opening.skyShare >= 0.08, opening);

  /* 10q. a cloud is not a hole in the sky. The face/AO table is the brightness
     of a face relative to the ground it stands on: a bottom face is dark
     because it is under a slab and never sees the sky. A cloud's bottom face is
     the face you look at from the ground, and a cloud blob is nothing but
     corners, so the table drove the underside of every cloud to 0.19 of its own
     colour -- measured RGB (61,65,72) against a sky at (102,127,163). Dark grey
     lumps hanging in a bright sky: "black blocks in the sky". Cloud blocks are
     soft now (SOFT_S in src/world.js). The reading stands under one and looks
     up, and the cloud has to come out brighter than the sky behind it.
     world.raycast cannot say what a pixel is here: a cloud is non-solid on
     purpose, so the picking ray does not stop on weather. The ray is marched by
     hand through the block grid instead. */
  const cloud = await step('cloudIsNotAHole', () => {
    const g = window.game, N = window.FRUTARIA, W = g.world, gl = g.R.gl, R = g.R, p = g.player;
    const was = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, vy: p.vy, form: p.form,
      time: g.time, mode: g.mode, frame: g._camFrame };
    let spot = null;
    for (let z = 8; z < W.d - 8 && !spot; z += 2) for (let x = 8; x < W.w - 8; x += 2) {
      const g0 = N.groundY(W, x, z, 26);
      if (g0 < 16 || g0 > 26) continue;
      // groundY stops at solid ground, so it walks straight through a canopy of
      // leaves and through the cloud deck: the first block above the ground has
      // to be cloud, or the lens is under a tree and every ray hits leaves
      let y = g0;
      while (y < W.h && !W.get(x, y, z)) y++;
      if (y >= W.h || W.get(x, y, z) !== 16 || y > 46) continue;
      spot = { x: x + 0.5, z: z + 0.5, y: g0 + 0.2 };
      break;
    }
    if (!spot) return {};
    p.form = null; p.x = spot.x; p.y = spot.y; p.z = spot.z; p.vx = p.vy = p.vz = 0;
    p.yaw = Math.PI; p.pitch = 1.15;                  // up at the underside of the blob
    g.mode = 'play'; g.time = N.DAY_LEN * (7 / 24); g.updateEnv();
    const cf = g._camFrame = g.shootCamera(p);
    g.render();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const tanY = Math.tan(cf.fov * Math.PI / 360), tanX = tanY * R.aspect;
    const first = (ox, oy, oz, dx, dy, dz) => {
      for (let t = 0.3; t < 90; t += 0.4) {
        const b = W.get(Math.floor(ox + dx * t), Math.floor(oy + dy * t), Math.floor(oz + dz * t));
        if (b) return b;
      }
      return 0;
    };
    const lum = (i) => px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11;
    let cn = 0, cs = 0, cmin = 1e9, sn = 0, ss = 0;
    for (let Y = 0; Y < h; Y += 2) {
      const gy = h - 1 - Y, ndcY = 1 - (Y + 0.5) / h * 2;
      for (let X = 0; X < w; X += 2) {
        const ndcX = (X + 0.5) / w * 2 - 1;
        let dx = R.fwd[0] + R.right[0] * ndcX * tanX + R.up[0] * ndcY * tanY;
        let dy = R.fwd[1] + R.right[1] * ndcX * tanX + R.up[1] * ndcY * tanY;
        let dz = R.fwd[2] + R.right[2] * ndcX * tanX + R.up[2] * ndcY * tanY;
        const L = Math.hypot(dx, dy, dz); dx /= L; dy /= L; dz /= L;
        const id = first(R.cam.x, R.cam.y, R.cam.z, dx, dy, dz);
        const i = (gy * w + X) * 4;
        if (id === 16) { cn++; cs += lum(i); cmin = Math.min(cmin, lum(i)); }
        else if (id === 0) { sn++; ss += lum(i); }
      }
    }
    g._camFrame = null; g.render();
    p.x = was.x; p.y = was.y; p.z = was.z; p.yaw = was.yaw; p.pitch = was.pitch; p.vy = was.vy;
    p.form = was.form; g.time = was.time; g.mode = was.mode; g._camFrame = was.frame;
    return { spot, cloudPx: cn, skyPx: sn, cloudMean: +(cs / Math.max(1, cn)).toFixed(1),
      skyMean: +(ss / Math.max(1, sn)).toFixed(1), cloudMin: cmin === 1e9 ? 0 : +cmin.toFixed(1) };
  });
  check('there is a cloud overhead to look at', cloud.cloudPx > 2000, cloud);
  check('a cloud is brighter than the sky behind it, not a dark lump in it',
    cloud.cloudMean > cloud.skyMean && cloud.cloudMean >= 100, cloud);

  /* 10r. the sky is not mirrored. The renderer keeps a camera basis for the sky
     quad, and the sky quad is the only thing in the frame that reads it, so an
     error there hides everywhere else: it was built as fwd x right instead of
     right x fwd, which is the same vector negated. The sky shader maps the top of
     the screen to fwd + up*tanY, so the whole sky was upside down -- the top of
     the frame sampled *below* the horizon and got the dark ground colour, the
     bright horizon band sat at the bottom, and the sun glow sat under the
     horizon. Measured at 07:00 with the lens level and facing the sun's azimuth:
     the glow landed 135 px below the centre of a 300 px frame, with the sun 31
     degrees above the horizon. The lens is lifted above the world so nothing but
     sky is in the way. */
  const sky = await step('skyNotMirrored', () => {
    const g = window.game, N = window.FRUTARIA, gl = g.R.gl, R = g.R, p = g.player;
    const was = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, vy: p.vy, form: p.form,
      time: g.time, mode: g.mode, frame: g._camFrame };
    p.form = null; p.x = 80.5; p.y = 90.5; p.z = 80.5; p.vx = p.vy = p.vz = 0;
    g.mode = 'play'; g.time = N.DAY_LEN * (7 / 24); g.updateEnv();
    const sd = g.env.sunDir;
    p.yaw = Math.atan2(sd[0], -sd[2]); p.pitch = 0;      // face the sun's azimuth, level
    const cf = g._camFrame = g.shootCamera(p);
    g.render();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let best = -1, bestRow = -1;
    for (let Y = 0; Y < h; Y++) {                        // image row 0 is the top
      const gy = h - 1 - Y;
      for (let X = 0; X < w; X++) {
        const i = (gy * w + X) * 4;
        const L = px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11;
        if (L > best) { best = L; bestRow = Y; }
      }
    }
    g._camFrame = null; g.render();
    p.x = was.x; p.y = was.y; p.z = was.z; p.yaw = was.yaw; p.pitch = was.pitch; p.vy = was.vy;
    p.form = was.form; g.time = was.time; g.mode = was.mode; g._camFrame = was.frame;
    return { sunElevDeg: +(Math.asin(Math.max(-1, Math.min(1, sd[1]))) * 180 / Math.PI).toFixed(1),
      glowRow: bestRow, middleRow: h / 2, above: bestRow < h / 2, lum: Math.round(best) };
  });
  check('the sun glow is above the middle of the frame, not mirrored below it', sky.above, sky);

  /* 10s. stars belong to the dark. The day/night curve is symmetric about noon,
     so at 07:00 -- the hour the game opens on -- it still says 37% night while
     the sun is 29 degrees up, and the sky shader drew stars next to it: 217 sharp
     spikes counted in a daylight sky looking straight up. A star is a one or two
     pixel jump over its neighbours; the sun's halo is broad, so counting jumps
     separates "speckled" from "smooth" without needing to know where the sun is. */
  const stars = await step('starsOnlyInDark', () => {
    const g = window.game, N = window.FRUTARIA, gl = g.R.gl, p = g.player;
    const was = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, vy: p.vy, form: p.form,
      time: g.time, mode: g.mode, frame: g._camFrame };
    p.form = null; p.x = 80.5; p.y = 90.5; p.z = 80.5; p.vx = p.vy = p.vz = 0;   // above the world
    p.yaw = Math.PI; p.pitch = 1.5; g.mode = 'play';
    const look = (hour) => {
      g.time = N.DAY_LEN * (hour / 24); g.updateEnv();
      g._camFrame = g.shootCamera(p); g.render();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const L = (X, Y) => { const i = (Y * w + X) * 4; return px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11; };
      let spikes = 0;
      for (let Y = 1; Y < h - 1; Y++) for (let X = 1; X < w - 1; X++) {
        let nb = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) nb += L(X + dx, Y + dy);
        if (L(X, Y) - nb / 8 > 40) spikes++;
      }
      return { hour, sunY: +g.env.sunDir[1].toFixed(2), night: +g.night.toFixed(2), spikes };
    };
    const day = look(7), night = look(0);
    g._camFrame = null; g.render();
    p.x = was.x; p.y = was.y; p.z = was.z; p.yaw = was.yaw; p.pitch = was.pitch; p.vy = was.vy;
    p.form = was.form; g.time = was.time; g.mode = was.mode; g._camFrame = was.frame;
    return { day, night };
  });
  check('no stars are out while the sun is up', stars.day.spikes <= 2, stars);
  check('the stars are still there at midnight', stars.night.spikes > 50, stars);

  /* 10s. the night sky is mostly dark: the stars are a scatter, not a carpet.
     The star hash floors the unit direction by 160 and multiplies the cell's
     coordinates far past the range a mediump float is only required to hold,
     so on a strict GPU the hash degrades and the stars clump into a dense
     regular dot grid that fills the night -- seen on a real device at 00:50
     over Mirrorlake, where the suite's software backend reads mediump at full
     range and never shows it, so neither the laws nor the watch could see it
     either. The sky shader asks for highp now (engine.js, FS_SKY); this step
     pins the scatter itself, so a change that fills the frame with bright
     cells is caught where the frame is read. Measured at 00:50, 30 m over the
     open lake, 77 degrees up with the moon out of the frame: 0.20% of the
     frame is a star's brightness and the largest bright patch is 46 pixels,
     one star cell stretched at the frame's edge. A collapsed grid is most of
     the frame; a sky with no stars is none of it. */
  const starField = await step('nightSkyIsAScatterNotACarpet', () => {
    const g = window.game, N = window.FRUTARIA, gl = g.R.gl, p = g.player;
    const was = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, vy: p.vy, form: p.form,
      time: g.time, mode: g.mode, frame: g._camFrame, third: g.thirdPerson };
    g.mode = 'play'; g.thirdPerson = false;
    p.form = null; p.vx = p.vy = p.vz = 0;
    /* 30 m over the open lake, 77 degrees up. The frame spans 39..90 degrees
       of elevation; the tallest thing within a hundred metres of this point
       tops out at 13 degrees, and at 00:50 the moon sits out of the frame, so
       every bright pixel the frame holds is a star. */
    p.x = 100; p.z = 90; p.y = 30; p.yaw = 0.4; p.pitch = 1.35;
    g.time = 50; g.updateEnv();
    g._camFrame = g.shootCamera(p); g.render();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const L = (X, Y) => { const i = (Y * w + X) * 4; return px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11; };
    const lit = (X, Y) => L(X, Y) > 110;
    let bright = 0;
    const seen = new Uint8Array(w * h);
    let patches = 0, largest = 0;
    for (let Y = 0; Y < h; Y++) for (let X = 0; X < w; X++) {
      if (lit(X, Y)) bright++;
      if (!lit(X, Y) || seen[Y * w + X]) continue;
      patches++;
      const stack = [[X, Y]]; seen[Y * w + X] = 1; let size = 0;
      while (stack.length) {
        const c = stack.pop(); size++;
        for (let k = 0; k < 4; k++) {
          const nx = c[0] + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = c[1] + (k === 2 ? 1 : k === 3 ? -1 : 0);
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[ny * w + nx] || !lit(nx, ny)) continue;
          seen[ny * w + nx] = 1; stack.push([nx, ny]);
        }
      }
      if (size > largest) largest = size;
    }
    g._camFrame = null; g.render();
    p.x = was.x; p.y = was.y; p.z = was.z; p.yaw = was.yaw; p.pitch = was.pitch; p.vy = was.vy;
    p.form = was.form; g.time = was.time; g.mode = was.mode; g._camFrame = was.frame;
    g.thirdPerson = was.third;
    return { brightPct: +(bright / (w * h) * 100).toFixed(3), patches, largest };
  });
  check('at night the stars are a scatter: under 1% of a sky-only frame is a star brightness',
    starField.brightPct < 1, starField);
  check('and the sky is not empty of them: at least half a tenth of a percent is',
    starField.brightPct > 0.05, starField);
  check('and no bright mass stands in the night sky: the largest bright patch is one stretched star cell, not a grid',
    starField.largest < 500, starField);

  /* 10s. each star keeps its own clock. The star mask picks the cells whose
     hash sits in the sliver [0.9965, 1) -- and the twinkle took its phase from
     that very value times 40, which spans a mere 0.14 radians. Every star
     shared one phase and one speed, so the whole sky brightened and dimmed in
     unison: the human saw all the stars light up and fade at once. Phase and
     speed now come from two more full-range hashes of the cell (engine.js,
     FS_SKY): the phase uniform on the circle, the speed a fifth to a quarter
     of a turn per second, so the stars twinkle on their own clocks while the
     mask is untouched and the scatter above stays the same scatter. Measured
     at the scatter law's lens (30 m over the lake, 77 degrees up, the moon out
     of the frame) at four game times one second apart: in every step 749..823
     star pixels brightened while 726..808 dimmed at the same time, all 1686
     star pixels that ever lit swung more than 30 of luminance across the four
     seconds, and no star moved from its place. A single phase again sends one
     side of every step to zero. */
  const twinkle = await step('starsTwinkleOnTheirsOwnClocks', () => {
    const g = window.game, gl = g.R.gl, p = g.player;
    const was = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, vy: p.vy, form: p.form,
      time: g.time, mode: g.mode, frame: g._camFrame, third: g.thirdPerson };
    g.mode = 'play'; g.thirdPerson = false; g.hover = null;
    p.form = null; p.vx = p.vy = p.vz = 0;
    /* The scatter law's sky-only lens: the moon sits out of the frame, so a
       bright pixel is a star and its luminance moves only if the twinkle
       moves it. Four grabs one game-second apart. */
    p.x = 100; p.z = 90; p.y = 30; p.yaw = 0.4; p.pitch = 1.35;
    const grab = (t) => {
      g.time = t; g.updateEnv();
      g._camFrame = g.shootCamera(p); g.render();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const L = new Float32Array(w * h);
      for (let i = 0, j = 0; i < px.length; i += 4, j++) L[j] = px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11;
      return { L, w, h };
    };
    const frames = [50, 51, 52, 53].map((t) => grab(t));
    const { w, h } = frames[0];
    const everLit = new Uint8Array(w * h);
    for (const f of frames) for (let i = 0; i < w * h; i++) if (f.L[i] > 110) everLit[i] = 1;
    let ever = 0, swinging = 0;
    const perStep = [];
    for (let s = 1; s < frames.length; s++) perStep.push({ up: 0, down: 0 });
    for (let i = 0; i < w * h; i++) {
      if (!everLit[i]) continue;
      ever++;
      let lo = 999, hi = 0;
      for (const f of frames) { if (f.L[i] < lo) lo = f.L[i]; if (f.L[i] > hi) hi = f.L[i]; }
      if (hi - lo > 30) swinging++;
      for (let s = 1; s < frames.length; s++) {
        const d = frames[s].L[i] - frames[s - 1].L[i];
        if (d > 10) perStep[s - 1].up++;
        else if (d < -10) perStep[s - 1].down++;
      }
    }
    g._camFrame = null; g.render();
    p.x = was.x; p.y = was.y; p.z = was.z; p.yaw = was.yaw; p.pitch = was.pitch; p.vy = was.vy;
    p.form = was.form; g.time = was.time; g.mode = was.mode; g._camFrame = was.frame;
    g.thirdPerson = was.third;
    return { ever, swinging, perStep };
  });
  check('while some stars brighten others dim in the same second: the sky does not breathe as one lamp',
    twinkle.perStep.every((s) => s.up > 200 && s.down > 200), twinkle);
  check('and the twinkle has amplitude: well over a quarter of the stars that lit moved a third of the twinkle range or more across four seconds',
    twinkle.swinging > 400, twinkle);

  /* 10s. the dark of a night is the sky's light, not a grey. The world shader lit
     every surface by `uDay` -- 0.16 of its own colour at midnight -- and nothing
     else, so a dark material (conifer 0.14/0.30/0.20, dark leaf, roof tile) came
     out at luminance 7..10 while the night sky behind it was 17..21: a tree or a
     roof was a hole cut in the sky, which is what the human reported as black
     blocks in the night sky. Measured on
     four night lenses before anything was touched: 4..42% of the frame below
     luminance 12, darkest surface 6.8, sky 17.3..21.3; the same four lenses at
     13:00 had none of it. The fix is the sky's own colour **added** to every
     surface, gated on the sun being properly down -- the same gate the stars use,
     which is also where the sun's own light ends (`day` reaches 0 at an elevation
     of -0.1375). Added rather than multiplied because that is the shape the
     problem has: it lifts a dark surface by most of its own value and a bright
     one by hardly anything, and it is zero all day, so a daytime frame is bit for
     bit the frame it was. */
  const nightfall = await step('nightKeepsTheSkyItsLight', () => {
    const g = window.game, N = window.FRUTARIA, W = g.world, gl = g.R.gl, R = g.R, p = g.player;
    const was = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, vy: p.vy, form: p.form,
      time: g.time, mode: g.mode, frame: g._camFrame };
    const views = [
      { name: 'ridge', x: 142.5, z: 20.5, yaw: 3.0, pitch: 0.25 },
      { name: 'canopy', x: 50.5, z: 8.5, yaw: 1.5708, pitch: 1.2 },
      { name: 'town', x: 136.5, z: 128.5, yaw: 1.5708, pitch: 0.6 },
      { name: 'lake', x: 78.5, z: 118.5, yaw: 0, pitch: 0.5 }
    ];
    const look = (v, hour, stride = 2) => {
      p.form = null; p.vx = p.vy = p.vz = 0; p.x = v.x; p.z = v.z;
      p.y = N.terrainY(W, Math.floor(v.x), Math.floor(v.z), 60) + 1.62;
      p.yaw = v.yaw; p.pitch = v.pitch;
      g.mode = 'play'; g.time = N.DAY_LEN * (hour / 24); g.updateEnv();
      g._camFrame = g.shootCamera(p); g.render();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const tanY = Math.tan(R.cam.fov * Math.PI / 360), tanX = tanY * R.aspect;
      // what a ray from the lens hits first: a block, or the sky
      const first = (dx, dy, dz) => {
        for (let t = 0.3; t < 200; t += 0.25) {
          const X = Math.floor(R.cam.x + dx * t), Y = Math.floor(R.cam.y + dy * t), Z = Math.floor(R.cam.z + dz * t);
          if (Y >= W.h) break;
          if (X < 0 || Z < 0 || X >= W.w || Z >= W.d) continue;
          const b = W.get(X, Y, Z); if (b) return b;
        } return 0;
      };
      const L = i => px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11;
      let sn = 0, ss = 0, black = 0, tot = 0, geoN = 0;
      // a histogram, not a sorted array: the darkest slice of the geometry is
      // what is wanted, and 256 bins is the whole range of a byte
      const hist = new Int32Array(256);
      for (let Y = 0; Y < h; Y += stride) {
        const gy = h - 1 - Y, ndcY = 1 - (Y + 0.5) / h * 2;
        for (let X = 0; X < w; X += stride) {
          const ndcX = (X + 0.5) / w * 2 - 1;
          let dx = R.fwd[0] + R.right[0] * ndcX * tanX + R.up[0] * ndcY * tanY;
          let dy = R.fwd[1] + R.right[1] * ndcX * tanX + R.up[1] * ndcY * tanY;
          let dz = R.fwd[2] + R.right[2] * ndcX * tanX + R.up[2] * ndcY * tanY;
          const ln = Math.hypot(dx, dy, dz); dx /= ln; dy /= ln; dz /= ln;
          const i = (gy * w + X) * 4, val = L(i);
          tot++; if (val < 12) black++;
          if (first(dx, dy, dz) === 0) { sn++; ss += val; }
          else { hist[Math.min(255, val | 0)]++; geoN++; }
        }
      }
      /* The darkest *slice* of the geometry, not its single darkest pixel. The
         ray classifier above reads the block grid, so a body standing between
         the lens and that block is counted as the block: a creature that
         wandered into one of these four frames, or the player's own dark robe,
         used to set geoMin on its own, and the value then moved by thirty
         luminance between two runs of the same code. A hole cut in the sky --
         the thing this is looking for -- is an area, and the darkest 1% of a
         frame with one in it is still down there with it. */
      let gmin = 0, want = Math.max(1, Math.floor(geoN * 0.01)), seen = 0;
      for (let v = 0; v < 256; v++) { seen += hist[v]; if (seen >= want) { gmin = v; break; } }
      /* A hole cut in the sky is an **area**, so the frame is measured twice: the
         darkest slice of the geometry says how deep it goes, and the share of the
         whole frame that is geometry under luminance 24 says how much of it there
         is. At 18:00 the first of those was 0.21 of the sky and the second was
         38.4% of the frame -- a mass, not a pixel. */
      let mass = 0; for (let b = 0; b < 24; b++) mass += hist[b];
      const sky = ss / Math.max(1, sn);
      g._camFrame = null;
      return { skyMean: +sky.toFixed(1), geoMin: gmin, ratio: +(gmin / Math.max(1e-6, sky)).toFixed(2),
        massPct: +(mass / tot * 100).toFixed(1),
        blackPct: +(black / tot * 100).toFixed(1) };
    };
    const out = {};
    for (const v of views) out[v.name] = { night: look(v, 0), day: look(v, 13) };
    /* Dusk, and a set of lenses aimed at the horizon, where a bright sky sits
       behind a dark mass -- the four above look up or down, which is what the
       midnight half of this step wanted. The clock calls 17:30, 18:00, 18:30 and
       06:00 night (night > 0.55), and at those hours the sky is at its brightest
       of the whole day -- `dusk` peaks as the sun crosses the horizon -- while
       the sun's light on the ground is down to 43%, 22%, 8% and 22%. The gate the
       sky's light on the ground used had the sun's height in it and had not
       opened yet: 38.4% of the town frame, 30.4% of the grove, 38.4% of the ridge
       and 2.6% of the lake was geometry under luminance 24 against a sky of
       61..75, and the darkest 1% of that geometry was 0.21..0.31 of the sky.
       Sampled every fourth pixel: these are sixteen more frames, and the step
       already draws eight. */
    const duskViews = [
      { name: 'townlevel', x: 136.5, z: 128.5, yaw: 1.5708, pitch: -0.05 },
      { name: 'grove', x: 104.5, z: 32.5, yaw: 1.5708, pitch: 0.1 },
      { name: 'ridge', x: 142.5, z: 20.5, yaw: 3.0, pitch: 0.25 },
      { name: 'lake', x: 78.5, z: 118.5, yaw: 0, pitch: 0.5 }
    ];
    const dusk = {};
    for (const v of duskViews) {
      dusk[v.name] = {};
      for (const hr of [17.5, 18, 18.5, 6]) dusk[v.name][hr] = look(v, hr, 4);
    }
    const amb = {};
    for (const hr of [13, 16, 18, 20, 0]) {
      g.time = N.DAY_LEN * (hr / 24); g.updateEnv();
      amb[hr] = g.env.ambient.map(x => +x.toFixed(4));
    }
    g._camFrame = null; g.render();
    p.x = was.x; p.y = was.y; p.z = was.z; p.yaw = was.yaw; p.pitch = was.pitch; p.vy = was.vy;
    p.form = was.form; g.time = was.time; g.mode = was.mode; g._camFrame = was.frame;
    const duskCells = Object.keys(dusk).flatMap(k => Object.keys(dusk[k]).map(hr => dusk[k][hr]));
    return { views: out, amb, dusk,
      duskMass: Math.max(...duskCells.map(c => c.massPct)),
      duskRatio: Math.min(...duskCells.map(c => c.ratio)),
      worstBlack: Math.max(...views.map(v => out[v.name].night.blackPct)),
      worstRatio: Math.min(...views.map(v => out[v.name].night.geoMin / out[v.name].night.skyMean)) };
  });
  check('the light of the sky on the ground is zero while the sun still lights the ground',
    nightfall.amb[13].every(x => x === 0) && nightfall.amb[16].every(x => x === 0), nightfall.amb);
  check('and it is there at 18:00, the hour the clock calls night, in the dusk sky\'s own warm',
    nightfall.amb[18][0] > 0.1 && nightfall.amb[18][0] > nightfall.amb[18][2], nightfall.amb);
  check('and it is there once the sun is properly down, and it is the blue of the sky',
    nightfall.amb[0][2] > 0.03 && nightfall.amb[0][2] > nightfall.amb[0][0], nightfall.amb);
  check('a night frame holds no black mass: nothing in it is below luminance 12',
    nightfall.worstBlack === 0, nightfall.views);
  check('the darkest surface at night is not below the sky it sits against',
    nightfall.worstRatio >= 0.6, nightfall.views);
  /* The mass check is under 1% of the frame, not zero: the four lenses measured
     38.4, 30.4, 38.4 and 2.6 before the gate was asked of the sun's light on the
     ground, and 0 after it, and a viewport that is a different shape from the one
     these were read at should not be allowed to fail the run over a handful of
     pixels. */
  check('a dusk frame holds no black mass either: under 1% of it is geometry under luminance 24',
    nightfall.duskMass < 1, nightfall.dusk);
  check('and the darkest surface at dusk is not below the dusk sky it sits against',
    nightfall.duskRatio >= 0.5, nightfall.dusk);
  check('and in daylight the same lenses still have nothing black in them',
    Object.keys(nightfall.views).every(k => nightfall.views[k].day.blackPct === 0 && nightfall.views[k].day.geoMin > 30),
    nightfall.views);

  /* 10s. the sky below the horizon is the fog the world fades into, not a grey
     of its own. The sky quad draws a fixed grey there all day: a grey tuned
     while the sun was up (luminance ~132 by day, against a day horizon of
     0.72/0.82/0.92 -- the right order, so a daytime silhouette against it is a
     silhouette). By night the horizon behind it is 0.10/0.12/0.20 and the same
     grey lands at luminance 44 while the whole night world, tuned against the
     horizon and zenith bands (17..31), lands at 10..38. Measured at 23:29 on
     the lake, the lens in the water at the island's west wall -- the frame the
     human drew as black blocks in the night sky, a dark band with a 1 m stepped
     edge across the frame and the smooth blue of the night on the other side:
     the sky below the horizon read 44, the wall that fills the frame 25..39,
     the far shore's silhouette 17..27. Every surface at the horizon was
     darker than the sky it stood against, so the wall and the shore came back
     as black blocks cut into a pale band. Asked of the frame the way the eye
     asks it -- draw the world, then draw the sky alone at the same pose, and a
     pixel of the first frame that is 15 or more below the sky that stands
     behind it is a pixel of black cut out of the sky -- 17.97% of the frame
     was one for the human and 4.38% for the frog. The band is not the sky: it
     is the far terrain the world is fading into at the edge of sight, so it
     has to be the colour the world fades into, the fog. `night` is the gate,
     the sky's own darkness: in the sun it is 0 and the grey is exactly what
     it always was (a noon frame measured bit for bit the frame it was, and the
     only pixel differences in a second run of the same code are the creature
     blips the minimap and the world carry, 0.99% of the frame), and from
     18:32 to 05:28 the band is the fog, luminance ~25, the same order the
     world sits at, and the same frame answers 0.14% (human) and 0.11% (frog)
     of black cut out of the sky. The fog the band asks of is the fog **after**
     the lens has had its say -- the edge's veil and the water the lens sits in
     have already moved it -- because that is the fog the world at the edge of
     sight is fading into. */
  const band = await step('theSkyBelowTheHorizon', () => {
    const g = window.game, N = window.FRUTARIA, W = g.world, gl = g.R.gl, R = g.R, p = g.player;
    const was = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, vy: p.vy, form: p.form,
      time: g.time, mode: g.mode, frame: g._camFrame, third: g.thirdPerson };
    const luma = c => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
    g.mode = 'play'; g.thirdPerson = false;
    p.form = null; p.vx = p.vy = p.vz = 0;
    /* the frame the human drew: the lake at the island's west wall, the wall
       across the frame, the sky on the other side of it. The lens is in the
       air 1.5 m over the water, where the below-horizon band is visible as the
       water's own far edge -- not sitting in a liquid, or the fog would be the
       liquid's colour and this step would be asking of the wrong fog. */
    p.x = 63.5; p.y = 15.0; p.z = 112.5; p.yaw = 2.0944; p.pitch = 0.35;
    g.time = 0; g.updateEnv();
    const eye = p.eyePos();
    const air = !W.get(Math.floor(p.x), Math.floor(eye), Math.floor(p.z));
    const inWater = g.env.inWater;
    const envGap = Math.abs(luma(g.env.ground) - luma(g.env.fogCol)) * 255;
    g.render();   // warm: the camera settles onto the eye before the measured frame
    const grab = () => {
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return { w, h, px };
    };
    const A = grab();
    const drawMesh = R.drawMesh;
    R.drawMesh = function () {};
    g.render();
    const B = grab();
    R.drawMesh = drawMesh;
    /* the eye's own question: a pixel of the world frame that is 15 or more
       below the sky that stands behind it is black cut out of the sky */
    let hole = 0, tot = 0;
    for (let Y = 0; Y < A.h; Y += 2) for (let X = 0; X < A.w; X += 2) {
      const i = (Y * A.w + X) * 4;
      tot++;
      if (A.px[i] * 0.3 + A.px[i + 1] * 0.59 + A.px[i + 2] * 0.11 <
          B.px[i] * 0.3 + B.px[i + 1] * 0.59 + B.px[i + 2] * 0.11 - 15) hole++;
    }
    g._camFrame = null; g.render();
    p.x = was.x; p.y = was.y; p.z = was.z; p.yaw = was.yaw; p.pitch = was.pitch; p.vy = was.vy;
    p.form = was.form; g.time = was.time; g.mode = was.mode; g._camFrame = was.frame;
    g.thirdPerson = was.third;
    return { air, inWater, envGap: +envGap.toFixed(1), holePct: +(hole / tot * 100).toFixed(2) };
  });
  check('the sky below the horizon at night is the colour the world fades into',
    band.air && !band.inWater && band.envGap < 3, band);
  check('and the world at the horizon is not cut out of it as black: under 1% of the frame is more than 15 below the sky behind it',
    band.air && !band.inWater && band.holePct < 1, band);

  /* 10t. the phase word has to follow which way the sun is moving. `night` is
     symmetric about noon, and the HUD picked dawn/dusk/night/day from that value
     alone, so the hour the game opens on -- 07:00, night 0.37 -- was labelled
     "dusk" in the morning. */
  const phase = await step('phaseWordFollowsTheSun', () => {
    const g = window.game, N = window.FRUTARIA;
    const was = { time: g.time, mode: g.mode };
    g.mode = 'play';
    const word = (hour) => {
      g.time = N.DAY_LEN * (hour / 24); g.updateEnv(); window.ui.update();
      return (document.getElementById('clock').textContent || '').trim();
    };
    const morning = word(7), evening = word(17);
    g.time = was.time; g.mode = was.mode; window.ui.update();
    return { morning, evening, dawn: N.t('hud.dawn'), dusk: N.t('hud.dusk') };
  });
  check('the morning is called dawn, not dusk',
    phase.morning.includes(phase.dawn) && !phase.morning.includes(phase.dusk), phase);
  check('and the evening is called dusk', phase.evening.includes(phase.dusk), phase);

  /* 10u. a frog in the water kicks, it does not run. The model had one leg cycle
     for every body: in the lake a frog moves at its swim speed (4.6 m/s against a
     walk speed of 1.8) and the legs still ran the walk cycle -- front against hind,
     left against right -- so a frog paddled across the surface. A part may now
     declare swimKick (this part drives the kick, both legs in the same phase) or
     swimPose (this part is held while swimming), and the caller says `swim` only
     for a body the data gives a swim speed to, so a human in the lake still wades:
     the human model has no swim parts and the game has no human stroke.
     What the frame has to show is that the body agrees with itself about its own
     mid-plane. The mask is the body alone: draw, zero the body's own meshes, draw
     again, and the pixels that changed are the body. The lens sits directly behind
     the body, where the model's mid-plane is the vertical line through the
     projected origin, so mirroring the mask about that line is mirroring the model
     about x = 0. A body that runs has one hind foot forward and one back, and the
     two halves of its silhouette stop agreeing. */
  const swim = await step('frogKicksNotRuns', () => {
    const g = window.game, R = g.R, gl = g.R.gl, p = g.player;
    const was = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, vy: p.vy, vx: p.vx, vz: p.vz,
      faceYaw: p.faceYaw, form: p.form, time: g.time, mode: g.mode, tp: g.thirdPerson,
      held: p.held, inWater: p.inWater, airAmt: p.airAmt,
      cam: { d: g.cam.d, fov: g.cam.fov }, frame: g._camFrame };
    p.form = 'frogpear';
    p.x = 92.5; p.y = 13.4; p.z = 118.5;            // Mirrorlake, at the surface
    p.vx = 1.2; p.vy = 0; p.vz = 0;
    p.yaw = Math.PI / 2; p.faceYaw = Math.PI / 2; p.pitch = -0.06;
    p.inWater = true; p.airAmt = 0; p.crouch = 0; p.squash = 0; p.bank = 0;
    p.held = 1;                                    // the water is holding this body up
    g.mode = 'play'; g.thirdPerson = true; g.camReady = true; g.cam.d = 1.8; g.cam.fov = 50;
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const grab = () => { const b = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; };
    const parts = g.ensureModel('frog');
    /* The body alone: the mesh a body is drawn from is shared with every animal of
       that species, so zeroing it to find its pixels also blanks the twelve frogs
       that live in this lake -- and one of them wandering into the frame is worth
       2,000 pixels of mask and wrecks the symmetry. The animals are put away for
       the two draws and handed back after. */
    const wasCreatures = g.creatures;
    g.creatures = [];
    const saved = parts.map(e => e.mesh.count);
    const maskAt = (time) => {
      g.time = time; g.updateEnv();
      const cf = g.shootCamera(p);
      g._camFrame = cf; g.render(); const a = grab();
      parts.forEach(e => { e.mesh.count = 0; });
      g._camFrame = cf; g.render(); const b = grab();
      parts.forEach((e, i) => { e.mesh.count = saved[i]; });
      const m = new Uint8Array(W * H);
      let n = 0;
      for (let i = 0, j = 0; i < a.length; i += 4, j++) {
        if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 8) { m[j] = 1; n++; }
      }
      return { m, n };
    };
    /* the kick phase is the clock: sin(t * SWIM_RATE + phase), and the player's
       phase is 0. Pick the clock so the kick is at the tucked and the extended
       extreme while the hour stays near 07:00, which is when there is light. */
    const RATE = 4.2, per = 2 * Math.PI / RATE, base = 420 * 7 / 24;
    const at = (want) => base + (((want - base * RATE) % per) + per) % per / RATE;
    const A = maskAt(at(Math.PI / 2)), B = maskAt(at(3 * Math.PI / 2));
    const v = R.view, q = R.proj;
    const projX = (x, y, z) => {
      const vx = v[0] * x + v[4] * y + v[8] * z + v[12];
      const vy = v[1] * x + v[5] * y + v[9] * z + v[13];
      const vz = v[2] * x + v[6] * y + v[10] * z + v[14];
      const cx = q[0] * vx + q[4] * vy + q[8] * vz + q[12];
      const cw = q[3] * vx + q[7] * vy + q[11] * vz + q[15];
      return Math.round((cx / cw * 0.5 + 0.5) * W);
    };
    const cx = projX(p.x, p.y + 0.3, p.z);
    const mirror = (m) => {
      const o = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) {
        const row = y * W;
        for (let x = 0; x < W; x++) { const mx = 2 * cx - x; if (mx >= 0 && mx < W) o[row + x] = m[row + mx]; }
      }
      return o;
    };
    const iou = (a, b) => { let inter = 0, uni = 0; for (let i = 0; i < a.length; i++) { if (a[i] || b[i]) { uni++; if (a[i] && b[i]) inter++; } } return uni ? inter / uni : 0; };
    /* The mask is the difference of two draws, so its edge is wherever the body's
       colour came within the threshold of the water behind it -- not the
       silhouette. That edge shivers by a pixel between one frame and the next,
       and a plain overlap score is then measuring the shiver: the same pose with
       the same code gave 0.967 and 0.957 fifty milliseconds apart, and the pixels
       that disagreed sat in symmetric pairs on both sides of the mid-plane, which
       is what noise looks like and not at all what a leg bent the wrong way looks
       like. So the score asks the question the claim actually makes: is every
       pixel of this silhouette matched by one on the mirrored side, allowing a
       pixel for the edge? A leg that is not the mirror of its pair misses by
       tens of pixels, and nothing about the claim gets looser. */
    const dilate = (m) => {
      const o = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[y * W + x])
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const ny = y + dy, nx = x + dx;
          if (ny >= 0 && ny < H && nx >= 0 && nx < W) o[ny * W + nx] = 1;
        }
      return o;
    };
    const symScore = (m) => {
      const dm = dilate(mirror(m));
      let un = 0;
      for (let i = 0; i < m.length; i++) if (m[i] && !dm[i]) un++;
      return +Math.max(0, 1 - un / Math.max(1, count(m))).toFixed(4);
    };
    const count = (m) => { let n = 0; for (let i = 0; i < m.length; i++) if (m[i]) n++; return n; };
    const symTuck = symScore(A.m), symKick = symScore(B.m), moved = iou(A.m, B.m);
    const rawTuck = iou(A.m, mirror(A.m)), rawKick = iou(B.m, mirror(B.m));
    g._camFrame = null; g.render();
    Object.assign(p, { x: was.x, y: was.y, z: was.z, yaw: was.yaw, pitch: was.pitch, vy: was.vy,
      vx: was.vx, vz: was.vz, faceYaw: was.faceYaw, form: was.form,
      held: was.held, inWater: was.inWater, airAmt: was.airAmt });
    g.time = was.time; g.mode = was.mode; g.thirdPerson = was.tp;
    g.creatures = wasCreatures;
    g.cam.d = was.cam.d; g.cam.fov = was.cam.fov; g._camFrame = was.frame;
    return { maskPx: A.n, cx, hourAt: +(at(Math.PI / 2) / 420 * 24).toFixed(2),
      symTuck, symKick, rawTuck: +rawTuck.toFixed(3), rawKick: +rawKick.toFixed(3), moved: +moved.toFixed(3) };
  });
  check('the frog body is big enough in the frame to judge', swim.maskPx > 3000, swim);
  check('a swimming frog is mirror-symmetric about its own mid-plane',
    swim.symTuck > 0.985 && swim.symKick > 0.985, swim);
  check('and the kick moves the legs between its extremes', swim.moved < 0.97, swim);

  /* 10v. the gait itself, read where the claim is actually made. The frame check
     above can only see the silhouette a body leaves from directly behind, and from
     there a leg forward and a leg back move 6% of the outline, and the two
     extremes of one kick score 0.973 and 0.965 against their own mirror -- numbers
     that close, judged by eye, and a bound set by eye is a bound that will be
     loosened the first time it annoys someone. So the same claim is read again off
     the angles the renderer is about to upload: a walk alternates (left = -right),
     a kick does not (left = right).
     The two halves are read off two different bodies, because they are two
     different animals' errands. A stride belongs to a body that walks, and a frog
     is not one: on land it hops (docs/en/03 s3), and its hind leg is longer than
     its hip is high, so any swing at the hip takes the foot through the ground on
     the way back and well above it on the way up -- which is how the frog of B19
     got its legs into the floor it was standing on. The kick belongs to the frog.
     The knee is read on the walking body as well: the fold of B19 was mirrored
     along with the timing, so one knee of every body bent backwards through the
     floor, and a backwards knee is not a stride, it is a leg pointing the wrong
     way. */
  const stride = await step('swimPoseIsSynchronous', () => {
    const N = window.FRUTARIA, g = window.game;
    const read = (model, sw, t, gait, move) => {
      /* the renderer only hands a stroke to a body the water is holding up, so
         the swim sample carries that too -- it is the pair the draw really gets.
         A stride is not on that clock at all: the phase of a walk comes from the
         ground the body has covered, so a walking sample carries a `gait` and a
         stroking one carries a clock, and passing either in place of the other
         asks the body to do something it has stopped doing */
      const st = { t, gait, phase: 0, move, air: 0, crouch: 0, swim: sw, held: sw };
      const a = {};
      for (const e of g.ensureModel(model)) a[e.part.name] = N.partAngles(e, st);
      return a;
    };
    /* three samples a quarter of a stride apart, and clear of the crossings:
       caught mid-swing and mid-stance, not at the moment a foot hangs under the
       hip it turns on. A stroke's cycle is the clock's; a stride's is one stride
       of ground, and the stride is not a constant this file knows the length of.
       The walk is sampled at the fastest a body goes, where a leg swings furthest
       and a stride is shortest: the claim is that the two sides of a body are
       opposite, and it is easiest to see and hardest to satisfy there. */
    const at = (model, sw) => [0, 1, 2].map(k =>
      read(model, sw, sw ? 0.31 + k * 0.37 : 0, sw ? 0 : 0.30 + k * 0.25, 1));
    const d = (s, a, b) => s.map(x => +(x[a].rx - x[b].rx).toFixed(3));
    const walk = at('bear', 0), land = at('frog', 0), kick = at('frog', 1);
    /* A pair of knees folds in turn and not both at once -- and that is a claim
       about a walk, not about a run. At the fastest a body travels a foot is on
       the ground for 30% of the cycle, so both feet are off the ground together
       for half of it: that is what a run is, and a knee that is off the ground
       is folded. So the pair is sampled at a walking speed, where the two sides
       cannot be in the same act at the same moment, and the fold is read against
       what a knee reaches at that speed instead of against a constant. Sampled
       over a stride and a half, so the extremes are the stride's own. */
    const span = [];
    for (let k = 0; k < 24; k++) span.push(read('bear', 0, 0, k * 0.0625, 0.35));
    const A = span.map(a => Math.abs(a.shinFL.rx)), B = span.map(a => Math.abs(a.shinFR.rx));
    return {
      walk: {
        front: d(walk, 'legFL', 'legFR'), back: d(walk, 'legBL', 'legBR'),
        kneeMax: +Math.max(Math.max(...A), Math.max(...B)).toFixed(3),
        // how bent one knee is on the frame when the other is bent just as much
        kneeBoth: +Math.max(...A.map((v, i) => Math.min(v, B[i]))).toFixed(3)
      },
      // a frog standing on land: its hind legs take no part in a stride at all
      hop: land.map(a => +Math.abs(a.thighL.rx).toFixed(3)),
      kick: {
        thigh: d(kick, 'thighL', 'thighR'), shin: d(kick, 'shinL', 'shinR'),
        front: d(kick, 'legFL', 'legFR'),
        swing: +Math.max(...kick.map(a => Math.abs(a.thighL.rx))).toFixed(3),
        hold: +Math.abs(kick[0].legFL.rx).toFixed(3)
      }
    };
  });
  check('a walking body alternates its legs: left is the mirror of right',
    stride.walk.front.every(v => Math.abs(v) > 0.3) && stride.walk.back.every(v => Math.abs(v) > 0.3), stride);
  check('and its knees fold in turn: one leg of a pair is always straight under it',
    stride.walk.kneeMax > 0.15 && stride.walk.kneeBoth < 0.02, stride);
  check('a frog on land holds its legs: it hops, it does not stride',
    stride.hop.every(v => v === 0), stride);
  check('in the water they are in the same phase: a kick is both legs at once',
    stride.kick.thigh.every(v => v === 0) && stride.kick.shin.every(v => v === 0), stride);
  check('in the water the front legs are held, not walked',
    stride.kick.front.every(v => v === 0) && stride.kick.hold > 0.3, stride);
  check('and the kick swings the hind legs as hard as a stride', stride.kick.swing > 0.3, stride);

  /* 10x. the kick itself, read off the state the draw builds. The two steps
     above can say the pair is in the same phase and that the silhouette is
     symmetric; neither can say what the legs are doing, and what they were
     doing was the complaint: a frog crossing the lake paddled with its feet
     tucked under its chest, moving them a few centimetres, while a body dug
     down on the lakebed kicked away at nothing.
     So the claim is measured where it is made. The `st` handed to the meshes is
     captured off the renderer rather than re-derived here, so this cannot drift
     from the code it measures; the foot box is carried through the two joint
     matrices the draw is about to upload; the cycle is sampled over three
     seconds, longer than any stroke, so the extremes are the stroke's own and
     this file keeps no copy of the kick rate; and the stroke is read on the
     frame the body was travelling fastest on, because a body that has swum into
     the wall of the lake has stopped, and the stroke of a stopped body is not a
     swim.
     What has to hold: a body the water holds up keeps its feet at the back of
     its body and sweeps them along the body's own level, under its belly (a foot
     that comes up as far as it goes back is a leg walking on air); the knee
     never straightens backwards, which is the one thing a hinge cannot do; a
     body standing in the water -- the player dug down on the bed, a wild body
     in water a block deep -- has feet to stand on and stops kicking, and keeps
     the pose it has on dry ground; and the land and air poses are untouched. */
  const kick = await step('kickReadOffTheDraw', () => {
    const N = window.FRUTARIA, g = window.game, W = g.world, p = g.player;
    const was = { form: p.form, x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, faceYaw: p.faceYaw,
      vx: p.vx, vy: p.vy, vz: p.vz, time: g.time, mode: g.mode, tp: g.thirdPerson, vital: p.vital,
      grounded: p.grounded, airAmt: p.airAmt, held: p.held, inWater: p.inWater, cruise: p.cruise,
      crouch: p.crouch, squash: p.squash, dry: p.dry, fright: p.fright, air: p.air,
      cam: { d: g.cam.d, fov: g.cam.fov }, frame: g._camFrame, herd: g.herdCentres };
    p.form = 'frogpear'; p.vital = 10; p.dry = 0; p.fright = 0; p.air = 999;
    g.mode = 'play';
    // the herd's own errand outranks any target set here: it is why a frog
    // parked in the middle of the lake keeps swimming, and it would move the
    // one body this step is watching out of the frame
    const wasHerd = g.herdCentres; g.herdCentres = {};
    // the state handed to the meshes is captured off the renderer, not
    // re-derived here: this is the state the draw is about to upload
    const pm = N.partMatrix, seen = [];
    N.partMatrix = function (out, base, e, st, ps) { if (!st._loc) seen.push(st); return pm.apply(this, arguments); };
    const restore = () => {
      N.partMatrix = pm;
      Object.assign(p, was);
      g.time = was.time; g.mode = was.mode; g.thirdPerson = was.tp; g.herdCentres = was.herd;
      g.cam.d = was.cam.d; g.cam.fov = was.cam.fov; g._camFrame = was.frame;
    };
    /* a column deep enough to float in and to stand in: four blocks of water
       over a bed that is solid. And the shallows of the same lake: one block of
       water under the same surface, which is water enough to wet a body and not
       water enough to hold one up.
       These are looked for together, and over the lake's own disc rather than a
       box guessed at here, because the reading needs three places at once: the
       deep water a body swims and digs down in, a bank of dry level ground six
       metres west of it for the lens to stand on, and a wedge of one-block
       shallows inside the water that lens can actually see. Widening the lake
       moved its whole ring of shallows a dozen metres further out, and a lens
       set six metres west of the first deep column in a fixed box was standing
       in the middle of the water with nothing shallow anywhere in front of it.
       So the three are searched for as one, and of the triples that hold, the
       one with the shallows nearest in front of the lens is taken. */
    const M = N.ZONE_BY_ID.mirrorlake;
    const depth = (x, z) => {
      let top = -1, n = 0;
      for (let y = W.h - 1; y >= 0; y--) {
        if (W.liquidAt(x, y, z)) { if (top < 0) top = y; n++; }
        else if (top >= 0) return W.solidAt(x, y, z) ? { top, n } : null;
      }
      return null;
    };
    const gyAt = (x, z) => { for (let y = W.h - 1; y >= 0; y--) if (W.solidAt(x, y, z)) return y; return -1; };
    // dry, level ground: a body can stand on it and a lens can be held above it
    const bankAt = (x, z) => {
      const gy = gyAt(x, z);
      if (gy < 14) return null;
      if (W.liquidAt(x, gy + 1, z) || W.solidAt(x, gy + 1, z) || W.solidAt(x, gy + 2, z)) return null;
      for (let k = 1; k <= 4; k++) if (gyAt(x, z - k) !== gy) return null;
      return gy;
    };
    /* the lens the draw will use: a body of the human's height standing on that
       bank and looking due east, read third person, so the camera sits CAMD
       behind it on the body's own level and the frame covers HALF degrees above
       and below the axis it looks along. */
    const CAMD = 1.5 + 2.25 * 1.8, EYE = 0.68 * 1.8, HALF = 76 / 2;
    const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1], [0.71, 0.71], [-0.71, 0.71], [0.71, -0.71], [-0.71, -0.71]];
    const deepAt = (x, z) => { const d = depth(Math.floor(x), Math.floor(z)); return !!d && d.n >= 3; };
    /* and the leg has to be water this animal can swim in all the way along, not
       only water deep enough to float a body in for one frame. The crowd's frogs
       are born with a depth of their own to hang at -- `diveTo = 1.5 +
       Math.random() * 2.5`, entities.js -- so the deepest a frog of this kind
       ever goes is the level the water holds a resting body at (the film, less
       the body's own height, less the depth its record says a body of its kind
       hangs at) less 4 m. Where the lakebed stands inside that, the dive is
       clamped to it, the body is held within 0.2 m above the bottom its feet
       would stand on, and the game answers -- correctly -- that the water is not
       holding it up: the legs go back to being feet and the swim pose goes with
       them.
       This rig borrows its body out of the crowd rather than building one, so it
       neither chooses that depth habit nor can be assumed to know it: sent 12 m
       out of the column the search used to pick, in each of 8 headings, 5 of 96
       runs of the crowd's frogs lost the water's hold for 41 to 132 frames and
       were read standing on a bottom they had sunk up to 0.45 m into, and the
       step went red with nothing in the game changed. So the leg is asked for as
       a corridor: every column along it and 2.5 m either side has to hold more
       water than the deepest dive of the animal's kind can reach, plus the 0.2 m
       the hold itself allows. All eight headings out of the column the old
       search picked fail that at every length tried, which is why the fix moves
       the column rather than the heading: Mirrorlake is 1 to 11 blocks of water
       over its 2,970 water columns (docs 02), and only its deepest part keeps a
       corridor that deep for 16 m. On the leg this asks for, 0 of the same 96
       runs lose the hold and no body comes nearer than 5.08 m to a bottom; the
       narrowest water along that leg leaves 4.77 m between the deepest hang of
       the deepest dive and the bed under it, where the leg the old search picked
       reads -4.23 m. */
    const spf = N.CREATURE_BY_ID.frog;
    const DTALL = (N.MODEL_H[spf.model] || 4) * (spf.scale || 0.2);
    const DHOVER = spf.hover === undefined ? 0.3 : spf.hover;
    const DIVE = 4.0;                        // diveTo tops out here, entities.js
    const surfAt = (x, z) => W.liquidSurfaceAt(Math.floor(x), Math.floor(z));
    const bedAt = (x, z) => {
      for (let k = W.h - 1; k > 0; k--) if (W.solidAt(Math.floor(x), k, Math.floor(z))) return k + 1;
      return 1;
    };
    // water between the deepest hang a dive of this animal's kind reaches and
    // the surface its feet would stand on, less the 0.2 m the hold itself allows
    const diveRoom = (x, z) => {
      const ws = surfAt(x, z);
      return ws < 0 ? -99 : (ws - DTALL - DHOVER - DIVE) - (bedAt(x, z) + 0.2);
    };
    const legHeld = (x, z, ax, az, r) => {
      const nx = -az, nz = ax;
      for (let s = 1; s <= r; s += 0.5)
        for (let o = -2.5; o <= 2.5; o += 0.5)
          if (diveRoom(x + 0.5 + ax * s + nx * o, z + 0.5 + az * s + nz * o) <= 0) return false;
      return true;
    };
    let lake = null, shore = null, wade = null, goal = null, wq = 1e9, wang = 0;
    for (let z = M.cz - M.r - 2; z <= M.cz + M.r + 2; z++)
      for (let x = M.cx - M.r - 2; x <= M.cx + M.r + 2; x++) {
        const d = depth(x, z);
        if (!d || d.n < 4) continue;
        const gy = bankAt(x - 6, z);
        if (gy === null) continue;
        let leg = null;
        for (const [ax, az] of DIRS) {
          for (const r of [16, 14, 12]) {
            let ok = true;
            for (let s = 1; s <= r && ok; s += 0.5)
              if (!deepAt(x + 0.5 + ax * s, z + 0.5 + az * s)) ok = false;
            if (ok && legHeld(x, z, ax, az, r)) { leg = { x: x + 0.5 + ax * r, z: z + 0.5 + az * r, r, ax, az }; break; }
          }
          if (leg) break;
        }
        if (!leg) continue;
        // the wedge: one block of water under the lake's own surface, in front
        // of that bank, and low enough on the lens axis for the draw to take it
        const sx = x - 6 + 0.5, sz = z + 0.5, lensX = sx - CAMD, lensY = gy + 1.01 + EYE;
        for (let wx = Math.round(sx) + 2; wx <= M.cx + M.r + 2; wx++)
          for (let wz = Math.round(sz) - 10; wz <= Math.round(sz) + 10; wz++) {
            const dx = wx + 0.5 - sx, dz = wz + 0.5 - sz;
            if (dx < 2 || Math.abs(dz) > dx * 0.6) continue;
            const dd = depth(wx, wz);
            if (!dd || dd.n !== 1 || dd.top !== d.top) continue;
            const q = Math.hypot(dx, dz);
            if (q >= wq) continue;
            const ang = Math.atan((lensY - dd.top) / Math.hypot(wx + 0.5 - lensX, dz)) * 180 / Math.PI;
            if (ang > HALF - 8) continue;
            wq = q; wang = ang;
            lake = { x: x + 0.5, z: z + 0.5, top: d.top, n: d.n };
            shore = { x: sx, z: sz, gy };
            wade = { x: wx + 0.5, z: wz + 0.5, top: dd.top, n: dd.n };
            goal = leg;
          }
      }
    if (!lake) { restore(); return { error: 'no deep water, dry bank and shallow wedge together at the lake' }; }
    // the narrowest water on the leg the search settled on, read the same way
    // the corridor test asked it, from the column the body starts in as well as
    // from the ground it is sent to
    let hold = 99;
    {
      const nx = -goal.az, nz = goal.ax;
      for (let s = 0; s <= goal.r; s += 0.5)
        for (let o = -2.5; o <= 2.5; o += 0.5)
          hold = Math.min(hold, diveRoom(lake.x + goal.ax * s + nx * o, lake.z + goal.az * s + nz * o));
    }
    let dry = null;
    for (let x = 56; x < 112 && !dry; x++) for (let z = 60; z < 140 && !dry; z++) {
      let gy = -1;
      for (let y = W.h - 1; y >= 0; y--) if (W.solidAt(x, y, z)) { gy = y; break; }
      if (gy < 14 || W.liquidAt(x, gy + 1, z) || W.solidAt(x, gy + 1, z) || W.solidAt(x, gy + 2, z)) continue;
      let flat = true;
      for (let k = 1; k <= 4 && flat; k++) {
        let g2 = -1;
        for (let y = W.h - 1; y >= 0; y--) if (W.solidAt(x, y, z - k)) { g2 = y; break; }
        if (g2 !== gy) flat = false;
      }
      if (flat) dry = { x: x + 0.5, z: z + 0.5, y: gy + 1 };
    }
    if (!dry) { restore(); return { error: 'no dry flat ground to compare against' }; }

    const raw = N.MODELS.frog.parts;
    const parts = raw.map(q => ({ part: q, pivot: q.pivot || [0, 0, 0] }));
    const shin = parts.find(e => e.part.name === 'shinL');
    const shinR = parts.find(e => e.part.name === 'shinR');
    const thigh = parts.find(e => e.part.name === 'thighL');
    const footBox = shin.part.boxes[shin.part.boxes.length - 1];
    const bodyBox = raw[0].boxes[0];
    const SC = p.bodyScale();
    const BACK = bodyBox[2] * SC;              // the body's own rear edge, in metres
    const BELLY = bodyBox[1] * SC;            // and the lowest edge of it
    const FLANK = Math.abs(bodyBox[0]) * SC;  // and the flank of it, both sides
    const TOP = (bodyBox[1] + bodyBox[4]) * SC;   // and the back of it, above the belly
    const HIP = thigh.pivot[1] * SC;          // and the hip the hind leg hangs from
    const MID = (bodyBox[2] + bodyBox[5] / 2) * SC;  // and the middle of it, fore and aft
    const capture = (pred) => {
      seen.length = 0;
      const tp = g.thirdPerson; g.thirdPerson = true;
      g.cam.d = 1.5 + 2.25 * p.size()[1];
      g.updateEnv();
      g._camFrame = g.shootCamera(p); g.render(); g._camFrame = null;
      g.thirdPerson = tp;
      const hit = seen.find(pred);
      return hit ? Object.assign({}, hit) : null;
    };
    const worn = () => capture(s => s.t === g.time && s.phase === 0);
    const footAt = (st) => {
      const m = pm.call(N, N.M4.create(), N.M4.create(), shin, st, parts);
      let zlo = 1e9, zhi = -1e9, ylo = 1e9, yhi = -1e9;
      for (const fx of [footBox[0], footBox[0] + footBox[3]])
        for (const fy of [footBox[1], footBox[1] + footBox[4]])
          for (const fz of [footBox[2], footBox[2] + footBox[5]]) {
            const pz = (m[2] * fx + m[6] * fy + m[10] * fz + m[14]) * SC;
            const py = (m[1] * fx + m[5] * fy + m[9] * fz + m[13]) * SC;
            if (pz < zlo) zlo = pz; if (pz > zhi) zhi = pz;
            if (py < ylo) ylo = py; if (py > yhi) yhi = py;
          }
      return { cz: (zlo + zhi) / 2, cy: (ylo + yhi) / 2, ylo, yhi };
    };
    /* how far the legs lie out to the sides, in the body's own frame. The flank
       of the body is at FLANK: a shin whose box reaches past it is a leg splayed
       out at the side of the body rather than folded in under it, and the centre
       of the foot says the same thing more plainly. Both sides are read, because
       the model data is hand-mirrored and a pose that is right on one side can be
       wrong on the other. */
    const splayAt = (st) => {
      let leg = 0, foot = 0, cross = 0, knee = [1e9, -1e9];
      const centres = [];
      for (const e of [shin, shinR]) {
        const m = pm.call(N, N.M4.create(), N.M4.create(), e, st, parts);
        let lo = 1e9, hi = -1e9;
        for (const b of e.part.boxes)
          for (const fx of [b[0], b[0] + b[3]])
            for (const fy of [b[1], b[1] + b[4]])
              for (const fz of [b[2], b[2] + b[5]]) {
                const px = (m[0] * fx + m[4] * fy + m[8] * fz + m[12]) * SC;
                if (px < lo) lo = px;
                if (px > hi) hi = px;
              }
        leg = Math.max(leg, -lo, hi);
        /* and how far this leg reaches past the body's own centre line, onto the
           side of the other one: a foot that does that is a foot pointing in */
        const side = e.part.name.endsWith('L') ? -1 : 1;
        cross = Math.max(cross, side < 0 ? Math.max(0, hi) : Math.max(0, -lo));
        const fb = e.part.boxes[e.part.boxes.length - 1];
        const cx = fb[0] + fb[3] / 2, cy = fb[1] + fb[4] / 2, cz2 = fb[2] + fb[5] / 2;
        const fc = [m[0] * cx + m[4] * cy + m[8] * cz2 + m[12], m[1] * cx + m[5] * cy + m[9] * cz2 + m[13],
          m[2] * cx + m[6] * cy + m[10] * cz2 + m[14]];
        centres.push(fc);
        foot = Math.max(foot, Math.abs(fc[0] * SC));
        /* the fold at the knee, in degrees: the angle at the shin's own pivot
           between the thigh that carries it and the foot the shin carries. 180
           is a leg run out straight behind the body, 0 a leg folded flat up
           against the thigh. Both pivots are read through the thigh's matrix,
           because in this rig the shin's parent is the thigh: the knee rides the
           thigh and the foot rides both. How far apart the two feet are comes
           off the same two centres, and it is the one number that says whether a
           pair of legs gathers and shuts or merely goes up and down. */
        const th = parts.find(q => q.part.name === e.part.parent);
        const mt = pm.call(N, N.M4.create(), N.M4.create(), th, st, parts);
        const pv = (mm, q) => [mm[0] * q[0] + mm[4] * q[1] + mm[8] * q[2] + mm[12],
          mm[1] * q[0] + mm[5] * q[1] + mm[9] * q[2] + mm[13],
          mm[2] * q[0] + mm[6] * q[1] + mm[10] * q[2] + mm[14]];
        const Hp = pv(mt, th.part.pivot), Kp = pv(mt, e.part.pivot);
        const a = [Hp[0] - Kp[0], Hp[1] - Kp[1], Hp[2] - Kp[2]];
        const b2 = [fc[0] - Kp[0], fc[1] - Kp[1], fc[2] - Kp[2]];
        const incl = Math.acos(Math.max(-1, Math.min(1, (a[0] * b2[0] + a[1] * b2[1] + a[2] * b2[2]) /
          (Math.hypot(a[0], a[1], a[2]) * Math.hypot(b2[0], b2[1], b2[2]))))) * 180 / Math.PI;
        if (incl < knee[0]) knee[0] = incl;
        if (incl > knee[1]) knee[1] = incl;
      }
      return { leg: leg - FLANK, foot, cross,
        gap: centres.length === 2 ? Math.abs(centres[0][0] - centres[1][0]) * SC : 0,
        kneeMin: knee[0], kneeMax: knee[1] };
    };
    const stroke = (st0) => {
      if (!st0) return null;
      const cz = [], cy = [];
      let leg = 0, foot = 0, cross = 0, legsum = 0, footsum = 0;
      let gap = [1e9, -1e9], knee = [1e9, -1e9];
      for (let i = 0; i <= 180; i++) {
        const st = Object.assign({}, st0, { t: st0.t + i / 60, _loc: 1 });
        const f = footAt(st);
        cz.push(f.cz); cy.push(f.cy);
        const sp = splayAt(st);
        if (sp.leg > leg) leg = sp.leg;
        if (sp.foot > foot) foot = sp.foot;
        if (sp.cross > cross) cross = sp.cross;
        if (sp.gap < gap[0]) gap[0] = sp.gap;
        if (sp.gap > gap[1]) gap[1] = sp.gap;
        if (sp.kneeMin < knee[0]) knee[0] = sp.kneeMin;
        if (sp.kneeMax > knee[1]) knee[1] = sp.kneeMax;
        legsum += sp.leg; footsum += sp.foot;
      }
      const mx = a => Math.max(...a), mn = a => Math.min(...a);
      const r3 = v => +v.toFixed(3);
      return { swim: r3(st0.swim || 0), held: r3(st0.held || 0), air: r3(st0.air || 0),
        move: r3(st0.move || 0),
        back: r3(mn(cz)), fwd: r3(mx(cz)), travel: r3(mx(cz) - mn(cz)), rise: r3(mx(cy) - mn(cy)),
        footY: [r3(mn(cy)), r3(mx(cy))],
        gapMin: r3(gap[0]), gapMax: r3(gap[1]),
        kneeMin: Math.round(knee[0]), kneeMax: Math.round(knee[1]),
        legOut: r3(leg), footX: r3(foot), footCross: r3(cross),
        legAvg: r3(legsum / 181), footAvg: r3(footsum / 181) };
    };
    const place = (at, y) => {
      p.x = at.x; p.z = at.z; p.y = y; p.vx = p.vy = p.vz = 0; p.yaw = 0; p.faceYaw = 0; p.pitch = 0;
      p.grounded = false; p.airAmt = 0; p.crouch = 0; p.squash = 0; p.bank = 0; p.tilt = 0;
    };
    const snap = () => {
      const st = worn();
      if (!st) return null;
      return { st, body: { y: +p.y.toFixed(2), spd: +Math.hypot(p.vx, p.vz).toFixed(2),
        grounded: p.grounded ? 1 : 0, inWater: p.inWater ? 1 : 0, held: +(p.held || 0).toFixed(2) } };
    };
    const run = (at, y, phases, atFastest) => {
      /* the frame to read the stroke off. A body that swims into the wall of the
         lake comes dead to a stop, and the stroke of a stopped body is not the
         stroke of a swim: where asked, the run is driven twice and the lens
         opens on the frame the body was travelling fastest on. */
      let bi = -1, hit = null;
      const drive = (pick) => {
        place(at, y);
        let i = 0, best = -1, bspd = -1;
        for (const [secs, inp] of phases) {
          const n = Math.round(secs * 60);
          for (let k = 0; k < n; k++, i++) {
            p.update(1 / 60, inp, g);
            const s = Math.hypot(p.vx, p.vz);
            if (s > bspd) { bspd = s; best = i; }
            if (pick && i === bi) hit = snap();
          }
        }
        if (pick) { if (!hit) hit = snap(); } else bi = best;
      };
      if (atFastest) drive(false);
      drive(true);
      const out = stroke(hit.st);
      out.body = hit.body;
      return out;
    };
    const out = { lake, dry, BACK: +BACK.toFixed(3), BELLY: +BELLY.toFixed(3), FLANK: +FLANK.toFixed(3),
      TOP: +TOP.toFixed(3), HIP: +HIP.toFixed(3), MID: +MID.toFixed(3), holdMin: +hold.toFixed(2) };
    out.float = run(lake, lake.top - 1.2, [[4, {}]]);
    out.swim = run(lake, lake.top - 1.2, [[2, { fwd: true }]], true);
    out.dug = run(lake, lake.top - 1.2, [[6, { sneak: true }]]);
    out.land = run(dry, dry.y + 0.01, [[3, {}]]);
    out.hop = run(dry, dry.y + 0.01, [[0.5, { jump: true }], [0.35, {}]]);
    /* and a wild body crossing the lake: the one a person watches. Its phase is
       set to a mark so its state can be picked out of the frame, and the lens
       stands on the bank the triple search put on the far side of the deep water
       so the draw takes it at all. */
    const wf = g.creatures.find(c => c.sp.id === 'frog');
    if (wf) {
      const wasWF = { x: wf.x, y: wf.y, z: wf.z, yaw: wf.yaw, speed: wf.speed, phase: wf.phase,
        tx: wf.tx, tz: wf.tz, pause: wf.pause, state: wf.state, alarm: wf.alarm, sleeping: wf.sleeping };
      wf.phase = 7.77;
      const mark = s => s.phase === 7.77;
      p.form = null; p.x = shore.x; p.z = shore.z; p.y = shore.gy + 1.01; p.vx = p.vy = p.vz = 0;
      p.inWater = false; p.held = 0; p.airAmt = 0; p.grounded = true; p.yaw = Math.PI / 2; p.faceYaw = p.yaw;
      out.wade = wade; out.wadeGap = +wq.toFixed(2); out.wadeAngle = +wang.toFixed(1);
      /* and the lens has to be turned onto the body it is about to read. A
         creature the frame does not contain is not drawn at all: the draw asks
         its own frustum test of a 4 m ball at the body's mid height and throws
         the body away when it fails (`R.visible`, game.js), so a capture taken
         with the body outside the frame finds nothing at all to read. This bank
         stands at 22 with the film of the lake at 15, and the body hangs where
         its kind hangs -- the level the water holds a resting body at and up to
         4 m under that -- so a lens left level with the ground it stands on has
         that whole band under the bottom edge of its frame: over the 12 bodies
         the crowd of this valley actually is, 5 of them were not in the frame the
         draw took at all, and the frame held the whole of that band at 2 of the
         12 places they were read in and at no place along the leg. Turned onto
         the band, 0 of the 12 are out and the band is held the length of the leg.
         The axis of a third-person lens is the line out of the subject's own eye
         (`shootCamera` backs the lens along it), so the pitch that puts a point
         on that axis is read off the eye and the lens distance never enters it. */
      const aimAt = (x, y, z) => {
        const ey = p.y + EYE, dy = y - ey;
        p.pitch = Math.asin(Math.max(-1, Math.min(1, dy / Math.hypot(x - p.x, dy, z - p.z))));
      };
      // the depth band an animal of this kind is born with, at a point of the leg
      const bandAt = (x, z) => { const h = surfAt(x, z) - DTALL - DHOVER; return [h, h - DIVE]; };
      /* the leg has to be a leg. The body used to be pointed 20 m across the
         lake with the wander timer at zero, which let the creature pick itself a
         fresh errand half way over: often enough it picked the shore, ran
         aground, and the pose of a stopped body was then read as the pose of a
         swim -- and the checks below ask for a stroke, which a stopped body does
         not have. So the errand is fixed for the whole leg: a stretch of the
         same deep water 12 to 16 m off, with deep water all the way out to it,
         and the timer stopped so nothing re-picks it. */
      out.wildGoal = goal.r;
      const send = (secs) => {
        wf.x = lake.x; wf.z = lake.z; wf.y = lake.top - 1.2; wf.state = 'wander'; wf.sleeping = false;
        wf.tx = goal.x; wf.tz = goal.z; wf.pause = 9999; wf.alarm = 0;
        /* what the running game left on this body a moment before the rig placed
           it in the water, and the depth habit it was born with: two runs of this
           step put the same frog, in the same water, 0.9 m apart -- y 11.92 with
           the water holding it up, y 11.04 at the bed with nothing holding it up.
           That gap is the body's own `diveTo` meeting the floor of whichever
           column it happened to be over: where the floor is inside the dive the
           game gives the body feet, and the pose of a body standing on the
           lakebed is not the pose of a swim, so the checks below went red without
           anything in the game changing. Recorded here, and answered above by
           choosing a leg the floor of is never inside the dive. */
        out.wildV0 = { vy: +(wf.vy || 0).toFixed(2), spd: +(wf.speed || 0).toFixed(2),
          in: wf.inWater ? 1 : 0, gnd: wf.grounded ? 1 : 0, y: +wf.y.toFixed(2),
          held: +(wf.held || 0).toFixed(2), air: +(wf.airAmt || 0).toFixed(2),
          dive: +(wf.diveTo || 0).toFixed(2) };
        const n = Math.round(secs * 60);
        /* the premise the pose read rests on, kept per run rather than assumed:
           how many of these frames the water's hold was off this body, how close
           it came to the bottom its feet would stand on, and the shallowest room
           of water it read on the way. A body the hold has left is a body with
           feet, and the stroke below is not a stroke of a swim any more. */
        let lost = 0, over = 99, room = 99;
        for (let i = 0; i < n; i++) {
          wf.update(1 / 60, p, W, g); p.update(1 / 60, {}, g);
          if (!wf.inWater) continue;
          if (wf.held < 0.5) lost++;
          const bed = bedAt(wf.x, wf.z);
          over = Math.min(over, wf.y - bed);
          room = Math.min(room, (surfAt(wf.x, wf.z) - 1) - bed);
        }
        /* the frame is turned onto the middle of that band before the body is
           asked out of it, so the read does not depend on how deep this
           particular body happens to have been born hanging */
        const bh = bandAt(wf.x, wf.z);
        aimAt(wf.x, (bh[0] + bh[1]) / 2 + 1, wf.z);
        const s = stroke(capture(mark));
        if (!s) { restore(); return { error: 'the wild body was not in the frame the draw uploads' }; }
        /* the frame that draw took, asked of the game's own cull test at the
           whole band along the whole leg -- not at the depth this body happens to
           hang at, which is the page's business, but at the whole band its kind
           is born with, which is the part of the premise this step can state */
        let bandIn = 1;
        for (let k = 0; k <= goal.r; k += 2) {
          const x = lake.x + goal.ax * k, z = lake.z + goal.az * k, b = bandAt(x, z);
          if (!g.R.visible(x, b[0] + 1, z, 4) || !g.R.visible(x, b[1] + 1, z, 4)) bandIn = 0;
        }
        s.body = { spd: +wf.speed.toFixed(2), y: +wf.y.toFixed(2), held: +(wf.held || 0).toFixed(2),
          inWater: wf.inWater ? 1 : 0, state: wf.state,
          to: +Math.hypot(wf.x - lake.x, wf.z - lake.z).toFixed(1),
          hold: { lost, over: +over.toFixed(2), room: +room.toFixed(2),
            pitch: +p.pitch.toFixed(2), band: bandIn } };
        return s;
      };
      out.wild = send(2);
      // and the same body sitting in the water with nowhere to go
      wf.pause = 9999; wf.alarm = 0;
      for (let i = 0; i < 240; i++) { wf.tx = wf.x; wf.tz = wf.z; wf.update(1 / 60, p, W, g); }
      { const b = bandAt(wf.x, wf.z); aimAt(wf.x, (b[0] + b[1]) / 2 + 1, wf.z); }
      out.wildStill = stroke(capture(mark));
      if (!out.wildStill) { restore(); return { error: 'the wild body at rest was not in the frame the draw uploads' }; }
      out.wildStill.body = { spd: +wf.speed.toFixed(2), held: +(wf.held || 0).toFixed(2), state: wf.state };
      /* and the same body in the shallows: water enough to wet it, not water
         enough to hold it up. This is where a wild body's feet go back to being
         feet, and the one place the creature's own hold -- not the player's --
         decides the pose. */
      if (wade) {
        wf.x = wade.x; wf.z = wade.z; wf.y = wade.top; wf.state = 'wander'; wf.sleeping = false;
        // a body dropped into the shallows by the rig starts from still: the only
        // velocity a creature of this game carries on its own is the height of it
        wf.tx = wade.x; wf.tz = wade.z; wf.pause = 9999; wf.alarm = 0; wf.vy = 0;
        for (let i = 0; i < 120; i++) wf.update(1 / 60, p, W, g);
        // the same lens turned onto this body: it stands on the bottom here, so
        // it is its own height and not a depth band that goes on the axis
        aimAt(wf.x, wf.y + 1, wf.z);
        const s = stroke(capture(mark));
        if (s) s.body = { spd: +wf.speed.toFixed(2), y: +wf.y.toFixed(2), held: +(wf.held || 0).toFixed(2),
          inWater: wf.inWater ? 1 : 0, state: wf.state };
        out.wildWade = s;
      }
      Object.assign(wf, wasWF);
    }
    restore();
    return out;
  });
  const kSw = kick.swim, kFl = kick.float, kDg = kick.dug, kLd = kick.land, kWl = kick.wild;
  /* A leg the rig could not read is a red check, not a crash. The step names the
     body it failed to find, and the numbers that were never collected are answered
     "no" -- a missing reading must not be allowed to satisfy a ceiling the way an
     undefined one does -- so that the rest of the page's readings survive it. */
  for (const k of [kFl, kSw, kDg, kLd, kWl]) {
    if (!k || !k.error) continue;
    check('the kick rig found the body it went to read: ' + k.error, false, kick);
    k.body = { inWater: 0, grounded: 0, spd: 0, held: 0, state: 'unread', to: 0,
      hold: { lost: 0, over: 0, room: 0, pitch: 0, band: 0 } };
    k.footY = [1e9, 1e9];
  }
  check('the lake this runs on is four blocks deep at the least and the body floats in it',
    !!kFl && kFl.held > 0.9 && kFl.body.inWater === 1 && kFl.body.grounded === 0, kick);
  /* A body the water is holding up, going nowhere, holds its legs in the pose
     the water holds them in. The stroke used to have a floor under it: the draw
     was handed at least 0.18 of a stroke whenever a body was in water with the
     hold on it, so a frog sitting in the middle of the lake with no key held ran
     its feet 1.55 m through 4 s of water -- a body pushing water in no direction
     at all, which is the one thing every animal on that lake does not do. A
     stroke is the thing that pushes a body along, so it is sized by the water the
     body is actually pushing, and at a standstill there is none: the feet stay
     where the hold puts them, 0.17 m behind the rear of the body and 0.085 m
     under its origin, and they do not move. The wild body sitting in the water
     with nowhere to go says the same for the animals. */
  check('a body the water holds up that is going nowhere holds its legs still: it does not kick at the lake',
    !!kFl && !!kick.wildStill && kFl.travel <= 0.002 && kFl.rise <= 0.002 &&
    kick.wildStill.travel <= 0.002 && kick.wildStill.rise <= 0.002, kick);
  check('a floating frog keeps its feet behind the body it hangs them from, not under its chest',
    !!kFl && kFl.fwd <= kick.BACK + 0.05 && kFl.back <= kick.BACK + 0.005, kick);
  check('a swimming frog sweeps its feet well behind the body and a long way',
    !!kSw && kSw.back <= kick.BACK - 0.08 && kSw.travel >= 0.25, kick);
  /* The fold of a breaststroke happens beside the hips, under the rear of the
     body: the foot comes forward to 0.10 m behind the body's rear edge and no
     further, and the drive then runs it back out to 0.43 m behind it. The sine
     this replaces took the foot 0.03 m in front of the body's own centre, which
     is a foot sweeping through the water under the animal's chest -- where it
     can push the body nowhere at all. */
  check('and the gathered foot stays under the rear of the body, never under its middle',
    !!kSw && !!kWl && kSw.fwd <= kick.MID - 0.05 && kWl.fwd <= kick.MID - 0.05, kick);
  check('the sweep is a sweep: further along the body than up and down',
    !!kSw && !!kWl && kSw.rise <= kSw.travel * 0.75 && kWl.rise <= kWl.travel * 0.75, kick);
  check('and the foot never comes up over the back of the body: it streams out at the height its own hip hangs it at',
    !!kSw && !!kWl && kSw.footY[1] <= kick.TOP && kWl.footY[1] <= kick.TOP, kick);
  /* the fold at the knee, read as the angle between the two segments that meet
     at it and not as the difference of the two authored angles: that difference
     runs from -1.6 to +0.9 through the stroke while the knee itself folds from 49
     deg to 175, so it says nothing at all about the leg. 180 deg is a leg run out
     straight behind the body, and the old sine took the knee to 179 deg and no
     further: it never folded the leg under the body, which is the half of a
     breaststroke that moves the water. */
  check('the knee folds under the body and runs out straight again, and never goes past straight',
    !!kSw && kSw.kneeMin >= 25 && kSw.kneeMin <= 70 && kSw.kneeMax >= 165 && kSw.kneeMax <= 178, kick);
  /* and the pair of them, which is what the eye actually reads: the two feet open
     to 0.54 m across at the gather, beside the hips and out past the flanks, and
     shut to 0.16 m apart behind the body at the end of the drive. The sine kept
     them 0.07-0.12 m apart through the whole cycle, each leg going up and down
     under itself, and from behind the body changed no shape whatever. */
  check('the stroke is a breaststroke: the pair gathers wide beside the hips and shuts behind the body',
    !!kSw && kSw.gapMax >= 0.45 && kSw.gapMin <= 0.25, kick);
  check('the wild body was still crossing when its stroke was read',
    !!kWl && kWl.body.inWater === 1 && kWl.body.spd > 1, kick);
  /* That pose is the pose of a swim only while the water has its hold on the
     body, and the rig above keeps that premise beside the reading rather than
     assuming it: the leg is asked for as water no dive of the animal's kind can
     reach the floor of, and the run is watched for the frames the hold was off
     this body and for how close its feet came to a bottom. Take the corridor test
     out of the search and both checks below go red with the stroke itself not
     moving at all: the leg the old search picks reads -4.23 m at its narrowest,
     and the body borrowed for that run came to within 2.68 m of the bottom it was
     standing on. The stroke read there is the stroke of a body with feet, and the
     pose checks above catch that only now and then -- which is the flake these
     two are here to catch rather than hide. */
  check('the leg that body is sent down is water no dive of its kind can reach the floor of',
    kick.holdMin >= 4, kick);
  check('and the pose was read off a body the water was holding up: the hold never left it on the leg, and the lakebed stayed 4 m under its feet',
    !!kWl && kWl.body.hold.lost === 0 && kWl.body.hold.over >= 4, kick);
  /* and the frame the body was read out of, which the rig has to earn: the draw
     throws away any creature its own frustum test does not contain, so a body
     hanging 11 to 15 m under a lens left level with the bank it stands on is not
     in the state the draw uploads at all, and a capture taken there reads
     nothing. Left level here, the crowd's own 12 bodies put 5 of themselves out
     of the frame at the moment they were read, and the depth band their kind is
     born with was inside the frame at 2 of those 12 read points and at no point
     along the leg; turned onto that band -- 1.09 rad down on this place -- the
     band is inside the whole length of the leg and none of the 12 is out. Take
     the aim out of the rig and this check goes red on every page, which is the
     thing a run of the whole suite used to pay for with a TypeError instead. */
  check('and the frame that body was read out of holds the whole depth band its kind is born with, the length of that leg',
    !!kWl && kWl.body.hold.band === 1, kick);
  check('a wild frog crossing the lake kicks the same way, feet behind it',
    !!kWl && kWl.held === 1 && kWl.back <= kick.BACK - 0.08 && kWl.travel >= 0.15, kick);
  check('a body dug down on the bed has feet to stand on and stops kicking',
    !!kDg && kDg.body.grounded === 1 && kDg.swim === 0 && kDg.held === 0, kick);
  check('and it keeps the pose it has on dry ground',
    !!kDg && !!kLd && Math.abs(kDg.back - kLd.back) < 0.002 && kLd.fwd > kick.BACK + 0.1, kick);
  check('the land and air poses are untouched: standing keeps its feet under it, a hop takes them behind',
    !!kLd && !!kick.hop && kLd.back > kick.BACK && kick.hop.air > 0.5 && kick.hop.back < kick.BACK, kick);
  check('a wild body standing in water too shallow to hold it up has feet, not a kick',
    !!kick.wildWade && kick.wildWade.body.inWater === 1 && kick.wildWade.held === 0 &&
    kick.wildWade.swim === 0 && kick.wildWade.back > kick.BACK, kick);
  /* and the legs are out at the body's own sides, not crossed under it. The
     hold's roll used to turn the other way, and that carried each webbed foot
     over the other: read off the same matrices, a foot reached 0.115 m past the
     centre line of its own body floating and 0.119 m swimming, both feet pointed
     in, and the leg came only 0.024 m and 0.052 m past the flank -- a frog seen
     from behind was a pair of legs crossed under itself. Turned out, the centre
     of a foot sits 0.234 m out on its own side floating and 0.272 m out swimming,
     no foot ever reaches the centre line, and the leg stands 0.147 m past the
     flank at rest and 0.176 m at the widest point of the stroke. That is well out
     past the haunch of the land pose, which stands 0.078 m past the flank with
     the foot 0.181 m off the centre line -- and it has to be further out than
     that, because a webbed foot is a paddle and a paddle that never leaves the
     shadow of its own body pushes nothing. It is not more than a foot further
     out, though: the foot is 0.133 m across, and a frog floating against the wall
     of the lake has its feet in the rock if the leg reaches much beyond the
     haunch plus one foot. The widest the leg ever gets is at a slow stroke, not a
     fast one -- 0.192 m at 0.42 of the stroke against 0.175 m at the full stroke,
     read over the whole range of stroke strengths -- which is the way a body
     holds itself: legs out while it picks its way, legs in line when it is going
     somewhere. A body standing in water keeps the land pose, and its foot stays
     where the land pose puts it.
     A body that is turning reaches wider still, and that is the turn and not a
     fault: the leg on the outside of the arc has to reach out to push the body
     round it. Read over the whole range of turn rates at the whole range of
     stroke strengths, the widest the leg gets is 0.207 m -- a body at 0.42 of its
     stroke, turning at the tightest arc its body holds -- against 0.192 m going
     straight, and the foot that crosses the centre line of its own body gets
     0.009 m past it at a full stroke against 0.005 m going straight. See
     `turningBodyKicksWithItsOutsideLeg` below. */
  check('a body the water holds up holds its feet out at its own sides, not crossed under itself',
    !!kFl && !!kSw && !!kWl && kFl.footX >= 0.18 && kSw.footX >= 0.25 && kWl.footX >= 0.25, kick);
  check('and neither foot reaches across the centre line of its own body',
    !!kFl && !!kSw && !!kWl && kFl.footCross <= 0.012 && kSw.footCross <= 0.012 &&
    kWl.footCross <= 0.012, kick);
  check('the water legs stay within a webbed foot of the haunch they hang from',
    !!kSw && !!kWl && !!kLd && kSw.legOut <= 0.23 && kWl.legOut <= 0.23 &&
    kLd.legOut <= 0.09 && kLd.footX >= 0.15, kick);

  /* 10y. a body turning in the water kicks with the leg on the outside of the
     turn. Every number the two steps above read is the same for the left leg and
     the right, and that is right for a body going straight and wrong for one that
     is not: a body carving an arc came round with both legs stroking identically,
     so the turn was something happening to it rather than something it was doing,
     and the tell was plainest at the edge of the lake, where a body has to turn
     to stay in the water. It leaned -- the lean had been there since the arc was
     put in -- and its legs went on cycling symmetrically underneath it.
     A breaststroke turn is one leg reaching out and the other hardly reaching at
     all: the leg on the outside of the arc has to carry the body round as well as
     along it, and the leg on the inside is being dragged. So the claim is read
     off the foot, on a body that is really turning. The state the draw uploads is
     captured off the renderer exactly as in the step above; the body is driven
     with its aim swung at a steady rate, which is what makes it hold an arc
     instead of a line; and the cycle is then walked over three seconds of the
     stroke's own clock, so the extremes are the stroke's own and this file keeps
     no copy of the stroke rate.
     Which leg is which is worth spelling out once, because it is not what the
     names say. The model is authored facing +z and `M4.faceY` turns it by PI -
     yaw, so the model's own +x lands on the body's left: the parts named `thighR`
     and `shinR` hang on the animal's left side and the pair named L on its right.
     A heading that grows is a turn to the body's own right. A right turn
     therefore has to show the R parts working harder, and that is the whole
     claim -- and it is also the reason the turn rate handed to the draw is
     signed, which it was not: read with `Math.abs`, the lean was the same
     whichever way the body turned, and every body banked away from half of its
     own turns. */
  const turn = await step('turningBodyKicksWithItsOutsideLeg', () => {
    const N = window.FRUTARIA, g = window.game, W = g.world, p = g.player;
    const was = { form: p.form, x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, faceYaw: p.faceYaw,
      vx: p.vx, vy: p.vy, vz: p.vz, time: g.time, mode: g.mode, vital: p.vital, dry: p.dry,
      fright: p.fright, air: p.air, grounded: p.grounded, bank: p.bank, bend: p.bend,
      cam: { d: g.cam.d, fov: g.cam.fov }, frame: g._camFrame, tp: g.thirdPerson };
    p.form = 'frogpear'; p.vital = 10; p.dry = 0; p.fright = 0; p.air = 999;
    g.mode = 'play';
    /* water deep enough to float in, and deep for ten metres in each direction
       out of it: a body holding an arc covers ground, and one that runs aground
       stops turning, which is not a turn to read a turn off */
    const depth = (x, z) => {
      let top = -1, n = 0;
      for (let y = W.h - 1; y >= 0; y--) {
        if (W.liquidAt(x, y, z)) { if (top < 0) top = y; n++; }
        else if (top >= 0) return W.solidAt(x, y, z) ? { top, n } : null;
      }
      return null;
    };
    let spot = null, room = 0;
    for (let z = 74; z < 140; z += 2) for (let x = 46; x < 112; x += 2) {
      const d = depth(x, z);
      if (!d || d.n < 6) continue;
      let r = 1e9;
      for (let q = 2; q <= 12 && r > 6; q += 2)
        for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const e = depth(x + ax * q, z + az * q);
          if (!e || e.n < 3) r = Math.min(r, q);
        }
      if (r > room) { room = r; spot = { x: x + 0.5, z: z + 0.5, top: d.top }; }
    }
    if (!spot) return { error: 'no lake with room to hold an arc' };
    const raw = N.MODELS.frog.parts;
    const parts = raw.map(q => ({ part: q, pivot: q.pivot || [0, 0, 0] }));
    const by = {}; for (const e of parts) by[e.part.name] = e;
    const SC = p.bodyScale();
    const FLANK = Math.abs(raw[0].boxes[0][0]) * SC;   // the flank of the body itself
    /* the webbed foot, carried through the two joints the draw is about to
       upload: how far along the body it has gone, how far out past the flank the
       leg reaches, how far it has actually travelled through the water -- which
       is the water this leg pushed -- and how far it has crossed the body's own
       centre line, which is the one thing it must never do */
    const foot = (nm, st) => {
      const e = by[nm], m = N.partMatrix(N.M4.create(), N.M4.create(), e, st, parts);
      const bx = e.part.boxes[e.part.boxes.length - 1];
      const cx = bx[0] + bx[3] / 2, cy = bx[1] + bx[4] / 2, cz = bx[2] + bx[5] / 2;
      let lo = 1e9, hi = -1e9;
      for (const b of e.part.boxes)
        for (const fx of [b[0], b[0] + b[3]])
          for (const fy of [b[1], b[1] + b[4]])
            for (const fz of [b[2], b[2] + b[5]]) {
              const px = m[0] * fx + m[4] * fy + m[8] * fz + m[12];
              if (px < lo) lo = px; if (px > hi) hi = px;
            }
      const side = nm.endsWith('L') ? -1 : 1;
      return { x: m[0] * cx + m[4] * cy + m[8] * cz + m[12],
        y: m[1] * cx + m[5] * cy + m[9] * cz + m[13],
        z: m[2] * cx + m[6] * cy + m[10] * cz + m[14],
        leg: Math.max(-lo, hi) * SC - FLANK,
        cross: (side < 0 ? Math.max(0, hi) : Math.max(0, -lo)) * SC };
    };
    const stroke = (st0) => {
      const r = {};
      for (const nm of ['shinL', 'shinR']) {
        let zlo = 1e9, zhi = -1e9, ylo = 1e9, yhi = -1e9, leg = 0, cross = 0, path = 0, prev = null;
        for (let i = 0; i <= 180; i++) {
          const st = Object.assign({}, st0, { t: st0.t + i / 60, _loc: 1 });
          const q = foot(nm, st);
          if (q.z < zlo) zlo = q.z; if (q.z > zhi) zhi = q.z;
          if (q.y < ylo) ylo = q.y; if (q.y > yhi) yhi = q.y;
          if (q.leg > leg) leg = q.leg;
          if (q.cross > cross) cross = q.cross;
          if (prev) path += Math.hypot(q.x - prev.x, q.z - prev.z);
          prev = q;
        }
        r[nm] = { fore: +((zhi - zlo) * SC).toFixed(3), rise: +((yhi - ylo) * SC).toFixed(3),
          leg: +leg.toFixed(3), cross: +cross.toFixed(3), path: +(path * SC).toFixed(3) };
      }
      return r;
    };
    // the state the renderer hands the meshes, off the renderer itself
    const pm = N.partMatrix, seen = [];
    N.partMatrix = function (o, b, e, st, ps) {
      if (!st._loc && e.part.name === 'body' && st.phase === 0 && st.t === g.time) seen.push(st);
      return pm.apply(this, arguments);
    };
    const restore = () => {
      N.partMatrix = pm;
      Object.assign(p, was);
      g.time = was.time; g.mode = was.mode; g.thirdPerson = was.tp;
      g.cam.d = was.cam.d; g.cam.fov = was.cam.fov; g._camFrame = was.frame;
    };
    const drive = (aim) => {
      p.x = spot.x; p.z = spot.z; p.y = spot.top - 1.2;
      p.vx = 0; p.vy = 0; p.vz = 0; p.yaw = 0; p.pitch = 0;
      p.faceYaw = 0; p.bank = 0; p.bend = 0; p.grounded = false;
      let turned = 0;
      for (let i = 0; i < 100; i++) {
        p.yaw += aim / 60;                       // the aim swung at a steady rate
        p.update(1 / 60, { fwd: true }, g);
      }
      turned = N.angleDelta(0, Math.atan2(p.vx, -p.vz));
      seen.length = 0;
      const tp = g.thirdPerson; g.thirdPerson = true;
      g.cam.d = 1.5 + 2.25 * p.size()[1];
      g.updateEnv(); g._camFrame = g.shootCamera(p); g.render(); g._camFrame = null;
      g.thirdPerson = tp;
      const st = seen.length ? Object.assign({}, seen[0]) : null;
      if (!st) return { error: 'the draw handed no state for this body' };
      const out = stroke(st);
      out.turn = +(st.turn || 0).toFixed(3);
      out.swim = +(st.swim || 0).toFixed(3);
      out.bend = +p.bend.toFixed(3);
      out.bank = +p.bank.toFixed(3);
      out.turned = +turned.toFixed(2);
      out.spd = +Math.hypot(p.vx, p.vz).toFixed(2);
      return out;
    };
    const out = { spot, straight: drive(0), right: drive(1.5), left: drive(-1.5) };
    restore();
    return out;
  });
  const tStr = turn.straight, tR = turn.right, tL = turn.left;
  check('a body swimming straight strokes both legs alike: the turn has not touched them',
    !!tStr && tStr.turn === 0 && tStr.spd > 3 &&
    tStr.shinL.fore === tStr.shinR.fore && tStr.shinL.path === tStr.shinR.path &&
    tStr.shinL.leg === tStr.shinR.leg, turn);
  check('a body that is really turning is holding an arc, not a line',
    !!tR && !!tL && Math.abs(tR.turned) > 1 && Math.abs(tL.turned) > 1 &&
    tR.turned * tL.turned < 0 && tR.spd > 3, turn);
  /* the model's R parts hang on the animal's left side (see the note above), and
     a heading that grows is a turn to its own right: a right turn is the left leg
     doing the work, and it is doing it by reaching further along the body,
     further past the flank, and by carrying more water */
  check('a body turning right drives the leg on its own left harder',
    !!tR && tR.turn > 1 && tR.shinR.fore > tR.shinL.fore * 1.15 &&
    tR.shinR.path > tR.shinL.path * 1.2 && tR.shinR.leg > tR.shinL.leg + 0.01, turn);
  check('and the leg on its inside is being dragged: it strokes less than it does going straight',
    !!tR && tR.shinL.fore < tStr.shinL.fore * 0.95 && tR.shinL.path < tStr.shinL.path * 0.95, turn);
  check('turning left is the same turn the other way: the two legs swap',
    !!tL && tL.turn < -1 && Math.abs(tL.turn - -tR.turn) < 0.05 &&
    Math.abs(tL.shinL.fore - tR.shinR.fore) < 0.02 &&
    Math.abs(tL.shinR.fore - tR.shinL.fore) < 0.02 &&
    Math.abs(tL.shinL.path - tR.shinR.path) < 0.02, turn);
  check('the body leans into the turn it is making, and the other way for the other turn',
    tR.bank > 0.2 && tL.bank < -0.2 && Math.abs(tR.bank + tL.bank) < 0.02, turn);
  check('and a turning body still sweeps its feet further along the body than up and down',
    tR.shinR.rise < tR.shinR.fore * 0.75 && tR.shinL.rise < tR.shinL.fore * 0.75 &&
    tR.shinR.cross <= 0.012 && tR.shinL.cross <= 0.012 &&
    tR.shinR.leg <= 0.23 && tR.shinL.leg <= 0.23, turn);

  /* 10w. and the body that is drawn never reaches under the ground it is
     standing on. Everything above asks what the legs are *doing*; this asks
     where they end up, in the world, against the surface the body is standing
     on -- which is the complaint B19 arrives with, in the reporter's own words:
     the model pokes through the surface it stands on. It is read off the
     matrices the renderer uploads, so
     it cannot drift from the draw: the meshes of the body being worn are
     matched by identity out of `R.drawMesh`, and the box corners of the model
     data are carried through them.
What was measured before any of this was fixed, over 180 frames of walking
     and 120 of standing on a flat clearing with nothing to collide with: a
     frog drove its shin 0.164 m under the floor it stood on in 169 frames of
     360 and its body 0.148 m in 52 of 180 -- the leg was longer than the hip
     was high, it was being swung through the whole cycle whether or not the
     body was hopping, and the fold was timed for the stance instead of the
     swing; a body landing from a hop swept its foot 0.154 m through the ground
     on the way into the flight pose, because the pose is eased and the body's
     own origin does not move with it; a bear walking had its hind foot 0.091 m
     under the floor in 32 frames of 180 and its front foot in 32 more, because
     a knee that folds while the foot is still on the ground has no ankle to
     fold at, and the body breathing on top of it pushed the whole limb down
     another 4 cm with every step; a person its boot 0.032 m in 32 of 180; and
     an owl its toe 0.063 m under in 106 of 180 and 0.055 m in 17 of 120,
     because it read one frame of gravity as a dive and then kept the pitch of
     that dive for a quarter of a second after its feet had arrived.
     What closes them is in models.js -- the limb lifts by as much as its own
     swing drives it under, and refuses to be carried down when the body above
     it breathes -- and in entities.js: the pitch belongs to a body above the
     level it would be standing at, and the ground takes the pitch back in the
     frame the feet arrive.
     What is left, and stated rather than hidden: the frames that still reach
     0.03 m are the last moment of a fall, the body a couple of centimetres
     above the surface and coming in at 0.42 rad -- its toes are through the
     surface for one frame before the body lands on it. The bound below is
     where the bodies are today plus a hand of room; it is there to keep this
     from getting worse, and all four were red before the fix. */
  const planted = await step('feetStayOnTheirGround', () => {
    const N = window.FRUTARIA, g = window.game, W = g.world, p = g.player, R = g.R;
    const was = { form: p.form, formT: p.formT, formMax: p.formMax, x: p.x, y: p.y, z: p.z,
      vx: p.vx, vy: p.vy, vz: p.vz, yaw: p.yaw, pitch: p.pitch, faceYaw: p.faceYaw,
      bank: p.bank, tilt: p.tilt, squash: p.squash, grounded: p.grounded, airAmt: p.airAmt,
      held: p.held, inWater: p.inWater, cruise: p.cruise, crouch: p.crouch, vital: p.vital,
      dry: p.dry, fright: p.fright, air: p.air };
    const wasG = { mode: g.mode, tp: g.thirdPerson, time: g.time, herd: g.herdCentres,
      camD: g.cam.d, camFov: g.cam.fov, frame: g._camFrame };
    const back = () => {
      Object.assign(p, was);
      g.mode = wasG.mode; g.thirdPerson = wasG.tp; g.time = wasG.time;
      g.herdCentres = wasG.herd; g.cam.d = wasG.camD; g.cam.fov = wasG.camFov;
      g._camFrame = wasG.frame;
    };
    p.vital = 10; p.dry = 0; p.fright = 0; p.air = 999;
    g.mode = 'play'; g.thirdPerson = true; g.cam.d = 3;
    g.herdCentres = {};
    // a dry flat stretch to walk down: the longest run of one height, clear above
    const dry = (x, z) => {
      let gy = 0;
      for (let y = W.h - 1; y > 0; y--) if (W.solidAt(x, y, z)) { gy = y + 1; break; }
      if (gy < 12) return -1;
      for (let y = gy; y <= gy + 3; y++) if (W.liquidAt(x, y, z)) return -1;
      return gy;
    };
    let field = null, cand = 0;
    for (let x = 8; x < W.w - 8; x++) for (let z = W.d - 9; z > 40; z--) {
      const gy = dry(x, z);
      if (gy < 0) continue;
      cand++;
      let len = 1;
      while (dry(x, z - len) === gy) len++;
      // the walk goes -z at yaw 0: the stretch has to be ahead, not behind
      if (!field || len > field.len) field = { x: x + 0.5, z: z + 0.5, gy, len };
    }
    const out = { field, cand };
    if (!field || field.len < 22) { back(); return out; }
    /* the matrices the draw really uploaded: the meshes of the body being worn,
       matched by object identity, so this is the frame and not a copy of it */
    const got = new Map(), watch = new Set(), corners = new Map();
    let meshOf = {}, parentOf = {};
    const realDraw = R.drawMesh;
    R.drawMesh = function (mesh, m) { if (watch.has(mesh)) got.set(mesh, m.slice()); return realDraw.apply(this, arguments); };
    const measure = () => {
      const floor = N.standY(W, Math.floor(p.x), Math.floor(p.z), p.y);
      let d = 0, who = null;
      // the highest and the lowest edge each part reaches this frame, so a limb
      // that has come adrift of the part it hangs from can be seen as a gap
      const lo = new Map(), hi = new Map();
      for (const [mesh, m] of got) {
        let a = 1e9, z = -1e9;
        for (const bx of corners.get(mesh))
          for (const fx of [bx[0], bx[0] + bx[3]])
            for (const fy of [bx[1], bx[1] + bx[4]])
              for (const fz of [bx[2], bx[2] + bx[5]]) {
                const y = m[1] * fx + m[5] * fy + m[9] * fz + m[13];
                const dip = floor - y;
                if (dip > d) { d = dip; who = bx._who; }
                if (y < a) a = y; if (y > z) z = y;
              }
        lo.set(mesh, a); hi.set(mesh, z);
      }
      let gap = 0, gapWho = null;
      for (const name in meshOf) {
        const pn = parentOf[name], cm = meshOf[name], pm = meshOf[pn];
        if (!pn || !pm || !lo.has(cm) || !lo.has(pm)) continue;
        const g = lo.get(pm) - hi.get(cm);      // the part above, clear of the part below it
        if (g > gap) { gap = g; gapWho = name + '/' + pn; }
      }
      return { d, who, gap, gapWho };
    };
    const run = (label, form, keys, frames) => {
      p.form = form; p.formT = 9999; p.formMax = 9999;
      p.x = field.x; p.y = field.gy + 1; p.z = field.z;
      p.vx = p.vy = p.vz = 0; p.yaw = 0; p.faceYaw = 0; p.pitch = 0;
      p.bank = 0; p.tilt = 0; p.squash = 0; p.crouch = 0;
      p.grounded = true; p.airAmt = 0; p.held = 0; p.inWater = false; p.cruise = 0;
      const parts = g.ensureModel(p.modelId);
      const byName = {};
      for (const q of N.MODELS[p.modelId].parts) byName[q.name] = q;
      watch.clear(); corners.clear(); meshOf = {}; parentOf = {};
      for (const q of N.MODELS[p.modelId].parts) { meshOf[q.name] = null; parentOf[q.name] = q.parent; }
      for (const e of parts) {
        const q = byName[e.part.name];
        if (!e.mesh || !q || !q.boxes) continue;
        const bs = q.boxes.map(b => { const a = b.slice(); a._who = q.name; return a; });
        watch.add(e.mesh); corners.set(e.mesh, bs); meshOf[q.name] = e.mesh;
      }
      let worst = 0, bad = 0, sum = 0, who = null, at = null, gap = 0, gapWho = null;
      for (let i = 0; i < frames; i++) {
        p.update(1 / 60, keys, g);
        g.time += 1 / 60;
        got.clear();
        g.updateEnv(); g._camFrame = g.shootCamera(p); g.render(); g._camFrame = null;
        const m = measure();
        if (m.d > 0.02) { bad++; sum += m.d; }
        if (m.gap > gap) { gap = m.gap; gapWho = m.gapWho; }
        if (m.d > worst) {
          worst = m.d; who = m.who;
          at = { tilt: +(p.tilt || 0).toFixed(2), bank: +(p.bank || 0).toFixed(2),
            air: +(p.airAmt || 0).toFixed(2), gr: p.grounded ? 1 : 0,
            move: +Math.min(1, Math.hypot(p.vx, p.vz) / 5).toFixed(2),
            sq: +(p.squash || 0).toFixed(2), spd: +Math.hypot(p.vx, p.vz).toFixed(2) };
        }
      }
      out[label] = { frames, bad, worst: +worst.toFixed(3), mean: +(sum / Math.max(bad, 1)).toFixed(3),
        gap: +gap.toFixed(3), gapWho, who, at };
    };
    const go = { fwd: true, back: false, left: false, right: false, jump: false, sneak: false, sprint: false };
    const still = { fwd: false, back: false, left: false, right: false, jump: false, sneak: false, sprint: false };
    for (const f of ['frogpear', null, 'bruinfig', 'owlberry']) {
      const nm = f === null ? 'human' : f;
      run('walk-' + nm, f, go, 180);
      run('stand-' + nm, f, still, 120);
    }
    R.drawMesh = realDraw;
    back();
    return out;
  });
  /* 5 cm, the same for every body: the walk and the stand are at 0.007 or
     better, and the one frame left is a landing seen a frame too early. The
     fraction is the part with teeth -- before the fix a bear's foot was under
     the floor in a fifth of the frames of its walk and an owl's in three of
     every five. */
  const PLANT = 0.05;
  for (const f of ['frogpear', 'human', 'bruinfig', 'owlberry']) {
    const pw = planted['walk-' + f], ps = planted['stand-' + f];
    check(`the drawn ${f} never reaches under the ground it stands on`,
      !!pw && !!ps && pw.worst < PLANT && ps.worst < PLANT &&
      pw.bad < pw.frames * 0.05 && ps.bad < ps.frames * 0.05, planted);
  }
  /* The other way a limb can be wrong: the lift that keeps a foot out of the
     ground, and the refusal to be carried down when the body above it breathes,
     both move a limb relative to the part it hangs from. Carved too short, and
     the leg leaves the body altogether -- an owl whose leg reached 1.2 cm clear
     of the body it hangs off, a slit of sky where the hip should be. 5 mm is the
     margin: every body sits at 0, because a limb is carved well inside the part
     above it. */
  check('no part of a walking body is drawn adrift from the part it hangs from',
    ['walk-frogpear', 'stand-frogpear', 'walk-human', 'stand-human', 'walk-bruinfig',
      'stand-bruinfig', 'walk-owlberry', 'stand-owlberry']
      .every(k => planted[k] && planted[k].gap < 0.005), planted);

  /* The step above asks whether a foot gets under the ground. This one asks the
     other half of the same question: whether a foot that has reached the ground
     stays there while the body goes past it.
     That is the one thing a walk cycle is for, and the cycle used to be one
     clock for every legged body while the body was driven along by its own
     speed, and the two had never been spoken to. Read off the matrices the draw
     uploads, a bear's foot was travelling along the ground at 2.3 m/s while its
     body went past at 2.1, and a person's at 3.0 against 4.1: a foot was on the
     ground for four frames in five and held still in none of them, and the whole
     animal was skating on grass. It is not a tuning problem -- a foot is at the
     bottom of a sine's arc exactly where that sine is turning over fastest, so
     the fastest moment of the swing is the moment the foot needs to be at its
     slowest, and no rate fixes that.
     So this is measured where it is made, and with no copy of the stride kept
     here: the sole of a standing limb is the middle of the bottom face of the
     lowest box on that limb, carried through the matrix the renderer really
     uploaded for it, and "on the ground" is said by the ground -- a sole within
     2 cm of the surface the body stands on. What a foot travels along the ground
     while it is on it, against the ground the body covered in those same frames,
     is the slip. It is a fraction and not a distance, because a fast body covers
     more ground per step and a foot that slides a tenth as fast as its body is a
     foot that has not landed whatever the stride is.
     The frog is not in this list and says why below. */
  const hold = await step('feetHoldTheirGround', () => {
    const N = window.FRUTARIA, g = window.game, W = g.world, p = g.player, R = g.R;
    const was = { form: p.form, formT: p.formT, formMax: p.formMax, x: p.x, y: p.y, z: p.z,
      vx: p.vx, vy: p.vy, vz: p.vz, yaw: p.yaw, pitch: p.pitch, faceYaw: p.faceYaw,
      bank: p.bank, tilt: p.tilt, squash: p.squash, grounded: p.grounded, airAmt: p.airAmt,
      held: p.held, inWater: p.inWater, cruise: p.cruise, crouch: p.crouch, vital: p.vital,
      dry: p.dry, fright: p.fright, air: p.air, gait: p.gait };
    const wasG = { mode: g.mode, tp: g.thirdPerson, time: g.time, herd: g.herdCentres,
      camD: g.cam.d, camFov: g.cam.fov, frame: g._camFrame };
    const back = () => {
      Object.assign(p, was);
      g.mode = wasG.mode; g.thirdPerson = wasG.tp; g.time = wasG.time;
      g.herdCentres = wasG.herd; g.cam.d = wasG.camD; g.cam.fov = wasG.camFov;
      g._camFrame = wasG.frame;
    };
    p.vital = 10; p.dry = 0; p.fright = 0; p.air = 999;
    g.mode = 'play'; g.thirdPerson = true; g.cam.d = 3;
    g.herdCentres = {};
    // the same dry flat stretch the step above walks: the longest run of one
    // height, and the walk goes -z, so the stretch has to be ahead of the body
    const dry = (x, z) => {
      let gy = 0;
      for (let y = W.h - 1; y > 0; y--) if (W.solidAt(x, y, z)) { gy = y + 1; break; }
      if (gy < 12) return -1;
      for (let y = gy; y <= gy + 3; y++) if (W.liquidAt(x, y, z)) return -1;
      return gy;
    };
    let field = null;
    for (let x = 8; x < W.w - 8; x++) for (let z = W.d - 9; z > 40; z--) {
      const gy = dry(x, z);
      if (gy < 0) continue;
      let len = 1;
      while (dry(x, z - len) === gy) len++;
      if (!field || len > field.len) field = { x: x + 0.5, z: z + 0.5, gy, len };
    }
    const out = { field };
    if (!field || field.len < 22) { back(); return out; }
    /* the matrices the draw really uploaded, matched by object identity */
    const got = new Map(), watch = new Set();
    const realDraw = R.drawMesh;
    R.drawMesh = function (mesh, m) { if (watch.has(mesh)) got.set(mesh, m.slice()); return realDraw.apply(this, arguments); };
    const run = (label, form, keys, frames) => {
      p.form = form; p.formT = 9999; p.formMax = 9999;
      p.x = field.x; p.y = field.gy + 1; p.z = field.z;
      p.vx = p.vy = p.vz = 0; p.yaw = 0; p.faceYaw = 0; p.pitch = 0;
      p.bank = 0; p.tilt = 0; p.squash = 0; p.crouch = 0;
      p.grounded = true; p.airAmt = 0; p.held = 0; p.inWater = false; p.cruise = 0;
      p.gait = null;
      const raw = N.MODELS[p.modelId].parts;
      const meshes = {};
      for (const e of g.ensureModel(p.modelId)) meshes[e.part.name] = e.mesh;
      const under = q => { const o = [q]; for (const r of raw) if (r.parent === q.name) o.push(...under(r)); return o; };
      watch.clear(); got.clear();
      const soles = [];
      for (const q of raw) {
        /* the top of a limb that walks and stands -- the thigh and not the shin,
           because it is the thigh's turn that carries the foot along the ground,
           and the sole of that foot is what the turn is measured against. A leg
           with `stride: 0` is a leg that does not walk, and is not evidence. */
        if (!q.stands || q.anim !== 'walk' || q.stride === 0) continue;
        let own = null, box = null;
        for (const r of under(q))
          for (const b of (r.boxes || [])) if (!box || b[1] < box[1]) { box = b; own = r; }
        const mesh = own && meshes[own.name];
        if (!box || !mesh) continue;
        watch.add(mesh);
        soles.push({ name: q.name, mesh, sign: q.sign || 1,
          px: box[0] + box[3] / 2, py: box[1], pz: box[2] + box[5] / 2 });
      }
      let slip = 0, body = 0, near = 0, drift = 0, worst = 0, who = null, went = 0;
      let move = 0, moveN = 0, prev = null, px = p.x, pz = p.z;
      const limit = field.len - 6;      // the flat stretch is only so long
      for (let i = 0; i < frames; i++) {
        p.update(1 / 60, keys, g);
        g.time += 1 / 60;
        got.clear();
        g.updateEnv(); g._camFrame = g.shootCamera(p); g.render(); g._camFrame = null;
        const at = {};
        for (const s of soles) {
          const m = got.get(s.mesh);
          if (!m) continue;
          at[s.name] = [m[0] * s.px + m[4] * s.py + m[8] * s.pz + m[12],
                        m[1] * s.px + m[5] * s.py + m[9] * s.pz + m[13],
                        m[2] * s.px + m[6] * s.py + m[10] * s.pz + m[14]];
        }
        if (prev) {
          const moved = Math.hypot(p.x - px, p.z - pz);
          /* only the flat stretch, and only with feet on the ground: a body
             that has walked off the end of it, or one that is flying, is not
             evidence of a step */
          const onFoot = went < limit && p.grounded && (p.airAmt || 0) < 0.05;
          const mv = p.walkMove();
          const stance = p.gait === null ? -1 : N.stanceOf(mv);
          /* the middle of the stance, and not its ends. A stride at a run is
             three frames of foot on the ground out of twenty-odd of the cycle,
             and the frame the phase turns over in belongs to neither act: the
             foot is coming off the ground or going on to it, and it is moving
             all the way. Take the middle of the window and every frame counted
             is one the foot is standing still in, whatever the frame boundary
             happened to fall on. */
          const lo = 0.2 * stance, hi = 0.8 * stance;
          for (const s of soles) {
            const a = prev[s.name], b = at[s.name];
            if (!a || !b || !onFoot) continue;
            const d = Math.hypot(b[0] - a[0], b[2] - a[2]);
            drift += d;
            const u = p.gait + (s.sign < 0 ? 0.5 : 0);
            const v = u - Math.floor(u);
            if (!(v >= lo && v <= hi)) continue;            // off the ground: it may travel
            near++; slip += d; body += moved;
            if (d > worst) { worst = d; who = s.name; }
          }
          if (onFoot) { move += mv; moveN++; }
          went += moved;
        }
        prev = at; px = p.x; pz = p.z;
      }
      const cycles = p.gait === null ? 0 : p.gait;
      // the law is a number for one speed, and the walk spends most of its
      // frames at one speed: the mean is over the frames that were measured
      const mv = moveN ? move / moveN : 0;
      out[label] = { frames, feet: soles.length, near,
        went: +went.toFixed(1), measured: +Math.min(went, limit).toFixed(1),
        cycles: +cycles.toFixed(2), cadence: +(cycles / (frames / 60)).toFixed(2),
        cycleLen: cycles > 1 ? +(went / cycles).toFixed(2) : 0,
        law: +N.gaitStride(p.modelId, p.bodyScale(), mv).toFixed(2),
        slip: +slip.toFixed(3), drift: +drift.toFixed(3), body: +body.toFixed(2),
        ratio: +(slip / Math.max(body, 1e-9)).toFixed(3),
        worst: +worst.toFixed(4), who };
    };
    const go = { fwd: true, back: false, left: false, right: false, jump: false, sneak: false, sprint: false };
    const still = { fwd: false, back: false, left: false, right: false, jump: false, sneak: false, sprint: false };
    for (const f of [null, 'bruinfig', 'owlberry']) {
      run('walk-' + (f === null ? 'human' : f), f, go, 180);
      run('stand-' + (f === null ? 'human' : f), f, still, 120);
    }
    R.drawMesh = realDraw;
    back();
    return out;
  });
  /* Two claims, and they are the two halves of one stride.
     First: one cycle of the legs is worth exactly as much ground as the model's
     own foot reaches. Measured metres over measured cycles against the number
     the model gives for that body at that speed -- 1.85 against 1.85 for a
     person, 1.95 against 1.96 for a bear, 0.41 against 0.40 for an owl. Before
     the stride was tied to the ground the cycle ran on a clock of its own and
     this ratio was the body's speed over that clock, which had nothing to do
     with the leg: a person took 6.3 m steps and a bear 1.9.
     Second: a foot that is on the ground does not move along it. 0.006 of the
     ground the body covers, for a person, and 0.014 for a bear -- the last of
     it is a foot with no ankle, which rocks from toe to heel as the leg sweeps
     under the body. Before, it was over 1: a foot was travelling along the
     ground faster than the body it belongs to, and every body in the valley was
     skating on grass. And the bound is not only there for a cycle on a clock of
     the wrong rate: run the legs at the very rate the body's own legs happen to
     come round at, and the foot still slips 0.05, because the phase of a sine
     and the phase of a stride are not the same thing however you set the rate.
     The owl's second number is not asserted and the reason is worth keeping in
     the file: at 14.9 steps a second a cycle is four frames long and a foot is
     on the ground for one of them, so there is nothing here to measure. That is
     not the gait's fault -- it is a 0.4 m stride asked to carry a body at 6 m/s
     -- and the first number says the legs are doing exactly what they should. */
  const HOLD = 0.03;
  for (const f of ['human', 'bruinfig', 'owlberry']) {
    const hw = hold['walk-' + f];
    check(`the drawn ${f} takes the stride its legs are worth: one cycle, one reach`,
      !!hw && hw.cycles > 3 && Math.abs(hw.cycleLen - hw.law) < 0.08 * hw.law, hold);
  }
  for (const f of ['human', 'bruinfig']) {
    const hw = hold['walk-' + f];
    check(`the drawn ${f} plants its feet: a foot on the ground holds while the body goes past`,
      !!hw && hw.near > 20 && hw.ratio < HOLD, hold);
  }
  for (const f of ['human', 'bruinfig', 'owlberry']) {
    const hs = hold['stand-' + f];
    check(`a ${f} standing still has no stride at all: its feet hold the ground`,
      !!hs && hs.cycles === 0 && hs.drift < 0.01, hold);
  }

  /* A body with its feet on the ground has one more thing to say, and it is the
     one thing a stride cannot help saying: the body itself goes up and down
     twice a stride. The person's own body used to have no part carrying that
     heave at all -- the owl, the bear and the frog each had one, and the body
     you look at for an hour did not -- so a person crossing a field slid along
     the grass at a height nothing ever touched.
     Which way round it goes is not a style choice either, and the stride says
     that too. While some foot is always down the legs are struts, and a body on
     struts is highest over the middle of a stance, where the strut is straight
     and under it, and lowest where it trades one strut for the other. Once a
     stance is under half a cycle there is a moment in every stride with no foot
     down at all: the body is flying and the leg is a spring, it comes down onto
     a foot, bends it and is thrown off it again, so it is LOWEST over the middle
     of a stance and highest in the middle of the flight. A person at their own
     speed is in that second case -- a foot is down for 32% of a stride -- and
     the heave the models had was written for the first one, so the body was at
     the top of its rise exactly at the moment its own leg was taking its weight.
     Measured off the pose the draw uploads: at 4.7 m/s a person's body falls
     0.055 m and rises again across a stride, at the lowest point 0.16 of the
     stride (the middle of the stance, 0.16) and the highest at 0.41 (the middle
     of the flight, 0.41); at a walk -- a foot down for 56% of the stride -- the
     same body is highest at 0.28 (the middle of the stance, 0.28) and lowest at
     0.03 (the middle of the handover, 0.03).
     The bound on how big the heave has to be is not arbitrary either: at 0.12 of
     the model's units, the number it carried before, a person's body moves 0.033
     m across a stride, and that is a body you cannot see moving. */
  const ride = await step('bodyRidesItsStride', () => {
    const N = window.FRUTARIA, g = window.game;
    const SC = { human: 0.18, bear: 0.24, owl: 0.15 };
    const out = {};
    for (const model of ['human', 'bear', 'owl']) {
      const entries = g.ensureModel(model);
      const e = entries.find(q => q.part.anim === 'bob');
      if (!e) { out[model] = { error: 'no part of this model carries the heave' }; continue; }
      const at = (mv) => {
        const stance = N.stanceOf(mv);
        let lo = 1e9, hi = -1e9, loAt = -1, hiAt = -1;
        for (let i = 0; i < 240; i++) {
          const u = i / 240;
          // t stays 0: the idle breath is a separate thing and this is about the stride
          const a = N.partAngles(e, { t: 0, gait: u, phase: 0, move: mv, air: 0 });
          if (a.dy < lo) { lo = a.dy; loAt = u; }
          if (a.dy > hi) { hi = a.dy; hiAt = u; }
        }
        return { mv, stance: +stance.toFixed(3),
          amp: +((hi - lo) * SC[model]).toFixed(3),
          loAt: +loAt.toFixed(3), hiAt: +hiAt.toFixed(3),
          midStance: +(stance / 2).toFixed(3),
          // where the body is between two feet, and where it trades one for the other
          midFlight: +((stance + 0.5) / 2).toFixed(3),
          handover: +((stance - 0.5) / 2).toFixed(3) };
      };
      out[model] = { run: at(0.94), walk: at(0.2), slow: at(0.35) };
    }
    return out;
  });
  check('the body you look at for an hour rides its own stride',
    !ride.human.error && ride.human.run.amp > 0.045, ride.human);
  for (const m of ['human', 'bear', 'owl']) {
    const r = ride[m] && ride[m].run;
    check(`a ${m} at a run is at its lowest over the middle of a stance, not the top`,
      r && r.stance < 0.5 && Math.abs(r.loAt - r.midStance) < 0.05 &&
      Math.abs(r.hiAt - r.midFlight) < 0.05, ride[m]);
    const w = ride[m] && ride[m].walk;
    check(`and at a walk, with a foot always down, the other way round`,
      w && w.stance > 0.5 && Math.abs(w.hiAt - w.midStance) < 0.05 &&
      Math.abs(w.loAt - w.handover) < 0.05, ride[m]);
  }
  check('the heave is worth more ground the faster the body goes',
    !!ride.human.run && !!ride.human.slow &&
    ride.human.run.amp > ride.human.slow.amp * 1.5 && ride.human.slow.amp > 0, ride.human);

  /* A body's arms are the last thing still kept by a clock. They were already on
     the stride for the swing, but the *bend* of the elbow was one angle for every
     speed: read off the pose the draw uploads, a person at 4.7 m/s held the elbow
     at 0.12 rad -- seven degrees -- which is the angle a person standing still
     holds it at, and swung a straight arm through the whole stride. A body
     walking lets its arm hang; a body running carries it bent, because a straight
     arm swung through 2.3 strides a second is a pendulum the body has to stop and
     start again twice a stride. Measured after: the elbow is held at 0.12 rad
     standing, 0.14 at a walk, 0.61 at a run, and reaches 0.89 in mid-swing. */
  const arm = await step('armsAreCarriedNotSwung', () => {
    const N = window.FRUTARIA, g = window.game;
    const entries = g.ensureModel('human');
    const fe = entries.find(q => q.part.name === 'foreL');
    const am = entries.find(q => q.part.name === 'armL');
    const at = (mv) => {
      let held = 1e9, peak = 0, swing = 0, lo = 1e9, hi = -1e9;
      for (let i = 0; i < 240; i++) {
        const st = { t: 0, gait: i / 240, phase: 0, move: mv, air: 0 };
        const a = Math.abs(N.partAngles(fe, st).rx);
        held = Math.min(held, a); peak = Math.max(peak, a);
        const w = N.partAngles(am, st).rx;
        lo = Math.min(lo, w); hi = Math.max(hi, w);
      }
      return { mv, held: +held.toFixed(3), peak: +peak.toFixed(3),
        swing: +(hi - lo).toFixed(3) };
    };
    return { stand: at(0), walk: at(0.2), jog: at(0.5), run: at(0.94) };
  });
  check('a standing body still hangs its arm', arm.stand.held < 0.13, arm);
  check('a walking body still hangs its arm', arm.walk.held < 0.20, arm);
  check('a running body carries its arm bent, and the bend is worth four times the walk',
    arm.run.held > 0.5 && arm.run.held > arm.walk.held * 4 && arm.run.peak > 0.8, arm);
  check('and the arm is held the more bent the faster the body goes',
    arm.stand.held < arm.walk.held && arm.walk.held < arm.jog.held &&
    arm.jog.held < arm.run.held, arm);
  check('the arm still swings through the stride, and wider the faster the body goes',
    arm.run.swing > 0.8 && arm.walk.swing > 0.2 && arm.walk.swing < arm.run.swing, arm);

  /* A body in the air turns by tilting. The player's own body has leaned into a
     turn for a long time; nothing else in the world did, so an owl crossing the
     valley with its yaw swinging through ninety degrees stayed dead level. */
  const lean = await step('turningBodyLeans', () => {
    const N = window.FRUTARIA, g = window.game;
    const p = g.player;
    const was = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch };
    const owl = g.creatures.find(c => c.sp.id === 'owl');
    const bear = g.creatures.find(c => c.sp.id === 'bear');
    if (!owl || !bear) return { error: 'no owl or bear in the roster' };
    // a lens nowhere near either of them: nothing here should be fleeing
    p.x = owl.x > 80 ? 12 : 148; p.z = owl.z > 80 ? 12 : 148; p.y = 30;
    /* and the hour each of them is awake: an owl that is roosting on a branch
       turns its head and its body in place, which is not a lean, and a bear
       asleep in its den is not evidence of anything. */
    const t0 = g.time;
    const at = h => { g.time = 420 * h / 24; g.updateEnv(); };

    const drive = c => {
      c.state = 'wander'; c.sleeping = false; c.pause = 999;   // hold the target
      c.bank = 0; c.yaw = 0;                                   // facing north
      c.tx = c.x + 40; c.tz = c.z;                             // target due east: a quarter turn
      let peak = 0;
      for (let i = 0; i < 40; i++) { c.update(1 / 60, p, g.world, g); peak = Math.max(peak, Math.abs(c.bank)); }
      return { peak: +peak.toFixed(3), turned: +N.angleDelta(0, c.yaw).toFixed(2), state: c.state };
    };
    at(21); const fly = drive(owl);
    at(9); const walk = drive(bear);
    g.time = t0; g.updateEnv();

    // and the draw reads it: one body, level and tilted, two frames
    const gl = g.R.gl, w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const D = 6.0, UP = 3.2;
    p.x = 136.5; p.z = 128.5; p.y = 22; p.yaw = -Math.PI / 2; p.pitch = Math.atan2(UP, D);
    g.update(0.05);
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const grab = bank => {
      owl.x = p.x + fx * D; owl.z = p.z + fz * D; owl.y = p.y + UP;
      owl.yaw = p.yaw; owl.state = 'wander'; owl.sleeping = false; owl.flyY = owl.y;
      owl.airAmt = 1; owl.bank = bank;
      const cf = g.shootCamera(p); g._camFrame = cf;
      g.render();
      const b = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return b;
    };
    const level = grab(0), tilted = grab(0.42);
    let diff = 0;
    for (let i = 0; i < level.length; i += 4) {
      if (Math.abs(level[i] - tilted[i]) + Math.abs(level[i + 1] - tilted[i + 1]) + Math.abs(level[i + 2] - tilted[i + 2]) > 24) diff++;
    }
    Object.assign(p, was);
    return { fly, walk, diff };
  });
  check('the turn is real: the owl is awake, flying, and ends up facing a quarter away from where it started',
    Math.abs(lean.fly.turned) > 0.5 && lean.fly.state !== 'roost', lean);
  check('a flying body leans into it', lean.fly.peak > 0.15, lean);
  check('a body on foot does not: a bear turning at speed stays level', lean.walk.peak < 0.02, lean);
  check('and the renderer reads the lean: the same body level and tilted is not the same frame',
    lean.diff > 300, lean);

  /* 10w. a body wading is standing in water, not hanging above the bottom.
     The lake shore is one block of water deep for 183 columns around Mirrorlake:
     the bed is solid, the water sits on it, and the surface is level with the
     top of the bed. A body there has its feet on the bottom and its head in the
     air, which is wading. What the physics used to report was airborne: the
     contact flag is only set by a move that had to be stopped, a body rests
     0.0005 m off the face it last hit, and in water the buoyancy and drag leave
     a terminal sink of 0.0008 m a frame -- too little to reach the cell below
     more than once every three frames. So the pose eased to the air pose
     (airAmt 0.42 and steady) and the steering kept a third of its push, and
     walking the shore of the lake looked like floating.
     The claim is measured three ways: standing in such a column the body is on
     the bottom every frame and the pose says ground; wading along the shore it
     is on the bottom most of the way and covers the ground it should; and the
     flag is not glue -- a body that walks off a step is off the ground at once. */
  const wade = await step('wadingIsNotFloating', () => {
    const g = window.game, W = g.world, p = g.player;
    const was = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, vx: p.vx, vy: p.vy, vz: p.vz,
      form: p.form, grounded: p.grounded, airAmt: p.airAmt, vital: p.vital, dry: p.dry, fright: p.fright };
    p.form = null; p.vital = 10; p.dry = 0; p.fright = 0;
    // a shore shelf: one block of water, bed under it, air above it, and six
    // columns of the same shelf in a row so a body walking it stays wading
    let spot = null;
    const shelf = (x, z) => {
      let wt = -1;
      for (let y = W.h - 1; y >= 0; y--) if (W.liquidAt(x, y, z)) { wt = y; break; }
      if (wt < 0 || W.liquidAt(x, wt - 1, z)) return -1;         // deeper than one block
      if (!W.solidAt(x, wt - 1, z) || W.solidAt(x, wt, z) || W.solidAt(x, wt + 1, z)) return -1;
      return wt;
    };
    for (let x = 40; x < 120 && !spot; x++) for (let z = 70; z < 145 && !spot; z++) {
      const wt = shelf(x, z);
      if (wt < 0) continue;
      let k = 1;
      while (k < 8 && shelf(x, z - k) === wt) k++;
      if (k >= 6) spot = { x: x + 0.5, z: z + 0.5, wt };
    }
    if (!spot) { Object.assign(p, was); return { error: 'no one-block-deep shore shelf in Mirrorlake' }; }
    const run = (secs, inp) => {
      p.x = spot.x; p.z = spot.z; p.y = spot.wt + 0.0001; p.yaw = 0;
      p.vx = p.vy = p.vz = 0; p.grounded = false; p.airAmt = 0; p.squash = 0; p.crouch = 0;
      const n = Math.round(secs * 60);
      let gr = 0, airMax = 0, y0 = p.y, yLo = p.y, yHi = p.y;
      for (let i = 0; i < n; i++) {
        p.update(1 / 60, inp, g);
        if (p.grounded) gr++;
        airMax = Math.max(airMax, p.airAmt);
        yLo = Math.min(yLo, p.y); yHi = Math.max(yHi, p.y);
      }
      return { grPct: +(gr / n * 100).toFixed(0), airMax: +airMax.toFixed(2),
        y: +p.y.toFixed(2), y0: +y0.toFixed(2), drift: +(yHi - yLo).toFixed(2),
        spd: +Math.hypot(p.vx, p.vz).toFixed(2), inW: p.inWater };
    };
    const still = run(2, {});
    const wading = run(2, { fwd: true });
    const dist = +Math.hypot(p.x - spot.x, p.z - spot.z).toFixed(2);
    /* and the flag is not glue: a body that walks off a step is in the air at
       once, pose easing up, feet no longer within reach of the surface */
    const TREE = { 6: 1, 7: 1, 8: 1, 9: 1, 22: 1, 27: 1, 28: 1 };
    const ground = (x, z) => {
      for (let y = 46; y > 0; y--) {
        const b = g.world.get(x, y, z);
        if (b && b < 40 && !TREE[b] && g.world.solidAt(x, y, z)) return y;
      }
      return -1;
    };
    let edge = null;
    for (let x = 24; x < 150 && !edge; x++) for (let z = 24; z < 150 && !edge; z++) {
      const a = ground(x, z), b = ground(x, z - 1);
      if (a < 0 || b < 0 || a - b !== 1) continue;                 // one step down ahead
      if (g.world.solidAt(x, a + 1, z) || g.world.solidAt(x, a + 2, z)) continue;   // headroom
      if (g.world.solidAt(x, b + 1, z - 1) || g.world.solidAt(x, b + 2, z - 1)) continue;
      if (W.liquidAt(x, a, z) || W.liquidAt(x, b, z - 1)) continue; // dry ground
      edge = { x: x + 0.5, z: z + 0.5, y: a + 1 };
    }
    let off = { error: 'no single step to walk off' };
    if (edge) {
      p.x = edge.x; p.z = edge.z; p.y = edge.y; p.yaw = 0;
      p.vx = p.vy = p.vz = 0; p.grounded = false; p.airAmt = 0;
      for (let i = 0; i < 30; i++) p.update(1 / 60, {}, g);         // settle
      const y0 = p.y;
      let airFrames = 0, airMax = 0, low = p.y;
      for (let i = 0; i < 40; i++) {
        p.update(1 / 60, { fwd: true }, g);
        if (!p.grounded) airFrames++;
        airMax = Math.max(airMax, p.airAmt);
        low = Math.min(low, p.y);
      }
      off = { airFrames, airMax: +airMax.toFixed(2), drop: +(y0 - low).toFixed(2), y: +p.y.toFixed(2) };
    }
    Object.assign(p, was);
    return { spot, still, wading, dist, off };
  });
  check('standing in a one-block-deep shore, the body is on the bottom the whole time',
    wade.still && wade.still.grPct === 100 && wade.still.airMax < 0.05 && wade.still.drift < 0.02, wade);
  check('and it is in the water, so that is wading and not standing on dry ground',
    wade.still && wade.still.inW === true, wade);
  check('wading the shelf keeps feet down and covers ground',
    wade.wading && wade.wading.grPct > 90 && wade.dist > 4, wade);
  check('the flag is not glue: walking off a step leaves the ground at once',
    !wade.off.error && wade.off.airFrames >= 2 && wade.off.airMax > 0.2 && wade.off.drop > 0.3, wade);

  /* 10x. an underside is not a hole in the sky. 10q fixed the cloud; the same
     face table was still driving everything else that hangs in open air to
     black. Face shade times crevice darkening is 0.42 x 0.46 = 0.19 of a
     block's own colour, and the crevice test reads a canopy as a crevice --
     the ring of solid it samples under a tree IS the tree. Measured over the
     whole map: 60,506 of the 107,880 faces that have eight blocks of clear air
     along their normal rendered under 60/255, 56% of them, worst 10. Two cases
     a player actually stands in: under a conifer crown, and under the roof of
     the town, where the reading from the lantern road was grey lumps against a
     sky at 150.
     The reading is the frame itself: stand under the face, look up, march every
     other pixel through the block grid, and sort what comes back. A hanging
     face may be darker than the sky -- that is the fake sun -- but a quarter of
     its pixels have to be at least 45/255 and the darkest twentieth have to be
     past 35. Measured before: a quarter of the crown's pixels were 31 and the
     darkest twentieth 24; of the roof, 22 and 19. Measured after: 55 and 48,
     53 and 43. */
  const under = await step('undersideIsNotAHole', () => {
    const g = window.game, N = window.FRUTARIA, W = g.world, gl = g.R.gl, R = g.R, p = g.player;
    const was = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, vy: p.vy, form: p.form,
      time: g.time, mode: g.mode, frame: g._camFrame };
    const LEAF = { 7: 1, 8: 1, 9: 1, 27: 1, 28: 1 };
    const ROOF = { 10: 1, 11: 1, 12: 1, 13: 1, 78: 1 };
    /* a face that hangs: three cells of open space under it and eight of clear
       air above it, so it is an underside seen against the sky. The search runs
       down the column from the top, because the ground under a roof is not the
       ground the column's own top block stands on. */
    const hangs = (x, z, want) => {
      for (let y = 34; y >= 14; y--) {
        const b = W.get(x, y, z);
        if (!b || !want[b]) continue;
        let open = true;
        for (let k = y + 1; k <= y + 8 && k < W.h; k++) if (W.get(x, k, z)) { open = false; break; }
        if (!open) continue;
        for (let k = y - 1; k >= y - 3; k--) if (W.solidAt(x, k, z) || W.liquidAt(x, k, z)) { open = false; break; }
        if (!open) continue;
        let g0 = -1;
        for (let k = y - 3; k >= 8; k--) if (W.solidAt(x, k, z)) { g0 = k; break; }
        if (g0 < 12 || g0 > 30) continue;
        if (W.solidAt(x, g0 + 1, z) || W.solidAt(x, g0 + 2, z)) continue;   // headroom
        return { x: x + 0.5, z: z + 0.5, y: g0 + 1.0001, at: [x, y, z], b, floor: g0 };
      }
      return null;
    };
    let tree = null, roof = null;
    for (let z = 10; z < W.d - 10 && !tree; z += 2) for (let x = 10; x < W.w - 10 && !tree; x += 2) tree = hangs(x, z, LEAF);
    for (let z = 118; z < 142 && !roof; z++) for (let x = 126; x < 148 && !roof; x++) roof = hangs(x, z, ROOF);
    if (!tree || !roof) { Object.assign(p, was); return { error: 'no hanging face to look at', tree: !!tree, roof: !!roof }; }
    const first = (ox, oy, oz, dx, dy, dz) => {
      for (let t = 0.3; t < 90; t += 0.4) {
        const b = W.get(Math.floor(ox + dx * t), Math.floor(oy + dy * t), Math.floor(oz + dz * t));
        if (b) return b;
      }
      return 0;
    };
    const look = (spot) => {
      p.form = null; p.x = spot.x; p.y = spot.y; p.z = spot.z; p.vx = p.vy = p.vz = 0;
      p.grounded = false; p.airAmt = 0;
      p.yaw = Math.PI; p.pitch = 1.2;
      g.mode = 'play'; g.time = N.DAY_LEN * (12 / 24); g.updateEnv();
      const cf = g._camFrame = g.shootCamera(p);
      g.render();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const tanY = Math.tan(cf.fov * Math.PI / 360), tanX = tanY * R.aspect;
      const lum = (i) => px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11;
      let n = 0, sum = 0, sn = 0, ss = 0;
      const vals = [];
      for (let Y = 0; Y < h; Y += 2) {
        const gy = h - 1 - Y, ndcY = 1 - (Y + 0.5) / h * 2;
        for (let X = 0; X < w; X += 2) {
          const ndcX = (X + 0.5) / w * 2 - 1;
          let dx = R.fwd[0] + R.right[0] * ndcX * tanX + R.up[0] * ndcY * tanY;
          let dy = R.fwd[1] + R.right[1] * ndcX * tanX + R.up[1] * ndcY * tanY;
          let dz = R.fwd[2] + R.right[2] * ndcX * tanX + R.up[2] * ndcY * tanY;
          const L = Math.hypot(dx, dy, dz); dx /= L; dy /= L; dz /= L;
          const id = first(R.cam.x, R.cam.y, R.cam.z, dx, dy, dz);
          const i = (gy * w + X) * 4;
          if (id === 0) { sn++; ss += lum(i); }
          else if (id === spot.b) { n++; sum += lum(i); vals.push(lum(i)); }
        }
      }
      // sorted, not averaged: one dark corner in a bright field is exactly the
      // complaint, and a mean hides it
      vals.sort((a, b) => a - b);
      const q = (f) => vals.length ? +vals[Math.floor(vals.length * f)].toFixed(1) : 0;
      return { px: n, mean: +(sum / Math.max(1, n)).toFixed(1), p05: q(0.05), p25: q(0.25),
        skyPx: sn, skyMean: +(ss / Math.max(1, sn)).toFixed(1) };
    };
    const t = look(tree), r = look(roof);
    g._camFrame = null; g.render();
    Object.assign(p, was); g.time = was.time; g.mode = was.mode; g._camFrame = was.frame;
    return { tree, roof, t, r };
  });
  check('there is a crown and a roof rim hanging overhead', !under.error, under);
  check('a conifer crown seen from below is not a hole in the sky',
    under.t && under.t.px > 1500 && under.t.p05 >= 35 && under.t.p25 >= 45 && under.t.mean > 0.25 * under.t.skyMean, under);
  check('and neither is the roof of the town over the lantern road',
    under.r && under.r.px > 1500 && under.r.p05 >= 35 && under.r.p25 >= 45 && under.r.mean > 0.25 * under.r.skyMean, under);

  /* 10y. a lens under the lake surface has to see the lake. In third person the
     lens trails the body, and it trails it down: stand in the lake with your
     head in the air and tilt the view up and the lens goes 0.8 m under the
     surface -- and the frame showed the sun at full brightness through the
     lake. Two causes, both about who the picture belongs to. The surface is one
     quad per block face, so seen from underneath it is a back face and the
     culler threw it away; and the water fog was read off the body's head, which
     was dry. The claim is read off the frame: with the lens inside the water
     volume every sampled ray hits water before anything else, so no pixel may
     show raw sky. Measured before: 3.76% of the frame brighter than 200/255 and
     the brightest pixel 255, with **0** rays reaching the sky. After: 0 and 148.
     The body keeps its breath -- the head stays dry and the air bar keeps
     filling, because a view is not a body. Two controls: a level view, where
     the lens is above the surface and the sun is allowed to be bright; and
     first person on the bed of deep water, which already had the fog, still has
     it, and now also sees the surface from below (brightest pixel 255 -> 128). */
  const lensUnder = await step('lensSeesTheWater', () => {
    const g = window.game, N = window.FRUTARIA, W = g.world, R = g.R, gl = R.gl, p = g.player;
    const was = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, vx: p.vx, vy: p.vy, vz: p.vz,
      form: p.form, vital: p.vital, dry: p.dry, fright: p.fright, air: p.air,
      third: g.thirdPerson, camD: g.cam.d, camFov: g.cam.fov, ready: g.camReady,
      time: g.time, mode: g.mode, lens: g._lens, frame: g._camFrame, input: g.input };
    const back = (r) => {
      Object.assign(p, { x: was.x, y: was.y, z: was.z, yaw: was.yaw, pitch: was.pitch,
        vx: was.vx, vy: was.vy, vz: was.vz, form: was.form, vital: was.vital, dry: was.dry,
        fright: was.fright, air: was.air });
      g.thirdPerson = was.third; g.cam.d = was.camD; g.cam.fov = was.camFov; g.camReady = was.ready;
      g.time = was.time; g.mode = was.mode; g._lens = was.lens; g._camFrame = was.frame; g.input = was.input;
      return r;
    };
    p.form = null; p.vital = 10; p.dry = 0; p.fright = 0; p.air = 5;
    g.mode = 'play'; g.time = N.DAY_LEN * (12 / 24);

    // a shore shelf: one block of water over a bed, the lake running away for eight
    let shelf = null;
    for (let x = 40; x < 120 && !shelf; x++) for (let z = 70; z < 145 && !shelf; z++) {
      let wt = -1;
      for (let y = W.h - 1; y >= 0; y--) if (W.liquidAt(x, y, z)) { wt = y; break; }
      if (wt < 0 || W.liquidAt(x, wt - 1, z)) continue;
      if (!W.solidAt(x, wt - 1, z) || W.solidAt(x, wt, z) || W.solidAt(x, wt + 1, z)) continue;
      let k = 1; while (k < 10 && W.liquidAt(x, wt, z - k) && !W.liquidAt(x, wt - 1, z - k)) k++;
      if (k >= 8) shelf = { x: x + 0.5, z: z + 0.5, wt };
    }
    // and a deep column: three blocks of water over a bed
    let deep = null;
    for (let x = 44; x < 116 && !deep; x++) for (let z = 74; z < 142 && !deep; z++) {
      let wt = -1;
      for (let y = W.h - 1; y >= 0; y--) if (W.liquidAt(x, y, z)) { wt = y; break; }
      if (wt < 2) continue;
      let bed = -1; for (let y = wt; y >= 0; y--) if (W.solidAt(x, y, z)) { bed = y; break; }
      if (bed < 0 || wt - bed < 3) continue;
      deep = { x: x + 0.5, z: z + 0.5, bed: bed + 1, wt };
    }
    if (!shelf || !deep) return back({ error: 'no shore shelf / no deep column', shelf: !!shelf, deep: !!deep });

    // eight frames of the real loop: the physics sets the body's own water state
    // and the environment gets a lens to read
    const stand = (x, y, z, pitch, third, pin) => {
      p.x = x; p.z = z; p.y = y; p.vx = p.vy = p.vz = 0;
      p.yaw = Math.PI; p.pitch = pitch; p.air = 5;
      g.thirdPerson = third; g.camReady = false; g.cam = { d: 0, fov: 76 };
      g.input = {};
      for (let i = 0; i < 8; i++) {
        if (pin !== undefined) { p.y = pin; p.vy = 0; }
        g.update(1 / 60);
      }
      g.input = {};
    };

    const look = (cf) => {
      g.particles.n = 0;                 // the ambient spawner is random; the frame is not
      g.hover = null; g._camFrame = cf; g.render();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const tanY = Math.tan(cf.fov * Math.PI / 360), tanX = tanY * R.aspect;
      let n = 0, waterFirst = 0, skyFirst = 0, br = 0, lsum = 0, lmax = 0, hi = 0;
      for (let Y = 0; Y < h; Y += 3) {
        const ndcY = 1 - (Y + 0.5) / h * 2;
        for (let X = 0; X < w; X += 3) {
          const ndcX = (X + 0.5) / w * 2 - 1;
          let dx = R.fwd[0] + R.right[0] * ndcX * tanX + R.up[0] * ndcY * tanY;
          let dy = R.fwd[1] + R.right[1] * ndcX * tanX + R.up[1] * ndcY * tanY;
          let dz = R.fwd[2] + R.right[2] * ndcX * tanX + R.up[2] * ndcY * tanY;
          const L = Math.hypot(dx, dy, dz); dx /= L; dy /= L; dz /= L;
          // what the block grid says is in front of this pixel: water, solid, or nothing
          let tW = -1, tS = -1;
          for (let t = 0.3; t < 60; t += 0.3) {
            const b = W.get(Math.floor(cf.x + dx * t), Math.floor(cf.y + dy * t), Math.floor(cf.z + dz * t));
            if (!b) continue;
            const bd = N.BLOCKS[b];
            if (bd.liquid) { if (tW < 0) tW = t; }
            else if (bd.solid) { if (tS < 0) { tS = t; break; } }
            if (tW >= 0 && tS >= 0) break;
          }
          const i = ((h - 1 - Y) * w + X) * 4;
          const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
          n++; br += px[i + 2] - px[i]; lsum += l;
          if (l > lmax) lmax = l;
          if (l > 200) hi++;
          if (tW >= 0 && (tS < 0 || tW < tS)) waterFirst++;
          else if (tW < 0 && tS < 0) skyFirst++;
        }
      }
      return { n, waterFirst, skyFirst, blueMinusRed: +(br / n).toFixed(1),
        meanLum: +(lsum / n).toFixed(1), maxLum: Math.round(lmax), over200: +(100 * hi / n).toFixed(2) };
    };
    const at = (cf) => ({ x: +cf.x.toFixed(2), y: +cf.y.toFixed(2), z: +cf.z.toFixed(2), d: +cf.d.toFixed(2),
      lensInWater: W.liquidAt(Math.floor(cf.x), Math.floor(cf.y), Math.floor(cf.z)) });

    /* The same lens with every effect of the water taken away from it: the
       absorption, the haze the lens is sitting in, the surface itself. That is
       what the frame would be if the lake were not there, and it is the only
       control that can tell "the water is between the lens and the sky" apart
       from "the sky is showing through a hole in the lake" -- a lens close under
       the surface sees a sky bright enough to blow the frame out on its own, and
       only the frame beside it says what the water did to it. */
    const bare = (cf) => {
      const e = g.env, keep = { liqK: e.liqK, hazeK: e.hazeK, hazeOn: e.hazeOn, inWater: e.inWater };
      const hid = [];
      for (let ci = 0; ci < W.chunks.length; ci++) { const m = W.chunks[ci]; if (m && m[2]) { hid.push([ci, m[2].count]); m[2].count = 0; } }
      e.liqK = [0, 0, 0]; e.hazeK = [0, 0, 0]; e.hazeOn = 0; e.inWater = 0;
      const r = look(cf);
      e.liqK = keep.liqK; e.hazeK = keep.hazeK; e.hazeOn = keep.hazeOn; e.inWater = keep.inWater;
      for (const [ci, c] of hid) W.chunks[ci][2].count = c;
      return r;
    };

    // 1. the reported case: body standing in the lake, head dry, lens under the surface
    stand(shelf.x, shelf.wt + 0.0001, shelf.z, 1.2, true);
    let cf = g._camFrame;
    const tilt = Object.assign({ cam: at(cf), headWater: p.headWater, inWater: p.inWater,
      air: +p.air.toFixed(2), fogDen: +g.env.fogDen.toFixed(4), hazeOn: g.env.hazeOn,
      hazeK: g.env.hazeK.map(v => +v.toFixed(2)) }, { px: look(cf), bare: bare(cf) });

    // 2. control: the same body, level view, lens above the surface
    stand(shelf.x, shelf.wt + 0.0001, shelf.z, -0.15, true);
    cf = g._camFrame;
    const lvl = Object.assign({ cam: at(cf), headWater: p.headWater, fogDen: +g.env.fogDen.toFixed(4) }, { px: look(cf) });

    // 3. first person on the bed of deep water: the case that already worked
    stand(deep.x, deep.bed + 0.0001, deep.z, 0.9, false, deep.bed + 0.0001);
    cf = g._camFrame;
    const dp = Object.assign({ cam: at(cf), bed: deep.bed, surfaceY: deep.wt + 1, headWater: p.headWater,
      fogDen: +g.env.fogDen.toFixed(4), hazeOn: g.env.hazeOn, hazeK: g.env.hazeK.map(v => +v.toFixed(2)) },
      { px: look(cf), bare: bare(cf) });

    return back({ shelf, deep, tilt, lvl, dp });
  });
  check('a lens under the lake surface is a lens in the water, and the body above it is dry',
    !lensUnder.error && lensUnder.tilt.cam.lensInWater === true && lensUnder.tilt.headWater === false, lensUnder);
  check('every ray from that lens hits water first, so no pixel may show raw sky',
    lensUnder.tilt && lensUnder.tilt.px.waterFirst === lensUnder.tilt.px.n &&
    lensUnder.tilt.px.maxLum < lensUnder.tilt.bare.maxLum &&
    lensUnder.tilt.px.over200 < lensUnder.tilt.bare.over200, lensUnder);
  check('and the whole frame is tinted by the water it is looking through',
    lensUnder.tilt && lensUnder.tilt.hazeOn === 1 && lensUnder.tilt.hazeK[0] > 0.5 &&
    lensUnder.tilt.px.blueMinusRed > 45, lensUnder);
  check('the view is not the body: standing in the lake with a dry head, the air still fills',
    lensUnder.tilt && lensUnder.tilt.air > 5, lensUnder);
  check('a level view, lens above the surface, is not put underwater',
    lensUnder.lvl && lensUnder.lvl.cam.lensInWater === false && lensUnder.lvl.fogDen < 0.02 &&
    lensUnder.lvl.px.over200 > 0, lensUnder);
  check('first person on the bed of deep water keeps its fog and now sees the surface from below',
    lensUnder.dp && lensUnder.dp.hazeOn === 1 && lensUnder.dp.px.over200 === 0 &&
    lensUnder.dp.px.maxLum < lensUnder.dp.bare.maxLum, lensUnder);

  /* A body standing in the lake with the lens out over the water and above the
     surface: the half of it under the surface must read as water. The body used
     to be drawn after the water pass, so it sat on top of the lake's own blend
     and stayed dry from its feet to its head -- the lakebed behind it was tinted
     while the body in front of it was not. */
  const wetBody = await step('wetHalfTheBody', () => {
    const g = window.game, N = window.FRUTARIA, W = g.world, R = g.R, gl = R.gl, p = g.player;
    const was = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, vx: p.vx, vy: p.vy, vz: p.vz,
      form: p.form, vital: p.vital, dry: p.dry, fright: p.fright, air: p.air, model: g.ensureModel,
      third: g.thirdPerson, camD: g.cam.d, camFov: g.cam.fov, ready: g.camReady,
      time: g.time, mode: g.mode, lens: g._lens, frame: g._camFrame, input: g.input };
    const back = (r) => {
      Object.assign(p, { x: was.x, y: was.y, z: was.z, yaw: was.yaw, pitch: was.pitch,
        vx: was.vx, vy: was.vy, vz: was.vz, form: was.form, vital: was.vital, dry: was.dry,
        fright: was.fright, air: was.air });
      g.thirdPerson = was.third; g.cam.d = was.camD; g.cam.fov = was.camFov; g.camReady = was.ready;
      g.time = was.time; g.mode = was.mode; g._lens = was.lens; g._camFrame = was.frame;
      g.input = was.input; g.ensureModel = was.model;
      return r;
    };
    p.form = null; p.vital = 10; p.dry = 0; p.fright = 0; p.air = 5;
    g.mode = 'play'; g.time = N.DAY_LEN * (12 / 24);

    /* a shore shelf with the lake running away for eight blocks in one of the
       four directions, so the lens can sit out over the water */
    const DIRS = [[1, 0, -Math.PI / 2], [-1, 0, Math.PI / 2], [0, 1, 0], [0, -1, Math.PI]];
    let shelf = null;
    for (let x = 40; x < 120 && !shelf; x++) for (let z = 70; z < 145 && !shelf; z++) {
      let wt = -1;
      for (let y = W.h - 1; y >= 0; y--) if (W.liquidAt(x, y, z)) { wt = y; break; }
      if (wt < 0 || W.liquidAt(x, wt - 1, z)) continue;          // one block of water only
      if (!W.solidAt(x, wt - 1, z) || W.solidAt(x, wt, z) || W.solidAt(x, wt + 1, z)) continue;
      for (const [dx, dz, yaw] of DIRS) {
        let k = 1;
        while (k < 9 && W.liquidAt(x + dx * k, wt, z + dz * k) && !W.liquidAt(x + dx * k, wt - 1, z + dz * k) &&
               !W.solidAt(x + dx * k, wt + 1, z + dz * k)) k++;
        if (k >= 9) { shelf = { x: x + 0.5, z: z + 0.5, wt, yaw, run: k }; break; }
      }
    }
    if (!shelf) return back({ error: 'no shore shelf with a run of open water' });

    const stand = (pitch) => {
      g.thirdPerson = true; g.camReady = false; g.cam = { d: 0, fov: 76 }; g.input = {};
      for (let i = 0; i < 60; i++) {
        p.x = shelf.x; p.z = shelf.z; p.y = shelf.wt + 0.0001; p.vx = p.vy = p.vz = 0;
        p.yaw = shelf.yaw; p.pitch = pitch; p.airAmt = 0; p.air = p.airMax;
        g.update(1 / 60);
      }
    };
    const grab = () => {
      g.particles.n = 0; g.hover = null; g.render();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return { w, h, px };
    };
    const hideWater = () => {
      const s = [];
      for (let ci = 0; ci < W.chunks.length; ci++) { const m = W.chunks[ci]; if (m && m[2]) { s.push([ci, m[2]]); m[2] = null; } }
      return s;
    };
    const showWater = (s) => { for (const [ci, m] of s) W.chunks[ci][2] = m; };

    const shot = (pitch) => {
      stand(pitch);
      const cf = g._camFrame = g.shootCamera(p);
      // the body is hidden by handing the renderer an empty part list for it
      const orig = g.ensureModel.bind(g);
      g.ensureModel = (id) => (id === p.modelId ? [] : orig(id));
      const hid = hideWater();
      const N0 = grab();                          // no body, no water
      showWater(hid);
      const N1 = grab();                          // no body, water
      hideWater();
      g.ensureModel = orig;
      const B0 = grab();                          // body, no water
      showWater(hid);
      const B1 = grab();                          // body, water

      const w = B0.w, h = B0.h, W4 = w * 4;
      const diff = (A, C, i) => Math.abs(A.px[i] - C.px[i]) + Math.abs(A.px[i + 1] - C.px[i + 1]) + Math.abs(A.px[i + 2] - C.px[i + 2]);
      // where the lake surface at the body's own column lands on the screen
      const v = [shelf.x - cf.x, shelf.wt + 1 - cf.y, shelf.z - cf.z];
      const zc = v[0] * R.fwd[0] + v[1] * R.fwd[1] + v[2] * R.fwd[2];
      const yc = v[0] * R.up[0] + v[1] * R.up[1] + v[2] * R.up[2];
      const surfRow = Math.round((1 - (yc / (zc * Math.tan(cf.fov * Math.PI / 360)) + 1) / 2) * h);

      const band = { below: [0, 0, 0, 0, 0], dry: [0, 0, 0, 0, 0] };   // n, tinted, shift, blue, red
      let mask = 0, maskThrough = 0;
      for (let Y = 0; Y < h; Y++) {
        for (let X = 0; X < w; X++) {
          const i = Y * W4 + X * 4;
          if (diff(B0, N0, i) <= 24) continue;              // not a pixel of the body
          mask++;
          if (diff(B1, N1, i) > 24) maskThrough++;         // the body still shows with water on
          const j = ((h - 1 - Y) * w + X) * 4;
          const t = Y > surfRow ? band.below : (Y <= surfRow - 25 ? band.dry : null);
          if (!t) continue;
          t[0]++;
          const d = diff(B1, B0, j);
          if (d > 12) t[1]++;
          t[2] += d; t[3] += B1.px[j + 2]; t[4] += B1.px[j];
        }
      }
      const fmt = (t) => ({ n: t[0], tinted: t[1], pct: +(t[1] / Math.max(1, t[0]) * 100).toFixed(1),
        meanShift: +(t[2] / Math.max(1, t[0])).toFixed(1),
        blueMinusRed: +(t[3] / Math.max(1, t[0]) - t[4] / Math.max(1, t[0])).toFixed(1) });
      return { cam: { x: +cf.x.toFixed(2), y: +cf.y.toFixed(2), z: +cf.z.toFixed(2), d: +cf.d.toFixed(2) },
        lensInWater: W.liquidAt(Math.floor(cf.x), Math.floor(cf.y), Math.floor(cf.z)),
        lensAboveSurface: cf.y > shelf.wt + 1, headWater: p.headWater, inWater: p.inWater,
        surfRow, mask, through: +(maskThrough / Math.max(1, mask) * 100).toFixed(1),
        below: fmt(band.below), dry: fmt(band.dry) };
    };

    const tilt = shot(-0.35);
    const level = shot(-0.05);
    return back({ shelf, tilt, level });
  });
  check('the lens is out over open water and above the surface, the body in the lake',
    !wetBody.error && wetBody.tilt.lensInWater === false && wetBody.tilt.lensAboveSurface === true &&
    wetBody.tilt.inWater === true && wetBody.tilt.headWater === false, wetBody);
  /* How much the water changes the half of the body under the surface is no
     longer a number the surface itself carries. The water is a law now, and at
     the metre of lake this shelf has the red of a leg is eaten 75%, the green
     33%, the blue 14%, and the water adds 6% of its own colour over the top:
     the leg still reads as a leg, under water. The flat 0.72 sheet shifted those
     pixels six times as far and made the body look like a body behind blue
     glass. So the wet half is measured against the dry half of the same body in
     the same frame: the water has to move every pixel of it, and move it
     towards blue. */
  check('every pixel of the body below the surface line is changed by the water',
    wetBody.tilt && wetBody.tilt.below.n > 200 && wetBody.tilt.below.pct >= 90 &&
    wetBody.tilt.below.meanShift > 20, wetBody);
  check('and it reads as water: blue over red, not skin over red',
    wetBody.tilt && wetBody.tilt.below.blueMinusRed - wetBody.tilt.dry.blueMinusRed > 25, wetBody);
  check('the half above the surface line keeps the colour it had out of the water',
    wetBody.tilt && wetBody.tilt.dry.n > 200 && wetBody.tilt.dry.pct === 0 &&
    wetBody.tilt.dry.meanShift === 0, wetBody);
  check('the water tints the body, it never hides it: the body still shows through',
    wetBody.tilt && wetBody.tilt.through >= 85, wetBody);
  check('a level view out over the water wets the same half',
    wetBody.level && wetBody.level.below.pct >= 90 && wetBody.level.below.meanShift > 60 &&
    wetBody.level.dry.pct === 0, wetBody);

  /* The bottom of a lake is under water. Two things were wrong with the view
     from a body swimming in Mirrorlake, and they arrived as one complaint:
     looking up at the surface looked right, looking down at the bottom did not.

     The first is the colour. The haze the water puts between the lens and a
     surface was all the water used to do, and a haze works over distance: at
     the lake's density a fragment 3 m away took 18% of it and one 10 m away
     took 86%. So the lakebed a body was swimming over kept the dry sand colour
     it has on the shore. What was missing is that the light reaching that
     surface has itself come down through the water above it -- the red goes
     first, and what is left is the colour of the stuff it came through.
     Measured looking straight down from just under the surface: the frame was
     warmer than red (blue-minus-red -16.7) and brighter (mean 137) than the
     same lens looking *up* at the sunlit surface (mean 90). The bottom of a
     lake was brighter than its own sunlit skin.

     The second is the lamps. The renderer discounts the haze for a fragment
     that lights itself, so that a lantern across the valley is still a lantern
     -- and the discount was a constant 0.75 written in the shader, which the
     lake had no say in. The lamp jellyfish sit on the outline of the sunken
     tower, so a body that swims in among them is looking at a ring of them:
     3.6 m off that ring, with the air's 0.75 in force, the frame came back with
     pixels at luminance 246, its 99th percentile at 176 and 0.82% of it over
     200. With the lake's own 0.15 in the way the same frame is 230, 156 and
     0.24%. That is the difference between a lamp and the "sun" on the lakebed.

     Both facts belong to the liquid rather than to the renderer, so both live
     on the water's row in the block table and reach the shader as the
     environment's. In air the environment says 0.75, white and no surface
     overhead, and a frame drawn in air is bit for bit what it was.

     A third thing about the same lake arrived afterwards as a question: why the
     water over a lakebed and the water over a lakebed seen from under the
     surface did not look like the same water. They did not, because the
     transparency of the lake was answered three times over and the three
     answers disagreed -- the absorption baked into the bed when its mesh was
     built, a haze copied from the air's own squared law, and a flat 0.72 alpha
     on the surface's quads -- by 48 luminance at two metres of water. That alpha
     sheet was also the only thing the lake had between a lens and the sky, so it
     was drawn only when the lens was out of the water and cost exactly nothing
     from under it. It is gone. One per-colour law now answers every journey the
     light makes through the lake: the sun's way down, asked of the bed when its
     mesh is built; the way back up from whatever surface the lens is looking at,
     asked of that surface and never of the haze a second time; the water the
     lens itself sits in; and the water between the lens and the surface it is
     looking through. The surface is drawn twice because survival is per colour
     and a blend can only scale the whole frame by one number. The lamps feel it
     too: the light leaving a bell now climbs out through the same law, and the
     frame 3.6 m off the ring is 167 at its brightest, 134 at its 99th percentile
     and nothing at all over 200. */
  const lakebedView = await step('theLakebedIsUnderWater', () => {
    const g = window.game, N = window.FRUTARIA, W = g.world, gl = g.R.gl, p = g.player;
    const jellies = g.creatures.filter(c => c.sp.model === 'jelly');
    const was = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, vx: p.vx, vy: p.vy, vz: p.vz,
      form: p.form, third: g.thirdPerson, camD: g.cam.d, camFov: g.cam.fov, ready: g.camReady,
      time: g.time, mode: g.mode, lens: g._lens, frame: g._camFrame, env: g.env, hover: g.hover,
      jelly: jellies.map(c => ({ c, x: c.x, y: c.y, z: c.z, t: c.t, ph: c.phase, st: c.state,
        yaw: c.yaw, bank: c.bank, tilt: c.tilt, squash: c.squash, speed: c.speed,
        inWater: c.inWater, held: c.held, airAmt: c.airAmt, crouch: c.crouch, flap: c.flap })) };
    const back = (r) => {
      Object.assign(p, { x: was.x, y: was.y, z: was.z, yaw: was.yaw, pitch: was.pitch,
        vx: was.vx, vy: was.vy, vz: was.vz, form: was.form });
      g.thirdPerson = was.third; g.cam.d = was.camD; g.cam.fov = was.camFov; g.camReady = was.ready;
      g.time = was.time; g.mode = was.mode; g._lens = was.lens; g._camFrame = was.frame; g.env = was.env;
      g.hover = was.hover;
      for (const j of was.jelly) {
        Object.assign(j.c, { x: j.x, y: j.y, z: j.z, t: j.t, phase: j.ph, state: j.st,
          yaw: j.yaw, bank: j.bank, tilt: j.tilt, squash: j.squash, speed: j.speed,
          inWater: j.inWater, held: j.held, airAmt: j.airAmt, crouch: j.crouch, flap: j.flap });
      }
      return r;
    };
    p.form = null; g.mode = 'play'; g.thirdPerson = false;
    g.time = N.DAY_LEN * (13 / 24);

    const lake = N.ZONES.find(z => z.id === 'mirrorlake');
    if (!lake || !lake.tower) return back({ error: 'no sunken tower in the mirrorlake zone data' });
    const [tx, tz] = lake.tower;
    if (!jellies.length) return back({ error: 'no lamp jellyfish in the valley' });

    // a shallow shelf of lake and a deep stretch of it, both searched for, and
    // the arm's-length bed B15 is about: two metres of water over the sand, so
    // the lens is a metre and three quarters from the floor it is looking at
    let shallow = null, deep = null, arm = null;
    for (let z = 74; z < 140 && !(shallow && deep && arm); z++) for (let x = 46; x < 112; x++) {
      let top = -1;
      for (let y = W.h - 1; y >= 0; y--) if (W.liquidAt(x, y, z)) { top = y; break; }
      if (top < 0) continue;
      let bed = -1;
      for (let y = top; y >= 0; y--) if (W.solidAt(x, y, z)) { bed = y; break; }
      if (bed < 0) continue;
      const depth = top + 1 - bed;
      if (!shallow && depth >= 6 && depth <= 8) shallow = { x: x + 0.5, z: z + 0.5, top, bed, depth };
      if (!deep && depth >= 9) deep = { x: x + 0.5, z: z + 0.5, top, bed, depth };
      if (!arm && depth === 3) arm = { x: x + 0.5, z: z + 0.5, top, bed, depth };
      if (shallow && deep && arm) break;
    }
    if (!shallow || !deep || !arm) return back({ error: 'no shallow shelf, no deep stretch and no arm-length shelf in the lake' });

    const shot = (lx, lensY, lz, yaw, pitch, solo, dry) => {
      const eyeOff = p.eyePos() - p.y;
      p.x = lx; p.y = lensY - eyeOff; p.z = lz; p.vx = p.vy = p.vz = 0;
      p.yaw = yaw; p.pitch = pitch;
      /* Only the lamps are allowed in this frame. The shot is a question about
         water and about the ring of lamps around the tower, and an owl or a bear
         wandering past the tower, or a fruit that happened to fall near it,
         changes the 99th percentile of the frame by dozens between two runs of
         identical code: the drops are drawn with an emissive boost of their own. */
      const herd = g.creatures, dropsWas = g.drops;
      g.creatures = solo ? [] : jellies; g.drops = [];
      /* A dry shot is the control: the same lens with nothing the water does to
         light left anywhere in the frame. The law, the haze, the colour the
         water scatters back into the ray and the surface itself are all taken
         away, which leaves the bed as the dry sand it is on the shore. Taking
         away one of them and leaving the rest is not a control, it is a third
         kind of water. */
      const ueWas = g.updateEnv, wetMesh = [];
      if (dry) {
        g.updateEnv = function () {
          ueWas.call(g);
          g.env.liqK = [0, 0, 0]; g.env.hazeK = [0, 0, 0]; g.env.hazeOn = 0;
          g.env.inWater = 0; g.env.veil = [0, 0, 0];
        };
        for (let ci = 0; ci < W.chunks.length; ci++) {
          const m = W.chunks[ci];
          if (m && m[2]) { wetMesh.push([ci, m[2].count]); m[2].count = 0; }
        }
      }
      g._camFrame = g.shootCamera(p); g.updateEnv(); g.render();
      if (dry) {
        g.updateEnv = ueWas;
        for (const [ci, c] of wetMesh) W.chunks[ci][2].count = c;
      }
      g.creatures = herd; g.drops = dropsWas;
      const env = { fogDen: +g.env.fogDen.toFixed(4), emisKeep: g.env.emisKeep,
        waterK: g.env.waterK.map(v => +v.toFixed(3)), waterY: g.env.waterY,
        liqK: (g.env.liqK || [0, 0, 0]).map(v => +v.toFixed(3)),
        hazeOn: g.env.hazeOn || 0, hazeK: (g.env.hazeK || [0, 0, 0]).map(v => +v.toFixed(3)),
        veil: (g.env.veil || [0, 0, 0]).map(v => +v.toFixed(3)),
        lensInWater: !!W.liquidFogAt(Math.floor(lx), Math.floor(lensY), Math.floor(lz)) };
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let n = 0, sum = 0, br = 0, hi = 0, lmax = -1;
      const lums = [];
      for (let i = 0; i < px.length; i += 4) {
        const l = 0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2];
        n++; sum += l; br += px[i + 2] - px[i]; lums.push(l);
        if (l > lmax) lmax = l;
        if (l > 200) hi++;
      }
      lums.sort((a, b) => a - b);
      /* Straight down the crosshair, on its own. The whole frame answers "what
         does this lens see", which is not the question the arm's-length bed
         asks: a complaint about the floor a metre and a half in front of the
         face is answered by the patch in front of the crosshair, and nothing
         else. An 80x80 square at the centre is about a metre and a half of
         lakebed from that distance. */
      const cx = Math.floor(w / 2), cy = Math.floor(h / 2), R = 40;
      let pn = 0, psum = 0, pbr = 0, pr = 0, pb = 0;
      for (let y = cy - R; y < cy + R; y++) for (let x = cx - R; x < cx + R; x++) {
        const i = (y * w + x) * 4;
        pn++; psum += 0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2]; pbr += px[i + 2] - px[i];
        pr += px[i]; pb += px[i + 2];
      }
      g._camFrame = null;
      return { env, meanLum: +(sum / n).toFixed(1), blueMinusRed: +(br / n).toFixed(1),
        maxLum: Math.round(lmax), p99: Math.round(lums[Math.floor(n * 0.99)]),
        over200: +(100 * hi / n).toFixed(2),
        near: { meanLum: +(psum / pn).toFixed(1), blueMinusRed: +(pbr / pn).toFixed(1),
          red: +(pr / pn).toFixed(1), blue: +(pb / pn).toFixed(1) } };
    };

    // 1. just under the surface, straight down at the bed it is swimming over
    const down = shot(shallow.x, shallow.top - 0.6, shallow.z, 0, -1.2);
    // 2. the same lens, up at the sunlit underside of the surface
    const up = shot(shallow.x, shallow.top - 0.6, shallow.z, 0, 1.2);
    // 3. the bed at the bottom of the deep stretch, 9 m of water above it
    const floor = shot(deep.x, deep.top - 0.6, deep.z, 0, -1.2);
    /* 4. the lamps, pinned on their ring so this measures the water and not the
       animals: 3.6 m of lake between the lens and the nearest bell. Pinned means
       the pose as well as the place. The bells are emissive and they are most of
       the bright end of the frame, and a lamp with its arms out at the sides
       covers a different number of pixels from one with its arms gathered under
       it: with only the position held, the 99th percentile of this frame came
       back anywhere between 122 and 160 from one run of identical code to the
       next, which is most of the width of the thing being measured. */
    jellies.forEach((c, i) => {
      const a = i / jellies.length * 6.283;
      c.x = tx + 0.5 + Math.cos(a) * 4.5; c.y = 11 + (i % 3) * 0.5;
      c.z = tz + 0.5 + Math.sin(a) * 4.5;
      c.t = 0; c.phase = 0; c.speed = 0; c.state = 'wander';
      c.yaw = 0; c.bank = 0; c.tilt = 0; c.squash = 0; c.inWater = true;
      c.held = 1; c.airAmt = 0; c.crouch = 0; c.flap = 0;
    });
    const lamps = shot(tx + 0.5, 12.0, tz + 8.5, 0, Math.atan2(11.5 - 12.0, 8));
    // 5. the same lens lifted out of the water: the air's answer
    const air = shot(shallow.x, shallow.top + 2.0, shallow.z, 0, -1.2);
    /* 6. and what the draw of a body standing in that lake is handed. A body's
       vertices are built fresh every frame, so unlike the world's its depth
       under the surface cannot be baked into the mesh when it is built: the
       draw has to be handed the surface of the column the body stands in. Read
       off the draw call itself, because the question is what the renderer is
       told -- and the body has to be asked the way the game asks it, by running
       its own update, since the surface it stands in is a fact the body
       collects for itself rather than one the test can hand it. The lens is the
       one out of the water here, on purpose: which water a body is in cannot
       depend on where the thing looking at it happens to be. */
    const body = (() => {
      const herdWas = g.creatures, dropsWas = g.drops, thirdWas = g.thirdPerson, dWas = g.cam.d;
      g.creatures = []; g.drops = []; g.hover = null;   // the outline box is drawn with an identity matrix too
      p.x = shallow.x; p.y = shallow.bed + 1; p.z = shallow.z;
      p.vx = p.vy = p.vz = 0;
      for (let i = 0; i < 3; i++) p.update(1 / 60, {}, g);
      g.thirdPerson = true; g.cam.d = 1.5 + 2.25 * p.bodyScale()[1];
      const lens = { x: shallow.x, y: shallow.top + 2.0, z: shallow.z, yaw: 0, pitch: -1.2,
        fov: g.cam.fov, d: g.cam.d, inBody: false };
      const seen = [];
      const drawWas = g.R.drawMesh;
      g.R.drawMesh = function (mesh, model, opts) {
        // the world's own meshes are drawn with an identity model matrix; a
        // body's parts are the only other thing in this frame with one
        const ident = !model || (model[0] === 1 && model[5] === 1 && model[10] === 1 &&
          model[12] === 0 && model[13] === 0 && model[14] === 0);
        seen.push({ ident, waterY: (opts && opts.waterY) || 0 });
        return drawWas.apply(this, arguments);
      };
      g._lens = lens; g._camFrame = lens;
      g.updateEnv(); g.render();
      g.R.drawMesh = drawWas;
      g.creatures = herdWas; g.drops = dropsWas; g.thirdPerson = thirdWas; g.cam.d = dWas;
      return { bodyY: +p.y.toFixed(3), wSurf: p.wSurf, envWaterY: g.env.waterY,
        surface: shallow.top + 1,
        bodyDraws: seen.filter(s => !s.ident).length,
        bodyWithWater: seen.filter(s => !s.ident && s.waterY === shallow.top + 1).length,
        worldWithWater: seen.filter(s => s.ident && s.waterY > 0).length };
    })();
    /* 7. the two conventions for one column, side by side: the cell the water
       tops out in, and the height of the surface over it. They are one apart,
       the world answers both, and every float level in the valley is set off the
       second while the physics asks the first a dozen times a frame. Swept over
       the whole lake because a reading that disagreed with the other about
       whether a column holds water at all would leave a body a metre under the
       surface, or a metre outside a lake it is standing in. */
    const conventions = (() => {
      let bad = 0, wet = 0, dry = 0;
      for (let z = 74; z < 140; z++) for (let x = 46; x < 112; x++) {
        const wt = N.waterTop(W, x, z, W.h - 1), s = W.liquidSurfaceAt(x, z);
        if (s !== (wt < 0 ? -1 : wt + 1)) bad++;
        if (wt >= 0) wet++; else dry++;
      }
      return { bad, wet, dry,
        shelf: W.liquidSurfaceAt(Math.floor(shallow.x), Math.floor(shallow.z)), top: shallow.top };
    })();
    /* 8. the floor at arm's length. The complaint was a lakebed that would not
       turn the colour of water with its face a metre and a half from the lens.
       Nothing that works along the viewing path could answer it: the haze the
       old water put between a lens and a surface came to 6% over that much
       water. Only the daylight coming down through the lake can, and that is
       the absorption term. Two metres of water over sand, the lens 25 cm under
       the surface -- the scan's `top` is the topmost water *cell*, so the
       surface itself is one above it -- and looking straight down.
       9. the control: the same frame with nothing the water does left anywhere
       in it. "Blue over red" on its own can be met by painting the lake blue;
       this pair can only be met by the water doing what water does to light,
       because the same shot without it is dry sand again.
       10. the same patch deeper down. The red has nowhere left to go at three
       metres of this lake: 15 of it is left, and the water's own red is 15.3, so
       the ladder is carried by the other two. The blue keeps 95 of the 135 a dry
       bed shows at three metres and 73.5 at six, and the light as a whole falls
       from 57.4 to 45.5. That the bed's colours go one after another -- red
       first, blue last -- and that they keep going as the bed goes deeper under a
       lens that has not moved, is the difference between a depth and a tint. */
    const armDown = shot(arm.x, arm.top + 1 - 0.25, arm.z, 0, -1.5, true);
    const armDry = shot(arm.x, arm.top + 1 - 0.25, arm.z, 0, -1.5, true, true);
    const armDeep = shot(shallow.x, shallow.top + 1 - 0.25, shallow.z, 0, -1.5, true);
    return back({ shallow, deep, arm, jelly: jellies.length, down, up, floor, lamps, air,
      body, conventions, armDown, armDry, armDeep });
  });
  check('a body looking down at the lakebed sees water: the frame is blue over red',
    !lakebedView.error && lakebedView.down.blueMinusRed > 10, lakebedView);
  check('and the near lakebed has stopped being the brightest thing in the lake',
    lakebedView.down && lakebedView.down.meanLum < 125 && lakebedView.down.meanLum > 45, lakebedView);
  check('looking up through the surface still reads as the water it is',
    lakebedView.up && lakebedView.up.blueMinusRed > 60 && lakebedView.up.meanLum > 45, lakebedView);
  check('the deep bed, 9 m down, is tinted by the water twice over: coming and going',
    lakebedView.floor && lakebedView.floor.blueMinusRed > 45 && lakebedView.floor.meanLum < 95, lakebedView);
  check('a lamp 3.6 m off in the lake is a lamp, not a sun sitting on the lakebed',
    lakebedView.lamps && lakebedView.lamps.p99 < 170 && lakebedView.lamps.over200 < 0.7 &&
    lakebedView.lamps.meanLum < 75, lakebedView);
  check('the water says what it does to light, and the environment carries it',
    lakebedView.down && lakebedView.down.env.lensInWater === true && lakebedView.down.env.emisKeep < 0.5 &&
    lakebedView.down.env.waterK[0] > lakebedView.down.env.waterK[2] * 4 &&
    lakebedView.down.env.waterY === lakebedView.shallow.top + 1 &&
    lakebedView.down.env.hazeOn === 1 && lakebedView.down.env.hazeK[0] > 0.4 &&
    lakebedView.down.env.veil[2] > 0.2, lakebedView);
  check('in air every one of those answers is the air\'s, so a dry frame is bit for bit what it was',
    lakebedView.air && lakebedView.air.env.lensInWater === false && lakebedView.air.env.emisKeep === 0.75 &&
    lakebedView.air.env.waterK[0] === 0 && lakebedView.air.env.waterK[1] === 0 &&
    lakebedView.air.env.waterK[2] === 0 && lakebedView.air.env.waterY === 0 &&
    lakebedView.air.env.hazeOn === 0, lakebedView);
  /* The frame the same lens draws from a metre out of the water. It used to be
     the air's answer -- and so it was, right down to being warmer than red and
     brighter than the frame from under the surface was. */
  check('and the frame that lens draws from out of the water is still the colour of water: the lake does not turn back into dry sand at its own surface',
    lakebedView.air && lakebedView.air.blueMinusRed > 65 && lakebedView.air.meanLum < 92, lakebedView);
  check('the bed keeps its colour as the lens crosses the surface: the depth that eats the light is the bed\'s, not the lens\'s',
    lakebedView.air && lakebedView.down &&
    Math.abs(lakebedView.air.meanLum - lakebedView.down.meanLum) < 15, lakebedView);
  check('what the water eats per metre is the world\'s answer, carried to every frame whether or not the lens is standing in it',
    lakebedView.air && lakebedView.down && lakebedView.air.env.liqK[0] > 0.4 &&
    lakebedView.air.env.liqK[0] === lakebedView.down.env.liqK[0] &&
    lakebedView.air.env.liqK[0] > lakebedView.air.env.liqK[2] * 4, lakebedView);
  check('a body standing in the lake is drawn with the surface of the lake it stands in, not with the water the lens happens to be in',
    lakebedView.body && lakebedView.body.envWaterY === 0 && lakebedView.body.bodyDraws > 0 &&
    lakebedView.body.bodyWithWater === lakebedView.body.bodyDraws, lakebedView);
  check('and the world\'s own meshes are handed none of it: their depth came in with them',
    lakebedView.body && lakebedView.body.worldWithWater === 0, lakebedView);
  /* The cell the water tops out in and the height of the surface over it are one
     apart, and both readings live in the world now. Swept over the whole lake:
     6204 columns asked twice, and the two answers have to line up everywhere,
     including on "there is no water here" -- a column the two disagree about is a
     body a metre under the surface, or a metre outside a lake it stands in. */
  check('one column, one answer for where its water stops: the cell reading and the height reading agree everywhere, and both say -1 for none',
    lakebedView.conventions && lakebedView.conventions.bad === 0 && lakebedView.conventions.wet > 200 &&
    lakebedView.conventions.dry > 0 &&
    lakebedView.conventions.shelf === lakebedView.conventions.top + 1, lakebedView);
  /* The floor a metre and a half in front of the lens, measured where the lens
     is looking rather than over the whole frame: the haze cannot reach a bed
     that close, so this is the absorption term's own ground. Two metres of water
     over sand reads (15,72,95) -- the teal of a bed whose red is already the
     water's own red -- and the same lens with nothing the water does left in the
     frame reads (204,188,135): the colour of a lakebed that has never been under
     water, and 130 luminance brighter. */
  check('the lakebed at arm\'s length, two metres down, is the colour of water and not of dry sand',
    lakebedView.arm && lakebedView.armDown && lakebedView.armDown.near.blueMinusRed > 5 &&
    lakebedView.armDown.near.meanLum < 160, lakebedView);
  check('and it is the water eating the red that does it: switch it off and the same patch is dry sand again',
    lakebedView.armDry && lakebedView.armDry.near.blueMinusRed < -40 && lakebedView.armDry.near.red > 150 &&
    lakebedView.armDry.near.meanLum - lakebedView.armDown.near.meanLum > 25, lakebedView);
  check('the same patch keeps being eaten as the bed goes deeper, and what is left of the bed is its blue: it is a depth, not a tint',
    lakebedView.armDeep && lakebedView.armDown && lakebedView.armDry &&
    lakebedView.armDown.near.red < lakebedView.armDry.near.red * 0.15 &&
    lakebedView.armDown.near.blue > lakebedView.armDry.near.blue * 0.6 &&
    lakebedView.armDeep.near.blue < lakebedView.armDown.near.blue - 15 &&
    lakebedView.armDeep.near.meanLum < lakebedView.armDown.near.meanLum - 8, lakebedView);

  /* How far under the water a surface is belongs to the surface, not to the
     point its shading is read at. The mesher asked the world "how deep is this
     point under the water above it", which is a question about a column of
     water, and a corner of a submerged face can stand inside the solid next
     door, where no column of water reaches down to it: the answer comes back
     "dry" and the corner is lit the colour of a beach. 852 of the 7,525 faces
     this mesher puts against water had at least one corner answered that way --
     1,981 corners, the worst a corner at (74, 4, 95) standing inside the solid
     with the lake's surface at 6, two metres over its head. In the frame they
     are the strange bright dots on the lakebed: a lens just above the surface of
     Mirrorlake, looking down, sees 5,337 pixels of level bed under at least two
     metres of water, and in the frame the old question leaves on the GPU 12 of
     them come back warmer than blue, 7 brighter than 140, the brightest 162
     against a bed whose own average is 55. Asked of the face -- the water the
     face stands against and its own height -- every corner is answered and every
     one of those dots is gone: the same 5,337 pixels, brightest 60, no patch of
     the bed standing more than 5 over the bed around it.
     Only the pixels 2-4 m down go wrong, and that is the point of reading the
     frame twice: the deeper bands were answered correctly by the old question
     too, so they come back identical, and a check that could not tell the two
     frames apart would be counting pixels rather than looking at them. */
  const faceDepth = await step('lakebedFacesWearTheirDepth', () => {
    const g = window.game, N = window.FRUTARIA, W = g.world, gl = g.R.gl, p = g.player;
    const was = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, vx: p.vx, vy: p.vy, vz: p.vz,
      form: p.form, third: g.thirdPerson, time: g.time, mode: g.mode, lens: g._lens,
      frame: g._camFrame, env: g.env, hover: g.hover, creatures: g.creatures, drops: g.drops,
      parts: g.particles ? g.particles.n : 0 };
    const back = (r) => {
      Object.assign(p, { x: was.x, y: was.y, z: was.z, yaw: was.yaw, pitch: was.pitch,
        vx: was.vx, vy: was.vy, vz: was.vz, form: was.form });
      g.thirdPerson = was.third; g.time = was.time; g.mode = was.mode; g._lens = was.lens;
      g._camFrame = was.frame; g.env = was.env; g.hover = was.hover;
      g.creatures = was.creatures; g.drops = was.drops;
      if (g.particles) g.particles.n = was.parts;
      return r;
    };
    g.mode = 'play'; g.thirdPerson = false; g.hover = null; p.form = null;
    g.creatures = []; g.drops = []; if (g.particles) g.particles.n = 0;
    g.time = N.DAY_LEN * (13 / 24);

    /* Every face the mesher puts against water, and how many of its corners were
       handed no depth at all while the water above them reached higher than they
       do. The expected answer is recomputed here from the surface height the
       face was handed, so this reads the contract between the mesher and the
       builder rather than the builder's arithmetic. */
    const MB = N.MeshBuilder.prototype, qWas = MB.quadAO;
    const measure = (askThePoint) => {
      let quads = 0, badQuads = 0, badCorners = 0, worst = null;
      MB.quadAO = function (pts, c, sh, emis, top, surf) {
        const before = this.n;
        const args = Array.prototype.slice.call(arguments);
        if (askThePoint) args[5] = undefined;
        const r = qWas.apply(this, args);
        if (surf !== undefined) {
          quads++;
          let bad = 0;
          for (let j = 0; j < 6; j++) {
            const k = [0, 1, 2, 0, 2, 3][j];      // quadAO puts 0,1,2,0,2,3
            const y = pts[k * 3 + 1];
            const want = Math.min(255, Math.max(0, surf - y) * 8);
            if (want > 0 && this.dat[(before + j) * 4 + 2] === 0) {
              bad++; badCorners++;
              if (!worst) worst = [pts[k * 3], y, pts[k * 3 + 2], surf];
            }
          }
          if (bad) badQuads++;
        }
        return r;
      };
      for (let ci = 0; ci < W.chunks.length; ci++) W.buildChunk(gl, ci);
      MB.quadAO = qWas;
      return { quads, badQuads, badCorners, worst };
    };

    // a stretch of lake at least seven metres deep, searched for, not assumed
    let deep = null;
    for (let z = 74; z < 140 && !deep; z++) for (let x = 46; x < 112 && !deep; x++) {
      let top = -1;
      for (let y = W.h - 1; y >= 0; y--) if (W.liquidAt(x, y, z)) { top = y; break; }
      if (top < 0) continue;
      let bed = -1;
      for (let y = top; y >= 0; y--) if (W.solidAt(x, y, z)) { bed = y; break; }
      if (bed >= 0 && top + 1 - bed >= 7) deep = { x: x + 0.5, z: z + 0.5, top, bed };
    }
    if (!deep) return back({ error: 'no stretch of the lake seven metres deep' });

    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    p.x = deep.x; p.y = deep.top + 1.05 - (p.eyePos() - p.y); p.z = deep.z;
    p.yaw = 2.4; p.pitch = -0.5; p.vx = p.vy = p.vz = 0;
    const frame = g.shootCamera(p);
    const tanY = Math.tan(frame.fov * Math.PI / 360), tanX = tanY * g.R.aspect;
    const F = g.R.fwd, Rt = g.R.right, U = g.R.up;
    /* What stands in front of one pixel of the lens: a level stretch of bed with
       at least two metres of water over the top of it, and nothing self-lit
       standing in the water above it -- a lamp jellyfish, or a frog pear hung up
       in the sunken tower -- is allowed to be bright and is not what this is
       about. Only
       faces that look straight up are asked: the wall of the basin has its four
       corners at two depths at once and is looked at along itself, which is the
       next step's question and not this one's. */
    const bed = (xx, yy) => {
      const ndcX = (xx + 0.5) / w * 2 - 1, ndcY = 1 - (yy + 0.5) / h * 2;
      const dx = F[0] + Rt[0] * ndcX * tanX + U[0] * ndcY * tanY;
      const dy = F[1] + Rt[1] * ndcX * tanX + U[1] * ndcY * tanY;
      const dz = F[2] + Rt[2] * ndcX * tanX + U[2] * ndcY * tanY;
      const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const hit = W.raycast(frame.x, frame.y, frame.z, dx / L, dy / L, dz / L, 24, true);
      if (!hit || hit.ny !== 1) return null;
      if (!W.liquidAt(hit.x, hit.y + 1, hit.z)) return null;
      const surf = W.liquidSurfaceAt(hit.x, hit.z);
      if (surf < hit.y + 2) return null;
      const bl = N.BLOCKS[hit.block];
      if (!bl || bl.emis) return null;
      for (let y = hit.y + 1; y < surf; y++) {
        const b = W.get(hit.x, y, hit.z);
        if (b && N.BLOCKS[b] && N.BLOCKS[b].emis) return null;
      }
      return { block: hit.block, depth: surf - hit.y };
    };
    /* Read the frame, and sort the pixels of bed it shows by how much water lies
       over them. A pixel is only judged against its own ring 12 px away -- a dot
       is a dot because it is brighter than the bed around it, not because it is
       bright -- and the ring has to be the same bed: 12 px away a ray can leave
       the water, land on the shore, or cross onto another material, and all three
       have their own brightness. */
    const BANDS = [[2, 4], [4, 7], [7, 99]];
    const readBed = () => {
      g._camFrame = frame; g.updateEnv(); g.render();
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const at = (x, y) => ((h - 1 - y) * w + x) * 4;
      const lum = (x, y) => { const i = at(x, y); return 0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2]; };
      const rows = BANDS.map(() => []);
      for (let yy = 24; yy < h - 24; yy += 2) for (let xx = 24; xx < w - 24; xx += 2) {
        const c = bed(xx, yy);
        if (!c) continue;
        const r = bed(xx - 12, yy), l = bed(xx + 12, yy), u = bed(xx, yy - 12), d = bed(xx, yy + 12);
        if (!r || !l || !u || !d) continue;
        if (r.block !== c.block || l.block !== c.block || u.block !== c.block || d.block !== c.block) continue;
        const i = at(xx, yy);
        rows[BANDS.findIndex(b => c.depth >= b[0] && c.depth < b[1])].push({
          lum: lum(xx, yy),
          con: lum(xx, yy) - (lum(xx - 12, yy) + lum(xx + 12, yy) + lum(xx, yy - 12) + lum(xx, yy + 12)) / 4,
          warm: px[i] > px[i + 2]
        });
      }
      return { lens: [+frame.x.toFixed(1), +frame.y.toFixed(1), +frame.z.toFixed(1)],
        st: rows.map((rs, b) => {
          const cs = rs.map(x => x.con).sort((x, y) => x - y);
          const ls = rs.map(x => x.lum).sort((x, y) => x - y);
          const mean = a => +(a.reduce((s, v) => s + v, 0) / Math.max(1, a.length)).toFixed(1);
          return { band: BANDS[b][0] + '-' + BANDS[b][1] + ' m', n: rs.length,
            meanLum: mean(rs.map(x => x.lum)), maxLum: Math.round(ls[ls.length - 1] || 0),
            over140: rs.filter(x => x.lum > 140).length, warm: rs.filter(x => x.warm).length,
            hi22: cs.filter(v => v > 22).length,
            p999: cs.length ? +cs[Math.min(cs.length - 1, Math.floor(cs.length * 0.999))].toFixed(1) : 0,
            maxCon: cs.length ? +cs[cs.length - 1].toFixed(1) : 0 };
        }) };
    };
    /* Three frames, in the order the bug happened in: the geometry the world puts
       up, the geometry the old question leaves on it, and the geometry put back
       afterwards -- which is what says this step is not walking out with broken
       faces on the GPU for the steps that follow. */
    const mesh = measure(false);
    const good = readBed();
    const meshBroken = measure(true);
    const broken = readBed();
    for (let ci = 0; ci < W.chunks.length; ci++) W.buildChunk(gl, ci);
    const goodAgain = readBed();
    g._camFrame = null;
    return back({ deep, mesh, meshBroken, good, broken, goodAgain });
  });
  check('every face the mesher puts against water wears that water at every one of its corners',
    faceDepth.mesh && faceDepth.mesh.quads > 5000 && faceDepth.mesh.badQuads === 0 &&
    faceDepth.mesh.badCorners === 0, faceDepth.mesh);
  check('and the point question this used to ask really does answer "dry" at 852 of those faces, 1,981 corners over',
    faceDepth.meshBroken && faceDepth.meshBroken.quads === faceDepth.mesh.quads &&
    faceDepth.meshBroken.badQuads > 500 && faceDepth.meshBroken.badCorners > 1500, faceDepth.meshBroken);
  const allBands = (r, f) => !!r && !!r.st && r.st.length === 3 && r.st.every(b => b.n > 800 && f(b));
  check('a level lakebed under two metres of water or more is never warmer than it is blue, and never over 140',
    allBands(faceDepth.good, b => b.warm === 0 && b.over140 === 0), faceDepth.good);
  check('nor brighter than that much water lets through: no pixel of the bed over 120',
    allBands(faceDepth.good, b => b.maxLum < 120), faceDepth.good);
  check('and it does not light up in patches either: the 99.9th percentile of a bed pixel over its own ring is under 30',
    allBands(faceDepth.good, b => b.hi22 < 100 && b.p999 < 30), faceDepth.good);
  check('the deeper the water lying over the bed, the less of the bed comes back: 2-4 m reads 55.4, 7 m and deeper 51.0',
    faceDepth.good && faceDepth.good.st[0].n > 800 && faceDepth.good.st[2].n > 800 &&
    faceDepth.good.st[0].meanLum - faceDepth.good.st[2].meanLum > 2, faceDepth.good);
  check('and the frame the old question left on the GPU really does show it: the 2-4 m band comes back at 162 with 12 warm pixels and 44 dots',
    faceDepth.broken && faceDepth.broken.st[0].maxLum > 120 && faceDepth.broken.st[0].over140 > 0 &&
    faceDepth.broken.st[0].warm > 0 && faceDepth.broken.st[0].hi22 > 20 && faceDepth.broken.st[0].p999 > 30,
    faceDepth.broken);
  check('and the lakebed is put back the way it was: the frame rebuilt after the broken one reads pixel for pixel as it did before',
    JSON.stringify(faceDepth.goodAgain) === JSON.stringify(faceDepth.good), faceDepth);

  /* The lakebed grows kelp again, and a stalk of it is a plant, not a lamp. It
     states no light of its own, and it stands in the water, so it wears the
     water the way the bed under it does -- which the mesher could not do for
     anything micro, because the corners of a micro box are not on a column line
     and the depth question answered "dry" for every one of them. It also used
     to state `emis: 1`, copied from the glowcap ring on the next line of the
     block table, and that never showed either because no kelp was ever placed.
     The lens now goes under the surface and hovers 1.2 m over the top of the
     stalk's stem: just above the water the stalks read at 1.3 lum over the
     bed (the
     flat water panes that used to back them were the grid of blue squares the
     user saw under the lake, and the cull that removed them took the stalks'
     last sliver of contrast seen through seven metres of lake), so the old
     lens could not tell a stalk from the bed. Close in, under the surface, a
     stalk is the largest thing in the frame. The diff threshold is two lum,
     not four: a stalk is a low-contrast object (its whole signature is one to
     three lum over the bed), and the render is deterministic (two identical
     grabs differ by zero pixels), so a low threshold counts the stalk with no
     noise to count instead. Read the frame three ways: whole, with the
     emissive micro mesh taken out, and with the ordinary one taken out. A lake
     frame at noon has no self-lit block in it -- the jellyfish lamps are
     bodies and are drawn elsewhere -- so the first pair has to be the same
     frame, and the kelp is in the frame, so the second pair has not be. */
  const kelpFrame = await step('theKelpInTheLakeIsNotALamp', () => {
    const g = window.game, N = window.FRUTARIA, W = g.world, gl = g.R.gl, p = g.player;
    const was = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch,
      vx: p.vx, vy: p.vy, vz: p.vz, form: p.form, third: g.thirdPerson, time: g.time,
      mode: g.mode, lens: g._lens, frame: g._camFrame, env: g.env, hover: g.hover,
      creatures: g.creatures, drops: g.drops };
    const back = (r) => {
      Object.assign(p, { x: was.x, y: was.y, z: was.z, yaw: was.yaw, pitch: was.pitch,
        vx: was.vx, vy: was.vy, vz: was.vz, form: was.form });
      g.thirdPerson = was.third; g.time = was.time; g.mode = was.mode; g._lens = was.lens;
      g._camFrame = was.frame; g.env = was.env; g.hover = was.hover;
      g.creatures = was.creatures; g.drops = was.drops;
      return r;
    };
    let stalks = 0, wet = 0;
    for (let z = 0; z < W.d; z++) for (let x = 0; x < W.w; x++) for (let y = 0; y < W.h; y++) {
      if (W.get(x, y, z) !== 75) continue;
      stalks++;
      if (W.liquidAt(x, y + 1, z)) wet++;
    }
    g.mode = 'play'; g.thirdPerson = false; g.hover = null; p.form = null;
    g.creatures = []; g.drops = []; if (g.particles) g.particles.n = 0;
    g.time = N.DAY_LEN * (13 / 24);
    let deep = null;
    for (let z = 74; z < 140 && !deep; z++) for (let x = 46; x < 112 && !deep; x++) {
      let top = -1;
      for (let y = W.h - 1; y >= 0; y--) if (W.liquidAt(x, y, z)) { top = y; break; }
      if (top < 0) continue;
      let bed = -1;
      for (let y = top; y >= 0; y--) if (W.solidAt(x, y, z)) { bed = y; break; }
      if (bed >= 0 && top + 1 - bed >= 7) deep = { x: x + 0.5, z: z + 0.5, top, bed };
    }
    if (!deep) return back({ error: 'no stretch of the lake seven metres deep' });
    // the underwater stalk nearest that column; the lens hovers 1.2 m over
    // the top of its stem, under the surface
    let near = null, bd = 1e9;
    for (let z = 0; z < W.d; z++) for (let x = 0; x < W.w; x++) for (let y = 0; y < W.h; y++) {
      if (W.get(x, y, z) !== 75 || !W.liquidAt(x, y + 1, z)) continue;
      const d = (x + 0.5 - deep.x) ** 2 + (z + 0.5 - deep.z) ** 2;
      if (d < bd) { bd = d; near = [x, y, z]; }
    }
    if (!near) return back({ error: 'no kelp in the lake' });
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const sx = near[0] + 0.5, sy = near[1], sz = near[2] + 0.5;
    let ly = sy + 0.9 + 1.2;
    while (ly < W.h - 1 && W.solidAt(sx | 0, ly | 0, sz | 0)) ly += 0.5;
    p.x = sx; p.z = sz; p.y = ly - (p.eyePos() - p.y);
    // straight down: at 28 degrees of pitch the frame still reaches the shore,
    // and the shore of this lake wears frog pears on its bushes, which are
    // self-lit and belong to a different question
    p.yaw = 2.4; p.pitch = -1.5; p.vx = p.vy = p.vz = 0;
    const frame = g.shootCamera(p);
    const grab = () => {
      g._camFrame = frame; g.updateEnv(); g.render();
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return px;
    };
    const lum = (a, i) => 0.3 * a[i] + 0.59 * a[i + 1] + 0.11 * a[i + 2];
    const diff = (a, b) => {
      let n = 0, max = 0;
      for (let i = 0; i < a.length; i += 4) {
        const d = Math.abs(lum(a, i) - lum(b, i));
        if (d > 2) n++;
        if (d > max) max = d;
      }
      return { changed: n, max: +max.toFixed(1) };
    };
    const without = (slot) => {
      const saved = [];
      for (let ci = 0; ci < W.chunks.length; ci++) {
        const m = W.chunks[ci];
        if (m && m[slot]) { saved.push([ci, m[slot]]); m[slot] = null; }
      }
      const f = grab();
      for (const [ci, m] of saved) W.chunks[ci][slot] = m;
      return { d: diff(grab(), f), chunks: saved.length };
    };
    const all = grab();
    const noEmis = without(4);       // the emissive micro mesh: where the kelp used to be
    const noMicro = without(3);      // the ordinary one: where it is now
    return back({ stalks, wet, emis: N.BLOCKS[75].emis ? 1 : 0, deep,
      lens: [+frame.x.toFixed(1), +frame.y.toFixed(1), +frame.z.toFixed(1)],
      noEmis, noMicro, all: diff(all, all) });
  });
  check('the lakebed grows kelp again, and every stalk of it stands under the water',
    !kelpFrame.error && kelpFrame.stalks > 20 && kelpFrame.wet === kelpFrame.stalks, kelpFrame);
  check('and a stalk of it states no light of its own',
    !kelpFrame.error && kelpFrame.emis === 0, kelpFrame);
  check('a lake frame at noon holds no self-lit block: taking the emissive mesh out takes nothing out of the frame',
    !kelpFrame.error && kelpFrame.noEmis.d.changed === 0 && kelpFrame.noEmis.d.max < 2, kelpFrame);
  check('and the kelp is in that frame, so that answer is not vacuous: taking the micro mesh out takes the stalks out',
    !kelpFrame.error && kelpFrame.noMicro.d.changed > 200, kelpFrame);


  /* The water between a lens and a lakebed is the water the light walks, and it
     used to be counted straight up: a bed 3 m down was 3 m of water however the
     lens looked at it. From straight above that is the answer. Looked at along 7
     degrees of slope from a lens sitting at the surface line, that same bed 2 m
     in front is 14 m of lake, and 14 m of lake leaves a bed no red at all to
     show. The complaint was that the murk left the frame the moment the lens
     reached the surface line and came back the moment it went under it, and that
     is exactly what the vertical count does: the lens 5 cm under the surface
     reads the whole path as water (the haze is asked along the ray), the lens 5
     cm over reads it as the bed's own depth asked straight up. Measured on the
     bed 2-5 m in front of the lens, 3-4 m down: luminance **69.8** with the lens
     5 cm under the line, **81.3** at the line itself and **87.4** 5 cm over it,
     and **88.6** 30 cm over -- the whole of the murk spent crossing 10 cm of
     lens travel, and 62% more red left on the bed. Asked along the ray the same
     three lenses read **69.8 / 69.8 / 76.9**, and the crossing costs nothing.
     The leg is capped at the ray's own length, because a slab measured along a
     grazing ray runs to infinity and a bed at the horizon is not veiled by a
     thousand metres of lake. */
  const slab = await step('aLakeVeilsItsBedAlongTheRay', () => {
    const g = window.game, N = window.FRUTARIA, W = g.world, gl = g.R.gl, p = g.player;
    const was = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, vx: p.vx, vy: p.vy, vz: p.vz,
      form: p.form, third: g.thirdPerson, time: g.time, mode: g.mode, lens: g._lens,
      frame: g._camFrame, env: g.env, hover: g.hover, creatures: g.creatures, drops: g.drops,
      parts: g.particles ? g.particles.n : 0 };
    const back = (v) => {
      p.x = was.x; p.y = was.y; p.z = was.z; p.yaw = was.yaw; p.pitch = was.pitch;
      p.vx = was.vx; p.vy = was.vy; p.vz = was.vz; p.form = was.form;
      g.thirdPerson = was.third; g.time = was.time; g.mode = was.mode; g._lens = was.lens;
      g._camFrame = was.frame; g.env = was.env; g.hover = was.hover;
      g.creatures = was.creatures; g.drops = was.drops;
      if (g.particles) g.particles.n = was.parts;
      return v;
    };
    g.mode = 'play'; g.thirdPerson = false; g.hover = null; p.form = null;
    g.creatures = []; g.drops = []; if (g.particles) g.particles.n = 0;
    g.time = N.DAY_LEN * (13 / 24);
    /* a shallow shelf with a long fetch: the lake surface the same height for 20
       blocks running north, so a ray that leaves the lens at 7 degrees below the
       horizontal stays over water and over a bed for its whole length */
    let shelf = null;
    for (let z = 74; z < W.d - 24 && !shelf; z++) for (let x = 46; x < W.w - 24 && !shelf; x++) {
      const s = W.liquidSurfaceAt(x, z);
      if (s < 0) continue;
      let same = true;
      for (let k = 1; k <= 20; k++) if (W.liquidSurfaceAt(x, z - k) !== s) { same = false; break; }
      if (!same) continue;
      let bed = -1;
      for (let y = s - 1; y >= 0; y--) if (W.solidAt(x, y, z)) { bed = y; break; }
      if (bed < 0 || s - bed < 3 || s - bed > 4) continue;
      shelf = { x: x + 0.5, z: z + 0.5, surf: s, bed, depth: s - bed };
    }
    if (!shelf) return back({ error: 'no shallow shelf with a 20 block fetch' });
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    const shot = (d, pitch) => {
      const eyeOff = p.eyePos() - p.y;
      p.x = shelf.x; p.y = shelf.surf + d - eyeOff; p.z = shelf.z; p.vx = p.vy = p.vz = 0;
      p.yaw = 0; p.pitch = pitch;
      const fr = g.shootCamera(p);
      g._camFrame = fr; g.updateEnv(); g.render();
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const at = (x, y) => ((h - 1 - y) * w + x) * 4;
      const tanY = Math.tan(fr.fov * Math.PI / 360), tanX = tanY * g.R.aspect;
      const F = g.R.fwd, Rt = g.R.right, U = g.R.up;
      const B = { near: [0, 0, 0, 0], mid: [0, 0, 0, 0] };
      for (let yy = 20; yy < h - 20; yy += 3) for (let xx = 20; xx < w - 20; xx += 3) {
        const ndcX = (xx + 0.5) / w * 2 - 1, ndcY = 1 - (yy + 0.5) / h * 2;
        const dx = F[0] + Rt[0] * ndcX * tanX + U[0] * ndcY * tanY;
        const dy = F[1] + Rt[1] * ndcX * tanX + U[1] * ndcY * tanY;
        const dz = F[2] + Rt[2] * ndcX * tanX + U[2] * ndcY * tanY;
        const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const hit = W.raycast(fr.x, fr.y, fr.z, dx / L, dy / L, dz / L, 30, true);
        if (!hit) continue;
        const ax = hit.x + hit.nx, ay = hit.y + hit.ny, az = hit.z + hit.nz;
        if (!W.liquidAt(ax, ay, az)) continue;         // the face is not under water
        if (W.liquidSurfaceAt(ax, az) < hit.y + 2) continue;   // nor 2 m of it
        const bd = N.BLOCKS[hit.block];
        if (!bd || bd.emis) continue;
        const o = hit.t < 5 ? B.near : hit.t < 10 ? B.mid : null;
        if (!o) continue;
        const i = at(xx, yy);
        o[0]++; o[1] += 0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2];
        o[2] += px[i + 2] - px[i]; o[3] += px[i];
      }
      const o = {};
      for (const k in B) {
        const v = B[k];
        o[k] = v[0] ? { n: v[0], lum: +(v[1] / v[0]).toFixed(1), bmr: +(v[2] / v[0]).toFixed(1),
          red: +(v[3] / v[0]).toFixed(1) } : { n: 0 };
      }
      return { d: +d.toFixed(2), pitch, lensInWater: g.env.inWater, bed: o };
    };
    const rows = [];
    for (const pitch of [-0.12, -1.4])
      for (const d of [-0.05, 0.0, 0.05, 0.30]) rows.push(shot(d, pitch));
    return back({ shelf, rows });
  });
  const row = (pitch, d) => slab.rows.find(r => r.pitch === pitch && r.d === d);
  const sUnder = row(-0.12, -0.05), sOver = row(-0.12, 0.0), sHigh = row(-0.12, 0.05), sAlong = row(-0.12, 0.30);
  const sDownUnder = row(-1.4, -0.05), sDownOver = row(-1.4, 0.0), sDownHigh = row(-1.4, 0.05);
  check('the shelf this asks about really is a bed under water, and the murk really is there',
    !slab.error && sUnder && sUnder.bed.near.n > 2000 && sUnder.bed.near.bmr > 40 && sUnder.bed.near.lum > 40, slab);
  check('the lens crossing the surface line costs the bed nothing: 5 cm under and 5 cm over are the same bed',
    sUnder && sOver && Math.abs(sUnder.bed.near.lum - sOver.bed.near.lum) < 4 &&
    Math.abs(sUnder.bed.near.bmr - sOver.bed.near.bmr) < 4, { under: sUnder && sUnder.bed.near, over: sOver && sOver.bed.near });
  check('and it is still the same bed 10 cm up: the murk does not arrive or leave with the surface line',
    sOver && sHigh && Math.abs(sUnder.bed.near.lum - sHigh.bed.near.lum) < 10 &&
    Math.abs(sUnder.bed.near.bmr - sHigh.bed.near.bmr) < 8, { under: sUnder && sUnder.bed.near, high: sHigh && sHigh.bed.near });
  check('a bed looked at along 7 degrees of slope has walked 14 m of lake: its red is gone',
    sAlong && sAlong.bed.near.red < 35 && sAlong.bed.mid.red < 38, sAlong && sAlong.bed);
  check('and looked at from straight above it keeps the depth it stands at, which is the old answer',
    sDownUnder && sDownOver && sDownHigh &&
    Math.abs(sDownUnder.bed.near.lum - sDownOver.bed.near.lum) < 4 &&
    Math.abs(sDownUnder.bed.near.lum - sDownHigh.bed.near.lum) < 6,
    { under: sDownUnder && sDownUnder.bed.near, over: sDownOver && sDownOver.bed.near, high: sDownHigh && sDownHigh.bed.near });

  /* A lake is not an aquarium. The report was that the bottom of Mirrorlake was
     far too easy to see from its bank: at the absorption the block row carried
     -- 0.16 per metre for the green the eye reads brightest, which is mountain-
     tarn water -- a lens 40 cm over the surface picked out the blocks of a bed 6
     m down: mean 62.2 with 11.2 of spread in the bed itself and 3.23 of it left
     through the water. A lake with something living in it is not that clear. The
     row now eats 2.55 times faster, which puts this lake's own visibility near
     2.5 m, and the same bed keeps 0.045 of its spread: the water, not the bed.
     The spread across the patch is what the eye reads as relief -- a bed is
     blocks and water is not -- so it is measured against the same bed with
     nothing the water does left in the frame, which is the only way to ask how
     much of the bed survives without asking how bumpy that particular bed is.
     What the eye reads as colour is the mean, and the deep patch has come to
     within a luminance of the colour the water itself scatters back into the ray
     (48.5 against the water's 49.7) while the bed 4 m down still stands 3 above
     it. The ratio between the three colours is the one this row has always had:
     that ratio is why the floor is teal and not grey. Only how fast the whole
     thing happens was the part that was wrong. */
  const clarity = await step('aLakeHidesItsBedFromItsBank', () => {
    const g = window.game, N = window.FRUTARIA, W = g.world, gl = g.R.gl, p = g.player;
    const was = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, form: p.form,
      third: g.thirdPerson, time: g.time, mode: g.mode, env: g.env, frame: g._camFrame,
      lens: g._lens, herd: g.creatures, drops: g.drops };
    const back = (r) => {
      Object.assign(p, { x: was.x, y: was.y, z: was.z, yaw: was.yaw, pitch: was.pitch, form: was.form });
      g.thirdPerson = was.third; g.time = was.time; g.mode = was.mode; g.env = was.env;
      g._camFrame = was.frame; g._lens = was.lens; g.creatures = was.herd; g.drops = was.drops;
      return r;
    };
    g.mode = 'play'; g.thirdPerson = false; p.form = null;
    g.time = N.DAY_LEN * (13 / 24);
    g.creatures = []; g.drops = [];
    // one column of each depth, flat water over it for 5x5 so the patch is a bed
    // and not the far shore of the column next to it
    const cols = {};
    for (let z = 60; z < W.d - 20; z++) for (let x = 60; x < W.w - 20; x++) {
      let top = -1;
      for (let y = W.h - 1; y >= 0; y--) if (W.liquidAt(x, y, z)) { top = y; break; }
      if (top < 0) continue;
      let bed = -1;
      for (let y = top; y >= 0; y--) if (W.solidAt(x, y, z)) { bed = y; break; }
      if (bed < 0) continue;
      const depth = top + 1 - bed;
      if (depth < 2 || depth > 9 || cols[depth]) continue;
      let ok = true;
      for (let dx = -2; dx <= 2 && ok; dx++) for (let dz = -2; dz <= 2 && ok; dz++)
        if (W.liquidSurfaceAt(x + dx, z + dz) !== top + 1) ok = false;
      if (!ok) continue;
      cols[depth] = { x: x + 0.5, z: z + 0.5, surf: top + 1, bed, depth };
    }
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    const grab = (col, dry) => {
      const eyeOff = p.eyePos() - p.y;
      p.x = col.x; p.y = col.surf + 0.4 - eyeOff; p.z = col.z;
      p.vx = p.vy = p.vz = 0; p.yaw = 0; p.pitch = -1.45;
      // the dry shot is the control: the same lens with nothing the water does
      // left anywhere in the frame, which is the bed as the spread it has itself
      const ueWas = g.updateEnv, wetMesh = [];
      if (dry) {
        g.updateEnv = function () {
          ueWas.call(g);
          g.env.liqK = [0, 0, 0]; g.env.hazeK = [0, 0, 0]; g.env.hazeOn = 0;
          g.env.inWater = 0; g.env.veil = [0, 0, 0];
        };
        for (let ci = 0; ci < W.chunks.length; ci++) {
          const m = W.chunks[ci];
          if (m && m[2]) { wetMesh.push([ci, m[2].count]); m[2].count = 0; }
        }
      }
      g._camFrame = g.shootCamera(p); g.updateEnv(); g.render();
      if (dry) {
        g.updateEnv = ueWas;
        for (const [ci, c] of wetMesh) W.chunks[ci][2].count = c;
      }
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const cx = Math.floor(w / 2), cy = Math.floor(h / 2), R = 45;
      let n = 0, sum = 0; const lums = [];
      for (let y = cy - R; y < cy + R; y++) for (let x = cx - R; x < cx + R; x++) {
        const i = (y * w + x) * 4;
        const L = 0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2];
        n++; sum += L; lums.push(L);
      }
      const mean = sum / n;
      let v = 0; for (const L of lums) v += (L - mean) * (L - mean);
      g._camFrame = null;
      return { mean: +mean.toFixed(1), sd: +Math.sqrt(v / n).toFixed(2) };
    };
    const rows = {};
    for (const d of [3, 4, 6]) if (cols[d]) {
      const dry = grab(cols[d], true), wet = grab(cols[d], false);
      rows['d' + d] = { depth: d, dryMean: dry.mean, drySd: dry.sd, mean: wet.mean, sd: wet.sd,
        keep: +(wet.sd / Math.max(0.01, dry.sd)).toFixed(3) };
    }
    // the colour the water itself scatters back into a ray, in the same
    // luminance the patches are measured in
    const veil = g.env.veil || [0, 0, 0];
    const veilLum = +(0.3 * veil[0] * 255 + 0.59 * veil[1] * 255 + 0.11 * veil[2] * 255).toFixed(1);
    return back({ K: W.liquidAbsorb(), veilLum, rows });
  });
  check('the bed 6 m down has merged into the water: a twentieth of its own relief survives, and its brightness is the water itself',
    !!clarity.rows.d6 && clarity.rows.d6.drySd > 5 && clarity.rows.d6.keep < 0.1 &&
    Math.abs(clarity.rows.d6.mean - clarity.veilLum) < 3, clarity);
  check('while the bed 4 m down is still a bed: it keeps three tenths of its relief and stands over the colour of the water itself',
    !!clarity.rows.d4 && clarity.rows.d4.drySd > 5 && clarity.rows.d4.keep > 0.2 &&
    clarity.rows.d4.mean > clarity.veilLum + 2, clarity);
  check('and the deeper the bed, the less of it survives the way up: the share of its relief the water leaves falls by an order of magnitude',
    !!clarity.rows.d4 && !!clarity.rows.d6 && clarity.rows.d6.keep * 4 < clarity.rows.d4.keep, clarity);

  /* A mote the world adds to the frame -- a bubble, an ember, a firefly -- is
     not a surface. It is *added* to whatever the frame already holds, so the
     water cannot colour it over: what the water does to a mote is eat part of
     the light the mote sends out on its way to the lens. The world's faces have
     asked that question since the lake learned its law; a particle asked
     nothing at all, and a bubble let go 2 m under Mirrorlake came back at mean
     luminance 140 with 197 sampled pixels over 140 while the lakebed behind it,
     at the same lens, reads 66..70 -- the same strange bright dot the lakebed
     used to be, still floating there after the lakebed itself had been fixed.
     A mote now walks the same road: the water above it, measured along the ray
     rather than straight up, and the water the lens itself sits in. */
  const mote = await step('aMoteWalksTheSameWater', () => {
    const g = window.game, N = window.FRUTARIA, W = g.world, gl = g.R.gl, p = g.player, P = g.particles;
    const was = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, vx: p.vx, vy: p.vy, vz: p.vz,
      form: p.form, third: g.thirdPerson, time: g.time, mode: g.mode, lens: g._lens,
      frame: g._camFrame, env: g.env, hover: g.hover, creatures: g.creatures, drops: g.drops,
      camD: g.cam.d, parts: g.particles ? g.particles.n : 0 };
    const back = (v) => {
      p.x = was.x; p.y = was.y; p.z = was.z; p.yaw = was.yaw; p.pitch = was.pitch;
      p.vx = was.vx; p.vy = was.vy; p.vz = was.vz; p.form = was.form;
      g.thirdPerson = was.third; g.time = was.time; g.mode = was.mode; g._lens = was.lens;
      g._camFrame = was.frame; g.env = was.env; g.hover = was.hover; g.cam.d = was.camD;
      g.creatures = was.creatures; g.drops = was.drops;
      if (g.particles) g.particles.n = was.parts;
      return v;
    };
    g.mode = 'play'; g.thirdPerson = false; g.hover = null; p.form = null;
    g.creatures = []; g.drops = []; P.n = 0;
    g.time = N.DAY_LEN * (13 / 24);
    /* a lake with 4 m of water over its bed, the surface the same height for 12
       blocks running north and water at 2 m under it all the way, so a bubble
       hung under that surface can be looked at from straight above, along 20
       degrees of slope, or from another lens standing in the same water */
    let lake = null;
    for (let z = 74; z < W.d - 14 && !lake; z++) for (let x = 46; x < W.w - 14 && !lake; x++) {
      const s = W.liquidSurfaceAt(x, z);
      if (s < 0) continue;
      let ok = true;
      for (let k = 1; k <= 12; k++) if (W.liquidSurfaceAt(x, z - k) !== s) { ok = false; break; }
      for (let k = 0; k <= 10 && ok; k++) if (!W.liquidAt(x, s - 2, z - k)) ok = false;
      if (!ok) continue;
      let bed = -1;
      for (let y = s - 1; y >= 0; y--) if (W.solidAt(x, y, z)) { bed = y; break; }
      if (bed < 0 || s - bed < 4) continue;
      lake = { x: x + 0.5, z: z + 0.5, surf: s, bed };
    }
    if (!lake) return back({ error: 'no lake with 4 m of water and a 12 block fetch' });
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const A = new Uint8Array(w * h * 4), B = new Uint8Array(w * h * 4);
    /* One mote, one lens, one frame with it and one without: the difference
       between the two is the mote and nothing else, and the blend is additive,
       so that difference is what the mote sends to the lens however bright or
       dark the bed behind it happens to be. `law` off does not touch the world
       at all -- it hands the particle system no world, so the mote is drawn as
       though it stood in no water, over a frame that is byte for byte the one
       the game would draw. */
    const shot = (lens, mp, col, law) => {
      const dx = mp[0] - lens[0], dy = mp[1] - lens[1], dz = mp[2] - lens[2];
      p.x = lens[0]; p.z = lens[2]; p.y = lens[1] - (p.eyePos() - p.y);
      p.vx = p.vy = p.vz = 0;
      p.yaw = Math.atan2(dx, -dz); p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      g.cam.d = 0;
      const fr = g.shootCamera(p);
      g._camFrame = fr; g.updateEnv();
      const env = { inWater: g.env.inWater, under: g.env.inWater ? +(g.env.waterY - fr.y).toFixed(2) : 0 };
      P.n = 0; g._camFrame = fr; g.render();
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, A);
      P.n = 0; P.spawn(mp[0], mp[1], mp[2], 0, 0, 0, 5, col, 0.14, 0);
      let real = null;
      if (!law) { real = P.draw; P.draw = function (R2) { real.call(this, R2, null); }; }
      g._camFrame = fr; g.render();
      if (real) delete P.draw;
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, B);
      let n = 0, maxAdd = 0, red = 0, blue = 0, chk = 0, full = 0;
      for (let i = 0; i < B.length; i += 4) {
        full += A[i] * 65536 + A[i + 1] * 256 + A[i + 2];
        const d0 = B[i] - A[i], d1 = B[i + 1] - A[i + 1], d2 = B[i + 2] - A[i + 2];
        chk += d0 * 65536 + d1 * 256 + d2;
        const add = 0.3 * d0 + 0.59 * d1 + 0.11 * d2;
        if (add <= 0) continue;
        n++;
        if (add > maxAdd) maxAdd = add;
        if (d0 > red) red = d0;
        if (d2 > blue) blue = d2;
      }
      return { n, maxAdd: +maxAdd.toFixed(1), red, blue, chk, full,
        d: +Math.hypot(dx, dy, dz).toFixed(2), env };
    };
    const s = lake.surf, bub = [0.5, 0.85, 1], fly = [0.7, 1, 0.45];
    const deep = [lake.x, s - 2.5, lake.z];            // a bubble hung 2.5 m under
    const flat = [lake.x, s - 2, lake.z];              // and one at 2 m, level with a lens
    const up = [lake.x, s + 1, lake.z];                // a splash 1 m over the skin
    const rows = {};
    rows.down = shot([lake.x, s + 3, lake.z], deep, bub, true);
    rows.downNoLaw = shot([lake.x, s + 3, lake.z], deep, bub, false);
    rows.along = shot([lake.x, s + 0.3, lake.z + 7.7], deep, bub, true);
    rows.near = shot([lake.x, s - 2, lake.z - 2], flat, bub, true);
    rows.far = shot([lake.x, s - 2, lake.z - 8], flat, bub, true);
    rows.skinDeep = shot([lake.x, s - 3, lake.z - 2.1], up, bub, true);
    rows.skinShallow = shot([lake.x, s - 0.3, lake.z - 4.5], up, bub, true);
    rows.air = shot([lake.x - 4, s + 6, lake.z], [lake.x + 1, s + 6, lake.z], fly, true);
    rows.airNoLaw = shot([lake.x - 4, s + 6, lake.z], [lake.x + 1, s + 6, lake.z], fly, false);
    rows.sky = shot([lake.x, s + 2, lake.z], [lake.x + 2.6, s + 6.3, lake.z], fly, true);
    rows.skyNoLaw = shot([lake.x, s + 2, lake.z], [lake.x + 2.6, s + 6.3, lake.z], fly, false);
    return back({ lake, rows });
  });
  const mt = mote.rows || {};
  check('the bubble is really under the lake, the lens really over it, and the frame really shows it',
    !mote.error && mt.down && mt.down.env.inWater === 0 && mt.down.n > 60 && mt.down.maxAdd > 60, mt.down);
  check('the lake eats the mote of light it is holding: the same bubble over the same frame, asked of no water, is three times its red',
    mt.down && mt.downNoLaw && mt.down.full === mt.downNoLaw.full && mt.downNoLaw.red > 3 * mt.down.red,
    { law: mt.down, noLaw: mt.downNoLaw });
  check('and it eats the red of a mote first, while its blue walks on',
    mt.down && mt.downNoLaw && mt.down.red < 0.35 * mt.downNoLaw.red && mt.down.blue > 0.75 * mt.downNoLaw.blue,
    { red: [mt.down && mt.down.red, mt.downNoLaw && mt.downNoLaw.red],
      blue: [mt.down && mt.down.blue, mt.downNoLaw && mt.downNoLaw.blue] });
  check('the road is along the ray: the same bubble at the same distance, looked at along 20 degrees of slope, has walked 7 m of lake and keeps no red at all',
    mt.along && mt.down && mt.along.red < 0.2 * mt.down.red && mt.along.maxAdd < 0.7 * mt.down.maxAdd,
    { along: mt.along, down: mt.down });
  check('the water the lens itself stands in eats a mote the same way: 8 m of lake leaves 2 of its red where 2 m leaves 42',
    mt.near && mt.far && mt.near.env.inWater === 1 && mt.far.env.inWater === 1 && mt.far.red < 0.3 * mt.near.red,
    { near: mt.near, far: mt.far });
  check('a mote over the lake, seen from the bottom of the lake, is eaten by the water the lens stands in',
    mt.skinDeep && mt.skinShallow && mt.skinDeep.red < 0.45 * mt.skinShallow.red,
    { deep: mt.skinDeep, shallow: mt.skinShallow });
  check('a mote in the air, seen from the air, walks no water: the frame is byte for byte what it was',
    mt.air && mt.airNoLaw && mt.sky && mt.skyNoLaw &&
    mt.air.chk === mt.airNoLaw.chk && mt.sky.chk === mt.skyNoLaw.chk,
    { air: [mt.air && mt.air.chk, mt.airNoLaw && mt.airNoLaw.chk],
      sky: [mt.sky && mt.sky.chk, mt.skyNoLaw && mt.skyNoLaw.chk] });

  /* The night's motes are put down by the game, not by the world, and the column
     read the spawner asked -- "the highest solid thing in this column" -- answers
     with the lakebed wherever there is a lake. Over ninety seconds standing on
     the shore of Mirrorlake the old spawner let go **28** of **76** fireflies
     under the surface of the lake and **16** inside a block, and **34%** of the
     motes the night was keeping alive glowed through up to **8.4 m** of water.
     The test asks the spawner where it let them go, and then follows them: a
     mote born in the air that is later found under a surface has drifted into
     water it was never meant to enter. A day run over the same shore is asked
     for the same numbers, to prove the night run is not being handed motes by
     something else. */
  const motes = await step('nightMotesKeepToTheAir', () => {
    const g = window.game, N = window.FRUTARIA, W = g.world, p = g.player, P = g.particles;
    const was = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, vx: p.vx, vy: p.vy, vz: p.vz,
      form: p.form, third: g.thirdPerson, time: g.time, mode: g.mode, lens: g._lens,
      frame: g._camFrame, env: g.env, hover: g.hover, creatures: g.creatures, drops: g.drops,
      input: g.input, amb: g.ambTimer, parts: P.n };
    const back = (v) => {
      p.x = was.x; p.y = was.y; p.z = was.z; p.yaw = was.yaw; p.pitch = was.pitch;
      p.vx = was.vx; p.vy = was.vy; p.vz = was.vz; p.form = was.form;
      g.thirdPerson = was.third; g.time = was.time; g.mode = was.mode; g._lens = was.lens;
      g._camFrame = was.frame; g.env = was.env; g.hover = was.hover; g.input = was.input;
      g.ambTimer = was.amb; g.creatures = was.creatures; g.drops = was.drops;
      P.n = was.parts;
      delete P.spawn;
      return v;
    };
    /* a dry column with a lake running north of it: the shore the spawner is
       asked to scatter its motes around, and the water it must not scatter them
       into. The lake has to run 4 blocks at least, so the ring of 4..18 m the
       spawner draws its motes from reaches it */
    let shore = null;
    for (let z = 60; z < W.d - 20 && !shore; z++) for (let x = 40; x < W.w - 20 && !shore; x++) {
      if (W.liquidSurfaceAt(x, z) >= 0) continue;
      let wet = 0;
      for (let k = 1; k <= 8; k++) if (W.liquidSurfaceAt(x + k, z) >= 0) wet++;
      if (wet < 4) continue;
      shore = { x: x + 0.5, z: z + 0.5 };
    }
    if (!shore) return back({ error: 'no shore with a lake 4 blocks wide within 8' });
    const gy = N.groundY(W, shore.x | 0, shore.z | 0, 40);
    g.mode = 'play'; g.thirdPerson = false; g.hover = null; p.form = null;
    g.creatures = []; g.drops = []; g.input = {};
    const stand = () => { p.x = shore.x; p.z = shore.z; p.y = gy + 1; p.vx = p.vy = p.vz = 0; };
    const runs = {};
    for (const tag of ['night', 'day']) {
      g.time = N.DAY_LEN * (tag === 'night' ? 22 / 24 : 13 / 24);
      stand(); g.update(1 / 60); g.update(1 / 60);      // let the environment settle
      P.n = 0;
      const born = { total: 0, inSolid: 0, underWater: 0, inAir: 0, hover: 0, offMap: 0 };
      const real = P.spawn;
      P.spawn = function (x, y, z, vx, vy, vz, life, c, size, grav) {
        born.total++;
        if (grav === 0) born.hover++;
        const s = W.liquidSurfaceAt(x | 0, z | 0);
        if (!W.inside(x | 0, y | 0, z | 0)) born.offMap++;
        if (W.solidAt(x | 0, y | 0, z | 0)) born.inSolid++;
        else if (s >= 0 && y < s) born.underWater++;
        else born.inAir++;
        return real.call(this, x, y, z, vx, vy, vz, life, c, size, grav);
      };
      let samples = 0, liveSolid = 0, liveUnder = 0, liveOff = 0, maxUnder = 0;
      for (let f = 0; f < 900; f++) {
        stand();
        g.update(1 / 60);
        for (let i = 0; i < P.n; i++) {
          samples++;
          if (!W.inside(P.px[i] | 0, P.py[i] | 0, P.pz[i] | 0)) liveOff++;
          if (W.solidAt(P.px[i] | 0, P.py[i] | 0, P.pz[i] | 0)) liveSolid++;
          const s = W.liquidSurfaceAt(P.px[i] | 0, P.pz[i] | 0);
          if (s >= 0 && P.py[i] < s) { liveUnder++; if (s - P.py[i] > maxUnder) maxUnder = s - P.py[i]; }
        }
      }
      delete P.spawn;
      runs[tag] = { born, samples, liveSolid, liveUnder, liveOff, maxUnder: +maxUnder.toFixed(2), live: P.n };
    }
    return back({ shore, runs });
  });
  const mo = motes.runs || {};
  check('the night over a lake shore really is scattering fireflies, and the day over the same shore is not',
    !motes.error && mo.night && mo.night.born.hover > 20 && mo.day && mo.day.born.total === 0,
    { night: mo.night && mo.night.born, day: mo.day && mo.day.born });
  check('no firefly is born under the surface of a lake, nor buried in a block',
    mo.night && mo.night.born.underWater === 0 && mo.night.born.inSolid === 0,
    mo.night && mo.night.born);
  check('and none of the night\'s motes is found glowing through the lake it was put beside',
    mo.night && mo.night.samples > 2000 && mo.night.liveUnder === 0 && mo.night.maxUnder === 0,
    mo.night && { samples: mo.night.samples, liveUnder: mo.night.liveUnder, maxUnder: mo.night.maxUnder });
  check('and none of them is let go off the edge of the map, where the world answers "air" to a question that was never asked',
    mo.night && mo.night.born.offMap === 0 && mo.night.liveOff === 0,
    mo.night && { bornOff: mo.night.born.offMap, liveOff: mo.night.liveOff });
  check('and none of the night\'s motes is inside a block, where a mote is not seen through the block but simply is not',
    mo.night && mo.night.samples > 2000 && mo.night.liveSolid === 0,
    mo.night && { samples: mo.night.samples, liveSolid: mo.night.liveSolid });

  /* A mote is drawn, not walked. It has no size and no mass, and the frame it is
     added into has already been depth-tested, so a mote inside a block is not seen
     *through* the block -- it is simply not there, for as long as it is in there,
     holding a slot off the 900 and fading where nobody can see it. The four ways
     the valley makes light were asked where it went, following every mote for the
     whole of a life. The night over a lake shore: **703** of **12,917** samples
     inside a block. The dust of the highest isle: **20,793** of **65,627**
     (**31.7%**), and **87** of its **371** grains were already inside a block at
     the moment they were born, because the span they are scattered over is a box
     and the isle is standing in it. A spark burst at the ground it stands on:
     **286** of **4,109** samples under that ground; thrown up under a crown:
     **426** of **4,080** inside the needles over its own head. And the ring the
     night's motes are scattered over reaches eighteen metres out from the body,
     which near the edge of the map is off the map, where `get` answers "air" to a
     question that was never asked: standing eight blocks in from the edge, **85**
     of **682** fireflies were let go outside the valley and **21,863** of
     **149,080** samples (**14.7%**) were spent there, glowing at nothing. After:
     **0** at every one of the four, and a mote deliberately closed inside a needle
     still walks its way out in **19** frames. */
  const sparks = await step('aMoteKeepsToTheAirItWasGiven', () => {
    const g = window.game, N = window.FRUTARIA, W = g.world, P = g.particles, p = g.player;
    const was = { x: p.x, y: p.y, z: p.z, night: g.night, amb: g.ambTimer, parts: P.n,
      mode: g.mode, headWater: p.headWater };
    const back = (v) => {
      Object.assign(p, { x: was.x, y: was.y, z: was.z, headWater: was.headWater });
      g.night = was.night; g.ambTimer = was.amb; g.mode = was.mode; P.n = was.parts;
      return v;
    };
    // one column of each kind to throw sparks at: open ground, a riser, a crown
    let open = null, wall = null, crown = null;
    for (let z = 12; z < W.d - 12 && (!open || !wall || !crown); z++) {
      for (let x = 12; x < W.w - 12 && (!open || !wall || !crown); x++) {
        if (W.liquidSurfaceAt(x, z) >= 0) continue;
        const gy = N.groundY(W, x, z, W.h - 1), ty = N.terrainY(W, x, z, W.h - 1);
        if (ty < 12 || ty > 34) continue;
        if (!open && gy === ty) open = [x, z];
        /* a crown to throw sparks up into: needles four blocks over the ground,
           and the two blocks over the ground themselves empty, so the burst is
           let go in air and the needles it rises into are the thing being asked
           about -- a column with the trunk in it would bury the burst at its
           birth, and a mote born inside a block keeps its move by the rule below */
        if (!crown && gy > ty + 3 && !W.solidAt(x, ty + 1, z) && !W.solidAt(x, ty + 2, z) &&
            W.solidAt(x, ty + 4, z)) crown = [x, z];
        if (!wall) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
          if (N.terrainY(W, x + dx, z + dz, W.h - 1) - ty >= 3) { wall = [x, z]; break; }
      }
    }
    if (!open || !wall || !crown) return back({ error: 'no open ground, no riser and no crown to measure on' });
    const burst = (at, y) => {
      P.n = 0;
      g.particleBurst(at[0] + 0.5, y, at[1] + 0.5, [1, 0.6, 0.2], 40);
      let samples = 0, inSolid = 0, inLeaf = 0, far = 0;
      for (let f = 0; f < 200; f++) {
        for (let i = 0; i < P.n; i++) {
          samples++;
          const cx = P.px[i] | 0, cy = P.py[i] | 0, cz = P.pz[i] | 0;
          if (W.solidAt(cx, cy, cz)) { if (N.TREE_BLOCK[W.get(cx, cy, cz)]) inLeaf++; else inSolid++; }
          const d = Math.hypot(P.px[i] - (at[0] + 0.5), P.py[i] - y, P.pz[i] - (at[1] + 0.5));
          if (d > far) far = d;
        }
        P.update(1 / 60, W);
      }
      return { samples, inSolid, inLeaf, far: +far.toFixed(2) };
    };
    const rows = {
      ground: burst(open, N.terrainY(W, open[0], open[1], W.h - 1) + 0.2),
      wall: burst(wall, N.terrainY(W, wall[0], wall[1], W.h - 1) + 0.2),
      crown: burst(crown, N.terrainY(W, crown[0], crown[1], W.h - 1) + 0.2)
    };
    // the dust of the highest isle, at the game's own rate from the game's own spot
    const beams = N.POIS.find(q => q.id === 'beams');
    p.x = beams.x; p.z = beams.z; p.y = beams.y; p.headWater = false;
    g.night = 0; g.ambTimer = 0; P.n = 0;
    let born = 0, bornIn = 0, dSamples = 0, dIn = 0;
    /* Instrumented for the soak flake that went red one run in three: a guard
       that refuses the move into a solid should make inSolid zero on any world
       that does not change while the loop runs, and one run nonetheless spent
       152 of 61,073 samples inside a block. So the question is no longer
       "does the guard work" but "what was the world doing to the mote": for
       the first motes found inside a block, the trail says where the mote was
       in the frames before, with the block its own cell held at each of them,
       and the dump says what the cells around it hold when it is caught. A
       trail that runs on in one place while the block id under it turns from
       air into stone is a world that changed under a resting mote; a trail
       that walks into the block is a guard the world got through. */
    const trails = new Map();
    const bad = [];
    for (let f = 0; f < 3600; f++) {
      const nWas = P.n;
      g.ambient(1 / 60);
      for (let i = nWas; i < P.n; i++) {
        born++;
        if (W.solidAt(P.px[i] | 0, P.py[i] | 0, P.pz[i] | 0)) bornIn++;
      }
      for (let i = 0; i < P.n; i++) {
        dSamples++;
        const cx = P.px[i] | 0, cy = P.py[i] | 0, cz = P.pz[i] | 0;
        const solid = W.solidAt(cx, cy, cz);
        if (solid) dIn++;
        if (solid && bad.length < 6) {
          const around = [];
          for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++)
            for (let dx = -1; dx <= 1; dx++)
              around.push(W.get(cx + dx, cy + dy, cz + dz));
          bad.push({ f, i, x: +P.px[i].toFixed(3), y: +P.py[i].toFixed(3), z: +P.pz[i].toFixed(3),
            cell: [cx, cy, cz], block: W.get(cx, cy, cz),
            vx: +P.vx[i].toFixed(4), vy: +P.vy[i].toFixed(4), vz: +P.vz[i].toFixed(4),
            life: +P.life[i].toFixed(2), grav: P.grav[i],
            trail: (trails.get(i) || []).slice(-90), around });
        }
        const h = trails.get(i) || [];
        h.push([f, +P.px[i].toFixed(3), +P.py[i].toFixed(3), +P.pz[i].toFixed(3),
          solid ? 1 : 0, W.get(cx, cy, cz), +P.vy[i].toFixed(4)]);
        if (h.length > 90) h.shift();
        trails.set(i, h);
      }
      P.update(1 / 60, W);
    }
    rows.dust = { born, bornIn, samples: dSamples, inSolid: dIn, bad };
    /* the ring the night's motes are scattered over reaches eighteen metres out
       from the body, so a body standing near the edge of the map scatters some of
       them off the map, where `get` answers "air" to a question that was never
       asked and nothing stops them again */
    let edge = null;
    for (let z = 8; z < W.d - 8 && !edge; z++) {
      for (let x = 8; x < 16 && !edge; x++) {
        if (W.liquidSurfaceAt(x, z) >= 0) continue;
        const gy = N.groundY(W, x, z, W.h - 1);
        if (gy > 6 && gy < W.h - 8) edge = [x, z];
      }
    }
    if (!edge) return back({ error: 'no dry column within eighteen of the edge', rows });
    p.x = edge[0] + 0.5; p.z = edge[1] + 0.5; p.y = N.groundY(W, edge[0], edge[1], W.h - 1);
    g.night = 1; g.ambTimer = 0; P.n = 0;
    let eBorn = 0, eOff = 0, eSamples = 0, eLiveOff = 0;
    for (let f = 0; f < 3600; f++) {
      const nWas = P.n;
      g.ambient(1 / 60);
      for (let i = nWas; i < P.n; i++) {
        eBorn++;
        if (!W.inside(P.px[i] | 0, P.py[i] | 0, P.pz[i] | 0)) eOff++;
      }
      for (let i = 0; i < P.n; i++) {
        eSamples++;
        if (!W.inside(P.px[i] | 0, P.py[i] | 0, P.pz[i] | 0)) eLiveOff++;
      }
      P.update(1 / 60, W);
    }
    rows.edge = { at: edge, born: eBorn, bornOff: eOff, samples: eSamples, off: eLiveOff };
    /* and a mote the world has already closed around keeps its own move: it is a
       mote inside a needle, not a mote pressed against one, and it can still work
       its way out -- the same answer a flying body gets from the height gate. */
    const cy = N.groundY(W, crown[0], crown[1], W.h - 1) - 1;   // the topmost needle cell
    P.n = 0;
    P.spawn(crown[0] + 0.5, cy + 0.5, crown[1] + 0.5, 0, 1.5, 0, 5, [1, 1, 1], 0.2, 0);
    let out = -1;
    for (let f = 0; f < 240 && out < 0; f++) {
      P.update(1 / 60, W);
      if (P.n === 0) break;
      if (!W.solidAt(P.px[0] | 0, P.py[0] | 0, P.pz[0] | 0)) out = f;
    }
    rows.escape = { cell: [crown[0], cy, crown[1]], block: W.get(crown[0], cy, crown[1]), out };
    return back(rows);
  });
  check('a spark burst keeps to the air it was thrown into: on open ground, against a riser, under a crown',
    !sparks.error && sparks.ground.samples > 2000 && sparks.ground.inSolid === 0 &&
    sparks.wall.inSolid === 0 && sparks.crown.inSolid === 0 && sparks.crown.inLeaf === 0 &&
    sparks.ground.far > 0.5, sparks);
  check('the dust of the highest isle is let go above the beams and not inside the isle that holds them',
    !sparks.error && sparks.dust.born > 100 && sparks.dust.bornIn === 0 && sparks.dust.inSolid === 0,
    sparks.dust);
  check('and the night keeps its motes inside the valley: standing near the edge of the map does not scatter them off it',
    !sparks.error && sparks.edge.born > 100 && sparks.edge.bornOff === 0 && sparks.edge.off === 0,
    sparks.edge);
  check('a mote the world has already closed around still keeps its move, and works its way out of it',
    !sparks.error && sparks.escape.out > 0 && sparks.escape.out < 240, sparks.escape);

  /* A chunk is a box 16 wide, 16 deep and the whole height of the map, and it
     was thrown away as a ball 15 across centred at half that height. Its own
     corners are 26.5 out from that centre, so a chunk whose only piece on screen
     was one of them went whole, and the sky showed through the hole: a lens just
     above Mirrorlake looking down at 69 degrees asked the world what stood in
     front of it and found nothing drawn on 56,633 of the pixels that had an
     answer, a grey wedge of dry sky at the far corner of a chunk of lakebed.
     The test is the frame against itself: the same lens drawn with the culling
     the game runs, and drawn with none at all. Anything the two disagree about
     is geometry that was thrown away for no reason. */
  const cull = await step('aChunkIsCulledAsABox', () => {
    const g = window.game, N = window.FRUTARIA, W = g.world, gl = g.R.gl, p = g.player;
    const was = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, vx: p.vx, vy: p.vy, vz: p.vz,
      form: p.form, third: g.thirdPerson, time: g.time, mode: g.mode, lens: g._lens,
      frame: g._camFrame, env: g.env, hover: g.hover, creatures: g.creatures, drops: g.drops,
      parts: g.particles ? g.particles.n : 0 };
    const back = (r) => {
      Object.assign(p, { x: was.x, y: was.y, z: was.z, yaw: was.yaw, pitch: was.pitch,
        vx: was.vx, vy: was.vy, vz: was.vz, form: was.form });
      g.thirdPerson = was.third; g.time = was.time; g.mode = was.mode; g._lens = was.lens;
      g._camFrame = was.frame; g.env = was.env; g.hover = was.hover;
      g.creatures = was.creatures; g.drops = was.drops;
      if (g.particles) g.particles.n = was.parts;
      return r;
    };
    g.mode = 'play'; g.thirdPerson = false; g.hover = null; p.form = null;
    g.creatures = []; g.drops = []; if (g.particles) g.particles.n = 0;
    g.time = N.DAY_LEN * (13 / 24);
    const vb = g.R.visibleBox;
    if (!vb) return back({ error: 'the renderer has no box culling to test' });
    /* the lenses are found by searching the lake for water at least four metres
       over the bed, so none of them is a number that has to be re-guessed when
       the lake changes shape */
    const spots = [];
    for (let z = 74; z < 140; z += 3) for (let x = 46; x < 112; x += 3) {
      let top = -1;
      for (let y = W.h - 1; y >= 0; y--) if (W.liquidAt(x, y, z)) { top = y; break; }
      if (top < 0) continue;
      let bed = -1;
      for (let y = top; y >= 0; y--) if (W.solidAt(x, y, z)) { bed = y; break; }
      if (bed >= 0 && top - bed >= 4) spots.push([x + 0.5, top + 1.05, z + 0.5]);
    }
    if (spots.length < 4) return back({ error: 'the lake is not wide enough to stand four lenses in' });
    const pick = [spots[0], spots[(spots.length * 0.3) | 0], spots[(spots.length * 0.6) | 0], spots[spots.length - 1]];
    const lenses = [];
    for (let i = 0; i < 4; i++) {
      lenses.push(['lake ' + i + ' down', pick[i][0], pick[i][1], pick[i][2], 2.4 + i * 1.1, -1.2]);
      lenses.push(['lake ' + i + ' level', pick[i][0], pick[i][1], pick[i][2], 0.7 + i * 1.7, -0.25]);
    }
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const a = new Uint8Array(w * h * 4), b = new Uint8Array(w * h * 4);
    const out = [];
    for (const [name, x, y, z, yaw, pitch] of lenses) {
      p.x = x; p.y = y - (p.eyePos() - p.y); p.z = z; p.yaw = yaw; p.pitch = pitch;
      p.vx = p.vy = p.vz = 0;
      const frame = g.shootCamera(p);
      // how much of the world this lens throws away, so that a check which
      // never drops anything cannot pass by doing nothing
      let culled = 0;
      for (let cz = 0; cz < W.cz; cz++) for (let cx = 0; cx < W.cx; cx++)
        if (!vb.call(g.R, cx * W.cs, 0, cz * W.cs, cx * W.cs + W.cs, W.h, cz * W.cs + W.cs)) culled++;
      g._camFrame = frame; g.updateEnv(); g.render();
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, a);
      g.R.visibleBox = () => true;
      g._camFrame = frame; g.updateEnv(); g.render();
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, b);
      g.R.visibleBox = vb;
      let diff = 0, maxd = 0;
      for (let i = 0; i < a.length; i += 4) {
        const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
        if (d > 2) { diff++; if (d > maxd) maxd = d; }
      }
      out.push({ name, culled, diff, maxd });
    }
    g._camFrame = null;
    return back({ lenses: out.length, culled: out.map(o => o.culled), diffs: out });
  });
  check('culling a chunk as the box it is never drops a piece of the world the lens was looking at',
    cull.diffs && cull.diffs.length === 8 && cull.diffs.every(d => d.diff === 0), cull.diffs);
  check('and these frames do cull: every lens throws whole chunks away, so the check above is not passing by drawing everything',
    cull.diffs && cull.diffs.every(d => d.culled > 0), cull);

  /* 11. A body in the air or in the water is a body that has to travel.
     Three things were wrong with how such a body moved, and they showed up
     together as one: it went where the mouse pointed, instantly, at a speed that
     had nothing to do with the animal wearing it, and its body stayed dead level
     whatever its path was doing. Measured before any of this: a swimming body
     peaked at a course change of 94 rad/s and came about 45 degrees in 0.17 s;
     a worn owl body puttered through the air at 4.2 m/s while the wild owls of
     the valley fly at 7.0; a worn frog body tore through the lake at 9.9 m/s
     while the wild frogs swim at 4.6; a diving frog swam along horizontally like
     a periscope; and an owl that let go of the climb key beat its wings at full
     stroke while it fell at its glide speed.
     The spots to measure at are the ones with nothing in the way, and the world
     has to be searched for them: Mirrorlake is two basins round a dry island, so
     the widest disc of water at least 4 m deep is about 16 m across, and the
     search asks for a disc of radius 6 -- 16 sample points round it, every one of
     them 4 m deep or more -- and takes the first that holds. A body swimming in a
     straight line still runs into a bank inside a couple of seconds. Two tricks
     get round that. A body whose aim is held a quarter turn off its own course
     carves a circle and stays where it is, so the lake it needs is the lake it
     already has -- and the radius it holds is its speed over its turn rate,
     which is a second measurement for free. And every heading number is guarded
     by a speed floor on both frames it is taken between, because a body pressed
     against a wall has its velocity zeroed by the collision code, and the
     heading of a body that is not moving is noise. */
  const spots = await step('moveSpots', () => {
    const g = window.game, W = g.world;
    const depthAt = (x, z) => {
      let top = -1, n = 0;
      for (let y = 40; y >= 0; y--) {
        if (W.liquidAt(x, y, z)) { if (top < 0) top = y; n++; }
        else if (top >= 0 && W.solidAt(x, y, z)) break;
      }
      return { top, n };
    };
    let lake = null;
    for (let x = 20; x < W.w - 20 && !lake; x += 2)
      for (let z = 20; z < W.d - 20 && !lake; z += 2) {
        const d = depthAt(x, z);
        if (d.n < 4) continue;
        let ok = true;
        for (let r = 6; r <= 6 && ok; r++)
          for (let a = 0; a < 16 && ok; a++)
            if (depthAt(Math.round(x + Math.cos(a / 16 * 6.283) * r),
                        Math.round(z + Math.sin(a / 16 * 6.283) * r)).n < 4) ok = false;
        if (ok) lake = { x: x + 0.5, z: z + 0.5, top: d.top, n: d.n };
      }
    let sky = null;
    for (let x = 40; x < W.w - 40 && !sky; x += 3)
      for (let z = 40; z < W.d - 40 && !sky; z += 3) {
        let ok = true;
        for (let dx = -12; dx <= 12 && ok; dx++)
          for (let dz = -12; dz <= 12 && ok; dz++)
            for (let yy = 36; yy <= 52 && ok; yy++)
              if (W.solidAt(x + dx, yy, z + dz)) ok = false;
        if (ok) sky = { x: x + 0.5, z: z + 0.5, y: 46 };
      }
    // a one-block shore shelf: water over bed, air above, dry land next door
    let shelf = null;
    for (let x = 20; x < W.w - 20 && !shelf; x++)
      for (let z = 20; z < W.d - 20 && !shelf; z++) {
        if (!W.liquidAt(x, 14, z) || W.liquidAt(x, 15, z) || !W.solidAt(x, 13, z)) continue;
        if (W.liquidAt(x + 1, 14, z) || !W.solidAt(x + 1, 14, z)) continue;
        shelf = { x: x + 0.5, z: z + 0.5, top: 14, shore: 15 };
      }
    window.__mv = { lake, sky, shelf };
    return { lake, sky, shelf };
  });
  check('the valley has open water, open air and a one-block shore shelf to measure on',
    !!spots.lake && !!spots.sky && !!spots.shelf, spots);

  /* 11a. The worn body and the animal are one animal, so they move at one speed
     and turn at one rate. The wild animal's record is the source: an owl body
     flies at the valley's owl speed, a frog body swims at the valley's frog
     speed, and the turn rate is the same number in both records. */
  const pace = await step('bodyTravelsAtItsAnimalPace', () => {
    const N = window.FRUTARIA, g = window.game, p = g.player;
    const { lake, sky } = window.__mv;
    if (!lake || !sky) return { error: 'no open water or open air' };
    const was = { form: p.form, x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, yaw: p.yaw,
      pitch: p.pitch, faceYaw: p.faceYaw, bank: p.bank, tilt: p.tilt, vital: p.vital, air: p.air,
      dry: p.dry, fright: p.fright, grounded: p.grounded };
    const circle = (form, at, keys) => {
      p.form = form; p.vital = 10; p.dry = 0; p.fright = 0; p.air = 999;
      p.x = at.x; p.z = at.z; p.y = at.y;
      p.vx = p.vy = p.vz = 0; p.bank = 0; p.tilt = 0; p.faceYaw = 0; p.pitch = 0; p.grounded = false;
      const spds = [];
      let t = 0, path = 0, px = p.x, pz = p.z, rate = 0;
      for (let i = 0; i < 240; i++) {
        const dt = 1 / 60; t += dt;
        const hv = Math.hypot(p.vx, p.vz) > 0.05 ? Math.atan2(p.vx, -p.vz) : 0;
        p.yaw = hv + Math.PI / 2;                 // always a quarter off: a full carve
        g.input = keys(); g.particles.n = 0; g.hover = null;
        p.update(dt, g.input, g);
        if (t > 1.5) {
          const h2 = Math.hypot(p.vx, p.vz) > 0.05 ? Math.atan2(p.vx, -p.vz) : hv;
          spds.push(Math.hypot(p.vx, p.vz));
          rate = Math.max(rate, Math.abs(N.angleDelta(hv, h2)) / dt);
          path += Math.hypot(p.x - px, p.z - pz); px = p.x; pz = p.z;
        }
      }
      const mean = spds.reduce((a, b) => a + b, 0) / spds.length;
      const dev = Math.sqrt(spds.reduce((a, b) => a + (b - mean) * (b - mean), 0) / spds.length);
      return { mean: +mean.toFixed(2), dev: +dev.toFixed(2), rate: +rate.toFixed(2),
        radius: +(path / (2 * Math.PI)).toFixed(2) };
    };
    const frog = circle('frogpear', { x: lake.x, z: lake.z, y: lake.top - 1.0 },
      () => ({ fwd: true, jump: p.y < lake.top - 1.2, sneak: false, sprint: false }));
    const owl = circle('owlberry', { x: sky.x, z: sky.z, y: sky.y },
      () => ({ fwd: true, jump: p.y < sky.y + 6, sneak: false, sprint: false }));
    Object.assign(p, was);
    return { frog, owl,
      wild: { swim: N.CREATURE_BY_ID.frog.swimSpeed, fly: N.CREATURE_BY_ID.owl.flySpeed },
      turn: { frog: N.FRUIT_BY_ID.frogpear.form.turn === N.CREATURE_BY_ID.frog.turn,
              owl: N.FRUIT_BY_ID.owlberry.form.turn === N.CREATURE_BY_ID.owl.turn } };
  });
  check('a worn frog body swims at the speed the wild frogs swim at',
    !pace.error && Math.abs(pace.frog.mean / pace.wild.swim - 1) < 0.05, pace);
  check('a worn owl body flies at the speed the wild owls fly at',
    !pace.error && Math.abs(pace.owl.mean / pace.wild.fly - 1) < 0.05, pace);
  check('and it holds that speed while it carves, so the number is a cruise and not a peak',
    !pace.error && pace.frog.dev < 0.3 && pace.owl.dev < 0.3, pace);
  check('the body and the animal turn at one rate: one animal, one number',
    pace.turn.frog && pace.turn.owl, pace);

  /* 11b. The course bends. `turn` is the most radians a second the body may add
     to its heading at its own cruising speed, and it is a limit the body
     actually presses against when the aim is snapped round a quarter turn. */
  const carve = await step('fluidBodyCarves', () => {
    const N = window.FRUTARIA, g = window.game, p = g.player;
    const { lake, sky } = window.__mv;
    if (!lake || !sky) return { error: 'no open water or open air' };
    const was = { form: p.form, x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, yaw: p.yaw,
      pitch: p.pitch, faceYaw: p.faceYaw, bank: p.bank, tilt: p.tilt, vital: p.vital, air: p.air,
      dry: p.dry, fright: p.fright, grounded: p.grounded };
    const WINDOW = 45;
    const run = (form, at, turn, keys, frames) => {
      p.form = form; p.vital = 10; p.dry = 0; p.fright = 0; p.air = 999;
      p.x = at.x; p.z = at.z; p.y = at.y;
      p.vx = p.vy = p.vz = 0; p.bank = 0; p.tilt = 0; p.faceYaw = 0; p.pitch = 0; p.grounded = false;
      const rec = [];
      let t = 0;
      for (let i = 0; i < frames; i++) {
        const dt = 1 / 60; t += dt;
        p.yaw = t < WINDOW / 60 ? 0 : -Math.PI / 2 * turn;
        g.input = keys(); g.particles.n = 0; g.hover = null;
        p.update(dt, g.input, g);
        rec.push({ t, x: p.x, y: p.y, z: p.z, spd: Math.hypot(p.vx, p.vz),
          h: Math.atan2(p.vx, -p.vz), bank: p.bank });
      }
      const base = rec[WINDOW];
      let peak = 0, t45 = -1, bank = 0, path = 0;
      for (let i = WINDOW + 1; i < rec.length; i++) {
        const r = rec[i], q = rec[i - 1];
        if (r.spd > 0.5 && q.spd > 0.5) peak = Math.max(peak, Math.abs(N.angleDelta(q.h, r.h)) * 60);
        if (t45 < 0 && Math.abs(N.angleDelta(base.h, r.h)) > 0.785 && r.spd > 1) t45 = r.t - base.t;
        bank = Math.max(bank, Math.abs(r.bank));
        path += Math.hypot(r.x - q.x, r.z - q.z);
      }
      const chord = Math.hypot(rec[rec.length - 1].x - base.x, rec[rec.length - 1].z - base.z);
      return { peak: +peak.toFixed(2), to45: t45 < 0 ? null : +t45.toFixed(2),
        arc: +path.toFixed(2), chord: +chord.toFixed(2), bank: +bank.toFixed(3),
        limit: p.formDef.turn };
    };
    const frog = run('frogpear', { x: lake.x, z: lake.z, y: lake.top - 1.0 }, 1,
      () => ({ fwd: true, jump: p.y < lake.top - 1.2, sneak: false, sprint: false }), 90);
    const frogStraight = run('frogpear', { x: lake.x, z: lake.z, y: lake.top - 1.0 }, 0,
      () => ({ fwd: true, jump: p.y < lake.top - 1.2, sneak: false, sprint: false }), 90);
    const owl = run('owlberry', { x: sky.x, z: sky.z, y: sky.y }, 1,
      () => ({ fwd: true, jump: true, sneak: false, sprint: false }), 165);
    const owlStraight = run('owlberry', { x: sky.x, z: sky.z, y: sky.y }, 0,
      () => ({ fwd: true, jump: true, sneak: false, sprint: false }), 165);
    Object.assign(p, was);
    return { frog, frogStraight, owl, owlStraight };
  });
  check('a swimming body presses against its own turn limit and no further',
    !carve.error && carve.frog.peak <= carve.frog.limit + 0.15 && carve.frog.peak > carve.frog.limit * 0.9, carve);
  check('a flying body does the same',
    !carve.error && carve.owl.peak <= carve.owl.limit + 0.15 && carve.owl.peak > carve.owl.limit * 0.9, carve);
  check('ninety-four radians a second is gone: a quarter course change takes a third of a second or more',
    !carve.error && carve.frog.to45 !== null && carve.frog.to45 >= 0.3 &&
    carve.owl.to45 !== null && carve.owl.to45 >= 0.3, carve);
  check('the path is an arc, not a polyline: it is longer than the line it spans',
    !carve.error && carve.frog.arc > carve.frog.chord * 1.03 && carve.owl.arc > carve.owl.chord * 1.03, carve);
  check('an aim that does not move is not a turn: the course holds',
    !carve.error && carve.frogStraight.peak < 0.05 && carve.owlStraight.peak < 0.05, carve);
  check('and a body holding its arc rolls into it',
    !carve.error && carve.frog.bank > 0.3 && carve.owl.bank > 0.3, carve);

  /* 11c. A body does not push at full sideways effort over a few degrees of
     error. The correction it aims for is proportional to how far off course it
     is, and only a wide correction is a full-effort one: without that, a mouse
     jitter of 0.3 rad at 3 Hz had the body carving at its limit on every frame
     and rolling with it, which is the single most unpleasant thing in the game
     to fly. */
  const wiggle = await step('wiggleIsNotSwerve', () => {
    const N = window.FRUTARIA, g = window.game, p = g.player;
    const { lake } = window.__mv;
    if (!lake) return { error: 'no open water' };
    const was = { form: p.form, x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, yaw: p.yaw,
      pitch: p.pitch, faceYaw: p.faceYaw, bank: p.bank, tilt: p.tilt, vital: p.vital, air: p.air,
      dry: p.dry, fright: p.fright, grounded: p.grounded };
    p.form = 'frogpear'; p.vital = 10; p.dry = 0; p.air = 999; p.fright = 0;
    p.x = lake.x; p.z = lake.z; p.y = lake.top - 1.0;
    p.vx = p.vy = p.vz = 0; p.bank = 0; p.tilt = 0; p.faceYaw = 0; p.pitch = 0; p.grounded = false;
    let t = 0, bank = 0, swing = 0, minSpd = 99, spd = 0;
    for (let i = 0; i < 105; i++) {
      const dt = 1 / 60; t += dt;
      p.yaw = Math.sin(t * 6.283 * 3) * 0.3;                 // 3 Hz, +-0.3 rad
      g.input = { fwd: true, jump: p.y < lake.top - 1.2, sneak: false, sprint: false };
      g.particles.n = 0; g.hover = null;
      p.update(dt, g.input, g);
      spd = Math.hypot(p.vx, p.vz);
      bank = Math.max(bank, Math.abs(p.bank));
      if (t > 0.7) { minSpd = Math.min(minSpd, spd); if (spd > 2) swing = Math.max(swing, Math.abs(N.angleDelta(0, Math.atan2(p.vx, -p.vz)))); }
    }
    Object.assign(p, was);
    return { swing: +swing.toFixed(3), bank: +bank.toFixed(3), spd: +spd.toFixed(2), minSpd: +minSpd.toFixed(2) };
  });
  check('a wiggled aim is not a swerved body: the course barely moves',
    !wiggle.error && wiggle.swing < 0.15, wiggle);
  check('and the body does not roll with it', !wiggle.error && wiggle.bank < 0.3, wiggle);
  check('it keeps swimming at its cruise while it does so',
    !wiggle.error && wiggle.minSpd > 3, wiggle);

  /* 11d. A body the air or the water is holding up points along the path it is
     taking: a diving frog noses down, a climbing owl noses up, a body on foot
     stays level. Nothing in the game had a pitch angle at all. */
  const attitude = await step('divingBodyNosesDown', () => {
    const N = window.FRUTARIA, g = window.game, p = g.player, W = g.world;
    const { lake, sky } = window.__mv;
    if (!lake || !sky) return { error: 'no open water or open air' };
    const was = { form: p.form, x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, yaw: p.yaw,
      pitch: p.pitch, faceYaw: p.faceYaw, bank: p.bank, tilt: p.tilt, vital: p.vital, air: p.air,
      dry: p.dry, fright: p.fright, grounded: p.grounded };
    const run = (form, at, keys, secs, afterBottom) => {
      p.form = form; p.vital = 10; p.dry = 0; p.fright = 0; p.air = 999;
      p.x = at.x; p.z = at.z; p.y = at.y;
      p.vx = p.vy = p.vz = 0; p.bank = 0; p.tilt = 0; p.faceYaw = 0; p.pitch = 0; p.grounded = false;
      /* the attitude of a body that is *actually* going that way, not of the
         frame the leg happens to end on: the fastest descent and the fastest
         climb the leg reaches, with the body's nose as it showed at that moment.
         Read while the body is travelling and not while it stands: the frame a
         body lands on has already had its nose taken back to level by the ground
         under its feet, and the landing is often the fastest frame of the fall.
         A leg may also run on after the body reaches the bottom -- see below. */
      let down = null, up = null, gr = 0;
      const n = Math.round(secs * 60);
      let end = afterBottom ? 12 * 60 : n, landed = false;
      for (let i = 0; i < end; i++) {
        p.yaw = 0;
        g.input = keys(p); g.particles.n = 0; g.hover = null;
        p.update(1 / 60, g.input, g);
        if (p.grounded) gr++;
        /* A body asked to go down is measured until it has stood on the bottom
           for the leg's own length. The lake is deeper than it was -- 9 m of
           water at the column this reads, 7 before -- and a body sinking at
           2.08 m/s while it swims at 4 reaches the bed when the bed says so, not
           after a fixed time: with the leg ending 2.5 s in, the widened lake put
           the body still coming down at the last frame, standing on the bottom
           in 3% of them. */
        if (afterBottom && !landed && p.grounded) { landed = true; end = i + n; }
        if (p.vy < -0.3 && !p.grounded && (!down || p.vy < down.vy)) {
          down = { vy: +p.vy.toFixed(2), tilt: +(p.tilt || 0).toFixed(3), y: +p.y.toFixed(2) };
        }
        if (p.vy > 0.3 && !p.grounded && (!up || p.vy > up.vy)) {
          up = { vy: +p.vy.toFixed(2), tilt: +(p.tilt || 0).toFixed(3), y: +p.y.toFixed(2) };
        }
      }
      return { tilt: +(p.tilt || 0).toFixed(3), vy: +p.vy.toFixed(2), y: +p.y.toFixed(2),
        g: p.grounded ? 1 : 0, grPct: Math.round(gr / end * 100), frames: end, down, up };
    };
    /* The dive keeps its stroke while it is coming down and gives it up when it
       is on the bottom: the leg is asking the body to go down, and a body on the
       bottom that is still swimming forward walks off the place it reached. */
    const sink = run('frogpear', { x: lake.x, z: lake.z, y: lake.top - 1.5 },
      p => ({ fwd: !p.grounded, jump: false, sneak: true, sprint: false }), 2.5, true);
    const rise = run('frogpear', { x: lake.x, z: lake.z, y: lake.top - 3.0 },
      () => ({ fwd: true, jump: true, sneak: false, sprint: false }), 1.2);
    const climb = run('owlberry', { x: sky.x, z: sky.z, y: sky.y },
      () => ({ fwd: true, jump: true, sneak: false, sprint: false }), 2.0);
    // a dry flat stretch to walk: eight columns ahead, the same height, no water
    const dry = (x, z) => {
      let gy = 0;
      for (let y = 46; y > 0; y--) if (W.solidAt(x, y, z)) { gy = y + 1; break; }
      if (gy < 12) return -1;
      for (let y = gy; y <= gy + 3; y++) if (W.liquidAt(x, y, z)) return -1;
      return gy;
    };
    let field = null;
    for (let x = 55; x < 75 && !field; x++) for (let z = 100; z < 140 && !field; z++) {
      const gy = dry(x, z);
      if (gy < 0) continue;
      let ok = true;
      for (let k = 1; k <= 8 && ok; k++) if (dry(x, z - k) !== gy) ok = false;
      if (ok) field = { x: x + 0.5, z: z + 0.5, y: gy + 0.01 };
    }
    const walk = field ? run(null, field, () => ({ fwd: true, jump: false, sneak: false, sprint: false }), 2.0)
                       : { error: 'no dry flat stretch' };
    /* the same stretch wearing a body built for the air: an owl standing on the
       ground, and an owl walking over it. The attitude used to be worked out
       after the frame had already taken its gravity step, so a standing owl read
       one frame of falling that the ground then undid as a dive: it held 0.6 rad
       of nose-down for as long as it stood, and its legs reached 8 cm through
       the floor it was standing on -- in 344 of the 360 frames it walked. */
    const noKeys = () => ({ fwd: false, jump: false, sneak: false, sprint: false });
    const perch = field ? run('owlberry', field, noKeys, 2.0) : { error: 'no dry flat stretch' };
    const onfoot = field ? run('owlberry', field, () => ({ fwd: true, jump: false, sneak: false, sprint: false }), 0.6)
                         : { error: 'no dry flat stretch' };
    Object.assign(p, was);

    // and the draw reads it: one body, level and tilted, two frames
    const owl = g.creatures.find(c => c.sp.id === 'owl');
    if (!owl) return { sink, rise, climb, walk, error: 'no owl in the roster' };
    const t0 = g.time;
    g.time = 420 * 21 / 24; g.updateEnv();
    const gl = g.R.gl, w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const D = 6.0, UP = 3.2;
    p.x = 136.5; p.z = 128.5; p.y = 22; p.yaw = -Math.PI / 2; p.pitch = Math.atan2(UP, D);
    g.update(0.05);
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const grab = tilt => {
      owl.x = p.x + fx * D; owl.z = p.z + fz * D; owl.y = p.y + UP;
      owl.yaw = p.yaw; owl.state = 'wander'; owl.sleeping = false; owl.flyY = owl.y;
      owl.airAmt = 1; owl.bank = 0; owl.tilt = tilt;
      const cf = g.shootCamera(p); g._camFrame = cf;
      g.render();
      const b = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return b;
    };
    const level = grab(0), nosed = grab(0.42);
    let diff = 0;
    for (let i = 0; i < level.length; i += 4) {
      // "changed at all", not "changed by a lot": at night the whole frame lives
      // between 0 and 60, so a 24-level test on a body against a night
      // background measures the contrast between them, not whether the tilt
      // reached the frame. Two grabs of the same pose differ by 0, so a low
      // threshold costs nothing.
      if (Math.abs(level[i] - nosed[i]) + Math.abs(level[i + 1] - nosed[i + 1]) + Math.abs(level[i + 2] - nosed[i + 2]) > 8) diff++;
    }
    g.time = t0; g.updateEnv();
    Object.assign(p, was);
    return { sink, rise, climb, walk, perch, onfoot, diff };
  });
  check('a body sinking through water noses down the way it is going',
    !attitude.error && !!attitude.sink.down && attitude.sink.down.tilt > 0.2 && attitude.sink.down.vy < -1, attitude);
  /* The dive still reaches the bottom: the water holding a body up is not a lid
     on going down. It used to reach it by falling out of the water branch onto
     the bottom and hopping along it, so the frame the leg ended on was mid-hop
     with the body already coming down -- the nose it showed was the hop's, not
     the dive's. Now the body stays in the water the whole way, stands on the
     bottom while the key is held, and the nose is read off the sinking itself. */
  check('and a body asked to go down still gets to the lakebed and stands on it while asked',
    !attitude.error && attitude.sink.g === 1 && attitude.sink.grPct > 40, attitude);
  check('a body climbing through water noses up',
    !attitude.error && !!attitude.rise.up && attitude.rise.up.tilt < -0.1 && attitude.rise.up.vy > 1, attitude);
  check('a body climbing through the air noses up too',
    !attitude.error && attitude.climb.tilt < -0.1 && attitude.climb.vy > 0, attitude);
  check('a body on foot stays level: feet hold a body level',
    !attitude.error && attitude.walk.g === 1 && Math.abs(attitude.walk.tilt) < 0.02, attitude);
  check('a body built for the air is on foot the moment its feet are on the ground',
    !attitude.error && attitude.perch.grPct > 90 && attitude.onfoot.grPct > 90 &&
    Math.abs(attitude.perch.tilt) < 0.05 && Math.abs(attitude.onfoot.tilt) < 0.05, attitude);
  check('and the renderer reads the pitch: the same body level and nosed is not the same frame',
    !attitude.error && attitude.diff > 400, attitude);

  /* 11e. Feet on the bottom are feet that can push off it, water around them or
     not. That is the whole of getting out of a lake: the shore of Mirrorlake is
     one block of water deep for 183 columns, so the way out is to swim into the
     shallows, stand up, and go. The water branch used to be picked by `inWater`
     alone, which left a body standing on the lakebed with the water at its chest
     no ground under it and no way to launch. */
  const launch = await step('pushOffTheLakebed', () => {
    const g = window.game, p = g.player;
    const { shelf } = window.__mv;
    if (!shelf) return { error: 'no one-block shore shelf' };
    const was = { form: p.form, x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, yaw: p.yaw,
      pitch: p.pitch, faceYaw: p.faceYaw, bank: p.bank, tilt: p.tilt, vital: p.vital, air: p.air,
      dry: p.dry, fright: p.fright, grounded: p.grounded };
    const out = {};
    for (const form of ['frogpear', null]) {
      p.form = form; p.vital = 10; p.dry = 0; p.fright = 0; p.air = 999;
      p.x = shelf.x; p.z = shelf.z; p.y = shelf.top + 0.0001; p.yaw = Math.PI / 2; p.pitch = 0;
      p.vx = p.vy = p.vz = 0; p.faceYaw = Math.PI / 2; p.bank = 0; p.tilt = 0; p.grounded = false;
      // settle: the feet find the bottom before any key is held
      for (let i = 0; i < 40; i++) { g.input = {}; g.particles.n = 0; g.hover = null; p.update(1 / 60, g.input, g); }
      const settled = { y: +p.y.toFixed(3), g: p.grounded ? 1 : 0, w: p.inWater ? 1 : 0 };
      let maxY = p.y, gotOut = false;
      for (let i = 0; i < 300; i++) {
        g.input = { fwd: true, jump: true, sneak: false, sprint: false };
        g.particles.n = 0; g.hover = null;
        p.update(1 / 60, g.input, g);
        maxY = Math.max(maxY, p.y);
        if (p.x > shelf.x + 1.1 && p.y >= shelf.shore - 0.02) { gotOut = true; break; }
      }
      out[form || 'human'] = { settled, gotOut, maxY: +maxY.toFixed(3), shore: shelf.shore };
    }
    Object.assign(p, was);
    return out;
  });
  check('a body in a one-block shore shelf is standing on the bottom, in water',
    !launch.error && launch.frogpear.settled.g === 1 && launch.frogpear.settled.w === 1, launch);
  check('and it can push off that bottom out onto the dry shore',
    !launch.error && launch.frogpear.gotOut && launch.frogpear.maxY >= launch.frogpear.shore, launch);
  check('the same is true of a human body in the same shelf',
    !launch.error && launch.human.gotOut && launch.human.maxY >= launch.human.shore, launch);

  /* 11f. The beat belongs to what the body asks for. A body with wings that can
     glide, and that is not asking for height, rides them: the stroke eases out
     to a faint one, the wings stay spread, and the heave the stroke gives the
     body goes with the stroke instead of with the clock. */
  const beat = await step('wingsEaseOutInGlide', () => {
    const N = window.FRUTARIA, g = window.game, p = g.player;
    const { sky } = window.__mv;
    if (!sky) return { error: 'no open air' };
    const was = { form: p.form, x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, yaw: p.yaw,
      pitch: p.pitch, faceYaw: p.faceYaw, bank: p.bank, tilt: p.tilt, vital: p.vital, air: p.air,
      dry: p.dry, fright: p.fright, grounded: p.grounded };
    /* The clearing this runs in was scanned for clear air from y 36 to y 52 over
       a 25 m box, so the ground anywhere inside it is at or below 36. A glide of
       0.8 s falls 6.5 m and travels 5.6 m, so from y 44 the body is still in the
       clear band at the end of it and never reaches a surface: the reading is
       the beat easing out, not the body having landed. From 46 -- where the step
       used to start it -- the owl touched down at frame 67 of the 72 it is
       sampled at, and the height it was reported at was whatever phase of the
       standing sawtooth it happened to be in. */
    const AIR = 44, LEG = 0.8;
    const glide = (keys, secs) => {
      p.form = 'owlberry'; p.vital = 10; p.dry = 0; p.fright = 0; p.air = 999;
      p.x = sky.x; p.z = sky.z; p.y = AIR;
      p.vx = p.vy = p.vz = 0; p.bank = 0; p.tilt = 0; p.faceYaw = 0; p.pitch = 0; p.grounded = false;
      for (let i = 0; i < Math.round(secs * 60); i++) {
        p.yaw = 0;
        g.input = keys(); g.particles.n = 0; g.hover = null;
        p.update(1 / 60, g.input, g);
      }
      return { flap: +(p.flap === undefined ? 1 : p.flap).toFixed(3), vy: +p.vy.toFixed(2),
        y: +p.y.toFixed(2), landed: p.grounded ? 1 : 0 };
    };
    const down = glide(() => ({ fwd: true, jump: false, sneak: false, sprint: false }), LEG);
    const up = glide(() => ({ fwd: true, jump: true, sneak: false, sprint: false }), LEG);
    Object.assign(p, was);
    // and the stroke the renderer is about to upload goes with it
    const entries = g.ensureModel('owl');
    const stroke = flap => {
      let peak = 0, heave = 0;
      for (let i = 0; i < 60; i++) {
        const st = { t: i / 60, fly: true, air: 1, crouch: 0, phase: 0, move: 1, flap };
        for (const e of entries) {
          const a = N.partAngles(e, st);
          if (e.part.anim === 'flap') peak = Math.max(peak, Math.abs(a.rz));
          if (e.part.anim === 'bob') heave = Math.max(heave, Math.abs(a.dy));
        }
      }
      return { stroke: +peak.toFixed(3), heave: +heave.toFixed(3) };
    };
    return { down, up, full: stroke(1), riding: stroke(0.15) };
  });
  check('a flying body that is not asking for height rides its wings',
    !beat.error && beat.down.flap < 0.3 && beat.down.vy < 0 && !beat.down.landed, beat);
  check('and beats full stroke the moment it climbs for height',
    !beat.error && beat.up.flap > 0.9 && beat.up.vy > 0, beat);
  check('the stroke the renderer uploads goes with the beat, not with the clock',
    !beat.error && beat.riding.heave < beat.full.heave * 0.3 && beat.riding.stroke < beat.full.stroke - 0.1, beat);

  /* 11f2. A body built for the air lies along the way it is going. The owl is
     carved standing, because standing is what it does by day wedged in a hollow,
     and the flight used to draw that same body with wings on it: read off the
     matrices the draw uploads, an owl crossing the valley at 7 m/s held its spine
     73 degrees up from the horizontal, its head 87 degrees above its own body and
     its feet 0.24 m under its centre, and it stood 0.73 m tall against 0.50 m
     long -- a heron, standing on the wind. The posture belongs to the model and
     the path angle to the caller (see models.js, entities.js). */
  const prone = await step('aBirdFliesProne', () => {
    const N = window.FRUTARIA, g = window.game, p = g.player, W = g.world;
    const { sky } = window.__mv;
    if (!sky) return { error: 'no open air' };
    const was = { form: p.form, formT: p.formT, formMax: p.formMax, x: p.x, y: p.y, z: p.z,
      vx: p.vx, vy: p.vy, vz: p.vz, yaw: p.yaw, pitch: p.pitch, faceYaw: p.faceYaw,
      bank: p.bank, tilt: p.tilt, grounded: p.grounded, airAmt: p.airAmt, flap: p.flap,
      vital: p.vital, dry: p.dry, fright: p.fright, air: p.air, input: g.input,
      mode: g.mode, tp: g.thirdPerson, time: g.time, frame: g._camFrame };
    const back = () => {
      Object.assign(p, was);
      g.mode = was.mode; g.thirdPerson = was.tp; g.time = was.time;
      g.input = was.input; g._camFrame = was.frame;
    };
    /* the matrices the draw really uploaded, not a copy of them worked out
       afterwards: `partMatrix` hands the renderer the world matrix of every part,
       so this is the frame itself. The body being worn is told from the animals
       drawn with the same meshes by the origin the draw hung it on -- the draw
       puts the player's own position in the base matrix before it turns or
       scales it, and the matrices it hands over are already in metres. */
    const read = () => {
      const seen = new Map();
      const pm = N.partMatrix;
      N.partMatrix = function (out, base, e, st, ps) {
        const m = pm.apply(this, arguments);
        if (Math.abs(base[12] - p.x) < 1e-3 && Math.abs(base[13] - p.y) < 1e-3 &&
            Math.abs(base[14] - p.z) < 1e-3 && !seen.has(e.part.name))
          seen.set(e.part.name, { m: m.slice(), e });
        return m;
      };
      const d = 5.0, th = -Math.PI / 2;
      g._camFrame = { x: p.x - d * Math.sin(th), y: p.y + 0.2, z: p.z + d * Math.cos(th),
        yaw: th, pitch: 0, fov: 20, d, inBody: false };
      g.updateEnv(); g.render(); g._camFrame = null;
      N.partMatrix = pm;
      const box = (m, e) => {
        let n = 0, x = 0, y = 0, z = 0, lo = 1e9, hi = -1e9, ylo = 1e9, yhi = -1e9;
        for (const b of e.part.boxes)
          for (const fx of [b[0], b[0] + b[3]])
            for (const fy of [b[1], b[1] + b[4]])
              for (const fz of [b[2], b[2] + b[5]]) {
                x += m[0] * fx + m[4] * fy + m[8] * fz + m[12];
                y += m[1] * fx + m[5] * fy + m[9] * fz + m[13];
                z += m[2] * fx + m[6] * fy + m[10] * fz + m[14];
                const wy = m[1] * fx + m[5] * fy + m[9] * fz + m[13];
                const wz = m[2] * fx + m[6] * fy + m[10] * fz + m[14];
                n++;
                if (wz < lo) lo = wz; if (wz > hi) hi = wz;
                if (wy < ylo) ylo = wy; if (wy > yhi) yhi = wy;
              }
        return { x: x / n, y: y / n, z: z / n, lo, hi, ylo, yhi,
          up: [m[4], m[5], m[6]],
          // the way the tail's fan points away from the hinge it hangs on
          out: [-(m[4] + m[8]), -(m[5] + m[9]), -(m[6] + m[10])] };
      };
      const w = {};
      for (const [name, s] of seen) w[name] = box(s.m, s.e);
      // fore along the heading, measured from the body's own feet: at yaw 0 a
      // body faces -z, so fore is -z
      const sy = Math.sin(p.faceYaw), cy = Math.cos(p.faceYaw);
      const fore = v => (v.x - p.x) * sy - (v.z - p.z) * cy;
      const up = v => v.y, deg = v => Math.atan2(v[1], Math.hypot(v[0], v[2])) * 57.2958;
      let ylo = 1e9, yhi = -1e9, flo = 1e9, fhi = -1e9;
      for (const k in w) {
        ylo = Math.min(ylo, w[k].ylo); yhi = Math.max(yhi, w[k].yhi);
        flo = Math.min(flo, w[k].lo); fhi = Math.max(fhi, w[k].hi);
      }
      return {
        spine: +deg(w.body.up).toFixed(1),
        fan: +deg(w.tail.out).toFixed(1),
        headFore: +fore(w.head).toFixed(2), bodyFore: +fore(w.body).toFixed(2),
        legFore: +fore(w.legL).toFixed(2), legUp: +(up(w.legL) - up(w.body)).toFixed(2),
        tall: +(yhi - ylo).toFixed(2), long: +(fhi - flo).toFixed(2),
        air: +(p.airAmt || 0).toFixed(2), tilt: +(p.tilt || 0).toFixed(2),
        vy: +p.vy.toFixed(2), y: +p.y.toFixed(1)
      };
    };
    const go = () => ({ fwd: true, jump: false, sneak: false, sprint: false });
    const still = () => ({ fwd: false, jump: false, sneak: false, sprint: false });
    g.mode = 'play'; g.thirdPerson = true;
    const start = (form, air) => {
      p.form = form; p.formT = 9999; p.formMax = 9999;
      p.vital = 10; p.dry = 0; p.fright = 0; p.air = 999;
      p.x = sky.x; p.z = sky.z;
      p.y = air ? sky.y : N.groundY(W, Math.floor(sky.x), Math.floor(sky.z), 50);
      p.vx = p.vy = p.vz = 0; p.bank = 0; p.tilt = 0; p.faceYaw = 0; p.pitch = 0;
      p.grounded = !air; p.airAmt = 0; p.flap = air ? 1 : 0;
    };
    /* the crossing: a body held in the air by the same keys the player holds.
       The frame is taken twice -- once six frames off the ground, where the
       posture is still arriving, and once with the body going level, because
       the posture is what is being asked about and the path angle the caller
       adds on top of it is already tested by `divingBodyNosesDown`. The sky
       clearing is clear from y 36 to y 52, and a glide of 0.8 s falls 6.5 m,
       so from the top of it the body is still in the air at the end. */
    const cross = frames => {
      start('owlberry', true);
      let lift = null;
      for (let i = 0; i < frames; i++) {
        p.yaw = 0; g.input = go(); g.particles.n = 0; g.hover = null;
        p.update(1 / 60, g.input, g);
        if (i === 5) lift = read();
      }
      const fell = p.grounded ? 1 : 0;
      p.grounded = false; p.tilt = 0; p.bank = 0; p.vy = 0;
      return { lift, fell, fly: read() };
    };
    const crossed = cross(48);
    /* the same body with its feet on the ground: it keeps the posture it was
       carved in, because the pose is asked for by the air under it and not by
       the shape of it */
    start('owlberry', false);
    for (let i = 0; i < 90; i++) {
      p.yaw = 0; g.input = still(); g.particles.n = 0; g.hover = null;
      p.update(1 / 60, g.input, g);
    }
    const perch = read();
    back();
    return { fly: crossed.fly, lift: crossed.lift, fell: crossed.fell, perch };
  });
  /* The spine is the body's own up, so 90 is a body standing and 0 is a body
     lying along the horizontal. The fan is the direction the tail points away
     from the hinge it hangs on: 0 is a tail in line with the body it streams
     out of, and the posture the model used to have held it 27 degrees up. */
  check('a bird in the air lies along the way it is going',
    !prone.error && !prone.fell && prone.fly.spine < 30 && prone.fly.long > prone.fly.tall, prone);
  check('its head is in front of its body and its legs are folded behind it',
    !prone.error && prone.fly.headFore > prone.fly.bodyFore + 0.15 &&
    prone.fly.legFore < prone.fly.bodyFore - 0.15, prone);
  check('and its tail streams out behind it instead of up over its back',
    !prone.error && Math.abs(prone.fly.fan) < 15, prone);
  check('a bird with its feet on the ground keeps the posture it was carved in',
    !prone.error && prone.perch.spine > 85 && prone.perch.tall > prone.perch.long &&
    Math.abs(prone.perch.legFore - prone.perch.bodyFore) < 0.1, prone);
  check('and it lies down over the frames it is taking off, not in the one the flag changes',
    !prone.error && prone.lift.air < 0.7 && prone.lift.air > 0.05 &&
    prone.lift.spine > prone.fly.spine + 15 && prone.fly.air > 0.95, prone);

  /* 11g. The animals the game drives are the same kind of body. What it replaced
     was an ease toward the target bearing at 4 a second: an owl started a turn
     at 6.3 rad/s -- a full revolution a second -- and came about 90 degrees in
     1.03 s, and a frog in the water did it in 0.57 s. */
  const animals = await step('animalsCarveToo', () => {
    const N = window.FRUTARIA, g = window.game, p = g.player;
    const { lake } = window.__mv;
    const was = { x: p.x, y: p.y, z: p.z, form: p.form };
    p.form = null; p.x = 12; p.z = 148; p.y = 30;      // nowhere near any of them
    const turnOf = c => {
      /* The turn is what this measures, so the body goes back afterwards exactly
         as it was found: an animal left standing at a place the step in front
         sent it to, with sixteen minutes still to wait before its next errand,
         is an animal the steps behind this one read as a bird that does not fly. */
      const body = { x: c.x, y: c.y, z: c.z, yaw: c.yaw, bank: c.bank, tilt: c.tilt, vy: c.vy,
        state: c.state, pause: c.pause, tx: c.tx, tz: c.tz, homeX: c.homeX, homeZ: c.homeZ,
        flyY: c.flyY, speed: c.speed, t: c.t, held: c.held, climbTo: c.climbTo, climbRate: c.climbRate };
      c.state = 'wander'; c.sleeping = false; c.pause = 999;   // hold the target
      for (let i = 0; i < 60; i++) c.update(1 / 60, p, g.world, g);
      c.yaw = 0; c.bank = 0; c.tilt = 0;             // settled, and now facing north
      c.tx = c.x + 40; c.tz = c.z;                     // due east: a quarter turn
      let peak = 0, reach = -1, tt = 0;
      for (let i = 0; i < 180; i++) {
        const dt = 1 / 60; tt += dt;
        const before = c.yaw;
        c.update(dt, p, g.world, g);
        peak = Math.max(peak, Math.abs(N.angleDelta(before, c.yaw)) / dt);
        if (reach < 0 && Math.abs(N.angleDelta(0, c.yaw)) > 1.5708) reach = tt;
      }
      const r = { peak: +peak.toFixed(2), limit: c.sp.turn || 0,
        to90: reach < 0 ? null : +reach.toFixed(2), spd: +c.speed.toFixed(2) };
      Object.assign(c, body);
      return r;
    };
    const out = {};
    const owl = g.creatures.find(c => c.sp.id === 'owl');
    const jelly = g.creatures.find(c => c.isAquatic());
    const bear = g.creatures.find(c => c.sp.id === 'bear');
    const frog = g.creatures.find(c => c.isAmphibian());
    const t0 = g.time;
    g.time = 420 * 21 / 24; g.updateEnv();
    if (owl) out.owl = turnOf(owl);
    if (jelly) out.jelly = turnOf(jelly);
    if (bear) out.bear = turnOf(bear);
    g.time = 420 * 9 / 24; g.updateEnv();
    if (frog && lake) {
      frog.x = lake.x; frog.z = lake.z; frog.y = lake.top - 0.6;
      frog.homeX = frog.x; frog.homeZ = frog.z;
      out.frog = turnOf(frog);
    }
    g.time = t0; g.updateEnv();
    Object.assign(p, was);
    return out;
  });
  for (const who of ['owl', 'jelly', 'bear', 'frog']) {
    check(`the wild ${who} turns at its own rate and no faster`,
      !!animals[who] && animals[who].peak <= animals[who].limit + 0.15 && animals[who].peak > 0.3, animals);
  }
  /* Ninety degrees at the rate the data gives an owl -- 1.4 rad/s -- is 1.12 s,
     and that is the floor this can measure: anything under it is a bird turning
     faster than its own record allows. The ease this replaced came about in
     1.03 s at 6.3 rad/s, which the peak check above catches outright; this one
     is the same fact read as what the eye sees. */
  check('an owl crossing the valley takes more than a second to come about ninety degrees',
    !!animals.owl && animals.owl.to90 !== null && animals.owl.to90 >= 1.05, animals);

  /* 11h. And an animal spends its afternoon walking. This is the one claim about
     the animals that is not about a single manoeuvre: put every animal in the
     valley through ninety seconds of its own wandering and count the frames it
     is actually moving. What it caught: the two bears of the northern ridge
     moved in 20% of those frames and covered 24 m between them, because in
     front of a cliff the old behaviour was to give up, drop a new errand and
     walk into the same rock again (a closer look at the same two bears had the
     step in front of them rejected 2024 times in 2400 frames). Going round the
     obstacle took them to 94% of the frames and 51 m, and the frogs, which meet
     the same walls all along the lakeshore, from 76% to 93%. */
  const roaming = await step('animalsWalkTheirAfternoon', () => {
    const g = window.game, p = g.player;
    const was = { x: p.x, y: p.y, z: p.z, form: p.form, time: g.time, night: g.night };
    p.form = null; p.vx = p.vy = p.vz = 0;
    const out = {}, prev = new Map(), body = new Map();
    for (const c of g.creatures) { out[c.sp.id] = { n: 0, moving: 0, path: 0 }; prev.set(c, { x: c.x, z: c.z });
      /* The pooled number per species is the bound; the per-body read is what
         a red of it needs. The law first went red on run four of the watch
         that followed the dust fix: **57** of the frames for **99 m**, where
         the forty-eight runs before it on the same trees read **86-99** and
         thirty-six fresh pages of this same rig read **75-94**, the six of
         them with both bears stood at the centre of their home discs -- the
         start that maximises the short errands the stand runs come from --
         reading **75-93**. The pooled number alone cannot say which of the two
         bears a red belongs to: one bear standing a fourth of its afternoon
         at the errands it reaches and one walking at the usual rate pools to
         the same number as two bears each standing a fifth. A bear that stands
         at the errand it has reached is spending the pause that re-picks the
         next one, which is what a bear does between walks; a bear that stands
         somewhere it is not going is not. The distance from the home the
         disc of errands is picked from is the same question for both: far
         from it the errands are long and the walk does not stop, and a stand
         run that ends away from its errand is the one that asks what held
         the body. */
      if (c.sp.id === 'bear') body.set(c, { dHome: +Math.hypot(c.x - c.homeX, c.z - c.homeZ).toFixed(1),
        n: 0, moving: 0, path: 0, inStand: 0, runs: 0, max: 0, total: 0, atErrand: 0 }); }
    const t0 = g.time;
    g.time = 420 * 21 / 24; g.updateEnv();          // night: every one of them is out
    for (let i = 0; i < 1800; i++) {
      g.herdCentres = {};
      for (const c of g.creatures) {
        const h = g.herdCentres[c.sp.id] || (g.herdCentres[c.sp.id] = { x: 0, z: 0, n: 0 });
        h.x += c.x; h.z += c.z; h.n++;
      }
      for (const id in g.herdCentres) { const h = g.herdCentres[id]; h.x /= h.n; h.z /= h.n; }
      for (const c of g.creatures) {
        const pv = prev.get(c);
        c.update(0.05, p, g.world, g);
        const s = out[c.sp.id];
        s.n++;
        if (c.speed > 0.1) s.moving++;
        const dstep = Math.hypot(c.x - pv.x, c.z - pv.z);
        s.path += dstep;
        const b = body.get(c);
        if (b) {
          b.n++;
          if (c.speed > 0.1) {
            b.moving++;
            if (b.inStand) {
              b.runs++; b.max = Math.max(b.max, b.inStand); b.total += b.inStand;
              /* 0.8 is the arrival radius of the walk the body is on (`d > 0.8`
                 in Creature.update, line 1398): a body standing at the errand
                 it reached stands at most 0.8 m off it, and the errand is not
                 retired until the pause re-picks, so the stand ends with the
                 errand still 0.8 m out. Farther than that and the stand is
                 somewhere the body is not going. */
              if (Math.hypot(c.tx - c.x, c.tz - c.z) <= 0.8) b.atErrand++;
              b.inStand = 0;
            }
          } else b.inStand++;
          b.path += dstep;
        }
        pv.x = c.x; pv.z = c.z;
      }
    }
    g.time = t0; g.updateEnv();
    Object.assign(p, was);
    const res = {};
    for (const id in out) {
      const s = out[id];
      res[id] = { movingPct: Math.round(100 * s.moving / s.n), metres: Math.round(s.path / (s.n / 1800)) };
    }
    const bodies = {};
    for (const [c, b] of body) {
      if (b.inStand) { b.runs++; b.max = Math.max(b.max, b.inStand); b.total += b.inStand; }
      bodies[Object.keys(bodies).length] = { dHome: b.dHome,
        movingPct: Math.round(100 * b.moving / b.n), metres: Math.round(b.path),
        standRuns: b.runs, standMax: b.max, standTotal: b.total, atErrand: b.atErrand };
    }
    res.bodies = bodies;
    return res;
  });
  /* The bound is deliberately nowhere near the measurement: what it must never
     come back with is the old one-in-five. */
  for (const who of ['owl', 'frog', 'bear']) {
    check(`the wild ${who} spends its afternoon walking rather than standing still`,
      !!roaming[who] && roaming[who].movingPct > 60, roaming);
  }
  check('and the lamp field keeps drifting round the lake',
    !!roaming.jelly && roaming.jelly.movingPct > 50, roaming);

  /* 11i. And an animal sent to a place gets there. A body that can only bend
     its course at a fixed rate holds a turn arc as wide as its speed over that
     rate: a lamp jellyfish drifting at 0.92 m/s with a course it can bend 0.8
     rad/s a second is swinging an arc 1.15 m across, so a target nearer than
     that is a place it circles for the rest of the afternoon. The animal slows
     for the turn, and the speed to slow to is the one whose arc passes through
     the place: the way to it is a chord of the circle the animal is describing,
     so the radius is half the distance over the sine of the course error, and
     the speed is the turn rate times that. Without the slowing an animal walks
     circles round its own errands; with the naive bound, without the half, it
     circles them at exactly its arc width and never closes. */
  const arrive = await step('animalsArriveWhereTheyAreSent', () => {
    const N = window.FRUTARIA, g = window.game, p = g.player, W = g.world;
    const { lake, sky } = window.__mv;
    const groundY = N.groundY;
    const was = { x: p.x, y: p.y, z: p.z, form: p.form };
    // park the body high above everything: an animal that has taken a notion to
    // run from it, or come at it, is not going where the test sent it
    p.form = null; p.x = 80; p.z = 80; p.y = 78;
    const wet = (x, z) => {
      let top = -1;
      for (let y = W.h - 1; y >= 0 && top < 0; y--) if (W.liquidAt(x, y, z)) top = y;
      // the same test the spawn code makes: two blocks of water, so there is
      // somewhere for an animal that cannot leave it to hover
      return top >= 0 && top + 1 - groundY(W, x, z, top + 2) >= 2;
    };
    /* Where each animal starts and where it is sent: the open water and the open
       air the movement steps found, five metres apart. The valley is full of
       things in the way, and an animal pressed nose-first against one of them
       says nothing about its own steering -- this is a claim about how an animal
       comes to a place, so it is measured where nothing is in the way. The lake
       spot is standing water six metres in every direction and the air spot is
       empty for twelve metres in every direction, so the straight line between
       the two points is a road each of these bodies can take, and the road is
       checked before it is walked. */
    const place = (c) => {
      if (c.isFlyer()) {
        if (!sky) return null;
        return { from: { x: sky.x, y: sky.y, z: sky.z }, to: { x: sky.x + 5, y: sky.y, z: sky.z } };
      }
      if (!lake) return null;
      const y = lake.top - 0.6;                      // floating just under the surface
      return { from: { x: lake.x, y, z: lake.z }, to: { x: lake.x + 5, y, z: lake.z } };
    };
    const road = (c, at) => {
      for (let k = 0; k <= 20; k++) {
        const x = at.from.x + (at.to.x - at.from.x) * k / 20;
        const z = at.from.z + (at.to.z - at.from.z) * k / 20;
        if (c.isFlyer()) { if (W.solidAt(Math.floor(x), Math.floor(at.from.y), Math.floor(z))) return false; }
        else if (!wet(x, z)) return false;
      }
      return true;
    };
    const sent = (c, secs) => {
      const at = place(c);
      if (!at) return { error: 'no open ground to send the ' + c.sp.id + ' across' };
      if (!road(c, at)) return { error: 'the way is not clear for the ' + c.sp.id };
      const keep = { x: c.x, y: c.y, z: c.z, yaw: c.yaw, state: c.state, pause: c.pause,
        tx: c.tx, tz: c.tz, homeX: c.homeX, homeZ: c.homeZ, flyY: c.flyY, speed: c.speed };
      const herdWas = g.herdCentres && g.herdCentres[c.sp.id];
      if (g.herdCentres) g.herdCentres[c.sp.id] = { x: at.from.x, z: at.from.z, n: 1 };   // no herd to walk back to
      c.x = at.from.x; c.y = at.from.y; c.z = at.from.z;
      c.homeX = c.x; c.homeZ = c.z;                  // and no home to go back to either
      if (c.isFlyer()) c.flyY = c.y;
      c.state = 'wander'; c.sleeping = false; c.pause = 9999;
      c.tx = at.to.x; c.tz = at.to.z;
      const n = Math.round(secs / 0.05);
      let min = 1e9, max = 0, path = 0, px = c.x, pz = c.z, states = {}, top = 0;
      for (let i = 0; i < n; i++) {
        c.tx = at.to.x; c.tz = at.to.z;              // the wander code may move it
        c.update(0.05, p, g.world, g);
        states[c.state] = (states[c.state] || 0) + 1;
        path += Math.hypot(c.x - px, c.z - pz); px = c.x; pz = c.z;
        top = Math.max(top, c.speed);
        if (i > n / 2) { const d = Math.hypot(at.to.x - c.x, at.to.z - c.z); min = Math.min(min, d); max = Math.max(max, d); }
      }
      /* Phase two: the case the animal's own wander retarget produces every few
         seconds -- a new place a step or two off, to one side of the way it is
         facing. The arc an animal holds is its speed over its turn rate: 1.15 m
         for a lamp jellyfish drifting at 0.92 m/s, 2.1 m for an owl at 2.94. A
         place nearer than that, off to the side, is a place it circles for the
         rest of the pause. Measured without the animal slowing for a turn it
         cannot hold, over 25 seconds at a target this far to one side: the
         jellyfish walks 23 m and ends 0.9-1.4 m from a place 0.9 m away, the
         frog walks 48 m for a place 1.2 m away, the owl walks 73 m for one 1.8 m
         away and never comes inside 1.79 m of it. */
      const d = c.sp.id === 'owl' ? 1.8 : (c.isAquatic() ? 0.9 : 1.2);
      c.yaw = 0; c.speed = 0;                        // facing off at right angles to it
      const sx = c.x - d, sz = c.z;                  // and the place is back over open ground
      let smin = 1e9, smax = 0, spath = 0, qpx = c.x, qpz = c.z;
      for (let i = 0; i < 500; i++) {
        c.tx = sx; c.tz = sz;
        c.update(0.05, p, g.world, g);
        spath += Math.hypot(c.x - qpx, c.z - qpz); qpx = c.x; qpz = c.z;
        if (i > 300) { const q = Math.hypot(sx - c.x, sz - c.z); smin = Math.min(smin, q); smax = Math.max(smax, q); }
      }
      if (g.herdCentres) g.herdCentres[c.sp.id] = herdWas;
      Object.assign(c, keep);
      // the width of the widest turn this animal makes at the fastest it went:
      // how far it was travelling, not how it ended up standing still
      return { min: +min.toFixed(2), max: +max.toFixed(2), path: +path.toFixed(1),
        arc: +(top / (c.sp.turn || 1)).toFixed(2), spd: +top.toFixed(2),
        states: Object.keys(states).join('/'),
        side: { min: +smin.toFixed(2), max: +smax.toFixed(2), path: +spath.toFixed(1), at: d } };
    };
    const out = {};
    const t0 = g.time;
    g.time = 420 * 9 / 24; g.updateEnv();
    const frog = g.creatures.find(c => c.isAmphibian());
    const jelly = g.creatures.find(c => c.isAquatic());
    if (frog) out.frog = sent(frog, 24);
    if (jelly) out.jelly = sent(jelly, 24);
    g.time = 420 * 21 / 24; g.updateEnv();
    const owl = g.creatures.find(c => c.sp.id === 'owl');
    if (owl) out.owl = sent(owl, 24);
    g.time = t0; g.updateEnv();
    Object.assign(p, was);
    return out;
  });
  /* An animal sent somewhere arrives there and stands still: the frog closes to
     0.8 m and stops, the jellyfish to 0.8 m, the owl to 0.7 m, each along a path
     of 4-5 m, and the state never leaves 'wander' -- no flight, no sleep, no
     panic taking over the run. `arc` is the width of the widest turn the animal
     makes at the fastest it travelled (1.0 m for the frog, 1.2 for the
     jellyfish, 2.1 for the owl), so arriving inside a metre is not the animal
     failing to move. */
  for (const who of ['frog', 'jelly', 'owl']) {
    check(`the wild ${who} gets to the place it was sent to and stops there`,
      !!arrive[who] && !arrive[who].error && arrive[who].states === 'wander' &&
      arrive[who].min < 0.9 && arrive[who].max < 1.2 && arrive[who].arc > 0.5, arrive);
  }
  /* And it gets there when the place is one it cannot walk into at the speed it
     is travelling: a target a step to one side, inside the width of its own
     turn. The frog stands 0.79 m from a place 1.2 m off having walked 1 m; the
     jellyfish 0.8 m from one 0.9 m off having walked 0.4 m; the owl 0.8 m from
     one 1.8 m off having walked 1.9 m. Before the animal was taught to slow for
     a turn it cannot hold, the same three walked 48 m, 23 m and 73 m round those
     three places and never stopped at any of them -- the owl never came inside
     1.79 m of a place 1.8 m from where it started. */
  for (const who of ['frog', 'jelly', 'owl']) {
    check(`the wild ${who} does not circle a place that is too close for its turn to reach`,
      !!arrive[who] && !arrive[who].error && !!arrive[who].side &&
      arrive[who].side.min < 0.9 && arrive[who].side.max < 1.2 && arrive[who].side.path < 8, arrive);
  }

  /* 10z. a flock is not a formation, and a flight is not a shelf. Twelve frogs
     were put on one lake and every one of them swam 30 cm under the surface, at
     the same instant, for as long as the world ran: the code asked the water
     where its surface was and asked the animal nothing, so twelve bodies made one
     line. Measured over ten minutes of a running world -- 432000 samples -- the
     mean depth was 0.30 m with a standard deviation of 0.03, and at any one
     instant the twelve were 0.00 m apart. The birds did the same trick with the
     sky: each held one absolute height all night, so the owl over the ridge and
     the owl over the lake were the same bird at the same height above the map.
     And a flying body was kept above "the highest solid in this column", which is
     not the question "what is in front of me": read that way, six owls stood
     inside a crown, a hillside or the shaft of the lake tower in 11132 of 216000
     frames, one of them for 1415 frames running, and the test that measured an
     owl crossing the valley had it flying through the tower at that.
     So each animal is now asked three things: how deep does this one go, how high
     does this one hunt, and is the place you are about to put yourself in empty.
     The numbers below are the answer, over forty seconds of the valley running
     with nobody near enough to frighten them. */
  const flock = await step('flockIsNotAFormation', () => {
    const N = window.FRUTARIA, g = window.game, p = g.player, W = g.world;
    const frogs = g.creatures.filter(c => c.sp.id === 'frog');
    const owls = g.creatures.filter(c => c.sp.id === 'owl');
    if (frogs.length < 8 || owls.length < 4) return { error: 'not enough animals to count' };
    const was = { x: p.x, y: p.y, z: p.z, form: p.form, vital: p.vital, time: g.time };
    const keep = [...frogs, ...owls].map(c => ({ c, x: c.x, y: c.y, z: c.z, yaw: c.yaw, vy: c.vy,
      t: c.t, speed: c.speed, held: c.held, state: c.state, pause: c.pause, tx: c.tx, tz: c.tz,
      homeX: c.homeX, homeZ: c.homeZ, flyY: c.flyY, climbTo: c.climbTo, climbRate: c.climbRate }));
    // nobody for them to run from, and a night for the birds to be abroad in
    p.form = null; p.vital = 10; p.x = 4; p.z = 4; p.y = W.h - 2;
    g.time = 420 * 21 / 24; g.updateEnv();
    // and every one of them is off the leash: an animal standing at a place some
    // step in front sent it to, with its next errand still a quarter of an hour
    // away, spends these forty seconds on one spot and is not flocking at all
    for (const c of [...frogs, ...owls]) { c.state = 'wander'; c.sleeping = false; c.pause = Math.random() * 3; }
    const cell = c => [Math.floor(c.x), Math.floor(c.y), Math.floor(c.z)];
    // the surface a body is over: what it would fall to, read from its own feet.
    // Reading it from the top of the map instead would call the crown of a wood
    // the floor of the sky above it, and a bird flying under that crown would be
    // counted as standing on it.
    const over = c => { const [x, , z] = cell(c);
      return Math.max(N.groundY(W, x, z, Math.floor(c.y)), W.liquidSurfaceAt(x, z)); };
    // and the top of everything in the column it is in: a bird at or over that is
    // in open sky, a bird well under it has a ceiling right above its head.
    // Both reads answer a height -- the top face of the highest solid, the film of
    // the water -- and `waterTop` answers the index of a cell, one block under that
    // film, so it is not what this max is for: over the lake it called a point a
    // metre under the water the top of the column, and a bird skimming the film
    // counted as being in open sky a metre early.
    const top = c => { const [x, , z] = cell(c);
      return Math.max(N.groundY(W, x, z, W.h - 1), W.liquidSurfaceAt(x, z)); };
    // a body is not a point: the owl model is 4.7 units tall at a scale of 0.15,
    // so its head reaches 0.7 m over its feet. Does that box overlap a block it
    // cannot pass through? leaves are a ceiling a body flies through, stone is not
    const HEAD = 0.7;
    const hard = (x, y, z) => W.solidAt(x, y, z) && !N.TREE_BLOCK[W.get(x, y, z)];
    const drawn = c => { const [x, y, z] = cell(c);
      for (let k = y; k <= Math.floor(c.y + HEAD); k++) if (hard(x, k, z)) return true;
      return false; };
    const each = new Map();
    // lo/hi: how far this body's height over the surface it crosses swings (a
    // frog: how deep the water takes it). alo/ahi: its absolute height, which is
    // the one the complaint was about -- a bird that holds one absolute height
    // while the ground under it rises and falls is a bird on a wire.
    for (const c of [...frogs, ...owls])
      each.set(c, { lo: 1e9, hi: -1e9, alo: 1e9, ahi: -1e9, hold: 0, holdMax: 0, cr: 0 });
    const yPrev = new Map();
    for (const c of owls) yPrev.set(c, c.y);
    const n = Math.round(40 * 60);
    const spread = [], bands = [], depths = [];
    let sameLine = 0, wet = 0, inside = 0, aboveSum = 0, aboveN = 0;
    let headIn = 0, crown = 0, jam = 0, crownIn = 0, flown = 0;
    const headHits = [], insideHits = [];
    const owlPath = new Map(); for (const c of owls) owlPath.set(c, 0);
    // the entry window the red run was missing. In the one red run the inside
    // counter fired on the sunken tower's south wall column (66,115): a wild
    // frog's feet were in the masonry at y13-14 and the solid-exit correction
    // -- the 0.1 m per frame lift -- carried the body out of the world without
    // ever asking how it got into it. The hits recorded there carried no frame
    // number, no frog identity, and none of the frames before the entry, so the
    // entry itself -- the step that put the feet in the wall -- was invisible.
    // What is recorded here: every frame of every frog within one column of
    // that wall. Each line starts with the frame number and the frog's own
    // numbers and ends with the other bodies close enough that a shove could
    // have reached them. The two flags at the feet are the raw read (any
    // solid, leaves among them) and the hard read (what the inside count
    // above is), so a red line re-reads as the frame the feet first went
    // hard, whatever the bush was doing. The window keeps its head (the cap
    // drops the tail of a long sojourn), so an entry early in a long sojourn
    // is still kept -- and a sojourn long enough to hit the cap is itself a
    // finding. The column dump is static through the run, so it is read once
    // here.
    const towerX = 66, towerZ = 115, winCap = 480;
    const towerWin = new Map();
    const frogIdx = new Map(); frogs.forEach((c, k) => frogIdx.set(c, k));
    const towerCols = {};
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const cx = towerX + dx, cz = towerZ + dz, rows = [];
      for (let y = 0; y <= 20; y++) rows.push(W.get(cx, y, cz) || 0);
      towerCols[cx + ',' + cz] = rows;
    }
    for (let i = 0; i < n; i++) {
      for (const c of frogs) {
        c.update(1 / 60, p, W, g);
        const [cx, cy, cz] = cell(c);
        /* The count is the hard world -- rock, masonry, glass. A leaf at the
           height of the feet is the bush the body is hopping through: the step
           gate, the ceiling, and the bird's own count below all excuse it, and
           the block that got a body into the tower's wall was masonry, not a
           bush. */
        if (hard(cx, cy, cz)) { inside++;
          if (insideHits.length < 6)
            insideHits.push(['frog', i, W.get(cx, cy, cz), cx, cy, cz, +c.y.toFixed(2), c.state, frogIdx.get(c)]);
        }
        if (Math.abs(cx - towerX) <= 1 && Math.abs(cz - towerZ) <= 1) {
          let win = towerWin.get(c);
          if (!win) { win = []; towerWin.set(c, win); }
          if (win.length < winCap) {
            const near = [];
            for (const b of g.creatures) {
              if (b === c || Math.abs(b.y - c.y) > 2.5) continue;
              if (Math.hypot(b.x - c.x, b.z - c.z) <= 2)
                near.push([b.sp.id, +b.x.toFixed(1), +b.y.toFixed(1), +b.z.toFixed(1), +(b.vy || 0).toFixed(2), b.state]);
            }
            win.push([i, +c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2), +(c.vy || 0).toFixed(2),
              +(((c.yaw % 6.283) + 6.283) % 6.283).toFixed(2), c.state, W.solidAt(cx, cy, cz) ? 1 : 0,
              hard(cx, cy, cz) ? 1 : 0, near]);
          }
        }
      }
      const ys = [];
      for (const c of frogs) {
        const [x, , z] = cell(c);
        const wt = N.waterTop(W, x, z, W.h - 1);
        /* the surface of the column as a height, not as the index of the cell
           that holds the top of the water. A body the water is holding up floats
           30 cm under that surface, which is a height above the index of the
           water's own top cell: read the depth off the index and the frogs that
           are doing the ordinary thing -- floating at the surface with their feet
           under them -- look like they have left the water, get dropped from the
           count, and every body left in it is called a block deeper than it is. */
        if (wt < 0 || c.y > wt + 1) continue;
        const d = wt + 1 - c.y;
        ys.push(d);
        depths.push(d);
        const e = each.get(c);
        if (d < e.lo) e.lo = d; if (d > e.hi) e.hi = d;
      }
      if (ys.length >= 6) {
        let lo = 1e9, hi = -1e9;
        for (const v of ys) { if (v < lo) lo = v; if (v > hi) hi = v; }
        spread.push(hi - lo);
        if (hi - lo < 0.2) sameLine++;
        // how many half-metre layers of the lake the flock is spread over at this
        // instant: one means a line, whatever the window around it measures
        const seen = new Set();
        for (const v of ys) seen.add(Math.floor(v / 0.5));
        bands.push(seen.size);
        wet++;
      }
      for (const c of owls) {
        const px = c.x, pz = c.z;
        c.update(1 / 60, p, W, g);
        /* A crown is not the world. A flying body inside a crown is a bird with
           its wings in the leaves, which is the same thing a bear inside a bush
           is; the soak step counts inCrown and inRock apart for that reason and
           this does too. */
        const [fx, fy, fz] = cell(c);
        if (W.liquidAt(fx, fy, fz) || hard(fx, fy, fz)) { inside++;
          if (insideHits.length < 6) insideHits.push(['owl', i, W.get(fx, fy, fz), fx, fy, fz, +c.y.toFixed(2), c.state]); }
        else if (W.solidAt(fx, fy, fz)) crownIn++;
        const ab = c.y - over(c);
        aboveSum += ab; aboveN++;
        const e = each.get(c);
        if (ab < e.lo) e.lo = ab; if (ab > e.hi) e.hi = ab;
        if (c.y < e.alo) e.alo = c.y; if (c.y > e.ahi) e.ahi = c.y;
        if (drawn(c)) { headIn++;
          if (headHits.length < 6) { const [hx, hy, hz] = cell(c);
            for (let k = hy; k <= Math.floor(c.y + HEAD); k++) {
              if (hard(hx, k, hz)) { headHits.push([W.get(hx, k, hz), hx, k, hz, +c.y.toFixed(2)]); break; } } } }
        if (c.y >= top(c)) { crown++; e.cr++; }
        const [ox, oy, oz] = cell(c);
        // wedged: a block the body cannot rise through, directly over its head
        if (hard(ox, oy + 1, oz)) jam++;
        /* how long this bird went without moving its height at all -- and only
           while it is flying. A body standing on a branch holds one height
           because that is what standing is: counting those frames made this
           measure report a bird for sitting still, and it read 10 seconds of
           roosting in one run of the valley and 3 seconds in the next with
           nothing whatever changed about the flight. */
        const e2 = each.get(c);
        const flying = !c.grounded && c.speed > 0.5;
        e2.hold = flying && Math.abs(c.y - yPrev.get(c)) < 0.01 ? e2.hold + 1 : 0;
        if (e2.hold > e2.holdMax) e2.holdMax = e2.hold;
        yPrev.set(c, c.y);
        owlPath.set(c, owlPath.get(c) + Math.hypot(c.x - px, c.z - pz));
        flown++;
      }
    }
    spread.sort((a, b) => a - b);
    bands.sort((a, b) => a - b);
    depths.sort((a, b) => a - b);
    // how deep the flock actually hangs in the water: the middle of the whole
    // window, and the share of the samples that are within a metre of the
    // surface film -- the number the report "the frogs sit too near the top of
    // the water" is about
    let nearFilm = 0;
    for (const d of depths) if (d < 1) nearFilm++;
    const out = { seconds: 40, frogs: frogs.length, owls: owls.length, wetFrames: wet, inside,
      insideHits,
      // the entry window (2c): setup and the line format above the loop --
      // frame, position, vy, yaw, state, the raw and the hard read at the
      // feet, then the bodies a shove could reach; the frogs that came within
      // one column of the wall, and every frame each of them spent there
      towerWindow: { cols: towerCols,
        frogs: frogs.map((c, k) => { const win = towerWin.get(c);
          return win ? { i: k, frames: win.length, lines: win } : null; }).filter(Boolean) },
      depthSamples: depths.length,
      depthMedian: +(depths[depths.length >> 1] || 0).toFixed(2),
      depthLow: +(depths[Math.floor(depths.length * 0.05)] || 0).toFixed(2),
      depthHigh: +(depths[Math.floor(depths.length * 0.95)] || 0).toFixed(2),
      nearFilmPct: Math.round(nearFilm / Math.max(1, depths.length) * 100),
      sameLinePct: Math.round(sameLine / Math.max(1, wet) * 100),
      spreadMedian: +(spread[spread.length >> 1] || 0).toFixed(2),
      spreadMax: +(spread[spread.length - 1] || 0).toFixed(2),
      bandMedian: bands[bands.length >> 1] || 0,
      owlAboveMean: +(aboveSum / Math.max(1, aboveN)).toFixed(2),
      headInPct: +(headIn / Math.max(1, flown) * 100).toFixed(2),
      headHits: headHits,
      crownPct: Math.round(crown / Math.max(1, flown) * 100),
      jamPct: Math.round(jam / Math.max(1, flown) * 100),
      crownIn: Math.round(crownIn / Math.max(1, flown) * 100),
      frogDepth: frogs.map(c => { const e = each.get(c);
        return e.hi < e.lo ? null : +(e.hi - e.lo).toFixed(2); }),
      // what one bird does over the whole window: how much its height over the
      // surface it crosses swings, how much its own height swings, how far it
      // actually goes, and the share of its own frames spent at or over the top
      // of everything in its column -- the window's crown read is one mean over
      // all the birds, so a red of that law now names the bird dragging it down
      owl: owls.map(c => { const e = each.get(c);
        return { range: e.hi < e.lo ? null : +(e.hi - e.lo).toFixed(2),
          absRange: e.ahi < e.alo ? null : +(e.ahi - e.alo).toFixed(2),
          yMean: +((e.ahi + e.alo) / 2).toFixed(1),
          path: +owlPath.get(c).toFixed(1),
          crownPct: Math.round(e.cr / Math.max(1, n) * 100) }; }),
      // the longest a bird of this flock went without moving its height at all
      holdRunMax: +(Math.max(...owls.map(c => each.get(c).holdMax)) / 60).toFixed(1),
      // the birds of one valley do not all fly at one height above the map
      heightSpread: (() => {
        const m = owls.map(c => { const e = each.get(c); return (e.ahi + e.alo) / 2; });
        return +(Math.max(...m) - Math.min(...m)).toFixed(1);
      })(),
      // a bird that went nowhere, or one that travelled a hundred metres at one
      // height above the map: either way it is stuck, not flying
      pinned: owls.filter(c => { const e = each.get(c), d = e.ahi - e.alo, m = owlPath.get(c);
        return (d < 0.3 && m > 10) || m < 1; })
        .map(c => [c.sp.id, +c.x.toFixed(1), +c.y.toFixed(1), +c.z.toFixed(1), c.state]) };
    for (const k of keep) { const { c, ...v } = k; Object.assign(c, v); }
    Object.assign(p, was);
    g.time = was.time; g.updateEnv();
    return out;
  });
  /* Forty seconds of the twelve frogs of Mirrorlake: at no instant are they all
     within 20 cm of one depth (once they were, 96-97% of the time), they are
     spread over 2.3-3.1 m of it from the shallowest to the deepest at any one
     instant (2.9-3.4 m at the widest instant of the window), and they sit in
     four to six half-metre layers of the lake instead of the one layer they
     used to hold. The depth is counted down from the top face
     of the water, which is where the surface of the lake is: counted from the
     index of the cell that holds the top of the water, the frogs floating at the
     surface -- the ordinary thing a frog does -- looked like bodies that had left
     the water and dropped out of the count altogether.
     The birds belong to the sky over the ground under them. No bird's body, from
     its feet to the head 0.7 m above them, ever overlaps a block it cannot pass
     through -- it did in 8.7-14.6% of the frames before the step gate was asked
     about the whole body rather than the cell under its feet -- and not one frame
     of the window puts a body inside the world, which is what the same forty
     seconds measured 11132 times before.
     A crown is not one of the blocks a body cannot pass through: a flying body
     has its wings in the leaves in 0-4% of its frames, the way a bear has its
     shoulders in a bush, and it is over everything in the column it stands in for
     89-99% of them. Read leaves as a roof and a bird under one is in a room with
     no door, refused sideways into them by the step gate and refused up through
     them by the ceiling, and what it is left holding is the height the roof hands
     it: one of six owls flew 114 m at a height that moved 0.55 m in forty seconds
     and the flock had a block over its head in 6-30% of its frames. What the
     flock does now: the six birds of a valley sit 3-12.2 m apart in mean height
     (the spread of ten runs; the errands each bird is walking at the moment the
     window closes move this number more than anything in the flight code does),
     every one of them climbs and descends by 4.3-22.5 m over the window, and the
     longest any of them went without moving its height at all is 2.8-5.2 s.
     The count of a body inside the world is the hard world -- rock, masonry,
     glass: a leaf at the height of the feet is the bush the body is hopping
     through, which is the same excuse the body's own step gate and ceiling
     already give it, and the block that got a body into the tower's wall was
     masonry, not a bush. */
  check('the twelve frogs on one lake do not all swim at one depth',
    !flock.error && flock.sameLinePct < 10, flock);
  check('they are spread over metres of the water, not a hand span of it',
    !flock.error && flock.spreadMedian > 1 && flock.spreadMax > 2, flock);
  check('and at any one instant they are spread over several layers of it',
    !flock.error && flock.bandMedian >= 4, flock);
  /* The depth itself is the animal's own, not the water's: 30 cm under the film
     is where a body that has to come up for air hangs, and a frog's record says
     1.6 m. Before that, over ten minutes of a running world, the twelve spent
     46% of their samples within a metre of the surface film at a mean of 1.47 m
     down -- a sheet of frogs under the skin of the lake, which is the report
     "the frogs sit too near the top of the water". */
  check('and they hang in the body of the lake instead of under its surface film: the middle of the flock is over 1.5 m down and under a tenth of the samples are within a metre of the surface',
    !flock.error && flock.depthMedian > 1.5 && flock.nearFilmPct < 10, flock);
  check('a bird carries its whole body through the air, feet to head',
    !flock.error && flock.headInPct === 0, flock);
  check('it flies above the crowns it crosses, not wedged under them',
    !flock.error && flock.crownPct > 70 && flock.jamPct < 10, flock);
  check('and it is not stuck: it climbs and descends, and it goes somewhere',
    !flock.error && !flock.pinned.length &&
    flock.owl.every(o => o.absRange > 1 && o.path > 10), flock);
  check('and the birds of one valley do not all fly at one height above the map',
    !flock.error && flock.heightSpread > 2, flock);
  check('and no bird of the flock is held at one height for a long stretch',
    !flock.error && flock.holdRunMax < 8, flock);
  check('and none of them spends a frame inside the world',
    !flock.error && flock.inside === 0, flock);

  /* 10z2. The door of the sunken tower is a door. The twelve frogs of
     Mirrorlake walk in and out of the hollow shaft of the tower through the
     holes of frogpear in its south wall -- the holes are not rock, so a frog
     walking deep in its dive steps flat across the face of the wall into one
     of them the way it steps into any doorway -- and then the lift that
     raises a body onto the floor it stands on did its part and no more: it
     asked how high the floor is, never what stands over the head of the body
     being raised. The floor of the doorway is the top of the glass a metre
     over it, so the lift raised the feet into the glass in the first frame,
     and the correction that puts a body out of the rock it is in took over
     at 0.1 m a frame and walked the frog up the face of the wall to the roof
     at 16.7 m. The red run of the soak measured exactly that: fourteen frames
     inside the world, the first at 13.1 m, drifting 0.1 m a frame, on the
     south wall column of the tower. The lift now asks the ceiling of the
     body's own column -- the same question the hop gate already asks,
     material table, leaves excused -- and caps the height it raises the feet
     onto at that ceiling minus the body's height: in the doorway that is the
     underside of the glass, so a frog that steps in lands under it and walks
     on into the pool, and the door still opens. This is the doorway itself,
     asked directly instead of over forty seconds of a valley: a frog of the
     flock is pinned in the doorway cell, feet at the bottom of its dive, for
     five seconds, and only its height is under test. Before the cap it rode
     the lift out of the wall -- fourteen frames inside the hard world, the
     highest its feet reached 16.7 m; with the cap its feet never leave the
     hard world at all, and the highest they ever get is the underside of the
     glass, 12.5 m. */
  const door = await step('theFrogPinnedInTheTowerDoorStaysOutOfTheWall', () => {
    const N = window.FRUTARIA, g = window.game, p = g.player, W = g.world;
    const frog = g.creatures.find(c => c.sp.id === 'frog');
    if (!frog) return { error: 'no frog in the valley' };
    const hard = (x, y, z) => W.solidAt(x, y, z) && !N.TREE_BLOCK[W.get(x, y, z)];
    // the doorway cell of the tower's south wall: frogpear, not rock, with the
    // glass of the wall one block over it. It is where the red run of the soak
    // found the flock's frog, so the door under test is the same door, not one
    // searched for
    const dx = 66, dz = 115, dy = 12;
    if (!W.solidAt(dx, dy + 1, dz) || N.TREE_BLOCK[W.get(dx, dy + 1, dz)])
      return { error: 'the doorway has no masonry ceiling one block over it; the world moved' };
    // the ceiling the lift itself works with: the first hard cell of the body's
    // own column, minus the body's height and the hand's width the bird's
    // ceiling keeps, the way the lift computes it. The guard above put the
    // glass of the wall at dy + 1, which is the first hard cell of every frame
    // of the test, since the feet stay in the doorway cell
    const cap = (dy + 1) - frog.tall - 0.05;
    const body = { x: frog.x, y: frog.y, z: frog.z, yaw: frog.yaw, vy: frog.vy, state: frog.state,
      pause: frog.pause, tx: frog.tx, tz: frog.tz, homeX: frog.homeX, homeZ: frog.homeZ,
      speed: frog.speed, t: frog.t, hopT: frog.hopT, wind: frog.wind, sleeping: frog.sleeping,
      climbTo: frog.climbTo, climbRate: frog.climbRate };
    const was = { x: p.x, y: p.y, z: p.z, form: p.form };
    p.form = null; p.x = 4; p.z = 4; p.y = W.h - 2;      // nobody to run from
    // awake and wandering: a sleeping body would skip the height code and the
    // test would pass on the sleep, not on the ceiling
    frog.state = 'wander'; frog.sleeping = false;
    // pinned in the doorway at the bottom of the dive: every frame the body is
    // put back over the same cell before it moves, so only the height is under
    // test; the first frame starts the feet a hand under the glass
    let inside = 0, maxY = -1;
    for (let i = 0; i < 300; i++) {
      if (i === 0) { frog.y = dy + 0.45; frog.vy = 0; }
      frog.x = dx + 0.5; frog.z = dz + 0.5;
      frog.update(1 / 60, p, W, g);
      const fx = Math.floor(frog.x), fy = Math.floor(frog.y), fz = Math.floor(frog.z);
      if (hard(fx, fy, fz)) inside++;
      if (frog.y > maxY) maxY = frog.y;
    }
    const out = { door: [dx, dy, dz], doorBlock: W.get(dx, dy, dz), cap: +cap.toFixed(2),
      inside, maxY: +maxY.toFixed(2), yEnd: +frog.y.toFixed(2) };
    Object.assign(frog, body);
    Object.assign(p, was);
    return out;
  });
  check('a frog pinned in the doorway of the tower does not ride the lift out of the wall',
    !door.error && door.inside === 0 && door.maxY <= door.cap + 0.1, door);

  /* 10z3. The same ceiling asked with the step gate's table, not the hop
     gate's. The hollow the world carves does not sever a trunk rooted on the
     ground it cuts through -- a severed trunk would leave its crown hanging --
     but one line of four trunks in the valley's meadow was planted a round
     before the hollow ran under it, and the cut took their base cell: the
     trunks of that line stand one cell above the grass, with open air where
     their roots were, and the grass of the meadow is a metre below the step
     that runs along their north face. The step gate reads a step the way it
     reads every step: rock over its top is a wall, wood over its top is the
     tree the walker goes under, so the frog that walks the meadow under that
     line and wants the step is owed it -- the gate lets the climb, and the
     lift is to carry the feet onto the top of it. Asked the hop gate's way,
     the ceiling the lift now asks is the material table with only the leaves
     excused, and the severed trunk over the step top reads as the roof: the
     lift carried the frog four-fifths of the way onto the step and stopped,
     and there it stood -- measured, 584 of its 600 frames at 0.48 m under the
     top it was owed, 0.6 m of path in the whole of them, not a hop (the hop
     gate, rightly, still counts the trunk as the roof over the arc), not a
     step (the step cell is the step's own rock). Asked the step gate's way --
     all wood excused, the way the gate that set the lift asks -- the trunk is
     the tree the walker goes under and the lift carries the feet onto the
     top: the frog is over the edge by the fiftieth frame, its feet through
     the severed cell for the one frame the crossing takes, which the
     correction at the end of the frame leaves alone as all wood. This is the
     step itself, asked directly: a frog of the flock on the meadow grass
     under the line, aimed at the step for five seconds, its errand held
     where it is and the middle of the flock emptied for the watch, so the
     walk measured is the walk to the step and not the walk back to the
     lake. Before the table was the gate's it never crossed; after, it is
     over the edge well inside the watch, and the only height it is held at
     is the top of the step it came to climb. The tower's door is glass, and
     glass is rock, so this change does not reach it -- the law beside pins
     that one, and it still pins it. */
  const floatStep = await step('theFrogClimbsTheStepBeneathTheFloatingTrunk', () => {
    const N = window.FRUTARIA, g = window.game, p = g.player, W = g.world;
    const frog = g.creatures.find(c => c.sp.id === 'frog');
    if (!frog) return { error: 'no frog in the valley' };
    const hard = (x, y, z) => W.solidAt(x, y, z) && !N.TREE_BLOCK[W.get(x, y, z)];
    // the meadow column under the severed line: grass at 25, open air at 26,
    // the severed trunk at 27 -- one cell above the grass, where its base was
    // cut -- and the step along the north face with its top at the trunk's
    // height and its top cell open
    const cx = 37, cz = 31;
    if (!hard(cx, 25, cz)) return { error: 'the meadow grass under the severed line is gone; the world moved' };
    if (W.solidAt(cx, 26, cz)) return { error: 'the air under the severed trunk is no longer air; the world moved' };
    if (!W.solidAt(cx, 27, cz) || !N.TREE_BLOCK[W.get(cx, 27, cz)])
      return { error: 'there is no severed trunk over the step top; the world moved' };
    if (!hard(cx, 26, cz - 1) || W.solidAt(cx, 27, cz - 1))
      return { error: 'the step along the north face is no longer open at the trunk\'s height; the world moved' };
    const body = { x: frog.x, y: frog.y, z: frog.z, yaw: frog.yaw, vy: frog.vy, state: frog.state,
      pause: frog.pause, tx: frog.tx, tz: frog.tz, homeX: frog.homeX, homeZ: frog.homeZ,
      speed: frog.speed, t: frog.t, hopT: frog.hopT, wind: frog.wind, sleeping: frog.sleeping,
      climbTo: frog.climbTo, climbRate: frog.climbRate };
    const was = { x: p.x, y: p.y, z: p.z, form: p.form };
    const herdWas = g.herdCentres;
    p.form = null; p.x = 4; p.z = 4; p.y = W.h - 2;      // nobody to run from
    // awake, on the grass, aimed at the step: the target is repointed every
    // frame so the frog keeps wanting the step the whole watch -- what is
    // under test is whether the lift carries it onto the step, not whether
    // its errand happens to change at the right moment. Two more hands keep
    // the frog pointed at the step for the whole of it: the errand is held
    // where it is (a retarget would pick a new errand from a disc of the
    // home, and the walk to it is not the step under test), and the middle
    // of the flock is emptied (a frog of the flock more than a throw from
    // the middle of its kind walks back to the lake, and that walk is not
    // the step under test either). The watch is one synchronous block, so
    // what the game works out once a tick is not worked out again inside
    // it: the emptied middle stays emptied until it is put back.
    g.herdCentres = {};
    frog.state = 'wander'; frog.sleeping = false;
    let hover = 0, climbed = -1, insideHard = 0, maxY = -1;
    for (let i = 0; i < 300; i++) {
      if (i === 0) { frog.x = cx + 0.5; frog.y = 26; frog.z = cz + 0.5; frog.yaw = 0; frog.vy = 0; }
      frog.tx = cx + 0.5; frog.tz = cz - 2.5;
      frog.pause = 999;
      frog.update(1 / 60, p, W, g);
      const fy = Math.floor(frog.y), fz = Math.floor(frog.z);
      if (hard(Math.floor(frog.x), fy, fz)) insideHard++;
      if (frog.y > 26.3 && frog.y < 26.6 && fz === cz) hover++;
      if (climbed < 0 && fz === cz - 1 && frog.y >= 26.9) climbed = i;
      if (frog.y > maxY) maxY = frog.y;
    }
    const out = { spot: [cx, cz], climbed, hover, insideHard, maxY: +maxY.toFixed(2),
      yEnd: +frog.y.toFixed(2), xEnd: +frog.x.toFixed(2), zEnd: +frog.z.toFixed(2) };
    Object.assign(frog, body);
    Object.assign(p, was);
    g.herdCentres = herdWas;
    return out;
  });
  check('a frog under the severed trunk climbs the step the gate owes it, and is not held at four-fifths of it',
    !floatStep.error && floatStep.climbed >= 0 && floatStep.hover < 200 && floatStep.insideHard === 0, floatStep);

  /* 11i2. Leaves are not a roof to a body in the air. The flock step above shows
     the rule working over forty seconds of a whole valley, which is how it should
     look and a slow way to find out whether it is still there: the bird that gets
     caught is one in a dozen runs. This is the rule asked directly. A crown with
     open sky over it, a body put in the middle of it, and a flight height above
     the top of it -- does it get out? Foliage counted as solid to the step gate
     and as the ceiling over the head at the same time, so the answer was no in
     every run: the body was refused sideways into the leaves and refused up
     through them, and stayed at the height the underside of the crown hands out
     for as long as it was left there. */
  const throughLeaves = await step('birdsRiseThroughLeaves', () => {
    const N = window.FRUTARIA, g = window.game, p = g.player, W = g.world;
    // a crown with room over it: the top of the column is leaves, and there are
    // five cells of open sky above it to climb into
    let spot = null;
    for (let z = 8; z < W.d - 8 && !spot; z++) for (let x = 8; x < W.w - 8; x++) {
      const top = N.groundY(W, x, z, W.h - 1);
      if (top < 8 || top > W.h - 8) continue;
      if (!N.TREE_BLOCK[W.get(x, top - 1, z)]) continue;
      let clear = 0;
      for (let k = top; k < top + 5; k++)
        if (!W.solidAt(x, k, z) && !W.liquidAt(x, k, z)) clear++;
      if (clear < 5) continue;
      spot = { x: x + 0.5, z: z + 0.5, top };
      break;
    }
    if (!spot) return { error: 'no crown with open sky over it anywhere in the map' };
    const owl = g.creatures.find(c => c.sp.id === 'owl');
    if (!owl) return { error: 'no owl in the valley' };
    const body = { x: owl.x, y: owl.y, z: owl.z, yaw: owl.yaw, vy: owl.vy, state: owl.state,
      sleeping: owl.sleeping, pause: owl.pause, tx: owl.tx, tz: owl.tz, homeX: owl.homeX,
      homeZ: owl.homeZ, flyY: owl.flyY, speed: owl.speed, t: owl.t, climbTo: owl.climbTo,
      climbRate: owl.climbRate };
    const was = { x: p.x, y: p.y, z: p.z, form: p.form };
    p.form = null; p.x = 4; p.z = 4; p.y = W.h - 2;      // nobody to run from
    // in the middle of the crown, well under the top of it, and asked to be above
    owl.x = spot.x; owl.z = spot.z; owl.y = spot.top - 1.5;
    owl.homeX = owl.x; owl.homeZ = owl.z;
    owl.tx = owl.x; owl.tz = owl.z; owl.pause = 1e9;     // it stays put: only the
    owl.state = 'wander'; owl.sleeping = false;          // height is under test
    owl.flyY = spot.top + 6;
    let rose = -1, inLeaves = 0;
    for (let i = 0; i < 60 * 20; i++) {
      owl.update(1 / 60, p, W, g);
      if (N.TREE_BLOCK[W.get(Math.floor(owl.x), Math.floor(owl.y), Math.floor(owl.z))]) inLeaves++;
      if (rose < 0 && owl.y >= spot.top + 1) rose = +(i / 60).toFixed(2);
    }
    const out = { spot, rose, yEnd: +owl.y.toFixed(2), inLeaves, tall: +owl.tall.toFixed(2) };
    Object.assign(owl, body);
    Object.assign(p, was);
    return out;
  });
  check('a flying body rises through a crown: leaves are not a roof',
    !throughLeaves.error && throughLeaves.rose >= 0 && throughLeaves.rose < 12, throughLeaves);

  /* 11i2b. And the body worn from that animal is the one that had to be told.
     `hits()` and `colAt()` -- the two gates a worn body goes through -- used to
     ask `solidAt` and nothing else, so the crown that is no wall at all to the
     owl was a wall and a roof to the body wearing the owl: standing under it
     with the climb key held, that body rose 2.3 m in the first 1.5 s and then
     did not move again for the next 1.5 s, its speed zeroed by needles it could
     not get past, while the animal it is carved from left the same crown without
     slowing. Foliage is now asked by material (`N.FOLIAGE`, the `soft` flag the
     mesher has always carried) and the body by what it is built for
     (`formDef.fly`), so a trunk stays a wall to both, and a body on foot still
     climbs a tree and stands on the crown it grew. Measured with direct update
     calls: the clock is the test's own, and the page's loop is not asked to hold
     a key it re-reads every frame. */
  const worn = await step('aWornBodyInTheAirIsNotStoppedByFoliage', () => {
    const g = window.game, W = g.world, N = window.FRUTARIA, P = g.player;
    const was = { x: P.x, y: P.y, z: P.z, yaw: P.yaw, form: P.form, vx: P.vx, vy: P.vy, vz: P.vz, grounded: P.grounded };
    const fol = (x, y, z) => !!N.FOLIAGE[W.get(x, y, z)];
    const groundOf = (x, z) => { for (let y = W.h - 1; y >= 0; y--) if (W.solidAt(x, y, z) && !N.TREE_BLOCK[W.get(x, y, z)]) return y; return -1; };
    const topOf = (x, z) => { for (let y = W.h - 1; y >= 0; y--) if (W.solidAt(x, y, z)) return y; return -1; };
    const run = (secs, inp) => { for (let i = 0; i < Math.round(secs * 60); i++) P.update(1 / 60, inp || {}, g); };
    const put = (x, y, z) => { P.x = x; P.y = y; P.z = z; P.vx = P.vy = P.vz = 0; P.grounded = false; };
    /* one tree: a trunk with foliage over it and the ground right under it */
    let tree = null;
    for (let z = 20; z < W.d - 20 && !tree; z++) for (let x = 20; x < W.w - 20 && !tree; x++)
      for (let y = 4; y < 30; y++) {
        if (W.get(x, y, z) !== 6) continue;
        if (groundOf(x, z) !== y - 1) continue;
        let f = 0;
        for (let h = 1; h <= 10; h++) if (fol(x, y + h, z)) f++;
        if (f >= 3) tree = { x, y, z, gr: y - 1 };
        break;
      }
    /* and open ground under that crown: a column within three of the trunk with
       nothing solid for two metres over the feet and foliage at least two blocks
       thick above that */
    let spot = null;
    for (let dz = -3; dz <= 3 && !spot; dz++) for (let dx = -3; dx <= 3 && !spot; dx++) {
      const cx = tree.x + dx, cz = tree.z + dz, gr = groundOf(cx, cz);
      if (gr < 2) continue;
      let first = 0, f = 0;
      for (let h = 1; h <= 9; h++) {
        if (fol(cx, gr + h, cz)) { if (!first) first = h; f++; }
        else if (W.solidAt(cx, gr + h, cz)) { first = -h; break; }
      }
      if (first > 1 && f >= 2) spot = { x: cx, z: cz, gr, ceilingAt: first, fol: f };
    }
    const climb = (form) => {
      P.form = form; put(spot.x + 0.5, spot.gr + 1.0005, spot.z + 0.5);
      const y0 = P.y;
      run(1.5, { jump: true });
      const r15 = +(P.y - y0).toFixed(2);
      run(1.5, { jump: true });
      return { y0: +y0.toFixed(2), rise15: r15, rise30: +(P.y - y0).toFixed(2), vy: +P.vy.toFixed(2) };
    };
    const air = climb('owlberry'), walker = climb(null);
    /* what a body at rest makes of a crown, and what a body on foot makes of it */
    let col = null;
    for (let z = 20; z < W.d - 20 && !col; z++) for (let x = 20; x < W.w - 20 && !col; x++) {
      const t = topOf(x, z);
      if (t < 10 || !fol(x, t, z)) continue;
      const gr = groundOf(x, z);
      if (gr < 2 || t - gr > 6 || t - gr < 3) continue;
      col = { x, z, top: t, gr };
    }
    const drop = (form) => {
      P.form = form; put(col.x + 0.5, col.top + 3, col.z + 0.5);
      run(4); run(3);
      return { rest: +P.y.toFixed(2), grounded: P.grounded };
    };
    const rest_air = drop('owlberry'), rest_foot = drop(null);
    /* and the wall a tree is allowed to keep */
    const into = (form) => {
      P.form = form;
      const cx = tree.x + 2, cz = tree.z;
      put(cx + 0.5, groundOf(cx, cz) + 1.0005, cz + 0.5);
      P.yaw = -Math.PI / 2;                 // facing the trunk, down -x
      run(1.5, { fwd: true });
      return { x: +P.x.toFixed(2), face: tree.x + 1, grounded: P.grounded };
    };
    const wall_foot = into(null), wall_air = into('owlberry');
    Object.assign(P, was);
    return { tree, spot, air, walker, col, rest_air, rest_foot, wall_foot, wall_air };
  });
  check('a tree with open ground under its crown was found to measure on',
    worn.spot !== null && worn.col !== null, worn);
  check('a body built for the air climbs out through the crown it is standing under',
    worn.air.rise30 > 5 && worn.air.vy > 1, worn.air);
  check('and it ends above the underside of that crown, which is the foliage it walked through',
    worn.air.y0 + worn.air.rise30 > worn.spot.gr + worn.spot.ceilingAt + 2, worn);
  check('a body on foot is still stopped by that same crown', worn.walker.rise30 < 1.5, worn.walker);
  check('a body built for the air settles onto the floor under a crown, and cannot perch in it',
    worn.rest_air.grounded && Math.abs(worn.rest_air.rest - (worn.col.gr + 1)) < 0.05, worn.rest_air);
  check('a body on foot still stands on the crown itself',
    worn.rest_foot.grounded && Math.abs(worn.rest_foot.rest - (worn.col.top + 1)) < 0.05, worn.rest_foot);
  check('a trunk is still a wall to a body built for the air',
    worn.wall_air.x > worn.wall_air.face && worn.wall_air.x < worn.wall_air.face + 0.5, worn.wall_air);

  /* 11i2c. The animal that flies of its own accord is refused by the same trunk.
     The other half of the same law: `airCell` -- the one question a body held up
     by air keeps answering, sideways and up -- used to exempt `N.TREE_BLOCK`,
     which is the list of blocks a tree is made of *including the trunk*, so wood
     was air to a bird. Measured over ten minutes of the valley running, 350 of
     the 216,000 frames of six owls had an owl's own cell occupied by a trunk, and
     it was not passing through: it sat there, frame after frame at (30,38,16) at
     y38.7 with its vertical speed at zero, a bird hovering inside solid wood.
     The gate now asks the material table (`N.FOLIAGE`), which is what the body
     worn from that same animal has asked since `9f90d7a`. A seeded A/B -- six
     owls, 300 s each, the same valley, the same starting birds, the same random
     stream -- reads the whole change: frames inside wood **26 -> 0**, path
     **3728.7 -> 3728.2 m**, climb and descent **1114.7/1114.5 -> 1113.8/1113.6**,
     frames inside rock **0 -> 0**, and the height band each bird keeps identical
     to 0.1 m. The flight is the same flight; only the wood is missing from it.
     Below, the birds are not left to wander into wood by chance: six of them are
     each stood three metres off a free-standing trunk and aimed at the middle of
     it for four seconds, from four sides of it. That is what makes the first
     check mean something -- the premise that they were driven at the wood is
     asserted in the same step (how close each one got), so "0 frames inside it"
     cannot be paid for by a flock that never got there.
     The animals on foot ask the same table now, and the step below this one is
     the half of it that belongs to a walker: the walk gate answered "what is the
     ground under this column" plus one cell over it, which refuses a trunk
     standing on the ground (0 frames inside a trunk for the bears of this valley
     out of the 36,000 frames the two of them spend wandering, before and after) and
     let in a trunk with open air under it. */
  const trunkLaw = await step('aWildAnimalIsNotLetThroughATreeTrunk', () => {
    const g = window.game, W = g.world, N = window.FRUTARIA, P = g.player;
    const fol = (x, y, z) => !!N.FOLIAGE[W.get(x, y, z)];
    // solid, and not foliage: the blocks that are wood and bone to a body
    const wood = (x, y, z) => W.solidAt(x, y, z) && !!N.TREE_BLOCK[W.get(x, y, z)] && !fol(x, y, z);
    const rock = (x, y, z) => W.solidAt(x, y, z) && !N.TREE_BLOCK[W.get(x, y, z)];
    const airAt = (x, y, z) => !W.solidAt(x, y, z) && !W.liquidAt(x, y, z);
    const SIDE = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    const groundOf = (x, z) => { for (let y = W.h - 1; y >= 0; y--) if (rock(x, y, z)) return y; return -1; };
    /* free-standing trunks: a trunk standing on the ground, at least three blocks
       of wood in a row, with its own ring of air round it at trunk height, and a
       straight approach -- clear air for a body at 1.5 m and at 3 m out on one of
       the four sides. The whisperwood plants trees shoulder to shoulder, so the
       approaches are what is scarce here, not the trunks: this picks the side
       that has room rather than pretending the wood is an orchard. The trunks
       chosen are kept apart so the birds are aimed at different trees. */
    const free = (x, y, z) => { for (let h = 0; h <= 2; h++) if (!airAt(x, y + h, z)) return false; return true; };
    const trees = [];
    for (let z = 26; z < W.d - 26 && trees.length < 6; z++) for (let x = 28; x < W.w - 28 && trees.length < 6; x++)
      for (let y = 8; y < 34; y++) {
        if (!wood(x, y, z) || groundOf(x, z) !== y - 1) continue;
        let run = 0; while (wood(x, y + run, z)) run++;
        if (run < 3) continue;
        if (trees.some(t => Math.abs(t.x - x) + Math.abs(t.z - z) < 8)) continue;
        let ring = true;
        for (let dx = -1; dx <= 1 && ring; dx++) for (let dz = -1; dz <= 1; dz++) {
          if (dx === 0 && dz === 0) continue;
          if (!free(x + dx, y, z + dz)) { ring = false; break; }
        }
        if (!ring) continue;
        const sides = SIDE.filter(([sx, sz]) => free(x + sx * 2, y, z + sz * 2) && free(x + sx * 3, y, z + sz * 3));
        if (sides.length) trees.push({ x, y, z, run, sx: sides[0][0], sz: sides[0][1] });
        break;
      }
    const fly = g.creatures.filter(c => c.isFlyer());
    if (trees.length < 4 || fly.length < 4) return { error: 'not enough free trunks and flyers', trees: trees.length, flyers: fly.length };
    const was = { x: P.x, y: P.y, z: P.z, form: P.form, vital: P.vital, time: g.time };
    const snap = fly.map(c => ({ x: c.x, y: c.y, z: c.z, yaw: c.yaw, vx: c.vx, vy: c.vy, vz: c.vz, t: c.t,
      speed: c.speed, held: c.held, state: c.state, pause: c.pause, tx: c.tx, tz: c.tz,
      sleep: c.sleeping, homeX: c.homeX, homeZ: c.homeZ, flyY: c.flyY, climbTo: c.climbTo, climbRate: c.climbRate }));
    P.form = null; P.vital = 10; P.x = 4; P.y = W.h - 2; P.z = 4;
    g.time = 420 * 21 / 24; g.updateEnv();
    const birds = [];
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i], c = fly[i], [sx, sz] = [t.sx, t.sz];
      Object.assign(c, { x: t.x + 0.5 + sx * 3, y: t.y + 1.4, z: t.z + 0.5 + sz * 3,
        vx: 0, vy: 0, vz: 0, state: 'wander', sleeping: false, pause: 0,
        tx: t.x + 0.5, tz: t.z + 0.5 });
      birds.push({ t, c, insideWood: 0, overColumn: 0, inRock: 0, path: 0, closest: 1e9, gone: 0 });
    }
    for (let i = 0; i < 240; i++)
      for (const b of birds) {
        const { c, t } = b;
        const px = c.x, pz = c.z;
        c.tx = t.x + 0.5; c.tz = t.z + 0.5; c.pause = 0;
        c.update(1 / 60, P, W, g);
        b.path += Math.hypot(c.x - px, c.z - pz);
        const bx = Math.floor(c.x), by = Math.floor(c.y), bz = Math.floor(c.z);
        let wIn = false, rIn = false;
        for (let k = by; k <= Math.floor(c.y + 0.7); k++) {
          if (wood(bx, k, bz)) wIn = true;
          if (rock(bx, k, bz) || W.liquidAt(bx, k, bz)) rIn = true;
        }
        if (wIn) b.insideWood++;
        // in the trunk's column at ANY height: over the top of a tree is the same
        // column, and that is a bird above a tree, not a bird inside one
        if (bx === t.x && bz === t.z) b.overColumn++;
        if (rIn) b.inRock++;
        /* how close this body came to wood of any kind, not only to the trunk it
           was aimed at: the whisperwood plants trees shoulder to shoulder, and a
           bird aimed at one of them is flying past the trunks of the others. What
           the premise has to establish is that these bodies were driven up
           against wood, so the read is the nearest wood column, 3x3 round the
           feet. Refused at a face a body sits ~0.7 from the middle of the column
           it is pressed against; inside it, it sits within 0.71. */
        let cd = 9;
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++)
          if (wood(bx + dx, by, bz + dz)) cd = Math.min(cd, Math.hypot(c.x - (bx + dx + 0.5), c.z - (bz + dz + 0.5)));
        if (cd < b.closest) b.closest = cd;
        if (Math.abs(c.x - (t.x + 0.5)) > 1.2 || Math.abs(c.z - (t.z + 0.5)) > 1.2) b.gone++;
      }
    const rep = birds.map(b => ({ at: [b.t.x, b.t.y, b.t.z], run: b.t.run, side: [b.t.sx, b.t.sz],
      insideWood: b.insideWood,
      overColumn: b.overColumn, inRock: b.inRock, path: +b.path.toFixed(2),
      closest: +b.closest.toFixed(2), gone: b.gone }));
    const out = { trees: trees.length, birds: rep,
      insideWood: rep.reduce((s, r) => s + r.insideWood, 0),
      overColumn: rep.reduce((s, r) => s + r.overColumn, 0),
      inRock: rep.reduce((s, r) => s + r.inRock, 0),
      path: +rep.reduce((s, r) => s + r.path, 0).toFixed(1),
      pressed: rep.filter(r => r.closest < 1.4).length,
      gone: rep.reduce((s, r) => s + r.gone, 0),
      closest: rep.map(r => r.closest) };
    fly.forEach((c, i) => Object.assign(c, snap[i]));
    Object.assign(P, was); g.time = was.time; g.updateEnv();
    return out;
  });
  check('four free-standing trunks and four flyers were found to aim at',
    !trunkLaw.error, trunkLaw);
  check('the birds were driven at the wood: they came up against it, so "0 frames inside" is not paid for by a flock that never got there',
    trunkLaw.pressed >= 3, trunkLaw);
  check('a flying animal is not let inside a trunk: the wood is not air to it',
    trunkLaw.insideWood === 0, trunkLaw);
  check('and none of them ended up inside rock or water',
    trunkLaw.inRock === 0, trunkLaw);
  check('refused by the tree they keep flying, going round it rather than freezing at it',
    trunkLaw.path > 12 && trunkLaw.gone > 200, trunkLaw);

  /* 11i2d. The same animal, asked about its height instead of its sideways. The
     step above asks where a flying body may be put sideways; this asks where it
     may be put tall. The law that takes a flyer's new height asked only about the
     cell under its feet, while the sideways gate a few lines above it asks about
     the whole span of the body (`floor(y)` up to `floor(y + tall)`). A trunk
     standing on a step is the shape that falls through that difference: the climb
     is capped by `roofY`, and `roofY` deliberately does not count a trunk as a
     roof -- a body built for the air is meant to be able to come down through a
     crown -- so the only law left between a climbing bird and the underside of an
     overhanging trunk was the one that was asking about feet. That is not a rare
     shape either: the valley holds **11** cells of trunk with open air straight
     under them. A rig (one column, one trunk block set two cells above its floor,
     one flyer held over that column with its flight height four cells up, 240
     frames, the same bird state every time) reads the change: the body used to
     rise to **2.00 m** above that floor with its **head inside the wood for 234
     of the 240 frames** and up to **0.70 m** of it through the block, its feet in
     open air the whole while; it now stops at **1.29 m**, which is the room left
     between that floor and the underside of the block once the body's own height
     is taken off it, and it touches nothing. Below, the rig is inside the suite,
     and the body is held over the column by the rig rather than left to itself:
     one unpinned run found the bird going sideways round the trunk instead (path
     11.5 m, only 10 of its 240 frames over the column), which leaves the question
     never asked. Holding the position is what makes the read about height. */
  const ledgeLaw = await step('aFlyerEasedUpUnderAnOverhangingTrunkKeepsItsWholeBodyOutOfTheWood', () => {
    const g = window.game, W = g.world, P = g.player;
    const TRUNK = 6;                       // solid, in TREE_BLOCK, not foliage
    const airAt = (x, y, z) => !W.solidAt(x, y, z) && !W.liquidAt(x, y, z);
    const floorOf = (x, z) => { for (let y = W.h - 1; y >= 0; y--) if (W.solidAt(x, y, z)) return y; return -1; };
    /* The first column of ground with room over it, taken in a fixed order: seven
       cells of clear air above its floor, and clear air all round the height the
       block goes at, so the only wood near this body is the one put there on
       purpose. The scan is deliberately blind to where the creatures happen to be
       -- the valley is seeded and the flock is not, and a column picked by the
       birds' positions would move between runs. */
    let col = null;
    for (let z = 30; z < W.d - 30 && !col; z++) for (let x = 30; x < W.w - 30 && !col; x++) {
      const gy = floorOf(x, z);
      if (gy < 8 || gy > W.h - 9) continue;
      let open = true;
      for (let k = gy + 1; k <= gy + 7 && open; k++) if (!airAt(x, k, z)) open = false;
      for (let dx = -1; dx <= 1 && open; dx++) for (let dz = -1; dz <= 1 && open; dz++) {
        if (!dx && !dz) continue;
        for (let k = gy + 1; k <= gy + 4 && open; k++) if (!airAt(x + dx, k, z + dz)) open = false;
      }
      if (open) col = { x, z, gy };
    }
    if (!col) return { error: 'no column with seven cells of clear air over its floor' };
    const { x, z, gy } = col, beam = gy + 2;
    /* a body short enough that the room between that floor and the block is a
       room it could stand in at all: otherwise the premise is a pass, not a stop */
    const flyers = g.creatures.filter((c) => c.isFlyer());
    const fit = flyers.filter((c) => c.tall > 0.2 && c.tall <= 1);
    if (!fit.length) return { error: 'no flyer short enough to fit under the beam', flyers: flyers.length };
    const bird = fit[0], tall = bird.tall;
    const was = { x: P.x, y: P.y, z: P.z, form: P.form, vital: P.vital, time: g.time };
    const snap = {};
    for (const k of ['x', 'y', 'z', 'yaw', 'vx', 'vy', 'vz', 't', 'phase', 'gait', 'speed', 'held',
      'state', 'pause', 'tx', 'tz', 'sleeping', 'flyY', 'climbTo', 'climbRate', 'homeX', 'homeZ']) snap[k] = bird[k];
    const beamWas = W.get(x, beam, z);
    W.set(x, beam, z, TRUNK);
    g.time = 420 * 21 / 24; g.updateEnv();
    Object.assign(bird, { x: x + 0.5, y: gy + 1, z: z + 0.5, yaw: 0, vx: 0, vy: 0, vz: 0,
      t: 0, phase: 0, gait: 0, speed: 2, held: 0, state: 'wander', sleeping: false, pause: 0,
      tx: x + 0.5, tz: z + 0.5, flyY: gy + 4, climbTo: null, homeX: x + 0.5, homeZ: z + 0.5 });
    const rec = { frames: 0, beamWood: 0, airborne: 0, stays: 0, inside: 0, headIn: 0,
      deep: 0, maxAbove: -1e9, minAbove: 1e9, path: 0 };
    for (let i = 0; i < 240; i++) {
      const px = bird.x, pz = bird.z;
      bird.x = x + 0.5; bird.z = z + 0.5;      // the rig holds the body over the column
      bird.tx = x + 0.5; bird.tz = z + 0.5; bird.pause = 0;
      bird.update(1 / 60, P, W, g);
      rec.frames++;
      rec.path += Math.hypot(bird.x - px, bird.z - pz);
      if (W.get(x, beam, z) === TRUNK) rec.beamWood++;
      const bx = Math.floor(bird.x), bz = Math.floor(bird.z), by = Math.floor(bird.y);
      if (bx === x && bz === z) rec.stays++;
      const above = bird.y - gy;
      if (above > 0.2) rec.airborne++;
      if (above > rec.maxAbove) rec.maxAbove = above;
      if (above < rec.minAbove) rec.minAbove = above;
      /* the cells this body stands in, feet cell to head cell: the same question
         the sideways gate asks of a step, put to the height instead */
      let hit = -1;
      for (let k = by; k <= Math.floor(bird.y + tall); k++) if (W.solidAt(bx, k, bz)) { hit = k; break; }
      if (hit >= 0) {
        rec.inside++;
        if (hit > by) rec.headIn++;
        const through = (bird.y + tall) - hit;
        if (through > rec.deep) rec.deep = through;
      }
    }
    const out = { col: [x, gy, z], beam, beamWas, tall: +tall.toFixed(2), frames: rec.frames,
      beamWood: rec.beamWood, airborne: rec.airborne, stays: rec.stays, inside: rec.inside,
      headIn: rec.headIn, deep: +rec.deep.toFixed(2), path: +rec.path.toFixed(2),
      maxAbove: +rec.maxAbove.toFixed(2), minAbove: +rec.minAbove.toFixed(2),
      limit: +(2 - tall).toFixed(2), flyers: flyers.length };
    W.set(x, beam, z, beamWas);
    Object.assign(bird, snap);
    Object.assign(P, was); g.time = was.time; g.updateEnv();
    return out;
  });
  check('a column of ground with open air over it, and a body short enough to fit under a beam set over it, were found to measure on',
    !ledgeLaw.error && ledgeLaw.beamWas === 0, ledgeLaw);
  check('the block stayed the wood it was set as, so "never inside it" is not paid for by the wood going away',
    ledgeLaw.beamWood === ledgeLaw.frames, ledgeLaw);
  check('the body was held up by air the whole while, so this is the flight law being asked and not a landing',
    ledgeLaw.airborne === ledgeLaw.frames, ledgeLaw);
  check('it did climb: the body came up off its floor to the room the beam leaves, so "never inside it" is not paid for by a bird that never went up',
    ledgeLaw.maxAbove >= 1, ledgeLaw);
  check('and it spent every frame over that column, which is the only place the question can be asked',
    ledgeLaw.stays === ledgeLaw.frames, ledgeLaw);
  check('a flying body is not let inside wood with any part of itself',
    ledgeLaw.inside === 0 && ledgeLaw.deep === 0, ledgeLaw);
  check('in particular its head: the guard used to ask only about the cell under the feet, and the feet were in open air every frame',
    ledgeLaw.headIn === 0, ledgeLaw);
  check('and the height it is allowed is the room the wood leaves it: floor to underside, less its own height',
    ledgeLaw.maxAbove <= ledgeLaw.limit + 0.02, ledgeLaw);


  /* 11i2e. The same wood, asked of a body that stands on the ground. The step
     above asks a body held up by air; a body on foot goes through a different
     gate, and that gate asked two questions fewer than the flyer's.
     It answers "what is the surface would I stand on in that column" (`standY`,
     which skips the tree blocks so that the ground under a tree is the ground and
     not the top of the tree) and then exactly one cell over that surface. For a
     walker that single cell is the whole of the difference between a wall and
     air, and that is exactly why the shape hid: of the 2,684 wood cells of this
     valley 1,830 sit on wood and 843 stand on the ground, so the cell over the
     surface a body stands on is wood in every one of those columns and the gate
     refused them all. It is the remaining 11 -- wood with open air straight under
     it, over the surface a walker stands on -- where the gate read air, let the
     body in, and the body walked through the block with its shoulders. The flock
     never finds that shape on its own: over the 540,000 frames the 30 animals of
     a fresh valley spend wandering (18,000 frames each) not one of them was
     inside wood in a single frame before this change or after it, and their paths
     (11,673.9 m), their frames standing still (116,984) and their frames pressed
     up against wood (6,977) come out the same to the centimetre either side of
     it. The rig is the only way to the shape, and the rig had to be rebuilt
     before it measured one law instead of one afternoon.
     First it had to stop borrowing animals out of the flock: the same shelf, the
     same block at the same height and the same draw gave 79 frames inside the
     column it was aimed at in a page that had run nothing and 0 in the suite, and
     a nearest wood of 0.60 m against 1.05 m. It was not the same animal each time
     -- a body is born spending draws of its own, and how many the spawner spends
     before it is born depends on the world it is sampled into -- so every body
     here is made by the code that makes every body in the game, `N.Creature`,
     under a draw seeded in the rig. Then it had to pin what the page leaves
     behind: the game works the middle of each species' herd out once a tick and
     leaves it on the game object, and the herd law pulls any animal of that
     species that has wandered more than a throw from that middle. Take the crowd
     away for the length of a rig and the middle it pulls towards is a leftover of
     whatever the page was doing before the rig started: measured with the herd
     left loose, the three rigs of one frog -- the block at three different
     heights, under three different draws -- agreed with each other to the
     centimetre on a 6.05 m route that strayed 4.46 m from the block and never
     came nearer than 1.49 m to it, a route decided by something other than the
     law under test -- and the same three rigs in another page, the same shelf and
     the same seeds, walked a route of the same 6.05 m that came within 1.09 m of
     the block and strayed 4.02 m from it. This body's herd is itself. And the rig
     aims the body, because which way a body happens to be looking when a frame
     starts is not the law either: left to its own draw the bear travelled 16.6 m
     and never came nearer than 2.1 m to the column it was handed an errand
     through.
     The rig is one column of ground, flat for nine cells each way with seven
     cells of clear air over all of it, one block in it, and one animal walked for
     eight seconds with its errand re-set every frame. The block goes at three
     heights -- the cell over the surface, two cells over it, three -- and is met
     two ways: `through`, walked at from 2.5 m on one side with an errand out the
     other, which is the walk gate being asked about a column; and `under`,
     starting in the column itself, which is where the room for a hop is decided.
     A trunk two cells over the floor of a shelf at 24, against a 1.54 m bear: it
     came up against wood at 0.17 m and walked through it, 30 of its 480 frames
     with part of itself inside, up to 0.54 m of it through the block, its feet on
     the ground every one of those frames, 30 of them standing in that column. It
     now stops at the face of it -- nearest wood 0.50 m, 0 frames in the column --
     and still walks its 16.5 m. The same block one cell higher, over its head, it
     walks under: 29 frames in that column, none of them inside, in every build.
     And the same block at the same height is open ground to a 0.43 m frog, which
     walks into that column 81 of its 480 frames in every build, while a block at
     its own feet cell is refused that frog too. The span is asked of this body's
     own height, which is what keeps the answer about the body rather than about
     the block; asking it from the height the body happens to be at, rather than
     from the surface it stands on, was measured too, and it keeps these bodies
     out of the wood and takes the walk with it: the bear stood still 180 of its
     480 frames under a block one cell over its head and travelled 10.4 m instead
     of 16.5 m, and the eight bodies travelled 72.8 m instead of 79.9 m.
     The span alone does not keep the frog out of the wood over its own head, and
     there the answer is two laws and not one. A hop is launched a frame before
     the legs push, from a read of the room over the floor the body stands on, and
     that room was asked out of a list that exempted the whole of TREE_BLOCK,
     trunk included: under a trunk the sky read as open sky, and the frog starting
     under one put its head 0.16 m into that block in 14 of its 480 frames,
     nearest wood 0.11 m. And that room was asked over the column the body stands
     in only, when an arc goes forward as far as it goes up: the same frog walked
     at the same block from next door launched in the open column, spent 26 of its
     airborne frames inside the column with the block over it without ever pushing
     off in it, and arrived with its head 0.16 m inside that block on the frame
     after the push -- 14 frames of it, nearest wood 0.31 m, with the ceiling
     asked of the material table but still read over its own cell only. Asked over
     the cells the arc is spent over, and out of the material table, the arc that
     does not fit is not launched at all: 0 frames inside, 80 frames walked in that
     column, 145 airborne frames where it had 250, and 5 arcs where it had 9.
     The last rig is the control that says this is about material and not about a
     low ceiling: the same frog, the same column, the same height, the same draw,
     the block made of leaves instead of trunk. Counted in the column the block
     stands over, it launches 1 arc and spends 29 frames off the floor under a
     crown, and none of either under a trunk -- the crown is not a roof to it, the
     trunk is. And with the material table not asked, that trunk reads 29 frames
     and 1 arc: the crown's own numbers exactly, which is the height being read
     and not the material. Counted over the whole eight seconds the two of them
     differ by 12 airborne frames and no arc at all, because the hopper walks out
     of the column and hops about down the shelf, which is why the control is
     counted where the block is.
     Three halves, and each of them is needed by a rig of its own: with the span
     alone missing, the bear stands 30 frames inside the block and no other rig
     changes at all; with the material table missing from the ceiling, the frog
     starting under the block stands 14 frames inside it and the one walked at it
     is inside 28; with the arc's forward reach missing, the walked-at frog is
     inside 14 frames and the one starting under the block is clean. With all
     three missing -- the gate as it stood before any of this -- 72 of the 3,840
     frames of these eight rigs have part of a body inside wood, every one of them
     a head. With all three in place: no rig has any part of a body inside wood,
     no rig ends inside rock, nothing is thrown across the shelf, and every animal
     still travels. */
  const spanLaw = await step('aBodyOnFootAsksTheWoodOverItsOwnSpanAndTheRoofOverItsHead', () => {
    const g = window.game, W = g.world, N = window.FRUTARIA, P = g.player;
    const TRUNK = 6;                       // solid, in TREE_BLOCK, not foliage: wood
    const LEAF = 7;                        // solid too, and in TREE_BLOCK, but in FOLIAGE: a crown
    const wood = (x, y, z) => W.solidAt(x, y, z) && !!N.TREE_BLOCK[W.get(x, y, z)] && !N.FOLIAGE[W.get(x, y, z)];
    const airAt = (x, y, z) => !W.solidAt(x, y, z) && !W.liquidAt(x, y, z);
    const floorOf = (x, z) => { for (let y = W.h - 1; y >= 0; y--) if (W.solidAt(x, y, z)) return y; return -1; };
    /* A flat shelf, taken in a fixed order: nine cells each way at one height with
       seven cells of clear air over all of it, so the only wood near this body is
       the one put there on purpose and the only wall is the one it is aimed at.
       Blind to where the creatures happen to be, for the same reason as the rig
       above: the valley is seeded, the flock is not. */
    let col = null;
    for (let z = 34; z < W.d - 34 && !col; z++) for (let x = 34; x < W.w - 34 && !col; x++) {
      const gy = floorOf(x, z);
      if (gy < 10 || gy > W.h - 10) continue;
      let ok = true;
      for (let dx = -4; dx <= 4 && ok; dx++) for (let dz = -4; dz <= 4 && ok; dz++) {
        if (floorOf(x + dx, z + dz) !== gy) { ok = false; break; }
        for (let k = gy + 1; k <= gy + 7 && ok; k++) if (!airAt(x + dx, k, z + dz)) ok = false;
      }
      if (ok) col = { x, z, gy };
    }
    if (!col) return { error: 'no flat shelf with seven cells of clear air over it' };
    const { x, z, gy } = col;
    const was = { x: P.x, y: P.y, z: P.z, form: P.form, vital: P.vital, time: g.time };
    const rnd = Math.random;
    let sd = 0;
    const seed = (s) => { sd = s; Math.random = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; }; };
    const crowdWas = g.creatures;
    const timeWas = g.time;
    /* The body of each rig is made by the code that makes every body in the game,
       `N.Creature`, under a draw seeded here; the flock is left where the rest of
       the suite left it. Borrowing one of the flock is what this rig did first, and
       it was not then measuring one law: the same shelf, the same block at the same
       height, the same draw, gave 79 frames inside the column the body was aimed at
       in a page that had run nothing and 0 in the suite, and a nearest wood of
       0.60 m in the one against 1.05 m in the other. It was not the same animal
       each time. A body is born with draws of its own -- the hop timer, the depth
       it hangs under the surface, how high it flies over the ground -- and how many
       draws the spawner spends before this one is born depends on the world it is
       sampled into, so a flock seeded once is not the same flock in two worlds. A
       rig that does not get the same animal twice is one rig only by the look of
       it. */
    const land = N.CREATURES.filter((s) => s.locomotion !== 'fly' && s.locomotion !== 'water');
    /* one body tall enough that a block two cells over the floor it stands on lies
       inside its own body, and one short enough that the same block is over its
       head: the same wood, asked of two different spans */
    const born = land.map((sp) => { seed(5150); return new N.Creature(sp, x + 0.5, gy + 1, z + 0.5); });
    const tall = born.filter((c) => !c.isAmphibian() && c.tall > 1.2).sort((a, b) => b.tall - a.tall)[0];
    const short = born.filter((c) => c.isAmphibian() && c.tall > 0.2 && c.tall < 0.8).sort((a, b) => a.tall - b.tall)[0];
    if (!tall || !short) {
      g.time = timeWas; Math.random = rnd;
      return { error: 'no tall walker and no short hopper in the species table', land: born.length };
    }
    /* what the shelf the scan found is actually like, and what is standing on it:
       the scan is blind to both on purpose, so the report says what they are */
    let waterNear = 0, builtNear = 0;
    for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
      if (W.liquidAt(x + dx, gy + 1, z + dz)) waterNear++;
      for (let k = gy + 2; k <= gy + 7; k++) if (W.solidAt(x + dx, k, z + dz)) builtNear++;
    }
    const crowdNear = crowdWas.filter((c) => Math.abs(c.x - x) <= 5 && Math.abs(c.z - z) <= 5).length;
    const rigs = [];
    for (const sp of [tall.sp, short.sp]) {
      /* Three ways the same block is put in front of the same body.
         `through`: the body starts 2.5 m on one side and is handed an errand out
         the other, which is the walk gate being asked about a column.
         `under`: the body starts in the column itself, with the block over its
         head, which is where the room for an arc is decided -- a body that is
         already under a roof is the one whose launch has to answer for it.
         And the amphibian gets the same block at the same height made of leaves:
         the control that says the roof is asked of the material table and not of
         the height. */
      const plan = sp.locomotion === 'amphibian'
        ? [[1, TRUNK, 'through'], [2, TRUNK, 'through'], [3, TRUNK, 'through'],
          [2, TRUNK, 'under'], [2, LEAF, 'under']]
        : [[1, TRUNK, 'through'], [2, TRUNK, 'through'], [3, TRUNK, 'through']];
      for (const [off, mat, mode] of plan) {
        const beam = gy + off, beamWas = W.get(x, beam, z);
        if (beamWas !== 0) { rigs.push({ kind: sp.id, off, mat, mode, beam, error: 'beam cell not clear', beamWas }); continue; }
        const ax = x + 0.5, az = z + 0.5;
        /* the same draw for the same height of block, every run and whatever the
           block is made of: an animal picks where to go with Math.random, and a
           premise that moves between runs is not a premise. The crown rig and the
           wood rig above it are therefore the same animal on the same errand, and
           the only difference between the two of them is the material. */
        seed(77001 + off * 13 + (mode === 'under' ? 300 : 0));
        const body = new N.Creature(sp, mode === 'under' ? ax : ax - 2.5, gy + 1, az);
        /* the rig aims it. Which way a body happens to be looking when the frame
           starts is not the law under test, and left to its own draw the bear spent
           the eight seconds going 16.6 m and never came nearer than 2.1 m to the
           column it was handed an errand through. */
        body.yaw = Math.PI / 2;
        body.tx = mode === 'under' ? ax + 3.5 : ax + 2.5;
        body.tz = az; body.homeX = ax; body.homeZ = az;
        body.pause = 0; body.alarm = 0; body.dry = 0;
        const tallOf = body.tall;
        /* during the rig the valley holds this body and nobody else: what is under
           test is one body and the blocks, and a rig whose answer also depends on
           where the rest of the crowd happens to be standing is measuring
           something else */
        g.creatures = [body];
        /* The middle of a herd is not part of the valley: the game works the
           middle of each species out once a tick and leaves it on the game object,
           and the herd law pulls any animal of that species that has wandered more
           than a throw from it. Take the crowd away for the length of a rig and the
           middle it pulls towards is a leftover of whatever the page was doing
           before the rig started: measured here with the herd left loose, the three
           rigs of one frog -- the block at three different heights, under three
           different draws -- walked the same 6.05 m to the centimetre, straying
           4.46 m from the block and never coming nearer than 1.49 m to it, and the
           same three rigs in another page, the same shelf and the same seeds,
           walked a route of the same 6.05 m that came within 1.09 m of the block
           and strayed 4.02 m from it: routes decided by something other than the
           law under test. This body's herd is itself. */
        const herdWas = g.herdCentres;
        g.herdCentres = Object.assign({}, herdWas);
        g.herdCentres[sp.id] = { x: ax, z: az, n: 1 };
        W.set(x, beam, z, mat);
        P.form = null; P.vital = 10; P.x = 4; P.y = W.h - 2; P.z = 4;   // nobody to run from
        g.time = 420 * 10 / 24; g.updateEnv();                          // a morning: both awake
        /* The stream is seeded again here, after everything the rig does to the
           page: what a body makes of its errand is drawn from this stream, and the
           crown rig and the wood rig are meant to be the same animal on the same
           errand so that the material of the block is the only difference between
           them. The seeding above is what makes the animal; this one is what makes
           the frames it then lives. */
        seed(77001 + off * 13 + (mode === 'under' ? 300 : 0));
        const A = {
          frames: 0, beamWood: 0, onFeet: 0, air: 0, airIn: 0, hops: 0, hopsIn: 0, wasUp: 0,
          inside: 0, feetIn: 0, headIn: 0, deep: 0,
          inRock: 0, path: 0, atColumn: 0, underBeam: 0, pops: 0, stands: 0, gone: 0, closest: 9,
          yEnd: 0, stateEnd: '' };
        for (let i = 0; i < 480; i++) {
          const px = body.x, pz = body.z, py = body.y;
          body.tx = mode === 'under' ? ax + 3.5 : ax + 2.5; body.tz = az; body.pause = 0;
          body.update(1 / 60, P, W, g);
          A.frames++;
          const dd = Math.hypot(body.x - px, body.z - pz);
          A.path += dd;
          if (dd < 0.002) A.stands++;
          if (dd > 0.9 || Math.abs(body.y - py) > 0.9) A.pops++;
          if (W.get(x, beam, z) === mat) A.beamWood++;   // the block stayed what it was set as
          const bx = Math.floor(body.x), bz = Math.floor(body.z), by = Math.floor(body.y);
          if (Math.abs(body.y - N.terrainY(W, bx, bz, Math.floor(body.y + 0.6))) < 0.05) A.onFeet++;
          else A.air++;                                       // off the floor it stands on: an arc
          const inCol = bx === x && bz === z;
          /* an arc is a rise off the floor this body stands on, and the question the
             material control asks is whether the arc was launched in the column with
             the block over it: a body that walks out of that column and hops about
             down the shelf tells us nothing about the room that column leaves. */
          if (body.y - (gy + 1) > 0.25) {
            if (!A.wasUp) { A.hops++; if (inCol) A.hopsIn++; }
            A.wasUp = 1;
          } else A.wasUp = 0;
          if (inCol && Math.abs(body.y - N.terrainY(W, bx, bz, Math.floor(body.y + 0.6))) >= 0.05) A.airIn++;
          if (inCol) { A.atColumn++; if (Math.floor(body.y + tallOf) < beam) A.underBeam++; }
          let hit = -1;
          for (let k = by; k <= Math.floor(body.y + tallOf); k++) if (wood(bx, k, bz)) { hit = k; break; }
          if (hit >= 0) {
            A.inside++;
            if (hit > by) A.headIn++; else A.feetIn++;
            const through = (body.y + tallOf) - hit;
            if (through > A.deep) A.deep = through;
          }
          let rock = false;
          for (let k = by; k <= Math.floor(body.y + tallOf); k++)
            if (W.solidAt(bx, k, bz) && !N.TREE_BLOCK[W.get(bx, k, bz)]) rock = true;
          if (rock) A.inRock++;
          let cd = 9;
          for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++)
            for (let k = by; k <= Math.floor(body.y + tallOf); k++)
              if (wood(bx + dx, k, bz + dz)) cd = Math.min(cd, Math.hypot(body.x - (bx + dx + 0.5), body.z - (bz + dz + 0.5)));
          if (cd < A.closest) A.closest = cd;
          if (Math.abs(body.x - ax) > 1.2 || Math.abs(body.z - az) > 1.2) A.gone++;
          A.yEnd = body.y;
          A.stateEnd = body.state + (W.liquidAt(bx, by, bz) ? '+water' : '') +
            (body.inWater ? '+in' : '') + (body.held ? '+held' : '');
        }
        Math.random = rnd;
        rigs.push({ kind: body.sp.id, off, mat, mode, beam, beamWas, tall: +tallOf.toFixed(2),
          frames: A.frames, beamWood: A.beamWood, onFeet: A.onFeet,
          air: A.air, hops: A.hops, airIn: A.airIn, hopsIn: A.hopsIn, inside: A.inside, feetIn: A.feetIn,
          headIn: A.headIn, deep: +A.deep.toFixed(2), inRock: A.inRock, path: +A.path.toFixed(2),
          atColumn: A.atColumn, underBeam: A.underBeam, pops: A.pops, stands: A.stands, gone: A.gone,
          closest: +A.closest.toFixed(3), yEnd: +A.yEnd.toFixed(2), atEnd: A.stateEnd });
        W.set(x, beam, z, beamWas);
        g.creatures = crowdWas; g.herdCentres = herdWas;
        Object.assign(P, was); g.time = timeWas; g.updateEnv();
      }
    }
    const bad = rigs.filter((r) => r.error);
    /* the control that says the roof law is about material and not about a low
       ceiling: the same column at the same height, once of wood and once of a
       crown, the same body, the same draw. Counted where the block stands -- the
       frames off the floor of that column, and the arcs pushed off in it -- a crown
       over a hopper costs it none of them and a trunk over it costs it all of them. */
    const leafRigs = rigs.filter((r) => r.mat === LEAF);
    const twinOf = (r) => rigs.filter((q) => q.mat === TRUNK && q.kind === r.kind &&
      q.off === r.off && q.mode === r.mode)[0];
    const twinMissing = leafRigs.filter((r) => !twinOf(r)).length;
    /* the rigs the body starts inside the column of: the ones where a hop's room
       is decided, wood or crown */
    const underRigs = rigs.filter((r) => r.mode === 'under' && r.mat);
    /* the rigs where the block stands inside the body's own span: `off` counts
       cells over the surface the body stands on, and a body standing on that
       surface occupies [1, 1 + tall] cells above it, so the block is in the body
       itself for 0 < off < 1 + tall. These are the rigs "0 frames inside" could
       be paid for by a body that never arrived, so the rig says it arrived:
       `closest` is how near the body's own centre came to the centre of the
       nearest wood cell, and under 1 m of centre-to-centre is the body standing
       at the face of the block. Measured, the three of them came to 0.51 m,
       0.50 m and 0.54 m. */
    const inSpan = (r) => r.mat === TRUNK && r.mode === 'through' && r.off < 1 + r.tall;
    const driven = rigs.filter(inSpan).map((r) => r.closest);
    g.creatures = crowdWas; g.time = timeWas; Math.random = rnd; g.updateEnv();
    return { col: [x, gy, z], rigs, waterNear, builtNear, crowdNear, at: +timeWas.toFixed(2),
      error: bad.length ? 'beam cell not clear' : undefined, twinMissing,
      inside: rigs.reduce((s, r) => s + r.inside, 0), headIn: rigs.reduce((s, r) => s + r.headIn, 0),
      feetIn: rigs.reduce((s, r) => s + r.feetIn, 0), inRock: rigs.reduce((s, r) => s + r.inRock, 0),
      pops: rigs.reduce((s, r) => s + r.pops, 0), deep: Math.max(...rigs.map((r) => r.deep)),
      nearWood: rigs.filter((r) => inSpan(r) && r.closest < 1).length, driven,
      underAt: underRigs.map((r) => r.atColumn),
      air: rigs.map((r) => r.air), hops: rigs.map((r) => r.hops),
      airIn: rigs.map((r) => r.airIn), hopsIn: rigs.map((r) => r.hopsIn),
      leafAir: leafRigs.reduce((s, r) => s + r.air, 0), leafHops: leafRigs.reduce((s, r) => s + r.hops, 0),
      twinAir: leafRigs.reduce((s, r) => s + (twinOf(r) ? twinOf(r).air : 0), 0),
      twinHops: leafRigs.reduce((s, r) => s + (twinOf(r) ? twinOf(r).hops : 0), 0),
      leafAirIn: leafRigs.reduce((s, r) => s + r.airIn, 0), leafHopsIn: leafRigs.reduce((s, r) => s + r.hopsIn, 0),
      twinAirIn: leafRigs.reduce((s, r) => s + (twinOf(r) ? twinOf(r).airIn : 0), 0),
      twinHopsIn: leafRigs.reduce((s, r) => s + (twinOf(r) ? twinOf(r).hopsIn : 0), 0),
      stands: rigs.map((r) => r.stands), gone: rigs.map((r) => r.gone),
      path: +rigs.reduce((s, r) => s + r.path, 0).toFixed(1),
      frames: rigs.reduce((s, r) => s + r.frames, 0), woodFrames: rigs.reduce((s, r) => s + r.beamWood, 0),
      tall: tall.sp.id, short: short.sp.id, tallOf: +tall.tall.toFixed(2), shortOf: +short.tall.toFixed(2),
      woodId: TRUNK, leafId: LEAF };
  });
  check('a flat shelf, a tall walker and a short hopper were found to measure on, the beam cell was clear air, and the crown rig had its matching wood rig',
    !spanLaw.error && spanLaw.rigs.length === 8 && !spanLaw.twinMissing, spanLaw);
  check('the block stayed the material it was set as, wood or crown, so "never inside it" is not paid for by the block going away',
    spanLaw.woodFrames === spanLaw.frames, spanLaw);
  check('both animals were driven at the wood: every rig with a wood block in the body\u0027s own span came up against it, so "0 frames inside" is not paid for by a body that never got there',
    spanLaw.nearWood === spanLaw.driven.length && spanLaw.driven.length >= 3, spanLaw);
  check('a body on foot is not let inside wood with any part of itself, at the height of its own body',
    spanLaw.inside === 0 && spanLaw.deep === 0, spanLaw);
  check('in particular its head: the gate used to ask one cell over the surface, and the feet were in open air every frame',
    spanLaw.headIn === 0 && spanLaw.feetIn === 0, spanLaw);
  check('the wood did not become a wall to a body that fits under it: the short body still walks in the column it starts under, of wood or of crown, and every rig with the block a full cell over the body still goes through that column',
    spanLaw.underAt.length === 2 && spanLaw.underAt.every((n) => n > 0) &&
    spanLaw.rigs.filter((r) => r.mode === 'through' && r.off >= 3).every((r) => r.atColumn > 0), spanLaw);
  check('the wood did not become a wall the body is pinned against: the block over a tall body is walked under, and every body keeps travelling',
    spanLaw.rigs.every((r) => r.path > 3) &&
    spanLaw.rigs.filter((r) => r.kind === spanLaw.tall && r.off === 3).every((r) => r.atColumn > 0), spanLaw);
  check('refused the column it goes round it rather than freezing at it, and nothing is thrown across the shelf',
    spanLaw.rigs.every((r) => r.pops === 0 && r.stands < r.frames * 0.5) &&
    spanLaw.rigs.filter((r) => r.kind === spanLaw.tall).every((r) => r.gone > 100), spanLaw);
  check('the roof is asked of the material table and not of the height: the same block made of leaves lets this hopper an arc inside that column and the trunk lets it none',
    spanLaw.twinAirIn === 0 && spanLaw.leafAirIn > 20 && spanLaw.leafHopsIn > spanLaw.twinHopsIn, spanLaw);
  check('none of them ended up inside rock or water either',
    spanLaw.inRock === 0, spanLaw);


  /* 11i3. Falling asleep is not a pass through the roof. The flock step asks what
     a bird does while it is abroad; this asks what it does while it is not. A
     bird at rest was held to no ceiling at all -- the exemption was written to
     keep a sleeping owl off the top of its own tree, and the height it was
     settling onto was read from six metres over the bird's own head, which is
     the one reading that finds the top of the tree. Over the 93 columns of this
     valley whose crowns reach 47, an owl put in the middle of the tallest of
     them was eased to y=48 in 18 frames and stood on the top of the world, head
     through the ceiling of the valley, wings folded, for 882 of the 900 frames
     of a morning -- and that is what the day soak of the valley was catching one
     run in a dozen. The floor is now the one an awake body reads, from the
     body's own cell and down, and the ceiling answers last asleep or awake: the
     same bird is held at 46.25, and a bird put under a crown at 45 settles onto
     the crown at 34 rather than being lifted through it. */
  const asleep = await step('birdsKeepTheRoofOverTheirBed', () => {
    const N = window.FRUTARIA, g = window.game, p = g.player, W = g.world;
    // a crown that reaches the top of the world: the top of the column is leaves,
    // and there is less than a body's height of sky left over it
    let spot = null;
    for (let z = 8; z < W.d - 8 && !spot; z++) for (let x = 8; x < W.w - 8; x++) {
      const surf = N.groundY(W, x, z, W.h - 1);
      if (surf < W.h - 3 || surf > W.h - 1) continue;
      if (!N.TREE_BLOCK[W.get(x, surf - 1, z)]) continue;
      spot = { x: x + 0.5, z: z + 0.5, top: surf - 1 };
      break;
    }
    if (!spot) return { error: 'no crown reaching the top of the world anywhere in the map' };
    const owl = g.creatures.find(c => c.sp.id === 'owl');
    if (!owl) return { error: 'no owl in the valley' };
    const body = { x: owl.x, y: owl.y, z: owl.z, yaw: owl.yaw, vy: owl.vy, state: owl.state,
      pause: owl.pause, tx: owl.tx, tz: owl.tz, homeX: owl.homeX, homeZ: owl.homeZ,
      flyY: owl.flyY, speed: owl.speed, t: owl.t, climbTo: owl.climbTo, climbRate: owl.climbRate };
    const was = { x: p.x, y: p.y, z: p.z, form: p.form };
    const night0 = g.night;
    p.form = null; p.x = 4; p.z = 4; p.y = W.h - 2;      // nobody to run from
    owl.x = spot.x; owl.z = spot.z; owl.y = spot.top - 1;
    owl.homeX = owl.x; owl.homeZ = owl.z;
    owl.tx = owl.x; owl.tz = owl.z; owl.pause = 1e9;     // it stays put: only the
    owl.state = 'wander'; owl.vy = 0;                    // height is under test
    g.night = 0;                                         // a day: an owl sleeps
    // the ceiling the flight code itself works with
    const ceil = (W.h - 1) - owl.tall - 0.05;
    let over = 0, aboveAir = 0, inRock = 0, yMax = -1, asleepFrames = 0;
    for (let i = 0; i < 60 * 15; i++) {
      owl.update(1 / 60, p, W, g);
      if (owl.state === 'roost') asleepFrames++;
      const cell = W.get(Math.floor(owl.x), Math.floor(owl.y), Math.floor(owl.z));
      if (W.solidAt(Math.floor(owl.x), Math.floor(owl.y), Math.floor(owl.z)) && !N.TREE_BLOCK[cell]) inRock++;
      if (owl.y > ceil) over++;
      if (owl.y > W.h - 1) aboveAir++;
      if (owl.y > yMax) yMax = owl.y;
    }
    const out = { spot, ceil: +ceil.toFixed(2), over, aboveAir, inRock, asleepFrames,
      yMax: +yMax.toFixed(2), yEnd: +owl.y.toFixed(2), tall: +owl.tall.toFixed(2),
      ground: N.terrainY(W, Math.floor(owl.x), Math.floor(owl.z), W.h - 1) };
    g.night = night0;
    Object.assign(owl, body);
    Object.assign(p, was);
    return out;
  });
  check('a bird at rest is not lifted through the crown it sleeps in, or out of the world',
    !asleep.error && asleep.asleepFrames === 900 && asleep.over === 0 && asleep.aboveAir === 0, asleep);
  check('and it is still in the tree it went to sleep in, not on the ground under it',
    !asleep.error && asleep.inRock === 0 && asleep.yEnd > asleep.ground + 5, asleep);

  /* 11i4. A hop is an arc, and an arc has a top. The launch of one was asked
     about the ground under the body's feet and nothing about what was over its
     head. The twelve frogs of Mirrorlake walk in and out of the hollow shaft of
     the sunken tower -- brick floor at 11, the tower's glass a metre over it --
     and one of them pushed off there: 0.27 m in a single frame into the glass,
     then lifted out of the wall at 0.1 m a frame for 28 frames. The day soak of
     the valley caught a frog inside the tower's masonry one run in six, and
     nothing else in the suite could see it at all. A hop of 6 m/s under this
     world's gravity reaches 0.78 m over the feet, and a frogpear stands 0.43 m
     tall, so a cavity a metre tall has no hop in it: the body walks. */
  const lowRoof = await step('frogDoesNotHopThroughItsOwnCeiling', () => {
    const N = window.FRUTARIA, g = window.game, p = g.player, W = g.world;
    // a cavity to stand in with a hard ceiling one block over the floor
    const hard = (x, y, z) => W.solidAt(x, y, z) && !N.TREE_BLOCK[W.get(x, y, z)];
    let spot = null;
    for (let z = 8; z < W.d - 8 && !spot; z++) for (let x = 8; x < W.w - 8 && !spot; x++)
      for (let y = 10; y < W.h - 4; y++) {
        if (!hard(x, y - 1, z) || W.solidAt(x, y, z) || W.liquidAt(x, y, z)) continue;
        if (!hard(x, y + 1, z)) continue;                     // the ceiling is right overhead
        if (N.standY(W, x, z, y) !== y) continue;             // and this is the floor
        spot = { x: x + 0.5, z: z + 0.5, floor: y };
        break;
      }
    if (!spot) return { error: 'no cavity with a ceiling one block over its floor in the map' };
    const frog = g.creatures.find(c => c.sp.id === 'frog');
    if (!frog) return { error: 'no frog in the valley' };
    const body = { x: frog.x, y: frog.y, z: frog.z, yaw: frog.yaw, vy: frog.vy, state: frog.state,
      pause: frog.pause, tx: frog.tx, tz: frog.tz, homeX: frog.homeX, homeZ: frog.homeZ,
      speed: frog.speed, t: frog.t, hopT: frog.hopT, wind: frog.wind, climbTo: frog.climbTo,
      climbRate: frog.climbRate };
    const was = { x: p.x, y: p.y, z: p.z, form: p.form };
    p.form = null; p.x = 4; p.z = 4; p.y = W.h - 2;           // nobody to run from
    frog.x = spot.x; frog.z = spot.z; frog.y = spot.floor;
    frog.homeX = frog.x; frog.homeZ = frog.z;
    frog.state = 'wander'; frog.pause = 1e9; frog.vy = 0;
    frog.hopT = 0.2; frog.wind = 0;                           // the push-off is due now
    frog.tx = spot.x + 30; frog.tz = spot.z;                  // somewhere far to walk to
    let launches = 0, badLaunch = 0, inRock = 0, headThrough = 0, room0 = 0, roomAt = [];
    /* Instrumented for the soak flake that went red one run in three: a body
       on foot was found 52 frames with its feet cell solid and 21 frames with
       its head through the ceiling of the cavity it stood in, and it had pushed
       off in that cavity although the hop gate is min'd over the body's own
       column, which there is a rock. So the whole window is recorded: the
       height and the rate of it, the gate's state, the floor the standing code
       read, the blocks of the body's column, and the very ceiling the entity's
       hop gate reads -- its own column and the span the arc will cross, leaves
       excused by the material table, recomputed here the way it is computed
       there -- so a red run says in which frame the body was told there was
       room and in which frame the world gave it no place. The neighbours are
       recorded too: the bodies the world leaves standing are the only other
       things a frame may move this one with. */
    const hopUp = (frog.sp && frog.sp.hop && frog.sp.hop.up) || 6;
    const traj = [];
    for (let i = 0; i < 150; i++) {
      frog.update(1 / 60, p, W, g);
      const bx = Math.floor(frog.x), bz = Math.floor(frog.z), by = Math.floor(frog.y);
      // the ceiling over the body where it actually is, after the frame: the
      // sideways step and the push-off are decided in the same frame, and asking
      // about the column the body left asks the wrong question
      let roof = W.h;
      for (let k = by + 1; k < W.h; k++) if (hard(bx, k, bz)) { roof = k; break; }
      const room = roof - frog.y;
      // the ceiling the hop gate reads: the lowest of the cells its own column
      // and the span of the arc hold, from one cell over the feet up, with the
      // material table's excuse for leaves
      let gate = W.h;
      const fxx = Math.sin(frog.yaw), fzz = -Math.cos(frog.yaw);
      const span = Math.max(1, Math.ceil((frog.speed || 0) * hopUp / 23));
      for (let k = 0; k <= span; k++) {
        const gx2 = bx + Math.round(fxx * k), gz2 = bz + Math.round(fzz * k);
        for (let q = Math.floor(frog.y) + 1; q < W.h; q++)
          if (W.solidAt(gx2, q, gz2) && !N.FOLIAGE[W.get(gx2, q, gz2)]) { if (q < gate) gate = q; break; }
      }
      const near = [];
      for (const q of g.creatures) {
        if (q === frog) continue;
        const dx = q.x - frog.x, dz = q.z - frog.z;
        if (dx * dx + dz * dz < 2.25) near.push([q.sp.id, +q.x.toFixed(2), +q.y.toFixed(2), +q.z.toFixed(2)]);
      }
      traj.push({ f: i, x: +frog.x.toFixed(3), y: +frog.y.toFixed(4), z: +frog.z.toFixed(3),
        vy: +frog.vy.toFixed(3), st: frog.state, ct: frog.climbTo === null ? null : frog.climbTo,
        cr: +frog.climbRate.toFixed(2), wind: +frog.wind.toFixed(2), spd: +frog.speed.toFixed(3),
        roof, gate, gy: N.standY(W, bx, bz, frog.y), room: +room.toFixed(3),
        inR: hard(bx, by, bz) ? 1 : 0, head: frog.y + frog.tall > roof ? 1 : 0,
        col: [W.get(bx, by - 1, bz), W.get(bx, by, bz), W.get(bx, by + 1, bz), W.get(bx, by + 2, bz)],
        near });
      if (!room0) room0 = +room.toFixed(2);
      /* A push-off is only allowed where the arc it launches fits: 0.78 m over
         the feet for the 6 m/s the data gives a frogpear, over a body 0.43 m
         tall. 1.13 is that with a finger of slack. */
      if (frog.vy > 5.4) {
        launches++;
        if (roomAt.length < 4) roomAt.push(+room.toFixed(2));
        if (room < frog.tall + 0.7) badLaunch++;
      }
      if (hard(bx, by, bz)) inRock++;
      if (frog.y + frog.tall > roof) headThrough++;
    }
    const out = { spot, tall: +frog.tall.toFixed(2), room: room0, launches, badLaunch,
      roomAt, inRock, headThrough, state: frog.state, speed: +frog.speed.toFixed(2),
      wind: +frog.wind.toFixed(2), traj };
    Object.assign(frog, body);
    Object.assign(p, was);
    return out;
  });
  check('a body on foot does not push off into a ceiling it cannot reach through',
    !lowRoof.error && lowRoof.badLaunch === 0 && lowRoof.inRock === 0, lowRoof);
  check('and its body never passes through the ceiling of the place it is in',
    !lowRoof.error && lowRoof.headThrough === 0, lowRoof);

  /* 11j. A body the water holds up floats; it does not settle on the bottom.
     Every body in the water branch carried the same fixed downward pull,
     whatever it was made of: a frog let go of in mid-water sank at a terminal
     0.89 m/s, landed on the lakebed 3 m below, was reported standing on the
     bottom and stopped there -- a water animal that stopped moving sank. The
     wild frogs of the valley have always done the opposite: the creature step
     holds them under the surface and never through the bottom. One rule now, off
     one number: the water holds a body that breathes water at
     `floatLevel(surface, tall, hover)` -- the film of its own column, less the
     body's own height, less the depth its row asks for, all three in metres --
     clamped by the bottom, whether or not its feet
     happen to be on something -- and a wild frog, which is never still, rides a
     slow cycle of its own between that level and deeper water, so the level the
     water holds the body you wear at is the shallow end of the band a wild frog
     holds, and the two bodies are only expected to agree when the frog is up
     -- which is what brings a frog that has dived to
     the lakebed back up when the dive key comes off, and what keeps the dive a
     dive while the key is held. Whether the water can hold a body at all is a
     property of the place (the surface above the level the body would stand on),
     not of the body's distance to the surface: 183 columns of Mirrorlake are a
     one-block shelf, and a shelf is a bottom to stand on and push off from.
     Reading it off the body's own depth instead would switch the force law back
     and forth as the body crossed its own equilibrium and build a sawtooth out of
     nothing -- the bug this file was last fixing -- so the shelf case is measured
     for shivering as well as for standing. */
  const buoy = await step('waterHoldsWhatBreathesIt', () => {
    const N = window.FRUTARIA, g = window.game, p = g.player, W = g.world;
    const { lake, shelf } = window.__mv;
    if (!lake || !shelf) return { error: 'no open water or shore shelf to measure in' };
    const cx = Math.floor(lake.x), cz = Math.floor(lake.z);
    const wt = N.waterTop(W, cx, cz, W.h - 1);
    const bed = N.standY(W, cx, cz, wt);
    // the depth of the column in metres: the film is the top face of that cell
    if (wt + 1 - bed < 4) return { error: 'the open water is not deep enough to measure in' };
    const was = { form: p.form, formT: p.formT, formMax: p.formMax, x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, yaw: p.yaw,
      pitch: p.pitch, faceYaw: p.faceYaw, bank: p.bank, tilt: p.tilt, vital: p.vital, air: p.air,
      dry: p.dry, fright: p.fright, grounded: p.grounded };
    const place = (form, y, at) => {
      /* the form's own clock pinned too: a window that measures a body which
         reverts to human half way through is measuring a different body, and the
         numbers it prints would still look like a frog's */
      p.form = form; p.formT = 9999; p.formMax = 9999;
      p.vital = 10; p.dry = 0; p.fright = 0; p.air = 999;
      p.x = at.x; p.z = at.z; p.y = y;
      p.vx = p.vy = p.vz = 0; p.bank = 0; p.tilt = 0; p.faceYaw = 0; p.pitch = 0; p.grounded = false;
    };
    const glide = (secs, inp) => {
      const n = Math.round(secs * 60), ys = [];
      const tall = p.size()[1];
      /* the count starts from where the body actually is, not from whatever the
         flag happened to hold when the last window closed: the body has just been
         set down at a height by hand, and the first frame of the window answers
         the water question for it all over again */
      const wt0 = N.waterTop(W, Math.floor(p.x), Math.floor(p.z), W.h - 1);
      let gr = 0, wF = 0, wPrev = (wt0 >= 0 && p.y < wt0 + 1) ? 1 : 0;
      for (let i = 0; i < n; i++) {
        g.input = inp; g.particles.n = 0; g.hover = null;
        p.update(1 / 60, g.input, g);
        if (p.grounded) gr++;
        // how many times the frame changed its mind about whether this body is
        // in the water at all: the draw, the stroke of the legs and the speed the
        // body swims at all hang off that one flag
        const wNow = p.inWater ? 1 : 0;
        if (wNow !== wPrev) wF++;
        wPrev = wNow;
        ys.push(p.y);
      }
      // the last second on its own: is the body at rest, and how often did it change its mind
      const tail = ys.slice(-60);
      let rev = 0;
      for (let i = 1; i < tail.length - 1; i++) {
        const a = tail[i] - tail[i - 1], b = tail[i + 1] - tail[i];
        if (a > 1e-4 && b < -1e-4 || a < -1e-4 && b > 1e-4) rev++;
      }
      return { y: +p.y.toFixed(3), g: p.grounded ? 1 : 0, grPct: Math.round(gr / n * 100),
        headW: p.headWater ? 1 : 0, spd: +Math.hypot(p.vx, p.vz).toFixed(3),
        // the body's own eyes relative to the surface of its column: negative is
        // under the water, and it is the eyes and not the feet that decide what a
        // body standing in a lake can see over the surface of it
        eye: +(p.eyePos() - (wt0 + 1)).toFixed(3),
        // and how much of the body itself stands over the film at the end of the
        // window -- the complaint this answers is a whole body out of the water,
        // so it is the share of the body's own height, not a height, that has to
        // be pinned: 1.0 is a body standing on the lake with nothing of it in
        above: +(p.y + tall - (wt0 + 1)).toFixed(3),
        share: +((p.y + tall - (wt0 + 1)) / tall).toFixed(3),
        wFlips: wF,
        span: +(Math.max(...tail) - Math.min(...tail)).toFixed(4), rev };
    };
    const out = { wt, bed, hover: N.CREATURE_BY_ID[N.FRUIT_BY_ID.frogpear.creature].hover };
    place('frogpear', bed + 3, lake); out.tall = +p.size()[1].toFixed(3); out.mid = glide(10, {}); // let go of mid-water
    place('frogpear', wt + 0.6, lake); out.surf = glide(10, {});        // let go of at the surface
    place('frogpear', bed + 0.0001, lake); out.fromBed = glide(12, {}); // put on the bottom, left
    place('frogpear', bed + 3, lake);
    out.dive = glide(4, { sneak: true });                               // dived to the bottom...
    out.diveLet = glide(8, {});                                         // ...and the key came off
    place('frogpear', bed + 3, lake); out.up = glide(4, { jump: true });
    place(null, bed + 3, lake); out.human = glide(10, {});
    /* the same body let go of at the surface has to be given the time its own
       column asks for: a body that breathes air comes down at 0.82 m/s here, and
       the lake is 9 m deep at this column where it was 7, so a window fixed at
       ten seconds ended with the body still on its way down, 39 cm above the
       bottom it was meant to be resting on. */
    place(null, wt + 0.6, lake);
    out.humanSurf = glide(Math.max(10, Math.ceil((wt + 1 - bed) * 1.5)), {});
    place('frogpear', shelf.top + 0.0001, shelf); out.frogShelf = glide(3, {});
    place(null, shelf.top + 0.0001, shelf); out.humanShelf = glide(3, {});
    /* the valley's own frog, in the same column, as the other half of the claim:
       the level the water holds the body you wear at is the level it holds a
       wild one at, not a level this file invented for the player */
    const wild = g.creatures.filter(c => c.sp.id === 'frog')[0];
    if (!wild) return Object.assign(out, { error: 'no frog in the roster' });
    // and nobody for it to run from: a frightened frog leaves the water
    p.form = null; p.x = 4; p.z = 4; p.y = W.h - 2; p.vital = 10;
    const keep = { x: wild.x, y: wild.y, z: wild.z, yaw: wild.yaw, vy: wild.vy, state: wild.state,
      pause: wild.pause, tx: wild.tx, tz: wild.tz, homeX: wild.homeX, homeZ: wild.homeZ,
      sleeping: wild.sleeping, fright: wild.fright, held: wild.held, t: wild.t, speed: wild.speed,
      climbTo: wild.climbTo, climbRate: wild.climbRate };
    const herdWas = g.herdCentres && g.herdCentres.frog;
    if (g.herdCentres) g.herdCentres.frog = { x: lake.x, z: lake.z, n: 1 };
    wild.x = lake.x; wild.z = lake.z; wild.y = bed + 0.05; wild.vy = 0;
    wild.homeX = wild.x; wild.homeZ = wild.z; wild.state = 'wander'; wild.sleeping = false;
    wild.fright = 0; wild.pause = 9999;
    /* Two minutes and more, not ten seconds: a frog's dip runs on a cycle of its
       own, and that cycle is between forty seconds and two minutes long, so a
       short window catches one moment of it and calls it the whole of it. Over a
       whole cycle a frog holds a band of depths; the shallow end of that band is
       where the water holds a body that stops moving, which is what the body you
       wear does the moment it stops kicking. */
    let wLo = -1e9, wHi = 1e9;
    for (let i = 0; i < 8400; i++) {
      wild.tx = wild.x; wild.tz = wild.z;        // and no notion of walking off the column
      wild.update(1 / 60, p, W, g);
      if (wild.y > wLo) wLo = wild.y; if (wild.y < wHi) wHi = wild.y;
    }
    out.wild = { y: +wild.y.toFixed(3), x: +wild.x.toFixed(2), z: +wild.z.toFixed(2),
      shallow: +wLo.toFixed(3), deep: +wHi.toFixed(3) };
    if (g.herdCentres) g.herdCentres.frog = herdWas;
    Object.assign(wild, keep);
    Object.assign(p, was);
    return out;
  });
  /* The level the water holds a body at is a height, not a cell: the top face of
     the topmost water block, less the height of that body, less the depth a body
     of that kind hangs at. The float level used to be taken off the index
     of that block, which set every body the water holds a full block under the
     surface -- the wild frogs of Mirrorlake hover 30 cm down and 3 m down, and at
     (64.5,92.5) they were 1.3 m down and 4 m down, and the body you wear with
     them. And that depth used to be measured to the **feet**, which for a body
     half a metre tall left its head 20 cm out of the water: seen from the bank a
     floating frog was a cork with four legs under it, and the eyes of the body
     you wear -- 0.42 m up from its own feet -- sat 12 cm *above* the surface, so
     the animal built for the lake looked at the shore and never once into it.
     Measured to the crown, the whole body hangs in. The depth itself is the
     animal's, not the water's: 30 cm is what a body that has nothing to say -- a
     human, anything that has to come up for air -- hangs at, and the frog's own
     record says 1.6 m, because an animal built for a lake does not lie under the
     surface film. At (64.5,92.5), a surface of 15 and a bed top at 8, a frogpear
     let go of mid-water holds 12.9 -- feet 2.1 m down, back 1.6 m down, eyes 1.68
     m down -- and the valley's own frog in that same column holds 12.86 at the top
     of its dip and 8.13 at the bottom of it, which is the same animal hanging at
     the same depth. The body's own height still sets part of it, so a bigger
     water animal hangs deeper by exactly its own size and no new number is needed. */
  check('a body that breathes water and stops moving floats, it does not settle on the bottom',
    !buoy.error && buoy.mid.g === 0 && buoy.mid.y > buoy.bed + 1 && buoy.mid.headW === 1, buoy);
  check('and it hangs under the surface instead of floating on it: its own height down, plus ' +
        'the depth its own record says a body of that kind hangs at, and its eyes are in the water',
    !buoy.error && Math.abs(buoy.mid.y - (buoy.wt + 1 - buoy.tall - buoy.hover)) < 0.05 &&
    buoy.mid.headW === 1 && buoy.mid.eye < -0.2, buoy);
  check('and it comes to rest there: the height does not swing and it never changes its mind',
    !buoy.error && buoy.mid.span < 0.01 && buoy.mid.rev === 0 && buoy.mid.spd < 0.01, buoy);
  check('the water holds the body you wear at the level a wild frog floats at ' +
        'when its dip cycle brings it up',
    !buoy.error && Math.abs(buoy.mid.y - buoy.wild.shallow) < 0.2, buoy);
  check('and that wild frog holds a band of depths over its cycle, not one layer',
    !buoy.error && buoy.wild.shallow - buoy.wild.deep > 0.3, buoy);
  check('a body let go of at the surface stays at the surface instead of sinking through the lake',
    !buoy.error && buoy.surf.g === 0 && Math.abs(buoy.surf.y - buoy.wild.shallow) < 0.2, buoy);
  check('a body put on the lakebed and left alone gets off it',
    !buoy.error && buoy.fromBed.g === 0 && Math.abs(buoy.fromBed.y - buoy.wild.shallow) < 0.2, buoy);
  check('a body that asks to go down still reaches the lakebed, and the water takes it back when it stops asking',
    !buoy.error && buoy.dive.g === 1 && Math.abs(buoy.dive.y - buoy.bed) <= 0.01
    && buoy.diveLet.g === 0 && Math.abs(buoy.diveLet.y - buoy.wild.shallow) < 0.25, buoy);
  /* The water's hold has a top, and it is not the surface: a body the water is
     holding cannot kick itself out of the middle of a lake. It leaves the way a
     body leaves water -- into the shallows where the bottom is, and up off its own
     feet from there, which is the route the branch in entities.js already
     documents. Without a ceiling a frog holding the climb key at the surface of
     (56.5,94.5) crossed that surface 45 times in 240 frames, and every crossing
     took the stroke off its legs and put it back on again: seen from the bank, its
     feet flickered.
     The ceiling is the surface less half the body, which is not the same thing as
     the level the water holds a resting body at. Those two were one number only
     because that level was measured to the feet and happened to land just under
     the surface; now a body hangs its own height down, and a ceiling taken from
     the level would mean a frog holding the climb key could never bring its head
     to the top of the water at all. So the level is where a body that stops moving
     comes to rest, the ceiling is how high a body that keeps asking can get, and
     between the two a body swims: the key held for 4 s over a column 7 m deep
     leaves the feet 25 cm under the film, half of a 50 cm body over the water and
     the eyes 17 cm over it, and the moment the key comes off the water takes the
     body back down to the level it holds it at. Half the body because a body that
     has worked half of itself out of the water is no longer being held up by
     water at all -- it is standing on a surface that is not there. The old
     ceiling, the surface less a hair, put the feet at 14.98 against a surface of
     15, which for that body is 96% of it over the lake: a frog standing on open
     water, which is what the player saw and asked to have stopped. The ceiling is
     asked of where the frame is about to put the body rather than of where the
     body stands: with the old test, which asked where the body stood, the surface
     of (64.5,92.5) was crossed twice in 240 frames with the key held, and every
     crossing took the body out of the water branch and put it back in. */
  check('the climb key brings the head out of the water, and the water stops the body ' +
        'half of itself under the surface: it cannot stand on the middle of a lake',
    !buoy.error && buoy.up.headW === 0 && buoy.up.g === 0 && buoy.up.eye > 0.1 &&
    Math.abs(buoy.up.y - (buoy.wt + 1 - buoy.tall * 0.5)) < 0.05 &&
    buoy.up.share <= 0.52 && buoy.up.share > 0.4, buoy);
  /* and the flag the draw hangs off does not relay. `inWater` used to be put to
     the cells -- is the cell at the body's feet liquid, is the one at its middle
     -- and a body bobbing across its own surface answered that a different way
     every frame: at (56.5,14.9,94.5) a frog pushed up by its own push key changed
     its mind 42 times in 240 frames, and with it the whole water branch of its
     movement, its cruising speed of 4.65 or 4.23, and the stroke of its legs,
     which snapped 0.19 m out and back again every few frames. The surface of the
     column is a property of the place, not of where the body happens to sit in
     it, which is the same reason `heldUp` reads the column and not the body. */
  check('and the water does not flicker on and off a body sitting at its surface',
    !buoy.error && buoy.mid.wFlips === 0 && buoy.surf.wFlips === 0 && buoy.up.wFlips === 0, buoy);
  check('a body that breathes air is not held up: left alone it comes to rest on the bottom',
    !buoy.error && buoy.human.g === 1 && Math.abs(buoy.human.y - buoy.bed) <= 0.01
    && buoy.humanSurf.g === 1, buoy);
  check('a one-block shore shelf is still a bottom to stand on, for both bodies, and neither shivers on it',
    !buoy.error && buoy.frogShelf.grPct === 100 && buoy.humanShelf.grPct === 100
    && buoy.frogShelf.span < 0.002 && buoy.humanShelf.span < 0.002
    && buoy.frogShelf.rev === 0 && buoy.humanShelf.rev === 0, buoy);

  /* 11k. A body on foot and the ground under it. Two things the animals did that
     the player's own body never does.
     (a) Nothing holds a body up but the ground, so when the ground leaves, the
     body falls. The animals' height used to be lerped onto whatever the column
     said, which is an elevator that runs fastest the moment it starts: walked a
     bear off a cliff where the ground falls 17 m within one metre, it came down
     6.8 m in the first 0.1 s -- 81 m/s, easing the rest of the way to a stop --
     and finished the drop standing on a tree 5 m above the valley floor, where
     it stopped moving and spent the rest of the run.
     (b) `groundY` answers "the highest solid thing in this column", and a crown
     is solid, so foliage at feet level read as a step: the bear took the step,
     found the next block of the same crown at its new feet, took that one too,
     and climbed the tree. Over a day, 22061 of one bear's 25200 frames were
     spent standing on leaves, 12 m above the ground, going up 105 m and back
     down 114 m riding the crowns along the ridge.
     A body on foot stands on the ground with the crown over it ignored, read at
     the height of its feet rather than from the top of the column, and falls
     under gravity when that is not there -- the same gravity, the same terminal
     speed and the same landing squash the player's body and a hopping frog use.
     The same ledge after: 16 m in 1.17 s, the speed rising from nothing to
     26.8 m/s, arriving with a squash of 0.3 and walking on. */
  /* 11j2. A bird crossing open water keeps the height the law asks for. The floor
     a flying body holds a few metres above is read from its own cell down over
     land -- `groundY`, the top face of the ground -- and over the lake it used to
     be read as the index of the topmost water cell. Those two answers are a block
     apart, so the floor over water came out a metre under the film: the hard floor
     the law puts under a hunting body -- 1.6 m over whatever it is crossing -- sat
     0.6 m above the water, and the body rides a further bob of 0.9 m on top of
     that floor, so the lowest it ever came was 0.3 m under the film, which the
     step gate then held at the film itself. Six birds put over Mirrorlake for a
     night spent 247 of 12895 samples with their feet on the film (lowest height
     over the water 0 m, mean 3.72 m); the same six after spend no sample there
     (lowest 0.89 m, mean 5.61). The step measures one body with the hunt asked to
     want low, so that the only thing holding it up is the floor this is about:
     lowest height over the film **0 m** (p10 0.02, median 1.0) before, **0.78 m**
     (p10 0.96, median 2.17) after -- the floor 1.6 m less the 0.9 m bob, to 8 cm. */
  const skim = await step('aBirdOverWaterKeepsItsHeight', () => {
    const N = window.FRUTARIA, g = window.game, W = g.world, p = g.player;
    const { lake } = window.__mv;
    if (!lake) return { error: 'no open water to measure over' };
    const surf = W.liquidSurfaceAt(Math.floor(lake.x), Math.floor(lake.z));
    if (surf < 0) return { error: 'the open water has no surface' };
    const bird = g.creatures.filter(c => c.isFlyer() && !c.sleeping)[0];
    if (!bird) return { error: 'no flying body in the valley' };
    const keepP = { x: p.x, y: p.y, z: p.z, vital: p.vital };
    const keepT = { time: g.time, night: g.night };
    const keep = { x: bird.x, y: bird.y, z: bird.z, homeX: bird.homeX, homeZ: bird.homeZ,
      flyY: bird.flyY, state: bird.state, sleeping: bird.sleeping, pause: bird.pause,
      t: bird.t, phase: bird.phase, yaw: bird.yaw, tx: bird.tx, tz: bird.tz, vy: bird.vy,
      huntH: bird.huntH };
    /* An owl asleep is a bird on a branch, not a bird hunting: a sleeping body is
       asked to settle onto the floor under it, which is a different question. The
       ceiling is put well above the head so what is being measured is the floor. */
    g.time = 21 * 60; g.night = 1;
    bird.x = lake.x; bird.z = lake.z; bird.y = surf + 6;
    bird.homeX = bird.x; bird.homeZ = bird.z; bird.flyY = surf + 12;
    bird.state = 'wander'; bird.sleeping = false; bird.pause = 0; bird.vy = 0;
    /* The height a hunting body asks for is the higher of a floor the law puts
       under it -- 1.6 m over whatever it is crossing -- and a hunt height of its
       own, which is dealt out between 2.6 and 6 m and rides a sine of its own
       with an 18 s period. Left alone, the hunt term wins most frames and the
       floor is never exercised: a first version of this step measured the hunt
       and passed with the floor still a block under the film. So the hunt is
       asked to want low, and the only thing left holding the body up is the
       floor this is about. */
    bird.huntH = -2;
    p.x = 4; p.z = 4; p.y = W.h - 2; p.vital = 10;
    const hs = [];
    let offWater = 0, inRock = 0, inWater = 0;
    /* Two full periods of the hunt sine, not one window: the hard floor under a
       hunting body only binds at the bottom of that sine, and its period is about
       18 s, so a 15 s window measures whichever phase the body happened to start
       in -- which is how a first version of this step passed with the floor still
       a block under the film. */
    for (let i = 0; i < 3600; i++) {
      bird.update(1 / 60, p, W, g);
      const bx = Math.floor(bird.x), bz = Math.floor(bird.z);
      const s = W.liquidSurfaceAt(bx, bz);
      if (s < 0) { offWater++; continue; }   // it left the lake; the ground is its floor
      /* Well inside the lake, not at its edge: a body on its way down to the shore
         is being asked for the height of the ground it is landing on, and that
         number has nothing to do with the floor over water. */
      /* Open water: nothing solid at or above the film. The sunken tower stands
         inside the lake, and over it the floor the law works from is the top of
         the tower, which is a perfectly good floor and not the one this asks about. */
      if (N.groundY(W, bx, bz, W.h - 1) >= s) { offWater++; continue; }
      const wy = Math.floor(s) - 1;   // the topmost water *cell*: the film is its top face
      if (!W.liquidAt(bx - 1, wy, bz) || !W.liquidAt(bx + 1, wy, bz) ||
          !W.liquidAt(bx, wy, bz - 1) || !W.liquidAt(bx, wy, bz + 1)) { offWater++; continue; }
      hs.push(bird.y - s);
      if (bird.y < s) inWater++;
      if (W.solidAt(bx, Math.floor(bird.y), bz)) inRock++;
    }
    hs.sort((a, b) => a - b);
    const n = hs.length;
    Object.assign(bird, keep);
    Object.assign(p, keepP);
    g.time = keepT.time; g.night = keepT.night;
    if (n < 300) return { error: 'the body left the water too often', n, offWater };
    return { tall: +bird.tall.toFixed(2), n, offWater, surf, min: +hs[0].toFixed(2),
      p10: +hs[Math.floor(n * 0.1)].toFixed(2), median: +hs[n >> 1].toFixed(2),
      inWater, inRock };
  });
  /* 1.6 m is what the law puts under a hunting body over the floor it is crossing;
     the ease that closes on that height and the sine of the hunt are allowed 0.3 m
     of it, which is what the 0.45 m the check asks for is made of. */
  check('a bird crossing open water holds the height the law asks for above the film, ' +
        'not a block less than that',
    !skim.error && skim.min > 0.45 && skim.p10 > 0.6 && skim.median > 1.2 &&
    skim.median < 3 && skim.inWater === 0 && skim.inRock === 0, skim);

  /* A body in the air pays for height out of the speed it has. The height a
     flying body wants is eased, and an ease closes a distance at a rate
     proportional to the distance left: when the floor under the body drops away
     -- the lip of the valley, the edge of a ridge -- the height it wants drops
     with it and the answer is a dive. Measured over two days and 302,394 frames
     of flight, the height rate reached 26.8 m/s (p99 9.7, p50 0.63) for a body
     whose own row gives it 7 m/s of air speed and which crosses the valley at
     2.94: 6,000 frames were faster than the animal can fly, and 1,841 fell more
     than four times faster than they went forward. The fastest part of such a
     drop takes a tenth of a second, which is shorter than the attitude (eased at
     4.5/s) and the wing beat (3.5/s) need to follow, so the owl came down with
     its nose level and its wings still on the beat: from the bank, a stone. */
  const stone = await step('aBirdDoesNotDropFasterThanItCanFly', () => {
    const N = window.FRUTARIA, g = window.game, W = g.world, p = g.player;
    const bird = g.creatures.filter(c => c.isFlyer() && !c.sleeping)[0];
    if (!bird) return { error: 'no flying body in the valley' };
    /* A body is not a point and leaves are not a wall: the flock step asks the
       same question and excludes the blocks a tree is made of, so this does too. */
    const hard = (x, y, z) => W.solidAt(x, y, z) && !N.TREE_BLOCK[W.get(x, y, z)];
    /* A patch of open sky to let the bird down through: 13 columns each way whose
       floors are all within two rows of one height and whose 16 blocks over them
       hold nothing a body cannot pass through. The bird is put in the middle of
       it and the window closes when it reaches the height the law asks for, so
       what is measured is the drop and not the wood it may later fly into.
       The strip the errand flies down belongs to that patch. The body is sent
       11.5 m east of the middle, and a floor that rises under it on the way is a
       floor it is asked to climb -- the height law holds a hunting body over
       whatever is under it -- so it never reaches the height this window waits
       for, and the settle loop then measures a bird standing outside the patch.
       Widening the lake shuffles the tree line (the planter keeps a wider ring
       off the water) and the first patch the scan finds moved from (108,24,28)
       to (108,24,26): flat for 6 m each way, then y33 at x=118, and the step read
       900 frames and 1 m given up for a body asked to fall 8.5. The floors are
       now held within two rows of the middle's height over the whole strip, which
       is what this comment has always said they were; the patch that answers is
       (122,23,86). */
    const open = (x, z) => {
      if (W.liquidSurfaceAt(x, z) >= 0) return false;      // over water the film is the floor
      const t = N.groundY(W, x, z, W.h - 1);
      if (t < 20 || t > 30) return false;
      for (let y = t + 1; y <= t + 16; y++) if (hard(x, y, z)) return false;
      return true;
    };
    let sx = -1, sz = -1, top = 0;
    for (let z = 20; z < W.d - 20 && sx < 0; z += 2) {
      for (let x = 20; x < W.w - 20; x += 2) {
        if (!open(x, z)) continue;
        const t = N.groundY(W, x, z, W.h - 1);
        const same = (xx, zz) => open(xx, zz) && Math.abs(N.groundY(W, xx, zz, W.h - 1) - t) <= 2;
        let all = true;
        for (let dz = -6; dz <= 6 && all; dz += 2)
          for (let dx = -6; dx <= 12; dx += 2) if (!same(x + dx, z + dz)) { all = false; break; }
        if (!all) continue;
        sx = x; sz = z; top = t; break;
      }
    }
    if (sx < 0) return { error: 'no open sky to let a bird down through' };
    const keepP = { x: p.x, y: p.y, z: p.z, vital: p.vital };
    const keepT = { time: g.time, night: g.night };
    const keep = { x: bird.x, y: bird.y, z: bird.z, homeX: bird.homeX, homeZ: bird.homeZ,
      flyY: bird.flyY, state: bird.state, sleeping: bird.sleeping, pause: bird.pause,
      t: bird.t, phase: bird.phase, yaw: bird.yaw, tx: bird.tx, tz: bird.tz, vy: bird.vy,
      huntH: bird.huntH, speed: bird.speed, tilt: bird.tilt, flap: bird.flap };
    g.time = 21 * 60; g.night = 1;
    bird.x = sx + 0.5; bird.z = sz + 0.5; bird.y = top + 14;
    bird.homeX = bird.x; bird.homeZ = bird.z; bird.flyY = top + 20;
    bird.state = 'wander'; bird.sleeping = false; bird.pause = 0; bird.vy = 0;
    bird.huntH = 2.6; bird.tilt = 0;
    /* the two sines that move the height a flying body wants are its own beat and
       its own hunt, both keyed on `t` and a `phase` dealt out at spawn: pinned so
       the height it settles at is the law's, not the phase it happened to be born
       with */
    bird.phase = 0; bird.t = 0;
    /* The errand is pinned for the length of the drop, and the body is held over
       the same open patch while it settles. A body with nowhere to go hovers, and
       a hovering body covers no ground: on an unchanged game this step read
       **1.34**, **1.10** and **0.60** m of ground for the same 8.5 m of height,
       because the unseeded errand pick sometimes sent the bird off across the
       patch and sometimes left it beating its wings on the spot -- and the settle
       loop measured the heights over whatever ground the bird happened to be over,
       leaving the patch in up to 256 of its 600 frames. What is asked here is what
       the height law does to a body that is going somewhere, so the
       going-somewhere part is stated rather than hoped for. */
    bird.pause = 30; bird.tx = sx + 11.5; bird.tz = sz + 0.5;
    p.x = 4; p.z = 4; p.y = W.h - 2; p.vital = 10;
    const flySpeed = bird.sp.flySpeed || bird.sp.speed || 3;
    const dt = 1 / 60;
    /* The drop: from the moment it is put up there to the moment the height the
       law asks for is reached. How fast it went down, how much ground it covered
       on the way, how far its nose got round, and whether it was ever inside
       anything it cannot pass through. */
    let maxRate = 0, down = 0, ground = 0, inRock = 0, tiltMax = 0, frames = 0;
    let px = bird.x, pz = bird.z, py = bird.y;
    const y0 = bird.y;
    while (frames < 900 && bird.y - top > 5.5) {
      bird.update(dt, p, W, g);
      frames++;
      const v = Math.abs(bird.y - py) / dt;
      if (v > maxRate) maxRate = v;
      ground += Math.hypot(bird.x - px, bird.z - pz) / dt * dt;
      down += Math.max(0, py - bird.y);
      tiltMax = Math.max(tiltMax, Math.abs(bird.tilt || 0));
      px = bird.x; pz = bird.z; py = bird.y;
      if (hard(Math.floor(bird.x), Math.floor(bird.y), Math.floor(bird.z))) inRock++;
    }
    const arrived = +(bird.y - top).toFixed(2);
    /* the height actually given up, not the sum of every downward frame: a body
       riding the bob of its own wings goes down, up and down again, and the sum
       counted 16.5 m of downward motion for a body that came down 8.5 */
    const lost = y0 - bird.y;
    const drop = { frames, lost: +lost.toFixed(1), down: +down.toFixed(1), ground: +ground.toFixed(1) };
    /* and the height it settles at once the drop is over: the cap is not allowed
       to leave the body hanging 14 m above the floor it was asked for. Only the
       frames over the same open patch count -- past it, the height a bird crosses
       is the wood it flew into, which is a different question. */
    /* let it settle before it is measured: the height it comes to is reached by
       an ease, and the first seconds of that are still the drop being finished */
    for (let i = 0; i < 300; i++) {
      bird.pause = 30; bird.tx = bird.x; bird.tz = bird.z;
      bird.update(dt, p, W, g);
    }
    const hs = [];
    let left = 0;
    /* one whole period of the hunt sine (2*pi/0.35 = 18 s of the body's clock), so
       the median is the middle of the band the law deals out rather than wherever
       a shorter window happened to fall in it */
    for (let i = 0; i < 1080; i++) {
      bird.pause = 30; bird.tx = bird.x; bird.tz = bird.z;   // held over the patch, see the pin above
      bird.update(dt, p, W, g);
      const bx = Math.floor(bird.x), bz = Math.floor(bird.z);
      if (!open(bx, bz)) { left++; continue; }
      hs.push(bird.y - N.groundY(W, bx, bz, W.h - 1));
      if (hard(bx, Math.floor(bird.y), bz)) inRock++;
    }
    hs.sort((a, b) => a - b);
    Object.assign(bird, keep);
    Object.assign(p, keepP);
    g.time = keepT.time; g.night = keepT.night;
    /* A step reports, it does not throw: with too few frames measured the percentiles
       below are not numbers at all, and the whole suite died on a `toFixed` of
       undefined rather than saying what it had found. */
    if (hs.length < 200) return { error: 'the body left the open patch before its height could be measured',
      n: hs.length, left, spot: [sx, top, sz], arrived, drop };
    return { flySpeed, maxRate: +maxRate.toFixed(2), tiltMax: +tiltMax.toFixed(2),
      drop, arrived, glide: +(ground / Math.max(0.001, lost)).toFixed(2), inRock,
      n: hs.length, left, low: +hs[0].toFixed(2), median: +hs[hs.length >> 1].toFixed(2),
      high: +hs[hs.length - 1].toFixed(2), spot: [sx, top, sz] };
  });
  check('a flying body never loses height faster than the air speed its own row gives it',
    !stone.error && stone.maxRate <= stone.flySpeed, stone);
  check('the drop is a glide over ground and not a fall through it: it covers at least ' +
        'as much ground as height',
    !stone.error && stone.glide >= 0.6 && stone.drop.lost > 6, stone);
  check('and it still comes to the height the law asks for, outside the rock',
    !stone.error && stone.arrived <= 5.5 && stone.arrived > 1 && stone.median > 1.2 &&
    stone.median < 7 && stone.inRock === 0 && stone.n > 200, stone);
  const footing = await step('aBodyOnFootFalls', () => {
    const g = window.game, W = g.world, N = window.FRUTARIA, p = g.player;
    const bear = g.creatures.find(c => c.sp.id === 'bear');
    if (!bear) return { error: 'no bear in the roster' };
    const was = { x: bear.x, y: bear.y, z: bear.z, yaw: bear.yaw, vy: bear.vy, squash: bear.squash,
      state: bear.state, pause: bear.pause, tx: bear.tx, tz: bear.tz, homeX: bear.homeX, homeZ: bear.homeZ };
    // a cliff the ground falls off within one metre of where the body is standing
    let edge = null;
    for (let z = 12; z < W.d - 12 && !edge; z++) {
      for (let x = 12; x < W.w - 12 && !edge; x++) {
        const a = N.terrainY(W, x, z, W.h - 1), b = N.terrainY(W, x + 1, z, W.h - 1);
        if (a - b >= 6 && !W.solidAt(x, a, z) && !W.solidAt(x + 1, b, z)) edge = { x, z, top: a, low: b };
      }
    }
    if (!edge) { Object.assign(bear, was); return { error: 'no cliff in the valley' }; }
    const px = edge.x + 0.5, pz = edge.z + 0.5;
    bear.x = px; bear.y = edge.top; bear.z = pz; bear.yaw = Math.PI / 2;
    bear.vy = 0; bear.squash = 0; bear.state = 'wander'; bear.pause = 999;
    bear.tx = px + 12; bear.tz = pz; bear.homeX = px; bear.homeZ = pz;
    const t0 = g.time; g.time = 420 * 21 / 24; g.updateEnv();
    const dt = 1 / 60;
    let airT = 0, vPeak = 0, first = 0, last = 0, landed = null, sq = 0;
    for (let i = 0; i < 400; i++) {
      const y0 = bear.y;
      bear.update(dt, p, W, g);
      const gy = N.terrainY(W, Math.floor(bear.x), Math.floor(bear.z), W.h - 1);
      const v = (y0 - bear.y) / dt;
      if (bear.y > gy + 0.05) {
        if (!airT) first = v;
        airT += dt; last = v; vPeak = Math.max(vPeak, v);
      } else if (airT > 0 && !landed) {
        landed = { drop: +(edge.top - gy).toFixed(1), airT: +airT.toFixed(2), vPeak: +vPeak.toFixed(1),
          vAvg: +((edge.top - gy) / airT).toFixed(1), first: +first.toFixed(1), last: +last.toFixed(1) };
        sq = +bear.squash.toFixed(2);
      }
      if (landed && bear.x - px > 6) break;
    }
    g.time = t0; g.updateEnv();
    const out = { at: [edge.x, edge.z], top: edge.top, low: edge.low, landed, squash: sq,
      end: { y: +bear.y.toFixed(2), ground: N.terrainY(W, Math.floor(bear.x), Math.floor(bear.z), W.h - 1) } };
    Object.assign(bear, was);
    return out;
  });
  check('a body on foot falls when the ground under it goes',
    !!footing.landed && footing.landed.drop >= 5 && footing.landed.airT >= 0.45, footing);
  check('it speeds up as it falls, rather than starting at the speed and easing away',
    !!footing.landed && footing.landed.last > footing.landed.first &&
    footing.landed.vPeak <= 2.4 * footing.landed.vAvg, footing);
  check('it arrives on the ground at the bottom, not half way down',
    !!footing.landed && Math.abs(footing.end.y - footing.end.ground) < 0.1, footing);
  check('and it arrives with the squash every other landing body makes',
    !!footing.landed && footing.squash > 0.1, footing);

  /* A body that swims into the shallower part of the lakebed. The step test lets
     a body into a column whose surface is above its feet -- a frog standing on
     the floor of a lake two blocks deeper than the shelf next door has its feet
     1.6 m under that shelf -- and the altitude then has to get it out again. The
     frog's branch used to answer that with a snap onto the surface: a body left
     1.5 m inside the shelf was moved to the top of it in a single frame, 90 m/s,
     and a day of the valley running caught a frog doing exactly that 1.6 m at a
     time. A step is a rate, and it is the same rate the body on foot uses --
     which is why the two animals now share one routine for feet, water and the
     ground. */
  const bank = await step('aBodyClimbsItsBank', () => {
    const g = window.game, W = g.world, N = window.FRUTARIA;
    let spot = null;
    for (let z = 8; z < W.d - 8 && !spot; z++) for (let x = 8; x < W.w - 8 && !spot; x++) {
      const wt = N.waterTop(W, x, z, W.h - 1);
      if (wt < 0) continue;
      const bed = N.groundY(W, x, z, wt);
      if (wt + 1 - bed < 3) continue;                    // deep enough to swim, not to wade
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const bed2 = N.groundY(W, x + dx, z + dz, W.h - 1);
        const wt2 = N.waterTop(W, x + dx, z + dz, W.h - 1);
        if (bed2 - bed === 2 && wt2 >= 0 && wt2 + 1 - bed2 >= 1)
          spot = { x: x + 0.5, z: z + 0.5, bed, wt, dx, dz, bed2, wt2 };
      }
    }
    if (!spot) return { error: 'no lakebed step' };
    const frog = g.creatures.find(c => c.sp.id === 'frog');
    const away = { x: -999, y: 0, z: -999, form: null, formDef: {} };
    const was = { x: frog.x, y: frog.y, z: frog.z, vy: frog.vy, state: frog.state, pause: frog.pause,
      tx: frog.tx, tz: frog.tz, yaw: frog.yaw, alarm: frog.alarm, airAmt: frog.airAmt,
      squash: frog.squash, speed: frog.speed, wind: frog.wind, hopT: frog.hopT };
    const run = (y0, x0, z0) => {
      Object.assign(frog, { x: x0, z: z0, y: y0, vy: 0, speed: 0, state: 'wander', pause: 0, alarm: 0,
        airAmt: 0, squash: 0, wind: 0, hopT: 0, yaw: Math.atan2(spot.dx, -spot.dz),
        tx: spot.x + spot.dx * 6, tz: spot.z + spot.dz * 6 });
      const r = { worst: 0, at: null, onShelf: 0 };
      for (let i = 0; i < 600; i++) {
        const y = frog.y;
        frog.update(1 / 60, away, W, g);
        const d = Math.abs(frog.y - y);
        if (d > r.worst) { r.worst = +d.toFixed(3); r.at = { f: i, y0: +y.toFixed(2), y1: +frog.y.toFixed(2) }; }
        if (frog.y >= spot.bed2 - 0.02) r.onShelf++;
      }
      r.end = { y: +frog.y.toFixed(2), x: +frog.x.toFixed(2), z: +frog.z.toFixed(2),
        gy: N.standY(W, Math.floor(frog.x), Math.floor(frog.z), frog.y),
        inSolid: W.solidAt(Math.floor(frog.x), Math.floor(frog.y + 0.2), Math.floor(frog.z)),
        inWater: W.liquidAt(Math.floor(frog.x), Math.floor(frog.y + 0.2), Math.floor(frog.z)) };
      return r;
    };
    const swim = run(spot.bed + 0.4, spot.x, spot.z);
    const stuck = run(spot.bed2 - 1.5, spot.x + spot.dx, spot.z + spot.dz);
    Object.assign(frog, was);
    return { spot, swim, stuck };
  });
  check('a lakebed that steps up two blocks under the water was found', !!bank.spot, bank);
  check('a frog swims up on to the shelf the lakebed steps on to', bank.swim.onShelf > 0, bank.swim);
  check('a body left inside the bank is not thrown out of it in one frame',
    bank.stuck.worst <= 0.4, bank.stuck);
  check('and it does get out, and is not left in the solid',
    !bank.stuck.end.inSolid, bank.stuck);
  check('no frame of the swim throws the body either', bank.swim.worst <= 0.4, bank.swim);

  /* ---- the valley stays inside itself ----
     A hundred seconds of the world running with nobody driving it. The question
     is not whether any animal did anything clever afterwards; it is whether any
     of them stopped being a body in a place. Every movement rule -- the arc
     steering, going round a wall, the water column, the hop -- writes x and z
     directly, and none of them had ever been watched for a minute at a time. */
  /* Death scatters the pack, and the whole point of scattering it rather than
     deleting it is that it is retrievable (docs/en/06 s6). The fruit used to
     stay a metre above the height the body died at: measured, from a lake shore
     all 8 landed under water and one of them 29 m down, and on a roof all 8 hung
     in the air, up to 3 m above the ground beside them. */
  const scatter = await step('deathScattersOnTheGround', () => {
    const g = window.game, W = g.world, N = window.FRUTARIA, p = g.player;
    const was = { x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, vital: p.vital, air: p.air,
      form: p.form, formT: p.formT, fright: p.fright, dead: p.dead, mode: g.mode,
      inv: g.inv, drops: g.drops, deaths: g.stats.deaths, log: g.log.length };
    // one column of each kind that used to lose the fruit
    const kinds = { canopy: null, deep: null, slope: null };
    for (let z = 10; z < W.d - 10 && Object.values(kinds).some(v => !v); z += 2) {
      for (let x = 10; x < W.w - 10 && Object.values(kinds).some(v => !v); x += 2) {
        const gy = N.groundY(W, x, z, W.h - 1), ty = N.terrainY(W, x, z, W.h - 1);
        const wt = N.waterTop(W, x, z, W.h - 1);
        if (!kinds.canopy && gy > ty + 3) kinds.canopy = [x, z];
        if (!kinds.deep && wt > 0 && wt + 1 - ty >= 3) kinds.deep = [x, z];   // metres of water over the ground
        if (!kinds.slope && Math.abs(N.terrainY(W, x + 2, z, W.h - 1) - ty) >= 4) kinds.slope = [x, z];
      }
    }
    const rows = {};
    for (const kind of Object.keys(kinds)) {
      const c = kinds[kind];
      if (!c) { rows[kind] = { missing: true }; continue; }
      p.x = c[0] + 0.5; p.y = N.terrainY(W, c[0], c[1], W.h - 1); p.z = c[1] + 0.5;
      p.vx = p.vy = p.vz = 0; p.dead = false; g.mode = 'play';
      const spot = { x: p.x, z: p.z };
      g.inv = [];
      for (let i = 0; i < 8; i++) g.addItem('fruit', 'owlberry');
      g.drops.length = 0;
      g.die('probe');
      const cls = g.drops.map(d => {
        const bx = Math.floor(d.x), bz = Math.floor(d.z), by = Math.floor(d.y);
        const gy = N.terrainY(W, bx, bz, W.h - 1), wSurf = W.liquidSurfaceAt(bx, bz);
        /* the surface a fruit is asked to come to rest at, in the units the game
           uses for it: both of these answers are heights, and `waterTop` answers
           the index of a cell -- a block under the film -- so comparing it against
           a height loses a metre to the ground in a column where a solid stands
           above the water's own top cell */
        const surf = wSurf >= gy ? wSurf : gy;
        return { inSolid: W.solidAt(bx, by, bz), off: Math.abs(d.y - surf),
          sunk: W.liquidAt(bx, by, bz), far: Math.hypot(d.x - spot.x, d.z - spot.z) };
      });
      rows[kind] = { at: c, drops: g.drops.length,
        inSolid: cls.filter(r => r.inSolid).length,
        offSurface: cls.filter(r => r.off > 0.05).length,
        worstOff: +Math.max(...cls.map(r => r.off)).toFixed(2),
        sunk: cls.filter(r => r.sunk).length,
        farthest: +Math.max(...cls.map(r => r.far)).toFixed(2) };
      if (g.ui) g.ui.showDead(false);
    }
    // the body, the pack and the valley go back the way they were
    Object.assign(p, { x: was.x, y: was.y, z: was.z, vx: was.vx, vy: was.vy, vz: was.vz,
      vital: was.vital, air: was.air, form: was.form, formT: was.formT, fright: was.fright, dead: was.dead });
    g.mode = was.mode; g.inv = was.inv; g.drops = was.drops; g.stats.deaths = was.deaths;
    g.log.length = was.log;
    return rows;
  });
  check('a death puts every fruit on a surface a body can walk back to',
    Object.values(scatter).every(r => r.missing ||
      (r.drops === 8 && !r.inSolid && !r.offSurface && !r.sunk && r.farthest <= 3.2)), scatter);

  /* 11l. Feet rest on the surface they are on, and a body at rest is a frame at
     rest. The contact plane used to be "the higher of the face and where the
     feet already were", which for a body standing on anything is the feet
     themselves: gravity pulled it down 6.4 mm a frame, the snap put it back half
     a millimetre above where it had been, and that is a 6 mm sawtooth about five
     times a second that never stops. The lens sits on the feet, so the whole
     frame rides it -- and it rides it hardest close to the lens, which is what
     the human reported: the blocks close to the lens shake. Measured at a wall
     2.5 m off, with nobody
     holding a key: 0.74% of the pixels within 2 m of the lens changed from one
     frame to the next (mean change 106 of 765), 0.52% at 5-15 m, nothing past
     15 m -- a shake that dies with distance is a moving lens, not a moving world. */
  const rest = await step('feetRestOnTheSurface', () => {
    const g = window.game, N = window.FRUTARIA, W = g.world, p = g.player, R = g.R, gl = R.gl;
    const was = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, vx: p.vx, vy: p.vy, vz: p.vz,
      form: p.form, vital: p.vital, air: p.air, dry: p.dry, fright: p.fright, grounded: p.grounded,
      input: g.input, time: g.time, mode: g.mode, frame: g._camFrame, lens: g._lens, env: g.env };
    const back = (r) => {
      Object.assign(p, { x: was.x, y: was.y, z: was.z, yaw: was.yaw, pitch: was.pitch,
        vx: was.vx, vy: was.vy, vz: was.vz, form: was.form, vital: was.vital, air: was.air,
        dry: was.dry, fright: was.fright, grounded: was.grounded });
      g.input = was.input; g.time = was.time; g.mode = was.mode;
      g._camFrame = was.frame; g._lens = was.lens; g.env = was.env;
      return r;
    };
    p.form = null; p.vital = 10; p.dry = 0; p.fright = 0; p.air = 999; g.mode = 'play';

    // dry flat ground with a one-block wall a step in front of it
    let spot = null;
    for (let x = 20; x < W.w - 20 && !spot; x++) for (let z = 20; z < W.d - 20 && !spot; z++) {
      const gy = N.standY(W, x, z, W.h - 1);
      if (W.solidAt(x, gy, z) || W.solidAt(x, gy + 1, z) || W.solidAt(x, gy + 2, z)) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!W.solidAt(x + dx, gy, z + dz) || W.solidAt(x + dx, gy + 1, z + dz)) continue;
        spot = { x: x + 0.5, y: gy, z: z + 0.5, yaw: Math.atan2(dx, -dz) };
        break;
      }
    }
    if (!spot) return back({ error: 'no dry ground with a one-block wall beside it' });

    const settle = (secs) => {
      p.x = spot.x; p.z = spot.z; p.y = spot.y + 0.4; p.yaw = spot.yaw; p.pitch = 0;
      p.vx = p.vy = p.vz = 0; p.grounded = false; p.faceYaw = spot.yaw;
      const ys = [];
      for (let i = 0; i < Math.round(secs * 60); i++) { g.input = {}; g.update(1 / 60); ys.push(p.y); }
      const tail = ys.slice(-Math.round(secs * 60 * 0.8));      // the drop has long ended
      let rev = 0, last = 0;
      for (let i = 1; i < tail.length; i++) {
        const d = tail[i] - tail[i - 1];
        if (Math.abs(d) > 1e-9) { if (last && Math.sign(d) !== Math.sign(last)) rev++; last = Math.sign(d); }
      }
      return { span: +(Math.max(...tail) - Math.min(...tail)).toFixed(5), reversals: rev,
        rest: +(p.y - spot.y).toFixed(5), grPct: p.grounded ? 100 : 0 };
    };
    const settled = settle(5);

    // the same body, the same wall, two frames of the real loop apart
    const cw = gl.drawingBufferWidth, ch = gl.drawingBufferHeight;
    const U = gl.UNSIGNED_BYTE;
    const grab = () => { const b = new Uint8Array(cw * ch * 4); gl.readPixels(0, 0, cw, ch, gl.RGBA, U, b); return b; };
    const dist = (cf, X, Y) => {
      const nx = X / cw * 2 - 1, ny = 1 - Y / ch * 2;
      const vdx = nx / R.proj[0], vdy = ny / R.proj[5], vdz = -1, v = R.view;
      let dx = v[0] * vdx + v[4] * vdy + v[8] * vdz;
      let dy = v[1] * vdx + v[5] * vdy + v[9] * vdz;
      let dz = v[2] * vdx + v[6] * vdy + v[10] * vdz;
      const m = Math.hypot(dx, dy, dz);
      const hit = W.raycast(cf.x, cf.y, cf.z, dx / m, dy / m, dz / m, 40, true);
      return hit ? hit.t : 99;
    };
    settle(2);
    const band = {};
    let prev = null;
    for (let f = 0; f < 4; f++) {
      g.input = {}; g.update(1 / 60);
      const cf = g.shootCamera(p); g._camFrame = cf; g.particles.n = 0; g.render();
      const cur = grab();
      if (prev) {
        for (let y = 0; y < ch; y += 2) for (let x = 0; x < cw; x += 2) {
          const i = (y * cw + x) * 4;
          const d = Math.abs(prev[i] - cur[i]) + Math.abs(prev[i + 1] - cur[i + 1]) + Math.abs(prev[i + 2] - cur[i + 2]);
          const t = dist(cf, x, y);
          const k = t > 40 ? 'far' : t < 2 ? 'near' : 'mid';
          const o = band[k] || (band[k] = { n: 0, moved: 0, sum: 0 });
          o.n++; if (d > 6) { o.moved++; o.sum += d; }
        }
      }
      prev = cur;
    }
    for (const k in band) band[k] = { n: band[k].n, pct: +(band[k].moved / band[k].n * 100).toFixed(2),
      mean: band[k].moved ? Math.round(band[k].sum / band[k].moved) : 0 };

    // a fall lands where it always landed
    p.x = spot.x; p.z = spot.z; p.y = spot.y + 3; p.vx = p.vy = p.vz = 0; p.grounded = false;
    let t = 0, vPeak = 0, landY = null;
    for (let i = 0; i < 300; i++) {
      g.input = {}; g.update(1 / 60); t += 1 / 60;
      vPeak = Math.min(vPeak, p.vy);
      if (landY === null && p.grounded && i > 8) landY = +p.y.toFixed(4);
    }
    const drop = { face: spot.y, landY, t: +t.toFixed(2), vPeak: +vPeak.toFixed(1) };

    // and a body wading in a one-block shelf is standing on the bottom of it
    const shelf = window.__mv && window.__mv.shelf;
    let wade = { error: 'no one-block shore shelf' };
    if (shelf) {
      p.x = shelf.x; p.z = shelf.z; p.y = shelf.top + 0.0001; p.vx = p.vy = p.vz = 0; p.grounded = false;
      const ys = []; let gr = 0;
      for (let i = 0; i < 180; i++) { g.input = {}; g.update(1 / 60); ys.push(p.y); if (p.grounded) gr++; }
      wade = { grPct: Math.round(gr / 180 * 100), span: +(Math.max(...ys) - Math.min(...ys)).toFixed(5),
        rest: +(p.y - shelf.top).toFixed(5) };
    }
    return back({ spot, settled, band, drop, wade });
  });
  check('a body standing still on flat ground does not move at all',
    !rest.error && rest.settled.span < 0.001 && rest.settled.reversals === 0, rest);
  check('and it rests on the surface, not a hair above it',
    !rest.error && Math.abs(rest.settled.rest) <= 0.001, rest);
  check('the frame one frame later is the same frame: nothing within 2 m of the lens moves',
    !rest.error && rest.band.near && rest.band.near.pct === 0 && rest.band.mid && rest.band.mid.pct === 0, rest);
  check('a body that falls still arrives at the same speed and stops on the surface it falls onto',
    !rest.error && rest.drop.vPeak < -10 && Math.abs(rest.drop.landY - rest.drop.face) <= 0.001, rest);
  check('a body wading in a one-block shelf is on the bottom of it',
    !rest.error && !rest.wade.error && rest.wade.grPct === 100 && rest.wade.span < 0.003, rest);
  /* A whole day of the world, run at the world's own pace rather than the
     browser's: every animal is a body somewhere in the valley, and the
     bookkeeping does not grow. A day rather than a minute because the animals
     that fly are asleep by daylight, and the failures this found are ones only
     a flying animal makes. This is the one step that looks at all of them at
     once instead of one animal sent to one place, and it is what found that a
     flying animal held its spawn height through hills and out of the world (87
     of 720 owl samples inside solid ground, and every sample of an owl that had
     spawned on a canopy outside the map) and that the spawn code put an animal
     on top of a tree rather than on the ground under it (509 of 600 tries).
     A crown is not rock: a bear walks through a bush, and where a crown grows
     to the top of the world there is no air left above it for a body to keep.
     Those samples are counted and reported, not failed. */
  const soak = await step('soakTheValley', () => {
    const g = window.game, W = g.world, N = window.FRUTARIA, p = g.player;
    const look = () => {
      const bad = { notANumber: [], bodyNaN: [], outside: [], inRock: [], inCrown: 0, onFoliage: [], underTheMap: [], aboveTheAir: [] };
      /* Every number a body carries, not just where it is. The draw multiplies
         these into matrices -- `partMatrix` feeds the angles straight into
         sin/cos -- and a NaN in one of them does not throw: it quietly removes a
         limb, because WebGL draws a NaN matrix as nothing at all. The physics
         hands most of these to itself, so a divide by zero or a square root of a
         negative would sit in a body for the rest of the day and read as a
         missing leg rather than as an error. `seen` is counted so the sweep
         cannot go quiet by accident: a field nobody has is a field nobody is
         checking. */
      const NUMS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'speed', 'yaw', 'pitch', 'tilt', 'bank',
        'phase', 'held', 'airAmt', 'crouch', 'flap', 'squash', 'hopT', 'wind', 'bob', 't',
        'flyY', 'diveTo', 'diveRate', 'climbTo', 'climbRate', 'huntH', 'homeX', 'homeZ',
        'tx', 'tz', 'ox', 'oz', 'hw', 'hl', 'tall', 'alarm', 'pause', 'air', 'dry', 'vital',
        'fright', 'faceYaw', 'formT', 'formMax', 'cruise', 'moveAmt', 'wSurf'];
      const seen = {};
      const sweep = (o, who) => {
        for (const k of NUMS) {
          const v = o[k];
          if (typeof v !== 'number') continue;
          seen[k] = (seen[k] || 0) + 1;
          if (!isFinite(v)) bad.bodyNaN.push([who, k]);
        }
      };
      for (const c of g.creatures) {
        sweep(c, c.sp.id);
        if (!isFinite(c.x) || !isFinite(c.y) || !isFinite(c.z) || !isFinite(c.speed) || !isFinite(c.yaw)) { bad.notANumber.push(c.sp.id); continue; }
        if (c.x < 0 || c.z < 0 || c.x >= W.w || c.z >= W.d || c.y < 0 || c.y >= W.h) bad.outside.push([c.sp.id, +c.x.toFixed(1), +c.y.toFixed(1), +c.z.toFixed(1)]);
        const bx = Math.floor(c.x), by = Math.floor(c.y + 0.2), bz = Math.floor(c.z);
        if (W.solidAt(bx, by, bz)) {
          if (N.TREE_BLOCK[W.get(bx, by, bz)]) bad.inCrown++;
          else bad.inRock.push([c.sp.id, +c.x.toFixed(1), +c.y.toFixed(1), +c.z.toFixed(1)]);
        }
        /* A body on foot stands on the ground. A crown under its feet, with the
           valley floor two metres below that, is a tree it climbed and rode:
           foliage at feet level reads as a step, and the next block of the same
           crown is at the new feet, so the body walks up its own tree. A flying
           body roosting on a branch is not this, and neither is one that cannot
           leave the water. */
        if (!c.isFlyer() && !c.isAquatic() && N.TREE_BLOCK[W.get(bx, Math.floor(c.y - 0.2), bz)] &&
            c.y - N.terrainY(W, bx, bz, W.h - 1) >= 2) bad.onFoliage.push([c.sp.id, +c.y.toFixed(1)]);
        if (c.y < 3) bad.underTheMap.push([c.sp.id, +c.y.toFixed(1)]);
        /* The ceiling a flying body is held to, and the floor of the valley. The
           ceiling is the top of the map less the body's own height, which is the
           rule the flight code works with; what is asked here is whether a body
           got above the world it is in. */
        if (c.y > W.h - 1) bad.aboveTheAir.push([c.sp.id, +c.y.toFixed(1)]);
      }
      // and the body the player is wearing, which feeds the same matrices
      sweep(p, 'player');
      bad.seen = Object.assign({}, seen);
      return bad;
    };
    const counts = () => ({ drops: g.drops.length, regrow: g.regrow.length, grow: g.growQueue.length, posts: g.posts.length, log: g.log.length, creatures: g.creatures.length });
    /* And where the world puts an animal in the first place: on the ground, not
       on the crown of a tree and not inside its trunk. The spawn code scans a
       column from the top of the world, and a crown is solid, so it used to
       answer "the top of a spruce" 509 times in 600 -- an animal in a tree, and
       a flyer whose flight height was measured from the top of that tree. */
    const saved = g.creatures;
    g.creatures = [];
    for (let k = 0; k < 10; k++) g.spawnCreatures();
    const placed = { n: g.creatures.length, onCrown: [], inTrunk: [], underRoof: [] };
    for (const c of g.creatures) {
      const bx = Math.floor(c.x), bz = Math.floor(c.z), by = Math.floor(c.y);
      if (N.TREE_BLOCK[W.get(bx, by - 1, bz)]) placed.onCrown.push([c.sp.id, +c.y.toFixed(1)]);
      if (W.solidAt(bx, by, bz)) placed.inTrunk.push([c.sp.id, +c.y.toFixed(1)]);
      /* A flying body is born in the air. The height it hunts at used to be
         measured from the top of the column while the body itself was put down at
         the bottom of it, so it woke up inside the crown of a spruce with a block
         one layer over its head: five of the six owls of a generated valley, and
         one of them was still under that block a minute later, going up and down
         7 cm at a place it could not get out of. */
      if (c.isFlyer() && W.solidAt(bx, by + 1, bz)) placed.underRoof.push([c.sp.id, +c.y.toFixed(1)]);
    }
    g.creatures = saved;
    const before = look(), n0 = counts(), t0 = g.time;
    /* And how far a body travels in one frame. Every one of its rules is a rate
       -- a step, a fall, a climb, a swim -- and none of them is allowed to be a
       lift: measured before, one bear changed height by 1.35 m in a single frame
       (81 m/s) and by exactly 0.75 m in 261 frames of a day, and a frog dropped
       on the lakebed came up 0.47 m in its first frame (28 m/s). */
    const feet = g.creatures.filter(c => !c.isFlyer() && !c.isAquatic());
    const prevY = new Map(feet.map(c => [c, c.y]));
    /* Nobody is holding a key, and the body is parked where the valley put it at
       the boot. The step before this one leaves its own keys in g.input, and the
       steps before that leave the body wherever their own rig wanted it -- a day
       of that walks or leaves a player somewhere the ridge cold bites, they go
       down, and their fruit scatters, which puts the drop count and the log up:
       exactly the two things this step is watching for, caused by nothing in the
       world at all. */
    const inp0 = g.input, pw = { x: p.x, y: p.y, z: p.z, form: p.form, vital: p.vital, air: p.air };
    const sp0 = N.spawn;
    p.x = sp0.x; p.y = sp0.y; p.z = sp0.z; p.vx = p.vy = p.vz = 0; p.form = null;
    p.vital = 10; p.air = 999; p.dry = 0; p.fright = 0;
    const jump = { worst: 0, who: null };
    // a whole day of the world's clock, so the animals are seen roosting and flying
    for (let i = 0; i < Math.round(N.DAY_LEN * 60); i++) {
      g.input = {};
      g.update(1 / 60);
      for (const c of feet) {
        const d = Math.abs(c.y - prevY.get(c));
        if (d > jump.worst) { jump.worst = +d.toFixed(2); jump.who = c.sp.id; }
        prevY.set(c, c.y);
      }
    }
    g.input = inp0;
    Object.assign(p, pw);
    return { seconds: +(g.time - t0).toFixed(1), placed, before, after: look(), jump,
      countsBefore: n0, countsAfter: counts(),
      logTail: g.log.slice(-6).map(l => (l.txt || l.msg || JSON.stringify(l)).slice(0, 60)),
      player: { x: +g.player.x.toFixed(1), y: +g.player.y.toFixed(2), z: +g.player.z.toFixed(1),
        form: g.player.form, vital: +g.player.vital.toFixed(1), inv: g.inv.length,
        inWater: !!g.player.inWater, headWater: !!g.player.headWater, air: +g.player.air.toFixed(1) },
      dropKinds: g.drops.map(d => d.item && d.item.id) };
  });
  check('an animal is put down on the ground, not on the tree that grows out of it',
    soak.placed.n > 200 && !soak.placed.onCrown.length && !soak.placed.inTrunk.length, soak.placed);
  check('a flying animal is born in the air, not under the crown it would have to climb through',
    !soak.placed.underRoof.length, soak.placed);
  check('a whole day of the world running leaves every animal a body in a place',
    !soak.after.notANumber.length && !soak.after.outside.length && !soak.after.inRock.length &&
    !soak.after.underTheMap.length && !soak.after.aboveTheAir.length, soak.after);
  check('a body on foot spends the day on the ground, not on the crowns over it',
    !soak.after.onFoliage.length, soak.after);
  /* A NaN does not throw. `partMatrix` feeds a body's angles straight into
     sin/cos, and a NaN matrix is what WebGL draws as nothing at all: a leg that
     quietly stops existing for the rest of the day, and a body that keeps
     walking with three of them. Every number a body carries is swept here, the
     body's own physics having handed most of them to itself. `seen` is the guard
     on the guard -- a field no body has is a field this check never looked at,
     and the list is only as wide as the bodies actually are. */
  check('and every number a body carries stays a number, for the animals and for the body you wear',
    !soak.after.bodyNaN.length && !soak.before.bodyNaN.length &&
    soak.after.seen.wSurf > 20 && soak.after.seen.tilt > 20 && soak.after.seen.bank > 20 &&
    soak.after.seen.held > 20 && soak.after.seen.airAmt > 20 && soak.after.seen.yaw > 20, soak.after);
  check('and no frame of that day moves a body further than its own body can',
    soak.jump.worst <= 0.4, soak.jump);
  check('the log, the scattered fruit and the queues do not grow without bound',
    soak.countsAfter.log <= 40 && soak.countsAfter.creatures === soak.countsBefore.creatures &&
    soak.countsAfter.drops <= soak.countsBefore.drops && soak.countsAfter.grow <= soak.countsBefore.grow, soak);

  /* 11m. A body keeps the space its own trunk takes up, and it keeps it from its
     own kind as well as from the world. Every step of an animal was tested
     against the ground, the water and the leaves, and against nothing else: two
     bodies could walk through one another as if they were not there. Measured
     over the morning the game opens on, in a valley born the way the game bears
     it, with the bodies' own footprints -- the rectangle each model's trunk is
     carved from, turned by its heading, and only counted where the two bodies
     also stand at one height -- the ten lamps of the tower field stood in one
     another's way 17197 times, 12995 of those frames more than 12 cm deep, the
     worst pair 0.54 m in: one bell drawn almost exactly on top of another. The
     twelve frogs of Mirrorlake spent 46% of the morning with another frog
     inside them, 0.43 m deep at the worst, and a frog inside a frog averaged
     0.28 m. Now the worst pair is 0.229 m, the frames more than 12 cm deep are a
     little over a fifth of what they were, and the mean depth of a pair that
     touches is 0.084 instead of 0.242. The frogs are in one another's way in far
     fewer frames than before as well -- 1339 against 4099 -- because they go
     round one another now instead of through one another. A neighbour is an
     obstacle the same contour takes a body round, a body may not step deeper
     into one than it already stands, and whatever overlap is left at the end of
     the frame is undone along the shortest way out that the world allows. A
     body is not a circle either: two bears end on are 1.1 m from nose to tail,
     and a rule wide enough to keep them apart would keep a bear and a frog
     three metres apart.
     Three laws are asked of this window beyond that, and each of the readings
     below comes from a run of this same window with that one law gutted and the
     other two in force -- the window is seeded, so a law is the only thing that
     moved the number.
     First: that undo is bounded for a pair -- half the way out of that one
     overlap, at the rate the world's own corrections work at -- and it is taken
     once for every pair that overlaps, so a body standing inside several of its
     own kind is moved several times in the same frame, and nothing bounded the
     frame. The lamp field is where that shows, because it is the field that is
     born overlapping: with the frame unbounded the worst frame of this window
     moved a lamp 0.127 m at a sixtieth of a second, 7.6 m/s, 3.46 times what
     that lamp's own fins would have carried it, for an animal whose row says it
     swims at 2.2 and wanders at 0.92; over five-minute watches of the field a
     player actually meets the worst frame was 0.133-0.156 m (7.9-9.4 m/s), and
     on one page the whole five minutes averaged 17.9 m/s, with a worst frame of
     4.1 m and 82 m/s -- bells thrown about their own field for a whole watch.
     Each body now has one budget a frame, and the budget is its own speed: a
     neighbour may add to the body's own walk at most the walk the body itself
     has, so a frame may be twice the animal and is not eight times it. The worst
     frame of the same window is 0.052 m, 3.1 m/s, 1.42 times what that lamp's
     fins would have carried it. The slower undo is not worse for the crowd
     either, and where it is worse it is worse by a fingernail: 2856 pair-frames
     deeper than 12 cm against 3653, a mean depth of 0.084 against 0.091, the
     worst pair 0.229 against 0.223, a bell that may not be thrown clear in one
     frame taking two frames to get clear.
     Second: the crowd that does not fit its ground is put down on top of itself
     by the birth loop, which used to take the first sample clear and otherwise
     whatever the tenth throw landed on. 29 of the 49 columns of the lamp's disc
     are water and the rest is the tower's brick, the room a lamp asks of its own
     kind is 0.83 m, and ten lamps do not fit; in the worst of five mornings the
     nearest pair stood 0.23 m apart -- bells inside bells -- and the field spent
     the rest of the morning undoing it. Of the places a species will accept, the
     one taken is now the one furthest from its own kind, the rule the animal
     already follows when it picks somewhere to swim to, and the worst nearest
     pair of the same five mornings is 0.67 m. What the ring cannot hold it still
     cannot hold, and that is reported rather than hidden: six of the ten were
     born with a neighbour inside the room and eight are now, while the nearest
     pair moved from 0.23 m to 0.67 m -- what the law refuses is not a lamp born
     close to a lamp, it is a bell born on top of a bell.
     Third, and it is asked of the place a shove lands rather than of the body:
     the step below hunts a shore the law can be asked of, and it costs this
     window depth -- without that law the worst pair of this window is 0.192 m
     and 2089 frames deeper than 12 cm, with it 0.229 and 2856 -- because a body
     refused the way out it was offered must find another or stay where it is
     pressed. The trade is between being inside a neighbour and being inside a
     bank, and the bank is the one that used to be reported at all: the flock
     step of this file found a frog inside a block for 1 to 5 frames of the 2400
     wet frames of its window, on some pages and not on others. */
  const space = await step('bodiesKeepTheirOwnSpace', () => {
    const g = window.game, N = window.FRUTARIA, p = g.player;
    /* The valley this is measured over is a fresh one, and the same fresh one
       every time. The steps before this leave the animals wherever a day of
       testing has pushed them -- one run had a bear standing in a hollow with
       its errand 13.9 m away, not moving once in 150 seconds, with no other
       body within 2 m of it the whole while -- and an animal's choices come from
       Math.random, so the same code measured twice gave answers three times
       apart. The animals are born again through the code the game uses at the
       start, the draw an animal makes when it picks is seeded, and the animals
       that were here are put back after. */
    const rnd = Math.random;
    let sd = 20240921;
    Math.random = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
    const crowdWas = g.creatures;
    /* How far a birth asks its own kind to stand away: two trunks of the species
       and a hand's width, the same number the spawn code asks with.
       The morning measured below is one morning and is seeded, so that the same
       code measured twice gives the same answer. A birth spread is not a property
       of one morning: it is a property of every morning the valley can be made
       from, and the crowd that overfills its ground is the crowd that shows it --
       the ten lamps of the tower field into the wet ring round the tower's brick.
       So the birth is audited over five mornings, each its own seed, and the worst
       of the five is what is reported. */
    const roomOf = (sp) => {
      const mw = N.MODEL_W[sp.model] || [0.5, 0.5, 0, 0];
      return Math.max(mw[0], mw[1]) * (sp.scale || 0.2) * 2 + 0.4;
    };
    const birth = { min: 99, who: null, worstCrowd: 0, worstKind: null, rooms: {} };
    for (let s = 0; s < 5; s++) {
      sd = 20240921 + s * 7919;
      g.creatures = [];
      g.spawnCreatures();
      const per = {};
      for (const c of g.creatures) {
        const room = roomOf(c.sp);
        let gap = 99;
        for (const q of g.creatures) {
          if (q === c || q.sp.id !== c.sp.id) continue;
          const d = Math.hypot(c.x - q.x, c.z - q.z);
          if (d < gap) gap = d;
        }
        const k = per[c.sp.id] || (per[c.sp.id] = { min: 99, cramped: 0, room: +room.toFixed(2) });
        if (gap < k.min) k.min = +gap.toFixed(2);
        if (gap < room) k.cramped++;
      }
      for (const id in per) {
        birth.rooms[id] = per[id].room;
        if (per[id].min < birth.min) { birth.min = per[id].min; birth.who = id; }
        if (per[id].cramped > birth.worstCrowd) { birth.worstCrowd = per[id].cramped; birth.worstKind = id; }
      }
    }
    sd = 20240921;                       // the morning the window is measured over
    g.creatures = [];
    g.spawnCreatures();
    const cs = g.creatures.slice();
    /* And the same hours of the same day: the window is the morning the game
       opens on, 07:00 to 12:15, so the night animals are out at the start of it
       and in bed by the end of it, and the animals that never sleep are abroad
       all through. */
    const timeWas = g.time;
    g.time = N.DAY_LEN * (7 / 24);
    const box = (c) => {
      const w = N.MODEL_W[c.sp.model] || [0.5, 0.5, 0, 0], s = c.sp.scale || 0.2;
      return { x: c.x + Math.sin(c.yaw) * w[3] * s, z: c.z - Math.cos(c.yaw) * w[3] * s,
        yaw: c.yaw, hw: w[0] * s, hl: w[1] * s, y: c.y, tall: c.tall };
    };
    /* How deep one body sits inside another, in three dimensions: the least way
       either of them could be pulled out of the other. Two bodies a metre apart
       in height are not in one place, and the height they have in common has to
       be more than a graze of the shorter one before it counts at all -- a lamp
       riding on the crown of another's bell is on top of it, not inside it. */
    const deepIn = (a, b) => {
      const v = Math.min(a.y + a.tall, b.y + b.tall) - Math.max(a.y, b.y);
      if (v <= 0.15 * Math.min(a.tall, b.tall)) return 0;
      const dx = b.x - a.x, dz = b.z - a.z;
      let pen = 1e9;
      for (const u of [[Math.sin(a.yaw), -Math.cos(a.yaw)], [Math.cos(a.yaw), Math.sin(a.yaw)],
                       [Math.sin(b.yaw), -Math.cos(b.yaw)], [Math.cos(b.yaw), Math.sin(b.yaw)]]) {
        const ra = Math.abs(a.hw * u[0]) + Math.abs(a.hl * u[1]);
        const rb = Math.abs(b.hw * u[0]) + Math.abs(b.hl * u[1]);
        pen = Math.min(pen, ra + rb - Math.abs(dx * u[0] + dz * u[1]));
      }
      return pen > 0 ? Math.min(pen, v) : 0;
    };
    const inp0 = g.input, pw = { x: p.x, y: p.y, z: p.z, form: p.form, vital: p.vital, air: p.air };
    p.x = N.spawn.x; p.y = N.spawn.y; p.z = N.spawn.z; p.vx = p.vy = p.vz = 0; p.form = null;
    p.vital = 10; p.air = 999; p.dry = 0; p.fright = 0;
    const kind = {}, seen = { worst: 0, deep: 0, touch: 0, sum: 0 };
    const start = new Map(cs.map(c => [c, [c.x, c.z]]));
    const path = new Map(cs.map(c => [c, 0]));
    const prev = new Map(cs.map(c => [c, [c.x, c.z, c.y]]));
    const awake = new Map(cs.map(c => [c, 0]));
    const near = new Map(cs.map(c => [c, 0]));
    /* The most a body can cover in one frame of its own accord: the speed its own
       row gives it for the element it is in -- air for a bird, water for a body
       the water is holding, ground for everything else -- at the fastest that
       speed is ever used, which is the 1.7 of a flight or a chase. Anything over
       that is not the body moving. The crowd law below reads the bodies where
       they stood when the frame began, and it is applied once for every pair that
       overlaps, so a body standing inside several of its own kind is moved once
       per pair, each at the rate the world's corrections work at; the field of
       the sunken tower is that field, and the same law that pulls two bells apart
       was measured throwing a lamp 0.133 m at a sixtieth of a second -- 8 m/s for
       an animal whose row says 2.2 m/s, and on one page of the same field an
       average of 17.9 m/s over five whole minutes, with a worst frame of 82 m/s.
       A body may be moved by its neighbours; it may not be moved faster than it
       can move itself. */
    const topOf = (c) => {
      const sp = c.sp;
      const top = c.isFlyer() ? (sp.flySpeed || sp.speed || 3)
              : (c.inWater && sp.swimSpeed) ? sp.swimSpeed : (sp.speed || 3);
      return c.state === 'flee' || c.state === 'chase' ? top * 1.7 : top;
    };
    const jump = { ratio: 0, who: null, m: 0, mPerS: 0, frames: 0, over: 0 };
    /* The same question on the third axis, for the bodies whose height is not
       their own act: the water holds one kind of body up and the air holds
       another, and in both branches the height is *eased* towards a level the
       world answers for them. A jump or a step down is an animal's own motion
       and is asked elsewhere (`soak` reads a whole day of feet at 0.4 m a
       frame); an ease is the world moving the body, and nothing at all asked its
       rate: the water's branch was measured taking a bell 0.1587 m in a single
       frame -- 9.52 m/s, 4.33 times the 2.2 m/s its own row swims. */
    const lift = { ratio: 0, who: null, m: 0, mPerS: 0, frames: 0, over: 0 };
    const SECS = 150;
    for (let i = 0; i < Math.round(SECS * 60); i++) {
      g.input = {};
      g.update(1 / 60);
      for (let u = 0; u < cs.length; u++) for (let v = u + 1; v < cs.length; v++) {
        const A = cs[u], B = cs[v];
        if (Math.abs(A.x - B.x) > 2 || Math.abs(A.z - B.z) > 2) continue;
        const d = deepIn(box(A), box(B));
        if (d <= 0.02) continue;
        const k = A.sp.id + '/' + B.sp.id;
        const s = kind[k] || (kind[k] = { frames: 0, deep: 0, worst: 0, sum: 0 });
        s.frames++; s.sum += d;
        if (d > s.worst) s.worst = d;
        seen.touch++; seen.sum += d;
        if (d > 0.12) { seen.deep++; s.deep++; }
        if (d > seen.worst) seen.worst = d;
      }
      for (const c of cs) {
        const q = prev.get(c);
        const step = Math.hypot(c.x - q[0], c.z - q[1]);
        path.set(c, path.get(c) + step);
        // how much of this frame was the body's own movement
        const r = step / (topOf(c) / 60);
        jump.frames++;
        if (r > 1) jump.over++;
        if (r > jump.ratio) {
          jump.ratio = +r.toFixed(2); jump.who = c.sp.id;
          jump.m = +step.toFixed(3); jump.mPerS = +(step * 60).toFixed(1);
        }
        const vstep = Math.abs(c.y - q[2]);
        if (c.isAquatic() || c.isFlyer()) {
          const vr = vstep / (topOf(c) / 60);
          lift.frames++;
          if (vr > 1) lift.over++;
          if (vr > lift.ratio) {
            lift.ratio = +vr.toFixed(2); lift.who = c.sp.id;
            lift.m = +vstep.toFixed(3); lift.mPerS = +(vstep * 60).toFixed(1);
          }
        }
        prev.set(c, [c.x, c.z, c.y]);
        // a body asleep on its perch is not a body held up by its neighbours
        if (c.state !== 'roost') awake.set(c, awake.get(c) + 1);
        for (const o of cs) {
          if (o === c) continue;
          if (Math.abs(o.x - c.x) > 2 || Math.abs(o.z - c.z) > 2) continue;
          if (c.y >= o.y + o.tall || o.y >= c.y + c.tall) continue;
          near.set(c, near.get(c) + 1); break;
        }
      }
    }
    g.input = inp0;
    Object.assign(p, pw);
    g.creatures = crowdWas;
    g.time = timeWas;
    Math.random = rnd;
    /* The rule is a way of going round, not a way of standing still: a body that
       spends the window where it was put has been stopped by its neighbours, not
       guided round them. Two things are not counted: a body asleep on its perch
       spends the window where it was put because that is what sleeping is, and a
       body that spent the window on its own has the ground to thank or not thank,
       not its neighbours -- only a body that stood among its own kind and did not
       move once is named. */
    const detail = (c) => c.sp.id + ':path' + +path.get(c).toFixed(2) +
      ':st' + c.state + ':toErrand' + +Math.hypot(c.tx - c.x, c.tz - c.z).toFixed(1) +
      ':awake' + Math.round(awake.get(c) / 60) + 's:near' + Math.round(near.get(c) / 60) + 's';
    const quiet = cs.filter(c => awake.get(c) > 60 * 60 && path.get(c) < 1);
    const still = quiet.filter(c => near.get(c) > 60 * 60).map(detail);
    const tower = (N.ZONE_BY_ID.mirrorlake || {}).tower || [0, 0];
    const lampFar = cs.filter(c => c.sp.id === 'jelly')
      .map(c => +Math.hypot(c.x - tower[0], c.z - tower[1]).toFixed(1)).sort((a, b) => b - a);
    const per = {};
    for (const k in kind) per[k] = { frames: kind[k].frames, deep: kind[k].deep,
      worst: +kind[k].worst.toFixed(3), mean: +(kind[k].sum / kind[k].frames).toFixed(3) };
    return { seconds: SECS, bodies: cs.length, worst: +seen.worst.toFixed(3),
      deep: seen.deep, touch: seen.touch, mean: +(seen.sum / Math.max(seen.touch, 1)).toFixed(3),
      per, still, quiet: quiet.map(detail), lampFar: lampFar.slice(0, 3),
      jump, lift, birth,
      walked: +Math.max.apply(null, cs.map(c => path.get(c))).toFixed(1) };
  });
  check('no body spends the window inside another body',
    space.worst <= 0.3, space);
  check('and the pairs that touch do not press into one another',
    space.deep <= 5000 && space.mean <= 0.12, space);
  check('a body guided round its neighbours still goes somewhere',
    !space.still.length && space.walked > 20, space);
  check('the lamps still trace the tower they were born on',
    space.lampFar[0] <= 6, space);
  /* And the two laws this window is now asked to hold. The first is about how a
     body is moved: every frame of the window is read against the speed the body's
     own row gives it, and the crowd is not allowed to be the one in front. The
     second is about how the crowd is made: the ground a species is born on is
     often smaller than the crowd, and a birth loop that takes the last sample
     when it cannot find a clear one puts a body down inside its own kind and
     leaves the whole valley to undo it. */
  check('no frame of that window moves a body faster than its own body can go',
    space.jump.ratio <= 2, space.jump);
  check('a body is not born standing inside the trunk of its own kind',
    space.birth.min >= 0.4, space.birth);
  /* And the height: in this field the water never asks for more than it has to,
     so this is the standing guard rather than the finding -- the finding is the
     step below, where the level itself is wrong and the ease eats it. */
  check('no frame of that window lifts or drops a body the water or the air holds faster than that body can go',
    space.lift.ratio <= 1.05, space.lift);

  /* 11m2. The way out of a neighbour is not a way into the world. The crowd pass
     asks the place it picks of `bodyRoom`, which answers for the ground a body
     would stand on -- within a step (1.6 m) and clear above it -- and that is the
     right question for a body on its feet and the wrong one for a body the water
     is holding up beside a bank that runs up through its height. Four frogs of
     Mirrorlake packed closer than their own trunks, the front one 0.15 m off such
     a shore of stone, were shoved into the stone: 8 frames of that window with a
     body inside the bank, the front one inside block 4 at 47.96, and the law
     further up then lifting it out at 0.13 m a frame and on to the crown of the
     bank at 13.0, where it stayed -- a swimming body stood on the bank's stone by
     its own neighbours. Those are the frames the flock step of
     this file counts, now and then, when it says a frog spent a frame inside the
     world: 1 to 5 of the 2400 wet frames of its window, on some pages and not on
     others, and always the handful that follows a body put inside by its own
     neighbours. The geometry is therefore asked directly, on a shore the valley
     is searched for rather than one the test invents, the four are stood facing
     away from the face at the same point of their stroke -- the way out of a
     neighbour is read off the boxes the trunks are carved from, so the heading
     they are stood in belongs to the question, and leaving it to whatever an
     earlier step happened to leave them in made the answer a different number
     every run -- and they are given one sequence of wander draws rather than the
     valley's own: on one page the file was still at the shore when the window
     closed and on the next it had swum 19 m to the company a previous step left
     it, which is the animals being animals and buries the question asked here.
     The file is parked 0.15 m off the face with nothing else moving it (its
     errand a quarter of an hour away, its player parked at the corner of the
     map), and every frame of a quarter of a minute is asked whether any of the
     four stands inside a block that is not foliage. Before: 8 frames of that
     window, and the front body inside stone at 47.96. After: none, the file
     still spread as far as the bank lets it -- 0.75 m front to back when the
     window opens and 1.07 m when it closes, the same both times the suite is
     run -- and the way round taken instead. */
  const shove = await step('aCrowdShoveNeverPutsABodyInsideTheWorld', () => {
    const N = window.FRUTARIA, g = window.game, W = g.world, p = g.player;
    const hard = (x, y, z) => W.solidAt(x, y, z) && !N.TREE_BLOCK[W.get(x, y, z)];
    const stands = (c) => hard(Math.floor(c.x), Math.floor(c.y), Math.floor(c.z));
    /* A shore the law can be asked of: water three blocks deep, and next to it a
       bank that stands at the height a body of this size floats at, whose top is
       no more than a step above that and clear -- exactly the place `bodyRoom`
       answers yes to. The valley is searched for it rather than one being built,
       so the block is the block the game made. */
    let spot = null;
    for (let x = 8; x < W.w - 8 && !spot; x++) for (let z = 8; z < W.d - 8 && !spot; z++) {
      const wt = N.waterTop(W, x, z, W.h - 1);
      if (wt < 0) continue;
      const bed = N.terrainY(W, x, z, wt + 2);
      if (wt + 1 - bed < 3) continue;
      const y = bed + 1.2;
      if (y > wt - 0.4) continue;
      for (const [ux, uz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!hard(x + ux, Math.floor(y), z + uz)) continue;
        const gy = N.standY(W, x + ux, z + uz, y);
        if (gy - y >= 1.6 || hard(x + ux, Math.floor(gy + 0.2), z + uz)) continue;
        spot = { x, z, y: +y.toFixed(2), ux, uz, wt, bed, gy,
          block: W.get(x + ux, Math.floor(y), z + uz) };
        break;
      }
    }
    if (!spot) return { error: 'no shore of that shape in this valley' };
    const file = g.creatures.filter(c => c.sp.id === 'frog').slice(0, 4);
    if (file.length < 4) return { error: 'not enough frogs to make a file' };
    /* The draw these four make from here on is seeded, and the same seed every
       time. A wander target is a draw, and on one page of this file's own log the
       file was still at the shore when the window closed and on the next it had
       swum 19 m to the company it had left in the previous step's window: that is
       the animals being animals, which is what the steps about behaviour are for,
       and here it buries the question this step asks. So the window has one
       sequence of choices and the answer is the answer every time. */
    const rnd = Math.random;
    let sd = 20240921;
    Math.random = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
    const keep = file.map(c => ({ x: c.x, y: c.y, z: c.z, vy: c.vy, yaw: c.yaw, t: c.t,
      speed: c.speed, state: c.state, pause: c.pause, tx: c.tx, tz: c.tz, homeX: c.homeX,
      homeZ: c.homeZ, hovering: c.hovering, buoy: c.buoy, inWater: c.inWater,
      sleeping: c.sleeping, hopT: c.hopT, wind: c.wind }));
    const pw = { x: p.x, y: p.y, z: p.z, form: p.form, vital: p.vital };
    const t0 = g.time;
    g.time = 420 * 13 / 24; g.updateEnv();          // the frogs are abroad
    p.form = null; p.vital = 10; p.x = 4; p.z = 4; p.y = W.h - 2;   // nobody to run from
    /* and no herd to walk back to: these four are asked about the crowd, not about
       the way home, and the herd centre of Mirrorlake is a twenty-metre walk from
       any shore this valley has */
    const herdWas = g.herdCentres && g.herdCentres.frog;
    if (g.herdCentres) g.herdCentres.frog = { x: spot.x + 0.5, z: spot.z + 0.5, n: file.length };
    const face = (k) => 0.25 * k - 0.35;            // 0.15 m off the face, packed behind
    file.forEach((c, k) => {
      c.x = spot.x + 0.5 - spot.ux * face(k);
      c.z = spot.z + 0.5 - spot.uz * face(k);
      c.y = spot.y; c.vy = 0; c.state = 'wander'; c.pause = 9999; c.sleeping = false;
      c.tx = c.x; c.tz = c.z; c.homeX = c.x; c.homeZ = c.z;
      c.hovering = false; c.buoy = 0; c.hopT = 0; c.wind = 0; c.speed = 0;
      /* and stood facing away from the face, all four at the same point of their
         stroke: the way out of a neighbour is read off the boxes of the trunks,
         so the heading they are stood in is part of the question, and leaving it
         to the state some earlier step happened to leave them in made the answer
         a different number every run */
      c.yaw = Math.atan2(-spot.ux, -spot.uz);
      c.t = 0;
    });
    const spanWas = Math.hypot(file[0].x - file[3].x, file[0].z - file[3].z);
    let inside = 0, touch = 0;
    const hits = [];
    for (let i = 0; i < 900; i++) {
      for (const c of file) c.update(1 / 60, p, W, g);
      let inWorld = 0, brushing = 0;
      for (const c of file) {
        if (stands(c)) { inside++; inWorld++; }
        // still in one another's way? their trunks touch at 0.41 m apart
        let near = 9;
        for (const q of file) if (q !== c) near = Math.min(near, Math.hypot(q.x - c.x, q.z - c.z));
        if (near < 0.45) brushing++;
      }
      if (inWorld || brushing) touch++;
      if (inWorld && hits.length < 4) {
        hits.push({ i, at: file.map(c => [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2),
          W.get(Math.floor(c.x), Math.floor(c.y), Math.floor(c.z)), stands(c) ? 1 : 0]) });
      }
    }
    const spanNow = Math.hypot(file[0].x - file[3].x, file[0].z - file[3].z);
    const out = { spot, inside, touchFrames: touch, hits,
      span: [+spanWas.toFixed(2), +spanNow.toFixed(2)],
      end: file.map(c => [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)]) };
    // how far the front body ended from where it was stood, before anything is put back
    out.drift = +Math.hypot(file[0].x - (spot.x + 0.5 + spot.ux * 0.35),
      file[0].z - (spot.z + 0.5 + spot.uz * 0.35)).toFixed(2);
    file.forEach((c, k) => Object.assign(c, keep[k]));
    if (g.herdCentres) g.herdCentres.frog = herdWas;
    g.time = t0; g.updateEnv();
    Object.assign(p, pw);
    Math.random = rnd;
    return out;
  });
  /* A shove is a way out of a neighbour; it is not a door into the world. And the
     law that refuses it does not stop the crowd doing its job: the file still
     spreads (its front-to-back span is what it was or wider), and the frames in
     which these four are still in one another's way are reported beside it. */
  check('a shove never puts a body inside the world',
    !shove.error && shove.inside === 0, shove);
  check('and the crowd still gets the file out of one another',
    !shove.error && shove.span[1] >= shove.span[0], shove);

  /* 11m3. The water an animal hangs in is asked of the water, and the water
     closes that height at the speed the animal swims.
     How deep the water in a column is was asked by taking "the topmost water cell"
     and subtracting "the highest solid found by scanning down from two cells above
     it". The brick of the sunken tower pokes up through the film of the lake it
     stands in, so that scan hits the brick and the column answers that there is no
     water in it at all: twenty-five columns inside the lamps' own disc -- the
     field the dex says sits "exactly in the outline of the sunken tower" -- read
     that way, 8 metres of water each, film at 15 and lakebed at 7, and the level
     the water is said to hold a body at is the lakebed under it. That one answer
     decides four things: where a swimming body may be put (the crowd's room
     question), where it may be sent (the errand picker), which way it may swim
     (the step gate) and the height it hangs at. Nothing visible was wrong when
     this was found -- of 90,000 lamp-frames in a five minute watch not one stood
     in such a column, because the picker and the step gate kept the field out of
     columns they believed were dry -- but the field was not in the outline the dex
     gives it, and a bell that got into one of
     those columns, by a shove from its own kind, which asks only about solid and
     stone, was pinned on the lakebed under the tower: ten seconds there and its
     crown sat **6.27 m** under the film on the average and **7.11 m** at the
     deepest, for a body whose row says **1.2 m** -- which is what the first check
     below reports when only this law is taken out. Two laws, asked in the same
     step. The water is told by the depth of the water in the column, which is the
     bed searched from the topmost water cell and not from the brick standing over
     it. And the height the water holds a body at is closed at no more than the
     speed that body swims -- the law the air branch of this file already carries
     (docs 03 line 85, 23.9 -> 2.94 m/s) and the water branch never got: a bell
     put on the lakebed at the bottom of the deepest column in that disc and let go
     climbs the whole **8.91 m** of water, and the ease carries it **15.51 m/s**,
     seven times its own speed, with **67** of its 600 frames faster than it
     swims. */
  const towerWater = await step('towerWater', () => {
    const N = window.FRUTARIA, g = window.game, W = g.world, p = g.player;
    const sp = N.CREATURES.find((s) => s.id === 'jelly');
    const tower = (N.ZONE_BY_ID.mirrorlake || {}).tower || [0, 0];
    const field = g.creatures.filter((c) => c.sp.id === 'jelly');
    if (!sp || !field.length) return { error: 'no lamp jellyfish in the world' };
    const TALL = field[0].tall;
    const own = sp.swimSpeed || sp.speed || 3;
    const HOVER = sp.hover === undefined ? 0.8 : sp.hover;
    const BOB = 0.8;                      // the swing the water branch rides on
    const f2 = (v) => (v === null || v === undefined ? null : +v.toFixed(2));
    const filmAt = (x, z) => {
      const wt = N.waterTop(W, x, z, W.h - 1);
      return wt < 0 ? null : wt + 1;
    };
    /* How deep the water in this column is: the bottom of the water, searched up
       from the topmost water cell. This is a fact about the valley and not about
       any law in this file -- a column with 8 metres of water in it is 8 metres
       deep whether or not the file knows it, and the file's own answer used to be
       got by searching from two cells over the film instead -- so the rigs below
       are picked the same way before the law as after it. */
    const depthAt = (x, z) => {
      const wt = N.waterTop(W, x, z, W.h - 1);
      if (wt < 0) return null;
      const film = wt + 1;
      const bed = N.groundY(W, x, z, wt);
      return { film, body: film - TALL - HOVER, bed, depth: film - bed };
    };

    /* Whether the surface of this column has a block standing in it. The brick of
       the sunken tower pokes up through the film of the lake it stands in, and
       that is a fact about the valley, not about any law in this file: asking it
       here is how the rig below is picked the same way before the law as after
       it, instead of being picked by the bug and vanishing when the bug goes. */
    const capAbove = (x, z, film) => W.solidAt(x, film, z);

    /* every column of the disc the lamps belong to that holds water deep enough
       for a bell: what height does the level law answer for one standing in it? */
    let wet = 0, deep = 0, capped = 0, bedTakes = 0, worst = null, deepest = null, cappedDeep = null;
    const x0 = Math.max(1, Math.ceil(tower[0] - sp.spread - 1)), x1 = Math.min(W.w - 2, Math.floor(tower[0] + sp.spread + 1));
    const z0 = Math.max(1, Math.ceil(tower[1] - sp.spread - 1)), z1 = Math.min(W.d - 2, Math.floor(tower[1] + sp.spread + 1));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      if (Math.hypot(x + 0.5 - tower[0], z + 0.5 - tower[1]) > sp.spread + 1) continue;
      const col = depthAt(x, z);
      if (col === null) continue;
      wet++;
      if (col.depth < 4) continue;      // not water a bell could hang in, whatever the law says
      deep++;
      if (!deepest || col.depth > deepest.depth)
        deepest = { x, z, depth: col.depth, film: col.film, bed: col.bed, row: f2(col.body) };
      if (capAbove(x, z, col.film)) {
        capped++;
        if (!cappedDeep || col.depth > cappedDeep.depth)
          cappedDeep = { x, z, depth: col.depth, film: col.film, bed: col.bed, row: f2(col.body) };
      }
      const want = N.hoverLevel(sp, W, x + 0.5, z + 0.5, TALL, col.body, 0);
      const under = col.film - (want + TALL);
      if (under > HOVER + 0.5) {
        bedTakes++;
        if (!worst || under > worst.under)
          worst = { x, z, under: +under.toFixed(2), want: f2(want), film: col.film, depth: col.depth };
      }
    }
    const out = { tower, spread: sp.spread, tall: +TALL.toFixed(3), own, hover: HOVER,
      wet, deep, capped, bedTakes, worst, deepest, cappedDeep };
    if (!deepest) return Object.assign(out, { error: 'no column in the lamps disc holds water deep enough for a body' });

    const bell = field[0];
    const keep = ['x', 'y', 'z', 'homeX', 'homeZ', 'tx', 'tz', 'pause', 'state', 'yaw', 't', 'phase']
      .map((k) => ({ k, v: bell[k] }));
    const filmOf = (c) => filmAt(Math.floor(c.x), Math.floor(c.z));
    const spanSolid = (c) => {
      let n = 0;
      for (let y = Math.floor(c.y); y <= Math.floor(c.y + TALL); y++) {
        const b = W.get(Math.floor(c.x), y, Math.floor(c.z));
        if (W.solidAt(Math.floor(c.x), y, Math.floor(c.z)) && !N.TREE_BLOCK[b]) n++;
      }
      return n;
    };
    const run = (secs) => {
      let worstM = 0, over = 0, frames = 0, dry = 0, solid = 0;
      let min = 9, max = -9, sum = 0, seen = 0;
      for (let i = 0; i < Math.round(secs * 60); i++) {
        const y0 = bell.y;
        bell.update(1 / 60, p, W, g);
        const d = Math.abs(bell.y - y0);
        frames++;
        if (d > worstM) worstM = d;
        // a frame at exactly its own speed is not a frame faster than it swims
        if (d * 60 > own + 1e-6) over++;
        if (!W.liquidAt(Math.floor(bell.x), Math.floor(bell.y + 0.2), Math.floor(bell.z))) dry++;
        if (spanSolid(bell)) solid++;
        const film = filmOf(bell);
        if (film !== null) {
          const under = film - (bell.y + TALL);
          seen++; sum += under;
          if (under < min) min = under;
          if (under > max) max = under;
        }
      }
      return { frames, worstM: +worstM.toFixed(4), worstPerS: +(worstM * 60).toFixed(2),
        ratio: +(worstM * 60 / own).toFixed(2), over, dry, solid,
        under: seen ? { min: +min.toFixed(2), max: +max.toFixed(2), mean: +(sum / seen).toFixed(2), seen } : null,
        at: [f2(bell.x), f2(bell.y), f2(bell.z)] };
    };

    /* rig A: a bell stood in the deepest of those columns, at the height the rest
       of the field hangs at, and left to the level law for ten seconds with no
       errand, no shove and no neighbour: what is left is the level and nothing
       else. The row says a crown HOVER under the film, give or take the swing. */
    const place = (col, y) => {
      bell.x = col.x + 0.5; bell.z = col.z + 0.5; bell.y = y;
      bell.tx = bell.x; bell.tz = bell.z; bell.homeX = bell.x; bell.homeZ = bell.z; bell.pause = 1e9;
      return [f2(bell.x), f2(bell.y), f2(bell.z)];
    };
    const other = field.slice(1).reduce((m, c) => m + c.y, 0) / Math.max(1, field.length - 1);
    const hungIn = cappedDeep || deepest;
    out.hungIn = hungIn;
    out.hung = Object.assign({ stood: place(hungIn, other) }, run(10));

    /* rig B: the same column, a bell put down on the bottom of it and let go. This
       asks the rate on its own, with no help from the level law: whatever the
       level is, the way up to it is not a lift, and it has to be a way that
       arrives -- a law satisfied by never moving anything would pass the rate and
       fail this. The height it has to reach is the one its row states, asked of
       the column here and not of the law under test. */
    const row = deepest.film - TALL - HOVER;
    out.risenIn = deepest;
    out.risen = Object.assign({ row: f2(row), stood: place(deepest, deepest.bed + 0.35),
      climb: f2(row - (deepest.bed + 0.35)) }, run(10));
    /* a bell that reaches its level is within the swing of it; a bell left on the
       lakebed under the tower is the whole depth of the water away from it */
    out.risen.arrived = Math.abs(bell.y - row) < BOB + 0.4;
    keep.forEach(({ k, v }) => { bell[k] = v; });
    return out;
  });
  check('the water a swimming body hangs in is told by the water in the column, not by the brick standing over it',
    !towerWater.error && towerWater.wet > 0 && towerWater.deep > 0 && towerWater.bedTakes === 0, towerWater);
  check('a bell stood in the deepest of those columns hangs where its own row says it hangs, in water, out of brick',
    !!towerWater.hung && !!towerWater.hung.under &&
    towerWater.hung.under.min > 0.2 && towerWater.hung.under.max < towerWater.hover + 1.2 &&
    Math.abs(towerWater.hung.under.mean - towerWater.hover) < 0.35 &&
    towerWater.hung.dry === 0 && towerWater.hung.solid === 0, towerWater.hung);
  check('a bell put on the bottom of that column comes up to its level, and the water never closes that height faster than it swims',
    !!towerWater.hung && !!towerWater.risen && towerWater.hung.ratio <= 1.05 &&
    towerWater.risen.climb > 3 && towerWater.risen.ratio <= 1.05 &&
    towerWater.risen.arrived === true, { hung: towerWater.hung, risen: towerWater.risen });

  /* 11m4. A place the game sends a body to has to be a place a body can stand,
     and the sky zone was the one place it never asked. `samplePos` picks a column
     five ways and four of them end at the same validation: the ground of that
     column, the cell over it open, sky over the tallest thing in it for a body
     with wings, no water, not under the world. The fifth -- `kind: 'sky'`, the
     floating isles -- answered the height itself, `isle.top + 1` straight out of
     the isle table in `data/world.js`, and returned before any of that ran. Asked
     of the world the running game made, that copied height puts a body **inside**
     a block in **156** of the **850** columns of deck the six isles hold (a pine's
     trunk, a spray of needles, a cell of dirt, one of the old beams), leaves no
     sky over the column in **470** more, and leaves **662** where the cell stands
     open at the body's rows with something holding under it. And the disc the
     sample draws from is a disc of points while a column is named by its corner:
     a point anywhere in an isle's disc rounds to **1,016** different columns, and
     **166** of them belong to no isle at all -- valley floor, which is ground like
     any other -- so a body asked for in the sky could be put down in the wood. No
     species reaches that branch today, because no `habitat[0]` in
     `data/creatures.js` names a sky zone (the owl's is whisperwood, and cloudspire
     is fourth on its list), which is the whole reason it survived: a latent defect
     is not a harmless one, it is an untested one. Asked of the branch as it now
     stands: **300** calls, **0** refusals, **0** bodies on a column that is not an
     isle's deck, **0** standing inside a block, **0** with nothing holding under
     their feet, **0** without sky over their heads -- and between **28** and
     **36** (the draw is random; the number is reported, never gated) with a trunk or a
     spray of needles in the row over their feet, which is not a trap for a flyer:
     the spawn lifts a flying body above the top of its own column before it ever
     moves. The decks themselves are read here as well, in the world the game made
     rather than the one a checker builds: **850** columns, **850** holding at the
     row the chapter prints, **0** holes, worst drop **0** rows. */
  const skyStand = await step('aSkySpawnIsGivenADeckToStandOn', () => {
    const g = window.game, N = window.FRUTARIA, W = g.world;
    const out = { tries: 300, got: 0, nulls: 0, noDeck: 0, feetIn: 0, headIn: 0, unsupported: 0, noSky: 0 };
    for (let t = 0; t < 300; t++) {
      /* spread 0 and no `at`, so the zone's own branch is what is being asked */
      const p = g.samplePos('cloudspire', null, 0, true);
      if (!p) { out.nulls++; continue; }
      out.got++;
      const fx = Math.floor(p.x), fz = Math.floor(p.z), fy = Math.floor(p.y);
      if (!N.isleDeckAt(fx, fz)) out.noDeck++;
      if (W.solidAt(fx, fy, fz)) out.feetIn++;
      if (W.solidAt(fx, fy + 1, fz)) out.headIn++;
      if (!W.solidAt(fx, fy - 1, fz)) out.unsupported++;
      if (N.groundY(W, fx, fz, W.h - 1) + 3 >= W.h) out.noSky++;
    }
    /* and the decks those answers stand on, census of the world this game made:
       every column of every isle's disc, read at the row the chapter prints */
    const trap = { cols: 0, held: 0, fell: 0, worst: 0, inside: 0, open: 0 };
    for (const i of N.SKY_ISLES) {
      for (let dz = -i.r; dz <= i.r; dz++) for (let dx = -i.r; dx <= i.r; dx++) {
        if (Math.hypot(dx, dz) > i.r) continue;
        const x = i.x + dx, z = i.z + dz;
        if (x < 0 || z < 0 || x >= W.w || z >= W.d) continue;
        trap.cols++;
        if (W.solidAt(x, i.top, z)) trap.held++;
        else {
          let fl = -1;
          for (let y = i.top; y > 0; y--) if (W.solidAt(x, y, z)) { fl = y; break; }
          if (i.top - fl > trap.worst) trap.worst = i.top - fl;
          trap.fell++;
        }
        if (W.solidAt(x, i.top + 1, z)) trap.inside++;
        if (!W.solidAt(x, i.top + 1, z) && !W.solidAt(x, i.top + 2, z) && W.solidAt(x, i.top, z)) trap.open++;
      }
    }
    out.trap = trap;
    return out;
  });
  check('a body asked for in the sky is put on an isle, and the game never refuses the sky',
    skyStand.got === skyStand.tries && skyStand.nulls === 0 && skyStand.noDeck === 0, skyStand);
  check('and the cell it is put in is open where its feet are, with something holding under them',
    skyStand.feetIn === 0 && skyStand.unsupported === 0, skyStand);
  check('and a body asked for with room to fly has room to fly',
    skyStand.noSky === 0, skyStand);
  check('the decks of the six isles hold at the row the chapter prints, in the world this game made',
    skyStand.trap.held === skyStand.trap.cols && skyStand.trap.fell === 0 && skyStand.trap.worst === 0, skyStand.trap);

  /* 11n. A body walked into a bank stands on its feet. The step-up lifts a body
     over a riser, and the lift used to be tested at the spot the body already
     stands in -- where of course there is room -- and the move was then retried
     with the speed the collision had already zeroed along the axis it had to
     stop, so the body never moved and the lift was kept anyway. A body pressed
     against a bank it cannot climb was raised 0.15 m, dropped back, raised
     again: walked at a bank two metres tall, a human stood on the ground in
     **34%** of frames and its height swung **0.124 m** within a second, a bear
     in **31%**. And the same broken retry meant the lift never once carried a
     body up a step it could reach: a bear whose own record says its legs reach
     **1.1 m**, walked at a step of one metre, gained **0.124 m** in three
     seconds and stood on the ground in 31% of frames. Now the retry is handed
     the move the body asked for, and a lift that ends where the body already
     was is thrown away: the human and the bear stand on the ground in every one
     of those frames with a swing of **0**, and the bear climbs the step it can
     reach and ends standing on top of it, **1.02 m** up. A step taller than the
     legs is still not climbed -- the human gains **0** against a step of a
     metre and against a bank of two. And with nothing built there the same two
     bodies simply walk: they were on the ground in **89%** and **78%** of the
     frames of a shorter run, swinging the same 0.124 m, and they are on the
     ground in every one of them now with a swing of 0. A hopping body is not
     measured for standing: a frog at the same bank is off the ground in 77% of
     frames because hopping is what its own record says it does on land, and
     what is asked of it is that its feet come back down, which they do. */
  const wall = await step('aBodyWalkedIntoABankStandsOnItsFeet', () => {
    const g = window.game, N = window.FRUTARIA, W = g.world, p = g.player;
    /* The bank is built, not hunted: one shelf, one riser, the same place and
       the same height for every body and every run. What is hunted is the shelf
       it is built on, and two things are asked of it, both read over the ground
       a body can reach in this step rather than over a shape invented for the
       search: level -- the longest run here walks 1.5 s at a top speed of 5 m/s,
       which is 13 cells towards the bank and 7 across it -- and clear of
       everything solid along the way it walks. A crown is not a wall the
       movement code refuses, but a body set down inside one, or walked into one,
       is a body whose box overlaps a block it cannot pass, and the widest body
       measured here (the bear's 1.4 m box) covers three cells across. The search
       used to ask for a 13x13 level square and nothing at all about the cells
       the body walks through: widening the lake moved the shoreline terrace, and
       with it the only 13x13 in the valley (over the whole map 0 columns pass a
       13x13 now, 13 pass this footprint -- 16 passed it before the lake was
       widened, so the search is not fitted to the new map either). The shelf it
       then found had a tree standing in the row the bank is built in: the bear
       was stopped by three metres of crown before the metre of bank it was
       meant to climb, and gained 0. */
    let spot = null;
    for (let z = 12; z < W.d - 12 && !spot; z++)
      for (let x = 12; x < W.w - 12 && !spot; x++) {
        const gy = N.terrainY(W, x, z, W.h - 1);
        if (gy <= 8 || gy >= 24) continue;
        if (N.waterTop(W, x, z, W.h - 1) >= 0) continue;
        let flat = true;
        for (let dz = -6; dz <= 6 && flat; dz++) for (let dx = -3; dx <= 3; dx++)
          if (N.terrainY(W, x + dx, z + dz, W.h - 1) !== gy) { flat = false; break; }
        if (!flat) continue;
        let clear = true;
        for (let dz = -6; dz <= 2 && clear; dz++) for (let dx = -2; dx <= 2; dx++)
          for (let dy = 0; dy <= 2; dy++)
            if (W.solidAt(x + dx, gy + dy, z + dz)) { clear = false; break; }
        if (!clear) continue;
        spot = { x: x + 0.5, z: z + 0.5, gy, bx: x, bz: z - 2, block: W.get(x, gy - 1, z - 2) };
      }
    if (!spot) return { error: 'no flat shelf' };
    /* The surface at gy means the top block of the ground is the one at gy - 1,
       so a bank h blocks tall is the blocks at gy .. gy + h - 1. */
    const cells = [];
    for (const dx of [-2, -1, 0, 1, 2]) for (const dy of [0, 1])
      cells.push([spot.bx + dx, spot.gy + dy, spot.bz]);
    const was = cells.map(c => W.get(c[0], c[1], c[2]));
    const build = (h) => cells.forEach(c =>
      W.set(c[0], c[1], c[2], (c[1] === spot.gy ? 1 : 2) <= h ? spot.block : 0));
    const pw = { x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, form: p.form,
      formT: p.formT, formMax: p.formMax, grounded: p.grounded, inWater: p.inWater,
      held: p.held, air: p.air, vital: p.vital, yaw: p.yaw, faceYaw: p.faceYaw,
      pitch: p.pitch, input: g.input };
    const run = (form, secs) => {
      p.form = form; p.formT = 9999; p.formMax = 9999;
      p.x = spot.x; p.z = spot.z + 1.2;
      /* Feet on the shelf, not on the highest thing in the column: `groundY`
         answers "the top of the highest solid block", and a crown is solid, so
         over a shelf with a tree standing in it it put the body down on the
         leaves seven metres up, inside its own crown, and the step's own guard
         sent every body away. The shelf is level at gy over every cell a body
         can stand in here, so gy is the surface under its feet. */
      p.y = spot.gy + 0.0005;
      p.vx = p.vy = p.vz = 0; p.pitch = 0;
      const yw = Math.atan2(spot.bx - p.x, -(spot.bz - p.z)); p.faceYaw = yw; p.yaw = yw;
      p.inWater = false; p.held = 0; p.air = 999; p.vital = 10; p.grounded = true;
      p.airAmt = 0; p.crouch = 0; p.squash = 0; p.hopT = 0; p.wind = 0; p.bank = 0; p.tilt = 0;
      if (p.hits(p.x, p.y, p.z)) return null;      // the body has to start free
      const y0 = p.y;
      let gnd = 0, n = 0, boxIn = 0, hi = y0;
      const ys = [];
      for (let i = 0; i < Math.round(secs * 60); i++) {
        g.input = { fwd: 1 };
        p.update(1 / 60, g.input, g); g.time += 1 / 60; n++;
        if (p.grounded) gnd++;
        if (p.hits(p.x, p.y, p.z)) boxIn++;
        if (p.y > hi) hi = p.y;
        ys.push(p.y);
      }
      g.input = {};
      /* the gap between the feet and the surface under them over the last
         second: a body that stands never has one, and a body that hops has it
         only between the launch and the landing */
      let gapMin = 1e9, gapMax = -1e9;
      for (let i = ys.length - 60; i < ys.length; i++) {
        const gap = ys[i] - N.standY(W, Math.floor(p.x), Math.floor(p.z), ys[i]);
        if (gap < gapMin) gapMin = gap;
        if (gap > gapMax) gapMax = gap;
      }
      const last = ys.slice(-60);
      return { step: p.formDef.step || 0, gndPct: Math.round(gnd / n * 100),
        span: +(Math.max.apply(null, last) - Math.min.apply(null, last)).toFixed(4),
        gapMin: +gapMin.toFixed(4), gapMax: +gapMax.toFixed(4),
        gained: +(hi - y0).toFixed(3), boxIn };
    };
    const res = { spot };
    /* the third one has nothing built: the same body on the same shelf with
       nothing in front of it, which is the control that says the rule above did
       not stop a body walking */
    for (const [h, secs] of [[2, 3], [1, 3], [0, 1.5]]) {
      build(h);
      const per = {};
      for (const form of [null, 'frogpear', 'bruinfig', 'owlberry'])
        per[form || 'human'] = run(form, secs);
      res['bank' + h] = per;
    }
    cells.forEach((c, i) => W.set(c[0], c[1], c[2], was[i]));
    Object.assign(p, pw);
    g.input = pw.input;
    res.restored = cells.every((c, i) => W.get(c[0], c[1], c[2]) === was[i]);
    return res;
  });
  const onFeet = (k) => !!wall.bank2 && !!wall.bank2[k] && wall.bank2[k].gndPct >= 90;
  check('a body walked into a bank taller than its own legs stays on its feet',
    onFeet('human') && onFeet('bruinfig') && onFeet('owlberry'), wall);
  check('and its height does not swing while it is pressed against it',
    !!wall.bank2 && ['human', 'bruinfig'].every(k => wall.bank2[k].span <= 0.02), wall);
  check('every body comes back down to its feet, hopping or not',
    !!wall.bank2 && ['human', 'frogpear', 'bruinfig', 'owlberry']
      .every(k => wall.bank2[k].gapMin <= 0.02), wall);
  check('a step the body reaches with its own legs is still climbed',
    !!wall.bank1 && wall.bank1.bruinfig.gained >= 0.9, wall);
  check('and a step taller than that is not',
    !!wall.bank1 && !!wall.bank2 && wall.bank1.human.gained <= 0.05 &&
    wall.bank2.human.gained <= 0.05 && wall.bank2.bruinfig.gained <= 0.05, wall);
  check('with nothing built in front of it the same body just walks',
    !!wall.bank0 && ['human', 'bruinfig'].every(k => wall.bank0[k].gndPct >= 90 && wall.bank0[k].span <= 0.02), wall);
  check('and no body is left inside the bank, or the bank inside the world',
    wall.restored && ['bank2', 'bank1', 'bank0'].every(k =>
      Object.keys(wall[k]).every(f => wall[k][f] === null || wall[k][f].boxIn === 0)), wall);

  /* 11o. First person shows the valley, and nothing of the body wearing it. The
     view used to carry a hand: a box-built paw bolted to the corner of the lens,
     swapped whenever the body changed, drawn with the depth test off so nothing
     could ever stand in front of it. It reached nothing, held nothing, pushed
     nothing and indicated nothing; it cost a mesh per body, a draw call per
     frame, a `hand` field on every body record and four model tables. The lens
     stands where the body stands, and the renderer has always known what that
     means: a body is not drawn when the lens is inside it, or you look at the
     inside of your own skull. The hand was the one exception to that rule, so
     the rule is now asked for directly -- the meshes a first-person frame draws
     are exactly the meshes a frame from the same lens draws with the body's own
     parts taken out of the world. Measured: 54 meshes, the same 54 both ways,
     and one draw call and 72 triangles fewer in every first-person frame than
     before the hand went (the village shot: 55 draws / 71256 tris before, 54 /
     71184 after). */
  const ownLens = await step('firstPersonShowsNoBody', () => {
    const g = window.game, N = window.FRUTARIA, R = g.R, p = g.player;
    const was = { form: p.form, x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch,
      vx: p.vx, vy: p.vy, vz: p.vz, vital: p.vital, fright: p.fright, dry: p.dry, air: p.air,
      third: g.thirdPerson, cam: g.cam, ready: g.camReady, frame: g._camFrame,
      mode: g.mode, hover: g.hover, input: g.input, time: g.time };
    p.form = null; p.vital = 10; p.fright = 0; p.dry = 0; p.air = 999;
    g.mode = 'play'; g.hover = null; g.input = {};
    g.time = N.DAY_LEN * (13 / 24);
    p.x = N.spawn.x; p.y = N.spawn.y; p.z = N.spawn.z; p.vx = p.vy = p.vz = 0;
    for (let i = 0; i < 30; i++) g.update(1 / 60);
    g.particles.n = 0;
    /* one lens, one field of view, held for both frames: the culling that picks
       which chunks reach the frame reads the field of view, so a third-person
       lens (which opens up by 8 degrees) would be a different world */
    g.thirdPerson = false; g.camReady = false; g.cam = { d: 0, fov: p.fov() };
    const cf = g.shootCamera(p);
    const drawn = () => {
      const set = new Set();
      const orig = R.drawMesh;
      R.drawMesh = (mesh, m, o) => { set.add(mesh); return orig.call(R, mesh, m, o); };
      g.particles.n = 0; g.hover = null;
      g._camFrame = cf;
      g.render();
      delete R.drawMesh;              // the wrapper was an own property
      return set;
    };
    const first = drawn();
    // the same lens, the same world, the body's own parts not in it
    g.thirdPerson = true;
    const keep = g.ensureModel.bind(g);
    g.ensureModel = (id) => (id === p.modelId ? [] : keep(id));
    const filmed = drawn();
    delete g.ensureModel;
    g.thirdPerson = was.third;
    const extra = [...first].filter((m) => !filmed.has(m)).length;
    const missing = [...filmed].filter((m) => !first.has(m)).length;
    Object.assign(p, { x: was.x, y: was.y, z: was.z, yaw: was.yaw, pitch: was.pitch, form: was.form,
      vx: was.vx, vy: was.vy, vz: was.vz, vital: was.vital, fright: was.fright,
      dry: was.dry, air: was.air });
    g.cam = was.cam; g.camReady = was.ready; g._camFrame = was.frame;
    g.mode = was.mode; g.hover = was.hover; g.input = was.input; g.time = was.time;
    g.updateEnv();
    return { meshes: first.size, same: first.size === filmed.size, extra, missing,
      lens: [+cf.x.toFixed(1), +cf.y.toFixed(1), +cf.z.toFixed(1)],
      noHandPath: typeof g.ensureHand === 'undefined' && typeof N.buildHandMesh === 'undefined',
      noHandField: N.FRUITS.every((f) => !f.form || f.form.hand === undefined) &&
                   N.HUMAN_FORM.hand === undefined };
  });
  check('first person draws exactly what the same lens draws with the body taken out of the world',
    !ownLens.error && ownLens.same && ownLens.extra === 0 && ownLens.missing === 0, ownLens);
  check('and the game keeps no first-person hand to draw, and no body record names one',
    ownLens.noHandPath && ownLens.noHandField, ownLens);

  /* 11p. The minimap paints the lake as water. The HUD map is a 160 x 160 canvas
     built once from the world: for every column it asks what that column shows to
     a lens straight above it, and paints the colour of that block, with the
     water's own palette and a shade that follows the depth of the water. The
     scan asked for the highest **solid** block, and water is not solid -- the
     block row says so, and everything else in the game believes it -- so the
     scan walked down through the whole lake and stopped at the lakebed. Every
     one of the valley's **2,970** wet columns was painted with the colour of its
     own floor (Mirrorlake's sand and mud: 112/104/74, 148/137/98), the lake read
     as a dry pit in the middle of the green, and the water palette the same
     function holds was never reached by a single pixel. The depth run was wrong
     the same way: it counted **up** from wherever the scan had stopped, which
     asks the sky how much water is above the lake and always answers one.
     Measured over the whole map: **0** of 2,970 wet columns painted as water
     before, **2,816** after. The other **133** have something solid standing
     over the water -- the sunken tower, the keep, a tree -- and **21** more sit
     under a POI dot, which is painted over the base and is warm by itself.
     The land is the control: a dry column is painted with the colour of the
     block on top of it, and the shading scales all three channels by one number,
     so the order between red and blue cannot change -- **0** dry columns may
     come out blue-dominant where their own block is red-dominant. */
  const mmPaint = await step('theMinimapPaintsTheLakeAsWater', () => {
    const N = window.FRUTARIA, W = window.game.world, ui = window.ui;
    /* the base is built once, at boot, against the world as it was then; build
       it again here so the step measures the code against the world as it is */
    ui.buildMinimap();
    const S = ui.mmBase.width, D = ui.mmBase.height;
    const img = ui.mmBase.getContext('2d').getImageData(0, 0, S, D).data;
    const px = (x, z) => { const i = (z * S + x) * 4; return [img[i], img[i + 1], img[i + 2]]; };
    const B = N.BLOCKS;
    /* the POI dots are painted over the base, and they are warm: a marker
       sitting over open water is not the map calling the lake dry */
    const marked = (x, z) => N.POIS.some(q => Math.hypot(q.x - x, q.z - z) <= 2.5);
    let wet = 0, open = 0, hidden = 0, skipped = 0, openWarm = 0;
    let dry = 0, dryWrong = 0;
    const deep = [], shallow = [];
    for (let z = 0; z < D; z++) for (let x = 0; x < S; x++) {
      const surf = W.liquidSurfaceAt(x, z);
      let topSolid = -1;
      for (let y = W.h - 1; y >= 0; y--) { const b = W.get(x, y, z); if (b && B[b] && B[b].solid) { topSolid = y; break; } }
      const p = px(x, z);
      const warm = p[0] > p[2];                 // red over blue: a surface, not water
      if (surf >= 0) {
        wet++;
        if (topSolid >= surf) { hidden++; continue; }   // something stands over the water
        if (marked(x, z)) { skipped++; continue; }
        open++;
        if (warm) openWarm++;
        let depth = 0;
        for (let y = surf - 1; y >= 0 && W.liquidAt(x, y, z); y--) depth++;
        if (depth >= 6) deep.push(p); else if (depth <= 2) shallow.push(p);
      } else {
        dry++;
        if (marked(x, z)) continue;
        const bd = B[W.get(x, topSolid, z)] || {};
        const c = bd.ct || bd.c || [0, 0, 0];
        if (c[0] > c[2] && !warm) dryWrong++;
      }
    }
    const mean = (a, k) => a.length ? +(a.reduce((s, v) => s + v[k], 0) / a.length).toFixed(1) : null;
    const lum = p => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
    const lumOf = a => a.length ? +(a.reduce((s, v) => s + lum(v), 0) / a.length).toFixed(1) : null;
    return { wet, open, hidden, skipped, openWarm, dry, dryWrong,
      deepN: deep.length, shallowN: shallow.length,
      deepLum: lumOf(deep), shallowLum: lumOf(shallow),
      deepRed: mean(deep, 0), shallowRed: mean(shallow, 0),
      deepBlue: mean(deep, 2), shallowBlue: mean(shallow, 2),
      lake: px(60, 90), wood: px(30, 40) };
  });
  check('the valley has a lake big enough to measure on the map',
    !mmPaint.error && mmPaint.wet > 1000 && mmPaint.open > 800, mmPaint);
  check('every column the water is the top of is painted as water, not as its own floor',
    mmPaint.openWarm === 0, mmPaint);
  check('and the depth of the water is counted down into it, not up into the sky',
    mmPaint.deepN > 100 && mmPaint.shallowN > 100 &&
    mmPaint.shallowRed - mmPaint.deepRed >= 20 && mmPaint.deepBlue > mmPaint.deepRed, mmPaint);
  check('the land is still painted with the colour of what stands on it',
    mmPaint.dry > 10000 && mmPaint.dryWrong === 0, mmPaint);

  /* ---- the mesher and the lake next door ----
     A chunk's vertices carry how deep the water above them is, and the question
     reaches a column past the chunk: a lakebed face standing on a chunk border
     takes its depth from a column that lives in the next chunk over, and a
     horizontal face hands in the surface of the block under it, which stands on
     the corner's diagonal. So the table the mesher keeps has to cover the ring
     as well as the chunk. Read the depth byte back off the meshes it uploads
     and check every one of them against the lake, column by column, and show
     that some of them could not have come from inside the chunk at all.
     The audit asks the column a vertex stands **in**, not the one it is drawn
     on, and that is not the same question for every vertex: a block corner sits
     on a column line, but the corner of a micro box -- the kelp the lakebed now
     grows, a berry hanging in a tower window -- sits inside one, at a fractional
     x, z and height. The mesher used to hand those corners no water at all,
     which cost nothing while nothing micro stood in it and costs the lake its
     bed the day the kelp starts growing: 10,656 micro corners over the 24 wet
     chunks, 5,328 of them under the surface, and every one of them lit by full
     noon. The depth is uploaded in 1/8 m steps taken by truncation, which is
     exact for a block corner and not for a stem standing at y+0.2, so the audit
     truncates the same way it does.
     The same step holds a rebuild to the budget the game sets itself: the most
     expensive chunk in the valley has to rebuild inside the 6 ms a frame gives
     meshing, and inside half a millisecond per thousand vertices it uploads.
     Measured before the ring table was built up front: 4.15 ms for a chunk on
     average, 15.4 ms for the worst (17,064 vertices, 0.90 ms per thousand), and
     22.5 ms for the two chunks one fruit picked in that chunk flags. After:
     about 1.05 ms on average. The worst chunk is deliberately not claimed here:
     four runs of this same sweep named four different chunks and read
     1.8 ms, 1.9 ms, 2.1 ms and 4.8 ms for them, which is why the clock below is a generous
     backstop of 12 ms rather than a measured ceiling. */
  const meshWater = await step('theMesherKeepsTheLakeNextDoor', () => {
    const g = window.game, N = window.FRUTARIA, W = g.world, R = g.R;
    const B = N.BLOCKS;
    /* the water in one column, read here rather than off the mesher's table:
       the height of its surface and the lowest cell that water reaches. The key
       is the two numbers themselves and not a packing of them: the vertices read
       back here include the corners of micro boxes -- the kelp the lakebed now
       grows -- and those do not stand on column lines, so a decimal packing like
       (x+1)*(d+2)+(z+1) lets one such corner answer on behalf of a whole column
       asked for earlier. That is how 756 vertices of level lakebed came to be
       reported as wearing a depth no column of the lake gives. */
    const runs = new Map();
    const col = (x, z) => {
      const k = x + ',' + z;
      let r = runs.get(k);
      if (r === undefined) {
        let top = -1, bot = -1;
        for (let y = W.h - 1; y >= 0; y--) {
          const bd = B[W.get(x, y, z)];
          if (bd && bd.liquid) { if (top < 0) top = y; }
          else if (top >= 0) { bot = y + 1; break; }
        }
        r = top < 0 ? null : { top: top + 1, bot };
        runs.set(k, r);
      }
      return r;
    };
    const wetCi = [];
    for (let cz = 0; cz < W.cz; cz++) for (let cx = 0; cx < W.cx; cx++) {
      let any = false;
      for (let z = cz * W.cs; z < cz * W.cs + W.cs && !any; z++)
        for (let x = cx * W.cs; x < cx * W.cs + W.cs && !any; x++) if (col(x, z)) any = true;
      if (any) wetCi.push(cz * W.cx + cx);
    }
    const up0 = N.MeshBuilder.prototype.upload;
    let cap = null;
    N.MeshBuilder.prototype.upload = function (gl) { if (cap) cap.push({ pos: this.pos, dat: this.dat }); return up0.call(this, gl); };
    let verts = 0, wet = 0, bad = 0, cross = 0, deep = 0, micro = 0, microWet = 0;
    const badEx = [];
    for (const ci of wetCi) {
      const x0 = (ci % W.cx) * W.cs, z0 = ((ci / W.cx) | 0) * W.cs;
      cap = [];
      W.buildChunk(R.gl, ci);
      const got = cap; cap = null;
      for (const m of got) {
        const pos = m.pos, dat = m.dat;
        for (let i = 0, v = 0; i < pos.length; i += 3, v++) {
          const x = pos[i], y = pos[i + 1], z = pos[i + 2];
          const d = dat[v * 4 + 2] / 8;
          verts++;
          if (d > 0) wet++;
          if (d > deep) deep = d;
          /* The column this vertex stands in. A block corner sits on a column
             line and asks the one it is drawn on; the corner of a micro box --
             the kelp the lakebed now grows, a berry hanging in a tower window --
             sits **inside** one, and the column it is inside is the one that
             answers for it. */
          const bx = x | 0, bz = z | 0;
          if (bx !== x || bz !== z) { micro++; if (d > 0) microWet++; }
          /* The depth is uploaded in 1/8 m steps, and the step is taken by
             truncation. For a block corner that is exact -- a corner stands on a
             column line and a whole number of blocks of water sit over it. A
             micro box corner is not at a whole height (a stem 0.9 m tall stands
             at y+0.2 and y+1.1), so the answer is not a whole number and the
             upload rounds it down; the audit has to round the same way or it
             reads an exact answer as a wrong one. */
          const q = (m) => Math.min(255, (Math.max(0, m) * 8) | 0) / 8;
          // the five columns the point question asks about this vertex ...
          let point = 0, pointOwn = 0;
          for (let q2 = 0; q2 < 5; q2++) {
            const qx = bx + (q2 === 1 ? 1 : q2 === 2 ? -1 : 0), qz = bz + (q2 === 3 ? 1 : q2 === 4 ? -1 : 0);
            const r = col(qx, qz);
            if (!r || y < r.bot || y >= r.top) continue;
            const dd = q(r.top - y);
            if (dd > point) point = dd;
            if (qx >= x0 && qx < x0 + W.cs && qz >= z0 && qz < z0 + W.cs && dd > pointOwn) pointOwn = dd;
          }
          // ... and the nine a face may hand its own surface in from
          const allowed = new Set([point]), allowedOwn = new Set([pointOwn]);
          for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
            const r = col(bx + dx, bz + dz);
            if (!r) continue;
            allowed.add(q(r.top - y));
            if (bx + dx >= x0 && bx + dx < x0 + W.cs && bz + dz >= z0 && bz + dz < z0 + W.cs)
              allowedOwn.add(q(r.top - y));
          }
          if (!allowed.has(d)) { bad++; if (badEx.length < 3) badEx.push([x, y, z, d, point]); }
          if (!allowedOwn.has(d)) cross++;
        }
      }
    }
    /* The cost, asked two ways: as time, and as a count of the lookups the water
       question costs. The time is the number a frame feels, and it is also the
       number this machine is worst at telling: other things ran through the whole
       pass, and one chunk of 7,000 vertices is a couple of milliseconds of work,
       which is mostly noise -- the same sweep read 1.8 ms a chunk on a quiet
       machine and 2.8 ms on a loaded one. So the budget here is generous, and the
       sharp edge is the count: the question "how much water stands over this
       vertex" has to be answered out of a table, not out of a hash. Asked of a
       hash it cost five lookups a vertex, 5.5M of them over the valley, which is
       what this file used to do.
       The worst chunk is asked the same question once more: three times, and it
       is read as the *minimum* of the three. The machine this runs on
       preempts: the sweep runs 400 chunks back to back, and one of them takes
       whatever else is on the box with it. Measured with a headless browser
       sweeping the same machine, one chunk read 20.4 ms against 2.8..3.6 ms on
       the quiet passes around it, and the law went red on a machine that had
       done nothing wrong. The minimum of the passes is what the chunk costs
       when the machine is not busy with something else, and it is still the
       number a frame feels -- a frame that gets preempted is preempted as a
       frame, not as one chunk, and a chunk that costs 15 ms on every pass
       answers 15 to the minimum and goes red the same way. The raw worst of
       all three passes is reported next to it, for the record, and is not
       asked of. */
    let best = null;
    const mapGet = Map.prototype.get;
    let gets = 0;
    Map.prototype.get = function (k) { gets++; return mapGet.call(this, k); };
    const perCi = new Array(W.cx * W.cz).fill(Infinity);
    let rawWorst = { ms: 0, ci: -1 };
    for (let pass = 0; pass < 3; pass++) {
      let total = 0, nv = 0;
      for (let ci = 0; ci < W.cx * W.cz; ci++) {
        const t = performance.now(); W.buildChunk(R.gl, ci);
        const ms = performance.now() - t;
        total += ms;
        if (ms < perCi[ci]) perCi[ci] = ms;
        if (ms > rawWorst.ms) rawWorst = { ms, ci };
        let n = 0; const m = W.chunks[ci];
        if (m) for (const q of m) if (q) n += q.count;
        nv += n;
      }
      if (!best || total < best.total) best = { total, nv };
    }
    Map.prototype.get = mapGet;
    let worstCi = 0;
    for (let ci = 1; ci < perCi.length; ci++) if (perCi[ci] > perCi[worstCi]) worstCi = ci;
    N.MeshBuilder.prototype.upload = up0;
    return { chunks: wetCi.length, verts, wet, bad, badEx, cross, deep, micro, microWet,
      sweepVerts: best.nv, sweepMs: +best.total.toFixed(1),
      meanMs: +(best.total / (W.cx * W.cz)).toFixed(2),
      worstMs: { ms: +perCi[worstCi].toFixed(2), ci: worstCi },
      worstRaw: { ms: +rawWorst.ms.toFixed(2), ci: rawWorst.ci },
      perK: +(best.total / Math.max(1, best.nv) * 1000).toFixed(3),
      mapGets: gets, getsPerK: +(gets / Math.max(1, best.nv) * 1000).toFixed(1) };
  });
  check('every depth byte the mesher uploads is one the lake itself gives',
    !meshWater.error && meshWater.bad === 0 && meshWater.wet > 5000, meshWater);
  check('and some of them can only have come from a column in the next chunk over',
    !meshWater.error && meshWater.cross > 20, meshWater);
  check('the water question is answered out of a table, not out of a hash',
    !meshWater.error && meshWater.getsPerK < 100 && meshWater.mapGets < 200000, meshWater);
  check('and the whole valley rebuilds inside the budget a frame gives meshing',
    !meshWater.error && meshWater.worstMs.ms < 12 && meshWater.perK < 1, meshWater);
  check('and the corners that stand inside a column -- kelp, a berry in a window -- ask the column they stand in and wear it',
    !meshWater.error && meshWater.micro > 5000 && meshWater.microWet > 3000, meshWater);

  /* ---- the box round the block the crosshair is on ----
     The twelve bars used to be rebuilt in world coordinates every frame and
     thrown away again: 12 box calls, 432 vertices and 4,752 array pushes a
     frame, and while the crosshair was moving three GL buffers deleted and
     three made again with it. They are built once now, around the origin, and
     the block they are aimed at rides in the model matrix -- which is how a
     dropped fruit is already drawn. Walk the crosshair over six blocks and
     count what that costs, then read back where the bars land: one mesh, aimed
     six times, at the same twelve bars in the same world positions the old
     build made. Measured before: 360 uploads and 4,320 box calls over 360
     frames, and 0.035 ms of a 0.74 ms render pass. */
  const hlBox = await step('theHighlightBoxIsOneMesh', () => {
    const g = window.game, N = window.FRUTARIA, W = g.world, R = g.R;
    let spot = null;
    for (let z = 8; z < W.d - 8 && !spot; z++) for (let x = 8; x < W.w - 8 && !spot; x++)
      for (let y = W.h - 2; y > 1 && !spot; y--)
        if (W.get(x, y, z) && !W.get(x, y + 1, z)) spot = { x, y, z };
    if (!spot) return { error: 'no block with air over it' };
    const wasMode = g.mode, wasHover = g.hover;
    g.mode = 'play';
    g.hover = { x: spot.x, y: spot.y, z: spot.z };
    for (let i = 0; i < 10; i++) g.render();          // warm: nothing else builds now
    if (g._hl) { R.gl.deleteBuffer(g._hl.pos); R.gl.deleteBuffer(g._hl.col); R.gl.deleteBuffer(g._hl.dat); }
    g._hl = null;
    let uploads = 0, boxes = 0;
    const up0 = N.MeshBuilder.prototype.upload, bx0 = N.MeshBuilder.prototype.box;
    const cap = [];
    N.MeshBuilder.prototype.upload = function (gl) {
      uploads++;
      const m = up0.call(this, gl);
      const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
      for (let i = 0; i < this.pos.length; i += 3) for (let k = 0; k < 3; k++) {
        const v = this.pos[i + k]; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v;
      }
      cap.push({ mesh: m, n: this.n, lo, hi });
      return m;
    };
    N.MeshBuilder.prototype.box = function () { boxes++; return bx0.apply(this, arguments); };
    const dm0 = R.drawMesh, drawn = [];
    R.drawMesh = function (mesh, model, o) {
      if (g._hl && mesh === g._hl) drawn.push({ t: [model[12], model[13], model[14]], verts: mesh.count });
      return dm0.call(this, mesh, model, o);
    };
    const aims = [];
    for (let k = 0; k < 6; k++) {
      const at = { x: spot.x + k, y: spot.y, z: spot.z };
      g.hover = at; aims.push([at.x, at.y, at.z]);
      g.render();
    }
    N.MeshBuilder.prototype.upload = up0;
    N.MeshBuilder.prototype.box = bx0;
    R.drawMesh = dm0;
    g.mode = wasMode; g.hover = wasHover;
    const built = cap.find(c => c.mesh === g._hl) || null;
    if (!built) return { error: 'the box was never built', uploads, boxes, drawn: drawn.length };
    let boxErr = 0, aimErr = 0;
    for (let k = 0; k < 3; k++)
      boxErr = Math.max(boxErr, Math.abs(built.lo[k] + 0.025), Math.abs(built.hi[k] - 1.025));
    drawn.forEach((d, i) => {
      for (let k = 0; k < 3; k++) aimErr = Math.max(aimErr, Math.abs(d.t[k] - aims[i][k]));
    });
    return { spot, aims: aims.length, uploads, boxes, drawn: drawn.length,
      verts: built.n, boxErr: +boxErr.toFixed(6), aimErr: +aimErr.toFixed(6) };
  });
  check('walking the crosshair over six blocks builds one mesh, not six',
    !hlBox.error && hlBox.uploads === 1 && hlBox.boxes === 12, hlBox);
  check('and each frame aims that one mesh at the block the crosshair is on',
    !hlBox.error && hlBox.drawn === 6 && hlBox.aimErr < 1e-6, hlBox);
  check('the twelve bars are the twelve bars they were, at the same size',
    !hlBox.error && hlBox.verts === 432 && hlBox.boxErr < 1e-6, hlBox);

  /* A re-meshed chunk has to hand its old geometry back, or the card keeps a
     copy of a valley that no longer exists. Nothing in the game can see that
     happening: a buffer nobody refers to is invisible, costs memory for the rest
     of the session, and first shows up as a player who has been picking fruit
     for an hour. So the accounting is read straight off the GL context -- every
     buffer the mesher makes and every one it gives back -- over whole rebuilds
     of the valley, and over the one write a player takes hundreds of times:
     `Game.setBlock` flags the chunk, `rebuildDirty` re-meshes it. */
  const meshAcct = await step('noMeshIsLeftBehindWhenAChunkIsRemeshed', () => {
    const g = window.game, N = window.FRUTARIA, W = g.world, gl = g.R.gl;
    const P = WebGLRenderingContext.prototype;
    const fNew = P.createBuffer, fDel = P.deleteBuffer;
    let made = 0, freed = 0, live = 0;
    P.createBuffer = function () { const o = fNew.apply(this, arguments); if (o) { made++; live++; } return o; };
    P.deleteBuffer = function (o) { if (o) { freed++; live--; } return fDel.apply(this, arguments); };
    const out = {};
    try {
      const n = W.cx * W.cz;
      const standing = () => { let k = 0; for (let ci = 0; ci < n; ci++) for (const m of W.chunks[ci]) if (m) k++; return k; };
      out.standingBefore = standing();
      const deltas = [];
      for (let pass = 0; pass < 3; pass++) {
        const at = live;
        for (let ci = 0; ci < n; ci++) W.buildChunk(gl, ci);
        deltas.push(live - at);
      }
      out.deltas = deltas;
      out.standingAfter = standing();
      out.made = made; out.freed = freed;

      /* one block written and the rebuild that follows it, which is what a pick
         costs. The cell is filled and emptied again, so the valley it leaves
         behind is the valley it came in with, and the two diff entries the
         writes record are taken back out at the end. */
      const p = g.player, px = Math.floor(p.x), pz = Math.floor(p.z);
      let at = null;
      for (let y = 1; y < W.h - 1 && !at; y++) if (!W.get(px, y, pz) && W.solidAt(px, y - 1, pz)) at = { x: px, y, z: pz };
      const fb = N.FRUIT_BLOCK_REV[N.FRUITS[0].id];
      const ci = Math.floor(pz / W.cs) * W.cx + Math.floor(px / W.cs);
      const meshBefore = W.chunks[ci];
      const dBefore = g.diffs.length;
      const at0 = live;
      g.setBlock(at.x, at.y, at.z, fb);
      g.setBlock(at.x, at.y, at.z, 0);
      const rebuilt = W.rebuildDirty(gl, 1000);
      out.pick = { at: [at.x, at.y, at.z], block: fb, ci, delta: live - at0, rebuilt,
        replaced: W.chunks[ci] !== meshBefore, left: W.anyDirty(),
        back: W.get(at.x, at.y, at.z) === 0 && g.diffs.length === dBefore + 2 };
      g.diffs.length = dBefore;
      out.made = made; out.freed = freed;
      return out;
    } finally {
      P.createBuffer = fNew; P.deleteBuffer = fDel;
    }
  });
  check('rebuilding the whole valley leaves no buffer standing over the one it replaces',
    meshAcct.deltas && meshAcct.deltas.every(d => d === 0) && meshAcct.made === meshAcct.freed, meshAcct);
  check('and the valley is standing on the same number of meshes it was',
    meshAcct.standingBefore === meshAcct.standingAfter && meshAcct.standingBefore > 200, meshAcct);
  check('picking a block costs a chunk re-mesh and no buffers',
    meshAcct.pick && meshAcct.pick.delta === 0 && meshAcct.pick.replaced && meshAcct.pick.rebuilt > 0 &&
    !meshAcct.pick.left && meshAcct.pick.back, meshAcct.pick);


  /* A body is boxes that touch: 49.1% of the owl's box corners stand against
     another box, 49.0% of a frog's. Every part used to be lit with one flat
     value per face, so a leg meeting a body was a notch in the outline and
     nothing else -- measured over the pixels of a frog seen from 0.7 m, 93.2%
     of the neighbouring pairs inside the animal were exactly the same colour,
     and the frog's leg and body are the same green to begin with. The crease is
     read off the model's own boxes (models.js); this reads the shade bytes back
     out of the meshes as they are uploaded and asks, face by face and corner by
     corner, whether the shade now varies where a part meets another part and
     stays whole where nothing touches it. The corner coordinates are checked
     too: a shade value that landed on the wrong corner would pass a count of
     distinct values and still be nonsense. */
  const crease = await step('aBodyCarriesTheCreaseWhereItsPartsMeet', () => {
    const g = window.game, N = window.FRUTARIA, R = g.R;
    // the six faces of a box in the order MeshBuilder.box() draws them, with the
    // constants it applies and the corner order it lists them in: models.js
    // shades from the same shape, and if the two ever disagree the checks below
    // land on the wrong corner and the coordinate count catches it
    const BOX_FACE = [
      [1, 1, [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]]],
      [1, -1, [[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]]],
      [0, 1, [[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]]],
      [0, -1, [[0, 0, 1], [0, 0, 0], [0, 1, 0], [0, 1, 1]]],
      [2, 1, [[1, 0, 1], [0, 0, 1], [0, 1, 1], [1, 1, 1]]],
      [2, -1, [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]]]
    ];
    const FACE_S = [1.00, 0.42, 0.78, 0.66, 0.88, 0.58];
    const SLOT = [3, 2, 1, 3, 1, 0];           // the six vertices of one quad
    /* box() walks each face's four points backwards, because walked forwards
       the triangle they make faces into the box and the culler throws the whole
       near side of the body away (see the comment over box in engine.js). So
       the vertices reach the mesh in the reverse of the order the face is
       declared in, and the shade that goes with each one is the shade declared
       for that other corner. */
    const lo = (b, i) => b[i], hi = (b, i) => b[i] + b[3 + i];
    const up0 = N.MeshBuilder.prototype.upload, cap = [];
    N.MeshBuilder.prototype.upload = function (gl) {
      cap.push({ pos: this.pos, dat: this.dat });
      return up0.call(this, gl);
    };
    const built = {};
    for (const id of ['human', 'owl', 'frog', 'bear', 'jelly']) {
      const old = g.creatureMeshes[id];
      cap.length = 0;
      delete g.creatureMeshes[id];
      g.ensureModel(id);
      built[id] = cap.slice();
      if (old && old !== g.creatureMeshes[id])
        for (const e of old) { R.gl.deleteBuffer(e.mesh.pos); R.gl.deleteBuffer(e.mesh.col); R.gl.deleteBuffer(e.mesh.dat); }
    }
    N.MeshBuilder.prototype.upload = up0;

    let posErr = 0, faces = 0, creasedFaces = 0, worstRatio = 1, jellyErr = 0;
    const tones = {};
    /* the shade at each of one face's four corners, as a share of the face
       constant: the mesh of a part is built box by box, six vertices a face in
       the order the face's four corners are listed, so the corner a vertex
       stands on is read off its position as well as its place in the list */
    const at = (id, part, bi, fi) => {
      const parts = N.MODELS[id].parts, pi = parts.findIndex(p => p.name === part);
      const mesh = built[id][pi], b = parts[pi].boxes[bi];
      const ax = BOX_FACE[fi][0], end = BOX_FACE[fi][1], out = [];
      for (let s = 0; s < 6; s++) {
        const v = (bi * 6 + fi) * 6 + s;      // s runs over the six vertices
        const m = BOX_FACE[fi][2][SLOT[s]];   // SLOT says which corner each one is
        for (let k = 0; k < 3; k++) {
          const want = (k === ax) ? (end > 0 ? hi(b, k) : lo(b, k)) : (m[k] ? hi(b, k) : lo(b, k));
          if (Math.abs(mesh.pos[v * 3 + k] - want) > 1e-4) posErr++;
        }
        out.push(+(mesh.dat[v * 4] / 255 / FACE_S[fi]).toFixed(3));
      }
      return out;
    };
    const spread = (f) => Math.max(...f) - Math.min(...f);
    for (const id of ['human', 'owl', 'frog', 'bear']) {
      tones[id] = new Set();
      for (const m of built[id]) for (let v = 0; v < m.dat.length; v += 4) tones[id].add(m.dat[v]);
      for (const p of N.MODELS[id].parts) {
        for (let bi = 0; bi < p.boxes.length; bi++) for (let fi = 0; fi < 6; fi++) {
          const f = at(id, p.name, bi, fi);
          faces++;
          if (spread(f) > 0.02) creasedFaces++;
          worstRatio = Math.min(worstRatio, Math.min(...f));
        }
      }
    }
    for (const p of N.MODELS.jelly.parts) {
      for (let bi = 0; bi < p.boxes.length; bi++) for (let fi = 0; fi < 6; fi++)
        if (at('jelly', p.name, bi, fi).some(x => Math.abs(x - 1) > 0.01)) jellyErr++;
    }
    let shinCrease = 0;
    for (let fi = 0; fi < 6; fi++) {
      const f = at('bear', 'shinFL', 0, fi);
      if (spread(f) > 0.02 || Math.min(...f) < 0.99) shinCrease++;
    }
    const out = { faces, creasedFaces, posErr, jellyErr, shinCrease,
      worstRatio: +worstRatio.toFixed(3), tones: Object.keys(tones).reduce((o, k) => (o[k] = tones[k].size, o), {}) };
    for (const [k, v] of Object.entries({
      frogLeg: ['frog', 'legFL', 0, 4], frogToe: ['frog', 'legFL', 1, 4],
      thighTop: ['human', 'thighL', 0, 2], shoulder: ['human', 'torso', 0, 2],
      skullTop: ['human', 'head', 0, 0], wingFold: ['owl', 'foreL', 0, 2],
      wingOuter: ['owl', 'wingL', 0, 3], bearHead: ['bear', 'head', 0, 2]
    })) out[k] = at(...v);
    return out;
  });
  const isSpread = (f) => !!f && Math.max(...f) - Math.min(...f) > 0.02;
  const isWhole = (f) => !!f && Math.max(...f) - Math.min(...f) < 0.01 && Math.min(...f) > 0.99;
  check('a corner of a body mesh stands where the box says it does', crease.posErr === 0, crease.posErr);
  check('a frog leg is darker where it meets the body than where it hangs free',
    isSpread(crease.frogLeg), crease.frogLeg);
  check('the toes of a foot touch nothing and keep the whole face', isWhole(crease.frogToe), crease.frogToe);
  check('a trouser is shaded under the hip it turns on', isSpread(crease.thighTop), crease.thighTop);
  check('a coat is shaded under the shoulder line', isSpread(crease.shoulder), crease.shoulder);
  check('the top of a head is shaded all over under its hair',
    !!crease.skullTop && Math.max(...crease.skullTop) - Math.min(...crease.skullTop) < 0.01 &&
    Math.min(...crease.skullTop) < 0.9, crease.skullTop);
  check('a wing is shaded where it lies along the body', isSpread(crease.wingFold), crease.wingFold);
  check('the outside of a folded wing keeps its whole shade', isWhole(crease.wingOuter), crease.wingOuter);
  check('a bear head is shaded where it sits on the body', isSpread(crease.bearHead), crease.bearHead);
  check('a leg the same width from hip to foot shows no crease', crease.shinCrease === 0, crease.shinCrease);
  /* the deepest a corner can be closed: one side fully, the other all but
     half, the diagonal fully -- 5/6 of the crease, so 1 - 0.35*5/6 = 0.71 of
     the face it stands on, less what the shade byte rounds away */
  check('no corner of a body goes below 0.70 of the face it stands on',
    crease.worstRatio > 0.70, crease.worstRatio);
  check('a body is no longer lit by six flat values',
    crease.tones && crease.tones.frog > 12 && crease.tones.owl > 12 && crease.tones.bear > 6, crease.tones);
  check('a lamp is self-lit and takes no crease', crease.jellyErr === 0, crease.jellyErr);
  check('the crease is on the joints and not smeared over the body',
    crease.creasedFaces > crease.faces * 0.1 && crease.creasedFaces < crease.faces * 0.6, crease);

  /* Three bodies carry a colour nobody can ever see. A box that sits entirely
     inside another box of the same part costs six faces and zero pixels, and a
     part moves as one piece, so no pose can ever dig it out: the owl's pale
     belly and the bear's grizzled saddle were both written into the model and
     both buried in the box they hang from. The question is asked twice -- once
     of the geometry, which is cheap and exact, and once of the frame, which is
     the only thing that can say a marking arrived. The frame question is asked
     by taking the box away: the pixels that go with it are exactly what that box
     was worth, and a box with no pixels to its name is six faces spent on
     nothing. Hue fingerprints were tried first and refuse to work here: a
     grizzly saddle and the brown under it are the same hue at two lights, and
     the only thing the renderer does to a colour is scale it. */
  const marks = await step('aMarkingTheModelStatesReachesTheFrame', () => {
    const g = window.game, N = window.FRUTARIA, p = g.player, gl = g.R.gl, W = g.world;
    const was = { list: g.creatures, tp: g.thirdPerson, hover: g.hover, mode: g.mode, time: g.time,
      camD: g.cam.d, camFov: g.cam.fov, camReady: g.camReady, frame: g._camFrame,
      px: p.x, py: p.y, pz: p.z, yaw: p.yaw, pitch: p.pitch, form: p.form,
      faceYaw: p.faceYaw, bank: p.bank, tilt: p.tilt };
    /* (a) buried in its own part: every corner of A inside B, B a box of the
       same part. Boxes of different parts are not counted -- a part turns, so a
       box that starts behind another can swing out into the light. */
    const buried = [];
    for (const id of ['human', 'owl', 'frog', 'bear']) {
      for (const pt of N.MODELS[id].parts) {
        const bs = pt.boxes || [];
        for (const a of bs) {
          for (const b of bs) {
            if (a === b) continue;
            const inB = (k) => a[k] >= b[k] - 1e-6 && a[k] + a[3 + k] <= b[k] + b[3 + k] + 1e-6;
            if (inB(0) && inB(1) && inB(2)) { buried.push({ id, part: pt.name, box: a }); break; }
          }
        }
      }
    }
    /* (b) a clearing with open air on the side the lens comes from, and one body
       at a time in it, so that a changed pixel can only be the box in question. */
    const floorAt = (x, z) => { for (let y = W.h - 1; y > 0; y--) if (W.solidAt(x, y, z) && !N.TREE_BLOCK[W.get(x, y, z)]) return y; return 0; };
    let spot = null;
    for (let x = 30; x < 140 && !spot; x += 2) for (let z = 30; z < 140 && !spot; z += 2) {
      const gy = floorAt(x, z); if (gy < 3) continue;
      let open = true;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
        for (let k = 1; k <= 8 && open; k++) {
          const xx = x + dx * k, zz = z + dz * k;
          if (!W.solidAt(xx, gy, zz) || W.solidAt(xx, gy + 1, zz) || W.solidAt(xx, gy + 2, zz) ||
              W.solidAt(xx, gy + 3, zz) || W.liquidAt(xx, gy + 1, zz)) open = false;
        }
      if (open) spot = { x: x + 0.5, y: gy + 1, z: z + 0.5 };
    }
    if (!spot) return { error: 'no clearing', buried };
    const Wd = gl.drawingBufferWidth, Hd = gl.drawingBufferHeight;
    /* render() eats the camera frame it is handed -- it nulls it, so that the next
       frame's environment cannot be built off a stale lens -- so the shot is
       caught from shootCamera itself rather than read back off the game. */
    const shoot = () => { const f = g.shootCamera(p); g._camFrame = f; g.render(); return f; };
    const grab = () => { const b = new Uint8Array(Wd * Hd * 4); gl.readPixels(0, 0, Wd, Hd, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; };
    const owl = g.creatures.find(c => c.sp.id === 'owl');
    const bear = g.creatures.find(c => c.sp.id === 'bear');
    if (!owl || !bear) return { error: 'no owl and no bear in the valley', buried };
    /* (c) which side of a box the lens has to stand on. A marking owns pixels
       only on the side it stands out, and which side that is comes out of the
       model: each of the six faces of the box is sampled on a grid and counted by
       how much of it no other box of the same body reaches past. The face with
       the largest open area is the side the marking is written on. Nothing is
       measured from one angle, because a back that rises -- a grizzly's shoulder
       hump -- is buried on every side and escapes only upward: every box is looked
       at twice, once from the side its own best face points at and once from over
       it, and the worth of the box is the better of the two readings. */
    const escapeOf = (id, partName, i) => {
      const parts = N.MODELS[id].parts;
      const a = parts.find(q => q.name === partName).boxes[i];
      const other = [];
      for (const pt of parts) for (const b of (pt.boxes || [])) if (b !== a) other.push(b);
      const G = 8, open = [0, 0, 0, 0, 0, 0];        // nx px ny py nz pz
      for (let d = 0; d < 6; d++) {
        const k = d >> 1, hi = d & 1, u = (k + 1) % 3, v = (k + 2) % 3;
        const plane = hi ? a[k] + a[3 + k] : a[k];
        let free = 0;
        for (let j = 0; j < G; j++) for (let m = 0; m < G; m++) {
          const su = a[u] + a[3 + u] * (j + 0.5) / G, sv = a[v] + a[3 + v] * (m + 0.5) / G;
          let hid = false;
          for (const b of other) {
            // b hides this sample only if it reaches the face and covers the point
            if (hi ? b[k] + b[3 + k] < plane - 1e-6 : b[k] > plane + 1e-6) continue;
            if (su >= b[u] && su <= b[u] + b[3 + u] && sv >= b[v] && sv <= b[v] + b[3 + v]) { hid = true; break; }
          }
          if (!hid) free++;
        }
        open[d] = free / (G * G) * a[3 + u] * a[3 + v];
      }
      const DIR = ['nx', 'px', 'ny', 'py', 'nz', 'pz'];
      /* The lens stands west of the body and looks east. A model is authored
         facing +Z and M4.faceY turns it by rotY(PI - yaw), which carries local +Z
         onto world (sin yaw, 0, -cos yaw) and local +X onto world
         (-cos yaw, 0, -sin yaw) -- so the yaw that brings a chosen local face
         round to meet a lens standing at -x is one of four quarter turns, and it
         is the same four for a body worn by the player, whose own facing is
         turned the same way. */
      const YAW = { px: 0, nx: Math.PI, pz: -Math.PI / 2, nz: Math.PI / 2 };
      let hs = 0;
      for (const k of [0, 1, 4, 5]) if (open[k] > open[hs]) hs = k;
      const up = open[3] > open[hs] * 1.3;       // read from over the body, not along it
      return { yaw: YAW[DIR[hs]], up, dir: DIR[up ? 3 : hs],
        out: +open[up ? 3 : hs].toFixed(3) };
    };
    const bodies = { owl, bear };
    const DIST = { owl: 1.1, bear: 2.0 };
    const eyeH = (p.eyePos ? (p.eyePos() - p.y) : 1.55);
    const pose = (a, yaw) => {
      a.x = spot.x; a.y = spot.y; a.z = spot.z; a.yaw = yaw;
      a.vx = a.vy = a.vz = 0; a.sleeping = false; a.state = 'wander'; a.pause = 0;
      a.tilt = 0; a.bank = 0; a.crouch = 0; a.airAmt = 0; a.squash = 0; a.moveAmt = 0;
    };
    /* The shot is pinned, not inherited. Every count below is a count of pixels,
       and two things about the shot belong to whatever step ran before this one
       rather than to the body in front of the lens: the damped distance and fov
       (camReady=false makes shootCamera snap to the wanted shot on the first
       frame instead of easing there from wherever the last step left it) and
       p.headWater, which the player update sets and which takes 12 degrees off
       fov() -- a frame 14% smaller, and a collar worth 500 pixels measured as
       worth 333. The step never runs the player update, so nothing else would
       ever clear it. */
    const lens = (id, v) => {
      p.headWater = false; g.camReady = false;
      if (id === 'human') {
        /* The person is the body the player wears. The third-person lens hangs
           off the player's aim, so it is the player's *facing* that has to turn
           and the aim that stays: faceYaw is what the draw rotates the model by,
           and with the aim fixed at PI/2 the lens stands west of the body and
           looks east, exactly as it does for an animal. */
        g.creatures = []; g.thirdPerson = true; p.form = null;
        p.x = spot.x; p.z = spot.z; p.y = spot.y; p.vx = p.vy = p.vz = 0;
        p.yaw = Math.PI / 2; p.faceYaw = v.yaw; p.bank = 0; p.tilt = 0;
        p.pitch = v.up ? -0.8 : 0; p.vital = 10; p.fright = 0;
      } else {
        const a = bodies[id];
        pose(a, v.yaw);
        g.creatures = [a]; g.thirdPerson = false; p.form = null; g.camReady = true;
        const h = N.FRUIT_BY_ID[N.CREATURE_BY_ID[id].fruit].form.size[1], d = DIST[id];
        const eye = Math.max(0.12, h * (v.up ? 2.2 : 0.55));
        p.x = spot.x - d; p.z = spot.z; p.y = spot.y + eye - eyeH;
        p.vx = p.vy = p.vz = 0; p.yaw = Math.PI / 2;
        p.pitch = v.up ? -Math.atan2(eye - h * 0.6, d) : 0;
      }
      g.updateEnv();
    };
    /* How much of the frame one box owns: the box goes, the frame is drawn again,
       and every pixel that moved is worth that box. The mesh is rebuilt from the
       model's own arrays, so the answer comes out of the model and not out of a
       copy kept for the test. */
    const owns = (id, partName, boxIndex, v) => {
      const pt = N.MODELS[id].parts.find(q => q.name === partName);
      const box = pt.boxes[boxIndex];
      const ao = (pt.boxAO || [])[boxIndex];
      lens(id, v);
      let f = null;
      for (let k = 0; k < 60; k++) f = shoot();            // the damped distance/fov settle
      const A = grab();
      pt.boxes.splice(boxIndex, 1); if (pt.boxAO) pt.boxAO.splice(boxIndex, 1);
      g.creatureMeshes[id] = null; g.ensureModel(id);
      for (let k = 0; k < 4; k++) shoot();
      const B = grab();
      pt.boxes.splice(boxIndex, 0, box); if (pt.boxAO) pt.boxAO.splice(boxIndex, 0, ao);
      g.creatureMeshes[id] = null; g.ensureModel(id);
      let sum = 0;
      const changed = [];
      for (let i = 0; i < Wd * Hd; i++) {
        const d = Math.abs(A[i * 4] - B[i * 4]) + Math.abs(A[i * 4 + 1] - B[i * 4 + 1]) + Math.abs(A[i * 4 + 2] - B[i * 4 + 2]);
        if (d > 6) changed.push(i * 4);
      }
      const n = changed.length;
      for (const j of changed) sum += Math.abs(A[j] - B[j]) + Math.abs(A[j + 1] - B[j + 1]) + Math.abs(A[j + 2] - B[j + 2]);
      const shot = f;                       // the shot these pixels came off, so a
      return { px: n, luma: +(sum / (3 * Wd * Hd)).toFixed(3),   // count means what it says
        d: shot && +shot.d.toFixed(2), fov: shot && Math.round(shot.fov),
        mid: n ? [changed[n >> 1] / 4 % Wd | 0, changed[n >> 1] / 4 / Wd | 0] : null };
    };
    const both = (id, partName, i) => {
      const v = escapeOf(id, partName, i);
      const side = owns(id, partName, i, { yaw: v.yaw, up: false });
      const above = owns(id, partName, i, { yaw: v.yaw, up: true });
      const best = above.px > side.px ? above : side;
      return { dir: v.dir, out: v.out, side: side.px, above: above.px,
        px: best.px, luma: best.luma, mid: best.mid, d: best.d, fov: best.fov };
    };
    const idx = (id, partName, col) => N.MODELS[id].parts.find(q => q.name === partName).boxes.findIndex(b => b[6] === col);
    g.time = 420 * 0.42; g.mode = 'play'; g.hover = null;
    const row = {};
    row.owlBelly = both('owl', 'body', idx('owl', 'body', '#c6b594'));
    row.owlBody = both('owl', 'body', 0);
    row.owlBreast = both('owl', 'body', idx('owl', 'body', '#d8c9a8'));
    row.bearSaddle = both('bear', 'body', idx('bear', 'body', '#8a8272'));
    row.bearBody = both('bear', 'body', 0);
    row.bearHump = both('bear', 'body', idx('bear', 'body', '#5f574e'));
    row.humanCollar = both('human', 'torso', idx('human', 'torso', '#7a4a3a'));
    row.humanSkull = both('human', 'head', 0);
    row.humanCoat = both('human', 'torso', 0);
    g.creatures = was.list; g.thirdPerson = was.tp; g.hover = was.hover; g.mode = was.mode;
    g._camFrame = was.frame; g.cam.d = was.camD; g.cam.fov = was.camFov; g.camReady = was.camReady;
    p.x = was.px; p.y = was.py; p.z = was.pz; p.yaw = was.yaw; p.pitch = was.pitch; p.form = was.form;
    p.faceYaw = was.faceYaw; p.bank = was.bank; p.tilt = was.tilt;
    g.time = 420 * 0.42; g.updateEnv();
    return { spot, buried, row };
  });
  /* The step measures one box at a time, so the two rows it cannot lie about are
     the trunks themselves: if taking a body's own trunk box away moves a tenth of
     the frame, the measure sees the body, and a marking worth a thousandth of the
     frame is worth something. The bounds below are cut from what the same run
     measures, never from what the boxes are sized. */
  const mr = marks.row || {};
  check('no box of a body is buried inside a box of the same part', marks.buried && marks.buried.length === 0, marks.buried);
  check('the measure is not vacuous: an owl\'s own trunk owns a twentieth of the frame', mr.owlBody && mr.owlBody.px > 5000, mr.owlBody);
  check('the owl\'s pale belly owns pixels of its own', mr.owlBelly && mr.owlBelly.px > 900, mr.owlBelly);
  check('the belly is worth a fifth of the breast plate it hangs under',
    mr.owlBelly && mr.owlBreast && mr.owlBelly.px > mr.owlBreast.px * 0.15, marks);
  check('the measure is not vacuous: a bear\'s own trunk owns a twentieth of the frame', mr.bearBody && mr.bearBody.px > 12000, mr.bearBody);
  check('the bear\'s grizzled saddle owns pixels of its own', mr.bearSaddle && mr.bearSaddle.px > 3000, mr.bearSaddle);
  check('the saddle is worth half the shoulder it rises under',
    mr.bearSaddle && mr.bearHump && mr.bearSaddle.px > mr.bearHump.px * 0.5, marks);
  check('the person is drawn, and the coat owns pixels', mr.humanCoat && mr.humanCoat.px > 300, mr.humanCoat);
  check('the person\'s collar owns pixels of its own', mr.humanCollar && mr.humanCollar.px > 300, mr.humanCollar);
  /* The side reading, not the better of the two: a ruff is a ring round a neck,
     so what it is worth seen along the body is what a collar is for. Seen along
     the body it owns 238 pixels of frame now and owned 73 with the faces wound
     inward, when the lens was looking at the inside of the far side of a body
     rather than at the neck standing in front of it. */
  check('the ruff shows from the side, which is where a collar has to show',
    mr.humanCollar && mr.humanCollar.side > 150, mr.humanCollar);
  check('the collar is worth the head it wraps',
    mr.humanCollar && mr.humanSkull && mr.humanCollar.px > mr.humanSkull.px * 0.3, marks);
  /* A pixel count only means something if the shot it was counted off is the shot
     the game really films with: the person from 5.55 m at 84 degrees
     (1.5 + 2.25 * 1.8, +8 for the third-person lens), an animal from the player's
     own eye at 76. If these drift, every bound below drifts with them. */
  check('each row was counted off the shot the game films that body with',
    mr.owlBody && mr.owlBody.fov === 76 && mr.bearBody && mr.bearBody.fov === 76 &&
    mr.humanCollar && mr.humanCollar.fov === 84 && mr.humanCollar.d > 5.4 && mr.humanCollar.d < 5.7,
    { owl: mr.owlBody, bear: mr.bearBody, human: mr.humanCollar });

  /* A body has to hide what stands behind it. What the inside-out winding cost
     here was not a missing triangle: it was the depth of the surface. The near
     side of every box was never drawn, so what the lens saw of a body was the
     inside of its far side -- a surface the whole width of the body behind the
     flank you were standing in front of, and everything standing inside that
     width showed through the animal in front of it.
     Measured here, with two bodies of the same size one behind the other and the
     lens 2 m in front: the far one stands 0.12 m down the near one's own depth,
     which is inside it, and no surface of either is at the same distance as
     another. Taking the far one away moves 1332 pixels of the 60509 it owns when
     it stands alone -- it is nearly all behind the body in front, as it should
     be. (Two bodies the same size have the same silhouette, so this step does
     not by itself catch the winding: it moves from 0.022 kept to 0.041 and stays
     inside its bounds. The winding is caught where it is exact -- the triangle
     table in node-smoke, the corner coordinates of the crease step, and the flank
     reading two steps below, which reads the wrong end of the body outright.)
     The gap is stated from the model's own depth rather than from a constant,
     because the claim only means something while the far body really does stand
     between the near flank and the far one. */
  const occl = await step('aBodyBetweenTheLensAndAnotherBodyIsTheBodyThatIsSeen', (spot) => {
    const g = window.game, N = window.FRUTARIA, p = g.player, gl = g.R.gl;
    if (!spot) return { error: 'the marking step found no clearing' };
    const was = { list: g.creatures, tp: g.thirdPerson, hover: g.hover, mode: g.mode, time: g.time,
      camD: g.cam.d, camFov: g.cam.fov, camReady: g.camReady, frame: g._camFrame,
      px: p.x, py: p.y, pz: p.z, yaw: p.yaw, pitch: p.pitch, form: p.form };
    const Wd = gl.drawingBufferWidth, Hd = gl.drawingBufferHeight;
    const shoot = () => { g._camFrame = g.shootCamera(p); g.render(); };
    const grab = () => { const b = new Uint8Array(Wd * Hd * 4); gl.readPixels(0, 0, Wd, Hd, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; };
    const shot = () => { for (let k = 0; k < 60; k++) shoot(); return grab(); };
    // every pixel that moved between two frames belongs to what one frame had and the other had not
    const moved = (A, B) => {
      let n = 0;
      for (let i = 0; i < Wd * Hd; i++)
        if (Math.abs(A[i * 4] - B[i * 4]) + Math.abs(A[i * 4 + 1] - B[i * 4 + 1]) +
            Math.abs(A[i * 4 + 2] - B[i * 4 + 2]) > 6) n++;
      return n;
    };
    const bear = g.creatures.find(c => c.sp.id === 'bear');
    const tall = N.FRUIT_BY_ID[N.CREATURE_BY_ID.bear.fruit].form.size[1];
    if (!bear) return { error: 'no bear in the valley' };
    /* a second body of the same kind, and a copy that keeps the class: a creature
       answers questions about itself (`isFlyer`, `legged`) that a plain object
       copy of it cannot answer. The draw takes its mesh from the model cache by
       species, so two bodies of one species draw the same boxes at two different
       sets of matrices, which is exactly what is being asked. */
    const twin = Object.assign(Object.create(Object.getPrototypeOf(bear)), bear);
    const pose = (a, x) => {
      a.x = x; a.y = spot.y; a.z = spot.z; a.yaw = Math.PI / 2;
      a.vx = a.vy = a.vz = 0; a.sleeping = false; a.state = 'wander'; a.pause = 0;
      a.tilt = 0; a.bank = 0; a.crouch = 0; a.airAmt = 0; a.squash = 0; a.moveAmt = 0;
    };
    /* how far a body reaches along the axis the lens looks down, read off the
       model at the scale the animal is drawn at, not off a constant kept here */
    const sc = N.CREATURE_BY_ID.bear.scale;
    let lo = 1e9, hi = -1e9;
    for (const pt of N.MODELS.bear.parts) for (const b of pt.boxes) {
      lo = Math.min(lo, b[0] * sc); hi = Math.max(hi, (b[0] + b[3]) * sc);
    }
    const depth = hi - lo;
    const gap = depth * 0.125;
    const lens = (dist) => {
      const eyeH = (p.eyePos ? (p.eyePos() - p.y) : 1.55);
      g.thirdPerson = false; p.form = null;
      /* the shot is pinned, not inherited: the player's fov() drops 12 degrees
         while their head is under water, and that is a field some other step
         leaves behind -- and a smaller frame is a different pixel count */
      p.headWater = false; g.camReady = false;
      p.x = spot.x - dist; p.z = spot.z; p.y = spot.y + tall * 0.5 - eyeH;
      p.vx = p.vy = p.vz = 0; p.yaw = Math.PI / 2; p.pitch = 0; g.updateEnv();
    };
    g.time = 420 * 0.42; g.mode = 'play'; g.hover = null;
    lens(2.0);
    pose(bear, spot.x); pose(twin, spot.x + gap);
    g.creatures = [bear, twin];
    const both = shot();
    g.creatures = [bear]; for (let k = 0; k < 4; k++) shoot();
    const behind = moved(both, grab());
    g.creatures = [twin]; pose(twin, spot.x); for (let k = 0; k < 4; k++) shoot();
    const only = shot();
    g.creatures = []; for (let k = 0; k < 4; k++) shoot();
    const open = moved(only, grab());
    g.creatures = was.list; g.thirdPerson = was.tp; g.hover = was.hover; g.mode = was.mode;
    g._camFrame = was.frame; g.cam.d = was.camD; g.cam.fov = was.camFov; g.camReady = was.camReady;
    p.x = was.px; p.y = was.py; p.z = was.pz; p.yaw = was.yaw; p.pitch = was.pitch; p.form = was.form;
    g.time = 420 * 0.42; g.updateEnv();
    return { depth: +depth.toFixed(3), gap: +gap.toFixed(3),
      inside: gap + depth * 0.5 < depth,      // the far body's front is inside the near one
      behind, open, kept: +(behind / open).toFixed(3) };
  }, marks.spot);
  check('the far body really does stand inside the depth of the near one',
    !occl.error && occl.inside && occl.gap > 0.05 && occl.gap < occl.depth * 0.5, occl);
  check('the measure is not vacuous: a bear in the open owns its share of the frame',
    occl.open > 20000, occl);
  check('a bear standing between the lens and another bear hides the one behind it',
    occl.behind < occl.open * 0.45, occl);
  check('the bear behind is not simply gone: what escapes round the one in front is a bear',
    occl.behind > 400, occl);

  /* Which end of a body the lens stands at has to be written into the frame, and
     the only thing in this renderer that writes it is the face constant. There is
     no light direction, no normal and no sun term anywhere in the shaders: what
     reaches the lens is the vertex colour times the shade byte times the daylight
     times the water, plus the sky's own light. So a face carries its constant and
     nothing else, and box() gives the two ends of a box 0.58 and 0.88.
     The body is turned to face the lens and the lens stands on that axis, 2 m
     out: from one end the middle of the frame is the trunk's rear face (0.58),
     from the other its front face (0.88) -- the legs straddle the sight line and
     the head sits above it, so it is the same box and the same colour either way.
     The quotient that has to come back is 0.88/0.58 with the sky's light added to
     both, which is what puts the measured reading at 1.25 rather than 1.52.
     Wound inward neither reading is the end it was aimed at: the near flank is
     culled, and what fills the centre of the frame is the inside of the far wall
     -- the pale saddle's front wall at one end (it stands 2.4 cm outside the trunk
     it marks) and the trunk's own rear wall at the other. Two different colours at
     two different constants, and the quotient tips below 1 -- 0.802 measured, with
     the two readings swapped, which is how this step catches the winding. */
  const flank = await step('theFlankTurnedToTheLensIsTheFlankThatIsLit', (spot) => {
    const g = window.game, N = window.FRUTARIA, p = g.player, gl = g.R.gl;
    if (!spot) return { error: 'the marking step found no clearing' };
    const was = { list: g.creatures, tp: g.thirdPerson, hover: g.hover, mode: g.mode, time: g.time,
      camD: g.cam.d, camFov: g.cam.fov, camReady: g.camReady, frame: g._camFrame,
      px: p.x, py: p.y, pz: p.z, yaw: p.yaw, pitch: p.pitch, form: p.form };
    const Wd = gl.drawingBufferWidth, Hd = gl.drawingBufferHeight;
    const bear = g.creatures.find(c => c.sp.id === 'bear');
    const tall = N.FRUIT_BY_ID[N.CREATURE_BY_ID.bear.fruit].form.size[1];
    if (!bear) return { error: 'no bear in the valley' };
    const pose = () => {
      bear.x = spot.x; bear.y = spot.y; bear.z = spot.z; bear.yaw = Math.PI / 2;
      bear.vx = bear.vy = bear.vz = 0; bear.sleeping = false; bear.state = 'wander'; bear.pause = 0;
      bear.tilt = 0; bear.bank = 0; bear.crouch = 0; bear.airAmt = 0; bear.squash = 0; bear.moveAmt = 0;
    };
    const lens = (fromX) => {
      const eyeH = (p.eyePos ? (p.eyePos() - p.y) : 1.55);
      g.thirdPerson = false; p.form = null;
      /* the shot is pinned, not inherited -- see the same note in the step above:
         this step reads one patch of 15x15 pixels, and a 12 degree fov left over
         from another step is that patch sitting somewhere else on the body */
      p.headWater = false; g.camReady = false;
      p.x = spot.x + fromX * 2.0; p.z = spot.z; p.y = spot.y + tall * 0.5 - eyeH;
      p.vx = p.vy = p.vz = 0; p.yaw = fromX > 0 ? -Math.PI / 2 : Math.PI / 2; p.pitch = 0;
      g.updateEnv();
    };
    /* the middle of the frame: where the lens points, a hand's breadth of
       surface, far from every edge of the body and from every crease */
    const centre = (b, half) => {
      const cx = Wd >> 1, cy = Hd >> 1;
      let n = 0, sr = 0, sg = 0, sb = 0, sl = 0;
      const tones = new Set();
      for (let dy = -half; dy <= half; dy++) for (let dx = -half; dx <= half; dx++) {
        const o = (((cy + dy) * Wd) + (cx + dx)) * 4;
        sr += b[o]; sg += b[o + 1]; sb += b[o + 2];
        sl += 0.2126 * b[o] + 0.7152 * b[o + 1] + 0.0722 * b[o + 2];
        tones.add((b[o] >> 3) + ',' + (b[o + 1] >> 3) + ',' + (b[o + 2] >> 3));
        n++;
      }
      return { rgb: [Math.round(sr / n), Math.round(sg / n), Math.round(sb / n)],
        luma: +(sl / n).toFixed(1), tones: tones.size };
    };
    const look = (fromX) => {
      lens(fromX);
      for (let k = 0; k < 60; k++) { g._camFrame = g.shootCamera(p); g.render(); }
      const b = new Uint8Array(Wd * Hd * 4);
      gl.readPixels(0, 0, Wd, Hd, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return centre(b, 7);
    };
    g.time = 420 * 0.42; g.mode = 'play'; g.hover = null;
    g.creatures = [bear]; pose();
    const left = look(-1);          // the rear end of the body: constant 0.58
    const right = look(1);         // the front end of the same body: constant 0.88
    g.creatures = was.list; g.thirdPerson = was.tp; g.hover = was.hover; g.mode = was.mode;
    g._camFrame = was.frame; g.cam.d = was.camD; g.cam.fov = was.camFov; g.camReady = was.camReady;
    p.x = was.px; p.y = was.py; p.z = was.pz; p.yaw = was.yaw; p.pitch = was.pitch; p.form = was.form;
    g.time = 420 * 0.42; g.updateEnv();
    return { left, right, ratio: +(right.luma / left.luma).toFixed(3) };
  }, marks.spot);
  const share = (c) => c.rgb.map((v) => v / c.luma);
  check('each reading is one face and not an edge: the middle of the frame is flat colour',
    !flank.error && flank.left.tones <= 3 && flank.right.tones <= 3, flank);
  check('both readings are the same colour at two strengths, not two different surfaces',
    !flank.error && [0, 1, 2].every((i) => Math.abs(share(flank.left)[i] - share(flank.right)[i]) <= 0.03),
    { left: flank.left, right: flank.right, shareL: share(flank.left), shareR: share(flank.right) });
  check('the flank whose face constant is the brighter of the two reads brighter',
    !flank.error && flank.ratio > 1.06 && flank.ratio < 1.5, flank);


  /* A joint the frame shows side by side has to be two colours, not one colour
     at two strengths. The renderer multiplies a surface's colour by scalars and
     by nothing else (vCol = aCol.rgb * aData.x * lit * dayLight + uAmb: the face
     constant, the crease byte, the daylight, all of them single numbers), so two
     boxes painted with colours of the same ratios come out of the frame the same
     colour whenever the two scalars happen to even out -- and a leg meeting a
     body at a crease is exactly the place where they do. The only thing that can
     tell such a joint apart is a difference in the colour *ratios*, which is the
     palette and nothing else. So the palette is measured at the joints, in the
     frame, with the parts told apart by an id buffer: every box of one part is
     repainted a marker colour of its own, and a pixel belongs to the part whose
     marker ray it sits on. Multiplication cannot move a colour off its own ray,
     so an ordinary frame is an id buffer. A seam is a pair of neighbouring
     pixels the id buffer puts on two different parts, and the read that matters
     is the share each channel holds in its own pixel's luminance: a scalar
     multiplication leaves every share alone, so a difference in shares is a
     difference of colour and cannot have come from the light. */
  const joint = await step('aJointTheLensSeesIsTwoColoursNotOneColourTwice', (spot) => {
    const g = window.game, N = window.FRUTARIA, p = g.player, gl = g.R.gl;
    const lum = (b, i) => 0.2126 * b[i] + 0.7152 * b[i + 1] + 0.0722 * b[i + 2];
    /* twelve markers, well separated: a body of n parts is painted the first n
       of them, and the separation of the set is asked of the frame below rather
       than trusted. They are written out rather than generated because the whole
       point of the id buffer is that the same marker means the same part in every
       run of this step. */
    const MARKS = ['#aa5fa5', '#26f927', '#1f35f8', '#f8341f', '#aeb722', '#25b7ae',
      '#7eb67e', '#7a22dd', '#e11e75', '#d37256', '#5774d2', '#6edf38'];
    const was = { list: g.creatures, tp: g.thirdPerson, hover: g.hover, mode: g.mode, time: g.time,
      camD: g.cam.d, camFov: g.cam.fov, camReady: g.camReady, frame: g._camFrame,
      px: p.x, py: p.y, pz: p.z, yaw: p.yaw, pitch: p.pitch, form: p.form, hw: p.headWater,
      faceYaw: p.faceYaw, bank: p.bank, tilt: p.tilt, vital: p.vital };
    /* the animals have to be found before anything is taken out of the world:
       a body is filmed one at a time, with the rest of the valley's creatures
       put away, so that a changed pixel can only be this body's */
    const animals = {};
    for (const id of ['owl', 'frog', 'bear']) animals[id] = g.creatures.find((c) => c.sp.id === id) || null;
    if (!animals.owl || !animals.frog || !animals.bear) return { error: 'no owl, frog and bear in the valley' };
    const Wd = gl.drawingBufferWidth, Hd = gl.drawingBufferHeight;
    const shoot = () => { const f = g.shootCamera(p); g._camFrame = f; g.render(); return f; };
    const grab = () => { const b = new Uint8Array(Wd * Hd * 4); gl.readPixels(0, 0, Wd, Hd, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; };
    /* the lens stands due west of the body and looks east; the body is turned to
       the bearing that puts the asked-for side under it */
    const SIDEYAW = { left: Math.PI, right: 0, face: -Math.PI / 2, back: Math.PI / 2 };
    const DIST = { owl: 1.1, bear: 2.0, frog: 0.8 };     // the distance the game films that body at
    /* A joint has to hold while the animal is moving and not only while it stands
       still, and a moving pose has to be picked off the model rather than guessed
       at. `partAngles` is the very function the draw calls to turn a pose state
       into a part's angles, so the sweeps below ask it: where in its own stride is
       this body's leg furthest out of its stance, and what phase of the clock puts
       a wing at the bottom of its stroke. The standing shots stay exactly the shots
       they always were; these poses are added next to them. */
    const stOf = (over) => Object.assign({ t: 0, gait: 0, phase: 0, move: 0, air: 0,
      crouch: 0, off: 0, flap: 1, fly: false }, over);
    const entsOf = (id) => {
      entsOf.m = entsOf.m || {};
      return entsOf.m[id] || (entsOf.m[id] =
        N.MODELS[id].parts.map((pt) => ({ part: pt, pivot: pt.pivot || [0, 0, 0] })));
    };
    /* how far any part of this body has been turned away from standing by a pose
       state, in radians: a joint in a moving body is only worth claiming if the
       pose really moved the body, and this is the number that says it did */
    const ANG = ['rx', 'ry', 'rz'];   // the three turns: the other two are a lift and a scale
    const movedBy = (id, st) => {
      const a0 = entsOf(id).map((e) => N.partAngles(e, stOf({})));
      const a1 = entsOf(id).map((e) => N.partAngles(e, stOf(st)));
      let best = 0;
      // a claim that "the body moved" wants to be about limbs turning, in radians
      a0.forEach((x, i) => ANG.forEach((k) => { const d = Math.abs(x[k] - a1[i][k]); if (d > best) best = d; }));
      return +best.toFixed(3);
    };
    // the stride position a leg is furthest out of its stance at: the swing
    const swingOf = (id) => {
      let best = { u: 0, moved: 0 };
      for (let k = 1; k <= 24; k++) {
        const m = movedBy(id, { gait: k / 24, move: 1 });
        if (m > best.moved) best = { u: k / 24, moved: m };
      }
      return best;
    };
    /* the phase of the clock that puts a bird's wing furthest into its stroke. The
       beat is the sine of the world clock plus the body's phase, times the rate,
       plus that phase again -- so the phase is swept and the wing's own angle read
       back off the model, rather than the formula copied out here. */
    const beatOf = (id) => {
      const wing = entsOf(id).find((e) => e.part.anim === 'flap');
      let best = { ph: 0, rz: 0 };
      if (!wing) return best;
      /* the sweep is over the phase, and 24 steps of it would not do: the beat's
         argument is the clock times the rate plus the phase again, so it moves
         twelve times as fast as the phase does, and 24 samples of the phase step
         the argument by exactly pi -- every sample landing on the same stroke,
         whichever one of them it happened to be. Sampled at 252 the argument is
         stepped by 0.3 rad, so the best of them is within 0.011 of the bottom of
         the stroke. */
      for (let k = 0; k < 252; k++) {
        const ph = k * Math.PI / 126;
        const rz = N.partAngles(wing, stOf({ air: 1, fly: true, t: 420 * 0.42 + ph, phase: ph })).rz;
        if (Math.abs(rz) > Math.abs(best.rz)) best = { ph: +ph.toFixed(4), rz: +rz.toFixed(3) };
      }
      return best;
    };
    const SWING = { bear: swingOf('bear') };
    const BEAT = { owl: beatOf('owl') };
    const TOPS = {};
    for (const id of ['owl', 'frog', 'bear']) if (animals[id]) TOPS[id] = animals[id].sp.speed || 3;
    /* what each pose does to the creature's own fields, and the pose state the draw
       will be handed by it -- both here, so the premise is measured off the same
       state the frame is shot with and not off a description of it. Every pose is
       filmed from the same four bearings the standing body is filmed from: a moving
       body is not pickier about where the lens stands, and pooling over the four is
       what the idle joints are pooled over. Where a pose reads better from some of
       them than others is measured below, not assumed. */
    const POSES = {
      owl: [['idle', {}, {}],
        ['beat', { airAmt: 1, flap: 1, phase: BEAT.owl.ph },
          { air: 1, fly: true, phase: BEAT.owl.ph, t: 420 * 0.42 + BEAT.owl.ph }]],
      frog: [['idle', {}, {}],
        /* A hop is not a pose the body holds while its feet are on the ground: the
           model lets a limb the body stands on fold up only as far as the ground
           has got out of the way of it (`off`, that clearance in body heights, read
           by the draw as (y - ground) / (model height x scale) = 0.43 m for this
           frog). Given the tuck with its feet on its floor, the model gives back
           nothing at all -- measured, 0 rad moved. Half a metre over its own floor
           is over that clearance, and the lens goes up with the body so the whole
           body stays in the frame to be measured in. */
        ['hop', { airAmt: 1, y: spot.y + 0.5 }, { air: 1, off: 1 }]],
      bear: [['idle', {}, {}],
        ['swing', { gait: SWING.bear.u, speed: TOPS.bear }, { gait: SWING.bear.u, move: 1 }]],
      human: [['idle', {}, {}]]
    };
    const prem = [];
    for (const id of ['owl', 'frog', 'bear'])
      for (const [pose, mut, st] of POSES[id])
        if (pose !== 'idle') prem.push({ id, pose, moved: movedBy(id, st),
          beat: pose === 'beat' ? BEAT.owl.rz : null, u: pose === 'swing' ? SWING.bear.u : null });
    const shots = [];
    g.time = 420 * 0.42; g.mode = 'play'; g.hover = null; p.vital = 10; p.fright = 0;
    for (const id of ['owl', 'frog', 'bear', 'human']) {
      const an = id === 'human' ? null : animals[id];
      const tall = id === 'human' ? 1.8 : N.FRUIT_BY_ID[N.CREATURE_BY_ID[id].fruit].form.size[1];
      for (const [pose, mut] of POSES[id]) {
        for (const side of ['left', 'right', 'face', 'back']) {
        const yaw = SIDEYAW[side];
        p.form = null;
        const eyeH = p.eyePos() - p.y;
        if (an) {
          an.x = spot.x; an.y = spot.y; an.z = spot.z; an.yaw = yaw;
          an.vx = an.vy = an.vz = 0; an.sleeping = false; an.state = 'wander'; an.pause = 0;
          an.tilt = 0; an.bank = 0; an.crouch = 0; an.airAmt = 0; an.squash = 0; an.moveAmt = 0;
          /* the draw clocks a body off the world's clock plus the body's own
             phase (game.js: t = this.time + c.phase) and that phase is dealt out
             at random when the valley is built. Pin it: the seam between a folded
             wing and a trunk is a near-tangency in the silhouette, and two runs of
             a step that does not pin it measured 98 pixels of that joint and then
             4 pixels of it, with nothing changed in between. What the whole line
             is worth was measured rather than assumed: a bear caught mid-stride in
             the wandering flock -- gait 20.2 rad of cycle, 2.1 m/s, phase 2.68 --
             moves 15155 pixels of the frame it is filmed in through its gait and
             its speed and 5363 through its phase alone, and a frog out of the same
             flock 25532 through its speed and 1365 through its phase. */
          an.phase = 0; an.t = 0; an.gait = 0; an.speed = 0; an.bend = 0;
          /* `bend` is the signed rate of heading, and the draw hands it to the
             model as `turn` (game.js: turn: c.bend). The model spends a turn only
             on a body stroking water: 1.9 rad/s of it swings a swimming frog's
             thigh 0.179 rad and moves a walking bear's leg, a flying owl's leg and
             a hopping frog's leg nothing at all. So pinning it changes nothing in
             these frames today -- the shots below filmed with the biggest rate the
             wandering flock carries left in differ by 0 pixels of 504000, and that
             flock was measured holding 1.9 rad/s of it in its frogs and 1.6 in its
             bears -- and it is pinned with the rest for the same reason they are:
             a pose that is being measured should not inherit anything, a turn
             included, from wherever the body happened to be. */
          Object.assign(an, mut);          // the pose asked for: a stride, a beat, a tuck
          g.creatures = [an]; g.thirdPerson = false;
          /* the heading is pinned as surely as the position is: the lens stands
             west and looks east, and a yaw left over from the step before this one
             films the empty air on the far side of the body. The height is taken
             off the body's own posed height and not off its floor, because a
             hopping body stands half a metre above its floor for this shot: with
             the lens left on the floor, only 5547 of that body's 55000-odd pixels
             were in the frame at all, the rest of it cut off by the top edge. */
          p.x = spot.x - DIST[id]; p.z = spot.z; p.y = an.y + Math.max(0.12, tall * 0.55) - eyeH;
          p.yaw = Math.PI / 2;
        } else {
          g.creatures = []; g.thirdPerson = true;
          p.x = spot.x; p.z = spot.z; p.y = spot.y;
          p.yaw = Math.PI / 2; p.faceYaw = yaw; p.bank = 0; p.tilt = 0;
        }
        p.vx = p.vy = p.vz = 0; p.pitch = 0;
        p.headWater = false; g.camReady = false;   // the shot is pinned, not inherited
        g.updateEnv();
        let f = null;
        for (let k = 0; k < 60; k++) f = shoot();
        const F = grab();
        const F2 = grab();                 // nothing changed: how stable is the frame at all
        /* the body's own pixels, measured by taking the body away */
        const saved = g.creatureMeshes[id]; g.creatureMeshes[id] = [];
        for (let k = 0; k < 4; k++) shoot();
        const M = grab();
        g.creatureMeshes[id] = saved;
        /* the id buffer, and the model put back as it was found */
        const parts = N.MODELS[id].parts;
        const hex = MARKS.slice(0, parts.length);
        const dir = hex.map((h) => {
          const v = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
          const L = Math.hypot(v[0], v[1], v[2]);
          return [v[0] / L, v[1] / L, v[2] / L];
        });
        let sep = 180;                     // how far apart the markers are, in degrees
        for (let a = 0; a < dir.length; a++) for (let b = a + 1; b < dir.length; b++)
          sep = Math.min(sep, Math.acos(Math.max(-1, Math.min(1,
            dir[a][0] * dir[b][0] + dir[a][1] * dir[b][1] + dir[a][2] * dir[b][2]))) * 180 / Math.PI);
        const keep = parts.map((pt) => (pt.boxes || []).map((bx) => bx[6]));
        parts.forEach((pt, pi) => (pt.boxes || []).forEach((bx) => { bx[6] = hex[pi]; }));
        g.creatureMeshes[id] = null; g.ensureModel(id);
        for (let k = 0; k < 4; k++) shoot();
        const I = grab();
        parts.forEach((pt, pi) => (pt.boxes || []).forEach((bx, bi) => { bx[6] = keep[pi][bi]; }));
        g.creatureMeshes[id] = null; g.ensureModel(id);
        for (let k = 0; k < 2; k++) shoot();
        let drift = 0;
        for (let o = 0; o < Wd * Hd; o++) {
          const i = o * 4;
          if (Math.max(Math.abs(F[i] - F2[i]), Math.abs(F[i + 1] - F2[i + 1]), Math.abs(F[i + 2] - F2[i + 2])) > 6) drift++;
        }
        const idm = new Int16Array(Wd * Hd).fill(-1);
        const mask = new Uint8Array(Wd * Hd);
        let nMask = 0, nId = 0;
        for (let o = 0; o < Wd * Hd; o++) {
          const i = o * 4;
          if (Math.max(Math.abs(F[i] - M[i]), Math.abs(F[i + 1] - M[i + 1]), Math.abs(F[i + 2] - M[i + 2])) > 24) { mask[o] = 1; nMask++; }
          /* A pixel is this part's if its colour sits on this part's marker ray,
             and if it belongs to the body. Both halves are needed: the valley's
             own greens are themselves multiples of some marker, so the ray test
             alone paints grass leaves as a frog's thigh; and the difference test
             alone cannot say which part a body pixel belongs to. */
          if (!mask[o]) continue;
          const r2 = I[i] * I[i] + I[i + 1] * I[i + 1] + I[i + 2] * I[i + 2];
          let q1 = 1e9, q2 = 1e9, bi = -1;
          for (let j = 0; j < dir.length; j++) {
            const d = I[i] * dir[j][0] + I[i + 1] * dir[j][1] + I[i + 2] * dir[j][2];
            const e = Math.sqrt(Math.max(0, r2 - d * d));     // off-ray distance, in levels
            if (e < q1) { q2 = q1; q1 = e; bi = j; } else if (e < q2) q2 = e;
          }
          // a pixel on no marker's ray, or on two of them, is not this part's
          if (q1 < 3 && q2 - q1 > 3) idm[o] = bi;
          if (idm[o] >= 0) nId++;
        }
        const name = (j) => parts[j].name;
        /* seams: neighbouring pixels the id buffer puts on two different parts */
        const pair = new Map();
        for (let y = 0; y < Hd; y++) for (let x = 0; x < Wd; x++) {
          const o = y * Wd + x, a = idm[o];
          if (a < 0) continue;
          for (const q of [o + 1, o + Wd]) {
            if (q === o + 1 && x + 1 >= Wd) continue;
            if (q >= Wd * Hd) continue;
            const b = idm[q];
            if (b < 0 || b === a) continue;
            const k = a < b ? a + '|' + b : b + '|' + a;
            const i1 = o * 4, i2 = q * 4;
            const L1 = lum(F, i1), L2 = lum(F, i2);
            /* the share each channel holds in its own pixel: scale-invariant, so
               it is the palette and not the light being compared here */
            const ds = Math.max(
              Math.abs(F[i1] / (L1 || 1) - F[i2] / (L2 || 1)),
              Math.abs(F[i1 + 1] / (L1 || 1) - F[i2 + 1] / (L2 || 1)),
              Math.abs(F[i1 + 2] / (L1 || 1) - F[i2 + 2] / (L2 || 1)));
            let r = pair.get(k);
            if (!r) { r = { a: name(a), b: name(b), n: 0, dL: 0, lo: 1e9, ds: 0, over: 0, same: 0,
              c1: [0, 0, 0], c2: [0, 0, 0] }; pair.set(k, r); }
            r.n++; r.dL += Math.abs(L1 - L2); r.ds += ds;
            if (ds > 0.04) r.over++;                            // two colours, not two strengths
            if (F[i1] === F[i2] && F[i1 + 1] === F[i2 + 1] && F[i1 + 2] === F[i2 + 2]) r.same++;
            r.lo = Math.min(r.lo, Math.abs(L1 - L2));
            r.c1[0] += F[i1]; r.c1[1] += F[i1 + 1]; r.c1[2] += F[i1 + 2];
            r.c2[0] += F[i2]; r.c2[1] += F[i2 + 1]; r.c2[2] += F[i2 + 2];
          }
        }
        /* flatness inside the body, and the exact colours it is made of */
        let pairs = 0, flat = 0, sameRGB = 0;
        const rgbN = new Map();
        /* how much of the frame each part really occupies: read straight off the id
           buffer, and the only way to tell that a pose moved the body *in the
           picture* rather than only in the pose state. Row 0 of a `readPixels`
           buffer is the bottom of the image, so a part whose lowest row has come up
           is a part that has left the ground it was standing on. */
        const pbox = new Map();
        for (let y = 0; y < Hd; y++) for (let x = 0; x < Wd; x++) {
          const o = y * Wd + x; if (idm[o] < 0) continue;
          const i = o * 4;
          const rk = (F[i] << 16) | (F[i + 1] << 8) | F[i + 2];
          rgbN.set(rk, (rgbN.get(rk) || 0) + 1);
          let bb = pbox.get(idm[o]);
          if (!bb) { bb = [x, y, x, y, 0]; pbox.set(idm[o], bb); }
          if (x < bb[0]) bb[0] = x; if (x > bb[2]) bb[2] = x;
          if (y < bb[1]) bb[1] = y; if (y > bb[3]) bb[3] = y;
          bb[4]++;
          for (const q of [o + 1, o + Wd]) {
            if (q === o + 1 && x + 1 >= Wd) continue;
            if (q >= Wd * Hd || idm[q] < 0) continue;
            pairs++;
            if (F[i] === F[q * 4] && F[i + 1] === F[q * 4 + 1] && F[i + 2] === F[q * 4 + 2]) sameRGB++;
            if (Math.abs(lum(F, i) - lum(F, q * 4)) < 0.5) flat++;
          }
        }
        let topRGB = 0, longRunH = 0;
        for (const v of rgbN.values()) if (v > topRGB) topRGB = v;
        for (let y = 0; y < Hd; y++) {
          let run = 0, prev = -1;
          for (let x = 0; x < Wd; x++) {
            const o = y * Wd + x;
            if (idm[o] < 0) { run = 0; prev = -1; continue; }
            const i = o * 4, rk = (F[i] << 16) | (F[i + 1] << 8) | F[i + 2];
            run = (rk === prev) ? run + 1 : 1; prev = rk;
            if (run > longRunH) longRunH = run;
          }
        }
        shots.push({ id, pose, side, shot: { d: f && +f.d.toFixed(2), fov: f && Math.round(f.fov) },
          parts: parts.length, sep: +sep.toFixed(1), bodyPx: nMask, cover: +(100 * nId / (nMask || 1)).toFixed(1),
          drift, pctFlat: +(100 * flat / (pairs || 1)).toFixed(1), pctSame: +(100 * sameRGB / (pairs || 1)).toFixed(1),
          tones: rgbN.size, topRGBShare: +(100 * topRGB / (nId || 1)).toFixed(1), longRunH,
          box: parts.map((pt, i) => { const b = pbox.get(i);
            return b ? [pt.name, b[0], b[1], b[2], b[3], b[4]] : null; }).filter(Boolean),
          seams: [...pair.values()].filter((r) => r.n >= 2).map((r) => ({ a: r.a, b: r.b, n: r.n,
            dL: +(r.dL / r.n).toFixed(1), lo: +r.lo.toFixed(1), ds: +(r.ds / r.n).toFixed(3),
            pctShare: Math.round(100 * r.over / r.n), pctSame: Math.round(100 * r.same / r.n),
            c1: r.c1.map((v) => Math.round(v / r.n)), c2: r.c2.map((v) => Math.round(v / r.n)) }))
            .sort((u, v) => u.dL - v.dL) });
        }
      }
    }
    g.creatures = was.list; g.thirdPerson = was.tp; g.hover = was.hover; g.mode = was.mode;
    g._camFrame = was.frame; g.cam.d = was.camD; g.cam.fov = was.camFov; g.camReady = was.camReady;
    p.x = was.px; p.y = was.py; p.z = was.pz; p.yaw = was.yaw; p.pitch = was.pitch; p.form = was.form;
    p.headWater = was.hw; p.faceYaw = was.faceYaw; p.bank = was.bank; p.tilt = was.tilt;
    p.vital = was.vital; g.time = 420 * 0.42; g.updateEnv();
    return { spot, shots, prem, swing: SWING, beat: BEAT };
  }, marks.spot);
  /* one row per joint: the same joint at every bearing the body was filmed from,
     pooled, because a joint is worth what it is worth in the frame and not at one
     angle. Prefixes, because a body's two sides are separate parts: wingL and
     wingR are one joint of the body. */
  const JOINTS = [
    ['owl', 'body', 'wing'], ['frog', 'body', 'thigh'], ['frog', 'body', 'head'],
    ['bear', 'body', 'leg'], ['bear', 'body', 'head'], ['bear', 'leg', 'shin']
  ];
  /* the frog's head to its thigh was measured too, and it is not claimed here:
     at these four bearings the two never stand against each other in the frame
     at all -- the thigh is behind the body and the head is over it -- so there
     is no seam there for a palette to be worth anything in. */
  const pool = (id, x, y, minN, pose) => {
    let n = 0, ds = 0, dL = 0, share = 0, same = 0, worst = 1e9;
    for (const s of (joint.shots || [])) {
      if (s.id !== id) continue;
      if (pose && s.pose !== pose) continue;
      for (const r of s.seams) {
        if (!((r.a.startsWith(x) && r.b.startsWith(y)) || (r.b.startsWith(x) && r.a.startsWith(y)))) continue;
        if (r.n < (minN || 0)) continue;
        n += r.n; ds += r.ds * r.n; dL += r.dL * r.n; share += r.pctShare * r.n; same += r.pctSame * r.n;
        worst = Math.min(worst, r.lo);
      }
    }
    return { joint: id + ' ' + x + '/' + y + (pose ? ' ' + pose : ''), n, dL: n ? +(dL / n).toFixed(1) : null,
      lo: n === 0 ? null : +worst.toFixed(1), ds: n ? +(ds / n).toFixed(3) : null,
      pctShare: n ? Math.round(share / n) : null, pctSame: n ? Math.round(same / n) : null };
  };
  const rows = JOINTS.map((j) => pool(j[0], j[1], j[2], 0, 'idle'));
  check('the frame is stable enough to be measured: two reads of one shot are the same pixels',
    !joint.error && joint.shots.every((s) => s.drift === 0),
    joint.error || joint.shots.map((s) => [s.id, s.side, s.drift]));
  check('the id buffer knows which part drew a pixel: over nine tenths of an animal told apart,',
    // the person excepted: at the shot the game films them with they are about
    // 1500 pixels wide, and twelve markers 17 degrees apart cannot tell 12 parts
    // apart over so few pixels -- which is why nothing below is claimed of them
    !joint.error && joint.shots.filter((s) => s.id !== 'human').every((s) => s.cover > 90) &&
      joint.shots.filter((s) => s.id === 'human').every((s) => s.cover > 70),
    joint.error || joint.shots.map((s) => [s.id, s.side, s.cover, s.sep, s.parts]));
  check('the markers are far enough apart that a face constant cannot move one onto another',
    !joint.error && joint.shots.every((s) => s.sep > 15),
    joint.error || joint.shots.map((s) => [s.id, s.sep]));
  check('and the joints are there to be read: each is worth its weight of frame',
    rows.every((r) => r.n >= 40), rows);
  check('a joint the lens sees is two colours, not one colour at two strengths:',
    // the share of seam pixels whose two sides hold colour in different
    // proportions -- 0% meant the light could not tell the parts apart by colour
    rows.every((r) => r.pctShare >= 80), rows);
  check('and the colour difference is worth a name: not a shade of the same colour',
    rows.every((r) => r.ds >= 0.05), rows);
  check('so a joint is no longer two pixels of one colour standing side by side',
    // 31% of the frog's body-to-thigh seam used to be the very same colour on
    // both sides of the line; a joint you cannot see because it is one colour is
    // not a joint the frame has
    rows.every((r) => r.pctSame <= 5), rows);
  /* the frog is the body this is asked of because it was the flattest one the
     frame showed: over a third of its pixels used to be one colour, the same
     green on the trunk and on the leg meeting it. Pooled over the four bearings
     the game films it at that share measured 35.7% before the palette moved and
     30.8% after. The longest unbroken run of one colour across the body did not
     move at all (192, 192, 226 and 174 pixels, before and after alike) and is
     not claimed: a run that long is one box's own back, and repainting two
     boxes differently cannot break a run lying inside a single box. */
  const frogTop = (joint.shots || []).filter((s) => s.id === 'frog' && s.pose === 'idle')
    .map((s) => s.topRGBShare);
  check('and the flatness of the body reads the same way: one colour used to cover',
    // a third of a frog was one colour; the mean of the four bearings is what is
    // asked here, because one bearing of a pinned body is worth less than four
    !joint.error && frogTop.length === 4 &&
      frogTop.reduce((a, b) => a + b, 0) / frogTop.length < 33,
    joint.error || { mean: +(frogTop.reduce((a, b) => a + b, 0) / (frogTop.length || 1)).toFixed(1), frogTop });
  /* ...and the body is not usually standing still. A joint measured on a pinned
     idle body says what the palette is worth at rest, which is not what the frame
     shows: a walking bear has a leg in the air and a knee bent under it, a frog in
     mid-hop has folded its legs under the trunk it hops from, and an owl crossing
     the valley has its wings out and beating. Those are the frames where a joint
     can be lost -- a near leg hides behind the far one, a wing turns edge-on -- so
     the same joints are pooled again over the model's own stride, beat and tuck.
     The poses are read off `partAngles`, the very function the draw calls to turn a
     pose state into a part's angles. What they are worth there is a different
     measurement from the idle one and is asked separately: the bear's knee is worth
     351 seam pixels in motion against 496 standing still, and the owl's wing joint
     only 52 against 189, because at the beat the wing lies along the sight line at
     the two side bearings -- the stroke shows 24 rows of shift at the front and
     behind bearings and 3 at the sides. */
  const MOVEPOSE = { owl: 'beat', frog: 'hop', bear: 'swing' };
  const MOVE = [['bear', 'leg', 'shin'], ['bear', 'body', 'leg'],
    ['frog', 'body', 'thigh'], ['owl', 'body', 'wing']];
  const mrows = MOVE.map((j) => pool(j[0], j[1], j[2], 0, MOVEPOSE[j[0]]));
  const shotAt = (id, pose, side) => (joint.shots || [])
    .find((s) => s.id === id && s.pose === pose && s.side === side);
  /* the bearings both this pose and the standing body were filmed from: a pose is
     only proved to have reached the picture by comparing what the frame holds at
     that bearing with what it held at the same bearing standing still */
  const sidesOf = (id, pose) => (joint.shots || [])
    .filter((s) => s.id === id && s.pose === pose).map((s) => s.side)
    .filter((sd) => shotAt(id, 'idle', sd));
  /* how far the lowest row of a named part rose, in rows of the frame: row 0 of a
     readPixels buffer is the bottom of the image, so a part whose lowest row has
     come up is a part that has left the ground it was standing on. This is the
     right question for a walking body, whose feet are still on the floor. */
  const liftOf = (id, pose, pre) => {
    let best = 0;
    for (const side of sidesOf(id, pose)) {
      const a = shotAt(id, 'idle', side), b = shotAt(id, pose, side);
      for (const ra of a.box || []) {
        if (!ra[0].startsWith(pre)) continue;
        const rb = (b.box || []).find((q) => q[0] === ra[0]);
        if (rb) best = Math.max(best, rb[2] - ra[2]);
      }
    }
    return best;
  };
  /* the same rise, counted against the body the part hangs from. A hop lifts the
     whole body off the floor, and every part of it goes up with the trunk: what
     says a hop reached the frame is the thigh coming up under the trunk, and for a
     wing on the bottom of its stroke it is the wing coming down against the body it
     beats from. Counted this way the body's own move cancels out. */
  const shiftOf = (id, pose, pre) => {
    let best = 0;
    for (const side of sidesOf(id, pose)) {
      const a = shotAt(id, 'idle', side), b = shotAt(id, pose, side);
      const ba = (a.box || []).find((q) => q[0] === 'body');
      const bb = (b.box || []).find((q) => q[0] === 'body');
      if (!ba || !bb) continue;
      for (const ra of a.box || []) {
        if (!ra[0].startsWith(pre)) continue;
        const rb = (b.box || []).find((q) => q[0] === ra[0]);
        if (rb) best = Math.max(best, Math.abs((rb[2] - bb[2]) - (ra[2] - ba[2])));
      }
    }
    return best;
  };
  /* the pose has to be the model's own extreme rather than one guessed at: swept
     over a whole stride the bear's legs come 0.618 rad out of their stance (at 1/6
     of a cycle), the frog's tuck is worth 1.4 rad once its feet are off the floor
     it stands on, and the owl's wing 1.736 rad at the bottom of its stroke. Under
     half a radian a limb has turned less than the width of the part that carries it,
     which is a body you cannot see moving. */
  check('the stride, the beat and the tuck asked for are the model\u0027s own extremes, and they move the body it is asking about',
    !joint.error && joint.prem.length === 3 && joint.prem.every((x) => x.moved >= 0.5) &&
      Math.abs(joint.beat.owl.rz) > 0.95,
    joint.error || { prem: joint.prem, beat: joint.beat, swing: joint.swing });
  /* and the pose has to reach the frame, not stay in the state handed to the draw:
     measured here, the bear's shin rose 29 rows of a 560-row frame off the floor it
     was standing on, the frog's thigh came 48 rows up against the trunk it hops
     from (its shin 121 rows), and the owl's wing moved 24 rows against its body. */
  check('and the pose reached the picture: a foot left the floor it was standing on, a leg came up under the body it hops from, and a wing came off the body it beats from',
    !joint.error && liftOf('bear', 'swing', 'shin') >= 8 && shiftOf('frog', 'hop', 'thigh') >= 8 &&
      shiftOf('owl', 'beat', 'wing') >= 8,
    joint.error || { bearShin: liftOf('bear', 'swing', 'shin'), frogThigh: shiftOf('frog', 'hop', 'thigh'),
      owlWing: shiftOf('owl', 'beat', 'wing') });
  check('the id buffer still knows which part drew a pixel while the body is moving',
    !joint.error && joint.shots.filter((s) => s.pose !== 'idle' && s.id !== 'human')
      .every((s) => s.cover > 90),
    joint.error || joint.shots.filter((s) => s.pose !== 'idle').map((s) => [s.id, s.pose, s.side, s.cover]));
  check('the joints a moving body puts in the frame are still worth reading: bear knee, bear hip, frog thigh, owl wing',
    mrows.every((r) => r.n >= 40), mrows);
  check('and they are still two colours there, not one colour at two strengths',
    mrows.every((r) => r.pctShare >= 80 && r.ds >= 0.05), mrows);
  check('nor is a joint in motion a joint made of one colour on both sides of the line',
    mrows.every((r) => r.pctSame <= 5), mrows);

  /* The minimap paints its places and its creatures on top of the terrain it
     spins with. The terrain image sits one pixel per cell in a frame that is
     already rotated to the heading, so a dot drawn at the raw offset stands on
     its own place; a dot rotated a second time by hand and stretched by the
     map's zoom turns twice as fast as the ground under it and drifts off the
     marker it is meant to sit on. This reads the map's own canvas back: from
     two stands, at three headings, every in-range place has to show a dot-sized
     warm mark where the terrain puts it. The faint marker baked into the terrain
     alone is one pixel; a dot standing on it is nine. One pixel is a place
     remembered; nine is a place pointed at. */
  const mapDots = await step('theMinimapDotsTurnWithTheMap', () => {
    const N = window.FRUTARIA, g = window.game, p = g.player, sp = N.spawn;
    const was = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, vx: p.vx, vy: p.vy, vz: p.vz,
      time: g.time, mode: g.mode, third: g.thirdPerson, hover: g.hover, form: p.form,
      creatures: g.creatures, drops: g.drops, parts: g.particles ? g.particles.n : 0 };
    const mm = document.getElementById('minimap');
    const ctx = mm.getContext('2d');
    const S = mm.width, C = S / 2;
    const rot = (t, v) => { const c = Math.cos(t), s = Math.sin(t); return [c * v[0] - s * v[1], s * v[0] + c * v[1]]; };
    const poses = [[sp.x, sp.y, sp.z], [55.5, 21.05, 78.5]];
    const shots = [];
    for (const pose of poses) for (const yaw of [Math.PI, Math.PI / 2, 0]) {
      p.x = pose[0]; p.y = pose[1]; p.z = pose[2]; p.yaw = yaw; p.pitch = 0;
      p.vx = p.vy = p.vz = 0; g.mode = 'play'; g.thirdPerson = false; g.hover = null; p.form = null;
      g.creatures = []; g.drops = []; if (g.particles) g.particles.n = 0;
      g._camFrame = g.shootCamera(p); g.updateEnv(); g.render(); g.ui.update();
      const img = ctx.getImageData(0, 0, S, S).data;
      const warm = new Uint8Array(S * S);
      for (let Y = 0; Y < S; Y++) for (let X = 0; X < S; X++) {
        const i = (Y * S + X) * 4;
        if (img[i] > 240 && img[i + 1] > 200 && img[i + 2] < 185 && img[i + 3] >= 200) warm[Y * S + X] = 1;
      }
      const seen = new Uint8Array(S * S);
      const clusters = [];
      for (let Y = 0; Y < S; Y++) for (let X = 0; X < S; X++) {
        const i = Y * S + X;
        if (!warm[i] || seen[i]) continue;
        const stack = [[X, Y]]; seen[i] = 1;
        let n = 0, sx = 0, sy = 0;
        while (stack.length) {
          const q2 = stack.pop(); n++; sx += q2[0]; sy += q2[1];
          for (const k of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = q2[0] + k[0], ny = q2[1] + k[1];
            if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
            const j = ny * S + nx;
            if (!seen[j] && warm[j]) { seen[j] = 1; stack.push([nx, ny]); }
          }
        }
        clusters.push({ dx: sx / n - C, dy: sy / n - C, n });
      }
      const pois = [];
      for (const q of N.POIS) {
        const d = [q.x - pose[0], q.z - pose[2]];
        const dist = Math.hypot(d[0], d[1]);
        if (dist <= 12 || dist >= 62) continue;
        const at = rot(-yaw, d);
        let near = 1e9, size = 0;
        for (const cl of clusters) {
          const dd = Math.hypot(cl.dx - at[0], cl.dy - at[1]);
          if (dd < near) { near = dd; size = cl.n; }
        }
        pois.push({ id: q.id, d: +dist.toFixed(2), near: +near.toFixed(2), size });
      }
      shots.push({ x: pose[0], z: pose[2], yaw: +yaw.toFixed(4), pois });
    }
    p.x = was.x; p.y = was.y; p.z = was.z; p.yaw = was.yaw; p.pitch = was.pitch;
    p.vx = was.vx; p.vy = was.vy; p.vz = was.vz; g.time = was.time; g.mode = was.mode;
    g.thirdPerson = was.third; g.hover = was.hover; p.form = was.form;
    g.creatures = was.creatures; g.drops = was.drops;
    if (g.particles) g.particles.n = was.parts; g._camFrame = null;
    return { shots };
  });
  check('the minimap dots stand where the map puts the places: from two stands at three headings, every in-range place shows a dot-sized mark within 3 px of its terrain position',
    mapDots.shots.every((s) => s.pois.length > 0 && s.pois.every((q) => q.near < 3 && q.size >= 4)),
    mapDots.shots);

  /* A save is the only thing standing between a day of walking and nothing at
     all. The step that used to cover it read one field back -- the id -- and the
     rest of the valley could have been dropped on the floor and nothing would
     have said so. The whole valley is read back now: every cell hashed, a save
     written of a valley deliberately unlike the one standing here, that valley
     then edited under the save, and the game restarted -- the blocks come from
     the seed again, which is what closing the tab and coming back really does --
     so that the only thing between a bare generated valley and the valley that
     was saved is the save itself. */
  const trip = await step('aSaveRoundTripPutsTheValleyBack', () => {
    const N = window.FRUTARIA, g = window.game, W = g.world, p = g.player;
    // what this step is about to disturb, put back at the end: the steps before
    // it earned this pack and this clock, and they are over now, not this one
    const was = { time: g.time, day: g.day, inv: g.inv, stashes: g.stashes, diffs: g.diffs,
      regrow: g.regrow, growQueue: g.growQueue, drops: g.drops, buffs: g.buffs, posts: g.posts,
      seen: g.seen, dex: g.dexFruit, stats: g.stats, upg: Object.assign({}, g.upg),
      owl: g._owlUnlocked, quests: g.quests.map(q => q.done),
      p: { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, vital: p.vital,
        form: p.form, formT: p.formT, formMax: p.formMax, dry: p.dry } };
    const hash = () => {
      let h = 2166136261;
      const b = W.blocks;
      for (let i = 0; i < b.length; i++) { h ^= b[i]; h = (h * 16777619) >>> 0; }
      return h >>> 0;
    };
    // three fruit the valley is holding, each with open sky over it
    const fruit = [];
    for (let y = 1; y < W.h && fruit.length < 3; y++)
      for (let z = 0; z < W.d && fruit.length < 3; z++)
        for (let x = 0; x < W.w && fruit.length < 3; x++) {
          const b = W.get(x, y, z);
          if (N.FRUIT_BLOCK[b] && !W.get(x, y + 1, z)) fruit.push([x, y, z, b]);
        }
    if (fruit.length < 3) return { error: 'the valley holds no fruit to edit', found: fruit.length };
    const before = hash(), diffsBefore = g.diffs.length;
    // 1. a save of a valley that is not this one: a later clock, a fuller pack, a
    //    body moved and fed, a codex with a new creature in it, an upgrade earned,
    //    a pit still growing, a fruit waiting to come back
    const upgId = N.STORAGE.backpack.upgrades[0].id;
    const fid = N.FRUITS[0].id;
    g.day += 3; g.time += 137;
    g.upg[upgId] = true;
    g.stats.harvested += 7;
    g.seen.owl = true;
    g.inv.push({ kind: 'fruit', id: fid, fresh: 3, maxFresh: 9 });
    g.regrow.push({ x: fruit[0][0], y: fruit[0][1], z: fruit[0][2], b: fruit[0][3], t: 40 });
    g.growQueue.push({ x: fruit[1][0], y: fruit[1][1], z: fruit[1][2], t: 60, fruit: fid });
    const at = { x: p.x + 0.25, y: p.y, z: p.z + 0.25 };
    if (W.solidAt(Math.floor(at.x), Math.floor(at.y), Math.floor(at.z))) at.x = p.x;
    p.x = at.x; p.z = at.z; p.vital = 4.25; p.dry = 0.5;
    const saved = { day: g.day, time: g.time, harvested: g.stats.harvested, inv: g.inv.length,
      regrow: g.regrow.length, growQueue: g.growQueue.length, vital: p.vital, dry: p.dry,
      x: p.x, z: p.z };
    g.save();
    // 2. edit the valley under that save: pick the three fruit, and raise a trunk
    //    in the open sky over the last of them -- an edit the save cannot know of
    for (const f of fruit) g.setBlock(f[0], f[1], f[2], 0);
    const raised = [fruit[2][0], fruit[2][1] + 1, fruit[2][2]];
    const raisedWas = W.get(raised[0], raised[1], raised[2]);
    g.setBlock(raised[0], raised[1], raised[2], N.BLOCK_ID.trunk);
    const mid = hash(), pushed = g.diffs.length - diffsBefore;
    // 3. close the tab and come back: the blocks come off the seed again, and the
    //    chunk flags are cleared with them, so the save is the only thing that can
    //    put this valley back -- and the only thing that can flag what it touches
    W.blocks.fill(0);
    N.generate(W, g.seed);
    W.dirty.fill(0);
    const bare = hash();
    const ok = g.load();
    const after = hash();
    const dirty = W.dirty.reduce((a, b) => a + b, 0);
    const got = {
      day: g.day === saved.day, time: Math.abs(g.time - saved.time) < 1e-9,
      harvested: g.stats.harvested === saved.harvested, inv: g.inv.length === saved.inv,
      regrow: g.regrow.length === saved.regrow, growQueue: g.growQueue.length === saved.growQueue,
      upg: !!g.upg[upgId], seen: !!g.seen.owl,
      vital: Math.abs(p.vital - saved.vital) < 1e-9,
      dry: Math.abs((p.dry || 0) - saved.dry) < 1e-9,
      at: Math.abs(p.x - saved.x) < 1e-9 && Math.abs(p.z - saved.z) < 1e-9,
      fruit: fruit.every(f => W.get(f[0], f[1], f[2]) === f[3]),
      raised: W.get(raised[0], raised[1], raised[2]) === raisedWas,
      diffs: g.diffs.length === diffsBefore
    };
    // the blocks need nothing put back: the load returned them to the valley that
    // was standing here. the rest of the game state does
    Object.assign(g, { time: was.time, day: was.day, inv: was.inv, stashes: was.stashes,
      diffs: was.diffs, regrow: was.regrow, growQueue: was.growQueue, drops: was.drops,
      buffs: was.buffs, posts: was.posts, seen: was.seen, dexFruit: was.dex, stats: was.stats });
    g._owlUnlocked = was.owl;
    g.quests.forEach((q, i) => { q.done = was.quests[i]; });
    for (const k in g.upg) delete g.upg[k];
    Object.assign(g.upg, was.upg);
    Object.assign(p, was.p);
    return { ok, cells: W.blocks.length, before, mid, bare, after,
      edited: mid !== before, bareDiffers: bare !== before, same: after === before,
      pushed, dirty, diffsBefore, got };
  });
  check('a save written today puts every one of the valley\'s 1.2M cells back tomorrow',
    !trip.error && trip.ok && trip.edited && trip.bareDiffers && trip.same, trip);
  check('an edit made after the save was written is not in it and does not come back',
    !trip.error && trip.pushed === 4 && trip.got.raised && trip.got.fruit, trip);
  check('the clock, the pack, the body, the codex, the upgrade and the queues come back too',
    !trip.error && Object.keys(trip.got).every(k => trip.got[k]), trip);
  check('what a load replays is flagged for re-meshing, not left as numbers in a grid',
    !trip.error && trip.dirty > 0 && trip.dirty <= 100, trip);

  console.log(log.join('\n'));
  console.log(errs.length ? '--- ERRORS ---\n' + errs.slice(0, 8).join('\n') : '--- no errors ---');
  process.exitCode = errs.length ? 1 : 0;
  await browser.close();
})();
