import type { Theme } from '../types';
import type { OnlineCard, RoomSnapshot, Seat } from './types';
import { normalizeCardPool } from './cards';

/** 一台设备选中的若干卡包 → 草稿题库。任务按文本去重。 */
export function picksToPool(themes: Theme[], themeIds: string[]): OnlineCard[] {
  const chosen = themes.filter(theme => themeIds.includes(theme.id));
  const seen = new Set<string>();
  const pool: OnlineCard[] = [];
  for (const theme of chosen) {
    for (const task of theme.tasks) {
      const text = task.text.trim();
      if (!text || seen.has(text)) continue;
      seen.add(text);
      pool.push({ task: text, themeName: theme.name });
    }
  }
  return pool;
}

/** 双方草稿合并成公共题库，仍按任务文本去重。 */
export function mergePools(a: OnlineCard[], b: OnlineCard[]): OnlineCard[] {
  const seen = new Set<string>();
  const pool: OnlineCard[] = [];
  for (const item of [...a, ...b]) {
    const text = item.task.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    pool.push({ task: text, themeName: item.themeName });
  }
  return normalizeCardPool(pool);
}

export function pickOf(state: RoomSnapshot, seat: Seat) {
  return state.picks[seat];
}

export function bothLocked(state: RoomSnapshot): boolean {
  return state.picks[0].locked && state.picks[1].locked;
}

/** 卡包已锁定才能开局；未锁定时房间停留在大厅。 */
export function lobbyReady(state: RoomSnapshot): boolean {
  return state.lobbyLocked && state.cardPool.length > 0;
}
