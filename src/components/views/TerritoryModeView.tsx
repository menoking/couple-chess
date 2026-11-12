import { useModeState } from '../../rules/ModeRuntime';
import { useMemo } from 'react';
import { ArrowLeft, Flag, RefreshCw, Swords, User, UserRound } from 'lucide-react';
import { Player, TaskEventData, Theme } from '../../types';
import { ThemeTaskEntry, buildTaskPool, collectThemeTasks, createViewTaskEvent, pickRandom } from '../../utils/modeKit';
import { TaskCardModal } from '../modals/TaskCardModal';

interface TerritoryModeViewProps {
  players: Player[];
  themes: Theme[];
  currentTurn: number;
  onEndTurn: () => void;
  onBack: () => void;
}

const GRID = 5;
const TOTAL_CELLS = GRID * GRID;

type ActionKind = 'claim' | 'attack';

function TerritoryGame({
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
  const activePlayer = players[currentTurn] || players[0];
  const opponent = players.find(p => p.id !== activePlayer?.id) || players[1];
  const [owners, setOwners] = useModeState<Array<number | null>>('TerritoryModeView.owners', () => new Array(TOTAL_CELLS).fill(null));
  const [taskData, setTaskData] = useModeState<TaskEventData | null>('TerritoryModeView.taskData', null);
  const [pendingIndex, setPendingIndex] = useModeState<number | null>('TerritoryModeView.pendingIndex', null);
  const [notice, setNotice] = useModeState<string | null>('TerritoryModeView.notice', null);

  const pool = useMemo(() => buildTaskPool(players, themes) ?? [], [players, themes]);

  const myCells = owners.filter(owner => owner === activePlayer?.id).length;
  const enemyCells = owners.filter(owner => owner !== null && owner !== activePlayer?.id).length;
  const emptyCells = TOTAL_CELLS - myCells - enemyCells;

  const isAttackable = (index: number) => {
    const owner = owners[index];
    if (owner === null || owner === activePlayer?.id) return false;
    const r = Math.floor(index / GRID);
    const c = index % GRID;
    const neighbors = [
      r > 0 ? index - GRID : -1,
      r < GRID - 1 ? index + GRID : -1,
      c > 0 ? index - 1 : -1,
      c < GRID - 1 ? index + 1 : -1
    ];
    return neighbors.some(n => n >= 0 && owners[n] === activePlayer?.id);
  };

  const tapCell = (index: number) => {
    if (taskData) return;
    const owner = owners[index];
    if (owner === activePlayer?.id) return;
    const kind: ActionKind = owner === null ? 'claim' : 'attack';
    if (kind === 'attack' && !isAttackable(index)) {
      setNotice('只能攻打量相邻的敌方领地');
      return;
    }

    const sourceEntries: ThemeTaskEntry[] =
      kind === 'claim'
        ? collectThemeTasks(players.filter(p => p.id === activePlayer?.id), themes)
        : collectThemeTasks(players.filter(p => p.id !== activePlayer?.id), themes);
    const entry = pickRandom(sourceEntries.length > 0 ? sourceEntries : pool);
    if (!entry) {
      setNotice('当前没有可用任务');
      return;
    }

    setNotice(null);
    setPendingIndex(index);
    setTaskData(createViewTaskEvent({ entry, title: kind === 'claim' ? '占领任务 · 自己执行' : '攻城任务 · 自己执行', executorPlayerId: activePlayer?.id ?? 0, initiatorPlayerId: activePlayer?.id ?? 0 }));
  };

  const resolve = (accepted: boolean) => {
    if (pendingIndex === null) return;
    if (accepted) {
      const wasEnemy = owners[pendingIndex] !== null;
      setOwners(prev => prev.map((owner, i) => (i === pendingIndex ? activePlayer?.id ?? null : owner)));
      setNotice(wasEnemy ? '攻城成功，领地易主！' : '占领成功！');
    } else {
      setNotice('任务跳过，领地未变化');
    }
    setTaskData(null);
    setPendingIndex(null);
    onEndTurn();
  };

  if (emptyCells === 0) {
    const winner = myCells === enemyCells ? null : myCells > enemyCells ? activePlayer : opponent;
    return (
      <div className="space-y-4">
        <div className="rounded-3xl border border-[#FFD60A]/25 bg-[#FFD60A]/10 p-6 text-center">
          <Flag size={36} className="mx-auto text-[#FFD60A]" />
          <div className="mt-3 text-xl font-bold text-white">
            {winner ? `${winner.name} 拿下更多领地！` : '势均力敌，平分秋色！'}
          </div>
          <div className="mt-4 space-y-2">
            {players.map(player => {
              const count = owners.filter(owner => owner === player.id).length;
              return (
                <div key={player.id} className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                  <span className="text-sm font-bold" style={{ color: player.color }}>{player.name}</span>
                  <span className="text-lg font-bold text-white">{count} 块领地</span>
                </div>
              );
            })}
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
          剩余 {emptyCells} 块无主领地
        </div>
        <div className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold">
          {players.map(player => (
            <span key={player.id} style={{ color: player.color }}>
              {player.name} {owners.filter(owner => owner === player.id).length}
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 rounded-2xl bg-white/5 py-3 text-sm font-bold text-white">
        {activePlayer?.id === 0 ? <User size={15} className="text-[#0A84FF]" /> : <UserRound size={15} className="text-[#FF375F]" />}
        {activePlayer?.name || '当前玩家'} 的回合
        <span className="text-[11px] font-normal text-gray-500">占领空格，或攻打量相邻的敌方领地</span>
      </div>

      <div className="grid grid-cols-5 gap-1.5">
        {owners.map((owner, index) => {
          const ownerPlayer = owner !== null ? players.find(p => p.id === owner) : undefined;
          const attackable = owner !== null && owner !== activePlayer?.id && isAttackable(index);
          return (
            <button
              key={index}
              type="button"
              disabled={!!taskData || owner === activePlayer?.id}
              onClick={() => tapCell(index)}
              aria-label={
                ownerPlayer
                  ? `${ownerPlayer.name}的领地${attackable ? '，可攻城' : ''}`
                  : '无主领地'
              }
              className={`relative flex aspect-square items-center justify-center rounded-xl border transition-all ios-btn disabled:cursor-default ${
                ownerPlayer
                  ? attackable
                    ? 'border-dashed border-[#FFD60A]/70 bg-white/[0.06]'
                    : 'border-white/10'
                  : 'border-white/10 bg-white/[0.04] active:bg-white/10'
              }`}
              style={
                ownerPlayer
                  ? { backgroundColor: `${ownerPlayer.color}2E`, borderColor: attackable ? undefined : `${ownerPlayer.color}66` }
                  : undefined
              }
            >
              {ownerPlayer ? (
                <Flag size={15} style={{ color: ownerPlayer.color }} />
              ) : attackable ? (
                <Swords size={14} className="text-[#FFD60A]" />
              ) : null}
            </button>
          );
        })}
      </div>

      {notice && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-center text-sm font-bold text-white">
          {notice}
        </div>
      )}

      <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 text-[11px] leading-relaxed text-gray-500">
        规则：每回合执行一次行动。点击空格完成任务即可占领（任务来自你的题库）；点击带金色虚线框的相邻敌方领地，完成对方题库的任务即可攻城。全部领地瓜分完毕后，领地多者获胜。
      </div>

      <TaskCardModal
        players={players}
        isOpen={!!taskData}
        taskData={taskData}
        onAccept={() => resolve(true)}
        onReject={() => resolve(false)}
        onClose={() => resolve(false)}
      />
    </div>
  );
}

export function TerritoryModeView({ players, themes, currentTurn, onEndTurn, onBack }: TerritoryModeViewProps) {
  const [runId, setRunId] = useModeState('TerritoryModeView.runId', 0);

  return (
    <div className="mobile-game-screen fixed inset-x-0 top-0 bottom-0 z-50 flex flex-col bg-black">
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#131f2b] via-black to-[#0d1724] opacity-90" />

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
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#64B5FF]">Territory</div>
            <div className="mt-1 text-sm font-bold text-white">领地争夺 · 5×5</div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center text-gray-500">
            <Flag size={22} />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 no-scrollbar">
          <TerritoryGame
            key={runId}
            players={players}
            themes={themes}
            currentTurn={currentTurn}
            onEndTurn={onEndTurn}
            onExit={onBack}
          />

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
