import { useModeRuntime, useModeState, useSharedValueReady } from '../../rules/ModeRuntime';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Coins, Gavel, Lock, RefreshCw, User, UserRound } from 'lucide-react';
import { Player, TaskEventData, Theme } from '../../types';
import { ThemeTaskEntry, buildTaskPool, createViewTaskEvent, shuffle, themeIntensity } from '../../utils/modeKit';
import { TaskCardModal } from '../modals/TaskCardModal';

interface AuctionModeViewProps {
  players: Player[];
  themes: Theme[];
  /** 队列里还有没确认的卡：有卡时不能进入下一拍 */
  pendingCards?: number;
  onBack: () => void;
}

const TOTAL_ROUNDS = 10;
const STARTING_COINS = 100;
const BID_STEP = 5;

interface AuctionReveal {
  bids: [number, number];
  winner: number | null;
}

function AuctionGame({
  players,
  themes,
  pendingCards,
  onExit
}: {
  players: Player[];
  themes: Theme[];
  pendingCards: number;
  onExit: () => void;
}) {
  const runtime = useModeRuntime();
  const mySeat = runtime?.seat ?? null;
  const authority = runtime?.authority ?? true;
  const online = runtime !== null;

  const [queue] = useModeState<ThemeTaskEntry[]>('AuctionModeView.queue', () =>
    shuffle(buildTaskPool(players, themes) ?? []).slice(0, TOTAL_ROUNDS)
  );
  const [round, setRound] = useModeState('AuctionModeView.round', 0);
  const [coins, setCoins] = useModeState<Record<number, number>>('AuctionModeView.coins', {
    0: STARTING_COINS,
    1: STARTING_COINS
  });
  const [points, setPoints] = useModeState<Record<number, number>>('AuctionModeView.points', { 0: 0, 1: 0 });
  const [wonCount, setWonCount] = useModeState<Record<number, number>>('AuctionModeView.wonCount', { 0: 0, 1: 0 });
  // 出价本身按座位隔离：viewFor 只把它下发给本人，对方读不到
  const [myBid, setMyBid] = useModeState<number>('AuctionModeView.myBid', 0, 'seat');
  // 只公开「谁已经确认」，不公开价格
  const [confirmed, setConfirmed] = useModeState<[boolean, boolean]>('AuctionModeView.confirmed', [false, false]);
  const [revealed, setRevealed] = useModeState<AuctionReveal | null>('AuctionModeView.revealed', null);
  const [taskData, setTaskData] = useModeState<TaskEventData | null>('AuctionModeView.taskData', null);
  const [notice, setNotice] = useModeState<string | null>('AuctionModeView.notice', null);
  // 同屏：两个人轮流在同一台设备出价，用本地状态暂存已提交的价格
  const [localSealed, setLocalSealed] = useState<[number | null, number | null]>([null, null]);
  const [activeSeat, setActiveSeat] = useState(0);

  const bidderSeat = online ? mySeat ?? 0 : activeSeat;
  const bidder = players[bidderSeat];
  const peerSeat = bidderSeat === 0 ? 1 : 0;
  const coinLeft = coins[bidderSeat] ?? 0;
  const current = queue[round];
  const phase: 'bid' | 'reveal' | 'over' = revealed
    ? 'reveal'
    : round >= queue.length
      ? 'over'
      : 'bid';
  const iConfirmed = online ? confirmed[bidderSeat] === true : localSealed[activeSeat] !== null;
  const peerConfirmed = online ? confirmed[peerSeat] === true : localSealed[peerSeat] !== null;

  const issuedRef = useRef(-1);
  const scoredRef = useRef(-1);

  // 进入新一拍时清掉自己的出价。只有点「进入下一拍」的那台会执行 advance，
  // 另一端不在这里清的话，上一拍的出价会残留到下一拍。
  useEffect(() => {
    setMyBid(0);
  }, [round, setMyBid]);
  // 拍品列表由房主生成后下发，没收到之前不能拿本地随机的那份
  const queueReady = useSharedValueReady('AuctionModeView.queue');

  const adjustBid = (delta: number) => {
    if (iConfirmed || revealed) return;
    setMyBid(value => Math.max(0, Math.min(coinLeft, value + delta)));
  };

  const applyReveal = (a: number, b: number) => {
    const winner = a === b ? null : a > b ? 0 : 1;
    setRevealed({ bids: [a, b], winner });
    if (winner !== null) {
      const paid = winner === 0 ? a : b;
      setCoins(prev => ({ ...prev, [winner]: Math.max(0, (prev[winner] ?? 0) - paid) }));
    }
  };

  const confirmBid = () => {
    if (iConfirmed || revealed) return;
    if (online) {
      // 价格只交给房主，对方拿不到；双方都提交后房主一次性公开
      runtime.dispatch({ type: 'sealBid', seat: mySeat ?? 0, amount: myBid });
      return;
    }
    const next: [number | null, number | null] = [localSealed[0], localSealed[1]];
    next[activeSeat] = myBid;
    setLocalSealed(next);
    if (next[0] !== null && next[1] !== null) {
      applyReveal(next[0], next[1]);
      return;
    }
    // 同屏：藏好这笔价，把手机交给对方
    setActiveSeat(peerSeat);
    setMyBid(0);
  };

  // 揭晓后由权威端把拍品作为任务卡发出（联机走公共 CardGate，同屏弹本地弹窗）
  useEffect(() => {
    if (!authority || !revealed || revealed.winner === null) return;
    if (issuedRef.current === round) return;
    const entry = queue[round];
    if (!entry) return;
    issuedRef.current = round;
    setTaskData(
      createViewTaskEvent({
        entry,
        title: '拍得 · 对方执行',
        executorPlayerId: revealed.winner === 0 ? 1 : 0,
        initiatorPlayerId: revealed.winner
      })
    );
  }, [authority, revealed, round, queue, setTaskData]);

  // 成交计分只做一次（房主）
  useEffect(() => {
    if (!authority || !revealed || revealed.winner === null) return;
    if (scoredRef.current === round) return;
    scoredRef.current = round;
    const winner = revealed.winner;
    const theme = themes.find(t => t.id === current?.themeId);
    const level = themeIntensity(theme);
    const bonus = Math.floor((revealed.bids[winner] ?? 0) / 10);
    const gain = level + bonus;
    setPoints(prev => ({ ...prev, [winner]: (prev[winner] ?? 0) + gain }));
    setWonCount(prev => ({ ...prev, [winner]: (prev[winner] ?? 0) + 1 }));
    setNotice(`成交！+${gain} 分（难度 ${level} + 出价加成 ${bonus}）`);
  }, [authority, revealed, round, current, themes, setPoints, setWonCount, setNotice]);

  const advance = () => {
    setRevealed(null);
    setConfirmed([false, false]);
    setMyBid(0);
    setLocalSealed([null, null]);
    setActiveSeat(0);
    setNotice(null);
    setTaskData(null);
    issuedRef.current = -1;
    scoredRef.current = -1;
    // 两端都可能点「进入下一拍」，条件递增保证只前进一步
    setRound(value => (value === round ? value + 1 : value));
  };

  const resolveTask = (accepted: boolean) => {
    if (!accepted) setNotice('拍得任务却跳过，金币不退');
    setTaskData(null);
    advance();
  };

  if (!queueReady) {
    return (
      <div className="flex min-h-[240px] items-center justify-center text-xs text-gray-500">
        正在同步…
      </div>
    );
  }

  if (phase === 'over') {
    const [first, second] = players;
    const a = points[first?.id ?? 0] ?? 0;
    const b = points[second?.id ?? 0] ?? 0;
    const coinsA = coins[first?.id ?? 0] ?? 0;
    const coinsB = coins[second?.id ?? 0] ?? 0;
    const winner =
      a === b ? (coinsA === coinsB ? null : coinsA > coinsB ? first : second) : a > b ? first : second;
    return (
      <div className="space-y-4">
        <div className="rounded-3xl border border-[#FFD60A]/25 bg-[#FFD60A]/10 p-6 text-center">
          <Gavel size={36} className="mx-auto text-[#FFD60A]" />
          <div className="mt-3 text-xl font-bold text-white">
            {winner ? `${winner.name} 是拍卖赢家！` : '平分秋色，平局！'}
          </div>
          <div className="mt-4 space-y-2">
            {players.map(player => (
              <div key={player.id} className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                <span className="text-sm font-bold" style={{ color: player.color }}>{player.name}</span>
                <span className="text-xs text-gray-400">
                  {points[player.id] ?? 0} 分 · 拍得 {wonCount[player.id] ?? 0} 个 · 剩余{' '}
                  <span className="font-bold text-[#FFD60A]">{coins[player.id] ?? 0}</span> 金币
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

  const currentTheme = current ? themes.find(t => t.id === current.themeId) : undefined;
  const currentLevel = themeIntensity(currentTheme);
  const winnerPlayer = revealed?.winner !== null && revealed?.winner !== undefined
    ? players.find(player => player.id === revealed.winner)
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold text-gray-400">
          第 {round + 1} / {queue.length} 拍
        </div>
        <div className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold">
          {players.map(player => (
            <span key={player.id} style={{ color: player.color }}>
              {player.name} {points[player.id] ?? 0} 分
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-[#D08BFF]">
            <Gavel size={14} />{current?.themeName || '拍品'}
          </div>
          <div className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-gray-400">
            难度 {'★'.repeat(currentLevel)}{'☆'.repeat(5 - currentLevel)}
          </div>
        </div>
        <div className="mt-3 text-lg font-bold leading-relaxed text-white">{current?.task.text || '拍品已售罄'}</div>
        <div className="mt-2 text-[11px] text-gray-500">
          拍得者抽卡，任务由<span className="text-white">对方执行</span>；积分 = 难度 + 出价 ÷ 10
        </div>
      </div>

      {phase === 'bid' && (
        <div className="rounded-3xl border border-[#FF9F0A]/25 bg-[#FF9F0A]/10 p-5">
          <div className="flex items-center justify-center gap-2 text-sm font-bold text-white">
            {bidderSeat === 0 ? <User size={15} className="text-[#0A84FF]" /> : <UserRound size={15} className="text-[#FF375F]" />}
            {online ? '你的出价（对方看不到）' : `请 ${bidder?.name ?? '当前玩家'} 出价，另一个人回避`}
          </div>
          <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-gray-400">
            <Coins size={12} className="text-[#FFD60A]" />可用金币 {coinLeft}
          </div>

          <div className="mt-4 flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => adjustBid(-BID_STEP)}
              disabled={iConfirmed}
              className="ios-btn h-12 w-16 rounded-full bg-white/10 text-lg font-bold text-white disabled:opacity-40"
            >
              -{BID_STEP}
            </button>
            <div className="w-24 text-center text-4xl font-bold tabular-nums text-white">{myBid}</div>
            <button
              type="button"
              onClick={() => adjustBid(BID_STEP)}
              disabled={iConfirmed}
              className="ios-btn h-12 w-16 rounded-full bg-white/10 text-lg font-bold text-white disabled:opacity-40"
            >
              +{BID_STEP}
            </button>
          </div>

          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => setMyBid(coinLeft)}
              disabled={iConfirmed}
              className="ios-btn h-11 flex-1 rounded-full bg-white/10 text-sm font-bold text-[#FFD60A] disabled:opacity-40"
            >
              全押
            </button>
            <button
              type="button"
              onClick={confirmBid}
              disabled={iConfirmed}
              className="ios-btn h-11 flex-[2] rounded-full bg-white text-sm font-bold text-black disabled:opacity-50"
            >
              {iConfirmed ? '已确认出价' : online ? '确认出价（对方看不到）' : '藏好出价，交给对方'}
            </button>
          </div>

          {online && (
            <div className="mt-3 flex items-center justify-center gap-3 text-[10px] font-bold">
              <span className={iConfirmed ? 'text-[#30D158]' : 'text-gray-500'}>
                我 · {iConfirmed ? '已确认' : '未确认'}
              </span>
              <span className="text-gray-600">|</span>
              <span className={peerConfirmed ? 'text-[#30D158]' : 'text-gray-500'}>
                对方 · {peerConfirmed ? '已确认' : '出价中'}
              </span>
            </div>
          )}
          {!online && peerConfirmed && (
            <div className="mt-3 text-center text-[10px] font-bold text-[#30D158]">
              对方已出价，等待你出价
            </div>
          )}
          <div className="mt-3 flex items-center justify-center gap-1 text-[10px] text-gray-600">
            <Lock size={10} />双方都确认后才会同时公开价格
          </div>
        </div>
      )}

      {phase === 'reveal' && revealed && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {players.map(player => {
              const isWinner = revealed.winner === player.id;
              return (
                <div
                  key={player.id}
                  className={`rounded-3xl border p-4 text-center ${
                    isWinner ? 'border-[#30D158]/50 bg-[#30D158]/10' : 'border-white/10 bg-white/[0.04]'
                  }`}
                >
                  <div className="text-xs font-bold" style={{ color: player.color }}>{player.name}</div>
                  <div className="mt-1 text-2xl font-bold tabular-nums text-white">{revealed.bids[player.id] ?? 0}</div>
                  <div className="text-[10px] text-gray-500">
                    {isWinner ? '拍得 · 抽卡' : revealed.winner === null ? '平局' : '未拍得'}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-center text-sm font-bold text-white">
            {revealed.winner === null
              ? '出价相同，本轮流拍'
              : notice ?? `${winnerPlayer?.name ?? '胜者'} 以 ${revealed.bids[revealed.winner] ?? 0} 金币拍得此任务`}
          </div>

          {pendingCards > 0 ? (
            <div className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-3 text-center text-[11px] font-bold text-gray-400">
              先完成上面这张任务卡，再进入下一拍
            </div>
          ) : (
            <button
              type="button"
              onClick={advance}
              className="ios-btn h-14 w-full rounded-full bg-white text-base font-bold text-black shadow-lg"
            >
              进入下一拍
            </button>
          )}
        </div>
      )}

      <TaskCardModal
        players={players}
        isOpen={!!taskData}
        taskData={taskData}
        onAccept={() => resolveTask(true)}
        onReject={() => resolveTask(false)}
        onClose={() => resolveTask(false)}
      />
    </div>
  );
}

export function AuctionModeView({ players, themes, pendingCards = 0, onBack }: AuctionModeViewProps) {
  const [runId, setRunId] = useModeState('AuctionModeView.runId', 0);

  return (
    <div className="mobile-game-screen fixed inset-x-0 top-0 bottom-0 z-50 flex flex-col bg-black">
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#26200f] via-black to-[#0d1724] opacity-90" />

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
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#FFD60A]">Auction</div>
            <div className="mt-1 text-sm font-bold text-white">拍卖竞价 · 密封出价</div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center text-gray-500">
            <Gavel size={22} />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 no-scrollbar">
          <AuctionGame key={runId} players={players} themes={themes} pendingCards={pendingCards} onExit={onBack} />

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
