import { useModeState } from '../../rules/ModeRuntime';

import { ArrowLeft, BookOpen, RefreshCw, Sparkles, User, UserRound } from 'lucide-react';
import { Player, Theme } from '../../types';
import { STORY_FRAGMENTS, STORY_KIND_LABELS, STORY_SEQUENCE, StoryFragment, StoryFragmentKind } from '../../data/storyFragments';
import { shuffle } from '../../utils/modeKit';

interface StoryModeViewProps {
  players: Player[];
  themes?: Theme[];
  onBack: () => void;
}

const STORY_ACTING_BONUS = '把刚才的故事即兴演给对方看，可以加戏，但不许笑场';

function StoryGame({ players, onExit }: { players: Player[]; onExit: () => void }) {
  const [decks] = useModeState<Record<StoryFragmentKind, StoryFragment[]>>('StoryModeView.decks', () => {
    const byKind: Record<StoryFragmentKind, StoryFragment[]> = {
      opening: [],
      development: [],
      twist: [],
      climax: [],
      ending: []
    };
    for (const fragment of STORY_FRAGMENTS) byKind[fragment.kind].push(fragment);
    return {
      opening: shuffle(byKind.opening),
      development: shuffle(byKind.development),
      twist: shuffle(byKind.twist),
      climax: shuffle(byKind.climax),
      ending: shuffle(byKind.ending)
    };
  });
  const [step, setStep] = useModeState('StoryModeView.step', 0);
  const [story, setStory] = useModeState<Array<{ playerId: number; fragment: StoryFragment }>>('StoryModeView.story', []);
  const [finished, setFinished] = useModeState('StoryModeView.finished', false);

  const drawer = players[step % players.length];
  const kind = STORY_SEQUENCE[step];

  const draw = () => {
    if (step >= STORY_SEQUENCE.length) return;
    const fragment = decks[kind][0];
    const nextStory = [...story, { playerId: drawer?.id ?? 0, fragment }];
    setStory(nextStory);
    if (step + 1 >= STORY_SEQUENCE.length) {
      setFinished(true);
      return;
    }
    setStep(step + 1);
  };

  if (finished) {
    return (
      <div className="space-y-4">
        <div className="rounded-3xl border border-[#FF9F0A]/25 bg-[#FF9F0A]/10 p-5">
          <div className="flex items-center gap-2 text-xs font-bold text-[#FF9F0A]">
            <BookOpen size={15} />你们共同写下的故事
          </div>
          <div className="mt-3 space-y-2">
            {story.map((part, index) => {
              const player = players.find(p => p.id === part.playerId);
              return (
                <div key={index} className="text-sm leading-relaxed text-white">
                  <span className="mr-1.5 text-[11px] font-bold" style={{ color: player?.color }}>
                    {player?.name || '某人'}：
                  </span>
                  {part.fragment.text}。
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-3xl border border-[#BF5AF2]/25 bg-[#BF5AF2]/10 p-5">
          <div className="flex items-center gap-2 text-xs font-bold text-[#D08BFF]">
            <Sparkles size={15} />即兴加演
          </div>
          <div className="mt-2 text-sm leading-relaxed text-white">{STORY_ACTING_BONUS}</div>
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
          第 {step + 1} / {STORY_SEQUENCE.length} 张情节卡
        </div>
        <div className="rounded-full bg-[#FF9F0A]/15 px-3 py-1 text-[10px] font-bold text-[#FF9F0A]">
          下一张：{STORY_KIND_LABELS[kind]}
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 rounded-2xl bg-white/5 py-3 text-sm font-bold text-white">
        {drawer?.id === 0 ? <User size={15} className="text-[#0A84FF]" /> : <UserRound size={15} className="text-[#FF375F]" />}
        请 {drawer?.name || '当前玩家'} 抽下一张情节卡
      </div>

      <button
        type="button"
        onClick={draw}
        className="ios-btn flex h-40 w-full flex-col items-center justify-center gap-3 rounded-3xl border border-[#FF9F0A]/30 bg-gradient-to-br from-[#FF9F0A]/20 to-transparent"
      >
        <BookOpen size={34} className="text-[#FF9F0A]" />
        <span className="text-lg font-bold text-white">抽一张「{STORY_KIND_LABELS[kind]}」卡</span>
        <span className="text-xs text-gray-500">点击抽卡，推进故事</span>
      </button>

      {story.length > 0 && (
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">故事进展</div>
          <div className="space-y-1.5">
            {story.map((part, index) => {
              const player = players.find(p => p.id === part.playerId);
              return (
                <div key={index} className="text-[13px] leading-relaxed text-gray-300">
                  <span className="mr-1 text-[10px] font-bold" style={{ color: player?.color }}>
                    {player?.name || '某人'}
                  </span>
                  {part.fragment.text}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function StoryModeView({ players, onBack }: StoryModeViewProps) {
  const [runId, setRunId] = useModeState('StoryModeView.runId', 0);

  return (
    <div className="mobile-game-screen fixed inset-x-0 top-0 bottom-0 z-50 flex flex-col bg-black">
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#1c1f2e] via-black to-[#0d1724] opacity-90" />

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
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#FF9F0A]">Story Chain</div>
            <div className="mt-1 text-sm font-bold text-white">故事接龙 · 8 张情节卡</div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center text-gray-500">
            <BookOpen size={22} />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 no-scrollbar">
          <StoryGame key={runId} players={players} onExit={onBack} />

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
