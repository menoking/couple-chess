/**
 * 「不可重复抽取」的通用实现。
 *
 * 各玩法都有一批一次性内容（轮盘档位任务、真心话题目、剧本、姿势图…）。
 * 以前统一用 Math.random 直接取，同一局里会反复抽到同一条，体验很差。
 *
 * 这里用「已用 key 列表」记录抽过的条目：
 * - 池里还有没用过的 → 只从没用过的里抽，抽过的绝不再出现
 * - 池被抽空 → 自动重新洗牌（used 清空），开始下一轮
 *
 * 调用方把返回的 `used` 写回共享状态即可；联机时两端看到的是同一份记录，
 * 所以不会出现「你抽过的我这边还能抽到」。
 */
export interface FreshPick<T> {
  item: T;
  /** 抽完之后应该写回的已用 key 列表 */
  used: string[];
  /** 本次抽之前池已经空了，已重置一轮 */
  reset: boolean;
  /** 本轮还剩多少条没抽 */
  remaining: number;
}

/** 任务卡 key：文本 + 步数。同文本不同步数视为两张不同的卡。 */
export function taskKeyOf(task: { text: string; moveDelta?: number }): string {
  return `${task.text}:${task.moveDelta ?? 0}`;
}

export function pickFresh<T>(
  items: readonly T[],
  used: readonly string[] | undefined,
  keyOf: (item: T) => string
): FreshPick<T> | null {
  if (items.length === 0) return null;
  const keys = items.map(keyOf);
  // 只保留仍存在于池里的 key，防止题库改动后旧记录把整池判成已抽
  const usedSet = new Set((used ?? []).filter(key => keys.includes(key)));
  let candidates: readonly T[] = items.filter((_item, index) => !usedSet.has(keys[index]));
  let reset = false;
  if (candidates.length === 0) {
    candidates = items;
    usedSet.clear();
    reset = true;
  }
  const item = candidates[Math.floor(Math.random() * candidates.length)];
  const key = keyOf(item);
  const nextUsed = reset ? [key] : [...usedSet, key];
  return {
    item,
    used: nextUsed,
    reset,
    remaining: Math.max(0, keys.length - nextUsed.length)
  };
}
