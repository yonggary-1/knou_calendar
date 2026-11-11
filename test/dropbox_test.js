// 사용법: node test\dropbox_test.js
// 가짜 Dropbox 서버와 가짜 확장 저장소로 Dropbox 흐름을 점검한다 (네트워크 사용 안 함).
//  - 내보내기(knou_agenda.json + notes), 과제 메모 양식(knou_scope.txt), 학기 전환, 위젯 스크립트 배포
//  - 과제 메모 편집기의 불러오기·저장(rev 확인·충돌), 저장 직후 다시 내보내기
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const SRC = path.join(__dirname, '..', 'src');
const WIDGET = fs.readFileSync(path.join(SRC, 'widget', 'KnouWidget.js'), 'utf8');
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

// ---- 가짜 Dropbox (파일마다 rev를 매긴다) ----
function fakeDropbox() {
  const files = new Map(); // path → { text, rev }
  const calls = [];
  let tokenCalls = 0, revN = 0;
  const newRev = () => 'r' + (++revN).toString(16).padStart(9, '0');
  const put = (p, text) => { const rev = newRev(); files.set(p, { text, rev }); return rev; };
  const reply = (status, body, text) => ({
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
    async text() { return text !== undefined ? text : JSON.stringify(body); },
  });
  const resolve = (p) => {
    if (p.startsWith('rev:')) { for (const [k, v] of files) if (v.rev === p.slice(4)) return [k, v]; return [null, null]; }
    return [p, files.get(p) || null];
  };
  async function fetch(url, init = {}) {
    url = String(url);
    if (url.startsWith('chrome-extension://')) return { ok: true, async text() { return WIDGET; } };
    const h = init.headers || {};
    const arg = h['Dropbox-API-Arg'] ? JSON.parse(h['Dropbox-API-Arg']) : null;
    calls.push({ url: url.replace(/^https:\/\/[^/]+\/2/, ''), arg });
    if (url.endsWith('/oauth2/token')) {
      tokenCalls++;
      const p = new URLSearchParams(init.body);
      if (p.get('grant_type') === 'refresh_token' && p.get('refresh_token') !== 'R1') return reply(400, { error: 'invalid_grant' });
      return reply(200, { access_token: 'A' + tokenCalls, expires_in: 14400, refresh_token: p.get('grant_type') === 'authorization_code' ? 'R1' : undefined });
    }
    if (h.Authorization !== 'Bearer A' + tokenCalls) return reply(401, {}, '');
    if (url.endsWith('/files/upload')) {
      assert.ok(/^[\x20-\x7e]*$/.test(h['Dropbox-API-Arg']), 'Dropbox-API-Arg는 ASCII여야 함');
      const mode = typeof arg.mode === 'string' ? { '.tag': arg.mode } : arg.mode;
      const cur = files.get(arg.path);
      if (mode['.tag'] === 'add' && cur) return reply(409, { error_summary: 'path/conflict/file/..' });
      if (mode['.tag'] === 'update' && (!cur || cur.rev !== mode.update)) return reply(409, { error_summary: 'path/conflict/file/..' });
      const rev = put(arg.path, init.body);
      return reply(200, { name: arg.path, rev });
    }
    if (url.endsWith('/files/download')) {
      const [, f] = resolve(arg.path);
      if (!f) return reply(409, { error_summary: 'path/not_found/..' });
      return reply(200, null, '﻿' + f.text);
    }
    if (url.endsWith('/files/get_metadata')) {
      const a = JSON.parse(init.body);
      const f = files.get(a.path);
      if (!f) return reply(409, { error_summary: 'path/not_found/..' });
      return reply(200, { '.tag': 'file', path_display: a.path, rev: f.rev });
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
  return { files, calls, fetch, put, text: (p) => files.get(p)?.text };
}

function load(dbx) {
  const local = area(), session = area();
  const ctx = {
    console: { log() {}, info() {}, warn() {}, error() {} },
    URL, URLSearchParams, TextEncoder, crypto: globalThis.crypto, btoa, setTimeout, clearTimeout,
    fetch: dbx.fetch,
  };
  ctx.globalThis = ctx;
  ctx.chrome = {
    storage: { local, session },
    identity: { getRedirectURL: () => 'https://abc.chromiumapp.org/' },
    runtime: { getURL: (p) => 'chrome-extension://abc/' + p },
  };
  vm.createContext(ctx);
  for (const f of ['lib/env.js', 'lib/core.js', 'lib/settings.js', 'lib/log.js', 'lib/scope.js', 'lib/dropbox.js']) {
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
    assert.strictEqual((await KS.dropbox.loadScope()).connected, false);
    out('[1] 연결 안 됨 → 건너뜀, 편집기는 "연결 필요" 통과');
  }

  // ---- 2. 첫 내보내기: txt 양식 생성 + agenda(notes 포함) + 위젯 스크립트 ----
  const dbx = fakeDropbox();
  const { KS, local, session } = load(dbx);
  await local.set({ ks_dropbox: { refresh: 'R1', appKey: 'KEY', email: '' }, ks_agenda: agenda('2026-2') });
  let r = await KS.dropbox.exportAgenda();
  assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(r.scope, 'created');
  assert.strictEqual(r.widget, 'created');
  assert.ok(!dbx.files.has('/knou_scope.json'), 'json 양식은 더 이상 만들지 않음');
  const tpl = dbx.text('/knou_scope.txt');
  assert.strictEqual(tpl, '2026-2학기 과제 메모 — 첫 과목명 위에 적은 내용은 위젯에 나오지 않습니다.\n\n행정학개론\n중간평가:\n기말평가:\n\n경영학원론\n중간평가:\n기말평가:\n\n컴퓨터의이해\n중간평가:\n기말평가:\n');
  assert.ok(!/\r|﻿/.test(tpl), 'LF·BOM 없음');
  let ag = JSON.parse(dbx.text('/knou_agenda.json'));
  assert.strictEqual(ag.format, 1);
  assert.strictEqual(ag.items.length, 5);
  assert.ok(!('link' in ag.items[0]), '팝업 전용 link 필드는 내보내지 않음');
  assert.deepStrictEqual(ag.notes['행정학개론'], { mid: '', final: '', memo: '' });
  assert.strictEqual(ag.notesRev, dbx.files.get('/knou_scope.txt').rev);
  assert.ok(/^\d{4}-\d\d-\d\dT/.test(ag.notesSavedAt));
  assert.strictEqual(dbx.text('/KnouWidget.js'), WIDGET);
  out('[2] 첫 내보내기: txt 양식·notes·위젯 스크립트 통과');

  // ---- 3. 사람이 메모를 적은 뒤 다시 동기화 → txt는 그대로, notes에 반영, 위젯은 다시 올리지 않음 ----
  const written = '2026-2학기 과제 메모 — 내 머리말\n\n행정학개론\n교재 2026 개정판\n중간평가:\n기말평가: 정부 규제 사례 분석\nA4 3쪽\n\n경영학원론\n중간평가: 1~5장\n기말평가:\n\n컴퓨터의이해\n중간평가:\n기말평가:\n';
  dbx.put('/knou_scope.txt', written);
  const uploadsBefore = dbx.calls.filter((c) => c.url === '/files/upload' && c.arg.path === '/KnouWidget.js').length;
  r = await KS.dropbox.exportAgenda();
  assert.strictEqual(r.scope, 'kept');
  assert.strictEqual(r.widget, 'same');
  assert.strictEqual(dbx.text('/knou_scope.txt'), written);
  ag = JSON.parse(dbx.text('/knou_agenda.json'));
  assert.deepStrictEqual(ag.notes['행정학개론'], { mid: '', final: '정부 규제 사례 분석\nA4 3쪽', memo: '교재 2026 개정판' });
  assert.strictEqual(ag.notes['경영학원론'].mid, '1~5장');
  assert.strictEqual(dbx.calls.filter((c) => c.url === '/files/upload' && c.arg.path === '/KnouWidget.js').length, uploadsBefore);
  assert.deepStrictEqual((await local.get('ks_notes')).ks_notes.notes['행정학개론'].final, '정부 규제 사례 분석\nA4 3쪽');
  out('[3] 같은 학기 재동기화 → txt 보존, notes 반영, 위젯 안 올림 통과');

  // ---- 4. 머리말에 학기가 없는 txt → 사용자 것으로 보고 학기가 바뀌어도 보존 ----
  dbx.put('/knou_scope.txt', '행정학개론\n기말평가: 내 메모\n');
  await local.set({ ks_agenda: agenda('2027-1') });
  r = await KS.dropbox.exportAgenda();
  assert.strictEqual(r.scope, 'kept');
  assert.strictEqual(dbx.text('/knou_scope.txt'), '행정학개론\n기말평가: 내 메모\n');
  out('[4] 학기 머리말 없는 txt 보존 통과');

  // ---- 5. 학기가 바뀜 → 옛 txt를 archive로, 새 양식 ----
  dbx.put('/knou_scope.txt', written);
  r = await KS.dropbox.exportAgenda();
  assert.strictEqual(r.scope, 'renewed');
  assert.strictEqual(dbx.text('/archive/knou_scope_2026-2.txt'), written);
  assert.ok(dbx.text('/knou_scope.txt').startsWith('2027-1학기 과제 메모'));
  await local.set({ ks_agenda: agenda('2026-2') });
  out('[5] 새 학기 → archive 이동 후 새 양식 통과');

  // ---- 6. 위젯 스크립트: 다른 버전이 있으면 교체, 같은 버전이면 그대로 ----
  // 위젯 버전이 무엇이든 "다른 버전"을 만든다 (첫 줄과 WIDGET_VERSION을 0.0.1로)
  const older = WIDGET.replace(/^(\/\/ KnouWidget v)\d+\.\d+\.\d+/, '$10.0.1').replace(/(const WIDGET_VERSION = ")\d+\.\d+\.\d+(")/, '$10.0.1$2');
  assert.notStrictEqual(older, WIDGET);
  dbx.put('/KnouWidget.js', older);
  await local.remove('ks_widget');
  assert.strictEqual(await KS.dropbox.ensureWidget(), 'updated');
  assert.strictEqual(dbx.text('/KnouWidget.js'), WIDGET);
  dbx.put('/KnouWidget.js', WIDGET); // 사용자가 같은 버전을 다시 올림 (rev만 바뀜)
  assert.strictEqual(await KS.dropbox.ensureWidget(), 'same');
  out('[6] 위젯 스크립트 버전 비교·교체 통과');

  // ---- 7. txt를 못 읽으면 notes 없이 일정은 내보냄 ----
  {
    const orig = dbx.fetch;
    const { KS: K2, local: l2 } = load({ ...dbx, fetch: async (u, i) => (String(u).endsWith('/files/get_metadata') && JSON.parse(i.body).path === '/knou_scope.txt' ? { ok: false, status: 500, async text() { return '{}'; } } : orig(u, i)) });
    await l2.set({ ks_dropbox: { refresh: 'R1', appKey: 'KEY' }, ks_agenda: agenda('2026-2') });
    const r2 = await K2.dropbox.exportAgenda();
    assert.ok(r2.ok, JSON.stringify(r2));
    assert.strictEqual(r2.notes, false);
    assert.ok(!('notes' in JSON.parse(dbx.text('/knou_agenda.json'))));
    out('[7] 과제 메모 읽기 실패 → notes 없이 내보내기 통과');
  }

  // ---- 8. 편집기: 불러오기 → 저장 → 위젯용 JSON 즉시 갱신 ----
  dbx.put('/knou_scope.txt', written);
  let doc = await KS.dropbox.loadScope();
  assert.strictEqual(doc.connected, true);
  assert.deepStrictEqual(doc.courses, ['행정학개론', '경영학원론', '컴퓨터의이해']);
  assert.strictEqual(doc.preamble, '2026-2학기 과제 메모 — 내 머리말');
  assert.strictEqual(doc.memos['행정학개론'].memo, '교재 2026 개정판');
  doc.memos['컴퓨터의이해'].final = '엑셀 함수 10개 정리\n\n  표 포함   ';
  let s = await KS.dropbox.saveScope({ preamble: doc.preamble, memos: doc.memos, rev: doc.rev });
  assert.ok(s.ok, JSON.stringify(s));
  assert.ok(dbx.text('/knou_scope.txt').includes('컴퓨터의이해\n중간평가:\n기말평가: 엑셀 함수 10개 정리\n\n  표 포함\n'));
  assert.ok(dbx.text('/knou_scope.txt').startsWith('2026-2학기 과제 메모 — 내 머리말\n\n'), '머리말 보존');
  assert.strictEqual(JSON.parse(dbx.text('/knou_agenda.json')).notes['컴퓨터의이해'].final, '엑셀 함수 10개 정리\n\n  표 포함');
  out('[8] 편집기 저장 → 머리말 보존, notes 즉시 갱신 통과');

  // ---- 9. 충돌: 편집하는 사이 다른 곳(위젯)에서 저장 → 덮어쓰지 않음 ----
  doc = await KS.dropbox.loadScope();
  const otherEdit = dbx.text('/knou_scope.txt').replace('중간평가: 1~5장', '중간평가: 1~6장 (아이패드에서 고침)');
  dbx.put('/knou_scope.txt', otherEdit);
  doc.memos['행정학개론'].mid = 'PC에서 고침';
  s = await KS.dropbox.saveScope({ preamble: doc.preamble, memos: doc.memos, rev: doc.rev });
  assert.strictEqual(s.ok, false);
  assert.strictEqual(s.conflict, true);
  assert.strictEqual(dbx.text('/knou_scope.txt'), otherEdit, '다른 곳의 내용이 그대로');
  out('[9] 저장 충돌 → 덮어쓰지 않음 통과');

  // ---- 10. txt가 없을 때 편집기: 옛 json으로 시작, 저장하면 txt를 새로 만듦(add) ----
  dbx.files.delete('/knou_scope.txt');
  dbx.put('/knou_scope.json', JSON.stringify({ format: 1, semester: '2026-2', items: [{ course: '경영학원론', kind: '기말평가', scope: '옛 json 메모' }] }));
  doc = await KS.dropbox.loadScope();
  assert.strictEqual(doc.exists, false);
  assert.strictEqual(doc.memos['경영학원론'].final, '옛 json 메모');
  s = await KS.dropbox.saveScope({ preamble: doc.preamble, memos: doc.memos, rev: doc.rev });
  assert.ok(s.ok);
  assert.ok(dbx.text('/knou_scope.txt').startsWith('2026-2학기 과제 메모'));
  assert.ok(dbx.text('/knou_scope.txt').includes('기말평가: 옛 json 메모'));
  assert.ok(dbx.files.has('/knou_scope.json'), '옛 json은 지우지 않음');
  out('[10] txt 없음 → 옛 json으로 시작, 저장 시 txt 생성 통과');

  // ---- 11. 접근 토큰 만료(401) → 한 번 갱신 후 성공 ----
  await session.set({ ks_dbx_token: { token: 'stale', exp: Date.now() + 3600e3 } });
  r = await KS.dropbox.exportAgenda();
  assert.ok(r.ok, JSON.stringify(r));
  out('[11] 401 → 토큰 갱신 후 재시도 통과');

  // ---- 12. 갱신 토큰 무효 → 실패를 기록하고 예외는 던지지 않음 (동기화 보호) ----
  await local.set({ ks_dropbox: { refresh: 'BAD', appKey: 'KEY' } });
  await session.remove('ks_dbx_token');
  r = await KS.dropbox.exportAgenda();
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'DROPBOX_AUTH');
  await assert.rejects(() => KS.dropbox.exportAgenda({ quiet: false }));
  out('[12] 연결 만료 → 실패 기록, 동기화는 계속 통과');

  // ---- 13. 앱 키: 직접 입력한 키가 내장 키보다 우선 ----
  KS.env.dropboxAppKey = 'BUILTIN';
  assert.strictEqual(KS.effectiveDropboxKey({ dropboxAppKey: '' }), 'BUILTIN');
  assert.strictEqual(KS.effectiveDropboxKey({ dropboxAppKey: ' MINE ' }), 'MINE');
  KS.env.dropboxAppKey = '';
  out('[13] 내장 앱 키 / 직접 입력 키 우선순위 통과');

  // ---- 14. 연결 해제 ----
  await KS.dropbox.disconnect();
  assert.strictEqual((await KS.dropbox.status()).connected, false);
  out('[14] 연결 해제 통과');

  out('모든 Dropbox 점검 통과');
})().catch((e) => { console.error(e); process.exit(1); });
