/* backpack upgrades / slot usage verification */
const puppeteer = require('puppeteer-core');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome', headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await page.waitForFunction('window.game && window.game.ready', { timeout: 90000 });

  const r = await page.evaluate(() => {
    const g = window.game, out = {};
    const F = window.FRUTARIA;
    window.startGame();
    // 1) baseline slot usage
    g.inv = [];
    out.base = { cap: g.cap(), used: g.used() };
    for (const id of ['owlberry', 'frogpear', 'silkberry']) g.addItem('fruit', id);
    out.after3 = { cap: g.cap(), used: g.used(), slots: g.inv.map(i => g.slotOf(i)) };
    // 2) one legendary (12 slots) fills the 24-slot pack exactly, a second one cannot fit
    out.legendary = g.addItem('fruit', 'bruinfig');
    out.rejSecond = g.addItem('fruit', 'bruinfig');
    // 3) side pouch +6 is not yet enough for a second legendary
    g.upg.pouch1 = true;
    out.pouch1 = { cap: g.cap() };
    out.stillFull = g.addItem('fruit', 'bruinfig');
    // 4) deep pouch +6 -> 36 slots, now it fits
    g.upg.pouch2 = true;
    out.pouch2 = { cap: g.cap() };
    out.acceptSecond = g.addItem('fruit', 'bruinfig');
    // 5) silver divider: rare and above cost 1 less
    const probe = ['frogpear', 'silkberry', 'bruinfig'];
    const before = probe.map(id => g.slotOf({ kind: 'fruit', id }));
    g.upg.divider = true;
    const after = probe.map(id => g.slotOf({ kind: 'fruit', id }));
    out.divider = { before, after, cap: g.cap() };
    // 6) common fruit is unaffected
    out.common = { before: 1, after: g.slotOf({ kind: 'fruit', id: 'owlberry' }) };
    // 7) pits cost half, plus the divider
    out.pit = { frogpear: g.slotOf({ kind: 'pit', id: 'frogpear' }), bruinfig: g.slotOf({ kind: 'pit', id: 'bruinfig' }) };
    // 8) walking to the greenhouse door should finish q7 and grant the divider
    g.upg.divider = false;
    const gh = window.FRUTARIA.POIS.find(p => p.id === 'greenhouse');
    g.player.x = gh.x + 1; g.player.y = gh.y + 1; g.player.z = gh.z + 1;
    g.checkQuests();
    out.q7 = { done: g.quests.find(q => q.id === 'q7').done, divider: g.upg.divider };
    // 9) upgrades survive a save/load round trip
    g.save();
    const raw = JSON.parse(localStorage.getItem('frutaria.save.v1') || '{}');
    out.savedUpg = raw.upg;
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  console.log(errs.length ? errs.slice(0, 8).join('\n') : 'no console errors');
  process.exitCode = errs.length ? 1 : 0;
  await browser.close();
})();
