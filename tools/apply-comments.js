/* Rewrite CJK comments in game/ to English, using tools/comment-map.en.json aligned
 * by index with tools/comments.json. Only comment regions are touched; string
 * literals (game content) are left untouched.
 * Usage: node tools/apply-comments.js [--check]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CHECK = process.argv.includes('--check');

const FILES = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === '.shots') continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|html|css)$/.test(e.name)) FILES.push(p);
  }
})(path.join(ROOT, 'game'));

const CJK = /[\u3400-\u9FFF\uF900-\uFAFF\u3000-\u303F\uFF00-\uFFEF]/;

function commentsInLine(line) {
  const out = [];
  let i = 0, str = null;
  while (i < line.length) {
    const c = line[i], n = line[i + 1];
    if (str) {
      if (c === '\\') { i += 2; continue; }
      if (c === str) str = null;
      i++; continue;
    }
    if (c === '"' || c === "'" || c === '`') { str = c; i++; continue; }
    if (c === '/' && n === '/') { out.push({ kind: 'line', from: i }); break; }
    if (c === '/' && n === '*') { out.push({ kind: 'block', from: i }); break; }
    if (line.slice(i, i + 4) === '<!--') { out.push({ kind: 'html', from: i }); break; }
    i++;
  }
  return out;
}

const extracted = JSON.parse(fs.readFileSync(path.join(__dirname, 'comments.json'), 'utf8'));
const english = JSON.parse(fs.readFileSync(path.join(__dirname, 'comment-map.en.json'), 'utf8'));
if (extracted.length !== english.length) {
  console.error(`length mismatch: ${extracted.length} comments vs ${english.length} translations`);
  process.exit(1);
}
const MAP = new Map();
extracted.forEach((e, i) => MAP.set(e.text, english[i]));

let replaced = 0, missed = [];
for (const f of FILES) {
  const src = fs.readFileSync(f, 'utf8');
  const lines = src.split('\n');
  let inBlock = false;
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    let from = -1;
    if (inBlock) {
      from = /^\s*\*/.test(line) ? line.indexOf('*') : line.search(/\S/);
      if (line.includes('*/')) inBlock = false;
    } else if (/^\s*\*\s/.test(line)) {
      from = line.indexOf('*');
    } else {
      const c = commentsInLine(line)[0];
      if (c) {
        from = c.from;
        if (c.kind === 'block' && !line.slice(c.from).includes('*/')) inBlock = true;
      }
    }
    if (from < 0) continue;
    const frag = line.slice(from).trimEnd();
    if (MAP.has(frag)) {
      lines[idx] = line.slice(0, from) + MAP.get(frag);
      replaced++;
    } else if (CJK.test(frag)) {
      missed.push(path.relative(ROOT, f) + ':' + (idx + 1) + '  ' + frag.slice(0, 70));
    }
  }
  if (!CHECK) fs.writeFileSync(f, lines.join('\n'));
}

console.log((CHECK ? 'would replace ' : 'replaced ') + replaced + ' comments');
if (missed.length) {
  console.log('untranslated comment fragments (' + missed.length + '):');
  missed.slice(0, 40).forEach(m => console.log('  ' + m));
  process.exit(1);
}
