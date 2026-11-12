import type { Player, Theme } from '../types';
import type { Role, Seat } from './types';

/** 性别 = 座位身份：男方恒坐 0 号位，女方恒坐 1 号位。 */
export const seatOfRole = (role: Role): Seat => (role === 'male' ? 0 : 1);
export const roleOfSeat = (seat: Seat): Role => (seat === 0 ? 'male' : 'female');
export const otherSeat = (seat: Seat): Seat => (seat === 0 ? 1 : 0);

/**
 * 两台设备各选自己的性别，房间内必须一男一女。
 * 若与房主撞性别，后进设备自动取另一端并给出提示，避免两端抢同一座位。
 */
export function resolveSeats(
  myRole: Role,
  hostRole: Role
): { mySeat: Seat; hostSeat: Seat; effectiveRole: Role; flipped: boolean } {
  const flipped = myRole === hostRole;
  const effectiveRole: Role = flipped ? (myRole === 'male' ? 'female' : 'male') : myRole;
  return {
    mySeat: seatOfRole(effectiveRole),
    hostSeat: seatOfRole(hostRole),
    effectiveRole,
    flipped
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
