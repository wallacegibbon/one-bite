/* 为各区域找合适的取景/出生点 */
const path = require('path');
global.window = global;
const base = path.join(__dirname, '..');
for (const f of ['data/fruits.js', 'data/creatures.js', 'data/world.js', 'src/engine.js', 'src/world.js', 'src/worldgen.js']) require(path.join(base, f));
const N = window.FRUTARIA;
const W = new N.World(N.WORLD.w, N.WORLD.h, N.WORLD.d);
N.generate(W, 20261008);
const SKIP = { 6: 1, 7: 1, 8: 1, 9: 1, 22: 1, 27: 1, 28: 1 };
function stand(x, z) {
  for (let y = 44; y > 0; y--) { const b = W.get(x, y, z); if (b && !SKIP[b] && b < 40) return { y: y + 1, b }; }
  return null;
}
function waterTop(x, z) {
  for (let y = 44; y > 0; y--) if (W.get(x, y, z) === 5) return y;
  return -1;
}
console.log('POIS:');
for (const p of N.POIS) {
  const s = stand(p.x, p.z);
  console.log(' ', p.id.padEnd(14), `(${p.x},${p.z})`, 'stand y=' + (s ? s.y : '?'), 'block=' + (s ? s.b : '?'), 'waterTop=' + waterTop(p.x, p.z));
}
console.log('\nZONES 采样:');
for (const z of N.ZONES) {
  const cx = Math.round(z.x), cz = Math.round(z.z);
  const s = stand(cx, cz);
  console.log(' ', z.id.padEnd(12), `(${z.x},${z.z}) r=${z.r}`, 'y=' + (s ? s.y : '?'), 'b=' + (s ? s.b : '?'), 'water=' + waterTop(cx, cz));
}
console.log('\nSKY_ISLES:');
for (const i of N.SKY_ISLES) console.log(' ', i.id, JSON.stringify(i));
// 湖中开阔水面
let best = null;
for (let x = 40; x < 120; x += 2) for (let z = 80; z < 140; z += 2) {
  const wt = waterTop(x, z);
  if (wt < 10) continue;
  const d = Math.hypot(x - 76, z - 112);
  if (d < 14) continue;
  const s = stand(x, z);
  if (!s || s.y > wt) continue;   // 水面之上没有地面 → 开阔水
  if (!best || d > best.d) best = { x, z, wt, d };
}
console.log('\n开阔水面候选:', JSON.stringify(best));
