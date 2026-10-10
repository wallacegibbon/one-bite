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
require(path.join(base, 'src', 'models.js'));
require(path.join(base, 'src', 'entities.js'));

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
/* A model has to fit the box its body collides with. The box is a square
   footprint that does not turn with the body, so what matters is the model's
   horizontal **radius**: a model wider than its box walks an arm, a snout or a
   head through a wall the body is pressed against, and the player trusts the
   box -- docs/en/04 s4 makes size a hard gate, not flavour. A limb may cross
   the line a little (a swinging arm, a tail, a muzzle carried over the chest),
   so the allowance is 0.1 m. Before this check existed nothing in the build
   could see it: the bear's head hung 0.56 m outside its box and the frog's
   snout 0.13 m. */
const extents = (modelId, sc) => {
    let r = 0, top = 0, bottom = 0;
    for (const part of F.MODELS[modelId].parts) {
      for (const b of part.boxes) {
        for (const cx of [b[0], b[0] + b[3]]) for (const cz of [b[2], b[2] + b[5]])
          r = Math.max(r, Math.hypot(cx, cz) * sc);
        top = Math.max(top, (b[1] + b[4]) * sc);
        bottom = Math.min(bottom, b[1] * sc);
      }
    }
  return { r, top, bottom };
};
{
  const TOL_R = 0.1, TOL_H = 0.06;
  const bodies = [['human', F.HUMAN_FORM.scale, F.HUMAN_FORM.size]];
  for (const fruit of F.FRUITS)
    bodies.push([fruit.creature, F.CREATURE_BY_ID[fruit.creature].scale, fruit.form.size]);
  let bad = 0;
  for (const [modelId, sc, size] of bodies) {
    const e = extents(modelId, sc), hw = size[0] / 2;
    const over = [];
    if (e.r > hw + TOL_R) over.push(`半径 ${e.r.toFixed(3)} > ${hw.toFixed(3)}+${TOL_R}`);
    if (e.top > size[1] + TOL_H) over.push(`顶 ${e.top.toFixed(3)} > ${size[1]}+${TOL_H}`);
    if (e.bottom < -0.001) over.push(`脚 below ${(e.bottom.toFixed(3))}`);
    if (over.length) { bad++; console.log('!! 模型超出碰撞盒', modelId, over.join(', ')); }
  }
  console.log('模型/碰撞盒', bodies.length, '个身体', bad ? '!! ' + bad + ' 个穿模' : 'OK');
  if (bad) process.exitCode = 1;
}

/* The lamp jellyfish has no fruit, so there is no collision box for the gate
   above to measure it against -- it is the only model in the game nobody
   measures. Its size is pinned anyway, because a model nobody measures is a
   model that quietly grows: 0.61 m across, 0.74 m from the top of the dome to
   the tip of the longest arm, at its scale of 0.16 (docs/en/07 s1). */
{
  const sc = F.CREATURE_BY_ID.jelly.scale, e = extents('jelly', sc);
  const bad = [];
  if (F.FRUITS.some(f => f.creature === 'jelly')) bad.push('a fruit claims a bodyless animal');
  if (F.CREATURE_BY_ID.jelly.fruit) bad.push('the animal claims a fruit');
  if (Math.abs(e.r * 2 - 0.61) > 0.02) bad.push(`宽 ${(e.r * 2).toFixed(3)} != 0.61`);
  if (Math.abs((e.top - e.bottom) - 0.74) > 0.02) bad.push(`高 ${(e.top - e.bottom).toFixed(3)} != 0.74`);
  /* The one self-lit model in the game, and the only one: no body you can wear
     carries a light (docs/en/07 s1). */
  if (!F.MODELS.jelly.parts.every(p => p.emis)) bad.push('a lamp part is not lit');
  for (const id of ['human', 'owl', 'frog', 'bear'])
    if (F.MODELS[id].parts.some(p => p.emis)) bad.push(`${id} glows`);
  console.log('灯水母', bad.length ? '!! ' + bad.join(', ') : `OK ${e.r * 2} m 宽 / ${e.top - e.bottom} m 高`);
  if (bad.length) process.exitCode = 1;
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

const topAt = (x, z) => { for (let y = w.h - 1; y >= 0; y--) if (w.get(x, y, z)) return y; return -1; };
for (const p of F.POIS) console.log('POI', p.cn, 'topY=', topAt(p.x, p.z));

// key interaction points
const chest = w.get(136, 21, 134);
console.log('果窖箱(136,21,134) =', chest, chest === 78 ? 'OK' : '!!');

// water check
let water = 0; for (let i = 0; i < w.blocks.length; i++) if (w.blocks[i] === 5) water++;
console.log('水方块', water);

/* The sunken tower: worldgen declares three rows of windows and then, a few lines
   later, hung the frog pear on the sills -- at the window cells, so two of the
   three rows were silently replaced by fruit and the tower came out with one
   window. Nothing in the suite looked at a block the generator had overwritten,
   so it shipped. This asks the general question for this one structure: is every
   cell the tower declares still the block it was declared to be? */
{
  const [tx, tz] = F.ZONE_BY_ID.mirrorlake.tower;
  const faces = [[-3, 0], [3, 0], [0, -3], [0, 3]];
  const want = [];
  for (const [dx, dz] of faces) {
    for (const y of [7, 10, 13]) want.push([tx + dx, y, tz + dz, 21, 'tower window']);
    for (const y of [9, 12]) want.push([tx + dx, y, tz + dz, F.FRUIT_BLOCK_REV['frogpear'], 'frog pear sill']);
  }
  const wrong = want.filter(([x, y, z, b]) => w.get(x, y, z) !== b)
    .map(([x, y, z, b, what]) => `${what} (${x},${y},${z}) wants ${b} got ${w.get(x, y, z)}`);
  console.log('沉塔窗/窗台', want.length, '格', wrong.length ? '!! ' + wrong.join('; ') : 'OK');
  if (wrong.length) process.exitCode = 1;
}

/* A roof has to point up, and it has to keep the rain out. The roofs were
   written by walking a ring at a fixed angle step and raising the height with
   the radius: `y0 + r` grows outward, so the cone came out upside down -- a rim
   of tiles standing above a low centre, the point at the bottom -- and the arc
   between two samples is r*da, so a step that is tight at r=1 skips whole cells
   by r=4. Every house had two or three columns open to the sky, and from the
   street the roof read as a band of black squares against the sky. No
   coordinate is named here: the roofs are found in the world, and each one is
   asked two questions -- is its footprint whole, and is its high point in its
   middle? */
{
  const TILE = 13;
  const top = new Map();                       // column -> the highest tile in it
  for (let y = 0; y < w.h; y++) for (let z = 0; z < w.d; z++) for (let x = 0; x < w.w; x++)
    if (w.get(x, y, z) === TILE) top.set(x + ',' + z, y);
  const has = new Set(top.keys()), seen = new Set(), roofs = [];
  for (const start of has) {
    if (seen.has(start)) continue;
    seen.add(start);
    const stack = [start], group = [];
    while (stack.length) {
      const k = stack.pop(); group.push(k);
      const [x, z] = k.split(',').map(Number);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = (x + dx) + ',' + (z + dz);
        if (has.has(n) && !seen.has(n)) { seen.add(n); stack.push(n); }
      }
    }
    if (group.length >= 12) roofs.push(group);
  }
  const bad = [];
  for (const g of roofs) {
    const cs = g.map(s => s.split(',').map(Number));
    const x0 = Math.min(...cs.map(c => c[0])), x1 = Math.max(...cs.map(c => c[0]));
    const z0 = Math.min(...cs.map(c => c[1])), z1 = Math.max(...cs.map(c => c[1]));
    // the high point of a roof is its apex, so it belongs in the middle of the
    // footprint; if the high tiles are the outer ones the cone is upside down
    const mx = cs.reduce((a, c) => a + c[0], 0) / cs.length;
    const mz = cs.reduce((a, c) => a + c[1], 0) / cs.length;
    const h = (c) => top.get(c.join(','));
    let hi = cs[0], lo = cs[0];
    for (const c of cs) { if (h(c) > h(hi)) hi = c; if (h(c) < h(lo)) lo = c; }
    const hlo = h(lo);
    // an empty column inside the outline is a hole: flood the empty columns in
    // the bounding box from its edge, and whatever the flood cannot reach is
    // closed off -- a hole you would see the sky through. A column counts as
    // closed if it carries a tile or anything solid above the eaves: the bell
    // tower's apex is glowstone, not a tile, and that is a roof, not a hole.
    const inG = new Set(g), closedAbove = (x, z) => {
      for (let y = hlo + 1; y < w.h; y++) { const b = w.get(x, y, z); if (b && F.BLOCKS[b] && F.BLOCKS[b].opaque) return true; }
      return false;
    };
    const reach = new Set(), st = [];
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      if (inG.has(x + ',' + z) || closedAbove(x, z)) continue;
      if (x > x0 && x < x1 && z > z0 && z < z1) continue;
      st.push(x + ',' + z); reach.add(x + ',' + z);
    }
    while (st.length) {
      const [x, z] = st.pop().split(',').map(Number);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz, k = nx + ',' + nz;
        if (nx < x0 || nx > x1 || nz < z0 || nz > z1) continue;
        if (inG.has(k) || reach.has(k) || closedAbove(nx, nz)) continue;
        reach.add(k); st.push(k);
      }
    }
    let holes = 0;
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++)
      if (!inG.has(x + ',' + z) && !reach.has(x + ',' + z) && !closedAbove(x, z)) holes++;
    if (holes) bad.push(`roof near ${g[0]}: ${holes} columns open to the sky`);
    const out = (c) => Math.hypot(c[0] - mx, c[1] - mz);
    if (h(hi) - h(lo) < 2) bad.push(`roof near ${g[0]}: flat, apex ${h(hi)} eave ${h(lo)}`);
    if (out(hi) > out(lo))
      bad.push(`roof near ${g[0]}: upside down, the high tile ${h(hi)} at ${hi} sits further out than the low tile ${h(lo)} at ${lo}`);
  }
  console.log('屋顶', roofs.length, '座', bad.length ? '!! ' + bad.join('; ') : 'OK');
  if (bad.length) process.exitCode = 1;

  // the cellar dome is brick, not tile, so it is not in that set: the one
  // structure the POI table already names gets asked the simpler question --
  // stand in the room and look straight up
  const cell = F.POIS.find(p => p.id === 'cellar');
  let wet = 0;
  for (let z = cell.z - 3; z <= cell.z + 3; z++) for (let x = cell.x - 3; x <= cell.x + 3; x++) {
    let y = cell.y + 1;
    while (y < w.h) { const b = w.get(x, y, z); if (b && F.BLOCKS[b] && F.BLOCKS[b].opaque) break; y++; }
    if (y >= w.h) wet++;
  }
  console.log('果窖穹顶', wet ? '!! ' + wet + ' 列漏天' : 'OK');
  if (wet) process.exitCode = 1;
}
