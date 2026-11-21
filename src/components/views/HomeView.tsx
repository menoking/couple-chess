import { useRef, useState } from 'react';
import { GameMode, Player, PlayerRole, Theme } from '../../types';
import { THEME_FREE_MODES } from '../../rules/registry';
import { Bomb, BookOpen, Brain, ChevronRight, CircleDashed, CircleDot, Crown, Dice5, Disc3, Flag, Flame, Gavel, Grid2x2, Grid3x3, Heart, HeartPulse, ImageIcon, Layers3, MessageCircleQuestion, PawPrint, ScrollText, ShieldQuestion, Theater, Timer, User, UserRound } from 'lucide-react';

interface HomeViewProps {
  players: Player[];
  /** 当前使用者的性别，用于把「我」排在前面 */
  myRole?: PlayerRole;
  themes: Theme[];
  gameMode: GameMode;
  onSelectMode: (mode: GameMode) => void;
  onSelectTheme: (playerId: number) => void;
  onStartGame: () => void;
  /** 登录态：卡包改为进房后各自选择，首页不再提供旧入口 */
  online?: boolean;
  /** 对方正在玩的玩法（房主心跳有效期内），显示在标题上方 */
  remoteModeLabel?: string | null;
  onJoinRemote?: () => void;
}

interface ModeDef {
  id: GameMode;
  title: string;
  desc: string;
  icon: typeof Dice5;
}

interface ModeCategory {
  id: string;
  label: string;
  modes: ModeDef[];
}

const CATEGORIES: ModeCategory[] = [
  {
    id: 'classic',
    label: '经典',
    modes: [
      { id: 'board', title: '飞行棋模式', desc: '投骰子走棋，落格触发任务', icon: Dice5 },
      { id: 'card', title: '任务卡牌', desc: '轮流抽取任务，不用投骰子', icon: Layers3 },
      { id: 'mine', title: '扫雷模式', desc: '点击方格，触发隐藏事件', icon: Bomb },
      { id: 'roulette', title: '情侣转盘', desc: '随机组合执行者、动作、部位与时长', icon: Disc3 },
      { id: 'pose', title: '姿势模式', desc: '轮流抽取姿势图片', icon: ImageIcon }
    ]
  },
  {
    id: 'puzzle',
    label: '益智',
    modes: [
      { id: 'bingo', title: '情侣 Bingo', desc: '任务排成盘，连线拿奖励', icon: Grid3x3 },
      { id: 'memory', title: '记忆翻牌', desc: '翻配对任务卡，完成匹配任务', icon: Brain },
      { id: 'gridchess', title: '点格棋', desc: '连点闭合格子，闭合者再走一步', icon: CircleDot },
      { id: 'sudoku', title: '数独', desc: '解出一个格子数字就抽一张卡', icon: Grid2x2 },
      { id: 'go', title: '九路围棋', desc: '提子兑卡，终局胜方多抽', icon: CircleDashed },
      { id: 'jungle', title: '斗兽棋', desc: '吃一子抽一张卡，攻入兽穴获胜', icon: PawPrint },
      { id: 'auction', title: '拍卖竞价', desc: '竞价争夺任务，出价高奖励多', icon: Gavel }
    ]
  },
  {
    id: 'interactive',
    label: '互动',
    modes: [
      { id: 'quiz', title: '默契问答', desc: '分别作答同时揭晓，比谁更懂', icon: MessageCircleQuestion },
      { id: 'timed', title: '限时挑战', desc: '倒计时连续完成任务计分', icon: Timer },
      { id: 'bluff', title: '吹牛骰', desc: '藏骰叫点，敢不敢开对方', icon: ShieldQuestion }
    ]
  },
  {
    id: 'story',
    label: '剧情',
    modes: [
      { id: 'story', title: '故事接龙', desc: '轮流抽情节卡，共写情侣故事', icon: BookOpen },
      { id: 'jubensha', title: '双人剧本杀', desc: '分幕读本搜证，关键抉择走向不同结局', icon: ScrollText },
      { id: 'survival', title: '合作生存', desc: '共享生命值，完成任务抵御事件', icon: HeartPulse },
      { id: 'territory', title: '领地争夺', desc: '占领棋盘区域，攻城夺地', icon: Flag }
    ]
  },
  {
    id: 'spicy',
    label: '挑战',
    modes: [
      { id: 'trutndare', title: '真心话大冒险', desc: '狂暴版：禁区、当众、三连事件', icon: Flame },
      { id: 'gamble', title: '赌局轮盘', desc: '赌上今晚主权，输家听差遣', icon: Crown },
      { id: 'edge', title: '高潮边缘', desc: '推对方到临界点，先崩者输', icon: Heart },
      { id: 'roleplay', title: '角色扮演', desc: '抽剧本即兴演，权力反转台词', icon: Theater }
    ]
  }
];

const MODE_START_LABELS: Partial<Record<GameMode, string>> = {
  card: '开始抽卡',
  pose: '开始抽姿势',
  roulette: '开始转盘',
  bingo: '开始 Bingo',
  mine: '开始扫雷',
  quiz: '开始问答',
  memory: '开始翻牌',
  timed: '开始挑战',
  story: '开始接龙',
  jubensha: '开始剧本',
  survival: '开始生存',
  territory: '开始争夺',
  auction: '开始拍卖',
  gridchess: '开始点格棋',
  trutndare: '开始狂暴版',
  gamble: '开始赌局',
  edge: '开始对决',
  roleplay: '开始演戏',
  bluff: '开始吹牛',
  jungle: '开始斗兽',
  sudoku: '开始数独',
  go: '开始围棋'
};

const MODE_THEME_HINTS: Partial<Record<GameMode, string>> = {
  card: '选择游戏模式和双方抽卡题库',
  roulette: '选择游戏模式和双方抽卡题库',
  bingo: '选择游戏模式和双方抽卡题库',
  memory: '选择游戏模式和双方抽卡题库',
  timed: '选择游戏模式和双方抽卡题库',
  survival: '选择游戏模式和双方抽卡题库',
  territory: '选择游戏模式和双方抽卡题库',
  auction: '选择游戏模式和双方抽卡题库',
  gridchess: '选择游戏模式和双方抽卡题库',
  trutndare: '选择游戏模式和双方抽卡题库',
  bluff: '选择游戏模式和双方抽卡题库',
  jungle: '选择游戏模式和双方抽卡题库',
  sudoku: '选择游戏模式和双方抽卡题库',
  go: '选择游戏模式和双方抽卡题库',
  mine: '选择游戏模式和双方扫雷主题题库',
  quiz: '无需题库，直接开始默契问答',
  story: '无需题库，直接开始故事接龙',
  jubensha: '无需题库，直接开始双人剧本杀',
  gamble: '无需题库，直接开始赌局轮盘',
  edge: '无需题库，直接开始定力对决',
  roleplay: '无需题库，直接开始角色扮演'
};

function findCategoryOf(modeId: GameMode): string {
  for (const category of CATEGORIES) {
    if (category.modes.some(mode => mode.id === modeId)) return category.id;
  }
  return CATEGORIES[0].id;
}

export function HomeView({
  players,
  myRole,
  themes,
  gameMode,
  onSelectMode,
  onSelectTheme,
  onStartGame,
  online = false,
  remoteModeLabel = null,
  onJoinRemote
}: HomeViewProps) {
  // 登录态下卡包在房间大厅里各自选，首页不再显示旧的主题选择卡
  const shouldShowThemeSelectors = !online && !THEME_FREE_MODES.has(gameMode);
  const themeHint = online
    ? '点开始自动进房，两台设备各自选卡包并锁定'
    : MODE_THEME_HINTS[gameMode] ?? '选择游戏模式和双方任务主题包';
  const [activeCategory, setActiveCategory] = useState<string>(() => findCategoryOf(gameMode));
  const activeModes = CATEGORIES.find(category => category.id === activeCategory)?.modes ?? CATEGORIES[0].modes;

  // PC 端鼠标拖拽横向滑动
  const scrollerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef({ dragging: false, startX: 0, startScrollLeft: 0, moved: false });

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    dragState.current = { dragging: true, startX: e.clientX, startScrollLeft: scroller.scrollLeft, moved: false };
  };

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const s = dragState.current;
    if (!s.dragging) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const dx = e.clientX - s.startX;
    if (Math.abs(dx) > 4) s.moved = true;
    scroller.scrollLeft = s.startScrollLeft - dx;
  };

  const onMouseUp = () => {
    dragState.current.dragging = false;
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    // 纵向滚轮转为横向滑动
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      scroller.scrollLeft += e.deltaY;
    }
  };

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar space-y-6 pt-2 pb-4">
        {remoteModeLabel && (
          <button
            type="button"
            onClick={onJoinRemote}
            className="ios-btn flex w-full items-center justify-between rounded-2xl border border-[#30D158]/40 bg-[#30D158]/12 px-4 py-2.5"
          >
            <span className="min-w-0 truncate text-xs font-bold text-white">
              对方正在玩「{remoteModeLabel}」
            </span>
            <span className="shrink-0 text-xs font-bold text-[#30D158]">一起玩 →</span>
          </button>
        )}

        <div className="text-center mb-4">
          <h2 className="text-xl text-gray-300 font-medium">配置游戏角色</h2>
          <p className="text-sm text-gray-500 mt-2">
            {shouldShowThemeSelectors ? themeHint : '选择游戏模式即可开始'}
          </p>
        </div>

        {/* 分类页签 */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {CATEGORIES.map(category => (
            <button
              key={category.id}
              type="button"
              onClick={() => setActiveCategory(category.id)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition-all ios-btn ${
                category.id === activeCategory
                  ? 'bg-white text-black'
                  : 'bg-white/5 text-gray-400'
              }`}
            >
              {category.label}
            </button>
          ))}
        </div>

        {/* 分类内玩法横向滑动 */}
        <div
          ref={scrollerRef}
          className="-mx-1 overflow-x-auto no-scrollbar px-1 pb-1 snap-x snap-mandatory cursor-grab select-none active:cursor-grabbing"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onWheel={onWheel}
        >
          <div className="flex gap-3">
            {activeModes.map(mode => {
              const Icon = mode.icon;
              const isActive = mode.id === gameMode;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => {
                    if (dragState.current.moved) {
                      dragState.current.moved = false;
                      return;
                    }
                    onSelectMode(mode.id);
                  }}
                  className={`min-h-[108px] basis-[calc((100%_-_0.75rem)/2)] min-w-[168px] shrink-0 snap-start rounded-[20px] border p-4 text-left transition-all ios-btn ${
                    isActive
                      ? 'bg-white text-black border-white shadow-lg'
                      : 'bg-[#1C1C1E] text-white border-white/5'
                  }`}
                >
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full mb-3 ${
                      isActive ? 'bg-black text-white' : 'bg-white/5 text-gray-300'
                    }`}
                  >
                    <Icon size={22} />
                  </div>
                  <div className="text-sm font-bold leading-tight">{mode.title}</div>
                  <div className={`text-xs leading-relaxed mt-1 ${isActive ? 'text-black/60' : 'text-gray-500'}`}>
                    {mode.desc}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {online && (
          <div className="rounded-2xl border border-[#30D158]/25 bg-[#30D158]/10 px-4 py-3">
            <div className="text-xs font-bold text-white">
              {THEME_FREE_MODES.has(gameMode) ? '双设备联机 · 进房即可开始' : '双设备联机 · 进房后各自选卡包'}
            </div>
            <div className="mt-1 text-[11px] leading-relaxed text-gray-400">
              {THEME_FREE_MODES.has(gameMode)
                ? '这个玩法自带内容、不抽主题卡，进房后不用选卡包，任意一方点「开始游戏」即可。'
                : '点开始会自动进入房间。两台设备各自勾选卡包并点「锁定我的卡包」，双方都锁定后自动合并成公共题库并开局。'}
            </div>
          </div>
        )}

        {shouldShowThemeSelectors && (
        <div className="space-y-4">
          {[...players]
            .sort((a, b) => (a.role === myRole ? -1 : b.role === myRole ? 1 : 0))
            .map(player => {
            const theme = themes.find(t => t.id === player.themeId);
            const isMale = player.role === 'male';
            const isMe = player.role === myRole;
            const selectorName = `${player.name}${isMe ? '（你）' : ''} (Player ${player.id + 1})`;
            const selectedThemeLabel = theme?.name || '未选择主题';

            return (
              <div
                key={player.id}
                className="ios-card p-5 flex items-center justify-between ios-btn cursor-pointer group border border-white/5"
                onClick={() => onSelectTheme(player.id)}
              >
                <div className="flex items-center gap-4">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg"
                    style={{
                      backgroundColor: player.color,
                      boxShadow: `0 10px 15px -3px ${player.color}30`
                    }}
                  >
                    {isMale ? (
                      <User className="text-white" size={24} />
                    ) : (
                      <UserRound className="text-white" size={24} />
                    )}
                  </div>
                  <div>
                    <div className="text-base font-semibold text-white">
                      {selectorName}
                    </div>
                    <div className="text-sm font-medium text-white mt-0.5">
                      {selectedThemeLabel}
                    </div>
                  </div>
                </div>
                <ChevronRight className="text-gray-600" size={20} />
              </div>
            );
          })}
        </div>
        )}
      </div>

      <div className="relative z-20 shrink-0 pt-3 pb-1 bg-gradient-to-t from-black via-black/95 to-black/0">
        <button
          type="button"
          className="w-full h-14 bg-white rounded-full text-black font-semibold text-lg shadow-lg ios-btn flex items-center justify-center gap-2"
          onClick={onStartGame}
        >
          <span>
            {online ? '进房并开始' : MODE_START_LABELS[gameMode] ?? '开始游戏'}
          </span>
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
}
