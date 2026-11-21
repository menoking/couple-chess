# 架构

## 目录职责

```
src/
  main.tsx            入口，挂 AppErrorBoundary（崩溃时显示错误而不是黑屏）
  App.tsx             同屏运行时 + 云会话 + 视图路由（Home / 23 个玩法 / 主题页）
  hooks/
    useGameState.ts   单机全部状态：players/themes/turn/board/bingo/mine/taskData…
                      以及 canStartGameMode（开局前校验双方题库是否够用）
  rules/
    registry.ts       玩法注册表（22 条）、免卡包玩法、回合锁前缀、玩法→turn 键映射
    room.ts           唯一对局 reducer：patch / 抽卡 / 大厅 / 回合 / 重开
    cards.ts          抽卡四阶段、extractCard（识别各玩法内嵌任务卡）、viewFor 裁剪
    ModeRuntime.tsx   useModeState / useMyTurn / useModeAuthority / useDeckSeed
    lobby.ts          双方卡包合并去重
    identity.ts       性别 → 座位 / 先手 / 主题包归属
    modeRules.ts      同屏与联机共用的落格、Bingo、扫雷任务构造函数
    jubensha.ts       双人剧本杀状态机：阶段流转 / 选角 / 线索分桶 / 结局匹配 / 断点存档
    types.ts          RoomSnapshot / RoomAction / Seat 等
  cloud/
    client.ts         Supabase 客户端（无 env 时为 null）
    rooms.ts          房间号、Presence 选举房主、心跳、发现同空间的房间
    transport.ts      Supabase Broadcast + 座位频道；本地无云时用 BroadcastChannel 兜底
    useSharedRoom.ts  房主权威运行时：乐观更新、批量上报、节流广播、兜底快照
    OnlineStage.tsx   联机大厅（选包 / 免卡包直接开局）+ 渲染 23 个玩法视图
    diagnostics.ts    BUILD_TAG + 事件日志（真机排查核心）
    useCloud.ts       账号、登录、云端题库同步
  components/views/   23 个玩法视图（*ModeView.tsx）
  data/               题库与内容（storyFragments / survivalEvents / quizQuestions / jubensha 剧本 …）
```

## 两条运行链路

### 同屏（未登录）

```
App.tsx ──useGameState──▶ 各 *ModeView
                            │
                            └─ useModeState(key, initial)
                               无 Provider 时 = 普通 useState
```

`App.tsx` 持有全部状态；玩法视图通过 `useModeState` 读写，行为与 `useState` 完全一致。

### 联机（已登录）

```
App.enterOnline(mode)
  └─ rooms.enterOnlineRoom()       Presence 选举房主 → 返回 mySeat / hostSeat / roles
      └─ <OnlineStage>
          ├─ useSharedRoom()       房主：唯一 RoomSnapshot + reduceRoom + viewFor
          │                       访客：发 action，收自己那份 view
          └─ 同一个 *ModeView      通过 ModeRuntimeProvider 注入 runtime
```

关键点：

- **只有房主 reduce**。访客的每次写入都是 `dispatch(action)` → 房主裁决 → 按座位下发视图。
- **乐观更新**：访客写入先落本地再上报，避免等往返；被房主拒绝时会收到权威快照冲掉本地值。
- **按座位裁剪**：`viewFor(state, seat)` 会过滤 `@s0/@s1` 私有槽，并把卡片按 `projectCards` 裁剪。

## 房间状态模型（RoomSnapshot）

| 字段 | 说明 |
|---|---|
| `seq` | 单调递增，用于丢弃乱序旧快照 |
| `mode` | 玩法 key |
| `turn` / `hostSeat` | 房间回合 / 房主座位 |
| `picks` / `draftPools` / `cardPool` | 大厅选包、双方草稿题库、合并后的公共题库 |
| `lobbyLocked` | 是否已开局（免卡包玩法由 `forceLobby` 直接置真） |
| `cards` / `cardSeq` | 待处理的任务卡队列（四阶段） |
| `data` | 各玩法共享的局部状态，键形如 `BingoModeView.cardPool` |

### 房间动作（RoomAction）

`patch` / `patchBatch`（同一帧合并上报）、`drawCard` / `revealCard` / `ackCard` / `forceCloseCard`、
`sealBid`（拍卖密封出价）、`sealSubmit`（通用密封提交）、`lockLobby` / `unlockLobby` / `forceLobby`、
`endTurn`、`restart`、`replace`。

### 卡片四阶段

`locked`（只有卡背）→ `drawn`（抽卡方可见）→ `revealed`（双方可见）→ ack 出队。
`projectCards` 保证队列里第 2 张之后一律不下发明文，避免提前看到。

## 操作权裁决（房主侧）

前端 `useMyTurn` 只是体验层；**真正裁决在 `reduceRoom`**：

- 严格轮流玩法（点格棋 / 围棋 / 斗兽棋 / 数独 / 吹牛骰）的 `data` 键只有当前回合方能写；
- 对局中改 `turn` 也必须由当前回合方发起（开局定先手例外）；
- `*.cardQueue` / `*.taskData` 属于视图内部实现，**豁免**回合锁，否则队列清不空会无限弹卡；
- 越权写入被拒时，房主会**回发权威快照**，把越权端的乐观值冲掉。

## 消息可靠性

- 上行：同一帧多个 `patch` 合并成一条 `patchBatch`；下行：32ms 窗口合并后广播。
- 频道未 `SUBSCRIBED` 前的座位消息先入队，订阅后补发。
- 房主每 1.5 秒补发一次公共快照（`room-sync`，卡面置空），座位频道丢包也能自愈。
- 收到 `seq` 更小的旧快照直接丢弃（`room:view-stale`）。
- Presence 用**设备号**作 key（不是座位号），才能发现「两台设备抢同一座位」。

## 长对局的状态与存档（双人剧本杀）

剧本杀不靠 turn，而是一条显式阶段链：
`script_select → role_select → act_reading → act_clues → act_decision → ending_reveal`。

- 阶段、幕次、Ready、已分享线索、已揭晓抉择放在一个可序列化的 `JubenshaGame` 对象里，
  `useModeState('JubenshaModeView.game', createEmptyGame)` 读写；同屏 / 联机共用同一份视图。
- 私人状态（角色笔记、已读线索、自己的暗投）走 `@s0/@s1` 私有槽，`viewFor` 会过滤。
- 双方都 Ready 后由权威端推进阶段；抉择走 `sealSubmit`，都提交后房主写 `...decision.revealed`。
- 房主端把 `JubenshaGame` 立即写入 `couples-ludo-jubensha:<scriptId>`（`saveToStorageNow`），
  刷新 / 重进可继续；同屏也是同一套逻辑。不要用延迟队列，否则最后一步会丢。

## 同屏 / 联机的差异边界

| 能力 | 同屏 | 联机 |
|---|---|---|
| 状态源 | `useGameState` | `useSharedRoom`（房主权威） |
| 抽卡弹窗 | 本地 `TaskCardModal` | 公共 `CardGate`（抽卡方先翻，对方随后自动看到） |
| 计时 | 本地 interval | 共享 `deadline` + 本地 tick，权威端推进阶段 |
| 房主退房 | 无此概念 | 快照过期自动清除「对方正在玩」提示，可接管房间 |
