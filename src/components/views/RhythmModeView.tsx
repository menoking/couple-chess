import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Music, RefreshCw, User, UserRound } from 'lucide-react';
import { Player, Theme } from '../../types';
import { pickRandom } from '../../utils/modeKit';

interface RhythmModeViewProps {
  players: Player[];
  themes?: Theme[];
  onBack: () => void;
}

const BEAT_MS = 600;
const BEATS_PER_ROUND = 8;
const PERFECT_WINDOW = 120;
const GOOD_WINDOW = 250;
const PENALTY_MISS_THRESHOLD = 3;

const BEAT_PROMPTS = ['亲一下', '抱一下', '说句情话', '摸头', '击个掌', '贴贴脸', '比个心', '眨左眼', '牵牵手', '蹭一下'];

const PENALTIES = [
  '对方在你脸上“随便画一笔”（想象中也行）',
  '原地做 5 个深蹲，边做边说理由',
  '用最夸张的姿势保持 10 秒',
  '模仿对方的一个习惯动作',
  '对方指定你下一个动作，必须照做',
  '大声说三遍“我最可爱”',
  '下一轮全程闭眼听节拍'
];

type Phase = 'ready' | 'running' | 'summary' | 'finished';
type BeatResult = 'perfect' | 'good' | 'miss';

interface PlayerScore {
  points: number;
  hits: number;
  misses: number;
}

function RhythmGame({ players, onExit }: { players: Player[]; onExit: () => void }) {
  const [phase, setPhase] = useState<Phase>('ready');
  const [roundPlayerId, setRoundPlayerId] = useState(0);
  const [beat, setBeat] = useState(0);
  const [beatTick, setBeatTick] = useState(0);
  const [prompt, setPrompt] = useState(BEAT_PROMPTS[0]);
  const [results, setResults] = useState<BeatResult[]>([]);
  const [scores, setScores] = useState<Record<number, PlayerScore>>({
    0: { points: 0, hits: 0, misses: 0 },
    1: { points: 0, hits: 0, misses: 0 }
  });
  const [penalty, setPenalty] = useState<string | null>(null);

  const beatRef = useRef(0);
  const resultsRef = useRef<BeatResult[]>([]);
  const lastBeatRef = useRef(0);
  const tappedRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const roundPlayer = players.find(p => p.id === roundPlayerId) || players[0];

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => () => clearTimer(), []);

  const recordResult = (result: BeatResult) => {
    const nextResults = [...resultsRef.current, result];
    resultsRef.current = nextResults;
    setResults(nextResults);
    if (nextResults.length >= BEATS_PER_ROUND) {
      finishRound(nextResults);
    }
  };

  const finishRound = (finalResults: BeatResult[]) => {
    clearTimer();
    const hits = finalResults.filter(r => r === 'perfect' || r === 'good').length;
    const misses = finalResults.filter(r => r === 'miss').length;
    const points = finalResults.reduce((sum, r) => sum + (r === 'perfect' ? 2 : r === 'good' ? 1 : 0), 0);

    setScores(prev => ({
      ...prev,
      [roundPlayerId]: {
        points: (prev[roundPlayerId]?.points ?? 0) + points,
        hits: (prev[roundPlayerId]?.hits ?? 0) + hits,
        misses: (prev[roundPlayerId]?.misses ?? 0) + misses
      }
    }));
    setPenalty(misses >= PENALTY_MISS_THRESHOLD ? pickRandom(PENALTIES) : null);
    setPhase('summary');
  };

  const advanceBeat = () => {
    beatRef.current += 1;
    if (beatRef.current >= BEATS_PER_ROUND) return;
    tappedRef.current = false;
    lastBeatRef.current = Date.now();
    setBeat(beatRef.current);
    setPrompt(pickRandom(BEAT_PROMPTS) ?? BEAT_PROMPTS[0]);
    setBeatTick(value => value + 1);
  };

  const startRound = () => {
    clearTimer();
    beatRef.current = 0;
    resultsRef.current = [];
    setPhase('running');
    setBeat(0);
    setResults([]);
    setPenalty(null);
    tappedRef.current = false;
    lastBeatRef.current = Date.now();
    setPrompt(pickRandom(BEAT_PROMPTS) ?? BEAT_PROMPTS[0]);
    setBeatTick(value => value + 1);
    timerRef.current = window.setInterval(() => {
      if (!tappedRef.current) recordResult('miss');
      advanceBeat();
    }, BEAT_MS);
  };

  const tap = () => {
    if (phase !== 'running' || tappedRef.current) return;
    tappedRef.current = true;
    const raw = Date.now() - lastBeatRef.current;
    const offset = Math.min(raw, BEAT_MS - raw);
    const result: BeatResult = offset <= PERFECT_WINDOW ? 'perfect' : offset <= GOOD_WINDOW ? 'good' : 'miss';
    recordResult(result);
  };

  const nextRound = () => {
    if (roundPlayerId === players[0]?.id) {
      const otherId = players.find(p => p.id !== roundPlayerId)?.id ?? roundPlayerId;
      setRoundPlayerId(otherId);
      setPhase('ready');
      return;
    }
    setPhase('finished');
  };

  if (phase === 'finished') {
    const [first, second] = players;
    const a = scores[first?.id ?? 0] ?? { points: 0, hits: 0, misses: 0 };
    const b = scores[second?.id ?? 0] ?? { points: 0, hits: 0, misses: 0 };
    const winner = a.points === b.points ? null : a.points > b.points ? first : second;
    return (
      <div className="space-y-4">
        <div className="rounded-3xl border border-[#BF5AF2]/25 bg-[#BF5AF2]/10 p-6 text-center">
          <Music size={36} className="mx-auto text-[#BF5AF2]" />
          <div className="mt-3 text-xl font-bold text-white">
            {winner ? `${winner.name} 节奏感更胜一筹！` : '势均力敌，平局！'}
          </div>
          <div className="mt-4 space-y-2">
            {players.map(player => {
              const score = scores[player.id] ?? { points: 0, hits: 0, misses: 0 };
              return (
                <div key={player.id} className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                  <span className="text-sm font-bold" style={{ color: player.color }}>{player.name}</span>
                  <span className="text-xs text-gray-400">
                    命中 {score.hits}/16 · 得分 <span className="font-bold text-white">{score.points}</span>
                  </span>
                </div>
              );
            })}
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

  if (phase === 'summary') {
    const score = scores[roundPlayerId] ?? { points: 0, hits: 0, misses: 0 };
    return (
      <div className="space-y-4">
        <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-6 text-center">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500">{roundPlayer?.name} 的回合结算</div>
          <div className="mt-3 text-4xl font-bold text-white">{score.points}</div>
          <div className="mt-1 text-[11px] text-gray-500">本回合得分（完美 +2 · 不错 +1）</div>
          <div className="mt-3 flex justify-center gap-2">
            {results.map((result, index) => (
              <span
                key={index}
                className={`h-2.5 w-2.5 rounded-full ${
                  result === 'perfect' ? 'bg-[#30D158]' : result === 'good' ? 'bg-[#FFD60A]' : 'bg-[#FF453A]'
                }`}
              />
            ))}
          </div>
        </div>

        {penalty && (
          <div className="rounded-3xl border border-[#FF453A]/25 bg-[#FF453A]/10 p-5">
            <div className="text-xs font-bold text-[#FF453A]">失误 {PENALTY_MISS_THRESHOLD} 次以上 · 惩罚任务</div>
            <div className="mt-2 text-sm leading-relaxed text-white">{penalty}</div>
          </div>
        )}

        <button
          type="button"
          onClick={nextRound}
          className="ios-btn h-14 w-full rounded-full bg-white text-base font-bold text-black shadow-lg"
        >
          {roundPlayerId === players[0]?.id ? '交给下一位' : '查看总结算'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-center gap-2 rounded-2xl bg-white/5 py-3 text-sm font-bold text-white">
        {roundPlayer?.id === 0 ? <User size={15} className="text-[#0A84FF]" /> : <UserRound size={15} className="text-[#FF375F]" />}
        {roundPlayer?.name || '当前玩家'} 的回合
      </div>

      <div className="flex flex-col items-center">
        <div className="relative flex h-52 w-52 items-center justify-center">
          {phase === 'running' && (
            <div key={beatTick} className="beat-pulse-ring absolute inset-0 rounded-full border-4 border-[#BF5AF2]/60" />
          )}
          <div className="absolute inset-6 rounded-full border border-white/10 bg-[#1C1C1E]" />
          <button
            type="button"
            onClick={tap}
            disabled={phase !== 'running'}
            className="ios-btn relative z-10 flex h-32 w-32 flex-col items-center justify-center gap-1 rounded-full bg-gradient-to-br from-[#BF5AF2] to-[#FF375F] shadow-xl disabled:opacity-60"
          >
            <span className="text-3xl font-bold text-white">{beat + 1}</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/80">/ {BEATS_PER_ROUND} 拍</span>
          </button>
        </div>

        <div className="mt-5 text-center">
          <div className="text-[11px] uppercase tracking-[0.2em] text-gray-500">当前节拍动作</div>
          <div className="mt-1 text-2xl font-bold text-white">{phase === 'running' ? prompt : '准备'}</div>
        </div>

        <div className="mt-4 flex gap-1.5">
          {Array.from({ length: BEATS_PER_ROUND }).map((_, index) => {
            const result = results[index];
            return (
              <span
                key={index}
                className={`h-2 w-2 rounded-full transition-colors ${
                  result === 'perfect'
                    ? 'bg-[#30D158]'
                    : result === 'good'
                      ? 'bg-[#FFD60A]'
                      : result === 'miss'
                        ? 'bg-[#FF453A]'
                        : 'bg-white/15'
                }`}
              />
            );
          })}
        </div>
      </div>

      {phase === 'ready' ? (
        <button
          type="button"
          onClick={startRound}
          className="ios-btn h-14 w-full rounded-full bg-white text-base font-bold text-black shadow-lg"
        >
          开始 {roundPlayer?.name} 的节拍回合
        </button>
      ) : (
        <p className="text-center text-[11px] text-gray-500">
          跟着脉冲节奏，在每一拍亮起时点击中央按钮完成动作
        </p>
      )}
    </div>
  );
}

export function RhythmModeView({ players, onBack }: RhythmModeViewProps) {
  const [runId, setRunId] = useState(0);

  return (
    <div className="mobile-game-screen fixed inset-x-0 top-0 bottom-0 z-50 flex flex-col bg-black">
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#1d1430] via-black to-[#0d1724] opacity-90" />

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
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#BF5AF2]">Rhythm</div>
            <div className="mt-1 text-sm font-bold text-white">节奏挑战 · 每人 8 拍</div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center text-gray-500">
            <Music size={22} />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 no-scrollbar">
          <RhythmGame key={runId} players={players} onExit={onBack} />

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
