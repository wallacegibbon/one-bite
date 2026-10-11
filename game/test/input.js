/* real key-press test: walk / jump / fly / form timer / interact key */
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
  /* Every wait below is measured in the game's own seconds (see simwait.js):
     the loop clamps dt, so a wall-clock sleep measures the frame rate of the
     machine rather than the walk, the jump or the turn it is supposed to be
     watching. */
  await page.keyboard.down('w');
  await sim(page, 1.2);
  await page.keyboard.up('w');
  out.push('walkW ' + JSON.stringify(await P()));

  await page.keyboard.down(' ');
  await sim(page, 0.35);
  await page.keyboard.up(' ');
  out.push('jump ' + JSON.stringify(await P()));
  await sim(page, 0.9);
  out.push('land ' + JSON.stringify(await P()));

  // transform into an owl and fly
  await page.evaluate(() => {
    const g = window.game;
    g.inv.length = 0; g.addItem('fruit', 'owlberry'); g.sel = 0; g.useSelected();
  });
  out.push('form ' + JSON.stringify(await P()));
  await page.keyboard.down(' ');
  await sim(page, 1.6);
  await page.keyboard.up(' ');
  out.push('flyUp ' + JSON.stringify(await P()));
  await sim(page, 1.2);
  out.push('flyHover ' + JSON.stringify(await P()));

  // the form timer drains
  const t1 = await page.evaluate(() => window.game.player.formT);
  await sim(page, 1.0);
  const t2 = await page.evaluate(() => window.game.player.formT);
  out.push('formT ' + t1.toFixed(1) + ' → ' + t2.toFixed(1));

  // time scale: how long a day lasts
  const day = await page.evaluate(() => ({ hour: window.game.hour, len: window.game.constructor.DAY_LEN || 420 }));
  out.push('clock ' + JSON.stringify(day));

  // the Grey Veil boundary
  await page.evaluate(() => { window.game.player.x = 3; window.game.player.y = 25; window.game.player.z = 80; });
  await page.keyboard.down('w');
  await sim(page, 1.5);
  await page.keyboard.up('w');
  out.push('veil ' + JSON.stringify(await P()));

  // ---- camera comfort: the lens never cuts, the body never snaps (docs/en/07) ----
  const bad = [];
  const check = (name, cond, detail) => { if (!cond) bad.push('CHECK FAILED: ' + name + ' ' + JSON.stringify(detail)); };

  await page.evaluate(() => { window.game.thirdPerson = false; });
  await sim(page, 0.5);
  const cam0 = await page.evaluate(() => {
    const g = window.game;
    const before = +g.cam.d.toFixed(3);
    g.thirdPerson = true;
    const snap = +g.cam.d.toFixed(3);                 // the frame right after the key
    return { before, snap, target: +(1.5 + 2.25 * g.player.size()[1]).toFixed(2) };
  });
  const samples = [];
  for (let i = 0; i < 12; i++) {
    await sim(page, 0.1);                             // a tenth of a second of the game's clock
    samples.push(+(await page.evaluate(() => window.game.cam.d)).toFixed(2));
  }
  const cam = Object.assign(cam0, { samples });
  out.push('camera ' + JSON.stringify(cam));
  check('pressing V does not cut the camera', cam.snap === cam.before, cam);
  check('the lens pushes out smoothly', cam.samples.every((v, i) => i === 0 || v >= cam.samples[i - 1] - 0.01), cam);
  check('the lens settles at the subject distance', Math.abs(cam.samples[11] - cam.target) < cam.target * 0.06, cam);

  const face0 = await page.evaluate(() => {
    const p = window.game.player;
    p.vx = 0; p.vz = 0;                               // judge the turn, not the drift
    p.yaw += 2.4;                                     // whip the aim by ~137 degrees
    return { f0: p.faceYaw, yaw: p.yaw };
  });
  /* One frame of the game's clock. The claim is that no single frame carries
     the whole turn: a body that snaps to the aim is finished after one.
     A wall-clock window used to measure this, which let the frame rate answer
     it -- at ten frames a second a 60 ms window is two frames of easing, and
     the check went red on a busy machine for reasons that had nothing to do
     with the body. */
  await sim(page, 0.001);
  const f1 = await page.evaluate(() => window.game.player.faceYaw);
  await sim(page, 1.5);
  const face = await page.evaluate((f0, mid, aim) => {
    const p = window.game.player, A = window.FRUTARIA.angleDelta;
    return { whip: 2.4, inFrame: +Math.abs(A(f0, mid)).toFixed(2), rest: +Math.abs(A(p.faceYaw, aim)).toFixed(3) };
  }, face0.f0, f1, face0.yaw);
  out.push('facing ' + JSON.stringify(face));
  check('the body does not snap to the aim', face.inFrame < face.whip * 0.5, face);
  check('the body finishes the turn', face.rest < 0.05, face);

  console.log(out.join('\n'));
  console.log(errs.length ? 'ERRORS: ' + errs.slice(0, 5).join(' | ') : 'no errors');
  if (bad.length) console.log(bad.join('\n'));
  process.exitCode = (errs.length || bad.length) ? 1 : 0;
  await browser.close();
})();
