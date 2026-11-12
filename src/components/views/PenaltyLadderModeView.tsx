import { useModeState } from '../../rules/ModeRuntime';
import { useMemo } from 'react';
import { ArrowLeft, Check, RefreshCw, Skull, TrendingUp, User, UserRound, X } from 'lucide-react';
import { Player, Theme } from '../../types';
import { buildTaskPool, pickRandom } from '../../utils/modeKit';
import { PENALTY_LADDER } from '../../data/spicyContent';

interface PenaltyLadderModeViewProps {
  players: Player[];
  themes: Theme[];
  onBack: () => void;
}

type Phase = 'play' | 'penalty' | 'over';

interface StepResult {
  playerId: number;
  level: number;
}

function PenaltyLadderGame({ players, themes }: { players: Player[]; themes: Theme[] }) {
  const pool = useMemo(() => buildTaskPool(players, themes) ?? [], [players, themes]);

  const [turn, setTurn] = useModeState('PenaltyLadderModeView.turn', 0);
  const [steps, setSteps] = useModeState<Record<number, number>>('PenaltyLadderModeView.steps', { 0: 0, 1: 0 });
  const [phase, setPhase] = useModeState<Phase>('PenaltyLadderModeView.phase', 'play');
  const [currentTask, setCurrentTask] = useModeState('PenaltyLadderModeView.currentTask', () => pickRandom(pool));
  const [penaltyResult, setPenaltyResult] = useModeState<StepResult | null>('PenaltyLadderModeView.penaltyResult', null);
  const [loserId, setLoserId] = useModeState<number | null>('PenaltyLadderModeView.loserId', null);
  const [round, setRound] = useModeState('PenaltyLadderModeView.round', 1);

  const activePlayer = players[turn];
  const opponent = players.find(player => player.id !== activePlayer?.id);

  const nextTask = () => setCurrentTask(pickRandom(pool));

  const handleSuccess = () => {
    setTurn(turn === 0 ? 1 : 0);
    setRound(value => value + 1);
    nextTask();
  };

  const handleFail = () => {
    const level = Math.min((steps[activePlayer.id] ?? 0) + 1, PENALTY_LADDER.length);
    setSteps(prev => ({ ...prev, [activePlayer.id]: level }));
    setPenaltyResult({ playerId: activePlayer.id, level });
    setPhase('penalty');
  };

  const confirmPenalty = () => {
    if (!penaltyResult) return;
    if (penaltyResult.level >= PENALTY_LADDER.length) {
      setLoserId(penaltyResult.playerId);
      setPhase('over');
      return;
    }
    setPenaltyResult(null);
    setTurn(turn === 0 ? 1 : 0);
    setRound(value => value + 1);
    nextTask();
    setPhase('play');
  };

  if (phase === 'over' && loserId !== null) {
    const loser = players.find(player => player.id === loserId);
    const winner = players.find(player => player.id !== loserId);
    return (
      <div className="space-y-4">
        <div className="rounded-3xl border border-[#FF453A]/30 bg-[#FF453A]/10 p-6 text-center">
          <Skull size={34} className="mx-auto text-[#FF453A]" />
          <div className="mt-3 text-xl font-bold text-white">{loser?.name} 登顶第五级</div>
          <div className="mt-2 text-sm text-gray-400">
            {winner?.name} 赢下这轮，最后的惩罚由 {loser?.name} 执行
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center text-[11px] text-gray-500">
          重新开始会清空阶梯进度
        </div>
      </div>
    );
  }

  if (phase === 'penalty' && penaltyResult) {
    const level = PENALTY_LADDER[penaltyResult.level - 1];
    const target = players.find(player => player.id === penaltyResult.playerId);
    return (
      <div className="space-y-4">
        <div className="rounded-3xl border border-[#FF9F0A]/30 bg-[#FF9F0A]/10 p-6 text-center">
          <TrendingUp size={30} className="mx-auto text-[#FF9F0A]" />
          <div className="mt-2 text-sm font-bold text-gray-400">{target?.name} 上升一级</div>
          <div className="mt-1 text-lg font-bold text-white">{level.label}</div>
          <div className="mt-3 text-base leading-relaxed text-white">{level.task}</div>
        </div>
        <button
          type="button"
          onClick={confirmPenalty}
          className="ios-btn h-14 w-full rounded-full bg-white text-base font-bold text-black shadow-lg"
        >
          {penaltyResult.level >= PENALTY_LADDER.length ? '完成，结束本轮' : '已完成，换对方'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold text-gray-400">
          第 {round} 回合
        </div>
        <div className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold text-[#FF9F0A]">
          失败一次升一级
        </div>
      </div>

      <div className="space-y-2">
        {players.map(player => {
          const level = steps[player.id] ?? 0;
          return (
            <div key={player.id} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold" style={{ color: player.color }}>{player.name}</span>
                <span className="text-[10px] font-bold text-gray-500">
                  {level === 0 ? '尚未失误' : `第 ${level} 级`}
                </span>
              </div>
              <div className="mt-2 flex gap-1">
                {PENALTY_LADDER.map(item => (
                  <span
                    key={item.level}
                    className={`h-1.5 flex-1 rounded-full ${
                      item.level <= level ? 'bg-[#FF453A]' : 'bg-white/10'
                    }`}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-2 rounded-2xl bg-white/5 py-3 text-sm font-bold text-white">
        {activePlayer?.id === 0 ? <User size={15} className="text-[#0A84FF]" /> : <UserRound size={15} className="text-[#FF375F]" />}
        {activePlayer?.name} 接受任务
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
        <div className="text-[10px] font-bold text-gray-500">本回合任务</div>
        <div className="mt-2 text-base font-bold leading-relaxed text-white">
          {currentTask?.task.text ?? '当前没有可用任务'}
        </div>
        <div className="mt-1 text-[11px] text-gray-500">
          来自「{currentTask?.themeName ?? '题库'}」
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleFail}
          className="ios-btn h-14 flex-1 rounded-full bg-[#3A3A3C] text-sm font-bold text-[#FF453A]"
        >
          <span className="flex items-center justify-center gap-1.5">
            <X size={15} />做不到，升一级
          </span>
        </button>
        <button
          type="button"
          onClick={handleSuccess}
          className="ios-btn h-14 flex-[2] rounded-full bg-white text-sm font-bold text-black shadow-lg"
        >
          <span className="flex items-center justify-center gap-1.5">
            <Check size={15} />完成了，换 {opponent?.name}
          </span>
        </button>
      </div>

      <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 text-[11px] leading-relaxed text-gray-500">
        规则：双方轮流完成任务。完成就换人；做不到则自己的阶梯上升一级，并立刻执行该级惩罚。谁先升到第五级，就要执行终极惩罚，本局由对方获胜。
      </div>
    </div>
  );
}

export function PenaltyLadderModeView({ players, themes, onBack }: PenaltyLadderModeViewProps) {
  const [runId, setRunId] = useModeState('PenaltyLadderModeView.runId', 0);

  return (
    <div className="mobile-game-screen fixed inset-x-0 top-0 bottom-0 z-50 flex flex-col bg-black">
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#2b1010] via-black to-[#0d1724] opacity-90" />
      <div className="relative z-10 mx-auto flex h-full w-full max-w-[430px] flex-col">
        <header className="mobile-screen-header flex shrink-0 items-center gap-3 px-4 py-2">
          <button onClick={onBack} className="ios-btn flex h-10 w-10 items-center justify-center rounded-full border border-white/5 bg-white/10" aria-label="返回首页">
            <ArrowLeft className="text-white" size={20} />
          </button>
          <div className="flex-1 text-center">
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#FF453A]">Penalty Ladder</div>
            <div className="mt-1 text-sm font-bold text-white">惩罚阶梯</div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center text-gray-500">
            <TrendingUp size={22} />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 no-scrollbar">
          <PenaltyLadderGame key={runId} players={players} themes={themes} />
          <button type="button" onClick={() => setRunId(value => value + 1)} className="ios-btn mx-auto mt-6 flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-xs font-bold text-gray-400">
            <RefreshCw size={13} />重新开始
          </button>
        </main>
      </div>
    </div>
  );
}
