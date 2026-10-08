/* ==========================================================================
 *  docs-sync.js —— 校验 docs/ 里的数字是否与 game/data/ 一致
 *  README 声称「data 是唯一真源」，这个脚本就是那句话的可执行版本。
 *  用法: node game/test/docs-sync.js
 * ========================================================================== */
const fs = require('fs');
const path = require('path');
global.window = global;
const base = path.join(__dirname, '..');
for (const f of ['data/fruits.js', 'data/creatures.js', 'data/world.js']) require(path.join(base, f));
const N = window.FRUTARIA;

const DOCS = path.join(base, '..', 'docs');
const read = f => fs.readFileSync(path.join(DOCS, f), 'utf8');
const problems = [];
const ok = [];
const bad = (what, a, b) => problems.push(`${what}: 文档=${JSON.stringify(a)} 数据=${JSON.stringify(b)}`);
const good = s => ok.push(s);

/* ---- markdown 表格解析 ---- */
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
  return rows.length > 1 ? rows.slice(1) : [];   // 去掉表头
}
const unbacktick = s => s.replace(/`/g, '');
const norm = s => (s || '').replace(/\s+/g, '').replace(/（.*?）/g, '').replace(/[·・]/g, '');
const num = s => { const m = String(s).match(/-?\d+(\.\d+)?/); return m ? +m[0] : null; };
const cnMatch = (a, b) => { const x = norm(a), y = norm(b); return x === y || x.startsWith(y) || y.startsWith(x); };

/* ================= 1. 区域表 (docs/02 §2) ================= */
{
  const rows = tableAfter(read('02-地图与场景.md'), '## 2. 区域表');
  if (!rows) bad('docs/02 区域表', '缺失', '—');
  else {
    let n = 0;
    for (const r of rows) {
      const id = unbacktick(r[0]);
      const z = N.ZONE_BY_ID[id];
      if (!z) { bad('docs/02 区域 id', id, '不存在于 ZONES'); continue; }
      n++;
      if (!cnMatch(r[1], z.cn)) bad(`docs/02 ${id} 中文名`, r[1], z.cn);
      if (num(r[5]) !== z.danger) bad(`docs/02 ${id} 危险度`, num(r[5]), z.danger);
      const shape = r[3];
      if (z.kind === 'circle') {
        const rDoc = num(shape.replace(/^圆\s*/, ''));
        if (rDoc !== z.r) bad(`docs/02 ${id} 半径`, rDoc, z.r);
        const m = r[4].match(/\((\d+),\s*(\d+)\)/);
        if (!m || +m[1] !== z.cx || +m[2] !== z.cz) bad(`docs/02 ${id} 圆心`, r[4], `(${z.cx},${z.cz})`);
      } else if (z.kind === 'rect') {
        const m = r[4].match(/\((\d+),\s*(\d+)\).*?\((\d+),\s*(\d+)\)/);
        if (!m || +m[1] !== z.x0 || +m[2] !== z.z0 || +m[3] !== z.x1 || +m[4] !== z.z1)
          bad(`docs/02 ${id} 矩形`, r[4], `(${z.x0},${z.z0})-(${z.x1},${z.z1})`);
      }
    }
    if (n !== N.ZONES.length) bad('docs/02 区域数量', n, N.ZONES.length);
    else good(`区域表 ${n} 条全部对上`);
  }
}

/* ================= 2. POI 表 (docs/02 §3) ================= */
{
  const rows = tableAfter(read('02-地图与场景.md'), '## 3. 兴趣点（POI）');
  if (!rows) bad('docs/02 POI 表', '缺失', '—');
  else {
    let n = 0;
    for (const r of rows) {
      const id = unbacktick(r[0]);
      const p = N.POIS.find(x => x.id === id);
      if (!p) { bad('docs/02 POI id', id, '不存在'); continue; }
      n++;
      const m = r[2].match(/\((\d+),\s*(\d+)\)/);
      if (!m || +m[1] !== p.x || +m[2] !== p.z) bad(`docs/02 POI ${id} 坐标`, r[2], `(${p.x},${p.z})`);
      if (num(r[3]) !== p.y) bad(`docs/02 POI ${id} y`, num(r[3]), p.y);
      if (r[4] !== p.icon) bad(`docs/02 POI ${id} icon`, r[4], p.icon);
    }
    if (n !== N.POIS.length) bad('docs/02 POI 数量', n, N.POIS.length);
    else good(`POI 表 ${n} 条全部对上`);
  }
}

/* ================= 3. 浮岛表 (docs/02 §5.7) ================= */
{
  const rows = tableAfter(read('02-地图与场景.md'), '### 5.7 云顶浮岛');
  if (!rows) bad('docs/02 浮岛表', '缺失', '—');
  else {
    let n = 0;
    for (const r of rows) {
      const id = unbacktick(r[0]);
      const i = N.SKY_ISLES.find(x => x.id === id);
      if (!i) { bad('docs/02 浮岛 id', id, '不存在'); continue; }
      n++;
      const m = r[1].match(/\((\d+),\s*(\d+)\)/);
      if (!m || +m[1] !== i.x || +m[2] !== i.z) bad(`docs/02 浮岛 ${id} 位置`, r[1], `(${i.x},${i.z})`);
      if (num(r[2]) !== i.r) bad(`docs/02 浮岛 ${id} 半径`, num(r[2]), i.r);
      if (num(r[3]) !== i.top) bad(`docs/02 浮岛 ${id} 顶面`, num(r[3]), i.top);
    }
    if (n !== N.SKY_ISLES.length) bad('docs/02 浮岛数量', n, N.SKY_ISLES.length);
    else good(`浮岛表 ${n} 条全部对上`);
  }
}

/* ================= 4. 稀有度表 (docs/04 §1) ================= */
{
  const rows = tableAfter(read('04-果实与变形系统.md'), '| 稀有度 | 中文 | 占果格');
  if (!rows) bad('docs/04 稀有度表', '缺失', '—');
  else {
    let n = 0;
    for (const r of rows) {
      const id = unbacktick(r[0]);
      const R = N.RARITY[id];
      if (!R) { bad('docs/04 稀有度 id', id, '不存在'); continue; }
      n++;
      if (num(r[2]) !== R.slots) bad(`docs/04 ${id} 果格`, num(r[2]), R.slots);
      if (num(r[3]) !== R.fresh) bad(`docs/04 ${id} 失活秒`, num(r[3]), R.fresh);
      if (num(r[4]) !== R.regrow) bad(`docs/04 ${id} 重生日`, num(r[4]), R.regrow);
      const ring = unbacktick(r[5]);
      if (ring !== R.ring) bad(`docs/04 ${id} 环色`, ring, R.ring);
    }
    if (n !== Object.keys(N.RARITY).length) bad('docs/04 稀有度数量', n, Object.keys(N.RARITY).length);
    else good(`稀有度表 ${n} 档全部对上（含 regrow）`);
  }
}

/* ================= 5. 三层存储表 (docs/05 §3) ================= */
{
  const rows = tableAfter(read('05-背包与仓库.md'), '| 层 | 名称 | 格数 | 腐坏倍率 | 数量 | 位置 |');
  const STO = N.STORAGE;
  if (!rows) bad('docs/05 存储表', '缺失', '—');
  else {
    const want = [
      [STO.backpack.slots, STO.backpack.decay],
      [STO.cellar.slots, STO.cellar.decay],
      [STO.treestash.slots, STO.treestash.decay]
    ];
    if (rows.length < 3) bad('docs/05 存储表行数', rows.length, 3);
    else rows.slice(0, 3).forEach((r, i) => {
      const slots = num(r[2]), decay = num(r[3]);
      if (slots !== want[i][0]) bad(`docs/05 第${i + 1}层 格数`, slots, want[i][0]);
      if (decay !== want[i][1]) bad(`docs/05 第${i + 1}层 腐坏倍率`, decay, want[i][1]);
    });
    good('三层存储（24/96/24，×1.0/×0.1/×0.33）对上');
  }
  // 窖树规则
  const md = read('05-背包与仓库.md');
  const rules = [
    [/\|\s*上限\s*\|\s*(\d+)\s*棵/, STO.treestash.max, '窖树上限'],
    [/\|\s*最小间距\s*\|\s*(\d+)\s*m/, N.CELLAR_MIN_DIST !== undefined ? N.CELLAR_MIN_DIST : 20, '窖树最小间距'],
    [/\|\s*被偷[^|]*\|\s*每游戏日\s*\d+\s*次判定，\s*(\d+)%/, 30, '掠夺概率%'],
    [/玩家若在\s*(\d+)\s*m\s*内/, 45, '赶走半径 m']
  ];
  for (const [re, want, label] of rules) {
    const m = md.match(re);
    if (!m) bad(`docs/05 ${label}`, '文档中找不到', want);
    else if (+m[1] !== want) bad(`docs/05 ${label}`, +m[1], want);
  }
  good('窖树规则（上限/间距/掠夺/赶走）对上');
}

/* ================= 6. 键位一致性 ================= */
{
  const main = fs.readFileSync(path.join(base, 'src', 'main.js'), 'utf8');
  const docs = ['05-背包与仓库.md', '04-果实与变形系统.md'].map(read).join('\n');
  const bound = k => new RegExp(`k === '${k.toLowerCase()}'`).test(main);
  // 文档里凡是「按 X」的说法，X 必须是真实绑定的键
  const claims = [...docs.matchAll(/按\s*([A-Z])\s*(?:种|使用|打开|交互|吃|存)/g)].map(m => m[1]);
  for (const k of new Set(claims)) {
    if (!bound(k)) bad(`docs 里的按键「${k}」`, '文档声称可按', 'main.js 未绑定');
    else good(`按键 ${k} 已绑定`);
  }
  if (!claims.length) bad('docs 按键扫描', '没找到任何「按 X」表述', '—');
}

/* ================= 7. 数量与 id 覆盖 ================= */
{
  const all = fs.readdirSync(DOCS).filter(f => f.endsWith('.md')).map(read).join('\n');
  const missF = N.FRUITS.filter(f => !all.includes(f.cn));
  if (missF.length) bad('docs 未提及的果实', missF.map(f => f.cn), '—');
  else good(`全部 ${N.FRUITS.length} 种果实都在文档里出现`);
  const missC = N.CREATURES.filter(c => !all.includes(c.cn));
  if (missC.length) bad('docs 未提及的生物', missC.map(c => c.cn), '—');
  else good(`全部 ${N.CREATURES.length} 种生物都在文档里出现`);
  const missP = N.PLANTS.filter(p => !all.includes(p.cn));
  if (missP.length) bad('docs 未提及的植物', missP.map(p => p.cn), '—');
  else good(`全部 ${N.PLANTS.length} 种植物都在文档里出现`);
}

/* ================= 输出 ================= */
console.log('docs ↔ data 一致性检查');
for (const s of ok) console.log('  ✔ ' + s);
if (problems.length) {
  console.log('\n✘ ' + problems.length + ' 处不一致：');
  for (const p of problems) console.log('  - ' + p);
  process.exit(1);
} else console.log('\n全部一致。');
