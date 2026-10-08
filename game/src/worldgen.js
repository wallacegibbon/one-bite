/* ==========================================================================
 *  worldgen.js —— 谷地生成：地形 / 镜湖 / 星坠堡 / 低语林 / 蝙蝠洞 /
 *                  灯笼镇 / 果园遗迹 / 云顶浮岛 / 果实与植物分布
 * ========================================================================== */
(function (N) {
  const D = N.BLOCKS;
  let W, seed;

  /* ---------------- 噪声 ---------------- */
  function h2(x, z, s) {
    let n = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(s | 0, 1013904223);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }
  function noise2(x, z, s) {
    const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    const a = h2(xi, zi, s), b = h2(xi + 1, zi, s), c = h2(xi, zi + 1, s), d = h2(xi + 1, zi + 1, s);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  }
  function fbm(x, z, s, oct) {
    let v = 0, a = 0.5, f = 1;
    for (let i = 0; i < (oct || 4); i++) { v += a * noise2(x * f, z * f, s + i * 37); f *= 2; a *= 0.5; }
    return v;
  }
  function ss(a, b, t) { t = Math.max(0, Math.min(1, (t - a) / (b - a))); return t * t * (3 - 2 * t); }
  function dist(x, z, ax, az) { const dx = x - ax, dz = z - az; return Math.sqrt(dx * dx + dz * dz); }
  let rngS = 1;
  function rnd() { rngS = (Math.imul(rngS, 1664525) + 1013904223) >>> 0; return rngS / 4294967296; }

  const SEA = 14;
  const LAKE = { x: 78, z: 106, r: 34 };
  const ISLE = { x: 78, z: 106, r: 10 };
  const MTN = { x: 142, z: 18, r: 30 };
  const HILL = { x: 28, z: 30, r: 16 };
  const VILL = { x0: 118, z0: 116, x1: 152, z1: 150 };
  const ORCH = { x: 24, z: 104, r: 15 };
  const GROVE = { x: 104, z: 32, r: 17 };

  function terrainH(x, z) {
    let h = 19 + fbm(x * 0.035, z * 0.035, seed, 4) * 7;
    h += fbm(x * 0.11, z * 0.11, seed + 5, 2) * 2.2;
    // 北岭
    const dm = dist(x, z, MTN.x, MTN.z);
    if (dm < MTN.r) h += Math.pow(1 - dm / MTN.r, 1.5) * 21;
    // 回声丘
    const dh = dist(x, z, HILL.x, HILL.z);
    if (dh < HILL.r) h += Math.pow(1 - dh / HILL.r, 1.4) * 8;
    // 镜湖（碗形：岸边浅、湖心深）
    const dl = dist(x, z, LAKE.x, LAKE.z);
    if (dl < LAKE.r) {
      const t = Math.min(1, (1 - dl / LAKE.r) * 1.9);
      h -= 18 * Math.pow(t, 0.6);
      if (dl > LAKE.r - 5) h += (dl - (LAKE.r - 5)) * 0.6;   // 湖岸略抬
    }
    // 湖心岛
    const di = dist(x, z, ISLE.x, ISLE.z);
    if (di < ISLE.r + 3) h = Math.max(h, 21 + (1 - ss(8, 14, di)) * 2.5);
    // 灯笼镇平地
    if (x > VILL.x0 - 6 && x < VILL.x1 + 6 && z > VILL.z0 - 6 && z < VILL.z1 + 6) {
      const w = Math.min(1, Math.min(x - (VILL.x0 - 6), (VILL.x1 + 6) - x, z - (VILL.z0 - 6), (VILL.z1 + 6) - z) / 6);
      h = h * (1 - w) + 20 * w;
    }
    // 果园遗迹平地
    const doo = dist(x, z, ORCH.x, ORCH.z);
    if (doo < ORCH.r + 4) { const w = 1 - ss(ORCH.r - 2, ORCH.r + 4, doo); h = h * (1 - w) + 20 * w; }
    return Math.max(3, Math.min(W.h - 12, Math.round(h)));
  }

  /* ---------------- 基础工具 ---------------- */
  const set = (x, y, z, b) => W.set(x, y, z, b);
  const get = (x, y, z) => W.get(x, y, z);
  function box(x0, y0, z0, x1, y1, z1, b, hollow) {
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const edge = (x === x0 || x === x1 || y === y0 || y === y1 || z === z0 || z === z1);
      if (hollow && !edge) continue;
      set(x, y, z, b);
    }
  }
  function cyl(cx, cz, r0, r1, y0, y1, b, hollow) {
    for (let y = y0; y <= y1; y++) for (let z = (cz - r1) | 0; z <= cz + r1; z++) for (let x = (cx - r1) | 0; x <= cx + r1; x++) {
      const d = dist(x, z, cx, cz);
      if (d > r1 || d < r0) continue;
      if (hollow && d < r1 - 1) continue;
      set(x, y, z, b);
    }
  }
  function blob(cx, cy, cz, rx, ry, rz, b, hollow) {
    for (let y = (cy - ry) | 0; y <= cy + ry; y++) for (let z = (cz - rz) | 0; z <= cz + rz; z++) for (let x = (cx - rx) | 0; x <= cx + rx; x++) {
      const q = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2;
      if (q > 1) continue;
      if (hollow && q < 0.45) continue;
      set(x, y, z, b);
    }
  }
  function columnTop(x, z) { for (let y = W.h - 1; y >= 0; y--) if (get(x, y, z)) return y; return 0; }
  /* 地面高度（跳过树、植物、果实） */
  const TREELIKE = { 6: 1, 7: 1, 8: 1, 9: 1, 22: 1, 27: 1, 28: 1 };
  function gy(x, z) {
    for (let y = W.h - 1; y > 0; y--) {
      const b = get(x, y, z);
      if (!b) continue;
      const d = D[b];
      if (!d || d.micro || !d.solid || TREELIKE[b]) continue;
      return y;
    }
    return 0;
  }

  /* ---------------- 树 ---------------- */
  function tree(x, z, kind) {
    const y = gy(x, z);
    if (get(x, y, z) !== 1 && get(x, y, z) !== 23 && get(x, y, z) !== 4) return;
    if (kind === 'pine') {
      const h = 7 + (rnd() * 4 | 0);
      for (let i = 1; i <= h; i++) set(x, y + i, z, 6);
      for (let i = 0; i < 5; i++) {
        const r = 3.2 - i * 0.62;
        blob(x, y + h - i * 1.7, z, r, 0.95 + rnd() * 0.3, r, 8);
      }
      set(x, y + h + 1, z, 8);
    } else if (kind === 'silver') {
      const h = 5 + (rnd() * 3 | 0);
      for (let i = 1; i <= h; i++) set(x, y + i, z, 22);
      blob(x, y + h + 1.5, z, 2.6, 2.0, 2.6, 9);
    } else if (kind === 'willow') {
      const h = 5 + (rnd() * 2 | 0);
      for (let i = 1; i <= h; i++) set(x, y + i, z, 6);
      blob(x, y + h + 1, z, 3.2, 1.6, 3.2, 28);
      for (let i = 0; i < 6; i++) {
        const a = rnd() * 6.28, dx = Math.round(Math.cos(a) * 2.6), dz = Math.round(Math.sin(a) * 2.6);
        for (let k = 0; k < 3 + rnd() * 2; k++) set(x + dx, y + h - k, z + dz, 28);
      }
    } else { // oak
      const h = 4 + (rnd() * 4 | 0);
      for (let i = 1; i <= h; i++) set(x, y + i, z, 6);
      const r = 2.2 + rnd() * 1.1;
      blob(x, y + h + 1.2, z, r, r * 0.8, r, rnd() < 0.3 ? 27 : 7);
      if (rnd() < 0.5) blob(x + 1, y + h + 2.2, z - 1, r * 0.6, r * 0.5, r * 0.6, 7);
    }
    return y;
  }
  function bush(x, z, fruitBlock) {
    const y = gy(x, z);
    if (get(x, y, z) !== 1) return;
    blob(x, y + 1.2, z, 1.3, 1.1, 1.3, 27);
    if (fruitBlock && rnd() < 0.8) {
      const a = rnd() * 6.28;
      set(x + Math.round(Math.cos(a)), y + 2, z + Math.round(Math.sin(a)), fruitBlock);
    }
  }

  /* 在树干的侧面挂果实（区域扫描 + 乱序） */
  function onTrunk(fruitId, x0, z0, x1, z1, trunkBlock, count) {
    const cols = [];
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) cols.push((z << 8) | x);
    for (let i = cols.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const t = cols[i]; cols[i] = cols[j]; cols[j] = t; }
    let placed = 0;
    for (const c of cols) {
      if (placed >= count) break;
      const x = c & 255, z = c >> 8;
      const y = gy(x, z);
      for (let yy = y + 1; yy <= y + 9; yy++) {
        if (get(x, yy, z) !== trunkBlock) continue;
        const spots = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        const st = (rnd() * 4) | 0;
        for (let k = 0; k < 4; k++) {
          const dx = spots[(st + k) % 4][0], dz = spots[(st + k) % 4][1];
          if (!get(x + dx, yy, z + dz)) {
            set(x + dx, yy, z + dz, N.FRUIT_BLOCK_REV[fruitId]); placed++; break;
          }
        }
        break;
      }
    }
    return placed;
  }

  /* ---------------- 星坠堡 ---------------- */
  function castle() {
    const cx = 78, cz = 106, base = 22;
    // 岛基
    for (let z = cz - 13; z <= cz + 13; z++) for (let x = cx - 13; x <= cx + 13; x++) {
      const d = dist(x, z, cx, cz);
      if (d > 13) continue;
      const top = 21 + (1 - ss(8, 13, d)) * 2;
      for (let y = 6; y <= top; y++) set(x, y, z, y > top - 2 ? (y === top ? 1 : 3) : 3);
    }
    // 城墙
    for (let a = 0; a < 6.283; a += 0.02) {
      const x = Math.round(cx + Math.cos(a) * 9.5), z = Math.round(cz + Math.sin(a) * 9.5);
      if (a > 1.1 && a < 2.0) continue;              // 南门缺口
      for (let y = base; y <= base + 5; y++) set(x, y, z, 11);
      if ((Math.round(a * 10) % 6) < 3) set(x, base + 6, z, 11);   // 城齿
    }
    // 院内地面
    for (let z = cz - 9; z <= cz + 9; z++) for (let x = cx - 9; x <= cx + 9; x++) {
      if (dist(x, z, cx, cz) > 9.5) continue;
      const y = gy(x, z);
      if (y < base) { set(x, y, z, 17); for (let yy = y + 1; yy < base; yy++) set(x, yy, z, 3); }
    }
    // 四塔
    for (const [tx, tz] of [[cx - 8, cz - 8], [cx + 8, cz - 8], [cx - 8, cz + 8], [cx + 8, cz + 8]]) {
      cyl(tx, tz, 0, 3.2, base, base + 11, 11, true);
      for (let y = base; y <= base + 11; y++) set(tx, y, tz, 0);       // 中空
      for (let r = 0; r <= 3; r++) for (let a = 0; a < 6.283; a += 0.2)
        set(Math.round(tx + Math.cos(a) * r), base + 12 + r, Math.round(tz + Math.sin(a) * r), 13);
      for (let y = base + 2; y <= base + 10; y += 3) {
        set(tx + 3, y, tz, 14); set(tx - 3, y, tz, 14); set(tx, y, tz + 3, 14); set(tx, y, tz - 3, 14);
      }
    }
    // 主塔（钟塔）
    box(cx - 4, base, cz - 4, cx + 4, base + 14, cz + 4, 11, true);
    for (let y = base + 1; y <= base + 13; y++) for (let z = cz - 3; z <= cz + 3; z++) for (let x = cx - 3; x <= cx + 3; x++) set(x, y, z, 0);
    box(cx - 3, base, cz - 3, cx + 3, base, cz + 3, 17);
    box(cx - 3, base + 7, cz - 3, cx + 3, base + 7, cz + 3, 17);   // 楼层
    for (let r = 0; r <= 5; r++) for (let a = 0; a < 6.283; a += 0.18)
      set(Math.round(cx + Math.cos(a) * r), base + 15 + r, Math.round(cz + Math.sin(a) * r), 13);
    set(cx, base + 20, cz, 14); set(cx, base + 19, cz, 19);        // 钟（金 + 辉石）
    for (let y = base + 2; y <= base + 13; y += 3) {
      for (let z = cz - 4; z <= cz + 4; z += 4) { set(cx - 4, y, z, 14); set(cx + 4, y, z, 14); }
      for (let x = cx - 4; x <= cx + 4; x += 4) { set(x, y, cz - 4, 14); set(x, y, cz + 4, 14); }
    }
    // 桥（南门 → 南岸）
    for (let z = cz + 9; z <= cz + 24; z++) for (let x = cx - 2; x <= cx + 2; x++) { set(x, base - 1, z, 11); set(x, base, z, 17); }
    for (let z = cz + 9; z <= cz + 24; z++) { set(cx - 2, base, z, 0); set(cx + 2, base, z, 0); set(cx - 2, base + 1, z, 12); set(cx + 2, base + 1, z, 12); }
    // 温室（东南）
    const gx = cx + 6, gz = cz + 6;
    box(gx - 2, base, gz - 2, gx + 2, base + 4, gz + 2, 21, true);
    set(gx, base + 1, gz, 14);
    set(gx - 1, base + 1, gz - 1, N.FRUIT_BLOCK_REV['owlberry']);
    set(gx + 1, base + 1, gz + 1, N.FRUIT_BLOCK_REV['unicorncherry']);
    // 地窖入口（标记）
    set(cx, base, cz + 4, 78);
  }

  /* ---------------- 灯笼镇 + 主果窖 ---------------- */
  function village() {
    const spots = [[124, 122], [132, 120], [142, 124], [148, 134], [144, 144], [132, 146], [122, 138]];
    for (const [hx, hz] of spots) {
      const y = 20;
      box(hx - 3, y + 1, hz - 3, hx + 3, y + 4, hz + 3, 10, true);
      box(hx - 2, y + 1, hz - 2, hx + 2, y + 1, hz + 2, 26);
      for (let r = 0; r <= 4; r++) for (let a = 0; a < 6.283; a += 0.25)
        set(Math.round(hx + Math.cos(a) * r), y + 5 + r, Math.round(hz + Math.sin(a) * r), 13);
      // 门 + 窗 + 灯
      const dx = hx < 136 ? 1 : -1;
      set(hx + dx * 3, y + 2, hz, 0); set(hx + dx * 3, y + 3, hz, 0);
      set(hx, y + 3, hz + 3, 21); set(hx + 3, y + 3, hz, 21);
      set(hx + dx * 5, y + 1, hz, 6); set(hx + dx * 5, y + 2, hz, 6); set(hx + dx * 5, y + 3, hz, 14);
      // 屋内灯
      set(hx, y + 4, hz, 14);
    }
    // 主果窖
    const cx = 136, cz = 134, y = 20;
    box(cx - 4, y, cz - 4, cx + 4, y + 4, cz + 4, 12, true);
    box(cx - 3, y, cz - 3, cx + 3, y, cz + 3, 17);
    for (let r = 0; r <= 5; r++) for (let a = 0; a < 6.283; a += 0.22)
      set(Math.round(cx + Math.cos(a) * r), y + 5 + Math.round(r * 0.8), Math.round(cz + Math.sin(a) * r), 11);
    set(cx, y + 2, cz - 4, 0); set(cx, y + 3, cz - 4, 0);
    set(cx, y + 1, cz, 78);                       // ★ 果窖箱（交互点）
    set(cx - 2, y + 2, cz - 4, 14); set(cx + 2, y + 2, cz - 4, 14);
    set(cx, y + 4, cz, 14);
    // 灯笼路
    for (let x = 118; x <= 150; x += 6) {
      const z = 128;
      set(x, 21, z, 6); set(x, 22, z, 6); set(x, 23, z, 14);
      for (let xx = x; xx < x + 6 && xx <= 150; xx++) set(xx, 21, z, 17);
    }
    // 镇外果园
    for (let i = 0; i < 40; i++) {
      const x = 116 + (rnd() * 36 | 0), z = 106 + (rnd() * 22 | 0);
      if (dist(x, z, LAKE.x, LAKE.z) < LAKE.r + 2) continue;
      if (x > VILL.x0 && x < VILL.x1 && z > VILL.z0 && z < VILL.z1) continue;
      tree(x, z, 'oak');
    }
  }

  /* ---------------- 果园遗迹 / 母树 ---------------- */
  function orchard() {
    const cx = 24, cz = 104;
    for (let a = 0; a < 6.283; a += 0.06) {
      const r = 12 + noise2(a * 4, 1, seed) * 2;
      const x = Math.round(cx + Math.cos(a) * r), z = Math.round(cz + Math.sin(a) * r);
      const hgt = 20 + (rnd() < 0.4 ? 0 : (rnd() * 3 | 0));
      for (let y = 19; y <= hgt; y++) set(x, y, z, rnd() < 0.5 ? 11 : 3);
    }
    // 母树
    for (let y = 21; y <= 30; y++) { set(cx, y, cz, 6); set(cx + 1, y, cz, 6); set(cx, y, cz + 1, 6); }
    blob(cx, 32, cz, 6, 3.5, 6, 7);
    blob(cx - 3, 30, cz + 2, 3, 2, 3, 27);
    set(cx, 26, cz + 1, 14);
    // 遗迹里的树与丝莓
    for (let i = 0; i < 14; i++) {
      const a = rnd() * 6.28, r = rnd() * 10;
      tree(Math.round(cx + Math.cos(a) * r), Math.round(cz + Math.sin(a) * r), rnd() < 0.3 ? 'pine' : 'oak');
    }
  }

  /* ---------------- 蝙蝠洞 ---------------- */
  function cave() {
    const cx = 28, cz = 32;
    blob(cx, 19, cz, 9, 4.5, 8, 0);                 // 掏空
    blob(cx - 4, 18, cz + 3, 4, 3, 4, 0);
    // 洞口（东南侧）
    for (let y = 17; y <= 22; y++) for (let z = cz + 6; z <= cz + 12; z++) for (let x = cx - 1; x <= cx + 2; x++)
      if (get(x, y, z)) set(x, y, z, 0);
    // 地面
    for (let z = cz - 8; z <= cz + 8; z++) for (let x = cx - 9; x <= cx + 9; x++) {
      if (dist(x, z, cx, cz) > 9.2) continue;
      for (let y = 15; y <= 17; y++) if (!get(x, y, z)) set(x, y, z, 3);
    }
    // 顶上的蝙蝠果（从洞内向上找洞顶）
    for (let i = 0; i < 34; i++) {
      const a = rnd() * 6.28, r = rnd() * 7;
      const x = Math.round(cx + Math.cos(a) * r), z = Math.round(cz + Math.sin(a) * r);
      let y = 18; while (y < 30 && !get(x, y, z)) y++;
      if (get(x, y, z) && y > 19 && y < 28 && !get(x, y - 1, z)) set(x, y - 1, z, N.FRUIT_BLOCK_REV['batfruit']);
    }
    // 丝莓（洞深处）
    for (let i = 0; i < 5; i++) {
      const x = cx - 8 + (rnd() * 4 | 0), z = cz - 6 + (rnd() * 6 | 0), y = 19 + (rnd() * 3 | 0);
      if (!get(x, y, z)) set(x, y, z, N.FRUIT_BLOCK_REV['silkberry']);
    }
  }

  /* ---------------- 湖底：沉塔 / 人鱼村 ---------------- */
  function lakebed() {
    // 沉塔
    const tx = 66, tz = 118;
    box(tx - 3, 6, tz - 3, tx + 3, 15, tz + 3, 12, true);
    for (let y = 7; y <= 14; y += 3) { set(tx - 3, y, tz, 21); set(tx + 3, y, tz, 21); set(tx, y, tz - 3, 21); set(tx, y, tz + 3, 21); }
    set(tx, 16, tz, 12); set(tx, 17, tz, 12);
    for (const [dx, dz] of [[-3, 0], [3, 0], [0, -3], [0, 3]]) {
      set(tx + dx, 10, tz + dz, N.FRUIT_BLOCK_REV['merrow']);
      set(tx + dx, 13, tz + dz, N.FRUIT_BLOCK_REV['merrow']);
    }
    // 人鱼村
    for (const [hx, hz] of [[90, 120], [96, 116], [94, 124], [88, 126]]) {
      box(hx - 2, 7, hz - 2, hx + 2, 10, hz + 2, 3, true);
      set(hx, 11, hz, 22); set(hx - 2, 9, hz, 21);
    }
    // 水草 / 水母田
    for (let i = 0; i < 260; i++) {
      const a = rnd() * 6.28, r = rnd() * LAKE.r;
      const x = Math.round(LAKE.x + Math.cos(a) * r), z = Math.round(LAKE.z + Math.sin(a) * r);
      const y = gy(x, z);
      if (y < SEA && y > 4 && get(x, y, z) && !get(x, y + 1, z)) set(x, y + 1, z, 75);
    }
    for (let i = 0; i < 26; i++) {
      const a = rnd() * 6.28, r = 8 + rnd() * 12;
      const x = Math.round(LAKE.x + Math.cos(a) * r), z = Math.round(LAKE.z + Math.sin(a) * r);
      const y = gy(x, z);
      if (y < SEA - 2 && !get(x, y + 1, z)) set(x, y + 1, z, N.FRUIT_BLOCK_REV['jellybloom']);
    }
    // 岸边水獭果灌木
    for (let i = 0; i < 22; i++) {
      const a = rnd() * 6.28, r = LAKE.r - 1 + rnd() * 3;
      const x = Math.round(LAKE.x + Math.cos(a) * r), z = Math.round(LAKE.z + Math.sin(a) * r);
      if (gy(x, z) >= SEA) bush(x, z, N.FRUIT_BLOCK_REV['otterkin']);
    }
  }

  /* ---------------- 云顶浮岛 ---------------- */
  function sky() {
    for (const isle of N.SKY_ISLES) {
      const { x, z, r, top } = isle;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        const d = dist(x + dx, z + dz, x, z);
        if (d > r) continue;
        const th = Math.round((1 - Math.pow(d / r, 2)) * (r * 0.9)) + 1;
        set(x + dx, top, z + dz, 1);
        for (let y = top - 1; y >= top - th; y--) set(x + dx, y, z + dz, y > top - th + 1 ? 3 : 24);
      }
      if (isle.nest) {
        for (let i = 0; i < 5; i++) tree(x - 4 + (rnd() * 8 | 0), z - 4 + (rnd() * 8 | 0), 'pine');
        // 龙巢：骨堆 + 余烬 + 焰心果
        for (let a = 0; a < 6.283; a += 0.2) {
          const rr = 4 + rnd() * 2;
          const bx = Math.round(x + Math.cos(a) * rr), bz = Math.round(z + Math.sin(a) * rr);
          set(bx, top + 1, bz, 22); set(bx, top + 2, bz, rnd() < 0.4 ? 18 : 22);
        }
        set(x, top + 1, z, 18); set(x + 1, top + 1, z, 18); set(x, top + 1, z + 1, 18);
        set(x - 1, top + 2, z, N.FRUIT_BLOCK_REV['embercore']);
        set(x + 2, top + 2, z - 1, N.FRUIT_BLOCK_REV['embercore']);
        set(x - 2, top + 3, z + 2, N.FRUIT_BLOCK_REV['embercore']);
      } else {
        for (let i = 0; i < (r > 5 ? 5 : 2); i++) tree(x - r + 2 + (rnd() * (2 * r - 4) | 0), z - r + 2 + (rnd() * (2 * r - 4) | 0), 'pine');
      }
    }
    // 云：多团叠加的蓬松云，位于树冠之上
    for (let i = 0; i < 16; i++) {
      const x = 10 + rnd() * 140, z = 10 + rnd() * 140, y = 38 + rnd() * 5;
      if (dist(x, z, ISLE.x, ISLE.z) < 20) continue;
      const n = 3 + (rnd() * 3 | 0);
      for (let k = 0; k < n; k++) {
        const ox = x + (rnd() - 0.5) * 11, oz = z + (rnd() - 0.5) * 11, oy = y + (rnd() - 0.5) * 2.4;
        const rr = 3.4 + rnd() * 3.6;
        blob(ox, oy, oz, rr, rr * (0.5 + rnd() * 0.22), rr, 16);
      }
    }
  }

  /* ---------------- 森林 / 植物 / 果实 ---------------- */
  function forest() {
    /* 网格 + 抖动种树：保证树冠之间仍能看到地面 */
    for (let z = 7; z < 74; z += 3) for (let x = 7; x < 154; x += 3) {
      if (dist(x, z, LAKE.x, LAKE.z) < LAKE.r + 2) continue;
      if (dist(x, z, 78, 106) < 16) continue;
      if (x > VILL.x0 - 8 && z > VILL.z0 - 8) continue;
      const inGrove = dist(x, z, GROVE.x, GROVE.z) < GROVE.r;
      const inGlade = dist(x, z, 60, 56) < 12;
      const onMtn = dist(x, z, MTN.x, MTN.z) < MTN.r * 0.75;
      const n = fbm(x * 0.10, z * 0.10, seed + 91, 3);
      let p = inGlade ? 0.10 : onMtn ? 0.35 : inGrove ? 0.72 : 0.55;
      if (n * 0.7 + 0.35 > p) {
        const tx = x + (rnd() * 3 | 0), tz = z + (rnd() * 3 | 0);
        if (inGrove) tree(tx, tz, 'silver');
        else if (onMtn) tree(tx, tz, 'pine');
        else tree(tx, tz, rnd() < 0.28 ? 'pine' : 'oak');
      }
    }
    // 湖边柳树
    for (let a = 0; a < 6.283; a += 0.22) {
      const r = LAKE.r + 1.5 + rnd();
      const x = Math.round(LAKE.x + Math.cos(a) * r), z = Math.round(LAKE.z + Math.sin(a) * r);
      if (z < 74 || x < 6 || x > 153) continue;
      if (rnd() < 0.55) tree(x, z, 'willow');
    }
    // 蘑菇圈
    const gx = 60, gz = 56;
    for (let a = 0; a < 6.283; a += 0.13) {
      const x = Math.round(gx + Math.cos(a) * 9), z = Math.round(gz + Math.sin(a) * 9);
      const y = gy(x, z);
      if (get(x, y, z) === 1) set(x, y + 1, z, 76);
    }
    for (let i = 0; i < 40; i++) {
      const a = rnd() * 6.28, r = rnd() * 8;
      const x = Math.round(gx + Math.cos(a) * r), z = Math.round(gz + Math.sin(a) * r);
      const y = gy(x, z);
      if (get(x, y, z) === 1 && !get(x, y + 1, z)) set(x, y + 1, z, rnd() < 0.6 ? 60 : 61);
    }
    // 森林地面：荧光菇 / 发光种子 / 弹弹菇
    for (let i = 0; i < 900; i++) {
      const x = 8 + (rnd() * 144 | 0), z = 8 + (rnd() * 66 | 0);
      if (dist(x, z, LAKE.x, LAKE.z) < LAKE.r + 1) continue;
      const y = gy(x, z);
      if (get(x, y, z) !== 1 || get(x, y + 1, z)) continue;
      const r = rnd();
      set(x, y + 1, z, r < 0.35 ? 60 : r < 0.72 ? 62 : r < 0.88 ? 64 : 61);
    }
    // 倒木 + 鹿茸菌果
    for (let i = 0; i < 16; i++) {
      const x = 14 + (rnd() * 130 | 0), z = 12 + (rnd() * 56 | 0);
      if (dist(x, z, LAKE.x, LAKE.z) < LAKE.r + 3) continue;
      const y = gy(x, z);
      if (get(x, y, z) !== 1) continue;
      const dir = rnd() < 0.5;
      for (let k = 0; k < 5; k++) {
        const xx = dir ? x + k : x, zz = dir ? z : z + k;
        set(xx, y + 1, zz, 6);
        if (rnd() < 0.4) set(xx, y + 2, zz, N.FRUIT_BLOCK_REV['stagcap']);
      }
    }
    // 猫头鹰果：老橡树洞旁
    onTrunk('owlberry', 10, 10, 150, 70, 6, 24);
    // 银角樱：圣林
    onTrunk('unicorncherry', GROVE.x - 17, GROVE.z - 17, GROVE.x + 17, GROVE.z + 17, 22, 20);
    // 萤蛾果：蘑菇圈与林间
    for (let i = 0; i < 70; i++) {
      const a = rnd() * 6.28, r = rnd() * 12;
      const x = Math.round(gx + Math.cos(a) * r), z = Math.round(gz + Math.sin(a) * r);
      const y = gy(x, z);
      if (get(x, y, z) === 1 && !get(x, y + 1, z)) set(x, y + 1, z, N.FRUIT_BLOCK_REV['glowmoth']);
    }
    // 狐李：镇外果园 + 果园遗迹
    onTrunk('vulpine', 110, 100, 152, 150, 6, 10);
    onTrunk('vulpine', 14, 94, 38, 116, 6, 6);
    // 灰熊无花果：北岭
    for (let i = 0; i < 26; i++) {
      const a = rnd() * 6.28, r = rnd() * 18;
      const x = Math.round(MTN.x + Math.cos(a) * r), z = Math.round(MTN.z + Math.sin(a) * r);
      const y = gy(x, z);
      if (y > SEA + 6 && !get(x, y + 1, z) && [3, 15, 24, 2, 1].indexOf(get(x, y, z)) >= 0) set(x, y + 1, z, N.FRUIT_BLOCK_REV['bruinfig']);
    }
    // 灰雾果：边界
    for (let i = 0; i < 10; i++) {
      const side = i % 4;
      let x, z;
      if (side === 0) { x = 8 + (rnd() * 140 | 0); z = 8; }
      else if (side === 1) { x = 8 + (rnd() * 140 | 0); z = 151; }
      else if (side === 2) { x = 8; z = 8 + (rnd() * 140 | 0); }
      else { x = 151; z = 8 + (rnd() * 140 | 0); }
      const y = gy(x, z);
      if (y > SEA && !get(x, y + 1, z)) set(x, y + 1, z, N.FRUIT_BLOCK_REV['veilberry']);
    }
    // 窖树种：母树下一颗 + 镇子附近一颗
    for (const [x, z] of [[ORCH.x + 2, ORCH.z + 2], [116, 112]]) {
      const y = gy(x, z);
      if (get(x, y, z) === 1 && !get(x, y + 1, z)) set(x, y + 1, z, 65);
    }
  }

  /* ---------------- 主入口 ---------------- */
  function generate(world, s) {
    W = world; seed = s | 0; rngS = seed + 12345;
    // 地形
    for (let z = 0; z < W.d; z++) for (let x = 0; x < W.w; x++) {
      const h = terrainH(x, z);
      const nearWater = h <= SEA + 1;
      for (let y = 0; y <= h; y++) {
        let b = 3;
        if (y === h) b = nearWater ? 4 : (h > 34 ? 15 : (dist(x, z, GROVE.x, GROVE.z) < GROVE.r ? 23 : 1));
        else if (y > h - 4) b = nearWater ? 4 : 2;
        else if (y < 3) b = 24;
        set(x, y, z, b);
      }
      for (let y = h + 1; y <= SEA; y++) set(x, y, z, 5);
    }
    cave(); castle(); village(); orchard(); lakebed(); sky(); forest();
    // 边界：把最外圈压平并立起“灰雾”石柱
    for (let i = 0; i < W.w; i += 7) {
      for (const [x, z] of [[i, 4], [i, W.d - 5], [4, i], [W.w - 5, i]]) {
        const y = gy(x, z);
        for (let yy = y; yy <= y + 6; yy++) set(x, yy, z, 16);
      }
    }
    // 出生点：灯笼镇空地
    let sx = 133, sz = 129;
    for (let i = 0; i < 400; i++) {
      const y = gy(sx, sz);
      if (y > SEA && !get(sx, y + 1, sz) && !get(sx, y + 2, sz) && !get(sx - 1, y + 1, sz) && !get(sx + 1, y + 1, sz)) break;
      sx = 120 + (rnd() * 28 | 0); sz = 118 + (rnd() * 28 | 0);
    }
    N.spawn = { x: sx + 0.5, y: gy(sx, sz) + 1.05, z: sz + 0.5 };
    return W;
  }

  N.generate = generate;
  N.terrainH = (x, z) => terrainH(x, z);
  N.spawn = { x: 136.5, y: 22, z: 128.5 };

})(window.FRUTARIA = window.FRUTARIA || {});
