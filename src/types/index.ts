export type TileType = 'blank' | 'lucky' | 'trap';

export type PlayerRole = 'male' | 'female';

export type GameMode =
  | 'board'
  | 'card'
  | 'pose'
  | 'mine'
  | 'roulette'
  | 'bingo'
  | 'quiz'
  | 'memory'
  | 'timed'
  | 'story'
  | 'survival'
  | 'territory'
  | 'auction'
  | 'gridchess'
  | 'trutndare'
  | 'gamble'
  | 'edge'
  | 'roleplay'
  | 'sudoku'
  | 'go'
  | 'bluff'
  | 'jungle'
  | 'jubensha';

export type GameView =
  | 'home'
  | 'game'
  | 'card'
  | 'pose'
  | 'mine'
  | 'roulette'
  | 'bingo'
  | 'quiz'
  | 'memory'
  | 'timed'
  | 'story'
  | 'survival'
  | 'territory'
  | 'auction'
  | 'gridchess'
  | 'trutndare'
  | 'gamble'
  | 'edge'
  | 'roleplay'
  | 'sudoku'
  | 'go'
  | 'bluff'
  | 'jungle'
  | 'jubensha'
  | 'themes';

export interface BingoCell {
  task: TaskCard;
  themeId: string;
  completedBy: number | null;
}

export interface BingoLine {
  cells: number[];
  completed: boolean;
}

export interface BingoBoard {
  size: number;
  cells: BingoCell[];
  lines: BingoLine[];
}

export interface BingoCellResult {
  newLines: number;
  rewardTask: TaskCard | null;
  rewardThemeName: string | null;
  boardComplete: boolean;
}

export type ThemeMode =
  | 'board'
  | 'card'
  | 'mineTruth'
  | 'mineDare'
  | 'mineTheme'
  | 'diceAction'
  | 'diceBody';

export type MineTileType = 'bomb' | 'truth' | 'dare' | 'blank' | 'theme';

export type MineTaskChoice = 'truth' | 'dare' | 'theme';

export interface MineTile {
  type: MineTileType;
  revealed: boolean;
  /** 周围八格中的炸弹数量；炸弹格本身固定为 0。 */
  adjacentMines: number;
  /** 谁翻开了该格，用于终局计分。 */
  revealedBy: 0 | 1 | null;
  /** 谁标记了该格；标记不消耗回合。 */
  flaggedBy: 0 | 1 | null;
}

export interface Player {
  id: number;
  name: string;
  color: string;
  role: PlayerRole;
  step: number;
  themeId: string | null;
}

export type ThemeAudience = 'common' | 'male' | 'female';

/** both=按玩法指定的实际执行方（兼容旧题库），together=双方共同执行。 */
export type TaskExecutor = 'female' | 'male' | 'both' | 'together';

/** 卡片最终展示的明确执行关系；不允许把“谁对谁做”留给玩家猜。 */
export type TaskExecutionMode = 'directed' | 'together';

export interface TaskCard {
  text: string;
  executor: TaskExecutor;
  moveDelta: number;
}

export type ThemeTag =
  | {
      kind: 'special';
      type: 'intensity';
      label: string;
      level: 1 | 2 | 3 | 4 | 5;
    }
  | {
      kind: 'plain';
      label: string;
    };

export interface Theme {
  id: string;
  name: string;
  desc: string;
  audience: ThemeAudience;
  modes: ThemeMode[];
  tasks: TaskCard[];
  tags: ThemeTag[];
}

export interface PathCoord {
  r: number;
  c: number;
}

export interface GameState {
  view: GameView;
  gameMode: GameMode;
  turn: number;
  players: Player[];
  themes: Theme[];
  boardMap: TileType[];
  pathCoords: PathCoord[];
  mineBoard: MineTile[];
  /** 双方距离下一张扫雷任务卡还差多少次主动安全翻格。 */
  mineSafeProgress?: [number, number];
  /** 已触发的常规扫雷任务数，用于真心话 / 大冒险 / 主题任务轮换。 */
  mineTaskCount?: number;
  bingoBoard: BingoBoard | null;
  isRolling: boolean;
  /**
   * 本局已经抽过的任务 key（文本 + 步数）。
   * 飞行棋 / 扫雷 / Bingo / 卡牌共用同一份记录，抽过的不会再抽到；
   * 整副抽空后由 chooseRandomTask 自动重新洗牌。
   */
  usedCardKeys?: string[];
}

export interface TaskEventData {
  type: 'collision' | 'lucky' | 'trap' | 'card' | 'mineTruth' | 'mineDare' | 'mineTheme';
  initiatorPlayerId: number;
  executorPlayerId: number;
  /** directed 时为被执行人；together 时为 null。 */
  targetPlayerId: number | null;
  executionMode: TaskExecutionMode;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  task: string;
  /** 原题文字，用于抽卡去重，独立于面向当前玩家的正文。 */
  sourceTaskText?: string;
  taskSourceId: string;
  /** 卡面来源的中文主题名；不再拿 taskSourceId（主题 id）当来源展示 */
  themeName?: string;
  moveDelta: number;
  /** 联机公共卡确认后，由房主 reducer 原子执行的白名单后续动作。 */
  continuation?: TaskContinuation;
}

export type TaskContinuation =
  | { kind: 'endTurn' }
  | { kind: 'sudoku'; finish: boolean }
  | { kind: 'auction'; round: number };

export type MineRevealResult =
  | { type: 'blank'; completed?: boolean }
  | { type: 'bomb'; completed?: boolean }
  | { type: 'task'; task: TaskEventData; completed?: boolean };
