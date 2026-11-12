(async () => {
  const { h, send, ext } = KS;
  const $ = (id) => document.getElementById(id);
  const CHECKS = ['showPeriod', 'showDeadline', 'showFormative', 'autoApply'];
  const TEXTS = ['clientId', 'calendarName', 'classReminders', 'deadlineReminders', 'dropboxAppKey'];

  $('ver').textContent = `버전 ${KS.env.version} · ${KS.env.target === 'firefox' ? 'Firefox' : 'Chrome · Edge · 웨일 · 오페라'} 빌드`;
  $('redirect').value = ext.identity.getRedirectURL();
  $('btnCopy').onclick = async () => {
    try { await navigator.clipboard.writeText($('redirect').value); $('btnCopy').textContent = '복사됨'; }
    catch { $('redirect').select(); }
    setTimeout(() => ($('btnCopy').textContent = '복사'), 1500);
  };

  const builtin = String(KS.env.clientId || '').trim();
  $('builtinInfo').textContent = builtin
    ? `이 빌드에는 구글 클라이언트 ID가 내장되어 있어 따로 입력할 필요가 없습니다. (${builtin.slice(0, 12)}…)`
    : '이 빌드에는 내장된 구글 클라이언트 ID가 없습니다. 직접 만든 클라이언트 ID를 아래에 입력하세요.';
  if (!builtin) $('advanced').open = true;

  let settings = await KS.getSettings();
  for (const k of TEXTS) $(k).value = settings[k] ?? '';
  for (const k of CHECKS) $(k).checked = !!settings[k];
  $('scopeMode').value = settings.scopeMode;
  $('pastRange').value = settings.pastRange === 'all' ? 'all' : '2w';
  if (settings.clientId || settings.scopeMode !== 'app') $('advanced').open = true;
  const dbxBuiltin = String(KS.env.dropboxAppKey || '').trim();
  $('dbxBuiltinInfo').textContent = dbxBuiltin
    ? `이 빌드에는 Dropbox 앱 키가 내장되어 있어 따로 입력할 필요가 없습니다. (${dbxBuiltin})`
    : '이 빌드에는 Dropbox 앱 키가 없습니다. Dropbox 내보내기를 쓰려면 직접 만든 앱 키를 입력하세요.';
  if (settings.dropboxAppKey) $('advanced').open = true;

  // ---- 1. 계정: 구글 ----
  const ACCOUNT_HINT = $('accountHint').innerHTML;
  let gNote = null; // 방금 띄운 안내는 잠시 유지 (저장소 변경으로 다시 그릴 때 지워지지 않게)
  async function showAccount(note, bad) {
    if (note) gNote = { note, bad: !!bad, at: Date.now() };
    else if (gNote && Date.now() - gNote.at < 10000) ({ note, bad } = gNote);
    const a = (await ext.storage.local.get('ks_account')).ks_account;
    const st = (await send('status')) || {};
    const need = st.state?.phase === 'need_google';
    $('gDot').className = 'dot ' + (a?.email && !need ? 'ok' : 'bad');
    $('account').textContent = a?.email || '연결 안 됨';
    $('account').className = 'who' + (a?.email ? '' : ' muted');
    $('btnGoogle').hidden = !!a?.email && !need;
    $('btnGoogle').textContent = a?.email ? '다시 연결' : '연결';
    $('btnSwitch').hidden = !a?.email;
    $('btnDisconnect').hidden = !a?.email;
    if (note) { $('accountHint').textContent = note; $('accountHint').classList.toggle('bad', !!bad); }
    else if (need && st.state?.message) { $('accountHint').textContent = st.state.message; $('accountHint').classList.add('bad'); }
    else { $('accountHint').innerHTML = ACCOUNT_HINT; $('accountHint').classList.remove('bad'); }
  }
  await showAccount();
  const googleBusy = (on) => { for (const id of ['btnGoogle', 'btnSwitch', 'btnDisconnect']) $(id).disabled = on; };
  $('btnGoogle').onclick = async () => {
    googleBusy(true);
    await showAccount('구글 로그인 창에서 계정을 고르고, 권한 화면에서 캘린더 항목을 체크한 뒤 계속을 눌러 주세요. 창이 브라우저 뒤에 숨어 있을 수 있습니다.');
    const r = await send('connectGoogle'); // 연결만 한다. 동기화가 구글 연결을 기다리던 중이었으면 이어서 진행 (background.js)
    googleBusy(false);
    if (!r?.ok) { await showAccount(r?.message || '구글 연결에 실패했습니다.', true); return; }
    await showAccount(r.resumed ? '연결했습니다. 기다리던 동기화를 이어서 진행합니다. 팝업에서 확인하세요.' : '연결했습니다. 팝업에서 동기화를 눌러 주세요.');
  };
  $('btnSwitch').onclick = async () => {
    googleBusy(true);
    await showAccount('구글 로그인 창에서 쓸 계정을 골라 주세요…');
    const r = await send('switchAccount');
    googleBusy(false);
    await showAccount(r?.phase === 'idle' ? r.message : r?.message || '계정을 바꾸지 못했습니다.', r?.phase !== 'idle');
  };
  $('btnDisconnect').onclick = async () => {
    if (!confirm('구글 연결을 해제할까요? 캘린더의 일정은 그대로 남습니다.')) return;
    await send('disconnect');
    await showAccount();
  };

  // ---- Dropbox ----
  $('dbxRedirect').value = ext.identity.getRedirectURL();
  $('btnCopyDbx').onclick = async () => {
    try { await navigator.clipboard.writeText($('dbxRedirect').value); $('btnCopyDbx').textContent = '복사됨'; }
    catch { $('dbxRedirect').select(); }
    setTimeout(() => ($('btnCopyDbx').textContent = '복사'), 1500);
  };
  const SCOPE_TEXT = { created: '과제 메모 양식을 새로 만듦', renewed: '새 학기 과제 메모 양식을 만들고 옛 파일은 archive로 옮김', kept: '과제 메모 반영' };
  const WIDGET_TEXT = { created: '위젯 스크립트를 올림', updated: '위젯 스크립트 새 버전을 올림', same: '', conflict: '', error: '위젯 스크립트 확인 실패', skipped: '' };
  async function showDropbox(note) {
    const s = (await send('dropboxStatus')) || {};
    const failed = s.connected && s.last && s.last.ok === false;
    $('dDot').className = 'dot ' + (s.connected && !failed ? 'ok' : 'bad');
    $('dbxAccount').textContent = s.connected ? s.email || '연결됨' : '연결 안 됨';
    $('dbxAccount').className = 'who' + (s.connected ? '' : ' muted');
    $('btnDbxConnect').textContent = s.connected ? '다시 연결' : '연결';
    $('btnDbxConnect').className = s.connected ? '' : 'primary';
    $('dbxHidden').closest('label').hidden = !!s.connected;
    $('btnDbxDisconnect').hidden = !s.connected;
    const l = s.last;
    $('dbxLast').textContent = note
      || (!l ? (s.connected ? '아직 내보낸 적이 없습니다. 팝업에서 [동기화 확인 & Dropbox 내보내기]를 누르세요.' : '')
        : l.ok ? [`마지막 내보내기 ${KS.fmtTime(l.at)}`, `일정 ${l.items}건`, l.scope === 'kept' && l.notes === false ? '과제 메모를 읽지 못함' : SCOPE_TEXT[l.scope], WIDGET_TEXT[l.widget]].filter(Boolean).join(' · ')
        : `마지막 내보내기 실패 ${KS.fmtTime(l.at)} — ${l.message}`);
  }
  await showDropbox();
  $('dbxHidden').checked = !!settings.dropboxHidden;
  $('dbxHidden').onchange = async () => { settings = await KS.saveSettings({ dropboxHidden: $('dbxHidden').checked }); };
  $('btnDbxConnect').onclick = async () => {
    // 고급에 입력한 앱 키가 있으면 먼저 저장 (비어 있으면 내장 키 사용)
    settings = await KS.saveSettings({ dropboxAppKey: $('dropboxAppKey').value.trim() });
    if (!KS.effectiveDropboxKey(settings)) { $('advanced').open = true; await showDropbox('이 빌드에는 Dropbox 앱 키가 없습니다. 고급에서 앱 키를 입력하세요.'); return; }
    await showDropbox('Dropbox 창에서 허용을 눌러 주세요…');
    const r = await send('connectDropbox'); // 연결 + 숨김 해제 + 바로 한 번 내보내기 (background.js)
    if (!r?.ok) { await showDropbox(r?.message || 'Dropbox 연결에 실패했습니다.'); return; }
    settings = await KS.getSettings();
    $('dbxHidden').checked = !!settings.dropboxHidden;
    await showDropbox(r.exported?.ok === false ? r.exported.message : undefined);
  };
  $('btnDbxDisconnect').onclick = async () => {
    if (!confirm('Dropbox 연결을 해제할까요? Dropbox에 있는 파일은 그대로 남습니다.')) return;
    await send('disconnectDropbox');
    await showDropbox();
  };

  // 팝업에서 "구글 연결이 필요합니다" 등으로 넘어왔을 때 그 칸을 보여 준다 (background.js의 openOptions가 ks_options_focus를 남김)
  const FOCUS = { google: 'acctGoogle', dropbox: 'acctDropbox', accounts: 'accounts' };
  async function focusRequested() {
    const f = (await ext.storage.session.get('ks_options_focus')).ks_options_focus;
    if (!f) return;
    await ext.storage.session.remove('ks_options_focus');
    if (Date.now() - f.at > 60000 || !FOCUS[f.focus]) return;
    const el = $(FOCUS[f.focus]);
    el.scrollIntoView({ block: 'center' });
    if (el.classList.contains('acct')) {
      el.classList.add('focus');
      setTimeout(() => el.classList.remove('focus'), 2500);
    }
  }
  focusRequested();
  ext.storage.onChanged.addListener((ch, area) => {
    if (area === 'session' && ch.ks_options_focus?.newValue) { focusRequested(); showAccount(); showDropbox(); }
  });
  // 다른 곳(팝업·백그라운드)에서 연결 상태가 바뀌면 다시 그린다
  ext.storage.onChanged.addListener((ch, area) => {
    if (area === 'local' && (ch.ks_account || ch.ks_dropbox || ch.ks_dbx_last)) { showAccount(); showDropbox(); }
  });

  // ---- 장소 ----
  const placeInputs = new Map();
  async function renderPlaces() {
    const list = (await ext.storage.local.get('ks_places')).ks_places || [];
    const ov = settings.placeOverrides || {};
    // 저장만 되어 있고 이번 학기에 안 나온 직접 입력도 보여준다
    for (const raw of Object.keys(ov)) if (!list.some((p) => p.raw === raw)) list.push({ raw, campus: '', auto: '' });
    placeInputs.clear();
    if (!list.length) {
      $('places').replaceChildren(h('div', { class: 'empty muted' }, '아직 장소가 없습니다. 한 번 동기화하면 출석수업 장소가 여기에 나타납니다.'));
      return;
    }
    const rows = list.map((p) => {
      const input = h('input', { type: 'text', value: ov[p.raw] || '', placeholder: '자동 변환 사용' });
      placeInputs.set(p.raw, input);
      return h('tr', null,
        h('td', null, p.raw, p.campus ? h('div', { class: 'muted small' }, p.campus) : null),
        h('td', { class: 'auto' }, p.auto || '-'),
        h('td', null, input));
    });
    $('places').replaceChildren(h('table', { class: 'places' },
      h('thead', null, h('tr', null, h('th', null, '방통대 표기'), h('th', null, '자동 변환'), h('th', null, '직접 입력'))),
      h('tbody', null, rows)));
  }
  await renderPlaces();

  // ---- 저장 (위에 붙은 [저장]) ----
  // [저장]으로 적용하는 칸: 캘린더·알림·장소·지난 일정 범위·고급. 계정 연결·해제와 Dropbox 숨기기는 바로 적용(위)
  function formValues() {
    const o = {};
    for (const k of TEXTS) o[k] = $(k).value.trim();
    for (const k of CHECKS) o[k] = $(k).checked;
    o.scopeMode = $('scopeMode').value;
    o.pastRange = $('pastRange').value;
    const ov = {};
    for (const [raw, input] of placeInputs) if (input.value.trim()) ov[raw] = input.value.trim();
    o.placeOverrides = ov;
    return o;
  }
  let baseline = JSON.stringify(formValues());
  let savedTimer = 0;
  const isDirty = () => JSON.stringify(formValues()) !== baseline;
  function refreshDirty() {
    const dirty = isDirty();
    $('btnSave').disabled = !dirty;
    if (dirty) { clearTimeout(savedTimer); $('saved').textContent = '저장하지 않은 변경 있음'; $('saved').className = 'muted small dirty'; }
    else if ($('saved').classList.contains('dirty')) { $('saved').textContent = ''; $('saved').className = 'muted small'; }
  }
  // 계정 칸(바로 적용)은 빼고 나머지 입력을 지켜본다
  for (const ev of ['input', 'change']) {
    document.addEventListener(ev, (e) => { if (!e.target.closest?.('#accounts')) refreshDirty(); });
  }
  // Dropbox [연결]이 고급의 앱 키를 먼저 저장하므로 그 칸은 기준값도 맞춘다
  $('btnDbxConnect').addEventListener('click', () => {
    const b = JSON.parse(baseline);
    b.dropboxAppKey = $('dropboxAppKey').value.trim();
    baseline = JSON.stringify(b);
    refreshDirty();
  });
  window.addEventListener('beforeunload', (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });

  $('btnSave').onclick = async () => {
    const patch = formValues();
    patch.classReminders = KS.parseReminders(patch.classReminders).join(',');
    patch.deadlineReminders = KS.parseReminders(patch.deadlineReminders).join(',');

    const scopeChanged = patch.scopeMode !== settings.scopeMode || patch.clientId !== settings.clientId;
    settings = await KS.saveSettings(patch);
    if (scopeChanged) await ext.storage.session.remove('ks_token'); // 새 범위로 다시 인증
    $('classReminders').value = settings.classReminders;
    $('deadlineReminders').value = settings.deadlineReminders;
    baseline = JSON.stringify(formValues());
    refreshDirty();
    $('saved').textContent = '저장했습니다 ✓';
    $('saved').className = 'muted small';
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => ($('saved').textContent = ''), 2500);
  };
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (isDirty()) $('btnSave').click(); }
  });

  // ---- 문제 해결 ----
  $('btnReset').onclick = async () => {
    if (!confirm('전용 캘린더와 그 안의 모든 일정을 삭제합니다. 계속할까요?')) return;
    const s = await send('resetCalendar');
    alert(s?.message || '완료');
  };

  $('btnReport').onclick = async () => {
    const [{ ks_log = [] }, session, local] = await Promise.all([
      ext.storage.local.get('ks_log'),
      ext.storage.session.get('ks_state'),
      ext.storage.local.get(['ks_last', 'ks_calendar']),
    ]);
    const s = { ...settings, clientId: settings.clientId ? '직접 입력 ' + settings.clientId.slice(0, 6) + '…' : builtin ? '내장 사용' : '(없음)' };
    const st = { ...(session.ks_state || {}) };
    delete st.plan; // 과목 목록 제외
    const now = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
    const ver = KS.env.version.replace(/\./g, '');
    const text = [
      'Knou calendar 버그 리포트',
      `생성: ${now.toString()}`,
      `버전: ${KS.env.version} (${KS.env.target})`,
      `브라우저: ${navigator.userAgent}`,
      `리디렉션 URI: ${ext.identity.getRedirectURL()}`,
      `마지막 동기화: ${local.ks_last ? new Date(local.ks_last).toString() : '-'}`,
      `전용 캘린더 ID 저장됨: ${local.ks_calendar?.id ? '예' : '아니오'}`,
      '',
      '[설정]',
      JSON.stringify(s, null, 2),
      '',
      '[현재 상태]',
      JSON.stringify(st, null, 2),
      '',
      '[로그]',
      ...ks_log,
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/plain;charset=utf-8' }));
    const a = h('a', { href: url, download: `knou_calendar_${ver}_bug_report_${stamp}.txt` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
})();
