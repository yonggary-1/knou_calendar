// 방통대(MyKNOU) 대시보드에서 수강 과목·일정 가져오기
(() => {
  const KS = globalThis.KS;
  const str = (v) => (v === null || v === undefined ? '' : String(v).replace(/ /g, ' ').trim());

  // ---------- 1) Nuxt payload 경로 ----------
  function rowToCourse(row) {
    const midType = str(row.lesnTpDvNm);
    const midPeriod = /맞춤형/.test(midType)
      ? str(row.timeScheLect) || str(row.timeScheMid)
      : str(row.timeScheMid) || str(row.timeScheLect);
    return {
      year: str(row.yosa),
      term: str(row.seme),
      name: str(row.sbjtNm),
      code: str(row.sbjtNo),
      prof: str(row.deanNm),
      attendance: {
        type: str(row.atndTpDvNm) || null,
        meetingUrl: str(row.meetingUrl) || null,
        sessions: (Array.isArray(row.atndLesnTmtb) ? row.atndLesnTmtb : []).map((t) => ({
          date: str(t.lectExamDt),
          hours: str(t.lesnhr),
          placeRaw: str(t.lectExmplNm),
          room: str(t.lectExrmNm),
          campus: str(t.lcuvCdNm),
          prof: str(t.profNm),
          profEmail: str(t.lectQna),
        })),
      },
      mid: midType || midPeriod ? { type: midType, period: midPeriod } : null,
      final: str(row.trenexPrpbTcNm) || str(row.timeScheFin) ? { type: str(row.trenexPrpbTcNm), period: str(row.timeScheFin) } : null,
    };
  }

  // 반환: { ok, loggedIn: true|false|null, reason, ... }
  function parseDashboardHtml(html) {
    const hasSignOut = /knou_header_sign_out/.test(html || '');
    const text = KS.nuxt.extractPayloadText(html);
    if (!text) return { ok: false, loggedIn: hasSignOut ? true : false, reason: 'no_payload' };

    let payload;
    try {
      payload = KS.nuxt.unflatten(JSON.parse(text));
    } catch (e) {
      return { ok: false, loggedIn: hasSignOut ? true : null, reason: 'payload_error: ' + e.message };
    }

    const sess = payload?.pinia?.session;
    const loggedIn = sess && typeof sess.isSigned === 'boolean' ? sess.isSigned : hasSignOut;
    if (!loggedIn) return { ok: false, loggedIn: false, reason: 'signed_out' };

    const data = payload?.data || payload;
    const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
    const rows = KS.nuxt.findDeep(data, (v) => Array.isArray(v) && v.length > 0 && v.every((x) => isObj(x) && 'sbjtNm' in x));
    const formative = KS.nuxt.findDeep(data, (v) => isObj(v) && 'semeSdt' in v && 'semeEdt' in v);
    const semObj = KS.nuxt.findDeep(data, (v) => isObj(v) && typeof v.yosa === 'string' && typeof v.seme === 'string');

    const courses = (rows || []).map(rowToCourse).filter((c) => c.name);
    const semester = courses[0]?.year
      ? { year: courses[0].year, term: courses[0].term }
      : semObj ? { year: str(semObj.yosa), term: str(semObj.seme) } : null;

    return {
      ok: true,
      loggedIn: true,
      source: 'nuxt',
      coursesFound: !!rows,
      semester,
      courses,
      formative: formative ? { start: str(formative.semeSdt), end: str(formative.semeEdt) } : null,
    };
  }

  // ---------- 2) 열린 탭에서 읽는 예비 경로 ----------
  // 이 함수는 방통대 탭 안에서 실행된다 (바깥 변수 사용 금지)
  async function pageProbe() {
    const out = {
      href: location.href,
      signedIn: !!document.querySelector('.knou_header_sign_out'),
      html: null,
      cards: null,
      semesterText: null,
    };
    try {
      const r = await fetch('/', { credentials: 'include', cache: 'no-store' });
      if (new URL(r.url).host === location.host && r.ok) out.html = await r.text();
    } catch (e) {
      out.fetchError = String(e);
    }
    try {
      const t = document.querySelector('.knou_dashboard_semester_course_list .knou_section_title');
      out.semesterText = t ? t.textContent.trim() : null;
      out.cards = [...document.querySelectorAll('.knou_dashboard_semester_course_card')].map((card) => ({
        name: (card.querySelector('.subject_name')?.textContent || '').trim(),
        sections: [...card.querySelectorAll('.attendance_class')].map((sec) => ({
          title: [...sec.querySelectorAll('.attendance_title span')].map((s) => s.textContent.trim()),
          items: [...sec.querySelectorAll('li')].map((li) =>
            [...li.querySelectorAll(':scope > span')].map((s) => s.textContent.replace(/ /g, ' ').trim())
          ),
        })),
      }));
    } catch (e) {
      out.domError = String(e);
    }
    return out;
  }

  function cardsToCourses(cards, semesterText) {
    const sm = /(\d{4})\s*학년도\s*(\d)\s*학기/.exec(semesterText || '');
    const semester = sm ? { year: sm[1], term: sm[2] } : null;
    const courses = [];
    for (const card of cards || []) {
      if (!card.name) continue;
      const c = {
        year: semester?.year || '',
        term: semester?.term || '',
        name: card.name,
        code: '',
        prof: '',
        attendance: { type: null, meetingUrl: null, sessions: [] },
        mid: null,
        final: null,
      };
      for (const sec of card.sections || []) {
        const [head, type] = sec.title || [];
        const pairs = (sec.items || []).filter((x) => x.length >= 2);
        if (head === '출석수업') {
          c.attendance.type = type || null;
          let cur = null;
          for (const [label, value] of pairs) {
            if (label === '수업일시') {
              cur = { date: value, hours: value, placeRaw: '', room: '', campus: '', prof: '', profEmail: '' };
              c.attendance.sessions.push(cur);
            } else if (cur && label === '강의실') {
              const parts = value.split(/\s{2,}/);
              cur.placeRaw = parts[0] || '';
              cur.room = parts.slice(1).join(' ');
            } else if (cur && label === '담당교수') {
              const m = /^([^(]*)\(([^)]*)\)/.exec(value);
              cur.prof = (m ? m[1] : value).trim();
              cur.profEmail = m ? m[2].trim() : '';
            }
          }
        } else if (head === '중간평가' || head === '기말평가') {
          const get = (l) => pairs.find((p) => p[0] === l)?.[1] || '';
          const period = (get('제출기한') || get('기간') || get('일시')).replace(/\s*~\s*/, ' ~ ').trim();
          const ev = type || period ? { type: type || '', period } : null;
          if (head === '중간평가') c.mid = ev; else c.final = ev;
        }
      }
      courses.push(c);
    }
    return { semester, courses };
  }

  async function tryViaTab() {
    let tabs = [];
    try {
      tabs = await KS.ext.tabs.query({ url: 'https://m.knou.ac.kr/*' });
    } catch (e) {
      KS.log('warn', 'tabs.query 실패', String(e?.message || e));
      return null;
    }
    let sawSignedOut = false;
    for (const tab of tabs) {
      try {
        const [res] = await KS.ext.scripting.executeScript({ target: { tabId: tab.id }, func: pageProbe });
        const r = res?.result;
        if (!r) continue;
        if (r.html) {
          const p = parseDashboardHtml(r.html);
          if (p.ok) return { ...p, source: 'tab' };
          if (p.loggedIn === false) sawSignedOut = true;
        }
        if (r.signedIn && r.cards?.length) {
          const d = cardsToCourses(r.cards, r.semesterText);
          return { ok: true, loggedIn: true, source: 'dom', coursesFound: true, formative: null, ...d };
        }
        if (!r.signedIn) sawSignedOut = true;
      } catch (e) {
        KS.log('warn', '탭에서 읽기 실패', String(e?.message || e));
      }
    }
    return sawSignedOut ? { ok: false, loggedIn: false, reason: 'tab_signed_out' } : null;
  }

  // ---------- 진입점 ----------
  async function fetchKnou() {
    let primary;
    try {
      const res = await fetch(KS.KNOU_DASHBOARD, { credentials: 'include', cache: 'no-store', redirect: 'follow' });
      const host = new URL(res.url).host;
      if (host !== KS.KNOU_HOST) primary = { ok: false, loggedIn: false, reason: 'redirect:' + host };
      else if (!res.ok) primary = { ok: false, loggedIn: null, reason: 'http ' + res.status };
      else primary = parseDashboardHtml(await res.text());
    } catch (e) {
      primary = { ok: false, loggedIn: null, reason: 'fetch: ' + (e?.message || e) };
    }
    KS.log('info', '방통대 읽기(직접)', { ok: primary.ok, loggedIn: primary.loggedIn, reason: primary.reason, courses: primary.courses?.length });
    if (primary.ok) return primary;

    const viaTab = await tryViaTab();
    if (viaTab) KS.log('info', '방통대 읽기(탭)', { ok: viaTab.ok, loggedIn: viaTab.loggedIn, source: viaTab.source, courses: viaTab.courses?.length });
    if (viaTab?.ok) return viaTab;

    if (primary.loggedIn === false || viaTab?.loggedIn === false) {
      throw new KS.KsError('NEED_KNOU_LOGIN', '방통대 로그인이 필요합니다.');
    }
    if (String(primary.reason).startsWith('fetch')) {
      throw new KS.KsError('NETWORK', '방통대 사이트에 연결할 수 없습니다.');
    }
    throw new KS.KsError('PARSE', '방통대 페이지에서 학사정보를 읽지 못했습니다. 사이트 구조가 바뀌었을 수 있습니다. (버그 리포트를 보내주세요)');
  }

  KS.knou = { fetch: fetchKnou, parseDashboardHtml, cardsToCourses, pageProbe, rowToCourse };
})();
