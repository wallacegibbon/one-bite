/* ==========================================================================
 *  world.js -- voxel storage / block definitions / chunk meshing (with AO) / ray picking
 * ========================================================================== */
(function (N) {
  const MB = N.MeshBuilder;

  /* ------------------------- block table ------------------------- */
  // c=[r,g,b]  ct=top colour  solid=collides  opaque=culls faces  liquid  alpha  emis  micro=[[x,y,z,w,h,d]...]
  // fogC/fogT/fogDen/fogEmis: what a lens sitting inside this block sees -- see liquidFogAt()
  const B = [];
  function def(id, o) {
    const b = B[id] = Object.assign({ id, solid: true, opaque: true, alpha: 1, emis: 0, c: [0.8, 0.8, 0.8] }, o);
    /* The colour the mesher uploads is rgb **plus the block's own alpha**, and it
       is made here, once, rather than at each face. A block therefore owns its
       transparency the way it owns its colour. Water no longer states one: its
       transparency is a law over the depth of water a face has under it, so a
       number written in this row would be a second answer to a question the
       shader already answers -- and the one that used to be here, 0.72, was a
       second answer that disagreed with the first by 48 luminance. Glass still
       says 0.34, and glass really is a sheet of a fixed tint. */
    b.c = b.c.length > 3 ? b.c : b.c.concat(b.alpha);
    if (b.ct) b.ct = b.ct.length > 3 ? b.ct : b.ct.concat(b.alpha);
    return b;
  }

  def(0, { id: 0, cn: '空气', solid: false, opaque: false });
  def(1, { cn: '草地', c: [0.36, 0.30, 0.22], ct: [0.29, 0.50, 0.24] });
  def(2, { cn: '泥土', c: [0.40, 0.31, 0.22] });
  def(3, { cn: '石头', c: [0.50, 0.50, 0.54] });
  def(4, { cn: '沙', c: [0.80, 0.74, 0.53] });
  def(5, { cn: '水', solid: false, opaque: false, liquid: true, c: [0.13, 0.34, 0.52],
           fogC: [0.06, 0.24, 0.32], fogT: 0.85,
           /* How much of a light's own glow this stuff lets through at full
              haze. Air lets through 0.75, which is what makes a lantern across
              the valley still read as a lantern; the same 0.75 inside the lake
              put a lanternfish 3.6 m away back at luminance 246 -- a sun
              sitting on the lakebed. A lamp under water is a lamp seen through
              water, so the water gets to say how much of it survives. */
           fogEmis: 0.15,
           /* How fast this stuff eats daylight, per metre, colour by colour.
              Red goes about nine times faster than blue, which is the whole
              reason a lake floor two metres down is teal and not pale sand.
              This one number answers every journey light makes through water,
              and that is the point of writing it once. The sunlight coming down
              to a surface is baked into that surface's vertices; the light
              coming back from that surface to a lens over it is asked of the
              surface itself, in the vertex shader; the light coming from a
              surface to a lens that is already inside the water is the haze. One
              law, three journeys, and the lake is the same water from either
              side of its skin.
              There used to be three unlinked answers instead. `fogDen` 0.14 was
              a haze density on the air's squared-exponential law, and it barely
              ate the red at the range a lakebed is at; `alpha` 0.72 was painted
              flat over every face of the surface, and only when the lens was
              above the water line. At two metres of water the three disagreed by
              48 luminance, which is the whole of "the lake is a different water
              seen from the top than from the bottom".
              How fast these numbers eat is a decision about how clear this lake
              is, and it was made twice. The first pass put in clear-water
              numbers -- 0.16 per metre for the green the eye reads brightest --
              which is a mountain tarn, and the frame showed the bottom of a
              lake 6 m down as a set of blocks you could count, mean luminance
              62 with 3.2 of spread across the patch against the water's own 49.
              The report said the lakebed was far too easy to see from outside
              the water, and a lake with something living in it does not look
              like that. Green at 0.4 per metre puts this lake's own visibility
              near 2.5 m, and the same bed 6 m down comes back at 48.5 with 0.5
              of spread, which is the water and not the bed; a bed 3 m down keeps
              2.8 of its spread where it kept 5.8, and a bed a metre down is
              still the sand you are standing on. The ratio between the colours
              is the one this row has always had, because that ratio is why the
              floor is teal and not grey -- only how fast the whole thing happens
              was the part that was wrong. */
           fogK: [1.40, 0.40, 0.15] });
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
    const emis = (p.id === 'cellarseed') ? 1 : 0;
    const c = p.id === 'cellarseed' ? [0.85, 0.75, 0.4] : [0.8, 0.6, 0.4];
    def(id, {
      cn: p.cn, solid: false, opaque: false, emis, c,
      micro: [[0.42, 0.0, 0.42, 0.16, 0.34, 0.16], [0.26, 0.32, 0.26, 0.48, 0.22, 0.48]]
    });
    PLANT_BLOCK[id] = p.id; PLANT_BLOCK_REV[p.id] = id;
  });

  /* Kelp is a plant, not a lamp: it takes the light that comes down through the
     lake and gives back what is left of it, which is the whole reason the bed it
     stands on reads teal. It used to state `emis: 1` -- copied from the glowcap
     ring on the line below -- and nothing ever showed, because the kelp that
     would have drawn it was never placed. With the lakebed growing it again the
     flag showed at last: in a noon frame taken from a metre above the surface
     of Mirrorlake, taking the emissive mesh out took 574 pixels with it and
     taking the ordinary micro mesh out took none -- that is how the lit stalks
     were found. The flag is gone now, and the law reads the stalks from under
     the surface, the lens 1.2 m over the top of the stem of the stalk nearest
     the water seven metres deep: a lens just above the water sees no stalk at
     all any more, because the cull that removed the flat water panes backing
     them took the stalks' last sliver of contrast through seven metres of
     lake. There the emissive mesh takes 0 pixels out of the noon frame and the
     ordinary micro mesh 3,549 -- largest difference 4.9, against a bound of
     200 -- which is the stalks, and it is the lake that lights them. The
     glowcap ring glows because that is what it is; this is grass under water. */
  def(75, { cn: '水草', solid: false, opaque: false, c: [0.3, 0.75, 0.55], micro: [[0.4, 0.0, 0.4, 0.2, 0.9, 0.2], [0.25, 0.2, 0.5, 0.16, 0.5, 0.16]] });
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

  /* The blocks a tree is made of: the trunk and the crown. They are solid -- a
     body can climb a tree and stand on it -- but they are not the surface of
     the valley, and anything that asks "where is the ground" has to say which
     of the two it means. The generator kept this list to itself, to plant trees
     with; it lives beside the block table now so the generator and the animals
     read one list. */
  const TREE_BLOCK = { 6: 1, 7: 1, 8: 1, 9: 1, 22: 1, 27: 1, 28: 1 };

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
     tree, and the ring of solid its crevice samples is the crown itself.
     Leaf blocks are soft too. */
  const SOFT_S = FACES.map(f => 0.55 + 0.45 * f.s);
  /* How far a face has to look clear, along its own normal, before it is taken
     to face open sky. Four cells: a roof rim hangs over a street, the keep's
     floating isle hangs over the valley, the flank of a cliff looks down it --
     all of them clear for more than this. A face that really is in a crevice,
     the lip of a cave, the underside of a stair, a face between two roofs, is
     blocked by the next block within two. See the exposure term in buildChunk. */
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
       write, exactly as docs/07 s3.3 still plans for the full game -- was
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
    /* The haze a lens takes on when it is sitting inside a liquid. It lives on
       the block row because it is the same fact as that block's colour and
       transparency: what the stuff is made of. It used to be written a second
       time in the environment code, which is how a second liquid (a swamp, a
       lava) would have needed the environment edited rather than a row here.
       Two of the fields are laws, and a liquid picks one. `den` is the air's:
       one scalar weight towards one colour, nothing in the first metre and
       everything at a hundred. `k` is a liquid's: per colour, per metre, and
       it starts eating the red in the first metre. A row that states `k`
       replaces the air's haze with its own; a row that states only `den` keeps
       the air's shape. Water states `k`, because a lake that hazes the same way
       air does has a near lakebed the colour of dry sand. */
    liquidFogAt(x, y, z) {
      const b = B[this.get(x | 0, y | 0, z | 0)];
      return b && b.liquid && b.fogC ? { c: b.fogC, t: b.fogT, den: b.fogDen, emis: b.fogEmis, k: b.fogK } : null;
    }
    /* The colour a liquid scatters into the line of sight once the haze has
       taken all it can take. The same fact the haze is made of, and the colour
       the water's own surface adds to whatever lies behind it -- which is why
       there is one of them and not one for the haze and one for the surface. */
    liquidVeil() { const b = B[WATER]; return (b && b.fogC) || [0, 0, 0]; }
    /* How much of each colour of daylight a metre of the valley's liquid eats.
       The depth each surface sits under is baked into its vertices when the
       mesh is built, so the renderer needs the coefficient once for the frame
       rather than per lens, and it is the same fact as the block's own colour:
       what the stuff is made of. There is one liquid in the valley; a second
       one would need its coefficient baked alongside the depth, not read here. */
    liquidAbsorb() { const b = B[WATER]; return (b && b.fogK) || [0, 0, 0]; }
    /* The height of the surface of the liquid a lens is sitting in: the top of
       the liquid column it is inside. The renderer needs it because the light
       reaching a surface under water has come down through that much water,
       and how much that is a property of the surface being lit -- the lakebed
       six metres down, not the lens -- rather than of the lens. */
    liquidTopAt(x, y, z) {
      let top = y | 0;
      for (let k = 0; k < this.h; k++) {
        const b = B[this.get(x, top + 1, z)];
        if (!b || !b.liquid) break;
        top++;
      }
      return top + 1;
    }
    /* The height of the surface of the liquid in a column, whether or not the
       thing asking is standing in it: the top face of the topmost liquid block,
       and -1 where the column holds none -- the same answer for "no water" the
       cell reading gives, so the two conventions cannot disagree about whether a
       column is in the lake at all. The static world carries its own depth in
       with it (see liquidAbsorb), but anything built fresh each frame -- a body,
       a fruit dropped on the lakebed -- has to be told how far under the water
       it stands, and that is a fact about the place it is in rather than about
       the lens looking at it. `liquidTopAt` answers the other question: the
       surface of the column a lens is *inside*, which is what the haze and the
       absorption of the frame itself are keyed to. */
    liquidSurfaceAt(x, z) {
      for (let y = this.h - 1; y >= 0; y--) if (this.liquidAt(x, y, z)) return y + 1;
      return -1;
    }
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
       (docs/07 s3.5, "no async meshing"). At least one chunk is always
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
    /* One integer naming one block. Mixed radix (x, z, y) over the world bounds,
       so two different blocks can never share a key -- a decimal packing like
       x*10000 + y*100 + z collides as soon as an axis passes 99. The highlight
       box no longer needs one: it is built once around the origin and aimed at
       the block through the model matrix. The tests still hold the name to the
       rule, because anything that ever needs it should get one block back. */
    key(x, y, z) { return (x * this.d + z) * this.h + y; }

    /* ---- meshing ---- */
    buildChunk(gl, ci) {
      const cx = ci % this.cx, cz = (ci / this.cx) | 0;
      const x0 = cx * this.cs, z0 = cz * this.cs, y0 = 0, y1 = this.h;
      const blocks = this.blocks, W = this.w, D = this.d;
      const at = (x, y, z) => (x >= 0 && z >= 0 && y >= 0 && x < W && z < D && y < this.h) ? blocks[(y * D + z) * W + x] : 0;
      /* How deep the water above a point is, baked into the vertices of the
         static world. The light reaching a surface under water has come down
         through that much of it, which is a fact about the surface being lit
         and not about the lens looking at it: handed to the shader as one
         plane for the whole frame, the whole term switched off the moment the
         lens came up for air, and a lens 25 cm above Mirrorlake looking down
         at a bed 6 m below it saw dry sand (mean luminance 149.5, warmer than
         red by 16.7) where the same lens a metre under the surface saw water
         (76, bluer than red by 75.6).
         One run of liquid per column -- the height of its surface and its
         lowest cell -- and a vertex takes the deepest water of the five
         columns it stands on (its own and the four it shares a face with),
         which is what lets the submerged face of a rock in the lake read as
         submerged while the ceiling of a cave under the lakebed does not.
         This is the answer for the faces that are not themselves against
         water: the water's own faces, the micro boxes, and the faces that
         look out at air, glass or a plant. A face the mesher can see is under
         water hands the surface height in instead, because at a corner that
         stands inside the solid next door this question answers "dry".
         The runs are looked for up front rather than on demand -- over the
         chunk's own columns plus a ring of one, which is as far as the
         question ever reaches -- and kept in two small typed arrays instead of
         a Map of objects. These are the same columns the lazy walk ended up
         visiting anyway: every face vertex asks for its own column and the four
         it shares a face with, so a chunk with terrain in it asks for the whole
         ring. What the table gives back is a lookup with no hashing, no object
         and no second chance at the 48-level walk, and, when the ring holds no
         water at all, no question: the builders are handed no `under` at all.
         Only 18 of the valley's 100 chunks hold water, and the 82 that do not
         were paying five Map lookups for every one of their vertices to be told
         nothing. Measured over all 100 chunks before: a build cost 4.11 ms on
         average, 15.6 ms in the worst, and picking one fruit in that worst chunk
         cost 21.8 ms of frame. */
      const RW = this.cs + 3, RX = x0 - 1, RZ = z0 - 1;
      const wTop = new Int16Array(RW * RW), wBot = new Int16Array(RW * RW);
      wTop.fill(-1); wBot.fill(-1);
      let wet = 0;
      for (let z = RZ; z < RZ + RW; z++) {
        if (z < 0 || z >= D) continue;
        for (let x = RX; x < RX + RW; x++) {
          if (x < 0 || x >= W) continue;
          let top = -1, bot = -1;
          for (let y = this.h - 1; y >= 0; y--) {
            const bd = B[blocks[(y * D + z) * W + x]];
            if (bd && bd.liquid) { if (top < 0) top = y; }
            else if (top >= 0) { bot = y + 1; break; }
          }
          if (top >= 0) {
            const k = (z - RZ) * RW + (x - RX);
            wTop[k] = top + 1; wBot[k] = bot; wet++;
          }
        }
      }
      /* A vertex of this chunk's blocks stands on a column line between x0 and
         x0+cs, and the question steps one column further out, which is exactly
         the ring RW covers -- so the five columns are always inside the table,
         and a step off its edge can only land on a column outside the map,
         which answers dry. A micro box corner is not on a column line at all:
         a stem half a block across stands **inside** one, so the column it
         stands in answers, and the four round it are the same four. It used to
         answer dry -- which cost nothing while nothing micro stood in water,
         and costs the lake its whole bed the day the kelp starts growing: 62
         stalks came back lit by full noon, because the one vertex question the
         lake answers skipped every one of their corners. */
      const under = wet ? (x, y, z) => {
        const k = ((z | 0) - RZ) * RW + ((x | 0) - RX);
        let best = 0;
        for (let i = 0; i < 5; i++) {
          const j = k + (i === 1 ? 1 : i === 2 ? -1 : 0) + (i === 3 ? RW : i === 4 ? -RW : 0);
          const t = wTop[j];
          if (t >= 0 && y >= wBot[j] && y < t) { const d = t - y; if (d > best) best = d; }
        }
        return best;
      } : null;
      const op = new MB(under), em = new MB(under), wa = new MB(under), mi = new MB(under),
        miE = new MB(under), tr = new MB(under);

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
                /* A face against a micro cell is water against water with
                   something small in it: the cell holds a thin stem or a
                   berry, and the water passes through it. Drawn, each such
                   face is a flat 1 m pane afloat in the column -- the lake
                   carries 243 of them round its kelp (181 vertical, at
                   y6-y13), and a lens under water reads them as a field of
                   flat blue squares at various depths over the bed, which
                   the user saw and asked about. Measured: with the faces
                   culled the squares are gone, and with them restored the
                   frame is back pixel for pixel (8,135 px between the two).
                   The micro box itself is drawn by its own branch above and
                   wants no face of its own. */
                if (B[nb] && B[nb].micro) continue;
                const p = [];
                for (const c of f.c) p.push(x + c[0], y + c[1], z + c[2]);
                /* Which way this face points: the top face of a column faces
                   straight up, and the ones that can stand round its edge are
                   vertical. That is all the mesh has to say about the water --
                   how far the light has come up through it is a fact about the
                   surface being looked at, which the mesher already baked into
                   that surface, and how far through it the lens is looking is a
                   fact about the lens -- but a horizontal face and a vertical
                   one are looked at along themselves very differently, and that
                   is what decides how much of the view they throw back. */
                wa.quad(p, bd.c, f.s, false, f.n[1] === 1 ? 1 : 0);
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
              /* The water this face stands under, asked of the face rather than
                 of the point the depth is measured at. A corner of a submerged
                 face can sit inside the solid next door, where no water column
                 reaches down to it, and the point question then answers "dry":
                 852 of the 7,528 faces this mesher puts against water had at
                 least one corner handed no depth at all, and the base of every
                 step, pillar and sunken wall in Mirrorlake lit up the colour of
                 dry sand -- a bright triangle at the foot of each one, brightest
                 exactly where the water is deepest. */
              let surf;
              if (nbd && nbd.liquid) {
                // the neighbour of a block of this chunk is always one of the
                // columns the ring above walked, so this is a read, not a search
                const t = wTop[(nz - RZ) * RW + (nx - RX)];
                if (t >= 0) surf = t;
              }
              tgt.quadAO(p, faceCol, sh, !!bd.emis, 0, surf);
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
  N.TREE_BLOCK = TREE_BLOCK;
  /* Which blocks a body on foot does not stop against: the material the mesher
     already calls `soft` and that is still solid -- leaves, needles, silver
     leaves, dark leaves, willow. (Cloud is soft too and is not solid at all, so
     it never comes up here.) The standing gate of a walking body -- a wild one
     or the one the player wears -- asks this table, so a frog can stand in a
     crown and hop through a bush while a trunk stays a wall and a roof: a trunk
     (6) is not soft, so it stays solid to the body, and that body still climbs a
     tree and stands on the crown it grew. This is deliberately NOT TREE_BLOCK,
     which answers another question: which blocks are not the surface of the
     valley. The table is the material, not the animal. */
  const FOLIAGE = {};
  for (let id = 0; id < B.length; id++) if (B[id] && B[id].soft && B[id].solid) FOLIAGE[id] = 1;
  N.FOLIAGE = FOLIAGE;
  N.FRUIT_BLOCK = FRUIT_BLOCK; N.FRUIT_BLOCK_REV = FRUIT_BLOCK_REV;
  N.PLANT_BLOCK = PLANT_BLOCK; N.PLANT_BLOCK_REV = PLANT_BLOCK_REV;
  N.World = World;

})(window.FRUTARIA = window.FRUTARIA || {});
