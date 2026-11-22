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
 *  Parts are authored in the bind pose.
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
     block uses. No body you can wear carries a light of its own
     (docs/07 s1): the switch now serves the fruit blocks alone. */
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
          /* the collar is a ruff: it has to stand outside the head it wraps and
             outside the shoulder line it sits on, or it is drawn and never once
             reaches a frame -- enclosed by another box, it is hidden behind the
             near face of that one. Widening it is also what separates a head from
             a body at the neck, which is the joint this model had no shading or
             colour at: the head is half the body, and its own colour is one luma
             step from the coat. It is the widest thing the person wears, so it is
             the model's reach: 0.40 m against the 0.41 m the collision box
             allows (docs/04 s4). */
          [-1.6, 7.1, -1.5, 3.2, 0.6, 3.0, '#7a4a3a'],           // collar, round the neck
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
             never a gap. Measured at that joint the frame holds a colour
             difference of 0.003 to 0.009, which is the intention: hip and thigh
             are one pair of trousers, and the joints of this body that the frame
             does show already hold 0.10 to 0.79 of a colour difference (coat
             against trousers 0.50, satchel against coat 0.79, bare skin against
             the coat 0.21), so nothing of this palette was moved -- and at the
             shot the game films a person with, 5.55 m at 84 degrees, the body is
             only 2100 to 2700 pixels, too few for twelve markers to tell twelve
             parts apart over, which is why the joint step asks its claims of the
             animals and not of the person. */
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

    /* ---------------- frog ----------------
       0.50 m, wide and low, no neck, eyes set wide apart at the corners of the
       skull. The hind leg is three bones: the muscle (thigh), the folded shin,
       the long foot. A frog does not walk, so the hind leg has a crouch pose
       (loading a hop) and an air pose (extended), and the throat pulses while
       it breathes. The whole animal is kept inside the 0.5 m box it collides
       with -- the snout used to reach 0.13 m past it, so a frog against a wall
       had its head in the wall. */
    frog: {
      eye: 0.42,
      parts: [
        { name: 'body', anim: 'bob', boxes: [
          [-1.3, 0.85, -1.3, 2.6, 1.65, 2.6, '#5f8f4a'],
          [-1.05, 0.9, -1.85, 2.1, 1.35, 0.8, '#5a8746'],         // the hips taper
          [-1.15, 0.8, -1.1, 2.3, 0.5, 2.2, '#c8d8a0'],           // belly
          [-1.32, 1.5, -0.3, 0.16, 0.7, 1.3, '#4e7a3c'],          // flank
          [1.16, 1.5, -0.3, 0.16, 0.7, 1.3, '#4e7a3c']
        ] },
        /* the skull was the trunk's green and the thigh muscle was the trunk's
           green, which is two joints the frame could not see: 171 pixels of
           body-to-head seam holding a colour difference of 0.085 with only 23% of
           them reading as two colours, and 57 pixels of body-to-thigh at 0.014
           with 7% of them the very same colour on both sides of the line. The
           skull moves blue (#6a9a52 -> #68965c) and the muscle moves yellow-green
           (#5f8f4a -> #6d8a4a): the differences become 0.146 and 0.118, both seams
           are two colours end to end, and no pixel of either is one colour twice.
           And the commonest single colour in a frog's frame used to cover 35.7% of
           its pixels pooled over the four bearings the game films it at: 30.8%
           after the palette moved, 32.8% after the face stood out of the head,
           30.7% after the mouth line went and the muzzle took two tones. */
        { name: 'head', parent: 'body', pivot: [0, 1.9, 1.15], anim: 'nod', boxes: [
          [-1.25, 1.3, 1.15, 2.5, 1.4, 1.05, '#68965c'],
          /* the snout: the face below the eyes used to be a flat plate of the
             skull's own green -- a mask painted on a cube, and it read as one.
             A frog's snout stands out of the head, so the muzzle does: the
             head's own width, 0.15 of the model's own units past the skull,
             lighter than the skull so the step reads at a distance, and the
             eyes' own fronts standing flush with it, the way a frog's do.
             The face asks for nothing more: no nose, no mouth, the snout and
             the two eyes over it. The front face is two greens, a lighter
             over a darker, split 0.35 up from the bottom: one colour over
             the whole face is a wall, and the joint step (play.js) asks that
             the commonest single colour of the frog stay under a third of
             the frame pooled over the four bearings the game films it at --
             a single-tone muzzle was 44.9% of the face bearing. The split
             also sits above the 15x15 patch the flank step reads (model y
             1.74..2.10), so that patch still sits on one tone. How far out
             the step may stand is the collision box's own law (node-smoke):
             every corner of the model must sit inside 0.35 m of the body's
             centre line, and the muzzle's corners are the ones that answer
             for it -- 0.346 m out, the eye plates beside them 0.343. */
          [-1.25, 1.45, 1.5, 2.5, 0.7, 0.85, '#76a264'],         // the muzzle's lower face, the darker of the two
          [-1.25, 2.15, 1.5, 2.5, 0.35, 0.85, '#7ca869'],        // the muzzle's upper face, the lighter
          [-1.2, 2.5, 1.3, 0.85, 0.8, 0.85, '#e8e0a0'],          // eyes, on top, at the corners
          [0.35, 2.5, 1.3, 0.85, 0.8, 0.85, '#e8e0a0'],
          /* the front of an eye is all black: the small dark square a pupil
             used to be sat in a cream face and read as a robot's lens. A frog's
             eye is the black that shows; the cream is the dome of the socket
             it rides in, and it still shows as the rim over the black */
          [-1.2, 2.5, 2.1, 0.85, 0.8, 0.25, '#1a1208'],          // the front of the eye, black, flush with the muzzle's front
          [0.35, 2.5, 2.1, 0.85, 0.8, 0.25, '#1a1208']
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
            [-1.95, 0.9, -1.4, 1.05, 1.2, 2.0, '#6d8a4a']         // the muscle, no longer the trunk's own green
          ] },
        { name: 'shinL', parent: 'thighL', pivot: [-1.42, 1.0, -1.35], anim: 'knee', sign: -1, stride: 0, stands: 1, bend: -1,
          air: [1.4, 0, 0], crouch: [-0.95, 0, 0], swimKick: 1, heldPose: [1, 0, -0.1], boxes: [
            [-1.8, 0.1, -1.3, 0.8, 1.0, 1.0, '#4e7a3c'],
            [-1.9, 0, -0.6, 1.02, 0.24, 1.4, '#6a9a52']           // long foot
          ] },
        { name: 'thighR', parent: 'body', pivot: [1.35, 1.75, -0.75], anim: 'walk', sign: 1, stride: 0, stands: 1,
          air: [0.55, 0, -0.12], crouch: [-0.5, 0, -0.12], swimKick: 1, heldPose: [0, 0, 0.1], boxes: [
            [0.9, 0.9, -1.4, 1.05, 1.2, 2.0, '#6d8a4a']
          ] },
        { name: 'shinR', parent: 'thighR', pivot: [1.42, 1.0, -1.35], anim: 'knee', sign: 1, stride: 0, stands: 1, bend: -1,
          air: [1.4, 0, 0], crouch: [-0.95, 0, 0], swimKick: 1, heldPose: [1, 0, 0.1], boxes: [
            [1.0, 0.1, -1.3, 0.8, 1.0, 1.0, '#4e7a3c'],
            [0.88, 0, -0.6, 1.02, 0.24, 1.4, '#6a9a52']
          ] }
      ]
    },
    /* ---------------- sea turtle ----------------
       A flat animal, and the model is flat because the animal is. The shell's
       dome rises a quarter of the shell's own length; its belly shield is carved
       down at the sand, because this body gets along on land by dragging -- the
       row says as much, and the row and the model are one animal. The tallest
       thing on it is its head, which is raised: that is the pose this animal
       lies in at the top of the water, head out, breathing, and it is the pose
       the worn body is drawn in the moment it stops moving (the row's own
       `hover`, and `floatLevel` in src/entities.js).
       The front wings are plates. Each one is a thick root at the shoulder and a
       blade that is thin through, wide along its chord and wide outboard -- the
       shape a flipper is, and the reason the water's stroke works: a blade that
       is thick through is a body moving water out of the way, not a wing pushing
       against it. The blades are held swept back, which is where a turtle keeps
       them when it is not swimming.
       Measured off its own boxes at the row's 0.25 scale, in the pose it is
       authored in, and off the matrices the draw uploads for it: play.js
       `theSeaTurtleStrokesBothWingsTogether` reports those readings as `carved`,
       `idle` and `stroke` and prints each wing's blade through, along its chord
       and out from the shoulder, and it is the record of this body's size rather
       than anything written below. Of the two figures worth stating here because
       that step holds them: the plate is **0.045 m** through against **0.300 m**
       of chord and **0.362 m** out, and the column of it at the shoulder is
       **0.205 m** through; and the tallest point of the authored body is
       **0.450 m**, which is the height the form's box states and the height the
       water's hold is asked of.
       The model does NOT fit the box the world enforces for it in plan (the form
       states a 1.5 m square, half-width 0.75 m) and it is not carved to: the
       span reaches past that wall, and further still at the top of a stroke.
       What the swept-back pose buys is the difference between those two numbers:
       a body pressed against a rock face draws its wings through the face instead
       of standing past it the whole time. The span appears when the wings move,
       and play.js measures all three readings off the matrices rather than
       holding any of them as a number here. In the other direction it is carved
       to the box exactly: the highest point of the model is the height the form
       states, because that height is the height of the animal and the water's
       hold is asked of it twice over -- `floatLevel` for the body worn from this
       fruit and `MODEL_H` for the animal itself, and a body that hangs one
       number in the water and stands another on the sand is two animals.
       Two things about this body are stated by the absence of a field, not the
       presence of one. There is no `hop` anywhere in its record. Worn as a form
       that is the whole of its climbing: a body with no launch has no reach, its
       `hopReach` answers 0, and every riser in this valley is a wall to it --
       measured in play.js, stopped at a face with its nose on it and never once
       lifted in front of it. An animal of this record is a different body: the
       lift a legless animal is given at a step asks which ground it is being
       asked on, so it climbs the sand of the bar its own record names and is
       refused the ground inland it does not (see `dryGroundNamed` in
       src/entities.js and the note over the row in data/creatures.js).
       And its wings are the only pair of limbs the body stands on: the rear
       flippers trail.
       The wings are not legs. They are paddles with no elbow, and they work in
       phase with each other (`syncPair`) rather than half a stride apart, which
       is what a turtle does on sand and in water both: it pushes with both sides
       at once. The blade sticks out to the side and its chord runs fore and aft:
       the turn that raises it is about the body's own front-to-back axis and the
       turn that feathers it is about the body's sideways axis -- two axes, not
       one, and the water's stroke already knows both. In the water the cycle is
       FLAP below -- the raised wing feathers its leading edge forward, the driven
       one back, and the body surges on the down-stroke; see the comment over
       that table. */
    turtle: {
      eye: 0.37,
      parts: [
        { name: 'body', anim: 'bob', swimFlap: 1, boxes: [
          /* the carapace, two steps and a pale row of plates along the top: the
             dome of a turtle's shell is the one thing about its silhouette that
             says turtle, and one box cannot be a dome -- the second step stands
             inboard of the first and above it, and the plates sit on top of the
             crown rather than inside it. What the dome is allowed to be is the
             animal's: the rise of it is a quarter of the shell's own length, the
             same proportion a real carapace has, and not the half that turns a
             tortoise's high dome into a bowl tipped up on the sand. This animal
             swims through water and under it; its shell is a foil. */
          [-1.8, 0.3, -2.2, 3.6, 0.65, 3.6, '#3f4a33'],
          [-1.4, 0.95, -1.7, 2.8, 0.4, 2.9, '#4a5739'],
          [-0.9, 1.35, -1.4, 1.8, 0.12, 0.8, '#77855c'],
          [-0.9, 1.35, -0.4, 1.8, 0.12, 0.8, '#7d8b61'],
          [-0.9, 1.35, 0.6, 1.8, 0.12, 0.7, '#77855c'],
          /* the rim of the shell: the marginals. They stand outside both plates
             they sit between, which is what makes the edge of a shell read as an
             edge and not as the side of a brick */
          [-1.95, 0.25, -1.6, 0.2, 0.62, 2.8, '#2f3a26'],
          [1.75, 0.25, -1.6, 0.2, 0.62, 2.8, '#2f3a26'],
          [-1.5, 0.25, -2.35, 3.0, 0.55, 0.25, '#2f3a26'],
          /* the plastron, pale, under the shell and short of it fore and aft --
             a turtle's belly is shielded, not a continuation of its back. It is
             carved down at the model's own ground line because this body drags
             it: on sand a sea turtle does not stand its trunk off the ground on
             its flippers the way a tortoise does, it hauls the shell along with
             the flippers, and the row says the same thing in its own units by
             giving the body no launch at all and a land speed under the frog's. */
          [-1.45, 0.0, -1.8, 2.9, 0.35, 3.2, '#b3ad8c']
        ] },
        { name: 'head', parent: 'body', pivot: [0, 1.1, 1.4], anim: 'nod', boxes: [
          [-0.55, 0.85, 1.2, 1.1, 0.7, 0.5, '#4b5540'],           // the neck
          [-0.8, 0.95, 1.6, 1.6, 0.85, 1.2, '#5b6544'],           // the skull
          [-0.45, 1.0, 2.8, 0.9, 0.45, 0.4, '#c8c39a'],           // the beak, horn
          [-0.85, 1.3, 2.3, 0.3, 0.4, 0.3, '#1c1a12'],            // eyes, on the sides
          [0.55, 1.3, 2.3, 0.3, 0.4, 0.3, '#1c1a12']
        ] },
        /* the front wings: a root and a plate. The root is the thick end of the
           flipper, the column of it that meets the shoulder at the top of the
           shell's front corner, and that is where the pivot is. The blade is the
           flat end: thin through, and wide along its chord and outboard -- the
           one pair of dimensions a wing is, and the reason it pushes against the
           water instead of shoving it aside. The blade lies along the ground
           rather than reaching down to it, because the body it belongs to is
           lying there too; and its lowest face is carved on the model's ground
           line, so the walk cycle's lift (models.js, FOOT) is what keeps it out
           of the sand and nothing else.
           So the turn that raises it is a turn about the body's own front-to-back
           axis and the turn that feathers it is a turn about the body's sideways
           axis -- the same two axes the water's stroke already knows how to split,
           and no new joint. The `heldPose` is the swept pose the model is
           authored in, and it is what a stroke starts and ends from. */
        { name: 'wingL', parent: 'body', pivot: [-1.7, 0.95, 0.9], anim: 'walk', sign: 1,
          stride: 1, stands: 1, syncPair: 1, swimFlap: 1,
          air: [0, 0, 0.22], crouch: [0.18, 0, -0.1], heldPose: [0.12, 0, -0.1], boxes: [
            [-2.05, 0.14, 0.4, 0.95, 0.82, 0.95, '#33402c'],      // the root, into the shell's corner
            [-3.11, 0.0, -0.7, 1.45, 0.18, 1.2, '#33402c'],       // the blade: a plate, thin through
            [-3.11, 0.0, 0.5, 1.4, 0.18, 0.22, '#8e9a72'],        // its leading edge, pale, and proud of the plate
            [-3.05, 0.18, 0.35, 0.9, 0.12, 0.3, '#6a7a52'],       // the ridge along that edge
            [-3.25, 0.0, -0.7, 0.14, 0.18, 1.35, '#2c3726']       // its outer corner, the widest corner the model has
          ] },
        { name: 'wingR', parent: 'body', pivot: [1.7, 0.95, 0.9], anim: 'walk', sign: -1,
          stride: 1, stands: 1, syncPair: 1, swimFlap: 1,
          air: [0, 0, -0.22], crouch: [0.18, 0, 0.1], heldPose: [0.12, 0, 0.1], boxes: [
            [1.1, 0.14, 0.4, 0.95, 0.82, 0.95, '#33402c'],
            [1.66, 0.0, -0.7, 1.45, 0.18, 1.2, '#33402c'],
            [1.71, 0.0, 0.5, 1.4, 0.18, 0.22, '#8e9a72'],
            [2.15, 0.18, 0.35, 0.9, 0.12, 0.3, '#6a7a52'],
            [3.11, 0.0, -0.7, 0.14, 0.18, 1.35, '#2c3726']
          ] },
        /* the rear flippers: they trail. They swing a little as the body moves
           (a small share of the walk cycle) and they hold the swept pose the
           water puts them in, and they carry nothing -- no `stands`, and no
           stroke of their own. A turtle steers with them; it does not stand on
           them. They are plates for the same reason the front ones are, and they
           are tucked under the shell's rear rim, which is where a turtle keeps
           them. */
        { name: 'rearL', parent: 'body', pivot: [-1.25, 0.5, -1.4], anim: 'walk', sign: 1,
          stride: 0.25, swimPose: [0, 0, -0.14], boxes: [
            [-2.4, 0.04, -2.2, 0.9, 0.14, 1.0, '#3a4630']
          ] },
        { name: 'rearR', parent: 'body', pivot: [1.25, 0.5, -1.4], anim: 'walk', sign: -1,
          stride: 0.25, swimPose: [0, 0, 0.14], boxes: [
            [1.5, 0.04, -2.2, 0.9, 0.14, 1.0, '#3a4630']
          ] }
      ]
    },
  };


  /* How tall each model is, in its own units: the top of the highest box it is
     carved from. Whatever asks "how far off the ground is this body" wants a
     body-relative answer -- a body a third of its own height in the air is a
     body that has left the ground, whether it is a man or a frog -- and this
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
     of them claims is this rectangle turned by its heading -- a person's body
     is 0.29 m long and 0.41 m across, a frog's 0.41 long by 0.34 across, and
     the asymmetry runs the other way for each: one is wider than it is long,
     the other longer than it is wide, so the space is carried as a rectangle
     and not a radius. */
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
     lifting. Read off the draw: a body walking on flat ground had its hind foot
     0.09 m inside the ground in a third of the frames, a person its boot 0.03 m
     in a sixth.
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
     it: 0.17 of a body's own units, 4 cm into the floor, twice a second, on
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
  /* The crease where one part of a model meets another.
     A model is boxes that touch, and until now every part was built with
     `ao = 1`: each of its faces carried one flat face constant and nothing
     else. Measured over the pixels of one frog seen from 0.7 m, 93.2% of the
     neighbouring pixel pairs inside the animal were the same colour, and a leg
     meeting the body was a notch in the outline and nothing more -- the frog's
     leg and body are the same green to start with. A creature is read by its
     joints, so the joints have to be lit.
     The voxel world already does this for terrain (see AO_L in world.js): a
     corner of a face is darkened by the blocks beside it. The same question is
     asked here of the model's own boxes, continuously -- there is no grid to
     look up. For one corner of one face: is there another box with volume
     beyond the plane of this face that reaches past the corner along one axis
     of the face while covering the corner along the other (side 1), the same
     along the other axis (side 2), and reaches past along both (corner)? Each
     of the three is taken from the nearest such box, graded by how far it is:
     a box touching the corner counts for everything, one a model-box away
     counts for nothing. Then the same clamp the terrain uses: with occlusion on
     both sides the corner one is not counted too.
     A box flush with the face has no volume beyond its plane, so it gets no
     say: that is what keeps a body built out of coplanar boxes -- the frog's
     four back plates, the person's chest and shoulder line -- from growing a
     dark grid across itself. It is also what makes the answer read as a joint
     and not as dirt: only an inset or an overhang closes a corner.
     The depth is capped well short of the terrain's, because the reason a face
     is dark in the voxel world -- it is in a crevice, under something, and sees
     no sky -- is not true of a knee. */
  const CREASE_DEPTH = 0.35;     // how far a closed corner goes, of the face shade
  const CREASE_REACH = 0.25;     // in shares of the model's own typical box
  const EPS = 1e-4;              // model units: a hairline is not a joint
  /* The six faces of a box in the order and the corner order MeshBuilder.box()
     uses them, so a crease value lands on the corner it was measured at:
     [axis, which end of it, the four corners as [ix,iy,iz] 0/1 multipliers].
     box() brings its own face constants; only the order is shared. */
  const BOX_FACE = [
    [1, 1, [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]]],
    [1, -1, [[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]]],
    [0, 1, [[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]]],
    [0, -1, [[0, 0, 1], [0, 0, 0], [0, 1, 0], [0, 1, 1]]],
    [2, 1, [[1, 0, 1], [0, 0, 1], [0, 1, 1], [1, 1, 1]]],
    [2, -1, [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]]]
  ];
  function boxAO(b, others, R) {
    const out = new Array(24).fill(1);
    const lo = (x, i) => x[i], hi = (x, i) => x[i] + x[3 + i];
    for (let fi = 0; fi < 6; fi++) {
      const ax = BOX_FACE[fi][0], end = BOX_FACE[fi][1];
      const a1 = ax === 0 ? 1 : 0, a2 = ax === 2 ? 1 : 2;
      const plane = end > 0 ? hi(b, ax) : lo(b, ax);
      for (let k = 0; k < 4; k++) {
        const m = BOX_FACE[fi][2][k];
        const c = [0, 0, 0];
        c[ax] = plane;
        for (const a of [a1, a2]) c[a] = m[a] ? hi(b, a) : lo(b, a);
        const s1 = m[a1] ? 1 : -1, s2 = m[a2] ? 1 : -1;
        let o1 = 0, o2 = 0, oc = 0;
        for (const q of others) {
          if (q === b) continue;
          /* volume beyond the plane of this face; a box flush with it has none */
          if ((end > 0 ? hi(q, ax) - plane : plane - lo(q, ax)) <= EPS) continue;
          const r1 = s1 > 0 ? hi(q, a1) - c[a1] : c[a1] - lo(q, a1);
          const r2 = s2 > 0 ? hi(q, a2) - c[a2] : c[a2] - lo(q, a2);
          const span1 = lo(q, a1) < c[a1] - EPS && hi(q, a1) > c[a1] + EPS;
          const span2 = lo(q, a2) < c[a2] - EPS && hi(q, a2) > c[a2] + EPS;
          const dx = Math.max(lo(q, 0) - c[0], 0, c[0] - hi(q, 0));
          const dy = Math.max(lo(q, 1) - c[1], 0, c[1] - hi(q, 1));
          const dz = Math.max(lo(q, 2) - c[2], 0, c[2] - hi(q, 2));
          const w = 1 - Math.min(1, Math.hypot(dx, dy, dz) / R);
          if (w <= 0) continue;
          if (r1 > EPS && span2) o1 = Math.max(o1, w);
          if (r2 > EPS && span1) o2 = Math.max(o2, w);
          if (r1 > EPS && r2 > EPS) oc = Math.max(oc, w);
        }
        if (o1 > 0.5 && o2 > 0.5) oc = 0;
        out[fi * 4 + k] = 1 - ((o1 + o2 + oc) / 3) * CREASE_DEPTH;
      }
    }
    return out;
  }
  function modelCreases(model) {
    const all = [];
    for (const p of model.parts) if (!p.emis) for (const b of (p.boxes || [])) all.push(b);
    const mid = all.map(b => (b[3] + b[4] + b[5]) / 3).sort((a, b) => a - b);
    const R = CREASE_REACH * (mid[mid.length >> 1] || 1);
    for (const p of model.parts) {
      if (p.emis || !p.boxes) continue;
      p.boxAO = p.boxes.map(b => boxAO(b, all, R));
    }
  }
  for (const k in MODELS) modelCreases(MODELS[k]);

  function buildModelMeshes(gl, model) {
    const out = [];
    for (const part of model.parts) {
      const mb = new N.MeshBuilder();
      const ao = part.boxAO || [];
      for (let i = 0; i < part.boxes.length; i++) {
        const b = part.boxes[i];
        mb.box(b[0], b[1], b[2], b[3], b[4], b[5], typeof b[6] === 'string' ? hex(b[6]) : b[6], !!part.emis, ao[i] || 1);
      }
      out.push({ part, mesh: mb.upload(gl), pivot: part.pivot || [0, 0, 0] });
    }
    return out;
  }
  /* ---------------- part animation ---------------- */
  const _m = { a: N.M4.create(), b: N.M4.create(), c: N.M4.create(), d: N.M4.create(), e: N.M4.create(), f: N.M4.create() };
  const WALK_STRIDE = 0.9;  // how far a walking leg reaches at the hip, at a full stride
  const STANCE_WALK = 0.62;  // the share of a stride a foot is on the ground, at a walk
  const STANCE_RUN = 0.30;   // ... and at the speed the body's own record names: it flies between steps
  const SWIM_RATE = 4.2;  // the stroke's own clock, in rad/s: one stroke every 1.5 s
  /* How much of the stroke a body the water holds up does when it is going
     nowhere: the tread. A body at rest in the water is not kicking at the lake,
     but the water is holding it up and something has to do the work, so the
     legs do the same stroke shrunken to the effort of holding still -- the floor
     the stroke's amplitude used to be missing. The floor sits under the stroke,
     not under the speed: as the body goes somewhere the stroke it is pushing
     water with takes over and the floor falls away. */
  const TREAD = 0.18;
  /* The clock of the tread's own swing, in rad/s: one slow pump every 3 s. A
     body at rest in the water does not run the stroke's own clock -- that clock
     carries a hold, the last 44 % of the cycle the legs shut behind the body
     and do nothing, and a leg that holds is a leg that has stopped: from the
     bank a body at rest read as one that reached back, froze, sat still, and
     started again, twice a stroke. It runs this slower clock instead, and it
     runs the same table on it with the hold taken out, so the legs pump through
     the gather and the drive continuously and never once come to rest. */
  const TREAD_RATE = 2.1;
  /* How much harder the leg on the outside of a turn strokes than the leg on the
     inside, and the turn rate at which that difference is complete: a body
     turning at TURN_FULL or faster kicks with one leg, a body going straight
     kicks with both equally. 0.9 rad/s is the tightest arc a body with a kick
     holds -- the frog's own `turn` in data/creatures.js, and the rate a swimming
     body is measured holding when asked to carve as hard as it can. The record
     held 1.9 for a while, and it was lowered with the record: a frog's errands
     lie somewhere off its nose, and a correction wider than half a turn at 1.9
     is a head swung at 109 degrees a second, which from the bank reads as a
     frog whose head goes where its body is not. Small corrections run against
     the 2.2 x how-far-off-course cap before the limit is ever reached, so they
     are the same at 0.9 as at 1.9; only the wide ones glide where they used to
     whip. See the `turn` term in the swimKick branch of partAngles. */
  const TURN_KICK = 0.7;
  const TURN_FULL = 0.9;  // rad/s of heading
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
     centre line behind the body; and the body rides the drift that is left.
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
  /* A sea turtle does not breaststroke. It flies, and what it flies with is two
     wings that are one pair: both go down together, both come up together, and
     the animal's whole forward motion comes from the down-stroke. Read the same
     six columns as STROKE -- the pitch, nothing at the knee (a flipper has no
     elbow), the turn out, nothing at the second joint, and the body riding it --
     and read them as one cycle of a wing instead of one cycle of a leg.
     The pitch and the turn out are the two things a wing has, and they are two
     different axes, which is worth saying because the model's own geometry makes
     it easy to think they are one. The blade sticks out to the side and its
     chord runs fore and aft: raising it is a turn about the body's own
     front-to-back axis (`rz`, the third column), and feathering it -- leading
     edge down on the stroke, up on the recovery, so the wing goes back through
     the water edge-first -- is a turn about the body's sideways axis (`rx`, the
     first column). Nothing had to be added to the matrix code to make a wing
     work; only this table and the flag that says which parts run it.
     The rows are a wing going up, driving down under the body, and levelling out
     on its way back up. The positive direction of the third column is **down**
     for both wings: the code mirrors the turn with each part's own `sign`, which
     is what keeps a pair of wings a pair, and the same mirror applied to the
     timing (the half stride the legs keep) would have one wing up while the
     other was down -- a turtle rowing, not flying. The first column is NOT
     mirrored, and that is also right: both blades point their chords the same
     way as the body moves through the water, so both want the same angle of
     attack, and mirroring the number would feather one wing and de-feather the
     other.
     The feather is small on purpose. The blade hangs below and behind its
     shoulder, so a turn about the sideways axis moves its tip mostly fore and
     aft, and the wider that turn is the more of the tip's travel is fore and aft
     rather than up and down -- a big feather spends the stroke cancelling the
     lift it is trying to make. That was measured while the table was being
     tuned, on versions of it that are not in this file, and it is why the number
     is small. At +/-0.15 the edge still reverses between the recovery and the
     drive -- it is a feather, a small one -- and the elevation is what carries
     the body.
     What the table as it stands draws, measured off the matrices the draw
     uploads at the row's own 0.25 scale (play.js
     `theSeaTurtleStrokesBothWingsTogether`, which takes them the way the render
     takes them -- one state per frame, both wings asked through that same
     state): each wingtip goes 0.478 m up and down against 0.134 m fore and aft,
     the blade swings from 5 deg below horizontal to 82 deg below -- 77 deg of
     arc -- and carries about 3.8 m of water a second at 2.38 strokes a second (the
centimetre of that moves with the phase the draw happens to be at). Both
     wings reach the top of their arc on the same frame and carry the same
     distance of water doing it, and a body in the water that is not stroking has
     wings that do not move at all. A body that is turning puts one wing through
     5.7 m of water a second and the other through 2.0, and the two swap when the
     turn is swapped. The checks are on the ratio, the arc and the pair, not on
     the third decimal: where the sampling window starts depends on the phase the
     draw happens to be at.
     `FLAP_RATE` is the wing's own clock: 15 rad/s is 0.419 s a cycle, and the
     sweep measured above is 2.38 strokes a second. At the 6.4 m/s the record
     states that is 2.68 m of water to a stroke, and at the 6.07 the valley's
     body was actually measured holding, 2.54 m -- about two body lengths, the
     share a turtle holds at a burst. The cycle's shape, not its rate, is what
     the row above is for. */
  const FLAP = [
    [0.00, -0.15, 0, -0.85, 0, -0.05],   // at the top: wings up and out, leading edge forward, the body settling
    [0.45,  0.15, 0,  0.64, 0,  0.07],   // driven: down and back under the body, edge bit into the water, the body surges
    [0.72,  0.03, 0,  0.06, 0,  0.02],   // levelling: the edge slips back flat as the wing comes through
    [1.00, -0.15, 0, -0.85, 0, -0.05]    // and up again
  ];
  const FLAP_RATE = 15.0;   // rad/s: 2.4 strokes a second
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
     person's foot was moving along the ground at 3.0 m/s while its body went past
     at 4.1: a foot was on the ground for four frames in five and held still in
     none of them, and the whole animal was skating on grass. It is not a tuning problem. The foot is at the bottom of
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
     at their own cruising speed -- which is what `move` of 1 means now, the
     record's own number and not a borrowed top -- takes 1.97 m steps at 2.38 a
     second, and at 2 m/s takes steps of 0.85 m at the same rate. A body with
     short legs steps fast and a body with long legs steps
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
     of a step: a person walking at 1 m/s takes steps of 0.43 m at 2.3 a
     second and at their own cruising speed of 4.7 m/s takes steps of 1.97 m at
     2.4 a second. Read the same way, the reach of the foot under the body -- which is
     what a stance is worth along the ground -- goes 0.24 m, 0.41 m, 0.59 m at
     1, 2 and 4.7 m/s: it grows slower than the speed does, and the whole of the
     rest is bought by the stance taking a smaller share of the cycle.
     So the swing is made proportional to speed *times the stance*, and the two
     cancel in the one place they have to: a stride comes out proportional to the
     speed, and the rate of the steps comes out a property of the leg alone.
     `move` is therefore the fraction of the speed the body's own record names,
     and it stops there. A body with a sprint -- the body you start in has one,
     and no animal in this valley does -- runs the same 1.97 m steps 45% quicker
     rather than
     longer ones: 3.45 a second at 6.8 m/s. That is the honest end of the blend,
     not a dodge: a stance is interpolated between a walk's 0.62 and a run's
     0.30, and past one the next step down would be a body off the ground two
     cycles in three, which no leg in these models is built to hold. A real
     sprint does lengthen its stride, and the day a body in the valley sprints
     long enough for that to show is the day a third point goes into the blend
     and a deeper stance goes with it. */
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
     muzzle and a toe both say so. */
  function hipAt(A, u, stance) { return -Math.asin(Math.sin(A) * footAt(u, stance)); }
  /* Which way round the body rides its own stride, and the one place a walk and
     a run are not the same gesture.
     While some foot is always on the ground the legs are struts, and a body on
     struts is at its highest over the middle of a stance, where the strut is
     straight and under it, and at its lowest where it trades one strut for the
     other. Once a stance is less than half a cycle there is a moment in every
     stride with no foot down at all: the body is airborne, and the leg is a
     spring instead of a strut -- it comes down onto a foot, bends it, and is
     thrown back off it, so it is at its LOWEST over the middle of a stance and
     at its highest in the middle of the airborne phase. The same cosine the
     other way round.
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
     model, through the matrices the draw uploads. A body with no leg that
     walks -- a frog hops -- reaches nowhere, and 0 is how the caller learns
     not to run a cycle at all. */
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
  function strokeAt(u, table) {
    const k = table || STROKE;
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
     st: { t, gait, phase, move, air, off, crouch, swim } -- `air` is whether
     the body is off the ground, `off` how far above it in body heights, `crouch`
     how loaded its legs are, `swim` that the body is moving through water with
     the bodies built for it. All of them are read off
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
       whole animal against the others of its kind.
       A pair of wings is the exception and says so with `syncPair`: a turtle's
       two front flippers push at the same moment, on sand and in water both.
       Half a stride between them is a body that rows, and a rowing turtle is not
       a turtle. */
    const u = (st.gait || 0) + ph / (Math.PI * 2) + (sg < 0 && !p.syncPair ? 0.5 : 0);
    const stance = stanceOf(st.move);
    let rx = 0, ry = 0, rz = 0, dy = 0, sc = 1;
    /* the share of this part's turn that comes from the land gait, kept apart
       from the pose blends below: the lift that goes with a swing belongs to the
       swing alone (see the FOOT block above the models) */
    let gait = 0;
    if (anim === 'walk') {
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
    } else if (anim === 'bob') {
      /* On the ground the heave is the stride: the body is at its highest over
         the middle of a stance, where the leg under it is straight and holding
         it up, and at its lowest at the ends of one, where the leg is angled
         away and the other is coming through under it -- twice a stride, because
         the body stands now on one leg and now on the other. On the clock it was
         a sine of its own that had nothing to do with the feet. The idle part stays on the clock,
         because a body standing still still breathes; and a body with no leg
         that walks has no stride to ride either, so it keeps the sine whole.
         `rideOf` turns the same cosine over once the stride grows an airborne
         phase (see above), and a body that has never had a part carrying the
         heave
         gets one now: the person's own body had no `bob` part at all, so the
         one body in the valley you look at for an hour was the one body that
         slid along grass at a height nothing ever changed. */
      dy = (st.gait === undefined || st.gait === null
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
       beside the hips, then driven back and inwards together, and the body
       rides the drift that is left.
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
      /* how much of the stroke the body is doing: all of it at the speed its own
         record swims at, and at a standstill the share a body needs to hold
         itself up -- the tread. A stroke is the thing that pushes water behind
         a body, so it is sized by the water the body is actually pushing: a body
         coasting to a stop strokes less and less as it coasts, and the floor the
         stroke sits on is the work of staying still, not of going. The old floor
         of 0.55 of the stroke under everything got that backwards: it was the
         work of going charged at a body that was going nowhere, and read off the
         matrices the draw uploads a frog floating with its speed at nothing still
         walked its feet 1.55 m through 4 s of water -- a body pushing water in no
         direction at all, which is the one thing every animal on that lake does
         not do. A body that is simply sitting in the water -- the player holding
         no key, a frog hovering -- is not kicking at the lake, but it is not a
         statue either: the water is holding it up and something has to do the
         work. The floor sits under the stroke, not under the speed: as the body
         goes somewhere the stroke it is pushing water with takes over and the
         floor falls away. The hold ramps the whole thing in, so a body sinking
         towards the lakebed stops stroking over a few frames instead of at one
         instant. */
      const s1 = Math.min(1, swim);
      /* A wing is not a leg in the water. A frog's legs at rest are still doing
         the work of holding a body up, and TREAD is that work; a turtle at rest
         is gliding, and its wings do nothing at all until it means to move. So
         the wing's amplitude is the water it is actually pushing, with no floor
         under it -- and the floor stays exactly where it was for the bodies that
         have legs, because it is a fact about holding still, not about swimming. */
      const wings = !!p.swimFlap;
      const amp = wings ? s1 : Math.min(1, held * 3) * Math.max(s1, TREAD * (1 - s1));
      /* and the stroke itself this frame, read off the table. Going somewhere
         it is the full STROKE on its own clock. At a standstill it is not a
         stroke at all: a stroke carries a hold, the last 44 % of the cycle the
         legs shut behind the body and do nothing, and a body that is treading to
         stay afloat does not stop its legs -- the water is holding it up the
         whole time, so something has to keep doing the work the whole time, and
         a leg that reached back, froze, sat still, and started again is a leg
         that is not treading. At rest the body therefore runs the same table on
         the slower TREAD clock with the hold taken out: a continuous pump
         between the gather, where the feet are drawn up beside the hips, and the
         drive, where they shoot back, one slow pump every 3 s. The two are
         traded for each other over the first third of the way to the body's own
         speed, so the legs never stop and start again as the body gets up to
         speed -- they just get faster. */
      const hand = Math.min(1, s1 / 0.35);
      const aN = strokeAt((t * (wings ? FLAP_RATE : SWIM_RATE) + ph) / (Math.PI * 2),
        wings ? FLAP : STROKE);
      const a = wings || hand >= 1 ? aN : (function () {
        const uT = 0.49 + 0.07 * Math.sin(t * TREAD_RATE + ph);
        const aT = strokeAt(uT);
        const out = new Array(5);
        for (let i = 0; i < 5; i++) out[i] = aT[i] + (aN[i] - aT[i]) * hand;
        return out;
      })();
      if (wings) {
        /* Both wings, one cycle, no half-stride between them: the timing mirror
           the legs use is dropped here the same way the stroke drops it for a
           breaststroke pair, and the space mirror is kept -- `sg` is what makes a
           turn put the outside wing into the water harder than the inside one,
           and it is also what makes the same number take both wings down.
           The whole turn is hung on the roll. A leg hanging under a body has to
           split its sideways swing between a yaw and a roll because the leg
           itself is pointed at the floor; a paddle held out to the side is
           already at right angles to the body's front-to-back axis, so the roll
           does all of it and the pitch that goes with it is the feather. The
           pose the water holds the wing in (`heldPose`) is where a stroke starts
           and ends, exactly as it is for a leg. */
        if (anim === 'bob') {
          dy = a[4] * amp;              // the body surges on the down-stroke, settles on the recovery
        } else {
          const tn = Math.max(-1, Math.min(1, turn / TURN_FULL)) * sg;
          const hp = p.heldPose || [0, 0, 0];
          rx = hp[0] * held + a[0] * amp * (1 + TURN_KICK * TURN_FOLD * tn);
          const out = a[2];
          rz = hp[2] * held + sg * out * amp * (1 + TURN_KICK * tn);
          gait = 0;
        }
      } else if (p.swimKick) {
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
  /* the water's own cycle, and its clock: `partAngles` reads these straight from
     the module, so anything that wants to ask a question about the shape of a
     stroke -- or answer one by changing it -- has to be able to reach them.
     play.js reads the arc off the matrices and reads this table to know what it
     was looking at; nothing there holds a copy of the numbers. */
  N.FLAP = FLAP;
  N.FLAP_RATE = FLAP_RATE;
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
