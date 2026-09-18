import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlatformBridge } from '../shared/platform-bridge/index.js';

test('platform bridge exposes only safe room information', () => {
  const bridge = createPlatformBridge({
    gameId: 'sabotaji', baseUrl: 'https://sabotaji.example.com',
    capabilities: { canSpectate: true, canReserveNextRound: true },
    listRooms: () => [{ id: 'A7K92D', passwordHash: 'secret', players: [{}, {}], spectators: [{}], status: 'PLAYING' }],
    mapRoom: (room) => ({ roomCode: room.id, playerCount: room.players.length, maxPlayers: 8, spectatorCount: room.spectators.length, status: room.status, requiresPassword: Boolean(room.passwordHash) })
  });
  const state = bridge.publicState();
  assert.equal(state.rooms[0].joinUrl, 'https://sabotaji.example.com/?room=A7K92D');
  assert.equal(state.rooms[0].canReserveNextRound, true);
  assert.equal('passwordHash' in state.rooms[0], false);
});
