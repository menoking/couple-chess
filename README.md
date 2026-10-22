# 情侣飞行棋 · 互动游戏合集 (Couples Ludo & Games)

<!-- Replace the repository URL below if this project moves to another GitHub owner. -->
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmenoking%2Fcouple-chess)

一个专为情侣设计的互动游戏 Web 应用。从经典飞行棋起步，现已成长为包含 **24 种玩法、5 大分类**的情侣互动工具箱：自定义任务卡、主题管理、AI 辅助导入，以及从益智到高尺度挑战的全谱系玩法。

在线预览：[https://couple-flying-chess-pink.vercel.app](https://couple-flying-chess-pink.vercel.app)
原项目地址（本人添加玩法）：[https://github.com/woniu9524/couple-flying-chess](https://github.com/woniu9524/couple-flying-chess)

## ✨ 功能特性

- **24 种玩法 · 5 大分类**：经典、益智、互动、剧情、挑战，首页按分类页签 + 横向滑动选择
- **自定义主题**：创建属于自己的游戏主题，设置惩罚/奖励任务
- **性别适用范围**：主题可设为通用 / 仅男方 / 仅女方，配置阶段智能过滤
- **AI 辅助导入**：复制提示词到 AI 工具生成任务，再粘贴 JSON 导入主题（应用本身不直接调用 AI 服务）
- **121 张姿势图库**：按 11 个姿势类型分目录管理，自动扫描生成索引
- **本地存储**：游戏状态与自定义主题保存在浏览器 LocalStorage，刷新后可继续
- **移动端适配**：响应式设计，手机浏览器体验优先，PC 端同样可用

## 🎮 玩法一览（24 种）

### 经典

| 玩法 | 说明 |
|---|---|
| 飞行棋模式 | 投骰子走棋，落格触发任务 |
| 任务卡牌 | 轮流抽取任务，不用投骰子 |
| 扫雷模式 | 点击方格，触发隐藏事件（真心话 / 大冒险 / 主题任务） |
| 亲密骰子 | 上下骰子组合动作与部位 |
| 情侣转盘 | 随机组合执行者、动作、部位与时长，支持轻柔 / 狂热档位 |
| 姿势模式 | 轮流抽取姿势图片（121 张图库） |

### 益智

| 玩法 | 说明 |
|---|---|
| 情侣 Bingo | 任务排成 Bingo 盘，完成连线拿奖励 |
| 记忆翻牌 | 翻开配对任务卡（每对有独特图案），完成匹配任务 |
| 点格棋 | 连接相邻点闭合格子，闭合者得格并再走一步 |
| 拍卖竞价 | 秘密出价争夺任务，出价高者得，积分 = 难度 + 出价 ÷ 10 |

### 互动

| 玩法 | 说明 |
|---|---|
| 默契问答 | 双方分别作答后同时揭晓，按一致度计分 |
| 限时挑战 | 倒计时内连续完成任务，按数量和难度计分 |
| 节奏挑战 | 跟随节拍器完成互动，失误后执行惩罚 |
| 随机事件 | 抽卡过程中触发交换身份、任务升级、奖励翻倍等事件 |

### 剧情

| 玩法 | 说明 |
|---|---|
| 故事接龙 | 双方轮流抽取情节卡，按故事弧线共同推进 |
| 合作生存 | 共享生命值，连续完成任务抵御随机事件 |
| 盲盒抽奖 | 抽取奖励、任务、交换、免罚、双倍等特殊卡片 |
| 领地争夺 | 5×5 棋盘占领与攻城，满盘按领地数结算 |

### 挑战（高尺度，需双方自愿）

| 玩法 | 说明 |
|---|---|
| 真心话大冒险 | 狂暴版：禁区提问、当众挑战、三连事件，失败受罚 |
| 赌局轮盘 | 转盘压注，赌上「今晚的主权」，输家整晚听差遣 |
| 高潮边缘 | 轮流把对方推到临界点，定力先崩者输 |
| 惩罚九宫格 | 失败在 3×3 落子，先连线者主导整晚，惩罚逐格升级 |
| 秘密翻倍 | 任务卡可选加码：换更刺激任务（尺度升级）或叠加挑战，奖励翻倍 |
| 角色扮演 | 16 套剧本：随机抽人设 + 场景 + 剧情 + 强制台词，即兴演出 |

## 🛠️ 技术栈

- **前端框架**: [React](https://react.dev/) (v18)
- **构建工具**: [Vite](https://vitejs.org/) (v5)
- **编程语言**: [TypeScript](https://www.typescriptlang.org/)
- **样式方案**: [Tailwind CSS](https://tailwindcss.com/)
- **图标库**: [Lucide React](https://lucide.dev/)

## 🚀 快速开始

### 环境要求

- Node.js 20.9 或更高版本
- npm 或 pnpm

### 安装步骤

1. 克隆项目到本地：
   ```bash
   git clone https://github.com/menoking/couple-chess.git
   cd couple-chess
   ```

2. 安装依赖：
   ```bash
   npm install
   # 或者
   pnpm install
   ```

3. 启动开发服务器：
   ```bash
   npm run dev
   # 或者
   pnpm dev
   ```

4. 打开浏览器访问 `http://localhost:5173` 即可开始体验。

### 可用脚本

| 命令 | 说明 |
|---|---|
| `npm run dev` | 启动开发服务器（自动扫描姿势图库） |
| `npm run build` | 生产构建，输出到 `dist/` |
| `npm run preview` | 预览生产构建 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run lint` | ESLint 检查 |
| `npm run generate:poses` | 扫描 `public/img/` 生成姿势图片索引 |

### 部署到 Vercel

1. 点击页面顶部的 **Deploy with Vercel** 按钮，并登录 GitHub 和 Vercel。
2. 在 Vercel 中确认要导入的 GitHub 仓库及项目名称。
3. 点击 **Deploy**。Vercel 会使用仓库中的 `vercel.json` 安装依赖、运行生产构建并发布 `dist/` 目录。

部署按钮使用当前远程仓库 `menoking/couple-chess`。请先将需要部署的提交推送到该 GitHub 仓库；若仓库迁移至其他 owner，请同时更新按钮链接。

## 📂 项目结构

```
src/
├── components/
│   ├── modals/         # 弹窗组件 (任务卡、姿势卡、主题创建/编辑/AI导入等)
│   ├── views/          # 24 个玩法视图 + 首页/主题库
│   └── ...             # 基础组件 (底部导航、标签等)
├── data/               # 静态数据 (默认主题题库、姿势索引、挑战/剧本素材)
├── hooks/              # useGameState 游戏状态管理
├── types/              # TypeScript 类型定义
├── utils/              # 工具函数 (游戏逻辑、存储处理、玩法共享工具)
├── App.tsx             # 根组件与路由
└── main.tsx            # 入口文件
public/
└── img/                # 121 张姿势图片（11 个分类目录）
scripts/
└── generate-pose-images.mjs   # 姿势图库自动扫描脚本
```

## 🎮 使用说明

1. **配置阶段**：在首页选择玩法（24 种，按 5 大分类浏览）；需要题库的模式为双方选择主题。
2. **主题管理**：在「主题库」中创建主题、设置任务，并可将 AI 生成的 JSON 任务列表导入。
3. **游戏进行**：按所选模式的规则进行——掷骰、抽卡、连线、竞价、定力对决等。
4. **结算**：各玩法有独立结算逻辑（积分、领地、格子数、胜者主导等）。

## ⚠️ 内容边界

「挑战」分类包含高尺度成人向内容，所有玩法均遵循 **明确同意、随时可跳过** 原则；请在双方自愿、私密场合下游玩。

## 📄 许可证

当前仓库未包含 `LICENSE` 文件；请以实际发布版本附带的许可证为准。
