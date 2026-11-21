# 情侣飞行棋 · 项目文档（面向 agent / 新接手的人）

双人互动游戏合集：**23 个玩法**，支持「一台手机同屏」和「两台设备联机」。
联机不是另写一套，而是复用同屏的同一份规则和同一批视图组件。

## 30 秒速览

| 项 | 值 |
|---|---|
| 技术栈 | React 18 · TypeScript · Vite 5 · Tailwind CSS · lucide-react · Supabase（仅联机/云同步） |
| 仓库 | `https://github.com/menoking/couple-chess`（分支 `master`，推 `origin`） |
| 入口 | `index.html` → `src/main.tsx` → `src/App.tsx` |
| 规则唯一来源 | `src/rules/`（同屏与联机共用的 reducer + 判定函数） |
| 玩法视图 | `src/components/views/*ModeView.tsx`，每个玩法一个，两种模式共用 |
| 联机模型 | **房主权威**：先入房者当房主，独占唯一 `RoomSnapshot`，按座位裁剪后广播 |
| 无云配置 | 全部玩法照常纯本地运行，云功能整体关闭 |
| 构建标识 | `src/cloud/diagnostics.ts` 的 `BUILD_TAG`，用于确认线上是不是新版本 |

## 常用命令

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm run build      # 产物在 dist/
```

> `dev / build / typecheck / lint` 都会先执行 `npm run generate:poses`，
> 它会把姿势图清单生成到 `src/data/poseImages.ts`。**不要手改这个生成文件。**

## 目录速查

| 路径 | 作用 |
|---|---|
| `src/rules/` | 房间 reducer、抽卡状态机、玩法注册表、共享状态 hook、性别座位映射 |
| `src/cloud/` | Supabase 传输、房间选举、联机舞台、云端账号与题库同步、诊断 |
| `src/components/views/` | 23 个玩法视图（同屏 / 联机共用） |
| `src/components/modals/` | 任务卡、炸弹三选一、胜负等弹窗 |
| `src/hooks/useGameState.ts` | **单机**全部状态与开局校验 |
| `src/data/` | 默认题库、故事碎片、生存事件、问答题库、生成好的姿势图清单 |
| `supabase/` | 题库云同步的 SQL（联机本身不依赖它） |
| `scripts/generate-pose-images.mjs` | 扫描姿势图 → 生成 `poseImages.ts` |
| `docs/` | 本目录，agent 阅读入口 |

## 文档索引

- [architecture.md](./architecture.md) — 目录地图、同屏/联机两条链路、房间状态模型、消息可靠性
- [game-modes.md](./game-modes.md) — 23 个玩法清单（是否需要卡包、抽卡规则、回合归属）+ 新增玩法清单
- [conventions.md](./conventions.md) — 必须遵守的约定与高频 bug 模式（**改代码前先看这个**）
- [operations.md](./operations.md) — 环境变量、联机配置、部署、诊断面板判读、常见问题

## 给 agent 的 6 条硬规则

1. **规则只写一处**：判定逻辑放 `src/rules/`，不要在各视图里另写一份，否则同屏与联机会分叉。
2. **共享状态只放可序列化纯数据**：组件、函数、闭包写进 `useModeState` 会被 JSON 序列化成 `{}`，渲染时直接崩（React #130）。
3. **带 `initiatorPlayerId` / `executorPlayerId` 的对象不要写进共享状态**：会被 `extractCard` 当成抽卡改写，本地拿不到值（表现为「点任务没反应、轮次卡死」）。内联任务请用纯文本对象。
4. **随机内容用 `useDeckSeed()` + `seededShuffle()`**：同一个房间号必须算出同一份题库/卡包，不能各自 `Math.random()`。
5. **计时用截止时间戳 + 本地 tick**，共享状态只写 `deadline`；到点由**权威端**推进阶段，不要每秒写共享状态。
6. **破坏性操作先确认**：删玩法、删数据、批量改文件前先列清单等确认；每次改完跑 `typecheck` / `lint` / `build`。
