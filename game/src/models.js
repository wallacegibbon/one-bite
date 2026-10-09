/* ==========================================================================
 *  models.js -- voxel creature models (parts + animation)
 *  Model space: model units (scale converts them to metres), +Z is forward, y up, feet at y=0
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
                  crouch:[rx,ry,rz], boxes:[[x,y,z,w,h,d,'#hex'],...] } */
  const MODELS = {
    /* ---------------- human (untransformed) ----------------
       1.80 m, eight heads. The old one was a blue crate with four sticks: no
       neck, no waist, no knee, no face. A body you look at in third person for
       an hour needs joints, or it reads as furniture sliding around. */
    human: {
      scale: 0.18, eye: 1.60,
      parts: [
        { name: 'hips', boxes: [[-1.15, 4.3, -0.85, 2.3, 0.85, 1.7, '#39414d']] },
        { name: 'torso', parent: 'hips', pivot: [0, 4.7, 0], anim: 'twist', boxes: [
          [-1.3, 5.05, -0.9, 2.6, 2.45, 1.8, '#4a5a78'],          // chest
          [-1.42, 7.1, -0.95, 2.84, 0.45, 1.9, '#41506c'],        // shoulder line
          [-1.2, 4.62, -0.95, 2.4, 0.45, 1.9, '#5a4030'],         // belt
          [-0.85, 7.45, -0.7, 1.7, 0.4, 1.4, '#7a4a3a'],          // collar
          [-1.35, 6.3, 0.9, 0.55, 0.9, 0.12, '#6a5138']           // satchel strap over the chest
        ] },
        { name: 'head', parent: 'torso', pivot: [0, 7.55, 0], anim: 'nod', boxes: [
          [-0.95, 7.75, -0.95, 1.9, 1.95, 1.9, '#d8a884'],        // skull
          [-1.05, 9.2, -1.05, 2.1, 0.75, 2.1, '#3a2a22'],         // hair
          [-1.05, 8.0, -1.2, 2.1, 1.5, 0.5, '#33241d'],           // hair, back
          [-1.0, 8.95, 0.8, 2.0, 0.55, 0.35, '#3a2a22'],          // fringe
          [-0.86, 8.85, 0.92, 1.72, 0.22, 0.16, '#2c2019'],       // brow
          [-0.66, 8.42, 0.94, 0.4, 0.42, 0.14, '#241c18'],        // eye
          [0.26, 8.42, 0.94, 0.4, 0.42, 0.14, '#241c18'],         // eye
          [-0.17, 8.05, 0.96, 0.34, 0.4, 0.22, '#c79a76'],        // nose
          [-0.55, 7.8, 0.94, 1.1, 0.16, 0.14, '#a8785a']          // mouth
        ] },
        { name: 'armL', parent: 'torso', pivot: [-1.5, 7.2, 0], anim: 'walk', sign: -1,
          air: [0.5, 0, -0.35], boxes: [[-1.9, 5.75, -0.55, 0.8, 1.5, 1.1, '#4a5a78']] },
        { name: 'foreL', parent: 'armL', pivot: [-1.5, 5.8, 0], anim: 'elbow', sign: -1,
          air: [-0.7, 0, 0], boxes: [
            [-1.85, 4.35, -0.5, 0.7, 1.45, 1.0, '#d8a884'],       // forearm
            [-1.82, 3.75, -0.52, 0.72, 0.62, 1.02, '#e2b28e']     // hand
          ] },
        { name: 'armR', parent: 'torso', pivot: [1.5, 7.2, 0], anim: 'walk', sign: 1,
          air: [0.5, 0, 0.35], boxes: [[1.1, 5.75, -0.55, 0.8, 1.5, 1.1, '#4a5a78']] },
        { name: 'foreR', parent: 'armR', pivot: [1.5, 5.8, 0], anim: 'elbow', sign: 1,
          air: [-0.7, 0, 0], boxes: [
            [1.15, 4.35, -0.5, 0.7, 1.45, 1.0, '#d8a884'],
            [1.1, 3.75, -0.52, 0.72, 0.62, 1.02, '#e2b28e']
          ] },
        { name: 'thighL', parent: 'hips', pivot: [-0.62, 4.4, 0], anim: 'walk', sign: 1,
          air: [-0.55, 0, 0], boxes: [[-1.08, 2.6, -0.65, 1.16, 1.8, 1.35, '#39414d']] },
        { name: 'shinL', parent: 'thighL', pivot: [-0.62, 2.65, 0], anim: 'knee', sign: 1,
          air: [0.95, 0, 0], boxes: [
            [-1.02, 0.8, -0.6, 1.06, 1.85, 1.2, '#414a57'],       // trouser
            [-1.08, 0, -0.8, 1.18, 0.82, 1.95, '#2b2522']         // boot, toe in front
          ] },
        { name: 'thighR', parent: 'hips', pivot: [0.62, 4.4, 0], anim: 'walk', sign: -1,
          air: [-0.55, 0, 0], boxes: [[-0.08, 2.6, -0.65, 1.16, 1.8, 1.35, '#39414d']] },
        { name: 'shinR', parent: 'thighR', pivot: [0.62, 2.65, 0], anim: 'knee', sign: -1,
          air: [0.95, 0, 0], boxes: [
            [0.04, 0.8, -0.6, 1.06, 1.85, 1.2, '#414a57'],
            [-0.1, 0, -0.8, 1.18, 0.82, 1.95, '#2b2522']
          ] },
        { name: 'bag', parent: 'torso', pivot: [0, 5.2, -1.1], boxes: [
          [-0.95, 4.55, -1.62, 1.9, 1.7, 0.72, '#7a5a34'],
          [-0.95, 5.75, -1.7, 1.9, 0.42, 0.86, '#9a7a4a'],        // flap
          [-0.2, 5.5, -1.78, 0.4, 0.5, 0.16, '#c8a45a']           // buckle
        ] }
      ]
    },

    /* ---------------- owl ----------------
       0.70 m tall, and the wings are the whole point. The old ones were panels
       as tall as the body hanging off the ribs, so flapping swept them through
       the legs and out the far side. Now: a short upper wing hinged at the
       shoulder, a forearm of primaries hinged at the elbow, and the span runs
       sideways instead of downwards. */
    owl: {
      scale: 0.16, eye: 0.60,
      parts: [
        { name: 'body', anim: 'bob', boxes: [
          [-1.1, 0.9, -1.0, 2.2, 2.15, 2.0, '#8a7256'],
          [-0.85, 1.05, 0.86, 1.7, 1.75, 0.3, '#d8c9a8'],         // breast
          [-0.9, 0.95, -0.7, 1.8, 0.45, 1.5, '#c6b594'],          // belly
          [-0.55, 2.75, -0.9, 1.1, 0.35, 1.6, '#7a6248']          // mantle between the shoulders
        ] },
        { name: 'head', parent: 'body', pivot: [0, 3.0, 0], anim: 'nod', boxes: [
          [-1.2, 3.0, -1.0, 2.4, 1.75, 1.9, '#9a8266'],
          [-1.15, 3.1, 0.78, 1.0, 1.35, 0.26, '#e6d7b4'],         // facial disc
          [0.15, 3.1, 0.78, 1.0, 1.35, 0.26, '#e6d7b4'],
          [-1.28, 3.0, 0.72, 0.26, 1.55, 0.22, '#6a5540'],        // disc rim
          [1.02, 3.0, 0.72, 0.26, 1.55, 0.22, '#6a5540'],
          [-0.86, 3.72, 0.92, 0.62, 0.62, 0.24, '#241a10'],       // eyes, facing forward
          [0.24, 3.72, 0.92, 0.62, 0.62, 0.24, '#241a10'],
          [-0.95, 4.42, 0.86, 0.8, 0.24, 0.26, '#6a5540'],        // brows
          [0.15, 4.42, 0.86, 0.8, 0.24, 0.26, '#6a5540'],
          [-0.22, 3.36, 0.98, 0.44, 0.52, 0.36, '#d8a040'],       // beak
          [-1.12, 4.62, -0.35, 0.46, 0.72, 0.62, '#6a5540'],      // ear tufts
          [0.66, 4.62, -0.35, 0.46, 0.72, 0.62, '#6a5540']
        ] },
        { name: 'wingL', parent: 'body', pivot: [-1.05, 2.75, -0.1], anim: 'flap', sign: -1,
          air: [0, 0, -1.32], boxes: [[-1.52, 1.5, -0.8, 0.5, 1.35, 1.55, '#75604a']] },
        { name: 'foreL', parent: 'wingL', pivot: [-1.27, 1.55, -0.1], anim: 'fold', sign: -1,
          air: [0, 0, -0.95], boxes: [
            [-1.45, 0.5, -1.55, 0.42, 1.1, 2.3, '#5f4c38'],       // primaries
            [-1.45, 0.42, 0.62, 0.42, 0.5, 0.72, '#54432f']       // leading edge
          ] },
        { name: 'wingR', parent: 'body', pivot: [1.05, 2.75, -0.1], anim: 'flap', sign: 1,
          air: [0, 0, 1.32], boxes: [[1.02, 1.5, -0.8, 0.5, 1.35, 1.55, '#75604a']] },
        { name: 'foreR', parent: 'wingR', pivot: [1.27, 1.55, -0.1], anim: 'fold', sign: 1,
          air: [0, 0, 0.95], boxes: [
            [1.03, 0.5, -1.55, 0.42, 1.1, 2.3, '#5f4c38'],
            [1.03, 0.42, 0.62, 0.42, 0.5, 0.72, '#54432f']
          ] },
        { name: 'tail', parent: 'body', pivot: [0, 1.35, -1.0], anim: 'wag', boxes: [
          [-0.62, 0.45, -1.95, 1.24, 0.95, 1.05, '#6a543c']
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
       air pose (extended), and the throat pulses while it breathes. */
    frog: {
      scale: 0.13, eye: 0.42,
      parts: [
        { name: 'body', anim: 'bob', boxes: [
          [-1.3, 0.85, -1.5, 2.6, 1.65, 3.0, '#5f8f4a'],
          [-1.05, 0.9, -2.15, 2.1, 1.35, 0.9, '#5a8746'],         // the hips taper
          [-1.15, 0.8, -1.25, 2.3, 0.5, 2.5, '#c8d8a0'],          // belly
          [-0.95, 2.4, -0.95, 0.75, 0.22, 0.75, '#4e7a3c'],       // back spots
          [0.2, 2.4, 0.15, 0.75, 0.22, 0.75, '#4e7a3c'],
          [-1.32, 1.5, -0.3, 0.16, 0.7, 1.3, '#4e7a3c'],          // flank
          [1.16, 1.5, -0.3, 0.16, 0.7, 1.3, '#4e7a3c']
        ] },
        { name: 'head', parent: 'body', pivot: [0, 1.9, 1.35], anim: 'nod', boxes: [
          [-1.35, 1.3, 1.3, 2.7, 1.4, 1.3, '#6a9a52'],
          [-1.15, 1.36, 2.56, 2.3, 0.26, 0.16, '#39592b'],        // mouth line
          [-1.05, 2.55, 1.5, 0.85, 0.8, 0.85, '#e8e0a0'],         // eyes, on top
          [0.2, 2.55, 1.5, 0.85, 0.8, 0.85, '#e8e0a0'],
          [-0.9, 2.66, 2.28, 0.5, 0.5, 0.26, '#1a1208'],          // pupils
          [0.4, 2.66, 2.28, 0.5, 0.5, 0.26, '#1a1208'],
          [-0.62, 2.2, 2.5, 0.26, 0.22, 0.18, '#39592b'],         // nostrils
          [0.36, 2.2, 2.5, 0.26, 0.22, 0.18, '#39592b']
        ] },
        { name: 'throat', parent: 'head', pivot: [0, 1.4, 1.6], anim: 'pulse', boxes: [
          [-0.78, 1.0, 1.5, 1.56, 0.42, 0.95, '#d5e0b0']
        ] },
        { name: 'legFL', parent: 'body', pivot: [-1.15, 1.2, 1.0], anim: 'walk', sign: 1,
          air: [-0.38, 0, 0.2], boxes: [
            [-1.5, 0.15, 0.75, 0.65, 1.1, 0.7, '#4e7a3c'],
            [-1.58, 0, 1.35, 0.82, 0.22, 0.8, '#6a9a52']          // toes
          ] },
        { name: 'legFR', parent: 'body', pivot: [1.15, 1.2, 1.0], anim: 'walk', sign: -1,
          air: [-0.38, 0, -0.2], boxes: [
            [0.85, 0.15, 0.75, 0.65, 1.1, 0.7, '#4e7a3c'],
            [0.76, 0, 1.35, 0.82, 0.22, 0.8, '#6a9a52']
          ] },
        { name: 'thighL', parent: 'body', pivot: [-1.35, 1.75, -0.85], anim: 'walk', sign: -1,
          air: [0.55, 0, 0.12], crouch: [-0.5, 0, 0.12], boxes: [
            [-1.95, 0.9, -1.5, 1.05, 1.2, 2.15, '#5f8f4a']        // the muscle
          ] },
        { name: 'shinL', parent: 'thighL', pivot: [-1.42, 1.0, -1.45], anim: 'knee', sign: -1,
          air: [1.4, 0, 0], crouch: [-0.95, 0, 0], boxes: [
            [-1.8, 0.1, -1.4, 0.8, 1.0, 1.05, '#4e7a3c'],
            [-1.9, 0, -0.65, 1.02, 0.24, 1.45, '#6a9a52']         // long foot
          ] },
        { name: 'thighR', parent: 'body', pivot: [1.35, 1.75, -0.85], anim: 'walk', sign: 1,
          air: [0.55, 0, -0.12], crouch: [-0.5, 0, -0.12], boxes: [
            [0.9, 0.9, -1.5, 1.05, 1.2, 2.15, '#5f8f4a']
          ] },
        { name: 'shinR', parent: 'thighR', pivot: [1.42, 1.0, -1.45], anim: 'knee', sign: 1,
          air: [1.4, 0, 0], crouch: [-0.95, 0, 0], boxes: [
            [1.0, 0.1, -1.4, 0.8, 1.0, 1.05, '#4e7a3c'],
            [0.88, 0, -0.65, 1.02, 0.24, 1.45, '#6a9a52']
          ] }
      ]
    },

    /* ---------------- bear ---------------- */
    bear: {
      scale: 0.24, eye: 1.15,
      parts: [
        { name: 'body', anim: 'bob', boxes: [
          [-1.8, 2.6, -2.8, 3.6, 3.0, 5.6, '#6a6258'],
          [-1.6, 2.8, -2.6, 3.2, 1.2, 4.8, '#8a8272'],
          [-1.5, 5.1, -1.6, 3.0, 0.7, 3.4, '#5f574e']             // shoulder hump
        ] },
        { name: 'head', parent: 'body', pivot: [0, 4.8, 2.6], anim: 'nod', boxes: [
          [-1.4, 4.4, 2.2, 2.8, 2.4, 2.2, '#7a7266'],
          [-0.62, 4.4, 4.2, 1.24, 1.05, 0.9, '#a89a86'],          // muzzle
          [-0.28, 5.15, 5.02, 0.56, 0.4, 0.2, '#2a2420'],         // nose
          [-1.3, 6.4, 2.4, 0.62, 0.75, 0.5, '#5a5248'],           // ears
          [0.68, 6.4, 2.4, 0.62, 0.75, 0.5, '#5a5248'],
          [-0.82, 5.7, 4.32, 0.4, 0.4, 0.24, '#1a1410'],          // eyes
          [0.42, 5.7, 4.32, 0.4, 0.4, 0.24, '#1a1410']
        ] },
        { name: 'legFL', parent: 'body', pivot: [-1.5, 3.0, 1.6], anim: 'walk', sign: 1,
          boxes: [[-2.2, 0.9, 1.0, 1.2, 2.1, 1.4, '#5a5248']] },
        { name: 'shinFL', parent: 'legFL', pivot: [-1.5, 1.0, 1.6], anim: 'knee', sign: 1,
          boxes: [[-2.25, 0, 0.9, 1.3, 1.0, 1.7, '#4c453d']] },
        { name: 'legFR', parent: 'body', pivot: [1.5, 3.0, 1.6], anim: 'walk', sign: -1,
          boxes: [[1.0, 0.9, 1.0, 1.2, 2.1, 1.4, '#5a5248']] },
        { name: 'shinFR', parent: 'legFR', pivot: [1.5, 1.0, 1.6], anim: 'knee', sign: -1,
          boxes: [[0.95, 0, 0.9, 1.3, 1.0, 1.7, '#4c453d']] },
        { name: 'legBL', parent: 'body', pivot: [-1.5, 3.0, -1.6], anim: 'walk', sign: -1,
          boxes: [[-2.2, 0.9, -2.4, 1.2, 2.1, 1.4, '#5a5248']] },
        { name: 'shinBL', parent: 'legBL', pivot: [-1.5, 1.0, -1.6], anim: 'knee', sign: -1,
          boxes: [[-2.25, 0, -2.5, 1.3, 1.0, 1.7, '#4c453d']] },
        { name: 'legBR', parent: 'body', pivot: [1.5, 3.0, -1.6], anim: 'walk', sign: 1,
          boxes: [[1.0, 0.9, -2.4, 1.2, 2.1, 1.4, '#5a5248']] },
        { name: 'shinBR', parent: 'legBR', pivot: [1.5, 1.0, -1.6], anim: 'knee', sign: 1,
          boxes: [[0.95, 0, -2.5, 1.3, 1.0, 1.7, '#4c453d']] }
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
      for (const b of part.boxes) mb.box(b[0], b[1], b[2], b[3], b[4], b[5], typeof b[6] === 'string' ? hex(b[6]) : b[6], false, 1);
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

  /* The angles one part takes this frame, in model space.
     st: { t, phase, move, air, crouch, beat } -- `air` is how far the body is
     off the ground, `crouch` how loaded its legs are, `beat` the shared wing
     phase. All three are read off the body's own motion by the caller. */
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
      /* a knee only bends one way, and it bends most as the leg comes forward */
      const s = Math.sin(t * WALK_RATE + ph + (sg > 0 ? 2.4 : 2.4));
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
    } else if (anim === 'sway') {
      rz = sg * Math.sin(t * 2.4 + ph) * 0.28;
      rx = Math.sin(t * 1.7 + ph) * 0.12;
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
  N.HANDS = HANDS;
  N.buildModelMeshes = buildModelMeshes;
  N.buildHandMesh = buildHandMesh;
  N.partMatrix = partMatrix;
  N.hexToRGB = hex;

})(window.FRUTARIA = window.FRUTARIA || {});
