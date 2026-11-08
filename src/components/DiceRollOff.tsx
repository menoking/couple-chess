import { useEffect, useRef, useState } from 'react';
import { Dices, User, UserRound } from 'lucide-react';
import { Player } from '../types';
import { Dice } from './Dice';

interface DiceRollOffProps {
  /** 参与比点的玩家（取前两位） */
  players: Player[];
  title?: string;
  hint?: string;
  confirmLabel?: string;
  /** 点数大的一方获得选择权后回调 */
  onComplete: (winnerId: number) => void;
}

const ROLL_DURATION = 900;

/**
 * 开局权骰子模块：双方各掷一次，点数大者获得后续选择权。
 * 可复用于任意需要「谁先决定」的开局场景。
 */
export function DiceRollOff({
  players,
  title = '掷骰定开局权',
  hint = '双方各掷一次，点数大的一方获得选择权',
  confirmLabel = '确认，由我选择',
  onComplete
}: DiceRollOffProps) {
  const duo = players.slice(0, 2);
  const emptyRolls = () => Object.fromEntries(duo.map(player => [player.id, null])) as Record<number, number | null>;
  const [rolls, setRolls] = useState<Record<number, number | null>>(emptyRolls);
  const [rollingId, setRollingId] = useState<number | null>(null);
  const [tie, setTie] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  const bothRolled = duo.every(player => rolls[player.id] !== null);
  const winner = bothRolled && !tie
    ? ((rolls[duo[0].id] ?? 0) > (rolls[duo[1].id] ?? 0) ? duo[0] : duo[1])
    : null;

  const roll = (id: number) => {
    if (rollingId !== null) return;
    setRollingId(id);
    timerRef.current = window.setTimeout(() => {
      const value = Math.floor(Math.random() * 6) + 1;
      const nextRolls = { ...rolls, [id]: value };
      setRolls(nextRolls);
      setRollingId(null);
      const a = nextRolls[duo[0].id];
      const b = nextRolls[duo[1].id];
      setTie(a !== null && b !== null && a === b);
    }, ROLL_DURATION);
  };

  const resetRolls = () => {
    setRolls(emptyRolls());
    setTie(false);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5 text-center">
        <Dices size={30} className="mx-auto text-[#FFD60A]" />
        <div className="mt-2 text-lg font-bold text-white">{title}</div>
        <div className="mt-1 text-xs text-gray-500">{hint}</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {duo.map(player => {
          const isRolling = rollingId === player.id;
          const value = rolls[player.id];
          const hasRolled = value !== null;
          const isWinner = winner?.id === player.id;
          const canRoll = rollingId === null && !hasRolled;

          return (
            <div
              key={player.id}
              className={`flex flex-col items-center gap-3 rounded-3xl border p-4 transition-all ${
                isWinner
                  ? 'border-white/40 bg-white/[0.12]'
                  : 'border-white/10 bg-white/[0.04]'
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-bold" style={{ color: player.color }}>
                {player.id === 0 ? <User size={13} /> : <UserRound size={13} />}
                {player.name}
              </div>

              <div className="flex h-20 items-center justify-center">
                {!hasRolled && !isRolling ? (
                  <button
                    type="button"
                    onClick={() => roll(player.id)}
                    disabled={!canRoll}
                    className={`ios-btn flex h-16 w-16 flex-col items-center justify-center rounded-2xl border-2 border-dashed text-xl font-bold transition-colors ${
                      canRoll
                        ? 'border-white/30 text-white/70 active:bg-white/10'
                        : 'border-white/10 text-white/25'
                    }`}
                  >
                    ?
                  </button>
                ) : (
                  <Dice isRolling={isRolling} result={value} />
                )}
              </div>

              <div className="text-sm font-bold text-white">
                {isRolling ? '掷骰中…' : hasRolled ? `${value} 点` : '待掷'}
              </div>
            </div>
          );
        })}
      </div>

      {!bothRolled && rollingId === null && (
        <div className="text-center text-xs text-gray-500">
          点击「?」掷出你的点数
        </div>
      )}

      {tie && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-[#FF9F0A]/30 bg-[#FF9F0A]/10 p-3 text-center text-sm font-bold text-[#FFB340]">
            双方点数相同，重掷一次
          </div>
          <button
            type="button"
            onClick={resetRolls}
            className="ios-btn h-12 w-full rounded-full bg-white/10 text-sm font-bold text-white"
          >
            重掷
          </button>
        </div>
      )}

      {winner && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-white/15 bg-white/[0.08] p-3 text-center text-sm font-bold text-white">
            <span style={{ color: winner.color }}>{winner.name}</span> 点数更大，获得选择权
          </div>
          <button
            type="button"
            onClick={() => onComplete(winner.id)}
            className="ios-btn w-full rounded-full bg-white py-3.5 text-base font-bold text-black shadow-lg"
          >
            {confirmLabel}
          </button>
        </div>
      )}
    </div>
  );
}
