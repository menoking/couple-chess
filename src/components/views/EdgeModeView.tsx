import { useRef, useState } from 'react';
import { ArrowLeft, Flame, RefreshCw, User, UserRound } from 'lucide-react';
import { Player, Theme } from '../../types';
import { buildTaskPool, pickRandom } from '../../utils/modeKit';

interface EdgeModeViewProps {
  players: Player[];
  themes: Theme[];
  onBack: () => void;
}

type Phase = 'intro' | 'active' | 'break' | 'result';

function EdgeGame({ players, themes }: { players: Player[]; themes: Theme[] }) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [attackerId, setAttackerId] = useState(0);
  const [brokeId, setBrokeId] = useState<number | null>(null);
  const [intensity, setIntensity] = useState(1);
  const timerRef = useRef<number | null>(null);

  const attacker = players[attackerId];
  const defender = players.find(p => p.id !== attackerId);
  const pool = buildTaskPool(players, themes) ?? [];

  const start = () => {
    setPhase('active');
    setIntensity(1);
    setBrokeId(null);
  };

  const hold = () => {
    // 防守方稳住 → 强度升级
    setIntensity(value => Math.min(5, value + 1));
  };

  const broke = () => {
    // 防守方崩了
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    setBrokeId(defender?.id ?? null);
    setPhase('result');
  };

  const switchAttacker = () => {
    setAttackerId(prev => (prev === 0 ? 1 : 0));
    setPhase('intro');
  };

  if (phase === 'result' && brokeId !== null) {
    const loser = players.find(p => p.id === brokeId);
    const winner = players.find(p => p.id !== brokeId);
    const task = pickRandom(pool);
    return (
      <div className="space-y-4">
        <div className="rounded-3xl border border-[#FF375F]/30 bg-[#FF375F]/10 p-6 text-center">
          <Flame size={36} className="mx-auto text-[#FF375F]" />
          <div className="mt-3 text-xl font-bold text-white">
            {loser?.name} 先撑不住了！
          </div>
          <div className="mt-2 text-sm text-gray-400">
            {winner?.name} 赢了这轮定力对决
          </div>
        </div>
        {task && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5">
            <div className="text-xs font-bold text-gray-500">输家要完成的高尺度任务</div>
            <div className="mt-2 text-base font-semibold leading-relaxed text-white">{task.task.text}</div>
            <div className="mt-1 text-[11px] text-gray-500">来自「{task.themeName}」</div>
          </div>
        )}
        <button type="button" onClick={switchAttacker} className="ios-btn h-14 w-full rounded-full bg-white text-base font-bold text-black shadow-lg">
          换 {winner?.name} 进攻
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold text-gray-400">
          强度 {'🔥'.repeat(intensity)}{'·'.repeat(5 - intensity)}
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-[#FF375F]/15 px-3 py-1 text-[10px] font-bold text-[#FF7A96]">
          <Flame size={12} />定力对决
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 rounded-2xl bg-white/5 py-3 text-sm font-bold text-white">
        <User size={15} className="text-[#0A84FF]" />
        {attacker?.name || '进攻方'} 正在挑逗 {defender?.name || '防守方'}
        <UserRound size={15} className="text-[#FF375F]" />
      </div>

      {phase === 'intro' && (
        <div className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-6 text-center">
            <div className="text-lg font-bold text-white">把对方推到临界点</div>
            <div className="mt-2 text-sm text-gray-400">
              {attacker?.name} 用亲吻、触碰、言语挑逗 {defender?.name}，谁的定力先崩谁输
            </div>
          </div>
          <button type="button" onClick={start} className="ios-btn h-14 w-full rounded-full bg-white text-base font-bold text-black shadow-lg">
            开始挑逗
          </button>
        </div>
      )}

      {phase === 'active' && (
        <div className="space-y-4">
          <div className="rounded-3xl border border-[#FF375F]/20 bg-[#FF375F]/5 p-6 text-center">
            <div className="text-sm text-gray-400">当前强度</div>
            <div className="mt-2 text-3xl font-bold text-white">{'🔥'.repeat(intensity)}</div>
            <div className="mt-2 text-xs text-gray-500">
              {intensity <= 2 ? '轻触、耳语、慢慢来' : intensity <= 4 ? '加重挑逗，逼近临界' : '全力冲刺，看谁先崩'}
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={broke}
              className="ios-btn h-14 flex-1 rounded-full bg-[#FF375F] text-base font-bold text-white"
            >
              {defender?.name} 撑不住了
            </button>
            <button
              type="button"
              onClick={hold}
              className="ios-btn h-14 flex-[2] rounded-full bg-white text-base font-bold text-black"
            >
              稳住，继续加码
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function EdgeModeView({ players, themes, onBack }: EdgeModeViewProps) {
  const [runId, setRunId] = useState(0);

  return (
    <div className="mobile-game-screen fixed inset-x-0 top-0 bottom-0 z-50 flex flex-col bg-black">
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#2b0d14] via-black to-[#0d1724] opacity-90" />
      <div className="relative z-10 mx-auto flex h-full w-full max-w-[430px] flex-col">
        <header className="mobile-screen-header flex shrink-0 items-center gap-3 px-4 py-2">
          <button onClick={onBack} className="ios-btn flex h-10 w-10 items-center justify-center rounded-full border border-white/5 bg-white/10" aria-label="返回首页">
            <ArrowLeft className="text-white" size={20} />
          </button>
          <div className="flex-1 text-center">
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#FF375F]">Edge Control</div>
            <div className="mt-1 text-sm font-bold text-white">高潮边缘挑战</div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center text-gray-500">
            <Flame size={22} />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 no-scrollbar">
          <EdgeGame key={runId} players={players} themes={themes} />
          <button type="button" onClick={() => setRunId(value => value + 1)} className="ios-btn mx-auto mt-6 flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-xs font-bold text-gray-400">
            <RefreshCw size={13} />重新开始
          </button>
        </main>
      </div>
    </div>
  );
}
