import { useModeRuntime, useModeState } from '../../rules/ModeRuntime';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Layers3, User, UserRound, X } from 'lucide-react';
import { Player, TaskEventData, Theme } from '../../types';

interface CardModeViewProps {
  players: Player[];
  themes: Theme[];
  currentTurn: number;
  onDrawTask: () => TaskEventData | null;
  onTaskTrigger: (data: TaskEventData) => void;
  onEndTurn: () => void;
  onBack: () => void;
}

export function CardModeView({
  players,
  themes,
  currentTurn,
  onDrawTask,
  onTaskTrigger,
  onEndTurn,
  onBack
}: CardModeViewProps) {
  const runtime = useModeRuntime();
  const mySeat = runtime?.seat ?? null;
  const activePlayer = players[currentTurn];
  const activeTheme = themes.find(t => t.id === activePlayer.themeId);
  const [drawnKeys, setDrawnKeys] = useModeState<Set<string>>('CardModeView.drawnKeys', () => new Set());
  // 抽卡提交锁：翻卡等待期间不能重复触发，否则会连续抽多张
  const [submitting, setSubmitting] = useState(false);
  const maleThemeId = players[0]?.themeId;
  const femaleThemeId = players[1]?.themeId;

  useEffect(() => {
    setDrawnKeys(new Set());
  }, [maleThemeId, femaleThemeId]);

  // 回合切换后解除提交锁
  useEffect(() => {
    setSubmitting(false);
  }, [currentTurn]);

  const themeDecks = useMemo(
    () => players.map(player => ({ player, theme: themes.find(theme => theme.id === player.themeId) })),
    [players, themes]
  );
  const totalCards = themeDecks.reduce((sum, deck) => sum + (deck.theme?.tasks.length || 0), 0);
  const remainingCards = Math.max(0, totalCards - drawnKeys.size);

  const handleDrawTask = () => {
    // 联机时只有当前回合方能抽卡，且一次回合只能抽一次
    if (submitting) return;
    if (mySeat !== null && currentTurn !== mySeat) return;
    const task = onDrawTask();
    if (!task) {
      alert('当前玩家还没有可抽取的任务');
      return;
    }
    setSubmitting(true);
    setDrawnKeys(previous => {
      const next = new Set(previous);
      // 用任务文本 + 步数做 key：联机的 taskSourceId 固定是 online，带它会导致灰卡匹配不上
      next.add(`${task.task}:${task.moveDelta}`);
      return next;
    });
    onTaskTrigger(task);
    // 抽卡玩法一次抽卡就是一个回合，抽完交给对方
    onEndTurn();
  };

  return (
    <div className="mobile-game-screen fixed inset-x-0 top-0 bottom-0 z-50 bg-black flex flex-col">
      <div className="absolute inset-0 z-0">
        <div className="w-full h-full bg-gradient-to-br from-gray-900 via-black to-gray-900 opacity-60" />
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      </div>

      <div className="relative z-10 flex flex-col h-full max-w-[430px] mx-auto w-full">
        <header className="mobile-screen-header py-2 px-4 flex items-center gap-3 shrink-0">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center ios-btn border border-white/5"
            aria-label="返回首页"
          >
            <ArrowLeft className="text-white" size={20} />
          </button>
          <div className="flex-1 flex justify-center">
            <div className="p-1.5 bg-[#1C1C1E] rounded-full flex items-center gap-2 border border-white/10">
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-all duration-300 ${
                  currentTurn === 0
                    ? 'bg-[#0A84FF] text-white shadow-lg shadow-blue-900/50'
                    : 'text-[#0A84FF] opacity-60'
                }`}
              >
                <User size={14} />
                <span className="text-xs font-bold">男方</span>
              </div>
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-2">
                抽卡
              </div>
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-all duration-300 ${
                  currentTurn === 1
                    ? 'bg-[#FF375F] text-white shadow-lg shadow-pink-900/50'
                    : 'text-[#FF375F] opacity-60'
                }`}
              >
                <span className="text-xs font-bold">女方</span>
                <UserRound size={14} />
              </div>
            </div>
          </div>
          <div className="w-10" />
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-6 py-3 flex flex-col justify-center gap-3">
          <div className="ios-card border border-white/5 p-5">
            <div className="text-xs text-gray-500 uppercase tracking-widest mb-3">当前回合</div>
            <div className="flex items-center gap-4">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg"
                style={{
                  backgroundColor: activePlayer.color,
                  boxShadow: `0 10px 15px -3px ${activePlayer.color}30`
                }}
              >
                {activePlayer.id === 0 ? (
                  <User className="text-white" size={26} />
                ) : (
                  <UserRound className="text-white" size={26} />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-2xl font-bold text-white">{activePlayer.name}</div>
                <div className="text-sm text-gray-400 mt-1 truncate">
                  {activeTheme?.name || '未选择主题'}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {players.map(player => {
              const theme = themes.find(t => t.id === player.themeId);
              const isActive = player.id === activePlayer.id;

              return (
                <div
                  key={player.id}
                  className={`rounded-[20px] border p-4 ${
                    isActive
                      ? 'bg-white text-black border-white'
                      : 'bg-[#1C1C1E] text-white border-white/5'
                  }`}
                >
                  <div
                    className={`text-xs font-bold mb-2 ${
                      isActive ? 'text-black/60' : 'text-gray-500'
                    }`}
                  >
                    {player.name}题库
                  </div>
                  <div className="text-sm font-semibold leading-tight line-clamp-2">
                    {theme?.name || '未选择主题'}
                  </div>
                  <div className={`text-xs mt-2 ${isActive ? 'text-black/50' : 'text-gray-600'}`}>
                    {theme?.tasks.length || 0} 张任务
                  </div>
                </div>
              );
            })}
          </div>

          <div className="ios-card border border-white/5 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-gray-500">任务牌堆</div>
                <div className="mt-1 text-sm text-gray-300">已抽 {drawnKeys.size} 张 · 剩余 {remainingCards} 张</div>
              </div>
              <div className="text-2xl font-bold text-white">{remainingCards}</div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {themeDecks.flatMap(({ player, theme }) =>
                (theme?.tasks || []).map((task, index) => {
                  const key = `${task.text}:${task.moveDelta}`;
                  const isDrawn = drawnKeys.has(key);
                  return (
                    <div
                      key={`${player.id}-${index}`}
                      aria-label={isDrawn ? '已抽取卡片' : '未抽取卡片'}
                      className={`relative aspect-[4/5] overflow-hidden rounded-xl border transition-all duration-500 ${
                        isDrawn
                          ? 'border-white/5 bg-black/40 opacity-25 grayscale'
                          : player.id === 0
                            ? 'border-[#0A84FF]/40 bg-[#0A84FF]/15'
                            : 'border-[#FF375F]/40 bg-[#FF375F]/15'
                      }`}
                    >
                      <div
                        className={`absolute inset-1 rounded-lg border ${
                          player.id === 0 ? 'border-[#0A84FF]/30' : 'border-[#FF375F]/30'
                        }`}
                        style={{
                          backgroundImage:
                            player.id === 0
                              ? 'repeating-linear-gradient(135deg, rgba(10,132,255,.16) 0 2px, transparent 2px 7px)'
                              : 'repeating-linear-gradient(135deg, rgba(255,55,95,.16) 0 2px, transparent 2px 7px)'
                        }}
                      />
                      {isDrawn && (
                        <span className="absolute inset-0 flex items-center justify-center text-gray-500">
                          <X size={18} strokeWidth={3} />
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDrawTask}
          disabled={submitting}
          className="mx-4 mb-2 h-[clamp(176px,30dvh,244px)] ios-glass rounded-[clamp(20px,4dvh,32px)] flex flex-col items-center justify-center px-6 border border-white/10 shadow-2xl shrink-0 ios-btn disabled:opacity-60"
        >
          <div
            className={`text-sm font-medium text-center animate-pulse mb-3 ${
              currentTurn === 0 ? 'text-[#0A84FF]' : 'text-[#FF375F]'
            }`}
          >
            {submitting ? '正在抽卡…' : `${activePlayer.name}回合：点击卡牌抽取任务`}
          </div>
          <div className="w-16 h-16 rounded-[20px] bg-white/5 flex items-center justify-center mb-3">
            <Layers3
              className={activePlayer.id === 0 ? 'text-[#0A84FF]' : 'text-[#FF375F]'}
              size={32}
            />
          </div>
          <div className="text-2xl font-bold text-white">抽取任务</div>
          <div className="text-sm text-gray-500 uppercase tracking-widest mt-3">
            点击抽卡
          </div>
        </button>
      </div>
    </div>
  );
}
