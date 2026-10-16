# 情侣飞行棋 (Couples Ludo)

<!-- Replace the repository URL below if this project moves to another GitHub owner. -->
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmenoking%2Fcouple-flying-chess)

这是一个专为情侣设计的互动飞行棋 Web 应用。不仅保留了经典飞行棋的乐趣，还加入了自定义任务卡、主题管理以及 AI 辅助导入等现代化功能，增进情侣间的互动与趣味。

在线预览：[https://youlookfunny.github.io](https://youlookfunny.github.io)
原项目地址（本人添加玩法）：[https://github.com/woniu9524/couple-flying-chess](https://github.com/woniu9524/couple-flying-chess)

## ✨ 功能特性

- **自定义主题**: 用户可以创建属于自己的游戏主题，设置特定的惩罚或奖励任务。
- **性别适用范围**: 支持设置主题的适用对象（通用、仅限男方、仅限女方），在游戏配置阶段智能过滤。
- **AI 辅助导入**: 复制提示词到 AI 工具生成任务，再粘贴 JSON 导入主题；应用本身不直接调用 AI 服务。
- **多种游戏模式**: 包含飞行棋、任务卡牌、扫雷、双骰子和姿势图片模式。
- **本地存储**: 游戏状态和自定义主题保存在当前浏览器的 LocalStorage 中；刷新后可从最近保存的状态继续。
- **移动端适配**: 采用响应式设计，完美适配手机端操作体验。

## 🛠️ 技术栈

- **前端框架**: [React](https://react.dev/) (v18)
- **构建工具**: [Vite](https://vitejs.dev/)
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
   git clone https://github.com/menoking/couple-flying-chess.git
   cd couple-flying-chess
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

### 部署到 Vercel

1. 点击页面顶部的 **Deploy with Vercel** 按钮，并登录 GitHub 和 Vercel。
2. 在 Vercel 中确认要导入的 GitHub 仓库及项目名称。
3. 点击 **Deploy**。Vercel 会使用仓库中的 `vercel.json` 安装依赖、运行生产构建并发布 `dist/` 目录。

部署按钮使用当前远程仓库 `menoking/couple-flying-chess`。请先将需要部署的提交推送到该 GitHub 仓库；若仓库迁移至其他 owner，请同时更新按钮链接。

## 📂 项目结构

```
src/
├── components/         # UI 组件
│   ├── modals/         # 弹窗组件 (主题创建、编辑、AI导入等)
│   ├── views/          # 页面视图 (首页、游戏页、主题列表页)
│   └── ...             # 其他基础组件 (骰子、棋盘等)
├── data/               # 静态数据 (默认主题)
├── hooks/              # 自定义 Hooks (游戏状态管理 useGameState)
├── types/              # TypeScript 类型定义
├── utils/              # 工具函数 (游戏逻辑、存储处理)
├── App.tsx             # 根组件
└── main.tsx            # 入口文件
```

## 🎮 玩法说明

1. **配置阶段**: 选择飞行棋、任务卡牌、扫雷、双骰子或姿势图片模式；需要题库的模式还需为双方选择主题。
2. **主题管理**: 在“主题库”中创建主题、设置任务，并可将 AI 生成的 JSON 任务列表导入。
3. **游戏进行**: 按所选模式掷骰走棋、抽卡、翻开扫雷方格、组合双骰结果或抽取姿势图片。
4. **胜利条件**: 飞行棋模式中，先到终点的玩家获胜；其他模式按各自的回合规则继续游玩。


## 📄 许可证

当前仓库未包含 `LICENSE` 文件；请以实际发布版本附带的许可证为准。
