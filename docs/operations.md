# 运行与运维

> 当前版本、最近改动和待办见 [status.md](./status.md)。

## 本地开发

```bash
npm install
npm run dev        # http://localhost:5173
```

改完代码建议**重启 dev server** 再验收（Vite 偶尔会缓存旧的依赖预构建）：

```bash
netstat -ano | grep ":5173"     # 找 PID
# 停掉旧进程后
npm run dev
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/
```

> **不要用 `npm run dev -- --host 127.0.0.1`**：当前 Vite 5.4.8 在这个参数下会漏注入
> `__WS_TOKEN__`，浏览器报 `__WS_TOKEN__ is not defined` 并白屏。默认 `npm run dev` 即可。

## 环境变量（可选）

没有配置时**整个云功能关闭，23 个玩法照常纯本地运行**。

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co        # 不要带 /rest/v1/
VITE_SUPABASE_ANON_KEY=eyJ...                     # 用 Publishable / anon key
```

`.env` 已在 `.gitignore` 中；示例见 `.env.example`。

## 云端一次性配置（要做联机才需要）

1. Supabase 新建项目；
2. SQL Editor 整段执行 `supabase/fix-cloud.sql`（幂等，可重复执行；全新项目也可用 `supabase/schema.sql`）
   —— 这一步只影响**题库跨设备同步**，不执行也能双设备联机；
3. `Authentication → Sign In / Providers → Email`：**关闭 Confirm email**
   （账号用的是 `用户名@cfc.local` 这种虚拟邮箱，收不到验证信）；
4. Vercel → Settings → Environment Variables 填上面两个变量（勾 Production）→ **Redeploy**。

内置测试账号：登录面板里一键按钮 **test / test1234**（首次点击自动创建）。

## 仓库与远程

| 项 | 值 |
|---|---|
| `origin`（**推送用**） | `https://github.com/menoking/couple-chess.git` |
| 默认分支 | `master`（推送即触发 Vercel 部署） |
| `old-origin`（历史仓库，**别再推**） | `git@github.com:menoking/couple-flying-chess.git` |
| 上游原始项目 | `https://github.com/woniu9524/couple-flying-chess`（README 第 8 行） |

> `git remote -v` 里会看到 `old-origin` 这个残留远程，容易误推。
> 统一只推 `origin`：`git push origin master`。

部署配置在 `vercel.json`：`npm ci` 安装 → `npm run build` 构建 → 输出 `dist`。
推 `master` 后 Vercel 会自动部署，等状态变成 Ready，再用构建标识确认线上版本（见下一节）。

| 域名 | 状态 |
|---|---|
| `https://chess.menoking.top` | **主站，跟随 `origin/master` 自动部署** |
| `https://cpfly.top` | 旧镜像，仍是旧构建，不要用它验收新功能 |

## 构建与部署

```bash
npm run typecheck
npm run lint
npm run build      # 产物 dist/
```

`vercel.json` 已声明：`npm ci` 安装、`npm run build` 构建、`dist` 输出。
推 `master` 即触发部署。

## 构建标识（很重要）

`src/cloud/diagnostics.ts` 里的 `BUILD_TAG`（当前 `rules-20261121-1`）。
**每次发布前把它和 README 一起改一个值**，否则手机端无法判断自己加载的是不是新版本。

判读方式：打开 ☁️ 面板 → 诊断行第一项就是构建标识。
看不到新标识 = 线上还是旧构建，先等 Vercel 部署完再强刷，别急着复测功能。

## 发布流程（每次改完照着走）

```bash
npm run typecheck && npm run lint && npm run build
git add <本次改动路径>          # 不要 git add -A，工作区有用户文件
git commit -m "feat: ..."
git push origin master
```

1. 等 Vercel 部署完成（Deployments 里最新一条 Ready）；
2. 打开主站 `https://chess.menoking.top`，强刷；
3. 打开 ☁️ → 诊断行确认 `BUILD_TAG` 是刚发布的版本；
4. 确认无误后再让用户验收；如果构建标识没变，先查 Vercel 是否真的部署了这个 commit。

## 诊断面板

☁️ 面板底部「连接诊断」包含：构建标识、云配置、账号/小屋、设备 ID、当前玩法是否支持联机、
上次开局走的分支与原因、房间号 / 房主访客 / 连接状态，以及最近 14 条事件。

常用事件关键字：

| 关键字 | 含义 |
|---|---|
| `room:rejected` | 动作被房主规则拒了（带 key / seat / turn） |
| `room:sync-fallback` | 走了公共频道兜底快照 |
| `room:send-error` | 某个座位下发失败 |
| `room:view-stale` | 丢弃了乱序旧快照（网络抖动信号） |
| `room:seat-conflict` | 两台设备抢同一座位，设备号大的一方会重进让位 |
| `room:host-ready` | 房主成功进入 playing |
| `board:resolve` | 飞行棋一次结算（正常每次摇骰只有一条） |

## 常见问题

| 现象 | 先查什么 |
|---|---|
| 手机还是旧界面 | ☁️ 里的构建标识；Vercel 部署状态 |
| 一直「正在连接房间」 | 两台是否同一账号；8 秒后可点「由我开房」接管；诊断里的 Presence |
| 大厅没有「选卡包」 | 该玩法属于免卡包（姿势/问答/故事/赌局/角色扮演/剧本杀），直接显示「开始游戏」 |
| 抽卡点了没反应 | 诊断 `room:rejected` 的 key 与 turn；是否把 TaskEventData 写进了共享状态 |
| 一直同一方回合 | 该玩法是否忘了 `onEndTurn()`（房间 turn 组），或内部 turn 没翻 |
| 界面退回上一帧 | `room:view-stale` 条数；网络是否在丢包 |
| Supabase 连不上 | 免费项目 7 天不活跃会被暂停，手动恢复 |

## 已知限制

- 题库同步是「后写覆盖」，尽量固定一台设备编辑；
- 房间按「账号 + 玩法」常驻，不是每局新建；
- 「挑战」分类为成人向内容，需双方自愿、可随时跳过；
- 剧本杀目前只有 1 个测试本，联机双设备尚未实测；`cpfly.top` 仍是旧构建。
