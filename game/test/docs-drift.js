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

const restore = () => { for (const f of files) fs.copyFileSync(path.join(BAK, f), path.join(DOCS, f)); };
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
  ['05-backpack-and-storage.md', 'press F to use', 'press Q to use', 'unbound key claim'],
  // each phrase in the docs-sync `cut` list gets its own injection, so deleting
  // one entry from that list makes exactly one of these four go MISSED
  ['04-fruit-and-transformation.md', '### 5.1 The time bar', '### 5.1 The time bar\n\nThe magic stomach also applies.', 'cut design back in (magic stomach)'],
  ['04-fruit-and-transformation.md', '### 5.1 The time bar', '### 5.1 The time bar\n\nA mixed stomach lets both bodies act at once.', 'cut design back in (mixed stomach)'],
  ['04-fruit-and-transformation.md', '### 5.1 The time bar', '### 5.1 The time bar\n\nA mixed form is possible with the right talent.', 'cut design back in (mixed form)'],
  ['04-fruit-and-transformation.md', '### 5.1 The time bar', '### 5.1 The time bar\n\nBeast residue accumulates per form.', 'cut design back in (beast residue)'],
  ['00-overview-and-design-pillars.md', '| Fruits | 1 | 12–16 |', '| Fruits | 3 | 12–16 |', 'scale table fruit count'],
  // the map chapter's heights, which only the world built from data/ can answer.
  // Each of these is a number the chapter carries as a measurement; none of them
  // appears in game/data/, so the table checks above cannot see any of them.
  ['02-map-and-scenes.md', 'Windows on all four faces at **y7/y10/y13**', 'Windows on all four faces at **y7/y10/y12**', 'sunken tower window rows'],
  ['02-map-and-scenes.md', 'over all 2,958 water columns', 'over all 2,959 water columns', 'lake water-column census'],
  ['02-map-and-scenes.md', 'the deepest at (72,83) where the water runs y4..y14', 'the deepest at (72,84) where the water runs y4..y14', 'which column is the lake\'s deepest'],
  ['02-map-and-scenes.md', 'surface is **y23–36** (mean 30', 'surface is **y23–37** (mean 30', 'ridge surface band'],
  ['02-map-and-scenes.md', '**Greenhouse** y21', '**Greenhouse** y23', 'the row the keep greenhouse marker stands on'],
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
  fs.writeFileSync(p, md.replace(from, to));
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
  fs.writeFileSync(p, bak.replace('### The forager (16) — the name is the player\'s', '### Linnaeus (the forager, 16) — the name is the player\'s'));
  const r = run();
  console.log(`${r.code !== 0 ? 'caught ' : 'MISSED '} [fixed protagonist name] exit=${r.code}`);
  if (r.code === 0) missed++;
  else console.log('        ' + r.out.split('\n').filter(l => l.trim().startsWith('- ')).join(' | '));
  fs.writeFileSync(p, bak);
}

// identity numbers in the English docs must match IDENTITY
{
  const f = '03-characters-and-creatures.md', p = path.join(DOCS, f);
  const bak = fs.readFileSync(p, 'utf8');
  fs.writeFileSync(p, bak.replace('nameMax 16 characters', 'nameMax 20 characters'));
  const r = run();
  console.log(`${r.code !== 0 ? 'caught ' : 'MISSED '} [nameMax drift] exit=${r.code}`);
  if (r.code === 0) missed++;
  else console.log('        ' + r.out.split('\n').filter(l => l.trim().startsWith('- ')).join(' | '));
  fs.writeFileSync(p, bak);
}

fs.rmSync(BAK, { recursive: true, force: true });

const clean = run();
console.log(`\nafter restore: exit=${clean.code}`);
console.log(missed ? `\n✘ ${missed} drift(s) not detected` : '\n✔ every injected drift was detected');
process.exitCode = missed || (clean.code === 0 ? 0 : 1);
