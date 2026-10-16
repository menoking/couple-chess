import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Brain, Check, RefreshCw, User, UserRound } from 'lucide-react';
import { Player, TaskCard, Theme } from '../../types';
import { ThemeTaskEntry, buildTaskPool, shuffle } from '../../utils/modeKit';

interface MemoryModeViewProps {
  players: Player[];
  themes: Theme[];
  currentTurn: number;
  onEndTurn: () => void;
  onBack: () => void;
}

const MAX_PAIRS = 8;
const MISMATCH_DELAY = 900;

interface Tile {
  pairId: number;
  task: TaskCard;
  themeId: string;
  themeName: string;
  ownerId: number;
  flipped: boolean;
  matchedBy: number | null;
}

function MemoryGame({
  players,
  themes,
  currentTurn,
  onEndTurn,
  onExit
}: {
  players: Player[];
  themes: Theme[];
  currentTurn: number;
  onEndTurn: () => void;
  onExit: () => void;
}) {
  const pool = useMemo(() => buildTaskPool(players, themes) ?? [], [players, themes]);
  const tiles = useMemo<Tile[]>(() => {
    const seen = new Set<string>();
    const unique: ThemeTaskEntry[] = [];
    for (const entry of pool) {
      const key = `${entry.task.text}__${entry.task.executor}__${entry.task.moveDelta}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(entry);
    }
    const pairs = shuffle(unique).slice(0, MAX_PAIRS);
    const deck: Tile[] = [];
    pairs.forEach((entry, pairId) => {
      deck.push({ pairId, task: entry.task, themeId: entry.themeId, themeName: entry.themeName, ownerId: entry.playerId, flipped: false, matchedBy: null });
      deck.push({ pairId, task: entry.task, themeId: entry.themeId, themeName: entry.themeName, ownerId: entry.playerId, flipped: false, matchedBy: null });
    });
    return shuffle(deck);
  }, [pool]);

  const [board, setBoard] = useState<Tile[]>(tiles);
  const [flips, setFlips] = useState<number[]>([]);
  const [locked, setLocked] = useState(false);
  const [matchNotice, setMatchNotice] = useState<{ task: TaskCard; themeName: string; byId: number } | null>(null);
  const [pairCounts, setPairCounts] = useState<Record<number, number>>({ 0: 0, 1: 0 });
  const [finished, setFinished] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  const totalPairs = tiles.length / 2;
  const foundPairs = board.filter(tile => tile.matchedBy !== null).length / 2;
  const activePlayer = players[currentTurn] || players[0];

  const flipTile = (index: number) => {
    if (locked || finished) return;
    const tile = board[index];
    if (!tile || tile.flipped || tile.matchedBy !== null) return;
    if (flips.length >= 2) return;

    const nextFlips = [...flips, index];
    setBoard(prev => prev.map((item, i) => (i === index ? { ...item, flipped: true } : item)));
    setFlips(nextFlips);
    setMatchNotice(null);

    if (nextFlips.length < 2) return;

    const [first, second] = nextFlips;
    if (board[first].pairId === board[second].pairId) {
      const matched = board[first];
      const byId = activePlayer?.id ?? 0;
      setBoard(prev =>
        prev.map((item, i) =>
          i === first || i === second ? { ...item, matchedBy: byId } : item
        )
      );
      setPairCounts(prev => ({ ...prev, [byId]: (prev[byId] ?? 0) + 1 }));
      setMatchNotice({ task: matched.task, themeName: matched.themeName, byId });
      setFlips([]);
      if (foundPairs + 1 >= totalPairs) {
        setFinished(true);
        setMatchNotice(null);
      }
      return;
    }

    setLocked(true);
    timerRef.current = window.setTimeout(() => {
      setBoard(prev => prev.map((item, i) => (i === first || i === second ? { ...item, flipped: false } : item)));
      setFlips([]);
      setLocked(false);
      onEndTurn();
    }, MISMATCH_DELAY);
  };

  if (finished) {
    return (
      <div className="rounded-3xl border border-[#FFD60A]/25 bg-[#FFD60A]/10 p-6 text-center">
        <Brain size={36} className="mx-auto text-[#FFD60A]" />
        <div className="mt-3 text-xl font-bold text-white">全部配对完成！</div>
        <div className="mt-3 space-y-1 text-sm text-gray-400">
          {players.map(player => (
            <div key={player.id}>
              <span style={{ color: player.color }}>{player.name}</span> 找到 {pairCounts[player.id] ?? 0} 对
            </div>
          ))}
        </div>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onExit}
            className="ios-btn h-12 flex-1 rounded-full border border-white/10 bg-white/10 text-base font-bold text-white"
          >
            返回主页
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold text-gray-400">
          已配对 {foundPairs} / {totalPairs} 对
        </div>
        <div className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold">
          {players.map(player => (
            <span key={player.id} style={{ color: player.color }}>
              {player.name} {pairCounts[player.id] ?? 0}
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 rounded-2xl bg-white/5 py-3 text-sm font-bold text-white">
        {activePlayer?.id === 0 ? <User size={15} className="text-[#0A84FF]" /> : <UserRound size={15} className="text-[#FF375F]" />}
        {activePlayer?.name || '当前玩家'} 的回合：翻开两张相同的任务卡
      </div>

      <div className="grid grid-cols-4 gap-2">
        {board.map((tile, index) => {
          const isOpen = tile.flipped || tile.matchedBy !== null;
          const matchedPlayer = tile.matchedBy !== null ? players.find(p => p.id === tile.matchedBy) : undefined;
          return (
            <button
              key={index}
              type="button"
              disabled={isOpen || locked}
              onClick={() => flipTile(index)}
              aria-label={isOpen ? tile.task.text : '未翻开的卡片'}
              className={`relative flex aspect-[4/5] flex-col items-center justify-center gap-1 rounded-2xl border p-1.5 transition-all ios-btn disabled:cursor-default ${
                tile.matchedBy !== null
                  ? 'border-white/10 bg-black/40'
                  : tile.flipped
                    ? 'border-white/30 bg-white/10'
                    : tile.ownerId === 0
                      ? 'border-[#0A84FF]/40 bg-[#0A84FF]/15'
                      : 'border-[#FF375F]/40 bg-[#FF375F]/15'
              }`}
            >
              {isOpen ? (
                tile.matchedBy !== null ? (
                  <>
                    <Check size={18} strokeWidth={3} style={{ color: matchedPlayer?.color }} />
                    <span className="text-[8px] font-bold" style={{ color: matchedPlayer?.color }}>
                      {matchedPlayer?.name}
                    </span>
                  </>
                ) : (
                  <span className="px-1 text-[9px] font-bold leading-tight text-white line-clamp-4">
                    {tile.task.text}
                  </span>
                )
              ) : (
                <Brain size={16} className="text-gray-600" />
              )}
            </button>
          );
        })}
      </div>

      {matchNotice && (
        <div className="rounded-3xl border border-[#30D158]/25 bg-[#30D158]/10 p-5">
          <div className="flex items-center gap-2 text-xs font-bold text-[#30D158]">
            <Check size={15} />配对成功 · {matchNotice.themeName}
          </div>
          <div className="mt-2 text-sm leading-relaxed text-white">{matchNotice.task.text}</div>
          <div className="mt-2 text-[11px] text-gray-500">
            任务已由 {players.find(p => p.id === matchNotice.byId)?.name || '当前玩家'} 收下，继续翻牌
          </div>
        </div>
      )}
    </div>
  );
}

export function MemoryModeView({ players, themes, currentTurn, onEndTurn, onBack }: MemoryModeViewProps) {
  const [runId, setRunId] = useState(0);

  return (
    <div className="mobile-game-screen fixed inset-x-0 top-0 bottom-0 z-50 flex flex-col bg-black">
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#12211f] via-black to-[#0d1724] opacity-90" />

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
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#30D158]">Couple Memory</div>
            <div className="mt-1 text-sm font-bold text-white">记忆翻牌 · 配对任务</div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center text-gray-500">
            <Brain size={22} />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 no-scrollbar">
          <MemoryGame key={runId} players={players} themes={themes} currentTurn={currentTurn} onEndTurn={onEndTurn} onExit={onBack} />

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
