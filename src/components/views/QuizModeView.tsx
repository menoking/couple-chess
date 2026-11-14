import { useDeckSeed, useModeRuntime, useModeState } from '../../rules/ModeRuntime';

import { ArrowLeft, Check, MessageCircleQuestion, RefreshCw, User, UserRound, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Player, Theme } from '../../types';
import { QUIZ_QUESTIONS, QuizQuestion } from '../../data/quizQuestions';
import { seededShuffle } from '../../utils/modeKit';

interface QuizModeViewProps {
  players: Player[];
  themes?: Theme[];
  onBack: () => void;
}

const ROUNDS = 8;

interface QuizReveal {
  round: number;
  values: [number | null, number | null];
}

function getMatchTier(rate: number): { label: string; desc: string } {
  if (rate >= 1) return { label: '心有灵犀', desc: '全部一致！你们怕不是同一个脑袋两个人' };
  if (rate >= 0.75) return { label: '默契十足', desc: '大部分想法不谋而合，很难得' };
  if (rate >= 0.5) return { label: '渐入佳境', desc: '一半一致，剩下的一半继续磨合' };
  if (rate >= 0.25) return { label: '各怀心思', desc: '默契度告急，建议加练几轮' };
  return { label: '火星撞地球', desc: '几乎没有共识……或者在故意唱反调' };
}

function QuizGame({ players, onExit }: { players: Player[]; onExit: () => void }) {
  const runtime = useModeRuntime();
  const online = runtime !== null;
  const mySeat = runtime?.seat ?? 0;
  const authority = runtime?.authority ?? true;

  const male = players[0];
  const female = players[1];

  // 两端用同一个房间种子洗牌，得到完全相同的题目顺序（不需要等房主下发）
  const deckSeed = useDeckSeed();
  const [queue] = useModeState<QuizQuestion[]>('QuizModeView.queue', () =>
    seededShuffle(QUIZ_QUESTIONS, `${deckSeed}:quiz`).slice(0, ROUNDS)
  );
  const [round, setRound] = useModeState('QuizModeView.round', 0);
  // 自己的答案按座位隔离：对方拿不到，联机时同一台设备也替不了对方答
  const [myPick, setMyPick] = useModeState<{ round: number; value: number } | null>(
    'QuizModeView.myPick',
    null,
    'seat'
  );
  const [revealed, setRevealed] = useModeState<QuizReveal | null>('QuizModeView.revealed', null);
  const [matches, setMatches] = useModeState('QuizModeView.matches', 0);
  // 同屏：两个人轮流在同一台设备作答，暂存已提交的答案
  const [localSealed, setLocalSealed] = useState<[number | null, number | null]>([null, null]);
  const [activeSeat, setActiveSeat] = useState(0);

  const question = queue[round];
  const done = round >= queue.length;
  const roundReveal = revealed && revealed.round === round ? revealed : null;
  const answerSeat = online ? mySeat : activeSeat;
  const activePlayer = players[answerSeat];
  // 只有「本轮」的提交才算已提交：上一题的残留不能带过来。
  // 「下一题」只有点击那台会清自己的答案，对方那台必然残留旧值。
  const iSubmitted = online ? myPick?.round === round : localSealed[activeSeat] !== null;
  const peerSubmitted = online ? false : localSealed[answerSeat === 0 ? 1 : 0] !== null;

  const scoredRef = useRef(-1);

  const pick = (optionIndex: number) => {
    if (roundReveal || iSubmitted) return;
    if (online) {
      setMyPick({ round, value: optionIndex });
      // 答案只交给房主，对方看不到；双方都提交后 reducer 一次性公开
      runtime.dispatch({ type: 'sealSubmit', scope: 'QuizModeView', seat: mySeat, round, value: optionIndex });
      return;
    }
    const next: [number | null, number | null] = [localSealed[0], localSealed[1]];
    next[activeSeat] = optionIndex;
    setLocalSealed(next);
    if (next[0] !== null && next[1] !== null) {
      setRevealed({ round, values: next });
      return;
    }
    // 同屏：答完把设备交给对方
    setActiveSeat(activeSeat === 0 ? 1 : 0);
  };

  // 揭晓后计分（房主做一次，两端看到同一个结果）
  useEffect(() => {
    if (!authority || !roundReveal) return;
    if (scoredRef.current === round) return;
    scoredRef.current = round;
    const [a, b] = roundReveal.values;
    if (a !== null && a === b) setMatches(value => value + 1);
  }, [authority, roundReveal, round, setMatches]);

  const next = () => {
    setRevealed(null);
    setMyPick(null);
    setLocalSealed([null, null]);
    setActiveSeat(0);
    scoredRef.current = -1;
    // 两端都可能点「下一题」，用条件递增保证只推进一步，不会跳题
    setRound(value => (value === round ? value + 1 : value));
  };

  if (done) {
    const rate = matches / ROUNDS;
    const tier = getMatchTier(rate);
    return (
      <div className="rounded-3xl border border-[#FF9F0A]/25 bg-[#FF9F0A]/10 p-6 text-center">
        <div className="text-5xl font-bold text-white">{Math.round(rate * 100)}%</div>
        <div className="mt-2 text-xs font-bold uppercase tracking-[0.2em] text-[#FF9F0A]">默契度</div>
        <div className="mt-4 text-xl font-bold text-white">{tier.label}</div>
        <div className="mt-2 text-sm leading-relaxed text-gray-400">{tier.desc}</div>
        <div className="mt-4 flex justify-center gap-3 text-xs text-gray-500">
          <span>共 {ROUNDS} 题</span>
          <span>·</span>
          <span>一致 {matches} 题</span>
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

  const isMatch = roundReveal
    ? roundReveal.values[0] !== null && roundReveal.values[0] === roundReveal.values[1]
    : false;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold text-gray-400">
          第 {round + 1} / {ROUNDS} 题
        </div>
        <div className="rounded-full bg-[#FF9F0A]/15 px-3 py-1 text-[10px] font-bold text-[#FF9F0A]">
          {question?.category}
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
        <div className="text-lg font-bold leading-relaxed text-white">{question?.text}</div>
      </div>

      {roundReveal ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            {[male, female].map((player, seat) => {
              const value = roundReveal.values[seat];
              return (
                <div
                  key={player?.id ?? seat}
                  className={`rounded-3xl border p-4 text-center ${
                    isMatch
                      ? seat === 0
                        ? 'border-[#0A84FF] bg-[#0A84FF]/15'
                        : 'border-[#FF375F] bg-[#FF375F]/15'
                      : 'border-white/10 bg-white/[0.04]'
                  }`}
                >
                  <div className={`flex items-center justify-center gap-1 text-xs font-bold ${seat === 0 ? 'text-[#64B5FF]' : 'text-[#FF7A96]'}`}>
                    {seat === 0 ? <User size={13} /> : <UserRound size={13} />}
                    {player?.name || (seat === 0 ? '男方' : '女方')}
                  </div>
                  <div className="mt-2 text-sm font-bold leading-tight text-white">
                    {value !== null && question ? question.options[value] : '未作答'}
                  </div>
                </div>
              );
            })}
          </div>

          <div
            className={`flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold ${
              isMatch ? 'bg-[#30D158]/15 text-[#30D158]' : 'bg-white/5 text-gray-400'
            }`}
          >
            {isMatch ? <><Check size={16} />答案一致，默契 +1</> : <><X size={16} />答案不同，继续磨合</>}
          </div>

          <button
            type="button"
            onClick={next}
            className="ios-btn flex h-14 w-full items-center justify-center rounded-full bg-white text-base font-bold text-black shadow-lg"
          >
            {round + 1 >= queue.length ? '查看默契度' : '下一题'}
          </button>
        </>
      ) : (
        <>
          <div className={`flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold ${iSubmitted ? 'bg-white/[0.02] text-gray-500' : 'bg-white/5 text-white'}`}>
            {online ? (
              <>
                {iSubmitted ? '已提交，等对方作答…' : '你的答案（对方看不到）'}
              </>
            ) : (
              <>
                {answerSeat === 0 ? <User size={15} className="text-[#0A84FF]" /> : <UserRound size={15} className="text-[#FF375F]" />}
                请 {activePlayer?.name || '当前玩家'} 作答（对方请回避）
              </>
            )}
          </div>

          {iSubmitted && online ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center text-[11px] text-gray-500">
              已锁定你的选择，双方都提交后同时揭晓
            </div>
          ) : (
            <div className="space-y-2">
              {question?.options.map((option, index) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => pick(index)}
                  className="ios-btn flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left text-sm font-semibold text-white transition-colors active:bg-white/10"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-gray-400">
                    {String.fromCharCode(65 + index)}
                  </span>
                  {option}
                </button>
              ))}
            </div>
          )}

          {!online && peerSubmitted && (
            <div className="text-center text-[10px] font-bold text-[#30D158]">对方已作答，等你选</div>
          )}
          {online && (
            <div className="flex items-center justify-center gap-1 text-[10px] text-gray-600">
              双方都作答后才会同时公开答案
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function QuizModeView({ players, onBack }: QuizModeViewProps) {
  const [runId, setRunId] = useModeState('QuizModeView.runId', 0);

  return (
    <div className="mobile-game-screen fixed inset-x-0 top-0 bottom-0 z-50 flex flex-col bg-black">
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#1f1a2b] via-black to-[#0d1724] opacity-90" />

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
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#FF9F0A]">Couple Quiz</div>
            <div className="mt-1 text-sm font-bold text-white">默契问答 · 共 {ROUNDS} 题</div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center text-gray-500">
            <MessageCircleQuestion size={22} />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 no-scrollbar">
          <QuizGame key={runId} players={players} onExit={onBack} />

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
