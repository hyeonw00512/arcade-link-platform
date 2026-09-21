import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveRoomService } from '../server/platform/games/live-room-service.js';

test('live room service normalizes game room status and access actions', async () => {
  const service = new LiveRoomService(async () => ({
    ok: true,
    json: async () => ({
      gameId: 'demo',
      capabilities: { canSpectate: true, canReserveNextRound: true },
      rooms: [
        { roomCode: 'open1', hostNickname: '방장', playerCount: 2, maxPlayers: 4, status: 'WAITING', canJoin: true, joinUrl: 'https://example.test/?room=OPEN1' },
        { roomCode: 'play1', hostNickname: '진행방', playerCount: 3, maxPlayers: 4, status: 'PLAYING', joinUrl: 'https://example.test/?room=PLAY1' }
      ]
    })
  }));
  const [result] = await service.list([{ id: 'demo', statusUrl: 'https://example.test/rooms' }]);
  assert.equal(result.available, true);
  assert.equal(result.rooms[0].status, 'WAITING');
  assert.equal(result.rooms[0].canJoin, true);
  assert.equal(result.rooms[0].canSpectate, true);
  assert.equal(result.rooms[1].canReserveNextRound, true);
});
