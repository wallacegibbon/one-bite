/* 一次启动，多张截图。用法: node test/shots.js [tag] */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const TAG = process.argv[2] || 'x';
const OUT = path.join(__dirname, '..', '..', '.shots');
fs.mkdirSync(OUT, { recursive: true });

const SHOTS = [
  ['aerial', 'pos=80,70,80 yaw=0.6 pitch=-0.95'],
  ['castle', 'pos=78,26,134 yaw=0.0 pitch=0.05 safe'],
  ['village', 'pos=140,26,142 yaw=3.9 pitch=-0.15 safe'],
  ['lake', 'pos=58,17,96 yaw=1.15 pitch=-0.05 safe'],
  ['underwater', 'pos=92,11,120 yaw=0.5 pitch=-0.15'],
  ['forest', 'pos=104,25,32 yaw=1.2 pitch=-0.05 safe'],
  ['glade', 'pos=60,25,56 yaw=0.4 pitch=-0.05 safe'],
  ['cave', 'pos=28,28,34 yaw=1.0 pitch=0 safe'],
  ['sky', 'pos=44,38,24 yaw=2.5 pitch=0.0 safe'],
  ['night', 'pos=140,26,142 yaw=3.9 pitch=-0.15 safe time=620'],
  ['owl', 'pos=104,30,40 yaw=1.2 pitch=-0.25 form=owlberry tp=1'],
  ['mermaid', 'pos=92,11,120 yaw=0.5 pitch=-0.1 form=merrow tp=1'],
  ['inv', 'pos=136,26,132 yaw=0.2 pitch=-0.1 safe inv=owlberry,merrow,embercore,unicorncherry'],
  ['cellarui', 'pos=136,26,134 yaw=0.2 pitch=-0.1 safe inv=owlberry,merrow,embercore,unicorncherry cellar=1']
];

(async () => {
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
  for (const [name, cfg] of SHOTS) {
    const c = {};
    for (const tok of cfg.split(/\s+/)) { const i = tok.indexOf('='); if (i > 0) c[tok.slice(0, i)] = tok.slice(i + 1); }
    const info = await page.evaluate(c => {
      const g = window.game;
      g.player.form = null; g.thirdPerson = false; g.time = 210;
      g.mode = 'play'; if (window.ui) { window.ui.showCellar(false); window.ui.showJournal(false); window.ui.showHelp(false); window.ui.showDead(false); }
      g.player.vital = 10; g.player.fright = 0; g.player.air = 18;
      g.inv.length = 0; g.sel = 0;
      if (c.pos) {
        const a = c.pos.split(',').map(Number);
        g.player.x = a[0]; g.player.z = a[2];
        g.player.y = a[1];
        if (c.safe !== undefined) {
          // 螺旋搜索一块“头顶无树”的空地
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
      g.updateEnv();
      return { zone: g.zoneName(g.player.x, g.player.z) };
    }, c);
    await new Promise(r => setTimeout(r, 1400));
    const st = await page.evaluate(() => {
      const g = window.game, p = g.player;
      return { draws: g.R.stats.draws, tris: Math.round(g.R.stats.tris), pos: [p.x.toFixed(0), p.y.toFixed(1), p.z.toFixed(0)].join(','), g: p.grounded, hp: +p.vital.toFixed(1) };
    });
    await page.screenshot({ path: path.join(OUT, TAG + '-' + name + '.png') });
    console.log(name.padEnd(11), info.zone.padEnd(8), JSON.stringify(st));
  }
  console.log(errs.length ? errs.slice(0, 10).join('\n') : 'no errors');
  await browser.close();
})();
