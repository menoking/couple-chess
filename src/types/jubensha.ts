/**
 * 双人剧本杀的数据结构（内容与引擎解耦）。
 *
 * 新增剧本只需要在 `src/data/jubensha/` 下加一个文件、在 `index.ts` 里导出，
 * 引擎和视图都不需要改。角色固定 2 个，对应 seat 0 / seat 1；
 * 线索里的 `role0` / `role1` 指的是 `script.roles` 的下标，不是座位号。
 */

/** 难度只影响展示，不参与判定 */
export type JubenshaDifficulty = 'easy' | 'normal' | 'hard';

/** 线索归属：公共 / 角色 0 私有 / 角色 1 私有 */
export type JubenshaClueOwner = 'public' | 'role0' | 'role1';

export interface JubenshaRole {
  id: string;
  name: string;
  /** 一句话人设，选角页展示 */
  tagline: string;
  /** 所有人可见的人物小传 */
  publicBio: string;
  /** 只有本人可见的隐藏目标，读本页展示 */
  secretGoal: string;
}

export interface JubenshaClue {
  id: string;
  title: string;
  /** 展开后看到的正文 */
  content: string;
  /** 搜证地点，例如「收银台」「相机包」 */
  location: string;
  owner: JubenshaClueOwner;
  /** 是否允许本人一键分享给对方 */
  shareable: boolean;
}

export interface JubenshaDecisionOption {
  id: string;
  label: string;
  description?: string;
}

/** 本幕或终局的关键抉择：双方各自暗投，都锁定后才一起揭晓 */
export interface JubenshaDecision {
  id: string;
  title: string;
  prompt: string;
  options: JubenshaDecisionOption[];
  /** true = 这个抉择揭晓后直接进入结局复盘 */
  final?: boolean;
}

export interface JubenshaAct {
  id: string;
  title: string;
  /** 系统主持人的旁白，双方都能看到 */
  dmNarration: string;
  /** 按角色 id 隔离的本幕正文；当前角色只读到自己那份 */
  roleScripts: Record<string, string[]>;
  clues: JubenshaClue[];
  /** 防冷场的引导问题 */
  discussionPrompts: string[];
  decision?: JubenshaDecision;
}

export interface JubenshaEndingMatch {
  decisionId: string;
  /** 双方选择，null 表示该位置任意 */
  choices: [string | null, string | null];
}

export interface JubenshaEnding {
  id: string;
  title: string;
  summary: string;
  /** 完整真相 */
  truthReveal: string;
  /** 按 `script.roles` 顺序揭晓两个角色的隐藏秘密 */
  roleSecrets: [string, string];
  /**
   * 满足全部条件才命中；不写 match 的结局是兜底，
   * 引擎会优先匹配带条件的，最后才回落到兜底项。
   */
  match?: JubenshaEndingMatch[];
}

export interface JubenshaScript {
  id: string;
  title: string;
  subtitle: string;
  durationMinutes: number;
  tags: string[];
  synopsis: string;
  difficulty: JubenshaDifficulty;
  /** 固定两个角色，下标即 role0 / role1 */
  roles: [JubenshaRole, JubenshaRole];
  acts: JubenshaAct[];
  endings: JubenshaEnding[];
}
