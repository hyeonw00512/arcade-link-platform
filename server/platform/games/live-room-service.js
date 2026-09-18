export class LiveRoomService {
  constructor(fetcher = fetch) {
    this.fetcher = fetcher;
  }

  async list(games) {
    const results = await Promise.all(games.filter((game) => game.statusUrl).map((game) => this.fetchGame(game)));
    return results;
  }

  async fetchGame(game) {
    try {
      const response = await this.fetcher(game.statusUrl, { signal: AbortSignal.timeout(3_000), headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (payload.gameId !== game.id || !Array.isArray(payload.rooms)) throw new Error('응답 형식이 올바르지 않습니다.');
      return { gameId: game.id, available: true, rooms: payload.rooms };
    } catch {
      return { gameId: game.id, available: false, rooms: [] };
    }
  }
}
