import { EVENTS } from '../../../shared/protocol/events.js';

const ACK_ERROR = (error) => ({ ok: false, error: error.message || '요청을 처리하지 못했습니다.' });

export function registerPlatformEvents(io, socket, { sessions, rooms, games, publicAppUrl, presence, onPresenceChanged }) {
  let session = null;
  const attempts = [];

  const limited = () => {
    const now = Date.now();
    while (attempts.length && attempts[0] < now - 10_000) attempts.shift();
    attempts.push(now);
    return attempts.length > 30;
  };

  const guard = (handler) => (...args) => {
    const ack = typeof args.at(-1) === 'function' ? args.pop() : () => {};
    try {
      if (limited()) throw new Error('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
      if (!session) throw new Error('세션 연결이 필요합니다.');
      const operation = handler(...args, ack);
      if (operation?.catch) operation.catch((error) => ack(ACK_ERROR(error)));
    } catch (error) {
      ack(ACK_ERROR(error));
    }
  };

  socket.on(EVENTS.SESSION_RESUME, (payload = {}, ack = () => {}) => {
    try {
      session = sessions.resume(payload.sessionToken) || sessions.create(payload.nickname);
      presence?.connect(session, socket.id);
      onPresenceChanged?.();
      if (!sessions.resume(session.sessionToken)) session = sessions.resume(session.sessionToken);
      const restoredRoom = session.roomId ? rooms.reconnect(session.roomId, session) : null;
      if (restoredRoom) socket.join(restoredRoom.roomId);
      ack({ ok: true, session: sessions.publicSession(session), room: rooms.publicState(restoredRoom), games });
      if (restoredRoom) io.to(restoredRoom.roomId).emit(EVENTS.ROOM_STATE, rooms.publicState(restoredRoom));
    } catch (error) {
      ack(ACK_ERROR(error));
    }
  });

  // A connected Socket.IO session alone is not enough to distinguish an open
  // platform tab from a backgrounded or abandoned browser. The client sends a
  // small heartbeat while it is visible so the online list naturally expires.
  socket.on(EVENTS.PRESENCE_HEARTBEAT, guard((_, ack) => {
    presence?.touch(session, 'PLATFORM');
    ack({ ok: true });
  }));

  socket.on(EVENTS.PROFILE_UPDATE, guard((payload = {}, ack) => {
    session = sessions.updateProfile(session.sessionToken, payload);
    presence?.touch(session, 'PLATFORM');
    onPresenceChanged?.();
    const room = rooms.updatePlayerProfile(session.userId, session);
    if (room) io.to(room.roomId).emit(EVENTS.ROOM_STATE, rooms.publicState(room));
    ack({ ok: true, session: sessions.publicSession(session) });
  }));

  socket.on(EVENTS.ROOM_CREATE, guard(async (payload = {}, ack) => {
    const previousRoom = rooms.findByUser(session.userId);
    const room = rooms.create({ ...payload, session });
    if (previousRoom) {
      const oldRoom = rooms.leave(session.userId);
      await socket.leave(previousRoom.roomId);
      if (oldRoom && !oldRoom.deleted) io.to(oldRoom.room.roomId).emit(EVENTS.ROOM_STATE, rooms.publicState(oldRoom.room));
    }
    sessions.attachRoom(session.sessionToken, room.roomId);
    await socket.join(room.roomId);
    ack({ ok: true, room: rooms.publicState(room), inviteUrl: `${publicAppUrl}/invite/${room.inviteCode}` });
    io.to(room.roomId).emit(EVENTS.ROOM_STATE, rooms.publicState(room));
  }));

  socket.on(EVENTS.ROOM_JOIN, guard(async (payload = {}, ack) => {
    const previousRoom = rooms.findByUser(session.userId);
    const room = rooms.join({ inviteCode: payload.inviteCode, session });
    if (previousRoom && previousRoom.roomId !== room.roomId) {
      const oldRoom = rooms.leave(session.userId);
      await socket.leave(previousRoom.roomId);
      if (oldRoom && !oldRoom.deleted) io.to(oldRoom.room.roomId).emit(EVENTS.ROOM_STATE, rooms.publicState(oldRoom.room));
    }
    sessions.attachRoom(session.sessionToken, room.roomId);
    await socket.join(room.roomId);
    ack({ ok: true, room: rooms.publicState(room), inviteUrl: `${publicAppUrl}/invite/${room.inviteCode}` });
    io.to(room.roomId).emit(EVENTS.ROOM_STATE, rooms.publicState(room));
  }));

  socket.on(EVENTS.ROOM_LEAVE, guard((_, ack) => {
    const result = rooms.leave(session.userId);
    sessions.attachRoom(session.sessionToken, null);
    if (result) socket.leave(result.room.roomId);
    if (result && !result.deleted) io.to(result.room.roomId).emit(EVENTS.ROOM_STATE, rooms.publicState(result.room));
    ack({ ok: true });
  }));

  socket.on(EVENTS.PLAYER_READY, guard((payload = {}, ack) => {
    const room = rooms.findByUser(session.userId);
    const updated = rooms.toggleReady(room?.roomId, session.userId, payload.ready);
    io.to(updated.roomId).emit(EVENTS.ROOM_STATE, rooms.publicState(updated));
    ack({ ok: true });
  }));

  socket.on(EVENTS.GAME_START, guard((_, ack) => {
    const room = rooms.findByUser(session.userId);
    const updated = rooms.start(room?.roomId, session.userId);
    io.to(updated.roomId).emit(EVENTS.ROOM_STATE, rooms.publicState(updated));
    ack({ ok: true });
  }));

  socket.on(EVENTS.CHAT_SEND, guard((payload = {}, ack) => {
    const room = rooms.findByUser(session.userId);
    const message = rooms.addMessage(room?.roomId, session, payload.text);
    io.to(room.roomId).emit(EVENTS.CHAT_MESSAGE, message);
    ack({ ok: true });
  }));
  socket.on('disconnect', () => {
    if (!session) return;
    // A game page reports its own activity. Do not erase that state when the
    // user navigates away from the platform tab; only remove platform-only
    // visitors here.
    if (presence?.disconnect(session, socket.id)) onPresenceChanged?.();
    const room = rooms.disconnect(session.userId);
    if (room) io.to(room.roomId).emit(EVENTS.ROOM_STATE, rooms.publicState(room));
  });
}
