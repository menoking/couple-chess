export const JUNGLE_COLS = 7;
export const JUNGLE_ROWS = 9;
export const JUNGLE_CELLS = JUNGLE_COLS * JUNGLE_ROWS;

/** 鼠1 猫2 狗3 狼4 豹5 虎6 狮7 象8 */
export const PIECE_NAMES: Record<number, string> = {
  1: '鼠',
  2: '猫',
  3: '狗',
  4: '狼',
  5: '豹',
  6: '虎',
  7: '狮',
  8: '象'
};

export interface JunglePiece {
  id: number;
  owner: number;
  rank: number;
}

export type JungleBoard = Array<JunglePiece | null>;

export interface CellMeta {
  water: boolean;
  trap: boolean;
  trapOwner: number | null;
  den: boolean;
  denOwner: number | null;
}

const index = (row: number, col: number) => row * JUNGLE_COLS + col;
const posOf = (i: number) => ({ row: Math.floor(i / JUNGLE_COLS), col: i % JUNGLE_COLS });

const WATER_CELLS = new Set<number>();
for (let row = 3; row <= 5; row++) {
  for (const col of [1, 2, 4, 5]) {
    WATER_CELLS.add(index(row, col));
  }
}

/** 上方（1）的陷阱，下方（0）的陷阱 */
const TRAP_OWNER = new Map<number, number>([
  [index(0, 2), 1],
  [index(0, 4), 1],
  [index(1, 3), 1],
  [index(8, 2), 0],
  [index(8, 4), 0],
  [index(7, 3), 0]
]);

const DEN_OWNER = new Map<number, number>([
  [index(0, 3), 1],
  [index(8, 3), 0]
]);

export function cellMeta(i: number): CellMeta {
  const trapOwner = TRAP_OWNER.get(i) ?? null;
  const denOwner = DEN_OWNER.get(i) ?? null;
  return {
    water: WATER_CELLS.has(i),
    trap: trapOwner !== null,
    trapOwner,
    den: denOwner !== null,
    denOwner
  };
}

export function isWater(i: number): boolean {
  return WATER_CELLS.has(i);
}

export function createJungleBoard(): JungleBoard {
  const board: JungleBoard = new Array<JunglePiece | null>(JUNGLE_CELLS).fill(null);
  let nextId = 1;

  const place = (row: number, col: number, owner: number, rank: number) => {
    board[index(row, col)] = { id: nextId++, owner, rank };
  };

  // 上方玩家（1）
  place(0, 0, 1, 7); // 狮
  place(0, 6, 1, 6); // 虎
  place(1, 1, 1, 3); // 狗
  place(1, 5, 1, 2); // 猫
  place(2, 0, 1, 1); // 鼠
  place(2, 2, 1, 5); // 豹
  place(2, 4, 1, 4); // 狼
  place(2, 6, 1, 8); // 象

  // 下方玩家（0）
  place(6, 6, 0, 1); // 鼠
  place(6, 4, 0, 5); // 豹
  place(6, 2, 0, 4); // 狼
  place(6, 0, 0, 8); // 象
  place(7, 5, 0, 2); // 猫
  place(7, 1, 0, 3); // 狗
  place(8, 6, 0, 7); // 狮
  place(8, 0, 0, 6); // 虎

  return board;
}

function inBoard(row: number, col: number): boolean {
  return row >= 0 && row < JUNGLE_ROWS && col >= 0 && col < JUNGLE_COLS;
}

function orthogonalNeighbors(i: number): number[] {
  const { row, col } = posOf(i);
  const result: number[] = [];
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
    if (inBoard(row + dr, col + dc)) result.push(index(row + dr, col + dc));
  }
  return result;
}

/** 判断 a 能否吃掉 b（不含「敌方陷阱」这条，单独处理） */
function rankCanCapture(attackerRank: number, defenderRank: number): boolean {
  if (attackerRank === 1 && defenderRank === 8) return true; // 鼠吃象
  if (attackerRank === 8 && defenderRank === 1) return false; // 象吃不了鼠
  return attackerRank >= defenderRank;
}

function canCapture(
  from: number,
  to: number,
  attacker: JunglePiece,
  defender: JunglePiece
): boolean {
  const targetMeta = cellMeta(to);

  // 站在敌方陷阱里，任何棋子都能吃
  if (targetMeta.trap && targetMeta.trapOwner !== defender.owner) return true;

  const attackerInWater = isWater(from);
  const defenderInWater = isWater(to);

  // 水陆互不相犯
  if (attackerInWater !== defenderInWater) return false;
  // 水中互吃（只有鼠能在水里）
  if (attackerInWater && defenderInWater) return true;

  return rankCanCapture(attacker.rank, defender.rank);
}

/** 狮、虎跳河：返回可跳到的落点，或 null */
function jumpTarget(board: JungleBoard, from: number, to: number, rank: number): number | null {
  if (rank !== 6 && rank !== 7) return null;

  const a = posOf(from);
  const b = posOf(to);
  if (a.row !== b.row && a.col !== b.col) return null;

  const dr = Math.sign(b.row - a.row);
  const dc = Math.sign(b.col - a.col);
  const distance = Math.abs(b.row - a.row) + Math.abs(b.col - a.col);
  if (distance < 2) return null;

  // 路径必须全是水，且水中不能有鼠
  for (let step = 1; step < distance; step++) {
    const row = a.row + dr * step;
    const col = a.col + dc * step;
    if (!inBoard(row, col)) return null;
    const cell = index(row, col);
    if (!isWater(cell)) return null;
    if (board[cell] !== null) return null;
  }

  // 落点必须在棋盘内且不是水
  if (!inBoard(b.row, b.col)) return null;
  const landing = index(b.row, b.col);
  if (isWater(landing)) return null;

  return landing;
}

/** 某颗棋子的全部合法落点（用于高亮） */
export function getLegalMoves(board: JungleBoard, from: number): number[] {
  const piece = board[from];
  if (!piece) return [];

  const moves = new Set<number>();

  for (const to of orthogonalNeighbors(from)) {
    const target = board[to];
    if (!target) {
      if (!cellMeta(to).den || cellMeta(to).denOwner !== piece.owner) moves.add(to);
      continue;
    }
    if (target.owner === piece.owner) continue;
    if (canCapture(from, to, piece, target)) moves.add(to);
  }

  // 跳河：沿四个方向找更远的落点
  const { row, col } = posOf(from);
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
    for (let step = 2; step <= 3; step++) {
      const toRow = row + dr * step;
      const toCol = col + dc * step;
      if (!inBoard(toRow, toCol)) break;
      const to = index(toRow, toCol);
      const landing = jumpTarget(board, from, to, piece.rank);
      if (landing === null || landing !== to) continue;
      const target = board[to];
      if (!target) {
        moves.add(to);
      } else if (target.owner !== piece.owner && canCapture(from, to, piece, target)) {
        moves.add(to);
      }
    }
  }

  return [...moves];
}

export interface JungleMoveResult {
  board: JungleBoard;
  captured: JunglePiece | null;
  winner: number | null;
}

export function applyMove(board: JungleBoard, from: number, to: number): JungleMoveResult | null {
  const piece = board[from];
  if (!piece) return null;

  const legal = getLegalMoves(board, from);
  if (!legal.includes(to)) return null;

  const target = board[to];
  const next = [...board];
  next[to] = piece;
  next[from] = null;

  const meta = cellMeta(to);
  let winner: number | null = null;

  // 进入对方兽穴即获胜
  if (meta.den && meta.denOwner !== piece.owner) {
    winner = piece.owner;
  }

  const opponent = piece.owner === 0 ? 1 : 0;
  if (next.every(cell => !cell || cell.owner !== opponent)) {
    winner = piece.owner;
  }

  return {
    board: next,
    captured: target && target.owner !== piece.owner ? target : null,
    winner
  };
}
