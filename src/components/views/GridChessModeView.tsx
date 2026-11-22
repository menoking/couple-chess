import { useEffect, useRef } from 'react';
import { useModeState, useMyTurn } from '../../rules/ModeRuntime';

import { ArrowLeft, CircleDot, RefreshCw, User, UserRound } from 'lucide-react';
import { Player, TaskEventData, Theme } from '../../types';
import { buildTaskPool, createViewTaskEvent, pickRandom } from '../../utils/modeKit';
import { TaskCardModal } from '../modals/TaskCardModal';
import { DiceRollOff } from '../DiceRollOff';
import {
  GRID_DOTS,
  GRID_HORIZONTAL_LINES,
  GRID_TOTAL_BOXES,
  GRID_VERTICAL_LINES,
  applyGridLine,
  type GridLineOwner
} from '../../rules/gridChess';

interface GridChessModeViewProps {
  players: Player[];
  themes: Theme[];
  pendingCards?: number;
  onBack: () => void;
}

const TOTAL_LINES = GRID_HORIZONTAL_LINES + GRID_VERTICAL_LINES;

function DotsAndBoxesGame({
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
  const [turn, setTurn] = useModeState('GridChessModeView.turn', 0);
  const canAct = useMyTurn(turn);
  const [horizontal, setHorizontal] = useModeState<GridLineOwner[]>('GridChessModeView.horizontal', () => new Array(GRID_HORIZONTAL_LINES).fill(null).map(() => ({ ownerId: null })));
  const [vertical, setVertical] = useModeState<GridLineOwner[]>('GridChessModeView.vertical', () => new Array(GRID_VERTICAL_LINES).fill(null).map(() => ({ ownerId: null })));
  const [boxes, setBoxes] = useModeState<number[]>('GridChessModeView.boxes', () => new Array(GRID_TOTAL_BOXES).fill(-1));
  const [taskData, setTaskData] = useModeState<TaskEventData | null>('GridChessModeView.taskData', null);
  // 一次闭合 N 格要抽 N 张，用队列逐张弹，和围棋一致
  const [cardQueue, setCardQueue] = useModeState<Array<{ drawerId: number; executorId: number; reason: string; boxIndex?: number }>>(
    'GridChessModeView.cardQueue',
    []
  );
  const [finished, setFinished] = useModeState('GridChessModeView.finished', false);
  const [started, setStarted] = useModeState('GridChessModeView.started', false);

  const activePlayer = players[turn];
  const drawnLines = horizontal.filter(l => l.ownerId !== null).length + vertical.filter(l => l.ownerId !== null).length;
  const boxCounts = players.map(player => boxes.filter(owner => owner === player.id).length);

  // 按卡片来源标识消费，避免未来再次出现相同队列长度时误判为已处理。
  // 万一那条 patch 没落地，也不会把同一张卡反复入队（那样卡片永远翻不完）。
  const consumedCard = useRef<string | null>(null);

  // 依次弹出队列里的抽卡
  useEffect(() => {
    if (taskData || cardQueue.length === 0) return;
    const [next, ...rest] = cardQueue;
    const token = next.boxIndex === undefined
      ? `legacy:${cardQueue.length}:${next.drawerId}:${next.executorId}:${next.reason}`
      : `box:${next.boxIndex}`;
    if (consumedCard.current === token) return;
    consumedCard.current = token;
    const pool = buildTaskPool(players, themes) ?? [];
    const entry = pickRandom(pool);
    setCardQueue(rest);
    if (!entry) return;
    setTaskData(
      createViewTaskEvent({
        entry,
        title: next.reason,
        executorPlayerId: next.executorId,
        initiatorPlayerId: next.drawerId
      })
    );
  }, [cardQueue, taskData, players, themes, setCardQueue, setTaskData]);

  // 联机下任务卡会被公共 CardGate 接管，本地 taskData 不落地，
  // 「闭合最后一格 → 结算」不能只靠弹窗回调，这里按棋盘状态兜底。
  useEffect(() => {
    if (finished) return;
    if (cardQueue.length > 0) return;
    if (boxes.every(owner => owner !== -1)) setFinished(true);
  }, [boxes, cardQueue.length, finished, setFinished]);

  const drawLine = (kind: 'h' | 'v', lineIndex: number) => {
    if (!canAct) return;
    if (finished || taskData || cardQueue.length > 0 || pendingCards > 0) return;
    const result = applyGridLine({ horizontal, vertical, boxes }, kind, lineIndex, turn);
    if (!result) return;
    const { state: next, newlyClosed } = result;

    if (newlyClosed.length > 0) {
      if (kind === 'h') setHorizontal(next.horizontal);
      else setVertical(next.vertical);
      setBoxes(next.boxes);

      // 每闭合 1 格抽 1 张：闭合 3 格就入队 3 张，不再固定只抽 1 张
      setCardQueue(prev => [
        ...prev,
        ...newlyClosed.map(boxIndex => ({
          drawerId: turn,
          executorId: turn === 0 ? 1 : 0,
          reason: `闭合 ${newlyClosed.length} 格 · 对方执行`,
          boxIndex
        }))
      ]);
      return;
    }

    if (kind === 'h') setHorizontal(next.horizontal);
    else setVertical(next.vertical);
    setTurn(turn === 0 ? 1 : 0);
  };

  const finishTask = () => {
    setTaskData(null);
    // 队列里还有没抽完的卡时先不结算，等全部弹完再判结束
    if (cardQueue.length === 0 && boxes.every(owner => owner !== -1)) {
      setFinished(true);
    }
    // 闭合格子者获得额外回合，turn 保持不变
  };

  if (!started) {
    return (
      <DiceRollOff
        stateKey="GridChess"
        players={players}
        title="掷骰定先手"
        hint="点数大的一方先落子，点格棋先手更有优势"
        confirmLabel="确认，我先手"
        onComplete={winnerId => {
          setTurn(winnerId === 1 ? 1 : 0);
          setStarted(true);
        }}
      />
    );
  }

  if (finished) {
    const first = players[0];
    const second = players[1];
    const a = boxes.filter(owner => owner === first.id).length;
    const b = boxes.filter(owner => owner === second.id).length;
    const winner = a === b ? null : a > b ? first : second;
    return (
      <div className="space-y-4">
        <div className="rounded-3xl border border-[#FFD60A]/25 bg-[#FFD60A]/10 p-6 text-center">
          <CircleDot size={36} className="mx-auto text-[#FFD60A]" />
          <div className="mt-3 text-xl font-bold text-white">
            {winner ? `${winner.name} 闭合更多格子！` : '平分秋色，平局！'}
          </div>
          <div className="mt-4 space-y-2">
            {players.map(player => (
              <div key={player.id} className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                <span className="text-sm font-bold" style={{ color: player.color }}>{player.name}</span>
                <span className="text-lg font-bold text-white">{boxes.filter(owner => owner === player.id).length} 格</span>
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold text-gray-400">
          已画 {drawnLines} / {TOTAL_LINES} 条线
        </div>
        <div className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold">
          {players.map((player, index) => (
            <span key={player.id} style={{ color: player.color }}>
              {player.name} {boxCounts[index]} 格
            </span>
          ))}
        </div>
      </div>

      <div className={`flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold ${canAct ? 'bg-white/5 text-white' : 'bg-white/[0.02] text-gray-500'}`}>
        {activePlayer?.id === 0 ? <User size={15} className="text-[#0A84FF]" /> : <UserRound size={15} className="text-[#FF375F]" />}
        {canAct
          ? `${activePlayer?.name || '当前玩家'} 的回合：连接两个相邻的点`
          : `等 ${activePlayer?.name || '对方'} 落子…（你这边暂不可操作）`}
      </div>

      <DotsBoard
        dots={GRID_DOTS}
        horizontal={horizontal}
        vertical={vertical}
        boxes={boxes}
        players={players}
        onDrawLine={drawLine}
        disabled={!canAct || cardQueue.length > 0 || pendingCards > 0}
      />

      <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 text-[11px] leading-relaxed text-gray-500">
        规则：轮流连接相邻的两个点画一条线。谁连成某个正方形的最后一条边，谁就赢得那个格子，并获得一次额外回合；每闭合一个格子，你抽 1 张任务卡、由对方执行。全部格子闭合后，格子多者获胜。
      </div>

      <TaskCardModal
        players={players}
        isOpen={!!taskData}
        taskData={taskData}
        onAccept={finishTask}
        onReject={finishTask}
        onClose={finishTask}
      />
    </div>
  );
}

function DotsBoard({
  dots,
  horizontal,
  vertical,
  boxes,
  players,
  onDrawLine,
  disabled = false
}: {
  dots: number;
  horizontal: GridLineOwner[];
  vertical: GridLineOwner[];
  boxes: number[];
  players: Player[];
  onDrawLine: (kind: 'h' | 'v', index: number) => void;
  /** 非我方回合：整块棋盘不接收点击，杜绝「替对方走棋」 */
  disabled?: boolean;
}) {
  const cells = dots - 1;
  const dotSize = 12;
  const cellSize = 64;
  const boardWidth = cells * cellSize + dotSize;

  const renderBoxes = () => {
    const boxesArr = [];
    for (let r = 0; r < cells; r++) {
      for (let c = 0; c < cells; c++) {
        const index = r * cells + c;
        const ownerId = boxes[index];
        const owner = ownerId !== -1 ? players.find(p => p.id === ownerId) : undefined;
        if (!owner) continue;
        boxesArr.push(
          <div
            key={`box-${index}`}
            className="pointer-events-none absolute flex items-center justify-center rounded-sm text-lg font-bold"
            style={{
              left: c * cellSize + dotSize,
              top: r * cellSize + dotSize,
              width: cellSize - dotSize,
              height: cellSize - dotSize,
              color: owner.color,
              backgroundColor: `${owner.color}22`
            }}
          >
            {owner.name.charAt(0)}
          </div>
        );
      }
    }
    return boxesArr;
  };

  const renderHorizontal = () => {
    const lines = [];
    for (let r = 0; r < dots; r++) {
      for (let c = 0; c < cells; c++) {
        const index = r * cells + c;
        const line = horizontal[index];
        const owner = line.ownerId !== null ? players.find(p => p.id === line.ownerId) : undefined;
        lines.push(
          <button
            key={`h-${index}`}
            type="button"
            disabled={disabled || !!owner}
            onClick={() => onDrawLine('h', index)}
            aria-label={owner ? `${owner.name}已连接` : '连接横线'}
            className="absolute z-10 rounded-full transition-all disabled:cursor-default"
            style={{
              left: c * cellSize + dotSize,
              top: r * cellSize,
              width: cellSize - 4,
              height: 6,
              backgroundColor: owner ? owner.color : 'rgba(255,255,255,0.15)'
            }}
          />
        );
      }
    }
    return lines;
  };

  const renderVertical = () => {
    const lines = [];
    for (let c = 0; c < dots; c++) {
      for (let r = 0; r < cells; r++) {
        const index = c * cells + r;
        const line = vertical[index];
        const owner = line.ownerId !== null ? players.find(p => p.id === line.ownerId) : undefined;
        lines.push(
          <button
            key={`v-${index}`}
            type="button"
            disabled={disabled || !!owner}
            onClick={() => onDrawLine('v', index)}
            aria-label={owner ? `${owner.name}已连接` : '连接竖线'}
            className="absolute z-10 rounded-full transition-all disabled:cursor-default"
            style={{
              left: c * cellSize,
              top: r * cellSize + dotSize,
              width: 6,
              height: cellSize - 4,
              backgroundColor: owner ? owner.color : 'rgba(255,255,255,0.15)'
            }}
          />
        );
      }
    }
    return lines;
  };

  const renderDots = () => {
    const dotsArr = [];
    for (let r = 0; r <= cells; r++) {
      for (let c = 0; c <= cells; c++) {
        dotsArr.push(
          <div
            key={`dot-${r}-${c}`}
            className="pointer-events-none absolute z-20 rounded-full bg-white"
            style={{
              left: c * cellSize,
              top: r * cellSize,
              width: dotSize,
              height: dotSize
            }}
          />
        );
      }
    }
    return dotsArr;
  };

  return (
    <div className="flex justify-center">
      <div
        className="relative"
        style={{ width: boardWidth, height: boardWidth }}
      >
        {renderBoxes()}
        {renderHorizontal()}
        {renderVertical()}
        {renderDots()}
      </div>
    </div>
  );
}

export function GridChessModeView({ players, themes, pendingCards = 0, onBack }: GridChessModeViewProps) {
  const [runId, setRunId] = useModeState('GridChessModeView.runId', 0);

  return (
    <div className="mobile-game-screen fixed inset-x-0 top-0 bottom-0 z-50 flex flex-col bg-black">
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#251f10] via-black to-[#0d1724] opacity-90" />

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
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#FFD60A]">Dots & Boxes</div>
            <div className="mt-1 text-sm font-bold text-white">点格棋 · 连接点闭合格子</div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center text-gray-500">
            <CircleDot size={22} />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 no-scrollbar">
          <DotsAndBoxesGame key={runId} players={players} themes={themes} pendingCards={pendingCards} onExit={onBack} />

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
