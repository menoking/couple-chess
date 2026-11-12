export type Seat = 0 | 1;

/** 云账号空间。联机房间 ID = 空间 ID + 玩法。 */
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
