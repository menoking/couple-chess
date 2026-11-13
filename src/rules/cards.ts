import type { OnlineCard, PendingCard, RoomAction, RoomSnapshot, Seat } from './types';
import { applyMoveDelta } from './modeRules';

export const FALLBACK_CARD: OnlineCard = {
  task: '请先在房间大厅各自选择卡包并锁定，下一局就能抽到具体任务',
  themeName: '未选择卡包'
};

export function normalizeCardPool(pool?: OnlineCard[]): OnlineCard[] {
  const cleaned = (pool ?? [])
    .filter(item => typeof item?.task === 'string' && item.task.trim().length > 0)
    .map(item => ({ task: item.task.trim(), themeName: item.themeName?.trim() || '任务包' }));
  return cleaned.length > 0 ? cleaned : [FALLBACK_CARD];
}

/** 按卡序号确定性取卡，两台设备看到的永远是同一张。 */
export function cardFor(pool: OnlineCard[], id: number): OnlineCard {
  const list = pool.length > 0 ? pool : [FALLBACK_CARD];
  const seed = Math.imul(id, 2654435761) >>> 0;
  return list[seed % list.length];
}

/** 入队时只记录归属，不生成卡面；胜方点「抽卡」后才取卡。 */
export function enqueueCard(state: RoomSnapshot, spec: {
  drawerSeat: Seat;
  executorSeat: Seat;
  reason: string;
  /** 玩法视图自己抽出的具体任务；不给时由公共卡池按序号确定性取卡 */
  card?: OnlineCard;
  moveDelta?: number;
}): RoomSnapshot {
  const cardSeq = state.cardSeq + 1;
  const card: PendingCard = {
    id: cardSeq,
    cardIndex: cardSeq,
    drawerSeat: spec.drawerSeat,
    executorSeat: spec.executorSeat,
    reason: spec.reason,
    phase: 'locked',
    // 权威状态里可以先存具体卡面，viewFor 在 locked 阶段一律下发 null
    card: spec.card ?? null,
    moveDelta: spec.moveDelta ?? 0
  };
  return { ...state, cardSeq, cards: [...state.cards, card] };
}

export function isCardAction(action: RoomAction): boolean {
  return action.type === 'drawCard' || action.type === 'revealCard' || action.type === 'ackCard';
}

/** 抽卡状态机：每个动作都校验座位与阶段，非法操作返回原 state。 */
export function reduceCard(state: RoomSnapshot, action: RoomAction): RoomSnapshot {
  const first = state.cards[0];
  if (!first) return state;

  if (action.type === 'drawCard') {
    if (action.seat !== first.drawerSeat || first.phase !== 'locked') return state;
    return {
      ...state,
      cards: [
        { ...first, phase: 'drawn', card: first.card ?? cardFor(state.cardPool, first.cardIndex) },
        ...state.cards.slice(1)
      ]
    };
  }

  if (action.type === 'revealCard') {
    if (action.seat !== first.executorSeat || first.phase !== 'drawn') return state;
    return { ...state, cards: [{ ...first, phase: 'revealed' }, ...state.cards.slice(1)] };
  }

  if (action.type === 'ackCard') {
    // 执行人确认；抽卡人也能关掉，避免座位判定异常时整局卡死在这张卡上
    if (first.phase !== 'revealed') return state;
    if (action.seat !== first.executorSeat && action.seat !== first.drawerSeat) return state;
    // 飞行棋的「完成后前进/后退 N 格」在这里落到执行人身上
    let data = state.data;
    if (first.moveDelta !== 0) {
      const steps = state.data['stage.steps'];
      if (Array.isArray(steps)) {
        const next = [...(steps as number[])];
        const seat = first.executorSeat;
        next[seat] = applyMoveDelta(typeof next[seat] === 'number' ? next[seat] : 0, first.moveDelta);
        data = { ...state.data, 'stage.steps': next };
      }
    }
    return { ...state, cards: state.cards.slice(1), data };
  }

  return state;
}

/**
 * 按座位裁剪卡面：
 * - locked   所有人拿到 null
 * - drawn    只有抽卡方拿到明文（执行方仍是锁定/待翻状态）
 * - revealed 双方都能看到明文
 * 队列中后续卡片一律不下发明文，防止提前看到后面的卡。
 */
export function projectCards(state: RoomSnapshot, seat: Seat): PendingCard[] {
  return state.cards.map((card, index) => {
    if (index > 0 || card.phase === 'locked') return { ...card, card: null };
    if (card.phase === 'drawn' && seat !== card.drawerSeat) return { ...card, card: null };
    return card;
  });
}

/** 卡片未走完四阶段前，锁住玩法内的一切操作。 */
export const cardsBlocking = (state: RoomSnapshot): boolean => state.cards.length > 0;

export interface ExtractedCard {
  card: OnlineCard;
  drawerSeat: Seat;
  executorSeat: Seat;
  reason: string;
  moveDelta: number;
}

/**
 * 把 24 个玩法各自内嵌的任务卡对象（TaskEventData / Bingo reward / 惩罚阶梯 currentTask…）
 * 统一识别成一张公共卡，避免每个玩法再维护自己的弹卡逻辑。
 */
export function extractCard(value: unknown): ExtractedCard | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  // 只认「任务弹窗」对象：TaskEventData（有 initiator/executor）或 Bingo 连线奖励（有 lines + task）。
  // 否则像惩罚阶梯的 currentTask（只是当前展示的任务）会被误当成抽卡，一渲染就弹一张。
  const isTaskEvent =
    typeof record.initiatorPlayerId === 'number' ||
    typeof record.executorPlayerId === 'number';
  const isBingoReward =
    typeof record.lines === 'number' &&
    record.task !== null &&
    typeof record.task === 'object';
  if (!isTaskEvent && !isBingoReward) return null;

  let text: string | null = null;
  if (typeof record.task === 'string') text = record.task;
  else if (record.task && typeof record.task === 'object') {
    const inner = record.task as Record<string, unknown>;
    if (typeof inner.text === 'string') text = inner.text;
  }   if (!text || !text.trim()) return null;

  const executorSeat: Seat = record.executorPlayerId === 1 ? 1 : 0;
  // 抽卡人严格取 initiator：之前在自己抽自己做时翻成对方，导致「男方的回合女方抽卡」
  const drawerSeat: Seat = record.initiatorPlayerId === 1 ? 1 : 0;
  const themeName =
    typeof record.themeName === 'string'
      ? record.themeName
      : typeof record.taskSourceId === 'string' && record.taskSourceId !== 'online'
        ? record.taskSourceId
        : '双端合并卡包';
  const reason = typeof record.title === 'string' && record.title.trim() ? record.title.trim() : '抽到一张任务卡';

  const moveDelta = typeof record.moveDelta === 'number' && Number.isFinite(record.moveDelta)
    ? record.moveDelta
    : 0;

  return { card: { task: text.trim(), themeName }, drawerSeat, executorSeat, reason, moveDelta };
}
