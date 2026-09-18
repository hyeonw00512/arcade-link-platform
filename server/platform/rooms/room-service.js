import crypto from 'node:crypto';

const ROOM_STATUS = Object.freeze({ WAITING: 'WAITING', PLAYING: 'PLAYING', FINISHED: 'FINISHED' });

export class RoomService {
  constructor(games, modules = null, initialRooms = [], onChange = () => {}) {
    this.games = games;
    this.modules = modules;
    this.rooms = new Map(initialRooms
      .filter((room) => room?.roomId && room?.inviteCode && Array.isArray(room.players))
      .map((room) => [room.roomId, {
        ...room,
        players: room.players.map((player) => ({ ...player, connected: false }))
      }]));
    this.onChange = onChange;
  }

  create({ gameId, session, isPrivate = false, maxPlayers }) {
    const game = this.games.find((item) => item.id === gameId);
    if (!game) throw new Error('선택한 게임을 찾을 수 없습니다.');
    const capacity = Math.max(game.minPlayers, Math.min(Number(maxPlayers) || game.maxPlayers, game.maxPlayers));
    const room = {
      roomId: crypto.randomUUID(),
      inviteCode: this.uniqueCode(),
      gameType: game.id,
      hostId: session.userId,
      players: [this.playerFrom(session)],
      maxPlayers: capacity,
      status: ROOM_STATUS.WAITING,
      isPrivate: Boolean(isPrivate),
      createdAt: new Date().toISOString(),
      gameOptions: {},
      messages: []
    };
    this.rooms.set(room.roomId, room);
    this.persist();
    return room;
  }

  join({ inviteCode, session }) {
    const code = String(inviteCode || '').trim().toUpperCase();
    const room = [...this.rooms.values()].find((item) => item.inviteCode === code);
    if (!room) throw new Error('방 코드를 확인해 주세요.');
    const existing = room.players.find((player) => player.userId === session.userId);
    if (existing) {
      existing.connected = true;
      this.persist();
      return room;
    }
    if (room.status !== ROOM_STATUS.WAITING) throw new Error('이미 게임이 시작된 방입니다.');
    if (room.players.length >= room.maxPlayers) throw new Error('방이 가득 찼습니다.');
    room.players.push(this.playerFrom(session));
    this.persist();
    return room;
  }

  reconnect(roomId, session) {
    const room = this.rooms.get(roomId);
    const player = room?.players.find((item) => item.userId === session.userId);
    if (!room || !player) return null;
    player.connected = true;
    this.persist();
    return room;
  }

  disconnect(userId) {
    const room = this.findByUser(userId);
    const player = room?.players.find((item) => item.userId === userId);
    if (player) player.connected = false;
    if (player) this.persist();
    return room;
  }

  leave(userId) {
    const room = this.findByUser(userId);
    if (!room) return null;
    room.players = room.players.filter((player) => player.userId !== userId);
    if (!room.players.length) {
      this.rooms.delete(room.roomId);
      this.persist();
      return { room, deleted: true };
    }
    if (room.hostId === userId) room.hostId = room.players[0].userId;
    this.persist();
    return { room, deleted: false };
  }

  toggleReady(roomId, userId, ready) {
    const room = this.requireRoom(roomId);
    if (room.status !== ROOM_STATUS.WAITING) throw new Error('대기 중인 방에서만 준비할 수 있습니다.');
    const player = this.requirePlayer(room, userId);
    if (room.hostId === userId) throw new Error('방장은 준비 대신 게임을 시작합니다.');
    player.ready = Boolean(ready);
    this.persist();
    return room;
  }

  start(roomId, userId) {
    const room = this.requireRoom(roomId);
    const game = this.games.find((item) => item.id === room.gameType);
    if (room.hostId !== userId) throw new Error('방장만 게임을 시작할 수 있습니다.');
    if (room.status !== ROOM_STATUS.WAITING) throw new Error('이미 시작된 방입니다.');
    if (room.players.length < game.minPlayers) throw new Error(`최소 ${game.minPlayers}명이 필요합니다.`);
    const guests = room.players.filter((player) => player.userId !== room.hostId);
    if (!guests.every((player) => player.ready)) throw new Error('모든 참가자가 준비해야 합니다.');
    room.status = ROOM_STATUS.PLAYING;
    room.startedAt = new Date().toISOString();
    const gameModule = this.modules?.get(room.gameType);
    if (gameModule) {
      room.game = gameModule.startGame(gameModule.createGame({ room }));
    }
    this.persist();
    return room;
  }

  addMessage(roomId, session, text) {
    const room = this.requireRoom(roomId);
    this.requirePlayer(room, session.userId);
    const cleanText = typeof text === 'string' ? text.trim().slice(0, 300) : '';
    if (!cleanText) throw new Error('메시지를 입력해 주세요.');
    const message = {
      id: crypto.randomUUID(),
      userId: session.userId,
      nickname: session.nickname,
      avatar: session.avatar,
      text: cleanText,
      createdAt: new Date().toISOString()
    };
    room.messages.push(message);
    room.messages = room.messages.slice(-100);
    this.persist();
    return message;
  }

  updatePlayerProfile(userId, { nickname, avatar }) {
    const room = this.findByUser(userId);
    const player = room?.players.find((item) => item.userId === userId);
    if (!room || !player) return null;
    player.nickname = nickname;
    player.avatar = avatar;
    this.persist();
    return room;
  }

  findByUser(userId) {
    return [...this.rooms.values()].find((room) => room.players.some((player) => player.userId === userId));
  }

  publicState(room) {
    if (!room) return null;
    const publicGame = room.game ? this.modules?.getPublicState(room.gameType, room.game) : null;
    return { ...room, game: publicGame, messages: room.messages.slice(-50) };
  }

  requireRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('방을 찾을 수 없습니다.');
    return room;
  }

  requirePlayer(room, userId) {
    const player = room.players.find((item) => item.userId === userId);
    if (!player) throw new Error('이 방의 참가자가 아닙니다.');
    return player;
  }

  playerFrom(session) {
    return { userId: session.userId, nickname: session.nickname, avatar: session.avatar, ready: false, connected: true };
  }

  uniqueCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    do {
      code = Array.from({ length: 6 }, () => chars[crypto.randomInt(chars.length)]).join('');
    } while ([...this.rooms.values()].some((room) => room.inviteCode === code));
    return code;
  }

  exportState() {
    return [...this.rooms.values()];
  }

  persist() {
    this.onChange();
  }
}
