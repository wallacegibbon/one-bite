/* browser-free smoke test: data -> generation -> meshing (fake GL) */
global.window = global;
const path = require('path');
const base = path.join(__dirname, '..');
require(path.join(base, 'data', 'fruits.js'));
require(path.join(base, 'data', 'creatures.js'));
require(path.join(base, 'data', 'world.js'));
require(path.join(base, 'data', 'player.js'));
require(path.join(base, 'data', 'i18n.js'));
require(path.join(base, 'src', 'i18n.js'));
require(path.join(base, 'src', 'engine.js'));
require(path.join(base, 'src', 'world.js'));
require(path.join(base, 'src', 'worldgen.js'));

const F = window.FRUTARIA;

// every language table must cover exactly the same keys: a missing translation
// would otherwise only surface as a raw dotted key sitting in the UI
{
  const ids = F.LANGS.map(l => l.id);
  const keys = Object.keys(F.T.zh).sort();
  let bad = 0;
  for (const id of ids) {
    const missing = keys.filter(k => F.T[id][k] === undefined);
    const extra = Object.keys(F.T[id]).filter(k => F.T.zh[k] === undefined).sort();
    if (missing.length || extra.length) {
      bad++;
      console.log('!! i18n table', id, 'missing', missing.length, ':', missing.join(','), ' extra:', extra.join(','));
    }
  }
  console.log('i18n 语言', ids.join('/'), '每语言', keys.length, '键', bad ? '!! ' + bad + ' 张表不一致' : 'OK');
  if (bad) process.exitCode = 1;
}
const gl = {
  ARRAY_BUFFER: 1, STATIC_DRAW: 2, FLOAT: 3, UNSIGNED_BYTE: 4,
  createBuffer: () => ({}), bindBuffer() {}, bufferData() {}, deleteBuffer() {}
};

const t0 = Date.now();
const w = new F.World(F.WORLD.w, F.WORLD.h, F.WORLD.d);
F.generate(w, 20261008);
const t1 = Date.now();

let tris = 0;
for (let ci = 0; ci < w.cx * w.cz; ci++) {
  const m = w.buildChunk(gl, ci);
  for (const mm of m) if (mm) tris += mm.count / 3;
}
const t2 = Date.now();

const counts = {};
for (const [id, fid] of Object.entries(F.FRUIT_BLOCK)) {
  let n = 0; const b = +id;
  for (let i = 0; i < w.blocks.length; i++) if (w.blocks[i] === b) n++;
  if (n) counts[fid] = n;
}
const sp = F.spawn;
const below = w.get(sp.x | 0, (sp.y | 0) - 1, sp.z | 0);
const at = w.get(sp.x | 0, sp.y | 0, sp.z | 0);

console.log('生成耗时', (t1 - t0) + 'ms  网格化耗时', (t2 - t1) + 'ms');
console.log('三角面总数', tris, ' 分块', w.cx * w.cz);
console.log('果实分布', counts);
console.log('出生点脚下方块', below, '身上方块', at, at === 0 ? 'OK' : '!! 出生点被埋');

for (const p of F.POIS) console.log('POI', p.cn, 'topY=', w.topAt(p.x, p.z));

// key interaction points
const chest = w.get(136, 21, 134);
console.log('果窖箱(136,21,134) =', chest, chest === 78 ? 'OK' : '!!');

// water check
let water = 0; for (let i = 0; i < w.blocks.length; i++) if (w.blocks[i] === 5) water++;
console.log('水方块', water);
