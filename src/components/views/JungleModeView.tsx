import { useModeState } from '../../rules/ModeRuntime';
import { useEffect, useMemo } from 'react';
import { ArrowLeft, PawPrint, RefreshCw, User, UserRound } from 'lucide-react';
import { Player, Theme } from '../../types';
import { buildTaskPool, createViewTaskEvent, pickRandom } from '../../utils/modeKit';
import {
  PIECE_NAMES,
  JungleBoard,
  applyMove,
  cellMeta,
  createJungleBoard,
  getLegalMoves
} from '../../utils/jungle';
import { TaskCardModal } from '../modals/TaskCardModal';
import { DiceRollOff } from '../DiceRollOff';

interface JungleModeViewProps {
  players: Player[];
  themes: Theme[];
  currentTurn: number;
  onBack: () => void;
}

type Phase = 'roll' | 'play' | 'over';

interface PendingCard {
  drawerId: number;
  executorId: number;
  reason: string;
}

function JungleGame({
  players,
  themes,
  currentTurn
}: {
  players: Player[];
  themes: Theme[];
  currentTurn: number;
}) {
  const pool = useMemo(() => buildTaskPool(players, themes) ?? [], [players, themes]);

  const [phase, setPhase] = useModeState<Phase>('JungleModeView.phase', 'roll');
  const [board, setBoard] = useModeState<JungleBoard>('JungleModeView.board', () => createJungleBoard());
  const [turn, setTurn] = useModeState('JungleModeView.turn', currentTurn === 1 ? 1 : 0);
  const [selected, setSelected] = useModeState<number | null>('JungleModeView.selected', null);
  const [lastMove, setLastMove] = useModeState<{ from: number; to: number } | null>('JungleModeView.lastMove', null);
  const [captured, setCaptured] = useModeState<Record<number, number>>('JungleModeView.captured', { 0: 0, 1: 0 });
  const [winnerId, setWinnerId] = useModeState<number | null>('JungleModeView.winnerId', null);
  const [notice, setNotice] = useModeState<string | null>('JungleModeView.notice', null);

  const [cardQueue, setCardQueue] = useModeState<PendingCard[]>('JungleModeView.cardQueue', []);
  const [taskData, setTaskData] = useModeState<ReturnType<typeof createViewTaskEvent> | null>('JungleModeView.taskData', null);

  const activePlayer = players[turn] ?? players[0];
  const opponentId = turn === 0 ? 1 : 0;
  const legalMoves = useMemo(
    () => (selected === null ? [] : getLegalMoves(board, selected)),
    [board, selected]
  );

  useEffect(() => {
    if (taskData || cardQueue.length === 0) return;
    const [next, ...rest] = cardQueue;
    const entry = pickRandom(pool);
    setCardQueue(rest);
    if (!entry) return;
    setTaskData(
      createViewTaskEvent({
        entry,
        title: next.reason,
        executorPlayerId: next.executorId,
        initiatorPlayerId: next.drawerId
      })
    );
  }, [cardQueue, taskData, pool]);

  const enqueueCards = (drawerId: number, executorId: number, count: number, reason: string) => {
    setCardQueue(prev => [
      ...prev,
      ...Array.from({ length: count }, () => ({ drawerId, executorId, reason }))
    ]);
  };

  const endGame = (winner: number, reason: string) => {
    setWinnerId(winner);
    setPhase('over');
    setNotice(reason);
    const loser = winner === 0 ? 1 : 0;
    enqueueCards(winner, loser, 1, '终局 · 胜方抽卡，败方执行');
  };

  const handleCellClick = (cellIndex: number) => {
    if (phase !== 'play' || taskData) return;
    const piece = board[cellIndex];

    if (piece && piece.owner === turn) {
      setSelected(prev => (prev === cellIndex ? null : cellIndex));
      return;
    }

    if (selected === null) return;

    const result = applyMove(board, selected, cellIndex);
    if (!result) {
      setNotice('这一步走不了');
      window.setTimeout(() => setNotice(null), 1100);
      return;
    }

    setBoard(result.board);
    setLastMove({ from: selected, to: cellIndex });
    setSelected(null);

    if (result.captured) {
      const rank = result.captured.rank;
      setCaptured(prev => ({ ...prev, [turn]: (prev[turn] ?? 0) + 1 }));
      // 吃掉对方棋子 → 抽一张卡，由被吃的一方执行
      enqueueCards(turn, opponentId, 1, `吃掉对方的${PIECE_NAMES[rank]} · 对方执行`);
    }

    if (result.winner !== null) {
      endGame(result.winner, result.winner === turn ? '你攻入兽穴，获胜' : '对方棋子被吃光，获胜');
      return;
    }

    setTurn(opponentId);
  };

  const startGame = (firstPlayerId: number) => {
    setBoard(createJungleBoard());
    setTurn(firstPlayerId === 1 ? 1 : 0);
    setSelected(null);
    setLastMove(null);
    setCaptured({ 0: 0, 1: 0 });
    setWinnerId(null);
    setNotice(null);
    setCardQueue([]);
    setPhase('play');
  };

  if (phase === 'roll') {
    return (
      <DiceRollOff
        stateKey="Jungle"
        players={players}
        title="掷骰定先手"
        hint="点数大的一方先走，先手更容易抢到中路"
        confirmLabel="确认，我先走"
        onComplete={startGame}
      />
    );
  }

  if (phase === 'over') {
    const winner = players.find(player => player.id === winnerId);

    return (
      <div className="space-y-4">
        <div className="rounded-3xl border border-[#FFD60A]/30 bg-[#FFD60A]/10 p-6 text-center">
          <PawPrint size={34} className="mx-auto text-[#FFD60A]" />
          <div className="mt-3 text-xl font-bold text-white">{winner?.name} 获胜</div>
          <div className="mt-1 text-xs text-gray-500">{notice}</div>
          <div className="mt-4 space-y-2">
            {players.map(player => (
              <div key={player.id} className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                <span className="text-sm font-bold" style={{ color: player.color }}>{player.name}</span>
                <span className="text-sm font-bold text-white">吃掉 {captured[player.id] ?? 0} 子</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center text-[11px] text-gray-500">
          剩余抽卡 {cardQueue.length} 张，会依次弹出
        </div>

        <TaskCardModal
        players={players}
          isOpen={!!taskData}
          taskData={taskData}
          onAccept={() => setTaskData(null)}
          onReject={() => setTaskData(null)}
          onClose={() => setTaskData(null)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold text-gray-400">
          吃子 {captured[turn] ?? 0} · 被吃 {captured[opponentId] ?? 0}
        </div>
        <div className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold text-[#FFD60A]">
          每吃一子抽一张卡
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 rounded-2xl bg-white/5 py-2.5 text-sm font-bold text-white">
        {activePlayer?.id === 0 ? <User size={15} className="text-[#0A84FF]" /> : <UserRound size={15} className="text-[#FF375F]" />}
        {activePlayer?.name} 走棋
      </div>

      <div className="grid grid-cols-7 overflow-hidden rounded-2xl border border-white/10">
        {board.map((piece, cellIndex) => {
          const meta = cellMeta(cellIndex);
          const isSelected = selected === cellIndex;
          const isLegal = legalMoves.includes(cellIndex);
          const isLast = lastMove?.to === cellIndex;
          const owner = piece ? players.find(player => player.id === piece.owner) : undefined;

          return (
            <button
              key={cellIndex}
              type="button"
              onClick={() => handleCellClick(cellIndex)}
              disabled={!!taskData}
              className={`jungle-cell relative flex aspect-square items-center justify-center border-l border-t border-white/[0.06] ${
                meta.water ? 'bg-[#0A84FF]/15' : meta.trap ? 'bg-[#FF9F0A]/12' : meta.den ? 'bg-[#FFD60A]/15' : 'bg-white/[0.02]'
              }`}
            >
              {meta.den && !piece && (
                <span className="absolute text-[9px] font-bold text-[#FFD60A]/70">穴</span>
              )}
              {meta.trap && !piece && (
                <span className="absolute text-[9px] font-bold text-[#FF9F0A]/60">陷</span>
              )}

              {piece && owner && (
                <span
                  className="flex h-[80%] w-[80%] items-center justify-center rounded-full text-[13px] font-bold text-white"
                  style={{
                    backgroundColor: owner.color,
                    boxShadow: isSelected
                      ? '0 0 0 2px rgba(255,255,255,0.85)'
                      : isLast
                        ? '0 0 0 2px rgba(255,214,10,0.7)'
                        : 'inset 0 -2px 3px rgba(0,0,0,0.25)'
                  }}
                >
                  {PIECE_NAMES[piece.rank]}
                </span>
              )}

              {isLegal && !piece && (
                <span className="absolute h-2 w-2 rounded-full bg-white/45" />
              )}
              {isLegal && piece && (
                <span className="pointer-events-none absolute inset-1 rounded-full border-2 border-[#FF453A]/70" />
              )}
            </button>
          );
        })}
      </div>

      {notice && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-2.5 text-center text-[11px] font-bold text-white">
          {notice}
        </div>
      )}

      <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-3 text-[10px] leading-relaxed text-gray-500">
        鼠1 猫2 狗3 狼4 豹5 虎6 狮7 象8，大吃小；鼠能吃象、象吃不了鼠。只有鼠能下水，水里鼠与陆地互不相吃。狮虎可跳过整段水域（水中有鼠则跳不过）。走进对方陷阱的棋子可被任意棋子吃掉。进入对方兽穴即获胜。
      </div>

      <TaskCardModal
        players={players}
        isOpen={!!taskData}
        taskData={taskData}
        onAccept={() => setTaskData(null)}
        onReject={() => setTaskData(null)}
        onClose={() => setTaskData(null)}
      />
    </div>
  );
}

export function JungleModeView({ players, themes, currentTurn, onBack }: JungleModeViewProps) {
  const [runId, setRunId] = useModeState('JungleModeView.runId', 0);

  return (
    <div className="mobile-game-screen fixed inset-x-0 top-0 bottom-0 z-50 flex flex-col bg-black">
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#131b12] via-black to-[#0d1724] opacity-90" />
      <div className="relative z-10 mx-auto flex h-full w-full max-w-[430px] flex-col">
        <header className="mobile-screen-header flex shrink-0 items-center gap-3 px-4 py-2">
          <button onClick={onBack} className="ios-btn flex h-10 w-10 items-center justify-center rounded-full border border-white/5 bg-white/10" aria-label="返回首页">
            <ArrowLeft className="text-white" size={20} />
          </button>
          <div className="flex-1 text-center">
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#FFD60A]">Jungle Chess</div>
            <div className="mt-1 text-sm font-bold text-white">斗兽棋</div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center text-gray-500">
            <PawPrint size={22} />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-3 no-scrollbar">
          <JungleGame key={runId} players={players} themes={themes} currentTurn={currentTurn} />
          <button type="button" onClick={() => setRunId(value => value + 1)} className="ios-btn mx-auto mt-5 flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-xs font-bold text-gray-400">
            <RefreshCw size={13} />重新开局
          </button>
        </main>
      </div>
    </div>
  );
}
