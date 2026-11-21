import { useModeRuntime, useModeState } from '../../rules/ModeRuntime';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, Disc3, RotateCw, ShieldAlert, Sparkles, User, UserRound } from 'lucide-react';
import { Player, TaskCard, Theme } from '../../types';
import { loadFromStorage, saveToStorage } from '../../utils/localStorage';
import { pickFresh } from '../../utils/freshPick';

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

const SPIN_DURATION = 1500;
const TICK_START = 60;
const TICK_MAX = 180;

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
  void groups;
  void highlightLabel;
  // 装饰环的角度只影响本机画面，用本地状态即可，不必每转一次写共享快照
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (spinToken === 0) return;
    setRotation(previous => previous + 1080);
  }, [spinToken]);

  const display = spinning ? flatItems[tick % flatItems.length] : value;

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color }}>
        {title}
      </div>
      <div className="relative h-[96px] w-[96px]">
        <div
          className="absolute inset-0 rounded-full border-4 border-[#1C1C1E] bg-[#1C1C1E] shadow-lg ease-out"
          style={{
            borderColor: `${color}66`,
            transform: `rotate(${rotation}deg)`,
            transitionProperty: 'transform',
            transitionDuration: `${SPIN_DURATION}ms`,
            transitionTimingFunction: 'cubic-bezier(0.12, 0.75, 0.05, 1)'
          }}
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
      {/* 具体包含项不再展示，只保留转盘与结果 */}
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
  const runtime = useModeRuntime();
  const mySeat = runtime?.seat ?? null;
  const activePlayer = players[currentTurn] || players[0];
  const [isSpinning, setIsSpinning] = useModeState('RouletteModeView.isSpinning', false);
  const [result, setResult] = useModeState('RouletteModeView.result', { executor: '', action: '', target: '', duration: '' });
  const [bonusTask, setBonusTask] = useModeState<TaskCard | null>('RouletteModeView.bonusTask', null);
  const [round, setRound] = useModeState('RouletteModeView.round', 0);
  const [spinToken, setSpinToken] = useModeState('RouletteModeView.spinToken', 0);
  // 转盘上的文字滚动只是本机动画：不写共享状态，避免每秒几十条 patch
  const [tick, setTick] = useState(0);
  /** 主题加码任务：同一局不重复，抽完自动洗牌 */
  const [bonusUsed, setBonusUsed] = useModeState<string[]>('RouletteModeView.bonusUsed', []);
  const [bonusThemeName, setBonusThemeName] = useModeState<string | null>('RouletteModeView.bonusThemeName', null);
  /** 已经转出过的四维组合：同一局不重复 */
  const [usedCombos, setUsedCombos] = useModeState<string[]>('RouletteModeView.usedCombos', []);
  const [intensity, setIntensity] = useModeState<RouletteIntensity>('RouletteModeView.intensity', () =>
    loadFromStorage<RouletteIntensity>(INTENSITY_STORAGE_KEY, 'gentle')
  );
  const isWild = intensity === 'wild';
  const timerRef = useRef<number | null>(null);
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
  }, []);

  // 转盘文字：间隔从 60ms 一路拉长到 180ms，先飞快跳动再慢慢停住
  useEffect(() => {
    if (!isSpinning) return;
    setTick(0);
    let timer = 0;
    let delay = TICK_START;
    const step = () => {
      setTick(value => value + 1);
      delay = Math.min(TICK_MAX, Math.round(delay * 1.14));
      timer = window.setTimeout(step, delay);
    };
    timer = window.setTimeout(step, delay);
    return () => window.clearTimeout(timer);
  }, [isSpinning, spinToken]);

  const resultText = useMemo(() => {
    if (!hasResult) return '';
    return `${result.executor}${result.action}${result.target}，持续${result.duration}`;
  }, [hasResult, result]);

  const spin = () => {
    // 联机时只有当前回合方能转，转盘进行中双方都锁住
    if (mySeat !== null && currentTurn !== mySeat) return;
    if (isSpinning) return;
    const next = {
      executor: pick(flatten(executors), result.executor || null),
      action: pick(flatten(actions), result.action || null),
      target: pickTarget(result.target || null, isWild),
      duration: pick(flatten(durations), result.duration || null)
    };
    const comboKey = (value: typeof next) =>
      `${value.executor}|${value.action}|${value.target}|${value.duration}`;
    // 四维组合也不允许和本局之前的任何一次完全相同（几轮内重叠的概率极低，但不该出现）
    let guard = 0;
    while (usedCombos.includes(comboKey(next)) && guard < 40) {
      next.executor = pick(flatten(executors), next.executor);
      next.action = pick(flatten(actions), next.action);
      next.target = pickTarget(next.target, isWild);
      next.duration = pick(flatten(durations), next.duration);
      guard += 1;
    }
    setUsedCombos(previous => [...previous, comboKey(next)].slice(-80));
    setIsSpinning(true);
    setBonusTask(null);
    setBonusThemeName(null);
    setSpinToken(value => value + 1);
    setTick(0);
    if (navigator.vibrate) navigator.vibrate([15, 30, 15]);
    timerRef.current = window.setTimeout(() => {
      setResult(next);
      setRound(value => value + 1);
      // 主题加码：同一局不重复抽同一张
      const tasks = selectedTheme?.tasks || [];
      const picked = pickFresh(tasks, bonusUsed, task => task.text);
      if (picked) {
        setBonusTask(picked.item);
        setBonusUsed(picked.used);
        setBonusThemeName(selectedTheme?.name ?? null);
      } else {
        setBonusTask(null);
        setBonusThemeName(null);
      }
      setIsSpinning(false);
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
                  <div className="flex items-center gap-2 text-xs font-bold text-[#D08BFF]"><Sparkles size={15} />主题加码 · {bonusThemeName || selectedTheme?.name}</div>
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
