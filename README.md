# Arcade Link

PC 웹과 모바일 웹/Capacitor 앱이 같은 서버와 방을 사용하는 실시간 멀티게임 플랫폼의 Phase 1~3 구현입니다.

## 실행

Node.js 20 이상에서 다음을 실행합니다.

```bash
npm install
npm start
```

브라우저에서 `http://localhost:3000`을 엽니다. 시크릿 창이나 다른 브라우저에서 같은 방 코드로 입장하면 다중 사용자 흐름을 확인할 수 있습니다.

## 구현 범위

- 설정 기반 게임 목록과 상세 화면
- 게스트 세션 발급 및 브라우저 저장
- 공개/비공개 방 생성, 코드/초대 링크 입장
- 공통 로비, 방장 위임, 준비, 시작 직전 상태
- 방 채팅
- 새로고침 및 Socket.IO 자동 재접속 복구
- PC/모바일 반응형 UI와 safe-area 대응
- 서버 authoritative 검증 및 간단한 요청 속도 제한

개발용 환경에서는 게스트 세션과 플랫폼 방 상태를 `data/platform-state.json`에 저장합니다. 운영에서는 `DATABASE_URL`에 Neon, Supabase 또는 Render PostgreSQL 연결 문자열을 넣으면 동일한 프로필·세션·플랫폼 방 데이터가 PostgreSQL에 자동 저장되어 Render 재시작 뒤에도 유지됩니다. `DATABASE_URL`이 비어 있으면 기존 JSON 저장을 계속 사용합니다. 게임 허브와 공개 방 목록 기능은 각 게임 서버의 API를 읽는 방식이라 별도로 동작합니다.

## 새 게임 등록

1. `shared/config/games.json`에 메타데이터를 추가합니다.
2. 실제 게임 구현 단계에서는 `server/games/<game-id>/index.js` 모듈을 추가합니다.

홈과 API는 `games.json`을 읽으므로 플랫폼 UI 코드를 수정할 필요가 없습니다.

## 주요 환경 변수

- `PORT`: 서버 포트
- `CLIENT_ORIGIN`: 허용할 웹 출처. 운영에서는 실제 주소를 지정합니다.
- `PUBLIC_APP_URL`: 초대 링크 기준 주소
- `SESSION_TTL_DAYS`: 게스트 세션 유지 기간
- `PLATFORM_JOIN_SECRET`: 플랫폼 닉네임 자동 입장과 게임 활동 표시를 서명하는 32자 이상의 비밀값

## Render 배포

1. 플랫폼 프로젝트를 별도 GitHub 저장소에 올립니다.
2. Render에서 **New + → Blueprint**를 선택하고 해당 저장소를 연결합니다.
3. 저장소의 `render.yaml`을 확인한 뒤 배포합니다.
4. 배포된 Render 주소를 `PUBLIC_APP_URL` 환경 변수로 추가합니다.
5. Render 환경 변수에 임의의 긴 값으로 `PLATFORM_JOIN_SECRET`을 추가하고 다시 배포합니다. 이 값은 플랫폼만 보관하며 게임 주소에는 서명된 임시 토큰만 전달됩니다.

배포 후 `https://배포주소/api/health`가 `{"ok":true}`를 반환하면 정상입니다. 깊은갱도처럼 공개 방 목록 API를 제공하는 게임은 플랫폼 홈의 **지금 참가할 수 있는 방**에 자동 표시됩니다.

## Android / iOS 앱 패키징

플랫폼 웹 화면은 `client/` 하나를 그대로 재사용합니다. Android 프로젝트는 이미 `android/`에 생성되어 있으며, 앱에는 웹 서버 주소가 없으므로 빌드 전 실제 플랫폼 주소를 지정해야 합니다.

PowerShell에서 다음처럼 실행합니다.

```powershell
$env:PLATFORM_API_URL = 'https://배포된-플랫폼주소'
npm run app:sync
npm run app:android
```

`app:sync`는 웹 자산을 Android/iOS 프로젝트로 복사한 뒤, **앱 내부에만** 서버 주소를 기록합니다. 웹 배포용 `client/runtime-config.js`는 빈 값으로 유지되므로 로컬 웹 개발과 Render 배포에 영향을 주지 않습니다.

iOS는 Xcode가 설치된 macOS에서 `npx cap add ios`를 한 번 실행한 뒤 같은 `PLATFORM_API_URL` 설정으로 `npm run app:ios`를 실행하면 됩니다. 앱과 웹은 같은 플랫폼 API·Socket.IO 서버를 쓰므로 동일한 방에서 함께 플레이합니다.
