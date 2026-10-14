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
  /* The pull a wing works against when it leans into a turn. The game's own
     gravity is 23 m/s^2 because an arcade fall has to feel like one; the tilt a
     body shows is not about whether it holds the arc (the code holds the arc),
     it is about how much of the turn the body shows, and at these speeds a real
     wing shows atan(sideways / 9.8). */
  const LEAN_G = 9.8;

  /* How far under the surface the water holds a body it is holding up. One
     number for every such body: the twelve wild frogs of the valley and the
     body you wear while you are one float at the same depth, and the creature
     step and the player step both read this. It is measured to the feet, so a
     0.5 m body at this level is entirely under the surface plane. */
  const FLOAT_UNDER = 0.3;

  /* How far ahead of itself a flying body looks for ground it would have to
     climb, in metres. It is the reach of the body's own climb: the climb is
     eased at 2.2/s, so a body closes 63% of the height it wants in 0.45 s, and
     at the seven metres a second an owl crosses the valley at that is about the
     three metres of ground coming at it. Look further than that and the body is
     climbing for a hill it could simply have gone round. */
  const AHEAD = 7;

  /* ============================ player ============================ */
  class Player {
    constructor(world) {
      this.world = world;
      this.x = 0; this.y = 40; this.z = 0;
      this.vx = 0; this.vy = 0; this.vz = 0;
      this.yaw = 0; this.pitch = 0;
      // what the body actually looks like: facing and bank are eased, never snapped
      this.faceYaw = 0; this.bank = 0;
      /* and the third angle: how much the body is pointing up or down along the
         path it is taking. Nose down positive, because that is the angle rotX
         takes. Only a body the air or the water is holding up has one -- feet
         keep a body level. */
      this.tilt = 0;
      // and the wing beat, 0..1: a body riding its wings down beats far less
      // than one climbing for height
      this.flap = 1;
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
      // the speed the body is trying to travel at this frame, m/s (the draw
      // sizes a swim stroke against it)
      this.cruise = 0;
      this.bob = 0;
      /* what the body's own motion tells the animation, in 0..1: how far off the
         ground it is, how loaded its legs are before a hop, and how much it
         flattened on the landing. Nothing here is a mood -- all three are read
         off the physics, so a body that does not hop never animates as if it did. */
      this.airAmt = 0; this.crouch = 0; this.squash = 0;
      this.hopT = 0; this.wind = 0;
      /* how far the water is holding this body up, eased 0..1. The vertical
         branch decides it every frame; the draw is the only thing that reads it
         back, and it is what tells a body built for water whether its legs are
         trailing behind it or standing under it. */
      this.held = 0;
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
          /* The floor is the top of the highest solid layer the feet came into
             this frame -- and only layers the feet came into. The scan used to
             start from `this.y`, so the answer was never below where the feet
             already were, and a body resting on a surface was parked half a
             millimetre above where it had been at the start of the frame
             instead of on the surface: gravity pulled it down 6.4 mm, the snap
             put it back up 0.5 mm, and that is a 6 mm sawtooth about five times
             a second that never stops. The lens sits on the feet, so the whole
             frame rides that sawtooth -- and it rides it hardest close to the
             lens, which is why it reads as the nearby blocks shaking and not as
             the world sinking. Layers above the feet are a ceiling, not a floor:
             they used to be folded into the same maximum, which could lift a
             body a body-height when its head was in a wall. */
          const y0 = Math.floor(ny + 0.001), feet = Math.floor(this.y + 0.001);
          const y1 = Math.min(Math.floor(ny + s[1] - 0.001), feet);
          let best = null;
          for (let yy = y0; yy <= y1; yy++) {
            if (this.colAt(this.x, yy, this.z)) best = yy + 1;
          }
          if (best !== null) { this.y = best + 0.0005; this.vy = 0; this.grounded = true; }
          else this.vy = 0;      // blocked above the feet: stop the fall, do not climb
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
      const W = this.world;
      const cx = Math.floor(this.x), cz = Math.floor(this.z);
      const cyHead = Math.floor(this.y + this.size()[1] - 0.12);
      this.headWater = W.liquidAt(cx, cyHead, cz);
      /* Whether this body is in the water at all: the surface of the column it
         is in is above its feet. The question used to be put to the cells -- is
         the cell at the body's feet, or the one at its middle, liquid -- and
         that flips for a body straddling the surface. Measured at (56.5,14.9,
         94.5) with a frog pushed up to the surface by its own push key: the cell
         under its feet is water while its origin is under 14.903 and air above
         it, the body bobs across that line, and `inWater` went on and off 42
         times in 240 frames -- and with it the whole water branch of its
         movement: the water's hold and gravity in alternation, a cruising speed
         of 4.65 and one of 4.23, and the stroke of its legs, which snapped 0.19 m
         out and back again every few frames. The surface of the column is a
         property of the place rather than of where the body happens to sit
         inside it, which is the same reason `heldUp` a few lines below reads the
         column and not the body, and the reason that one stopped chattering. */
      const wSurf = waterSurface(W, cx, cz);
      this.inWater = wSurf >= 0 && this.y < wSurf;
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
      const fly = f.fly && !this.inWater;
      /* Whether the feet were on the ground when the frame started. Two things
         make this harder than reading `grounded`.
         The vertical branch below answers "is this body in the air or in the
         water" for the whole frame, and for a body with wings it answers "in the
         air" whatever the collision said a moment ago -- so anything that wants
         to know whether the body is standing has to ask before that branch runs,
         not after.
         And for a body with wings `grounded` is the wrong question anyway: the
         wing branch clears the flag every frame, so an owl running along a field
         is never once reported standing on it. A rule that asks the flag gives
         that owl the attitude of a body in a dive -- and the arithmetic makes it
         worse the slower it goes, because the one frame of falling the ground
         then undoes (-0.38 m/s) is divided by a horizontal speed that is going to
         nothing. Read off the draw: an owl standing still held 0.43 rad of
         nose-down, and its toes reached 5 cm under the floor it was standing on.
         So the question is put to the ground instead: how far above the level it
         would be standing at in this column is this body. The 2 cm of slack is
         the same one the step-up and the water's hold use. */
      const onFoot = this.grounded || this.y - standY(W, cx, cz, this.y) < 0.02;
      /* What the body is trying to travel at. A body with wings travels at the
         speed its species flies at, not at the speed it walks at: the wild owls
         of the valley cross the valley at 7 m/s (data/creatures.js `flySpeed`)
         while you are wearing one, and an owl that putters along at walking
         pace is a body with a speed problem. On foot the body's own `speed`
         multiplier still decides, because on foot every body is measured
         against the human body's 4.7 m/s. */
      let speed = (fly && f.flySpeed ? f.flySpeed : 4.7 * (f.speed || 1)) * (sprint ? 1.45 : 1);
      if (this.inWater) speed *= (f.swim || 0.62);
      // a body that hops is thrown forward by the hop; it does not bleed speed
      // in the air the way a body that merely fell off a ledge does
      if (!this.grounded && !fly && !this.inWater) speed *= (f.hop ? 1 : 0.92);
      let dx = 0, dz = 0;
      const fx = Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const rx = Math.cos(this.yaw), rz = Math.sin(this.yaw);
      if (inp.fwd) { dx += fx; dz += fz; }
      if (inp.back) { dx -= fx; dz -= fz; }
      if (inp.right) { dx += rx; dz += rz; }
      if (inp.left) { dx -= rx; dz -= rz; }
      const len = Math.hypot(dx, dz);
      if (len > 0) { dx /= len; dz /= len; }
      // what the body is trying to travel at this frame. The draw reads it: a
      // stroke is sized against the speed it is swimming at, not against a
      // guess about which animal the body is.
      this.cruise = speed;

      /* ---- a body the fluid is holding up goes where it is going ----
         Wings stay up by moving forward, and a body in water has nothing to
         push against but the water. Neither can change course on the spot: the
         course bends. `turn` is how fast the body can bend it -- the most
         radians a second it adds to its heading at its own cruising speed --
         and above that speed the arc it holds gets wider, not the turn faster,
         because the same sideways push has more body to swing about.
         What this replaces: the velocity was eased straight toward wherever the
         mouse pointed, with 22 units of push in air and 12 in water. Measured,
         a swimming body peaked at a course change of 94 rad/s, came about 45
         degrees in 0.17 s and 90 degrees in 1.9 s, and its path was a polyline
         whose corners the easing had merely softened.
         A body on foot is deliberately not in this branch: feet grip the
         ground, and the player's turning on foot is the game's answer to the
         mouse, not an animal's answer to momentum. */
      const arc = f.turn || 0;
      const hd0 = Math.hypot(this.vx, this.vz) > 0.05 ? Math.atan2(this.vx, -this.vz) : this.faceYaw;
      if (arc > 0 && (fly || this.inWater)) {
        let spd = Math.hypot(this.vx, this.vz);
        // at rest there is no course to bend: a body that starts from nothing
        // starts in the direction it is pushing, the way an animal pushes off
        const have = spd > 0.05 ? Math.atan2(this.vx, -this.vz) : (len > 0 ? Math.atan2(dx, -dz) : hd0);
        const want = len > 0 ? Math.atan2(dx, -dz) : have;
        const d = N.angleDelta(have, want);
        /* The body does not push at full sideways effort over a few degrees of
           error: the correction it aims for is proportional to how far off
           course it is, and only a wide correction is a full-effort one.
           Without that, a mouse jitter of a few degrees at 3 Hz had the body
           carving at its limit on every frame and rolling with it. */
        const rate = Math.min(arc * Math.min(1, speed / Math.max(spd, 0.01)), 2.2 * Math.abs(d));
        const bend = Math.min(Math.abs(d), rate * dt);
        const hd = have + (d < 0 ? -bend : bend);
        // and the fluid takes the speed back when the body stops pushing: it
        // coasts out over a second or two instead of stopping dead, because a
        // body with no brakes does that
        spd += ((len > 0 ? speed : 0) - spd) * N.ease(len > 0 ? 2.4 : 1.2, dt);
        this.vx = Math.sin(hd) * spd;
        this.vz = -Math.cos(hd) * spd;
      } else {
        const accel = fly ? 22 : (this.grounded ? 34 : (f.hop ? 18 : 12));
        this.vx += (dx * speed - this.vx) * Math.min(1, accel * dt / Math.max(speed, 1));
        this.vz += (dz * speed - this.vz) * Math.min(1, accel * dt / Math.max(speed, 1));
      }

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
      /* ---- the lean is what the arc costs ----
         A body carried along bends its path by pushing sideways against the
         fluid, and the tilt is that push: sideways acceleration over the pull
         of the earth. So the lean is no longer a constant times how fast the
         facing happens to be swinging -- it is read off the arc the body is
         actually holding, which means a body that is only correcting a few
         degrees leans a few degrees, and a body at the tightest arc its data
         allows leans the full 0.45. */
      const hd1 = spd > 0.05 ? Math.atan2(this.vx, -this.vz) : hd0;
      const bendRate = spd > 0.3 ? Math.abs(N.angleDelta(hd0, hd1)) / Math.max(dt, 0.001) : 0;
      const lean = (fly || this.inWater)
        ? Math.max(-0.45, Math.min(0.45, Math.atan(bendRate * spd / LEAN_G)))
        : 0;
      this.bank += (lean - this.bank) * N.ease(4.5, dt);

      /* ---- is the water deep enough to hold this body up at all? ----
         The same test the creature step already makes for its own water
         animals: compare the surface of the column with the level the body
         would be standing at in it. A lake is a body of water the animal floats
         in; a one-block shore shelf is a bottom it stands on and pushes off
         from, and 183 columns of Mirrorlake are that shelf. Read once a frame
         for a body that is in water, and deliberately not as a distance from
         the body to the surface: a rule that turns on and off as the body
         crosses its own equilibrium switches the force law back and forth and
         builds a sawtooth out of nothing, which is the bug this file was last
         fixing. Depth of the column is a property of the place, not of the
         body's height, so it cannot chatter. */
      /* the cell convention again, one below the surface height: this asks
         whether the column holds water deep enough past the level the body would
         stand at for the water to be holding the body rather than the body
         standing on the bottom -- see `waterSurface` by the helpers. */
      const wt = this.inWater ? wSurf - 1 : -1;
      const bedTop = this.inWater ? standY(W, cx, cz, this.y) : -1;
      const heldUp = canBreathe && wt > bedTop;

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
        /* The beat belongs to what the body asks for. A body with wings that can
           glide, and that is not asking for height, rides them: the stroke eases
           out to a faint one and the wings stay spread. Wings that cannot glide
           have to beat or they come down, so for them the beat never leaves.
           Before this a flying body beat at the same 1.75 strokes a second
           whether it was climbing or falling at 15 m/s with its wings spread. */
        const flapWant = (up || down) ? 1 : (f.glide ? 0.15 : 1);
        this.flap += (flapWant - this.flap) * N.ease(3.5, dt);
        this.grounded = false;
      } else if (this.inWater && (heldUp || !this.grounded)) {
        /* Up and down in water is the same push that drives a body forward,
           aimed differently, so how much authority a body has over its own
           depth is a fraction of how fast it moves through the water: a frog
           that swims at 4.7 m/s comes up at about a metre a second, and a human
           who swims at 2.9 does not surface much faster than it sinks. The
           water takes it back at the rate it takes the forward speed back.
           What was missing is the water's own answer. Every body in this branch
           carried the same fixed downward pull whatever it was made of, so a
           frog let go of in mid-water sank at a terminal 0.89 m/s, landed on the
           lakebed 3 m below, was reported standing on the bottom, and stopped
           there -- a water animal that stops moving sank. A body built for water
           is a body the water holds up: the wild frogs of the valley float just
           under the surface and never touch the bottom of the deep part, and the
           body you wear was the only water-breathing body in the valley that
           went down. So the pull is the water's now: a body the water is holding
           is pushed back toward the level it holds it at, harder the further
           below that level it is, and the same drag that takes its forward speed
           takes the arrival -- it comes up and stops, instead of coming up only
           to be pulled down again. The hold is a level, not a leash. A body that
           is *asking* to go down is a body swimming down: it keeps the dive it
           always had, the lakebed stays reachable, and the water takes it back
           up the moment the key comes off -- including off the bottom, which is
           why the branch is picked by `heldUp` and not by `!grounded`. A body
           that breathes air is not held up at all: it has to kick to stay off
           the bottom, and that is what it costs to wear a body that was not
           built for the lake. */
        const push = speed * 1.5;
        // the level the water holds a body at is a height, not a cell: 30 cm
        // under the surface of the column, which is where a floating back is
        if (heldUp && !inp.sneak) this.vy += ((wSurf - FLOAT_UNDER) - this.y) * 2.2 * dt;
        else this.vy -= 5.2 * dt * 0.55;
        this.vy += (inp.jump ? push : 0) * dt;
        if (inp.sneak) this.vy -= push * 0.6 * dt;
        this.vy -= this.vy * Math.min(0.9, 3.2 * dt);
        this.vy = Math.max(-4.5, Math.min(4.6, this.vy));
        /* The surface is the ceiling of the water's hold: a body the water is
           holding up cannot kick itself above the level the water holds it at,
           and so cannot kick itself out of the water. It leaves the way a body
           leaves water -- into the shallows where the bottom is, and up off its
           own feet from there -- which is the route the branch below already
           documents, and which is why the ceiling belongs to `heldUp` and not to
           the water: a body standing on a bottom it can reach keeps the push-off
           it has always had. Without it a body pushed at the surface by its own
           push key crosses the surface, loses the water, falls back and crosses
           it again: at (56.5,14.9,94.5) a frog with the key held went over that
           line 45 times in 240 frames, and every crossing took the stroke off
           its legs and put it back on again. */
        if (heldUp && this.y >= wSurf - FLOAT_UNDER && this.vy > 0) this.vy = 0;
      } else {
        /* Feet that are on the bottom are feet that can push off it, water
           around them or not. That is the whole of getting out of a lake: the
           shore of Mirrorlake is one block of water deep for 183 columns, so
           the way out is to swim into the shallows, stand up, and go. The
           branch used to be picked by `inWater` alone, which left a body
           standing on the lakebed with the water at its chest no ground under
           it and no way to launch: in a one-block shore shelf, holding the jump
           key from the bottom gave a highest point of 14.93 m against a shore
           whose top face is at 15.0, and the body bobbed there for as long as
           the key was held. */
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

      /* ---- the body points along the path it is taking ----
         A body on foot stays level whatever it does, because its feet hold it
         level. A body the air or the water is holding up climbs nose-up and
         dives nose-down, and the angle is simply the one its own path makes.
         Nothing did this before: an owl that let go of the climb key came down
         at its glide speed with its body dead level, and a frog crossing to the
         bottom swam along horizontally like a periscope -- the path curved and
         the body did not know it. `tilt` is nose-down positive, because that is
         the angle rotX takes, and it is eased like every other angle. */
      const hs = Math.hypot(this.vx, this.vz);
      /* `!onFoot` is the whole of the rule above, and it was missing: a standing
         owl read the one frame of falling the ground then undid as a descent,
         held 0.6 rad of nose-down for as long as it stood there, and its legs
         reached 8 cm through the floor. What "on foot" means, and why it is not
         the flag the collision leaves behind, is argued where it is measured --
         in the intended velocity block above. */
      const tiltWant = !onFoot && (fly || this.inWater) && (hs > 0.3 || Math.abs(this.vy) > 0.3)
        ? Math.max(-0.6, Math.min(0.6, Math.atan2(-this.vy, Math.max(hs, 0.5))))
        : 0;
      this.tilt += (tiltWant - this.tilt) * N.ease(4.5, dt);

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
          /* The move the body asked for, read off the speed **before** `axis`
             runs: `axis` zeroes the speed along the axis it had to stop, so the
             retry below used to be handed a zero and never moved the body at
             all. The lift was then kept although it had bought nothing, and a
             body pressed against a wall it cannot climb was raised 0.15 m a
             frame and had to fall back: walked at a bank two metres tall on one
             flat shelf, a human stood on the ground in 34% of the frames and
             its height swung 0.124 m within a second, a bear in 31%, and even
             with nothing built in front of them they were on the ground in 89%
             and 78% with the same swing. That is the wobble at the water's
             edge. And the lift had never once carried a body up a step it could
             reach: a bear whose own record says its legs reach 1.1 m, walked at
             a step of one metre, gained 0.124 m in three seconds. */
          const wx = this.vx * sdt, wz = this.vz * sdt;
          let hit = this.axis('x', wx);
          hit = this.axis('z', wz) || hit;
          if (hit) {
            const bx = this.x, bz = this.z;      // where the blocked move left it
            let done = false;
            for (let up = 0.15; up <= step + 1e-6 && !done; up += 0.15) {
              const oy = this.y;
              this.y = oy + up;
              if (this.hits(this.x, this.y, this.z)) { this.y = oy; continue; }
              this.x = ox; this.z = oz;
              this.axis('x', wx); this.axis('z', wz);
              /* A lift is worth its height only when the body ends up somewhere
                 its own feet could not reach. Where it lands back at the place
                 the blocked move left it, what is in front of the body is not a
                 step: it is a wall taller than the body can climb, and the body
                 goes back down to its feet and stands there. */
              if (Math.hypot(this.x - bx, this.z - bz) < 1e-4) { this.y = oy; continue; }
              if (!this.hits(this.x, this.y - 0.02, this.z)) this.y -= 0.02;
              done = true;
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
      /* Feet that are on a surface are standing on it.
         `axis` reports contact only for a move it had to stop, and a body is
         parked 0.0005 m off the face it last hit, and the cell below is only
         sampled once the feet are 0.001 inside it -- so a frame has to sink
         0.0015 m before the surface is seen again. Gravity covers that on land
         (0.006 m in a frame), so a body standing on the ground is reported
         standing on every frame of it. In water it cannot: buoyancy cancels most
         of the weight and the drag leaves a terminal speed of about
         0.05 m/s, 0.0008 m a frame, so the cell below is sampled once every
         three frames. A body wading where the lake is one block deep -- and the
         shore of Mirrorlake is 183 such columns -- is then reported airborne the
         whole time it stands on the bottom: air pose, and a third of the push it
         should have (accel 12 against 34). So after the displacement, feet
         within 2 cm of a solid and the body not rising means it is standing.
         2 cm is the distance the step-up above already uses to settle a body
         back onto the ledge it just climbed, and it is far less than the fall a
         body accumulates once it has actually left a surface -- 0.006 m in the
         first frame of a drop, 0.10 m by the fifth -- so a body that walked off
         a step is airborne again within a frame or two. */
      if (!this.grounded && !fly && this.vy <= 0 && this.colAt(this.x, Math.floor(this.y - 0.02), this.z)) this.grounded = true;
      // what the animation is allowed to know
      // eased, not snapped: a body resting on the ground flickers out of
      // `grounded` for a frame at a time, and a pose that hiccups with it looks
      // like a seizure rather than a breath
      const airWant = (this.grounded || this.inWater) ? 0 : 1;
      this.airAmt += (airWant - this.airAmt) * Math.min(1, dt * (airWant ? 7 : 11));
      /* and the water's answer, kept for the draw. Eased for the same reason: a
         body crosses the water's hold at the surface and at the lakebed, and a
         pose that snaps there shows the seam. `heldUp` is a property of the
         column, so it cannot chatter; `grounded` is the part that can, which is
         why the pose ramps instead of switching. */
      const heldWant = (this.inWater && heldUp && !this.grounded) ? 1 : 0;
      this.held += (heldWant - this.held) * Math.min(1, dt * 6);
      if (!this.grounded) this.crouch = 0;
      if (this.grounded && !wasGrounded) {
        this.squash = Math.min(0.3, Math.max(0, -vyBefore) / 55);
        /* and the ground arrests the body's turn the way it arrests its fall.
           The pitch is the angle of the path the body was taking through the air
           or the water, and that path ends at the moment the feet arrive: an owl
           that came down off a 1 m drop at 0.43 rad carried its nose for a
           quarter of a second afterwards with its feet flat on the floor, and
           the nose carried its toes 5 cm under it. */
        this.tilt = 0;
      }
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
  /* The same column read again, but this time for the ground rather than for
     the highest thing in the way. A crown and the trunk that holds it up are
     solid -- a body can climb a tree and stand on it, and the player does --
     but they are not the surface of the valley, and an animal put down on one
     is an animal in a tree. The spawn code scans from the top of the world, and
     without this it found a canopy instead of the ground in 509 of 600 tries:
     two bears standing on spruce crowns at y=45, frogs in the leaves, and a
     flyer given a flight height of 53 in a world 48 tall. */
  function terrainY(w, x, z, from) {
    const bx = x | 0, bz = z | 0;
    for (let y = from; y > 0; y--) {
      if (!w.solidAt(bx, y, bz) || N.TREE_BLOCK[w.get(bx, y, bz)]) continue;
      return y + 1;
    }
    return 1;
  }
  /* The surface a body on foot actually stands on. Two things the plain column
     read gets wrong, and a bear walking the ridge met both. `groundY` answers
     "the highest solid thing in this column", and a crown is solid, so foliage
     at feet level reads as a step: the bear took the step, found the next block
     of the same crown at its new feet, took that step too, and climbed the tree
     -- measured over a day, one bear spent 22061 of 25200 frames standing on
     leaves 12 m above the ground, and went up 105 m and back down 114 m riding
     the crowns along the ridge. And the altitude used to look up 4 m while the
     step test looked up 3, so a needles block five blocks over its head answered
     to the altitude and not to the step, and lifted it there.
     So: the ground, with the crown over it ignored, read at the height of the
     feet rather than from the top of the column. A body stands on the top of
     the highest block level with its feet or a step above them, and walks
     through the bush with its shoulders in it. The bound is exact: a surface at
     most 1.6 m above the feet is the top of a block at most floor(y + 0.6),
     which is what the step test implies -- when that test lets a step through,
     the two answers are the same block. */
  function standY(w, x, z, y) {
    return terrainY(w, x, z, Math.floor(y + 0.6));
  }
  /* Whether a water animal may be in this column at all -- the same test the
     spawn code makes: the column has to hold at least two blocks of water, so
     there is somewhere to hover. Testing one cell at the animal's feet instead
     rejects an animal that bobs, and testing only "is there water anywhere"
     lets it climb a one-block shelf, stand above the surface, and walk out of
     the lake on its own feet. Returns the water top, or -1 for "not water". */
  function waterColumn(w, x, z) {
    const wt = waterTop(w, Math.floor(x), Math.floor(z), w.h - 1);
    if (wt < 0) return -1;
    const gy = groundY(w, Math.floor(x), Math.floor(z), wt + 2);
    return wt + 1 - gy >= 2 ? wt : -1;
  }
  /* Whether a body held up by air may be at this place at all: the cell it would
     occupy has to be neither rock nor water. A flying body is the only kind that
     has no ground under it, so this is the one question its movement has to keep
     answering -- sideways, and up.
     Foliage is not rock here, any more than it is for a body on foot two pages
     above: a bear walks through a bush with its shoulders in it. Read as a wall
     and as a ceiling at once, a crown makes a room with no door -- the body is
     refused sideways into the leaves and refused up through them, and what it is
     left with is the height the roof hands it. Measured over forty seconds of a
     night: one of six owls flew 114 m at one height it could not leave, and the
     flock had a crown over its head in 6-30% of its frames. */
  function airCell(w, x, y, z) {
    const bx = x | 0, by = y | 0, bz = z | 0;
    if (w.liquidAt(bx, by, bz)) return false;
    return !w.solidAt(bx, by, bz) || !!N.TREE_BLOCK[w.get(bx, by, bz)];
  }
  /* The lowest thing a body could put its head through in the column it stands
     in: the underside of a roof, the beam of a room, the glass of a tower. The
     search starts over the body's own cell and answers `top` when it finds
     nothing, which is what the sky's own roof is: for a body in the open that is
     the top of the world, one block under the top of the grid, so a body is not
     allowed to stand with its head through the ceiling of the valley. Foliage is
     not in it -- a body on foot walks through a bush with its shoulders in it and
     a bird flies through a crown (docs/en/03 s5). */
  function roofY(w, x, z, from, top) {
    for (let y = from; y < w.h; y++)
      if (w.solidAt(x, y, z) && !N.TREE_BLOCK[w.get(x, y, z)]) return y;
    return top;
  }
  function waterTop(w, x, z, from) {
    for (let y = from; y >= 0; y--) if (w.liquidAt(x, y, z)) return y;
    return -1;
  }
  /* The same column read as a height rather than as a cell: the top face of the
     topmost water block, which is where the surface of the water is. `waterTop`
     answers which cell, and most of this file wants the cell -- how deep the
     column is, whether the bottom is within reach, whether the body can stand on
     it -- but a body the water is holding up is held at a *height*, and the two
     conventions are one apart. The float level used to be taken off the cell
     index, which set every body the water holds a full block under the surface:
     the wild frogs of Mirrorlake hover 30 cm down and 3 m down (see the dive
     cycle below) and at (56.5,94.5) they were 1.3 m down and 4 m down, and the
     body you wear with them. */
  function waterSurface(w, x, z) {
    const t = waterTop(w, x, z, w.h - 1);
    return t >= 0 ? t + 1 : -1;
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
  /* Two bodies in the same place. Each one's footprint is the rectangle its own
     trunk is carved from (MODEL_W), turned by its heading: the pair is in one
     place when no direction separates the two rectangles, and the direction they
     overlap least along is the way out -- the shortest way, and the one that
     fights the way either of them is going least. A body is not a circle: two
     bears end on are 1.1 m from nose to tail, and a circle wide enough to keep
     them apart would keep a bear and a frog three metres apart.
     TOUCH is how far into a neighbour a body may get at all: two lamps drifting
     against one another touch, and a body that has been pushed into one is let
     back out the way it came rather than refused every place it could go. */
  const TOUCH = 0.02;
  function bodyClash(a, ax, az, b) {
    /* Two bodies share a space only where they also stand at one height. The
       height they have in common has to be more than a graze before it counts:
       a lamp riding on the crown of another's bell is on top of it, not inside
       it, and pushing the pair apart sideways for a 5 mm graze moves a body half
       a metre for nothing. Measured against the shorter of the two bodies, so
       the rule is the same for a frog and for a bear. */
    const vOver = Math.min(a.y + a.tall, b.y + b.tall) - Math.max(a.y, b.y);
    if (vOver <= 0.15 * Math.min(a.tall, b.tall)) return null;
    const s = Math.sin(a.yaw), k = -Math.cos(a.yaw);       // a's forward; its right is (-k, s)
    const s2 = Math.sin(b.yaw), k2 = -Math.cos(b.yaw);
    const axc = ax + s * a.oz - k * a.ox, azc = az + k * a.oz + s * a.ox;
    const bxc = b.x + s2 * b.oz - k2 * b.ox, bzc = b.z + k2 * b.oz + s2 * b.ox;
    const dx = axc - bxc, dz = azc - bzc;
    let pen = 1e9, ux = 0, uz = 0;
    for (const c of [[s, k], [-k, s], [s2, k2], [-k2, s2]]) {
      const ra = a.hw * Math.abs(-k * c[0] + s * c[1]) + a.hl * Math.abs(s * c[0] + k * c[1]);
      const rb = b.hw * Math.abs(-k2 * c[0] + s2 * c[1]) + b.hl * Math.abs(s2 * c[0] + k2 * c[1]);
      const d = dx * c[0] + dz * c[1];
      const p = ra + rb - Math.abs(d);
      if (p <= 0) return null;                    // a direction separates them
      if (p < pen) { pen = p; ux = c[0]; uz = c[1]; }
    }
    if (Math.abs(dx) < 1e-4 && Math.abs(dz) < 1e-4) {
      /* Dead on top of one another: every way out is the same distance, and two
         bodies that both pick the same one never part. Each picks its own. */
      const t = ux; ux = -uz; uz = t;
    } else if (dx * ux + dz * uz < 0) { ux = -ux; uz = -uz; }
    return { pen, ux, uz };
  }
  /* Can this body be put at (x, z) at the height it is at? The same question the
     body's own movement asks of a step, asked of a place it has already been
     pushed into by another body: a body in the air needs the room its whole body
     takes up, feet to head; a body that cannot leave the water needs a column
     with somewhere to hover; a body on foot needs a surface under its feet that
     is not a wall it cannot climb. The world keeps the last word: a body is
     never shoved into a bank or out of the lake it cannot leave, because another
     body was standing where it wanted to be. */
  function bodyRoom(w, c, x, z) {
    const bx = Math.floor(x), bz = Math.floor(z);
    if (bx < 7 || bz < 7 || bx > w.w - 7 || bz > w.d - 7) return false;
    if (c.isFlyer()) {
      for (let y = Math.floor(c.y); y <= Math.floor(c.y + c.tall); y++)
        if (!airCell(w, bx, y, bz)) return false;
      return true;
    }
    /* A body that cannot leave the water is asked the water's own question --
       the same one its movement asks, and the same one its spawn makes: is this
       a column with somewhere to hover. Asking it instead about the single cell
       at the body's feet refuses a body that bobs at the surface, which is every
       one of them: the shove out of a neighbour was refused in every direction
       for a lamp riding high in its column, and it stayed 0.49 m inside the
       other lamp for as long as they both rode there. */
    if (c.isAquatic()) return waterColumn(w, x, z) >= 0;
    /* A body on foot is asked the same question its own movement asks of a step:
       the surface it would stand on may not be a wall it cannot climb. The drop
       is not part of the question -- a body walks off a ledge the same way it is
       pushed off one, and the ground takes the answer from there. Bounding the
       drop as well (the first version did) refused every shove for a frog
       floating a metre and a half over the bed of the lake, which is where every
       frog in Mirrorlake spends the afternoon. */
    const gy = standY(w, bx, bz, c.y);
    return gy - c.y < 1.6 && !w.solidAt(bx, Math.floor(gy + 0.2), bz);
  }

  class Creature {
    constructor(spec, x, y, z) {
      this.sp = spec;
      this.x = x; this.y = y; this.z = z;
      /* How tall this body stands in the world: the model's own height at the
         scale the data gives it. A body is not a point, and a rule that only
         asks about the cell a body's feet are in lets an owl walk into a room
         with a low roof and stand there with its head in the beam. */
      this.tall = (N.MODEL_H[spec.model] || 4) * (spec.scale || 0.2);
      /* And how wide the same body is: the rectangle its own trunk takes up, at
         the scale the data gives it, with the offset that rectangle sits at from
         the origin the body is drawn about. A body is not only tall, and a rule
         that only asks about the cell its feet are in lets two of them stand in
         one place -- which is what "one walked through the other" is. */
      const mw = N.MODEL_W[spec.model] || [0.5, 0.5, 0, 0];
      this.hw = mw[0] * (spec.scale || 0.2);        // across it
      this.hl = mw[1] * (spec.scale || 0.2);        // along it
      this.ox = mw[2] * (spec.scale || 0.2);
      this.oz = mw[3] * (spec.scale || 0.2);
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
      /* What a body likes, per body, so that a flock is not a formation. A
         bird's ceiling is the height it was born at; the height it actually
         holds is a few metres above whatever is under it, and how many is its
         own. A frog holds a depth of its own in the water, dives to a depth of
         its own, and comes back up to breathe on a cycle of its own. Without
         these three numbers every frog in the valley swims in one line 30 cm
         under the surface and every owl crosses the valley at one absolute
         height, which is what the report "it can only swim in a fixed layer"
         is: measured over ten minutes of the world running, all twelve frogs
         sat at a mean depth of 0.30 m, every one of them. */
      this.huntH = 2.6 + Math.random() * 3.4;      // metres above the ground it flies over
      this.diveTo = 0.5 + Math.random() * 3.0;     // how far under the surface this frog goes
      this.diveRate = 0.05 + Math.random() * 0.10; // and how fast that cycle runs, rad/s
      // the vertical velocity, and the same three signals the player carries, for
      // the same reason. It has to be a number: a body that is born on land and
      // hops integrates a fall out of this field on its very first frame.
      this.vy = 0;
      this.airAmt = 0; this.crouch = 0; this.squash = 0; this.hopT = Math.random() * 1.2; this.wind = 0;
      // and the fourth: the draw needs to know whether this body is moving
      // through water, because a body built for water kicks instead of walking
      this.inWater = false;
      // and the fifth: a body in the air or in the water turns by tilting
      this.bank = 0;
      // and the sixth: the water is holding this body up, not the ground under it
      this.held = 0;
      // and the seventh: the same body points along the path it is taking
      this.tilt = 0;
      // and the eighth: the wing beat, 0..1
      this.flap = 1;
      /* and the ninth: the surface of the step this body is in the middle of
         climbing, or null. It is not a per-frame decision: a body that has begun
         to raise itself onto a step has to be allowed to finish, or it takes the
         step at the height it had got to and ends up inside the ground. */
      this.climbTo = null; this.climbRate = 0;
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
          /* Where an errand is picked from. A species that names a landmark
             belongs to a disc of `spread` round that landmark, and its errands are
             picked from that disc -- not from a disc of the same size round
             wherever it happens to be standing. The errand is not the only thing
             that moves an animal: the tower that stands in the middle of the lamp
             field makes the way round it longer than the way that was asked for,
             so a lamp keeps the ground it gained sideways, and the errand after
             that starts further out and reaches further out again. Measured over
             five minutes of the field with errands picked from home, the ten lamps
             stood up to 9.2 m from the tower and 5.6 m from the home they were
             born on: a field twice the spread it was meant to be, and drifting
             away from the tower it is supposed to trace. */
          const r = this.isAquatic() ? (sp.spread || 6) : 14;
          const at = sp.at ? (N.ZONE_BY_ID[sp.habitat[0]] || {})[sp.at] : null;
          const ox = at ? at[0] : this.homeX, oz = at ? at[1] : this.homeZ;
          /* A creature that cannot leave the water should not be sent to a
             place where it would have to. Pick again until the ground is wet;
             after a few tries take it anyway, so a lake that has somehow
             drained does not leave a water animal standing still. */
          let tx = this.homeX, tz = this.homeZ, bestRoom = -1, lastX = tx, lastZ = tz;
          for (let tries = 0; tries < 8; tries++) {
            // a spread is a radius, not a half-width: the same shape the spawn sampled
            const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * r;
            const cx = ox + Math.cos(a) * rr, cz = oz + Math.sin(a) * rr;
            lastX = cx; lastZ = cz;
            if (this.isAquatic() && waterColumn(world, cx, cz) < 0) continue;
            /* And of the places it might go, the one with most room in it. An
               errand into the middle of a clump of its own kind is an errand to
               stand inside a neighbour: the ten lamps pick from a disc round the
               tower the size of two of them, so an errand picked at random is an
               errand into a neighbour, and the pair that meets there stays there
               -- they were measured 0.54 m inside one another, one bell drawn on
               top of another. */
            let room = 9;
            if (game && game.creatures) {
              for (const q of game.creatures) {
                if (q === this || q.sp.id !== sp.id) continue;
                /* where it stands, and where it is going: a place another body
                   is swimming to is claimed, whether that body is in it yet or
                   not. Two lamps whose errands were picked 4 m apart walked into
                   one another because each was measured against where the other
                   stood at the moment the pick was made. */
                const d = Math.min(Math.hypot(q.x - cx, q.z - cz),
                                   Math.hypot(q.tx - cx, q.tz - cz));
                if (d < room) room = d;
              }
            }
            if (room > bestRoom) { bestRoom = room; tx = cx; tz = cz; }
            if (bestRoom >= r * 0.4) break;      // roomy enough: stop looking
          }
          if (bestRoom < 0) { tx = lastX; tz = lastZ; }
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
      /* Whether the water has this body in it: the surface of the column it
         stands in is above its feet. The cell test this used to be asks which
         cell the body's own height happens to land in, and a body floating at
         the surface bobs across that boundary; the surface of the column is a
         property of the place. It is the same question the body you wear asks,
         in Player#update. */
      const wSurf = waterSurface(world, Math.floor(this.x), Math.floor(this.z));
      const inWater = wSurf >= 0 && this.y < wSurf;
      this.inWater = inWater;      // the draw reads it: a body built for water kicks, it does not run
      // cleared for the frame, and set by the branch that is actually in the water's hold
      this.held = 0;
      const yaw0 = this.yaw;       // before steering, so the turn rate is measurable
      /* Which other bodies this one is already inside, and how deep. A step into
         a place another body's trunk holds is refused the way a wall is refused,
         and the same contour that takes a body round a cliff takes it round its
         own kind. A body already standing inside another is not refused every
         place it could go -- that is a body frozen inside another one -- but it
         is refused every place that is deeper than the one it is standing in
         now. The old version let it go as deep as it liked, a centimetre at a
         time: two lamps drifting together at 4 mm a frame were never refused
         once, and ended up half a metre inside one another -- a body drawn
         almost exactly on top of another body.
         It is read after the body has turned and not before it: a body that
         turns swings its own trunk into whatever stands beside it, and a gate
         measured on the heading it had before the turn never sees the overlap
         the turn itself made. Two bears one above the other on the northern
         slope came about into one another that way, 0.4 m of one inside the
         other, and neither of them had stepped anywhere. */
      const deep = new Map();
      const readDeep = () => {
        deep.clear();
        if (!game || !game.creatures) return;
        for (const o of game.creatures) {
          if (o === this) continue;
          if (this.y >= o.y + o.tall || o.y >= this.y + this.tall) continue;
          const c = bodyClash(this, this.x, this.z, o);
          if (c) deep.set(o, c.pen);
        }
      };
      const crowded = (x, z) => {
        if (!game || !game.creatures) return false;
        const tooDeep = (px, pz) => {
          for (const o of game.creatures) {
            if (o === this) continue;
            if (this.y >= o.y + o.tall || o.y >= this.y + this.tall) continue;
            const c = bodyClash(this, px, pz, o);
            if (!c) continue;
            // a body that is not in the neighbour's way yet may touch it, no more
            const was = deep.get(o);
            if (c.pen > (was === undefined ? TOUCH : was) + 1e-3) return true;
          }
          return false;
        };
        if (tooDeep(x, z)) return true;
        /* A body that covers ground in one frame -- an owl at a full sprint
           covers 20 cm of it -- must not go through a neighbour on the way: the
           place it lands in can be clear while the place it went through was
           not, and the gate would never see the crossing. A step shorter than
           half a trunk cannot skip a body, and is not tested twice. */
        return Math.hypot(x - this.x, z - this.z) > 0.12 &&
               tooDeep((x + this.x) / 2, (z + this.z) / 2);
      };
      const dx = tgtX - this.x, dz = tgtZ - this.z;
      const d = Math.hypot(dx, dz);
      let spd = 0;
      if (this.vy < -0.5) { this.climbTo = null; this.climbRate = 0; }   // off the ledge: the fall decides
      if (d > 0.8) {
        /* The table gives a speed on foot and, for the bodies that have them, a
           speed in the air and in the water (docs/en/03 s3: "3.2 (fly 7.0)").
           The owl that crosses the valley is not doing it at walking pace. */
        const cruise = this.isFlyer() ? (sp.flySpeed || sp.speed || 3)
                     : (inWater && sp.swimSpeed) ? sp.swimSpeed
                     : (sp.speed || 3);
        const base = this.state === 'flee' || this.state === 'chase' ? cruise * 1.7 : cruise * 0.42;
        spd = sleeping ? 0 : base;
        /* The animal goes where it is going, and the course bends. `turn` is
           the most radians a second the species adds to its heading at its own
           cruising speed, and above that speed the arc it holds gets wider
           rather than the turn getting faster -- the same push has more body to
           swing about. This is the rule the player's own body obeys
           (Player.update); an owl crossing the valley and a frog crossing the
           lake are the same kind of body. What it replaces was an ease toward
           the target bearing at 4 a second, measured: an owl started a turn at
           6.3 rad/s -- a full revolution a second -- and came about 90 degrees
           in 1.03 s, and a frog in the water did it in 0.57 s. */
        const tgtYaw = Math.atan2(dx, -dz);
        const dy = N.angleDelta(this.yaw, tgtYaw);
        const arc = sp.turn || 0;
        // the same two limits as the player's body: the species' own rate, and
        // a correction proportional to how far off course the animal is
        const rate = arc > 0 ? Math.min(arc * Math.min(1, cruise / Math.max(spd, 0.01)), 2.2 * Math.abs(dy)) : Math.abs(dy);
        const bend = Math.min(Math.abs(dy), rate * dt);
        this.yaw += dy > 0 ? bend : -bend;
        /* An animal that is close to where it is going, and off course, cannot
           get there at the speed it is travelling. The arc of a turn is the
           speed over the rate: at 0.92 m/s a lamp jellyfish that can bend its
           course 0.8 rad/s a second holds an arc of 1.15 m, so a target nearer
           than that, or off to one side, is a place it circles for the rest of
           the afternoon and never arrives at (measured: 292 frames in 60
           seconds where the distance to its own wander target grew). Slowing is
           what an animal does about that, and the speed to slow to comes out of
           the geometry: the circle an animal describes that passes through the
           place has the way to it as a chord, and a chord that meets the heading
           at the course error belongs to a circle of radius half the distance
           over the sine of that error. The naive bound -- the distance over the
           sine, without the half -- is exactly the speed at which the animal
           circles the place for ever at its own arc width, which is the failure
           the slowing exists to end (measured: an owl sent to a place 1.8 m to
           one side walked 41 m around it in 25 seconds and never came inside
           0.87 m). It costs nothing out in the open, where the target is far and
           the sine is small; near the place it reads as an animal easing as it
           comes about, which is what it is.

           And when the place is behind the body
           the chord tells it nothing: what it has to make is a U-turn, and the
           diameter of that turn is twice its own speed over its own rate, so the
           same bound with the sine at one is the speed at which the turn it is
           about to make still fits inside the way to the place. Without that half
           the animal charges off an errand at full speed, turns 2.3 m down the
           lake, and keeps the ground it gained: the ten lamps of the sunken tower
           were measured 7.9 m from the home they were born on, chasing errands
           4 m from that home, which is how a field that is supposed to be the
           tower's outline becomes a survey of the lake. */
        const err = Math.abs(dy);
        const reach = Math.max(err < 1.5708 ? Math.sin(err) : 1, 0.05);
        if (arc > 0) spd = Math.min(spd, arc * d / (2 * reach));
        /* The edge of the valley is folded into the step before anything asks
           whether the step can be taken, not applied to the body afterwards. A
           clamp that runs after the test tests one column and lands the body in
           another: an owl walking the west wall was tested against the air at
           x=6.99 and left standing in the leaves at x=7. */
        const edge = (v, hi) => Math.max(7, Math.min(hi - 7, v));
        readDeep();                 // the heading is settled; now what is in the way
        const nx = edge(this.x + Math.sin(this.yaw) * spd * dt, world.w);
        const nz = edge(this.z - Math.cos(this.yaw) * spd * dt, world.d);
        const mx = nx, mz = nz;
        if (this.isAquatic()) {
          /* An animal that cannot leave the water is moved by the water column,
             not by the single cell at its feet: it bobs a metre up and down
             while it hovers, and a one-cell test rejects most of its steps --
             and then rejects the way home as well, which is how one of them
             ended up parked against the sunken tower for the rest of the day. */
          const wet = (x, z) => waterColumn(world, x, z) >= 0;
          const free = (x, z) => wet(x, z) && !crowded(x, z);
          if (free(mx, mz)) { this.x = mx; this.z = mz; }
          else if (inWater && wet(mx, mz)) {
            /* The water is there and another body's trunk is in it. The way round
               it is the same way round the tower: of the four directions that are
               wet and free, the one that closes on the errand most, and the
               heading follows the step that was actually taken. Turning for home
               instead -- the branch below, which is the right answer to a bank --
               is what made a lamp pressed against a neighbour swim into the
               middle of the field, where the rest of the field already was. */
            const ex = this.tx - this.x, ez = this.tz - this.z, el = Math.hypot(ex, ez) || 1;
            let bx = null, bz = null, best = -2;
            /* Eight ways, not four. The four that follow the grid are enough
               round a wall, because a wall is made of the same grid; a body is
               turned any way at all, and the shortest way out of one is very
               often a corner of the grid that leads straight back in. */
            for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1],
                                    [0.7071, 0.7071], [0.7071, -0.7071],
                                    [-0.7071, 0.7071], [-0.7071, -0.7071]]) {
              const px = this.x + ox * spd * dt, pz = this.z + oz * spd * dt;
              if (!free(px, pz)) continue;
              const dot = (ox * ex + oz * ez) / el;
              if (dot > best + 1e-6) { best = dot; bx = px; bz = pz; }
            }
            if (bx !== null) {
              const sx = bx - this.x, sz = bz - this.z;
              this.x = bx; this.z = bz;
              const e = N.angleDelta(this.yaw, Math.atan2(sx, -sz));
              const back = Math.min(Math.abs(e), (sp.turn || 2) * dt);
              this.yaw += e > 0 ? back : -back;
            }
          } else if (inWater) {
            /* In the water, and something dry is in the way: turn back for home,
               and test that way the same way. The sunken tower stands in the
               middle of the lamp field, and an unchecked homeward step used to
               drag a jellyfish through the tower wall -- the altitude code then
               finds no water in that column and leaves the animal standing on
               the tower's roof, out of the lake for good. */
            const ax = this.homeX - this.x, az = this.homeZ - this.z, al = Math.hypot(ax, az) || 1;
            /* Both components of the homeward step go the same way: the way to
               home is a vector, not a heading, and the minus that belongs to the
               body's own forward axis (`mz = z - cos(yaw) * step`) does not
               belong here. With it, an animal pressed against the shore of the
               lake was walked away from the home it was being sent to: one lamp
               sat at 66.0, 107.0 for five minutes, 11 m from the tower its field
               is supposed to be, heading north into a wall of dirt. */
            const hx = this.x + ax / al * spd * dt, hz = this.z + az / al * spd * dt;
            /* A slide only counts if it actually moves: pressed flat against a
               wall the animal's homeward step along the wall is zero, and taking
               that branch anyway (the cell beside it is wet, so the test passes)
               is how it used to sit on the tower's north face for the rest of
               the run. */
            const canX = Math.abs(hx - this.x) > 1e-4 && free(hx, this.z);
            const canZ = Math.abs(hz - this.z) > 1e-4 && free(this.x, hz);
            if (canX && (Math.abs(ax) >= Math.abs(az) || !canZ)) this.x = hx;
            else if (canZ) this.z = hz;
            else {
              /* The corner: neither slide goes anywhere, so step round the
                 obstacle -- of the four directions that are wet, take the one
                 that closes on home most. Without this an animal whose home is
                 straight through the tower presses its nose to the wall for the
                 rest of the run. */
              let bx = null, bz = null, best = Math.hypot(ax, az);
              for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = this.x + ox * spd * dt, nz = this.z + oz * spd * dt;
                if (!free(nx, nz)) continue;
                const d = Math.hypot(this.homeX - nx, this.homeZ - nz);
                if (d < best - 1e-6) { best = d; bx = nx; bz = nz; }
              }
              if (bx === null) { this.tx = this.x; this.tz = this.z; this.pause = 0.5; }
              else { this.x = bx; this.z = bz; }
            }
          } else {
            // already out of the water, which should not happen: take the
            // shortest way back that is not through rock, and let the altitude
            // sit on whatever it is standing on until the lake takes it back
            const ax = this.homeX - this.x, az = this.homeZ - this.z, al = Math.hypot(ax, az) || 1;
            const hx = this.x + ax / al * spd * dt, hz = this.z + az / al * spd * dt;
            if (!world.solidAt(Math.floor(hx), Math.floor(this.y), Math.floor(hz))) { this.x = hx; this.z = hz; }
          }
        } else {
          /* Can this body put its feet down in that column? The surface it would
             stand on, and the cell just above it: a step of a metre is a step, a
             surface with rock over it is a wall, and foliage over its head is
             neither -- a bear walks through a bush with its shoulders in it. The
             test used to ask for the highest solid thing in the column up to 3 m
             above the feet, which made every bush a cliff and every crown a
             staircase: the bear of the northern ridge walked the crowns along the
             ridge instead of the ground under them, and went up 105 m and back
             down 114 m in a day doing it. */
          const stand = (x, z) => {
            const bx = Math.floor(x), bz = Math.floor(z);
            const gy = standY(world, bx, bz, this.y);
            return gy - this.y < 1.6 && !world.solidAt(bx, Math.floor(gy + 0.2), bz);
          };
          /* A body in the air asks a different question: not "what would I stand
             on" but "is the place I am about to put myself in empty". It has to
             ask it before it moves and not after -- the altitude rule below keeps a
             flying body above the thing it is inside, but a body that only applies
             that rule once it has arrived spends the second it takes to climb back
             out inside the tree it flew into. Read that way, six owls stood inside
             a crown, a hillside or a tower in 11132 of 216000 frames. The same
             predicate answers for the way round an obstacle below, which is what a
             bird does with a hill it cannot climb in time: it goes round it, and
             the heading follows the step. Water counts as not-empty too: a body
             held up by air does not fly into the lake. */
          /* A step is climbed before it is walked on. `stand` answers what the
             feet would stand on and whether there is room over that surface; it
             never asks what is at the height the body itself is at, so a body
             that takes a step of a metre first puts its feet inside the riser of
             the step and then eases up through the ground behind it: measured on
             the two bears of the northern ridge, 3120 of 21600 frames had the
             origin of the body inside the hillside. The step is therefore taken
             the way the player's own body takes it: the feet are raised onto the
             surface first, in the column the body is standing in, and the edge is
             crossed once the body is high enough to be over it.
             Three things are not steps. Foliage is not a riser and is not a
             ceiling: a body on foot walks through a bush with its shoulders in it
             (docs/en/03 s5). A body in the air -- a hop, or a fall off a ledge --
             is not climbing: where it lands is decided by the rule at the end of
             the update, and refusing a step mid-air would stop a hop dead. And a
             body already in the middle of a climb keeps climbing: it is above its
             own ground by then, which is what the second test would otherwise
             mistake for being in the air. */
          const rockAt = (x, y, z) => world.solidAt(x, y, z) && !N.TREE_BLOCK[world.get(x, y, z)];
          /* A body is on its feet unless something is carrying it down. Reading
             it off the height instead -- "the body is above the surface of its own
             column, so it is in the air" -- is wrong twice over: a body that has
             begun to climb a step is above its own ground by the middle of the
             climb, and a body that gave up on one and walked off sideways has no
             rate of falling and is still on its feet. */
          const onFoot = inWater || this.vy > -1;
          const riser = (x, z) => {
            const bx = Math.floor(x), bz = Math.floor(z), cell = Math.floor(this.y + 0.05);
            if (!rockAt(bx, cell, bz)) return 0;
            return standY(world, bx, bz, this.y);
          };
          /* A body in the air needs the room its whole body takes up, not just
             the cell its feet are in: an owl stands 0.7 m from feet to head, and
             a gate that asks only about the feet lets it fly into a room it does
             not fit in and stand there with its head in the roof. Measured over
             forty seconds of the night, one of six birds did exactly that for
             9-17% of the frames it was abroad. */
          const air = (x, z) => {
            for (let k = Math.floor(this.y); k <= Math.floor(this.y + this.tall); k++)
              if (!airCell(world, x, k, z)) return false;
            return true;
          };
          const flyer = this.isFlyer();
          const placeable = flyer ? air : stand;
          /* Where this body may go: 0 for "walk there", a height for "raise the
             feet onto that surface first, where it stands", null for "that is a
             wall". A body cannot raise itself through a ceiling, so a step with
             rock over it is a wall and not a step. */
          const can = (x, z) => {
            if (!placeable(x, z)) return null;
            /* A neighbour's own trunk is as much an obstacle as a bank is, and
               the contour below takes the body round it the same way. */
            if (crowded(x, z)) return null;
            if (flyer) return 0;
            const r = riser(x, z);
            if (!r) return 0;
            /* A body that is being carried down does not climb the step it drifts
               into: it falls past the face of it. Measured, a bear that stepped off
               a ledge and fell alongside the next one was lifted 0.83 m back up it
               in a single frame, because the step read as ground and the body was
               eased onto it. */
            if (!onFoot || r - this.y > 1.6) return null;
            if (rockAt(Math.floor(this.x), Math.floor(r + 0.05), Math.floor(this.z))) return null;
            return r;
          };
          const go = can(mx, mz);
          /* The step the body is walking towards, and how far off it is: the
             first column along the heading whose surface is above its feet. */
          const stepAhead = () => {
            const ux = Math.sin(this.yaw), uz = -Math.cos(this.yaw);
            for (let d = 0.35; d <= 1.4; d += 0.35) {
              const s = standY(world, Math.floor(this.x + ux * d), Math.floor(this.z + uz * d), this.y);
              if (s - this.y > 0.05) return s - this.y <= 1.6 ? { d: d, s: s } : null;
            }
            return null;
          };
          /* A climb already begun is finished: dropping it in the middle would let
             the ground under the body's feet reappear and the body fall back down
             the step it was on its way up. */
          const worth = (r) => r && r > this.y + 0.02 && r - this.y <= 1.6 &&
            !rockAt(Math.floor(this.x), Math.floor(r + 0.05), Math.floor(this.z));
          if (go === 0) {
            this.x = mx; this.z = mz;
            /* A step is begun before the face of it. A body that only learns about
               a step when its nose is against the riser has to stop walking to
               climb it: measured, a bear of the northern ridge stood still for 19
               frames at the foot of a step of a metre, rising the whole time, and
               did that at every step of the ridge it walks. The step is therefore
               read up to a metre and a half along the heading, and the climb is
               closed at the rate the body covers the ground -- a step of a metre a
               metre ahead is climbed at walking pace, so the body rises along the
               slope of the riser and crosses the edge without stopping. Gaining the
               top of the step before getting there is just as wrong: the body is
               then in the air over its own ground, the ground under its feet comes
               back, and it falls back down the step and climbs it again, once a
               second, all afternoon.
               And the look-ahead is only for a body standing on the ground under
               it. A body floating eight metres above the bed of a lake is not at
               the foot of the shore: reading a step a metre away as a step in front
               of it is how a frogpear climbed out of Mirrorlake into the air, three
               metres over the surface of the water it was swimming in, and fell
               back into it. */
            const sa = onFoot && this.y - standY(world, Math.floor(this.x), Math.floor(this.z), this.y) <= 1.6
              ? stepAhead() : null;
            if (sa && worth(sa.s)) {
              this.climbTo = sa.s;
              this.climbRate = Math.max(0.4, Math.min(3, (sa.s - this.y) / sa.d * spd));
            } else if (!worth(this.climbTo)) { this.climbTo = null; this.climbRate = 0; }
          }
          else if (go !== null) { this.climbTo = go; this.climbRate = 3; }
          else {
            /* The way is a wall. An animal does not sit down in front of one and
               wait to be somewhere else: it goes round. Of the four steps it can
               take, the one that stands and points most the way it wants to go
               is the one it takes -- the contour of the obstacle rather than a
               fresh errand -- and the heading follows the step, so the next
               frame tries the wall again from further along it and walks off
               when the wall ends. Giving up was the whole of the old behaviour,
               and it is the last resort here: measured on the two bears of the
               northern ridge, the step in front of them was rejected 2024 times
               in 2400 frames and they spent 81% of the afternoon standing still. */
            const bx = tgtX - this.x, bz = tgtZ - this.z;
            const bl = Math.hypot(bx, bz) || 1;
            let best = null, bestDot = -2;
            for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nx = edge(this.x + ox * spd * dt, world.w);
              const nz = edge(this.z + oz * spd * dt, world.d);
              const c = can(nx, nz);
              if (c === null) continue;
              /* going round a step costs less than climbing it, so a step is
                 climbed only when nothing walkable points the way at all */
              const dot = (ox * bx + oz * bz) / bl - (c ? 0.35 : 0);
              if (dot > bestDot + 1e-6) { bestDot = dot; best = [nx, nz, c]; }
            }
            if (best && bestDot > -0.7) {
              const sx = best[0] - this.x, sz = best[1] - this.z;
              if (best[2]) { this.climbTo = best[2]; this.climbRate = 3; }
              else { this.x = best[0]; this.z = best[1]; this.climbTo = null; this.climbRate = 0; }
              /* The heading follows the step, at the same rate the animal is
                 allowed to turn anywhere else: it is going round the obstacle,
                 not sliding sideways along it with its nose still at the errand. */
              const e = N.angleDelta(this.yaw, Math.atan2(sx, -sz));
              const back = Math.min(Math.abs(e), (sp.turn || 2) * dt);
              this.yaw += e > 0 ? back : -back;
            } else { this.tx = this.x; this.tz = this.z; this.pause = 0.5; }
          }
          this.x = Math.max(7, Math.min(world.w - 7, this.x));
          this.z = Math.max(7, Math.min(world.d - 7, this.z));
        }
        /* One turn budget a frame, whoever spent it. Going round an obstacle
           bends the heading as well as steering at the errand does, and the two
           added: a bear pressed against a cliff came about at twice the rate
           its own body allows (measured 3.2 rad/s against a limit of 1.6). */
        if (arc > 0) {
          const budget = arc * dt;
          const off = N.angleDelta(yaw0, this.yaw);
          if (Math.abs(off) > budget) this.yaw = yaw0 + (off > 0 ? budget : -budget);
        }
      }
      this.speed = spd;
      this.squash = Math.max(0, this.squash - dt * 3.2);

      /* A body that is supported by air or by water turns by tilting; a body on
         foot does not, because nothing at these speeds leans into a turn. Same
         rule and same numbers as the player's own lean (Player.update): the
         tilt is the sideways push the arc needs over the pull of the earth, so
         an animal that is only correcting a few degrees leans a few degrees and
         one at the tightest arc its data allows leans the full 0.45. An owl
         crossing the valley with its yaw swinging through ninety degrees and the
         body dead level was the tell, and it is the one body the player spends
         the most time watching. */
      const bendRate = spd > 0.3 ? Math.abs(N.angleDelta(yaw0, this.yaw)) / Math.max(dt, 0.001) : 0;
      const lean = (this.isFlyer() && this.state !== 'roost') || inWater
        ? Math.max(-0.45, Math.min(0.45, Math.atan(bendRate * spd / LEAN_G)))
        : 0;
      this.bank += (lean - this.bank) * N.ease(4.5, dt);

      // altitude
      const y0 = this.y;      // before the altitude is set, so the rate is measurable
      if (this.isFlyer()) {
        const bx = Math.floor(this.x), bz = Math.floor(this.z);
        /* The floor is what this body would fall to, so it is read from the body's
           own cell and down, never from a cell above it. Read from one block over
           its head, `groundY` answers "the highest solid in this column", and the
           rule that exists to keep a bird out of a tree then lifts it straight up
           through the crown it was flying under -- and through a sky terrace, and
           through the top of a tower. Read that way, a bird under a canopy is told
           the canopy is its floor, asked to stand 1.6 m on top of it, refused the
           rise by the rule below, and stays pinned a metre under the needles for as
           long as it is there: two of six birds did exactly that for three minutes.
           The water is a floor the same way the ground is: an owl crossing
           Mirrorlake crosses the surface, not the lakebed seven metres under it.
           Measured to the lakebed, a bird hunting a lake hunts it from underneath. */
        const fl0 = Math.max(groundY(world, bx, bz, Math.floor(this.y)),
          waterTop(world, bx, bz, world.h - 1));
        /* `flyY` is the ceiling a bird will not ask to be above, not the height
           it flies at, and it has to be a height the world has: an owl put down on
           a canopy used to be given a flight height of 51.5 in a world 48 tall, so
           every one of its samples was outside the map. A hunting owl holds a few
           metres above whatever is under it -- over the lake, over the crowns, over
           the ridge -- and changes that height slowly, low over open water, up where
           the ground goes up. Held to one absolute height it crossed the valley with
           the ground 25 m under it and the whole flight was one straight line.
           The same question is asked a short way ahead, because a body that only
           asks where it is now begins climbing a second after it arrives and spends
           that second inside the hill. Ahead, the thing to climb is the top of the
           solid the body would be standing inside -- not the highest thing in the
           column: a terrace 8 m over a bird's head is not in its way, and a column
           that is air at the height of the flight has nothing to climb at all.
           That climb is then held down to the room this body actually has: the
           lowest thing over its own head, minus the layer it stands in. Asked
           without that, it is a bird being told to clear a canopy while it is
           standing under one -- the height it wants is above the ceiling over its
           own head, the rule below refuses the rise, and the bird is pinned under
           the needles for as long as it is there. Measured over a minute on five
           valleys, both halves earn their place: without the ahead term the birds
           fly under the crowns instead of over them (the share of frames a bird is
           above everything in its own column falls from 69-94% to 36-79%), and
           without the cap birds get pinned. The reach is seven metres: the climb is
           eased at 2.2/s, so a body closes 63% of the height it wants in 0.45 s,
           and at the seven metres a second an owl crosses the valley at that is
           about the three metres of ground coming at it. Look further than that and
           the body is climbing for a hill it could simply have gone round. */
        const climb = (x, z) => {
          const cx = Math.floor(x), cz = Math.floor(z), cy = Math.floor(this.y);
          if (!world.solidAt(cx, cy, cz)) return -1;
          let k = cy;
          while (k < world.h && world.solidAt(cx, k, cz)) k++;
          return k;
        };
        const ax = Math.floor(this.x + Math.sin(this.yaw) * AHEAD);
        const az = Math.floor(this.z - Math.cos(this.yaw) * AHEAD);
        /* The lowest thing over this body's own head: the underside of a roof,
           the beam of a room. A bird is asked to keep a metre or two over whatever
           is under it, and in a room one block tall that asks it to stand in the
           roof: the step is refused, the bird stays where it is with its head in
           the beam, and -- once the step gate asks about the whole body -- it is
           refused every step sideways as well and spends the night in one place.
           So the ceiling answers last: the body keeps the room it is in. And the
           top of the map is a room: a bird given the height this rule works out at
           the top of the world stands with its head through the ceiling of the
           valley, so the sky's own roof is one block under the top of the grid.
           Leaves are not a roof, which is the same answer the body on foot gets. */
        const ceil = roofY(world, bx, bz, Math.floor(this.y) + 1, world.h - 1) - this.tall - 0.05;
        let up = climb(ax, az) + 1.6;
        if (up > ceil) up = -1;      // it is not somewhere it can get above from here
        const hunt = this.huntH + Math.sin(this.t * 0.35 + this.phase) * 1.8;
        /* A bird asleep settles on the floor under it and stays there: it is not
           moving, and it is not the body the hunting rules above are there for.
           The floor is the same one an awake body reads -- from the body's own
           cell and down. Read from six metres over its head instead, a bird
           asleep under a crown is told the crown is its floor and lifted up
           through it: over the 93 columns of this valley whose crowns reach 47,
           that is a bird eased to y=48, standing on the top of the world with
           its head through the ceiling of the valley, wings folded, for 882 of
           the 900 frames of a morning measured. */
        const base = sleeping ? fl0 + 1.2
          : Math.max(Math.min(this.flyY, fl0 + hunt), fl0 + 1.6, up);
        /* The ceiling answers last, asleep or awake: falling asleep is not a
           pass through the roof. Held to the room it is in, the same bird
           settles at 46.25, in the crown it went to sleep in. */
        const cap = ceil;
        const target = Math.min(cap, base + Math.sin(this.t * 1.1 + this.phase) * 0.9);
        const yWas = this.y;
        this.y += (target - this.y) * Math.min(1, dt * 2.2);
        /* and it arrives. An ease closes the distance and never touches it, so a
           body eased to the top of a crown whose highest needle is at 46 came to
           rest at 46.99 -- which is inside the needle it was being kept out of,
           for as long as it stayed there. */
        if (Math.abs(target - this.y) < 0.01) this.y = target;
        /* The height is only taken if the place it lands in is empty. The floor
           rule keeps a flying body above what is under it and says nothing about
           what is over it, and the step gate above only ever asks about sideways:
           a body eased up into a ledge, or down into the shoulder of a hill, is a
           body inside one -- measured, 55483 of 216000 frames. A body that was
           already somewhere it should not be keeps its move, so a bird put down
           inside a crown can still work its way out. */
        if (airCell(world, this.x, yWas, this.z) && !airCell(world, this.x, this.y, this.z)) this.y = yWas;
        /* Whether this body is standing on something or being held up by air is
           read off the surface **under its own feet**, not off the column read
           from above it: a crown growing one block over a bird's head is not
           the branch it is standing on, and reading it as the ground folds the
           wings of a bird that is flying. */
        const gyU = groundY(world, Math.floor(this.x), Math.floor(this.z), Math.floor(this.y));
        // a roosting owl is a bird on a branch: wings folded, no beat
        this.airAmt = sleeping ? 0 : (this.y > gyU + 0.4 ? 1 : 0);
      } else if (this.isAquatic()) {
        const wt = waterColumn(world, this.x, this.z);          // -1: no water to hover in
        /* Search down from the animal's own feet, not from above its head: a
           tree standing in shallow water is solid all the way up, and a search
           that starts over the body lets the animal latch onto the trunk and
           climb it out of the lake, block by block, into the sky. */
        const gy0 = groundY(world, Math.floor(this.x), Math.floor(this.z), Math.floor(this.y));
        /* Hover a metre or two under the surface -- but never through the
           bottom. The lake is only two blocks deep at its edges, and a fixed
           depth below the surface puts an animal inside the lakebed there, which
           is a water animal standing in the mud. */
        const depth = 1.2 + Math.sin(this.t + this.phase) * 0.8;
        const target = Math.max(gy0 + 0.35, wt - depth);
        this.y += (target - this.y) * Math.min(1, dt * 1.6);
      } else {
        /* Feet, water and the ground -- one routine for every body that is not
           being held up by air. A frog and a bear are told apart by whether the
           data gives them a `hop`, not by whether they obey gravity: the two
           branches used to be separate code, and the frog's had no bound on what
           it would do to a body's height. */
        const gy = standY(world, Math.floor(this.x), Math.floor(this.z), this.y);
        /* The height the feet are being raised onto: the column the body stands
           in answers for the ground under it, and the step in front of it answers
           for the ground it is about to stand on. The body climbs that in place,
           and the gate above lets it over the edge the frame it is level with it.
           The water's depth is still measured off the ground under the body, so a
           frog climbing out of the lake does not lose the water's hold halfway up
           the bank. */
        const gyH = this.climbTo !== null && this.climbTo > gy ? this.climbTo : gy;
        const hop = this.isAmphibian() ? sp.hop : null;
        // the cell convention, one below the surface: `room` below counts the
        // blocks of water between the bottom and the surface, and wants at least
        // two of them (see `waterSurface` by the helpers)
        const wt = this.isAmphibian() ? wSurf - 1 : -1;
        // the water holds this body up only where there is water deep enough to
        // hold it up: at the edge of the lake the bottom is, and the legs go back
        // to being feet. And it holds it up only while the body is off the
        // bottom: a frog sitting on the lakebed has feet under it, and a body
        // with feet does not kick at nothing.
        const room = wt - gy;
        this.held = (inWater && room > 0.8 && this.y > gy + 0.2) ? 1 : 0;
        if (inWater && room > 0.8) {
          /* A frog does not swim in one layer. It holds a depth of its own,
             sinks now and then and comes back up to breathe, on a cycle of its
             own -- which is what twelve frogs on one lake look like when they
             are alive: a spread of depths that changes, not a line. The cycle
             is squared so a body spends most of its time shallow and dips less
             often than it rises; the surface is the ceiling and the bottom is
             the floor, so in a column too shallow to swim in the frog simply
             stands, and in the deep part one frog can be 30 cm down while
             another is 3 m down and coming up. The depth is closed at the speed
             the animal's own record swims at, not at a fraction of the distance
             left: the lerp was an elevator that ran fastest the instant it
             started, and a frog put down on the lakebed 4.7 m under the surface
             came up 0.47 m in its very first frame -- 28 m/s, faster than a
             falling bear -- every frame after it slower than the one before. */
          const cyc = 0.5 + 0.5 * Math.sin(this.t * this.diveRate + this.phase);
          // `wt + 1` is the surface: the shallowest a frog holds is 30 cm under
          // the water, not 30 cm under the top block of it
          const target = Math.max(gyH + 0.05, wt + 1 - (FLOAT_UNDER + this.diveTo * cyc * cyc));
          const rate = sp.swimSpeed || sp.speed || 1.5;
          const want = target - this.y;
          const step = Math.max(-rate, Math.min(rate, want * 2.5)) * dt;
          this.y += Math.abs(step) >= Math.abs(want) ? want : step;
          this.vy = 0; this.airAmt = 0; this.crouch = 0;
        } else {
          /* On land a frog does not slide: it hops. Before this the height of an
             amphibian was lerped onto the ground every frame, which meant the
             twelve frogs in the valley never once left it -- the legs animated a
             walk no body was doing. The launch is an impulse, the arc is
             gravity's, and the landing is where the squash comes from. The
             countdown only runs with feet on the ground, so a frog that lands
             stands, loads and pushes off again. */
          if (hop && this.speed > 0.2) {
            this.hopT -= dt;
            /* A hop is an arc, and an arc has a top: `up*up/2g` over the feet,
               0.78 m for a launch of 6 m/s under this world's gravity, over a
               body that stands 0.43 m tall. The launch used to be asked nothing
               about what was over the body's head. The twelve frogs of Mirrorlake
               walk in and out of the hollow shaft of the sunken tower, where the
               floor of the cavity they stand in is brick at 11 and the tower's
               glass is at 13: a metre of room. Measured, one of them pushed off
               there and rose 0.27 m in a single frame into the glass, and was
               then lifted out of the wall at 0.1 m a frame for 28 frames -- which
               is what the day soak of the valley caught one run in six. A frog
               under a low roof walks; that is what a frog does. And its legs do
               not load for a jump it is not going to make: a frog coiled under a
               ceiling for a minute is a frog that looks ready to spring and never
               springs. */
            const roof = roofY(world, Math.floor(this.x), Math.floor(this.z),
              Math.floor(this.y) + 1, world.h);
            const room = roof - this.y >= hop.up * hop.up / (2 * GRAVITY) + this.tall;
            this.wind = room ? Math.min(1, this.wind + dt / 0.18) : 0;
            if (this.hopT <= 0 && room && this.y <= gyH + 0.02) {
              this.vy = hop.up;
              this.hopT = hop.period * (0.75 + Math.random() * 0.55);
              this.wind = 0;
            }
          } else if (hop) { this.hopT = 0; this.wind = 0; }
          /* A body on foot is held up by the ground under it, and when the
             ground is a long way below its feet the ground has gone: the body
             falls, under the same gravity, the same terminal speed and the same
             landing squash the player's own body uses. What this replaces is a
             lerp onto the ground every frame, which is an elevator that runs
             fastest at the moment it starts: walked a bear off a cliff where the
             ground falls 17 m within one metre, it came down 6.8 m in the first
             0.1 s -- 81 m/s -- eased the rest of the way to a stop, and finished
             the drop standing on a tree 5 m above the valley floor, where it
             stopped moving for the rest of the run. The same cliff now: 16 m in
             1.17 s, the speed rising from nothing to 26.8 m/s, arriving with a
             squash of 0.3 and walking on. A bear steps off a ridge; it does not
             fall faster than a thrown stone.
             Down a slope is not a fall: the surface is a hand's width under the
             feet, the feet follow it, nothing is integrated. Going up is a step,
             not a lift: a body climbing onto higher ground raises its feet onto
             it at a rate, which is what the frog's branch used to do with a
             snap -- a frog that swam into the lake's bank was put 1.5 m up in a
             single frame (90 m/s) because the surface there was above its feet
             and the code moved it there in one step. */
          if (gyH > this.y + 0.02) {
            /* Onto a step at a rate, not as a fraction of what is left: the
               fraction is an elevator that starts fast and spends the last few
               centimetres creeping (0.15 m in the first frame, 0.008 m in the
               twentieth), and a body that is climbing a step is putting one foot
               up and pulling itself after it, which is a steady speed. */
            const want = gyH - this.y;
            const step = this.climbTo !== null ? Math.min(want, (this.climbRate || 3) * dt)
                                              : want * Math.min(1, dt * 9);
            this.y += step;
            this.vy = 0;
          } else if (this.vy !== 0 || this.y - gyH > 0.35) {
            /* Not standing: either the body has a vertical rate of its own --
               including the one a hop launch just gave it, which is why this
               asks for any rate rather than only a falling one -- or the ground
               has stepped out from under it. */
            this.vy = Math.max(-MAX_FALL, this.vy - GRAVITY * dt);
            this.y += this.vy * dt;
            if (this.y <= gyH) {
              if (this.vy < -1) this.squash = Math.min(0.3, -this.vy / 60);
              this.y = gyH; this.vy = 0;
            }
          } else {
            this.y = gyH; this.vy = 0;
          }
          if (this.isAmphibian()) {
            const airWant = hop && this.y > gyH + 0.02 ? 1 : 0;
            this.airAmt += (airWant - this.airAmt) * Math.min(1, dt * (airWant ? 7 : 11));
            this.crouch = this.y <= gyH + 0.02 ? this.wind : 0;
          }
        }
      }
      /* A body the world is not holding up never ends the frame inside the
         world. The step gate above asks what a body would stand on and whether
         there is room over it, but never what is at the height the body happens
         to be at, and every way of moving here closes a height difference at a
         rate: a frog that hops into a one-metre step has already left the ground
         when it picks the column, and a frog that swims from a lakebed at 10 m
         into one at 11 m is asked to be at 11.05 and swims there at its own
         swimming speed. Either way the body spends the frames in between inside
         the bank -- measured, 26 of the 129600 frames of three minutes for one
         frog of Mirrorlake, every one of them a body inside the sand under the
         lake. The rules above already move it out; this does it in the frame the
         body arrives, which is also what it looks like from outside: a hop onto a
         step lands on the step.
         Wood and leaves are not in this. A body on foot walks through a bush with
         its shoulders in it and a crown is not ground to be pushed off
         (docs/en/03 s5); pushing two bears out of the crowns they walk through
         measured 171 one-metre pops in three minutes. A flying body is held by
         the rule above, which refuses the height instead of putting the body
         inside something and then taking it out again. */
      if (!this.isFlyer()) {
        const gx = Math.floor(this.x), gy2 = Math.floor(this.y), gz = Math.floor(this.z);
        if (world.solidAt(gx, gy2, gz) && !N.TREE_BLOCK[world.get(gx, gy2, gz)]) {
          /* Out, and at a rate. The distance is closed at up to 0.1 m a frame:
             in the running valley every one of these corrections is a body a few
             centimetres under the surface it stands on (measured: 85 of them in
             three minutes for the two bears, the largest 0.042 m), and 0.1 clears
             that in the frame it happens. What the bound is for is a body that is
             *inside* something by a metre -- put down there, or pushed there by a
             rule that has not been thought of -- which is lifted out over a
             quarter of a second instead of being thrown through the bank in one
             frame. */
          const out = groundY(world, gx, gz, gy2);
          if (out > this.y) this.y = Math.min(out, this.y + Math.max(0.1, 6 * dt));
          this.vy = 0;
        }
      }
      /* And a body never ends the frame inside another body. The step gate
         refuses a place a neighbour's trunk holds, but it reads the other bodies
         where they stood when the frame began, and two bodies walking at one
         another both see an empty place to walk into: measured over the morning
         the game opens on, in a valley born the way the game bears it, that is
         how the twelve frogs of Mirrorlake spent 46% of it with another frog
         inside them, the worst pair 0.43 m deep -- one body drawn exactly on top
         of another -- and the ten lamps of the tower field 1.9 overlapping pairs
         at any one moment, 0.54 m deep. The overlap is undone
         along the shortest way out, half to each body, at the rate the world's
         own corrections work at; where the shortest way is a bank, the body
         slides along it instead. A body that cannot be put anywhere the world
         allows stays, and the other one takes the whole way round on its turn.
         And the way out of one body is not a way into another: the ten lamps of
         the tower field stand in a disc the size of two of them, so the shortest
         way out of one lamp is very often the middle of the next, and a body
         shoved into that one takes the whole field with it. Of the ways the world
         allows, the one taken is the one that leaves the body least deep in
         anybody else. */
      if (game && game.creatures) {
        // how deep this body is in anybody at all, before anything is shoved
        let nowIn = 0;
        for (const q of game.creatures) {
          if (q === this) continue;
          const k = bodyClash(this, this.x, this.z, q);
          if (k && k.pen > nowIn) nowIn = k.pen;
        }
        for (const o of game.creatures) {
          if (o === this) continue;
          if (this.y >= o.y + o.tall || o.y >= this.y + o.tall) continue;
          const c = bodyClash(this, this.x, this.z, o);
          if (!c) continue;
          const push = Math.min(c.pen * 0.5 + 0.004, Math.max(0.02, 6 * dt));
          let best = null, bestKey = 1e9;
          for (const [vx, vz] of [[c.ux, c.uz], [-c.uz, c.ux], [c.uz, -c.ux]]) {
            const nx = this.x + vx * push, nz = this.z + vz * push;
            if (!bodyRoom(world, this, nx, nz)) continue;
            let inMost = 0, pair = 0;
            for (const q of game.creatures) {
              if (q === this) continue;
              if (Math.abs(q.x - nx) > 2 || Math.abs(q.z - nz) > 2) continue;
              const k = bodyClash(this, nx, nz, q);
              if (!k) continue;
              if (k.pen > inMost) inMost = k.pen;
              if (q === o) pair = k.pen;
            }
            /* A shove that leaves the body deeper in somebody than it is now is
               not a way out, it is the same crowd through another door. */
            const key = inMost <= nowIn + 1e-3 ? pair : 1e3 + inMost;
            if (key < bestKey - 1e-6) { bestKey = key; best = [nx, nz]; }
          }
          if (best) { this.x = best[0]; this.z = best[1]; }
        }
      }

      /* The same attitude rule the player's own body has: a body the air or the
         water is holding up points along the path it is actually taking, and a
         body on foot stays level. The vertical rate here is the height the body
         just gained or lost, because for these animals the altitude is set
         rather than integrated -- the owl that is climbing to its flight height
         is climbing, whatever its velocity says. */
      const vRate = (this.y - y0) / Math.max(dt, 0.001);
      /* The lamp jellyfish is not in this: a bell that pulses has no nose to
         point, and tilting one is a lampshade tipping over. */
      const carried = (this.isFlyer() && !sleeping) || (inWater && this.isAmphibian());
      const tiltWant = carried && this.speed > 0.3
        ? Math.max(-0.6, Math.min(0.6, Math.atan2(-vRate, Math.max(this.speed, 0.5))))
        : 0;
      this.tilt += (tiltWant - this.tilt) * N.ease(4.5, dt);
      /* The beat belongs to the climb. An owl that is coming down eases its
         stroke out and rides its wings -- the same rule the player's own body
         obeys when it lets go of the climb key (Player.update). */
      if (this.isFlyer()) {
        const flapWant = sleeping ? 0 : (vRate > -0.3 ? 1 : 0.15);
        this.flap += (flapWant - this.flap) * N.ease(3.5, dt);
      }

      // contact effects
      if (dp < (this.sp.scale || 0.2) * 8 + 0.8) {
        if (this.state === 'chase') game.onCreatureTouch(this, dt);
        /* A sting is not an attack. Nothing in the valley hunts the player; the
           lamp jellyfish simply is stinging, the way the ridge simply is cold,
           and a body that is immune to it stands in the middle of the field.
           Contacts stack, because a field is a field: the middle of it costs
           more than its edge. */
        else if (this.sp.sting && !pl.formDef.poisonImmune) game.onSting(this, dt);
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
  N.terrainY = terrainY;
  N.standY = standY;
  N.waterTop = waterTop;

})(window.FRUTARIA = window.FRUTARIA || {});
