import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rawUrl = String(process.env.PLATFORM_API_URL || '').trim().replace(/\/$/, '');
if (!rawUrl) throw new Error('PLATFORM_API_URL에 배포된 플랫폼 주소를 지정해 주세요.');

let platformUrl;
try {
  platformUrl = new URL(rawUrl);
  if (!['http:', 'https:'].includes(platformUrl.protocol)) throw new Error();
} catch {
  throw new Error('PLATFORM_API_URL은 https://로 시작하는 올바른 주소여야 합니다.');
}

const runtimeConfig = `// Capacitor 앱 빌드 시 생성됨. 직접 수정하지 마세요.\nwindow.ARCADE_LINK_RUNTIME_CONFIG = ${JSON.stringify({ apiBaseUrl: platformUrl.toString().replace(/\/$/, ''), platformUrl: platformUrl.toString().replace(/\/$/, '') }, null, 2)};\n`;
const nativeConfigFiles = [
  resolve('android/app/src/main/assets/public/runtime-config.js'),
  resolve('ios/App/App/public/runtime-config.js')
].filter(existsSync);

if (!nativeConfigFiles.length) throw new Error('먼저 Capacitor 플랫폼을 추가해 주세요. 예: npx cap add android');
nativeConfigFiles.forEach((file) => writeFileSync(file, runtimeConfig, 'utf8'));
