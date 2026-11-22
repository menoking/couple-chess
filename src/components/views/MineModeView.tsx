import { useRef, useState } from 'react';
import { useModeRuntime } from '../../rules/ModeRuntime';
import { MINE_BOMB_COUNT, mineScores } from '../../utils/gameLogic';
import {
  ArrowLeft,
  Bomb,
  CheckCircle2,
  Circle,
  Flag,
  Flame,
  MessageCircleQuestion,
  Sparkles,
  User,
  UserRound
} from 'lucide-react';
import { MineRevealResult, MineTile, Player, TaskEventData, Theme } from '../../types';

interface MineModeViewProps {
  players: Player[];
  themes: Theme[];
  mineBoard: MineTile[];
  currentTurn: number;
  onRevealTile: (index: number) => MineRevealResult | null;
  onToggleFlag: (index: number) => void;
  onTaskTrigger: (data: TaskEventData) => void;
  onBombTrigger: () => void;
  onEndTurn: () => void;
  /** 队列里还有没确认的卡：棋盘也不能再翻 */
  pendingCards: number;
  /** 联机时翻格结果由房主处理，视图只负责发出动作。 */
  resolveEventsExternally?: boolean;
  onBack: () => void;
}

const mineTileMeta = {
  bomb: {
    label: '炸弹',
    icon: Bomb,
    className: 'bg-[#3A1F1F] text-[#FF453A] border-[#FF453A]/30'
  },
  truth: {
    label: '真心话',
    icon: MessageCircleQuestion,
    className: 'bg-[#102B3A] text-[#64D2FF] border-[#64D2FF]/30'
  },
  dare: {
    label: '大冒险',
    icon: Flame,
    className: 'bg-[#35230A] text-[#FF9F0A] border-[#FF9F0A]/30'
  },
  blank: {
    label: '空白',
    icon: CheckCircle2,
    className: 'bg-[#1C1C1E] text-gray-500 border-white/5'
  },
  theme: {
    label: '主题',
    icon: Sparkles,
    className: 'bg-[#221634] text-[#BF5AF2] border-[#BF5AF2]/30'
  }
};

export function MineModeView({
  players,
  themes,
  mineBoard,
  currentTurn,
  onRevealTile,
  onToggleFlag,
  onTaskTrigger,
  onBombTrigger,
  onEndTurn,
  pendingCards,
  resolveEventsExternally = false,
  onBack
}: MineModeViewProps) {
  const runtime = useModeRuntime();
  const mySeat = runtime?.seat ?? null;
  const revealLock = useRef(false);
  const [flagMode, setFlagMode] = useState(false);
  const activePlayer = players[currentTurn];
  const activeTheme = themes.find(t => t.id === activePlayer.themeId);
  const revealedCount = mineBoard.filter(tile => tile.revealed).length;
  const remainingCount = mineBoard.length - revealedCount;
  const flags = mineBoard.filter(tile => tile.flaggedBy !== null).length;
  const completed = mineBoard.length > 0 && mineBoard.every(tile => tile.type === 'bomb' || tile.revealed);
  const scores = mineScores(mineBoard);
  const winner = scores[0] === scores[1] ? null : scores[0] > scores[1] ? players[0] : players[1];

  const handleReveal = (index: number) => {
    // 非当前回合方不能翻；翻完到回合广播回来之间也锁住，避免连点翻多格
    if (mySeat !== null && currentTurn !== mySeat) return;
    if (pendingCards > 0) return;
    if (revealLock.current) return;
    revealLock.current = true;
    window.setTimeout(() => { revealLock.current = false; }, 800);
    if (flagMode) {
      onToggleFlag(index);
      revealLock.current = false;
      return;
    }
    const result = onRevealTile(index);
    if (!result) return;
    if (resolveEventsExternally) return;

    if (navigator.vibrate) {
      navigator.vibrate(result.type === 'bomb' ? [30, 40, 30] : 18);
    }

    if (result.type === 'bomb') {
      onBombTrigger();
      return;
    }

    if (result.type === 'task') {
      // 卡片确认出队时由房主统一交回合（见 reduceRoom 的 ackCard）
      onTaskTrigger(result.task);
      return;
    }

    if (!result.completed) onEndTurn();
  };

  const handleFlag = (index: number) => {
    if (mySeat !== null && currentTurn !== mySeat) return;
    if (pendingCards > 0 || completed) return;
    onToggleFlag(index);
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
                扫雷
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

        <div className="px-4 pt-2 pb-1 shrink-0">
          <div className="ios-card border border-white/5 p-3">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div
                  className={`text-sm font-medium ${
                    currentTurn === 0 ? 'text-[#0A84FF]' : 'text-[#FF375F]'
                  }`}
                >
                  {activePlayer.name}回合
                </div>
                <div className="mine-active-theme text-xs text-gray-500 mt-1 truncate">
                  {activeTheme?.name || '未选择主题'}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <div className="text-right">
                  <div className="text-xl font-bold text-white">{remainingCount}</div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-widest">剩余方格</div>
                </div>
                <button
                  type="button"
                  aria-pressed={flagMode}
                  onClick={() => setFlagMode(value => !value)}
                  className={`ios-btn flex h-10 items-center gap-1.5 rounded-full border px-3 text-[11px] font-bold ${flagMode ? 'border-[#FFD60A]/50 bg-[#FFD60A]/15 text-[#FFD60A]' : 'border-white/10 bg-white/5 text-gray-400'}`}
                >
                  <Flag size={13} /> {flagMode ? '标记中' : '标记'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mine-board-space flex-1 min-h-0 px-4 py-2 flex items-center justify-center">
          <div className="mine-board-grid grid grid-cols-6 grid-rows-6 gap-[clamp(0.25rem,1.2vh,0.5rem)]">
            {mineBoard.map((tile, index) => {
              const meta = mineTileMeta[tile.type];
              const Icon = tile.revealed ? meta.icon : tile.flaggedBy !== null ? Flag : Circle;
              const numberColor = ['', 'text-[#64D2FF]', 'text-[#30D158]', 'text-[#FF9F0A]', 'text-[#FF453A]', 'text-[#BF5AF2]', 'text-[#FF375F]', 'text-white', 'text-white'][tile.adjacentMines] ?? 'text-white';

              return (
                <button
                  key={index}
                  type="button"
                  disabled={tile.revealed || completed}
                  onClick={() => handleReveal(index)}
                  onContextMenu={event => {
                    event.preventDefault();
                    handleFlag(index);
                  }}
                  className={`relative aspect-square min-h-0 min-w-0 rounded-[clamp(0.5rem,1.8vh,1rem)] border flex flex-col items-center justify-center transition-all ios-btn ${
                    tile.revealed
                      ? meta.className
                      : tile.flaggedBy !== null
                        ? 'bg-[#332B0B] text-[#FFD60A] border-[#FFD60A]/30 shadow-lg shadow-black/20'
                        : 'bg-[#1C1C1E] text-gray-500 border-white/5 shadow-lg shadow-black/20'
                  }`}
                  aria-label={tile.revealed ? `${meta.label}，周围${tile.adjacentMines}颗雷` : tile.flaggedBy !== null ? `取消标记第${index + 1}格` : `${flagMode ? '标记' : '翻开'}第${index + 1}格`}
                >
                  {tile.revealed && tile.type !== 'bomb' ? (
                    <span className={`text-[clamp(1rem,3.8vh,1.5rem)] font-black leading-none ${numberColor}`}>{tile.adjacentMines}</span>
                  ) : (
                    <Icon size={tile.revealed ? 'clamp(14px, 3.5vh, 24px)' : 'clamp(12px, 2.6vh, 18px)'} />
                  )}
                  <span
                    className={`mt-1 text-[10px] font-bold leading-none ${
                      tile.revealed ? 'opacity-90' : 'opacity-60'
                    }`}
                  >
                    {tile.revealed ? meta.label : tile.flaggedBy !== null ? '已标记' : flagMode ? '标记' : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mx-4 mb-2 ios-glass rounded-[24px] px-3 py-[clamp(0.5rem,1.4vh,1rem)] border border-white/10 shadow-2xl shrink-0">
          <div className="flex items-center justify-between gap-2 text-[11px] text-gray-500 mb-2">
            <span>已翻开 {revealedCount}</span>
            <span className="mine-summary-hint">标记 {flags}/{MINE_BOMB_COUNT} · 炸弹由对方指定</span>
          </div>
          <div className="mine-summary-grid grid grid-cols-4 gap-2">
            {(['truth', 'dare', 'theme', 'blank'] as const).map(type => {
              const meta = mineTileMeta[type];
              const Icon = meta.icon;
              const count = mineBoard.filter(tile => tile.revealed && tile.type === type).length;

              return (
                <div key={type} className="mine-summary-item rounded-xl bg-white/[0.04] border border-white/5 px-1 py-1.5 text-center">
                  <Icon className="mine-summary-icon mx-auto mb-1 text-gray-400" size={14} />
                  <div className="mine-summary-label text-[10px] text-gray-500 leading-tight">{meta.label}</div>
                  <div className="mine-summary-count text-xs font-bold text-white mt-1">{count}</div>
                </div>
              );
            })}
          </div>
        </div>
        {completed && pendingCards === 0 && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/85 px-6 backdrop-blur-md">
            <div className="w-full rounded-[28px] border border-white/10 bg-[#1C1C1E] p-6 text-center shadow-2xl">
              <div className="text-5xl">{winner ? '🏆' : '🤝'}</div>
              <div className="mt-3 text-2xl font-bold text-white">{winner ? `${winner.name} 获胜` : '平局'}</div>
              <div className="mt-2 text-xs leading-relaxed text-gray-400">安全格 +1 · 正确标雷 +2 · 踩雷 -2</div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                {players.slice(0, 2).map((player, seat) => (
                  <div key={player.id} className="rounded-2xl border border-white/5 bg-white/[0.04] p-3">
                    <div className="text-xs text-gray-500">{player.name}</div>
                    <div className="mt-1 text-2xl font-bold text-white">{scores[seat]}</div>
                  </div>
                ))}
              </div>
              <button type="button" onClick={onBack} className="ios-btn mt-5 h-11 w-full rounded-full bg-white text-sm font-bold text-black">返回主页</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
