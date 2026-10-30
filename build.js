// Knou calendar 빌드: node build.js
//  → dist\chromium (Chrome·Edge·웨일·오페라), dist\firefox
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const GECKO_ID = 'knou_calendar@yonggary.local';

const BACKGROUND = [
  'lib/env.js', 'lib/core.js', 'lib/settings.js', 'lib/log.js', 'lib/nuxt.js',
  'lib/schedule.js', 'lib/knou.js', 'lib/gauth.js', 'lib/gcal.js', 'lib/sync.js', 'background.js',
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

for (const target of ['chromium', 'firefox']) {
  const out = path.join(DIST, target);
  fs.rmSync(out, { recursive: true, force: true });
  copyDir(SRC, out);

  fs.writeFileSync(
    path.join(out, 'lib', 'env.js'),
    `globalThis.KS = globalThis.KS || {};\nglobalThis.KS.env = ${JSON.stringify({ target, version: base.version, clientId })};\n`
  );

  const m = JSON.parse(JSON.stringify(base));
  if (target === 'chromium') {
    m.key = key; // 확장 ID 고정 → 리디렉션 URI가 바뀌지 않음
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
