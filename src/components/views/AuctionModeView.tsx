import { useMemo, useState } from 'react';
import { ArrowLeft, Coins, Gavel, RefreshCw, User, UserRound } from 'lucide-react';
import { Player, TaskEventData, Theme } from '../../types';
import { ThemeTaskEntry, buildTaskPool, createViewTaskEvent, shuffle, themeIntensity } from '../../utils/modeKit';
import { TaskCardModal } from '../modals/TaskCardModal';
import { DiceRollOff } from '../DiceRollOff';

interface AuctionModeViewProps {
  players: Player[];
  themes: Theme[];
  onBack: () => void;
}

const TOTAL_ROUNDS = 10;
const STARTING_COINS = 100;
const BID_STEP = 5;

type Phase = 'roll' | 'intro' | 'bid-first' | 'bid-second' | 'reveal' | 'task' | 'over';

function AuctionGame({ players, themes, onExit }: { players: Player[]; themes: Theme[]; onExit: () => void }) {
  const queue = useMemo<ThemeTaskEntry[]>(() => shuffle(buildTaskPool(players, themes) ?? []).slice(0, TOTAL_ROUNDS), [players, themes]);
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<Phase>('roll');
  const [firstBidder, setFirstBidder] = useState(0);
  const [coins, setCoins] = useState<Record<number, number>>({ 0: STARTING_COINS, 1: STARTING_COINS });
  const [points, setPoints] = useState<Record<number, number>>({ 0: 0, 1: 0 });
  const [wonCount, setWonCount] = useState<Record<number, number>>({ 0: 0, 1: 0 });
  const [bids, setBids] = useState<Record<number, number>>({ 0: 0, 1: 0 });
  const [winnerId, setWinnerId] = useState<number | null>(null);
  const [taskData, setTaskData] = useState<TaskEventData | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const current = queue[round];
  const bidderId = phase === 'bid-first'
    ? firstBidder
    : phase === 'bid-second'
      ? (firstBidder === 0 ? 1 : 0)
      : 0;
  const bidder = players[bidderId];

  const startBidding = () => {
    setBids({ 0: 0, 1: 0 });
    setWinnerId(null);
    setNotice(null);
    setPhase('bid-first');
  };

  const adjustBid = (delta: number) => {
    setBids(prev => {
      const next = Math.max(0, Math.min(coins[bidderId] ?? 0, (prev[bidderId] ?? 0) + delta));
      return { ...prev, [bidderId]: next };
    });
  };

  const reveal = () => {
    const a = bids[0] ?? 0;
    const b = bids[1] ?? 0;
    if (a === b) {
      setPoints(prev => ({ ...prev, 0: (prev[0] ?? 0) + 1, 1: (prev[1] ?? 0) + 1 }));
      setNotice('出价相同，本轮流拍，双方各得 1 安慰分');
      setPhase('reveal');
      return;
    }
    const winner = a > b ? 0 : 1;
    const winningBid = winner === 0 ? a : b;
    setCoins(prev => ({ ...prev, [winner]: (prev[winner] ?? 0) - winningBid }));
    setWinnerId(winner);
    if (current) {
      setTaskData(createViewTaskEvent({ entry: current, title: '拍得 · 对方执行', executorPlayerId: winner === 0 ? 1 : 0, initiatorPlayerId: winner }));
    }
    setPhase('task');
  };

  const resolveTask = (accepted: boolean) => {
    if (winnerId === null || !current) return;
    const theme = themes.find(t => t.id === current.themeId);
    const level = themeIntensity(theme);
    if (accepted) {
      const gain = level + Math.floor((bids[winnerId] ?? 0) / 10);
      setPoints(prev => ({ ...prev, [winnerId]: (prev[winnerId] ?? 0) + gain }));
      setWonCount(prev => ({ ...prev, [winnerId]: (prev[winnerId] ?? 0) + 1 }));
      setNotice(`成交！任务完成，+${gain} 分（难度 ${level} + 出价加成 ${Math.floor((bids[winnerId] ?? 0) / 10)}）`);
    } else {
      setNotice('拍得任务却跳过，金币不退，没有积分');
    }
    setTaskData(null);
    advance();
  };

  const advance = () => {
    const bothBroke = (coins[0] ?? 0) <= 0 && (coins[1] ?? 0) <= 0;
    if (round + 1 >= queue.length || bothBroke) {
      setPhase('over');
      return;
    }
    setRound(value => value + 1);
    setPhase('intro');
  };

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

      {phase === 'roll' && (
        <DiceRollOff
          players={players}
          title="掷骰定出价顺序"
          hint="点数大的一方先出价，可以先手压价"
          confirmLabel="确认，我先出价"
          onComplete={winnerId => {
            setFirstBidder(winnerId === 1 ? 1 : 0);
            setPhase('intro');
          }}
        />
      )}

      {phase === 'intro' && (
        <>
          {notice && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-center text-sm font-bold text-white">
              {notice}
            </div>
          )}
          <button
            type="button"
            onClick={startBidding}
            className="ios-btn h-14 w-full rounded-full bg-white text-base font-bold text-black shadow-lg"
          >
            开始竞价
          </button>
        </>
      )}

      {(phase === 'bid-first' || phase === 'bid-second') && (
        <div className="rounded-3xl border border-[#FF9F0A]/25 bg-[#FF9F0A]/10 p-5">
          <div className="flex items-center justify-center gap-2 text-sm font-bold text-white">
            {bidderId === 0 ? <User size={15} className="text-[#0A84FF]" /> : <UserRound size={15} className="text-[#FF375F]" />}
            请 {bidder?.name || '当前玩家'} 秘密出价（对方请回避）
          </div>
          <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-gray-400">
            <Coins size={12} className="text-[#FFD60A]" />可用金币 {coins[bidderId] ?? 0}
          </div>
          <div className="mt-4 flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => adjustBid(-BID_STEP)}
              className="ios-btn h-12 w-16 rounded-full bg-white/10 text-lg font-bold text-white"
            >
              -{BID_STEP}
            </button>
            <div className="w-24 text-center text-4xl font-bold tabular-nums text-white">{bids[bidderId] ?? 0}</div>
            <button
              type="button"
              onClick={() => adjustBid(BID_STEP)}
              className="ios-btn h-12 w-16 rounded-full bg-white/10 text-lg font-bold text-white"
            >
              +{BID_STEP}
            </button>
          </div>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => setBids(prev => ({ ...prev, [bidderId]: coins[bidderId] ?? 0 }))}
              className="ios-btn h-11 flex-1 rounded-full bg-white/10 text-sm font-bold text-[#FFD60A]"
            >
              全押
            </button>
            <button
              type="button"
              onClick={() => (phase === 'bid-first' ? setPhase('bid-second') : reveal())}
              className="ios-btn h-11 flex-[2] rounded-full bg-white text-sm font-bold text-black"
            >
              {phase === 'bid-first' ? '藏好出价，换对方' : '双方揭晓'}
            </button>
          </div>
        </div>
      )}

      {phase === 'reveal' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {players.map(player => (
              <div key={player.id} className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 text-center">
                <div className="text-xs font-bold" style={{ color: player.color }}>{player.name}</div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-white">{bids[player.id] ?? 0}</div>
                <div className="text-[10px] text-gray-500">金币</div>
              </div>
            ))}
          </div>
          {notice && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-center text-sm font-bold text-white">
              {notice}
            </div>
          )}
          <button
            type="button"
            onClick={advance}
            className="ios-btn h-14 w-full rounded-full bg-white text-base font-bold text-black shadow-lg"
          >
            进入下一拍
          </button>
        </div>
      )}

      {phase === 'task' && winnerId !== null && current && (
        <div className="rounded-2xl border border-[#30D158]/25 bg-[#30D158]/10 p-4 text-center text-sm font-bold text-white">
          {players.find(p => p.id === winnerId)?.name} 以 {bids[winnerId] ?? 0} 金币拍得此任务
        </div>
      )}

      <TaskCardModal
        players={players}
        isOpen={phase === 'task' && !!taskData}
        taskData={taskData}
        onAccept={() => resolveTask(true)}
        onReject={() => resolveTask(false)}
        onClose={() => resolveTask(false)}
      />
    </div>
  );
}

export function AuctionModeView({ players, themes, onBack }: AuctionModeViewProps) {
  const [runId, setRunId] = useState(0);

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
            <div className="mt-1 text-sm font-bold text-white">拍卖竞价 · 秘密出价</div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center text-gray-500">
            <Gavel size={22} />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 no-scrollbar">
          <AuctionGame key={runId} players={players} themes={themes} onExit={onBack} />

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
