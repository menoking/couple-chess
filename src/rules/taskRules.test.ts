import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_THEMES } from '../data/defaultThemes';
import type { Theme } from '../types';
import { picksToPool } from './lobby';
import { cardForReward } from './cards';
import { chooseRandomTheme } from './modeRules';
import { competitionSafePool, pickRewardTask, type ThemeTaskEntry } from '../utils/modeKit';
import {
  displayQueuedTask,
  formatTaskInstruction,
  resolveTaskRule,
  rewardTaskTier,
  themeTaskRuleLabels
} from './taskRules';

describe('task execution rules', () => {
  it.each([0, 1] as const)('assigns the person providing guidance independently from the person directing it (%i)', executor => {
    const task = { text: '让对方用语言指导你的手，完成一次边缘刺激', executor: 'both' as const };
    const rule = resolveTaskRule(task, executor);
    const [actor, recipient] = executor === 0 ? ['男方', '女方'] : ['女方', '男方'];
    expect(rule).toMatchObject({ executorPlayerId: executor, targetPlayerId: 1 - executor });
    expect(formatTaskInstruction(task.text, rule)).toBe(
      `${actor}用手为${recipient}提供刺激。${recipient}用语言告诉${actor}如何调整节奏。`
    );
  });

  it('treats reciprocal action, alternation, and an ambiguous pronoun differently', () => {
    const reciprocal = { text: '和对方深情接吻30秒', executor: 'both' as const };
    const alternate = { text: '一方蒙眼接受亲吻、手部刺激和口交，结束后交换角色', executor: 'both' as const };
    const ambiguous = { text: '让TA带上眼罩舔自己任意部位', executor: 'both' as const };
    expect(rewardTaskTier(reciprocal, 1, 0)).toBe(2);
    expect(formatTaskInstruction(reciprocal.text, resolveTaskRule(reciprocal, 0))).toBe('双方深情接吻30秒');
    expect(formatTaskInstruction(alternate.text, resolveTaskRule(alternate, 0))).toMatch(/^第一轮由一方/);
    expect(rewardTaskTier(ambiguous, 1, 0)).toBe(3);
    expect(rewardTaskTier(ambiguous, 0, 1)).toBe(3);
  });
  it.each([0, 1] as const)('keeps shared setup separate from the assigned speaker (executor %s)', executor => {
    const original = '牵手坐在一起，用一句话描述此刻最想靠近的地方';
    const speaker = executor === 0 ? '男方' : '女方';
    const listener = executor === 0 ? '女方' : '男方';
    const expected = `双方牵手坐在一起。${speaker}用一句话向${listener}描述此刻最想靠近的地方。`;
    const current = DEFAULT_THEMES.find(theme => theme.name === '暧昧开场')!.tasks[2];
    for (const task of [current, { text: original, executor: 'together' as const }]) {
      expect(rewardTaskTier(task, 1 - executor, executor)).toBe(1);
      expect(formatTaskInstruction(task.text, resolveTaskRule(task, executor))).toBe(expected);
    }
    expect(displayQueuedTask(speaker + original, executor, 'directed')).toBe(expected);
    expect(displayQueuedTask(expected, executor, 'directed')).toBe(expected);
  });

  it('distinguishes a wholly shared activity from one with an assigned speaker', () => {
    const mutual = { text: '手牵手30秒', executor: 'both' as const };
    const mixed = { text: '面对面坐好，然后说一句感谢', executor: 'together' as const };
    expect(formatTaskInstruction(mutual.text, resolveTaskRule(mutual, 1))).toBe('双方手牵手30秒');
    expect(formatTaskInstruction(mixed.text, resolveTaskRule(mixed, 1))).toBe('双方面对面坐好。女方说一句感谢');
  });
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

  it.each([0, 1] as const)('lets the winner choose where the loser kisses them (%i)', winner => {
    const original = { text: '让对方选择一个脸颊或额头亲吻', executor: 'both' as const };
    const current = DEFAULT_THEMES.find(theme => theme.id === 'mine_dare_default')!.tasks
      .find(task => task.text === '接受方选择脸颊或额头。执行方亲吻接受方选的位置。')!;
    const loser = winner === 0 ? 1 : 0;
    const [receiver, giver] = winner === 0 ? ['男方', '女方'] : ['女方', '男方'];
    for (const task of [original, current]) {
      expect(rewardTaskTier(task, winner, loser)).toBe(1);
      const rule = resolveTaskRule(task, loser);
      expect(rule).toMatchObject({ executorPlayerId: loser, targetPlayerId: winner });
      expect(formatTaskInstruction(task.text, rule)).toBe(`${receiver}选择脸颊或额头。${giver}亲吻${receiver}选的位置。`);
    }
  });

  it('leaves unresolved reviewed cards out of both reward directions', () => {
    const uncertain = { text: '让对方平躺，把腿架在肩膀上，仔细观察私密部位10秒', executor: 'both' as const };
    expect(rewardTaskTier(uncertain, 0, 1)).toBe(3);
    expect(rewardTaskTier(uncertain, 1, 0)).toBe(3);
  });

  it.each([0, 1] as const)('applies confirmed roles to all three cards for winner %i', winner => {
    const loser = 1 - winner;
    const actor = loser === 0 ? '男方' : '女方';
    const receiver = winner === 0 ? '男方' : '女方';
    const cases = [
      ['让对方选一件饰品或袜子先取下，并说明理由', `${actor}从自己身上的饰品或袜子中选一件，取下来，并向${receiver}说明选择它的理由。`],
      ['对方坐下，自己躺下，将头枕在对方腿上，对视15秒', `${actor}坐好。${receiver}把头枕在${actor}腿上，双方对视15秒。`],
      ['把下一分钟的主动权交给对方安排', `${receiver}安排接下来一分钟的活动。双方确认都愿意后，由${actor}按约定完成。`]
    ];
    for (const [text, expected] of cases) {
      const task = { text, executor: 'both' as const };
      const rule = resolveTaskRule(task, loser);
      expect(rule).toMatchObject({ executorPlayerId: loser, targetPlayerId: winner });
      expect(rewardTaskTier(task, winner, loser)).toBe(1);
      expect(formatTaskInstruction(text, rule)).toBe(expected);
    }
  });

  it('allows a reviewed public card for either winner without inferring a single recipient', () => {
    const task = { text: '你更喜欢自己主导高潮，还是把节奏完全交给对方？', executor: 'both' as const };
    for (const winner of [0, 1]) {
      const loser = 1 - winner;
      expect(rewardTaskTier(task, winner, loser)).toBe(2);
      const rule = resolveTaskRule(task, loser);
      expect(rule).toMatchObject({ executionMode: 'together', targetPlayerId: null });
      expect(formatTaskInstruction(task.text, rule)).toBe('双方轮流说说，自己更喜欢掌握节奏，还是由对方引导。');
    }
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
