import { TaskEventData } from '../../types';

/**
 * React 父组件可能在每次联机快照时重建 taskData 对象。只按对象引用判断会把
 * 同一张已翻开的卡误当成新卡，因此用卡片的业务字段生成稳定身份。
 */
export function getTaskCardIdentity(taskData: TaskEventData | null): string | null {
  if (!taskData) return null;
  return JSON.stringify([
    taskData.type,
    taskData.initiatorPlayerId,
    taskData.executorPlayerId,
    taskData.targetPlayerId,
    taskData.executionMode,
    taskData.title,
    taskData.task,
    taskData.taskSourceId,
    taskData.moveDelta,
    taskData.continuation ?? null
  ]);
}
