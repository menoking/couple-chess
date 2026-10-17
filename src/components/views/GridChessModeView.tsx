import { useState } from 'react';
import { ArrowLeft, CircleDot, RefreshCw, User, UserRound } from 'lucide-react';
import { Player, TaskEventData, Theme } from '../../types';
import { buildTaskPool, createViewTaskEvent, pickRandom } from '../../utils/modeKit';
import { TaskCardModal } from '../modals/TaskCardModal';

interface GridChessModeViewProps {
  players: Player[];
  themes: Theme[];
  onBack: () => void;
}

const DOTS = 5;
const CELLS_PER_SIDE = DOTS - 1;
const TOTAL_BOXES = CELLS_PER_SIDE * CELLS_PER_SIDE;

// 横线总数：DOTS 行 × (DOTS-1) 条
const H_LINES = DOTS * CELLS_PER_SIDE;
// 竖线总数：DOTS 列 × (DOTS-1) 条
const V_LINES = DOTS * CELLS_PER_SIDE;
const TOTAL_LINES = H_LINES + V_LINES;

interface LineOwner {
  ownerId: number | null;
}

function DotsAndBoxesGame({
  players,
  themes,
  onExit
}: {
  players: Player[];
  themes: Theme[];
  onExit: () => void;
}) {
  const [turn, setTurn] = useState(0);
  const [horizontal, setHorizontal] = useState<LineOwner[]>(() => new Array(H_LINES).fill(null).map(() => ({ ownerId: null })));
  const [vertical, setVertical] = useState<LineOwner[]>(() => new Array(V_LINES).fill(null).map(() => ({ ownerId: null })));
  const [boxes, setBoxes] = useState<number[]>(() => new Array(TOTAL_BOXES).fill(-1));
  const [taskData, setTaskData] = useState<TaskEventData | null>(null);
  const [finished, setFinished] = useState(false);

  const activePlayer = players[turn];
  const drawnLines = horizontal.filter(l => l.ownerId !== null).length + vertical.filter(l => l.ownerId !== null).length;
  const boxCounts = players.map(player => boxes.filter(owner => owner === player.id).length);

  const horizontalBoxes = (lineIndex: number): number[] => {
    const r = Math.floor(lineIndex / CELLS_PER_SIDE);
    const c = lineIndex % CELLS_PER_SIDE;
    const result: number[] = [];
    if (r > 0) result.push((r - 1) * CELLS_PER_SIDE + c);
    if (r < DOTS - 1) result.push(r * CELLS_PER_SIDE + c);
    return result;
  };

  // 竖线索引 = c * CELLS_PER_SIDE + r（c 列，r 行间隔）
  const verticalBoxes = (lineIndex: number): number[] => {
    const c = Math.floor(lineIndex / CELLS_PER_SIDE);
    const r = lineIndex % CELLS_PER_SIDE;
    const result: number[] = [];
    if (c > 0) result.push(r * CELLS_PER_SIDE + (c - 1));
    if (c < DOTS - 1) result.push(r * CELLS_PER_SIDE + c);
    return result;
  };

  const isBoxClosed = (boxIndex: number, h: LineOwner[], v: LineOwner[]): boolean => {
    const r = Math.floor(boxIndex / CELLS_PER_SIDE);
    const c = boxIndex % CELLS_PER_SIDE;
    // 上边：横线 r*CELLS_PER_SIDE + c
    const top = h[r * CELLS_PER_SIDE + c].ownerId !== null;
    // 下边：横线 (r+1)*CELLS_PER_SIDE + c
    const bottom = h[(r + 1) * CELLS_PER_SIDE + c].ownerId !== null;
    // 左边：竖线 c*CELLS_PER_SIDE + r
    const left = v[c * CELLS_PER_SIDE + r].ownerId !== null;
    // 右边：竖线 (c+1)*CELLS_PER_SIDE + r
    const right = v[(c + 1) * CELLS_PER_SIDE + r].ownerId !== null;
    return top && bottom && left && right;
  };

  const drawLine = (kind: 'h' | 'v', lineIndex: number) => {
    if (finished || taskData) return;
    const isH = kind === 'h';
    const currentLines = isH ? horizontal : vertical;
    if (currentLines[lineIndex].ownerId !== null) return;

    let nextH = horizontal;
    let nextV = vertical;
    if (isH) {
      nextH = horizontal.map((l, i) => (i === lineIndex ? { ownerId: turn } : l));
    } else {
      nextV = vertical.map((l, i) => (i === lineIndex ? { ownerId: turn } : l));
    }

    const affectedBoxes = isH ? horizontalBoxes(lineIndex) : verticalBoxes(lineIndex);
    const newlyClosed = affectedBoxes.filter(boxIdx => boxes[boxIdx] === -1 && isBoxClosed(boxIdx, nextH, nextV));

    if (newlyClosed.length > 0) {
      const nextBoxes = boxes.map((owner, i) => (newlyClosed.includes(i) ? turn : owner));
      setHorizontal(nextH);
      setVertical(nextV);
      setBoxes(nextBoxes);

      const pool = buildTaskPool(players, themes) ?? [];
      const entry = pickRandom(pool);
      if (entry) {
        setTaskData(createViewTaskEvent({ entry, title: `闭合 ${newlyClosed.length} 格 · 任务`, executorPlayerId: turn }));
      }
      return;
    }

    setHorizontal(nextH);
    setVertical(nextV);
    setTurn(turn === 0 ? 1 : 0);
  };

  const finishTask = () => {
    setTaskData(null);
    if (boxes.every(owner => owner !== -1)) {
      setFinished(true);
    }
    // 闭合格子者获得额外回合，turn 保持不变
  };

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

      <div className="flex items-center justify-center gap-2 rounded-2xl bg-white/5 py-3 text-sm font-bold text-white">
        {activePlayer?.id === 0 ? <User size={15} className="text-[#0A84FF]" /> : <UserRound size={15} className="text-[#FF375F]" />}
        {activePlayer?.name || '当前玩家'} 的回合：连接两个相邻的点
      </div>

      <DotsBoard
        dots={DOTS}
        horizontal={horizontal}
        vertical={vertical}
        boxes={boxes}
        players={players}
        onDrawLine={drawLine}
      />

      <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 text-[11px] leading-relaxed text-gray-500">
        规则：轮流连接相邻的两个点画一条线。谁连成某个正方形的最后一条边，谁就赢得那个格子，并获得一次额外回合；闭合格子还会触发一张任务卡。全部格子闭合后，格子多者获胜。
      </div>

      <TaskCardModal
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
  onDrawLine
}: {
  dots: number;
  horizontal: LineOwner[];
  vertical: LineOwner[];
  boxes: number[];
  players: Player[];
  onDrawLine: (kind: 'h' | 'v', index: number) => void;
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
            className="absolute flex items-center justify-center rounded-sm text-lg font-bold"
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
            onClick={() => onDrawLine('h', index)}
            aria-label={owner ? `${owner.name}已连接` : '连接横线'}
            className="absolute rounded-full transition-all"
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
            onClick={() => onDrawLine('v', index)}
            aria-label={owner ? `${owner.name}已连接` : '连接竖线'}
            className="absolute rounded-full transition-all"
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
            className="absolute rounded-full bg-white"
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

export function GridChessModeView({ players, themes, onBack }: GridChessModeViewProps) {
  const [runId, setRunId] = useState(0);

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
          <DotsAndBoxesGame key={runId} players={players} themes={themes} onExit={onBack} />

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
