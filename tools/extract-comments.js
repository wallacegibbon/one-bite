/* Extract every comment containing CJK from the codebase, so translations can be
 * applied to comment regions only (string literals are game content and stay Chinese).
 * Usage: node tools/extract-comments.js > tools/comments.json
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
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

/* Find comment starts on a line, skipping anything inside a string literal. */
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
    if (c === '/' && n === '/') { out.push({ kind: 'line', text: line.slice(i) }); break; }
    if (c === '/' && n === '*') { out.push({ kind: 'block', text: line.slice(i) }); break; }
    if (line.slice(i, i + 4) === '<!--') { out.push({ kind: 'html', text: line.slice(i) }); break; }
    i++;
  }
  return out;
}

const found = [];
for (const f of FILES) {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  let inBlock = false;
  lines.forEach((line, idx) => {
    if (inBlock) {
      if (CJK.test(line)) found.push({ file: path.relative(ROOT, f), line: idx + 1, text: line.trim(), kind: 'block-cont' });
      if (line.includes('*/')) inBlock = false;
      return;
    }
    if (/^\s*\*\s/.test(line) && CJK.test(line)) {
      found.push({ file: path.relative(ROOT, f), line: idx + 1, text: line.trim(), kind: 'block-cont' });
      return;
    }
    for (const c of commentsInLine(line)) {
      if (c.kind === 'block' && !c.text.includes('*/')) inBlock = true;
      if (!CJK.test(c.text)) continue;
      found.push({ file: path.relative(ROOT, f), line: idx + 1, text: c.text.trim(), kind: c.kind });
    }
  });
}

const uniq = new Map();
for (const f of found) if (!uniq.has(f.text)) uniq.set(f.text, f);
console.log(JSON.stringify([...uniq.values()], null, 1));
console.error('occurrences: ' + found.length + ', unique: ' + uniq.size);
