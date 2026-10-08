#!/usr/bin/env bash
# Message filter used by tools/english-commits.sh.
# $GIT_COMMIT is the ORIGINAL hash of the commit being rewritten.
case "$GIT_COMMIT" in
  031aef8*) cat <<'EOF'
FRUTARIA: design documents + voxel prototype

docs/: nine design documents (worldview, map, characters & creatures,
       fruit & transformation, backpack & storage, quests, tech plan)
game/: WebGL1 voxel engine, 160x48x160 world, 15 fruits / 14 forms / 14 creatures
       backpack slots scale with rarity; main cellar + cellar trees
EOF
    ;;
  5b74299*) cat <<'EOF'
Rarity-scaled fruit regrowth, cellar-tree raids, probe.js fixes

- RARITY.regrow: 1/1.5/2/2.5/3 in-game days (+/-20%), queue persisted in save
- Game.dailyRolls(): 30% per game day, steals 1-3 items; a player within 45 m
  always drives it off. The main cellar (guarded by Old Mei) is exempt.
- probe.js: resolve zone centres by kind (rect/circle/sky/border) and fix
  open-water detection
EOF
    ;;
  2386129*) cat <<'EOF'
Implement owl post (docs/05 section 5.2)

- Game.postItem/updatePosts: cellar tree -> main cellar, 1 fruit per send,
  3 in-game days, 10% lost, decaying at x0.1 in transit
- Unlocked by storing an owlberry in the main cellar; the main cellar itself
  cannot post. Max 3 in flight; if the cellar is full on arrival the owl
  carries the fruit back instead of dropping it.
- Storage panel shows the in-transit row and the P hint; up/down arrows
  select storage items
EOF
    ;;
  b586ff4*) cat <<'EOF'
Docs-data consistency checker; make the test suite scriptable

- game/test/docs-sync.js parses the tables in docs/02 (zones, POIs, isles),
  docs/04 (rarity) and docs/05 (storage, cellar rules) and diffs them against
  game/data/; exits 1 on drift. Verified by injecting drift (slots 12->11,
  cellar 96->90), both caught.
- Fix the docs/05 planting key (R -> F; R is now "end transformation")
- Browser tests now set process.exitCode on error; add game/test/all.sh
EOF
    ;;
  *) cat ;;   # already English - leave as-is
esac
