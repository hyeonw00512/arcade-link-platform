# Architecture

## 현재 구성

- `client/`: Express가 제공하는 반응형 웹 클라이언트. Socket.IO 클라이언트로 공통 플랫폼 이벤트만 사용합니다.
- `server/platform/auth/`: 게스트 세션과 재접속 토큰을 관리합니다.
- `server/platform/rooms/`: 모든 게임이 공유하는 방, 참가자, 준비, 시작 조건, 채팅 상태를 관리합니다.
- `server/platform/socket/`: `platform:*` 이벤트를 검증하고 방 단위로 전송합니다.
- `server/platform/games/`: 설정 기반 게임 카탈로그를 읽습니다.
- `shared/config/games.json`: 클라이언트와 서버가 공유하는 게임 등록 원본입니다.
- `shared/protocol/`: 이벤트 이름의 단일 원본입니다.

## 다음 게임 모듈 계약

실제 게임은 `server/games/<game-id>/index.js`에서 아래 메서드를 구현하는 독립 모듈로 추가합니다.

```js
export default {
  createGame(context, options) {},
  startGame(state) {},
  handleAction(state, player, action) {},
  getPublicState(state) {},
  getPrivateState(state, playerId) {},
  handleReconnect(state, playerId) {},
  checkGameEnd(state) {},
  destroyGame(state) {}
};
```

플랫폼은 게임 모듈을 `games.json`의 `serverModule` 값으로 찾아 로드하고, 이벤트는 `game:<game-id>:*` 접두어만 허용하도록 확장합니다. 방과 계정은 게임 내부 상태에 직접 포함하지 않습니다.

## 상태 저장 확장

현재 `SessionStore`와 `RoomService`는 단일 프로세스 메모리 저장소입니다. 다음 단계에서 메서드 계약을 유지한 채 SQLite 저장소로 교체할 수 있습니다. 다중 서버 운영 시 PostgreSQL과 Socket.IO Redis 어댑터를 사용합니다.
