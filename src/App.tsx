import { useEffect, useMemo, useRef, useState } from 'react';
import { Cloud, Github, Moon, Sun } from 'lucide-react';
import { useGameState } from './hooks/useGameState';
import { GameMode, MineTaskChoice, TaskEventData, ThemeMode } from './types';
import { HomeView } from './components/views/HomeView';
import { GameView } from './components/views/GameView';
import { CardModeView } from './components/views/CardModeView';
import { MineModeView } from './components/views/MineModeView';
import { PoseModeView } from './components/views/PoseModeView';
import { RouletteModeView } from './components/views/RouletteModeView';
import { BingoModeView } from './components/views/BingoModeView';
import { QuizModeView } from './components/views/QuizModeView';
import { MemoryModeView } from './components/views/MemoryModeView';
import { TimedModeView } from './components/views/TimedModeView';
import { StoryModeView } from './components/views/StoryModeView';
import { SurvivalModeView } from './components/views/SurvivalModeView';
import { TerritoryModeView } from './components/views/TerritoryModeView';
import { AuctionModeView } from './components/views/AuctionModeView';
import { GridChessModeView } from './components/views/GridChessModeView';
import { TruthDareModeView } from './components/views/TruthDareModeView';
import { GambleModeView } from './components/views/GambleModeView';
import { EdgeModeView } from './components/views/EdgeModeView';
import { RoleplayModeView } from './components/views/RoleplayModeView';
import { JubenshaModeView } from './components/views/JubenshaModeView';
import { SudokuModeView } from './components/views/SudokuModeView';
import { GoModeView } from './components/views/GoModeView';
import { BluffDiceModeView } from './components/views/BluffDiceModeView';
import { JungleModeView } from './components/views/JungleModeView';
import { ThemesView } from './components/views/ThemesView';
import { ThemeSelectorModal } from './components/modals/ThemeSelectorModal';
import { TaskCardModal } from './components/modals/TaskCardModal';
import { MineBombChoiceModal } from './components/modals/MineBombChoiceModal';
import { PoseCardModal } from './components/modals/PoseCardModal';
import { WinModal } from './components/modals/WinModal';
import { BottomNav } from './components/BottomNav';
import { ThemeCreateModal } from './components/modals/ThemeCreateModal';
import { ThemeEditorModal } from './components/modals/ThemeEditorModal';
import { AiImportModal } from './components/modals/AiImportModal';
import { useCloud } from './cloud/useCloud';
import { useCloudSync } from './cloud/useCloudSync';
import { CloudPanel } from './cloud/CloudPanel';
import { OnlineStage } from './cloud/OnlineStage';
import { cloudConfigured } from './cloud/client';
import { enterOnlineRoom, leaveOnlineRoom, roomIdOf, startRoomHeartbeat, subscribeSpaceRooms, RoomAnnounce } from './cloud/rooms';
import { clearRoomSnapshot } from './cloud/useSharedRoom';
import type { Role, Seat } from './rules/types';
import { roleOfSeat } from './rules/identity';
import { MODE_LABEL, themeModeOfGame } from './rules/registry';
import { setDiagnosticContext, diagLog } from './cloud/diagnostics';
import { getDeviceId } from './cloud/device';
import { isSandbox } from './utils/localStorage';

interface OnlineSession {
  roomId: string;
  mode: GameMode;
  isHost: boolean;
  mySeat: Seat;
  hostSeat: Seat;
  roles: [Role, Role];
  myRole: Role;
  hostRole: Role;
}

/** 需要双方选择“抽卡”类主题的玩法。 */
const CARD_THEME_MODES = new Set<GameMode>([
  'card',
  'roulette',
  'bingo',
  'memory',
  'timed',
  'survival',
  'territory',
  'auction',
  'gridchess',
  'trutndare',
  'sudoku',
  'go',
  'bluff',
  'jungle'
]);

/** 无文字的 ♂ / ♀ 滑动开关，靠颜色和滑块表达当前性别 */
function RoleSwitch({
  role,
  online,
  onChange
}: {
  role: 'male' | 'female';
  /** 只有登录态才影响座位、先手、卡包与执行人；单机同屏保持老一套 */
  online: boolean;
  onChange: (role: 'male' | 'female') => void;
}) {
  const female = role === 'female';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={female}
      aria-label={online ? '切换性别（联机中：决定座位与先手）' : '切换性别（单机同屏仅作标记）'}
      title={online
        ? `${female ? '女生' : '男生'} · 联机生效：座位、先手、卡包与执行人`
        : `${female ? '女生' : '男生'} · 单机同屏仅作标记，登录后生效`}
      onClick={() => onChange(female ? 'male' : 'female')}
      className="ios-btn relative h-9 w-[60px] shrink-0 rounded-full border"
      style={{ backgroundColor: 'var(--theme-surface)', borderColor: 'var(--theme-line)' }}
    >
      <span
        className={`pointer-events-none absolute left-[3px] top-[3px] h-7 w-7 rounded-full shadow-md transition-transform duration-300 ease-out ${
          female
            ? 'translate-x-[26px] bg-[#FF375F]/35 ring-1 ring-[#FF375F]/60'
            : 'translate-x-0 bg-[#0A84FF]/35 ring-1 ring-[#0A84FF]/60'
        }`}
      />
      <span
        className={`pointer-events-none absolute left-[9px] top-1/2 -translate-y-1/2 text-[15px] font-bold leading-none text-[#0A84FF] transition-all duration-300 ${
          female ? 'scale-90 opacity-45' : 'scale-110 opacity-100'
        }`}
      >
        ♂
      </span>
      <span
        className={`pointer-events-none absolute right-[9px] top-1/2 -translate-y-1/2 text-[15px] font-bold leading-none text-[#FF375F] transition-all duration-300 ${
          female ? 'scale-110 opacity-100' : 'scale-90 opacity-45'
        }`}
      >
        ♀
      </span>
    </button>
  );
}

function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = window.localStorage.getItem('cfc-theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      // 忽略隐私模式下的存储异常
    }
    return 'dark';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('theme-light', theme === 'light');
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem('cfc-theme', theme);
    } catch {
      // 忽略
    }
  }, [theme]);

  const [myRole, setMyRole] = useState<'male' | 'female'>(() => {
    try {
      const saved = window.localStorage.getItem('cfc:my-role');
      if (saved === 'male' || saved === 'female') return saved;
    } catch {
      // ignore
    }
    return 'male';
  });
  const changeMyRole = (role: 'male' | 'female') => {
    setMyRole(role);
    try {
      window.localStorage.setItem('cfc:my-role', role);
    } catch {
      // ignore
    }
  };

  const [cloudOpen, setCloudOpen] = useState(false);
  const [onlineSession, setOnlineSession] = useState<OnlineSession | null>(null);
  const [remoteRoom, setRemoteRoom] = useState<RoomAnnounce | null>(null);
  const remoteRoomAt = useRef(0);
  const [onlineNotice, setOnlineNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const cloud = useCloud();

  const showOnlineNotice = (text: string, ok = false) => {
    setOnlineNotice({ text, ok });
    window.setTimeout(() => {
      setOnlineNotice(current => (current?.text === text ? null : current));
    }, 5000);
  };

  const {
    state,
    replaceThemes,
    switchView,
    selectGameMode,
    selectTheme,
    createTheme,
    updateThemeMeta,
    addThemeTask,
    updateThemeTask,
    removeThemeTask,
    importThemeTasks,
    startGame,
    drawCardTask,
    noteDrawnTask,
    revealMineTile,
    toggleMineTileFlag,
    chooseMineBombTask,
    completeBingoCell,
    restartBingo,
    movePlayer,
    endTurn,
    setIsRolling,
    checkTile,
    resolveTask,
    resetGame
  } = useGameState();

  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<number>(0);
  const [taskData, setTaskData] = useState<TaskEventData | null>(null);
  const [isMineBombChoiceOpen, setIsMineBombChoiceOpen] = useState(false);
  const [poseImageSrc, setPoseImageSrc] = useState<string | null>(null);
  const [winnerId, setWinnerId] = useState<number | null>(null);
  const [isCreateThemeModalOpen, setIsCreateThemeModalOpen] = useState(false);
  const [editingThemeId, setEditingThemeId] = useState<string | null>(null);
  const [aiImportThemeId, setAiImportThemeId] = useState<string | null>(null);

  const handleSelectTheme = (playerId: number) => {
    setSelectedPlayerId(playerId);
    setIsThemeModalOpen(true);
  };

  const handleThemeSelect = (themeId: string) => {
    selectTheme(selectedPlayerId, themeId);
  };

  const selectedPlayer = state.players.find(p => p.id === selectedPlayerId) || state.players[0];
  const selectedModeForTheme: ThemeMode = themeModeOfGame(state.gameMode) ?? 'board';
  const selectableThemes = state.themes.filter(
    t =>
      (t.audience === 'common' || t.audience === selectedPlayer.role) &&
      t.modes.includes(selectedModeForTheme) &&
      t.tasks.length > 0
  );

  const startLocalGame = () => {
    const success = startGame();
    if (!success) {
      if (state.gameMode === 'mine') {
        alert('请为双方选择支持“扫雷主题”的任务包，并确保题库里有支持“扫雷真心话”和“扫雷大冒险”的主题');
        return;
      }
      if (CARD_THEME_MODES.has(state.gameMode)) {
        alert('请先为双方选择支持抽卡的任务包');
        return;
      }
      alert('请先为双方选择支持飞行棋的任务包');
    }
  };

  /** 登录态 = 联机态：24 个玩法一律自动开房；未登录则完全照旧单机同屏。 */
  const handleStartGame = () => {
    if (cloud.space) {
      setDiagnosticContext({ lastStart: { at: Date.now(), branch: '自动联机', reason: '已登录，全部玩法走双设备房间' } });
      diagLog('start:online', { gameMode: state.gameMode, spaceId: cloud.space.id.slice(0, 8), myRole });
      void enterOnline(state.gameMode);
      return;
    }
    const reason = cloudConfigured ? '未登录或会话丢失（cloud.space 为空）' : '构建缺少 VITE_SUPABASE_*';
    setDiagnosticContext({ lastStart: { at: Date.now(), branch: '直接同屏', reason } });
    diagLog('start:local', { gameMode: state.gameMode, configured: cloud.configured, reason });
    startLocalGame();
  };

  const enterOnline = async (mode: GameMode, keepSnapshot = false) => {
    if (!cloud.space) {
      diagLog('enter:abort', { reason: 'cloud.space 为空' });
      return;
    }
    // 主动点「开始」= 新一局，清掉上次的快照；重连/让位时保留
    if (!keepSnapshot) clearRoomSnapshot(roomIdOf(cloud.space.id, mode));
    diagLog('enter:begin', { mode, spaceId: cloud.space.id.slice(0, 8), myRole });
    showOnlineNotice('正在连接房间…', true);
    try {
      const ticket = await enterOnlineRoom(cloud.space, mode, myRole);
      if (!ticket) {
        diagLog('enter:null', { reason: 'enterOnlineRoom 返回 null' });
        return;
      }
      const flipped = ticket.myRole !== myRole;
      diagLog('enter:ok', {
        roomId: ticket.roomId.slice(-8),
        isHost: ticket.isHost,
        mySeat: ticket.mySeat,
        hostSeat: ticket.hostSeat,
        effectiveRole: ticket.myRole,
        flipped
      });
      setOnlineSession({
        roomId: ticket.roomId,
        mode: ticket.mode,
        isHost: ticket.isHost,
        mySeat: ticket.mySeat,
        hostSeat: ticket.hostSeat,
        roles: [roleOfSeat(0), roleOfSeat(1)],
        myRole: ticket.myRole,
        hostRole: ticket.hostRole
      });
      setRemoteRoom(null);
      showOnlineNotice(
        flipped
          ? '两台设备选了同一性别，你已自动调整为另一方'
          : ticket.isHost
            ? '房间已开好，对方点同一玩法就会自动进来'
            : '已自动匹配到对方的房间',
        true
      );
    } catch (error) {
      diagLog('enter:error', { message: error instanceof Error ? error.message : String(error) });
      showOnlineNotice(error instanceof Error ? error.message : '进房间失败');
    }
  };

  /** 两端都自认房主时，本机重进房间让位（设备号小的保留房主身份） */
  const rejoinWindow = useRef<number[]>([]);
  const rejoinRoom = () => {
    if (!onlineSession) return;
    // 15 秒内最多重进 2 次：Presence 迟迟不同步时不能无限重连
    const now = Date.now();
    rejoinWindow.current = rejoinWindow.current.filter(at => now - at < 15000);
    if (rejoinWindow.current.length >= 2) {
      diagLog('room:rejoin-blocked', { attempts: rejoinWindow.current.length });
      return;
    }
    rejoinWindow.current.push(now);
    const mode = onlineSession.mode;
    diagLog('room:rejoin', { mode, attempt: rejoinWindow.current.length });
    setOnlineSession(null);
    void enterOnline(mode, true);
  };

  /** 对方已离线时由本机接管房主，避免访客永远停在「正在连接房间」 */
  const takeOverRoom = async () => {
    if (!cloud.space || !onlineSession) return;
    const mode = onlineSession.mode;
    try {
      const ticket = await enterOnlineRoom(cloud.space, mode, myRole, true);
      if (!ticket) return;
      setOnlineSession({
        roomId: ticket.roomId,
        mode: ticket.mode,
        isHost: true,
        mySeat: ticket.mySeat,
        hostSeat: ticket.hostSeat,
        roles: [roleOfSeat(0), roleOfSeat(1)],
        myRole: ticket.myRole,
        hostRole: ticket.hostRole
      });
      showOnlineNotice('已接管房间，你现在是房主', true);
      diagLog('room:takeover', { roomId: ticket.roomId.slice(-8), seat: ticket.mySeat });
    } catch (error) {
      showOnlineNotice(error instanceof Error ? error.message : '接管房间失败');
    }
  };

  // 房主持续广播房间，另一台设备什么时候打开页面都能发现
  useEffect(() => {
    if (!cloud.space || !onlineSession || !onlineSession.isHost) return;
    return startRoomHeartbeat(
      cloud.space,
      onlineSession.roomId,
      onlineSession.mode,
      onlineSession.hostRole
    );
  }, [cloud.space, onlineSession]);

  // 退出登录立刻断开房间，回到单机同屏
  useEffect(() => {
    if (cloud.user || !onlineSession) return;
    void leaveOnlineRoom(onlineSession.roomId);
    setOnlineSession(null);
    setRemoteRoom(null);
  }, [cloud.user, onlineSession]);

  // 对方正在玩时，给一个随时可点的「一键跟上」入口
  useEffect(() => {
    if (!cloud.space) {
      setRemoteRoom(null);
      return;
    }
    return subscribeSpaceRooms(cloud.space, announce => {
      if (announce.closed) {
        setRemoteRoom(current => current?.roomId === announce.roomId ? null : current);
        return;
      }
      setRemoteRoom(announce);
      remoteRoomAt.current = Date.now();
    });
  }, [cloud.space]);

  // 房主低频广播，正常退出会主动发 close；异常断线超过 12 秒再清理提示。
  useEffect(() => {
    if (!remoteRoom) return;
    const timer = window.setInterval(() => {
      if (Date.now() - remoteRoomAt.current > 12000) setRemoteRoom(null);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [remoteRoom]);

  const handleTaskTrigger = (data: TaskEventData) => {
    // 记下抽到的任务：飞行棋 / 扫雷 / Bingo / 卡牌共用同一份记录，之后不再重复
    noteDrawnTask({ text: data.sourceTaskText ?? data.task, moveDelta: data.moveDelta });
    setTaskData(data);
  };

  const handleMineBombTrigger = () => {
    setIsMineBombChoiceOpen(true);
  };

  const handleMineBombChoice = (choice: MineTaskChoice) => {
    const task = chooseMineBombTask(choice);
    setIsMineBombChoiceOpen(false);

    if (!task) {
      const choiceLabel = choice === 'truth' ? '扫雷真心话' : choice === 'dare' ? '扫雷大冒险' : '扫雷主题';
      alert(`当前没有可抽取的${choiceLabel}题库`);
      endTurn();
      return;
    }

    noteDrawnTask({ text: task.sourceTaskText ?? task.task, moveDelta: task.moveDelta });
    setTaskData(task);
  };

  const handleTaskAccept = () => {
    if (!taskData) return;
    setTaskData(null);
    resolveTask(taskData, 'accept');
  };

  const handleTaskReject = () => {
    if (!taskData) return;
    setTaskData(null);
    resolveTask(taskData, 'reject');
  };

  const cloudSync = useCloudSync({
    spaceId: cloud.space?.id ?? null,
    themes: state.themes,
    onRemote: replaceThemes,
    enabled: cloudConfigured && !!cloud.space,
    retryKey: cloud.syncNonce
  });

  const supabaseHost = useMemo(() => {
    try {
      return new URL((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '').hostname || null;
    } catch {
      return null;
    }
  }, []);

  // 诊断层：只把当前状态写进快照，不参与任何业务判断
  useEffect(() => {
    setDiagnosticContext({
      configured: cloud.configured,
      host: supabaseHost,
      userId: cloud.user?.id ?? null,
      username: cloud.username,
      spaceId: cloud.space?.id ?? null,
      deviceId: getDeviceId(),
      sandbox: isSandbox,
      gameMode: state.gameMode,
      onlineModeAvailable: true,
      onlineSession: onlineSession
        ? {
            roomId: onlineSession.roomId,
            mode: onlineSession.mode,
            isHost: onlineSession.isHost
          }
        : null,
      cloudError: cloud.error,
      syncStatus: cloudSync.status,
      syncError: cloudSync.error
    });
  }, [
    cloud.configured, cloud.user, cloud.username, cloud.space, cloud.error,
    cloudSync.status, cloudSync.error, state.gameMode, onlineSession, supabaseHost
  ]);

  const handlePoseDone = () => {
    setPoseImageSrc(null);
    endTurn();
  };

  const handleWin = (id: number) => {
    setWinnerId(id);
  };

  const handleNavigate = (view: 'home' | 'themes') => {
    switchView(view);
  };

  const handleBackFromGame = () => {
    if (confirm('返回主页？本局进度将清空，已选主题会保留。')) {
      setIsMineBombChoiceOpen(false);
      setTaskData(null);
      setPoseImageSrc(null);
      resetGame();
      switchView('home');
    }
  };

  return (
    <div className="app-viewport w-screen overflow-hidden flex justify-center bg-black">
      <div className="fixed inset-0 z-0">
        <div className="w-full h-full bg-gradient-to-br from-gray-900 via-black to-gray-900 opacity-60" />
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      </div>

      <div className="relative z-10 w-full max-w-[430px] h-full flex flex-col bg-black/20">
        <header className="app-header pb-2 px-6 shrink-0">
          <div className="flex justify-between items-start">
          <div>
            <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">
              Couple's Game
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">情侣飞行棋</h1>
          </div>
          <div className="flex flex-col items-end gap-2 mt-1">
            <div className="flex items-center gap-1.5">
              <RoleSwitch role={myRole} online={Boolean(cloud.space)} onChange={changeMyRole} />
              <button
                type="button"
                onClick={() => setCloudOpen(true)}
                className="ios-btn flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/10"
                aria-label="云同步与联机"
                title="云同步与联机"
              >
                <Cloud size={17} className={cloud.space ? 'text-[#30D158]' : 'text-gray-400'} />
              </button>
              <button
                type="button"
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                className="ios-btn flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/10"
                aria-label={theme === 'light' ? '切换到黑夜主题' : '切换到白天主题'}
                title={theme === 'light' ? '切换到黑夜主题' : '切换到白天主题'}
              >
                {theme === 'light' ? (
                  <Moon size={17} className="text-gray-400" />
                ) : (
                  <Sun size={17} className="text-[#FFD60A]" />
                )}
              </button>
              <a
                href="https://github.com/menoking/couple-chess"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-white transition-colors"
                title="GitHub Repository"
              >
                <Github size={22} />
              </a>
            </div>
            <span className="text-xs text-gray-500">
              由 Meno 改版
            </span>
          </div>
          </div>
        </header>

        <main className="flex-1 min-h-0 relative overflow-hidden">
          <div
            className={`absolute inset-0 flex flex-col px-6 pt-4 pb-2 transition-all duration-500 ease-in-out ${
              state.view === 'home'
                ? 'translate-x-0 opacity-100'
                : 'opacity-0 pointer-events-none -translate-x-full'
            }`}
          >
            <HomeView
              players={state.players}
              myRole={myRole}
              themes={state.themes}
              gameMode={state.gameMode}
              onSelectMode={selectGameMode}
              onSelectTheme={handleSelectTheme}
              onStartGame={handleStartGame}
              online={Boolean(cloud.space)}
              remoteModeLabel={remoteRoom && !onlineSession ? MODE_LABEL[remoteRoom.mode] : null}
              onJoinRemote={() => {
                if (!remoteRoom) return;
                const target = remoteRoom.mode;
                setRemoteRoom(null);
                void enterOnline(target);
              }}
            />
          </div>

          <div
            className={`absolute inset-0 flex flex-col min-h-0 px-6 pt-4 transition-all duration-500 ease-in-out ${
              state.view === 'themes'
                ? 'translate-x-0 opacity-100'
                : 'opacity-0 pointer-events-none translate-x-full'
            }`}
          >
            <ThemesView
              themes={state.themes}
              onCreateTheme={() => setIsCreateThemeModalOpen(true)}
              onEditTheme={themeId => setEditingThemeId(themeId)}
            />
          </div>
        </main>

        <BottomNav activeView={state.view} onNavigate={handleNavigate} />
      </div>

      <ThemeSelectorModal
        isOpen={isThemeModalOpen}
        themes={selectableThemes}
        selectedThemeId={selectedPlayer?.themeId || null}
        onSelect={handleThemeSelect}
        onClose={() => setIsThemeModalOpen(false)}
      />

      <TaskCardModal
        players={state.players}
        isOpen={!!taskData}
        taskData={taskData}
        onAccept={handleTaskAccept}
        onReject={handleTaskReject}
        onClose={handleTaskReject}
      />

      <MineBombChoiceModal
        isOpen={isMineBombChoiceOpen}
        activePlayer={state.players[state.turn] || null}
        selectorPlayer={state.players[state.turn === 0 ? 1 : 0] || null}
        onChoose={handleMineBombChoice}
      />

      <PoseCardModal
        isOpen={!!poseImageSrc}
        imageSrc={poseImageSrc}
        onAccept={handlePoseDone}
        onReject={handlePoseDone}
        onClose={handlePoseDone}
      />

      <WinModal
        isOpen={winnerId !== null}
        winnerName={winnerId !== null ? state.players[winnerId].name : ''}
        onRestart={() => {
          resetGame();
          setWinnerId(null);
        }}
      />

      <ThemeCreateModal
        isOpen={isCreateThemeModalOpen}
        onClose={() => setIsCreateThemeModalOpen(false)}
        onCreate={input => {
          const id = createTheme(input);
          setIsCreateThemeModalOpen(false);
          if (id) setEditingThemeId(id);
        }}
      />

      <ThemeEditorModal
        isOpen={!!editingThemeId}
        theme={editingThemeId ? state.themes.find(t => t.id === editingThemeId) || null : null}
        onClose={() => {
          setEditingThemeId(null);
          setAiImportThemeId(null);
        }}
        onSaveMeta={(themeId, patch) => updateThemeMeta(themeId, patch)}
        onAddTask={(themeId, taskText, executor) => addThemeTask(themeId, taskText, executor)}
        onUpdateTask={updateThemeTask}
        onRemoveTask={(themeId, index) => removeThemeTask(themeId, index)}
        onOpenAiImport={themeId => setAiImportThemeId(themeId)}
      />

      <AiImportModal
        isOpen={!!aiImportThemeId}
        themeName={aiImportThemeId ? state.themes.find(t => t.id === aiImportThemeId)?.name || '' : ''}
        onClose={() => setAiImportThemeId(null)}
        onImport={(tasks, mode) => {
          if (!aiImportThemeId) return;
          importThemeTasks(aiImportThemeId, tasks, mode);
        }}
      />

      {state.view === 'game' && (
        <GameView
          players={state.players}
          boardMap={state.boardMap}
          pathCoords={state.pathCoords}
          currentTurn={state.turn}
          isRolling={state.isRolling}
          onMove={movePlayer}
          onCheckTile={checkTile}
          onEndTurn={endTurn}
          onSetRolling={setIsRolling}
          onWin={handleWin}
          onTaskTrigger={handleTaskTrigger}
          onBack={handleBackFromGame}
        />
      )}

      {state.view === 'card' && (
        <CardModeView
          players={state.players}
          themes={state.themes}
          currentTurn={state.turn}
          onDrawTask={drawCardTask}
          onTaskTrigger={handleTaskTrigger}
          onEndTurn={endTurn}
          pendingCards={taskData ? 1 : 0}
          onBack={handleBackFromGame}
        />
      )}

      {state.view === 'mine' && (
        <MineModeView
          players={state.players}
          themes={state.themes}
          mineBoard={state.mineBoard}
          mineProgress={state.mineSafeProgress ?? [0, 0]}
          currentTurn={state.turn}
          onRevealTile={revealMineTile}
          onToggleFlag={toggleMineTileFlag}
          onTaskTrigger={handleTaskTrigger}
          onBombTrigger={handleMineBombTrigger}
          onEndTurn={endTurn}
          pendingCards={taskData ? 1 : 0}
          onBack={handleBackFromGame}
        />
      )}

      {state.view === 'pose' && (
        <PoseModeView
          players={state.players}
          currentTurn={state.turn}
          onPoseTrigger={setPoseImageSrc}
          onEndTurn={endTurn}
          pendingCards={taskData ? 1 : 0}
          onBack={handleBackFromGame}
        />
      )}


      {state.view === 'roulette' && (
        <RouletteModeView
          players={state.players}
          themes={state.themes}
          currentTurn={state.turn}
          onEndTurn={endTurn}
          onBack={handleBackFromGame}
        />
      )}

      {state.view === 'bingo' && state.bingoBoard && (
        <BingoModeView
          players={state.players}
          themes={state.themes}
          bingoBoard={state.bingoBoard}
          currentTurn={state.turn}
          onCompleteCell={completeBingoCell}
          onRestart={restartBingo}
          onEndTurn={endTurn}
          onBack={handleBackFromGame}
        />
      )}

      {state.view === 'quiz' && (
        <QuizModeView
          players={state.players}
          onBack={handleBackFromGame}
        />
      )}

      {state.view === 'memory' && (
        <MemoryModeView
          players={state.players}
          themes={state.themes}
          currentTurn={state.turn}
          onEndTurn={endTurn}
          onBack={handleBackFromGame}
        />
      )}


      {state.view === 'timed' && (
        <TimedModeView
          players={state.players}
          themes={state.themes}
          onBack={handleBackFromGame}
        />
      )}

      {state.view === 'story' && (
        <StoryModeView
          players={state.players}
          onBack={handleBackFromGame}
        />
      )}


      {state.view === 'survival' && (
        <SurvivalModeView
          players={state.players}
          themes={state.themes}
          currentTurn={state.turn}
          onEndTurn={endTurn}
          onBack={handleBackFromGame}
        />
      )}

      {state.view === 'territory' && (
        <TerritoryModeView
          players={state.players}
          themes={state.themes}
          currentTurn={state.turn}
          onEndTurn={endTurn}
          onBack={handleBackFromGame}
        />
      )}

      {state.view === 'auction' && (
        <AuctionModeView
          players={state.players}
          themes={state.themes}
          pendingCards={taskData ? 1 : 0}
          onBack={handleBackFromGame}
        />
      )}

      {state.view === 'gridchess' && (
        <GridChessModeView
          players={state.players}
          themes={state.themes}
          onBack={handleBackFromGame}
        />
      )}

      {state.view === 'trutndare' && (
        <TruthDareModeView
          players={state.players}
          themes={state.themes}
          currentTurn={state.turn}
          onEndTurn={endTurn}
          onBack={handleBackFromGame}
        />
      )}

      {state.view === 'gamble' && (
        <GambleModeView
          players={state.players}
          themes={state.themes}
          onBack={handleBackFromGame}
        />
      )}

      {state.view === 'edge' && (
        <EdgeModeView
          players={state.players}
          themes={state.themes}
          onBack={handleBackFromGame}
        />
      )}

      {state.view === 'roleplay' && (
        <RoleplayModeView
          players={state.players}
          onBack={handleBackFromGame}
        />
      )}

      {state.view === 'jubensha' && (
        <JubenshaModeView
          players={state.players}
          onBack={handleBackFromGame}
        />
      )}

      {state.view === 'sudoku' && (
        <SudokuModeView
          players={state.players}
          themes={state.themes}
          currentTurn={state.turn}
          onBack={handleBackFromGame}
        />
      )}

      {state.view === 'go' && (
        <GoModeView
          players={state.players}
          themes={state.themes}
          currentTurn={state.turn}
          onBack={handleBackFromGame}
        />
      )}

      {state.view === 'bluff' && (
        <BluffDiceModeView
          players={state.players}
          themes={state.themes}
          currentTurn={state.turn}
          onBack={handleBackFromGame}
        />
      )}

      {state.view === 'jungle' && (
        <JungleModeView
          players={state.players}
          themes={state.themes}
          currentTurn={state.turn}
          onBack={handleBackFromGame}
        />
      )}

      {onlineNotice && (
        <div className={`fixed inset-x-0 top-20 z-[126] mx-auto w-[calc(100%-2.5rem)] max-w-[390px] rounded-2xl border px-4 py-3 text-center text-xs font-bold text-white backdrop-blur ${
          onlineNotice.ok
            ? 'border-[#30D158]/35 bg-[#30D158]/15'
            : 'border-[#FF453A]/30 bg-[#FF453A]/15'
        }`}>
          {onlineNotice.text}
          <button type="button" onClick={() => setOnlineNotice(null)} className="ml-2 text-gray-300">知道了</button>
        </div>
      )}

      <CloudPanel
        open={cloudOpen}
        onClose={() => setCloudOpen(false)}
        cloud={cloud}
        transportKind={cloudConfigured ? 'supabase' : 'local'}
        onEnterRoom={mode => {
          diagLog('panel:session', { mode });
          setCloudOpen(false);
          void enterOnline(mode);
        }}
        syncStatus={cloudSync.status}
        syncError={cloudSync.error}
        onRetrySync={cloud.retrySync}
        supabaseHost={supabaseHost}
        lastSyncedAt={cloudSync.lastSyncedAt}
      />

      {onlineSession && (
        <OnlineStage
          roomId={onlineSession.roomId}
          mode={onlineSession.mode}
          mySeat={onlineSession.mySeat}
          hostSeat={onlineSession.hostSeat}
          roles={onlineSession.roles}
          myRole={onlineSession.myRole}
          themes={state.themes}
          kind={cloudConfigured ? 'supabase' : 'local'}
          onExit={() => {
            void leaveOnlineRoom(onlineSession.roomId);
            setOnlineSession(null);
          }}
          onTakeOver={() => void takeOverRoom()}
          onConflict={rejoinRoom}
        />
      )}
    </div>
  );
}

export default App;
