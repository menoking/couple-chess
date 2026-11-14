import type { GameMode, ThemeMode } from '../types';

export type ModeCategory = 'public' | 'hidden' | 'timed';

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
  { key: 'board', label: '飞行棋模式', category: 'public', cardRule: '落格触发任务，胜方抽卡后败方翻卡' },
  { key: 'card', label: '任务卡牌', category: 'public', cardRule: '每次抽卡都由胜方先抽，败方翻卡查看' },
  { key: 'mine', label: '扫雷模式', category: 'hidden', cardRule: '翻出任务格后由对方抽卡，本人翻卡执行' },
  { key: 'roulette', label: '情侣转盘', category: 'timed', cardRule: '转盘结果由胜方抽卡，败方翻卡查看' },
  { key: 'pose', label: '姿势模式', category: 'public', cardRule: '抽到姿势卡后由对方翻卡查看' },
  { key: 'bingo', label: '情侣 Bingo', category: 'public', cardRule: '连线成功者抽卡，对方翻卡执行' },
  { key: 'memory', label: '记忆翻牌', category: 'timed', cardRule: '配对成功者抽卡，对方翻卡执行' },
  { key: 'gridchess', label: '点格棋', category: 'public', cardRule: '闭合格子者抽卡，对方翻卡执行' },
  { key: 'sudoku', label: '数独', category: 'timed', cardRule: '先解出格子者抽卡，对方翻卡执行' },
  { key: 'go', label: '九路围棋', category: 'public', cardRule: '提子方抽卡，被提子方翻卡执行' },
  { key: 'jungle', label: '斗兽棋', category: 'public', cardRule: '吃子方抽卡，被吃子方翻卡执行' },
  { key: 'auction', label: '拍卖竞价', category: 'hidden', cardRule: '竞得者抽卡，对方翻卡执行' },
  { key: 'quiz', label: '默契问答', category: 'hidden', cardRule: '答案揭晓后由默契度高者抽卡' },
  { key: 'timed', label: '限时挑战', category: 'timed', cardRule: '计分高者抽卡，对方翻卡执行' },
  { key: 'bluff', label: '吹牛骰', category: 'hidden', cardRule: '开牌胜方抽卡，负方翻卡执行' },
  { key: 'story', label: '故事接龙', category: 'public', cardRule: '每轮由对方抽情节卡，本人翻卡' },
  { key: 'survival', label: '合作生存', category: 'timed', cardRule: '完成任务者抽卡，对方翻卡执行' },
  { key: 'territory', label: '领地争夺', category: 'public', cardRule: '占领者抽卡，对方翻卡执行' },
  { key: 'trutndare', label: '真心话大冒险', category: 'public', cardRule: '抽卡方先抽，执行方翻卡查看' },
  { key: 'gamble', label: '赌局轮盘', category: 'timed', cardRule: '赌局胜方抽卡，败方翻卡执行' },
  { key: 'edge', label: '高潮边缘', category: 'timed', cardRule: '胜方抽卡，败方翻卡执行' },
  { key: 'penaltygrid', label: '惩罚阶梯', category: 'public', cardRule: '升阶者抽卡，对方翻卡执行' },
  { key: 'secretdouble', label: '翻牌赌命', category: 'hidden', cardRule: '翻牌胜方抽卡，败方翻卡执行' },
  { key: 'roleplay', label: '角色扮演', category: 'public', cardRule: '抽剧本方先抽，对方翻卡查看' }
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
  'PenaltyLadderModeView.'
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
  gridchess: 'GridChessModeView.turn',
  go: 'GoModeView.turn',
  jungle: 'JungleModeView.turn',
  sudoku: 'SudokuModeView.turn',
  bluff: 'BluffDiceModeView.turn',
  penaltygrid: 'PenaltyLadderModeView.turn'
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
