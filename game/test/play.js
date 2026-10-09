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
    for (const id of ['owlberry', 'owlberry', 'frogpear', 'jellybloom', 'bruinfig'])
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

  // 3b. held breath belongs to the body: airBonus is not decoration
  const air = await step('airCeiling', () => {
    const g = window.game, p = g.player, N = window.FRUTARIA;
    const was = { form: p.form, x: p.x, y: p.y, z: p.z, air: p.air, vital: p.vital, vx: p.vx, vy: p.vy, vz: p.vz };
    p.x = 136.5; p.y = 22; p.z = 130.5; p.vx = p.vy = p.vz = 0; p.vital = 5;
    p.form = null; p.air = 100; p.update(0.1, {}, g);      // over-full air is clamped to the body ceiling
    const human = p.air;
    p.form = 'jellybloom'; p.air = 100; p.update(0.1, {}, g);
    const jelly = p.air;
    Object.assign(p, was);
    return { human, jelly, bonus: N.FRUIT_BY_ID.jellybloom.form.airBonus };
  });
  check('airBonus raises the breath ceiling', air.jelly === air.human + air.bonus, air);

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
    const ids = ['owlberry', 'jellybloom', 'frogpear', 'bruinfig'];
    g.inv.length = 0;
    for (const id of ids) g.addItem('fruit', id);
    const before = { vital: p.vital, inv: g.inv.length };
    const forms = [];
    for (const id of ids) { g.eat(id, 0); forms.push(p.form); }
    const after = { vital: p.vital, inv: g.inv.length };
    const lines = g.log.slice(-10).map(l => l.text);
    const out = {
      before, after, forms,
      gastric: g.gastric, gastricTime: g.gastricTime,
      overwrite: N.t('log.overwrite', {
        a: N.disp(N.FRUIT_BY_ID.owlberry.form), b: N.disp(N.FRUIT_BY_ID.jellybloom.form)
      }),
      sawOverwrite: lines.some(l => l === N.t('log.overwrite', {
        a: N.disp(N.FRUIT_BY_ID.owlberry.form), b: N.disp(N.FRUIT_BY_ID.jellybloom.form)
      })),
      churnKeys: Object.keys(N.T).filter(loc =>
        N.T[loc]['log.churn'] !== undefined || N.T[loc]['log.causeOverload'] !== undefined)
    };
    p.form = null; p.formT = 0; g.inv.length = 0;
    return out;
  });
  check('each fruit replaces the body in order', JSON.stringify(swap.forms) === JSON.stringify(['owlberry', 'jellybloom', 'frogpear', 'bruinfig']), swap.forms);
  check('swapping bodies costs no vitality', swap.after.vital === swap.before.vital, swap);
  check('each fruit is spent exactly once, none destroyed by a penalty', swap.after.inv === swap.before.inv - 4, swap);
  check('the gastric counter no longer exists on the game', swap.gastric === undefined && swap.gastricTime === undefined, swap);
  check('the replacement is announced', swap.sawOverwrite, swap.overwrite);
  check('the churn keys stay out of both language tables', swap.churnKeys.length === 0, swap.churnKeys);

  // 6. cellar in / out
  await step('cellar', () => {
    const g = window.game;
    g.inv.length = 0;
    g.addItem('fruit', 'owlberry'); g.addItem('fruit', 'jellybloom');
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
    tree.items.push({ kind: 'fruit', id: 'jellybloom', fresh: 600, maxFresh: 600 });
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
    const e = g.stashes[0].items.filter(i => i.id === 'jellybloom').pop();
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

  /* 9b. the two gates that are not "obtain a fruit": q5 wants a body at a depth,
     q6 wants a fruit carried. A jellybloom in the pack is not the quest -- a
     human can dive and take one. The quest is going down as a jellyfish. */
  const gates = await step('quest gates', () => {
    const g = window.game, p = g.player;
    const was = { form: p.form, formT: p.formT, x: p.x, y: p.y, z: p.z,
                  inv: g.inv.slice(), upg: Object.assign({}, g.upg) };
    const q = id => g.quests.find(x => x.id === id);
    const put = (arr, keep) => { arr.length = 0; for (const it of keep) arr.push(it); };
    put(g.inv, []);
    q('q5').done = false; q('q6').done = false;
    g.addItem('fruit', 'jellybloom');
    p.form = 'jellybloom'; p.formT = 200; p.x = 78; p.z = 106; p.y = 30;   // the fruit, but in the air
    g.checkQuests();
    const fruitAlone = q('q5').done;
    p.y = 9;                                                               // and on the lakebed
    g.checkQuests();
    const bodyAndDepth = q('q5').done;
    q('q5').done = false;
    g.addItem('fruit', 'bruinfig');                                        // 12 of 24 slots
    g.checkQuests();
    const carried = q('q6').done;
    Object.assign(p, { form: was.form, formT: was.formT, x: was.x, y: was.y, z: was.z });
    put(g.inv, was.inv);
    for (const k in g.upg) if (!(k in was.upg)) delete g.upg[k];
    q('q5').done = false; q('q6').done = false;
    return { fruitAlone, bodyAndDepth, carried };
  });
  check('q5 is not the fruit alone', gates.fruitAlone === false, gates);
  check('q5 is a jellyfish body on the lakebed', gates.bodyAndDepth === true, gates);
  check('q6 is a bruin fig carried home', gates.carried === true, gates);

  // 10. ecology: population / species mix
  await step('ecology', () => {
    const g = window.game;
    const by = {};
    for (const c of g.creatures) by[c.sp.id] = (by[c.sp.id] || 0) + 1;
    return by;
  });

  // 10b. intimidation belongs to the body, and one's own species is exempt
  const intimidate = await step('intimidation', () => {
    const g = window.game, p = g.player, N = window.FRUTARIA;
    const was = { form: p.form, x: p.x, y: p.y, z: p.z, vital: p.vital, vx: p.vx, vy: p.vy, vz: p.vz };
    const bear = g.creatures.find(c => c.sp.id === 'bear');
    const jelly = g.creatures.find(c => c.sp.id === 'jelly');
    p.form = 'bruinfig'; p.vital = 5;
    const standNextTo = (c) => { p.x = c.x + 3; p.y = c.y; p.z = c.z; c.state = 'wander'; c.alarm = 0; };
    standNextTo(bear); bear.update(0.05, p, g.world, g);
    const bearAtt = bear.attitudeTo('bruinfig'), bearState = bear.state;
    standNextTo(jelly); jelly.update(0.05, p, g.world, g);
    const jellyAtt = jelly.attitudeTo('bruinfig'), jellyState = jelly.state;
    Object.assign(p, was);
    bear.state = 'wander'; jelly.state = 'wander'; bear.alarm = 0; jelly.alarm = 0;
    return { aura: N.FRUIT_BY_ID.bruinfig.form.aura, bearAtt, bearState, jellyAtt, jellyState };
  });
  check('a bear is not intimidated by a bear', intimidate.bearState !== 'flee', intimidate);
  check('the bear aura still scares another species', intimidate.jellyState === 'flee', intimidate);

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
        g.addItem('fruit', 'jellybloom', 100);                 // now change one thing
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

  /* 10i. the four abilities that used to be declared and inert: glide, night
     vision, the ridge cold, the jellyfish sting. Each is measured against the
     body that does not have it, so what is being tested is the number in
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

  const sting = await step('jellySting', () => {
    const g = window.game, N = window.FRUTARIA, p = g.player;
    const was = { form: p.form, x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, vital: p.vital, wasCold: p.wasCold };
    const jelly = g.creatures.find(c => c.sp.id === 'jelly');
    const inside = (form) => {
      p.form = form; p.vital = 5; p.wasCold = false; p.fright = 0;
      g.log.length = 0;
      for (let i = 0; i < 180; i++) {                              // 3 s standing inside the animal
        p.x = jelly.x; p.y = jelly.y; p.z = jelly.z;
        jelly.update(1 / 60, p, g.world, g);
      }
      return { vital: +p.vital.toFixed(2), warned: g.log.some(l => l.text === N.t('log.stung', { n: N.disp(jelly.sp) })) };
    };
    const human = inside(null);
    const jellyBody = inside('jellybloom');
    Object.assign(p, was);
    return { human, jellyBody, sting: N.CREATURE_BY_ID.jelly.sting };
  });
  check('walking into a lamp jellyfish costs vitality', sting.human.vital < 5 - 0.5, sting.human);
  check('the sting is announced once', sting.human.warned === true, sting.human);
  check('a jellyfish body stands in the middle of the field untouched', sting.jellyBody.vital === 5, sting.jellyBody);

  console.log(log.join('\n'));
  console.log(errs.length ? '--- ERRORS ---\n' + errs.slice(0, 8).join('\n') : '--- no errors ---');
  process.exitCode = errs.length ? 1 : 0;
  await browser.close();
})();
