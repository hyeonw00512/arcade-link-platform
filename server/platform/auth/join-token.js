import crypto from 'node:crypto';

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

export function createJoinToken({ gameId, roomCode, nickname, userId, mode = 'PLAYER' }, secret) {
  if (!secret) throw new Error('PLATFORM_JOIN_SECRET 환경 변수가 필요합니다.');
  const payload = { gameId, roomCode, nickname, userId, mode, exp: Date.now() + 5 * 60 * 1000 };
  const body = encode(payload);
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}
