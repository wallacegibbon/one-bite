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
   docs make that the renderer or the rules do not keep -- see TODO D1 / F1. */
const NOT_YET_IMPLEMENTED = {
  'form': {
    glide: 'no air-drag or glide-distance code; owlberry 0.35 is inert',
    nightVision: 'the renderer has no per-form brightness; owl 0.75 / frog 0.3 inert',
    poisonImmune: 'nothing in the world poisons you yet, so jellybloom cannot prove it',
    tongue: 'harvest reach is a fixed distance; frogpear 4 is inert',
    coldImmune: 'the Ashscale cold band does no damage yet, so there is nothing to be immune to'
  }
};

const groups = {
  fruit: [...new Set(N.FRUITS.flatMap(f => Object.keys(f)))],
  form: [...new Set(N.FRUITS.flatMap(f => Object.keys(f.form)))],
  creature: [...new Set(N.CREATURES.flatMap(c => Object.keys(c)))],
  plant: [...new Set(N.PLANTS.flatMap(p => Object.keys(p)))]
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

if (bad) { console.log(`\n✘ ${bad} field problem(s)`); process.exit(1); }
console.log('\n✔ every declared field is either read by game/src or listed as not implemented');
