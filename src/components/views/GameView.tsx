import { useModeRuntime, useModeState } from '../../rules/ModeRuntime';
import { useCallback } from 'react';
import { Player, PathCoord, TileType, TaskEventData } from '../../types';
import { GameBoard } from '../GameBoard';
import { Dice } from '../Dice';
import { calculateNewPosition, rollDice } from '../../utils/gameLogic';
import { User, UserRound, ArrowLeft } from 'lucide-react';

interface GameViewProps {
  players: Player[];
  boardMap: TileType[];
  pathCoords: PathCoord[];
  currentTurn: number;
  isRolling: boolean;
  onMove: (steps: number) => void;
  onCheckTile: (landingStep: number) => TaskEventData | 'win' | null;
  onEndTurn: () => void;
  onSetRolling: (rolling: boolean) => void;
  onWin: (winnerId: number) => void;
  onTaskTrigger: (data: TaskEventData) => void;
  onBack: () => void;
}

export function GameView({
  players,
  boardMap,
  pathCoords,
  currentTurn,
  isRolling,
  onMove,
  onCheckTile,
  onEndTurn,
  onSetRolling,
  onWin,
  onTaskTrigger,
  onBack
}: GameViewProps) {
  const [diceResult, setDiceResult] = useModeState<number | null>('GameView.diceResult', null);
  const [isMoving, setIsMoving] = useModeState('GameView.isMoving', false);
  // 谁摇的骰子：共享的骰子结果会让两端都触发结算，只有摇骰子的设备能真正走格
  const [rollerSeat, setRollerSeat] = useModeState<number | null>('GameView.rollerSeat', null);
  const runtime = useModeRuntime();
  const mySeat = runtime?.seat ?? null;

  const handleRoll = useCallback(() => {
    if (isRolling || isMoving || diceResult) return;
    // 联机时只有当前回合方可以摇骰子
    if (mySeat !== null && currentTurn !== mySeat) return;

    setRollerSeat(currentTurn);
    onSetRolling(true);
    const result = rollDice();

    if (navigator.vibrate) {
      navigator.vibrate(20);
    }

    setTimeout(() => {
      setDiceResult(result);
      onSetRolling(false);
    }, 1000);
  }, [isRolling, isMoving, diceResult, onSetRolling, mySeat, currentTurn, setRollerSeat]);

  const handleRollComplete = useCallback(() => {
    // 同屏（mySeat 为 null）照旧；联机只有摇骰子的那一端执行走格/抽卡/换回合
    const isRoller = mySeat === null || rollerSeat === mySeat;
    if (diceResult && isRoller) {
      const landingStep = calculateNewPosition(players[currentTurn].step, diceResult);
      setIsMoving(true);

      const moveDelayMs = 220;
      let movedSteps = 0;
      let currentStep = players[currentTurn].step;
      let direction: 1 | -1 = currentStep === 48 ? -1 : 1;

      const stepOnce = () => {
        currentStep += direction;
        onMove(direction);
        movedSteps += 1;

        if (currentStep === 48) direction = -1;
        if (currentStep === 0) direction = 1;

        if (movedSteps < diceResult) {
          setTimeout(stepOnce, moveDelayMs);
          return;
        }

        setTimeout(() => {
          const tileCheck = onCheckTile(landingStep);

          if (tileCheck === 'win') {
            onWin(currentTurn);
          } else if (tileCheck) {
            onTaskTrigger(tileCheck);
          } else {
            onEndTurn();
          }

          setDiceResult(null);
          setIsMoving(false);
        }, moveDelayMs);
      };

      setTimeout(stepOnce, moveDelayMs);
    }
  }, [diceResult, players, currentTurn, onMove, onCheckTile, onWin, onTaskTrigger, onEndTurn, mySeat, rollerSeat]);

  const activePlayer = players[currentTurn];
  const turnNumber = Math.floor(Math.max(...players.map(p => p.step)) / 4) + 1;

  return (
    <div className="mobile-game-screen fixed inset-x-0 top-0 bottom-0 z-50 bg-black flex flex-col">
      <div className="absolute inset-0 z-0">
        <div className="w-full h-full bg-gradient-to-br from-gray-900 via-black to-gray-900 opacity-60" />
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      </div>

      <div className="relative z-10 flex flex-col h-full max-w-[430px] mx-auto w-full">
        <header className="mobile-screen-header py-2 px-4 flex items-center gap-3 shrink-0">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center ios-btn border border-white/5"
          >
            <ArrowLeft className="text-white" size={20} />
          </button>
          <div className="flex-1 flex justify-center">
            <div className="p-1.5 bg-[#1C1C1E] rounded-full flex items-center gap-2 border border-white/10">
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-all duration-300 ${
                  currentTurn === 0
                    ? 'bg-[#0A84FF] text-white shadow-lg shadow-blue-900/50'
                    : 'text-[#0A84FF] opacity-60'
                }`}
              >
                <User size={14} />
                <span className="text-xs font-bold">男方</span>
              </div>
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-2">
                Turn {turnNumber}
              </div>
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-all duration-300 ${
                  currentTurn === 1
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

        <div className="game-board-space flex-1 min-h-0 flex items-center justify-center px-4">
          <GameBoard
            boardMap={boardMap}
            pathCoords={pathCoords}
            players={players}
            currentTurn={currentTurn}
          />
        </div>

        <div className="mx-4 mb-2 h-[clamp(176px,30dvh,244px)] ios-glass rounded-[clamp(20px,4dvh,32px)] flex flex-col items-center justify-center py-4 px-6 border border-white/10 shadow-2xl shrink-0">
          <div
            className={`text-sm font-medium mb-3 text-center animate-pulse ${
              currentTurn === 0 ? 'text-[#0A84FF]' : 'text-[#FF375F]'
            }`}
          >
            {activePlayer.name}回合：点击骰子
          </div>
          <div onClick={handleRoll}>
            <Dice
              isRolling={isRolling}
              result={diceResult}
              onRollComplete={handleRollComplete}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
