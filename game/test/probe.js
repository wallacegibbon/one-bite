/* 为各区域找合适的取景/出生点（纯 node，无浏览器） */
const path = require('path');
global.window = global;
const base = path.join(__dirname, '..');
for (const f of ['data/fruits.js', 'data/creatures.js', 'data/world.js', 'src/engine.js', 'src/world.js', 'src/worldgen.js']) require(path.join(base, f));
const N = window.FRUTARIA;
const W = new N.World(N.WORLD.w, N.WORLD.h, N.WORLD.d);
N.generate(W, 20261008);

const SKIP = { 6: 1, 7: 1, 8: 1, 9: 1, 22: 1, 27: 1, 28: 1 };   // 树叶/植物等不可站立
const WATER = 5;

function topSolid(x, z) {                       // 最上方的可站立实心方块
  for (let y = 44; y > 0; y--) { const b = W.get(x, y, z); if (b && b !== WATER && !SKIP[b] && b < 40) return { y, b }; }
  return null;
}
const stand = (x, z) => { const s = topSolid(x, z); return s ? { y: s.y + 1, b: s.b } : null; };
function waterTop(x, z) {
  for (let y = 44; y > 0; y--) if (W.get(x, y, z) === WATER) return y;
  return -1;
}
const openWater = (x, z) => {                   // 开阔水面：水底在浪面之下
  const wt = waterTop(x, z);
  if (wt < 0) return null;
  const s = topSolid(x, z);
  if (s && s.y >= wt) return null;              // 有地面戳到/高出水面 → 不是开阔水
  return { wt, bed: s ? s.y : -1 };
};

/* 区域中心：rect 取中点，circle 用 cx/cz，sky 用浮岛，border 跳过 */
function zoneCenter(z) {
  if (z.kind === 'border') return null;
  if (z.kind === 'rect') return { x: Math.round((z.x0 + z.x1) / 2), z: Math.round((z.z0 + z.z1) / 2) };
  if (z.kind === 'sky') return { x: N.SKY_ISLES[0].x, z: N.SKY_ISLES[0].z, isle: true };
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
  const s = c.isle ? { y: N.SKY_ISLES[0].top, b: 'sky' } : stand(c.x, c.z);
  console.log(' ', z.id.padEnd(12), `(${c.x},${c.z})`, 'y=' + (s ? s.y : '?'), 'b=' + (s ? s.b : '?'),
    'water=' + waterTop(c.x, c.z));
}

console.log('\nSKY_ISLES:');
for (const i of N.SKY_ISLES) console.log(' ', i.id.padEnd(10), `(${i.x},${i.z}) r=${i.r} top=${i.top}`);

/* 湖中开阔水面：离湖心越远越好，且要有足够水深 */
const lake = N.ZONE_BY_ID['mirrorlake'];
let best = null;
for (let x = 40; x < 120; x += 2) for (let z = 80; z < 140; z += 2) {
  const ow = openWater(x, z);
  if (!ow || ow.wt < 10) continue;
  const depth = ow.wt - ow.bed;
  if (depth < 4) continue;
  const d = Math.hypot(x - lake.cx, z - lake.cz);
  if (d > lake.r - 4) continue;                 // 必须在湖内
  const score = depth * 10 - d;                 // 优先深水，其次离湖心近
  if (!best || score < best.score) best = { x, z, waterTop: ow.wt, bed: ow.bed, depth, d: +d.toFixed(1), score };
}
console.log('\n开阔水面候选:', JSON.stringify(best));
