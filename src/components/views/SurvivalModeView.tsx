import { useDeckSeed, useModeAuthority, useModeRuntime, useModeState, useMyTurn } from '../../rules/ModeRuntime';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Heart, HeartPulse, RefreshCw, Timer, User, UserRound, X } from 'lucide-react';
import { Player, Theme } from '../../types';
import { SURVIVAL_EVENTS, SURVIVAL_MAX_HEARTS, SURVIVAL_TOTAL_ROUNDS, SurvivalEvent } from '../../data/survivalEvents';
import { ThemeTaskEntry, collectThemeTasks, seededShuffle } from '../../utils/modeKit';
import { pickFresh, taskKeyOf } from '../../utils/freshPick';
import { formatTaskInstruction, resolveTaskRule } from '../../rules/taskRules';

interface SurvivalModeViewProps {
  players: Player[];
  themes: Theme[];
  currentTurn: number;
  onEndTurn: () => void;
  onBack: () => void;
}

/** 本轮任务：只存纯文本，**不要**用 TaskEventData 形状（会被当成抽卡对象拦掉）。 */
interface SurvivalTask {
  text: string;
  themeName: string;
}

function SurvivalGame({
  players,
  themes,
  currentTurn,
  onEndTurn,
  onExit
}: {
  players: Player[];
  themes: Theme[];
  currentTurn: number;
  onEndTurn: () => void;
  onExit: () => void;
}) {
  const canAct = useMyTurn(currentTurn);
  const authority = useModeAuthority();
  const runtime = useModeRuntime();
  const activePlayer = players[currentTurn] || players[0];
  // 同一房间 = 同一事件顺序
  const deckSeed = useDeckSeed();
  const [eventDeck, setEventDeck] = useModeState<SurvivalEvent[]>('SurvivalModeView.eventDeck', () =>
    seededShuffle(SURVIVAL_EVENTS, `${deckSeed}:survival`)
  );
  const [round, setRound] = useModeState('SurvivalModeView.round', 1);
  const [hearts, setHearts] = useModeState('SurvivalModeView.hearts', SURVIVAL_MAX_HEARTS);
  const [points, setPoints] = useModeState('SurvivalModeView.points', 0);
  const [activeEvent, setActiveEvent] = useModeState<SurvivalEvent | null>('SurvivalModeView.activeEvent', null);
  const [currentTask, setCurrentTask] = useModeState<SurvivalTask | null>('SurvivalModeView.currentTask', null);
  /** 已经做过的任务：同一局不再重复，抽空了自动洗牌 */
  const [usedTasks, setUsedTasks] = useModeState<string[]>('SurvivalModeView.usedTasks', []);
  const [notice, setNotice] = useModeState<string | null>('SurvivalModeView.notice', null);
  // 用截止时间而不是每秒写一次共享状态：两端各自算剩余秒数，不会互相覆盖
  const [deadline, setDeadline] = useModeState('SurvivalModeView.deadline', 0);
  const [over, setOver] = useModeState<{ win: boolean; rounds: number } | null>('SurvivalModeView.over', null);
  const [now, setNow] = useState(() => Date.now());
  // 超时与手点可能同时触发，同一个任务只能结算一次
  const resolvingRef = useRef(false);

  const pool = useMemo<ThemeTaskEntry[]>(
    () => collectThemeTasks(players.filter(p => p.id === activePlayer?.id), themes),
    [players, themes, activePlayer?.id]
  );

  // 本地秒表：只驱动本机重渲染，不写共享状态
  useEffect(() => {
    if (deadline <= 0 || currentTask === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [deadline, currentTask]);

  const remaining = deadline > 0 && currentTask ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;

  const resolveTask = (accepted: boolean, automatic = false) => {
    if (automatic ? !authority : !canAct) return;
    if (resolvingRef.current) return;
    if (!activeEvent) return;
    resolvingRef.current = true;
    const event = activeEvent;
    let gained = 0;
    const nextHearts = accepted
      ? Math.min(SURVIVAL_MAX_HEARTS, hearts + event.successHeal)
      : Math.max(0, hearts - event.skipPenalty);
    if (accepted) gained = 1 + event.bonusPoints;

    setHearts(nextHearts);
    if (gained > 0) setPoints(prev => prev + gained);
    setCurrentTask(null);
    setActiveEvent(null);
    setDeadline(0);
    setNotice(
      accepted
        ? `任务完成：${event.successHeal > 0 ? `回血 ${event.successHeal} · ` : ''}+${gained} 分`
        : event.skipPenalty > 0
          ? `任务跳过：-${event.skipPenalty} 心血`
          : '任务跳过：本轮安全，未扣心血'
    );

    if (nextHearts <= 0) {
      setOver({ win: false, rounds: round });
      return;
    }
    if (round >= SURVIVAL_TOTAL_ROUNDS) {
      setOver({ win: true, rounds: round });
      return;
    }
    setRound(value => value + 1);
    if (automatic && runtime) {
      runtime.dispatch({ type: 'authorityEndTurn', seat: runtime.seat, expectedTurn: currentTurn });
    } else {
      onEndTurn();
    }
  };

  // 超时按跳过处理；只让权威端执行一次，避免两端各算一次
  useEffect(() => {
    if (!authority || !currentTask || deadline <= 0 || over) return;
    if (remaining > 0) return;
    resolveTask(false, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authority, currentTask, deadline, remaining, over]);

  const drawEvent = () => {
    if (!canAct) return;
    // 事件牌堆抽空后按本轮重新洗一遍，不会把上一轮的事件顺序原样再来
    const deck = eventDeck.length > 0
      ? eventDeck
      : seededShuffle(SURVIVAL_EVENTS, `${deckSeed}:survival:${round}`);
    const [event, ...rest] = deck;
    if (!event) return;
    setEventDeck(rest);
    setActiveEvent(event);
    setNotice(null);
    resolvingRef.current = false;
  };

  const openTask = () => {
    if (!canAct) return;
    const picked = pickFresh(pool, usedTasks, entry => taskKeyOf(entry.task));
    if (!picked) {
      setNotice('当前玩家没有可用任务，按跳过处理');
      resolveTask(false);
      return;
    }
    setUsedTasks(picked.used);
    setNotice(picked.reset ? '任务已经全部做过，牌堆重新洗好了' : null);
    resolvingRef.current = false;
    const rule = resolveTaskRule(picked.item.task, activePlayer?.id ?? 0);
    setCurrentTask({
      text: formatTaskInstruction(picked.item.task.text, rule),
      themeName: picked.item.themeName
    });
    const limit = activeEvent && activeEvent.timeLimit > 0 ? activeEvent.timeLimit : 0;
    setDeadline(limit > 0 ? Date.now() + limit * 1000 : 0);
    setNow(Date.now());
  };

  if (over) {
    return (
      <div className="space-y-4">
        <div
          className={`rounded-3xl border p-6 text-center ${
            over.win ? 'border-[#30D158]/25 bg-[#30D158]/10' : 'border-[#FF453A]/25 bg-[#FF453A]/10'
          }`}
        >
          <HeartPulse size={38} className={`mx-auto ${over.win ? 'text-[#30D158]' : 'text-[#FF453A]'}`} />
          <div className="mt-3 text-xl font-bold text-white">
            {over.win ? '生存成功，感情升温！' : `第 ${over.rounds} 轮心血耗尽…`}
          </div>
          <div className="mt-2 text-sm text-gray-400">
            {over.win ? '你们一起扛过了所有事件' : '下次注意分配体力，别硬撑'}
          </div>
          <div className="mt-4 flex justify-center gap-6">
            <div>
              <div className="text-2xl font-bold text-white">{points}</div>
              <div className="text-[10px] text-gray-500">团队积分</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{over.rounds}</div>
              <div className="text-[10px] text-gray-500">坚持轮数</div>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onExit}
          className="ios-btn h-12 w-full rounded-full border border-white/10 bg-white/10 text-base font-bold text-white"
        >
          返回主页
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold text-gray-400">
          第 {round} / {SURVIVAL_TOTAL_ROUNDS} 轮
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1">
          {Array.from({ length: SURVIVAL_MAX_HEARTS }).map((_, index) => (
            <Heart
              key={index}
              size={14}
              className={index < hearts ? 'text-[#FF375F]' : 'text-gray-700'}
              fill={index < hearts ? '#FF375F' : 'transparent'}
            />
          ))}
          <span className="ml-1 text-[10px] font-bold text-gray-400">共享心血</span>
        </div>
      </div>

      <div className={`flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold ${canAct ? 'bg-white/5 text-white' : 'bg-white/[0.02] text-gray-500'}`}>
        {activePlayer?.id === 0 ? <User size={15} className="text-[#0A84FF]" /> : <UserRound size={15} className="text-[#FF375F]" />}
        {canAct
          ? `${activePlayer?.name || '当前玩家'} 面对本轮事件 · 团队 ${points} 分`
          : `等 ${activePlayer?.name || '对方'} 处理本轮 · 团队 ${points} 分`}
      </div>

      {activeEvent ? (
        <div className="space-y-4">
          <div className="rounded-3xl border border-[#FF375F]/25 bg-gradient-to-br from-[#FF375F]/15 to-transparent p-6 text-center">
            <HeartPulse size={36} className="mx-auto text-[#FF375F]" />
            <div className="mt-3 text-[11px] font-bold uppercase tracking-[0.2em] text-[#FF7A96]">本轮事件</div>
            <div className="mt-2 text-2xl font-bold text-white">{activeEvent.name}</div>
            <div className="mt-2 text-sm leading-relaxed text-gray-400">{activeEvent.desc}</div>
            <div className="mt-4 flex items-center justify-center gap-2 text-[10px] font-bold">
              <span className="rounded-full bg-[#30D158]/15 px-2.5 py-1 text-[#30D158]">
                完成 +{1 + activeEvent.bonusPoints} 分{activeEvent.successHeal > 0 ? ` · 回血 ${activeEvent.successHeal}` : ''}
              </span>
              <span className="rounded-full bg-[#FF453A]/15 px-2.5 py-1 text-[#FF7A96]">
                跳过{activeEvent.skipPenalty > 0 ? ` -${activeEvent.skipPenalty} 心血` : ' 无惩罚'}
              </span>
            </div>
            {activeEvent.timeLimit > 0 && (
              <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold text-[#FFD60A]">
                <Timer size={12} />限时 {activeEvent.timeLimit} 秒
              </div>
            )}
          </div>

          {!currentTask && (
            <button
              type="button"
              onClick={openTask}
              disabled={!canAct}
              className="ios-btn h-14 w-full rounded-full bg-white text-base font-bold text-black shadow-lg disabled:opacity-50"
            >
              {canAct ? '迎接本轮任务' : `等 ${activePlayer?.name || '对方'} 抽任务`}
            </button>
          )}

          {currentTask && (
            <div className="rounded-3xl border border-white/10 bg-[#1C1C1E] p-5">
              <div className="flex items-center justify-between text-[10px] font-bold text-gray-500">
                <span>本轮任务 · 执行关系见卡面</span>
                <span className="truncate">来自「{currentTask.themeName}」</span>
              </div>
              <div className="mt-3 text-base font-bold leading-relaxed text-white">{currentTask.text}</div>

              {deadline > 0 && (
                <div className={`mt-4 rounded-2xl px-3 py-2 text-center text-sm font-bold tabular-nums ${
                  remaining <= 5 ? 'bg-[#FF453A]/15 text-[#FF7A96]' : 'bg-[#FFD60A]/10 text-[#FFD60A]'
                }`}>
                  剩余 {remaining} 秒{remaining === 0 ? ' · 已超时' : ''}
                </div>
              )}

              {canAct ? (
                <div className="mt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => resolveTask(false)}
                    className="ios-btn h-13 flex-1 rounded-full bg-[#3A3A3C] py-3.5 text-sm font-bold text-[#FF453A]"
                  >
                    <span className="flex items-center justify-center gap-1.5">
                      <X size={15} />跳过
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => resolveTask(true)}
                    className="ios-btn h-13 flex-[2] rounded-full bg-white py-3.5 text-sm font-bold text-black shadow-lg"
                  >
                    <span className="flex items-center justify-center gap-1.5">
                      <Check size={15} />完成了
                    </span>
                  </button>
                </div>
              ) : (
                <div className="mt-4 rounded-full border border-white/10 bg-white/[0.05] px-3 py-3 text-center text-[11px] font-bold text-gray-500">
                  等 {activePlayer?.name || '对方'} 完成或跳过
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={drawEvent}
          disabled={!canAct}
          className="ios-btn flex h-40 w-full flex-col items-center justify-center gap-3 rounded-3xl border border-white/10 bg-white/[0.04] disabled:opacity-50"
        >
          <HeartPulse size={34} className="text-[#FF375F]" />
          <span className="text-lg font-bold text-white">抽取第 {round} 轮事件</span>
          <span className="text-xs text-gray-500">事件会改变本轮任务的得失</span>
        </button>
      )}

      {notice && !currentTask && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-center text-sm font-bold text-white">
          {notice}
        </div>
      )}

      <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 text-[11px] leading-relaxed text-gray-500">
        规则：两人共用 {SURVIVAL_MAX_HEARTS} 颗心血，轮流面对 {SURVIVAL_TOTAL_ROUNDS} 轮事件。
        当前玩家抽到任务后，完成可回血加分，跳过按事件扣血；限时事件超时按跳过处理。心血归零即失败。
      </div>
    </div>
  );
}

export function SurvivalModeView({ players, themes, currentTurn, onEndTurn, onBack }: SurvivalModeViewProps) {
  const [runId, setRunId] = useModeState('SurvivalModeView.runId', 0);
  const [, setUsedTasks] = useModeState<string[]>('SurvivalModeView.usedTasks', []);
  const [, setNotice] = useModeState<string | null>('SurvivalModeView.notice', null);

  const restart = () => {
    setUsedTasks([]);
    setNotice(null);
    setRunId(value => value + 1);
  };

  return (
    <div className="mobile-game-screen fixed inset-x-0 top-0 bottom-0 z-50 flex flex-col bg-black">
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#2b1420] via-black to-[#0d1724] opacity-90" />

      <div className="relative z-10 mx-auto flex h-full w-full max-w-[430px] flex-col">
        <header className="mobile-screen-header flex shrink-0 items-center gap-3 px-4 py-2">
          <button
            onClick={onBack}
            className="ios-btn flex h-10 w-10 items-center justify-center rounded-full border border-white/5 bg-white/10"
            aria-label="返回首页"
          >
            <ArrowLeft className="text-white" size={20} />
          </button>
          <div className="flex-1 text-center">
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#FF375F]">Co-op Survival</div>
            <div className="mt-1 text-sm font-bold text-white">合作生存 · {SURVIVAL_TOTAL_ROUNDS} 轮</div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center text-gray-500">
            <HeartPulse size={22} />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 no-scrollbar">
          <SurvivalGame
            key={runId}
            players={players}
            themes={themes}
            currentTurn={currentTurn}
            onEndTurn={onEndTurn}
            onExit={onBack}
          />

          <button
            type="button"
            onClick={restart}
            className="ios-btn mx-auto mt-6 flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-xs font-bold text-gray-400"
          >
            <RefreshCw size={13} />重新开始
          </button>
        </main>
      </div>
    </div>
  );
}
