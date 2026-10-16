import { Player, TaskCard, TaskEventData, Theme } from '../types';

export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
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
  executorPlayerId?: number;
}): TaskEventData {
  const { entry } = input;
  const playerId = input.executorPlayerId ?? entry.playerId;
  return {
    type: 'card',
    initiatorPlayerId: playerId,
    executorPlayerId: playerId,
    title: input.title ?? '任务',
    subtitle: `任务来自「${entry.themeName}」`,
    icon: 'sparkles',
    color: playerId === 0 ? 'text-[#0A84FF]' : 'text-[#FF375F]',
    task: entry.task.text,
    taskSourceId: entry.themeId,
    moveDelta: 0
  };
}

/** 双方主题任务池；为空时返回 null（调用方应提示先选主题）。 */
export function buildTaskPool(players: Player[], themes: Theme[]): ThemeTaskEntry[] | null {
  const entries = collectThemeTasks(players, themes);
  return entries.length > 0 ? entries : null;
}
