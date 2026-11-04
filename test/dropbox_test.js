// 사용법: node test\dropbox_test.js
// 가짜 Dropbox 서버와 가짜 확장 저장소로 Dropbox 내보내기 흐름을 점검한다 (네트워크 사용 안 함).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const SRC = path.join(__dirname, '..', 'src');
const out = (...a) => process.stdout.write(a.join(' ') + '\n');

// ---- 가짜 확장 저장소 ----
function area() {
  const m = {};
  return {
    data: m,
    async get(keys) {
      const ks = Array.isArray(keys) ? keys : [keys];
      const r = {};
      for (const k of ks) if (k in m) r[k] = JSON.parse(JSON.stringify(m[k]));
      return r;
    },
    async set(o) { for (const [k, v] of Object.entries(o)) m[k] = JSON.parse(JSON.stringify(v)); },
    async remove(keys) { for (const k of Array.isArray(keys) ? keys : [keys]) delete m[k]; },
  };
}

// ---- 가짜 Dropbox ----
function fakeDropbox() {
  const files = new Map();
  const calls = [];
  let tokenCalls = 0;
  const reply = (status, body, text) => ({
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
    async text() { return text !== undefined ? text : JSON.stringify(body); },
  });
  async function fetch(url, init = {}) {
    const h = init.headers || {};
    calls.push({ url, arg: h['Dropbox-API-Arg'] ? JSON.parse(h['Dropbox-API-Arg']) : null });
    if (url.endsWith('/oauth2/token')) {
      tokenCalls++;
      const p = new URLSearchParams(init.body);
      if (p.get('grant_type') === 'refresh_token' && p.get('refresh_token') !== 'R1') return reply(400, { error: 'invalid_grant' });
      return reply(200, { access_token: 'A' + tokenCalls, expires_in: 14400, refresh_token: p.get('grant_type') === 'authorization_code' ? 'R1' : undefined });
    }
    if (h.Authorization !== 'Bearer A' + tokenCalls) return reply(401, {}, '');
    if (url.endsWith('/files/upload')) {
      const a = JSON.parse(h['Dropbox-API-Arg']);
      assert.ok(/^[\x20-\x7e]*$/.test(h['Dropbox-API-Arg']), 'Dropbox-API-Arg는 ASCII여야 함');
      if (a.mode === 'add' && files.has(a.path)) return reply(409, { error_summary: 'path/conflict/file/..' });
      files.set(a.path, init.body);
      return reply(200, { name: a.path });
    }
    if (url.endsWith('/files/download')) {
      const a = JSON.parse(h['Dropbox-API-Arg']);
      if (!files.has(a.path)) return reply(409, { error_summary: 'path/not_found/..' });
      return reply(200, null, '﻿' + files.get(a.path));
    }
    if (url.endsWith('/files/move_v2')) {
      const a = JSON.parse(init.body);
      files.set(a.to_path, files.get(a.from_path));
      files.delete(a.from_path);
      return reply(200, {});
    }
    if (url.endsWith('/auth/token/revoke')) return reply(200, null, '');
    return reply(404, {});
  }
  return { files, calls, fetch };
}

function load(dbx) {
  const local = area(), session = area();
  const ctx = {
    console: { log() {}, info() {}, warn() {}, error() {} },
    URL, URLSearchParams, TextEncoder, crypto: globalThis.crypto, btoa, setTimeout,
    fetch: dbx.fetch,
  };
  ctx.globalThis = ctx;
  ctx.chrome = { storage: { local, session }, identity: { getRedirectURL: () => 'https://abc.chromiumapp.org/' } };
  vm.createContext(ctx);
  for (const f of ['lib/env.js', 'lib/core.js', 'lib/settings.js', 'lib/log.js', 'lib/dropbox.js']) {
    vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
  }
  return { KS: ctx.KS, local, session, ctx };
}

const agenda = (semester) => ({
  savedAt: Date.parse('2026-11-05T05:00:00+09:00'),
  semester,
  courses: ['행정학개론', '경영학원론', '컴퓨터의이해'],
  items: [
    { course: '행정학개론', kind: 'class', label: '출석수업', detail: '', start: '2026-11-08T09:00:00+09:00', end: '2026-11-08T13:00:00+09:00', place: '서울남부학습센터 301호', link: 'attendance', due: false },
    { course: '행정학개론', kind: 'final', label: '기말평가', detail: '과제물', start: '2026-11-10T09:00:00+09:00', end: '2026-11-20T18:00:00+09:00', link: 'assignment', due: true },
    { course: '경영학원론', kind: 'mid', label: '중간평가', detail: '출석수업대체시험', start: null, end: '2026-11-15T18:00:00+09:00', link: 'myknou', due: true },
    { course: '경영학원론', kind: 'final', label: '기말시험', detail: '온라인시험', start: '2026-12-12T10:00:00+09:00', end: '2026-12-12T11:00:00+09:00', link: 'myknou', due: false },
    { course: '형성평가', kind: 'formative', label: '형성평가', detail: '학습영상·연습문제', start: '2026-09-01T00:00:00+09:00', end: '2026-12-10T23:59:00+09:00', link: 'ucampus', due: true },
  ],
});

(async () => {
  // ---- 1. 연결 안 됨 → 아무것도 하지 않음 ----
  {
    const dbx = fakeDropbox();
    const { KS, local } = load(dbx);
    await local.set({ ks_agenda: agenda('2026-2') });
    const r = await KS.dropbox.exportAgenda();
    assert.strictEqual(r.skipped, true);
    assert.strictEqual(dbx.calls.length, 0);
    out('[1] 연결 안 됨 → 건너뜀 통과');
  }

  // ---- 2. 첫 내보내기: agenda + 범위 양식 생성 ----
  const dbx = fakeDropbox();
  const { KS, local, session } = load(dbx);
  await local.set({ ks_dropbox: { refresh: 'R1', appKey: 'KEY', email: '' }, ks_agenda: agenda('2026-2') });
  let r = await KS.dropbox.exportAgenda();
  assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(r.scope, 'created');
  const ag = JSON.parse(dbx.files.get('/knou_agenda.json'));
  assert.strictEqual(ag.format, 1);
  assert.strictEqual(ag.semester, '2026-2');
  assert.strictEqual(ag.items.length, 5);
  assert.ok(!('link' in ag.items[0]), '팝업 전용 link 필드는 내보내지 않음');
  const sc = JSON.parse(dbx.files.get('/knou_scope.json'));
  assert.deepStrictEqual(sc.items.map((i) => `${i.course}/${i.kind}`), ['행정학개론/기말평가', '경영학원론/중간평가', '경영학원론/기말평가', '컴퓨터의이해/']);
  assert.ok(!sc.items.some((i) => i.course === '형성평가'));
  out('[2] 첫 내보내기: 일정', ag.items.length, '건, 범위 양식', sc.items.length, '칸 통과');

  // ---- 3. 사람이 범위를 적은 뒤 다시 동기화 → 범위 파일은 그대로 ----
  const edited = { ...sc, items: sc.items.map((i, n) => (n === 0 ? { ...i, scope: 'A형 2번, 3~5장' } : i)) };
  dbx.files.set('/knou_scope.json', JSON.stringify(edited));
  r = await KS.dropbox.exportAgenda();
  assert.strictEqual(r.scope, 'kept');
  assert.strictEqual(JSON.parse(dbx.files.get('/knou_scope.json')).items[0].scope, 'A형 2번, 3~5장');
  out('[3] 같은 학기 재동기화 → 범위 파일 보존 통과');

  // ---- 4. 학기 표시를 지운 파일 → 사람이 쓴 것으로 보고 보존 ----
  dbx.files.set('/knou_scope.json', JSON.stringify({ items: [{ course: 'x', kind: '', scope: '내 메모' }] }));
  await local.set({ ks_agenda: agenda('2027-1') });
  r = await KS.dropbox.exportAgenda();
  assert.strictEqual(r.scope, 'kept');
  assert.strictEqual(JSON.parse(dbx.files.get('/knou_scope.json')).items[0].scope, '내 메모');
  out('[4] 학기 표시 없는 파일 보존 통과');

  // ---- 5. 학기가 바뀜 → 옛 파일 보관 + 새 양식 ----
  dbx.files.set('/knou_scope.json', JSON.stringify(edited));
  r = await KS.dropbox.exportAgenda();
  assert.strictEqual(r.scope, 'renewed');
  assert.strictEqual(JSON.parse(dbx.files.get('/archive/knou_scope_2026-2.json')).items[0].scope, 'A형 2번, 3~5장');
  assert.strictEqual(JSON.parse(dbx.files.get('/knou_scope.json')).semester, '2027-1');
  out('[5] 새 학기 → archive 이동 후 새 양식 통과');

  // ---- 6. 접근 토큰 만료(401) → 한 번 갱신 후 성공 ----
  await session.set({ ks_dbx_token: { token: 'stale', exp: Date.now() + 3600e3 } });
  r = await KS.dropbox.exportAgenda();
  assert.ok(r.ok, JSON.stringify(r));
  out('[6] 401 → 토큰 갱신 후 재시도 통과');

  // ---- 7. 갱신 토큰 무효 → 실패를 기록하고 예외는 던지지 않음 (동기화 보호) ----
  await local.set({ ks_dropbox: { refresh: 'BAD', appKey: 'KEY' } });
  await session.remove('ks_dbx_token');
  r = await KS.dropbox.exportAgenda();
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'DROPBOX_AUTH');
  assert.strictEqual((await local.get('ks_dbx_last')).ks_dbx_last.ok, false);
  await assert.rejects(() => KS.dropbox.exportAgenda({ quiet: false }));
  out('[7] 연결 만료 → 실패 기록, 동기화는 계속 통과');

  // ---- 8. 연결 해제 ----
  await KS.dropbox.disconnect();
  assert.strictEqual((await KS.dropbox.status()).connected, false);
  out('[8] 연결 해제 통과');

  out('모든 Dropbox 점검 통과');
})().catch((e) => { console.error(e); process.exit(1); });
