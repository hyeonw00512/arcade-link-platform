import crypto from 'node:crypto';

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

export function createActivityToken({ userId, nickname, avatar, gameId }, secret) {
  if (!secret) throw new Error('PLATFORM_JOIN_SECRET 환경 변수가 필요합니다.');
  const body = encode({ userId, nickname, avatar, gameId, exp: Date.now() + 12 * 60 * 60 * 1000 });
  return `${body}.${crypto.createHmac('sha256', secret).update(body).digest('base64url')}`;
}

export function verifyActivityToken(token, secret) {
  const [body, signature] = String(token || '').split('.');
  if (!body || !signature || !secret) throw new Error('활동 토큰을 확인할 수 없습니다.');
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const left = Buffer.from(signature), right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) throw new Error('활동 토큰이 올바르지 않습니다.');
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (!payload.userId || !payload.nickname || !payload.gameId || Number(payload.exp) <= Date.now()) throw new Error('활동 토큰이 만료되었습니다.');
  return payload;
}
