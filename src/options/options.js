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
  if (settings.clientId || settings.scopeMode !== 'app') $('advanced').open = true;
  const dbxBuiltin = String(KS.env.dropboxAppKey || '').trim();
  $('dbxBuiltinInfo').textContent = dbxBuiltin
    ? `이 빌드에는 Dropbox 앱 키가 내장되어 있어 따로 입력할 필요가 없습니다. (${dbxBuiltin})`
    : '이 빌드에는 Dropbox 앱 키가 없습니다. Dropbox 내보내기를 쓰려면 직접 만든 앱 키를 입력하세요.';
  if (settings.dropboxAppKey) $('advanced').open = true;

  async function showAccount() {
    const a = (await ext.storage.local.get('ks_account')).ks_account;
    $('account').textContent = a?.email || '없음';
    $('btnDisconnect').hidden = !a?.email;
  }
  await showAccount();
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
    $('dbxAccount').textContent = s.connected ? `연결됨${s.email ? ' · ' + s.email : ''}` : '연결 안 됨';
    $('btnDbxConnect').textContent = s.connected ? '다시 연결' : '연결';
    $('btnDbxDisconnect').hidden = !s.connected;
    const l = s.last;
    $('dbxLast').textContent = note
      || (!l ? (s.connected ? '아직 내보낸 적이 없습니다. 팝업에서 [동기화 확인 & Dropbox 내보내기]를 누르세요.' : '')
        : l.ok ? [`마지막 내보내기 ${KS.fmtTime(l.at)}`, `일정 ${l.items}건`, l.scope === 'kept' && l.notes === false ? '과제 메모를 읽지 못함' : SCOPE_TEXT[l.scope], WIDGET_TEXT[l.widget]].filter(Boolean).join(' · ')
        : `마지막 내보내기 실패 ${KS.fmtTime(l.at)} — ${l.message}`);
  }
  await showDropbox();
  $('btnDbxConnect').onclick = async () => {
    // 고급에 입력한 앱 키가 있으면 먼저 저장 (비어 있으면 내장 키 사용)
    settings = await KS.saveSettings({ dropboxAppKey: $('dropboxAppKey').value.trim() });
    if (!KS.effectiveDropboxKey(settings)) { $('advanced').open = true; await showDropbox('이 빌드에는 Dropbox 앱 키가 없습니다. 고급에서 앱 키를 입력하세요.'); return; }
    await showDropbox('Dropbox 창에서 허용을 눌러 주세요…');
    const r = await send('connectDropbox'); // 연결 + 숨김 해제 + 바로 한 번 내보내기 (background.js)
    if (!r?.ok) { await showDropbox(r?.message || 'Dropbox 연결에 실패했습니다.'); return; }
    await showDropbox(r.exported?.ok === false ? r.exported.message : undefined);
  };
  $('btnDbxDisconnect').onclick = async () => {
    if (!confirm('Dropbox 연결을 해제할까요? Dropbox에 있는 파일은 그대로 남습니다.')) return;
    await send('disconnectDropbox');
    await showDropbox();
  };

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

  // ---- 저장 ----
  $('btnSave').onclick = async () => {
    const patch = {};
    for (const k of TEXTS) patch[k] = $(k).value.trim();
    for (const k of CHECKS) patch[k] = $(k).checked;
    patch.scopeMode = $('scopeMode').value;
    patch.classReminders = KS.parseReminders(patch.classReminders).join(',');
    patch.deadlineReminders = KS.parseReminders(patch.deadlineReminders).join(',');
    const ov = {};
    for (const [raw, input] of placeInputs) if (input.value.trim()) ov[raw] = input.value.trim();
    patch.placeOverrides = ov;

    const scopeChanged = patch.scopeMode !== settings.scopeMode || patch.clientId !== settings.clientId;
    settings = await KS.saveSettings(patch);
    if (scopeChanged) await ext.storage.session.remove('ks_token'); // 새 범위로 다시 인증
    $('classReminders').value = settings.classReminders;
    $('deadlineReminders').value = settings.deadlineReminders;
    $('saved').textContent = '저장했습니다 ✓';
    setTimeout(() => ($('saved').textContent = ''), 2500);
  };

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
