import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, Coins, Flame, RefreshCw, Sparkles, User, UserRound } from 'lucide-react';
import { useModeState, useMyTurn } from '../../rules/ModeRuntime';
import { Player, Theme } from '../../types';
import { GAMBLE_TIERS, GambleTier, GambleEntry } from '../../data/spicyContent';
import { pickFresh } from '../../utils/freshPick';

interface GambleModeViewProps {
  players: Player[];
  themes: Theme[];
  onBack: () => void;
}

/** 单格宽度 + 间距：两者相加是滚动一格的位移 */
const CELL_WIDTH = 96;
const CELL_GAP = 8;
const PITCH = CELL_WIDTH + CELL_GAP;
/** 轮盘把同一档位重复铺 7 份，保证「多转几圈」时两端不会露白 */
const STRIP_COPIES = 7;
/** 起始停在第 4 份的第一格，向右还有足够空间给 2 圈减速 */
const BASE_INDEX = 3 * 8;
const LOOP_CELLS = 16;
const SPIN_DURATION = 2800;
/** 动画结束后再留一点时间感，然后由坐庄方把阶段推进到 result */
const RESULT_HOLD = 420;

type Phase = 'bet' | 'spin' | 'result';

interface RoundResult {
  tier: GambleTier;
  task: string;
  label: string;
  loserId: number;
  winnerId: number;
  points: number;
}

const entryKey = (entry: GambleEntry) => `${entry.label}|${entry.task}`;

function GambleGame({ players }: { players: Player[] }) {
  const [spinnerId, setSpinnerId] = useModeState('GambleModeView.spinnerId', 0);
  const [phase, setPhase] = useModeState<Phase>('GambleModeView.phase', 'bet');
  const [pendingTier, setPendingTier] = useModeState<GambleTier | null>('GambleModeView.pendingTier', null);
  /** 停在选择线上的绝对格号：两端共享，各自用同一目标跑本地动画 */
  const [reelIndex, setReelIndex] = useModeState('GambleModeView.reelIndex', BASE_INDEX);
  /** 每开一次转 +1，是启动本地滚动动画的唯一信号 */
  const [spinSeq, setSpinSeq] = useModeState('GambleModeView.spinSeq', 0);
  const [roundKey, setRoundKey] = useModeState('GambleModeView.roundKey', 0);
  const [result, setResult] = useModeState<RoundResult | null>('GambleModeView.result', null);
  const [scores, setScores] = useModeState<Record<number, number>>('GambleModeView.scores', { 0: 0, 1: 0 });
  const [rounds, setRounds] = useModeState('GambleModeView.rounds', 0);
  /** 每个档位已经抽过的任务 key：抽完自动洗牌 */
  const [used, setUsed] = useModeState<Record<string, string[]>>('GambleModeView.used', {});
  const [notice, setNotice] = useModeState<string | null>('GambleModeView.notice', null);

  const canAct = useMyTurn(spinnerId);
  const spinLock = useRef(0);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [viewportWidth, setViewportWidth] = useState(390);
  /** 当前静止位置（px）。rAF 期间直接改 DOM，只在停下时同步回 state */
  const [restOffset, setRestOffset] = useState(0);
  const restOffsetRef = useRef(0);
  /** 动画进行中的实时位置；null 表示当前没有动画 */
  const animPosRef = useRef<number | null>(null);
  const reelIndexRef = useRef(reelIndex);
  reelIndexRef.current = reelIndex;
  const [settled, setSettled] = useState(false);

  const offsetFor = (index: number, width = viewportWidth) =>
    index * PITCH + CELL_WIDTH / 2 - width / 2;

  const spinner = players.find(player => player.id === spinnerId) ?? players[0];
  const nextSpinner = players.find(player => player.id !== spinnerId) ?? players[1];
  const tier = pendingTier ?? GAMBLE_TIERS[0];
  const entries = tier.entries;
  const strip: Array<{ entry: GambleEntry; sourceIndex: number }> = [];
  for (let copy = 0; copy < STRIP_COPIES; copy += 1) {
    entries.forEach((entry, sourceIndex) => strip.push({ entry, sourceIndex }));
  }

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
  }, []);

  // 首次挂载把轮盘对齐到基准格，避免一进来就看到半张卡
  const bootstrapped = useRef(false);
  useLayoutEffect(() => {
    const width = viewportRef.current?.clientWidth ?? 0;
    if (width <= 0) return;
    if (Math.abs(width - viewportWidth) > 1) {
      setViewportWidth(width);
      return;
    }
    if (bootstrapped.current) return;
    const position = BASE_INDEX * PITCH + CELL_WIDTH / 2 - width / 2;
    restOffsetRef.current = position;
    setRestOffset(position);
    bootstrapped.current = true;
  }, [viewportWidth]);

  // 动画期间如果因为对端快照触发重渲染，React 会拿旧的 restOffset 覆盖内联 transform，
  // 画面就会跳回起点。每次提交后把当前动画位置写回去，滚动才是连续的。
  useLayoutEffect(() => {
    if (animPosRef.current === null) return;
    const element = stripRef.current;
    if (element) element.style.transform = `translate3d(${-animPosRef.current}px,0,0)`;
  });

  // 滚动动画：先高速滑动，再按三次方缓出慢慢停到选择线上。
  // 每帧只写 DOM transform，不写共享状态，否则联机会变成几十条 patch/秒。
  useEffect(() => {
    if (spinSeq === 0) return;
    const element = stripRef.current;
    if (!element) return;
    const target = offsetFor(reelIndexRef.current);
    const from = restOffsetRef.current;
    if (Math.abs(target - from) < 1) {
      element.style.transform = `translate3d(${-target}px,0,0)`;
      restOffsetRef.current = target;
      setRestOffset(target);
      setSettled(true);
      return;
    }
    const startedAt = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - startedAt) / SPIN_DURATION);
      const eased = 1 - Math.pow(1 - t, 3);
      const position = from + (target - from) * eased;
      animPosRef.current = position;
      element.style.transform = `translate3d(${-position}px,0,0)`;
      if (t < 1) {
        rafRef.current = window.requestAnimationFrame(step);
        return;
      }
      rafRef.current = null;
      animPosRef.current = null;
      restOffsetRef.current = target;
      setRestOffset(target);
      setSettled(true);
      if (navigator.vibrate) navigator.vibrate(24);
    };
    rafRef.current = window.requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // 只由 spinSeq 启动；目标格 / 宽度从 ref 读取，避免分两批到达时跑错位置
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinSeq]);

  // 对端可能在本地动画还没结束时先收到 result：直接把轮盘钉到目标格，避免停在半路
  useEffect(() => {
    if (phase !== 'result') return;
    const element = stripRef.current;
    if (!element) return;
    if (restOffsetRef.current === offsetFor(reelIndexRef.current) && settled) return;
    const target = offsetFor(reelIndexRef.current);
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    animPosRef.current = null;
    element.style.transform = `translate3d(${-target}px,0,0)`;
    restOffsetRef.current = target;
    setRestOffset(target);
    setSettled(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // 进入下一轮的投注阶段（phase 变回 bet）：两端一起把轮盘放回基准位。
  // 不能只在坐庄端复位，否则对端下一轮会从上一轮的终点往左倒着滚。
  useEffect(() => {
    if (phase !== 'bet') return;
    const element = stripRef.current;
    if (!element) return;
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    animPosRef.current = null;
    const target = offsetFor(BASE_INDEX);
    element.style.transform = `translate3d(${-target}px,0,0)`;
    restOffsetRef.current = target;
    setRestOffset(target);
    setSettled(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const startSpin = (nextTier: GambleTier) => {
    if (!canAct) return;
    // 连点保护：同一轮只允许开一次
    if (spinLock.current === roundKey + 1) return;
    const picked = pickFresh(nextTier.entries, used[nextTier.key] ?? [], entryKey);
    if (!picked) return;
    spinLock.current = roundKey + 1;

    const entry = picked.item;
    const entryIndex = nextTier.entries.indexOf(entry);
    // 赌局自己决定谁做任务：一半概率砸回坐庄的人
    const loserId = Math.random() < 0.5 ? spinnerId : spinnerId === 0 ? 1 : 0;
    const winnerId = loserId === 0 ? 1 : 0;
    // 目标是「基准格之后多转两圈」的位置：快速滑动 → 缓慢停下 → 正好压在选择线上
    const targetIndex = BASE_INDEX + LOOP_CELLS + Math.max(0, entryIndex);

    setUsed(previous => ({ ...previous, [nextTier.key]: picked.used }));
    setNotice(
      picked.reset
        ? `「${nextTier.label}」这一档已经全部抽过，牌堆重新洗好了`
        : null
    );
    setPendingTier(nextTier);
    setResult({
      tier: nextTier,
      task: entry.task,
      label: entry.label,
      loserId,
      winnerId,
      points: nextTier.stake * 2
    });
    setReelIndex(targetIndex);
    setSettled(false);
    setPhase('spin');
    setSpinSeq(value => value + 1);
    if (navigator.vibrate) navigator.vibrate([10, 24, 10]);

    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    // 只有坐庄方能推进阶段；对端靠房间快照同步，不能各写一次
    timerRef.current = window.setTimeout(() => {
      setScores(previous => ({ ...previous, [winnerId]: (previous[winnerId] ?? 0) + nextTier.stake * 2 }));
      setPhase('result');
    }, SPIN_DURATION + RESULT_HOLD);
  };

  const nextRound = () => {
    if (!canAct) return;
    setResult(null);
    setPendingTier(null);
    setNotice(null);
    setPhase('bet');
    setRoundKey(value => value + 1);
    setSpinnerId(previous => (previous === 0 ? 1 : 0));
    setRounds(value => value + 1);
  };

  const loser = result ? players.find(player => player.id === result.loserId) : undefined;
  const winner = result ? players.find(player => player.id === result.winnerId) : undefined;
  const usedInTier = (used[tier.key] ?? []).filter(key => entries.some(entry => entryKey(entry) === key));
  const remainingInTier = Math.max(0, entries.length - usedInTier.length);
  // 本轮抽中的那条已经写进 used 了，但它不是「之前抽过的」，不能提前灰掉
  const currentEntryKey = result ? `${result.label}|${result.task}` : null;

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

      {/* 轮盘视窗：中央金线就是选择线，停在哪张卡上就执行哪条任务 */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#141310]">
        <div ref={viewportRef} className="relative h-[104px] w-full overflow-hidden">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-20 w-10 bg-gradient-to-r from-[#141310] to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-20 w-10 bg-gradient-to-l from-[#141310] to-transparent" />
          <div
            ref={stripRef}
            className="flex h-full items-center will-change-transform"
            style={{ transform: `translate3d(${-restOffset}px,0,0)`, gap: CELL_GAP }}
          >
            {strip.map(({ entry }, index) => {
              const key = entryKey(entry);
              const isUsed = usedInTier.includes(key) && key !== currentEntryKey;
              const isWinner = settled && index === reelIndex;
              return (
                <div
                  key={`${roundKey}-${key}-${index}`}
                  className={`relative flex h-[76px] shrink-0 flex-col items-center justify-center rounded-2xl border text-center transition-[box-shadow,background-color,transform] duration-300 ${
                    isWinner
                      ? 'scale-[1.06] border-[#FFD60A] bg-[#FFD60A]/20 shadow-[0_0_28px_rgba(255,214,10,0.35)]'
                      : isUsed
                        ? 'border-white/5 bg-white/[0.02] opacity-35'
                        : 'border-white/10 bg-white/[0.06]'
                  }`}
                  style={{ width: CELL_WIDTH }}
                >
                  <span className={`text-sm font-bold ${isWinner ? 'text-[#FFD60A]' : 'text-white'}`}>
                    {entry.label}
                  </span>
                  {isUsed && !isWinner && (
                    <span className="mt-1 text-[9px] font-bold text-gray-500">已抽过</span>
                  )}
                  {isWinner && (
                    <span className="mt-1 text-[9px] font-bold text-[#FFD60A]">抽中</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* 选择线 */}
          <div className="pointer-events-none absolute inset-y-2 left-1/2 z-30 w-0.5 -translate-x-1/2 rounded-full bg-[#FFD60A] shadow-[0_0_18px_rgba(255,214,10,0.65)]" />
          <div className="pointer-events-none absolute left-1/2 top-0 z-30 -translate-x-1/2 border-x-[7px] border-t-[10px] border-x-transparent border-t-[#FFD60A]" />
          <div className="pointer-events-none absolute bottom-0 left-1/2 z-30 -translate-x-1/2 border-x-[7px] border-b-[10px] border-x-transparent border-b-[#FFD60A]" />
        </div>
        <div className="flex items-center justify-between border-t border-white/5 px-4 py-2 text-[10px] font-bold text-gray-500">
          <span>
            {phase === 'bet'
              ? '选好注码就开转'
              : `${tier.label} · 本档剩余 ${remainingInTier} / ${entries.length}`}
          </span>
          <span className={phase === 'spin' ? 'text-[#FFD60A]' : 'text-gray-500'}>
            {phase === 'spin' ? '转动中…' : phase === 'result' ? '已停在选择线' : '等待开转'}
          </span>
        </div>
      </div>

      {notice && (
        <div className="rounded-2xl border border-[#FFD60A]/25 bg-[#FFD60A]/10 px-4 py-2.5 text-center text-[11px] font-bold text-[#FFD60A]">
          {notice}
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

          {GAMBLE_TIERS.map(item => {
            const left = item.entries.length
              - (used[item.key] ?? []).filter(key => item.entries.some(entry => entryKey(entry) === key)).length;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => startSpin(item)}
                disabled={!canAct}
                className="ios-btn flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-left active:bg-white/10 disabled:opacity-40"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10">
                    {item.stake === 1
                      ? <Sparkles size={16} className="text-[#30D158]" />
                      : <Flame size={16} className={item.stake === 2 ? 'text-[#FF9F0A]' : 'text-[#FF453A]'} />}
                  </span>
                  <div>
                    <div className="text-base font-bold text-white">{item.label}</div>
                    <div className="mt-0.5 text-[11px] text-gray-500">{item.hint}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-gray-500">赢家得分</div>
                  <div className="text-sm font-bold text-[#FFD60A]">+{item.stake * 2}</div>
                  <div className="mt-0.5 text-[9px] text-gray-600">剩 {left} 张</div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {phase === 'spin' && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] py-4 text-center text-sm font-bold text-gray-400">
          轮盘转动中…停下后压住的那张就是本轮任务
        </div>
      )}

      {phase === 'result' && result && loser && winner && (
        <div className="space-y-3">
          <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
            <div className="flex items-center justify-between text-[11px] font-bold text-gray-500">
              <span>{result.tier.label} · {result.label}</span>
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
  const [, setUsed] = useModeState<Record<string, string[]>>('GambleModeView.used', {});
  const [, setPhase] = useModeState<Phase>('GambleModeView.phase', 'bet');
  const [, setResult] = useModeState<RoundResult | null>('GambleModeView.result', null);
  const [, setScores] = useModeState<Record<number, number>>('GambleModeView.scores', { 0: 0, 1: 0 });
  const [, setRounds] = useModeState('GambleModeView.rounds', 0);
  const [, setNotice] = useModeState<string | null>('GambleModeView.notice', null);

  const restart = () => {
    setUsed({});
    setPhase('bet');
    setResult(null);
    setScores({ 0: 0, 1: 0 });
    setRounds(0);
    setNotice(null);
    setRunId(value => value + 1);
  };

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
          <button type="button" onClick={restart} className="ios-btn mx-auto mt-6 flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-xs font-bold text-gray-400">
            <RefreshCw size={13} />重新开始
          </button>
        </main>
      </div>
    </div>
  );
}
