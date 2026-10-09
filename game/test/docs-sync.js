/* ==========================================================================
 *  docs-sync.js -- checks that the numbers in docs/ match game/data/
 *  The README claims data/ is the single source of truth; this script makes that claim executable.
 *  Both document sets are checked: docs/cn/ (Chinese) and docs/en/ (English),
 *  which are sibling folders. Table column order must stay identical across languages.
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

/* ------------------------------------------------------------------------
 * Two document sets. `nameCol` is the column holding the zone display name,
 * `nameField` the data field it must match, `keyRe` the "press X" phrasing.
 * ------------------------------------------------------------------------ */
const LANGS = [
  {
    tag: 'cn',
    dir: path.join(DOCS, 'cn'),
    files: { zones: '02-地图与场景.md', fruits: '04-果实与变形系统.md', storage: '05-背包与仓库.md' },
    heads: {
      zones: '## 2. 区域表',
      poi: '## 3. 兴趣点（POI）',
      isles: '### 5.7 云顶浮岛',
      rarity: '| 稀有度 | 中文 | 占果格',
      storage: '| 层 | 名称 | 格数 | 腐坏倍率 | 数量 | 位置 |'
    },
    nameField: 'cn',
    // cellar-tree rules are prose/regex claims rather than a table
    scaleFile: '00-总览与设计支柱.md',
    scaleHead: '## 8. 规模',
    scaleLabels: { world: '世界', zones: '区域', fruits: '果实', creatures: '生物', quests: '主线', day: '一天' },
    rules: [
      [/\|\s*上限\s*\|\s*(\d+)\s*棵/, N.STORAGE.treestash.max, '窖树上限'],
      [/\|\s*最小间距\s*\|\s*(\d+)\s*m/, N.STORAGE.treestash.minDist, '窖树最小间距'],
      [/\|\s*被偷[^|]*\|\s*每游戏日\s*\d+\s*次判定，\s*(\d+)%/, pct(N.STORAGE.treestash.raidChance), '掠夺概率%'],
      [/偷走\s*(\d+)\s*–\s*\d+\s*颗/, N.STORAGE.treestash.raidMin, '偷走下限'],
      [/偷走\s*\d+\s*–\s*(\d+)\s*颗/, N.STORAGE.treestash.raidMax, '偷走上限'],
      [/玩家若在\s*(\d+)\s*m\s*内/, N.STORAGE.treestash.raidScareRadius, '赶走半径 m']
    ],
    keyRe: /按\s*([A-Z])\s*(?:种|使用|打开|交互|吃|存|寄)/g,
    nameOf: x => x.cn,
    cut: ['混合形态', '混胃', '魔力胃', '兽化残留']
  },
  {
    tag: 'en',
    dir: path.join(DOCS, 'en'),
    files: { zones: '02-map-and-scenes.md', fruits: '04-fruit-and-transformation.md', storage: '05-backpack-and-storage.md' },
    heads: {
      zones: '## 2. Zone Table',
      poi: '## 3. Points of Interest (POI)',
      isles: '### 5.7 Cloudspire Isles',
      rarity: '| Rarity | English | Slots | Dormancy | Regrow | Ring |',
      storage: '| Tier | Name | Slots | Decay | Count | Location |'
    },
    nameField: 'en',
    scaleFile: '00-overview-and-design-pillars.md',
    scaleHead: '## 8. Scale',
    scaleLabels: { world: 'World', zones: 'Zones', fruits: 'Fruits', creatures: 'Creatures', quests: 'Main line', day: 'One day' },
    rules: [
      [/\|\s*Cap\s*\|\s*(\d+)\s*trees/, N.STORAGE.treestash.max, 'cellar-tree cap'],
      [/\|\s*Min distance\s*\|\s*(\d+)\s*m/, N.STORAGE.treestash.minDist, 'cellar-tree min distance'],
      [/\|\s*Theft[^|]*\|\s*one roll per game day,\s*(\d+)%/, pct(N.STORAGE.treestash.raidChance), 'raid chance %'],
      [/takes\s*(\d+)\s*–\s*\d+\s*fruits/, N.STORAGE.treestash.raidMin, 'raid take minimum'],
      [/takes\s*\d+\s*–\s*(\d+)\s*fruits/, N.STORAGE.treestash.raidMax, 'raid take maximum'],
      [/within\s+(\d+)\s+m/, N.STORAGE.treestash.raidScareRadius, 'scare-off radius m']
    ],
    keyRe: /press\s+`?([A-Z])\b/gi,
    nameOf: x => x.en,
    cut: ['mixed form', 'mixed stomach', 'magic stomach', 'beast residue']
  }
];

const readIn = (L, f) => fs.readFileSync(path.join(L.dir, f), 'utf8');

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
      }
      if (n !== N.POIS.length) bad(`${T} 02 POI count`, n, N.POIS.length);
      else good(`${T} POI table: all ${n} rows match`);
    }
  }

  /* ================= 3. isle table (02 s5.7) ================= */
  {
    const rows = tableAfter(readIn(L, L.files.zones), L.heads.isles);
    if (!rows) bad(`${T} 02 isle table`, 'missing', '—');
    else {
      let n = 0;
      for (const r of rows) {
        const id = unbacktick(r[0]);
        const i = N.SKY_ISLES.find(x => x.id === id);
        if (!i) { bad(`${T} 02 isle id`, id, 'not found'); continue; }
        n++;
        const m = r[1].match(/\((\d+),\s*(\d+)\)/);
        if (!m || +m[1] !== i.x || +m[2] !== i.z) bad(`${T} 02 isle ${id} position`, r[1], `(${i.x},${i.z})`);
        if (num(r[2]) !== i.r) bad(`${T} 02 isle ${id} radius`, num(r[2]), i.r);
        if (num(r[3]) !== i.top) bad(`${T} 02 isle ${id} top`, num(r[3]), i.top);
      }
      if (n !== N.SKY_ISLES.length) bad(`${T} 02 isle count`, n, N.SKY_ISLES.length);
      else good(`${T} isle table: all ${n} rows match`);
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
    good(`${T} cellar-tree rules (cap / distance / raid / scare-off) match`);
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

/* ================= 8. every Chinese doc has an English counterpart ================= */
{
  const CN = path.join(DOCS, 'cn'), EN = path.join(DOCS, 'en');
  const cn = fs.readdirSync(CN).filter(f => f.endsWith('.md'));
  const en = new Set(fs.readdirSync(EN).filter(f => f.endsWith('.md')));
  // pair by the numeric prefix instead of the (translated) file name
  const numPrefix = f => (f.match(/^(\d+)/) || [null, 'README'])[1];
  const enPrefix = new Set([...en].map(numPrefix));
  const missing = cn.map(numPrefix).filter(p => !enPrefix.has(p));
  if (missing.length) bad('docs/en missing', missing, 'one file per doc in docs/cn');
  else good(`docs/en has an English counterpart for all ${cn.length} docs in docs/cn`);
  if (en.size !== cn.length) bad('docs/en file count', en.size, cn.length);
  // docs/ itself must hold nothing but the two language folders
  const loose = fs.readdirSync(DOCS).filter(f => f.endsWith('.md'));
  if (loose.length) bad('docs/ loose files', loose, 'only docs/cn/ and docs/en/ may hold .md');
  else good('docs/ holds only the sibling folders cn/ and en/');
}

/* ================= 9. identity: the protagonist has NO fixed name ================= */
{
  const ID = N.IDENTITY;
  const banned = ['林奈', 'Linnaeus'];   // a fixed protagonist name must never come back
  for (const L of LANGS) {
    const T = `[${L.tag}]`;
    const all = fs.readdirSync(L.dir).filter(f => f.endsWith('.md')).map(f => readIn(L, f)).join('\n');
    for (const w of banned)
      if (all.includes(w)) bad(`${T} fixed protagonist name`, w, 'the protagonist is not named (docs/en/03 s6)');
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
  // the interface language switch is a documented control too (07 s3.4)
  if (!new RegExp(`k === '${N.LOCALE_KEY}'`).test(main)) bad('LOCALE_KEY', N.LOCALE_KEY, 'not bound in main.js');
  else good(`language switch key ${N.LOCALE_KEY} is bound`);
}

/* ================= 10. the mind is never affected (doc 04 in both sets) =================
   A form inherits the animal's body and the world's reaction to that body --
   never a mind. No urges, no compulsions, no truth spells, no hijacked instincts.
   The vocabulary itself is banned in the data and in both doc sets. */
{
  const BANNED = [
    [/忍不住|不受控|无法抗拒|冲动|强迫|强制入睡|说谎|记忆模糊|只想朝北|趋光/g, 'cn'],
    [/\burge\b|compuls|cannot resist|involuntar|inability to lie|forced to tell|memory blur|phototax|irresistib/gi, 'en']
  ];
  const targets = [
    path.join(base, 'data', 'fruits.js'), path.join(base, 'data', 'creatures.js'),
    path.join(base, '..', 'docs', 'cn', '00-总览与设计支柱.md'),
    path.join(base, '..', 'docs', 'cn', '03-角色与生物.md'),
    path.join(base, '..', 'docs', 'cn', '04-果实与变形系统.md'),
    path.join(base, '..', 'docs', 'cn', 'README.md'),
    path.join(base, '..', 'docs', 'en', '00-overview-and-design-pillars.md'),
    path.join(base, '..', 'docs', 'en', '03-characters-and-creatures.md'),
    path.join(base, '..', 'docs', 'en', '04-fruit-and-transformation.md'),
    path.join(base, '..', 'docs', 'en', 'README.md')
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
   (fruits still said 7 after the roster cut; the quest count disagreed with the
   English and Chinese copies of the same row). */
{
  const game = fs.readFileSync(path.join(base, 'src', 'game.js'), 'utf8');
  const want = {
    world: `${N.WORLD.w}×${N.WORLD.h}×${N.WORLD.d}`,
    zones: N.ZONES.length,
    fruits: N.FRUITS.length,
    creatures: N.CREATURES.length,
    quests: (game.match(/\{ id: 'q\d+'/g) || []).length,
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
    if (!miss) good(`${T} scale table: ${N.WORLD.w}×${N.WORLD.h}×${N.WORLD.d}, ${N.ZONES.length} zones, ${N.FRUITS.length} fruits, ${N.CREATURES.length} species, ${want.quests} quests, ${want.dayLen}s day`);
  }
}

/* ================= report ================= */
console.log('docs ↔ data 一致性检查 (docs/cn/ + docs/en/)');
for (const s of ok) console.log('  ✔ ' + s);
if (problems.length) {
  console.log('\n✘ ' + problems.length + ' 处不一致：');
  for (const p of problems) console.log('  - ' + p);
  process.exit(1);
} else console.log('\n全部一致。');
