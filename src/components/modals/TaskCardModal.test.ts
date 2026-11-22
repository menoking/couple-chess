import { describe, expect, it } from 'vitest';
import { TaskEventData } from '../../types';
import { getTaskCardIdentity } from './taskCardIdentity';

const task: TaskEventData = {
  type: 'card',
  initiatorPlayerId: 0,
  executorPlayerId: 1,
  targetPlayerId: 0,
  executionMode: 'directed',
  title: 'Bingo 任务',
  subtitle: '任务来自「默契」',
  icon: 'sparkles',
  color: 'text-white',
  task: '女方对男方说一句夸奖',
  taskSourceId: 'theme-bingo',
  moveDelta: 0
};

describe('getTaskCardIdentity', () => {
  it('联机快照重建同一张卡时保持稳定身份', () => {
    expect(getTaskCardIdentity({ ...task })).toBe(getTaskCardIdentity({ ...task }));
  });

  it('真正切换任务时生成不同身份', () => {
    expect(getTaskCardIdentity({ ...task, task: '女方拥抱男方十秒' }))
      .not.toBe(getTaskCardIdentity(task));
  });

  it('没有任务时不生成身份', () => {
    expect(getTaskCardIdentity(null)).toBeNull();
  });
});
