export const PLATFORM_BRIDGE_VERSION = 1;

const validStatuses = new Set(['WAITING', 'PLAYING', 'FINISHED']);

export function buildRoomJoinUrl(baseUrl, roomCode) {
  const url = new URL(baseUrl);
  url.searchParams.set('room', roomCode);
  return url.toString();
}

/**
 * Maps a game's own room model to the small, safe public shape consumed by
 * Arcade Link. Game secrets (passwords, roles, cards and private state) must
 * never be returned by listRooms.
 */
export function createPlatformBridge({ gameId, baseUrl, listRooms, mapRoom, capabilities = {} }) {
  if (!gameId || !baseUrl || typeof listRooms !== 'function' || typeof mapRoom !== 'function') {
    throw new Error('gameId, baseUrl, listRooms, mapRoom이 필요합니다.');
  }
  return {
    gameId,
    capabilities: {
      canSpectate: Boolean(capabilities.canSpectate),
      canReserveNextRound: Boolean(capabilities.canReserveNextRound)
    },
    publicState() {
      const rooms = listRooms().map((room) => normalizeRoom({ ...mapRoom(room), gameId, baseUrl, capabilities }));
      return { version: PLATFORM_BRIDGE_VERSION, gameId, updatedAt: new Date().toISOString(), capabilities: this.capabilities, rooms };
    }
  };
}

export function normalizeRoom(room) {
  const roomCode = String(room.roomCode || '').trim().toUpperCase();
  const playerCount = Number(room.playerCount);
  const maxPlayers = Number(room.maxPlayers);
  if (!roomCode || !Number.isInteger(playerCount) || !Number.isInteger(maxPlayers) || playerCount < 0 || maxPlayers < playerCount) {
    throw new Error('공개 방 정보가 올바르지 않습니다.');
  }
  const status = validStatuses.has(room.status) ? room.status : 'WAITING';
  return {
    roomCode,
    hostNickname: String(room.hostNickname || '알 수 없음').slice(0, 20),
    playerCount,
    maxPlayers,
    spectatorCount: Math.max(0, Number(room.spectatorCount) || 0),
    status,
    requiresPassword: Boolean(room.requiresPassword),
    canJoin: status === 'WAITING' && playerCount < maxPlayers,
    canSpectate: Boolean(room.capabilities?.canSpectate),
    canReserveNextRound: Boolean(room.capabilities?.canReserveNextRound) && status === 'PLAYING' && playerCount < maxPlayers,
    joinUrl: buildRoomJoinUrl(room.baseUrl, roomCode)
  };
}
