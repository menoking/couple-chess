import { useModeState } from '../../rules/ModeRuntime';
import { useEffect } from 'react';
import { ArrowLeft, Check, RefreshCw, Timer, X } from 'lucide-react';
import { Player, Theme } from '../../types';
import { ThemeTaskEntry, buildTaskPool, shuffle } from '../../utils/modeKit';
import { themeIntensity } from '../../utils/modeKit';

interface TimedModeViewProps {
  players: Player[];
  themes: Theme[];
  onBack: () => void;
}

const TOTAL_SECONDS = 120;

function getScoreTier(score: number): { label: string; desc: string } {
  if (score >= 30) return { label: '火力全开', desc: '这个效率，计时器都追不上你们' };
  if (score >= 20) return { label: '状态在线', desc: '节奏把握得不错，奖励一顿大餐' };
  if (score >= 10) return { label: '渐入佳境', desc: '有几个任务确实需要酝酿一下' };
  return { label: '佛系参与', desc: '舒服最重要，分数随意' };
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function TimedGame({ players, themes, onExit }: { players: Player[]; themes: Theme[]; onExit: () => void }) {
  // 题库进共享状态，避免两端各自洗牌导致同一题号看到不同任务
  const [queue] = useModeState<ThemeTaskEntry[]>('TimedModeView.queue', () =>
    shuffle(buildTaskPool(players, themes) ?? [])
  );
  const [timeLeft, setTimeLeft] = useModeState('TimedModeView.timeLeft', TOTAL_SECONDS);
  const [index, setIndex] = useModeState('TimedModeView.index', 0);
  const [score, setScore] = useModeState('TimedModeView.score', 0);
  const [done, setDone] = useModeState('TimedModeView.done', 0);
  const [skipped, setSkipped] = useModeState('TimedModeView.skipped', 0);
  const [over, setOver] = useModeState('TimedModeView.over', false);

  useEffect(() => {
    if (over) return;
    const timer = window.setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          window.clearInterval(timer);
          setOver(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [over]);

  const current = queue[index];
  const exhausted = index >= queue.length;

  // 任务全部完成时也视为结束，停止倒计时
  useEffect(() => {
    if (exhausted) setOver(true);
  }, [exhausted]);

  const complete = () => {
    if (!current) return;
    const theme = themes.find(t => t.id === current.themeId);
    setScore(prev => prev + themeIntensity(theme));
    setDone(prev => prev + 1);
    setIndex(prev => prev + 1);
  };

  const skip = () => {
    setSkipped(prev => prev + 1);
    setIndex(prev => prev + 1);
  };

  if (over || exhausted) {
    const tier = getScoreTier(score);
    return (
      <div className="space-y-4">
        <div className="rounded-3xl border border-[#FF9F0A]/25 bg-[#FF9F0A]/10 p-6 text-center">
          <Timer size={36} className="mx-auto text-[#FF9F0A]" />
          <div className="mt-3 text-5xl font-bold text-white">{score}</div>
          <div className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-[#FF9F0A]">总积分</div>
          <div className="mt-4 text-xl font-bold text-white">{tier.label}</div>
          <div className="mt-2 text-sm text-gray-400">{tier.desc}</div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-white/5 bg-white/[0.04] p-3 text-center">
            <div className="text-[10px] text-gray-500">完成</div>
            <div className="mt-1 text-lg font-bold text-[#30D158]">{done}</div>
          </div>
          <div className="rounded-2xl border border-white/5 bg-white/[0.04] p-3 text-center">
            <div className="text-[10px] text-gray-500">跳过</div>
            <div className="mt-1 text-lg font-bold text-gray-400">{skipped}</div>
          </div>
          <div className="rounded-2xl border border-white/5 bg-white/[0.04] p-3 text-center">
            <div className="text-[10px] text-gray-500">剩余时间</div>
            <div className="mt-1 text-lg font-bold text-white">{formatTime(timeLeft)}</div>
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

  const theme = current ? themes.find(t => t.id === current.themeId) : undefined;
  const level = themeIntensity(theme);
  const urgent = timeLeft <= 10;

  return (
    <div className="space-y-4">
      <div className={`rounded-3xl border p-5 text-center transition-colors ${urgent ? 'border-[#FF453A]/40 bg-[#FF453A]/10' : 'border-white/10 bg-white/[0.04]'}`}>
        <div className={`text-5xl font-bold tabular-nums ${urgent ? 'text-[#FF453A]' : 'text-white'}`}>{formatTime(timeLeft)}</div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${urgent ? 'bg-[#FF453A]' : 'bg-[#FF9F0A]'}`}
            style={{ width: `${(timeLeft / TOTAL_SECONDS) * 100}%` }}
          />
        </div>
        <div className="mt-2 text-[11px] text-gray-500">题库共 {queue.length} 个任务 · 已完成 {done} 个</div>
      </div>

      {current && (
        <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-[#D08BFF]">
              <Timer size={14} />{current.themeName}
            </div>
            <div className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-gray-400">
              难度 {'★'.repeat(level)}{'☆'.repeat(5 - level)}
            </div>
          </div>
          <div className="mt-3 text-lg font-bold leading-relaxed text-white">{current.task.text}</div>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={skip}
          className="ios-btn flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-[#3A3A3C] text-base font-bold text-[#FF453A]"
        >
          <X size={18} />跳过
        </button>
        <button
          type="button"
          onClick={complete}
          className="ios-btn flex h-14 flex-[2] items-center justify-center gap-2 rounded-full bg-white text-base font-bold text-black shadow-lg"
        >
          <Check size={18} />完成 +{level} 分
        </button>
      </div>
    </div>
  );
}

export function TimedModeView({ players, themes, onBack }: TimedModeViewProps) {
  const [runId, setRunId] = useModeState('TimedModeView.runId', 0);

  return (
    <div className="mobile-game-screen fixed inset-x-0 top-0 bottom-0 z-50 flex flex-col bg-black">
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#2b1a12] via-black to-[#0d1724] opacity-90" />

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
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#FF9F0A]">Time Attack</div>
            <div className="mt-1 text-sm font-bold text-white">限时挑战 · 2 分钟</div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center text-gray-500">
            <Timer size={22} />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 no-scrollbar">
          <TimedGame key={runId} players={players} themes={themes} onExit={onBack} />

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
