/* Drift test: inject known errors into docs/en/ (and docs/ itself) and confirm docs-sync.js reports each one. */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const EN = path.join(ROOT, 'docs', 'en');
const BAK = path.join(ROOT, '.docs-backup');

const files = fs.readdirSync(EN);
fs.rmSync(BAK, { recursive: true, force: true });
fs.mkdirSync(BAK);
for (const f of files) fs.copyFileSync(path.join(EN, f), path.join(BAK, f));

const restore = () => { for (const f of files) fs.copyFileSync(path.join(BAK, f), path.join(EN, f)); };
const run = () => {
  try { const out = execSync('node game/test/docs-sync.js', { cwd: ROOT, encoding: 'utf8' }); return { code: 0, out }; }
  catch (e) { return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }; }
};

const DRIFTS = [
  ['04-fruit-and-transformation.md', '| legendary | 传说 | **12** |', '| legendary | 传说 | **11** |', 'legendary slots'],
  ['05-backpack-and-storage.md', '| **96** |', '| **90** |', 'cellar slots'],
  ['05-backpack-and-storage.md', 'one roll per game day, 30%', 'one roll per game day, 40%', 'raid chance'],
  ['05-backpack-and-storage.md', '| Min distance | 20 m |', '| Min distance | 21 m |', 'cellar-tree min distance'],
  ['05-backpack-and-storage.md', 'takes 1–3 fruits', 'takes 1–4 fruits', 'raid take maximum'],
  ['02-map-and-scenes.md', '| `cellar` | Main Cellar | (136,134) | 20 |', '| `cellar` | Main Cellar | (136,134) | 21 |', 'POI y'],
  ['02-map-and-scenes.md', '| `beamisle` | (40,20) | 11 | 37 |', '| `beamisle` | (40,20) | 11 | 36 |', 'isle top'],
  ['02-map-and-scenes.md', '| `cloudspire` | Cloudspire | 云顶浮岛 | air | y29–40 | 4 |', '| `cloudspire` | Cloudspire | 云顶浮岛 | air | y29–40 | 3 |', 'zone danger'],
  ['02-map-and-scenes.md', '| `mirrorlake` | Mirrorlake | 镜湖 | circle r38 | (78,106) |', '| `mirrorlake` | Mirrorlake | 镜湖 | circle r30 | (78,106) |', 'zone radius'],
  ['03-characters-and-creatures.md', '| `thorn` | 刺刺菇 | Thorncap |', '| `thorn` | 刺刺菇 | Thorny Cap |', 'plant name coverage'],
  ['05-backpack-and-storage.md', 'press F to use', 'press Q to use', 'unbound key claim'],
  // each phrase in the docs-sync `cut` list gets its own injection, so deleting
  // one entry from that list makes exactly one of these four go MISSED
  ['04-fruit-and-transformation.md', '### 5.1 The time bar', '### 5.1 The time bar\n\nThe magic stomach also applies.', 'cut design back in (magic stomach)'],
  ['04-fruit-and-transformation.md', '### 5.1 The time bar', '### 5.1 The time bar\n\nA mixed stomach lets both bodies act at once.', 'cut design back in (mixed stomach)'],
  ['04-fruit-and-transformation.md', '### 5.1 The time bar', '### 5.1 The time bar\n\nA mixed form is possible with the right talent.', 'cut design back in (mixed form)'],
  ['04-fruit-and-transformation.md', '### 5.1 The time bar', '### 5.1 The time bar\n\nBeast residue accumulates per form.', 'cut design back in (beast residue)'],
  ['00-overview-and-design-pillars.md', '| Fruits | 3 | 12–16 |', '| Fruits | 5 | 12–16 |', 'scale table fruit count'],
  // the map chapter's heights, which only the world built from data/ can answer.
  // Each of these is a number the chapter carries as a measurement; none of them
  // appears in game/data/, so the table checks above cannot see any of them.
  ['02-map-and-scenes.md', 'Windows on all four faces at **y7/y10/y13**', 'Windows on all four faces at **y7/y10/y12**', 'sunken tower window rows'],
  ['02-map-and-scenes.md', 'over all 2,970 water columns', 'over all 2,971 water columns', 'lake water-column census'],
  ['02-map-and-scenes.md', 'the deepest at (72,83) where the water runs y4..y14', 'the deepest at (72,84) where the water runs y4..y14', 'which column is the lake\'s deepest'],
  ['02-map-and-scenes.md', '258 columns stand at or above that line', '268 columns stand at or above that line', 'ridge columns at the full-bite line'],
  ['02-map-and-scenes.md', 'surface is **y23–36** (mean 30', 'surface is **y23–37** (mean 30', 'ridge surface band'],
  ['02-map-and-scenes.md', '88% of the ridge\'s columns are already cold', '90% of the ridge\'s columns are already cold', 'ridge cold share'],
  ['02-map-and-scenes.md', 'the 25 bruin figs hang at **y29..37**', 'the 25 bruin figs hang at **y29..38**', 'bruin fig rows'],
  ['02-map-and-scenes.md', 'most of them at 37', 'most of them at 36', 'the row most figs hang at'],
  ['02-map-and-scenes.md', 'isle surfaces 29–40; what stands on them up to 47', 'isle surfaces 29–40; what stands on them up to 46', 'what stands on the isles'],
  ['02-map-and-scenes.md', '**Greenhouse** y21', '**Greenhouse** y23', 'the row the keep greenhouse marker stands on'],
  // what the island under that door holds, and the room the town's door does
  // open onto: the chapter states both as counts, and the counts are what say
  // which of the two places may carry the word for a room
  ['02-map-and-scenes.md', "the keep's **441** columns, from y0 to y21, hold **9,702** cells and **0** of them are air", "the keep's **441** columns, from y0 to y21, hold **9,703** cells and **0** of them are air", 'how much of the island under the keep door is air'],
  ['02-map-and-scenes.md', '9x9 of dark brick with air at y21, y22 and y23, three rows of it', '9x9 of dark brick with air at y21, y22 and y24, three rows of it', 'the room the town cellar door opens onto'],
  ['02-map-and-scenes.md', '**5×5 glass box, from y22 to y26**', '**5×6 glass box, from y22 to y26**', 'the keep glass case plan'],
  ['02-map-and-scenes.md', 'standing 6.3 m from that door', 'standing 7.3 m from that door', 'how far the case stands from its door'],
  ['02-map-and-scenes.md', 'of its 27 inner cells, 16 are the keep\'s own city brick', 'of its 27 inner cells, 15 are the keep\'s own city brick', 'what fills the inside of the keep glass case'],
  // the isles' decks: how thick they are, whether they hold, and what the height
  // the chapter prints for them answers when it is asked of the world instead of
  // read off the table. None of these numbers is in game/data/ either.
  ['02-map-and-scenes.md', 'over the **850** columns of deck the six isles hold inside the valley', 'over the **849** columns of deck the six isles hold inside the valley', 'how many columns of isle deck the valley holds'],
  ['02-map-and-scenes.md', '**850** of them hold at that row and **0** are a hole under it', '**849** of them hold at that row and **1** are a hole under it', 'whether the decks hold where the chapter says they do'],
  ['02-map-and-scenes.md', '**820** answer that row, **30** answer a row above it', '**821** answer that row, **30** answer a row above it', 'what the animals\' rule answers over the decks'],
  ['02-map-and-scenes.md', '**52** of the 850 columns are exactly two cells thick', '**53** of the 850 columns are exactly two cells thick', 'how thick an isle deck is at its rim'],
  ['02-map-and-scenes.md', 'it answers **y46** for the row a body would be set down on, where the deck would set it down at **y38**', 'it answers **y45** for the row a body would be set down on, where the deck would set it down at **y38**', 'the read that takes the top of a column for its floor'],
  ['02-map-and-scenes.md', 'no sky over the column in **470** more, and leaves **662** where', 'no sky over the column in **471** more, and leaves **662** where', 'the isle table\'s row asked of the world as a spawn height'],
  ['02-map-and-scenes.md', 'only **380** of the 850 keep the sky a body built for flight needs', 'only **379** of the 850 keep the sky a body built for flight needs', 'how much deck keeps the sky a flyer needs'],
  ['02-map-and-scenes.md', 'rounds to **1,016** different columns, and **166** of them belong to no isle at all', 'rounds to **1,015** different columns, and **166** of them belong to no isle at all', 'the columns an isle disc sample can round to'],
  ['02-map-and-scenes.md', "a pine's needles over **438** of them", "a pine's needles over **437** of them", 'what crowns the deck where the top-of-column read misses it'],
  // the names the POI table prints: the y, the icon and the coordinates of a
  // marker were compared and its name was not, so a display name could grow a
  // word the world refuses that place and stay green
  ['02-map-and-scenes.md', '| `greenhouse` | Fruit Greenhouse | (78,110) | 21 |', '| `greenhouse` | Fruit Greenhouse (cellar) | (78,110) | 21 |', 'a marker name claiming a room the island has no air for'],
  ['02-map-and-scenes.md', '| `frogshall` | Frogshall | (92,120) | 9 |', '| `frogshall` | Frogshale | (92,120) | 9 |', 'a marker name nothing else in the chapter mentions'],
  // the quest chapter's two text columns: the codex prints these strings, the
  // chapter copies them out of game.js, and every other column of that table
  // was compared while these two were not
  ['06-quests-and-progression.md', "| `q6` | The silver mesh in the greenhouse | go to Starfall's fruit greenhouse, on the deck over the island, and find the silver divider |", "| `q6` | The silver mesh in the cellar | go to Starfall's fruit greenhouse cellar, on the deck over the island, and find the silver divider |", 'a quest title and hint the game no longer shows'],
  ['06-quests-and-progression.md', '| `q2` | Three Owlberries | find 3 Owlberries in the oak hollows of the Whisperwood |', '| `q2` | Three Owlberries | find 4 Owlberries in the oak hollws of the Whisperwood |', 'a quest hint mis-told in the chapter that quotes it']
];

let missed = 0;
for (const [file, from, to, label] of DRIFTS) {
  const p = path.join(EN, file);
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
fs.unlinkSync(path.join(EN, '07-art-audio-technical.md'));
{
  const r = run();
  console.log(`${r.code !== 0 ? 'caught ' : 'MISSED '} [missing en counterpart] exit=${r.code}`);
  if (r.code === 0) missed++;
  else console.log('        ' + r.out.split('\n').filter(l => l.trim().startsWith('- ')).join(' | '));
}
restore();

// a stray markdown file left directly in docs/ (the two language folders must be the only ones)
fs.writeFileSync(path.join(ROOT, 'docs', 'README.md'), '# stray\n');
{
  const r = run();
  console.log(`${r.code !== 0 ? 'caught ' : 'MISSED '} [loose md in docs/] exit=${r.code}`);
  if (r.code === 0) missed++;
  else console.log('        ' + r.out.split('\n').filter(l => l.trim().startsWith('- ')).join(' | '));
}
fs.unlinkSync(path.join(ROOT, 'docs', 'README.md'));

// a fixed protagonist name must never come back (Chinese set)
{
  const CN = path.join(ROOT, 'docs', 'cn'), f = '03-角色与生物.md', p = path.join(CN, f);
  const bak = fs.readFileSync(p, 'utf8');
  fs.writeFileSync(p, bak.replace('### 采集者（16 岁）—— 名字由玩家决定', '### 林奈（Linnaeus，16 岁）'));
  const r = run();
  console.log(`${r.code !== 0 ? 'caught ' : 'MISSED '} [fixed protagonist name] exit=${r.code}`);
  if (r.code === 0) missed++;
  else console.log('        ' + r.out.split('\n').filter(l => l.trim().startsWith('- ')).join(' | '));
  fs.writeFileSync(p, bak);
}

// a design that was cut must stay out of the Chinese docs as well: one
// injection per phrase in the cn `cut` list
{
  const CN = path.join(ROOT, 'docs', 'cn'), f = '04-果实与变形系统.md', p = path.join(CN, f);
  const bak = fs.readFileSync(p, 'utf8');
  for (const [phrase, label] of [['混胃', 'mixed stomach'], ['混合形态', 'mixed form'], ['魔力胃', 'magic stomach'], ['兽化残留', 'beast residue']]) {
    fs.writeFileSync(p, bak.replace('### 5.1 时间条', `### 5.1 时间条\n\n有 \`${phrase}\` 者可得两种身体共存。`));
    const r = run();
    console.log(`${r.code !== 0 ? 'caught ' : 'MISSED '} [cut design back in, cn: ${label}] exit=${r.code}`);
    if (r.code === 0) missed++;
    else console.log('        ' + r.out.split('\n').filter(l => l.trim().startsWith('- ')).join(' | '));
    fs.writeFileSync(p, bak);
  }
}

// identity numbers in the English docs must match IDENTITY
{
  const f = '03-characters-and-creatures.md', p = path.join(EN, f);
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
