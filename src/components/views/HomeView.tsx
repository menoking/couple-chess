import { useRef, useState } from 'react';
import { GameMode, Player, Theme } from '../../types';
import { Bomb, BookOpen, Brain, ChevronRight, CircleDot, Crown, Dice5, Dices, Disc3, Flag, Flame, Gift, Gavel, Grid2x2, Grid3x3, Heart, HeartPulse, ImageIcon, Layers3, MessageCircleQuestion, Music, Shuffle, Theater, Timer, User, UserRound, Zap } from 'lucide-react';

interface HomeViewProps {
  players: Player[];
  themes: Theme[];
  gameMode: GameMode;
  onSelectMode: (mode: GameMode) => void;
  onSelectTheme: (playerId: number) => void;
  onStartGame: () => void;
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
      { id: 'dice', title: '亲密骰子', desc: '上下骰子组合动作与部位', icon: Dices },
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
      { id: 'auction', title: '拍卖竞价', desc: '竞价争夺任务，出价高奖励多', icon: Gavel }
    ]
  },
  {
    id: 'interactive',
    label: '互动',
    modes: [
      { id: 'quiz', title: '默契问答', desc: '分别作答同时揭晓，比谁更懂', icon: MessageCircleQuestion },
      { id: 'timed', title: '限时挑战', desc: '倒计时连续完成任务计分', icon: Timer },
      { id: 'rhythm', title: '节奏挑战', desc: '跟随节拍互动，失误执行惩罚', icon: Music },
      { id: 'events', title: '随机事件', desc: '抽卡触发交换身份、任务升级', icon: Shuffle }
    ]
  },
  {
    id: 'story',
    label: '剧情',
    modes: [
      { id: 'story', title: '故事接龙', desc: '轮流抽情节卡，共写情侣故事', icon: BookOpen },
      { id: 'survival', title: '合作生存', desc: '共享生命值，完成任务抵御事件', icon: HeartPulse },
      { id: 'blindbox', title: '盲盒抽奖', desc: '抽奖励、任务、免罚、双倍卡', icon: Gift },
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
      { id: 'penaltygrid', title: '惩罚九宫格', desc: '失败落子，先连线者主导整晚', icon: Grid3x3 },
      { id: 'secretdouble', title: '秘密翻倍', desc: '任务卡加码翻倍，赌命二选一', icon: Zap },
      { id: 'roleplay', title: '角色扮演', desc: '抽剧本即兴演，权力反转台词', icon: Theater }
    ]
  }
];

const MODE_START_LABELS: Partial<Record<GameMode, string>> = {
  card: '开始抽卡',
  pose: '开始抽姿势',
  roulette: '开始转盘',
  bingo: '开始 Bingo',
  dice: '开始骰子',
  mine: '开始扫雷',
  quiz: '开始问答',
  memory: '开始翻牌',
  blindbox: '开始开盲盒',
  timed: '开始挑战',
  story: '开始接龙',
  rhythm: '开始挑战',
  events: '开始抽卡',
  survival: '开始生存',
  territory: '开始争夺',
  auction: '开始拍卖',
  gridchess: '开始点格棋',
  trutndare: '开始狂暴版',
  gamble: '开始赌局',
  edge: '开始对决',
  penaltygrid: '开始九宫格',
  secretdouble: '开始翻倍',
  roleplay: '开始演戏',
  sudoku: '开始数独'
};

const MODE_THEME_HINTS: Partial<Record<GameMode, string>> = {
  dice: '选择上骰子动作主题和下骰子部位主题',
  card: '选择游戏模式和双方抽卡题库',
  roulette: '选择游戏模式和双方抽卡题库',
  bingo: '选择游戏模式和双方抽卡题库',
  memory: '选择游戏模式和双方抽卡题库',
  blindbox: '选择游戏模式和双方抽卡题库',
  timed: '选择游戏模式和双方抽卡题库',
  events: '选择游戏模式和双方抽卡题库',
  survival: '选择游戏模式和双方抽卡题库',
  territory: '选择游戏模式和双方抽卡题库',
  auction: '选择游戏模式和双方抽卡题库',
  gridchess: '选择游戏模式和双方抽卡题库',
  trutndare: '选择游戏模式和双方抽卡题库',
  penaltygrid: '选择游戏模式和双方抽卡题库',
  secretdouble: '选择游戏模式和双方抽卡题库',
  sudoku: '选择游戏模式和双方抽卡题库',
  mine: '选择游戏模式和双方扫雷主题题库',
  quiz: '无需题库，直接开始默契问答',
  story: '无需题库，直接开始故事接龙',
  rhythm: '无需题库，直接开始节奏挑战',
  gamble: '无需题库，直接开始赌局轮盘',
  edge: '无需题库，直接开始定力对决',
  roleplay: '无需题库，直接开始角色扮演'
};

/** 自备内容、不需要选择主题的玩法。 */
const THEME_FREE_MODES = new Set<GameMode>(['pose', 'quiz', 'story', 'rhythm', 'gamble', 'edge', 'roleplay']);

function findCategoryOf(modeId: GameMode): string {
  for (const category of CATEGORIES) {
    if (category.modes.some(mode => mode.id === modeId)) return category.id;
  }
  return CATEGORIES[0].id;
}

export function HomeView({
  players,
  themes,
  gameMode,
  onSelectMode,
  onSelectTheme,
  onStartGame
}: HomeViewProps) {
  const shouldShowThemeSelectors = !THEME_FREE_MODES.has(gameMode);
  const themeHint = MODE_THEME_HINTS[gameMode] ?? '选择游戏模式和双方任务主题包';
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

        {shouldShowThemeSelectors && (
        <div className="space-y-4">
          {players.map((player, idx) => {
            const theme = themes.find(t => t.id === player.themeId);
            const isMale = idx === 0;
            const selectorName =
              gameMode === 'dice'
                ? idx === 0
                  ? '上骰子'
                  : '下骰子'
                : `${player.name} (Player ${player.id + 1})`;
            const selectedThemeLabel =
              theme?.name ||
              (gameMode === 'dice'
                ? idx === 0
                  ? '未选择动作主题'
                  : '未选择部位主题'
                : '未选择主题');

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
            {MODE_START_LABELS[gameMode] ?? '开始游戏'}
          </span>
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
}
