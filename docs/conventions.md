# 约定与高频坑

这份文件是踩过的坑的浓缩。改代码前扫一眼，能省掉一轮真机复测。

## 1. 共享状态只放可序列化纯数据

`useModeState` 的值要经过 JSON 序列化上报/下发。**组件、函数、闭包、Map/Set 以外的类实例都不能放**。

- 症状：`Minified React error #130 ... args[]=object`（组件类型成了 object）。
- 真实案例：记忆翻牌曾把 lucide 图标组件存进 `board`，同屏正常、联机立刻崩。
- 正确做法：存下标 / 字符串，渲染时查表（`PAIR_ICONS[iconIndex]`）。

## 2. 任务卡对象不要直接写进共享状态

`extractCard` 会识别带 `initiatorPlayerId` / `executorPlayerId`（或 Bingo 的 `lines + task`）的对象，
把它**改写成一公共张卡**，并跳过本地乐观更新。

- 症状：点了「迎接任务」没反应、卡片不弹、轮次永远停在第一轮、占领格子不显示。
- 真实案例：合作生存、领地争夺都因为把 `createViewTaskEvent(...)` 写进 `useModeState` 而卡死。
- 正确做法二选一：
  - 走 `onTaskTrigger(task)`，让公共 `CardGate` 接管（有翻卡/确认动效）；
  - 或者内联展示：存**纯文本对象** `{ text, themeName }`，自己画卡片和「完成 / 跳过」。

## 3. 回合锁与它的豁免

`reduceRoom` 对严格轮流玩法（`TURN_BOUND_PREFIXES`）做最终裁决：非当前回合方写状态会被丢弃，
房主还会回发权威快照冲掉越权端的乐观值。

- 前端 `useMyTurn()` 只是体验层，**不能当作安全边界**。
- `*.cardQueue` / `*.taskData` 是视图内部实现，已豁免回合锁；否则「回合已交给对方」时清空队列会被拒，
  队列永远清不空 → 无限弹卡。
- 症状：一台设备能操作两方、对方能替我叫骰、点了棋盘没反应但诊断里有 `room:rejected`。

## 4. 随机内容必须种子化

题库/卡包/牌堆不要各端 `Math.random()`，也不要「等房主下发再渲染」——后者会卡在「正在同步」。

```ts
const seed = useDeckSeed();                        // 联机 = room:<房间号>，同屏 = 每次进游戏随机
const queue = useModeState('X.queue', () =>
  seededShuffle(pool, `${seed}:x`)                 // 同一房间必然同一份顺序
);
```

- 真实案例：默契问答两人看到不同题、Bingo 抽到不同的牌、记忆翻牌布局不一致。
- 早期用「就绪门槛 + 超时」的方案已被移除：超时会被频繁快照重置，反而永久卡住。

## 5. 计时用 deadline，不要每秒写共享状态

- 共享 `deadline`（时间戳）+ 本机 `setInterval` 算 `remaining`，只驱动重渲染。
- 到点由**权威端**（`useModeAuthority()`）统一推进阶段，避免两端各写一次。
- 真实案例：高潮边缘 `secondsLeft` 每秒写共享状态，被快照覆盖后数字不降；合作生存同理。

## 6. 私有信息走 `scope='seat'`，并按轮次作废

- `useModeState(key, init, 'seat')` → 实际键是 `key@s0` / `key@s1`，`viewFor` 只下发给本人。
- 每轮私有的值要带 `round`：`{ round, value }`，判断「本轮是否已提交」用 `round` 比对。
  （否则「下一题」只清点击那台的答案，另一端会把上一题当成已提交。）
- 竞技类信息（拍卖出价、问答答案、吹牛骰手牌）绝不能放公共 `data`。

## 7. effect 依赖不要直接挂共享对象

快照每 1.5 秒刷新一次会重建对象引用，effect 会被反复触发。

- 症状：数量加减点了就回弹、倒计时被拖慢、任务被重复弹出。
- 正确做法：依赖**签名/布尔**（`bidSig = by:qty:face`、`hasTask = taskData !== null`），
  用 `useRef` 去重，不要依赖 `bid` / `taskData` 对象本身。

## 8. 消息可靠性与乱序

- 上行 `patch` 会在同一帧合并成 `patchBatch`；下行广播合并到 32ms。**不要**在循环里逐条 `dispatch`。
- 收到 `seq` 更小的旧快照必须丢弃（`room:view-stale`），否则界面会退回上一帧。
- 一次性写多个键时，能合并就合并；分散写很容易撞上每秒消息上限，丢掉的那条若是 `turn` 就表现为「对面没跟上」。

## 9. 其它工程约定

- 仓库里的源码是 **CRLF** 行尾；用脚本改写文件时保持原行尾（Python 用 `newline=''`，否则整文件 diff）。
- 不要在 `src/data/poseImages.ts` 上手改——它由 `npm run generate:poses` 生成。
- 新增玩法后同时改：类型联合、注册表、状态层四张表、同屏渲染、联机 `case`、首页分类（见 game-modes.md 清单）。
- 改完固定跑三条：`npm run typecheck`、`npm run lint`、`npm run build`。
