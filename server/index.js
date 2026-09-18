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

const clientDir = fileURLToPath(new URL('../client', import.meta.url));
const games = await loadGameCatalog();
const liveRooms = new LiveRoomService();
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
app.use(express.static(clientDir));
app.get('/{*path}', (_req, res) => res.sendFile('index.html', { root: clientDir }));

io.on('connection', (socket) => registerPlatformEvents(io, socket, {
  sessions,
  rooms,
  games,
  publicAppUrl: process.env.PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 3000}`
}));

const port = Number(process.env.PORT) || 3000;
if (process.env.NODE_ENV !== 'test') {
  httpServer.listen(port, () => console.log(`Arcade Link running at http://localhost:${port}`));
}

export { app, httpServer, io, games, rooms, sessions, liveRooms };
