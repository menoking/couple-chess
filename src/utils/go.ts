export const GO_SIZE = 9;
export const GO_CELLS = GO_SIZE * GO_SIZE;

export type GoBoard = Array<number | null>;

export function createGoBoard(): GoBoard {
  return new Array<number | null>(GO_CELLS).fill(null);
}

export function neighborIndices(index: number): number[] {
  const row = Math.floor(index / GO_SIZE);
  const col = index % GO_SIZE;
  const result: number[] = [];
  if (row > 0) result.push(index - GO_SIZE);
  if (row < GO_SIZE - 1) result.push(index + GO_SIZE);
  if (col > 0) result.push(index - 1);
  if (col < GO_SIZE - 1) result.push(index + 1);
  return result;
}

/** 取某个棋子所在的整块棋（同色相连）及其气 */
export function getGroup(board: GoBoard, index: number): { stones: number[]; liberties: number[] } {
  const color = board[index];
  if (color === null || color === undefined) return { stones: [], liberties: [] };

  const stones: number[] = [];
  const liberties = new Set<number>();
  const visited = new Set<number>();
  const stack = [index];

  while (stack.length > 0) {
    const current = stack.pop() as number;
    if (visited.has(current)) continue;
    visited.add(current);
    stones.push(current);

    for (const next of neighborIndices(current)) {
      const value = board[next];
      if (value === null) {
        liberties.add(next);
      } else if (value === color && !visited.has(next)) {
        stack.push(next);
      }
    }
  }

  return { stones, liberties: [...liberties] };
}

/** 移除所有无气的对方棋块，返回被提掉的子数 */
function removeDeadGroups(board: GoBoard, color: number): number {
  let removed = 0;
  const visited = new Set<number>();

  for (let index = 0; index < GO_CELLS; index++) {
    if (board[index] !== color || visited.has(index)) continue;
    const group = getGroup(board, index);
    group.stones.forEach(stone => visited.add(stone));
    if (group.liberties.length === 0) {
      group.stones.forEach(stone => {
        board[stone] = null;
      });
      removed += group.stones.length;
    }
  }

  return removed;
}

export function boardKey(board: GoBoard): string {
  return board.map(value => (value === null ? '.' : String(value))).join('');
}

export interface GoMoveResult {
  board: GoBoard;
  captured: number;
  koKey: string | null;
}

/**
 * 尝试落子。返回 null 表示非法（占用/禁入点/打劫）。
 * @param koKey 上一步留下的劫争禁着局面（禁止立即回到该局面）
 */
export function playMove(
  board: GoBoard,
  index: number,
  playerId: number,
  koKey: string | null
): GoMoveResult | null {
  if (index < 0 || index >= GO_CELLS) return null;
  if (board[index] !== null) return null;

  const beforeKey = boardKey(board);
  const next = [...board];
  next[index] = playerId;

  const opponent = playerId === 0 ? 1 : 0;
  const captured = removeDeadGroups(next, opponent);

  // 禁入点：既没提子，自己的棋块也没气
  if (captured === 0) {
    const ownGroup = getGroup(next, index);
    if (ownGroup.liberties.length === 0) return null;
  }

  const afterKey = boardKey(next);
  if (koKey !== null && afterKey === koKey) return null;

  return {
    board: next,
    captured,
    // 仅提一子时形成劫，记录落子前的局面作为禁着
    koKey: captured === 1 ? beforeKey : null
  };
}

export interface GoScore {
  stones: Record<number, number>;
  territory: Record<number, number>;
  area: Record<number, number>;
}

/** 中国规则数子：子 + 单方围住的空点 */
export function scoreGoBoard(board: GoBoard): GoScore {
  const stones: Record<number, number> = { 0: 0, 1: 0 };
  const territory: Record<number, number> = { 0: 0, 1: 0 };
  const visited = new Set<number>();

  for (let index = 0; index < GO_CELLS; index++) {
    const value = board[index];
    if (value !== null) stones[value] += 1;
  }

  for (let index = 0; index < GO_CELLS; index++) {
    if (board[index] !== null || visited.has(index)) continue;

    const region: number[] = [];
    const borders = new Set<number>();
    const stack = [index];

    while (stack.length > 0) {
      const current = stack.pop() as number;
      if (visited.has(current)) continue;
      visited.add(current);
      region.push(current);

      for (const next of neighborIndices(current)) {
        const value = board[next];
        if (value === null) {
          if (!visited.has(next)) stack.push(next);
        } else {
          borders.add(value);
        }
      }
    }

    if (borders.size === 1) {
      const owner = [...borders][0];
      territory[owner] += region.length;
    }
  }

  return {
    stones,
    territory,
    area: { 0: stones[0] + territory[0], 1: stones[1] + territory[1] }
  };
}
