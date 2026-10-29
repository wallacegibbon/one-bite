/* find good camera/spawn points per zone (pure node, no browser) */
const path = require('path');
global.window = global;
const base = path.join(__dirname, '..');
for (const f of ['data/fruits.js', 'data/creatures.js', 'data/world.js', 'data/player.js', 'src/engine.js', 'src/world.js', 'src/worldgen.js']) require(path.join(base, f));
const N = window.FRUTARIA;
const W = new N.World(N.WORLD.w, N.WORLD.h, N.WORLD.d);
N.generate(W, 20261008);

const SKIP = { 6: 1, 7: 1, 8: 1, 9: 1, 22: 1, 27: 1, 28: 1 };   // leaves / plants etc. are not standable
const WATER = 5;

function topSolid(x, z) {                       // topmost standable solid block
  for (let y = 44; y > 0; y--) { const b = W.get(x, y, z); if (b && b !== WATER && !SKIP[b] && b < 40) return { y, b }; }
  return null;
}
const stand = (x, z) => { const s = topSolid(x, z); return s ? { y: s.y + 1, b: s.b } : null; };
function waterTop(x, z) {
  for (let y = 44; y > 0; y--) if (W.get(x, y, z) === WATER) return y;
  return -1;
}
const openWater = (x, z) => {                   // open water: the lakebed lies below the surface
  const wt = waterTop(x, z);
  if (wt < 0) return null;
  const s = topSolid(x, z);
  if (s && s.y >= wt) return null;              // ground poking to or above the surface -> not open water
  return { wt, bed: s ? s.y : -1 };
};

/* zone centre: rect -> midpoint, circle -> cx/cz, border -> skip */
function zoneCenter(z) {
  if (z.kind === 'border') return null;
  if (z.kind === 'rect') return { x: Math.round((z.x0 + z.x1) / 2), z: Math.round((z.z0 + z.z1) / 2) };
  return { x: Math.round(z.cx), z: Math.round(z.cz) };
}

console.log('POIS:');
for (const p of N.POIS) {
  const s = stand(p.x, p.z), ow = openWater(p.x, p.z);
  console.log(' ', p.id.padEnd(14), `(${p.x},${p.z})`, 'stand y=' + (s ? s.y : '?'),
    'block=' + (s ? s.b : '?'), 'waterTop=' + waterTop(p.x, p.z), ow ? 'openWater bed=' + ow.bed : '');
}

console.log('\nZONES 中心采样:');
for (const z of N.ZONES) {
  const c = zoneCenter(z);
  if (!c) { console.log(' ', z.id.padEnd(12), '(border — 无中心)'); continue; }
  const s = stand(c.x, c.z);
  console.log(' ', z.id.padEnd(12), `(${c.x},${c.z})`, 'y=' + (s ? s.y : '?'), 'b=' + (s ? s.b : '?'),
    'water=' + waterTop(c.x, c.z));
}

/* open water in the lake: prefer deep water, then distance from the centre */
const lake = N.ZONE_BY_ID['mirrorlake'];
let best = null;
for (let x = 40; x < 120; x += 2) for (let z = 80; z < 140; z += 2) {
  const ow = openWater(x, z);
  if (!ow || ow.wt < 10) continue;
  const depth = ow.wt - ow.bed;
  if (depth < 4) continue;
  const d = Math.hypot(x - lake.cx, z - lake.cz);
  if (d > lake.r - 4) continue;                 // must be inside the lake
  const score = depth * 10 - d;                 // prefer depth, then proximity to the centre
  if (!best || score < best.score) best = { x, z, waterTop: ow.wt, bed: ow.bed, depth, d: +d.toFixed(1), score };
}
console.log('\n开阔水面候选:', JSON.stringify(best));
