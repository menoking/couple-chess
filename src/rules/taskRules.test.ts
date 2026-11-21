import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_THEMES } from '../data/defaultThemes';
import type { Theme } from '../types';
import { picksToPool } from './lobby';
import { chooseRandomTheme } from './modeRules';
import {
  describeStoredTaskRule,
  formatTaskInstruction,
  resolveTaskRule,
  themeTaskRuleLabels
} from './taskRules';

describe('task execution rules', () => {
  it.each([
    { executor: 'male' as const, fallback: 1, label: '男方 → 女方', actor: 0, target: 1 },
    { executor: 'female' as const, fallback: 0, label: '女方 → 男方', actor: 1, target: 0 },
    { executor: 'together' as const, fallback: 0, label: '双方一起', actor: 0, target: null },
    { executor: 'both' as const, fallback: 1, label: '女方 → 男方', actor: 1, target: 0 }
  ])('resolves $executor into one exact card relation', ({ executor, fallback, label, actor, target }) => {
    const rule = resolveTaskRule({ text: '完成指定任务', executor }, fallback);
    expect(rule).toMatchObject({ label, executorPlayerId: actor, targetPlayerId: target });
    expect(formatTaskInstruction('完成指定任务', rule)).toBe(`【${label}】完成指定任务`);
  });

  it('does not duplicate an assignment prefix when a saved card is rendered again', () => {
    const rule = resolveTaskRule({ text: '任务', executor: 'male' }, 1);
    expect(formatTaskInstruction('【女方 → 男方】任务', rule)).toBe('【男方 → 女方】任务');
  });

  it('audits every built-in pack and card into a clear displayed rule', () => {
    const tasks = DEFAULT_THEMES.flatMap(theme => theme.tasks);
    expect(DEFAULT_THEMES.length).toBeGreaterThan(10);
    expect(tasks.length).toBeGreaterThan(1000);

    for (const theme of DEFAULT_THEMES) {
      expect(theme.tasks.length, theme.name).toBeGreaterThan(0);
      expect(themeTaskRuleLabels(theme.tasks).length, theme.name).toBeGreaterThan(0);
      for (const task of theme.tasks) {
        expect(['male', 'female', 'both', 'together']).toContain(task.executor);
        // 内置旧题库中有共同语义的 both 已在加载时升级为 together。
        if (task.executor === 'both') {
          expect(describeStoredTaskRule(task)).toBe('随回合：当前执行方 → 另一方');
        }
        for (const fallback of [0, 1]) {
          const rule = resolveTaskRule(task, fallback);
          expect(['男方 → 女方', '女方 → 男方', '双方一起']).toContain(rule.label);
          expect(formatTaskInstruction(task.text, rule)).toMatch(/^【(?:男方 → 女方|女方 → 男方|双方一起)】\S/);
          if (rule.executionMode === 'together') {
            expect(rule.targetPlayerId).toBeNull();
          } else {
            expect(rule.targetPlayerId).toBe(rule.executorPlayerId === 0 ? 1 : 0);
          }
        }
      }
    }
  });

  it('preserves executor metadata when selected packs become an online pool', () => {
    const theme: Theme = {
      id: 'rules',
      name: '规则包',
      desc: '',
      audience: 'common',
      modes: ['card'],
      tags: [],
      tasks: [
        { text: '男方任务', executor: 'male', moveDelta: 0 },
        { text: '共同任务', executor: 'together', moveDelta: 0 }
      ]
    };
    expect(picksToPool([theme], [theme.id])).toEqual([
      { task: '男方任务', themeName: '规则包', executor: 'male' },
      { task: '共同任务', themeName: '规则包', executor: 'together' }
    ]);
  });

  it('random selection only picks a pack allowed for the current role and mode', () => {
    const allowed = DEFAULT_THEMES.filter(theme => theme.audience !== 'female' && theme.modes.includes('board'));
    expect(allowed.length).toBeGreaterThan(0);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const picked = chooseRandomTheme(DEFAULT_THEMES, 'male', 'board');
    expect(picked?.id).toBe(allowed[0].id);
    vi.restoreAllMocks();
  });
});
