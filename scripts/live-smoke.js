import { io } from 'socket.io-client';
import assert from 'node:assert/strict';

const URL = process.env.TEST_SERVER_URL || 'http://localhost:3000';
const connect = () => io(URL, { transports: ['websocket'], forceNew: true });
const ask = (socket, event, payload = {}) => new Promise((resolve, reject) => {
  socket.timeout(3000).emit(event, payload, (error, response) => error ? reject(error) : resolve(response));
});

const host = connect();
const guest = connect();

try {
  const hostSession = await ask(host, 'platform:session:resume');
  const guestSession = await ask(guest, 'platform:session:resume');
  assert.equal(hostSession.ok, true);
  assert.equal(guestSession.ok, true);

  const created = await ask(host, 'platform:room:create', { gameId: 'neon-dice', maxPlayers: 5 });
  assert.equal(created.ok, true);
  assert.equal(created.room.players.length, 1);

  const joined = await ask(guest, 'platform:room:join', { inviteCode: created.room.inviteCode });
  assert.equal(joined.room.players.length, 2);
  assert.equal((await ask(guest, 'platform:player:ready', { ready: true })).ok, true);
  assert.equal((await ask(host, 'platform:game:start')).ok, true);

  console.log(`live socket flow passed: ${created.room.inviteCode}`);
} finally {
  host.disconnect();
  guest.disconnect();
}
