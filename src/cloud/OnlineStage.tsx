import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Lock, RefreshCw, Sparkles, User, UserRound, Users, Wifi, WifiOff } from 'lucide-react';
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
import { ThemeTags } from '../components/ThemeTags';
import { OnlineBoardView } from '../components/views/OnlineBoardView';
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
import { ALL_THEME_MODES, MODE_LABEL, MODE_REGISTRY, turnKeyOfMode } from '../rules/registry';
import { createRoom } from '../rules/room';
import { ModeRuntimeProvider } from '../rules/ModeRuntime';
import {
  BINGO_BOARD_SIZE,
  generateBingoBoard,
  generateBoardMap,
  generateMineBoard,
  generateSpiralPath
} from '../utils/gameLogic';
import { completeBingoCellOnBoard, createMineTaskEvent, resolveBoardTile } from '../rules/modeRules';
import { loadRoomSnapshot, useSharedRoom } from './useSharedRoom';
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
  /** 对方已离线时，本机接管当房主 */
  onTakeOver: () => void;
  /** 两端都自认房主时，本机重进房间让位 */
  onConflict: () => void;
}

const other = (seat: Seat): Seat => (seat === 0 ? 1 : 0);

const AUDIENCE_LABEL: Record<Theme['audience'], string> = {
  common: '通用',
  male: '男方',
  female: '女方'
};

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
    themeName: card.themeName,
    moveDelta: 0
  };
}

/** 四阶段抽卡闸门：胜方抽卡看到 → 败方才能翻卡 → 败方确认后出队。 */
function CardGate(props: {
  snap: RoomSnapshot;
  mySeat: Seat;
  players: Player[];
  dispatch: (action: RoomAction) => void;
}) {
  const card = props.snap.cards[0];
  if (!card) return null;
  return <CardGateBody key={card.id} card={card} {...props} />;
}

function CardGateBody({
  card,
  snap,
  mySeat,
  players,
  dispatch
}: {
  card: RoomSnapshot['cards'][number];
  snap: RoomSnapshot;
  mySeat: Seat;
  players: Player[];
  dispatch: (action: RoomAction) => void;
}) {
  const isDrawer = card.drawerSeat === mySeat;
  const isExecutor = card.executorSeat === mySeat;
  const drawer = players.find(player => player.id === card.drawerSeat);
  const executor = players.find(player => player.id === card.executorSeat);
  const drawerName = drawer?.name ?? '对方';
  const executorName = executor?.name ?? '对方';
  const face = card.card;
  const canDraw = card.phase === 'locked' && isDrawer;
  // 只有抽卡方本人能翻卡
  const canReveal = card.phase === 'drawn' && isDrawer;
  // 和离线模式一致：卡面不自动翻，点一下才翻
  const [flipped, setFlipped] = useState(false);

  // 双击卡面强制关闭：对方退出房间 / 卡在翻卡时的逃生通道。
  // 移动端浏览器长按容易被系统菜单抢走，双击更稳。
  const DOUBLE_TAP_MS = 320;
  const lastTapAt = useRef(0);

  // 网络抖动时动作可能没到房主，1.2 秒未推进就自动重发，最多 3 次
  const [pending, setPending] = useState<RoomAction | null>(null);
  const tries = useRef(0);
  const send = (action: RoomAction) => {
    if (pending) return;
    tries.current = 0;
    setPending(action);
    dispatch(action);
  };

  useEffect(() => {
    if (!pending) return;
    const advanced =
      pending.type === 'drawCard'
        ? card.phase !== 'locked'
        : pending.type === 'revealCard'
          ? card.phase === 'revealed'
          : snap.cards[0]?.id !== card.id;
    if (advanced || tries.current >= 3) {
      setPending(null);
      return;
    }
    const timer = window.setTimeout(() => {
      tries.current += 1;
      dispatch(pending);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [pending, card.phase, card.id, snap.cards, dispatch]);

  const busy = pending !== null;

  // 和离线模式一致：点卡面抽卡 / 翻卡，只有翻牌后才出现接受/跳过
  const forceClose = () => {
    if (navigator.vibrate) navigator.vibrate(30);
    // 直接覆盖 pending：即使抽卡/翻卡还在重试，逃生也要能发出去
    tries.current = 0;
    setPending({ type: 'forceCloseCard', seat: mySeat });
    dispatch({ type: 'forceCloseCard', seat: mySeat });
  };

  const tapFront = () => {
    const now = Date.now();
    // 320ms 内第二击 = 双击强制关闭。第一击的抽卡/翻卡无所谓，
    // 卡片马上就出队了，不会留下副作用。
    if (now - lastTapAt.current < DOUBLE_TAP_MS) {
      lastTapAt.current = 0;
      forceClose();
      return;
    }
    lastTapAt.current = now;
    if (busy) return;
    if (canReveal) {
      setFlipped(true);
      send({ type: 'revealCard', seat: mySeat });
      return;
    }
    if (canDraw) send({ type: 'drawCard', seat: mySeat });
  };

  // 抽卡方翻完卡后，对方设备自动弹出卡面并自动翻转
  useEffect(() => {
    if (card.phase !== 'revealed' || isDrawer) return;
    const timer = window.setTimeout(() => setFlipped(true), 140);
    return () => window.clearTimeout(timer);
  }, [card.phase, isDrawer, card.id]);

  const frontHint = canReveal
    ? '点击卡面翻开'
    : card.phase === 'locked'
      ? isDrawer ? '点击卡面抽一张' : `等 ${drawerName} 抽卡`
      : `等 ${drawerName} 翻卡`;

  const assignmentStrip = (
    <div className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-bold">
      <span
        className="rounded-full px-2 py-0.5"
        style={{ backgroundColor: `${drawer?.color ?? '#0A84FF'}22`, color: drawer?.color ?? '#0A84FF' }}
      >
        抽卡 · {drawerName}
      </span>
      <span className="text-gray-500">→</span>
      <span
        className="rounded-full px-2 py-0.5"
        style={{ backgroundColor: `${executor?.color ?? '#FF375F'}22`, color: executor?.color ?? '#FF375F' }}
      >
        执行 · {executorName}
      </span>
    </div>
  );

  // 抽卡方还没翻卡时，对方保持游戏界面，不显示任何遮罩
  if (card.phase === 'drawn' && !isDrawer) return null;

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-black/85 px-5 backdrop-blur-md"
      onClick={forceClose}
    >
      <div
        className="task-card-pop w-full max-w-sm rounded-3xl border border-white/10 bg-[#1C1C1E] p-5 shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-gray-500">
          <span>{card.reason}</span>
          {snap.cards.length > 1 && <span>还有 {snap.cards.length - 1} 张</span>}
        </div>

        <div
          className="perspective-1000 relative w-full"
          onContextMenu={event => event.preventDefault()}
          style={{ WebkitTouchCallout: 'none', userSelect: 'none' }}
        >
          <div className={`flip-card-inner ${flipped ? 'flipped' : ''}`} style={{ height: 320 }}>
            <button
              type="button"
              onClick={tapFront}
              disabled={!canDraw && !canReveal && card.phase !== 'revealed'}
              className={`flip-card-front flex flex-col items-center justify-center border border-white/10 bg-[#1C1C1E] px-5 transition-transform ${
                canDraw || canReveal || card.phase === 'revealed' ? 'cursor-pointer active:scale-[0.98]' : 'cursor-default'
              }`}
            >
              <div
                className={`mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] ${
                  canDraw || canReveal ? 'animate-pulse' : ''
                }`}
              >
                {card.phase === 'locked'
                  ? <Lock size={28} className={canDraw ? 'text-[#FFD60A]' : 'text-gray-400'} />
                  : <Sparkles size={28} className={canReveal ? 'text-[#FFD60A]' : 'text-gray-400'} />}
              </div>
              <div className="text-base font-bold text-white">
                {card.phase === 'locked' ? (isDrawer ? '你赢了' : '卡片已锁定') : '等待翻卡'}
              </div>
              <div className={`mt-1 text-[11px] font-bold ${canDraw || canReveal || card.phase === 'revealed' ? 'text-[#FFD60A]' : 'text-gray-500'}`}>
                {busy ? '处理中…' : frontHint}
              </div>
              <div className="mt-5 grid grid-cols-3 gap-1.5 opacity-25">
                {Array.from({ length: 9 }).map((_, index) => (
                  <span key={index} className="h-1.5 w-1.5 rounded-full bg-white" />
                ))}
              </div>
            </button>

            <div className="flip-card-back overflow-y-auto border border-white/10 px-5 py-6">
              <div className="flex w-full flex-col items-center">
                <Sparkles size={24} className="mb-2 text-[#FFD60A]" />
                <div className="text-base font-bold text-white">{card.reason}</div>
                <div className="mt-3 w-full">{assignmentStrip}</div>
                <div className="mt-3 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-4 text-center text-base font-medium leading-relaxed text-white">
                  {face?.task ?? '卡面加载中…'}
                </div>
                {face && <div className="mt-2 text-[11px] text-gray-500">来自「{face.themeName}」</div>}
                <div className="mt-3 text-[11px] font-bold text-gray-400">由 {executorName} 执行</div>
              </div>
            </div>
          </div>
        </div>

        {card.phase === 'revealed' && flipped && isExecutor && (
          <div className="mt-4 flex w-full gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => send({ type: 'ackCard', seat: mySeat })}
              className="ios-btn h-11 flex-1 rounded-full bg-[#3A3A3C] text-xs font-bold text-[#FF453A] disabled:opacity-60"
            >
              跳过任务
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => send({ type: 'ackCard', seat: mySeat })}
              className="ios-btn h-11 flex-1 rounded-full bg-white text-xs font-bold text-black disabled:opacity-60"
            >
              {busy ? '确认中…' : '接受任务'}
            </button>
          </div>
        )}

        {card.phase === 'revealed' && flipped && !isExecutor && (
          <div className="mt-4 w-full rounded-full border border-white/10 bg-white/[0.05] px-3 py-3 text-center text-[11px] font-bold text-gray-300">
            等 {executorName} 确认后自动关闭
          </div>
        )}

        {card.phase === 'drawn' && isDrawer && (
          <div className="mt-4 w-full rounded-full border border-white/10 bg-white/[0.05] px-3 py-3 text-center text-[11px] font-bold text-gray-400">
            点击卡面翻开，翻完后 {executorName} 那边会自动看到
          </div>
        )}

        {card.phase !== 'revealed' && (
          <div className="mt-4 w-full rounded-full border border-white/10 bg-white/[0.05] px-3 py-3 text-center text-[11px] font-bold text-gray-400">
            {canDraw
              ? '点击卡面抽卡，抽到后只有你能先看到'
              : canReveal
                ? '点击卡面翻卡，翻牌后双方同时看到'
                : `等 ${isDrawer ? executorName : drawerName} 操作`}
          </div>
        )}

        {/* 逃生通道：对方退出房间时，卡会一直等人确认，双击可以放掉它继续玩 */}
        <div className="mt-3 text-center text-[10px] leading-relaxed text-gray-600">
          对方卡住？点击卡片外的空白处，或双击卡面即可关闭这张卡
        </div>
      </div>
    </div>
  );
}

/** 棋盘类玩法的数据由房主异步生成，第一帧还没到就先占位，避免视图读到空数组崩溃。 */
function StagePreparing() {
  return (
    <div className="flex h-full min-h-[240px] items-center justify-center text-xs text-gray-500">
      正在准备棋盘…
    </div>
  );
}

/** 可视化房间：两个座位头像，谁进了房间就亮起，没进的是灰色。 */
function SeatAvatars({
  roles,
  presence,
  mySeat
}: {
  roles: [Role, Role];
  presence: Seat[];
  mySeat: Seat;
}) {
  return (
    <div className="flex items-center justify-center gap-8">
      {([0, 1] as Seat[]).map(seat => {
        const online = presence.includes(seat);
        const color = roles[seat] === 'male' ? '#0A84FF' : '#FF375F';
        const name = roles[seat] === 'male' ? '男方' : '女方';
        return (
          <div key={seat} className="flex flex-col items-center gap-1.5">
            <div
              className={`relative flex h-14 w-14 items-center justify-center rounded-full border-2 transition-all duration-300 ${online ? 'opacity-100' : 'opacity-40 grayscale'}`}
              style={{
                borderColor: online ? color : '#48484A',
                backgroundColor: online ? `${color}22` : 'rgba(255,255,255,0.04)'
              }}
            >
              {roles[seat] === 'male'
                ? <User size={22} style={{ color: online ? color : '#8E8E93' }} />
                : <UserRound size={22} style={{ color: online ? color : '#8E8E93' }} />}
              <span
                className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#1C1C1E] ${online ? 'bg-[#30D158]' : 'bg-[#48484A]'}`}
              />
            </div>
            <div className={`text-[11px] font-bold ${online ? 'text-white' : 'text-gray-600'}`}>{name}</div>
            <div className="text-[9px] text-gray-600">
              {online ? (seat === mySeat ? '我' : '已进入') : '未进入'}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function OnlineStage(props: OnlineStageProps) {
  const { roomId, mode, mySeat, hostSeat, roles, themes, kind, onExit, onTakeOver, onConflict } = props;
  const isHost = mySeat === hostSeat;

  const createInitial = useCallback(() => {
    // 恢复本机上一次的房间快照：组件重挂/刷新后不会把已锁定的卡包清空
    const restored = loadRoomSnapshot(roomId);
    if (restored && restored.mode === mode && restored.hostSeat === hostSeat) return restored;
    return createRoom(mode, roles, hostSeat, hostSeat);
  }, [mode, roles, hostSeat, roomId]);
  const shared = useSharedRoom({ roomId, mySeat, hostSeat, kind, enabled: true, createInitial, onConflict });
  const snap = shared.snapshot;
  const dispatch = shared.dispatch;

  const [selected, setSelected] = useState<string[]>([]);
  const [bombOpen, setBombOpen] = useState(false);
  const [waitSeconds, setWaitSeconds] = useState(0);

  // 访客长时间收不到房主视图时给出接管入口，避免永远停在「正在连接房间」
  useEffect(() => {
    if (snap || shared.status !== 'connecting') {
      setWaitSeconds(value => (value === 0 ? value : 0));
      return;
    }
    const timer = window.setInterval(() => setWaitSeconds(value => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [snap, shared.status]);

  // 回合以玩法视图自己的 turn 为准：围棋/斗兽棋/数独等都在视图内部翻回合，
  // 房间的 turn 只在这些玩法没有内部 turn 时才用。
  const currentTurn = useMemo(() => {
    // 按当前玩法固定映射取内部 turn：data 里可能残留上一个玩法的 turn，
    // 用 find('.turn') 会被旧值带偏，表现为「一直是同一方回合」。
    const key = turnKeyOfMode(mode);
    const value = key ? snap?.data[key] : undefined;
    if (typeof value === 'number') return value === 1 ? 1 : 0;
    return snap?.turn === 1 ? 1 : 0;
  }, [snap?.data, snap?.turn, mode]);

  const myPool = useMemo(() => picksToPool(themes, selected), [themes, selected]);
  const myLocked = Boolean(snap?.picks[mySeat]?.locked);
  const [lockPending, setLockPending] = useState(false);
  const lockTries = useRef(0);

  const lockDeck = () => {
    if (lockPending) return;
    lockTries.current = 0;
    setLockPending(true);
    // 双通道：Presence（头像已证明可用）+ 普通动作
    shared.announce({ lobbyLocked: true, themeIds: selected });
    dispatch({ type: 'lockLobby', seat: mySeat, themeIds: selected, pool: myPool });
  };

  // 锁定动作丢失时自动重发，避免「两边都点了锁定却一直不开局」
  useEffect(() => {
    if (!lockPending) return;
    if (myLocked) {
      setLockPending(false);
      return;
    }
    if (lockTries.current >= 10) {
      setLockPending(false);
      return;
    }
    const timer = window.setTimeout(() => {
      lockTries.current += 1;
      shared.announce({ lobbyLocked: true, themeIds: selected });
      dispatch({ type: 'lockLobby', seat: mySeat, themeIds: selected, pool: myPool });
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [lockPending, myLocked, selected, myPool, dispatch, mySeat, shared.announce]);

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
        <Wifi size={28} className="animate-pulse text-[#64D2FF]" />
        <div className="text-base font-bold text-white">{isHost ? '房间已开好' : '正在进入房间…'}</div>
        <div className="text-[10px] text-gray-500">房间 {roomId.slice(-8)} · {MODE_LABEL[mode]}</div>
        <SeatAvatars roles={roles} presence={shared.presence} mySeat={mySeat} />
        <div className="text-[11px] text-gray-500">
          {isHost ? '等对方进入，或先单人开局' : '正在同步房主的局面…'}
          <span className="ml-1 text-gray-600">（{waitSeconds}s）</span>
        </div>
        <button type="button" onClick={shared.requestView} className="ios-btn rounded-full border border-white/10 px-4 py-2 text-xs text-gray-300">重试连接</button>
        {!isHost && waitSeconds >= 8 && (
          <button type="button" onClick={onTakeOver} className="ios-btn text-[10px] text-gray-500 underline">
            对方迟迟没进来？由我开房
          </button>
        )}
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
          <div className="truncate text-[10px] text-gray-500">
            房间 {roomId.slice(-8)} · 我是 {PLAYER_NAME[roles[mySeat]]}（{mySeat + 1} 号位）· {isHost ? '房主' : '访客'} · 当前 {PLAYER_NAME[roles[currentTurn]]}
          </div>
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
    return (
      <div className="mobile-game-screen fixed inset-0 z-50 flex flex-col bg-black">
        {header}
        <div className="flex-1 overflow-y-auto px-5 py-5 no-scrollbar">
          <div className="mb-1 text-base font-bold text-white">各自选卡包</div>
          <div className="mb-4 text-[11px] leading-relaxed text-gray-500">
            两台设备各选自己想玩的任务包，双方都点「锁定」后自动合并成公共题库，再一起开局。
          </div>

          <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
            <SeatAvatars roles={roles} presence={shared.presence} mySeat={mySeat} />
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[10px] text-gray-500">
              <span>我 {myPick.locked ? '已锁定' : `已选 ${selected.length} 个包`} · {myPool.length} 张</span>
              <span>
                对方 {oppPick.locked ? '已锁定' : shared.presence.includes(other(mySeat)) ? `已选 ${oppPick.themeIds.length} 个包` : '还没进入'}
              </span>
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
                      className={`ios-btn w-full rounded-xl border px-3 py-3 text-left ${active ? 'border-[#30D158]/50 bg-[#30D158]/10' : 'border-white/10 bg-white/[0.04]'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-xs font-bold text-white">{theme.name}</span>
                            <span className="shrink-0 text-[10px] text-gray-500">{theme.tasks.length}卡</span>
                          </div>
                          <div className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-gray-500">
                            {theme.desc || '无描述'}
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] text-gray-300">
                              {AUDIENCE_LABEL[theme.audience]}
                            </span>
                            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] text-gray-300">
                              {theme.tasks.length} 张任务
                            </span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-start gap-1">
                          <ThemeTags tags={theme.tags} />
                          {active && <Check size={15} className="mt-0.5 text-[#30D158]" />}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                disabled={lockPending}
                onClick={lockDeck}
                className="ios-btn mt-4 h-12 w-full rounded-full bg-white text-sm font-bold text-black disabled:opacity-60"
              >
                {lockPending ? '锁定中…' : '锁定我的卡包'}
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
              <div className="mt-1 text-[11px] text-gray-400">
                {oppPick.locked
                  ? '正在合并题库…'
                  : shared.presence.includes(other(mySeat))
                    ? '等对方也点「锁定我的卡包」就会自动开局'
                    : '对方还没进入房间，可以先用我的卡包开局'}
              </div>
              <button
                type="button"
                onClick={() => {
                  shared.announce({ lobbyLocked: false, themeIds: [] });
                  dispatch({ type: 'unlockLobby', seat: mySeat });
                }}
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
    const turnSeat: Seat = currentTurn === 1 ? 1 : 0;
    const task = createMineTaskEvent(players, onlineThemes, turnSeat, choice, other(turnSeat));
    if (task) enqueue(task);
    else endTurn();
  };
  const onPoseTrigger = (src: string) => patch('stage.poseImage', src);
  const onCheckTile = (landingStep: number): TaskEventData | 'win' | null =>
    resolveBoardTile({ landingStep, players, themes: onlineThemes, turn: currentTurn, boardMap });
  const onRevealTile = (index: number): MineRevealResult | null => {
    const board = [...mineBoard];
    if (!board[index] || board[index].revealed) return null;
    board[index] = { ...board[index], revealed: true };
    patch('stage.mineBoard', board);
    const type = board[index].type;
    if (type === 'blank') return { type: 'blank' };
    if (type === 'bomb') return { type: 'bomb' };
    const choice: MineTaskChoice = type === 'truth' ? 'truth' : type === 'dare' ? 'dare' : 'theme';
    const task = createMineTaskEvent(players, onlineThemes, currentTurn, choice);
    return task ? { type: 'task', task } : { type: 'blank' };
  };
  const onCompleteCell = (index: number): BingoCellResult | null => {
    if (!bingoBoard) return null;
    const done = completeBingoCellOnBoard(bingoBoard, index, currentTurn, players, onlineThemes);
    if (!done) return null;
    patch('stage.bingoBoard', done.board);
    return done.result;
  };
  // restart 会清空玩法局部状态，房主 effect 随即重生成 Bingo 棋盘
  const onRestart = () => dispatch({ type: 'restart', seat: mySeat });

  const common = { players, themes: onlineThemes, currentTurn, onBack, onEndTurn: endTurn };
  const withThemes = { players, themes: onlineThemes, onBack };

  const renderMode = () => {
    switch (mode) {
      case 'board': {
        if (pathCoords.length === 0 || boardMap.length === 0) return <StagePreparing />;
        return (
          <OnlineBoardView
            players={players}
            boardMap={boardMap}
            pathCoords={pathCoords}
            mySeat={mySeat}
            isAuthority={isHost}
            currentTurn={currentTurn}
            pendingCards={snap.cards.length}
            onCheckTile={onCheckTile}
            onTaskTrigger={onTaskTrigger}
            onBack={onBack}
          />
        );
      }
      case 'card':
        return <CardModeView {...common} onDrawTask={onDrawTask} onTaskTrigger={onTaskTrigger} pendingCards={snap.cards.length} />;
      case 'mine': {
        if (mineBoard.length === 0) return <StagePreparing />;
        return <MineModeView {...common} mineBoard={mineBoard} onRevealTile={onRevealTile} onTaskTrigger={onTaskTrigger} onBombTrigger={onBombTrigger} pendingCards={snap.cards.length} />;
      }
      case 'pose':
        return <PoseModeView players={players} currentTurn={currentTurn} onPoseTrigger={onPoseTrigger} onEndTurn={endTurn} pendingCards={snap.cards.length} onBack={onBack} />;
      case 'roulette':
        return <RouletteModeView {...common} />;
      case 'bingo':
        return bingoBoard ? <BingoModeView {...common} bingoBoard={bingoBoard} onCompleteCell={onCompleteCell} onRestart={onRestart} /> : <StagePreparing />;
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
          activePlayer={players[currentTurn] ?? null}
          selectorPlayer={players[currentTurn === 1 ? 0 : 1] ?? null}
          onChoose={onChooseBomb}
        />
        <CardGate snap={snap} mySeat={mySeat} players={players} dispatch={dispatch} />
      </div>
    </ModeRuntimeProvider>
  );
}
