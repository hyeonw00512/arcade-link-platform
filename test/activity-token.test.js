import assert from 'node:assert/strict';
import test from 'node:test';
import { createActivityToken, verifyActivityToken } from '../server/platform/auth/activity-token.js';
import { PresenceService } from '../server/platform/presence/presence-service.js';

test('activity token only accepts an untampered, unexpired platform identity', () => {
  const secret = 'local-test-secret';
  const token = createActivityToken({ userId: 'user-1', nickname: '테스터', avatar: '🦊', gameId: 'moon-yut' }, secret);
  assert.deepEqual(verifyActivityToken(token, secret).gameId, 'moon-yut');
  assert.throws(() => verifyActivityToken(`${token}x`, secret), /올바르지 않습니다/);
});

test('presence summary separates platform, lobby, play, and spectator activity', () => {
  const presence = new PresenceService();
  presence.touch({ userId: 'home', nickname: '홈', avatar: '🦊' }, 'PLATFORM');
  presence.touch({ userId: 'lobby', nickname: '로비', avatar: '🐼' }, 'moon-yut:LOBBY');
  presence.touch({ userId: 'play', nickname: '플레이', avatar: '🐯' }, 'moon-yut:PLAYING');
  presence.touch({ userId: 'watch', nickname: '관전', avatar: '🐸' }, 'sabotaji:SPECTATING');
  assert.deepEqual(presence.summary(), {
    total: 4,
    statuses: { platform: 1, lobby: 1, playing: 1, spectating: 1 },
    games: { 'moon-yut': 2, sabotaji: 1 }
  });
});

test('platform-only presence can be removed immediately on socket disconnect', () => {
  const presence = new PresenceService();
  presence.touch({ userId: 'visitor', nickname: '방문자', avatar: '🦊' }, 'PLATFORM');
  presence.touch({ userId: 'player', nickname: '플레이어', avatar: '🐯' }, 'moon-yut:PLAYING');
  assert.equal(presence.remove('visitor', 'PLATFORM'), true);
  assert.equal(presence.remove('player', 'PLATFORM'), false);
  assert.equal(presence.list().length, 1);
});

test('closing one of a user\'s platform tabs keeps their other tab online', () => {
  const presence = new PresenceService();
  const user = { userId: 'two-tabs', nickname: '두 탭', avatar: '🦊' };
  presence.connect(user, 'socket-a');
  presence.connect(user, 'socket-b');
  assert.equal(presence.disconnect(user, 'socket-a'), false);
  assert.equal(presence.list().length, 1);
  assert.equal(presence.disconnect(user, 'socket-b'), true);
  assert.equal(presence.list().length, 0);
});
