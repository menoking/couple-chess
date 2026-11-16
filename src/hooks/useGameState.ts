import { useState, useEffect, useCallback } from 'react';
import { THEME_FREE_MODES } from '../rules/registry';
import {
  BingoBoard,
  BingoCell,
  BingoCellResult,
  BingoLine,
  GameMode,
  GameState,
  GameView,
  MineRevealResult,
  MineTaskChoice,
  MineTile,
  MineTileType,
  Player,
  TaskCard,
  TaskEventData,
  TaskExecutor,
  Theme,
  ThemeTag,
  ThemeMode
} from '../types';
import {
  applyMoveDelta,
  buildBingoDecks,
  buildTaskEvent,
  chooseRandomTask,
  createMineTaskEvent,
  isThemeAllowed,
  isThemeAllowedForRole
} from '../rules/modeRules';
import { loadFromStorage, saveToStorage } from '../utils/localStorage';
import { generateSpiralPath, generateBoardMap, calculateNewPosition, generateMineBoard, generateBingoBoard, BINGO_BOARD_SIZE } from '../utils/gameLogic';
import { DEFAULT_THEMES } from '../data/defaultThemes';

const STORAGE_KEY = 'couples-ludo-game-state';
const DEFAULT_THEME_IDS = new Set(DEFAULT_THEMES.map(theme => theme.id));

const initialPlayers: Player[] = [
  { id: 0, name: '男方', color: '#0A84FF', role: 'male', step: 0, themeId: null },
  { id: 1, name: '女方', color: '#FF375F', role: 'female', step: 0, themeId: null }
];

const MINE_BOARD_SIZE = 36;
const MINE_TILE_TYPES = new Set<MineTileType>(['bomb', 'truth', 'dare', 'blank', 'theme']);
const THEME_MODES = new Set<ThemeMode>([
  'board',
  'card',
  'mineTruth',
  'mineDare',
  'mineTheme',
  'diceAction',
  'diceBody'
]);
const DEFAULT_THEME_MODES: ThemeMode[] = ['board', 'card', 'mineTheme'];

const GAME_MODE_VALUES: GameMode[] = [
  'board',
  'card',
  'pose',
  'mine',
  'roulette',
  'bingo',
  'quiz',
  'memory',
  'timed',
  'story',
  'survival',
  'territory',
  'auction',
  'gridchess',
  'trutndare',
  'gamble',
  'edge',
  'roleplay',
  'sudoku',
  'go',
  'bluff',
  'jungle'
];

const VIEW_VALUES: GameView[] = [
  'home',
  'game',
  'card',
  'pose',
  'mine',
  'roulette',
  'bingo',
  'quiz',
  'memory',
  'timed',
  'story',
  'survival',
  'territory',
  'auction',
  'gridchess',
  'trutndare',
  'gamble',
  'edge',
  'roleplay',
  'sudoku',
  'go',
  'bluff',
  'jungle',
  'themes'
];

const MODE_VIEW: Record<GameMode, GameView> = {
  board: 'game',
  card: 'card',
  pose: 'pose',
  mine: 'mine',
  roulette: 'roulette',
  bingo: 'bingo',
  quiz: 'quiz',
  memory: 'memory',
  timed: 'timed',
  story: 'story',
  survival: 'survival',
  territory: 'territory',
  auction: 'auction',
  gridchess: 'gridchess',
  trutndare: 'trutndare',
  gamble: 'gamble',
  edge: 'edge',
  roleplay: 'roleplay',
  sudoku: 'sudoku',
  go: 'go',
  bluff: 'bluff',
  jungle: 'jungle'
};

const VIEW_MODE: Record<string, GameMode> = {
  home: 'board',
  game: 'board',
  card: 'card',
  pose: 'pose',
  mine: 'mine',
  roulette: 'roulette',
  bingo: 'bingo',
  quiz: 'quiz',
  memory: 'memory',
  timed: 'timed',
  story: 'story',
  survival: 'survival',
  territory: 'territory',
  auction: 'auction',
  gridchess: 'gridchess',
  trutndare: 'trutndare',
  gamble: 'gamble',
  edge: 'edge',
  roleplay: 'roleplay',
  sudoku: 'sudoku',
  go: 'go',
  bluff: 'bluff',
  jungle: 'jungle'
};

/** 自备内容、不需要选择主题的玩法。 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}




function normalizeExecutor(value: unknown): TaskExecutor {
  if (value === 1 || value === '1') return 'female';
  if (value === 2 || value === '2') return 'male';
  if (value === 3 || value === '3') return 'both';
  return value === 'female' || value === 'male' || value === 'both' ? value : 'both';
}

function clampMoveDelta(value: unknown) {
  if (typeof value === 'string' && /^[-+]\d+$/.test(value.trim())) {
    return clampMoveDelta(Number(value));
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(-12, Math.min(12, Math.trunc(value)));
}

function parseTaskText(input: string): TaskCard | null {
  const parts = input.split(',').map(part => part.trim());
  const maybeExecutor = parts.length >= 2 ? parts[parts.length - 2] : '';
  const maybeMove = parts.length >= 3 ? parts[parts.length - 1] : '';
  const hasExecutor = maybeExecutor === '1' || maybeExecutor === '2' || maybeExecutor === '3';
  const hasMove = /^[-+]\d+$/.test(maybeMove);

  if (!hasExecutor) {
    const text = input.trim();
    return text ? { text, executor: 'both', moveDelta: 0 } : null;
  }

  const metadataCount = hasMove ? 2 : 1;
  const text = parts.slice(0, parts.length - metadataCount).join(',').trim();
  if (!text) return null;

  return {
    text,
    executor: normalizeExecutor(maybeExecutor),
    moveDelta: hasMove ? clampMoveDelta(maybeMove) : 0
  };
}

function normalizeTask(input: unknown): TaskCard | null {
  if (typeof input === 'string') {
    return parseTaskText(input);
  }

  if (Array.isArray(input)) {
    const [textValue, executorValue, moveValue] = input;
    const text = typeof textValue === 'string' ? textValue.trim() : '';
    if (!text) return null;

    return {
      text,
      executor: normalizeExecutor(executorValue),
      moveDelta: clampMoveDelta(moveValue)
    };
  }

  if (!isRecord(input)) return null;

  const textValue = input.text ?? input.task;
  const text = typeof textValue === 'string' ? textValue.trim() : '';
  if (!text) return null;

  return {
    text,
    executor: normalizeExecutor(input.executor),
    moveDelta: clampMoveDelta(input.moveDelta)
  };
}

function normalizeThemeTag(input: unknown): ThemeTag | null {
  if (!isRecord(input) || typeof input.label !== 'string' || !input.label.trim()) return null;
  const label = input.label.trim();
  if (input.kind === 'special' && input.type === 'intensity') {
    const level = Number(input.level);
    if (level >= 1 && level <= 5 && Number.isInteger(level)) {
      return { kind: 'special', type: 'intensity', label, level: level as 1 | 2 | 3 | 4 | 5 };
    }
  }
  return { kind: 'plain', label };
}

function getTaskKey(task: TaskCard) {
  return `${task.text}__${task.executor}__${task.moveDelta}`;
}



function hasThemeForMode(themes: Theme[], role: Player['role'], mode: ThemeMode) {
  return themes.some(theme => isThemeAllowed(theme, role, mode) && theme.tasks.length > 0);
}





function normalizePlayers(input: unknown): Player[] {
  const incoming = Array.isArray(input) ? input : [];

  return initialPlayers.map(base => {
    const found = incoming.find(
      p => isRecord(p) && typeof p.id === 'number' && p.id === base.id
    );
    const record = isRecord(found) ? found : {};
    const roleValue = record.role;
    const themeIdValue = record.themeId;

    return {
      id: base.id,
      name: typeof record.name === 'string' ? record.name : base.name,
      color: typeof record.color === 'string' ? record.color : base.color,
      role: roleValue === 'male' || roleValue === 'female' ? roleValue : base.role,
      step: typeof record.step === 'number' ? record.step : 0,
      themeId: typeof themeIdValue === 'string' || themeIdValue === null ? themeIdValue : null
    };
  });
}

function normalizeThemes(input: unknown): Theme[] {
  const incoming = Array.isArray(input) ? input : [];
  const source = [...DEFAULT_THEMES, ...incoming];

  return source
    .map(t => {
      const record = isRecord(t) ? t : {};
      const id = typeof record.id === 'string' ? record.id : `theme_${Date.now()}`;
      const defaultTheme = DEFAULT_THEMES.find(theme => theme.id === id);
      const tasksValue = record.tasks;
      const tasks = Array.isArray(tasksValue)
        ? tasksValue
            .map(normalizeTask)
            .filter((x): x is TaskCard => !!x)
        : defaultTheme?.tasks ?? [];

      const audienceValue = record.audience;
      const modesValue = record.modes;
      const modes = Array.isArray(modesValue)
        ? modesValue.filter((mode): mode is ThemeMode => THEME_MODES.has(mode as ThemeMode))
        : [];
      const tagsValue = record.tags;
      const tags = Array.isArray(tagsValue)
        ? tagsValue.map(normalizeThemeTag).filter((tag): tag is ThemeTag => !!tag)
        : [];

      return {
        id,
        name: (() => {
          const rawName = typeof record.name === 'string' ? record.name : '';
          // 旧云端数据可能把 id 写进了 name（显示成 mine_dare_default），回退到内置主题名
          if (!rawName || rawName === id || DEFAULT_THEME_IDS.has(rawName)) {
            return defaultTheme?.name ?? '未命名主题';
          }
          return rawName;
        })(),
        desc: typeof record.desc === 'string' ? record.desc : defaultTheme?.desc ?? '',
        audience:
          audienceValue === 'common' || audienceValue === 'male' || audienceValue === 'female'
            ? audienceValue
            : defaultTheme?.audience ?? 'common',
        modes: modes.length > 0 ? modes : defaultTheme?.modes ?? DEFAULT_THEME_MODES,
        tasks,
        tags: tags.length > 0 ? tags : defaultTheme?.tags ?? [{ kind: 'plain', label: '自定义' }]
      } satisfies Theme;
    })
    .reduce<Theme[]>((acc, theme) => {
      // 内置主题：始终以最新的 DEFAULT_THEMES 定义为准，避免旧存档中的过期标签/任务覆盖新版本
      if (DEFAULT_THEME_IDS.has(theme.id)) {
        const existing = acc.find(t => t.id === theme.id);
        const fresh = DEFAULT_THEMES.find(t => t.id === theme.id) ?? theme;
        if (existing) {
          return acc.map(item => (item.id === theme.id ? fresh : item));
        }
        acc.push(fresh);
        return acc;
      }
      if (acc.some(t => t.id === theme.id)) {
        return acc;
      }
      acc.push(theme);
      return acc;
    }, []);
}

function normalizeMineBoard(input: unknown): MineTile[] {
  const incoming = Array.isArray(input) ? input : [];
  const mineBoard = incoming
    .slice(0, MINE_BOARD_SIZE)
    .map(tile => {
      if (!isRecord(tile) || !MINE_TILE_TYPES.has(tile.type as MineTileType)) return null;
      return {
        type: tile.type as MineTileType,
        revealed: !!tile.revealed
      };
    })
    .filter((tile): tile is MineTile => !!tile);

  return mineBoard.length === MINE_BOARD_SIZE ? mineBoard : generateMineBoard();
}


function normalizeBingoBoard(input: unknown): BingoBoard | null {
  if (!isRecord(input)) return null;
  const sizeValue = input.size;
  const size = sizeValue === 3 || sizeValue === 4 || sizeValue === 5 ? sizeValue : BINGO_BOARD_SIZE;
  const cellsValue = input.cells;
  const linesValue = input.lines;
  if (!Array.isArray(cellsValue) || !Array.isArray(linesValue)) return null;

  const cells = cellsValue
    .slice(0, size * size)
    .map(cell => {
      if (!isRecord(cell)) return null;
      const task = normalizeTask(cell.task);
      if (!task) return null;
      const completedByValue = cell.completedBy;
      const completedBy = typeof completedByValue === 'number' ? completedByValue : null;
      return {
        task,
        themeId: typeof cell.themeId === 'string' ? cell.themeId : '',
        completedBy
      } satisfies BingoCell;
    })
    .filter((cell): cell is BingoCell => !!cell);

  if (cells.length !== size * size) return null;

  const lines = linesValue
    .map(line => {
      if (!isRecord(line) || !Array.isArray(line.cells)) return null;
      const lineCells = line.cells.filter(
        (index): index is number =>
          typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < cells.length
      );
      if (lineCells.length !== size) return null;
      return {
        cells: lineCells,
        completed: lineCells.every(index => cells[index].completedBy !== null)
      } satisfies BingoLine;
    })
    .filter((line): line is BingoLine => !!line);

  if (lines.length === 0) return null;
  return { size, cells, lines };
}

function normalizeGameState(saved: unknown): GameState | null {
  if (!isRecord(saved)) return null;
  const s = saved;

  const themes = normalizeThemes(s.themes);
  const players = normalizePlayers(s.players).map(p => {
    if (p.themeId === null) return p;
    const theme = themes.find(t => t.id === p.themeId);
    if (!theme) return { ...p, themeId: null };
    if (!isThemeAllowedForRole(theme, p.role)) return { ...p, themeId: null };
    return p;
  });

  const bingoBoard = normalizeBingoBoard(s.bingoBoard);

  const viewValue =
    typeof s.view === 'string' && VIEW_VALUES.includes(s.view as GameView)
      ? (s.view as GameView)
      : 'home';
  const safeView: GameView = viewValue === 'bingo' && !bingoBoard ? 'home' : viewValue;
  const gameModeValue =
    typeof s.gameMode === 'string' && GAME_MODE_VALUES.includes(s.gameMode as GameMode)
      ? (s.gameMode as GameMode)
      : VIEW_MODE[viewValue] ?? 'board';

  return {
    view: safeView,
    gameMode: gameModeValue,
    turn: s.turn === 0 || s.turn === 1 ? s.turn : 0,
    players,
    themes,
    boardMap: Array.isArray(s.boardMap) ? s.boardMap : generateBoardMap(),
    pathCoords: Array.isArray(s.pathCoords) ? s.pathCoords : generateSpiralPath(),
    mineBoard: normalizeMineBoard(s.mineBoard),
    bingoBoard,
    isRolling: false
  };
}

function createThemeId(existingIds: Set<string>) {
  const base =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? (crypto as Crypto).randomUUID()
      : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

  let id = `user_${base}`;
  while (existingIds.has(id)) {
    id = `user_${base}_${Math.random().toString(36).slice(2, 6)}`;
  }
  return id;
}

function canStartWithThemes(players: Player[], themes: Theme[]) {
  return canStartWithThemeMode(players, themes, 'board');
}

function canStartWithThemeMode(players: Player[], themes: Theme[], mode: ThemeMode) {
  for (const player of players) {
    if (!player.themeId) return false;
    const theme = themes.find(t => t.id === player.themeId);
    if (!theme) return false;
    if (!isThemeAllowed(theme, player.role, mode)) return false;
    if (theme.tasks.length === 0) return false;
  }
  return true;
}

function canStartMineMode(players: Player[], themes: Theme[]) {
  return (
    canStartWithThemeMode(players, themes, 'mineTheme') &&
    players.every(player => hasThemeForMode(themes, player.role, 'mineTruth')) &&
    players.every(player => hasThemeForMode(themes, player.role, 'mineDare'))
  );
}

function canStartGameMode(mode: GameMode, players: Player[], themes: Theme[]) {
  if (THEME_FREE_MODES.has(mode)) return true;
  if (mode === 'mine') return canStartMineMode(players, themes);
  if (mode === 'board') return canStartWithThemes(players, themes);
  return canStartWithThemeMode(players, themes, 'card');
}

function createRandomTaskEvent(
  players: Player[],
  themes: Theme[],
  playerId: number
): TaskEventData | null {
  const player = players.find(p => p.id === playerId);
  if (!player?.themeId) return null;

  const theme = themes.find(t => t.id === player.themeId);
  if (!theme || !isThemeAllowed(theme, player.role, 'card') || theme.tasks.length === 0) return null;
  const task = chooseRandomTask(theme);

  if (!task) return null;

  return buildTaskEvent({
    type: 'card',
    initiatorPlayerId: player.id,
    fallbackExecutorPlayerId: player.id,
    title: '任务卡牌',
    subtitle: `任务来自「${theme.name}」`,
    icon: 'sparkles',
    color: player.role === 'male' ? 'text-[#0A84FF]' : 'text-[#FF375F]',
    task,
    taskSourceId: theme.id
  });
}


export function useGameState() {
  const [state, setState] = useState<GameState>(() => {
    const saved = loadFromStorage<GameState | null>(STORAGE_KEY, null);
    const normalized = normalizeGameState(saved);

    if (normalized) {
      return normalized;
    }

    return {
      view: 'home',
      gameMode: 'board',
      turn: 0,
      players: initialPlayers,
      themes: DEFAULT_THEMES,
      boardMap: generateBoardMap(),
      pathCoords: generateSpiralPath(),
      mineBoard: generateMineBoard(),
      bingoBoard: null,
      isRolling: false
    };
  });

  useEffect(() => {
    saveToStorage(STORAGE_KEY, state);
  }, [state]);

  const switchView = useCallback((view: GameState['view']) => {
    setState(prev => ({ ...prev, view }));
  }, []);

  const selectGameMode = useCallback((mode: GameMode) => {
    setState(prev => ({
      ...prev,
      gameMode: mode,
      players:
        mode === prev.gameMode
          ? prev.players
          : prev.players.map(player => ({ ...player, themeId: null }))
    }));
  }, []);

  const selectTheme = useCallback((playerId: number, themeId: string) => {
    setState(prev => ({
      ...prev,
      players: prev.players.map(p =>
        p.id === playerId ? { ...p, themeId } : p
      )
    }));
  }, []);

  /** 云端同步用：整体替换题库（不做合并，冲突时以传入内容为准） */
  const replaceThemes = useCallback((next: Theme[]) => {
    setState(prev => ({ ...prev, themes: next }));
  }, []);

  const createTheme = useCallback((input: {
    name: string;
    desc?: string;
    audience: Theme['audience'];
    modes: ThemeMode[];
  }) => {
    const name = input.name.trim();
    const desc = (input.desc || '').trim();
    if (!name) return null;

    let createdId: string | null = null;
    setState(prev => {
      const existingIds = new Set(prev.themes.map(t => t.id));
      const id = createThemeId(existingIds);
      createdId = id;

      return {
        ...prev,
        themes: [
          ...prev.themes,
          {
            id,
            name,
            desc,
            audience: input.audience,
            modes: input.modes.length > 0 ? input.modes : DEFAULT_THEME_MODES,
            tasks: [],
            tags: [{ kind: 'plain', label: '自定义' }]
          }
        ]
      };
    });

    return createdId;
  }, []);

  const updateThemeMeta = useCallback((themeId: string, patch: Partial<Pick<Theme, 'name' | 'desc' | 'audience' | 'modes'>>) => {
    setState(prev => ({
      ...prev,
      themes: prev.themes.map(t => {
        if (t.id !== themeId) return t;
        const nextName = typeof patch.name === 'string' ? patch.name.trim() : t.name;
        const nextDesc = typeof patch.desc === 'string' ? patch.desc.trim() : t.desc;
        const nextAudience = patch.audience || t.audience;
        const nextModes = patch.modes && patch.modes.length > 0 ? patch.modes : t.modes;

        return {
          ...t,
          name: nextName || t.name,
          desc: nextDesc,
          audience: nextAudience,
          modes: nextModes
        };
      })
    }));
  }, []);

  const addThemeTask = useCallback((themeId: string, taskText: string) => {
    const task = normalizeTask(taskText);
    if (!task) return;

    setState(prev => ({
      ...prev,
      themes: prev.themes.map(t => {
        if (t.id !== themeId) return t;
        if (t.tasks.some(item => getTaskKey(item) === getTaskKey(task))) return t;
        return { ...t, tasks: [...t.tasks, task] };
      })
    }));
  }, []);

  const updateThemeTask = useCallback((themeId: string, index: number, patch: Partial<TaskCard>) => {
    setState(prev => ({
      ...prev,
      themes: prev.themes.map(t => {
        if (t.id !== themeId) return t;
        if (index < 0 || index >= t.tasks.length) return t;

        return {
          ...t,
          tasks: t.tasks.map((task, taskIndex) => {
            if (taskIndex !== index) return task;

            return {
              ...task,
              text: typeof patch.text === 'string' ? patch.text.trim() || task.text : task.text,
              executor: patch.executor ? normalizeExecutor(patch.executor) : task.executor,
              moveDelta:
                typeof patch.moveDelta === 'number'
                  ? clampMoveDelta(patch.moveDelta)
                  : task.moveDelta
            };
          })
        };
      })
    }));
  }, []);

  const removeThemeTask = useCallback((themeId: string, index: number) => {
    setState(prev => ({
      ...prev,
      themes: prev.themes.map(t => {
        if (t.id !== themeId) return t;
        if (index < 0 || index >= t.tasks.length) return t;
        return { ...t, tasks: t.tasks.filter((_, i) => i !== index) };
      })
    }));
  }, []);

  const importThemeTasks = useCallback((themeId: string, tasks: unknown[], mode: 'append' | 'replace' = 'append') => {
    const cleaned = tasks
      .map(normalizeTask)
      .filter((t): t is TaskCard => !!t);

    if (cleaned.length === 0) return;

    setState(prev => ({
      ...prev,
      themes: prev.themes.map(t => {
        if (t.id !== themeId) return t;
        const base = mode === 'replace' ? [] : t.tasks;
        const seen = new Set<string>();
        const merged: TaskCard[] = [];

        for (const item of [...base, ...cleaned]) {
          const key = getTaskKey(item);
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(item);
        }

        return { ...t, tasks: merged };
      })
    }));
  }, []);

  const startGame = useCallback(() => {
    if (!canStartGameMode(state.gameMode, state.players, state.themes)) return false;

    const bingoBoard =
      state.gameMode === 'bingo'
        ? generateBingoBoard(buildBingoDecks(state.players, state.themes), BINGO_BOARD_SIZE)
        : null;

    setState(prev => ({
      ...prev,
      view: MODE_VIEW[prev.gameMode],
      turn: Math.random() < 0.5 ? 0 : 1,
      players: prev.players.map(p => ({ ...p, step: 0 })),
      boardMap: generateBoardMap(),
      pathCoords: generateSpiralPath(),
      mineBoard: generateMineBoard(),
      bingoBoard,
      isRolling: false
    }));
    return true;
  }, [state.gameMode, state.players, state.themes]);

  const drawCardTask = useCallback((): TaskEventData | null => {
    return createRandomTaskEvent(state.players, state.themes, state.turn);
  }, [state.players, state.themes, state.turn]);

  const revealMineTile = useCallback((index: number): MineRevealResult | null => {
    const tile = state.mineBoard[index];
    const activePlayer = state.players[state.turn];

    if (!tile || tile.revealed || !activePlayer) return null;

    setState(prev => ({
      ...prev,
      mineBoard: prev.mineBoard.map((item, itemIndex) =>
        itemIndex === index ? { ...item, revealed: true } : item
      )
    }));

    if (tile.type === 'bomb') return { type: 'bomb' };
    if (tile.type === 'blank') return { type: 'blank' };

    const choice: MineTaskChoice =
      tile.type === 'truth' ? 'truth' : tile.type === 'dare' ? 'dare' : 'theme';
    const task = createMineTaskEvent(state.players, state.themes, activePlayer.id, choice);

    return task ? { type: 'task', task } : { type: 'blank' };
  }, [state.mineBoard, state.players, state.themes, state.turn]);

  const chooseMineBombTask = useCallback((choice: MineTaskChoice): TaskEventData | null => {
    const activePlayer = state.players[state.turn];
    const opponent = state.players[state.turn === 0 ? 1 : 0];

    if (!activePlayer || !opponent) return null;

    return createMineTaskEvent(state.players, state.themes, activePlayer.id, choice, opponent.id);
  }, [state.players, state.themes, state.turn]);

  const completeBingoCell = useCallback((index: number): BingoCellResult | null => {
    const board = state.bingoBoard;
    const activePlayer = state.players[state.turn];
    if (!board || !activePlayer) return null;
    if (index < 0 || index >= board.cells.length) return null;
    if (board.cells[index].completedBy !== null) return null;

    const cells = board.cells.map((cell, cellIndex) =>
      cellIndex === index ? { ...cell, completedBy: activePlayer.id } : cell
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
      const opponent = state.players[state.turn === 0 ? 1 : 0];
      const opponentTheme = opponent ? state.themes.find(t => t.id === opponent.themeId) : undefined;
      const ownTheme = state.themes.find(t => t.id === activePlayer.themeId);
      const rewardTheme = opponentTheme && opponentTheme.tasks.length > 0 ? opponentTheme : ownTheme;
      if (rewardTheme && rewardTheme.tasks.length > 0) {
        rewardTask = chooseRandomTask(rewardTheme);
        rewardThemeName = rewardTheme.name;
      }
    }

    const nextBoard: BingoBoard = { ...board, cells, lines };
    setState(prev => ({ ...prev, bingoBoard: nextBoard }));

    return {
      newLines,
      rewardTask,
      rewardThemeName,
      boardComplete: cells.every(cell => cell.completedBy !== null)
    };
  }, [state.bingoBoard, state.players, state.themes, state.turn]);

  const restartBingo = useCallback(() => {
    setState(prev => {
      if (prev.gameMode !== 'bingo') return prev;
      if (!canStartWithThemeMode(prev.players, prev.themes, 'card')) return prev;
      return {
        ...prev,
        turn: Math.random() < 0.5 ? 0 : 1,
        players: prev.players.map(p => ({ ...p, step: 0 })),
        bingoBoard: generateBingoBoard(buildBingoDecks(prev.players, prev.themes), BINGO_BOARD_SIZE),
        isRolling: false
      };
    });
  }, []);

  const movePlayer = useCallback((steps: number) => {
    setState(prev => {
      const activePlayer = prev.players[prev.turn];
      const newStep = calculateNewPosition(activePlayer.step, steps);

      return {
        ...prev,
        players: prev.players.map(p =>
          p.id === activePlayer.id ? { ...p, step: newStep } : p
        )
      };
    });
  }, []);

  const endTurn = useCallback(() => {
    setState(prev => ({
      ...prev,
      turn: prev.turn === 0 ? 1 : 0,
      isRolling: false
    }));
  }, []);

  const setIsRolling = useCallback((rolling: boolean) => {
    setState(prev => ({ ...prev, isRolling: rolling }));
  }, []);

  const checkTile = useCallback((landingStep: number): TaskEventData | 'win' | null => {
    const activePlayer = state.players[state.turn];
    const opponent = state.players[state.turn === 0 ? 1 : 0];

    if (landingStep === 48) {
      return 'win';
    }

    if (landingStep !== 0 && landingStep === opponent.step) {
      const theme = state.themes.find(t => t.id === activePlayer.themeId);
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

    const tileType = state.boardMap[landingStep];

    if (tileType === 'lucky') {
      const theme = state.themes.find(t => t.id === activePlayer.themeId);
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
      const theme = state.themes.find(t => t.id === opponent.themeId);
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
  }, [state.players, state.turn, state.themes, state.boardMap]);

  const resolveTask = useCallback((task: TaskEventData, outcome: 'accept' | 'reject') => {
    setState(prev => {
      let nextPlayers = prev.players;

      if (outcome === 'accept' && task.moveDelta !== 0) {
        nextPlayers = prev.players.map(p =>
          p.id === task.executorPlayerId
            ? { ...p, step: applyMoveDelta(p.step, task.moveDelta) }
            : p
        );
      }

      if (
        outcome === 'reject' &&
        task.type !== 'card' &&
        task.type !== 'mineTruth' &&
        task.type !== 'mineDare' &&
        task.type !== 'mineTheme'
      ) {
        const backSteps = Math.floor(Math.random() * 3) + 1;
        nextPlayers = prev.players.map(p => {
          if (p.id !== task.executorPlayerId) return p;

          if (task.type === 'collision') {
            return { ...p, step: 0 };
          }

          return { ...p, step: Math.max(0, p.step - backSteps) };
        });
      }

      return {
        ...prev,
        players: nextPlayers,
        turn: prev.turn === 0 ? 1 : 0,
        isRolling: false
      };
    });
  }, []);

  const resetGame = useCallback(() => {
    setState(prev => ({
      ...prev,
      view: 'home',
      turn: 0,
      players: prev.players.map(player => ({ ...player, step: 0 })),
      boardMap: generateBoardMap(),
      pathCoords: generateSpiralPath(),
      mineBoard: generateMineBoard(),
      bingoBoard: null,
      isRolling: false
    }));
  }, []);

  return {
    state,
    switchView,
    selectGameMode,
    selectTheme,
    createTheme,
    replaceThemes,
    updateThemeMeta,
    addThemeTask,
    updateThemeTask,
    removeThemeTask,
    importThemeTasks,
    startGame,
    drawCardTask,
    revealMineTile,
    chooseMineBombTask,
    completeBingoCell,
    restartBingo,
    movePlayer,
    endTurn,
    setIsRolling,
    checkTile,
    resolveTask,
    resetGame
  };
}
