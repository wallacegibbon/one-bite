/* Drift test: inject known errors into docs/en/ and confirm docs-sync.js reports each one. */
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
  ['02-map-and-scenes.md', '| `cellar` | Main Cellar | (136,134) | 20 |', '| `cellar` | Main Cellar | (136,134) | 21 |', 'POI y'],
  ['02-map-and-scenes.md', '| `nestisle` | (40,20) | 11 | 37 |', '| `nestisle` | (40,20) | 11 | 36 |', 'isle top'],
  ['02-map-and-scenes.md', '| `cloudspire` | Cloudspire | 云顶浮岛 | air | y29–40 | 4 |', '| `cloudspire` | Cloudspire | 云顶浮岛 | air | y29–40 | 3 |', 'zone danger'],
  ['02-map-and-scenes.md', '| `mirrorlake` | Mirrorlake | 镜湖 | circle r34 | (78,106) |', '| `mirrorlake` | Mirrorlake | 镜湖 | circle r30 | (78,106) |', 'zone radius'],
  ['03-characters-and-creatures.md', '| `thorn` | Thorncap |', '| `thorn` | Thorny Cap |', 'plant name coverage'],
  ['05-backpack-and-storage.md', 'press F to use', 'press Q to use', 'unbound key claim']
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
fs.rmSync(BAK, { recursive: true, force: true });

const clean = run();
console.log(`\nafter restore: exit=${clean.code}`);
console.log(missed ? `\n✘ ${missed} drift(s) not detected` : '\n✔ every injected drift was detected');
process.exitCode = missed || (clean.code === 0 ? 0 : 1);
