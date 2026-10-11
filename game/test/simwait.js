/* A wait measured by the game's own clock, not by the wall clock.

   The frame loop clamps dt at 0.05 s (game/src/main.js), so when the machine is
   busy the world lives fewer seconds than the wall does. Measured inside
   all.sh the page ran at about ten frames a second: a test that slept for
   900 ms got 0.15 s of world time instead of 0.9 s. That is how save.js and
   input.js went red inside the suite and green on their own -- a check that
   read "the planted pit grew into a tree" was really reading "this machine drew
   twenty frames a second while the rest of the suite was running".

   So a check that asserts something about what the world had *time* to do has
   to wait for the world to have lived that time. sim() does that: it counts the
   seconds the update loop was actually handed. The wall clock stays as a cap, so
   a game that has stopped updating fails the test instead of hanging it.

   A check that asserts something about *frames* -- a pixel read, a DOM string
   after a key -- is a different question and still waits on frames. */

const COUNT = () => {
  const g = window.game;
  if (g.__simCounted) return;
  g.__simCounted = true;
  window.__sim = 0;
  const step = g.update.bind(g);
  g.update = dt => { window.__sim += dt; return step(dt); };
};

/* Wait until the game has been updated for `seconds` of its own time.
   Returns { sim, ms, fps, ok } -- `fps` is the frame rate the page actually
   managed, which is the number that used to decide whether these tests passed. */
async function sim(page, seconds, capMs = 60000) {
  await page.evaluate(COUNT);
  const r = await page.evaluate((secs, cap) => new Promise(res => {
    const from = window.__sim, t0 = performance.now();
    let frames = 0;
    const tick = () => {
      frames++;
      const s = window.__sim - from, ms = performance.now() - t0;
      if (s >= secs || ms > cap) {
        res({ sim: +s.toFixed(3), ms: Math.round(ms), fps: +(frames / (ms / 1000)).toFixed(1), ok: s >= secs });
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), seconds, capMs);
  if (!r.ok) throw new Error(`the page ran only ${r.sim} s of world time in ${r.ms} ms ` +
    `(${r.fps} fps) while waiting for ${seconds} s`);
  return r;
}

module.exports = { sim, COUNT };
