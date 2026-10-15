/* ==========================================================================
 *  models.js -- voxel creature models (parts + animation)
 *  Model space: model units (+Z is forward, y up, feet at y=0). A model does
 *  NOT carry a scale: the record that asks for the body says how big it is
 *  (data/creatures.js for an animal, the human form def in entities.js), so an
 *  animal is declared once whether it is walking around or worn as a body.
 *  `eye` is the one number authored in metres, because eyePos() compares it
 *  against the collision box rather than against the model.
 *  A part may have a `parent`: its own rotation is applied first, then the
 *  parent's, so a limb can have a joint (shoulder -> elbow, hip -> knee).
 *  Parts are authored in the bind pose. For the wings the bind pose is the
 *  folded one -- a perched owl is the shape you see most of the day.
 *  A part may also declare `air:[rx,ry,rz]` and `crouch:[rx,ry,rz]`: the pose
 *  it takes when the body is off the ground, and when it is loading a jump.
 *  The weights (st.air, st.crouch) come from what the physics actually did to
 *  the body, never from a guess about which animal it is.
 * ========================================================================== */
(function (N) {

  function hex(h) {
    return [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
  }

  /* Part shape: { name, parent, pivot:[x,y,z], anim, sign:+-1, air:[rx,ry,rz],
                  crouch:[rx,ry,rz], emis:true, boxes:[[x,y,z,w,h,d,'#hex'],...] }
     `emis` makes the part self-lit in the shader -- the same switch a fruit
     block uses. Only the lamps of Mirrorlake use it: no body you can wear
     carries a light (docs/en/07 s1). */
  const MODELS = {
    /* ---------------- human (untransformed) ----------------
       1.80 m tall, about 3.7 heads. A body you look at for an hour in third
       person needs joints -- shoulder to elbow, hip to knee -- or it reads as
       furniture sliding around. The proportions are deliberately child-sized:
       a big head, short arms that end at the hip line, short legs. It is a
       working body, not a fashion plate: the silhouette has to say what it is
       from across a field.
       The whole model, at any facing, has to fit the collision box (0.62 x
       1.8). A model wider than the box walks its arms through a wall you are
       pressed against; play.js measures it. */
    human: {
      eye: 1.55,
      parts: [
        /* the root carries the heave, as every other body's root does: the legs
           hanging off it are the ones the body stands on, so they answer for the
           move and keep their feet where they put them (see the FOOT block) */
        { name: 'hips', anim: 'bob', boxes: [[-1.15, 3.8, -0.8, 2.3, 0.8, 1.6, '#39414d']] },
        { name: 'torso', parent: 'hips', pivot: [0, 4.6, 0], anim: 'twist', boxes: [
          [-1.2, 4.6, -0.85, 2.4, 2.4, 1.7, '#4a5a78'],           // chest
          [-1.4, 6.95, -0.8, 2.8, 0.35, 1.6, '#41506c'],          // shoulder line
          [-1.25, 4.35, -0.9, 2.5, 0.4, 1.8, '#5a4030'],          // belt
          [-0.7, 7.2, -0.55, 1.4, 0.4, 1.1, '#7a4a3a'],           // collar
          [-1.25, 5.4, 0.85, 0.45, 1.2, 0.12, '#6a5138']          // satchel strap
        ] },
        { name: 'head', parent: 'torso', pivot: [0, 7.2, 0], anim: 'nod', boxes: [
          [-1.3, 7.2, -1.2, 2.6, 2.6, 2.4, '#d8a884'],            // skull: half the body
          [-1.35, 9.7, -1.25, 2.7, 0.3, 2.5, '#3a2a22'],          // hair
          [-1.35, 7.3, -1.3, 2.7, 2.45, 0.6, '#33241d'],          // hair, back
          [-1.25, 9.15, 0.95, 2.5, 0.4, 0.3, '#3a2a22'],          // fringe
          [-1.05, 8.95, 1.18, 2.1, 0.17, 0.14, '#2c2019'],        // brow
          [-0.85, 8.45, 1.2, 0.45, 0.45, 0.14, '#241c18'],        // eye
          [0.4, 8.45, 1.2, 0.45, 0.45, 0.14, '#241c18'],          // eye
          [-0.15, 8.1, 1.22, 0.3, 0.35, 0.18, '#c79a76'],         // nose
          [-0.6, 7.75, 1.2, 1.2, 0.15, 0.14, '#a8785a']           // mouth
        ] },
        { name: 'armL', parent: 'torso', pivot: [-1.35, 6.8, 0], anim: 'walk', sign: -1,
          air: [0.5, 0, -0.35], boxes: [[-1.7, 5.7, -0.5, 0.6, 1.1, 1.0, '#4a5a78']] },
        { name: 'foreL', parent: 'armL', pivot: [-1.4, 5.7, 0], anim: 'elbow', sign: -1, bend: -1,
          air: [-0.7, 0, 0], boxes: [
            [-1.65, 4.7, -0.45, 0.5, 1.0, 0.9, '#d8a884'],        // forearm
            [-1.62, 4.2, -0.48, 0.44, 0.5, 0.96, '#e2b28e']       // hand, at the hip
          ] },
        { name: 'armR', parent: 'torso', pivot: [1.35, 6.8, 0], anim: 'walk', sign: 1,
          air: [0.5, 0, 0.35], boxes: [[1.1, 5.7, -0.5, 0.6, 1.1, 1.0, '#4a5a78']] },
        { name: 'foreR', parent: 'armR', pivot: [1.4, 5.7, 0], anim: 'elbow', sign: 1, bend: -1,
          air: [-0.7, 0, 0], boxes: [
            [1.15, 4.7, -0.45, 0.5, 1.0, 0.9, '#d8a884'],
            [1.18, 4.2, -0.48, 0.44, 0.5, 0.96, '#e2b28e']
          ] },
        { name: 'thighL', parent: 'hips', pivot: [-0.62, 3.9, 0], anim: 'walk', sign: 1, stands: 1,
          /* the trouser reaches up past the hip it turns on and into the hips box:
             the hips are the part that rides the stride (see `bob`), and a leg
             carved only up to the hinge shows a slit of sky between them at the
             top of every rise. Same colour, so all it changes is that there is
             never a gap. */
          air: [-0.55, 0, 0], boxes: [[-1.0, 2.4, -0.6, 0.8, 1.7, 1.2, '#39414d']] },
        { name: 'shinL', parent: 'thighL', pivot: [-0.62, 2.45, 0], anim: 'knee', sign: 1, stands: 1,
          air: [0.95, 0, 0], boxes: [
            [-0.95, 0.85, -0.55, 0.65, 1.6, 1.1, '#414a57'],      // trouser
            [-1.0, 0, -0.65, 0.75, 0.85, 1.65, '#2b2522']         // boot, toe in front
          ] },
        { name: 'thighR', parent: 'hips', pivot: [0.62, 3.9, 0], anim: 'walk', sign: -1, stands: 1,
          air: [-0.55, 0, 0], boxes: [[0.2, 2.4, -0.6, 0.8, 1.7, 1.2, '#39414d']] },
        { name: 'shinR', parent: 'thighR', pivot: [0.62, 2.45, 0], anim: 'knee', sign: -1, stands: 1,
          air: [0.95, 0, 0], boxes: [
            [0.3, 0.85, -0.55, 0.65, 1.6, 1.1, '#414a57'],
            [0.25, 0, -0.65, 0.75, 0.85, 1.65, '#2b2522']
          ] },
        { name: 'bag', parent: 'torso', pivot: [0, 5.0, -0.85], boxes: [
          [-0.85, 4.3, -1.35, 1.7, 1.5, 0.6, '#7a5a34'],
          [-0.85, 5.5, -1.4, 1.7, 0.35, 0.7, '#9a7a4a'],          // flap
          [-0.2, 5.0, -1.45, 0.4, 0.4, 0.14, '#c8a45a']           // buckle
        ] }
      ]
    },

    /* ---------------- owl ----------------
       0.70 m tall, and the wings are the whole point. The old ones were panels
       as tall as the body hanging off the ribs, so flapping swept them through
       the legs and out the far side. Now: a short upper wing hinged at the
       shoulder, a forearm of primaries hinged at the elbow, and the span runs
       sideways instead of downwards. The tail and the folded primaries are kept
       inside the 0.55 m box, so an owl walking into a crack is the size the
       data says it is. */
    owl: {
      eye: 0.60,
      parts: [
        { name: 'body', anim: 'bob', boxes: [
          [-1.1, 0.9, -1.0, 2.2, 2.15, 2.0, '#8a7256'],
          [-0.85, 1.05, 0.86, 1.7, 1.75, 0.3, '#d8c9a8'],         // breast
          [-0.9, 0.95, -0.7, 1.8, 0.45, 1.5, '#c6b594'],          // belly
          [-0.55, 2.75, -0.9, 1.1, 0.35, 1.6, '#7a6248']          // mantle
        ] },
        { name: 'head', parent: 'body', pivot: [0, 3.0, 0], anim: 'nod', boxes: [
          [-1.2, 3.0, -1.0, 2.4, 1.6, 1.9, '#9a8266'],
          [-1.15, 3.1, 0.78, 1.0, 1.3, 0.26, '#e6d7b4'],          // facial disc
          [0.15, 3.1, 0.78, 1.0, 1.3, 0.26, '#e6d7b4'],
          [-1.28, 3.0, 0.72, 0.26, 1.5, 0.22, '#6a5540'],         // disc rim
          [1.02, 3.0, 0.72, 0.26, 1.5, 0.22, '#6a5540'],
          [-0.86, 3.66, 0.92, 0.62, 0.6, 0.24, '#241a10'],        // eyes, forward
          [0.24, 3.66, 0.92, 0.62, 0.6, 0.24, '#241a10'],
          [-0.95, 4.32, 0.86, 0.8, 0.22, 0.26, '#6a5540'],        // brows
          [0.15, 4.32, 0.86, 0.8, 0.22, 0.26, '#6a5540'],
          [-0.22, 3.3, 0.98, 0.44, 0.5, 0.36, '#d8a040'],         // beak
          [-1.12, 4.3, -0.35, 0.46, 0.4, 0.62, '#6a5540'],        // ear tufts
          [0.66, 4.3, -0.35, 0.46, 0.4, 0.62, '#6a5540']
        ] },
        { name: 'wingL', parent: 'body', pivot: [-1.05, 2.75, -0.1], anim: 'flap', sign: -1,
          air: [0, 0, -1.32], boxes: [[-1.5, 1.5, -0.8, 0.45, 1.35, 1.55, '#75604a']] },
        { name: 'foreL', parent: 'wingL', pivot: [-1.27, 1.55, -0.1], anim: 'fold', sign: -1,
          air: [0, 0, -0.95], boxes: [
            [-1.45, 0.5, -1.3, 0.42, 1.1, 1.95, '#5f4c38'],       // primaries
            [-1.45, 0.42, 0.62, 0.42, 0.5, 0.72, '#54432f']       // leading edge
          ] },
        { name: 'wingR', parent: 'body', pivot: [1.05, 2.75, -0.1], anim: 'flap', sign: 1,
          air: [0, 0, 1.32], boxes: [[1.05, 1.5, -0.8, 0.45, 1.35, 1.55, '#75604a']] },
        { name: 'foreR', parent: 'wingR', pivot: [1.27, 1.55, -0.1], anim: 'fold', sign: 1,
          air: [0, 0, 0.95], boxes: [
            [1.03, 0.5, -1.3, 0.42, 1.1, 1.95, '#5f4c38'],
            [1.03, 0.42, 0.62, 0.42, 0.5, 0.72, '#54432f']
          ] },
        { name: 'tail', parent: 'body', pivot: [0, 1.35, -1.0], anim: 'wag', boxes: [
          [-0.62, 0.45, -1.7, 1.24, 0.95, 0.8, '#6a543c']
        ] },
        { name: 'legL', parent: 'body', pivot: [-0.5, 0.95, 0.1], anim: 'walk', sign: -1, stands: 1,
          air: [0.9, 0, 0], boxes: [
            [-0.72, 0.16, -0.12, 0.44, 1.24, 0.5, '#c8a050'],    // up into the body: the limb is
            [-0.78, 0, 0.3, 0.56, 0.18, 0.55, '#b8903f']          // foot
          ] },
        { name: 'legR', parent: 'body', pivot: [0.5, 0.95, 0.1], anim: 'walk', sign: 1, stands: 1,
          air: [0.9, 0, 0], boxes: [
            [0.28, 0.16, -0.12, 0.44, 1.24, 0.5, '#c8a050'],
            [0.22, 0, 0.3, 0.56, 0.18, 0.55, '#b8903f']
          ] }
      ]
    },

    /* ---------------- frog ----------------
       0.50 m, wide and low, no neck, eyes on top of the skull. The hind leg is
       three bones: the muscle (thigh), the folded shin, the long foot. A frog
       does not walk, so the hind leg has a crouch pose (loading a hop) and an
       air pose (extended), and the throat pulses while it breathes. The whole
       animal is kept inside the 0.5 m box it collides with -- the snout used to
       reach 0.13 m past it, so a frog against a wall had its head in the wall. */
    frog: {
      eye: 0.42,
      parts: [
        { name: 'body', anim: 'bob', boxes: [
          [-1.3, 0.85, -1.3, 2.6, 1.65, 2.6, '#5f8f4a'],
          [-1.05, 0.9, -1.85, 2.1, 1.35, 0.8, '#5a8746'],         // the hips taper
          [-1.15, 0.8, -1.1, 2.3, 0.5, 2.2, '#c8d8a0'],           // belly
          [-0.95, 2.4, -0.8, 0.75, 0.22, 0.75, '#4e7a3c'],        // back spots
          [0.2, 2.4, 0.1, 0.75, 0.22, 0.75, '#4e7a3c'],
          [-1.32, 1.5, -0.3, 0.16, 0.7, 1.3, '#4e7a3c'],          // flank
          [1.16, 1.5, -0.3, 0.16, 0.7, 1.3, '#4e7a3c']
        ] },
        { name: 'head', parent: 'body', pivot: [0, 1.9, 1.15], anim: 'nod', boxes: [
          [-1.25, 1.3, 1.15, 2.5, 1.4, 1.05, '#6a9a52'],
          [-1.05, 1.36, 2.16, 2.1, 0.26, 0.14, '#39592b'],        // mouth line
          [-1.0, 2.5, 1.3, 0.85, 0.8, 0.85, '#e8e0a0'],           // eyes, on top
          [0.15, 2.5, 1.3, 0.85, 0.8, 0.85, '#e8e0a0'],
          [-0.85, 2.6, 2.02, 0.5, 0.5, 0.24, '#1a1208'],          // pupils
          [0.35, 2.6, 2.02, 0.5, 0.5, 0.24, '#1a1208'],
          [-0.55, 2.15, 2.14, 0.26, 0.22, 0.16, '#39592b'],       // nostrils
          [0.3, 2.15, 2.14, 0.26, 0.22, 0.16, '#39592b']
        ] },
        { name: 'throat', parent: 'head', pivot: [0, 1.4, 1.4], anim: 'pulse', boxes: [
          [-0.78, 1.0, 1.35, 1.56, 0.42, 0.85, '#d5e0b0']
        ] },
        { name: 'legFL', parent: 'body', pivot: [-1.15, 1.2, 0.85], anim: 'walk', sign: 1, stride: 0, stands: 1,
          air: [-0.38, 0, 0.2], swimPose: [-0.55, 0, 0.3], boxes: [
            [-1.5, 0.15, 0.6, 0.65, 1.1, 0.7, '#4e7a3c'],
            [-1.58, 0, 1.2, 0.82, 0.22, 0.8, '#6a9a52']           // toes
          ] },
        { name: 'legFR', parent: 'body', pivot: [1.15, 1.2, 0.85], anim: 'walk', sign: -1, stride: 0, stands: 1,
          air: [-0.38, 0, -0.2], swimPose: [-0.55, 0, -0.3], boxes: [
            [0.85, 0.15, 0.6, 0.65, 1.1, 0.7, '#4e7a3c'],
            [0.76, 0, 1.2, 0.82, 0.22, 0.8, '#6a9a52']
          ] },
        { name: 'thighL', parent: 'body', pivot: [-1.35, 1.75, -0.75], anim: 'walk', sign: -1, stride: 0, stands: 1,
          air: [0.55, 0, 0.12], crouch: [-0.5, 0, 0.12], swimKick: 1, heldPose: [0, 0, -0.1], boxes: [
            [-1.95, 0.9, -1.4, 1.05, 1.2, 2.0, '#5f8f4a']         // the muscle
          ] },
        { name: 'shinL', parent: 'thighL', pivot: [-1.42, 1.0, -1.35], anim: 'knee', sign: -1, stride: 0, stands: 1, bend: -1,
          air: [1.4, 0, 0], crouch: [-0.95, 0, 0], swimKick: 1, heldPose: [1, 0, -0.1], boxes: [
            [-1.8, 0.1, -1.3, 0.8, 1.0, 1.0, '#4e7a3c'],
            [-1.9, 0, -0.6, 1.02, 0.24, 1.4, '#6a9a52']           // long foot
          ] },
        { name: 'thighR', parent: 'body', pivot: [1.35, 1.75, -0.75], anim: 'walk', sign: 1, stride: 0, stands: 1,
          air: [0.55, 0, -0.12], crouch: [-0.5, 0, -0.12], swimKick: 1, heldPose: [0, 0, 0.1], boxes: [
            [0.9, 0.9, -1.4, 1.05, 1.2, 2.0, '#5f8f4a']
          ] },
        { name: 'shinR', parent: 'thighR', pivot: [1.42, 1.0, -1.35], anim: 'knee', sign: 1, stride: 0, stands: 1, bend: -1,
          air: [1.4, 0, 0], crouch: [-0.95, 0, 0], swimKick: 1, heldPose: [1, 0, 0.1], boxes: [
            [1.0, 0.1, -1.3, 0.8, 1.0, 1.0, '#4e7a3c'],
            [0.88, 0, -0.6, 1.02, 0.24, 1.4, '#6a9a52']
          ] }
      ]
    },

    /* ---------------- bear ----------------
       1.5 m at the shoulder, and the whole animal has to live inside the
       1.4 x 1.5 box the data gives it, because that box is what will not fit a
       low hole (docs/en/04 s4). The head used to hang 0.58 m in front of it, so
       a bear walking into a wall put its head through the wall; the muzzle is
       now carried over the chest instead of out in front of the body. */
    bear: {
      eye: 1.15,
      parts: [
        { name: 'body', anim: 'bob', boxes: [
          [-1.6, 2.4, -2.4, 3.2, 3.0, 4.4, '#6a6258'],
          [-1.4, 2.6, -2.2, 2.8, 1.2, 4.0, '#8a8272'],
          [-1.3, 5.3, -0.8, 2.6, 0.6, 3.0, '#5f574e']             // shoulder hump
        ] },
        { name: 'head', parent: 'body', pivot: [0, 4.6, 1.4], anim: 'nod', boxes: [
          [-1.15, 4.2, 1.1, 2.3, 1.9, 1.6, '#7a7266'],
          [-0.6, 4.25, 2.6, 1.2, 0.95, 0.55, '#a89a86'],          // muzzle
          [-0.28, 4.9, 3.1, 0.56, 0.4, 0.15, '#2a2420'],          // nose
          [-1.1, 5.95, 1.3, 0.6, 0.45, 0.5, '#5a5248'],           // ears
          [0.5, 5.95, 1.3, 0.6, 0.45, 0.5, '#5a5248'],
          [-0.8, 5.4, 2.62, 0.4, 0.4, 0.24, '#1a1410'],           // eyes
          [0.4, 5.4, 2.62, 0.4, 0.4, 0.24, '#1a1410']
        ] },
        { name: 'legFL', parent: 'body', pivot: [-1.45, 3.0, 1.6], anim: 'walk', stands: 1, sign: 1,
          boxes: [[-2.0, 1.0, 0.9, 1.1, 2.0, 1.4, '#5a5248']] },
        { name: 'shinFL', parent: 'legFL', pivot: [-1.45, 1.0, 1.6], anim: 'knee', sign: 1, bend: -1,
          boxes: [[-2.0, 0, 0.85, 1.1, 1.0, 1.55, '#4c453d']] },
        { name: 'legFR', parent: 'body', pivot: [1.45, 3.0, 1.6], anim: 'walk', stands: 1, sign: -1,
          boxes: [[0.9, 1.0, 0.9, 1.1, 2.0, 1.4, '#5a5248']] },
        { name: 'shinFR', parent: 'legFR', pivot: [1.45, 1.0, 1.6], anim: 'knee', sign: -1, bend: -1,
          boxes: [[0.9, 0, 0.85, 1.1, 1.0, 1.55, '#4c453d']] },
        { name: 'legBL', parent: 'body', pivot: [-1.45, 3.0, -1.6], anim: 'walk', stands: 1, sign: -1,
          boxes: [[-2.0, 1.0, -2.3, 1.1, 2.0, 1.4, '#5a5248']] },
        { name: 'shinBL', parent: 'legBL', pivot: [-1.45, 1.0, -1.6], anim: 'knee', sign: -1, bend: 1,
          boxes: [[-2.0, 0, -2.4, 1.1, 1.0, 1.55, '#4c453d']] },
        { name: 'legBR', parent: 'body', pivot: [1.45, 3.0, -1.6], anim: 'walk', stands: 1, sign: 1,
          boxes: [[0.9, 1.0, -2.3, 1.1, 2.0, 1.4, '#5a5248']] },
        { name: 'shinBR', parent: 'legBR', pivot: [1.45, 1.0, -1.6], anim: 'knee', sign: 1, bend: 1,
          boxes: [[0.9, 0, -2.4, 1.1, 1.0, 1.55, '#4c453d']] }
      ]
    },

    /* ---------------- lamp jellyfish ----------------
       The lamps of Mirrorlake, and the only animal in the valley that bears no
       fruit. A bell that squeezes and releases -- `pulse` is how a jellyfish
       swims, not a decoration -- four oral arms gathered under it and a frill
       of short tentacles along the rim, all hanging under the anchor, which is
       where the animal sits in the water. Every part is emissive: at night the
       lake is black and this is the only thing down there that is not. It has
       no collision box because nothing in the game collides with it: you swim
       through it and it treats you as water. */
    jelly: {
      parts: [
        { name: 'bell', anim: 'pulse', emis: true, boxes: [
          [-1.2, 1.0, -1.2, 2.4, 1.5, 2.4, '#8fd0ff'],            // the bell
          [-0.7, 2.5, -0.7, 1.4, 0.9, 1.4, '#bfe8ff'],            // the dome over it
          [-1.35, 0.85, -1.35, 2.7, 0.25, 2.7, '#6fb8e8']         // the rim, the darkest part
        ] },
        { name: 'arm0', parent: 'bell', pivot: [-0.55, 1.1, -0.55], anim: 'wag', sign: 1, emis: true,
          boxes: [[-0.7, -1.2, -0.7, 0.3, 2.3, 0.3, '#a8dcff']] },
        { name: 'arm1', parent: 'bell', pivot: [0.55, 1.1, 0.55], anim: 'wag', sign: -1, emis: true,
          boxes: [[0.4, -1.2, 0.4, 0.3, 2.3, 0.3, '#a8dcff']] },
        { name: 'arm2', parent: 'bell', pivot: [-0.55, 1.1, 0.55], anim: 'wag', sign: -1, emis: true,
          boxes: [[-0.7, -1.0, 0.4, 0.3, 2.1, 0.3, '#8fd0ff']] },
        { name: 'arm3', parent: 'bell', pivot: [0.55, 1.1, -0.55], anim: 'wag', sign: 1, emis: true,
          boxes: [[0.4, -1.0, -0.7, 0.3, 2.1, 0.3, '#8fd0ff']] },
        /* the frill: short tentacles along the rim, so the silhouette is not
           four legs under a slab */
        { name: 'fr0', parent: 'bell', pivot: [-1.2, 0.9, 0], anim: 'wag', sign: 1, emis: true,
          boxes: [[-1.3, -0.9, -0.1, 0.2, 1.8, 0.2, '#bfe8ff']] },
        { name: 'fr1', parent: 'bell', pivot: [1.2, 0.9, 0], anim: 'wag', sign: -1, emis: true,
          boxes: [[1.1, -0.9, -0.1, 0.2, 1.8, 0.2, '#bfe8ff']] },
        { name: 'fr2', parent: 'bell', pivot: [0, 0.9, -1.2], anim: 'wag', sign: -1, emis: true,
          boxes: [[-0.1, -0.8, -1.3, 0.2, 1.7, 0.2, '#bfe8ff']] },
        { name: 'fr3', parent: 'bell', pivot: [0, 0.9, 1.2], anim: 'wag', sign: 1, emis: true,
          boxes: [[-0.1, -0.8, 1.1, 0.2, 1.7, 0.2, '#bfe8ff']] }
      ]
    },
  };

  /* How tall each model is, in its own units: the top of the highest box it is
     carved from. Whatever asks "how far off the ground is this body" wants a
     body-relative answer -- a body a third of its own height in the air is a
     body that has left the ground, whether it is a frog or a bear -- and this
     is the body's own measure of itself. */
  const MODEL_H = {};
  for (const k in MODELS) {
    let top = 0;
    for (const p of MODELS[k].parts)
      for (const b of (p.boxes || [])) top = Math.max(top, b[1] + b[4]);
    MODEL_H[k] = top;
  }

  /* How wide each model's own body is, in its own units: the footprint of the part
     every limb hangs from, not of the limbs themselves. A body is not only tall.
     Two bodies standing in one place are one body drawn twice, and the space each
     of them claims is this rectangle turned by its heading -- a bear end on is
     1.1 m long and 0.77 m across, a frog is 0.41 by 0.34, and a circle wide enough
     for the bear leaves the two of them standing nose to nose inside each other. */
  const MODEL_W = {};
  for (const k in MODELS) {
    const p = MODELS[k].parts[0];
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const b of (p && p.boxes) || []) {
      x0 = Math.min(x0, b[0]); x1 = Math.max(x1, b[0] + b[3]);
      z0 = Math.min(z0, b[2]); z1 = Math.max(z1, b[2] + b[5]);
    }
    MODEL_W[k] = x1 > x0 ? [(x1 - x0) / 2, (z1 - z0) / 2, (x0 + x1) / 2, (z0 + z1) / 2] : [0.5, 0.5, 0, 0];
  }

  /* A limb with no ankle cannot swing and keep its foot on the ground.
     A foot is carved flat on the model's ground line and it sticks out in front
     of the hinge it turns on, so rotating the limb -- at the hip, or at the
     knee -- carries the corner of the foot that points the way of the swing
     down through that line. Nothing about the gait is wrong when that happens;
     the model is simply missing a joint, and the limb has to make up for it by
     lifting. Read off the draw: a bear walking on flat ground had its hind foot
     0.09 m inside the ground in a third of the frames, an owl its toe 0.06 m
     inside in three frames of five, a person its boot 0.03 m in a sixth.
     So every part that turns in the land gait, and whose limb reaches the
     ground line, carries the corners of the boxes it turns -- its own and every
     part hanging under it, because a thigh that swings carries the foot at the
     end of it -- measured from its hinge, and partAngles lifts the part by as
     much as its own turn drives those corners below where they rest. The lift
     is given to the top of the limb, so the whole limb moves together and the
     joint between them does not open. A planted foot therefore still rests
     exactly on the ground, and a foot in mid-swing reads as a foot lifting off
     it, which is what a stepping foot does: heel first, then the toe.
     The other half of the same rule is the heave. The body breathes and bobs as
     it walks, and the limbs hang off it, so a body that dips takes its feet with
     it: 0.17 of the bear's own units, 4 cm into the floor, twice a second, on
     every step. A limb that is standing on the ground does not go down when the
     body comes up, so the limb cancels the heave of the body above it -- and
     only the top of the limb does that, or the cancel would be counted twice.
     Only parts whose limb reaches the ground line are given the table. A
     forearm swings too, and drops, and nothing about it should move: it is
     nowhere near the ground. */
  const FOOT = 0.06;            // how close to the ground line counts as touching it
  for (const k in MODELS) {
    const ps = MODELS[k].parts;
    const under = p => { const out = [p]; for (const q of ps) if (q.parent === p.name) out.push(...under(q)); return out; };
    for (const p of ps) {
      if (p.anim !== 'walk' && p.anim !== 'knee' && p.anim !== 'elbow') continue;
      const limb = under(p);
      let low = Infinity;
      for (const q of limb) for (const b of (q.boxes || [])) low = Math.min(low, b[1]);
      if (low > FOOT) continue;
      const pv = p.pivot || [0, 0, 0];
      const corners = [];
      for (const q of limb) {
        for (const b of (q.boxes || [])) {
          for (const y of [b[1], b[1] + b[4]]) {
            for (const z of [b[2], b[2] + b[5]]) corners.push(y - pv[1], z - pv[2]);
          }
        }
      }
      p.corners = corners;        // flat [y,z,y,z,...], relative to the hinge
      p.footLow = low - pv[1];    // where the foot rests: the lowest of them, at rest
    }
    /* the limb's top: the one part in the chain that answers for the heave */
    for (const p of ps) {
      if (!p.corners) continue;
      let root = 1, q = p.parent;
      while (q) {
        const par = ps.find(x => x.name === q);
        if (!par) break;
        if (par.corners) { root = 0; break; }
        q = par.parent;
      }
      p.footRoot = root;
    }
  }

  /* ---------------- build meshes ---------------- */
  function buildModelMeshes(gl, model) {
    const out = [];
    for (const part of model.parts) {
      const mb = new N.MeshBuilder();
      for (const b of part.boxes) mb.box(b[0], b[1], b[2], b[3], b[4], b[5], typeof b[6] === 'string' ? hex(b[6]) : b[6], !!part.emis, 1);
      out.push({ part, mesh: mb.upload(gl), pivot: part.pivot || [0, 0, 0] });
    }
    return out;
  }
  /* ---------------- part animation ---------------- */
  const _m = { a: N.M4.create(), b: N.M4.create(), c: N.M4.create(), d: N.M4.create(), e: N.M4.create(), f: N.M4.create() };
  const WALK_STRIDE = 0.9;  // how far a walking leg reaches at the hip, at a full stride
  const STANCE_WALK = 0.62;  // the share of a stride a foot is on the ground, at a walk
  const STANCE_RUN = 0.30;   // ... and at the fastest the body travels: it flies between steps
  const FLAP_RATE = 11;   // wing beat per second in the air
  const SWIM_RATE = 4.2;  // the stroke's own clock, in rad/s: one stroke every 1.5 s
  /* How much harder the leg on the outside of a turn strokes than the leg on the
     inside, and the turn rate at which that difference is complete: a body
     turning at TURN_FULL or faster kicks with one leg, a body going straight
     kicks with both equally. 1.9 rad/s is the tightest arc a body with a kick
     holds -- the frog's own `turn` in data/creatures.js, and the rate a swimming
     body was measured holding when asked to carve as hard as it can. See the
     `turn` term in the swimKick branch of partAngles. */
  const TURN_KICK = 0.7;
  const TURN_FULL = 1.9;  // rad/s of heading
  /* The fold of the knee is the recovery and not the push, and a breaststroke
     recovers both legs together -- that is what makes it one stroke rather than
     two legs going up and down -- so the turn takes only this share of its
     difference out of the fold. Turn the fold out full as well and the knee
     folds to 13 deg where a straight stroke folds it to 49, the foot comes up
     0.32 m through a stroke that travels only 0.38 m along the body, and the
     sweep stops being a sweep. */
  const TURN_FOLD = 0.3;

  /* A frog's stroke is not a sine. It is a breaststroke, and a breaststroke has
     three acts that a sine cannot hold apart: the legs are **recovered** -- the
     knees come apart and the shins fold up against the thighs, so each webbed
     foot is drawn up beside the hip and out past the flank, under the rear of
     the body and never under its middle; they are then **driven** back and in
     together, the whole foot against the water the whole way, and shut on the
     centre line behind the body; and the body rides the glide that is left.
     Read off the matrices the draw uploads, the new cycle runs each foot 0.33 m
     fore and aft but only 0.19 m up and down, opens the pair from 0.17 m apart
     at the end of a drive to 0.54 m across at the gather, folds the knee to 52
     deg and straightens it to 175, and never once puts a foot inside the body
     the foot hangs from. The old sine ran each foot 0.42 m fore and aft while
     the two stayed 0.43 m apart from each other through the whole cycle: a body
     cycling two legs up and down under itself, pushing no water anywhere, and
     from behind it never changed shape.
     The table is that cycle: [phase, hip, knee, hipOut, kneeOut, heave]. The
     angles are offsets from the pose the water already holds the leg in
     (`heldPose`), so a stroke starts and ends where a floating leg sits. The two
     `out` columns are how far a joint turns away from the centre line of the
     body -- negative is inwards, and that is what shuts the pair at the end of
     the drive -- and the code mirrors them with each part's own `sign`, so the
     cycle is one table read twice and the two sides cannot drift out of step
     with each other the way hand-mirrored data does. The gather row was not
     guessed at: hip, knee and splay were solved against the place a frog's foot
     ends a recovery in -- 0.25 m off the centre line, 0.15 m below the hip it
     hangs from, level with that hip fore and aft, clear of the body box. The
     last row repeats the first: from the end of the drive to the start of the
     next recovery the legs do nothing at all, which is the point of the stroke.
     `heave` is the body riding it -- it settles as the legs recover and surges
     as they drive. */
  const STROKE = [
    [0.00, 0.85, 0.75, -0.38, -0.16, 0.00],   // gliding: legs shut, running straight back
    [0.42, 1.09, -1.58, 0.45, 0.15, -0.10],   // gathered: knees apart, shins folded, feet at the hips
    [0.56, 0.85, 0.75, -0.38, -0.16, 0.12],   // driven: the knees extend and the feet shoot back
    [1.00, 0.85, 0.75, -0.38, -0.16, 0.00]    // and gliding on to the next stroke
  ];
  const KNEE_FLEX = 0.62;       // how far a knee folds at that peak, at a full stride
  const BOB = 0.20;             // how far the body rides a stride, in its own model units
  /* how much of an arm's bend is held all the way through the stride at the
     fastest a body goes. The fold on top of it is the arm clearing itself on its
     way back; this is the arm being carried, and it grows with the square of the
     speed because it is the swinging that costs, and the swinging goes with the
     speed twice over -- more strides to swing through, and each one wider. */
  const ELBOW_RUN = 0.55;

  /* ---------------- the stride ----------------
     A walk cycle has one job that a sine cannot do: a foot that has reached the
     ground has to *stay* there while the body goes past it.
     The cycle used to be one clock for every legged body -- the hip at sin(t *
     7), the rate a constant, the body driven along by its own speed -- and the
     two were never the same thing. Read off the matrices the draw uploads, a
     bear's foot was moving along the ground at 2.3 m/s while its body went past
     at 2.1, and a person's at 3.0 against 4.1: a foot was on the ground for four
     frames in five and held still in none of them, and the whole animal was
     skating on grass. It is not a tuning problem. The foot is at the bottom of
     its arc exactly where the sine is turning over fastest, so the fastest moment
     of the swing is the moment the foot needs to be at its slowest, and no rate
     fixes that.
     So the cycle is written as the two acts it has, and the ground keeps the
     time. `stance` is the foot on the ground and the body travelling past it:
     the hinge turns back at exactly the rate the ground takes the foot along,
     and the foot does not move. `swing` is the foot off the ground coming back
     under the body, eased at both ends so a foot arrives and leaves without a
     jerk, and it is the only half of a stride a knee may fold in.
     The share of the cycle each act takes is not a constant either: a walk has
     a foot on the ground for 62% of it and a run for 30%, and the body is in the
     air between the steps. That is where the length of a stride comes from, and
     it is the reason a fast body takes long steps without swinging its legs any
     wider: the foot is on the ground for a moment, and then it travels the rest
     of the stride through the air along with the body.
     What ties the two acts together is the model's own number, not a constant:
     `stanceSpan` below measures how far this model's foot actually reaches, from
     the frame it lands on to the frame it leaves, through the same matrices the
     draw uploads. One cycle of the legs then carries the body exactly that far,
     and the caller advances the phase by the ground the body covered. What that
     buys, besides the foot holding: a body going nowhere has no stride and its
     legs stop; a body walking into a wall stops its legs with its body instead of
     running on the spot; and the rate of the steps stops being a constant and
     comes out of the leg alone. Read off the matrices the draw uploads, a person
     at 4.7 m/s takes 1.85 m steps at 2.33 a second and at 2 m/s takes steps of
     under a metre at the same rate; a bear at 5.2 m/s takes 1.95 m steps at
     2.29. A body with short legs steps fast and a body with long legs steps
     slowly, which is what animals do, and the length of a step, not its rate, is
     what the speed buys. */

  /* where the foot is along its own stride: +1 at the reach out in front of the
     body it lands on, -1 at the reach behind it it leaves from. The stance is a
     straight line, because a foot on the ground is being carried along a flat
     surface by the body and a straight line is the only thing that keeps it
     there; the swing is eased, because a foot does not start and stop. */
  function stanceOf(move) { return STANCE_WALK + (STANCE_RUN - STANCE_WALK) * move; }
  /* how wide the hip swings at a given speed. This is the knob that decides how
     a body's speed turns into steps, and the two ways to get a faster body out
     of it are both wrong on their own: swing the legs wider and the body takes
     long slow strides, keep the swing and shorten the time a foot is down and it
     takes long fast ones, and either way the rate of the steps falls as the body
     goes faster, which is the opposite of what a body does.
     What a body does is hold its step rate nearly the same and change the length
     of a step: a person walking at 1 m/s takes steps of 0.4 m at about 2.5 a
     second and running at 4.7 m/s takes steps of 1.9 m at about the same 2.5 a
     second. Read the same way, the reach of the foot under the body -- which is
     what a stance is worth along the ground -- goes 0.22 m, 0.40 m, 0.58 m at
     1, 2 and 4.7 m/s: it grows slower than the speed does, and the whole of the
     rest is bought by the stance taking a smaller share of the cycle.
     So the swing is made proportional to speed *times the stance*, and the two
     cancel in the one place they have to: a stride comes out proportional to the
     speed, and the rate of the steps comes out a property of the leg alone. */
  function ampOf(move) { return move * stanceOf(move) / STANCE_WALK; }
  function footAt(u, stance) {
    u -= Math.floor(u);
    if (u < stance) return 1 - 2 * u / stance;
    const w = (u - stance) / (1 - stance);
    return -1 + 2 * (w * w * (3 - 2 * w));
  }
  /* the knee's fold: nothing at all through the stance -- the leg under a body
     is the leg holding that body up, and a knee that folds there drops the body
     through its own foot -- and one hump through the swing, peaking in the
     middle of it, which is where a foot has to be clear of the ground. */
  function foldAt(u, stance) {
    u -= Math.floor(u);
    return u < stance ? 0 : Math.sin((u - stance) / (1 - stance) * Math.PI);
  }
  /* the hinge angle that puts the foot at a given place along the stride. A foot
     hanging L under a hinge reaches L sin(angle) fore and aft, and the stance
     needs that *reach* to go backwards at the speed of the body: turning the
     angle at a constant rate instead leaves the foot still in the middle of a
     stance and dragging at both ends of one, which is the same mistake the sine
     made with the signs changed. And the hinge turns the other way round from
     the reach, because a positive angle about x carries a foot hanging under it
     towards -z (see rotX in engine.js) and every model here faces +z -- a
     muzzle, a beak and a toe all say so. */
  function hipAt(A, u, stance) { return -Math.asin(Math.sin(A) * footAt(u, stance)); }
  /* Which way round the body rides its own stride, and the one place a walk and
     a run are not the same gesture.
     While some foot is always on the ground the legs are struts, and a body on
     struts is at its highest over the middle of a stance, where the strut is
     straight and under it, and at its lowest where it trades one strut for the
     other. Once a stance is less than half a cycle there is a moment in every
     stride with no foot down at all: the body is flying, and the leg is a spring
     instead of a strut -- it comes down onto a foot, bends it, and is thrown
     back off it, so it is at its LOWEST over the middle of a stance and at its
     highest in the middle of the flight. The same cosine the other way round.
     It turns over where the stance is half a cycle, and is fully turned by
     STANCE_RUN, which is the share at which the body is off the ground for
     two strides in five. */
  function rideOf(stance) {
    return 1 - 2 * Math.min(1, Math.max(0, (0.5 - stance) / (0.5 - STANCE_RUN)));
  }

  /* how far the foot of a standing leg reaches fore and aft under the body, in
     model units, measured at the two ends of a stance. That distance is what the
     body has to travel while the foot is on the ground, so it is what one cycle
     of the legs is worth along the ground.
     The point measured is the middle of the sole: the middle of the bottom face
     of the lowest box on the limb. It has to be that point and not "whichever
     corner of the foot is lowest", because the model has no ankle -- the sole
     rocks from toe to heel as the leg sweeps through a stance, and the lowest
     corner changes identity halfway along it, jumping the whole length of the
     foot in a frame. A material point of the foot does not move when the foot is
     planted, which is the whole claim, and it is the point the matrices hold
     still.
     The model's own numbers cannot say this: the hinge that is lowest is not the
     one the foot hangs from, and the lift that keeps a foot out of the ground
     (the FOOT block above) moves the whole limb. So it is measured, once per
     model, through the matrices the draw uploads. A body with no leg that walks
     -- a frog hops, a jelly drifts -- reaches nowhere, and 0 is how the caller
     learns not to run a cycle at all. */
  const SPAN = {};
  function stanceSpan(modelId) {
    if (SPAN[modelId] !== undefined) return SPAN[modelId];
    const m = MODELS[modelId];
    let best = 0;
    if (m) {
      const entries = m.parts.map(p => ({ part: p, pivot: p.pivot || [0, 0, 0] }));
      const under = p => { const out = [p]; for (const q of m.parts) if (q.parent === p.name) out.push(...under(q)); return out; };
      const st = { t: 0, gait: 0, phase: 0, move: 1, air: 0, crouch: 0, off: 0 };
      for (const p of m.parts) {
        if (!p.stands || p.anim !== 'walk' || p.stride === 0) continue;
        const limb = under(p);
        let sole = null;
        for (const q of limb) for (const b of (q.boxes || [])) if (!sole || b[1] < sole.b[1]) sole = { q, b };
        if (!sole) continue;
        const entry = entries.find(e => e.part === sole.q);
        /* the two ends of a stance at the speed the sample is taken at: the hip
           reaches its furthest forward at the start of one and its furthest back
           at the end of it, and where that end falls in the cycle depends on how
           fast the body is going */
        const zs = [0, stanceOf(st.move)].map(u => {
          st.gait = u; st._loc = {};
          const mm = partMatrix(N.M4.create(), N.M4.create(), entry, st, entries);
          const cx = sole.b[0] + sole.b[3] / 2, cy = sole.b[1], cz = sole.b[2] + sole.b[5] / 2;
          return mm[2] * cx + mm[6] * cy + mm[10] * cz + mm[14];
        });
        best = Math.max(best, Math.abs(zs[0] - zs[1]));
      }
    }
    SPAN[modelId] = best;
    return best;
  }
  /* how hard a body of this top speed is asking for a stride: 1 at its own
     speed and above, nothing at all below a crawl. The draw sizes the swing with
     it and the caller sizes the stride with it, and the two have to be the same
     number or the foot slips all the same. */
  function walkMove(spd, top) {
    return Math.min(1, spd / (top || 3)) * (spd > 0.2 ? 1 : 0);
  }
  /* the stride one cycle of the walk carries this body along the ground, in
     metres. The span was measured through the matrices at the fastest the body
     goes, the reach is L sin(angle) with the angle a share of a full stride so
     it scales with sin, and only the stance part of a cycle covers it -- and how
     much of a cycle the stance is depends on how fast the body is travelling. */
  function gaitStride(modelId, sc, move) {
    const span = stanceSpan(modelId);
    if (!span || !(move > 0)) return 0;
    return span * sc * Math.sin(WALK_STRIDE * ampOf(move)) /
           Math.sin(WALK_STRIDE * ampOf(1)) / stanceOf(move);
  }

  /* where the stroke is at a point in the cycle, eased between the keys: the
     legs reach a key and stop there for a moment rather than swinging through
     it, which is what makes the three acts read as three acts. */
  function strokeAt(u) {
    const k = STROKE;
    u -= Math.floor(u);
    let i = 0;
    while (i < k.length - 2 && u > k[i + 1][0]) i++;
    const a = k[i], b = k[i + 1];
    const w = (u - a[0]) / (b[0] - a[0]);
    const s = w * w * (3 - 2 * w);
    return [a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s,
            a[3] + (b[3] - a[3]) * s, a[4] + (b[4] - a[4]) * s,
            a[5] + (b[5] - a[5]) * s];
  }

  /* The angles one part takes this frame, in model space.
     st: { t, gait, phase, move, air, off, crouch, beat, swim } -- `air` is whether
     the body is off the ground, `off` how far above it in body heights, `crouch`
     how loaded its legs are, `beat` the shared wing phase, `swim` that the body is
     moving through water with the bodies built for it. All of them are read off
     the body's own motion by the caller.
     `gait` is where the body is in its own stride, in whole cycles, and it is the
     one of them that is not a clock at all: the caller advances it by the ground
     the body has covered (see the stride block above). It is left out for a body
     that has no leg which walks.
     `heave` is how far the parts above this one in the model have already moved
     up or down this frame -- the body breathing as it walks -- and only a limb
     standing on the ground is passed one. See the FOOT block above the models. */
  function partAngles(entry, st, heave) {
    const p = entry.part, anim = p.anim, sg = p.sign || 1;
    const t = st.t, ph = st.phase || 0;
    const air = st.air || 0, cr = st.crouch || 0;
    /* how far this part takes part in the walk cycle. Absent is the whole
       swing; 0 is a leg that does not walk at all -- a frog's, which hops. */
    const stride = p.stride === undefined ? 1 : p.stride;
    /* where this part is in the body's stride. The other side of the body is
       half a stride behind it, and that is what `sign` says of a limb: it is a
       delay and not a flip of the shape, because flip the shape and both sides
       take their stance at the same moment and the body is left with nothing
       under it for 38% of every stride. The body's own phase only shifts the
       whole animal against the others of its kind. */
    const u = (st.gait || 0) + ph / (Math.PI * 2) + (sg < 0 ? 0.5 : 0);
    const stance = stanceOf(st.move);
    let rx = 0, ry = 0, rz = 0, dy = 0, sc = 1;
    /* the share of this part's turn that comes from the land gait, kept apart
       from the pose blends below: the lift that goes with a swing belongs to the
       swing alone (see the FOOT block above the models) */
    let gait = 0;
    /* The beat, scaled by how hard the body is actually beating: a body that is
       riding its wings down holds them spread with a faint stroke, and the heave
       the stroke gives the body goes with the stroke, not with the clock. */
    const beat = Math.sin(t * (st.fly ? FLAP_RATE : 2.2) + ph) * (st.flap === undefined ? 1 : st.flap);
    if (anim === 'flap') {
      /* The wing is authored folded; the `air` pose holds it out (that part is
         the generic pose blend below, and it carries its own sign). The beat
         then swings it around that held-out pose instead of around the ribs.
         The downstroke is hard and the recovery soft -- a symmetric sine is what
         made the old one look like a windmill. */
      const s = st.beat !== undefined ? st.beat : beat;
      const stroke = s > 0 ? s : s * 0.42;
      /* the sign is the mirror of the hold: a positive beat is the downstroke,
         and from a held-out wing the downstroke is the other way round from the
         raise that `air` pose does */
      rz = -sg * stroke * (0.22 + 0.78 * air);
      ry = sg * air * 0.12;
    } else if (anim === 'fold') {
      const s = st.beat !== undefined ? st.beat : beat;
      rz = sg * (s < 0 ? -s * 0.5 : 0) * air;
    } else if (anim === 'walk') {
      /* the swing of a leg (or arm) that walks: one cycle per stride, the two
         sides of the body half a stride apart, and sized by how fast the body is
         actually travelling. `stride` is the part's own share of it -- a frog's
         legs take none, because a frog does not walk on land, it hops. */
      rx = hipAt(WALK_STRIDE * stride * ampOf(st.move), u, stance);
      gait = rx;
    } else if (anim === 'knee') {
      /* A knee folds one way, and it folds while the foot is off the ground:
         the leg swings forward, the shin comes up under it at the middle of
         that swing, and the leg is straight again where the foot takes the
         weight back. Which way the fold goes is a fact about the model, not
         about left and right -- the frog's hind knee folds the other way from a
         human's, and the part says so with `bend` (absent means the human's
         way). The `sign` mirror is deliberately NOT applied to the fold: that
         is what drove one knee of every body backwards through the floor it
         stands on. It is applied to the swing, so the pair still alternates
         with the thighs, and the lag is the same on both sides for the same
         reason -- a per-side phase offset would desync the pair and give one
         leg a longer stride than the other.
         When it folds is now said by the stride itself and not by a quarter
         cycle of a clock: nothing at all through the stance, and one hump
         through the swing peaking in the middle of it, which is where a foot
         has to be clear of the ground. A lag against a sine could only guess at
         that: it put the fold at the middle of the forward swing and at the
         middle of the stance of every other body at once, and a model with no
         ankle has nowhere for a folded planted knee to go but down -- read off
         the draw, a frog walking on flat ground had its shin 0.17 m inside the
         ground in 229 frames of 240. And the whole cycle rides on `move`: a body
         standing still has no swing to fold, and its knees hold the angle the
         model was carved at. And it rides on the leg's own `stride`, because the
         fold is there to let the foot clear the ground during a swing: no swing,
         no fold. */
      rx = (p.bend === undefined ? 1 : p.bend) * KNEE_FLEX * stride * foldAt(u, stance) * st.move;
      gait = rx;
    } else if (anim === 'elbow') {
      /* the same fold on an arm, smaller, and with a little of it always held:
         an arm hanging dead straight is a stick. An arm swings opposite the leg
         on the same side, which is what the half stride `sign` buys it.
         And the arm is held the more bent the faster the body goes. A body
         walking lets its arm hang; a body running carries it bent, because a
         straight arm swung through 2.3 strides a second is a pendulum the body
         has to stop and start again twice a stride, while a bent one is carried.
         Read off the draw before, a person at 4.7 m/s held the elbow at 0.12 rad
         -- seven degrees -- which is the angle a person standing still holds it
         at, and swung it through the whole stride with the elbow straight. */
      rx = (p.bend === undefined ? 1 : p.bend) *
           (0.12 + 0.3 * foldAt(u, stance) * st.move + ELBOW_RUN * st.move * st.move);
      gait = rx;
    } else if (anim === 'twist') {
      /* the part above the legs turning against them: it comes round one way as
         the limbs on that side reach forward and back through as they sweep
         behind. On the stride and not on the clock, or the shoulders and the
         feet are two unrelated things the moment the body is travelling at any
         speed other than the one the clock happens to agree with. */
      ry = footAt(u, stance) * st.move * 0.16;
    } else if (anim === 'nod') {
      rx = Math.sin(t * 1.9 + ph) * (st.move * 0.06 + 0.02);
    } else if (anim === 'wag') {
      ry = Math.sin(t * (st.fly ? 3.0 : 1.6) + ph) * (st.move * 0.5 + 0.12);
    } else if (anim === 'bob') {
      /* when the body is flying, the heave is the wing beat: the body drops as
         the wings push down. Two unrelated sines is what made a flying body look
         like a body with two loose parts bolted to it. */
      /* On the ground the heave is the stride: the body is at its highest over
         the middle of a stance, where the leg under it is straight and holding
         it up, and at its lowest at the ends of one, where the leg is angled
         away and the other is coming through under it -- twice a stride, because
         the body stands now on one leg and now on the other. On the clock it was
         a sine of its own that had nothing to do with the feet: read off the
         draw, a bear at its own speed took 2.8 steps a second while its body
         came up and down 0.35 times a second. The idle part stays on the clock,
         because a body standing still still breathes; and a body with no leg
         that walks has no stride to ride either, so it keeps the sine whole.
         `rideOf` turns the same cosine over once the stride grows a flight phase
         (see above), and a body that has never had a part carrying the heave
         gets one now: the person's own body had no `bob` part at all, so the
         one body in the valley you look at for an hour was the one body that
         slid along grass at a height nothing ever changed. */
      dy = st.fly ? -Math.max(0, st.beat !== undefined ? st.beat : beat) * 0.16
                  : (st.gait === undefined || st.gait === null
                     ? Math.sin(t * 2.2 + ph) * st.move * BOB
                     : rideOf(stance) * Math.cos((u - stance / 2) * 4 * Math.PI) * st.move * BOB) +
                    Math.sin(t * 2.2 + ph) * 0.05;
    } else if (anim === 'pulse') {
      sc = 1 + (0.10 + 0.16 * st.move) * (0.5 + 0.5 * Math.sin(t * 2.6 + ph));
    }
    /* Swimming replaces the leg cycle for the parts that were built for it. A
       frog does not run on the surface: both hind legs stroke together, in the
       same act at the same moment. That is why the `sign` mirror is dropped for
       the timing here and kept for the side -- a synchronous pair is not
       mirrored in time, and the two halves of a body are mirrored in space. The
       stroke itself is the STROKE cycle above: knees out and heels drawn back
       beside the hips, then driven back and inwards together, then a glide.
       `held` is the water holding the body up -- in water, breathing it, and not
       standing on the bottom. That is what folds the knee, puts the feet
       **behind** the body instead of under it, and rolls the whole leg out
       **away** from the centre line with it; a body the water is not holding
       (wading, or dug down on the lakebed) keeps the land pose, because under
       the body is where its feet belong when something is holding them up
       instead. The roll turns out and not in, and it turns a little. Turned in,
       it carried each webbed foot over the other and laid it on the far side of
       the body: read off the matrices the draw uploads, a foot reached 0.115 m
       past the centre line of its own body floating and 0.119 m swimming, the
       leg came only 0.024 m and 0.052 m past the body's own flank, and seen from
       behind the animal was a pair of legs crossed under itself with both feet
       pointing in. Turned out by 0.1 rad at the hip and 0.1 at the knee the
       centre of a foot sits 0.234 m out on its own side floating and 0.272 m
       swimming, neither foot ever reaches the centre line, and the two read as
       paddles. The turn
       is split over both
       joints rather than hung on the knee, because this leg carries its foot
       2.15 of its own units in front of the knee it turns on: the 0.5 rad the
       fold used to be given at the knee alone throws the leg 0.22 m past the
       flank of a body whose flank stands 0.17 m off the centre line, and a frog
       floating against the wall of the lake has its feet in the rock. The
       stroke's own turn is measured against that held roll, and it is read the
       same way: the table turns the pair out by 0.45 rad at the hip and 0.15 at
       the knee where the legs are gathered, and back in by -0.38 and -0.16 where
       they shut behind the body, and the widest the leg reaches past the flank
       of the body through the whole cycle is 0.18 m -- 0.19 m for a wild frog
       crossing the lake at its own speed. */
    const swim = st.swim || 0, held = st.held || 0, turn = st.turn || 0;
    if (swim > 0.01 || held > 0.01) {
      const a = strokeAt((t * SWIM_RATE + ph) / (Math.PI * 2));
      /* how much of the stroke the body is doing: all of it at the speed its own
         record swims at, none of it at a standstill. A stroke is the thing that
         pushes water behind a body, so it is sized by the water the body is
         actually pushing: a body coasting to a stop strokes less and less as it
         coasts, and a body that is simply sitting in the water -- the player
         holding no key, a frog hovering -- holds its legs in the pose the water
         holds them in and moves them not at all. The old floor of 0.55 of the
         stroke under everything made a body kick at a lake it was going nowhere
         through: read off the matrices the draw uploads, a frog floating with its
         speed at nothing still walked its feet 1.55 m through 4 s of water. The
         hold ramps the whole thing in, so a body sinking towards the lakebed
         stops stroking over a few frames instead of at one instant. */
      const amp = Math.min(1, swim) * Math.min(1, held * 3);
      if (p.swimKick) {
        /* A body that is turning kicks harder with the leg on the outside of the
           turn: that leg has to carry the body round the arc as well as along
           it, and the inside leg is being dragged. A breaststroke turn is one leg
           reaching out and the other hardly reaching at all, and it is what makes
           the turn read as caused rather than as slid through. `sg` is the part's
           own side, and a heading that grows is a turn to the body's own right,
           so the product is positive on the leg that has to do the work. Read off
           the foot at the tightest arc a frog holds, the outside leg sweeps 0.37 m
           fore and aft and carries 1.02 m through the water while the inside leg
           sweeps 0.29 m and carries 0.72 m, and the outside leg reaches 0.04 m
           further past the flank than the inside one. The body's own heave is
           deliberately left out of this: the body is one part, and what it does
           belongs to the stroke as a whole. */
        const tn = Math.max(-1, Math.min(1, turn / TURN_FULL)) * sg;
        const hp = p.heldPose || [0, 0, 0], knee = anim === 'knee';
        rx = hp[0] * held + a[knee ? 1 : 0] * amp * (1 + TURN_KICK * TURN_FOLD * tn);
        /* the sideways turn of the stroke. A leg hanging down is swung out by a
           roll about the body's own fore-and-aft axis, and a leg laid back along
           the body is swung out by a yaw about the vertical -- the hip does not
           change its axis, the leg does, and a roll on a leg that is already
           pointing backwards only turns it over. So the one turn is split
           between the two axes by how far the part has already pitched: read
           straight off the angles, a leg laid back and given only the roll moves
           its foot 0.01 m sideways in the whole stroke, which is why the legs
           never came together behind the body however the numbers were turned.
           The side is the part's own `sign`, which is not the timing mirror the
           paragraph above drops: both legs swing out away from the centre line
           together and shut towards it together. The turn opens the outside leg
           as it gathers and leaves the shut at the end of the drive alone,
           because both feet finish on the centre line behind a body whether that
           body is turning or not: turn the shut as well and the outside foot is
           carried 0.068 m across the centre line of the body it hangs from, which
           is a foot pointing in, and that is the one thing this pair was
           untangled for. */
        const cp = Math.cos(rx), sp = Math.sin(rx);
        const a3 = a[knee ? 3 : 2];
        const out = a3 > 0 ? a3 * amp * (1 + TURN_KICK * tn) : a3 * amp;
        ry = hp[1] * held - sg * out * sp;
        rz = hp[2] * held + sg * out * cp;
        /* and the stroke has taken the part's turn away from the land gait, so
           the gait's lift goes with it: there is no ground down there to keep
           the foot out of. */
        gait = 0;
      } else if (p.swimPose) {
        const f = Math.max(swim, held);
        rx = p.swimPose[0] * f; ry = p.swimPose[1] * f; rz = p.swimPose[2] * f;
        gait = 0;
      } else if (anim === 'bob') {
        dy = a[4] * amp;                // the body rides the drive, not the clock
      }
    }
    /* The pose this part takes off the ground / loading a jump.
       A limb the body stands on says so with `stands`, and its off-ground pose
       comes only as far as the body is actually off the ground: `off`, the same
       0..1 clearance the caller measures in body heights. Not for tidiness -- a
       hind leg built longer than the body is tall sweeps its foot clean
       through the plane it stands on on the way into the pose and on the way
       out of it, because the pose is eased and the body's own origin does not
       move. Read off the draw: a frog landing from a hop drove its shin 0.154 m
       into the ground it had just touched, in 169 frames of 360, and the pose
       was nowhere near the ground at the time -- the body was in the air for
       most of it. So the pose has to arrive as the ground goes away and leave
       before the ground comes back, which is also what an animal does: it puts
       its feet where it means to land. */
    const lift = p.stands ? Math.min(air, st.off === undefined ? 1 : st.off) : air;
    if (lift > 0.01 && p.air) { rx += p.air[0] * lift; ry += p.air[1] * lift; rz += p.air[2] * lift; }
    if (cr > 0.01 && p.crouch) { rx += p.crouch[0] * cr; ry += p.crouch[1] * cr; rz += p.crouch[2] * cr; }
    /* The lift that goes with a swing, and the answer to the heave. See the
       FOOT block above the models: this is the joint the model does not have,
       and this is the limb refusing to be carried down when the body above it
       dips. Only the land gait's own turn counts here -- the air pose, the
       crouch and the water stroke move this part too, and none of them wants a
       lift: the first two are poses a body takes when the ground has gone away,
       and the third is a stroke under water. */
    if (p.corners) {
      let drop = 0;
      if (gait) {
        const gc = Math.cos(gait), gs = Math.sin(gait);
        let low = p.footLow;
        for (let i = 0; i < p.corners.length; i += 2) {
          const v = p.corners[i] * gc - p.corners[i + 1] * gs;
          if (v < low) low = v;
        }
        if (low < p.footLow) drop = p.footLow - low;
      }
      dy += drop - (p.footRoot && heave ? heave : 0);
    }
    return { rx, ry, rz, dy, sc };
  }

  function buildLocal(entry, st, heave, moved) {
    const a = partAngles(entry, st, heave), p = entry.pivot;
    const out = N.M4.create();
    N.M4.ident(out);
    if (moved) moved.dy = a.dy;
    if (a.dy) { const m = _m.e; N.M4.trans(m, 0, a.dy, 0); N.M4.mul(out, out, m); }
    if (p[0] || p[1] || p[2]) { const m = _m.a; N.M4.trans(m, p[0], p[1], p[2]); N.M4.mul(out, out, m); }
    if (a.rz) { const m = _m.b; N.M4.rotZ(m, a.rz); N.M4.mul(out, out, m); }
    if (a.ry) { const m = _m.c; N.M4.rotY(m, a.ry); N.M4.mul(out, out, m); }
    if (a.rx) { const m = _m.d; N.M4.rotX(m, a.rx); N.M4.mul(out, out, m); }
    if (a.sc !== 1) { const m = _m.f; N.M4.scale(m, a.sc, a.sc, a.sc); N.M4.mul(out, out, m); }
    if (p[0] || p[1] || p[2]) { const m = _m.a; N.M4.trans(m, -p[0], -p[1], -p[2]); N.M4.mul(out, out, m); }
    return out;
  }

  /* a part's matrix in model space: its own rotation, inside its parent's.
     The parent is resolved first, because a limb standing on the ground has to
     know how far the body hanging over it has already moved this frame -- the
     `heave` a limb answers for (see the FOOT block above the models) is the sum
     of the moves, not the turns, of the parts above it. The product is the same
     either way round. What is cached per part is the matrix and that move. */
  function localOf(entry, st, parts, heave) {
    const name = entry.part.name;
    if (!st._loc) st._loc = {};
    const seen = st._loc[name];
    if (seen) return seen;
    let pm = null, h = heave || 0;
    const pname = entry.part.parent;
    if (pname) {
      for (const pe of parts) {
        if (pe.part.name === pname) {
          const par = localOf(pe, st, parts, h);
          pm = par.m; h += par.dy;
          break;
        }
      }
    }
    const moved = { dy: 0 };
    const m0 = buildLocal(entry, st, h, moved);
    const m = pm ? N.M4.mul(N.M4.create(), pm, m0) : m0;
    const held = { m, dy: moved.dy };
    st._loc[name] = held;
    return held;
  }

  function partMatrix(out, base, entry, st, parts) {
    return N.M4.mul(out, base, localOf(entry, st, parts || [entry]).m);
  }

  N.MODELS = MODELS;
  N.gaitStride = gaitStride;
  N.walkMove = walkMove;
  /* the other half of the law, for anything that has to know when a foot is on
     the ground: game/test/play.js measures the drawn foot against this window,
     and a second copy of the two shares there would be one more thing to keep
     in step by hand */
  N.stanceOf = stanceOf;
  N.MODEL_H = MODEL_H;
  N.MODEL_W = MODEL_W;
  N.buildModelMeshes = buildModelMeshes;
  N.partMatrix = partMatrix;
  /* the pose on its own, without a matrix or a mesh around it: a gait is a
     statement about these angles, and the frame only ever sees the silhouette a
     body leaves from one side of it */
  N.partAngles = partAngles;

})(window.FRUTARIA = window.FRUTARIA || {});
