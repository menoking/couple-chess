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

/**
 * 生成一份数独题面：先随机回溯得到一个完整解，再随机挖空。
 * @param blankCount 挖空数量（越大越难，默认 12）
 */
export function generateSudoku(blankCount = 12): SudokuPuzzle {
  const solution = new Array<number>(SIZE * SIZE).fill(0);
  fillBoard(solution);

  const order = shuffleCopy(Array.from({ length: SIZE * SIZE }, (_, i) => i));
  const targets = order.slice(0, Math.min(blankCount, SIZE * SIZE - 17));
  const puzzle = [...solution];
  const given = new Array<boolean>(SIZE * SIZE).fill(true);

  for (const index of targets) {
    puzzle[index] = 0;
    given[index] = false;
  }

  return { solution, puzzle, given };
}
