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

export function formatTaskInstruction(text: string, rule: Pick<ResolvedTaskRule, 'label'>): string {
  return `【${rule.label}】${text.replace(ASSIGNMENT_PREFIX, '').trim()}`;
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
