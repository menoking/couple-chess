import { Player, TaskCard, TaskEventData, Theme } from '../types';
import { formatTaskInstruction, resolveTaskRule } from '../rules/taskRules';

export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * 确定性洗牌：给同一个种子必然得到同一个顺序。
 *
 * 联机时两个设备用同一个房间号当种子，各自算一次就能得到完全一致的题库 / 卡包 /
 * 牌面布局——不需要「等房主下发」，也就不会出现「开局卡在同步」。
 */
export function seededShuffle<T>(items: T[], seed: string): T[] {
  const result = [...items];
  let state = hashSeed(seed) || 1;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function pickRandom<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)];
}

export interface ThemeTaskEntry {
  task: TaskCard;
  themeId: string;
  themeName: string;
  playerId: number;
}

/** 收集双方所选主题下的全部任务（带来源信息），供各玩法抽取使用。 */
export function collectThemeTasks(players: Player[], themes: Theme[]): ThemeTaskEntry[] {
  const entries: ThemeTaskEntry[] = [];
  for (const player of players) {
    const theme = themes.find(t => t.id === player.themeId);
    if (!theme) continue;
    for (const task of theme.tasks) {
      entries.push({ task, themeId: theme.id, themeName: theme.name, playerId: player.id });
    }
  }
  return entries;
}

/** 读取主题的强度等级（1-5），无强度标签时按 3 处理。 */
export function themeIntensity(theme: Theme | undefined): number {
  if (!theme) return 3;
  const tag = theme.tags.find(t => t.kind === 'special' && t.type === 'intensity');
  return tag && tag.kind === 'special' ? tag.level : 3;
}

/** 为玩法内嵌的任务弹窗构建 TaskEventData（type 为 card，跳过即放弃）。 */
export function createViewTaskEvent(input: {
  entry: ThemeTaskEntry;
  title?: string;
  /** 执行任务的人 */
  executorPlayerId?: number;
  /** 抽卡的人（默认与执行人相同） */
  initiatorPlayerId?: number;
  continuation?: TaskEventData['continuation'];
}): TaskEventData {
  const { entry } = input;
  const fallbackPlayerId = input.executorPlayerId ?? entry.playerId;
  const initiatorId = input.initiatorPlayerId ?? fallbackPlayerId;
  const rule = resolveTaskRule(entry.task, fallbackPlayerId);
  return {
    type: 'card',
    initiatorPlayerId: initiatorId,
    executorPlayerId: rule.executorPlayerId,
    targetPlayerId: rule.targetPlayerId,
    executionMode: rule.executionMode,
    title: input.title ?? '任务',
    subtitle: `任务来自「${entry.themeName}」`,
    icon: 'sparkles',
    color: rule.executorPlayerId === 0 ? 'text-[#0A84FF]' : 'text-[#FF375F]',
    task: formatTaskInstruction(entry.task.text, rule),
    taskSourceId: entry.themeId,
    themeName: entry.themeName,
    moveDelta: 0,
    continuation: input.continuation
  };
}

/** 双方主题任务池；为空时返回 null（调用方应提示先选主题）。 */
export function buildTaskPool(players: Player[], themes: Theme[]): ThemeTaskEntry[] | null {
  const entries = collectThemeTasks(players, themes);
  return entries.length > 0 ? entries : null;
}
