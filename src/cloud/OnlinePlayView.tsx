import { useMemo, useState } from 'react';
import { ArrowLeft, CircleDot, Dices, PawPrint, Wifi, WifiOff } from 'lucide-react';
import { Seat } from './types';
import { useRoom } from './useRoom';
import { TransportKind } from './transport';
import {
  BluffAction,
  BluffState,
  BluffView,
  GoAction,
  GoState,
  JungleAction,
  JungleState,
  OnlineModeKey,
  bluffAdapter,
  goAdapter,
  jungleAdapter
} from './games/adapters';
import { GO_SIZE } from '../utils/go';
import { JUNGLE_COLS, PIECE_NAMES, cellMeta, getLegalMoves } from '../utils/jungle';

export interface OnlineRoomInfo {
  roomId: string;
  mode: OnlineModeKey;
  hostSeat: Seat;
}

export interface OnlineSeatPlayer {
  seat: Seat;
  name: string;
  color: string;
}

interface OnlinePlayViewProps {
  room: OnlineRoomInfo;
  mySeat: Seat;
  players: OnlineSeatPlayer[];
  kind: TransportKind;
  onExit: () => void;
}

const MODE_META: Record<OnlineModeKey, { label: string; icon: typeof Dices }> = {
  bluff: { label: '吹牛骰', icon: Dices },
  go: { label: '九路围棋', icon: CircleDot },
  jungle: { label: '斗兽棋', icon: PawPrint }
};

function StatusBar({
  mode,
  status,
  presence,
  turnSeat,
  mySeat,
  players
}: {
  mode: OnlineModeKey;
  status: string;
  presence: Seat[];
  turnSeat: Seat | null;
  mySeat: Seat;
  players: OnlineSeatPlayer[];
}) {
  const meta = MODE_META[mode];
  const Icon = meta.icon;
  const opponentSeat = mySeat === 0 ? 1 : 0;
  const opponentOnline = presence.includes(opponentSeat);
  const turnPlayer = players.find(player => player.seat === turnSeat);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between rounded-2xl bg-white/[0.05] px-3 py-2 text-[11px] font-bold">
        <span className="flex items-center gap-1.5 text-gray-400">
          <Icon size={13} />{meta.label} · 联机
        </span>
        <span className={`flex items-center gap-1.5 ${opponentOnline ? 'text-[#30D158]' : 'text-[#FF9F0A]'}`}>
          {opponentOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
          {opponentOnline ? '对方在线' : '等待对方'}
        </span>
      </div>
      <div className="flex items-center justify-center gap-2 rounded-2xl bg-white/5 py-2.5 text-sm font-bold text-white">
        {status !== 'playing'
          ? (status === 'error' ? '连接失败' : '正在同步…')
          : turnPlayer
            ? `${turnPlayer.name} 的回合`
            : '对局进行中'}
      </div>
    </div>
  );
}

function GoOnline({ props }: { props: OnlinePlayViewProps }) {
  const room = useRoom<GoState, GoAction, GoState>({
    adapter: goAdapter,
    roomId: props.room.roomId,
    mySeat: props.mySeat,
    hostSeat: props.room.hostSeat,
    players: props.players,
    kind: props.kind,
    enabled: true
  });

  const state = room.view;
  const myTurn = state?.turn === props.mySeat && state?.winner === null;

  return (
    <div className="space-y-3">
      <StatusBar
        mode="go"
        status={room.status}
        presence={room.presence}
        turnSeat={state?.turn ?? null}
        mySeat={props.mySeat}
        players={props.players}
      />

      {state && (
        <>
          <div className="flex items-center justify-between text-[10px] font-bold text-gray-500">
            <span>你提子 {state.captures[props.mySeat]}</span>
            <span>对方提子 {state.captures[props.mySeat === 0 ? 1 : 0]}</span>
          </div>

          <div className="go-board grid grid-cols-9 overflow-hidden rounded-2xl border">
            {state.board.map((value, index) => {
              const owner = value !== null ? props.players.find(player => player.seat === value) : undefined;
              const isLast = state.lastMove === index;
              return (
                <button
                  key={index}
                  type="button"
                  disabled={!myTurn}
                  onClick={() => room.dispatch({ type: 'place', index })}
                  className="go-line relative flex aspect-square items-center justify-center border-l border-t"
                >
                  {owner && (
                    <span
                      className="h-[76%] w-[76%] rounded-full"
                      style={{
                        backgroundColor: owner.color,
                        boxShadow: isLast ? '0 0 0 2px rgba(255,214,10,0.7)' : 'inset 0 -2px 3px rgba(0,0,0,0.25)'
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={!myTurn}
              onClick={() => room.dispatch({ type: 'pass' })}
              className="ios-btn h-11 flex-1 rounded-full bg-white/10 text-xs font-bold text-white disabled:opacity-30"
            >
              停一手
            </button>
            <button
              type="button"
              disabled={state.winner !== null}
              onClick={() => room.dispatch({ type: 'resign' })}
              className="ios-btn h-11 flex-1 rounded-full bg-[#3A3A3C] text-xs font-bold text-[#FF453A] disabled:opacity-30"
            >
              认输
            </button>
          </div>

          {state.winner !== null && (
            <div className="rounded-2xl border border-[#FFD60A]/30 bg-[#FFD60A]/10 p-4 text-center text-sm font-bold text-white">
              {state.winner === props.mySeat ? '你赢了' : '对方赢了'}
            </div>
          )}
        </>
      )}
      <div className="text-[10px] text-gray-600">棋盘尺寸 {GO_SIZE}×{GO_SIZE}</div>
    </div>
  );
}

function JungleOnline({ props }: { props: OnlinePlayViewProps }) {
  const room = useRoom<JungleState, JungleAction, JungleState>({
    adapter: jungleAdapter,
    roomId: props.room.roomId,
    mySeat: props.mySeat,
    hostSeat: props.room.hostSeat,
    players: props.players,
    kind: props.kind,
    enabled: true
  });

  const state = room.view;
  const [selected, setSelected] = useState<number | null>(null);
  const myTurn = state?.turn === props.mySeat && state?.winner === null;

  const legal = useMemo(() => {
    if (!state || selected === null) return [];
    return getLegalMoves(state.board, selected);
  }, [state, selected]);

  const handle = (index: number) => {
    if (!state || !myTurn) return;
    const piece = state.board[index];
    if (piece && piece.owner === props.mySeat) {
      setSelected(prev => (prev === index ? null : index));
      return;
    }
    if (selected === null) return;
    if (!legal.includes(index)) return;
    room.dispatch({ type: 'move', from: selected, to: index });
    setSelected(null);
  };

  return (
    <div className="space-y-3">
      <StatusBar
        mode="jungle"
        status={room.status}
        presence={room.presence}
        turnSeat={state?.turn ?? null}
        mySeat={props.mySeat}
        players={props.players}
      />

      {state && (
        <>
          <div className="flex items-center justify-between text-[10px] font-bold text-gray-500">
            <span>你吃子 {state.captured[props.mySeat]}</span>
            <span>对方吃子 {state.captured[props.mySeat === 0 ? 1 : 0]}</span>
          </div>

          <div className="grid grid-cols-7 overflow-hidden rounded-2xl border border-white/10">
            {state.board.map((piece, index) => {
              const meta = cellMeta(index);
              const owner = piece ? props.players.find(player => player.seat === piece.owner) : undefined;
              const isLegal = legal.includes(index);
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => handle(index)}
                  className={`jungle-cell relative flex aspect-square items-center justify-center border-l border-t border-white/[0.06] ${
                    meta.water ? 'bg-[#0A84FF]/15' : meta.trap ? 'bg-[#FF9F0A]/12' : meta.den ? 'bg-[#FFD60A]/15' : 'bg-white/[0.02]'
                  }`}
                >
                  {piece && owner && (
                    <span
                      className="flex h-[80%] w-[80%] items-center justify-center rounded-full text-[12px] font-bold text-white"
                      style={{
                        backgroundColor: owner.color,
                        boxShadow: selected === index ? '0 0 0 2px rgba(255,255,255,0.85)' : 'inset 0 -2px 3px rgba(0,0,0,0.25)'
                      }}
                    >
                      {PIECE_NAMES[piece.rank]}
                    </span>
                  )}
                  {isLegal && !piece && <span className="absolute h-1.5 w-1.5 rounded-full bg-white/45" />}
                  {isLegal && piece && (
                    <span className="pointer-events-none absolute inset-1 rounded-full border-2 border-[#FF453A]/70" />
                  )}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            disabled={state.winner !== null}
            onClick={() => room.dispatch({ type: 'resign' })}
            className="ios-btn h-11 w-full rounded-full bg-[#3A3A3C] text-xs font-bold text-[#FF453A] disabled:opacity-30"
          >
            认输
          </button>

          {state.winner !== null && (
            <div className="rounded-2xl border border-[#FFD60A]/30 bg-[#FFD60A]/10 p-4 text-center text-sm font-bold text-white">
              {state.winner === props.mySeat ? '你赢了' : '对方赢了'}
            </div>
          )}
        </>
      )}
      <div className="text-[10px] text-gray-600">棋盘 {JUNGLE_COLS} 列 × 9 行</div>
    </div>
  );
}

function BluffOnline({ props }: { props: OnlinePlayViewProps }) {
  const room = useRoom<BluffState, BluffAction, BluffView>({
    adapter: bluffAdapter,
    roomId: props.room.roomId,
    mySeat: props.mySeat,
    hostSeat: props.room.hostSeat,
    players: props.players,
    kind: props.kind,
    enabled: true
  });

  const view = room.view;
  const [qty, setQty] = useState(2);
  const [face, setFace] = useState(1);
  const myTurn = view?.turn === props.mySeat && view?.phase === 'bid';

  const legal = useMemo(() => {
    if (!view?.bid) return true;
    return qty > view.bid.qty || (qty === view.bid.qty && face > view.bid.face);
  }, [face, qty, view?.bid]);

  return (
    <div className="space-y-3">
      <StatusBar
        mode="bluff"
        status={room.status}
        presence={room.presence}
        turnSeat={view?.turn ?? null}
        mySeat={props.mySeat}
        players={props.players}
      />

      {view && (
        <>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center">
            <div className="text-[10px] font-bold text-gray-500">你的骰子（对方看不到）</div>
            <div className="mt-2 flex justify-center gap-1.5">
              {(view.myDice ?? []).map((value, index) => (
                <span key={index} className="bluff-die flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold">
                  {value}
                </span>
              ))}
            </div>
            {view.oppDice && (
              <>
                <div className="mt-3 text-[10px] font-bold text-gray-500">对方骰子</div>
                <div className="mt-1 flex justify-center gap-1.5">
                  {view.oppDice.map((value, index) => (
                    <span key={index} className="bluff-die flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold">
                      {value}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 text-center">
            <div className="text-[10px] font-bold text-gray-500">当前叫点</div>
            <div className="mt-1 text-2xl font-bold text-white">
              {view.bid ? `${view.bid.qty} 个 ${view.bid.face}` : '尚未叫点'}
            </div>
            <div className="mt-1 text-[10px] text-gray-500">
              第 {view.round} 轮 · 你 {view.scores[props.mySeat]} : {view.scores[props.mySeat === 0 ? 1 : 0]} 对方
            </div>
          </div>

          {view.phase === 'bid' && myTurn && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center justify-between rounded-xl bg-white/[0.06] px-2 py-1.5">
                  <button type="button" onClick={() => setQty(v => Math.max(1, v - 1))} className="text-base font-bold text-white">−</button>
                  <span className="text-sm font-bold text-white">{qty} 个</span>
                  <button type="button" onClick={() => setQty(v => Math.min(10, v + 1))} className="text-base font-bold text-white">+</button>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-white/[0.06] px-2 py-1.5">
                  <button type="button" onClick={() => setFace(v => Math.max(1, v - 1))} className="text-base font-bold text-white">−</button>
                  <span className="text-sm font-bold text-white">{face} 点</span>
                  <button type="button" onClick={() => setFace(v => Math.min(6, v + 1))} className="text-base font-bold text-white">+</button>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!view.bid}
                  onClick={() => room.dispatch({ type: 'challenge' })}
                  className="ios-btn h-12 flex-1 rounded-full bg-[#FF453A] text-sm font-bold text-white disabled:opacity-30"
                >
                  开！
                </button>
                <button
                  type="button"
                  disabled={!legal}
                  onClick={() => room.dispatch({ type: 'bid', qty, face })}
                  className="ios-btn h-12 flex-[2] rounded-full bg-white text-sm font-bold text-black disabled:opacity-30"
                >
                  叫 {qty} 个 {face}
                </button>
              </div>
            </>
          )}

          {view.phase === 'reveal' && view.reveal && (
            <div className="space-y-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-center">
                <div className="text-sm font-bold text-white">
                  实际 {view.reveal.count} 个 · {view.reveal.loser === props.mySeat ? '你受罚' : '对方受罚'}
                </div>
                <div className="mt-1 text-[10px] text-gray-500">
                  {view.reveal.loser === props.mySeat ? '抽一张任务卡自己执行' : '对方抽一张任务卡'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => room.dispatch({ type: 'next' })}
                className="ios-btn h-12 w-full rounded-full bg-white text-sm font-bold text-black"
              >
                下一轮
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function OnlinePlayView(props: OnlinePlayViewProps) {
  const meta = MODE_META[props.room.mode];

  return (
    <div className="mobile-game-screen fixed inset-x-0 top-0 bottom-0 z-[120] flex flex-col bg-black">
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#101720] via-black to-[#141018] opacity-95" />
      <div className="relative z-10 mx-auto flex h-full w-full max-w-[430px] flex-col">
        <header className="mobile-screen-header flex shrink-0 items-center gap-3 px-4 py-2">
          <button onClick={props.onExit} className="ios-btn flex h-10 w-10 items-center justify-center rounded-full border border-white/5 bg-white/10" aria-label="退出联机">
            <ArrowLeft className="text-white" size={20} />
          </button>
          <div className="flex-1 text-center">
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#64D2FF]">Online</div>
            <div className="mt-1 text-sm font-bold text-white">{meta.label}</div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center text-gray-500">
            <meta.icon size={22} />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-3 no-scrollbar">
          {props.room.mode === 'go' && <GoOnline props={props} />}
          {props.room.mode === 'jungle' && <JungleOnline props={props} />}
          {props.room.mode === 'bluff' && <BluffOnline props={props} />}
        </main>
      </div>
    </div>
  );
}
