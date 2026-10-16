import { useMemo, useState } from 'react';
import { ArrowLeft, Coins, Gift, RefreshCw, Repeat2, ShieldCheck, Sparkles, User, UserRound, Zap } from 'lucide-react';
import { Player, TaskEventData, Theme } from '../../types';
import { ThemeTaskEntry, buildTaskPool, collectThemeTasks, createViewTaskEvent, pickRandom, shuffle } from '../../utils/modeKit';
import { TaskCardModal } from '../modals/TaskCardModal';

interface BlindBoxModeViewProps {
  players: Player[];
  themes: Theme[];
  currentTurn: number;
  onEndTurn: () => void;
  onSwapThemes: () => void;
  onBack: () => void;
}

type EffectKind = 'task' | 'reward' | 'double' | 'immunity' | 'swap' | 'points';

const EFFECT_POOL: EffectKind[] = ['task', 'task', 'task', 'reward', 'reward', 'double', 'immunity', 'swap', 'points'];

const EFFECT_LABELS: Record<EffectKind, string> = {
  task: '任务卡',
  reward: '奖励卡',
  double: '双倍卡',
  immunity: '免罚卡',
  swap: '交换卡',
  points: '积分卡'
};

interface Box {
  effect: EffectKind;
  opened: boolean;
}

interface PlayerFlags {
  doubleNext: boolean;
  immunity: boolean;
}

function BlindBoxGame({
  players,
  themes,
  currentTurn,
  onEndTurn,
  onSwapThemes,
  onExit
}: {
  players: Player[];
  themes: Theme[];
  currentTurn: number;
  onEndTurn: () => void;
  onSwapThemes: () => void;
  onExit: () => void;
}) {
  const activePlayer = players[currentTurn] || players[0];
  const [boxes, setBoxes] = useState<Box[]>(() => shuffle(EFFECT_POOL).map(effect => ({ effect, opened: false })));
  const [points, setPoints] = useState<Record<number, number>>({ 0: 0, 1: 0 });
  const [flags, setFlags] = useState<Record<number, PlayerFlags>>({ 0: { doubleNext: false, immunity: false }, 1: { doubleNext: false, immunity: false } });
  const [notice, setNotice] = useState<string | null>(null);
  const [taskData, setTaskData] = useState<TaskEventData | null>(null);
  const [pendingBox, setPendingBox] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);

  const openedCount = boxes.filter(box => box.opened).length;
  const pool = useMemo(() => buildTaskPool(players, themes) ?? [], [players, themes]);

  const addPoints = (playerId: number, amount: number) => {
    setPoints(prev => ({ ...prev, [playerId]: (prev[playerId] ?? 0) + amount }));
  };

  const openBox = (index: number) => {
    if (finished) return;
    const box = boxes[index];
    if (!box || box.opened) return;
    const playerId = activePlayer?.id ?? 0;

    // 先标记翻开
    setBoxes(prev => prev.map((item, i) => (i === index ? { ...item, opened: true } : item)));
    setNotice(null);

    if (box.effect === 'task' || box.effect === 'reward') {
      const sourceEntries: ThemeTaskEntry[] =
        box.effect === 'reward'
          ? collectThemeTasks(players.filter(p => p.id !== playerId), themes)
          : collectThemeTasks(players.filter(p => p.id === playerId), themes);
      const entry = pickRandom(sourceEntries.length > 0 ? sourceEntries : pool);
      if (!entry) {
        setNotice('当前没有可用任务，本盒作废');
        onEndTurn();
        return;
      }
      setPendingBox(index);
      setTaskData(createViewTaskEvent({ entry, title: box.effect === 'reward' ? '盲盒奖励' : '盲盒任务' }));
      return;
    }

    if (box.effect === 'double') {
      setFlags(prev => ({ ...prev, [playerId]: { ...prev[playerId], doubleNext: true } }));
      setNotice('双倍卡生效：下一张完成的任务积分翻倍');
    } else if (box.effect === 'immunity') {
      setFlags(prev => ({ ...prev, [playerId]: { ...prev[playerId], immunity: true } }));
      setNotice('免罚卡生效：下一张任务即使跳过也计入积分');
    } else if (box.effect === 'swap') {
      onSwapThemes();
      setNotice('交换卡生效：双方的题库已互换！');
    } else {
      addPoints(playerId, 2);
      setNotice('积分卡：直接 +2 分');
    }

    if (openedCount + 1 >= boxes.length) {
      setFinished(true);
      setNotice(null);
      return;
    }
    onEndTurn();
  };

  const resolveTask = (accepted: boolean) => {
    if (pendingBox === null) return;
    const playerId = activePlayer?.id ?? 0;
    const playerFlags = flags[playerId] ?? { doubleNext: false, immunity: false };
    const box = boxes[pendingBox];

    if (accepted) {
      const base = box.effect === 'reward' ? 2 : 1;
      const total = playerFlags.doubleNext ? base * 2 : base;
      addPoints(playerId, total);
      setNotice(playerFlags.doubleNext ? `任务完成，双倍生效 +${total} 分` : `任务完成 +${total} 分`);
      setFlags(prev => ({ ...prev, [playerId]: { ...prev[playerId], doubleNext: false } }));
    } else if (playerFlags.immunity) {
      addPoints(playerId, 1);
      setNotice('免罚生效：跳过任务也 +1 分');
      setFlags(prev => ({ ...prev, [playerId]: { ...prev[playerId], immunity: false } }));
    } else {
      setNotice('任务已跳过，没有积分');
    }

    setTaskData(null);
    setPendingBox(null);
    if (openedCount + 1 >= boxes.length) {
      setFinished(true);
      setNotice(null);
      return;
    }
    onEndTurn();
  };

  if (finished) {
    const sorted = [...players].sort((a, b) => (points[b.id] ?? 0) - (points[a.id] ?? 0));
    const winner = sorted[0];
    const isTie = players.length > 1 && (points[sorted[0].id] ?? 0) === (points[sorted[1].id] ?? 0);
    return (
      <div className="rounded-3xl border border-[#BF5AF2]/25 bg-[#BF5AF2]/10 p-6 text-center">
        <Gift size={36} className="mx-auto text-[#BF5AF2]" />
        <div className="mt-3 text-xl font-bold text-white">
          {isTie ? '平局！' : `${winner?.name ?? '获胜方'} 是盲盒之王！`}
        </div>
        <div className="mt-3 space-y-1 text-sm text-gray-400">
          {players.map(player => (
            <div key={player.id}>
              <span style={{ color: player.color }}>{player.name}</span> 获得 {points[player.id] ?? 0} 分
            </div>
          ))}
        </div>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onExit}
            className="ios-btn h-12 flex-1 rounded-full border border-white/10 bg-white/10 text-base font-bold text-white"
          >
            返回主页
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold text-gray-400">
          已开 {openedCount} / {boxes.length} 盒
        </div>
        <div className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold">
          {players.map(player => (
            <span key={player.id} style={{ color: player.color }}>
              {player.name} {points[player.id] ?? 0} 分
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 rounded-2xl bg-white/5 py-3 text-sm font-bold text-white">
        {activePlayer?.id === 0 ? <User size={15} className="text-[#0A84FF]" /> : <UserRound size={15} className="text-[#FF375F]" />}
        {activePlayer?.name || '当前玩家'} 的回合：选一个盲盒
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        {boxes.map((box, index) => (
          <button
            key={index}
            type="button"
            disabled={box.opened || !!taskData}
            onClick={() => openBox(index)}
            aria-label={box.opened ? `已开启：${EFFECT_LABELS[box.effect]}` : '未开启的盲盒'}
            className={`relative flex aspect-square flex-col items-center justify-center gap-1.5 rounded-3xl border transition-all ios-btn disabled:cursor-default ${
              box.opened
                ? 'border-white/10 bg-black/40 opacity-60'
                : 'border-[#BF5AF2]/40 bg-gradient-to-br from-[#BF5AF2]/25 to-[#BF5AF2]/5 active:scale-95'
            }`}
          >
            {box.opened ? (
              <>
                {box.effect === 'task' && <Sparkles size={18} className="text-[#64B5FF]" />}
                {box.effect === 'reward' && <Gift size={18} className="text-[#FF375F]" />}
                {box.effect === 'double' && <Zap size={18} className="text-[#FFD60A]" />}
                {box.effect === 'immunity' && <ShieldCheck size={18} className="text-[#30D158]" />}
                {box.effect === 'swap' && <Repeat2 size={18} className="text-[#FF9F0A]" />}
                {box.effect === 'points' && <Coins size={18} className="text-[#FFD60A]" />}
                <span className="text-[9px] font-bold text-gray-300">{EFFECT_LABELS[box.effect]}</span>
              </>
            ) : (
              <>
                <Gift size={22} className="text-[#D08BFF]" />
                <span className="text-[9px] font-bold text-gray-500">盲盒</span>
              </>
            )}
          </button>
        ))}
      </div>

      {notice && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-center text-sm font-bold text-white">
          {notice}
        </div>
      )}

      <TaskCardModal
        isOpen={!!taskData}
        taskData={taskData}
        onAccept={() => resolveTask(true)}
        onReject={() => resolveTask(false)}
        onClose={() => resolveTask(false)}
      />
    </div>
  );
}

export function BlindBoxModeView({ players, themes, currentTurn, onEndTurn, onSwapThemes, onBack }: BlindBoxModeViewProps) {
  const [runId, setRunId] = useState(0);

  return (
    <div className="mobile-game-screen fixed inset-x-0 top-0 bottom-0 z-50 flex flex-col bg-black">
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#21132b] via-black to-[#0d1724] opacity-90" />

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
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#BF5AF2]">Blind Box</div>
            <div className="mt-1 text-sm font-bold text-white">盲盒抽奖 · 9 盒</div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center text-gray-500">
            <Gift size={22} />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 no-scrollbar">
          <BlindBoxGame
            key={runId}
            players={players}
            themes={themes}
            currentTurn={currentTurn}
            onEndTurn={onEndTurn}
            onSwapThemes={onSwapThemes}
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
