# 当前开发状态与交接（2026-11-21）

给下一个接手的 agent：先看这一页，再按需读 `architecture.md` / `conventions.md` / `game-modes.md`。

## 接手先做

1. `git log --oneline -3` 确认当前在 `38f6a5c` 之后；`git status` 里 `.workbuddy/` 和
   `卡包重复校对.md` 是本地/用户文件，不要提交。
2. `npm install && npm run typecheck && npm run lint && npm run build`。
3. 本地用默认 `npm run dev`，**不要加 `--host 127.0.0.1`**（Vite 5.4.8 下会因 `__WS_TOKEN__` 白屏）。
4. 线上验收先看主站 `chess.menoking.top` 的 ☁️ 构建标识，确认是 `rules-20261121-1` 之后的版本。

## 版本与发布

| 项 | 值 |
|---|---|
| 最近功能/构建提交 | `38f6a5c`（`chore: bump build tag to rules-20261121-1`） |
| 当前分支 | `master`（HEAD 是本文档所在的 docs 提交，代码与 `38f6a5c` 一致） |
| 功能提交 | `bfb00fc`（剧本杀 + 不可重复抽取 + 赌局轮盘动画） |
| 构建标识 | `rules-20261121-1`（`src/cloud/diagnostics.ts`） |
| 远端 | `origin/master` 已同步，推送命令 `git push origin master` |
| 线上主站 | `https://chess.menoking.top`，已部署 `rules-20261121-1`，包含 `jubensha` |
| 旧镜像 | `https://cpfly.top` 仍是旧构建，**不要用它验收** |

Vercel 由 `vercel.json` 配置（`npm ci` → `npm run build` → `dist`），推 `master` 会自动部署；
部署完成后先在 ☁️ 面板确认构建标识，再强制刷新。

## 最近完成

### 1. 第 23 个玩法：双人剧本杀（`jubensha`）

- 数据：`src/types/jubensha.ts`（Schema）、`src/data/jubensha/`（`demoScript.ts` 测试本 + `index.ts` 统一导出）。
- 引擎：`src/rules/jubensha.ts`，纯函数状态机，阶段为
  `script_select → role_select → act_reading → act_clues → act_decision → ending_reveal`。
- 视图：`src/components/views/JubenshaModeView.tsx`，同屏 / 联机共用。
- 同屏：顶部切换视角，切换前全屏防偷看遮罩；私密状态用组件内双人槽位。
- 联机：`@s0/@s1` 私有槽 + `sealSubmit`（scope `JubenshaModeView.decision`），
  双方 Ready 后由权威端推进；线索分享写 `sharedClueIds` 公共区。
- 断点：房主 / 同屏端按 `couples-ludo-jubensha:<scriptId>` 立即写 localStorage。
- 接入点：`registry.ts`（hidden + `THEME_FREE_MODES`）、`types/index.ts`、`useGameState.ts` 四张表、
  `HomeView.tsx`（剧情分类）、`App.tsx`、`OnlineStage.tsx`。
- 当前只有一个测试本《零点来电》，2 幕 / 6 条线索 / 1 个终局抉择 / 4 个结局；
  正式样板剧本可直接替换，新增方式见 `game-modes.md`。

### 2. 全玩法「抽取不重复」

- 通用工具：`src/utils/freshPick.ts` 的 `pickFresh(items, used, keyOf)`，抽空自动洗牌。
- 已接：赌局轮盘（分档）、情侣转盘（四维组合 + 主题加码）、真心话大冒险（四池）、
  合作生存（事件 + 任务）、高潮边缘（结算任务）、角色扮演（剧本）、姿势（图片）、
  任务卡牌（同屏 + 联机公共卡池）。
- 落格抽卡共用记录：同屏 `GameState.usedCardKeys` + `chooseRandomTask(theme, used)`；
  联机 `data['cards.drawn']` + `resolveBoardTile` / `createMineTaskEvent` / `completeBingoCellOnBoard`。
- 联机取卡 `cardFor` 改为线性轮转，连续抽会走完整池才回绕。

### 3. 赌局轮盘动画

- `GambleModeView` 用 `requestAnimationFrame` 横向滚动，三次方缓出，停在中央选择线。
- 动画只写 DOM transform，不写共享状态；两端用同一个 `spinSeq` / 目标格各跑本地动画。
- 每档记录已抽条目，转盘上灰显「已抽过」，抽空自动洗牌。

## 验证记录

- `npm run typecheck`：通过。
- `npm run lint`：0 error（16 条历史 warning）。
- `npm run build`：通过。
- Playwright + 系统 Chrome（同屏，430×920）：
  - 剧本杀完整链路走到真结局《同一把伞》；
  - 角色分配、私密线索分享、刷新后「继续上次进度」、防偷看遮罩均通过；
  - 赌局连抽 9 次：前 8 张互不重复、第 9 次自动洗牌，高亮格与结果一致；
  - 角色扮演连抽 4 次得到 4 个不同剧本。
- 联机双设备**未实测**（本机无 Supabase 登录环境）；联机路径按现有 `ModeRuntime` /
  私有槽 / `sealSubmit` 实现，建议下一次接手优先补两台真机回归。

## 已知问题 / 下一步

1. **联机双设备回归**：开两个账号，走一遍剧本杀选角 → 双方 Ready → 分享线索 → 暗投 → 结局。
2. **正式剧本**：目前只有测试本；重点检查线索 `owner` 与 `roleScripts` 的 key 是否与角色 id 对齐。
3. **断点细节**：存档只保存 `JubenshaGame`（阶段 / 幕次 / 已分享线索 / 已揭晓抉择 / 角色），
   Ready 与选角偏好是独立键，刷新后会重置；私密笔记只在失焦时保存。
4. **旧域名**：`cpfly.top` 未更新，若用户从此域名访问会看不到新玩法；需要时在 Vercel 绑定/重定向。
5. **构建标识**：每次发布前改 `src/cloud/diagnostics.ts` 的 `BUILD_TAG`，并同步 README 里的判读文案。

## 不要动 / 不要提交

- `supabase/schema.sql`：本次需求明确不修改表结构。
- `src/data/poseImages.ts`：由 `npm run generate:poses` 生成，不要手改。
- `old-origin` 远程：历史仓库，统一只推 `origin`。
- 工作区里的 `卡包重复校对.md` 是用户文件、`.workbuddy/` 是本地记忆，**不要 `git add -A`**；
  提交时只 add `src`、`docs`、`README.md` 等本次改动路径。
