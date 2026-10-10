/* ==========================================================================
 * Field reachability.
 *
 * docs-sync.js proves the docs agree with the DATA. It proves nothing about
 * whether the CODE reads that data -- a field can sit in fruits.js, be quoted
 * in the docs, be counted by the drift canaries, and do absolutely nothing.
 * That is how eleven ability switches survived an entire audit (TODO D1).
 *
 * So: every field on a fruit record, on a fruit's `form` (the ability block)
 * and on a creature record must be read by at least one file in game/src/,
 * or be sitting in NOT_YET_IMPLEMENTED with its reason. The list is printed
 * every run, so the debt is never invisible, and an entry that has quietly
 * become live fails the test -- the list may only shrink by being fixed.
 *
 * Matching is on a PROPERTY ACCESS (`.field` or `[field]`) or on the field
 * being named to the i18n layer (`I18N.field(o, 'lore')` reads `lore` and
 * `loreEn`), never on a bare word: models.js has a body part called `web` and
 * says "digging claws", and a word count reports both as implemented.
 *
 * Known weakness, stated rather than hidden: the question asked is "does any
 * file read `.field`", not "does any file read THIS record's field". A name
 * shared between record types passes on the strength of the other type -- that
 * is how `slots` on a plant looked live while nothing ever read it, because
 * stashes and backpack upgrades have a `slots` that is read. It makes the test
 * unable to report a collision as dead; it never makes it lie about a field
 * that is genuinely unread.
 * ========================================================================== */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* the data files are classic scripts that hang off window.FRUTARIA */
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['fruits', 'creatures', 'world', 'player'])
  vm.runInContext(read(`game/data/${f}.js`), ctx);
const N = ctx.FRUTARIA;

const SRC = fs.readdirSync(path.join(ROOT, 'game', 'src'))
  .filter(f => f.endsWith('.js')).map(f => read(`game/src/${f}`)).join('\n');

/* Fields the prototype declares but does not act on. Each one is a promise the
   docs make that the renderer or the rules do not keep. The list is empty: every
   field on the four forms is read. It refills itself the moment a field is added
   to the data and nothing in game/src reads it, and that failure is the point. */
const NOT_YET_IMPLEMENTED = {};

const groups = {
  fruit: [...new Set(N.FRUITS.flatMap(f => Object.keys(f)))],
  form: [...new Set(N.FRUITS.flatMap(f => Object.keys(f.form)))],
  creature: [...new Set(N.CREATURES.flatMap(c => Object.keys(c)))],
  plant: [...new Set(N.PLANTS.flatMap(p => Object.keys(p)))],
  /* the body you start in is a body record too (data/player.js since the
     scale move), so it is scanned on the same terms as the animals' */
  human: Object.keys(N.HUMAN_FORM)
  /* Zones are deliberately NOT scanned. Every zone carries a `desc`, and the
     i18n rule above would score it as read because `descOf` exists and plants
     use it -- but no zone text is ever rendered anywhere. A check that passes
     on a field nothing displays is worse than no check: that gap is tracked as
     TODO D14 instead. */
};

/* Fields the codex reaches through the i18n layer instead of a property
   access: I18N.field(o, 'lore') reads `lore` and, in English, `loreEn`. */
const I18N_BASES = [...SRC.matchAll(/I18N\.field\(\s*[^,]+,\s*'(\w+)'\s*\)/g)].map(m => m[1]);

const read_field = k =>
  new RegExp(`\\.${k}\\b|\\[${k}\\]`).test(SRC) ||
  I18N_BASES.includes(k) ||
  (/En$/.test(k) && I18N_BASES.includes(k.slice(0, -2)));

let bad = 0;
for (const [name, fields] of Object.entries(groups)) {
  const allowed = NOT_YET_IMPLEMENTED[name] || {};
  const dead = fields.filter(k => !read_field(k));
  const stale = Object.keys(allowed).filter(k => read_field(k));

  for (const k of stale) {
    console.log(`STALE ALLOWLIST [${name}] ${k}: the code reads it now -- ` +
      `delete it from NOT_YET_IMPLEMENTED and document it as live`);
    bad++;
  }
  for (const k of dead) {
    if (!allowed[k]) {
      console.log(`UNDOCUMENTED DEAD FIELD [${name}] ${k}: ` +
        `no file in game/src reads it and it is not in NOT_YET_IMPLEMENTED`);
      bad++;
    }
  }
  const n = dead.length;
  console.log(`${n ? 'dead ' : 'live  '} [${name}] ${fields.length - n}/${fields.length} read` +
    (n ? ` -- not yet implemented: ${dead.map(k => `${k} (${allowed[k]})`).join('; ')}` : ''));
}

/* ---- animation names ----
   The same question, asked of the rig instead of the data. A part names an
   animation and `partAngles` implements a fixed list of them. A name that is
   implemented but used by no part is the rot that let `sway` sit in the docs
   table for an entire audit cycle as "kept for the next animal": a row in a
   table of features that no body in the valley performs. So the list may only
   shrink by being deleted, in the code and in docs 07 together. */
{
  const mctx = { console }; mctx.window = mctx;
  vm.createContext(mctx);
  // models.js allocates scratch matrices at load time, so engine.js comes first
  vm.runInContext(read('game/src/engine.js'), mctx);
  vm.runInContext(read('game/src/models.js'), mctx);
  const MODELS = mctx.FRUTARIA.MODELS;
  const used = [...new Set(Object.values(MODELS).flatMap(m => m.parts.map(p => p.anim).filter(Boolean)))];
  const impl = [...new Set([...read('game/src/models.js').matchAll(/anim === '(\w+)'/g)].map(m => m[1]))];
  for (const a of used.filter(a => !impl.includes(a))) {
    console.log(`UNIMPLEMENTED ANIM ${a}: a part asks for it and partAngles() has no branch for it`);
    bad++;
  }
  for (const a of impl.filter(a => !used.includes(a))) {
    console.log(`UNUSED ANIM ${a}: partAngles() implements it, no part in any model asks for it -- ` +
      `delete the branch and the docs 07 row together`);
    bad++;
  }
  console.log(`live  [anim] ${impl.length}/${impl.length} implemented names used by a part (${used.sort().join(' ')})`);
}

/* ---- renderer options ----
   The same question, asked of the renderer. `drawMesh(mesh, model, opts)` reads
   a fixed list of option names, and every one of them is a promise that some
   caller can ask for that behaviour. `discardA` was the proof: it set a uniform
   that made the fragment shader discard the fragment, no caller anywhere passed
   it, and the `discard` line survived in the shader for the whole audit cycle.
   So an option that engine.js reads but no call site passes is dead code, and
   the only honest fix is to delete it from the shader and the setter together.
   The call-site keys are read out of the third argument of each drawMesh call by
   matching parentheses, not by counting `name:` in the corpus: play.js reports
   `fogDen` in a result object, and a bare count calls that a passed option. */
{
  const eng = read('game/src/engine.js');
  /* comments are stripped first: the setter's own note explains which options
     were deleted, and prose naming an option is not a call site passing one */
  const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const readOpts = [...new Set([...code(eng).matchAll(/\bopts\.([A-Za-z_$][\w$]*)/g)].map(m => m[1]))];

  /* the 3rd argument of every drawMesh(...) in game/src, paren-matched */
  const passed = new Set();
  for (const f of fs.readdirSync(path.join(ROOT, 'game', 'src')).filter(f => f.endsWith('.js'))) {
    const s = code(read(`game/src/${f}`));
    for (const m of s.matchAll(/\bdrawMesh\s*\(/g)) {
      let i = m.index + m[0].length, depth = 1, arg = 0, cur = '';
      for (; i < s.length && depth > 0; i++) {
        const ch = s[i];
        if (ch === '(' || ch === '{' || ch === '[') depth++;
        else if (ch === ')' || ch === '}' || ch === ']') { depth--; if (depth === 0) break; }
        if (depth === 1 && ch === ',') { arg++; continue; }
        if (arg === 2) cur += ch;
      }
      for (const k of cur.matchAll(/([A-Za-z_$][\w$]*)\s*:/g)) passed.add(k[1]);
    }
  }
  for (const o of readOpts.filter(o => !passed.has(o))) {
    console.log(`UNUSED RENDERER OPT ${o}: drawMesh reads opts.${o}, no call site passes it -- ` +
      `delete the option, the uniform and the shader branch that uses it`);
    bad++;
  }
  for (const o of passed) if (!readOpts.includes(o)) {
    console.log(`IGNORED RENDERER OPT ${o}: a call site passes it and drawMesh never reads it`);
    bad++;
  }
  console.log(`live  [opt] ${readOpts.length}/${readOpts.length} options passed by a call site (${readOpts.sort().join(' ')})`);
}

/* ---- block fields ----
   And of the block table. A block definition is a row of flags the mesher either
   acts on or does not. `cb` (bottom colour) was the proof: the mesher read
   `bd.cb` and asked for the bottom face's colour, and not one of the 36 block
   definitions declared it, so the branch was pure noise. Both directions are
   checked: a declared field nothing reads, and a field the mesher reads that no
   definition ever declares. */
{
  const wsrc = read('game/src/world.js');
  const declared = new Set();
  for (const m of wsrc.matchAll(/\bdef\(\s*\d+\s*,\s*\{/g)) {
    let i = m.index + m[0].length - 1, depth = 0, cur = '';
    for (; i < wsrc.length; i++) {
      const ch = wsrc[i];
      if (ch === '{') { depth++; if (depth === 1) continue; }
      else if (ch === '}') { depth--; if (depth === 0) break; }
      if (depth >= 1) cur += ch;
    }
    for (const k of cur.matchAll(/([A-Za-z_$][\w$]*)\s*:/g)) declared.add(k[1]);
  }
  const bReads = new Set([...wsrc.matchAll(/\b(?:bd|nbd)\.([A-Za-z_$][\w$]*)/g)].map(m => m[1]));

  const deadDecl = [...declared].filter(k => !read_field(k));
  const deadRead = [...bReads].filter(k => !declared.has(k));
  for (const k of deadDecl) {
    console.log(`DEAD BLOCK FIELD ${k}: a block definition declares it, no file in game/src reads it`);
    bad++;
  }
  for (const k of deadRead) {
    console.log(`PHANTOM BLOCK FIELD ${k}: world.js reads it off a block definition, ` +
      `and no def() in the block table declares it`);
    bad++;
  }
  console.log(`live  [block] ${declared.size}/${declared.size} declared fields read, ` +
    `${bReads.size}/${bReads.size} fields world.js reads are declared`);
}

if (bad) { console.log(`\n✘ ${bad} field problem(s)`); process.exit(1); }
console.log('\n✔ every declared field is either read by game/src or listed as not implemented');
