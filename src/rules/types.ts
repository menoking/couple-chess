import type { GameMode, TaskContinuation } from '../types';

export type Seat = 0 | 1;
export type Role = 'male' | 'female';
export const ROOM_PROTOCOL_VERSION = 2;

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
  /** 飞行棋任务完成后前进/后退的格数，确认时应用到执行人 */
  moveDelta: number;
  continuation?: TaskContinuation;
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
  /** 每个共享键最后一次成功写入时的房间 seq，用于拒绝同键的过期覆盖。 */
  dataSeq: Record<string, number>;
  /** 最近一次清空玩法 data 的 seq；更早快照发出的 patch 一律作废。 */
  dataResetSeq: number;
  /** 公共频道兜底快照携带的房主设备号，用于两端都自认房主时的仲裁 */
  hostId?: string;
}

export type RoomAction =
  | { type: 'patch'; key: string; value: unknown; baseSeq: number; seat: Seat }
  /** 同一帧内的多个 patch 合并上报：一回合只发一条消息，避免限流丢包 */
  | { type: 'patchBatch'; entries: Array<{ key: string; value: unknown }>; baseSeq: number; seat: Seat }
  | { type: 'endTurn'; seat: Seat; expectedTurn: number }
  | { type: 'setTurn'; seat: Seat; turn: number }
  | { type: 'enqueueCard'; seat: Seat; drawerSeat: Seat; executorSeat: Seat; reason: string; card?: OnlineCard; moveDelta?: number; continuation?: TaskContinuation }
  | { type: 'drawCard'; seat: Seat; cardId: number }
  | { type: 'revealCard'; seat: Seat; cardId: number }
  | { type: 'ackCard'; seat: Seat; cardId: number; outcome: 'accept' | 'skip' }
  /** 拍卖密封出价：价格只下发给本人，双方都提交后房主一次性公开 */
  | { type: 'sealBid'; seat: Seat; amount: number; round: number }
  /** 通用密封提交（默契问答等）：各自的选择只下发给本人，双方都提交后一次性公开 */
  | { type: 'sealSubmit'; scope: string; seat: Seat; round: number; value: string | number | null }
  /** 长按卡片 3 秒的逃生通道：对方退出/卡死时放掉这张卡 */
  | { type: 'forceCloseCard'; seat: Seat; cardId: number }
  | { type: 'pickThemes'; seat: Seat; themeIds: string[]; pool: OnlineCard[] }
  | { type: 'lockLobby'; seat: Seat; themeIds: string[]; pool: OnlineCard[] }
  | { type: 'unlockLobby'; seat: Seat }
  | { type: 'forceLobby'; seat: Seat; pool: OnlineCard[] }
  | { type: 'restart'; seat: Seat }
  | { type: 'bluffReady'; seat: Seat; round: number; dice: number[] }
  | { type: 'bluffChallenge'; seat: Seat; round: number }
  | { type: 'bluffNextRound'; seat: Seat; round: number; nextStarter: Seat }
  | { type: 'replace'; snapshot: RoomSnapshot };

export interface RoomActionEnvelope {
  protocolVersion: typeof ROOM_PROTOCOL_VERSION;
  actionId: string;
  deviceId: string;
  actorSeat: Seat;
  baseSeq: number;
  action: RoomAction;
}
