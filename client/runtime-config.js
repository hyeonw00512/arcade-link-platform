// 웹 배포에서는 빈 값으로 현재 도메인의 API와 Socket.IO를 사용합니다.
// Android/iOS 패키징 전 `PLATFORM_API_URL`을 지정한 app:sync가 이 파일을 갱신합니다.
window.ARCADE_LINK_RUNTIME_CONFIG = {
  apiBaseUrl: '',
  platformUrl: ''
};
