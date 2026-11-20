import { useModeState, useMyTurn } from '../../rules/ModeRuntime';
import { useMemo } from 'react';
import { ArrowLeft, Flame, RefreshCw, Skull, Sparkles, User, UserRound } from 'lucide-react';
import { Player, Theme } from '../../types';
import { buildTaskPool, pickRandom } from '../../utils/modeKit';
import { SPICY_DARE_CHALLENGES, SPICY_PENALTIES, SPICY_TRUTH_QUESTIONS } from '../../data/spicyContent';

interface TruthDareModeViewProps {
  players: Player[];
  themes: Theme[];
  currentTurn: number;
  onEndTurn: () => void;
  onBack: () => void;
}

type Kind = 'truth' | 'dare' | 'task' | 'penalty';
type Event = 'normal' | 'forbidden' | 'public' | 'triple';

interface ActiveCard {
  kind: Kind;
  event: Event;
  content: string;
  themeName?: string;
}

const EVENT_LABELS: Record<Event, string> = {
  normal: '普通',
  forbidden: '禁区',
  public: '当众',
  triple: '三连'
};

function TruthDareGame({
  players,
  themes,
  currentTurn,
  onEndTurn
}: {
  players: Player[];
  themes: Theme[];
  currentTurn: number;
  onEndTurn: () => void;
}) {
  const canAct = useMyTurn(currentTurn);
  const activePlayer = players[currentTurn] || players[0];
  const pool = useMemo(() => buildTaskPool(players, themes) ?? [], [players, themes]);
  const [card, setCard] = useModeState<ActiveCard | null>('TruthDareModeView.card', null);
  const [penaltyTarget, setPenaltyTarget] = useModeState<number | null>('TruthDareModeView.penaltyTarget', null);
  // 惩罚文案只在失败时抽一次；放在渲染里 pickRandom 会每 1.5 秒换一句
  const [penalty, setPenalty] = useModeState<string | null>('TruthDareModeView.penalty', null);
  const [notice, setNotice] = useModeState<string | null>('TruthDareModeView.notice', null);
  const [done, setDone] = useModeState('TruthDareModeView.done', 0);

  const drawEvent = (): Event => {
    const roll = Math.random();
    if (roll < 0.15) return 'forbidden';
    if (roll < 0.3) return 'public';
    if (roll < 0.45) return 'triple';
    return 'normal';
  };

  const drawCard = () => {
    if (!canAct) return;
    const event = drawEvent();
    const kindRoll = Math.random();
    let kind: Kind;
    let content: string;
    let themeName: string | undefined;

    if (kindRoll < 0.35) {
      kind = 'truth';
      content = pickRandom(SPICY_TRUTH_QUESTIONS) ?? SPICY_TRUTH_QUESTIONS[0];
    } else if (kindRoll < 0.7) {
      kind = 'dare';
      content = pickRandom(SPICY_DARE_CHALLENGES) ?? SPICY_DARE_CHALLENGES[0];
    } else {
      kind = 'task';
      const entry = pickRandom(pool);
      if (!entry) {
        kind = 'truth';
        content = pickRandom(SPICY_TRUTH_QUESTIONS) ?? SPICY_TRUTH_QUESTIONS[0];
      } else {
        content = entry.task.text;
        themeName = entry.themeName;
      }
    }

    setCard({ kind, event, content, themeName });
  };

  const resolveCard = (accepted: boolean) => {
    if (!card || !canAct) return;
    if (accepted) {
      setDone(value => value + 1);
      setNotice('完成挑战，交给下一位');
      setCard(null);
      // 关键：完成也要交出回合，否则会一直停在同一个人
      onEndTurn();
      return;
    }
    // 失败 → 对方指定惩罚（文案此时抽一次并固定）
    setPenalty(pickRandom(SPICY_PENALTIES) ?? SPICY_PENALTIES[0]);
    setPenaltyTarget(activePlayer.id);
    setCard(null);
  };

  const resolvePenalty = () => {
    if (!canAct) return;
    setPenaltyTarget(null);
    setPenalty(null);
    setNotice('惩罚已记下，交给下一位');
    onEndTurn();
  };

  const opponent = players.find(p => p.id !== activePlayer?.id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold text-gray-400">
          已完成 {done} 次挑战
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold">
          <Flame size={12} className="text-[#FF375F]" />
          狂暴模式
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 rounded-2xl bg-white/5 py-3 text-sm font-bold text-white">
        {activePlayer?.id === 0 ? <User size={15} className="text-[#0A84FF]" /> : <UserRound size={15} className="text-[#FF375F]" />}
        {canAct
          ? `${activePlayer?.name || '当前玩家'} 的回合`
          : `等 ${activePlayer?.name || '对方'} 完成…（你这边暂不可操作）`}
      </div>

      {penaltyTarget !== null ? (
        <div className="rounded-3xl border border-[#FF453A]/30 bg-[#FF453A]/10 p-6 text-center">
          <Skull size={34} className="mx-auto text-[#FF453A]" />
          <div className="mt-3 text-lg font-bold text-white">挑战失败</div>
          <div className="mt-2 text-sm text-gray-400">
            {opponent?.name || '对方'} 指定一项惩罚，由 <span className="font-bold text-white">{activePlayer?.name}</span> 执行：
          </div>
          <div className="mt-4 rounded-2xl bg-black/30 p-4 text-base font-semibold leading-relaxed text-white">
            {penalty ?? '由对方指定一项惩罚'}
          </div>
          <button
            type="button"
            onClick={resolvePenalty}
            disabled={!canAct}
            className="ios-btn mt-5 h-12 w-full rounded-full bg-white text-base font-bold text-black disabled:opacity-50"
          >
            接受惩罚，交给下一位
          </button>
        </div>
      ) : card ? (
        <div className="space-y-4">
          <div
            className={`rounded-3xl border p-6 text-center ${
              card.event === 'normal'
                ? 'border-white/10 bg-white/[0.06]'
                : 'border-[#FF375F]/30 bg-[#FF375F]/10'
            }`}
          >
            <div className="flex items-center justify-center gap-2 text-xs font-bold text-[#FF7A96]">
              <Sparkles size={14} />
              {card.event === 'normal' ? '' : `【${EVENT_LABELS[card.event]}事件】`}
              {card.kind === 'truth' ? '真心话' : card.kind === 'dare' ? '大冒险' : card.kind === 'task' ? '主题任务' : '惩罚'}
            </div>
            <div className="mt-3 text-lg font-bold leading-relaxed text-white">{card.content}</div>
            {card.themeName && <div className="mt-2 text-[11px] text-gray-500">来自「{card.themeName}」</div>}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => resolveCard(false)}
              disabled={!canAct}
              className="ios-btn h-14 flex-1 rounded-full bg-[#3A3A3C] text-base font-bold text-[#FF453A] disabled:opacity-50"
            >
              认怂（受罚）
            </button>
            <button
              type="button"
              onClick={() => resolveCard(true)}
              disabled={!canAct}
              className="ios-btn h-14 flex-[2] rounded-full bg-white text-base font-bold text-black disabled:opacity-50"
            >
              完成挑战
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={drawCard}
          disabled={!canAct}
          className="ios-btn flex h-48 w-full flex-col items-center justify-center gap-3 rounded-3xl border border-[#FF375F]/30 bg-gradient-to-br from-[#FF375F]/20 to-transparent disabled:opacity-50"
        >
          <Flame size={38} className="text-[#FF375F]" />
          <span className="text-xl font-bold text-white">抽一张狂暴卡</span>
          <span className="text-xs text-gray-500">真心话 / 大冒险 / 主题任务 · 含禁区、当众、三连事件</span>
        </button>
      )}

      {notice && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-center text-sm font-bold text-white">
          {notice}
        </div>
      )}
    </div>
  );
}

export function TruthDareModeView({ players, themes, currentTurn, onEndTurn, onBack }: TruthDareModeViewProps) {
  const [runId, setRunId] = useModeState('TruthDareModeView.runId', 0);

  return (
    <div className="mobile-game-screen fixed inset-x-0 top-0 bottom-0 z-50 flex flex-col bg-black">
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#2b1016] via-black to-[#0d1724] opacity-90" />
      <div className="relative z-10 mx-auto flex h-full w-full max-w-[430px] flex-col">
        <header className="mobile-screen-header flex shrink-0 items-center gap-3 px-4 py-2">
          <button onClick={onBack} className="ios-btn flex h-10 w-10 items-center justify-center rounded-full border border-white/5 bg-white/10" aria-label="返回首页">
            <ArrowLeft className="text-white" size={20} />
          </button>
          <div className="flex-1 text-center">
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#FF375F]">Truth or Dare</div>
            <div className="mt-1 text-sm font-bold text-white">真心话大冒险 · 狂暴版</div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center text-gray-500">
            <Flame size={22} />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 no-scrollbar">
          <TruthDareGame key={runId} players={players} themes={themes} currentTurn={currentTurn} onEndTurn={onEndTurn} />
          <button type="button" onClick={() => setRunId(value => value + 1)} className="ios-btn mx-auto mt-6 flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-xs font-bold text-gray-400">
            <RefreshCw size={13} />重新开始
          </button>
        </main>
      </div>
    </div>
  );
}
