export class PresenceService {
  constructor(timeoutMs = 75_000) { this.timeoutMs = timeoutMs; this.entries = new Map(); }
  touch(session, status = 'PLATFORM') {
    if (!session?.userId) return;
    this.entries.set(session.userId, { userId: session.userId, nickname: session.nickname, avatar: session.avatar, status, seenAt: Date.now() });
  }
  list() {
    const cutoff = Date.now() - this.timeoutMs;
    for (const [id, entry] of this.entries) if (entry.seenAt < cutoff) this.entries.delete(id);
    return [...this.entries.values()].map(({ userId, nickname, avatar, status }) => ({ userId, nickname, avatar, status }));
  }
  summary() {
    const online = this.list();
    const statuses = { platform: 0, lobby: 0, playing: 0, spectating: 0 };
    const games = {};
    for (const entry of online) {
      if (entry.status === 'PLATFORM') { statuses.platform += 1; continue; }
      const [gameId, activity] = String(entry.status).split(':');
      if (activity === 'LOBBY') statuses.lobby += 1;
      else if (activity === 'PLAYING') statuses.playing += 1;
      else if (activity === 'SPECTATING') statuses.spectating += 1;
      if (gameId && activity) games[gameId] = (games[gameId] || 0) + 1;
    }
    return { total: online.length, statuses, games };
  }
}
