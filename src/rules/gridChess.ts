export interface GridLineOwner {
  ownerId: number | null;
}

export interface GridChessState {
  horizontal: GridLineOwner[];
  vertical: GridLineOwner[];
  boxes: number[];
}

export const GRID_DOTS = 5;
export const GRID_CELLS = GRID_DOTS - 1;
export const GRID_HORIZONTAL_LINES = GRID_DOTS * GRID_CELLS;
export const GRID_VERTICAL_LINES = GRID_DOTS * GRID_CELLS;
export const GRID_TOTAL_BOXES = GRID_CELLS * GRID_CELLS;

export function adjacentGridBoxes(kind: 'h' | 'v', lineIndex: number): number[] {
  if (kind === 'h') {
    const row = Math.floor(lineIndex / GRID_CELLS);
    const column = lineIndex % GRID_CELLS;
    const result: number[] = [];
    if (row > 0) result.push((row - 1) * GRID_CELLS + column);
    if (row < GRID_DOTS - 1) result.push(row * GRID_CELLS + column);
    return result;
  }

  // 竖线索引 = column * GRID_CELLS + row
  const column = Math.floor(lineIndex / GRID_CELLS);
  const row = lineIndex % GRID_CELLS;
  const result: number[] = [];
  if (column > 0) result.push(row * GRID_CELLS + (column - 1));
  if (column < GRID_DOTS - 1) result.push(row * GRID_CELLS + column);
  return result;
}

export function isGridBoxClosed(
  boxIndex: number,
  horizontal: GridLineOwner[],
  vertical: GridLineOwner[]
): boolean {
  const row = Math.floor(boxIndex / GRID_CELLS);
  const column = boxIndex % GRID_CELLS;
  const top = horizontal[row * GRID_CELLS + column]?.ownerId != null;
  const bottom = horizontal[(row + 1) * GRID_CELLS + column]?.ownerId != null;
  const left = vertical[column * GRID_CELLS + row]?.ownerId != null;
  const right = vertical[(column + 1) * GRID_CELLS + row]?.ownerId != null;
  return top && bottom && left && right;
}

export function applyGridLine(
  state: GridChessState,
  kind: 'h' | 'v',
  lineIndex: number,
  ownerId: number
): { state: GridChessState; newlyClosed: number[] } | null {
  const lines = kind === 'h' ? state.horizontal : state.vertical;
  if (!Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex >= lines.length) return null;
  if (lines[lineIndex]?.ownerId != null) return null;

  const nextLines = lines.map((line, index) => index === lineIndex ? { ownerId } : line);
  const horizontal = kind === 'h' ? nextLines : state.horizontal;
  const vertical = kind === 'v' ? nextLines : state.vertical;
  const newlyClosed = adjacentGridBoxes(kind, lineIndex)
    .filter(boxIndex => state.boxes[boxIndex] === -1 && isGridBoxClosed(boxIndex, horizontal, vertical));
  const boxes = newlyClosed.length === 0
    ? state.boxes
    : state.boxes.map((owner, index) => newlyClosed.includes(index) ? ownerId : owner);

  return { state: { horizontal, vertical, boxes }, newlyClosed };
}
