/* real key-press test: walk / jump / form timer / interact key */
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

  // transform into a frog
  await page.evaluate(() => {
    const g = window.game;
    g.inv.length = 0; g.addItem('fruit', 'frogpear'); g.sel = 0; g.useSelected();
  });
  out.push('form ' + JSON.stringify(await P()));

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

  // ---- camera comfort: the lens never cuts, the body never snaps (docs/07) ----
  const bad = [];
  const check = (name, cond, detail) => { if (!cond) bad.push('CHECK FAILED: ' + name + ' ' + JSON.stringify(detail)); };

  await page.evaluate(() => { window.game.thirdPerson = false; });
  await sim(page, 0.5);
  const cam0 = await page.evaluate(() => {
    const g = window.game;
    const before = +g.cam.d.toFixed(3);
    g.thirdPerson = true;
    const snap = +g.cam.d.toFixed(3);                 // the frame right after the key
    return { before, snap, target: +window.FRUTARIA.CAM.shotFor(g.player.size()[1],
      g.player.fov() + window.FRUTARIA.CAM.fovBump).d.toFixed(2) };
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

  /* ---- the keys a body owns ----
     The user's rule, translated: the water's up and down are bound to Space and
     Ctrl and that is very unwanted -- above all because Ctrl plus W closes the
     page -- so use J for down and K for up, let the user click the codex and the
     help instead of spending a key on them, and do not waste the hotkeys. What is
     asked here is the binding itself:
     the body really goes up on K and down on J, Space asks nothing of a body that is
     swimming (it is the push key, and a swimming body has no ground to push from),
     Ctrl is not a body key at all -- and Ctrl+W is the chord that closes the tab on
     the player's own hand -- and J and H open no panel, while the buttons do. */
  const lakeAt = await page.evaluate(() => {
    const g = window.game, N = window.FRUTARIA, W = g.world, p = g.player;
    /* The lake's own landmark is the centre of the water -- and the centre of the
       water is the isle the academy stands on, which is dry. So the deep part is
       searched for, in the ring of open water the lake's record keeps round it. */
    let found = null;
    for (let z = 72; z < 140 && !found; z++) {
      for (let x = 42; x < 116 && !found; x++) {
        const wt = N.waterTop(W, x, z, W.h - 1);
        if (wt < 0) continue;
        const bed = N.groundY(W, x, z, wt);
        if (wt - bed < 6) continue;
        if (Math.hypot(x - 66, z - 118) < 8) continue;      // the sunken tower's brick
        found = { x: x + 0.5, z: z + 0.5, wt, bed, depth: wt - bed };
      }
    }
    if (!found) return { error: 'no deep water in the lake' };
    g.mode = 'play';
    p.form = 'frogpear'; p.formT = 9999; p.formMax = 9999;
    p.vital = 10; p.air = 9999; p.dry = 0; p.fright = 0;
    p.x = found.x; p.z = found.z; p.y = found.wt - 1.0; p.vx = p.vy = p.vz = 0;
    window.__lake = found;
    return found;
  });
  if (lakeAt.error) { bad.push('CHECK FAILED: no deep water to test the water keys in ' + JSON.stringify(lakeAt)); }
  const inWater = async () => {
    await page.evaluate(() => {
      const p = window.game.player, l = window.__lake;
      p.x = l.x; p.z = l.z; p.y = l.wt - 1.0; p.vx = p.vy = p.vz = 0;
    });
    await sim(page, 2.0);                 // let the water hold it at the level it holds a body at
    return page.evaluate(() => +window.game.player.y.toFixed(2));
  };
  const hold = async (key, secs) => {
    await page.keyboard.down(key);
    await sim(page, secs);
    const r = await page.evaluate(() => ({
      y: +window.game.player.y.toFixed(2), fwd: !!window.game.input.fwd,
      up: !!window.game.input.up, down: !!window.game.input.down,
      jump: !!window.game.input.jump, sprint: !!window.game.input.sprint,
      sneak: 'sneak' in window.game.input,
    }));
    await page.keyboard.up(key);
    return r;
  };
  const rest = await inWater();
  const tryKey = async (key, secs) => { await inWater(); return hold(key, secs); };
  const roseK = await tryKey('k', 3.0);
  const sankJ = await tryKey('j', 4.0);
  const heldSpace = await tryKey(' ', 3.0);
  const heldCtrl = await tryKey('Control', 2.0);
  const movedW = await tryKey('w', 0.4);
  const keys = { rest, roseK: roseK.y, sankJ: sankJ.y, heldSpace: heldSpace.y,
    heldCtrl: heldCtrl.y, lake: lakeAt,
    held: { k: roseK, j: sankJ, space: heldSpace, control: heldCtrl, w: movedW },
    rise: +(roseK.y - rest).toFixed(2), sink: +(rest - sankJ.y).toFixed(2),
    spaceDrift: +(heldSpace.y - rest).toFixed(2),
    /* where the water's own laws say a body ends up: the level it holds a body
       that stops asking at, the ceiling a body that keeps asking up to climbs to,
       and the floor a body that keeps asking down to reaches */
    hold: +(lakeAt.wt + 1 - 0.5 - 1.6).toFixed(2),
    ceiling: +(lakeAt.wt + 1 - 0.25).toFixed(2),
    floor: +(lakeAt.bed + 0.25).toFixed(2),
    shortOfCeiling: +(lakeAt.wt + 1 - 0.25 - roseK.y).toFixed(2),
    offTheFloor: +(sankJ.y - (lakeAt.bed + 0.25)).toFixed(2),
    spaceOffHold: +(heldSpace.y - (lakeAt.wt + 1 - 0.5 - 1.6)).toFixed(2) };
  out.push('keys ' + JSON.stringify(keys));
  check('K lifts a body through the water to the top the water allows it',
    keys.rise > 0.8 && keys.held.k.up && !keys.held.k.down && keys.shortOfCeiling < 0.2, keys);
  check('J takes it down to the floor the water allows it',
    keys.sink > 0.5 && keys.held.j.down && !keys.held.j.up && Math.abs(keys.offTheFloor) < 0.3, keys);
  check('Space asks nothing of a body that is swimming: it is the push key',
    Math.abs(keys.spaceOffHold) < 0.15 && !keys.held.space.up && !keys.held.space.down, keys);
  check('and Ctrl is not a body key at all',
    !keys.held.control.up && !keys.held.control.down && !keys.held.control.jump &&
    !keys.held.control.sneak, keys);
  check('W is still the key that walks the body forward, and no other ask comes with it',
    keys.held.w.fwd && !keys.held.w.up && !keys.held.w.down, keys);

  const panels = await page.evaluate(async () => {
    const seen = [];
    const vis = id => !document.getElementById(id).classList.contains('hidden');
    const tap = k => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    tap('j'); tap('h');
    seen.push({ tapped: 'j+h', journal: vis('journal'), help: vis('help'), mode: window.game.mode });
    document.getElementById('btnJournal').click();
    seen.push({ tapped: 'btnJournal', journal: vis('journal'), mode: window.game.mode });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    seen.push({ tapped: 'escape', journal: vis('journal'), mode: window.game.mode });
    document.getElementById('btnHelp').click();
    seen.push({ tapped: 'btnHelp', help: vis('help'), mode: window.game.mode });
    document.getElementById('btnCloseHelp').click();
    seen.push({ tapped: 'btnCloseHelp', help: vis('help'), mode: window.game.mode });
    return seen;
  });
  out.push('panels ' + JSON.stringify(panels));
  check('J and H open no panel: the panels are clicked, not keyed',
    panels[0].journal === false && panels[0].help === false && panels[0].mode === 'play', panels);
  check('the codex button opens it, and Esc closes it',
    panels[1].journal === true && panels[2].journal === false, panels);
  check('the help button opens it, and its own button closes it',
    panels[3].help === true && panels[4].help === false, panels);

  console.log(out.join('\n'));
  console.log(errs.length ? 'ERRORS: ' + errs.slice(0, 5).join(' | ') : 'no errors');
  if (bad.length) console.log(bad.join('\n'));
  process.exitCode = (errs.length || bad.length) ? 1 : 0;
  await browser.close();
})();
