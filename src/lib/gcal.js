// Google Calendar API
(() => {
  const KS = globalThis.KS;
  const BASE = 'https://www.googleapis.com/calendar/v3';
  const MARKER = '[Knou calendar]';

  async function api(token, method, path, { body, query, okStatuses = [], optional = false } = {}) {
    let url = BASE + path;
    if (query) url += '?' + new URLSearchParams(query).toString();
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await fetch(url, {
          method,
          headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (e) {
        if (attempt < 3) { await KS.sleep(1000 * 2 ** attempt); continue; }
        throw new KS.KsError('NETWORK', '구글 서버에 연결할 수 없습니다.');
      }
      if (res.ok) return res.status === 204 ? null : res.json().catch(() => null);
      if (okStatuses.includes(res.status)) return null;

      let reason = '', message = '';
      try {
        const j = JSON.parse(await res.text());
        reason = j?.error?.errors?.[0]?.reason || j?.error?.status || '';
        message = j?.error?.message || '';
      } catch { /* 무시 */ }

      if (res.status === 401) throw new KS.KsError('AUTH_EXPIRED', '구글 인증이 만료되었습니다.');
      if (!optional && res.status === 403 && /insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(reason + ' ' + message)) {
        // 받은 토큰에 캘린더 권한이 없다 → 토큰을 버리고 권한 화면을 다시 띄우게 한다
        KS.log('warn', '캘린더 권한 부족', { method, status: res.status, reason });
        await KS.ext.storage.session.remove('ks_token');
        await KS.ext.storage.local.set({ ks_reconsent: true });
        throw new KS.KsError('NEED_GOOGLE', '구글 캘린더 권한이 부족합니다. [구글 연결]을 누르고, 권한 화면에서 캘린더 항목을 체크한 뒤 계속을 눌러 주세요.');
      }
      const retryable = res.status === 429 || res.status >= 500 || (res.status === 403 && /rateLimit|quota/i.test(reason));
      if (retryable && attempt < 5) {
        await KS.sleep(1000 * 2 ** attempt + Math.random() * 400);
        continue;
      }
      // 실패해도 되는 조회는 오류로 기록하지 않는다 (크롬 확장 오류 목록에 뜨지 않게)
      KS.log(optional ? 'info' : 'error', optional ? 'Calendar API 선택 조회 거부(정상)' : 'Calendar API 오류', { method, path: path.replace(/\/calendars\/[^/?]+/, '/calendars/<cal>').replace(/\/events\/[^/?]+/, '/events/<id>'), status: res.status, reason, message });
      throw new KS.KsError('API', `구글 캘린더 오류 (${res.status}${reason ? ' ' + reason : ''})`, { status: res.status });
    }
  }

  const enc = encodeURIComponent;

  async function ensureCalendar(token, settings) {
    const name = settings.calendarName || '방통대 학사일정';
    const stored = (await KS.ext.storage.local.get('ks_calendar')).ks_calendar;

    if (stored?.id) {
      try {
        const cal = await api(token, 'GET', `/calendars/${enc(stored.id)}`);
        if (cal) {
          if (cal.summary !== name) await api(token, 'PATCH', `/calendars/${enc(stored.id)}`, { body: { summary: name } });
          return stored.id;
        }
      } catch (e) {
        if (e.code !== 'API' || ![403, 404, 410].includes(e.status)) throw e;
        KS.log('warn', '저장된 캘린더를 찾을 수 없어 다시 찾습니다', { status: e.status });
      }
    }

    // 확장을 다시 설치한 경우: 캘린더 목록에서 표식으로 찾기.
    // 권장 범위(app.created)에서는 목록 조회가 항상 거부되므로 전체 권한일 때만 시도한다.
    if (settings.scopeMode === 'full') try {
      // 권장 권한 범위에서는 목록 조회가 거부될 수 있으므로 optional
      const list = await api(token, 'GET', '/users/me/calendarList', { query: { maxResults: '250' }, optional: true });
      const found = (list?.items || []).find((c) => [MARKER, '[Knou_sync]'].some((m) => (c.description || '').includes(m)));
      if (found) {
        await KS.ext.storage.local.set({ ks_calendar: { id: found.id } });
        KS.log('info', '기존 전용 캘린더를 찾음');
        return found.id;
      }
    } catch (e) {
      if (e.code === 'AUTH_EXPIRED' || e.code === 'NETWORK') throw e;
    }

    const cal = await api(token, 'POST', '/calendars', {
      body: { summary: name, timeZone: 'Asia/Seoul', description: `Knou calendar가 관리하는 방통대 학사일정 캘린더입니다. 직접 만든 일정은 지워지지 않습니다. ${MARKER}` },
    });
    await KS.ext.storage.local.set({ ks_calendar: { id: cal.id } });
    KS.log('info', '전용 캘린더 생성');
    return cal.id;
  }

  async function listEvents(token, calId) {
    const out = [];
    let pageToken;
    do {
      const q = { maxResults: '2500', singleEvents: 'true', showDeleted: 'false', privateExtendedProperty: 'ks_v=1' };
      if (pageToken) q.pageToken = pageToken;
      const r = await api(token, 'GET', `/calendars/${enc(calId)}/events`, { query: q });
      out.push(...(r?.items || []));
      pageToken = r?.nextPageToken;
    } while (pageToken);
    return out;
  }

  const insertEvent = (token, calId, ev) => api(token, 'POST', `/calendars/${enc(calId)}/events`, { body: ev });
  const deleteEvent = (token, calId, id) => api(token, 'DELETE', `/calendars/${enc(calId)}/events/${enc(id)}`, { okStatuses: [404, 410] });

  async function deleteCalendar(token) {
    const stored = (await KS.ext.storage.local.get('ks_calendar')).ks_calendar;
    if (stored?.id) await api(token, 'DELETE', `/calendars/${enc(stored.id)}`, { okStatuses: [404, 410] });
    await KS.ext.storage.local.remove('ks_calendar');
  }

  KS.gcal = { ensureCalendar, listEvents, insertEvent, deleteEvent, deleteCalendar };
})();
