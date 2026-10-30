// 동기화 흐름: 방통대 읽기 → 구글 토큰 → 캘린더 읽기 → 미리보기 → 반영
(() => {
  const KS = globalThis.KS;
  const BUSY = new Set(['knou', 'auth', 'reading', 'applying']);
  const ACTION = new Set(['need_knou_login', 'need_google', 'need_config', 'need_permission', 'confirm_empty']);
  let busy = false;

  const State = {
    async get() {
      return (await KS.ext.storage.session.get('ks_state')).ks_state || { phase: 'idle' };
    },
    async set(patch) {
      const s = { ...(await State.get()), ...patch, updatedAt: Date.now() };
      await KS.ext.storage.session.set({ ks_state: s });
      await badge(s);
      return s;
    },
  };

  async function badge(s) {
    const a = KS.ext.action;
    if (!a) return;
    let text = '', color = '#0054a7';
    if (s.phase === 'preview') text = String(s.plan?.total || '');
    else if (ACTION.has(s.phase)) { text = '!'; color = '#d97706'; }
    else if (s.phase === 'error') { text = '!'; color = '#dc2626'; }
    try {
      await a.setBadgeText({ text });
      await a.setBadgeBackgroundColor({ color });
    } catch { /* 무시 */ }
  }

  // 서비스 워커가 재시작되어 '진행 중'에 멈춘 상태를 바로잡는다
  async function getStatus() {
    let s = await State.get();
    if (BUSY.has(s.phase) && !busy) s = await State.set({ phase: 'idle', message: '이전 작업이 중단되었습니다. 다시 시도해 주세요.', progress: null });
    return s;
  }

  async function armResume() {
    await KS.ext.storage.session.set({ ks_resume: Date.now() + 30 * 60000 });
  }

  // 팝업의 '남은 일정'은 캘린더에 실제로 반영된 내용만 보여준다
  async function commitAgenda() {
    const pend = (await KS.ext.storage.session.get('ks_agenda_pending')).ks_agenda_pending;
    if (!pend) return;
    await KS.ext.storage.local.set({ ks_agenda: pend });
    await KS.ext.storage.session.remove('ks_agenda_pending');
  }

  async function markDone(message) {
    await commitAgenda();
    const now = Date.now();
    await KS.ext.storage.local.set({ ks_last: now });
    return State.set({ phase: 'done', message, plan: null, progress: null, error: null, lastSync: now });
  }

  async function fail(e, trigger) {
    const code = e?.code || 'UNKNOWN';
    const msg = e?.message || String(e);
    KS.log(code === 'UNKNOWN' ? 'error' : 'warn', '동기화 중단', { code, msg, trigger, stack: code === 'UNKNOWN' ? String(e?.stack || '').slice(0, 500) : undefined });
    const map = {
      NEED_KNOU_LOGIN: 'need_knou_login',
      NEED_GOOGLE: 'need_google',
      GOOGLE_CANCELLED: 'need_google',
      NEED_CONFIG: 'need_config',
      NEED_PERMISSION: 'need_permission',
    };
    const patch = { phase: map[code] || 'error', message: msg, error: code, progress: null, waitingGoogle: false };
    if (code === 'NEED_KNOU_LOGIN') {
      patch.knou = { status: 'logged_out', checkedAt: Date.now() };
      if (trigger === 'resume') await armResume(); // 로그인 완료 전 페이지였다면 다시 대기
    }
    if (code === 'NETWORK') patch.message = msg + ' 인터넷 연결을 확인하세요.';
    if (code === 'UNKNOWN') patch.message = '예상하지 못한 오류가 발생했습니다: ' + msg;
    return State.set(patch);
  }

  let runId = 0; // 취소된 회차의 늦은 결과가 상태를 덮어쓰지 않게 한다

  async function preview({ interactive = false, trigger = 'user', forceInteractive = false } = {}) {
    if (busy) return State.get();
    busy = true;
    const my = ++runId;
    const live = () => my === runId;
    const set = (patch) => (live() ? State.set(patch) : State.get());
    let autoApply = false;
    try {
      const settings = await KS.getSettings();
      await set({ phase: 'knou', message: '방통대 학사정보를 가져오는 중…', plan: null, error: null, progress: null, waitingGoogle: false });
      await KS.ext.storage.session.remove('ks_plan');

      if (!(await KS.ext.permissions.contains({ origins: KS.KNOU_ORIGINS }))) {
        throw new KS.KsError('NEED_PERMISSION', '방통대 사이트 접근 권한이 필요합니다.');
      }

      const knou = await KS.knou.fetch();
      if (!live()) return State.get();
      if (knou.source === 'dom') {
        // 화면에는 지역대학 정보가 없으므로 직전에 알아둔 값으로 채운다
        const prev = (await KS.ext.storage.local.get('ks_places')).ks_places || [];
        const campusOf = new Map(prev.filter((p) => p.campus).map((p) => [p.raw, p.campus]));
        for (const c of knou.courses) for (const s of c.attendance.sessions) if (!s.campus) s.campus = campusOf.get(s.placeRaw) || '';
      }
      await set({ knou: { status: 'ok', checkedAt: Date.now(), source: knou.source, courses: knou.courses.length } });

      if (!KS.effectiveClientId(settings)) throw new KS.KsError('NEED_CONFIG', '이 빌드에는 구글 클라이언트 ID가 없습니다. 설정 > 고급에서 입력하세요.');
      await set({ phase: 'auth', message: '구글 계정을 확인하는 중…' });
      KS.gauth.onInteractive = () =>
        set({ message: '구글 로그인 창에서 계정을 선택하고 허용해 주세요.', waitingGoogle: true });
      let token = await KS.gauth.getToken({ interactive, forceInteractive });
      if (!live()) return State.get();

      await set({ phase: 'reading', message: '캘린더를 확인하는 중…', waitingGoogle: false });
      let calId, existing;
      const read = async () => {
        calId = await KS.gcal.ensureCalendar(token, settings);
        existing = await KS.gcal.listEvents(token, calId);
      };
      try {
        await read();
      } catch (e) {
        if (e.code !== 'AUTH_EXPIRED') throw e;
        await KS.gauth.clearToken();
        token = await KS.gauth.getToken({ interactive });
        await read();
      }
      if (!live()) return State.get();

      const built = KS.schedule.build(knou, settings);
      await KS.ext.storage.local.set({ ks_places: built.places });
      await KS.ext.storage.session.set({ ks_agenda_pending: { items: built.agenda, savedAt: Date.now() } });
      const plan = KS.schedule.diff(built, existing);
      KS.log('info', '변경 계획', { source: knou.source, courses: built.courseCount, groups: built.groups.length, existing: existing.length, ...plan.counts });

      if (plan.total === 0) return await markDone('변경 사항이 없습니다. 캘린더가 최신 상태입니다.');

      await KS.ext.storage.session.set({ ks_plan: { calId, inserts: plan.inserts, deletes: plan.deletes, counts: plan.counts } });
      const ui = { total: plan.total, counts: plan.counts, items: plan.items };

      if (built.courseCount === 0 && plan.counts.delete > 0) {
        return await set({ phase: 'confirm_empty', plan: ui, message: '방통대에서 수강 과목을 찾지 못했습니다.' });
      }
      await set({ phase: 'preview', plan: ui, message: '' });
      autoApply = !!settings.autoApply;
      return State.get();
    } catch (e) {
      if (!live()) {
        KS.log('info', '취소된 회차의 오류 무시', { code: e?.code });
        return State.get();
      }
      return fail(e, trigger);
    } finally {
      KS.gauth.onInteractive = null;
      if (live()) busy = false;
      if (autoApply && live()) await apply();
    }
  }

  async function apply({ allowEmpty = false } = {}) {
    if (busy) return State.get();
    busy = true;
    try {
      const plan = (await KS.ext.storage.session.get('ks_plan')).ks_plan;
      if (!plan) return await State.set({ phase: 'idle', message: '반영할 변경 사항이 없습니다. 다시 확인해 주세요.', plan: null });
      const cur = await State.get();
      if (cur.phase === 'confirm_empty' && !allowEmpty) return cur;

      const total = plan.inserts.length + plan.deletes.length;
      let done = 0;
      await State.set({ phase: 'applying', message: '캘린더에 반영하는 중…', progress: { done, total } });

      let token = await KS.gauth.getToken({ interactive: false });
      const call = async (fn) => {
        try {
          return await fn(token);
        } catch (e) {
          if (e.code !== 'AUTH_EXPIRED') throw e;
          await KS.gauth.clearToken();
          token = await KS.gauth.getToken({ interactive: false });
          return fn(token);
        }
      };
      const tick = async () => {
        done++;
        if (done % 3 === 0 || done === total) await State.set({ progress: { done, total } });
      };

      // 새 일정을 먼저 넣고 옛 일정을 지운다 → 중간에 끊겨도 일정이 사라지지 않음
      for (const ev of plan.inserts) { await call((t) => KS.gcal.insertEvent(t, plan.calId, ev)); await tick(); }
      for (const id of plan.deletes) { await call((t) => KS.gcal.deleteEvent(t, plan.calId, id)); await tick(); }

      await KS.ext.storage.session.remove('ks_plan');
      const c = plan.counts;
      KS.log('info', '반영 완료', c);
      return await markDone(`반영 완료 — 추가 ${c.add} · 교체 ${c.replace} · 삭제 ${c.delete}`);
    } catch (e) {
      const s = await fail(e, 'apply');
      if (s.phase === 'error') return State.set({ message: s.message + ' 일부만 반영되었을 수 있습니다. 다시 동기화하면 정리됩니다.' });
      return s;
    } finally {
      busy = false;
    }
  }

  async function cancel() {
    const cur = await State.get();
    if (cur.phase === 'applying') return cur; // 반영 중에는 끊지 않는다 (중복·누락 방지)
    if (busy) {
      runId++;
      busy = false;
      KS.log('info', '사용자가 진행 중인 작업을 취소', { phase: cur.phase });
    }
    await KS.ext.storage.session.remove('ks_plan');
    return State.set({ phase: 'idle', message: '취소했습니다.', plan: null, progress: null, error: null, waitingGoogle: false });
  }

  async function openKnouLogin() {
    await armResume();
    await KS.ext.tabs.create({ url: KS.KNOU_DASHBOARD });
    return State.set({ phase: 'need_knou_login', message: '방통대에 로그인하면 자동으로 이어서 진행합니다.' });
  }

  // 방통대 탭이 로드될 때 호출 (background.js)
  async function onKnouPageLoaded() {
    const until = (await KS.ext.storage.session.get('ks_resume')).ks_resume;
    if (!until || until < Date.now()) return;
    await KS.ext.storage.session.remove('ks_resume');
    KS.log('info', '방통대 페이지 로드 감지 → 자동 재시도');
    await preview({ interactive: false, trigger: 'resume' });
  }

  async function switchAccount() {
    try {
      await KS.gauth.getToken({ interactive: true, selectAccount: true });
      return State.set({ phase: 'idle', message: '구글 계정을 변경했습니다. 동기화를 다시 확인해 주세요.', plan: null });
    } catch (e) {
      return fail(e, 'switch');
    }
  }

  async function disconnect() {
    await KS.gauth.disconnect();
    await KS.ext.storage.session.remove('ks_plan');
    return State.set({ phase: 'idle', message: '구글 연결을 해제했습니다.', plan: null });
  }

  async function resetCalendar() {
    if (busy) return State.get();
    busy = true;
    try {
      const token = await KS.gauth.getToken({ interactive: true });
      await KS.gcal.deleteCalendar(token);
      await KS.ext.storage.session.remove('ks_plan');
      await KS.ext.storage.local.remove('ks_agenda');
      KS.log('info', '전용 캘린더 초기화');
      return await State.set({ phase: 'idle', message: '전용 캘린더를 삭제했습니다. 동기화하면 새로 만듭니다.', plan: null });
    } catch (e) {
      return fail(e, 'reset');
    } finally {
      busy = false;
    }
  }

  KS.sync = { getStatus, preview, apply, cancel, openKnouLogin, onKnouPageLoaded, switchAccount, disconnect, resetCalendar, State };
})();
