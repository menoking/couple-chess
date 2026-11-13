import type { Player, Theme } from '../types';
import type { Role, Seat } from './types';

/** 性别 = 座位身份：男方恒坐 0 号位，女方恒坐 1 号位。 */
export const seatOfRole = (role: Role): Seat => (role === 'male' ? 0 : 1);
export const roleOfSeat = (seat: Seat): Role => (seat === 0 ? 'male' : 'female');
export const otherSeat = (seat: Seat): Seat => (seat === 0 ? 1 : 0);

export interface SeatAssignment {
  mySeat: Seat;
  hostSeat: Seat;
  effectiveRole: Role;
  /** 自己选的性别被别人占用，被迫换到另一端 */
  flipped: boolean;
}

/**
 * 座位分配（唯一入口）：
 * - 房主：坐自己性别对应的座位，**绝不翻转**；
 * - 访客：优先坐自己性别对应的座位，只有和房主撞座时才换到另一端。
 *
 * 关键点：hostSeat 必须来自房间 Presence 的真实座位，不能拿「房主性别」反推，
 * 否则房主传入自己时会跟自己撞座，男方进来被显示成女方。
 */
export function assignSeats(input: {
  myRole: Role;
  hostSeat: Seat;
  isHost: boolean;
}): SeatAssignment {
  if (input.isHost) {
    const seat = seatOfRole(input.myRole);
    return { mySeat: seat, hostSeat: seat, effectiveRole: input.myRole, flipped: false };
  }

  const preferred = seatOfRole(input.myRole);
  const mySeat = preferred === input.hostSeat ? otherSeat(input.hostSeat) : preferred;
  return {
    mySeat,
    hostSeat: input.hostSeat,
    effectiveRole: roleOfSeat(mySeat),
    flipped: mySeat !== preferred
  };
}

export const PLAYER_NAME: Record<Role, string> = { male: '男方', female: '女方' };
export const PLAYER_COLOR: Record<Role, string> = { male: '#0A84FF', female: '#FF375F' };

/** 按角色构造玩家；登录态下先手归「我」，主题包指向双方合并后的公共卡池。 */
export function buildOnlinePlayers(roles: [Role, Role], mergedThemeId: string | null): Player[] {
  return ([0, 1] as Seat[]).map(seat => ({
    id: seat,
    name: PLAYER_NAME[roles[seat]],
    color: PLAYER_COLOR[roles[seat]],
    role: roles[seat],
    step: 0,
    themeId: mergedThemeId
  }));
}

export const MERGED_THEME_ID = '__online-merged__';

/** 把双方选中的卡包合成一个公共主题，供 24 个玩法用同一套 props 读取。 */
export function buildMergedTheme(tasks: Theme['tasks'], allModes: Theme['modes']): Theme {
  return {
    id: MERGED_THEME_ID,
    name: '双端合并卡包',
    desc: '两台设备各自选择后合并锁定的公共题库',
    audience: 'common',
    modes: allModes,
    tasks,
    tags: []
  };
}
