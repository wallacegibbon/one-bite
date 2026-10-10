/* gameplay loop: harvest -> capacity -> eat & transform -> revert -> cellar in/out -> cellar tree -> save -> quests */
const puppeteer = require('puppeteer-core');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome', headless: 'new',
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
  await new Promise(r => setTimeout(r, 800));

  const log = [];
  const step = async (name, fn) => {
    const r = await page.evaluate(fn);
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
    g.harvest(found.x, found.y, found.z, 40);
    window.__flagged = g.world.dirty[ci];
    return { at: found, inv: g.inv.map(i => i.id), used: g.used(), cap: g.cap() };
  });

  // 1b. regrow: force the regrow timer to 0; the fruit block should grow back
  const rg = await step('regrowQueued', () => {
    const g = window.game;
    const r = g.regrow[g.regrow.length - 1];
    if (!r) return 'no regrow entry';
    window.__rg = [r.x, r.y, r.z, r.b];
    r.t = 0.05;
    return { at: [r.x, r.y, r.z], block: r.b, daysUntilRegrow: +(r.t / 420).toFixed(3), blockNow: g.world.get(r.x, r.y, r.z) };
  });
  await new Promise(r => setTimeout(r, 500));
  // 1a. a block edit must reach the rendered geometry, not only the voxel array
  const mesh = await step('meshFollowsEdits', () => {
    const W = window.game.world, ci = window.__ci;
    return { flaggedOnEdit: window.__flagged, remeshed: W.chunks[ci] !== window.__meshBefore, anyDirtyLeft: W.anyDirty() };
  });
  check('the edit flagged its chunk', mesh.flaggedOnEdit === 1, mesh);
  check('the flagged chunk is re-meshed within a few frames', mesh.remeshed, mesh);
  check('no chunk is left flagged', mesh.anyDirtyLeft === false, mesh);

  await step('regrown', () => {
    const g = window.game, [x, y, z, b] = window.__rg || [0, 0, 0, 0];
    return { blockAfter: g.world.get(x, y, z), expect: b, restored: g.world.get(x, y, z) === b, queueLen: g.regrow.length };
  });

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

  // 4. flight after transforming: hold up for 1.5 seconds
  const flyY = await step('fly', () => {
    const g = window.game;
    g.input.jump = true;
    return { y0: +g.player.y.toFixed(2) };
  });
  await new Promise(r => setTimeout(r, 1500));
  await step('flyAfter', () => { window.game.input.jump = false; return { y1: +window.game.player.y.toFixed(2), grounded: window.game.player.grounded }; });

  // 5. revert
  await step('revert', () => {
    const g = window.game;
    g.player.formT = 0.05;
    return { form: g.player.form };
  });
  await new Promise(r => setTimeout(r, 700));
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
  await new Promise(r => setTimeout(r, 500));
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
  await new Promise(r => setTimeout(r, 500));
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
    // home is picked within `spread` of the landmark and a wander target within
    // `spread` of home, so the honest bound is twice the spread
    let maxFar = 0;
    const far = () => {
      let n = 0;
      for (const c of herd()) {
        const d = Math.hypot(c.x - tower[0], c.z - tower[1]);
        if (d > maxFar) maxFar = d;
        if (d > sp.spread * 2 + 1) n++;
      }
      return n;
    };
    // standing in the field is not free (see the sting step), and this step
    // parks the player in it for 90 seconds, so the body is put back after
    const was = { form: p.form, x: p.x, y: p.y, z: p.z, vital: p.vital };
    const one = herd()[0];
    const atts = [null, 'owlberry', 'frogpear', 'bruinfig'].map((f) => {
      p.form = f; p.x = one.x + 1.5; p.y = one.y; p.z = one.z;
      return one.attitudeTo(f);
    });
    const before = { n: herd().length, wet: wet(), far: far() };
    const where = herd().map(c => [c.x, c.z]);
    // five minutes of game time, animals only: enough for several hundred wander
    // targets, and every one of those targets has to be water. Long, because the
    // way an aquatic animal used to escape the lake was a slow one -- it took the
    // field a while to walk one of its own into the tower wall
    for (let i = 0; i < 6000; i++) for (const c of herd()) c.update(0.05, p, g.world, g);
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
    const after = { wet: wet(), far: far() };
    // an animal that cannot leave the water can also be frozen by it: every
    // step it tries runs into the tower, so "still wet" alone is not alive
    const drift = herd().map((c, i) => Math.hypot(c.x - where[i][0], c.z - where[i][1])).sort((a, b) => a - b);
    Object.assign(p, was);
    return {
      n: before.n, wet: before.wet, far: before.far, after, atts,
      drift: +drift[Math.floor(drift.length / 2)].toFixed(1),
      dryFrames, solidFrames, swumM, maxFar: +maxFar.toFixed(1),
      bears: !!sp.fruit, worn: N.FRUITS.some(f => f.creature === 'jelly'),
      name: N.disp(sp), lore: N.dexOf(sp)
    };
  });
  check('the lamps are an animal and bear no fruit',
    lamps.n === 10 && lamps.bears === false && lamps.worn === false, lamps);
  check('the lamps never leave the water',
    lamps.wet === lamps.n && lamps.after.wet === lamps.n, lamps);
  check('the lamp field is the sunken tower, not the whole lake',
    lamps.far === 0 && lamps.after.far === 0 && lamps.maxFar <= 9, lamps);
  check('the lamps do not read bodies', lamps.atts.every(a => a === 'ignore'), lamps);
  check('the lamps have a dex entry', lamps.name.length > 0 && lamps.lore.length > 20, lamps);
  check('the lamps still get around the tower', lamps.drift > 1, lamps);
  check('a lamp is never dragged through the tower out of the water',
    lamps.dryFrames === 0 && lamps.solidFrames === 0, lamps);
  check('a lamp against the tower is still swimming', lamps.swumM > 3, lamps);

  // 10c. the lamps sting. This is measured rather than asserted loosely, because
  //      the number is the design: the field has to cost something to loiter in
  //      and must not kill the 18-second dive to the tower sills, which is the
  //      one fruit the lake gives you before it asks anything (docs/en/02 s4).
  const sting = await step('sting', () => {
    const g = window.game, p = g.player, N = window.FRUTARIA;
    const herd = g.creatures.filter(c => c.sp.id === 'jelly');
    const mid = (k) => herd.reduce((a, c) => a + c[k], 0) / herd.length;
    const was = { form: p.form, x: p.x, y: p.y, z: p.z, vital: p.vital, vx: p.vx, vy: p.vy, vz: p.vz };
    const run = (form, y, secs) => {
      p.form = form; p.vital = 10; p.x = mid('x'); p.y = y; p.z = mid('z');
      g.log.length = 0;
      g._stungAt = undefined;                       // the throttle is per wade, not per run
      let frames = 0;
      for (let i = 0; i < secs / 0.05 && p.vital > 0; i++) {
        for (const c of herd) c.update(0.05, p, g.world, g);
        frames++;
      }
      const warn = N.t('log.stung', { n: N.disp(N.CREATURE_BY_ID.jelly) });
      // the death line is 'bad' too, so the warning is matched by text
      return {
        lost: +(10 - p.vital).toFixed(2), secs: +(frames * 0.05).toFixed(1),
        warns: g.log.filter(l => l.text === warn).length,
        line: (g.log.filter(l => l.text === warn)[0] || {}).text || ''
      };
    };
    const surface = mid('y');
    const human = run(null, surface, 18);
    const frog = run('frogpear', surface, 18);
    const sill = run(null, 9, 18);            // the tower sills the frog pear hangs on
    Object.assign(p, was);
    return {
      rate: N.CREATURE_BY_ID.jelly.sting, human, frog, sill, surface: +surface.toFixed(1),
      immune: N.FRUITS.filter(f => f.form.poisonImmune).map(f => f.id),
      cause: N.t('log.causeSting'),
      warnText: N.t('log.stung', { n: N.disp(N.CREATURE_BY_ID.jelly) })
    };
  });
  check('the lamps sting a body that is not immune', sting.human.lost > 1, sting);
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

  // 10c. the highlight box is cached by a key that names exactly one block
  const hl = await step('highlightKey', () => {
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
    const g = window.game, P = g.particles;
    const n0 = P.n;
    /* The pool swap-removes dead particles, so a leftover particle dying during
       the two seconds below would drag the three test particles into other
       slots and the indices would lie. Start from an empty pool: these three
       live 5 s, so nothing dies and index === identity for the whole step. */
    P.n = 0;
    P.spawn(0, 40, 0, 0, 0.8, 0, 5, [1, 1, 1], 0.2, -0.5);   // bubble: buoyant
    P.spawn(0, 40, 0, 0, 0.3, 0, 5, [1, 1, 1], 0.2, 0);      // mote / firefly: weightless
    P.spawn(0, 40, 0, 0, 0, 0, 5, [1, 1, 1], 0.2);           // ember: the default gravity
    for (let i = 0; i < 20; i++) P.update(0.1, g.world);     // two seconds
    const out = {
      live: P.n,
      vy: [+P.vy[0].toFixed(2), +P.vy[1].toFixed(2), +P.vy[2].toFixed(2)],
      dy: [+(P.py[0] - 40).toFixed(2), +(P.py[1] - 40).toFixed(2), +(P.py[2] - 40).toFixed(2)]
    };
    P.n = n0;                                               // leave the pool as we found it
    return out;
  });
  check('the three test particles are the only ones live', part.live === 3, part);
  check('a bubble rises instead of sinking', part.vy[0] > 0.8 && part.dy[0] > 1, part);
  check('a mote hovers instead of sinking into the ground', Math.abs(part.vy[1]) < 0.31, part);
  check('an ember still falls', part.vy[2] < -2, part);

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
    // high over the middle of the lake: a flyer is never stopped by terrain
    const owl = g.creatures.find(c => c.sp.id === 'owl');
    const wasOwl = { x: owl.x, y: owl.y, z: owl.z, flyY: owl.flyY };
    owl.x = 78; owl.y = 22; owl.z = 106; owl.flyY = 22;
    const out = { owlNight: run(owl, 1), owlNoon: run(owl, 0) };
    // 'dusk' is still part of the setting, so the branch stays covered even
    // though no animal in the valley uses it right now
    const dusk = new N.Creature(Object.assign({}, N.CREATURE_BY_ID.owl, { active: 'dusk' }), 78, 22, 106);
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
    for (let x = 24; x < 150 && !spot; x += 3) for (let z = 24; z < 150 && !spot; z += 3) {
      const gy = ground(x, z);
      if (gy < 0 || top(x, z) !== gy) continue;                       // nothing standing on it
      if (ground(x + 1, z) !== gy || ground(x - 1, z) !== gy ||
          ground(x, z + 1) !== gy || ground(x, z - 1) !== gy) continue;   // not the edge of a roof
      let open = true;
      for (let k = 1; k <= 20 && open; k++) {
        if (top(x, z - k) !== gy) { open = false; break; }
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
    g.night = 0; bird.update(1 / 60, away, g.world, g);
    const roost = bird.airAmt;
    g.night = 1; bird.update(1 / 60, away, g.world, g);
    const npcOwl = { roost, abroad: bird.airAmt, state: bird.state };
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
    gait.npcOwl.roost === 0 && gait.npcOwl.abroad === 1, gait.npcOwl);

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

  /* 10m. the lake has a colour from the shore. The water pass is the only
     blended draw in the game, and the world shader used to divide the alpha
     byte by 255 a second time after the attribute pointer had already
     normalized it, which left the surface 0.4% opaque: standing outside
     Mirrorlake you saw no lake at all, and the only water with a colour was the
     fog you breathe with your head under. Nothing else in the build could see
     it, because every other test reads the world and this one has to read the
     frame: draw, draw again with the water meshes switched off, and the two
     frames must differ -- and differ in the direction of the water's own blue.
     The second question is how much of the bottom survives the surface. At
     alpha 0.62 the lakebed kept 38% of its contrast seen through the water, and
     the lake read as a pit in the ground rather than as water, so the block
     table now says 0.72 (0.68 measures 0.33, 0.78 measures 0.24) and the bound
     sits at 0.34. */
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
    g._camFrame = null; g.render();
    const dry = grab();
    for (const [ci, c] of off) W.chunks[ci][2].count = c;
    let changed = 0, bluer = 0;
    const lum = (px, i) => px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11;
    const over = [];
    for (let i = 0; i < wet.length; i += 4) {
      const d = Math.abs(wet[i] - dry[i]) + Math.abs(wet[i + 1] - dry[i + 1]) + Math.abs(wet[i + 2] - dry[i + 2]);
      if (d <= 6) continue;
      changed++;
      over.push(i);
      if (wet[i + 2] - wet[i] > 20 && dry[i + 2] - dry[i] <= 20) bluer++;
    }
    /* How much of the lakebed's own contrast survives the surface. The lake used
       to be so clear that the bottom was almost as varied through the water as
       out of it, and the lake read as a pit in the ground rather than as water.
       The ratio is the spread of luminance seen through the surface over the
       spread of the same pixels with the surface switched off. */
    let mw = 0, md = 0;
    for (const i of over) { mw += lum(wet, i); md += lum(dry, i); }
    mw /= over.length; md /= over.length;
    let sw = 0, sd = 0;
    for (const i of over) { sw += (lum(wet, i) - mw) ** 2; sd += (lum(dry, i) - md) ** 2; }
    const contrast = Math.sqrt(sw / over.length) / Math.sqrt(sd / over.length);
    // the water pass is still one blended draw per chunk, not one per block
    const waterTris = W.chunks.reduce((a, m) => a + (m && m[2] ? m[2].count / 3 : 0), 0);
    g._camFrame = null; g.render();
    p.x = was.x; p.y = was.y; p.z = was.z; p.yaw = was.yaw; p.pitch = was.pitch; p.vy = was.vy;
    p.form = was.form; g.time = was.time; g.mode = was.mode; g._camFrame = was.frame;
    return { px: w * h, changed, bluer, share: +(changed / (w * h)).toFixed(3), waterTris,
      contrast: +contrast.toFixed(3) };
  });
  check('the lake is drawn at all', frame.waterTris > 1000, frame);
  check('the water changes the frame from outside the lake', frame.changed > 5000, frame);
  check('and it changes it towards the colour of water', frame.bluer > 5000, frame);
  check('the lakebed does not stay as sharp through the water as out of it', frame.contrast < 0.34, frame);

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
  check('from behind, every heading shows the back of the head', facing.away && facing.away.every(v => v.lum < 55), facing);
  check('turned round, every heading shows a face', facing.toward && facing.toward.every(v => v.lum > 65), facing);
  check('the two are the same body seen from two sides, not an empty frame',
    facing.away && facing.away.every((v, i) => facing.toward[i].lum - v.lum > 25), facing);

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
      hover: g.hover, mode: g.mode, frame: g._camFrame, tp: g.thirdPerson };
    let spot = null;
    for (let x = 20; x < W.w - 12 && !spot; x++) for (let z = 20; z < W.d - 12 && !spot; z++) {
      let gy = -1;
      for (let y = W.h - 1; y >= 1; y--) if (W.solidAt(x, y, z)) { gy = y; break; }
      if (gy < 1) continue;
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

  console.log(log.join('\n'));
  console.log(errs.length ? '--- ERRORS ---\n' + errs.slice(0, 8).join('\n') : '--- no errors ---');
  process.exitCode = errs.length ? 1 : 0;
  await browser.close();
})();
