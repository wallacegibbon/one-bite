/* headless screenshot + console error check
   Usage: node test/shot.js out.png "pos=136,22,128 yaw=3.6 pitch=-0.1 form=owlberry time=210" */
const puppeteer = require('puppeteer-core');
const path = require('path');

(async () => {
  const out = process.argv[2] || '/tmp/shot.png';
  const cfg = {};
  for (const tok of (process.argv[3] || '').split(/\s+/)) {
    const i = tok.indexOf('='); if (i < 0) continue;
    cfg[tok.slice(0, i)] = tok.slice(i + 1);
  }
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome', headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errs = [];
  const seen = new Set();
  const pushErr = (s) => { const k = s.split('\n')[0]; if (seen.has(k)) return; seen.add(k); errs.push(s); };
  page.on('console', m => { if (m.type() === 'error') pushErr('CONSOLE: ' + m.text()); });
  page.on('pageerror', e => pushErr('PAGEERROR: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  const url = 'file://' + path.join(__dirname, '..', 'index.html');
  await page.goto(url, { waitUntil: 'load' });
  try {
    await page.waitForFunction('window.game && window.game.ready', { timeout: 90000 });
  } catch (e) {
    console.log('!! 世界未就绪'); console.log(errs.slice(0, 12).join('\n')); await browser.close(); process.exit(1);
  }
  await page.evaluate(c => {
    const g = window.game;
    if (c.pos) { const a = c.pos.split(',').map(Number); g.player.x = a[0]; g.player.y = a[1]; g.player.z = a[2]; }
    if (c.yaw !== undefined) g.player.yaw = +c.yaw;
    if (c.pitch !== undefined) g.player.pitch = +c.pitch;
    if (c.form) { g.player.form = c.form; g.player.formT = 9999; g.player.formMax = 9999; g.ensureModel(FRUTARIA.FRUIT_BY_ID[c.form].creature); }
    if (c.time) g.time = +c.time;
    if (c.inv) { for (const id of c.inv.split(',')) g.addItem('fruit', id); }
    if (c.tp) g.thirdPerson = true;
    if (c.name) g.setName(c.name);
    if (c.epquest) { for (const q of c.epquest.split(',')) g.quests.find(x => x.id === q).done = true; g.checkEpithet(); }
    if (c.cellar) {
      // build a cellar tree, stock it, unlock Pendulum, post one fruit, then open the panel
      const F = window.FRUTARIA;
      g.player.x = 130; g.player.z = 128;
      g.buildCellarTree();
      const tree = g.stashes[g.stashes.length - 1];
      for (const id of ['silkberry', 'frogpear', 'owlberry']) tree.items.push({ kind: 'fruit', id, fresh: F.RARITY[F.FRUIT_BY_ID[id].rarity].fresh, maxFresh: F.RARITY[F.FRUIT_BY_ID[id].rarity].fresh });
      g.stashes[0].items.push({ kind: 'fruit', id: 'owlberry', fresh: 1500, maxFresh: 1500 });
      g.openStashUI(tree);
      g.stashSel = 0; g.postItem();
      g.posts[0].t = 420 * 2.4;
    }
    g.updateEnv();
    window.startGame();
  }, cfg);
  // let the game actually run a few frames
  await new Promise(r => setTimeout(r, 2500));
  if (cfg.journal) await page.evaluate(() => { window.game.mode = 'journal'; window.ui.showJournal(true); });
  await page.screenshot({ path: out });
  const perf = await page.evaluate(() => {
    const g = window.game;
    return {
      draws: g.R.stats.draws, tris: Math.round(g.R.stats.tris),
      frames: g.frames || 0, fps: g.fps ? g.fps.toFixed(1) : '?',
      zone: g.zoneName(g.player.x, g.player.z),
      creatures: g.creatures.length,
      pos: [g.player.x.toFixed(1), g.player.y.toFixed(1), g.player.z.toFixed(1)].join(','),
      grounded: g.player.grounded, hp: Math.round(g.player.vital),
      chunks: g.meshDone + '/' + (g.world.cx * g.world.cz),
      used: g.used(), cap: g.cap(),
      hover: g.hover ? [g.hover.x, g.hover.y, g.hover.z, g.hover.block].join(',') : null
    };
  });
  console.log(JSON.stringify(perf));
  if (errs.length) console.log(errs.slice(0, 12).join('\n')); else console.log('no console errors');
  console.log('-> ' + out);
  process.exitCode = errs.length ? 1 : 0;
  await browser.close();
})();
