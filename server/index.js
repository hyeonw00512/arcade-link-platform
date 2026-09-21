import 'node:process';
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'node:url';
import { loadGameCatalog } from './platform/games/catalog.js';
import { SessionStore } from './platform/auth/session-store.js';
import { RoomService } from './platform/rooms/room-service.js';
import { registerPlatformEvents } from './platform/socket/register-platform-events.js';
import { FileStateStore } from './platform/storage/file-state-store.js';
import { LiveRoomService } from './platform/games/live-room-service.js';
import { createJoinToken } from './platform/auth/join-token.js';
import { createActivityToken, verifyActivityToken } from './platform/auth/activity-token.js';
import { PresenceService } from './platform/presence/presence-service.js';

const clientDir = fileURLToPath(new URL('../client', import.meta.url));
const games = await loadGameCatalog();
const liveRooms = new LiveRoomService();
const presence = new PresenceService();
const stateStore = new FileStateStore();
const restoredState = stateStore.load();
let sessions;
let rooms;
const persistState = () => stateStore.save({ sessions: sessions.exportState(), rooms: rooms.exportState() });
sessions = new SessionStore(Number(process.env.SESSION_TTL_DAYS) || 30, restoredState.sessions, persistState);
rooms = new RoomService(games, null, restoredState.rooms, persistState);
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_ORIGIN || '*' },
  transports: ['websocket', 'polling']
});

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.get('/api/health', (_req, res) => res.json({ ok: true, games: games.length }));
app.get('/api/games', (_req, res) => res.json(games));
app.get('/api/live-rooms', async (_req, res) => res.json(await liveRooms.list(games)));
app.get('/api/presence', (_req, res) => res.json({ online: presence.list() }));
app.options('/api/activity', (_req, res) => res
  .set('access-control-allow-origin', '*')
  .set('access-control-allow-methods', 'POST, OPTIONS')
  .set('access-control-allow-headers', 'content-type')
  .sendStatus(204));
app.post('/api/activity', (req, res) => {
  try {
    const payload = verifyActivityToken(req.body?.token, process.env.PLATFORM_JOIN_SECRET);
    const status = String(req.body?.status || 'LOBBY').toUpperCase();
    if (!['LOBBY', 'PLAYING', 'SPECTATING'].includes(status)) throw new Error('활동 상태가 올바르지 않습니다.');
    presence.touch(payload, `${payload.gameId}:${status}`);
    res.set('access-control-allow-origin', '*').json({ ok: true });
  } catch (error) { res.set('access-control-allow-origin', '*').status(400).json({ message: error.message }); }
});
app.post('/api/join-link', (req, res) => {
  try {
    const { sessionToken, gameId, roomCode, mode } = req.body || {};
    const session = sessions.resume(sessionToken);
    const game = games.find((item) => item.id === gameId && item.enabled && item.playUrl);
    if (!session || !game || !/^[A-Z0-9]{5,8}$/i.test(String(roomCode || ''))) throw new Error('입장 정보를 확인해 주세요.');
    const joinMode = mode === 'SPECTATOR' || mode === 'RESERVE' ? 'SPECTATOR' : 'PLAYER';
    const token = createJoinToken({ gameId, roomCode: String(roomCode).toUpperCase(), nickname: session.nickname, userId: session.userId, mode: joinMode }, process.env.PLATFORM_JOIN_SECRET);
    const url = new URL(game.playUrl);
    url.searchParams.set('platformActivityToken', createActivityToken({ userId: session.userId, nickname: session.nickname, avatar: session.avatar, gameId }, process.env.PLATFORM_JOIN_SECRET));
    url.searchParams.set('room', String(roomCode).toUpperCase());
    url.searchParams.set('joinToken', token);
    const platformUrl = req.get('origin') || process.env.PUBLIC_APP_URL;
    if (platformUrl && /^https?:\/\//i.test(platformUrl)) url.searchParams.set('platformUrl', platformUrl);
    if (mode === 'RESERVE') url.searchParams.set('reserveNextRound', '1');
    res.json({ url: url.toString() });
  } catch (error) { res.status(400).json({ message: error.message }); }
});
app.post('/api/game-launch-link', (req, res) => {
  try {
    const { sessionToken, gameId } = req.body || {};
    const session = sessions.resume(sessionToken);
    const game = games.find((item) => item.id === gameId && item.enabled && item.playUrl);
    if (!session || !game) throw new Error('게임 실행 정보를 확인해 주세요.');
    const url = new URL(game.playUrl);
    url.searchParams.set('platformNickname', session.nickname);
    url.searchParams.set('platformActivityToken', createActivityToken({
      userId: session.userId,
      nickname: session.nickname,
      avatar: session.avatar,
      gameId
    }, process.env.PLATFORM_JOIN_SECRET));
    const platformUrl = req.get('origin') || process.env.PUBLIC_APP_URL;
    if (platformUrl && /^https?:\/\//i.test(platformUrl)) url.searchParams.set('platformUrl', platformUrl);
    res.json({ url: url.toString() });
  } catch (error) { res.status(400).json({ message: error.message }); }
});
app.use(express.static(clientDir));
app.get('/{*path}', (_req, res) => res.sendFile('index.html', { root: clientDir }));

io.on('connection', (socket) => registerPlatformEvents(io, socket, {
  sessions,
  rooms,
  games,
  presence,
  publicAppUrl: process.env.PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 3000}`
}));

const port = Number(process.env.PORT) || 3000;
if (process.env.NODE_ENV !== 'test') {
  httpServer.listen(port, () => console.log(`Arcade Link running at http://localhost:${port}`));
}

export { app, httpServer, io, games, rooms, sessions, liveRooms };
