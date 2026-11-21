import { describe, expect, it } from 'vitest';
import { decideHost, type RoomPresence } from './rooms';

const peer = (deviceId: string, role: RoomPresence['role'], at: number): RoomPresence => ({
  deviceId,
  roomId: 'space-story',
  role,
  at
});

describe('room host election', () => {
  it('keeps an existing host authoritative', () => {
    expect(decideHost([peer('host', 'host', 1), peer('guest', 'peer', 2)], 'guest', 2)).toBe(false);
  });

  it('uses stable arrival rank for simultaneous peers', () => {
    const peers = [peer('first', 'peer', 10), peer('second', 'peer', 10)];
    expect(decideHost(peers, 'first', 10)).toBe(true);
    expect(decideHost(peers, 'second', 10)).toBe(false);
  });

  it('allows takeover when every other device is only a guest', () => {
    expect(decideHost([peer('old-guest', 'guest', 1)], 'replacement', 2)).toBe(true);
  });
});
