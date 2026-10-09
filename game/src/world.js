/* ==========================================================================
 *  world.js -- voxel storage / block definitions / chunk meshing (with AO) / ray picking
 * ========================================================================== */
(function (N) {
  const MB = N.MeshBuilder;

  /* ------------------------- block table ------------------------- */
  // c=[r,g,b]  ct=top colour  cb=bottom colour  solid=collides  opaque=culls faces  liquid  alpha  emis  micro=[[x,y,z,w,h,d]...]
  const B = [];
  function def(id, o) { B[id] = Object.assign({ id, solid: true, opaque: true, alpha: 1, emis: 0, c: [0.8, 0.8, 0.8] }, o); }

  def(0, { id: 0, cn: '空气', solid: false, opaque: false });
  def(1, { cn: '草地', c: [0.36, 0.30, 0.22], ct: [0.29, 0.50, 0.24] });
  def(2, { cn: '泥土', c: [0.40, 0.31, 0.22] });
  def(3, { cn: '石头', c: [0.50, 0.50, 0.54] });
  def(4, { cn: '沙', c: [0.80, 0.74, 0.53] });
  def(5, { cn: '水', solid: false, opaque: false, liquid: true, c: [0.13, 0.34, 0.52], alpha: 0.62 });
  def(6, { cn: '树干', c: [0.38, 0.27, 0.17], ct: [0.46, 0.34, 0.21] });
  def(7, { cn: '树叶', c: [0.20, 0.40, 0.18] });
  def(8, { cn: '针叶', c: [0.14, 0.30, 0.20] });
  def(9, { cn: '银叶', c: [0.60, 0.71, 0.68] });
  def(10, { cn: '木板', c: [0.62, 0.45, 0.28] });
  def(11, { cn: '城砖', c: [0.56, 0.56, 0.61] });
  def(12, { cn: '暗城砖', c: [0.36, 0.36, 0.42] });
  def(13, { cn: '屋顶瓦', c: [0.47, 0.21, 0.19] });
  def(14, { cn: '辉石', c: [1.00, 0.86, 0.52], emis: 1 });
  def(15, { cn: '雪', c: [0.92, 0.94, 0.98] });
  def(16, { cn: '云', c: [0.94, 0.95, 1.00], solid: false, opaque: true });
  def(17, { cn: '石板路', c: [0.58, 0.56, 0.52] });
  def(18, { cn: '余烬', c: [1.00, 0.44, 0.14], emis: 1 });
  def(19, { cn: '金', c: [0.86, 0.72, 0.30] });
  def(20, { cn: '冰', c: [0.55, 0.75, 0.90] });
  def(21, { cn: '玻璃', c: [0.62, 0.80, 0.92], opaque: false, alpha: 0.34 });
  def(22, { cn: '骨', c: [0.88, 0.86, 0.76] });
  def(23, { cn: '苔土', c: [0.25, 0.34, 0.20], ct: [0.24, 0.42, 0.22] });
  def(24, { cn: '山岩', c: [0.42, 0.42, 0.46] });
  def(25, { cn: '淤泥', c: [0.30, 0.25, 0.19] });
  def(26, { cn: '暗木板', c: [0.34, 0.25, 0.17] });
  def(27, { cn: '暗叶', c: [0.12, 0.24, 0.13] });
  def(28, { cn: '柳叶', c: [0.33, 0.45, 0.23] });
  def(29, { cn: '干草', c: [0.72, 0.66, 0.36] });
  def(30, { cn: '地毯苔', c: [0.20, 0.38, 0.24] });

  /* ---- fruit blocks (micro: small in-cell boxes, emissive) ---- */
  const FRUIT_BLOCK = {};   // blockId -> fruitId
  const FRUIT_BLOCK_REV = {};
  N.FRUITS.forEach((f, i) => {
    const id = 40 + i;
    const col = N.RARITY[f.rarity].color;
    const tint = f.rarity === 'legendary' ? [1, 0.55, 0.2] : col;
    def(id, {
      cn: f.cn, solid: false, opaque: false, emis: 1,
      c: tint,
      micro: [[0.28, 0.22, 0.28, 0.44, 0.44, 0.44], [0.18, 0.42, 0.34, 0.2, 0.2, 0.2], [0.6, 0.4, 0.4, 0.22, 0.22, 0.22]]
    });
    FRUIT_BLOCK[id] = f.id; FRUIT_BLOCK_REV[f.id] = id;
  });

  /* ---- plant blocks ---- */
  const PLANT_BLOCK = {}, PLANT_BLOCK_REV = {};
  N.PLANTS.forEach((p, i) => {
    const id = 60 + i;
    const emis = (p.id === 'glowcap' || p.id === 'glowseed' || p.id === 'cellarseed') ? 1 : 0;
    const c = p.id === 'glowcap' ? [0.55, 1.0, 0.75] :
      p.id === 'glowseed' ? [0.7, 1.0, 0.6] :
        p.id === 'leaper' ? [0.9, 0.5, 0.35] :
          p.id === 'drifter' ? [0.6, 0.62, 0.85] :
            p.id === 'thorn' ? [0.75, 0.35, 0.4] :
              p.id === 'cellarseed' ? [0.85, 0.75, 0.4] : [0.8, 0.6, 0.4];
    def(id, {
      cn: p.cn, solid: false, opaque: false, emis, c,
      micro: [[0.42, 0.0, 0.42, 0.16, 0.34, 0.16], [0.26, 0.32, 0.26, 0.48, 0.22, 0.48]]
    });
    PLANT_BLOCK[id] = p.id; PLANT_BLOCK_REV[p.id] = id;
  });

  def(75, { cn: '水草', solid: false, opaque: false, emis: 1, c: [0.3, 0.75, 0.55], micro: [[0.4, 0.0, 0.4, 0.2, 0.9, 0.2], [0.25, 0.2, 0.5, 0.16, 0.5, 0.16]] });
  def(76, { cn: '荧光菇环', solid: false, opaque: false, emis: 1, c: [0.6, 1.0, 0.7], micro: [[0.44, 0.0, 0.44, 0.14, 0.4, 0.14], [0.2, 0.38, 0.2, 0.6, 0.26, 0.6]] });
  def(77, { cn: '窖树核心', solid: false, opaque: false, emis: 1, c: [1.0, 0.85, 0.45], micro: [[0.3, 0.1, 0.3, 0.4, 0.5, 0.4]] });
  def(78, { cn: '果窖箱', store: true, c: [0.44, 0.31, 0.19], ct: [0.66, 0.48, 0.24] });
  def(79, { cn: '窖树', c: [0.40, 0.31, 0.21] });
  def(80, { cn: '窃果贼陷阱', trap: true, solid: false, opaque: false, emis: 1, c: [0.9, 0.35, 0.3], micro: [[0.3, 0.0, 0.3, 0.4, 0.6, 0.4]] });

  const AIR = 0, WATER = 5;

  /* The blocks the game itself places and breaks. A block number is what a save
     file stores, so it is named once here rather than written out at every call
     site. `store` and `trap` are the two the game asks about: the interaction
     code asks "can I put things in this?" instead of "is this 78?". */
  const BLOCK_ID = { trunk: 6, leaf: 7, darkLeaf: 27, cellarCore: 77, cellarCrate: 78, cellarTrunk: 79 };

  /* ------------------------- face table (with AO axes) ------------------------- */
  const FACES = [
    { n: [0, 1, 0], c: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], u: [1, 0, 0], v: [0, 0, 1], s: 1.00 },
    { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], u: [1, 0, 0], v: [0, 0, 1], s: 0.42 },
    { n: [1, 0, 0], c: [[1, 1, 0], [1, 1, 1], [1, 0, 1], [1, 0, 0]], u: [0, 0, 1], v: [0, 1, 0], s: 0.78 },
    { n: [-1, 0, 0], c: [[0, 1, 1], [0, 1, 0], [0, 0, 0], [0, 0, 1]], u: [0, 0, 1], v: [0, 1, 0], s: 0.66 },
    { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], u: [1, 0, 0], v: [0, 1, 0], s: 0.88 },
    { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], u: [1, 0, 0], v: [0, 1, 0], s: 0.58 }
  ];
  const AO_L = [1.0, 0.78, 0.60, 0.46];

  /* ------------------------- world ------------------------- */
  class World {
    constructor(w, h, d) {
      this.w = w; this.h = h; this.d = d;
      this.blocks = new Uint8Array(w * h * d);
      this.cs = 16;
      this.cx = Math.ceil(w / this.cs); this.cz = Math.ceil(d / this.cs);
      this.chunks = new Array(this.cx * this.cz);
      this.dirty = new Uint8Array(this.cx * this.cz).fill(1);
      this.maxY = new Uint8Array(w * d);
    }
    idx(x, y, z) { return (y * this.d + z) * this.w + x; }
    inside(x, y, z) { return x >= 0 && z >= 0 && y >= 0 && x < this.w && z < this.d && y < this.h; }
    get(x, y, z) { return this.inside(x, y, z) ? this.blocks[(y * this.d + z) * this.w + x] : 0; }
    set(x, y, z, b) {
      if (!this.inside(x, y, z)) return;
      const i = (y * this.d + z) * this.w + x;
      if (this.blocks[i] === b) return;
      this.blocks[i] = b;
      if (b) { if (y >= this.maxY[z * this.w + x]) this.maxY[z * this.w + x] = y + 1; }
      else if (y + 1 === this.maxY[z * this.w + x]) {
        let yy = y; while (yy > 0 && !this.blocks[(yy * this.d + z) * this.w + x]) yy--;
        this.maxY[z * this.w + x] = yy + 1;
      }
      this.markDirty(x, z);
    }
    solidAt(x, y, z) { const b = B[this.get(x | 0, y | 0, z | 0)]; return !!(b && b.solid); }
    liquidAt(x, y, z) { return this.get(x | 0, y | 0, z | 0) === WATER; }
    markDirty(x, z) {
      const c0x = Math.max(0, Math.floor((x - 1) / this.cs)), c1x = Math.min(this.cx - 1, Math.floor((x + 1) / this.cs));
      const c0z = Math.max(0, Math.floor((z - 1) / this.cs)), c1z = Math.min(this.cz - 1, Math.floor((z + 1) / this.cs));
      for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) this.dirty[cz * this.cx + cx] = 1;
    }
    anyDirty() {
      for (let ci = 0; ci < this.dirty.length; ci++) if (this.dirty[ci]) return true;
      return false;
    }
    /* Re-mesh the chunks a block edit flagged. The game calls this once per
       frame with a millisecond budget: picking a fruit must not stall the
       frame, so the geometry catches up over the next few frames instead
       (docs/en/07 s3.5, "no async meshing"). At least one chunk is always
       rebuilt, so a flagged chunk can never stay stale. */
    rebuildDirty(gl, budgetMs) {
      const t0 = performance.now();
      let n = 0;
      for (let ci = 0; ci < this.dirty.length; ci++) {
        if (!this.dirty[ci]) continue;
        this.buildChunk(gl, ci);
        n++;
        if (performance.now() - t0 > budgetMs) break;
      }
      return n;
    }
    topAt(x, z) { return this.maxY[z * this.w + x]; }
    /* One integer naming one block, used as a cache key. Mixed radix (x, z, y)
       over the world bounds, so two different blocks can never share a key --
       a decimal packing like x*10000 + y*100 + z collides as soon as an axis
       passes 99, and the highlight box would stick to the old block. */
    key(x, y, z) { return (x * this.d + z) * this.h + y; }

    /* ---- meshing ---- */
    buildChunk(gl, ci) {
      const cx = ci % this.cx, cz = (ci / this.cx) | 0;
      const x0 = cx * this.cs, z0 = cz * this.cs, y0 = 0, y1 = this.h;
      const op = new MB(), em = new MB(), wa = new MB(), mi = new MB(), miE = new MB();
      const blocks = this.blocks, W = this.w, D = this.d;
      const at = (x, y, z) => (x >= 0 && z >= 0 && y >= 0 && x < W && z < D && y < this.h) ? blocks[(y * D + z) * W + x] : 0;

      for (let y = y0; y < y1; y++) {
        for (let z = z0; z < z0 + this.cs; z++) {
          for (let x = x0; x < x0 + this.cs; x++) {
            const b = at(x, y, z);
            if (!b) continue;
            const bd = B[b];
            if (!bd) continue;
            if (bd.micro) {
              const tgt = bd.emis ? miE : mi;
              for (const m of bd.micro) {
                tgt.box(x + m[0], y + m[1], z + m[2], m[3], m[4], m[5], bd.c, false, 1);
              }
              continue;
            }
            if (bd.liquid) {
              // water surface / sides
              for (const f of FACES) {
                const nb = at(x + f.n[0], y + f.n[1], z + f.n[2]);
                if (nb === b) continue;
                if (B[nb] && B[nb].opaque) continue;
                const p = [];
                for (const c of f.c) p.push(x + c[0], y + c[1], z + c[2]);
                wa.quad(p, bd.c, f.s, false);
              }
              continue;
            }
            const col = bd.c, ct = bd.ct || col, cb = bd.cb || col;
            for (let fi = 0; fi < 6; fi++) {
              const f = FACES[fi];
              const nx = x + f.n[0], ny = y + f.n[1], nz = z + f.n[2];
              const nb = at(nx, ny, nz);
              const nbd = B[nb];
              if (nb && nbd && nbd.opaque) continue;           // occluded
              if (nb && nbd && !nbd.liquid && bd.id === nb) continue; // adjacent blocks of the same transparent kind (glass)
              const tgt = bd.emis ? em : op;
              // AO
              const sh = [];
              for (const c of f.c) {
                const cu = c[0] * f.u[0] + c[1] * f.u[1] + c[2] * f.u[2];
                const cv = c[0] * f.v[0] + c[1] * f.v[1] + c[2] * f.v[2];
                const su = cu ? 1 : -1, sv = cv ? 1 : -1;
                const o1 = [f.u[0] * su, f.u[1] * su, f.u[2] * su];
                const o2 = [f.v[0] * sv, f.v[1] * sv, f.v[2] * sv];
                const s1 = occ(at(nx + o1[0], ny + o1[1], nz + o1[2]));
                const s2 = occ(at(nx + o2[0], ny + o2[1], nz + o2[2]));
                const co = occ(at(nx + o1[0] + o2[0], ny + o1[1] + o2[1], nz + o1[2] + o2[2]));
                const lvl = s1 + s2 + ((s1 && s2) ? 1 : co ? 1 : 0);
                sh.push(f.s * AO_L[Math.min(3, lvl)]);
              }
              const faceCol = fi === 0 ? ct : (fi === 1 ? cb : col);
              const p = [];
              for (const c of f.c) p.push(x + c[0], y + c[1], z + c[2]);
              tgt.quadAO(p, faceCol, sh, !!bd.emis);
            }
          }
        }
      }
      function occ(b) { return b && B[b] && B[b].opaque ? 1 : 0; }

      const old = this.chunks[ci];
      if (old) for (const m of old) if (m) { gl.deleteBuffer(m.pos); gl.deleteBuffer(m.col); gl.deleteBuffer(m.dat); }
      const mk = (mb) => mb.empty() ? null : mb.upload(gl);
      this.chunks[ci] = [mk(op), mk(em), mk(wa), mk(mi), mk(miE)];
      this.dirty[ci] = 0;
      return this.chunks[ci];
    }

    /* ---- DDA raycast ---- */
    raycast(ox, oy, oz, dx, dy, dz, maxD) {
      let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
      const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
      const adx = Math.abs(dx), ady = Math.abs(dy), adz = Math.abs(dz);
      const ddx = adx < 1e-8 ? 1e9 : 1 / adx, ddy = ady < 1e-8 ? 1e9 : 1 / ady, ddz = adz < 1e-8 ? 1e9 : 1 / adz;
      let tmx = ddx * (sx > 0 ? (x + 1 - ox) : (ox - x));
      let tmy = ddy * (sy > 0 ? (y + 1 - oy) : (oy - y));
      let tmz = ddz * (sz > 0 ? (z + 1 - oz) : (oz - z));
      let t = 0, nx = 0, ny = 0, nz = 0;
      for (let i = 0; i < 256; i++) {
        const b = this.get(x, y, z);
        if (b && B[b] && (B[b].solid || B[b].micro)) return { x, y, z, nx, ny, nz, block: b, t };
        if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += ddx; nx = -sx; ny = 0; nz = 0; }
        else if (tmy < tmz) { y += sy; t = tmy; tmy += ddy; nx = 0; ny = -sy; nz = 0; }
        else { z += sz; t = tmz; tmz += ddz; nx = 0; ny = 0; nz = -sz; }
        if (t > maxD) return null;
      }
      return null;
    }
  }

  N.BLOCKS = B;
  N.AIR = AIR; N.WATER = WATER;
  N.BLOCK_ID = BLOCK_ID;
  N.FRUIT_BLOCK = FRUIT_BLOCK; N.FRUIT_BLOCK_REV = FRUIT_BLOCK_REV;
  N.PLANT_BLOCK = PLANT_BLOCK; N.PLANT_BLOCK_REV = PLANT_BLOCK_REV;
  N.World = World;

})(window.FRUTARIA = window.FRUTARIA || {});
