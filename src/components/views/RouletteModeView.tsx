import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, Disc3, RotateCw, ShieldAlert, Sparkles, User, UserRound } from 'lucide-react';
import { Player, TaskCard, Theme } from '../../types';
import { loadFromStorage, saveToStorage } from '../../utils/localStorage';

interface RouletteModeViewProps {
  players: Player[];
  themes: Theme[];
  currentTurn: number;
  onEndTurn: () => void;
  onBack: () => void;
}

interface OptionGroup {
  label?: string;
  items: string[];
}

const executors: OptionGroup[] = [{ items: ['男方', '女方', '双方'] }];

const actions: OptionGroup[] = [
  { items: ['拥抱', '亲吻', '抚摸', '耳语', '轻咬', '吹气', '揉捏', '按摩', '舔舐', '吮吸', '挑逗', '角色扮演'] }
];

const targetGroups: OptionGroup[] = [
  {
    label: '轻柔区',
    items: ['额头', '眼睛', '脸颊', '耳朵', '耳垂', '鼻尖', '颈侧', '后颈', '锁骨', '肩背', '手臂', '手掌', '手指']
  },
  {
    label: '亲密区',
    items: ['胸口', '胸部', '腹部', '腰侧', '背部', '膝盖', '小腿', '脚踝', '脚底', '腿根']
  },
  {
    label: '私密区',
    items: ['臀部', '大腿内侧', '私密部位']
  }
];

const durations: OptionGroup[] = [{ items: ['15 秒', '30 秒', '45 秒', '90 秒', '1 分钟', '2 分钟', '3 分钟'] }];

const SPIN_DURATION = 1250;
const TICK_INTERVAL = 90;

function flatten(groups: OptionGroup[]): string[] {
  return groups.flatMap(group => group.items);
}

function pick<T>(items: T[], previous: T | null) {
  if (items.length < 2) return items[0];
  let next = items[Math.floor(Math.random() * items.length)];
  while (next === previous) next = items[Math.floor(Math.random() * items.length)];
  return next;
}

function findGroupLabel(groups: OptionGroup[], value: string): string | null {
  for (const group of groups) {
    if (group.items.includes(value)) return group.label ?? null;
  }
  return null;
}

type RouletteIntensity = 'gentle' | 'wild';

const INTENSITY_STORAGE_KEY = 'couples-ludo-roulette-intensity';
const WILD_PRIVATE_RATE = 0.3;

const allTargets = flatten(targetGroups);
const nonPrivateTargets = flatten([targetGroups[0], targetGroups[1]]);
const privateTargets = flatten([targetGroups[2]]);

function pickTarget(previous: string | null, isWild: boolean): string {
  if (isWild && Math.random() < WILD_PRIVATE_RATE) {
    return pick(privateTargets, previous && privateTargets.includes(previous) ? previous : null);
  }
  const pool = isWild ? nonPrivateTargets : allTargets;
  return pick(pool, pool.includes(previous ?? '') ? previous : null);
}

function WheelCard({
  title,
  value,
  groups,
  color,
  spinning,
  spinToken,
  tick,
  highlightLabel
}: {
  title: string;
  value: string | null;
  groups: OptionGroup[];
  color: string;
  spinning: boolean;
  spinToken: number;
  tick: number;
  highlightLabel?: string;
}) {
  const flatItems = useMemo(() => flatten(groups), [groups]);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (spinToken === 0) return;
    setRotation(prev => prev + 720 + Math.floor(Math.random() * 360));
  }, [spinToken]);

  const display = spinning ? flatItems[tick % flatItems.length] : value;

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color }}>
        {title}
      </div>
      <div className="relative h-[96px] w-[96px]">
        <div
          className="absolute inset-0 rounded-full border-4 border-[#1C1C1E] bg-[#1C1C1E] shadow-lg transition-transform duration-[1200ms] ease-out"
          style={{ borderColor: `${color}66`, transform: `rotate(${rotation}deg)` }}
        >
          <div
            className="absolute inset-2 rounded-full opacity-50"
            style={{
              background: `conic-gradient(from 0deg, ${color}22, transparent 25%, ${color}22 50%, transparent 75%, ${color}22)`
            }}
          />
        </div>
        <div className="absolute inset-[13px] flex items-center justify-center rounded-full bg-[#1C1C1E]">
          <div className="max-w-[68px] text-center text-[12px] font-bold leading-tight text-white">
            {display || '准备'}
          </div>
        </div>
      </div>
      <div className="w-full max-w-[150px] space-y-1">
        {groups.map((group, groupIndex) => (
          <div key={group.label ?? groupIndex} className="text-center">
            {group.label && (
              <div
                className="text-[9px] font-bold"
                style={{ color: group.label === highlightLabel ? '#FF375F' : color }}
              >
                {group.label}
              </div>
            )}
            <div className="text-[10px] leading-tight text-gray-500">{group.items.join(' · ')}</div>
          </div>
        ))}
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
  const [spinToken, setSpinToken] = useState(0);
  const [tick, setTick] = useState(0);
  const [intensity, setIntensity] = useState<RouletteIntensity>(() =>
    loadFromStorage<RouletteIntensity>(INTENSITY_STORAGE_KEY, 'gentle')
  );
  const isWild = intensity === 'wild';
  const timerRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);
  const selectedTheme = themes.find(theme => theme.id === activePlayer?.themeId);
  const hasResult = !!result.executor;
  const targetTier = useMemo(
    () => (result.target ? findGroupLabel(targetGroups, result.target) : null),
    [result.target]
  );

  useEffect(() => {
    saveToStorage(INTENSITY_STORAGE_KEY, intensity);
  }, [intensity]);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    if (tickRef.current !== null) window.clearInterval(tickRef.current);
  }, []);

  const resultText = useMemo(() => {
    if (!hasResult) return '';
    return `${result.executor}${result.action}${result.target}，持续${result.duration}`;
  }, [hasResult, result]);

  const spin = () => {
    if (isSpinning) return;
    const next = {
      executor: pick(flatten(executors), result.executor || null),
      action: pick(flatten(actions), result.action || null),
      target: pickTarget(result.target || null, isWild),
      duration: pick(flatten(durations), result.duration || null)
    };
    setIsSpinning(true);
    setBonusTask(null);
    setSpinToken(value => value + 1);
    setTick(0);
    if (navigator.vibrate) navigator.vibrate([15, 30, 15]);
    tickRef.current = window.setInterval(() => setTick(value => value + 1), TICK_INTERVAL);
    timerRef.current = window.setTimeout(() => {
      setResult(next);
      setRound(value => value + 1);
      const tasks = selectedTheme?.tasks || [];
      setBonusTask(tasks.length > 0 ? tasks[Math.floor(Math.random() * tasks.length)] : null);
      setIsSpinning(false);
      if (tickRef.current !== null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
    }, SPIN_DURATION);
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
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-lg font-bold text-white">转出一项亲密任务</div>
                <div className="mt-1 text-xs text-gray-500">随机组合执行者、动作、部位与时长</div>
              </div>
              <div className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold text-gray-400">第 {round + 1} 轮</div>
            </div>

            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-bold text-white">尺度档位</div>
                <div className="mt-0.5 text-[10px] leading-tight text-gray-500">
                  {isWild ? '私密区概率提升至 30%' : '各区域按正常概率出现'}
                </div>
              </div>
              <div className="flex shrink-0 rounded-full border border-white/10 bg-white/5 p-0.5">
                <button
                  type="button"
                  onClick={() => setIntensity('gentle')}
                  className={`ios-btn rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
                    isWild ? 'text-gray-400' : 'bg-white text-black'
                  }`}
                >
                  轻柔
                </button>
                <button
                  type="button"
                  onClick={() => setIntensity('wild')}
                  className={`ios-btn rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
                    isWild ? 'bg-gradient-to-r from-[#FF9F0A] to-[#FF375F] text-white' : 'text-gray-400'
                  }`}
                >
                  狂热
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-5">
              <WheelCard title="谁来做" value={result.executor || null} groups={executors} color="#64B5FF" spinning={isSpinning} spinToken={spinToken} tick={tick} />
              <WheelCard title="做什么" value={result.action || null} groups={actions} color="#FF7A96" spinning={isSpinning} spinToken={spinToken} tick={tick} />
              <WheelCard title="哪里" value={result.target || null} groups={targetGroups} color="#D08BFF" spinning={isSpinning} spinToken={spinToken} tick={tick} highlightLabel={isWild ? '私密区' : undefined} />
              <WheelCard title="多久" value={result.duration || null} groups={durations} color="#FFB340" spinning={isSpinning} spinToken={spinToken} tick={tick} />
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
                {targetTier === '私密区' && (
                  <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-[#FF375F]/15 px-3 py-1 text-[10px] font-bold text-[#FF375F]">
                    <ShieldAlert size={12} />私密尺度 · 任何一方不适应都可以直接跳过
                  </div>
                )}
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
