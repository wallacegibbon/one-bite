/* Insert a language cross-link line under the H1 of each Chinese design doc. */
const fs = require('fs');
const path = require('path');
const DOCS = path.join(__dirname, '..', 'docs');

const PAIRS = {
  'README.md': 'en/README.md',
  '00-总览与设计支柱.md': 'en/00-overview-and-design-pillars.md',
  '01-世界观与故事.md': 'en/01-worldview-and-story.md',
  '02-地图与场景.md': 'en/02-map-and-scenes.md',
  '03-角色与生物.md': 'en/03-characters-and-creatures.md',
  '04-果实与变形系统.md': 'en/04-fruit-and-transformation.md',
  '05-背包与仓库.md': 'en/05-backpack-and-storage.md',
  '06-任务与进程.md': 'en/06-quests-and-progression.md',
  '07-美术·音频·技术方案.md': 'en/07-art-audio-technical.md'
};

for (const [zh, en] of Object.entries(PAIRS)) {
  const p = path.join(DOCS, zh);
  let md = fs.readFileSync(p, 'utf8');
  if (md.includes('](en/')) { console.log('skip (already linked): ' + zh); continue; }
  const lines = md.split('\n');
  const link = `[English: ${en}](${en})`;
  // README gets the compact "中文 · English" form used at the repo root
  const text = zh === 'README.md' ? `**中文** · ${link}` : link;
  lines.splice(2, 0, text, '');
  fs.writeFileSync(p, lines.join('\n'));
  console.log('linked: ' + zh + ' -> ' + en);
}
