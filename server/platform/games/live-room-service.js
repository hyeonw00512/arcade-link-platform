export class LiveRoomService {
  constructor(fetcher = fetch, { timeoutMs = 12_000 } = {}) {
    this.fetcher = fetcher;
    this.timeoutMs = timeoutMs;
    this.cache = new Map();
  }

  async list(games) {
    const results = await Promise.all(games.filter((game) => game.statusUrl).map((game) => this.fetchGame(game)));
    return results;
  }

  async fetchGame(game) {
    try {
      const response = await this.fetcher(game.statusUrl, { signal: AbortSignal.timeout(this.timeoutMs), headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (payload.gameId !== game.id || !Array.isArray(payload.rooms)) throw new Error('응답 형식이 올바르지 않습니다.');
      const result = {
        gameId: game.id,
        available: true,
        stale: false,
        updatedAt: payload.updatedAt || new Date().toISOString(),
        rooms: payload.rooms.map((room) => normalizeRoom(room, payload.capabilities))
      };
      this.cache.set(game.id, result);
      return result;
    } catch {
      const cached = this.cache.get(game.id);
      if (cached) return { ...cached, stale: true };
      return { gameId: game.id, available: false, stale: false, rooms: [] };
    }
  }
}

function normalizeRoom(room, capabilities = {}) {
  const status = ['WAITING', 'PLAYING', 'FINISHED'].includes(room.status) ? room.status : 'WAITING';
  const playerCount = Math.max(0, Number(room.playerCount) || 0);
  const maxPlayers = Math.max(playerCount, Number(room.maxPlayers) || playerCount);
  const hasSpace = playerCount < maxPlayers;
  const canSpectate = Boolean(room.canSpectate ?? capabilities.canSpectate);
  const canReserveNextRound = Boolean(room.canReserveNextRound ?? capabilities.canReserveNextRound) && status === 'PLAYING' && hasSpace;
  return {
    roomCode: String(room.roomCode || '').trim().toUpperCase(),
    hostNickname: String(room.hostNickname || '알 수 없음').slice(0, 20),
    playerCount,
    maxPlayers,
    spectatorCount: Math.max(0, Number(room.spectatorCount) || 0),
    status,
    visibility: room.visibility === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC',
    requiresPassword: Boolean(room.requiresPassword),
    canJoin: Boolean(room.canJoin) && status === 'WAITING' && hasSpace,
    canSpectate,
    canReserveNextRound,
    joinUrl: String(room.joinUrl || '')
  };
}
