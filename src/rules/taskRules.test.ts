import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_THEMES } from '../data/defaultThemes';
import type { Theme } from '../types';
import { picksToPool } from './lobby';
import { cardForReward } from './cards';
import { chooseRandomTheme } from './modeRules';
import { competitionSafePool, pickRewardTask, type ThemeTaskEntry } from '../utils/modeKit';
import {
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
    expect(formatTaskInstruction('完成指定任务', rule)).toBe(`${target === null ? '双方' : actor === 0 ? '男方' : '女方'}完成指定任务`);
  });

  it('does not duplicate an assignment prefix when a saved card is rendered again', () => {
    const rule = resolveTaskRule({ text: '任务', executor: 'male' }, 1);
    expect(formatTaskInstruction('【女方 → 男方】任务', rule)).toBe('男方任务');
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
        for (const fallback of [0, 1]) {
          const rule = resolveTaskRule(task, fallback);
          expect(['男方 → 女方', '女方 → 男方', '双方一起']).toContain(rule.label);
          expect(formatTaskInstruction(task.text, rule)).not.toMatch(/^【(?:男方|女方|双方一起)/);
          if (rule.executionMode === 'together') {
            expect(rule.targetPlayerId).toBeNull();
          } else {
            expect(rule.targetPlayerId).toBe(rule.executorPlayerId === 0 ? 1 : 0);
          }
        }
      }
    }
  });

  it.each([0, 1] as const)('spells out both actions in the ear-whisper card for winner %i', winner => {
    const task = DEFAULT_THEMES.flatMap(theme => theme.tasks).find(card => card.text.startsWith('执行方贴近接受方耳边'))!;
    const loser = 1 - winner;
    const rule = resolveTaskRule(task, loser);
    const names = ['男方', '女方'];
    expect(rule).toMatchObject({ executorPlayerId: loser, targetPlayerId: winner });
    expect(formatTaskInstruction(task.text, rule)).toBe(
      `${names[loser]}贴近${names[winner]}耳边，说出一个想触碰的位置。${names[winner]}先用眼神回应，暂时不进行触碰`
    );
  });

  it('follows the provider in the sentence even when a legacy tag conflicts', () => {
    const task = { text: '女方接受男方的肩部按摩', executor: 'female' as const };
    expect(rewardTaskTier(task, 1, 0)).toBe(0);
    expect(rewardTaskTier(task, 0, 1)).toBe(3);
  });

  it('uses reviewed wording for a flexible reward that was previously excluded', () => {
    const original = { text: '对方闭上眼睛给你涂口红', executor: 'both' as const };
    for (const winner of [0, 1]) {
      const loser = 1 - winner;
      const rule = resolveTaskRule(original, loser);
      expect(rewardTaskTier(original, winner, loser)).toBe(1);
      expect(formatTaskInstruction(original.text, rule)).toBe(
        winner === 0 ? '女方闭上眼睛，为男方涂口红。' : '男方闭上眼睛，为女方涂口红。'
      );
    }
  });

  it('keeps a reviewed direction in both built-in packs and old online copies', () => {
    const original = { text: '女方被男方公主抱在房内绕一圈', executor: 'female' as const };
    const card = DEFAULT_THEMES.find(theme => theme.name === '情侣版')!.tasks[10];
    for (const task of [original, card]) {
      expect(rewardTaskTier(task, 0, 1)).toBe(3);
      expect(rewardTaskTier(task, 1, 0)).toBe(0);
      expect(formatTaskInstruction(task.text, resolveTaskRule(task, 0))).toBe('男方公主抱起女方，在房间里绕一圈。');
    }
  });

  it('leaves unresolved reviewed cards out of both reward directions', () => {
    const uncertain = { text: '让对方选择一个脸颊或额头亲吻', executor: 'both' as const };
    expect(rewardTaskTier(uncertain, 0, 1)).toBe(3);
    expect(rewardTaskTier(uncertain, 1, 0)).toBe(3);
  });

  it('separates the perspective from the provider in requests to the other person', () => {
    const task = { text: '闭眼让对方按摩你的肩膀', executor: 'both' as const };
    const rule = resolveTaskRule(task, 0);
    expect(rule).toMatchObject({ executorPlayerId: 0, targetPlayerId: 1, perspectivePlayerId: 1 });
    expect(formatTaskInstruction(task.text, rule)).toBe('女方闭眼让男方按摩女方的肩膀');
    expect(rewardTaskTier({ text: '先聊一分钟，再由对方决定谁来做', executor: 'both' }, 1, 0)).toBe(3);
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
