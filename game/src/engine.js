/* ==========================================================================
 *  engine.js -- in-house voxel renderer (WebGL1, zero dependencies)
 *  - chunk meshing + face culling + frustum culling
 *  - vertex colour + baked face lighting/AO + emissive layer + water + particles + procedural sky
 * ========================================================================== */
(function (N) {

  /* ------------------------------ mat4 ------------------------------ */
  const M4 = {
    create() { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },
    ident(o) { o.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); return o; },
    persp(o, fovy, a, n, f) {
      const t = 1 / Math.tan(fovy / 2);
      o[0] = t / a; o[1] = 0; o[2] = 0; o[3] = 0;
      o[4] = 0; o[5] = t; o[6] = 0; o[7] = 0;
      o[8] = 0; o[9] = 0; o[10] = (f + n) / (n - f); o[11] = -1;
      o[12] = 0; o[13] = 0; o[14] = (2 * f * n) / (n - f); o[15] = 0;
      return o;
    },
    mul(o, a, b) {
      if (o === b) { tmp16.set(b); b = tmp16; }
      for (let i = 0; i < 4; i++) {
        const ai0 = a[i], ai1 = a[i + 4], ai2 = a[i + 8], ai3 = a[i + 12];
        o[i] = ai0 * b[0] + ai1 * b[1] + ai2 * b[2] + ai3 * b[3];
        o[i + 4] = ai0 * b[4] + ai1 * b[5] + ai2 * b[6] + ai3 * b[7];
        o[i + 8] = ai0 * b[8] + ai1 * b[9] + ai2 * b[10] + ai3 * b[11];
        o[i + 12] = ai0 * b[12] + ai1 * b[13] + ai2 * b[14] + ai3 * b[15];
      }
      return o;
    },
    lookYaw(o, ex, ey, ez, yaw, pitch) {
      // view matrix: rotate about Y (yaw), then X (pitch), then translate
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      // camera basis vectors (world space)
      const fx = sy * cp, fy = sp, fz = -cy * cp;      // forward
      const rx = cy, ry = 0, rz = sy;                   // right
      const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx; // derive up = u x f
      // view matrix = R^T * T(-e)
      o[0] = rx; o[1] = ux; o[2] = -fx; o[3] = 0;
      o[4] = ry; o[5] = uy; o[6] = -fy; o[7] = 0;
      o[8] = rz; o[9] = uz; o[10] = -fz; o[11] = 0;
      o[12] = -(rx * ex + ry * ey + rz * ez);
      o[13] = -(ux * ex + uy * ey + uz * ez);
      o[14] = (fx * ex + fy * ey + fz * ez);
      o[15] = 1;
      return o;
    },
    trans(o, x, y, z) { M4.ident(o); o[12] = x; o[13] = y; o[14] = z; return o; },
    scale(o, x, y, z) { M4.ident(o); o[0] = x; o[5] = y; o[10] = z; return o; },
    rotY(o, a) {
      const c = Math.cos(a), s = Math.sin(a);
      M4.ident(o); o[0] = c; o[2] = -s; o[8] = s; o[10] = c; return o;
    },
    rotX(o, a) { const c = Math.cos(a), s = Math.sin(a); M4.ident(o); o[5] = c; o[6] = s; o[9] = -s; o[10] = c; return o; },
    /* The one rotation that turns a model to a heading. Models are authored
       facing +Z (the human's eyes and nose sit at +Z, its hair at -Z), while a
       heading of `yaw` means the direction (sin yaw, -cos yaw): yaw 0 is north
       (-Z) and yaw grows toward +X. The angle that carries +Z onto that
       direction is PI - yaw. Writing `yaw + PI` -- which every call site used
       to do -- is right only when heading exactly north or exactly south, and
       mirrors the body about the Z axis everywhere else: walk east and the
       character walks backwards, seen from behind as a face. */
    faceY(o, yaw) { return M4.rotY(o, Math.PI - yaw); },
    rotZ(o, a) { const c = Math.cos(a), s = Math.sin(a); M4.ident(o); o[0] = c; o[1] = s; o[4] = -s; o[5] = c; return o; }
  };
  const tmp16 = new Float32Array(16);

  /* ------------------------------ GL helpers ------------------------------ */
  function sh(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error('shader: ' + gl.getShaderInfoLog(s) + '\n' + src.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n'));
    return s;
  }
  function prog(gl, vs, fs, attrs) {
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
    const o = { p, u: {}, a: {} };
    for (const an of attrs) o.a[an] = gl.getAttribLocation(p, an);
    return o;
  }

  /* ------------------------------ mesh building ------------------------------ */
  class MeshBuilder {
    /* `under`, when given, answers how many metres a point of the world sits
       under the surface of the water above it, and 0 where there is none. The
       light reaching a surface under water has come down through that much of
       it, which is a fact about the surface being lit and not about the lens
       looking at it, so the static world has its depth baked into its vertices
       at mesh time instead of being handed one plane for the whole frame.
       A face the mesher knows stands under water hands the surface height in
       directly instead (see `surf` below), because the point question gets that
       one wrong. */
    constructor(under) { this.pos = []; this.col = []; this.dat = []; this.n = 0; this.under = under || null; }
    /* one vertex: position, colour [r,g,b], shade (0..1 brightness*AO), emis (0/1),
       and the depth under water in 1/8 m steps (capped at 32 m, which is far
       past where the lake's own haze has taken everything). The depth is
       interpolated between vertices and turned into absorption per fragment,
       so the step is never a band: the gradient across a block face is smooth.
       `surf`, when the caller hands one, is the height of the surface of the
       water this face stands under, and the depth is that less the vertex's own
       height. It is asked of the face rather than of the point because a corner
       of a submerged face can stand inside the solid next door, where no water
       reaches down: measured that way the far corner of a lakebed step came
       back with no water over it at all, and the base of every step in
       Mirrorlake lit up the colour of dry sand.
       Two more bytes ride along for the water's own face, and every other mesh
       carries zeros in them: `top`, 1 when this face is the top face of its
       column and 0 when it is one of the four that can appear round its edge.
       That says which way the face is pointing, which is what decides how much
       of the view it throws back at the lens instead of letting through. */
    v(x, y, z, c, shade, emis, top, surf) {
      this.pos.push(x, y, z);
      this.col.push((c[0] * 255) | 0, (c[1] * 255) | 0, (c[2] * 255) | 0, c.length > 3 ? (c[3] * 255) | 0 : 255);
      this.dat.push((Math.min(1, shade) * 255) | 0, emis ? 255 : 0,
        Math.min(255, ((surf !== undefined ? Math.max(0, surf - y)
          : (this.under ? this.under(x, y, z) : 0)) * 8) | 0), top ? 255 : 0);
      this.n++;
    }
    /* quad: 4 points */
    quad(p, c, shade, emis, top, surf) {
      this.v(p[0], p[1], p[2], c, shade, emis, top, surf);
      this.v(p[3], p[4], p[5], c, shade, emis, top, surf);
      this.v(p[6], p[7], p[8], c, shade, emis, top, surf);
      this.v(p[0], p[1], p[2], c, shade, emis, top, surf);
      this.v(p[6], p[7], p[8], c, shade, emis, top, surf);
      this.v(p[9], p[10], p[11], c, shade, emis, top, surf);
    }
    /* quad with per-vertex AO */
    quadAO(p, c, sh, emis, top, surf) {
      const put = (i) => this.v(p[i * 3], p[i * 3 + 1], p[i * 3 + 2], c, sh[i], emis, top, surf);
      put(0); put(1); put(2); put(0); put(2); put(3);
    }
    box(x, y, z, w, h, d, c, emis, ao) {
      const s = ao === undefined ? 1 : ao;
      const x1 = x + w, y1 = y + h, z1 = z + d;
      // +Y
      this.quad([x, y1, z, x1, y1, z, x1, y1, z1, x, y1, z1], c, 1.0 * s, emis);
      // -Y
      this.quad([x, y, z1, x1, y, z1, x1, y, z, x, y, z], c, 0.42 * s, emis);
      // +X
      this.quad([x1, y, z, x1, y, z1, x1, y1, z1, x1, y1, z], c, 0.78 * s, emis);
      // -X
      this.quad([x, y, z1, x, y, z, x, y1, z, x, y1, z1], c, 0.66 * s, emis);
      // +Z
      this.quad([x1, y, z1, x, y, z1, x, y1, z1, x1, y1, z1], c, 0.88 * s, emis);
      // -Z
      this.quad([x, y, z, x1, y, z, x1, y1, z, x, y1, z], c, 0.58 * s, emis);
    }
    empty() { return this.n === 0; }
    upload(gl) {
      const m = {
        pos: gl.createBuffer(), col: gl.createBuffer(), dat: gl.createBuffer(), count: this.n
      };
      gl.bindBuffer(gl.ARRAY_BUFFER, m.pos);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.pos), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, m.col);
      gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(this.col), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, m.dat);
      gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(this.dat), gl.STATIC_DRAW);
      return m;
    }
  }

  /* ------------------------------ shaders ------------------------------ */
  const VS_WORLD = `
  precision highp float;
  attribute vec3 aPos; attribute vec4 aCol; attribute vec2 aData; attribute float aUnder;
  attribute float aTop;
  uniform mat4 uProj, uView, uModel;
  uniform float uFogDen, uDay, uTime, uWave, uEmisBoost, uEmisKeep;
  uniform float uWaterY;
  uniform vec3 uAmb, uWaterK, uLiqK;
  /* The colour a body of this liquid paints over a view. Read here (the water
     the light climbs out of) and in the fragment shader (the water the surface
     mirrors back), so its precision has to be spelled out: the default here is
     highp and the default there is mediump, and a uniform declared at two
     precisions will not link at all. */
  uniform mediump vec3 uVeil;
  uniform vec3 uHazeK;      // per metre, per colour: what the liquid the lens sits in eats
  uniform float uHazeOn;    // 1 when that haze replaces the air's, 0 in air
  uniform float uInWater;   // 1 when the lens is inside a liquid at all
  uniform vec3 uCamPos;     // the lens, in world space: the pane needs the direction it is looked at from
  varying vec4 vCol; varying vec3 vFog; varying vec3 vEye; varying vec3 vPan;
  void main(){
    vec4 wp = uModel * vec4(aPos, 1.0);
    if (uWave > 0.5) wp.y += sin(uTime*1.7 + wp.x*0.9 + wp.z*0.7)*0.055 + sin(uTime*0.6 + wp.z*0.25)*0.03;
    vec4 vp = uView * wp;
    gl_Position = uProj * vp;
    float d = length(vp.xyz);
    float emis = aData.y;
    // The haze has two laws, because the stuff a lens looks through is not one
    // thing. Air scatters: nothing happens in the first metre and everything at
    // a hundred, which is the squared-exponential curve of aerial perspective.
    // Water absorbs, and it starts eating the red from the first metre -- and
    // it eats the three colours at three very different rates, which is why a
    // lake 3 m deep is teal and one 9 m deep is blue and neither is grey. One
    // scalar weight can only grey a frame towards one colour, and that is how
    // the near lakebed kept the colour of dry sand: at 0.14 per metre the old
    // haze over a metre and three quarters of water is 6%.
    // In air uHazeOn is 0 and the second term is not evaluated at all, so a dry
    // frame is bit for bit what it was.
    float fog = 1.0 - exp(-uFogDen*uFogDen*d*d);
    vFog = mix(vec3(fog), 1.0 - exp(-uHazeK * d), uHazeOn) * (1.0 - emis*uEmisKeep);
    float lit = mix(max(uDay, 0.10), 1.25 + uEmisBoost, emis);
    // aCol is uploaded with normalized=TRUE, so aCol.a is already 0..1: dividing
    // it by 255 again made every blended surface 0.4% opaque, and the lake had no
    // colour at all until your head went under and the fog did the colouring
    //
    // uAmb is the sky's own light, added rather than multiplied. The dark of a
    // night is not a grey: the only light a night has is the sky, and a surface
    // lit by nothing else has to keep the sky's colour and stay near the sky's
    // own brightness. Multiplied by the night's 16% a dark material -- conifer,
    // dark leaf, roof tile -- lands at luminance 7..10 while the night sky
    // behind it is 17..21, so a tree or a roof reads as a hole cut in the sky.
    // An additive term fixes that where it matters: it lifts a dark surface by
    // most of its own value and a bright one by hardly anything.
    //
    // uEmisKeep is how much of a light's own glow the haze lets through. Air
    // says 0.75 -- a lantern across the valley is still a lantern -- and that
    // is far too much for five metres of lake: measured from 9 m away inside
    // Mirrorlake, a lamp jellyfish came back at luminance 197, the same bright
    // dot it is at 100 m through air. The stuff a light is seen through is a
    // fact about that stuff, so the number lives on the block row.
    //
    // A surface under water is lit by light that has travelled through the
    // water above it -- the red goes first, and what is left is the colour of
    // the stuff it travelled through -- so a surface's own depth under that
    // surface decides how much light reaches it. That is why the underside of
    // the surface, at depth zero, stays bright while the lakebed six metres
    // down does not. Without it the near lakebed keeps its dry sand colour:
    // measured looking down from just under the surface, the frame was warmer
    // than red (blue-minus-red -16.7) and brighter (mean 137) than looking
    // *up* at the sunlit surface (mean 90) -- the bottom of a lake brighter
    // than its own sunlit skin, which is the whole of "the water looks wrong
    // down there".
    //
    // There are two depths, because there are two kinds of thing in the frame.
    // aUnder is the baked one: how far under the surface of its own water each
    // vertex of the static world sits, measured column by column when the mesh
    // was built, in 1/8 m steps; uLiqK is the liquid's own absorption per
    // metre, colour by colour, off the block row. The depth used to come only
    // from uWaterY -- the surface of the water **the lens** is sitting in --
    // and that switched the whole term off the moment the lens came up for
    // air: a lens 25 cm above Mirrorlake looking down at a bed 6 m below it
    // was handed waterY 0 and K 0,0,0, and the frame came back warmer than red
    // (-16.7) and brighter (mean 149.5) than the same lens a metre under the
    // surface (mean 76, bluer than red by 75.6). Under the surface everything
    // is the colour of water; above it the lake was a pane over dry sand.
    //
    // uWaterY and uWaterK are the other kind of thing: a body, whose vertices
    // are built every frame and cannot be baked. The caller hands over the
    // surface of the water that body stands in, which is a fact about the body
    // rather than about the lens too, and the world's own meshes are drawn
    // with none of it. Air says 0,0,0 and a dry vertex says 0, and exp(0) is
    // 1, so a frame drawn in air is bit for bit what it was.
    //
    // The exponent is linear in the depth, and that is deliberately not the
    // same law as the haze above. The haze is scattering over the viewing
    // path, and its squared-exponential curve is the aerial-perspective one:
    // nothing at all in the first metre, everything at a hundred. Absorption
    // of the sunlight coming down is the other law -- Beer-Lambert -- and it
    // starts eating the red from the very first metre, which is exactly where
    // a body wading over a four metre shelf is looking.
    //
    // A fragment that lights itself is exempt from both terms: the law is
    // about sunlight coming down through the lake, and a lamp sitting in the
    // middle of it is not lit by that.
    float keep = 1.0 - emis;
    float under = max(0.0, uWaterY - wp.y) * keep;
    vec3 dayLight = exp(-uLiqK * (aUnder * 0.125 * keep) - uWaterK * under);
    vCol = vec4(aCol.rgb * aData.x * lit * dayLight + uAmb, aCol.a);
    /* The way back up. Light that reaches a lens standing over a lake has come
       up through the water over the surface it left, and that leg obeys the
       same law again: the red goes first, and the water puts its own colour
       into the ray as it travels. The distance is the water that surface has
       above it -- the same number the leg down already used -- and it is asked
       of the surface being looked at rather than of the lens, which is what
       makes a lake the same water seen from either side of its skin. Under the
       surface the lens is already inside the water, and the haze term above
       carries the whole path, so the leg is not asked for twice.
       A surface that lights itself is exempt from the sun's leg and not from
       this one: a lamp in the middle of a lake is not lit by the daylight
       coming down, but what it sends out still has to climb out. */
    vec3 back = uInWater > 0.5 ? vec3(0.0)
      : uLiqK * (aUnder * 0.125) + uWaterK * max(0.0, uWaterY - wp.y);
    vec3 surv = exp(-back);
    vCol.rgb = mix(vCol.rgb, uVeil, 1.0 - surv);
    /* The water's own face: which way it points, which side of it the lens is
       on, and how much water lies between the lens and that face. The last is
       only asked when the lens is under the surface, because that is the only
       time the surface can be between the lens and what it is looking at --
       looking up at the sky out of a lake, or across at a bank that stands over
       the water. A lens over the lake never has the surface in front of a
       surface it can see, and there the veil is carried by the surface under
       the water instead, where it was just applied. */
    vEye = wp.xyz - uCamPos;
    vPan = vec3(aTop, uInWater, uInWater > 0.5 ? d : 0.0);
  }`;
  const FS_WORLD = `
  precision mediump float;
  varying vec4 vCol; varying vec3 vFog; varying vec3 vEye; varying vec3 vPan;
  uniform vec3 uFogCol; uniform float uTintA; uniform vec3 uTint;
  /* uLiqK is read here as well as in the vertex shader, where the default
     precision is highp: a uniform declared at two precisions will not link at
     all, so the one here is spelled out. */
  uniform highp vec3 uLiqK;
  uniform vec3 uVeil, uZen, uHor;
  uniform float uPane;
  void main(){
    if (uPane > 0.5) {
      /* The water's own face, drawn in two passes over the frame.
         Everything the water does to light on its way *through* it is asked of
         the surface the light came from: the sun's leg down to a lakebed and the
         leg back up from it to a lens over the lake are both applied to that
         lakebed in the vertex shader, and the water a lens is sitting in is the
         haze. What is left for the face is what only the face knows -- how much
         of the view it throws back, and whether there is water between the lens
         and whatever lies behind it. The second is the case of looking up at the
         sky out of a lake, or across at a bank that stands over the water: the
         ray leaves the water through this face, and the water it has just come
         through is the distance from the lens to the face. That is vPan.z, and
         it is zero whenever the lens is over the lake rather than in it, which
         is what keeps the veil from being counted twice.
         Two passes because the survival of what lies behind is per colour -- the
         red of the sky seen through three metres of lake is eaten more than
         twice over while its blue is barely touched -- and a blend can only ever
         scale the frame behind it by one number. The first pass scales the frame
         by what survives and by what the interface lets through; the second adds
         the colour the water put into the ray on the way, and what the interface
         threw back.
         Which way this face points: the mesher puts a water face only where
         water meets air, so it is the top face of a column or one of the four
         that can stand round its edge. The first faces straight up, the rest are
         vertical, and for a vertical face the horizontal part of the view ray is
         the measure of how hard it is looked at along itself.
         Schlick, air to water: 2% straight down, running to everything as the
         view grazes the surface. This is the term that makes a lake a mirror
         from the bank and a window from a boat, and it is what keeps a grazing
         view of a shallow shelf from showing the sand through the far side of
         the lake: at a flat angle the surface gives back the sky instead.
         Seen from under the water the surface reflects the lake rather than the
         sky, so the mirror takes the water's own colour there; what it would
         really show outside Snell's window is the lakebed at that angle, and
         this is the cheap version of that -- the same colour, not the picture. */
      float d = length(vEye);
      vec3 v = vEye / max(d, 1e-4);
      float cn = mix(sqrt(max(0.0, 1.0 - v.y * v.y)), abs(v.y), vPan.x);
      float F = 0.02 + 0.98 * pow(1.0 - cn, 5.0);
      vec3 surv = exp(-uLiqK * vPan.z);
      if (uPane < 1.5) { gl_FragColor = vec4(surv * (1.0 - F), 1.0); return; }
      float ry = mix(v.y, abs(v.y), vPan.x);
      vec3 mir = mix(uHor, uZen, clamp(ry, 0.0, 1.0));
      mir = mix(mir, uVeil, vPan.y);
      gl_FragColor = vec4((1.0 - F) * uVeil * (1.0 - surv) + F * mir, 1.0);
      return;
    }
    vec3 c = mix(vCol.rgb, uFogCol, clamp(vFog, 0.0, 1.0));
    c = mix(c, uTint, uTintA);
    gl_FragColor = vec4(c, vCol.a);
  }`;

  const VS_SKY = `
  precision highp float;
  attribute vec2 aCorner;
  uniform vec3 uFwd, uRight, uUp; uniform float uTanX, uTanY;
  varying vec3 vDir;
  void main(){ gl_Position = vec4(aCorner, 0.999, 1.0); vDir = normalize(uFwd + uRight*aCorner.x*uTanX + uUp*aCorner.y*uTanY); }`;
  const FS_SKY = `
  precision mediump float;
  varying vec3 vDir;
  uniform vec3 uZenith, uHorizon, uSunDir, uSunCol, uGround;
  uniform float uNight, uTime;
  float hash(vec3 p){ p = fract(p*0.3183099 + vec3(0.71,0.113,0.419)); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  void main(){
    vec3 d = normalize(vDir);
    float t = clamp(d.y*0.5+0.5, 0.0, 1.0);
    vec3 col = mix(uGround, uHorizon, smoothstep(0.42, 0.5, t));
    col = mix(col, uZenith, pow(clamp((t-0.5)*2.0, 0.0, 1.0), 0.65));
    float sd = dot(d, uSunDir);
    col += uSunCol * pow(max(sd,0.0), 220.0) * 3.0;
    col += uSunCol * pow(max(sd,0.0), 8.0) * 0.22;
    // moon
    vec3 md = -uSunDir;
    float mdot = dot(d, md);
    col += vec3(0.85,0.88,0.95) * smoothstep(0.9993, 0.9997, mdot) * uNight * 2.0;
    col += vec3(0.35,0.4,0.55) * pow(max(mdot,0.0), 60.0) * uNight * 0.5;
    // stars. uNight alone is not enough: the day/night curve is symmetric about
    // noon, so at 07:00 it still says 37% night while the sun is 29 degrees up,
    // and 217 star spikes were measured in a daylight sky next to the sun. A
    // star needs the sun properly down -- out of the sky, not merely low in it.
    float starLit = uNight * smoothstep(0.0, 0.12, -uSunDir.y);
    if (starLit > 0.05 && d.y > 0.02) {
      vec3 g = floor(d*160.0);
      float h = hash(g);
      float star = step(0.9965, h) * (0.6 + 0.4*sin(uTime*2.0 + h*40.0));
      col += vec3(star) * starLit * smoothstep(0.02, 0.35, d.y);
    }
    gl_FragColor = vec4(col, 1.0);
  }`;

  const VS_PART = `
  precision highp float;
  attribute vec3 aPos; attribute vec4 aCol; attribute float aSize;
  uniform mat4 uProj, uView; uniform float uScale;
  varying vec4 vC;
  void main(){
    vec4 vp = uView * vec4(aPos, 1.0);
    gl_Position = uProj * vp;
    gl_PointSize = clamp(uScale * aSize / max(length(vp.xyz), 0.5), 1.0, 64.0);
    vC = aCol;
  }`;
  const FS_PART = `
  precision mediump float;
  varying vec4 vC;
  void main(){
    vec2 q = gl_PointCoord - 0.5;
    float a = smoothstep(0.5, 0.06, length(q));
    gl_FragColor = vec4(vC.rgb, vC.a * a);
  }`;

  /* ------------------------------ renderer ------------------------------ */
  class Renderer {
    constructor(canvas) {
      const gl = this.gl = canvas.getContext('webgl', { antialias: true, alpha: false, powerPreference: 'high-performance' });
      if (!gl) throw new Error(N.t('err.webgl'));
      this.canvas = canvas;
      this.pWorld = prog(gl, VS_WORLD, FS_WORLD, ['aPos', 'aCol', 'aData', 'aUnder', 'aTop']);
      this.pSky = prog(gl, VS_SKY, FS_SKY, ['aCorner']);
      this.pPart = prog(gl, VS_PART, FS_PART, ['aPos', 'aCol', 'aSize']);

      this.skyBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);

      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      this.proj = M4.create(); this.view = M4.create(); this.mvp = M4.create();
      this.planes = [new Float32Array(4), new Float32Array(4), new Float32Array(4), new Float32Array(4), new Float32Array(4), new Float32Array(4)];
      this.stats = { draws: 0, tris: 0 };
      this.resize();
    }

    resize() {
      const c = this.canvas, dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.floor(c.clientWidth * dpr), h = Math.floor(c.clientHeight * dpr);
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      this.gl.viewport(0, 0, c.width, c.height);
      this.aspect = c.width / Math.max(1, c.height);
    }

    /* ---- camera & environment ---- */
    begin(cam, env) {
      const gl = this.gl;
      this.resize();
      this.stats.draws = 0; this.stats.tris = 0;
      gl.clearColor(env.fogCol[0], env.fogCol[1], env.fogCol[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      M4.persp(this.proj, cam.fov * Math.PI / 180, this.aspect, 0.06, env.far);
      M4.lookYaw(this.view, cam.x, cam.y, cam.z, cam.yaw, cam.pitch);
      // the lens in world space: the water's face is asked what it looks like
      // from where the frame is looked at from, not from where it stands
      this.camPos = [cam.x, cam.y, cam.z];
      const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
      this.fwd = [sy * cp, sp, -cy * cp];
      this.right = [cy, 0, sy];
      /* up = right x fwd, the same basis M4.lookYaw builds the view matrix from.
         It used to be fwd x right, which is the same vector negated. Nothing else
         in the frame noticed, because only the sky quad reads this vector -- and
         the sky quad maps the top of the screen to fwd + up*tanY, so the whole
         sky was mirrored about the horizon: the top of the screen sampled
         *below* the horizon and got uGround, a dark brownish grey, while the
         bright horizon band and the sun glow sat at the bottom of the frame.
         Measured at 07:00 with the lens level and the sun 31 degrees up: the
         glow landed 135 px below the centre of a 300 px frame. That is the
         "black blocks in the sky" -- a dark mass overhead where the zenith
         should be, with clouds lit against it. */
      this.up = [this.right[1] * this.fwd[2] - this.right[2] * this.fwd[1],
                 this.right[2] * this.fwd[0] - this.right[0] * this.fwd[2],
                 this.right[0] * this.fwd[1] - this.right[1] * this.fwd[0]];
      this.cam = cam; this.env = env;

      // frustum planes
      M4.mul(this.mvp, this.proj, this.view);
      const m = this.mvp, P = this.planes;
      // row i of a column-major matrix = [m[i], m[4+i], m[8+i], m[12+i]]
      const rows = [[m[0], m[4], m[8], m[12]], [m[1], m[5], m[9], m[13]], [m[2], m[6], m[10], m[14]], [m[3], m[7], m[11], m[15]]];
      const put = (i, v) => { const L = Math.hypot(v[0], v[1], v[2]) || 1; const p = P[i]; for (let k = 0; k < 4; k++) p[k] = v[k] / L; };
      const R3 = rows[3];
      const add = (r, c, s) => [r[0] + s * c[0], r[1] + s * c[1], r[2] + s * c[2], r[3] + s * c[3]];
      put(0, add(R3, rows[0], 1)); put(1, add(R3, rows[0], -1));   // left / right
      put(2, add(R3, rows[1], 1)); put(3, add(R3, rows[1], -1));   // bottom / top
      put(4, add(R3, rows[2], 1)); put(5, add(R3, rows[2], -1));   // near / far

      this.drawSky();
    }

    visible(x, y, z, r) {
      const P = this.planes;
      for (let i = 0; i < 6; i++) {
        const p = P[i];
        if (p[0] * x + p[1] * y + p[2] * z + p[3] < -r) return false;
      }
      return true;
    }

    /* The same six planes asked of a box instead of a ball, for the things in
       this world that really are boxes. A chunk is 16 wide, 16 deep and the
       whole height of the map -- 48 -- tall, and the ball that used to stand in
       for one was 15 across, centred at half that height. Its own corners are
       26.5 out from that centre, so a chunk whose only piece on screen was one
       of them was thrown away whole and the sky showed through the hole: a lens
       just above Mirrorlake, looking down at 69 degrees, drew a frame that
       disagreed in **56,633** of its pixels with the same lens drawn with no
       culling at all, every one of them the far corner of a chunk of lakebed,
       and two other lenses over the same water put 75,369 and 42,186 pixels of
       the same hole in a frame. Against a plane a box only has to answer at the
       one corner that points furthest along that plane's own normal: if that
       corner is outside, all of the box is. */
    visibleBox(x0, y0, z0, x1, y1, z1) {
      const P = this.planes;
      for (let i = 0; i < 6; i++) {
        const p = P[i];
        const px = p[0] > 0 ? x1 : x0, py = p[1] > 0 ? y1 : y0, pz = p[2] > 0 ? z1 : z0;
        if (p[0] * px + p[1] * py + p[2] * pz + p[3] < 0) return false;
      }
      return true;
    }

    drawSky() {
      const gl = this.gl, e = this.env, P = this.pSky;
      gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.BLEND);
      gl.useProgram(P.p);
      this.resetAttribs();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuf);
      gl.enableVertexAttribArray(P.a.aCorner);
      gl.vertexAttribPointer(P.a.aCorner, 2, gl.FLOAT, false, 0, 0);
      const tanY = Math.tan(this.cam.fov * Math.PI / 360), tanX = tanY * this.aspect;
      gl.uniform3fv(P.u.uFwd || (P.u.uFwd = gl.getUniformLocation(P.p, 'uFwd')), this.fwd);
      gl.uniform3fv(P.u.uRight || (P.u.uRight = gl.getUniformLocation(P.p, 'uRight')), this.right);
      gl.uniform3fv(P.u.uUp || (P.u.uUp = gl.getUniformLocation(P.p, 'uUp')), this.up);
      gl.uniform1f(P.u.uTanX || (P.u.uTanX = gl.getUniformLocation(P.p, 'uTanX')), tanX);
      gl.uniform1f(P.u.uTanY || (P.u.uTanY = gl.getUniformLocation(P.p, 'uTanY')), tanY);
      gl.uniform3fv(P.u.uZenith || (P.u.uZenith = gl.getUniformLocation(P.p, 'uZenith')), e.zenith);
      gl.uniform3fv(P.u.uHorizon || (P.u.uHorizon = gl.getUniformLocation(P.p, 'uHorizon')), e.horizon);
      gl.uniform3fv(P.u.uGround || (P.u.uGround = gl.getUniformLocation(P.p, 'uGround')), e.ground);
      gl.uniform3fv(P.u.uSunDir || (P.u.uSunDir = gl.getUniformLocation(P.p, 'uSunDir')), e.sunDir);
      gl.uniform3fv(P.u.uSunCol || (P.u.uSunCol = gl.getUniformLocation(P.p, 'uSunCol')), e.sunCol);
      gl.uniform1f(P.u.uNight || (P.u.uNight = gl.getUniformLocation(P.p, 'uNight')), e.night);
      gl.uniform1f(P.u.uTime || (P.u.uTime = gl.getUniformLocation(P.p, 'uTime')), e.time);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.enable(gl.DEPTH_TEST); gl.depthMask(true);
    }

    /* ---- generic mesh draw ---- */
    setWorldUniforms(P, opts) {
      const gl = this.gl, e = this.env, u = P.u;
      if (!u._done) {
        u.uProj = gl.getUniformLocation(P.p, 'uProj'); u.uView = gl.getUniformLocation(P.p, 'uView');
        u.uModel = gl.getUniformLocation(P.p, 'uModel'); u.uFogDen = gl.getUniformLocation(P.p, 'uFogDen');
        u.uFogCol = gl.getUniformLocation(P.p, 'uFogCol'); u.uDay = gl.getUniformLocation(P.p, 'uDay');
        u.uTime = gl.getUniformLocation(P.p, 'uTime'); u.uWave = gl.getUniformLocation(P.p, 'uWave');
        u.uTint = gl.getUniformLocation(P.p, 'uTint');
        u.uTintA = gl.getUniformLocation(P.p, 'uTintA');
        u.uEmisBoost = gl.getUniformLocation(P.p, 'uEmisBoost');
        u.uAmb = gl.getUniformLocation(P.p, 'uAmb');
        u.uEmisKeep = gl.getUniformLocation(P.p, 'uEmisKeep');
        u.uWaterK = gl.getUniformLocation(P.p, 'uWaterK');
        u.uWaterY = gl.getUniformLocation(P.p, 'uWaterY');
        u.uLiqK = gl.getUniformLocation(P.p, 'uLiqK');
        u.uHazeK = gl.getUniformLocation(P.p, 'uHazeK');
        u.uHazeOn = gl.getUniformLocation(P.p, 'uHazeOn');
        u.uInWater = gl.getUniformLocation(P.p, 'uInWater');
        u.uCamPos = gl.getUniformLocation(P.p, 'uCamPos');
        u.uPane = gl.getUniformLocation(P.p, 'uPane');
        u.uVeil = gl.getUniformLocation(P.p, 'uVeil');
        u.uZen = gl.getUniformLocation(P.p, 'uZen');
        u.uHor = gl.getUniformLocation(P.p, 'uHor');
        u._done = 1;
      }
      gl.uniformMatrix4fv(u.uProj, false, this.proj);
      gl.uniformMatrix4fv(u.uView, false, this.view);
      // fog belongs to the environment, not to the draw: the only per-draw fog
      // overrides this used to take (opts.fogDen / opts.fogCol) had no caller
      gl.uniform1f(u.uFogDen, e.fogDen);
      gl.uniform3fv(u.uFogCol, e.fogCol);
      // the sky's own light falling on a surface: environment, not draw, like
      // the fog. Zero all day, so a daytime frame is bit for bit what it was.
      gl.uniform3fv(u.uAmb, e.ambient || [0, 0, 0]);
      // what the stuff the lens is sitting in does to a light's own glow: 0.75
      // is the air's answer, and leaves a dry frame untouched
      gl.uniform1f(u.uEmisKeep, e.emisKeep === undefined ? 0.75 : e.emisKeep);
      // the liquid's own absorption, against the depth baked into every vertex
      // of the static world: a dry frame has 0 everywhere, and exp(0) is 1
      gl.uniform3fv(u.uLiqK, e.liqK || [0, 0, 0]);
      // the other half of the same law, for the things that are not baked: a
      // body's vertices are built every frame, so the caller hands over the
      // surface of the water that body stands in -- and a column with no water
      // in it answers -1, which the shader's max() takes to no depth at all.
      // The world's own meshes take none of it: their depth came in with them.
      gl.uniform3fv(u.uWaterK, opts.waterK || [0, 0, 0]);
      gl.uniform1f(u.uWaterY, opts.waterY || 0);
      /* What the stuff the lens is sitting in does to the light coming back
         along the viewing path: per colour, per metre, and it replaces the
         air's haze entirely. Air hands over nothing and uHazeOn 0 keeps the
         air's own curve, so a frame drawn in air is bit for bit what it was. */
      gl.uniform3fv(u.uHazeK, e.hazeK || [0, 0, 0]);
      gl.uniform1f(u.uHazeOn, e.hazeOn || 0);
      // The water's own face: which side of the surface the lens is on, where
      // the lens is, and whether this draw is that face at all.
      gl.uniform1f(u.uInWater, e.inWater ? 1 : 0);
      gl.uniform3fv(u.uCamPos, this.camPos || [0, 0, 0]);
      gl.uniform1f(u.uPane, opts.pane || 0);
      gl.uniform3fv(u.uVeil, e.veil || [0, 0, 0]);
      gl.uniform3fv(u.uZen, e.zenith);
      gl.uniform3fv(u.uHor, e.horizon);
      gl.uniform1f(u.uDay, opts.day !== undefined ? opts.day : e.day);
      gl.uniform1f(u.uTime, e.time);
      gl.uniform1f(u.uWave, opts.wave ? 1 : 0);
      // no alpha uniform: the alpha is a vertex attribute, uploaded from the
      // block table, so two blocks in one mesh may be two different opacities
      gl.uniform3fv(u.uTint, opts.tint || [0, 0, 0]);
      gl.uniform1f(u.uTintA, opts.tintA || 0);
      gl.uniform1f(u.uEmisBoost, opts.emisBoost || 0);
    }

    bindAttribs(P, mesh) {
      const gl = this.gl;
      this.resetAttribs();
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.pos);
      gl.vertexAttribPointer(P.a.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(P.a.aPos);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.col);
      gl.vertexAttribPointer(P.a.aCol, 4, gl.UNSIGNED_BYTE, true, 0, 0);
      gl.enableVertexAttribArray(P.a.aCol);
      // four bytes a vertex: shade, emissive, the depth under water, and which
      // way the face points if it is the water's own surface. The stride is
      // spelled out because the four share one buffer.
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.dat);
      gl.vertexAttribPointer(P.a.aData, 2, gl.UNSIGNED_BYTE, true, 4, 0);
      gl.enableVertexAttribArray(P.a.aData);
      // not normalized: the byte is the depth in 1/8 m steps, and the shader
      // wants the step, not a fraction of a full scale
      gl.vertexAttribPointer(P.a.aUnder, 1, gl.UNSIGNED_BYTE, false, 4, 2);
      gl.enableVertexAttribArray(P.a.aUnder);
      gl.vertexAttribPointer(P.a.aTop, 1, gl.UNSIGNED_BYTE, true, 4, 3);
      gl.enableVertexAttribArray(P.a.aTop);
    }

    resetAttribs() { const gl = this.gl; for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i); }

    drawMesh(mesh, model, opts) {
      if (!mesh || !mesh.count) return;
      const gl = this.gl, P = this.pWorld;
      opts = opts || {};
      gl.useProgram(P.p);
      this.setWorldUniforms(P, opts);
      gl.uniformMatrix4fv(P.u.uModel, false, model || IDENT);
      this.bindAttribs(P, mesh);
      /* Glass blends over what is already in the frame and writes no depth, so
         what shows through it is decided by the depth the opaque pass left
         behind. The water's face blends too, but with a different pair of
         factors, because it is drawn twice: the first pass multiplies the frame
         by what the water leaves of it, the second adds what the water put into
         the ray and what the surface threw back. Neither writes depth. */
      if (opts.pane) {
        gl.enable(gl.BLEND); gl.depthMask(false);
        if (opts.pane === 1) gl.blendFunc(gl.DST_COLOR, gl.ZERO);
        else gl.blendFunc(gl.ONE, gl.ONE);
      } else if (opts.blend) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); }
      if (opts.noCull) gl.disable(gl.CULL_FACE);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
      if (opts.noCull) gl.enable(gl.CULL_FACE);
      if (opts.blend || opts.pane) { gl.disable(gl.BLEND); gl.depthMask(true); }
      this.stats.draws++; this.stats.tris += mesh.count / 3;
    }

    /* ---- particles ---- */
    drawParticles(buf, count) {
      if (!count) return;
      const gl = this.gl, P = this.pPart;
      gl.useProgram(P.p);
      gl.uniformMatrix4fv(gl.getUniformLocation(P.p, 'uProj'), false, this.proj);
      gl.uniformMatrix4fv(gl.getUniformLocation(P.p, 'uView'), false, this.view);
      gl.uniform1f(gl.getUniformLocation(P.p, 'uScale'), gl.drawingBufferHeight * 0.9);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf.pos);
      gl.vertexAttribPointer(P.a.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf.col);
      gl.vertexAttribPointer(P.a.aCol, 4, gl.UNSIGNED_BYTE, true, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf.size);
      gl.vertexAttribPointer(P.a.aSize, 1, gl.FLOAT, false, 0, 0);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.depthMask(false);
      gl.drawArrays(gl.POINTS, 0, count);
      gl.disable(gl.BLEND); gl.depthMask(true);
      this.stats.draws++;
    }
  }
  const IDENT = M4.create();

  N.M4 = M4;
  // shortest signed turn from one angle to another, in radians
  N.angleDelta = (from, to) => {
    let d = (to - from) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  };
  // frame-rate independent blend factor: approach at `rate` per second
  N.ease = (rate, dt) => 1 - Math.exp(-rate * dt);
  N.MeshBuilder = MeshBuilder;
  N.Renderer = Renderer;

})(window.FRUTARIA = window.FRUTARIA || {});
