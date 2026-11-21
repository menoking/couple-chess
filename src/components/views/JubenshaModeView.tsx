import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Eye,
  Lock,
  RefreshCw,
  ScrollText,
  Search,
  Share2,
  Sparkles,
  User,
  UserRound,
  Users
} from 'lucide-react';
import { useModeAuthority, useModeRuntime, useModeState } from '../../rules/ModeRuntime';
import { Player } from '../../types';
import type { JubenshaClue, JubenshaDecision, JubenshaScript } from '../../types/jubensha';
import { JUBENSHA_SCRIPTS, getJubenshaScript, getJubenshaScriptIds } from '../../data/jubensha';
import {
  JUBENSHA_DIFFICULTY_LABEL,
  JUBENSHA_PHASE_LABEL,
  JUBENSHA_PHASE_ORDER,
  JubenshaGame,
  JubenshaSeal,
  advanceAfterDecision,
  advanceClues,
  advanceReading,
  advanceRoleSelect,
  backToScriptSelect,
  bucketClues,
  clearJubenshaGame,
  clueRoleIndex,
  createEmptyGame,
  currentAct,
  currentDecision,
  decisionRound,
  endingById,
  listJubenshaSaves,
  loadJubenshaGame,
  otherSeat,
  recordDecision,
  resolveEnding,
  roleIndexOfSeat,
  saveJubenshaGame,
  setSeatValue,
  startScript,
} from '../../rules/jubensha';
import type { Seat } from '../../rules/types';

interface JubenshaModeViewProps {
  players: Player[];
  onBack: () => void;
}

/** 兼容同屏：联机走 @s0/@s1 私有槽，同屏用组件内的双人槽位 */
function useSeatValue<T>(key: string, initial: T, seat: Seat) {
  const runtime = useModeRuntime();
  const online = runtime !== null;
  const [shared, setShared] = useModeState<T>(key, initial, 'seat');
  const [pair, setPair] = useState<[T, T]>(() => [initial, initial]);
  const value = online ? shared : pair[seat];
  const setValue = (next: T | ((previous: T) => T)) => {
    if (online) {
      setShared(next);
      return;
    }
    setPair(previous => {
      const current = previous[seat];
      const resolved = typeof next === 'function' ? (next as (input: T) => T)(current) : next;
      return setSeatValue(previous, seat, resolved);
    });
  };
  return [value, setValue] as const;
}

const PLAYER_NAMES = ['男方', '女方'];

function seatAccent(seat: Seat): string {
  return seat === 0 ? '#0A84FF' : '#FF375F';
}

function roleNameOf(script: JubenshaScript | null, game: JubenshaGame, seat: Seat): string {
  if (!script) return PLAYER_NAMES[seat];
  const roleId = game.roles[seat];
  return script.roles.find(role => role.id === roleId)?.name ?? PLAYER_NAMES[seat];
}

function phaseIndex(phase: JubenshaGame['phase']): number {
  const index = JUBENSHA_PHASE_ORDER.indexOf(phase);
  return index < 0 ? 0 : index;
}

function PhaseBar({ game }: { game: JubenshaGame }) {
  const active = phaseIndex(game.phase);
  return (
    <div className="flex items-center gap-1.5">
      {JUBENSHA_PHASE_ORDER.map((phase, index) => (
        <div key={phase} className="flex items-center gap-1.5">
          <span
            className={`h-1.5 w-6 rounded-full transition-colors ${
              index < active ? 'bg-[#30D158]' : index === active ? 'bg-[#FFD60A]' : 'bg-white/15'
            }`}
          />
          {index === active && (
            <span className="text-[10px] font-bold text-[#FFD60A]">{JUBENSHA_PHASE_LABEL[phase]}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function SeatBadge({ seat, name, role }: { seat: Seat; name: string; role: string }) {
  const Icon = seat === 0 ? User : UserRound;
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
      <Icon size={12} style={{ color: seatAccent(seat) }} />
      <span className="text-[10px] font-bold text-white">{name}</span>
      {role !== name && <span className="text-[10px] text-gray-500">· {role}</span>}
    </div>
  );
}

function ScriptCard({
  script,
  savedPhase,
  canResume,
  onStart,
  onResume
}: {
  script: JubenshaScript;
  savedPhase: string | null;
  canResume: boolean;
  onStart: () => void;
  onResume: () => void;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-lg font-bold text-white">{script.title}</div>
          <div className="mt-1 text-xs leading-relaxed text-gray-400">{script.subtitle}</div>
        </div>
        <ScrollText size={20} className="shrink-0 text-[#D08BFF]" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {script.tags.map(tag => (
          <span key={tag} className="rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-bold text-gray-300">
            {tag}
          </span>
        ))}
        <span className="inline-flex items-center gap-1 rounded-full bg-[#FFD60A]/10 px-2.5 py-0.5 text-[10px] font-bold text-[#FFD60A]">
          <Clock size={11} />约 {script.durationMinutes} 分钟
        </span>
        <span className="rounded-full bg-[#30D158]/10 px-2.5 py-0.5 text-[10px] font-bold text-[#30D158]">
          {JUBENSHA_DIFFICULTY_LABEL[script.difficulty]}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-bold text-gray-300">
          <Users size={11} />2 人
        </span>
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-gray-300">{script.synopsis}</p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {script.roles.map((role, index) => (
          <div key={role.id} className="rounded-2xl bg-black/25 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: seatAccent(index as Seat) }}>
              {role.name}
            </div>
            <div className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-gray-500">{role.tagline}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        {savedPhase && (
          <button
            type="button"
            onClick={onResume}
            disabled={!canResume}
            className="ios-btn h-12 flex-1 rounded-full border border-[#30D158]/30 bg-[#30D158]/10 text-sm font-bold text-[#30D158] disabled:opacity-40"
          >
            继续上次进度
          </button>
        )}
        <button
          type="button"
          onClick={onStart}
          className="ios-btn h-12 flex-[1.4] rounded-full bg-white text-sm font-bold text-black shadow-lg"
        >
          {savedPhase ? '重新开始' : '开始这个剧本'}
        </button>
      </div>
    </div>
  );
}

function ClueCard({
  clue,
  shared,
  seen,
  open,
  canShare,
  onToggle,
  onShare
}: {
  clue: JubenshaClue;
  shared: boolean;
  seen: boolean;
  open: boolean;
  canShare: boolean;
  onToggle: () => void;
  onShare: () => void;
}) {
  const badge = clue.owner === 'public' ? '公共线索' : shared ? '已分享' : '我的私密';
  const badgeColor =
    clue.owner === 'public'
      ? 'bg-[#64B5FF]/15 text-[#64B5FF]'
      : shared
        ? 'bg-[#30D158]/15 text-[#30D158]'
        : 'bg-[#FF7A96]/15 text-[#FF7A96]';
  return (
    <div className={`rounded-2xl border p-4 ${shared ? 'border-[#30D158]/25 bg-[#30D158]/[0.06]' : 'border-white/10 bg-white/[0.04]'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${badgeColor}`}>{badge}</span>
            <span className="inline-flex items-center gap-1 text-[10px] text-gray-500">
              <Search size={10} />{clue.location}
            </span>
            {seen && <span className="text-[9px] font-bold text-gray-600">已读</span>}
          </div>
          <div className="mt-1.5 text-sm font-bold text-white">{clue.title}</div>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="ios-btn flex h-8 shrink-0 items-center gap-1 rounded-full border border-white/10 px-2.5 text-[10px] font-bold text-gray-300"
        >
          <Eye size={12} />{open ? '收起' : '查看'}
        </button>
      </div>
      {open && <div className="mt-2 text-[13px] leading-relaxed text-gray-300">{clue.content}</div>}
      {canShare && !shared && clue.shareable && (
        <button
          type="button"
          onClick={onShare}
          className="ios-btn mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-full border border-[#FF7A96]/30 bg-[#FF7A96]/10 text-[11px] font-bold text-[#FF7A96]"
        >
          <Share2 size={13} />分享给 TA
        </button>
      )}
    </div>
  );
}

function HandoffButton({ targetName, roleName, onSwitch }: { targetName: string; roleName: string; onSwitch: () => void }) {
  return (
    <button
      type="button"
      onClick={onSwitch}
      className="ios-btn flex w-full items-center justify-between rounded-2xl border border-[#0A84FF]/25 bg-[#0A84FF]/10 px-4 py-3 text-left"
    >
      <div>
        <div className="text-[11px] font-bold text-[#64B5FF]">轮到 {targetName} 操作</div>
        <div className="mt-0.5 text-[10px] text-gray-500">请把手机交给 {roleName}，切换视角后继续</div>
      </div>
      <ChevronRight size={18} className="text-[#64B5FF]" />
    </button>
  );
}

function JubenshaScreen({
  players,
  online,
  mySeat,
  authority,
  onRestart,
  onBack
}: {
  players: Player[];
  online: boolean;
  mySeat: Seat;
  authority: boolean;
  onRestart: () => void;
  onBack: () => void;
}) {
  const [game, setGame] = useModeState<JubenshaGame>('JubenshaModeView.game', createEmptyGame);
  const runtime = useModeRuntime();
  const [localSeat, setLocalSeat] = useState<Seat>(0);
  const [pendingSeat, setPendingSeat] = useState<Seat | null>(null);
  const [openClues, setOpenClues] = useState<string[]>([]);
  const [localSeals, setLocalSeals] = useState<[JubenshaSeal | null, JubenshaSeal | null]>([null, null]);

  const viewSeat: Seat = online ? mySeat : localSeat;
  const peerSeat = otherSeat(viewSeat);

  const [seenClues, setSeenClues] = useSeatValue<string[]>('JubenshaModeView.seenClues', [], viewSeat);
  const [notes, setNotes] = useSeatValue<string>('JubenshaModeView.notes', '', viewSeat);
  const [notesDraft, setNotesDraft] = useState(notes);
  // Ready 与选角各存一份独立键：两端同时点准备/选角时不会互相覆盖数组
  const [ready0, setReady0] = useModeState('JubenshaModeView.ready.0', false);
  const [ready1, setReady1] = useModeState('JubenshaModeView.ready.1', false);
  const [rolePick0, setRolePick0] = useModeState<string | null>('JubenshaModeView.rolePick.0', null);
  const [rolePick1, setRolePick1] = useModeState<string | null>('JubenshaModeView.rolePick.1', null);
  const mainRef = useRef<HTMLElement | null>(null);

  const ready: [boolean, boolean] = [ready0, ready1];
  const rolePicks: [string | null, string | null] = [rolePick0, rolePick1];
  const setMyReady = (value: boolean) => {
    if (viewSeat === 0) setReady0(value);
    else setReady1(value);
  };
  const setMyRolePick = (roleId: string | null) => {
    if (viewSeat === 0) setRolePick0(roleId);
    else setRolePick1(roleId);
  };

  const [sharedSeal, setSharedSeal] = useModeState<JubenshaSeal | null>(
    'JubenshaModeView.decision.sealed',
    null,
    'seat'
  );
  const [revealedSeal, setRevealedSeal] = useModeState<{ round: number; values: [string | null, string | null] } | null>(
    'JubenshaModeView.decision.revealed',
    null
  );

  const script = getJubenshaScript(game.scriptId);
  const assignedRole0 = game.roles[0];
  const assignedRole1 = game.roles[1];
  const act = script ? currentAct(game, script) : null;
  const decision = script ? currentDecision(game, script) : null;
  const round = decisionRound(game);
  const roleIndex = script ? roleIndexOfSeat(game, script, viewSeat) : null;
  const myRole = script && roleIndex !== null ? script.roles[roleIndex] : null;
  const myPlayer = players[viewSeat] ?? players[0];
  const peerPlayer = players[peerSeat] ?? players[1];

  const saves = useMemo(
    () => (game.phase === 'script_select' ? listJubenshaSaves(getJubenshaScriptIds()) : []),
    // 回到选本页时重新扫一次存档
    [game.phase]
  );

  const advancingRef = useRef('');

  // 每次换座位 / 换幕都折叠线索，避免上一个视角的展开状态被带过去
  useEffect(() => {
    setOpenClues([]);
  }, [game.actIndex, viewSeat]);

  // 阶段 / 幕次 / 视角变化后回到页首，不然点完底部的准备按钮会停在半截
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [game.phase, game.actIndex, viewSeat]);

  // 私人笔记跟着座位走；切换视角时把草稿同步成新座位的笔记
  useEffect(() => {
    setNotesDraft(notes);
  }, [notes, viewSeat]);

  // 断点恢复：只有房主/同屏端写本地存档，避免两端互相覆盖。
  // 不用延迟队列——玩家分享完线索随手刷新，500ms 后才写会丢掉最后一步。
  useEffect(() => {
    if (!authority) return;
    if (!game.scriptId || game.phase === 'script_select') return;
    saveJubenshaGame(game);
  }, [authority, game]);

  // 双人 Ready 同步锁：双方都准备好后由权威端推进阶段
  useEffect(() => {
    if (!authority) return;
    if (!ready0 || !ready1) {
      advancingRef.current = '';
      return;
    }
    const signature = `${game.phase}:${game.actIndex}:${game.scriptId ?? ''}`;
    if (advancingRef.current === signature) return;
    advancingRef.current = signature;
    const mergedPicks: [string | null, string | null] = [rolePick0, rolePick1];
    setGame(previous => {
      const merged = { ...previous, ready: [true, true] as [boolean, boolean], rolePicks: mergedPicks };
      if (previous.phase === 'role_select' && script) return advanceRoleSelect(merged, script);
      if (previous.phase === 'act_reading') return advanceReading(merged);
      if (previous.phase === 'act_clues' && script) return advanceClues(merged, script);
      return previous;
    });
    // 推进后把两个 Ready 键一起复位，下一阶段重新开始
    setReady0(false);
    setReady1(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authority, ready0, ready1, rolePick0, rolePick1, game.phase, game.actIndex, game.scriptId, script]);

  // 旧存档 / 异常数据没有角色映射时补一份默认分配，避免卡在空白的读本页
  useEffect(() => {
    if (!authority || !script) return;
    if (game.phase === 'script_select' || game.phase === 'role_select') return;
    if (assignedRole0 && assignedRole1) return;
    setGame(previous => ({
      ...previous,
      roles: [script.roles[0].id, script.roles[1].id],
      updatedAt: Date.now()
    }));
  }, [authority, script, game.phase, assignedRole0, assignedRole1, setGame]);

  const mySeal = online ? sharedSeal : localSeals[viewSeat];
  const iSubmitted = mySeal?.round === round && mySeal !== null;
  const peerSubmitted = online
    ? !!revealedSeal && revealedSeal.round === round
    : localSeals[peerSeat]?.round === round;
  const localRevealed =
    !online && localSeals[0]?.round === round && localSeals[1]?.round === round
      ? {
          round,
          values: [localSeals[0]?.value ?? null, localSeals[1]?.value ?? null] as [string | null, string | null]
        }
      : null;
  const revealedNow = online
    ? revealedSeal && revealedSeal.round === round
      ? revealedSeal
      : null
    : localRevealed;
  const revealedA = revealedNow?.values[0] ?? null;
  const revealedB = revealedNow?.values[1] ?? null;
  const decisionRecorded = decision ? !!game.decisions[decision.id] : false;

  // 双方都暗投后，把结果落到公共 state，供结局匹配和断点恢复使用
  useEffect(() => {
    if (!authority || !decision) return;
    if (revealedA === null && revealedB === null) return;
    setGame(previous => {
      if (previous.phase !== 'act_decision') return previous;
      return recordDecision(previous, decision.id, [revealedA, revealedB]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authority, decision?.id, revealedA, revealedB]);

  const ending = script ? endingById(script, game.endingId) ?? resolveEnding(script, game.decisions) : null;

  const commitNotes = () => {
    if (notesDraft !== notes) setNotes(notesDraft);
  };

  /** 换剧本 / 重开时把上一局的暗投记录一起清掉，避免新一轮复用旧轮次 */
  const resetRoundState = () => {
    setLocalSeals([null, null]);
    setSharedSeal(null);
    setRevealedSeal(null);
    setReady0(false);
    setReady1(false);
    setRolePick0(null);
    setRolePick1(null);
  };

  const openSeat = (seat: Seat) => {
    if (seat === viewSeat) return;
    commitNotes();
    setPendingSeat(seat);
  };

  const unlockSeat = () => {
    if (pendingSeat === null) return;
    setLocalSeat(pendingSeat);
    setPendingSeat(null);
  };

  const handleBack = () => {
    commitNotes();
    if (authority && game.scriptId && game.phase !== 'script_select') saveJubenshaGame(game);
    onBack();
  };

  const startNewScript = (nextScript: JubenshaScript) => {
    // 从「开始」进入 = 新开一局，清掉这个剧本的旧存档
    if (authority) clearJubenshaGame(nextScript.id);
    resetRoundState();
    setOpenClues([]);
    // 新开一局：清掉当前视角的上一局笔记与已读记录
    setSeenClues([]);
    setNotes('');
    setNotesDraft('');
    setGame(previous => startScript(previous, nextScript));
    setLocalSeat(0);
  };

  const resumeScript = (nextScript: JubenshaScript) => {
    if (online && !authority) return;
    const saved = loadJubenshaGame(nextScript.id);
    if (!saved) return;
    resetRoundState();
    setOpenClues([]);
    setGame(saved);
    setLocalSeat(0);
  };

  const restart = () => {
    if (authority && script) clearJubenshaGame(script.id);
    resetRoundState();
    setLocalSeat(0);
    setPendingSeat(null);
    setGame(createEmptyGame());
    onRestart();
  };

  const backToScripts = () => {
    if (authority && script) {
      // 已经走到结局的存档没有继续价值，回选本时直接清掉
      if (game.phase === 'ending_reveal') clearJubenshaGame(script.id);
      else saveJubenshaGame(game);
    }
    commitNotes();
    resetRoundState();
    setGame(previous => backToScriptSelect(previous));
  };

  const toggleReady = () => {
    setMyReady(!ready[viewSeat]);
  };

  const pickRole = (roleId: string) => {
    setMyRolePick(roleId);
  };

  const toggleClue = (clueId: string) => {
    setOpenClues(previous =>
      previous.includes(clueId) ? previous.filter(id => id !== clueId) : [...previous, clueId]
    );
    // 用函数式更新：连续展开多条线索时不会互相覆盖已读记录
    setSeenClues(previous => (previous.includes(clueId) ? previous : [...previous, clueId]));
  };

  const shareClue = (clue: JubenshaClue) => {
    // 只能分享自己角色的私密线索
    if (clue.owner === 'public') return;
    if (clueRoleIndex(clue) !== roleIndex) return;
    setGame(previous =>
      previous.sharedClueIds.includes(clue.id)
        ? previous
        : { ...previous, sharedClueIds: [...previous.sharedClueIds, clue.id], updatedAt: Date.now() }
    );
  };

  const submitDecision = (value: string) => {
    if (!decision || iSubmitted || revealedNow) return;
    if (online) {
      if (!runtime) return;
      runtime.dispatch({
        type: 'sealSubmit',
        scope: 'JubenshaModeView.decision',
        seat: mySeat,
        round,
        value
      });
      return;
    }
    setLocalSeals(previous => {
      const next: [JubenshaSeal | null, JubenshaSeal | null] = [previous[0], previous[1]];
      next[viewSeat] = { round, value };
      return next;
    });
  };

  const continueAfterDecision = () => {
    if (!script || !decisionRecorded) return;
    setGame(previous =>
      previous.phase === 'act_decision' ? advanceAfterDecision(previous, script) : previous
    );
  };

  const roleBuckets = act && roleIndex !== null
    ? bucketClues(act.clues, roleIndex, game.sharedClueIds)
    : { publicClues: [], myPrivateClues: [], sharedClues: [], peerPrivateCount: 0 };
  const totalVisibleClues =
    roleBuckets.publicClues.length + roleBuckets.myPrivateClues.length + roleBuckets.sharedClues.length;
  const readClues = [...roleBuckets.publicClues, ...roleBuckets.myPrivateClues, ...roleBuckets.sharedClues]
    .filter(clue => seenClues.includes(clue.id)).length;

  const myPick = rolePicks[viewSeat];
  const peerReady = ready[peerSeat];
  const iReady = ready[viewSeat];
  const decisionOptions = decision?.options ?? [];
  const myChoice = mySeal?.round === round ? decisionOptions.find(option => option.id === mySeal.value) : undefined;

  const canResume = !online || authority;

  return (
    <div className="mobile-game-screen fixed inset-x-0 top-0 bottom-0 z-50 flex flex-col bg-black">
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#1b1226] via-black to-[#0d1724] opacity-95" />
      <div className="relative z-10 mx-auto flex h-full w-full max-w-[430px] flex-col">
        <header className="mobile-screen-header flex shrink-0 items-center gap-3 px-4 py-2">
          <button
            onClick={handleBack}
            className="ios-btn flex h-10 w-10 items-center justify-center rounded-full border border-white/5 bg-white/10"
            aria-label="返回首页"
          >
            <ArrowLeft className="text-white" size={20} />
          </button>
          <div className="flex-1 text-center">
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#D08BFF]">Jubensha</div>
            <div className="mt-1 text-sm font-bold text-white">
              {script ? script.title : '双人剧本杀'}
            </div>
          </div>
          {game.phase !== 'script_select' ? (
            <button
              type="button"
              onClick={backToScripts}
              className="ios-btn flex h-10 w-10 items-center justify-center rounded-full border border-white/5 bg-white/10 text-gray-400"
              aria-label="回到选本"
            >
              <BookOpen size={18} />
            </button>
          ) : (
            <div className="flex h-10 w-10 items-center justify-center text-gray-500">
              <ScrollText size={22} />
            </div>
          )}
        </header>

        {game.phase !== 'script_select' && (
          <div className="shrink-0 px-5 pb-2">
            <div className="flex items-center justify-between">
              <PhaseBar game={game} />
              {act && (
                <span className="text-[10px] font-bold text-gray-500">
                  第 {game.actIndex + 1}/{script?.acts.length ?? 0} 幕
                </span>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <SeatBadge
                seat={viewSeat}
                name={`${myPlayer?.name || PLAYER_NAMES[viewSeat]}${online ? '（我）' : '（当前视角）'}`}
                role={roleNameOf(script, game, viewSeat)}
              />
              {!online && (
                <button
                  type="button"
                  onClick={() => openSeat(peerSeat)}
                  className="ios-btn flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-bold text-gray-300"
                >
                  <Users size={12} />切换视角
                </button>
              )}
              {online && (
                <span className="text-[10px] text-gray-600">
                  {peerPlayer?.name || PLAYER_NAMES[peerSeat]} 在另一台设备
                </span>
              )}
            </div>
          </div>
        )}

        <main ref={mainRef} className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-3 no-scrollbar">
          {!script && game.phase !== 'script_select' ? (
            <div className="rounded-3xl border border-[#FF453A]/25 bg-[#FF453A]/10 p-6 text-center">
              <div className="text-lg font-bold text-white">剧本已不存在</div>
              <div className="mt-2 text-xs text-gray-400">存档里的剧本已被移除，重新选一个剧本开始吧。</div>
              <button
                type="button"
                onClick={restart}
                className="ios-btn mt-4 h-12 w-full rounded-full bg-white text-sm font-bold text-black"
              >
                回到选本
              </button>
            </div>
          ) : game.phase === 'script_select' ? (
            <div className="space-y-4">
              <div className="rounded-3xl border border-[#D08BFF]/25 bg-gradient-to-br from-[#D08BFF]/15 to-transparent p-5">
                <div className="flex items-center gap-2 text-xs font-bold text-[#D08BFF]">
                  <Sparkles size={15} />限定双人剧本杀
                </div>
                <div className="mt-2 text-lg font-bold text-white">一人一本，各怀秘密</div>
                <p className="mt-1 text-xs leading-relaxed text-gray-400">
                  分幕读本、搜证交换、关键抉择暗投。两个人看到的内容并不完全一样，别偷看对方的屏幕。
                </p>
              </div>

              {saves[0] && (
                <div className="rounded-2xl border border-[#30D158]/25 bg-[#30D158]/10 p-4">
                  <div className="flex items-center gap-2 text-[11px] font-bold text-[#30D158]">
                    <CheckCircle2 size={14} />发现未完成的对局
                  </div>
                  <div className="mt-1 text-xs text-gray-300">
                    《{getJubenshaScript(saves[0].scriptId)?.title ?? saves[0].scriptId}》·
                    {JUBENSHA_PHASE_LABEL[saves[0].phase]} · 第 {saves[0].actIndex + 1} 幕
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const target = getJubenshaScript(saves[0].scriptId);
                      if (target) resumeScript(target);
                    }}
                    disabled={!canResume}
                    className="ios-btn mt-3 h-10 w-full rounded-full bg-[#30D158] text-xs font-bold text-black disabled:opacity-40"
                  >
                    {canResume ? '继续上次进度' : '等房主继续'}
                  </button>
                </div>
              )}

              {JUBENSHA_SCRIPTS.map(item => {
                const saved = saves.find(save => save.scriptId === item.id);
                return (
                  <ScriptCard
                    key={item.id}
                    script={item}
                    savedPhase={saved ? JUBENSHA_PHASE_LABEL[saved.phase] : null}
                    canResume={canResume}
                    onStart={() => startNewScript(item)}
                    onResume={() => resumeScript(item)}
                  />
                );
              })}

              <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 text-[11px] leading-relaxed text-gray-500">
                玩法说明：双方各自读自己的角色本；搜证阶段可以把自己手里的线索分享给对方；
                关键抉择采用暗投，双方都锁定后才一起揭晓，并据选择组合进入不同结局。
              </div>
            </div>
          ) : game.phase === 'role_select' ? (
            <div className="space-y-4">
              <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-5">
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-[#D08BFF]">选择角色</div>
                <div className="mt-1 text-lg font-bold text-white">你想演谁？</div>
                <p className="mt-1 text-xs leading-relaxed text-gray-500">
                  两人都确认后自动分配。如果都选了同一个角色，男方优先，另一方自动拿到剩下的角色。
                </p>
              </div>

              <div className="space-y-3">
                {script?.roles.map((role, index) => {
                  const selected = myPick === role.id;
                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => pickRole(role.id)}
                      disabled={iReady}
                      className={`ios-btn w-full rounded-3xl border p-5 text-left transition-colors disabled:opacity-60 ${
                        selected
                          ? 'border-white bg-white text-black'
                          : 'border-white/10 bg-white/[0.04] text-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {index === 0 ? <User size={16} /> : <UserRound size={16} />}
                          <span className="text-base font-bold">{role.name}</span>
                        </div>
                        {selected && <Check size={18} />}
                      </div>
                      <div className={`mt-2 text-xs ${selected ? 'text-black/60' : 'text-gray-500'}`}>{role.tagline}</div>
                      <div className={`mt-2 text-[12px] leading-relaxed ${selected ? 'text-black/70' : 'text-gray-400'}`}>
                        {role.publicBio}
                      </div>
                    </button>
                  );
                })}
              </div>

              {!online && iReady && !peerReady && (
                <HandoffButton
                  targetName={peerPlayer?.name || PLAYER_NAMES[peerSeat]}
                  roleName={roleNameOf(script, game, peerSeat)}
                  onSwitch={() => openSeat(peerSeat)}
                />
              )}

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className={iReady ? 'text-[#30D158]' : 'text-gray-400'}>
                    {iReady ? '你已确认角色' : '确认后等对方也确认'}
                  </span>
                  <span className={peerReady ? 'text-[#30D158]' : 'text-gray-600'}>
                    {peerReady ? '对方已确认' : '对方未确认'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={toggleReady}
                  disabled={!iReady && !myPick}
                  className={`ios-btn mt-3 h-12 w-full rounded-full text-sm font-bold shadow-lg disabled:opacity-40 ${
                    iReady ? 'border border-white/10 bg-white/10 text-white' : 'bg-white text-black'
                  }`}
                >
                  {iReady ? '取消确认' : '确认角色'}
                </button>
              </div>
            </div>
          ) : game.phase === 'act_reading' && act && myRole ? (
            <div className="space-y-4">
              <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-5">
                <div className="text-xs font-bold text-[#D08BFF]">{act.title}</div>
                <div className="mt-3 rounded-2xl bg-black/30 p-4 text-[13px] leading-7 text-gray-300">
                  {act.dmNarration}
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-[#1C1C1E] p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold" style={{ color: seatAccent(viewSeat) }}>
                    {viewSeat === 0 ? <User size={14} /> : <UserRound size={14} />}
                    {myRole.name} · 你的本幕
                  </div>
                  <span className="text-[10px] text-gray-600">仅自己可见</span>
                </div>
                <div className="mt-3 space-y-3">
                  {(act.roleScripts[myRole.id] ?? []).map((paragraph, index) => (
                    <p key={index} className="text-[15px] leading-7 text-white">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-[#FFD60A]/25 bg-[#FFD60A]/[0.07] p-4">
                <div className="flex items-center gap-2 text-[11px] font-bold text-[#FFD60A]">
                  <Lock size={13} />你的隐藏目标
                </div>
                <div className="mt-2 text-[13px] leading-relaxed text-gray-200">{myRole.secretGoal}</div>
              </div>

              {act.discussionPrompts.length > 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="text-[11px] font-bold text-gray-400">可以聊聊</div>
                  <ul className="mt-2 space-y-1.5">
                    {act.discussionPrompts.map(prompt => (
                      <li key={prompt} className="flex gap-2 text-[12px] leading-relaxed text-gray-300">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#D08BFF]" />
                        {prompt}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-bold text-gray-400">本幕笔记（仅自己可见）</div>
                  <span className="text-[9px] text-gray-600">失焦自动保存</span>
                </div>
                <textarea
                  value={notesDraft}
                  onChange={event => setNotesDraft(event.target.value)}
                  onBlur={commitNotes}
                  rows={3}
                  placeholder="记下你怀疑的细节、想说但还没说出口的话…"
                  className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-black/30 p-3 text-[12px] leading-relaxed text-white outline-none placeholder:text-gray-600 focus:border-[#D08BFF]/40"
                />
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className={iReady ? 'text-[#30D158]' : 'text-gray-400'}>
                    {iReady ? '你已读完本幕' : '读完本幕，准备搜证'}
                  </span>
                  <span className={peerReady ? 'text-[#30D158]' : 'text-gray-600'}>
                    {peerReady ? '对方已读完' : '等待对方…'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={toggleReady}
                  className={`ios-btn mt-3 h-12 w-full rounded-full text-sm font-bold shadow-lg ${
                    iReady ? 'border border-white/10 bg-white/10 text-white' : 'bg-white text-black'
                  }`}
                >
                  {iReady ? '取消准备' : ready[0] && ready[1] ? '进入搜证' : '读完本幕'}
                </button>
              </div>

              {!online && iReady && !peerReady && (
                <HandoffButton
                  targetName={peerPlayer?.name || PLAYER_NAMES[peerSeat]}
                  roleName={roleNameOf(script, game, peerSeat)}
                  onSwitch={() => openSeat(peerSeat)}
                />
              )}
            </div>
          ) : game.phase === 'act_clues' && act ? (
            <div className="space-y-4">
              <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-5">
                <div className="text-xs font-bold text-[#D08BFF]">{act.title} · 搜证</div>
                <div className="mt-1 text-sm font-bold text-white">把能说的线索摆上桌</div>
                <div className="mt-2 flex items-center gap-3 text-[10px] text-gray-500">
                  <span>可见 {totalVisibleClues} 条</span>
                  <span>已读 {readClues} 条</span>
                  <span>已分享 {roleBuckets.sharedClues.length} 条</span>
                </div>
              </div>

              {roleBuckets.publicClues.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-bold text-[#64B5FF]">公共线索</div>
                  {roleBuckets.publicClues.map(clue => (
                    <ClueCard
                      key={clue.id}
                      clue={clue}
                      shared={false}
                      seen={seenClues.includes(clue.id)}
                      open={openClues.includes(clue.id)}
                      canShare={false}
                      onToggle={() => toggleClue(clue.id)}
                      onShare={() => shareClue(clue)}
                    />
                  ))}
                </div>
              )}

              {roleBuckets.myPrivateClues.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-bold text-[#FF7A96]">我的私密线索</div>
                  {roleBuckets.myPrivateClues.map(clue => (
                    <ClueCard
                      key={clue.id}
                      clue={clue}
                      shared={false}
                      seen={seenClues.includes(clue.id)}
                      open={openClues.includes(clue.id)}
                      canShare
                      onToggle={() => toggleClue(clue.id)}
                      onShare={() => shareClue(clue)}
                    />
                  ))}
                </div>
              )}

              {roleBuckets.sharedClues.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-bold text-[#30D158]">已分享给 TA</div>
                  {roleBuckets.sharedClues.map(clue => (
                    <ClueCard
                      key={clue.id}
                      clue={clue}
                      shared
                      seen={seenClues.includes(clue.id)}
                      open={openClues.includes(clue.id)}
                      canShare={false}
                      onToggle={() => toggleClue(clue.id)}
                      onShare={() => shareClue(clue)}
                    />
                  ))}
                </div>
              )}

              {roleBuckets.peerPrivateCount > 0 && (
                <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3 text-[11px] text-gray-500">
                  对方还有 {roleBuckets.peerPrivateCount} 条私密线索没有公开。
                </div>
              )}

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className={iReady ? 'text-[#30D158]' : 'text-gray-400'}>
                    {iReady ? '你已结束搜证' : '搜证完毕，进入下一步'}
                  </span>
                  <span className={peerReady ? 'text-[#30D158]' : 'text-gray-600'}>
                    {peerReady ? '对方已结束' : '等待对方…'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={toggleReady}
                  className={`ios-btn mt-3 h-12 w-full rounded-full text-sm font-bold shadow-lg ${
                    iReady ? 'border border-white/10 bg-white/10 text-white' : 'bg-white text-black'
                  }`}
                >
                  {iReady ? '取消准备' : act.decision ? '进入关键抉择' : '进入下一幕'}
                </button>
              </div>

              {!online && iReady && !peerReady && (
                <HandoffButton
                  targetName={peerPlayer?.name || PLAYER_NAMES[peerSeat]}
                  roleName={roleNameOf(script, game, peerSeat)}
                  onSwitch={() => openSeat(peerSeat)}
                />
              )}
            </div>
          ) : game.phase === 'act_decision' && decision ? (
            <div className="space-y-4">
              <div className="rounded-3xl border border-[#FFD60A]/25 bg-gradient-to-br from-[#FFD60A]/15 to-transparent p-5">
                <div className="flex items-center gap-2 text-[11px] font-bold text-[#FFD60A]">
                  <Lock size={13} />密封抉择 · {decision.title}
                </div>
                <div className="mt-2 text-[15px] font-bold leading-relaxed text-white">{decision.prompt}</div>
                <div className="mt-2 text-[10px] text-gray-500">双方都锁定后才会同时揭晓，在那之前对方看不到你的选择。</div>
              </div>

              {!revealedNow ? (
                <>
                  <div className="space-y-2">
                    {decisionOptions.map(option => {
                      const selected = myChoice?.id === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => submitDecision(option.id)}
                          disabled={iSubmitted}
                          className={`ios-btn w-full rounded-2xl border p-4 text-left disabled:opacity-70 ${
                            selected ? 'border-[#FFD60A] bg-[#FFD60A]/15' : 'border-white/10 bg-white/[0.04]'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-white">{option.label}</span>
                            {selected && <Lock size={14} className="text-[#FFD60A]" />}
                          </div>
                          {option.description && (
                            <div className="mt-1 text-[11px] leading-relaxed text-gray-500">{option.description}</div>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center">
                    {iSubmitted ? (
                      <>
                        <div className="text-xs font-bold text-[#30D158]">你的选择已锁定</div>
                        <div className="mt-1 text-[11px] text-gray-500">
                          {myChoice?.label ? `你选了「${myChoice.label}」` : ''}
                          {peerSubmitted ? ' · 对方也已锁定，正在揭晓…' : ' · 等对方锁定'}
                        </div>
                      </>
                    ) : (
                      <div className="text-xs font-bold text-gray-400">选一个，然后锁定</div>
                    )}
                  </div>

                  {!online && iSubmitted && !peerSubmitted && (
                    <HandoffButton
                      targetName={peerPlayer?.name || PLAYER_NAMES[peerSeat]}
                      roleName={roleNameOf(script, game, peerSeat)}
                      onSwitch={() => openSeat(peerSeat)}
                    />
                  )}
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    {([0, 1] as Seat[]).map(seat => {
                      const value = revealedNow.values[seat];
                      const option = decisionOptions.find(item => item.id === value);
                      return (
                        <div
                          key={seat}
                          className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center"
                        >
                          <div className="text-[11px] font-bold" style={{ color: seatAccent(seat) }}>
                            {roleNameOf(script, game, seat)}
                          </div>
                          <div className="mt-2 text-sm font-bold text-white">{option?.label ?? '未选择'}</div>
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={continueAfterDecision}
                    disabled={!decisionRecorded}
                    className="ios-btn h-14 w-full rounded-full bg-white text-base font-bold text-black shadow-lg disabled:opacity-50"
                  >
                    {decision.final ? '揭晓结局' : '进入下一幕'}
                  </button>

                  {!online && (
                    <HandoffButton
                      targetName={peerPlayer?.name || PLAYER_NAMES[peerSeat]}
                      roleName={roleNameOf(script, game, peerSeat)}
                      onSwitch={() => openSeat(peerSeat)}
                    />
                  )}
                </>
              )}
            </div>
          ) : game.phase === 'ending_reveal' && ending ? (
            <div className="space-y-4">
              <div className="rounded-3xl border border-[#D08BFF]/30 bg-gradient-to-br from-[#D08BFF]/20 to-transparent p-6 text-center">
                <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#D08BFF]">Ending</div>
                <div className="mt-2 text-2xl font-bold text-white">{ending.title}</div>
                <p className="mt-3 text-sm leading-relaxed text-gray-300">{ending.summary}</p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-5">
                <div className="flex items-center gap-2 text-xs font-bold text-[#FFD60A]">
                  <Sparkles size={14} />完整真相
                </div>
                <p className="mt-2 text-[13px] leading-7 text-gray-200">{ending.truthReveal}</p>
              </div>

              <div className="space-y-2">
                <div className="text-[11px] font-bold text-gray-400">隐藏秘密</div>
                {ending.roleSecrets.map((secret, index) => (
                  <div key={index} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <div className="text-[11px] font-bold" style={{ color: seatAccent(index as Seat) }}>
                      {script?.roles[index]?.name}
                    </div>
                    <div className="mt-1 text-[13px] leading-relaxed text-gray-300">{secret}</div>
                  </div>
                ))}
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                <div className="text-[11px] font-bold text-gray-400">你们的选择</div>
                <div className="mt-3 space-y-3">
                  {script?.acts
                    .filter(item => item.decision)
                    .map(item => {
                      const actDecision = item.decision as JubenshaDecision;
                      const values = game.decisions[actDecision.id];
                      return (
                        <div key={actDecision.id} className="rounded-2xl bg-black/25 p-3">
                          <div className="text-[11px] font-bold text-white">{actDecision.title}</div>
                          <div className="mt-1.5 grid grid-cols-2 gap-2">
                            {([0, 1] as Seat[]).map(seat => {
                              const option = actDecision.options.find(entry => entry.id === values?.[seat]);
                              return (
                                <div key={seat} className="text-center">
                                  <div className="text-[10px]" style={{ color: seatAccent(seat) }}>
                                    {roleNameOf(script, game, seat)}
                                  </div>
                                  <div className="mt-0.5 text-[11px] font-bold text-gray-300">
                                    {option?.label ?? '未选择'}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={backToScripts}
                  className="ios-btn h-12 flex-1 rounded-full border border-white/10 bg-white/10 text-sm font-bold text-white"
                >
                  换个剧本
                </button>
                <button
                  type="button"
                  onClick={() => script && startNewScript(script)}
                  className="ios-btn h-12 flex-1 rounded-full bg-white text-sm font-bold text-black shadow-lg"
                >
                  再玩一次
                </button>
              </div>

              <button
                type="button"
                onClick={restart}
                className="ios-btn mx-auto flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-[11px] font-bold text-gray-400"
              >
                <RefreshCw size={12} />清空进度，重新来过
              </button>
            </div>
          ) : (
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-center text-sm text-gray-400">
              正在准备下一幕…
            </div>
          )}
        </main>
      </div>

      {pendingSeat !== null && (
        <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-black px-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
            <Lock size={28} className="text-[#FFD60A]" />
          </div>
          <div className="mt-5 text-sm text-gray-400">请把手机交给</div>
          <div className="mt-1 text-2xl font-bold" style={{ color: seatAccent(pendingSeat) }}>
            {players[pendingSeat]?.name || PLAYER_NAMES[pendingSeat]}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {script ? `${roleNameOf(script, game, pendingSeat)} 的视角` : '下一位玩家'}
          </div>
          <p className="mt-4 max-w-[280px] text-[11px] leading-relaxed text-gray-500">
            确认周围没有旁观者，并且对方已经把视线移开后再解锁。剧本杀的秘密只属于当前角色。
          </p>
          <button
            type="button"
            onClick={unlockSeat}
            className="ios-btn mt-6 h-12 w-full max-w-[280px] rounded-full bg-white text-sm font-bold text-black shadow-lg"
          >
            我确认，解锁视角
          </button>
          <button
            type="button"
            onClick={() => setPendingSeat(null)}
            className="ios-btn mt-2 h-10 w-full max-w-[280px] rounded-full border border-white/10 text-xs font-bold text-gray-400"
          >
            取消，回到当前视角
          </button>
        </div>
      )}
    </div>
  );
}

export function JubenshaModeView({ players, onBack }: JubenshaModeViewProps) {
  const runtime = useModeRuntime();
  const online = runtime !== null;
  const mySeat: Seat = runtime?.seat ?? 0;
  const authority = useModeAuthority();
  const [runId, setRunId] = useModeState('JubenshaModeView.runId', 0);

  return (
    <JubenshaScreen
      key={runId}
      players={players}
      online={online}
      mySeat={mySeat}
      authority={authority}
      onRestart={() => setRunId(value => value + 1)}
      onBack={onBack}
    />
  );
}
