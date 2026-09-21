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
}
