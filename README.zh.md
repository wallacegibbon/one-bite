# 万灵果园 · FRUTARIA

**中文** · [English: README.md](README.md)

哈利波特式的**体素**魔法探索游戏 —— 但这个世界**没有魔杖**。

魔法来自**果实**：吃下它，你会变成它所记得的动物，一段时间后复原。每种动物的果实只长在它自己的地盘上。你的魔法背包只有 **24 个果格**，而越稀有的果实越大颗——**你带不走所有魔法**。

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
| `1`–`9` / 滚轮 | 选择物品 |
| `F5` | 保存（localStorage） |
| `Esc` | 关闭面板 |
| 仓库面板：`E` / `Tab` | 存入 / 取回 |
| 仓库面板：`←` `→` | 选择背包物品；`↑` `↓` 选择仓库物品 |
| 仓库面板：`P` | 让猫头鹰把选中的 1 颗叼回主果窖（仅窖树） |

## 原型已实现

- 160×48×160 体素世界：星坠堡（城堡）、低语林、蘑菇圈、蝙蝠洞、圣林、北岭、镜湖（含水下/沉塔/人鱼村）、灯笼镇、果园遗迹、6 座云顶浮岛、灰雾墙边界
- 15 种果实（5 档稀有度 → 1/2/4/7/12 果格）、腐坏 → 果核 → 种植
- 变形系统：14 种形态，能力切换（体型/速度/跳/游/飞/滑翔/夜视/爬/发光/威吓/水下呼吸…）+ 副作用
- 24 果格背包 + 主果窖（96 格，腐坏 ×0.1）+ 窖树（24 格，×0.33，上限 3）
- 背包升级 3 件：副果袋 +6（q1 奖励）、深果袋 +6（沉塔）、银丝隔层（稀有及以上占格 −1，温室）→ 满级 36 格
- 果实方块按稀有度重新结果（1 / 1.5 / 2 / 2.5 / 3 游戏日，±20%），重生队列入档
- 窖树掠夺：每游戏日 30% 判定，獾或灰手套偷走 1–3 颗；玩家在 45 m 内必定赶走（主果窖由老梅看守，不被抢）
- 猫头鹰邮递：窖树 → 主果窖，1 颗 / 3 游戏日 / 10% 丢失，途中按 ×0.1 衰减，在途最多 3 颗
- 14 种生物，态度驱动 AI（对"你现在的形状"反应）
- 日夜循环（420 s/天）、自发光果实与植物、粒子、旋转小地图、图鉴、7 条任务、死亡掉落与捡回、存档

## 原型未实现（文档已设计）

混合形态、魔力胃完整规则、兽化残留、NPC 对话树、灰雾兽偷格、人鱼归还系统、凤凰/母树化身形态、窖树被熊/龙摧毁、音频。

## 目录

```
docs/cn/         设定文档（中文，8 篇 + 索引）
docs/en/         同一套文档的英文版（编号相同）
game/
  index.html     入口
  css/ui.css     HUD 样式
  data/          设定真源：fruits.js / creatures.js / world.js
  src/           engine / world / worldgen / models / entities / game / ui / main
  test/          node-smoke / heightmap / probe / shots / play / input
```

## 测试

```bash
./game/test/all.sh             # 跑全部非截图测试，任一失败即非零退出

node game/test/node-smoke.js   # 无浏览器：数据 → 生成 → 网格化（假 GL）
node game/test/probe.js        # 各区域/POI 的取景点与水深
node game/test/docs-sync.js    # 文档 ↔ 数据一致性（中英文两套，不一致 exit 1）
node game/test/docs-drift.js   # 自检：向 docs/en/ 与 docs/ 注入 11 处错误，确认 docs-sync 全部能抓到
node game/test/play.js         # 玩法闭环：采集→重生→容量→变形→存取→窖树→掠夺→邮递→存档
node game/test/upgrade.js      # 背包升级与果格数学
node game/test/input.js        # 真实按键：走/跳/飞/时间/灰雾墙边界
node game/test/shots.js g      # 14 张区域截图 → .shots/
node game/test/shot.js out.png "pos=136,26,132 cellar=1"   # 单张，肉眼检查
```

后 5 个需要 headless Chrome（`/usr/bin/google-chrome`）与 `puppeteer-core`；SwiftShader 软渲染已验证可用。
