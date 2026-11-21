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

export type TaskExecutor = 'female' | 'male' | 'both';

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
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  task: string;
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
  | { type: 'blank' }
  | { type: 'bomb' }
  | { type: 'task'; task: TaskEventData };
