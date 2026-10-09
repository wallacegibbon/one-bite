/* ==========================================================================
 *  models.js -- voxel creature models (parts + animation)
 *  Model space: model units (scale converts them to metres), +Z is forward, y up, feet at y=0
 *  Part animations: flap (wings) / walk (legs) / wag (tail) / bob (body) / sway (fins, feathers)
 * ========================================================================== */
(function (N) {

  function hex(h) {
    return [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
  }

  /* Part shape: { pivot:[x,y,z], anim:'walk'|'flap'|'wag'|'bob'|'sway', sign:+-1, boxes:[[x,y,z,w,h,d,'#hex'],...] } */
  const MODELS = {
    /* ---------------- human (untransformed) ---------------- */
    human: {
      scale: 0.18, eye: 1.62,
      parts: [
        { name: 'body', boxes: [[-1.5, 3.4, -1, 3, 3.4, 2, '#4a5a78'], [-1.5, 6.8, -1, 3, 0.6, 2, '#7a4a3a']] },
        { name: 'head', pivot: [0, 6.8, 0], anim: 'bob', boxes: [[-1.2, 7.0, -1.2, 2.4, 2.4, 2.4, '#d8a884'], [-1.3, 8.6, -1.3, 2.6, 0.9, 2.6, '#3a2a22'], [-0.8, 7.8, 1.2, 0.6, 0.5, 0.3, '#2a2020'], [0.2, 7.8, 1.2, 0.6, 0.5, 0.3, '#2a2020']] },
        { name: 'armL', pivot: [-1.9, 6.6, 0], anim: 'walk', sign: 1, boxes: [[-2.4, 3.6, -0.6, 0.9, 3.2, 1.2, '#4a5a78'], [-2.4, 1.2, -0.6, 0.9, 2.4, 1.2, '#d8a884']] },
        { name: 'armR', pivot: [1.9, 6.6, 0], anim: 'walk', sign: -1, boxes: [[1.5, 3.6, -0.6, 0.9, 3.2, 1.2, '#4a5a78'], [1.5, 1.2, -0.6, 0.9, 2.4, 1.2, '#d8a884']] },
        { name: 'legL', pivot: [-0.9, 3.4, 0], anim: 'walk', sign: -1, boxes: [[-1.5, 0, -0.7, 1.2, 3.4, 1.4, '#3a3f4a']] },
        { name: 'legR', pivot: [0.9, 3.4, 0], anim: 'walk', sign: 1, boxes: [[0.3, 0, -0.7, 1.2, 3.4, 1.4, '#3a3f4a']] },
        { name: 'bag', pivot: [0, 5, -1], boxes: [[-1.1, 3.6, -2.0, 2.2, 2.4, 1.0, '#7a5a34'], [-1.1, 5.6, -1.9, 2.2, 0.5, 0.8, '#9a7a4a']] }
      ]
    },

    /* ---------------- owl ---------------- */
    owl: {
      scale: 0.16, eye: 0.55,
      parts: [
        { name: 'body', anim: 'bob', boxes: [[-1.4, 1.2, -1.3, 2.8, 3.0, 2.4, '#8a7256'], [-1.1, 1.3, 0.6, 2.2, 2.4, 0.7, '#d8c9a8']] },
        { name: 'head', pivot: [0, 4.0, 0], anim: 'bob', boxes: [[-1.5, 4.0, -1.3, 3.0, 2.2, 2.2, '#9a8266'], [-1.4, 4.4, 0.7, 1.2, 1.2, 0.4, '#f0e0b0'], [-0.2, 4.4, 0.7, 1.2, 1.2, 0.4, '#f0e0b0'], [-0.4, 4.2, 1.0, 0.8, 0.6, 0.5, '#d8a040'], [-1.5, 6.0, -0.6, 0.7, 0.9, 1.4, '#6a5540'], [0.8, 6.0, -0.6, 0.7, 0.9, 1.4, '#6a5540']] },
        { name: 'wingL', pivot: [-1.5, 3.6, -0.2], anim: 'flap', sign: 1, boxes: [[-2.4, 1.4, -1.0, 0.9, 2.8, 2.0, '#7a6248'], [-2.4, 0.2, -0.6, 0.9, 1.4, 1.6, '#6a543c']] },
        { name: 'wingR', pivot: [1.5, 3.6, -0.2], anim: 'flap', sign: -1, boxes: [[1.5, 1.4, -1.0, 0.9, 2.8, 2.0, '#7a6248'], [1.5, 0.2, -0.6, 0.9, 1.4, 1.6, '#6a543c']] },
        { name: 'tail', pivot: [0, 1.6, -1.2], anim: 'wag', boxes: [[-0.8, 0.4, -2.2, 1.6, 1.4, 1.0, '#6a543c']] },
        { name: 'legL', pivot: [-0.7, 1.2, 0], anim: 'walk', sign: -1, boxes: [[-0.9, 0, -0.3, 0.5, 1.2, 0.6, '#c8a050']] },
        { name: 'legR', pivot: [0.7, 1.2, 0], anim: 'walk', sign: 1, boxes: [[0.4, 0, -0.3, 0.5, 1.2, 0.6, '#c8a050']] }
      ]
    },

    /* ---------------- frog (wide low body, eyes on top, folded hind legs) ---------------- */
    frog: {
      scale: 0.13, eye: 0.42,
      parts: [
        { name: 'body', anim: 'bob', boxes: [
          [-1.4, 0.8, -1.4, 2.8, 1.7, 3.0, '#5f8f4a'],
          [-1.2, 0.7, -1.2, 2.4, 0.7, 2.6, '#c8d8a0'],
          [-1.3, 1.0, -1.3, 0.5, 0.9, 0.5, '#4e7a3c'], [0.8, 1.0, -0.6, 0.5, 0.9, 0.5, '#4e7a3c'],
          [-0.9, 1.9, -0.9, 0.6, 0.4, 0.6, '#6a9a52'], [0.3, 1.9, -0.4, 0.6, 0.4, 0.6, '#6a9a52']
        ] },
        { name: 'head', pivot: [0, 1.6, 1.4], anim: 'bob', boxes: [
          [-1.2, 1.1, 1.4, 2.4, 1.3, 1.3, '#6a9a52'],
          [-0.9, 1.0, 2.6, 1.8, 0.35, 0.3, '#3a5a2c'],
          [-1.05, 2.3, 1.5, 0.8, 0.8, 0.8, '#e8e0a0'], [0.25, 2.3, 1.5, 0.8, 0.8, 0.8, '#e8e0a0'],
          [-0.85, 2.5, 2.1, 0.4, 0.4, 0.3, '#1a1208'], [0.45, 2.5, 2.1, 0.4, 0.4, 0.3, '#1a1208']
        ] },
        { name: 'legFL', pivot: [-1.1, 1.2, 1.0], anim: 'walk', sign: 1, boxes: [[-1.5, 0, 0.8, 0.7, 1.1, 0.8, '#4e7a3c'], [-1.5, 0, 1.5, 0.9, 0.25, 0.6, '#6a9a52']] },
        { name: 'legFR', pivot: [1.1, 1.2, 1.0], anim: 'walk', sign: -1, boxes: [[0.8, 0, 0.8, 0.7, 1.1, 0.8, '#4e7a3c'], [0.6, 0, 1.5, 0.9, 0.25, 0.6, '#6a9a52']] },
        { name: 'legBL', pivot: [-1.3, 1.5, -1.0], anim: 'walk', sign: -1, boxes: [
          [-1.9, 0.9, -1.6, 1.0, 1.1, 2.2, '#5f8f4a'], [-1.8, 0, -2.4, 0.9, 0.9, 1.1, '#4e7a3c'], [-1.9, 0, -3.2, 1.1, 0.3, 0.9, '#6a9a52']
        ] },
        { name: 'legBR', pivot: [1.3, 1.5, -1.0], anim: 'walk', sign: 1, boxes: [
          [0.9, 0.9, -1.6, 1.0, 1.1, 2.2, '#5f8f4a'], [0.9, 0, -2.4, 0.9, 0.9, 1.1, '#4e7a3c'], [0.8, 0, -3.2, 1.1, 0.3, 0.9, '#6a9a52']
        ] }
      ]
    },

    /* ---------------- jellyfish ---------------- */
    jelly: {
      scale: 0.16, eye: 0.50, glow: [0.55, 0.8, 1.0],
      parts: [
        { name: 'body', anim: 'bob', boxes: [[-1.6, 1.6, -1.6, 3.2, 1.8, 3.2, '#8fd0ff'], [-1.0, 3.2, -1.0, 2.0, 0.8, 2.0, '#bfe8ff']] },
        { name: 't0', pivot: [-1.0, 1.6, -1.0], anim: 'sway', sign: 1, boxes: [[-1.2, -1.2, -1.2, 0.4, 2.8, 0.4, '#a8dcff']] },
        { name: 't1', pivot: [1.0, 1.6, 1.0], anim: 'sway', sign: -1, boxes: [[0.8, -1.2, 0.8, 0.4, 2.8, 0.4, '#a8dcff']] },
        { name: 't2', pivot: [-1.0, 1.6, 1.0], anim: 'sway', sign: -1, boxes: [[-1.2, -1.4, 0.8, 0.4, 3.0, 0.4, '#8fd0ff']] },
        { name: 't3', pivot: [1.0, 1.6, -1.0], anim: 'sway', sign: 1, boxes: [[0.8, -1.4, -1.2, 0.4, 3.0, 0.4, '#8fd0ff']] }
      ]
    },

    /* ---------------- bear ---------------- */
    bear: {
      scale: 0.24, eye: 1.15,
      parts: [
        { name: 'body', anim: 'bob', boxes: [[-1.8, 2.6, -2.8, 3.6, 3.0, 5.6, '#6a6258'], [-1.6, 2.8, -2.6, 3.2, 1.2, 4.8, '#8a8272']] },
        { name: 'head', pivot: [0, 4.8, 2.6], anim: 'bob', boxes: [[-1.4, 4.4, 2.2, 2.8, 2.4, 2.2, '#7a7266'], [-0.6, 4.4, 4.2, 1.2, 1.0, 0.8, '#a89a86'], [-1.3, 6.4, 2.4, 0.6, 0.7, 0.5, '#5a5248'], [0.7, 6.4, 2.4, 0.6, 0.7, 0.5, '#5a5248'], [-0.8, 5.6, 4.2, 0.4, 0.4, 0.3, '#1a1410'], [0.4, 5.6, 4.2, 0.4, 0.4, 0.3, '#1a1410']] },
        { name: 'legFL', pivot: [-1.5, 3.0, 1.6], anim: 'walk', sign: 1, boxes: [[-2.2, 0, 1.0, 1.2, 3.0, 1.4, '#5a5248']] },
        { name: 'legFR', pivot: [1.5, 3.0, 1.6], anim: 'walk', sign: -1, boxes: [[1.0, 0, 1.0, 1.2, 3.0, 1.4, '#5a5248']] },
        { name: 'legBL', pivot: [-1.5, 3.0, -1.6], anim: 'walk', sign: -1, boxes: [[-2.2, 0, -2.4, 1.2, 3.0, 1.4, '#5a5248']] },
        { name: 'legBR', pivot: [1.5, 3.0, -1.6], anim: 'walk', sign: 1, boxes: [[1.0, 0, -2.4, 1.2, 3.0, 1.4, '#5a5248']] }
      ]
    },

  };

  /* ---------------- first-person hands (anchored bottom-right) ---------------- */
  const HANDS = {
    hand: [[-0.3, -0.3, 0, 0.6, 0.6, 0.9, '#d8a884'], [-0.35, 0.3, -0.1, 0.7, 0.35, 0.7, '#4a5a78']],
    talon: [[-0.3, -0.3, 0, 0.55, 0.55, 0.8, '#8a7256'], [-0.2, -0.45, 0.7, 0.35, 0.25, 0.35, '#c8a050'], [0.1, -0.45, 0.7, 0.25, 0.25, 0.3, '#c8a050']],
    web: [[-0.3, -0.3, 0, 0.55, 0.55, 0.7, '#5f8f4a'], [-0.35, -0.45, 0.6, 0.7, 0.25, 0.5, '#6a9a52']],
    claw: [[-0.3, -0.3, 0, 0.55, 0.55, 0.7, '#3a3038'], [-0.25, -0.5, 0.6, 0.2, 0.2, 0.4, '#2a2428'], [0.05, -0.5, 0.6, 0.2, 0.2, 0.4, '#2a2428']],
    tentacle: [[-0.25, -0.4, 0, 0.5, 0.8, 0.5, '#8fd0ff'], [-0.15, -0.7, 0.2, 0.25, 0.4, 0.25, '#a8dcff']],
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

  /* part animation matrices */
  const _m = { a: N.M4.create(), b: N.M4.create(), c: N.M4.create(), d: N.M4.create(), e: N.M4.create() };
  const WALK_RATE = 7;    // leg cycle per second at full speed; every legged body shares it
  function partMatrix(out, base, entry, st) {
    const M4 = N.M4, p = entry.pivot, anim = entry.part.anim, sg = entry.part.sign || 1;
    let rx = 0, ry = 0, rz = 0, dy = 0;
    const t = st.t, ph = st.phase || 0;
    if (anim === 'flap') {
      const amp = st.fly ? 0.85 : 0.12, spd = st.fly ? 11 : 2.2;
      rz = sg * Math.sin(t * spd + ph) * amp;
      ry = sg * (st.fly ? 0.15 : 0.0);
    } else if (anim === 'walk') {
      rx = sg * Math.sin(t * WALK_RATE + ph) * st.move * 0.75;
    } else if (anim === 'wag') {
      ry = Math.sin(t * (st.fly ? 3.0 : 1.6) + ph) * (st.move * 0.5 + 0.12);
    } else if (anim === 'bob') {
      dy = Math.sin(t * (st.fly ? 6 : 2.2) + ph) * (st.move * 0.12 + 0.05);
    } else if (anim === 'sway') {
      rz = sg * Math.sin(t * 2.4 + ph) * 0.28;
      rx = Math.sin(t * 1.7 + ph) * 0.12;
    }
    M4.ident(out);
    if (dy) { const m = _m.e; M4.trans(m, 0, dy, 0); M4.mul(out, out, m); }
    if (p[0] || p[1] || p[2]) { const m = _m.a; M4.trans(m, p[0], p[1], p[2]); M4.mul(out, out, m); }
    if (rz) { const m = _m.b; M4.rotZ(m, rz); M4.mul(out, out, m); }
    if (ry) { const m = _m.c; M4.rotY(m, ry); M4.mul(out, out, m); }
    if (rx) { const m = _m.d; M4.rotX(m, rx); M4.mul(out, out, m); }
    if (p[0] || p[1] || p[2]) { const m = _m.a; M4.trans(m, -p[0], -p[1], -p[2]); M4.mul(out, out, m); }
    M4.mul(out, base, out);
    return out;
  }

  N.MODELS = MODELS;
  N.HANDS = HANDS;
  N.buildModelMeshes = buildModelMeshes;
  N.buildHandMesh = buildHandMesh;
  N.partMatrix = partMatrix;
  N.hexToRGB = hex;

})(window.FRUTARIA = window.FRUTARIA || {});
