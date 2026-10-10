/* ==========================================================================
 *  entities.js -- player (voxel AABB physics + transformed forms) / creature AI / particles
 * ========================================================================== */
(function (N) {
  const M4 = N.M4;

  /* The body you start in is a data record (data/player.js), not a constant
     here: `size` on it is a rule the world enforces, and reach.js guards the
     fields of every body record. The alias keeps the code below readable. */
  const HUMAN = N.HUMAN_FORM;

  /* The speed a body that does nothing about it falls at. `glide` is a fraction
     of this, so the number in the data file is a ratio and not a speed. */
  const MAX_FALL = 42;
  const GRAVITY = 23;

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
      this.wasCold = false;        // whether the ridge cold is already biting (drives one log line)
      this.moveAmt = 0;            // horizontal movement this frame (drives animation)
      this.bob = 0;
      /* what the body's own motion tells the animation, in 0..1: how far off the
         ground it is, how loaded its legs are before a hop, and how much it
         flattened on the landing. Nothing here is a mood -- all three are read
         off the physics, so a body that does not hop never animates as if it did. */
      this.airAmt = 0; this.crouch = 0; this.squash = 0;
      this.hopT = 0; this.wind = 0;
      this.lastRevert = 0;
      /* Set by Game.die() and cleared at the top of the next frame. It is not a
         "is the player alive" flag -- dying always revives them at the town
         cellar -- it is a stop sign for the rest of the tick that killed them. */
      this.dead = false;
    }
    get formDef() { return this.form ? N.FRUIT_BY_ID[this.form].form : HUMAN; }
    get modelId() { return this.form ? N.FRUIT_BY_ID[this.form].creature : 'human'; }
    size() { return this.formDef.size || HUMAN.size; }
    /* model units -> metres. The animal's own record carries the number (an
       animal is declared once, whether it is walking around or worn as a body);
       the human body takes it from the form def above. */
    bodyScale() {
      return this.form ? N.CREATURE_BY_ID[N.FRUIT_BY_ID[this.form].creature].scale : HUMAN.scale;
    }
    /* Held breath is a property of the body. A frog body does not need air at
       all (breatheAir: false, handled by the caller); every body that does need
       it holds it for the same eighteen seconds. No body in the valley carries
       a bonus since the jellyfish was cut -- the field went with it. */
    maxAir() { return 18; }
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
    /* A body change, or a tree growing where you were standing, can leave you
       inside the world. `axis` stops a body entering a solid; it has no opinion
       about one that already is, and a body that overlaps a solid cannot move
       normally -- every direction it tries hits and snaps to a block face. So
       after any change of size, and after any tree built at your feet, get the
       body out. Sideways first: a body inside a column belongs beside it, which
       is what planting a tree on your own head should leave you doing (standing
       next to it), and lifting would put you on top of a four-metre trunk. Then
       up, because a body under a roof belongs above it. Past both the column is
       solid all the way and the honest answer is the top of it. */
    unstick() {
      if (!this.hits(this.x, this.y, this.z)) return false;
      const x0 = this.x, z0 = this.z;
      const off = [];
      for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++)
        if (dx || dz) off.push([dx * 0.5, dz * 0.5, dx * dx + dz * dz]);
      off.sort((a, b) => a[2] - b[2]);
      for (const [dx, dz] of off) {
        this.x = x0 + dx; this.z = z0 + dz;
        if (!this.hits(this.x, this.y, this.z)) { this.vx = 0; this.vz = 0; return true; }
      }
      this.x = x0; this.z = z0;
      for (let i = 0; i < 40; i++) {
        this.y += 0.05;
        if (!this.hits(this.x, this.y, this.z)) { this.vy = 0; this.grounded = false; return true; }
      }
      this.y = groundY(this.world, Math.floor(this.x), Math.floor(this.z), Math.floor(this.y) + 6) + 0.0005;
      this.vy = 0; this.grounded = false;
      return true;
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
      // drowning can end the run here; die() has already moved this body to the
      // town cellar, and the form captured above no longer describes it
      if (this.dead) return;

      // ---- skin must stay wet (amphibian bodies: docs/en/04 s3) ----
      // The frog breathes in water and on land, but its skin has to stay wet.
      // This is the cost of the water niche on land -- it drowns on the shore.
      if (f.dryTimer) {
        if (this.inWater) { if (this.dry > f.dryTimer) game.logMsg(N.t('log.dryIn'), 'good'); this.dry = 0; }
        else this.dry += dt;
        if (this.dry > f.dryTimer) {
          if (this.dry - dt <= f.dryTimer) game.logMsg(N.t('log.dryOut'), 'warn');
          game.damage(dt * 0.03, N.t('log.causeDry'));
          if (this.dead) return;
        }
      } else this.dry = 0;

      // ---- the ridge is cold (docs/en/02 s7: Ashscale Ridge -- the cold) ----
      /* The cold belongs to the ground and the height, not to the sky: it bites
         the same at noon and at midnight, and it bites harder the higher you
         get, reaching the full rate `ramp` metres above the line. A bear body
         is its own weatherproofing, and eating one on the slope is the moment
         the cold lets go. */
      const zc = N.ZONE_BY_ID.mountains;
      if (zc.cold) {
        const over = this.y - zc.cold.above;
        const biting = over > 0 && Math.hypot(this.x - zc.cx, this.z - zc.cz) < zc.r && !f.coldImmune;
        if (biting !== this.wasCold) {
          this.wasCold = biting;
          game.logMsg(N.t(biting ? 'log.coldIn' : 'log.coldOff'), biting ? 'warn' : 'good');
        }
        if (biting) {
          game.damage(dt * zc.cold.rate * Math.min(1, over / zc.cold.ramp), N.t('log.causeCold'));
          if (this.dead) return;
        }
      }

      // ---- intended velocity ----
      const sprint = inp.sprint && this.air > 0 && !this.inWater;
      let speed = 4.7 * (f.speed || 1) * (sprint ? 1.45 : 1);
      if (this.inWater) speed *= (f.swim || 0.62);
      // a body that hops is thrown forward by the hop; it does not bleed speed
      // in the air the way a body that merely fell off a ledge does
      if (!this.grounded && !f.fly && !this.inWater) speed *= (f.hop ? 1 : 0.92);
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
      const accel = fly ? 22 : (this.grounded ? 34 : (f.hop ? 18 : 12));
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
        if (up || down) {
          this.vy += (up - down) * dt * 1.9;
          this.vy -= this.vy * Math.min(0.92, 4.2 * dt);
          this.vy = Math.max(-f.fly * 0.8, Math.min(f.fly * 0.75, this.vy));
        } else if (f.glide) {
          /* Wings spread, no flap. A flying body does not hang in the air: let
             go of the key and it comes down. `glide` is the fraction of normal
             fall speed it accepts, so an owl descends at about a third of the
             rate you do and keeps the ground speed it had while it does --
             height is what pays for distance (docs/en/04 s4). */
          this.vy -= GRAVITY * dt;
          this.vy = Math.max(-MAX_FALL * f.glide, this.vy);
        } else {
          // wings that cannot glide just fall
          this.vy -= GRAVITY * dt;
          this.vy = Math.max(-MAX_FALL, this.vy);
        }
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
        this.vy -= GRAVITY * dt;
        // glide is a property of the body, not of flapping: an owl that walks
        // off a ledge spreads its wings too
        this.vy = Math.max(-MAX_FALL * (f.glide || 1), this.vy);
        const hop = f.hop;
        if (inp.jump && this.grounded) {
          this.vy = 8.3 * (f.jump || 1); this.grounded = false;
          if (hop) this.hopT = hop.period;
        } else if (hop && this.grounded) {
          /* A body whose data says `hop` does not walk on land: it hops. The
             launch is an impulse and the arc is gravity's, so the animation and
             the displacement are the same event instead of two separate stories.
             The kick is a nudge toward the hop speed, not an addition, or every
             hop would add to the last one and the body would accelerate away.
             The countdown only runs with feet on the ground: a frog that lands
             stands, loads, and pushes off again. */
          if (len > 0) {
            this.hopT -= dt;
            this.wind = Math.min(1, this.wind + dt / 0.16);
            if (this.hopT <= 0) {
              this.vy = 8.3 * (f.jump || 1) * hop.up;
              const k = speed * hop.kick;
              this.vx += (dx * k - this.vx) * 0.6;
              this.vz += (dz * k - this.vz) * 0.6;
              this.hopT = hop.period;
              this.wind = 0;
              this.grounded = false;
            }
          } else { this.hopT = 0; this.wind = 0; }
        }
        // the wind-up: the legs load while the feet are on the ground
        this.crouch = hop ? this.wind : 0;
      }

      // ---- displacement (sub-stepped + auto step-up) ----
      const step = f.step || 0;
      const wasGrounded = this.grounded;
      const vyBefore = this.vy;                 // the speed it arrives at the ground with
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
      // what the animation is allowed to know
      // eased, not snapped: a body resting on the ground flickers out of
      // `grounded` for a frame at a time, and a pose that hiccups with it looks
      // like a seizure rather than a breath
      const airWant = this.grounded ? 0 : 1;
      this.airAmt += (airWant - this.airAmt) * Math.min(1, dt * (airWant ? 7 : 11));
      if (!this.grounded) this.crouch = 0;
      if (this.grounded && !wasGrounded) this.squash = Math.min(0.3, Math.max(0, -vyBefore) / 55);
      this.squash = Math.max(0, this.squash - dt * 3.2);

      // ---- boundary: the Grey Veil ----
      const B = 6;
      if (this.x < B || this.x > W.w - B || this.z < B || this.z > W.d - B) {
        game.onVeil(this);
        this.x = Math.max(B, Math.min(W.w - B, this.x));
        this.z = Math.max(B, Math.min(W.d - B, this.z));
        this.vx *= 0.2; this.vz *= 0.2;
      }
      if (this.y < -2) {
        game.damage(1.2, N.t('log.causeFall'));
        // if that was fatal, die() has already put this body back at the town
        // cellar; overwriting y with 30 would drop them onto the roof of it
        if (this.dead) return;
        this.y = 30; this.vy = 0;
      }

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
  /* The part of the day a species is out (docs/en/03 s3: day / night / both /
     dusk). `night` is the curve the sky already runs on: 1 at midnight, 0 at
     noon. A dusk animal is out at both ends of the day and asleep at noon and
     at midnight -- no species in the valley uses 'dusk' right now, but the word
     is part of the setting, so the branch stays for the next animal. */
  function outAt(sp, night) {
    switch (sp.active) {
      case 'night': return night >= 0.35;
      case 'day':   return night < 0.65;
      case 'dusk':  return night > 0.3 && night < 0.85;
      default:      return true;                 // 'both', and anything unknown
    }
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
      this.homeX = x; this.homeZ = z;
      this.flyY = y;
      this.parts = null;
      // the same three signals the player carries, for the same reason
      this.airAmt = 0; this.crouch = 0; this.squash = 0; this.hopT = Math.random() * 1.2; this.wind = 0;
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
    isFlyer() { return this.sp.locomotion === 'fly'; }
    isAquatic() { return this.sp.locomotion === 'water'; }        // never leaves the water
    isAmphibian() { return this.sp.locomotion === 'amphibian'; }  // bank and water both

    update(dt, pl, world, game) {
      const sp = this.sp;
      this.t += dt;
      const dxp = pl.x - this.x, dzp = pl.z - this.z, dyp = pl.y - this.y;
      const dp = Math.sqrt(dxp * dxp + dzp * dzp + dyp * dyp);

      // time of day
      const sleeping = !outAt(sp, game.night);

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
          /* A species with a landmark and a spread stays near its landmark: the
             lamp field is a field, not a survey of the whole lake. */
          const r = this.isAquatic() ? (sp.spread || 6) : 14;
          /* A creature that cannot leave the water should not be sent to a
             place where it would have to. Pick again until the ground is wet;
             after a few tries take it anyway, so a lake that has somehow
             drained does not leave a water animal standing still. */
          let tx = this.homeX, tz = this.homeZ;
          for (let tries = 0; tries < 8; tries++) {
            tx = this.homeX + (Math.random() - 0.5) * 2 * r;
            tz = this.homeZ + (Math.random() - 0.5) * 2 * r;
            if (!this.isAquatic() || world.liquidAt(Math.floor(tx), Math.floor(this.y), Math.floor(tz))) break;
          }
          this.tx = tx; this.tz = tz;
        }
        tgtX = this.tx; tgtZ = this.tz;
      }
      /* Herd: the herd is how prey survives. One that has wandered more than
         about a throw of it walks back towards the middle of its own kind --
         a middle the game works out once a tick, not once per animal. */
      if ((sp.herd || 1) > 1 && this.state === 'wander') {
        const h = game.herdCentres && game.herdCentres[sp.id];
        if (h && h.n > 1 && Math.hypot(h.x - this.x, h.z - this.z) > 12) { tgtX = h.x; tgtZ = h.z; }
      }
      this.alarm = Math.max(0, this.alarm - dt * 0.3);

      // movement
      const inWater = world.liquidAt(Math.floor(this.x), Math.floor(this.y + 0.2), Math.floor(this.z));
      const dx = tgtX - this.x, dz = tgtZ - this.z;
      const d = Math.hypot(dx, dz);
      let spd = 0;
      if (d > 0.8) {
        /* The table gives a speed on foot and, for the bodies that have them, a
           speed in the air and in the water (docs/en/03 s3: "3.2 (fly 7.0)").
           The owl that crosses the valley is not doing it at walking pace. */
        const cruise = this.isFlyer() ? (sp.flySpeed || sp.speed || 3)
                     : (inWater && sp.swimSpeed) ? sp.swimSpeed
                     : (sp.speed || 3);
        const base = this.state === 'flee' || this.state === 'chase' ? cruise * 1.7 : cruise * 0.42;
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
            // out of the water: swim home, and home is wherever it was born --
            // in the lake. The lake does not have to be named for it to get back.
            const ax = this.homeX - this.x, az = this.homeZ - this.z, al = Math.hypot(ax, az) || 1;
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
      this.squash = Math.max(0, this.squash - dt * 3.2);

      // altitude
      if (this.isFlyer()) {
        const gy0 = groundY(world, Math.floor(this.x), Math.floor(this.z), Math.floor(this.y + 6));
        const base = sleeping ? gy0 + 1.2 : this.flyY;
        const target = base + Math.sin(this.t * 1.1 + this.phase) * 0.9;
        this.y += (target - this.y) * Math.min(1, dt * 2.2);
        // a roosting owl is a bird on a branch: wings folded, no beat
        this.airAmt = sleeping ? 0 : (this.y > gy0 + 0.4 ? 1 : 0);
        this.groundY = gy0;
      } else if (this.isAquatic()) {
        const wt = waterTop(world, Math.floor(this.x), Math.floor(this.z), world.h - 1);
        const gy0 = groundY(world, Math.floor(this.x), Math.floor(this.z), Math.floor(this.y + 4));
        /* Hover a metre or two under the surface -- but never through the
           bottom. The lake is only two blocks deep at its edges, and a fixed
           depth below the surface puts an animal inside the lakebed there, which
           is a water animal standing in the mud. */
        const depth = 1.2 + Math.sin(this.t + this.phase) * 0.8;
        const target = Math.max(gy0 + 0.35, wt - depth);
        this.y += (target - this.y) * Math.min(1, dt * 1.6);
        this.groundY = gy0;
      } else if (this.isAmphibian()) {
        // the frog sits on the bank, and floats just under the surface when it is in water
        const gy0 = groundY(world, Math.floor(this.x), Math.floor(this.z), Math.floor(this.y + 4));
        const wt = waterTop(world, Math.floor(this.x), Math.floor(this.z), world.h - 1);
        const hop = sp.hop;
        if (inWater && wt > gy0) {
          this.y += (Math.max(gy0, wt - 0.3) - this.y) * Math.min(1, dt * 6);
          this.vy = 0; this.airAmt = 0; this.crouch = 0;
        } else if (hop) {
          /* On land a frog does not slide: it hops. Before this the height of an
             amphibian was lerped onto the ground every frame, which meant the
             twelve frogs in the valley never once left it -- the legs animated a
             walk no body was doing. Now the launch is an impulse and the arc is
             gravity's, and the landing is where the squash comes from. */
          if (this.speed > 0.2) {
            this.hopT -= dt;
            this.wind = Math.min(1, this.wind + dt / 0.18);
            if (this.hopT <= 0 && this.y <= gy0 + 0.02) {
              this.vy = hop.up;
              this.hopT = hop.period * (0.75 + Math.random() * 0.55);
              this.wind = 0;
            }
          } else { this.hopT = 0; this.wind = 0; }
          this.vy -= GRAVITY * dt;
          this.y += this.vy * dt;
          if (this.y <= gy0) {
            if (this.vy < -1) this.squash = Math.min(0.3, -this.vy / 60);
            this.y = gy0; this.vy = 0;
          }
          const airWant = this.y > gy0 + 0.02 ? 1 : 0;
          this.airAmt += (airWant - this.airAmt) * Math.min(1, dt * (airWant ? 7 : 11));
          this.crouch = this.y <= gy0 + 0.02 ? this.wind : 0;
        } else {
          this.y += (gy0 - this.y) * Math.min(1, dt * 6);
          this.airAmt = 0; this.crouch = 0;
        }
        this.groundY = gy0;
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
      /* Downward acceleration per particle, in m/s^2. One gravity for all of
         them was wrong: bubbles fell out of the lake and fireflies sank into
         the ground inside their own lifetime. Negative is buoyant, 0 hovers
         (motes, dust, fireflies), the default is the old 1.2 for embers. */
      this.grav = new Float32Array(this.max);
      this.bPos = gl.createBuffer(); this.bCol = gl.createBuffer(); this.bSize = gl.createBuffer();
      this.fBuf = new Float32Array(this.max * 3);
      this.sBuf = new Float32Array(this.max);
      this.cBuf = new Uint8Array(this.max * 4);
    }
    spawn(x, y, z, vx, vy, vz, life, col, size, grav) {
      if (this.n >= this.max) return;
      const i = this.n++;
      this.px[i] = x; this.py[i] = y; this.pz[i] = z;
      this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
      this.life[i] = life; this.max_life[i] = life;
      this.grav[i] = grav === undefined ? 1.2 : grav;
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
            this.size[i] = this.size[j]; this.grav[i] = this.grav[j];
            this.col[i * 4] = this.col[j * 4]; this.col[i * 4 + 1] = this.col[j * 4 + 1];
            this.col[i * 4 + 2] = this.col[j * 4 + 2]; this.col[i * 4 + 3] = this.col[j * 4 + 3];
          }
          i--; continue;
        }
        this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
        this.vy[i] -= this.grav[i] * dt;
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
  N.groundY = groundY;

})(window.FRUTARIA = window.FRUTARIA || {});
