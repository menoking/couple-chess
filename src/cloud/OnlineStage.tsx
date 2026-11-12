import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Lock, RefreshCw, Sparkles, Users, Wifi, WifiOff } from 'lucide-react';
import type {
  BingoBoard,
  BingoCellResult,
  GameMode,
  MineRevealResult,
  MineTaskChoice,
  MineTile,
  PathCoord,
  Player,
  TaskCard,
  TaskEventData,
  Theme,
  TileType
} from '../types';
import { MineBombChoiceModal } from '../components/modals/MineBombChoiceModal';
import { GameView } from '../components/views/GameView';
import { CardModeView } from '../components/views/CardModeView';
import { MineModeView } from '../components/views/MineModeView';
import { PoseModeView } from '../components/views/PoseModeView';
import { RouletteModeView } from '../components/views/RouletteModeView';
import { BingoModeView } from '../components/views/BingoModeView';
import { QuizModeView } from '../components/views/QuizModeView';
import { MemoryModeView } from '../components/views/MemoryModeView';
import { TimedModeView } from '../components/views/TimedModeView';
import { StoryModeView } from '../components/views/StoryModeView';
import { SurvivalModeView } from '../components/views/SurvivalModeView';
import { TerritoryModeView } from '../components/views/TerritoryModeView';
import { AuctionModeView } from '../components/views/AuctionModeView';
import { GridChessModeView } from '../components/views/GridChessModeView';
import { TruthDareModeView } from '../components/views/TruthDareModeView';
import { GambleModeView } from '../components/views/GambleModeView';
import { EdgeModeView } from '../components/views/EdgeModeView';
import { PenaltyLadderModeView } from '../components/views/PenaltyLadderModeView';
import { SecretDoubleModeView } from '../components/views/SecretDoubleModeView';
import { RoleplayModeView } from '../components/views/RoleplayModeView';
import { SudokuModeView } from '../components/views/SudokuModeView';
import { GoModeView } from '../components/views/GoModeView';
import { BluffDiceModeView } from '../components/views/BluffDiceModeView';
import { JungleModeView } from '../components/views/JungleModeView';

import type { RoomAction, RoomSnapshot, Role, Seat } from '../rules/types';
import { cardFor, extractCard } from '../rules/cards';
import { buildMergedTheme, buildOnlinePlayers, MERGED_THEME_ID, PLAYER_NAME } from '../rules/identity';
import { picksToPool } from '../rules/lobby';
import { ALL_THEME_MODES, MODE_LABEL, MODE_REGISTRY } from '../rules/registry';
import { createRoom } from '../rules/room';
import { ModeRuntimeProvider } from '../rules/ModeRuntime';
import {
  BINGO_BOARD_SIZE,
  calculateNewPosition,
  generateBingoBoard,
  generateBoardMap,
  generateMineBoard,
  generateSpiralPath
} from '../utils/gameLogic';
import { completeBingoCellOnBoard, createMineTaskEvent, resolveBoardTile } from '../rules/modeRules';
import { useSharedRoom } from './useSharedRoom';
import type { TransportKind } from './transport';

export interface OnlineStageProps {
  roomId: string;
  mode: GameMode;
  mySeat: Seat;
  hostSeat: Seat;
  roles: [Role, Role];
  myRole: Role;
  themes: Theme[];
  kind: TransportKind;
  onExit: () => void;
}

const other = (seat: Seat): Seat => (seat === 0 ? 1 : 0);

function poolTask(snap: RoomSnapshot, executorSeat: Seat, reason = '抽到一张任务卡'): TaskEventData {
  const card = cardFor(snap.cardPool, snap.cardSeq + 1);
  return {
    type: 'card',
    initiatorPlayerId: other(executorSeat),
    executorPlayerId: executorSeat,
    title: reason,
    subtitle: `来自「${card.themeName}」`,
    icon: 'sparkles',
    color: executorSeat === 0 ? 'text-[#0A84FF]' : 'text-[#FF375F]',
    task: card.task,
    taskSourceId: 'online',
    moveDelta: 0
  };
}

/** 四阶段抽卡闸门：胜方抽卡看到 → 败方才能翻卡 → 败方确认后出队。 */
function CardGate({
  snap,
  mySeat,
  players,
  dispatch
}: {
  snap: RoomSnapshot;
  mySeat: Seat;
  players: Player[];
  dispatch: (action: RoomAction) => void;
}) {
  const card = snap.cards[0];
  if (!card) return null;

  const isDrawer = card.drawerSeat === mySeat;
  const isExecutor = card.executorSeat === mySeat;
  const drawerName = players.find(p => p.id === card.drawerSeat)?.name ?? '对方';
  const executorName = players.find(p => p.id === card.executorSeat)?.name ?? '对方';
  const face = card.card;

  const strip = (
    <div className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-bold">
      <span className="rounded-full px-2 py-0.5" style={{ backgroundColor: `${players[card.drawerSeat]?.color ?? '#0A84FF'}22`, color: players[card.drawerSeat]?.color ?? '#0A84FF' }}>
        抽卡 · {drawerName}
      </span>
      <span className="text-gray-500">→</span>
      <span className="rounded-full px-2 py-0.5" style={{ backgroundColor: `${players[card.executorSeat]?.color ?? '#FF375F'}22`, color: players[card.executorSeat]?.color ?? '#FF375F' }}>
        执行 · {executorName}
      </span>
    </div>
  );

  let body;
  if (card.phase === 'locked') {
    body = isDrawer ? (
      <>
        <Lock size={34} className="mb-4 text-[#FFD60A]" />
        <h3 className="mb-1 text-xl font-bold text-white">你赢了，来抽一张卡</h3>
        <p className="mb-5 text-xs text-gray-400">抽出后只有你能先看到，对方仍处锁定状态</p>
        <button
          type="button"
          onClick={() => dispatch({ type: 'drawCard', seat: mySeat })}
          className="ios-btn h-12 w-full rounded-full bg-white text-sm font-bold text-black"
        >
          抽卡并查看
        </button>
      </>
    ) : (
      <>
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/[0.06]">
          <Lock size={26} className="text-gray-400" />
        </div>
        <h3 className="mb-1 text-xl font-bold text-white">卡片已锁定</h3>
        <p className="mb-2 text-xs text-gray-400">等 {drawerName} 先抽卡并查看后，你才能翻卡</p>
        <div className="w-full rounded-full border border-white/10 bg-white/[0.05] px-3 py-3 text-center text-[11px] font-bold text-gray-400">
          锁定中 · 暂不可翻卡
        </div>
      </>
    );
  } else if (card.phase === 'drawn') {
    body = isDrawer ? (
      <>
        <Sparkles size={28} className="mb-3 text-[#FFD60A]" />
        <h3 className="mb-3 text-lg font-bold text-white">你抽到的卡</h3>
        {face && (
          <div className="mb-3 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-5 text-center text-base font-medium leading-relaxed text-white">
            {face.task}
          </div>
        )}
        <div className="w-full rounded-full border border-white/10 bg-white/[0.05] px-3 py-3 text-center text-[11px] font-bold text-gray-300">
          等 {executorName} 在自己手机上翻卡查看
        </div>
      </>
    ) : (
      <>
        <h3 className="mb-1 text-xl font-bold text-white">{drawerName} 已抽卡</h3>
        <p className="mb-5 text-xs text-gray-400">现在轮到你翻卡查看，卡面尚未显示</p>
        <button
          type="button"
          onClick={() => dispatch({ type: 'revealCard', seat: mySeat })}
          className="ios-btn h-12 w-full rounded-full bg-white text-sm font-bold text-black"
        >
          翻卡查看
        </button>
      </>
    );
  } else {
    body = (
      <>
        <Sparkles size={28} className="mb-3 text-[#FFD60A]" />
        <h3 className="mb-3 text-lg font-bold text-white">{card.reason}</h3>
        {face && (
          <div className="mb-3 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-5 text-center text-base font-medium leading-relaxed text-white">
            {face.task}
          </div>
        )}
        {face && <p className="mb-4 text-[11px] text-gray-500">来自「{face.themeName}」 · 由 {executorName} 执行</p>}
        {isExecutor ? (
          <div className="flex w-full gap-3">
            <button
              type="button"
              onClick={() => dispatch({ type: 'ackCard', seat: mySeat })}
              className="ios-btn h-11 flex-1 rounded-full bg-[#3A3A3C] text-xs font-bold text-[#FF453A]"
            >
              跳过任务
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'ackCard', seat: mySeat })}
              className="ios-btn h-11 flex-1 rounded-full bg-white text-xs font-bold text-black"
            >
              接受任务
            </button>
          </div>
        ) : (
          <div className="w-full rounded-full border border-white/10 bg-white/[0.05] px-3 py-3 text-center text-[11px] font-bold text-gray-300">
            等 {executorName} 确认后自动关闭
          </div>
        )}
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/85 px-5 backdrop-blur-md">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#1C1C1E] p-6 shadow-2xl">
        <div className="mb-4 text-center text-[10px] font-bold uppercase tracking-widest text-gray-500">
          {card.reason}{snap.cards.length > 1 ? ` · 后面还有 ${snap.cards.length - 1} 张` : ''}
        </div>
        {body}
        <div className="mt-4">{strip}</div>
      </div>
    </div>
  );
}

export function OnlineStage(props: OnlineStageProps) {
  const { roomId, mode, mySeat, hostSeat, roles, myRole, themes, kind, onExit } = props;
  const isHost = mySeat === hostSeat;

  const createInitial = useCallback(
    () => createRoom(mode, roles, hostSeat, hostSeat),
    [mode, roles, hostSeat]
  );
  const shared = useSharedRoom({ roomId, mySeat, hostSeat, kind, enabled: true, createInitial });
  const snap = shared.snapshot;
  const dispatch = shared.dispatch;

  const [selected, setSelected] = useState<string[]>([]);
  const [bombOpen, setBombOpen] = useState(false);

  useEffect(() => {
    if (snap) setSelected(snap.picks[mySeat].themeIds);
    // 只在对方的锁定动作变化时同步，避免覆盖本机的多选
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap?.picks[mySeat].locked, mySeat]);

  // 权威端生成一次棋盘类共享数据，两台设备看到同一份
  useEffect(() => {
    if (!isHost || !snap || shared.status !== 'playing') return;
    const data = snap.data;
    if (data['stage.boardMap'] === undefined) shared.runtime.patch('stage.boardMap', generateBoardMap());
    if (data['stage.pathCoords'] === undefined) shared.runtime.patch('stage.pathCoords', generateSpiralPath());
    if (data['stage.mineBoard'] === undefined) shared.runtime.patch('stage.mineBoard', generateMineBoard());
    if (snap.lobbyLocked && data['stage.bingoBoard'] === undefined) {
      const tasks: TaskCard[] = snap.cardPool.map(card => ({ text: card.task, executor: 'both', moveDelta: 0 }));
      shared.runtime.patch('stage.bingoBoard', generateBingoBoard([{ themeId: MERGED_THEME_ID, tasks }], BINGO_BOARD_SIZE));
    }
  }, [isHost, snap, shared.status, shared.runtime]);

  const onlineThemes = useMemo<Theme[]>(() => {
    const tasks: TaskCard[] = (snap?.cardPool ?? []).map(card => ({
      text: card.task,
      executor: 'both',
      moveDelta: 0
    }));
    return [buildMergedTheme(tasks, ALL_THEME_MODES), ...themes];
  }, [snap?.cardPool, themes]);

  const players = useMemo<Player[]>(() => {
    const steps = (snap?.data['stage.steps'] as number[] | undefined) ?? [0, 0];
    return buildOnlinePlayers(roles, MERGED_THEME_ID).map(player => ({ ...player, step: steps[player.id] ?? 0 }));
  }, [roles, snap?.data]);

  if (!snap || shared.status === 'connecting' || shared.status === 'idle') {
    return (
      <div className="mobile-game-screen fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black px-6 text-center">
        <Wifi size={32} className="animate-pulse text-[#64D2FF]" />
        <div className="text-base font-bold text-white">正在连接房间…</div>
        <div className="text-xs text-gray-500">房间 {roomId.slice(-8)} · 座位 {mySeat === 0 ? '男方' : '女方'} · {isHost ? '房主' : '访客'}</div>
        <button type="button" onClick={shared.requestView} className="ios-btn rounded-full border border-white/10 px-4 py-2 text-xs text-gray-300">重试连接</button>
        <button type="button" onClick={onExit} className="ios-btn text-xs text-gray-500">退出房间</button>
      </div>
    );
  }

  if (shared.status === 'error') {
    return (
      <div className="mobile-game-screen fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black px-6 text-center">
        <WifiOff size={32} className="text-[#FF453A]" />
        <div className="text-base font-bold text-white">连接失败</div>
        <div className="text-xs text-[#FF7A96]">{shared.error}</div>
        <button type="button" onClick={onExit} className="ios-btn rounded-full bg-white px-5 py-2 text-xs font-bold text-black">退出房间</button>
      </div>
    );
  }

  const myPick = snap.picks[mySeat];
  const oppPick = snap.picks[other(mySeat)];
  const rule = MODE_REGISTRY.find(item => item.key === mode)?.cardRule ?? '';

  const header = (
    <div className="shrink-0 border-b border-white/10 bg-[#1C1C1E]/90 px-4 py-2 backdrop-blur">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onExit} className="ios-btn flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-gray-300" aria-label="退出房间">
          <ArrowLeft size={15} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-bold text-white">{MODE_LABEL[mode]}</div>
          <div className="truncate text-[10px] text-gray-500">房间 {roomId.slice(-8)} · 我是 {PLAYER_NAME[myRole]} · {isHost ? '房主' : '访客'} · 先手 {PLAYER_NAME[roles[snap.turn]]}</div>
        </div>
        <button
          type="button"
          onClick={() => dispatch({ type: 'restart', seat: mySeat })}
          className="ios-btn flex h-8 items-center gap-1 rounded-full bg-white/10 px-3 text-[10px] font-bold text-gray-300"
        >
          <RefreshCw size={12} /> 重开
        </button>
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-gray-500">
        <span className="flex items-center gap-1"><Users size={11} /> 在场 {shared.presence.length}/2</span>
        <span className="truncate">抽卡：{rule}</span>
      </div>
      {snap.cards.length > 0 && <div className="mt-1 text-center text-[10px] font-bold text-[#FFD60A]">抽卡中 · 玩法操作已锁定</div>}
    </div>
  );

  if (!snap.lobbyLocked) {
    const myPool = picksToPool(themes, selected);
    return (
      <div className="mobile-game-screen fixed inset-0 z-50 flex flex-col bg-black">
        {header}
        <div className="flex-1 overflow-y-auto px-5 py-5 no-scrollbar">
          <div className="mb-1 text-base font-bold text-white">各自选卡包</div>
          <div className="mb-4 text-[11px] leading-relaxed text-gray-500">
            两台设备各选自己想玩的任务包，双方都点「锁定」后自动合并成公共题库，再一起开局。
          </div>

          <div className="mb-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <div className="text-[10px] text-gray-500">我 · {PLAYER_NAME[myRole]}</div>
              <div className="mt-1 text-sm font-bold text-white">{myPick.locked ? '已锁定' : `已选 ${selected.length} 个包`}</div>
              <div className="text-[10px] text-gray-500">{myPool.length} 张任务</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <div className="text-[10px] text-gray-500">对方 · {PLAYER_NAME[roles[other(mySeat)]]}</div>
              <div className="mt-1 text-sm font-bold text-white">{oppPick.locked ? '已锁定' : '选择中'}</div>
              <div className="text-[10px] text-gray-500">{snap.draftPools[other(mySeat)].length} 张任务</div>
            </div>
          </div>

          {!myPick.locked ? (
            <>
              <div className="mb-2 text-[11px] font-bold text-gray-300">勾选卡包（可多选）</div>
              <div className="space-y-2">
                {themes.map(theme => {
                  const active = selected.includes(theme.id);
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => setSelected(current => active ? current.filter(id => id !== theme.id) : [...current, theme.id])}
                      className={`ios-btn flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left ${active ? 'border-[#30D158]/50 bg-[#30D158]/10' : 'border-white/10 bg-white/[0.04]'}`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-bold text-white">{theme.name}</span>
                        <span className="block text-[10px] text-gray-500">{theme.tasks.length} 张任务 · {theme.audience === 'common' ? '通用' : theme.audience === 'male' ? '男方' : '女方'}</span>
                      </span>
                      {active && <Check size={15} className="shrink-0 text-[#30D158]" />}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => dispatch({ type: 'lockLobby', seat: mySeat, themeIds: selected, pool: myPool })}
                className="ios-btn mt-4 h-12 w-full rounded-full bg-white text-sm font-bold text-black"
              >
                锁定我的卡包
              </button>
              <button
                type="button"
                onClick={() => dispatch({ type: 'forceLobby', seat: mySeat, pool: myPool.length ? myPool : snap.cardPool })}
                className="ios-btn mt-2 h-10 w-full rounded-full border border-white/10 text-[11px] font-bold text-gray-400"
              >
                对方还没上线 · 先用我的卡包开局
              </button>
            </>
          ) : (
            <div className="rounded-2xl border border-[#30D158]/30 bg-[#30D158]/10 p-4 text-center">
              <div className="text-sm font-bold text-white">我方卡包已锁定</div>
              <div className="mt-1 text-[11px] text-gray-400">{oppPick.locked ? '正在合并题库…' : '等对方也点「锁定我的卡包」就会自动开局'}</div>
              <button
                type="button"
                onClick={() => dispatch({ type: 'unlockLobby', seat: mySeat })}
                className="ios-btn mt-3 rounded-full border border-white/10 px-4 py-2 text-[11px] text-gray-300"
              >
                修改我的选择
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const data = snap.data;
  const poseImage = data['stage.poseImage'] as string | undefined;
  const boardMap = (data['stage.boardMap'] as TileType[] | undefined) ?? [];
  const pathCoords = (data['stage.pathCoords'] as PathCoord[] | undefined) ?? [];
  const mineBoard = (data['stage.mineBoard'] as MineTile[] | undefined) ?? [];
  const bingoBoard = data['stage.bingoBoard'] as BingoBoard | undefined;
  const isRolling = Boolean(data['stage.isRolling']);
  const patch = shared.runtime.patch;

  const enqueue = (task: TaskEventData | null | undefined) => {
    const found = extractCard(task ?? null);
    dispatch({
      type: 'enqueueCard',
      drawerSeat: found?.drawerSeat ?? other(mySeat),
      executorSeat: found?.executorSeat ?? mySeat,
      reason: found?.reason ?? '抽到一张任务卡',
      card: found?.card,
      moveDelta: found?.moveDelta ?? 0
    });
  };

  const endTurn = () => dispatch({ type: 'endTurn', seat: mySeat });
  const onBack = onExit;
  const onDrawTask = () => poolTask(snap, other(mySeat));
  const onTaskTrigger = (task: TaskEventData) => enqueue(task);
  // 扫雷炸弹：三选一由对方指定（与同屏 chooseMineBombTask 一致）
  const onBombTrigger = () => setBombOpen(true);
  const onChooseBomb = (choice: MineTaskChoice) => {
    setBombOpen(false);
    const turnSeat: Seat = snap.turn === 1 ? 1 : 0;
    const task = createMineTaskEvent(players, onlineThemes, turnSeat, choice, other(turnSeat));
    if (task) enqueue(task);
    else endTurn();
  };
  const onPoseTrigger = (src: string) => patch('stage.poseImage', src);
  const onWin = (winnerId: number) => enqueue(poolTask(snap, other(winnerId === 1 ? 1 : 0), '终局 · 胜方抽卡'));
  const onSetRolling = (rolling: boolean) => patch('stage.isRolling', rolling);
  // GameView 每次只传 +1/-1，按同屏 calculateNewPosition 逐格推进
  const onMove = (delta: number) => {
    const current = (data['stage.steps'] as number[] | undefined) ?? [0, 0];
    const next = [...current];
    next[snap.turn] = calculateNewPosition(next[snap.turn] ?? 0, delta);
    patch('stage.steps', next);
  };
  const onCheckTile = (landingStep: number): TaskEventData | 'win' | null =>
    resolveBoardTile({ landingStep, players, themes: onlineThemes, turn: snap.turn, boardMap });
  const onRevealTile = (index: number): MineRevealResult | null => {
    const board = [...mineBoard];
    if (!board[index] || board[index].revealed) return null;
    board[index] = { ...board[index], revealed: true };
    patch('stage.mineBoard', board);
    const type = board[index].type;
    if (type === 'blank') return { type: 'blank' };
    if (type === 'bomb') return { type: 'bomb' };
    const choice: MineTaskChoice = type === 'truth' ? 'truth' : type === 'dare' ? 'dare' : 'theme';
    const task = createMineTaskEvent(players, onlineThemes, snap.turn, choice);
    return task ? { type: 'task', task } : { type: 'blank' };
  };
  const onCompleteCell = (index: number): BingoCellResult | null => {
    if (!bingoBoard) return null;
    const done = completeBingoCellOnBoard(bingoBoard, index, snap.turn, players, onlineThemes);
    if (!done) return null;
    patch('stage.bingoBoard', done.board);
    return done.result;
  };
  // restart 会清空玩法局部状态，房主 effect 随即重生成 Bingo 棋盘
  const onRestart = () => dispatch({ type: 'restart', seat: mySeat });

  const common = { players, themes: onlineThemes, currentTurn: snap.turn, onBack, onEndTurn: endTurn };
  const withThemes = { players, themes: onlineThemes, onBack };

  const renderMode = () => {
    switch (mode) {
      case 'board':
        return <GameView players={players} boardMap={boardMap} pathCoords={pathCoords} currentTurn={snap.turn} isRolling={isRolling} onMove={onMove} onCheckTile={onCheckTile} onEndTurn={endTurn} onSetRolling={onSetRolling} onWin={onWin} onTaskTrigger={onTaskTrigger} onBack={onBack} />;
      case 'card':
        return <CardModeView {...common} onDrawTask={onDrawTask} onTaskTrigger={onTaskTrigger} />;
      case 'mine':
        return <MineModeView {...common} mineBoard={mineBoard} onRevealTile={onRevealTile} onTaskTrigger={onTaskTrigger} onBombTrigger={onBombTrigger} />;
      case 'pose':
        return <PoseModeView players={players} currentTurn={snap.turn} onPoseTrigger={onPoseTrigger} onBack={onBack} />;
      case 'roulette':
        return <RouletteModeView {...common} />;
      case 'bingo':
        return bingoBoard ? <BingoModeView {...common} bingoBoard={bingoBoard} onCompleteCell={onCompleteCell} onRestart={onRestart} /> : null;
      case 'quiz':
        return <QuizModeView players={players} onBack={onBack} />;
      case 'memory':
        return <MemoryModeView {...common} />;
      case 'timed':
        return <TimedModeView {...withThemes} />;
      case 'story':
        return <StoryModeView players={players} onBack={onBack} />;
      case 'survival':
        return <SurvivalModeView {...common} />;
      case 'territory':
        return <TerritoryModeView {...common} />;
      case 'auction':
        return <AuctionModeView {...withThemes} />;
      case 'gridchess':
        return <GridChessModeView {...withThemes} />;
      case 'trutndare':
        return <TruthDareModeView {...common} />;
      case 'gamble':
        return <GambleModeView {...withThemes} />;
      case 'edge':
        return <EdgeModeView {...withThemes} />;
      case 'penaltygrid':
        return <PenaltyLadderModeView {...withThemes} />;
      case 'secretdouble':
        return <SecretDoubleModeView {...common} />;
      case 'roleplay':
        return <RoleplayModeView players={players} onBack={onBack} />;
      case 'sudoku':
        return <SudokuModeView {...common} />;
      case 'go':
        return <GoModeView {...common} />;
      case 'bluff':
        return <BluffDiceModeView {...common} />;
      case 'jungle':
        return <JungleModeView {...common} />;
      default:
        return null;
    }
  };

  return (
    <ModeRuntimeProvider value={shared.runtime}>
      <div className="mobile-game-screen fixed inset-0 z-50 flex flex-col bg-black">
        {header}
        <div className="relative flex-1 overflow-hidden">
          {renderMode()}
        </div>
        {poseImage && (
          <div className="fixed inset-0 z-[138] flex items-center justify-center bg-black/90 px-5">
            <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#1C1C1E] p-4">
              <div className="mb-2 text-center text-xs font-bold text-gray-400">姿势卡 · 双方同时查看</div>
              <img src={poseImage} alt="姿势卡" className="mx-auto max-h-[62vh] w-auto rounded-2xl object-contain" />
              <button
                type="button"
                onClick={() => patch('stage.poseImage', null)}
                className="ios-btn mt-4 h-11 w-full rounded-full bg-white text-xs font-bold text-black"
              >
                关闭
              </button>
            </div>
          </div>
        )}
        <MineBombChoiceModal
          isOpen={bombOpen}
          activePlayer={players[snap.turn] ?? null}
          selectorPlayer={players[snap.turn === 1 ? 0 : 1] ?? null}
          onChoose={onChooseBomb}
        />
        <CardGate snap={snap} mySeat={mySeat} players={players} dispatch={dispatch} />
      </div>
    </ModeRuntimeProvider>
  );
}
