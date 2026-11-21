import type { JubenshaAct, JubenshaClue, JubenshaDecision, JubenshaEnding, JubenshaScript } from '../types/jubensha';
import type { Seat } from './types';
import { loadFromStorage, removeFromStorage, saveToStorageNow } from '../utils/localStorage';

/**
 * 双人剧本杀的状态机（纯函数）。
 *
 * 视图只负责渲染与把用户操作翻译成这里的状态迁移；同屏 / 联机共用同一套逻辑。
 * 所有状态都是可序列化的纯数据，`extractCard` 不会误判（没有 initiator/executor 字段）。
 */

export type JubenshaPhase =
  | 'script_select'
  | 'role_select'
  | 'act_reading'
  | 'act_clues'
  | 'act_decision'
  | 'ending_reveal';

export interface JubenshaGame {
  phase: JubenshaPhase;
  scriptId: string | null;
  actIndex: number;
  /** 当前阶段双方是否已准备（双人 Ready 同步锁） */
  ready: [boolean, boolean];
  /** 选角阶段各自的偏好；公开，双方都确认后由引擎结算 */
  rolePicks: [string | null, string | null];
  /** 结算后的座位 → 角色 id */
  roles: [string | null, string | null];
  /** 已分享到公共区的线索 id */
  sharedClueIds: string[];
  /** 已揭晓的抉择：decisionId → [seat0 选择, seat1 选择] */
  decisions: Record<string, [string | null, string | null]>;
  endingId: string | null;
  startedAt: number;
  updatedAt: number;
}

export interface JubenshaSeal {
  round: number;
  value: string;
}

export const JUBENSHA_PHASE_LABEL: Record<JubenshaPhase, string> = {
  script_select: '选本',
  role_select: '选角',
  act_reading: '读本',
  act_clues: '搜证',
  act_decision: '抉择',
  ending_reveal: '复盘'
};

export const JUBENSHA_PHASE_ORDER: JubenshaPhase[] = [
  'script_select',
  'role_select',
  'act_reading',
  'act_clues',
  'act_decision',
  'ending_reveal'
];

export const JUBENSHA_DIFFICULTY_LABEL: Record<JubenshaScript['difficulty'], string> = {
  easy: '入门',
  normal: '进阶',
  hard: '硬核'
};

export function otherSeat(seat: Seat): Seat {
  return seat === 0 ? 1 : 0;
}

export function createEmptyGame(): JubenshaGame {
  return {
    phase: 'script_select',
    scriptId: null,
    actIndex: 0,
    ready: [false, false],
    rolePicks: [null, null],
    roles: [null, null],
    sharedClueIds: [],
    decisions: {},
    endingId: null,
    startedAt: 0,
    updatedAt: 0
  };
}

/** 选定剧本：清空上一局的一切进度，进入选角 */
export function startScript(_game: JubenshaGame, script: JubenshaScript): JubenshaGame {
  const now = Date.now();
  return {
    ...createEmptyGame(),
    phase: 'role_select',
    scriptId: script.id,
    startedAt: now,
    updatedAt: now
  };
}

/** 回到选本页（保留当前进度由调用方决定是否存档） */
export function backToScriptSelect(game: JubenshaGame): JubenshaGame {
  return { ...createEmptyGame(), updatedAt: Date.now(), startedAt: game.startedAt };
}

export function setSeatValue<T>(pair: [T, T], seat: Seat, value: T): [T, T] {
  return seat === 0 ? [value, pair[1]] : [pair[0], value];
}

export function setReady(game: JubenshaGame, seat: Seat, value: boolean): JubenshaGame {
  if (game.ready[seat] === value) return game;
  return {
    ...game,
    ready: setSeatValue(game.ready, seat, value),
    updatedAt: Date.now()
  };
}

export function bothReady(game: JubenshaGame): boolean {
  return game.ready[0] && game.ready[1];
}

export function updateRolePick(game: JubenshaGame, seat: Seat, roleId: string | null): JubenshaGame {
  return {
    ...game,
    rolePicks: setSeatValue(game.rolePicks, seat, roleId),
    updatedAt: Date.now()
  };
}

/**
 * 结算选角：
 * - 两人选了不同角色 → 各归各的
 * - 两人选了同一角色 → 按座位优先，seat 0 拿到的就是他的选择
 * - 有人没选 → 补剩下的那个角色
 */
export function resolveRolePicks(
  script: JubenshaScript,
  picks: [string | null, string | null]
): [string, string] {
  const first = script.roles[0].id;
  const second = script.roles[1].id;
  const [a, b] = picks;

  if (a && b && a !== b) return [a, b];
  if (a && b && a === b) return [a, a === first ? second : first];
  if (a) return [a, a === first ? second : first];
  if (b) return [b === first ? second : first, b];
  return [first, second];
}

/** 选角完成 → 进入第一幕读本 */
export function advanceRoleSelect(game: JubenshaGame, script: JubenshaScript): JubenshaGame {
  const roles = resolveRolePicks(script, game.rolePicks);
  return {
    ...game,
    phase: 'act_reading',
    actIndex: 0,
    roles,
    ready: [false, false],
    updatedAt: Date.now()
  };
}

export function currentAct(game: JubenshaGame, script: JubenshaScript): JubenshaAct | null {
  return script.acts[game.actIndex] ?? null;
}

export function currentDecision(game: JubenshaGame, script: JubenshaScript): JubenshaDecision | null {
  return currentAct(game, script)?.decision ?? null;
}

/** 读本 → 搜证 */
export function advanceReading(game: JubenshaGame): JubenshaGame {
  return {
    ...game,
    phase: 'act_clues',
    ready: [false, false],
    updatedAt: Date.now()
  };
}

function moveToNextActOrEnding(game: JubenshaGame, script: JubenshaScript): JubenshaGame {
  const nextIndex = game.actIndex + 1;
  if (nextIndex < script.acts.length) {
    return {
      ...game,
      phase: 'act_reading',
      actIndex: nextIndex,
      ready: [false, false],
      updatedAt: Date.now()
    };
  }
  const ending = resolveEnding(script, game.decisions);
  return {
    ...game,
    phase: 'ending_reveal',
    endingId: ending.id,
    ready: [false, false],
    updatedAt: Date.now()
  };
}

/** 搜证 → 本幕抉择（没有抉择就直接下一幕 / 结局） */
export function advanceClues(game: JubenshaGame, script: JubenshaScript): JubenshaGame {
  const decision = currentDecision(game, script);
  if (decision) {
    return {
      ...game,
      phase: 'act_decision',
      ready: [false, false],
      updatedAt: Date.now()
    };
  }
  return moveToNextActOrEnding(game, script);
}

/** 记录一次已揭晓的抉择（由权威端在双方都提交后写入） */
export function recordDecision(
  game: JubenshaGame,
  decisionId: string,
  values: [string | null, string | null]
): JubenshaGame {
  const current = game.decisions[decisionId];
  if (current && current[0] === values[0] && current[1] === values[1]) return game;
  return {
    ...game,
    decisions: { ...game.decisions, [decisionId]: values },
    updatedAt: Date.now()
  };
}

/** 抉择揭晓后继续：终局抉择 → 复盘；否则下一幕 */
export function advanceAfterDecision(game: JubenshaGame, script: JubenshaScript): JubenshaGame {
  const decision = currentDecision(game, script);
  if (decision?.final) {
    const ending = resolveEnding(script, game.decisions);
    return {
      ...game,
      phase: 'ending_reveal',
      endingId: ending.id,
      ready: [false, false],
      updatedAt: Date.now()
    };
  }
  return moveToNextActOrEnding(game, script);
}

/** 按双方选择匹配结局：先找带条件且全部命中的，再回落到无条件的兜底结局 */
export function resolveEnding(
  script: JubenshaScript,
  decisions: Record<string, [string | null, string | null]>
): JubenshaEnding {
  for (const ending of script.endings) {
    if (!ending.match || ending.match.length === 0) continue;
    const hit = ending.match.every(match => {
      const chosen = decisions[match.decisionId];
      if (!chosen) return false;
      return match.choices.every((expected, index) => expected === null || chosen[index] === expected);
    });
    if (hit) return ending;
  }
  return (
    script.endings.find(ending => !ending.match || ending.match.length === 0) ??
    script.endings[script.endings.length - 1]
  );
}

export function endingById(script: JubenshaScript, endingId: string | null): JubenshaEnding | null {
  if (!endingId) return null;
  return script.endings.find(ending => ending.id === endingId) ?? null;
}

export function roleIndexById(script: JubenshaScript, roleId: string | null): 0 | 1 | null {
  if (!roleId) return null;
  const index = script.roles.findIndex(role => role.id === roleId);
  return index === 0 || index === 1 ? index : null;
}

export function roleIndexOfSeat(game: JubenshaGame, script: JubenshaScript, seat: Seat): 0 | 1 | null {
  return roleIndexById(script, game.roles[seat]);
}

export function roleIdOfSeat(game: JubenshaGame, seat: Seat): string | null {
  return game.roles[seat];
}

/** 线索归属 → 角色下标（public 返回 null） */
export function clueRoleIndex(clue: JubenshaClue): 0 | 1 | null {
  if (clue.owner === 'role0') return 0;
  if (clue.owner === 'role1') return 1;
  return null;
}

export function isClueShared(game: JubenshaGame, clueId: string): boolean {
  return game.sharedClueIds.includes(clueId);
}

/** 当前角色视角能看到的线索（公共 / 自己的 / 已分享） */
export function clueVisibleToRole(
  clue: JubenshaClue,
  roleIndex: 0 | 1 | null,
  sharedClueIds: readonly string[]
): boolean {
  if (clue.owner === 'public') return true;
  if (sharedClueIds.includes(clue.id)) return true;
  const owner = clueRoleIndex(clue);
  return owner !== null && roleIndex !== null && owner === roleIndex;
}

export interface ClueBuckets {
  publicClues: JubenshaClue[];
  myPrivateClues: JubenshaClue[];
  sharedClues: JubenshaClue[];
  /** 对方手里还没公开的线索数量（只给数字，不泄内容） */
  peerPrivateCount: number;
}

/**
 * 按「当前角色」把一幕的线索分桶：
 * - 公共线索：所有人可见
 * - 我的私密：只有本人可见、还没分享
 * - 已分享：双方都能看到
 * 对方未分享的私密线索不返回内容，只返回数量。
 */
export function bucketClues(
  clues: readonly JubenshaClue[],
  roleIndex: 0 | 1 | null,
  sharedClueIds: readonly string[]
): ClueBuckets {
  const buckets: ClueBuckets = {
    publicClues: [],
    myPrivateClues: [],
    sharedClues: [],
    peerPrivateCount: 0
  };
  for (const clue of clues) {
    if (clue.owner === 'public') {
      buckets.publicClues.push(clue);
      continue;
    }
    if (sharedClueIds.includes(clue.id)) {
      buckets.sharedClues.push(clue);
      continue;
    }
    const owner = clueRoleIndex(clue);
    if (owner !== null && roleIndex !== null && owner === roleIndex) {
      buckets.myPrivateClues.push(clue);
    } else {
      buckets.peerPrivateCount += 1;
    }
  }
  return buckets;
}

/** 当前抉择的轮次号：一幕一个抉择，用 actIndex + 1 即可，换幕自然开启新一轮 */
export function decisionRound(game: JubenshaGame): number {
  return game.actIndex + 1;
}

export function phaseProgress(game: JubenshaGame): number {
  const index = JUBENSHA_PHASE_ORDER.indexOf(game.phase);
  return index < 0 ? 0 : index;
}

export function clampSeat(value: number): Seat {
  return value === 1 ? 1 : 0;
}

// ---------------------------------------------------------------------------
// 断点恢复：按剧本 id 存 localStorage，联机时只由房主端写入
// ---------------------------------------------------------------------------

const SAVE_PREFIX = 'couples-ludo-jubensha:';
const SAVE_VERSION = 1;

export interface JubenshaSave {
  version: number;
  game: JubenshaGame;
  savedAt: number;
}

function saveKey(scriptId: string): string {
  return `${SAVE_PREFIX}${scriptId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizePair<T>(value: unknown, normalize: (item: unknown) => T | null): [T | null, T | null] {
  if (!Array.isArray(value) || value.length < 2) return [null, null];
  return [normalize(value[0]), normalize(value[1])];
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** 读取存档时做一次宽松校验，旧版本 / 手改坏的数据直接丢弃 */
export function normalizeGame(value: unknown): JubenshaGame | null {
  if (!isRecord(value)) return null;
  const phase =
    typeof value.phase === 'string' && Object.prototype.hasOwnProperty.call(JUBENSHA_PHASE_LABEL, value.phase)
      ? (value.phase as JubenshaPhase)
      : null;
  if (!phase) return null;
  const scriptId = normalizeString(value.scriptId);
  if (!scriptId) return null;
  const readyRaw = Array.isArray(value.ready) ? value.ready : [];
  const cluesRaw = Array.isArray(value.sharedClueIds) ? value.sharedClueIds : [];
  const decisionsRaw = isRecord(value.decisions) ? value.decisions : {};
  const decisions: Record<string, [string | null, string | null]> = {};
  Object.entries(decisionsRaw).forEach(([key, entry]) => {
    if (!Array.isArray(entry) || entry.length < 2) return;
    const pair: [string | null, string | null] = [
      typeof entry[0] === 'string' ? entry[0] : null,
      typeof entry[1] === 'string' ? entry[1] : null
    ];
    decisions[key] = pair;
  });
  return {
    phase,
    scriptId,
    actIndex: typeof value.actIndex === 'number' && value.actIndex >= 0 ? Math.floor(value.actIndex) : 0,
    ready: [readyRaw[0] === true, readyRaw[1] === true],
    rolePicks: normalizePair(value.rolePicks, normalizeString),
    roles: normalizePair(value.roles, normalizeString),
    sharedClueIds: cluesRaw.filter((id): id is string => typeof id === 'string'),
    decisions,
    endingId: typeof value.endingId === 'string' ? value.endingId : null,
    startedAt: typeof value.startedAt === 'number' ? value.startedAt : 0,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now()
  };
}

export function saveJubenshaGame(game: JubenshaGame): void {
  if (!game.scriptId) return;
  const payload: JubenshaSave = { version: SAVE_VERSION, game, savedAt: Date.now() };
  // 立即写入：回到选本页要马上能读到「继续上次进度」，延迟队列会读到旧值
  saveToStorageNow(saveKey(game.scriptId), payload);
}

export function loadJubenshaGame(scriptId: string): JubenshaGame | null {
  const raw = loadFromStorage<JubenshaSave | null>(saveKey(scriptId), null);
  if (!raw || !isRecord(raw) || raw.version !== SAVE_VERSION) return null;
  return normalizeGame(raw.game);
}

export function clearJubenshaGame(scriptId: string): void {
  removeFromStorage(saveKey(scriptId));
}

export interface JubenshaSaveSummary {
  scriptId: string;
  savedAt: number;
  phase: JubenshaPhase;
  actIndex: number;
}

/** 扫描一组剧本的存档，用于选本页的「继续上次进度」 */
export function listJubenshaSaves(scriptIds: readonly string[]): JubenshaSaveSummary[] {
  const saves: JubenshaSaveSummary[] = [];
  for (const scriptId of scriptIds) {
    const raw = loadFromStorage<JubenshaSave | null>(saveKey(scriptId), null);
    if (!raw || raw.version !== SAVE_VERSION) continue;
    const game = normalizeGame(raw.game);
    if (!game) continue;
    saves.push({
      scriptId,
      savedAt: typeof raw.savedAt === 'number' ? raw.savedAt : game.updatedAt,
      phase: game.phase,
      actIndex: game.actIndex
    });
  }
  return saves.sort((a, b) => b.savedAt - a.savedAt);
}
