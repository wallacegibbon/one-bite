# 万灵果园 · FRUTARIA

**中文** · [English: README.md](README.md)

**体素**魔法探索游戏。这个世界只有一种魔法，它是一种果实。

吃下它，你会变成它所记得的动物，一段时间后复原。你会完整继承那具身体——所有的能力，所有的脆弱。每种动物的果实只长在它自己的地盘上。你的魔法背包只有 **24 个果格**，而越稀有的果实越大颗——**你带不走所有魔法**。

- 完整设定文档：[`docs/cn/`](docs/cn/README.md)（中文）· [`docs/en/`](docs/en/README.md)（English）
- 可玩原型：[`game/index.html`](game/index.html)

## 运行原型

零依赖，直接双击 `game/index.html`（或）：

```bash
cd game && python3 -m http.server 8000   # 然后打开 http://localhost:8000/
```

需要支持 WebGL 1.0 的浏览器。首次加载会分帧生成 100 个区块（约 1–3 秒）。

## 操作

| 键 | 动作 |
|---|---|
| `WASD` | 移动 |
| `Space` | 跳 / 飞（上升）/ 游（上浮） |
| `Shift` | 疾跑 |
| `Ctrl` / `C` | 潜行 / 下降 |
| `E` | 交互（采集 / 开仓库 / 观察生物） |
| `F` | 使用选中物品（吃果实 / 种果核 / 用植物） |
| `R` | 提前结束变形 |
| `V` | 第一 / 第三人称 |
| `J` | 图鉴（果实 / 生物 / 任务） |
| `H` | 帮助 |
| `N` | 给自己起名字（谷地用"称呼"叫你，不用名字） |
| `L` | 切换界面语言（中文 / English） |
| `1`–`9` / 滚轮 | 选择物品 |
| `F5` | 保存（localStorage） |
| `Esc` | 关闭面板 |
| 仓库面板：`E` / `Tab` | 存入 / 取回 |
| 仓库面板：`←` `→` | 选择背包物品；`↑` `↓` 选择仓库物品 |
| 仓库面板：`P` | 让猫头鹰把选中的 1 颗叼回主果窖（仅窖树） |

## 原型已实现

- 160×48×160 体素世界：星坠堡（城堡）、低语林、蘑菇圈、回声丘·蛛洞、深鹿林、北岭·鹰喙峰、镜湖（含水下/沉塔/蛙鸣泽）、灯笼镇、果园遗迹、6 座云顶浮岛、灰雾墙边界
- 7 种果实（5 档稀有度 → 1/2/4/7/12 果格）、腐坏 → 果核 → 种植
- 变形系统：7 种形态，能力切换（体型/速度/跳/游/飞/滑翔/夜视/爬/挖/甲/发光/威吓/水下呼吸/皮肤脱水…）+ 副作用
- 24 果格背包 + 主果窖（96 格，腐坏 ×0.1）+ 窖树（24 格，×0.33，上限 3）
- 背包升级 3 件：副果袋 +6（q1 奖励）、深果袋 +6（沉塔）、银丝隔层（稀有及以上占格 −1，温室）→ 满级 36 格
- 果实方块按稀有度重新结果（1 / 1.5 / 2 / 2.5 / 3 游戏日，±20%），重生队列入档
- 窖树掠夺：每游戏日 30% 判定，熊或灰手套偷走 1–3 颗；玩家在 45 m 内必定赶走（主果窖由老梅看守，不被抢）
- 猫头鹰邮递：窖树 → 主果窖，1 颗 / 3 游戏日 / 10% 丢失，途中按 ×0.1 衰减，在途最多 3 颗
- 7 种生物，态度驱动 AI（对"你现在的形状"反应）
- 身份层，**主角没有固定名字**：稳定 `id`（世界只记这个，窖树带 `owner`）、按作为获得的"称呼"（文案只用它）、可选的玩家自定名字（按 `N`）——按可多人化的方向设计
- 日夜循环（420 s/天）、自发光果实与植物、粒子、旋转小地图、图鉴、7 条任务、死亡掉落与捡回、存档
- **界面语言可切换**（中文 / English，按 `L` 或点 HUD 按钮）：界面文案每种语言一张扁平表，设定文案仍以 `cn`/`en` 成对字段留在记录自己身上，存档里不写任何翻译（07 §3.4）

## 原型未实现（文档已设计）

混合形态、魔力胃完整规则、兽化残留、NPC 对话树、窖树被灰熊拆毁 / 被穿山甲挖根、雨蛙形的皮肤湿度条、音频。

## 目录

```
docs/cn/         设定文档（中文，8 篇 + 索引）
docs/en/         同一套文档的英文版（编号相同）
game/
  index.html     入口
  css/ui.css     HUD 样式
  data/          设定真源：fruits.js / creatures.js / world.js / player.js / i18n.js
  src/           i18n / engine / world / worldgen / models / entities / game / ui / main
  test/          node-smoke / heightmap / probe / docs-sync / docs-drift / shots / play / input / lang
```

## 测试

```bash
./game/test/all.sh             # 跑全部非截图测试，任一失败即非零退出

node game/test/node-smoke.js   # 无浏览器：数据 → 生成 → 网格化（假 GL）
node game/test/probe.js        # 各区域/POI 的取景点与水深
node game/test/docs-sync.js    # 文档 ↔ 数据一致性（中英文两套，不一致 exit 1）
node game/test/docs-drift.js   # 自检：向 docs/en/ 与 docs/ 注入 15 处错误，确认 docs-sync 全部能抓到
node game/test/play.js         # 玩法闭环：采集→重生→容量→变形→存取→窖树→掠夺→邮递→存档
node game/test/upgrade.js      # 背包升级与果格数学
node game/test/input.js        # 真实按键：走/跳/飞/时间/灰雾墙边界
node game/test/lang.js         # 语言切换：屏幕上没有裸 key，存档文件在两种语言下逐字节相同
node game/test/shots.js g      # 20 张截图 → .shots/（区域、变形、UI、身份、每种语言各一张面板）
node game/test/shot.js out.png "pos=136,26,132 cellar=1"   # 单张，肉眼检查
```

后 6 个需要 headless Chrome（`/usr/bin/google-chrome`）与 `puppeteer-core`；SwiftShader 软渲染已验证可用。
