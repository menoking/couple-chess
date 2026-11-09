import { useMemo, useState } from 'react';
import { ArrowLeft, RefreshCw, Shuffle, Sparkles, User, UserRound } from 'lucide-react';
import { Player, TaskEventData, Theme } from '../../types';
import { ThemeTaskEntry, collectThemeTasks, createViewTaskEvent, pickRandom } from '../../utils/modeKit';
import { TaskCardModal } from '../modals/TaskCardModal';

interface EventsModeViewProps {
  players: Player[];
  themes: Theme[];
  currentTurn: number;
  onEndTurn: () => void;
  onBack: () => void;
}

const TOTAL_ROUNDS = 12;
const EVENT_INTERVAL = 3;

type PendingEffect = 'double' | 'immunity' | 'swap' | null;

const EVENTS: Array<{ id: string; name: string; desc: string; effect: Exclude<PendingEffect, null> | 'windfall' }> = [
  { id: 'upgrade', name: '任务升级', desc: '下一张完成的任务积分 +2', effect: 'double' },
  { id: 'windfall', name: '天降横财', desc: '当前玩家立即获得 2 分', effect: 'windfall' },
  { id: 'swap', name: '交换身份', desc: '下一张任务标为对方替你完成', effect: 'swap' },
  { id: 'immunity', name: '幸运免罚', desc: '下一张任务即使跳过也 +1 分', effect: 'immunity' },
  { id: 'reward', name: '皆大欢喜', desc: '双方各获得 1 分', effect: 'windfall' }
];

const EFFECT_LABELS: Record<Exclude<PendingEffect, null>, string> = {
  double: '任务升级：下一张完成 +2 分',
  immunity: '幸运免罚：下一张跳过也 +1 分',
  swap: '交换身份：下一张算对方执行'
};

function EventsGame({
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
  const activePlayer = players[currentTurn] || players[0];
  const opponent = players.find(p => p.id !== activePlayer?.id) || players[1];
  const [round, setRound] = useState(1);
  const [points, setPoints] = useState<Record<number, number>>({ 0: 0, 1: 0 });
  const [pending, setPending] = useState<PendingEffect>(null);
  const [activeEvent, setActiveEvent] = useState<(typeof EVENTS)[number] | null>(null);
  const [taskData, setTaskData] = useState<TaskEventData | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  const pool = useMemo<ThemeTaskEntry[]>(
    () => collectThemeTasks(players.filter(p => p.id === activePlayer?.id), themes),
    [players, themes, activePlayer?.id]
  );

  const isEventRound = round % EVENT_INTERVAL === 0;

  const beginRound = () => {
    if (round > TOTAL_ROUNDS) {
      setFinished(true);
      return;
    }
    setNotice(null);
    if (isEventRound) {
      setActiveEvent(pickRandom(EVENTS) ?? EVENTS[0]);
      return;
    }
    openTask();
  };

  const openTask = () => {
    const entry = pickRandom(pool);
    if (!entry) {
      setNotice('当前玩家没有可用任务，本轮跳过');
      advanceRound();
      return;
    }
    setTaskData(
      createViewTaskEvent({
        entry,
        title: '事件任务',
        executorPlayerId: pending === 'swap' ? opponent?.id ?? entry.playerId : entry.playerId
      })
    );
  };

  const applyEvent = () => {
    if (!activeEvent) return;
    const playerId = activePlayer?.id ?? 0;
    if (activeEvent.effect === 'windfall') {
      if (activeEvent.id === 'reward') {
        setPoints(prev => ({ ...prev, 0: (prev[0] ?? 0) + 1, 1: (prev[1] ?? 0) + 1 }));
      } else {
        setPoints(prev => ({ ...prev, [playerId]: (prev[playerId] ?? 0) + 2 }));
      }
    } else {
      setPending(activeEvent.effect);
    }
    setActiveEvent(null);
    openTask();
  };

  const resolveTask = (accepted: boolean) => {
    const playerId = activePlayer?.id ?? 0;
    if (accepted) {
      const gain = pending === 'double' ? 2 : 1;
      setPoints(prev => ({ ...prev, [playerId]: (prev[playerId] ?? 0) + gain }));
      setNotice(pending === 'double' ? '任务升级生效，+2 分' : '任务完成，+1 分');
    } else if (pending === 'immunity') {
      setPoints(prev => ({ ...prev, [playerId]: (prev[playerId] ?? 0) + 1 }));
      setNotice('免罚生效，跳过也 +1 分');
    } else {
      setNotice('任务已跳过');
    }
    setPending(null);
    setTaskData(null);
    advanceRound();
  };

  const advanceRound = () => {
    if (round >= TOTAL_ROUNDS) {
      setFinished(true);
      return;
    }
    setRound(value => value + 1);
    onEndTurn();
  };

  if (finished) {
    const [first, second] = players;
    const a = points[first?.id ?? 0] ?? 0;
    const b = points[second?.id ?? 0] ?? 0;
    const winner = a === b ? null : a > b ? first : second;
    return (
      <div className="space-y-4">
        <div className="rounded-3xl border border-[#BF5AF2]/25 bg-[#BF5AF2]/10 p-6 text-center">
          <Shuffle size={36} className="mx-auto text-[#BF5AF2]" />
          <div className="mt-3 text-xl font-bold text-white">
            {winner ? `${winner.name} 以 ${Math.max(a, b)} 分获胜！` : `平局，双方各 ${a} 分`}
          </div>
          <div className="mt-4 space-y-2">
            {players.map(player => (
              <div key={player.id} className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                <span className="text-sm font-bold" style={{ color: player.color }}>{player.name}</span>
                <span className="text-lg font-bold text-white">{points[player.id] ?? 0} 分</span>
              </div>
            ))}
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
          第 {round} / {TOTAL_ROUNDS} 轮
        </div>
        <div className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold">
          {players.map(player => (
            <span key={player.id} style={{ color: player.color }}>
              {player.name} {points[player.id] ?? 0}
            </span>
          ))}
        </div>
      </div>

      {pending && (
        <div className="rounded-2xl border border-[#FFD60A]/25 bg-[#FFD60A]/10 px-4 py-2.5 text-center text-xs font-bold text-[#FFD60A]">
          生效中：{EFFECT_LABELS[pending]}
        </div>
      )}

      {activeEvent ? (
        <div className="space-y-4">
          <div className="rounded-3xl border border-[#BF5AF2]/40 bg-gradient-to-br from-[#BF5AF2]/20 to-transparent p-6 text-center">
            <Shuffle size={38} className="mx-auto text-[#D08BFF]" />
            <div className="mt-3 text-[11px] font-bold uppercase tracking-[0.2em] text-[#D08BFF]">随机事件触发</div>
            <div className="mt-2 text-2xl font-bold text-white">{activeEvent.name}</div>
            <div className="mt-2 text-sm text-gray-400">{activeEvent.desc}</div>
          </div>
          <button
            type="button"
            onClick={applyEvent}
            className="ios-btn h-14 w-full rounded-full bg-white text-base font-bold text-black shadow-lg"
          >
            收下事件，查看本轮任务
          </button>
        </div>
      ) : !taskData ? (
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-2 rounded-2xl bg-white/5 py-3 text-sm font-bold text-white">
            {activePlayer?.id === 0 ? <User size={15} className="text-[#0A84FF]" /> : <UserRound size={15} className="text-[#FF375F]" />}
            {activePlayer?.name || '当前玩家'} 的回合
            {isEventRound && <span className="text-[#D08BFF]">· 本轮有随机事件</span>}
          </div>
          <button
            type="button"
            onClick={beginRound}
            className="ios-btn flex h-40 w-full flex-col items-center justify-center gap-3 rounded-3xl border border-white/10 bg-white/[0.04]"
          >
            <Sparkles size={34} className="text-[#D08BFF]" />
            <span className="text-lg font-bold text-white">开始第 {round} 轮</span>
            <span className="text-xs text-gray-500">点击抽取本轮任务</span>
          </button>
          {notice && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-center text-sm font-bold text-white">
              {notice}
            </div>
          )}
        </div>
      ) : null}

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

export function EventsModeView({ players, themes, currentTurn, onEndTurn, onBack }: EventsModeViewProps) {
  const [runId, setRunId] = useState(0);

  return (
    <div className="mobile-game-screen fixed inset-x-0 top-0 bottom-0 z-50 flex flex-col bg-black">
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#171a2e] via-black to-[#0d1724] opacity-90" />

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
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#BF5AF2]">Random Events</div>
            <div className="mt-1 text-sm font-bold text-white">随机事件 · 每 3 轮触发</div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center text-gray-500">
            <Shuffle size={22} />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 no-scrollbar">
          <EventsGame
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
