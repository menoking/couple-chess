import type { GameMode } from '../types';

export type Seat = 0 | 1;
export type Role = 'male' | 'female';

export interface OnlineCard {
  task: string;
  themeName: string;
}

/**
 * 抽卡四阶段（全部玩法共用）：
 * - locked   胜方尚未抽卡，败方显示锁定态，任何人都拿不到卡面
 * - drawn    胜方已抽取并看到卡面，败方解锁「翻卡查看」
 * - revealed 败方已翻卡，卡面双方可见
 */
export type CardPhase = 'locked' | 'drawn' | 'revealed';

export interface PendingCard {
  id: number;
  cardIndex: number;
  /** 抽卡人：胜方 */
  drawerSeat: Seat;
  /** 执行人：败方 */
  executorSeat: Seat;
  reason: string;
  phase: CardPhase;
  /** 明文卡面；locked 时为 null，drawn 时只下发给抽卡方 */
  card: OnlineCard | null;
}

export interface LobbyPick {
  themeIds: string[];
  locked: boolean;
}

/** 房间的唯一权威状态。房主持有，按座位裁剪后分别下发。 */
export interface RoomSnapshot {
  seq: number;
  mode: GameMode;
  turn: number;
  /** 座位 → 性别 */
  roles: [Role, Role];
  /** 先进房间的设备所在座位，负责裁决与跑计时器 */
  hostSeat: Seat;
  /** 双方卡包合并锁定后的公共题库 */
  cardPool: OnlineCard[];
  /** 双方各自选包时暂存的草稿题库 */
  draftPools: [OnlineCard[], OnlineCard[]];
  picks: [LobbyPick, LobbyPick];
  lobbyLocked: boolean;
  cards: PendingCard[];
  cardSeq: number;
  /** 所有玩法视图的共享局部状态，key 形如「视图名.变量名」 */
  data: Record<string, unknown>;
}

export type RoomAction =
  | { type: 'patch'; key: string; value: unknown; baseSeq: number; seat: Seat }
  | { type: 'endTurn'; seat: Seat }
  | { type: 'setTurn'; seat: Seat; turn: number }
  | { type: 'enqueueCard'; drawerSeat: Seat; executorSeat: Seat; reason: string; card?: OnlineCard }
  | { type: 'drawCard'; seat: Seat }
  | { type: 'revealCard'; seat: Seat }
  | { type: 'ackCard'; seat: Seat }
  | { type: 'pickThemes'; seat: Seat; themeIds: string[]; pool: OnlineCard[] }
  | { type: 'lockLobby'; seat: Seat; themeIds: string[]; pool: OnlineCard[] }
  | { type: 'unlockLobby'; seat: Seat }
  | { type: 'forceLobby'; seat: Seat; pool: OnlineCard[] }
  | { type: 'restart'; seat: Seat }
  | { type: 'replace'; snapshot: RoomSnapshot };
