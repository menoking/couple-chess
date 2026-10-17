import { useMemo, useState } from 'react';
import { ArrowLeft, RefreshCw, Sparkles, User, UserRound, Zap } from 'lucide-react';
import { Player, Theme } from '../../types';
import { ThemeTaskEntry, buildTaskPool, createViewTaskEvent, pickRandom, themeIntensity } from '../../utils/modeKit';
import { SPICY_DOUBLE_UPGRADES } from '../../data/spicyContent';
import { TaskCardModal } from '../modals/TaskCardModal';

interface SecretDoubleModeViewProps {
  players: Player[];
  themes: Theme[];
  currentTurn: number;
  onEndTurn: () => void;
  onBack: () => void;
}

function SecretDoubleGame({
  players,
  themes,
  currentTurn,
  onEndTurn
}: {
  players: Player[];
  themes: Theme[];
  currentTurn: number;
  onEndTurn: () => void;
}) {
  const activePlayer = players[currentTurn] || players[0];
  const opponent = players.find(p => p.id !== activePlayer?.id);
  const pool = useMemo(() => buildTaskPool(players, themes) ?? [], [players, themes]);

  const [phase, setPhase] = useState<'pick' | 'double' | 'task'>('pick');
  const [currentEntry, setCurrentEntry] = useState<ThemeTaskEntry | null>(null);
  const [upgradedEntry, setUpgradedEntry] = useState<ThemeTaskEntry | null>(null);
  const [upgradeNote, setUpgradeNote] = useState<string | null>(null);
  const [doubled, setDoubled] = useState(false);
  const [points, setPoints] = useState<Record<number, number>>({ 0: 0, 1: 0 });
  const [taskData, setTaskData] = useState<ReturnType<typeof createViewTaskEvent> | null>(null);
  const [resultBanner, setResultBanner] = useState<string | null>(null);

  const draw = () => {
    const entry = pickRandom(pool);
    if (!entry) return;
    setCurrentEntry(entry);
    setUpgradedEntry(null);
    setUpgradeNote(null);
    setDoubled(false);
    setResultBanner(null);
    setPhase('double');
  };

  // 加码：从更高尺度的主题里重新抽任务；若无更高尺度，则叠加升级挑战
  const buildUpgradedEntry = (): { entry: ThemeTaskEntry; note: string } => {
    const currentTheme = themes.find(t => t.id === currentEntry?.themeId);
    const currentLevel = themeIntensity(currentTheme);

    // 找强度更高的主题任务
    const higher = pool.filter(entry => themeIntensity(themes.find(t => t.id === entry.themeId)) > currentLevel);
    if (higher.length > 0) {
      const entry = pickRandom(higher) ?? higher[0];
      const entryLevel = themeIntensity(themes.find(t => t.id === entry.themeId));
      return {
        entry,
        note: `尺度升级：★${currentLevel} → ★${entryLevel}，任务换了更刺激的`
      };
    }

    // 已是最强，叠加升级挑战
    const upgrade = pickRandom(SPICY_DOUBLE_UPGRADES) ?? SPICY_DOUBLE_UPGRADES[0];
    const baseEntry = currentEntry as ThemeTaskEntry;
    const boosted: ThemeTaskEntry = {
      ...baseEntry,
      task: { ...baseEntry.task, text: `${baseEntry.task.text}（加码：${upgrade}）` }
    };
    return { entry: boosted, note: `已达最高尺度，叠加挑战：${upgrade}` };
  };

  const choose = (doDouble: boolean) => {
    setDoubled(doDouble);
    setPhase('task');
    if (!currentEntry) return;

    if (doDouble) {
      const { entry, note } = buildUpgradedEntry();
      setUpgradedEntry(entry);
      setUpgradeNote(note);
      const executorId = activePlayer.id === 0 ? 1 : 0;
      setTaskData(
        createViewTaskEvent({ entry, title: '加码任务', executorPlayerId: executorId })
      );
    } else {
      setUpgradedEntry(currentEntry);
      setUpgradeNote(null);
      setTaskData(
        createViewTaskEvent({ entry: currentEntry, title: '普通任务', executorPlayerId: activePlayer.id })
      );
    }
  };

  const resolve = (accepted: boolean) => {
    const entry = upgradedEntry ?? currentEntry;
    if (!entry) return;
    const theme = themes.find(t => t.id === entry.themeId);
    const base = themeIntensity(theme);
    const gain = accepted ? (doubled ? base * 2 : base) : 0;
    if (accepted) {
      setPoints(prev => ({ ...prev, [activePlayer.id]: (prev[activePlayer.id] ?? 0) + gain }));
      setResultBanner(doubled ? `加码完成！+${gain} 分（翻倍奖励）` : `完成 +${gain} 分`);
    } else {
      setResultBanner(doubled ? '加码任务放弃，血亏翻倍奖励' : '任务跳过');
    }
    setTaskData(null);
    setCurrentEntry(null);
    setUpgradedEntry(null);
    setUpgradeNote(null);
    setPhase('pick');
    onEndTurn();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold text-gray-400">
          秘密翻倍
        </div>
        <div className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold">
          {players.map(player => (
            <span key={player.id} style={{ color: player.color }}>
              {player.name} {points[player.id] ?? 0} 分
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 rounded-2xl bg-white/5 py-3 text-sm font-bold text-white">
        {activePlayer?.id === 0 ? <User size={15} className="text-[#0A84FF]" /> : <UserRound size={15} className="text-[#FF375F]" />}
        {activePlayer?.name || '当前玩家'} 的回合
      </div>

      {resultBanner && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-center text-sm font-bold text-white">
          {resultBanner}
        </div>
      )}

      {phase === 'pick' && (
        <button
          type="button"
          onClick={draw}
          className="ios-btn flex h-48 w-full flex-col items-center justify-center gap-3 rounded-3xl border border-[#BF5AF2]/30 bg-gradient-to-br from-[#BF5AF2]/20 to-transparent"
        >
          <Sparkles size={38} className="text-[#D08BFF]" />
          <span className="text-xl font-bold text-white">翻开一张任务卡</span>
          <span className="text-xs text-gray-500">翻后可选「加码翻倍」</span>
        </button>
      )}

      {phase === 'double' && currentEntry && (
        <div className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5 text-center">
            <div className="text-xs font-bold text-[#D08BFF]">{currentEntry.themeName}</div>
            <div className="mt-2 text-lg font-bold leading-relaxed text-white">{currentEntry.task.text}</div>
            <div className="mt-2 text-[11px] text-gray-500">
              当前尺度 ★{themeIntensity(themes.find(t => t.id === currentEntry.themeId))}
            </div>
          </div>
          <div className="text-center text-sm text-gray-400">
            加码后会换一个<strong className="text-[#D08BFF]">更刺激的任务</strong>，由{opponent?.name}执行，完成奖励翻倍
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => choose(false)} className="ios-btn h-14 flex-1 rounded-full bg-[#3A3A3C] text-base font-bold text-white">
              原样执行
            </button>
            <button type="button" onClick={() => choose(true)} className="ios-btn h-14 flex-1 rounded-full bg-[#BF5AF2] text-base font-bold text-white">
              <span className="flex items-center justify-center gap-1.5"><Zap size={16} />加码翻倍</span>
            </button>
          </div>
        </div>
      )}

      {phase === 'task' && taskData && (
        <>
          {upgradeNote && (
            <div className="rounded-2xl border border-[#BF5AF2]/30 bg-[#BF5AF2]/10 p-3 text-center text-xs font-bold text-[#D08BFF]">
              {upgradeNote}
            </div>
          )}
          <TaskCardModal
            isOpen
            taskData={taskData}
            onAccept={() => resolve(true)}
            onReject={() => resolve(false)}
            onClose={() => resolve(false)}
          />
        </>
      )}
    </div>
  );
}

export function SecretDoubleModeView({ players, themes, currentTurn, onEndTurn, onBack }: SecretDoubleModeViewProps) {
  const [runId, setRunId] = useState(0);

  return (
    <div className="mobile-game-screen fixed inset-x-0 top-0 bottom-0 z-50 flex flex-col bg-black">
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#1d1230] via-black to-[#0d1724] opacity-90" />
      <div className="relative z-10 mx-auto flex h-full w-full max-w-[430px] flex-col">
        <header className="mobile-screen-header flex shrink-0 items-center gap-3 px-4 py-2">
          <button onClick={onBack} className="ios-btn flex h-10 w-10 items-center justify-center rounded-full border border-white/5 bg-white/10" aria-label="返回首页">
            <ArrowLeft className="text-white" size={20} />
          </button>
          <div className="flex-1 text-center">
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#BF5AF2]">Secret Double</div>
            <div className="mt-1 text-sm font-bold text-white">秘密翻倍</div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center text-gray-500">
            <Zap size={22} />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 no-scrollbar">
          <SecretDoubleGame key={runId} players={players} themes={themes} currentTurn={currentTurn} onEndTurn={onEndTurn} />
          <button type="button" onClick={() => setRunId(value => value + 1)} className="ios-btn mx-auto mt-6 flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-xs font-bold text-gray-400">
            <RefreshCw size={13} />重新开始
          </button>
        </main>
      </div>
    </div>
  );
}
