/* one boot, many screenshots. Usage:
     node test/shots.js [tag]        the standing set of stills
     node test/shots.js strip [name] one action, filmed in phases
   The strip is not part of all.sh and never will be: it is for the eye. */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const TAG = process.argv[2] || 'x';
const STRIP = TAG === 'strip';
const ONLY = process.argv[3] || '';
const OUT = path.join(__dirname, '..', '..', '.shots');
fs.mkdirSync(OUT, { recursive: true });

/* ---------------- the standing set of stills ---------------- */
const SHOTS = [
  ['aerial', 'pos=80,70,80 yaw=0.6 pitch=-0.95'],
  ['castle', 'pos=78,26,134 yaw=0.0 pitch=0.05 safe'],
  ['village', 'pos=140,26,142 yaw=3.9 pitch=-0.15 safe'],
  ['lake', 'pos=58,17,96 yaw=1.15 pitch=-0.05 safe'],
  ['underwater', 'pos=92,11,120 yaw=0.5 pitch=-0.15'],
  // the lake at midnight, one metre under the surface of Mirrorlake, looking
  // at the sunken tower. The lamps are cut and the lake has no light of its
  // own now: the only thing lit down there is the frog pear on the tower's
  // sills (the fruit block is self-lit), the rest is the moon on the water
  ['midnightlake', 'pos=60,13,112 yaw=2.36 pitch=-0.15 time=385'],
  ['forest', 'pos=104,25,32 yaw=1.2 pitch=-0.05 safe'],
  ['glade', 'pos=60,25,56 yaw=0.4 pitch=-0.05 safe'],
  ['cave', 'pos=28,28,34 yaw=1.0 pitch=0 safe'],
  ['sky', 'pos=44,38,24 yaw=2.5 pitch=0.0 safe'],
  // hour 0 is midnight and one day is 420 s, so 385 s is 22:00. (The set used to
  // ask for time=620 here, which is 11:30 in the morning: a shot called "night"
  // that showed noon.)
  ['night', 'pos=140,26,142 yaw=3.9 pitch=-0.15 safe time=385'],
  // 315 s is 18:00: the hour the clock calls night (night 0.78) while the sky is
  // at its brightest of the whole day. The ground has to keep the dusk's own
  // light rather than turn into a cut-out against it -- see the uAmb note in
  // docs/07 s3.2
  ['dusk', 'pos=140,26,142 yaw=3.9 pitch=-0.15 safe time=315'],
  // the one body you can wear beside the human, seen from behind: the gait
  // and the pose come out of the same physics the displacement uses, so a shot
  // of a body walking is a shot of the body, not of an animation pinned on top
  // of it
  ['human', 'pos=104,25,32 yaw=1.2 pitch=-0.05 safe tp=1'],
  ['frog', 'pos=92,11,120 yaw=0.5 pitch=-0.1 form=frogpear tp=1'],
  ['inv', 'pos=136,26,132 yaw=0.2 pitch=-0.1 safe inv=frogpear,frogpear'],
  ['cellarui', 'pos=136,26,134 yaw=0.2 pitch=-0.1 safe inv=frogpear,frogpear cellar=1'],
  // identity: the valley calls you an epithet, the name is yours (N in game)
  ['who', 'pos=136,26,132 yaw=0.2 pitch=-0.1 safe name=小满 epquest=cellar,lake'],
  ['journal', 'pos=136,26,132 yaw=0.2 pitch=-0.1 safe name=小满 epquest=cellar,lake,greenhouse journal=1'],
  // the same two screens after pressing L: the interface re-translates, the world does not move
  ['inv_en', 'pos=136,26,132 yaw=0.2 pitch=-0.1 safe inv=frogpear,frogpear lang=en'],
  ['journal_en', 'pos=136,26,132 yaw=0.2 pitch=-0.1 safe name=Xiaoman epquest=cellar,lake,greenhouse journal=1 lang=en'],
  // the help panel: the rules a player is actually told, in the other language
  ['help_en', 'pos=136,26,132 yaw=0.2 pitch=-0.1 safe help=1 lang=en']
];

/* ---------------- one action, filmed in phases ----------------
   A still answers what a body looks like. It cannot answer whether the body
   moves well, and the whole claim of the gait code -- that the pose and the
   displacement come from one physics -- is a claim about moving. So a strip
   films one action: settle the body, hold the same keys for the whole of it,
   and take a frame every `every` frames of the world's own clock.

   The page's own loop is stopped for the length of a strip and the world is
   stepped here by hand at a sixtieth of a second: otherwise the frames
   between two screenshots (a screenshot costs a tenth of a second or more of
   wall time, and the loop runs in it) would land in the strip, and the phases
   would be whatever the machine happened to be doing. Nothing else is pinned
   beyond what a still pins: the clock runs, the valley keeps its own animals,
   and the lens is the one the game holds for that body (N.CAM) -- widened for
   the tripod view only, and only as far as that body's own measured arc and
   path require, which is said where it is done below.

   Each strip is filmed twice where two views are worth having: `own`, the
   third-person lens a player actually owns, and `side`, a tripod square off the
   body's own path -- the arc of a hop is exactly what the lens behind the body
   hides, and the two lenses answer that question together.

   Usage: node test/shots.js strip [hop|stroke|turn|wild]                  */
const STRIPS = [
  // a frog-shaped body asked to go: the crouch, the push, the flight, the
  // landing, and what the legs do while the body is off the ground
  { name: 'hop', where: 'ground', form: 'frogpear', keys: 'fwd', settle: 90,
    shots: 10, every: 4, views: 'own side' },
  // the same body in water deep enough to hold it up: one stroke and the
  // fold and run-out of the knees, at the rate the body's own row swims at
  { name: 'stroke', where: 'water', form: 'frogpear', keys: 'fwd', settle: 120,
    shots: 10, every: 6, views: 'own side' },
  // a body changing its mind: the outside leg doing the work, the trunk
  // leaning into it, and the head staying where the player left it
  { name: 'turn', where: 'ground', form: 'frogpear', keys: 'fwd,left', settle: 90,
    shots: 8, every: 5, views: 'own side' },
  // one of the valley's own, asked nothing: what an animal does when nobody is
  // holding keys is the thing a player actually sees. There is no `own` view
  // here: nobody owns that lens, the game never films these bodies
  { name: 'wild', where: 'herd', form: null, keys: '', settle: 240,
    shots: 12, every: 10, views: 'side' }
];

const boot = async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome', headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
      '--window-size=1280,720']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errs = []; const seen = new Set();
  const push = s => { const k = s.split('\n')[0]; if (!seen.has(k)) { seen.add(k); errs.push(s); } };
  page.on('pageerror', e => push('PAGEERROR: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 3).join('\n')));
  page.on('console', m => { if (m.type() === 'error') push('CONSOLE: ' + m.text()); });
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await page.waitForFunction('window.game && window.game.ready', { timeout: 120000 });
  await page.evaluate(() => window.startGame());
  return { browser, page, errs, push };
};

const shotStill = async (page, c) => {
  const info = await page.evaluate(c => {
    const g = window.game;
    g.player.form = null; g.thirdPerson = false; g.time = 210;
    // the locale is pinned per shot: the set must look the same on any machine,
    // and a first visit picks the browser language, which is not fixed
    window.setLocale(c.lang || 'zh');
    g.log = [];
    g.mode = 'play'; if (window.ui) { window.ui.showCellar(false); window.ui.showJournal(false); window.ui.showHelp(false); window.ui.showDead(false); }
    g.player.vital = 10; g.player.fright = 0; g.player.air = 18;
    g.inv.length = 0; g.sel = 0;
    if (c.pos) {
      const a = c.pos.split(',').map(Number);
      g.player.x = a[0]; g.player.z = a[2];
      g.player.y = a[1];
      if (c.safe !== undefined) {
        // spiral-search for a clearing with no canopy overhead
        const TREE = { 6: 1, 7: 1, 8: 1, 9: 1, 22: 1, 27: 1, 28: 1 };
        const topSolid = (x, z) => { for (let k = 46; k > 0; k--) { const b = g.world.get(x, k, z); if (b && b < 40 && g.world.solidAt(x, k, z)) return k; } return -1; };
        const ground = (x, z) => { for (let k = 46; k > 0; k--) { const b = g.world.get(x, k, z); if (b && b < 40 && !TREE[b] && g.world.solidAt(x, k, z)) return k; } return -1; };
        let found = null;
        for (let rad = 0; rad <= 7 && !found; rad++) {
          for (let ang = 0; ang < 12 && !found; ang++) {
            const x = Math.round(a[0] + Math.cos(ang / 12 * 6.283) * rad);
            const z = Math.round(a[2] + Math.sin(ang / 12 * 6.283) * rad);
            const ts = topSolid(x, z), gr = ground(x, z);
            if (ts >= 0 && gr >= 0 && ts === gr) found = { x, z, y: gr + 1 };
          }
        }
        if (found) { g.player.x = found.x + 0.5; g.player.z = found.z + 0.5; g.player.y = found.y; }
      }
      g.player.vy = 0;
    }
    if (c.yaw !== undefined) g.player.yaw = +c.yaw;
    if (c.pitch !== undefined) g.player.pitch = +c.pitch;
    if (c.time) g.time = +c.time;
    if (c.form) { g.player.form = c.form; g.player.formT = 9999; g.player.formMax = 9999; g.ensureModel(FRUTARIA.FRUIT_BY_ID[c.form].creature); }
    if (c.inv) for (const id of c.inv.split(',')) g.addItem('fruit', id);
    if (c.tp) g.thirdPerson = true;
    if (c.cellar) g.openStashUI(g.stashes[0]);
    if (c.name) g.setName(c.name);
    if (c.epquest) { for (const q of c.epquest.split(',')) g.deeds.find(x => x.id === q).done = true; g.checkEpithet(); }
    g.updateEnv();
    return { zone: g.zoneName() };
  }, c);
  if (c.journal) await page.evaluate(() => { window.game.mode = 'journal'; window.ui.showJournal(true); });
  if (c.help) await page.evaluate(() => { window.game.mode = 'help'; window.ui.showHelp(true); });
  await new Promise(r => setTimeout(r, 1400));
  const st = await page.evaluate(() => {
    const g = window.game, p = g.player;
    return { draws: g.R.stats.draws, tris: Math.round(g.R.stats.tris), pos: [p.x.toFixed(0), p.y.toFixed(1), p.z.toFixed(0)].join(','), g: p.grounded, hp: +p.vital.toFixed(1) };
  });
  return { info, st };
};

/* The page's own loop is stopped once, here: from this point every frame of the
   world is one this file asked for. main.js's loop re-arms itself through the
   global by name, so replacing the global stops it; the input is cleared too,
   because the keyboard state the page last read is still sitting in game.input. */
const stopTheClock = page => page.evaluate(() => {
  const g = window.game;
  window.requestAnimationFrame = () => 0;
  g.input.fwd = g.input.back = g.input.left = g.input.right = false;
});

/* Put one body somewhere its action can happen at all: a flat dry place with
   room to travel for a body on foot, a lane of water deep enough to hold a
   body up for one that swims, and for a wild one nothing at all -- it is
   already standing somewhere it agreed to. */
const placeFor = (page, s) => page.evaluate(s => {
  const g = window.game, N = window.FRUTARIA, p = g.player, W = g.world;
  g.mode = 'play'; g.thirdPerson = false;
  // the subject of a film is either the body you wear or one animal of the
  // valley, never both: whatever the last strip remembered is dropped here
  window.__strip = null;
  g.player.vital = 10; g.player.fright = 0; g.player.air = p.maxAir();
  if (s.form) { p.form = s.form; p.formT = 9999; p.formMax = 9999; g.ensureModel(N.FRUIT_BY_ID[s.form].creature); }
  else p.form = null;
  const floor = (x, z) => {
    for (let y = W.h - 1; y > 0; y--) {
      const b = W.get(x, y, z);
      if (b && !N.TREE_BLOCK[b] && W.solidAt(x, y, z)) return y;
    }
    return -1;
  };
  if (s.where === 'ground') {
    // flat for ten metres in the direction of travel, and nothing overhead the
    // body's own arc would pass through
    for (let x = 30; x < 150; x += 2) for (let z = 30; z < 150; z += 2) {
      const gy = floor(x, z); if (gy < 5) continue;
      let ok = true;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        for (let k = 1; k <= 10 && ok; k++) {
          if (floor(x + dx * k, z + dz * k) !== gy) ok = false;
          for (let h = 1; h <= 3 && ok; h++)
            if (W.solidAt(x + dx * k, gy + h, z + dz * k) || W.liquidAt(x + dx * k, gy + h, z + dz * k)) ok = false;
        }
      }
      if (!ok) continue;
      p.x = x + 0.5; p.z = z + 0.5; p.y = gy + 1; p.vx = p.vy = p.vz = 0;
      p.yaw = 0; p.pitch = 0; p.faceYaw = 0;
      return { at: [p.x, p.y, p.z], ground: gy };
    }
    return { error: 'no flat ground with room to travel' };
  }
  if (s.where === 'water') {
    // A lane of the lake the body can cross: deep the whole way, so the stroke
    // is the swim and not a walk on the bottom. Four blocks is deeper than the
    // depth the animal's own row dives to, which is the same floor the water
    // step in play.js asks the lake for.
    const DEEP = 4;
    for (let x = 30; x < 150; x += 2) for (let z = 30; z < 150; z += 2) {
      let top = -1, deep = 0;
      for (let y = W.h - 1; y > 0; y--) {
        if (W.liquidAt(x, y, z)) { if (top < 0) top = y; deep++; } else if (top >= 0) break;
      }
      if (deep < DEEP) continue;
      let ok = true;
      for (let k = -5; k <= 5 && ok; k++) {
        let t2 = -1, d2 = 0;
        for (let y = W.h - 1; y > 0; y--) {
          if (W.liquidAt(x + k, y, z)) { if (t2 < 0) t2 = y; d2++; } else if (t2 >= 0) break;
        }
        if (d2 < deep - 1) ok = false;
      }
      if (!ok) continue;
      p.x = x + 0.5; p.z = z + 0.5; p.y = top - 1; p.vx = p.vy = p.vz = 0;
      p.yaw = 0; p.pitch = 0; p.faceYaw = 0;
      return { at: [p.x, p.y, p.z], top: top, deep: deep };
    }
    return { error: 'no lane of water deep enough to hold a body up' };
  }
  // 'herd': the animals the valley is driving right now. Nothing about them is
  // moved, aimed or asked: the one this film is about is remembered by
  // reference, so every frame of the strip is the same animal going about the
  // business its own record gives it.
  const herd = g.creatures.filter(c => !c.dead);
  if (!herd.length) return { error: 'the valley is driving no animals on this page' };
  window.__strip = herd[0];
  return { at: [+herd[0].x.toFixed(2), +herd[0].y.toFixed(2), +herd[0].z.toFixed(2)],
    of: herd[0].sp.id, n: herd.length };
}, s);

/* Two lenses, and each is asked a different question.

   `own` is the frame a player actually owns: the game's own shootCamera, snapped
   to the frame-share law (N.CAM), terrain pull-in and all. It follows the body
   in y -- which is exactly why it cannot show the arc of a hop: the lens rises
   with the body, so the body sits in the middle of the frame and the ground is
   what moves.

   `side` is the other half of the answer: a tripod, stood once and not moved
   again for the length of the strip, square off the path. Animal gait has
   always been filmed that way, a fixed lens and the animal crossing the frame,
   because the arc is the thing being looked at. Its distance starts from the
   same share rule and is widened only as far as the body's own measured speed
   and measured arc require: the whole of one action, path and height both, has
   to be in one film.

   For an animal the valley is driving and the game never films there is no
   `own`: nobody owns that lens. The tripod asks the share of the height that
   animal's own model stands at, at the field of view a body with no eye of its
   own is filmed at -- the person's 84. */
const planTripod = (page, herd, frames) => page.evaluate(a => {
  const g = window.game, N = window.FRUTARIA;
  const b = a.herd ? window.__strip : g.player;
  if (!b) return { error: 'no body to film' };
  const tall = a.herd ? b.tall : b.size()[1];
  /* how far that body reaches along its own heading: for a creature the
     rectangle its trunk takes up, for the body you wear the footprint the form
     gives it. It is added so the body's own length is not counted as free room */
  const along = a.herd ? b.hl * 2 : b.size()[0];
  const fov = a.herd ? 84 : b.fov() + N.CAM.fovBump;
  /* The distance the strip's own measurements ask for. The field of view is
     vertical (engine, persp(fovy, aspect)), exactly as the frame-share law asks
     it, so a frame at distance d is 2*d*tan(fov/2) tall and that wide times the
     aspect -- the same tanY/tanX the engine's own culling uses. Two things have
     to fit in that frame, and both are measured, not guessed:

       the path: the speed the settle measured, over the length of the strip;
       the arc: how high the body actually got, plus the head above the lens.

     The lens is stood at the eye height of a body at the bottom of its own gait,
     so from there to the top of the arc is the arc plus the part of the body
     above that eye line. 1.3 is the same margin the law itself carries: a body
     pressed to the edge of a frame cannot be looked at. */
  const m = window.__measured;
  const travel = m.v * (a.frames / 60);
  const tanY = Math.tan(fov * Math.PI / 360), tanX = tanY * g.R.aspect;
  const fitPath = (travel * 1.3 + along) / (2 * tanX);
  const fitArc = (m.arc * 1.3 + tall * 0.32) / tanY;
  const d = Math.max(N.CAM.shotFor(tall, fov).d, fitPath, fitArc);
  const yaw = b.yaw - Math.PI / 2;                 // square off the path, looking at it
  /* stood off the middle of the path the strip is about to travel -- the body
     crosses in at one side of the frame and out at the other, instead of walking
     out of the shot half way through. The heading is (sin yaw, -cos yaw), the
     same vector the engine calls R.fwd */
  const midX = b.x + Math.sin(b.yaw) * travel / 2, midZ = b.z - Math.cos(b.yaw) * travel / 2;
  // the height of a body standing at the bottom of its own gait: that is where
  // the ground this arc is measured against is, and it comes from the physics
  // rather than from a number copied here
  const y = m.low + tall * 0.68;
  window.__tripod = { x: midX + Math.cos(b.yaw) * d, y, z: midZ + Math.sin(b.yaw) * d,
    yaw, pitch: 0, fov, d };
  return { d: +d.toFixed(2), fov, aspect: +g.R.aspect.toFixed(2), travel: +travel.toFixed(2),
    arc: m.arc, y: +y.toFixed(2), shareRule: +N.CAM.shotFor(tall, fov).d.toFixed(2) };
}, { herd, frames });

const stripFrame = (page, q) => page.evaluate(q => {
  const g = window.game, p = g.player;
  const b = q.herd ? window.__strip : p;
  if (!b) return { error: 'no body to film' };
  /* one of the valley's bodies carries its own height; the body you wear gets it
     from the form it is wearing */
  const tall = b.tall !== undefined ? b.tall : b.size()[1];
  /* Both views are third person, including the tripod one: the body is drawn
     only when the game is in third person (render, `thirdPerson && !cam.inBody`),
     and a gait film without the body in it is a film of a field. `own` is the
     lens the game builds itself -- camReady is dropped first because the page's
     clock has been stopped and the lens has never been eased, which is the same
     one step the camera test in play.js takes. */
  g.thirdPerson = true;
  let lens;
  if (q.view === 'own') { g.camReady = false; lens = g.shootCamera(p); }
  else {
    /* the head turns and the tripod does not move. A lens fixed to one heading
       watched a body that changed its mind walk away from it: the turn strip
       measured 2.9 m of travel along a curve and every frame of it was further
       off than the last. Pivoting where it stands is what a fixed lens really
       does -- the ground stays still and the arc is still read against it, and
       the parallax a lens that travels with the body would erase stays erased.
       The basis is the engine's own (M4.lookYaw): fwd =
       [sin(yaw)cos(pitch), sin(pitch), -cos(yaw)cos(pitch)]. */
    lens = window.__tripod;
    if (lens) {
      const dx = b.x - lens.x, dy = b.y + tall * 0.5 - lens.y, dz = b.z - lens.z;
      const dist = Math.hypot(dx, dy, dz);
      lens = { x: lens.x, y: lens.y, z: lens.z, fov: lens.fov, d: +dist.toFixed(2),
        yaw: Math.atan2(dx, -dz),
        pitch: Math.asin(Math.max(-1, Math.min(1, dy / dist))) };
    }
  }
  if (!lens) return { error: 'no lens: the tripod was never stood' };
  g._camFrame = lens; g._lens = { x: lens.x, y: lens.y, z: lens.z };
  g.updateEnv(); g.render();
  /* Where the body landed in the frame, read off the basis the engine itself
     used to draw it (R.fwd/right/up, set in begin). A strip that filmed an empty
     field is a broken tool, and a tool that cannot tell the difference is not
     worth running: this is the check on the tripod's fit above. */
  const R = g.R, c = R.camPos;
  const dx = b.x - c[0], dy = b.y + tall * 0.5 - c[1], dz = b.z - c[2];
  const along = dx * R.fwd[0] + dy * R.fwd[1] + dz * R.fwd[2];
  const cross = dx * R.right[0] + dy * R.right[1] + dz * R.right[2];
  const rise = dx * R.up[0] + dy * R.up[1] + dz * R.up[2];
  const tanY = Math.tan(lens.fov * Math.PI / 360), tanX = tanY * R.aspect;
  const W = R.canvas.width, H = R.canvas.height;
  const on = along > 0.06 && Math.abs(cross) < along * tanX && Math.abs(rise) < along * tanY;
  /* Only what both kinds of body really carry. The body you wear has a velocity
     and a grounded flag; one of the valley's has a vertical velocity and a hop
     timer and no horizontal velocity at all -- so the speed and the arc of a
     strip are measured off the positions by stepWorld, which works for either. */
  return { lens: [+lens.x.toFixed(1), +lens.y.toFixed(1), +lens.z.toFixed(1), +lens.d.toFixed(2)],
    at: [+b.x.toFixed(2), +b.y.toFixed(2), +b.z.toFixed(2)],
    yaw: +(b.yaw % 6.283).toFixed(2), up: b.vy === undefined ? null : +b.vy.toFixed(2),
    state: b.state || null,
    seen: { px: Math.round(W / 2 + cross / (along * tanX) * W / 2),
      py: Math.round(H / 2 - rise / (along * tanY) * H / 2), in: on },
    draws: g.R.stats.draws };
}, q);

/* The world stepped by hand, the same keys held the whole way, and the strip's
   own numbers read off the physics rather than asked of it: how far the body
   went, how high it got, and what share of the frames it spent off the floor of
   its own gait. A strip is only worth looking at if whoever looks knows what the
   body was asked to do and what it measured. */
const stepWorld = (page, s, frames) => page.evaluate(a => {
  const g = window.game;
  const b = a.s.where === 'herd' ? window.__strip : g.player;
  for (const k of ['fwd', 'back', 'left', 'right']) g.input[k] = a.s.keys.indexOf(k) >= 0;
  let px = b.x, pz = b.z, travel = 0, low = Infinity, high = -Infinity;
  const ys = [];
  for (let i = 0; i < a.frames; i++) {
    g.update(1 / 60);
    travel += Math.hypot(b.x - px, b.z - pz); px = b.x; pz = b.z;
    ys.push(b.y);
  }
  ys.forEach(y => { if (y < low) low = y; if (y > high) high = y; });
  /* what counts as off the ground is the body's own floor, not a flag: the body
     you wear has one, one of the valley's does not, and an arc measured from the
     positions is the same measurement for both */
  const air = ys.filter(y => y > low + 0.03).length;
  const m = { travel: +travel.toFixed(2), v: +(travel / a.frames * 60).toFixed(2),
    low: +low.toFixed(2), high: +high.toFixed(2), arc: +(high - low).toFixed(2),
    airPct: +(air / a.frames * 100).toFixed(1),
    at: [+b.x.toFixed(2), +b.y.toFixed(2), +b.z.toFixed(2)] };
  window.__measured = m;
  return m;
}, { s, frames });

(async () => {
  const { browser, page, errs, push } = await boot();
  if (!STRIP) {
    for (const [name, cfg] of SHOTS) {
      const c = {};
      for (const tok of cfg.split(/\s+/)) { const i = tok.indexOf('='); if (i > 0) c[tok.slice(0, i)] = tok.slice(i + 1); }
      const { info, st } = await shotStill(page, c);
      await page.screenshot({ path: path.join(OUT, TAG + '-' + name + '.png') });
      console.log(name.padEnd(11), info.zone.padEnd(8), JSON.stringify(st));
    }
  } else {
    await stopTheClock(page);
    for (const s of STRIPS) {
      if (ONLY && ONLY !== s.name) continue;
      for (const view of s.views.split(' ')) {
        // the action starts again for each view: the two films are the same
        // action filmed twice, not one film with a cut in the middle of it
        const placed = await placeFor(page, s);
        if (placed.error) { console.log((s.name + '-' + view).padEnd(13), JSON.stringify(placed)); continue; }
        const settle = await stepWorld(page, s, s.settle);
        const plan = { strip: s.name, view, at: placed.at, of: placed.of, ground: placed.ground,
          top: placed.top, deep: placed.deep, keys: s.keys || '(none)',
          settle, frames: s.shots + ' x ' + s.every + '/60 s = ' + (s.shots * s.every / 60).toFixed(2) + ' s' };
        if (view !== 'own') plan.tripod = await planTripod(page, s.where === 'herd', s.shots * s.every);
        console.log((s.name + '-' + view).padEnd(13), JSON.stringify(plan));
        let low = Infinity, high = -Infinity, travel = 0, air = 0, stepped = 0, off = 0;
        for (let i = 0; i < s.shots; i++) {
          const st = await stripFrame(page, { view, herd: s.where === 'herd' });
          await page.screenshot({ path: path.join(OUT, TAG + '-' + s.name + '-' + view + '-' +
            String(i).padStart(2, '0') + '.png') });
          console.log(' ', String(i).padStart(2), JSON.stringify(st));
          if (!st.seen || !st.seen.in) off++;
          const m = await stepWorld(page, s, s.every);
          if (m.low < low) low = m.low; if (m.high > high) high = m.high;
          travel += m.travel; air += m.airPct; stepped += s.every;
        }
        console.log('  =', JSON.stringify({ strip: s.name, view, travelled: +travel.toFixed(2),
          arc: +(high - low).toFixed(2), airPct: +(air / s.shots).toFixed(1),
          frames: stepped, per: +(travel / stepped * 60).toFixed(2), offFrame: off }));
      }
    }
  }
  console.log(errs.length ? errs.slice(0, 10).join('\n') : 'no errors');
  process.exitCode = errs.length ? 1 : 0;
  await browser.close();
})();
