import crypto from 'node:crypto';

export const AVATARS = Object.freeze(['🦊', '🐼', '🐯', '🐸', '🐙', '🦄', '🐧', '🐨']);
const ADJECTIVES = ['빛나는', '재빠른', '용감한', '고요한', '즐거운', '영리한'];
const NOUNS = ['여우', '판다', '호랑이', '펭귄', '수달', '고래'];

export class SessionStore {
  constructor(ttlDays = 30, initialSessions = [], onChange = () => {}) {
    this.sessions = new Map(initialSessions
      .filter((session) => session?.sessionToken && session?.userId && session.expiresAt > Date.now())
      .map((session) => [session.sessionToken, session]));
    this.ttlMs = ttlDays * 24 * 60 * 60 * 1000;
    this.onChange = onChange;
  }

  create(nickname) {
    const userId = crypto.randomUUID();
    const requestedNickname = this.cleanNickname(nickname);
    if (requestedNickname) this.assertNicknameAvailable(requestedNickname);
    const session = {
      userId,
      sessionToken: crypto.randomBytes(32).toString('base64url'),
      nickname: requestedNickname || this.randomNickname(),
      avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
      roomId: null,
      expiresAt: Date.now() + this.ttlMs
    };
    this.sessions.set(session.sessionToken, session);
    this.persist();
    return this.publicSession(session);
  }

  resume(token) {
    const session = this.sessions.get(token);
    if (!session || session.expiresAt < Date.now()) {
      if (session) this.sessions.delete(token);
      return null;
    }
    session.expiresAt = Date.now() + this.ttlMs;
    this.persist();
    return session;
  }

  attachRoom(token, roomId) {
    const session = this.sessions.get(token);
    if (session) {
      session.roomId = roomId;
      this.persist();
    }
  }

  updateProfile(token, { nickname, avatar } = {}) {
    const session = this.sessions.get(token);
    if (!session) throw new Error('세션을 찾을 수 없습니다. 다시 연결해 주세요.');
    const cleanNickname = this.cleanNickname(nickname);
    if (!cleanNickname) throw new Error('닉네임을 1자 이상 입력해 주세요.');
    if (!AVATARS.includes(avatar)) throw new Error('선택할 수 없는 아바타입니다.');
    this.assertNicknameAvailable(cleanNickname, session.sessionToken);
    session.nickname = cleanNickname;
    session.avatar = avatar;
    this.persist();
    return session;
  }

  publicSession(session) {
    return {
      userId: session.userId,
      sessionToken: session.sessionToken,
      nickname: session.nickname,
      avatar: session.avatar,
      roomId: session.roomId
    };
  }

  cleanNickname(value) {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 16) : '';
  }

  nicknameKey(nickname) {
    return this.cleanNickname(nickname).normalize('NFC').toLocaleLowerCase('ko-KR');
  }

  assertNicknameAvailable(nickname, currentToken = null) {
    const key = this.nicknameKey(nickname);
    const now = Date.now();
    const alreadyUsed = [...this.sessions.entries()].some(([token, session]) =>
      token !== currentToken && session.expiresAt > now && this.nicknameKey(session.nickname) === key
    );
    if (alreadyUsed) throw new Error('이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해 주세요.');
  }

  randomNickname() {
    // Guest sessions created before the welcome prompt still need a unique
    // visible name, so a short discriminator is included from the beginning.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
      const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
      const candidate = `${adjective} ${noun} ${crypto.randomInt(1000, 10000)}`;
      try {
        this.assertNicknameAvailable(candidate);
        return candidate;
      } catch { /* Try another generated nickname. */ }
    }
    // UUID suffix makes a collision practically impossible even under load.
    return `플레이어 ${crypto.randomUUID().slice(0, 8)}`;
  }

  exportState() {
    return [...this.sessions.values()];
  }

  persist() {
    this.onChange();
  }
}
