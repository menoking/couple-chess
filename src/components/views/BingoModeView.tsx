import { useMemo, useState } from 'react';
import { ArrowLeft, Check, Grid3x3, Sparkles, Trophy, User, UserRound } from 'lucide-react';
import { BingoBoard, BingoCellResult, Player, TaskCard, TaskEventData, Theme } from '../../types';
import { TaskCardModal } from '../modals/TaskCardModal';

interface BingoModeViewProps {
  players: Player[];
  themes: Theme[];
  bingoBoard: BingoBoard;
  currentTurn: number;
  onCompleteCell: (index: number) => BingoCellResult | null;
  onRestart: () => void;
  onEndTurn: () => void;
  onBack: () => void;
}

export function BingoModeView({
  players,
  themes,
  bingoBoard,
  currentTurn,
  onCompleteCell,
  onRestart,
  onEndTurn,
  onBack
}: BingoModeViewProps) {
  const activePlayer = players[currentTurn] || players[0];
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const [reward, setReward] = useState<{ lines: number; task: TaskCard; themeName: string } | null>(null);
  const [finished, setFinished] = useState(false);

  const totalCells = bingoBoard.cells.length;
  const completedCount = bingoBoard.cells.filter(cell => cell.completedBy !== null).length;
  const completedLines = bingoBoard.lines.filter(line => line.completed).length;
  const playerStats = players.map(player => ({
    player,
    count: bingoBoard.cells.filter(cell => cell.completedBy === player.id).length
  }));

  const completedLineCellIndices = useMemo(() => {
    const indices = new Set<number>();
    bingoBoard.lines
      .filter(line => line.completed)
      .forEach(line => line.cells.forEach(index => indices.add(index)));
    return indices;
  }, [bingoBoard.lines]);

  const pendingCell = pendingIndex !== null ? bingoBoard.cells[pendingIndex] ?? null : null;
  const pendingTheme = pendingCell ? themes.find(theme => theme.id === pendingCell.themeId) : undefined;
  const taskData: TaskEventData | null = pendingCell
    ? {
        type: 'card',
        initiatorPlayerId: activePlayer.id,
        executorPlayerId: activePlayer.id,
        title: 'Bingo 任务',
        subtitle: `任务来自「${pendingTheme?.name || '情侣任务'}」`,
        icon: 'sparkles',
        color: activePlayer.id === 0 ? 'text-[#0A84FF]' : 'text-[#FF375F]',
        task: pendingCell.task.text,
        taskSourceId: pendingCell.themeId,
        moveDelta: 0
      }
    : null;

  const handleAccept = () => {
    if (pendingIndex === null) return;
    const result = onCompleteCell(pendingIndex);
    setPendingIndex(null);
    if (!result) {
      onEndTurn();
      return;
    }
    if (result.boardComplete) {
      setFinished(true);
      return;
    }
    if (result.newLines > 0 && result.rewardTask) {
      setReward({
        lines: result.newLines,
        task: result.rewardTask,
        themeName: result.rewardThemeName || '情侣任务'
      });
      return;
    }
    onEndTurn();
  };

  const handleReject = () => {
    setPendingIndex(null);
    onEndTurn();
  };

  const handleRewardDone = () => {
    setReward(null);
    onEndTurn();
  };

  const handleRestart = () => {
    setReward(null);
    setFinished(false);
    setPendingIndex(null);
    onRestart();
  };

  return (
    <div className="mobile-game-screen fixed inset-x-0 top-0 bottom-0 z-50 flex flex-col bg-black">
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#1a1420] via-black to-[#0d1724] opacity-90" />

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
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#FFD60A]">Couple Bingo</div>
            <div className="mt-1 flex items-center justify-center gap-2 text-sm font-bold text-white">
              {currentTurn === 0 ? <User size={15} className="text-[#0A84FF]" /> : <UserRound size={15} className="text-[#FF375F]" />}
              {activePlayer?.name || '当前回合'} 的回合
            </div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center text-gray-500">
            <Grid3x3 size={22} />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 no-scrollbar">
          <div className="mb-4 grid grid-cols-3 gap-2">
            <div className="rounded-2xl border border-white/5 bg-white/[0.04] p-3 text-center">
              <div className="text-[10px] text-gray-500">完成进度</div>
              <div className="mt-1 text-lg font-bold text-white">
                {completedCount}
                <span className="text-xs text-gray-500">/{totalCells}</span>
              </div>
            </div>
            <div className="rounded-2xl border border-white/5 bg-white/[0.04] p-3 text-center">
              <div className="text-[10px] text-gray-500">连线</div>
              <div className="mt-1 text-lg font-bold text-[#FFD60A]">
                {completedLines}
                <span className="text-xs text-gray-500">/{bingoBoard.lines.length}</span>
              </div>
            </div>
            <div className="rounded-2xl border border-white/5 bg-white/[0.04] p-3 text-center">
              <div className="text-[10px] text-gray-500">当前回合</div>
              <div
                className="mt-1 truncate text-lg font-bold"
                style={{ color: activePlayer?.color || '#FFFFFF' }}
              >
                {activePlayer?.name || '—'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {bingoBoard.cells.map((cell, index) => {
              const theme = themes.find(item => item.id === cell.themeId);
              const owner = players.find(player => player.themeId === cell.themeId);
              const isMaleOwner = owner?.id === 0;
              const donePlayer = cell.completedBy !== null
                ? players.find(player => player.id === cell.completedBy)
                : undefined;
              const isDone = !!donePlayer;
              const inCompletedLine = isDone && completedLineCellIndices.has(index);
              const blocked = isDone || pendingIndex !== null || !!reward || finished;

              return (
                <button
                  key={index}
                  type="button"
                  disabled={blocked}
                  onClick={() => setPendingIndex(index)}
                  aria-label={isDone ? `第 ${index + 1} 格已完成` : `第 ${index + 1} 格，${theme?.name || '任务'}`}
                  className={`relative flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border p-1.5 transition-all ios-btn disabled:opacity-40 ${
                    isDone
                      ? 'border-white/10 bg-black/40'
                      : isMaleOwner
                        ? 'border-[#0A84FF]/40 bg-[#0A84FF]/15'
                        : 'border-[#FF375F]/40 bg-[#FF375F]/15'
                  } ${inCompletedLine ? 'ring-1 ring-[#FFD60A]/60' : ''}`}
                >
                  {isDone && donePlayer ? (
                    <>
                      <Check size={20} strokeWidth={3} style={{ color: donePlayer.color }} />
                      <span className="text-[9px] font-bold" style={{ color: donePlayer.color }}>
                        {donePlayer.name}
                      </span>
                    </>
                  ) : (
                    <>
                      <span
                        className={`text-[9px] font-bold leading-tight line-clamp-2 text-center ${
                          isMaleOwner ? 'text-[#64B5FF]' : 'text-[#FF7A96]'
                        }`}
                      >
                        {theme?.name || '任务'}
                      </span>
                      <Grid3x3 size={13} className="text-gray-600" />
                    </>
                  )}
                </button>
              );
            })}
          </div>

          <p className="mt-4 text-center text-[11px] leading-relaxed text-gray-500">
            点击格子翻开任务，完成后标记归属；任意行、列或对角线连成一线即可获得连线奖励
          </p>

          {reward && (
            <div className="mt-4 rounded-3xl border border-[#BF5AF2]/25 bg-[#BF5AF2]/10 p-5">
              <div className="flex items-center gap-2 text-xs font-bold text-[#D08BFF]">
                <Sparkles size={15} />
                连线奖励{reward.lines > 1 ? ` ×${reward.lines}` : ''} · {reward.themeName}
              </div>
              <div className="mt-3 text-sm leading-relaxed text-white">{reward.task.text}</div>
              <button
                type="button"
                onClick={handleRewardDone}
                className="ios-btn mt-4 flex h-12 w-full items-center justify-center rounded-full bg-white text-base font-bold text-black shadow-lg"
              >
                收下奖励，交给下一位
              </button>
            </div>
          )}

          {finished && (
            <div className="mt-4 rounded-3xl border border-[#FFD60A]/25 bg-[#FFD60A]/10 p-6 text-center">
              <Trophy size={36} className="mx-auto text-[#FFD60A]" />
              <div className="mt-3 text-xl font-bold text-white">Bingo 盘全部完成！</div>
              <div className="mt-2 text-sm text-gray-400">
                {playerStats.map(({ player, count }) => `${player.name}完成 ${count} 格`).join(' · ')}
                {' · '}共 {completedLines} 条连线
              </div>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={handleRestart}
                  className="ios-btn h-12 flex-1 rounded-full bg-white text-base font-bold text-black shadow-lg"
                >
                  再来一局
                </button>
                <button
                  type="button"
                  onClick={onBack}
                  className="ios-btn h-12 flex-1 rounded-full border border-white/10 bg-white/10 text-base font-bold text-white"
                >
                  返回主页
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      <TaskCardModal
        isOpen={!!taskData}
        taskData={taskData}
        onAccept={handleAccept}
        onReject={handleReject}
      />
    </div>
  );
}
