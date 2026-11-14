import { useModeState } from '../../rules/ModeRuntime';
import { useEffect, useMemo } from 'react';
import { ArrowLeft, Bomb, FlipHorizontal, HandCoins, RefreshCw, User, UserRound } from 'lucide-react';
import { Player, Theme } from '../../types';
import { ThemeTaskEntry, buildTaskPool, createViewTaskEvent, pickRandom, shuffle } from '../../utils/modeKit';
import { TaskCardModal } from '../modals/TaskCardModal';

interface SecretDoubleModeViewProps {
  players: Player[];
  themes: Theme[];
  currentTurn: number;
  onEndTurn: () => void;
  onBack: () => void;
}

/** 牌堆张数（含 1 张黑牌） */
const DECK_SIZE = 8;
const BOMB = 'bomb' as const;

type Card = ThemeTaskEntry | typeof BOMB;

type Phase = 'ready' | 'flipping' | 'result';

function FlipGambleGame({
  players,
  themes,
  currentTurn,
  onEndTurn
}: {
  players: Player[];
  themes: Theme[];
  currentTurn: number;
  onEndTurn: () => void;
}) {
  const pool = useMemo(() => buildTaskPool(players, themes) ?? [], [players, themes]);

  const [flipperId, setFlipperId] = useModeState('SecretDoubleModeView.flipperId', currentTurn === 1 ? 1 : 0);
  const [round, setRound] = useModeState('SecretDoubleModeView.round', 1);
  const [deck, setDeck] = useModeState<Card[]>('SecretDoubleModeView.deck', []);
  const [cursor, setCursor] = useModeState('SecretDoubleModeView.cursor', 0);
  const [drawn, setDrawn] = useModeState<ThemeTaskEntry[]>('SecretDoubleModeView.drawn', []);
  const [phase, setPhase] = useModeState<Phase>('SecretDoubleModeView.phase', 'ready');
  const [bombed, setBombed] = useModeState('SecretDoubleModeView.bombed', false);

  const [cardQueue, setCardQueue] = useModeState<Array<{ executorId: number; entry: ThemeTaskEntry }>>('SecretDoubleModeView.cardQueue', []);
  const [taskData, setTaskData] = useModeState<ReturnType<typeof createViewTaskEvent> | null>('SecretDoubleModeView.taskData', null);
  const [points, setPoints] = useModeState<Record<number, number>>('SecretDoubleModeView.points', { 0: 0, 1: 0 });

  const flipper = players.find(player => player.id === flipperId) ?? players[0];
  const victimId = flipperId === 0 ? 1 : 0;
  const victim = players.find(player => player.id === victimId);

  const startRound = () => {
    const entries = shuffle(pool).slice(0, DECK_SIZE - 1);
    setDeck(shuffle<Card>([...entries, BOMB]));
    setCursor(0);
    setDrawn([]);
    setBombed(false);
    setPhase('flipping');
  };

  useEffect(() => {
    if (taskData || cardQueue.length === 0) return;
    const [next, ...rest] = cardQueue;
    setCardQueue(rest);
    setTaskData(
      createViewTaskEvent({
        entry: next.entry,
        title: bombed ? '翻到黑牌 · 反噬' : '收手结算 · 对方执行',
        executorPlayerId: next.executorId,
        initiatorPlayerId: flipperId
      })
    );
  }, [cardQueue, taskData, bombed, flipperId]);

  const flip = () => {
    if (phase !== 'flipping') return;
    const card = deck[cursor];
    setCursor(value => value + 1);

    if (card === BOMB) {
      // 黑牌：全部作废，自己吃一张惩罚
      const penalty = pickRandom(pool);
      setBombed(true);
      setPhase('result');
      setDrawn([]);
      if (penalty) {
        setCardQueue([{ executorId: flipperId, entry: penalty }]);
      }
      return;
    }

    setDrawn(prev => [...prev, card]);
  };

  const cashOut = () => {
    if (phase !== 'flipping' || drawn.length === 0) return;
    setPhase('result');
    setPoints(prev => ({ ...prev, [flipperId]: (prev[flipperId] ?? 0) + drawn.length }));
    setCardQueue(drawn.map(entry => ({ executorId: victimId, entry })));
  };

  const nextRound = () => {
    setFlipperId(prev => (prev === 0 ? 1 : 0));
    setRound(value => value + 1);
    setPhase('ready');
    setDrawn([]);
    setDeck([]);
    setCursor(0);
    setBombed(false);
    onEndTurn();
  };

  if (pool.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5 text-center text-sm text-gray-400">
        需要先为双方选择任务主题，才能开始翻牌
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold text-gray-400">
          第 {round} 轮 · {DECK_SIZE} 张牌（1 张黑牌）
        </div>
        <div className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold">
          {players.map(player => (
            <span key={player.id} style={{ color: player.color }}>
              {player.name} {points[player.id] ?? 0}
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 rounded-2xl bg-white/5 py-3 text-sm font-bold text-white">
        {flipper?.id === 0 ? <User size={15} className="text-[#0A84FF]" /> : <UserRound size={15} className="text-[#FF375F]" />}
        {flipper?.name} 翻牌 · 翻出的任务由 {victim?.name} 执行
      </div>

      {phase === 'ready' && (
        <div className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-6 text-center">
            <FlipHorizontal size={34} className="mx-auto text-[#BF5AF2]" />
            <div className="mt-3 text-lg font-bold text-white">翻牌赌命</div>
            <div className="mt-2 text-sm leading-relaxed text-gray-400">
              一张一张地翻，每翻出一张，<span className="text-white">对方就要多做一件事</span>。
              但牌堆里藏着 1 张黑牌——翻到它，前面全部作废，还得你自己受罚。
            </div>
          </div>
          <button
            type="button"
            onClick={startRound}
            className="ios-btn h-14 w-full rounded-full bg-white text-base font-bold text-black shadow-lg"
          >
            开始翻牌
          </button>
        </div>
      )}

      {phase === 'flipping' && (
        <div className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-5">
            <div className="flex items-center justify-between text-[11px] font-bold text-gray-500">
              <span>已翻 {drawn.length} 张</span>
              <span>剩余 {deck.length - cursor} 张</span>
            </div>

            {drawn.length === 0 ? (
              <div className="mt-4 flex h-28 items-center justify-center rounded-2xl border border-dashed border-white/15 text-sm text-gray-500">
                还没有翻牌
              </div>
            ) : (
              <ol className="mt-3 space-y-2">
                {drawn.map((entry, index) => (
                  <li key={index} className="flex gap-2 rounded-xl bg-white/[0.05] px-3 py-2">
                    <span className="text-[10px] font-bold text-[#BF5AF2]">#{index + 1}</span>
                    <span className="text-xs leading-relaxed text-white">{entry.task.text}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={cashOut}
              disabled={drawn.length === 0}
              className="ios-btn h-14 flex-1 rounded-full bg-white text-sm font-bold text-black shadow-lg disabled:opacity-30"
            >
              <span className="flex items-center justify-center gap-1.5">
                <HandCoins size={15} />收手
              </span>
            </button>
            <button
              type="button"
              onClick={flip}
              className="ios-btn h-14 flex-1 rounded-full bg-[#BF5AF2] text-sm font-bold text-white"
            >
              <span className="flex items-center justify-center gap-1.5">
                <FlipHorizontal size={15} />再翻一张
              </span>
            </button>
          </div>

          <div className="text-center text-[11px] text-gray-500">
            收手 = 已翻的任务全部交给对方；继续翻 = 风险与收益同时变大
          </div>
        </div>
      )}

      {phase === 'result' && (
        <div className="space-y-4">
          <div
            className={`rounded-3xl border p-6 text-center ${
              bombed ? 'border-[#FF453A]/30 bg-[#FF453A]/10' : 'border-[#30D158]/30 bg-[#30D158]/10'
            }`}
          >
            {bombed
              ? <Bomb size={34} className="mx-auto text-[#FF453A]" />
              : <HandCoins size={34} className="mx-auto text-[#30D158]" />}
            <div className="mt-3 text-lg font-bold text-white">
              {bombed ? `翻到黑牌，${flipper?.name} 前功尽弃` : `收手成功，${victim?.name} 要做 ${drawn.length} 件事`}
            </div>
            <div className="mt-2 text-xs text-gray-500">
              {bombed ? '已翻出的任务全部作废，并自己执行一张惩罚卡' : `${flipper?.name} 得 ${drawn.length} 分`}
            </div>
          </div>

          <button
            type="button"
            onClick={nextRound}
            className="ios-btn h-14 w-full rounded-full bg-white text-base font-bold text-black shadow-lg"
          >
            下一轮（换 {victim?.name} 翻牌）
          </button>
        </div>
      )}

      <TaskCardModal
        players={players}
        isOpen={!!taskData}
        taskData={taskData}
        onAccept={() => { setTaskData(null); onEndTurn(); }}
        onReject={() => { setTaskData(null); onEndTurn(); }}
        onClose={() => { setTaskData(null); onEndTurn(); }}
      />
    </div>
  );
}

export function SecretDoubleModeView({ players, themes, currentTurn, onEndTurn, onBack }: SecretDoubleModeViewProps) {
  const [runId, setRunId] = useModeState('SecretDoubleModeView.runId', 0);

  return (
    <div className="mobile-game-screen fixed inset-x-0 top-0 bottom-0 z-50 flex flex-col bg-black">
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#1d1230] via-black to-[#0d1724] opacity-90" />
      <div className="relative z-10 mx-auto flex h-full w-full max-w-[430px] flex-col">
        <header className="mobile-screen-header flex shrink-0 items-center gap-3 px-4 py-2">
          <button onClick={onBack} className="ios-btn flex h-10 w-10 items-center justify-center rounded-full border border-white/5 bg-white/10" aria-label="返回首页">
            <ArrowLeft className="text-white" size={20} />
          </button>
          <div className="flex-1 text-center">
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#BF5AF2]">Flip Gamble</div>
            <div className="mt-1 text-sm font-bold text-white">翻牌赌命</div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center text-gray-500">
            <FlipHorizontal size={22} />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 no-scrollbar">
          <FlipGambleGame
            key={runId}
            players={players}
            themes={themes}
            currentTurn={currentTurn}
            onEndTurn={onEndTurn}
          />
          <button type="button" onClick={() => setRunId(value => value + 1)} className="ios-btn mx-auto mt-6 flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-xs font-bold text-gray-400">
            <RefreshCw size={13} />重新开始
          </button>
        </main>
      </div>
    </div>
  );
}
