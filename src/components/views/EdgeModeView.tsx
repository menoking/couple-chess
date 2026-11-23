import { useDeckSeed, useModeAuthority, useModeState, useMyTurn } from '../../rules/ModeRuntime';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Flame, RefreshCw, Timer, User, UserRound } from 'lucide-react';
import { Player, Theme } from '../../types';
import { buildTaskPool, pickRewardTask, seededShuffle } from '../../utils/modeKit';
import { pickFresh, taskKeyOf } from '../../utils/freshPick';
import { EDGE_LADDER } from '../../data/spicyContent';
import { formatTaskInstruction, resolveTaskRule, rewardCandidates } from '../../rules/taskRules';

interface EdgeModeViewProps {
  players: Player[];
  themes: Theme[];
  onBack: () => void;
}

type Phase = 'ready' | 'running' | 'decide' | 'result';

function EdgeGame({ players, themes }: { players: Player[]; themes: Theme[] }) {
  const [attackerId, setAttackerId] = useModeState('EdgeModeView.attackerId', 0);
  const [levelIndex, setLevelIndex] = useModeState('EdgeModeView.levelIndex', 0);
  const [phase, setPhase] = useModeState<Phase>('EdgeModeView.phase', 'ready');
  // 存截止时间而不是每秒写共享状态：两端各自算剩余秒数，不会被对方的旧快照覆盖
  const [deadline, setDeadline] = useModeState('EdgeModeView.deadline', 0);
  const [breakerId, setBreakerId] = useModeState<number | null>('EdgeModeView.breakerId', null);
  const [forcedLoss, setForcedLoss] = useModeState('EdgeModeView.forcedLoss', false);
  const [now, setNow] = useState(() => Date.now());
  // 每轮换人后轮次 +1，用它挑一批新的关卡任务（两端用同一个种子算，结果一致）
  const [round, setRound] = useModeState('EdgeModeView.round', 0);
  // 结算任务只抽一次并存下来，避免每次重渲染都换一句
  const [resultTask, setResultTask] = useModeState<{ text: string; themeName: string } | null>(
    'EdgeModeView.resultTask',
    null
  );
  /** 已经结算过的任务：同一局不再重复 */
  const [usedResultTasks, setUsedResultTasks] = useModeState<string[]>('EdgeModeView.usedResultTasks', []);
  const deckSeed = useDeckSeed();
  const switchLock = useRef(false);
  const authority = useModeAuthority();

  const attacker = players.find(player => player.id === attackerId) ?? players[0];
  const defender = players.find(player => player.id !== attackerId) ?? players[1];
  const level = EDGE_LADDER[levelIndex];
  const pool = buildTaskPool(players, themes) ?? [];
  // 同一轮两端算出同一份动作：按房间种子把变体排成一个固定顺序，
  // 每换一次人往前走一格 —— 必然换一句，且会把所有变体都用到。
  const levelActions = EDGE_LADDER.map((item, index) => {
    const order = seededShuffle(
      item.actions.map((_, at) => at),
      `${deckSeed}:edge-order:${index}`
    );
    return item.actions[order[round % order.length]] ?? item.actions[0];
  });
  const levelAction = levelActions[levelIndex];

  // 推进方负责「开始计时」，承受方负责「认输 / 继续」
  const attackerCanAct = useMyTurn(attackerId);
  const defenderCanAct = useMyTurn(defender?.id ?? -1);

  const remaining = deadline > 0 ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;

  // 本机秒表：只驱动重渲染
  useEffect(() => {
    if (phase !== 'running' || deadline <= 0) return;
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [phase, deadline]);

  // 到点由权威端统一推进阶段，避免两端各写一次
  useEffect(() => {
    if (!authority || phase !== 'running' || deadline <= 0) return;
    if (remaining > 0) return;
    setPhase('decide');
  }, [authority, phase, deadline, remaining, setPhase]);

  const startLevel = () => {
    if (!attackerCanAct) return;
    setDeadline(Date.now() + level.seconds * 1000);
    setNow(Date.now());
    setPhase('running');
  };

  const rollResultTask = (loserId: number) => {
    const compatible = rewardCandidates(pool, entry => entry.task, 1 - loserId, loserId);
    const picked = pickFresh(compatible, usedResultTasks, entry => taskKeyOf(entry.task));
    if (picked) setUsedResultTasks(picked.used);
    const entry = picked?.item ?? pickRewardTask(pool, 1 - loserId, loserId);
    const rule = resolveTaskRule(entry.task, loserId);
    setResultTask({ text: formatTaskInstruction(entry.task.text, rule), themeName: entry.themeName });
  };

  const holdOn = () => {
    if (!defenderCanAct) return;
    // 撑住 → 进入下一级；撑满五级则推进方失败
    if (levelIndex + 1 >= EDGE_LADDER.length) {
      setBreakerId(attackerId);
      setForcedLoss(true);
      rollResultTask(attackerId);
      setPhase('result');
      return;
    }
    setLevelIndex(levelIndex + 1);
    setPhase('ready');
  };

  const giveUp = () => {
    if (!defenderCanAct) return;
    setBreakerId(defender.id);
    setForcedLoss(false);
    rollResultTask(defender.id);
    setPhase('result');
  };

  const switchRoles = () => {
    if (switchLock.current) return;
    switchLock.current = true;
    setAttackerId(prev => (prev === 0 ? 1 : 0));
    setLevelIndex(0);
    setDeadline(0);
    setBreakerId(null);
    setForcedLoss(false);
    setResultTask(null);
    // 轮次前进 → 下一局五个关卡都换成另一批动作
    setRound(value => value + 1);
    setPhase('ready');
    window.setTimeout(() => { switchLock.current = false; }, 400);
  };

  if (phase === 'result' && breakerId !== null) {
    const loser = players.find(player => player.id === breakerId);
    const winner = players.find(player => player.id !== breakerId);
    const task = resultTask;

    return (
      <div className="space-y-4">
        <div className="rounded-3xl border border-[#FF375F]/30 bg-[#FF375F]/10 p-6 text-center">
          <Flame size={34} className="mx-auto text-[#FF375F]" />
          <div className="mt-3 text-xl font-bold text-white">
            {forcedLoss ? `${loser?.name} 没能破了对方` : `${loser?.name} 先撑不住了`}
          </div>
          <div className="mt-2 text-sm text-gray-400">
            {forcedLoss
              ? `五级全部扛过去，${winner?.name} 推进失败`
              : `${attacker?.name} 推进到第 ${levelIndex + 1} 级拿下本局`}
          </div>
        </div>

        {task && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5">
            <div className="text-xs font-bold text-gray-500">执行关系以卡面标注为准</div>
            <div className="mt-2 text-base font-semibold leading-relaxed text-white">{task.text}</div>
            <div className="mt-1 text-[11px] text-gray-500">来自「{task.themeName}」</div>
          </div>
        )}

        <button
          type="button"
          onClick={switchRoles}
          className="ios-btn h-14 w-full rounded-full bg-white text-base font-bold text-black shadow-lg"
        >
          换 {winner?.name} 推进
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold text-gray-400">
          第 {levelIndex + 1} / {EDGE_LADDER.length} 级
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1">
          {EDGE_LADDER.map((item, index) => (
            <span
              key={item.level}
              className={`h-1.5 w-5 rounded-full ${
                index < levelIndex ? 'bg-[#FF375F]' : index === levelIndex ? 'bg-[#FF375F]/60' : 'bg-white/15'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 rounded-2xl bg-white/5 py-3 text-sm font-bold text-white">
        {attacker?.id === 0 ? <User size={15} className="text-[#0A84FF]" /> : <UserRound size={15} className="text-[#FF375F]" />}
        {attacker?.name} 推进 · {defender?.name} 承受
      </div>

      <div className="rounded-3xl border border-[#FF375F]/25 bg-[#FF375F]/[0.07] p-5">
        <div className="text-xs font-bold text-[#FF7A96]">第 {level.level} 级 · {level.title}</div>
        <div className="mt-3 text-base font-bold leading-relaxed text-white">{levelAction}</div>
        <div className="mt-3 flex items-center gap-1.5 text-[11px] font-bold text-gray-500">
          <Timer size={12} />需要保持 {level.seconds} 秒
        </div>
      </div>

      {phase === 'ready' && (
        <button
          type="button"
          onClick={startLevel}
          disabled={!attackerCanAct}
          className="ios-btn h-14 w-full rounded-full bg-white text-base font-bold text-black shadow-lg disabled:opacity-50"
        >
          {attackerCanAct ? '开始计时' : `等 ${attacker?.name || '对方'} 开始计时`}
        </button>
      )}

      {phase === 'running' && (
        <div className="space-y-3">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] py-6 text-center">
            <div className="text-5xl font-bold tabular-nums text-white">{remaining}</div>
            <div className="mt-1 text-xs text-gray-500">秒 · 坚持住</div>
          </div>
          <button
            type="button"
            onClick={giveUp}
            disabled={!defenderCanAct}
            className="ios-btn h-12 w-full rounded-full bg-[#3A3A3C] text-sm font-bold text-[#FF453A] disabled:opacity-50"
          >
            {defender?.name} 撑不住，认输
          </button>
        </div>
      )}

      {phase === 'decide' && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-[#FF9F0A]/30 bg-[#FF9F0A]/10 p-3 text-center text-xs font-bold text-[#FFB340]">
            第 {level.level} 级坚持完成
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={giveUp}
              disabled={!defenderCanAct}
              className="ios-btn h-14 flex-1 rounded-full bg-[#3A3A3C] text-sm font-bold text-[#FF453A] disabled:opacity-50"
            >
              认输，到此为止
            </button>
            <button
              type="button"
              onClick={holdOn}
              disabled={!defenderCanAct}
              className="ios-btn h-14 flex-[2] rounded-full bg-white text-sm font-bold text-black shadow-lg disabled:opacity-50"
            >
              <span className="flex items-center justify-center gap-1.5">
                <Check size={15} />
                {levelIndex + 1 >= EDGE_LADDER.length ? '全部扛过，我赢了' : `继续第 ${levelIndex + 2} 级`}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function EdgeModeView({ players, themes, onBack }: EdgeModeViewProps) {
  const [runId, setRunId] = useModeState('EdgeModeView.runId', 0);
  const [, setUsedResultTasks] = useModeState<string[]>('EdgeModeView.usedResultTasks', []);
  const [, setResultTask] = useModeState<{ text: string; themeName: string } | null>('EdgeModeView.resultTask', null);

  const restart = () => {
    setUsedResultTasks([]);
    setResultTask(null);
    setRunId(value => value + 1);
  };

  return (
    <div className="mobile-game-screen fixed inset-x-0 top-0 bottom-0 z-50 flex flex-col bg-black">
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#2b0d14] via-black to-[#0d1724] opacity-90" />
      <div className="relative z-10 mx-auto flex h-full w-full max-w-[430px] flex-col">
        <header className="mobile-screen-header flex shrink-0 items-center gap-3 px-4 py-2">
          <button onClick={onBack} className="ios-btn flex h-10 w-10 items-center justify-center rounded-full border border-white/5 bg-white/10" aria-label="返回首页">
            <ArrowLeft className="text-white" size={20} />
          </button>
          <div className="flex-1 text-center">
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#FF375F]">Edge Ladder</div>
            <div className="mt-1 text-sm font-bold text-white">高潮边缘 · 五级定力</div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center text-gray-500">
            <Flame size={22} />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 no-scrollbar">
          <EdgeGame key={runId} players={players} themes={themes} />
          <button type="button" onClick={restart} className="ios-btn mx-auto mt-6 flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-xs font-bold text-gray-400">
            <RefreshCw size={13} />重新开始
          </button>
        </main>
      </div>
    </div>
  );
}
