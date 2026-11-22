import { BingoBoard, BingoCell, BingoLine, MineTile, MineTileType, TaskCard, TileType, PathCoord } from '../types';

const GRID_SIZE = 7;
const TILES_COUNT = 49;
export const MINE_BOARD_SIDE = 6;
export const MINE_TILES_COUNT = MINE_BOARD_SIDE * MINE_BOARD_SIDE;
export const MINE_BOMB_COUNT = 7;
export const BINGO_BOARD_SIZE = 4;

export interface BingoDeck {
  themeId: string;
  tasks: TaskCard[];
}

const BINGO_FALLBACK_TASK: TaskCard = { text: '亲一下对方，说一句喜欢', executor: 'both', moveDelta: 0 };

export function generateSpiralPath(): PathCoord[] {
  const path: PathCoord[] = [];
  let r = 0, c = 0, dr = 0, dc = 1;
  const visited: boolean[][] = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(false));

  for (let i = 0; i < TILES_COUNT; i++) {
    path[i] = { r, c };
    visited[r][c] = true;

    const nr = r + dr;
    const nc = c + dc;

    if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE && !visited[nr][nc]) {
      r = nr;
      c = nc;
    } else {
      if (dr === 0 && dc === 1) { dr = 1; dc = 0; }
      else if (dr === 1 && dc === 0) { dr = 0; dc = -1; }
      else if (dr === 0 && dc === -1) { dr = -1; dc = 0; }
      else if (dr === -1 && dc === 0) { dr = 0; dc = 1; }
      r += dr;
      c += dc;
    }
  }

  return path;
}

export function generateBoardMap(): TileType[] {
  const boardMap: TileType[] = new Array(TILES_COUNT).fill('blank');
  
  const availableIndices = [];
  for (let i = 1; i < TILES_COUNT - 1; i++) {
    availableIndices.push(i);
  }

  for (let i = availableIndices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [availableIndices[i], availableIndices[j]] = [availableIndices[j], availableIndices[i]];
  }

  for (let i = 0; i < 16; i++) {
    boardMap[availableIndices[i]] = 'lucky';
  }
  for (let i = 16; i < 32; i++) {
    boardMap[availableIndices[i]] = 'trap';
  }

  return boardMap;
}

export function mineNeighborIndices(index: number): number[] {
  const row = Math.floor(index / MINE_BOARD_SIDE);
  const col = index % MINE_BOARD_SIDE;
  const neighbors: number[] = [];

  for (let rowDelta = -1; rowDelta <= 1; rowDelta++) {
    for (let colDelta = -1; colDelta <= 1; colDelta++) {
      if (rowDelta === 0 && colDelta === 0) continue;
      const nextRow = row + rowDelta;
      const nextCol = col + colDelta;
      if (nextRow < 0 || nextRow >= MINE_BOARD_SIDE || nextCol < 0 || nextCol >= MINE_BOARD_SIDE) continue;
      neighbors.push(nextRow * MINE_BOARD_SIDE + nextCol);
    }
  }

  return neighbors;
}

/** 统一重算雷数并补齐旧存档没有的扫雷字段。 */
export function hydrateMineBoard(board: readonly MineTile[]): MineTile[] {
  return board.map((tile, index) => ({
    ...tile,
    adjacentMines: tile.type === 'bomb'
      ? 0
      : mineNeighborIndices(index).filter(neighbor => board[neighbor]?.type === 'bomb').length,
    revealedBy: tile.revealedBy === 0 || tile.revealedBy === 1 ? tile.revealedBy : null,
    flaggedBy: tile.flaggedBy === 0 || tile.flaggedBy === 1 ? tile.flaggedBy : null
  }));
}

export function generateMineBoard(random: () => number = Math.random): MineTile[] {
  const tileTypes: MineTileType[] = [
    ...new Array<MineTileType>(MINE_BOMB_COUNT).fill('bomb'),
    ...new Array<MineTileType>(8).fill('truth'),
    ...new Array<MineTileType>(8).fill('dare'),
    ...new Array<MineTileType>(5).fill('blank'),
    ...new Array<MineTileType>(8).fill('theme')
  ];

  for (let i = tileTypes.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [tileTypes[i], tileTypes[j]] = [tileTypes[j], tileTypes[i]];
  }

  return hydrateMineBoard(tileTypes.slice(0, MINE_TILES_COUNT).map(type => ({
    type,
    revealed: false,
    adjacentMines: 0,
    revealedBy: null,
    flaggedBy: null
  })));
}

export interface MineBoardReveal {
  board: MineTile[];
  type: MineTileType;
  revealedIndices: number[];
  completed: boolean;
  firstMoveProtected: boolean;
}

/**
 * 翻格的唯一规则实现：首击换雷、零区域连锁展开和归属计分均在这里原子完成。
 * 连锁展开只触发一个（玩家亲自点击的）事件，避免一次弹出十几张任务卡。
 */
export function revealMineBoard(
  input: readonly MineTile[],
  index: number,
  seat: 0 | 1
): MineBoardReveal | null {
  if (input.length !== MINE_TILES_COUNT || index < 0 || index >= input.length) return null;
  if (input[index].revealed || input[index].flaggedBy !== null) return null;

  let board = hydrateMineBoard(input);
  const isFirstMove = !board.some(tile => tile.revealed);
  let firstMoveProtected = false;

  if (isFirstMove && board[index].type === 'bomb') {
    const swapIndex = board.findIndex((tile, candidate) => candidate !== index && tile.type !== 'bomb');
    if (swapIndex >= 0) {
      const safeType = board[swapIndex].type;
      board = board.map((tile, candidate) => {
        if (candidate === index) return { ...tile, type: safeType };
        if (candidate === swapIndex) return { ...tile, type: 'bomb' as const };
        return tile;
      });
      board = hydrateMineBoard(board);
      firstMoveProtected = true;
    }
  }

  const primaryType = board[index].type;
  const revealSet = new Set<number>([index]);
  if (primaryType !== 'bomb' && board[index].adjacentMines === 0) {
    const queue = [index];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const neighbor of mineNeighborIndices(current)) {
        const tile = board[neighbor];
        if (!tile || tile.type === 'bomb' || tile.flaggedBy !== null || revealSet.has(neighbor)) continue;
        revealSet.add(neighbor);
        if (tile.adjacentMines === 0) queue.push(neighbor);
      }
    }
  }

  board = board.map((tile, candidate) => revealSet.has(candidate)
    ? { ...tile, revealed: true, revealedBy: seat, flaggedBy: null }
    : tile);
  const completed = board.every(tile => tile.type === 'bomb' || tile.revealed);

  return { board, type: primaryType, revealedIndices: [...revealSet], completed, firstMoveProtected };
}

export function toggleMineFlag(
  input: readonly MineTile[],
  index: number,
  seat: 0 | 1
): MineTile[] | null {
  if (input.length !== MINE_TILES_COUNT || index < 0 || index >= input.length) return null;
  const board = hydrateMineBoard(input);
  const tile = board[index];
  if (tile.revealed || board.every(item => item.type === 'bomb' || item.revealed)) return null;
  return board.map((item, candidate) => candidate === index
    ? { ...item, flaggedBy: item.flaggedBy === null ? seat : null }
    : item);
}

export function mineScores(board: readonly MineTile[]): [number, number] {
  const scores: [number, number] = [0, 0];
  for (const tile of board) {
    if (tile.type === 'bomb') {
      if (tile.revealedBy !== null) scores[tile.revealedBy] -= 2;
      if (!tile.revealed && tile.flaggedBy !== null) scores[tile.flaggedBy] += 2;
    } else if (tile.revealedBy !== null) {
      scores[tile.revealedBy] += 1;
    }
  }
  return scores;
}

export function calculateNewPosition(current: number, steps: number): number {
  const pathLength = 48;
  const roundTripLength = pathLength * 2;
  const position = ((current + steps) % roundTripLength + roundTripLength) % roundTripLength;

  return position <= pathLength ? position : roundTripLength - position;
}

export function rollDice(): number {
  return Math.floor(Math.random() * 6) + 1;
}

export function getBingoLines(size: number): number[][] {
  const lines: number[][] = [];

  for (let r = 0; r < size; r++) {
    lines.push(Array.from({ length: size }, (_, c) => r * size + c));
  }
  for (let c = 0; c < size; c++) {
    lines.push(Array.from({ length: size }, (_, r) => r * size + c));
  }
  lines.push(Array.from({ length: size }, (_, i) => i * size + i));
  lines.push(Array.from({ length: size }, (_, i) => i * size + (size - 1 - i)));

  return lines;
}

export function generateBingoBoard(decks: BingoDeck[], size: number = BINGO_BOARD_SIZE): BingoBoard {
  const candidates: BingoCell[] = [];
  const seen = new Set<string>();

  for (const deck of decks) {
    for (const task of deck.tasks) {
      const key = `${task.text}__${task.executor}__${task.moveDelta}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ task, themeId: deck.themeId, completedBy: null });
    }
  }

  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  const total = size * size;
  const picked: BingoCell[] = [];
  while (picked.length < total && candidates.length > 0) {
    picked.push(...candidates.slice(0, total - picked.length));
  }
  while (picked.length < total) {
    picked.push({ task: { ...BINGO_FALLBACK_TASK }, themeId: decks[0]?.themeId ?? '', completedBy: null });
  }

  const lines: BingoLine[] = getBingoLines(size).map(cells => ({ cells, completed: false }));

  return { size, cells: picked, lines };
}
