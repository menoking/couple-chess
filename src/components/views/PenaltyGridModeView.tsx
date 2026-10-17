import { useState } from 'react';
import { ArrowLeft, Grid3x3, RefreshCw, Skull, User, UserRound, X } from 'lucide-react';
import { Player, Theme } from '../../types';
import { buildTaskPool, pickRandom } from '../../utils/modeKit';
import { SPICY_PENALTIES } from '../../data/spicyContent';

interface PenaltyGridModeViewProps {
  players: Player[];
  themes: Theme[];
  onBack: () => void;
}

const GRID = 3;
const TOTAL = GRID * GRID;

const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

function PenaltyGridGame({ players, themes, onExit }: { players: Player[]; themes: Theme[]; onExit: () => void }) {
  const [turn, setTurn] = useState(0);
  const [grid, setGrid] = useState<Array<number | null>>(() => new Array(TOTAL).fill(null));
  const [loserId, setLoserId] = useState<number | null>(null);
  const [winnerId, setWinnerId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const activePlayer = players[turn];
  const pool = buildTaskPool(players, themes) ?? [];

  const checkWin = (g: Array<number | null>, playerId: number): boolean =>
    WIN_LINES.some(line => line.every(i => g[i] === playerId));

  const handleFail = () => {
    // 当前玩家任务失败 → 对方在九宫格落子
    const opponentId = turn === 0 ? 1 : 0;
    const empty = grid.map((v, i) => (v === null ? i : -1)).filter(i => i !== -1);
    if (empty.length === 0) {
      setNotice('格子已满，平局');
      return;
    }
    const cell = pickRandom(empty) ?? empty[0];
    const nextGrid = grid.map((v, i) => (i === cell ? opponentId : v));
    setGrid(nextGrid);

    if (checkWin(nextGrid, opponentId)) {
      setWinnerId(opponentId);
      setLoserId(turn);
      return;
    }
    setTurn(turn === 0 ? 1 : 0);
    setNotice(null);
  };

  const handleSuccess = () => {
    setTurn(turn === 0 ? 1 : 0);
    setNotice(null);
  };

  const currentTask = pickRandom(pool);

  if (winnerId !== null) {
    const winner = players.find(p => p.id === winnerId);
    const loser = players.find(p => p.id === loserId);
    return (
      <div className="space-y-4">
        <div className="rounded-3xl border border-[#FFD60A]/30 bg-[#FFD60A]/10 p-6 text-center">
          <Grid3x3 size={36} className="mx-auto text-[#FFD60A]" />
          <div className="mt-3 text-xl font-bold text-white">{winner?.name} 连成一线！</div>
          <div className="mt-2 text-sm text-gray-400">{loser?.name} 整晚由 {winner?.name} 主导</div>
        </div>
        <div className="rounded-2xl border border-[#FF453A]/25 bg-[#FF453A]/10 p-5">
          <div className="text-xs font-bold text-[#FF453A]">终极惩罚</div>
          <div className="mt-2 text-base font-semibold leading-relaxed text-white">{pickRandom(SPICY_PENALTIES)}</div>
        </div>
        <button type="button" onClick={onExit} className="ios-btn h-12 w-full rounded-full border border-white/10 bg-white/10 text-base font-bold text-white">
          返回主页
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold text-gray-400">
          失败落子 · 先连线者主导
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-[#FF453A]/15 px-3 py-1 text-[10px] font-bold text-[#FF7A96]">
          <Skull size={12} />惩罚九宫格
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 rounded-2xl bg-white/5 py-3 text-sm font-bold text-white">
        {activePlayer?.id === 0 ? <User size={15} className="text-[#0A84FF]" /> : <UserRound size={15} className="text-[#FF375F]" />}
        {activePlayer?.name || '当前玩家'} 接受任务，失败则对方落子
      </div>

      {currentTask && (
        <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
          <div className="text-xs font-bold text-[#D08BFF]">{currentTask.themeName}</div>
          <div className="mt-2 text-lg font-bold leading-relaxed text-white">{currentTask.task.text}</div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {grid.map((owner, index) => {
          const ownerPlayer = owner !== null ? players.find(p => p.id === owner) : undefined;
          return (
            <div
              key={index}
              className="flex aspect-square items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]"
            >
              {ownerPlayer ? (
                <span className="text-2xl font-bold" style={{ color: ownerPlayer.color }}>X</span>
              ) : (
                <span className="text-sm text-gray-600">{index + 1}</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex gap-3">
        <button type="button" onClick={handleFail} className="ios-btn h-14 flex-1 rounded-full bg-[#3A3A3C] text-base font-bold text-[#FF453A]">
          任务失败
        </button>
        <button type="button" onClick={handleSuccess} className="ios-btn h-14 flex-[2] rounded-full bg-white text-base font-bold text-black shadow-lg">
          完成，交给对方
        </button>
      </div>

      {notice && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-center text-sm font-bold text-white">
          {notice}
        </div>
      )}
    </div>
  );
}

export function PenaltyGridModeView({ players, themes, onBack }: PenaltyGridModeViewProps) {
  const [runId, setRunId] = useState(0);

  return (
    <div className="mobile-game-screen fixed inset-x-0 top-0 bottom-0 z-50 flex flex-col bg-black">
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#2b1010] via-black to-[#0d1724] opacity-90" />
      <div className="relative z-10 mx-auto flex h-full w-full max-w-[430px] flex-col">
        <header className="mobile-screen-header flex shrink-0 items-center gap-3 px-4 py-2">
          <button onClick={onBack} className="ios-btn flex h-10 w-10 items-center justify-center rounded-full border border-white/5 bg-white/10" aria-label="返回首页">
            <ArrowLeft className="text-white" size={20} />
          </button>
          <div className="flex-1 text-center">
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#FF453A]">Penalty Grid</div>
            <div className="mt-1 text-sm font-bold text-white">惩罚九宫格</div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center text-gray-500">
            <X size={22} />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 no-scrollbar">
          <PenaltyGridGame key={runId} players={players} themes={themes} onExit={onBack} />
          <button type="button" onClick={() => setRunId(value => value + 1)} className="ios-btn mx-auto mt-6 flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-xs font-bold text-gray-400">
            <RefreshCw size={13} />重新开始
          </button>
        </main>
      </div>
    </div>
  );
}
