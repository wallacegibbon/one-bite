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
  ['02-map-and-scenes.md', '| `mirrorlake` | Mirrorlake | 镜湖 | circle r34 | (78,106) |', '| `mirrorlake` | Mirrorlake | 镜湖 | circle r30 | (78,106) |', 'zone radius'],
  ['03-characters-and-creatures.md', '| `thorn` | 刺刺菇 | Thorncap |', '| `thorn` | 刺刺菇 | Thorny Cap |', 'plant name coverage'],
  ['05-backpack-and-storage.md', 'press F to use', 'press Q to use', 'unbound key claim'],
  // each phrase in the docs-sync `cut` list gets its own injection, so deleting
  // one entry from that list makes exactly one of these four go MISSED
  ['04-fruit-and-transformation.md', '### 5.1 The time bar', '### 5.1 The time bar\n\nThe magic stomach also applies.', 'cut design back in (magic stomach)'],
  ['04-fruit-and-transformation.md', '### 5.1 The time bar', '### 5.1 The time bar\n\nA mixed stomach lets both bodies act at once.', 'cut design back in (mixed stomach)'],
  ['04-fruit-and-transformation.md', '### 5.1 The time bar', '### 5.1 The time bar\n\nA mixed form is possible with the right talent.', 'cut design back in (mixed form)'],
  ['04-fruit-and-transformation.md', '### 5.1 The time bar', '### 5.1 The time bar\n\nBeast residue accumulates per form.', 'cut design back in (beast residue)'],
  ['00-overview-and-design-pillars.md', '| Fruits | 4 | 12–16 |', '| Fruits | 5 | 12–16 |', 'scale table fruit count']
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
