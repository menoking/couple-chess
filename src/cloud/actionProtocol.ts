import {
  ROOM_PROTOCOL_VERSION,
  type RoomAction,
  type RoomActionEnvelope,
  type Seat
} from '../rules/types';

export type EnvelopeRejectReason =
  | 'malformed'
  | 'protocol-mismatch'
  | 'duplicate-action'
  | 'unknown-device'
  | 'seat-mismatch'
  | 'untrusted-replace';

export function validateActionEnvelope(
  value: unknown,
  deviceSeats: ReadonlyMap<string, Seat>,
  seenActionIds: ReadonlySet<string>
): { ok: true; envelope: RoomActionEnvelope } | { ok: false; reason: EnvelopeRejectReason } {
  if (!value || typeof value !== 'object') return { ok: false, reason: 'malformed' };
  const envelope = value as Partial<RoomActionEnvelope>;
  if (
    typeof envelope.protocolVersion !== 'number' ||
    typeof envelope.actionId !== 'string' || !envelope.actionId ||
    typeof envelope.deviceId !== 'string' || !envelope.deviceId ||
    (envelope.actorSeat !== 0 && envelope.actorSeat !== 1) ||
    typeof envelope.baseSeq !== 'number' ||
    !envelope.action || typeof envelope.action !== 'object'
  ) return { ok: false, reason: 'malformed' };
  if (envelope.protocolVersion !== ROOM_PROTOCOL_VERSION) return { ok: false, reason: 'protocol-mismatch' };
  if (seenActionIds.has(envelope.actionId)) return { ok: false, reason: 'duplicate-action' };
  const mappedSeat = deviceSeats.get(envelope.deviceId);
  if (mappedSeat === undefined) return { ok: false, reason: 'unknown-device' };
  if (mappedSeat !== envelope.actorSeat) return { ok: false, reason: 'seat-mismatch' };
  if (envelope.action.type === 'replace') return { ok: false, reason: 'untrusted-replace' };
  if ('seat' in envelope.action && envelope.action.seat !== envelope.actorSeat) {
    return { ok: false, reason: 'seat-mismatch' };
  }
  return { ok: true, envelope: envelope as RoomActionEnvelope };
}

/** 身份与版本元数据是唯一信任源，业务 action 内的 baseSeq 由 envelope 覆盖。 */
export function normalizeEnvelopeAction(envelope: RoomActionEnvelope): RoomAction {
  const action: RoomAction = 'seat' in envelope.action
    ? { ...envelope.action, seat: envelope.actorSeat } as RoomAction
    : envelope.action;
  if (action.type === 'patch' || action.type === 'patchBatch') {
    return { ...action, baseSeq: envelope.baseSeq };
  }
  return action;
}

export function createActionEnvelope(
  action: RoomAction,
  deviceId: string,
  actorSeat: Seat,
  baseSeq: number,
  actionId = `${deviceId}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 9)}`
): RoomActionEnvelope {
  return {
    protocolVersion: ROOM_PROTOCOL_VERSION,
    actionId,
    deviceId,
    actorSeat,
    baseSeq,
    action
  };
}
