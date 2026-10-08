/* real key-press test: walk / jump / fly / form timer / interact key */
const puppeteer = require('puppeteer-core');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome', headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 560 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await page.waitForFunction('window.game && window.game.ready', { timeout: 120000 });
  await page.evaluate(() => {
    const g = window.game;
    // stand on the Lanternrow clearing
    g.player.x = 136.5; g.player.z = 128.5;
    for (let k = 46; k > 0; k--) if (g.world.solidAt(136, k, 128)) { g.player.y = k + 1; break; }
    g.player.yaw = 3.14; g.player.pitch = 0;
    window.startGame();
  });
  await new Promise(r => setTimeout(r, 600));
  const P = () => page.evaluate(() => {
    const p = window.game.player;
    return { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), g: p.grounded, form: p.form, t: p.formT ? +p.formT.toFixed(0) : 0, hp: +p.vital.toFixed(1) };
  });

  const out = [];
  out.push('start ' + JSON.stringify(await P()));
  await page.keyboard.down('w');
  await new Promise(r => setTimeout(r, 1200));
  await page.keyboard.up('w');
  out.push('walkW ' + JSON.stringify(await P()));

  await page.keyboard.down(' ');
  await new Promise(r => setTimeout(r, 350));
  await page.keyboard.up(' ');
  out.push('jump ' + JSON.stringify(await P()));
  await new Promise(r => setTimeout(r, 900));
  out.push('land ' + JSON.stringify(await P()));

  // transform into an owl and fly
  await page.evaluate(() => {
    const g = window.game;
    g.inv.length = 0; g.addItem('fruit', 'owlberry'); g.sel = 0; g.useSelected();
  });
  out.push('form ' + JSON.stringify(await P()));
  await page.keyboard.down(' ');
  await new Promise(r => setTimeout(r, 1600));
  await page.keyboard.up(' ');
  out.push('flyUp ' + JSON.stringify(await P()));
  await new Promise(r => setTimeout(r, 1200));
  out.push('flyHover ' + JSON.stringify(await P()));

  // the form timer drains
  const t1 = await page.evaluate(() => window.game.player.formT);
  await new Promise(r => setTimeout(r, 1000));
  const t2 = await page.evaluate(() => window.game.player.formT);
  out.push('formT ' + t1.toFixed(1) + ' → ' + t2.toFixed(1));

  // time scale: how long a day lasts
  const day = await page.evaluate(() => ({ hour: window.game.hour, len: window.game.constructor.DAY_LEN || 420 }));
  out.push('clock ' + JSON.stringify(day));

  // the Grey Veil boundary
  await page.evaluate(() => { window.game.player.x = 3; window.game.player.y = 25; window.game.player.z = 80; });
  await page.keyboard.down('w');
  await new Promise(r => setTimeout(r, 1500));
  await page.keyboard.up('w');
  out.push('veil ' + JSON.stringify(await P()));

  console.log(out.join('\n'));
  console.log(errs.length ? 'ERRORS: ' + errs.slice(0, 5).join(' | ') : 'no errors');
  process.exitCode = errs.length ? 1 : 0;
  await browser.close();
})();
