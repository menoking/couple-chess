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

不配置也能玩：所有玩法默认纯本地，数据只存在本机。配置后才有「家庭账号 + 题库云同步 + 双设备联机」。

### 一次性配置

1. 在 [Supabase](https://supabase.com) 新建项目
2. 打开 SQL Editor，整段执行仓库里的 `supabase/schema.sql`
3. 关闭邮箱验证：`Authentication` → `Sign In / Providers`（旧版为 `Providers`）→ `Email` → 关闭 **Confirm email**
   - 找不到也没关系：不关的话，注册后去邮箱点确认链接同样可以激活
4. 在 Vercel 项目里加环境变量，然后**重新部署**：
   - 路径：项目 → `Settings` → `Environment Variables` → 勾选 Production
   - `VITE_SUPABASE_URL`（Supabase → Project Settings → API → Project URL）
   - `VITE_SUPABASE_ANON_KEY`（同页面 → anon public key，**不要用 service_role**）
   - ⚠️ Vite 的环境变量是构建时注入的，加完必须 Redeploy 才生效
5. 验证配置成功：首页右上角 ☁️ 图标点开应显示登录表单（若仍显示「云服务未配置」，说明变量没生效或没重新部署）
6. 首次使用：在 ☁️ 面板里注册一个家庭账号 → 创建小屋 → 把 6 位邀请码发给对方 → 对方登录后输入邀请码

### 已支持联机

| 玩法 | 双设备后解决什么 |
|---|---|
| 吹牛骰 | 各看各的骰子，不再需要传手机记忆 |
| 九路围棋 | 两台设备各自全屏棋盘，落子实时同步 |
| 斗兽棋 | 同上，吃子与兽穴判定同步 |

### 安全与隔离

- **无损迁移**：旧的 `couples-ludo-game-state` 会复制到 `cfc:` 命名空间，**旧键保留不删**，随时可回滚
- **沙盒模式**：URL 加 `?sandbox=1` 使用完全独立的存储与测试小屋，正式数据零影响
- **备份**：云面板里可「导出 / 导入数据」（JSON）

### 已知限制

- Supabase 免费项目连续 7 天不活跃会被自动暂停，需去后台手动恢复
- 题库同步采用「后写覆盖」，请固定在一台设备上编辑题库


## 说明

「挑战」分类为高尺度成人向内容，请在双方自愿、明确同意、随时可跳过的前提下使用。

## 许可证

仓库未包含 `LICENSE` 文件。
