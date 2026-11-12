import type {
  BingoBoard,
  MineTaskChoice,
  Player,
  TaskCard,
  TaskEventData,
  Theme,
  ThemeMode
} from '../types';
import { calculateNewPosition, type BingoDeck } from '../utils/gameLogic';

/**
 * 同屏与联机共用的玩法规则纯函数。
 * 之前这些函数只存在于 useGameState 内部，联机只能另写一套简化判定；
 * 搬到这里之后，两端调用的是同一份代码，规则不会再分叉。
 */

export function isThemeAllowedForRole(theme: Theme, role: Player['role']) {
  return theme.audience === 'common' || theme.audience === role;
}

export function isThemeAllowedForMode(theme: Theme, mode: ThemeMode) {
  return theme.modes.includes(mode);
}

export function isThemeAllowed(theme: Theme, role: Player['role'], mode: ThemeMode) {
  return isThemeAllowedForRole(theme, role) && isThemeAllowedForMode(theme, mode);
}

export function chooseRandomTask(theme: Theme | undefined): TaskCard | null {
  if (!theme || theme.tasks.length === 0) return null;
  return theme.tasks[Math.floor(Math.random() * theme.tasks.length)];
}

export function chooseRandomTheme(
  themes: Theme[],
  role: Player['role'],
  mode: ThemeMode
): Theme | null {
  const available = themes.filter(
    theme => isThemeAllowed(theme, role, mode) && theme.tasks.length > 0
  );
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

export function getExecutorPlayerId(task: TaskCard, fallbackPlayerId: number) {
  if (task.executor === 'female') return 1;
  if (task.executor === 'male') return 0;
  return fallbackPlayerId;
}

export function formatMoveDelta(moveDelta: number) {
  if (moveDelta === 0) return '';
  return moveDelta > 0 ? `，完成后前进${moveDelta}格` : `，完成后后退${Math.abs(moveDelta)}格`;
}

export function buildTaskEvent(input: {
  type: TaskEventData['type'];
  initiatorPlayerId: number;
  fallbackExecutorPlayerId: number;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  task: TaskCard;
  taskSourceId: string;
}): TaskEventData {
  return {
    type: input.type,
    initiatorPlayerId: input.initiatorPlayerId,
    executorPlayerId: getExecutorPlayerId(input.task, input.fallbackExecutorPlayerId),
    title: input.title,
    subtitle: `${input.subtitle}${formatMoveDelta(input.task.moveDelta)}`,
    icon: input.icon,
    color: input.color,
    task: input.task.text,
    taskSourceId: input.taskSourceId,
    moveDelta: input.task.moveDelta
  };
}

export function applyMoveDelta(step: number, moveDelta: number) {
  if (moveDelta > 0) return calculateNewPosition(step, moveDelta);
  if (moveDelta < 0) return Math.max(0, step + moveDelta);
  return step;
}

export function buildBingoDecks(players: Player[], themes: Theme[]): BingoDeck[] {
  return players.map(player => {
    const theme = themes.find(t => t.id === player.themeId);
    const tasks = theme && isThemeAllowed(theme, player.role, 'card') ? theme.tasks : [];
    return { themeId: theme?.id ?? '', tasks };
  });
}

export function createMineTaskEvent(
  players: Player[],
  themes: Theme[],
  playerId: number,
  choice: MineTaskChoice,
  selectedByPlayerId?: number
): TaskEventData | null {
  const player = players.find(p => p.id === playerId);
  const selector = players.find(p => p.id === selectedByPlayerId);
  if (!player) return null;

  const selectedPrefix = selector ? `${selector.name}指定` : '扫雷事件';
  const mode: ThemeMode =
    choice === 'truth' ? 'mineTruth' : choice === 'dare' ? 'mineDare' : 'mineTheme';
  const theme =
    choice === 'theme' && player.themeId
      ? themes.find(t => t.id === player.themeId && isThemeAllowed(t, player.role, 'mineTheme')) || null
      : chooseRandomTheme(themes, player.role, mode);
  const task = chooseRandomTask(theme || undefined);
  if (!theme || !task) return null;

  if (choice === 'truth') {
    return buildTaskEvent({
      type: 'mineTruth',
      initiatorPlayerId: player.id,
      fallbackExecutorPlayerId: player.id,
      title: '真心话',
      subtitle: selectedPrefix,
      icon: 'message-question',
      color: 'text-[#64D2FF]',
      task: { ...task, moveDelta: 0 },
      taskSourceId: theme.id
    });
  }

  if (choice === 'dare') {
    return buildTaskEvent({
      type: 'mineDare',
      initiatorPlayerId: player.id,
      fallbackExecutorPlayerId: player.id,
      title: '大冒险',
      subtitle: selectedPrefix,
      icon: 'flame',
      color: 'text-[#FF9F0A]',
      task: { ...task, moveDelta: 0 },
      taskSourceId: theme.id
    });
  }

  return buildTaskEvent({
    type: 'mineTheme',
    initiatorPlayerId: player.id,
    fallbackExecutorPlayerId: player.id,
    title: '主题任务',
    subtitle: `${selectedPrefix}，任务来自「${theme.name}」`,
    icon: 'sparkles',
    color: player.role === 'male' ? 'text-[#0A84FF]' : 'text-[#FF375F]',
    task: { ...task, moveDelta: 0 },
    taskSourceId: theme.id
  });
}

/** 飞行棋落格判定，与同屏 checkTile 完全一致。 */
export function resolveBoardTile(input: {
  landingStep: number;
  players: Player[];
  themes: Theme[];
  turn: number;
  boardMap: string[];
}): TaskEventData | 'win' | null {
  const { landingStep, players, themes, turn, boardMap } = input;
  const activePlayer = players[turn];
  const opponent = players[turn === 0 ? 1 : 0];
  if (!activePlayer || !opponent) return null;

  if (landingStep === 48) return 'win';

  if (landingStep !== 0 && landingStep === opponent.step) {
    const theme = themes.find(t => t.id === activePlayer.themeId);
    const task = chooseRandomTask(theme);
    if (!task) return null;
    return buildTaskEvent({
      type: 'collision',
      initiatorPlayerId: activePlayer.id,
      fallbackExecutorPlayerId: opponent.id,
      title: '亲密追尾',
      subtitle: `任务来自「${theme?.name || ''}」`,
      icon: 'handshake',
      color: 'text-yellow-400',
      task,
      taskSourceId: activePlayer.themeId || ''
    });
  }

  const tileType = boardMap[landingStep];
  if (tileType === 'lucky') {
    const theme = themes.find(t => t.id === activePlayer.themeId);
    const task = chooseRandomTask(theme);
    if (!task) return null;
    return buildTaskEvent({
      type: 'lucky',
      initiatorPlayerId: activePlayer.id,
      fallbackExecutorPlayerId: opponent.id,
      title: '幸运时刻',
      subtitle: `任务来自「${theme?.name || ''}」`,
      icon: 'favorite',
      color: 'text-[#FF375F]',
      task,
      taskSourceId: activePlayer.themeId || ''
    });
  }

  if (tileType === 'trap') {
    const theme = themes.find(t => t.id === opponent.themeId);
    const task = chooseRandomTask(theme);
    if (!task) return null;
    return buildTaskEvent({
      type: 'trap',
      initiatorPlayerId: activePlayer.id,
      fallbackExecutorPlayerId: activePlayer.id,
      title: '意外陷阱',
      subtitle: `任务来自「${theme?.name || ''}」`,
      icon: 'lock',
      color: 'text-[#BF5AF2]',
      task,
      taskSourceId: opponent.themeId || ''
    });
  }

  return null;
}

/** Bingo 完成格子：更新连线并给出奖励，与同屏 completeBingoCell 完全一致。 */
export function completeBingoCellOnBoard(
  board: BingoBoard,
  index: number,
  playerId: number,
  players: Player[],
  themes: Theme[]
): { board: BingoBoard; result: { newLines: number; rewardTask: TaskCard | null; rewardThemeName: string | null; boardComplete: boolean } } | null {
  if (index < 0 || index >= board.cells.length) return null;
  if (board.cells[index].completedBy !== null) return null;

  const cells = board.cells.map((cell, cellIndex) =>
    cellIndex === index ? { ...cell, completedBy: playerId } : cell
  );
  const previousCompleted = board.lines.filter(line => line.completed).length;
  const lines = board.lines.map(line => ({
    ...line,
    completed: line.cells.every(cellIndex => cells[cellIndex].completedBy !== null)
  }));
  const newLines = lines.filter(line => line.completed).length - previousCompleted;

  let rewardTask: TaskCard | null = null;
  let rewardThemeName: string | null = null;
  if (newLines > 0) {
    const activePlayer = players.find(p => p.id === playerId);
    const opponent = players.find(p => p.id !== playerId);
    const opponentTheme = opponent ? themes.find(t => t.id === opponent.themeId) : undefined;
    const ownTheme = activePlayer ? themes.find(t => t.id === activePlayer.themeId) : undefined;
    const rewardTheme = opponentTheme && opponentTheme.tasks.length > 0 ? opponentTheme : ownTheme;
    if (rewardTheme && rewardTheme.tasks.length > 0) {
      rewardTask = chooseRandomTask(rewardTheme);
      rewardThemeName = rewardTheme.name;
    }
  }

  return {
    board: { ...board, cells, lines },
    result: {
      newLines,
      rewardTask,
      rewardThemeName,
      boardComplete: cells.every(cell => cell.completedBy !== null)
    }
  };
}
