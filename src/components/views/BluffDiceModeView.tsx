import { useModeState, useMyTurn } from '../../rules/ModeRuntime';
import { useEffect, useMemo } from 'react';
import { ArrowLeft, Dices, Eye, RefreshCw, ShieldQuestion, User, UserRound } from 'lucide-react';
import { Player, Theme } from '../../types';
import { buildTaskPool, createViewTaskEvent, pickRandom } from '../../utils/modeKit';
import { TaskCardModal } from '../modals/TaskCardModal';

interface BluffDiceModeViewProps {
  players: Player[];
  themes: Theme[];
  currentTurn: number;
  onBack: () => void;
}

const DICE_EACH = 5;
const TOTAL_DICE = DICE_EACH * 2;

/** 1~6 点的点位（3×3 九宫格索引） */
const PIP_MAP: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8]
};

type Phase = 'handoff1' | 'view1' | 'handoff2' | 'view2' | 'bid' | 'reveal';

interface Bid {
  qty: number;
  face: number;
  by: number;
}

interface RevealInfo {
  count: number;
  bidderWins: boolean;
  loserId: number;
  winnerId: number;
}

function rollDice(): number[] {
  return Array.from({ length: DICE_EACH }, () => Math.floor(Math.random() * 6) + 1);
}

function Die({ value, size = 'md' }: { value: number; size?: 'sm' | 'md' | 'lg' }) {
  const dimension = size === 'lg' ? 'h-14 w-14' : size === 'sm' ? 'h-8 w-8' : 'h-11 w-11';
  const dot = size === 'lg' ? 'h-2 w-2' : size === 'sm' ? 'h-1 w-1' : 'h-1.5 w-1.5';
  const pips = PIP_MAP[value] ?? [];

  return (
    <div className={`bluff-die grid grid-cols-3 grid-rows-3 gap-0.5 rounded-xl p-1.5 ${dimension}`}>
      {Array.from({ length: 9 }, (_, index) => (
        <span key={index} className="flex items-center justify-center">
          {pips.includes(index) && <span className={`bluff-pip rounded-full ${dot}`} />}
        </span>
      ))}
    </div>
  );
}

function BluffDiceGame({
  players,
  themes,
  currentTurn
}: {
  players: Player[];
  themes: Theme[];
  currentTurn: number;
}) {
  const pool = useMemo(() => buildTaskPool(players, themes) ?? [], [players, themes]);

  const [phase, setPhase] = useModeState<Phase>('BluffDiceModeView.phase', 'handoff1');
  const [round, setRound] = useModeState('BluffDiceModeView.round', 1);
  const [starterId, setStarterId] = useModeState('BluffDiceModeView.starterId', currentTurn === 1 ? 1 : 0);
  const [turn, setTurn] = useModeState('BluffDiceModeView.turn', currentTurn === 1 ? 1 : 0);
  // 联机：只有当前回合方能推进阶段 / 叫骰 / 开牌，同屏恒可操作
  const canAct = useMyTurn(turn);
  const [dice, setDice] = useModeState<Record<number, number[]>>('BluffDiceModeView.dice', { 0: rollDice(), 1: rollDice() }, 'seat');
  const [bid, setBid] = useModeState<Bid | null>('BluffDiceModeView.bid', null);
  const [draftQty, setDraftQty] = useModeState('BluffDiceModeView.draftQty', 2);
  const [draftFace, setDraftFace] = useModeState('BluffDiceModeView.draftFace', 1);
  const [points, setPoints] = useModeState<Record<number, number>>('BluffDiceModeView.points', { 0: 0, 1: 0 });
  const [reveal, setReveal] = useModeState<RevealInfo | null>('BluffDiceModeView.reveal', null);
  const [taskData, setTaskData] = useModeState<ReturnType<typeof createViewTaskEvent> | null>('BluffDiceModeView.taskData', null);

  const first = players[0];
  const currentPlayer = players.find(player => player.id === turn) ?? first;

  const isLegalBid = !bid || draftQty > bid.qty || (draftQty === bid.qty && draftFace > bid.face);

  // 每次叫点变化后，把输入框预置成「刚好能加注」的最小值
  useEffect(() => {
    if (!bid) {
      setDraftQty(2);
      setDraftFace(1);
      return;
    }
    if (bid.face < 6) {
      setDraftQty(bid.qty);
      setDraftFace(bid.face + 1);
    } else {
      setDraftQty(Math.min(bid.qty + 1, TOTAL_DICE));
      setDraftFace(1);
    }
  }, [bid]);

  const startRound = (nextStarter: number) => {
    if (!canAct) return;
    setDice({ 0: rollDice(), 1: rollDice() });
    setBid(null);
    setReveal(null);
    setTaskData(null);
    setStarterId(nextStarter);
    setTurn(nextStarter);
    setPhase('handoff1');
    setRound(value => value + 1);
  };

  const submitBid = () => {
    if (!canAct) return;
    if (!isLegalBid) return;
    setBid({ qty: draftQty, face: draftFace, by: turn });
    setTurn(turn === 0 ? 1 : 0);
  };

  const challenge = () => {
    if (!canAct) return;
    if (!bid) return;
    const all = [...dice[0], ...dice[1]];
    const count = all.filter(value => value === bid.face).length;
    const bidderWins = count >= bid.qty;
    const loserId = bidderWins ? turn : bid.by;
    const winnerId = bidderWins ? bid.by : turn;

    setPoints(prev => ({ ...prev, [winnerId]: (prev[winnerId] ?? 0) + 1 }));
    setReveal({ count, bidderWins, loserId, winnerId });
    setPhase('reveal');

    const entry = pickRandom(pool);
    if (entry) {
      setTaskData(
        createViewTaskEvent({
          entry,
          title: '吹牛失败 · 惩罚卡',
          // 胜方抽卡、败方执行：不传 initiator 会默认成败方自己抽
          executorPlayerId: loserId,
          initiatorPlayerId: winnerId
        })
      );
    }
  };

  // ---------- 传手机：私密查看 ----------
  if (phase === 'handoff1' || phase === 'handoff2') {
    const targetId = phase === 'handoff1' ? 0 : 1;
    const target = players.find(player => player.id === targetId) ?? first;
    const other = players.find(player => player.id !== targetId);
    return (
      <div className="space-y-4">
        <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-6 text-center">
          <Eye size={32} className="mx-auto text-[#FFD60A]" />
          <div className="mt-3 text-lg font-bold text-white">把手机交给 {target?.name}</div>
          <div className="mt-2 text-sm text-gray-500">
            {other?.name} 请闭眼，不要偷看
          </div>
        </div>
        <button
          type="button"
          onClick={() => { if (canAct) setPhase(phase === 'handoff1' ? 'view1' : 'view2'); }}
          disabled={!canAct}
          className="ios-btn h-14 w-full rounded-full bg-white text-base font-bold text-black shadow-lg"
        >
          我是 {target?.name}，看我的骰子
        </button>
      </div>
    );
  }

  if (phase === 'view1' || phase === 'view2') {
    const targetId = phase === 'view1' ? 0 : 1;
    const target = players.find(player => player.id === targetId) ?? first;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-center gap-2 rounded-2xl bg-white/5 py-3 text-sm font-bold" style={{ color: target?.color }}>
          {target?.id === 0 ? <User size={15} /> : <UserRound size={15} />}
          {target?.name} 的骰子（对方看不到）
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          {(dice[targetId] ?? []).map((value, index) => (
            <Die key={index} value={value} size="lg" />
          ))}
        </div>

        <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 text-center text-[11px] leading-relaxed text-gray-500">
          记住自己的点数，叫点时不能再看。记住后点下面的按钮，把手机交给对方。
        </div>

        <button
          type="button"
          onClick={() => { if (canAct) setPhase(phase === 'view1' ? 'handoff2' : 'bid'); }}
          disabled={!canAct}
          className="ios-btn h-14 w-full rounded-full bg-white text-base font-bold text-black shadow-lg"
        >
          {phase === 'view1' ? '记住了，交给对方' : '双方都记住了，开始叫点'}
        </button>
      </div>
    );
  }

  // ---------- 揭示结果 ----------
  if (phase === 'reveal' && reveal && bid) {
    const loser = players.find(player => player.id === reveal.loserId);
    const winner = players.find(player => player.id === reveal.winnerId);

    return (
      <div className="space-y-4">
        <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5 text-center">
          <div className="text-xs font-bold text-gray-500">第 {round} 轮 · 开骰</div>
          <div className="mt-2 text-lg font-bold text-white">
            叫的是「{bid.qty} 个 {bid.face} 点」
          </div>
          <div className="mt-3 text-3xl font-bold text-[#FFD60A]">
            实际 {reveal.count} 个
          </div>
          <div className="mt-2 text-sm font-bold text-white">
            {reveal.bidderWins ? '叫点成立' : '叫点被戳穿'} ·{' '}
            <span style={{ color: winner?.color }}>{winner?.name}</span> 得分
          </div>
        </div>

        <div className="space-y-3">
          {players.map(player => (
            <div key={player.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold" style={{ color: player.color }}>
                  {player.name}
                </span>
                <span className="text-[10px] text-gray-500">
                  {player.id === reveal.loserId ? '受罚' : '得分 +1'}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(dice[player.id] ?? []).map((value, index) => (
                  <Die key={index} value={value} size="sm" />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-[#FF453A]/25 bg-[#FF453A]/10 p-4 text-center text-sm font-bold text-white">
          {loser?.name} 抽一张惩罚卡执行
        </div>

        <button
          type="button"
          onClick={() => startRound(starterId === 0 ? 1 : 0)}
          disabled={!canAct}
          className="ios-btn h-14 w-full rounded-full bg-white text-base font-bold text-black shadow-lg"
        >
          下一轮
        </button>

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

  // ---------- 叫点 ----------
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold text-gray-400">
          第 {round} 轮 · 共 {TOTAL_DICE} 颗骰子
        </div>
        <div className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold">
          {players.map(player => (
            <span key={player.id} style={{ color: player.color }}>
              {player.name} {points[player.id] ?? 0}
            </span>
          ))}
        </div>
      </div>

      <div className={`flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold ${canAct ? 'bg-white/5 text-white' : 'bg-white/[0.02] text-gray-500'}`}>
        {currentPlayer?.id === 0 ? <User size={15} className="text-[#0A84FF]" /> : <UserRound size={15} className="text-[#FF375F]" />}
        {canAct ? `${currentPlayer?.name} 的回合` : `等 ${currentPlayer?.name} 操作…（你这边暂不可操作）`}
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5 text-center">
        {bid ? (
          <>
            <div className="text-xs font-bold text-gray-500">
              {players.find(player => player.id === bid.by)?.name} 叫
            </div>
            <div className="mt-2 text-3xl font-bold text-white">
              {bid.qty} 个 <span className="text-[#FFD60A]">{bid.face}</span>
            </div>
            <div className="mt-1 text-[11px] text-gray-500">全场共 {TOTAL_DICE} 颗骰子</div>
          </>
        ) : (
          <>
            <Dices size={30} className="mx-auto text-[#FFD60A]" />
            <div className="mt-2 text-base font-bold text-white">还没有人叫点</div>
            <div className="mt-1 text-[11px] text-gray-500">先叫的人占据主动，也承担被开的压力</div>
          </>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] font-bold text-gray-500">个数</div>
            <div className="mt-1.5 flex items-center justify-between rounded-xl bg-white/[0.06] px-2 py-1.5">
              <button
                type="button"
                onClick={() => setDraftQty(value => Math.max(1, value - 1))}
                disabled={!canAct}
                className="ios-btn h-7 w-7 rounded-lg text-base font-bold text-white"
              >
                −
              </button>
              <span className="text-lg font-bold tabular-nums text-white">{draftQty}</span>
              <button
                type="button"
                onClick={() => setDraftQty(value => Math.min(TOTAL_DICE, value + 1))}
                disabled={!canAct}
                className="ios-btn h-7 w-7 rounded-lg text-base font-bold text-white"
              >
                +
              </button>
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-gray-500">点数</div>
            <div className="mt-1.5 flex items-center justify-between rounded-xl bg-white/[0.06] px-2 py-1.5">
              <button
                type="button"
                onClick={() => setDraftFace(value => Math.max(1, value - 1))}
                disabled={!canAct}
                className="ios-btn h-7 w-7 rounded-lg text-base font-bold text-white"
              >
                −
              </button>
              <span className="text-lg font-bold tabular-nums text-white">{draftFace}</span>
              <button
                type="button"
                onClick={() => setDraftFace(value => Math.min(6, value + 1))}
                disabled={!canAct}
                className="ios-btn h-7 w-7 rounded-lg text-base font-bold text-white"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {!isLegalBid && (
          <div className="mt-3 text-center text-[11px] font-bold text-[#FF9F0A]">
            必须比「{bid?.qty} 个 {bid?.face}」更大：加个数，或个数相同点数更大
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={challenge}
          disabled={!bid}
          className="ios-btn h-14 flex-1 rounded-full bg-[#FF453A] text-base font-bold text-white disabled:opacity-30"
        >
          <span className="flex items-center justify-center gap-1.5">
            <ShieldQuestion size={16} />开！
          </span>
        </button>
        <button
          type="button"
          onClick={submitBid}
          disabled={!isLegalBid}
          className="ios-btn h-14 flex-[2] rounded-full bg-white text-base font-bold text-black shadow-lg disabled:opacity-30"
        >
          叫 {draftQty} 个 {draftFace}
        </button>
      </div>

      <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 text-[11px] leading-relaxed text-gray-500">
        规则：双方各 5 颗骰子只有自己知道。轮流叫「全场至少有 N 个 X 点」，每次必须叫得更大。谁觉得对方在吹牛就按「开」——开对则对方受罚，开错则自己受罚。
      </div>
    </div>
  );
}

export function BluffDiceModeView({ players, themes, currentTurn, onBack }: BluffDiceModeViewProps) {
  const [runId, setRunId] = useModeState('BluffDiceModeView.runId', 0);

  return (
    <div className="mobile-game-screen fixed inset-x-0 top-0 bottom-0 z-50 flex flex-col bg-black">
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#1c1510] via-black to-[#0d1724] opacity-90" />
      <div className="relative z-10 mx-auto flex h-full w-full max-w-[430px] flex-col">
        <header className="mobile-screen-header flex shrink-0 items-center gap-3 px-4 py-2">
          <button onClick={onBack} className="ios-btn flex h-10 w-10 items-center justify-center rounded-full border border-white/5 bg-white/10" aria-label="返回首页">
            <ArrowLeft className="text-white" size={20} />
          </button>
          <div className="flex-1 text-center">
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#FFD60A]">Liar's Dice</div>
            <div className="mt-1 text-sm font-bold text-white">吹牛骰</div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center text-gray-500">
            <Dices size={22} />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 no-scrollbar">
          <BluffDiceGame key={runId} players={players} themes={themes} currentTurn={currentTurn} />
          <button type="button" onClick={() => setRunId(value => value + 1)} className="ios-btn mx-auto mt-6 flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-xs font-bold text-gray-400">
            <RefreshCw size={13} />重新开局
          </button>
        </main>
      </div>
    </div>
  );
}
