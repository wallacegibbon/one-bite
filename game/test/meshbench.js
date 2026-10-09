/* ==========================================================================
 *  meshbench.js -- how long a chunk costs to build, and what it turns into.
 *  A measurement, not a test: nothing here fails. Run it before and after a
 *  change to the meshing loop.
 *      NODE_PATH=./node_modules node game/test/meshbench.js
 * ========================================================================== */
const puppeteer = require('puppeteer-core');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome', headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const finish = async (code) => { try { await browser.close(); } catch (e) {} process.exitCode = code; };
  process.on('uncaughtException', e => { console.log('UNCAUGHT', e.message); finish(1); });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto('file://' + path.join(__dirname, '..', 'index.html') + '?auto&freeze', { waitUntil: 'load' });
  await page.waitForFunction('window.game && window.game.ready', { timeout: 120000 });
  const out = await page.evaluate(() => {
    const W = window.game.world, gl = window.game.R.gl;
    let total = 0; const passes = [];
    for (let pass = 0; pass < 5; pass++) {
      const t0 = performance.now();
      for (let ci = 0; ci < W.cx * W.cz; ci++) {
        const m = W.buildChunk(gl, ci);
        if (pass === 0) for (const k of m) if (k) total += k.count;
      }
      passes.push(+((performance.now() - t0) / (W.cx * W.cz)).toFixed(3));
    }
    return { chunks: W.cx * W.cz, verts: total, msPerChunk: passes, best: Math.min.apply(null, passes) };
  });
  console.log(JSON.stringify(out));
  await finish(0);
})();
