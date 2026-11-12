import { useEffect, useState } from 'react';
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
import { PenaltyLadderModeView } from './components/views/PenaltyLadderModeView';
import { SecretDoubleModeView } from './components/views/SecretDoubleModeView';
import { RoleplayModeView } from './components/views/RoleplayModeView';
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
import { OnlinePlayView, OnlineRoomInfo } from './cloud/OnlinePlayView';
import { cloudConfigured } from './cloud/client';
import { enterOnlineRoom, announceRoom, subscribeSpaceRooms, RoomAnnounce } from './cloud/rooms';
import { ONLINE_MODES, OnlineModeKey } from './cloud/games/adapters';
import { Seat } from './cloud/types';

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
  'penaltygrid',
  'secretdouble',
  'sudoku',
  'go',
  'bluff',
  'jungle'
]);

const MODE_THEME_MODE: Partial<Record<GameMode, ThemeMode>> = {
  board: 'board',
  card: 'card',
  roulette: 'card',
  bingo: 'card',
  memory: 'card',
  timed: 'card',
  survival: 'card',
  territory: 'card',
  auction: 'card',
  gridchess: 'card',
  trutndare: 'card',
  penaltygrid: 'card',
  secretdouble: 'card',
  sudoku: 'card',
  go: 'card',
  bluff: 'card',
  jungle: 'card',
  mine: 'mineTheme'
};

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

  const [cloudOpen, setCloudOpen] = useState(false);
  const [onlineSession, setOnlineSession] = useState<{ room: OnlineRoomInfo; isHost: boolean } | null>(null);
  const [onlinePrompt, setOnlinePrompt] = useState<OnlineModeKey | null>(null);
  const [remoteRoom, setRemoteRoom] = useState<RoomAnnounce | null>(null);
  const [onlineNotice, setOnlineNotice] = useState<string | null>(null);
  const cloud = useCloud();

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
    revealMineTile,
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
  const selectedModeForTheme: ThemeMode = MODE_THEME_MODE[state.gameMode] ?? 'board';
  const selectableThemes = state.themes.filter(
    t =>
      (t.audience === 'common' || t.audience === selectedPlayer.role) &&
      t.modes.includes(selectedModeForTheme)
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

  /** 登录后，三个支持联机的玩法先让用户选「同屏」还是「两台设备」 */
  const handleStartGame = () => {
    const onlineMode = ONLINE_MODES.find(item => item.key === state.gameMode);
    if (cloud.space && onlineMode) {
      setOnlinePrompt(onlineMode.key);
      return;
    }
    startLocalGame();
  };

  const enterOnline = async (mode: OnlineModeKey) => {
    if (!cloud.space) return;
    try {
      const ticket = await enterOnlineRoom(cloud.space, mode);
      if (!ticket) return;
      setOnlineSession({ room: { roomId: ticket.roomId, mode: ticket.mode }, isHost: ticket.isHost });
      setOnlinePrompt(null);
      void announceRoom(cloud.space, ticket.roomId, ticket.mode);
    } catch (error) {
      setOnlineNotice(error instanceof Error ? error.message : '进房间失败');
    }
  };

  // 对方进房间时提示「一起来」
  useEffect(() => {
    if (!cloud.space) {
      setRemoteRoom(null);
      return;
    }
    return subscribeSpaceRooms(cloud.space, announce => {
      setRemoteRoom(announce);
    });
  }, [cloud.space]);

  const handleTaskTrigger = (data: TaskEventData) => {
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
    enabled: cloudConfigured && !!cloud.space
  });

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
        <header className="app-header pb-2 px-6 shrink-0 flex justify-between items-start">
          <div>
            <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">
              Couple's Game
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">情侣飞行棋</h1>
          </div>
          <div className="flex flex-col items-end gap-2 mt-1">
            <div className="flex items-center gap-2">
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
              themes={state.themes}
              gameMode={state.gameMode}
              onSelectMode={selectGameMode}
              onSelectTheme={handleSelectTheme}
              onStartGame={handleStartGame}
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
        onAddTask={(themeId, taskText) => addThemeTask(themeId, taskText)}
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
          onBack={handleBackFromGame}
        />
      )}

      {state.view === 'mine' && (
        <MineModeView
          players={state.players}
          themes={state.themes}
          mineBoard={state.mineBoard}
          currentTurn={state.turn}
          onRevealTile={revealMineTile}
          onTaskTrigger={handleTaskTrigger}
          onBombTrigger={handleMineBombTrigger}
          onEndTurn={endTurn}
          onBack={handleBackFromGame}
        />
      )}

      {state.view === 'pose' && (
        <PoseModeView
          players={state.players}
          currentTurn={state.turn}
          onPoseTrigger={setPoseImageSrc}
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

      {state.view === 'penaltygrid' && (
        <PenaltyLadderModeView
          players={state.players}
          themes={state.themes}
          onBack={handleBackFromGame}
        />
      )}

      {state.view === 'secretdouble' && (
        <SecretDoubleModeView
          players={state.players}
          themes={state.themes}
          currentTurn={state.turn}
          onEndTurn={endTurn}
          onBack={handleBackFromGame}
        />
      )}

      {state.view === 'roleplay' && (
        <RoleplayModeView
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

      {onlinePrompt && (
        <div className="fixed inset-0 z-[125] flex items-end justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-[430px] rounded-t-3xl border-t border-white/10 bg-[#1C1C1E] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div className="text-center text-base font-bold text-white">这一局怎么玩？</div>
            <div className="mt-1 text-center text-[11px] text-gray-500">
              {ONLINE_MODES.find(item => item.key === onlinePrompt)?.label}
            </div>
            <button
              type="button"
              onClick={() => { setOnlinePrompt(null); startLocalGame(); }}
              className="ios-btn mt-4 h-14 w-full rounded-2xl bg-white/10 text-sm font-bold text-white"
            >
              同屏玩（一台设备，两人轮流）
            </button>
            <button
              type="button"
              onClick={() => void enterOnline(onlinePrompt)}
              className="ios-btn mt-2 h-14 w-full rounded-2xl bg-white text-sm font-bold text-black shadow-lg"
            >
              两台设备联机（各看各的）
            </button>
            <button
              type="button"
              onClick={() => setOnlinePrompt(null)}
              className="ios-btn mt-2 h-10 w-full rounded-full text-xs font-bold text-gray-500"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {remoteRoom && !onlineSession && (
        <button
          type="button"
          onClick={() => {
            setOnlineSession({ room: { roomId: remoteRoom.roomId, mode: remoteRoom.mode }, isHost: false });
            setRemoteRoom(null);
          }}
          className="fixed inset-x-0 bottom-[calc(88px+env(safe-area-inset-bottom))] z-[124] mx-auto flex w-[calc(100%-2.5rem)] max-w-[390px] items-center justify-between rounded-2xl border border-[#30D158]/40 bg-[#30D158]/15 px-4 py-3 backdrop-blur"
        >
          <span className="text-xs font-bold text-white">
            对方正在玩「{ONLINE_MODES.find(item => item.key === remoteRoom.mode)?.label}」
          </span>
          <span className="text-xs font-bold text-[#30D158]">加入 →</span>
        </button>
      )}

      {onlineNotice && (
        <div className="fixed inset-x-0 top-20 z-[126] mx-auto w-[calc(100%-2.5rem)] max-w-[390px] rounded-2xl border border-[#FF453A]/30 bg-[#FF453A]/15 px-4 py-3 text-center text-xs font-bold text-white backdrop-blur">
          {onlineNotice}
          <button type="button" onClick={() => setOnlineNotice(null)} className="ml-2 text-gray-300">知道了</button>
        </div>
      )}

      <CloudPanel
        open={cloudOpen}
        onClose={() => setCloudOpen(false)}
        cloud={cloud}
        transportKind={cloudConfigured ? 'supabase' : 'local'}
        onEnterRoom={(room, isHost) => { setOnlineSession({ room, isHost }); setCloudOpen(false); }}
        syncStatus={cloudSync.status}
        lastSyncedAt={cloudSync.lastSyncedAt}
      />

      {onlineSession && cloud.space && (
        <OnlinePlayView
          room={onlineSession.room}
          isHost={onlineSession.isHost}
          players={state.players.map(player => ({
            seat: player.id as Seat,
            name: player.name,
            color: player.color
          }))}
          kind={cloudConfigured ? 'supabase' : 'local'}
          onExit={() => setOnlineSession(null)}
        />
      )}
    </div>
  );
}

export default App;
