import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, Disc3, RotateCw, Sparkles, User, UserRound } from 'lucide-react';
import { Player, TaskCard, Theme } from '../../types';

interface RouletteModeViewProps {
  players: Player[];
  themes: Theme[];
  currentTurn: number;
  onEndTurn: () => void;
  onBack: () => void;
}

const executors = ['男方', '女方', '双方'];
const actions = ['拥抱', '亲吻', '抚摸', '耳语', '轻咬', '角色扮演'];
const targets = ['额头', '耳朵', '颈侧', '肩背', '手臂', '腿部'];
const durations = ['15 秒', '30 秒', '45 秒', '1 分钟', '2 分钟'];

function pick<T>(items: T[], previous: T | null) {
  if (items.length < 2) return items[0];
  let next = items[Math.floor(Math.random() * items.length)];
  while (next === previous) next = items[Math.floor(Math.random() * items.length)];
  return next;
}

function WheelCard({
  title,
  value,
  options,
  color,
  spinning
}: {
  title: string;
  value: string | null;
  options: string[];
  color: string;
  spinning: boolean;
}) {
  const rotation = spinning ? 360 + Math.floor(Math.random() * 360) : 0;

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color }}>
        {title}
      </div>
      <div
        className="relative flex h-[96px] w-[96px] items-center justify-center rounded-full border-4 bg-[#1C1C1E] shadow-lg transition-transform duration-[1200ms] ease-out"
        style={{ borderColor: `${color}66`, transform: `rotate(${rotation}deg)` }}
      >
        <div
          className="absolute inset-2 rounded-full opacity-50"
          style={{
            background: `conic-gradient(from 0deg, ${color}22, transparent 25%, ${color}22 50%, transparent 75%, ${color}22)`,
            transform: 'rotate(-18deg)'
          }}
        />
        <div className="relative z-10 max-w-[68px] text-center text-[12px] font-bold leading-tight text-white">
          {value || '准备'}
        </div>
      </div>
      <div className="max-w-[104px] text-center text-[10px] leading-tight text-gray-500">
        {options.join(' · ')}
      </div>
    </div>
  );
}

export function RouletteModeView({
  players,
  themes,
  currentTurn,
  onEndTurn,
  onBack
}: RouletteModeViewProps) {
  const activePlayer = players[currentTurn] || players[0];
  const [isSpinning, setIsSpinning] = useState(false);
  const [result, setResult] = useState({ executor: '', action: '', target: '', duration: '' });
  const [bonusTask, setBonusTask] = useState<TaskCard | null>(null);
  const [round, setRound] = useState(0);
  const timerRef = useRef<number | null>(null);
  const selectedTheme = themes.find(theme => theme.id === activePlayer?.themeId);
  const hasResult = !!result.executor;

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  const resultText = useMemo(() => {
    if (!hasResult) return '';
    const subject = result.executor === '双方' ? '双方' : result.executor;
    return `${subject}${result.action}${result.target}，持续${result.duration}`;
  }, [hasResult, result]);

  const spin = () => {
    if (isSpinning) return;
    const next = {
      executor: pick(executors, result.executor || null),
      action: pick(actions, result.action || null),
      target: pick(targets, result.target || null),
      duration: pick(durations, result.duration || null)
    };
    setIsSpinning(true);
    setBonusTask(null);
    if (navigator.vibrate) navigator.vibrate([15, 30, 15]);
    timerRef.current = window.setTimeout(() => {
      setResult(next);
      setRound(value => value + 1);
      const tasks = selectedTheme?.tasks || [];
      setBonusTask(tasks.length > 0 ? tasks[Math.floor(Math.random() * tasks.length)] : null);
      setIsSpinning(false);
    }, 1250);
  };

  return (
    <div className="mobile-game-screen fixed inset-x-0 top-0 bottom-0 z-50 flex flex-col bg-black">
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#24131f] via-black to-[#0d1724] opacity-90" />
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
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#FF9F0A]">Couple Roulette</div>
            <div className="mt-1 flex items-center justify-center gap-2 text-sm font-bold text-white">
              {currentTurn === 0 ? <User size={15} className="text-[#0A84FF]" /> : <UserRound size={15} className="text-[#FF375F]" />}
              {activePlayer?.name || '当前回合'} 的转盘
            </div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center text-gray-500">
            <Disc3 size={22} />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 no-scrollbar">
          <div className="mb-5 rounded-3xl border border-[#FF9F0A]/20 bg-[#1C1C1E]/80 p-5 shadow-2xl shadow-orange-950/20">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <div className="text-lg font-bold text-white">转出一项亲密任务</div>
                <div className="mt-1 text-xs text-gray-500">每轮组合执行者、动作、部位和时长</div>
              </div>
              <div className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold text-gray-400">第 {round + 1} 轮</div>
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-5">
              <WheelCard title="谁来做" value={result.executor || null} options={executors} color="#64B5FF" spinning={isSpinning} />
              <WheelCard title="做什么" value={result.action || null} options={actions} color="#FF7A96" spinning={isSpinning} />
              <WheelCard title="哪里" value={result.target || null} options={targets} color="#D08BFF" spinning={isSpinning} />
              <WheelCard title="多久" value={result.duration || null} options={durations} color="#FFB340" spinning={isSpinning} />
            </div>

            <button
              type="button"
              disabled={isSpinning}
              onClick={spin}
              className="ios-btn mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#FF9F0A] to-[#FF375F] text-base font-bold text-white shadow-lg shadow-orange-950/30 disabled:opacity-50"
            >
              <RotateCw size={20} className={isSpinning ? 'animate-spin' : ''} />
              {isSpinning ? '转盘进行中…' : hasResult ? '再转一次' : '开始转盘'}
            </button>
          </div>

          {hasResult && (
            <div className="space-y-3">
              <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5 text-center">
                <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#FF9F0A]">本轮结果</div>
                <div className="mt-3 text-xl font-bold leading-relaxed text-white">{resultText}</div>
              </div>
              {bonusTask && (
                <div className="rounded-3xl border border-[#BF5AF2]/25 bg-[#BF5AF2]/10 p-5">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#D08BFF]"><Sparkles size={15} />主题加码 · {selectedTheme?.name}</div>
                  <div className="mt-3 text-sm leading-relaxed text-white">{bonusTask.text}</div>
                </div>
              )}
            </div>
          )}
        </main>

        <div className="shrink-0 bg-gradient-to-t from-black via-black/95 to-transparent px-5 pb-4 pt-3">
          <button
            type="button"
            disabled={!hasResult || isSpinning}
            onClick={() => {
              setResult({ executor: '', action: '', target: '', duration: '' });
              setBonusTask(null);
              onEndTurn();
            }}
            className="ios-btn flex h-14 w-full items-center justify-center gap-2 rounded-full bg-white text-lg font-semibold text-black shadow-lg disabled:opacity-40"
          >
            <CheckCircle2 size={20} /> 完成并交给下一位
          </button>
        </div>
      </div>
    </div>
  );
}

