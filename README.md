# 情侣飞行棋 · 互动游戏合集

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmenoking%2Fcouple-chess)

专为情侣设计的互动游戏 Web 应用。

在线预览：[https://chess.menoking.top](https://chess.menoking.top)
原项目：[https://github.com/woniu9524/couple-flying-chess](https://github.com/woniu9524/couple-flying-chess)

## 玩法

**经典**：飞行棋 · 任务卡牌 · 扫雷 · 情侣转盘 · 姿势模式

**益智**：情侣 Bingo · 记忆翻牌 · 点格棋 · 数独 · 九路围棋 · 斗兽棋 · 拍卖竞价

**互动**：默契问答 · 限时挑战 · 吹牛骰 · 吹牛骰

**剧情**：故事接龙 · 合作生存 · 领地争夺

**挑战**：真心话大冒险 · 赌局轮盘 · 高潮边缘 · 惩罚阶梯 · 翻牌赌命 · 角色扮演

## 技术栈

React 18 · TypeScript · Vite · Tailwind CSS · Lucide React

## 快速开始

```bash
npm install
npm run dev
```

访问 `http://localhost:5173`。

```bash
npm run build      # 生产构建
npm run typecheck  # 类型检查
npm run lint       # 代码检查
```

## 部署

点击顶部 **Deploy with Vercel** 按钮，或用仓库中的 `vercel.json` 部署到 Vercel。


## 云同步与联机（可选）

不配置也能玩：24 个玩法默认纯本地。配置后才有「账号 + 题库云同步 + 双设备联机」。

### 一次性配置

1. 在 [Supabase](https://supabase.com) 新建项目
2. SQL Editor 整段执行 `supabase/schema.sql`（可重复执行）
3. **必须关闭邮箱验证**：`Authentication` → `Sign In / Providers` → `Email` → 关掉 **Confirm email**
   （账号用的是「用户名@cfc.local」这种虚拟邮箱，收不到信，所以必须关）
4. Vercel → `Settings` → `Environment Variables`（勾选 Production）：
   - `VITE_SUPABASE_URL`：Supabase → Project Settings → API → Project URL（**不含** `/rest/v1/`）
   - `VITE_SUPABASE_ANON_KEY`：同页面的 **Publishable（anon）** key，不要用 Secret
   - 加完必须 **Redeploy**
5. 验证：首页右上角 ☁️ 点开出现用户名/密码输入框即成功

### 怎么用（没有邀请码）

1. 打开 ☁️ → 输入**用户名 + 密码** → 注册
2. 第二台设备用**同一个用户名密码**登录
3. 两台设备点**同一个玩法** → 自动进入同一个房间
4. 房主由「谁先进房间」决定，界面顶部会标注「房主 / 访客」
5. 对方关了页面导致卡住时，用面板底部「把三个房间的房主都改成我」接管

### 内置测试账号

面板里有一键按钮：**test / test1234**。首次点击会自动创建，之后直接登录。
它和普通账号一样拥有全部功能（本项目没有分级权限），只是多一个「测试账号」标记。

### 已支持联机

| 玩法 | 双设备后解决什么 |
|---|---|
| 吹牛骰 | 各看各的骰子，不用再传手机 |
| 九路围棋 | 各自全屏棋盘，落子实时同步 |
| 斗兽棋 | 同上，吃子与兽穴判定同步 |

### 数据与隔离

- **一个账号一间小屋**：不同账号之间题库、战绩完全隔离
- **退出登录会清空本地对局数据**，避免下一个账号读到上一个账号的内容
- 无损迁移：旧键 `couples-ludo-game-state` 只读复制到 `cfc:` 命名空间，旧键保留可回滚
- 沙盒：URL 加 `?sandbox=1` 使用独立存储
- 备份：面板内可导出 / 导入 JSON

### 已知限制

- Supabase 免费项目连续 7 天不活跃会被自动暂停，需手动恢复
- 题库同步「后写覆盖」，请固定在一台设备上编辑
- 房间是常驻的（按 账号+玩法 固定），不是每局新建

## 说明

「挑战」分类为高尺度成人向内容，请在双方自愿、明确同意、随时可跳过的前提下使用。

## 许可证

仓库未包含 `LICENSE` 文件。
