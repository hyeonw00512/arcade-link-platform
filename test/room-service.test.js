import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomService } from '../server/platform/rooms/room-service.js';
import { SessionStore } from '../server/platform/auth/session-store.js';

const games = [{ id: 'test', minPlayers: 2, maxPlayers: 4 }];
const user = (id) => ({ userId: id, nickname: `user-${id}`, avatar: '🧪' });

test('room flow validates readiness and host authority', () => {
  const rooms = new RoomService(games);
  const room = rooms.create({ gameId: 'test', session: user('host') });
  rooms.join({ inviteCode: room.inviteCode, session: user('guest') });
  assert.throws(() => rooms.start(room.roomId, 'guest'), /방장/);
  assert.throws(() => rooms.start(room.roomId, 'host'), /준비/);
  rooms.toggleReady(room.roomId, 'guest', true);
  rooms.start(room.roomId, 'host');
  assert.equal(room.status, 'PLAYING');
});

test('leaving host transfers ownership and final leave deletes room', () => {
  const rooms = new RoomService(games);
  const room = rooms.create({ gameId: 'test', session: user('host') });
  rooms.join({ inviteCode: room.inviteCode, session: user('guest') });
  const first = rooms.leave('host');
  assert.equal(first.room.hostId, 'guest');
  const last = rooms.leave('guest');
  assert.equal(last.deleted, true);
  assert.equal(rooms.rooms.size, 0);
});

test('restored rooms mark players offline until they reconnect', () => {
  const initialRooms = [{
    roomId: 'saved-room',
    inviteCode: 'ABC123',
    players: [{ ...user('host'), connected: true }]
  }];
  const rooms = new RoomService(games, null, initialRooms);

  assert.equal(rooms.rooms.get('saved-room').players[0].connected, false);
});

test('guest profile only accepts a valid nickname and avatar', () => {
  const sessions = new SessionStore();
  const session = sessions.create();
  const updated = sessions.updateProfile(session.sessionToken, { nickname: '  새로운   이름 ', avatar: '🦄' });

  assert.equal(updated.nickname, '새로운 이름');
  assert.equal(updated.avatar, '🦄');
  assert.throws(() => sessions.updateProfile(session.sessionToken, { nickname: '', avatar: '🦄' }), /닉네임/);
  assert.throws(() => sessions.updateProfile(session.sessionToken, { nickname: '이름', avatar: '❌' }), /아바타/);
});
