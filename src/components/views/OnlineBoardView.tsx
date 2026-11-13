import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Sparkles, User, UserRound } from 'lucide-react';
import { PathCoord, Player, TaskEventData, TileType } from '../../types';
import { useModeState } from '../../rules/ModeRuntime';
import { calculateNewPosition, rollDice } from '../../utils/gameLogic';
import { GameBoard } from '../GameBoard';
import { Dice } from '../Dice';
import { diagLog } from '../../cloud/diagnostics';

interface OnlineBoardViewProps {
  players: Player[];
  pathCoords: PathCoord[];
  boardMap: TileType[];
  mySeat: number;
  /** 房主（唯一权威端）：只有它摇骰、走格、落格判定、换回合 */
  isAuthority: boolean;
  currentTurn: number;
  /** 队列里还有几张卡没确认；卡片确认后房主才交回合 */
  pendingCards: number;
  onCheckTile: (landing: number) => TaskEventData | 'win' | null;
  onTaskTrigger: (task: TaskEventData) => void;
  onBack: () => void;
}

const MOVE_DELAY = 200;
const ROLL_DELAY = 700;

/**
 * 联机专用飞行棋。
 *
 * 和同屏版本最大的区别：**访客端没有任何结算逻辑**。
 * 访客点骰子只是把 `rollReq` 加一；房主监听到请求后才生成点数、逐格推进、
 * 落格判定、抽卡、换回合，所有结果都写进共享状态，访客只负责渲染。
 * 这样从结构上就不可能出现「两端各走一遍、各抽一张」。
 */
export function OnlineBoardView({
  players,
  pathCoords,
  boardMap,
  mySeat,
  isAuthority,
  currentTurn,
  pendingCards,
  onCheckTile,
  onTaskTrigger,
  onBack
}: OnlineBoardViewProps) {
  const [turn, setTurn] = useModeState('OnlineBoard.turn', currentTurn);
  // 和房间的 stage.steps 共用同一个 key，OnlineStage 的 players.step 直接读到这里
  const [steps, setSteps] = useModeState<number[]>('stage.steps', [0, 0]);
  // 点数和序号一次性写入（不再先写「正在摇」再写「停止」），避免两个 patch 乱序把状态卡住
  const [roll, setRoll] = useModeState<{ token: number; result: number } | null>('OnlineBoard.roll', null);
  // 骰子转不转是本地动画，不参与同步
  const [localRolling, setLocalRolling] = useState(false);
  const [moving, setMoving] = useModeState('OnlineBoard.moving', false);
  const [rollReq, setRollReq] = useModeState('OnlineBoard.rollReq', 0);
  const [winner, setWinner] = useModeState<number | null>('OnlineBoard.winner', null);

  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const turnRef = useRef(turn);
  turnRef.current = turn;
  const pendingRef = useRef(pendingCards);
  pendingRef.current = pendingCards;
  const movingRef = useRef(moving);
  movingRef.current = moving;
  const rollRef = useRef(roll);
  rollRef.current = roll;
  const checkTileRef = useRef(onCheckTile);
  checkTileRef.current = onCheckTile;
  const taskTriggerRef = useRef(onTaskTrigger);
  taskTriggerRef.current = onTaskTrigger;

  const handledReq = useRef(0);
  const rollTimer = useRef<number | null>(null);
  const seenToken = useRef(0);
  const rollAnimTimer = useRef<number | null>(null);
  const waitingCard = useRef(false);
  const sawCard = useRef(false);

  const boardPlayers = players.map(player => ({ ...player, step: steps[player.id] ?? 0 }));
  const activePlayer = boardPlayers[turn] ?? boardPlayers[0];
  const turnNumber = Math.floor(Math.max(...boardPlayers.map(player => player.step)) / 4) + 1;

  const nextTurn = () => {
    setTurn(value => (value === 0 ? 1 : 0));
    waitingCard.current = false;
    sawCard.current = false;
  };

  const resolveLanding = (landing: number) => {
    setMoving(false);
    const seat = turnRef.current;
    const tile = checkTileRef.current(landing);
    diagLog('board-landing', {
      landing,
      seat,
      tile: typeof tile === 'string' ? tile : tile?.title ?? 'none'
    });

    if (tile === 'win') {
      setWinner(seat);
      return;
    }

    if (tile) {
      waitingCard.current = true;
      sawCard.current = false;
      taskTriggerRef.current(tile);
      // 卡片没能入队时兜底交回合，避免房主卡死
      window.setTimeout(() => {
        if (waitingCard.current && !sawCard.current) {
          waitingCard.current = false;
          nextTurn();
        }
      }, 2500);
      return;
    }

    nextTurn();
  };

  const startMove = (result: number) => {
    setMoving(true);
    const seat = turnRef.current;
    const from = stepsRef.current[seat] ?? 0;
    const landing = calculateNewPosition(from, result);
    let current = from;
    let direction: 1 | -1 = current === 48 ? -1 : 1;
    let moved = 0;

    const stepOnce = () => {
      current += direction;
      moved += 1;
      const value = current;
      setSteps(prev => {
        const next = [...prev];
        next[seat] = value;
        return next;
      });
      if (current === 48) direction = -1;
      if (current === 0) direction = 1;

      if (moved < result) {
        window.setTimeout(stepOnce, MOVE_DELAY);
        return;
      }
      window.setTimeout(() => resolveLanding(landing), MOVE_DELAY + 60);
    };

    window.setTimeout(stepOnce, MOVE_DELAY);
  };

  // 房主监听摇骰请求：点数、移动、落格全在这里一次跑完
  useEffect(() => {
    if (!isAuthority || winner !== null) return;
    if (rollReq <= handledReq.current) return;
    if (movingRef.current) return;
    handledReq.current = rollReq;

    const result = rollDice();
    const myReq = rollReq;
    const token = (rollRef.current?.token ?? 0) + 1;
    // 点数和序号一次性写入，两端只认新序号，不会出现「先转后停」两个 patch 乱序
    setRoll({ token, result });
    diagLog('board-roll', { result, turn: turnRef.current, mySeat });
    rollTimer.current = window.setTimeout(() => {
      if (handledReq.current !== myReq) return;
      rollTimer.current = null;
      startMove(result);
    }, ROLL_DELAY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollReq, isAuthority, winner, moving]);

  useEffect(() => () => {
    if (rollTimer.current !== null) window.clearTimeout(rollTimer.current);
  }, []);

  // 卡片确认后交回合：必须「先看到卡片入队，再看到队列清空」
  useEffect(() => {
    if (!isAuthority || !waitingCard.current) return;
    if (pendingCards > 0) {
      sawCard.current = true;
      return;
    }
    if (!sawCard.current) return;
    nextTurn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCards, isAuthority]);

  // 收到新房就本地播 0.7 秒骰子动画；序号回退直接忽略。
  // 定时器必须放 ref：房间每 1.5 秒同步一次快照，roll 的引用会变，
  // 如果用 effect cleanup 清定时器，「停骰子」那一步会被反复清掉。
  useEffect(() => {
    if (!roll) return;
    if (roll.token <= seenToken.current) return;
    seenToken.current = roll.token;
    setLocalRolling(true);
    if (rollAnimTimer.current !== null) window.clearTimeout(rollAnimTimer.current);
    rollAnimTimer.current = window.setTimeout(() => {
      rollAnimTimer.current = null;
      setLocalRolling(false);
    }, ROLL_DELAY);
  }, [roll]);

  useEffect(() => () => {
    if (rollAnimTimer.current !== null) window.clearTimeout(rollAnimTimer.current);
  }, []);

  // 房主兜底：移动状态万一没归位，6 秒后强制复位
  useEffect(() => {
    if (!isAuthority || !moving) return;
    const timer = window.setTimeout(() => setMoving(false), 6000);
    return () => window.clearTimeout(timer);
  }, [isAuthority, moving, setMoving]);

  const handleRoll = () => {
    if (winner !== null) return;
    if (mySeat !== turn) return;
    if (localRolling || moving) return;
    setRollReq(value => value + 1);
  };

  return (
    <div className="mobile-game-screen fixed inset-x-0 top-0 bottom-0 z-50 flex flex-col bg-black">
      <div className="absolute inset-0 z-0">
        <div className="h-full w-full bg-gradient-to-br from-gray-900 via-black to-gray-900 opacity-60" />
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      </div>

      <div className="relative z-10 mx-auto flex h-full w-full max-w-[430px] flex-col">
        <header className="mobile-screen-header flex shrink-0 items-center gap-3 px-4 py-2">
          <button
            type="button"
            onClick={onBack}
            className="ios-btn flex h-10 w-10 items-center justify-center rounded-full border border-white/5 bg-white/10"
          >
            <ArrowLeft className="text-white" size={20} />
          </button>
          <div className="flex flex-1 justify-center">
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-[#1C1C1E] p-1.5">
              <div
                className={`flex items-center gap-2 rounded-full px-3 py-1.5 transition-all duration-300 ${
                  turn === 0
                    ? 'bg-[#0A84FF] text-white shadow-lg shadow-blue-900/50'
                    : 'text-[#0A84FF] opacity-60'
                }`}
              >
                <User size={14} />
                <span className="text-xs font-bold">男方</span>
              </div>
              <div className="px-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                Turn {turnNumber}
              </div>
              <div
                className={`flex items-center gap-2 rounded-full px-3 py-1.5 transition-all duration-300 ${
                  turn === 1
                    ? 'bg-[#FF375F] text-white shadow-lg shadow-pink-900/50'
                    : 'text-[#FF375F] opacity-60'
                }`}
              >
                <span className="text-xs font-bold">女方</span>
                <UserRound size={14} />
              </div>
            </div>
          </div>
          <div className="w-10" />
        </header>

        {winner !== null && (
          <div className="mx-4 mb-2 flex items-center justify-center gap-2 rounded-2xl border border-[#30D158]/40 bg-[#30D158]/15 px-4 py-2.5">
            <Sparkles size={16} className="text-[#30D158]" />
            <span className="text-xs font-bold text-white">{boardPlayers[winner]?.name} 到达终点！</span>
          </div>
        )}

        <div className="game-board-space flex min-h-0 flex-1 items-center justify-center px-4">
          <GameBoard
            boardMap={boardMap}
            pathCoords={pathCoords}
            players={boardPlayers}
            currentTurn={turn}
          />
        </div>

        <div className="ios-glass mx-4 mb-2 flex h-[clamp(176px,30dvh,244px)] shrink-0 flex-col items-center justify-center rounded-[clamp(20px,4dvh,32px)] border border-white/10 px-6 py-4 shadow-2xl">
          <div
            className={`mb-3 text-center text-sm font-medium ${
              turn === mySeat ? 'animate-pulse' : ''
            } ${turn === 0 ? 'text-[#0A84FF]' : 'text-[#FF375F]'}`}
          >
            {turn === mySeat
              ? `${activePlayer?.name ?? ''}回合：点击骰子`
              : `等 ${activePlayer?.name ?? '对方'} 摇骰子`}
          </div>
          <div
            onClick={handleRoll}
            className={turn === mySeat && !localRolling && !moving ? 'cursor-pointer' : 'cursor-default'}
          >
            <Dice isRolling={localRolling} result={roll?.result ?? null} />
          </div>
          {turn === mySeat && !localRolling && !moving && (
            <div className="mt-2 text-[10px] font-bold text-gray-500">
              {isAuthority ? '本机裁决' : '由房主裁决'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
