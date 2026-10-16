import { useState } from 'react';
import { ArrowLeft, Check, MessageCircleQuestion, RefreshCw, User, UserRound, X } from 'lucide-react';
import { Player, Theme } from '../../types';
import { QUIZ_QUESTIONS, QuizQuestion } from '../../data/quizQuestions';
import { shuffle } from '../../utils/modeKit';

interface QuizModeViewProps {
  players: Player[];
  themes?: Theme[];
  onBack: () => void;
}

const ROUNDS = 8;

type Phase = 'male' | 'female' | 'reveal';

function getMatchTier(rate: number): { label: string; desc: string } {
  if (rate >= 1) return { label: '心有灵犀', desc: '全部一致！你们怕不是同一个脑袋两个人' };
  if (rate >= 0.75) return { label: '默契十足', desc: '大部分想法不谋而合，很难得' };
  if (rate >= 0.5) return { label: '渐入佳境', desc: '一半一致，剩下的一半继续磨合' };
  if (rate >= 0.25) return { label: '各怀心思', desc: '默契度告急，建议加练几轮' };
  return { label: '火星撞地球', desc: '几乎没有共识……或者在故意唱反调' };
}

function QuizGame({ players, onExit }: { players: Player[]; onExit: () => void }) {
  const male = players[0];
  const female = players[1];
  const [queue] = useState<QuizQuestion[]>(() => shuffle(QUIZ_QUESTIONS).slice(0, ROUNDS));
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<Phase>('male');
  const [malePick, setMalePick] = useState<number | null>(null);
  const [femalePick, setFemalePick] = useState<number | null>(null);
  const [matches, setMatches] = useState(0);
  const [done, setDone] = useState(false);

  const question = queue[round];
  const isMatch = phase === 'reveal' && malePick !== null && femalePick !== null && malePick === femalePick;

  const pick = (optionIndex: number) => {
    if (phase === 'male') {
      setMalePick(optionIndex);
      setPhase('female');
      return;
    }
    if (phase === 'female') {
      setFemalePick(optionIndex);
      if (optionIndex === malePick) setMatches(value => value + 1);
      setPhase('reveal');
    }
  };

  const next = () => {
    if (round + 1 >= queue.length) {
      setDone(true);
      return;
    }
    setRound(value => value + 1);
    setPhase('male');
    setMalePick(null);
    setFemalePick(null);
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

  const activePlayer = phase === 'female' ? female : male;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold text-gray-400">
          第 {round + 1} / {ROUNDS} 题
        </div>
        <div className="rounded-full bg-[#FF9F0A]/15 px-3 py-1 text-[10px] font-bold text-[#FF9F0A]">
          {question.category}
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
        <div className="text-lg font-bold leading-relaxed text-white">{question.text}</div>
      </div>

      {phase === 'reveal' ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div
              className={`rounded-3xl border p-4 text-center ${
                isMatch ? 'border-[#0A84FF] bg-[#0A84FF]/15' : 'border-white/10 bg-white/[0.04]'
              }`}
            >
              <div className="flex items-center justify-center gap-1 text-xs font-bold text-[#64B5FF]">
                <User size={13} />{male?.name || '男方'}
              </div>
              <div className="mt-2 text-sm font-bold leading-tight text-white">
                {malePick !== null ? question.options[malePick] : '未作答'}
              </div>
            </div>
            <div
              className={`rounded-3xl border p-4 text-center ${
                isMatch ? 'border-[#FF375F] bg-[#FF375F]/15' : 'border-white/10 bg-white/[0.04]'
              }`}
            >
              <div className="flex items-center justify-center gap-1 text-xs font-bold text-[#FF7A96]">
                <UserRound size={13} />{female?.name || '女方'}
              </div>
              <div className="mt-2 text-sm font-bold leading-tight text-white">
                {femalePick !== null ? question.options[femalePick] : '未作答'}
              </div>
            </div>
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
          <div className="flex items-center justify-center gap-2 rounded-2xl bg-white/5 py-3 text-sm font-bold text-white">
            {phase === 'male' ? <User size={15} className="text-[#0A84FF]" /> : <UserRound size={15} className="text-[#FF375F]" />}
            请 {activePlayer?.name || '当前玩家'} 作答（对方请回避）
          </div>

          <div className="space-y-2">
            {question.options.map((option, index) => (
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
        </>
      )}
    </div>
  );
}

export function QuizModeView({ players, onBack }: QuizModeViewProps) {
  const [runId, setRunId] = useState(0);

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
