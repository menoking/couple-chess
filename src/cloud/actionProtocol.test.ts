import { describe, expect, it } from 'vitest';
import { createActionEnvelope, normalizeEnvelopeAction, validateActionEnvelope } from './actionProtocol';
import { ROOM_PROTOCOL_VERSION } from '../rules/types';

describe('RoomActionEnvelope', () => {
  const mapping = new Map([['device-a', 0 as const]]);

  it('binds the business action to the Presence device seat', () => {
    const envelope = createActionEnvelope(
      { type: 'patch', key: 'x', value: 1, baseSeq: 99, seat: 0 },
      'device-a',
      0,
      4,
      'action-1'
    );
    const checked = validateActionEnvelope(envelope, mapping, new Set());
    expect(checked.ok).toBe(true);
    if (checked.ok) expect(normalizeEnvelopeAction(checked.envelope)).toMatchObject({ seat: 0, baseSeq: 4 });
  });

  it('rejects wrong seats, unknown devices, duplicate actions and protocol mismatches', () => {
    const valid = createActionEnvelope({ type: 'endTurn', seat: 0, expectedTurn: 0 }, 'device-a', 0, 0, 'same');
    expect(validateActionEnvelope({ ...valid, actorSeat: 1 }, mapping, new Set())).toMatchObject({ ok: false, reason: 'seat-mismatch' });
    expect(validateActionEnvelope({ ...valid, action: { type: 'endTurn', seat: 1, expectedTurn: 0 } }, mapping, new Set())).toMatchObject({ ok: false, reason: 'seat-mismatch' });
    expect(validateActionEnvelope({ ...valid, deviceId: 'unknown' }, mapping, new Set())).toMatchObject({ ok: false, reason: 'unknown-device' });
    expect(validateActionEnvelope(valid, mapping, new Set(['same']))).toMatchObject({ ok: false, reason: 'duplicate-action' });
    expect(validateActionEnvelope({ ...valid, protocolVersion: ROOM_PROTOCOL_VERSION + 1 }, mapping, new Set())).toMatchObject({ ok: false, reason: 'protocol-mismatch' });
  });
});
