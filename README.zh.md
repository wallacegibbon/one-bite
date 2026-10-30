# 一口 · ONE BITE

**中文** · [English: README.md](README.md)

**体素**魔法探索游戏。这个世界只有一种魔法，它是一种果实。

吃下它，你会变成它所记得的动物，一段时间后复原。你会完整继承那具身体——所有的能力，所有的脆弱。每种动物的果实只长在它自己的地盘上。你的魔法背包只有 **24 个果格**，而越稀有的果实越大颗——**你带不走所有魔法**。

你实际在做的事：找果子，躲开能伤到你的东西，走到没有对的身体就到不了的地方。这背后没有等着被揭开的谜。

- 完整设定文档：[`docs/`](docs/) 下八章，英文一套（索引见下）
- 可玩原型：[`game/index.html`](game/index.html)

## 设定文档

`docs/` 下八章，只保留英文一套；索引由两份根 README（本文件与 `README.md`）分别以中、英各留一份：

| 章节 | 内容 |
|---|---|
| [00-overview-and-design-pillars.md](docs/00-overview-and-design-pillars.md) | 设计支柱、体验目标、反目标、MVP 边界 |
| [01-worldview-and-story.md](docs/01-worldview-and-story.md) | 谷地（它没有名字）、灰雾墙、唯一的魔法、三个机构 |
| [02-map-and-scenes.md](docs/02-map-and-scenes.md) | 区域表、ASCII 地图、垂直分层、果实门禁图、POI |
| [03-characters-and-creatures.md](docs/03-characters-and-creatures.md) | 主角、NPC、生物、态度矩阵、具名生物 |
| [04-fruit-and-transformation.md](docs/04-fruit-and-transformation.md) | 果实全表、形态能力、副作用 |
| [05-backpack-and-storage.md](docs/05-backpack-and-storage.md) | **仓库机制方案（原始需求中未定）**：3 个方案对比 + 推荐设计 |
| [06-quests-and-progression.md](docs/06-quests-and-progression.md) | 三件谷地记得的事（不是任务清单）、为什么没有主线、图鉴、死亡与时间 |
| [07-art-audio-technical.md](docs/07-art-audio-technical.md) | 体素美术规范、调色板、音频、渲染与数据结构 |

`game/test/docs-sync.js` 校验这套文档与 `game/data/` 的一致性：文档里的每个数字都必须是数据里的数字，漂移会让构建失败。

## 运行原型

零依赖，直接双击 `game/index.html`（或）：

```bash
cd game && python3 -m http.server 8000   # 然后打开 http://localhost:8000/
```

需要支持 WebGL 1.0 的浏览器。首次加载会分帧生成 100 个区块（约 1–3 秒）。

脚本只在**打开页面的那一刻**读一次。改完或拉完代码之后要**硬刷新**（Ctrl+Shift+R），或者关掉标签页重新打开：一直开着的标签页跑的还是它打开时的代码，浏览器也可能把 `game.js` 从缓存里端出来。

## 操作

| 键 | 动作 |
|---|---|
| `WASD` | 移动 |
| `Space` | 跳 / 游（上浮） |
| `Shift` | 疾跑 |
| `Ctrl` / `C` | 潜行 / 下降 |
| `E` | 交互（采集 / 开仓库 / 观察生物） |
| `F` | 使用选中物品（吃果实 / 种果核 / 用植物） |
| `R` | 提前结束变形 |
| `V` | 第一 / 第三人称 |
| `J` | 图鉴（果实 / 生物） |
| `H` | 帮助 |
| `N` | 给自己起名字（谷地用"称呼"叫你，不用名字） |
| `L` | 切换界面语言（中文 / English） |
| `1`–`9` / 滚轮 | 选择物品 |
| `Ctrl+S` | 保存（localStorage；页面关闭或藏起来时也会自己保存） |
| `Esc` | 关闭面板 |
| 仓库面板：`E` / `Tab` | 存入 / 取回 |
| 仓库面板：`←` `→` | 选择背包物品；`↑` `↓` 选择仓库物品 |

## 原型是什么

- **160×48×160 体素世界，10 个区域**：星坠堡（湖心岛上的城堡）、低语林、蘑菇圈、回声丘、深鹿林、北岭·鹰喙峰、镜湖（水下 / 沉塔 / 蛙鸣泽）、灯笼镇、果园遗迹，以及作为边界的灰雾墙。
- **1 种果实、1 具身体，一个生态位一只动物**：雨蛙占浅滩与岸边，灯鱼占开阔水面，且只有雨蛙是你能穿的身体。稀有度梯子有 5 档，谷地目前只长其中 1 档（常见）；一颗果实占掉 24 格里的 1 格。
- **变形**：一次只有一具身体。吃下第二颗果实就把身上这具换掉；代价是提前结束的那具身体，和你吃掉的那颗果实。
- **代码真的在读的身体能力**：碰撞体型、走 / 游速度、转弯是一条弧而不是原地掉头（每具身体都带着自己记录上写的那个速率，动物和用它穿出来的身体带的是同一个）、跳跃力、自动上台阶、闭气时长、水下呼吸、离水会干的皮肤、夜视（同一双眼睛在白昼被晃白）、隐蔽、视野角。
- **2 种生物、18 只**（其中 1 种是能穿的身体），态度驱动 AI：它们对"你现在穿着的形状"反应，而且没有任何动物会主动猎你。危险来自水、高度、雾、镜湖的灯，以及你这具身体做不到的事。
- **仓库**：24 果格背包、主果窖（96 格，腐坏 ×0.1）、野外最多 3 棵窖树（24 格，×0.33，彼此至少相距 20 m）。
- **背包升级 3 件**：副果袋 +6（存果之后）、深果袋 +6（从湖里带回蛙果之后）、银丝隔层（稀有果实占格 −1，温室）→ 满级 36 格。
- **腐坏与重新结果**：摘下来的果实会失活（越稀有越快），果核可以种下；结果点按稀有度重新结果（1 / 1.5 / 2 / 2.5 / 3 游戏日，±20%），重生队列入档。
- **没有任务清单，只有三件谷地记得的事**（存果 / 泅镜湖 / 到温室），各给一件背包升级、图鉴、420 秒一天的日夜循环、自发光果实与蘑菇圈、粒子、旋转小地图、死亡掉落与捡回、localStorage 存档。
- **身份层，主角没有固定名字**：稳定 `id`（世界只记这个）、按作为获得的"称呼"（文案只用它）、可选的玩家自定名字（按 `N`）。
- **界面语言可切换**（中文 / English，按 `L` 或点 HUD 按钮）：界面文案每种语言一张扁平表，设定文案仍以 `cn`/`en` 成对字段留在记录自己身上，存档里不写任何翻译（07 §3.4）。

## 文档已设计、原型还没做

NPC 对话树；雨蛙形皮肤湿度的 HUD 条（脱水本身在跑）；程序化音频。文档里还列着几条代码尚未收取的身体代价：爪打不开仓库、体重压裂薄冰、太小够不到高处的果实。`game/test/reach.js` 会把"数据里声明了、代码里没读"的字段全部打印出来，所以这张单子只能靠真的把东西做出来才能缩短。

## 已从设计中删除，不在路线上

混合形态、魔力胃、兽化残留、12 条支线任务、那家贸易公司和它的代理人、主角的果实清单与它的隐藏揭示、空果、偷果贼陷阱、`strength` 与 `tongue` 两个能力，以及穿山甲、鹿、蜘蛛三种动物。这些是决定，不是没做完的活；前四项一旦在任何一种语言里重新出现，`game/test/docs-sync.js` 就会让构建失败。

## 目录

```
docs/            设定文档（英文一套，00–07）
game/
  index.html     入口
  css/ui.css     HUD 样式
  data/          设定真源：fruits.js / creatures.js / world.js / player.js / i18n.js
  src/           i18n / engine / world / worldgen / models / entities / game / ui / main
  test/          见下
```

## 测试

```bash
./game/test/all.sh             # 必须全过的十项，任一失败即非零退出

node game/test/node-smoke.js   # 无浏览器：数据 → 生成 → 网格化（假 GL）
node game/test/probe.js        # 各区域/POI 的取景点与水深
node game/test/reach.js        # 数据里声明的每个字段：要么被代码读到，要么被列成"没做"
node game/test/docs-sync.js    # 文档 ↔ 数据一致性（不一致 exit 1）
node game/test/docs-drift.js   # 自检：向文档注入 29 处错误，确认 docs-sync 每一处都能抓到
node game/test/play.js         # 玩法闭环：采集→重生→容量→变形→存取→窖树→存档
node game/test/save.js         # 存档往返：写入存档、重新加载、从开始界面继续
node game/test/upgrade.js      # 背包升级与果格数学
node game/test/input.js        # 真实按键：走/跳/时间/灰雾墙边界/镜头舒适度
node game/test/lang.js         # 语言切换：屏幕上没有裸 key，存档文件在两种语言下逐字节相同

node game/test/shots.js g      # 21 张截图 → .shots/（区域、变形、UI、身份、每种语言各一张面板、黄昏）
node game/test/shot.js out.png "pos=136,26,132 cellar=1"   # 单张，肉眼检查
node game/test/heightmap.js    # 地形高度图 ASCII 输出，肉眼检查
node game/test/meshbench.js    # 一个区块的网格化开销；是测量，不是测试
```

需要浏览器的那些用 headless Chrome（`/usr/bin/google-chrome`）与 `puppeteer-core`；SwiftShader 软渲染已验证可用。
