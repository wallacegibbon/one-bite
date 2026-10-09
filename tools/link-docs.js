/* (Re)write the cross-language link line under the H1 of every design doc.
   docs/cn/ and docs/en/ are siblings; each document links to its counterpart.
   Idempotent: an existing link line is replaced, not duplicated. */
const fs = require('fs');
const path = require('path');
const DOCS = path.join(__dirname, '..', 'docs');

const PAIRS = {
  'README.md': 'README.md',
  '00-总览与设计支柱.md': '00-overview-and-design-pillars.md',
  '01-世界观与故事.md': '01-worldview-and-story.md',
  '02-地图与场景.md': '02-map-and-scenes.md',
  '03-角色与生物.md': '03-characters-and-creatures.md',
  '04-果实与变形系统.md': '04-fruit-and-transformation.md',
  '05-背包与仓库.md': '05-backpack-and-storage.md',
  '06-任务与进程.md': '06-quests-and-progression.md',
  '07-美术·音频·技术方案.md': '07-art-audio-technical.md'
};

const LINK_RE = /^\*\*(中文|English)\*\* · \[|\[English: |\[中文: /;

function setLink(dir, other, text) {
  const p = path.join(DOCS, dir);
  const lines = fs.readFileSync(p, 'utf8').split('\n');
  // drop any previous link line (it always sits at index 2, blank line at 3)
  if (lines[2] && LINK_RE.test(lines[2])) lines.splice(2, 2);
  lines.splice(2, 0, text, '');
  fs.writeFileSync(p, lines.join('\n'));
  console.log(`${dir} -> ${other}`);
}

for (const [cn, en] of Object.entries(PAIRS)) {
  setLink(path.join('cn', cn), path.join('..', 'en', en),
    cn === 'README.md'
      ? `**中文** · [English: ../en/README.md](../en/README.md)`
      : `[English: ../en/${en}](../en/${en})`);
  setLink(path.join('en', en), path.join('..', 'cn', cn),
    en === 'README.md'
      ? `**English** · [中文: ../cn/README.md](../cn/README.md)`
      : `[中文: ../cn/${cn}](../cn/${cn})`);
}
