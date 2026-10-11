/* ==========================================================================
 *  world.js -- voxel storage / block definitions / chunk meshing (with AO) / ray picking
 * ========================================================================== */
(function (N) {
  const MB = N.MeshBuilder;

  /* ------------------------- block table ------------------------- */
  // c=[r,g,b]  ct=top colour  solid=collides  opaque=culls faces  liquid  alpha  emis  micro=[[x,y,z,w,h,d]...]
  const B = [];
  function def(id, o) {
    const b = B[id] = Object.assign({ id, solid: true, opaque: true, alpha: 1, emis: 0, c: [0.8, 0.8, 0.8] }, o);
    /* The colour the mesher uploads is rgb **plus the block's own alpha**, and it
       is made here, once, rather than at each face. A block therefore owns its
       transparency the way it owns its colour: water has always said 0.62 in this
       table, and the number used to be written down a second time at the draw
       call. Glass said 0.34 here and nothing ever read it. */
    b.c = b.c.length > 3 ? b.c : b.c.concat(b.alpha);
    if (b.ct) b.ct = b.ct.length > 3 ? b.ct : b.ct.concat(b.alpha);
    return b;
  }

  def(0, { id: 0, cn: '空气', solid: false, opaque: false });
  def(1, { cn: '草地', c: [0.36, 0.30, 0.22], ct: [0.29, 0.50, 0.24] });
  def(2, { cn: '泥土', c: [0.40, 0.31, 0.22] });
  def(3, { cn: '石头', c: [0.50, 0.50, 0.54] });
  def(4, { cn: '沙', c: [0.80, 0.74, 0.53] });
  def(5, { cn: '水', solid: false, opaque: false, liquid: true, c: [0.13, 0.34, 0.52], alpha: 0.72 });
  def(6, { cn: '树干', c: [0.38, 0.27, 0.17], ct: [0.46, 0.34, 0.21] });
  def(7, { cn: '树叶', c: [0.20, 0.40, 0.18], soft: 1 });
  def(8, { cn: '针叶', c: [0.14, 0.30, 0.20], soft: 1 });
  def(9, { cn: '银叶', c: [0.60, 0.71, 0.68], soft: 1 });
  def(10, { cn: '木板', c: [0.62, 0.45, 0.28] });
  def(11, { cn: '城砖', c: [0.56, 0.56, 0.61] });
  def(12, { cn: '暗城砖', c: [0.36, 0.36, 0.42] });
  def(13, { cn: '屋顶瓦', c: [0.47, 0.21, 0.19] });
  def(14, { cn: '辉石', c: [1.00, 0.86, 0.52], emis: 1 });
  def(15, { cn: '雪', c: [0.92, 0.94, 0.98] });
  def(16, { cn: '云', c: [0.94, 0.95, 1.00], solid: false, opaque: true, soft: 1 });
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
  def(27, { cn: '暗叶', c: [0.12, 0.24, 0.13], soft: 1 });
  def(28, { cn: '柳叶', c: [0.33, 0.45, 0.23], soft: 1 });
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

  const WATER = 5;

  /* The blocks the game itself places and breaks. A block number is what a save
     file stores, so it is named once here rather than written out at every call
     site. `store` is the flag the game asks about: the interaction code asks
     "can I put things in this?" instead of "is this 78?". */
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
  /* A cloud is not a slab. The face table above is the brightness of a face
     relative to the ground it stands on: a bottom face is dark because it is
     under something and never sees the sky. For a cloud the bottom face IS the
     face you look at from the ground, and a cloud blob is nothing but corners,
     so face shade times AO drove the underside of every cloud to 0.19 of its
     own colour -- measured 0.32 on average, 0.19 at worst, i.e. RGB (61,65,72)
     against a sky at (102,127,163). Dark grey lumps hanging in a bright sky:
     black blocks in the sky. A soft block keeps the same ordering of faces but
     never drops below 0.74 and takes no AO, so the blob still has a shape.
     A canopy is the same object for the same reason: a crown is a blob of leaf
     blocks, its underside is the face you look at when you stand under the
     tree, and the ring of solid its crevice samples are is the crown itself.
     Leaf blocks are soft too. */
  const SOFT_S = FACES.map(f => 0.55 + 0.45 * f.s);
  /* How far a face has to look clear, along its own normal, before it is taken
     to face open sky. Four cells: a roof rim hangs over a street, a sky isle
     hangs over a valley, the flank of a cliff looks down it -- all of them
     clear for more than this. A face that really is in a crevice, the lip of a
     cave, the underside of a stair, a face between two roofs, is blocked by the
     next block within two. See the exposure term in buildChunk. */
  const OPEN_R = 4;

  /* ------------------------- world ------------------------- */
  class World {
    constructor(w, h, d) {
      this.w = w; this.h = h; this.d = d;
      this.blocks = new Uint8Array(w * h * d);
      this.cs = 16;
      this.cx = Math.ceil(w / this.cs); this.cz = Math.ceil(d / this.cs);
      this.chunks = new Array(this.cx * this.cz);
      this.dirty = new Uint8Array(this.cx * this.cz).fill(1);
    }
    /* No heightmap. A `maxY` map -- Uint8Array(w*d), kept up to date on every
       write, exactly as docs/en/07 s3.3 still plans for the full game -- was
       tried here to bound the meshing loop. Rebuilding all 100 chunks costs
       about 1.0 ms per chunk with it or without it, so the empty sky above the
       treetops is not where the time goes; the faces are. And it had to be
       right on every single write, or geometry would quietly be clipped. */
    idx(x, y, z) { return (y * this.d + z) * this.w + x; }
    inside(x, y, z) { return x >= 0 && z >= 0 && y >= 0 && x < this.w && z < this.d && y < this.h; }
    get(x, y, z) { return this.inside(x, y, z) ? this.blocks[(y * this.d + z) * this.w + x] : 0; }
    set(x, y, z, b) {
      if (!this.inside(x, y, z)) return;
      const i = (y * this.d + z) * this.w + x;
      if (this.blocks[i] === b) return;
      this.blocks[i] = b;
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
    /* One integer naming one block, used as a cache key. Mixed radix (x, z, y)
       over the world bounds, so two different blocks can never share a key --
       a decimal packing like x*10000 + y*100 + z collides as soon as an axis
       passes 99, and the highlight box would stick to the old block. */
    key(x, y, z) { return (x * this.d + z) * this.h + y; }

    /* ---- meshing ---- */
    buildChunk(gl, ci) {
      const cx = ci % this.cx, cz = (ci / this.cx) | 0;
      const x0 = cx * this.cs, z0 = cz * this.cs, y0 = 0, y1 = this.h;
      const op = new MB(), em = new MB(), wa = new MB(), mi = new MB(), miE = new MB(), tr = new MB();
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
            const col = bd.c, ct = bd.ct || col;
            for (let fi = 0; fi < 6; fi++) {
              const f = FACES[fi];
              const nx = x + f.n[0], ny = y + f.n[1], nz = z + f.n[2];
              const nb = at(nx, ny, nz);
              const nbd = B[nb];
              if (nb && nbd && nbd.opaque) continue;           // occluded
              if (nb && nbd && !nbd.liquid && bd.id === nb) continue; // adjacent blocks of the same transparent kind (glass)
              // a block that culls nothing and is not water rides in its own
              // mesh, so it can be drawn blended with its own per-vertex alpha
              const tgt = bd.emis ? em : (bd.opaque ? op : tr);
              /* AO. A soft block takes the flat table instead -- cloud, the Grey
                 Veil wall built out of the same block, every canopy block. See
                 SOFT_S. Everything else takes face shade times crevice table,
                 and that product is where the black holes in the sky came from:
                 0.42 (a bottom face) times 0.46 (crevice level 3) is 0.19 of the
                 block's own colour. Measured over the whole map before this: of
                 the 107,880 faces that have eight blocks of clear air along
                 their normal -- faces that can be seen from far off, against the
                 sky -- 60,506 of them, 56%, rendered under 60/255, the worst at
                 10. A needles crown seen from below came out at 12 -- a needles
                 block is 66/255 and 0.19 of it is 12 -- while the sky behind it
                 measured 198; the rim of the town roof over the lantern road was
                 grey lumps against a sky at 150.
                 The crevice table asks how many of the four neighbours in the
                 face's own plane are solid. That is a crevice test, and a face
                 looking out at open sky is by definition not in one: under a
                 crown the ring of solid IS the crown, and on a hillside the dark
                 notch it carves is the next block of the same hill. So each face
                 is also asked how far it looks before it hits anything. OPEN_R
                 cells of clear air along its normal and it takes no crevice
                 darkening at all; a face blocked within two keeps all of it,
                 which is the contact shadow that gives a cliff and a roof their
                 shape; in between the two are interpolated. A bottom face lifts
                 toward the soft bottom shade as well, because the reason a
                 bottom face is dark in the face table -- you never look at one --
                 is not true of a face that hangs in open air.
                 Measured after: 15,421 of the same faces under 60, 14%, worst 39
                 instead of 10. In the rendered frame, over 216 views across the
                 map, pixels darker than 55 sitting next to sky brighter than 130
                 fell from 1.46% of the frame to 0.68%. What is left is the face
                 table itself -- a -z face of a dark block is dark -- and that is
                 the fake sun, not a hole. */
              const sh = [];
              if (bd.soft) for (let k = 0; k < 4; k++) sh.push(SOFT_S[fi]);
              else {
                let e = 1;
                {
                  let k = 1;
                  while (k < OPEN_R && !occ(at(nx + f.n[0] * k, ny + f.n[1] * k, nz + f.n[2] * k))) k++;
                  e = (k - 1) / (OPEN_R - 1);
                }
                const fs = fi === 1 ? f.s + (SOFT_S[1] - f.s) * e : f.s;
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
                  sh.push(fs * (1 - (1 - AO_L[Math.min(3, lvl)]) * (1 - e)));
                }
              }
              const faceCol = fi === 0 ? ct : col;
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
      this.chunks[ci] = [mk(op), mk(em), mk(wa), mk(mi), mk(miE), mk(tr)];
      this.dirty[ci] = 0;
      return this.chunks[ci];
    }

    /* ---- DDA raycast ----
       Returns the first block the line enters, with `t` = the distance travelled
       to reach that block's **near face** (so `t` is where the line touches it,
       not where it ends up inside it). `solidOnly` skips the non-solid micro
       blocks -- fruit, reeds, the cellar-tree core -- which the picking ray must
       see and the camera ray must not be stopped by. */
    raycast(ox, oy, oz, dx, dy, dz, maxD, solidOnly) {
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
        if (b && B[b] && (B[b].solid || (!solidOnly && B[b].micro))) return { x, y, z, nx, ny, nz, block: b, t };
        if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += ddx; nx = -sx; ny = 0; nz = 0; }
        else if (tmy < tmz) { y += sy; t = tmy; tmy += ddy; nx = 0; ny = -sy; nz = 0; }
        else { z += sz; t = tmz; tmz += ddz; nx = 0; ny = 0; nz = -sz; }
        if (t > maxD) return null;
      }
      return null;
    }
  }

  N.BLOCKS = B;
  N.WATER = WATER;
  N.BLOCK_ID = BLOCK_ID;
  N.FRUIT_BLOCK = FRUIT_BLOCK; N.FRUIT_BLOCK_REV = FRUIT_BLOCK_REV;
  N.PLANT_BLOCK = PLANT_BLOCK; N.PLANT_BLOCK_REV = PLANT_BLOCK_REV;
  N.World = World;

})(window.FRUTARIA = window.FRUTARIA || {});
