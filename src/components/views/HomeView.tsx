import { useEffect, useRef, useState } from 'react';
import { GameMode, Player, Theme } from '../../types';
import { Bomb, BookOpen, Brain, ChevronLeft, ChevronRight, Dice5, Dices, Disc3, Flag, Gift, Gavel, Grid3x3, HeartPulse, ImageIcon, Layers3, MessageCircleQuestion, Music, Shuffle, Timer, User, UserRound } from 'lucide-react';

interface HomeViewProps {
  players: Player[];
  themes: Theme[];
  gameMode: GameMode;
  onSelectMode: (mode: GameMode) => void;
  onSelectTheme: (playerId: number) => void;
  onStartGame: () => void;
}

const gameModes: Array<{
  id: GameMode;
  title: string;
  desc: string;
  icon: typeof Dice5;
}> = [
  {
    id: 'board',
    title: '飞行棋模式',
    desc: '投骰子走棋，落格触发任务',
    icon: Dice5
  },
  {
    id: 'card',
    title: '任务卡牌模式',
    desc: '轮流抽取任务，不用投骰子',
    icon: Layers3
  },
  {
    id: 'mine',
    title: '扫雷模式',
    desc: '点击方格，触发隐藏事件',
    icon: Bomb
  },
  {
    id: 'dice',
    title: '亲密骰子模式',
    desc: '上下骰子组合动作与部位',
    icon: Dices
  },
  {
    id: 'roulette',
    title: '情侣转盘',
    desc: '随机组合执行者、动作、部位与时长',
    icon: Disc3
  },
  {
    id: 'bingo',
    title: '情侣 Bingo',
    desc: '任务排成 Bingo 盘，完成连线拿奖励',
    icon: Grid3x3
  },
  {
    id: 'quiz',
    title: '默契问答',
    desc: '双方分别作答后同时揭晓，比谁更懂对方',
    icon: MessageCircleQuestion
  },
  {
    id: 'memory',
    title: '记忆翻牌',
    desc: '翻开配对任务卡，完成匹配的互动任务',
    icon: Brain
  },
  {
    id: 'blindbox',
    title: '盲盒抽奖',
    desc: '抽取奖励、任务、免罚、双倍等特殊卡片',
    icon: Gift
  },
  {
    id: 'timed',
    title: '限时挑战',
    desc: '倒计时内连续完成任务，按数量和难度计分',
    icon: Timer
  },
  {
    id: 'story',
    title: '故事接龙',
    desc: '双方轮流抽取情节卡，共同推进情侣故事',
    icon: BookOpen
  },
  {
    id: 'rhythm',
    title: '节奏挑战',
    desc: '跟随节拍完成互动，失误后执行惩罚',
    icon: Music
  },
  {
    id: 'events',
    title: '随机事件',
    desc: '抽卡过程中触发交换身份、任务升级等事件',
    icon: Shuffle
  },
  {
    id: 'survival',
    title: '合作生存',
    desc: '共享生命值，连续完成任务抵御事件',
    icon: HeartPulse
  },
  {
    id: 'territory',
    title: '领地争夺',
    desc: '占领棋盘区域，完成任务获得攻城机会',
    icon: Flag
  },
  {
    id: 'auction',
    title: '拍卖竞价',
    desc: '双方竞价争夺任务，出价越高奖励越丰厚',
    icon: Gavel
  },
  {
    id: 'gridchess',
    title: '点格棋',
    desc: '连接相邻点闭合格子，闭合者得格并再走一步',
    icon: Grid3x3
  },
  {
    id: 'pose',
    title: '姿势模式',
    desc: '轮流抽取姿势图片',
    icon: ImageIcon
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
  gridchess: '开始点格棋'
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
  mine: '选择游戏模式和双方扫雷主题题库',
  quiz: '无需题库，直接开始默契问答',
  story: '无需题库，直接开始故事接龙',
  rhythm: '无需题库，直接开始节奏挑战'
};

/** 自备内容、不需要选择主题的玩法。 */
const THEME_FREE_MODES = new Set<GameMode>(['pose', 'quiz', 'story', 'rhythm']);

const MODE_SCROLL_HINT_THRESHOLD = 24;

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
  const modeScrollerRef = useRef<HTMLDivElement>(null);
  const dragStartXRef = useRef(0);
  const dragStartScrollLeftRef = useRef(0);
  const hasDraggedModeRef = useRef(false);
  const [isDraggingMode, setIsDraggingMode] = useState(false);
  const [modeScrollHint, setModeScrollHint] = useState({ left: false, right: false });

  const scrollModeCardIntoView = (modeId: GameMode) => {
    const scroller = modeScrollerRef.current;
    const card = scroller?.querySelector<HTMLElement>(`[data-mode-id="${modeId}"]`);

    card?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest'
    });
  };

  const handleModeArrowClick = (direction: -1 | 1) => {
    const currentModeIndex = gameModes.findIndex(mode => mode.id === gameMode);
    const nextMode = gameModes[currentModeIndex + direction];

    if (nextMode) {
      onSelectMode(nextMode.id);
      scrollModeCardIntoView(nextMode.id);
      return;
    }

    const scroller = modeScrollerRef.current;
    scroller?.scrollBy({
      left: direction * Math.max(scroller.clientWidth * 0.75, 120),
      behavior: 'smooth'
    });
  };

  const handleModeMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const scroller = modeScrollerRef.current;
    if (!scroller) return;

    dragStartXRef.current = event.clientX;
    dragStartScrollLeftRef.current = scroller.scrollLeft;
    hasDraggedModeRef.current = false;
    setIsDraggingMode(true);
  };

  const handleModeMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingMode) return;
    const scroller = modeScrollerRef.current;
    if (!scroller) return;

    const deltaX = event.clientX - dragStartXRef.current;
    if (Math.abs(deltaX) > 4) {
      hasDraggedModeRef.current = true;
      event.preventDefault();
    }
    scroller.scrollLeft = dragStartScrollLeftRef.current - deltaX;
  };

  const handleModeMouseUp = () => {
    if (!isDraggingMode) return;
    setIsDraggingMode(false);
  };

  useEffect(() => {
    const scroller = modeScrollerRef.current;
    if (!scroller) return;

    const handleWheel = (event: WheelEvent) => {
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (delta === 0) return;

      event.preventDefault();
      event.stopPropagation();
      scroller.scrollLeft += delta;
    };

    scroller.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      scroller.removeEventListener('wheel', handleWheel);
    };
  }, []);

  useEffect(() => {
    const scroller = modeScrollerRef.current;
    if (!scroller) return;

    const updateModeScrollHint = () => {
      setModeScrollHint({
        left: scroller.scrollLeft > MODE_SCROLL_HINT_THRESHOLD,
        right: scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 2
      });
    };

    updateModeScrollHint();
    scroller.addEventListener('scroll', updateModeScrollHint);
    window.addEventListener('resize', updateModeScrollHint);

    return () => {
      scroller.removeEventListener('scroll', updateModeScrollHint);
      window.removeEventListener('resize', updateModeScrollHint);
    };
  }, []);

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar space-y-6 pt-2 pb-4">
        <div className="text-center mb-4">
          <h2 className="text-xl text-gray-300 font-medium">配置游戏角色</h2>
          <p className="text-sm text-gray-500 mt-2">
            {shouldShowThemeSelectors ? themeHint : '选择游戏模式即可开始'}
          </p>
        </div>

        <div className="relative">
          <div
            ref={modeScrollerRef}
            className={`-mx-1 overflow-x-auto no-scrollbar px-1 pb-1 snap-x snap-mandatory select-none ${
              isDraggingMode ? 'cursor-grabbing' : 'cursor-grab'
            }`}
            onMouseDown={handleModeMouseDown}
            onMouseMove={handleModeMouseMove}
            onMouseUp={handleModeMouseUp}
            onMouseLeave={handleModeMouseUp}
          >
            <div className="flex gap-3">
              {gameModes.map(mode => {
                const Icon = mode.icon;
                const isActive = mode.id === gameMode;

                return (
                  <button
                    key={mode.id}
                    data-mode-id={mode.id}
                    type="button"
                    className={`min-h-[108px] basis-[calc((100%_-_0.75rem)/2)] min-w-[168px] shrink-0 snap-start rounded-[20px] border p-4 text-left transition-all ios-btn ${
                      isActive
                        ? 'bg-white text-black border-white shadow-lg'
                        : 'bg-[#1C1C1E] text-white border-white/5'
                    }`}
                    onClick={() => {
                      if (hasDraggedModeRef.current) {
                        hasDraggedModeRef.current = false;
                        return;
                      }
                      onSelectMode(mode.id);
                    }}
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center mb-3 ${
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
          <button
            type="button"
            aria-label="选择上一个模式"
            tabIndex={modeScrollHint.left ? 0 : -1}
            className={`absolute left-[-2px] top-0 bottom-1 w-16 flex items-center justify-start pl-1 bg-gradient-to-r from-black via-black/80 to-transparent transition-opacity duration-300 ${
              modeScrollHint.left ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
            }`}
            onPointerDown={event => event.stopPropagation()}
            onClick={() => handleModeArrowClick(-1)}
          >
            <span className="w-8 h-8 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-white/80 shadow-lg ios-btn">
              <ChevronLeft size={18} />
            </span>
          </button>
          <button
            type="button"
            aria-label="选择下一个模式"
            tabIndex={modeScrollHint.right ? 0 : -1}
            className={`absolute right-[-2px] top-0 bottom-1 w-16 flex items-center justify-end pr-1 bg-gradient-to-l from-black via-black/80 to-transparent transition-opacity duration-300 ${
              modeScrollHint.right ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
            }`}
            onPointerDown={event => event.stopPropagation()}
            onClick={() => handleModeArrowClick(1)}
          >
            <span className="w-8 h-8 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-white/80 shadow-lg ios-btn">
              <ChevronRight size={18} />
            </span>
          </button>
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
