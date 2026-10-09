/* ==========================================================================
 *  entities.js -- player (voxel AABB physics + transformed forms) / creature AI / particles
 * ========================================================================== */
(function (N) {
  const M4 = N.M4;

  const HUMAN = { cn: '人形', en: 'human', size: [0.62, 1.8], speed: 1, jump: 1, fov: 76, hand: 'hand', step: 0.55 };

  /* ============================ player ============================ */
  class Player {
    constructor(world) {
      this.world = world;
      this.x = 0; this.y = 40; this.z = 0;
      this.vx = 0; this.vy = 0; this.vz = 0;
      this.yaw = 0; this.pitch = 0;
      // what the body actually looks like: facing and bank are eased, never snapped
      this.faceYaw = 0; this.bank = 0;
      this.grounded = false;
      this.form = null;            // fruitId
      this.formT = 0;              // time remaining
      this.formMax = 1;
      this.air = 18;
      this.vital = 5;              // vitality
      this.fright = 0;             // fright 0..1
      this.inWater = false; this.headWater = false;
      this.dry = 0;                // seconds this amphibian body has been out of water
      this.moveAmt = 0;            // horizontal movement this frame (drives animation)
      this.bob = 0;
      this.lastRevert = 0;
      this.stamina = 1;
    }
    get formDef() { return this.form ? N.FRUIT_BY_ID[this.form].form : HUMAN; }
    get modelId() { return this.form ? N.FRUIT_BY_ID[this.form].creature : 'human'; }
    size() { return this.formDef.size || HUMAN.size; }
    /* Held breath is a property of the body: a jellyfish body carries forty
       seconds more than a human one (docs/en/04 s3, airBonus). */
    maxAir() { return 18 + (this.formDef.airBonus || 0); }
    eyePos() {
      const m = N.MODELS[this.modelId];
      const h = (m && m.eye ? m.eye : 1.6);
      return this.y + Math.min(h, this.size()[1] - 0.08);
    }
    fov() {
      let f = this.formDef.fov || 76;
      if (this.headWater && !(this.formDef.breatheAir === false)) f -= 12;
      return f;
    }

    hits(x, y, z) {
      const s = this.size(), hw = s[0] / 2;
      const x0 = Math.floor(x - hw), x1 = Math.floor(x + hw);
      const y0 = Math.floor(y + 0.001), y1 = Math.floor(y + s[1] - 0.001);
      const z0 = Math.floor(z - hw), z1 = Math.floor(z + hw);
      for (let yy = y0; yy <= y1; yy++)
        for (let zz = z0; zz <= z1; zz++)
          for (let xx = x0; xx <= x1; xx++)
            if (this.world.solidAt(xx, yy, zz)) return true;
      return false;
    }
    /* move along one axis; returns whether it hit a wall */
    axis(a, amt) {
      if (!amt) return false;
      const nx = a === 'x' ? this.x + amt : this.x;
      const ny = a === 'y' ? this.y + amt : this.y;
      const nz = a === 'z' ? this.z + amt : this.z;
      if (!this.hits(nx, ny, nz)) { this.x = nx; this.y = ny; this.z = nz; return false; }
      const s = this.size(), hw = s[0] / 2;
      // snap to face: find the contact plane along the movement direction
      if (a === 'y') {
        if (amt < 0) {
          let best = this.y;
          const y0 = Math.floor(ny + 0.001), y1 = Math.floor(ny + s[1] - 0.001);
          for (let yy = y0; yy <= y1; yy++) {
            if (this.colAt(this.x, yy, this.z)) best = Math.max(best, yy + 1);
          }
          this.y = best + 0.0005; this.vy = 0; this.grounded = true;
        } else {
          const yy = Math.floor(ny + s[1] - 0.001);
          this.y = yy - s[1] - 0.0005; this.vy = 0;
        }
      } else if (a === 'x') {
        const xx = amt > 0 ? Math.floor(nx + hw) : Math.floor(nx - hw);
        this.x = amt > 0 ? xx - hw - 0.0008 : xx + 1 + hw + 0.0008;
        this.vx = 0;
      } else {
        const zz = amt > 0 ? Math.floor(nz + hw) : Math.floor(nz - hw);
        this.z = amt > 0 ? zz - hw - 0.0008 : zz + 1 + hw + 0.0008;
        this.vz = 0;
      }
      return true;
    }
    colAt(x, y, z) {
      const s = this.size(), hw = s[0] / 2;
      const x0 = Math.floor(x - hw), x1 = Math.floor(x + hw);
      const z0 = Math.floor(z - hw), z1 = Math.floor(z + hw);
      for (let zz = z0; zz <= z1; zz++) for (let xx = x0; xx <= x1; xx++) if (this.world.solidAt(xx, y, zz)) return true;
      return false;
    }

    update(dt, inp, game) {
      const f = this.formDef;
      const face0 = this.faceYaw;
      const W = this.world;
      const cx = Math.floor(this.x), cz = Math.floor(this.z);
      const cyFeet = Math.floor(this.y + 0.1), cyMid = Math.floor(this.y + this.size()[1] * 0.5), cyHead = Math.floor(this.y + this.size()[1] - 0.12);
      this.headWater = W.liquidAt(cx, cyHead, cz);
      this.inWater = W.liquidAt(cx, cyMid, cz) || W.liquidAt(cx, cyFeet, cz);
      const canBreathe = f.breatheAir === false;

      // ---- breathing ----
      if (this.headWater && !canBreathe) {
        this.air -= dt * (this.fright > 0.4 ? 1.6 : 1);
        if (this.air <= 0) { this.air = 0; game.damage(0.55 * dt, N.t('log.causeDrown')); }
      } else {
        const ceiling = canBreathe ? 999 : this.maxAir();
        this.air = Math.min(ceiling, this.air + dt * (canBreathe ? 999 : 6));
      }

      // ---- skin must stay wet (amphibian bodies: docs/en/04 s3) ----
      // The frog breathes in water and on land, but its skin has to stay wet.
      // This is the cost of the water niche on land -- it drowns on the shore.
      if (f.dryTimer) {
        if (this.inWater) { if (this.dry > f.dryTimer) game.logMsg(N.t('log.dryIn'), 'good'); this.dry = 0; }
        else this.dry += dt;
        if (this.dry > f.dryTimer) {
          if (this.dry - dt <= f.dryTimer) game.logMsg(N.t('log.dryOut'), 'warn');
          game.damage(dt * 0.03, N.t('log.causeDry'));
        }
      } else this.dry = 0;

      // ---- intended velocity ----
      const sprint = inp.sprint && this.air > 0 && !this.inWater;
      let speed = 4.7 * (f.speed || 1) * (sprint ? 1.45 : 1);
      if (this.inWater) speed *= (f.swim || 0.62);
      if (!this.grounded && !f.fly && !this.inWater) speed *= 0.92;
      let dx = 0, dz = 0;
      const fx = Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const rx = Math.cos(this.yaw), rz = Math.sin(this.yaw);
      if (inp.fwd) { dx += fx; dz += fz; }
      if (inp.back) { dx -= fx; dz -= fz; }
      if (inp.right) { dx += rx; dz += rz; }
      if (inp.left) { dx -= rx; dz -= rz; }
      const len = Math.hypot(dx, dz);
      if (len > 0) { dx /= len; dz /= len; }

      const fly = f.fly && !this.inWater;
      const accel = fly ? 22 : (this.grounded ? 34 : 12);
      this.vx += (dx * speed - this.vx) * Math.min(1, accel * dt / Math.max(speed, 1));
      this.vz += (dz * speed - this.vz) * Math.min(1, accel * dt / Math.max(speed, 1));

      // ---- the body turns with mass ----
      // facing never snaps to the mouse: an animal pivots, and the bigger it is
      // the slower it pivots. That is what makes third person watchable instead
      // of twitchy (docs/en/07, "camera and comfort").
      const h = this.size()[1];
      const spd = Math.hypot(this.vx, this.vz);
      if (spd > 0.4) {
        const want = Math.atan2(this.vx, -this.vz);
        this.faceYaw += N.angleDelta(this.faceYaw, want) * N.ease(11 - 3.4 * Math.min(2, h), dt);
      } else {
        this.faceYaw += N.angleDelta(this.faceYaw, this.yaw) * N.ease(3.2, dt);   // settle back to the aim
      }
      // lean into the turn in air and water, level out on foot
      const lean = (fly || this.inWater)
        ? Math.max(-0.45, Math.min(0.45, (N.angleDelta(face0, this.faceYaw) / Math.max(dt, 0.001)) * 0.11))
        : 0;
      this.bank += (lean - this.bank) * N.ease(4.5, dt);

      // ---- vertical ----
      if (fly) {
        const up = inp.jump ? f.fly : 0, down = inp.sneak ? f.fly * 0.75 : 0;
        this.vy += (up - down) * dt * 1.9;
        this.vy -= this.vy * Math.min(0.92, 4.2 * dt);
        this.vy = Math.max(-f.fly * 0.8, Math.min(f.fly * 0.75, this.vy));
        if (!up && !down && Math.abs(this.vy) < 0.6) this.vy = 0;
        this.grounded = false;
      } else if (this.inWater) {
        const buoy = 5.2;
        this.vy += (inp.jump ? 6.2 : 0) * dt;
        this.vy -= buoy * dt * 0.55;
        if (inp.sneak) this.vy -= 3.4 * dt;
        this.vy -= this.vy * Math.min(0.9, 3.2 * dt);
        this.vy = Math.max(-4.5, Math.min(4.6, this.vy));
        this.grounded = false;
      } else {
        this.vy -= 23 * dt;
        this.vy = Math.max(-42, this.vy);
        if (inp.jump && this.grounded) { this.vy = 8.3 * (f.jump || 1); this.grounded = false; }
      }

      // ---- displacement (sub-stepped + auto step-up) ----
      const step = f.step || 0;
      const wasGrounded = this.grounded;
      this.grounded = false;
      let moved = 0;
      const steps = Math.max(1, Math.ceil((Math.hypot(this.vx, this.vz) * dt) / 0.25));
      for (let i = 0; i < steps; i++) {
        const sdt = dt / steps;
        // auto step-up
        if (step > 0 && (wasGrounded || this.grounded) && !fly && !this.inWater) {
          const ox = this.x, oz = this.z;
          let hit = this.axis('x', this.vx * sdt);
          hit = this.axis('z', this.vz * sdt) || hit;
          if (hit) {
            let done = false;
            for (let up = 0.15; up <= step + 1e-6 && !done; up += 0.15) {
              const oy = this.y;
              this.y = oy + up;
              if (!this.hits(this.x, this.y, this.z)) {
                this.x = ox; this.z = oz;
                this.axis('x', this.vx * sdt); this.axis('z', this.vz * sdt);
                if (!this.hits(this.x, this.y - 0.02, this.z)) this.y -= 0.02;
                done = true;
              } else this.y = oy;
            }
          }
        } else {
          this.axis('x', this.vx * sdt);
          this.axis('z', this.vz * sdt);
        }
        this.axis('y', this.vy * sdt);
        moved += (Math.abs(this.vx) + Math.abs(this.vz)) * sdt;
      }
      this.moveAmt = moved;
      this.bob += moved * 1.6;

      // ---- boundary: the Grey Veil ----
      const B = 6;
      if (this.x < B || this.x > W.w - B || this.z < B || this.z > W.d - B) {
        game.onVeil(this);
        this.x = Math.max(B, Math.min(W.w - B, this.x));
        this.z = Math.max(B, Math.min(W.d - B, this.z));
        this.vx *= 0.2; this.vz *= 0.2;
      }
      if (this.y < -2) { game.damage(1.2, N.t('log.causeFall')); this.y = 30; this.vy = 0; }

      // ---- fright decay ----
      this.fright = Math.max(0, this.fright - dt * 0.12);
    }
  }

  /* ============================ creatures ============================ */
  function groundY(w, x, z, from) {
    for (let y = from; y > 0; y--) if (w.solidAt(x, y, z)) return y + 1;
    return 1;
  }
  function waterTop(w, x, z, from) {
    for (let y = from; y >= 0; y--) if (w.liquidAt(x, y, z)) return y;
    return -1;
  }

  class Creature {
    constructor(spec, x, y, z) {
      this.sp = spec;
      this.x = x; this.y = y; this.z = z;
      this.yaw = Math.random() * 6.28;
      this.t = Math.random() * 10;
      this.phase = Math.random() * 6.28;
      this.state = 'wander';
      this.tx = x; this.tz = z;
      this.pause = Math.random() * 3;
      this.speed = 0;
      this.alarm = 0;
      this.hp = 1;
      this.homeX = x; this.homeZ = z;
      this.flyY = y;
      this.parts = null;
      this.dead = false;
    }
    attitudeTo(formId) {
      const a = this.sp.attitude || {};
      // the player's form is a fruit id; attitudes are keyed by species id
      const species = this.speciesOf(formId);
      const key = formId !== null && formId !== undefined ? species || formId : 'human';
      if (a[key]) return a[key];
      if (species && a.self && species === this.sp.id) return a.self;
      return a.default || 'ignore';
    }
    /* which species the player is wearing right now (null in a human shape) */
    speciesOf(formId) { return formId && N.FRUIT_BY_ID[formId] ? N.FRUIT_BY_ID[formId].creature : null; }
    sameSpeciesAs(formId) { return this.speciesOf(formId) === this.sp.id; }
    isFlyer() { return ['owl'].indexOf(this.sp.id) >= 0; }
    isAquatic() { return ['jelly'].indexOf(this.sp.id) >= 0; }        // never leaves the water
    isAmphibian() { return ['frog'].indexOf(this.sp.id) >= 0; }       // bank and water both

    update(dt, pl, world, game) {
      const sp = this.sp;
      this.t += dt;
      const dxp = pl.x - this.x, dzp = pl.z - this.z, dyp = pl.y - this.y;
      const dp = Math.sqrt(dxp * dxp + dzp * dzp + dyp * dyp);

      // time of day
      const night = game.night;
      const nocturnal = sp.active === 'night';
      const sleeping = nocturnal && night < 0.35;

      const att = this.attitudeTo(pl.form);
      const alert = (sp.alert || 12) * (pl.formDef.stealth || 1) * (game.playerStealth || 1);

      let want = 0, tgtX = this.tx, tgtZ = this.tz;
      if (sleeping) { this.state = 'roost'; }
      else if (att === 'flee' && dp < alert) {
        this.state = 'flee';
        tgtX = this.x - dxp * 4; tgtZ = this.z - dzp * 4;
        this.alarm = 1;
      } else if (att === 'hostile' && dp < alert * 1.4 && dp > 1.2) {
        this.state = 'chase';
        tgtX = pl.x; tgtZ = pl.z;
        this.alarm = 1;
      } else if (att === 'curious' && dp < alert && dp > 3) {
        this.state = 'approach'; tgtX = pl.x; tgtZ = pl.z;
      } else if (this.state !== 'wander') { this.state = 'wander'; }

      if (this.state === 'wander') {
        this.pause -= dt;
        if (this.pause <= 0) {
          this.pause = 2 + Math.random() * 6;
          const r = this.isAquatic() ? 18 : 14;
          this.tx = this.homeX + (Math.random() - 0.5) * 2 * r;
          this.tz = this.homeZ + (Math.random() - 0.5) * 2 * r;
        }
        tgtX = this.tx; tgtZ = this.tz;
      }
      this.alarm = Math.max(0, this.alarm - dt * 0.3);

      // movement
      const dx = tgtX - this.x, dz = tgtZ - this.z;
      const d = Math.hypot(dx, dz);
      let spd = 0;
      if (d > 0.8) {
        const base = this.state === 'flee' || this.state === 'chase' ? (sp.speed || 3) * 1.7 : (sp.speed || 3) * 0.42;
        spd = sleeping ? 0 : base;
        const tgtYaw = Math.atan2(dx, -dz);
        let dy = tgtYaw - this.yaw;
        while (dy > Math.PI) dy -= 6.283; while (dy < -Math.PI) dy += 6.283;
        this.yaw += dy * Math.min(1, dt * 4);
        const nx = this.x + Math.sin(this.yaw) * spd * dt;
        const nz = this.z - Math.cos(this.yaw) * spd * dt;
        const mx = nx, mz = nz;
        if (this.isAquatic()) {
          if (world.liquidAt(Math.floor(mx), Math.floor(this.y), Math.floor(mz))) { this.x = mx; this.z = mz; }
          else {
            // towards the lake centre
            const lk = N.POIS.find(p => p.id === 'sunktower');
            const ax = lk.x - this.x, az = lk.z - this.z, al = Math.hypot(ax, az) || 1;
            this.x += ax / al * spd * dt; this.z += az / al * spd * dt;
          }
        } else {
          const gy = groundY(world, Math.floor(mx), Math.floor(mz), Math.floor(this.y + 3));
          if (gy - this.y < 1.6 || this.isFlyer()) { this.x = mx; this.z = mz; }
          else { this.tx = this.x; this.tz = this.z; this.pause = 0.5; }
          this.x = Math.max(7, Math.min(world.w - 7, this.x));
          this.z = Math.max(7, Math.min(world.d - 7, this.z));
        }
      }
      this.speed = spd;

      // altitude
      if (this.isFlyer()) {
        const base = sleeping ? groundY(world, Math.floor(this.x), Math.floor(this.z), Math.floor(this.y + 6)) + 1.2 : this.flyY;
        const target = base + Math.sin(this.t * 1.1 + this.phase) * 0.9;
        this.y += (target - this.y) * Math.min(1, dt * 2.2);
      } else if (this.isAquatic()) {
        const wt = waterTop(world, Math.floor(this.x), Math.floor(this.z), world.h - 1);
        const depth = 1.2 + Math.sin(this.t + this.phase) * 0.8;
        const target = Math.max(1, wt - depth);
        this.y += (target - this.y) * Math.min(1, dt * 1.6);
      } else if (this.isAmphibian()) {
        // the frog sits on the bank, and floats just under the surface when it is in water
        const inWater = world.liquidAt(Math.floor(this.x), Math.floor(this.y + 0.2), Math.floor(this.z));
        const gy0 = groundY(world, Math.floor(this.x), Math.floor(this.z), Math.floor(this.y + 4));
        const wt = waterTop(world, Math.floor(this.x), Math.floor(this.z), world.h - 1);
        const target = (inWater && wt > gy0) ? Math.max(gy0, wt - 0.3) : gy0;
        this.y += (target - this.y) * Math.min(1, dt * 6);
      } else {
        const gy = groundY(world, Math.floor(this.x), Math.floor(this.z), Math.floor(this.y + 4));
        this.y += (gy - this.y) * Math.min(1, dt * 9);
      }

      // contact effects
      if (dp < (this.sp.scale || 0.2) * 8 + 0.8) {
        if (this.state === 'chase') game.onCreatureTouch(this, dt);
        else if (this.sp.aura && (pl.formDef.aura || 0) > 0) { /* they ignore each other */ }
      }
      // intimidation: the player's form aura makes lesser creatures flee.
      // The same species is exempt -- a bear does not run from a bear, and the
      // attitude table already says "calm" for one of its own.
      const aura = pl.formDef.aura || 0;
      if (aura > 0 && dp < aura && att !== 'hostile' && !this.sameSpeciesAs(pl.form) && this.state !== 'flee' && !this.isFlyer()) {
        this.state = 'flee'; this.alarm = 1;
      }
    }
  }

  /* ============================ particles ============================ */
  class Particles {
    constructor(gl, max) {
      this.gl = gl; this.max = max || 900; this.n = 0;
      this.px = new Float32Array(this.max); this.py = new Float32Array(this.max); this.pz = new Float32Array(this.max);
      this.vx = new Float32Array(this.max); this.vy = new Float32Array(this.max); this.vz = new Float32Array(this.max);
      this.life = new Float32Array(this.max); this.max_life = new Float32Array(this.max);
      this.col = new Uint8Array(this.max * 4); this.size = new Float32Array(this.max);
      this.bPos = gl.createBuffer(); this.bCol = gl.createBuffer(); this.bSize = gl.createBuffer();
      this.fBuf = new Float32Array(this.max * 3);
      this.sBuf = new Float32Array(this.max);
      this.cBuf = new Uint8Array(this.max * 4);
    }
    spawn(x, y, z, vx, vy, vz, life, col, size) {
      if (this.n >= this.max) return;
      const i = this.n++;
      this.px[i] = x; this.py[i] = y; this.pz[i] = z;
      this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
      this.life[i] = life; this.max_life[i] = life;
      this.col[i * 4] = col[0] * 255; this.col[i * 4 + 1] = col[1] * 255; this.col[i * 4 + 2] = col[2] * 255; this.col[i * 4 + 3] = 255;
      this.size[i] = size;
    }
    update(dt, world) {
      for (let i = 0; i < this.n; i++) {
        this.life[i] -= dt;
        if (this.life[i] <= 0) {
          const j = --this.n;
          if (j !== i) {
            this.px[i] = this.px[j]; this.py[i] = this.py[j]; this.pz[i] = this.pz[j];
            this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j]; this.vz[i] = this.vz[j];
            this.life[i] = this.life[j]; this.max_life[i] = this.max_life[j];
            this.size[i] = this.size[j];
            this.col[i * 4] = this.col[j * 4]; this.col[i * 4 + 1] = this.col[j * 4 + 1];
            this.col[i * 4 + 2] = this.col[j * 4 + 2]; this.col[i * 4 + 3] = this.col[j * 4 + 3];
          }
          i--; continue;
        }
        this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
        this.vy[i] -= 1.2 * dt;
        this.vx[i] *= 1 - 0.6 * dt; this.vz[i] *= 1 - 0.6 * dt;
      }
    }
    draw(R) {
      if (!this.n) return;
      const gl = this.gl;
      const f = this.fBuf, s = this.sBuf, c = this.cBuf;
      for (let i = 0; i < this.n; i++) {
        const a = Math.max(0, Math.min(1, this.life[i] / this.max_life[i]));
        f[i * 3] = this.px[i]; f[i * 3 + 1] = this.py[i]; f[i * 3 + 2] = this.pz[i];
        s[i] = this.size[i] * (0.5 + a * 0.5);
        c[i * 4] = this.col[i * 4]; c[i * 4 + 1] = this.col[i * 4 + 1];
        c[i * 4 + 2] = this.col[i * 4 + 2]; c[i * 4 + 3] = (a * 255) | 0;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bPos); gl.bufferData(gl.ARRAY_BUFFER, f.subarray(0, this.n * 3), gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bCol); gl.bufferData(gl.ARRAY_BUFFER, c.subarray(0, this.n * 4), gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bSize); gl.bufferData(gl.ARRAY_BUFFER, s.subarray(0, this.n), gl.DYNAMIC_DRAW);
      R.drawParticles({ pos: this.bPos, col: this.bCol, size: this.bSize }, this.n);
    }
  }

  N.Player = Player;
  N.Creature = Creature;
  N.Particles = Particles;
  N.HUMAN_FORM = HUMAN;
  N.groundY = groundY;

})(window.FRUTARIA = window.FRUTARIA || {});
