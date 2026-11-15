import { useModeState, useMyTurn } from '../../rules/ModeRuntime';
import { useEffect, useRef } from 'react';
import { ArrowLeft, Coins, Flame, RefreshCw, Sparkles, User, UserRound } from 'lucide-react';
import { Player, Theme } from '../../types';
import { GAMBLE_TIERS, GambleTier } from '../../data/spicyContent';

interface GambleModeViewProps {
  players: Player[];
  themes: Theme[];
  onBack: () => void;
}

const CELL_WIDTH = 100;
const STRIP_START_INDEX = 4;
const SPIN_DURATION = 1900;

type Phase = 'bet' | 'spin' | 'result';

interface RoundResult {
  tier: GambleTier;
  task: string;
  loserId: number;
  winnerId: number;
  points: number;
}

function GambleGame({ players }: { players: Player[] }) {
  const [spinnerId, setSpinnerId] = useModeState('GambleModeView.spinnerId', 0);
  const [phase, setPhase] = useModeState<Phase>('GambleModeView.phase', 'bet');
  const [pendingTier, setPendingTier] = useModeState<GambleTier | null>('GambleModeView.pendingTier', null);
  const [reelIndex, setReelIndex] = useModeState('GambleModeView.reelIndex', STRIP_START_INDEX);
  const [roundKey, setRoundKey] = useModeState('GambleModeView.roundKey', 0);
  const [result, setResult] = useModeState<RoundResult | null>('GambleModeView.result', null);
  const [scores, setScores] = useModeState<Record<number, number>>('GambleModeView.scores', { 0: 0, 1: 0 });
  const [rounds, setRounds] = useModeState('GambleModeView.rounds', 0);
  const timerRef = useRef<number | null>(null);
  // 只有坐庄的人能选注码 / 开转 / 进入下一轮，否则两端都会各自开一把
  const canAct = useMyTurn(spinnerId);
  const spinLock = useRef(0);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  const spinner = players.find(player => player.id === spinnerId) ?? players[0];
  const nextSpinner = players.find(player => player.id !== spinnerId) ?? players[1];

  const startSpin = (tier: GambleTier) => {
    if (!canAct) return;
    // 连点保护：同一轮只允许开一次
    if (spinLock.current === roundKey + 1) return;
    spinLock.current = roundKey + 1;
    const entryIndex = Math.floor(Math.random() * tier.entries.length);
    const entry = tier.entries[entryIndex];
    // 赌局自己决定谁做任务：一半概率砸回坐庄的人
    const loserId = Math.random() < 0.5 ? spinnerId : (spinnerId === 0 ? 1 : 0);
    const winnerId = loserId === 0 ? 1 : 0;

    setPendingTier(tier);
    setResult({
      tier,
      task: entry.task,
      loserId,
      winnerId,
      points: tier.stake * 2
    });
    setPhase('spin');
    setReelIndex(8 + entryIndex);

    timerRef.current = window.setTimeout(() => {
      setScores(prev => ({ ...prev, [winnerId]: (prev[winnerId] ?? 0) + tier.stake * 2 }));
      setPhase('result');
    }, SPIN_DURATION);
  };

  const nextRound = () => {
    if (!canAct) return;
    setResult(null);
    setPendingTier(null);
    setPhase('bet');
    setRoundKey(value => value + 1);
    setReelIndex(STRIP_START_INDEX);
    setSpinnerId(prev => (prev === 0 ? 1 : 0));
    setRounds(value => value + 1);
  };

  const referenceEntries = pendingTier ? pendingTier.entries : GAMBLE_TIERS[0].entries;
  const strip = [...referenceEntries, ...referenceEntries, ...referenceEntries];

  const loser = result ? players.find(player => player.id === result.loserId) : undefined;
  const winner = result ? players.find(player => player.id === result.winnerId) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold text-gray-400">
          第 {rounds + 1} 轮
        </div>
        <div className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold">
          {players.map(player => (
            <span key={player.id} style={{ color: player.color }}>
              {player.name} {scores[player.id] ?? 0} 分
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 rounded-2xl bg-white/5 py-3 text-sm font-bold text-white">
        {spinner?.id === 0 ? <User size={15} className="text-[#0A84FF]" /> : <UserRound size={15} className="text-[#FF375F]" />}
        {canAct ? `${spinner?.name || '当前玩家'} 坐庄：选注码后开转` : `等 ${spinner?.name || '对方'} 选注码…`}
      </div>

      {/* 轮盘视窗 */}
      {phase !== 'bet' && (
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
          <div className="pointer-events-none absolute left-1/2 top-0 bottom-0 z-10 w-px -translate-x-1/2 bg-[#FFD60A]/60" />
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-black/60 to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-black/60 to-transparent" />
          <div className="h-[72px] w-full overflow-hidden">
            <div
              key={roundKey}
              className="flex h-full items-center will-change-transform"
              style={{
                transform: `translateX(${110 - reelIndex * CELL_WIDTH}px)`,
                transition: `transform ${SPIN_DURATION}ms cubic-bezier(0.12, 0.75, 0.05, 1)`
              }}
            >
              {strip.map((entry, index) => (
                <div
                  key={`${entry.label}-${index}`}
                  className="flex h-full shrink-0 items-center justify-center"
                  style={{ width: CELL_WIDTH }}
                >
                  <span className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-bold text-white">
                    {entry.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {phase === 'bet' && (
        <div className="space-y-3">
          <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5 text-center">
            <Coins size={30} className="mx-auto text-[#FFD60A]" />
            <div className="mt-2 text-lg font-bold text-white">
              {canAct ? '选择注码' : `等 ${spinner?.name || '对方'} 选注码`}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              只有坐庄的一方选注码；任务由<strong className="text-white">输的一方执行</strong>，结果有一半概率砸回你自己
            </div>
          </div>

          {GAMBLE_TIERS.map(tier => (
            <button
              key={tier.key}
              type="button"
              onClick={() => startSpin(tier)}
              disabled={!canAct}
              className="ios-btn flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-left active:bg-white/10 disabled:opacity-40"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10">
                  {tier.stake === 1
                    ? <Sparkles size={16} className="text-[#30D158]" />
                    : <Flame size={16} className={tier.stake === 2 ? 'text-[#FF9F0A]' : 'text-[#FF453A]'} />}
                </span>
                <div>
                  <div className="text-base font-bold text-white">{tier.label}</div>
                  <div className="mt-0.5 text-[11px] text-gray-500">{tier.hint}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-gray-500">赢家得分</div>
                <div className="text-sm font-bold text-[#FFD60A]">+{tier.stake * 2}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {phase === 'spin' && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] py-4 text-center text-sm font-bold text-gray-400">
          轮盘转动中…
        </div>
      )}

      {phase === 'result' && result && loser && winner && (
        <div className="space-y-3">
          <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
            <div className="flex items-center justify-between text-[11px] font-bold text-gray-500">
              <span>{result.tier.label} · 任务</span>
              <span className="text-[#FFD60A]">+{result.points} 分</span>
            </div>
            <div className="mt-3 text-lg font-bold leading-relaxed text-white">{result.task}</div>
            <div className="mt-4 flex items-center justify-between rounded-2xl bg-black/30 px-4 py-3 text-sm">
              <span className="font-bold" style={{ color: loser.color }}>
                {loser.name} 执行
              </span>
              <span className="text-xs text-gray-500">
                由 <span style={{ color: winner.color }}>{winner.name}</span> 得分
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={nextRound}
            disabled={!canAct}
            className="ios-btn h-14 w-full rounded-full bg-white text-base font-bold text-black shadow-lg disabled:opacity-50"
          >
            {canAct ? `下一轮（换 ${nextSpinner?.name} 坐庄）` : `等 ${spinner?.name || '对方'} 开下一轮`}
          </button>
        </div>
      )}
    </div>
  );
}

export function GambleModeView({ players, onBack }: GambleModeViewProps) {
  const [runId, setRunId] = useModeState('GambleModeView.runId', 0);

  return (
    <div className="mobile-game-screen fixed inset-x-0 top-0 bottom-0 z-50 flex flex-col bg-black">
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#1f1a0b] via-black to-[#0d1724] opacity-90" />
      <div className="relative z-10 mx-auto flex h-full w-full max-w-[430px] flex-col">
        <header className="mobile-screen-header flex shrink-0 items-center gap-3 px-4 py-2">
          <button onClick={onBack} className="ios-btn flex h-10 w-10 items-center justify-center rounded-full border border-white/5 bg-white/10" aria-label="返回首页">
            <ArrowLeft className="text-white" size={20} />
          </button>
          <div className="flex-1 text-center">
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#FFD60A]">Gamble Wheel</div>
            <div className="mt-1 text-sm font-bold text-white">赌局轮盘</div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center text-gray-500">
            <Coins size={22} />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 no-scrollbar">
          <GambleGame key={runId} players={players} />
          <button type="button" onClick={() => setRunId(value => value + 1)} className="ios-btn mx-auto mt-6 flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-xs font-bold text-gray-400">
            <RefreshCw size={13} />重新开始
          </button>
        </main>
      </div>
    </div>
  );
}
