const EVENTS = {
  SESSION_RESUME: 'platform:session:resume',
  PRESENCE_HEARTBEAT: 'platform:presence:heartbeat',
  PROFILE_UPDATE: 'platform:profile:update',
  ROOM_CREATE: 'platform:room:create',
  ROOM_JOIN: 'platform:room:join',
  ROOM_LEAVE: 'platform:room:leave',
  ROOM_STATE: 'platform:room:state',
  PLAYER_READY: 'platform:player:ready',
  GAME_START: 'platform:game:start',
  CHAT_SEND: 'platform:chat:send',
  CHAT_MESSAGE: 'platform:chat:message'
};

const ICONS = { dice: '⚄', yut: '✦', words: 'Aa', mine: '⛏', castle: '♜', clue: '🔎' };
const PROFILE_AVATARS = ['🦊', '🐼', '🐯', '🐸', '🐙', '🦄', '🐧', '🐨'];
const state = { session: null, games: [], room: null, inviteUrl: '', selectedGame: null, connected: false, liveRooms: [], online: [], presenceSummary: null, needsNickname: false };
const app = document.querySelector('#app');
const toastNode = document.querySelector('#toast');
const socket = io({ autoConnect: true, reconnection: true, reconnectionDelayMax: 4000 });
let liveRefreshTimer = null;

function emit(event, payload = {}) {
  return new Promise((resolve, reject) => {
    socket.timeout(7000).emit(event, payload, (error, response) => {
      if (error) return reject(new Error('서버 응답이 지연되고 있습니다.'));
      if (!response?.ok) return reject(new Error(response?.error || '요청을 처리하지 못했습니다.'));
      resolve(response);
    });
  });
}

function toast(message) {
  toastNode.textContent = message;
  toastNode.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => toastNode.classList.remove('show'), 2400);
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function shell(content, active = 'home', theme = 'platform') {
  const session = state.session || { avatar: '◌', nickname: '연결 중' };
  return `
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark">A</span> ARCADE LINK</div>
      <nav class="nav" aria-label="주 메뉴">
        <a href="/" data-link class="nav-item ${active === 'home' ? 'active' : ''}">⌂ 홈</a>
        <a href="#all-games" data-games-link class="nav-item ${active === 'games' ? 'active' : ''}">◇ 게임</a>
        <a href="#" class="nav-item" data-soon>♧ 친구 <span class="chip">준비 중</span></a>
        <a href="#" class="nav-item" data-soon>◎ 알림</a>
      </nav>
      <a class="sidebar-user" href="/profile" data-link aria-label="내 프로필 열기"><span class="avatar">${session.avatar}</span><div><strong>${escapeHtml(session.nickname)}</strong><div class="muted">게스트 플레이어 · 편집</div></div></a>
    </aside>
    <main class="content theme-${escapeHtml(theme)}">${content}</main>
    <nav class="mobile-nav" aria-label="모바일 메뉴">
      <a href="/" data-link><span>⌂</span>홈</a><a href="#all-games" data-games-link><span>◇</span>게임</a><a href="#" data-soon><span>♧</span>친구</a><a href="/profile" data-link class="${active === 'profile' ? 'active' : ''}"><span>${session.avatar}</span>내 정보</a>
    </nav>`;
}

function gameCard(game) {
  return `<article class="game-card game-card-${escapeHtml(game.id)}">
    <div class="game-icon">${ICONS[game.thumbnail] || '◆'}</div>
    <h3>${escapeHtml(game.name)}</h3><p>${escapeHtml(game.description)}</p>
    <div class="game-meta"><span class="chip">${game.minPlayers}–${game.maxPlayers}명</span>${game.recommendedPlayers ? `<span class="chip">권장 ${game.recommendedPlayers}명</span>` : ''}<span class="chip">모든 기기</span></div>
    <div class="card-actions"><button class="button secondary" data-game="${game.id}">방 목록 보기 →</button></div>
  </article>`;
}

function roomStatus(room) {
  if (room.status === 'PLAYING' && room.canReserveNextRound) return { label: '다음 판 참가', kind: 'next', description: '현재 게임이 끝나면 다음 판부터 참여합니다.' };
  if (room.status === 'PLAYING') return { label: '진행 중', kind: 'playing', description: room.canSpectate ? '지금은 관전으로 참여할 수 있습니다.' : '게임이 진행 중입니다.' };
  if (room.status === 'FINISHED') return { label: '게임 종료', kind: 'finished', description: '새 게임 시작을 기다리고 있습니다.' };
  if (room.playerCount >= room.maxPlayers) return { label: '인원 마감', kind: 'full', description: room.canSpectate ? '플레이어는 가득 찼습니다. 관전할 수 있습니다.' : '플레이어가 모두 찼습니다.' };
  return { label: '참가 가능', kind: 'waiting', description: '로비에서 바로 참가할 수 있습니다.' };
}

function activityLabel(status) {
  if (status === 'PLATFORM') return '플랫폼 둘러보는 중';
  const [gameId, activity] = String(status || '').split(':');
  const game = state.games.find((item) => item.id === gameId);
  const gameName = game?.name || '게임';
  const activityName = ({ LOBBY: '로비 대기', PLAYING: '플레이 중', SPECTATING: '관전 중' })[activity];
  return activityName ? `${gameName} · ${activityName}` : '플랫폼 접속 중';
}

function presenceOverview() {
  const summary = state.presenceSummary?.statuses || {};
  return [
    ['로비', summary.lobby || 0, 'lobby'],
    ['플레이', summary.playing || 0, 'playing'],
    ['관전', summary.spectating || 0, 'spectating'],
    ['플랫폼', summary.platform || 0, 'platform']
  ].filter(([, count]) => count > 0).map(([label, count, kind]) => `<span class="presence-chip ${kind}">${label} ${count}</span>`).join('');
}

function liveRoomCard(room, game, includeGame = false) {
  const status = roomStatus(room);
  return `<article class="live-room status-${status.kind}">
    ${includeGame ? `<div class="game-icon small">${ICONS[game.thumbnail] || '◆'}</div>` : ''}
    <div class="live-room-info"><div class="live-room-title"><strong>${includeGame ? `${escapeHtml(game.name)} · ` : ''}${escapeHtml(room.hostNickname)}의 방</strong><span class="room-status ${status.kind}">${status.label}</span></div>
      <p>${room.visibility === 'PRIVATE' ? '🔒 비공개' : '🌐 공개'} · ${room.playerCount}/${room.maxPlayers}명 · 관전자 ${room.spectatorCount}명${room.requiresPassword ? ' · 비밀번호 필요' : ''}</p><small>${status.description}</small></div>
    <div class="live-room-actions">${room.canJoin ? `<a class="button secondary" data-play="${game.id}" href="${escapeHtml(room.joinUrl)}">참가</a>` : ''}${room.canSpectate ? `<a class="button ghost" data-play="${game.id}" href="${escapeHtml(room.joinUrl)}">관전</a>` : ''}${room.canReserveNextRound ? `<a class="button" data-play="${game.id}" data-reserve-next href="${escapeHtml(room.joinUrl)}">다음 판 참가</a>` : ''}</div>
  </article>`;
}

function renderHome() {
  const liveRooms = state.liveRooms.flatMap((entry) => entry.rooms.map((room) => ({ ...room, game: state.games.find((game) => game.id === entry.gameId) }))).filter((item) => item.game);
  const roomGame = state.room && state.games.find((game) => game.id === state.room.gameType);
  app.innerHTML = shell(`
    <header class="topbar"><div><p class="eyebrow">PLAY TOGETHER</p><h1>오늘은 무엇을<br>같이 해볼까요?</h1><p class="muted">PC와 모바일에서 같은 게임방으로 바로 만나요.</p></div><button class="button" data-scroll-games>게임 고르기</button></header>
    ${state.room ? `<section class="section"><div class="section-head"><h2>참여 중인 방</h2></div><div class="resume-card"><div><span class="chip">${state.room.status === 'WAITING' ? '로비 대기 중' : '게임 시작됨'}</span><h3 style="margin-top:12px">${escapeHtml(roomGame?.name || state.room.gameType)}</h3><p class="muted">방 코드 ${state.room.inviteCode} · ${state.room.players.length}/${state.room.maxPlayers}명</p></div><button class="button" data-resume-room>방으로 돌아가기</button></div></section>` : ''}
    <section class="quick-start" aria-label="게임 시작 안내"><div class="quick-start-title"><span aria-hidden="true">✦</span><div><strong>플랫폼에서 방을 찾아 바로 시작하세요</strong><p>공개 방은 여기서 참가·관전하고, 새 방은 게임별 규칙을 정한 뒤 초대 링크로 친구를 부릅니다.</p></div></div><ol><li><span>1</span>게임 선택</li><li><span>2</span>방 참가 또는 생성</li><li><span>3</span>함께 플레이</li></ol></section>
    ${liveRooms.length ? `<section class="section"><div class="section-head"><div><p class="eyebrow">LIVE ROOMS</p><h2>지금 열려 있는 방</h2></div><span class="muted">참가 · 관전 · 다음 판 상태</span></div><div class="live-room-list">${liveRooms.map((item) => liveRoomCard(item, item.game, true)).join('')}</div></section>` : ''}
    <section class="section"><div class="section-head"><div><p class="eyebrow">ONLINE NOW</p><h2>함께 접속 중인 사용자</h2><div class="presence-overview">${presenceOverview() || '<span class="presence-chip platform">접속 현황 수집 중</span>'}</div></div><span class="chip">${state.online.length}명 온라인</span></div><div class="online-list">${state.online.length ? state.online.map((user) => `<div class="online-user"><span class="avatar">${user.avatar}</span><div><strong>${escapeHtml(user.nickname)}</strong><p class="muted">${escapeHtml(activityLabel(user.status))}</p></div><i class="status-dot online"></i></div>`).join('') : '<div class="empty-card"><strong>현재 표시할 사용자가 없습니다.</strong><p class="muted" style="margin:8px 0 0">플랫폼에 접속하면 여기에 표시됩니다.</p></div>'}</div></section>
    <section class="section" id="all-games"><div class="section-head"><h2>전체 게임</h2><span class="muted">${state.games.length}개</span></div><div class="game-grid">${state.games.map(gameCard).join('')}</div></section>
  `);
  bindCommon();
  document.querySelector('[data-scroll-games]')?.addEventListener('click', scrollToGames);
  document.querySelector('[data-resume-room]')?.addEventListener('click', () => navigate(`/room/${state.room.roomId}`));
}

function renderDetail(game) {
  state.selectedGame = game;
  const liveGame = state.liveRooms.find((entry) => entry.gameId === game.id);
  const liveRooms = liveGame?.rooms || [];
  app.innerHTML = shell(`
    <header class="topbar"><div><p class="eyebrow">GAME DETAIL</p><h1>${escapeHtml(game.name)}</h1></div><a class="button secondary" href="/" data-link>← 게임 목록</a></header>
    <div class="detail-layout">
      <section class="detail-hero"><div class="detail-symbol">${ICONS[game.thumbnail] || '◆'}</div><p class="eyebrow">${game.gameVersion} · CROSS PLAY</p><h2>${escapeHtml(game.name)}</h2><p class="muted">${escapeHtml(game.description)}</p><div class="game-meta"><span class="chip">${game.minPlayers}–${game.maxPlayers}명</span>${game.recommendedPlayers ? `<span class="chip">권장 ${game.recommendedPlayers}명</span>` : ''}${game.modes ? `<span class="chip">개인전 · 팀전</span>` : ''}<span class="chip">PC · Android · iOS</span></div></section>
      <aside class="detail-panel launch-panel"><p class="eyebrow">ROOM HUB</p><h2>방을 찾아<br>바로 시작하세요</h2>${game.playUrl ? `<p class="muted">아래 공개 방에서 참가·관전을 선택하세요. 새 방은 게임 화면에서 인원과 게임 규칙을 정해 만듭니다.</p><a class="button launch-button" data-launch-game="${game.id}" href="${escapeHtml(withPlatformUrl(game.playUrl))}"><span>＋</span> 새 게임 만들기</a><p class="launch-note">내 닉네임은 플랫폼 설정을 기준으로 자동 전달됩니다.</p>` : `<p class="muted">새 방을 열거나 친구의 방 코드를 입력하세요.</p>
        <form id="create-room-form" class="stack">
          <div class="field"><label for="maxPlayers">최대 인원</label><select class="input" id="maxPlayers">${Array.from({length: game.maxPlayers - game.minPlayers + 1}, (_, i) => `<option value="${i + game.minPlayers}" ${i + game.minPlayers === game.maxPlayers ? 'selected' : ''}>${i + game.minPlayers}명</option>`).join('')}</select></div>
          <label><input type="checkbox" id="privateRoom"> 비공개 방으로 만들기</label>
          <button class="button" type="submit">플랫폼 방 만들기</button>
        </form>
        <div class="divider">또는</div>
        <form id="join-room-form" class="stack"><label class="field" for="joinCode"><span>방 코드</span><input id="joinCode" class="input code" maxlength="6" autocomplete="off" placeholder="ABC123" required></label><button class="button secondary" type="submit">코드로 입장</button></form>`}
      </aside>
    </div>`, 'games', game.id);
  if (game.playUrl) {
    const roomPanel = document.createElement('section');
    roomPanel.className = 'section game-room-section';
    roomPanel.innerHTML = `<div class="section-head"><div><p class="eyebrow">PUBLIC ROOMS</p><h2>현재 방 목록</h2>${liveGame?.stale ? '<p class="muted room-list-note">게임 서버를 깨우는 중이라 마지막으로 확인한 목록을 표시합니다.</p>' : ''}</div><button class="button ghost" data-refresh-live>새로고침</button></div>${liveGame && !liveGame.available ? '<p class="muted">방 목록을 불러오지 못했습니다. 잠시 후 새로고침하거나 게임 사이트에서 직접 확인해 주세요.</p>' : liveRooms.length ? `<div class="live-room-list">${liveRooms.map((room) => liveRoomCard(room, game)).join('')}</div>` : '<div class="empty-card"><strong>현재 공개된 방이 없습니다.</strong><p class="muted" style="margin:8px 0 0">새 게임을 만들어 친구를 초대해 보세요.</p></div>'}`;
    document.querySelector('.detail-layout').after(roomPanel);
  }
  bindCommon();
  document.querySelector('#create-room-form')?.addEventListener('submit', createRoom);
  document.querySelector('#join-room-form')?.addEventListener('submit', joinRoom);
  document.querySelector('[data-refresh-live]')?.addEventListener('click', fetchLiveRooms);
}

function renderLobby() {
  if (!state.room) return navigate('/');
  const room = state.room;
  const game = state.games.find((item) => item.id === room.gameType);
  const me = room.players.find((player) => player.userId === state.session.userId);
  const isHost = room.hostId === state.session.userId;
  const allReady = room.players.filter((p) => p.userId !== room.hostId).every((p) => p.ready);
  const canStart = isHost && room.players.length >= game.minPlayers && allReady && room.status === 'WAITING';
  app.innerHTML = shell(`
    <header class="topbar"><div><p class="eyebrow">${room.status === 'WAITING' ? 'GAME LOBBY' : 'READY TO LAUNCH'}</p><h1>${escapeHtml(game.name)}</h1><p class="muted">${room.players.length}/${room.maxPlayers}명이 함께하고 있어요.</p></div></header>
    <div class="lobby-grid">
      <section class="lobby-panel">
        <div class="room-header"><div><p class="muted">방 코드</p><div class="room-code">${room.inviteCode}</div></div><button class="button secondary" data-copy>초대 링크 복사</button></div>
        ${room.status === 'PLAYING' ? `<div class="playing-banner"><strong>게임을 시작했습니다!</strong><p class="muted" style="margin:6px 0 0">게임 모듈이 연결되면 이 위치에서 진행 화면으로 전환됩니다.</p></div>` : ''}
        <div class="section-head" style="margin-top:28px"><h2>플레이어</h2><span class="chip">최소 ${game.minPlayers}명</span></div>
        <div class="players">${room.players.map((player) => `<div class="player ${player.userId === state.session.userId ? 'me' : ''}"><span class="avatar">${player.avatar}</span><span class="status-dot ${player.connected ? 'online' : ''}"></span><div class="player-name"><strong>${escapeHtml(player.nickname)}</strong>${player.userId === state.session.userId ? '<span class="muted"> · 나</span>' : ''}<div>${player.userId === room.hostId ? '<span class="host">방장</span>' : player.ready ? '<span class="ready">준비 완료</span>' : '<span class="muted">기다리는 중</span>'}</div></div></div>`).join('')}</div>
        <div class="lobby-actions">
          ${!isHost && room.status === 'WAITING' ? `<button class="button ${me?.ready ? 'secondary' : ''}" data-ready>${me?.ready ? '준비 취소' : '준비하기'}</button>` : ''}
          ${isHost && room.status === 'WAITING' ? `<button class="button" data-start ${canStart ? '' : 'disabled'}>게임 시작</button>` : ''}
          <button class="button danger" data-leave>나가기</button>
        </div>
        ${isHost && room.status === 'WAITING' && !canStart ? `<p class="muted" style="margin-top:12px">최소 인원과 모든 참가자의 준비 상태를 확인해 주세요.</p>` : ''}
      </section>
      <aside class="lobby-panel chat"><div><p class="eyebrow">ROOM CHAT</p><h2>대화</h2></div><div class="messages" id="messages">${room.messages.map(messageHtml).join('') || '<p class="muted">첫 인사를 건네보세요.</p>'}</div><form class="chat-form" id="chat-form"><input class="input" id="chat-input" maxlength="300" placeholder="메시지 입력" autocomplete="off"><button class="button" aria-label="메시지 보내기">전송</button></form></aside>
    </div>`, 'games');
  bindCommon();
  scrollMessages();
  document.querySelector('[data-copy]').addEventListener('click', copyInvite);
  document.querySelector('[data-ready]')?.addEventListener('click', () => act(EVENTS.PLAYER_READY, { ready: !me.ready }));
  document.querySelector('[data-start]')?.addEventListener('click', () => act(EVENTS.GAME_START));
  document.querySelector('[data-leave]').addEventListener('click', leaveRoom);
  document.querySelector('#chat-form').addEventListener('submit', sendChat);
}

function renderProfile() {
  const session = state.session;
  app.innerHTML = shell(`
    <header class="topbar"><div><p class="eyebrow">MY PROFILE</p><h1>내 정보</h1><p class="muted">게임방에서 표시되는 이름과 아바타를 설정하세요.</p></div></header>
    <section class="profile-card">
      <div class="profile-preview"><span class="avatar profile-avatar" id="profile-preview">${session.avatar}</span><div><h2>${escapeHtml(session.nickname)}</h2><p class="muted">게스트 플레이어 · 이 기기에 저장됨</p></div></div>
      <form id="profile-form" class="profile-form">
        <label class="field" for="profile-nickname"><span>닉네임</span><input id="profile-nickname" class="input" maxlength="16" value="${escapeHtml(session.nickname)}" required><small>공백 포함 최대 16자</small></label>
        <fieldset class="avatar-picker"><legend>아바타</legend><div class="avatar-options">${PROFILE_AVATARS.map((avatar) => `<button type="button" class="avatar-choice ${avatar === session.avatar ? 'selected' : ''}" data-avatar="${avatar}" aria-label="${avatar} 아바타 선택" aria-pressed="${avatar === session.avatar}">${avatar}</button>`).join('')}</div></fieldset>
        <button class="button" type="submit">프로필 저장</button>
      </form>
    </section>`, 'profile');
  bindCommon();
  document.querySelectorAll('[data-avatar]').forEach((button) => button.addEventListener('click', () => selectAvatar(button.dataset.avatar)));
  document.querySelector('#profile-form').addEventListener('submit', saveProfile);
}

function selectAvatar(avatar) {
  state.profileAvatar = avatar;
  document.querySelector('#profile-preview').textContent = avatar;
  document.querySelectorAll('[data-avatar]').forEach((button) => {
    const selected = button.dataset.avatar === avatar;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

async function saveProfile(event) {
  event.preventDefault();
  try {
    const response = await emit(EVENTS.PROFILE_UPDATE, {
      nickname: document.querySelector('#profile-nickname').value,
      avatar: state.profileAvatar || state.session.avatar
    });
    state.session = response.session;
    state.profileAvatar = null;
    localStorage.setItem('arcade-link-session', JSON.stringify(response.session));
    toast('프로필을 저장했습니다.');
    renderProfile();
  } catch (error) { toast(error.message); }
}

function messageHtml(message) {
  return `<div class="message"><div class="message-head"><span>${message.avatar}</span><strong>${escapeHtml(message.nickname)}</strong><time>${new Date(message.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</time></div><p>${escapeHtml(message.text)}</p></div>`;
}

function bindCommon() {
  document.querySelectorAll('[data-link]').forEach((link) => link.addEventListener('click', (event) => { event.preventDefault(); navigate(link.getAttribute('href')); }));
  document.querySelectorAll('[data-games-link]').forEach((link) => link.addEventListener('click', (event) => { event.preventDefault(); goToGames(); }));
  document.querySelectorAll('[data-game]').forEach((button) => button.addEventListener('click', () => navigate(`/games/${button.dataset.game}`)));
  document.querySelectorAll('[data-soon]').forEach((link) => link.addEventListener('click', (event) => { event.preventDefault(); toast('다음 단계에서 제공될 기능입니다.'); }));
  document.querySelectorAll('a[data-play]').forEach((link) => link.addEventListener('click', async (event) => {
    const roomCode = new URL(link.href).searchParams.get('room');
    if (!roomCode || !state.session?.sessionToken) return;
    const gameId = link.dataset.play;
    const activeRooms = readActiveGameRooms();
    const activeRoom = activeRooms[gameId];
    if (activeRoom && activeRoom.roomCode !== roomCode && activeRoom.mode !== 'SPECTATOR') {
      const gameName = state.games.find((game) => game.id === gameId)?.name || '이 게임';
      if (!window.confirm(`${gameName} ${activeRoom.roomCode} 방에서 플레이 중입니다.\n기존 방을 나가고 ${roomCode} 방에 참여하시겠습니까?`)) return;
    }
    event.preventDefault();
    try {
      const mode = link.dataset.reserveNext !== undefined ? 'RESERVE' : link.textContent.includes('관전') ? 'SPECTATOR' : 'PLAYER';
      const response = await fetch('/api/join-link', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionToken: state.session.sessionToken, gameId, roomCode, mode }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      activeRooms[gameId] = { roomCode, mode };
      localStorage.setItem('arcade-link-active-game-rooms', JSON.stringify(activeRooms));
      location.assign(result.url);
    } catch (error) { toast(error.message || '자동 입장을 준비하지 못했습니다.'); }
  }));
  document.querySelectorAll('a[data-launch-game]').forEach((link) => link.addEventListener('click', async (event) => {
    if (!state.session?.sessionToken) return;
    event.preventDefault();
    try {
      const response = await fetch('/api/game-launch-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionToken: state.session.sessionToken, gameId: link.dataset.launchGame })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      location.assign(result.url);
    } catch (error) { toast(error.message || '게임 실행을 준비하지 못했습니다.'); }
  }));
}

function readActiveGameRooms() {
  try {
    const value = JSON.parse(localStorage.getItem('arcade-link-active-game-rooms') || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch { return {}; }
}

function scrollToGames() {
  document.querySelector('#all-games')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function goToGames() {
  if (location.pathname !== '/') {
    history.pushState({}, '', '/');
    route();
    requestAnimationFrame(scrollToGames);
    return;
  }
  scrollToGames();
}

async function createRoom(event) {
  event.preventDefault();
  try {
    const response = await emit(EVENTS.ROOM_CREATE, { gameId: state.selectedGame.id, maxPlayers: Number(document.querySelector('#maxPlayers').value), isPrivate: document.querySelector('#privateRoom').checked });
    state.room = response.room; state.inviteUrl = response.inviteUrl; navigate(`/room/${state.room.roomId}`);
  } catch (error) { toast(error.message); }
}

async function joinRoom(eventOrCode) {
  if (eventOrCode?.preventDefault) eventOrCode.preventDefault();
  const inviteCode = typeof eventOrCode === 'string' ? eventOrCode : document.querySelector('#joinCode')?.value;
  try {
    const response = await emit(EVENTS.ROOM_JOIN, { inviteCode });
    state.room = response.room; state.inviteUrl = response.inviteUrl; navigate(`/room/${state.room.roomId}`);
  } catch (error) { toast(error.message); }
}

function showJoinPrompt() {
  const code = window.prompt('6자리 방 코드를 입력하세요.');
  if (code) joinRoom(code);
}

async function act(event, payload = {}) {
  try { await emit(event, payload); } catch (error) { toast(error.message); }
}

async function leaveRoom() {
  try { await emit(EVENTS.ROOM_LEAVE); state.room = null; navigate('/'); } catch (error) { toast(error.message); }
}

async function sendChat(event) {
  event.preventDefault();
  const input = document.querySelector('#chat-input');
  if (!input.value.trim()) return;
  try { await emit(EVENTS.CHAT_SEND, { text: input.value }); input.value = ''; } catch (error) { toast(error.message); }
}

async function copyInvite() {
  const url = `${location.origin}/invite/${state.room.inviteCode}`;
  try { await navigator.clipboard.writeText(url); toast('초대 링크를 복사했습니다.'); } catch { toast(url); }
}

function scrollMessages() {
  const node = document.querySelector('#messages');
  if (node) node.scrollTop = node.scrollHeight;
}

function navigate(path) {
  history.pushState({}, '', path);
  route();
}

function withPlatformUrl(gameUrl) {
  const url = new URL(gameUrl, location.origin);
  url.searchParams.set('platformUrl', location.origin);
  if (state.session?.nickname) url.searchParams.set('platformNickname', state.session.nickname);
  return url.toString();
}

function renderNicknamePrompt() {
  if (!state.needsNickname || document.querySelector('.nickname-overlay')) return;
  document.body.insertAdjacentHTML('beforeend', `<div class="nickname-overlay" role="dialog" aria-modal="true" aria-labelledby="nickname-title"><form class="nickname-card" id="nickname-form"><span class="welcome-mark">A</span><p class="eyebrow">WELCOME TO ARCADE LINK</p><h2 id="nickname-title">어떻게 불러드릴까요?</h2><p class="muted">정한 닉네임은 모든 게임방에서 그대로 사용됩니다. 나중에 내 정보에서 바꿀 수 있어요.</p><label class="field"><span>닉네임</span><input class="input" id="welcome-nickname" maxlength="16" autocomplete="nickname" placeholder="2~16자 닉네임" required autofocus></label><button class="button" type="submit">게임 둘러보기</button></form></div>`);
  document.querySelector('#nickname-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button');
    button.disabled = true;
    try {
      const response = await emit(EVENTS.PROFILE_UPDATE, { nickname: document.querySelector('#welcome-nickname').value, avatar: state.session.avatar });
      state.session = response.session;
      state.needsNickname = false;
      localStorage.setItem('arcade-link-session', JSON.stringify(response.session));
      document.querySelector('.nickname-overlay')?.remove();
      route();
      toast(`${response.session.nickname}님, 환영합니다!`);
    } catch (error) { toast(error.message); button.disabled = false; }
  });
}

function route() {
  if (!state.session) return;
  const path = location.pathname;
  const invite = path.match(/^\/invite\/([A-Z0-9]{6})$/i);
  if (invite) { joinRoom(invite[1]); return; }
  const gameMatch = path.match(/^\/games\/([^/]+)$/);
  if (gameMatch) {
    const game = state.games.find((item) => item.id === gameMatch[1]);
    return game ? renderDetail(game) : navigate('/');
  }
  if (path.startsWith('/room/') && state.room) return renderLobby();
  if (path === '/profile') return renderProfile();
  renderHome();
  renderNicknamePrompt();
}

async function resumeSession() {
  try {
    const saved = JSON.parse(localStorage.getItem('arcade-link-session') || 'null');
    const response = await emit(EVENTS.SESSION_RESUME, { sessionToken: saved?.sessionToken });
    state.session = response.session; state.games = response.games; state.room = response.room; state.connected = true; state.needsNickname = !saved?.sessionToken;
    localStorage.setItem('arcade-link-session', JSON.stringify(response.session));
    route();
    fetchLiveRooms();
    fetchPresence().then(route);
  } catch (error) { toast(error.message); }
}

async function fetchLiveRooms() {
  try {
    const response = await fetch('/api/live-rooms');
    if (!response.ok) throw new Error();
    state.liveRooms = await response.json();
    route();
  } catch {
    state.liveRooms = [];
  }
}

function startLiveRefresh() {
  if (liveRefreshTimer) return;
  liveRefreshTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible') {
      emit(EVENTS.PRESENCE_HEARTBEAT).catch(() => {});
      fetchLiveRooms();
      fetchPresence().then(() => {
        if (location.pathname === '/') route();
      });
    }
  }, 30_000);
}

async function fetchPresence() {
  try { const response = await fetch('/api/presence'); if (response.ok) { const payload = await response.json(); state.online = payload.online || []; state.presenceSummary = payload.summary || null; } } catch { state.online = []; state.presenceSummary = null; }
}

socket.on('connect', () => { resumeSession(); startLiveRefresh(); });
socket.on('disconnect', () => { state.connected = false; toast('연결이 끊겼습니다. 자동으로 다시 연결합니다.'); });
socket.on(EVENTS.ROOM_STATE, (room) => { if (state.room?.roomId === room.roomId) { state.room = room; route(); } });
socket.on(EVENTS.CHAT_MESSAGE, (message) => {
  if (!state.room) return;
  if (!state.room.messages.some((item) => item.id === message.id)) state.room.messages.push(message);
  const messages = document.querySelector('#messages');
  if (messages) { if (messages.querySelector('.muted:only-child')) messages.innerHTML = ''; messages.insertAdjacentHTML('beforeend', messageHtml(message)); scrollMessages(); }
});
window.addEventListener('popstate', route);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    emit(EVENTS.PRESENCE_HEARTBEAT).catch(() => {});
    fetchLiveRooms();
    fetchPresence().then(() => { if (location.pathname === '/') route(); });
  }
});
