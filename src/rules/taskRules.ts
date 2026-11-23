import type { TaskCard, TaskExecutionMode } from '../types';

export interface ResolvedTaskRule {
  executionMode: TaskExecutionMode;
  executorPlayerId: 0 | 1;
  targetPlayerId: 0 | 1 | null;
  label: '男方 → 女方' | '女方 → 男方' | '双方一起';
}

const TOGETHER_CUES = /双方|两人|一起|共同|互相|彼此|轮流|各自|分别|同步|交换|一人.{0,8}另一人|你们/;
const ASSIGNMENT_PREFIX = /^【(?:男方\s*→\s*女方|女方\s*→\s*男方|双方一起)】/;

export function resolveTaskRule(task: Pick<TaskCard, 'text' | 'executor'>, fallbackExecutorPlayerId: number): ResolvedTaskRule {
  if (task.executor === 'male') {
    return { executionMode: 'directed', executorPlayerId: 0, targetPlayerId: 1, label: '男方 → 女方' };
  }
  if (task.executor === 'female') {
    return { executionMode: 'directed', executorPlayerId: 1, targetPlayerId: 0, label: '女方 → 男方' };
  }
  if (task.executor === 'together' || (task.executor === 'both' && TOGETHER_CUES.test(task.text))) {
    const confirmer = fallbackExecutorPlayerId === 1 ? 1 : 0;
    return { executionMode: 'together', executorPlayerId: confirmer, targetPlayerId: null, label: '双方一起' };
  }
  const executorPlayerId = fallbackExecutorPlayerId === 1 ? 1 : 0;
  const targetPlayerId = executorPlayerId === 0 ? 1 : 0;
  return {
    executionMode: 'directed',
    executorPlayerId,
    targetPlayerId,
    label: executorPlayerId === 0 ? '男方 → 女方' : '女方 → 男方'
  };
}

/**
 * 竞技奖励卡的适配级别：胜方是受益者，败方是执行者。
 * 0 = 固定为败方服务胜方；1 = 按回合分配给败方；2 = 双方共同；3 = 反向。
 */
export function rewardTaskTier(
  task: Pick<TaskCard, 'text' | 'executor'>,
  winnerPlayerId: number,
  loserPlayerId: number
): 0 | 1 | 2 | 3 {
  const rule = resolveTaskRule(task, loserPlayerId);
  if (rule.executionMode === 'together') return 2;
  if (rule.executorPlayerId !== loserPlayerId || rule.targetPlayerId !== winnerPlayerId) return 3;
  return task.executor === 'both' ? 1 : 0;
}

export function rewardCandidates<T>(
  items: readonly T[],
  taskOf: (item: T) => Pick<TaskCard, 'text' | 'executor'>,
  winner: number,
  loser: number
): T[] {
  const tiers: [T[], T[], T[]] = [[], [], []];
  for (const item of items) {
    const tier = rewardTaskTier(taskOf(item), winner, loser);
    if (tier !== 3) tiers[tier].push(item);
  }
  return tiers.find(tier => tier.length > 0) ?? [];
}

/** 所选卡包没有合适方向时使用，保证奖励永远不会反过来惩罚胜方。 */
export function createRewardFallbackTask(): TaskCard {
  return {
    text: '为胜方提供一次三分钟放松服务，内容由胜方从拥抱、按摩或亲吻中选择',
    executor: 'both',
    moveDelta: 0
  };
}

export function formatTaskInstruction(text: string, rule: Pick<ResolvedTaskRule, 'label'>): string {
  return `【${rule.label}】${taskBody(text)}`;
}

export function taskBody(text: string): string {
  return text.replace(ASSIGNMENT_PREFIX, '').trim();
}

/** 题库列表的静态说明；“随回合”会在出卡时解析成明确的男女方向。 */
export function describeStoredTaskRule(task: Pick<TaskCard, 'text' | 'executor'>): string {
  if (task.executor === 'male') return '男方 → 女方';
  if (task.executor === 'female') return '女方 → 男方';
  return task.executor === 'together' || TOGETHER_CUES.test(task.text)
    ? '双方一起'
    : '随回合：当前执行方 → 另一方';
}

export function normalizeLegacyTaskExecutor<T extends Pick<TaskCard, 'text' | 'executor'>>(task: T): T {
  return task.executor === 'both' && TOGETHER_CUES.test(task.text)
    ? { ...task, executor: 'together' }
    : task;
}

export function themeTaskRuleLabels(tasks: Array<Pick<TaskCard, 'text' | 'executor'>>): string[] {
  const labels = new Set(tasks.map(describeStoredTaskRule));
  return ['男方 → 女方', '女方 → 男方', '双方一起', '随回合：当前执行方 → 另一方']
    .filter(label => labels.has(label));
}
