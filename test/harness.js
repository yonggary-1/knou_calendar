// 테스트 공용: 가짜 확장 저장소, 가짜 Dropbox, 확장 스크립트 불러오기 (네트워크 사용 안 함)
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const SRC = path.join(__dirname, '..', 'src');
const WIDGET = fs.readFileSync(path.join(SRC, 'widget', 'KnouWidget.js'), 'utf8');

// ---- 가짜 확장 저장소 ----
// quota: storage.sync처럼 항목당·전체 바이트 한도를 흉내 낸다
function area(quota) {
  const m = {};
  const size = (k, v) => Buffer.byteLength(k + JSON.stringify(v));
  return {
    data: m,
    async get(keys) {
      const ks = Array.isArray(keys) ? keys : [keys];
      const r = {};
      for (const k of ks) if (k in m) r[k] = JSON.parse(JSON.stringify(m[k]));
      return r;
    },
    async set(o) {
      if (quota) {
        for (const [k, v] of Object.entries(o)) if (size(k, v) > quota.item) throw new Error('QUOTA_BYTES_PER_ITEM quota exceeded');
        const next = { ...m, ...o };
        if (Object.entries(next).reduce((n, [k, v]) => n + size(k, v), 0) > quota.total) throw new Error('QUOTA_BYTES quota exceeded');
      }
      for (const [k, v] of Object.entries(o)) m[k] = JSON.parse(JSON.stringify(v));
    },
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
  const o = { offline: false };
  async function fetch(url, init = {}) {
    url = String(url);
    if (o.offline && !url.startsWith('chrome-extension://')) throw new TypeError('Failed to fetch'); // 인터넷·Dropbox 끊김 흉내
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
  return Object.assign(o, { files, calls, fetch, put, text: (p) => files.get(p)?.text });
}

function load(dbx) {
  const local = area(), session = area(), sync = area({ item: 8192, total: 102400 });
  const ctx = {
    console: { log() {}, info() {}, warn() {}, error() {} },
    URL, URLSearchParams, TextEncoder, crypto: globalThis.crypto, btoa, setTimeout, clearTimeout,
    fetch: dbx.fetch,
  };
  ctx.globalThis = ctx;
  ctx.chrome = {
    storage: { local, session, sync },
    identity: { getRedirectURL: () => 'https://abc.chromiumapp.org/' },
    runtime: { getURL: (p) => 'chrome-extension://abc/' + p },
  };
  vm.createContext(ctx);
  for (const f of ['lib/env.js', 'lib/core.js', 'lib/settings.js', 'lib/log.js', 'lib/scope.js', 'lib/scopestore.js', 'lib/memo.js', 'lib/dropbox.js']) {
    vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
  }
  return { KS: ctx.KS, local, session, sync, ctx };
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


module.exports = { area, fakeDropbox, load, agenda, WIDGET, SRC };
