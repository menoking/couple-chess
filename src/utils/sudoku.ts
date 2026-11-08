const SIZE = 9;
const BOX = 3;
const ALL_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export interface SudokuPuzzle {
  /** 完整解（81 格，按行优先） */
  solution: number[];
  /** 题面（81 格，0 表示空格） */
  puzzle: number[];
  /** 是否为题面给定格 */
  given: boolean[];
  /** 实际挖空数量（受唯一解约束，可能略少于目标） */
  blanks: number;
}

function shuffleCopy<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function canPlace(board: number[], index: number, value: number): boolean {
  const row = Math.floor(index / SIZE);
  const col = index % SIZE;

  for (let i = 0; i < SIZE; i++) {
    if (board[row * SIZE + i] === value) return false;
    if (board[i * SIZE + col] === value) return false;
  }

  const boxRow = Math.floor(row / BOX) * BOX;
  const boxCol = Math.floor(col / BOX) * BOX;
  for (let r = 0; r < BOX; r++) {
    for (let c = 0; c < BOX; c++) {
      if (board[(boxRow + r) * SIZE + (boxCol + c)] === value) return false;
    }
  }

  return true;
}

function fillBoard(board: number[]): boolean {
  const index = board.indexOf(0);
  if (index === -1) return true;

  for (const value of shuffleCopy(ALL_VALUES)) {
    if (!canPlace(board, index, value)) continue;
    board[index] = value;
    if (fillBoard(board)) return true;
    board[index] = 0;
  }

  return false;
}

/** 选择候选数最少的空格（MRV），显著加快解数统计 */
function findBestEmpty(board: number[]): number {
  let best = -1;
  let bestCount = 10;

  for (let index = 0; index < SIZE * SIZE; index++) {
    if (board[index] !== 0) continue;
    let candidates = 0;
    for (const value of ALL_VALUES) {
      if (canPlace(board, index, value)) candidates++;
    }
    if (candidates < bestCount) {
      bestCount = candidates;
      best = index;
      if (candidates <= 1) break;
    }
  }

  return best;
}

/** 统计解的个数，最多数到 limit 即提前返回 */
function countSolutions(board: number[], limit: number): number {
  const index = findBestEmpty(board);
  if (index === -1) return 1;

  let count = 0;
  for (const value of ALL_VALUES) {
    if (!canPlace(board, index, value)) continue;
    board[index] = value;
    count += countSolutions(board, limit - count);
    board[index] = 0;
    if (count >= limit) break;
  }

  return count;
}

/**
 * 生成一份**唯一解**数独：先随机回溯得到完整解，再逐格挖空，
 * 每次挖空后校验解仍然唯一，不唯一则回填。
 * @param blankCount 目标挖空数量（默认 12）
 */
export function generateSudoku(blankCount = 12): SudokuPuzzle {
  const solution = new Array<number>(SIZE * SIZE).fill(0);
  fillBoard(solution);

  const puzzle = [...solution];
  const order = shuffleCopy(Array.from({ length: SIZE * SIZE }, (_, i) => i));
  const target = Math.min(Math.max(blankCount, 0), SIZE * SIZE - 17);
  let removed = 0;

  for (const index of order) {
    if (removed >= target) break;
    const backup = puzzle[index];
    puzzle[index] = 0;

    if (countSolutions([...puzzle], 2) === 1) {
      removed++;
    } else {
      puzzle[index] = backup;
    }
  }

  return {
    solution,
    puzzle,
    given: puzzle.map(value => value !== 0),
    blanks: removed
  };
}
