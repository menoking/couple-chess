import { useModeState, useMyTurn } from '../../rules/ModeRuntime';
import { useEffect, useMemo } from 'react';
import { ArrowLeft, CircleDot, Flag, RefreshCw, User, UserRound } from 'lucide-react';
import { Player, Theme } from '../../types';
import { buildTaskPool, createViewTaskEvent, pickRandom } from '../../utils/modeKit';
import { GoBoard, createGoBoard, playMove, scoreGoBoard } from '../../utils/go';
import { TaskCardModal } from '../modals/TaskCardModal';
import { DiceRollOff } from '../DiceRollOff';

interface GoModeViewProps {
  players: Player[];
  themes: Theme[];
  currentTurn: number;
  onBack: () => void;
}

/** 每提满 3 子可抽 1 张卡 */
const CAPTURE_PER_CARD = 3;
/** 终局抽卡数：胜方抽 2 张，全部由败方执行 */
const WINNER_CARDS = 2;

type Phase = 'roll' | 'play' | 'over';

/** 九路棋盘星位（0 基坐标） */
const STAR_POINTS = new Set([2 * 9 + 2, 2 * 9 + 6, 6 * 9 + 2, 6 * 9 + 6, 4 * 9 + 4]);

interface PendingCard {
  drawerId: number;
  executorId: number;
  reason: string;
}

function GoGame({ players, themes, currentTurn }: { players: Player[]; themes: Theme[]; currentTurn: number }) {
  const pool = useMemo(() => buildTaskPool(players, themes) ?? [], [players, themes]);

  const [board, setBoard] = useModeState<GoBoard>('GoModeView.board', () => createGoBoard());
  const [turn, setTurn] = useModeState('GoModeView.turn', currentTurn === 1 ? 1 : 0);
  const canAct = useMyTurn(turn);
  const [koKey, setKoKey] = useModeState<string | null>('GoModeView.koKey', null);
  const [lastMove, setLastMove] = useModeState<number | null>('GoModeView.lastMove', null);
  const [captures, setCaptures] = useModeState<Record<number, number>>('GoModeView.captures', { 0: 0, 1: 0 });
  const [passes, setPasses] = useModeState('GoModeView.passes', 0);
  const [phase, setPhase] = useModeState<Phase>('GoModeView.phase', 'roll');
  const [surrenderedBy, setSurrenderedBy] = useModeState<number | null>('GoModeView.surrenderedBy', null);
  const [notice, setNotice] = useModeState<string | null>('GoModeView.notice', null);

  const [cardQueue, setCardQueue] = useModeState<PendingCard[]>('GoModeView.cardQueue', []);
  const [taskData, setTaskData] = useModeState<ReturnType<typeof createViewTaskEvent> | null>('GoModeView.taskData', null);

  const activePlayer = players[turn] ?? players[0];
  const score = useMemo(() => scoreGoBoard(board), [board]);

  // 依次弹出队列里的抽卡
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

  const handlePlace = (index: number) => {
    if (!canAct) return;
    if (phase !== 'play' || taskData) return;

    const result = playMove(board, index, turn, koKey);
    if (!result) {
      setNotice(index >= 0 && board[index] !== null ? null : '这里不能落子（禁入点或打劫）');
      window.setTimeout(() => setNotice(null), 1200);
      return;
    }

    setBoard(result.board);
    setKoKey(result.koKey);
    setLastMove(index);
    setPasses(0);
    setNotice(null);

    if (result.captured > 0) {
      const before = captures[turn] ?? 0;
      const after = before + result.captured;
      setCaptures(prev => ({ ...prev, [turn]: after }));

      const gained = Math.floor(after / CAPTURE_PER_CARD) - Math.floor(before / CAPTURE_PER_CARD);
      if (gained > 0) {
        enqueueCards(turn, turn === 0 ? 1 : 0, gained, `提子奖励 · 对方执行`);
      }
    }

    setTurn(turn === 0 ? 1 : 0);
  };

  const endGame = (surrenderId: number | null) => {
    setSurrenderedBy(surrenderId);
    setPhase('over');

    const finalScore = scoreGoBoard(board);
    const [a, b] = [finalScore.area[0], finalScore.area[1]];
    let winnerId: number;
    if (surrenderId !== null) {
      winnerId = surrenderId === 0 ? 1 : 0;
    } else {
      winnerId = a === b ? (captures[0] >= captures[1] ? 0 : 1) : a > b ? 0 : 1;
    }
    const loserId = winnerId === 0 ? 1 : 0;

    enqueueCards(winnerId, loserId, WINNER_CARDS, '终局 · 胜方抽卡，败方执行');
  };

  const handlePass = () => {
    if (!canAct) return;
    if (phase !== 'play' || taskData) return;
    const nextPasses = passes + 1;
    setPasses(nextPasses);
    setKoKey(null);
    if (nextPasses >= 2) {
      endGame(null);
      return;
    }
    setTurn(turn === 0 ? 1 : 0);
  };

  if (phase === 'roll') {
    return (
      <DiceRollOff
        stateKey="Go"
        players={players}
        title="掷骰定先手"
        hint="点数大的一方先落子，围棋先手更占优势"
        confirmLabel="确认，我先手"
        onComplete={winnerId => {
          setTurn(winnerId === 1 ? 1 : 0);
          setPhase('play');
        }}
      />
    );
  }

  if (phase === 'over') {
    const winnerId = surrenderedBy !== null
      ? (surrenderedBy === 0 ? 1 : 0)
      : (score.area[0] === score.area[1]
        ? ((captures[0] ?? 0) >= (captures[1] ?? 0) ? 0 : 1)
        : (score.area[0] > score.area[1] ? 0 : 1));
    const winner = players.find(player => player.id === winnerId);

    return (
      <div className="space-y-4">
        <div className="rounded-3xl border border-[#FFD60A]/30 bg-[#FFD60A]/10 p-6 text-center">
          <Flag size={34} className="mx-auto text-[#FFD60A]" />
          <div className="mt-3 text-xl font-bold text-white">
            {surrenderedBy !== null ? `${players.find(p => p.id === surrenderedBy)?.name} 认输` : '终局数子'}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            胜方抽 {WINNER_CARDS} 张卡，全部由败方执行
          </div>
        </div>

        <div className="space-y-2">
          {players.map(player => (
            <div key={player.id} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-bold" style={{ color: player.color }}>
                  {player.name}
                  {player.id === winnerId && <span className="ml-1.5 text-[10px] text-[#FFD60A]">胜</span>}
                </span>
                <span className="text-lg font-bold text-white">{score.area[player.id] ?? 0} 目</span>
              </div>
              <div className="mt-1 text-[11px] text-gray-500">
                子 {score.stones[player.id] ?? 0} · 地 {score.territory[player.id] ?? 0} · 提子 {captures[player.id] ?? 0}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-[11px] leading-relaxed text-gray-500">
          {winner?.name} 拿下本局。抽卡队列里还剩 {cardQueue.length} 张，会依次弹出。
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold text-gray-400">
          提子 你 {captures[turn] ?? 0} · 对方 {captures[turn === 0 ? 1 : 0] ?? 0}
        </div>
        <div className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold text-[#64D2FF]">
          再提 {CAPTURE_PER_CARD - ((captures[turn] ?? 0) % CAPTURE_PER_CARD)} 子可抽卡
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 rounded-2xl bg-white/5 py-3 text-sm font-bold text-white">
        {activePlayer?.id === 0 ? <User size={15} className="text-[#0A84FF]" /> : <UserRound size={15} className="text-[#FF375F]" />}
        {activePlayer?.name || '当前玩家'} 落子
        {passes === 1 && <span className="text-[10px] text-[#FF9F0A]">·对方已停一手</span>}
      </div>

      <div className={`go-board grid grid-cols-9 overflow-hidden rounded-2xl border transition-opacity ${canAct ? '' : 'pointer-events-none opacity-60'}`}>
        {board.map((value, index) => {
          const owner = value !== null ? players.find(player => player.id === value) : undefined;
          const isLast = lastMove === index;

          return (
            <button
              key={index}
              type="button"
              onClick={() => handlePlace(index)}
              disabled={!!taskData}
              className="go-line relative flex aspect-square items-center justify-center border-l border-t"
            >
              {!owner && STAR_POINTS.has(index) && (
                <span className="absolute h-[13%] w-[13%] rounded-full bg-current opacity-20" />
              )}
              {owner && (
                <span
                  className="h-[76%] w-[76%] rounded-full"
                  style={{
                    backgroundColor: owner.color,
                    boxShadow: isLast
                      ? '0 0 0 2px rgba(255, 214, 10, 0.7)'
                      : 'inset 0 -2px 3px rgba(0, 0, 0, 0.25), 0 1px 2px rgba(0, 0, 0, 0.2)'
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {notice && (
        <div className="rounded-2xl border border-[#FF453A]/30 bg-[#FF453A]/10 p-3 text-center text-xs font-bold text-[#FF7A96]">
          {notice}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => endGame(turn)}
          className="ios-btn h-12 flex-1 rounded-full bg-[#3A3A3C] text-sm font-bold text-[#FF453A]"
        >
          认输
        </button>
        <button
          type="button"
          onClick={handlePass}
          className="ios-btn h-12 flex-1 rounded-full bg-white/10 text-sm font-bold text-white"
        >
          停一手
        </button>
      </div>

      <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 text-[11px] leading-relaxed text-gray-500">
        规则：轮流落子，围住对方的棋即提子。每提满 {CAPTURE_PER_CARD} 子，你抽 1 张卡、由对方执行；双方连续停手后数子（子 + 围空），胜方抽 {WINNER_CARDS} 张，全部由败方执行。
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

export function GoModeView({ players, themes, currentTurn, onBack }: GoModeViewProps) {
  const [runId, setRunId] = useModeState('GoModeView.runId', 0);

  return (
    <div className="mobile-game-screen fixed inset-x-0 top-0 bottom-0 z-50 flex flex-col bg-black">
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#1a1408] via-black to-[#0d1724] opacity-90" />
      <div className="relative z-10 mx-auto flex h-full w-full max-w-[430px] flex-col">
        <header className="mobile-screen-header flex shrink-0 items-center gap-3 px-4 py-2">
          <button onClick={onBack} className="ios-btn flex h-10 w-10 items-center justify-center rounded-full border border-white/5 bg-white/10" aria-label="返回首页">
            <ArrowLeft className="text-white" size={20} />
          </button>
          <div className="flex-1 text-center">
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#FFD60A]">9×9 Go</div>
            <div className="mt-1 text-sm font-bold text-white">九路围棋</div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center text-gray-500">
            <CircleDot size={22} />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 no-scrollbar">
          <GoGame key={runId} players={players} themes={themes} currentTurn={currentTurn} />
          <button type="button" onClick={() => setRunId(value => value + 1)} className="ios-btn mx-auto mt-6 flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-xs font-bold text-gray-400">
            <RefreshCw size={13} />重新开局
          </button>
        </main>
      </div>
    </div>
  );
}
