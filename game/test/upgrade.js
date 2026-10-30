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
    for (let i = 0; i < 24; i++) g.addItem('fruit', 'frogpear');
    out.after6 = { cap: g.cap(), used: g.used(), slots: g.inv.map(i => g.slotOf(i)) };
    // 2) twenty-four of the valley's fruits (common, 1 slot) fill the pack
    //    to 24 of 24 exactly; a twenty-fifth cannot fit
    out.rejSeventh = g.addItem('fruit', 'frogpear');
    // 3) side pouch +6 leaves room for a twenty-fifth
    g.upg.pouch1 = true;
    out.pouch1 = { cap: g.cap(), fits: g.addItem('fruit', 'frogpear') };
    // 4) deep pouch +6 -> 36 slots, leaves room for a twenty-sixth
    g.upg.pouch2 = true;
    out.pouch2 = { cap: g.cap(), fits: g.addItem('fruit', 'frogpear') };
    // 5) silver divider: rare and above cost 1 less. The valley's only rare
    //    fruit is gone with the demotion, so the line is demonstrated on the
    //    one rare that still exists: the cellar plant (4 -> 3)
    const probe = ['cellarseed'];
    const before = probe.map(id => g.slotOf({ kind: 'plant', id }));
    g.upg.divider = true;
    const after = probe.map(id => g.slotOf({ kind: 'fruit', id }));
    out.divider = { before, after, cap: g.cap() };
    // 6) the divider's line is a rarity line, not a kind line: the valley's
    //    only plant (rare) moves with the line the same way the fruit does
    out.plant = { on: g.slotOf({ kind: 'plant', id: 'cellarseed' }) };
    g.upg.divider = false;
    out.plant.off = g.slotOf({ kind: 'plant', id: 'cellarseed' });
    g.upg.divider = true;
    // 7) pits cost half
    out.pit = { frogpear: g.slotOf({ kind: 'pit', id: 'frogpear' }) };
    // 8) standing at the greenhouse door should seal the greenhouse deed and grant the divider
    g.upg.divider = false;
    const gh = window.FRUTARIA.POIS.find(p => p.id === 'greenhouse');
    g.player.x = gh.x + 1; g.player.y = gh.y + 1; g.player.z = gh.z + 1;
    g.checkDeeds();
    out.greenhouse = { done: g.deeds.find(q => q.id === 'greenhouse').done, divider: g.upg.divider };
    // 9) upgrades survive a save/load round trip
    g.save();
    const raw = JSON.parse(localStorage.getItem(window.FRUTARIA.SAVE_KEY) || '{}');
    out.savedUpg = raw.upg;
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  console.log(errs.length ? errs.slice(0, 8).join('\n') : 'no console errors');
  process.exitCode = errs.length ? 1 : 0;
  await browser.close();
})();
