// 구글 OAuth (launchWebAuthFlow, Chromium·Firefox 공통)
(() => {
  const KS = globalThis.KS;
  const SCOPE_APP = 'https://www.googleapis.com/auth/calendar.app.created';
  const SCOPE_FULL = 'https://www.googleapis.com/auth/calendar';
  const scopes = (mode) => [mode === 'full' ? SCOPE_FULL : SCOPE_APP, 'openid', 'email'].join(' ');

  async function getCached() {
    const t = (await KS.ext.storage.session.get('ks_token')).ks_token;
    return t && t.exp > Date.now() + 60000 ? t : null;
  }
  async function getAccount() {
    return (await KS.ext.storage.local.get('ks_account')).ks_account || null;
  }

  const SILENT_LIMIT = 15000; // 창 없는 인증
  const INTERACTIVE_LIMIT = 5 * 60000; // 로그인 창

  // 브라우저는 확장당 인증 흐름을 하나만 허용한다.
  // 시간 제한으로 기다리기를 멈춰도 브라우저 쪽 흐름은 남아 있을 수 있으므로 끝날 때까지 추적한다.
  let flowPending = false;

  function launch(url, interactive) {
    if (flowPending) return Promise.reject(new Error('flow_busy'));
    // 기본 동작(창 없는 확인은 페이지가 뜨는 즉시 실패 처리)을 그대로 쓴다.
    // 대기 시간을 늘리는 옵션은 일부 브라우저에서 흐름이 끝나지 않는 원인이 되어 쓰지 않는다.
    const flow = Promise.resolve().then(() => KS.ext.identity.launchWebAuthFlow({ url, interactive }));
    flowPending = true;
    flow.catch(() => {}).finally(() => { flowPending = false; });

    // 브라우저가 응답을 주지 않아도 무한정 기다리지 않는다
    const limit = interactive ? INTERACTIVE_LIMIT : SILENT_LIMIT;
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout ' + limit + 'ms')), limit);
    });
    return Promise.race([flow, timeout]).finally(() => clearTimeout(timer));
  }

  async function authorize({ interactive, selectAccount = false }) {
    const s = await KS.getSettings();
    const clientId = KS.effectiveClientId(s);
    if (!clientId) throw new KS.KsError('NEED_CONFIG', '이 빌드에는 구글 클라이언트 ID가 없습니다. 설정 > 고급에서 입력하세요.');
    const acct = await getAccount();
    const state = crypto.randomUUID();
    const p = new URLSearchParams({
      client_id: clientId,
      response_type: 'token',
      redirect_uri: KS.ext.identity.getRedirectURL(),
      scope: scopes(s.scopeMode),
      state,
      include_granted_scopes: 'true',
    });
    // 지난번에 캘린더 권한 체크가 빠졌다면 권한 화면을 다시 보여 달라고 요청한다
    const reconsent = !!(await KS.ext.storage.local.get('ks_reconsent')).ks_reconsent;
    if (!interactive) p.set('prompt', 'none');
    else if (selectAccount) p.set('prompt', reconsent ? 'select_account consent' : 'select_account');
    else if (reconsent) p.set('prompt', 'consent');
    if (acct?.email && !selectAccount) p.set('login_hint', acct.email);

    let redirect;
    try {
      if (interactive) {
        KS.log('info', '구글 로그인 창 열기', { selectAccount });
        try { await KS.gauth.onInteractive?.(); } catch { /* 표시용 */ }
      }
      redirect = await launch('https://accounts.google.com/o/oauth2/v2/auth?' + p.toString(), interactive);
    } catch (e) {
      const msg = String(e?.message || e);
      KS.log('warn', '구글 인증 창 실패', { interactive, msg });
      if (msg === 'flow_busy' || /only one web auth flow/i.test(msg)) {
        throw new KS.KsError('GOOGLE_CANCELLED', '이전 구글 로그인 창이 아직 열려 있습니다. 그 창을 완료하거나 닫은 뒤 다시 시도하세요. 창이 보이지 않으면 확장 관리 화면에서 확장을 새로고침하세요.');
      }
      if (!interactive) throw new KS.KsError('NEED_GOOGLE', '구글 연결이 필요합니다.');
      if (msg.startsWith('timeout')) {
        throw new KS.KsError('GOOGLE_CANCELLED', '구글 로그인 창이 5분 안에 완료되지 않았습니다. 다시 시도해 주세요.');
      }
      throw new KS.KsError('GOOGLE_CANCELLED', `구글 연결이 취소되었거나 완료되지 않았습니다. (${msg})`);
    }
    if (!redirect) throw new KS.KsError(interactive ? 'GOOGLE_CANCELLED' : 'NEED_GOOGLE', '구글 연결이 필요합니다.');

    const u = new URL(redirect);
    const frag = new URLSearchParams((u.hash || '').replace(/^#/, ''));
    const err = frag.get('error') || u.searchParams.get('error');
    if (err) {
      KS.log('warn', '구글 인증 오류 응답', { interactive, err });
      if (/invalid_scope/.test(err)) {
        throw new KS.KsError('API', '구글이 요청한 권한 범위를 거부했습니다. 설정에서 권한 범위를 "전체 캘린더"로 바꿔 보세요.');
      }
      if (!interactive) throw new KS.KsError('NEED_GOOGLE', '구글 연결이 필요합니다.');
      throw new KS.KsError('GOOGLE_CANCELLED', `구글 연결이 완료되지 않았습니다. (${err})`);
    }
    if (frag.get('state') !== state) throw new KS.KsError('API', '구글 인증 응답 검증에 실패했습니다. 다시 시도해 주세요.');

    const token = frag.get('access_token');
    if (!token) throw new KS.KsError(interactive ? 'GOOGLE_CANCELLED' : 'NEED_GOOGLE', '구글 연결이 필요합니다.');
    const exp = Date.now() + parseInt(frag.get('expires_in') || '3600', 10) * 1000;

    // 사용자가 권한 화면에서 캘린더 항목 체크를 빼면 구글은 그 권한 없이 토큰을 준다
    const granted = (frag.get('scope') || '').split(/\s+/).filter(Boolean);
    const need = s.scopeMode === 'full' ? SCOPE_FULL : SCOPE_APP;
    if (granted.length && !granted.includes(need) && !granted.includes(SCOPE_FULL)) {
      KS.log('warn', '캘린더 권한 없이 승인됨', { granted: granted.map((x) => x.replace('https://www.googleapis.com/auth/', '')) });
      await KS.ext.storage.local.set({ ks_reconsent: true });
      throw new KS.KsError('NEED_GOOGLE', '캘린더 권한이 허용되지 않았습니다. [구글 연결]을 누르고, 권한 화면에서 캘린더 항목을 체크한 뒤 계속을 눌러 주세요.');
    }
    await KS.ext.storage.local.remove('ks_reconsent');

    let email = '';
    try {
      const r = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: 'Bearer ' + token } });
      if (r.ok) email = (await r.json()).email || '';
    } catch { /* 이메일은 표시용이라 실패해도 진행 */ }
    if (!email) email = acct?.email || '';

    // 다른 계정으로 바뀌면 저장해 둔 캘린더 ID는 더 이상 유효하지 않다
    if (acct?.email && email && acct.email !== email) await KS.ext.storage.local.remove('ks_calendar');

    await KS.ext.storage.session.set({ ks_token: { token, exp, email } });
    await KS.ext.storage.local.set({ ks_account: { email } });
    KS.log('info', '구글 토큰 확보', { interactive, selectAccount });
    return token;
  }

  KS.gauth = {
    // forceInteractive: [구글 연결] 버튼처럼 동의 창을 바로 열어야 할 때
    async getToken({ interactive = false, selectAccount = false, forceInteractive = false } = {}) {
      if (forceInteractive && interactive) {
        await KS.ext.storage.session.remove('ks_token');
        return authorize({ interactive: true, selectAccount });
      }
      if (!selectAccount) {
        const c = await getCached();
        if (c) return c.token;
        // 한 번도 동의한 적이 없으면 창 없는 확인은 어차피 실패하므로 건너뛰고 바로 동의 창을 연다
        const consented = !!(await getAccount())?.email;
        if (consented || !interactive) {
          // 창 없는 확인이 실패하면 바로 이어서 창을 열지 않는다 (일부 브라우저가 연속 실행을 거부함).
          // 대신 팝업의 [구글 연결] 버튼(forceInteractive)으로 넘긴다.
          return await authorize({ interactive: false });
        }
      }
      return authorize({ interactive: true, selectAccount });
    },
    async clearToken() {
      await KS.ext.storage.session.remove('ks_token');
    },
    getAccount,
    async disconnect() {
      const t = (await KS.ext.storage.session.get('ks_token')).ks_token;
      if (t?.token) {
        try {
          await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(t.token), {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          });
        } catch { /* 무시 */ }
      }
      await KS.ext.storage.session.remove('ks_token');
      await KS.ext.storage.local.remove(['ks_account', 'ks_calendar', 'ks_reconsent']);
      KS.log('info', '구글 연결 해제');
    },
  };
})();
