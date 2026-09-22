import test, { after, afterEach, before } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, rmSync } from 'node:fs';
import { io as createClient } from 'socket.io-client';

process.env.NODE_ENV = 'test';
const testStateFile = `${process.cwd()}/data/test-platform-state-${process.pid}.json`;
process.env.PLATFORM_DATA_FILE = testStateFile;
const { httpServer, io } = await import('../server/index.js');

let serverUrl;
const clients = [];

function connect() {
  const socket = createClient(serverUrl, { transports: ['websocket'], forceNew: true });
  clients.push(socket);
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

function ask(socket, event, payload = {}) {
  return new Promise((resolve, reject) => {
    socket.timeout(3_000).emit(event, payload, (error, response) => {
      if (error) return reject(error);
      if (!response) return reject(new Error(`${event} did not return an acknowledgement.`));
      resolve(response);
    });
  });
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

before(async () => {
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = httpServer.address();
  serverUrl = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  clients.splice(0).forEach((socket) => socket.disconnect());
  await wait(50);
});

after(async () => {
  clients.forEach((socket) => socket.disconnect());
  await new Promise((resolve) => httpServer.close(resolve));
  await wait(100);
  rmSync(testStateFile, { force: true });
  for (const fileName of readdirSync(`${process.cwd()}/data`)) {
    if (fileName.startsWith(`test-platform-state-${process.pid}.json.`) && fileName.endsWith('.tmp')) rmSync(`${process.cwd()}/data/${fileName}`, { force: true });
  }
});

test('moving to a new room stops old-room chat delivery', async () => {
  const firstHost = await connect();
  const oldRoomGuest = await connect();
  await ask(firstHost, 'platform:session:resume');
  await ask(oldRoomGuest, 'platform:session:resume');

  const oldRoom = await ask(firstHost, 'platform:room:create', { gameId: 'neon-dice', maxPlayers: 2 });
  await ask(oldRoomGuest, 'platform:room:join', { inviteCode: oldRoom.room.inviteCode });
  await ask(firstHost, 'platform:room:create', { gameId: 'neon-dice', maxPlayers: 2 });
  assert.equal(io.sockets.adapter.rooms.get(oldRoom.room.roomId)?.has(firstHost.id) ?? false, false);

  const receivedMessages = [];
  firstHost.on('platform:chat:message', (message) => receivedMessages.push(message));
  await ask(oldRoomGuest, 'platform:chat:send', { text: '이전 방 메시지' });
  await wait(250);

  assert.equal(receivedMessages.length, 0);
});

test('a failed new-room request keeps the player in the current room', async () => {
  const host = await connect();
  const guest = await connect();
  await ask(host, 'platform:session:resume');
  await ask(guest, 'platform:session:resume');

  const room = await ask(host, 'platform:room:create', { gameId: 'neon-dice', maxPlayers: 2 });
  await ask(guest, 'platform:room:join', { inviteCode: room.room.inviteCode });
  const failedCreate = await ask(host, 'platform:room:create', { gameId: 'not-a-game', maxPlayers: 2 });
  assert.equal(failedCreate.ok, false);

  const receivedMessages = [];
  host.on('platform:chat:message', (message) => receivedMessages.push(message));
  await ask(guest, 'platform:chat:send', { text: '현재 방 메시지' });
  await wait(250);

  assert.equal(receivedMessages.length, 1);
  assert.equal(receivedMessages[0].text, '현재 방 메시지');
});

test('profile updates are saved and broadcast to room participants', async () => {
  const host = await connect();
  const guest = await connect();
  const hostSession = await ask(host, 'platform:session:resume');
  await ask(guest, 'platform:session:resume');
  const room = await ask(host, 'platform:room:create', { gameId: 'neon-dice', maxPlayers: 2 });
  await ask(guest, 'platform:room:join', { inviteCode: room.room.inviteCode });

  const nextRoomState = new Promise((resolve) => guest.once('platform:room:state', resolve));
  const response = await ask(host, 'platform:profile:update', { nickname: '테스트 방장', avatar: '🦄' });
  const updatedRoom = await nextRoomState;

  assert.equal(response.session.nickname, '테스트 방장');
  assert.equal(updatedRoom.players.find((player) => player.userId === hostSession.session.userId).avatar, '🦄');
});
