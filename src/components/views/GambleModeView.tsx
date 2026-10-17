import { useState } from 'react';
import { ArrowLeft, Coins, Crown, RefreshCw, User, UserRound } from 'lucide-react';
import { Player, Theme } from '../../types';
import { pickRandom } from '../../utils/modeKit';
import { SPICY_PENALTIES } from '../../data/spicyContent';

interface GambleModeViewProps {
  players: Player[];
  themes: Theme[];
  onBack: () => void;
}

interface BetOption {
  label: string;
  icon: string;
  risk: number; // 赔率（越高越刺激）
}

const WHEEL_SECTIONS: BetOption[] = [
  { label: '轻吻', icon: '💋', risk: 1 },
  { label: '拥抱', icon: '🤗', risk: 1 },
  { label: '情话', icon: '💬', risk: 1 },
  { label: '摸头', icon: '👐', risk: 1 },
  { label: '舔耳', icon: '👂', risk: 2 },
  { label: '吻痕', icon: '💘', risk: 2 },
  { label: '脱一件', icon: '👗', risk: 3 },
  { label: '当众亲', icon: '😈', risk: 3 },
  { label: '主权转让', icon: '👑', risk: 5 },
  { label: '任你差遣', icon: '🔓', risk: 5 }
];

function GambleGame({ players }: { players: Player[] }) {
  const [phase, setPhase] = useState<'bet' | 'spin' | 'result'>('bet');
  const [spinning, setSpinning] = useState(false);
  const [winnerId, setWinnerId] = useState<number | null>(null);
  const [result, setResult] = useState<BetOption | null>(null);
  const [history, setHistory] = useState<Array<{ label: string; loserId: number }>>([]);

  const activePlayer = players[0];
  const opponent = players[1];

  const spin = () => {
    if (spinning) return;
    setSpinning(true);
    setPhase('spin');
    setTimeout(() => {
      const landed = pickRandom(WHEEL_SECTIONS) ?? WHEEL_SECTIONS[0];
      // 简单决定：随机落点
      const loserId = Math.random() < 0.5 ? 0 : 1;
      setResult(landed);
      setWinnerId(loserId === 0 ? 1 : 0);
      setHistory(prev => [...prev, { label: landed.label, loserId }]);
      setSpinning(false);
      setPhase('result');
    }, 1600);
  };

  const nextBet = () => {
    setPhase('bet');
    setResult(null);
    setWinnerId(null);
  };

  const winner = winnerId !== null ? players.find(p => p.id === winnerId) : undefined;
  const loser = winnerId !== null ? players.find(p => p.id !== winnerId) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold text-gray-400">
          已赌 {history.length} 轮
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-[#FFD60A]/15 px-3 py-1 text-[10px] font-bold text-[#FFD60A]">
          <Crown size={12} />赌上今晚的主权
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 rounded-2xl bg-white/5 py-3 text-sm font-bold text-white">
        <User size={15} className="text-[#0A84FF]" />{activePlayer?.name || '男方'} vs {opponent?.name || '女方'}<UserRound size={15} className="text-[#FF375F]" />
      </div>

      {phase === 'bet' && (
        <div className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-6 text-center">
            <Coins size={36} className="mx-auto text-[#FFD60A]" />
            <div className="mt-3 text-xl font-bold text-white">转盘赌局</div>
            <div className="mt-2 text-sm text-gray-400">
              这一转，输家要完成转出的动作，并整晚听赢家差遣
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {WHEEL_SECTIONS.map(section => (
              <div key={section.label} className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <span className="text-xl">{section.icon}</span>
                <span className="text-xs font-semibold text-white">{section.label}</span>
                <span className="ml-auto text-[10px] font-bold text-[#FF9F0A]">×{section.risk}</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={spin}
            className="ios-btn h-14 w-full rounded-full bg-white text-base font-bold text-black shadow-lg"
          >
            转动轮盘
          </button>
        </div>
      )}

      {phase === 'spin' && (
        <div className="flex flex-col items-center justify-center gap-4 py-12">
          <div className="h-24 w-24 animate-spin rounded-full border-4 border-[#FFD60A] border-t-transparent" />
          <div className="text-lg font-bold text-white">轮盘转动中…</div>
        </div>
      )}

      {phase === 'result' && result && winner && loser && (
        <div className="space-y-4">
          <div className="rounded-3xl border border-[#FFD60A]/30 bg-[#FFD60A]/10 p-6 text-center">
            <div className="text-5xl">{result.icon}</div>
            <div className="mt-3 text-2xl font-bold text-white">{result.label}</div>
            <div className="mt-2 text-sm text-gray-400">
              <span style={{ color: winner.color }}>{winner.name}</span> 赢了，{' '}
              <span style={{ color: loser.color }}>{loser.name}</span> 要照做
            </div>
          </div>

          {result.risk >= 4 && (
            <div className="rounded-2xl border border-[#FF453A]/30 bg-[#FF453A]/10 p-4 text-center text-sm font-bold text-white">
              👑 主权转让：{loser.name} 整晚听 {winner.name} 差遣
            </div>
          )}

          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
            <div className="text-xs font-bold text-gray-500">本轮惩罚</div>
            <div className="mt-2 text-sm leading-relaxed text-white">{pickRandom(SPICY_PENALTIES)}</div>
          </div>

          <button
            type="button"
            onClick={nextBet}
            className="ios-btn h-14 w-full rounded-full bg-white text-base font-bold text-black shadow-lg"
          >
            再赌一轮
          </button>
        </div>
      )}
    </div>
  );
}

export function GambleModeView({ players, onBack }: GambleModeViewProps) {
  const [runId, setRunId] = useState(0);

  return (
    <div className="mobile-game-screen fixed inset-x-0 top-0 bottom-0 z-50 flex flex-col bg-black">
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#1f1a0b] via-black to-[#0d1724] opacity-90" />
      <div className="relative z-10 mx-auto flex h-full w-full max-w-[430px] flex-col">
        <header className="mobile-screen-header flex shrink-0 items-center gap-3 px-4 py-2">
          <button onClick={onBack} className="ios-btn flex h-10 w-10 items-center justify-center rounded-full border border-white/5 bg-white/10" aria-label="返回首页">
            <ArrowLeft className="text-white" size={20} />
          </button>
          <div className="flex-1 text-center">
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#FFD60A]">Gamble Wheel</div>
            <div className="mt-1 text-sm font-bold text-white">赌局轮盘</div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center text-gray-500">
            <Crown size={22} />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 no-scrollbar">
          <GambleGame key={runId} players={players} />
          <button type="button" onClick={() => setRunId(value => value + 1)} className="ios-btn mx-auto mt-6 flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-xs font-bold text-gray-400">
            <RefreshCw size={13} />重新开始
          </button>
        </main>
      </div>
    </div>
  );
}
