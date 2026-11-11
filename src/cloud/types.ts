export type Seat = 0 | 1;

export interface RoomPlayer {
  seat: Seat;
  name: string;
  color: string;
}

/**
 * 一个玩法接入联机所需的全部契约：初始化、判定、以及「每个座位能看到什么」。
 * 私密信息靠 viewFor 裁剪，房主只把各自的视图单独下发。
 */
export interface GameAdapter<S, A, V> {
  mode: string;
  label: string;
  createInitial(players: RoomPlayer[]): S;
  /** 非法操作直接返回原 state */
  apply(state: S, action: A, seat: Seat): S;
  viewFor(state: S, seat: Seat): V;
  winnerOf(state: S): Seat | null;
}

export interface SpaceInfo {
  id: string;
  name: string;
  inviteCode: string;
  seat: Seat;
}

export interface MemberInfo {
  userId: string;
  seat: Seat;
  displayName: string | null;
}
