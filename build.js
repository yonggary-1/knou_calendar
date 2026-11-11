// Knou calendar 빌드: node build.js
//  → dist\chromium (Chrome·Edge·웨일·오페라), dist\firefox, 그리고 첨부용 zip 두 개 (tools\pack.js)
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const GECKO_ID = 'knou_calendar@yonggary.local';

const BACKGROUND = [
  'lib/env.js', 'lib/core.js', 'lib/settings.js', 'lib/log.js', 'lib/nuxt.js',
  'lib/schedule.js', 'lib/scope.js', 'lib/knou.js', 'lib/gauth.js', 'lib/gcal.js', 'lib/dropbox.js', 'lib/sync.js', 'background.js',
];
const SKIP = new Set(['manifest.base.json', 'chromium_key.txt', 'config.json']);

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}

const base = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.base.json'), 'utf8'));
const key = fs.readFileSync(path.join(SRC, 'chromium_key.txt'), 'utf8').trim();
const config = JSON.parse(fs.readFileSync(path.join(SRC, 'config.json'), 'utf8'));
const clientId = String(config.clientId || '').trim();
if (clientId && !/\.apps\.googleusercontent\.com$/.test(clientId)) {
  console.error('config.json의 clientId 형식이 이상합니다: ' + clientId);
  process.exit(1);
}
console.log(clientId ? `내장 클라이언트 ID: ${clientId.slice(0, 12)}…` : '경고: 내장 클라이언트 ID 없음 (설정 > 고급에서 입력해야 동작)');
// Dropbox 앱 키: 공개해도 되는 값 (PKCE 방식이라 앱 시크릿은 쓰지 않음)
const dropboxAppKey = String(config.dropboxAppKey || '').trim();
if (dropboxAppKey && !/^[a-z0-9]{10,20}$/i.test(dropboxAppKey)) {
  console.error('config.json의 dropboxAppKey 형식이 이상합니다: ' + dropboxAppKey);
  process.exit(1);
}
console.log(dropboxAppKey ? `내장 Dropbox 앱 키: ${dropboxAppKey}` : '경고: 내장 Dropbox 앱 키 없음 (설정 > 고급에서 입력해야 Dropbox 내보내기 동작)');

// 위젯 스크립트: 첫 줄 "// KnouWidget v<버전> —" 과 const WIDGET_VERSION = "<버전>" 이 같아야 한다
const widgetSrc = fs.readFileSync(path.join(SRC, 'widget', 'KnouWidget.js'), 'utf8');
const wv1 = /^\/\/ KnouWidget v(\d+\.\d+\.\d+) —/.exec(widgetSrc)?.[1];
const wv2 = /const WIDGET_VERSION = "(\d+\.\d+\.\d+)";/.exec(widgetSrc)?.[1];
if (!wv1 || wv1 !== wv2) {
  console.error(`src/widget/KnouWidget.js 버전 표기가 맞지 않습니다 (첫 줄 ${wv1 || '없음'}, WIDGET_VERSION ${wv2 || '없음'})`);
  process.exit(1);
}
// 위젯 v1.1.0의 자동 업데이트는 받은 파일이 10KB 이상이고 Script.complete();로 끝나야 받아들인다 → 그 조건을 빌드에서도 지킨다
if (widgetSrc.length <= 10000 || !/Script\.complete\(\);?\s*$/.test(widgetSrc.trim())) {
  console.error('src/widget/KnouWidget.js가 위젯 자동 업데이트 조건(10KB 이상, Script.complete();로 끝남)을 만족하지 않습니다.');
  process.exit(1);
}
console.log(`위젯 스크립트: KnouWidget v${wv1}`);

for (const target of ['chromium', 'firefox']) {
  const out = path.join(DIST, target);
  fs.rmSync(out, { recursive: true, force: true });
  copyDir(SRC, out);

  fs.writeFileSync(
    path.join(out, 'lib', 'env.js'),
    `globalThis.KS = globalThis.KS || {};\nglobalThis.KS.env = ${JSON.stringify({ target, version: base.version, clientId, dropboxAppKey })};\n`
  );

  const m = JSON.parse(JSON.stringify(base));
  if (target === 'chromium') {
    if (key) m.key = key; // 확장 ID 고정 → 리디렉션 URI가 바뀌지 않음
    else console.warn('경고: src/chromium_key.txt가 비어 있습니다. 확장 ID가 고정되지 않아 구글·Dropbox 리디렉션 URI가 달라집니다.');
    m.minimum_chrome_version = '116';
    m.background = { service_worker: 'sw.js' };
    fs.writeFileSync(path.join(out, 'sw.js'), `importScripts(${BACKGROUND.map((f) => JSON.stringify(f)).join(', ')});\n`);
  } else {
    m.background = { scripts: BACKGROUND };
    m.browser_specific_settings = {
      gecko: { id: GECKO_ID, strict_min_version: '140.0', data_collection_permissions: { required: ['none'] } },
      gecko_android: { strict_min_version: '142.0' },
    };
  }
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(m, null, 2) + '\n');
  console.log(`빌드 완료: ${path.relative(ROOT, out)}`);
}

// 릴리즈 첨부용 zip 두 개도 같이 만든다 (빠뜨리지 않게)
//  dist\knou_calendar_chromium.zip — 최상위 knou_calendar_chromium\ 폴더
//  dist\knou_calendar_firefox.zip  — manifest.json 이 최상위 (Mozilla 서명 제출 형식)
require('./tools/pack.js');
