/* save round trip: write a save, reload the page, continue from the start screen */
const puppeteer = require('puppeteer-core');
const path = require('path');
const { sim } = require('./simwait');

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
    g.addItem('fruit', 'frogpear'); g.addItem('plant', 'cellarseed');
    // the town cellar gets a fruit, so q1 state is non-trivial
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
    g.addItem('pit', 'frogpear');
    g.plantPit(g.inv[g.inv.length - 1], g.inv.length - 1);
    // fruit scattered by a death
    g.drops.push({ x: spot.x, y: spot.y, z: spot.z - 2, item: { kind: 'fruit', id: 'frogpear', fresh: 700, maxFresh: 900 }, t: 600 });
    // a plant buff and a form in progress. The bear body is 1.4 x 1.5 m and
    // the cellar tree it just built stands inside that box, so the eat gate --
    // a body that cannot fit where it stands is refused and the fruit is not
    // spent -- would refuse it on the spot. Stand a few cells off the tree
    // before the bite. The fig goes in after the pit: the pack is 24 slots
    // and frogpear (4) + cellar stone (4) + fig (12) only fit once the pit's
    // 2 slots are gone.
    g.buffs.stealth = 60;
    g.addItem('fruit', 'bruinfig');
    let stand = null;
    for (let dx = 4; dx <= 9; dx++) {
      const ex = spot.x + dx;
      const ey = N.groundY(g.world, ex, spot.z, 40);
      if (ey < 15 || ey > 34) continue;
      // the bear's box at (ex + 0.5, ey, spot.z + 0.5) covers exactly these
      // cells; the eat gate asks solidAt of each of them, so ask them here
      let clear = true;
      for (let zz = -1; zz <= 1 && clear; zz++) for (let xx = -1; xx <= 1; xx++)
        for (let yy = 0; yy <= 1; yy++) if (g.world.solidAt(ex + xx, ey + yy, spot.z + zz)) { clear = false; break; }
      if (clear) { stand = { x: ex, y: ey }; break; }
    }
    if (!stand) throw new Error('no clear ground within 9 cells of the cellar tree');
    g.player.x = stand.x + 0.5; g.player.y = stand.y; g.player.z = spot.z + 0.5;
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
  /* ---------- 1b. the page writes the valley on its own ------------------
     Between one save and the next the valley lives only in this tab, so the
     page has to write it when it is taken away: a reload, a closed tab, a
     phone put to sleep. Two hooks answer that, and a third rule says when they
     must keep their hands off: a page still sitting on the start screen is
     holding a valley it has not loaded. */
  const leave = await step('leaveSave', () => {
    const g = window.game;
    localStorage.removeItem(window.FRUTARIA.SAVE_KEY);
    const before = { day: g.day, x: g.player.x };
    g.day += 5; g.player.x += 0.5;
    window.dispatchEvent(new Event('pagehide'));
    const s = JSON.parse(localStorage.getItem(window.FRUTARIA.SAVE_KEY) || 'null');
    g.day = before.day; g.player.x = before.x;
    return { written: !!s, day: s && s.day, want: before.day + 5, moved: s ? +(s.p.x - before.x).toFixed(2) : null };
  });
  check('a page being taken away writes the valley without being asked',
    leave.written && leave.day === leave.want && leave.moved === 0.5, leave);

  const sleep = await step('sleepSave', () => {
    const g = window.game;
    localStorage.removeItem(window.FRUTARIA.SAVE_KEY);
    const before = g.day;
    g.day += 3;
    // a phone is put to sleep without ever getting a pagehide; the page learns
    // about it through `visibilitychange` with `document.hidden` true. The flag
    // is a getter on the document prototype, so it is shadowed for the moment
    // the event is dispatched and then handed back exactly as it was.
    const desc = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden') ||
      Object.getOwnPropertyDescriptor(HTMLDocument.prototype, 'hidden');
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { configurable: true, get: desc.get, set: desc.set });
    const s = JSON.parse(localStorage.getItem(window.FRUTARIA.SAVE_KEY) || 'null');
    g.day = before;
    return { written: !!s, day: s && s.day, want: before + 3, hiddenBack: document.hidden };
  });
  check('a page put to sleep writes the valley too',
    sleep.written && sleep.day === sleep.want && sleep.hiddenBack === false, sleep);

  /* Ctrl+S is the save key the page can always answer to. It has to be read as
     a chord and not as the movement key it is spelled with: 's' walks the body
     backwards, and a player saving the valley should not take a step. */
  const chord = await step('chordBefore', () => {
    const g = window.game;
    localStorage.removeItem(window.FRUTARIA.SAVE_KEY);
    return { day: g.day, z: +g.player.z.toFixed(3) };
  });
  await page.keyboard.down('Control');
  await page.keyboard.down('s');
  await sim(page, 0.6);
  const during = await step('chordDuring', () => {
    const g = window.game;
    const s = JSON.parse(localStorage.getItem(window.FRUTARIA.SAVE_KEY) || 'null');
    return { written: !!s, day: s && s.day, z: +g.player.z.toFixed(3), back: g.input.back,
             label: document.getElementById('btnSave').textContent };
  });
  await page.keyboard.up('s');
  await page.keyboard.up('Control');
  check('Ctrl+S saves the valley', during.written && during.day === chord.day, { saved: chord, during });
  check('Ctrl+S is a chord, not a step backwards', during.z === chord.z && during.back === false, { before: chord, during });
  check('the save button names the key that works', /Ctrl\+S/.test(during.label), during.label);

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
  // and the leave hooks must keep their hands off a valley nobody loaded
  const offered = await step('menuLeave', () => {
    const before = localStorage.getItem(window.FRUTARIA.SAVE_KEY);
    window.dispatchEvent(new Event('pagehide'));
    document.dispatchEvent(new Event('visibilitychange'));
    return { kept: localStorage.getItem(window.FRUTARIA.SAVE_KEY) === before, bytes: (before || '').length };
  });
  check('a page nobody started does not write a fresh valley over the save it is offering',
    offered.kept && offered.bytes > 0, offered);

  await page.click('#btnStart');
  await sim(page, 0.9);

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
  /* The queue is a timer, so it is waited on with the timer's own clock. A wall
     sleep here asserts the frame rate of the machine, not the game: under the
     load of the whole suite the page manages about ten frames a second, the
     loop clamps dt at 0.05 s, and 900 ms of wall time buys 0.15 s of world
     time -- not enough for a sapling whose timer was set to 0.2 s. */
  log.push('saplingWait ' + JSON.stringify(await sim(page, 0.9)));
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

  /* ---------- 4. a save the game did not write ----------
     localStorage hands back whatever is in it, whenever the page asks: the shape
     some other build wrote, a value a browser put down wrong, something typed
     into the console. Reading any of it used to end in one of four ways, none of
     them polite: a body whose coordinates are a string is nowhere at all and
     never lands; a clock that is a string stops the day; a queue holding a null
     throws inside update() every frame, which freezes the valley with nothing on
     screen to say so; and a body wearing a fruit the valley no longer has throws
     on the getter every frame reads -- which is the upgrade path, not a fantasy,
     since this project has cut two species out of the roster and the save key has
     not moved since the second cut. Each case is read by the same `load()` the
     Continue button calls, then run for a second of the world's own time. */
  const P_OK = { x: 136, y: 25, z: 134, yaw: 3.14, pitch: 0, vital: 5, form: null, formT: 0 };
  const JUNK = [
    ['no body at all',          { p: {} }],
    ['a body made of words',    { p: { x: 'a', y: 'b', z: 'c', yaw: 0, pitch: 0, vital: 'x', form: null, formT: 1 } }],
    ['a clock made of words',   { time: 'abc', day: 'x', p: P_OK }],
    ['a queue holding a null',  { growQueue: [null], p: P_OK }],
    ['a queue holding a row',   { drops: [[1, 2, 3]], p: P_OK }],
    ['a pack that is a word',   { inv: 'nope', p: P_OK }],
    ['a body from a gone fruit', { p: Object.assign({}, P_OK, { form: 'deerberry' }) }],
    ['rows that are not rows',  { diffs: [[null, 2, 3, 4], [999, 999, 999, 5], [136, 30, 134, 999], [136, 26, 134, 6]], p: P_OK }]
  ];
  const errsBefore = errs.length;
  /* The three fake rows name three cells. Reading what stands in them first is
     what makes the check about the save rather than about the map: the old code
     wrote a null coordinate straight into cell (0,2,3) -- `null >= 0` is true --
     and a block id the table has no row for came back out of the Uint8Array as
     231, a block with no colour and no face. */
  const cellsBefore = await page.evaluate(() => {
    const W = window.game.world;
    return { corner: W.get(0, 2, 3), over: W.get(136, 30, 134), at: W.get(136, 26, 134) };
  });
  const junk = [];
  for (const [name, payload] of JUNK) {
    const r = await page.evaluate((s) => {
      const k = window.FRUTARIA.SAVE_KEY;
      localStorage.setItem(k, JSON.stringify(s));
      return { offered: window.game.saveInfo() !== null, loaded: window.game.load() };
    }, payload);
    const ran = await sim(page, 1.0);
    junk.push(Object.assign({ name, frames: ran.fps }, r, await page.evaluate(() => {
      const g = window.game, p = g.player, W = g.world;
      const fin = v => typeof v === 'number' && isFinite(v);
      return {
        time: fin(g.time) ? +g.time.toFixed(1) : String(g.time),
        day: fin(g.day) ? g.day : String(g.day),
        hour: fin(g.hour) ? +g.hour.toFixed(1) : String(g.hour),
        pos: [p.x, p.y, p.z].map(v => fin(v) ? +v.toFixed(2) : String(v)),
        vital: fin(p.vital) ? +p.vital.toFixed(1) : String(p.vital),
        form: p.form === null ? 'human' : String(p.form),
        inv: Array.isArray(g.inv) ? g.inv.length : typeof g.inv,
        queues: [g.growQueue, g.drops, g.regrow].map(q => Array.isArray(q) ? q.length : typeof q),
        diffs: g.diffs.length
      };
    })));
  }
  log.push('junkSaves: ' + JSON.stringify(junk));
  check('a save the game did not write throws nothing', errs.length === errsBefore, errs.slice(errsBefore, errsBefore + 3));
  check('and leaves a body that is somewhere, with a clock that still moves',
    junk.every(j => j.pos.every(v => typeof v === 'number') && typeof j.time === 'number' &&
      typeof j.hour === 'number' && typeof j.day === 'number' && typeof j.vital === 'number'), junk);
  check('and queues the update loop can walk', junk.every(j => j.queues.every(n => typeof n === 'number')), junk);
  check('and every one of them is still running a second later', junk.every(j => j.loaded === true && j.frames > 5), junk);
  const gone = junk.find(j => j.name === 'a body from a gone fruit');
  check('a body wearing a fruit the valley no longer has wakes up as itself',
    !!gone && gone.form === 'human' && gone.loaded === true, gone);
  const rows2 = junk.find(j => j.name === 'rows that are not rows');
  const planted = await page.evaluate(() => {
    const g = window.game;
    return { at: g.world.get(136, 26, 134), over: g.world.get(136, 30, 134), corner: g.world.get(0, 2, 3),
      far: g.world.get(999, 999, 999), kept: g.diffs.length };
  });
  check('the one real row in the junk lands and the three fakes do not',
    !!rows2 && planted.at === 6 && planted.over === cellsBefore.over &&
    planted.corner === cellsBefore.corner && planted.kept === 1, { cellsBefore, planted });
  const notOffered = await step('notOffered', () => {
    const k = window.FRUTARIA.SAVE_KEY, out = {};
    for (const [name, text] of [['null', 'null'], ['an array', '[]'], ['a word', '"hello"'], ['truncated', '{"day":3,"p":{"x":80,']]) {
      localStorage.setItem(k, text);
      out[name] = { info: window.game.saveInfo(), loaded: window.game.load() };
    }
    return out;
  });
  check('a save that is not an object is quoted back as nothing and loads as nothing',
    Object.keys(notOffered).every(k => notOffered[k].info === null && notOffered[k].loaded === false), notOffered);

  await finish();
})();
