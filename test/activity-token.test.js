import assert from 'node:assert/strict';
import test from 'node:test';
import { createActivityToken, verifyActivityToken } from '../server/platform/auth/activity-token.js';

test('activity token only accepts an untampered, unexpired platform identity', () => {
  const secret = 'local-test-secret';
  const token = createActivityToken({ userId: 'user-1', nickname: '테스터', avatar: '🦊', gameId: 'moon-yut' }, secret);
  assert.deepEqual(verifyActivityToken(token, secret).gameId, 'moon-yut');
  assert.throws(() => verifyActivityToken(`${token}x`, secret), /올바르지 않습니다/);
});
