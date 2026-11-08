import { useMemo, useState } from 'react';
import { ArrowLeft, Grid2x2, RefreshCw, Sparkles, User, UserRound, X } from 'lucide-react';
import { Player, Theme } from '../../types';
import { buildTaskPool, createViewTaskEvent, pickRandom } from '../../utils/modeKit';
import { generateSudoku } from '../../utils/sudoku';
import { TaskCardModal } from '../modals/TaskCardModal';

interface SudokuModeViewProps {
  players: Player[];
  themes: Theme[];
  currentTurn: number;
  onBack: () => void;
}

const BLANK_COUNT = 12;

function SudokuGame({ players, themes, currentTurn }: { players: Player[]; themes: Theme[]; currentTurn: number }) {
  const initial = useMemo(() => generateSudoku(BLANK_COUNT), []);
  const pool = useMemo(() => buildTaskPool(players, themes) ?? [], [players, themes]);

  const [cells, setCells] = useState<number[]>(() => [...initial.puzzle]);
  const [turn, setTurn] = useState(currentTurn === 1 ? 1 : 0);
  const [selected, setSelected] = useState<number | null>(null);
  const [errorCell, setErrorCell] = useState<number | null>(null);
  const [cardCounts, setCardCounts] = useState<Record<number, number>>({ 0: 0, 1: 0 });
  const [taskData, setTaskData] = useState<ReturnType<typeof createViewTaskEvent> | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  const activePlayer = players[turn] || players[0];
  const blanksLeft = useMemo(
    () => cells.reduce((count, value, index) => (value === 0 && !initial.given[index] ? count + 1 : count), 0),
    [cells, initial.given]
  );

  const pickNumber = (value: number) => {
    if (selected === null || taskData || finished) return;

    const byId = activePlayer.id;

    if (initial.solution[selected] === value) {
      setCells(prev => prev.map((cell, index) => (index === selected ? value : cell)));
      setCardCounts(prev => ({ ...prev, [byId]: (prev[byId] ?? 0) + 1 }));
      setErrorCell(null);
      setToast(null);
      setSelected(null);

      const entry = pickRandom(pool);
      if (entry) {
        setTaskData(
          createViewTaskEvent({ entry, title: '解格成功 · 抽卡', executorPlayerId: byId })
        );
      } else {
        setTurn(turn === 0 ? 1 : 0);
      }
      return;
    }

    // 填错：标记错误，换对方
    setErrorCell(selected);
    setToast(`${activePlayer.name} 填错了，换对方`);
    window.setTimeout(() => {
      setErrorCell(null);
      setSelected(null);
      setToast(null);
      setTurn(prev => (prev === 0 ? 1 : 0));
    }, 700);
  };

  const closeTask = () => {
    setTaskData(null);
    if (blanksLeft === 0) {
      setFinished(true);
      return;
    }
    setTurn(prev => (prev === 0 ? 1 : 0));
  };

  if (finished) {
    const first = players[0];
    const second = players[1];
    const a = cardCounts[first.id] ?? 0;
    const b = cardCounts[second?.id ?? 1] ?? 0;
    const winner = a === b ? null : a > b ? first : second;
    return (
      <div className="space-y-4">
        <div className="rounded-3xl border border-[#30D158]/25 bg-[#30D158]/10 p-6 text-center">
          <Grid2x2 size={36} className="mx-auto text-[#30D158]" />
          <div className="mt-3 text-xl font-bold text-white">
            {winner ? `${winner.name} 解格更多！` : '势均力敌，平局！'}
          </div>
          <div className="mt-4 space-y-2">
            {players.map(player => (
              <div key={player.id} className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                <span className="text-sm font-bold" style={{ color: player.color }}>{player.name}</span>
                <span className="text-lg font-bold text-white">{cardCounts[player.id] ?? 0} 张卡</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold text-gray-400">
          剩余空格 {blanksLeft}
        </div>
        <div className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold">
          {players.map(player => (
            <span key={player.id} style={{ color: player.color }}>
              {player.name} {cardCounts[player.id] ?? 0}
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 rounded-2xl bg-white/5 py-3 text-sm font-bold text-white">
        {activePlayer?.id === 0 ? <User size={15} className="text-[#0A84FF]" /> : <UserRound size={15} className="text-[#FF375F]" />}
        {activePlayer?.name || '当前玩家'} 的回合：选空格，填对就抽一张卡
      </div>

      <div className="grid grid-cols-9 overflow-hidden rounded-2xl border-2 border-white/20">
        {cells.map((value, index) => {
          const row = Math.floor(index / 9);
          const col = index % 9;
          const isGiven = initial.given[index];
          const isSelected = selected === index;
          const isError = errorCell === index;

          const borderTop = row % 3 === 0 && row !== 0 ? 'border-t-2 border-t-white/30' : 'border-t border-t-white/10';
          const borderLeft = col % 3 === 0 && col !== 0 ? 'border-l-2 border-l-white/30' : 'border-l border-l-white/10';

          return (
            <button
              key={index}
              type="button"
              disabled={isGiven || value !== 0 || !!taskData}
              onClick={() => setSelected(index)}
              className={`aspect-square flex items-center justify-center text-[15px] transition-colors ${borderTop} ${borderLeft} ${
                isError
                  ? 'bg-[#FF453A]/40 text-white'
                  : isSelected
                    ? 'bg-[#0A84FF]/35 text-white'
                    : isGiven
                      ? 'bg-white/[0.03] text-white/45'
                      : value !== 0
                        ? 'bg-white/[0.08] text-white font-bold'
                        : 'bg-transparent text-white'
              }`}
            >
              {value !== 0 ? value : ''}
            </button>
          );
        })}
      </div>

      {selected !== null ? (
        <div className="space-y-2">
          <div className="text-center text-xs font-bold text-gray-500">
            选择数字填入第 {Math.floor(selected / 9) + 1} 行第 {(selected % 9) + 1} 列
          </div>
          <div className="grid grid-cols-9 gap-1">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(value => (
              <button
                key={value}
                type="button"
                onClick={() => pickNumber(value)}
                className="ios-btn h-11 rounded-xl bg-white/10 text-base font-bold text-white active:bg-white/20"
              >
                {value}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="ios-btn mx-auto flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-gray-500"
          >
            <X size={12} />取消选择
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-white/5 bg-white/[0.03] py-3 text-[11px] text-gray-500">
          <Sparkles size={12} />点击任意空格开始填数
        </div>
      )}

      {toast && (
        <div className="rounded-2xl border border-[#FF453A]/30 bg-[#FF453A]/10 p-3 text-center text-xs font-bold text-[#FF7A96]">
          {toast}
        </div>
      )}

      <TaskCardModal
        isOpen={!!taskData}
        taskData={taskData}
        onAccept={closeTask}
        onReject={closeTask}
        onClose={closeTask}
      />
    </div>
  );
}

export function SudokuModeView({ players, themes, currentTurn, onBack }: SudokuModeViewProps) {
  const [runId, setRunId] = useState(0);

  return (
    <div className="mobile-game-screen fixed inset-x-0 top-0 bottom-0 z-50 flex flex-col bg-black">
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#0f1f18] via-black to-[#0d1724] opacity-90" />
      <div className="relative z-10 mx-auto flex h-full w-full max-w-[430px] flex-col">
        <header className="mobile-screen-header flex shrink-0 items-center gap-3 px-4 py-2">
          <button onClick={onBack} className="ios-btn flex h-10 w-10 items-center justify-center rounded-full border border-white/5 bg-white/10" aria-label="返回首页">
            <ArrowLeft className="text-white" size={20} />
          </button>
          <div className="flex-1 text-center">
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#30D158]">Sudoku</div>
            <div className="mt-1 text-sm font-bold text-white">数独 · 解格抽卡</div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center text-gray-500">
            <Grid2x2 size={22} />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 no-scrollbar">
          <SudokuGame key={runId} players={players} themes={themes} currentTurn={currentTurn} />
          <button type="button" onClick={() => setRunId(value => value + 1)} className="ios-btn mx-auto mt-6 flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-xs font-bold text-gray-400">
            <RefreshCw size={13} />换一盘
          </button>
        </main>
      </div>
    </div>
  );
}
