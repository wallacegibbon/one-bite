/* save round trip: write a save, reload the page, continue from the start screen */
const puppeteer = require('puppeteer-core');
const path = require('path');

const URL_AUTO = 'file://' + path.join(__dirname, '..', 'index.html') + '?auto';
const URL_MENU = 'file://' + path.join(__dirname, '..', 'index.html');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new', executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-gpu', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 560 });
  const errs = []; const seen = new Set();
  page.on('pageerror', e => { const k = e.message; if (!seen.has(k)) { seen.add(k); errs.push('PAGEERROR: ' + k + '\n' + (e.stack || '').split('\n').slice(0, 3).join('\n')); } });
  page.on('console', m => { if (m.type() === 'error') { const t = m.text(); if (!seen.has(t)) { seen.add(t); errs.push('CONSOLE: ' + t); } } });

  const log = [];
  const finish = async () => {
    console.log(log.join('\n'));
    console.log(errs.length ? '--- ERRORS ---\n' + errs.slice(0, 8).join('\n') : '--- no errors ---');
    process.exitCode = errs.length ? 1 : 0;
    await browser.close();
  };
  process.on('uncaughtException', (e) => { errs.push('THREW: ' + e.message); finish().then(() => process.exit(1)); });
  const step = async (name, fn) => { const r = await page.evaluate(fn); log.push(name + ': ' + JSON.stringify(r)); return r; };
  const check = (what, ok, got) => { log.push((ok ? '  ok  ' : '  FAIL ') + what + (ok ? '' : ' ' + JSON.stringify(got))); if (!ok) errs.push('CHECK FAILED: ' + what + ' ' + JSON.stringify(got)); };
  const wait = ms => new Promise(r => setTimeout(r, ms));

  /* ---------- 1. a world with something worth losing ---------- */
  await page.goto(URL_AUTO, { waitUntil: 'load' });
  await page.waitForFunction('window.game && window.game.ready', { timeout: 120000 });
  await wait(600);

  const made = await step('make', () => {
    const g = window.game, N = window.FRUTARIA;
    g.inv.length = 0;
    g.addItem('fruit', 'owlberry'); g.addItem('fruit', 'frogpear'); g.addItem('plant', 'cellarseed');
    // the town cellar gets a fruit, so q1 / owl post state is non-trivial
    g.stashes[0].items.push({ kind: 'fruit', id: 'frogpear', fresh: 500, maxFresh: 900 });
    // a cellar tree. The spot is found, not remembered: it has to be open
    // ground with ten clear cells above it, because the pit planted in the same
    // breath grows into a tree and the checks that follow read that tree. A
    // remembered coordinate stopped working the day the village roofs were
    // fixed -- they now stand over ground that used to be bare grass, and a
    // roof is solid ground to `groundY`, so the tree was being built on a roof.
    const spot = (() => {
      for (let z = 100; z < 152; z += 2) for (let x = 112; x < 152; x += 2) {
        const y = N.groundY(g.world, x, z, 40);
        if (y < 15 || y > 34) continue;
        let clear = true;
        for (let dy = 1; dy <= 10; dy++) if (g.world.get(x, y + dy, z)) { clear = false; break; }
        if (clear) return { x, y, z };
      }
      return null;
    })();
    if (!spot) throw new Error('no open ground near Lanternrow to plant on');
    g.player.x = spot.x + 0.5; g.player.y = spot.y; g.player.z = spot.z + 0.5;
    g.buildCellarTree();
    // a planted pit: the growth queue is the thing a save used to forget
    g.addItem('pit', 'owlberry');
    g.plantPit(g.inv[g.inv.length - 1], g.inv.length - 1);
    // fruit scattered by a death
    g.drops.push({ x: spot.x, y: spot.y, z: spot.z - 2, item: { kind: 'fruit', id: 'frogpear', fresh: 700, maxFresh: 900 }, t: 600 });
    // a plant buff and a form in progress
    g.buffs.stealth = 60;
    g.addItem('fruit', 'owlberry');
    g.sel = g.inv.length - 1; g.useSelected();
    const tree = g.stashes.find(s => s.kind === 'tree');
    return {
      id: g.id, inv: g.inv.map(i => i.kind + ':' + i.id), stashes: g.stashes.map(s => s.id + '/' + s.kind),
      growQueue: g.growQueue.length, drops: g.drops.length, buffs: Object.keys(g.buffs),
      form: g.player.form, formT: +g.player.formT.toFixed(1), formMax: g.player.formMax,
      treeAt: tree ? [tree.x, tree.y, tree.z] : null,
      coreBlock: tree ? g.world.get(tree.x, tree.y, tree.z) : null
    };
  });
  await step('save', () => { window.game.save(); const s = localStorage.getItem(window.FRUTARIA.SAVE_KEY); return s ? 'saved ' + s.length + 'B' : 'NO SAVE'; });

  /* ---------- 2. reload the page: the valley must come back on its own ---------- */
  await page.goto(URL_MENU, { waitUntil: 'load' });
  await page.waitForFunction('window.game && window.game.ready', { timeout: 120000 });
  await page.waitForFunction("!document.getElementById('startWrap').classList.contains('hidden')", { timeout: 20000 });
  const menu = await step('menu', () => {
    const wrap = document.getElementById('startWrap');
    return {
      startVisible: !wrap.classList.contains('hidden'),
      startLabel: document.getElementById('btnStart').textContent,
      note: document.getElementById('startSave').textContent,
      freshVisible: !document.getElementById('btnFresh').classList.contains('hidden'),
      // nothing has been loaded yet: the world is the fresh one
      invBeforeContinue: window.game.inv.length, stashesBefore: window.game.stashes.map(s => s.id)
    };
  });
  check('the start screen offers the save back', menu.startLabel !== 'Start exploring' && menu.startLabel !== '开始探索', menu);
  check('the start screen quotes the save', menu.note.length > 0, menu);
  check('clearing the save is offered', menu.freshVisible, menu);

  await page.click('#btnStart');
  await wait(900);

  const back = await step('afterContinue', () => {
    const g = window.game;
    const tree = g.stashes.find(s => s.kind === 'tree');
    return {
      id: g.id, inv: g.inv.map(i => i.kind + ':' + i.id), stashes: g.stashes.map(s => s.id + '/' + s.kind),
      cellarFirst: g.stashes[0].id, cellarKind: g.stashes[0].kind,
      growQueue: g.growQueue.length, drops: g.drops.length, buffs: Object.keys(g.buffs),
      form: g.player.form, formT: +g.player.formT.toFixed(1), formMax: g.player.formMax,
      fraction: +(g.player.formT / g.player.formMax).toFixed(3),
      treeAt: tree ? [tree.x, tree.y, tree.z] : null,
      coreBlock: tree ? g.world.get(tree.x, tree.y, tree.z) : null,
      pos: [Math.round(g.player.x), Math.round(g.player.z)]
    };
  });
  check('the identity survives a reload', back.id === made.id, { before: made.id, after: back.id });
  check('the backpack survives', JSON.stringify(back.inv) === JSON.stringify(made.inv), { before: made.inv, after: back.inv });
  check('the town cellar is still the town cellar', back.cellarFirst === 'cellar' && back.cellarKind === 'cellar', back);
  check('the cellar tree survives', JSON.stringify(back.treeAt) === JSON.stringify(made.treeAt), { before: made.treeAt, after: back.treeAt });
  check('the planted pit is still growing', back.growQueue === made.growQueue && back.growQueue > 0, back);
  check('scattered fruit is still recoverable', back.drops === made.drops && back.drops > 0, back);
  check('a plant buff survives', JSON.stringify(back.buffs) === JSON.stringify(made.buffs), { before: made.buffs, after: back.buffs });
  check('the form bar keeps its fraction', back.form === made.form && back.fraction > 0 && back.fraction <= 1, { saved: made.formT + '/' + made.formMax, after: back });

  // the loaded world is the same world: the cellar tree is standing where it was
  const standing = await step('treeStanding', () => {
    const g = window.game, tree = g.stashes.find(s => s.kind === 'tree');
    return { core: g.world.get(tree.x, tree.y, tree.z), trunk: g.world.get(tree.x, tree.y + 2, tree.z) };
  });
  check('the cellar tree is still blocks in the world', standing.core === 77 && standing.trunk === 79, standing);

  // and the queue is live, not just present: shorten it and watch the sapling grow
  const sapling = await step('saplingGrows', () => {
    const g = window.game;
    const q = g.growQueue[0];
    if (!q) return 'no grow queue';
    g.setBlock(q.x, q.y, q.z, 0);          // clear the pit block, then let the queue do its work
    q.t = 0.2;
    return { at: [q.x, q.y, q.z], fruit: q.fruit };
  });
  await wait(900);
  const grew = await page.evaluate((at) => {
    const g = window.game;
    return { queue: g.growQueue.length, trunk: g.world.get(at[0], at[1] + 1, at[2]), leaf: g.world.get(at[0], at[1] + 5, at[2]) };
  }, sapling.at);
  log.push('saplingAfter: ' + JSON.stringify(grew));
  check('the loaded growth queue still runs', grew.queue === 0, grew);
  check('the planted pit grew into a tree', grew.trunk === 6, grew);

  /* ---------- 3. an old save shape must not lose the town ---------- */
  await step('legacySave', () => {
    const legacy = {
      id: 'p-legacy', name: '', traits: {}, time: 100, day: 1, seed: 20261008,
      p: { x: 136, y: 25, z: 134, yaw: 3.14, pitch: 0, vital: 5, form: null, formT: 0 },
      inv: [], stashes: [{ id: 'tree1', kind: 'tree', slots: 24, decay: 0.33, items: [], x: 60, y: 20, z: 60 }],
      diffs: [], seen: {}, dex: {}, regrow: [], posts: [], quests: [], stats: {}, upg: {}
    };
    localStorage.setItem(window.FRUTARIA.SAVE_KEY, JSON.stringify(legacy));
    return window.game.load();
  });
  const legacy = await step('legacyAfter', () => {
    const g = window.game;
    return { stashes: g.stashes.map(s => s.id + '/' + s.kind), cellar: g.cellar().id, id: g.id };
  });
  check('a save without a cellar entry still has the town cellar', legacy.stashes[0] === 'cellar/cellar', legacy);
  check('the trees from that save are kept', legacy.stashes.indexOf('tree1/tree') > 0, legacy);

  await finish();
})();
