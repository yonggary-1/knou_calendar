// Dropbox 내보내기: 위젯(KnouWidget, Scriptable)이 읽을 파일을 앱 폴더(Apps\KnouWidget)에 둔다
//  - knou_agenda.json : 동기화할 때마다 확장이 덮어씀. 과제 메모를 해석한 notes 포함 (사람이 고치지 않음)
//  - knou_scope.txt   : 과제 메모 원본. 사람·위젯 편집기·확장 편집기가 고친다 (형식은 lib/scope.js)
//    없을 때만 양식을 만들고, 머리말의 학기가 바뀌면 옛 파일을 archive\knou_scope_<학기>.txt 로 옮긴다
//  - KnouWidget.js    : 위젯 스크립트. 없거나 버전이 다를 때만 올린다
//  - knou_scope.json  : 1.4~1.5의 옛 양식. 이제 만들지 않으며, 있는 파일도 지우지 않는다
(() => {
  const KS = globalThis.KS;
  const AUTH = 'https://www.dropbox.com/oauth2/authorize';
  const TOKEN = 'https://api.dropboxapi.com/oauth2/token';
  const API = 'https://api.dropboxapi.com/2';
  const CONTENT = 'https://content.dropboxapi.com/2';
  const AGENDA_PATH = '/knou_agenda.json';
  const SCOPE_PATH = '/knou_scope.json'; // 옛 양식 (읽기만, txt가 없을 때 편집기 시작값)
  const SCOPE_TXT_PATH = '/knou_scope.txt';
  const WIDGET_PATH = '/KnouWidget.js';
  const FORMAT = 1;

  const appKeyOf = (s) => KS.effectiveDropboxKey(s); // 직접 입력한 키 > 내장 키

  // ---------- PKCE ----------
  const b64url = (bytes) => {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  async function pkce() {
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return { verifier, challenge: b64url(new Uint8Array(digest)) };
  }

  // ---------- 토큰 ----------
  async function getLink() {
    return (await KS.ext.storage.local.get('ks_dropbox')).ks_dropbox || null;
  }

  async function postForm(url, params) {
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString(),
      });
    } catch (e) {
      throw new KS.KsError('NETWORK', 'Dropbox 서버에 연결할 수 없습니다.');
    }
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = j.error || 'http ' + res.status;
      if (err === 'invalid_grant') throw new KS.KsError('DROPBOX_AUTH', 'Dropbox 연결이 만료되었습니다. 설정에서 다시 연결하세요.');
      throw new KS.KsError('DROPBOX', `Dropbox 인증 오류 (${err})`);
    }
    return j;
  }

  async function connect() {
    const settings = await KS.getSettings();
    const appKey = appKeyOf(settings);
    if (!appKey) throw new KS.KsError('NEED_CONFIG', '이 빌드에는 Dropbox 앱 키가 없습니다. 설정 > 고급에서 입력하세요.');
    const { verifier, challenge } = await pkce();
    const state = crypto.randomUUID();
    const redirectUri = KS.ext.identity.getRedirectURL();
    const p = new URLSearchParams({
      client_id: appKey,
      response_type: 'code',
      redirect_uri: redirectUri,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      token_access_type: 'offline',
      state,
    });
    let redirect;
    try {
      // 구글 인증과 같은 창 잠금·시간 제한(5분)을 쓴다 (gauth.js launchFlow)
      redirect = await KS.gauth.launchFlow(AUTH + '?' + p.toString(), true);
    } catch (e) {
      const msg = String(e?.message || e);
      KS.log('warn', 'Dropbox 인증 창 실패', msg);
      if (msg === 'flow_busy' || /only one web auth flow/i.test(msg)) {
        throw new KS.KsError('DROPBOX', '이전 로그인 창(구글·Dropbox)이 아직 열려 있습니다. 오류 화면이 떠 있는 창이 있으면 닫고 다시 시도하세요. 창이 보이지 않으면 확장 관리 화면에서 Knou calendar를 새로고침(↻)하세요. 설정과 연결은 그대로 남습니다.');
      }
      if (msg.startsWith('timeout')) throw new KS.KsError('DROPBOX', 'Dropbox 연결 창이 5분 안에 완료되지 않았습니다. 다시 시도해 주세요.');
      throw new KS.KsError('DROPBOX', 'Dropbox 연결이 취소되었거나 완료되지 않았습니다. 앱 설정의 Redirect URI에 이 브라우저의 리디렉션 URI가 등록되어 있는지 확인하세요.');
    }
    const u = new URL(redirect);
    const err = u.searchParams.get('error');
    if (err) throw new KS.KsError('DROPBOX', `Dropbox 연결이 완료되지 않았습니다. (${err})`);
    if (u.searchParams.get('state') !== state) throw new KS.KsError('DROPBOX', 'Dropbox 인증 응답 검증에 실패했습니다. 다시 시도해 주세요.');
    const code = u.searchParams.get('code');
    if (!code) throw new KS.KsError('DROPBOX', 'Dropbox가 인증 코드를 주지 않았습니다.');

    const t = await postForm(TOKEN, {
      code,
      grant_type: 'authorization_code',
      code_verifier: verifier,
      client_id: appKey,
      redirect_uri: redirectUri,
    });
    if (!t.refresh_token) throw new KS.KsError('DROPBOX', 'Dropbox가 갱신 토큰을 주지 않았습니다.');

    let email = '';
    try {
      const r = await fetch(API + '/users/get_current_account', { method: 'POST', headers: { Authorization: 'Bearer ' + t.access_token } });
      if (r.ok) email = (await r.json()).email || '';
    } catch { /* 표시용 */ }

    await KS.ext.storage.local.set({ ks_dropbox: { refresh: t.refresh_token, appKey, email, connectedAt: Date.now() } });
    await KS.ext.storage.session.set({ ks_dbx_token: { token: t.access_token, exp: Date.now() + (t.expires_in || 14400) * 1000 } });
    KS.log('info', 'Dropbox 연결');
    return { email };
  }

  async function accessToken() {
    const link = await getLink();
    if (!link?.refresh) throw new KS.KsError('DROPBOX_AUTH', 'Dropbox가 연결되어 있지 않습니다.');
    const c = (await KS.ext.storage.session.get('ks_dbx_token')).ks_dbx_token;
    if (c && c.exp > Date.now() + 60000) return c.token;
    const t = await postForm(TOKEN, { grant_type: 'refresh_token', refresh_token: link.refresh, client_id: link.appKey });
    await KS.ext.storage.session.set({ ks_dbx_token: { token: t.access_token, exp: Date.now() + (t.expires_in || 14400) * 1000 } });
    return t.access_token;
  }

  async function disconnect() {
    try {
      const token = await accessToken();
      await fetch(API + '/auth/token/revoke', { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
    } catch { /* 이미 끊긴 경우 */ }
    await KS.ext.storage.local.remove(['ks_dropbox', 'ks_dbx_last']);
    await KS.ext.storage.session.remove('ks_dbx_token');
    KS.log('info', 'Dropbox 연결 해제');
  }

  // ---------- 파일 API ----------
  // Dropbox-API-Arg 헤더는 ASCII만 허용 → 경로는 모두 영문으로 둔다
  async function content(endpoint, arg, body) {
    for (let attempt = 0; ; attempt++) {
      const token = await accessToken();
      let res;
      try {
        res = await fetch(CONTENT + endpoint, {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + token,
            'Dropbox-API-Arg': JSON.stringify(arg),
            ...(body !== undefined ? { 'Content-Type': 'application/octet-stream' } : {}),
          },
          body,
        });
      } catch (e) {
        if (attempt < 2) { await KS.sleep(1000 * 2 ** attempt); continue; }
        throw new KS.KsError('NETWORK', 'Dropbox 서버에 연결할 수 없습니다.');
      }
      if (res.status === 401 && attempt === 0) {
        await KS.ext.storage.session.remove('ks_dbx_token');
        continue;
      }
      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        await KS.sleep(1000 * 2 ** attempt);
        continue;
      }
      return res;
    }
  }

  async function summary(res) {
    try { return JSON.parse(await res.text()).error_summary || ''; } catch { return ''; }
  }

  async function upload(path, text, mode) {
    const res = await content('/files/upload', { path, mode, autorename: false, mute: true }, text);
    if (res.ok) return { ok: true };
    const s = await summary(res);
    if (res.status === 409 && /conflict/.test(s)) return { ok: false, conflict: true };
    throw new KS.KsError('DROPBOX', `Dropbox 저장 오류 (${res.status}${s ? ' ' + s : ''})`);
  }

  async function download(path) {
    const res = await content('/files/download', { path });
    if (res.ok) return (await res.text()).replace(/^﻿/, '');
    const s = await summary(res);
    if (res.status === 409 && /not_found/.test(s)) return null;
    throw new KS.KsError('DROPBOX', `Dropbox 읽기 오류 (${res.status}${s ? ' ' + s : ''})`);
  }

  async function rpc(endpoint, body) {
    for (let attempt = 0; ; attempt++) {
      const token = await accessToken();
      let res;
      try {
        res = await fetch(API + endpoint, {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch (e) {
        if (attempt < 2) { await KS.sleep(1000 * 2 ** attempt); continue; }
        throw new KS.KsError('NETWORK', 'Dropbox 서버에 연결할 수 없습니다.');
      }
      if (res.status === 401 && attempt === 0) { await KS.ext.storage.session.remove('ks_dbx_token'); continue; }
      if ((res.status === 429 || res.status >= 500) && attempt < 3) { await KS.sleep(1000 * 2 ** attempt); continue; }
      return res;
    }
  }

  // 파일 정보 (없으면 null)
  async function metadata(path) {
    const res = await rpc('/files/get_metadata', { path });
    if (res.ok) return res.json();
    const s = await summary(res);
    if (res.status === 409 && /not_found/.test(s)) return null;
    throw new KS.KsError('DROPBOX', `Dropbox 파일 정보 오류 (${res.status}${s ? ' ' + s : ''})`);
  }

  // 내용과 그 버전(rev)을 함께. rev를 먼저 받고 그 rev로 내려받으므로 둘이 어긋나지 않는다
  async function readTextWithRev(path) {
    const meta = await metadata(path);
    if (!meta?.rev) return { text: null, rev: null };
    const text = await download('rev:' + meta.rev);
    return { text, rev: meta.rev };
  }

  // rev가 있으면 그 버전일 때만 덮어씀(그 사이 다른 곳에서 고쳤으면 conflict), 없으면 새 파일로만 만듦
  async function writeTextIfUnchanged(path, text, rev) {
    const mode = rev ? { '.tag': 'update', update: rev } : { '.tag': 'add' };
    const res = await content('/files/upload', { path, mode, autorename: false, mute: true }, text);
    if (res.ok) {
      let meta = null;
      try { meta = await res.json(); } catch { /* 본문 없음 */ }
      return { ok: true, rev: meta?.rev || null };
    }
    const s = await summary(res);
    if (res.status === 409 && /conflict/.test(s)) return { ok: false, conflict: true };
    throw new KS.KsError('DROPBOX', `Dropbox 저장 오류 (${res.status}${s ? ' ' + s : ''})`);
  }

  async function move(from, to) {
    const token = await accessToken();
    const res = await fetch(API + '/files/move_v2', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_path: from, to_path: to, autorename: true }),
    });
    if (!res.ok) throw new KS.KsError('DROPBOX', `Dropbox 이동 오류 (${res.status} ${await summary(res)})`);
  }

  // ---------- 내보낼 내용 ----------
  const KIND_NAME = { mid: '중간평가', final: '기말평가' };

  // notes: { notes, rev, at } — 과제 메모를 해석한 결과 (못 읽었으면 null → 필드를 뺀다)
  function agendaFile(agenda, notes) {
    const extra = notes?.notes
      ? { notes: notes.notes, notesRev: notes.rev || '', notesSavedAt: new Date(notes.at || Date.now()).toISOString() }
      : {};
    return {
      format: FORMAT,
      generator: `Knou calendar ${KS.env.version}`,
      savedAt: new Date(agenda.savedAt || Date.now()).toISOString(),
      semester: agenda.semester || '',
      courses: agenda.courses || [],
      items: (agenda.items || []).map((it) => ({
        course: it.course,
        kind: it.kind,
        label: it.label,
        detail: it.detail || '',
        start: it.start || null,
        end: it.end,
        place: it.place || '',
        due: !!it.due,
      })),
      ...extra,
    };
  }

  // 과목마다 중간·기말 칸을 하나씩 (agenda에 그 평가가 있을 때). 평가가 하나도 없는 과목은 빈 칸 하나
  function scopeTemplate(agenda) {
    const items = [];
    const courses = agenda.courses?.length ? agenda.courses : [...new Set((agenda.items || []).map((i) => i.course).filter((c) => c !== '형성평가'))];
    for (const course of courses) {
      const kinds = [];
      for (const it of agenda.items || []) {
        if (it.course !== course || !KIND_NAME[it.kind]) continue;
        if (!kinds.includes(it.kind)) kinds.push(it.kind);
      }
      if (!kinds.length) items.push({ course, kind: '', scope: '' });
      for (const k of ['mid', 'final']) if (kinds.includes(k)) items.push({ course, kind: KIND_NAME[k], scope: '' });
    }
    return {
      format: FORMAT,
      semester: agenda.semester || '',
      note: 'scope 칸에 레포트 주제·분량이나 시험 범위를 적으세요. Knou calendar는 이 파일이 없을 때만 만들고, 이후로는 고치지 않습니다.',
      items,
    };
  }

  const json = (o) => JSON.stringify(o, null, 2) + '\n';

  const coursesOf = (agenda) =>
    agenda?.courses?.length ? agenda.courses : [...new Set((agenda?.items || []).map((i) => i.course).filter((c) => c && c !== '형성평가'))];

  // knou_scope.txt 양식: 없을 때만 만든다. 머리말의 학기가 지금 학기와 다를 때만 옛 파일을 archive로 옮기고 새로 만든다
  async function ensureScopeTxt(agenda) {
    const sem = agenda.semester || '';
    const text = KS.scope.templateTxt(sem, coursesOf(agenda));
    const first = await upload(SCOPE_TXT_PATH, text, 'add');
    if (first.ok) return 'created';
    if (!sem) return 'kept';
    const oldSem = KS.scope.semesterOfTxt(await download(SCOPE_TXT_PATH));
    if (!oldSem || oldSem === sem) return 'kept'; // 머리말이 없거나 학기를 못 읽으면 사용자 것으로 보고 손대지 않음
    await move(SCOPE_TXT_PATH, `/archive/knou_scope_${oldSem.replace(/[^0-9A-Za-z_-]/g, '')}.txt`);
    const again = await upload(SCOPE_TXT_PATH, text, 'add');
    return again.ok ? 'renewed' : 'kept';
  }

  // 과제 메모를 읽어 notes로. 실패하면 null (일정 내보내기는 계속)
  async function readNotes(agenda) { // agenda: { courses } 만 있어도 됨
    try {
      const { text, rev } = await readTextWithRev(SCOPE_TXT_PATH);
      if (text === null) return null;
      const notes = { notes: KS.scope.notesOf(text, coursesOf(agenda)), rev, at: Date.now() };
      await KS.ext.storage.local.set({ ks_notes: notes }); // 다음 동기화의 캘린더 설명란용
      return notes;
    } catch (e) {
      KS.log('warn', '과제 메모 읽기 실패 — notes 없이 내보냄', String(e?.message || e));
      return null;
    }
  }

  // ---------- 위젯 스크립트 배포 ----------
  const widgetVersionOf = (text) => /^\/\/ KnouWidget v(\d+\.\d+\.\d+)/.exec(String(text || '').replace(/^\uFEFF/, ''))?.[1] || '';
  let bundledWidget = null;
  async function bundled() {
    if (!bundledWidget) {
      const text = await (await fetch(KS.ext.runtime.getURL('widget/KnouWidget.js'))).text();
      bundledWidget = { text, version: widgetVersionOf(text) };
    }
    return bundledWidget;
  }

  // 앱 폴더의 KnouWidget.js가 없거나 버전이 다를 때만 올린다 (매번 덮어쓰지 않음)
  async function ensureWidget() {
    const mine = await bundled();
    if (!mine.version) return 'skipped';
    const meta = await metadata(WIDGET_PATH);
    const known = (await KS.ext.storage.local.get('ks_widget')).ks_widget;
    if (meta?.rev && known?.rev === meta.rev && known.version === mine.version) return 'same';
    if (meta?.rev) {
      const theirs = widgetVersionOf(await download('rev:' + meta.rev));
      if (theirs === mine.version) {
        await KS.ext.storage.local.set({ ks_widget: { rev: meta.rev, version: theirs } });
        return 'same';
      }
    }
    const r = await writeTextIfUnchanged(WIDGET_PATH, mine.text, meta?.rev || null);
    if (!r.ok) return 'conflict'; // 그 사이 다른 곳에서 바뀜 → 다음 내보내기 때 다시 확인
    await KS.ext.storage.local.set({ ks_widget: { rev: r.rev, version: mine.version } });
    KS.log('info', '위젯 스크립트 올림', { version: mine.version, before: meta?.rev ? 'updated' : 'new' });
    return meta?.rev ? 'updated' : 'created';
  }

  // 동기화가 끝난 뒤 호출. 실패해도 동기화 결과에는 영향을 주지 않는다
  async function exportAgenda({ quiet = true } = {}) {
    const link = await getLink();
    if (!link?.refresh) return { skipped: true };
    const agenda = (await KS.ext.storage.local.get('ks_agenda')).ks_agenda;
    if (!agenda?.items) return { skipped: true, reason: 'no_agenda' };
    try {
      const scope = await ensureScopeTxt(agenda); // 양식이 먼저 있어야 notes가 과목 목록과 맞는다
      const notes = await readNotes(agenda);
      await upload(AGENDA_PATH, json(agendaFile(agenda, notes)), 'overwrite');
      let widget = 'skipped';
      try { widget = await ensureWidget(); } catch (e) { KS.log('warn', '위젯 스크립트 확인 실패', String(e?.message || e)); widget = 'error'; }
      const last = { ok: true, at: Date.now(), scope, items: agenda.items.length, notes: !!notes, widget };
      await KS.ext.storage.local.set({ ks_dbx_last: last });
      KS.log('info', 'Dropbox 내보내기', { items: last.items, scope, notes: !!notes, widget });
      return last;
    } catch (e) {
      const last = { ok: false, at: Date.now(), message: String(e?.message || e), code: e?.code || 'UNKNOWN' };
      await KS.ext.storage.local.set({ ks_dbx_last: last });
      KS.log('warn', 'Dropbox 내보내기 실패', { code: last.code, msg: last.message });
      if (!quiet) throw e;
      return last;
    }
  }

  // ---------- 과제 메모 편집기 ----------
  async function loadScope() {
    if (!(await getLink())?.refresh) return { connected: false };
    const agenda = (await KS.ext.storage.local.get('ks_agenda')).ks_agenda;
    const courses = coursesOf(agenda);
    if (!courses.length) return { connected: true, courses: [] };
    const { text, rev } = await readTextWithRev(SCOPE_TXT_PATH);
    let parsed;
    if (text !== null) parsed = KS.scope.parseScopeTxt(text, courses);
    else {
      // txt가 아직 없으면 옛 json 내용으로 시작 (저장하면 txt가 새로 생김)
      let old = null;
      try { old = JSON.parse((await download(SCOPE_PATH)) || 'null'); } catch { old = null; }
      parsed = { items: old?.items || [], preamble: KS.scope.headerFor(agenda?.semester || '') };
    }
    const memos = {};
    for (const c of courses) memos[c] = KS.scope.memoOf(parsed, c);
    return { connected: true, courses, preamble: parsed.preamble, memos, rev, exists: text !== null, semester: agenda?.semester || '' };
  }

  // 저장 → 성공하면 위젯용 JSON을 바로 다시 내보낸다 (예외 규칙: markDone 밖에서 내보내는 유일한 경우)
  async function saveScope({ preamble, memos, rev }) {
    const agenda = (await KS.ext.storage.local.get('ks_agenda')).ks_agenda;
    const courses = coursesOf(agenda);
    const text = KS.scope.scopeToTxt(preamble || '', courses, memos || {});
    const r = await writeTextIfUnchanged(SCOPE_TXT_PATH, text, rev || null);
    if (!r.ok) {
      KS.log('warn', '과제 메모 저장 충돌 — 저장하지 않음');
      return { ok: false, conflict: true };
    }
    KS.log('info', '과제 메모 저장', { courses: courses.length });
    let exported = null;
    try { exported = await exportAgenda({ quiet: true }); } catch { exported = null; }
    return { ok: true, rev: r.rev, exported };
  }

  async function status() {
    const [link, last] = await Promise.all([getLink(), KS.ext.storage.local.get('ks_dbx_last')]);
    return { connected: !!link?.refresh, email: link?.email || '', last: last.ks_dbx_last || null };
  }

  KS.dropbox = { connect, disconnect, exportAgenda, readNotes, status, agendaFile, scopeTemplate, loadScope, saveScope, ensureWidget, readTextWithRev, AGENDA_PATH, SCOPE_PATH, SCOPE_TXT_PATH, WIDGET_PATH };
})();
