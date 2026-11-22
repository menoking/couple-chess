import { useModeState, useMyTurn } from '../../rules/ModeRuntime';
import { useMemo, useRef } from 'react';
import { ArrowLeft, Check, Flag, RefreshCw, Swords, User, UserRound, X } from 'lucide-react';
import { Player, Theme } from '../../types';
import { ThemeTaskEntry, buildTaskPool, collectThemeTasks, pickRandom } from '../../utils/modeKit';
import { formatTaskInstruction, resolveTaskRule } from '../../rules/taskRules';

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

/** 本轮行动：只存纯文本任务，**不要**用 TaskEventData 形状（会被当成抽卡对象拦掉）。 */
interface TerritoryAction {
  kind: ActionKind;
  index: number;
  text: string;
  themeName: string;
}

const neighborsOf = (index: number): number[] => {
  const r = Math.floor(index / GRID);
  const c = index % GRID;
  return [
    r > 0 ? index - GRID : -1,
    r < GRID - 1 ? index + GRID : -1,
    c > 0 ? index - 1 : -1,
    c < GRID - 1 ? index + 1 : -1
  ].filter(n => n >= 0);
};

/** 某方最大连片领地（用于平局判定，也让「连成一片」有额外价值） */
function largestBlob(owners: Array<number | null>, seat: number): number {
  const seen = new Set<number>();
  let best = 0;
  for (let i = 0; i < owners.length; i += 1) {
    if (owners[i] !== seat || seen.has(i)) continue;
    let size = 0;
    const stack = [i];
    seen.add(i);
    while (stack.length > 0) {
      const current = stack.pop() as number;
      size += 1;
      for (const next of neighborsOf(current)) {
        if (owners[next] !== seat || seen.has(next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }
    best = Math.max(best, size);
  }
  return best;
}

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
  const canAct = useMyTurn(currentTurn);
  const activePlayer = players[currentTurn] || players[0];
  const opponent = players.find(p => p.id !== activePlayer?.id) || players[1];
  const [owners, setOwners] = useModeState<Array<number | null>>('TerritoryModeView.owners', () => new Array(TOTAL_CELLS).fill(null));
  const [action, setAction] = useModeState<TerritoryAction | null>('TerritoryModeView.action', null);
  const [notice, setNotice] = useModeState<string | null>('TerritoryModeView.notice', null);
  const resolvingRef = useRef(false);

  const pool = useMemo(() => buildTaskPool(players, themes) ?? [], [players, themes]);

  const myCount = owners.filter(owner => owner === activePlayer?.id).length;
  const enemyCount = owners.filter(owner => owner !== null && owner !== activePlayer?.id).length;
  const emptyCells = TOTAL_CELLS - myCount - enemyCount;

  /** 空地想占领必须与自己的领地相邻（还没有领地时第一块随意），逼出抢地盘的对抗 */
  const isClaimable = (index: number) => {
    if (owners[index] !== null) return false;
    if (myCount === 0) return true;
    return neighborsOf(index).some(n => owners[n] === activePlayer?.id);
  };

  const isAttackable = (index: number) => {
    const owner = owners[index];
    if (owner === null || owner === activePlayer?.id) return false;
    return neighborsOf(index).some(n => owners[n] === activePlayer?.id);
  };

  const tapCell = (index: number) => {
    if (!canAct || action) return;
    const owner = owners[index];
    if (owner === activePlayer?.id) return;

    if (owner === null) {
      if (!isClaimable(index)) {
        setNotice('只能占领与自己领地相邻的空地');
        return;
      }
    } else if (!isAttackable(index)) {
      setNotice('只能攻打与自己领地相邻的敌方领地');
      return;
    }

    const kind: ActionKind = owner === null ? 'claim' : 'attack';
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
    resolvingRef.current = false;
    const rule = resolveTaskRule(entry.task, activePlayer?.id ?? 0);
    setAction({ kind, index, text: formatTaskInstruction(entry.task.text, rule), themeName: entry.themeName });
  };

  const resolve = (accepted: boolean) => {
    if (!canAct || !action || resolvingRef.current) return;
    resolvingRef.current = true;
    const target = action.index;
    if (accepted) {
      const wasEnemy = owners[target] !== null;
      setOwners(prev => prev.map((owner, i) => (i === target ? activePlayer?.id ?? null : owner)));
      setNotice(wasEnemy ? '攻城成功，领地易主！' : '占领成功！');
    } else {
      setNotice(action.kind === 'attack' ? '攻城失败，敌方领地守住' : '任务跳过，领地未变化');
    }
    setAction(null);
    onEndTurn();
  };

  if (emptyCells === 0 && !action) {
    const scoreOf = (seat: number) => ({
      cells: owners.filter(owner => owner === seat).length,
      blob: largestBlob(owners, seat)
    });
    const mine = scoreOf(activePlayer?.id ?? 0);
    const theirs = scoreOf(opponent?.id ?? 1);
    const total = (score: { cells: number; blob: number }) => score.cells + score.blob;
    const winner =
      total(mine) === total(theirs) ? null : total(mine) > total(theirs) ? activePlayer : opponent;

    return (
      <div className="space-y-4">
        <div className="rounded-3xl border border-[#FFD60A]/25 bg-[#FFD60A]/10 p-6 text-center">
          <Flag size={36} className="mx-auto text-[#FFD60A]" />
          <div className="mt-3 text-xl font-bold text-white">
            {winner ? `${winner.name} 拿下更多领地！` : '势均力敌，平分秋色！'}
          </div>
          <div className="mt-4 space-y-2">
            {players.map(player => {
              const score = scoreOf(player.id);
              return (
                <div key={player.id} className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                  <span className="text-sm font-bold" style={{ color: player.color }}>{player.name}</span>
                  <span className="text-sm font-bold text-white">
                    {score.cells} 块 · 连片 {score.blob} · 合计 {total(score)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 text-[10px] text-gray-500">计分：领地数 + 最大连片数</div>
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

      <div className={`flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold ${canAct ? 'bg-white/5 text-white' : 'bg-white/[0.02] text-gray-500'}`}>
        {activePlayer?.id === 0 ? <User size={15} className="text-[#0A84FF]" /> : <UserRound size={15} className="text-[#FF375F]" />}
        {canAct ? (
          <>
            {activePlayer?.name || '当前玩家'} 的回合
            <span className="text-[11px] font-normal text-gray-500">占相邻空地，或攻打相邻敌方领地</span>
          </>
        ) : (
          `等 ${activePlayer?.name || '对方'} 落子…（你这边暂不可操作）`
        )}
      </div>

      <div className="grid grid-cols-5 gap-1.5">
        {owners.map((owner, index) => {
          const ownerPlayer = owner !== null ? players.find(p => p.id === owner) : undefined;
          const attackable = owner !== null && owner !== activePlayer?.id && isAttackable(index);
          const claimable = owner === null && isClaimable(index);
          const selected = action?.index === index;
          const dim = !ownerPlayer && !claimable && canAct && !selected;

          return (
            <button
              key={index}
              type="button"
              disabled={!!action || owner === activePlayer?.id || !canAct}
              onClick={() => tapCell(index)}
              aria-label={
                ownerPlayer
                  ? `${ownerPlayer.name}的领地${attackable ? '，可攻城' : ''}`
                  : claimable
                    ? '可占领的空地'
                    : '无主领地'
              }
              className={`relative flex aspect-square items-center justify-center rounded-xl border transition-all ios-btn disabled:cursor-default ${
                ownerPlayer
                  ? attackable
                    ? 'border-dashed border-[#FFD60A]/70 bg-white/[0.06]'
                    : 'border-white/10'
                  : claimable
                    ? 'border-[#30D158]/40 bg-[#30D158]/10 active:bg-[#30D158]/20'
                    : 'border-white/10 bg-white/[0.04] active:bg-white/10'
              } ${selected ? 'ring-2 ring-white' : ''} ${dim ? 'opacity-40' : ''}`}
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
              ) : claimable ? (
                <span className="text-[13px] font-bold text-[#30D158]">+</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {notice && !action && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-center text-sm font-bold text-white">
          {notice}
        </div>
      )}

      {action && (
        <div className="rounded-3xl border border-white/10 bg-[#1C1C1E] p-5">
          <div className="flex items-center justify-between text-[10px] font-bold text-gray-500">
            <span>
              {action.kind === 'attack' ? '攻城任务' : '占领任务'} · 执行关系见卡面
            </span>
            <span className="truncate">来自「{action.themeName}」</span>
          </div>
          <div className="mt-3 text-base font-bold leading-relaxed text-white">{action.text}</div>

          {canAct ? (
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => resolve(false)}
                className="ios-btn flex-1 rounded-full bg-[#3A3A3C] py-3.5 text-sm font-bold text-[#FF453A]"
              >
                <span className="flex items-center justify-center gap-1.5">
                  <X size={15} />跳过
                </span>
              </button>
              <button
                type="button"
                onClick={() => resolve(true)}
                className="ios-btn flex-[2] rounded-full bg-white py-3.5 text-sm font-bold text-black shadow-lg"
              >
                <span className="flex items-center justify-center gap-1.5">
                  <Check size={15} />
                  {action.kind === 'attack' ? '完成，夺下这块地' : '完成，占领这块地'}
                </span>
              </button>
            </div>
          ) : (
            <div className="mt-4 rounded-full border border-white/10 bg-white/[0.05] px-3 py-3 text-center text-[11px] font-bold text-gray-500">
              等 {activePlayer?.name || '对方'} 完成或跳过
            </div>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 text-[11px] leading-relaxed text-gray-500">
        规则：每回合一次行动。只能占领与自己领地相邻的空地（没有领地时第一块随意），
        或攻打相邻的敌方领地；任务完成才生效，跳过则原地不动。
        全部瓜分后按「领地数 + 最大连片数」计分，连成一片更有优势。
      </div>
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
