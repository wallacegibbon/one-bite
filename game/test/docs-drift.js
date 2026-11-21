/* Drift test: inject known errors into docs/ and confirm docs-sync.js reports each one. */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const DOCS = path.join(ROOT, 'docs');
const BAK = path.join(ROOT, '.docs-backup');

const files = fs.readdirSync(DOCS).filter(f => f.endsWith('.md'));
fs.rmSync(BAK, { recursive: true, force: true });
fs.mkdirSync(BAK);
for (const f of files) fs.copyFileSync(path.join(DOCS, f), path.join(BAK, f));

/* Only the files this script actually touched are ever copied back. Restoring
   every chapter from the copy taken at startup -- which is what this did --
   quietly undoes any edit made to a chapter while the script is running: two
   corrections to the technical chapter, made while a full suite was in its
   stride, went missing that way and had to be written again. The copy of a
   chapter that was only *read* is of no use here, and it is a small hazard: a
   file is stale the moment anyone else writes it. */
const touched = new Set();
const restore = () => { for (const f of touched) fs.copyFileSync(path.join(BAK, f), path.join(DOCS, f)); };
const plant = (p, text) => { touched.add(path.basename(p)); fs.writeFileSync(p, text); };
const run = () => {
  try { const out = execSync('node game/test/docs-sync.js', { cwd: ROOT, encoding: 'utf8' }); return { code: 0, out }; }
  catch (e) { return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }; }
};

const DRIFTS = [
  ['04-fruit-and-transformation.md', '| legendary | 传说 | **12** |', '| legendary | 传说 | **11** |', 'legendary slots'],
  ['05-backpack-and-storage.md', '| **96** |', '| **90** |', 'cellar slots'],
  ['05-backpack-and-storage.md', '| Min distance | 20 m |', '| Min distance | 21 m |', 'cellar-tree min distance'],
  ['02-map-and-scenes.md', '| `cellar` | Main Cellar | (136,134) | 20 |', '| `cellar` | Main Cellar | (136,134) | 21 |', 'POI y'],
  ['02-map-and-scenes.md', '| `mirrorlake` | Mirrorlake | 镜湖 | circle r38 | (78,106) |', '| `mirrorlake` | Mirrorlake | 镜湖 | circle r30 | (78,106) |', 'zone radius'],
  ['03-characters-and-creatures.md', '| `cellarseed` | 窖树种 | Cellar Stone |', '| `cellarseed` | 窖树种 | Cellar Seed |', 'plant name coverage'],
  // the creature table: every number in the chapter's row is copied out of
  // game/data/creatures.js by hand, and one of those cells had been copied as a
  // different fact (the population of the valley in place of the record's herd)
  ['03-characters-and-creatures.md', '| 0.9 | 12 | 8 | Frog Pear |', '| 0.9 | 12 | 5 | Frog Pear |', 'the herd the creature table prints'],
  ['03-characters-and-creatures.md', '| 1.8 (swim 4.6, hop 6.0–7.4) |', '| 1.8 (swim 4.6, hop 6.0–7.0) |', 'the two launches of a hop the creature table prints'],
  ['03-characters-and-creatures.md', '| frog | 0.13 |', '| frog | 0.16 |', 'the scale the creature table prints'],
  ['05-backpack-and-storage.md', 'press F to use', 'press Q to use', 'unbound key claim'],
  // each phrase in the docs-sync `cut` list gets its own injection, so deleting
  // one entry from that list makes exactly one of these four go MISSED
  ['04-fruit-and-transformation.md', '### 5.1 The time bar', '### 5.1 The time bar\n\nThe magic stomach also applies.', 'cut design back in (magic stomach)'],
  ['04-fruit-and-transformation.md', '### 5.1 The time bar', '### 5.1 The time bar\n\nA mixed stomach lets both bodies act at once.', 'cut design back in (mixed stomach)'],
  ['04-fruit-and-transformation.md', '### 5.1 The time bar', '### 5.1 The time bar\n\nA mixed form is possible with the right talent.', 'cut design back in (mixed form)'],
  ['04-fruit-and-transformation.md', '### 5.1 The time bar', '### 5.1 The time bar\n\nBeast residue accumulates per form.', 'cut design back in (beast residue)'],
  ['00-overview-and-design-pillars.md', '| Fruits | 2 | 12–16 |', '| Fruits | 3 | 12–16 |', 'scale table fruit count'],
  ['00-overview-and-design-pillars.md', '| Creatures | 2 species (2 with a fruit) |', '| Creatures | 3 species (2 with a fruit) |', 'scale table species count, and how many of them carry a fruit'],
  // the map chapter's heights, which only the world built from data/ can answer.
  // Each of these is a number the chapter carries as a measurement; none of them
  // appears in game/data/, so the table checks above cannot see any of them.
  ['02-map-and-scenes.md', 'Windows on all four faces at **y7/y10/y13**', 'Windows on all four faces at **y7/y10/y12**', 'sunken tower window rows'],
  ['02-map-and-scenes.md', 'over all 2,958 water columns', 'over all 2,959 water columns', 'lake water-column census'],
  ['02-map-and-scenes.md', 'the deepest at (72,83) where the water runs y4..y14', 'the deepest at (72,84) where the water runs y4..y14', 'which column is the lake\'s deepest'],
  ['02-map-and-scenes.md', 'surface is **y23–36** (mean 30', 'surface is **y23–37** (mean 30', 'ridge surface band'],
  // the sea's islands: the rule's constants and the counts of what it built
  ['02-map-and-scenes.md', '| sandbar | 22-45 m | 1.2-2.4 m |', '| sandbar | 22-45 m | 1.2-3.4 m |', 'the crown a kind of island states'],
  // what the piles are made of: a kind states its material now, the chapter names
  // it in words, and test/node-smoke.js walks the cells those blocks end up in
  ['02-map-and-scenes.md', '| reef | 30-70 m | 2.5-4.5 m | rock from that floor to its crown', '| reef | 30-70 m | 2.5-4.5 m | soil from that floor to its crown', 'what a reef is made of'],
  ['02-map-and-scenes.md', '| isle | 70-125 m | 8-14 m | a piece of land that never went under: grass over soil', '| isle | 70-125 m | 8-14 m | a piece of land that never went under: bare sand', 'what a kind that states no pile is made of'],
  ['02-map-and-scenes.md', 'its seven centres actually stand **389-778 m** out', 'its seven centres actually stand **389-798 m** out', 'where the first turn of the spiral actually stands'],
  ['02-map-and-scenes.md', '**70** of 70 ordinals', '**71** of 70 ordinals', 'how many of the spiral\'s ordinals stand as ground'],
  ['02-map-and-scenes.md', '| kinds | 15 sandbars, 16 reefs', '| kinds | 14 sandbars, 16 reefs', 'what kinds the mix built'],
  ['02-map-and-scenes.md', '**3.50** in the 0-1 km band', '**3.60** in the 0-1 km band', 'the island density gradient the rule exists for'],
  ['02-map-and-scenes.md', 'foot **70 m** — has had its whole footprint (**15,421** columns)', 'foot **70 m** — has had its whole footprint (**15,422** columns)', 'the footprint of the island counted cell by cell'],
  ['02-map-and-scenes.md', 'takes 95% of the contrast off at **231 m**', 'takes 95% of the contrast off at **321 m**', 'the range at which the air gives up its contrast'],
  ['02-map-and-scenes.md', '**Greenhouse** y21', '**Greenhouse** y23', 'the row the keep greenhouse marker stands on'],
  // the sea's own kinds bear fruit now: the census of what the piles carry, the
  // spread over the bars, and the nearest bar this island has are all stated as
  // counts in the chapter, and every one of them is a number only the world
  // built from data/ can answer
  ['02-map-and-scenes.md', '**1,233,321** of them, **304,420** standing above the water line', '**1,233,321** of them, **304,421** standing above the water line', 'the crop census: how many columns were walked and how many stand dry'],
  ['02-map-and-scenes.md', '**2,740** such columns over the **15** bars', '**2,741** such columns over the **15** bars', 'the crop census: the sand bars\' crown and how many of them there are'],
  ['02-map-and-scenes.md', 'from **2** cells on the least of them (ordinal 51, **47** columns of crown)', 'from **2** cells on the least of them (ordinal 51, **48** columns of crown)', 'the least a bar carries and which bar it is'],
  ['02-map-and-scenes.md', 'The nearest island to this one is one of the bars: ordinal **1**, foot **26.5 m**', 'The nearest island to this one is one of the bars: ordinal **2**, foot **26.5 m**', 'which island is the nearest one, and that it is a bar'],
  ['02-map-and-scenes.md', 'it carries **4** of that fruit over **107** columns of', 'it carries **4** of that fruit over **108** columns of', 'what the nearest bar actually carries'],
  // the turtle row: the same cells the frog row is checked on, and the one row
  // this round added
  ['03-characters-and-creatures.md', '| 1.45 (swim 6.4; no hop at all) |', '| 1.45 (swim 6.5; no hop at all) |', 'the swim speed the turtle row prints'],
  ['03-characters-and-creatures.md', '| turtle | 0.25 |', '| turtle | 0.26 |', 'the scale the turtle row prints'],
  ['03-characters-and-creatures.md', '| 0.6 | 16 | 3 | Turtle Melon |', '| 0.6 | 16 | 2 | Turtle Melon |', 'the herd the turtle row prints'],
  // what the island under that door holds, and the room the town's door does
  // open onto: the chapter states both as counts, and the counts are what say
  // which of the two places may carry the word for a room
  ['02-map-and-scenes.md', "the keep's **441** columns, from y0 to y21, hold **9,702** cells and **0** of them are air", "the keep's **441** columns, from y0 to y21, hold **9,703** cells and **0** of them are air", 'how much of the island under the keep door is air'],
  ['02-map-and-scenes.md', '9x9 of dark brick with air at y21, y22 and y23, three rows of it', '9x9 of dark brick with air at y21, y22 and y24, three rows of it', 'the room the town cellar door opens onto'],
  ['02-map-and-scenes.md', '**5×5 glass box, from y22 to y26**', '**5×6 glass box, from y22 to y26**', 'the keep glass case plan'],
  ['02-map-and-scenes.md', 'standing 6.3 m from that door', 'standing 7.3 m from that door', 'how far the case stands from its door'],
  ['02-map-and-scenes.md', 'of its 27 inner cells, 16 are the keep\'s own city brick', 'of its 27 inner cells, 15 are the keep\'s own city brick', 'what fills the inside of the keep glass case'],
  // the names the POI table prints: the y, the icon and the coordinates of a
  // marker were compared and its name was not, so a display name could grow a
  // word the world refuses that place and stay green
  ['02-map-and-scenes.md', '| `greenhouse` | Fruit Greenhouse | (78,110) | 21 |', '| `greenhouse` | Fruit Greenhouse (cellar) | (78,110) | 21 |', 'a marker name claiming a room the island has no air for'],
  ['02-map-and-scenes.md', '| `frogshall` | Frogshall | (92,120) | 7 |', '| `frogshall` | Frogshale | (92,120) | 7 |', 'a marker name nothing else in the chapter mentions'],
  // the life chapter's two text columns: the game never prints these strings
  // (a deed carries no text), but the chapter copies the names out of game.js
  // and the handovers out of the data -- a name or a handover the data no
  // longer matches is drift
  ['06-quests-and-progression.md', '| `lake` | Swimming Mirrorlake | Deep Pouch |', '| `lake` | Swimming the mirror lake | Deep Pouch |', 'a deed name the data no longer matches']
];

let missed = 0;
for (const [file, from, to, label] of DRIFTS) {
  const p = path.join(DOCS, file);
  const md = fs.readFileSync(p, 'utf8');
  if (!md.includes(from)) { console.log(`SETUP FAIL: "${from}" not in ${file}`); missed++; continue; }
  plant(p, md.replace(from, to));
  const r = run();
  const reported = r.code !== 0;
  console.log(`${reported ? 'caught ' : 'MISSED '} [${label}] exit=${r.code}`);
  if (!reported) missed++;
  else {
    const line = r.out.split('\n').filter(l => l.trim().startsWith('- ')).slice(0, 3).join(' | ');
    console.log('        ' + line);
  }
  restore();
}

// missing counterpart file
touched.add('07-art-audio-technical.md');   // removed here, so it is the one that has to come back
fs.unlinkSync(path.join(DOCS, '07-art-audio-technical.md'));
{
  const r = run();
  console.log(`${r.code !== 0 ? 'caught ' : 'MISSED '} [missing doc] exit=${r.code}`);
  if (r.code === 0) missed++;
  else console.log('        ' + r.out.split('\n').filter(l => l.trim().startsWith('- ')).join(' | '));
}
restore();

// a stray markdown file left directly in docs/ (the eight numbered docs are the only .md that belong there)
fs.writeFileSync(path.join(ROOT, 'docs', 'stray.md'), '# stray\n');
{
  const r = run();
  console.log(`${r.code !== 0 ? 'caught ' : 'MISSED '} [loose md in docs/] exit=${r.code}`);
  if (r.code === 0) missed++;
  else console.log('        ' + r.out.split('\n').filter(l => l.trim().startsWith('- ')).join(' | '));
}
fs.unlinkSync(path.join(ROOT, 'docs', 'stray.md'));

// a fixed protagonist name must never come back
{
  const f = '03-characters-and-creatures.md', p = path.join(DOCS, f);
  const bak = fs.readFileSync(p, 'utf8');
  plant(p, bak.replace('### The forager (16) — the name is the player\'s', '### Linnaeus (the forager, 16) — the name is the player\'s'));
  const r = run();
  console.log(`${r.code !== 0 ? 'caught ' : 'MISSED '} [fixed protagonist name] exit=${r.code}`);
  if (r.code === 0) missed++;
  else console.log('        ' + r.out.split('\n').filter(l => l.trim().startsWith('- ')).join(' | '));
  plant(p, bak);
}

// identity numbers in the English docs must match IDENTITY
{
  const f = '03-characters-and-creatures.md', p = path.join(DOCS, f);
  const bak = fs.readFileSync(p, 'utf8');
  plant(p, bak.replace('nameMax 16 characters', 'nameMax 20 characters'));
  const r = run();
  console.log(`${r.code !== 0 ? 'caught ' : 'MISSED '} [nameMax drift] exit=${r.code}`);
  if (r.code === 0) missed++;
  else console.log('        ' + r.out.split('\n').filter(l => l.trim().startsWith('- ')).join(' | '));
  plant(p, bak);
}

fs.rmSync(BAK, { recursive: true, force: true });

const clean = run();
console.log(`\nafter restore: exit=${clean.code}`);
console.log(missed ? `\n✘ ${missed} drift(s) not detected` : '\n✔ every injected drift was detected');
process.exitCode = missed || (clean.code === 0 ? 0 : 1);
