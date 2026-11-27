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
/* Which cells a liquid fills. The world carries two liquids now -- the sea and
   the island's lake, under two ids -- and every water figure in this file is a
   figure about the authored square, where only the one of them exists. Asking an
   id here is how a check ends up counting nothing and calling that a result. */
const isLiquid = (b) => !!(b && F.BLOCKS[b] && F.BLOCKS[b].liquid);

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
/* Keys built at runtime never appear in the HTML, so the table check above
   never asks about them, and a missing one does not crash: t() prints the
   raw dotted key into the UI as is. Every reaction the observe log can
   print -- the fallback and each value the attitude tables hold -- and
   every store name the store code can ask for must hold a non-empty string
   in every language. */
{
  const ids = F.LANGS.map(l => l.id);
  const reactions = new Set(['flee', 'hostile', 'curious', 'ignore']);
  for (const c of F.CREATURES)
    for (const v of Object.values(c.attitude || {})) reactions.add(v);
  const storeKeys = ['cellar', 'tree', 'yourTree'];
  let bad = 0;
  for (const id of ids) {
    for (const r of reactions)
      if (typeof F.T[id]['att.' + r] !== 'string' || !F.T[id]['att.' + r].trim()) {
        bad++;
        console.log('!! i18n 动态键', id, '缺 att.' + r + '（观察日志会原样打印键名）');
      }
    for (const k of storeKeys)
      if (typeof F.T[id]['store.' + k] !== 'string' || !F.T[id]['store.' + k].trim()) {
        bad++;
        console.log('!! i18n 动态键', id, '缺 store.' + k + '（窖名会原样打印键名）');
      }
  }
  console.log('i18n 动态键 att.*/store.*', ids.join('/'), '每语言', reactions.size + storeKeys.length, '键', bad ? '!! 缺 ' + bad + ' 条' : 'OK');
  if (bad) process.exitCode = 1;
}
/* A model has to fit the box its body collides with. The box is a square
   footprint that does not turn with the body, so what matters is the model's
   horizontal **radius**: a model wider than its box walks an arm, a snout or a
   head through a wall the body is pressed against, and the player trusts the
   box -- docs/04 s4 makes size a hard gate, not flavour. A limb may cross
   the line a little (a swinging arm, a tail, a muzzle carried over the chest),
   so the allowance is 0.1 m. Before this check existed nothing in the build
   could see it: the frog's snout hung 0.13 m outside its box. */
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
/* Back-face culling is on for every draw the renderer makes (engine.js: the
   culler is enabled once, and only the selection highlight ever turns it off),
   and nothing in the game calls frontFace, so GL's own rule stands: a triangle
   is front-facing when its three vertices run counter-clockwise seen from the
   side its normal points at -- which is the side the cross product of two of
   its edges points at. A face wound the other way round is not drawn at all,
   and what reaches the lens instead is whatever lies behind it.
   This was not a subtle loss. MeshBuilder.box() walked each face's four points
   in the order they read as a face -- and made normals that pointed into the
   box. Every creature body and every micro block in the game was turned inside
   out: the near side of a body was thrown away before it reached the lens, and
   the lens was shown the inside of the far walls instead, with the constant of
   the far face standing in for the near one. Measured then: a box standing 0.4 m
   in front of a body, wholly inside the body's own silhouette, still
   moved 7394 pixels of a 640x480 frame when it was deleted, and drawn on its own
   it covered 23515 -- pixels that were a body's colour, but the inside of it.
   Nothing downstream could tell the difference, because the inside of a body is
   still the colour of that body.
   So the winding is read here in pure data, where it costs nothing: the normal
   of both triangles of all six faces of that test box has to
   point away from that box's own centre, and so does every triangle of every
   body in the game as the model builder really builds them. */
{
  /* The two triangles of a face are the six vertices as they are emitted: the
     builder fans a face out as v0,v1,v2 then v0,v2,v3, so the second triangle
     sits in emitted slots 3,4,5 -- not in the corners 0,2,3 of the fan. */
  const TRI = [[0, 1, 2], [3, 4, 5]];
  const bad = [];
  let c = [0, 0, 0];
  /* the signed volume the three vertices sweep against the box centre: positive
     when the run of the three is the way round the outward normal points */
  const side = (p, o, f, t) => {
    const at = (k) => o + ((f * 6 + t[k]) * 3);
    const ax = p[at(1)] - p[at(0)], ay = p[at(1) + 1] - p[at(0) + 1], az = p[at(1) + 2] - p[at(0) + 2];
    const bx = p[at(2)] - p[at(0)], by = p[at(2) + 1] - p[at(0) + 1], bz = p[at(2) + 2] - p[at(0) + 2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    let d = 0;
    for (let k = 0; k < 3; k++)
      d += [nx, ny, nz][k] * ((p[at(0) + k] + p[at(1) + k] + p[at(2) + k]) / 3 - c[k]);
    return d;
  };
  let tris = 0;
  const mb = new F.MeshBuilder();
  const B = [-1.6, 2.4, -2.4, 3.2, 3.0, 4.4];
  c = [B[0] + B[3] / 2, B[1] + B[4] / 2, B[2] + B[5] / 2];
  mb.box(B[0], B[1], B[2], B[3], B[4], B[5], [0.42, 0.38, 0.35], false);
  if (mb.n !== 36) bad.push(`${mb.n} vertices for one box, expected 36`);
  for (let f = 0; f < 6; f++) for (const t of TRI) {
    const d = side(mb.pos, 0, f, t);
    tris++;
    if (!(d > 0)) bad.push(`face ${f} triangle ${t.join('')} points into the box (${d.toFixed(2)})`);
  }
  /* the same rule read off the bodies as the model builder really builds them,
     crease shades and all */
  for (const id of Object.keys(F.MODELS)) {   // every body the game can draw, not the two it had first
    let outward = 0, mine = 0;
    for (const part of F.MODELS[id].parts) {
      const m = new F.MeshBuilder();
      const ao = part.boxAO || [];
      for (let i = 0; i < part.boxes.length; i++) {
        const b = part.boxes[i];
        m.box(b[0], b[1], b[2], b[3], b[4], b[5], [0.5, 0.5, 0.5], false, ao[i] || 1);
        c = [b[0] + b[3] / 2, b[1] + b[4] / 2, b[2] + b[5] / 2];
        const o = i * 36 * 3;        // three floats a vertex, 36 vertices a box
        for (let f = 0; f < 6; f++) for (const t of TRI) {
          mine++;
          if (side(m.pos, o, f, t) > 0) outward++;
        }
      }
    }
    tris += mine;
    if (outward !== mine) bad.push(`${id}: ${mine - outward} of ${mine} triangles wound inwards`);
  }
  console.log('绕序/背面剔除', bad.length ? '!! ' + bad.join(', ') : `OK 法线全部朝外，共查 ${tris} 个三角形`);
  if (bad.length) process.exitCode = 1;
}

/* No body carries a light of its own: the models nobody measures against a
   collision box are the ones that glow, and the valley draws none of them
   any more (docs/07 s1). Nothing you pick lends a body a light any more, so
   asking the models' parts is the whole question. */
{
  const bad = [];
  for (const id of Object.keys(F.MODELS))
    if (F.MODELS[id].parts.some(p => p.emis)) bad.push(`${id} glows`);
  console.log('自发光', bad.length ? '!! ' + bad.join(', ') : 'OK 模型不带光源');
  if (bad.length) process.exitCode = 1;
}

/* A flock is not a formation because every body of a kind is born with habits of
   its own: the pace it spends its errands at, the depth it hangs at in the water
   it was born in, and how fast that cycle runs (the creature constructor). The
   valley-side law is measured by play.js -- its ring window is handed five paces
   on purpose, so what that window reads is the law and not a draw -- so the draw
   itself is asked here, where it is made: two hundred bodies of the kind the
   valley drives, every value inside the band its field states, and the band
   actually covered, since a spread narrower than nine tenths of it is one line
   with a jitter on it. Two hundred draws of one uniform band leave a spread
   narrower than nine tenths of it about once in the tens of millions of runs;
   five draws of the same band -- what the ring window used to ask, of the five
   frogs the valley happened to be driving -- leave a spread that narrow often
   enough to be seen: one page of a series of runs came back with all five inside
   0.05 of one another, and that check went red with nothing in the game
   changed. */
{
  const bad = [];
  const sp = F.CREATURE_BY_ID.frog;
  const v = { pace: [], diveTo: [], diveRate: [] };
  for (let i = 0; i < 200; i++) {
    const c = new F.Creature(sp, 80, 14, 106);
    v.pace.push(c.pace); v.diveTo.push(c.diveTo); v.diveRate.push(c.diveRate);
  }
  const ask = (name, lo, hi) => {
    const a = v[name];
    const out = a.filter(x => !(x >= lo && x <= hi));
    if (out.length) bad.push(`${name}: ${out.length}/${a.length} 个出生值落在 ${lo}-${hi} 之外`);
    const s = Math.max.apply(null, a) - Math.min.apply(null, a);
    const pct = (100 * s / (hi - lo)).toFixed(1);
    // a spread that does not cover the band is one line with a jitter on it
    if (s < (hi - lo) * 0.9) bad.push(`${name}: ${a.length} 次出生只铺到 ${pct}% 的带 (${s.toFixed(3)} / ${hi - lo})`);
    return pct;
  };
  /* the bands the creature constructor draws from, restated here as the bounds
     the field promises: a pace 0.85-1.25 times the cruise its row gives, a depth
     1.5-4 m under the level the water holds a resting body at, and that cycle
     turning on a 0.05-0.15 rad/s clock */
  const pct = ['pace', 'diveTo', 'diveRate']
    .map(k => k + '=' + ask(k, { pace: [0.85, 1.25], diveTo: [1.5, 4], diveRate: [0.05, 0.15] }[k][0],
                            { pace: [0.85, 1.25], diveTo: [1.5, 4], diveRate: [0.05, 0.15] }[k][1]));
  console.log('出生个体差异', pct.join(' '), bad.length ? '!! ' + bad.join(' ') : 'OK 每个身体带着自己的 pace/下潜深度/下潜周期');
  if (bad.length) process.exitCode = 1;
}

/* The frog's eyes sit at the corners of its skull. A human asked for them to be
   further apart, and a face tuned by eye is a face that walks straight back the
   moment anybody touches the model again, so the shape is pinned here: the two
   eye boxes are mirror images, each centre sits at least 0.6 of the skull's own
   half-width out from the centre line, the gap between them is at least three
   quarters of an eye's own width (it was barely a third), every eye still stands
   wholly on the skull it is drawn on, and each pupil stays inside the eye it sits
   on. The eye height the float law reads is a field of its own (`eye`), so this
   says nothing about it and everything about how the face is set. */
{
  const head = F.MODELS.frog.parts.find(q => q.name === 'head');
  const skull = head.boxes[0];
  const by = (c) => head.boxes.filter(b => b[6] === c).sort((p, q) => p[0] - q[0]);
  const eye = by('#e8e0a0'), pupil = by('#1a1208');
  const bad = [];
  if (eye.length !== 2 || pupil.length !== 2) bad.push('脸上少了一对部件');
  else {
    const mid = (b) => b[0] + b[3] / 2;
    const [el, er] = eye, [pl, pr] = pupil;
    const hw = skull[3] / 2, ew = el[3], gap = er[0] - (el[0] + el[3]);
    if (Math.abs(mid(el) + mid(er)) > 1e-9) bad.push('两眼不对称');
    if (Math.abs(mid(el)) < 0.6 * hw) bad.push(`眼太靠中线 ${mid(el).toFixed(2)}`);
    if (gap < 0.75 * ew) bad.push(`两眼太挤 ${gap.toFixed(2)} < ${(0.75 * ew).toFixed(2)}`);
    if (Math.abs(mid(el)) + ew / 2 > hw) bad.push('眼长在颅外');
    if (pl[0] < el[0] - 1e-9 || pl[0] + pl[3] > el[0] + el[3] + 1e-9 ||
        pr[0] < er[0] - 1e-9 || pr[0] + pr[3] > er[0] + er[3] + 1e-9) bad.push('瞳孔跑出眼睛');
    console.log('蛙脸', bad.length ? '!! ' + bad.join(', ')
      : `OK 眼距 ${gap.toFixed(2)} 眼宽 ${ew.toFixed(2)} 颅宽 ${skull[3].toFixed(2)} 眼心 ${mid(er).toFixed(2)}`);
  }
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

/* The opening view. The game turns the camera to yaw = pi (+Z) when it opens, so
   a spawn with a wall that way means the first frame of the game is a wall: the
   old search checked the column under the player and its two side columns, never
   the direction it faces, and landed half a block in front of the main cellar --
   91% of the first frame hit a block 0.6 m away at a mean brightness of 57/255.
   Three blocks of clear air at head height is the least that reads as standing
   somewhere rather than being pressed against something. */
{
  const head = (sp.y | 0) + 1;          // the body occupies y+1 and y+2 above the ground
  // the direction the game actually opens facing, which the spawn search picks
  const y0 = sp.yaw === undefined ? Math.PI : sp.yaw;
  const dx = Math.round(Math.sin(y0)), dz = -Math.round(Math.cos(y0));
  let clear = 0;
  while (clear < 8 && !w.solidAt((sp.x | 0) + dx * (clear + 1), head, (sp.z | 0) + dz * (clear + 1))) clear++;
  console.log('出生点面向方向净空', clear, '格', clear >= 3 ? 'OK' : '!! 出生点面对墙');
  if (clear < 3) process.exitCode = 1;
}

console.log('生成耗时', (t1 - t0) + 'ms  网格化耗时', (t2 - t1) + 'ms');
console.log('三角面总数', tris, ' 分块', w.cx * w.cz);
console.log('果实分布', counts);
console.log('出生点脚下方块', below, '身上方块', at, at === 0 ? 'OK' : '!! 出生点被埋');

const topAt = (x, z) => { for (let y = w.h - 1; y >= 0; y--) if (w.get(x, y, z)) return y; return -1; };
for (const p of F.POIS) console.log('POI', p.cn, 'topY=', topAt(p.x, p.z));

/* The four vertical layers the map chapter claims (docs 02 s4), measured off the
   generated world instead of remembered: the topmost solid block per column, with
   plants excluded for the ground and the ridge and leaves counted for the canopy.
   The chapter used to say "Canopy 20-28" and "Ashscale y33-45". Measured, the
   forest crowns reach 47 where they stand on the northern slopes, and the ridge
   tops out at 36. Printed so the next
   drift is visible, and guarded so it cannot drift again unnoticed. */
{
  const LEAF = { 7: 1, 8: 1, 9: 1, 27: 1, 28: 1 };
  const topSolid = (x, z, skipPlants) => {
    for (let y = w.h - 1; y >= 0; y--) {
      const b = w.get(x, y, z);
      if (!b || !F.BLOCKS[b].solid) continue;
      if (skipPlants && (b === 16 || LEAF[b] || b === 6 || b === 22)) continue;
      return y;
    }
    return -1;
  };
  const range = (pred, skipPlants) => {
    let lo = 999, hi = -1, n = 0, sum = 0;
    for (let x = 0; x < w.w; x += 2) for (let z = 0; z < w.d; z += 2) {
      if (!pred(x, z)) continue;
      const y = topSolid(x, z, skipPlants);
      if (y < 0) continue;
      n++; sum += y; if (y < lo) lo = y; if (y > hi) hi = y;
    }
    return n ? { lo, hi, mean: +(sum / n).toFixed(1), n } : null;
  };
  const leafTop = (pred) => {
    let hi = -1;
    for (let x = 0; x < w.w; x++) for (let z = 0; z < w.d; z++) {
      if (!pred(x, z)) continue;
      for (let y = w.h - 1; y >= 0; y--) if (LEAF[w.get(x, y, z)]) { if (y > hi) hi = y; break; }
    }
    return hi;
  };
  const inZone = (id) => {
    const zn = F.ZONE_BY_ID[id];
    return zn.kind === 'rect'
      ? (x, z) => x >= zn.x0 && x <= zn.x1 && z >= zn.z0 && z <= zn.z1
      : (x, z) => Math.hypot(x - zn.cx, z - zn.cz) <= zn.r;
  };
  const floor = (x, z) => true;
  const ground = range(floor, true), ridge = range(inZone('mountains'), true);
  const town = range((x, z) => inZone('lanternrow')(x, z) || inZone('orchard')(x, z), true);
  const canopyFloor = leafTop(floor), canopyTown = leafTop(inZone('lanternrow'));
  let wlo = 999, whi = -1;
  for (let i = 0; i < w.blocks.length; i++) if (isLiquid(w.blocks[i])) { const y = (i / (w.w * w.d)) | 0; if (y < wlo) wlo = y; if (y > whi) whi = y; }
  console.log('层 地面', JSON.stringify(ground), '镇/果园', JSON.stringify(town));
  console.log('层 树冠', '谷地最高', canopyFloor, '镇上方', canopyTown, '水', `${wlo}..${whi}`);
  console.log('层 北岭', JSON.stringify(ridge));
  const bad = [];
  // what docs 02 s4 claims, in the same words the chapter uses
  if (wlo !== 4 || whi !== 14) bad.push(`water y${wlo}..${whi}, the chapter says 4..14`);
  if (canopyTown > 35) bad.push(`town canopy tops at ${canopyTown}, the chapter says 20-35`);
  if (canopyFloor < 45 || canopyFloor > 48) bad.push(`valley canopy tops at ${canopyFloor}, the chapter says 47`);
  if (ridge.lo < 22 || ridge.hi > 37) bad.push(`ridge surface y${ridge.lo}..${ridge.hi}, the chapter says 23-36`);
  if (bad.length) { console.log('!! 层表与地图不符:', bad.join('; ')); process.exitCode = 1; }
}

// key interaction points
const chest = w.get(136, 21, 134);
console.log('果窖箱(136,21,134) =', chest, chest === 78 ? 'OK' : '!!');

// water check
let water = 0; for (let i = 0; i < w.blocks.length; i++) if (isLiquid(w.blocks[i])) water++;
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

/* Mirrorlake is the valley's only body of water, and nothing in the build could
   see its shape: the zone asked for a circle of r34 and the terrain carved it 18
   deep, which measured as 2,029 water columns with a mean depth of 5.5 and 41%
   of them 4 or shallower -- a puddle you can wade across, in the middle of a
   wood. It is r38 carved 22 deep now: 2,969 columns, mean 7.4, 53% of it at 8 or
   deeper, deepest 11 (the surface is y14 and terrainH never returns below y3, so
   11 is the deepest column this world can hold). The other half of the question
   is what it must not become. The widened circle still has to leave the
   whisperwood, the town, the orchard and the keep island dry. And the sunken
   tower and the sunken huts are built at absolute heights, so every one of them
   needs ground under its floor: with the lake as it was three of the four huts
   hung 1-2 blocks above the bed, and deepening the lake without filling them in
   first would have hung all five 2-3 blocks. */
{
  const SEA = F.WORLD.sea, WW = F.WORLD.w, WH = F.WORLD.h, WD = F.WORLD.d;
  const solidUnder = (x, z, from) => {
    for (let y = from; y >= 0; y--) { const d = F.BLOCKS[w.get(x, y, z)]; if (d && d.solid) return y; }
    return -1;
  };
  const wet = new Uint8Array(WW * WD);
  let cols = 0, sum = 0, deepest = 0, deep8 = 0, minBed = 99;
  for (let z = 0; z < WD; z++) for (let x = 0; x < WW; x++) {
    let top = -1;
    for (let y = WH - 1; y > 0; y--) if (isLiquid(w.get(x, y, z))) { top = y; break; }
    if (top < 0) continue;
    const bed = solidUnder(x, z, top - 1);
    if (bed < 0 || top - bed <= 0) continue;
    wet[z * WW + x] = 1; cols++; sum += top - bed;
    deepest = Math.max(deepest, top - bed);
    if (top - bed >= 8) deep8++;
    minBed = Math.min(minBed, bed);
  }
  const wetIn = (test) => {
    let n = 0;
    for (let z = 0; z < WD; z++) for (let x = 0; x < WW; x++) if (test(x, z) && wet[z * WW + x]) n++;
    return n;
  };
  const wood = F.ZONE_BY_ID.whisperwood, town = F.ZONE_BY_ID.lanternrow;
  const orch = F.ZONE_BY_ID.orchard, keep = F.ZONE_BY_ID.starfall, M = F.ZONE_BY_ID.mirrorlake;
  const bad = [];
  if (cols < 2700 || cols > 3300) bad.push(`${cols} water columns, want 2700-3300 (r34 carved 2,029)`);
  if (sum / cols < 6.5) bad.push(`mean depth ${(sum / cols).toFixed(2)}, want 6.5 or more (r34 was 5.51)`);
  if (deepest < 11) bad.push(`deepest column ${deepest}, want 11 (y14 surface over the y3 floor)`);
  if (deep8 / cols < 0.45) bad.push(`${(deep8 / cols * 100).toFixed(0)}% of it 8 or deeper, want 45% or more (r34 was 31%)`);
  if (minBed < 3) bad.push(`a lakebed column reaches y${minBed}, below the y3 floor terrainH stops at`);
  const inWood = wetIn((x, z) => x >= wood.x0 && x <= wood.x1 && z >= wood.z0 && z <= wood.z1);
  if (inWood) bad.push(`${inWood} wet cells inside the whisperwood`);
  const inTown = wetIn((x, z) => x >= town.x0 && x <= town.x1 && z >= town.z0 && z <= town.z1);
  if (inTown) bad.push(`${inTown} wet cells inside Lanternrow`);
  const inOrch = wetIn((x, z) => Math.hypot(x - orch.cx, z - orch.cz) <= orch.r);
  if (inOrch) bad.push(`${inOrch} wet cells inside the orchard`);
  const inKeep = wetIn((x, z) => Math.hypot(x - keep.cx, z - keep.cz) <= 12);
  if (inKeep) bad.push(`${inKeep} wet cells on the keep island`);
  const [tx, tz] = M.tower;
  const rests = (x0, z0, x1, z1, floorY, what) => {
    let n = 0;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (solidUnder(x, z, floorY - 1) < floorY - 1) n++;
    if (n) bad.push(`${what}: ${n} of ${(x1 - x0 + 1) * (z1 - z0 + 1)} floor cells have nothing under them`);
  };
  rests(tx - 3, tz - 3, tx + 3, tz + 3, 6, 'sunken tower');
  for (const [hx, hz] of M.huts) rests(hx - 2, hz - 2, hx + 2, hz + 2, 7, `sunken hut (${hx},${hz})`);
  let kelp = 0, kelpBad = 0;
  for (let y = 1; y <= SEA; y++) for (let z = 0; z < WD; z++) for (let x = 0; x < WW; x++) {
    if (w.get(x, y, z) !== 75) continue;
    kelp++;
    const d = F.BLOCKS[w.get(x, y - 1, z)];
    if (!d || !d.solid) kelpBad++;
  }
  if (!kelp) bad.push('the lake grows no kelp at all: the bed of a lake is under water, so asking the cell above it to be empty never matches');
  if (kelpBad) bad.push(`${kelpBad} of ${kelp} kelp not standing on the lakebed`);
  console.log('镜湖', cols, '柱 均深', (sum / cols).toFixed(2),
    '最深', deepest, '深 8+', (deep8 / cols * 100).toFixed(0) + '%',
    '水草', kelp, bad.length ? '!! ' + bad.join('; ') : 'OK');
  if (bad.length) process.exitCode = 1;
}

/* The islands of the open sea. The ground past the authored square is a sea, and
   the user asked for it to hold land: more of it the nearer to this island, and
   thinner the further out --
   dense near the island the game is, thinning outward. That is a gradient, and
   the only rule that gives a gradient and still keeps the world fixed is an
   Archimedean spiral: seven islands to a turn of it, so the count per ring stays
   the same while the ring grows and the count per square kilometre falls as 1/r.
   The rule is asked here in both directions, because both are things the game
   needs: an island's id is its ordinal along the spiral and its place is computed
   from that (so a player meets the same island again from any direction, in any
   later session), and the islands standing at an address are found from the
   address alone (so the mesher can build a chunk without knowing any island's
   name). Between the two directions the whole island has to survive: its foot may
   not overlap its neighbour's or reach the authored island's shore -- what lies
   between two grounds is a channel, and a channel is what makes them two
   islands -- and its crown has to break the water by the height its kind states,
   which is the only difference between a sandbar and a ridge. Nothing is asked
   of a name here: the valley's own ground is compared, cell for cell, with the
   number this array hashed before any island rule existed. */
{
  const SEA = F.WORLD.sea, C = { x: F.WORLD.w / 2, z: F.WORLD.d / 2 };
  const ISLES = F.ISLES, bad = [];
  /* as far out as the game streams on its own, and no further: the numbers this
     prints are the numbers the map document quotes, so both stop where the
     player can actually walk. */
  const ORD = 70;
  const rows = [];
  for (let n = 1; n <= ORD; n++) rows.push(F.isleRecord(n));
  const raised = rows.filter(r => r.r > 0);

  // the same ordinal in another world of another seed, and in the other order
  const other = new F.World(F.WORLD.w, F.WORLD.h, F.WORLD.d);
  F.generate(other, 20261009);
  let leaked = 0;
  for (let n = ORD; n >= 1; n--) {
    const b = F.isleRecord(n), a = rows[n - 1];
    if (Math.abs(b.x - a.x) < 1e-9 && Math.abs(b.z - a.z) < 1e-9 && b.type === a.type) leaked++;
  }
  /* a world is built once, into ground that is empty: planting asks the cell it
     chose and moves on when something already stands there, so a second
     `generate` over the same array draws a different set of numbers and grows a
     different valley. The repeat is asked in a fresh array, which is also the
     only honest way to compare this world's ground with the one the game had
     before any island rule existed. */
  const again = new F.World(F.WORLD.w, F.WORLD.h, F.WORLD.d);
  F.generate(again, 20261008);
  let moved = 0;
  for (let n = ORD; n >= 1; n--) {
    const b = F.isleRecord(n), a = rows[n - 1];
    if (Math.abs(b.x - a.x) > 1e-9 || Math.abs(b.z - a.z) > 1e-9 || b.r !== a.r || b.type !== a.type) moved++;
  }
  // and the place naming its own island
  let unnamed = 0;
  for (const isle of raised) {
    const mine = F.islesNear(Math.floor(isle.x), Math.floor(isle.z)).filter(q => q.id === isle.id);
    if (mine.length !== 1 || mine[0].r !== isle.r) unnamed++;
  }
  // separation, in both senses
  let worstPair = 1e9, worstShore = 1e9;
  for (const a of raised) {
    const d = Math.hypot(a.x - C.x, a.z - C.z);
    worstShore = Math.min(worstShore, d - F.shoreWater(Math.atan2(a.z - C.z, a.x - C.x)) - a.r);
    for (const b of raised) {
      if (b.id <= a.id) continue;
      worstPair = Math.min(worstPair, Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r);
    }
  }
  // the crown: above the water, and by the height the kind states
  let sunken = 0, wrongHeight = 0, leftStanding = 0;
  for (const isle of raised) {
    const crown = F.landHeight(Math.floor(isle.x), Math.floor(isle.z));
    if (crown <= SEA) sunken++;
    if (Math.abs((crown - SEA) - isle.crest) > 1.05) wrongHeight++;
    // at the foot the ground has to be the sea floor again: no cliff in the sea
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = Math.floor(isle.x + dx * (isle.r + 2)), z = Math.floor(isle.z + dz * (isle.r + 2));
      if (F.landHeight(x, z) - Math.round(F.seaFloorHeight(x, z)) > 0) leftStanding++;
    }
  }
  // the gradient, per band
  const bands = {};
  for (const isle of raised) bands[Math.floor(Math.hypot(isle.x - C.x, isle.z - C.z) / 1000)] = (bands[Math.floor(Math.hypot(isle.x - C.x, isle.z - C.z) / 1000)] || 0) + 1;
  const dens = Object.keys(bands).sort((a, b) => a - b).map(k =>
    bands[k] / (Math.PI * (Math.pow(+k + 1, 2) - Math.pow(+k, 2))));
  // and the valley: the array this world builds, cell for cell
  const hashOf = (W) => { let h = 0; for (let i = 0; i < W.blocks.length; i++) h = (Math.imul(h, 31) + W.blocks[i]) >>> 0; return h >>> 0; };
  const hashHere = hashOf(w), hashAgain = hashOf(again);
  /* Re-read this round, and the reason it moved is not the one this check is
     about: the island's lake is a block row of its own now and not the sea's, so
     every water cell of this square carries a different number. What the check
     holds is determinism -- two builds of one seed agreeing, and a change to the
     island rule not reaching the authored square -- and a pinned value only says
     which world was built and when the liquid rows were split. */
  const PINNED = 418283224;        // seed 20261008, read on the tree that split sea from lake

  if (!raised.length) bad.push('no island is raised at all');
  if (leaked) bad.push(`${leaked} islands answered from the wrong world's seed`);
  if (moved) bad.push(`${moved} islands moved between sessions of the same world`);
  if (unnamed) bad.push(`${unnamed} islands not found from their own address`);
  if (worstPair < ISLES.keep) bad.push(`feet overlap: closest pair ${worstPair.toFixed(1)} m, want >= ${ISLES.keep}`);
  if (worstShore < ISLES.keep) bad.push(`an island reaches the authored shore: ${worstShore.toFixed(1)} m of water, want >= ${ISLES.keep}`);
  if (sunken) bad.push(`${sunken} islands stand under the water`);
  if (wrongHeight) bad.push(`${wrongHeight} islands of a height their kind does not state`);
  if (leftStanding) bad.push(`${leftStanding} columns left raised past an island's foot: a cliff standing in the sea`);
  for (let i = 1; i < dens.length; i++)
    if (dens[i] >= dens[i - 1]) bad.push(`band ${i} km holds ${dens[i].toFixed(2)} islands per km2, band ${i - 1} holds ${dens[i - 1].toFixed(2)}`);
  if (hashHere !== PINNED || hashAgain !== PINNED)
    bad.push(`the authored array changed: ${hashHere} now, ${hashAgain} in a second build of the same seed, where ${PINNED} was read out before the island rule`);
  const types = raised.reduce((m, r) => (m[r.type] = (m[r.type] || 0) + 1, m), {});
  console.log('外海岛屿', raised.length, '座已升起',
    Object.entries(types).map(([k, v]) => k + ' ' + v).join(' '),
    '最近', Math.round(Math.min(...raised.map(r => Math.hypot(r.x - C.x, r.z - C.z)))) + 'm',
    '与主岛之间最少', worstShore.toFixed(0) + 'm 水面',
    '岛间最窄', worstPair.toFixed(0) + 'm',
    '每 km2', dens.map(d => d.toFixed(2)).join('/'),
    bad.length ? '!! ' + bad.join('; ') : 'OK');
  if (bad.length) process.exitCode = 1;
}
/* What an island is made of. A kind used to state only the shape of a shore --
   how far the foot reaches, how high the crown stands -- and left its material
   to the height table: sand at and near the water line, soil under the crown,
   rock under that. For ground the land made, that is the truth. But a bar is a
   heap of sand the sea laid down and a reef is a rock it left standing: what
   they are made of is not a consequence of how high they happen to be. Measured
   on the tree before a kind stated its ground, over the 70 ordinals the reach
   holds: of the 15 sandbars 9 wore grass at their crown over soil and 6 sand,
   and all 16 reefs wore grass over soil -- a hill of earth standing in the sea,
   no different in the ground from an island. So a kind states the material of
   its pile and of its crown, and three things are held here: that the record
   says what the chapter's words say, that the crown cell of every island is the
   material its kind names, and that from under that crown down to the row the
   sea floor ends at the pile is one material throughout. Every column inside the
   foot of every island whose kind states a pile is walked out of the cells the
   world actually holds; for a kind that states none, the crown and the ground
   about it are walked instead, and there the height table's grass over soil over
   rock is the whole truth. One exception is not an island's rule at all: the sea
   lays a skin of its own sand at and near the water line of any shore in this
   world, and that skin comes first, so a rock shelf has sandy shallows round it
   for the same reason a hill of sand has a beach. */
{
  const SEA = F.WORLD.sea, TYPES = F.ISLE_TYPES, bad = [];
  const NAME = { 1: '草地', 2: '泥土', 3: '石头', 4: '沙', 5: '水', 15: '雪', 24: '山岩' };
  /* What the map document says the piles are, written here and not read out of
     the game's table. Read the expectation from the table and the check cannot
     fail: on this tree, turning a sandbar's crown from sand into grass moved the
     printed tally (grass x823, sand x1917) and the check still passed, because
     it was asking the world to agree with the number that had just been changed.
     So the claim is held twice: the game's table says what the words say, and the
     cells the world holds are that material. A bar is a heap of sand the sea
     laid; a cay is the same sand raised wide enough and high enough to keep a
     beach; a reef is a rock it left standing; and three of the kinds state no
     pile at all -- ground that never went under, so the height table's grass over
     soil over rock is the whole truth about them. */
  const SAYS = { sandbar: { pile: 4, crown: 4 }, reef: { pile: 3, crown: 3 },
    cay: { pile: 4, crown: 4 }, thicket: null, isle: null, ridge: null };
  for (const k of Object.keys(SAYS)) {
    const want = SAYS[k], has = TYPES[k].ground;
    if (want && (!has || has.pile !== want.pile || has.crown !== want.crown))
      bad.push(`${k} 的岛基/顶是 ${JSON.stringify(has)}，地图说的是 ${JSON.stringify(want)}`);
    if (!want && has) bad.push(`${k} 带着岛基 ${JSON.stringify(has)}，地图里它没有岛基`);
  }
  const islands = {}, asked = {}, crownTally = {};
  let columns = 0;
  const at = (isle, x, z) => {
    const under = F.islandUnder(x, z);
    if (!under) { bad.push(`岛 ${isle.id} 脚下 ${x},${z} 没有岛基`); return; }
    // where two domes overlap the higher one answers, and that column is its own island's
    if (under.isle.id !== isle.id) return;
    const says = SAYS[isle.type];
    const h = F.landHeight(x, z);
    const near = h <= SEA + 1;                 // the water line lays its own sand here
    columns++;
    asked[isle.type] = (asked[isle.type] || 0) + 1;
    const top = w.get(x, h, z);
    if (h > SEA) {
      const t = (crownTally[isle.type] = crownTally[isle.type] || {});
      t[top] = (t[top] || 0) + 1;
    }
    const wantTop = near ? 4 : says ? says.crown : (h > 34 ? 15 : 1);
    if (top !== wantTop)
      bad.push(`岛 ${isle.id}（${isle.type}）顶 ${x},${z} y${h} 是 ${NAME[top]}，要 ${NAME[wantTop]}`);
    // the pile: one material, from under the crown down to the row the floor ends at
    const floor = Math.max(2, Math.round(F.seaFloorHeight(x, z)));
    for (let y = h - 1; y > floor; y--) {
      const b = w.get(x, y, z);
      if (near && y > h - 4) {
        if (b !== 4) bad.push(`岛 ${isle.id}（${isle.type}）水面处的皮 ${x},${y},${z} 是 ${NAME[b]}，要 沙`);
        continue;
      }
      const want = says ? says.pile : (y > h - 4 ? 2 : 3);
      if (b !== want)
        bad.push(`岛 ${isle.id}（${isle.type}）${x},${y},${z} 是 ${NAME[b]}，要 ${NAME[want]}`);
    }
  };
  for (let n = 1; n <= 70; n++) {
    const isle = F.isleRecord(n);
    if (isle.r <= 0) continue;
    islands[isle.type] = (islands[isle.type] || 0) + 1;
    if (SAYS[isle.type]) {
      // every column the foot covers
      const R = Math.ceil(isle.r), cx = Math.floor(isle.x), cz = Math.floor(isle.z);
      for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
        const x = cx + dx, z = cz + dz;
        if (Math.hypot(x + 0.5 - isle.x, z + 0.5 - isle.z) < isle.r) at(isle, x, z);
      }
    } else {
      // a kind that states none: the height table's own ground, at the crown and round it
      const cx = Math.floor(isle.x), cz = Math.floor(isle.z);
      for (const [dx, dz] of [[0, 0], [6, 0], [-6, 0], [0, 6], [0, -6]]) at(isle, cx + dx, cz + dz);
    }
  }
  console.log('外海岛屿材质',
    Object.keys(TYPES).map(k => `${k} 座${islands[k] || 0}` +
      (TYPES[k].ground ? ` 基${NAME[TYPES[k].ground.pile]}/顶${NAME[TYPES[k].ground.crown]}` : ' 高度表') +
      ` 查${asked[k] || 0}柱 顶` + Object.entries(crownTally[k] || {}).map(([b, c]) => `${NAME[b]}x${c}`).join('/')).join(' | '),
    `${columns} 柱`,
    bad.length ? '!! ' + bad.slice(0, 4).join('; ') + `（共 ${bad.length} 处不对）` : 'OK');
  if (bad.length) process.exitCode = 1;
}

/* A fruit that grows in a kind of ground. The valley's fruit stands in the soil
   the height table makes; the second fruit the data carries grows nowhere in that
   table -- it grows on the dry sand at the crown of a sand bar, which is a kind
   of island and not a place. One rule plants it (worldgen.js `cropAt`), asked by
   the only code that runs out there, and it asks two questions of the column: is
   the ground dry, and is it the ground the record names. What is held here is
   that claim over the whole reach the map chapter states -- every column of every
   one of the 70 islands, read out of the cells the world builds for them:
   the dry columns each kind has, the fruit cells each kind has, that every one of
   the bars carries some of it, that no other kind carries any of it, that the
   nearest bar to this island carries some of it, and that the authored square --
   this island's own ground, counted by the census at the top of this file --
   holds none of it. The last of those is the other half of the claim: the ground
   the map authored keeps growing only the fruit that grows in ground. */
{
  const SEA = F.WORLD.sea, TYPES = F.ISLE_TYPES, bad = [];
  const BY_BLOCK = {};
  for (const f of F.FRUITS) if (f.bear) BY_BLOCK[F.FRUIT_BLOCK_REV[f.id]] = f;
  const kind = {}, perBar = [];
  let cols = 0, dry = 0, crop = 0, onWet = 0;
  for (let n = 1; n <= 70; n++) {
    const isle = F.isleRecord(n);
    if (isle.r <= 0) continue;
    const t = kind[isle.type] = kind[isle.type] || { isles: 0, cols: 0, dry: 0, crop: {} };
    t.isles++;
    const R = Math.ceil(isle.r), cx = Math.floor(isle.x), cz = Math.floor(isle.z);
    let mine = 0, mineDry = 0;
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const x = cx + dx, z = cz + dz;
      if (Math.hypot(x + 0.5 - isle.x, z + 0.5 - isle.z) >= isle.r) continue;
      const under = F.islandUnder(x, z);
      if (!under || under.isle.id !== isle.id) continue;   // an overlapping dome owns this column
      cols++; t.cols++;
      const h = F.landHeight(x, z);
      if (h <= SEA) continue;                       // the foot: under the sea, nothing bears
      dry++; t.dry++; mineDry++;
      const b = w.get(x, h + 1, z);
      if (isLiquid(b)) { onWet++; continue; }       // a dry crown with water over it: never
      const f = BY_BLOCK[b];
      if (!f) continue;
      crop++; mine++; t.crop[f.id] = (t.crop[f.id] || 0) + 1;
      /* the cell it stands on is the crown the kind states, and the kind is one
         the record names: both halves of the rule in one place */
      const says = TYPES[isle.type].ground;
      if (says && w.get(x, h, z) !== says.crown && h > SEA + 1)
        bad.push(`结果 ${x},${z} 脚下 y${h} 是 ${w.get(x, h, z)}，${isle.type} 的顶是 ${says.crown}`);
      if (f.habitat.indexOf(isle.type) < 0)
        bad.push(`${f.cn} 长在 ${isle.type} 上，它的记录只写 ${f.habitat.join('/')}`);
    }
    if (isle.type === 'sandbar') {
      perBar.push({ n, at: [cx, cz], ex: isle.x, ez: isle.z, foot: +isle.r.toFixed(1), dry: mineDry, crop: mine });
      if (!mine) bad.push(`沙洲 ${n}（${cx},${cz}）顶上是干的（${mineDry} 柱）却没有结果`);
    }
  }
  /* the nearest bar to this island, and what it carries */
  let near = null;
  for (const b of perBar) {
    const d = Math.hypot(b.ex - F.COAST.cx, b.ez - F.COAST.cz);
    if (!near || d < near.d) near = { n: b.n, at: b.at, foot: b.foot, d: Math.round(d), crop: b.crop };
  }
  if (near && !near.crop) bad.push(`最近的沙洲 ${near.n} 上没有结果`);
  for (const f of F.FRUITS) {
    if (!f.bear || !f.habitat.some(h => TYPES[h])) continue;      // grows in ground, not in a kind
    if (counts[f.id]) bad.push(`主岛上长了 ${counts[f.id]} 个 ${f.cn}`);
  }
  const show = k => `${k} 岛${kind[k].isles} 柱${kind[k].cols} 干${kind[k].dry} 结果` +
    (Object.keys(kind[k].crop).length ? Object.entries(kind[k].crop).map(([i, c]) => `${i}x${c}`).join('/') : '0');
  console.log('外海结果', Object.keys(TYPES).map(show).join(' | '),
    `共 ${crop} 格（${cols} 柱里 ${dry} 干柱；水面上的结果 ${onWet}）`,
    `每座沙洲 干柱/结果 ${perBar.map(b => `${b.n}:${b.dry}/${b.crop}`).join(' ')}`,
    `最近沙洲 ${near.n} @${near.at} 脚${near.foot}m 距${near.d}m 结果${near.crop}`,
    `主岛 ${Object.entries(counts).map(([i, c]) => `${i}x${c}`).join(' ')}`,
    bad.length ? '!! ' + bad.slice(0, 4).join('; ') + `（共 ${bad.length} 处不对）` : 'OK');
  if (bad.length) process.exitCode = 1;
}

/* Palms grow on the beach of a sand cay and on no other ground out there. That
   is a claim about ground, so it is asked of ground: every column of every
   island in the reach is looked at where a trunk would have to begin -- the
   first cell above that column's own ground -- and what has to come back is
   that every trunk found stands on the kind that states sand, on ground that is
   dry and in the band the sea's own sand lies in, that the trunk is one whole
   run of the height the rule states with leaves above its top, that every cay
   carries some, and that no other kind carries one. The crown is asked of the
   built world too: every leaf cell standing in the row above a trunk's top is
   looked for the trunk it belongs to -- a trunk whose own top is in that row,
   standing within the reach the rule states -- and the furthest leaf any trunk
   owns is printed beside that reach. A crown that fell short of the reach it
   states is as much a lie as one that went past it, so both are failures. Each
   cay's own beach is counted beside it, because the chapter prints what stands
   on one. */
{
  const SEA = F.WORLD.sea, ID = F.BLOCK_ID, bad = [];
  const REACH = 2.6, WALK = Math.ceil(REACH);   // the crown's reach, in metres -- and a metre is a column
  const perCay = [];
  let trunks = 0, cayBeach = 0, crownCells = 0, crownFar = 0;
  for (let n = 1; n <= 70; n++) {
    const isle = F.isleRecord(n);
    if (isle.r <= 0) continue;
    const span = Math.ceil(isle.r), cx = Math.floor(isle.x), cz = Math.floor(isle.z);
    let mine = 0, mineStrand = 0;
    const standing = new Map();                 // this island's trunks: the column, and how high its top stands
    for (let dz = -span; dz <= span; dz++) for (let dx = -span; dx <= span; dx++) {
      const x = cx + dx, z = cz + dz;
      if (Math.hypot(x + 0.5 - isle.x, z + 0.5 - isle.z) >= isle.r) continue;
      const under = F.islandUnder(x, z);
      if (!under || under.isle.id !== isle.id) continue;
      const h = F.landHeight(x, z);
      const onBeach = h > SEA && h <= SEA + 1;
      if (onBeach) mineStrand++;
      if (w.get(x, h + 1, z) !== ID.trunk) continue;      // a tree that does not begin at the ground is not standing on it
      trunks++; mine++;
      if (isle.type !== 'cay')
        bad.push(`树 ${x},${z} 长在 ${isle.type} 上，海上只有沙岛的沙滩长棕榈`);
      if (!onBeach) bad.push(`棕榈 ${x},${z} 脚下的地 y${h} 不在沙滩那一段`);
      else if (w.get(x, h, z) !== 4) bad.push(`棕榈 ${x},${z} 脚下 y${h} 是 ${w.get(x, h, z)}，不是该岛自己说的沙`);
      let top = h + 1;
      for (let y = h + 2; y < F.WORLD.h; y++) { if (w.get(x, y, z) === ID.trunk) top = y; else break; }
      if (top - h < 6 || top - h > 9) bad.push(`棕榈 ${x},${z} 的干是 ${top - h} 格，棕榈的干是 6-9 格`);
      if (w.get(x, top + 1, z) !== ID.leaf) bad.push(`棕榈 ${x},${z} 的干顶 y${top + 1} 上没有叶子`);
      /* One trunk, standing whole. A palm's own crown may not eat the trunk of
         the palm next to it: the wood goes on up through a neighbour's fronds. */
      for (let y = top + 2; y < F.WORLD.h; y++)
        if (w.get(x, y, z) === ID.trunk) { bad.push(`棕榈 ${x},${z} 的干在 y${y} 又出现了：它的干断在 ${top} 上`); break; }
      standing.set(x + ',' + z, top);
    }
    for (const [key, top] of standing) {
      const at = key.split(','), x = +at[0], z = +at[1], row = top + 1;
      for (let dz = -WALK; dz <= WALK; dz++) for (let dx = -WALK; dx <= WALK; dx++) {
        const lx = x + dx, lz = z + dz;
        if (w.get(lx, row, lz) !== ID.leaf) continue;
        crownCells++;
        let own = -1;
        for (let uz = -WALK; uz <= WALK; uz++) for (let ux = -WALK; ux <= WALK; ux++) {
          if (standing.get((lx + ux) + ',' + (lz + uz)) !== top) continue;   // only a crown in this row owns this leaf
          const d = Math.hypot(ux, uz);
          if (own < 0 || d < own) own = d;
        }
        if (own < 0) { bad.push(`叶子 ${lx},${lz} y${row} 离每一棵棕榈都远过 ${REACH} m，树冠没有这么大的`); continue; }
        if (own > REACH) bad.push(`叶子 ${lx},${lz} y${row} 离自己的干 ${own.toFixed(2)} m，树冠只到 ${REACH} m`);
        if (own > crownFar) crownFar = own;
      }
    }
    if (isle.type === 'cay') {
      cayBeach += mineStrand;
      perCay.push({ n, at: [cx, cz], foot: +isle.r.toFixed(1), beach: mineStrand, palms: mine });
      if (!mineStrand) bad.push(`沙洲岛 ${n} 没有沙滩：它顶上没有一个地方是干地又在水面那一段`);
      if (!mine) bad.push(`沙洲岛 ${n} 的沙滩上一棵棕榈也没有`);
    }
  }
  if (!crownCells) bad.push('海上没有一片树冠的叶子：棕榈的树冠没有建出来');
  else if (crownFar < 2) bad.push(`最远的一片叶子离自己的干只有 ${crownFar.toFixed(2)} m，树冠没有铺到它说的 ${REACH} m`);
  console.log('外海棕榈', trunks + ' 棵', perCay.length + ' 座沙岛的沙滩共', cayBeach, '柱',
    `树冠 ${crownCells} 格叶子，最远的一片离自己的干 ${crownFar.toFixed(2)} m（说的是 ${REACH} m）`,
    perCay.map(c => `${c.n}:${c.beach}柱/${c.palms}棵`).join(' '),
    bad.length ? '!! ' + bad.slice(0, 4).join('; ') + `（共 ${bad.length} 处不对）` : 'OK');
  if (bad.length) process.exitCode = 1;
}

/* The shore is the ground a body walks up out of the sea. The rule that used to
   cap the ground past the island's shore at two metres under the surface
   flattened the blend against the cap from its first metre, so every shore came
   out a wall: ten to thirteen metres of ground in three metres of walk, on every
   bearing, and nothing walked up it. What the rule states now is a slope --
   COAST.grade is the steepest shore this world runs into anywhere, and shoreRun
   derives the run a drop needs from it -- and the question asked back is the one
   the complaint was made in: standing in the water, how tall is the tallest step
   of ground between here and the island's interior? The sea floor's own band is
   measured too, because that cap was also (badly) protecting it: the floor the
   sea rests on stays under water, never shallow enough to be land and never deep
   enough to be invisible. */
{
  const C = { x: F.COAST.cx, z: F.COAST.cz }, SEA = F.WORLD.sea, CL = F.COAST;
  const g = (x, z) => F.landHeight(Math.floor(x), Math.floor(z));
  const shoreBad = [];
  let worstStep = 0, worstAt = null, waterLo = 1e9, waterHi = 0, climbLo = 1e9, climbHi = 0;
  let worstGrade = 0, floorLo = 1e9, floorHi = -1e9;
  for (let deg = 0; deg < 360; deg += 3) {
    const th = deg * Math.PI / 180;
    const wr = F.shoreWater(th);
    if (wr < CL.min) shoreBad.push(`bearing ${deg}: water inside the authored map`);
    if (wr < F.coastRadius(th)) shoreBad.push(`bearing ${deg}: the water stands inside the shore line`);
    /* the profile: from open water, up the shore, to the island's own ground */
    const prof = [];
    for (let d = wr + 25; d >= CL.r - 40; d--) prof.push({ d, h: g(C.x + Math.cos(th) * d, C.z + Math.sin(th) * d) });
    // (a) the shore's own reach: open water to the shore line, step by step
    for (let i = 1; i < prof.length; i++) {
      if (prof[i].d < F.coastRadius(th)) break;          // inland: the land's own relief, reported only
      const step = prof[i].h - prof[i - 1].h;
      if (step > worstStep) { worstStep = step; worstAt = { deg, d: prof[i].d }; }
      if (i >= 20) {                                     // a 20 m window: the rounding has somewhere to hide
        const gr = (prof[i].h - prof[i - 20].h) / (prof[i - 20].d - prof[i].d);
        if (gr > worstGrade) worstGrade = gr;
      }
    }
    if (prof[0].h >= SEA) shoreBad.push(`bearing ${deg}: dry ground 25 m out to sea`);
    // (b) the sea floor, past the end of every shore's run
    for (let d = CL.r + CL.apron + 220; d <= CL.r + CL.apron + 260; d += 10) {
      const x = C.x + Math.cos(th) * d, z = C.z + Math.sin(th) * d;
      const h = g(x, z);
      if (h > SEA - 2) shoreBad.push(`bearing ${deg}: a sea floor at y${h}, 2 m or less under the surface`);
      if (h < SEA - 12) shoreBad.push(`bearing ${deg}: a sea floor at y${h}, deeper than this world states`);
      floorLo = Math.min(floorLo, h); floorHi = Math.max(floorHi, h);
    }
    waterLo = Math.min(waterLo, wr); waterHi = Math.max(waterHi, wr);
    const climb = prof[prof.length - 1].h - prof[0].h;
    climbLo = Math.min(climbLo, climb); climbHi = Math.max(climbHi, climb);
  }
  if (worstStep > 1) shoreBad.push(`a shore step of ${worstStep} m at bearing ${worstAt.deg}, r ${worstAt.d}`);
  /* The figure the whole island's ground is held to is the height of a riser,
     because that is the figure a body answers: the world's own minimum riser is
     one metre, and a body climbs one metre with the launch its record states and
     stops at anything above it. A wall -- the 11-13 m of ground in 3 m of walk
     this rule used to make -- is uncrossable for the same reason.
     `grade` bounds the descent the shore rule itself makes. The ground it carries
     keeps its own relief, since an island's shore cannot be gentler than the
     island, so the composed figure measured over a 20 m window sits above 0.25;
     the bound below is that measured figure with room in it, and it is the one
     that would have gone red on the wall (the wall ran 4 m of ground per m). */
  if (worstGrade > 0.45) shoreBad.push(`a 20 m window of shore running ${worstGrade.toFixed(2)} m of ground per m`);
  console.log('主岛海岸 水面半径', waterLo.toFixed(0) + '-' + waterHi.toFixed(0) + 'm',
    '岸上最高一步', worstStep + 'm', '坡比最大', worstGrade.toFixed(3),
    '水面到岛内升高', climbLo + '-' + climbHi + 'm', '外海床 y', floorLo + '-' + floorHi,
    shoreBad.length ? '!! ' + shoreBad.join('; ') : 'OK');
  if (shoreBad.length) process.exitCode = 1;
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
