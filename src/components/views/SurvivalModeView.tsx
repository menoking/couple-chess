import { useDeckSeed, useModeState, useMyTurn } from '../../rules/ModeRuntime';
import { useEffect, useMemo, useRef } from 'react';
import { ArrowLeft, Heart, HeartPulse, RefreshCw, Timer, User, UserRound } from 'lucide-react';
import { Player, TaskEventData, Theme } from '../../types';
import { SURVIVAL_EVENTS, SURVIVAL_MAX_HEARTS, SURVIVAL_TOTAL_ROUNDS, SurvivalEvent } from '../../data/survivalEvents';
import { ThemeTaskEntry, collectThemeTasks, createViewTaskEvent, pickRandom, seededShuffle } from '../../utils/modeKit';
import { TaskCardModal } from '../modals/TaskCardModal';

interface SurvivalModeViewProps {
  players: Player[];
  themes: Theme[];
  currentTurn: number;
  onEndTurn: () => void;
  onBack: () => void;
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
  const [taskData, setTaskData] = useModeState<TaskEventData | null>('SurvivalModeView.taskData', null);
  const [notice, setNotice] = useModeState<string | null>('SurvivalModeView.notice', null);
  const [timeLeft, setTimeLeft] = useModeState('SurvivalModeView.timeLeft', 0);
  const [over, setOver] = useModeState<{ win: boolean; rounds: number } | null>('SurvivalModeView.over', null);
  const resolvedRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const pool = useMemo<ThemeTaskEntry[]>(
    () => collectThemeTasks(players.filter(p => p.id === activePlayer?.id), themes),
    [players, themes, activePlayer?.id]
  );

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => () => clearTimer(), []);

  // 限时事件：倒计时归零按跳过处理。
  // 依赖用布尔值而不是 taskData 对象：快照每 1.5 秒刷新会重建对象，
  // 依赖对象会让 interval 反复重建，倒计时看起来像被拖慢。
  const hasTask = taskData !== null;
  useEffect(() => {
    if (!hasTask || timeLeft <= 0) return;
    timerRef.current = window.setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearTimer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasTask]);

  useEffect(() => {
    if (taskData && timeLeft === 0 && activeEvent && activeEvent.timeLimit > 0 && !resolvedRef.current) {
      resolvedRef.current = true;
      resolveTask(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskData, timeLeft, activeEvent]);

  const drawEvent = () => {
    if (!canAct) return;
    const [event, ...rest] = eventDeck;
    if (!event) {
      setActiveEvent(SURVIVAL_EVENTS[0]);
      return;
    }
    setEventDeck(rest);
    setActiveEvent(event);
  };

  const openTask = () => {
    const entry = pickRandom(pool);
    if (!entry) {
      setNotice('当前玩家没有可用任务，按跳过处理');
      resolveTask(false);
      return;
    }
    resolvedRef.current = false;
    setTaskData(createViewTaskEvent({ entry, title: '生存任务 · 自己执行', executorPlayerId: activePlayer?.id ?? 0, initiatorPlayerId: activePlayer?.id ?? 0 }));
    setTimeLeft(activeEvent && activeEvent.timeLimit > 0 ? activeEvent.timeLimit : 0);
  };

  const resolveTask = (accepted: boolean) => {
    clearTimer();
    if (!activeEvent) return;
    let nextHearts = hearts;
    let gained = 0;

    if (accepted) {
      nextHearts = Math.min(SURVIVAL_MAX_HEARTS, hearts + activeEvent.successHeal);
      gained = 1 + activeEvent.bonusPoints;
    } else {
      nextHearts = Math.max(0, hearts - activeEvent.skipPenalty);
    }

    setHearts(nextHearts);
    setPoints(prev => prev + gained);
    setTaskData(null);
    setActiveEvent(null);
    setNotice(
      accepted
        ? `任务完成：${activeEvent.successHeal > 0 ? `回血 ${activeEvent.successHeal} · ` : ''}+${gained} 分`
        : activeEvent.skipPenalty > 0
          ? `任务跳过：-${activeEvent.skipPenalty} 心血`
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
    onEndTurn();
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

      <div className="flex items-center justify-center gap-2 rounded-2xl bg-white/5 py-3 text-sm font-bold text-white">
        {activePlayer?.id === 0 ? <User size={15} className="text-[#0A84FF]" /> : <UserRound size={15} className="text-[#FF375F]" />}
        {activePlayer?.name || '当前玩家'} 面对本轮事件 · 团队 {points} 分
      </div>

      {activeEvent ? (
        <div className="space-y-4">
          <div className="rounded-3xl border border-[#FF375F]/25 bg-gradient-to-br from-[#FF375F]/15 to-transparent p-6 text-center">
            <HeartPulse size={36} className="mx-auto text-[#FF375F]" />
            <div className="mt-3 text-[11px] font-bold uppercase tracking-[0.2em] text-[#FF7A96]">本轮事件</div>
            <div className="mt-2 text-2xl font-bold text-white">{activeEvent.name}</div>
            <div className="mt-2 text-sm leading-relaxed text-gray-400">{activeEvent.desc}</div>
            {activeEvent.timeLimit > 0 && (
              <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold text-[#FFD60A]">
                <Timer size={12} />限时 {activeEvent.timeLimit} 秒
              </div>
            )}
          </div>
          {!taskData && (
            <button
              type="button"
              onClick={openTask}
              className="ios-btn h-14 w-full rounded-full bg-white text-base font-bold text-black shadow-lg"
            >
              迎接本轮任务
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={drawEvent}
          className="ios-btn flex h-40 w-full flex-col items-center justify-center gap-3 rounded-3xl border border-white/10 bg-white/[0.04]"
        >
          <HeartPulse size={34} className="text-[#FF375F]" />
          <span className="text-lg font-bold text-white">抽取第 {round} 轮事件</span>
          <span className="text-xs text-gray-500">事件会改变本轮任务的得失</span>
        </button>
      )}

      {taskData && timeLeft > 0 && (
        <div className="rounded-2xl border border-[#FFD60A]/25 bg-[#FFD60A]/10 px-4 py-2.5 text-center text-sm font-bold tabular-nums text-[#FFD60A]">
          剩余 {timeLeft} 秒，超时按跳过处理
        </div>
      )}

      {notice && !taskData && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-center text-sm font-bold text-white">
          {notice}
        </div>
      )}

      <TaskCardModal
        players={players}
        isOpen={!!taskData}
        taskData={taskData}
        onAccept={() => resolveTask(true)}
        onReject={() => resolveTask(false)}
        onClose={() => resolveTask(false)}
      />
    </div>
  );
}

export function SurvivalModeView({ players, themes, currentTurn, onEndTurn, onBack }: SurvivalModeViewProps) {
  const [runId, setRunId] = useModeState('SurvivalModeView.runId', 0);

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
            onClick={() => setRunId(value => value + 1)}
            className="ios-btn mx-auto mt-6 flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-xs font-bold text-gray-400"
          >
            <RefreshCw size={13} />重新开始
          </button>
        </main>
      </div>
    </div>
  );
}
