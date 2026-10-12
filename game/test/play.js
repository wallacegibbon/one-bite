/* gameplay loop: harvest -> capacity -> eat & transform -> revert -> cellar in/out -> cellar tree -> save -> quests */
const puppeteer = require('puppeteer-core');
const path = require('path');
const { sim } = require('./simwait');

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
  // half a second of the game's own clock, not of the wall's (see simwait.js)
  await sim(page, 0.5);

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
  await sim(page, 0.3);
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
  await sim(page, 1.5);
  await step('flyAfter', () => { window.game.input.jump = false; return { y1: +window.game.player.y.toFixed(2), grounded: window.game.player.grounded }; });

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
    g.night = 0;
    for (let i = 0; i < 60; i++) bird.update(1 / 60, away, g.world, g);
    const roost = bird.airAmt;
    /* One frame of night is not enough to judge the wings. The owl wakes, stands
       on the branch and only then decides to leave it, and how many frames that
       takes depends on where it happened to land and on the dice the wander roll
       throws: measured, the single frame left the bird still on the branch in 1
       run of 3, which is a test asking whether the owl had made up its mind yet
       rather than whether a bird in the air holds its wings open. */
    g.night = 1;
    let abroad = 0;
    for (let i = 0; i < 180; i++) { bird.update(1 / 60, away, g.world, g); abroad = Math.max(abroad, bird.airAmt); }
    const npcOwl = { roost, abroad, state: bird.state };
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
      cam: { d: g.cam.d, fov: g.cam.fov }, frame: g._camFrame };
    p.form = 'frogpear';
    p.x = 92.5; p.y = 13.4; p.z = 118.5;            // Mirrorlake, at the surface
    p.vx = 1.2; p.vy = 0; p.vz = 0;
    p.yaw = Math.PI / 2; p.faceYaw = Math.PI / 2; p.pitch = -0.06;
    p.inWater = true; p.airAmt = 0; p.crouch = 0; p.squash = 0; p.bank = 0;
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
    const symTuck = iou(A.m, mirror(A.m)), symKick = iou(B.m, mirror(B.m)), moved = iou(A.m, B.m);
    g._camFrame = null; g.render();
    Object.assign(p, { x: was.x, y: was.y, z: was.z, yaw: was.yaw, pitch: was.pitch, vy: was.vy,
      vx: was.vx, vz: was.vz, faceYaw: was.faceYaw, form: was.form });
    g.time = was.time; g.mode = was.mode; g.thirdPerson = was.tp;
    g.creatures = wasCreatures;
    g.cam.d = was.cam.d; g.cam.fov = was.cam.fov; g._camFrame = was.frame;
    return { maskPx: A.n, cx, hourAt: +(at(Math.PI / 2) / 420 * 24).toFixed(2),
      symTuck: +symTuck.toFixed(3), symKick: +symKick.toFixed(3), moved: +moved.toFixed(3) };
  });
  check('the frog body is big enough in the frame to judge', swim.maskPx > 3000, swim);
  check('a swimming frog is mirror-symmetric about its own mid-plane',
    swim.symTuck > 0.96 && swim.symKick > 0.96, swim);
  check('and the kick moves the legs between its extremes', swim.moved < 0.97, swim);

  /* 10v. the gait itself, read where the claim is actually made. The frame check
     above can only see the silhouette a body leaves from directly behind, and from
     there a leg forward and a leg back move 6% of the outline -- the bound between
     0.944 and 0.976 is set by eye, and a bound set by eye is a bound that will be
     loosened the first time it annoys someone. So the same claim is read again off
     the angles the renderer is about to upload: a walk alternates (left = -right),
     a kick does not (left = right). */
  const stride = await step('swimPoseIsSynchronous', () => {
    const N = window.FRUTARIA, g = window.game;
    const parts = g.ensureModel('frog');
    const angles = (sw, t) => {
      const st = { t, phase: 0, move: 1, air: 0, crouch: 0, swim: sw };
      const a = {};
      for (const e of parts) a[e.part.name] = N.partAngles(e, st);
      return a;
    };
    const out = {};
    for (const [name, sw] of [['walk', 0], ['swim', 1]]) {
      // three samples a third of a cycle apart: caught mid-swing, not at a zero crossing
      const s = [0, 1, 2].map(k => angles(sw, 0.31 + k * 0.37));
      out[name] = {
        thigh: s.map(a => +(a.thighL.rx - a.thighR.rx).toFixed(3)),
        shin: s.map(a => +(a.shinL.rx - a.shinR.rx).toFixed(3)),
        front: s.map(a => +(a.legFL.rx - a.legFR.rx).toFixed(3)),
        swing: +Math.max(...s.map(a => Math.abs(a.thighL.rx))).toFixed(3),
        held: +Math.abs(s[0].legFL.rx).toFixed(3),
      };
    }
    return out;
  });
  check('on land the hind legs alternate: left is the mirror of right',
    stride.walk.thigh.every(d => Math.abs(d) > 0.3) && stride.walk.shin.every(d => Math.abs(d) > 0.3), stride);
  check('in the water they are in the same phase: a kick is both legs at once',
    stride.swim.thigh.every(d => d === 0) && stride.swim.shin.every(d => d === 0), stride);
  check('in the water the front legs are held, not walked',
    stride.swim.front.every(d => d === 0) && stride.swim.held > 0.3, stride);
  check('and the kick swings the hind legs as hard as a stride', stride.swim.swing > 0.3, stride);

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
      g.hover = null; g.render();
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

    // 1. the reported case: body standing in the lake, head dry, lens under the surface
    stand(shelf.x, shelf.wt + 0.0001, shelf.z, 1.2, true);
    let cf = g._camFrame;
    const tilt = Object.assign({ cam: at(cf), headWater: p.headWater, inWater: p.inWater,
      air: +p.air.toFixed(2), fogDen: +g.env.fogDen.toFixed(4) }, { px: look(cf) });

    // 2. control: the same body, level view, lens above the surface
    stand(shelf.x, shelf.wt + 0.0001, shelf.z, -0.15, true);
    cf = g._camFrame;
    const lvl = Object.assign({ cam: at(cf), headWater: p.headWater, fogDen: +g.env.fogDen.toFixed(4) }, { px: look(cf) });

    // 3. first person on the bed of deep water: the case that already worked
    stand(deep.x, deep.bed + 0.0001, deep.z, 0.9, false, deep.bed + 0.0001);
    cf = g._camFrame;
    const dp = Object.assign({ cam: at(cf), bed: deep.bed, surfaceY: deep.wt + 1, headWater: p.headWater,
      fogDen: +g.env.fogDen.toFixed(4) }, { px: look(cf) });

    return back({ shelf, deep, tilt, lvl, dp });
  });
  check('a lens under the lake surface is a lens in the water, and the body above it is dry',
    !lensUnder.error && lensUnder.tilt.cam.lensInWater === true && lensUnder.tilt.headWater === false, lensUnder);
  check('every ray from that lens hits water first, so no pixel may show raw sky',
    lensUnder.tilt && lensUnder.tilt.px.waterFirst === lensUnder.tilt.px.n &&
    lensUnder.tilt.px.over200 === 0 && lensUnder.tilt.px.maxLum < 200, lensUnder);
  check('and the whole frame is tinted by the water it is looking through',
    lensUnder.tilt && lensUnder.tilt.fogDen > 0.1 && lensUnder.tilt.px.blueMinusRed > 45, lensUnder);
  check('the view is not the body: standing in the lake with a dry head, the air still fills',
    lensUnder.tilt && lensUnder.tilt.air > 5, lensUnder);
  check('a level view, lens above the surface, is not put underwater',
    lensUnder.lvl && lensUnder.lvl.cam.lensInWater === false && lensUnder.lvl.fogDen < 0.02 &&
    lensUnder.lvl.px.over200 > 0, lensUnder);
  check('first person on the bed of deep water keeps its fog and now sees the surface from below',
    lensUnder.dp && lensUnder.dp.fogDen > 0.1 && lensUnder.dp.px.over200 === 0 &&
    lensUnder.dp.px.maxLum < 200, lensUnder);

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
  check('every pixel of the body below the surface line is changed by the water',
    wetBody.tilt && wetBody.tilt.below.n > 200 && wetBody.tilt.below.pct >= 90 &&
    wetBody.tilt.below.meanShift > 60, wetBody);
  check('and it reads as water: blue over red, not skin over red',
    wetBody.tilt && wetBody.tilt.below.blueMinusRed > 30, wetBody);
  check('the half above the surface line keeps the colour it had out of the water',
    wetBody.tilt && wetBody.tilt.dry.n > 200 && wetBody.tilt.dry.pct === 0 &&
    wetBody.tilt.dry.meanShift === 0, wetBody);
  check('the water tints the body, it never hides it: the body still shows through',
    wetBody.tilt && wetBody.tilt.through >= 85, wetBody);
  check('a level view out over the water wets the same half',
    wetBody.level && wetBody.level.below.pct >= 90 && wetBody.level.below.meanShift > 60 &&
    wetBody.level.dry.pct === 0, wetBody);

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
     has to be searched for them: Mirrorlake has a dry island in the middle, so
     the widest stretch of open water is only about 7 m across, and a body
     swimming in a straight line runs into a bank inside a second. Two tricks get
     round that. A body whose aim is held a quarter turn off its own course
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
    const run = (form, at, keys, secs) => {
      p.form = form; p.vital = 10; p.dry = 0; p.fright = 0; p.air = 999;
      p.x = at.x; p.z = at.z; p.y = at.y;
      p.vx = p.vy = p.vz = 0; p.bank = 0; p.tilt = 0; p.faceYaw = 0; p.pitch = 0; p.grounded = false;
      for (let i = 0; i < Math.round(secs * 60); i++) {
        p.yaw = 0;
        g.input = keys(); g.particles.n = 0; g.hover = null;
        p.update(1 / 60, g.input, g);
      }
      return { tilt: +(p.tilt || 0).toFixed(3), vy: +p.vy.toFixed(2), y: +p.y.toFixed(2), g: p.grounded ? 1 : 0 };
    };
    const sink = run('frogpear', { x: lake.x, z: lake.z, y: lake.top - 1.5 },
      () => ({ fwd: true, jump: false, sneak: true, sprint: false }), 2.5);
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
      if (Math.abs(level[i] - nosed[i]) + Math.abs(level[i + 1] - nosed[i + 1]) + Math.abs(level[i + 2] - nosed[i + 2]) > 24) diff++;
    }
    g.time = t0; g.updateEnv();
    Object.assign(p, was);
    return { sink, rise, climb, walk, diff };
  });
  check('a body sinking through water noses down the way it is going',
    !attitude.error && attitude.sink.tilt > 0.2 && attitude.sink.vy < 0, attitude);
  check('a body climbing through water noses up',
    !attitude.error && attitude.rise.tilt < -0.1 && attitude.rise.vy > 0, attitude);
  check('a body climbing through the air noses up too',
    !attitude.error && attitude.climb.tilt < -0.1 && attitude.climb.vy > 0, attitude);
  check('a body on foot stays level: feet hold a body level',
    !attitude.error && attitude.walk.g === 1 && Math.abs(attitude.walk.tilt) < 0.02, attitude);
  check('and the renderer reads the pitch: the same body level and nosed is not the same frame',
    !attitude.error && attitude.diff > 300, attitude);

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
    const glide = (keys, secs) => {
      p.form = 'owlberry'; p.vital = 10; p.dry = 0; p.fright = 0; p.air = 999;
      p.x = sky.x; p.z = sky.z; p.y = sky.y;
      p.vx = p.vy = p.vz = 0; p.bank = 0; p.tilt = 0; p.faceYaw = 0; p.pitch = 0; p.grounded = false;
      for (let i = 0; i < Math.round(secs * 60); i++) {
        p.yaw = 0;
        g.input = keys(); g.particles.n = 0; g.hover = null;
        p.update(1 / 60, g.input, g);
      }
      return { flap: +(p.flap === undefined ? 1 : p.flap).toFixed(3), vy: +p.vy.toFixed(2) };
    };
    const down = glide(() => ({ fwd: true, jump: false, sneak: false, sprint: false }), 1.2);
    const up = glide(() => ({ fwd: true, jump: true, sneak: false, sprint: false }), 2.0);
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
    !beat.error && beat.down.flap < 0.3 && beat.down.vy < 0, beat);
  check('and beats full stroke the moment it climbs for height',
    !beat.error && beat.up.flap > 0.9 && beat.up.vy > 0, beat);
  check('the stroke the renderer uploads goes with the beat, not with the clock',
    !beat.error && beat.riding.heave < beat.full.heave * 0.3 && beat.riding.stroke < beat.full.stroke - 0.1, beat);

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
      return { peak: +peak.toFixed(2), limit: c.sp.turn || 0,
        to90: reach < 0 ? null : +reach.toFixed(2), spd: +c.speed.toFixed(2) };
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
  check('an owl crossing the valley takes more than a second to come about ninety degrees',
    !!animals.owl && animals.owl.to90 !== null && animals.owl.to90 >= 1.2, animals);

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
    const out = {}, prev = new Map();
    for (const c of g.creatures) { out[c.sp.id] = { n: 0, moving: 0, path: 0 }; prev.set(c, { x: c.x, z: c.z }); }
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
        s.path += Math.hypot(c.x - pv.x, c.z - pv.z); pv.x = c.x; pv.z = c.z;
      }
    }
    g.time = t0; g.updateEnv();
    Object.assign(p, was);
    const res = {};
    for (const id in out) {
      const s = out[id];
      res[id] = { movingPct: Math.round(100 * s.moving / s.n), metres: Math.round(s.path / (s.n / 1800)) };
    }
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
        if (!kinds.deep && wt > 0 && wt - ty >= 3) kinds.deep = [x, z];
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
        const gy = N.terrainY(W, bx, bz, W.h - 1), wt = N.waterTop(W, bx, bz, W.h - 1);
        const surf = wt >= gy ? wt + 1 : gy;
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
    const g = window.game, W = g.world, N = window.FRUTARIA;
    const look = () => {
      const bad = { notANumber: [], outside: [], inRock: [], inCrown: 0, onFoliage: [], underTheMap: [], aboveTheAir: [] };
      for (const c of g.creatures) {
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
        // the ceiling a flying body is held to, and the floor of the valley
        if (c.y > W.h - 2) bad.aboveTheAir.push([c.sp.id, +c.y.toFixed(1)]);
      }
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
    const placed = { n: g.creatures.length, onCrown: [], inTrunk: [] };
    for (const c of g.creatures) {
      const bx = Math.floor(c.x), bz = Math.floor(c.z), by = Math.floor(c.y);
      if (N.TREE_BLOCK[W.get(bx, by - 1, bz)]) placed.onCrown.push([c.sp.id, +c.y.toFixed(1)]);
      if (W.solidAt(bx, by, bz)) placed.inTrunk.push([c.sp.id, +c.y.toFixed(1)]);
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
    const jump = { worst: 0, who: null };
    // a whole day of the world's clock, so the animals are seen roosting and flying
    for (let i = 0; i < Math.round(N.DAY_LEN * 60); i++) {
      g.update(1 / 60);
      for (const c of feet) {
        const d = Math.abs(c.y - prevY.get(c));
        if (d > jump.worst) { jump.worst = +d.toFixed(2); jump.who = c.sp.id; }
        prevY.set(c, c.y);
      }
    }
    return { seconds: +(g.time - t0).toFixed(1), placed, before, after: look(), jump,
      countsBefore: n0, countsAfter: counts() };
  });
  check('an animal is put down on the ground, not on the tree that grows out of it',
    soak.placed.n > 200 && !soak.placed.onCrown.length && !soak.placed.inTrunk.length, soak.placed);
  check('a whole day of the world running leaves every animal a body in a place',
    !soak.after.notANumber.length && !soak.after.outside.length && !soak.after.inRock.length &&
    !soak.after.underTheMap.length && !soak.after.aboveTheAir.length, soak.after);
  check('a body on foot spends the day on the ground, not on the crowns over it',
    !soak.after.onFoliage.length, soak.after);
  check('and no frame of that day moves a body further than its own body can',
    soak.jump.worst <= 0.4, soak.jump);
  check('the log, the scattered fruit and the queues do not grow without bound',
    soak.countsAfter.log <= 40 && soak.countsAfter.creatures === soak.countsBefore.creatures &&
    soak.countsAfter.drops <= soak.countsBefore.drops && soak.countsAfter.grow <= soak.countsBefore.grow, soak);

  console.log(log.join('\n'));
  console.log(errs.length ? '--- ERRORS ---\n' + errs.slice(0, 8).join('\n') : '--- no errors ---');
  process.exitCode = errs.length ? 1 : 0;
  await browser.close();
})();
