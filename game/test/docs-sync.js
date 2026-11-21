/* ==========================================================================
 *  docs-sync.js -- checks that the numbers in docs/ match game/data/
 *  The README claims data/ is the single source of truth; this script makes that claim executable.
 *  The setting documents keep one language: the single English set that sits
 *  flat in docs/ as the eight numbered chapters; the index lives in the root
 *  README.md and README.zh.md. The game's own strings stay bilingual in
 *  game/data/ (07 s3.5) -- this checks the setting documents.
 *  Usage: node game/test/docs-sync.js
 * ========================================================================== */
const fs = require('fs');
const path = require('path');
global.window = global;
const base = path.join(__dirname, '..');
for (const f of ['data/fruits.js', 'data/creatures.js', 'data/world.js', 'data/player.js', 'data/i18n.js']) require(path.join(base, f));
const N = window.FRUTARIA;

const DOCS = path.join(base, '..', 'docs');
const problems = [];
const ok = [];
const bad = (what, a, b) => problems.push(`${what}: 文档=${JSON.stringify(a)} 数据=${JSON.stringify(b)}`);
const good = s => ok.push(s);

/* ---- markdown table parsing ---- */
function tableAfter(md, heading) {
  const i = md.indexOf(heading);
  if (i < 0) return null;
  const lines = md.slice(i).split('\n');
  const rows = [];
  for (const l of lines) {
    if (!l.trim().startsWith('|')) { if (rows.length) break; continue; }
    if (/^\|\s*[-|:\s]+\|/.test(l.trim())) continue;
    rows.push(l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim()));
  }
  return rows.length > 1 ? rows.slice(1) : [];   // drop the header row
}
const unbacktick = s => s.replace(/`/g, '');
const norm = s => (s || '').replace(/\s+/g, '').replace(/（.*?）/g, '').replace(/[·・]/g, '');
// docs write "30%", data stores 0.30 -- hoisted because LANGS below uses it
function pct(x) { return Math.round(x * 100); }
const num = s => { const m = String(s).match(/-?\d+(\.\d+)?/); return m ? +m[0] : null; };
const cnMatch = (a, b) => { const x = norm(a), y = norm(b); return x === y || x.startsWith(y) || y.startsWith(x); };
/* A POI row prints the name the minimap and the codex show the player, so the
   chapter has to carry the same words rather than a shorter form of them. norm()
   cannot serve here: it throws away everything inside full-width brackets, which
   is exactly where this valley kept a word the world refuses that place, and on
   the Chinese side that made the drift invisible to a checker that was comparing
   names at all. A table cell may drop a leading article -- a cell is not a
   sentence -- and nothing else. */
const cellName = s => String(s || '').replace(/\s+/g, '').toLowerCase().replace(/^the/, '');
const sameName = (doc, data) => cellName(doc) === cellName(data);

/* The deed list lives in game/src/game.js beside the checks that seal it
   (docs/06 s2). A deed carries no text the player reads, so there is nothing
   to read out of that source besides the names -- the chapter's handover
   column is an upgrade, and it is read out of game/data/ instead. */
function deedLines(src) {
  const re = /\{ id: '([a-z]+)',\s*cn: '([^']*)',\s*en: '([^']*)',\s*done: false/g;
  const out = []; let m;
  while ((m = re.exec(src))) out.push({ id: m[1], cn: m[2], en: m[3] });
  return out;
}

/* ------------------------------------------------------------------------
 * The document set. `nameField` is the data field a display name must
 * match, `keyRe` the "press X" phrasing.
 * ------------------------------------------------------------------------ */
const LANGS = [
  {
    tag: 'en',
    dir: DOCS,
    files: { zones: '02-map-and-scenes.md', creatures: '03-characters-and-creatures.md', fruits: '04-fruit-and-transformation.md', storage: '05-backpack-and-storage.md', life: '06-quests-and-progression.md' },
    heads: {
      zones: '## 2. Zone Table',
      poi: '## 3. Points of Interest (POI)',
      creatures: '| id | 中文 | English | Model | scale | Habitat | Activity | Speed | turn | Alert | Herd | Fruit |',
      rarity: '| Rarity | English | Slots | Dormancy | Regrow | Ring |',
      storage: '| Tier | Name | Slots | Decay | Count | Location |',
      life: '| id | Deed | What it hands over | Where the valley sees it |'
    },
    nameField: 'en',
    scaleFile: '00-overview-and-design-pillars.md',
    scaleHead: '## 8. Scale',
    scaleLabels: { world: 'World', zones: 'Zones', fruits: 'Fruits', creatures: 'Creatures', deeds: 'Deeds', day: 'One day' },
    rules: [
      [/\|\s*Cap\s*\|\s*(\d+)\s*trees/, N.STORAGE.treestash.max, 'cellar-tree cap'],
      [/\|\s*Min distance\s*\|\s*(\d+)\s*m/, N.STORAGE.treestash.minDist, 'cellar-tree min distance'],
    ],
    keyRe: /press\s+`?([A-Z])\b/gi,
    nameOf: x => x.en,
    cut: ['mixed form', 'mixed stomach', 'magic stomach', 'beast residue']
  }
];

const readIn = (L, f) => fs.readFileSync(path.join(L.dir, f), 'utf8');

/* The docs write a count as a word sometimes and with a thousands comma other
   times ("three fruits", "1,708 columns"); both spellings have to reach the same
   number, or the checker reports a drift that is only a spelling. Shared by every
   section that reads a claim out of a chapter. */
const WORD = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const read = s => {
  const t = String(s).trim().toLowerCase();
  if (t in WORD) return WORD[t];
  return +t.replace(/[,\s]/g, '');
};

for (const L of LANGS) {
  const T = `[${L.tag}]`;

  /* ================= 1. zone table (02 s2) ================= */
  {
    const rows = tableAfter(readIn(L, L.files.zones), L.heads.zones);
    if (!rows) bad(`${T} 02 zone table`, 'missing', '—');
    else {
      let n = 0;
      for (const r of rows) {
        const id = unbacktick(r[0]);
        const z = N.ZONE_BY_ID[id];
        if (!z) { bad(`${T} 02 zone id`, id, 'not in ZONES'); continue; }
        n++;
        if (!cnMatch(r[1], z[L.nameField])) bad(`${T} 02 ${id} name`, r[1], z[L.nameField]);
        if (num(r[5]) !== z.danger) bad(`${T} 02 ${id} danger`, num(r[5]), z.danger);
        const shape = r[3];
        if (z.kind === 'circle') {
          const rDoc = num(shape);
          if (rDoc !== z.r) bad(`${T} 02 ${id} radius`, rDoc, z.r);
          const m = r[4].match(/\((\d+),\s*(\d+)\)/);
          if (!m || +m[1] !== z.cx || +m[2] !== z.cz) bad(`${T} 02 ${id} centre`, r[4], `(${z.cx},${z.cz})`);
        } else if (z.kind === 'rect') {
          const m = r[4].match(/\((\d+),\s*(\d+)\).*?\((\d+),\s*(\d+)\)/);
          if (!m || +m[1] !== z.x0 || +m[2] !== z.z0 || +m[3] !== z.x1 || +m[4] !== z.z1)
            bad(`${T} 02 ${id} rect`, r[4], `(${z.x0},${z.z0})-(${z.x1},${z.z1})`);
        }
      }
      if (n !== N.ZONES.length) bad(`${T} 02 zone count`, n, N.ZONES.length);
      else good(`${T} zone table: all ${n} rows match`);
    }
  }

  /* ================= 2. POI table (02 s3) ================= */
  {
    const rows = tableAfter(readIn(L, L.files.zones), L.heads.poi);
    if (!rows) bad(`${T} 02 POI table`, 'missing', '—');
    else {
      let n = 0;
      for (const r of rows) {
        const id = unbacktick(r[0]);
        const p = N.POIS.find(x => x.id === id);
        if (!p) { bad(`${T} 02 POI id`, id, 'not found'); continue; }
        n++;
        const m = r[2].match(/\((\d+),\s*(\d+)\)/);
        if (!m || +m[1] !== p.x || +m[2] !== p.z) bad(`${T} 02 POI ${id} coords`, r[2], `(${p.x},${p.z})`);
        if (num(r[3]) !== p.y) bad(`${T} 02 POI ${id} y`, num(r[3]), p.y);
        if (r[4] !== p.icon) bad(`${T} 02 POI ${id} icon`, r[4], p.icon);
        // the name a marker carries is the chapter's claim about that place, and
        // it has to be the name the game shows rather than a summary of it
        if (!sameName(r[1], p[L.nameField])) bad(`${T} 02 POI ${id} name`, r[1], p[L.nameField]);
      }
      if (n !== N.POIS.length) bad(`${T} 02 POI count`, n, N.POIS.length);
      else good(`${T} POI table: all ${n} rows match, display names included`);
    }
  }

  /* ================= 3. creature table (03 s3) =================
     The row that moves every animal in the valley is copied by hand into the
     chapter, and one of its cells had been copied as a different fact: the
     chapter printed 5 where the record says `herd 8`, because by then the column
     had become the number of bodies the valley happens to hold -- which is not on
     any record at all, it is what `spawnCreatures` in src/game.js decides. A
     number copied by hand is exactly the drift this file exists for, so every
     number the row prints is compared with the record it prints it from. */
  {
    const rows = tableAfter(readIn(L, L.files.creatures), L.heads.creatures);
    if (!rows) bad(`${T} 03 creature table`, 'missing', L.heads.creatures);
    else {
      let n = 0;
      for (const r of rows) {
        const id = unbacktick(r[0]);
        const c = N.CREATURE_BY_ID[id];
        if (!c) { bad(`${T} 03 creature id`, id, 'not found'); continue; }
        n++;
        if (unbacktick(r[3]) !== c.model) bad(`${T} 03 ${id} model`, unbacktick(r[3]), c.model);
        if (num(r[4]) !== c.scale) bad(`${T} 03 ${id} scale`, num(r[4]), c.scale);
        /* The motion cell carries the whole of what the record says about moving:
           the speed, and whatever else the record states -- swimming, and the two
           launches of a hop. Asked as an ordered list of the numbers rather than
           as a sentence, so the chapter may phrase the cell as it likes and still
           be wrong the moment one of the numbers is not the record's. */
        const said = (String(r[7]).match(/\d+\.\d+|\d+/g) || []).map(Number);
        const wants = [c.speed];
        if (c.swimSpeed) wants.push(c.swimSpeed);
        if (c.hop) wants.push(c.hop.up, c.hop.max || c.hop.up);
        if (said.join(',') !== wants.join(',')) bad(`${T} 03 ${id} motion`, said.join(','), wants.join(','));
        if (num(r[8]) !== c.turn) bad(`${T} 03 ${id} turn`, num(r[8]), c.turn);
        if (num(r[9]) !== (c.alert || 12)) bad(`${T} 03 ${id} alert`, num(r[9]), c.alert || 12);
        if (num(r[10]) !== (c.herd || 1)) bad(`${T} 03 ${id} herd`, num(r[10]), c.herd || 1);
      }
      if (n !== N.CREATURES.length) bad(`${T} 03 creature rows`, n, N.CREATURES.length);
      else good(`${T} creature table: all ${n} rows are the record (model, scale, motion, turn, alert, herd)`);
    }
  }

  /* ================= 4. rarity table (04 s1) ================= */
  {
    const rows = tableAfter(readIn(L, L.files.fruits), L.heads.rarity);
    if (!rows) bad(`${T} 04 rarity table`, 'missing', '—');
    else {
      let n = 0;
      for (const r of rows) {
        const id = unbacktick(r[0]);
        const R = N.RARITY[id];
        if (!R) { bad(`${T} 04 rarity id`, id, 'not found'); continue; }
        n++;
        if (num(r[2]) !== R.slots) bad(`${T} 04 ${id} slots`, num(r[2]), R.slots);
        if (num(r[3]) !== R.fresh) bad(`${T} 04 ${id} dormancy s`, num(r[3]), R.fresh);
        if (num(r[4]) !== R.regrow) bad(`${T} 04 ${id} regrow days`, num(r[4]), R.regrow);
        const ring = unbacktick(r[5]);
        if (ring !== R.ring) bad(`${T} 04 ${id} ring`, ring, R.ring);
      }
      if (n !== Object.keys(N.RARITY).length) bad(`${T} 04 rarity count`, n, Object.keys(N.RARITY).length);
      else good(`${T} rarity table: all ${n} tiers match (incl. regrow)`);
    }
  }

  /* ================= 5. three-tier storage table (05 s3) ================= */
  {
    const rows = tableAfter(readIn(L, L.files.storage), L.heads.storage);
    const STO = N.STORAGE;
    if (!rows) bad(`${T} 05 storage table`, 'missing', '—');
    else {
      const want = [
        [STO.backpack.slots, STO.backpack.decay],
        [STO.cellar.slots, STO.cellar.decay],
        [STO.treestash.slots, STO.treestash.decay]
      ];
      if (rows.length < 3) bad(`${T} 05 storage rows`, rows.length, 3);
      else rows.slice(0, 3).forEach((r, i) => {
        const slots = num(r[2]), decay = num(r[3]);
        if (slots !== want[i][0]) bad(`${T} 05 tier ${i + 1} slots`, slots, want[i][0]);
        if (decay !== want[i][1]) bad(`${T} 05 tier ${i + 1} decay`, decay, want[i][1]);
      });
      good(`${T} three storage tiers match (24/96/24, x1.0/x0.1/x0.33)`);
    }
    const md = readIn(L, L.files.storage);
    for (const [re, want, label] of L.rules) {
      const m = md.match(re);
      if (!m) bad(`${T} 05 ${label}`, 'not found in doc', want);
      else if (+m[1] !== want) bad(`${T} 05 ${label}`, +m[1], want);
    }
    good(`${T} cellar-tree rules (cap / distance) match`);
  }

  /* ================= 6. key binding consistency ================= */
  {
    const main = fs.readFileSync(path.join(base, 'src', 'main.js'), 'utf8');
    const docs = [L.files.storage, L.files.fruits].map(f => readIn(L, f)).join('\n');
    const bound = k => new RegExp(`k === '${k.toLowerCase()}'`).test(main);
    // every "press X" claim in the docs must refer to a key that is actually bound
    const claims = [...docs.matchAll(L.keyRe)].map(m => m[1].toUpperCase());
    for (const k of new Set(claims)) {
      if (!bound(k)) bad(`${T} doc key "${k}"`, 'doc says it is pressable', 'not bound in main.js');
      else good(`${T} key ${k} is bound`);
    }
    if (!claims.length) bad(`${T} key scan`, 'no "press X" phrasing found', '—');
  }

  /* ================= 7. counts and id coverage ================= */
  {
    const all = fs.readdirSync(L.dir).filter(f => f.endsWith('.md')).map(f => readIn(L, f)).join('\n');
    const missF = N.FRUITS.filter(f => !all.includes(L.nameOf(f)));
    if (missF.length) bad(`${T} fruits never mentioned in docs`, missF.map(L.nameOf), '—');
    else good(`${T} all ${N.FRUITS.length} fruits appear in the docs`);
    const missC = N.CREATURES.filter(c => !all.includes(L.nameOf(c)));
    if (missC.length) bad(`${T} creatures never mentioned in docs`, missC.map(L.nameOf), '—');
    else good(`${T} all ${N.CREATURES.length} creatures appear in the docs`);
    const missP = N.PLANTS.filter(p => !all.includes(L.nameOf(p)));
    if (missP.length) bad(`${T} plants never mentioned in docs`, missP.map(L.nameOf), '—');
    else good(`${T} all ${N.PLANTS.length} plants appear in the docs`);
    /* A design that was removed has to leave the docs too: prose the code will
       never keep is worse than a blank page. Add the phrase here when a design
       is cut, so it cannot quietly come back through a copy-paste. */
    const lower = all.toLowerCase();
    const back = L.cut.filter(w => lower.includes(w.toLowerCase()));
    if (back.length) for (const w of back) bad(`${T} cut design still in docs`, w, 'removed from the design');
    else good(`${T} no cut design came back (${L.cut.join(' / ')} absent)`);
  }
}

/* ================= 8. the docs tree keeps one language ================= */
{
  const CN = path.join(DOCS, 'cn'), EN = path.join(DOCS, 'en');
  if (fs.existsSync(CN) || fs.existsSync(EN)) bad('docs/cn or docs/en back', 'present', 'the setting documents live flat in docs/: the eight numbered chapters and nothing else');
  const md = fs.readdirSync(DOCS).filter(f => f.endsWith('.md'));
  const numPrefix = f => (f.match(/^(\d+)/) || [null, ''])[1];
  const have = new Set(md.map(numPrefix));
  const missing = ['00', '01', '02', '03', '04', '05', '06', '07'].filter(x => !have.has(x));
  if (missing.length) bad('docs/ missing', missing, 'the eight numbered chapters');
  else if (md.length !== 8) bad('docs/ loose files', md, 'the eight numbered chapters only: the index lives in the root READMEs');
  else good(`docs/ holds the whole set: the eight numbered chapters (${md.length} files), nothing else`);
}

/* ================= 9. identity: the protagonist has NO fixed name ================= */
{
  const ID = N.IDENTITY;
  const banned = ['林奈', 'Linnaeus'];   // a fixed protagonist name must never come back
  for (const L of LANGS) {
    const T = `[${L.tag}]`;
    const all = fs.readdirSync(L.dir).filter(f => f.endsWith('.md')).map(f => readIn(L, f)).join('\n');
    for (const w of banned)
      if (all.includes(w)) bad(`${T} fixed protagonist name`, w, 'the protagonist is not named (docs/03 s6)');
    const miss = ID.epithets.map(e => e[L.nameField]).filter(x => !all.includes(x));
    if (miss.length) bad(`${T} epithets missing from docs`, miss, 'IDENTITY.epithets');
    if (!all.includes(ID.epithetDefault[L.nameField])) bad(`${T} default epithet`, 'missing', ID.epithetDefault[L.nameField]);
    // language-neutral tokens so the numbers can be checked in either language
    const mMax = all.match(/nameMax\s+(\d+)/), mBytes = all.match(/idBytes\s+(\d+)/);
    if (!mMax || +mMax[1] !== ID.nameMax) bad(`${T} nameMax`, mMax && mMax[1], ID.nameMax);
    if (!mBytes || +mBytes[1] !== ID.idBytes) bad(`${T} idBytes`, mBytes && mBytes[1], ID.idBytes);
    if (!all.includes(ID.idPrefix)) bad(`${T} id prefix`, 'missing', ID.idPrefix);
    good(`${T} identity: no fixed name, all ${ID.epithets.length + 1} epithets + numbers documented`);
  }
  const main = fs.readFileSync(path.join(base, 'src', 'main.js'), 'utf8');
  if (!new RegExp(`k === '${ID.nameKey}'`).test(main)) bad('IDENTITY.nameKey', ID.nameKey, 'not bound in main.js');
  else good(`rename key ${ID.nameKey} is bound`);
  // the interface language switch is a documented control too (07 s3.5)
  if (!new RegExp(`k === '${N.LOCALE_KEY}'`).test(main)) bad('LOCALE_KEY', N.LOCALE_KEY, 'not bound in main.js');
  else good(`language switch key ${N.LOCALE_KEY} is bound`);
}

/* ================= 10. the mind is never affected (doc 04 in the set) =================
   A form inherits the animal's body and the world's reaction to that body --
   never a mind. No urges, no compulsions, no truth spells, no hijacked instincts.
   The vocabulary itself is banned in the data and in the docs. */
{
  const BANNED = [
    [/忍不住|不受控|无法抗拒|冲动|强迫|强制入睡|说谎|记忆模糊|只想朝北|趋光/g, 'cn'],
    [/\burge\b|compuls|cannot resist|involuntar|inability to lie|forced to tell|memory blur|phototax|irresistib/gi, 'en']
  ];
  const targets = [
    path.join(base, 'data', 'fruits.js'), path.join(base, 'data', 'creatures.js'),
    path.join(base, '..', 'docs', '00-overview-and-design-pillars.md'),
    path.join(base, '..', 'docs', '03-characters-and-creatures.md'),
    path.join(base, '..', 'docs', '04-fruit-and-transformation.md')
  ];
  const hits = [];
  for (const f of targets) {
    const txt = fs.readFileSync(f, 'utf8');
    for (const [re, lang] of BANNED)
      for (const m of txt.matchAll(re)) {
        const line = txt.slice(0, m.index).split('\n').length;
        hits.push(`${path.relative(path.join(base, '..'), f)}:${line} "${m[0]}" [${lang}]`);
      }
  }
  if (hits.length) bad('mental-effect language (forms inherit the body, not the mind)', hits.join(' | '), 'none');
  else good('no mental effects anywhere: a form inherits the body only');
}

/* ================= 11. the scale table (00 s8) =================
   The table a reader trusts most was the one nobody checked: a length in three
   data files restated as prose in doc 00. It drifted twice in a single pass
   (fruits still said 7 after the roster cut; the deed count disagreed with the
   English and Chinese copies of the same row). */
{
  const game = fs.readFileSync(path.join(base, 'src', 'game.js'), 'utf8');
  const want = {
    world: `${N.WORLD.w}×${N.WORLD.h}×${N.WORLD.d}`,
    zones: N.ZONES.length,
    fruits: N.FRUITS.length,
    creatures: N.CREATURES.length,
    deeds: (game.match(/\{ id: '[a-z]+',\s*cn: '[^']*',\s*en: '[^']*',\s*done: false/g) || []).length,
    dayLen: +(game.match(/const DAY_LEN = (\d+)/) || [])[1]
  };
  for (const L of LANGS) {
    const T = `[${L.tag}]`;
    const rows = tableAfter(readIn(L, L.scaleFile), L.scaleHead);
    if (!rows || !rows.length) { bad(`${T} scale table`, 'missing', `00 ${L.scaleHead}`); continue; }
    const cell = {};
    for (const r of rows) cell[r[0]] = r[1];
    let miss = 0;
    for (const [key, label] of Object.entries(L.scaleLabels)) {
      const want_ = key === 'day' ? want.dayLen : want[key];
      const got = cell[label];
      if (got === undefined) { bad(`${T} scale table row`, label, 'missing'); miss++; continue; }
      const hit = typeof want_ === 'number' ? num(got) === want_ : String(got).includes(want_);
      if (!hit) { bad(`${T} scale: ${label}`, got, String(want_)); miss++; }
    }
    if (!miss) good(`${T} scale table: ${N.WORLD.w}×${N.WORLD.h}×${N.WORLD.d}, ${N.ZONES.length} zones, ${N.FRUITS.length} fruits, ${N.CREATURES.length} species, ${want.deeds} deeds, ${want.dayLen}s day`);
  }
}

/* ================= 12. the heights (02 s4 + s5.5) ===========================
   The map chapter answers a long list of questions about height and states every
   one of them as prose: what row the lake's surface lies at, how many water
   columns the lake holds and what share of them is more than eight blocks deep,
   where the deepest of them stands and what rows the water runs over, how deep a
   bed this world can carve at all, what rows the sunken tower's shell, windows,
   sills and spire occupy and how far the ruin stands above the water line, what
   band the ridge's own ground falls in. The checker
   compared coordinates and never once asked a height, so the next wrong y in the
   chapter stayed invisible. There is no excuse for not asking: the world builds
   headless in one build of 36 ms (measured: 35.9 ms the first time in a fresh
   process, 13-18 ms after that), so asking costs one `generate` call per run.
   Each of those numbers is now asked of the world the data generates, in both
   document sets, at the game's own seed -- which is read out of game.js rather
   than restated here, so it cannot drift into a second constant.

   The trap this pass found, and the reason every census below counts only the
   columns the world actually has: the ridge's disc hangs past the wall of the
   valley. Its zone is (142,18) r26, which asks for x up to 168 in a world 160
   wide -- 413 of its 2121 disc columns are outside the world. `World.get` refuses
   those columns (0 outside the bounds), so a census that simply drops them quietly
   measures a smaller ridge than the one it says it measured. A census that reads
   the flat array itself, which is what a fast one does, reads *another column*:
   the index (y*d + z)*w + x with x = 168 in a world 160 wide lands on x = 8 one
   row over, on the far side of the valley. The ridge census measured that way
   answers y22-36, mean 29 where the honest one says 30.14 --
   the same disc, the same generator, one bounds check missing. Everything below
   therefore asks only the columns the world holds, and says how many that was:
   1708 in-world columns of the ridge, and the chapter's numbers are right --
   23-36, mean 30.14 (the chapter rounds it to 30). The check keeps the wrong
   census running beside the right one
   and prints both, so the trap stays a measurement and not a story. */
{
  const src = fs.readFileSync(path.join(base, 'src', 'game.js'), 'utf8');
  const SEED = +(((src.match(/this\.seed = (\d+)/) || [])[1]));
  require(path.join(base, 'src', 'engine.js'));
  require(path.join(base, 'src', 'world.js'));
  require(path.join(base, 'src', 'worldgen.js'));
  const w = new N.World(N.WORLD.w, N.WORLD.h, N.WORLD.d);
  N.generate(w, SEED);
  const SZ = N.WORLD, BK = N.BLOCKS;
  const at = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= SZ.w || y >= SZ.h || z >= SZ.d)
    ? 0 : w.get(x, y, z);
  const isPlant = b => !!N.TREE_BLOCK[b] || !!(BK[b] && BK[b].micro);
  // the ground a body would stand on: the highest solid block that is not a plant
  const surface = (x, z) => {
    for (let y = SZ.h - 1; y > 0; y--) { const b = w.get(x, y, z); if (b && BK[b].solid && !isPlant(b)) return y; }
    return -1;
  };
  const filmAt = (x, z) => { for (let y = SZ.h - 1; y >= 0; y--) if (w.get(x, y, z) === 5) return y; return -1; };
  const bedAt = (x, z, top) => {
    for (let y = top - 1; y >= 0; y--) { const b = at(x, y, z); if (b && b !== 5 && b !== 75 && BK[b]) return y; }
    return -1;
  };
  // the columns of a zone's disc that the world actually has -- see the trap above
  const disc = (zn) => {
    const out = [];
    for (let z = zn.cz - zn.r; z <= zn.cz + zn.r; z++)
      for (let x = zn.cx - zn.r; x <= zn.cx + zn.r; x++)
        if (Math.hypot(x - zn.cx, z - zn.cz) <= zn.r && x >= 0 && z >= 0 && x < SZ.w && z < SZ.d) out.push([x, z]);
    return out;
  };

  /* the lake: every water column of its disc that the world holds */
  const MK = N.ZONE_BY_ID.mirrorlake;
  let wet = 0, sh4 = 0, deep8 = 0, minD = 99, maxD = -1, deepAt = null, lowestBed = 99;
  for (const [x, z] of disc(MK)) {
    const top = filmAt(x, z); if (top < 0) continue;
    const g = bedAt(x, z, top); if (g < 0 || top - g <= 0) continue;
    const d = top - g;
    wet++;
    if (d <= 4) sh4++;
    if (d >= 8) deep8++;
    if (d < minD) minD = d;
    if (d > maxD) { maxD = d; deepAt = [x, z, g + 1, top]; }
    if (g < lowestBed) lowestBed = g;
  }

  /* the ridge: its own ground, over the columns the world has */
  const RG = N.ZONE_BY_ID.mountains;
  let rn = 0, rsum = 0, rlo = 99, rhi = -1;
  for (const [x, z] of disc(RG)) {
    const g = surface(x, z); if (g < 0) continue;
    rn++; rsum += g;
    if (g < rlo) rlo = g;
    if (g > rhi) rhi = g;
  }

  /* the sunken tower: what shape the generator's shape actually leaves */
  const SHELL = 12, GLASS = 21, FRUIT_FROGPEAR = N.FRUIT_BLOCK_REV['frogpear'];
  const [tx, tz] = MK.tower;
  let shellLo = 99, shellHi = -1;
  for (let y = 0; y < SZ.h; y++) for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
    if (Math.abs(dx) !== 3 && Math.abs(dz) !== 3) continue;
    if (at(tx + dx, y, tz + dz) !== SHELL) continue;
    if (y < shellLo) shellLo = y;
    if (y > shellHi) shellHi = y;
  }
  let spanLo = 9, spanHi = -9;
  for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
    let holds = false;
    for (let y = shellLo; y <= shellHi; y++) if (at(tx + dx, y, tz + dz) === SHELL) { holds = true; break; }
    if (!holds) continue;
    if (dx < spanLo) spanLo = dx;
    if (dx > spanHi) spanHi = dx;
  }
  const towerSpan = spanHi - spanLo + 1;
  const winSet = new Set(), sillSet = new Set();
  for (let y = 0; y < SZ.h; y++) for (const [dx, dz] of [[-3, 0], [3, 0], [0, -3], [0, 3]]) {
    const b = at(tx + dx, y, tz + dz);
    if (b === GLASS) winSet.add(y);
    if (b === FRUIT_FROGPEAR) sillSet.add(y);
  }
  const winRows = [...winSet].sort((a, b) => a - b);
  const sillRows = [...sillSet].sort((a, b) => a - b);
  const spireRows = [];
  for (let y = shellHi + 1; y < SZ.h; y++) if (at(tx, y, tz) === SHELL) spireRows.push(y);
  const towerFilm = filmAt(tx, tz);
  const ruinAbove = (spireRows.length && towerFilm >= 0) ? spireRows[spireRows.length - 1] - towerFilm : null;

  /* the water body as a whole: the rows it ever occupies */
  let wl0 = 99, wl1 = -1;
  for (let y = 0; y < SZ.h; y++) for (let z = 0; z < SZ.d; z++) for (let x = 0; x < SZ.w; x++)
    if (at(x, y, z) === 5) { if (y < wl0) wl0 = y; if (y > wl1) wl1 = y; }

  /* the keep's greenhouse case: the glass the generator builds inside the keep's
     disc. The chapter says the fruit inside it is a demonstration, so the shape
     that claim rests on is measured here: the plan, the rows, and whether the
     case is closed on every face.
     Asked over the keep's square instead of its disc the same census walks into
     the sunken tower's windows two zones away: the square x66..90, z94..118 holds
     104 glass cells spanning y7..y26 on a 21x9 plan, and the box it reports is
     not a greenhouse at all. */
  const KEEP = N.ZONE_BY_ID.starfall;
  let gLo = [1e9, 1e9, 1e9], gHi = [-1e9, -1e9, -1e9], gN = 0, gSquare = 0;
  for (let y = 0; y < SZ.h; y++)
    for (let z = KEEP.cz - KEEP.r; z <= KEEP.cz + KEEP.r; z++)
      for (let x = KEEP.cx - KEEP.r; x <= KEEP.cx + KEEP.r; x++) {
        const inDisc = Math.hypot(x - KEEP.cx, z - KEEP.cz) <= KEEP.r;
        if (at(x, y, z) === GLASS) gSquare++;
        if (!inDisc) continue;
        if (at(x, y, z) !== GLASS) continue;
        gN++;
        gLo = [Math.min(gLo[0], x), Math.min(gLo[1], y), Math.min(gLo[2], z)];
        gHi = [Math.max(gHi[0], x), Math.max(gHi[1], y), Math.max(gHi[2], z)];
      }
  const caseSpan = [gHi[0] - gLo[0] + 1, gHi[2] - gLo[2] + 1];
  let caseHoles = 0, caseShell = 0;
  for (let x = gLo[0]; x <= gHi[0]; x++) for (let y = gLo[1]; y <= gHi[1]; y++) for (let z = gLo[2]; z <= gHi[2]; z++) {
    const onFace = x === gLo[0] || x === gHi[0] || y === gLo[1] || y === gHi[1] || z === gLo[2] || z === gHi[2];
    if (!onFace) continue;
    caseShell++;
    if (at(x, y, z) !== GLASS) caseHoles++;
  }
  const caseInside = [], caseFill = {};
  for (let y = gLo[1] + 1; y < gHi[1]; y++) for (let z = gLo[2] + 1; z < gHi[2]; z++) for (let x = gLo[0] + 1; x < gHi[0]; x++) {
    const b = at(x, y, z);
    if (b) caseInside.push(b);
    // keyed by block id: what the box holds is masonry and plants as well as fruit
    const k = b || 0;
    caseFill[k] = (caseFill[k] || 0) + 1;
  }
  const caseFillLine = Object.keys(caseFill).map(Number).sort((a, b) => caseFill[b] - caseFill[a])
    .map(k => `${caseFill[k]}x${k}`).join(' ');
  const caseRoom = (caseSpan[0] - 2) * (caseSpan[1] - 2) * (gHi[1] - gLo[1] - 1);
  // the two materials the chapter names in words: the keep's wall and the island's ground
  const BRICK = 11, GRASS = 1;
  const caseWalls = caseFill[BRICK] || 0, caseGrass = caseFill[GRASS] || 0, caseAir = caseFill[0] || 0;
  const ghPOI = N.POIS.find(q => q.id === 'greenhouse');
  const caseFar = Math.hypot((gLo[0] + gHi[0]) / 2 - ghPOI.x, (gLo[2] + gHi[2]) / 2 - ghPOI.z);

  /* a door the generator marks: a cellar crate standing in the marker's column */
  const DOOR = N.BLOCK_ID.cellarCrate;
  /* The island under the keep's own door, counted cell by cell: every column the
     zone's disc holds, from the floor of the world up to the row that zone's door
     marker is printed at. And the room under the town's door, measured the same
     way -- the dark-brick box the store is built in found by asking the town's
     rect which of its columns hold block 12, then the rows over its marker that
     hold air, then the first row over those that does not. Both answers belong to
     a name: the chapter and the game's own strings call one of these places a
     room and used to call the other one too. */
  const underLo = 0, underHi = ghPOI.y;
  let underCols = 0, underCells = 0, underAir = 0, underOOB = 0;
  for (let z = KEEP.cz - KEEP.r; z <= KEEP.cz + KEEP.r; z++)
    for (let x = KEEP.cx - KEEP.r; x <= KEEP.cx + KEEP.r; x++) {
      if (Math.hypot(x - KEEP.cx, z - KEEP.cz) > KEEP.r) continue;
      underCols++;
      if (x < 0 || z < 0 || x >= SZ.w || z >= SZ.d) { underOOB++; continue; }
      for (let y = underLo; y <= underHi; y++) { underCells++; if (!at(x, y, z)) underAir++; }
    }
  const TOWN = N.ZONE_BY_ID.lanternrow, DARK = 12;
  const tLo = [1e9, 1e9], tHi = [-1e9, -1e9];
  let tCols = 0;
  for (let z = TOWN.z0; z <= TOWN.z1; z++) for (let x = TOWN.x0; x <= TOWN.x1; x++) {
    let has = false;
    for (let y = 0; y < SZ.h; y++) if (at(x, y, z) === DARK) { has = true; break; }
    if (!has) continue;
    tCols++;
    tLo[0] = Math.min(tLo[0], x); tLo[1] = Math.min(tLo[1], z);
    tHi[0] = Math.max(tHi[0], x); tHi[1] = Math.max(tHi[1], z);
  }
  const townPOI = N.POIS.find(q => q.id === 'cellar');
  const townRows = [];
  for (let y = townPOI.y + 1; y <= townPOI.y + 8; y++) {
    let air = 0;
    for (let z = tLo[1]; z <= tHi[1]; z++) for (let x = tLo[0]; x <= tHi[0]; x++) if (!at(x, y, z)) air++;
    if (!air) break;
    townRows.push(y);
  }
  const townSpan = [tHi[0] - tLo[0] + 1, tHi[1] - tLo[1] + 1];
  const townFloor = townPOI.y + townRows.length + 1;

  /* ---- the islands the sea holds (02 s1.2) ----
     The rule is arithmetic on an ordinal, so every number the chapter states about
     it is answered here without a browser: the spiral's constants, the two numbers
     each kind of island is made of, and the counts -- how many stand, how far their
     feet are from each other and from this island's shore, how the density falls
     with the distance, how far a point of open sea stands from the nearest ground.
     Asked at the seed the game opens with over the first 70 ordinals, which is as
     far out as the game streams ground on its own and no further: a census of the
     reach, not of a mathematically infinite sea. */
  const ISLES = N.ISLES, CEN = { x: SZ.w / 2, z: SZ.d / 2 };
  const ORD = 70;
  const isleRows = []; for (let n = 1; n <= ORD; n++) isleRows.push(N.isleRecord(n));
  const islesUp = isleRows.filter(r => r.r > 0);
  const isleTypeCount = islesUp.reduce((m, r) => (m[r.type] = (m[r.type] || 0) + 1, m), {});
  // where the first turn's centres actually stand, after the pull along the radius
  let isleT1lo = 1e9, isleT1hi = -1e9;
  for (const r of isleRows) {
    if (r.turn !== 1) continue;
    const d = Math.hypot(r.x - CEN.x, r.z - CEN.z);
    if (d < isleT1lo) isleT1lo = d;
    if (d > isleT1hi) isleT1hi = d;
  }
  // separation in both senses: foot to foot, and foot to the water's edge round this
  // island. The second is measured to where the sea stands, not to the island's own
  // shore line: the channel between two grounds is water, and a body crossing it starts
  // at the water, so this is the same measure test/node-smoke.js prints and the chapter
  // quotes (see `shoreWater`).
  let isleGap = 1e9, isleShore = 1e9;
  for (const a of islesUp) {
    const shoreHere = Math.hypot(a.x - CEN.x, a.z - CEN.z) - N.shoreWater(Math.atan2(a.z - CEN.z, a.x - CEN.x));
    if (shoreHere - a.r < isleShore) isleShore = shoreHere - a.r;
    for (const b of islesUp) {
      if (b.id <= a.id) continue;
      const g = Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r;
      if (g < isleGap) isleGap = g;
    }
  }
  let isleNear = 1e9, isleNearest = null, isleStand = null, isleStandDist = 1e9;
  const ISLE_STAND = 40;         // a foot this small is a shoal, not standing ground
  for (const r of islesUp) {
    const d = Math.hypot(r.x - CEN.x, r.z - CEN.z);
    if (d < isleNear) { isleNear = d; isleNearest = r; }
    // the island the chapter's census is of: the nearest with a foot a body could
    // stand on at all. Standing on a shoal is not what that row is about.
    if (r.r >= ISLE_STAND && d < isleStandDist) { isleStandDist = d; isleStand = r; }
  }
  // the gradient the rule exists for: islands per km2 in each kilometre band
  const isleBands = {};
  for (const r of islesUp) {
    const k = Math.floor(Math.hypot(r.x - CEN.x, r.z - CEN.z) / 1000);
    isleBands[k] = (isleBands[k] || 0) + 1;
  }
  const isleDens = Object.keys(isleBands).sort((a, b) => a - b).map(k =>
    isleBands[k] / (Math.PI * (Math.pow(+k + 1, 2) - Math.pow(+k, 2))));
  /* how far a point of open sea stands from the nearest ground, sampled on rings:
     190 m is just past the authored shore at its closest, 1,500 m is three fruits
     out. Asked of every raised foot, including the ones whose own ground already
     covers the point -- which is what "how far is the nearest land" means. */
  const isleFar = [];
  for (let a = 0; a < 96; a++) {
    for (let rad = 190; rad <= 1500; rad += 25) {
      const th = a / 96 * Math.PI * 2;
      if (rad < N.coastRadius(th)) continue;             // standing on the authored island
      const x = CEN.x + Math.cos(th) * rad, z = CEN.z + Math.sin(th) * rad;
      let best = 1e9;
      for (const r of islesUp) {
        const d = Math.max(0, Math.hypot(x - r.x, z - r.z) - r.r);
        if (d < best) best = d;
      }
      isleFar.push(best);
    }
  }
  const islePct = p => { const s = isleFar.slice().sort((u, v) => u - v); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
  /* what stands on the nearest one, cell by cell. The world answers any address, so
     the island's own footprint is counted out of built ground rather than out of the
     rule that made it: the answer is what the ground is made of, and nothing that
     grows. This is the half of the claim that stops the chapter describing a shore
     with trees on it while the generator plants nothing outside the authored square. */
  const IGRASS = 1, ISOIL = 2, ISTONE = 3, ISAND = 4, IWATER = 5, IMROCK = 24;
  let isleCols = 0, isleTrees = 0, isleFruit = 0, islePlants = 0;
  const isleCells = {};
  const isleSpan = Math.ceil(isleStand.r);
  for (let dz = -isleSpan; dz <= isleSpan; dz++) for (let dx = -isleSpan; dx <= isleSpan; dx++) {
    if (Math.hypot(dx, dz) > isleStand.r) continue;
    isleCols++;
    const x = Math.round(isleStand.x) + dx, z = Math.round(isleStand.z) + dz;
    for (let y = 0; y < SZ.h; y++) {
      const b = w.get(x, y, z);
      if (!b) continue;
      isleCells[b] = (isleCells[b] || 0) + 1;
      if (N.TREE_BLOCK[b]) isleTrees++;
      if (N.FRUIT_BLOCK[b]) isleFruit++;
      if (BK[b] && BK[b].micro) islePlants++;
    }
  }
  /* what the sea's own kinds bear. A fruit that grows in a *kind of ground* is a
     rule about the island kinds, not about a place, so the census the chapter
     prints is asked of every column of every island: how many of them stand above
     the water line, and what grows on top of the ones that do. The same question
     is asked of this island's own authored ground, where the answer must be the
     other fruit and nothing of this one. */
  const CROPS = N.FRUITS.filter(f => f.bear && f.habitat.some(h => N.ISLE_TYPES[h]));
  const CROPB = {};
  for (const f of CROPS) CROPB[N.FRUIT_BLOCK_REV[f.id]] = f;
  const cropKind = {}, cropBar = [];
  let cropCols = 0, cropDry = 0, cropCells = 0;
  for (let n = 1; n <= ORD; n++) {
    const r = N.isleRecord(n);
    if (r.r <= 0) continue;
    const t = cropKind[r.type] = cropKind[r.type] || { isles: 0, cols: 0, dry: 0, crop: 0 };
    t.isles++;
    const span = Math.ceil(r.r), cx = Math.floor(r.x), cz = Math.floor(r.z);
    let mine = 0, mineDry = 0;
    for (let dz = -span; dz <= span; dz++) for (let dx = -span; dx <= span; dx++) {
      const x = cx + dx, z = cz + dz;
      if (Math.hypot(x + 0.5 - r.x, z + 0.5 - r.z) >= r.r) continue;
      const under = N.islandUnder(x, z);
      if (!under || under.isle.id !== r.id) continue;      // an overlapping dome owns it
      cropCols++; t.cols++;
      const h = N.landHeight(x, z);
      if (h <= SZ.sea) continue;
      cropDry++; t.dry++; mineDry++;
      if (CROPB[w.get(x, h + 1, z)]) { cropCells++; mine++; t.crop++; }
    }
    if (r.type === 'sandbar')
      cropBar.push({ id: r.id, at: [cx, cz], foot: r.r, d: Math.hypot(r.x - CEN.x, r.z - CEN.z), dry: mineDry, crop: mine });
  }
  const byCrop = a => a.slice().sort((u, v) => u.crop - v.crop);
  const barLeast = byCrop(cropBar)[0], barMost = byCrop(cropBar)[cropBar.length - 1];
  const barNear = cropBar.slice().sort((u, v) => u.d - v.d)[0];
  const authored = {};
  for (const [id, fid] of Object.entries(N.FRUIT_BLOCK)) {
    let n = 0;
    for (let i = 0; i < w.blocks.length; i++) if (w.blocks[i] === +id) n++;
    if (n) authored[fid] = n;
  }
  /* the two numbers that bound what a body can do out there, both read out of the
     code rather than remembered: the radius the renderer holds ground to, and the
     distance at which the air has taken 95% of the contrast off -- the reason that
     radius is what it is. */
  const wsrc = fs.readFileSync(path.join(base, 'src', 'world.js'), 'utf8');
  const keepChunks = +(wsrc.match(/this\.keep = (\d+)/) || [])[1];
  const chunkSize = +(wsrc.match(/this\.cs = (\d+)/) || [])[1];
  const drawRange = keepChunks * chunkSize;
  const fogDen = +(src.match(/let fogDen = ([\d.]+)/) || [])[1];
  const fogLaw = fs.readFileSync(path.join(base, 'src', 'engine.js'), 'utf8')
    .includes('1.0 - exp(-uFogDen*uFogDen*d*d)');
  const airRange = Math.round(Math.sqrt(Math.log(20)) / fogDen);   // where 1-exp(-(k*d)^2) = 0.95
  // the trip's clock: a fruit's duration at the speeds the body it gives can move
  const frogDur = N.FRUIT_BY_ID.frogpear.duration, handKeep = N.RARITY.common.fresh;
  const frogWalk = N.CREATURE_BY_ID.frog.speed, frogSwim = N.CREATURE_BY_ID.frog.swimSpeed;
  const oneFruit = Math.round(frogDur * frogSwim / 2), threeFruit = oneFruit * 3;

  /* what a kind of island is: the chapter prints it as a table and the rule keeps
     it in a table, so the table is compared rather than a sentence -- the two
     numbers of its shape, and the material its pile and crown are built of */
  let isleTableBad = 0;
  const MATERIALWORD = { 4: /\bsand\b/, 3: /\brock\b|\bstone\b/ };
  for (const L of LANGS) {
    const rows = tableAfter(readIn(L, L.files.zones), '| kind | foot radius | crown above the water line |');
    if (!rows) { bad(`${L.tag} 02 island kinds table`, 'missing', 'one row per kind'); isleTableBad++; continue; }
    if (rows.length !== Object.keys(N.ISLE_TYPES).length) { bad(`${L.tag} 02 island kinds table`, `${rows.length} kinds`, `${Object.keys(N.ISLE_TYPES).length} kinds`); isleTableBad++; continue; }
    for (const r of rows) {
      const t = N.ISLE_TYPES[r[0]];
      if (!t) { bad(`${L.tag} 02 island kind`, r[0], 'not in ISLE_TYPES'); isleTableBad++; continue; }
      const m1 = r[1].match(/(\d+)-(\d+)/), m2 = r[2].match(/([\d.]+)-([\d.]+)/);
      if (!m1 || +m1[1] !== t.r[0] || +m1[2] !== t.r[1]) { bad(`${L.tag} 02 ${r[0]} foot`, r[1], `${t.r[0]}-${t.r[1]} m`); isleTableBad++; }
      if (!m2 || +m2[1] !== t.crest[0] || +m2[2] !== t.crest[1]) { bad(`${L.tag} 02 ${r[0]} crown`, r[2], `${t.crest[0]}-${t.crest[1]} m`); isleTableBad++; }
      /* and what it is made of. A kind used to state only its shape and leave the
         material to the height table, which made 9 of the 15 sandbars hills of
         earth under grass and all 16 reefs the same. A bar is a heap of sand the
         sea laid and a reef is a rock it left standing, so the record names the
         blocks and this chapter names them in words: the word for the block the
         pile and the crown are built of has to be in the cell, and a kind that
         states no ground has to be described as the ground the height table
         makes. test/node-smoke.js walks the cells those blocks end up in; without
         this comparison the column could say anything at all. */
      const cell = r[3];
      if (cell === undefined) { bad(`${L.tag} 02 ${r[0]} ground`, 'the table has no column for what the ground is', 'what the pile is made of'); isleTableBad++; }
      else if (t.ground) {
        for (const b of new Set([t.ground.pile, t.ground.crown])) {
          const re = MATERIALWORD[b];
          if (!re) { bad(`${L.tag} 02 ${r[0]} ground block`, b, 'a material this chapter and this check have a word for'); isleTableBad++; }
          else if (!re.test(cell)) { bad(`${L.tag} 02 ${r[0]} ground`, cell.slice(0, 60), `the word for block ${b} (its pile/crown material)`); isleTableBad++; }
        }
        if (/\bsoil\b/.test(cell)) { bad(`${L.tag} 02 ${r[0]} ground`, 'the cell offers soil, which is what a pile raised by the sea is not', 'the pile material and the sea\'s sand at the water line'); isleTableBad++; }
      } else if (!/grass over soil/.test(cell)) { bad(`${L.tag} 02 ${r[0]} ground`, cell.slice(0, 60), 'grass over soil: ground the height table made, with no pile stated'); isleTableBad++; }
    }
  }
  if (!isleTableBad) good(`02 the kinds the sea builds, and the three numbers each is made of: ` +
    Object.keys(N.ISLE_TYPES).map(k => `${k} foot ${N.ISLE_TYPES[k].r[0]}-${N.ISLE_TYPES[k].r[1]} m, crown ${N.ISLE_TYPES[k].crest[0]}-${N.ISLE_TYPES[k].crest[1]} m, ` +
      (N.ISLE_TYPES[k].ground ? `pile block ${N.ISLE_TYPES[k].ground.pile}, crown block ${N.ISLE_TYPES[k].ground.crown}` : 'no pile: the height table')).join('; '));

    const crateRow = (p) => { for (let y = SZ.h - 1; y > 0; y--) if (at(p.x, y, p.z) === DOOR) return y; return -1; };
  const H = (label, cnRe, cnWant, enRe, enWant) => ({ label, cnRe, cnWant, enRe, enWant });
  const CLAIMS = [
    H('the row the lake surface stands at',
      /镜湖面 = y(\d+)/, [towerFilm],
      /Mirrorlake surface = y(\d+)/, [towerFilm]),
    H('the rows the water body itself occupies',
      /水体本身是 y(\d+)\.\.(\d+)/, [wl0, wl1],
      /the water itself is y(\d+)\.\.(\d+)/, [wl0, wl1]),
    H('how deep the lake stands',
      /水深从 \*\*(\d+) 格到 (\d+) 格\*\*/, [minD, maxD],
      /from \*\*(\d+) to (\d+) blocks\*\* deep/, [minD, maxD]),
    H('how many water columns the lake holds',
      /把湖里的 ([\d,]+) 根水柱/, [wet],
      /over all ([\d,]+) water columns/, [wet]),
    H('what share of them is four blocks or shallower',
      /(\d+)% 只有 4 格或更浅/, [Math.round(sh4 / wet * 100)],
      /(\d+)% of them are 4 blocks or less/, [Math.round(sh4 / wet * 100)]),
    H('what share of them is eight blocks or deeper',
      /\*\*(\d+)% 有 8 格以上\*\*/, [Math.round(deep8 / wet * 100)],
      /\*\*(\d+)% are 8 or more\*\*/, [Math.round(deep8 / wet * 100)]),
    H('where the deepest column stands and what rows it runs over',
      /最深处在 \((\d+),(\d+)\)，水从 y(\d+) 一直排到 y(\d+)/, deepAt,
      /deepest at \((\d+),(\d+)\) where the water runs y(\d+)\.\.y(\d+)/, deepAt),
    H('the deepest bed this world carves',
      /湖底最深只能到 y(\d+)/, [lowestBed],
      /the bed cannot go below y(\d+)/, [lowestBed]),
    H('the band the ridge surface falls in, and its mean',
      /地面是 \*\*y(\d+)[–-](\d+)\*\*（平均 (\d+)/, [rlo, rhi, Math.round(rsum / rn)],
      /surface is \*\*y(\d+)[–-](\d+)\*\* \(mean (\d+)/, [rlo, rhi, Math.round(rsum / rn)]),
    H('the rows the sunken tower shell spans, and the shell plan it spans',
      /\*\*y(\d+) 到 y(\d+)\*\* 的一具 (\d+)×(\d+) 壳体/, [shellLo, shellHi, towerSpan, towerSpan],
      /a (\d+)×(\d+) shell from \*\*y(\d+) to y(\d+)\*\*/, [towerSpan, towerSpan, shellLo, shellHi]),
    H('the rows the spire stands at',
      /塔尖在 \*\*y(\d+)\/y(\d+)\*\*/, [spireRows[0], spireRows[1]],
      /with a spire at \*\*y(\d+)\/y(\d+)\*\*/, [spireRows[0], spireRows[1]]),
    H('how far the top of the ruin stands above the water line',
      /露出水面 (\d+) 格/, [ruinAbove],
      /stands (\w+) blocks \*\*above\*\* the water line/, [ruinAbove]),
    H('the rows the tower windows occupy',
      /四个面都有窗，在 \*\*y(\d+)\/y(\d+)\/y(\d+)\*\*/, winRows,
      /Windows on all four faces at \*\*y(\d+)\/y(\d+)\/y(\d+)\*\*/, winRows),
    H('the rows the frog pear hangs on the sills at',
      /窗台上（\*\*y(\d+)\/y(\d+)\*\*）/, sillRows,
      /on the sills one block under two of them \(\*\*y(\d+)\/y(\d+)\*\*\)/, sillRows),
    H('the row the chapter prints for the keep greenhouse door',
      /\*\*温室\*\* y(\d+)/, [crateRow(ghPOI) - 1],
      /\*\*Greenhouse\*\* y(\d+)/, [crateRow(ghPOI) - 1]),
    H('what the island under that door holds, cell by cell',
      /星坠堡的 \*\*(\d+)\*\* 根列从 y(\d+) 到 y(\d+) 一共 \*\*([\d,]+)\*\* 格，其中 \*\*(\d+)\*\* 格是空的/,
      [underCols, underLo, underHi, underCells, underAir],
      /the keep's \*\*(\d+)\*\* columns, from y(\d+) to y(\d+), hold \*\*([\d,]+)\*\* cells and \*\*(\d+)\*\* of them are air/,
      [underCols, underLo, underHi, underCells, underAir]),
    H('the room the town cellar door opens onto',
      /(\d+)×(\d+) 的黑砖，y(\d+)、y(\d+)、y(\d+) 三行是空的，三行屋子，头顶就是镇子铺在 y(\d+) 的那层地板/,
      [townSpan[0], townSpan[1], townRows[0], townRows[1], townRows[2], townFloor],
      /(\d+)x(\d+) of dark brick with air at y(\d+), y(\d+) and y(\d+), three rows of it, under the floor the town builds on at y(\d+)/,
      [townSpan[0], townSpan[1], townRows[0], townRows[1], townRows[2], townFloor]),
    H('the plan and rows of the glass case the keep holds its demonstration fruit in',
      /\*\*(\d+)×(\d+) 的玻璃罩，从 y(\d+) 立到 y(\d+)\*\*/, [caseSpan[0], caseSpan[1], gLo[1], gHi[1]],
      /\*\*(\d+)×(\d+) glass box, from y(\d+) to y(\d+)\*\*/, [caseSpan[0], caseSpan[1], gLo[1], gHi[1]]),
    H('how far that case stands from the door that marks it',
      /离那扇门 (\d+\.\d) 米/, [+caseFar.toFixed(1)],
      /standing (\d+\.\d) m from that door/, [+caseFar.toFixed(1)]),
    H('what fills the inside of that case, cell by cell',
      /内部 (\d+) 格里有 (\d+) 格是城堡自己的城砖，(\d+) 格是长草的地面，(\d+) 格是空的/, [caseRoom, caseWalls, caseGrass, caseAir],
      /of its (\d+) inner cells, (\d+) are the keep's own city brick, (\d+) are ground under grass and (\d+) are empty/, [caseRoom, caseWalls, caseGrass, caseAir]),

    /* ---- the sea's islands (02 s1.2): the rule, and what the rule builds ---- */
    H('the spiral: what a turn carries and how much radius it gains',
      /carries \*\*(\d+)\*\* islands and gains \*\*(\d+) m\*\* of radius, so\s+the turns stand \*\*(\d+) m\*\* apart radially; the first turn is drawn at radii\s*\*\*(\d+)-(\d+) m\*\* and its seven centres actually stand \*\*(\d+)-(\d+) m\*\* out/,
      [ISLES.perTurn, ISLES.b, Math.round(2 * Math.PI * ISLES.b), Math.round(2 * Math.PI * ISLES.b), Math.round(4 * Math.PI * ISLES.b), Math.round(isleT1lo), Math.round(isleT1hi)],
      /carries \*\*(\d+)\*\* islands and gains \*\*(\d+) m\*\* of radius, so\s+the turns stand \*\*(\d+) m\*\* apart radially; the first turn is drawn at radii\s*\*\*(\d+)-(\d+) m\*\* and its seven centres actually stand \*\*(\d+)-(\d+) m\*\* out/,
      [ISLES.perTurn, ISLES.b, Math.round(2 * Math.PI * ISLES.b), Math.round(2 * Math.PI * ISLES.b), Math.round(4 * Math.PI * ISLES.b), Math.round(isleT1lo), Math.round(isleT1hi)]),
    H('the channel every island is held clear of, and the pull along the radius',
      /never allowed to come within \*\*(\d+) m\*\*/, [ISLES.keep],
      /never allowed to come within \*\*(\d+) m\*\*/, [ISLES.keep]),
    H('how far a centre is pulled off the spiral it was drawn on',
      /every island is pulled up to \*\*(\d+) m\*\* along its own radius/, [ISLES.jitter],
      /every island is pulled up to \*\*(\d+) m\*\* along its own radius/, [ISLES.jitter]),
    H('how many of them stand, and how close the closest two feet come',
      /\|\s*islands raised\s*\|\s*\*\*(\d+)\*\* of (\d+) ordinals;[^|\n]*closest two feet came within \*\*(\d+\.\d) m\*\*/,
      [islesUp.length, ORD, +isleGap.toFixed(1)],
      /\|\s*islands raised\s*\|\s*\*\*(\d+)\*\* of (\d+) ordinals;[^|\n]*closest two feet came within \*\*(\d+\.\d) m\*\*/,
      [islesUp.length, ORD, +isleGap.toFixed(1)]),
    H('what kinds came out of the mix',
      /\|\s*kinds\s*\|\s*(\d+) sandbars, (\d+) reefs, (\d+) thickets, (\d+) isles, (\d+) ridges/,
      [isleTypeCount.sandbar, isleTypeCount.reef, isleTypeCount.thicket, isleTypeCount.isle, isleTypeCount.ridge],
      /\|\s*kinds\s*\|\s*(\d+) sandbars, (\d+) reefs, (\d+) thickets, (\d+) isles, (\d+) ridges/,
      [isleTypeCount.sandbar, isleTypeCount.reef, isleTypeCount.thicket, isleTypeCount.isle, isleTypeCount.ridge]),
    H('the density of islands in each kilometre band, which is the gradient',
      /islands per km², by band \| \*\*(\d+\.\d+)\*\* in the 0-1 km band, \*\*(\d+\.\d+)\*\* at 1-2 km, \*\*(\d+\.\d+)\*\* at 2-3 km, \*\*(\d+\.\d+)\*\* at 3-4 km/,
      isleDens.slice(0, 4).map(d => +d.toFixed(2)),
      /islands per km², by band \| \*\*(\d+\.\d+)\*\* in the 0-1 km band, \*\*(\d+\.\d+)\*\* at 1-2 km, \*\*(\d+\.\d+)\*\* at 2-3 km, \*\*(\d+\.\d+)\*\* at 3-4 km/,
      isleDens.slice(0, 4).map(d => +d.toFixed(2))),
    H('the nearest of them, in centre distance and in open water',
      /the nearest of them \| centre \*\*(\d+) m\*\* from \((\d+),(\d+)\); \*\*(\d+) m\*\* of open water/,
      [Math.round(isleNear), CEN.x, CEN.z, Math.round(isleShore)],
      /the nearest of them \| centre \*\*(\d+) m\*\* from \((\d+),(\d+)\); \*\*(\d+) m\*\* of open water/,
      [Math.round(isleNear), CEN.x, CEN.z, Math.round(isleShore)]),
    H('how far a point of open sea stands from the nearest ground',
      /median point of sea is \*\*(\d+) m\*\* from an island's foot and the furthest sampled point is \*\*(\d+) m\*\*: one fruit is \*\*(\d+) m\*\* out and back/,
      [Math.round(islePct(0.5)), Math.round(islePct(1)), oneFruit],
      /median point of sea is \*\*(\d+) m\*\* from an island's foot and the furthest sampled point is \*\*(\d+) m\*\*: one fruit is \*\*(\d+) m\*\* out and back/,
      [Math.round(islePct(0.5)), Math.round(islePct(1)), oneFruit]),
    H('what stands on the nearest ground big enough to stand on, cell by cell',
      /what stands on the nearest ground big enough to stand on \| \*\*nothing\*\*\. The nearest island with a foot of (\d+) m or more — ordinal (\d+), a [a-z]+, \*\*(\d+) m\*\* out, foot \*\*(\d+) m\*\* — has had its whole footprint \(\*\*([\d,]+)\*\* columns\) counted cell by cell: \*\*(\d+)\*\* cells of tree, \*\*(\d+)\*\* of fruit, \*\*(\d+)\*\* of plant\. What it does hold: \*\*([\d,]+)\*\* cells of water, \*\*([\d,]+)\*\* of stone, \*\*([\d,]+)\*\* of sand, \*\*([\d,]+)\*\* of the mountain rock[^,]*, \*\*([\d,]+)\*\* of soil and \*\*([\d,]+)\*\* of grass/,
      [ISLE_STAND, isleStand.id, Math.round(isleStandDist), Math.round(isleStand.r), isleCols, isleTrees, isleFruit, islePlants, isleCells[IWATER] || 0, isleCells[ISTONE] || 0, isleCells[ISAND] || 0, isleCells[IMROCK] || 0, isleCells[ISOIL] || 0, isleCells[IGRASS] || 0],
      /what stands on the nearest ground big enough to stand on \| \*\*nothing\*\*\. The nearest island with a foot of (\d+) m or more — ordinal (\d+), a [a-z]+, \*\*(\d+) m\*\* out, foot \*\*(\d+) m\*\* — has had its whole footprint \(\*\*([\d,]+)\*\* columns\) counted cell by cell: \*\*(\d+)\*\* cells of tree, \*\*(\d+)\*\* of fruit, \*\*(\d+)\*\* of plant\. What it does hold: \*\*([\d,]+)\*\* cells of water, \*\*([\d,]+)\*\* of stone, \*\*([\d,]+)\*\* of sand, \*\*([\d,]+)\*\* of the mountain rock[^,]*, \*\*([\d,]+)\*\* of soil and \*\*([\d,]+)\*\* of grass/,
      [ISLE_STAND, isleStand.id, Math.round(isleStandDist), Math.round(isleStand.r), isleCols, isleTrees, isleFruit, islePlants, isleCells[IWATER] || 0, isleCells[ISTONE] || 0, isleCells[ISAND] || 0, isleCells[IMROCK] || 0, isleCells[ISOIL] || 0, isleCells[IGRASS] || 0]),
    H('what the sea\'s own kinds bear, cell by cell',
      /\|\s*what the sea's own kinds bear\s*\|\s*\*\*(\d+) cells\*\*[^|]*walked — \*\*([\d,]+)\*\* of them, \*\*([\d,]+)\*\* standing above the water line[^|]*answers \*\*(\d+)\*\* times[^|]*\*\*([\d,]+)\*\* such columns over the \*\*(\d+)\*\* bars, and \*\*(\d+)\*\* on the/,
      [cropCells, cropCols, cropDry, cropCells, cropKind.sandbar.dry, cropKind.sandbar.isles, cropCells - cropKind.sandbar.crop],
      /\|\s*what the sea's own kinds bear\s*\|\s*\*\*(\d+) cells\*\*[^|]*walked — \*\*([\d,]+)\*\* of them, \*\*([\d,]+)\*\* standing above the water line[^|]*answers \*\*(\d+)\*\* times[^|]*\*\*([\d,]+)\*\* such columns over the \*\*(\d+)\*\* bars, and \*\*(\d+)\*\* on the/,
      [cropCells, cropCols, cropDry, cropCells, cropKind.sandbar.dry, cropKind.sandbar.isles, cropCells - cropKind.sandbar.crop]),
    H('the least and the most a bar carries, and what this island\'s own ground holds',
      /All \*\*(\d+)\*\* bars carry some, from \*\*(\d+)\*\* cells on the least of them \(ordinal (\d+), \*\*(\d+)\*\* columns of crown\) to \*\*(\d+)\*\* on the most \(ordinal (\d+), \*\*(\d+)\*\*\)\. This island's own authored ground holds \*\*(\d+)\*\* of it, and \*\*(\d+)\*\* cells of the fruit that grows in ground/,
      [cropKind.sandbar.isles, barLeast.crop, barLeast.id, barLeast.dry, barMost.crop, barMost.id, barMost.dry, authored[CROPS[0].id] || 0, authored[N.FRUIT_BY_ID.frogpear.id] || 0],
      /All \*\*(\d+)\*\* bars carry some, from \*\*(\d+)\*\* cells on the least of them \(ordinal (\d+), \*\*(\d+)\*\* columns of crown\) to \*\*(\d+)\*\* on the most \(ordinal (\d+), \*\*(\d+)\*\*\)\. This island's own authored ground holds \*\*(\d+)\*\* of it, and \*\*(\d+)\*\* cells of the fruit that grows in ground/,
      [cropKind.sandbar.isles, barLeast.crop, barLeast.id, barLeast.dry, barMost.crop, barMost.id, barMost.dry, authored[CROPS[0].id] || 0, authored[N.FRUIT_BY_ID.frogpear.id] || 0]),
    H('the nearest island to this one is a bar, and what it carries',
      /The nearest island to this one is one of the bars: ordinal \*\*(\d+)\*\*, foot \*\*([\d.]+) m\*\*,\s*centre \*\*(\d+) m\*\* out, and it carries \*\*(\d+)\*\* of that fruit over \*\*(\d+)\*\* columns of\s+crown/,
      [barNear.id, +barNear.foot.toFixed(1), Math.round(barNear.d), barNear.crop, barNear.dry],
      /The nearest island to this one is one of the bars: ordinal \*\*(\d+)\*\*, foot \*\*([\d.]+) m\*\*,\s*centre \*\*(\d+) m\*\* out, and it carries \*\*(\d+)\*\* of that fruit over \*\*(\d+)\*\* columns of\s+crown/,
      [barNear.id, +barNear.foot.toFixed(1), Math.round(barNear.d), barNear.crop, barNear.dry]),
    H('the range the air gives up its contrast at, and the range the renderer holds',
      /takes 95% of the contrast off at \*\*(\d+) m\*\*[^|]*?keeps\s*\n?\s*chunks out to \*\*(\d+) chunks of (\d+) m = (\d+) m\*\*/,
      [airRange, keepChunks, chunkSize, drawRange],
      /takes 95% of the contrast off at \*\*(\d+) m\*\*[^|]*?keeps\s*\n?\s*chunks out to \*\*(\d+) chunks of (\d+) m = (\d+) m\*\*/,
      [airRange, keepChunks, chunkSize, drawRange]),
    H('the trip a fruit pays for, in seconds, speeds and metres',
      /is \*\*(\d+) s\*\* of frog; a common fruit keeps \*\*([\d,]+) s\*\* in a hand at night/, [frogDur, handKeep],
      /is \*\*(\d+) s\*\* of frog; a common fruit keeps \*\*([\d,]+) s\*\* in a hand at night/, [frogDur, handKeep]),
    H('the speeds that trip is walked at, and the two distances it buys',
      /A frog walks \*\*(\d+\.\d+) m\/s\*\* on land and swims \*\*(\d+\.\d+) m\/s\*\*[^.]*?therefore \*\*(\d+) m\*\* out and back along a shore, and a batch of three is\s*\*\*([\d,]+) m\*\*/,
      [frogWalk, frogSwim, oneFruit, threeFruit],
      /A frog walks \*\*(\d+\.\d+) m\/s\*\* on land and swims \*\*(\d+\.\d+) m\/s\*\*[^.]*?therefore \*\*(\d+) m\*\* out and back along a shore, and a batch of three is\s*\*\*([\d,]+) m\*\*/,
      [frogWalk, frogSwim, oneFruit, threeFruit])
  ];

  const measured = {
    'the row the lake surface stands at': towerFilm,
    'the rows the water body itself occupies': `${wl0}..${wl1}`,
    'how deep the lake stands': `${minD}..${maxD}`,
    'how many water columns the lake holds': wet,
    'what share of them is four blocks or shallower': `${(sh4 / wet * 100).toFixed(1)}%`,
    'what share of them is eight blocks or deeper': `${(deep8 / wet * 100).toFixed(1)}%`,
    'where the deepest column stands and what rows it runs over': `(${deepAt[0]},${deepAt[1]}) y${deepAt[2]}..y${deepAt[3]}`,
    'the deepest bed this world carves': lowestBed,
    'the band the ridge surface falls in, and its mean': `y${rlo}-${rhi} mean ${(rsum / rn).toFixed(2)} over ${rn} in-world columns`,
    'the rows the sunken tower shell spans, and the shell plan it spans': `y${shellLo}..y${shellHi}, ${towerSpan}x${towerSpan}`,
    'the rows the spire stands at': spireRows.join('/'),
    'how far the top of the ruin stands above the water line': ruinAbove,
    'the rows the tower windows occupy': winRows.join('/'),
    'the rows the frog pear hangs on the sills at': sillRows.join('/'),
    'the row the chapter prints for the keep greenhouse door': `the marked door stands at y${crateRow(ghPOI)}, so the marker sits on the deck at y${crateRow(ghPOI) - 1}`,
    'what the island under that door holds, cell by cell': `${underCols} columns x rows y${underLo}..y${underHi} = ${underCells} cells, ${underAir} air, ${underOOB} columns outside the world`,
    'the room the town cellar door opens onto': `${tCols} dark-brick columns, plan ${townSpan[0]}x${townSpan[1]}, air at ${townRows.map(y => 'y' + y).join('/')} over marker y${townPOI.y}, solid at y${townFloor}`,
    'the plan and rows of the glass case the keep holds its demonstration fruit in': `${caseSpan[0]}x${caseSpan[1]}, y${gLo[1]}..y${gHi[1]}, ${gN} glass cells`,
    'how far that case stands from the door that marks it': `${caseFar.toFixed(2)} m from (${ghPOI.x},${ghPOI.z}) to the case centre (${(gLo[0] + gHi[0]) / 2},${(gLo[2] + gHi[2]) / 2})`,
    'what fills the inside of that case, cell by cell': `${caseRoom} cells: ${caseFillLine}`,
    'the spiral: what a turn carries and how much radius it gains': `${ISLES.perTurn} per turn, b ${ISLES.b}, turns ${(2 * Math.PI * ISLES.b).toFixed(1)} m apart, first turn drawn ${(2 * Math.PI * ISLES.b).toFixed(0)}-${(4 * Math.PI * ISLES.b).toFixed(0)} and standing ${isleT1lo.toFixed(0)}-${isleT1hi.toFixed(0)} m out`,
    'the channel every island is held clear of, and the pull along the radius': `keep ${ISLES.keep} m`,
    'how far a centre is pulled off the spiral it was drawn on': `jitter ${ISLES.jitter} m (turn gap ${Math.floor(2 * Math.PI * ISLES.b / 2)} m)`,
    'how many of them stand, and how close the closest two feet come': `${islesUp.length} of ${ORD} ordinals raised, closest foot gap ${isleGap.toFixed(1)} m`,
    'what kinds came out of the mix': Object.keys(isleTypeCount).map(k => `${isleTypeCount[k]} ${k}`).join(', '),
    'the density of islands in each kilometre band, which is the gradient': isleDens.map(d => d.toFixed(2)).join(' / '),
    'the nearest of them, in centre distance and in open water': `${isleNear.toFixed(1)} m to the centre of the nearest, ${isleShore.toFixed(1)} m of open water past this island's shore`,
    'how far a point of open sea stands from the nearest ground': `sampled ${isleFar.length} points, median ${islePct(0.5).toFixed(1)} m, furthest ${islePct(1).toFixed(1)} m`,
    'what stands on the nearest ground big enough to stand on, cell by cell': `ordinal ${isleStand.id}: ${isleCols} columns over a foot of ${isleStand.r.toFixed(1)} m, ${isleTrees} tree cells, ${isleFruit} fruit cells, ${islePlants} plant cells, and by material ${Object.keys(isleCells).map(Number).sort((a, b) => isleCells[b] - isleCells[a]).map(k => `${k}x${isleCells[k]}`).join(' ')}`,
    'what the sea\'s own kinds bear, cell by cell': `${cropCells} crop cells in ${cropCols} columns (${cropDry} above the water line); by kind ${Object.keys(cropKind).map(k => `${k} ${cropKind[k].isles}/${cropKind[k].dry}/${cropKind[k].crop}`).join(' ')}`,
    'the least and the most a bar carries, and what this island\'s own ground holds': `bars carry ${barLeast.crop} (ordinal ${barLeast.id}, ${barLeast.dry} columns) to ${barMost.crop} (ordinal ${barMost.id}, ${barMost.dry}); authored ground ${authored[CROPS[0].id] || 0} of it, ${authored[N.FRUIT_BY_ID.frogpear.id] || 0} of the fruit that grows in ground`,
    'the nearest island to this one is a bar, and what it carries': `ordinal ${barNear.id} at ${barNear.at}, foot ${barNear.foot.toFixed(1)} m, ${Math.round(barNear.d)} m out, ${barNear.crop} cells over ${barNear.dry} columns`,
    'the range the air gives up its contrast at, and the range the renderer holds': `fogDen ${fogDen} (${fogLaw ? 'the shader law is the one this solves' : 'THE SHADER LAW HAS CHANGED'}), 95% at ${airRange} m, renderer holds ${keepChunks} chunks x ${chunkSize} m = ${drawRange} m`,
    'the trip a fruit pays for, in seconds, speeds and metres': `${frogDur} s of frog, ${handKeep} s in hand at night`,
    'the speeds that trip is walked at, and the two distances it buys': `${frogWalk} m/s on land, ${frogSwim} m/s in the water: ${oneFruit} m out and back, ${threeFruit} m for three`
  };

  if (isleNearest.type !== 'sandbar' || isleNearest.id !== barNear.id)
    bad('02 the nearest island to this one', `a ${isleNearest.type}, ordinal ${isleNearest.id}; the nearest bar is ordinal ${barNear.id}`, 'one and the same sand bar, which is what the chapter\'s paragraph says');
  if (!fogLaw) bad('02 the law the air costs contrast by', 'the shader no longer carries `1.0 - exp(-uFogDen*uFogDen*d*d)`', 'the law the chapter\'s 95% range is solved from');

  let badHeights = 0;
  for (const c of CLAIMS) {
    for (const L of LANGS) {
      const md = readIn(L, L.files.zones);
      const m = md.match(L.tag === 'cn' ? c.cnRe : c.enRe);
      const want = L.tag === 'cn' ? c.cnWant : c.enWant;
      if (!m) { bad(`${L.tag} 02 height: ${c.label}`, 'the chapter no longer says it in words this check can read', String(measured[c.label])); badHeights++; continue; }
      for (let i = 0; i < want.length; i++) {
        const got = read(m[i + 1]);
        if (want[i] === null || got !== want[i]) { bad(`${L.tag} 02 height: ${c.label}`, got, want[i]); badHeights++; }
      }
    }
  }
  if (!badHeights) good(`${CLAIMS.length} heights in the map chapter, asked of the world the data generates (seed ${SEED}): ` +
    CLAIMS.map(c => measured[c.label]).join(' | '));

  /* ---- a name the player reads states a room, and the world answers it ----
     This place carried the word for a cellar in every string the game carries
     for it: the name the data gives the marker the minimap is drawn from, and
     the zone's own description. The word promised a room under the keep. The census above
     answers what the island under that door holds, and the answer is 0 air cells
     out of 9,702 -- the island is fill -- so the word came out of the game's own
     strings, in both languages, and the chapter says what stands there instead:
     a glass case shut on all six faces, standing on the deck. The law runs both
     ways, so that neither half of it can be quietly dropped: a place the world
     gives no room may not name one, and a place that names one has to be given
     one, which is why the town's Main Cellar keeps its word -- 80 columns of dark
     brick, three rows of air over its floor, solid over that. Two canaries, one
     per half: put the word back into the zone's description, or take the store's
     room out of the generator, and each half reddens on its own. */
  const saysRoom = [
    ['the keep door marker\'s display name, cn', ghPOI.cn, /地窖/],
    ['the keep door marker\'s display name, en', ghPOI.en, /cellar/i],
    ['the keep zone\'s own description', KEEP.desc, /地窖/]
  ];
  let said = 0, roomBad = 0;
  for (const [what, text, word] of saysRoom) {
    if (typeof text !== 'string') { bad(`02 keep name: ${what}`, 'the game no longer writes it where this check can read it', 'a string the player is shown'); roomBad++; continue; }
    said++;
    if (underAir === 0 && word.test(text)) { bad(`02 keep name: ${what}`, `carries the word ${word} over an island of ${underCells} cells under its own door with ${underAir} of them air`, 'no word for a room, or a room the world gives it'); roomBad++; }
  }
  if (/(地窖|果窖)/.test(townPOI.cn) || /cellar/i.test(townPOI.en)) {
    if (!townRows.length) { bad('02 town cellar name', `the town store is named for a room (${townPOI.cn} / ${townPOI.en}) and the generator builds none: 0 rows of air over its floor in ${tCols} dark-brick columns`, 'the room its name promises'); roomBad++; }
    else if (!tCols) { bad('02 town cellar name', `${tCols} columns of dark brick found inside the town's rect`, 'the box the store is built in'); roomBad++; }
  }
  if (!roomBad) good(`02 a name states a room: the keep's door marker stands over ${underAir} air cells in ${underCols} columns x rows y${underLo}..y${underHi} = ${underCells} of them, so none of the ${said} strings the game says about that place carries the word for a room; ` +
    `the town's Main Cellar does carry it and the world gives it: ${tCols} dark-brick columns, plan ${townSpan[0]}x${townSpan[1]}, air at ${townRows.map(y => 'y' + y).join('/')} over its marker row y${townPOI.y}, solid at y${townFloor}`);
  const discAll = (zn) => {
    let n = 0, out = 0;
    for (let z = zn.cz - zn.r; z <= zn.cz + zn.r; z++) for (let x = zn.cx - zn.r; x <= zn.cx + zn.r; x++) {
      if (Math.hypot(x - zn.cx, z - zn.cz) > zn.r) continue;
      n++;
      if (x < 0 || z < 0 || x >= SZ.w || z >= SZ.d) out++;
    }
    return { n, out };
  };
  const ridgeDisc = discAll(RG);
  good(`every height above is asked only over the columns the world holds: the ridge's disc asks for ${ridgeDisc.n}, and ` +
    `${ridgeDisc.out} of them lie outside a ${SZ.w}x${SZ.d} valley (its centre x${RG.cx} with radius ${RG.r} reaches x${RG.cx + RG.r}) -- ` +
    `read with those columns let in as ground, the same census answers y23-47, mean 33.4`);

  /* ================= 13. the height a marker turns into a height ============
     A marker whose icon is a door names a door the generator marks, and the
     generator marks one by putting a cellar crate in the marker's own column:
     game.js asks the world for `poi.y + 1` when it puts the Main Cellar's store
     down. So the crate has to stand one cell above the marker, in that column.
     Measured on the seed the game opens with: the Main Cellar's crate does stand
     there (marker y20, crate y21); the keep's fruit greenhouse marker did not --
     the generator marks that door with a crate at (78,22,110), in the deck it
     raises over the island, while the marker the chapter printed, and which the
     greenhouse deed turns into a standing band, said y18: four cells under its own door, buried
     in the island's fill. Nothing visible was broken by that: the band the deed derives
     (12..28) happened to cover the deck at y22, so the walk still finished, which
     is exactly how a wrong height survives a suite that never asks one. With the
     marker at its own door the band is 15..31 and still covers the deck.
     Two things this pass also settled, and did not quietly change: the whole
     island under that deck is stone from y3 up -- 0 air cells inside the keep's
     disc below the deck -- so there is no cellar for that door to open onto, and
     the keep's glass case is no room but a glass shell dropped over the corner of
     the rampart, 16 of its 27 inner cells the keep's own brick. Both were reported
     to the human rather than guessed at, and the first of them was answered: a
     place is called what stands there, so the word for a cellar is no longer
     attached to this one in any string the game carries for it. Section 12
     below counts the cells that answer it, and refuses the word wherever the world
     has no room for it. The marker moved because the geometry does: a case laid
     out at the marker the old number named would sit inside the bell tower's
     wall. */
  const doors = [];
  for (const id of ['cellar', 'greenhouse']) {
    const p = N.POIS.find(q => q.id === id);
    const crate = crateRow(p);
    if (crate < 0) bad(`02 door marker ${id}`, `no cellar crate anywhere in column (${p.x},${p.z})`, `the generator marks a door with one`);
    else if (crate !== p.y + 1) bad(`02 door marker ${id}`, `marker y${p.y}, the door it marks stands at y${crate}`, `the crate one cell above the marker, y${p.y + 1}`);
    else doors.push(`${id} marker y${p.y} + the crate at y${crate}`);
  }
  if (doors.length === 2) good(`02 door markers stand at their doors: ${doors.join('; ')}`);

  /* the shape the door belongs to. The chapter promises the keep's fruit stands
     under glass, so the case has to be a case: closed on all six faces, holding a
     fruit. A door in a face would open the box; an empty box would make the
     promise prose. */
  const caseFruit = caseInside.map(b => N.FRUIT_BLOCK[b]).filter(Boolean);
  let caseBad = 0;
  if (caseHoles) { bad('02 keep case', `${caseHoles} of the ${caseShell} cells on the six faces of the box are not glass -- it has an opening`, 'a box closed on all six faces'); caseBad++; }
  if (!caseFruit.length) { bad('02 keep case', `no fruit stands inside the box (its ${caseInside.length} filled cells hold blocks ${caseInside.join(',')})`, 'the demonstration fruit the chapter says stands under glass'); caseBad++; }
  if (gN !== caseShell) { bad('02 keep case', `${gN} glass cells in the keep's disc, ${caseShell} cells on the faces of the box they bound`, 'the two to be the same shape'); caseBad++; }
  if (!caseBad) good(`02 keep case: ${gN} glass cells form one box closed on all six faces, plan ${caseSpan[0]}x${caseSpan[1]} over rows y${gLo[1]}..y${gHi[1]}, holding ${caseFruit.join(', ')} ` +
    `(asked over the keep's square rather than its disc the same census returns ${gSquare} cells, ${gSquare - gN} of them the sunken tower's window panes two zones away); ` +
    `its inside is not a room but the corner of the keep it was built round: ${caseFillLine} of ${caseRoom} cells`);

  const deck = crateRow(ghPOI);
  const bandRe = /p\.y > gh\.y - (\d+) && p\.y < gh\.y \+ (\d+)/;
  const bm2 = bandRe.exec(src);
  if (!bm2) bad('02 greenhouse band', 'the band game.js derives from the marker is no longer written the way this check reads it', 'p.y > gh.y - n && p.y < gh.y + n');
  else if (!(deck > ghPOI.y - +bm2[1] && deck < ghPOI.y + +bm2[2]))
    bad('02 greenhouse band', `the door the deed names stands at y${deck}, outside the band ${ghPOI.y - +bm2[1]}..${ghPOI.y + +bm2[2]}`, `inside it`);
  else good(`02 greenhouse band: the door stands at y${deck}, inside the band game.js derives (${ghPOI.y - +bm2[1]}..${ghPOI.y + +bm2[2]})`);

}

/* ================= 15. the words the life chapter prints, asked of the data ==
   The deed table in 06 s2 prints, in its own two columns, the name of each deed
   and what the valley hands over for it. The names live in game/src/game.js,
   next to the check that seals each deed, and the chapter copies them; the
   handover is an upgrade, so it is copied out of the upgrades table in
   game/data/fruits.js. A deed carries no text the player reads, so neither
   column is ever seen on screen -- and that is exactly why the chapter must be
   compared with the data rather than with the game: every other column of that
   table was checked, and these two were not, so the chapter could name a deed
   or promise a handover in words the game never uses. The set's three deeds,
   name and handover: 6 comparisons over the 6 strings it prints. */
{
  const src = fs.readFileSync(path.join(base, 'src', 'game.js'), 'utf8');
  const ds = deedLines(src);
  if (ds.length !== 3) bad('06 deed text', `the deed list in game.js is no longer written in a shape this check can read (${ds.length} deeds read, 3 expected)`, 'three deeds, each with a name and a handover in the English set');
  else {
    let compared = 0, rowsWrong = 0;
    for (const L of LANGS) {
      const rows = tableAfter(readIn(L, L.files.life), L.heads.life);
      if (!rows) { bad(`[${L.tag}] 06 deed table`, 'missing', L.heads.life); rowsWrong++; continue; }
      if (rows.length !== ds.length) { bad(`[${L.tag}] 06 deed count`, rows.length, ds.length); rowsWrong++; }
      for (const r of rows) {
        const d = ds.find(x => x.id === unbacktick(r[0]));
        if (!d) { bad(`[${L.tag}] 06 deed id`, r[0], 'not in game.js'); rowsWrong++; continue; }
        const u = N.STORAGE.backpack.upgrades.find(x => x.id === ({ cellar: 'pouch1', lake: 'pouch2', greenhouse: 'divider' })[d.id]);
        if (!u) { bad(`[${L.tag}] 06 ${d.id} handover`, 'no upgrade for this deed', 'one of backpack.upgrades'); rowsWrong++; continue; }
        const want = L.tag === 'cn' ? [d.cn, u.cn] : [d.en, u.en];
        for (let i = 0; i < 2; i++) {
          if (r[i + 1] !== want[i]) { bad(`[${L.tag}] 06 ${d.id} ${i ? 'handover' : 'name'}`, r[i + 1], want[i]); rowsWrong++; }
          compared++;
        }
      }
    }
    if (!rowsWrong && compared === 6) good(`06 deed text: the chapter prints the names the data carries -- ${compared} names and handovers compared in the English set`);
  }
}

/* ================= report ================= */
console.log('docs ↔ data 一致性检查 (docs/)');
for (const s of ok) console.log('  ✔ ' + s);
if (problems.length) {
  console.log('\n✘ ' + problems.length + ' 处不一致：');
  for (const p of problems) console.log('  - ' + p);
  process.exit(1);
} else console.log('\n全部一致。');
