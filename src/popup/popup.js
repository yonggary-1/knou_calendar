(() => {
  const { h, send, ext, fmtTime } = KS;
  const $ = (id) => document.getElementById(id);
  const panel = $('panel');
  const OP = { add: '추가', replace: '교체', delete: '삭제' };
  let lastKey = '';

  $('btnOptions').onclick = () => { send('openOptions'); window.close(); };

  // ---- 바로가기 ----
  const LINKS = {
    attendance: ['https://m.knou.ac.kr/attendance/schedule-place-inquiry', '출석수업 시간표'],
    classAssignment: ['https://m.knou.ac.kr/assignment/class-attendance', '출석수업과제 제출'],
    assignment: ['https://m.knou.ac.kr/assignment/submit', '과제 제출'],
    ucampus: ['https://ucampus.knou.ac.kr/ekp/user/study/retrieveUMYStudy.sdo', 'U-KNOU캠퍼스'],
    myknou: ['https://m.knou.ac.kr/', 'MyKNOU'],
  };
  const openTab = (url) => { ext.tabs.create({ url }); window.close(); };
  for (const b of document.querySelectorAll('.links [data-href]')) b.onclick = () => openTab(b.dataset.href);

  // ---- 남은 일정 ----
  const WD = '일월화수목금토';
  const kp = (iso) => {
    const d = new Date(Date.parse(iso) + 9 * 3600e3);
    return { m: d.getUTCMonth() + 1, d: d.getUTCDate(), wd: WD[d.getUTCDay()], hm: iso.slice(11, 16), ymd: iso.slice(0, 10) };
  };
  const todayYmd = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const dayDiff = (ymd) => Math.round((Date.parse(ymd) - Date.parse(todayYmd())) / 86400e3);

  function ddayOf(it, now) {
    const s = it.start ? Date.parse(it.start) : null;
    if (s && s <= now && now < Date.parse(it.end) && !it.due) return { text: it.kind === 'class' ? '수업 중' : '진행 중', cls: 'now' };
    const n = dayDiff(kp(it.due ? it.end : it.start || it.end).ymd);
    if (n <= 0) return { text: it.due ? '오늘 마감' : '오늘', cls: 'soon' };
    return { text: 'D-' + n, cls: n <= 3 ? 'soon' : '' };
  }

  function whenOf(it) {
    const e = kp(it.end);
    if (it.kind === 'class') {
      const s = kp(it.start);
      return `${s.m}/${s.d}(${s.wd}) ${s.hm}~${e.hm}${it.place ? ' · ' + it.place : ''}`;
    }
    if (!it.due && it.start) {
      const s = kp(it.start);
      return `${s.m}/${s.d}(${s.wd}) ${s.hm}~${e.hm}`;
    }
    if (it.start && kp(it.start).ymd !== e.ymd) {
      const s = kp(it.start);
      return `${s.m}/${s.d}~${e.m}/${e.d}(${e.wd}) ${e.hm}까지`;
    }
    return `${e.m}/${e.d}(${e.wd}) ${e.hm}까지`;
  }

  const KIND = { class: '출석', mid: '중간', final: '기말', formative: '형성' };

  function agendaView(agenda) {
    const head = (sub) => h('div', { class: 'agenda-head' }, h('h2', null, '남은 일정'), sub ? h('span', { class: 'foot' }, sub) : null);
    if (!agenda?.items) return [head(), h('p', { class: 'muted' }, '동기화를 한 번 하면 남은 할 일이 과목별로 여기에 표시됩니다.')];
    const now = Date.now();
    const upcoming = agenda.items.filter((it) => Date.parse(it.end) > now);
    const past = agenda.items.length - upcoming.length;
    if (!upcoming.length) return [head(), h('p', { class: 'muted' }, '남은 일정이 없습니다.')];

    const byCourse = new Map();
    for (const it of upcoming) {
      if (!byCourse.has(it.course)) byCourse.set(it.course, []);
      byCourse.get(it.course).push(it);
    }
    const cards = [...byCourse].map(([course, list]) =>
      h('section', { class: 'course' },
        h('div', { class: 'name' }, h('span', null, course), h('span', { class: 'next' }, `${list.length}건`)),
        list.map((it) => {
          const dd = ddayOf(it, now);
          const [url, title] = LINKS[it.link] || LINKS.myknou;
          const what = it.kind === 'formative' ? `${it.detail} 학습` : it.label + (it.detail ? ` · ${it.detail}` : '');
          const when = whenOf(it);
          return h('div', { class: 'todo' },
            h('span', { class: 'kind ' + it.kind }, KIND[it.kind] || ''),
            h('div', { class: 'main' }, h('div', { class: 'what', title: what }, what), h('div', { class: 'when', title: when }, when)),
            h('div', { class: 'side' },
              h('span', { class: 'dday ' + dd.cls }, dd.text),
              h('button', { class: 'go', title: title + ' 열기', 'aria-label': title + ' 열기', onclick: () => openTab(url) }, '↗')));
        })));
    const sub = `${byCourse.size}과목 · ${fmtTime(agenda.savedAt)} 반영 기준`;
    return [head(sub), h('div', { class: 'agenda' }, cards), past ? h('p', { class: 'foot' }, `지난 일정 ${past}건은 숨겼습니다.`) : null];
  }

  const act = (type) => async () => {
    lastKey = '';
    await send(type);
    refresh();
  };

  function setStatus(st) {
    const s = st.state || {};
    const knou = s.knou?.status;
    $('knouDot').className = 'dot ' + (knou === 'ok' ? 'ok' : knou === 'logged_out' ? 'bad' : '');
    $('knouText').textContent =
      knou === 'ok' ? `로그인됨${s.knou.courses !== undefined ? ` · ${s.knou.courses}과목` : ''}` : knou === 'logged_out' ? '로그인 필요' : '확인 전';
    $('btnKnou').hidden = knou === 'ok';
    $('btnKnou').onclick = act('openKnou');

    const email = st.account?.email;
    $('googleDot').className = 'dot ' + (email ? 'ok' : s.phase === 'need_google' ? 'bad' : '');
    $('googleText').textContent = email || '연결 안 됨';
    $('btnGoogle').textContent = email ? '계정 변경' : '연결';
    $('btnGoogle').onclick = email ? act('switchAccount') : act('connectGoogle');
  }

  function notice(kind, title, body) {
    return h('div', { class: 'notice ' + (kind || '') }, h('div', { class: 'title' }, title), body ? h('p', { class: 'muted' }, body) : null);
  }

  function planView(plan) {
    const c = plan.counts || {};
    return [
      h('div', { class: 'chips' },
        c.add ? h('span', { class: 'chip add' }, `추가 ${c.add}`) : null,
        c.replace ? h('span', { class: 'chip replace' }, `교체 ${c.replace}`) : null,
        c.delete ? h('span', { class: 'chip delete' }, `삭제 ${c.delete}`) : null),
      h('ul', { class: 'list' },
        (plan.items || []).map((it) =>
          h('li', null,
            h('span', { class: 'chip ' + it.op }, OP[it.op] || it.op),
            h('span', { class: 'what', title: it.label }, it.label),
            h('span', { class: 'when' }, it.when || '')))),
    ];
  }

  const WITH_AGENDA = new Set(['idle', 'done', 'need_knou_login', 'need_google', 'need_config', 'error']);

  function render(st) {
    const nodes = renderPhase(st);
    const phase = st.state?.phase || 'idle';
    if (st.hasPermission && (WITH_AGENDA.has(phase) || !phase)) nodes.push(...agendaView(st.agenda));
    return nodes;
  }

  function renderPhase(st) {
    const s = st.state || { phase: 'idle' };
    const nodes = [];

    if (!st.hasPermission) {
      nodes.push(notice('warn', '방통대 사이트 접근 권한이 필요합니다', '학사정보를 읽으려면 knou.ac.kr 접근을 허용해야 합니다.'));
      nodes.push(h('div', { class: 'actions' }, h('button', {
        class: 'primary',
        onclick: async () => {
          // 사용자 클릭 직후에 바로 호출해야 한다
          const ok = await ext.permissions.request({ origins: KS.KNOU_ORIGINS });
          if (ok) { lastKey = ''; refresh(); }
        },
      }, '권한 허용')));
      return nodes;
    }

    switch (s.phase) {
      case 'knou':
      case 'auth':
      case 'reading':
      case 'applying': {
        nodes.push(h('div', { class: 'busy' }, h('div', { class: 'spinner' }), h('span', null, s.message || '처리 중…')));
        if (s.progress?.total) {
          const pct = Math.round((s.progress.done / s.progress.total) * 100);
          nodes.push(h('div', { class: 'bar' }, h('div', { style: { width: pct + '%' } })));
          nodes.push(h('p', { class: 'foot' }, `${s.progress.done} / ${s.progress.total}`));
        }
        if (s.phase === 'auth') {
          nodes.push(notice('', '구글 로그인 창이 따로 열립니다',
            '브라우저 뒤에 숨어 있을 수 있습니다. 작업 표시줄의 브라우저 아이콘이나 Alt+Tab으로 "Google" 창을 찾아 계정을 선택하고 허용해 주세요.'));
        }
        if (s.phase !== 'applying') {
          nodes.push(h('div', { class: 'actions' }, h('button', { onclick: act('cancel') }, '취소')));
        }
        break;
      }
      case 'preview':
        nodes.push(h('h2', null, '이렇게 반영됩니다'));
        nodes.push(...planView(s.plan || {}));
        nodes.push(h('div', { class: 'actions' },
          h('button', { onclick: act('cancel') }, '취소'),
          h('button', { class: 'primary', onclick: act('apply') }, '반영')));
        break;
      case 'confirm_empty':
        nodes.push(notice('bad', '수강 과목을 찾지 못했습니다',
          '학기 전환기라면 정상일 수 있지만, 사이트 구조가 바뀌어 읽지 못한 것일 수도 있습니다. 아래 일정을 정말 지울까요?'));
        nodes.push(...planView(s.plan || {}));
        nodes.push(h('div', { class: 'actions' },
          h('button', { class: 'primary', onclick: act('cancel') }, '지우지 않음'),
          h('button', { class: 'danger', onclick: act('confirmEmpty') }, '모두 삭제')));
        break;
      case 'need_knou_login':
        nodes.push(notice('warn', '방통대 로그인이 필요합니다',
          s.message && s.message.includes('자동') ? s.message : '로그인하면 자동으로 이어서 진행합니다.'));
        nodes.push(h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: act('openKnou') }, '방통대 로그인 열기')));
        break;
      case 'need_google':
        nodes.push(notice('warn', '구글 연결이 필요합니다', s.message));
        nodes.push(h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: act('connectGoogle') }, '구글 연결')));
        break;
      case 'need_config':
        nodes.push(notice('warn', '구글 클라이언트 ID가 없습니다', '이 빌드에는 내장된 ID가 없습니다. 설정 > 고급에서 입력하세요.'));
        nodes.push(h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: () => { send('openOptions'); window.close(); } }, '설정 열기')));
        break;
      case 'need_permission':
        nodes.push(notice('warn', '방통대 사이트 접근 권한이 필요합니다', s.message));
        break;
      case 'error':
        nodes.push(notice('bad', '문제가 생겼습니다', s.message));
        nodes.push(h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: act('preview') }, '다시 시도')));
        break;
      default: {
        if (s.phase === 'done' && s.message) nodes.push(notice('', s.message));
        else if (s.message) nodes.push(h('p', { class: 'muted' }, s.message));
        nodes.push(h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: act('preview') }, '동기화 확인')));
        nodes.push(h('p', { class: 'foot' }, st.lastSync ? `마지막 동기화 ${fmtTime(st.lastSync)}` : '아직 동기화한 적이 없습니다.'));
      }
    }
    return nodes;
  }

  async function refresh() {
    const st = await send('status');
    if (!st) {
      panel.replaceChildren(notice('bad', '확장 백그라운드에 연결할 수 없습니다', '확장을 다시 불러와 주세요.'));
      return;
    }
    const key = JSON.stringify([st.state, st.account, st.hasPermission, st.lastSync, st.agenda?.savedAt, Math.floor(Date.now() / 60000)]);
    if (key === lastKey) return;
    lastKey = key;
    setStatus(st);
    panel.replaceChildren(...render(st));
  }

  refresh();
  setInterval(refresh, 700);
})();
