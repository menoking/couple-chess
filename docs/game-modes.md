# 玩法清单（23 个）

「卡包」列：**需要** = 开局要选主题卡包并从里面抽任务；**免卡包** = 自带内容，进房直接开局。
「回合」列：**内部** = 视图自己维护 `turn`；**房间** = 用房间 turn 并调 `onEndTurn`；**无** = 阶段/次数驱动。

| key | 名称 | 分类 | 卡包 | 回合 | 抽卡 / 内容来源 |
|---|---|---|---|---|---|
| `board` | 飞行棋模式 | public | 需要 | 房间（联机房主独占结算） | 踩对方 / 幸运 / 陷阱各抽 1 张（本局不重复），48 格判胜 |
| `card` | 任务卡牌 | public | 需要 | 房间 | 每回合抽 1 张（本局不重复）；抽卡方先翻，对方随后自动看到 |
| `mine` | 扫雷模式 | hidden | 需要 | 房间 | 任务格抽 1 张自己执行（本局不重复）；炸弹三选一 |
| `roulette` | 情侣转盘 | timed | 需要 | 房间 | 四维组合 + 主题加码均不重复，不额外抽卡 |
| `pose` | 姿势模式 | public | **免** | 房间 | 自带姿势图库，每回合抽 1 张（抽完才洗牌） |
| `bingo` | 情侣 Bingo | public | 需要 | 房间 | 每连成 1 条线抽 1 张（本局不重复），卡包 10 张 |
| `memory` | 记忆翻牌 | timed | 需要 | 房间 | 每配对成功 1 对抽 1 张，对方执行 |
| `gridchess` | 点格棋 | public | 需要 | 内部 | 每闭合 1 格抽 1 张，闭合多格抽多张 |
| `sudoku` | 数独 | timed | 需要 | 内部 | 每填对 1 格抽 1 张，对方执行 |
| `go` | 九路围棋 | public | 需要 | 内部 | 每提满 3 子抽 1 张；终局胜方抽 2 张 |
| `jungle` | 斗兽棋 | public | 需要 | 内部 | 每吃掉 1 个棋子抽 1 张 |
| `auction` | 拍卖竞价 | hidden | 需要 | 无 | 密封出价，双方都确认才公开；竞得者抽 1 张 |
| `quiz` | 默契问答 | hidden | **免** | 无 | 自带题库，双方密封作答，都提交后才揭晓 |
| `timed` | 限时挑战 | timed | 需要 | 无 | 120 秒内连续完成任务，按完成度计分 |
| `bluff` | 吹牛骰 | hidden | 需要 | 内部 | 暗骰 + 叫点，开牌后胜方抽 1 张、败方执行 |
| `story` | 故事接龙 | public | **免** | 无 | 自带 80 张碎片，一局 10 张且不重复 |
| `survival` | 合作生存 | timed | 需要 | 房间 | 事件与任务均不重复；任务内联展示，完成回血加分 |
| `territory` | 领地争夺 | public | 需要 | 房间 | 占领相邻空地 / 攻打相邻敌方领地，抽 1 张自己执行 |
| `trutndare` | 真心话大冒险 | public | 需要 | 房间 | 真心话 / 大冒险 / 主题卡池三选一，各池不重复 |
| `gamble` | 赌局轮盘 | timed | **免** | 无 | 坐庄方选注码，转盘滚到选择线即任务；同档不重复 |
| `edge` | 高潮边缘 | timed | 需要 | 无 | 五级定力阶梯，关卡动作轮换；结算任务不重复 |
| `roleplay` | 角色扮演 | public | **免** | 无 | 自带剧本，抽一张演一段（演过不重复） |
| `jubensha` | 双人剧本杀 | hidden | **免** | 无 | 分幕读本 / 搜证分享 / 密封抉择，按选择组合进入不同结局；断点存 localStorage |

## 按回合归属分组（改代码时最容易踩的地方）

- **内部 turn（5）**：`bluff` `go` `gridchess` `jungle` `sudoku`
  → 视图自己 `setTurn`，**不要**再调 `onEndTurn`；状态键受房主回合锁约束。
- **房间 turn（9）**：`bingo` `card` `memory` `mine` `pose` `roulette` `survival` `territory` `trutndare`
  → 操作完必须 `onEndTurn()`，否则「一直是同一方回合」。
- **无回合（8）**：`auction` `quiz` `timed` `story` `gamble` `edge` `roleplay` `jubensha`
  → 靠阶段 / 次数 / 双方提交推进，不要引入 turn。
- **特例**：`board` 同屏走房间 turn + `GameView` 逐格推进；联机走 `OnlineBoardView`，**只有房主结算**（摇骰 → 移动 → 落格 → 交回合）。

## 免卡包玩法（`THEME_FREE_MODES`）

`pose` `quiz` `story` `gamble` `roleplay` `jubensha` —— 首页不显示选包卡片，联机大厅不要求锁定卡包，
点「开始游戏」走 `forceLobby`（空池）直接进玩法。判断统一走 `needsThemeDecks(mode)`。

## 双人剧本杀（`jubensha`）的阶段与状态

阶段固定为：`script_select → role_select → act_reading → act_clues → act_decision → ending_reveal`。
纯函数状态机在 `src/rules/jubensha.ts`，视图只做渲染。

- **剧本数据**：`src/types/jubensha.ts` 定义 Schema，`src/data/jubensha/` 放剧本；新增剧本只需
  加一个文件并在 `src/data/jubensha/index.ts` 的 `JUBENSHA_SCRIPTS` 里导出，引擎不用改。
- **双人 Ready 锁**：读本 / 搜证阶段各自点「读完 / 搜证完毕」，两人都准备好后由权威端
  (`useModeAuthority`) 统一推进，另一端显示「等待对方…」。
- **私密内容**：角色本、隐藏目标、私密笔记、已读线索放 `@s0` / `@s1` 私有槽
  （`useModeState(key, init, 'seat')`），`viewFor` 过滤后对方拿不到；线索只有本人能分享。
- **密封抉择**：走 `sealSubmit`，`scope = 'JubenshaModeView.decision'`，双方都提交后房主写入
  `JubenshaModeView.decision.revealed`，再据此匹配 `endings[].match`。
- **同屏**：顶部可切换角色视角，切换前弹出全屏防偷看遮罩；私密状态用组件内的双人槽位。
- **断点恢复**：房主/同屏端把 `JubenshaGame` 按 `couples-ludo-jubensha:<scriptId>` 立即写入
  localStorage（`saveToStorageNow`，不走延迟队列）；回到选本页可「继续上次进度」。

## 新增一个玩法的清单

1. `src/types/index.ts`：`GameMode` 与 `GameView` 两个联合加 key。
2. `src/rules/registry.ts`：`MODE_REGISTRY` 加一条（key / label / category / cardRule）；
   若玩法自带内容，加入 `THEME_FREE_MODES`；若自己维护 turn，加入 `TURN_BOUND_PREFIXES` 和 `MODE_TURN_KEY`。
3. `src/hooks/useGameState.ts`：`GAME_MODES` / `VIEW_VALUES` / `MODE_VIEW` / `VIEW_MODE` 四张表补齐。
4. `src/components/views/XxxModeView.tsx`：同屏与联机共用；共享状态一律用 `useModeState`。
5. `src/App.tsx`：加渲染分支（同屏）；`src/cloud/OnlineStage.tsx`：加 `case`（联机）。
6. `src/components/views/HomeView.tsx`：分类、起始按钮文案（可选提示文案）。
7. 跑 `npm run typecheck && npm run lint && npm run build`，再手动过一遍同屏 + 联机。

> 若玩法用「点击触发 + 回合隔离」，在 handler 里加 `if (!canAct) return;` 并禁用按钮；
> 若会弹任务卡，优先走 `onTaskTrigger`（进公共 CardGate），不要自己塞 TaskEventData 到共享状态。
