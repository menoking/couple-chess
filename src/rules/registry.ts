import type { GameMode, ThemeMode } from '../types';

export type ModeCategory = 'public' | 'hidden' | 'timed';

/**
 * 开局不需要选卡包的玩法：本身自带内容，从主题卡包里抽不出任何东西。
 *
 * - pose：自带姿势图库
 * - quiz：自带题库
 * - story：自带故事碎片
 * - gamble：转盘直接给档位，不抽主题卡
 * - roleplay：自带剧本
 *
 * 首页不再显示选包卡片，联机大厅也不再要求双方锁定卡包，进房即可开局。
 */
export const THEME_FREE_MODES: ReadonlySet<GameMode> = new Set<GameMode>([
  'pose',
  'quiz',
  'story',
  'gamble',
  'roleplay',
  'jubensha'
]);

/** 该玩法开局是否需要选卡包。 */
export function needsThemeDecks(mode: GameMode): boolean {
  return !THEME_FREE_MODES.has(mode);
}

export interface ModeDef {
  key: GameMode;
  label: string;
  category: ModeCategory;
  /** 抽卡触发说明，联机房间顶部展示 */
  cardRule: string;
}

/**
 * 全项目唯一的玩法注册表。首页、房间大厅、联机舞台、诊断都从这里取，
 * 不再有「三玩法白名单 + 24 段条件渲染」各写一份的情况。
 */
export const MODE_REGISTRY: ModeDef[] = [
  { key: 'board', label: '飞行棋模式', category: 'public', cardRule: '落格触发：踩对方 / 幸运 / 陷阱各抽 1 张，48 格判胜' },
  { key: 'card', label: '任务卡牌', category: 'public', cardRule: '每回合抽 1 张，抽卡方先翻，对方随后自动看到' },
  { key: 'mine', label: '扫雷模式', category: 'hidden', cardRule: '翻到任务格本人抽 1 张自己执行；翻到炸弹三选一' },
  { key: 'roulette', label: '情侣转盘', category: 'timed', cardRule: '四个转盘直接给出「谁 / 做什么 / 哪里 / 多久」，不额外抽卡' },
  { key: 'pose', label: '姿势模式', category: 'public', cardRule: '每回合抽 1 张姿势卡' },
  { key: 'bingo', label: '情侣 Bingo', category: 'public', cardRule: '每连成 1 条线抽 1 张，多条线抽多张（卡包 10 张）' },
  { key: 'memory', label: '记忆翻牌', category: 'timed', cardRule: '每配对成功 1 对抽 1 张，对方执行' },
  { key: 'gridchess', label: '点格棋', category: 'public', cardRule: '每闭合 1 格抽 1 张，闭合多格抽多张，对方执行' },
  { key: 'sudoku', label: '数独', category: 'timed', cardRule: '每填对 1 格抽 1 张，对方执行' },
  { key: 'go', label: '九路围棋', category: 'public', cardRule: '每提满 3 子抽 1 张；终局胜方抽 2 张，均由败方执行' },
  { key: 'jungle', label: '斗兽棋', category: 'public', cardRule: '每吃掉 1 个棋子抽 1 张，对方执行' },
  { key: 'auction', label: '拍卖竞价', category: 'hidden', cardRule: '竞得者抽 1 张，对方执行' },
  { key: 'quiz', label: '默契问答', category: 'hidden', cardRule: '按答案是否一致计分，不额外抽卡' },
  { key: 'timed', label: '限时挑战', category: 'timed', cardRule: '按完成度计分，不额外抽卡' },
  { key: 'bluff', label: '吹牛骰', category: 'hidden', cardRule: '开牌后胜方抽 1 张，败方执行' },
  { key: 'story', label: '故事接龙', category: 'public', cardRule: '轮流接续故事碎片，不额外抽卡' },
  { key: 'survival', label: '合作生存', category: 'timed', cardRule: '触发任务时抽 1 张，自己执行' },
  { key: 'territory', label: '领地争夺', category: 'public', cardRule: '占领 / 攻城抽 1 张，自己执行' },
  { key: 'trutndare', label: '真心话大冒险', category: 'public', cardRule: '从真心话 / 大冒险 / 主题卡池抽 1 张，本人执行' },
  { key: 'gamble', label: '赌局轮盘', category: 'timed', cardRule: '转盘停在哪档就执行哪档，不额外抽卡' },
  { key: 'edge', label: '高潮边缘', category: 'timed', cardRule: '按关卡推进的限时挑战，不额外抽卡' },
  { key: 'roleplay', label: '角色扮演', category: 'public', cardRule: '抽取剧本并按剧情推进，不额外抽卡' },
  { key: 'jubensha', label: '双人剧本杀', category: 'hidden', cardRule: '分幕读本、搜证分享与密封抉择，按选择组合进入不同结局' }
];

export const ALL_MODE_KEYS: GameMode[] = MODE_REGISTRY.map(item => item.key);

export const MODE_LABEL: Record<GameMode, string> = MODE_REGISTRY.reduce(
  (acc, item) => ({ ...acc, [item.key]: item.label }),
  {} as Record<GameMode, string>
);

export const MODE_CATEGORY: Record<GameMode, ModeCategory> = MODE_REGISTRY.reduce(
  (acc, item) => ({ ...acc, [item.key]: item.category }),
  {} as Record<GameMode, ModeCategory>
);

export const ALL_THEME_MODES: ThemeMode[] = [
  'board', 'card', 'mineTruth', 'mineDare', 'mineTheme', 'diceAction', 'diceBody'
];

/**
 * 严格轮流玩法：视图内部自带 turn，只有当前回合方能写自己的状态。
 * 前端守卫可能因座位 / Presence 竞态失效，房主这一层是最终裁决。
 */
export const TURN_BOUND_PREFIXES = [
  'GridChessModeView.',
  'GoModeView.',
  'JungleModeView.',
  'SudokuModeView.',
  'BluffDiceModeView.',
];

/** 该状态键属于哪个严格轮流玩法；不属于返回 null。 */
export function turnBoundPrefixOf(key: string): string | null {
  return TURN_BOUND_PREFIXES.find(prefix => key.startsWith(prefix)) ?? null;
}

/**
 * 玩法 → 视图内部回合键。切换玩法时 data 里可能残留上一个玩法的 turn，
 * 按固定映射取才不会被旧值带偏（表现为「一直男方回合」「操作权错位」）。
 */
export const MODE_TURN_KEY: Partial<Record<GameMode, string>> = {
  board: 'OnlineBoard.turn',
  gridchess: 'GridChessModeView.turn',
  go: 'GoModeView.turn',
  jungle: 'JungleModeView.turn',
  sudoku: 'SudokuModeView.turn',
  bluff: 'BluffDiceModeView.turn',
};

/** 当前玩法该读哪一个 turn 键；没有内部回合的玩法返回 null。 */
export function turnKeyOfMode(mode: GameMode): string | null {
  return MODE_TURN_KEY[mode] ?? null;
}

/** 需要权威端独占跑表的状态变量，避免两台设备各自发 patch 打架。 */
const TIMER_STATE_SUFFIXES = ['.timeLeft', '.secondsLeft', '.tick'];

export function isAuthorityOnlyState(key: string): boolean {
  return TIMER_STATE_SUFFIXES.some(suffix => key.endsWith(suffix));
}

export function isRestartState(key: string): boolean {
  return key.endsWith('.runId');
}

const PRIVATE_MARK = '@s';

/** 按座位隔离的状态 key（例如各自手里的骰子）。 */
export function seatScopedKey(key: string, seat: 0 | 1): string {
  return `${key}${PRIVATE_MARK}${seat}`;
}

export function privateKeyOf(key: string): number | null {
  const index = key.lastIndexOf(PRIVATE_MARK);
  if (index < 0) return null;
  const value = Number(key.slice(index + PRIVATE_MARK.length));
  return value === 0 || value === 1 ? value : null;
}
