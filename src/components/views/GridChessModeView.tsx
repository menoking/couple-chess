import { useMemo, useState } from 'react';
import { ArrowLeft, Flame, Grid3x3, RefreshCw, Skull, User, UserRound } from 'lucide-react';
import { Player, TaskCard, TaskEventData, Theme } from '../../types';
import { ThemeTaskEntry, buildTaskPool, createViewTaskEvent, pickRandom, shuffle, themeIntensity } from '../../utils/modeKit';
import { TaskCardModal } from '../modals/TaskCardModal';

interface GridChessModeViewProps {
  players: Player[];
  themes: Theme[];
  onBack: () => void;
}

const COLS = 5;
const ROWS = 4;
const TOTAL_CELLS = COLS * ROWS;

/** 每回合的格子争夺数量（奇数，保证每回合必有胜方）； Starter 逐轮交替。 */
const ROUND_PLAN = [3, 5, 7, 5];

interface Cell {
  entry: ThemeTaskEntry;
  level: number;
  owner: number | null;
  burnt: boolean;
}

function levelForCellsWon(cellsWon: number): number {
  return Math.max(2, Math.min(5, 1 + cellsWon));
}

function GridChessGame({ players, themes, onExit }: { players: Player[]; themes: Theme[]; onExit: () => void }) {
  const pool = useMemo(() => buildTaskPool(players, themes) ?? [], [players, themes]);

  const board = useMemo<Cell[]>(() => {
    const seen = new Set<string>();
    const unique: ThemeTaskEntry[] = [];
    for (const entry of pool) {
      const key = `${entry.task.text}__${entry.task.executor}__${entry.task.moveDelta}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(entry);
    }
    const picked: ThemeTaskEntry[] = [];
    while (picked.length < TOTAL_CELLS && unique.length > 0) {
      picked.push(...shuffle(unique).slice(0, TOTAL_CELLS - picked.length));
    }
    return picked.map(entry => ({
      entry,
      level: themeIntensity(themes.find(t => t.id === entry.themeId)),
      owner: null,
      burnt: false
    }));
  }, [pool, themes]);

  const [cells, setCells] = useState<Cell[]>(board);
  const [round, setRound] = useState(0);
  const [decisions, setDecisions] = useState(0);
  const [roundClaims, setRoundClaims] = useState<Array<{ playerId: number }>>([]);
  const [roundResult, setRoundResult] = useState<{ winnerId: number; cellsWon: number; loserId: number } | null>(null);
  const [taskData, setTaskData] = useState<TaskEventData | null>(null);
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const [roundsWon, setRoundsWon] = useState<Record<number, number>>({ 0: 0, 1: 0 });
  const [imposed, setImposed] = useState<Record<number, number>>({ 0: 0, 1: 0 });
  const [tieRound, setTieRound] = useState(false);
  const [finished, setFinished] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // 当前回合的出手方：Starter 逐轮交替，回合内轮流
  const starterId = round % 2 === 0 ? players[0]?.id : players[1]?.id;
  const claimerId = decisions % 2 === 0 ? starterId : players.find(p => p.id !== starterId)?.id ?? starterId;
  const claimer = players.find(p => p.id === claimerId) || players[0];
  const roundQuota = ROUND_PLAN[round] ?? 0;

  const drawLevelTask = (level: number): TaskCard | null => {
    const candidates = pool.filter(entry => themeIntensity(themes.find(t => t.id === entry.themeId)) >= level);
    const preferred = candidates.filter(entry => themeIntensity(themes.find(t => t.id === entry.themeId)) === level);
    const entry = pickRandom(preferred.length > 0 ? preferred : candidates);
    return entry ? entry.task : null;
  };

  const finishRound = (claims: Array<{ playerId: number }>) => {
    const first = claims.filter(c => c.playerId === players[0]?.id).length;
    const second = claims.filter(c => c.playerId === players[1]?.id).length;
    if (first === second) {
      setTieRound(true);
      return;
    }
    const winnerId = first > second ? players[0]?.id ?? 0 : players[1]?.id ?? 1;
    const loserId = winnerId === players[0]?.id ? players[1]?.id ?? 1 : players[0]?.id ?? 0;
    const cellsWon = Math.max(first, second);
    setRoundResult({ winnerId, cellsWon, loserId });
    setRoundsWon(prev => ({ ...prev, [winnerId]: (prev[winnerId] ?? 0) + 1 }));
  };

  const tapCell = (index: number) => {
    if (taskData || roundResult || finished) return;
    const cell = cells[index];
    if (!cell || cell.owner !== null || cell.burnt) return;
    setPendingIndex(index);
    setTaskData(createViewTaskEvent({ entry: cell.entry, title: '格子任务', executorPlayerId: claimerId }));
  };

  const resolveClaim = (accepted: boolean) => {
    if (pendingIndex === null) return;
    const nextCells = cells.map((cell, i) => {
      if (i !== pendingIndex) return cell;
      return accepted ? { ...cell, owner: claimerId } : { ...cell, burnt: true };
    });
    const nextDecisions = decisions + 1;
    const nextClaims = accepted ? [...roundClaims, { playerId: claimerId }] : roundClaims;

    setCells(nextCells);
    setTaskData(null);
    setPendingIndex(null);

    if (nextDecisions >= roundQuota) {
      finishRound(nextClaims);
      setDecisions(0);
      setRoundClaims([]);
      return;
    }
    setDecisions(nextDecisions);
    setRoundClaims(nextClaims);
  };

  const openImposedTask = () => {
    if (!roundResult) return;
    const level = levelForCellsWon(roundResult.cellsWon);
    const task = drawLevelTask(level);
    if (!task) {
      setNotice('题库中没有足够高尺度的任务，本回合作废');
      nextRound();
      return;
    }
    setTaskData(
      createViewTaskEvent({
        entry: { task, themeId: '', themeName: '尺度卡', playerId: roundResult.loserId },
        title: `尺度任务 · ${'★'.repeat(level)}`,
        executorPlayerId: roundResult.loserId
      })
    );
  };

  const resolveImposed = () => {
    if (roundResult) {
      setImposed(prev => ({ ...prev, [roundResult.loserId]: (prev[roundResult.loserId] ?? 0) + 1 }));
    }
    setTaskData(null);
    nextRound();
  };

  const nextRound = () => {
    setRoundResult(null);
    setTieRound(false);
    setNotice(null);
    if (round + 1 >= ROUND_PLAN.length) {
      setFinished(true);
      return;
    }
    setRound(value => value + 1);
    setDecisions(0);
    setRoundClaims([]);
  };

  if (finished) {
    const [first, second] = players;
    const a = roundsWon[first?.id ?? 0] ?? 0;
    const b = roundsWon[second?.id ?? 0] ?? 0;
    const winner = a === b ? null : a > b ? first : second;
    return (
      <div className="space-y-4">
        <div className="rounded-3xl border border-[#FFD60A]/25 bg-[#FFD60A]/10 p-6 text-center">
          <Grid3x3 size={36} className="mx-auto text-[#FFD60A]" />
          <div className="mt-3 text-xl font-bold text-white">
            {winner ? `${winner.name} 赢下更多回合！` : '势均力敌，平局！'}
          </div>
          <div className="mt-4 space-y-2">
            {players.map(player => (
              <div key={player.id} className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                <span className="text-sm font-bold" style={{ color: player.color }}>{player.name}</span>
                <span className="text-xs text-gray-400">
                  胜 {roundsWon[player.id] ?? 0} 回合 · 被罚 {imposed[player.id] ?? 0} 次
                </span>
              </div>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={onExit}
          className="ios-btn h-12 w-full rounded-full border border-white/10 bg-white/10 text-base font-bold text-white"
        >
          返回主页
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold text-gray-400">
          第 {round + 1} / {ROUND_PLAN.length} 回合 · 本轮抢 {roundQuota} 格
        </div>
        <div className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold">
          {players.map(player => (
            <span key={player.id} style={{ color: player.color }}>
              {player.name} 胜 {roundsWon[player.id] ?? 0}
            </span>
          ))}
        </div>
      </div>

      {roundResult ? (
        <div className="space-y-4">
          <div className="rounded-3xl border border-[#FF9F0A]/25 bg-[#FF9F0A]/10 p-6 text-center">
            <Flame size={36} className="mx-auto text-[#FF9F0A]" />
            <div className="mt-3 text-xl font-bold text-white">
              {players.find(p => p.id === roundResult.winnerId)?.name} 以 {roundResult.cellsWon} 格获胜！
            </div>
            <div className="mt-2 text-sm text-gray-400">
              {players.find(p => p.id === roundResult.loserId)?.name} 需完成{' '}
              {'★'.repeat(levelForCellsWon(roundResult.cellsWon))} 尺度任务
            </div>
          </div>
          <button
            type="button"
            onClick={openImposedTask}
            className="ios-btn h-14 w-full rounded-full bg-white text-base font-bold text-black shadow-lg"
          >
            查看尺度任务
          </button>
        </div>
      ) : tieRound ? (
        <div className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-6 text-center">
            <div className="text-lg font-bold text-white">本回合打平</div>
            <div className="mt-2 text-sm text-gray-400">双方抢到同样多的格子，无人获得尺度卡</div>
          </div>
          <button
            type="button"
            onClick={nextRound}
            className="ios-btn h-14 w-full rounded-full bg-white text-base font-bold text-black shadow-lg"
          >
            进入下一回合
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-center gap-2 rounded-2xl bg-white/5 py-3 text-sm font-bold text-white">
            {claimer?.id === 0 ? <User size={15} className="text-[#0A84FF]" /> : <UserRound size={15} className="text-[#FF375F]" />}
            {claimer?.name || '当前玩家'} 出手：完成任务占领格子
            <span className="text-[11px] font-normal text-gray-500">
              已完成 {decisions}/{roundQuota}
            </span>
          </div>

          <div className="grid grid-cols-5 gap-1.5">
            {cells.map((cell, index) => {
              const ownerPlayer = cell.owner !== null ? players.find(p => p.id === cell.owner) : undefined;
              return (
                <button
                  key={index}
                  type="button"
                  disabled={!!taskData || cell.owner !== null || cell.burnt}
                  onClick={() => tapCell(index)}
                  aria-label={ownerPlayer ? `${ownerPlayer.name}的格子` : cell.burnt ? '已废弃' : '可占领格子'}
                  className={`relative flex aspect-square items-center justify-center rounded-xl border transition-all ios-btn disabled:cursor-default ${
                    cell.burnt
                      ? 'border-white/5 bg-black/30'
                      : cell.owner !== null
                        ? 'border-white/10'
                        : 'border-white/10 bg-white/[0.04] active:bg-white/10'
                  }`}
                  style={
                    ownerPlayer
                      ? { backgroundColor: `${ownerPlayer.color}2E`, borderColor: `${ownerPlayer.color}66` }
                      : undefined
                  }
                >
                  {ownerPlayer ? (
                    <Grid3x3 size={14} style={{ color: ownerPlayer.color }} />
                  ) : cell.burnt ? (
                    <Skull size={13} className="text-gray-700" />
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 text-[11px] leading-relaxed text-gray-500">
            规则：每回合双方轮流抢格，完成任务即可占领（跳过则作废该格）。回合结束时抢到格子更多的一方获胜，可按胜出格数决定对方执行多大尺度的任务；格子越大尺度越高。共 {ROUND_PLAN.length} 回合。
          </div>

          {notice && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-center text-sm font-bold text-white">
              {notice}
            </div>
          )}
        </>
      )}

      <TaskCardModal
        isOpen={!!taskData}
        taskData={taskData}
        onAccept={() => (roundResult && pendingIndex === null ? resolveImposed() : resolveClaim(true))}
        onReject={() => (roundResult && pendingIndex === null ? resolveImposed() : resolveClaim(false))}
        onClose={() => (roundResult && pendingIndex === null ? resolveImposed() : resolveClaim(false))}
      />
    </div>
  );
}

export function GridChessModeView({ players, themes, onBack }: GridChessModeViewProps) {
  const [runId, setRunId] = useState(0);

  return (
    <div className="mobile-game-screen fixed inset-x-0 top-0 bottom-0 z-50 flex flex-col bg-black">
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#251f10] via-black to-[#0d1724] opacity-90" />

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
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#FFD60A]">Grid Chess</div>
            <div className="mt-1 text-sm font-bold text-white">格子棋 · 胜者定尺度</div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center text-gray-500">
            <Grid3x3 size={22} />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 no-scrollbar">
          <GridChessGame key={runId} players={players} themes={themes} onExit={onBack} />

          <button
            type="button"
            onClick={() => setRunId(value => value + 1)}
            className="ios-btn mx-auto mt-6 flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-xs font-bold text-gray-400"
          >
            <RefreshCw size={13} />重新开始
          </button>
        </main>
      </div>
    </div>
  );
}
