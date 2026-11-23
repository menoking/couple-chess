import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_THEMES } from '../data/defaultThemes';
import type { Theme } from '../types';
import { picksToPool } from './lobby';
import { cardForReward } from './cards';
import { chooseRandomTheme } from './modeRules';
import { competitionSafePool, pickRewardTask, type ThemeTaskEntry } from '../utils/modeKit';
import {
  describeStoredTaskRule,
  formatTaskInstruction,
  resolveTaskRule,
  rewardTaskTier,
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

  it.each([
    { winner: 0, loser: 1, expected: '女方奖励男方' },
    { winner: 1, loser: 0, expected: '男方奖励女方' }
  ])('never picks a reverse-direction reward when seat $winner wins', ({ winner, loser, expected }) => {
    const entries: ThemeTaskEntry[] = [
      { task: { text: '男方奖励女方', executor: 'male', moveDelta: 0 }, themeId: 't', themeName: 't', playerId: 0 },
      { task: { text: '女方奖励男方', executor: 'female', moveDelta: 0 }, themeId: 't', themeName: 't', playerId: 1 },
      { task: { text: '说一句赞美', executor: 'both', moveDelta: 0 }, themeId: 't', themeName: 't', playerId: 1 },
      { task: { text: '一起散步', executor: 'together', moveDelta: 0 }, themeId: 't', themeName: 't', playerId: 1 }
    ];
    const picked = pickRewardTask(entries, winner, loser);
    expect(picked.task.text).toBe(expected);
    expect(rewardTaskTier(picked.task, winner, loser)).toBeLessThan(2);
  });

  it('uses a neutral fallback instead of punishing the winner when a pack only has reverse cards', () => {
    const reverseOnly: ThemeTaskEntry[] = [{
      task: { text: '男方服务女方', executor: 'male', moveDelta: 0 },
      themeId: 'reverse',
      themeName: '反向包',
      playerId: 0
    }];
    const picked = pickRewardTask(reverseOnly, 0, 1);
    expect(picked.themeName).toBe('胜者奖励');
    expect(rewardTaskTier(picked.task, 0, 1)).toBe(1);
  });

  it('keeps pre-dealt competition decks safe for either winner and filters online rewards by direction', () => {
    const entries: ThemeTaskEntry[] = DEFAULT_THEMES.flatMap((theme, themeIndex) =>
      theme.tasks.map(task => ({ task, themeId: theme.id, themeName: theme.name, playerId: themeIndex % 2 }))
    );
    const safe = competitionSafePool(entries);
    expect(safe.length).toBeGreaterThan(0);
    expect(safe.every(entry => rewardTaskTier(entry.task, 0, 1) < 3)).toBe(true);
    expect(safe.every(entry => rewardTaskTier(entry.task, 1, 0) < 3)).toBe(true);

    const onlinePool = [
      { task: '男方服务女方', themeName: '固定男方', executor: 'male' as const },
      { task: '女方服务男方', themeName: '固定女方', executor: 'female' as const }
    ];
    expect(cardForReward(onlinePool, 1, 0, 1)).toMatchObject({ themeName: '固定女方' });
    expect(cardForReward(onlinePool, 1, 1, 0)).toMatchObject({ themeName: '固定男方' });
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
