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

  function landRawH(x, z) {
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
    return h;
  }
  /* The land as the map is built from it: whole metres, inside the world. A
     shore's blend wants the unrounded ground (see `landH`): rounding first puts a
     sawtooth of a metre in every metre of the slope, and a bound on the slope
     would then be a bound on the wrong thing. */
  function terrainH(x, z) {
    return Math.max(3, Math.min(W.h - 12, Math.round(landRawH(x, z))));
  }
  /* The land's relief: all of the terrain above with a wavelength under twenty
     metres. Asked on its own because the sea works it off a shore (see
     `seaFloorAt`), and there it is subtracted from the land rather than being a
     second terrain: the land's arithmetic stays written in one place and comes
     out to exactly the same cells it always did. */
  function reliefH(x, z) {
    return (fbm(x * 0.035, z * 0.035, seed, 4) - fbm(x * 0.035, z * 0.035, seed, 2)) * 7 +
      fbm(x * 0.11, z * 0.11, seed + 5, 2) * 2.2;
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
    // sunken tower -- the landmarks (the lake's centre, the tower, the huts)
    // live in the zone data as world facts; the field that used to be defined
    // by this tower's outline went with the lamps
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
  /* ---------------- outside the valley: the sea ----------------
     The valley is an island, and it is an island in the same sense any other
     ground in this world is: an outline that is a function of where it is, water
     round it, and the same terrain under the water as under the land. Three
     harmonics of the seed draw the shore, so it is a coastline and not a
     square -- the map's square was always the edge of an array, never the shape
     of the ground. The shore is held outside the half-diagonal of the authored
     map so that not one cell of that map is cut out of it: the island is what the
     map is, plus the ground the array stopped before.
     Past the shore the ground walks down to the sea floor, and the floor keeps
     the same kind of noise the land has, because a flat seabed is a plane and
     there are no planes on this planet. The floor lies 8 m under the surface with
     +-3 m of that noise on it: below about 6 m of water our own measured
     absorption leaves a bed 4.5% of its relief (docs/07), so digging deeper buys
     geometry nothing can see. The descent is bounded by a slope, not by a height:
     `grade` is the steepest shore this world runs into anywhere, and `shoreRun`
     derives the run a drop needs from it. The rule this replaces -- cap the
     ground past the shore at 2 m under the surface -- made every shore a wall. */
  const COAST = {
    cx: N.WORLD.w / 2, cz: N.WORLD.d / 2,
    r: 150, wander: 0.16,                                  // mean radius, and how far it wanders
    min: Math.hypot(N.WORLD.w, N.WORLD.d) / 2 + 8,         // never cuts the authored map open
    apron: 70,                                             // the least run a shore may take
    grade: 0.25,                                           // steepest a shore may run: m of ground per m of ground
    smooth: 40,                                            // the reach over which the sea works the land's relief away
    deep: N.WORLD.sea - 8, floorRelief: 3                  // where the floor lies, and how much it moves
  };
  function coastR(theta) {
    const k1 = h2(17, 3, seed) - 0.5, k2 = h2(41, 9, seed) - 0.5, k3 = h2(7, 61, seed) - 0.5;
    const w = COAST.wander * (Math.sin(theta + k1 * 6.283)
      + 0.55 * Math.sin(2 * theta + k2 * 6.283) + 0.3 * Math.sin(3 * theta + k3 * 6.283)) / 1.85;
    return Math.max(COAST.min, COAST.r * (1 + w));
  }
  /* Metres beyond the island's shore; negative inland. A column's centre is the
     point asked about, because the map is a grid of metre cells. */
  function beyond(x, z) {
    const dx = x + 0.5 - COAST.cx, dz = z + 0.5 - COAST.cz;
    const d = Math.hypot(dx, dz);
    if (d < 1) return -d;
    return d - coastR(Math.atan2(dz, dx));
  }
  /* The islands of the open sea, and the rule that puts them there.
     The requirement the user set is a gradient, not a distribution: more islands
     the nearer they lie to the island this square sits on, thinner the further out
     they go. The rule that gives that and keeps the world fixed is
     an Archimedean spiral out of the island the game already is, with a fixed
     number of islands to the turn: the count per turn stays constant while the
     ring it lies on grows, so the count per square kilometre falls as 1/r.
     Identity comes with it for free and is the point: an island's id is its
     ordinal along the spiral -- 0 is the authored island -- and its position is
     computed *from* the ordinal, never the other way round, so the same island is
     met again from any direction, in any later session, and a player's own id
     names a home island without a table anywhere.
     `b` is metres of radius gained per full turn, so turns are 2*pi*b = 377 m
     apart radially and the first turn stands at r 377 m: the authored island's
     own shore is at 126-175 m (`COAST`), so the nearest island ever met is two
     hundred metres of open water away, and the spacing only widens outwards.
     The bearing of each turn is drawn once from the turn number, and each
     island is jittered along its own radius, so the layout is a coast of
     islands rather than a wheel of spokes. */
  const ISLES = {
    b: 60, perTurn: 7,
    /* how far an island may be pulled off the turn it belongs to, along its own
       radius. It has to stay under half the gap between turns (2*pi*b/2 = 188 m)
       or two turns could trade places and the spiral would stop being one. */
    jitter: 40,
    /* water kept between two grounds. Two islands touching at their feet is not
       a thing that happens: what is between them is a channel, and a channel is
       what makes them two islands. */
    keep: 24,
    /* the smallest foot radius worth raising: below this the "island" is a few
       cells of shingle the player can stand on and forget, and it would cost the
       same looking-up as a real one. */
    minFoot: 15
  };
  /* What the kinds of island are, in three numbers. Two of them are the shape
     of a shore: how far the foot of it reaches, and how high its crown stands
     over the water line. A sandbar is a metre and a half of sand that the sea
     uncovers at the top of a tide; a ridge is a hill the sea has cut the top
     of, high enough that the material table puts snow on it by its own height
     rule (h > 34), which is why no snow is written here. The mix of kinds
     changes with the distance: the near turns are shallow sand and reef, the
     far ones are land.
     The third number is what the pile is made of, and it was missing. The
     material table reads height only -- sand at and near the water line, soil
     under the crown, rock under that -- and for ground the land made that is
     the truth, but a bar is a heap of sand the sea laid down and a reef is a
     rock it left standing: what they are made of is not a consequence of how
     high they happen to be. Measured on the tree before this field existed,
     over the 70 ordinals the reach holds: of the **15** sandbars **9** wore
     grass at their crown and 6 sand, and all **16** reefs wore grass over soil
     -- a rock shelf and a hill of earth, indistinguishable in the ground. So a
     kind states its pile and its crown as blocks, and `columnInto` lays that
     material from the floor the pile was raised out of to its crown. A kind
     that states no ground is a piece of land that never went under: thicket,
     isle and ridge take the height table exactly as they always did. */
  const ISLE_TYPES = {
    sandbar: { r: [22, 45], crest: [1.2, 2.4], ground: { pile: 4, crown: 4 } },
    reef: { r: [30, 70], crest: [2.5, 4.5], ground: { pile: 3, crown: 3 } },
    thicket: { r: [50, 95], crest: [5, 9] },
    isle: { r: [70, 125], crest: [8, 14] },
    ridge: { r: [100, 165], crest: [14, 24] }
  };
  const ISLE_MIX = [
    [['sandbar', 0.34], ['reef', 0.34], ['thicket', 0.22], ['isle', 0.08], ['ridge', 0.02]],
    [['sandbar', 0.16], ['reef', 0.26], ['thicket', 0.30], ['isle', 0.20], ['ridge', 0.08]],
    [['sandbar', 0.08], ['reef', 0.18], ['thicket', 0.28], ['isle', 0.30], ['ridge', 0.16]]
  ];
  /* the widest foot any kind states: this is what bounds the search for the
     islands that could touch an address, and what bounds how far the authored
     island's own ground can be approached */
  const MAX_FOOT = ISLE_TYPES.ridge.r[1];
  /* Ordinal -> centre. Ordinal 0 is the authored island, and the spiral starts
     after it: one full turn of the spiral carries `perTurn` islands, so turn 1
     (ordinals 1..7) runs from bearing 2*pi to 4*pi, which is the radius band
     377-754 m. Numbering the turns from 1 is not decoration -- it is what keeps
     the first turn outside the authored island's own shore, and it is what makes
     "which turns can reach this address" mean the same thing here and in
     `islesNear`. Positions are cached because they are pure arithmetic and every
     column of ground asks for the same few dozen of them -- and both caches are
     per world, cleared where a world begins: an island of the world before this
     one must not answer for it. */
  const islePosCache = new Map(), isleCache = new Map();
  function forgetIsles() { islePosCache.clear(); isleCache.clear(); }
  function islePos(n) {
    if (n <= 0) return { x: COAST.cx, z: COAST.cz, turn: 0 };
    if (islePosCache.has(n)) return islePosCache.get(n);
    const t = Math.floor((n - 1) / ISLES.perTurn) + 1, j = (n - 1) % ISLES.perTurn;
    const off = h2(t, 0, seed + 41);                    // this turn's starting bearing
    const th = 2 * Math.PI * (t + (j + off) / ISLES.perTurn);
    const rad = ISLES.b * th + (h2(n, 0, seed + 43) - 0.5) * 2 * ISLES.jitter;
    const p = { x: COAST.cx + Math.cos(th) * rad, z: COAST.cz + Math.sin(th) * rad, turn: t };
    islePosCache.set(n, p);
    return p;
  }
  /* The full record of an island: where, what kind, and how big its foot really
     is. The size the kind states is an upper bound only -- an island is never
     allowed to grow over the channel that makes it an island, so its foot is cut
     back by the authored island's shore and by its nearest neighbours on the
     spiral, and an island with nothing left to stand on is not raised at all.
     This is asked of the ordinal, not of the ground: the same question about the
     same island gets the same answer in every session and from every direction,
     and cutting one island down never depends on which island was looked at
     first. */
  /* Where the authored island's own water stands along a bearing: its shore
     profile walked in from well outside until the ground reaches the water line
     (ground at the surface height is dry: the water fills the cells above the
     ground up to that height and no further). `seaFloorH` is asked and not
     `landH`: the channel between an island and the authored one is about the
     authored island's ground, and the piles raised out there must not decide
     where its own shore falls -- that would be circular, and would make cutting
     one island down depend on which island was looked at first. */
  function waterR(theta) {
    const cr = coastR(theta);
    for (let s = 460; s > 0; s -= 2) {
      const x = Math.floor(COAST.cx + Math.cos(theta) * (cr + s));
      const z = Math.floor(COAST.cz + Math.sin(theta) * (cr + s));
      if (seaFloorH(x, z) >= SEA) return Math.hypot(x - COAST.cx, z - COAST.cz);
    }
    return cr;
  }
  function isleAt(n) {
    if (n <= 0) return null;
    if (isleCache.has(n)) return isleCache.get(n);
    const p = islePos(n);
    const d = Math.hypot(p.x - COAST.cx, p.z - COAST.cz);
    const turn = p.turn;
    const mix = ISLE_MIX[turn <= 3 ? 0 : turn <= 8 ? 1 : 2];
    let t0 = h2(n, 0, seed + 47), type = mix[0][0];
    for (const [k, w] of mix) { t0 -= w; if (t0 <= 0) { type = k; break; } }
    const T = ISLE_TYPES[type];
    const foot = T.r[0] + h2(n, 0, seed + 53) * (T.r[1] - T.r[0]);
    const crest = T.crest[0] + h2(n, 0, seed + 59) * (T.crest[1] - T.crest[0]);
    // room: to the authored island's water, and to every neighbour that could reach here
    let room = d - waterR(Math.atan2(p.z - COAST.cz, p.x - COAST.cx)) - ISLES.keep;
    for (const m of isleNeighbours(n)) {
      if (m === n) continue;
      const q = islePos(m);
      room = Math.min(room, Math.hypot(q.x - p.x, q.z - p.z) / 2 - ISLES.keep);
    }
    const r = Math.min(foot, room);
    /* the floor this island stands in, asked once: an island's height is stated
       above the water line, so the pile of ground needed is the water over this
       floor plus that much, and every column of one island measures from the
       same floor. */
    const rec = { id: n, x: p.x, z: p.z, turn, type, r: r > ISLES.minFoot ? r : 0, crest,
      foot, room: +room.toFixed(1), bed: seaFloorH(Math.floor(p.x), Math.floor(p.z)) };
    isleCache.set(n, rec);
    return rec;
  }
  /* The ordinals that could have a foot reaching ordinal n's centre: its own
     turn, the turn before and the turn after, which is where the spiral can
     come within one island's reach of a point on it. */
  function isleNeighbours(n) {
    const t = Math.floor((n - 1) / ISLES.perTurn) + 1, out = [];
    for (let k = Math.max(1, t - 1); k <= t + 1; k++) {
      for (let j = 0; j < ISLES.perTurn; j++) out.push((k - 1) * ISLES.perTurn + j + 1);
    }
    return out;
  }
  /* Which islands could touch this address: the same question from the other
     end, answered from the address alone -- a place, not a walk over the sea.
     The spiral is monotonic in radius, so the turns that can reach a point are
     the turns whose radius is within one foot (plus that turn's own jitter) of
     the point's: turn t sits at radius 2*pi*b*t, which is the same arithmetic
     `islePos` used to put it there. */
  function islesNear(x, z) {
    const dx = x + 0.5 - COAST.cx, dz = z + 0.5 - COAST.cz;
    const rad = Math.hypot(dx, dz);
    if (rad < 1) return [];
    const per = 2 * Math.PI * ISLES.b;
    const tLow = Math.max(1, Math.floor((rad - MAX_FOOT - ISLES.jitter) / per));
    const tHigh = Math.ceil((rad + MAX_FOOT + ISLES.jitter) / per);
    const out = [];
    for (let t = tLow; t <= tHigh; t++) {
      for (let j = 0; j < ISLES.perTurn; j++) {
        const n = (t - 1) * ISLES.perTurn + j + 1;
        const p = islePos(n);
        if (Math.abs(p.x - x) > MAX_FOOT || Math.abs(p.z - z) > MAX_FOOT) continue;
        const isle = isleAt(n);
        if (isle.r > 0) out.push(isle);
      }
    }
    return out;
  }
  /* The shortest run of ground that carries a drop from the island's own ground
     down to its sea floor without ever running steeper than COAST.grade: a
     smoothstep over a run R is steepest at its middle, at 1.5 * drop / R, so a
     run of 1.5 * drop / grade never does. `apron` is the floor of that: a shallow
     drop still gets a shore wide enough to be a shore and not a dip. */
  function shoreRun(h) {
    return Math.max(COAST.apron, 1.5 * (h - COAST.deep) / COAST.grade);
  }
  /* The sea floor at an address: the ground the island rule raises its piles
     out of. This is `landH` with no island in it, and it is written once -- the
     height of a pile is measured from here, so if this were restated beside
     `landH` the two would drift and an island's crown would stop being the
     height its kind states. */
  function seaFloorAt(h, s, x, z) {
    if (s <= 0) return h;
    /* Where the sea reaches, the sea has graded the ground: the land's fine relief
       is worked away over COAST.smooth metres and what runs down to the floor is
       the land's shape. The blend starts at the land's own height, so nothing
       steps or seams where the authored array ends. Leaving the relief in makes
       the grade bound true of the slope and false of the ground: measured with it
       in, 88 of 120 bearings presented a step of two metres on the way up out of
       the sea -- taller than either body lifts itself. */
    const hs = h - reliefH(x, z) * ss(0, COAST.smooth, s);
    const run = shoreRun(hs);
    let v = hs + (COAST.deep - hs) * ss(0, run, s);
    /* the seabed's own noise fades in past the end of the run, so a shore ends in
       ground rather than in a step standing in the sea */
    v += (fbm(x * 0.05, z * 0.05, seed + 71, 3) - 0.5) * 2 * COAST.floorRelief *
      ss(run, run + 40, s);
    return v;
  }
  function seaFloorH(x, z) { return seaFloorAt(landRawH(x, z), beyond(x, z), x, z); }
  /* An island is a pile of ground raised out of the floor it stands in, and the
     pile is a dome: flat enough at the crown to be the island's own ground, and
     running down to nothing at its foot with no step and no wall -- `1 -
     smoothstep` has zero slope at both ends, so an island cannot leave a cliff
     standing in the sea, and cannot leave a ring of it either. The crown height
     is stated above the water line (that is what a sandbar and a ridge *are*),
     so the height of the pile is the water over the floor plus that much, and a
     shore appears wherever the dome crosses the water line by itself: a low
     sandbar is dry over a small part of its footprint and a ridge over most of
     its own, which is the difference between them. */
  function islePile(x, z) {
    /* The island whose pile stands over this address, and how far that pile lifts
       the ground here. One pass, and the answer is carried: the height needs it,
       the material needs it, and what grows on the ground needs it -- asking the
       same question three times at one column would cost three searches of the
       spiral. Where two domes overlap, the higher pile answers, as `isleLift`
       always did. */
    let best = null;
    for (const isle of islesNear(x, z)) {
      const d = Math.hypot(x + 0.5 - isle.x, z + 0.5 - isle.z);
      if (d >= isle.r) continue;
      const lift = (SEA + isle.crest - isle.bed) * (1 - ss(0, 1, d / isle.r));
      if (!best || lift > best.lift) best = { isle, lift };
    }
    return best;
  }

  /* One address, asked once. What comes back is the floor the sea graded, the
     island pile standing in that floor if there is one, and the height of the
     ground that leaves. The floor and the pile come back with the height because
     a column is not only how tall it is: what it is made of is a question about
     the pile it belongs to, and where that pile begins is where the floor ends. */
  function groundAt(x, z) {
    const s = beyond(x, z);
    if (s <= 0) { const h = terrainH(x, z); return { floor: h, pile: null, h }; }
    // the same floor the save and the tests ask for: one blend, restated nowhere
    const floor = seaFloorAt(landRawH(x, z), s, x, z);
    const pile = islePile(x, z);
    const lift = pile ? pile.lift : 0;
    let v = floor + lift;
    /* whole metres: a column of this world is a stack of metre cells, and a
       height of 7.56 puts water at cell 8.56, which is nowhere. The blend is
       continuous and the ground it describes is a slope made of steps. The only
       ceiling here is an island's own: ground raised above the water line is what
       the island rule asked for, and its limit is the crown that island's kind
       states. A shore wants no ceiling of height -- its two ends are the island's
       own ground and that island's sea floor, both stated above, and the water
       line falls wherever that slope crosses it: that line is the beach, and it
       is not something a second rule gets to place. */
    if (lift > 0) v = Math.min(v, SEA + 30);
    return { floor, pile, h: Math.max(3, Math.round(v)) };
  }

  /* The height of the ground at any address in the world. Inside the shore this
     is exactly the terrain the map was built from -- the blend starts at that
     height, so there is no step and no seam where the array ends. */
  function landH(x, z) { return groundAt(x, z).h; }

  /* What a column of ground is made of, at any address. One table for the whole
     world: sand at and near the water line, rock under three metres, soil
     between, water above the ground up to the surface. A seabed is therefore the
     same material as a lakebed, and the shore of an island is not a case.
     Above that table, and only where an island's dome stands, the island's kind
     names the material the pile is: from the row its floor ends at, a bar is
     sand and a reef is rock all the way up. The order the two are asked in is
     not arbitrary. The sea's own skin of sand at and near the water line comes
     first, because it is what the water does to any shore in this world -- the
     authored island's beaches are made that way -- and a rock shelf has a sandy
     shallows round it for the same reason a hill of sand has a beach. Below
     that skin the pile's own material runs, to its crown. */
  function columnInto(x, z, put) {
    const g = groundAt(x, z);
    const h = g.h;
    const nearWater = h <= SEA + 1;
    const ground = g.pile && (ISLE_TYPES[g.pile.isle.type] || {}).ground;
    const pileFrom = ground ? Math.round(g.floor) + 1 : 0;
    for (let y = 0; y <= h; y++) {
      let b = 3;
      if (y === h) b = nearWater ? 4 : ground ? ground.crown
        : (h > 34 ? 15 : (dist(x, z, GROVE.x, GROVE.z) < GROVE.r ? 23 : 1));
      else if (y > h - 4) b = nearWater ? 4 : ground ? ground.pile : 2;
      else if (y < 3) b = 24;
      else if (ground && y >= pileFrom) b = ground.pile;
      put(x, y, z, b);
    }
    for (let y = h + 1; y <= SEA; y++) put(x, y, z, 5);
  }

  function generate(world, s) {
    W = world; seed = s | 0; rngS = seed + 12345;
    forgetIsles();                       // another world, another set of islands
    // terrain
    for (let z = 0; z < W.d; z++) for (let x = 0; x < W.w; x++) columnInto(x, z, set);
    // and the ground beyond this square is answered by the same rule, by address
    W.column = (x, z, put) => columnInto(x, z, put);
    cave(); castle(); village(); orchard(); lakebed(); forest();
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
  // the shape of the island and the ground beyond it, for the map, the tests and
  // anything that has to know where the shore is
  N.COAST = COAST;
  N.coastRadius = coastR;
  N.shoreWater = waterR;    // where the authored island's water stands along a bearing
  N.shoreRun = shoreRun;    // the run of ground a drop of h takes to reach its floor
  N.beyondCoast = beyond;
  N.landHeight = landH;
  /* the islands, asked either way: an ordinal is a place, and a place names the
     ordinals whose feet reach it */
  N.ISLES = ISLES;
  N.ISLE_TYPES = ISLE_TYPES;
  N.islePosition = islePos;
  N.isleRecord = isleAt;
  N.islesNear = islesNear;
  /* the pile standing over an address and how far it lifts the ground there: the
     height asks it and the material asks it, and anything else that has to know
     whether a piece of ground is an island's own asks it here, not by walking. */
  N.islandUnder = islePile;
  N.seaFloorHeight = seaFloorH;
  // overwritten by generate(); the fallback is Lanternrow's road, facing west
  N.spawn = { x: 136.5, y: 22.05, z: 128.5, yaw: -Math.PI / 2 };

})(window.FRUTARIA = window.FRUTARIA || {});
