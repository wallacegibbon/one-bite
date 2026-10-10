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
        { name: 'hips', boxes: [[-1.15, 3.8, -0.8, 2.3, 0.8, 1.6, '#39414d']] },
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
        { name: 'foreL', parent: 'armL', pivot: [-1.4, 5.7, 0], anim: 'elbow', sign: -1,
          air: [-0.7, 0, 0], boxes: [
            [-1.65, 4.7, -0.45, 0.5, 1.0, 0.9, '#d8a884'],        // forearm
            [-1.62, 4.2, -0.48, 0.44, 0.5, 0.96, '#e2b28e']       // hand, at the hip
          ] },
        { name: 'armR', parent: 'torso', pivot: [1.35, 6.8, 0], anim: 'walk', sign: 1,
          air: [0.5, 0, 0.35], boxes: [[1.1, 5.7, -0.5, 0.6, 1.1, 1.0, '#4a5a78']] },
        { name: 'foreR', parent: 'armR', pivot: [1.4, 5.7, 0], anim: 'elbow', sign: 1,
          air: [-0.7, 0, 0], boxes: [
            [1.15, 4.7, -0.45, 0.5, 1.0, 0.9, '#d8a884'],
            [1.18, 4.2, -0.48, 0.44, 0.5, 0.96, '#e2b28e']
          ] },
        { name: 'thighL', parent: 'hips', pivot: [-0.62, 3.9, 0], anim: 'walk', sign: 1,
          air: [-0.55, 0, 0], boxes: [[-1.0, 2.4, -0.6, 0.8, 1.5, 1.2, '#39414d']] },
        { name: 'shinL', parent: 'thighL', pivot: [-0.62, 2.45, 0], anim: 'knee', sign: 1,
          air: [0.95, 0, 0], boxes: [
            [-0.95, 0.85, -0.55, 0.65, 1.6, 1.1, '#414a57'],      // trouser
            [-1.0, 0, -0.65, 0.75, 0.85, 1.65, '#2b2522']         // boot, toe in front
          ] },
        { name: 'thighR', parent: 'hips', pivot: [0.62, 3.9, 0], anim: 'walk', sign: -1,
          air: [-0.55, 0, 0], boxes: [[0.2, 2.4, -0.6, 0.8, 1.5, 1.2, '#39414d']] },
        { name: 'shinR', parent: 'thighR', pivot: [0.62, 2.45, 0], anim: 'knee', sign: -1,
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
        { name: 'legL', parent: 'body', pivot: [-0.5, 0.95, 0.1], anim: 'walk', sign: -1,
          air: [0.9, 0, 0], boxes: [
            [-0.72, 0.16, -0.12, 0.44, 0.8, 0.5, '#c8a050'],
            [-0.78, 0, 0.3, 0.56, 0.18, 0.55, '#b8903f']          // foot
          ] },
        { name: 'legR', parent: 'body', pivot: [0.5, 0.95, 0.1], anim: 'walk', sign: 1,
          air: [0.9, 0, 0], boxes: [
            [0.28, 0.16, -0.12, 0.44, 0.8, 0.5, '#c8a050'],
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
        { name: 'legFL', parent: 'body', pivot: [-1.15, 1.2, 0.85], anim: 'walk', sign: 1,
          air: [-0.38, 0, 0.2], swimPose: [-0.55, 0, 0.22], boxes: [
            [-1.5, 0.15, 0.6, 0.65, 1.1, 0.7, '#4e7a3c'],
            [-1.58, 0, 1.2, 0.82, 0.22, 0.8, '#6a9a52']           // toes
          ] },
        { name: 'legFR', parent: 'body', pivot: [1.15, 1.2, 0.85], anim: 'walk', sign: -1,
          air: [-0.38, 0, -0.2], swimPose: [-0.55, 0, -0.22], boxes: [
            [0.85, 0.15, 0.6, 0.65, 1.1, 0.7, '#4e7a3c'],
            [0.76, 0, 1.2, 0.82, 0.22, 0.8, '#6a9a52']
          ] },
        { name: 'thighL', parent: 'body', pivot: [-1.35, 1.75, -0.75], anim: 'walk', sign: -1,
          air: [0.55, 0, 0.12], crouch: [-0.5, 0, 0.12], swimKick: 1, boxes: [
            [-1.95, 0.9, -1.4, 1.05, 1.2, 2.0, '#5f8f4a']         // the muscle
          ] },
        { name: 'shinL', parent: 'thighL', pivot: [-1.42, 1.0, -1.35], anim: 'knee', sign: -1,
          air: [1.4, 0, 0], crouch: [-0.95, 0, 0], swimKick: 1, boxes: [
            [-1.8, 0.1, -1.3, 0.8, 1.0, 1.0, '#4e7a3c'],
            [-1.9, 0, -0.6, 1.02, 0.24, 1.4, '#6a9a52']           // long foot
          ] },
        { name: 'thighR', parent: 'body', pivot: [1.35, 1.75, -0.75], anim: 'walk', sign: 1,
          air: [0.55, 0, -0.12], crouch: [-0.5, 0, -0.12], swimKick: 1, boxes: [
            [0.9, 0.9, -1.4, 1.05, 1.2, 2.0, '#5f8f4a']
          ] },
        { name: 'shinR', parent: 'thighR', pivot: [1.42, 1.0, -1.35], anim: 'knee', sign: 1,
          air: [1.4, 0, 0], crouch: [-0.95, 0, 0], swimKick: 1, boxes: [
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
        { name: 'legFL', parent: 'body', pivot: [-1.45, 3.0, 1.6], anim: 'walk', sign: 1,
          boxes: [[-2.0, 1.0, 0.9, 1.1, 2.0, 1.4, '#5a5248']] },
        { name: 'shinFL', parent: 'legFL', pivot: [-1.45, 1.0, 1.6], anim: 'knee', sign: 1,
          boxes: [[-2.0, 0, 0.85, 1.1, 1.0, 1.55, '#4c453d']] },
        { name: 'legFR', parent: 'body', pivot: [1.45, 3.0, 1.6], anim: 'walk', sign: -1,
          boxes: [[0.9, 1.0, 0.9, 1.1, 2.0, 1.4, '#5a5248']] },
        { name: 'shinFR', parent: 'legFR', pivot: [1.45, 1.0, 1.6], anim: 'knee', sign: -1,
          boxes: [[0.9, 0, 0.85, 1.1, 1.0, 1.55, '#4c453d']] },
        { name: 'legBL', parent: 'body', pivot: [-1.45, 3.0, -1.6], anim: 'walk', sign: -1,
          boxes: [[-2.0, 1.0, -2.3, 1.1, 2.0, 1.4, '#5a5248']] },
        { name: 'shinBL', parent: 'legBL', pivot: [-1.45, 1.0, -1.6], anim: 'knee', sign: -1,
          boxes: [[-2.0, 0, -2.4, 1.1, 1.0, 1.55, '#4c453d']] },
        { name: 'legBR', parent: 'body', pivot: [1.45, 3.0, -1.6], anim: 'walk', sign: 1,
          boxes: [[0.9, 1.0, -2.3, 1.1, 2.0, 1.4, '#5a5248']] },
        { name: 'shinBR', parent: 'legBR', pivot: [1.45, 1.0, -1.6], anim: 'knee', sign: 1,
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

  /* ---------------- first-person hands (anchored bottom-right) ---------------- */
  const HANDS = {
    hand: [[-0.3, -0.3, 0, 0.6, 0.6, 0.9, '#d8a884'],
      [-0.34, 0.3, -0.1, 0.68, 0.34, 0.7, '#4a5a78'],             // cuff
      [-0.28, 0.24, 0.82, 0.16, 0.16, 0.34, '#e2b28e'],           // fingers
      [-0.06, 0.24, 0.82, 0.16, 0.16, 0.34, '#e2b28e'],
      [0.16, 0.24, 0.82, 0.16, 0.16, 0.34, '#e2b28e'],
      [-0.36, -0.05, 0.5, 0.14, 0.3, 0.24, '#e2b28e']],           // thumb
    talon: [[-0.3, -0.3, 0, 0.55, 0.55, 0.8, '#8a7256'],
      [-0.2, -0.45, 0.7, 0.35, 0.25, 0.42, '#c8a050'],
      [0.1, -0.45, 0.7, 0.25, 0.25, 0.42, '#c8a050'],
      [-0.2, -0.45, 1.06, 0.16, 0.12, 0.2, '#3a3028'],            // claw tips
      [0.14, -0.45, 1.06, 0.12, 0.12, 0.2, '#3a3028'],
      [-0.36, -0.1, 0.55, 0.16, 0.3, 0.3, '#75604a']],
    web: [[-0.3, -0.3, 0, 0.55, 0.55, 0.7, '#5f8f4a'],
      [-0.35, -0.45, 0.6, 0.7, 0.22, 0.55, '#6a9a52'],
      [-0.34, -0.42, 1.05, 0.16, 0.16, 0.34, '#6a9a52'],          // toes
      [-0.1, -0.42, 1.05, 0.16, 0.16, 0.34, '#6a9a52'],
      [0.14, -0.42, 1.05, 0.16, 0.16, 0.34, '#6a9a52']],
    claw: [[-0.3, -0.3, 0, 0.55, 0.55, 0.7, '#3a3038'],
      [-0.25, -0.5, 0.6, 0.2, 0.2, 0.46, '#2a2428'],
      [0.05, -0.5, 0.6, 0.2, 0.2, 0.46, '#2a2428'],
      [-0.25, -0.5, 1.0, 0.14, 0.12, 0.22, '#d8d2c4'],            // claw
      [0.05, -0.5, 1.0, 0.14, 0.12, 0.22, '#d8d2c4'],
      [-0.45, -0.5, 0.55, 0.18, 0.2, 0.4, '#2a2428']],
  };

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
  function buildHandMesh(gl, id) {
    const boxes = HANDS[id] || HANDS.hand;
    const mb = new N.MeshBuilder();
    for (const b of boxes) mb.box(b[0], b[1], b[2], b[3], b[4], b[5], hex(b[6]), false, 1);
    return mb.upload(gl);
  }

  /* ---------------- part animation ---------------- */
  const _m = { a: N.M4.create(), b: N.M4.create(), c: N.M4.create(), d: N.M4.create(), e: N.M4.create(), f: N.M4.create() };
  const WALK_RATE = 7;    // leg cycle per second at full speed; every legged body shares it
  const FLAP_RATE = 11;   // wing beat per second in the air
  const SWIM_RATE = 4.2;  // hind-leg kicks per second. Slower than a walk, and both legs at once
  const KNEE_LAG = 2.4;   // how far ahead of "leg forward" the knee is at its most bent

  /* The angles one part takes this frame, in model space.
     st: { t, phase, move, air, crouch, beat, swim } -- `air` is how far the body
     is off the ground, `crouch` how loaded its legs are, `beat` the shared wing
     phase, `swim` that the body is moving through water with the bodies built
     for it. All four are read off the body's own motion by the caller. */
  function partAngles(entry, st) {
    const p = entry.part, anim = p.anim, sg = p.sign || 1;
    const t = st.t, ph = st.phase || 0;
    const air = st.air || 0, cr = st.crouch || 0;
    let rx = 0, ry = 0, rz = 0, dy = 0, sc = 1;
    const beat = Math.sin(t * (st.fly ? FLAP_RATE : 2.2) + ph);
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
      rx = sg * Math.sin(t * WALK_RATE + ph) * st.move * 0.75;
    } else if (anim === 'knee') {
      /* a knee only bends one way, and it bends most as the leg comes forward.
         The lag is the same on both sides on purpose: the `sign` mirror already
         turns the bend the right way round for a left and a right knee, so a
         per-side phase offset here would desync the pair and give one leg a
         longer stride than the other. */
      const s = Math.sin(t * WALK_RATE + ph + KNEE_LAG);
      rx = sg * (0.25 + 0.85 * Math.max(0, s)) * (0.35 + 0.65 * st.move);
    } else if (anim === 'elbow') {
      rx = sg * (0.12 + 0.3 * Math.max(0, Math.sin(t * WALK_RATE + ph + 1.2)) * st.move);
    } else if (anim === 'twist') {
      ry = Math.sin(t * WALK_RATE + ph + Math.PI) * st.move * 0.16;
    } else if (anim === 'nod') {
      rx = Math.sin(t * 1.9 + ph) * (st.move * 0.06 + 0.02);
    } else if (anim === 'wag') {
      ry = Math.sin(t * (st.fly ? 3.0 : 1.6) + ph) * (st.move * 0.5 + 0.12);
    } else if (anim === 'bob') {
      /* when the body is flying, the heave is the wing beat: the body drops as
         the wings push down. Two unrelated sines is what made a flying body look
         like a body with two loose parts bolted to it. */
      dy = st.fly ? -Math.max(0, st.beat !== undefined ? st.beat : beat) * 0.16
                  : Math.sin(t * 2.2 + ph) * (st.move * 0.12 + 0.05);
    } else if (anim === 'pulse') {
      sc = 1 + (0.10 + 0.16 * st.move) * (0.5 + 0.5 * Math.sin(t * 2.6 + ph));
    }
    /* Swimming replaces the leg cycle for the parts that were built for it. A
       frog does not run on the surface: both hind legs kick together and the
       front legs fold along the body. The `sign` mirror is dropped here on
       purpose -- a synchronous pair is not mirrored in time, and the model data
       already mirrors the geometry -- and the fold lags the sweep: the knees draw
       in over the front half of the stroke, the feet extend back over the back
       half, and the back half is what pushes the water. */
    const swim = st.swim || 0;
    if (swim > 0.01) {
      const k = Math.sin(t * SWIM_RATE + ph);
      if (p.swimKick) {
        rx = anim === 'knee' ? -(0.12 + 0.85 * Math.max(0, k)) * swim
                             : 0.45 * k * swim;
      } else if (p.swimPose) {
        rx = p.swimPose[0] * swim; ry = p.swimPose[1] * swim; rz = p.swimPose[2] * swim;
      } else if (anim === 'bob') {
        dy = 0.03 * k * swim;          // the body rides the kick, not the walk heave
      }
    }
    /* the pose this part takes off the ground / loading a jump */
    if (air > 0.01 && p.air) { rx += p.air[0] * air; ry += p.air[1] * air; rz += p.air[2] * air; }
    if (cr > 0.01 && p.crouch) { rx += p.crouch[0] * cr; ry += p.crouch[1] * cr; rz += p.crouch[2] * cr; }
    return { rx, ry, rz, dy, sc };
  }

  function buildLocal(entry, st) {
    const a = partAngles(entry, st), p = entry.pivot;
    const out = N.M4.create();
    N.M4.ident(out);
    if (a.dy) { const m = _m.e; N.M4.trans(m, 0, a.dy, 0); N.M4.mul(out, out, m); }
    if (p[0] || p[1] || p[2]) { const m = _m.a; N.M4.trans(m, p[0], p[1], p[2]); N.M4.mul(out, out, m); }
    if (a.rz) { const m = _m.b; N.M4.rotZ(m, a.rz); N.M4.mul(out, out, m); }
    if (a.ry) { const m = _m.c; N.M4.rotY(m, a.ry); N.M4.mul(out, out, m); }
    if (a.rx) { const m = _m.d; N.M4.rotX(m, a.rx); N.M4.mul(out, out, m); }
    if (a.sc !== 1) { const m = _m.f; N.M4.scale(m, a.sc, a.sc, a.sc); N.M4.mul(out, out, m); }
    if (p[0] || p[1] || p[2]) { const m = _m.a; N.M4.trans(m, -p[0], -p[1], -p[2]); N.M4.mul(out, out, m); }
    return out;
  }

  /* a part's matrix in model space: its own rotation, inside its parent's */
  function localOf(entry, st, parts) {
    const name = entry.part.name;
    if (!st._loc) st._loc = {};
    const seen = st._loc[name];
    if (seen) return seen;
    let m = buildLocal(entry, st);
    const pname = entry.part.parent;
    if (pname) {
      for (const pe of parts) {
        if (pe.part.name === pname) { m = N.M4.mul(N.M4.create(), localOf(pe, st, parts), m); break; }
      }
    }
    st._loc[name] = m;
    return m;
  }

  function partMatrix(out, base, entry, st, parts) {
    return N.M4.mul(out, base, localOf(entry, st, parts || [entry]));
  }

  N.MODELS = MODELS;
  N.buildModelMeshes = buildModelMeshes;
  N.buildHandMesh = buildHandMesh;
  N.partMatrix = partMatrix;
  /* the pose on its own, without a matrix or a mesh around it: a gait is a
     statement about these angles, and the frame only ever sees the silhouette a
     body leaves from one side of it */
  N.partAngles = partAngles;

})(window.FRUTARIA = window.FRUTARIA || {});
