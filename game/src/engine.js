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
    constructor() { this.pos = []; this.col = []; this.dat = []; this.n = 0; }
    /* one vertex: position, colour [r,g,b], shade (0..1 brightness*AO), emis (0/1) */
    v(x, y, z, c, shade, emis) {
      this.pos.push(x, y, z);
      this.col.push((c[0] * 255) | 0, (c[1] * 255) | 0, (c[2] * 255) | 0, c.length > 3 ? (c[3] * 255) | 0 : 255);
      this.dat.push((Math.min(1, shade) * 255) | 0, emis ? 255 : 0);
      this.n++;
    }
    /* quad: 4 points */
    quad(p, c, shade, emis) {
      this.v(p[0], p[1], p[2], c, shade, emis);
      this.v(p[3], p[4], p[5], c, shade, emis);
      this.v(p[6], p[7], p[8], c, shade, emis);
      this.v(p[0], p[1], p[2], c, shade, emis);
      this.v(p[6], p[7], p[8], c, shade, emis);
      this.v(p[9], p[10], p[11], c, shade, emis);
    }
    /* quad with per-vertex AO */
    quadAO(p, c, sh, emis) {
      const put = (i) => this.v(p[i * 3], p[i * 3 + 1], p[i * 3 + 2], c, sh[i], emis);
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
  attribute vec3 aPos; attribute vec4 aCol; attribute vec2 aData;
  uniform mat4 uProj, uView, uModel;
  uniform float uFogDen, uDay, uTime, uWave, uEmisBoost;
  varying vec4 vCol; varying float vFog;
  void main(){
    vec4 wp = uModel * vec4(aPos, 1.0);
    if (uWave > 0.5) wp.y += sin(uTime*1.7 + wp.x*0.9 + wp.z*0.7)*0.055 + sin(uTime*0.6 + wp.z*0.25)*0.03;
    vec4 vp = uView * wp;
    gl_Position = uProj * vp;
    float d = length(vp.xyz);
    float emis = aData.y;
    float fog = 1.0 - exp(-uFogDen*uFogDen*d*d);
    vFog = fog * (1.0 - emis*0.75);
    float lit = mix(max(uDay, 0.10), 1.25 + uEmisBoost, emis);
    // aCol is uploaded with normalized=TRUE, so aCol.a is already 0..1: dividing
    // it by 255 again made every blended surface 0.4% opaque, and the lake had no
    // colour at all until your head went under and the fog did the colouring
    vCol = vec4(aCol.rgb * aData.x * lit, aCol.a);
  }`;
  const FS_WORLD = `
  precision mediump float;
  varying vec4 vCol; varying float vFog;
  uniform vec3 uFogCol; uniform float uAlpha, uTintA, uTintB; uniform vec3 uTint;
  void main(){
    vec3 c = mix(vCol.rgb, uFogCol, clamp(vFog, 0.0, 1.0));
    c = mix(c, uTint, uTintA);
    gl_FragColor = vec4(c, vCol.a * uAlpha);
    if (gl_FragColor.a < uTintB) discard;
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
    // stars
    if (uNight > 0.05 && d.y > 0.02) {
      vec3 g = floor(d*160.0);
      float h = hash(g);
      float star = step(0.9965, h) * (0.6 + 0.4*sin(uTime*2.0 + h*40.0));
      col += vec3(star) * uNight * smoothstep(0.02, 0.35, d.y);
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
      this.pWorld = prog(gl, VS_WORLD, FS_WORLD, ['aPos', 'aCol', 'aData']);
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
      this.modelTmp = M4.create();
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
      const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
      this.fwd = [sy * cp, sp, -cy * cp];
      this.right = [cy, 0, sy];
      this.up = [this.fwd[1] * this.right[2] - this.fwd[2] * this.right[1],
                 this.fwd[2] * this.right[0] - this.fwd[0] * this.right[2],
                 this.fwd[0] * this.right[1] - this.fwd[1] * this.right[0]];
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
        u.uAlpha = gl.getUniformLocation(P.p, 'uAlpha'); u.uTint = gl.getUniformLocation(P.p, 'uTint');
        u.uTintA = gl.getUniformLocation(P.p, 'uTintA'); u.uTintB = gl.getUniformLocation(P.p, 'uTintB');
        u.uEmisBoost = gl.getUniformLocation(P.p, 'uEmisBoost');
        u._done = 1;
      }
      gl.uniformMatrix4fv(u.uProj, false, this.proj);
      gl.uniformMatrix4fv(u.uView, false, this.view);
      gl.uniform1f(u.uFogDen, opts.fogDen !== undefined ? opts.fogDen : e.fogDen);
      gl.uniform3fv(u.uFogCol, opts.fogCol || e.fogCol);
      gl.uniform1f(u.uDay, opts.day !== undefined ? opts.day : e.day);
      gl.uniform1f(u.uTime, e.time);
      gl.uniform1f(u.uWave, opts.wave ? 1 : 0);
      gl.uniform1f(u.uAlpha, opts.alpha !== undefined ? opts.alpha : 1);
      gl.uniform3fv(u.uTint, opts.tint || [0, 0, 0]);
      gl.uniform1f(u.uTintA, opts.tintA || 0);
      gl.uniform1f(u.uTintB, opts.discardA || 0);
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
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.dat);
      gl.vertexAttribPointer(P.a.aData, 2, gl.UNSIGNED_BYTE, true, 0, 0);
      gl.enableVertexAttribArray(P.a.aData);
    }

    resetAttribs() { const gl = this.gl; for (let i = 0; i < 4; i++) gl.disableVertexAttribArray(i); }

    drawMesh(mesh, model, opts) {
      if (!mesh || !mesh.count) return;
      const gl = this.gl, P = this.pWorld;
      opts = opts || {};
      gl.useProgram(P.p);
      this.setWorldUniforms(P, opts);
      gl.uniformMatrix4fv(P.u.uModel, false, model || IDENT);
      this.bindAttribs(P, mesh);
      if (opts.blend) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); }
      if (opts.noCull) gl.disable(gl.CULL_FACE);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
      if (opts.noCull) gl.enable(gl.CULL_FACE);
      if (opts.blend) { gl.disable(gl.BLEND); gl.depthMask(true); }
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
