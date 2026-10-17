import { useState } from 'react';
import { ArrowLeft, RefreshCw, Theater, User, UserRound } from 'lucide-react';
import { Player, Theme } from '../../types';
import { pickRandom } from '../../utils/modeKit';
import { ROLEPLAY_SCRIPTS } from '../../data/spicyContent';

interface RoleplayModeViewProps {
  players: Player[];
  themes?: Theme[];
  onBack: () => void;
}

function RoleplayGame({ players, onExit }: { players: Player[]; onExit: () => void }) {
  const [script, setScript] = useState<typeof ROLEPLAY_SCRIPTS[number] | null>(null);
  const [revealed, setRevealed] = useState(false);

  const draw = () => {
    setScript(pickRandom(ROLEPLAY_SCRIPTS) ?? ROLEPLAY_SCRIPTS[0]);
    setRevealed(false);
  };

  const reveal = () => setRevealed(true);

  const [first, second] = players;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-3 rounded-2xl bg-white/5 py-3 text-sm font-bold text-white">
        <User size={15} className="text-[#0A84FF]" />{first?.name || '男方'} × {second?.name || '女方'}<UserRound size={15} className="text-[#FF375F]" />
      </div>

      {!script ? (
        <button
          type="button"
          onClick={draw}
          className="ios-btn flex h-48 w-full flex-col items-center justify-center gap-3 rounded-3xl border border-[#BF5AF2]/30 bg-gradient-to-br from-[#BF5AF2]/20 to-transparent"
        >
          <Theater size={38} className="text-[#D08BFF]" />
          <span className="text-xl font-bold text-white">抽取角色剧本</span>
          <span className="text-xs text-gray-500">人设 + 场景 + 剧情走向 + 强制台词</span>
        </button>
      ) : (
        <div className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white/[0.04] p-4 text-center">
                <div className="text-xs font-bold text-[#64B5FF]">{first?.name || '男方'}</div>
                <div className="mt-1 text-base font-bold text-white">{script.personA}</div>
              </div>
              <div className="rounded-2xl bg-white/[0.04] p-4 text-center">
                <div className="text-xs font-bold text-[#FF7A96]">{second?.name || '女方'}</div>
                <div className="mt-1 text-base font-bold text-white">{script.personB}</div>
              </div>
            </div>
            <div className="mt-4 rounded-2xl bg-white/[0.04] p-4">
              <div className="text-xs font-bold text-gray-500">场景</div>
              <div className="mt-1 text-sm text-white">{script.scene}</div>
            </div>
            <div className="mt-3 rounded-2xl bg-white/[0.04] p-4">
              <div className="text-xs font-bold text-gray-500">剧情走向</div>
              <div className="mt-1 text-sm text-white">{script.plot}</div>
            </div>
          </div>

          {revealed && (
            <div className="rounded-3xl border border-[#FF375F]/30 bg-[#FF375F]/10 p-5 text-center">
              <div className="text-xs font-bold text-[#FF7A96]">强制台词</div>
              <div className="mt-2 text-lg font-bold leading-relaxed text-white">「{script.forcedLine}」</div>
            </div>
          )}

          <div className="flex gap-3">
            {!revealed ? (
              <button type="button" onClick={reveal} className="ios-btn h-14 w-full rounded-full bg-white text-base font-bold text-black shadow-lg">
                揭晓强制台词
              </button>
            ) : (
              <>
                <button type="button" onClick={draw} className="ios-btn h-14 flex-1 rounded-full bg-white/10 text-base font-bold text-white">
                  换一个剧本
                </button>
                <button type="button" onClick={onExit} className="ios-btn h-14 flex-1 rounded-full bg-white text-base font-bold text-black">
                  演完收工
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function RoleplayModeView({ players, onBack }: RoleplayModeViewProps) {
  const [runId, setRunId] = useState(0);

  return (
    <div className="mobile-game-screen fixed inset-x-0 top-0 bottom-0 z-50 flex flex-col bg-black">
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#1c1230] via-black to-[#0d1724] opacity-90" />
      <div className="relative z-10 mx-auto flex h-full w-full max-w-[430px] flex-col">
        <header className="mobile-screen-header flex shrink-0 items-center gap-3 px-4 py-2">
          <button onClick={onBack} className="ios-btn flex h-10 w-10 items-center justify-center rounded-full border border-white/5 bg-white/10" aria-label="返回首页">
            <ArrowLeft className="text-white" size={20} />
          </button>
          <div className="flex-1 text-center">
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#BF5AF2]">Roleplay</div>
            <div className="mt-1 text-sm font-bold text-white">角色扮演剧本</div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center text-gray-500">
            <Theater size={22} />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 no-scrollbar">
          <RoleplayGame key={runId} players={players} onExit={onBack} />
          <button type="button" onClick={() => setRunId(value => value + 1)} className="ios-btn mx-auto mt-6 flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-xs font-bold text-gray-400">
            <RefreshCw size={13} />重新开始
          </button>
        </main>
      </div>
    </div>
  );
}
