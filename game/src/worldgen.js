/* ==========================================================================
 *  worldgen.js -- valley generation: terrain / Mirrorlake / Starfall Keep / Whisperwood / Echo Hollow /
 *                  Lanternrow / the old orchard / fruit and plant distribution
 *                  Every fruit is placed where its own species lives (docs/02 s6).
 * ========================================================================== */
(function (N) {
  const D = N.BLOCKS;
  let W, seed;

  /* ---------------- noise ---------------- */
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

  /* Sea level and the lake come from the world data, so the carved lake and the
     Mirrorlake zone are the same circle and cannot drift apart. The mountains,
     the hollow and the isle are shapes the terrain needs that no zone claims. */
  const SEA = N.WORLD.sea;
  const MIRROR = N.ZONE_BY_ID.mirrorlake;
  const LAKE = { x: MIRROR.cx, z: MIRROR.cz, r: MIRROR.r };
  const ISLE = { x: N.ZONE_BY_ID.starfall.cx, z: N.ZONE_BY_ID.starfall.cz, r: 10 };
  const MTN = { x: 142, z: 18, r: 30 };
  const HILL = { x: 28, z: 30, r: 16 };
  const VILL = { x0: 118, z0: 116, x1: 152, z1: 150 };
  const ORCH = { x: 24, z: 104, r: 15 };
  const GROVE = { x: 104, z: 32, r: 17 };

  function terrainH(x, z) {
    let h = 19 + fbm(x * 0.035, z * 0.035, seed, 4) * 7;
    h += fbm(x * 0.11, z * 0.11, seed + 5, 2) * 2.2;
    // Ashscale Ridge
    const dm = dist(x, z, MTN.x, MTN.z);
    if (dm < MTN.r) h += Math.pow(1 - dm / MTN.r, 1.5) * 21;
    // Echo Hollow
    const dh = dist(x, z, HILL.x, HILL.z);
    if (dh < HILL.r) h += Math.pow(1 - dh / HILL.r, 1.4) * 8;
    /* Mirrorlake (bowl shaped: shallow at the shore, deep in the middle).
       18 carved a puddle: 2,029 water columns, mean depth 5.5, and 41% of them
       4 or shallower -- more shelf than lake. 22 gives 2,958 columns, mean 7.4,
       53% at 8 or deeper. It is also as deep as this world can go: the surface
       is y14 and terrainH never returns below y3, so 11 is the deepest column
       possible and the bottom of the basin comes out flat. The shoreline term
       is what keeps the widened circle out of the whisperwood: at r38 not one
       wet cell lands in the forest band, at r40 seventeen do. */
    const dl = dist(x, z, LAKE.x, LAKE.z);
    if (dl < LAKE.r) {
      const t = Math.min(1, (1 - dl / LAKE.r) * 1.9);
      h -= 22 * Math.pow(t, 0.6);
      if (dl > LAKE.r - 5) h += (dl - (LAKE.r - 5)) * 0.6;   // raise the shoreline slightly
    }
    // the island at the lake centre
    const di = dist(x, z, ISLE.x, ISLE.z);
    /* `<=`, not `<`: the island base that castle() builds over this same
       circle fills every column at d <= 13 (its loop skips only d > 13), and
       a strict < here left the rim ring -- the twelve integer columns at
       exactly d = 13 from the lake centre, the 5-12-13 lattice points -- at
       the lake's own floor: h 3, water y4..14. The base then overwrote
       y6..21 of those columns with stone, and the water at y4-5 stayed
       trapped beneath it: a pocket two cells deep, topmost water y5, in all
       twelve columns, measured on seed 20261008. The aquatic law answers wet
       to a pocket (two or more water cells anywhere in the column) while the
       lamps' own cell at their hover height (y13) is the stone: a lamp that
       stepped in was carried out of the stone at 0.1 m a frame, up the
       sixteen-metre pillar, and held on the rim by the column's own altitude
       law -- measured over six thousand frames of a fresh world, eight of the
       ten lamps of Mirrorlake had left the water by the end, 22.35 the rim's
       ground plus 0.35, 23.35 the keep's bridge deck over it. With the rim
       raised here the base overwrites solid on solid and the pocket has
       nowhere to form; the body-cell law beside the step gate in entities.js
       answers the same question from the other side, for a world the player
       digs. */
    if (di <= ISLE.r + 3) h = Math.max(h, 21 + (1 - ss(8, 14, di)) * 2.5);
    // Lanternrow flat ground
    if (x > VILL.x0 - 6 && x < VILL.x1 + 6 && z > VILL.z0 - 6 && z < VILL.z1 + 6) {
      const w = Math.min(1, Math.min(x - (VILL.x0 - 6), (VILL.x1 + 6) - x, z - (VILL.z0 - 6), (VILL.z1 + 6) - z) / 6);
      h = h * (1 - w) + 20 * w;
    }
    // orchard ruins flat ground
    const doo = dist(x, z, ORCH.x, ORCH.z);
    if (doo < ORCH.r + 4) { const w = 1 - ss(ORCH.r - 2, ORCH.r + 4, doo); h = h * (1 - w) + 20 * w; }
    return Math.max(3, Math.min(W.h - 12, Math.round(h)));
  }

  /* ---------------- basic helpers ---------------- */
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
  /* A conical roof, one column at a time. The obvious way to write one walks a
     ring by angle and writes `y0 + r`, and that fails twice over. The arc
     between two samples is r*da, so an angle step that is tight at r=1 skips
     whole cells by r=4: the roof has holes you can see the sky through. And
     `y0 + r` grows with the radius, which builds the cone upside down -- a rim
     of tiles standing above a low centre, the point at the bottom, a funnel
     instead of a roof. Here the height falls away from the apex, and every
     column inside the eaves gets a tile, so the building keeps the rain out. */
  function cone(cx, cz, apexY, rMax, b, rise) {
    const k = rise === undefined ? 1 : rise;
    for (let dz = -rMax - 1; dz <= rMax + 1; dz++) for (let dx = -rMax - 1; dx <= rMax + 1; dx++) {
      const r = dist(cx + dx, cz + dz, cx, cz);
      if (r > rMax + 0.75) continue;
      set(cx + dx, apexY - Math.round(r * k), cz + dz, b);
    }
  }
  /* ground height (skips trees, plants and fruit) */
  function gy(x, z) {
    for (let y = W.h - 1; y > 0; y--) {
      const b = get(x, y, z);
      if (!b) continue;
      const d = D[b];
      if (!d || d.micro || !d.solid || N.TREE_BLOCK[b]) continue;
      return y;
    }
    return 0;
  }

  /* ---------------- trees ---------------- */
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

  /* a mound: a low earth heap. Whatever dug these is gone from the
     valley; the heaps are left, and the town still digs its cellars like this */
  function mound(x, z) {
    const y = gy(x, z);
    if ([1, 2, 3, 24].indexOf(get(x, y, z)) < 0) return;
    blob(x, y + 0.8, z, 1.6, 0.9, 1.6, 2);
  }

  /* ---------------- Starfall Keep ---------------- */
  function castle() {
    const keep = N.ZONE_BY_ID.starfall;
    const cx = keep.cx, cz = keep.cz, base = 22;
    // island base
    for (let z = cz - 13; z <= cz + 13; z++) for (let x = cx - 13; x <= cx + 13; x++) {
      const d = dist(x, z, cx, cz);
      if (d > 13) continue;
      const top = 21 + (1 - ss(8, 13, d)) * 2;
      for (let y = 6; y <= top; y++) set(x, y, z, y > top - 2 ? (y === top ? 1 : 3) : 3);
    }
    // curtain walls
    for (let a = 0; a < 6.283; a += 0.02) {
      const x = Math.round(cx + Math.cos(a) * 9.5), z = Math.round(cz + Math.sin(a) * 9.5);
      if (a > 1.1 && a < 2.0) continue;              // gap for the south gate
      for (let y = base; y <= base + 5; y++) set(x, y, z, 11);
      if ((Math.round(a * 10) % 6) < 3) set(x, base + 6, z, 11);   // battlements
    }
    // courtyard floor
    for (let z = cz - 9; z <= cz + 9; z++) for (let x = cx - 9; x <= cx + 9; x++) {
      if (dist(x, z, cx, cz) > 9.5) continue;
      const y = gy(x, z);
      if (y < base) { set(x, y, z, 17); for (let yy = y + 1; yy < base; yy++) set(x, yy, z, 3); }
    }
    // the four towers
    for (const [tx, tz] of [[cx - 8, cz - 8], [cx + 8, cz - 8], [cx - 8, cz + 8], [cx + 8, cz + 8]]) {
      cyl(tx, tz, 0, 3.2, base, base + 11, 11, true);
      for (let y = base; y <= base + 11; y++) set(tx, y, tz, 0);       // hollow interior
      cone(tx, tz, base + 15, 3, 13);
      for (let y = base + 2; y <= base + 10; y += 3) {
        set(tx + 3, y, tz, 14); set(tx - 3, y, tz, 14); set(tx, y, tz + 3, 14); set(tx, y, tz - 3, 14);
      }
    }
    // the keep tower (bell tower)
    box(cx - 4, base, cz - 4, cx + 4, base + 14, cz + 4, 11, true);
    for (let y = base + 1; y <= base + 13; y++) for (let z = cz - 3; z <= cz + 3; z++) for (let x = cx - 3; x <= cx + 3; x++) set(x, y, z, 0);
    box(cx - 3, base, cz - 3, cx + 3, base, cz + 3, 17);
    box(cx - 3, base + 7, cz - 3, cx + 3, base + 7, cz + 3, 17);   // storeys
    cone(cx, cz, base + 20, 5, 13);
    set(cx, base + 20, cz, 14); set(cx, base + 19, cz, 19);        // the bell (gold + glowstone)
    for (let y = base + 2; y <= base + 13; y += 3) {
      for (let z = cz - 4; z <= cz + 4; z += 4) { set(cx - 4, y, z, 14); set(cx + 4, y, z, 14); }
      for (let x = cx - 4; x <= cx + 4; x += 4) { set(x, y, cz - 4, 14); set(x, y, cz + 4, 14); }
    }
    // bridge (south gate -> south shore)
    for (let z = cz + 9; z <= cz + 24; z++) for (let x = cx - 2; x <= cx + 2; x++) { set(x, base - 1, z, 11); set(x, base, z, 17); }
    for (let z = cz + 9; z <= cz + 24; z++) { set(cx - 2, base, z, 0); set(cx + 2, base, z, 0); set(cx - 2, base + 1, z, 12); set(cx + 2, base + 1, z, 12); }
    // greenhouse (south-east)
    const gx = cx + 6, gz = cz + 6;
    box(gx - 2, base, gz - 2, gx + 2, base + 4, gz + 2, 21, true);
    set(gx, base + 1, gz, 14);
    set(gx + 1, base + 1, gz + 1, N.FRUIT_BLOCK_REV['frogpear']);
    // cellar entrance (marked)
    set(cx, base, cz + 4, N.BLOCK_ID.cellarCrate);
  }

  /* ---------------- Lanternrow + the main cellar ---------------- */
  function village() {
    const spots = [[124, 122], [132, 120], [142, 124], [148, 134], [144, 144], [132, 146], [122, 138]];
    for (const [hx, hz] of spots) {
      const y = 20;
      box(hx - 3, y + 1, hz - 3, hx + 3, y + 4, hz + 3, 10, true);
      box(hx - 2, y + 1, hz - 2, hx + 2, y + 1, hz + 2, 26);
      cone(hx, hz, y + 9, 4, 13);
      // doors + windows + lamps
      const dx = hx < 136 ? 1 : -1;
      set(hx + dx * 3, y + 2, hz, 0); set(hx + dx * 3, y + 3, hz, 0);
      set(hx, y + 3, hz + 3, 21); set(hx + 3, y + 3, hz, 21);
      set(hx + dx * 5, y + 1, hz, 6); set(hx + dx * 5, y + 2, hz, 6); set(hx + dx * 5, y + 3, hz, 14);
      // interior lamps
      set(hx, y + 4, hz, 14);
    }
    // the main fruit cellar: the door is a POI, and the game spawns its store
    // at the same place, so the room is built around that point
    const door = N.POIS.find(p => p.id === 'cellar');
    const cx = door.x, cz = door.z, y = door.y;
    box(cx - 4, y, cz - 4, cx + 4, y + 4, cz + 4, 12, true);
    box(cx - 3, y, cz - 3, cx + 3, y, cz + 3, 17);
    cone(cx, cz, y + 9, 5, 11, 0.8);
    set(cx, y + 2, cz - 4, 0); set(cx, y + 3, cz - 4, 0);
    set(cx, y + 1, cz, N.BLOCK_ID.cellarCrate);   // * the cellar chest (interaction point)
    set(cx - 2, y + 2, cz - 4, 14); set(cx + 2, y + 2, cz - 4, 14);
    set(cx, y + 4, cz, 14);
    // the lantern road. One post is skipped: the spacing puts a post at x = 136,
    // which is the cellar door's own column, so it stood dead in front of the
    // door -- from the road the door was invisible, and a spawn facing the door
    // had a lamp trunk in the middle of its first frame.
    for (let x = 118; x <= 150; x += 6) {
      const z = 128;
      if (x !== door.x) { set(x, 21, z, 6); set(x, 22, z, 6); set(x, 23, z, 14); }
      for (let xx = x; xx < x + 6 && xx <= 150; xx++) set(xx, 21, z, 17);
    }
    // orchards outside town
    for (let i = 0; i < 40; i++) {
      const x = 116 + (rnd() * 36 | 0), z = 106 + (rnd() * 22 | 0);
      if (dist(x, z, LAKE.x, LAKE.z) < LAKE.r + 2) continue;
      if (x > VILL.x0 && x < VILL.x1 && z > VILL.z0 && z < VILL.z1) continue;
      tree(x, z, 'oak');
    }
  }

  /* ---------------- orchard ruins / the oldest tree ---------------- */
  function orchard() {
    const cx = 24, cz = 104;
    for (let a = 0; a < 6.283; a += 0.06) {
      const r = 12 + noise2(a * 4, 1, seed) * 2;
      const x = Math.round(cx + Math.cos(a) * r), z = Math.round(cz + Math.sin(a) * r);
      const hgt = 20 + (rnd() < 0.4 ? 0 : (rnd() * 3 | 0));
      for (let y = 19; y <= hgt; y++) set(x, y, z, rnd() < 0.5 ? 11 : 3);
    }
    // the oldest tree in the valley
    for (let y = 21; y <= 30; y++) { set(cx, y, cz, 6); set(cx + 1, y, cz, 6); set(cx, y, cz + 1, 6); }
    blob(cx, 32, cz, 6, 3.5, 6, 7);
    blob(cx - 3, 30, cz + 2, 3, 2, 3, 27);
    set(cx, 26, cz + 1, 14);
    // trees among the ruins
    for (let i = 0; i < 14; i++) {
      const a = rnd() * 6.28, r = rnd() * 10;
      tree(Math.round(cx + Math.cos(a) * r), Math.round(cz + Math.sin(a) * r), rnd() < 0.3 ? 'pine' : 'oak');
    }
    // the mounds are older than the town cellar
    for (let i = 0; i < 9; i++) {
      const a = rnd() * 6.28, r = 3 + rnd() * 9;
      mound(Math.round(cx + Math.cos(a) * r), Math.round(cz + Math.sin(a) * r));
    }
  }

  /* ---------------- Echo Hollow (a hollowed hill) ---------------- */
  function cave() {
    const cx = 28, cz = 32;
    blob(cx, 19, cz, 9, 4.5, 8, 0);                 // hollow it out
    blob(cx - 4, 18, cz + 3, 4, 3, 4, 0);
    // cave mouth (south-east side)
    for (let y = 17; y <= 22; y++) for (let z = cz + 6; z <= cz + 12; z++) for (let x = cx - 1; x <= cx + 2; x++)
      if (get(x, y, z)) set(x, y, z, 0);
    // floor
    for (let z = cz - 8; z <= cz + 8; z++) for (let x = cx - 9; x <= cx + 9; x++) {
      if (dist(x, z, cx, cz) > 9.2) continue;
      for (let y = 15; y <= 17; y++) if (!get(x, y, z)) set(x, y, z, 3);
    }
  }

  /* ---------------- lakebed: sunken tower / the sunken huts ---------------- */
  /* These are built at absolute heights, so they need ground under them, and
     the lakebed shelves down to the y3 floor terrainH refuses to go below.
     Measured with the lake as it was: the tower's floor (y6) sat on ground y5,
     but the huts' floors (y7) sat on ground y4/y5/y6/y6 -- three of the four
     had a floor with nothing under it, hanging 1-2 blocks in the water.
     Deepening the lake put y3 under all five: the tower would have hung 2
     blocks and every hut 3. Fill the footprint up to the base, and cap it with
     the sand the lakebed is made of, so a plinth does not read as a different
     material from the bed it rises out of. */
  function plinth(x0, z0, x1, z1, baseY) {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      /* Not gy(): gy scans the whole column from the top of the world down and
         stops at the first solid block it finds, which over the tower's north
         columns is the roof of Starfall Keep at y33-36, not the lakebed at y3.
         Look only below the base, and let the def table skip water the way the
         terrain fill does. */
      let g = -1;
      for (let y = baseY - 1; y >= 0; y--) { const d = D[get(x, y, z)]; if (d && d.solid) { g = y; break; } }
      if (g >= baseY - 1) continue;
      for (let y = g + 1; y < baseY; y++) set(x, y, z, 2);
      set(x, baseY - 1, z, 4);
    }
  }
  function lakebed() {
    // sunken tower -- the landmark lives in the zone data, because the
    // lanternfish field is defined as its outline and spawns from there
    const [tx, tz] = MIRROR.tower;
    plinth(tx - 3, tz - 3, tx + 3, tz + 3, 6);
    box(tx - 3, 6, tz - 3, tx + 3, 15, tz + 3, 12, true);
    for (let y = 7; y <= 14; y += 3) { set(tx - 3, y, tz, 21); set(tx + 3, y, tz, 21); set(tx, y, tz - 3, 21); set(tx, y, tz + 3, 21); }
    set(tx, 16, tz, 12); set(tx, 17, tz, 12);
    /* The frog pear hangs on the **sills**, one block under a window, not in the
       window: written at y10/y13 it overwrote the glass the line above had just
       put there, and the tower the docs describe -- three rows of windows, the
       glow of the field showing through them -- came out with one row at y7. */
    for (const [dx, dz] of [[-3, 0], [3, 0], [0, -3], [0, 3]]) {
      set(tx + dx, 9, tz + dz, N.FRUIT_BLOCK_REV['frogpear']);
      set(tx + dx, 12, tz + dz, N.FRUIT_BLOCK_REV['frogpear']);
    }
    // sunken huts: a ring of them on the lakebed, now the frogs' place
    for (const [hx, hz] of MIRROR.huts) {
      plinth(hx - 2, hz - 2, hx + 2, hz + 2, 7);
      box(hx - 2, 7, hz - 2, hx + 2, 10, hz + 2, 3, true);
      set(hx, 11, hz, 22); set(hx - 2, 9, hz, 21);
    }
    // kelp. The bed of a lake is covered by water, so asking for the cell above
    // to be empty asked for something that never happens: this placed none at
    // all, in every world, since the day it was written. Ask for the water --
    // and ask for it all the way up: the topmost water cell of the lake is y14,
    // and a stalk standing in it takes the surface sheet's whole block out with
    // it, which leaves a one-metre hole in the lake and a bright wall round it.
    for (let i = 0; i < 260; i++) {
      const a = rnd() * 6.28, r = rnd() * LAKE.r;
      const x = Math.round(LAKE.x + Math.cos(a) * r), z = Math.round(LAKE.z + Math.sin(a) * r);
      const y = gy(x, z);
      if (y + 1 < SEA && y > 4 && get(x, y, z) && get(x, y + 1, z) === 5) set(x, y + 1, z, 75);
    }
    // frogpear bushes in the reeds all round the shore
    for (let i = 0; i < 30; i++) {
      const a = rnd() * 6.28, r = LAKE.r - 1 + rnd() * 3;
      const x = Math.round(LAKE.x + Math.cos(a) * r), z = Math.round(LAKE.z + Math.sin(a) * r);
      if (gy(x, z) >= SEA) bush(x, z, N.FRUIT_BLOCK_REV['frogpear']);
    }
  }

  /* ---------------- clouds ---------------- */
  function sky() {
    // clouds: several overlapping puffy blobs, above the canopy
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

  /* ---------------- forest / plants / fruit ---------------- */
  function forest() {
    /* jittered grid planting: ground stays visible between canopies */
    for (let z = 7; z < 74; z += 3) for (let x = 7; x < 154; x += 3) {
      if (dist(x, z, LAKE.x, LAKE.z) < LAKE.r + 2) continue;
      if (dist(x, z, LAKE.x, LAKE.z) < 16) continue;
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
    // willows by the lake
    for (let a = 0; a < 6.283; a += 0.22) {
      const r = LAKE.r + 1.5 + rnd();
      const x = Math.round(LAKE.x + Math.cos(a) * r), z = Math.round(LAKE.z + Math.sin(a) * r);
      if (z < 74 || x < 6 || x > 153) continue;
      if (rnd() < 0.55) tree(x, z, 'willow');
    }
    // the mushroom ring
    const gx = 60, gz = 56;
    for (let a = 0; a < 6.283; a += 0.13) {
      const x = Math.round(gx + Math.cos(a) * 9), z = Math.round(gz + Math.sin(a) * 9);
      const y = gy(x, z);
      if (get(x, y, z) === 1) set(x, y + 1, z, 76);
    }
    // fallen logs: the old paths through the wood
    for (let i = 0; i < 16; i++) {
      const x = 14 + (rnd() * 130 | 0), z = 12 + (rnd() * 56 | 0);
      if (dist(x, z, LAKE.x, LAKE.z) < LAKE.r + 3) continue;
      const y = gy(x, z);
      if (get(x, y, z) !== 1) continue;
      const dir = rnd() < 0.5;
      for (let k = 0; k < 5; k++) {
        const xx = dir ? x + k : x, zz = dir ? z : z + k;
        set(xx, y + 1, zz, 6);
      }
    }
    // frogpear: the glade stays damp, so the frogs live there too
    for (let i = 0; i < 26; i++) {
      const a = rnd() * 6.28, r = 4 + rnd() * 9;
      bush(Math.round(gx + Math.cos(a) * r), Math.round(gz + Math.sin(a) * r), N.FRUIT_BLOCK_REV['frogpear']);
    }
    // mounds: in the wood and on the ridge
    for (let i = 0; i < 22; i++) {
      const x = 10 + (rnd() * 140 | 0), z = 10 + (rnd() * 62 | 0);
      if (dist(x, z, LAKE.x, LAKE.z) < LAKE.r + 2) continue;
      mound(x, z);
    }
    for (let i = 0; i < 12; i++) {
      const a = rnd() * 6.28, r = rnd() * 20;
      mound(Math.round(MTN.x + Math.cos(a) * r), Math.round(MTN.z + Math.sin(a) * r));
    }
    // cellar stones: one under the oldest tree + one near town
    for (const [x, z] of [[ORCH.x + 2, ORCH.z + 2], [116, 112]]) {
      const y = gy(x, z);
      if (get(x, y, z) === 1 && !get(x, y + 1, z)) set(x, y + 1, z, N.PLANT_BLOCK_REV['cellarseed']);
    }
  }

  /* ---------------- entry point ---------------- */
  function generate(world, s) {
    W = world; seed = s | 0; rngS = seed + 12345;
    // terrain
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
    // boundary: flatten the outermost ring and raise the Grey Veil pillars
    for (let i = 0; i < W.w; i += 7) {
      for (const [x, z] of [[i, 4], [i, W.d - 5], [4, i], [W.w - 5, i]]) {
        const y = gy(x, z);
        for (let yy = y; yy <= y + 6; yy++) set(x, yy, z, 16);
      }
    }
    /* spawn: Lanternrow, on the street outside the main cellar.
       A spawn is only good if the player starts out with somewhere to look. The
       old test asked whether the column under the player and its two side
       columns were clear, and never looked in the direction the camera is turned
       when the game opens -- init() set yaw = pi, so the player started facing
       +Z. It accepted (133,129), half a block from the main cellar's north wall:
       the first frame of the game was a wall, 91% of the pixels hitting a block
       0.6 m away at a mean brightness of 57/255, and the sky only came back once
       you had walked away from the building.
       The rule now reads the opening frame itself. For every column on the
       cellar's own street height (a rooftop has plenty of sky, but you would
       start on top of a house) the four street directions are shot with the
       opening camera -- yaw, pitch -0.1, fov 76 (the human body's), 16:10 --
       eighty rays through the world's own DDA. A column is fit to start at when
       at least 8% of that frame reaches sky and no more than 15% of it is a
       block within two metres: a street, not a wall. The column nearest the
       cellar door that passes wins, and the direction that passes there is the
       direction the game opens facing: the world decides which way you look when
       you start, because it is the world that knows where the walls are. The
       whole scan costs 3 ms. */
    const door = N.POIS.find(p => p.id === 'cellar');
    const room = (x, z) => {
      const y = gy(x, z);
      if (y <= SEA || Math.abs(y - door.y) > 1) return -1;   // the same street, not a roof
      // the body has to fit, and neither shoulder may be inside a wall
      if (get(x, y + 1, z) || get(x, y + 2, z) || get(x - 1, y + 1, z) || get(x + 1, y + 1, z)) return -1;
      return y;
    };
    const FAN = (yaw) => {
      const tanY = Math.tan(76 * Math.PI / 360), tanX = tanY * 1.6;
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(-0.1), sp = Math.sin(-0.1);
      const f = [sy * cp, sp, -cy * cp], r = [cy, 0, sy];
      const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
      const out = [];
      for (let j = 0; j < 8; j++) for (let i = 0; i < 10; i++) {
        const nx = (i + 0.5) / 10 * 2 - 1, ny = 1 - (j + 0.5) / 8 * 2;
        const dx = f[0] + r[0] * nx * tanX + u[0] * ny * tanY;
        const dy = f[1] + r[1] * nx * tanX + u[1] * ny * tanY;
        const dz = f[2] + r[2] * nx * tanX + u[2] * ny * tanY;
        const L = Math.hypot(dx, dy, dz);
        out.push([dx / L, dy / L, dz / L]);
      }
      return out;
    };
    // the fan carries the yaw it was built for, so the winner can report it
    const FANS = [Math.PI, 0, Math.PI / 2, -Math.PI / 2].map((y) => { const f = FAN(y); f.yaw = y; return f; });
    const pick = (skyFloor, wallCeil) => {
      let found = null, bestD = 1e9;
      for (let z = VILL.z0; z < VILL.z1; z++) for (let x = VILL.x0; x < VILL.x1; x++) {
        const d = dist(x, z, door.x, door.z);
        if (d >= bestD) continue;                  // nearest wins, so a worse one cannot displace it
        const y = room(x, z);
        if (y < 0) continue;
        // eye height: the body stands on y+1, the human eye sits 1.55 m up it
        let best = null;
        for (const rays of FANS) {
          let open = 0, wall = 0;
          for (const [dx, dy, dz] of rays) {
            const h = W.raycast(x + 0.5, y + 2.6, z + 0.5, dx, dy, dz, 64, false);
            if (!h) open++; else if (h.t < 2) wall++;
          }
          const sky = open / rays.length, near = wall / rays.length;
          if (sky < skyFloor || near > wallCeil) continue;
          if (!best || sky > best.sky) best = { yaw: rays.yaw, sky };
        }
        if (!best) continue;
        bestD = d; found = { x, y, z, yaw: best.yaw };
      }
      return found;
    };
    // if the village ever gets dense enough that no street passes, take the
    // least bad one rather than dropping the player through a wall
    const spot = pick(0.08, 0.15) || pick(0.03, 0.3);
    N.spawn = spot ? { x: spot.x + 0.5, y: spot.y + 1.05, z: spot.z + 0.5, yaw: spot.yaw }
      : { x: door.x + 0.5, y: door.y + 1.05, z: door.z - 7.5, yaw: Math.PI };
    return W;
  }

  N.generate = generate;
  // overwritten by generate(); the fallback is Lanternrow's road, facing west
  N.spawn = { x: 136.5, y: 22.05, z: 128.5, yaw: -Math.PI / 2 };

})(window.FRUTARIA = window.FRUTARIA || {});
